import fs from 'node:fs';
import path from 'node:path';
import { Client, StreamableHTTPClientTransport, SSEClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import {
  McpServerRecord,
  McpServerState,
  McpServerView,
  McpToolInfo,
} from './types.js';
import {
  deleteServer,
  ensureMcpStore,
  findServerByName,
  getServer,
  listServers,
  upsertServer,
} from './store.js';

const CONNECT_TIMEOUT_MS = 3 * 60 * 1000;

interface LiveConnection {
  client: Client;
  transport: any;
  oauth?: FileOAuthProvider;
}

interface PendingOAuth {
  transport: any;
  oauth: FileOAuthProvider;
}

const connections = new Map<string, LiveConnection>();
const pendingOAuth = new Map<string, PendingOAuth>();
const states = new Map<string, McpServerState>();

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'server';
}

function qualifiedToolName(server: McpServerRecord, toolName: string): string {
  const tool = toolName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  return `mcp__${slugify(server.name)}__${tool}`.slice(0, 64);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)} seconds.`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * OAuth provider persisted under .mythgram/mcp/oauth/<serverId>.json so tokens
 * survive server restarts.
 */
class FileOAuthProvider {
  public authorizationUrl?: string;
  private filePath: string;
  private data: Record<string, any> = {};

  constructor(
    serverId: string,
    private redirectUri: string
  ) {
    const { oauthDir } = ensureMcpStore();
    this.filePath = path.join(oauthDir, `${serverId}.json`);
    try {
      this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch {
      this.data = {};
    }
  }

  private persist() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
    } catch {
      // ignore persistence errors
    }
  }

  get redirectUrl(): string {
    return this.redirectUri;
  }

  get clientMetadata() {
    return {
      client_name: 'Mythgram',
      redirect_uris: [this.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  state(): string {
    if (!this.data.state) {
      this.data.state = Math.random().toString(36).slice(2) + Date.now().toString(36);
      this.persist();
    }
    return this.data.state;
  }

  clientInformation() {
    return this.data.clientInformation;
  }

  saveClientInformation(info: any) {
    this.data.clientInformation = info;
    this.persist();
  }

  tokens() {
    return this.data.tokens;
  }

  saveTokens(tokens: any) {
    this.data.tokens = tokens;
    this.persist();
  }

  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url.toString();
  }

  saveCodeVerifier(verifier: string) {
    this.data.codeVerifier = verifier;
    this.persist();
  }

  codeVerifier() {
    return this.data.codeVerifier || '';
  }

  reset() {
    this.data = {};
    this.persist();
  }
}

class McpManager {
  public getState(serverId: string): McpServerState {
    return (
      states.get(serverId) || {
        status: connections.has(serverId) ? 'connected' : 'disconnected',
        tools: connections.get(serverId) ? collectTools(serverId) : [],
      }
    );
  }

  public async toView(server: McpServerRecord): Promise<McpServerView> {
    const state = this.getState(server.id);
    return {
      ...server,
      status: state.status,
      error: state.error,
      connected_at: state.connected_at,
      authorization_url: state.authorizationUrl,
      tools: state.tools.map((t) => ({
        name: t.name,
        qualified_name: t.qualifiedName,
        description: t.description,
        enabled: !server.disabled_tools.includes(t.name),
      })),
    };
  }

  public async listViews(): Promise<McpServerView[]> {
    const servers = await listServers();
    return Promise.all(servers.map((s) => this.toView(s)));
  }

  public async addServer(input: {
    name: string;
    description: string;
    kind: 'local' | 'remote';
    config?: any;
    url?: string;
    auth_type?: 'no_auth' | 'oauth';
  }): Promise<McpServerRecord> {
    const existing = await findServerByName(input.name);
    const now = Date.now();
    const record: McpServerRecord = {
      id: existing?.id || `mcp_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name: input.name.trim(),
      description: input.description.trim(),
      kind: input.kind,
      config: input.config,
      url: input.url,
      auth_type: input.auth_type,
      enabled: true,
      allow_sub_agents: existing?.allow_sub_agents ?? true,
      disabled_tools: existing?.disabled_tools || [],
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    return upsertServer(record);
  }

  public async connect(
    server: McpServerRecord,
    opts: { publicBaseUrl?: string; timeoutMs?: number } = {}
  ): Promise<McpServerState> {
    const timeoutMs = opts.timeoutMs || CONNECT_TIMEOUT_MS;
    this.disconnect(server.id, false);
    states.set(server.id, { status: 'connecting', tools: [] });

    const isLocal = server.kind === 'local';
    let transport: any;
    let oauth: FileOAuthProvider | undefined;

    if (isLocal) {
      if (!server.config?.command) {
        throw new Error('Local MCP server is missing its "command" configuration.');
      }
      transport = new StdioClientTransport({
        command: server.config.command,
        args: server.config.args || [],
        env: { ...getDefaultEnvironment(), ...(server.config.env || {}) },
        cwd: server.config.cwd,
        stderr: 'pipe',
      });
    } else {
      if (!server.url || !/^https?:\/\//i.test(server.url)) {
        throw new Error('Remote MCP server URL must start with http:// or https://');
      }
      if (server.auth_type === 'oauth') {
        const base = (opts.publicBaseUrl || 'http://localhost:1000').replace(/\/+$/, '');
        oauth = new FileOAuthProvider(
          server.id,
          `${base}/api/mcp/oauth/callback?serverId=${encodeURIComponent(server.id)}`
        );
      }
      transport = this.buildHttpTransport(server, oauth);
    }

    const client = new Client({ name: 'mythgram', version: '1.0.0' });
    try {
      await withTimeout(client.connect(transport), timeoutMs, 'MCP server connection');
      const tools = await this.fetchTools(server, client);
      connections.set(server.id, { client, transport, oauth });
      const state: McpServerState = {
        status: 'connected',
        tools,
        connected_at: Date.now(),
      };
      states.set(server.id, state);
      pendingOAuth.delete(server.id);
      return state;
    } catch (err: any) {
      const authUrl = oauth?.authorizationUrl;
      if (authUrl) {
        pendingOAuth.set(server.id, { transport, oauth: oauth! });
        const state: McpServerState = {
          status: 'auth_required',
          error: 'OAuth authorization is required. Open the authorization URL to continue.',
          tools: [],
          authorizationUrl: authUrl,
        };
        states.set(server.id, state);
        return state;
      }
      try {
        await transport.close?.();
      } catch {
        // ignore
      }
      const state: McpServerState = {
        status: 'error',
        error: err?.message || String(err),
        tools: [],
      };
      states.set(server.id, state);
      throw new Error(state.error);
    }
  }

  private buildHttpTransport(server: McpServerRecord, oauth?: FileOAuthProvider) {
    const url = new URL(server.url!);
    const options: any = {
      requestInit: { headers: { Accept: 'application/json, text/event-stream' } },
    };
    if (oauth) options.authProvider = oauth;
    try {
      return new StreamableHTTPClientTransport(url, options);
    } catch {
      return new SSEClientTransport(url, options);
    }
  }

  public async fetchTools(server: McpServerRecord, client: Client): Promise<McpToolInfo[]> {
    const result = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS, 'MCP tools/list');
    return (result.tools || []).map((tool) => ({
      serverId: server.id,
      serverName: server.name,
      qualifiedName: qualifiedToolName(server, tool.name),
      name: tool.name,
      description: tool.description || `MCP tool "${tool.name}" from ${server.name}`,
      inputSchema:
        tool.inputSchema && typeof tool.inputSchema === 'object'
          ? (tool.inputSchema as Record<string, any>)
          : { type: 'object', properties: {} },
    }));
  }

  public async finishOAuth(serverId: string, code: string): Promise<McpServerState> {
    const server = await getServer(serverId);
    if (!server) throw new Error('MCP server not found.');
    let pending = pendingOAuth.get(serverId);
    if (!pending) {
      const state = this.getState(serverId);
      if (state.authorizationUrl) {
        return this.connect(server);
      }
      throw new Error('No pending OAuth authorization for this server.');
    }
    await pending.transport.finishAuth(code);
    const client = new Client({ name: 'mythgram', version: '1.0.0' });
    await withTimeout(client.connect(pending.transport), CONNECT_TIMEOUT_MS, 'MCP OAuth connection');
    const tools = await this.fetchTools(server, client);
    connections.set(serverId, { client, transport: pending.transport, oauth: pending.oauth });
    pendingOAuth.delete(serverId);
    const state: McpServerState = { status: 'connected', tools, connected_at: Date.now() };
    states.set(serverId, state);
    return state;
  }

  public disconnect(serverId: string, updateState = true) {
    const conn = connections.get(serverId);
    if (conn) {
      try {
        void conn.client.close();
      } catch {
        // ignore
      }
      try {
        void conn.transport.close?.();
      } catch {
        // ignore
      }
      connections.delete(serverId);
    }
    if (updateState) {
      states.set(serverId, { status: 'disconnected', tools: [] });
    }
  }

  /** Drops every live connection and cached state, e.g. when the active profile changes. */
  public resetAll(): void {
    for (const serverId of Array.from(connections.keys())) {
      this.disconnect(serverId, false);
    }
    connections.clear();
    states.clear();
    pendingOAuth.clear();
    serverCache.clear();
  }

  public async remove(serverId: string): Promise<boolean> {
    this.disconnect(serverId);
    states.delete(serverId);
    pendingOAuth.delete(serverId);
    return deleteServer(serverId);
  }

  public async reconnect(serverId: string, publicBaseUrl?: string) {
    const server = await getServer(serverId);
    if (!server) throw new Error('MCP server not found.');
    return this.connect(server, { publicBaseUrl });
  }

  public async autoConnectAll() {
    const servers = await listServers();
    for (const server of servers) {
      if (!server.enabled) continue;
      try {
        await this.connect(server);
      } catch {
        // status is recorded; do not crash startup
      }
    }
  }

  /** Connected tools, filtered by server enabled/disabled state and sub-agent access. */
  public getToolInfos(opts: { subAgent?: boolean } = {}): McpToolInfo[] {
    const out: McpToolInfo[] = [];
    for (const serverId of connections.keys()) {
      const state = states.get(serverId);
      if (!state || state.status !== 'connected') continue;
      out.push(...(state.tools.length > 0 ? state.tools : collectTools(serverId)));
    }
    return out.filter((tool) => {
      const server = serverCache.get(tool.serverId);
      if (server) {
        if (!server.enabled) return false;
        if (server.disabled_tools.includes(tool.name)) return false;
        if (opts.subAgent && !server.allow_sub_agents) return false;
      }
      return true;
    });
  }

  public async findToolByQualifiedName(
    qualifiedName: string
  ): Promise<{ tool: McpToolInfo; server: McpServerRecord } | null> {
    const servers = await listServers();
    for (const server of servers) {
      const state = states.get(server.id);
      if (!state || state.status !== 'connected') continue;
      for (const tool of state.tools) {
        if (tool.qualifiedName === qualifiedName) return { tool, server };
      }
    }
    return null;
  }

  public async callTool(
    qualifiedName: string,
    args: Record<string, any>,
    opts: { subAgent?: boolean } = {}
  ): Promise<any> {
    const found = await this.findToolByQualifiedName(qualifiedName);
    if (!found) {
      throw new Error(
        `MCP tool "${qualifiedName}" is not available. Call list_available_mcp_servers to inspect connected servers.`
      );
    }
    const { tool, server } = found;
    if (!server.enabled) throw new Error(`MCP server "${server.name}" is disabled.`);
    if (server.disabled_tools.includes(tool.name)) {
      throw new Error(`MCP tool "${tool.name}" is disabled for server "${server.name}".`);
    }
    if (opts.subAgent && !server.allow_sub_agents) {
      throw new Error(
        `MCP server "${server.name}" is not shared with sub-agents by the user.`
      );
    }
    const conn = connections.get(server.id);
    if (!conn) throw new Error(`MCP server "${server.name}" is not connected.`);
    const result = await withTimeout(
      conn.client.callTool({ name: tool.name, arguments: args }),
      CONNECT_TIMEOUT_MS,
      `MCP tool "${tool.name}" call`
    );
    return { server: server.name, tool: tool.name, result: sanitizeToolResult(result) };
  }
}

const serverCache = new Map<string, McpServerRecord>();

function collectTools(serverId: string): McpToolInfo[] {
  return states.get(serverId)?.tools || [];
}

export const mcpManager = new McpManager();

export async function refreshServerCache(): Promise<void> {
  const servers = await listServers();
  serverCache.clear();
  for (const s of servers) serverCache.set(s.id, s);
}

export async function initializeMcp(): Promise<void> {
  ensureMcpStore();
  await refreshServerCache();
  void mcpManager.autoConnectAll();
}

export async function listMcpServerViews(): Promise<McpServerView[]> {
  await refreshServerCache();
  return mcpManager.listViews();
}

export async function updateMcpServer(
  serverId: string,
  patch: Partial<Pick<McpServerRecord, 'enabled' | 'allow_sub_agents' | 'disabled_tools' | 'description'>>
): Promise<McpServerRecord> {
  const server = await getServer(serverId);
  if (!server) throw new Error('MCP server not found.');
  const updated: McpServerRecord = {
    ...server,
    ...patch,
    updated_at: Date.now(),
  };
  await upsertServer(updated);
  serverCache.set(updated.id, updated);
  return updated;
}

export async function addAndConnectLocal(input: {
  name: string;
  description: string;
  config: any;
  publicBaseUrl?: string;
}): Promise<{ server: McpServerRecord; state: McpServerState }> {
  const server = await mcpManager.addServer({
    name: input.name,
    description: input.description,
    kind: 'local',
    config: input.config,
  });
  serverCache.set(server.id, server);
  const state = await mcpManager.connect(server, { publicBaseUrl: input.publicBaseUrl });
  return { server, state };
}

export async function addAndConnectRemote(input: {
  name: string;
  description: string;
  url: string;
  authType: 'no_auth' | 'oauth';
  publicBaseUrl?: string;
}): Promise<{ server: McpServerRecord; state: McpServerState }> {
  const server = await mcpManager.addServer({
    name: input.name,
    description: input.description,
    kind: 'remote',
    url: input.url,
    auth_type: input.authType,
  });
  serverCache.set(server.id, server);
  const state = await mcpManager.connect(server, { publicBaseUrl: input.publicBaseUrl });
  return { server, state };
}

export async function refreshServerTools(serverId: string): Promise<McpServerState> {
  const server = await getServer(serverId);
  if (!server) throw new Error('MCP server not found.');
  const conn = connections.get(serverId);
  if (!conn) return mcpManager.connect(server);
  const tools = await mcpManager.fetchTools(server, conn.client);
  const state: McpServerState = {
    status: 'connected',
    tools,
    connected_at: states.get(serverId)?.connected_at || Date.now(),
  };
  states.set(serverId, state);
  return state;
}

export function getMcpOpenAIToolDefinitions(opts: { subAgent?: boolean } = {}): any[] {
  const seen = new Set<string>();
  return mcpManager.getToolInfos(opts).filter((tool) => {
    if (seen.has(tool.qualifiedName)) return false;
    seen.add(tool.qualifiedName);
    return true;
  }).map((tool) => {
    const raw = tool.inputSchema || {};
    const { $schema, ...schema } = raw as Record<string, any>;
    const parameters = schema.type
      ? { ...schema, additionalProperties: false }
      : { type: 'object', properties: {}, ...schema, additionalProperties: false };
    return {
      type: 'function',
      function: {
        name: tool.qualifiedName,
        description: `[MCP: ${tool.serverName}] ${tool.description}`,
        parameters,
      },
    };
  });
}

export function isMcpToolName(name: string): boolean {
  return name.startsWith('mcp__');
}

export async function executeMcpTool(
  qualifiedName: string,
  args: Record<string, any>,
  opts: { subAgent?: boolean } = {}
): Promise<any> {
  await refreshServerCache();
  return mcpManager.callTool(qualifiedName, args, opts);
}

export { CONNECT_TIMEOUT_MS };


function sanitizeToolResult(result: any): any {
  if (!result || typeof result !== 'object') return result;
  const content = Array.isArray(result.content)
    ? result.content.map((item: any) => {
        if (!item || typeof item !== 'object') return item;
        if (item.type === 'image' || item.type === 'audio') {
          return {
            type: item.type,
            mimeType: item.mimeType,
            data: '[binary data omitted from agent context]',
          };
        }
        if (item.type === 'resource' && item.resource?.blob) {
          return {
            ...item,
            resource: { ...item.resource, blob: '[binary data omitted from agent context]' },
          };
        }
        return item;
      })
    : result.content;
  return { ...result, content };
}
