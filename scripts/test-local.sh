#!/bin/bash
set -e

echo "=================================="
echo "Tag Relay - Local Test Setup"
echo "=================================="
echo ""

# Check Docker
echo "1. Checking Docker..."
if ! docker ps >/dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop."
  exit 1
fi
echo "✅ Docker is running"
echo ""

# Check LocalStack
echo "2. Checking LocalStack..."
if ! docker ps | grep -q localstack; then
  echo "⚠️  LocalStack not running. Starting..."
  docker-compose up -d
  sleep 5
else
  echo "✅ LocalStack is running"
fi
echo ""

# Check dependencies
echo "3. Checking dependencies..."
if [ ! -d "node_modules" ]; then
  echo "⚠️  Dependencies not installed. Installing..."
  npm install
else
  echo "✅ Dependencies installed"
fi
echo ""

# Check tables
echo "4. Checking DynamoDB tables..."
TABLE_COUNT=$(aws dynamodb list-tables --endpoint-url http://localhost:4566 --region us-east-1 --output json 2>/dev/null | jq '.TableNames | length')
if [ "$TABLE_COUNT" -lt 8 ]; then
  echo "⚠️  Tables missing. Creating..."
  ./infra/localstack/init-auth.sh
else
  echo "✅ All tables exist ($TABLE_COUNT tables)"
fi
echo ""

# Test API health
echo "5. Testing API..."
if curl -s http://localhost:3001/health >/dev/null 2>&1; then
  echo "✅ API is running at http://localhost:3001"
else
  echo "⚠️  API not running. Start with: npm run dev:api"
fi
echo ""

# Test Web
echo "6. Testing Web App..."
if curl -s http://localhost:3000 >/dev/null 2>&1; then
  echo "✅ Web app is running at http://localhost:3000"
else
  echo "⚠️  Web app not running. Start with: cd apps/web-nextjs && npm run dev"
fi
echo ""

echo "=================================="
echo "Setup Complete!"
echo "=================================="
echo ""
echo "Next steps:"
echo "1. Start API:     npm run dev:api"
echo "2. Start Worker:  npm run dev:worker"
echo "3. Start Web:     cd apps/web-nextjs && npm run dev"
echo ""
echo "Then visit: http://localhost:3000"
echo ""
