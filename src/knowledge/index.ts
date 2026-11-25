import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../datadir/index.js';
import { fetchWebUrls, normalizeTargetUrl } from '../scraper/index.js';

export type KnowledgeSource = 'text' | 'upload' | 'folder' | 'docs' | 'curl';

export interface KnowledgeEntry {
  id: string;
  name: string;
  description: string;
  source_type: KnowledgeSource;
  /** Stored filename inside `.mythgram/knowledge`. */
  file: string;
  file_path: string;
  original_path?: string;
  source_url?: string;
  size: number;
  created_at: number;
  updated_at: number;
}

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.text',
  '.json',
  '.jsonl',
  '.csv',
  '.tsv',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.xml',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cs',
  '.php',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.graphql',
  '.env',
  '.log',
  '.rst',
  '.tex',
]);

const MAX_UPLOAD_FILES = 200;
const MAX_TEXT_BYTES = 5 * 1024 * 1024;

function safeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'knowledge';
}

async function readEntriesJson(jsonPath: string): Promise<KnowledgeEntry[]> {
  try {
    const raw = await fs.readFile(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeEntriesJson(jsonPath: string, entries: KnowledgeEntry[]): Promise<void> {
  await fs.writeFile(jsonPath, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
}

export async function ensureKnowledgeStore(): Promise<{
  knowledgeDir: string;
  knowledgeJsonPath: string;
}> {
  const paths = getDataDir();
  if (!fsSync.existsSync(paths.knowledgeDir)) {
    await fs.mkdir(paths.knowledgeDir, { recursive: true });
  }
  if (!fsSync.existsSync(paths.knowledgeJsonPath)) {
    await fs.writeFile(paths.knowledgeJsonPath, '[]\n', 'utf-8');
  }

  // Rebuild the index from stored Markdown files if knowledge-entry.json was deleted.
  const entries = await readEntriesJson(paths.knowledgeJsonPath);
  const known = new Set(entries.map((entry) => entry.file.toLowerCase()));
  let changed = false;
  try {
    const dirEntries = await fs.readdir(paths.knowledgeDir, { withFileTypes: true });
    for (const item of dirEntries) {
      if (!item.isFile() || !/\.md$/i.test(item.name)) continue;
      if (known.has(item.name.toLowerCase())) continue;
      const filePath = path.join(paths.knowledgeDir, item.name);
      const stat = await fs.stat(filePath);
      const name = item.name
        .replace(/^kb_\d+_[a-z0-9]+_/i, '')
        .replace(/\.md$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      entries.push({
        id: item.name.split('_').slice(0, 2).join('_') || `kb_${Date.now()}`,
        name: name || item.name,
        description: 'Recovered knowledge file found on disk.',
        source_type: 'text',
        file: item.name,
        file_path: filePath,
        size: stat.size,
        created_at: stat.birthtimeMs || Date.now(),
        updated_at: stat.mtimeMs || Date.now(),
      });
      changed = true;
    }
  } catch {
    // ignore scan errors
  }
  if (changed) {
    await writeEntriesJson(paths.knowledgeJsonPath, entries);
  }

  return { knowledgeDir: paths.knowledgeDir, knowledgeJsonPath: paths.knowledgeJsonPath };
}

export async function listKnowledgeEntries(): Promise<KnowledgeEntry[]> {
  const { knowledgeDir, knowledgeJsonPath } = await ensureKnowledgeStore();
  const entries = await readEntriesJson(knowledgeJsonPath);
  return entries.map((entry) => {
    const filePath = path.join(knowledgeDir, entry.file);
    let size = entry.size;
    try {
      size = fsSync.statSync(filePath).size;
    } catch {
      // file missing; keep recorded size
    }
    return { ...entry, file_path: filePath, size };
  });
}

function findEntry(entries: KnowledgeEntry[], idOrName: string): KnowledgeEntry | undefined {
  const needle = idOrName.trim();
  return (
    entries.find((e) => e.id === needle) ||
    entries.find((e) => e.file === needle) ||
    entries.find((e) => e.name.toLowerCase() === needle.toLowerCase())
  );
}

export async function getKnowledgeEntry(idOrName: string): Promise<{
  entry: KnowledgeEntry;
  content: string;
} | null> {
  const entries = await listKnowledgeEntries();
  const entry = findEntry(entries, idOrName);
  if (!entry) return null;
  let content = '';
  try {
    content = await fs.readFile(entry.file_path, 'utf-8');
  } catch {
    content = '';
  }
  return { entry, content };
}

async function persistEntry(params: {
  name: string;
  description: string;
  sourceType: KnowledgeSource;
  content: string;
  originalPath?: string;
  sourceUrl?: string;
}): Promise<KnowledgeEntry> {
  const { knowledgeDir, knowledgeJsonPath } = await ensureKnowledgeStore();
  const entries = await readEntriesJson(knowledgeJsonPath);
  const now = Date.now();
  const id = `kb_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const file = `${id}_${safeSlug(params.name)}.md`;
  const filePath = path.join(knowledgeDir, file);

  const header = [
    `# ${params.name}`,
    params.description ? `\n> ${params.description}` : '',
    params.sourceUrl ? `\nSource: ${params.sourceUrl}` : '',
    params.originalPath ? `\nOriginal path: ${params.originalPath}` : '',
    '',
    '---',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const body = `${header}\n${params.content}`;
  await fs.writeFile(filePath, body, 'utf-8');

  const entry: KnowledgeEntry = {
    id,
    name: params.name.trim(),
    description: params.description.trim(),
    source_type: params.sourceType,
    file,
    file_path: filePath,
    original_path: params.originalPath,
    source_url: params.sourceUrl,
    size: Buffer.byteLength(body, 'utf-8'),
    created_at: now,
    updated_at: now,
  };

  entries.unshift(entry);
  await writeEntriesJson(knowledgeJsonPath, entries);
  return entry;
}

export async function createKnowledgeFromText(params: {
  name: string;
  description?: string;
  content: string;
}): Promise<KnowledgeEntry> {
  if (!params.name.trim()) throw new Error('Knowledge file name is required.');
  return persistEntry({
    name: params.name,
    description: params.description || '',
    sourceType: 'text',
    content: params.content || '',
  });
}

function isProbablyText(filePath: string, buffer: Buffer): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (buffer.includes(0)) return false;
  const sample = buffer.subarray(0, 4096);
  let nonPrintable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13) continue;
    if (byte < 32) nonPrintable += 1;
  }
  return sample.length === 0 || nonPrintable / sample.length < 0.02;
}

async function collectFiles(targetPath: string): Promise<string[]> {
  const stat = await fs.stat(targetPath);
  if (stat.isFile()) return [targetPath];

  const collected: string[] = [];
  async function walk(dir: string) {
    if (collected.length >= MAX_UPLOAD_FILES) return;
    const dirEntries = await fs.readdir(dir, { withFileTypes: true });
    for (const item of dirEntries) {
      if (collected.length >= MAX_UPLOAD_FILES) return;
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else if (item.isFile()) {
        collected.push(full);
      }
    }
  }
  await walk(targetPath);
  return collected;
}

async function fileToKnowledge(filePath: string, rootPath: string): Promise<KnowledgeEntry> {
  const stat = await fs.stat(filePath);
  const relative = path.relative(rootPath, filePath) || path.basename(filePath);
  const name = relative.replace(/\\/g, '/');

  let content: string;
  if (stat.size > MAX_TEXT_BYTES) {
    content = `_File is larger than 5 MB and was not indexed. Path: ${filePath}_`;
  } else {
    const buffer = await fs.readFile(filePath);
    if (isProbablyText(filePath, buffer)) {
      content = buffer.toString('utf-8');
    } else {
      content = `_Binary file (${path.extname(filePath) || 'unknown type'}, ${stat.size} bytes) stored as a knowledge reference. Read it from its original path: ${filePath}_`;
    }
  }

  return persistEntry({
    name,
    description: `Imported from ${rootPath}`,
    sourceType: rootPath === filePath ? 'upload' : 'folder',
    content,
    originalPath: filePath,
  });
}

/**
 * Imports a single file or an entire folder. Folders produce one knowledge file per file.
 */
export async function createKnowledgeFromPath(params: {
  targetPath: string;
  description?: string;
}): Promise<KnowledgeEntry[]> {
  const absPath = path.resolve(params.targetPath);
  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    throw new Error(`Path does not exist: ${absPath}`);
  }

  if (stat.isFile()) {
    const entry = await fileToKnowledge(absPath, absPath);
    if (params.description?.trim()) {
      await updateKnowledgeEntry(entry.id, { description: params.description.trim() });
      entry.description = params.description.trim();
    }
    return [entry];
  }

  const files = await collectFiles(absPath);
  if (files.length === 0) {
    throw new Error(`No files found in folder: ${absPath}`);
  }
  const entries: KnowledgeEntry[] = [];
  for (const file of files) {
    entries.push(await fileToKnowledge(file, absPath));
  }
  return entries;
}

/**
 * Fetches a website with the configured scraper and stores the page as a knowledge file.
 */
export async function createKnowledgeFromDocs(params: {
  url: string;
  name?: string;
  description?: string;
}): Promise<KnowledgeEntry> {
  const url = normalizeTargetUrl(params.url);
  const scraped = await fetchWebUrls(url, { format: 'markdown', crawl: false });
  const page = scraped.pages[0];
  if (!page) throw new Error(`Could not fetch content from ${url}`);

  const fallbackName = new URL(url).hostname + new URL(url).pathname.replace(/\/$/, '');
  return persistEntry({
    name: params.name?.trim() || page.title || fallbackName,
    description: params.description?.trim() || page.description || `Website: ${url}`,
    sourceType: 'docs',
    content: page.content,
    sourceUrl: page.final_url || url,
  });
}

export interface ParsedCurl {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

function splitShellTokens(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === '\\' && quote === '"' && i + 1 < input.length) {
        current += input[i + 1];
        i += 1;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    if (char === '\\' && (input[i + 1] === '\n' || input[i + 1] === '\r')) {
      i += 1;
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

export function parseCurlCommand(command: string): ParsedCurl {
  const cleaned = command.replace(/\\\r?\n/g, ' ').trim();
  if (!cleaned.toLowerCase().startsWith('curl')) {
    throw new Error('The command must start with "curl".');
  }

  const tokens = splitShellTokens(cleaned).slice(1);
  let method = 'GET';
  let url = '';
  let body: string | undefined;
  const headers: Record<string, string> = {};

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const next = () => tokens[++i] ?? '';

    if (token === '-X' || token === '--request') {
      method = next().toUpperCase();
    } else if (token === '-H' || token === '--header') {
      const raw = next();
      const idx = raw.indexOf(':');
      if (idx > 0) headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
    } else if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-ascii'
    ) {
      body = next();
      if (method === 'GET') method = 'POST';
    } else if (token === '-u' || token === '--user') {
      headers.Authorization = `Basic ${Buffer.from(next()).toString('base64')}`;
    } else if (token === '-A' || token === '--user-agent') {
      headers['User-Agent'] = next();
    } else if (token === '-b' || token === '--cookie') {
      headers.Cookie = next();
    } else if (token === '--url') {
      url = next();
    } else if (token === '-e' || token === '--referer') {
      headers.Referer = next();
    } else if (token.startsWith('-')) {
      // Flags without values (-s, -L, --compressed, -k, -i, -v, ...) are ignored.
      continue;
    } else if (!url) {
      url = token;
    }
  }

  if (!url) throw new Error('No URL found in the curl command.');
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Unsupported URL in curl command: ${url}`);
  }
  return { method, url, headers, body };
}

/**
 * Executes a curl command through fetch (no shell) and stores the response as a knowledge file.
 */
export async function createKnowledgeFromCurl(params: {
  curlCommand: string;
  name?: string;
  description?: string;
  timeoutMs?: number;
}): Promise<KnowledgeEntry> {
  const parsed = parseCurlCommand(params.curlCommand);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 60_000);

  let status = 0;
  let responseBody = '';
  let contentType = '';
  try {
    const res = await fetch(parsed.url, {
      method: parsed.method,
      headers: parsed.headers,
      body: parsed.body,
      signal: controller.signal,
      redirect: 'follow',
    });
    status = res.status;
    contentType = res.headers.get('content-type') || '';
    responseBody = await res.text();
  } finally {
    clearTimeout(timer);
  }

  let content = responseBody;
  if (contentType.includes('json')) {
    try {
      content = JSON.stringify(JSON.parse(responseBody), null, 2);
    } catch {
      // keep raw body
    }
  }

  const name =
    params.name?.trim() ||
    `${parsed.method} ${new URL(parsed.url).hostname}${new URL(parsed.url).pathname}`;
  const contentWithMeta = [
    `Response status: ${status}`,
    `Content-Type: ${contentType || 'unknown'}`,
    `Request: ${parsed.method} ${parsed.url}`,
    '',
    content,
  ].join('\n');

  return persistEntry({
    name,
    description: params.description?.trim() || `Captured with curl (HTTP ${status})`,
    sourceType: 'curl',
    content: contentWithMeta,
    sourceUrl: parsed.url,
  });
}

export async function updateKnowledgeEntry(
  idOrName: string,
  patch: { name?: string; description?: string; content?: string }
): Promise<KnowledgeEntry | null> {
  const { knowledgeJsonPath } = await ensureKnowledgeStore();
  const entries = await readEntriesJson(knowledgeJsonPath);
  const entry = findEntry(entries, idOrName);
  if (!entry) return null;

  if (patch.name !== undefined && patch.name.trim()) entry.name = patch.name.trim();
  if (patch.description !== undefined) entry.description = patch.description.trim();
  if (patch.content !== undefined) {
    await fs.writeFile(path.join(path.dirname(entry.file_path), entry.file), patch.content, 'utf-8');
    entry.size = Buffer.byteLength(patch.content, 'utf-8');
  }
  entry.updated_at = Date.now();
  await writeEntriesJson(knowledgeJsonPath, entries);
  return entry;
}

export async function deleteKnowledgeEntry(idOrName: string): Promise<boolean> {
  const { knowledgeDir, knowledgeJsonPath } = await ensureKnowledgeStore();
  const entries = await readEntriesJson(knowledgeJsonPath);
  const entry = findEntry(entries, idOrName);
  if (!entry) return false;

  await writeEntriesJson(
    knowledgeJsonPath,
    entries.filter((e) => e.id !== entry.id)
  );
  try {
    await fs.rm(path.join(knowledgeDir, entry.file), { force: true });
  } catch {
    // ignore
  }
  return true;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_.\-/]+/g)
    .filter((t) => t.length > 1);
}

export interface KnowledgeSearchMatch {
  id: string;
  name: string;
  file: string;
  file_path: string;
  line: number;
  text: string;
  score: number;
}

export async function searchKnowledge(
  query: string,
  limit: number = 30
): Promise<KnowledgeSearchMatch[]> {
  const entries = await listKnowledgeEntries();
  const terms = tokenize(query);
  const phrase = query.trim().toLowerCase();
  if (terms.length === 0) return [];

  const matches: KnowledgeSearchMatch[] = [];
  for (const entry of entries) {
    let content = '';
    try {
      content = await fs.readFile(entry.file_path, 'utf-8');
    } catch {
      continue;
    }
    const metaHaystack = `${entry.name} ${entry.description}`.toLowerCase();
    const metaScore = terms.reduce((acc, term) => (metaHaystack.includes(term) ? acc + 3 : acc), 0);

    content.split(/\r?\n/).forEach((line, index) => {
      const haystack = line.toLowerCase();
      let score = metaScore;
      if (phrase && haystack.includes(phrase)) score += 6;
      for (const term of terms) {
        if (haystack.includes(term)) score += 2;
      }
      if (score > 0 && line.trim()) {
        matches.push({
          id: entry.id,
          name: entry.name,
          file: entry.file,
          file_path: entry.file_path,
          line: index + 1,
          text: line.trim().slice(0, 400),
          score,
        });
      }
    });
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
