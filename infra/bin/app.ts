#!/usr/bin/env node
import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { FoundationStack } from '../lib/foundation-stack.js';
import { DnsStack } from '../lib/dns-stack.js';
import { StaticSiteStack } from '../lib/static-site-stack.js';

const app = new cdk.App();

const domainName: string = app.node.tryGetContext('domainName');
const githubRepo: string = app.node.tryGetContext('githubRepo');
const monthlyBudgetUsd = Number(app.node.tryGetContext('monthlyBudgetUsd') ?? 15);
// Passed at deploy time (`-c alertEmail=you@example.com`) so the address is never committed.
const alertEmail: string | undefined = app.node.tryGetContext('alertEmail');

// Everything lives in us-east-1: CloudFront only accepts ACM certificates from there.
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' };
const tags = { project: 'byteatebits.dev' };

new FoundationStack(app, 'ByteatebitsFoundation', {
  env,
  tags,
  githubRepo,
  monthlyBudgetUsd,
  alertEmail,
  existingGithubOidcProviderArn: app.node.tryGetContext('githubOidcProviderArn'),
  description: 'Budget alerts and the GitHub Actions deploy role for byteatebits.dev',
});

const dns = new DnsStack(app, 'ByteatebitsDns', {
  env,
  tags,
  domainName,
  description: 'Route 53 hosted zone for byteatebits.dev',
});

new StaticSiteStack(app, 'ByteatebitsSite', {
  env,
  tags,
  domainName,
  hostedZone: dns.hostedZone,
  siteDistPath: path.join(import.meta.dirname, '..', '..', 'site', 'dist'),
  description: 'S3 + CloudFront static site for byteatebits.dev',
});
