import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../datadir/index.js';
import { db } from '../db/index.js';

export const DEFAULT_CUSTOM_AGENT_LOGO = '/logo.svg';

const ACTIVE_CUSTOM_AGENT_SETTING = 'active_custom_agent_id';
const MAX_LOGO_BYTES = 4 * 1024 * 1024;

const LOGO_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

const EXTENSION_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

export interface CustomAgentDefinition {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  tools: string[]; // Empty means every tool of the main runtime is enabled
  logo: string; // Public URL used by the UI
  logo_file?: string; // Absolute path of the uploaded logo on disk
  created_at: number;
  updated_at: number;
}

export async function ensureCustomAgentsStore(): Promise<{
  customAgentsDir: string;
  customAgentsJsonPath: string;
  customAgentLogosDir: string;
}> {
  const paths = getDataDir();
  if (!fsSync.existsSync(paths.customAgentsDir)) {
    await fs.mkdir(paths.customAgentsDir, { recursive: true });
  }
  if (!fsSync.existsSync(paths.customAgentLogosDir)) {
    await fs.mkdir(paths.customAgentLogosDir, { recursive: true });
  }
  if (!fsSync.existsSync(paths.customAgentsJsonPath)) {
    await fs.writeFile(paths.customAgentsJsonPath, '[]\n', 'utf-8');
  }
  return {
    customAgentsDir: paths.customAgentsDir,
    customAgentsJsonPath: paths.customAgentsJsonPath,
    customAgentLogosDir: paths.customAgentLogosDir,
  };
}

function normalizeTools(tools?: string[]): string[] {
  if (!Array.isArray(tools)) return [];
  const seen = new Set<string>();
  for (const raw of tools) {
    const name = String(raw || '').trim();
    if (name) seen.add(name);
  }
  return Array.from(seen);
}

function normalizeEntry(raw: any): CustomAgentDefinition | null {
  if (!raw || typeof raw !== 'object' || !raw.id || !raw.name) return null;
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: String(raw.description || ''),
    system_prompt: String(raw.system_prompt || ''),
    tools: normalizeTools(raw.tools),
    logo: typeof raw.logo === 'string' && raw.logo ? raw.logo : DEFAULT_CUSTOM_AGENT_LOGO,
    logo_file: typeof raw.logo_file === 'string' ? raw.logo_file : undefined,
    created_at: Number(raw.created_at) || Date.now(),
    updated_at: Number(raw.updated_at) || Date.now(),
  };
}

export async function readCustomAgents(): Promise<CustomAgentDefinition[]> {
  const { customAgentsJsonPath } = await ensureCustomAgentsStore();
  try {
    const raw = await fs.readFile(customAgentsJsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      await fs.writeFile(customAgentsJsonPath, '[]\n', 'utf-8');
      return [];
    }
    return parsed
      .map(normalizeEntry)
      .filter((entry): entry is CustomAgentDefinition => entry !== null);
  } catch {
    await fs.writeFile(customAgentsJsonPath, '[]\n', 'utf-8');
    return [];
  }
}

async function writeCustomAgents(entries: CustomAgentDefinition[]): Promise<void> {
  const { customAgentsJsonPath } = await ensureCustomAgentsStore();
  await fs.writeFile(customAgentsJsonPath, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
}

export async function listCustomAgents(): Promise<CustomAgentDefinition[]> {
  const agents = await readCustomAgents();
  return agents.sort((a, b) => a.created_at - b.created_at);
}

export async function getCustomAgentById(idOrName: string): Promise<CustomAgentDefinition | null> {
  const clean = idOrName.trim().toLowerCase();
  if (!clean) return null;
  const agents = await readCustomAgents();
  return (
    agents.find((a) => a.id === idOrName) ||
    agents.find((a) => a.name.toLowerCase() === clean) ||
    null
  );
}

export function getActiveCustomAgentId(): string {
  return db.getSetting(ACTIVE_CUSTOM_AGENT_SETTING, '').trim();
}

export async function getActiveCustomAgent(): Promise<CustomAgentDefinition | null> {
  const activeId = getActiveCustomAgentId();
  if (!activeId) return null;
  const agent = await getCustomAgentById(activeId);
  if (!agent) {
    // The active agent was removed outside the API; fall back to the default agent.
    db.setSetting(ACTIVE_CUSTOM_AGENT_SETTING, '');
    return null;
  }
  return agent;
}

export async function setActiveCustomAgent(idOrNull: string | null): Promise<string | null> {
  if (!idOrNull) {
    db.setSetting(ACTIVE_CUSTOM_AGENT_SETTING, '');
    return null;
  }
  const agent = await getCustomAgentById(idOrNull);
  if (!agent) {
    throw new Error('Custom agent not found.');
  }
  db.setSetting(ACTIVE_CUSTOM_AGENT_SETTING, agent.id);
  return agent.id;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 48);
}

function parseLogoDataUrl(dataUrl: string): { buffer: Buffer; ext: string } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) {
    throw new Error('Invalid logo image. Upload a PNG, JPEG, WEBP, GIF, or SVG file.');
  }
  const mime = match[1].toLowerCase();
  const ext = LOGO_EXTENSIONS[mime];
  if (!ext) {
    throw new Error('Unsupported logo format. Use PNG, JPEG, WEBP, GIF, or SVG.');
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) {
    throw new Error('The uploaded logo file is empty.');
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new Error('Logo file is too large. Maximum size is 4 MB.');
  }
  return { buffer, ext };
}

async function removeLogoFile(filePath?: string): Promise<void> {
  if (!filePath) return;
  try {
    if (fsSync.existsSync(filePath)) {
      await fs.unlink(filePath);
    }
  } catch {
    // ignore
  }
}

export async function createOrUpdateCustomAgent(params: {
  id?: string;
  name: string;
  description?: string;
  systemPrompt: string;
  tools?: string[];
  logoDataUrl?: string;
  useDefaultLogo?: boolean;
}): Promise<CustomAgentDefinition> {
  const { customAgentLogosDir } = await ensureCustomAgentsStore();

  const name = params.name.trim();
  if (!name) {
    throw new Error('Custom agent name is required.');
  }
  if (name.length > 80) {
    throw new Error('Custom agent name must be 80 characters or fewer.');
  }
  const systemPrompt = params.systemPrompt.trim();
  if (!systemPrompt) {
    throw new Error('System prompt is required. Write one or upload a file.');
  }

  const agents = await readCustomAgents();
  const now = Date.now();

  let existing: CustomAgentDefinition | undefined;
  if (params.id) {
    existing = agents.find((a) => a.id === params.id);
    if (!existing) {
      throw new Error('Custom agent not found.');
    }
  } else {
    existing = agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
  }

  const id = existing?.id || `cagent_${slugify(name) || 'agent'}_${now}`;
  const previousLogoFile = existing?.logo_file;

  let logo = existing?.logo || DEFAULT_CUSTOM_AGENT_LOGO;
  let logoFile = existing?.logo_file;

  if (params.logoDataUrl) {
    const { buffer, ext } = parseLogoDataUrl(params.logoDataUrl);
    const fileName = `${id}.${ext}`;
    const filePath = path.join(customAgentLogosDir, fileName);
    await fs.writeFile(filePath, buffer);
    if (previousLogoFile && previousLogoFile !== filePath) {
      await removeLogoFile(previousLogoFile);
    }
    logoFile = filePath;
  } else if (params.useDefaultLogo) {
    await removeLogoFile(previousLogoFile);
    logoFile = undefined;
  }

  logo = logoFile
    ? `/api/custom-agents/${encodeURIComponent(id)}/logo?v=${now}`
    : DEFAULT_CUSTOM_AGENT_LOGO;

  const entry: CustomAgentDefinition = {
    id,
    name,
    description: String(params.description || '').trim(),
    system_prompt: systemPrompt,
    tools: normalizeTools(params.tools),
    logo,
    logo_file: logoFile,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  if (existing) {
    const idx = agents.findIndex((a) => a.id === existing!.id);
    agents[idx] = entry;
  } else {
    agents.push(entry);
  }

  await writeCustomAgents(agents);
  return entry;
}

export async function deleteCustomAgent(
  idOrName: string
): Promise<{ deleted: boolean; reason?: string }> {
  const agents = await readCustomAgents();
  const idx = agents.findIndex(
    (a) => a.id === idOrName || a.name.toLowerCase() === idOrName.trim().toLowerCase()
  );
  if (idx === -1) {
    return { deleted: false, reason: 'Custom agent not found.' };
  }

  const [removed] = agents.splice(idx, 1);
  await writeCustomAgents(agents);
  await removeLogoFile(removed.logo_file);

  if (getActiveCustomAgentId() === removed.id) {
    db.setSetting(ACTIVE_CUSTOM_AGENT_SETTING, '');
  }

  return { deleted: true };
}

export async function getCustomAgentLogo(
  id: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const agent = await getCustomAgentById(id);
  if (!agent || !agent.logo_file) return null;
  try {
    if (!fsSync.existsSync(agent.logo_file)) return null;
    const buffer = await fs.readFile(agent.logo_file);
    const ext = path.extname(agent.logo_file).replace('.', '').toLowerCase();
    return { buffer, contentType: EXTENSION_MIME[ext] || 'application/octet-stream' };
  } catch {
    return null;
  }
}
