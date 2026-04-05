import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface WebStackProps extends cdk.StackProps {
  environment: string;
  apiUrl: string;
}

export class TagRelayWebStack extends cdk.Stack {
  public readonly webFunction: lambda.Function;
  public readonly functionUrl: string;
  public readonly assetsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const { environment, apiUrl } = props;

    // ============================================
    // Static Assets Bucket
    // ============================================

    this.assetsBucket = new s3.Bucket(this, 'WebAssetsBucket', {
      bucketName: `tag-relay-web-ssr-assets-${environment}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        blockPublicPolicy: false, // Allow public bucket policy for CloudFront
        ignorePublicAcls: true,
        restrictPublicBuckets: false, // Allow public read access
      }),
      publicReadAccess: true, // Static assets can be publicly readable
      removalPolicy: environment === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'production',
    });

    // ============================================
    // Next.js SSR Lambda Function
    // ============================================

    this.webFunction = new lambda.Function(this, 'WebFunction', {
      functionName: `tag-relay-web-ssr-${environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'apps/web-nextjs/index.handler',
      code: lambda.Code.fromAsset('../../apps/web-nextjs/.open-next/server-functions/default', {
        exclude: ['node_modules/.cache'],
      }),
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      environment: {
        ENVIRONMENT: environment,
        NEXT_PUBLIC_API_URL: apiUrl,
        /** Set at synth/deploy time, e.g. NEXT_PUBLIC_GTM_ID=GTM-XXXX cdk deploy */
        NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID ?? '',
      },
    });

    // Grant read access to assets bucket
    this.assetsBucket.grantRead(this.webFunction);

    // ============================================
    // Lambda Function URL (Public Access)
    // ============================================

    const functionUrl = this.webFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    this.functionUrl = functionUrl.url;

    // ============================================
    // Deploy Static Assets to S3
    // ============================================

    // Note: This requires .open-next/assets to exist
    // Run `npm run build:lambda` in apps/web-nextjs before deploying
    new s3deploy.BucketDeployment(this, 'DeployWebAssets', {
      sources: [s3deploy.Source.asset('../../apps/web-nextjs/.open-next/assets')],
      destinationBucket: this.assetsBucket,
      prune: true,
    });

    // ============================================
    // Outputs
    // ============================================

    new cdk.CfnOutput(this, 'WebUrl', {
      value: this.functionUrl,
      exportName: `tag-relay-web-url-${environment}`,
    });

    new cdk.CfnOutput(this, 'WebFunctionName', {
      value: this.webFunction.functionName,
    });

    new cdk.CfnOutput(this, 'AssetsBucketName', {
      value: this.assetsBucket.bucketName,
      exportName: `tag-relay-web-assets-bucket-${environment}`,
    });
  }
}
