# One-time setup

Do these steps once, in order. They take about an hour, plus waiting for DNS to update.
Commands run in a terminal on your computer.

## 1. Tools on your computer

- [Node.js 22](https://nodejs.org) (LTS)
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [Git](https://git-scm.com), then `git clone https://github.com/byteatebitsdev/byteatebits.dev`

## 2. Secure the AWS account

1. Sign in as the root user, turn on **MFA** (IAM > Security credentials), then stop using root.
2. Open **IAM Identity Center**, enable it, and create a user for yourself with the
   `AdministratorAccess` permission set.
3. On your computer: `aws configure sso` (use the Identity Center start URL), name the profile `byteatebits`,
   then `export AWS_PROFILE=byteatebits` (Windows PowerShell: `$env:AWS_PROFILE="byteatebits"`).
4. Check it works: `aws sts get-caller-identity`.

## 3. Bootstrap CDK (once per account and region)

```bash
cd infra
npm install
npx cdk bootstrap aws://<your-12-digit-account-id>/us-east-1
```

## 4. Budget alerts and the GitHub deploy role

```bash
npx cdk deploy ByteatebitsFoundation -c alertEmail=<your email>
```

Note the `GithubDeployRoleArn` output. If this fails with "provider already exists", your account already
has GitHub's OIDC provider; rerun with `-c githubOidcProviderArn=<its ARN from IAM > Identity providers>`.

## 5. Move DNS from Hostinger to Route 53

```bash
npx cdk deploy ByteatebitsDns
```

1. Copy the four `NameServers` from the output.
2. In Hostinger: **Domains > byteatebits.dev > DNS / Nameservers > Change nameservers**, choose custom
   nameservers, and paste the four values (without trailing dots).
3. Wait until `nslookup -type=NS byteatebits.dev` shows the `awsdns` servers. Usually under an hour,
   occasionally up to 48 hours.

Your domain stays registered (and renewed) at Hostinger. Only DNS moves.

## 6. First site deploy

```bash
cd ../site && npm install && npm run build
cd ../infra && npx cdk deploy ByteatebitsSite
```

The HTTPS certificate validates through Route 53, so this step waits until step 5 has propagated.
The first CloudFront deploy takes about 5 to 10 minutes. Then open https://byteatebits.dev.

## 7. Turn on automatic deploys

In GitHub, **Settings > Environments > New environment** named `production`
(optionally add yourself as a required reviewer). Then **Settings > Secrets and variables > Actions >
Variables > New repository variable**:

- Name: `AWS_DEPLOY_ROLE_ARN`
- Value: the `GithubDeployRoleArn` from step 4

From now on, every merge to `main` builds and deploys the site.
