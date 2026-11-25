import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { initDataDir, getDataDir } from './datadir/index.js';
import { db, SlideItem } from './db/index.js';
import {
  getAllResolvedProviders,
  fetchModelsForProvider,
  BUILTIN_PROVIDERS_MAP,
  getProviderRuntimeCredentials,
} from './providers/index.js';
import {
  ALL_TOOLS,
  SUB_AGENT_ALLOWED_TOOLS,
  getOpenAIToolsList,
} from './tools/index.js';
import {
  submitUserPromptToSession,
  abortSessionRun,
  isSessionRunning,
  getDefaultWorkspace,
  setDefaultWorkspace,
  generate30DigitSessionId,
} from './session/index.js';
import { agentEvents } from './agents/agent.js';
import { isSubAgentRunning } from './agents/sub-agent.js';
import { listWorkspaceTree, InteractiveTerminalSession } from './worker/index.js';
import {
  listArtifacts,
  getArtifactById,
  updateArtifact,
  deleteArtifact,
  ensureArtifactsStore,
} from './artifacts/index.js';
import {
  listAllSubAgents,
  createOrUpdateCustomSubAgent,
  deleteCustomSubAgent,
  ensureSubAgentsStore,
  RESTRICTED_SUB_AGENT_TOOLS,
} from './sub-agents/index.js';
import {
  listSkills,
  getSkillDetail,
  createOrUpdateManualSkill,
  deleteSkill,
  ensureSkillsStore,
} from './skills/index.js';
import {
  listMemoryEntries,
  getMemoryEntry,
  createMemoryEntry,
  updateMemoryEntry,
  deleteMemoryEntry,
  restoreDefaultMemoryFiles,
  ensureMemoryStore,
} from './memory/index.js';
import {
  listKnowledgeEntries,
  getKnowledgeEntry,
  createKnowledgeFromText,
  createKnowledgeFromPath,
  createKnowledgeFromDocs,
  createKnowledgeFromCurl,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
  ensureKnowledgeStore,
} from './knowledge/index.js';
import {
  getMaskedWebSearchSettings,
  updateWebSearchSettings,
  webSearch,
  imageSearch,
} from './web-search/index.js';
import {
  resolveUserInteraction,
  getPendingInteractionsForSession,
} from './tools/interactive-store.js';
import {
  initializeMcp,
  listMcpServerViews,
  addAndConnectLocal,
  addAndConnectRemote,
  updateMcpServer,
  refreshServerCache,
  mcpManager,
  normalizeLocalConfig,
  ensureMcpStore,
} from './mcp/index.js';
import {
  checkConnectorConnection,
  disconnectConnector,
  getConnectorSettings,
  listConnectorViews,
  refreshConnectorToolCache,
  startConnectorConnection,
  updateConnectorSettings,
} from './connector/index.js';

// Initialize .mythgram datadir and stores immediately on startup
initDataDir();
void ensureArtifactsStore();
void ensureSubAgentsStore();
void ensureSkillsStore();
void ensureMemoryStore();
void ensureKnowledgeStore();
void ensureMcpStore();
void initializeMcp();
void refreshConnectorToolCache();

const app = new Hono();
app.use('*', cors());

// ==================== HEALTH & INFO ====================
app.get('/api/health', (c) => {
  const paths = getDataDir();
  return c.json({
    ok: true,
    agent: 'mythgram',
    version: '1.0.0',
    dataDir: paths.dataDir,
    defaultWorkspace: getDefaultWorkspace(),
    toolsCount: ALL_TOOLS.length,
  });
});

app.get('/api/tools', (c) => {
  return c.json({
    tools: getOpenAIToolsList(true),
  });
});

// ==================== SETTINGS & PROVIDERS ====================
app.get('/api/settings', (c) => {
  const allSettings = db.getAllSettings();
  const providers = getAllResolvedProviders();
  return c.json({
    activeProvider: allSettings.active_provider || 'pollinations',
    activeModel: allSettings.active_model || 'openai',
    reasoningEffort: allSettings.reasoning_effort || 'default',
    defaultWorkspace: getDefaultWorkspace(),
    providers,
  });
});

app.post('/api/settings', async (c) => {
  const body = await c.req.json();
  if (body.activeProvider !== undefined) {
    db.setSetting('active_provider', String(body.activeProvider));
  }
  if (body.activeModel !== undefined) {
    db.setSetting('active_model', String(body.activeModel));
  }
  if (body.reasoningEffort !== undefined) {
    db.setSetting('reasoning_effort', String(body.reasoningEffort));
  }
  if (body.defaultWorkspace !== undefined) {
    setDefaultWorkspace(String(body.defaultWorkspace));
  }
  return c.json({ ok: true });
});

app.get('/api/providers', (c) => {
  return c.json({
    providers: getAllResolvedProviders(),
  });
});

app.post('/api/providers/save', async (c) => {
  const body = await c.req.json();
  const providerId = String(body.id || `custom_${Date.now()}`);
  const isBuiltin = BUILTIN_PROVIDERS_MAP.has(providerId);
  const existing = db.getProviderConfig(providerId);
  const builtin = BUILTIN_PROVIDERS_MAP.get(providerId);

  const apiKey =
    body.apiKey !== undefined && !String(body.apiKey).startsWith('••••')
      ? String(body.apiKey)
      : existing?.api_key ?? '';

  db.saveProviderConfig({
    provider_id: providerId,
    name: body.name || existing?.name || builtin?.name || providerId,
    base_url: body.baseUrl || existing?.base_url || builtin?.baseUrl || '',
    api_key: apiKey,
    models_url: body.modelsUrl ?? existing?.models_url ?? builtin?.modelsUrl,
    selected_model: body.selectedModel ?? existing?.selected_model ?? '',
    is_custom: isBuiltin ? 0 : 1,
    manual_context_limit:
      body.manualContextLimit !== undefined
        ? body.manualContextLimit
        : existing?.manual_context_limit,
    manual_vision_support:
      body.manualVisionSupport !== undefined
        ? body.manualVisionSupport === null
          ? null
          : body.manualVisionSupport
          ? 1
          : 0
        : existing?.manual_vision_support,
  });

  if (body.setAsActive) {
    db.setSetting('active_provider', providerId);
    if (body.selectedModel) {
      db.setSetting('active_model', body.selectedModel);
    }
  }

  return c.json({
    ok: true,
    providers: getAllResolvedProviders(),
  });
});

app.delete('/api/providers/:id', (c) => {
  const id = c.req.param('id');
  if (BUILTIN_PROVIDERS_MAP.has(id)) {
    return c.json({ error: 'Cannot delete a built-in provider' }, 400);
  }
  db.deleteProviderConfig(id);
  return c.json({
    ok: true,
    providers: getAllResolvedProviders(),
  });
});

app.post('/api/providers/:id/fetch-models', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  try {
    const models = await fetchModelsForProvider(
      id,
      body.baseUrl,
      body.apiKey,
      body.modelsUrl
    );
    return c.json({
      ok: true,
      models,
      providers: getAllResolvedProviders(),
    });
  } catch (err: any) {
    return c.json(
      {
        ok: false,
        error: err?.message || 'Failed to fetch models from provider',
      },
      400
    );
  }
});

// ==================== WORKSPACE & FILES ====================
app.get('/api/workspace', async (c) => {
  const currentWorkspace = c.req.query('path') || getDefaultWorkspace();
  const resolved = path.resolve(currentWorkspace);
  const parentDir = path.dirname(resolved);
  const folders = await listWorkspaceTree(resolved, {
    onlyDirectories: true,
    maxDepth: 2,
  });

  return c.json({
    defaultWorkspace: getDefaultWorkspace(),
    currentPath: resolved,
    parentPath: parentDir !== resolved ? parentDir : null,
    homeDir: os.homedir(),
    folders,
  });
});

app.post('/api/workspace/mkdir', async (c) => {
  const body = await c.req.json();
  const parentDir = path.resolve(body.parentPath || getDefaultWorkspace());
  const folderName = String(body.folderName || '').trim();
  if (!folderName) {
    return c.json({ error: 'Folder name is required' }, 400);
  }
  const newFolderPath = path.join(parentDir, folderName);
  await fs.mkdir(newFolderPath, { recursive: true });
  return c.json({
    ok: true,
    createdPath: newFolderPath,
  });
});

app.get('/api/files/tree', async (c) => {
  const workspacePath = c.req.query('path') || getDefaultWorkspace();
  const depth = Number(c.req.query('depth') || 4);
  const tree = await listWorkspaceTree(workspacePath, {
    onlyDirectories: false,
    maxDepth: depth,
  });
  return c.json({
    root: path.resolve(workspacePath),
    tree,
  });
});

app.get('/api/files/read', async (c) => {
  const filePath = c.req.query('path');
  if (!filePath) return c.json({ error: 'Missing path parameter' }, 400);
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > 5 * 1024 * 1024) {
      return c.json({
        path: filePath,
        size: stat.size,
        truncated: true,
        content: '[File exceeds 5MB preview limit]',
      });
    }
    const content = await fs.readFile(filePath, 'utf-8');
    return c.json({
      path: filePath,
      size: stat.size,
      content,
    });
  } catch (err: any) {
    return c.json({ error: err?.message || 'Unable to read file' }, 404);
  }
});

app.get('/api/files/download', async (c) => {
  const filePath = c.req.query('path');
  if (!filePath) return c.json({ error: 'Missing path parameter' }, 400);
  try {
    const buf = await fs.readFile(filePath);
    const filename = path.basename(filePath);
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err: any) {
    return c.json({ error: err?.message || 'File not found' }, 404);
  }
});

// ==================== ARTIFACTS (.mythgram/artifacts) ====================
app.get('/api/artifacts', async (c) => {
  const artifacts = await listArtifacts();
  return c.json({ ok: true, artifacts });
});

app.get('/api/artifacts/:id', async (c) => {
  const id = c.req.param('id');
  const found = await getArtifactById(id);
  if (!found) return c.json({ error: 'Artifact not found' }, 404);
  return c.json({ ok: true, ...found });
});

app.put('/api/artifacts/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const updated = await updateArtifact(id, {
    title: body.title ?? body.name,
    description: body.description,
    type: body.type,
    content: body.content,
  });
  if (!updated) return c.json({ error: 'Artifact not found' }, 404);
  return c.json({ ok: true, artifact: updated });
});

app.delete('/api/artifacts/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await deleteArtifact(id);
  return c.json({ ok: deleted });
});

// ==================== SUB-AGENTS (.mythgram/sub-agents) ====================
app.get('/api/sub-agents', async (c) => {
  const subAgents = await listAllSubAgents();
  return c.json({
    ok: true,
    subAgents,
    allowedTools: SUB_AGENT_ALLOWED_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
    })),
    restrictedTools: Array.from(RESTRICTED_SUB_AGENT_TOOLS),
  });
});

app.get('/api/sub-agents/allowed-tools', (c) => {
  return c.json({
    ok: true,
    tools: SUB_AGENT_ALLOWED_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
    })),
    restrictedTools: Array.from(RESTRICTED_SUB_AGENT_TOOLS),
  });
});

app.post('/api/sub-agents', async (c) => {
  try {
    const body = await c.req.json();
    // Support creating 1 or multiple sub-agents in one call
    if (Array.isArray(body.agents)) {
      const created = [];
      for (const item of body.agents) {
        const sub = await createOrUpdateCustomSubAgent({
          name: String(item.name || ''),
          description: String(item.description || ''),
          systemPrompt: String(item.systemPrompt || item.system_prompt || ''),
          tools: Array.isArray(item.tools) ? item.tools : undefined,
        });
        created.push(sub);
      }
      const subAgents = await listAllSubAgents();
      return c.json({ ok: true, created, subAgents });
    }

    const created = await createOrUpdateCustomSubAgent({
      name: String(body.name || ''),
      description: String(body.description || ''),
      systemPrompt: String(body.systemPrompt || body.system_prompt || ''),
      tools: Array.isArray(body.tools) ? body.tools : undefined,
    });
    const subAgents = await listAllSubAgents();
    return c.json({ ok: true, created: [created], subAgents });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to save sub-agent' }, 400);
  }
});

app.delete('/api/sub-agents/:name', async (c) => {
  const name = c.req.param('name');
  const res = await deleteCustomSubAgent(name);
  if (!res.deleted) {
    return c.json({ ok: false, error: res.reason || 'Cannot delete sub-agent' }, 400);
  }
  const subAgents = await listAllSubAgents();
  return c.json({ ok: true, subAgents });
});

app.get('/api/sub-agent-runs/:runId', (c) => {
  const runId = c.req.param('runId');
  const run = db.getSubAgentRun(runId);
  if (!run) return c.json({ error: 'Sub-agent run not found' }, 404);
  const messages = db.getSessionMessages(runId);
  const activities = db.getSessionToolActivities(runId);
  return c.json({
    ok: true,
    run: {
      ...run,
      isRunning: isSubAgentRunning(runId),
    },
    messages,
    activities,
  });
});

app.get('/api/sub-agent-runs/:runId/stream', (c) => {
  const runId = c.req.param('runId');

  return streamSSE(c, async (stream) => {
    const run = db.getSubAgentRun(runId);
    const messages = db.getSessionMessages(runId);
    const activities = db.getSessionToolActivities(runId);

    await stream.writeSSE({
      event: 'replay_snapshot',
      data: JSON.stringify({
        run: run
          ? {
              ...run,
              isRunning: isSubAgentRunning(runId),
            }
          : null,
        messages,
        activities,
      }),
    });

    let closed = false;
    const unsubscribe = agentEvents.subscribe(runId, (evt) => {
      if (closed) return;
      stream
        .writeSSE({
          event: evt.type,
          data: JSON.stringify(evt),
        })
        .catch(() => {
          closed = true;
        });
    });

    stream.onAbort(() => {
      closed = true;
      unsubscribe();
    });

    while (!closed) {
      await stream.sleep(15000);
      if (closed) break;
      try {
        await stream.writeSSE({
          event: 'ping',
          data: JSON.stringify({ t: Date.now() }),
        });
      } catch {
        closed = true;
        break;
      }
    }

    unsubscribe();
  });
});

// ==================== MCP SERVERS (.mythgram/mcp) ====================
function mcpPublicBaseUrl(c: any): string {
  const fromEnv = process.env.MYTHGRAM_PUBLIC_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return new URL(c.req.url).origin;
}

app.get('/api/mcp/servers', async (c) => {
  const servers = await listMcpServerViews();
  return c.json({ ok: true, servers });
});

app.post('/api/mcp/servers', async (c) => {
  try {
    const body = await c.req.json();
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();
    if (!name) return c.json({ ok: false, error: 'Server name is required.' }, 400);
    if (!description) return c.json({ ok: false, error: 'Description is required.' }, 400);
    const kind = body.kind === 'remote' ? 'remote' : 'local';
    const publicBaseUrl = mcpPublicBaseUrl(c);

    if (kind === 'local') {
      let rawConfig = body.configJson ?? body.mcpconfig_json ?? body.config;
      if (typeof rawConfig === 'string') rawConfig = JSON.parse(rawConfig);
      const config = normalizeLocalConfig(rawConfig);
      const { server, state } = await addAndConnectLocal({
        name,
        description,
        config,
        publicBaseUrl,
      });
      await refreshServerCache();
      const view = await mcpManager.toView(server);
      return c.json({ ok: state.status === 'connected', server: view, error: state.error });
    }

    const url = String(body.url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      return c.json({ ok: false, error: 'A valid http(s) URL is required.' }, 400);
    }
    const authType = body.auth_type === 'oauth' ? 'oauth' : 'no_auth';
    const { server, state } = await addAndConnectRemote({
      name,
      description,
      url,
      authType,
      publicBaseUrl,
    });
    await refreshServerCache();
    const view = await mcpManager.toView(server);
    return c.json({ ok: state.status === 'connected', server: view, error: state.error });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to add MCP server.' }, 400);
  }
});

app.patch('/api/mcp/servers/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const patch: any = {};
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (typeof body.allow_sub_agents === 'boolean') patch.allow_sub_agents = body.allow_sub_agents;
    if (Array.isArray(body.disabled_tools)) patch.disabled_tools = body.disabled_tools.map(String);
    if (typeof body.description === 'string') patch.description = body.description;
    const updated = await updateMcpServer(id, patch);
    if (!updated.enabled) mcpManager.disconnect(id);
    const view = await mcpManager.toView(updated);
    return c.json({ ok: true, server: view });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to update MCP server.' }, 400);
  }
});

app.delete('/api/mcp/servers/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await mcpManager.remove(id);
  await refreshServerCache();
  const servers = await listMcpServerViews();
  return c.json({ ok: deleted, servers });
});

app.post('/api/mcp/servers/:id/connect', async (c) => {
  try {
    const id = c.req.param('id');
    const state = await mcpManager.reconnect(id, mcpPublicBaseUrl(c));
    const server = await mcpManager.listViews().then((v) => v.find((s) => s.id === id));
    return c.json({
      ok: state.status === 'connected',
      status: state.status,
      error: state.error,
      authorization_url: state.authorizationUrl,
      server,
    });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to connect MCP server.' }, 400);
  }
});

app.post('/api/mcp/servers/:id/disconnect', async (c) => {
  const id = c.req.param('id');
  mcpManager.disconnect(id);
  const server = (await mcpManager.listViews()).find((s) => s.id === id);
  return c.json({ ok: true, server });
});

app.get('/api/mcp/oauth/callback', async (c) => {
  const webuiBase = (process.env.MYTHGRAM_WEBUI_URL || 'http://localhost:2000').replace(/\/+$/, '');
  const serverId = c.req.query('serverId') || '';
  const code = c.req.query('code') || '';
  const error = c.req.query('error');
  if (error) {
    return c.redirect(`${webuiBase}/mcp?oauth=error&reason=${encodeURIComponent(error)}`);
  }
  try {
    await mcpManager.finishOAuth(serverId, code);
    return c.redirect(`${webuiBase}/mcp?oauth=success`);
  } catch (err: any) {
    return c.redirect(
      `${webuiBase}/mcp?oauth=error&reason=${encodeURIComponent(err?.message || 'oauth_failed')}`
    );
  }
});

// ==================== APPLICATION CONNECTORS (Composio) ====================
app.get('/api/connectors/settings', async (c) => {
  const settings = await getConnectorSettings();
  return c.json({ ok: true, settings });
});

app.post('/api/connectors/settings', async (c) => {
  try {
    const body = await c.req.json();
    const settings = await updateConnectorSettings({
      api_key: typeof body.api_key === 'string' ? body.api_key : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      allow_sub_agents:
        typeof body.allow_sub_agents === 'boolean' ? body.allow_sub_agents : undefined,
    });
    return c.json({ ok: true, settings });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to save connector settings.' }, 400);
  }
});

app.get('/api/connectors', async (c) => {
  const settings = await getConnectorSettings();
  if (!settings.configured) {
    return c.json({ ok: false, configured: false, settings, connectors: [] });
  }
  try {
    const connectors = await listConnectorViews({
      search: c.req.query('search') || undefined,
      force: c.req.query('force') === '1',
    });
    return c.json({ ok: true, configured: true, settings, connectors });
  } catch (err: any) {
    return c.json(
      { ok: false, configured: true, settings, connectors: [], error: err?.message || 'Failed to load connectors.' },
      400
    );
  }
});

app.post('/api/connectors/:slug/connect', async (c) => {
  try {
    const link = await startConnectorConnection(c.req.param('slug'));
    return c.json({ ok: true, ...link });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to start connection.' }, 400);
  }
});

app.get('/api/connectors/:slug/status', async (c) => {
  try {
    const status = await checkConnectorConnection(c.req.param('slug'));
    return c.json({ ok: true, ...status });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to read status.' }, 400);
  }
});

app.post('/api/connectors/:slug/disconnect', async (c) => {
  const removed = await disconnectConnector(c.req.param('slug'));
  return c.json({ ok: true, removed });
});

// ==================== SKILLS (.mythgram/skills) ====================
app.get('/api/skills', async (c) => {
  const skills = await listSkills();
  return c.json({ ok: true, skills });
});

app.get('/api/skills/:name', async (c) => {
  const name = c.req.param('name');
  const detail = await getSkillDetail(name);
  if (!detail) return c.json({ error: 'Skill not found' }, 404);
  return c.json({ ok: true, ...detail });
});

app.post('/api/skills', async (c) => {
  try {
    const body = await c.req.json();
    const skill = await createOrUpdateManualSkill({
      name: String(body.name || ''),
      description: String(body.description || ''),
      skillMdContent: String(body.skillMdContent || body.skill_md || ''),
      subfolders: Array.isArray(body.subfolders) ? body.subfolders : [],
      extraFiles: Array.isArray(body.extraFiles) ? body.extraFiles : [],
    });
    const skills = await listSkills();
    return c.json({ ok: true, skill, skills });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to save skill' }, 400);
  }
});

app.delete('/api/skills/:name', async (c) => {
  const name = c.req.param('name');
  const deleted = await deleteSkill(name);
  const skills = await listSkills();
  return c.json({ ok: deleted, skills });
});

// ==================== MEMORY (.mythgram/memory) ====================
app.get('/api/memory', async (c) => {
  const entries = await listMemoryEntries();
  return c.json({ ok: true, memory_dir: getDataDir().memoryDir, entries });
});

app.get('/api/memory/:id', async (c) => {
  const detail = await getMemoryEntry(c.req.param('id'));
  if (!detail) return c.json({ ok: false, error: 'Memory file not found' }, 404);
  return c.json({ ok: true, ...detail });
});

app.post('/api/memory', async (c) => {
  try {
    const body = await c.req.json();
    const entry = await createMemoryEntry({
      name: String(body.name || ''),
      description: body.description ? String(body.description) : '',
      content: body.content ? String(body.content) : undefined,
      send_on_request: body.send_on_request !== false,
      file: body.file ? String(body.file) : undefined,
    });
    return c.json({ ok: true, entry, entries: await listMemoryEntries() });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to create memory file' }, 400);
  }
});

app.put('/api/memory/:id', async (c) => {
  try {
    const body = await c.req.json();
    const entry = await updateMemoryEntry(c.req.param('id'), {
      name: body.name !== undefined ? String(body.name) : undefined,
      description: body.description !== undefined ? String(body.description) : undefined,
      send_on_request:
        body.send_on_request !== undefined ? Boolean(body.send_on_request) : undefined,
      content: body.content !== undefined ? String(body.content) : undefined,
    });
    if (!entry) return c.json({ ok: false, error: 'Memory file not found' }, 404);
    return c.json({ ok: true, entry, entries: await listMemoryEntries() });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to update memory file' }, 400);
  }
});

app.delete('/api/memory/:id', async (c) => {
  try {
    const deleted = await deleteMemoryEntry(c.req.param('id'));
    return c.json({ ok: deleted, entries: await listMemoryEntries() });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to delete memory file' }, 400);
  }
});

app.post('/api/memory/restore', async (c) => {
  const entries = await restoreDefaultMemoryFiles();
  return c.json({ ok: true, entries });
});

// ==================== KNOWLEDGE (.mythgram/knowledge) ====================
app.get('/api/knowledge', async (c) => {
  const entries = await listKnowledgeEntries();
  return c.json({ ok: true, knowledge_dir: getDataDir().knowledgeDir, entries });
});

app.get('/api/knowledge/:id', async (c) => {
  const detail = await getKnowledgeEntry(c.req.param('id'));
  if (!detail) return c.json({ ok: false, error: 'Knowledge file not found' }, 404);
  return c.json({ ok: true, ...detail });
});

app.post('/api/knowledge', async (c) => {
  try {
    const body = await c.req.json();
    const type = String(body.type || 'text');
    const description = body.description ? String(body.description) : '';

    if (type === 'docs') {
      const entry = await createKnowledgeFromDocs({
        url: String(body.url || ''),
        name: body.name ? String(body.name) : undefined,
        description,
      });
      return c.json({ ok: true, created: [entry], entries: await listKnowledgeEntries() });
    }

    if (type === 'curl') {
      const entry = await createKnowledgeFromCurl({
        curlCommand: String(body.curlCommand || ''),
        name: body.name ? String(body.name) : undefined,
        description,
      });
      return c.json({ ok: true, created: [entry], entries: await listKnowledgeEntries() });
    }

    if (type === 'upload') {
      const rawPaths = Array.isArray(body.paths) ? body.paths : body.path ? [body.path] : [];
      const paths = rawPaths.map((p: unknown) => String(p)).filter(Boolean);
      if (paths.length === 0) {
        return c.json({ ok: false, error: 'No uploaded file or folder path provided.' }, 400);
      }
      const created = [];
      for (const targetPath of paths) {
        const entries = await createKnowledgeFromPath({ targetPath, description });
        created.push(...entries);
      }
      return c.json({ ok: true, created, entries: await listKnowledgeEntries() });
    }

    const entry = await createKnowledgeFromText({
      name: String(body.name || ''),
      description,
      content: String(body.content || ''),
    });
    return c.json({ ok: true, created: [entry], entries: await listKnowledgeEntries() });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to create knowledge file' }, 400);
  }
});

app.put('/api/knowledge/:id', async (c) => {
  try {
    const body = await c.req.json();
    const entry = await updateKnowledgeEntry(c.req.param('id'), {
      name: body.name !== undefined ? String(body.name) : undefined,
      description: body.description !== undefined ? String(body.description) : undefined,
      content: body.content !== undefined ? String(body.content) : undefined,
    });
    if (!entry) return c.json({ ok: false, error: 'Knowledge file not found' }, 404);
    return c.json({ ok: true, entry, entries: await listKnowledgeEntries() });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to update knowledge file' }, 400);
  }
});

app.delete('/api/knowledge/:id', async (c) => {
  const deleted = await deleteKnowledgeEntry(c.req.param('id'));
  return c.json({ ok: deleted, entries: await listKnowledgeEntries() });
});

// ==================== WEB SEARCH & SCRAPER SETTINGS ====================
app.get('/api/web-search/settings', async (c) => {
  const settings = await getMaskedWebSearchSettings();
  return c.json({ ok: true, ...settings });
});

app.post('/api/web-search/settings', async (c) => {
  try {
    const body = await c.req.json();
    await updateWebSearchSettings({
      provider: body.provider,
      scraper_provider: body.scraper_provider,
      api_keys: body.api_keys,
      firecrawl_api_key: body.firecrawl_api_key,
    });
    const settings = await getMaskedWebSearchSettings();
    return c.json({ ok: true, ...settings });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Failed to save web search settings' }, 400);
  }
});

app.post('/api/web-search/test', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const query = String(body.query || 'mythgram ai agent').trim();
    const kind = String(body.kind || 'web');
    if (kind === 'image') {
      const result = await imageSearch(query, { maxResults: 4, timeoutMs: 60_000 });
      return c.json({ ok: true, kind, ...result });
    }
    const result = await webSearch(query, { maxResults: 4, timeoutMs: 60_000 });
    return c.json({ ok: true, kind: 'web', ...result });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'Search test failed' }, 400);
  }
});

// ==================== SLIDES (SQLite) ====================
function parseSlideProjectRow(row: any) {
  let slides: SlideItem[] = [];
  try {
    slides = JSON.parse(row.slides_json);
  } catch {
    slides = [];
  }
  return {
    id: row.id,
    name: row.name,
    session_id: row.session_id,
    slides_count: slides.length,
    slides,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

app.get('/api/slides', (c) => {
  const sessionId = c.req.query('sessionId');
  const projects = db
    .listSlideProjects(sessionId || undefined)
    .map(parseSlideProjectRow);
  return c.json({ ok: true, projects });
});

app.get('/api/slides/:id', (c) => {
  const id = c.req.param('id');
  const row = db.getSlideProject(id);
  if (!row) return c.json({ error: 'Slide project not found' }, 404);
  return c.json({ ok: true, project: parseSlideProjectRow(row) });
});

app.put('/api/slides/:id', async (c) => {
  const id = c.req.param('id');
  const row = db.getSlideProject(id);
  if (!row) return c.json({ error: 'Slide project not found' }, 404);
  const body = await c.req.json();
  const parsed = parseSlideProjectRow(row);
  const updated = db.upsertSlideProject({
    id,
    name: body.name ? String(body.name) : parsed.name,
    sessionId: parsed.session_id,
    slides: Array.isArray(body.slides) ? body.slides : parsed.slides,
  });
  return c.json({ ok: true, project: parseSlideProjectRow(updated) });
});

app.delete('/api/slides/:id', (c) => {
  const id = c.req.param('id');
  const deleted = db.deleteSlideProject(id);
  return c.json({ ok: deleted });
});

// ==================== UPLOADS (.mythgram/uploads) ====================
app.post('/api/uploads', async (c) => {
  const paths = getDataDir();
  const body = await c.req.parseBody({ all: true });
  const rawFiles = body['files'];
  const fileArray = Array.isArray(rawFiles) ? rawFiles : rawFiles ? [rawFiles] : [];
  const relativePathsRaw = body['relativePaths'];
  const relPaths = Array.isArray(relativePathsRaw)
    ? relativePathsRaw.map(String)
    : relativePathsRaw
    ? [String(relativePathsRaw)]
    : [];

  const batchFolder = path.join(paths.uploadsDir, `batch_${Date.now()}`);
  await fs.mkdir(batchFolder, { recursive: true });

  const saved: { name: string; path: string; size: number; type: string }[] = [];

  for (let i = 0; i < fileArray.length; i++) {
    const item = fileArray[i];
    if (item && typeof item === 'object' && 'arrayBuffer' in item) {
      const f = item as File;
      const relName = relPaths[i] || f.name || `upload_${i}`;
      const safeRel = relName.replace(/^(\.\.(\/|\\|$))+/, '');
      const destPath = path.join(batchFolder, safeRel);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      const buf = Buffer.from(await f.arrayBuffer());
      await fs.writeFile(destPath, buf);
      saved.push({
        name: relName,
        path: destPath,
        size: buf.length,
        type: f.type || 'application/octet-stream',
      });
    }
  }

  return c.json({
    ok: true,
    uploadsDir: batchFolder,
    files: saved,
  });
});

// ==================== SESSIONS & CHAT ====================
app.get('/api/sessions', (c) => {
  const sessions = db.listSessions().map((s) => ({
    ...s,
    isRunning: isSessionRunning(s.id),
  }));
  return c.json({ sessions });
});

app.post('/api/sessions/new-id', (c) => {
  return c.json({ sessionId: generate30DigitSessionId() });
});

app.get('/api/sessions/:id', (c) => {
  const id = c.req.param('id');
  const session = db.getSession(id);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }
  const messages = db.getSessionMessages(id);
  const activities = db.getSessionToolActivities(id);
  const subAgentRuns = db.getSessionSubAgentRuns(id).map((r) => ({
    ...r,
    isRunning: isSubAgentRunning(r.id),
  }));
  const todos = db.getSessionTodos(id);
  const pendingInteractions = getPendingInteractionsForSession(id);
  const creds = getProviderRuntimeCredentials(session.provider_id);

  return c.json({
    session: {
      ...session,
      isRunning: isSessionRunning(id),
      contextWindow: creds.contextWindow,
    },
    messages,
    activities,
    subAgentRuns,
    todos,
    pendingInteractions,
  });
});

app.get('/api/sessions/:id/todos', (c) => {
  const id = c.req.param('id');
  return c.json({ ok: true, todos: db.getSessionTodos(id) });
});

app.post('/api/sessions/:id/interactive-response', async (c) => {
  const body = await c.req.json();
  const promptId = String(body.promptId || body.toolCallId || '');
  if (!promptId) {
    return c.json({ error: 'promptId is required' }, 400);
  }
  const resolved = resolveUserInteraction(promptId, body.response);
  return c.json({ ok: true, resolved });
});

app.delete('/api/sessions/:id', (c) => {
  const id = c.req.param('id');
  abortSessionRun(id);
  db.deleteSession(id);
  return c.json({ ok: true });
});

app.post('/api/sessions/:id/prompt', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const result = await submitUserPromptToSession({
    sessionId: id,
    prompt: String(body.prompt || ''),
    workspace: body.workspace,
    providerId: body.providerId,
    modelId: body.modelId,
    attachments: body.attachments,
  });

  return c.json({
    ok: true,
    session: result.session,
    userMessageId: result.userMessageId,
  });
});

app.post('/api/sessions/:id/abort', (c) => {
  const id = c.req.param('id');
  const aborted = abortSessionRun(id);
  return c.json({ ok: true, aborted });
});

/**
 * Live SSE stream endpoint for a session.
 * Immediately replays current state (including any in-progress RAM-buffered streaming message,
 * tool activities, sub-agent runs, todos, and pending interactive prompts) so browser refresh
 * seamlessly continues streaming without losing a token.
 */
app.get('/api/sessions/:id/stream', (c) => {
  const sessionId = c.req.param('id');

  return streamSSE(c, async (stream) => {
    const session = db.getSession(sessionId);
    const messages = db.getSessionMessages(sessionId);
    const activities = db.getSessionToolActivities(sessionId);
    const subAgentRuns = db.getSessionSubAgentRuns(sessionId).map((r) => ({
      ...r,
      isRunning: isSubAgentRunning(r.id),
    }));
    const todos = db.getSessionTodos(sessionId);
    const pendingInteractions = getPendingInteractionsForSession(sessionId);
    const creds = session
      ? getProviderRuntimeCredentials(session.provider_id)
      : { contextWindow: 128000 };

    // 1. Replay current state snapshot immediately upon connect / refresh
    await stream.writeSSE({
      event: 'replay_snapshot',
      data: JSON.stringify({
        session: session
          ? {
              ...session,
              isRunning: isSessionRunning(sessionId),
              contextWindow: creds.contextWindow,
            }
          : null,
        messages,
        activities,
        subAgentRuns,
        todos,
        pendingInteractions,
      }),
    });

    // 2. Subscribe to live events from the background agent loop
    let closed = false;
    const unsubscribe = agentEvents.subscribe(sessionId, (evt) => {
      if (closed) return;
      stream
        .writeSSE({
          event: evt.type,
          data: JSON.stringify(evt),
        })
        .catch(() => {
          closed = true;
        });
    });

    stream.onAbort(() => {
      closed = true;
      unsubscribe();
    });

    // Keep SSE connection alive with periodic heartbeats
    while (!closed) {
      await stream.sleep(15000);
      if (closed) break;
      try {
        await stream.writeSSE({
          event: 'ping',
          data: JSON.stringify({ t: Date.now() }),
        });
      } catch {
        closed = true;
        break;
      }
    }

    unsubscribe();
  });
});

const PORT = Number(process.env.PORT || 1000);

const server = serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: '0.0.0.0',
  },
  (info) => {
    console.log(`[Mythgram Backend] Listening on http://0.0.0.0:${info.port}`);
    console.log(`[Mythgram Datadir] ${getDataDir().dataDir}`);
  }
);

// Attach WebSocket server on `/api/terminal/ws` for xterm.js interactive local terminal
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/api/terminal/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, request) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const cwd = url.searchParams.get('cwd') || getDefaultWorkspace();

  const term = new InteractiveTerminalSession(cwd, (output) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data: output }));
    }
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'input' && typeof msg.data === 'string') {
        term.write(msg.data);
      }
    } catch {
      term.write(raw.toString());
    }
  });

  ws.on('close', () => {
    term.kill();
  });
});
