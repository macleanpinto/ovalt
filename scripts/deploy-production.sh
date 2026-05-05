#!/bin/bash
set -e

# Production Deployment Script for Tag Relay
# Usage: ./scripts/deploy-production.sh [aws-profile] [region]

# Configuration
# On a laptop we default to the `tagrelay-prod` shared-credentials profile.
# In CI (OIDC) there is no shared-credentials file — env vars are set by
# aws-actions/configure-aws-credentials — so skip AWS_PROFILE entirely if
# AWS_WEB_IDENTITY_TOKEN_FILE or AWS_ACCESS_KEY_ID is already set.
APP_REGION=${2:-eu-north-1}   # App stacks (API, Web, Database) region
DOMAIN_REGION="us-east-1"     # Domain stack (CloudFront) must be in us-east-1
ENVIRONMENT="production"

if [ -n "${1:-}" ]; then
  export AWS_PROFILE="$1"
elif [ -z "${AWS_ACCESS_KEY_ID:-}" ] && [ -z "${AWS_WEB_IDENTITY_TOKEN_FILE:-}" ]; then
  export AWS_PROFILE="${AWS_PROFILE:-tagrelay-prod}"
fi
export AWS_REGION=$APP_REGION  # Default region for CDK

echo "==========================================="
echo "Tag Relay Production Deployment"
echo "==========================================="
echo "AWS Profile: $AWS_PROFILE"
echo "App Region: $APP_REGION (API, Web, Database)"
echo "Domain Region: $DOMAIN_REGION (CloudFront, Certificate)"
echo "Environment: $ENVIRONMENT"
echo ""

# Verify AWS credentials
echo "Verifying AWS credentials..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "✅ Connected to AWS Account: $ACCOUNT_ID"
echo ""

# Check if CDK is bootstrapped
echo "Checking CDK bootstrap status..."
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region $APP_REGION &>/dev/null; then
  echo "⚠️  CDK not bootstrapped in $APP_REGION"
  echo "Running: cdk bootstrap aws://$ACCOUNT_ID/$APP_REGION"
  cd infra/cdk
  npm ci
  npm run build
  cdk bootstrap aws://$ACCOUNT_ID/$APP_REGION
  cd ../..
  echo "✅ CDK bootstrapped"
else
  echo "✅ CDK already bootstrapped"
fi
echo ""

# Build applications
echo "==========================================="
echo "Building Applications"
echo "==========================================="

echo "Installing dependencies..."
npm install --workspaces
echo "✅ Dependencies installed"

echo "Building Lambda bundles..."
cd apps/api && npm run build:lambda && cd ../..
cd apps/worker && npm run build:lambda && cd ../..
echo "✅ Lambda functions bundled"

echo "Checking for existing API deployment..."
# Try to get custom domain URL first (production), fall back to regular API URL
EXISTING_CUSTOM_URL=$(aws cloudformation describe-stacks \
  --stack-name tag-relay-api-$ENVIRONMENT \
  --region $APP_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiCustomDomainUrl`].OutputValue' \
  --output text 2>/dev/null || echo "")

EXISTING_API_URL=$(aws cloudformation describe-stacks \
  --stack-name tag-relay-api-$ENVIRONMENT \
  --region $APP_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text 2>/dev/null || echo "")

# Prefer custom domain URL if available
if [ -n "$EXISTING_CUSTOM_URL" ]; then
  NEXT_PUBLIC_API_URL=$EXISTING_CUSTOM_URL
  echo "✅ Found existing custom domain URL: $NEXT_PUBLIC_API_URL"
elif [ -n "$EXISTING_API_URL" ]; then
  NEXT_PUBLIC_API_URL=$EXISTING_API_URL
  echo "✅ Found existing API URL: $NEXT_PUBLIC_API_URL"
else
  # First deployment - use placeholder, will need to rebuild web after API is deployed
  NEXT_PUBLIC_API_URL="https://placeholder-will-update-after-deploy.example.com"
  echo "⚠️  First deployment - using placeholder API URL"
  echo "   Web app will need to be redeployed after API stack is created"
fi

echo "Building Web (Next.js)..."
cd apps/web-nextjs
npm ci
echo "Using API URL: $NEXT_PUBLIC_API_URL"
NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL npm run build:lambda
cd ../..
echo "✅ Web built"
echo ""

# Deploy with CDK
echo "==========================================="
echo "Deploying with CDK"
echo "==========================================="

cd infra/cdk
npm ci
npm run build

echo "Deploying all stacks..."
ENVIRONMENT=$ENVIRONMENT npm run deploy

cd ../..

echo ""
echo "==========================================="
echo "Deployment Complete! 🎉"
echo "==========================================="

# Get outputs
echo "Fetching stack outputs..."
echo ""

# Get API URL - prefer custom domain if available
API_CUSTOM_URL=$(aws cloudformation describe-stacks \
  --stack-name tag-relay-api-$ENVIRONMENT \
  --region $APP_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiCustomDomainUrl`].OutputValue' \
  --output text 2>/dev/null || echo "")

API_URL=$(aws cloudformation describe-stacks \
  --stack-name tag-relay-api-$ENVIRONMENT \
  --region $APP_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text 2>/dev/null || echo "Not deployed yet")

# Use custom domain if available
if [ -n "$API_CUSTOM_URL" ]; then
  API_URL=$API_CUSTOM_URL
fi

# Get Web URL - prefer custom domain if available (CloudFront)
WEB_CUSTOM_URL=$(aws cloudformation describe-stacks \
  --stack-name tag-relay-domain-$ENVIRONMENT \
  --region $DOMAIN_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`WebDomainName`].OutputValue' \
  --output text 2>/dev/null || echo "")

WEB_URL=$(aws cloudformation describe-stacks \
  --stack-name tag-relay-web-$ENVIRONMENT \
  --region $APP_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`WebUrl`].OutputValue' \
  --output text 2>/dev/null || echo "Not deployed yet")

# Use custom domain if available
if [ -n "$WEB_CUSTOM_URL" ]; then
  WEB_URL=$WEB_CUSTOM_URL
fi

echo "=========================================="
echo "Your Application URLs"
echo "=========================================="
echo "API: $API_URL"
echo "Web: $WEB_URL"
echo ""

# Check if we used placeholder
if [[ "$NEXT_PUBLIC_API_URL" == *"placeholder"* ]] && [[ "$API_URL" != "Not deployed yet" ]]; then
  echo "⚠️  IMPORTANT: Web app was built with placeholder API URL"
  echo ""
  echo "You need to rebuild and redeploy the web app:"
  echo ""
  echo "  cd apps/web-nextjs"
  echo "  NEXT_PUBLIC_API_URL=$API_URL npm run build:lambda"
  echo "  cd .open-next/server-function"
  echo "  zip -rq ../../web.zip ."
  echo "  aws lambda update-function-code \\"
  echo "    --function-name tag-relay-web-ssr-$ENVIRONMENT \\"
  echo "    --zip-file fileb://../../web.zip"
  echo "  cd ../../.."
  echo ""
fi

echo "==========================================="
echo "Next Steps"
echo "==========================================="
echo "1. Test API health:"
echo "   curl $API_URL/health"
echo ""
echo "2. Update OAuth redirect URIs in secrets:"
echo "   ./scripts/setup-secrets.sh $ENVIRONMENT"
echo "   (Use the API URL above when prompted)"
echo ""
echo "3. Update OAuth apps with redirect URIs:"
echo "   Google: $API_URL/auth/oauth/google/callback"
echo "           $API_URL/gtm/oauth/callback"
echo "   GitHub: $API_URL/auth/oauth/github/callback"
echo ""
echo "4. Test OAuth flows"
echo "5. Setup CloudWatch alarms (optional)"
echo "6. Configure custom domain (optional — see README.md)"
echo ""
echo "To view logs:"
echo "  aws logs tail /aws/lambda/tag-relay-api-$ENVIRONMENT --follow"
echo "  aws logs tail /aws/lambda/tag-relay-worker-$ENVIRONMENT --follow"
echo "  aws logs tail /aws/lambda/tag-relay-web-ssr-$ENVIRONMENT --follow"
echo ""
