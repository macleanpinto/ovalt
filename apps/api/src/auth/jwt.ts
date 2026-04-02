import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";

/**
 * JWT token management for session authentication.
 */

export type JwtPayload = {
  sub: string; // userId
  org: string; // organizationId
  role: string;
  iat?: number;
  exp?: number;
};

export type JwtOptions = {
  secret: string;
  expiresIn?: string; // e.g., "7d", "24h"
};

/**
 * Generate a JWT token for a user session.
 */
export async function generateToken(
  payload: Omit<JwtPayload, "iat" | "exp">,
  options: JwtOptions
): Promise<string> {
  const secret = new TextEncoder().encode(options.secret);
  const expiresIn = options.expiresIn || "7d";

  // Parse expiresIn string (simple parser for common formats)
  const duration = parseDuration(expiresIn);

  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + duration)
    .sign(secret);

  return token;
}

/**
 * Verify and decode a JWT token.
 */
export async function verifyToken(token: string, secret: string): Promise<JwtPayload> {
  const encodedSecret = new TextEncoder().encode(secret);

  try {
    const { payload } = await jwtVerify(token, encodedSecret, {
      algorithms: ["HS256"]
    });

    return {
      sub: String(payload.sub),
      org: String(payload.org),
      role: String(payload.role),
      iat: payload.iat,
      exp: payload.exp
    };
  } catch (err) {
    throw new Error(`JWT verification failed: ${err instanceof Error ? err.message : "invalid token"}`);
  }
}

/**
 * Generate a secure random session ID.
 */
export function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Generate a secure API key.
 * Format: tr_live_xxxxxxxxxxxxxxxxxxxxx (32 random bytes)
 */
export function generateApiKey(prefix: "tr_live" | "tr_test" = "tr_live"): {
  key: string;
  prefix: string;
} {
  const randomPart = randomBytes(32).toString("base64url");
  const key = `${prefix}_${randomPart}`;
  return {
    key,
    prefix: key.slice(0, 15) // First 15 chars for display
  };
}

/**
 * Hash an API key for storage.
 * Uses SHA-256 for deterministic hashing.
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Parse duration string to seconds.
 * Supports: "7d", "24h", "60m", "3600s"
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([dhms])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "d":
      return value * 24 * 60 * 60;
    case "h":
      return value * 60 * 60;
    case "m":
      return value * 60;
    case "s":
      return value;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}
