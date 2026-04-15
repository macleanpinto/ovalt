#!/usr/bin/env node
/**
 * Reset Ovalt-managed GTM entities in the target workspace, then create client-side setup:
 *   - One Google tag (googtag) for OVALT_GA4_MEASUREMENT_ID on All Pages
 *   - Scroll depth trigger (25/50/75/90%) + GA4 Event "scroll"
 *   - Timer 30s + GA4 Event "ovalt_engagement_30s"
 * One googtag; two GA4 Event tags (scroll + time), both linked to the Google tag.
 *
 * By default deletes only tags/triggers whose names start with "Ovalt Engagement".
 * Use --delete-all-tags to remove every tag in the workspace; --delete-all-triggers to remove every trigger
 * (recommended together for a clean recreate). Shorthand: npm run setup:ovalt-gtm:reset -w @tag-relay/api
 *
 * Credentials (from repo-root .env):
 *   OVALT_GTM_CLIENT_ID       — OAuth client ID (or GTM_OAUTH_CLIENT_ID)
 *   OVALT_GTM_CLIENT_SECRET   — OAuth client secret (or GTM_OAUTH_CLIENT_SECRET)
 *   OVALT_GTM_REFRESH_TOKEN   — or GTM_OAUTH_REFRESH_TOKEN (create with npm run setup:ovalt-gtm:auth -w @tag-relay/api)
 *
 * Target (pick one):
 *   OVALT_GTM_CONTAINER_URL — paste GTM browser URL, e.g.
 *     https://tagmanager.google.com/#/container/accounts/6347965337/containers/248366882/workspaces/2
 *   OVALT_GTM_WORKSPACE_PATH — full API path: accounts/ACC/containers/CONT/workspaces/WS
 *   or OVALT_GTM_ACCOUNT_ID + OVALT_GTM_CONTAINER_ID (+ optional OVALT_GTM_WORKSPACE_ID)
 *
 * Required:
 *   OVALT_GA4_MEASUREMENT_ID  — e.g. G-XXXXXXXX (GA4 stream Measurement ID)
 *
 * Usage:
 *   cd apps/api && node scripts/setup-ovalt-gtm-engagement.mjs
 *   npm run setup:ovalt-gtm:create-workspace -w @tag-relay/api
 *     (same as: ... setup:ovalt-gtm ... -- --create-workspace — new editable workspace if yours is "already submitted")
 *   cd apps/api && node scripts/setup-ovalt-gtm-engagement.mjs --authorize
 *   cd apps/api && node scripts/setup-ovalt-gtm-engagement.mjs --authorize --write-env
 *     (saves OVALT_GTM_REFRESH_TOKEN to repo-root .env)
 *
 * Troubleshooting: ERR_MODULE_NOT_FOUND (googleapis, etc.) → from monorepo root run `npm install`,
 * then `npm run setup:ovalt-gtm:auth -w @tag-relay/api` (do not invoke the script without installed deps).
 *
 * "Workspace is already submitted" → by default this script creates a new workspace and retries once (no flag needed).
 * Use --create-workspace to always create a new workspace first; use --no-auto-workspace to disable auto-retry.
 *
 * Full wipe + recreate:
 *   npm run setup:ovalt-gtm:reset -w @tag-relay/api
 *   (same as --delete-all-tags --delete-all-triggers)
 */

import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

/** No `dotenv` import — avoids ERR_MODULE_NOT_FOUND when hoisted deps omit apps/api/node_modules. */
function applyEnvFile(filePath, overrideExisting) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).replace(/\\n/g, "\n");
    }
    if (overrideExisting || process.env[key] === undefined) process.env[key] = val;
  }
}

applyEnvFile(path.join(repoRoot, ".env"), false);
applyEnvFile(path.join(repoRoot, ".env.local"), true);

const SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.delete.containers",
  "https://www.googleapis.com/auth/tagmanager.publish"
];

const NAME_PREFIX = "Ovalt Engagement";

function env(name, ...fallbacks) {
  const v = [name, ...fallbacks].map((k) => process.env[k]?.trim()).find(Boolean);
  return v || "";
}

const clientId = env("OVALT_GTM_CLIENT_ID", "GTM_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID");
const clientSecret = env("OVALT_GTM_CLIENT_SECRET", "GTM_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET");
const refreshToken = env("OVALT_GTM_REFRESH_TOKEN", "GTM_OAUTH_REFRESH_TOKEN");
const workspacePathEnv = env("OVALT_GTM_WORKSPACE_PATH");
/** From process.env only — may be truncated at # if unquoted in .env */
const containerUrlEnvProcess = env("OVALT_GTM_CONTAINER_URL", "GTM_CONTAINER_URL");
const accountId = env("OVALT_GTM_ACCOUNT_ID");
const containerId = env("OVALT_GTM_CONTAINER_ID");
const workspaceIdExplicit = env("OVALT_GTM_WORKSPACE_ID");
const measurementId = env("OVALT_GA4_MEASUREMENT_ID");

function oauthClient(redirectUri) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** Quote value if needed for .env */
function escapeEnvValue(s) {
  if (/[\s#"']/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

const REFRESH_LINE_RE = /^\s*(?:OVALT_GTM_REFRESH_TOKEN|GTM_OAUTH_REFRESH_TOKEN)=/;

/**
 * @param {string} token
 * @param {string} envPath
 */
async function writeRefreshTokenToEnv(token, envPath) {
  let body = "";
  try {
    body = await readFile(envPath, "utf8");
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code !== "ENOENT") throw e;
  }
  const lines = body.split(/\r?\n/).filter((line) => !REFRESH_LINE_RE.test(line));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const line = `OVALT_GTM_REFRESH_TOKEN=${escapeEnvValue(token)}`;
  const next = (lines.length ? lines.join("\n") + "\n" : "") + line + "\n";
  await writeFile(envPath, next, "utf8");
  console.log(`\nWrote ${line.slice(0, 40)}… to ${envPath}\n`);
}

/** @param {{ writeEnv: boolean }} opts */
async function authorizeInteractive(opts) {
  if (!clientId || !clientSecret) {
    console.error("Set OVALT_GTM_CLIENT_ID and OVALT_GTM_CLIENT_SECRET (or GTM_OAUTH_*) in .env at repo root.");
    process.exit(1);
  }
  const redirectUri = "http://127.0.0.1:8765/oauth/callback";
  const o = oauthClient(redirectUri);
  const authUrl = o.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES
  });
  console.log("\n1) Add this Authorized redirect URI in Google Cloud → OAuth client:\n   ", redirectUri);
  console.log("\n2) Open this URL in a browser, sign in, approve:\n\n", authUrl, "\n");

  await new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const u = new URL(req.url || "", "http://127.0.0.1");
        if (u.pathname !== "/oauth/callback") {
          res.writeHead(404);
          res.end();
          return;
        }
        const code = u.searchParams.get("code");
        if (!code) {
          res.writeHead(400);
          res.end("Missing code");
          return;
        }
        const { tokens } = await o.getToken(code);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<p>Authorized. You can close this tab.</p>");
        server.close();
        const rt = tokens.refresh_token;
        if (rt && opts.writeEnv) {
          const envPath = path.join(repoRoot, ".env");
          await writeRefreshTokenToEnv(rt, envPath);
          console.log("Run: npm run setup:ovalt-gtm -w @tag-relay/api\n");
        } else {
          console.log("\nAdd ONE of these to repo-root .env (same client as GTM_OAUTH_*):\n");
          console.log(
            `OVALT_GTM_REFRESH_TOKEN=${rt || "(no refresh token — revoke app access in Google Account and run --authorize again)"}`
          );
          console.log(`# or: GTM_OAUTH_REFRESH_TOKEN=${rt || "..."}`);
          if (rt) {
            console.log("\nOr re-run with --write-env to save automatically:");
            console.log("  npm run setup:ovalt-gtm:auth -w @tag-relay/api -- --write-env\n");
            console.log("Then: npm run setup:ovalt-gtm -w @tag-relay/api\n");
          }
        }
        resolve();
      } catch (e) {
        reject(e);
      }
    });
    server.listen(8765, "127.0.0.1", () => {
      console.log("Listening on http://127.0.0.1:8765 for OAuth callback…");
    });
    server.on("error", reject);
  });
}

function buildAuth() {
  if (!clientId || !clientSecret) {
    console.error(`
Missing OAuth client credentials in repo-root .env. Set either:

  OVALT_GTM_CLIENT_ID / OVALT_GTM_CLIENT_SECRET
  or
  GTM_OAUTH_CLIENT_ID / GTM_OAUTH_CLIENT_SECRET
  (or GOOGLE_OAUTH_* if you use the same Google Cloud OAuth client)
`);
    process.exit(1);
  }
  if (!refreshToken) {
    console.error(`
Missing refresh token. The web app login does not store this in .env — run OAuth once from the CLI.

From repo root:

  npm run setup:ovalt-gtm:auth -w @tag-relay/api -- --write-env

(--write-env saves OVALT_GTM_REFRESH_TOKEN into repo-root .env for you.)

Without auto-save, omit --write-env and paste the printed line into .env.

Before that:
  1. Google Cloud → APIs & Services → Credentials → your OAuth client
  2. Authorized redirect URIs → add: http://127.0.0.1:8765/oauth/callback
  3. Tag Manager API enabled for the project

Use the SAME OAuth client as GTM_OAUTH_CLIENT_ID / GTM_OAUTH_CLIENT_SECRET in .env.
`);
    process.exit(1);
  }
  const o = oauthClient();
  o.setCredentials({ refresh_token: refreshToken });
  return o;
}

const SCROLL_DEPTH_TRIGGER_NAME = `${NAME_PREFIX} — Scroll depth`;
const TIMER_30_TRIGGER_NAME = `${NAME_PREFIX} — Timer 30s`;
const GOOGLE_TAG_NAME = `${NAME_PREFIX} — Google tag`;
const SCROLL_GA4_TAG_NAME = `${NAME_PREFIX} — GA4 scroll`;
const TIMER_GA4_TAG_NAME = `${NAME_PREFIX} — GA4 time (30s)`;

function scrollDepthTrigger(name) {
  return {
    name,
    type: "scrollDepth",
    parameter: [
      { type: "boolean", key: "verticalThresholdOn", value: "true" },
      { type: "template", key: "verticalThresholdUnits", value: "PERCENT" },
      { type: "template", key: "verticalThresholdsPercent", value: "25,50,75,90" },
      { type: "boolean", key: "horizontalThresholdOn", value: "false" }
    ]
  };
}

function timerTrigger(name, intervalMs, limit, eventName) {
  return {
    name,
    type: "timer",
    parameter: [
      { type: "template", key: "interval", value: String(intervalMs) },
      { type: "template", key: "limit", value: String(limit) },
      { type: "template", key: "eventName", value: eventName }
    ]
  };
}

function normalizeTriggerType(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/_/g, "");
}

/** Resolve an early-page-load trigger for the Google tag (All Pages / pageview / DOM ready, etc.). */
function findAllPagesTriggerId(triggers) {
  const list = triggers || [];
  const nameLooksLikeAllPages = (n) => {
    const s = String(n || "").toLowerCase();
    return (
      s === "all pages" ||
      s.includes("all pages") ||
      s.includes("every page") ||
      /initialization.*all pages/.test(s) ||
      s.includes("consent initialization")
    );
  };
  const named = list.find((t) => nameLooksLikeAllPages(t.name));
  if (named?.triggerId) return String(named.triggerId);

  const earlyLoadTypes = new Set([
    "pageview",
    "domready",
    "windowloaded",
    "always",
    "consentinit",
    "initialization"
  ]);
  for (const t of list) {
    const ty = normalizeTriggerType(t.type);
    if (earlyLoadTypes.has(ty) && t.triggerId) return String(t.triggerId);
  }
  return null;
}

/**
 * GA4 Event tag referencing the workspace Google tag (tag id), for GTM publish validation.
 * Current GTM template requires measurementIdOverride to be non-empty even with tagReference.
 * @param {string|string[]} firingTriggerId
 * @param {string|number} configTagId — numeric tag id of googtag in same workspace
 * @param {string} streamMeasurementId — GA4 stream id e.g. G-XXXXXXXX
 */
function ga4EventTag(name, eventName, firingTriggerId, configTagId, streamMeasurementId) {
  return {
    name,
    type: "gaawe",
    parameter: [
      { type: "template", key: "eventName", value: eventName },
      { type: "tagReference", key: "measurementId", value: String(configTagId) },
      { type: "template", key: "measurementIdOverride", value: streamMeasurementId },
      { type: "boolean", key: "sendEcommerceData", value: "false" },
      { type: "list", key: "eventParameters", list: [] }
    ],
    firingTriggerId: Array.isArray(firingTriggerId) ? firingTriggerId.map(String) : [String(firingTriggerId)],
    consentSettings: { consentStatus: "NOT_SET" }
  };
}

async function deleteOvaltTags(tm, workspacePath) {
  const res = await tm.accounts.containers.workspaces.tags.list({ parent: workspacePath });
  for (const t of res.data.tag || []) {
    if (!t.name?.startsWith(NAME_PREFIX) || !t.path) continue;
    await tm.accounts.containers.workspaces.tags.delete({ path: t.path });
    console.log(`Deleted tag: ${t.name}`);
  }
}

/** Every tag in the workspace (destructive). */
async function deleteAllWorkspaceTags(tm, workspacePath) {
  const res = await tm.accounts.containers.workspaces.tags.list({ parent: workspacePath });
  const tags = res.data.tag || [];
  for (const t of tags) {
    if (!t.path) continue;
    await tm.accounts.containers.workspaces.tags.delete({ path: t.path });
    console.log(`Deleted tag: ${t.name || t.tagId}`);
  }
  if (tags.length === 0) console.log("No tags to delete.");
}

async function deleteOvaltTriggers(tm, workspacePath) {
  const res = await tm.accounts.containers.workspaces.triggers.list({ parent: workspacePath });
  for (const tr of res.data.trigger || []) {
    if (!tr.name?.startsWith(NAME_PREFIX) || !tr.path) continue;
    await tm.accounts.containers.workspaces.triggers.delete({ path: tr.path });
    console.log(`Deleted trigger: ${tr.name}`);
  }
}

/** Every trigger in the workspace (destructive). */
async function deleteAllWorkspaceTriggers(tm, workspacePath) {
  const res = await tm.accounts.containers.workspaces.triggers.list({ parent: workspacePath });
  const triggers = res.data.trigger || [];
  for (const tr of triggers) {
    if (!tr.path) continue;
    await tm.accounts.containers.workspaces.triggers.delete({ path: tr.path });
    console.log(`Deleted trigger: ${tr.name || tr.triggerId}`);
  }
  if (triggers.length === 0) console.log("No triggers to delete.");
}

/**
 * Read KEY=value from an .env file without treating # inside the value as a comment
 * (dotenv truncates unquoted URLs like https://...#/container/...).
 * @param {string} filePath
 * @param {string} key
 */
function readEnvFileValue(filePath, key) {
  try {
    const text = readFileSync(filePath, "utf8");
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prefix = new RegExp(`^\\s*${esc}\\s*=\\s*`);
    for (const line of text.split(/\r?\n/)) {
      if (!prefix.test(line)) continue;
      let v = line.replace(prefix, "").trim();
      if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
        v = v.slice(1, -1).replace(/\\"/g, '"');
      } else if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
        v = v.slice(1, -1);
      }
      return v;
    }
  } catch {
    /* missing file */
  }
  return null;
}

/**
 * Full GTM URL: prefer process.env if parseable; else read repo .env / .env.local raw (fixes # truncation).
 */
function resolveContainerUrlString() {
  if (containerUrlEnvProcess && parseGtmContainerRef(containerUrlEnvProcess)) {
    return containerUrlEnvProcess;
  }
  for (const base of [".env", ".env.local"]) {
    const fp = path.join(repoRoot, base);
    for (const key of ["OVALT_GTM_CONTAINER_URL", "GTM_CONTAINER_URL"]) {
      const raw = readEnvFileValue(fp, key);
      if (raw && parseGtmContainerRef(raw)) return raw;
    }
  }
  return containerUrlEnvProcess || "";
}

function parseGtmContainerRef(raw) {
  const s = raw.trim();
  if (!s) return null;
  const m1 = s.match(/container\/accounts\/(\d+)\/containers\/(\d+)(?:\/workspaces\/(\d+))?/);
  if (m1) {
    return { accountId: m1[1], containerId: m1[2], workspaceId: m1[3] ?? "" };
  }
  const m2 = s.match(/accounts\/(\d+)\/containers\/(\d+)(?:\/workspaces\/(\d+))?/);
  if (m2) {
    return { accountId: m2[1], containerId: m2[2], workspaceId: m2[3] ?? "" };
  }
  return null;
}

/** @param {string} s */
function extractContainerParentPath(s) {
  const m = String(s).match(/^(accounts\/\d+\/containers\/\d+)/);
  return m ? m[1] : null;
}

/**
 * @param {ReturnType<typeof google.tagmanager>} tm
 * @param {{ createWorkspace?: boolean }} opts
 */
async function resolveWorkspacePath(tm, opts = {}) {
  const createWorkspace = opts.createWorkspace === true;

  if (workspacePathEnv && !createWorkspace) {
    return workspacePathEnv;
  }

  let acc = accountId;
  let cont = containerId;
  let wsId = workspaceIdExplicit;

  const containerUrlResolved = resolveContainerUrlString();
  const parsed = containerUrlResolved ? parseGtmContainerRef(containerUrlResolved) : null;
  if (parsed) {
    acc = parsed.accountId;
    cont = parsed.containerId;
    if (parsed.workspaceId) wsId = parsed.workspaceId;
    console.log(`Parsed container from OVALT_GTM_CONTAINER_URL → account ${acc}, container ${cont}${wsId ? `, workspace ${wsId}` : ""}`);
  }

  if (createWorkspace && workspacePathEnv && (!acc || !cont)) {
    const parent = extractContainerParentPath(workspacePathEnv);
    if (parent) {
      const m = parent.match(/accounts\/(\d+)\/containers\/(\d+)/);
      if (m) {
        acc = m[1];
        cont = m[2];
      }
    }
  }

  if (createWorkspace) {
    wsId = "";
  }

  if (!acc || !cont) {
    const hint =
      containerUrlEnvProcess &&
      !parseGtmContainerRef(containerUrlEnvProcess) &&
      containerUrlEnvProcess.includes("tagmanager.google.com")
        ? `\n  Your OVALT_GTM_CONTAINER_URL is probably truncated at "#" (dotenv treats # as a comment).\n  Either wrap the URL in double quotes in .env, or keep the line as-is — this script re-reads .env for the full URL.\n  If it still fails, use numeric IDs below.\n`
        : "";
    console.error(`
Set ONE of the following in repo-root .env:

  Easiest — GTM URL (must be quoted because of #, or rely on raw line read):

  OVALT_GTM_CONTAINER_URL="https://tagmanager.google.com/#/container/accounts/6347965337/containers/248366882/workspaces/2"
${hint}
  Or full API path (no # issue):


  OVALT_GTM_WORKSPACE_PATH=accounts/6347965337/containers/248366882/workspaces/2

  Or numeric IDs:

  OVALT_GTM_ACCOUNT_ID=6347965337
  OVALT_GTM_CONTAINER_ID=248366882
  OVALT_GTM_WORKSPACE_ID=2

If workspace id is omitted, the script picks "Default Workspace".

If you see "Workspace is already submitted", run with --create-workspace (see file header).
`);
    process.exit(1);
  }
  const containerPath = `accounts/${acc}/containers/${cont}`;

  if (createWorkspace) {
    // Date-only names collide after multiple runs the same day → duplicate workspace name error.
    const wsName = `${NAME_PREFIX} CLI ${Date.now()}`;
    const cr = await tm.accounts.containers.workspaces.create({
      parent: containerPath,
      requestBody: {
        name: wsName,
        description: "Created by setup-ovalt-gtm-engagement.mjs (--create-workspace)"
      }
    });
    const p = cr.data.path;
    if (!p) {
      console.error("workspaces.create returned no path.");
      process.exit(1);
    }
    console.log(
      `Created new editable workspace "${wsName}"\n  ${p}\n` +
        "Optional: set OVALT_GTM_WORKSPACE_PATH to the line above (or update OVALT_GTM_CONTAINER_URL) for future runs without --create-workspace.\n"
    );
    return p;
  }

  if (wsId) {
    const p = `${containerPath}/workspaces/${wsId}`;
    console.log(`Using workspace path: ${p}`);
    return p;
  }
  const list = await tm.accounts.containers.workspaces.list({ parent: containerPath });
  const workspaces = list.data.workspace || [];
  const def =
    workspaces.find((w) => w.name === "Default Workspace") ||
    workspaces.find((w) => /default/i.test(w.name || "")) ||
    workspaces[0];
  if (!def?.path) {
    console.error("No workspaces returned for container. Check OVALT_GTM_ACCOUNT_ID / OVALT_GTM_CONTAINER_ID.");
    process.exit(1);
  }
  console.log(`Using workspace: "${def.name}" → ${def.path}`);
  return def.path;
}

/** @param {unknown} err */
function isWorkspaceSubmittedError(err) {
  const msg = /** @type {{ response?: { data?: { error?: { message?: string } } } }} */ (err)?.response?.data?.error?.message || "";
  return typeof msg === "string" && msg.toLowerCase().includes("already submitted");
}

/**
 * @param {ReturnType<typeof google.tagmanager>} tm
 * @param {string} workspacePath
 */
async function runOvaltEngagementSetup(tm, workspacePath) {
  if (!measurementId) {
    console.error(
      "Set OVALT_GA4_MEASUREMENT_ID in repo-root .env (e.g. G-XXXXXXXX) for the Google tag and GA4 events."
    );
    process.exit(1);
  }

  const wipeAllTags = process.argv.includes("--delete-all-tags");
  const wipeAllTriggers = process.argv.includes("--delete-all-triggers");

  if (wipeAllTags) {
    console.warn("\n--delete-all-tags: deleting every tag in this workspace.\n");
    await deleteAllWorkspaceTags(tm, workspacePath);
  } else {
    await deleteOvaltTags(tm, workspacePath);
  }

  if (wipeAllTriggers) {
    console.warn("\n--delete-all-triggers: deleting every trigger in this workspace.\n");
    await deleteAllWorkspaceTriggers(tm, workspacePath);
  } else {
    await deleteOvaltTriggers(tm, workspacePath);
  }

  const triggersRes = await tm.accounts.containers.workspaces.triggers.list({ parent: workspacePath });
  const existingTriggers = triggersRes.data.trigger || [];

  let allPagesTid = findAllPagesTriggerId(existingTriggers);
  const autoPageViewName = `${NAME_PREFIX} — Page view (All Pages)`;
  if (!allPagesTid) {
    const existingAuto = existingTriggers.find((t) => t.name === autoPageViewName);
    if (existingAuto?.triggerId) {
      allPagesTid = String(existingAuto.triggerId);
    } else {
      try {
        const cr = await tm.accounts.containers.workspaces.triggers.create({
          parent: workspacePath,
          requestBody: {
            name: autoPageViewName,
            type: "pageview",
            filter: []
          }
        });
        allPagesTid = String(cr.data.triggerId);
        console.log(`Created trigger ${autoPageViewName} (${allPagesTid}) for the Google tag.`);
      } catch (err) {
        console.error(
          "No suitable page-load trigger found and create failed. Add a Page View trigger in GTM or fix API error:\n",
          err.response?.data || err.message || err
        );
        process.exit(1);
      }
    }
  }

  const googBody = {
    name: GOOGLE_TAG_NAME,
    type: "googtag",
    parameter: [{ type: "template", key: "tagId", value: measurementId }],
    firingTriggerId: [allPagesTid],
    consentSettings: { consentStatus: "NOT_SET" }
  };
  /** @type {string | number | null | undefined} */
  let configTagId;
  try {
    const created = await tm.accounts.containers.workspaces.tags.create({
      parent: workspacePath,
      requestBody: googBody
    });
    configTagId = created.data.tagId;
    console.log(`Created tag: ${GOOGLE_TAG_NAME} (${configTagId})`);
  } catch (e1) {
    const gaawcBody = {
      name: GOOGLE_TAG_NAME,
      type: "gaawc",
      parameter: [
        { type: "boolean", key: "sendPageView", value: "true" },
        { type: "boolean", key: "enableSendToServerContainer", value: "false" },
        { type: "template", key: "measurementId", value: measurementId }
      ],
      firingTriggerId: [allPagesTid],
      consentSettings: { consentStatus: "NOT_SET" }
    };
    try {
      const created = await tm.accounts.containers.workspaces.tags.create({
        parent: workspacePath,
        requestBody: gaawcBody
      });
      configTagId = created.data.tagId;
      console.log(`Created tag: ${GOOGLE_TAG_NAME} (GA4 Configuration, ${configTagId})`);
    } catch (e2) {
      console.error("Could not create Google tag or GA4 Configuration tag:", e2.response?.data || e2.message || e2);
      console.error("First attempt (googtag):", e1.response?.data || e1.message || e1);
      process.exit(1);
    }
  }

  const scrollTr = await tm.accounts.containers.workspaces.triggers.create({
    parent: workspacePath,
    requestBody: scrollDepthTrigger(SCROLL_DEPTH_TRIGGER_NAME)
  });
  const scrollTid = scrollTr.data.triggerId;
  if (!scrollTid) {
    console.error("Failed to create scroll depth trigger.");
    process.exit(1);
  }
  console.log(`Created trigger: ${SCROLL_DEPTH_TRIGGER_NAME} (${scrollTid})`);

  const scrollGa4Body = ga4EventTag(
    SCROLL_GA4_TAG_NAME,
    "scroll",
    [scrollTid],
    configTagId,
    measurementId
  );
  await tm.accounts.containers.workspaces.tags.create({
    parent: workspacePath,
    requestBody: scrollGa4Body
  });
  console.log(`Created tag: ${SCROLL_GA4_TAG_NAME}`);

  const timerTr = await tm.accounts.containers.workspaces.triggers.create({
    parent: workspacePath,
    requestBody: timerTrigger(TIMER_30_TRIGGER_NAME, 30_000, 1, "ovalt_engagement_30s")
  });
  const timerTid = timerTr.data.triggerId;
  if (!timerTid) {
    console.error("Failed to create timer trigger.");
    process.exit(1);
  }
  console.log(`Created trigger: ${TIMER_30_TRIGGER_NAME} (${timerTid})`);

  const timerGa4Body = ga4EventTag(
    TIMER_GA4_TAG_NAME,
    "ovalt_engagement_30s",
    [timerTid],
    configTagId,
    measurementId
  );
  await tm.accounts.containers.workspaces.tags.create({
    parent: workspacePath,
    requestBody: timerGa4Body
  });
  console.log(`Created tag: ${TIMER_GA4_TAG_NAME}`);

  console.log(
    "\nDone. Open GTM → workspace → Preview, then Publish.\n" +
      "Google tag + GA4 scroll + GA4 time-on-page (30s timer).\n"
  );
}

async function main() {
  if (process.argv.includes("--authorize")) {
    const writeEnv = process.argv.includes("--write-env");
    await authorizeInteractive({ writeEnv });
    return;
  }

  const auth = buildAuth();
  const tm = google.tagmanager({ version: "v2", auth });
  const forceNewWs = process.argv.includes("--create-workspace");
  const noAutoNewWs = process.argv.includes("--no-auto-workspace");

  let workspacePath = await resolveWorkspacePath(tm, { createWorkspace: forceNewWs });

  try {
    await runOvaltEngagementSetup(tm, workspacePath);
  } catch (err) {
    if (!noAutoNewWs && !forceNewWs && isWorkspaceSubmittedError(err)) {
      console.warn(
        "\nWorkspace is read-only (already submitted). Creating a new workspace and retrying once…\n" +
          "(Use --no-auto-workspace to skip this, or --create-workspace to always create a new workspace first.)\n"
      );
      workspacePath = await resolveWorkspacePath(tm, { createWorkspace: true });
      await runOvaltEngagementSetup(tm, workspacePath);
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  const data = err.response?.data;
  const msg = data?.error?.message || err.message || String(err);
  console.error(data || msg);
  if (typeof msg === "string" && msg.toLowerCase().includes("already submitted")) {
    console.error(`
GTM workspace is read-only. This script normally creates a new workspace automatically unless you passed --no-auto-workspace.

Manual options:
  npm run setup:ovalt-gtm:create-workspace -w @tag-relay/api
  Or: New workspace in the GTM UI → update OVALT_GTM_CONTAINER_URL
`);
  }
  process.exit(1);
});
