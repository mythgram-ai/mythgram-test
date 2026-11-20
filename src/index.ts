import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { initDataDir, getDataDir } from './datadir/index.js';
import { db } from './db/index.js';
import {
  getAllResolvedProviders,
  fetchModelsForProvider,
  BUILTIN_PROVIDERS_MAP,
  getProviderRuntimeCredentials,
} from './providers/index.js';
import { ALL_TOOLS, getOpenAIToolsList } from './tools/index.js';
import {
  createNewSession,
  submitUserPromptToSession,
  abortSessionRun,
  isSessionRunning,
  getDefaultWorkspace,
  setDefaultWorkspace,
  generate30DigitSessionId,
} from './session/index.js';
import { agentEvents } from './agents/agent.js';
import { listWorkspaceTree, InteractiveTerminalSession } from './worker/index.js';

// Initialize .mythgram datadir immediately on startup
initDataDir();

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
  const creds = getProviderRuntimeCredentials(session.provider_id);

  return c.json({
    session: {
      ...session,
      isRunning: isSessionRunning(id),
      contextWindow: creds.contextWindow,
    },
    messages,
    activities,
  });
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
 * Immediately replays current state (including any in-progress RAM-buffered streaming message
 * and tool activities) so browser refresh seamlessly continues streaming without losing a token.
 */
app.get('/api/sessions/:id/stream', (c) => {
  const sessionId = c.req.param('id');

  return streamSSE(c, async (stream) => {
    const session = db.getSession(sessionId);
    const messages = db.getSessionMessages(sessionId);
    const activities = db.getSessionToolActivities(sessionId);
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
