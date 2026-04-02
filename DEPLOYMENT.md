# Tag Relay - Production Deployment Guide

## Architecture Overview

Tag Relay uses a **hybrid multi-region deployment**:

### eu-north-1 (Application Region)
- Database (DynamoDB tables, S3 buckets, SQS queue)
- API Lambda + Worker Lambda
- Web Lambda (Next.js SSR)
- API Gateway with custom domain (`api.ovalt.org`)
- ACM certificate for `api.ovalt.org`

### us-east-1 (CloudFront Region)
- CloudFront distribution for `ovalt.org`
- ACM certificate for `ovalt.org` (required for CloudFront)

**Why hybrid?** CloudFront requires ACM certificates in us-east-1, but all application logic runs in eu-north-1 for lower latency.

---

## Prerequisites

1. **AWS Account** with administrative access
2. **AWS CLI** configured with profile `tagrelay-prod`
3. **Node.js 20+** installed
4. **Domain**: `ovalt.org` registered with Route 53 hosted zone
5. **Google OAuth Clients** (2 separate clients required):
   - OAuth Client #1: User Login
   - OAuth Client #2: GTM Access

---

## Step 1: Configure AWS Profile

```bash
aws configure --profile tagrelay-prod
# AWS Access Key ID: <your-key>
# AWS Secret Access Key: <your-secret>
# Default region: eu-north-1
# Default output format: json
```

---

## Step 2: Set Up Secrets

Run the secrets setup script:

```bash
cd /Users/macleanpinto/Documents/workspace/tag-relay
./scripts/setup-secrets-eu.sh
```

You'll be prompted for:

**Google OAuth #1 (User Login)**
- Client ID
- Client Secret
- Authorized redirect URI: `https://api.ovalt.org/auth/oauth/google/callback`
- Scopes: `openid`, `email`, `profile`

**Google OAuth #2 (GTM Access)**
- Client ID
- Client Secret
- Authorized redirect URI: `https://api.ovalt.org/gtm/oauth/callback`
- Scopes: `tagmanager.edit.containers`, `tagmanager.readonly`, `cloud-platform`

**Optional**: GitHub OAuth, Brave Search API, Bedrock Model ID

The script will:
- Generate secure JWT_SECRET, API_KEY, SERVICE_TOKEN
- Create/update secret `tag-relay/production/app-secrets` in AWS Secrets Manager (eu-north-1)
- Store all credentials securely

---

## Step 3: Build Lambda Functions

```bash
# Build API Lambda
cd apps/api
npm run build:lambda
cd ../..

# Build Web Lambda
cd apps/web-nextjs
NEXT_PUBLIC_API_URL=https://api.ovalt.org npm run build:lambda
cd ../..

# Build Worker Lambda (optional)
cd apps/worker
npm run build:lambda
cd ../..
```

---

## Step 4: Deploy Infrastructure

```bash
cd infra/cdk

# Deploy all stacks (eu-north-1 + us-east-1)
AWS_PROFILE=tagrelay-prod AWS_REGION=eu-north-1 ENVIRONMENT=production \
  npx cdk deploy --all --require-approval never
```

This deploys 4 stacks:
1. **TagRelayDatabaseStack-production** (eu-north-1) - DynamoDB, S3, SQS
2. **TagRelayApiStack-production** (eu-north-1) - API Lambda, Worker, API Gateway
3. **TagRelayWebStack-production** (eu-north-1) - Web Lambda, static assets
4. **TagRelayDomainStack-production** (us-east-1) - CloudFront + SSL

**Note**: CloudFront distribution takes ~15 minutes to deploy. Don't worry if CDK times out - check CloudFormation console to verify completion.

---

## Step 5: Verify Deployment

```bash
# Check API health
curl https://api.ovalt.org/health
# Expected: {"ok":true}

# Check website
curl -I https://ovalt.org
# Expected: HTTP/2 200

# Check static assets
curl -I https://ovalt.org/logo.svg
# Expected: HTTP/2 200
```

---

## Step 6: Configure Google OAuth

In Google Cloud Console, configure your OAuth clients with the exact redirect URIs:

### OAuth Client #1: User Login
**Authorized redirect URIs:**
```
https://api.ovalt.org/auth/oauth/google/callback
```

**Scopes:**
- `openid`
- `email`
- `profile`

### OAuth Client #2: GTM Access
**Authorized redirect URIs:**
```
https://api.ovalt.org/gtm/oauth/callback
```

**Scopes:**
- `https://www.googleapis.com/auth/tagmanager.edit.containers`
- `https://www.googleapis.com/auth/tagmanager.readonly`
- `https://www.googleapis.com/auth/cloud-platform`

---

## Deployed Resources

### DNS Records (Automatic)
- `api.ovalt.org` → API Gateway (eu-north-1)
- `ovalt.org` → CloudFront (us-east-1) → Lambda (eu-north-1)

### Lambda Functions (eu-north-1)
- `tag-relay-api-production`
- `tag-relay-worker-production`
- `tag-relay-web-ssr-production`

### DynamoDB Tables (eu-north-1)
- `tag-relay-imports-production`
- `tag-relay-runs-production`
- `tag-relay-users-production`
- `tag-relay-organizations-production`
- `tag-relay-organization-members-production`
- `tag-relay-sessions-production`
- `tag-relay-api-keys-production`
- `tag-relay-oauth-accounts-production`

### S3 Buckets (eu-north-1)
- `tag-relay-artifacts-production-{account-id}`
- `tag-relay-web-ssr-assets-production-{account-id}`

### CloudFront (us-east-1)
- Distribution: Check CloudFormation output `CloudFrontDistributionId`
- Domain: `ovalt.org`

---

## Updating the Application

### Update API or Worker Code

```bash
cd apps/api
npm run build:lambda
cd ../../infra/cdk

AWS_PROFILE=tagrelay-prod AWS_REGION=eu-north-1 ENVIRONMENT=production \
  npx cdk deploy TagRelayApiStack-production
```

### Update Web Code

```bash
cd apps/web-nextjs
NEXT_PUBLIC_API_URL=https://api.ovalt.org npm run build:lambda
cd ../../infra/cdk

AWS_PROFILE=tagrelay-prod AWS_REGION=eu-north-1 ENVIRONMENT=production \
  npx cdk deploy TagRelayWebStack-production
```

### Invalidate CloudFront Cache (After Web Updates)

```bash
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name tag-relay-domain-production \
  --region us-east-1 \
  --profile tagrelay-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text)

aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*" \
  --profile tagrelay-prod
```

---

## Monitoring

### View Logs

```bash
# API logs
AWS_PROFILE=tagrelay-prod aws logs tail /aws/lambda/tag-relay-api-production --follow --region eu-north-1

# Web logs
AWS_PROFILE=tagrelay-prod aws logs tail /aws/lambda/tag-relay-web-ssr-production --follow --region eu-north-1

# Worker logs
AWS_PROFILE=tagrelay-prod aws logs tail /aws/lambda/tag-relay-worker-production --follow --region eu-north-1
```

### CloudWatch Metrics

Monitor in AWS Console (eu-north-1):
- Lambda function metrics (invocations, errors, duration)
- API Gateway metrics (requests, latency, 4xx/5xx errors)
- DynamoDB metrics (read/write capacity, throttles)
- SQS metrics (messages sent, received, in-flight)

---

## Troubleshooting

### CORS Errors
**Symptoms**: `Access-Control-Allow-Origin` error in browser console

**Solution**:
- Verify API Gateway CORS allows `https://ovalt.org`
- Check `allowCredentials: true` in infra/cdk/lib/api-stack.ts
- Redeploy API stack if changed

### OAuth Errors
**Symptoms**: `redirect_uri_mismatch` or `OAuth provider not configured`

**Solution**:
- Verify redirect URIs in Google Cloud Console match exactly
- Check secrets in AWS Secrets Manager (eu-north-1):
  ```bash
  AWS_PROFILE=tagrelay-prod aws secretsmanager get-secret-value \
    --secret-id tag-relay/production/app-secrets \
    --region eu-north-1
  ```
- Confirm Lambda has IAM permission to read secrets
- Redeploy API Lambda if secrets changed

### Static Assets 404
**Symptoms**: JavaScript/CSS/images return 404 errors

**Solution**:
- Check S3 bucket has assets deployed:
  ```bash
  AWS_PROFILE=tagrelay-prod aws s3 ls \
    s3://tag-relay-web-ssr-assets-production-{account-id}/_next/static/
  ```
- Verify CloudFront cache behaviors for `_next/static/*`
- Invalidate CloudFront cache

### Lambda Errors
**Symptoms**: 500 errors, timeouts, or crashes

**Solution**:
- Check Lambda logs in CloudWatch (eu-north-1)
- Verify environment variables are set
- Confirm IAM role has required permissions (DynamoDB, S3, SQS, Secrets Manager)
- Increase memory if hitting limits (default: 1024 MB)

### CloudFront Deployment Timeout
**Symptoms**: CDK deployment times out after 10+ minutes

**Note**: This is normal! CloudFront distributions take 15-20 minutes.

**Solution**:
- Check CloudFormation console (us-east-1) for actual status
- Stack status should be `UPDATE_COMPLETE` or `CREATE_COMPLETE`
- If stuck, check CloudFront distribution status in console

---

## Rollback

To rollback a deployment:

```bash
cd infra/cdk

# Rollback specific stack
AWS_PROFILE=tagrelay-prod AWS_REGION=eu-north-1 ENVIRONMENT=production \
  npx cdk deploy TagRelayApiStack-production --previous-parameters
```

Or manually via AWS Console:
1. Go to CloudFormation (eu-north-1)
2. Select the stack
3. Click "Update" → "Replace current template"
4. Choose "Use a previous template version"

---

## Teardown

⚠️ **Warning**: This deletes all data permanently!

```bash
cd infra/cdk

# Destroy all stacks
AWS_PROFILE=tagrelay-prod AWS_REGION=eu-north-1 ENVIRONMENT=production \
  npx cdk destroy --all

# Delete secrets
AWS_PROFILE=tagrelay-prod aws secretsmanager delete-secret \
  --secret-id tag-relay/production/app-secrets \
  --force-delete-without-recovery \
  --region eu-north-1
```

---

## Cost Estimate

### Monthly Cost (Production, 100k API requests)

| Service | Region | Cost | Details |
|---------|--------|------|---------|
| Lambda (API) | eu-north-1 | $2-3 | 100k invocations @ 500ms |
| Lambda (Web) | eu-north-1 | $3-5 | 50k page views @ 500ms |
| Lambda (Worker) | eu-north-1 | $1-2 | 1k migrations @ 60s |
| DynamoDB | eu-north-1 | $5-8 | On-demand pricing |
| S3 | eu-north-1 | $1-2 | Storage + requests |
| SQS | eu-north-1 | $0.50 | 1k messages |
| Secrets Manager | eu-north-1 | $0.80 | 2 secrets @ $0.40 |
| API Gateway | eu-north-1 | $1-2 | HTTP API pricing |
| CloudFront | us-east-1 | $5-10 | Data transfer + requests |
| ACM Certificates | Free | $0 | SSL certificates |
| Route 53 | Global | $1 | Hosted zone + queries |
| **TOTAL** | | **$20-35** | Variable with traffic |

**At scale (1M API requests/month)**: ~$70-100/month

---

## Production Checklist

- [ ] AWS profile configured for `tagrelay-prod`
- [ ] Secrets created in AWS Secrets Manager (eu-north-1)
- [ ] Google OAuth clients created with correct redirect URIs
- [ ] Lambda functions built and bundled
- [ ] All 4 CDK stacks deployed successfully
- [ ] DNS records resolving correctly (api.ovalt.org, ovalt.org)
- [ ] SSL certificates validated (both regions)
- [ ] API health endpoint responding
- [ ] Website loading without errors
- [ ] Static assets loading from CloudFront/S3
- [ ] OAuth login flow working
- [ ] GTM OAuth flow working
- [ ] CloudWatch logs enabled
- [ ] Billing alerts configured (optional)

---

## Support

For issues or questions:
- **Documentation**: Check `docs/` directory
- **Local Testing**: See [LOCAL-TESTING.md](LOCAL-TESTING.md)
- **GitHub Issues**: Report bugs or feature requests

---

**Deployment complete!** Your Tag Relay application is now running on AWS. 🚀
