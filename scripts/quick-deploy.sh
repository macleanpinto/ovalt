#!/bin/bash
set -e

# Quick deployment script - updates Lambda code only (no infrastructure changes)
# Much faster than full CDK deployment
# Usage: ./scripts/quick-deploy.sh [aws-profile] [region] [environment]

AWS_PROFILE_ARG=${1:-${AWS_PROFILE:-tagrelay-prod}}
AWS_REGION_ARG=${2:-${AWS_REGION:-eu-north-1}}
ENVIRONMENT=${3:-production}

export AWS_PROFILE=$AWS_PROFILE_ARG
export AWS_REGION=$AWS_REGION_ARG

echo "==========================================="
echo "Tag Relay Quick Deploy (Code Only)"
echo "==========================================="
echo "AWS Profile: $AWS_PROFILE"
echo "AWS Region: $AWS_REGION"
echo "Environment: $ENVIRONMENT"
echo ""
echo "⚡ This updates Lambda code only - no infrastructure changes"
echo ""

# Function names
API_FUNCTION="tag-relay-api-$ENVIRONMENT"
WORKER_FUNCTION="tag-relay-worker-$ENVIRONMENT"
WEB_FUNCTION="tag-relay-web-ssr-$ENVIRONMENT"

# Build and deploy API
echo "Building and deploying API..."
cd apps/api
npm ci
npm run build
rm -f api.zip
zip -rq api.zip dist node_modules package.json
aws lambda update-function-code \
  --function-name $API_FUNCTION \
  --zip-file fileb://api.zip
rm api.zip
cd ../..
echo "✅ API deployed"

# Build and deploy Worker
echo "Building and deploying Worker..."
cd apps/worker
npm ci
npm run build
rm -f worker.zip
zip -rq worker.zip dist node_modules package.json
aws lambda update-function-code \
  --function-name $WORKER_FUNCTION \
  --zip-file fileb://worker.zip
rm worker.zip
cd ../..
echo "✅ Worker deployed"

# Build and deploy Web
echo "Building and deploying Web..."
cd apps/web-nextjs
npm ci
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-https://api.tagrelay.io} npm run build:lambda
cd .open-next/server-function
rm -f ../../web.zip
zip -rq ../../web.zip .
aws lambda update-function-code \
  --function-name $WEB_FUNCTION \
  --zip-file fileb://../../web.zip
rm ../../web.zip
cd ../../../..
echo "✅ Web deployed"

echo ""
echo "==========================================="
echo "Quick Deploy Complete! 🚀"
echo "==========================================="
echo "API Function: $API_FUNCTION"
echo "Worker Function: $WORKER_FUNCTION"
echo "Web Function: $WEB_FUNCTION"
echo ""
echo "Changes are live immediately!"
echo ""
echo "To view logs:"
echo "  aws logs tail /aws/lambda/$API_FUNCTION --follow"
echo ""
