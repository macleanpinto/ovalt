/**
 * E2E: deploy endpoint rejects unsupported client tag types.
 *
 * The deploy-approved-v2 endpoint must refuse tag IDs whose GTM type
 * isn't in the supported whitelist (gaawe, googtag, awct, gclidw,
 * cvt_5RM3Q), even if a caller bypasses the UI gate.
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { S3Client, PutObjectCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { buildApp } from "./server";

const S3_BUCKET = "tag-relay-artifacts";
const TABLE_RUNS = "tag-relay-runs";

describe("E2E: deploy endpoint supported-type guardrail", () => {
  let app: FastifyInstance;
  let s3: S3Client;
  let ddb: DynamoDBDocumentClient;
  let gtmSessionId: string;
  let authToken: string;
  let organizationId: string;

  beforeAll(async () => {
    process.env.ENVIRONMENT = "local";
    process.env.AWS_ENDPOINT = "http://localhost:4566";
    process.env.AWS_ACCESS_KEY_ID = "test";
    process.env.AWS_SECRET_ACCESS_KEY = "test";
    process.env.AWS_REGION = "us-east-1";
    process.env.JWT_SECRET = "test-secret";
    process.env.SERVICE_TOKEN = "test-token";
    process.env.WEB_BASE_URL = "http://localhost:5173";
    // Stub OAuth env so requireGtmOAuthConfigured() passes.
    process.env.GTM_OAUTH_CLIENT_ID = process.env.GTM_OAUTH_CLIENT_ID || "test-client-id";
    process.env.GTM_OAUTH_CLIENT_SECRET = process.env.GTM_OAUTH_CLIENT_SECRET || "test-client-secret";
    process.env.GTM_OAUTH_REDIRECT_URI = process.env.GTM_OAUTH_REDIRECT_URI || "http://localhost:3001/gtm/oauth/callback";

    app = await buildApp();
    await app.ready();

    s3 = new S3Client({
      region: "us-east-1",
      endpoint: "http://localhost:4566",
      forcePathStyle: true,
      credentials: { accessKeyId: "test", secretAccessKey: "test" }
    });
    await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET })).catch(() => {
      /* bucket may already exist */
    });

    ddb = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        region: "us-east-1",
        endpoint: "http://localhost:4566",
        credentials: { accessKeyId: "test", secretAccessKey: "test" }
      })
    );

    // Register a user to get a Bearer token for the authenticated deploy endpoint.
    const email = `supported-types-${Date.now()}@example.com`;
    const regRes = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, name: "Test", organizationName: "Test Org" }
    });
    expect(regRes.statusCode, regRes.body).toBe(201);
    authToken = regRes.json().token;
    organizationId = regRes.json().organization.organizationId;

    // Create a test GTM session so the GTM OAuth check passes (the token is
    // never exercised because the guardrail rejects before any GTM API call).
    const sessionRes = await app.inject({
      method: "POST",
      url: "/test/gtm-session",
      payload: {
        accessToken: "fake-token-for-guardrail-test",
        refreshToken: "fake-refresh",
        expiryDate: Date.now() + 60 * 60 * 1000
      }
    });
    expect(sessionRes.statusCode, sessionRes.body).toBe(200);
    gtmSessionId = sessionRes.json().sessionId;
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedReport(runId: string, tags: Array<{ tagId: string; name: string; type: string }>) {
    const report = {
      runId,
      containerElements: { tags }
    };
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: `runs/${runId}/report.json`,
        Body: JSON.stringify(report),
        ContentType: "application/json"
      })
    );
    // The deploy endpoint now calls loadOwnedRun (scoping added in commit 7bc349a),
    // so a matching runs row scoped to this test's organizationId must exist.
    await ddb.send(
      new PutCommand({
        TableName: TABLE_RUNS,
        Item: {
          runId,
          organizationId,
          status: "completed",
          rulesetVersion: "v1",
          createdAt: new Date().toISOString()
        }
      })
    );
  }

  test("rejects deploy request containing an unsupported tag type (html)", async () => {
    const runId = `test-run-${Date.now()}-unsupported`;
    await seedReport(runId, [
      { tagId: "1", name: "GA4 Event", type: "gaawe" },
      { tagId: "2", name: "Legacy HTML tag", type: "html" }
    ]);

    const res = await app.inject({
      method: "POST",
      url: `/migrations/${runId}/deploy-approved-v2`,
      headers: { "x-gtm-session": gtmSessionId, authorization: `Bearer ${authToken}` },
      payload: {
        approvedTagIds: ["1", "2"],
        clientContainerPath: "accounts/123/containers/456",
        clientWorkspacePath: "accounts/123/containers/456/workspaces/7",
        serverContainerPath: "accounts/123/containers/999",
        transport_url: "https://sgtm.example.com"
      }
    });

    expect(res.statusCode, res.body).toBe(400);
    const body = res.json();
    expect(body.message).toContain("Unsupported tag types");
    expect(body.message).toContain("html");
    expect(body.unsupportedTagIds).toEqual(["2"]);
  });

  test("rejects deploy request with a non-whitelisted cvt_* template", async () => {
    const runId = `test-run-${Date.now()}-wrong-cvt`;
    await seedReport(runId, [
      { tagId: "10", name: "Other template", type: "cvt_OTHER" }
    ]);

    const res = await app.inject({
      method: "POST",
      url: `/migrations/${runId}/deploy-approved-v2`,
      headers: { "x-gtm-session": gtmSessionId, authorization: `Bearer ${authToken}` },
      payload: {
        approvedTagIds: ["10"],
        clientContainerPath: "accounts/123/containers/456",
        clientWorkspacePath: "accounts/123/containers/456/workspaces/7",
        serverContainerPath: "accounts/123/containers/999",
        transport_url: "https://sgtm.example.com"
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("cvt_OTHER");
  });

  test("accepts deploy request with only whitelisted types (queues 202)", async () => {
    const runId = `test-run-${Date.now()}-allowed`;
    await seedReport(runId, [
      { tagId: "A", name: "GA4 Event", type: "gaawe" },
      { tagId: "B", name: "Google tag", type: "googtag" },
      { tagId: "C", name: "Ads conversion", type: "awct" },
      { tagId: "D", name: "Conversion linker", type: "gclidw" },
      { tagId: "E", name: "Meta Pixel", type: "cvt_5RM3Q" }
    ]);

    const res = await app.inject({
      method: "POST",
      url: `/migrations/${runId}/deploy-approved-v2`,
      headers: { "x-gtm-session": gtmSessionId, authorization: `Bearer ${authToken}` },
      payload: {
        approvedTagIds: ["A", "B", "C", "D", "E"],
        clientContainerPath: "accounts/123/containers/456",
        clientWorkspacePath: "accounts/123/containers/456/workspaces/7",
        serverContainerPath: "accounts/123/containers/999",
        transport_url: "https://sgtm.example.com"
      }
    });

    // The request passes guardrail and is queued to SQS (202). We don't execute
    // the deployment here — that's covered by e2e-gtm-deployment.test.ts against
    // real GTM.
    expect(res.statusCode, res.body).toBe(202);
    expect(res.json().status).toBe("deploying");
  });

  test("accepts parameterOverrides for whitelisted params", async () => {
    const runId = `test-run-${Date.now()}-overrides-ok`;
    await seedReport(runId, [
      { tagId: "A", name: "GA4 Event", type: "gaawe" },
      { tagId: "B", name: "Google tag", type: "googtag" }
    ]);
    const res = await app.inject({
      method: "POST",
      url: `/migrations/${runId}/deploy-approved-v2`,
      headers: { "x-gtm-session": gtmSessionId, authorization: `Bearer ${authToken}` },
      payload: {
        approvedTagIds: ["A", "B"],
        clientContainerPath: "accounts/123/containers/456",
        clientWorkspacePath: "accounts/123/containers/456/workspaces/7",
        serverContainerPath: "accounts/123/containers/999",
        transport_url: "https://sgtm.example.com",
        parameterOverrides: {
          A: { eventName: "purchase" },
          B: { tagId: "G-ABC123" }
        }
      }
    });
    expect(res.statusCode, res.body).toBe(202);
  });

  test("rejects parameterOverrides referencing a tag not in approvedTagIds", async () => {
    const runId = `test-run-${Date.now()}-overrides-alien`;
    await seedReport(runId, [
      { tagId: "A", name: "GA4 Event", type: "gaawe" },
      { tagId: "B", name: "Another tag", type: "googtag" }
    ]);
    const res = await app.inject({
      method: "POST",
      url: `/migrations/${runId}/deploy-approved-v2`,
      headers: { "x-gtm-session": gtmSessionId, authorization: `Bearer ${authToken}` },
      payload: {
        approvedTagIds: ["A"],
        clientContainerPath: "accounts/123/containers/456",
        clientWorkspacePath: "accounts/123/containers/456/workspaces/7",
        serverContainerPath: "accounts/123/containers/999",
        transport_url: "https://sgtm.example.com",
        parameterOverrides: {
          B: { tagId: "G-ABC123" }
        }
      }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("not in approvedTagIds");
  });

  test("rejects parameterOverrides setting a param outside the whitelist for that tag type", async () => {
    const runId = `test-run-${Date.now()}-overrides-badparam`;
    await seedReport(runId, [
      { tagId: "A", name: "GA4 Event", type: "gaawe" }
    ]);
    const res = await app.inject({
      method: "POST",
      url: `/migrations/${runId}/deploy-approved-v2`,
      headers: { "x-gtm-session": gtmSessionId, authorization: `Bearer ${authToken}` },
      payload: {
        approvedTagIds: ["A"],
        clientContainerPath: "accounts/123/containers/456",
        clientWorkspacePath: "accounts/123/containers/456/workspaces/7",
        serverContainerPath: "accounts/123/containers/999",
        transport_url: "https://sgtm.example.com",
        parameterOverrides: {
          A: { tagId: "G-X" } // gaawe only allows eventName
        }
      }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('cannot set "tagId"');
  });

  test("rejects empty-string parameterOverride values", async () => {
    const runId = `test-run-${Date.now()}-overrides-empty`;
    await seedReport(runId, [
      { tagId: "A", name: "GA4 Event", type: "gaawe" }
    ]);
    const res = await app.inject({
      method: "POST",
      url: `/migrations/${runId}/deploy-approved-v2`,
      headers: { "x-gtm-session": gtmSessionId, authorization: `Bearer ${authToken}` },
      payload: {
        approvedTagIds: ["A"],
        clientContainerPath: "accounts/123/containers/456",
        clientWorkspacePath: "accounts/123/containers/456/workspaces/7",
        serverContainerPath: "accounts/123/containers/999",
        transport_url: "https://sgtm.example.com",
        parameterOverrides: {
          A: { eventName: "   " }
        }
      }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("non-empty string");
  });
});
