import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Each Markdown file in src/content/homelab becomes a post at /homelab/<file name>/.
const homelab = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/homelab' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { homelab };
