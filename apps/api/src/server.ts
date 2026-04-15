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
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
    scope?: string | null;
    token_type?: string | null;
    id_token?: string | null;
  };
  createdAt: number;
  returnUrl?: string;
};

const gtmSessions = new Map<string, GtmSession>();

/**
 * GTM + list GCP projects + deploy tagging server to Cloud Run in the user's project (cloud-platform).
 * Users must reconnect Google after adding cloud-platform.
 */
const GTM_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
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

function getOAuthClientForSession(sessionId: string) {
  const session = gtmSessions.get(sessionId);
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
  gtmSessions.set(sessionId, { tokens: {}, createdAt: Date.now(), returnUrl });
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
  const existingSession = gtmSessions.get(state);
  if (!existingSession) {
    return reply.code(400).send({ message: "Invalid state" });
  }

  const clientId = (env.GTM_OAUTH_CLIENT_ID ?? env.GOOGLE_OAUTH_CLIENT_ID)!;
  const clientSecret = (env.GTM_OAUTH_CLIENT_SECRET ?? env.GOOGLE_OAUTH_CLIENT_SECRET)!;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, gtmOAuthRedirectUri!);
  const { tokens } = await oauth2.getToken(String(code));
  gtmSessions.set(state, { tokens, createdAt: Date.now(), returnUrl: existingSession.returnUrl });

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

    gtmSessions.set(sessionId, {
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: expiryDate
      },
      createdAt: Date.now(),
      returnUrl: '/'
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
  const auth = getOAuthClientForSession(sessionId);
  if (!auth) return reply.code(401).send({ message: "Invalid GTM session" });

  const tm = google.tagmanager({ version: "v2", auth });
  const res = await tm.accounts.list();
  return { accounts: res.data.account ?? [] };
});

app.get("/gtm/containers", async (req, reply) => {
  if (!requireGtmOAuthConfigured(reply)) return;
  const sessionId = getGtmSessionId(req);
  if (!sessionId) return reply.code(401).send({ message: "Missing x-gtm-session" });
  const auth = getOAuthClientForSession(sessionId);
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
  const auth = getOAuthClientForSession(sessionId);
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
  const auth = getOAuthClientForSession(sessionId);
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
  const auth = getOAuthClientForSession(sessionId);
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
  const auth = getOAuthClientForSession(sessionId);
  if (!auth) return reply.code(401).send({ message: "Invalid GTM session" });

  const parsed = gtmImportSchema.safeParse(req.body ?? {});
  if (!parsed.success) return reply.code(400).send({ errors: parsed.error.issues });

  const tm = google.tagmanager({ version: "v2", auth });
  const containerPath = parsed.data.containerPath;

  try {
    const containerRes = await gtmCall(app.log, "containers.get", () => tm.accounts.containers.get({ path: containerPath }));
    const container = containerRes.data;

    // Default to first workspace if not provided.
    let workspacePath: string | undefined;
    if (parsed.data.workspaceId) {
      workspacePath = `${containerPath}/workspaces/${parsed.data.workspaceId}`;
    } else {
      const workspaces = await gtmCall(app.log, "workspaces.list", () =>
        tm.accounts.containers.workspaces.list({ parent: containerPath })
      );
      const first = workspaces.data.workspace?.[0];
      if (first?.path) workspacePath = first.path;
    }
    if (!workspacePath) return reply.code(400).send({ message: "No workspace available for container" });

    // Sequential + small gaps: parallel .list calls spike quota ("Queries per minute per user").
    const staggerMs = 450;
    const tags = await gtmCall(app.log, "tags.list", () => tm.accounts.containers.workspaces.tags.list({ parent: workspacePath }));
    await delay(staggerMs);
    const triggers = await gtmCall(app.log, "triggers.list", () =>
      tm.accounts.containers.workspaces.triggers.list({ parent: workspacePath })
    );
    await delay(staggerMs);
    const variables = await gtmCall(app.log, "variables.list", () =>
      tm.accounts.containers.workspaces.variables.list({ parent: workspacePath })
    );
    await delay(staggerMs);
    const folders = await gtmCall(app.log, "folders.list", () =>
      tm.accounts.containers.workspaces.folders.list({ parent: workspacePath })
    );
    await delay(staggerMs);
    const builtins = await gtmCall(app.log, "built_in_variables.list", () =>
      tm.accounts.containers.workspaces.built_in_variables.list({ parent: workspacePath })
    );

    const payload = {
      kind: "gtm_export_v2",
      container,
      workspacePath,
      entities: {
        tags: tags.data.tag ?? [],
        triggers: triggers.data.trigger ?? [],
        variables: variables.data.variable ?? [],
        folders: folders.data.folder ?? [],
        builtInVariables: builtins.data.builtInVariable ?? []
      }
    };

    // DEBUG: Log first tag to see if firingTriggerId exists
    if (tags.data.tag && tags.data.tag.length > 0) {
      const firstTag = tags.data.tag[0];
      app.log.info({
        tagName: firstTag.name,
        tagId: firstTag.tagId,
        firingTriggerId: firstTag.firingTriggerId,
        hasFiringTriggerId: 'firingTriggerId' in firstTag
      }, "DEBUG: First tag structure");
    }

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
          gtm: { containerPath, workspacePath }
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

  const session = gtmSessions.get(gtmSession);
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
  const auth = getOAuthClientForSession(sessionId);
  if (!auth) return reply.code(401).send({ message: "Invalid GTM session" });

  const runId = (req.params as { runId: string }).runId;
  const {
    approvedTagIds,
    clientContainerPath,
    clientWorkspacePath,
    serverContainerPath,
    server_container_url
  } = req.body as {
    approvedTagIds: string[];
    clientContainerPath: string;
    clientWorkspacePath: string;
    serverContainerPath: string;
    server_container_url: string;
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

  if (!server_container_url || typeof server_container_url !== "string") {
    return reply.code(400).send({ message: "server_container_url required (e.g. https://your-sgtm.example.com)" });
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
  }, 'Deploying migration');

  try {
    const { deployMigrationWithExportImport } = await import('./gtm-migration-deploy.js');

    const result = await deployMigrationWithExportImport(
      auth,
      {
        clientContainerPath,
        clientWorkspacePath,
        serverContainerPath,
        serverContainerUrl: server_container_url,
        approvedTagIds,
        tagsByType: tagsByCategory
      },
      app.log
    );

    // Save deployment record to DynamoDB
    await ddbDoc.send(
      new UpdateCommand({
        TableName: env.DDB_TABLE_RUNS,
        Key: { runId },
        UpdateExpression: "SET deploymentHistory = list_append(if_not_exists(deploymentHistory, :empty), :deployment), lastDeployedAt = :timestamp",
        ExpressionAttributeValues: {
          ":empty": [],
          ":deployment": [{
            timestamp: new Date().toISOString(),
            deployed: result.serverTagsCreated.length,
            tagsModified: result.tagsModified,
            clientWorkspacePath: result.clientWorkspacePath,
            serverWorkspacePath: result.serverWorkspacePath,
            serverContainerUrl: server_container_url
          }],
          ":timestamp": new Date().toISOString()
        }
      })
    );

    return {
      success: true,
      clientWorkspace: {
        path: result.clientWorkspacePath,
        name: result.clientWorkspaceName,
        tagsModified: result.tagsModified
      },
      serverWorkspace: {
        path: result.serverWorkspacePath,
        name: result.serverWorkspaceName,
        tags: result.serverTagsCreated
      },
      nextSteps: [
        `✅ Client container: ${result.tagsModified} tags modified with server routing`,
        `   → Workspace: "${result.clientWorkspaceName}"`,
        `   → URL: https://tagmanager.google.com/#${result.clientWorkspacePath}`,
        '',
        `✅ Server container: ${result.serverTagsCreated.length} consolidated tags created`,
        `   → Workspace: "${result.serverWorkspaceName}"`,
        `   → URL: https://tagmanager.google.com/#${result.serverWorkspacePath}`,
        '',
        '📋 Next Steps:',
        '1. Review both workspaces in GTM',
        '2. Test in Preview mode',
        '3. Publish when ready'
      ]
    };
  } catch (err) {
    app.log.error({ err }, 'Deployment failed');
    const message = err instanceof Error ? err.message : 'Deployment failed';
    return reply.code(502).send({ message });
  }
});

// Keep old endpoint for backwards compatibility
app.post("/migrations/:runId/deploy-approved", async (req, reply) => {
  if (!requireGtmOAuthConfigured(reply)) return;
  const sessionId = getGtmSessionId(req);
  if (!sessionId) return reply.code(401).send({ message: "Missing x-gtm-session" });
  const auth = getOAuthClientForSession(sessionId);
  if (!auth) return reply.code(401).send({ message: "Invalid GTM session" });

  const runId = (req.params as { runId: string }).runId;
  const { approvedTagIds, serverContainerPath, server_container_url, autoConfigureClient = true } = req.body as {
    approvedTagIds: string[];
    serverContainerPath: string;
    server_container_url: string;
    autoConfigureClient?: boolean;
  };

  if (!approvedTagIds || !Array.isArray(approvedTagIds) || approvedTagIds.length === 0) {
    return reply.code(400).send({ message: "approvedTagIds array required" });
  }

  if (!serverContainerPath || typeof serverContainerPath !== "string") {
    return reply.code(400).send({ message: "serverContainerPath required" });
  }

  if (!server_container_url || typeof server_container_url !== "string") {
    return reply.code(400).send({ message: "server_container_url required (e.g. https://your-sgtm.example.com)" });
  }

  // Get the migration report
  const raw = await s3ReadObjectText(`runs/${runId}/report.json`);
  if (!raw) {
    return reply.code(404).send({ message: "Migration report not found" });
  }

  const report = JSON.parse(raw) as any;

  // Get client container path from import record (for auto-configuring proxy tags)
  let clientContainerPath: string | null = null;
  let clientWorkspacePath: string | null = null;
  if (autoConfigureClient && report.importId) {
    try {
      const importRecord = await ddbDoc.send(new GetCommand({
        TableName: env.DDB_TABLE_IMPORTS,
        Key: { importId: report.importId }
      }));
      clientContainerPath = importRecord.Item?.gtm?.containerPath || null;
      clientWorkspacePath = importRecord.Item?.gtm?.workspacePath || null;
    } catch (err) {
      app.log.warn({ err }, "Could not fetch client container path from import");
    }
  }
  const approvedMappings = report.mappings.filter((m: any) => approvedTagIds.includes(m.clientTagId));

  // Get detected tags to access trigger information
  const detectedTagsMap = new Map();
  if (report.detectedTags) {
    for (const tag of report.detectedTags) {
      detectedTagsMap.set(tag.id, tag);
    }
  }

  // Get full container tags with all parameters
  const containerTagsMap = new Map();
  if (report.containerElements?.tags) {
    for (const tag of report.containerElements.tags) {
      containerTagsMap.set(tag.tagId, tag);
    }
  }

  // Get container triggers for reference
  const containerTriggersMap = new Map();
  if (report.containerElements?.triggers) {
    for (const trigger of report.containerElements.triggers) {
      containerTriggersMap.set(trigger.triggerId, trigger);
    }
  }

  if (approvedMappings.length === 0) {
    return reply.code(400).send({ message: "No approved mappings found" });
  }

  const tm = google.tagmanager({ version: "v2", auth });
  const deployedTags: any[] = [];
  const errors: any[] = [];
  const clientProxyTags: Array<{
    triggerName: string;
    customEventName: string;
    originalTriggerIds: string[];
    serverTriggerName: string;
  }> = [];

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

  // Determine which client types are needed based on approved tags
  const neededClients = new Set<string>();
  const clientTagModifications: Array<{
    clientTagId: string;
    clientTagName: string;
    clientType: string;
    clientToCreate: string;
  }> = [];

  for (const mapping of approvedMappings) {
    const rawClientTag = containerTagsMap.get(mapping.clientTagId);
    if (!rawClientTag) continue;

    const clientType = rawClientTag.type;
    const serverType = mapClientTagTypeToServer(clientType);

    // Check if this tag type needs client-side routing to server
    // GA4 tags (all variants)
    if (clientType === 'gaawe' || clientType === 'googtag' || clientType === 'gaawc' || serverType === 'sgtmgaaw') {
      neededClients.add('ga4');
      clientTagModifications.push({
        clientTagId: mapping.clientTagId,
        clientTagName: mapping.clientTagName,
        clientType,
        clientToCreate: 'ga4'
      });
    }
    // Google Ads tags (conversion, remarketing)
    else if (clientType === 'awct' || clientType === 'sp' || serverType === 'sgtmgads') {
      neededClients.add('googads');
      clientTagModifications.push({
        clientTagId: mapping.clientTagId,
        clientTagName: mapping.clientTagName,
        clientType,
        clientToCreate: 'googads'
      });
    }
    // Floodlight tags
    else if (clientType === 'fls' || clientType === 'flc' || serverType === 'sgtmflood') {
      neededClients.add('floodlight');
      clientTagModifications.push({
        clientTagId: mapping.clientTagId,
        clientTagName: mapping.clientTagName,
        clientType,
        clientToCreate: 'floodlight'
      });
    }
  }

  app.log.info({
    neededClients: Array.from(neededClients),
    tagsToModify: clientTagModifications.length,
    tagTypes: approvedMappings.map((m: any) => {
      const tag = containerTagsMap.get(m.clientTagId);
      return tag ? `${tag.type} → ${mapClientTagTypeToServer(tag.type)}` : 'unknown';
    })
  }, "Determined client requirements for migration");

  // Warn if no clients are needed (might indicate tags don't use client-side routing)
  if (neededClients.size === 0) {
    app.log.warn({
      approvedTagCount: approvedMappings.length,
      tagTypes: approvedMappings.map((m: any) => {
        const tag = containerTagsMap.get(m.clientTagId);
        return tag?.type;
      })
    }, "No clients needed - tags may not require client-side routing or use direct server integration");
  }

  // Create server-side triggers (without clients for simpler migration)
  const serverClients: Array<{ name: string; clientId: string; triggerId: string }> = [];
  const serverTriggers: any[] = []; // Store all created triggers for lookup

  // For each needed client type, create an "All Events" trigger instead of a client
  // This allows tags to fire on all incoming requests without complex client setup
  for (const clientType of neededClients) {
    try {
      let triggerName: string;
      let triggerNotes: string;

      if (clientType === 'ga4') {
        triggerName = 'All GA4 Events';
        triggerNotes = 'Auto-created by Tag Relay. Fires on all incoming requests for GA4 tags. Client-side tags route events to server via server_container_url.';
      } else if (clientType === 'googads') {
        triggerName = 'All Google Ads Events';
        triggerNotes = 'Auto-created by Tag Relay. Fires on all incoming requests for Google Ads tags.';
      } else if (clientType === 'floodlight') {
        triggerName = 'All Floodlight Events';
        triggerNotes = 'Auto-created by Tag Relay. Fires on all incoming requests for Floodlight tags.';
      } else {
        app.log.warn({ clientType }, "Unknown client type - skipping trigger creation");
        continue;
      }

      // Create a filtered trigger that only fires for the specific client type
      // Server-side triggers use type 'always' with filter conditions
      let triggerConfig: any = {
        type: 'always',
        name: triggerName,
        notes: triggerNotes
      };

      if (clientType === 'ga4') {
        // Filter for GA4 events: check if x-ga-measurement_id request header exists
        // This header is present in all GA4 requests to server-side GTM
        triggerConfig.filter = [
          {
            type: 'contains',
            parameter: [
              { type: 'template', key: 'arg0', value: '{{x-ga-measurement_id}}' },
              { type: 'template', key: 'arg1', value: 'G-' }
            ]
          }
        ];
      } else if (clientType === 'googads') {
        // Filter for Google Ads conversion events
        triggerConfig.filter = [
          {
            type: 'matchRegex',
            parameter: [
              { type: 'template', key: 'arg0', value: '{{x-ga-gcs_origin}}' },
              { type: 'template', key: 'arg1', value: 'ads' }
            ]
          }
        ];
      } else if (clientType === 'floodlight') {
        // Filter for Floodlight events
        triggerConfig.filter = [
          {
            type: 'contains',
            parameter: [
              { type: 'template', key: 'arg0', value: '{{Page Path}}' },
              { type: 'template', key: 'arg1', value: 'fls' }
            ]
          }
        ];
      }

      const triggerRes = await gtmCall(app.log, "triggers.create", () =>
        tm.accounts.containers.workspaces.triggers.create({
          parent: workspacePath,
          requestBody: triggerConfig
        })
      );

      const triggerId = triggerRes.data.triggerId;
      app.log.info(
        { triggerId, triggerName, clientType },
        "✅ Created 'All Events' trigger for server tags"
      );

      // Store the full trigger for later lookup (important for tag attachment)
      if (triggerRes.data) {
        serverTriggers.push(triggerRes.data);
      }

      // Store in serverClients array for compatibility (even though we're not creating actual clients)
      if (triggerId) {
        serverClients.push({
          name: triggerName,
          clientId: '', // No client created
          triggerId
        });
      }

    } catch (err) {
      app.log.error({ err, clientType }, "Failed to create trigger");
      errors.push({
        clientType,
        error: `Failed to create trigger for ${clientType}: ${gtmErrorMessage(err)}`
      });
    }
  }

  // Get all triggers in server workspace and append to our created triggers array
  try {
    const triggersRes = await gtmCall(app.log, "triggers.list", () =>
      tm.accounts.containers.workspaces.triggers.list({
        parent: workspacePath
      })
    );
    // Append API-loaded triggers to our array (avoiding duplicates by checking triggerId)
    const existingIds = new Set(serverTriggers.map((t: any) => t.triggerId).filter(Boolean));
    const newTriggers = (triggersRes.data.trigger || []).filter((t: any) => !existingIds.has(t.triggerId));
    serverTriggers.push(...newTriggers);
  } catch (err) {
    app.log.warn("Failed to list triggers in server workspace");
  }

  // Helper function to create or find matching trigger in server container
  async function getOrCreateServerTrigger(clientTriggerName: string): Promise<string | null> {
    // Check if trigger already exists in server container
    const existing = serverTriggers.find((t: any) => t.name === clientTriggerName);
    if (existing) {
      app.log.info({ triggerName: clientTriggerName, triggerId: existing.triggerId }, "Using existing server trigger");
      return existing.triggerId;
    }

    // Get client trigger details
    const clientTrigger = containerTriggersMap.get(clientTriggerName) ||
                          Array.from(containerTriggersMap.values()).find((t: any) => t.name === clientTriggerName);

    if (!clientTrigger) {
      app.log.warn({ clientTriggerName }, "Client trigger not found in report");
      return null;
    }

    // DEBUG: Log client trigger structure
    app.log.info({
      triggerName: clientTrigger.name,
      type: clientTrigger.type,
      eventName: clientTrigger.eventName,
      customEventFilter: clientTrigger.customEventFilter,
      filter: clientTrigger.filter
    }, "DEBUG: Client trigger structure");

    // Create server-side trigger based on client trigger
    try {
      const serverTriggerType = mapClientTriggerTypeToServer(clientTrigger.type);
      if (!serverTriggerType) {
        app.log.warn({ clientTriggerType: clientTrigger.type }, "Cannot map client trigger type to server");
        return null;
      }

      // SPECIAL HANDLING: Trigger Groups
      // Trigger groups reference child triggers via the 'filter' property
      // We need to verify all child triggers can be migrated before creating the group
      if (clientTrigger.type === 'triggerGroup' && clientTrigger.filter && Array.isArray(clientTrigger.filter)) {
        const childTriggerIds: string[] = [];

        // Extract trigger IDs from filter conditions
        for (const filterCondition of clientTrigger.filter) {
          const condType = String(filterCondition.type || '').toLowerCase();
          if (condType === 'equals' && filterCondition.parameter) {
            // Find the parameter with key 'arg0' which contains the child trigger ID
            const arg0 = filterCondition.parameter.find((p: any) => p.key === 'arg0');
            if (arg0?.value) {
              childTriggerIds.push(arg0.value);
            }
          }
        }

        // Validate that all child triggers can migrate
        const unmigratableChildren: string[] = [];
        for (const childId of childTriggerIds) {
          const childTrigger = containerTriggersMap.get(childId);
          if (childTrigger) {
            const childServerType = mapClientTriggerTypeToServer(childTrigger.type);
            if (!childServerType) {
              unmigratableChildren.push(`${childTrigger.name} (${childTrigger.type})`);
            }
          }
        }

        if (unmigratableChildren.length > 0) {
          app.log.warn({
            triggerGroupName: clientTriggerName,
            unmigratableChildren
          }, "Trigger group contains client-side only child triggers - creating custom event trigger instead");

          // STRATEGY: Create a custom event trigger on server
          // User will need to send this event from client when conditions are met
          const customEventName = clientTriggerName.toLowerCase().replace(/[^a-z0-9_]/g, '_');

          const customEventTrigger: any = {
            name: clientTriggerName,
            type: 'customEvent',
            customEventFilter: [{
              type: 'equals',
              parameter: [{
                type: 'template',
                key: 'arg0',
                value: '{{_event}}'
              }, {
                type: 'template',
                key: 'arg1',
                value: customEventName
              }]
            }],
            notes: `Client-side trigger group converted to custom event.\n\nOriginal conditions (client-side only):\n${unmigratableChildren.map(c => `- ${c}`).join('\n')}\n\nTo use this trigger, send a custom event from your client-side GTM:\ndataLayer.push({ event: '${customEventName}' });\n\nKeep the original trigger group on the client side and use it to fire a tag that sends this event.`
          };

          app.log.info({
            clientTriggerName,
            customEventName,
            strategy: 'client-proxy'
          }, "Creating custom event trigger as proxy for client-side conditions");

          const created = await gtmCall(app.log, "triggers.create", () =>
            tm.accounts.containers.workspaces.triggers.create({
              parent: workspacePath,
              requestBody: customEventTrigger
            })
          );

          serverTriggers.push(created.data);
          app.log.info({ triggerId: created.data.triggerId, triggerName: clientTriggerName }, "Created custom event proxy trigger");

          // Record that we need to create a proxy tag on the client side
          if (autoConfigureClient) {
            clientProxyTags.push({
              triggerName: clientTriggerName,
              customEventName,
              originalTriggerIds: childTriggerIds,
              serverTriggerName: clientTriggerName
            });
          }

          return created.data.triggerId || null;
        }
      }

      // Build trigger request body - start with basics
      const triggerBody: any = {
        name: clientTriggerName,
        type: serverTriggerType
      };

      // Copy relevant properties from client trigger based on type
      // This is generic - copies whatever structure GTM provides

      // Copy custom event filter (for customEvent triggers)
      if (clientTrigger.customEventFilter) {
        triggerBody.customEventFilter = clientTrigger.customEventFilter;
      }

      // Copy general filters (for all trigger types)
      if (clientTrigger.filter) {
        triggerBody.filter = clientTrigger.filter;
      }

      // Copy event name (some trigger types have this)
      if (clientTrigger.eventName) {
        triggerBody.eventName = clientTrigger.eventName;
      }

      // Copy parameters (if any)
      if (clientTrigger.parameter) {
        triggerBody.parameter = clientTrigger.parameter;
      }

      // Copy wait settings (for timer triggers, etc.)
      if (clientTrigger.waitForTags) {
        triggerBody.waitForTags = clientTrigger.waitForTags;
      }
      if (clientTrigger.checkValidation) {
        triggerBody.checkValidation = clientTrigger.checkValidation;
      }
      if (clientTrigger.waitForTagsTimeout) {
        triggerBody.waitForTagsTimeout = clientTrigger.waitForTagsTimeout;
      }

      // Copy auto-event filter settings
      if (clientTrigger.autoEventFilter) {
        triggerBody.autoEventFilter = clientTrigger.autoEventFilter;
      }

      app.log.info({
        clientTriggerName,
        clientType: clientTrigger.type,
        serverTriggerType,
        copiedFields: Object.keys(triggerBody).filter(k => k !== 'name' && k !== 'type')
      }, "Creating server-side trigger");
      const created = await gtmCall(app.log, "triggers.create", () =>
        tm.accounts.containers.workspaces.triggers.create({
          parent: workspacePath,
          requestBody: triggerBody
        })
      );

      serverTriggers.push(created.data);
      app.log.info({ triggerId: created.data.triggerId, triggerName: clientTriggerName }, "Created server trigger");
      return created.data.triggerId || null;
    } catch (err) {
      app.log.error({ err, clientTriggerName }, "Failed to create server trigger");
      return null;
    }
  }

  // Map client-side trigger types to server-side equivalents
  function mapClientTriggerTypeToServer(clientType: string): string | null {
    // Use comprehensive trigger mapping registry
    return CLIENT_TO_SERVER_TRIGGER_TYPE[clientType] || null;
  }

  // Map client-side tag types to server-side equivalents
  function mapClientTagTypeToServer(clientType: string): string | null {
    // Use comprehensive tag mapping registry
    return CLIENT_TO_SERVER_TAG_TYPE[clientType] || null;
  }

  const templateResults: any[] = [];

  /** One consolidated server tag per client GTM tag type (e.g. gaawe vs googtag each get their own server tag). */
  const tagsByClientTagType = new Map<string, Array<{
    mapping: any;
    rawTag: any;
    clientMod: any;
  }>>();

  for (const mapping of approvedMappings) {
    const rawClientTag = containerTagsMap.get(mapping.clientTagId);
    if (!rawClientTag) {
      errors.push({
        clientTagId: mapping.clientTagId,
        clientTagName: mapping.clientTagName,
        error: 'Client tag not found in container data'
      });
      continue;
    }

    const serverType = mapClientTagTypeToServer(rawClientTag.type);
    if (!serverType) {
      errors.push({
        clientTagId: mapping.clientTagId,
        clientTagName: mapping.clientTagName,
        error: `Tag type "${rawClientTag.type}" cannot be automatically migrated to server-side.`
      });
      continue;
    }

    const clientMod = clientTagModifications.find(m => m.clientTagId === mapping.clientTagId);
    const clientTagType = rawClientTag.type;

    if (!tagsByClientTagType.has(clientTagType)) {
      tagsByClientTagType.set(clientTagType, []);
    }
    tagsByClientTagType.get(clientTagType)!.push({ mapping, rawTag: rawClientTag, clientMod });
  }

  app.log.info({
    clientTagTypeCount: tagsByClientTagType.size,
    clientTagTypes: Array.from(tagsByClientTagType.keys())
  }, "Grouped tags by client tag type (one server tag per type)");

  // Create ONE server tag per client tag type
  for (const [clientTagType, tagsGroup] of tagsByClientTagType.entries()) {
    const serverType = mapClientTagTypeToServer(clientTagType);
    if (!serverType) {
      for (const { mapping } of tagsGroup) {
        errors.push({
          clientTagId: mapping.clientTagId,
          clientTagName: mapping.clientTagName,
          error: `Tag type "${clientTagType}" has no server-side mapping`
        });
      }
      continue;
    }

    try {
      // Use the first tag in the group as a template
      const { mapping: firstMapping, rawTag: firstRawTag } = tagsGroup[0];
      const groupClientMod = tagsGroup.map((t) => t.clientMod).find(Boolean) ?? null;

      // Determine a generic name for this consolidated tag
      const typeLabel = serverType === 'sgtmgaaw' ? 'GA4 Events' :
                        serverType === 'sgtmgads' ? 'Google Ads Conversions' :
                        serverType === 'sgtmmeta' ? 'Meta Events' :
                        `${serverType} Events`;

      const tagName = tagsGroup.length === 1
        ? `${firstMapping.clientTagName} (Server)`
        : `${typeLabel} [${clientTagType}] (${tagsGroup.length} tags)`;

      app.log.info({
        clientTagType,
        serverType,
        tagName,
        clientTagCount: tagsGroup.length,
        clientTagIds: tagsGroup.map(t => t.mapping.clientTagId)
      }, "Creating consolidated server tag");

      // Copy ALL parameters from the first client tag (generic approach)
      const parameters: any[] = [];
      if (firstRawTag.parameter && Array.isArray(firstRawTag.parameter)) {
        for (const param of firstRawTag.parameter) {
          // IMPORTANT: For consolidated GA4 server tags with multiple events, SKIP the eventName parameter
          // The server tag will automatically read event_name from the incoming GA4 request payload
          // This preserves the original event name from each client-side tag (purchase, add_to_cart, etc.)
          if (tagsGroup.length > 1 && param.key === 'eventName' && param.type === 'TEMPLATE' && serverType === 'sgtmgaaw') {
            // Skip eventName parameter - let server tag read from request
            app.log.info({
              originalEventName: param.value,
              consolidatedTagCount: tagsGroup.length,
              serverType
            }, "Skipped eventName parameter for consolidated GA4 server tag - will auto-read from client request");
            continue; // Don't add this parameter
          } else {
            parameters.push(param);
          }
        }
      }

      // Build server tag config by copying properties from first client tag
      const clientTagNames = tagsGroup.map(t => t.mapping.clientTagName).join(', ');
      const isConsolidatedGA4 = tagsGroup.length > 1 && serverType === 'sgtmgaaw';
      const eventNameNote = isConsolidatedGA4
        ? 'Automatically reads event_name from incoming client requests to preserve original event names (purchase, add_to_cart, etc.).'
        : '';
      const tagConfig: any = {
        type: serverType,
        parameter: parameters,
        tagFiringOption: firstRawTag.tagFiringOption || 'ONCE_PER_EVENT',
        notes: `Consolidated server tag (client tag type: ${clientTagType}) for ${tagsGroup.length} client-side tag(s): ${clientTagNames}. ${eventNameNote}`.trim()
      };

      // Copy ALL optional properties from first client tag (generic copy)
      if (firstRawTag.consentSettings) {
        tagConfig.consentSettings = firstRawTag.consentSettings;
        app.log.info({ consentSettings: firstRawTag.consentSettings }, "Copied consent settings");
      }

      if (firstRawTag.monitoringMetadata) {
        tagConfig.monitoringMetadata = firstRawTag.monitoringMetadata;
      }

      if (firstRawTag.setupTag) {
        tagConfig.setupTag = firstRawTag.setupTag;
      }

      if (firstRawTag.teardownTag) {
        tagConfig.teardownTag = firstRawTag.teardownTag;
      }

      if (firstRawTag.priority) {
        tagConfig.priority = firstRawTag.priority;
      }

      if (firstRawTag.liveOnly) {
        tagConfig.liveOnly = firstRawTag.liveOnly;
      }

      if (firstRawTag.scheduleStartMs) {
        tagConfig.scheduleStartMs = firstRawTag.scheduleStartMs;
      }

      if (firstRawTag.scheduleEndMs) {
        tagConfig.scheduleEndMs = firstRawTag.scheduleEndMs;
      }

      app.log.info({
        clientType: firstRawTag.type,
        serverType,
        parametersCopied: parameters.length,
        hasConsent: !!tagConfig.consentSettings
      }, "Server tag prepared");

      // Create the tag
      const tagBody: any = {
        name: tagName,
        ...tagConfig
      };

      // Determine which trigger to use on server
      // For GA4/Ads/Floodlight with client-side routing, use the client-routing trigger (all events from that client)
      if (groupClientMod) {
        const client = serverClients.find(c =>
          (groupClientMod.clientToCreate === 'ga4' && c.name === 'GA4') ||
          (groupClientMod.clientToCreate === 'googads' && c.name === 'Google Ads') ||
          (groupClientMod.clientToCreate === 'floodlight' && c.name === 'Floodlight')
        );

        if (client?.triggerId) {
          tagBody.firingTriggerId = [client.triggerId];
          app.log.info({
            clientType: groupClientMod.clientToCreate,
            triggerName: client.name,
            triggerId: client.triggerId
          }, "Attached client-routing trigger to server tag");
        } else {
          app.log.warn({ clientMod: groupClientMod }, "Client routing trigger not found - tag may not fire");
        }
      } else {
        // This tag doesn't use client routing → try to recreate behavioral triggers
        // Collect all triggers from all tags in the group
        const allTriggerIds = new Set<string>();
        for (const { mapping } of tagsGroup) {
          const detectedTag = detectedTagsMap.get(mapping.clientTagId);
          if (detectedTag?.firingTriggerIds && detectedTag.firingTriggerIds.length > 0) {
            detectedTag.firingTriggerIds.forEach((tid: string) => allTriggerIds.add(tid));
          }
        }

        if (allTriggerIds.size > 0) {
          app.log.info({
            clientTagCount: tagsGroup.length,
            firingTriggerIds: Array.from(allTriggerIds)
          }, "Processing triggers for consolidated tag");

          const serverTriggerIds: string[] = [];
          for (const clientTriggerId of allTriggerIds) {
            const clientTrigger = containerTriggersMap.get(clientTriggerId);
            if (clientTrigger) {
              const serverTriggerId = await getOrCreateServerTrigger(clientTrigger.name);
              if (serverTriggerId) {
                serverTriggerIds.push(serverTriggerId);
              }
            }
          }

          if (serverTriggerIds.length > 0) {
            tagBody.firingTriggerId = serverTriggerIds;
            app.log.info({ serverTriggerIds }, "Attached triggers to consolidated tag");
          } else {
            app.log.warn("No server triggers could be created/found for this tag");
          }
        } else {
          app.log.info({ clientTagCount: tagsGroup.length }, "No triggers found for client tags in group");
        }
      }

      // Fallback: attach by trigger name if API client list missed (e.g. partial failure) but triggers exist in workspace
      if (!tagBody.firingTriggerId?.length && groupClientMod) {
        const triggerNameByRouting: Record<string, string> = {
          ga4: 'All GA4 Events',
          googads: 'All Google Ads Events',
          floodlight: 'All Floodlight Events'
        };
        const wantName = triggerNameByRouting[groupClientMod.clientToCreate];
        if (wantName) {
          const t = serverTriggers.find((x: any) => x.name === wantName && x.triggerId);
          if (t?.triggerId) {
            tagBody.firingTriggerId = [t.triggerId];
            app.log.info({ triggerId: t.triggerId, wantName }, "✅ Attached All Events trigger by name (fallback)");
          }
        }
      }

      // Last resort: GA4 server tags should always fire on all GA4 events
      if (!tagBody.firingTriggerId?.length && serverType === 'sgtmgaaw') {
        const t = serverTriggers.find((x: any) => x.name === 'All GA4 Events' && x.triggerId);
        if (t?.triggerId) {
          tagBody.firingTriggerId = [t.triggerId];
          app.log.info({ triggerId: t.triggerId }, "✅ Attached 'All GA4 Events' trigger for sgtmgaaw tag (last resort)");
        }
      }

      const created = await gtmCall(app.log, "tags.create", () =>
        tm.accounts.containers.workspaces.tags.create({
          parent: workspacePath,
          requestBody: tagBody
        })
      );

      // VALIDATION: Check if triggers were attached
      if (!tagBody.firingTriggerId || tagBody.firingTriggerId.length === 0) {
        app.log.error({
          tagName: tagBody.name,
          serverType,
          hasClientRouting: !!groupClientMod,
          serverClientsAvailable: serverClients.length,
          serverTriggersAvailable: serverTriggers.length
        }, "WARNING: Tag created WITHOUT triggers - it will not fire! Manual configuration required.");

        // Add to errors array so user sees this
        errors.push({
          clientTagId: tagsGroup[0].mapping.clientTagId,
          clientTagName: tagsGroup[0].mapping.clientTagName,
          error: `Tag "${tagBody.name}" was created but no triggers were attached. The tag will not fire. Please manually add triggers in GTM.`,
          details: {
            serverType,
            expectedClientType: groupClientMod?.clientToCreate,
            serverClientsCreated: serverClients.map(c => c.name),
            serverTriggersCreated: serverTriggers.map((t: any) => t.name)
          }
        });
      } else {
        app.log.info({
          tagName: tagBody.name,
          triggerIds: tagBody.firingTriggerId,
          triggerCount: tagBody.firingTriggerId.length
        }, "✅ Tag created with triggers attached");
      }

      // Record deployment for ALL client tags in this group
      const serverTagId = created.data.tagId;
      const serverTagPath = created.data.path;
      for (const { mapping } of tagsGroup) {
        deployedTags.push({
          clientTagId: mapping.clientTagId,
          clientTagName: mapping.clientTagName,
          serverTagId,
          serverTagPath,
          status: 'deployed',
          needsConfiguration: true,
          sharedServerTag: tagsGroup.length > 1 // Flag that this is a consolidated tag
        });
      }

      app.log.info({
        tagId: serverTagId,
        clientTagCount: tagsGroup.length
      }, `Deployed consolidated tag: ${tagName}`);
    } catch (err) {
      app.log.error({ err, clientTagType, serverType, clientTagCount: tagsGroup.length }, "Failed to create consolidated tag");
      // Mark all tags in this group as failed
      for (const { mapping } of tagsGroup) {
        errors.push({
          clientTagId: mapping.clientTagId,
          clientTagName: mapping.clientTagName,
          error: gtmErrorMessage(err)
        });
      }
    }
  }

  // Deploy client-side proxy tags if needed
  const clientProxyResults: any[] = [];
  if (autoConfigureClient && clientContainerPath && clientProxyTags.length > 0) {
    app.log.info({
      clientContainerPath,
      proxyTagCount: clientProxyTags.length
    }, "Deploying proxy tags to client container");

    try {
      // ALWAYS dynamically resolve workspace - GTM may delete/recreate workspaces after publish
      let clientWorkspace: string | null = null;

      const workspacesRes = await gtmCall(app.log, "workspaces.list", () =>
        tm.accounts.containers.workspaces.list({ parent: clientContainerPath })
      );

      const workspaces = workspacesRes.data.workspace || [];

      if (workspaces.length === 0) {
        // No workspace exists - create one
        app.log.info("No workspace found in client container - creating one for proxy tags");

        try {
          const newWorkspace = await gtmCall(app.log, "workspaces.create", () =>
            tm.accounts.containers.workspaces.create({
              parent: clientContainerPath,
              requestBody: {
                name: 'Tag Relay Client Updates',
                description: 'Workspace created by Tag Relay for routing client tags to server-side GTM container'
              }
            })
          );

          clientWorkspace = newWorkspace.data.path || null;
          app.log.info({ workspacePath: clientWorkspace }, "Created new client workspace for proxy tags");
        } catch (createErr) {
          app.log.error({ err: createErr }, "Failed to create client workspace for proxy tags");
        }
      } else {
        // Use the first available workspace
        clientWorkspace = workspaces[0].path || null;
        app.log.info({
          workspacePath: clientWorkspace,
          workspaceName: workspaces[0].name
        }, "Using existing client workspace for proxy tags");
      }

      if (!clientWorkspace) {
        app.log.warn("No workspace found in client container - skipping proxy tag deployment");
      } else {
        // Create a Custom HTML tag for each proxy
        for (const proxy of clientProxyTags) {
          try {
            const proxyTagBody: any = {
              name: `[Tag Relay] Send ${proxy.customEventName}`,
              type: 'html',
              parameter: [{
                type: 'TEMPLATE',
                key: 'html',
                value: `<script>\nwindow.dataLayer = window.dataLayer || [];\nwindow.dataLayer.push({event: '${proxy.customEventName}'});\n</script>`
              }],
              firingTriggerId: proxy.originalTriggerIds,
              notes: `Auto-generated by Tag Relay to bridge client-side behavioral triggers to server-side container.\n\nThis tag fires when "${proxy.triggerName}" conditions are met and sends a custom event to the server-side container.`
            };

            const created = await gtmCall(app.log, "tags.create", () =>
              tm.accounts.containers.workspaces.tags.create({
                parent: clientWorkspace!,
                requestBody: proxyTagBody
              })
            );

            clientProxyResults.push({
              triggerName: proxy.triggerName,
              customEventName: proxy.customEventName,
              clientTagId: created.data.tagId,
              status: 'created'
            });

            app.log.info({
              tagId: created.data.tagId,
              triggerName: proxy.triggerName
            }, "Created client proxy tag");
          } catch (err) {
            app.log.error({ err, proxy }, "Failed to create client proxy tag");
            clientProxyResults.push({
              triggerName: proxy.triggerName,
              customEventName: proxy.customEventName,
              status: 'failed',
              error: gtmErrorMessage(err)
            });
          }
        }
      }
    } catch (err) {
      app.log.error({ err }, "Failed to access client container for proxy deployment");
    }
  }

  // Modify client-side tags to route to server container
  const modifiedClientTags: any[] = [];
  if (autoConfigureClient && clientContainerPath && clientTagModifications.length > 0) {
    app.log.info({
      clientContainerPath,
      tagsToModify: clientTagModifications.length
    }, "Modifying client-side tags to route to server");

    try {
      // ALWAYS dynamically resolve workspace - GTM may delete/recreate workspaces after publish
      let clientWorkspace: string | null = null;

      const workspacesRes = await gtmCall(app.log, "workspaces.list", () =>
        tm.accounts.containers.workspaces.list({ parent: clientContainerPath })
      );

      const workspaces = workspacesRes.data.workspace || [];

      if (workspaces.length === 0) {
        // No workspace exists - create one called "Tag Relay Client Updates"
        app.log.info("No workspace found in client container - creating one for tag modifications");

        try {
          const newWorkspace = await gtmCall(app.log, "workspaces.create", () =>
            tm.accounts.containers.workspaces.create({
              parent: clientContainerPath,
              requestBody: {
                name: 'Tag Relay Client Updates',
                description: 'Workspace created by Tag Relay for routing client tags to server-side GTM container'
              }
            })
          );

          clientWorkspace = newWorkspace.data.path || null;
          app.log.info({ workspacePath: clientWorkspace, workspaceName: 'Tag Relay Client Updates' }, "Created new client workspace");
        } catch (createErr) {
          app.log.error({ err: createErr }, "Failed to create client workspace");
        }
      } else {
        // Use the first available workspace (GTM's "current" workspace)
        clientWorkspace = workspaces[0].path || null;
        app.log.info({
          workspacePath: clientWorkspace,
          workspaceName: workspaces[0].name,
          totalWorkspaces: workspaces.length
        }, "Using existing client workspace");
      }

      if (!clientWorkspace) {
        app.log.warn("No workspace available in client container - skipping client tag modifications");
      } else {
        // Get all tags in client workspace
        const clientTagsRes = await gtmCall(app.log, "tags.list", () =>
          tm.accounts.containers.workspaces.tags.list({
            parent: clientWorkspace!
          })
        );

        const clientTagsById = new Map<string, any>();
        for (const tag of clientTagsRes.data.tag || []) {
          if (tag.tagId) {
            clientTagsById.set(tag.tagId, tag);
          }
        }

        // Modify each tag
        for (const mod of clientTagModifications) {
          const clientTag = clientTagsById.get(mod.clientTagId);
          if (!clientTag || !clientTag.path) {
            app.log.warn({ clientTagId: mod.clientTagId }, "Client tag not found in workspace");
            continue;
          }

          try {
            // Clone the tag's parameters and add server routing
            // Filter out any existing server routing parameters
            const updatedParameters = (clientTag.parameter || []).filter((p: any) =>
              p.key !== 'server_container_url' && p.key !== 'transportUrl'
            );

            // Add server routing parameters
            if (mod.clientToCreate === 'ga4') {
              // ONLY Google Tag (googtag/gaawc) supports server_container_url
              // GA4 Event tags (gaawe) do NOT support these parameters - GTM silently rejects them
              if (clientTag.type === 'googtag' || clientTag.type === 'gaawc') {
                updatedParameters.push({
                  type: 'TEMPLATE',
                  key: 'server_container_url',
                  value: server_container_url
                });
                updatedParameters.push({
                  type: 'TEMPLATE',
                  key: 'transportUrl',
                  value: server_container_url
                });
              } else {
                // GA4 Event tags (gaawe) should not be modified - they're replaced by Google Tag
                app.log.info({ tagType: clientTag.type, tagName: clientTag.name },
                  "Skipping client tag modification - GA4 Event tags don't support server_container_url");
                continue; // Skip this modification
              }
            } else if (mod.clientToCreate === 'googads') {
              // Google Ads tags need server_container_url
              updatedParameters.push({
                type: 'TEMPLATE',
                key: 'server_container_url',
                value: server_container_url
              });
            }

            // Update the tag
            const updated = await gtmCall(app.log, "tags.update", () =>
              tm.accounts.containers.workspaces.tags.update({
                path: clientTag.path,
                requestBody: {
                  ...clientTag,
                  parameter: updatedParameters,
                  notes: (clientTag.notes || '') + `\n\n[Modified by Tag Relay] Routes to server container: ${server_container_url}`
                }
              })
            );

            modifiedClientTags.push({
              clientTagId: mod.clientTagId,
              clientTagName: mod.clientTagName,
              routingAdded: mod.clientToCreate,
              status: 'modified'
            });

            app.log.info({
              tagId: mod.clientTagId,
              tagName: mod.clientTagName,
              clientType: mod.clientToCreate
            }, "Modified client tag to route to server");

          } catch (err) {
            app.log.error({ err, mod }, "Failed to modify client tag");
            modifiedClientTags.push({
              clientTagId: mod.clientTagId,
              clientTagName: mod.clientTagName,
              routingAdded: mod.clientToCreate,
              status: 'failed',
              error: gtmErrorMessage(err)
            });
          }
        }
      }
    } catch (err) {
      app.log.error({ err }, "Failed to access client container for tag modifications");
    }
  }

  const nextSteps = [
    `✅ SERVER CONTAINER: Open workspace: ${workspacePath}`,
    `   - ${serverClients.length} client(s) created: ${serverClients.map(c => c.name).join(', ')}`,
    `   - ${deployedTags.length} tag(s) deployed`,
    "   - Review and configure tags with your account IDs (Measurement ID, etc.)",
    "   - Unpause tags after configuration"
  ];

  if (modifiedClientTags.length > 0) {
    const successfulMods = modifiedClientTags.filter(m => m.status === 'modified').length;
    nextSteps.push(
      "",
      `✅ CLIENT CONTAINER: ${successfulMods} tag(s) modified to route to server`,
      `   - Modified tags now send data to: ${server_container_url}`,
      `   - Client tags keep same triggers (scroll, time, etc.)`,
      `   - Data flows: Browser → Your Server → Google/Meta/etc.`
    );
  }

  if (clientProxyResults.length > 0) {
    nextSteps.push(
      "",
      `✅ CLIENT CONTAINER: ${clientProxyResults.filter(p => p.status === 'created').length} proxy tag(s) created`,
      "   - These detect behavioral triggers and send custom events to server"
    );
  }

  nextSteps.push(
    "",
    "🚀 PUBLISH:",
    "   1. Test in GTM Preview mode (both containers)",
    "   2. Publish CLIENT container first",
    "   3. Publish SERVER container",
    "   4. Monitor data flow in server Preview and GA4 DebugView"
  );

  // Save deployment result to DynamoDB for persistence
  const deploymentRecord = {
    timestamp: new Date().toISOString(),
    deployed: deployedTags.length,
    failed: errors.length,
    deployedTagIds: deployedTags.map(t => t.clientTagId),
    serverContainerPath,
    server_container_url,
    workspacePath
  };

  try {
    await ddbDoc.send(
      new UpdateCommand({
        TableName: env.DDB_TABLE_RUNS,
        Key: { runId },
        UpdateExpression: "SET deploymentHistory = list_append(if_not_exists(deploymentHistory, :empty), :deployment), lastDeployedAt = :timestamp",
        ExpressionAttributeValues: {
          ":deployment": [deploymentRecord],
          ":empty": [],
          ":timestamp": deploymentRecord.timestamp
        }
      })
    );
    app.log.info({ runId, deployed: deployedTags.length }, "Saved deployment result to DynamoDB");
  } catch (err) {
    app.log.error({ err, runId }, "Failed to save deployment result to DynamoDB");
    // Don't fail the deployment if we can't save - just log it
  }

  return {
    runId,
    workspacePath,
    deployed: deployedTags.length,
    failed: errors.length,
    templatesDeployed: templateResults.filter(t => t.status === 'created').length,
    templatesReused: templateResults.filter(t => t.status === 'exists').length,
    templateResults,
    deployedTags,
    errors,
    serverClients,
    modifiedClientTags,
    clientProxyTags: clientProxyResults,
    nextSteps
  };
});

app.post("/migrations/:runId/deploy-variables", async (req, reply) => {
  if (!requireGtmOAuthConfigured(reply)) return;
  const sessionId = getGtmSessionId(req);
  if (!sessionId) return reply.code(401).send({ message: "Missing x-gtm-session" });
  const auth = getOAuthClientForSession(sessionId);
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
