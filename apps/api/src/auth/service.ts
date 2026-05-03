import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { randomBytes } from "node:crypto";
import { ulid } from "ulid";
import { generateToken, generateSessionId, generateApiKey, hashApiKey, verifyToken } from "./jwt.js";
import type {
  User,
  Organization,
  OrganizationMember,
  Session,
  ApiKey,
  RequestContext,
  UserRole,
  Permission,
  Invite,
  InviteStatus
} from "./types.js";
import { ROLE_PERMISSIONS, PLAN_SEAT_LIMITS } from "./types.js";

/**
 * Authentication and authorization service.
 * Handles user sessions, API keys, and tenant isolation.
 */

export type AuthServiceConfig = {
  ddb: DynamoDBDocumentClient;
  jwtSecret: string;
  usersTable: string;
  orgsTable: string;
  membersTable: string;
  sessionsTable: string;
  apiKeysTable: string;
  invitesTable: string;
};

/** Typed errors thrown by membership/invite operations so routes can map to HTTP codes. */
export class SeatLimitError extends Error {
  constructor(public readonly limit: number, public readonly current: number, public readonly plan: string) {
    super(`Seat limit reached: ${current}/${limit} on ${plan} plan`);
    this.name = "SeatLimitError";
  }
}
export class InviteNotFoundError extends Error {
  constructor() {
    super("Invite not found");
    this.name = "InviteNotFoundError";
  }
}
export class InviteExpiredError extends Error {
  constructor() {
    super("Invite has expired");
    this.name = "InviteExpiredError";
  }
}
export class InviteAlreadyUsedError extends Error {
  constructor(public readonly status: InviteStatus) {
    super(`Invite is ${status}`);
    this.name = "InviteAlreadyUsedError";
  }
}
export class InviteEmailMismatchError extends Error {
  constructor() {
    super("Invite email does not match authenticated user");
    this.name = "InviteEmailMismatchError";
  }
}
export class AlreadyMemberError extends Error {
  constructor() {
    super("User is already a member of this organization");
    this.name = "AlreadyMemberError";
  }
}
export class LastOwnerError extends Error {
  constructor() {
    super("Cannot remove or demote the last owner of an organization");
    this.name = "LastOwnerError";
  }
}

export class AuthService {
  constructor(private config: AuthServiceConfig) {}

  /**
   * Create a new user account.
   */
  async createUser(params: { email: string; name?: string }): Promise<User> {
    const userId = ulid();
    const now = new Date().toISOString();

    const user: User = {
      userId,
      email: params.email.toLowerCase().trim(),
      name: params.name,
      createdAt: now,
      updatedAt: now,
      emailVerified: false
    };

    await this.config.ddb.send(
      new PutCommand({
        TableName: this.config.usersTable,
        Item: user,
        ConditionExpression: "attribute_not_exists(userId)"
      })
    );

    return user;
  }

  /**
   * Get user by ID.
   */
  async getUser(userId: string): Promise<User | null> {
    const result = await this.config.ddb.send(
      new GetCommand({
        TableName: this.config.usersTable,
        Key: { userId }
      })
    );

    return (result.Item as User) || null;
  }

  /**
   * Get user by email.
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const result = await this.config.ddb.send(
      new QueryCommand({
        TableName: this.config.usersTable,
        IndexName: "email-index",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: {
          ":email": email.toLowerCase().trim()
        },
        Limit: 1
      })
    );

    return (result.Items?.[0] as User) || null;
  }

  /**
   * Create a new organization.
   */
  async createOrganization(params: {
    name: string;
    slug: string;
    ownerId: string;
  }): Promise<Organization> {
    const organizationId = ulid();
    const now = new Date().toISOString();

    const org: Organization = {
      organizationId,
      name: params.name,
      slug: params.slug.toLowerCase().trim(),
      createdAt: now,
      updatedAt: now,
      ownerId: params.ownerId,
      plan: "free"
    };

    await this.config.ddb.send(
      new PutCommand({
        TableName: this.config.orgsTable,
        Item: org,
        ConditionExpression: "attribute_not_exists(organizationId)"
      })
    );

    // Add owner as first member
    await this.addMember({
      organizationId,
      userId: params.ownerId,
      role: "owner"
    });

    return org;
  }

  /**
   * Get organization by ID.
   */
  async getOrganization(organizationId: string): Promise<Organization | null> {
    const result = await this.config.ddb.send(
      new GetCommand({
        TableName: this.config.orgsTable,
        Key: { organizationId }
      })
    );

    return (result.Item as Organization) || null;
  }

  /**
   * Add a member to an organization.
   */
  async addMember(params: {
    organizationId: string;
    userId: string;
    role: UserRole;
    invitedBy?: string;
  }): Promise<OrganizationMember> {
    const now = new Date().toISOString();

    const member: OrganizationMember = {
      organizationId: params.organizationId,
      userId: params.userId,
      role: params.role,
      joinedAt: now,
      invitedBy: params.invitedBy
    };

    await this.config.ddb.send(
      new PutCommand({
        TableName: this.config.membersTable,
        Item: member,
        ConditionExpression: "attribute_not_exists(organizationId) AND attribute_not_exists(userId)"
      })
    );

    return member;
  }

  /**
   * Get user's membership in an organization.
   */
  async getMembership(organizationId: string, userId: string): Promise<OrganizationMember | null> {
    const result = await this.config.ddb.send(
      new GetCommand({
        TableName: this.config.membersTable,
        Key: { organizationId, userId }
      })
    );

    return (result.Item as OrganizationMember) || null;
  }

  /**
   * List all organizations for a user.
   */
  async getUserOrganizations(userId: string): Promise<Organization[]> {
    // Query members table by userId GSI
    const memberships = await this.config.ddb.send(
      new QueryCommand({
        TableName: this.config.membersTable,
        IndexName: "userId-index",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId
        }
      })
    );

    if (!memberships.Items || memberships.Items.length === 0) {
      return [];
    }

    // Fetch organization details
    const orgs: Organization[] = [];
    for (const item of memberships.Items) {
      const member = item as OrganizationMember;
      const org = await this.getOrganization(member.organizationId);
      if (org) {
        orgs.push(org);
      }
    }

    return orgs;
  }

  /**
   * Create a user session and return JWT token.
   */
  async createSession(params: {
    userId: string;
    organizationId: string;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<{ token: string; session: Session }> {
    const sessionId = generateSessionId();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    // Get membership for role
    const membership = await this.getMembership(params.organizationId, params.userId);
    if (!membership) {
      throw new Error("User is not a member of this organization");
    }

    const session: Session = {
      sessionId,
      userId: params.userId,
      organizationId: params.organizationId,
      createdAt: now,
      expiresAt,
      lastActivityAt: now,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress
    };

    await this.config.ddb.send(
      new PutCommand({
        TableName: this.config.sessionsTable,
        Item: session
      })
    );

    // Generate JWT token
    const token = await generateToken(
      {
        sub: params.userId,
        org: params.organizationId,
        role: membership.role
      },
      {
        secret: this.config.jwtSecret,
        expiresIn: "7d"
      }
    );

    return { token, session };
  }

  /**
   * Verify JWT token and load request context.
   */
  async verifySessionToken(token: string): Promise<RequestContext> {
    const payload = await verifyToken(token, this.config.jwtSecret);

    const user = await this.getUser(payload.sub);
    if (!user) {
      throw new Error("User not found");
    }

    const organization = await this.getOrganization(payload.org);
    if (!organization) {
      throw new Error("Organization not found");
    }

    const membership = await this.getMembership(payload.org, payload.sub);
    if (!membership) {
      throw new Error("User is not a member of this organization");
    }

    return {
      user,
      organization,
      membership,
      authMethod: "session"
    };
  }

  /**
   * Create an API key for programmatic access.
   */
  async createApiKey(params: {
    organizationId: string;
    name: string;
    createdBy: string;
    scopes: string[];
    expiresAt?: string;
  }): Promise<{ apiKey: ApiKey; key: string }> {
    const { key, prefix } = generateApiKey("tr_live");
    const keyHash = await hashApiKey(key);
    const now = new Date().toISOString();

    const apiKey: ApiKey = {
      apiKeyId: ulid(),
      organizationId: params.organizationId,
      name: params.name,
      keyHash,
      prefix,
      createdAt: now,
      createdBy: params.createdBy,
      scopes: params.scopes,
      expiresAt: params.expiresAt
    };

    await this.config.ddb.send(
      new PutCommand({
        TableName: this.config.apiKeysTable,
        Item: apiKey
      })
    );

    return { apiKey, key };
  }

  /**
   * Verify API key and load request context.
   */
  async verifyApiKey(key: string): Promise<RequestContext> {
    const keyHash = await hashApiKey(key);

    // Query by keyHash (requires GSI on keyHash)
    const result = await this.config.ddb.send(
      new QueryCommand({
        TableName: this.config.apiKeysTable,
        IndexName: "keyHash-index",
        KeyConditionExpression: "keyHash = :keyHash",
        ExpressionAttributeValues: {
          ":keyHash": keyHash
        },
        Limit: 1
      })
    );

    const apiKey = result.Items?.[0] as ApiKey | undefined;
    if (!apiKey) {
      throw new Error("Invalid API key");
    }

    // Check expiration
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      throw new Error("API key has expired");
    }

    const organization = await this.getOrganization(apiKey.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    // Update last used timestamp (async, don't wait)
    this.config.ddb
      .send(
        new PutCommand({
          TableName: this.config.apiKeysTable,
          Item: {
            ...apiKey,
            lastUsedAt: new Date().toISOString()
          }
        })
      )
      .catch(err => {
        console.warn("Failed to update API key last used timestamp", err);
      });

    return {
      organization,
      authMethod: "api_key",
      apiKey
    };
  }

  /**
   * Check if a user has a specific permission.
   */
  hasPermission(ctx: RequestContext, permission: Permission): boolean {
    if (ctx.authMethod === "service") {
      return true; // Service auth has all permissions
    }

    if (ctx.authMethod === "api_key") {
      // Check API key scopes
      return ctx.apiKey?.scopes.includes(permission) || ctx.apiKey?.scopes.includes("*") || false;
    }

    // Session auth - check role permissions
    if (!ctx.membership) {
      return false;
    }

    const rolePermissions = ROLE_PERMISSIONS[ctx.membership.role];
    return rolePermissions.includes(permission);
  }

  /**
   * Require a specific permission, throw if not authorized.
   */
  requirePermission(ctx: RequestContext, permission: Permission): void {
    if (!this.hasPermission(ctx, permission)) {
      throw new Error(`Missing required permission: ${permission}`);
    }
  }

  // ==========================================================================
  // Members & invites
  // ==========================================================================

  /** List all members of an organization. */
  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    const result = await this.config.ddb.send(
      new QueryCommand({
        TableName: this.config.membersTable,
        KeyConditionExpression: "organizationId = :orgId",
        ExpressionAttributeValues: { ":orgId": organizationId }
      })
    );
    return (result.Items as OrganizationMember[]) ?? [];
  }

  /**
   * Effective seat limit for an org. `settings.maxMembers` overrides the plan default when set.
   * null means unlimited.
   */
  getSeatLimit(org: Organization): number | null {
    if (typeof org.settings?.maxMembers === "number") {
      return org.settings.maxMembers;
    }
    return PLAN_SEAT_LIMITS[org.plan] ?? null;
  }

  /** Throw SeatLimitError if adding one more member would exceed the org's seat limit. */
  async assertSeatAvailable(org: Organization): Promise<void> {
    const limit = this.getSeatLimit(org);
    if (limit === null) return; // unlimited
    const members = await this.listMembers(org.organizationId);
    if (members.length >= limit) {
      throw new SeatLimitError(limit, members.length, org.plan);
    }
  }

  /** Update a member's role. Prevents demoting the last owner. */
  async updateMemberRole(organizationId: string, userId: string, newRole: UserRole): Promise<OrganizationMember> {
    const existing = await this.getMembership(organizationId, userId);
    if (!existing) throw new Error("Member not found");
    if (existing.role === newRole) return existing;

    if (existing.role === "owner" && newRole !== "owner") {
      const members = await this.listMembers(organizationId);
      const ownerCount = members.filter(m => m.role === "owner").length;
      if (ownerCount <= 1) throw new LastOwnerError();
    }

    const result = await this.config.ddb.send(
      new UpdateCommand({
        TableName: this.config.membersTable,
        Key: { organizationId, userId },
        UpdateExpression: "SET #role = :role",
        ExpressionAttributeNames: { "#role": "role" },
        ExpressionAttributeValues: { ":role": newRole },
        ReturnValues: "ALL_NEW"
      })
    );
    return result.Attributes as OrganizationMember;
  }

  /** Remove a member. Prevents removing the last owner. */
  async removeMember(organizationId: string, userId: string): Promise<void> {
    const existing = await this.getMembership(organizationId, userId);
    if (!existing) return;

    if (existing.role === "owner") {
      const members = await this.listMembers(organizationId);
      const ownerCount = members.filter(m => m.role === "owner").length;
      if (ownerCount <= 1) throw new LastOwnerError();
    }

    await this.config.ddb.send(
      new DeleteCommand({
        TableName: this.config.membersTable,
        Key: { organizationId, userId }
      })
    );
  }

  /** Generate a URL-safe random token for invite links. */
  private generateInviteToken(): string {
    return randomBytes(24).toString("base64url");
  }

  /**
   * Create an invite for a new member. Enforces seat limits (active members only
   * count toward the cap).
   */
  async createInvite(params: {
    organization: Organization;
    email: string;
    role: UserRole;
    invitedByUserId: string;
    expiresInHours?: number;
  }): Promise<Invite> {
    const email = params.email.toLowerCase().trim();

    await this.assertSeatAvailable(params.organization);

    // If a user with this email is already a member, reject.
    const existingUser = await this.getUserByEmail(email);
    if (existingUser) {
      const membership = await this.getMembership(params.organization.organizationId, existingUser.userId);
      if (membership) throw new AlreadyMemberError();
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (params.expiresInHours ?? 24 * 7) * 60 * 60 * 1000);

    const invite: Invite = {
      inviteId: ulid(),
      organizationId: params.organization.organizationId,
      email,
      role: params.role,
      token: this.generateInviteToken(),
      invitedByUserId: params.invitedByUserId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: "pending"
    };

    await this.config.ddb.send(
      new PutCommand({
        TableName: this.config.invitesTable,
        Item: invite,
        ConditionExpression: "attribute_not_exists(inviteId)"
      })
    );
    return invite;
  }

  /** List pending invites for an organization. */
  async listInvites(organizationId: string): Promise<Invite[]> {
    const result = await this.config.ddb.send(
      new QueryCommand({
        TableName: this.config.invitesTable,
        IndexName: "organizationId-index",
        KeyConditionExpression: "organizationId = :orgId",
        ExpressionAttributeValues: { ":orgId": organizationId }
      })
    );
    return ((result.Items as Invite[]) ?? []).filter(i => i.status === "pending");
  }

  /** Get invite by token. Returns null if not found. */
  async getInviteByToken(token: string): Promise<Invite | null> {
    const result = await this.config.ddb.send(
      new QueryCommand({
        TableName: this.config.invitesTable,
        IndexName: "token-index",
        KeyConditionExpression: "#tok = :tok",
        ExpressionAttributeNames: { "#tok": "token" },
        ExpressionAttributeValues: { ":tok": token },
        Limit: 1
      })
    );
    return (result.Items?.[0] as Invite) ?? null;
  }

  /** Revoke a pending invite. */
  async revokeInvite(inviteId: string): Promise<void> {
    await this.config.ddb.send(
      new UpdateCommand({
        TableName: this.config.invitesTable,
        Key: { inviteId },
        UpdateExpression: "SET #status = :revoked",
        ConditionExpression: "#status = :pending",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":revoked": "revoked", ":pending": "pending" }
      })
    );
  }

  /**
   * Accept an invite: validates token, seat limit, email match, then adds membership
   * and marks the invite accepted.
   */
  async acceptInvite(params: { token: string; user: User }): Promise<{ invite: Invite; membership: OrganizationMember }> {
    const invite = await this.getInviteByToken(params.token);
    if (!invite) throw new InviteNotFoundError();

    if (invite.status !== "pending") throw new InviteAlreadyUsedError(invite.status);
    if (new Date(invite.expiresAt) < new Date()) {
      // Mark expired (best effort) so UI reflects state
      await this.config.ddb
        .send(
          new UpdateCommand({
            TableName: this.config.invitesTable,
            Key: { inviteId: invite.inviteId },
            UpdateExpression: "SET #status = :expired",
            ConditionExpression: "#status = :pending",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: { ":expired": "expired", ":pending": "pending" }
          })
        )
        .catch(() => undefined);
      throw new InviteExpiredError();
    }

    if (params.user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new InviteEmailMismatchError();
    }

    const existingMembership = await this.getMembership(invite.organizationId, params.user.userId);
    if (existingMembership) throw new AlreadyMemberError();

    const organization = await this.getOrganization(invite.organizationId);
    if (!organization) throw new Error("Organization on invite no longer exists");

    await this.assertSeatAvailable(organization);

    const membership = await this.addMember({
      organizationId: invite.organizationId,
      userId: params.user.userId,
      role: invite.role,
      invitedBy: invite.invitedByUserId
    });

    const now = new Date().toISOString();
    await this.config.ddb.send(
      new UpdateCommand({
        TableName: this.config.invitesTable,
        Key: { inviteId: invite.inviteId },
        UpdateExpression: "SET #status = :accepted, acceptedAt = :at, acceptedByUserId = :uid",
        ConditionExpression: "#status = :pending",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":accepted": "accepted",
          ":pending": "pending",
          ":at": now,
          ":uid": params.user.userId
        }
      })
    );

    return {
      invite: { ...invite, status: "accepted", acceptedAt: now, acceptedByUserId: params.user.userId },
      membership
    };
  }
}
