# Tag Relay - Next.js SSR

Server-side rendered web app for Tag Relay, deployed on AWS Lambda.

## Features

- ✅ **Server-Side Rendering (SSR)** - Fast initial page load
- ✅ **SEO Optimized** - Search engines see full HTML
- ✅ **AWS Lambda** - Serverless deployment (~$5-10/month)
- ✅ **Tailwind CSS** - Modern styling
- ✅ **TypeScript** - Type safety
- ✅ **OAuth Integration** - Google & GitHub login

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:5173
```

## Build for Production

```bash
# Build Next.js app
npm run build

# Build for Lambda deployment
npm run build:lambda
```

This creates `.open-next/` directory with:
- `server-function/` - Lambda function code
- `assets/` - Static files for S3

## Deploy to AWS

Deployment is managed by AWS CDK. See [infra/cdk/README.md](../../infra/cdk/README.md) for details.

```bash
# Build for Lambda
npm run build:lambda

# Deploy with CDK (from repository root)
cd infra/cdk
ENVIRONMENT=production npm run deploy
```

Or push to `main` branch → automatic deployment via GitHub Actions

## Architecture

```
User Request
    ↓
Lambda Function URL
    ↓
Next.js SSR (Lambda)
    ↓
Render React → HTML
    ↓
Return to client
```

Static assets (`_next/static/*`) are served from S3.

## Environment Variables

Set these in `.env.local` for local development:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

For production, these are set in Lambda environment:

```bash
NEXT_PUBLIC_API_URL=https://xxx.execute-api.us-east-1.amazonaws.com
```

## Routes

- `/` - Landing page (SSR)
- `/dashboard` - Dashboard (SSR with data fetching)
- `/auth/login` - Login page (Client-side)
- `/migrations/*` - Migration routes

## Cost

- **Lambda invocations:** $0.20 per million
- **Lambda compute:** ~$0.0000166667 per GB-second
- **S3 storage:** ~$0.023 per GB
- **S3 requests:** ~$0.0004 per 1000 requests

**Example (100k page views/month):**
- Lambda: ~$1-2
- S3: ~$1
- **Total: ~$2-5/month**

Much cheaper than running a server 24/7!

## Performance

- **Cold start:** 1-2 seconds (first request after idle)
- **Warm requests:** 50-200ms
- **Time to First Byte (TTFB):** ~100-300ms

To eliminate cold starts, use Provisioned Concurrency (~$15/month).

## Monitoring

```bash
# View Lambda logs
aws logs tail /aws/lambda/tag-relay-web-ssr-production --follow

# View function details
aws lambda get-function --function-name tag-relay-web-ssr-production

# View metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=tag-relay-web-ssr-production \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

## Troubleshooting

### Build fails

```bash
# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

### Lambda deployment fails

```bash
# Check if function exists
aws lambda get-function --function-name tag-relay-web-ssr-production

# If not, run setup script
./infra/lambda/setup-web-ssr.sh
```

### Page not rendering

```bash
# Check Lambda logs
aws logs tail /aws/lambda/tag-relay-web-ssr-production --since 10m

# Common issues:
# - Environment variables not set
# - API endpoint incorrect
# - Static assets not uploaded to S3
```

## Documentation

- [Next.js Documentation](https://nextjs.org/docs)
- [OpenNext Documentation](https://open-next.js.org/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Tag Relay Deployment Guide](../../DEPLOYMENT.md)
