import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "./service.js";
import { ulid } from "ulid";

/**
 * Authentication routes for user registration, login, and session management.
 */

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  organizationName: z.string().min(1).max(100)
});

const loginSchema = z.object({
  email: z.string().email(),
  organizationId: z.string().optional()
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).default(["*"]),
  expiresIn: z.string().optional() // e.g., "90d", "1y"
});

export function registerAuthRoutes(app: FastifyInstance, authService: AuthService) {
  /**
   * Register a new user and create their first organization.
   */
  app.post("/auth/register", async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ errors: parsed.error.issues });
    }

    const { email, name, organizationName } = parsed.data;

    // Check if user already exists
    const existingUser = await authService.getUserByEmail(email);
    if (existingUser) {
      return reply.code(409).send({
        error: "Conflict",
        message: "User with this email already exists"
      });
    }

    // Create user
    const user = await authService.createUser({ email, name });

    // Create organization
    const slug = organizationName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);

    const organization = await authService.createOrganization({
      name: organizationName,
      slug: `${slug}-${ulid().slice(0, 6).toLowerCase()}`,
      ownerId: user.userId
    });

    // Create session
    const { token, session } = await authService.createSession({
      userId: user.userId,
      organizationId: organization.organizationId,
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip
    });

    return {
      user,
      organization,
      session,
      token
    };
  });

  /**
   * Login (simplified - in production would verify password/OAuth).
   */
  app.post("/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ errors: parsed.error.issues });
    }

    const { email, organizationId } = parsed.data;

    // Get user
    const user = await authService.getUserByEmail(email);
    if (!user) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid credentials"
      });
    }

    // Get user's organizations
    const organizations = await authService.getUserOrganizations(user.userId);
    if (organizations.length === 0) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "User is not a member of any organization"
      });
    }

    // If organizationId provided, use it; otherwise use first org
    let targetOrg = organizations[0];
    if (organizationId) {
      const found = organizations.find(o => o.organizationId === organizationId);
      if (!found) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "User is not a member of specified organization"
        });
      }
      targetOrg = found;
    }

    // Create session
    const { token, session } = await authService.createSession({
      userId: user.userId,
      organizationId: targetOrg.organizationId,
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip
    });

    return {
      user,
      organization: targetOrg,
      organizations,
      session,
      token
    };
  });

  /**
   * Get current user info.
   */
  app.get("/auth/me", async (req, reply) => {
    // Prevent caching of authentication responses
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    reply.header("Pragma", "no-cache");
    reply.header("Expires", "0");

    if (!req.auth) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    if (req.auth.authMethod === "api_key") {
      return {
        authMethod: "api_key",
        organization: req.auth.organization,
        apiKey: {
          apiKeyId: req.auth.apiKey?.apiKeyId,
          name: req.auth.apiKey?.name,
          prefix: req.auth.apiKey?.prefix,
          scopes: req.auth.apiKey?.scopes
        }
      };
    }

    return {
      authMethod: "session",
      user: req.auth.user,
      organization: req.auth.organization,
      membership: req.auth.membership
    };
  });

  /**
   * List user's organizations.
   */
  app.get("/auth/organizations", async (req, reply) => {
    if (!req.auth?.user) {
      return reply.code(401).send({ error: "Unauthorized - session auth required" });
    }

    const organizations = await authService.getUserOrganizations(req.auth.user.userId);
    return { organizations };
  });

  /**
   * Create an API key.
   */
  app.post("/auth/api-keys", async (req, reply) => {
    if (!req.auth) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    // Require api_keys:write permission
    authService.requirePermission(req.auth, "api_keys:write");

    const parsed = createApiKeySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ errors: parsed.error.issues });
    }

    const { name, scopes, expiresIn } = parsed.data;

    // Calculate expiration
    let expiresAt: string | undefined;
    if (expiresIn) {
      const days = parseInt(expiresIn.replace(/[^0-9]/g, ""), 10);
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    const { apiKey, key } = await authService.createApiKey({
      organizationId: req.auth.organization.organizationId,
      name,
      createdBy: req.auth.user?.userId || "system",
      scopes,
      expiresAt
    });

    return {
      apiKey: {
        ...apiKey,
        keyHash: undefined // Don't return hash
      },
      key // Only returned once!
    };
  });
}
