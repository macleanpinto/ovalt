#!/bin/sh
set -e

# Load secrets from AWS Secrets Manager and start application
# This script is used as the Docker entrypoint in production

ENVIRONMENT=${ENVIRONMENT:-production}
AWS_REGION=${AWS_REGION:-us-east-1}
SECRET_NAME="tag-relay/${ENVIRONMENT}/app-secrets"

echo "🔐 Loading secrets from AWS Secrets Manager..."
echo "   Secret: $SECRET_NAME"
echo "   Region: $AWS_REGION"

# Check if running in local development (skip secrets loading)
if [ "$ENVIRONMENT" = "local" ] || [ "$ENVIRONMENT" = "development" ]; then
  echo "⚠️  Local environment detected - skipping AWS Secrets Manager"
  echo "   Using environment variables from .env or docker-compose"
  exec "$@"
fi

# Fetch secret JSON from AWS Secrets Manager
if ! SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_NAME" \
  --query SecretString \
  --output text \
  --region "$AWS_REGION" 2>&1); then
  echo "❌ Failed to load secrets from AWS Secrets Manager"
  echo "$SECRET_JSON"
  exit 1
fi

echo "✅ Secrets loaded successfully"

# Export each key-value pair as environment variable
export JWT_SECRET=$(echo "$SECRET_JSON" | jq -r '.JWT_SECRET // empty')
export API_KEY=$(echo "$SECRET_JSON" | jq -r '.API_KEY // empty')
export SERVICE_TOKEN=$(echo "$SECRET_JSON" | jq -r '.SERVICE_TOKEN // empty')

# OAuth for user authentication (Google/GitHub)
export GOOGLE_OAUTH_CLIENT_ID=$(echo "$SECRET_JSON" | jq -r '.GOOGLE_OAUTH_CLIENT_ID // empty')
export GOOGLE_OAUTH_CLIENT_SECRET=$(echo "$SECRET_JSON" | jq -r '.GOOGLE_OAUTH_CLIENT_SECRET // empty')
export GOOGLE_OAUTH_REDIRECT_URI=$(echo "$SECRET_JSON" | jq -r '.GOOGLE_OAUTH_REDIRECT_URI // empty')
export GITHUB_OAUTH_CLIENT_ID=$(echo "$SECRET_JSON" | jq -r '.GITHUB_OAUTH_CLIENT_ID // empty')
export GITHUB_OAUTH_CLIENT_SECRET=$(echo "$SECRET_JSON" | jq -r '.GITHUB_OAUTH_CLIENT_SECRET // empty')
export GITHUB_OAUTH_REDIRECT_URI=$(echo "$SECRET_JSON" | jq -r '.GITHUB_OAUTH_REDIRECT_URI // empty')

# GTM OAuth (separate Google OAuth client for GTM/Cloud Platform access)
export GTM_OAUTH_CLIENT_ID=$(echo "$SECRET_JSON" | jq -r '.GTM_OAUTH_CLIENT_ID // empty')
export GTM_OAUTH_CLIENT_SECRET=$(echo "$SECRET_JSON" | jq -r '.GTM_OAUTH_CLIENT_SECRET // empty')
export GTM_OAUTH_REDIRECT_URI=$(echo "$SECRET_JSON" | jq -r '.GTM_OAUTH_REDIRECT_URI // empty')

# Optional external API keys
export TAG_RELAY_BRAVE_SEARCH_API_KEY=$(echo "$SECRET_JSON" | jq -r '.TAG_RELAY_BRAVE_SEARCH_API_KEY // empty')
export TAG_RELAY_BEDROCK_MODEL_ID=$(echo "$SECRET_JSON" | jq -r '.TAG_RELAY_BEDROCK_MODEL_ID // empty')

echo "🚀 Starting application..."

# Execute the command passed to the entrypoint
exec "$@"
