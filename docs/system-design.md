# Tag Relay System Design (MVP Finalized Baseline)

## 1) Purpose and Scope

Tag Relay helps marketing and analytics engineers migrate client-side tracking setups to server-side tagging with minimal manual work and high confidence.

This document defines the finalized MVP architecture baseline that satisfies the PRD must-haves:

1. Automated migration of existing tag configurations.
2. Minimal frontend changes.
3. Built-in validation and accuracy checks.
4. Fast, guided setup.
5. Privacy/compliance-first defaults.

Finalized decisions in this document are the default reference for implementation unless superseded by a new ADR in `.claude/memory-bank/decisions.md`.

## 2) Design Principles

- **Correctness first:** Prefer deterministic, auditable transformations.
- **Human-in-the-loop safety:** Uncertain mappings become explicit manual actions.
- **Incremental delivery:** Ship a vertical slice before broad tag coverage.
- **Separation of concerns:** Ingestion, transformation, validation, and reporting are separate services.
- **Compliance by default:** Consent and PII checks are baseline behavior.
- **Docs-over-guessing:** Prefer provider-documented mappings and setup flows over inferred behavior.

## 3) High-Level Architecture

```text
┌─────────────────────────────────────────────────┐
│                AWS Lambda Functions              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────┐│
│  │  API Lambda  │  │Worker Lambda │  │Web SSR ││
│  │  (Fastify)   │  │ (Migrations) │  │Next.js ││
│  └──────┬───────┘  └──────┬───────┘  └────┬───┘│
└─────────┼──────────────────┼───────────────┼───┘
          │                  │               │
          ↓                  ↓               ↓
┌─────────────────────────────────────────────────┐
│              AWS Services (Shared)               │
│  - DynamoDB (database)                          │
│  - S3 (raw files + artifacts + web assets)     │
│  - SQS (job queue)                              │
│  - Secrets Manager (credentials)                │
│  - API Gateway (HTTP API for API Lambda)       │
│  - Lambda Function URL (for Web SSR)           │
└─────────────────────────────────────────────────┘
```

**Serverless Architecture:** No ECS, No VPC, No Docker containers. Pure Lambda functions.

## 4) System Components

### 4.1 API Lambda (tag-relay-api-production)

**Runtime:** AWS Lambda with Fastify + aws-lambda-fastify adapter

Responsibilities:
- Accept imports and migration run requests.
- Expose status, reports, and artifacts.
- Return stable, typed API responses.
- User authentication and session management.
- OAuth integration (Google, GitHub).
- API key authentication.
- Organization and tenant management.

Initial endpoints:
- `POST /imports/gtm-web-container`
- `POST /migrations/:importId/run`
- `GET /migrations/:runId`
- `GET /migrations/:runId/report`
- `GET /migrations/:runId/artifacts`
- `POST /auth/register`, `POST /auth/login`
- `GET /auth/oauth/:provider`, `GET /auth/oauth/:provider/callback`
- `GET /organizations`, `POST /api-keys`

**Deployment:** API Gateway HTTP API → Lambda function (30s timeout, 1024MB memory)

### 4.2 Import Service

Responsibilities:
- Validate upload format (GTM web container JSON for MVP).
- Store raw payload in object storage.
- Create import metadata record.

Failure cases:
- Invalid JSON.
- Unsupported container schema version.
- Oversized payload.

### 4.3 Normalization Service

Responsibilities:
- Convert source-specific entities into canonical entities.
- Resolve references (variables, triggers, dependencies).
- Produce a canonical graph for transformation.

Outputs:
- Canonical tags, triggers, variables, event candidates.
- Normalization warnings (missing references, malformed entities).

### 4.4 Rule Engine / Transformer

Responsibilities:
- Apply deterministic mapping rules from canonical model to server-side model.
- Assign confidence score per mapping.
- Generate manual review actions for low confidence or unsupported types.

Rule characteristics:
- Versioned ruleset (`ruleset_version`).
- `match`, `transform`, `constraints`, and `manual_review_conditions`.

### 4.5 Validation Service

Responsibilities:
- Run static quality checks.
- Run event parity checks on transformed output.
- Produce confidence and drift summaries.

Validation output:
- Pass/fail checks by severity.
- Event-level parity matrix.
- Overall migration confidence score.

### 4.6 Report Service

Responsibilities:
- Produce machine-readable report (JSON).
- Produce user-readable report (Markdown).
- Include manual checklist and frontend change steps.

### 4.7 Worker Lambda (tag-relay-worker-production)

**Runtime:** AWS Lambda with SQS event source mapping

Responsibilities:
- Process migration jobs from SQS queue.
- Import and normalize GTM containers.
- Apply rule engine transformations.
- Run validation checks.
- Generate reports and artifacts.
- Store results in DynamoDB and S3.

**Trigger:** SQS event source mapping (batch size: 1, max concurrency: 10)

**Queue Architecture:**
- Decouple API response time from heavy migration work.
- Buffer burst traffic across multiple migration requests.
- Provide retry behavior and dead-letter handling for failed jobs.
- Lambda automatically scales workers based on queue depth.

Why queue is needed:
- Migration runs can take 30-90 seconds (exceeds API Gateway timeout).
- Worker retries are safer than retrying end-user API calls.
- Queue-based processing keeps the user experience responsive.

**Deployment:** Lambda function (90s timeout, 2048MB memory) triggered by SQS

### 4.8 Web SSR Lambda (tag-relay-web-ssr-production)

**Runtime:** AWS Lambda with Next.js 14 + OpenNext adapter

Responsibilities:
- Server-side render React application.
- Serve landing page, dashboard, auth pages.
- OAuth login flow UI.
- Real-time migration status display.
- SEO-optimized HTML output.

**Deployment:** Lambda Function URL (public access, 30s timeout, 1024MB memory)

**Static Assets:** Served from S3 bucket (tag-relay-web-ssr-assets-production)

**Benefits of SSR:**
- Fast initial page load (200-500ms TTFB).
- SEO-friendly (search engines see full HTML).
- Social sharing previews work correctly.
- Progressive enhancement (works without JavaScript).

### 4.9 GTM Server-Side Container Provisioning

Responsibilities:
- Ensure a GTM server-side container is created as part of migration.
- Track provisioning status and resulting container identifiers.
- Fail safely with actionable remediation when provisioning cannot complete.

MVP behavior:
- Migration requires a target GTM SS container.
- If no target exists, the system guides or automates container creation before mapping finalization.
- Final report includes container metadata and setup verification checklist.

## 5) Data Model (Implementation)

### DynamoDB Tables

**Authentication and Multi-Tenancy:**

- `tag-relay-users`
  - PK: `userId`
  - GSI: `email-index` (for login lookup)
  - Attributes: `email`, `passwordHash`, `name`, `avatar`, `createdAt`

- `tag-relay-organizations`
  - PK: `organizationId`
  - Attributes: `name`, `ownerId`, `plan`, `createdAt`

- `tag-relay-organization-members`
  - PK: `organizationId`, SK: `userId`
  - Attributes: `role` (owner, admin, member, viewer), `joinedAt`

- `tag-relay-sessions`
  - PK: `sessionId`
  - GSI: `userId-index`
  - Attributes: `userId`, `expiresAt`, `createdAt`

- `tag-relay-api-keys`
  - PK: `keyId`
  - GSI: `organizationId-index`
  - Attributes: `organizationId`, `hashedKey`, `scopes`, `name`, `expiresAt`

- `tag-relay-oauth-accounts`
  - PK: `oauthAccountId`
  - GSI1: `provider-providerId-index` (for OAuth login)
  - GSI2: `userId-index` (for user's linked accounts)
  - Attributes: `provider`, `providerId`, `userId`, `accessToken`, `refreshToken`, `expiresAt`

**Migration Data:**

- `tag-relay-imports`
  - PK: `importId`
  - GSI: `organizationId-index` (for tenant isolation)
  - Attributes: `organizationId`, `projectId`, `sourceType`, `rawBlobUri`, `status`, `createdAt`

- `tag-relay-runs`
  - PK: `runId`
  - GSI1: `organizationId-index` (for tenant isolation)
  - GSI2: `importId-index`
  - Attributes: `organizationId`, `importId`, `rulesetVersion`, `status`, `confidenceScore`, `summaryCounts`

**Legacy tables (to be migrated):**
- `projects` → replaced by organizations
- `migration_runs` → renamed to `tag-relay-runs`
- `run_artifacts` → stored in S3 with metadata in runs
- `run_findings` → embedded in run reports (S3)

### Status Enums

- Import status: `uploaded | normalized | failed`
- Run status: `queued | running | completed | needs_review | failed`
- Severity: `info | warning | error | critical`

## 6) Migration Pipeline (Detailed)

**Setup Phase:**
1. User registers or logs in (email/password or OAuth with Google/GitHub)
2. System creates user account and organization
3. User generates API key (optional, for programmatic access)

**Import Phase:**
4. User uploads GTM web container JSON via UI or API
5. API Lambda validates JWT/API key and tenant scope
6. Import Service validates JSON schema and stores raw file in S3
7. Import record created in DynamoDB with `organizationId`

**Migration Phase:**
8. User triggers migration run via UI or API
9. API verifies GTM SS container status (optional, non-blocking)
10. If container not ready, system records warnings but proceeds
11. API creates `migration_runs` record with status `queued`
12. API sends `runId` message to SQS queue
13. Worker Lambda triggered by SQS event source mapping
14. Worker fetches import from S3 and builds canonical graph
15. Rule Engine (v2.0.0) maps canonical entities to server-side patterns
16. Validation Service computes static checks, parity, and compliance scans
17. Container provisioning verification runs (7-state model)

**Report Phase:**
18. Report Service generates:
    - Executive summary with confidence score
    - Detailed mappings with evidence
    - Validation results and compliance flags
    - Manual action checklist
    - Container provisioning status and guide
    - JSON + Markdown artifacts
19. Worker stores artifacts in S3
20. Worker updates run record with final status

**Delivery Phase:**
21. API returns run summary via GET /migrations/:runId
22. User downloads report and artifacts
23. User reviews manual actions and provisions container if needed
24. User deploys transformed configuration to GTM SS

## 7) API Contract (MVP Draft)

### `POST /imports/gtm-web-container`

Request:
- multipart file or JSON body with container export.

Response:
- `importId`
- validation summary
- initial status

### `POST /migrations/:importId/run`

Request:
- optional `rulesetVersion`

Response:
- `runId`
- status `queued`

### `GET /migrations/:runId`

Response:
- status
- confidence score (if available)
- counts: mappings, warnings, manual actions
- target container metadata and provisioning status

### `GET /migrations/:runId/report`

Response:
- report object with:
  - executive summary
  - parity matrix
  - compliance flags
  - manual actions

### `GET /migrations/:runId/artifacts`

Response:
- downloadable artifact links:
  - transformed package
  - report JSON
  - report Markdown

## 8) Security and Compliance

### Authentication and Authorization

**User Authentication:**
- JWT sessions (HS256) with 7-day expiry
- Password hashing with bcrypt (10 rounds)
- OAuth 2.0 with Google and GitHub
- CSRF protection via state tokens (10-minute expiry)

**API Authentication:**
- Bearer token (JWT) for user sessions
- API keys with SHA-256 hashing and scope-based permissions
- Service tokens for internal worker→API communication

**Multi-Tenant Isolation:**
- DynamoDB partition keys with `organizationId`
- Condition expressions prevent cross-tenant reads/writes
- GSIs for tenant-scoped queries
- Role-Based Access Control (RBAC) with 4 roles:
  - Owner (all permissions)
  - Admin (manage members, create migrations)
  - Member (create migrations, view data)
  - Viewer (read-only access)

**16 Granular Permissions:**
- imports: read, write, delete
- runs: read, write, delete
- organization: read, update, delete
- members: read, invite, remove, update_roles
- api_keys: read, create, revoke

### Secrets Management

- **AWS Secrets Manager** for runtime secret loading
- No secrets in code, environment variables, or logs
- Secrets loaded at Lambda startup via entrypoint script
- Automatic rotation support (access tokens, refresh tokens)

### Data Protection

- Encrypt data at rest in DynamoDB (AWS managed keys)
- Encrypt data at rest in S3 (SSE-S3)
- Encrypt data in transit (HTTPS/TLS 1.2+)
- Redact secrets in logs and reports
- Detect likely PII fields in parameters
- Include consent-state checks in validation phase

### Compliance

- GDPR/CCPA-aware validation rules
- Audit metadata for each run (ruleset version, timestamps, actor)
- OAuth token storage with secure rotation
- Session expiry and cleanup
- API key scoping and expiration

## 9) Non-Functional Requirements

- **Reliability:** Idempotent run trigger; retry safe jobs.
- **Performance:** Handle medium GTM exports (<10 MB) within minutes.
- **Observability:** Structured logs + run-level metrics.
- **Maintainability:** Rule packs are versioned and unit tested.

## 10) Technology Choices (Implementation)

### Compute
- **API:** AWS Lambda with Fastify + aws-lambda-fastify adapter
- **Worker:** AWS Lambda with SQS event source mapping
- **Web:** AWS Lambda with Next.js 14 + OpenNext adapter
- **Runtime:** Node.js 20 + TypeScript

### Database and Storage
- **Database:** DynamoDB (on-demand pricing)
- **Queue:** SQS (standard queue)
- **Storage:** S3 (for raw files, artifacts, web assets)
- **Secrets:** AWS Secrets Manager (runtime loading)

### API Gateway
- **API:** API Gateway HTTP API (REST)
- **Web:** Lambda Function URL (direct HTTP access)

### Local Development
- **Infrastructure:** Docker Compose + LocalStack
- **Services:** Local DynamoDB, SQS, S3

### CI/CD
- **Deployment:** GitHub Actions with OIDC (no long-lived credentials)
- **Packaging:** ZIP deployment (no Docker images)

### Why Lambda vs ECS?

| Aspect | Lambda | ECS Fargate |
|--------|--------|-------------|
| **Cost (100k requests)** | $13-20/month | $110/month |
| **Scaling** | Automatic 0→1000s | Manual or auto-scaling groups |
| **Cold start** | 1-2s (first request) | N/A (always running) |
| **Maintenance** | Zero (managed) | Container updates, health checks |
| **VPC** | Not required | Required for RDS, etc. |
| **Deployment** | 30 seconds | 2-3 minutes |

**Cost Savings:** 82% reduction ($90/month saved)

**Tradeoffs:**
- ✅ Lambda wins: Cost, simplicity, automatic scaling, faster deployments
- ❌ Lambda loses: Cold starts (mitigated with provisioned concurrency), 15-minute max runtime

**Decision:** Lambda is optimal for Tag Relay's workload characteristics:
- Variable traffic (not steady-state)
- Bursty migrations (not continuous processing)
- Small team (minimal maintenance)
- Cost-sensitive MVP phase

## 11) MVP Boundaries

In scope:
- GTM web container import.
- Core mappings: GA4 basics, Meta Pixel basics, selected custom patterns.
- Static + parity validation.
- JSON/Markdown migration reports.

Out of scope (later phases):
- Full UI wizard with deep customization.
- Broad template marketplace.
- AI anomaly detection over live streams.
- Multi-tenant agency feature set.

## 12) Confidence Scoring

Scoring model:
- Use a 0-10 score per mapping and aggregate weighted run-level score.
- Weight higher-impact entities (conversion tags, revenue events, consent flows) more heavily.

Primary scoring path (required):
- **Documentation-grounded scoring** using provider docs and known implementation references.
- Mapping records store evidence metadata (`evidenceType`, `evidenceRef`, `rulesetVersion`).

Fallback scoring path:
- If no relevant documentation/example exists, use an agent-based evaluator to assign provisional score.
- Agent-scored mappings are marked `provisional=true` and require manual review before final acceptance.

Acceptance thresholds:
- `9.0-10.0`: auto-accepted, no manual action unless critical compliance finding exists.
- `7.0-8.9`: accepted with review recommendation.
- `5.0-6.9`: manual review required.
- `<5.0`: blocked from automated publish, must be manually resolved.

## 13) Risks and Mitigations

- **Risk:** Unsupported or unusual tag patterns.
  - **Mitigation:** Emit manual actions with clear recommendations.
- **Risk:** False confidence from partial mapping.
  - **Mitigation:** Conservative confidence scoring and explicit unknowns.
- **Risk:** Compliance gaps from custom payload fields.
  - **Mitigation:** PII detection and policy checks in validation.
- **Risk:** Scope creep before stable core pipeline.
  - **Mitigation:** Strict MVP boundary and phased roadmap.

## 14) Deployment and Infrastructure

### Local Development

**Prerequisites:**
- Node.js 20+
- Docker + Docker Compose
- AWS CLI (for production deployment)

**Setup:**
```bash
# Start LocalStack (local AWS services)
docker-compose up -d

# Initialize DynamoDB tables
./infra/localstack/init-auth.sh

# Start API Lambda locally
npm run -w @tag-relay/api dev

# Start Worker Lambda locally
npm run -w @tag-relay/worker dev

# Start Next.js web app
cd apps/web-nextjs && npm run dev
```

### Production Deployment

**Infrastructure Setup (One-Time):**
```bash
# Bootstrap AWS CDK (one-time per account)
npm install -g aws-cdk
cdk bootstrap

# Configure secrets
./scripts/setup-secrets.sh production

# Deploy infrastructure with CDK
cd infra/cdk
npm ci && npm run build
ENVIRONMENT=production npm run deploy
```

**Code Deployment:**
```bash
# Deploy all services with AWS CDK
cd infra/cdk
ENVIRONMENT=production npm run deploy

# Or deploy specific stacks
cdk deploy TagRelayDatabaseStack-production
cdk deploy TagRelayApiStack-production
cdk deploy TagRelayWebStack-production
```

**CI/CD Pipeline:**
- GitHub Actions workflow triggers on push to `main`
- OIDC authentication (no long-lived credentials)
- Parallel deployment of API, Worker, and Web
- Automatic rollback on failure

### Monitoring

**CloudWatch Logs:**
- `/aws/lambda/tag-relay-api-production`
- `/aws/lambda/tag-relay-worker-production`
- `/aws/lambda/tag-relay-web-ssr-production`

**CloudWatch Metrics:**
- Lambda invocations, duration, errors
- API Gateway 4xx/5xx errors
- SQS queue depth and age
- DynamoDB read/write capacity

**Alarms (Recommended):**
- Lambda error rate > 1%
- API Gateway 5xx rate > 0.5%
- SQS queue depth > 100
- Worker Lambda duration > 80s

## 15) Delivery Plan

### Phase 1: Foundation ✅ **COMPLETED**
- Next.js web app (SSR + Tailwind)
- API skeleton (Fastify on Lambda)
- DynamoDB tables (users, organizations, imports, runs)
- Import flow with S3 storage
- SQS queue + Worker Lambda
- LocalStack development environment

### Phase 2: Transformation Core ✅ **COMPLETED**
- Canonical schema for GTM entities
- Rule engine v2.0.0 with 30+ production rules
- Mapping packs (GA4, social, ads, consent, custom)
- Priority-based matcher with constraints
- Evidence-based confidence scoring

### Phase 3: Validation and Reporting ✅ **COMPLETED**
- Static checks (PII detection, consent validation)
- Parity matrix computation
- Compliance scanning (GDPR/CCPA)
- Report generation (JSON + Markdown)
- Artifact storage in S3

### Phase 4: Authentication and Multi-Tenancy ✅ **COMPLETED**
- User registration and login
- JWT session management
- OAuth integration (Google + GitHub)
- API key generation with scopes
- Organization management
- Role-Based Access Control (4 roles, 16 permissions)
- Tenant-scoped data access

### Phase 5: Container Provisioning ✅ **COMPLETED**
- 7-state verification model
- Multi-provider support (Google Cloud, Stape, TAGGRS)
- Automated validation checks
- Provisioning guide generation
- Non-blocking design (warnings, not errors)

### Phase 6: Next.js SSR ✅ **COMPLETED**
- Next.js 14 with App Router
- Server-Side Rendering on Lambda
- Landing page, dashboard, auth UI
- OpenNext deployment adapter
- Lambda Function URL
- SEO optimization

### Phase 7: Hardening (IN PROGRESS)
- Integration tests (API ↔ Worker ↔ DynamoDB)
- End-to-end tests (full migration flow)
- SQS dead-letter queue policy
- Retry/idempotency improvements
- CloudWatch dashboards
- Billing alerts

### Phase 8: Future Enhancements
- Custom domain setup (Route 53 + ACM)
- CloudFront distribution for web app
- Provisioned concurrency (eliminate cold starts)
- Advanced monitoring and alerting
- Multi-region deployment
- Agency features (multi-client management)

## 16) Cost Analysis

### Monthly Cost Estimate (Production)

**Assumptions:**
- 100,000 API requests per month
- 1,000 migrations per month
- 50,000 web page views per month
- On-demand pricing (no reserved capacity)

| Service | Cost | Details |
|---------|------|---------|
| **Lambda - API** | $2-5 | 100k invocations @ 500ms avg, 1024MB |
| **Lambda - Worker** | $1-2 | 1k migrations @ 60s avg, 2048MB |
| **Lambda - Web SSR** | $3-6 | 50k page views @ 500ms avg, 1024MB |
| **API Gateway** | $1 | 100k requests @ $1/million |
| **DynamoDB** | $5 | On-demand, ~1GB storage, 100k reads/writes |
| **S3** | $1 | ~10GB storage, 100k requests |
| **SQS** | $0.50 | 1k messages @ $0.40/million |
| **Secrets Manager** | $1 | 2 secrets @ $0.40/secret/month |
| **CloudWatch Logs** | $0.50 | ~1GB logs |
| **TOTAL** | **$15-20/month** | Variable with traffic |

### At Scale (1M API requests, 10k migrations)

| Service | Cost |
|---------|------|
| Lambda - API | $20-30 |
| Lambda - Worker | $10-15 |
| Lambda - Web SSR | $30-40 |
| API Gateway | $3 |
| DynamoDB | $15 |
| S3 | $3 |
| SQS | $4 |
| Secrets Manager | $1 |
| CloudWatch | $2 |
| **TOTAL** | **~$90-115/month** |

### Cost Comparison: Lambda vs ECS Fargate

| Aspect | Lambda (Current) | ECS Fargate (Alternative) |
|--------|------------------|---------------------------|
| **Monthly cost (low traffic)** | $15-20 | $110 |
| **Monthly cost (high traffic)** | $90-115 | $110-150 |
| **Scaling** | Automatic (0→1000s) | Manual/Auto-scaling groups |
| **Idle cost** | $0 (pay per use) | $110 (always running) |
| **Cold starts** | 1-2s (first request) | None (always warm) |
| **Max runtime** | 15 minutes | Unlimited |
| **Maintenance** | Zero (AWS managed) | Container updates, health checks |
| **VPC required** | No | Yes (adds $30-40/month for NAT) |
| **Deployment time** | 30 seconds | 2-3 minutes |

**Cost Savings: 82% reduction at low traffic ($95/month saved)**

**Break-even point:** ~2M API requests/month (Lambda and ECS cost similar)

**Decision:** Lambda is optimal for Tag Relay because:
- Variable traffic patterns (not steady-state)
- Bursty migrations (not continuous processing)
- Small team (minimal maintenance preferred)
- Cost-sensitive during MVP phase
- 15-minute Lambda timeout is sufficient for migrations

### Cost Optimization Strategies

1. **Use Provisioned Concurrency** ($15/month per instance)
   - Eliminates cold starts for critical paths
   - Only enable for API Lambda (not Worker or Web)

2. **Increase Lambda memory** (counterintuitive but effective)
   - More memory = faster CPU = shorter duration = lower cost
   - Test 2048MB vs 1024MB for API Lambda

3. **Enable DynamoDB auto-scaling**
   - Switch from on-demand to provisioned capacity if traffic is predictable
   - Potential 30-50% savings at high volume

4. **Use CloudFront for web app**
   - Cache static assets at edge locations
   - Reduce Lambda invocations by 50-70%
   - Adds $1-3/month but saves $10-20/month

5. **Implement S3 Lifecycle Policies**
   - Archive old artifacts to S3 Glacier after 90 days
   - Delete artifacts after 1 year
   - Saves $0.50-1/month (minimal but adds up)

## 17) Extensibility and Hosting Decisions

### 15.1 Output Format Decision

Use a **hybrid output**:
- Primary: GTM SS container creation + deployable migration artifact package.
- Secondary: generated scripts/checklists for required manual steps.

This preserves automation while remaining resilient for edge cases.

### 15.2 Extensibility Model for Future Providers

Adopt provider plug-ins behind a stable canonical schema:
- `provider-adapter` interface handles ingest + normalization for each source provider.
- `mapping-pack` interface handles provider-specific transformation rules.
- Each pack is versioned and independently testable.

MVP ships GTM-focused adapters/packs first; future providers (for example Taggers) plug into the same interfaces without redesigning core pipeline.

### 15.3 Hosting Priority Decision

Tag Relay is a **SaaS-first product**:
- Multi-tenant API and UI architecture from day one.
- Tenant-aware partitioning keys in DynamoDB.
- Managed queue/storage services and centralized observability.

Self-hosting is not prioritized in MVP scope.
