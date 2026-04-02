# Tag Relay

**Automated GTM client-side to server-side tag migration tool**

Transform your Google Tag Manager setup from client-side to server-side tagging with minimal manual work, built-in validation, and privacy-first defaults.

## 🚀 Quick Start

```bash
# 1. Configure AWS (one-time)
export AWS_PROFILE=tagrelay-prod
export AWS_REGION=eu-north-1

# 2. Bootstrap AWS (one-time)
npm run aws:bootstrap

# 3. Setup secrets (one-time)
npm run aws:setup-secrets

# 4. Deploy to production
npm run deploy:production

# Done! 🎉
```

**Time:** ~15 minutes for first deployment

**Step-by-step guide:** See [QUICK_DEPLOY.md](QUICK_DEPLOY.md) ⚡

**Detailed documentation:** See [DEPLOYMENT.md](DEPLOYMENT.md)

**Infrastructure:** Managed with AWS CDK - see [infra/cdk/README.md](infra/cdk/README.md)

## ✨ Features

- ✅ **Automated Migration** - Convert client-side tags to server-side in minutes
- ✅ **Validation Engine** - 30+ production rules with confidence scoring
- ✅ **Container Provisioning** - GTM server-side container verification
- ✅ **Multi-Tenant Auth** - OAuth with Google/GitHub, JWT sessions, API keys
- ✅ **Privacy-First** - GDPR/CCPA compliant with consent mode support
- ✅ **Next.js SSR** - Fast, SEO-friendly web interface
- ✅ **Serverless** - AWS Lambda, DynamoDB, S3, SQS (no VPC required)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    AWS Lambda                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │  API Lambda  │  │Worker Lambda │  │Web SSR   │ │
│  │  (Fastify)   │  │ (Migration)  │  │(Next.js) │ │
│  └──────┬───────┘  └──────┬───────┘  └────┬─────┘ │
└─────────┼──────────────────┼───────────────┼───────┘
          │                  │               │
          ↓                  ↓               ↓
┌─────────────────────────────────────────────────────┐
│              AWS Services (Shared)                   │
│  - DynamoDB (database)                              │
│  - S3 (artifacts + static assets)                   │
│  - SQS (job queue)                                  │
│  - Secrets Manager (credentials)                    │
└─────────────────────────────────────────────────────┘
```

**No ECS, No VPC, No Containers!** Pure serverless.

## 💰 Cost

**~$20-30/month** for production (100k requests + 1k migrations):
- Lambda API: $2-5
- Lambda Worker: $1-2
- Lambda Web SSR: $3-6
- DynamoDB: $5
- S3: $1
- SQS: $0.50
- Secrets Manager: $1

**86% cheaper** than ECS Fargate alternative.

## 📁 Project Structure

```
tag-relay/
├── apps/
│   ├── api/                    # Fastify API (Lambda)
│   │   └── src/
│   │       ├── lambda-handler.ts
│   │       ├── server.ts
│   │       └── auth/           # Auth system
│   ├── worker/                 # Migration worker (Lambda)
│   │   └── src/
│   │       ├── lambda-handler.ts
│   │       ├── migration/      # Ruleset engine
│   │       └── provisioning/   # Container verification
│   └── web-nextjs/             # Next.js SSR web app
│       └── src/app/
├── infra/
│   ├── cdk/                   # AWS CDK infrastructure
│   │   ├── lib/               # CDK stacks
│   │   └── bin/               # CDK app entry point
│   └── localstack/            # Local development
├── scripts/
│   ├── setup-secrets.sh       # Configure secrets
│   ├── load-secrets.sh        # Runtime secret loading
│   └── dev-all.sh             # Local development
├── docs/
│   └── system-design.md       # Technical architecture
├── DEPLOYMENT.md              # Deployment guide
└── README.md                  # This file
```

## 🛠️ Tech Stack

**Backend:**
- Node.js 20 + TypeScript
- Fastify (API framework)
- AWS SDK v3
- Zod (validation)

**Frontend:**
- Next.js 14 (App Router)
- React 18 (Server Components)
- Tailwind CSS
- TypeScript

**Infrastructure:**
- AWS Lambda (serverless compute)
- API Gateway / Lambda Function URLs
- DynamoDB (database)
- S3 (storage)
- SQS (queue)
- Secrets Manager (credentials)

**No Docker, No VPC, No ECS!**

## 🔐 Security

- **OAuth 2.0** - Google & GitHub login
- **JWT Sessions** - 7-day tokens with HS256
- **API Keys** - Scoped permissions with SHA-256 hashing
- **RBAC** - 4 roles (owner, admin, member, viewer) with 16 permissions
- **Tenant Isolation** - DynamoDB partition keys prevent cross-tenant access
- **Secrets Manager** - Runtime secret loading from AWS
- **IAM Roles** - Least privilege permissions

## 🚀 Development

### Local Development (with LocalStack)

```bash
# Start LocalStack
docker-compose up -d

# Initialize tables
./infra/localstack/init-auth.sh

# Start API
npm run -w @tag-relay/api dev

# Start Worker
npm run -w @tag-relay/worker dev

# Start Web
cd apps/web-nextjs
npm run dev
```

### Run Tests

```bash
npm test
```

### Lint

```bash
npm run lint
```

## 📚 Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide
- **[docs/system-design.md](docs/system-design.md)** - Technical architecture
- **[infra/cdk/README.md](infra/cdk/README.md)** - CDK infrastructure guide
- **[apps/web-nextjs/README.md](apps/web-nextjs/README.md)** - Web app documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📝 License

MIT License - see [LICENSE](LICENSE) for details

## 🙋 Support

- **Issues:** [GitHub Issues](https://github.com/YOUR_ORG/tag-relay/issues)
- **Docs:** [DEPLOYMENT.md](DEPLOYMENT.md)
- **Architecture:** [docs/system-design.md](docs/system-design.md)

## 🎯 Roadmap

- [x] Phase 1: Import GTM containers
- [x] Phase 2: Rule-based tag mapping
- [x] Phase 3: Validation & reporting
- [x] Phase 4: Container provisioning
- [x] Phase 5: Authentication & multi-tenancy
- [x] Phase 6: OAuth integration
- [x] Phase 7: Next.js SSR web app
- [ ] Phase 8: Integration tests
- [ ] Phase 9: Custom domain setup
- [ ] Phase 10: Monitoring & alerting

## 🌟 Features in Detail

### Automated Migration
- Import GTM web containers via OAuth
- 30+ production rules covering GA4, ads, social, consent
- Confidence scoring (docs-based, not AI guessing)
- Output: Server-side blueprints + manual action checklists

### Validation Engine
- Priority-based rule matching
- Constraint validation (PII, consent, parameters)
- Manual review triggers for complex tags
- Compliance scanning (GDPR/CCPA)

### Container Provisioning
- 7-state verification model
- Multi-provider support (Google Cloud, Stape, TAGGRS)
- Automated validation checks
- Non-blocking (migrations proceed with warnings)

### Multi-Tenant Auth
- User registration & login
- Organization management
- Role-based permissions
- API key generation with scopes
- OAuth with Google & GitHub

### Next.js SSR
- Server-side rendering for fast initial load
- SEO-optimized
- Dashboard with real-time stats
- OAuth login UI

## ⚡ Performance

- **API Lambda:** 50-200ms (warm)
- **Worker Lambda:** ~60s per migration
- **Web SSR:** 100-300ms TTFB
- **Cold starts:** 1-2s (first request after idle)

## 🔧 Configuration

All configuration via environment variables:

```bash
# AWS
AWS_REGION=us-east-1
DDB_TABLE_IMPORTS=tag-relay-imports
DDB_TABLE_RUNS=tag-relay-runs
S3_BUCKET=tag-relay-artifacts-prod
SQS_QUEUE_URL=https://sqs...

# Secrets (AWS Secrets Manager)
JWT_SECRET=***
API_KEY=***
GOOGLE_OAUTH_CLIENT_ID=***
GITHUB_OAUTH_CLIENT_ID=***
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete configuration guide.

---

**Built with ❤️ for marketing and analytics teams**
