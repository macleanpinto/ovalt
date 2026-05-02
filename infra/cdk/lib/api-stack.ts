import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  environment: string;
  importsTable: dynamodb.Table;
  runsTable: dynamodb.Table;
  usersTable: dynamodb.Table;
  organizationsTable: dynamodb.Table;
  organizationMembersTable: dynamodb.Table;
  sessionsTable: dynamodb.Table;
  apiKeysTable: dynamodb.Table;
  oauthAccountsTable: dynamodb.Table;
  artifactsBucket: s3.Bucket;
  migrationQueue: sqs.Queue;
}

export class TagRelayApiStack extends cdk.Stack {
  public readonly apiFunction: lambda.Function;
  public readonly workerFunction: lambda.Function;
  public readonly apiUrl: string;
  public readonly httpApi: apigateway.HttpApi;
  public readonly apiCustomDomain?: apigateway.DomainName;
  public readonly apiDomainCertificate?: acm.Certificate;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // ============================================
    // Secrets
    // ============================================

    const appSecrets = secretsmanager.Secret.fromSecretNameV2(
      this,
      'AppSecrets',
      `tag-relay/${environment}/app-secrets`
    );

    // ============================================
    // API Lambda Function
    // ============================================

    this.apiFunction = new lambda.Function(this, 'ApiFunction', {
      functionName: `tag-relay-api-${environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'lambda-handler.handler',
      code: lambda.Code.fromAsset('../../apps/api/dist', {
        exclude: ['*.map'],
      }),
      timeout: cdk.Duration.seconds(300), // 5 minutes for GTM deployment operations
      memorySize: 1024,
      environment: {
        ENVIRONMENT: environment,
        // AWS_REGION is automatically set by Lambda runtime
        DDB_TABLE_IMPORTS: props.importsTable.tableName,
        DDB_TABLE_RUNS: props.runsTable.tableName,
        DDB_TABLE_USERS: props.usersTable.tableName,
        DDB_TABLE_ORGANIZATIONS: props.organizationsTable.tableName,
        DDB_TABLE_ORGANIZATION_MEMBERS: props.organizationMembersTable.tableName,
        DDB_TABLE_SESSIONS: props.sessionsTable.tableName,
        DDB_TABLE_API_KEYS: props.apiKeysTable.tableName,
        DDB_TABLE_OAUTH_ACCOUNTS: props.oauthAccountsTable.tableName,
        S3_BUCKET: props.artifactsBucket.bucketName,
        SQS_QUEUE_URL: props.migrationQueue.queueUrl,
        WEB_BASE_URL: environment === 'production' ? 'https://ovalt.org' : 'http://localhost:5173',
        GOOGLE_OAUTH_REDIRECT_URI: environment === 'production' ? 'https://api.ovalt.org/auth/oauth/google/callback' : 'http://localhost:3001/auth/oauth/google/callback',
        GITHUB_OAUTH_REDIRECT_URI: environment === 'production' ? 'https://api.ovalt.org/auth/oauth/github/callback' : 'http://localhost:3001/auth/oauth/github/callback',
        GTM_OAUTH_REDIRECT_URI: environment === 'production' ? 'https://api.ovalt.org/gtm/oauth/callback' : 'http://localhost:3001/gtm/oauth/callback',
      },
    });

    // Grant permissions
    props.importsTable.grantReadWriteData(this.apiFunction);
    props.runsTable.grantReadWriteData(this.apiFunction);
    props.usersTable.grantReadWriteData(this.apiFunction);
    props.organizationsTable.grantReadWriteData(this.apiFunction);
    props.organizationMembersTable.grantReadWriteData(this.apiFunction);
    props.sessionsTable.grantReadWriteData(this.apiFunction);
    props.apiKeysTable.grantReadWriteData(this.apiFunction);
    props.oauthAccountsTable.grantReadWriteData(this.apiFunction);
    props.artifactsBucket.grantReadWrite(this.apiFunction);
    props.migrationQueue.grantSendMessages(this.apiFunction);
    appSecrets.grantRead(this.apiFunction);

    // ============================================
    // Worker Lambda Function
    // ============================================

    this.workerFunction = new lambda.Function(this, 'WorkerFunction', {
      functionName: `tag-relay-worker-${environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'lambda-handler.handler',
      code: lambda.Code.fromAsset('../../apps/worker/dist', {
        exclude: ['*.map'],
      }),
      timeout: cdk.Duration.seconds(900), // 15 minutes (for complex GTM deployments)
      memorySize: 2048,
      environment: {
        ENVIRONMENT: environment,
        // AWS_REGION is automatically set by Lambda runtime
        DDB_TABLE_IMPORTS: props.importsTable.tableName,
        DDB_TABLE_RUNS: props.runsTable.tableName,
        DDB_TABLE_SESSIONS: props.sessionsTable.tableName,
        S3_BUCKET: props.artifactsBucket.bucketName,
        GTM_OAUTH_REDIRECT_URI: environment === 'production' ? 'https://api.ovalt.org/gtm/oauth/callback' : 'http://localhost:3001/gtm/oauth/callback',
      },
    });

    // Grant permissions
    props.importsTable.grantReadWriteData(this.workerFunction);
    props.sessionsTable.grantReadWriteData(this.workerFunction); // For GTM OAuth tokens (read + refresh)
    props.runsTable.grantReadWriteData(this.workerFunction);
    props.artifactsBucket.grantReadWrite(this.workerFunction);
    props.migrationQueue.grantConsumeMessages(this.workerFunction);
    appSecrets.grantRead(this.workerFunction);

    // Add SQS event source
    this.workerFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(props.migrationQueue, {
        batchSize: 1,
        maxConcurrency: 10,
      })
    );

    // ============================================
    // API Gateway HTTP API
    // ============================================

    this.httpApi = new apigateway.HttpApi(this, 'HttpApi', {
      apiName: `tag-relay-api-${environment}`,
      description: 'Tag Relay REST API',
      corsPreflight: {
        allowOrigins: environment === 'production'
          ? ['https://ovalt.org', 'https://api.ovalt.org']
          : ['http://localhost:5173', 'http://localhost:3000'],
        allowMethods: [
          apigateway.CorsHttpMethod.GET,
          apigateway.CorsHttpMethod.POST,
          apigateway.CorsHttpMethod.PUT,
          apigateway.CorsHttpMethod.DELETE,
          apigateway.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Requested-With',
          'Accept',
          'Origin',
          'X-GTM-Session',
        ],
        allowCredentials: true,
        maxAge: cdk.Duration.hours(1),
      },
    });

    const lambdaIntegration = new apigatewayIntegrations.HttpLambdaIntegration(
      'ApiIntegration',
      this.apiFunction
    );

    this.httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [
        apigateway.HttpMethod.GET,
        apigateway.HttpMethod.POST,
        apigateway.HttpMethod.PUT,
        apigateway.HttpMethod.DELETE,
      ],
      integration: lambdaIntegration,
    });

    // Use custom domain for production, raw API Gateway URL otherwise
    this.apiUrl = environment === 'production' ? 'https://api.ovalt.org' : this.httpApi.url!;

    // OAuth redirect URIs are derived from this base in the API (see API_PUBLIC_BASE_URL in server.ts).
    const apiPublicBase =
      environment === 'production' ? 'https://api.ovalt.org' : this.apiUrl.replace(/\/$/, '');
    this.apiFunction.addEnvironment('API_PUBLIC_BASE_URL', apiPublicBase);

    // ============================================
    // Custom Domain for API (production only)
    // ============================================
    if (environment === 'production') {
      const domainName = 'ovalt.org';

      // Lookup existing Route 53 hosted zone
      const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: domainName,
      });

      // SSL Certificate for api.ovalt.org
      this.apiDomainCertificate = new acm.Certificate(this, 'ApiCertificate', {
        domainName: `api.${domainName}`,
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });

      // API Gateway custom domain
      this.apiCustomDomain = new apigateway.DomainName(this, 'ApiCustomDomain', {
        domainName: `api.${domainName}`,
        certificate: this.apiDomainCertificate,
      });

      // API Mapping
      new apigateway.ApiMapping(this, 'ApiMapping', {
        api: this.httpApi,
        domainName: this.apiCustomDomain,
      });

      // DNS Record: api.ovalt.org → API Gateway
      new route53.ARecord(this, 'ApiAliasRecord', {
        zone: hostedZone,
        recordName: `api.${domainName}`,
        target: route53.RecordTarget.fromAlias(
          new route53targets.ApiGatewayv2DomainProperties(
            this.apiCustomDomain.regionalDomainName,
            this.apiCustomDomain.regionalHostedZoneId
          )
        ),
      });
    }

    // ============================================
    // Outputs
    // ============================================

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.apiUrl,
      exportName: `tag-relay-api-url-${environment}`,
    });

    new cdk.CfnOutput(this, 'ApiFunctionName', {
      value: this.apiFunction.functionName,
    });

    new cdk.CfnOutput(this, 'WorkerFunctionName', {
      value: this.workerFunction.functionName,
    });

    if (this.apiCustomDomain) {
      new cdk.CfnOutput(this, 'ApiCustomDomainUrl', {
        value: `https://${this.apiCustomDomain.name}`,
        exportName: `tag-relay-api-custom-domain-${environment}`,
      });
    }
  }
}
