import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulid } from "ulid";
import type { AuthService } from "./service.js";
import type { OAuthService } from "./oauth-service.js";
import type { OAuthProvider } from "./oauth-types.js";

/**
 * OAuth authentication routes for Google and GitHub.
 */

const linkAccountSchema = z.object({
  provider: z.enum(["google", "github"])
});

export function registerOAuthRoutes(
  app: FastifyInstance,
  authService: AuthService,
  oauthService: OAuthService
) {
  /**
   * Initiate OAuth flow.
   * GET /auth/oauth/:provider
   */
  app.get<{
    Params: { provider: string };
    Querystring: { redirect?: string };
  }>(
    "/auth/oauth/:provider",
    async (req, reply) => {
      const provider = req.params.provider as OAuthProvider;
      const wantsRedirect = req.query.redirect === "1" || req.query.redirect === "true";

      if (provider !== "google" && provider !== "github") {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Invalid OAuth provider. Supported: google, github"
        });
      }

      try {
        // Prevent caching of OAuth URLs
        reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
        reply.header("Pragma", "no-cache");
        reply.header("Expires", "0");

        const { url, state } = oauthService.generateAuthUrl(provider);

        // Secure in production and on Lambda (HTTPS); omit Secure on local HTTP
        const secureCookie =
          process.env.NODE_ENV === "production" || Boolean(process.env.AWS_EXECUTION_ENV);

        // Store state in cookie for additional security
        reply.setCookie("oauth_state", state, {
          httpOnly: true,
          secure: secureCookie,
          sameSite: "lax",
          path: "/",
          maxAge: 10 * 60 // 10 minutes
        });

        // Browser top-level navigation (from web app on another origin) — avoids cross-site fetch
        // blocking Set-Cookie for api.* before redirect to Google.
        if (wantsRedirect) {
          return reply.redirect(url);
        }

        return { url };
      } catch (err) {
        app.log.error({ err, provider }, "Failed to generate OAuth URL");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "OAuth initialization failed"
        });
      }
    }
  );

  /**
   * OAuth callback handler.
   * GET /auth/oauth/:provider/callback
   */
  app.get<{
    Params: { provider: string };
    Querystring: { code?: string; state?: string; error?: string };
  }>("/auth/oauth/:provider/callback", async (req, reply) => {
    const provider = req.params.provider as OAuthProvider;
    const { code, state, error } = req.query;

    // Handle OAuth error
    if (error) {
      const webBaseUrl = process.env.WEB_BASE_URL || "http://localhost:5173";
      return reply.redirect(
        `${webBaseUrl}/auth/error?error=${encodeURIComponent(error)}&provider=${provider}`
      );
    }

    if (!code || !state) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "Missing code or state parameter"
      });
    }

    // Verify state
    const storedState = req.cookies.oauth_state;
    if (!storedState || storedState !== state) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "Invalid state parameter"
      });
    }

    const verifiedProvider = oauthService.verifyState(state);
    if (!verifiedProvider || verifiedProvider !== provider) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "Invalid or expired state"
      });
    }

    try {
      // Exchange code for profile
      const profile = await oauthService.handleCallback(provider, code);

      // Check if OAuth account already exists
      const existingOAuthAccount = await oauthService.getAccountByProviderId(
        provider,
        profile.providerId
      );

      if (existingOAuthAccount) {
        // User already has this OAuth account linked
        // Log them in to their existing account
        const user = await authService.getUser(existingOAuthAccount.userId);
        if (!user) {
          throw new Error("User not found");
        }

        // Get user's first organization
        const organizations = await authService.getUserOrganizations(user.userId);
        if (organizations.length === 0) {
          throw new Error("User has no organizations");
        }

        // Create session
        const { token } = await authService.createSession({
          userId: user.userId,
          organizationId: organizations[0].organizationId,
          userAgent: req.headers["user-agent"],
          ipAddress: req.ip
        });

        // Redirect to app with token
        const webBaseUrl = process.env.WEB_BASE_URL || "http://localhost:5173";
        return reply.redirect(
          `${webBaseUrl}/auth/callback?token=${encodeURIComponent(token)}&provider=${provider}`
        );
      }

      // Check if user exists by email
      let user = await authService.getUserByEmail(profile.email);

      if (user) {
        // User exists but hasn't linked this OAuth provider yet
        // Link the OAuth account
        await oauthService.linkAccount(user.userId, profile);

        // Get user's first organization
        const organizations = await authService.getUserOrganizations(user.userId);
        if (organizations.length === 0) {
          throw new Error("User has no organizations");
        }

        // Create session
        const { token } = await authService.createSession({
          userId: user.userId,
          organizationId: organizations[0].organizationId,
          userAgent: req.headers["user-agent"],
          ipAddress: req.ip
        });

        const webBaseUrl = process.env.WEB_BASE_URL || "http://localhost:5173";
        return reply.redirect(
          `${webBaseUrl}/auth/callback?token=${encodeURIComponent(token)}&provider=${provider}&linked=true`
        );
      }

      // New user - create account
      user = await authService.createUser({
        email: profile.email,
        name: profile.name
      });

      // Create organization
      const orgName = profile.name || profile.email.split("@")[0] || "My Organization";
      const slug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 50);

      const organization = await authService.createOrganization({
        name: orgName,
        slug: `${slug}-${ulid().slice(0, 6).toLowerCase()}`,
        ownerId: user.userId
      });

      // Link OAuth account
      await oauthService.linkAccount(user.userId, profile);

      // Create session
      const { token } = await authService.createSession({
        userId: user.userId,
        organizationId: organization.organizationId,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip
      });

      // Redirect to app with token
      const webBaseUrl = process.env.WEB_BASE_URL || "http://localhost:5173";
      return reply.redirect(
        `${webBaseUrl}/auth/callback?token=${encodeURIComponent(token)}&provider=${provider}&newAccount=true`
      );
    } catch (err) {
      app.log.error({ err, provider }, "OAuth callback failed");
      const webBaseUrl = process.env.WEB_BASE_URL || "http://localhost:5173";
      return reply.redirect(
        `${webBaseUrl}/auth/error?error=${encodeURIComponent(err instanceof Error ? err.message : "OAuth failed")}&provider=${provider}`
      );
    }
  });

  /**
   * Link OAuth account to existing session.
   * POST /auth/oauth/link
   */
  app.post("/auth/oauth/link", async (req, reply) => {
    if (!req.auth?.user) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Session authentication required"
      });
    }

    const parsed = linkAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ errors: parsed.error.issues });
    }

    const { provider } = parsed.data;

    try {
      const { url } = oauthService.generateAuthUrl(provider);
      return { url };
    } catch (err) {
      return reply.code(500).send({
        error: "Internal Server Error",
        message: err instanceof Error ? err.message : "Failed to generate OAuth URL"
      });
    }
  });

  /**
   * List user's connected OAuth accounts.
   * GET /auth/oauth/accounts
   */
  app.get("/auth/oauth/accounts", async (req, reply) => {
    if (!req.auth?.user) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Session authentication required"
      });
    }

    const accounts = await oauthService.getUserAccounts(req.auth.user.userId);

    // Remove sensitive data
    const sanitized = accounts.map(acc => ({
      provider: acc.provider,
      email: acc.email,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt
    }));

    return { accounts: sanitized };
  });
}
