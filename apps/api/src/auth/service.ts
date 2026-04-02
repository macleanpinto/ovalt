import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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
  Permission
} from "./types.js";
import { ROLE_PERMISSIONS } from "./types.js";

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
};

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
}
