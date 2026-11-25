import {
  createConnectionLink,
  deleteConnectedAccount,
  executeComposioTool,
  findToolkit,
  getConnectedAccount,
  getOrCreateAuthConfig,
  listOAuthToolkits,
  listToolkitTools,
} from './client.js';
import { readConnectorStore, readConnectorStoreSync, updateConnectorStore } from './store.js';
import {
  ConnectorConnectionStatus,
  ConnectorLink,
  ConnectorSettingsView,
  ConnectorStoreData,
  ConnectorToolkit,
  ConnectorView,
} from './types.js';

export * from './types.js';
export { clearToolkitCache } from './client.js';

const TOOL_PREFIX = 'composio_';

interface ConnectorToolBinding {
  toolName: string;
  toolSlug: string;
  connectorSlug: string;
  connectedAccountId: string;
  definition: {
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, any> };
  };
}

const toolRegistry = new Map<string, ConnectorToolBinding>();
let cacheRefreshedAt = 0;

function maskApiKey(apiKey: string): string {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return '••••••••';
  return `••••••••${apiKey.slice(-4)}`;
}

export async function getConnectorSettings(): Promise<ConnectorSettingsView> {
  const store = await readConnectorStore();
  return {
    configured: Boolean(store.api_key),
    api_key_masked: maskApiKey(store.api_key),
    enabled: store.enabled,
    allow_sub_agents: store.allow_sub_agents,
  };
}

export async function updateConnectorSettings(
  patch: Partial<Pick<ConnectorStoreData, 'api_key' | 'enabled' | 'allow_sub_agents'>>
): Promise<ConnectorSettingsView> {
  const next: Partial<ConnectorStoreData> = {};
  if (typeof patch.api_key === 'string') next.api_key = patch.api_key.trim();
  if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
  if (typeof patch.allow_sub_agents === 'boolean') next.allow_sub_agents = patch.allow_sub_agents;
  await updateConnectorStore(next);
  await refreshConnectorToolCache();
  return getConnectorSettings();
}

export async function requireConnectorApiKey(): Promise<string> {
  const store = await readConnectorStore();
  if (!store.api_key) {
    throw new Error(
      'Composio API key is not configured. Ask the user to add it in Settings → Connectors.'
    );
  }
  return store.api_key;
}

export async function listConnectorViews(options: { search?: string; force?: boolean } = {}): Promise<
  ConnectorView[]
> {
  const store = await readConnectorStore();
  if (!store.api_key) {
    throw new Error('Composio API key is not configured.');
  }
  const toolkits = await listOAuthToolkits(store.api_key, { force: options.force });
  const needle = (options.search || '').trim().toLowerCase();

  const views: ConnectorView[] = [];
  for (const toolkit of toolkits) {
    if (
      needle &&
      !toolkit.name.toLowerCase().includes(needle) &&
      !toolkit.slug.toLowerCase().includes(needle)
    ) {
      continue;
    }
    const connection = store.connections[toolkit.slug];
    const connected = connection?.status === 'connected';
    let toolCount = 0;
    if (connected) {
      try {
        toolCount = (await listToolkitTools(store.api_key, toolkit.slug)).length;
      } catch {
        toolCount = 0;
      }
    }
    views.push({
      ...toolkit,
      connected,
      status: connection?.status || 'disconnected',
      connected_account_id: connection?.connected_account_id,
      connected_at: connection?.connected_at,
      tool_count: toolCount,
      error: connection?.error,
    });
  }
  return views;
}

function mapAccountStatus(status: string): ConnectorConnectionStatus {
  switch (String(status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'connected';
    case 'INITIALIZING':
    case 'INITIATED':
      return 'pending';
    case 'FAILED':
    case 'EXPIRED':
    case 'REVOKED':
    case 'INACTIVE':
      return 'error';
    default:
      return 'pending';
  }
}

export async function startConnectorConnection(connectorName: string): Promise<ConnectorLink> {
  const store = await readConnectorStore();
  const apiKey = await requireConnectorApiKey();
  const toolkit: ConnectorToolkit | undefined = await findToolkit(apiKey, connectorName);
  if (!toolkit) {
    throw new Error(
      `Unknown connector "${connectorName}". Use list_available_application_connectors to get the exact connector name.`
    );
  }

  const authConfigId = await getOrCreateAuthConfig(apiKey, toolkit.slug);
  const link = await createConnectionLink(apiKey, authConfigId, store.user_id);

  store.connections[toolkit.slug] = {
    slug: toolkit.slug,
    connected_account_id: link.connected_account_id,
    auth_config_id: authConfigId,
    status: 'pending',
    updated_at: Date.now(),
  };
  await updateConnectorStore({ connections: store.connections });

  return {
    slug: toolkit.slug,
    name: toolkit.name,
    description: toolkit.description,
    logo: toolkit.logo,
    redirect_url: link.redirect_url,
    connected_account_id: link.connected_account_id,
    expires_at: link.expires_at,
  };
}

export async function checkConnectorConnection(connectorSlug: string): Promise<{
  slug: string;
  status: ConnectorConnectionStatus;
  connected: boolean;
  tool_count: number;
  error?: string;
}> {
  const store = await readConnectorStore();
  const connection = store.connections[connectorSlug];
  if (!connection || !store.api_key) {
    return { slug: connectorSlug, status: 'disconnected', connected: false, tool_count: 0 };
  }

  let status = connection.status;
  let error = connection.error;
  try {
    const account = await getConnectedAccount(store.api_key, connection.connected_account_id);
    status = mapAccountStatus(account?.status);
    error = status === 'error' ? String(account?.status_reason || account?.status || '') : undefined;
  } catch (err: any) {
    error = err?.message || 'Failed to read connection status.';
  }

  let toolCount = 0;
  if (status === 'connected') {
    try {
      toolCount = (await listToolkitTools(store.api_key, connectorSlug)).length;
    } catch {
      toolCount = 0;
    }
  }

  if (status !== connection.status || error !== connection.error) {
    store.connections[connectorSlug] = {
      ...connection,
      status,
      error,
      connected_at: status === 'connected' ? connection.connected_at || Date.now() : connection.connected_at,
      updated_at: Date.now(),
    };
    await updateConnectorStore({ connections: store.connections });
  }
  if (status === 'connected') {
    await refreshConnectorToolCache();
  }

  return { slug: connectorSlug, status, connected: status === 'connected', tool_count: toolCount, error };
}

export async function disconnectConnector(connectorSlug: string): Promise<boolean> {
  const store = await readConnectorStore();
  const connection = store.connections[connectorSlug];
  if (connection?.connected_account_id && store.api_key) {
    try {
      await deleteConnectedAccount(store.api_key, connection.connected_account_id);
    } catch {
      // Removing locally is enough when Composio already dropped the account.
    }
  }
  const existed = Boolean(connection);
  delete store.connections[connectorSlug];
  await updateConnectorStore({ connections: store.connections });
  await refreshConnectorToolCache();
  return existed;
}

export function isConnectorToolName(toolName: string): boolean {
  return toolName.startsWith(TOOL_PREFIX);
}

function sanitizeToolName(slug: string): string {
  return `${TOOL_PREFIX}${slug.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`.slice(0, 64);
}

const SCHEMA_TYPE_ALIASES: Record<string, string> = {
  str: 'string',
  text: 'string',
  file: 'string',
  file_uploadable: 'string',
  file_path: 'string',
  date: 'string',
  datetime: 'string',
  time: 'string',
  url: 'string',
  int: 'integer',
  float: 'number',
  double: 'number',
  bool: 'boolean',
  list: 'array',
  dict: 'object',
  map: 'object',
};

function normalizeSchemaType(type: unknown): string | undefined {
  if (typeof type !== 'string') return undefined;
  const normalized = type.toLowerCase();
  if (normalized === 'any' || normalized === 'null') return undefined;
  return SCHEMA_TYPE_ALIASES[normalized] || normalized;
}

/**
 * Converts Composio's loosely-typed parameter schemas into the strict JSON Schema
 * subset accepted by every LLM provider. Unknown keywords (`example`, `default`,
 * `format`, boolean `required`, non-standard types like `file`) are dropped because
 * they make providers reject the whole tool list with "invalid schema".
 */
export function sanitizeConnectorSchema(
  raw: any,
  defs: Record<string, any> = {},
  depth = 0
): Record<string, any> {
  if (depth > 6 || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { type: 'string' };
  }

  let node: any = raw;
  if (typeof node.$ref === 'string') {
    const refName = node.$ref.split('/').pop() || '';
    const target = defs[refName];
    node =
      target && typeof target === 'object'
        ? {
            ...target,
            ...Object.fromEntries(Object.entries(node).filter(([key]) => key !== '$ref')),
          }
        : {};
  }

  const out: Record<string, any> = {};
  const type = normalizeSchemaType(node.type);
  if (type) out.type = type;
  if (typeof node.description === 'string' && node.description.trim()) {
    out.description = node.description.slice(0, 1500);
  }
  if (Array.isArray(node.enum)) {
    const values = node.enum.filter((value: any) => value !== null && value !== undefined);
    if (values.length > 0) out.enum = values;
  }

  if (node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)) {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const [key, child] of Object.entries(node.properties)) {
      properties[key] = sanitizeConnectorSchema(child, defs, depth + 1);
      if ((child as any)?.required === true) required.push(key);
    }
    if (Array.isArray(node.required)) {
      for (const key of node.required) {
        if (typeof key === 'string' && properties[key] && !required.includes(key)) {
          required.push(key);
        }
      }
    }
    out.type = 'object';
    out.properties = properties;
    if (required.length > 0) out.required = required;
    out.additionalProperties = node.additionalProperties === false ? false : true;
  } else if (out.type === 'object') {
    out.properties = {};
    out.additionalProperties = true;
  }

  if (out.type === 'array') {
    out.items = sanitizeConnectorSchema(node.items, defs, depth + 1);
  }

  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    if (!Array.isArray(node[key])) continue;
    const branches = node[key]
      .filter((branch: any) => {
        const branchType = branch?.type;
        return !(
          branchType === 'null' ||
          (Array.isArray(branchType) && branchType.every((value: any) => value === 'null'))
        );
      })
      .map((branch: any) => sanitizeConnectorSchema(branch, defs, depth + 1));
    if (branches.length === 1) {
      Object.assign(out, branches[0]);
    } else if (branches.length > 1) {
      out[key] = branches;
    }
  }

  if (!out.type && !out.anyOf && !out.oneOf && !out.allOf) {
    const firstEnum = Array.isArray(out.enum) ? out.enum[0] : undefined;
    out.type = typeof firstEnum === 'number' ? 'number' : 'string';
  }

  return out;
}

export function buildConnectorParameters(input: Record<string, any>): Record<string, any> {
  const source =
    input && typeof input === 'object' && !Array.isArray(input) ? input : ({} as Record<string, any>);
  const defs = {
    ...((source as any).$defs || {}),
    ...((source as any).definitions || {}),
  };

  if ((source as any).type === 'object' && (source as any).properties) {
    const sanitized = sanitizeConnectorSchema(source, defs);
    return {
      type: 'object',
      properties: sanitized.properties || {},
      ...(sanitized.required ? { required: sanitized.required } : {}),
      additionalProperties: true,
    };
  }

  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (const [key, raw] of Object.entries(source)) {
    if (!raw || typeof raw !== 'object') continue;
    properties[key] = sanitizeConnectorSchema(raw, defs);
    if ((raw as any).required === true) required.push(key);
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: true,
  };
}

/**
 * Rebuilds the in-memory registry of Composio tools for every connected connector.
 * Tool definitions stay synchronous for the agent loop; this refresh runs on connect,
 * disconnect, settings changes, and startup.
 */
export async function refreshConnectorToolCache(): Promise<void> {
  toolRegistry.clear();
  cacheRefreshedAt = Date.now();
  const store = await readConnectorStore();
  if (!store.enabled || !store.api_key) return;

  for (const connection of Object.values(store.connections)) {
    if (connection.status !== 'connected') continue;
    let tools;
    try {
      tools = await listToolkitTools(store.api_key, connection.slug);
    } catch {
      continue;
    }
    for (const tool of tools) {
      const toolName = sanitizeToolName(tool.slug);
      if (toolRegistry.has(toolName)) continue;
      let parameters: Record<string, any> = { type: 'object', properties: {} };
      try {
        parameters = buildConnectorParameters(tool.input_parameters);
      } catch {
        // A malformed upstream schema must never break the whole tool list.
      }
      toolRegistry.set(toolName, {
        toolName,
        toolSlug: tool.slug,
        connectorSlug: connection.slug,
        connectedAccountId: connection.connected_account_id,
        definition: {
          type: 'function',
          function: {
            name: toolName,
            description: `[${connection.slug}] ${(tool.description || tool.name || '').slice(0, 1000)}`,
            parameters,
          },
        },
      });
    }
  }
}

export async function getConnectorToolDefinitions(options: { subAgent?: boolean } = {}): Promise<
  Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, any> } }>
> {
  if (toolRegistry.size === 0 || Date.now() - cacheRefreshedAt > 5 * 60 * 1000) {
    await refreshConnectorToolCache();
  }
  const store = await readConnectorStore();
  if (!store.enabled) return [];
  if (options.subAgent && !store.allow_sub_agents) return [];
  return [...toolRegistry.values()].map((binding) => binding.definition);
}

export function getConnectorToolDefinitionsSync(options: { subAgent?: boolean } = {}): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, any> };
}> {
  const store = readConnectorStoreSync();
  if (!store.enabled) return [];
  if (options.subAgent && !store.allow_sub_agents) return [];
  return [...toolRegistry.values()].map((binding) => binding.definition);
}

export async function executeConnectorTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  let binding = toolRegistry.get(toolName);
  if (!binding) {
    await refreshConnectorToolCache();
    binding = toolRegistry.get(toolName);
  }
  if (!binding) {
    throw new Error(`Unknown connector tool "${toolName}".`);
  }
  const store = await readConnectorStore();
  const result = await executeComposioTool(store.api_key, binding.toolSlug, {
    userId: store.user_id,
    connectedAccountId: binding.connectedAccountId,
    args: args || {},
  });
  return {
    success: Boolean(result?.successful),
    error: result?.error || undefined,
    data: result?.data,
    connector: binding.connectorSlug,
    tool: binding.toolSlug,
  };
}
