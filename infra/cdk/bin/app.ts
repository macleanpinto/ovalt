#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TagRelayApiStack } from '../lib/api-stack';
import { TagRelayWebStack } from '../lib/web-stack';
import { TagRelayDatabaseStack } from '../lib/database-stack';
import { TagRelayDomainStack } from '../lib/domain-stack';

const app = new cdk.App();

const environment = process.env.ENVIRONMENT || 'production';
const account = process.env.CDK_DEFAULT_ACCOUNT;

// Enable cross-region references for hybrid deployment
const stackProps = {
  crossRegionReferences: true,
};

// Application region (eu-north-1) for API, Database, Web
const appRegion = 'eu-north-1';
const appEnv = { account, region: appRegion };

// CloudFront region (us-east-1) - required for ACM certificates
const cloudFrontRegion = 'us-east-1';
const cloudFrontEnv = { account, region: cloudFrontRegion };

// Database stack (DynamoDB tables, S3 buckets, SQS queue)
const databaseStack = new TagRelayDatabaseStack(app, `TagRelayDatabaseStack-${environment}`, {
  ...stackProps,
  env: appEnv,
  environment,
  stackName: `tag-relay-database-${environment}`,
  description: 'Tag Relay database infrastructure (DynamoDB, S3, SQS)',
});

// API stack (API Lambda, Worker Lambda, API Gateway)
const apiStack = new TagRelayApiStack(app, `TagRelayApiStack-${environment}`, {
  ...stackProps,
  env: appEnv,
  environment,
  stackName: `tag-relay-api-${environment}`,
  description: 'Tag Relay API and Worker Lambda functions',
  importsTable: databaseStack.importsTable,
  runsTable: databaseStack.runsTable,
  usersTable: databaseStack.usersTable,
  organizationsTable: databaseStack.organizationsTable,
  organizationMembersTable: databaseStack.organizationMembersTable,
  sessionsTable: databaseStack.sessionsTable,
  apiKeysTable: databaseStack.apiKeysTable,
  oauthAccountsTable: databaseStack.oauthAccountsTable,
  artifactsBucket: databaseStack.artifactsBucket,
  migrationQueue: databaseStack.migrationQueue,
});

// Web stack (Next.js SSR Lambda)
const webStack = new TagRelayWebStack(app, `TagRelayWebStack-${environment}`, {
  ...stackProps,
  env: appEnv,
  environment,
  stackName: `tag-relay-web-${environment}`,
  description: 'Tag Relay Next.js SSR web application',
  apiUrl: apiStack.apiUrl,
});

// Domain stack (CloudFront + SSL for website)
// Must be in us-east-1 for CloudFront
// Only deploy in production
if (environment === 'production') {
  const domainStack = new TagRelayDomainStack(app, `TagRelayDomainStack-${environment}`, {
    ...stackProps,
    env: cloudFrontEnv,
    environment,
    stackName: `tag-relay-domain-${environment}`,
    description: 'Tag Relay CloudFront distribution and SSL certificate (us-east-1)',
    domainName: 'ovalt.org',
    webFunctionUrl: webStack.functionUrl,
  });

  // Domain must exist after Web on *first* deploy (Function URL cross-region export).
  // If Web stack fails with "Exports cannot be updated" / CrossRegionExportWriter: deploy Domain
  // first so it drops stale S3 imports, then Web — e.g.
  //   cdk deploy TagRelayDomainStack-production --exclusively
  //   cdk deploy TagRelayWebStack-production --exclusively
  domainStack.addDependency(webStack);
}

app.synth();
