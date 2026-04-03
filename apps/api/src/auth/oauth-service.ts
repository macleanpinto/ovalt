import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SignJWT, jwtVerify } from "jose";
import type {
  OAuthProvider,
  OAuthProviderConfig,
  OAuthProfile,
  OAuthAccount
} from "./oauth-types.js";
import { GOOGLE_OAUTH, GITHUB_OAUTH } from "./oauth-types.js";

/**
 * OAuth service for handling Google and GitHub authentication.
 */

export type OAuthServiceConfig = {
  ddb: DynamoDBDocumentClient;
  oauthAccountsTable: string;
  providers: OAuthProviderConfig;
  /** HMAC key for signing OAuth `state` (must match across Lambda instances; use JWT_SECRET). */
  stateSecret: string;
};

export class OAuthService {
  constructor(private config: OAuthServiceConfig) {}

  /**
   * Generate OAuth authorization URL.
   */
  async generateAuthUrl(provider: OAuthProvider): Promise<{ url: string; state: string }> {
    const providerConfig = this.getProviderConfig(provider);
    if (!providerConfig) {
      throw new Error(`OAuth provider ${provider} is not configured`);
    }

    const state = await this.signOAuthState(provider);

    const params = new URLSearchParams({
      client_id: providerConfig.clientId,
      redirect_uri: providerConfig.redirectUri,
      scope: providerConfig.scopes.join(" "),
      state,
      response_type: "code"
    });

    let authUrl: string;
    if (provider === "google") {
      authUrl = GOOGLE_OAUTH.authUrl;
      params.set("access_type", "offline");
      params.set("prompt", "consent");
    } else if (provider === "github") {
      authUrl = GITHUB_OAUTH.authUrl;
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    return {
      url: `${authUrl}?${params.toString()}`,
      state
    };
  }

  /**
   * Verify OAuth state token (signed JWT — works across Lambda cold starts / instances).
   */
  async verifyState(state: string): Promise<OAuthProvider | null> {
    try {
      const secret = new TextEncoder().encode(this.config.stateSecret);
      const { payload } = await jwtVerify(state, secret, { algorithms: ["HS256"] });
      if (payload.purpose !== "oauth") {
        return null;
      }
      const p = payload.provider;
      if (p !== "google" && p !== "github") {
        return null;
      }
      return p;
    } catch {
      return null;
    }
  }

  private async signOAuthState(provider: OAuthProvider): Promise<string> {
    const secret = new TextEncoder().encode(this.config.stateSecret);
    return new SignJWT({ purpose: "oauth", provider })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(secret);
  }

  /**
   * Exchange authorization code for access token and get user profile.
   */
  async handleCallback(
    provider: OAuthProvider,
    code: string
  ): Promise<OAuthProfile> {
    const providerConfig = this.getProviderConfig(provider);
    if (!providerConfig) {
      throw new Error(`OAuth provider ${provider} is not configured`);
    }

    // Exchange code for tokens
    const tokens = await this.exchangeCode(provider, code, providerConfig);

    // Get user profile
    const profile = await this.getUserProfile(provider, tokens.access_token);

    return {
      provider,
      providerId: profile.id,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatar_url,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : undefined
    };
  }

  /**
   * Link OAuth account to user.
   */
  async linkAccount(userId: string, profile: OAuthProfile): Promise<OAuthAccount> {
    const now = new Date().toISOString();

    const account: OAuthAccount = {
      userId,
      provider: profile.provider,
      providerId: profile.providerId,
      email: profile.email,
      accessToken: profile.accessToken,
      refreshToken: profile.refreshToken,
      expiresAt: profile.expiresAt,
      createdAt: now,
      updatedAt: now
    };

    await this.config.ddb.send(
      new PutCommand({
        TableName: this.config.oauthAccountsTable,
        Item: account
      })
    );

    return account;
  }

  /**
   * Get OAuth account by provider and provider ID.
   */
  async getAccountByProviderId(
    provider: OAuthProvider,
    providerId: string
  ): Promise<OAuthAccount | null> {
    const result = await this.config.ddb.send(
      new QueryCommand({
        TableName: this.config.oauthAccountsTable,
        IndexName: "provider-providerId-index",
        KeyConditionExpression: "provider = :provider AND providerId = :providerId",
        ExpressionAttributeValues: {
          ":provider": provider,
          ":providerId": providerId
        },
        Limit: 1
      })
    );

    return (result.Items?.[0] as OAuthAccount) || null;
  }

  /**
   * Get user's OAuth accounts.
   */
  async getUserAccounts(userId: string): Promise<OAuthAccount[]> {
    const result = await this.config.ddb.send(
      new QueryCommand({
        TableName: this.config.oauthAccountsTable,
        IndexName: "userId-index",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId
        }
      })
    );

    return (result.Items as OAuthAccount[]) || [];
  }

  /**
   * Exchange authorization code for access token.
   */
  private async exchangeCode(
    provider: OAuthProvider,
    code: string,
    config: { clientId: string; clientSecret: string; redirectUri: string }
  ): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }> {
    let tokenUrl: string;
    const body: Record<string, string> = {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code"
    };

    if (provider === "google") {
      tokenUrl = GOOGLE_OAUTH.tokenUrl;
    } else if (provider === "github") {
      tokenUrl = GITHUB_OAUTH.tokenUrl;
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: new URLSearchParams(body).toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in
    };
  }

  /**
   * Get user profile from OAuth provider.
   */
  private async getUserProfile(
    provider: OAuthProvider,
    accessToken: string
  ): Promise<{
    id: string;
    email: string;
    name?: string;
    avatar_url?: string;
  }> {
    if (provider === "google") {
      return this.getGoogleProfile(accessToken);
    } else if (provider === "github") {
      return this.getGitHubProfile(accessToken);
    }

    throw new Error(`Unknown provider: ${provider}`);
  }

  /**
   * Get Google user profile.
   */
  private async getGoogleProfile(
    accessToken: string
  ): Promise<{
    id: string;
    email: string;
    name?: string;
    avatar_url?: string;
  }> {
    const response = await fetch(GOOGLE_OAUTH.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error("Failed to fetch Google profile");
    }

    const data = await response.json();
    return {
      id: data.id,
      email: data.email,
      name: data.name,
      avatar_url: data.picture
    };
  }

  /**
   * Get GitHub user profile.
   */
  private async getGitHubProfile(
    accessToken: string
  ): Promise<{
    id: string;
    email: string;
    name?: string;
    avatar_url?: string;
  }> {
    // Get user info
    const userResponse = await fetch(GITHUB_OAUTH.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json"
      }
    });

    if (!userResponse.ok) {
      throw new Error("Failed to fetch GitHub profile");
    }

    const userData = await userResponse.json();

    // Get primary email if not public
    let email = userData.email;
    if (!email) {
      const emailsResponse = await fetch(GITHUB_OAUTH.emailsUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json"
        }
      });

      if (emailsResponse.ok) {
        const emails = await emailsResponse.json();
        const primaryEmail = emails.find((e: any) => e.primary);
        email = primaryEmail?.email || emails[0]?.email;
      }
    }

    if (!email) {
      throw new Error("No email address associated with GitHub account");
    }

    return {
      id: String(userData.id),
      email,
      name: userData.name,
      avatar_url: userData.avatar_url
    };
  }

  /**
   * Get provider configuration.
   */
  private getProviderConfig(provider: OAuthProvider) {
    return this.config.providers[provider];
  }
}
