import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../datadir/index.js';
import { LocalMcpConfig, McpServerRecord } from './types.js';

export function ensureMcpStore(): { mcpDir: string; serversJsonPath: string; oauthDir: string } {
  const paths = getDataDir();
  const mcpDir = path.join(paths.dataDir, 'mcp');
  const oauthDir = path.join(mcpDir, 'oauth');
  if (!fsSync.existsSync(mcpDir)) fsSync.mkdirSync(mcpDir, { recursive: true, mode: 0o700 });
  if (!fsSync.existsSync(oauthDir)) fsSync.mkdirSync(oauthDir, { recursive: true, mode: 0o700 });
  const serversJsonPath = path.join(mcpDir, 'mcp-servers.json');
  if (!fsSync.existsSync(serversJsonPath)) {
    fsSync.writeFileSync(serversJsonPath, '[]\n', 'utf-8');
  }
  return { mcpDir, serversJsonPath, oauthDir };
}

export async function listServers(): Promise<McpServerRecord[]> {
  const { serversJsonPath } = ensureMcpStore();
  try {
    const raw = await fs.readFile(serversJsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getServer(id: string): Promise<McpServerRecord | undefined> {
  const servers = await listServers();
  return servers.find((s) => s.id === id);
}

export async function findServerByName(name: string): Promise<McpServerRecord | undefined> {
  const lower = name.trim().toLowerCase();
  const servers = await listServers();
  return servers.find((s) => s.name.trim().toLowerCase() === lower);
}

export async function saveServers(servers: McpServerRecord[]): Promise<void> {
  const { serversJsonPath } = ensureMcpStore();
  await fs.writeFile(serversJsonPath, JSON.stringify(servers, null, 2) + '\n', 'utf-8');
}

export async function upsertServer(record: McpServerRecord): Promise<McpServerRecord> {
  const servers = await listServers();
  const idx = servers.findIndex((s) => s.id === record.id);
  if (idx >= 0) servers[idx] = record;
  else servers.push(record);
  await saveServers(servers);
  return record;
}

export async function deleteServer(id: string): Promise<boolean> {
  const servers = await listServers();
  const next = servers.filter((s) => s.id !== id);
  if (next.length === servers.length) return false;
  await saveServers(next);
  const { oauthDir } = ensureMcpStore();
  const oauthFile = path.join(oauthDir, `${id}.json`);
  if (fsSync.existsSync(oauthFile)) await fs.rm(oauthFile, { force: true });
  return true;
}

/**
 * Accepts either a bare server config ({ command, args, env }) or a wrapper
 * object ({ mcpServers: { "<name>": { command, ... } } }).
 */
export function normalizeLocalConfig(raw: unknown): LocalMcpConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('mcpconfig_json must be a non-empty object.');
  }
  let candidate: any = raw;
  const wrapper = (raw as any).mcpServers;
  if (wrapper && typeof wrapper === 'object' && !Array.isArray(wrapper)) {
    const entries = Object.values(wrapper);
    if (entries.length === 0) throw new Error('mcpServers must contain at least one server.');
    candidate = entries[0];
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('MCP configuration must contain a server configuration object.');
  }
  const command = candidate.command;
  if (typeof command !== 'string' || !command.trim()) {
    throw new Error('MCP configuration must include a non-empty "command" string.');
  }
  if (candidate.args !== undefined && !Array.isArray(candidate.args)) {
    throw new Error('"args" must be an array of strings.');
  }
  if (candidate.env !== undefined) {
    if (!candidate.env || typeof candidate.env !== 'object' || Array.isArray(candidate.env)) {
      throw new Error('"env" must be an object of string values.');
    }
  }
  return {
    command: command.trim(),
    args: Array.isArray(candidate.args) ? candidate.args.map(String) : undefined,
    env: candidate.env
      ? Object.fromEntries(
          Object.entries(candidate.env).map(([k, v]) => [k, String(v)])
        )
      : undefined,
    cwd: typeof candidate.cwd === 'string' ? candidate.cwd : undefined,
  };
}
