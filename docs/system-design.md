# System design

Tag Relay helps teams move GTM tagging from client-side to server-side with validation, reporting, and tenant-isolated data.

## Principles

- Correctness and auditability over opaque automation.
- Human review for uncertain mappings.
- Ingestion, transform, validation, and reporting stay separate.
- Privacy/consent checks are baseline.
- Prefer provider-documented behavior over guesswork.

## Architecture

```text
┌──────────────────────────────────────────────┐
│  API Lambda     Worker Lambda     Web (SSR)  │
│  (Fastify)      (SQS → migrate)   (Next.js)  │
└────────┬──────────────┬──────────────┬───────┘
         │              │              │
         └──────────────┴──────────────┘
                        │
    DynamoDB · S3 · SQS · Secrets Manager · API Gateway / Function URLs
```

Serverless only: no ECS/VPC for core app. API and worker run in **eu-north-1**; CloudFront + public site cert in **us-east-1** when using a custom apex domain.

## Components

| Piece | Role |
|--------|------|
| **API Lambda** | Imports, runs, reports, artifacts, auth (JWT/OAuth/API keys), orgs |
| **Worker Lambda** | Consumes SQS: normalize container → rules → validate → reports to S3/DynamoDB |
| **Web Lambda** | Next.js SSR + static assets from S3 |
| **SQS** | Decouples long migrations from API timeout |
| **DynamoDB** | Users, orgs, sessions, API keys, OAuth links, imports, runs |
| **S3** | Raw uploads, run artifacts, web static assets |

## Data model (summary)

- **Users / orgs / members** — multi-tenant; runs scoped by `organizationId`.
- **Imports** — GTM web container payload metadata + S3 pointer.
- **Runs** — status, ruleset version, deployment history, links to artifacts.
- **Sessions / API keys / OAuth accounts** — standard auth patterns.

Import status: `uploaded | normalized | failed`. Run status: `queued | running | completed | needs_review | failed`.

## Migration pipeline (short)

1. Authenticate; create import from GTM container JSON.
2. API enqueues `runId` on SQS.
3. Worker builds canonical model, applies rule engine, validates, optional provisioning checks.
4. Artifacts and report (JSON/MD) in S3; run record updated.
5. Client polls API and applies manual steps from the report.

## GTM migration rules (code)

Deployment code maps by **tag type IDs**, not free-text names. Analysis/reporting may use categorization rules in `apps/worker` — see `CLAUDE.md` in the repo root.
