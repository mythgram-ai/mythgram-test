import { ComposioToolInfo, ConnectorToolkit } from './types.js';

const DEFAULT_BASE_URL = 'https://backend.composio.dev/api/v3';
const REQUEST_TIMEOUT_MS = 30_000;
const TOOLKIT_CACHE_TTL_MS = 10 * 60 * 1000;

export function composioBaseUrl(): string {
  return (process.env.COMPOSIO_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

async function composioFetch(
  apiKey: string,
  pathname: string,
  init: { method?: string; body?: any; query?: Record<string, any> } = {}
): Promise<any> {
  if (!apiKey) {
    throw new Error('Composio API key is not configured. Add it in Settings → Connectors.');
  }
  const url = new URL(`${composioBaseUrl()}${pathname}`);
  for (const [key, value] of Object.entries(init.query || {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init.method || 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: any = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { message: text };
    }
    if (!res.ok) {
      const message =
        parsed?.error?.message ||
        parsed?.message ||
        parsed?.error ||
        `Composio request failed with status ${res.status}.`;
      throw new Error(String(message));
    }
    return parsed;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Composio request timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

interface ToolkitCacheEntry {
  key: string;
  fetchedAt: number;
  toolkits: ConnectorToolkit[];
}

let toolkitCache: ToolkitCacheEntry | null = null;

function mapToolkit(raw: any): ConnectorToolkit {
  return {
    slug: String(raw?.slug || ''),
    name: String(raw?.name || raw?.slug || ''),
    description: String(raw?.meta?.description || ''),
    logo: String(raw?.meta?.logo || ''),
    categories: Array.isArray(raw?.meta?.categories)
      ? raw.meta.categories.map((c: any) => String(c?.name || c?.id || '')).filter(Boolean)
      : [],
    app_url: raw?.meta?.app_url || undefined,
    auth_schemes: Array.isArray(raw?.auth_schemes) ? raw.auth_schemes.map(String) : [],
  };
}

export function isOAuthToolkit(toolkit: ConnectorToolkit): boolean {
  return toolkit.auth_schemes.some((scheme) => /oauth/i.test(scheme));
}

/**
 * Lists every Composio toolkit that supports OAuth, so users can connect with a
 * one-click browser flow. Paginates with the API cursor and caches the result.
 */
export async function listOAuthToolkits(
  apiKey: string,
  options: { force?: boolean } = {}
): Promise<ConnectorToolkit[]> {
  const cacheKey = `${composioBaseUrl()}::${apiKey}`;
  if (
    !options.force &&
    toolkitCache &&
    toolkitCache.key === cacheKey &&
    Date.now() - toolkitCache.fetchedAt < TOOLKIT_CACHE_TTL_MS
  ) {
    return toolkitCache.toolkits;
  }

  const toolkits: ConnectorToolkit[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const data = await composioFetch(apiKey, '/toolkits', {
      query: { limit: 100, cursor },
    });
    for (const item of data?.items || []) {
      const toolkit = mapToolkit(item);
      if (toolkit.slug && isOAuthToolkit(toolkit)) toolkits.push(toolkit);
    }
    cursor = data?.next_cursor || undefined;
    if (!cursor) break;
  }

  toolkitCache = { key: cacheKey, fetchedAt: Date.now(), toolkits };
  return toolkits;
}

export async function findToolkit(
  apiKey: string,
  nameOrSlug: string
): Promise<ConnectorToolkit | undefined> {
  const needle = nameOrSlug.trim().toLowerCase();
  const toolkits = await listOAuthToolkits(apiKey);
  return toolkits.find(
    (t) => t.slug.toLowerCase() === needle || t.name.toLowerCase() === needle
  );
}

export async function getOrCreateAuthConfig(apiKey: string, toolkitSlug: string): Promise<string> {
  const existing = await composioFetch(apiKey, '/auth_configs', {
    query: { toolkit_slug: toolkitSlug, is_composio_managed: true, limit: 50 },
  });
  const oauthConfig = (existing?.items || []).find(
    (item: any) => /oauth/i.test(String(item?.auth_scheme || '')) && !item?.is_disabled
  );
  if (oauthConfig?.id) return String(oauthConfig.id);

  const created = await composioFetch(apiKey, '/auth_configs', {
    method: 'POST',
    body: {
      toolkit: { slug: toolkitSlug },
      auth_config: { type: 'use_composio_managed_auth' },
    },
  });
  const id = created?.auth_config?.id;
  if (!id) throw new Error('Composio did not return an auth config id.');
  return String(id);
}

export async function createConnectionLink(
  apiKey: string,
  authConfigId: string,
  userId: string
): Promise<{ redirect_url: string; connected_account_id: string; expires_at?: string }> {
  const data = await composioFetch(apiKey, '/connected_accounts/link', {
    method: 'POST',
    body: { auth_config_id: authConfigId, user_id: userId },
  });
  if (!data?.redirect_url || !data?.connected_account_id) {
    throw new Error('Composio did not return a connection link.');
  }
  return {
    redirect_url: String(data.redirect_url),
    connected_account_id: String(data.connected_account_id),
    expires_at: data.expires_at ? String(data.expires_at) : undefined,
  };
}

export async function getConnectedAccount(apiKey: string, connectedAccountId: string): Promise<any> {
  return composioFetch(apiKey, `/connected_accounts/${encodeURIComponent(connectedAccountId)}`);
}

export async function deleteConnectedAccount(
  apiKey: string,
  connectedAccountId: string
): Promise<void> {
  await composioFetch(apiKey, `/connected_accounts/${encodeURIComponent(connectedAccountId)}`, {
    method: 'DELETE',
  });
}

export async function listConnectedAccounts(
  apiKey: string,
  userId: string
): Promise<any[]> {
  const data = await composioFetch(apiKey, '/connected_accounts', {
    query: { user_ids: userId, limit: 100 },
  });
  return Array.isArray(data?.items) ? data.items : [];
}

const toolsCache = new Map<string, { fetchedAt: number; tools: ComposioToolInfo[] }>();

export async function listToolkitTools(
  apiKey: string,
  toolkitSlug: string,
  options: { force?: boolean } = {}
): Promise<ComposioToolInfo[]> {
  const key = `${composioBaseUrl()}::${apiKey}::${toolkitSlug}`;
  const cached = toolsCache.get(key);
  if (!options.force && cached && Date.now() - cached.fetchedAt < TOOLKIT_CACHE_TTL_MS) {
    return cached.tools;
  }

  const tools: ComposioToolInfo[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const data = await composioFetch(apiKey, '/tools', {
      query: { toolkit_slug: toolkitSlug, limit: 100, cursor },
    });
    for (const item of data?.items || []) {
      if (!item?.slug) continue;
      tools.push({
        slug: String(item.slug),
        name: String(item.name || item.slug),
        description: String(item.description || ''),
        input_parameters: item.input_parameters || {},
      });
    }
    cursor = data?.next_cursor || undefined;
    if (!cursor) break;
  }

  toolsCache.set(key, { fetchedAt: Date.now(), tools });
  return tools;
}

export async function executeComposioTool(
  apiKey: string,
  toolSlug: string,
  params: { userId: string; connectedAccountId?: string; args: Record<string, any> }
): Promise<any> {
  return composioFetch(apiKey, `/tools/execute/${encodeURIComponent(toolSlug)}`, {
    method: 'POST',
    body: {
      user_id: params.userId,
      connected_account_id: params.connectedAccountId,
      arguments: params.args || {},
    },
  });
}

export function clearToolkitCache(): void {
  toolkitCache = null;
  toolsCache.clear();
}
