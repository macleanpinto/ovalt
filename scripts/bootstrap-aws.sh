#!/bin/bash
set -e

# Bootstrap AWS account for CDK deployment
# Usage: ./scripts/bootstrap-aws.sh [aws-profile] [region]

AWS_PROFILE_ARG=${1:-${AWS_PROFILE:-tagrelay-prod}}
AWS_REGION_ARG=${2:-${AWS_REGION:-eu-north-1}}

export AWS_PROFILE=$AWS_PROFILE_ARG
export AWS_REGION=$AWS_REGION_ARG

echo "==========================================="
echo "AWS CDK Bootstrap"
echo "==========================================="
echo "AWS Profile: $AWS_PROFILE"
echo "AWS Region: $AWS_REGION"
echo ""

# Verify credentials
echo "Verifying AWS credentials..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
USER_ARN=$(aws sts get-caller-identity --query Arn --output text)

echo "✅ Connected to AWS"
echo "   Account: $ACCOUNT_ID"
echo "   User: $USER_ARN"
echo "   Region: $AWS_REGION"
echo ""

# Check if already bootstrapped
if aws cloudformation describe-stacks --stack-name CDKToolkit --region $AWS_REGION &>/dev/null; then
  echo "⚠️  CDKToolkit stack already exists"
  read -p "Do you want to delete and re-bootstrap? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Deleting existing CDKToolkit stack..."
    aws cloudformation delete-stack --stack-name CDKToolkit --region $AWS_REGION
    echo "Waiting for stack deletion..."
    aws cloudformation wait stack-delete-complete --stack-name CDKToolkit --region $AWS_REGION || true
    echo "✅ Stack deleted"
  else
    echo "Keeping existing CDKToolkit stack"
    exit 0
  fi
fi

echo ""
echo "Bootstrapping CDK..."
echo "Command: cdk bootstrap aws://$ACCOUNT_ID/$AWS_REGION"
echo ""

# Ensure CDK is installed
cd infra/cdk
npm ci
npm run build

# Bootstrap
cdk bootstrap aws://$ACCOUNT_ID/$AWS_REGION

cd ../..

echo ""
echo "==========================================="
echo "Bootstrap Complete! ✅"
echo "==========================================="
echo "Account: $ACCOUNT_ID"
echo "Region: $AWS_REGION"
echo ""
echo "Next steps:"
echo "1. Setup secrets: ./scripts/setup-secrets.sh production $AWS_PROFILE $AWS_REGION"
echo "2. Deploy: ./scripts/deploy-production.sh $AWS_PROFILE $AWS_REGION"
echo ""
