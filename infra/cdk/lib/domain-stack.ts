import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface DomainStackProps extends cdk.StackProps {
  environment: string;
  domainName: string;
  /** Lambda Function URL from Web stack (eu-north-1); only remaining cross-region ref. */
  webFunctionUrl: string;
}

export class TagRelayDomainStack extends cdk.Stack {
  public readonly certificate: acm.Certificate;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: DomainStackProps) {
    super(scope, id, props);

    const { environment, domainName, webFunctionUrl } = props;

    // Bucket identity must match TagRelayWebStack (eu-north-1). Do NOT pass bucket props from Web stack:
    // cross-region exports cannot be updated while tag-relay-domain-production imports them.
    const webAssetsBucketName = `tag-relay-web-ssr-assets-${environment}-${cdk.Aws.ACCOUNT_ID}`;
    const webAssetsBucketRegionalDomainName = `${webAssetsBucketName}.s3.eu-north-1.amazonaws.com`;

    // ============================================
    // Route 53 Hosted Zone (assumes already exists)
    // ============================================
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: domainName,
    });

    // ============================================
    // SSL Certificate (for CloudFront - apex domain only)
    // Note: Must be in us-east-1 for CloudFront
    // ============================================
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ============================================
    // Import S3 Bucket (cross-region from eu-north-1)
    // ============================================
    const assetsBucket = s3.Bucket.fromBucketAttributes(this, 'ImportedAssetsBucket', {
      bucketName: webAssetsBucketName,
      region: 'eu-north-1',
      bucketRegionalDomainName: webAssetsBucketRegionalDomainName,
    });

    // ============================================
    // CloudFront Distribution for Web (ovalt.org)
    // ============================================

    // Extract hostname from Function URL for origin
    const webHostname = cdk.Fn.select(2, cdk.Fn.split('/', webFunctionUrl));

    // S3 origin for static assets
    // Note: Bucket policy must be added manually for cross-region access
    const s3Origin = new origins.S3Origin(assetsBucket);

    // Lambda origin for SSR
    const lambdaOrigin = new origins.HttpOrigin(webHostname);

    this.distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      // Default behavior: SSR via Lambda
      defaultBehavior: {
        origin: lambdaOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // Next.js handles caching
      },
      // Additional behaviors for static assets
      additionalBehaviors: {
        // Next.js static files
        '_next/static/*': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
        },
        // Public static files (logo.svg, etc)
        '*.svg': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        '*.ico': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        '*.png': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        '*.jpg': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      domainNames: [domainName], // ovalt.org
      certificate: this.certificate,
    });

    // ovalt.org → CloudFront → Lambda Function URL
    new route53.ARecord(this, 'ApexAliasRecord', {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(this.distribution)
      ),
    });

    // ============================================
    // Outputs
    // ============================================
    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      exportName: `tag-relay-cloudfront-certificate-arn-${environment}`,
    });

    new cdk.CfnOutput(this, 'WebDomainName', {
      value: `https://${domainName}`,
      exportName: `tag-relay-web-domain-${environment}`,
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      exportName: `tag-relay-cloudfront-distribution-id-${environment}`,
    });
  }
}
