import { dirname, resolve } from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import { ulid } from "ulid";
import { z } from "zod";
import { google } from "googleapis";
import {
  CLIENT_TO_SERVER_TAG_TYPE,
  CLIENT_TO_SERVER_TRIGGER_TYPE,
  getMigrationRecommendation,
  getTriggerMigrationStrategy,
  buildServerTriggerConfig as buildServerTriggerConfigFromMapping
} from "./gtm-mappings/index.js";
import {
  buildServerVariableFromClient,
  sortVariablesByDependency
} from "./gtm-mappings/variable-deployment-helper.js";

// Repo-root `.env` is loaded from `index.ts` (local dev only). Lambda uses env + Secrets Manager (see lambda-handler.ts).
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { hostingGuideFor, normalizeHostingProvider, type HostingProvider } from "./serverHosting.js";
import { buildSgtmContainerConfigBase64, deployTaggingServerToCloudRun } from "./gtmCloudRunDeploy.js";
import { deployRequiredTemplates, getTemplateFingerprint } from "./gtm-templates/template-manager.js";
import {
  verifyContainerProvisioning,
  buildProvisioningGuide,
  type ProvisioningContext
} from "../../worker/src/provisioning/index.js";
import {
  AuthService,
  OAuthService,
  registerAuthRoutes,
  registerOAuthRoutes,
  authenticateRequest,
  getOrganizationId,
  type OAuthProviderConfig
} from "./auth/index.js";

// Env schema - will be parsed inside buildApp() after secrets are loaded
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ENDPOINT: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  DDB_TABLE_IMPORTS: z.string().default("tag-relay-imports"),
  DDB_TABLE_RUNS: z.string().default("tag-relay-runs"),
  DDB_TABLE_USERS: z.string().default("tag-relay-users"),
  DDB_TABLE_ORGANIZATIONS: z.string().default("tag-relay-organizations"),
  DDB_TABLE_ORGANIZATION_MEMBERS: z.string().default("tag-relay-organization-members"),
  DDB_TABLE_SESSIONS: z.string().default("tag-relay-sessions"),
  DDB_TABLE_API_KEYS: z.string().default("tag-relay-api-keys"),
  DDB_TABLE_OAUTH_ACCOUNTS: z.string().default("tag-relay-oauth-accounts"),
  S3_BUCKET: z.string().default("tag-relay-artifacts"),
  SQS_QUEUE_URL: z.string().default("http://localhost:4566/000000000000/tag-relay-migrations"),
  API_KEY: z.string().default("dev-api-key"),

  // JWT and authentication
  JWT_SECRET: z.string().default("dev-jwt-secret-change-in-production"),

  // OAuth for user authentication (Google/GitHub login)
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().optional(),
  GITHUB_OAUTH_CLIENT_ID: z.string().optional(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().optional(),
  GITHUB_OAUTH_REDIRECT_URI: z.string().optional(),

  // GTM OAuth (Tag Manager access) - can use a separate Google OAuth client
  GTM_OAUTH_CLIENT_ID: z.string().optional(),
  GTM_OAUTH_CLIENT_SECRET: z.string().optional(),
  GTM_OAUTH_REDIRECT_URI: z.string().optional(),

  /** When set (e.g. https://api.example.com), OAuth redirect URIs are derived from this base so Secrets Manager or stale env cannot point Google at localhost in production. */
  API_PUBLIC_BASE_URL: z.string().optional(),

  WEB_BASE_URL: z.string().default("http://localhost:5173")
});

const importBodySchema = z.object({
  projectId: z.string().min(1),
  sourceType: z.literal("gtm-web-container"),
  payload: z.unknown()
});

const runBodySchema = z.object({
  rulesetVersion: z.string().default("v1"),
  idempotencyKey: z.string().optional()
});

const patchHostingSchema = z
  .object({
    provider: z.string().optional(),
    serverContainerPublicId: z.union([z.string().max(64), z.literal("")]).optional(),
    serverTaggingUrl: z.union([z.string().max(512), z.literal("")]).optional(),
    notes: z.union([z.string().max(2000), z.literal("")]).optional(),
    customDomain: z.union([z.string().max(253), z.literal("")]).optional(),
    dnsSetupCompletedAt: z.union([z.string().max(64), z.literal("")]).optional(),
    dnsSetupMode: z.union([z.enum(["default_url", "custom_domain"]), z.literal("")]).optional()
  })
  .strict();

const deployTaggingServerSchema = z
  .object({
    importId: z.string().min(1),
    gcpProjectId: z.string().min(1),
    region: z.string().min(1).default("us-central1"),
    serviceId: z.string().min(2).max(49).regex(/^[a-z][-a-z0-9]*$/).default("tag-relay-sgtm")
  })
  .strict();

export async function buildApp(): Promise<FastifyInstance> {
// Parse env AFTER secrets are loaded from AWS Secrets Manager
const env = envSchema.parse(process.env);

// SAFETY: Force LocalStack in local/development mode
const isLocal = process.env.ENVIRONMENT === "local" || process.env.NODE_ENV === "development";
let awsEndpoint = env.AWS_ENDPOINT;

if (isLocal && !awsEndpoint) {
  console.warn("[api] ⚠️  LOCAL MODE: AWS_ENDPOINT not set, defaulting to LocalStack");
  awsEndpoint = "http://localhost:4566";
}

// SAFETY: Prevent accidental real AWS usage in local mode
if (isLocal && awsEndpoint !== "http://localhost:4566") {
  throw new Error(
    `[api] ❌ SAFETY CHECK FAILED: Local mode must use LocalStack (http://localhost:4566), but AWS_ENDPOINT is "${awsEndpoint}"`
  );
}

console.log("[api] AWS Config:", {
  environment: process.env.ENVIRONMENT || process.env.NODE_ENV,
  region: env.AWS_REGION,
  endpoint: awsEndpoint || "AWS (production)",
  isLocalStack: awsEndpoint === "http://localhost:4566"
});

const apiPublicBase = env.API_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
const googleOAuthRedirectUri = apiPublicBase
  ? `${apiPublicBase}/auth/oauth/google/callback`
  : env.GOOGLE_OAUTH_REDIRECT_URI;
const githubOAuthRedirectUri = apiPublicBase
  ? `${apiPublicBase}/auth/oauth/github/callback`
  : env.GITHUB_OAUTH_REDIRECT_URI;
const gtmOAuthRedirectUri = apiPublicBase ? `${apiPublicBase}/gtm/oauth/callback` : env.GTM_OAUTH_REDIRECT_URI;

// Configure AWS clients with explicit credentials for LocalStack
const baseAws: any = {
  region: env.AWS_REGION,
  endpoint: awsEndpoint
};

// Force test credentials for LocalStack to override ~/.aws/credentials
if (isLocal || awsEndpoint === "http://localhost:4566") {
  baseAws.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test"
  };
  console.log("[api] 🔒 Using LocalStack test credentials (overriding ~/.aws/credentials)");
}

const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient(baseAws));
/** Path-style URLs are required for S3-compatible endpoints (e.g. LocalStack). */
const s3 = new S3Client({
  ...baseAws,
  forcePathStyle: Boolean(awsEndpoint)
});
const sqs = new SQSClient(baseAws);

async function s3ReadObjectText(key: string): Promise<string | null> {
  try {
    const o = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return (await o.Body?.transformToString()) ?? null;
  } catch {
    return null;
  }
}

const app = Fastify({ logger: true });

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function isGtmQuotaError(err: unknown): boolean {
  const e = err as { response?: { status?: number }; code?: number; message?: string };
  const status = e.response?.status ?? e.code;
  const msg = String(e.message ?? "");
  return status === 429 || msg.includes("Quota exceeded") || msg.includes("RESOURCE_EXHAUSTED");
}

function gtmErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return e.response?.data?.error?.message ?? e.message ?? "GTM API error";
}

/** Avoid bursting the Tag Manager API (parallel calls count toward per-minute quotas). */
async function gtmCall<T>(
  log: FastifyInstance["log"],
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isGtmQuotaError(err) || attempt === maxAttempts - 1) throw err;
      const backoffMs = 1200 * 2 ** attempt;
      log.warn({ label, attempt, backoffMs }, "GTM rate limit — retrying");
      await delay(backoffMs);
    }
  }
  throw new Error("unreachable");
}

await app.register(cors, {
  origin: true,
  credentials: true
});
await app.register(helmet);
await app.register(cookie);

// Initialize authentication services
const authService = new AuthService({
  ddb: ddbDoc,
  jwtSecret: env.JWT_SECRET,
  usersTable: env.DDB_TABLE_USERS,
  orgsTable: env.DDB_TABLE_ORGANIZATIONS,
  membersTable: env.DDB_TABLE_ORGANIZATION_MEMBERS,
  sessionsTable: env.DDB_TABLE_SESSIONS,
  apiKeysTable: env.DDB_TABLE_API_KEYS
});

// Initialize OAuth service
const oauthProviders: OAuthProviderConfig = {};
if (env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && googleOAuthRedirectUri) {
  oauthProviders.google = {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: googleOAuthRedirectUri,
    scopes: ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"]
  };
}
if (env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET && githubOAuthRedirectUri) {
  oauthProviders.github = {
    clientId: env.GITHUB_OAUTH_CLIENT_ID,
    clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
    redirectUri: githubOAuthRedirectUri,
    scopes: ["user:email", "read:user"]
  };
}

const oauthService = new OAuthService({
  ddb: ddbDoc,
  oauthAccountsTable: env.DDB_TABLE_OAUTH_ACCOUNTS,
  providers: oauthProviders,
  stateSecret: env.JWT_SECRET
});

// Register authentication routes
registerAuthRoutes(app, authService);
registerOAuthRoutes(app, authService, oauthService);

type GtmSession = {
  sessionId: string;
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
    scope?: string | null;
    token_type?: string | null;
    id_token?: string | null;
  };
  createdAt: number;
  expiresAt: number;
  returnUrl?: string;
  type: 'gtm';
};

// GTM session helpers using DynamoDB
async function getGtmSession(sessionId: string): Promise<GtmSession | null> {
  try {
    const result = await ddbDoc.send(
      new GetCommand({
        TableName: env.DDB_TABLE_SESSIONS,
        Key: { sessionId }
      })
    );
    if (!result.Item || result.Item.type !== 'gtm') return null;
    return result.Item as GtmSession;
  } catch (err) {
    console.error('Failed to get GTM session:', err);
    return null;
  }
}

async function setGtmSession(session: GtmSession): Promise<void> {
  await ddbDoc.send(
    new PutCommand({
      TableName: env.DDB_TABLE_SESSIONS,
      Item: session
    })
  );
}

/**
 * GTM + list GCP projects + deploy tagging server to Cloud Run in the user's project (cloud-platform).
 * Users must reconnect Google after adding cloud-platform.
 */
const GTM_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",  // Required for workspace deletion
  "https://www.googleapis.com/auth/cloudplatformprojects.readonly",
  "https://www.googleapis.com/auth/cloud-platform"
] as const;

function requireGtmOAuthConfigured(reply: any) {
  const clientId = env.GTM_OAUTH_CLIENT_ID ?? env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GTM_OAUTH_CLIENT_SECRET ?? env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = gtmOAuthRedirectUri;
  if (!clientId || !clientSecret || !redirectUri) {
    reply.code(400).send({
      message:
        "GTM OAuth not configured. Set GTM_OAUTH_CLIENT_ID, GTM_OAUTH_CLIENT_SECRET, GTM_OAUTH_REDIRECT_URI (or set GOOGLE_OAUTH_CLIENT_ID/SECRET and GTM_OAUTH_REDIRECT_URI)."
    });
    return false;
  }
  return true;
}

function getGtmSessionId(req: any) {
  const raw = req.headers["x-gtm-session"];
  if (typeof raw !== "string" || !raw) return null;
  return raw;
}

async function getOAuthClientForSession(sessionId: string) {
  const session = await getGtmSession(sessionId);
  if (!session) return null;

  const clientId = (env.GTM_OAUTH_CLIENT_ID ?? env.GOOGLE_OAUTH_CLIENT_ID)!;
  const clientSecret = (env.GTM_OAUTH_CLIENT_SECRET ?? env.GOOGLE_OAUTH_CLIENT_SECRET)!;
  const client = new google.auth.OAuth2(clientId, clientSecret, gtmOAuthRedirectUri!);
  client.setCredentials({
    access_token: session.tokens.access_token ?? undefined,
    refresh_token: session.tokens.refresh_token ?? undefined,
    expiry_date: session.tokens.expiry_date ?? undefined,
    scope: session.tokens.scope ?? undefined,
    token_type: session.tokens.token_type ?? undefined,
    id_token: session.tokens.id_token ?? undefined
  });
  return client;
}

function requestPath(url: string) {
  return url.split("?")[0] ?? url;
}

/** Prevent browsers/CDNs from caching API responses (stale JSON / OAuth issues). Applied in onSend so it wins over other middleware. */
app.addHook(
  "onSend",
  async (_request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    reply.header("Pragma", "no-cache");
    reply.header("Expires", "0");
    return payload;
  }
);

// Authentication middleware - handles Bearer tokens, API keys, and service tokens
app.addHook("onRequest", async (req, reply) => {
  const publicPaths = [
    "/health",
    "/metrics",
    "/gtm/oauth/callback",
    "/gtm/debug/tags",
    "/auth/register",
    "/auth/login",
    "/auth/oauth/google",
    "/auth/oauth/github",
    "/auth/oauth/google/callback",
    "/auth/oauth/github/callback"
  ];

  // Add test endpoints in development/test mode
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    publicPaths.push("/test/gtm-session", "/test/organization");
  }

  await authenticateRequest(req, reply, {
    authService,
    publicPaths
  });
});

const metrics = {
  importsCreated: 0,
  runsQueued: 0
};

function isDdbResourceNotFound(err: unknown) {
  const e = err as { name?: string; __type?: string };
  return e?.name === "ResourceNotFoundException" || e?.__type?.includes("ResourceNotFoundException");
}

app.get("/health", async () => ({ ok: true }));
app.get("/metrics", async () => ({
  importsCreated: metrics.importsCreated,
  runsQueued: metrics.runsQueued
}));

app.get("/gtm/oauth/start", async (req, reply) => {
  if (!requireGtmOAuthConfigured(reply)) return;
  const sessionId = ulid();
  const returnUrl = (req.query as any)?.returnUrl;
  const clientId = (env.GTM_OAUTH_CLIENT_ID ?? env.GOOGLE_OAUTH_CLIENT_ID)!;
  const clientSecret = (env.GTM_OAUTH_CLIENT_SECRET ?? env.GOOGLE_OAUTH_CLIENT_SECRET)!;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, gtmOAuthRedirectUri!);
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [...GTM_OAUTH_SCOPES],
    state: sessionId
  });
  // Create placeholder so callback can verify state exists.
  const now = Date.now();
  await setGtmSession({
    sessionId,
    tokens: {},
    createdAt: now,
    expiresAt: Math.floor((now + 30 * 24 * 60 * 60 * 1000) / 1000), // 30 days in seconds
    returnUrl,
    type: 'gtm'
  });
  return {
    sessionId,
    url,
    scopesRequested: [...GTM_OAUTH_SCOPES],
    // Must match an Authorized redirect URI in Google Cloud exactly (scheme, host, port, path).
    redirectUri: gtmOAuthRedirectUri
  };
});

app.get("/gtm/oauth/callback", async (req, reply) => {
  if (!requireGtmOAuthConfigured(reply)) return;
  const { code, state, error } = (req.query as any) ?? {};
  if (error) {
    return reply.redirect(`${env.WEB_BASE_URL}/import/select?gtmError=${encodeURIComponent(String(error))}`);
  }
  if (!code || !state || typeof state !== "string") {
    return reply.code(400).send({ message: "Missing code/state" });
  }
  const existingSession = await getGtmSession(state);
  if (!existingSession) {
    return reply.code(400).send({ message: "Invalid state" });
  }

  const clientId = (env.GTM_OAUTH_CLIENT_ID ?? env.GOOGLE_OAUTH_CLIENT_ID)!;
  const clientSecret = (env.GTM_OAUTH_CLIENT_SECRET ?? env.GOOGLE_OAUTH_CLIENT_SECRET)!;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, gtmOAuthRedirectUri!);
  const { tokens } = await oauth2.getToken(String(code));
  const now = Date.now();
  await setGtmSession({
    sessionId: state,
    tokens,
    createdAt: now,
    expiresAt: Math.floor((now + 30 * 24 * 60 * 60 * 1000) / 1000), // 30 days in seconds
    returnUrl: existingSession.returnUrl,
    type: 'gtm'
  });

  // Redirect to stored returnUrl or default to import/select
  const redirectPath = existingSession.returnUrl || `/import/select`;
  const separator = redirectPath.includes('?') ? '&' : '?';
  return reply.redirect(`${env.WEB_BASE_URL}${redirectPath}${separator}gtmSession=${encodeURIComponent(state)}`);
});

// TEST ENDPOINT: Inject OAuth tokens for automated testing (development only)
if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
  app.post("/test/gtm-session", async (req, reply) => {
    if (!requireGtmOAuthConfigured(reply)) return;

    const { accessToken, refreshToken, expiryDate } = req.body as {
      accessToken?: string;
      refreshToken?: string;
      expiryDate?: number;
    };

    if (!accessToken) {
      return reply.code(400).send({ message: "accessToken required" });
    }

    const sessionId = 'test-session-' + Date.now();
    const now = Date.now();

    await setGtmSession({
      sessionId,
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: expiryDate
      },
      createdAt: now,
      expiresAt: Math.floor((now + 30 * 24 * 60 * 60 * 1000) / 1000), // 30 days in seconds
      returnUrl: '/',
      type: 'gtm'
    });

    app.log.info({ sessionId }, "Created test GTM session");

    return { sessionId };
  });

  // TEST ENDPOINT: Create test organization in database (development only)
  app.post("/test/organization", async (req, reply) => {
    const { organizationId, name } = req.body as {
      organizationId?: string;
      name?: string;
    };

    const orgId = organizationId || 'test-org-' + Date.now();
    const orgName = name || 'E2E Test Organization';

    try {
      await ddbDoc.send(
        new PutCommand({
          TableName: env.DDB_TABLE_ORGANIZATIONS,
          Item: {
            organizationId: orgId,
            name: orgName,
            slug: orgId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        })
      );

      app.log.info({ organizationId: orgId }, "Created test organization");

      return { organizationId: orgId, name: orgName };
    } catch (err) {
      app.log.error({ err, organizationId: orgId }, "Failed to create test organization");
      return reply.code(500).send({ message: "Failed to create organization" });
    }
  });
}

app.get("/gtm/accounts", async (req, reply) => {
  if (!requireGtmOAuthConfigured(reply)) return;
  const sessionId = getGtmSessionId(req);
  if (!sessionId) return reply.code(401).send({ message: "Missing x-gtm-session" });
  const auth = await getOAuthClientForSession(sessionId);
  if (!auth) return reply.code(401).send({ message: "Invalid GTM session" });

  const tm = google.tagmanager({ version: "v2", auth });
  const res = await tm.accounts.list();
  return { accounts: res.data.account ?? [] };
});

app.get("/gtm/containers", async (req, reply) => {
  if (!requireGtmOAuthConfigured(reply)) return;
  const sessionId = getGtmSessionId(req);
  if (!sessionId) return reply.code(401).send({ message: "Missing x-gtm-session" });
  const auth = await getOAuthClientForSession(sessionId);
  if (!auth) return reply.code(401).send({ message: "Invalid GTM session" });

  const { accountPath } = (req.query as any) ?? {};
  if (!accountPath || typeof accountPath !== "string") return reply.code(400).send({ message: "Missing accountPath" });

  const tm = google.tagmanager({ version: "v2", auth });
  const res = await tm.accounts.containers.list({ parent: accountPath });
  return { containers: res.data.container ?? [] };
});

app.get("/gtm/cloud-projects", async (req, reply) => {
  if (!requireGtmOAuthConfigured(reply)) return;
  const sessionId = getGtmSessionId(req);
  if (!sessionId) return reply.code(401).send({ message: "Missing x-gtm-session" });
  const auth = await getOAuthClientForSession(sessionId);
  if (!auth) return reply.code(401).send({ message: "Invalid GTM session" });

  try {
    const crm = google.cloudresourcemanager({ version: "v1", auth });
    const out: { projectId: string; name: string }[] = [];
    let pageToken: string | undefined;
    do {
      const res = await crm.projects.list({ pageToken, pageSize: 200 });
      for (const p of res.data.projects ?? []) {
        if (p.lifecycleState === "ACTIVE" && p.projectId) {
          out.push({ projectId: p.projectId, name: p.name ?? p.projectId });
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    out.sort((a, b) => a.name.localeCompare(b.name));
    return { projects: out };
  } catch (err) {
    app.log.warn({ err }, "cloud-projects list failed (enable Cloud Resource Manager API on the OAuth client GCP project)");
    return {
      projects: [] as { projectId: string; name: string }[],
      hint:
        "Could not list GCP projects. Enable the Cloud Resource Manager API on the Google Cloud project that owns your OAuth client ID, then reconnect Google."
    };
  }
});

app.post("/gtm/create-server-container", async (req, reply) => {
  if (!requireGtmOAuthConfigured(reply)) return;
  const sessionId = getGtmSessionId(req);
  if (!sessionId) return reply.code(401).send({ message: "Missing x-gtm-session" });
  const auth = await getOAuthClientForSession(sessionId);
  if (!auth) return reply.code(401).send({ message: "Invalid GTM session" });

  const parsed = createServerContainerSchema.safeParse(req.body ?? {});
  if (!parsed.success) return reply.code(400).send({ errors: parsed.error.issues });

  const tm = google.tagmanager({ version: "v2", auth });
  try {
    const created = await gtmCall(app.log, "containers.create", () =>
      tm.accounts.containers.create({
        parent: parsed.data.accountPath,
        requestBody: {
          name: parsed.data.name,
          usageContext: ["server"]
        }
      })
    );
    const container = created.data;
    if (!container?.path || !container.publicId) {
      return reply.code(502).send({ message: "GTM API returned an incomplete container" });
    }

    if (parsed.data.importId) {
      const got = await ddbDoc.send(
        new GetCommand({
          TableName: env.DDB_TABLE_IMPORTS,
          Key: { importId: parsed.data.importId }
        })
      );
      if (!got.Item) {
        return reply.code(404).send({ message: "importId not found; server container was created in GTM but not linked to an import" });
      }
      const item = got.Item as Record<string, unknown>;
      const prevGtm = (item.gtm as Record<string, unknown>) ?? {};
      const prevHosting = (item.hosting as Record<string, string>) ?? {};
      const now = new Date().toISOString();
      const hosting = {
        ...prevHosting,
        provider: normalizeHostingProvider("google_cloud"),
        serverContainerPublicId: container.publicId,
        updatedAt: now
      };
      await ddbDoc.send(
        new PutCommand({
          TableName: env.DDB_TABLE_IMPORTS,
          Item: {
            ...item,
            gtm: { ...prevGtm, serverContainerPath: container.path },
            hosting
          }
        })
      );
    }

    return {
      path: container.path,
      publicId: container.publicId,
      containerId: container.containerId,
      tagManagerUrl: container.tagManagerUrl
    };
  } catch (err) {
    app.log.error(err);
    const msg = gtmErrorMessage(err);
    const lower = msg.toLowerCase();
    const status =
      lower.includes("insufficient") || lower.includes("permission") || lower.includes("access") ? 403 : 502;
    return reply.code(status).send({
      message:
        status === 403
          ? `${msg} Reconnect Google Tag Manager on the container screen so Tag Relay can request container creation permission.`
          : msg
    });
  }
});

app.post("/gtm/deploy-tagging-server", async (req, reply) => {
  if (!requireGtmOAuthConfigured(reply)) return;
  const sessionId = getGtmSessionId(req);
  if (!sessionId) return reply.code(401).send({ message: "Missing x-gtm-session" });
  const auth = await getOAuthClientForSession(sessionId);
  if (!auth) return reply.code(401).send({ message: "Invalid GTM session" });

  const parsed = deployTaggingServerSchema.safeParse(req.body ?? {});
  if (!parsed.success) return reply.code(400).send({ errors: parsed.error.issues });

  const got = await ddbDoc.send(
    new GetCommand({
      TableName: env.DDB_TABLE_IMPORTS,
      Key: { importId: parsed.data.importId }
    })
  );
  if (!got.Item) return reply.code(404).send({ message: "Import not found" });

  const item = got.Item as Record<string, unknown>;
  const gtm = item.gtm as { serverContainerPath?: string } | undefined;
  const hosting = item.hosting as { serverContainerPublicId?: string } | undefined;
  const serverPath = gtm?.serverContainerPath?.trim();
  const publicId = hosting?.serverContainerPublicId?.trim();
  if (!serverPath || !publicId) {
    return reply.code(400).send({
      message:
        "Server GTM container is not linked to this import yet. Create the server container (or paste the server container ID) first."
    });
  }

  try {
    const containerConfigBase64 = await buildSgtmContainerConfigBase64(auth, serverPath, publicId);
    const { taggingUrl } = await deployTaggingServerToCloudRun({
      auth,
      gcpProjectId: parsed.data.gcpProjectId,
      region: parsed.data.region,
      serviceId: parsed.data.serviceId,
      containerConfigBase64
    });

    const now = new Date().toISOString();
    const prevHosting = (item.hosting as Record<string, string>) ?? {};
    const nextHosting = {
      ...prevHosting,
      provider: normalizeHostingProvider("google_cloud"),
      serverTaggingUrl: taggingUrl,
      updatedAt: now
    };
    await ddbDoc.send(
      new PutCommand({
        TableName: env.DDB_TABLE_IMPORTS,
        Item: { ...item, hosting: nextHosting }
      })
    );

    return { taggingUrl, importId: parsed.data.importId, hosting: nextHosting };
  } catch (err) {
    app.log.error(err);
    const msg = err instanceof Error ? err.message : "Cloud Run deploy failed";
    const lower = msg.toLowerCase();
    const status =
      lower.includes("permission") || lower.includes("forbidden") || lower.includes("insufficient") ? 403 : 502;
    return reply.code(status).send({
      message:
        status === 403
          ? `${msg} Reconnect Google on the Containers screen — Cloud Run deploy needs the Google Cloud Platform scope (you may need to approve new permissions).`
          : msg
    });
  }
});

const gtmImportSchema = z.object({
  containerPath: z.string().min(1),
  workspaceId: z.string().optional()
});

const createServerContainerSchema = z.object({
  accountPath: z.string().regex(/^accounts\/[^/]+$/),
  name: z.string().min(1).max(256),
  importId: z.string().optional()
});

app.post("/gtm/import-container", async (req, reply) => {
  if (!requireGtmOAuthConfigured(reply)) return;
  const sessionId = getGtmSessionId(req);
  if (!sessionId) return reply.code(401).send({ message: "Missing x-gtm-session" });
  const auth = await getOAuthClientForSession(sessionId);
  if (!auth) return reply.code(401).send({ message: "Invalid GTM session" });

  const parsed = gtmImportSchema.safeParse(req.body ?? {});
  if (!parsed.success) return reply.code(400).send({ errors: parsed.error.issues });

  const tm = google.tagmanager({ version: "v2", auth });
  const containerPath = parsed.data.containerPath;

  try {
    const containerRes = await gtmCall(app.log, "containers.get", () => tm.accounts.containers.get({ path: containerPath }));
    const container = containerRes.data;

    app.log.info({
      containerPath,
      publicId: container.publicId,
      name: container.name
    }, "Container info");

    // Import from latest published version (live) by default, or specific workspace if provided
    let workspacePath: string | undefined;
    let isLiveVersion = false;

    if (parsed.data.workspaceId) {
      // User specified a workspace - use it (for testing/preview)
      workspacePath = `${containerPath}/workspaces/${parsed.data.workspaceId}`;
      app.log.info({ workspacePath }, "Using specified workspace");
    } else {
      // Default: Import from LIVE workspace (not published version)
      // GTM doesn't expose a direct "live version" API, and workspaces contain the latest state
      // The "Default Workspace" is typically workspace ID 1-3
      const workspaces = await gtmCall(app.log, "workspaces.list", () =>
        tm.accounts.containers.workspaces.list({ parent: containerPath })
      );

      app.log.info({
        workspaceCount: workspaces.data.workspace?.length || 0,
        workspaces: workspaces.data.workspace?.map(w => ({ name: w.name, id: w.workspaceId, path: w.path }))
      }, "Available workspaces");

      // Use the DEFAULT workspace (typically named "Default Workspace" or first one)
      const defaultWorkspace = workspaces.data.workspace?.find(w =>
        w.name?.toLowerCase().includes('default') || w.workspaceId === '1'
      ) || workspaces.data.workspace?.[0];

      if (defaultWorkspace?.path) {
        workspacePath = defaultWorkspace.path;
        app.log.info({
          workspacePath,
          workspaceName: defaultWorkspace.name,
          workspaceId: defaultWorkspace.workspaceId
        }, "Using default workspace");
      }
    }

    if (!workspacePath) return reply.code(400).send({ message: "No workspace or published version available for container" });

    // Sequential + small gaps: parallel .list calls spike quota ("Queries per minute per user").
    const staggerMs = 450;
    let tags, triggers, variables, folders, builtins;

    // Always import from workspace (not from version snapshot)
    tags = await gtmCall(app.log, "tags.list", () =>
      tm.accounts.containers.workspaces.tags.list({ parent: workspacePath })
    );

    app.log.info({
      workspacePath,
      tagCount: tags.data.tag?.length || 0,
      tagNames: tags.data.tag?.map(t => t.name) || []
    }, "Tags fetched from workspace");

    await delay(staggerMs);
    triggers = await gtmCall(app.log, "triggers.list", () =>
      tm.accounts.containers.workspaces.triggers.list({ parent: workspacePath })
    );
    await delay(staggerMs);
    variables = await gtmCall(app.log, "variables.list", () =>
      tm.accounts.containers.workspaces.variables.list({ parent: workspacePath })
    );
    await delay(staggerMs);
    folders = await gtmCall(app.log, "folders.list", () =>
      tm.accounts.containers.workspaces.folders.list({ parent: workspacePath })
    );
    await delay(staggerMs);
    builtins = await gtmCall(app.log, "built_in_variables.list", () =>
      tm.accounts.containers.workspaces.built_in_variables.list({ parent: workspacePath })
    );

    const payload = {
      kind: "gtm_export_v2",
      container,
      workspacePath,
      sourceType: "workspace",
      entities: {
        tags: tags.data.tag ?? [],
        triggers: triggers.data.trigger ?? [],
        variables: variables.data.variable ?? [],
        folders: folders.data.folder ?? [],
        builtInVariables: builtins.data.builtInVariable ?? []
      }
    };

    // Log import summary
    app.log.info({
      containerPath,
      workspacePath,
      sourceType: payload.sourceType,
      tagCount: payload.entities.tags.length,
      triggerCount: payload.entities.triggers.length,
      variableCount: payload.entities.variables.length,
      allTagNames: payload.entities.tags.map(t => t.name)
    }, "GTM container import summary");

    // Reuse existing import storage pipeline.
    const importId = ulid();
    const now = new Date().toISOString();
    const rawKey = `imports/${importId}.json`;
    const rawBody = JSON.stringify(payload);
    const organizationId = getOrganizationId(req);

    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: rawKey,
        Body: rawBody,
        ContentType: "application/json"
      })
    );

    await ddbDoc.send(
      new PutCommand({
        TableName: env.DDB_TABLE_IMPORTS,
        Item: {
          importId,
          organizationId,
          projectId: container.name ?? container.publicId ?? "gtm-container",
          sourceType: "gtm-web-container",
          rawBlobUri: `s3://${env.S3_BUCKET}/${rawKey}`,
          status: "uploaded",
          createdAt: now,
          gtm: {
            containerPath,
            workspacePath,
            sourceType: "workspace"
          }
        }
      })
    );

    metrics.importsCreated += 1;
    return reply.code(201).send({ importId, status: "uploaded" });
  } catch (err) {
    app.log.error(err);
    const status = isGtmQuotaError(err) ? 429 : 502;
    const raw = gtmErrorMessage(err);
    const message = isGtmQuotaError(err)
      ? `${raw} If this persists, wait 1–2 minutes and try again (Google Tag Manager API per-minute quota).`
      : raw;
    return reply.code(status).send({ message });
  }
});

app.post("/imports/gtm-web-container", async (req, reply) => {
  const parsed = importBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ errors: parsed.error.issues });
  }

  const importId = ulid();
  const now = new Date().toISOString();
  const rawKey = `imports/${importId}.json`;
  const rawBody = JSON.stringify(parsed.data.payload);

  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: rawKey,
      Body: rawBody,
      ContentType: "application/json"
    })
  );

  await ddbDoc.send(
    new PutCommand({
      TableName: env.DDB_TABLE_IMPORTS,
      Item: {
        importId,
        projectId: parsed.data.projectId,
        sourceType: parsed.data.sourceType,
        rawBlobUri: `s3://${env.S3_BUCKET}/${rawKey}`,
        status: "uploaded",
        createdAt: now
      }
    })
  );

  metrics.importsCreated += 1;
  return reply.code(201).send({
    importId,
    status: "uploaded"
  });
});

app.get("/imports", async () => {
  try {
    const res = await ddbDoc.send(
      new ScanCommand({
        TableName: env.DDB_TABLE_IMPORTS
      })
    );
    const items = (res.Items ?? []).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    return { items };
  } catch (err) {
    if (isDdbResourceNotFound(err)) return { items: [] };
    throw err;
  }
});

app.get("/imports/:importId", async (req, reply) => {
  const importId = (req.params as { importId: string }).importId;
  const found = await ddbDoc.send(
    new GetCommand({
      TableName: env.DDB_TABLE_IMPORTS,
      Key: { importId }
    })
  );
  if (!found.Item) return reply.code(404).send({ message: "Import not found" });
  return found.Item;
});

app.delete("/imports/:importId", async (req, reply) => {
  const importId = (req.params as { importId: string }).importId;

  try {
    // Delete the import record from DynamoDB
    await ddbDoc.send(
      new DeleteCommand({
        TableName: env.DDB_TABLE_IMPORTS,
        Key: { importId }
      })
    );

    app.log.info({ importId }, "Deleted import");
    return { success: true, importId };
  } catch (err) {
    app.log.error({ err, importId }, "Failed to delete import");
    return reply.code(500).send({ message: "Failed to delete import" });
  }
});

app.get("/imports/:importId/hosting-guide", async (req, reply) => {
  const importId = (req.params as { importId: string }).importId;
  const q = req.query as { provider?: string };
  const found = await ddbDoc.send(
    new GetCommand({
      TableName: env.DDB_TABLE_IMPORTS,
      Key: { importId }
    })
  );
  if (!found.Item) return reply.code(404).send({ message: "Import not found" });

  const fromItem = (found.Item as { hosting?: { provider?: string } }).hosting?.provider;
  const provider: HostingProvider = normalizeHostingProvider(q.provider ?? fromItem ?? "undecided");
  const guide = hostingGuideFor(provider, {
    webContainerLabel: String(found.Item.projectId ?? "your web GTM container")
  });
  return {
    hosting: (found.Item as { hosting?: unknown }).hosting ?? null,
    guide
  };
});

app.get("/imports/:importId/container-status", async (req, reply) => {
  const importId = (req.params as { importId: string }).importId;

  const found = await ddbDoc.send(
    new GetCommand({
      TableName: env.DDB_TABLE_IMPORTS,
      Key: { importId }
    })
  );
  if (!found.Item) return reply.code(404).send({ message: "Import not found" });

  const item = found.Item as Record<string, unknown>;
  const ctx: ProvisioningContext = {
    importId,
    projectId: String(item.projectId ?? "unknown"),
    hosting: item.hosting as Record<string, unknown> | undefined,
    gtm: item.gtm as Record<string, unknown> | undefined
  };

  const result = await verifyContainerProvisioning(ctx);
  const guide = buildProvisioningGuide(result);

  return {
    ...result,
    guide
  };
});

app.patch("/imports/:importId/hosting", async (req, reply) => {
  const importId = (req.params as { importId: string }).importId;
  const parsed = patchHostingSchema.safeParse(req.body ?? {});
  if (!parsed.success) return reply.code(400).send({ errors: parsed.error.issues });

  const found = await ddbDoc.send(
    new GetCommand({
      TableName: env.DDB_TABLE_IMPORTS,
      Key: { importId }
    })
  );
  if (!found.Item) return reply.code(404).send({ message: "Import not found" });

  const item = found.Item as Record<string, unknown>;
  const prev = (item.hosting as Record<string, string | undefined> | undefined) ?? {};
  const now = new Date().toISOString();
  const next: Record<string, string> = { ...prev } as Record<string, string>;

  if (parsed.data.provider !== undefined) {
    next.provider = normalizeHostingProvider(parsed.data.provider);
  }

  const assignOrDelete = (key: "serverContainerPublicId" | "serverTaggingUrl" | "notes", val: string | undefined) => {
    if (val === undefined) return;
    const t = val.trim();
    if (t === "") delete next[key];
    else next[key] = key === "serverTaggingUrl" ? val.trim() : t;
  };

  if (parsed.data.serverContainerPublicId !== undefined) {
    assignOrDelete("serverContainerPublicId", parsed.data.serverContainerPublicId);
  }
  if (parsed.data.serverTaggingUrl !== undefined) {
    assignOrDelete("serverTaggingUrl", parsed.data.serverTaggingUrl);
  }
  if (parsed.data.notes !== undefined) {
    assignOrDelete("notes", parsed.data.notes);
  }
  if (parsed.data.customDomain !== undefined) {
    const v = parsed.data.customDomain.trim();
    if (v === "") delete next.customDomain;
    else next.customDomain = v;
  }
  if (parsed.data.dnsSetupCompletedAt !== undefined) {
    const v = parsed.data.dnsSetupCompletedAt.trim();
    if (v === "") delete next.dnsSetupCompletedAt;
    else next.dnsSetupCompletedAt = v;
  }
  if (parsed.data.dnsSetupMode !== undefined) {
    const v = parsed.data.dnsSetupMode;
    if (v === "") delete next.dnsSetupMode;
    else next.dnsSetupMode = v;
  }

  next.updatedAt = now;
  if (!next.provider) next.provider = "undecided";

  await ddbDoc.send(
    new PutCommand({
      TableName: env.DDB_TABLE_IMPORTS,
      Item: { ...item, hosting: next }
    })
  );

  return { hosting: next };
});

app.get("/migrations", async (req) => {
  const query = req.query as { organizationId?: string };
  try {
    const res = await ddbDoc.send(
      new ScanCommand({
        TableName: env.DDB_TABLE_RUNS
      })
    );
    let items = res.Items ?? [];

    // Filter by organizationId if provided
    if (query.organizationId) {
      items = items.filter((item) => item.organizationId === query.organizationId);
    }

    // Sort by createdAt descending
    items.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

    return { items };
  } catch (err) {
    if (isDdbResourceNotFound(err)) return { items: [] };
    throw err;
  }
});

app.post("/migrations/:importId/run", async (req, reply) => {
  const importId = (req.params as { importId: string }).importId;
  const parsed = runBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return reply.code(400).send({ errors: parsed.error.issues });
  }

  const foundImport = await ddbDoc.send(
    new GetCommand({
      TableName: env.DDB_TABLE_IMPORTS,
      Key: { importId }
    })
  );
  if (!foundImport.Item) {
    return reply.code(404).send({ message: "Import not found" });
  }

  const host = (foundImport.Item as { hosting?: Record<string, string | undefined> }).hosting;
  const prov = normalizeHostingProvider(host?.provider ?? "undecided");
  if (
    prov === "google_cloud" &&
    host?.serverTaggingUrl?.trim() &&
    !host?.dnsSetupCompletedAt?.trim()
  ) {
    return reply.code(400).send({
      message:
        "Complete the DNS / domain step in Migration Hub first (confirm Route 53 mapping or choose default Cloud Run URL only)."
    });
  }

  const runId = ulid();
  const idempotencyKey = parsed.data.idempotencyKey ?? `${importId}:${parsed.data.rulesetVersion}`;
  const now = new Date().toISOString();

  // Idempotency protection: if an identical run key exists, return it.
  const existing = await ddbDoc.send(
    new GetCommand({
      TableName: env.DDB_TABLE_RUNS,
      Key: { runId: idempotencyKey }
    })
  );
  if (existing.Item) {
    return reply.send({ runId: existing.Item.runRef, status: existing.Item.status });
  }

  await ddbDoc.send(
    new PutCommand({
      TableName: env.DDB_TABLE_RUNS,
      Item: {
        runId,
        importId,
        organizationId: foundImport.Item.organizationId,
        projectId: foundImport.Item.projectId,
        status: "queued",
        rulesetVersion: parsed.data.rulesetVersion,
        containerProvisioningStatus: "pending",
        confidenceScore: null,
        summaryCounts: { mappings: 0, warnings: 0, manualActions: 0 },
        createdAt: now,
        updatedAt: now
      }
    })
  );

  // Store idempotency record.
  await ddbDoc.send(
    new PutCommand({
      TableName: env.DDB_TABLE_RUNS,
      Item: {
        runId: idempotencyKey,
        runRef: runId,
        status: "queued",
        createdAt: now
      }
    })
  );

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({
        runId,
        importId,
        projectId: foundImport.Item.projectId,
        rulesetVersion: parsed.data.rulesetVersion
      })
    })
  );

  metrics.runsQueued += 1;
  return reply.code(202).send({ runId, status: "queued" });
});

app.get("/runs", async () => {
  try {
    const res = await ddbDoc.send(
      new ScanCommand({
        TableName: env.DDB_TABLE_RUNS,
        FilterExpression: "attribute_not_exists(runRef)"
      })
    );
    const items = (res.Items ?? []).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    return { items };
  } catch (err) {
    if (isDdbResourceNotFound(err)) return { items: [] };
    throw err;
  }
});

app.get("/migrations/:runId", async (req, reply) => {
  const runId = (req.params as { runId: string }).runId;
  const run = await ddbDoc.send(
    new GetCommand({
      TableName: env.DDB_TABLE_RUNS,
      Key: { runId }
    })
  );
  if (!run.Item) return reply.code(404).send({ message: "Run not found" });
  return run.Item;
});

app.delete("/migrations/:runId", async (req, reply) => {
  const runId = (req.params as { runId: string }).runId;

  // Get the run to check if it exists
  const run = await ddbDoc.send(
    new GetCommand({
      TableName: env.DDB_TABLE_RUNS,
      Key: { runId }
    })
  );

  if (!run.Item) return reply.code(404).send({ message: "Run not found" });

  // Delete the run record
  await ddbDoc.send(
    new DeleteCommand({
      TableName: env.DDB_TABLE_RUNS,
      Key: { runId }
    })
  );

  // Note: S3 artifacts are not deleted to preserve audit trail
  // They can be cleaned up separately with a lifecycle policy

  return { message: "Migration deleted successfully", runId };
});

app.get("/migrations/:runId/report", async (req, reply) => {
  const runId = (req.params as { runId: string }).runId;
  const run = await ddbDoc.send(
    new GetCommand({
      TableName: env.DDB_TABLE_RUNS,
      Key: { runId }
    })
  );
  if (!run.Item) return reply.code(404).send({ message: "Run not found" });

  const raw = await s3ReadObjectText(`runs/${runId}/report.json`);
  if (raw) {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* fall through */
    }
  }

  return {
    runId,
    executiveSummary: "Migration report not available yet, or the worker run failed before writing artifacts.",
    confidenceScore: run.Item.confidenceScore ?? 0,
    complianceFlags: { notes: [], piiRisk: "low", consentModeRecommended: true, piiFieldsSample: [] },
    manualActions: run.Item.manualActions ?? [],
    parityMatrix: [],
    summaryCounts: run.Item.summaryCounts ?? { mappings: 0, warnings: 0, manualActions: 0 },
    status: run.Item.status
  };
});

// Debug endpoint to list all tags in a workspace and show their types
app.get("/gtm/debug/tags", async (req, reply) => {
  const gtmSession = (req.query as any)?.gtmSession;
  const workspacePath = (req.query as any)?.workspacePath;

  if (!gtmSession || !workspacePath) {
    return reply.code(400).send({ message: "gtmSession and workspacePath required" });
  }

  const session = await getGtmSession(gtmSession);
  if (!session?.tokens?.access_token) {
    return reply.code(401).send({ message: "Invalid or expired GTM session" });
  }

  const auth = new google.auth.OAuth2();
  const credentials = {
    access_token: session.tokens.access_token,
    refresh_token: session.tokens.refresh_token,
    expiry_date: session.tokens.expiry_date,
    token_type: session.tokens.token_type,
    id_token: session.tokens.id_token,
    scope: session.tokens.scope || undefined
  };
  auth.setCredentials(credentials);

  try {
    const tm = google.tagmanager({ version: "v2", auth });

    // List all tags
    const tagsRes = await tm.accounts.containers.workspaces.tags.list({
      parent: workspacePath
    });

    const tags = (tagsRes.data.tag || []).map((tag: any) => ({
      name: tag.name,
      type: tag.type,
      tagId: tag.tagId,
      paused: tag.paused,
      parameters: tag.parameter?.map((p: any) => ({
        key: p.key,
        type: p.type,
        value: p.value
      }))
    }));

    // List all templates (custom templates)
    const templatesRes = await tm.accounts.containers.workspaces.templates.list({
      parent: workspacePath
    });

    const templates = (templatesRes.data.template || []).map((t: any) => ({
      name: t.name,
      fingerprint: t.fingerprint,
      templateId: t.templateId
    }));

    // List all triggers
    const triggersRes = await tm.accounts.containers.workspaces.triggers.list({
      parent: workspacePath
    });

    const triggers = (triggersRes.data.trigger || []).map((t: any) => ({
      name: t.name,
      type: t.type,
      triggerId: t.triggerId
    }));

    return {
      workspacePath,
      tags,
      templates,
      triggers,
      summary: {
        totalTags: tags.length,
        totalTemplates: templates.length,
        totalTriggers: triggers.length,
        tagTypes: [...new Set(tags.map((t: any) => t.type))],
        triggerTypes: [...new Set(triggers.map((t: any) => t.type))]
      }
    };
  } catch (err: any) {
    app.log.error(err);
    return reply.code(502).send({ message: "Failed to list tags", error: err.message });
  }
});

app.post("/migrations/:runId/deploy-approved-v2", async (req, reply) => {
  if (!requireGtmOAuthConfigured(reply)) return;
  const sessionId = getGtmSessionId(req);
  if (!sessionId) return reply.code(401).send({ message: "Missing x-gtm-session" });
  const auth = await getOAuthClientForSession(sessionId);
  if (!auth) return reply.code(401).send({ message: "Invalid GTM session" });

  const runId = (req.params as { runId: string }).runId;
  const {
    approvedTagIds,
    clientContainerPath,
    clientWorkspacePath,
    serverContainerPath,
    transport_url,
    metaAccessToken
  } = req.body as {
    approvedTagIds: string[];
    clientContainerPath: string;
    clientWorkspacePath: string;
    serverContainerPath: string;
    transport_url: string;
    metaAccessToken?: string;
  };

  // Validate required fields
  if (!approvedTagIds || !Array.isArray(approvedTagIds) || approvedTagIds.length === 0) {
    return reply.code(400).send({ message: "approvedTagIds array required" });
  }

  if (!clientContainerPath || typeof clientContainerPath !== "string") {
    return reply.code(400).send({ message: "clientContainerPath required (e.g., accounts/123/containers/456)" });
  }

  if (!clientWorkspacePath || typeof clientWorkspacePath !== "string") {
    return reply.code(400).send({ message: "clientWorkspacePath required (e.g., accounts/123/containers/456/workspaces/7)" });
  }

  if (!serverContainerPath || typeof serverContainerPath !== "string") {
    return reply.code(400).send({ message: "serverContainerPath required" });
  }

  if (!transport_url || typeof transport_url !== "string") {
    return reply.code(400).send({ message: "transport_url required (e.g. https://your-sgtm.example.com)" });
  }

  // Get the migration report
  const raw = await s3ReadObjectText(`runs/${runId}/report.json`);
  if (!raw) {
    return reply.code(404).send({ message: "Migration report not found" });
  }

  const report = JSON.parse(raw) as any;

  // Get approved tags from report
  const containerTagsMap = new Map();
  if (report.containerElements?.tags) {
    for (const tag of report.containerElements.tags) {
      containerTagsMap.set(tag.tagId, tag);
    }
  }

  const approvedTags = approvedTagIds
    .map(id => containerTagsMap.get(id))
    .filter(Boolean);

  if (approvedTags.length === 0) {
    return reply.code(400).send({ message: "No valid tags found for approved IDs" });
  }

  // Group tags by category for consolidation
  function getTagCategory(tagType: string): string | null {
    if (['gaawe', 'googtag', 'gaawc'].includes(tagType)) return 'ga4';
    if (['awct', 'sp'].includes(tagType)) return 'googads';
    if (tagType.startsWith('cvt_')) return 'meta'; // Custom Variable Template (Meta Pixel)
    return null;
  }

  const tagsByCategory = new Map<string, any[]>();
  for (const tag of approvedTags) {
    const category = getTagCategory(tag.type);
    if (category) {
      if (!tagsByCategory.has(category)) {
        tagsByCategory.set(category, []);
      }
      tagsByCategory.get(category)!.push(tag);
    }
  }

  app.log.info({
    approvedCount: approvedTags.length,
    categories: Array.from(tagsByCategory.keys())
  }, 'Starting async deployment');

  // Mark deployment as in-progress
  await ddbDoc.send(
    new UpdateCommand({
      TableName: env.DDB_TABLE_RUNS,
      Key: { runId },
      UpdateExpression: "SET deploymentStatus = :status, deploymentStartedAt = :timestamp",
      ExpressionAttributeValues: {
        ":status": "deploying",
        ":timestamp": new Date().toISOString()
      }
    })
  );

  // Return 202 immediately, then process deployment synchronously
  // Lambda has 5min timeout, API Gateway will timeout at 30s but Lambda continues
  reply.code(202).send({
    message: "Deployment started",
    status: "deploying",
    runId,
    approvedTagIds
  });

  // Process deployment synchronously (Lambda continues after response sent)
  try {
    const { deployMigrationWithExportImport } = await import('./gtm-migration-deploy.js');

    const result = await deployMigrationWithExportImport(
      auth,
      {
        clientContainerPath,
        clientWorkspacePath,
        serverContainerPath,
        serverContainerUrl: transport_url,
        approvedTagIds,
        tagsByType: tagsByCategory,
        metaAccessToken
      },
      app.log
    );

    // Save successful deployment
    await ddbDoc.send(
      new UpdateCommand({
        TableName: env.DDB_TABLE_RUNS,
        Key: { runId },
        UpdateExpression: "SET deploymentHistory = list_append(if_not_exists(deploymentHistory, :empty), :deployment), lastDeployedAt = :timestamp, deploymentStatus = :status, deploymentCompletedAt = :completed",
        ExpressionAttributeValues: {
          ":empty": [],
          ":deployment": [{
            timestamp: new Date().toISOString(),
            deployed: result.serverTagsCreated.length,
            tagsModified: result.tagsModified,
            clientWorkspacePath: result.clientWorkspacePath,
            clientWorkspaceName: result.clientWorkspaceName,
            serverWorkspacePath: result.serverWorkspacePath,
            serverWorkspaceName: result.serverWorkspaceName,
            serverContainerUrl: transport_url,
            serverTags: result.serverTagsCreated,
            deployedTagIds: approvedTagIds,
            success: true
          }],
          ":timestamp": new Date().toISOString(),
          ":status": "completed",
          ":completed": new Date().toISOString()
        }
      })
    );

    app.log.info({ runId, deployed: result.tagsModified }, 'Deployment completed successfully');
  } catch (err) {
    app.log.error({ err, runId }, 'Deployment failed');
    const message = err instanceof Error ? err.message : 'Deployment failed';

    // Save failed deployment
    await ddbDoc.send(
      new UpdateCommand({
        TableName: env.DDB_TABLE_RUNS,
        Key: { runId },
        UpdateExpression: "SET deploymentHistory = list_append(if_not_exists(deploymentHistory, :empty), :deployment), deploymentStatus = :status, deploymentCompletedAt = :completed, deploymentError = :error",
        ExpressionAttributeValues: {
          ":empty": [],
          ":deployment": [{
            timestamp: new Date().toISOString(),
            deployed: 0,
            failed: approvedTagIds.length,
            error: message,
            success: false
          }],
          ":status": "failed",
          ":completed": new Date().toISOString(),
          ":error": message
        }
      })
    );
  }
});

// Keep old endpoint for backwards compatibility
// DEPRECATED: Use /migrations/:runId/deploy-approved-v2 instead
// This endpoint tries to auto-fetch clientContainerPath from import record,
// but it's more reliable to pass it explicitly (as v2 does).
// Keeping this for backwards compatibility, but will be removed in future.
app.post("/migrations/:runId/deploy-approved", async (req, reply) => {
  return reply.code(410).send({
    message: "This endpoint is deprecated. Use /migrations/:runId/deploy-approved-v2 instead.",
    error: "DEPRECATED_ENDPOINT",
    suggestion: "Update your client to use /migrations/:runId/deploy-approved-v2 with explicit clientContainerPath and clientWorkspacePath parameters."
  });
});

app.post("/migrations/:runId/deploy-variables", async (req, reply) => {
  if (!requireGtmOAuthConfigured(reply)) return;
  const sessionId = getGtmSessionId(req);
  if (!sessionId) return reply.code(401).send({ message: "Missing x-gtm-session" });
  const auth = await getOAuthClientForSession(sessionId);
  if (!auth) return reply.code(401).send({ message: "Invalid GTM session" });

  const runId = (req.params as { runId: string }).runId;
  const { approvedVariableIds, serverContainerPath } = req.body as {
    approvedVariableIds: string[];
    serverContainerPath: string;
  };

  if (!approvedVariableIds || !Array.isArray(approvedVariableIds) || approvedVariableIds.length === 0) {
    return reply.code(400).send({ message: "approvedVariableIds array required" });
  }

  if (!serverContainerPath || typeof serverContainerPath !== "string") {
    return reply.code(400).send({ message: "serverContainerPath required" });
  }

  // Get the migration report
  const raw = await s3ReadObjectText(`runs/${runId}/report.json`);
  if (!raw) {
    return reply.code(404).send({ message: "Migration report not found" });
  }

  const report = JSON.parse(raw) as any;

  // Check if report has variable mappings
  if (!report.variableMappings || !report.containerElements?.variables) {
    return reply.code(400).send({ message: "No variable mappings found in this migration report" });
  }

  // Get full container variables
  const containerVariablesMap = new Map();
  if (report.containerElements?.variables) {
    for (const variable of report.containerElements.variables) {
      containerVariablesMap.set(variable.variableId, variable);
    }
  }

  // Filter approved variables
  const approvedVariables: any[] = [];
  for (const variableId of approvedVariableIds) {
    const variable = containerVariablesMap.get(variableId);
    if (variable) {
      approvedVariables.push(variable);
    }
  }

  if (approvedVariables.length === 0) {
    return reply.code(400).send({ message: "No approved variables found" });
  }

  const tm = google.tagmanager({ version: "v2", auth });
  const deployedVariables: any[] = [];
  const errors: any[] = [];

  // Get or create workspace
  let workspacePath: string;
  const WORKSPACE_NAME = "Tag Relay Migration";

  try {
    // Always start with a clean workspace - delete any previous Tag Relay workspaces
    const workspaces = await gtmCall(app.log, "workspaces.list", () =>
      tm.accounts.containers.workspaces.list({
        parent: serverContainerPath
      })
    );

    // Delete all existing Tag Relay workspaces to abandon unpublished changes
    const tagRelayWorkspaces = workspaces.data.workspace?.filter((w: any) =>
      w.name?.startsWith("Tag Relay")
    ) || [];

    if (tagRelayWorkspaces.length > 0) {
      app.log.info({
        count: tagRelayWorkspaces.length,
        names: tagRelayWorkspaces.map((w: any) => w.name)
      }, "Deleting existing Tag Relay workspaces to start fresh");

      // Delete all old workspaces - MUST succeed before creating new one
      for (const ws of tagRelayWorkspaces) {
        if (ws.path) {
          app.log.info({ workspacePath: ws.path, workspaceName: ws.name }, "Deleting workspace");

          // Retry deletion up to 3 times if it fails
          let deleteSuccess = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              await gtmCall(app.log, "workspaces.delete", () =>
                tm.accounts.containers.workspaces.delete({
                  path: ws.path!
                })
              );
              app.log.info({ workspaceName: ws.name, attempt }, "Workspace deleted successfully");
              deleteSuccess = true;
              break;
            } catch (deleteErr) {
              if (attempt < 3) {
                app.log.warn({
                  err: deleteErr,
                  workspaceName: ws.name,
                  attempt
                }, "Workspace deletion failed, retrying...");
                // Wait 1 second before retry to let GTM API settle
                await new Promise(resolve => setTimeout(resolve, 1000));
              } else {
                app.log.error({
                  err: deleteErr,
                  workspaceName: ws.name
                }, "Failed to delete workspace after 3 attempts");
                // If deletion fails after retries, throw error
                return reply.code(502).send({
                  message: "Failed to delete existing workspace. Please manually delete the 'Tag Relay Migration' workspace in GTM and try again.",
                  error: gtmErrorMessage(deleteErr),
                  workspacePath: ws.path
                });
              }
            }
          }
        }
      }

      // Wait a moment after all deletions to let GTM API settle
      app.log.info("Waiting for GTM API to settle after deletions...");
      await new Promise(resolve => setTimeout(resolve, 1500));
    } else {
      app.log.info("No existing Tag Relay workspaces found");
    }

    // Create a fresh workspace for this deployment
    app.log.info({ workspaceName: WORKSPACE_NAME }, "Creating new workspace");
    const created = await gtmCall(app.log, "workspaces.create", () =>
      tm.accounts.containers.workspaces.create({
        parent: serverContainerPath,
        requestBody: {
          name: WORKSPACE_NAME,
          description: "Automated server-side migration workspace created by Tag Relay"
        }
      })
    );
    workspacePath = created.data.path!;
    app.log.info({ workspacePath, workspaceName: WORKSPACE_NAME }, "Created fresh workspace for deployment");
  } catch (err) {
    app.log.error({ err }, "Failed to create workspace");
    return reply.code(502).send({ message: "Failed to create clean workspace", error: gtmErrorMessage(err) });
  }

  // Sort variables by dependency order (constants first, then data layer, etc.)
  const sortedVariables = sortVariablesByDependency(approvedVariables);

  // Deploy variables in order
  for (const clientVariable of sortedVariables) {
    try {
      app.log.info({
        variableName: clientVariable.name,
        variableId: clientVariable.variableId,
        clientType: clientVariable.type
      }, "Processing variable for deployment");

      // Build server variable configuration
      const result = buildServerVariableFromClient(clientVariable);
      const variableRequestBody = result.config;

      if (!result.canDeploy || variableRequestBody == null) {
        errors.push({
          clientVariableId: clientVariable.variableId,
          clientVariableName: clientVariable.name,
          error: result.reason || "Cannot deploy this variable type to server-side"
        });
        app.log.warn({ clientVariable: clientVariable.name, reason: result.reason }, "Variable cannot be deployed");
        continue;
      }

      // Create the variable in server workspace
      const created = await gtmCall(app.log, "variables.create", () =>
        tm.accounts.containers.workspaces.variables.create({
          parent: workspacePath,
          requestBody: variableRequestBody
        })
      );

      deployedVariables.push({
        clientVariableId: clientVariable.variableId,
        clientVariableName: clientVariable.name,
        serverVariableId: created.data.variableId,
        serverVariablePath: created.data.path,
        serverType: result.serverType,
        status: 'deployed'
      });

      app.log.info({ variableId: created.data.variableId }, `Deployed variable: ${clientVariable.name}`);
    } catch (err) {
      app.log.error({ err, variable: clientVariable.name }, "Failed to create variable");
      errors.push({
        clientVariableId: clientVariable.variableId,
        clientVariableName: clientVariable.name,
        error: gtmErrorMessage(err)
      });
    }
  }

  return {
    runId,
    workspacePath,
    deployed: deployedVariables.length,
    failed: errors.length,
    deployedVariables,
    errors,
    nextSteps: [
      `Open your GTM server container workspace: ${workspacePath}`,
      "Review deployed variables and verify configurations",
      "Deploy tags that reference these variables",
      "Test in GTM Preview mode",
      "Publish the workspace when ready"
    ]
  };
});

app.get("/migrations/:runId/artifacts", async (req, reply) => {
  const runId = (req.params as { runId: string }).runId;
  const base = `s3://${env.S3_BUCKET}/runs/${runId}`;
  return {
    runId,
    artifacts: [
      { kind: "report_json", uri: `${base}/report.json` },
      { kind: "report_md", uri: `${base}/report.md` },
      { kind: "server_blueprint", uri: `${base}/server_blueprint.json` }
    ]
  };
});

async function ensureArtifactsBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    return;
  } catch {
    // Bucket missing or HeadBucket not allowed — try create (typical for fresh LocalStack).
  }
  try {
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    app.log.info({ bucket: env.S3_BUCKET }, "Created S3 artifacts bucket");
  } catch (err: unknown) {
    const n = (err as { name?: string }).name;
    if (n === "BucketAlreadyOwnedByYou" || n === "BucketAlreadyExists") return;
    app.log.warn(
      { err, bucket: env.S3_BUCKET, hint: "Create the bucket or run infra/localstack/init.sh" },
      "Could not auto-create S3 bucket"
    );
  }
}

await ensureArtifactsBucket();

return app;
}
