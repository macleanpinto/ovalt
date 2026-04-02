# Tag Relay - Deployment Summary

## Deployment Status

✅ **DEPLOYMENT COMPLETE!** (eu-north-1 + us-east-1)

**Started:** 2026-04-02 12:26 PM
**Completed:** 2026-04-02 6:22 PM (Final fixes)
**Total Time:** ~6 hours (including troubleshooting)

**All Stacks Deployed:**
- ✅ Database Stack (83s) - All 8 DynamoDB tables, 2 S3 buckets, SQS queues
- ✅ API Stack (341s) - api.ovalt.org live, API + Worker Lambdas deployed
- ✅ Web Stack (112s) - Next.js Lambda deployed, static assets in S3
- ✅ Domain Stack (243s) - CloudFront distribution deployed, DNS configured

**Live Endpoints:**
- **API:** https://api.ovalt.org ✅ WORKING
- **Website:** https://ovalt.org ✅ WORKING
- **Privacy:** https://ovalt.org/privacy ✅ WORKING
- **Terms:** https://ovalt.org/terms ✅ WORKING
- **CloudFront:** https://d338lhuuwwiubm.cloudfront.net/ ✅ WORKING

---

## Architecture

### eu-north-1 (Primary Region)
- ✅ 8x DynamoDB Tables (users, organizations, imports, runs, sessions, api-keys, oauth-accounts, organization-members)
- ✅ 2x S3 Buckets (artifacts, web-assets)
- ✅ 1x SQS Queue (migrations)
- ⏳ 3x Lambda Functions (API, Worker, Web SSR)
- ⏳ API Gateway HTTP API with custom domain (api.ovalt.org)
- ⏳ ACM Certificate for api.ovalt.org

### us-east-1 (CloudFront Region)
- ⏳ CloudFront Distribution for ovalt.org
- ⏳ ACM Certificate for ovalt.org

---

## What's Been Configured

### 1. Secrets (AWS Secrets Manager - eu-north-1)
✅ Secret created: `tag-relay/production/app-secrets`

Contains:
- JWT_SECRET (generated)
- API_KEY (generated)
- SERVICE_TOKEN (generated)
- GOOGLE_OAUTH_CLIENT_ID (from .env)
- GOOGLE_OAUTH_CLIENT_SECRET (from .env)
- GTM_OAUTH_CLIENT_ID (from .env)
- GTM_OAUTH_CLIENT_SECRET (from .env)
- GITHUB_OAUTH_CLIENT_ID (from .env)
- GITHUB_OAUTH_CLIENT_SECRET (from .env)
- TAG_RELAY_BRAVE_SEARCH_API_KEY (from .env)
- TAG_RELAY_BEDROCK_MODEL_ID (from .env)

### 2. Lambda Functions Deployed
✅ API Lambda: `tag-relay-api-production` (13MB, eu-north-1)
✅ Web Lambda: `tag-relay-web-ssr-production` (OpenNext, eu-north-1)
✅ Worker Lambda: `tag-relay-worker-production` (connected to SQS, eu-north-1)

**Function URLs:**
- API: https://hdd8mlwf6l.execute-api.eu-north-1.amazonaws.com/
- Web: https://hgwmpr4jubnrykhapkvfozcfhy0bvanz.lambda-url.eu-north-1.on.aws/

**Custom Domains:**
- API: https://api.ovalt.org (configured via API Gateway + Route53)

---

## ✅ Verification

### Test Endpoints Right Now

```bash
# API Health (should return {"ok":true})
curl https://api.ovalt.org/health

# Website (should return HTTP/2 200)
curl -I https://ovalt.org/

# Static Assets (should return HTTP/2 200)
curl -I https://ovalt.org/logo.svg
curl -I https://ovalt.org/_next/static/chunks/webpack-8c3984895765ef14.js
```

**Current Status:**
- ✅ api.ovalt.org - WORKING
- ✅ ovalt.org - WORKING
- ✅ Static assets (JS, CSS, images) - WORKING

**Issues Fixed:**

1. **Static assets 403 errors (2026-04-02 13:33 UTC)**
   - **Problem:** S3 bucket had public access blocked
   - **Fix:** Disabled public access block on S3 bucket
   - **Result:** All static assets now load successfully

2. **OAuth redirect localhost issue (2026-04-02 15:26 UTC)**
   - **Problem:** Lambda cached app with localhost redirect URIs from initial deployment
   - **Fix:** Updated environment variables in CDK, forced Lambda container refresh
   - **Result:** OAuth now correctly redirects to https://api.ovalt.org

3. **Login redirect loop (2026-04-02 15:58 UTC)**
   - **Problem:** AuthContext called /auth/me before callback page stored token
   - **Fix:** Modified AuthContext to skip auth check on /auth/callback page
   - **Result:** Users successfully land on dashboard after OAuth

4. **CloudFormation stack stuck (2026-04-02 18:15 UTC)**
   - **Problem:** Web stack in UPDATE_ROLLBACK_FAILED due to cross-region export dependency
   - **Fix:** Deleted domain stack, rolled back web stack, redeployed both together
   - **Result:** All stacks in healthy state (UPDATE_COMPLETE/CREATE_COMPLETE)

---

## Next Steps

### 1. Update Google OAuth Redirect URIs (REQUIRED)

You need to add production redirect URIs to your existing OAuth clients:

**OAuth Client #1: User Login**
Client ID: `544490190265-jrbhu2jedno8lsn2m02ihu5s4c5hgocc`

Add redirect URI:
```
https://api.ovalt.org/auth/oauth/google/callback
```

Keep existing:
```
http://localhost:3001/auth/oauth/google/callback
```

**OAuth Client #2: GTM Access**
Client ID: `544490190265-oj65k0j0e2n6oo9m2hpeug9js3nne0vg`

Add redirect URI:
```
https://api.ovalt.org/gtm/oauth/callback
```

Keep existing:
```
http://localhost:3001/gtm/oauth/callback
```

#### 2. Verify Endpoints

Once deployed, test:

```bash
# API Health
curl https://api.ovalt.org/health
# Expected: {"ok":true}

# Website
curl -I https://ovalt.org
# Expected: HTTP/2 200

# Static Assets
curl -I https://ovalt.org/logo.svg
# Expected: HTTP/2 200
```

#### 3. Test OAuth Flows

1. Go to https://ovalt.org/auth/login
2. Click "Sign in with Google"
3. Should redirect to Google login
4. After auth, should redirect back to https://ovalt.org/auth/callback

---

## Deployment Commands Reference

### Deploy All Stacks
```bash
cd infra/cdk
AWS_PROFILE=tagrelay-prod AWS_REGION=eu-north-1 ENVIRONMENT=production \
  npx cdk deploy --all --require-approval never
```

### Deploy Individual Stacks
```bash
# Database only
AWS_PROFILE=tagrelay-prod AWS_REGION=eu-north-1 ENVIRONMENT=production \
  npx cdk deploy TagRelayDatabaseStack-production

# API only
AWS_PROFILE=tagrelay-prod AWS_REGION=eu-north-1 ENVIRONMENT=production \
  npx cdk deploy TagRelayApiStack-production

# Web only
AWS_PROFILE=tagrelay-prod AWS_REGION=eu-north-1 ENVIRONMENT=production \
  npx cdk deploy TagRelayWebStack-production

# Domain/CloudFront only (us-east-1)
AWS_PROFILE=tagrelay-prod AWS_REGION=us-east-1 ENVIRONMENT=production \
  npx cdk deploy TagRelayDomainStack-production
```

### Update Code Only
```bash
# Rebuild and redeploy Lambda
cd apps/api && npm run build:lambda && cd ../../infra/cdk
AWS_PROFILE=tagrelay-prod AWS_REGION=eu-north-1 ENVIRONMENT=production \
  npx cdk deploy TagRelayApiStack-production
```

---

## Monitoring

### View Logs
```bash
# API
AWS_PROFILE=tagrelay-prod aws logs tail /aws/lambda/tag-relay-api-production --follow --region eu-north-1

# Web
AWS_PROFILE=tagrelay-prod aws logs tail /aws/lambda/tag-relay-web-ssr-production --follow --region eu-north-1

# Worker
AWS_PROFILE=tagrelay-prod aws logs tail /aws/lambda/tag-relay-worker-production --follow --region eu-north-1
```

### Check CloudFormation Stacks
```bash
# eu-north-1 stacks
AWS_PROFILE=tagrelay-prod aws cloudformation list-stacks \
  --region eu-north-1 \
  --query 'StackSummaries[?contains(StackName, `tag-relay`) && StackStatus!=`DELETE_COMPLETE`].{Name:StackName,Status:StackStatus}' \
  --output table

# us-east-1 stacks (CloudFront)
AWS_PROFILE=tagrelay-prod aws cloudformation list-stacks \
  --region us-east-1 \
  --query 'StackSummaries[?contains(StackName, `tag-relay`) && StackStatus!=`DELETE_COMPLETE`].{Name:StackName,Status:StackStatus}' \
  --output table
```

---

## Troubleshooting

### OAuth Not Working
1. Check redirect URIs match exactly (https://api.ovalt.org/auth/oauth/google/callback)
2. Verify secrets in AWS Secrets Manager:
   ```bash
   AWS_PROFILE=tagrelay-prod aws secretsmanager get-secret-value \
     --secret-id tag-relay/production/app-secrets \
     --region eu-north-1 \
     --query SecretString --output text | jq .
   ```
3. Check Lambda logs for errors

### Static Assets 404
- CloudFront distribution may still be deploying (takes 15-20 min)
- Check S3 bucket has assets:
  ```bash
  AWS_PROFILE=tagrelay-prod aws s3 ls \
    s3://tag-relay-web-ssr-assets-production-549116506406/_next/static/
  ```
- Invalidate CloudFront cache if needed

### API Errors
- Check Lambda environment variables are set
- Verify secrets are accessible
- Check Lambda has IAM permissions for DynamoDB/S3/SQS

---

## Costs

**Estimated Monthly Cost:**
- Lambda (API): $2-3
- Lambda (Web): $3-5
- Lambda (Worker): $1-2
- DynamoDB: $5-8
- S3: $1-2
- CloudFront: $5-10
- Other: $2-3

**Total: ~$20-35/month** for moderate traffic

---

## Support

- **Full Guide:** See DEPLOYMENT.md
- **Local Testing:** See LOCAL-TESTING.md
- **Issues:** Check CloudWatch Logs first

---

## Recent Updates (2026-04-02 Session)

### Code Changes
1. **OAuth cache-control headers** (`apps/api/src/auth/oauth-routes.ts`)
   - Added `Cache-Control: no-store, no-cache` headers to OAuth URL endpoint
   - Prevents browsers from caching stale OAuth URLs

2. **Auth context fix** (`apps/web-nextjs/src/lib/auth-context.tsx`)
   - Skip auth check when on `/auth/callback` page
   - Prevents race condition where token gets cleared before storage

3. **Privacy & Terms pages** (Created)
   - `apps/web-nextjs/src/app/privacy/page.tsx`
   - `apps/web-nextjs/src/app/terms/page.tsx`
   - Comprehensive legal pages with GDPR/CCPA compliance sections

4. **/auth/me cache headers** (`apps/api/src/auth/routes.ts`)
   - Added cache-control headers to prevent browser caching of 401 responses

### Infrastructure Changes
1. **Lambda environment variables** set for production OAuth redirect URIs
2. **S3 bucket public access** enabled for static assets
3. **CloudFormation stacks** fixed and brought to healthy state
4. **CloudFront distribution** redeployed with correct configuration

### Deployment Method
- Lambda functions updated directly via AWS CLI (bypassing stuck CloudFormation)
- CloudFormation stacks later fixed by deleting domain stack and redeploying
- All code changes deployed successfully

**Last Updated:** 2026-04-02 18:22 UTC
