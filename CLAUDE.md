# CLAUDE.md

Project memory and operating guide for AI coding sessions in this repository.

## Project Overview

- **Project name:** Tag Relay
- **Current status:** Production-ready, ready for AWS deployment
- **Goal:** Build a tool that helps marketing and analytics teams migrate client-side tags to server-side tagging with minimal manual work and low risk.

## Source Context

- Product requirements are in `docs/PRD-2026-03-26.md`.
- Architecture documentation is in `docs/system-design.md`.
- Deployment guide is in `DEPLOYMENT.md`.

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
- Agency-oriented multi-client support.
- Advanced routing/transforms and anomaly detection.

## Technical Working Agreements

- Keep implementations incremental and testable.
- Prefer clear, auditable transformations over opaque magic.
- Treat migration correctness as the top quality attribute.
- Avoid destructive operations unless explicitly requested.
- Keep docs in sync with code changes.
- Prefer provider documentation evidence when assigning migration confidence.

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

## Production Configuration

### OAuth Setup
- **Google OAuth Client ID**: `544490190265-jrbhu2jedno8lsn2m02ihu5s4c5hgocc`
- **Redirect URIs configured**:
  - Production user login: `https://api.ovalt.org/auth/oauth/google/callback`
  - Production GTM access: `https://api.ovalt.org/gtm/oauth/callback`
  - Local development: `http://localhost:3001/auth/oauth/google/callback`
  - Local GTM: `http://localhost:3001/gtm/oauth/callback`

### Infrastructure
- **Primary Region**: eu-north-1 (Database, API, Web Lambda)
- **CloudFront Region**: us-east-1 (Domain/CDN)
- **S3 Buckets**: Artifacts, Web static assets (public read enabled)
- **Lambda Functions**: API, Web SSR, Worker
- **DynamoDB**: 8 tables with multi-tenancy support

## Important Notes

### Lambda Caching Behavior
Lambda functions cache the Fastify app instance on first invocation for performance. This means:
- Environment variable changes require Lambda container refresh
- Use `aws lambda update-function-configuration --description "$(date +%s)"` to force restart
- Normal CDK deployments automatically refresh containers with new code

### OAuth Flow
- OAuth URLs include cache-control headers to prevent browser caching
- AuthContext skips auth check on `/auth/callback` page to prevent race condition
- Token storage happens before any auth validation to avoid redirect loops

### Deployment Process
```bash
# Standard deployment (updates code + env vars together)
npm run deploy:production

# Manual Lambda update (when env vars change without code deploy)
cd apps/api && npm run build:lambda
cd ../../apps/api/dist && zip -r /tmp/api.zip .
aws lambda update-function-code --function-name tag-relay-api-production --zip-file fileb:///tmp/api.zip --publish

# Force Lambda container refresh (clears cache)
aws lambda put-function-concurrency --function-name tag-relay-api-production --reserved-concurrent-executions 0
sleep 5
aws lambda delete-function-concurrency --function-name tag-relay-api-production
```

### CloudFormation Stacks
All stacks in healthy state:
- `tag-relay-database-production` (eu-north-1)
- `tag-relay-api-production` (eu-north-1)
- `tag-relay-web-production` (eu-north-1)
- `tag-relay-domain-production` (us-east-1)
