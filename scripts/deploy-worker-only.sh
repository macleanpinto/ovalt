#!/bin/bash
set -e

# Quick Worker Lambda Deployment Script
# Usage: ./scripts/deploy-worker-only.sh [aws-profile]

# Configuration
AWS_PROFILE_ARG=${1:-${AWS_PROFILE:-tagrelay-prod}}
AWS_REGION=${AWS_REGION:-eu-north-1}  # Production is in eu-north-1, not us-east-1!
ENVIRONMENT="production"

# Export for all commands
export AWS_PROFILE=$AWS_PROFILE_ARG
export AWS_REGION=$AWS_REGION

echo "==========================================="
echo "Tag Relay Worker Lambda Deployment"
echo "==========================================="
echo "AWS Profile: $AWS_PROFILE"
echo "Region: $AWS_REGION"
echo "Environment: $ENVIRONMENT"
echo ""

# Verify AWS credentials
echo "Verifying AWS credentials..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "✅ Connected to AWS Account: $ACCOUNT_ID"
echo ""

# Build worker
echo "Building worker Lambda..."
cd apps/worker
npm run build:lambda
cd ../..
echo "✅ Worker Lambda bundled"
echo ""

# Package and deploy
echo "Packaging and deploying to Lambda..."
cd apps/worker/dist
zip -q lambda-handler.zip lambda-handler.js

aws lambda update-function-code \
  --function-name tag-relay-worker-$ENVIRONMENT \
  --zip-file fileb://lambda-handler.zip \
  --region $AWS_REGION

echo "✅ Code uploaded"
echo ""

# Wait for update to complete
echo "Waiting for Lambda update to complete..."
aws lambda wait function-updated \
  --function-name tag-relay-worker-$ENVIRONMENT \
  --region $AWS_REGION
echo "✅ Update complete"
echo ""

# Get function info
FUNCTION_INFO=$(aws lambda get-function-configuration \
  --function-name tag-relay-worker-$ENVIRONMENT \
  --region $AWS_REGION \
  --query '[LastModified, Timeout, MemorySize, Handler]' \
  --output json)

echo "==========================================="
echo "Deployment Complete! 🎉"
echo "==========================================="
echo "Function: tag-relay-worker-$ENVIRONMENT"
echo "Info: $FUNCTION_INFO" | jq '.'
echo ""

echo "To view logs:"
echo "  aws logs tail /aws/lambda/tag-relay-worker-$ENVIRONMENT --follow --profile $AWS_PROFILE"
echo ""
echo "To test with a deployment:"
echo "  Visit https://ovalt.org/migrations and click Deploy"
echo ""
