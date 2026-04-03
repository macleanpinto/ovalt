# CDK

App entry: `bin/app.ts`. Stacks: database (DynamoDB, S3, SQS), API (Lambdas + API Gateway), web (Next SSR), domain (CloudFront, production).

```bash
cd infra/cdk
npm ci && npm run build
ENVIRONMENT=production npm run deploy    # or: cdk deploy --all
```

Bootstrap once per account/region: `cdk bootstrap`. Full deploy and secrets: [README.md](../../README.md).
