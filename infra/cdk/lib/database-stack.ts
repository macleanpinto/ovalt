import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  environment: string;
}

export class TagRelayDatabaseStack extends cdk.Stack {
  public readonly importsTable: dynamodb.Table;
  public readonly runsTable: dynamodb.Table;
  public readonly usersTable: dynamodb.Table;
  public readonly organizationsTable: dynamodb.Table;
  public readonly organizationMembersTable: dynamodb.Table;
  public readonly sessionsTable: dynamodb.Table;
  public readonly apiKeysTable: dynamodb.Table;
  public readonly oauthAccountsTable: dynamodb.Table;
  public readonly artifactsBucket: s3.Bucket;
  public readonly webAssetsBucket: s3.Bucket;
  public readonly migrationQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // ============================================
    // DynamoDB Tables
    // ============================================

    // Users table
    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: `tag-relay-users-${environment}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: environment === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
    });

    // Organizations table
    this.organizationsTable = new dynamodb.Table(this, 'OrganizationsTable', {
      tableName: `tag-relay-organizations-${environment}`,
      partitionKey: { name: 'organizationId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: environment === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.organizationsTable.addGlobalSecondaryIndex({
      indexName: 'slug-index',
      partitionKey: { name: 'slug', type: dynamodb.AttributeType.STRING },
    });

    // Organization members table
    this.organizationMembersTable = new dynamodb.Table(this, 'OrganizationMembersTable', {
      tableName: `tag-relay-organization-members-${environment}`,
      partitionKey: { name: 'organizationId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: environment === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.organizationMembersTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    });

    // Sessions table
    this.sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      tableName: `tag-relay-sessions-${environment}`,
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: environment === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.sessionsTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    });

    // API keys table
    this.apiKeysTable = new dynamodb.Table(this, 'ApiKeysTable', {
      tableName: `tag-relay-api-keys-${environment}`,
      partitionKey: { name: 'apiKeyId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: environment === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.apiKeysTable.addGlobalSecondaryIndex({
      indexName: 'keyHash-index',
      partitionKey: { name: 'keyHash', type: dynamodb.AttributeType.STRING },
    });

    this.apiKeysTable.addGlobalSecondaryIndex({
      indexName: 'organizationId-index',
      partitionKey: { name: 'organizationId', type: dynamodb.AttributeType.STRING },
    });

    // OAuth accounts table
    this.oauthAccountsTable = new dynamodb.Table(this, 'OAuthAccountsTable', {
      tableName: `tag-relay-oauth-accounts-${environment}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'provider', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: environment === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.oauthAccountsTable.addGlobalSecondaryIndex({
      indexName: 'provider-providerId-index',
      partitionKey: { name: 'provider', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'providerId', type: dynamodb.AttributeType.STRING },
    });

    // Imports table
    this.importsTable = new dynamodb.Table(this, 'ImportsTable', {
      tableName: `tag-relay-imports-${environment}`,
      partitionKey: { name: 'importId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: environment === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.importsTable.addGlobalSecondaryIndex({
      indexName: 'organizationId-createdAt-index',
      partitionKey: { name: 'organizationId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // Runs table
    this.runsTable = new dynamodb.Table(this, 'RunsTable', {
      tableName: `tag-relay-runs-${environment}`,
      partitionKey: { name: 'runId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: environment === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.runsTable.addGlobalSecondaryIndex({
      indexName: 'organizationId-createdAt-index',
      partitionKey: { name: 'organizationId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    this.runsTable.addGlobalSecondaryIndex({
      indexName: 'importId-createdAt-index',
      partitionKey: { name: 'importId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // ============================================
    // S3 Buckets
    // ============================================

    // Artifacts bucket (GTM exports, reports, etc.)
    this.artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      bucketName: `tag-relay-artifacts-${environment}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [
        {
          id: 'delete-old-artifacts',
          enabled: true,
          expiration: cdk.Duration.days(365),
        },
        {
          id: 'archive-to-glacier',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
      removalPolicy: environment === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'production',
    });

    // Web assets bucket (Next.js static files)
    this.webAssetsBucket = new s3.Bucket(this, 'WebAssetsBucket', {
      bucketName: `tag-relay-web-assets-${environment}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      removalPolicy: environment === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'production',
    });

    // ============================================
    // SQS Queue
    // ============================================

    // Dead letter queue
    const dlq = new sqs.Queue(this, 'MigrationDLQ', {
      queueName: `tag-relay-migrations-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // Main migration queue
    this.migrationQueue = new sqs.Queue(this, 'MigrationQueue', {
      queueName: `tag-relay-migrations-${environment}`,
      visibilityTimeout: cdk.Duration.seconds(900), // 15 minutes (matches worker Lambda timeout)
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3,
      },
    });

    // ============================================
    // Outputs
    // ============================================

    new cdk.CfnOutput(this, 'ImportsTableName', {
      value: this.importsTable.tableName,
      exportName: `tag-relay-imports-table-${environment}`,
    });

    new cdk.CfnOutput(this, 'RunsTableName', {
      value: this.runsTable.tableName,
      exportName: `tag-relay-runs-table-${environment}`,
    });

    new cdk.CfnOutput(this, 'ArtifactsBucketName', {
      value: this.artifactsBucket.bucketName,
      exportName: `tag-relay-artifacts-bucket-${environment}`,
    });

    new cdk.CfnOutput(this, 'MigrationQueueUrl', {
      value: this.migrationQueue.queueUrl,
      exportName: `tag-relay-queue-url-${environment}`,
    });
  }
}
