# Tag Relay - TODO

## 🚀 Deploy to AWS

```bash
# 1. Setup secrets
./scripts/setup-secrets.sh production

# 2. Build applications
cd apps/api && npm ci && npm run build && cd ../..
cd apps/worker && npm ci && npm run build && cd ../..
cd apps/web-nextjs && npm ci && npm run build:lambda && cd ../..

# 3. Deploy with CDK
cd infra/cdk
npm ci && npm run build
ENVIRONMENT=production npm run deploy

# 4. Get URLs from outputs
aws cloudformation describe-stacks \
  --stack-name tag-relay-api-production \
  --query 'Stacks[0].Outputs'

# 5. Test deployment
curl https://YOUR-API-URL/health
```

**Time:** 15 minutes

---

## 🔐 Production Hardening

### Security
- [ ] Review IAM policies
- [ ] Configure CORS allowlist (remove `*`)
- [ ] Add API Gateway rate limiting

### Monitoring
- [ ] CloudWatch alarms (errors, latency)
- [ ] Billing alerts
- [ ] Error notifications (SNS)

### Backup
- [ ] Enable DynamoDB backups
- [ ] Test restore procedure

---

## 📚 Documentation

- [ ] OpenAPI/Swagger spec
- [ ] User migration guide
- [ ] OAuth setup guide
- [ ] Troubleshooting guide

---

## 🚀 Future Features

- [ ] Expand rule coverage (Adobe, Segment)
- [ ] Custom rule UI
- [ ] CloudFront CDN
- [ ] Custom domains
- [ ] Multi-region

---

See [PROJECT-STATUS.md](PROJECT-STATUS.md) for complete status.
