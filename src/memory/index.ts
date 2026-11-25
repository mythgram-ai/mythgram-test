import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../datadir/index.js';

export interface MemoryEntry {
  id: string;
  name: string;
  /** Filename relative to `.mythgram/memory`, e.g. `MEMORY.md`. */
  file: string;
  file_path: string;
  description: string;
  is_default: boolean;
  /** When false the file content is not injected on the first request; only a notice is sent. */
  send_on_request: boolean;
  created_at: number;
  updated_at: number;
}

interface DefaultMemorySeed {
  file: string;
  name: string;
  description: string;
  content: string;
}

export const DEFAULT_MEMORY_FILES: DefaultMemorySeed[] = [
  {
    file: 'MEMORY.md',
    name: 'Memory',
    description:
      'Durable, self-curated knowledge about the user, their projects, decisions, and lessons learned.',
    content: `# MEMORY

Long-term memory curated by the agent. Keep it short, factual, and high-signal.

## Projects
<!-- Project name, absolute path, stack, conventions, and current state. -->

## Decisions & Lessons
<!-- Decisions that still matter and mistakes that must not be repeated. -->

## Environment
<!-- Installed tooling, ports, credential locations (never the secret itself), quirks. -->

## Open Loops
<!-- Unfinished work the user cares about, with the next concrete step. -->
`,
  },
  {
    file: 'USER.md',
    name: 'User',
    description:
      'Stable profile of the user: identity, preferences, communication style, and working agreements.',
    content: `# USER

## Profile
<!-- Name, role, timezone, languages. -->

## Preferences
<!-- Communication style, verbosity, formatting, tooling preferences. -->

## Working Agreements
<!-- How the user wants the agent to plan, verify, and report work. -->
`,
  },
  {
    file: 'SOUL.md',
    name: 'Soul',
    description:
      'The agent identity and operating principles that should stay stable across sessions.',
    content: `# SOUL

## Identity
Mythgram is an autonomous, general-purpose engineering and operations agent running on the user's machine.

## Principles
1. Verify before claiming completion.
2. Prefer minimal, focused changes that follow existing project structure.
3. Keep the user informed with concrete evidence, not narration.
4. Never repeat a mistake that is already recorded in MEMORY.md.
5. Ask only when a genuine blocker requires user input.

## Voice
Direct, technical, and concise. No filler.
`,
  },
  {
    file: 'TEMP-MEMORY.md',
    name: 'Temp Memory',
    description:
      'Short-lived working notes for the current task. Prune it once the work is finished.',
    content: `# TEMP-MEMORY

Scratchpad for the task in progress. Delete stale lines instead of appending forever.

## Current Task
<!-- What is being worked on right now. -->

## Next Steps
<!-- Ordered next actions. -->
`,
  },
];

function defaultEntryId(file: string): string {
  return `mem_${file.replace(/\.md$/i, '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
}

function defaultEntry(seed: DefaultMemorySeed, memoryDir: string, now: number): MemoryEntry {
  return {
    id: defaultEntryId(seed.file),
    name: seed.name,
    file: seed.file,
    file_path: path.join(memoryDir, seed.file),
    description: seed.description,
    is_default: true,
    send_on_request: true,
    created_at: now,
    updated_at: now,
  };
}

async function readEntriesJson(jsonPath: string): Promise<MemoryEntry[]> {
  try {
    const raw = await fs.readFile(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeEntriesJson(jsonPath: string, entries: MemoryEntry[]): Promise<void> {
  await fs.writeFile(jsonPath, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
}

function sanitizeFileName(input: string): string {
  const base = path
    .basename(input.trim())
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (!base) return 'memory.md';
  return /\.md$/i.test(base) ? base : `${base}.md`;
}

/**
 * Ensures `.mythgram/memory` exists, seeds the four default memory files, and restores any
 * default or custom file deleted from disk without losing its recorded index entry.
 */
export async function ensureMemoryStore(): Promise<{
  memoryDir: string;
  memoryJsonPath: string;
}> {
  const paths = getDataDir();
  if (!fsSync.existsSync(paths.memoryDir)) {
    await fs.mkdir(paths.memoryDir, { recursive: true });
  }
  if (!fsSync.existsSync(paths.memoryJsonPath)) {
    await fs.writeFile(paths.memoryJsonPath, '[]\n', 'utf-8');
  }

  const entries = await readEntriesJson(paths.memoryJsonPath);
  const now = Date.now();
  let changed = false;

  for (const seed of DEFAULT_MEMORY_FILES) {
    const filePath = path.join(paths.memoryDir, seed.file);
    if (!fsSync.existsSync(filePath)) {
      await fs.writeFile(filePath, seed.content, 'utf-8');
    }
    const idx = entries.findIndex((e) => e.file === seed.file || e.id === defaultEntryId(seed.file));
    if (idx === -1) {
      entries.push(defaultEntry(seed, paths.memoryDir, now));
      changed = true;
    } else {
      const entry = entries[idx];
      entry.is_default = true;
      entry.file = seed.file;
      entry.file_path = filePath;
      if (!entry.description) entry.description = seed.description;
      if (typeof entry.send_on_request !== 'boolean') entry.send_on_request = true;
    }
  }

  // Adopt memory files that exist on disk but are missing from the index, so a deleted
  // memory-entry.json can be rebuilt from the files themselves.
  try {
    const known = new Set(entries.map((entry) => entry.file.toLowerCase()));
    const dirEntries = await fs.readdir(paths.memoryDir, { withFileTypes: true });
    for (const item of dirEntries) {
      if (!item.isFile() || !/\.md$/i.test(item.name)) continue;
      if (known.has(item.name.toLowerCase())) continue;
      const filePath = path.join(paths.memoryDir, item.name);
      const stat = await fs.stat(filePath);
      entries.push({
        id: `mem_${now}_${Math.random().toString(36).slice(2, 8)}`,
        name: item.name.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim() || item.name,
        file: item.name,
        file_path: filePath,
        description: 'Recovered memory file found on disk.',
        is_default: false,
        send_on_request: true,
        created_at: stat.birthtimeMs || now,
        updated_at: stat.mtimeMs || now,
      });
      changed = true;
    }
  } catch {
    // ignore scan errors
  }

  for (const entry of entries) {
    const filePath = path.join(paths.memoryDir, entry.file);
    entry.file_path = filePath;
    if (!fsSync.existsSync(filePath)) {
      await fs.writeFile(
        filePath,
        `# ${entry.name}\n\n<!-- This memory file was restored after deletion. Rewrite it with what the agent should remember. -->\n`,
        'utf-8'
      );
    }
  }

  if (changed) {
    await writeEntriesJson(paths.memoryJsonPath, entries);
  }

  return { memoryDir: paths.memoryDir, memoryJsonPath: paths.memoryJsonPath };
}

export async function listMemoryEntries(): Promise<MemoryEntry[]> {
  const { memoryDir, memoryJsonPath } = await ensureMemoryStore();
  const entries = await readEntriesJson(memoryJsonPath);
  return entries.map((entry) => ({
    ...entry,
    file_path: path.join(memoryDir, entry.file),
  }));
}

function findEntry(entries: MemoryEntry[], idOrFile: string): MemoryEntry | undefined {
  const needle = idOrFile.trim();
  return (
    entries.find((e) => e.id === needle) ||
    entries.find((e) => e.file === needle) ||
    entries.find((e) => e.file.toLowerCase() === needle.toLowerCase()) ||
    entries.find((e) => e.name.toLowerCase() === needle.toLowerCase())
  );
}

export async function getMemoryEntry(idOrFile: string): Promise<{
  entry: MemoryEntry;
  content: string;
} | null> {
  const { memoryDir } = await ensureMemoryStore();
  const entries = await listMemoryEntries();
  const entry = findEntry(entries, idOrFile);
  if (!entry) return null;
  let content = '';
  try {
    content = await fs.readFile(path.join(memoryDir, entry.file), 'utf-8');
  } catch {
    content = '';
  }
  return { entry, content };
}

export async function createMemoryEntry(params: {
  name: string;
  description?: string;
  content?: string;
  send_on_request?: boolean;
  file?: string;
}): Promise<MemoryEntry> {
  const { memoryDir, memoryJsonPath } = await ensureMemoryStore();
  const entries = await readEntriesJson(memoryJsonPath);

  const name = params.name.trim();
  if (!name) throw new Error('Memory file name is required.');

  const file = sanitizeFileName(params.file || name);
  const reserved = DEFAULT_MEMORY_FILES.map((s) => s.file.toLowerCase());
  if (reserved.includes(file.toLowerCase())) {
    throw new Error(`"${file}" is a built-in memory file name.`);
  }
  if (entries.some((e) => e.file.toLowerCase() === file.toLowerCase())) {
    throw new Error(`A memory file named "${file}" already exists.`);
  }

  const filePath = path.join(memoryDir, file);
  const body = params.content?.trim()
    ? params.content
    : `# ${name}\n\n<!-- Store durable notes here. The agent can edit this file with file tools. -->\n`;
  await fs.writeFile(filePath, body, 'utf-8');

  const now = Date.now();
  const entry: MemoryEntry = {
    id: `mem_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    file,
    file_path: filePath,
    description: (params.description || '').trim(),
    is_default: false,
    send_on_request: params.send_on_request !== false,
    created_at: now,
    updated_at: now,
  };

  entries.push(entry);
  await writeEntriesJson(memoryJsonPath, entries);
  return entry;
}

export async function updateMemoryEntry(
  idOrFile: string,
  patch: {
    name?: string;
    description?: string;
    send_on_request?: boolean;
    content?: string;
  }
): Promise<MemoryEntry | null> {
  const { memoryDir, memoryJsonPath } = await ensureMemoryStore();
  const entries = await readEntriesJson(memoryJsonPath);
  const entry = findEntry(entries, idOrFile);
  if (!entry) return null;

  if (patch.name !== undefined && patch.name.trim()) entry.name = patch.name.trim();
  if (patch.description !== undefined) entry.description = patch.description.trim();
  if (patch.send_on_request !== undefined) entry.send_on_request = patch.send_on_request;
  if (patch.content !== undefined) {
    await fs.writeFile(path.join(memoryDir, entry.file), patch.content, 'utf-8');
  }
  entry.updated_at = Date.now();
  await writeEntriesJson(memoryJsonPath, entries);
  return entry;
}

export async function deleteMemoryEntry(idOrFile: string): Promise<boolean> {
  const { memoryDir, memoryJsonPath } = await ensureMemoryStore();
  const entries = await readEntriesJson(memoryJsonPath);
  const entry = findEntry(entries, idOrFile);
  if (!entry) return false;
  if (entry.is_default) {
    throw new Error(
      `"${entry.file}" is a built-in memory file and cannot be deleted. Clear its content instead.`
    );
  }

  const next = entries.filter((e) => e.id !== entry.id);
  await writeEntriesJson(memoryJsonPath, next);
  try {
    await fs.rm(path.join(memoryDir, entry.file), { force: true });
  } catch {
    // ignore
  }
  return true;
}

/**
 * Restores deleted default memory files and their index entries.
 */
export async function restoreDefaultMemoryFiles(): Promise<MemoryEntry[]> {
  const paths = getDataDir();
  for (const seed of DEFAULT_MEMORY_FILES) {
    const filePath = path.join(paths.memoryDir, seed.file);
    if (!fsSync.existsSync(filePath)) {
      await fs.writeFile(filePath, seed.content, 'utf-8');
    }
  }
  await ensureMemoryStore();
  return listMemoryEntries();
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_.\-/]+/g)
    .filter((t) => t.length > 1);
}

export interface MemorySearchMatch {
  file: string;
  file_path: string;
  line: number;
  text: string;
  score: number;
}

export async function searchMemory(
  query: string,
  limit: number = 30
): Promise<MemorySearchMatch[]> {
  const entries = await listMemoryEntries();
  const terms = tokenize(query);
  const phrase = query.trim().toLowerCase();
  if (terms.length === 0) return [];

  const matches: MemorySearchMatch[] = [];
  for (const entry of entries) {
    let content = '';
    try {
      content = await fs.readFile(entry.file_path, 'utf-8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const haystack = line.toLowerCase();
      let score = 0;
      if (phrase && haystack.includes(phrase)) score += 6;
      for (const term of terms) {
        if (haystack.includes(term)) score += 2;
      }
      if (score > 0) {
        if (entry.file.toLowerCase().includes(terms[0])) score += 1;
        matches.push({
          file: entry.file,
          file_path: entry.file_path,
          line: index + 1,
          text: line.trim(),
          score,
        });
      }
    });
  }

  return matches
    .filter((m) => m.text.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Memory is attached only to the first user request of a session: no assistant turn
 * has happened yet and at most one user message exists.
 */
export function isFirstUserRequest(messages: Array<{ role: string }>): boolean {
  const hasAssistantTurn = messages.some((message) => message.role === 'assistant');
  const userTurns = messages.filter((message) => message.role === 'user').length;
  return !hasAssistantTurn && userTurns <= 1;
}

/**
 * Builds the memory block appended to the system prompt on the first user request of a session.
 * Files with `send_on_request` enabled are inlined; the rest are announced so the agent can
 * pull them on demand with `memory_search` / `file_read`.
 */
export async function buildMemoryContext(): Promise<string> {
  const entries = await listMemoryEntries();
  if (entries.length === 0) return '';

  const inlined: string[] = [];
  const deferred: string[] = [];

  for (const entry of entries) {
    let content = '';
    try {
      content = (await fs.readFile(entry.file_path, 'utf-8')).trim();
    } catch {
      content = '';
    }
    if (entry.send_on_request) {
      if (!content) continue;
      inlined.push(`### ${entry.file} — ${entry.name}\nPath: ${entry.file_path}\n\n${content}`);
    } else {
      deferred.push(
        `- ${entry.file} — ${entry.name}${entry.description ? `: ${entry.description}` : ''} (path: ${entry.file_path})`
      );
    }
  }

  if (inlined.length === 0 && deferred.length === 0) return '';

  const parts = [
    '## Persistent Memory (.mythgram/memory)',
    'This is the memory you maintain across sessions. Treat it as authoritative context about the user and the work so far.',
  ];

  if (inlined.length > 0) {
    parts.push(inlined.join('\n\n---\n\n'));
  }

  if (deferred.length > 0) {
    parts.push(
      [
        'Additional custom memory files are available but were not inlined:',
        ...deferred,
        'Use `memory_search` or `file_read` on those paths when they may be relevant.',
      ].join('\n')
    );
  }

  return parts.join('\n\n');
}
