/**
 * Authentication and authorization types for multi-tenant SaaS.
 */

export type UserRole = "owner" | "admin" | "member" | "viewer";

export type User = {
  userId: string;
  email: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
  emailVerified: boolean;
  lastLoginAt?: string;
};

export type Organization = {
  organizationId: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  plan: "free" | "pro" | "enterprise";
  settings?: {
    allowedDomains?: string[];
    ssoEnabled?: boolean;
    maxMembers?: number;
  };
};

export type OrganizationMember = {
  organizationId: string;
  userId: string;
  role: UserRole;
  joinedAt: string;
  invitedBy?: string;
};

export type Session = {
  sessionId: string;
  userId: string;
  organizationId: string;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
  userAgent?: string;
  ipAddress?: string;
};

export type ApiKey = {
  apiKeyId: string;
  organizationId: string;
  name: string;
  keyHash: string;
  prefix: string; // First 8 chars for display
  createdAt: string;
  createdBy: string;
  lastUsedAt?: string;
  expiresAt?: string;
  scopes: string[];
};

export type RequestContext = {
  /** Authenticated user (if session auth) */
  user?: User;
  /** Authenticated organization (from session or API key) */
  organization: Organization;
  /** Organization member record (if user auth) */
  membership?: OrganizationMember;
  /** Authentication method used */
  authMethod: "session" | "api_key" | "service";
  /** API key record (if API key auth) */
  apiKey?: ApiKey;
};

export type Permission =
  | "imports:read"
  | "imports:write"
  | "imports:delete"
  | "runs:read"
  | "runs:write"
  | "runs:delete"
  | "organization:read"
  | "organization:write"
  | "organization:delete"
  | "members:read"
  | "members:write"
  | "members:delete"
  | "members:invite"
  | "api_keys:read"
  | "api_keys:write"
  | "api_keys:delete";

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type Invite = {
  inviteId: string;
  organizationId: string;
  email: string;
  role: UserRole;
  token: string;
  invitedByUserId: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
  status: InviteStatus;
};

/** Seat limits per plan. null = unlimited. */
export const PLAN_SEAT_LIMITS: Record<Organization["plan"], number | null> = {
  free: 3,
  pro: 10,
  enterprise: null
};

/**
 * Role-based permissions matrix.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [
    "imports:read",
    "imports:write",
    "imports:delete",
    "runs:read",
    "runs:write",
    "runs:delete",
    "organization:read",
    "organization:write",
    "organization:delete",
    "members:read",
    "members:write",
    "members:delete",
    "members:invite",
    "api_keys:read",
    "api_keys:write",
    "api_keys:delete"
  ],
  admin: [
    "imports:read",
    "imports:write",
    "imports:delete",
    "runs:read",
    "runs:write",
    "runs:delete",
    "organization:read",
    "organization:write",
    "members:read",
    "members:write",
    "members:invite",
    "api_keys:read",
    "api_keys:write"
  ],
  member: [
    "imports:read",
    "imports:write",
    "runs:read",
    "runs:write",
    "organization:read",
    "members:read"
  ],
  viewer: [
    "imports:read",
    "runs:read",
    "organization:read",
    "members:read"
  ]
};
