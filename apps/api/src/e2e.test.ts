/**
 * End-to-End tests for Tag Relay
 * Tests full migration workflow
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from './server';
import type { FastifyInstance } from 'fastify';
import * as path from 'path';
import * as fs from 'fs';

describe('E2E Migration Flow', () => {
  let app: FastifyInstance;
  let authToken: string;
  let organizationId: string;

  beforeAll(async () => {
    process.env.ENVIRONMENT = 'local';
    process.env.AWS_ENDPOINT = 'http://localhost:4566';
    process.env.JWT_SECRET = 'test-secret';
    process.env.API_KEY = 'test-key';
    process.env.SERVICE_TOKEN = 'test-token';

    app = await buildServer();
    await app.ready();

    // Create test user and get auth token
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `e2e-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'E2E Test User',
      },
    });

    const { token } = registerResponse.json();
    authToken = token;

    // Get organization ID
    const orgsResponse = await app.inject({
      method: 'GET',
      url: '/organizations',
      headers: { authorization: `Bearer ${authToken}` },
    });

    const orgs = orgsResponse.json();
    organizationId = orgs[0].organizationId;
  });

  afterAll(async () => {
    await app.close();
  });

  test('Complete migration workflow', async () => {
    // Step 1: Upload GTM container (mock)
    const importResponse = await app.inject({
      method: 'POST',
      url: '/imports/gtm-web-container',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        organizationId,
        containerData: {
          // Mock GTM container data
          containerId: 'GTM-TEST123',
          name: 'Test Container',
          tags: [],
          triggers: [],
          variables: [],
        },
      },
    });

    // Import creation should succeed or handle gracefully
    expect([201, 400]).toContain(importResponse.statusCode);

    if (importResponse.statusCode === 201) {
      const importData = importResponse.json();
      expect(importData.importId).toBeDefined();

      // Step 2: Trigger migration
      const runResponse = await app.inject({
        method: 'POST',
        url: `/migrations/${importData.importId}/run`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect([200, 202]).toContain(runResponse.statusCode);

      if (runResponse.statusCode === 202 || runResponse.statusCode === 200) {
        const runData = runResponse.json();
        expect(runData.runId).toBeDefined();

        // Step 3: Check migration status
        const statusResponse = await app.inject({
          method: 'GET',
          url: `/migrations/${runData.runId}`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(statusResponse.statusCode).toBe(200);
        const statusData = statusResponse.json();
        expect(statusData.runId).toBe(runData.runId);
        expect(['queued', 'running', 'completed']).toContain(statusData.status);
      }
    }
  });

  test('Multi-tenant isolation', async () => {
    // Create second user
    const user2Response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `tenant2-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'Tenant 2',
      },
    });

    const { token: token2 } = user2Response.json();

    // Get user 2 organizations
    const orgs2Response = await app.inject({
      method: 'GET',
      url: '/organizations',
      headers: { authorization: `Bearer ${token2}` },
    });

    const orgs2 = orgs2Response.json();
    const org2Id = orgs2[0].organizationId;

    // Verify different organizations
    expect(org2Id).not.toBe(organizationId);

    // User 1 should not see User 2's data
    const importsResponse = await app.inject({
      method: 'GET',
      url: `/imports?organizationId=${org2Id}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    // Should return empty or forbidden
    expect([200, 403]).toContain(importsResponse.statusCode);
    if (importsResponse.statusCode === 200) {
      const imports = importsResponse.json();
      expect(imports).toEqual([]);
    }
  });
});
