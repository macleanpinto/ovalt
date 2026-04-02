#!/bin/sh
set -e

awslocal sqs create-queue --queue-name tag-relay-migrations >/dev/null 2>&1 || true
awslocal sqs create-queue --queue-name tag-relay-migrations-dlq >/dev/null 2>&1 || true
awslocal s3 mb s3://tag-relay-artifacts >/dev/null 2>&1 || true
awslocal s3 mb s3://tag-relay-artifacts-local >/dev/null 2>&1 || true

awslocal dynamodb create-table \
  --table-name tag-relay-imports \
  --attribute-definitions AttributeName=importId,AttributeType=S \
  --key-schema AttributeName=importId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST >/dev/null 2>&1 || true

awslocal dynamodb create-table \
  --table-name tag-relay-runs \
  --attribute-definitions AttributeName=runId,AttributeType=S \
  --key-schema AttributeName=runId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST >/dev/null 2>&1 || true

# --- Auth + tenant isolation tables (used by /auth/* and OAuth login) ---

awslocal dynamodb create-table \
  --table-name tag-relay-users \
  --attribute-definitions AttributeName=userId,AttributeType=S AttributeName=email,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH \
  --global-secondary-indexes \
    '[{"IndexName":"email-index","KeySchema":[{"AttributeName":"email","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST >/dev/null 2>&1 || true

awslocal dynamodb create-table \
  --table-name tag-relay-organizations \
  --attribute-definitions AttributeName=organizationId,AttributeType=S AttributeName=slug,AttributeType=S \
  --key-schema AttributeName=organizationId,KeyType=HASH \
  --global-secondary-indexes \
    '[{"IndexName":"slug-index","KeySchema":[{"AttributeName":"slug","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST >/dev/null 2>&1 || true

awslocal dynamodb create-table \
  --table-name tag-relay-organization-members \
  --attribute-definitions AttributeName=organizationId,AttributeType=S AttributeName=userId,AttributeType=S \
  --key-schema AttributeName=organizationId,KeyType=HASH AttributeName=userId,KeyType=RANGE \
  --global-secondary-indexes \
    '[{"IndexName":"userId-index","KeySchema":[{"AttributeName":"userId","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST >/dev/null 2>&1 || true

awslocal dynamodb create-table \
  --table-name tag-relay-sessions \
  --attribute-definitions AttributeName=sessionId,AttributeType=S \
  --key-schema AttributeName=sessionId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST >/dev/null 2>&1 || true

awslocal dynamodb create-table \
  --table-name tag-relay-api-keys \
  --attribute-definitions AttributeName=apiKeyId,AttributeType=S AttributeName=keyHash,AttributeType=S AttributeName=organizationId,AttributeType=S \
  --key-schema AttributeName=apiKeyId,KeyType=HASH \
  --global-secondary-indexes \
    '[{"IndexName":"keyHash-index","KeySchema":[{"AttributeName":"keyHash","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}},{"IndexName":"organizationId-index","KeySchema":[{"AttributeName":"organizationId","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST >/dev/null 2>&1 || true

awslocal dynamodb create-table \
  --table-name tag-relay-oauth-accounts \
  --attribute-definitions AttributeName=userId,AttributeType=S AttributeName=provider,AttributeType=S AttributeName=providerId,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH AttributeName=provider,KeyType=RANGE \
  --global-secondary-indexes \
    '[{"IndexName":"provider-providerId-index","KeySchema":[{"AttributeName":"provider","KeyType":"HASH"},{"AttributeName":"providerId","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},{"IndexName":"userId-index","KeySchema":[{"AttributeName":"userId","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST >/dev/null 2>&1 || true
