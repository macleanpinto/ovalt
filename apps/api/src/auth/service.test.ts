import { describe, it, expect, beforeEach } from "vitest";
import { AuthService } from "./service.js";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

const ddbMock = mockClient(DynamoDBDocumentClient);

describe("AuthService", () => {
  let authService: AuthService;

  beforeEach(() => {
    ddbMock.reset();

    authService = new AuthService({
      ddb: ddbMock as unknown as DynamoDBDocumentClient,
      jwtSecret: "test-secret-key-for-testing-only",
      usersTable: "test-users",
      orgsTable: "test-orgs",
      membersTable: "test-members",
      sessionsTable: "test-sessions",
      apiKeysTable: "test-api-keys"
    });
  });

  describe("ROLE_PERMISSIONS", () => {
    it("should define permissions for all roles", () => {
      const { ROLE_PERMISSIONS } = require("./types.js");

      expect(ROLE_PERMISSIONS.owner).toBeDefined();
      expect(ROLE_PERMISSIONS.admin).toBeDefined();
      expect(ROLE_PERMISSIONS.member).toBeDefined();
      expect(ROLE_PERMISSIONS.viewer).toBeDefined();
    });

    it("should give owner all permissions", () => {
      const { ROLE_PERMISSIONS } = require("./types.js");

      expect(ROLE_PERMISSIONS.owner).toContain("organization:delete");
      expect(ROLE_PERMISSIONS.owner).toContain("members:delete");
      expect(ROLE_PERMISSIONS.owner).toContain("api_keys:delete");
    });

    it("should restrict viewer to read-only", () => {
      const { ROLE_PERMISSIONS } = require("./types.js");

      expect(ROLE_PERMISSIONS.viewer).toContain("imports:read");
      expect(ROLE_PERMISSIONS.viewer).not.toContain("imports:write");
      expect(ROLE_PERMISSIONS.viewer).not.toContain("imports:delete");
    });
  });

  describe("hasPermission", () => {
    it("should grant all permissions to service auth", () => {
      const ctx = {
        organization: { organizationId: "org-123" } as any,
        authMethod: "service" as const
      };

      expect(authService.hasPermission(ctx, "imports:delete")).toBe(true);
      expect(authService.hasPermission(ctx, "organization:delete")).toBe(true);
    });

    it("should check API key scopes", () => {
      const ctx = {
        organization: { organizationId: "org-123" } as any,
        authMethod: "api_key" as const,
        apiKey: {
          apiKeyId: "key-123",
          scopes: ["imports:read", "imports:write"]
        } as any
      };

      expect(authService.hasPermission(ctx, "imports:read")).toBe(true);
      expect(authService.hasPermission(ctx, "imports:write")).toBe(true);
      expect(authService.hasPermission(ctx, "imports:delete")).toBe(false);
    });

    it("should check role permissions for session auth", () => {
      const ctx = {
        organization: { organizationId: "org-123" } as any,
        user: { userId: "user-123" } as any,
        membership: { role: "member" as const } as any,
        authMethod: "session" as const
      };

      expect(authService.hasPermission(ctx, "imports:read")).toBe(true);
      expect(authService.hasPermission(ctx, "imports:write")).toBe(true);
      expect(authService.hasPermission(ctx, "imports:delete")).toBe(false);
    });

    it("should handle wildcard API key scope", () => {
      const ctx = {
        organization: { organizationId: "org-123" } as any,
        authMethod: "api_key" as const,
        apiKey: {
          apiKeyId: "key-123",
          scopes: ["*"]
        } as any
      };

      expect(authService.hasPermission(ctx, "imports:delete")).toBe(true);
      expect(authService.hasPermission(ctx, "organization:delete")).toBe(true);
    });
  });

  describe("requirePermission", () => {
    it("should not throw for authorized request", () => {
      const ctx = {
        organization: { organizationId: "org-123" } as any,
        authMethod: "service" as const
      };

      expect(() => {
        authService.requirePermission(ctx, "imports:delete");
      }).not.toThrow();
    });

    it("should throw for unauthorized request", () => {
      const ctx = {
        organization: { organizationId: "org-123" } as any,
        user: { userId: "user-123" } as any,
        membership: { role: "viewer" as const } as any,
        authMethod: "session" as const
      };

      expect(() => {
        authService.requirePermission(ctx, "imports:delete");
      }).toThrow("Missing required permission");
    });
  });
});
