import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../datadir/index.js';

export interface SubAgentDefinition {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  tools: string[]; // Empty or ['*'] means all allowed sub-agent tools; otherwise specific allowed tools
  is_default: boolean;
  file?: string;
  file_path?: string;
  created_at: number;
  updated_at: number;
}

export const RESTRICTED_SUB_AGENT_TOOLS = new Set<string>([
  'create_sub_agent',
  'call_sub_agent',
  'list_sub_agents',
  'save_artifacts',
  'list_artifacts',
  'show_artifact_to_user',
  'attach_files',
  'ask_for_something',
  'ask_question_to_user',
  'embed_url',
  'present_slides',
  'submit_plan',
  'connect_remote_mcp',
  'list_available_application_connectors',
  'connect_applications_connectors',
]);

export const DEFAULT_ALLOWED_SUB_AGENT_TOOLS: string[] = [
  'file_write',
  'file_read',
  'file_list',
  'read_directory',
  'grep',
  'astgrep',
  'glob',
  'lsp',
  'str_replace',
  'apply_patch',
  'read_image',
  'scan_qr_code',
  'fetch_text_from_image',
  'archive_files',
  'extract_archive',
  'shall_tool',
  'wait',
  'read_todos',
  'todo_write',
  'create_skill',
  'list_skills',
  'manage_slides',
  'organize_slides',
  'list_available_mcp_servers',
  'connect_local_mcp_server',
];

export const DEFAULT_SUB_AGENTS: SubAgentDefinition[] = [
  {
    id: 'default_code-architect',
    name: 'code-architect',
    description:
      'Designs clean system architectures, modular file structures, data schemas, and API contracts for complex software engineering tasks.',
    system_prompt: `You are code-architect, a specialized sub-agent of Mythgram.
Your role is to analyze codebases, design scalable software architecture, define TypeScript interfaces/schemas, and produce well-structured implementation blueprints or scaffolding files.
Always use absolute paths when reading or writing files. Return a concise, clear final summary of your architectural work and any files created or modified.`,
    tools: DEFAULT_ALLOWED_SUB_AGENT_TOOLS,
    is_default: true,
    created_at: 1700000000000,
    updated_at: 1700000000000,
  },
  {
    id: 'default_frontend-specialist',
    name: 'frontend-specialist',
    description:
      'Builds responsive React components, CSS layouts, interactive UI states, and accessible user interfaces with fast load performance.',
    system_prompt: `You are frontend-specialist, a specialized sub-agent of Mythgram.
Your role is to implement, style, and optimize frontend UI components, pages, and stylesheets.
Ensure clean React hooks usage, responsive layouts, and zero TypeScript errors. Return only the final summary of components and files built or updated.`,
    tools: DEFAULT_ALLOWED_SUB_AGENT_TOOLS,
    is_default: true,
    created_at: 1700000000001,
    updated_at: 1700000000001,
  },
  {
    id: 'default_backend-engineer',
    name: 'backend-engineer',
    description:
      'Implements high-performance backend APIs, database queries, middleware, file system managers, and server-side services.',
    system_prompt: `You are backend-engineer, a specialized sub-agent of Mythgram.
Your role is to build and refine server routes, SQLite database queries, background workers, and native tool integrations.
Ensure high concurrency safety, proper input validation, and clean error handling. Return a concise final summary of your implementation.`,
    tools: DEFAULT_ALLOWED_SUB_AGENT_TOOLS,
    is_default: true,
    created_at: 1700000000002,
    updated_at: 1700000000002,
  },
  {
    id: 'default_bug-hunter',
    name: 'bug-hunter',
    description:
      'Investigates runtime errors, compiler failures, race conditions, and edge-case bugs, then applies surgical patches to fix them.',
    system_prompt: `You are bug-hunter, a specialized sub-agent of Mythgram.
Your role is to locate root causes of bugs using grep, astgrep, file_read, and shall_tool, and apply minimal, accurate fixes using str_replace or apply_patch.
Verify your fix compiles and passes checks before finishing. Return a clear summary of root cause and fix applied.`,
    tools: DEFAULT_ALLOWED_SUB_AGENT_TOOLS,
    is_default: true,
    created_at: 1700000000003,
    updated_at: 1700000000003,
  },
  {
    id: 'default_test-runner',
    name: 'test-runner',
    description:
      'Writes unit and integration tests, executes test suites, diagnoses failures, and verifies end-to-end functionality.',
    system_prompt: `You are test-runner, a specialized sub-agent of Mythgram.
Your role is to author automated tests, run test commands via shall_tool, inspect outputs, and verify that all features meet specifications.
Return a structured report of test results, pass/fail counts, and any issues discovered.`,
    tools: DEFAULT_ALLOWED_SUB_AGENT_TOOLS,
    is_default: true,
    created_at: 1700000000004,
    updated_at: 1700000000004,
  },
  {
    id: 'default_security-auditor',
    name: 'security-auditor',
    description:
      'Audits codebases for security vulnerabilities, injection risks, path traversal, secret exposure, and unsafe configurations.',
    system_prompt: `You are security-auditor, a specialized sub-agent of Mythgram.
Your role is to inspect source files, dependencies, and endpoints for security vulnerabilities and either remediate them or report actionable findings with exact file paths and line numbers.`,
    tools: DEFAULT_ALLOWED_SUB_AGENT_TOOLS,
    is_default: true,
    created_at: 1700000000005,
    updated_at: 1700000000005,
  },
  {
    id: 'default_docs-writer',
    name: 'docs-writer',
    description:
      'Creates comprehensive technical documentation, README files, API references, architecture guides, and user manuals.',
    system_prompt: `You are docs-writer, a specialized sub-agent of Mythgram.
Your role is to inspect the codebase and write clear, accurate, well-formatted Markdown documentation, READMEs, and technical guides. Return a summary of the documentation files created or updated.`,
    tools: DEFAULT_ALLOWED_SUB_AGENT_TOOLS,
    is_default: true,
    created_at: 1700000000006,
    updated_at: 1700000000006,
  },
  {
    id: 'default_data-analyst',
    name: 'data-analyst',
    description:
      'Processes, transforms, and analyzes CSV, JSON, SQLite, and log datasets to extract insights, statistics, and structured reports.',
    system_prompt: `You are data-analyst, a specialized sub-agent of Mythgram.
Your role is to inspect data files, write analysis scripts or queries, compute accurate metrics, and output clean reports or transformed datasets.`,
    tools: DEFAULT_ALLOWED_SUB_AGENT_TOOLS,
    is_default: true,
    created_at: 1700000000007,
    updated_at: 1700000000007,
  },
  {
    id: 'default_refactoring-expert',
    name: 'refactoring-expert',
    description:
      'Cleans up legacy code, eliminates duplication, improves TypeScript typing, optimizes performance, and enforces clean code patterns.',
    system_prompt: `You are refactoring-expert, a specialized sub-agent of Mythgram.
Your role is to refactor code for readability, maintainability, strict typing, and runtime efficiency without breaking existing behavior. Always verify builds after refactoring.`,
    tools: DEFAULT_ALLOWED_SUB_AGENT_TOOLS,
    is_default: true,
    created_at: 1700000000008,
    updated_at: 1700000000008,
  },
  {
    id: 'default_slide-designer',
    name: 'slide-designer',
    description:
      'Creates polished 16:9 HTML presentation slide files and organizes them into structured slide projects.',
    system_prompt: `You are slide-designer, a specialized sub-agent of Mythgram.
Your role is to design visually compelling, modern 1280x720 (16:9) HTML presentation slides using file_write and group them into slide projects using organize_slides and manage_slides.
Return the created slide project ID and a summary of each slide.`,
    tools: DEFAULT_ALLOWED_SUB_AGENT_TOOLS,
    is_default: true,
    created_at: 1700000000009,
    updated_at: 1700000000009,
  },
];

export function filterAllowedSubAgentTools(requestedTools?: string[]): string[] {
  if (!requestedTools || requestedTools.length === 0) {
    return [...DEFAULT_ALLOWED_SUB_AGENT_TOOLS];
  }
  const filtered = requestedTools.filter((t) => !RESTRICTED_SUB_AGENT_TOOLS.has(t));
  return filtered.length > 0 ? filtered : [...DEFAULT_ALLOWED_SUB_AGENT_TOOLS];
}

/**
 * Ensures `.mythgram/sub-agents` and `.mythgram/sub-agents/sub-agents.json` exist.
 * Recreates them safely if deleted.
 */
export async function ensureSubAgentsStore(): Promise<{
  subAgentsDir: string;
  subAgentsJsonPath: string;
  subAgentOutputsDir: string;
}> {
  const paths = getDataDir();
  if (!fsSync.existsSync(paths.subAgentsDir)) {
    await fs.mkdir(paths.subAgentsDir, { recursive: true });
  }
  if (!fsSync.existsSync(paths.subAgentOutputsDir)) {
    await fs.mkdir(paths.subAgentOutputsDir, { recursive: true });
  }
  if (!fsSync.existsSync(paths.subAgentsJsonPath)) {
    await fs.writeFile(paths.subAgentsJsonPath, '[]\n', 'utf-8');
  }
  return {
    subAgentsDir: paths.subAgentsDir,
    subAgentsJsonPath: paths.subAgentsJsonPath,
    subAgentOutputsDir: paths.subAgentOutputsDir,
  };
}

export async function readCustomSubAgentsJson(): Promise<SubAgentDefinition[]> {
  const { subAgentsJsonPath } = await ensureSubAgentsStore();
  try {
    const raw = await fs.readFile(subAgentsJsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      await fs.writeFile(subAgentsJsonPath, '[]\n', 'utf-8');
      return [];
    }
    return parsed.map((item: any) => ({
      ...item,
      tools: filterAllowedSubAgentTools(item.tools),
      is_default: false,
    }));
  } catch {
    await fs.writeFile(subAgentsJsonPath, '[]\n', 'utf-8');
    return [];
  }
}

export async function writeCustomSubAgentsJson(entries: SubAgentDefinition[]): Promise<void> {
  const { subAgentsJsonPath } = await ensureSubAgentsStore();
  const customOnly = entries.filter((e) => !e.is_default);
  await fs.writeFile(
    subAgentsJsonPath,
    JSON.stringify(customOnly, null, 2) + '\n',
    'utf-8'
  );
}

export async function listAllSubAgents(): Promise<SubAgentDefinition[]> {
  const custom = await readCustomSubAgentsJson();
  const customMap = new Map(custom.map((c) => [c.name, c]));
  const result: SubAgentDefinition[] = [...DEFAULT_SUB_AGENTS];
  for (const c of customMap.values()) {
    if (!DEFAULT_SUB_AGENTS.some((d) => d.name === c.name)) {
      result.push(c);
    }
  }
  return result;
}

export async function getSubAgentByName(name: string): Promise<SubAgentDefinition | null> {
  const clean = name.trim().toLowerCase();
  const all = await listAllSubAgents();
  return all.find((a) => a.name.toLowerCase() === clean || a.id === name) || null;
}

export async function createOrUpdateCustomSubAgent(params: {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[];
}): Promise<SubAgentDefinition> {
  const { subAgentsDir } = await ensureSubAgentsStore();
  const cleanName = params.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

  if (!cleanName) {
    throw new Error(
      'Sub-agent name must contain lowercase letters, digits, hyphens, or underscores.'
    );
  }

  if (DEFAULT_SUB_AGENTS.some((d) => d.name === cleanName)) {
    throw new Error(
      `Sub-agent "${cleanName}" is a built-in default sub-agent and cannot be overwritten.`
    );
  }

  const allowedTools = filterAllowedSubAgentTools(params.tools);
  const now = Date.now();
  const agentFileName = `${cleanName}.json`;
  const agentFilePath = path.join(subAgentsDir, agentFileName);

  const customList = await readCustomSubAgentsJson();
  const existingIdx = customList.findIndex((a) => a.name === cleanName);

  const entry: SubAgentDefinition = {
    id: existingIdx !== -1 ? customList[existingIdx].id : `subagent_${cleanName}_${now}`,
    name: cleanName,
    description: params.description.trim(),
    system_prompt: params.systemPrompt.trim(),
    tools: allowedTools,
    is_default: false,
    file: agentFileName,
    file_path: agentFilePath,
    created_at: existingIdx !== -1 ? customList[existingIdx].created_at : now,
    updated_at: now,
  };

  await fs.writeFile(agentFilePath, JSON.stringify(entry, null, 2) + '\n', 'utf-8');

  if (existingIdx !== -1) {
    customList[existingIdx] = entry;
  } else {
    customList.push(entry);
  }

  await writeCustomSubAgentsJson(customList);
  return entry;
}

export async function deleteCustomSubAgent(nameOrId: string): Promise<{
  deleted: boolean;
  reason?: string;
}> {
  const { subAgentsDir } = await ensureSubAgentsStore();
  const isDefault = DEFAULT_SUB_AGENTS.some(
    (d) => d.name === nameOrId || d.id === nameOrId
  );
  if (isDefault) {
    return {
      deleted: false,
      reason: 'Default pre-added sub-agents cannot be deleted.',
    };
  }

  const customList = await readCustomSubAgentsJson();
  const idx = customList.findIndex(
    (a) => a.name === nameOrId || a.id === nameOrId
  );
  if (idx === -1) {
    return { deleted: false, reason: 'Sub-agent not found.' };
  }

  const [removed] = customList.splice(idx, 1);
  await writeCustomSubAgentsJson(customList);

  const filePath = removed.file_path || path.join(subAgentsDir, `${removed.name}.json`);
  try {
    if (fsSync.existsSync(filePath)) {
      await fs.unlink(filePath);
    }
  } catch {
    // ignore
  }

  return { deleted: true };
}
