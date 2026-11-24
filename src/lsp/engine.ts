import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LspClient } from './client.js';
import { availableExtensions, loadServerConfigs, normalizeExtension } from './servers.js';
import {
  LSP_OPERATIONS,
  type LspExecuteOptions,
  type LspExecuteParams,
  type LspOperation,
  type LspOperationResult,
  type ResolvedLspServerConfig,
} from './types.js';

const MAX_LOCATIONS = 100;
const MAX_SYMBOLS = 500;
const MAX_CALL_ITEMS = 50;
const MAX_CALL_HIERARCHY_ROOTS = 5;
const MAX_ROOT_SEARCH_DEPTH = 40;
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000;

const SYMBOL_KIND_NAMES: Record<number, string> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter',
};

function symbolKindName(kind: unknown): string {
  const numeric = Number(kind);
  return SYMBOL_KIND_NAMES[numeric] ?? (kind === undefined || kind === null ? 'Unknown' : String(kind));
}

function toDisplayPosition(position: any): { line: number; character: number } {
  return {
    line: Number(position?.line ?? 0) + 1,
    character: Number(position?.character ?? 0) + 1,
  };
}

function toDisplayRange(range: any): {
  start: { line: number; character: number };
  end: { line: number; character: number };
} {
  return {
    start: toDisplayPosition(range?.start),
    end: toDisplayPosition(range?.end),
  };
}

function uriToPath(uri: string): string {
  if (!uri) return '';
  if (uri.startsWith('file://')) {
    try {
      return fileURLToPath(uri);
    } catch {
      return uri;
    }
  }
  return uri;
}

function collectLocations(raw: any, out: Array<{ uri: string; range: any }>): void {
  if (!raw) return;
  if (Array.isArray(raw)) {
    for (const item of raw) collectLocations(item, out);
    return;
  }
  if (typeof raw !== 'object') return;

  if (typeof raw.targetUri === 'string') {
    out.push({
      uri: raw.targetUri,
      range: raw.targetSelectionRange ?? raw.targetRange,
    });
    return;
  }
  if (typeof raw.uri === 'string' && raw.range) {
    out.push({ uri: raw.uri, range: raw.range });
    return;
  }
  if (raw.location && typeof raw.location.uri === 'string') {
    out.push({ uri: raw.location.uri, range: raw.location.range ?? raw.location.targetRange });
  }
}

function hoverText(contents: any): string {
  if (!contents) return '';
  if (typeof contents === 'string') return contents.trim();
  if (Array.isArray(contents)) {
    return contents
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') return String(part.value ?? '');
        return '';
      })
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }
  if (typeof contents === 'object') return String(contents.value ?? '').trim();
  return String(contents).trim();
}

function normalizeCallItem(item: any): Record<string, any> {
  return {
    name: item?.name,
    kind: symbolKindName(item?.kind),
    detail: item?.detail,
    file: uriToPath(item?.uri),
    range: toDisplayRange(item?.range),
    selectionRange: toDisplayRange(item?.selectionRange),
  };
}

const WORD_CHAR = /[\p{L}\p{N}_$]/u;

/** Returns the identifier that surrounds a 1-based line/character position. */
export function identifierAt(
  text: string,
  line: number,
  character: number
): string | undefined {
  const lines = text.split(/\r?\n/);
  const lineText = lines[line - 1];
  if (!lineText) return undefined;

  const isWord = (index: number) =>
    index >= 0 && index < lineText.length && WORD_CHAR.test(lineText[index]);

  let index = Math.min(Math.max(character - 1, 0), Math.max(lineText.length - 1, 0));
  if (!isWord(index) && isWord(index - 1)) index -= 1;
  if (!isWord(index)) return undefined;

  let start = index;
  let end = index;
  while (isWord(start - 1)) start -= 1;
  while (isWord(end + 1)) end += 1;
  return lineText.slice(start, end + 1);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function parseIdleTimeout(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Manages language server processes and maps high-level code-intelligence operations onto
 * LSP requests. Clients are cached per (server, project root) and shut down after idling.
 */
export class LSPEngine {
  private readonly clients = new Map<string, Promise<LspClient>>();
  private readonly startedClients = new Set<LspClient>();
  private readonly configCache = new Map<
    string,
    { configs: ResolvedLspServerConfig[]; loadedAt: number }
  >();
  private readonly configTtlMs = 5_000;
  private readonly idleTimers = new Map<string, NodeJS.Timeout>();
  private readonly idleTimeoutMs: number;
  private exitHookInstalled = false;

  constructor(options: { idleTimeoutMs?: number } = {}) {
    this.idleTimeoutMs =
      options.idleTimeoutMs ??
      parseIdleTimeout(process.env.MYTHGRAM_LSP_IDLE_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS);
  }

  /** Clears cached server definitions (and optionally stops clients for that workspace). */
  async reloadConfig(workspaceRoot?: string): Promise<void> {
    if (workspaceRoot) {
      const root = path.resolve(workspaceRoot);
      this.configCache.delete(root);
      const keys = Array.from(this.clients.keys()).filter((key) => key.endsWith(`::${root}`));
      await Promise.all(keys.map((key) => this.closeClient(key)));
      return;
    }

    this.configCache.clear();
    await this.disposeAll();
  }

  getServerConfigs(workspaceRoot: string): ResolvedLspServerConfig[] {
    const root = path.resolve(workspaceRoot);
    const cached = this.configCache.get(root);
    if (cached && Date.now() - cached.loadedAt < this.configTtlMs) {
      return cached.configs;
    }
    const configs = loadServerConfigs(root);
    this.configCache.set(root, { configs, loadedAt: Date.now() });
    return configs;
  }

  async execute(
    operation: LspOperation,
    params: LspExecuteParams,
    options: LspExecuteOptions
  ): Promise<LspOperationResult> {
    if (!LSP_OPERATIONS.includes(operation)) {
      throw new Error(
        `Unsupported LSP operation "${operation}". Supported operations: ${LSP_OPERATIONS.join(', ')}.`
      );
    }
    if (!Number.isInteger(params.line) || params.line < 1) {
      throw new Error('`line` must be a 1-based integer.');
    }
    if (!Number.isInteger(params.character) || params.character < 1) {
      throw new Error('`character` must be a 1-based integer.');
    }

    const filePath = path.resolve(params.filePath);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }

    const workspaceRoot = path.resolve(options.workspaceRoot || path.dirname(filePath));
    const config = this.findServerConfig(filePath, workspaceRoot);
    const rootPath = await this.findProjectRoot(filePath, workspaceRoot, config);
    const { client, key } = await this.acquireClient(config, rootPath);

    try {
      if (!client.supportsOperation(operation)) {
        throw new Error(
          `LSP server "${client.serverInfo.name}" does not support ${operation}.`
        );
      }

      const uri = await client.syncDocument(filePath);
      const textDocument = { uri };
      const position = { line: params.line - 1, character: params.character - 1 };
      const signal = options.signal;
      const request = (method: string, requestParams: any) =>
        client.request(method, requestParams, signal, options.timeoutMs);

      const base = {
        operation,
        filePath,
        position: { line: params.line, character: params.character },
        server: client.serverInfo,
      };

      switch (operation) {
        case 'goToDefinition':
        case 'goToImplementation': {
          const method =
            operation === 'goToDefinition'
              ? 'textDocument/definition'
              : 'textDocument/implementation';
          const raw = await request(method, { textDocument, position });
          const locations = await this.formatLocations(raw);
          return {
            ...base,
            locations,
            count: locations.length,
            ...(locations.length === 0
              ? { message: `No ${operation === 'goToDefinition' ? 'definition' : 'implementation'} found at this position.` }
              : {}),
          };
        }

        case 'findReferences': {
          const raw = await request('textDocument/references', {
            textDocument,
            position,
            context: { includeDeclaration: true },
          });
          const locations = await this.formatLocations(raw);
          return {
            ...base,
            locations,
            count: locations.length,
            ...(locations.length === 0
              ? { message: 'No references found at this position.' }
              : {}),
          };
        }

        case 'hover': {
          const raw = await request('textDocument/hover', { textDocument, position });
          const contents = hoverText(raw?.contents);
          return {
            ...base,
            contents,
            ...(raw?.range ? { range: toDisplayRange(raw.range) } : {}),
            ...(contents ? {} : { message: 'No hover information available at this position.' }),
          };
        }

        case 'documentSymbol': {
          const raw = await request('textDocument/documentSymbol', { textDocument });
          const symbols = this.normalizeDocumentSymbols(raw);
          return {
            ...base,
            symbols,
            count: symbols.length,
            ...(symbols.length === 0 ? { message: 'No document symbols found.' } : {}),
          };
        }

        case 'workspaceSymbol': {
          const query = await this.resolveSymbolQuery(params, filePath);
          const raw = await request('workspace/symbol', { query });
          const symbols = this.normalizeWorkspaceSymbols(raw);
          return {
            ...base,
            query,
            symbols,
            count: symbols.length,
            ...(symbols.length === 0
              ? { message: `No workspace symbols matched "${query}".` }
              : {}),
          };
        }

        case 'prepareCallHierarchy': {
          const raw = await request('textDocument/prepareCallHierarchy', {
            textDocument,
            position,
          });
          const items = (Array.isArray(raw) ? raw : [])
            .slice(0, MAX_CALL_ITEMS)
            .map(normalizeCallItem);
          return {
            ...base,
            items,
            count: items.length,
            ...(items.length === 0
              ? { message: 'No call hierarchy item found at this position.' }
              : {}),
          };
        }

        case 'incomingCalls':
        case 'outgoingCalls': {
          const prepared = await request('textDocument/prepareCallHierarchy', {
            textDocument,
            position,
          });
          const roots = (Array.isArray(prepared) ? prepared : []).slice(
            0,
            MAX_CALL_HIERARCHY_ROOTS
          );
          if (roots.length === 0) {
            return {
              ...base,
              calls: [],
              count: 0,
              message: 'No call hierarchy item found at this position.',
            };
          }

          const calls: any[] = [];
          const method =
            operation === 'incomingCalls'
              ? 'callHierarchy/incomingCalls'
              : 'callHierarchy/outgoingCalls';
          const edgeKey = operation === 'incomingCalls' ? 'from' : 'to';

          for (const item of roots) {
            if (calls.length >= MAX_CALL_ITEMS) break;
            const raw = await request(method, { item });
            for (const call of Array.isArray(raw) ? raw : []) {
              if (calls.length >= MAX_CALL_ITEMS) break;
              calls.push({
                [edgeKey]: normalizeCallItem(call?.[edgeKey]),
                fromRanges: (Array.isArray(call?.fromRanges) ? call.fromRanges : []).map(
                  toDisplayRange
                ),
              });
            }
          }

          return {
            ...base,
            calls,
            count: calls.length,
            ...(calls.length === 0
              ? { message: `No ${operation === 'incomingCalls' ? 'incoming' : 'outgoing'} calls found.` }
              : {}),
          };
        }
      }
    } catch (err: any) {
      const message = err?.message ?? String(err);
      if (message.startsWith('LSP ') || message.startsWith('No LSP server')) throw err;
      throw new Error(
        `LSP ${operation} failed for ${filePath} using "${client.serverInfo.name}": ${message}`
      );
    } finally {
      this.scheduleIdleShutdown(key, client);
    }
  }

  async disposeAll(): Promise<void> {
    const keys = Array.from(this.clients.keys());
    await Promise.all(keys.map((key) => this.closeClient(key)));
    for (const timer of this.idleTimers.values()) clearTimeout(timer);
    this.idleTimers.clear();
  }

  disposeAllSync(): void {
    for (const timer of this.idleTimers.values()) clearTimeout(timer);
    this.idleTimers.clear();
    for (const client of this.startedClients) client.kill();
    this.startedClients.clear();
    this.clients.clear();
  }

  private findServerConfig(
    filePath: string,
    workspaceRoot: string
  ): ResolvedLspServerConfig {
    const configs = this.getServerConfigs(workspaceRoot);
    const extension = normalizeExtension(path.extname(filePath));
    const config = configs.find((candidate) => candidate.extensions.includes(extension));

    if (!config) {
      const extensions = availableExtensions(configs);
      const available = extensions.length
        ? `Available extensions: ${extensions.join(', ')}.`
        : 'No language servers were detected on PATH or in node_modules/.bin.';
      const configPath = path.join(workspaceRoot, '.mythgram', 'lsp.json');
      throw new Error(
        `No LSP server is configured or installed for "${extension || 'unknown'}" files. ` +
          `${available} Install a language server or add one in ${configPath} ` +
          '(or set MYTHGRAM_LSP_SERVERS).'
      );
    }

    return config;
  }

  private async findProjectRoot(
    filePath: string,
    workspaceRoot: string,
    config: ResolvedLspServerConfig
  ): Promise<string> {
    const markers = config.rootPatterns ?? [];
    const workspace = path.resolve(workspaceRoot);
    const insideWorkspace =
      filePath === workspace || filePath.startsWith(workspace + path.sep);

    let dir = path.dirname(filePath);
    for (let depth = 0; depth < MAX_ROOT_SEARCH_DEPTH; depth += 1) {
      for (const marker of markers) {
        if (await pathExists(path.join(dir, marker))) return dir;
      }
      if (insideWorkspace && dir === workspace) break;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    return insideWorkspace ? workspace : path.dirname(filePath);
  }

  private async acquireClient(
    config: ResolvedLspServerConfig,
    rootPath: string
  ): Promise<{ client: LspClient; key: string }> {
    this.installExitHook();

    const key = `${config.id}::${config.command}::${rootPath}`;
    const existing = this.clients.get(key);
    if (existing) {
      const client = await existing.catch(() => null);
      if (client?.isRunning) {
        this.scheduleIdleShutdown(key, client);
        return { client, key };
      }
      this.clients.delete(key);
      if (client) this.startedClients.delete(client);
    }

    const promise = LspClient.create(config, rootPath)
      .then((client) => {
        this.startedClients.add(client);
        return client;
      })
      .catch((err) => {
        this.clients.delete(key);
        throw err;
      });
    this.clients.set(key, promise);

    const client = await promise;
    this.scheduleIdleShutdown(key, client);
    return { client, key };
  }

  private scheduleIdleShutdown(key: string, client: LspClient): void {
    client.touch();
    const existing = this.idleTimers.get(key);
    if (existing) clearTimeout(existing);

    if (this.idleTimeoutMs <= 0) return;

    const timer = setTimeout(() => {
      this.idleTimers.delete(key);
      void this.closeClient(key);
    }, this.idleTimeoutMs);
    timer.unref?.();
    this.idleTimers.set(key, timer);
  }

  private async closeClient(key: string): Promise<void> {
    const timer = this.idleTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(key);
    }

    const promise = this.clients.get(key);
    if (!promise) return;
    this.clients.delete(key);

    try {
      const client = await promise;
      this.startedClients.delete(client);
      await client.dispose();
    } catch {
      // A failed client never started; nothing to shut down.
    }
  }

  private installExitHook(): void {
    if (this.exitHookInstalled) return;
    this.exitHookInstalled = true;
    process.once('exit', () => this.disposeAllSync());
  }

  private async resolveSymbolQuery(
    params: LspExecuteParams,
    filePath: string
  ): Promise<string> {
    const explicit = params.query?.trim();
    if (explicit) return explicit;

    const text = await fs.readFile(filePath, 'utf-8');
    const identifier = identifierAt(text, params.line, params.character);
    if (identifier) return identifier;

    throw new Error(
      'No `query` was provided and no identifier was found under the cursor. ' +
        'Pass the `query` parameter for workspaceSymbol.'
    );
  }

  private async formatLocations(raw: any): Promise<any[]> {
    const collected: Array<{ uri: string; range: any }> = [];
    collectLocations(raw, collected);

    const seen = new Set<string>();
    const unique = collected.filter((location) => {
      const key = `${location.uri}:${location.range?.start?.line}:${location.range?.start?.character}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const limited = unique.slice(0, MAX_LOCATIONS);
    const lineCache = new Map<string, string[]>();

    return Promise.all(
      limited.map(async (location) => {
        const file = uriToPath(location.uri);
        const range = toDisplayRange(location.range);
        const lineText = await this.readLine(file, range.start.line - 1, lineCache);
        return { file, range, lineText };
      })
    );
  }

  private async readLine(
    filePath: string,
    zeroBasedLine: number,
    cache: Map<string, string[]>
  ): Promise<string | undefined> {
    let lines = cache.get(filePath);
    if (!lines) {
      try {
        lines = (await fs.readFile(filePath, 'utf-8')).split(/\r?\n/);
      } catch {
        lines = [];
      }
      cache.set(filePath, lines);
    }
    return lines[zeroBasedLine]?.trim();
  }

  private normalizeDocumentSymbols(raw: any): any[] {
    const symbols = Array.isArray(raw) ? raw : raw ? [raw] : [];
    let count = 0;

    const walk = (symbol: any, depth: number): any | null => {
      if (!symbol || count >= MAX_SYMBOLS) return null;
      count += 1;

      if (symbol.location?.uri) {
        return {
          name: symbol.name,
          kind: symbolKindName(symbol.kind),
          containerName: symbol.containerName,
          file: uriToPath(symbol.location.uri),
          range: toDisplayRange(symbol.location.range),
        };
      }

      const node: Record<string, any> = {
        name: symbol.name,
        kind: symbolKindName(symbol.kind),
        detail: symbol.detail,
        range: toDisplayRange(symbol.range),
        selectionRange: toDisplayRange(symbol.selectionRange),
      };

      if (Array.isArray(symbol.children) && symbol.children.length > 0 && depth < 20) {
        node.children = symbol.children
          .map((child: any) => walk(child, depth + 1))
          .filter(Boolean);
      }
      return node;
    };

    return symbols.map((symbol) => walk(symbol, 0)).filter(Boolean);
  }

  private normalizeWorkspaceSymbols(raw: any): any[] {
    const symbols = Array.isArray(raw) ? raw : raw ? [raw] : [];

    return symbols.slice(0, MAX_SYMBOLS).map((symbol) => {
      const location = symbol?.location ?? {};
      const file = uriToPath(location.uri ?? location.targetUri ?? '');
      const rawRange = location.range ?? location.targetSelectionRange ?? location.targetRange;
      return {
        name: symbol?.name,
        kind: symbolKindName(symbol?.kind),
        containerName: symbol?.containerName,
        file,
        ...(rawRange ? { range: toDisplayRange(rawRange) } : {}),
      };
    });
  }
}

export const lspEngine = new LSPEngine();
