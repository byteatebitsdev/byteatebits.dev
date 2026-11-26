import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface FoundationStackProps extends cdk.StackProps {
  /** owner/repo allowed to deploy, e.g. byteatebitsdev/byteatebits.dev */
  githubRepo: string;
  monthlyBudgetUsd: number;
  /** Where budget alerts go. If omitted, the budget is skipped (with a warning). */
  alertEmail?: string;
  /** Set if this AWS account already has the GitHub OIDC provider (only one is allowed per account). */
  existingGithubOidcProviderArn?: string;
}

/**
 * Account-level guardrails. Deploy this one from your own computer first:
 *   npx cdk deploy ByteatebitsFoundation -c alertEmail=you@example.com
 */
export class FoundationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    // --- Monthly budget with email alerts -------------------------------------------------
    if (props.alertEmail) {
      const ceiling = props.monthlyBudgetUsd;
      const subscribers = [{ subscriptionType: 'EMAIL', address: props.alertEmail }];
      const alert = (amount: number, notificationType: 'ACTUAL' | 'FORECASTED') => ({
        notification: {
          notificationType,
          comparisonOperator: 'GREATER_THAN',
          threshold: amount,
          thresholdType: 'ABSOLUTE_VALUE',
        },
        subscribers,
      });

      new budgets.CfnBudget(this, 'MonthlyBudget', {
        budget: {
          budgetName: 'byteatebits-monthly',
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: ceiling, unit: 'USD' },
        },
        notificationsWithSubscribers: [
          alert(Math.round(ceiling / 3), 'ACTUAL'), // $5: phase 1 should never get here
          alert(Math.round((ceiling * 2) / 3), 'ACTUAL'), // $10
          alert(ceiling, 'ACTUAL'), // $15 ceiling reached
          alert(ceiling, 'FORECASTED'), // early warning that the month will end above the ceiling
        ],
      });
    } else {
      cdk.Annotations.of(this).addWarningV2(
        'byteatebits:noAlertEmail',
        'No alertEmail context set, so the budget was not created. Deploy with -c alertEmail=you@example.com',
      );
    }

    // --- GitHub Actions deploy role (OIDC, no stored AWS keys) ----------------------------
    const providerArn =
      props.existingGithubOidcProviderArn ??
      new iam.CfnOIDCProvider(this, 'GithubOidc', {
        url: 'https://token.actions.githubusercontent.com',
        clientIdList: ['sts.amazonaws.com'],
      }).attrArn;

    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      roleName: 'byteatebits-github-deploy',
      description: `Assumed by GitHub Actions on the main branch of ${props.githubRepo}`,
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        StringLike: { 'token.actions.githubusercontent.com:sub': `repo:${props.githubRepo}:ref:refs/heads/main` },
      }),
    });

    // The role can only hand off to the CDK bootstrap roles, which do the actual deploying.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    new cdk.CfnOutput(this, 'GithubDeployRoleArn', {
      value: deployRole.roleArn,
      description: 'Save as the AWS_DEPLOY_ROLE_ARN variable in the GitHub repo settings',
    });
  }
}
