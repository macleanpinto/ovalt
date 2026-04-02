#!/bin/bash
set -e

# Setup AWS Secrets Manager secrets for Tag Relay
# Usage: ./scripts/setup-secrets.sh [environment] [aws-profile] [region]

ENVIRONMENT=${1:-production}
AWS_PROFILE_ARG=${2:-${AWS_PROFILE}}
AWS_REGION=${3:-${AWS_REGION:-us-east-1}}
SECRET_NAME="tag-relay/${ENVIRONMENT}/app-secrets"

# Build AWS CLI command prefix with profile if specified
if [ -n "$AWS_PROFILE_ARG" ]; then
  AWS_CMD="aws --profile $AWS_PROFILE_ARG"
else
  AWS_CMD="aws"
fi

echo "==================================="
echo "Tag Relay Secrets Setup"
echo "==================================="
echo "Environment: $ENVIRONMENT"
echo "Secret Name: $SECRET_NAME"
echo "AWS Region: $AWS_REGION"
echo ""

# Check if secret already exists
if $AWS_CMD secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$AWS_REGION" &>/dev/null; then
  echo "⚠️  Secret already exists: $SECRET_NAME"
  read -p "Do you want to update it? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
  UPDATE_MODE=true
else
  UPDATE_MODE=false
fi

echo ""
echo "Generating secure random secrets..."

# Generate secure random secrets
JWT_SECRET=$(openssl rand -base64 32)
API_KEY=$(openssl rand -base64 32)
SERVICE_TOKEN=$(openssl rand -base64 32)

echo "✅ Generated JWT_SECRET, API_KEY, SERVICE_TOKEN"
echo ""

# Prompt for OAuth credentials
echo "==================================="
echo "OAuth Configuration"
echo "==================================="
echo ""
echo "You need TWO separate Google OAuth clients:"
echo "  1. User Login (standard OAuth, minimal scopes)"
echo "  2. GTM Access (requires Tag Manager + Cloud Platform scopes)"
echo ""
echo "Why separate? GTM OAuth needs broad cloud-platform scope for"
echo "deploying to Cloud Run. Keep user login scope minimal for security."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Google OAuth #1 - User Login:"
echo "  (Scopes: email, profile, openid)"
read -p "  Client ID: " GOOGLE_OAUTH_CLIENT_ID
read -sp "  Client Secret: " GOOGLE_OAUTH_CLIENT_SECRET
echo ""
echo ""

echo "Google OAuth #2 - GTM Access:"
echo "  (Scopes: tagmanager.edit.containers, cloud-platform)"
read -p "  Client ID: " GTM_OAUTH_CLIENT_ID
read -sp "  Client Secret: " GTM_OAUTH_CLIENT_SECRET
echo ""
echo ""

echo "GitHub OAuth (for user authentication):"
read -p "  Client ID: " GITHUB_OAUTH_CLIENT_ID
read -sp "  Client Secret: " GITHUB_OAUTH_CLIENT_SECRET
echo ""
echo ""

# Set redirect URIs based on environment
if [ "$ENVIRONMENT" = "production" ]; then
  echo ""
  echo "⚠️  For production, you need to provide the API Gateway URL"
  echo "   If you haven't deployed yet, you can:"
  echo "   1. Use placeholder URLs now (e.g., https://placeholder.example.com)"
  echo "   2. Deploy the application"
  echo "   3. Update secrets with real URLs after deployment"
  echo ""
  read -p "API Gateway URL (or press Enter for placeholder): " API_BASE_URL
  if [ -z "$API_BASE_URL" ]; then
    API_BASE_URL="https://placeholder.example.com"
    echo "   Using placeholder. Remember to update after deployment!"
  fi
  GOOGLE_OAUTH_REDIRECT_URI="${API_BASE_URL}/auth/oauth/google/callback"
  GITHUB_OAUTH_REDIRECT_URI="${API_BASE_URL}/auth/oauth/github/callback"
  GTM_OAUTH_REDIRECT_URI="${API_BASE_URL}/gtm/oauth/callback"
elif [ "$ENVIRONMENT" = "staging" ]; then
  read -p "API Gateway URL: " API_BASE_URL
  GOOGLE_OAUTH_REDIRECT_URI="${API_BASE_URL}/auth/oauth/google/callback"
  GITHUB_OAUTH_REDIRECT_URI="${API_BASE_URL}/auth/oauth/github/callback"
  GTM_OAUTH_REDIRECT_URI="${API_BASE_URL}/gtm/oauth/callback"
else
  GOOGLE_OAUTH_REDIRECT_URI="http://localhost:3001/auth/oauth/google/callback"
  GITHUB_OAUTH_REDIRECT_URI="http://localhost:3001/auth/oauth/github/callback"
  GTM_OAUTH_REDIRECT_URI="http://localhost:3001/gtm/oauth/callback"
fi

# Optional external API keys
echo "==================================="
echo "Optional External Services"
echo "==================================="
echo ""
read -p "Brave Search API Key (optional): " TAG_RELAY_BRAVE_SEARCH_API_KEY
read -p "AWS Bedrock Model ID (optional): " TAG_RELAY_BEDROCK_MODEL_ID
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
echo "Creating/Updating Secret"
echo "==================================="

if [ "$UPDATE_MODE" = true ]; then
  # Update existing secret
  $AWS_CMD secretsmanager update-secret \
    --secret-id "$SECRET_NAME" \
    --secret-string "$SECRET_VALUE" \
    --region "$AWS_REGION"

  echo "✅ Secret updated successfully: $SECRET_NAME"
else
  # Create new secret
  $AWS_CMD secretsmanager create-secret \
    --name "$SECRET_NAME" \
    --description "Tag Relay application secrets for ${ENVIRONMENT}" \
    --secret-string "$SECRET_VALUE" \
    --region "$AWS_REGION"

  echo "✅ Secret created successfully: $SECRET_NAME"
fi

echo ""
echo "==================================="
echo "Summary"
echo "==================================="
echo "Secret Name: $SECRET_NAME"
echo "Region: $AWS_REGION"
echo ""
echo "Generated Secrets:"
echo "  - JWT_SECRET: ✅"
echo "  - API_KEY: ✅"
echo "  - SERVICE_TOKEN: ✅"
echo ""
echo "OAuth Configuration:"
echo "  - Google OAuth (login): ${GOOGLE_OAUTH_CLIENT_ID:+✅}"
echo "  - Google OAuth (GTM): ${GTM_OAUTH_CLIENT_ID:+✅}"
echo "  - GitHub OAuth: ${GITHUB_OAUTH_CLIENT_ID:+✅}"
echo ""
echo "External Services:"
echo "  - Brave Search: ${TAG_RELAY_BRAVE_SEARCH_API_KEY:+✅}"
echo "  - Bedrock: ${TAG_RELAY_BEDROCK_MODEL_ID:+✅}"
echo ""
echo "==================================="
echo "Next Steps"
echo "==================================="
if [[ "$GOOGLE_OAUTH_REDIRECT_URI" == *"placeholder"* ]]; then
  echo "⚠️  You used placeholder URLs. After deployment:"
  echo ""
  echo "1. Get your API Gateway URL:"
  echo "   aws cloudformation describe-stacks \\"
  echo "     --stack-name tag-relay-api-$ENVIRONMENT \\"
  echo "     --query 'Stacks[0].Outputs[?OutputKey==\`ApiUrl\`].OutputValue' \\"
  echo "     --output text"
  echo ""
  echo "2. Update secrets with real URLs:"
  echo "   ./scripts/setup-secrets.sh $ENVIRONMENT"
  echo "   (Provide the real API Gateway URL when prompted)"
  echo ""
  echo "3. Update OAuth apps with redirect URIs:"
  echo "   - Google: Add BOTH URIs to your OAuth client"
  echo "   - GitHub: Add callback URI to your OAuth app"
  echo ""
else
  echo "1. Configure Google OAuth Client #1 (User Login):"
  echo "   - Go to: https://console.cloud.google.com/apis/credentials"
  echo "   - Redirect URI: ${GOOGLE_OAUTH_REDIRECT_URI}"
  echo "   - Scopes: email, profile, openid"
  echo ""
  echo "2. Configure Google OAuth Client #2 (GTM Access):"
  echo "   - Go to: https://console.cloud.google.com/apis/credentials"
  echo "   - Redirect URI: ${GTM_OAUTH_REDIRECT_URI}"
  echo "   - Enable APIs: Tag Manager API, Cloud Resource Manager API"
  echo "   - Scopes: tagmanager.edit.containers, cloud-platform"
  echo ""
  echo "3. Configure GitHub OAuth (User Login):"
  echo "   - Go to: https://github.com/settings/developers"
  echo "   - Callback URI: ${GITHUB_OAUTH_REDIRECT_URI}"
  echo ""
  echo "4. Deploy application:"
  echo "   npm run deploy:production"
  echo ""
fi
echo "To view the secret:"
echo "  aws secretsmanager get-secret-value --secret-id $SECRET_NAME --region $AWS_REGION"
echo ""
