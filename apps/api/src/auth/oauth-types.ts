/**
 * OAuth provider types and configurations.
 */

export type OAuthProvider = "google" | "github";

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

export type OAuthProviderConfig = {
  google?: OAuthConfig;
  github?: OAuthConfig;
};

export type OAuthProfile = {
  provider: OAuthProvider;
  providerId: string; // User ID from provider
  email: string;
  name?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
};

export type OAuthAccount = {
  userId: string;
  provider: OAuthProvider;
  providerId: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Google OAuth endpoints and configuration.
 */
export const GOOGLE_OAUTH = {
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
  scopes: [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
  ]
} as const;

/**
 * GitHub OAuth endpoints and configuration.
 */
export const GITHUB_OAUTH = {
  authUrl: "https://github.com/login/oauth/authorize",
  tokenUrl: "https://github.com/login/oauth/access_token",
  userInfoUrl: "https://api.github.com/user",
  emailsUrl: "https://api.github.com/user/emails",
  scopes: ["user:email", "read:user"]
} as const;
