# Tag Relay

Serverless tool to migrate Google Tag Manager setups from client-side to server-side tagging: API (Fastify on Lambda), migration worker (SQS), Next.js web app, AWS CDK infra.

**Docs:** [docs/system-design.md](docs/system-design.md) (architecture) · [TODO.md](TODO.md) (pending work)

## Requirements

- Node.js 20+, Docker (for LocalStack), AWS CLI (for deploy)
- AWS account; for production, Route 53 + domain (e.g. `ovalt.org` / `api.ovalt.org`)

## Local development

```bash
docker compose up -d
./infra/localstack/init-auth.sh   # DynamoDB tables in LocalStack
npm install
npm run dev:api                   # terminal 1 — API on :3001
npm run dev:worker                # terminal 2
cd apps/web-nextjs && npm run dev # terminal 3 — web on :3000 or :5173 per package.json
```

Copy `.env.example` to `.env` at the repo root and adjust. Run tests: `npm test`.

## Production deployment

**IMPORTANT**: Production AWS Account: `549116506406`, Profile: `tagrelay-prod`, Region: `eu-north-1`

1. **AWS CLI** — configure profile `tagrelay-prod`, default region `eu-north-1` for app stacks.
2. **Secrets** — `./scripts/setup-secrets-eu.sh` creates `tag-relay/production/app-secrets` in Secrets Manager. OAuth: login client redirect `https://<api-host>/auth/oauth/google/callback`; GTM client redirect `https://<api-host>/gtm/oauth/callback`.
3. **Deploy** — use deployment scripts:

```bash
# Full production deployment
./scripts/deploy-production.sh tagrelay-prod

# Quick Worker Lambda update only
./scripts/deploy-worker-only.sh

# Quick API Lambda update only
./scripts/deploy-api-only.sh
```

Or full deployment from repo root: `npm run deploy:production`

**Note**: Deployment scripts automatically use `AWS_PROFILE=tagrelay-prod` and `AWS_REGION=eu-north-1`.

**Regions:** App resources in `eu-north-1`; CloudFront + apex cert in `us-east-1` (see `docs/system-design.md`).

## GitHub Actions

On push to `main`, `.github/workflows/deploy-cdk-production.yml` builds and runs CDK. Configure repo **Secrets** `AWS_ROLE_ARN` (OIDC) and **Variables** `PRODUCTION_API_URL`. Details: [.github/workflows/README.md](.github/workflows/README.md).

## Repository layout

```
apps/api          API + auth + GTM helpers
apps/worker       Migration engine & SQS consumer
apps/web-nextjs   Next.js UI
infra/cdk         AWS CDK stacks
infra/localstack  Local AWS emulation
scripts/          deploy, secrets, dev helpers
```

## License

MIT
