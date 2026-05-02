# CLAUDE.md

Project memory and operating guide for AI coding sessions in this repository.

## Project Overview

- **Project name:** Tag Relay
- **Current status:** Production-ready, ready for AWS deployment
- **Goal:** Build a tool that helps marketing and analytics teams migrate client-side tags to server-side tagging with minimal manual work and low risk.

## Source Context

- Architecture: `docs/system-design.md`
- Setup, deploy, local dev: `README.md`
- Pending work: `TODO.md`

## Primary User

- Marketing or analytics engineers managing GTM/GA4/Meta setups.
- They need migration speed, accuracy, and confidence without heavy engineering support.

## Product Priorities

### Must-Haves

1. Automated conversion from client-side setup to server-side configuration.
2. Minimal frontend code changes.
3. Validation checks comparing client-side vs server-side event consistency.
4. Fast guided setup experience.
5. Privacy/compliance-first defaults (GDPR/CCPA aware).

### Nice-to-Haves

- Monitoring dashboards.
- Advanced routing/transforms and anomaly detection.

### Architecture Notes

- **Organizations**: Backend uses organizationId for data filtering, but UI hides this complexity from users. Each user has their own workspace. Multi-tenant agency features are not currently implemented.

## Technical Working Agreements

- Keep implementations incremental and testable.
- Prefer clear, auditable transformations over opaque magic.
- Treat migration correctness as the top quality attribute.
- Avoid destructive operations unless explicitly requested.
- Keep docs in sync with code changes.
- Prefer provider documentation evidence when assigning migration confidence.

## Testing & Autonomous Work Permissions

When working on tests and fixing issues, you may work autonomously without requesting approval for:
- **Running tests**: `npm test`, `npm run test:e2e`, vitest commands
- **Reading files**: Read, Grep, Glob operations to diagnose failures
- **Fixing test code**: Edits to `*.test.ts`, `*.spec.ts`, test scripts
- **Fixing production code**: Edits to implementation files when tests reveal bugs
- **Updating documentation**: Changes to `*.md` files
- **Safe bash commands**: cat, echo, grep, ls, tail, head, git status/diff

When test failures occur, work autonomously:
1. Run tests to identify failures
2. Read source files to understand root cause
3. Fix test code OR production code as needed
4. Re-run tests
5. Repeat until all tests pass
6. Document what was fixed
7. Report final results

**User instruction:** "you can even modify code to fix issues"

OAuth tokens for E2E tests are cached in `apps/api/.gtm-tokens.json` - no re-authentication needed between runs.

See `apps/api/E2E_TEST_QUICKSTART.md` for testing details and `apps/api/TEST_SESSION_SUMMARY.md` for last test session results.

## GTM Migration System Principles

This is a **generic migration system** for Google Tag Manager entities. The deployment/migration code must work for ANY GTM structure without hardcoded assumptions.

### CRITICAL RULES for Deployment/Migration Code:

**NEVER** check tag/trigger/variable NAMES for patterns when determining how to migrate:
- ❌ NO: `if (tagName.includes('GA4'))` or `if (tagName.startsWith('CE -'))`
- ❌ NO: `if (/facebook|meta|pixel/.test(tagName))`
- ❌ NO: String matching on names to determine tag behavior

**ALWAYS** use TYPE-BASED mapping:
- ✅ YES: `const serverType = CLIENT_TYPE_TO_SERVER_TYPE[clientTag.type]`
- ✅ YES: Map GTM type IDs (`gaawe` → `sgtmgaaw`, `awct` → `sgtmgads`)
- ✅ YES: Use declarative lookup tables for type mappings

**ALWAYS** copy ALL properties from source entities:
- ✅ YES: Copy entire `parameter` array from client to server
- ✅ YES: Copy `consentSettings`, `priority`, `scheduleStartMs`, all properties
- ❌ NO: Extracting specific parameters by key (like `parameters['measurementId']`)
- ❌ NO: Filtering or transforming parameters during migration

**Let GTM API validate structures:**
- Don't pre-filter properties you think might not be supported
- Copy the structure as-is and let GTM API return errors if something is incompatible
- Only transform type IDs when necessary (client type → server type)

### When Pattern Matching IS Acceptable:

Pattern matching is ONLY acceptable in:
- **Analysis/categorization code** (`rulesV1.ts`, `matcher.ts`): Identifying what type of tag it is for reporting
- **Rule definition files**: Declarative rules that match conditions for scoring/categorization

Pattern matching is NOT acceptable in:
- **Deployment code** (`server.ts` deployment endpoints): Copying tag structures to server containers
- **Migration transformation code**: Converting client entities to server entities

### Example - The Right Way:

```typescript
// ✅ CORRECT: Type-based mapping
const CLIENT_TAG_TYPE_TO_SERVER_TYPE: Record<string, string> = {
  'gaawe': 'sgtmgaaw',   // GA4 Event -> Server GA4
  'googtag': 'sgtmgaaw', // Google tag -> Server GA4
  'awct': 'sgtmgads',    // Ads Conversion -> Server Ads
  // ... etc
};

const serverType = CLIENT_TAG_TYPE_TO_SERVER_TYPE[clientTag.type];

// Copy ALL properties
const tagConfig = {
  type: serverType,
  parameter: clientTag.parameter,  // Copy all, no filtering
  // Copy all other properties
};
if (clientTag.consentSettings) tagConfig.consentSettings = clientTag.consentSettings;
if (clientTag.priority) tagConfig.priority = clientTag.priority;
// ... etc
```

```typescript
// ❌ WRONG: Name-based logic
if (tagName.includes('GA4') || tagName.includes('google analytics')) {
  // Deploy as GA4
  tagConfig = { type: 'sgtmgaaw', ... };
} else if (tagName.includes('Meta') || tagName.includes('Facebook')) {
  // Deploy as Meta
  ...
}
```

## Finalized Technical Baseline

- **Frontend:** Next.js 14 with SSR (App Router).
- **Backend:** Node.js 20 + TypeScript + Fastify.
- **Database:** DynamoDB (8 tables for multi-tenancy).
- **Queue:** SQS + Lambda worker service.
- **Storage:** S3 buckets (artifacts + static assets).
- **Infrastructure:** AWS CDK (TypeScript) for deployment.
- **Local Dev:** Docker Compose + LocalStack.

## Finalized Product/Architecture Decisions

1. Migration must create or guide creation of a GTM server-side container.
2. Output format is hybrid: automated artifacts plus scripts/checklists for manual steps.
3. Confidence scoring is docs-first, with agent-scored provisional fallback when docs/examples are unavailable.
4. Architecture is SaaS-first and multi-tenant.
5. Extensibility must support future provider adapters/mapping packs (for example Taggers) without redesigning core flow.

## Repository Conventions

- Implementation code is under `apps/` (api, worker, web-nextjs).
- Migration logic and validation logic are in separate modules within `apps/worker/src/migration/`.
- Infrastructure code is in `infra/cdk/` (AWS CDK stacks).
- Documentation is in root and `docs/` directory.

## Current Status

✅ **Production Deployed (2026-04-02):**
- API with 30+ endpoints (auth, organizations, imports, migrations)
- Worker with rule-based migration engine (30+ production rules)
- Next.js SSR web app with OAuth integration
- Multi-tenant authentication and RBAC
- Container provisioning verification
- Privacy Policy and Terms of Service pages
- AWS CDK infrastructure (4 stacks: Database, API, Web, Domain)
- Production URLs:
  - **Website**: https://ovalt.org
  - **API**: https://api.ovalt.org
  - **Privacy**: https://ovalt.org/privacy
  - **Terms**: https://ovalt.org/terms

## Production configuration

Deploy, OAuth redirect URIs, and regions: **`README.md`**. Architecture: **`docs/system-design.md`**.

**Runtime notes:** Lambda may reuse the Fastify instance; env changes need a new deploy or function update. Web OAuth flow uses cache-control on auth URLs; `/auth/callback` skips the initial auth check to avoid races.

## AWS Deployment Requirements (MANDATORY)

**CRITICAL**: When deploying to AWS, you MUST follow these requirements exactly. Do NOT deviate from these procedures.

### Production AWS Configuration

- **AWS Account**: 549116506406
- **AWS Profile**: `tagrelay-prod` (ALWAYS use this profile)
- **AWS Region**: `eu-north-1` (ALWAYS use this region, NOT us-east-1!)
- **Domain**: ovalt.org

### Deployment Commands (ALWAYS USE THESE)

**Full Production Deployment:**
```bash
AWS_PROFILE=tagrelay-prod ./scripts/deploy-production.sh
```

**Quick Worker Lambda Update:**
```bash
./scripts/deploy-worker-only.sh
# This script automatically uses AWS_PROFILE=tagrelay-prod and region=eu-north-1
```

**Quick API Lambda Update:**
```bash
./scripts/deploy-api-only.sh
# This script automatically uses AWS_PROFILE=tagrelay-prod and region=eu-north-1
```

### Testing Requirements (MANDATORY BEFORE DEPLOYMENT)

**CRITICAL**: Any changes to migration or deployment code (API or Worker) **MUST** be tested locally with E2E tests before deploying to production.

**Testing Procedure:**
1. Ensure LocalStack is running: `docker compose up -d`
2. Start the worker: `npm run dev:worker` (in separate terminal or background)
3. Run E2E deployment test: `cd apps/api && npm test src/e2e-gtm-deployment.test.ts`
4. Verify changes in Ovalt GTM containers:
   - Client container: accounts/6347965337/containers/248366882
   - Server container: accounts/6347965337/containers/248342708
5. Check created workspaces and tags match expected behavior
6. **ONLY deploy if E2E tests pass and GTM containers show correct changes**

**What to Verify in GTM Containers:**
- Client-side tags modified/paused correctly
- Server-side tags created with correct types
- Triggers created properly
- Variables copied to server workspace
- No unexpected tags or modifications

**Files Requiring E2E Testing Before Deployment:**
- `apps/api/src/gtm-migration-deploy.ts` (main deployment logic)
- `apps/api/src/server.ts` (deployment endpoints)
- `apps/worker/src/deployment-processor.ts` (worker deployment handler)
- `apps/worker/src/migration/pipeline.ts` (migration logic)

**Never skip testing for "small changes"** - even one-line changes to deployment logic can break production deployments.

### Deployment Rules (MUST FOLLOW)

1. **ALWAYS verify account and region BEFORE deploying:**
   ```bash
   AWS_PROFILE=tagrelay-prod aws sts get-caller-identity
   # Expected Account: 549116506406
   ```

2. **NEVER deploy manually with AWS CLI commands** unless explicitly instructed by the user to do so. ALWAYS use the deployment scripts in `scripts/` directory.

3. **NEVER deploy to us-east-1**. Production is in **eu-north-1**.

4. **NEVER deploy to AWS account 851725425279**. That is the wrong account.

5. **ALWAYS use AWS_PROFILE=tagrelay-prod** for all AWS operations.

6. **Build Lambda bundles BEFORE deploying:**
   ```bash
   # For Worker
   cd apps/worker && npm run build:lambda
   
   # For API
   cd apps/api && npm run build:lambda
   ```

7. **If user asks to "deploy" without specifying what**, ask which component:
   - Full deployment (all stacks)
   - Worker Lambda only
   - API Lambda only
   - Web app only

8. **After deployment, ALWAYS verify:**
   ```bash
   # Check Worker Lambda
   AWS_PROFILE=tagrelay-prod aws lambda get-function \
     --function-name tag-relay-worker-production \
     --region eu-north-1 \
     --query 'Configuration.[LastModified, Handler, Timeout]'
   
   # Check logs
   AWS_PROFILE=tagrelay-prod aws logs tail \
     /aws/lambda/tag-relay-worker-production \
     --region eu-north-1 \
     --since 5m
   ```

### What NOT to Do

❌ **NEVER** run individual `aws lambda update-function-code` commands unless using the deployment scripts
❌ **NEVER** assume us-east-1 is the production region
❌ **NEVER** deploy without verifying the AWS account first
❌ **NEVER** skip using the deployment scripts (they have important build steps)
❌ **NEVER** deploy to multiple regions (production is ONLY in eu-north-1)

### When to Deviate

You may ONLY deviate from these deployment requirements if:
1. The user explicitly instructs you to deploy to a different account/region, OR
2. The user explicitly instructs you to use manual AWS CLI commands

In all other cases, ALWAYS use the deployment scripts with the correct profile and region.
