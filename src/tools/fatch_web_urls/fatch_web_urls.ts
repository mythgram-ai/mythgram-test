import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { fetchWebUrls, ScrapeFormat } from '../../scraper/index.js';

export const fatchWebUrlsSchema = z
  .object({
    url: z.string().min(1).describe('The URL to fetch or scrape.'),
    format: z
      .enum(['markdown', 'text', 'json', 'autodetect'])
      .default('markdown')
      .describe('Output format for the extracted content.'),
    crawl: z
      .boolean()
      .default(false)
      .describe('When true, crawl linked pages on the same site.'),
    maxPages: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(6)
      .describe('Maximum pages to fetch when crawling; ignored unless crawl is true.'),
    maxDepth: z
      .number()
      .int()
      .min(1)
      .max(3)
      .default(2)
      .describe('Maximum link depth when crawling; ignored unless crawl is true.'),
    extractImages: z
      .boolean()
      .default(true)
      .describe('Include extracted image URLs in the result for HTML pages.'),
    extractLinks: z
      .boolean()
      .default(true)
      .describe('Include extracted link URLs in the result for HTML pages.'),
  })
  .strict();

const MAX_CONTENT_CHARS = 60_000;

function truncate(content: string): { content: string; truncated: boolean } {
  if (content.length <= MAX_CONTENT_CHARS) return { content, truncated: false };
  return {
    content: `${content.slice(0, MAX_CONTENT_CHARS)}\n\n[Content truncated at ${MAX_CONTENT_CHARS} characters]`,
    truncated: true,
  };
}

export const fatchWebUrlsTool: MythgramTool<typeof fatchWebUrlsSchema> = {
  name: 'fatch_web_urls',
  description:
    'Fetch and extract clean content from a URL — a single page or a full site crawl. Returns Markdown, text, JSON, or auto-detected content plus page metadata, links, and images. Set crawl=true to fetch linked pages on the same site, bounded by maxPages and maxDepth. Uses the built-in scraper by default, or Firecrawl when configured in Settings → Web Search.',
  schema: fatchWebUrlsSchema,
  execute: async (args) => {
    const response = await fetchWebUrls(args.url, {
      format: args.format as ScrapeFormat,
      crawl: args.crawl,
      maxPages: args.maxPages,
      maxDepth: args.maxDepth,
      extractImages: args.extractImages,
      extractLinks: args.extractLinks,
    });

    return {
      success: true,
      provider: response.provider,
      format: response.format,
      start_url: response.start_url,
      crawled: response.crawled,
      total_pages: response.total_pages,
      pages: response.pages.map((page) => {
        const { content, truncated } = truncate(page.content);
        return {
          url: page.url,
          final_url: page.final_url,
          status: page.status,
          title: page.title,
          description: page.description,
          content_type: page.content_type,
          content,
          truncated,
          links: page.links,
          images: page.images,
        };
      }),
    };
  },
};
