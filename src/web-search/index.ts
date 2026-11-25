import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../datadir/index.js';
import { decodeHtmlEntities } from '../scraper/html.js';

export type WebSearchProviderId = 'duckduckgo' | 'tavily' | 'exa' | 'serpapi';
export type ScraperProviderId = 'builtin' | 'firecrawl';

export interface WebSearchSettings {
  provider: WebSearchProviderId;
  scraper_provider: ScraperProviderId;
  api_keys: Partial<Record<WebSearchProviderId, string>>;
  firecrawl_api_key: string;
}

export interface WebSearchProviderInfo {
  id: WebSearchProviderId;
  name: string;
  requires_api_key: boolean;
  supports_images: boolean;
  docs_url: string;
  key_placeholder: string;
}

export const WEB_SEARCH_PROVIDERS: WebSearchProviderInfo[] = [
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    requires_api_key: false,
    supports_images: true,
    docs_url: 'https://duckduckgo.com/',
    key_placeholder: '',
  },
  {
    id: 'tavily',
    name: 'Tavily',
    requires_api_key: true,
    supports_images: true,
    docs_url: 'https://docs.tavily.com/documentation/api-reference/endpoint/search',
    key_placeholder: 'tvly-...',
  },
  {
    id: 'exa',
    name: 'Exa',
    requires_api_key: true,
    supports_images: false,
    docs_url: 'https://docs.exa.ai/reference/search',
    key_placeholder: 'exa api key',
  },
  {
    id: 'serpapi',
    name: 'SerpAPI',
    requires_api_key: true,
    supports_images: true,
    docs_url: 'https://serpapi.com/search-api',
    key_placeholder: 'serpapi api key',
  },
];

const DEFAULT_SETTINGS: WebSearchSettings = {
  provider: 'duckduckgo',
  scraper_provider: 'builtin',
  api_keys: {},
  firecrawl_api_key: '',
};

export type WebSearchEngine = WebSearchProviderId | 'bing';
export type ImageSearchEngine = WebSearchProviderId | 'bing';

export interface WebSearchResult {
  title: string;
  url: string;
  description: string;
  source?: string;
  published_at?: string;
}

export interface ImageSearchResult {
  title: string;
  image_url: string;
  thumbnail_url?: string;
  source_url?: string;
  width?: number;
  height?: number;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function settingsPath(): string {
  const paths = getDataDir();
  if (!fsSync.existsSync(paths.webSearchDir)) {
    fsSync.mkdirSync(paths.webSearchDir, { recursive: true, mode: 0o700 });
  }
  return paths.webSearchJsonPath;
}

export async function getWebSearchSettings(): Promise<WebSearchSettings> {
  const file = settingsPath();
  try {
    const raw = await fs.readFile(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      api_keys: { ...DEFAULT_SETTINGS.api_keys, ...(parsed?.api_keys || {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS, api_keys: {} };
  }
}

export function getWebSearchSettingsSync(): WebSearchSettings {
  try {
    const raw = fsSync.readFileSync(settingsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      api_keys: { ...DEFAULT_SETTINGS.api_keys, ...(parsed?.api_keys || {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS, api_keys: {} };
  }
}

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

/**
 * Frontend-safe view: API keys are masked, never returned in clear text.
 */
export async function getMaskedWebSearchSettings(): Promise<{
  provider: WebSearchProviderId;
  scraper_provider: ScraperProviderId;
  api_keys: Record<string, { configured: boolean; masked: string }>;
  firecrawl: { configured: boolean; masked: string };
  providers: WebSearchProviderInfo[];
}> {
  const settings = await getWebSearchSettings();
  const apiKeys: Record<string, { configured: boolean; masked: string }> = {};
  for (const provider of WEB_SEARCH_PROVIDERS) {
    const key = settings.api_keys[provider.id] || '';
    apiKeys[provider.id] = { configured: Boolean(key), masked: maskKey(key) };
  }
  return {
    provider: settings.provider,
    scraper_provider: settings.scraper_provider,
    api_keys: apiKeys,
    firecrawl: {
      configured: Boolean(settings.firecrawl_api_key),
      masked: maskKey(settings.firecrawl_api_key),
    },
    providers: WEB_SEARCH_PROVIDERS,
  };
}

export async function updateWebSearchSettings(patch: {
  provider?: WebSearchProviderId;
  scraper_provider?: ScraperProviderId;
  api_keys?: Partial<Record<WebSearchProviderId, string | null>>;
  firecrawl_api_key?: string | null;
}): Promise<WebSearchSettings> {
  const current = await getWebSearchSettings();
  const next: WebSearchSettings = {
    provider: patch.provider ?? current.provider,
    scraper_provider: patch.scraper_provider ?? current.scraper_provider,
    api_keys: { ...current.api_keys },
    firecrawl_api_key: current.firecrawl_api_key,
  };

  if (!WEB_SEARCH_PROVIDERS.some((p) => p.id === next.provider)) {
    throw new Error(`Unknown web search provider: ${next.provider}`);
  }
  if (next.scraper_provider !== 'builtin' && next.scraper_provider !== 'firecrawl') {
    throw new Error(`Unknown scraper provider: ${next.scraper_provider}`);
  }

  if (patch.api_keys) {
    for (const [id, value] of Object.entries(patch.api_keys)) {
      if (value === null || value === '') {
        delete next.api_keys[id as WebSearchProviderId];
      } else if (typeof value === 'string') {
        next.api_keys[id as WebSearchProviderId] = value.trim();
      }
    }
  }
  if (patch.firecrawl_api_key !== undefined) {
    next.firecrawl_api_key =
      patch.firecrawl_api_key === null ? '' : patch.firecrawl_api_key.trim();
  }

  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
  return next;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function requireKey(settings: WebSearchSettings, provider: WebSearchProviderId): string {
  const key = settings.api_keys[provider];
  if (!key) {
    const info = WEB_SEARCH_PROVIDERS.find((p) => p.id === provider);
    throw new Error(
      `${info?.name || provider} is the selected web search provider but no API key is configured. Add the key in Settings → Web Search, or switch the provider to DuckDuckGo (no key required).`
    );
  }
  return key;
}

function resolveDuckDuckGoUrl(rawHref: string): string {
  const decoded = decodeHtmlEntities(rawHref);
  const absolute = decoded.startsWith('//') ? `https:${decoded}` : decoded;
  try {
    const url = new URL(absolute);
    const uddg = url.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return url.toString();
  } catch {
    return decoded;
  }
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDuckDuckGoChallenge(html: string, status?: number): boolean {
  if (status === 202) return true;
  return /anomaly-modal|bots use DuckDuckGo too|challenge-form|anomaly\.js/i.test(html);
}

const DDG_SNIPPET_RE =
  /<(?:a|div|td|span)[^>]*class=["'][^"']*result(?:__snippet|-snippet)[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|td|span)>/i;

/**
 * Collects result anchors in document order. DuckDuckGo reshuffles wrappers and attribute
 * order between its HTML and Lite surfaces, so results are identified by anchor class (or,
 * as a last resort, by the `/l/?uddg=` redirect shape) instead of nested block markup.
 */
function collectDuckDuckGoResults(
  html: string,
  maxResults: number,
  isResultAnchor: (attrs: string, href: string) => boolean
): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) && results.length < maxResults) {
    const attrs = match[1];
    const href = (attrs.match(/href=["']([^"']+)["']/i) || [])[1] || '';
    if (!href || /\/y\.js|ad_provider=/i.test(href)) continue;
    if (!isResultAnchor(attrs, href)) continue;

    const title = stripTags(match[2]);
    if (!title) continue;

    const url = resolveDuckDuckGoUrl(href);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const following = html.slice(anchorRe.lastIndex, anchorRe.lastIndex + 3000);
    const snippet = following.match(DDG_SNIPPET_RE);
    results.push({
      title,
      url,
      description: snippet ? stripTags(snippet[1]) : '',
      source: 'duckduckgo',
    });
  }
  return results;
}

export function parseDuckDuckGoHtml(html: string, maxResults: number): WebSearchResult[] {
  const strict = collectDuckDuckGoResults(html, maxResults, (attrs) =>
    /class=["'][^"']*result__a[^"']*["']/i.test(attrs)
  );
  if (strict.length > 0) return strict;

  return collectDuckDuckGoResults(
    html,
    maxResults,
    (attrs, href) =>
      /\/l\/\?uddg=/i.test(href) && !/class=["'][^"']*result__snippet/i.test(attrs)
  );
}

export function parseDuckDuckGoLite(html: string, maxResults: number): WebSearchResult[] {
  const strict = collectDuckDuckGoResults(html, maxResults, (attrs) =>
    /class=["'][^"']*result-link[^"']*["']/i.test(attrs)
  );
  if (strict.length > 0) return strict;
  return parseDuckDuckGoHtml(html, maxResults);
}

export function decodeBingRedirectUrl(rawHref: string): string {
  const decoded = decodeHtmlEntities(rawHref);
  try {
    const url = new URL(decoded, 'https://www.bing.com');
    const target = url.searchParams.get('u');
    if (target && target.startsWith('a1')) {
      const base64 = target.slice(2).replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      return Buffer.from(padded, 'base64').toString('utf-8');
    }
    return url.toString();
  } catch {
    return decoded;
  }
}

export function parseBingHtml(html: string, maxResults: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const seen = new Set<string>();
  const blockRe = /<li[^>]*class=["'][^"']*b_algo[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(html)) && results.length < maxResults) {
    const chunk = block[1];
    const heading = chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const anchor = heading?.[1].match(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;

    const title = stripTags(anchor[2]);
    if (!title) continue;

    const cite = chunk.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i);
    const citeUrl = cite
      ? stripTags(cite[1]).replace(/\s*›\s*/g, '/').replace(/\s+/g, '')
      : '';
    const decodedHref = decodeBingRedirectUrl(anchor[1]);
    // Bing wraps links in bing.com/ck/a redirects; <cite> is a display breadcrumb, not a URL.
    const url =
      /^https?:\/\//i.test(decodedHref) && !/^https?:\/\/(www\.)?bing\.com\//i.test(decodedHref)
        ? decodedHref
        : citeUrl;
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);

    const paragraph = chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const description = paragraph
      ? stripTags(paragraph[1].replace(/<a[^>]*b_algoReadMore[\s\S]*?<\/a>/gi, ''))
      : '';
    results.push({ title, url, description, source: 'bing' });
  }
  return results;
}

export function parseBingImagesHtml(html: string, maxResults: number): ImageSearchResult[] {
  const results: ImageSearchResult[] = [];
  const seen = new Set<string>();
  const metaRe = /\bm="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = metaRe.exec(html)) && results.length < maxResults) {
    let meta: any;
    try {
      meta = JSON.parse(decodeHtmlEntities(match[1]));
    } catch {
      continue;
    }
    const imageUrl = typeof meta?.murl === 'string' ? meta.murl : '';
    if (!imageUrl || seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    results.push({
      title: typeof meta?.t === 'string' ? decodeHtmlEntities(meta.t) : '',
      image_url: imageUrl,
      thumbnail_url: typeof meta?.turl === 'string' ? meta.turl : undefined,
      source_url: typeof meta?.purl === 'string' ? meta.purl : undefined,
    });
  }
  return results;
}

function describeFetchError(err: unknown): string {
  const anyErr = err as any;
  const cause = anyErr?.cause?.code || anyErr?.cause?.message || '';
  const message = anyErr?.message || String(err);
  return cause ? `${message}: ${cause}` : message;
}

export function extractVqd(html: string): string | null {
  const patterns = [/vqd=["']([\d-]+)["']/i, /vqd=([\d-]+)&/i, /"vqd":"([^"]+)"/i];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function parseDuckDuckGoImages(payload: any, maxResults: number): ImageSearchResult[] {
  const raw = Array.isArray(payload?.results) ? payload.results : [];
  return raw
    .filter((item: any) => typeof item?.image === 'string')
    .slice(0, maxResults)
    .map((item: any) => ({
      title: typeof item.title === 'string' ? decodeHtmlEntities(item.title) : '',
      image_url: item.image,
      thumbnail_url: typeof item.thumbnail === 'string' ? item.thumbnail : undefined,
      source_url: typeof item.url === 'string' ? item.url : undefined,
      width: Number(item.width) || undefined,
      height: Number(item.height) || undefined,
    }));
}

async function duckDuckGoSearch(query: string, maxResults: number, timeoutMs: number) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'text/html,application/xhtml+xml',
  };
  const formBody = () => new URLSearchParams({ q: query, kl: 'wt-wt' }).toString();
  const attempts: { url: string; init: RequestInit }[] = [
    {
      url: 'https://html.duckduckgo.com/html/',
      init: { method: 'POST', headers, body: formBody() },
    },
    {
      url: `https://lite.duckduckgo.com/lite/?${new URLSearchParams({ q: query }).toString()}`,
      init: { method: 'GET', headers: { ...headers, 'Content-Type': undefined } as any },
    },
    {
      url: 'https://lite.duckduckgo.com/lite/',
      init: { method: 'POST', headers, body: formBody() },
    },
  ];

  let lastError = 'no response';
  let blocked = false;
  for (const attempt of attempts) {
    try {
      const res = await fetchWithTimeout(attempt.url, attempt.init, timeoutMs);
      const html = await res.text();
      if (isDuckDuckGoChallenge(html, res.status)) {
        blocked = true;
        continue;
      }
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const parsed = parseDuckDuckGoHtml(html, maxResults);
      const results = parsed.length > 0 ? parsed : parseDuckDuckGoLite(html, maxResults);
      if (results.length > 0) return results;
      lastError = 'no results parsed';
    } catch (err) {
      lastError = describeFetchError(err);
    }
  }

  throw new Error(
    blocked
      ? 'DuckDuckGo blocked the request with a bot challenge (captcha)'
      : `DuckDuckGo search failed (${lastError})`
  );
}

async function tavilySearch(query: string, maxResults: number, timeoutMs: number, key: string) {
  const res = await fetchWithTimeout(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: false,
      }),
    },
    timeoutMs
  );
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `Tavily search failed (HTTP ${res.status}): ${data?.detail?.error || data?.detail || data?.error || 'unknown error'}`
    );
  }
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.slice(0, maxResults).map((item: any) => ({
    title: item.title || '',
    url: item.url || '',
    description: item.content || item.snippet || '',
    source: 'tavily',
    published_at: item.published_date || undefined,
  })) as WebSearchResult[];
}

async function exaSearch(query: string, maxResults: number, timeoutMs: number, key: string) {
  const res = await fetchWithTimeout(
    'https://api.exa.ai/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
      },
      body: JSON.stringify({
        query,
        numResults: maxResults,
        contents: { text: { maxCharacters: 1200 } },
      }),
    },
    timeoutMs
  );
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `Exa search failed (HTTP ${res.status}): ${data?.error || data?.message || 'unknown error'}`
    );
  }
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.slice(0, maxResults).map((item: any) => ({
    title: item.title || item.url || '',
    url: item.url || '',
    description: item.text || item.summary || '',
    source: 'exa',
    published_at: item.publishedDate || undefined,
  })) as WebSearchResult[];
}

async function serpApiSearch(query: string, maxResults: number, timeoutMs: number, key: string) {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', String(Math.min(maxResults, 100)));
  url.searchParams.set('api_key', key);

  const res = await fetchWithTimeout(
    url.toString(),
    { method: 'GET', headers: { Accept: 'application/json' } },
    timeoutMs
  );
  const data: any = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    throw new Error(
      `SerpAPI search failed (HTTP ${res.status}): ${data?.error || 'unknown error'}`
    );
  }
  const results = Array.isArray(data?.organic_results) ? data.organic_results : [];
  return results.slice(0, maxResults).map((item: any) => ({
    title: item.title || '',
    url: item.link || '',
    description: item.snippet || '',
    source: 'serpapi',
    published_at: item.date || undefined,
  })) as WebSearchResult[];
}

const BING_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function bingSearch(query: string, maxResults: number, timeoutMs: number) {
  const url = new URL('https://www.bing.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(maxResults * 2, 50)));
  url.searchParams.set('setlang', 'en');
  const res = await fetchWithTimeout(url.toString(), { headers: BING_HEADERS }, timeoutMs);
  if (!res.ok) throw new Error(`Bing search failed with HTTP ${res.status}`);
  const results = parseBingHtml(await res.text(), maxResults);
  if (results.length === 0) throw new Error('Bing returned no parseable results');
  return results;
}

async function bingImages(query: string, maxResults: number, timeoutMs: number) {
  const url = new URL('https://www.bing.com/images/search');
  url.searchParams.set('q', query);
  url.searchParams.set('form', 'HDRSC2');
  url.searchParams.set('first', '1');
  const res = await fetchWithTimeout(url.toString(), { headers: BING_HEADERS }, timeoutMs);
  if (!res.ok) throw new Error(`Bing image search failed with HTTP ${res.status}`);
  const results = parseBingImagesHtml(await res.text(), maxResults);
  if (results.length === 0) throw new Error('Bing image search returned no parseable results');
  return results;
}

async function keylessWebSearch(
  query: string,
  maxResults: number,
  timeoutMs: number
): Promise<{ results: WebSearchResult[]; engine: WebSearchEngine; note?: string }> {
  try {
    return { results: await duckDuckGoSearch(query, maxResults, timeoutMs), engine: 'duckduckgo' };
  } catch (ddgErr: any) {
    try {
      const results = await bingSearch(query, maxResults, timeoutMs);
      return {
        results,
        engine: 'bing',
        note: `${ddgErr?.message || 'DuckDuckGo search failed'}. Results were fetched from Bing instead.`,
      };
    } catch (bingErr: any) {
      throw new Error(
        `${ddgErr?.message || 'DuckDuckGo search failed'}. The keyless Bing fallback also failed (${
          bingErr?.message || 'unknown error'
        }). Configure Tavily, Exa, or SerpAPI in Settings → Web Search.`
      );
    }
  }
}

async function keylessImageSearch(
  query: string,
  maxResults: number,
  timeoutMs: number
): Promise<{ results: ImageSearchResult[]; engine: ImageSearchEngine; note?: string }> {
  try {
    return { results: await duckDuckGoImages(query, maxResults, timeoutMs), engine: 'duckduckgo' };
  } catch (ddgErr: any) {
    try {
      const results = await bingImages(query, maxResults, timeoutMs);
      return {
        results,
        engine: 'bing',
        note: `${ddgErr?.message || 'DuckDuckGo image search failed'}. Images were fetched from Bing instead.`,
      };
    } catch (bingErr: any) {
      throw new Error(
        `${ddgErr?.message || 'DuckDuckGo image search failed'}. The keyless Bing fallback also failed (${
          bingErr?.message || 'unknown error'
        }). Configure Tavily or SerpAPI in Settings → Web Search.`
      );
    }
  }
}

export const DESCRIPTION_WORD_LIMIT = 30;
/** Appended to a description that was cut at the word limit. */
export const DESCRIPTION_TRUNCATION_MARKER = '........... ';

export function truncateDescription(
  description: string,
  wordLimit = DESCRIPTION_WORD_LIMIT
): string {
  const normalized = (description || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const words = normalized.split(' ');
  if (words.length <= wordLimit) return normalized;
  return `${words.slice(0, wordLimit).join(' ')}${DESCRIPTION_TRUNCATION_MARKER}`;
}

function limitDescriptions(results: WebSearchResult[]): WebSearchResult[] {
  return results.map((result) => ({
    ...result,
    description: truncateDescription(result.description),
  }));
}

/**
 * Runs a web search with the provider selected in Settings → Web Search.
 * DuckDuckGo is keyless, so it falls back to Bing when DuckDuckGo blocks the request.
 */
export async function webSearch(
  query: string,
  options: { maxResults?: number; timeoutMs?: number } = {}
): Promise<{
  provider: WebSearchProviderId;
  engine: WebSearchEngine;
  query: string;
  results: WebSearchResult[];
  max_results: number;
  note?: string;
}> {
  const maxResults = Math.min(Math.max(options.maxResults ?? 20, 1), 20);
  const timeoutMs = options.timeoutMs ?? 180_000;
  const settings = await getWebSearchSettings();
  const provider = settings.provider;

  if (provider === 'tavily' || provider === 'exa' || provider === 'serpapi') {
    const key = requireKey(settings, provider);
    const results =
      provider === 'tavily'
        ? await tavilySearch(query, maxResults, timeoutMs, key)
        : provider === 'exa'
          ? await exaSearch(query, maxResults, timeoutMs, key)
          : await serpApiSearch(query, maxResults, timeoutMs, key);
    return {
      provider,
      engine: provider,
      query,
      results: limitDescriptions(results),
      max_results: maxResults,
    };
  }

  const { results, engine, note } = await keylessWebSearch(query, maxResults, timeoutMs);
  return {
    provider,
    engine,
    query,
    results: limitDescriptions(results),
    max_results: maxResults,
    note,
  };
}

async function duckDuckGoImages(
  query: string,
  maxResults: number,
  timeoutMs: number
): Promise<ImageSearchResult[]> {
  let landing: Response;
  try {
    landing = await fetchWithTimeout(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      { headers: { 'User-Agent': USER_AGENT } },
      timeoutMs
    );
  } catch (err) {
    throw new Error(
      `DuckDuckGo image search is unreachable from this machine (${describeFetchError(
        err
      )}). Check the network, or configure Tavily or SerpAPI in Settings → Web Search.`
    );
  }
  const html = await landing.text();
  const vqd = extractVqd(html);
  if (!vqd) {
    throw new Error('DuckDuckGo image search could not obtain a request token (vqd).');
  }

  const url = new URL('https://duckduckgo.com/i.js');
  url.searchParams.set('l', 'us-en');
  url.searchParams.set('o', 'json');
  url.searchParams.set('q', query);
  url.searchParams.set('vqd', vqd);
  url.searchParams.set('f', ',,,,,');
  url.searchParams.set('p', '1');

  const res = await fetchWithTimeout(
    url.toString(),
    {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://duckduckgo.com/',
        Accept: 'application/json',
      },
    },
    timeoutMs
  );
  if (!res.ok) {
    throw new Error(`DuckDuckGo image search failed with HTTP ${res.status}.`);
  }
  const data = await res.json().catch(() => null);
  return parseDuckDuckGoImages(data, maxResults);
}

async function tavilyImages(
  query: string,
  maxResults: number,
  timeoutMs: number,
  key: string
): Promise<ImageSearchResult[]> {
  const res = await fetchWithTimeout(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: Math.min(maxResults, 20),
        include_images: true,
        include_image_descriptions: true,
        search_depth: 'basic',
      }),
    },
    timeoutMs
  );
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `Tavily image search failed (HTTP ${res.status}): ${data?.detail?.error || data?.detail || data?.error || 'unknown error'}`
    );
  }
  const images = Array.isArray(data?.images) ? data.images : [];
  return images.slice(0, maxResults).map((item: any) => {
    if (typeof item === 'string') {
      return { title: query, image_url: item, source_url: undefined };
    }
    return {
      title: item?.description || query,
      image_url: item?.url || '',
      source_url: item?.url,
    };
  }).filter((i: ImageSearchResult) => Boolean(i.image_url));
}

async function serpApiImages(
  query: string,
  maxResults: number,
  timeoutMs: number,
  key: string
): Promise<ImageSearchResult[]> {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_images');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', key);

  const res = await fetchWithTimeout(
    url.toString(),
    { method: 'GET', headers: { Accept: 'application/json' } },
    timeoutMs
  );
  const data: any = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    throw new Error(
      `SerpAPI image search failed (HTTP ${res.status}): ${data?.error || 'unknown error'}`
    );
  }
  const results = Array.isArray(data?.images_results) ? data.images_results : [];
  return results.slice(0, maxResults).map((item: any) => ({
    title: item.title || '',
    image_url: item.original || item.thumbnail || '',
    thumbnail_url: item.thumbnail || undefined,
    source_url: item.link || undefined,
    width: Number(item.original_width) || undefined,
    height: Number(item.original_height) || undefined,
  })).filter((i: ImageSearchResult) => Boolean(i.image_url));
}

/**
 * Runs an image search with the selected provider. Exa has no image endpoint, so the
 * DuckDuckGo image index is used instead and the response reports that fallback.
 */
export async function imageSearch(
  query: string,
  options: { maxResults?: number; timeoutMs?: number } = {}
): Promise<{
  provider: WebSearchProviderId;
  image_provider: ImageSearchEngine;
  query: string;
  results: ImageSearchResult[];
  note?: string;
}> {
  const maxResults = Math.min(Math.max(options.maxResults ?? 20, 1), 20);
  const timeoutMs = options.timeoutMs ?? 180_000;
  const settings = await getWebSearchSettings();
  const provider = settings.provider;

  if (provider === 'tavily') {
    const results = await tavilyImages(query, maxResults, timeoutMs, requireKey(settings, provider));
    return { provider, image_provider: 'tavily', query, results };
  }
  if (provider === 'serpapi') {
    const results = await serpApiImages(query, maxResults, timeoutMs, requireKey(settings, provider));
    return { provider, image_provider: 'serpapi', query, results };
  }

  const { results, engine, note } = await keylessImageSearch(query, maxResults, timeoutMs);
  const prefix =
    provider === 'exa' ? 'Exa does not provide an image search endpoint, so keyless image search was used.' : '';
  return {
    provider,
    image_provider: engine,
    query,
    results,
    note: [prefix, note].filter(Boolean).join(' ') || undefined,
  };
}
