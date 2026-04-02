# Local Testing Guide

Complete guide to test Tag Relay locally with LocalStack.

## Prerequisites

✅ Docker Desktop installed and running
✅ Node.js 20+ installed
✅ AWS CLI installed

## Quick Start (5 Minutes)

```bash
# 1. Start LocalStack
docker-compose up -d

# 2. Install dependencies (first time only)
npm install

# 3. Initialize DynamoDB tables
./infra/localstack/init-auth.sh

# 4. Start API (terminal 1)
npm run dev:api

# 5. Start Worker (terminal 2)
npm run dev:worker

# 6. Start Web App (terminal 3)
cd apps/web-nextjs
npm run dev
```

## Detailed Setup

### 1. Start LocalStack

LocalStack provides local AWS services (DynamoDB, S3, SQS).

```bash
# Start services
docker-compose up -d

# Verify it's running
docker ps | grep localstack
curl http://localhost:4566/_localstack/health
```

Expected output:
```json
{
  "services": {
    "dynamodb": "running",
    "s3": "running",
    "sqs": "running"
  }
}
```

### 2. Install Dependencies

```bash
# Install all workspace dependencies
npm install

# This installs dependencies for:
# - Root workspace
# - apps/api
# - apps/worker
# - apps/web-nextjs
```

### 3. Initialize Database Tables

```bash
# Create DynamoDB tables in LocalStack
./infra/localstack/init-auth.sh

# Verify tables were created
aws dynamodb list-tables \
  --endpoint-url http://localhost:4566 \
  --region us-east-1
```

Expected tables:
- `tag-relay-users`
- `tag-relay-organizations`
- `tag-relay-organization-members`
- `tag-relay-sessions`
- `tag-relay-api-keys`
- `tag-relay-oauth-accounts`
- `tag-relay-imports`
- `tag-relay-runs`

### 4. Configure Environment

Copy `.env.example` to `.env` (or use existing `.env`):

```bash
# Required for local development
ENVIRONMENT=local
AWS_REGION=us-east-1
AWS_ENDPOINT=http://localhost:4566

# Database
DDB_TABLE_IMPORTS=tag-relay-imports
DDB_TABLE_RUNS=tag-relay-runs

# Storage
S3_BUCKET=tag-relay-artifacts-local
SQS_QUEUE_URL=http://localhost:4566/000000000000/tag-relay-migrations

# Auth (use dev defaults)
JWT_SECRET=dev-jwt-secret-change-in-production
API_KEY=dev-api-key-change-in-production
SERVICE_TOKEN=dev-service-token-change-in-production

# OAuth (optional for local testing)
# GOOGLE_OAUTH_CLIENT_ID=your-client-id
# GOOGLE_OAUTH_CLIENT_SECRET=your-secret
# GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001/auth/oauth/google/callback
# GOOGLE_REDIRECT_URI=http://localhost:3001/gtm/oauth/callback
```

### 5. Start Services

**Terminal 1 - API:**
```bash
npm run dev:api

# Expected output:
# Server listening at http://localhost:3001
```

**Terminal 2 - Worker:**
```bash
npm run dev:worker

# Expected output:
# Worker ready, polling SQS queue...
```

**Terminal 3 - Web App:**
```bash
cd apps/web-nextjs
npm run dev

# Expected output:
# ▲ Next.js 14.x.x
# - Local: http://localhost:3000
```

## Testing

### Test API Health

```bash
curl http://localhost:3001/health
```

Expected: `{"ok":true}`

### Test User Registration

```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-production" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

Expected:
```json
{
  "token": "eyJhbGc...",
  "user": {
    "userId": "...",
    "email": "test@example.com",
    "name": "Test User"
  }
}
```

### Test Login

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-production" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Test Web App

1. Open browser: http://localhost:3000
2. Click "Sign In"
3. Register new account
4. Should redirect to dashboard

### Test GTM Import (with OAuth configured)

1. Configure Google OAuth credentials in `.env`
2. Restart API: `npm run dev:api`
3. In web app, go to "Import Container"
4. Click "Connect Google Account"
5. Authorize and select GTM container

## Running Tests

```bash
# API tests
cd apps/api
npm test

# Integration tests
npm test integration.test.ts

# E2E tests
npm test e2e.test.ts

# Worker tests
cd apps/worker
npm test
```

## Troubleshooting

### LocalStack not running

```bash
# Check Docker
docker ps

# Restart LocalStack
docker-compose down
docker-compose up -d
```

### Tables not found

```bash
# Re-initialize tables
./infra/localstack/init-auth.sh

# Verify
aws dynamodb list-tables \
  --endpoint-url http://localhost:4566 \
  --region us-east-1
```

### API won't start

```bash
# Check dependencies
cd apps/api
npm install

# Check for port conflicts
lsof -i :3001

# Check logs
npm run dev:api
```

### OAuth not working locally

OAuth with Google/GitHub requires:
1. Valid redirect URIs configured in OAuth app
2. HTTPS (use ngrok for local testing with OAuth)

**Option 1: Skip OAuth for local testing**
- Use email/password registration
- Test OAuth in deployed environment

**Option 2: Use ngrok for local OAuth**
```bash
# Install ngrok
brew install ngrok

# Expose local API
ngrok http 3001

# Use ngrok URL as OAuth redirect URI
# https://abc123.ngrok.io/auth/oauth/google/callback
```

## Clean Up

```bash
# Stop all services
docker-compose down

# Remove LocalStack data
docker-compose down -v

# Stop dev servers
Ctrl+C in each terminal
```

## Next Steps

Once local testing works:
1. Deploy to AWS: `cd infra/cdk && npm run deploy`
2. Configure production OAuth credentials
3. Test in production environment

## Common Workflows

### Full Reset

```bash
# Stop everything
docker-compose down -v

# Start fresh
docker-compose up -d
./infra/localstack/init-auth.sh
npm run dev:api
```

### Test Migration Flow

```bash
# 1. Upload GTM container (via API or web UI)
# 2. Check import was created
curl http://localhost:3001/imports \
  -H "x-api-key: dev-api-key-change-in-production" \
  -H "x-org-id: YOUR_ORG_ID"

# 3. Trigger migration
curl -X POST http://localhost:3001/imports/IMPORT_ID/runs \
  -H "x-api-key: dev-api-key-change-in-production" \
  -H "x-org-id: YOUR_ORG_ID" \
  -H "Content-Type: application/json" \
  -d '{}'

# 4. Check run status
curl http://localhost:3001/runs/RUN_ID \
  -H "x-api-key: dev-api-key-change-in-production" \
  -H "x-org-id: YOUR_ORG_ID"
```

## Performance Tips

- LocalStack is slower than real AWS (expect ~2x latency)
- Use `docker-compose up -d` to run in background
- Keep LocalStack running between dev sessions
- Restart only when you need fresh data

---

**Ready to deploy?** See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment.
