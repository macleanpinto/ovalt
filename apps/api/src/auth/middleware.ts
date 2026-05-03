import type { FastifyRequest, FastifyReply } from "fastify";
import type { AuthService } from "./service.js";
import type { RequestContext } from "./types.js";

/**
 * Fastify authentication middleware.
 * Extracts and validates authentication from requests.
 */

declare module "fastify" {
  interface FastifyRequest {
    auth?: RequestContext;
  }
}

export type AuthMiddlewareConfig = {
  authService: AuthService;
  /** Paths that don't require authentication */
  publicPaths?: string[];
};

/**
 * Extract authentication context from request.
 * Supports multiple auth methods:
 * - Bearer token (JWT session)
 * - API key (x-api-key header)
 * - Service token (x-service-token header - for internal services)
 */
export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AuthMiddlewareConfig
): Promise<void> {
  const path = request.url.split("?")[0] || request.url;
  const method = request.method.toUpperCase();

  // Check if path is public. Entries may be:
  //   "/foo"           — matches /foo on any method
  //   "/foo/*"         — matches any path under /foo on any method
  //   "GET:/foo/:x"    — matches GET /foo/<anything-not-containing-slash>
  //   "GET:/foo/*"     — matches GET on any path under /foo
  const isPublicPath = config.publicPaths?.some(entry => {
    const [methodPart, pathPart] = entry.includes(":/") ? entry.split(/:(.+)/) as [string, string] : [null, entry];
    if (methodPart && methodPart.toUpperCase() !== method) return false;
    const p = pathPart!;
    if (p.endsWith("*")) return path.startsWith(p.slice(0, -1));
    if (p.includes("/:")) {
      // Treat `/:param` as a single URL segment (no slashes).
      const regex = new RegExp("^" + p.replace(/\/:[^/]+/g, "/[^/]+") + "$");
      return regex.test(path);
    }
    return path === p;
  });

  if (isPublicPath) {
    return; // No auth required
  }

  // Try Bearer token first (JWT session)
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      request.auth = await config.authService.verifySessionToken(token);
      return;
    } catch (err) {
      reply.log.warn(
        { path, err: err instanceof Error ? err.message : String(err) },
        "Session token verification failed"
      );
      reply.code(401).send({
        error: "Unauthorized",
        message: err instanceof Error ? err.message : "Invalid session token"
      });
      return;
    }
  }

  // Try API key (x-api-key header)
  const apiKeyHeader = request.headers["x-api-key"];
  if (apiKeyHeader && typeof apiKeyHeader === "string") {
    try {
      request.auth = await config.authService.verifyApiKey(apiKeyHeader);
      return;
    } catch (err) {
      reply.log.warn(
        { path, err: err instanceof Error ? err.message : String(err) },
        "API key verification failed"
      );
      reply.code(401).send({
        error: "Unauthorized",
        message: err instanceof Error ? err.message : "Invalid API key"
      });
      return;
    }
  }

  // Try service token (for worker-to-API internal calls)
  const serviceToken = request.headers["x-service-token"];
  if (serviceToken && typeof serviceToken === "string") {
    // Validate service token (should match configured secret)
    const expectedToken = process.env.SERVICE_TOKEN;
    if (expectedToken && serviceToken === expectedToken) {
      // Service auth - create minimal context
      // Organization ID should be provided in x-organization-id header
      const orgId = request.headers["x-organization-id"];
      if (!orgId || typeof orgId !== "string") {
        reply.code(400).send({
          error: "Bad Request",
          message: "Service requests must include x-organization-id header"
        });
        return;
      }

      const org = await config.authService.getOrganization(orgId);
      if (!org) {
        reply.code(404).send({
          error: "Not Found",
          message: "Organization not found"
        });
        return;
      }

      request.auth = {
        organization: org,
        authMethod: "service"
      };
      return;
    }

    reply.code(401).send({
      error: "Unauthorized",
      message: "Invalid service token"
    });
    return;
  }

  // No valid authentication provided
  reply.code(401).send({
    error: "Unauthorized",
    message: "Authentication required. Provide Bearer token or x-api-key header."
  });
}

/**
 * Require specific permission for a route.
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) {
      reply.code(401).send({
        error: "Unauthorized",
        message: "Authentication required"
      });
      return;
    }

    // Service auth has all permissions
    if (request.auth.authMethod === "service") {
      return;
    }

    // Check API key scopes
    if (request.auth.authMethod === "api_key") {
      const hasScope =
        request.auth.apiKey?.scopes.includes(permission) ||
        request.auth.apiKey?.scopes.includes("*");

      if (!hasScope) {
        reply.code(403).send({
          error: "Forbidden",
          message: `Missing required scope: ${permission}`
        });
        return;
      }
      return;
    }

    // Check role permissions for session auth
    if (request.auth.membership) {
      const authService = (request.server as any).authService as AuthService;
      const hasPermission = authService.hasPermission(request.auth, permission as any);

      if (!hasPermission) {
        reply.code(403).send({
          error: "Forbidden",
          message: `Missing required permission: ${permission}`
        });
        return;
      }
      return;
    }

    reply.code(403).send({
      error: "Forbidden",
      message: "Insufficient permissions"
    });
  };
}

/**
 * Extract organization ID from authenticated request.
 */
export function getOrganizationId(request: FastifyRequest): string {
  if (!request.auth) {
    throw new Error("Request is not authenticated");
  }
  return request.auth.organization.organizationId;
}

/**
 * Extract user ID from authenticated request (session auth only).
 */
export function getUserId(request: FastifyRequest): string {
  if (!request.auth?.user) {
    throw new Error("Request is not authenticated with a user session");
  }
  return request.auth.user.userId;
}
