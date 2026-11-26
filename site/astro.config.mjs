// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://byteatebits.dev',
  // Every page becomes /page/index.html, which S3 + CloudFront serve cleanly.
  build: { format: 'directory' },
  trailingSlash: 'ignore',
});
