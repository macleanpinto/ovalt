/**
 * Authentication and authorization module.
 * Multi-tenant SaaS authentication with JWT sessions, API keys, and OAuth.
 */

export { AuthService } from "./service.js";
export { registerAuthRoutes } from "./routes.js";
export { registerMembersRoutes } from "./members-routes.js";
export { authenticateRequest, requirePermission, getOrganizationId, getUserId } from "./middleware.js";
export { TenantDataService } from "./tenant-data.js";
export { generateApiKey, generateSessionId, hashApiKey } from "./jwt.js";
export { OAuthService } from "./oauth-service.js";
export { registerOAuthRoutes } from "./oauth-routes.js";

export type {
  User,
  Organization,
  OrganizationMember,
  Session,
  ApiKey,
  RequestContext,
  UserRole,
  Permission
} from "./types.js";

export type { AuthServiceConfig } from "./service.js";
export type { TenantDataConfig } from "./tenant-data.js";
export type { OAuthServiceConfig } from "./oauth-service.js";
export type {
  OAuthProvider,
  OAuthConfig,
  OAuthProviderConfig,
  OAuthProfile,
  OAuthAccount
} from "./oauth-types.js";
