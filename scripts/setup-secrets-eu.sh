#!/bin/bash

set -e

echo "========================================="
echo "Tag Relay - AWS Secrets Manager Setup"
echo "Region: eu-north-1"
echo "========================================="
echo ""

echo "Generating secure random secrets..."

# Generate secure random secrets
JWT_SECRET=$(openssl rand -base64 32)
API_KEY=$(openssl rand -base64 32)
SERVICE_TOKEN=$(openssl rand -base64 32)

echo "✅ Generated JWT_SECRET, API_KEY, SERVICE_TOKEN"
echo ""

# Try to load from .env file (only OAuth credentials, not ENVIRONMENT)
if [ -f ".env" ]; then
  echo "📄 Found .env file, loading OAuth credentials..."

  # Load only OAuth-related variables from .env
  export $(grep -E "^(GOOGLE_OAUTH|GTM_OAUTH|GITHUB_OAUTH|TAG_RELAY)" .env | xargs)

  echo "✅ Loaded OAuth credentials from .env"
  echo ""
else
  echo "⚠️  No .env file found, will prompt for credentials"
  echo ""
fi

# Force production settings (don't let .env override these)
ENVIRONMENT="production"
AWS_REGION="eu-north-1"

# Prompt for OAuth credentials if not set
echo "==================================="
echo "OAuth Configuration"
echo "==================================="
echo ""
echo "You need TWO separate Google OAuth clients:"
echo "  1. User Login (scopes: email, profile, openid)"
echo "  2. GTM Access (scopes: tagmanager.edit.containers, cloud-platform)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -z "$GOOGLE_OAUTH_CLIENT_ID" ]; then
  echo "Google OAuth #1 - User Login:"
  read -p "  Client ID: " GOOGLE_OAUTH_CLIENT_ID
  read -sp "  Client Secret: " GOOGLE_OAUTH_CLIENT_SECRET
  echo ""
  echo ""
else
  echo "✅ Google OAuth #1 loaded from .env"
fi

if [ -z "$GTM_OAUTH_CLIENT_ID" ]; then
  echo "Google OAuth #2 - GTM Access:"
  read -p "  Client ID: " GTM_OAUTH_CLIENT_ID
  read -sp "  Client Secret: " GTM_OAUTH_CLIENT_SECRET
  echo ""
  echo ""
else
  echo "✅ Google OAuth #2 loaded from .env"
fi

# Production redirect URIs
GOOGLE_OAUTH_REDIRECT_URI="https://api.ovalt.org/auth/oauth/google/callback"
GTM_OAUTH_REDIRECT_URI="https://api.ovalt.org/gtm/oauth/callback"

echo ""
echo "Redirect URIs:"
echo "  User Login: ${GOOGLE_OAUTH_REDIRECT_URI}"
echo "  GTM OAuth:  ${GTM_OAUTH_REDIRECT_URI}"
echo ""

# Optional external API keys
echo "==================================="
echo "Optional External Services"
echo "==================================="
echo ""

if [ -z "$GITHUB_OAUTH_CLIENT_ID" ] && [ "$GITHUB_OAUTH_CLIENT_ID" != "skip" ]; then
  read -p "GitHub OAuth Client ID (optional, press Enter to skip): " GITHUB_OAUTH_CLIENT_ID
  if [ -n "$GITHUB_OAUTH_CLIENT_ID" ]; then
    read -sp "GitHub OAuth Client Secret: " GITHUB_OAUTH_CLIENT_SECRET
    echo ""
    GITHUB_OAUTH_REDIRECT_URI="https://api.ovalt.org/auth/oauth/github/callback"
  else
    GITHUB_OAUTH_CLIENT_SECRET=""
    GITHUB_OAUTH_REDIRECT_URI=""
  fi
else
  if [ "$GITHUB_OAUTH_CLIENT_ID" = "skip" ]; then
    GITHUB_OAUTH_CLIENT_ID=""
    GITHUB_OAUTH_CLIENT_SECRET=""
    GITHUB_OAUTH_REDIRECT_URI=""
  fi
  echo "✅ GitHub OAuth loaded from .env (or skipped)"
fi
echo ""

if [ -z "$TAG_RELAY_BRAVE_SEARCH_API_KEY" ]; then
  read -p "Brave Search API Key (optional, press Enter to skip): " TAG_RELAY_BRAVE_SEARCH_API_KEY
else
  echo "✅ Brave Search API Key loaded from .env"
fi

if [ -z "$TAG_RELAY_BEDROCK_MODEL_ID" ]; then
  read -p "AWS Bedrock Model ID (optional, press Enter to skip): " TAG_RELAY_BEDROCK_MODEL_ID
else
  echo "✅ Bedrock Model ID loaded from .env"
fi
echo ""

# Build secret JSON
SECRET_VALUE=$(cat <<EOF
{
  "JWT_SECRET": "${JWT_SECRET}",
  "API_KEY": "${API_KEY}",
  "SERVICE_TOKEN": "${SERVICE_TOKEN}",
  "GOOGLE_OAUTH_CLIENT_ID": "${GOOGLE_OAUTH_CLIENT_ID}",
  "GOOGLE_OAUTH_CLIENT_SECRET": "${GOOGLE_OAUTH_CLIENT_SECRET}",
  "GOOGLE_OAUTH_REDIRECT_URI": "${GOOGLE_OAUTH_REDIRECT_URI}",
  "GTM_OAUTH_CLIENT_ID": "${GTM_OAUTH_CLIENT_ID}",
  "GTM_OAUTH_CLIENT_SECRET": "${GTM_OAUTH_CLIENT_SECRET}",
  "GTM_OAUTH_REDIRECT_URI": "${GTM_OAUTH_REDIRECT_URI}",
  "GITHUB_OAUTH_CLIENT_ID": "${GITHUB_OAUTH_CLIENT_ID}",
  "GITHUB_OAUTH_CLIENT_SECRET": "${GITHUB_OAUTH_CLIENT_SECRET}",
  "GITHUB_OAUTH_REDIRECT_URI": "${GITHUB_OAUTH_REDIRECT_URI}",
  "TAG_RELAY_BRAVE_SEARCH_API_KEY": "${TAG_RELAY_BRAVE_SEARCH_API_KEY}",
  "TAG_RELAY_BEDROCK_MODEL_ID": "${TAG_RELAY_BEDROCK_MODEL_ID}"
}
EOF
)

echo "==================================="
echo "Saving to AWS Secrets Manager"
echo "==================================="
echo ""
echo "Secret Name: tag-relay/${ENVIRONMENT}/app-secrets"
echo "Region: ${AWS_REGION}"
echo ""

# Check if secret already exists
if aws secretsmanager describe-secret \
  --secret-id "tag-relay/${ENVIRONMENT}/app-secrets" \
  --region "${AWS_REGION}" \
  --profile "${AWS_PROFILE:-tagrelay-prod}" \
  >/dev/null 2>&1; then

  echo "Secret already exists. Updating..."
  aws secretsmanager update-secret \
    --secret-id "tag-relay/${ENVIRONMENT}/app-secrets" \
    --secret-string "${SECRET_VALUE}" \
    --region "${AWS_REGION}" \
    --profile "${AWS_PROFILE:-tagrelay-prod}"

  echo "✅ Secret updated successfully"
else
  echo "Creating new secret..."
  aws secretsmanager create-secret \
    --name "tag-relay/${ENVIRONMENT}/app-secrets" \
    --description "Tag Relay production secrets" \
    --secret-string "${SECRET_VALUE}" \
    --region "${AWS_REGION}" \
    --profile "${AWS_PROFILE:-tagrelay-prod}"

  echo "✅ Secret created successfully"
fi

echo ""
echo "========================================="
echo "✅ Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Configure Google OAuth redirect URIs:"
echo "     - User Login: ${GOOGLE_OAUTH_REDIRECT_URI}"
echo "     - GTM OAuth:  ${GTM_OAUTH_REDIRECT_URI}"
echo ""
echo "  2. Deploy to eu-north-1:"
echo "     cd infra/cdk"
echo "     AWS_PROFILE=tagrelay-prod AWS_REGION=eu-north-1 ENVIRONMENT=production \\"
echo "       npx cdk deploy --all"
echo ""
