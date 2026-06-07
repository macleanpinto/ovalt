# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Tag Relay** (domain: `ovalt.org`) is a SaaS tool that migrates Google Tag Manager setups from client-side to server-side tagging. Primary users are marketing/analytics engineers managing GTM/GA4/Meta. Migration correctness is the top quality attribute — prefer clear, auditable transformations over opaque automation, and flag uncertain mappings for human review rather than guessing.

Additional context: `README.md` (setup/deploy), `docs/system-design.md` (architecture), `TODO.md` (pending work), `LOCALSTACK_SAFETY.md` (local-vs-AWS guardrails).

## Commands

This is an npm workspaces monorepo (`apps/api`, `apps/worker`, `apps/web-nextjs`, `infra/cdk`). Root scripts fan out to workspaces.

```bash
# Install
npm install
cp .env.example .env                       # first-time only; fill in OAuth credentials

# Local dev — requires LocalStack from docker-compose
docker compose up -d
./infra/localstack/init-auth.sh            # create DynamoDB tables in LocalStack
npm run dev:api                            # Fastify API on :3001
npm run dev:worker                         # SQS consumer
npm run dev:web                            # Next.js on :5173
npm run dev:all                            # all three in one terminal

# Build / lint / test (all workspaces)
npm run build
npm run lint                               # each workspace uses `tsc --noEmit`
npm test                                   # vitest run, per workspace

# Single test file
cd apps/api && npm test -- path/to/file.test.ts
cd apps/worker && npm test -- path/to/file.test.ts

# E2E GTM deployment (hits real GTM containers; needs OAuth — see below)
cd apps/api && npm test src/e2e-gtm-deployment.test.ts
cd apps/api && npm run test:e2e            # wraps E2E with OAuth bootstrap
```

OAuth tokens for E2E tests are cached in `apps/api/.gtm-tokens.json` — no re-auth needed between runs. See `apps/api/E2E_TEST_QUICKSTART.md`.

## High-Level Architecture

Serverless-only. Three workloads plus infra:

```
Web (Next.js SSR)  →  API (Fastify on Lambda)  →  SQS  →  Worker (Lambda)
                              │                              │
                              └──── DynamoDB · S3 · Secrets Manager ────┘
```

**Request/migration flow:**
1. User uploads a GTM container JSON via the web app → API stores metadata in DynamoDB and the raw payload in S3 (`imports` table, `uploaded` status).
2. User triggers a run → API writes a `runs` row (`queued`) and pushes `{ importId, runId }` onto SQS.
3. Worker (`apps/worker/src/processor.ts` → `migration/pipeline.ts`) consumes the message:
   - `loadImport` → `canonical.ts` normalizes raw GTM JSON to an internal model → `engine/applyRuleset` categorizes tags/triggers/variables → `validation.ts` checks constraints → `provisioning/` runs GTM API pre-flight checks → `buildReport` + `markdown`.
   - Writes `runs/{runId}/report.json`, `report.md`, `server_blueprint.json` to S3 and updates the run row.
   - Import statuses: `uploaded → normalized | failed`. Run statuses: `queued → running → completed | needs_review | failed`.
4. Web polls the run; on user confirmation, the API calls `gtm-migration-deploy.ts` to create workspaces/tags in the user's GTM server container via the GTM API.

**Tenancy:** Every DynamoDB row and artifact is scoped by `organizationId`. Backend enforces this; the UI treats it as invisible (each user effectively has one workspace — multi-tenant agency features are not implemented).

**Auth:** Cookie-session JWTs issued by `apps/api/src/auth/` (Google/GitHub OAuth via `oauth-routes.ts`, API keys for programmatic access). GTM access uses a separate OAuth client/token stored per-user. Platform admin is gated by `isPlatformAdmin: true` on the user row (no UI; set via DynamoDB — see "Granting platform admin" below).

**Key directories:**
- `apps/api/src/` — Fastify server. `server.ts` has the route registrations; `auth/`, `admin-routes.ts`, `gtm-*.ts` implement domains. `lambda-handler.ts` is the Lambda entrypoint (reuses the Fastify instance across invocations).
- `apps/worker/src/migration/engine/` — rule-based migration. `supportedTypes.ts` is the whitelist of auto-deployable tag types; mappings are flagged `provisional` or `missingRequired` so the UI can gate on review. `rules-*.ts` files are declarative.
- `apps/web-nextjs/src/app/` — Next.js App Router (dashboard, import flow, migrations, admin, settings/team, invites).
- `infra/cdk/lib/` — four CDK stacks: `database-stack`, `api-stack`, `web-stack`, `domain-stack`.

## GTM Migration — Critical Code Rules

This is a **generic** migration system. Deployment/migration code must work for any GTM structure without hardcoded assumptions.

**In deployment/migration code (`apps/api/src/gtm-migration-deploy.ts`, `apps/api/src/server.ts` deploy endpoints, `apps/worker/src/deployment-processor.ts`, `apps/worker/src/migration/pipeline.ts`):**

- **NEVER** inspect tag/trigger/variable **names** to decide behavior (no `tagName.includes('GA4')`, no `/facebook|meta/.test(name)`).
- **ALWAYS** use type-based mapping via a lookup table. GTM type IDs map client → server (e.g. `gaawe → sgtmgaaw`, `googtag → sgtmgaaw`, `awct → sgtmgads`).
- **ALWAYS** copy all properties from source entities: the full `parameter` array, `consentSettings`, `priority`, `scheduleStartMs`, etc. Do not pre-filter parameters you think the server might not accept — let the GTM API return errors.
- Only transform type IDs when required (client type → server type).

```typescript
// Correct: type-based, non-destructive copy
const CLIENT_TAG_TYPE_TO_SERVER_TYPE: Record<string, string> = {
  gaawe: "sgtmgaaw",    // GA4 Event → Server GA4
  googtag: "sgtmgaaw",  // Google tag → Server GA4
  awct: "sgtmgads"      // Ads Conversion → Server Ads
};
const serverType = CLIENT_TAG_TYPE_TO_SERVER_TYPE[clientTag.type];
const tagConfig = { type: serverType, parameter: clientTag.parameter /* + all other props */ };
```

**Where pattern-matching IS acceptable:** analysis/categorization/reporting only — `apps/worker/src/migration/engine/rules-*.ts`, `matcher.ts`. Never in deployment code.

## Testing Before Deployment

Changes to any of these files **must** pass local E2E tests before being deployed:
- `apps/api/src/gtm-migration-deploy.ts`
- `apps/api/src/server.ts` (deployment endpoints)
- `apps/worker/src/deployment-processor.ts`
- `apps/worker/src/migration/pipeline.ts`

Procedure: `docker compose up -d` → `npm run dev:worker` → `cd apps/api && npm test src/e2e-gtm-deployment.test.ts` → verify changes in the Ovalt GTM containers (client `accounts/6347965337/containers/248366882`, server `accounts/6347965337/containers/248342708`). Do not skip even for one-line changes — deployment logic regressions are high blast-radius.

## Autonomous Work Permissions

When fixing failing tests you may work without approval: running `npm test` / `npm run test:e2e`, reading files, editing test code, editing production code when tests reveal bugs, editing docs, and safe bash (`cat`/`grep`/`ls`/`git status`/`git diff`). User's durable instruction: "you can even modify code to fix issues."

## AWS Deployment (MANDATORY)

**Production**: Account `549116506406`, Profile `tagrelay-prod`, Region `eu-north-1`, Domain `ovalt.org`. CloudFront + apex cert live in `us-east-1` (CDK handles this); core app resources are `eu-north-1`.

**Always use the scripts** (they set profile/region and run the required Lambda bundle build):

```bash
AWS_PROFILE=tagrelay-prod ./scripts/deploy-production.sh   # full
./scripts/deploy-api-only.sh                               # API Lambda
./scripts/deploy-worker-only.sh                            # Worker Lambda
```

**Before deploying, always verify identity:**
```bash
AWS_PROFILE=tagrelay-prod aws sts get-caller-identity   # Account must be 549116506406
```

**After deploying, always check:**
```bash
AWS_PROFILE=tagrelay-prod aws lambda get-function \
  --function-name tag-relay-worker-production --region eu-north-1 \
  --query 'Configuration.[LastModified, Handler, Timeout]'
AWS_PROFILE=tagrelay-prod aws logs tail /aws/lambda/tag-relay-worker-production \
  --region eu-north-1 --since 5m
```

**Hard rules — do not violate without explicit user instruction:**
- Never deploy to `us-east-1` for app resources (only the apex cert lives there, via CDK).
- Never deploy to account `851725425279` — wrong account.
- Never run ad-hoc `aws lambda update-function-code` — always go through the scripts (they build the Lambda bundle via `apps/{api,worker}/build-lambda.js`).
- If the user says "deploy" without specifying what, ask: full, API only, Worker only, or Web only.

## LocalStack Safety

Local dev must use LocalStack (`http://localhost:4566`) — never real AWS. `apps/api/src/server.ts` and `apps/worker/src/processor.ts` enforce this: when `ENVIRONMENT=local` or `NODE_ENV=development`, they force `AWS_ENDPOINT=http://localhost:4566` and override credentials to `test`/`test`, and throw if anything else is configured. Do not weaken these guards.

## Granting Platform Admin

The `/admin` dashboard is gated by `isPlatformAdmin: true`. No UI; set manually:

```bash
AWS_PROFILE=tagrelay-prod aws dynamodb update-item \
  --table-name tag-relay-users-production --region eu-north-1 \
  --key '{"userId":{"S":"<your-user-id>"}}' \
  --update-expression "SET isPlatformAdmin = :t" \
  --expression-attribute-values '{":t":{"BOOL":true}}'
```

Look up `userId` by email via the `email-index` GSI or from `/auth/me`.

## CI / GitHub Actions

Pushing to `main` triggers `.github/workflows/deploy-cdk-production.yml`, which runs a full CDK deploy to production. Non-infra Lambda changes should use the targeted scripts instead (`deploy-api-only.sh` / `deploy-worker-only.sh`) to avoid a full CDK run on every push.

## Runtime Notes

- Lambda reuses the Fastify instance across invocations — env var changes require a redeploy/function update, not just a cold start.
- Web OAuth flow uses cache-control on auth URLs; `/auth/callback` intentionally skips the initial auth check to avoid races.
- `apps/worker/src/migration/engine/supportedTypes.ts` is the single source of truth for auto-deployable tag types — mappings outside it should emit `provisional` or `missingRequired` so the UI blocks deployment until reviewed.
