#!/bin/bash
set -e

# Initialize authentication and tenant isolation tables in LocalStack DynamoDB
# Run this script to set up development environment

AWS_ENDPOINT="http://localhost:4566"
AWS_REGION="us-east-1"

echo "Creating authentication and tenant isolation tables..."

# Users table
awslocal dynamodb create-table \
  --table-name tag-relay-users \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
    AttributeName=email,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
  --global-secondary-indexes \
    '[{
      "IndexName": "email-index",
      "KeySchema": [{"AttributeName":"email","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"},
      "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    }]' \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region $AWS_REGION \
  --endpoint-url $AWS_ENDPOINT

echo "✓ Created tag-relay-users table"

# Organizations table
awslocal dynamodb create-table \
  --table-name tag-relay-organizations \
  --attribute-definitions \
    AttributeName=organizationId,AttributeType=S \
    AttributeName=slug,AttributeType=S \
  --key-schema \
    AttributeName=organizationId,KeyType=HASH \
  --global-secondary-indexes \
    '[{
      "IndexName": "slug-index",
      "KeySchema": [{"AttributeName":"slug","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"},
      "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    }]' \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region $AWS_REGION \
  --endpoint-url $AWS_ENDPOINT

echo "✓ Created tag-relay-organizations table"

# Organization members table
awslocal dynamodb create-table \
  --table-name tag-relay-organization-members \
  --attribute-definitions \
    AttributeName=organizationId,AttributeType=S \
    AttributeName=userId,AttributeType=S \
  --key-schema \
    AttributeName=organizationId,KeyType=HASH \
    AttributeName=userId,KeyType=RANGE \
  --global-secondary-indexes \
    '[{
      "IndexName": "userId-index",
      "KeySchema": [{"AttributeName":"userId","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"},
      "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    }]' \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region $AWS_REGION \
  --endpoint-url $AWS_ENDPOINT

echo "✓ Created tag-relay-organization-members table"

# Sessions table
awslocal dynamodb create-table \
  --table-name tag-relay-sessions \
  --attribute-definitions \
    AttributeName=sessionId,AttributeType=S \
  --key-schema \
    AttributeName=sessionId,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region $AWS_REGION \
  --endpoint-url $AWS_ENDPOINT

echo "✓ Created tag-relay-sessions table"

# API keys table
awslocal dynamodb create-table \
  --table-name tag-relay-api-keys \
  --attribute-definitions \
    AttributeName=apiKeyId,AttributeType=S \
    AttributeName=keyHash,AttributeType=S \
    AttributeName=organizationId,AttributeType=S \
  --key-schema \
    AttributeName=apiKeyId,KeyType=HASH \
  --global-secondary-indexes \
    '[{
      "IndexName": "keyHash-index",
      "KeySchema": [{"AttributeName":"keyHash","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"},
      "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    },
    {
      "IndexName": "organizationId-index",
      "KeySchema": [{"AttributeName":"organizationId","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"},
      "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    }]' \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region $AWS_REGION \
  --endpoint-url $AWS_ENDPOINT

echo "✓ Created tag-relay-api-keys table"

# OAuth accounts table
awslocal dynamodb create-table \
  --table-name tag-relay-oauth-accounts \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
    AttributeName=provider,AttributeType=S \
    AttributeName=providerId,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
    AttributeName=provider,KeyType=RANGE \
  --global-secondary-indexes \
    '[{
      "IndexName": "provider-providerId-index",
      "KeySchema": [
        {"AttributeName":"provider","KeyType":"HASH"},
        {"AttributeName":"providerId","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"},
      "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    },
    {
      "IndexName": "userId-index",
      "KeySchema": [{"AttributeName":"userId","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"},
      "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    }]' \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region $AWS_REGION \
  --endpoint-url $AWS_ENDPOINT

echo "✓ Created tag-relay-oauth-accounts table"

# Update existing imports table to add organizationId GSI
awslocal dynamodb update-table \
  --table-name tag-relay-imports \
  --attribute-definitions \
    AttributeName=organizationId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --global-secondary-index-updates \
    '[{
      "Create": {
        "IndexName": "organizationId-createdAt-index",
        "KeySchema": [
          {"AttributeName":"organizationId","KeyType":"HASH"},
          {"AttributeName":"createdAt","KeyType":"RANGE"}
        ],
        "Projection": {"ProjectionType":"ALL"},
        "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
      }
    }]' \
  --region $AWS_REGION \
  --endpoint-url $AWS_ENDPOINT || echo "⚠ GSI may already exist or table doesn't exist yet"

echo "✓ Updated tag-relay-imports table with organizationId GSI"

# Update existing runs table to add organizationId GSI
awslocal dynamodb update-table \
  --table-name tag-relay-runs \
  --attribute-definitions \
    AttributeName=organizationId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
    AttributeName=importId,AttributeType=S \
  --global-secondary-index-updates \
    '[{
      "Create": {
        "IndexName": "organizationId-createdAt-index",
        "KeySchema": [
          {"AttributeName":"organizationId","KeyType":"HASH"},
          {"AttributeName":"createdAt","KeyType":"RANGE"}
        ],
        "Projection": {"ProjectionType":"ALL"},
        "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
      }
    },
    {
      "Create": {
        "IndexName": "importId-createdAt-index",
        "KeySchema": [
          {"AttributeName":"importId","KeyType":"HASH"},
          {"AttributeName":"createdAt","KeyType":"RANGE"}
        ],
        "Projection": {"ProjectionType":"ALL"},
        "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
      }
    }]' \
  --region $AWS_REGION \
  --endpoint-url $AWS_ENDPOINT || echo "⚠ GSI may already exist or table doesn't exist yet"

echo "✓ Updated tag-relay-runs table with tenant isolation GSIs"

echo ""
echo "✅ Authentication and tenant isolation tables created successfully!"
echo ""
echo "Tables created:"
echo "  - tag-relay-users"
echo "  - tag-relay-organizations"
echo "  - tag-relay-organization-members"
echo "  - tag-relay-sessions"
echo "  - tag-relay-api-keys"
echo "  - tag-relay-oauth-accounts"
echo ""
echo "Updated tables:"
echo "  - tag-relay-imports (added organizationId GSI)"
echo "  - tag-relay-runs (added organizationId and importId GSIs)"
