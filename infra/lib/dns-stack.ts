import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

export interface DnsStackProps extends cdk.StackProps {
  domainName: string;
}

/**
 * The public hosted zone. After the first deploy, copy the four NameServers
 * from the stack output into Hostinger (Domains > byteatebits.dev > DNS / Nameservers).
 */
export class DnsStack extends cdk.Stack {
  readonly hostedZone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    const zone = new route53.PublicHostedZone(this, 'Zone', {
      zoneName: props.domainName,
      comment: 'Managed by CDK (byteatebits.dev repo)',
    });
    // Keep the zone if the stack is ever deleted: recreating it changes the nameservers.
    zone.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    this.hostedZone = zone;

    new cdk.CfnOutput(this, 'NameServers', {
      value: cdk.Fn.join(', ', zone.hostedZoneNameServers!),
      description: 'Set these four nameservers at Hostinger',
    });
  }
}
