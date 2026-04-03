# GitHub Actions

**Workflow:** `deploy-cdk-production.yml` — on push to `main` (or manual dispatch), builds API/worker/web, then `cdk deploy` for production.

**Secrets:** `AWS_ROLE_ARN` — IAM role ARN for GitHub OIDC ([AWS setup](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)).

**Variables:** `PRODUCTION_API_URL` — e.g. `https://api.ovalt.org` (used when building the web app).

If the workflow fails, build locally (`apps/api`, `apps/worker`, `apps/web-nextjs`) then run `npm run deploy:production` from the repo root. See the root [README.md](../../README.md).
