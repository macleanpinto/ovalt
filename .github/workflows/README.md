# GitHub Actions Workflows

Automated CI/CD pipeline for Tag Relay using AWS CDK.

## Active Workflow

### deploy-cdk-production.yml

**Trigger:** Push to `main` branch or manual workflow dispatch

**What it does:**
1. Builds all applications (API, Worker, Next.js)
2. Deploys infrastructure with CDK (`cdk deploy --all`)
3. Outputs API and Web URLs

**Environment:** Production

**Required Secrets:**
- `AWS_ROLE_ARN` - IAM role for OIDC authentication

**Required Variables:**
- `PRODUCTION_API_URL` - API URL for web app build (e.g., `https://api.tagrelay.io`)

**Usage:**
```bash
# Automatic deployment
git push origin main

# Manual deployment
# Go to Actions tab → deploy-cdk-production → Run workflow
```

## Setup

### 1. Configure AWS OIDC

```bash
# Create GitHub Actions role with OIDC
# See: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
```

### 2. Add GitHub Secrets

Go to: Repository → Settings → Secrets and variables → Actions

**Secrets:**
```
AWS_ROLE_ARN=arn:aws:iam::ACCOUNT_ID:role/GitHubActionsRole
```

**Variables:**
```
PRODUCTION_API_URL=https://api.tagrelay.io
```

### 3. Test Workflow

```bash
git commit -m "Test deployment"
git push origin main
```

## Deployment Process

1. **Checkout code**
2. **Setup Node.js 20**
3. **Configure AWS credentials** (OIDC)
4. **Install root dependencies**
5. **Build API** (`apps/api`)
6. **Build Worker** (`apps/worker`)
7. **Build Next.js** (`apps/web-nextjs`)
8. **Install CDK dependencies** (`infra/cdk`)
9. **Build CDK** TypeScript → JavaScript
10. **CDK Synth** (validate)
11. **CDK Deploy** (all stacks)
12. **Get Outputs** (API URL, Web URL)
13. **Deployment Summary** (GitHub Actions summary)

**Total Time:** ~10-15 minutes

## Stacks Deployed

1. `TagRelayDatabaseStack-production` - DynamoDB, S3, SQS
2. `TagRelayApiStack-production` - API & Worker Lambda
3. `TagRelayWebStack-production` - Next.js SSR Lambda

## Outputs

After deployment, workflow outputs:
- **API URL** - API Gateway endpoint
- **Web URL** - Lambda Function URL

Check the GitHub Actions summary for URLs.

## Troubleshooting

### Issue: Workflow fails at build step

**Solution:** Ensure apps build locally:
```bash
cd apps/api && npm ci && npm run build
cd apps/worker && npm ci && npm run build
cd apps/web-nextjs && npm ci && npm run build:lambda
```

### Issue: CDK deploy fails

**Check:**
- AWS credentials configured correctly
- CDK bootstrap ran in AWS account
- Secrets created in AWS Secrets Manager

### Issue: Permission denied

**Solution:** Check IAM role has necessary permissions:
- Lambda (create, update, invoke)
- API Gateway (create, update)
- DynamoDB (create, update)
- S3 (create, putObject)
- SQS (create, send)
- CloudFormation (all)

## Manual Deployment

If workflow fails, deploy manually:

```bash
# Build all apps
cd apps/api && npm ci && npm run build && cd ../..
cd apps/worker && npm ci && npm run build && cd ../..
cd apps/web-nextjs && npm ci && npm run build:lambda && cd ../..

# Deploy with CDK
cd infra/cdk
ENVIRONMENT=production npm run deploy
```

## Monitoring

View deployment logs:
- GitHub Actions → Actions tab → Latest workflow run
- AWS CloudFormation → Stacks
- CloudWatch Logs → Lambda function logs

---

**Note:** This workflow uses AWS CDK for infrastructure as code. No Docker images or ECS required.
