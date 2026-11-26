# byteatebits.dev

George's portfolio site and AWS Solutions Architect lab: an [Astro](https://astro.build) static site on
S3 and CloudFront, with DNS in Route 53, all defined in code with AWS CDK and deployed by GitHub Actions.

## What's in here

| Folder | What it is |
| --- | --- |
| `site/` | The website (Astro). Pages, Markdown posts and the Lego collection list. |
| `infra/` | AWS infrastructure in CDK (TypeScript): DNS, the S3 bucket, CloudFront, HTTPS certificate, budget, deploy role. |
| `.github/workflows/` | `ci.yml` checks every pull request; `deploy.yml` publishes `main` to AWS. |
| `docs/SETUP.md` | One-time AWS and Hostinger setup, step by step. |

## Architecture (phase 1)

```
Visitor ──HTTPS──> CloudFront (ACM cert, edge function, security headers) ──OAC──> private S3 bucket
                     ^
Route 53 (byteatebits.dev, www) ── alias records       Hostinger = registrar only (nameservers -> Route 53)
```

Later phases add scheduled Lambdas, DynamoDB and an API for the F1 dashboards, Lego news and the price tracker.

## Editing the site

You don't need to touch code for most changes:

- **Homelab post:** add a Markdown file to `site/src/content/homelab/` (copy `nas.md` as a template).
- **Lego set:** add an entry to `site/src/data/lego.json`; put the photo in `site/public/lego/`.
- **Resume:** put your PDF at `site/public/resume/resume.pdf` and edit `site/src/pages/portfolio.astro`.

Preview locally:

```bash
cd site
npm install
npm run dev     # open http://localhost:4321
```

## Deploying

After the one-time setup in [docs/SETUP.md](docs/SETUP.md), merging a pull request into `main` builds the
site and deploys it automatically. Until then, the deploy workflow skips itself.

## Cost

Phase 1 runs at about $1 a month (mostly the $0.50 Route 53 hosted zone). An AWS Budget emails alerts at
$5, $10 and $15 a month.
