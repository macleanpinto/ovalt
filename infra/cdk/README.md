# Tag Relay CDK Infrastructure

AWS CDK infrastructure for Tag Relay serverless application.

## Architecture

The infrastructure is split into 3 stacks:

1. **Database Stack** - DynamoDB tables, S3 buckets, SQS queue
2. **API Stack** - API Lambda, Worker Lambda, API Gateway
3. **Web Stack** - Next.js SSR Lambda, Function URL

## Prerequisites

```bash
# Install AWS CLI and configure credentials
aws configure

# Install AWS CDK globally
npm install -g aws-cdk

# Bootstrap CDK (one-time per AWS account/region)
cdk bootstrap
```

## Setup

```bash
# Install dependencies
cd infra/cdk
npm install

# Build TypeScript
npm run build
```

## Deployment

### Deploy All Stacks

```bash
# Deploy to production
ENVIRONMENT=production npm run deploy

# Or use CDK directly
cdk deploy --all --require-approval never
```

### Deploy Individual Stacks

```bash
# Database only
cdk deploy TagRelayDatabaseStack-production

# API only
cdk deploy TagRelayApiStack-production

# Web only
cdk deploy TagRelayWebStack-production
```

## Pre-Deployment Steps

### 1. Setup Secrets

Before deploying, create secrets in AWS Secrets Manager:

```bash
cd ../..
./scripts/setup-secrets.sh production
```

### 2. Build Applications

```bash
# Build API
cd apps/api
npm install
npm run build

# Build Worker
cd ../worker
npm install
npm run build

# Build Next.js
cd ../web-nextjs
npm install
npm run build:lambda
```

## Useful Commands

```bash
# View differences
npm run diff

# Synthesize CloudFormation template
npm run synth

# Destroy all stacks (careful!)
npm run destroy
```

## Stack Dependencies

```
TagRelayDatabaseStack
        ↓
TagRelayApiStack
        ↓
TagRelayWebStack
```

The API stack depends on database resources, and the web stack needs the API URL.

## Environment Variables

Set `ENVIRONMENT` to control which environment to deploy:

```bash
ENVIRONMENT=production cdk deploy --all
```

Supported values: `production`, `staging`, `development`

## Cost Estimation

```bash
# Estimate monthly costs
cdk diff --all
```

Expected costs (production):
- Lambda: $5-10/month (variable)
- DynamoDB: $5/month (on-demand)
- S3: $1/month
- SQS: $0.50/month
- API Gateway: $1/month
- **Total: ~$15-20/month**

## Outputs

After deployment, CDK outputs important values:

- `ApiUrl` - API Gateway endpoint
- `WebUrl` - Next.js SSR Function URL
- `ImportsTableName` - DynamoDB table
- `RunsTableName` - DynamoDB table
- `ArtifactsBucketName` - S3 bucket
- `MigrationQueueUrl` - SQS queue URL

Get outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name tag-relay-api-production \
  --query 'Stacks[0].Outputs'
```

## Cleanup

To delete all resources:

```bash
ENVIRONMENT=production npm run destroy
```

⚠️ **Warning:** This will delete all data in DynamoDB tables and S3 buckets (unless retention is enabled).

## Troubleshooting

### Issue: "Resource already exists"

If resources already exist from shell script deployment:

```bash
# Delete old resources manually
aws lambda delete-function --function-name tag-relay-api-production
aws apigatewayv2 delete-api --api-id <api-id>

# Or import existing resources
cdk import
```

### Issue: "Bootstrap stack version mismatch"

```bash
cdk bootstrap --force
```

### Issue: Build fails

Ensure all apps are built before deploying:

```bash
cd apps/api && npm run build
cd apps/worker && npm run build
cd apps/web-nextjs && npm run build:lambda
```

## CI/CD Integration

Update GitHub Actions workflow to use CDK:

```yaml
- name: Deploy with CDK
  run: |
    cd infra/cdk
    npm ci
    npm run build
    ENVIRONMENT=production npm run deploy
```

## Next Steps

After deployment:

1. Update DNS to point to API Gateway and Function URL
2. Configure custom domains (see DEPLOYMENT.md)
3. Setup CloudWatch alarms
4. Enable CloudFront for web app (optional)
