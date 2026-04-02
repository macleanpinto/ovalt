/**
 * Integration tests for Tag Relay API
 * Tests API endpoints with LocalStack
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from './server';
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

    app = await buildServer();
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
      password: 'TestPassword123!',
      name: 'Test User',
    };

    test('POST /auth/register creates new user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: testUser,
      });

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
          password: testUser.password,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe(testUser.email);
    });

    test('GET /auth/me returns user info', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.email).toBe(testUser.email);
    });

    test('GET /organizations returns user orgs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/organizations',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
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
});
