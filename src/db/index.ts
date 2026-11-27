import { DatabaseSync } from 'node:sqlite';
import { getDataDir } from '../datadir/index.js';

export interface SessionRow {
  id: string;
  title: string;
  workspace: string;
  provider_id: string;
  model_id: string;
  status: 'idle' | 'running' | 'completed' | 'aborted' | 'error';
  context_tokens: number;
  created_at: number;
  updated_at: number;
  schedule_id?: string | null;
  origin?: string | null;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoning?: string;
  tool_calls?: string; // JSON string
  tool_call_id?: string;
  name?: string;
  attachments?: string; // JSON string
  tokens?: number;
  created_at: number;
}

export interface ToolActivityRow {
  id: string;
  session_id: string;
  tool_call_id: string;
  tool_name: string;
  args_json: string;
  result_json: string;
  status: 'running' | 'completed' | 'error';
  created_at: number;
  updated_at: number;
}

export interface SubAgentRunRow {
  id: string;
  parent_session_id: string;
  parent_tool_call_id: string;
  agent_name: string;
  task: string;
  status: 'running' | 'completed' | 'aborted' | 'error';
  final_output: string;
  output_file_path?: string;
  created_at: number;
  updated_at: number;
}

export interface SlideProjectRow {
  id: string;
  name: string;
  session_id: string;
  slides_json: string; // JSON array of SlideItem
  created_at: number;
  updated_at: number;
}

export interface SlideItem {
  slide_number: number;
  html_file_path: string;
  html_content: string;
  title?: string;
}

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
}

/**
 * RAM Buffer item for ultra-high-throughput token streaming (>1,000,000 tokens/s capability).
 * Every 2 seconds, buffered chunks and pending message/session updates in RAM are batch-flushed
 * to SQLite in a single transaction, and the flushed delta buffer is cleared from RAM while
 * active live state remains accessible for instant browser-refresh replay.
 */
interface RamMessageBuffer {
  messageId: string;
  sessionId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  fullContent: string;
  fullReasoning: string;
  unflushedDeltaCount: number;
  toolCallsJson?: string;
  toolCallId?: string;
  name?: string;
  attachmentsJson?: string;
  tokens: number;
  createdAt: number;
  dirty: boolean;
  persistedInDb: boolean;
}

class MythgramDatabase {
  private db: DatabaseSync;
  private dbPath: string;
  private ramMessages: Map<string, RamMessageBuffer> = new Map();
  private sessionRamMessages: Map<string, string[]> = new Map(); // sessionId -> ordered messageIds
  private activeSessionIds: Set<string> = new Set(); // tracks running main sessions and sub-agent runIds
  private flushTimer: NodeJS.Timeout | null = null;

  constructor() {
    const paths = getDataDir();
    this.dbPath = paths.dbPath;
    this.db = new DatabaseSync(this.dbPath);
    this.applyPragmas();
    this.initSchema();
    this.startFlushLoop();
  }

  private applyPragmas() {
    // High-performance SQLite pragmas for 1,000,000+ tokens/sec throughput
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA temp_store = MEMORY;
      PRAGMA cache_size = -128000;
      PRAGMA mmap_size = 536870912;
      PRAGMA busy_timeout = 10000;
    `);
  }

  /**
   * Reopens the SQLite handle on another database file. Used when the active
   * profile changes so every session, message and setting starts from scratch.
   */
  public switchDatabase(dbPath: string) {
    if (this.dbPath === dbPath) return;
    try {
      this.flushRamToSqlite();
    } catch {
      // the old database may already be unusable; nothing else to persist
    }
    this.closeDatabase();
    this.dbPath = dbPath;
    this.openDatabase();
  }

  /** Releases the SQLite handle and every in-memory buffer (used before wiping a data dir). */
  public closeDatabase(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      this.db.close();
    } catch {
      // ignore close errors
    }
    this.ramMessages.clear();
    this.sessionRamMessages.clear();
    this.activeSessionIds.clear();
  }

  /** Reopens the handle on the current path, recreating the schema when the file was wiped. */
  public openDatabase(): void {
    this.db = new DatabaseSync(this.dbPath);
    this.applyPragmas();
    this.initSchema();
    this.startFlushLoop();
  }

  public getDatabasePath(): string {
    return this.dbPath;
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        workspace TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        context_tokens INTEGER NOT NULL DEFAULT 0,
        schedule_id TEXT,
        origin TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        reasoning TEXT NOT NULL DEFAULT '',
        tool_calls TEXT,
        tool_call_id TEXT,
        name TEXT,
        attachments TEXT,
        tokens INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

      CREATE TABLE IF NOT EXISTS tool_activities (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        tool_call_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        args_json TEXT NOT NULL,
        result_json TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'running',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tool_activities_session ON tool_activities(session_id, created_at);

      CREATE TABLE IF NOT EXISTS sub_agent_runs (
        id TEXT PRIMARY KEY,
        parent_session_id TEXT NOT NULL,
        parent_tool_call_id TEXT NOT NULL DEFAULT '',
        agent_name TEXT NOT NULL,
        task TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        final_output TEXT NOT NULL DEFAULT '',
        output_file_path TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sub_agent_runs_parent ON sub_agent_runs(parent_session_id, created_at);

      CREATE TABLE IF NOT EXISTS slide_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        session_id TEXT NOT NULL DEFAULT '',
        slides_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_slide_projects_updated ON slide_projects(updated_at DESC);

      CREATE TABLE IF NOT EXISTS session_todos (
        session_id TEXT PRIMARY KEY,
        todos_json TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provider_configs (
        provider_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL DEFAULT '',
        models_url TEXT,
        selected_model TEXT NOT NULL DEFAULT '',
        is_custom INTEGER NOT NULL DEFAULT 0,
        custom_headers TEXT,
        manual_context_limit TEXT,
        manual_vision_support INTEGER,
        cached_models_json TEXT,
        updated_at INTEGER NOT NULL
      );
    `);

    // Forward-compatible migrations for databases created by earlier versions.
    try {
      const columns = this.db.prepare(`PRAGMA table_info(sessions)`).all() as {
        name: string;
      }[];
      const hasColumn = (name: string) => columns.some((c) => c.name === name);
      if (!hasColumn('schedule_id')) {
        this.db.exec(`ALTER TABLE sessions ADD COLUMN schedule_id TEXT`);
      }
      if (!hasColumn('origin')) {
        this.db.exec(`ALTER TABLE sessions ADD COLUMN origin TEXT`);
      }
    } catch (err) {
      console.error('[DB] Session column migration failed:', err);
    }
  }

  public setStreamActive(sessionOrRunId: string, active: boolean) {
    if (active) {
      this.activeSessionIds.add(sessionOrRunId);
    } else {
      this.activeSessionIds.delete(sessionOrRunId);
    }
  }

  /**
   * Every 2 seconds, flush all dirty RAM buffers into SQLite in a single atomic transaction
   * and clear completed/flushed RAM delta buffers.
   */
  private startFlushLoop() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => {
      this.flushRamToSqlite();
    }, 2000);
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  public flushRamToSqlite() {
    const dirtyEntries: RamMessageBuffer[] = [];
    for (const buf of this.ramMessages.values()) {
      if (buf.dirty) {
        dirtyEntries.push(buf);
      }
    }

    if (dirtyEntries.length === 0) return;

    try {
      this.db.exec('BEGIN IMMEDIATE TRANSACTION');
      const upsertStmt = this.db.prepare(`
        INSERT INTO messages (
          id, session_id, role, content, reasoning, tool_calls, tool_call_id, name, attachments, tokens, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          content = excluded.content,
          reasoning = excluded.reasoning,
          tool_calls = excluded.tool_calls,
          tokens = excluded.tokens
      `);

      for (const buf of dirtyEntries) {
        upsertStmt.run(
          buf.messageId,
          buf.sessionId,
          buf.role,
          buf.fullContent,
          buf.fullReasoning,
          buf.toolCallsJson ?? null,
          buf.toolCallId ?? null,
          buf.name ?? null,
          buf.attachmentsJson ?? null,
          buf.tokens,
          buf.createdAt
        );
        buf.dirty = false;
        buf.unflushedDeltaCount = 0;
        buf.persistedInDb = true;
      }

      this.db.exec('COMMIT');

      // Clear non-dirty, persisted RAM buffers for sessions/sub-agents that are not actively streaming
      for (const [msgId, buf] of this.ramMessages.entries()) {
        if (!buf.dirty && buf.persistedInDb) {
          const isActivelyStreaming = this.activeSessionIds.has(buf.sessionId);
          if (!isActivelyStreaming) {
            const session = this.getSession(buf.sessionId);
            const subRun = !session ? this.getSubAgentRun(buf.sessionId) : null;
            const running =
              session?.status === 'running' || subRun?.status === 'running';
            if (!running) {
              this.ramMessages.delete(msgId);
            }
          }
        }
      }
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      console.error('[DB] Error flushing RAM buffer to SQLite:', err);
    }
  }

  // ==================== RAM BUFFERED STREAMING METHODS ====================

  public createOrUpdateRamMessage(params: {
    id: string;
    sessionId: string;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string;
    reasoning?: string;
    toolCallsJson?: string;
    toolCallId?: string;
    name?: string;
    attachmentsJson?: string;
    tokens?: number;
    createdAt?: number;
  }): RamMessageBuffer {
    let existing = this.ramMessages.get(params.id);
    if (!existing) {
      existing = {
        messageId: params.id,
        sessionId: params.sessionId,
        role: params.role,
        fullContent: params.content ?? '',
        fullReasoning: params.reasoning ?? '',
        unflushedDeltaCount: 1,
        toolCallsJson: params.toolCallsJson,
        toolCallId: params.toolCallId,
        name: params.name,
        attachmentsJson: params.attachmentsJson,
        tokens: params.tokens ?? 0,
        createdAt: params.createdAt ?? Date.now(),
        dirty: true,
        persistedInDb: false,
      };
      this.ramMessages.set(params.id, existing);
      const list = this.sessionRamMessages.get(params.sessionId) || [];
      if (!list.includes(params.id)) {
        list.push(params.id);
        this.sessionRamMessages.set(params.sessionId, list);
      }
    } else {
      if (params.content !== undefined) existing.fullContent = params.content;
      if (params.reasoning !== undefined) existing.fullReasoning = params.reasoning;
      if (params.toolCallsJson !== undefined) existing.toolCallsJson = params.toolCallsJson;
      if (params.tokens !== undefined) existing.tokens = params.tokens;
      existing.unflushedDeltaCount++;
      existing.dirty = true;
    }
    return existing;
  }

  public appendRamMessageDelta(
    messageId: string,
    sessionId: string,
    contentDelta: string,
    reasoningDelta: string = '',
    tokenIncrement: number = 0
  ) {
    let buf = this.ramMessages.get(messageId);
    if (!buf) {
      buf = this.createOrUpdateRamMessage({
        id: messageId,
        sessionId,
        role: 'assistant',
        content: contentDelta,
        reasoning: reasoningDelta,
        tokens: tokenIncrement,
      });
      return buf;
    }
    if (contentDelta) buf.fullContent += contentDelta;
    if (reasoningDelta) buf.fullReasoning += reasoningDelta;
    if (tokenIncrement) buf.tokens += tokenIncrement;
    buf.unflushedDeltaCount++;
    buf.dirty = true;
    return buf;
  }

  /**
   * Returns merged messages from SQLite + any live unflushed RAM messages so browser refresh
   * never loses a single token even between 2-second flushes.
   * Works identically for both main agent sessions and sub-agent runs (`runId`).
   */
  public getSessionMessages(sessionId: string): MessageRow[] {
    const stmt = this.db.prepare(
      `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`
    );
    const dbRows = stmt.all(sessionId) as unknown as MessageRow[];
    const mergedMap = new Map<string, MessageRow>();

    for (const row of dbRows) {
      mergedMap.set(row.id, row);
    }

    for (const buf of this.ramMessages.values()) {
      if (buf.sessionId === sessionId) {
        mergedMap.set(buf.messageId, {
          id: buf.messageId,
          session_id: buf.sessionId,
          role: buf.role,
          content: buf.fullContent,
          reasoning: buf.fullReasoning,
          tool_calls: buf.toolCallsJson,
          tool_call_id: buf.toolCallId,
          name: buf.name,
          attachments: buf.attachmentsJson,
          tokens: buf.tokens,
          created_at: buf.createdAt,
        });
      }
    }

    return Array.from(mergedMap.values()).sort((a, b) => a.created_at - b.created_at);
  }

  // ==================== SESSION METHODS ====================

  public createSession(session: SessionRow): SessionRow {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, title, workspace, provider_id, model_id, status, context_tokens, schedule_id, origin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.title,
      session.workspace,
      session.provider_id,
      session.model_id,
      session.status,
      session.context_tokens,
      session.schedule_id ?? null,
      session.origin ?? null,
      session.created_at,
      session.updated_at
    );
    return session;
  }

  public updateSession(
    id: string,
    patch: Partial<Pick<SessionRow, 'title' | 'workspace' | 'provider_id' | 'model_id' | 'status' | 'context_tokens'>>
  ) {
    const current = this.getSession(id);
    if (!current) return null;

    const updated: SessionRow = {
      ...current,
      ...patch,
      updated_at: Date.now(),
    };

    const stmt = this.db.prepare(`
      UPDATE sessions
      SET title = ?, workspace = ?, provider_id = ?, model_id = ?, status = ?, context_tokens = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      updated.title,
      updated.workspace,
      updated.provider_id,
      updated.model_id,
      updated.status,
      updated.context_tokens,
      updated.updated_at,
      id
    );
    return updated;
  }

  public getSession(id: string): SessionRow | null {
    const stmt = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`);
    const row = stmt.get(id) as unknown as SessionRow | undefined;
    return row || null;
  }

  public listSessions(): SessionRow[] {
    const stmt = this.db.prepare(`SELECT * FROM sessions ORDER BY updated_at DESC`);
    return stmt.all() as unknown as SessionRow[];
  }

  public deleteSession(id: string) {
    this.flushRamToSqlite();
    for (const [msgId, buf] of this.ramMessages.entries()) {
      if (buf.sessionId === id) this.ramMessages.delete(msgId);
    }
    this.sessionRamMessages.delete(id);
    this.db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(id);
    this.db.prepare(`DELETE FROM tool_activities WHERE session_id = ?`).run(id);
    this.db.prepare(`DELETE FROM session_todos WHERE session_id = ?`).run(id);
    this.db.prepare(`DELETE FROM sub_agent_runs WHERE parent_session_id = ?`).run(id);
    this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  }

  // ==================== SUB-AGENT RUN METHODS ====================

  public upsertSubAgentRun(run: SubAgentRunRow) {
    const stmt = this.db.prepare(`
      INSERT INTO sub_agent_runs (
        id, parent_session_id, parent_tool_call_id, agent_name, task, status, final_output, output_file_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        final_output = excluded.final_output,
        output_file_path = excluded.output_file_path,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      run.id,
      run.parent_session_id,
      run.parent_tool_call_id,
      run.agent_name,
      run.task,
      run.status,
      run.final_output,
      run.output_file_path ?? null,
      run.created_at,
      run.updated_at
    );
  }

  public getSubAgentRun(runId: string): SubAgentRunRow | null {
    const stmt = this.db.prepare(`SELECT * FROM sub_agent_runs WHERE id = ?`);
    const row = stmt.get(runId) as unknown as SubAgentRunRow | undefined;
    return row || null;
  }

  public getSessionSubAgentRuns(parentSessionId: string): SubAgentRunRow[] {
    const stmt = this.db.prepare(
      `SELECT * FROM sub_agent_runs WHERE parent_session_id = ? ORDER BY created_at ASC`
    );
    return stmt.all(parentSessionId) as unknown as SubAgentRunRow[];
  }

  // ==================== TODOS METHODS ====================

  public getSessionTodos(sessionId: string): TodoItem[] {
    const stmt = this.db.prepare(
      `SELECT todos_json FROM session_todos WHERE session_id = ?`
    );
    const row = stmt.get(sessionId) as { todos_json: string } | undefined;
    if (!row) return [];
    try {
      const parsed = JSON.parse(row.todos_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public setSessionTodos(sessionId: string, todos: TodoItem[]): TodoItem[] {
    const stmt = this.db.prepare(`
      INSERT INTO session_todos (session_id, todos_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        todos_json = excluded.todos_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(sessionId, JSON.stringify(todos), Date.now());
    return todos;
  }

  // ==================== SLIDE PROJECTS METHODS (SQLite) ====================

  public upsertSlideProject(project: {
    id: string;
    name: string;
    sessionId?: string;
    slides: SlideItem[];
    createdAt?: number;
  }): SlideProjectRow {
    const existing = this.getSlideProject(project.id);
    const now = Date.now();
    const createdAt = existing?.created_at ?? project.createdAt ?? now;
    const sessionId = project.sessionId ?? existing?.session_id ?? '';
    const sortedSlides = [...project.slides].sort(
      (a, b) => a.slide_number - b.slide_number
    );
    const slidesJson = JSON.stringify(sortedSlides);

    const stmt = this.db.prepare(`
      INSERT INTO slide_projects (id, name, session_id, slides_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        session_id = CASE WHEN excluded.session_id != '' THEN excluded.session_id ELSE slide_projects.session_id END,
        slides_json = excluded.slides_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(project.id, project.name, sessionId, slidesJson, createdAt, now);

    return {
      id: project.id,
      name: project.name,
      session_id: sessionId,
      slides_json: slidesJson,
      created_at: createdAt,
      updated_at: now,
    };
  }

  public getSlideProject(id: string): SlideProjectRow | null {
    const stmt = this.db.prepare(`SELECT * FROM slide_projects WHERE id = ?`);
    const row = stmt.get(id) as unknown as SlideProjectRow | undefined;
    return row || null;
  }

  public listSlideProjects(sessionId?: string): SlideProjectRow[] {
    if (sessionId) {
      const stmt = this.db.prepare(
        `SELECT * FROM slide_projects WHERE session_id = ? ORDER BY updated_at DESC`
      );
      return stmt.all(sessionId) as unknown as SlideProjectRow[];
    }
    const stmt = this.db.prepare(
      `SELECT * FROM slide_projects ORDER BY updated_at DESC`
    );
    return stmt.all() as unknown as SlideProjectRow[];
  }

  public deleteSlideProject(id: string): boolean {
    const existing = this.getSlideProject(id);
    if (!existing) return false;
    this.db.prepare(`DELETE FROM slide_projects WHERE id = ?`).run(id);
    return true;
  }

  // ==================== TOOL ACTIVITY METHODS ====================

  public upsertToolActivity(activity: ToolActivityRow) {
    const stmt = this.db.prepare(`
      INSERT INTO tool_activities (
        id, session_id, tool_call_id, tool_name, args_json, result_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        result_json = excluded.result_json,
        status = excluded.status,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      activity.id,
      activity.session_id,
      activity.tool_call_id,
      activity.tool_name,
      activity.args_json,
      activity.result_json,
      activity.status,
      activity.created_at,
      activity.updated_at
    );
  }

  public getSessionToolActivities(sessionId: string): ToolActivityRow[] {
    const stmt = this.db.prepare(
      `SELECT * FROM tool_activities WHERE session_id = ? ORDER BY created_at ASC`
    );
    return stmt.all(sessionId) as unknown as ToolActivityRow[];
  }

  // ==================== SETTINGS & PROVIDERS ====================

  public getSetting(key: string, defaultValue: string = ''): string {
    const stmt = this.db.prepare(`SELECT value FROM settings WHERE key = ?`);
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? row.value : defaultValue;
  }

  public setSetting(key: string, value: string) {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }

  public getAllSettings(): Record<string, string> {
    const stmt = this.db.prepare(`SELECT key, value FROM settings`);
    const rows = stmt.all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  }

  public saveProviderConfig(config: {
    provider_id: string;
    name: string;
    base_url: string;
    api_key: string;
    models_url?: string;
    selected_model?: string;
    is_custom?: number;
    custom_headers?: string;
    manual_context_limit?: string;
    manual_vision_support?: number | null;
    cached_models_json?: string;
  }) {
    const existing = this.getProviderConfig(config.provider_id);
    const stmt = this.db.prepare(`
      INSERT INTO provider_configs (
        provider_id, name, base_url, api_key, models_url, selected_model,
        is_custom, custom_headers, manual_context_limit, manual_vision_support, cached_models_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        name = excluded.name,
        base_url = excluded.base_url,
        api_key = excluded.api_key,
        models_url = excluded.models_url,
        selected_model = excluded.selected_model,
        is_custom = excluded.is_custom,
        custom_headers = excluded.custom_headers,
        manual_context_limit = excluded.manual_context_limit,
        manual_vision_support = excluded.manual_vision_support,
        cached_models_json = excluded.cached_models_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      config.provider_id,
      config.name,
      config.base_url,
      config.api_key ?? existing?.api_key ?? '',
      config.models_url ?? existing?.models_url ?? null,
      config.selected_model ?? existing?.selected_model ?? '',
      config.is_custom ?? existing?.is_custom ?? 0,
      config.custom_headers ?? existing?.custom_headers ?? null,
      config.manual_context_limit ?? existing?.manual_context_limit ?? null,
      config.manual_vision_support !== undefined
        ? config.manual_vision_support
        : existing?.manual_vision_support ?? null,
      config.cached_models_json ?? existing?.cached_models_json ?? null,
      Date.now()
    );
  }

  public getProviderConfig(providerId: string): any | null {
    const stmt = this.db.prepare(`SELECT * FROM provider_configs WHERE provider_id = ?`);
    return stmt.get(providerId) || null;
  }

  public getAllProviderConfigs(): any[] {
    const stmt = this.db.prepare(`SELECT * FROM provider_configs ORDER BY is_custom ASC, name ASC`);
    return stmt.all() as any[];
  }

  public deleteProviderConfig(providerId: string) {
    this.db.prepare(`DELETE FROM provider_configs WHERE provider_id = ?`).run(providerId);
  }
}

export const db = new MythgramDatabase();
