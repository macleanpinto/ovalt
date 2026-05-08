/**
 * E2E: Platform admin dashboard (cross-org metrics).
 *
 * Runs the Fastify app in-process against LocalStack DynamoDB. No GTM
 * OAuth required. Seeds users, imports, and runs directly; flips
 * isPlatformAdmin via a DDB update to exercise the 401/403/200 paths.
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import { buildApp } from "./server";

const TABLE_USERS = "tag-relay-users";
const TABLE_IMPORTS = "tag-relay-imports";
const TABLE_RUNS = "tag-relay-runs";

describe("E2E: platform admin dashboard", () => {
  let app: FastifyInstance;
  let ddb: DynamoDBDocumentClient;

  // Record what we seed in this test run so we can assert deltas
  // (other tests sharing the same LocalStack will have left data behind).
  const seeded = {
    users: 0,
    imports: 0,
    migrations: 0,
    completedRunsWithTags: [] as number[]
  };

  let baseline: {
    totalUsers: number;
    totalImports: number;
    totalMigrations: number;
    totalTagsDeployed: number;
  };

  let adminToken: string;
  let plainToken: string;
  let adminOrgId: string;
  let plainOrgId: string;

  beforeAll(async () => {
    process.env.ENVIRONMENT = "local";
    process.env.AWS_ENDPOINT = "http://localhost:4566";
    process.env.AWS_ACCESS_KEY_ID = "test";
    process.env.AWS_SECRET_ACCESS_KEY = "test";
    process.env.AWS_REGION = "us-east-1";
    process.env.JWT_SECRET = "test-secret";
    process.env.SERVICE_TOKEN = "test-token";
    process.env.WEB_BASE_URL = "http://localhost:5173";
    app = await buildApp();
    await app.ready();

    ddb = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        region: "us-east-1",
        endpoint: "http://localhost:4566",
        credentials: { accessKeyId: "test", secretAccessKey: "test" }
      })
    );
  });

  afterAll(async () => {
    await app.close();
  });

  async function register(suffix: string) {
    const email = `admin-e2e-${Date.now()}-${suffix}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, name: `User ${suffix}`, organizationName: `Org ${suffix}` }
    });
    expect(res.statusCode, `register ${suffix}: ${res.body}`).toBe(201);
    const json = res.json();
    seeded.users += 1;
    return {
      email,
      token: json.token as string,
      userId: json.user.userId as string,
      organizationId: json.organization.organizationId as string
    };
  }

  async function seedImport(organizationId: string, createdAt = new Date().toISOString()) {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_IMPORTS,
        Item: {
          importId: ulid(),
          organizationId,
          projectId: "test-project",
          sourceType: "gtm-web-container",
          status: "uploaded",
          createdAt
        }
      })
    );
    seeded.imports += 1;
  }

  async function seedRun(params: {
    organizationId: string;
    deployed?: number; // when set, marks run deploymentStatus=completed and writes deployedTagCount
    createdAt?: string;
    runRef?: string; // set to mark this as an idempotency stub (should be excluded from counts)
  }) {
    const { organizationId, deployed, createdAt = new Date().toISOString(), runRef } = params;
    const item: Record<string, unknown> = {
      runId: ulid(),
      organizationId,
      status: "completed",
      rulesetVersion: "v1",
      createdAt
    };
    if (runRef) item.runRef = runRef;
    if (typeof deployed === "number") {
      item.deploymentStatus = "completed";
      item.deployedTagCount = deployed;
      seeded.completedRunsWithTags.push(deployed);
    }
    await ddb.send(new PutCommand({ TableName: TABLE_RUNS, Item: item }));
    if (!runRef) seeded.migrations += 1;
  }

  async function promoteToPlatformAdmin(userId: string) {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_USERS,
        Key: { userId },
        UpdateExpression: "SET isPlatformAdmin = :t",
        ExpressionAttributeValues: { ":t": true }
      })
    );
  }

  test("setup: baseline, seed data, and promote admin", async () => {
    // Register the admin user and a plain user
    const admin = await register("admin");
    const plain = await register("plain");
    adminToken = admin.token;
    plainToken = plain.token;
    adminOrgId = admin.organizationId;
    plainOrgId = plain.organizationId;

    // Capture baseline counts BEFORE seeding, using a temporarily-promoted admin.
    await promoteToPlatformAdmin(admin.userId);
    const baselineRes = await app.inject({
      method: "GET",
      url: "/admin/metrics/summary",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(baselineRes.statusCode, baselineRes.body).toBe(200);
    baseline = baselineRes.json();
    // reset seeded counters — we only want to count post-baseline seeds
    seeded.users = 0;
    seeded.imports = 0;
    seeded.migrations = 0;
    seeded.completedRunsWithTags = [];

    // Seed a few imports + runs against the admin's org
    await seedImport(admin.organizationId);
    await seedImport(admin.organizationId);
    await seedImport(plain.organizationId);

    await seedRun({ organizationId: admin.organizationId, deployed: 4 });
    await seedRun({ organizationId: admin.organizationId, deployed: 2 });
    await seedRun({ organizationId: plain.organizationId, deployed: 5 });
    // A run with no deploymentStatus — counts as a migration but contributes 0 tags.
    await seedRun({ organizationId: admin.organizationId });
    // An idempotency stub — must be excluded from migration count.
    await seedRun({ organizationId: admin.organizationId, runRef: "ref-123" });
  });

  test("GET /admin/metrics/summary → 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/metrics/summary" });
    expect(res.statusCode).toBe(401);
  });

  test("GET /admin/metrics/summary → 403 for non-admin session", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/metrics/summary",
      headers: { authorization: `Bearer ${plainToken}` }
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("Forbidden");
  });

  test("GET /admin/metrics/summary → 200 for platform admin with correct deltas", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/metrics/summary",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();

    // Structural checks
    expect(body).toHaveProperty("totalUsers");
    expect(body).toHaveProperty("totalOrganizations");
    expect(body).toHaveProperty("totalImports");
    expect(body).toHaveProperty("totalMigrations");
    expect(body).toHaveProperty("totalTagsDeployed");
    expect(body).toHaveProperty("activeOrganizations30d");
    expect(body.planBreakdown).toEqual(
      expect.objectContaining({ free: expect.any(Number), pro: expect.any(Number), enterprise: expect.any(Number) })
    );

    // Delta checks — at least as many as we seeded (LocalStack may carry data between runs)
    expect(body.totalUsers).toBeGreaterThanOrEqual(baseline.totalUsers + seeded.users);
    expect(body.totalImports).toBeGreaterThanOrEqual(baseline.totalImports + seeded.imports);
    expect(body.totalMigrations).toBeGreaterThanOrEqual(baseline.totalMigrations + seeded.migrations);

    const expectedTagDelta = seeded.completedRunsWithTags.reduce((sum, n) => sum + n, 0);
    expect(body.totalTagsDeployed).toBeGreaterThanOrEqual(baseline.totalTagsDeployed + expectedTagDelta);
  });

  test("GET /admin/metrics/summary → per-org breakdown includes seeded orgs with correct counts", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/metrics/summary",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();

    expect(Array.isArray(body.organizations)).toBe(true);
    expect(body.organizations.length).toBe(body.totalOrganizations);

    const adminOrg = body.organizations.find((o: any) => o.organizationId === adminOrgId);
    const plainOrg = body.organizations.find((o: any) => o.organizationId === plainOrgId);
    expect(adminOrg, "admin org present").toBeDefined();
    expect(plainOrg, "plain org present").toBeDefined();

    // Admin org: 2 imports, 3 migrations (2 with tags, 1 without — idempotency stub excluded), 6 tags deployed
    expect(adminOrg.imports).toBe(2);
    expect(adminOrg.migrations).toBe(3);
    expect(adminOrg.tagsDeployed).toBe(6);
    expect(adminOrg.plan).toBe("free");
    expect(typeof adminOrg.ownerEmail).toBe("string");
    expect(adminOrg.ownerEmail).toContain("@");
    expect(typeof adminOrg.lastActivityAt).toBe("string");

    // Plain org: 1 import, 1 migration, 5 tags deployed
    expect(plainOrg.imports).toBe(1);
    expect(plainOrg.migrations).toBe(1);
    expect(plainOrg.tagsDeployed).toBe(5);

    // Ordered by tagsDeployed desc — admin (6) before plain (5)
    const adminIdx = body.organizations.findIndex((o: any) => o.organizationId === adminOrgId);
    const plainIdx = body.organizations.findIndex((o: any) => o.organizationId === plainOrgId);
    expect(adminIdx).toBeLessThan(plainIdx);
  });

  test("GET /admin/metrics/signups → 403 for non-admin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/metrics/signups?days=30",
      headers: { authorization: `Bearer ${plainToken}` }
    });
    expect(res.statusCode).toBe(403);
  });

  test("GET /admin/metrics/signups → 200 for platform admin; returns a 30-day series", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/metrics/signups?days=30",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(res.statusCode, res.body).toBe(200);
    const { series } = res.json();
    expect(Array.isArray(series)).toBe(true);
    expect(series).toHaveLength(30);

    // Every entry shaped {date: YYYY-MM-DD, count: number}, in ascending date order
    const pattern = /^\d{4}-\d{2}-\d{2}$/;
    let prev = "";
    for (const point of series) {
      expect(point.date).toMatch(pattern);
      expect(typeof point.count).toBe("number");
      if (prev) expect(point.date > prev).toBe(true);
      prev = point.date;
    }

    // Today's bucket must include the 2 users we registered in this run
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayKey = today.toISOString().slice(0, 10);
    const todayPoint = series.find((p: { date: string; count: number }) => p.date === todayKey);
    expect(todayPoint).toBeDefined();
    expect(todayPoint.count).toBeGreaterThanOrEqual(2);
  });

  test("GET /admin/metrics/signups clamps invalid days to 30", async () => {
    for (const q of ["days=-5", "days=0", "days=abc", "days=9999"]) {
      const res = await app.inject({
        method: "GET",
        url: `/admin/metrics/signups?${q}`,
        headers: { authorization: `Bearer ${adminToken}` }
      });
      expect(res.statusCode, `${q} → ${res.body}`).toBe(200);
      expect(res.json().series).toHaveLength(30);
    }

    // A valid smaller value is respected
    const res = await app.inject({
      method: "GET",
      url: "/admin/metrics/signups?days=7",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().series).toHaveLength(7);
  });

  test("GET /admin/organizations/:id/migrations → 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/organizations/${adminOrgId}/migrations`
    });
    expect(res.statusCode).toBe(401);
  });

  test("GET /admin/organizations/:id/migrations → 403 for non-admin session", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/organizations/${adminOrgId}/migrations`,
      headers: { authorization: `Bearer ${plainToken}` }
    });
    expect(res.statusCode).toBe(403);
  });

  test("GET /admin/organizations/:id/migrations → 404 for unknown org", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/organizations/does-not-exist/migrations",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(res.statusCode).toBe(404);
  });

  test("GET /admin/organizations/:id/migrations → 200 returns that org's runs, newest first, stubs excluded", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/organizations/${adminOrgId}/migrations`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();

    expect(body.organization.organizationId).toBe(adminOrgId);
    expect(typeof body.organization.name).toBe("string");
    expect(body.organization.ownerEmail).toContain("@");

    expect(Array.isArray(body.migrations)).toBe(true);
    // Admin org got 3 real runs seeded (2 with tags, 1 without). The idempotency stub must not appear.
    expect(body.migrations.length).toBe(3);
    expect(body.migrations.every((r: any) => r.organizationId === adminOrgId)).toBe(true);
    expect(body.migrations.every((r: any) => !r.runRef)).toBe(true);

    // Newest first
    for (let i = 1; i < body.migrations.length; i++) {
      expect(body.migrations[i - 1].createdAt >= body.migrations[i].createdAt).toBe(true);
    }
  });

  test("GET /admin/organizations/:id/migrations isolates orgs", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/organizations/${plainOrgId}/migrations`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.organization.organizationId).toBe(plainOrgId);
    expect(body.migrations.length).toBe(1);
    expect(body.migrations[0].organizationId).toBe(plainOrgId);
    expect(body.migrations[0].deployedTagCount).toBe(5);
  });

  test("/auth/me reflects isPlatformAdmin flag", async () => {
    const adminMe = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(adminMe.statusCode).toBe(200);
    expect(adminMe.json().user.isPlatformAdmin).toBe(true);

    const plainMe = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${plainToken}` }
    });
    expect(plainMe.statusCode).toBe(200);
    // Absent or false — just not `true`
    expect(plainMe.json().user.isPlatformAdmin).not.toBe(true);
  });
});
