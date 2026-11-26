import * as fs from 'node:fs';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface StaticSiteStackProps extends cdk.StackProps {
  domainName: string;
  hostedZone: route53.IHostedZone;
  /** Built Astro output. If it doesn't exist yet, the stack deploys without uploading content. */
  siteDistPath: string;
}

// Runs at every CloudFront edge before the cache:
// 1. www.byteatebits.dev -> byteatebits.dev (301)
// 2. /homelab or /homelab/ -> /homelab/index.html (S3 has no directory indexes)
const edgeRequestCode = `
function handler(event) {
  var req = event.request;
  var host = req.headers.host ? req.headers.host.value : '';
  if (host.indexOf('www.') === 0) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://' + host.substring(4) + req.uri } }
    };
  }
  var uri = req.uri;
  if (uri.endsWith('/')) {
    req.uri = uri + 'index.html';
  } else if (uri.lastIndexOf('.') < uri.lastIndexOf('/')) {
    req.uri = uri + '/index.html';
  }
  return req;
}`;

export class StaticSiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StaticSiteStackProps) {
    super(scope, id, props);
    const { domainName, hostedZone } = props;
    const wwwName = `www.${domainName}`;

    // Private bucket: only CloudFront can read it (Origin Access Control).
    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: cdk.Duration.days(30) }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Free public certificate, validated automatically through the Route 53 zone.
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName,
      subjectAlternativeNames: [wwwName],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    const edgeRequest = new cloudfront.Function(this, 'EdgeRequest', {
      code: cloudfront.FunctionCode.fromInline(edgeRequestCode),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: 'www redirect and clean URLs',
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: domainName,
      domainNames: [domainName, wwwName],
      certificate,
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      // Includes Europe, Asia and the Middle East; costs the same as the cheapest class at this traffic.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        compress: true,
        functionAssociations: [
          { function: edgeRequest, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      // With OAC and no list permission, S3 answers 403 for missing files: show our 404 page.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: cdk.Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: cdk.Duration.minutes(5) },
      ],
    });

    for (const [id, recordName] of [['Apex', domainName], ['Www', wwwName]] as const) {
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
      new route53.ARecord(this, `${id}A`, { zone: hostedZone, recordName, target });
      new route53.AaaaRecord(this, `${id}Aaaa`, { zone: hostedZone, recordName, target });
    }

    if (fs.existsSync(props.siteDistPath)) {
      // Uploads site/dist, deletes files that no longer exist, then clears the CloudFront cache.
      new s3deploy.BucketDeployment(this, 'DeploySite', {
        sources: [s3deploy.Source.asset(props.siteDistPath)],
        destinationBucket: bucket,
        distribution,
        distributionPaths: ['/*'],
        prune: true,
        memoryLimit: 512,
      });
    } else {
      cdk.Annotations.of(this).addWarningV2(
        'byteatebits:noSiteBuild',
        `No site build found at ${props.siteDistPath}; run "npm run build" in site/ to upload content.`,
      );
    }

    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${domainName}` });
    new cdk.CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
