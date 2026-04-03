#!/bin/bash
set -e

# Production Deployment Script for Tag Relay
# Usage: ./scripts/deploy-production.sh [aws-profile] [region]

# Configuration
AWS_PROFILE_ARG=${1:-${AWS_PROFILE:-tagrelay-prod}}
AWS_REGION_ARG=${2:-${AWS_REGION:-eu-north-1}}
ENVIRONMENT="production"

# Export for all commands
export AWS_PROFILE=$AWS_PROFILE_ARG
export AWS_REGION=$AWS_REGION_ARG

echo "==========================================="
echo "Tag Relay Production Deployment"
echo "==========================================="
echo "AWS Profile: $AWS_PROFILE"
echo "AWS Region: $AWS_REGION"
echo "Environment: $ENVIRONMENT"
echo ""

# Verify AWS credentials
echo "Verifying AWS credentials..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "✅ Connected to AWS Account: $ACCOUNT_ID"
echo ""

# Check if CDK is bootstrapped
echo "Checking CDK bootstrap status..."
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region $AWS_REGION &>/dev/null; then
  echo "⚠️  CDK not bootstrapped in this account/region"
  echo "Running: cdk bootstrap aws://$ACCOUNT_ID/$AWS_REGION"
  cd infra/cdk
  npm ci
  npm run build
  cdk bootstrap aws://$ACCOUNT_ID/$AWS_REGION
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
EXISTING_API_URL=$(aws cloudformation describe-stacks \
  --stack-name tag-relay-api-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_API_URL" ]; then
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

API_URL=$(aws cloudformation describe-stacks \
  --stack-name tag-relay-api-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text 2>/dev/null || echo "Not deployed yet")

WEB_URL=$(aws cloudformation describe-stacks \
  --stack-name tag-relay-web-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`WebUrl`].OutputValue' \
  --output text 2>/dev/null || echo "Not deployed yet")

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
