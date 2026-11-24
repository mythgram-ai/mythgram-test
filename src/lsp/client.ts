import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LspConnection } from './jsonrpc.js';
import type { LspOperation, LspServerConfig, LspServerInfo } from './types.js';
import { normalizeExtension } from './servers.js';

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const INITIALIZE_TIMEOUT_MS = 30_000;

const SYMBOL_KIND_VALUES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26,
];

interface OpenDocument {
  version: number;
  text: string;
  languageId: string;
}

export class LspClient {
  readonly config: LspServerConfig;
  readonly rootPath: string;
  readonly rootUri: string;

  private readonly connection: LspConnection;
  private readonly openDocuments = new Map<string, OpenDocument>();
  private capabilities: Record<string, any> = {};
  private disposed = false;
  private lastUsedAt = Date.now();

  private constructor(config: LspServerConfig, rootPath: string) {
    this.config = config;
    this.rootPath = rootPath;
    this.rootUri = pathToFileURL(rootPath).href;
    this.connection = new LspConnection(config.command, config.args ?? [], {
      cwd: rootPath,
      env: config.env,
      onServerRequest: (method, params) => this.handleServerRequest(method, params),
    });
  }

  static async create(config: LspServerConfig, rootPath: string): Promise<LspClient> {
    const client = new LspClient(config, rootPath);
    try {
      await client.initialize();
      return client;
    } catch (err) {
      client.kill();
      throw err;
    }
  }

  get serverInfo(): LspServerInfo {
    return {
      id: this.config.id,
      name: this.config.name ?? this.config.id,
      command: this.config.command,
    };
  }

  get lastUsed(): number {
    return this.lastUsedAt;
  }

  get isRunning(): boolean {
    return !this.disposed && !this.connection.isClosed;
  }

  touch(): void {
    this.lastUsedAt = Date.now();
  }

  supportsOperation(operation: LspOperation): boolean {
    const capabilityByOperation: Record<LspOperation, string> = {
      goToDefinition: 'definitionProvider',
      findReferences: 'referencesProvider',
      hover: 'hoverProvider',
      documentSymbol: 'documentSymbolProvider',
      workspaceSymbol: 'workspaceSymbolProvider',
      goToImplementation: 'implementationProvider',
      prepareCallHierarchy: 'callHierarchyProvider',
      incomingCalls: 'callHierarchyProvider',
      outgoingCalls: 'callHierarchyProvider',
    };
    const capability = this.capabilities[capabilityByOperation[operation]];
    // Missing capability entries are common; only a strict `false` disables an operation.
    return capability !== false;
  }

  languageIdFor(filePath: string): string {
    const ext = normalizeExtension(path.extname(filePath));
    return (
      this.config.languageIds?.[ext] ??
      this.config.defaultLanguageId ??
      (ext ? ext.slice(1) : 'plaintext')
    );
  }

  /** Opens or refreshes a document so the server sees the current on-disk content. */
  async syncDocument(filePath: string): Promise<string> {
    const uri = pathToFileURL(filePath).href;
    const text = await fs.readFile(filePath, 'utf-8');
    const existing = this.openDocuments.get(uri);

    if (existing) {
      if (existing.text !== text) {
        existing.version += 1;
        existing.text = text;
        this.connection.notify('textDocument/didChange', {
          textDocument: { uri, version: existing.version },
          contentChanges: [{ text }],
        });
      }
      return uri;
    }

    const languageId = this.languageIdFor(filePath);
    this.openDocuments.set(uri, { version: 1, text, languageId });
    this.connection.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text },
    });
    return uri;
  }

  request<T = any>(
    method: string,
    params: any,
    signal?: AbortSignal,
    timeoutMs?: number
  ): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error(`LSP server "${this.config.id}" is no longer running.`));
    }
    const effectiveTimeout =
      timeoutMs ?? this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    return this.connection.request<T>(method, params, effectiveTimeout, signal);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.connection.close();
  }

  kill(): void {
    this.disposed = true;
    this.connection.kill();
  }

  private async initialize(): Promise<void> {
    const workspaceFolder = {
      uri: this.rootUri,
      name: path.basename(this.rootPath) || this.rootPath,
    };

    const result = await this.connection.request(
      'initialize',
      {
        processId: process.pid,
        clientInfo: { name: 'mythgram', version: '1.0.0' },
        locale: 'en',
        rootPath: this.rootPath,
        rootUri: this.rootUri,
        workspaceFolders: [workspaceFolder],
        capabilities: {
          workspace: {
            configuration: true,
            workspaceFolders: true,
            applyEdit: false,
            workspaceEdit: { documentChanges: false },
            symbol: { symbolKind: { valueSet: SYMBOL_KIND_VALUES } },
          },
          textDocument: {
            synchronization: {
              dynamicRegistration: false,
              willSave: false,
              willSaveWaitUntil: false,
              didSave: false,
            },
            definition: { linkSupport: true },
            references: {},
            hover: { contentFormat: ['markdown', 'plaintext'] },
            documentSymbol: {
              hierarchicalDocumentSymbolSupport: true,
              symbolKind: { valueSet: SYMBOL_KIND_VALUES },
            },
            implementation: { linkSupport: true },
            callHierarchy: { dynamicRegistration: false },
            publishDiagnostics: { relatedInformation: true, versionSupport: true },
          },
          window: { workDoneProgress: true, showMessage: {} },
          general: { positionEncodings: ['utf-16'] },
        },
        initializationOptions: this.config.initializationOptions ?? {},
      },
      INITIALIZE_TIMEOUT_MS
    );

    this.capabilities = result?.capabilities ?? {};
    this.connection.notify('initialized', {});
  }

  private handleServerRequest(method: string, params: any): any {
    switch (method) {
      case 'workspace/configuration': {
        const items = Array.isArray(params?.items) ? params.items : [];
        return items.map(() => null);
      }
      case 'workspace/workspaceFolders':
        return [{ uri: this.rootUri, name: path.basename(this.rootPath) || this.rootPath }];
      case 'workspace/applyEdit':
        return { applied: false, failureReason: 'Mythgram does not apply server workspace edits.' };
      case 'window/showMessageRequest':
        return null;
      case 'window/workDoneProgress/create':
      case 'client/registerCapability':
      case 'client/unregisterCapability':
      case 'workspace/didChangeWatchedFiles':
        return null;
      default:
        return null;
    }
  }
}
