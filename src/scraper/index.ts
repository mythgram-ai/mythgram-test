import { getWebSearchSettings } from '../web-search/index.js';
import {
  decodeHtmlEntities,
  extractImages,
  extractLinks,
  extractMetaDescription,
  extractTitle,
  htmlToMarkdown,
  htmlToText,
} from './html.js';

export {
  decodeHtmlEntities,
  extractImages,
  extractLinks,
  extractMetaDescription,
  extractTitle,
  htmlToMarkdown,
  htmlToText,
};


export type ScrapeFormat = 'markdown' | 'text' | 'json' | 'autodetect';

export function normalizeTargetUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) throw new Error('A URL is required.');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
export type ScraperProvider = 'builtin' | 'firecrawl';

export interface ScrapedPage {
  url: string;
  final_url: string;
  status: number;
  title: string;
  description: string;
  content: string;
  content_type: string;
  links: string[];
  images: string[];
  provider: ScraperProvider;
  fetched_at: number;
}

export interface ScrapeOptions {
  format?: ScrapeFormat;
  crawl?: boolean;
  maxPages?: number;
  maxDepth?: number;
  extractImages?: boolean;
  extractLinks?: boolean;
  timeoutMs?: number;
}

export interface ScrapeResponse {
  provider: ScraperProvider;
  format: ScrapeFormat;
  start_url: string;
  pages: ScrapedPage[];
  total_pages: number;
  crawled: boolean;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 MythgramBot/1.0';

function detectFormat(contentType: string, body: string, requested: ScrapeFormat): ScrapeFormat {
  if (requested !== 'autodetect') return requested;
  if (contentType.includes('json') || /^\s*[[{]/.test(body)) return 'json';
  if (contentType.includes('html')) return 'markdown';
  return 'text';
}

function applyFormat(
  html: string,
  contentType: string,
  body: string,
  format: ScrapeFormat
): string {
  const resolved = detectFormat(contentType, body, format);
  if (resolved === 'json') {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  if (resolved === 'text' || !contentType.includes('html')) {
    return contentType.includes('html') ? htmlToText(html) : body.trim();
  }
  return htmlToMarkdown(html);
}

async function fetchText(
  url: string,
  timeoutMs: number
): Promise<{ body: string; contentType: string; status: number; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const body = await res.text();
    return {
      body,
      contentType: (res.headers.get('content-type') || '').toLowerCase(),
      status: res.status,
      finalUrl: res.url || url,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function scrapeUrlBuiltIn(
  url: string,
  options: ScrapeOptions = {}
): Promise<ScrapedPage> {
  const format = options.format || 'markdown';
  const timeoutMs = options.timeoutMs ?? 60_000;
  url = normalizeTargetUrl(url);
  const parsed = new URL(url);
  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error('Only http(s) URLs can be fetched.');
  }

  const { body, contentType, status, finalUrl } = await fetchText(url, timeoutMs);
  if (status >= 400) {
    throw new Error(`Request failed with HTTP ${status} for ${url}`);
  }

  const isHtml = contentType.includes('html') || /<html[\s>]/i.test(body.slice(0, 2000));
  return {
    url,
    final_url: finalUrl,
    status,
    title: isHtml ? extractTitle(body) : '',
    description: isHtml ? extractMetaDescription(body) : '',
    content: applyFormat(body, contentType, body, format),
    content_type: contentType || 'text/plain',
    links: isHtml && options.extractLinks !== false ? extractLinks(body, finalUrl) : [],
    images: isHtml && options.extractImages !== false ? extractImages(body, finalUrl) : [],
    provider: 'builtin',
    fetched_at: Date.now(),
  };
}

async function firecrawlRequest(
  pathName: string,
  apiKey: string,
  init: RequestInit,
  timeoutMs: number
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.firecrawl.dev${pathName}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (!res.ok) {
      const message = json?.error || json?.message || text.slice(0, 300);
      throw new Error(`Firecrawl request failed (HTTP ${res.status}): ${message}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function imagesFromMarkdown(markdown: string): string[] {
  const images = new Set<string>();
  const re = /!\[[^\]]*\]\(([^)\s]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    if (/^https?:\/\//i.test(match[1])) images.add(match[1]);
  }
  return [...images];
}

async function scrapeUrlFirecrawl(
  url: string,
  apiKey: string,
  options: ScrapeOptions = {}
): Promise<ScrapedPage> {
  const format = options.format === 'text' ? 'text' : 'markdown';
  const timeoutMs = options.timeoutMs ?? 120_000;
  const json = await firecrawlRequest(
    '/v1/scrape',
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    },
    timeoutMs
  );

  const data = json?.data || {};
  const metadata = data.metadata || {};
  const markdown: string = data.markdown || data.content || '';
  return {
    url,
    final_url: metadata.sourceURL || url,
    status: Number(metadata.statusCode) || 200,
    title: metadata.title || '',
    description: metadata.description || '',
    content: format === 'text' ? htmlToText(markdown) : markdown,
    content_type: 'text/html',
    links: options.extractLinks === false ? [] : Array.isArray(data.links) ? data.links : [],
    images:
      options.extractImages === false
        ? []
        : [...new Set([...(metadata.ogImage ? [metadata.ogImage] : []), ...imagesFromMarkdown(markdown)])],
    provider: 'firecrawl',
    fetched_at: Date.now(),
  };
}

async function crawlFirecrawl(
  url: string,
  apiKey: string,
  options: ScrapeOptions
): Promise<ScrapedPage[]> {
  const maxPages = Math.min(Math.max(options.maxPages ?? 6, 1), 10);
  const timeoutMs = options.timeoutMs ?? 120_000;
  const start = await firecrawlRequest(
    '/v1/crawl',
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify({ url, limit: maxPages, maxDepth: options.maxDepth ?? 2, scrapeOptions: { formats: ['markdown'], onlyMainContent: true } }),
    },
    timeoutMs
  );

  const jobId = start?.id;
  if (!jobId) {
    const single = await scrapeUrlFirecrawl(url, apiKey, options);
    return [single];
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await firecrawlRequest(`/v1/crawl/${jobId}`, apiKey, { method: 'GET' }, 30_000);
    if (status?.status === 'completed' && Array.isArray(status.data)) {
      return status.data.slice(0, maxPages).map((item: any) => {
        const metadata = item.metadata || {};
        const markdown: string = item.markdown || '';
        return {
          url: metadata.sourceURL || url,
          final_url: metadata.sourceURL || url,
          status: Number(metadata.statusCode) || 200,
          title: metadata.title || '',
          description: metadata.description || '',
          content: options.format === 'text' ? htmlToText(markdown) : markdown,
          content_type: 'text/html',
          links: options.extractLinks === false ? [] : Array.isArray(item.links) ? item.links : [],
          images:
            options.extractImages === false
              ? []
              : [...new Set([...(metadata.ogImage ? [metadata.ogImage] : []), ...imagesFromMarkdown(markdown)])],
          provider: 'firecrawl' as const,
          fetched_at: Date.now(),
        };
      });
    }
    if (status?.status === 'failed') {
      throw new Error(`Firecrawl crawl failed: ${status?.error || 'unknown error'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return [await scrapeUrlFirecrawl(url, apiKey, options)];
}

/**
 * Crawls same-site links breadth-first using the built-in scraper.
 */
export async function crawlSiteBuiltIn(
  url: string,
  options: ScrapeOptions = {}
): Promise<ScrapedPage[]> {
  const maxPages = Math.min(Math.max(options.maxPages ?? 6, 1), 10);
  const maxDepth = Math.min(Math.max(options.maxDepth ?? 2, 1), 3);
  const origin = new URL(url).origin;

  const pages: ScrapedPage[] = [];
  const seen = new Set<string>();
  let frontier: { url: string; depth: number }[] = [{ url, depth: 0 }];

  while (frontier.length > 0 && pages.length < maxPages) {
    const next: { url: string; depth: number }[] = [];
    for (const item of frontier) {
      if (pages.length >= maxPages) break;
      const normalized = item.url.split('#')[0];
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      try {
        const page = await scrapeUrlBuiltIn(normalized, {
          ...options,
          extractLinks: true,
          extractImages: options.extractImages,
        });
        pages.push(page);
        if (item.depth < maxDepth) {
          for (const link of page.links) {
            if (new URL(link).origin === origin && !seen.has(link.split('#')[0])) {
              next.push({ url: link, depth: item.depth + 1 });
            }
          }
        }
      } catch {
        // skip unreachable pages during crawl
      }
    }
    frontier = next;
  }

  return pages;
}

/**
 * Fetches one URL or crawls a site using the scraper selected in Settings → Web Search.
 */
export async function fetchWebUrls(
  url: string,
  options: ScrapeOptions = {}
): Promise<ScrapeResponse> {
  url = normalizeTargetUrl(url);
  const settings = await getWebSearchSettings();
  const provider: ScraperProvider =
    settings.scraper_provider === 'firecrawl' && settings.firecrawl_api_key ? 'firecrawl' : 'builtin';

  if (provider === 'firecrawl' && !settings.firecrawl_api_key) {
    throw new Error(
      'Firecrawl is selected but no Firecrawl API key is configured. Add one in Settings → Web Search or switch back to the built-in scraper.'
    );
  }

  const pages =
    provider === 'firecrawl'
      ? options.crawl
        ? await crawlFirecrawl(url, settings.firecrawl_api_key, options)
        : [await scrapeUrlFirecrawl(url, settings.firecrawl_api_key, options)]
      : options.crawl
      ? await crawlSiteBuiltIn(url, options)
      : [await scrapeUrlBuiltIn(url, options)];

  return {
    provider,
    format: options.format || 'markdown',
    start_url: url,
    pages,
    total_pages: pages.length,
    crawled: Boolean(options.crawl),
  };
}
