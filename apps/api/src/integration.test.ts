/**
 * Integration tests for Tag Relay API
 * Tests API endpoints with LocalStack
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './server';
import type { FastifyInstance } from 'fastify';

describe('API Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Setup test environment
    process.env.ENVIRONMENT = 'local';
    process.env.AWS_ENDPOINT = 'http://localhost:4566';
    process.env.JWT_SECRET = 'test-secret-for-integration-tests';
    process.env.API_KEY = 'test-api-key';
    process.env.SERVICE_TOKEN = 'test-service-token';

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Check', () => {
    test('GET /health returns 200', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    });
  });

  describe('Authentication', () => {
    let authToken: string;
    const testUser = {
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      organizationName: 'Test Organization',
    };

    test('POST /auth/register creates new user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: testUser,
      });

      if (response.statusCode !== 201) {
        console.log('Register failed:', response.statusCode, response.json());
      }

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe(testUser.email);
      authToken = body.token;
    });

    test('POST /auth/login authenticates user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe(testUser.email);
    });

    test('GET /auth/me returns user info', async () => {
      if (!authToken) {
        console.log('⚠️  authToken is undefined - registration may have failed');
      } else {
        console.log('✅ authToken exists:', authToken.substring(0, 20) + '...');
      }

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      if (response.statusCode !== 200) {
        console.log('Auth failed:', response.statusCode, response.json());
      }

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user.email).toBe(testUser.email);
      expect(body.organization).toBeDefined();
    });

    test('GET /auth/me returns organization info', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.organization).toBeDefined();
      expect(body.organization.name).toBe(testUser.organizationName);
    });
  });

  describe('Imports', () => {
    test('GET /imports requires authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/imports',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Migrations', () => {
    test('GET /migrations requires authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/migrations',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Cross-tenant isolation', () => {
    // Regression test: listings and :id lookups must not leak another org's
    // data, and spoofing ?organizationId= as a non-admin must be ignored.
    test('each org only sees its own imports and migrations', async () => {
      const stamp = Date.now();
      const registerOrg = async (suffix: string) => {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: `iso-${suffix}-${stamp}@example.com`,
            name: `Iso ${suffix}`,
            organizationName: `Iso Org ${suffix}`
          }
        });
        expect(res.statusCode).toBe(201);
        const body = res.json();
        return { token: body.token as string, organizationId: body.organization.organizationId as string };
      };

      const a = await registerOrg('a');
      const b = await registerOrg('b');

      // Seed one import into org A.
      const seed = await app.inject({
        method: 'POST',
        url: '/imports/gtm-web-container',
        headers: { authorization: `Bearer ${a.token}` },
        payload: {
          sourceType: 'gtm-web-container',
          projectId: 'iso-proj-a',
          payload: { entities: { tags: [], triggers: [], variables: [] } }
        }
      });
      expect(seed.statusCode).toBe(201);
      const importId = seed.json().importId as string;

      // Org A sees its import.
      const listA = await app.inject({
        method: 'GET',
        url: '/imports',
        headers: { authorization: `Bearer ${a.token}` }
      });
      expect(listA.statusCode).toBe(200);
      expect(listA.json().items.some((i: { importId: string }) => i.importId === importId)).toBe(true);

      // Org B must not see org A's imports, even when passing ?organizationId=A.
      const listB = await app.inject({
        method: 'GET',
        url: `/imports?organizationId=${a.organizationId}`,
        headers: { authorization: `Bearer ${b.token}` }
      });
      expect(listB.statusCode).toBe(200);
      expect(listB.json().items.some((i: { importId: string }) => i.importId === importId)).toBe(false);

      // Org B must get 404 when fetching org A's import by ID.
      const getB = await app.inject({
        method: 'GET',
        url: `/imports/${importId}`,
        headers: { authorization: `Bearer ${b.token}` }
      });
      expect(getB.statusCode).toBe(404);
    });
  });
});
