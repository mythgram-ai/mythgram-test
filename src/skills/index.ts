import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../datadir/index.js';

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  folder_path: string;
  skill_md_path: string;
  subfolders: string[];
  files: string[];
  created_at: number;
  updated_at: number;
}

export interface DefaultSkillSeed {
  name: string;
  description: string;
  skillMdContent: string;
  subfolders: Record<string, Record<string, string>>;
}

export const DEFAULT_SKILLS: DefaultSkillSeed[] = [
  {
    name: 'fullstack-web-architect',
    description:
      'Comprehensive skill for designing, building, testing, and verifying modern full-stack TypeScript, React, Hono, and SQLite applications.',
    skillMdContent: `# Fullstack Web Architect Skill

## Overview
Use this skill whenever the user asks to architect, build, refactor, or debug a full-stack web application.

## Workflow
1. **Inspect Project Structure**: Use \`file_list\` or \`read_directory\` to understand package dependencies and directory layout.
2. **Database & API Layer**: Design clean, typed schemas and REST/SSE endpoints with proper error handling and validation.
3. **Frontend Architecture**: Build responsive, accessible components with lazy loading (\`React.lazy\`) for fast page load times.
4. **Verification**: Run \`tsc --noEmit\` and test endpoints before completing the task.

## References
- Read \`references/architecture-checklist.md\` for API and UI standards.
`,
    subfolders: {
      references: {
        'architecture-checklist.md': `# Fullstack Architecture Checklist
- Always validate inputs with Zod schemas.
- Use lazy loading for page routes to keep bundle initial load fast.
- Ensure SQLite WAL mode is enabled for high concurrency.
`,
      },
      templates: {
        'api-route.ts.txt': `// Standard Hono API Route Template
app.get('/api/resource', async (c) => {
  return c.json({ ok: true, items: [] });
});
`,
      },
    },
  },
  {
    name: 'automated-code-auditor',
    description:
      'Systematic code quality, security, and bug auditing skill using AST search, grep patterns, and automated verification.',
    skillMdContent: `# Automated Code Auditor Skill

## Overview
Use this skill when performing code reviews, security audits, bug hunting, or performance optimization across a repository.

## Workflow
1. **Surface Scan**: Use \`glob\` and \`grep\` to locate entry points, configuration files, and sensitive operations.
2. **Structural Search**: Use \`astgrep\` to inspect function signatures, error handling blocks, and async patterns.
3. **Security & Edge Cases**: Check path normalization, input validation, and resource cleanup.
4. **Report Generation**: Summarize findings by severity (Critical, High, Medium, Low) with exact file paths and line numbers.

## References
- Read \`references/audit-rules.md\` for common security and reliability checks.
`,
    subfolders: {
      references: {
        'audit-rules.md': `# Code Audit Rules
1. Verify all file system paths are validated and normalized.
2. Check that long-running operations support AbortSignal cancellation.
3. Ensure JSON files and directories recover gracefully if deleted.
`,
      },
    },
  },
];

async function collectDirInfo(dirPath: string): Promise<{ subfolders: string[]; files: string[] }> {
  const subfolders: string[] = [];
  const files: string[] = [];

  async function walk(current: string, relPrefix: string) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        subfolders.push(rel);
        await walk(full, rel);
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  }

  await walk(dirPath, '');
  return { subfolders, files };
}

/**
 * Ensures `.mythgram/skills` and `.mythgram/skills/skills.json` exist and seeds the 2 default skills if missing.
 */
export async function ensureSkillsStore(): Promise<{
  skillsDir: string;
  skillsJsonPath: string;
}> {
  const paths = getDataDir();
  if (!fsSync.existsSync(paths.skillsDir)) {
    await fs.mkdir(paths.skillsDir, { recursive: true });
  }
  if (!fsSync.existsSync(paths.skillsJsonPath)) {
    await fs.writeFile(paths.skillsJsonPath, '[]\n', 'utf-8');
  }

  let list: SkillEntry[] = [];
  try {
    const raw = await fs.readFile(paths.skillsJsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    list = [];
  }

  let changed = false;
  for (const seed of DEFAULT_SKILLS) {
    const skillFolder = path.join(paths.skillsDir, seed.name);
    const skillMdPath = path.join(skillFolder, 'SKILL.md');

    if (!fsSync.existsSync(skillMdPath)) {
      await fs.mkdir(skillFolder, { recursive: true });
      await fs.writeFile(skillMdPath, seed.skillMdContent, 'utf-8');
      for (const [subName, subFiles] of Object.entries(seed.subfolders)) {
        const subDir = path.join(skillFolder, subName);
        await fs.mkdir(subDir, { recursive: true });
        for (const [fileName, fileContent] of Object.entries(subFiles)) {
          await fs.writeFile(path.join(subDir, fileName), fileContent, 'utf-8');
        }
      }
    }

    const existingIdx = list.findIndex((s) => s.name === seed.name);
    const info = await collectDirInfo(skillFolder);
    const now = Date.now();
    if (existingIdx === -1) {
      list.push({
        id: `skill_${seed.name}`,
        name: seed.name,
        description: seed.description,
        is_default: true,
        folder_path: skillFolder,
        skill_md_path: skillMdPath,
        subfolders: info.subfolders,
        files: info.files,
        created_at: now,
        updated_at: now,
      });
      changed = true;
    } else {
      list[existingIdx].folder_path = skillFolder;
      list[existingIdx].skill_md_path = skillMdPath;
      list[existingIdx].subfolders = info.subfolders;
      list[existingIdx].files = info.files;
    }
  }

  if (changed) {
    await fs.writeFile(paths.skillsJsonPath, JSON.stringify(list, null, 2) + '\n', 'utf-8');
  }

  return {
    skillsDir: paths.skillsDir,
    skillsJsonPath: paths.skillsJsonPath,
  };
}

export async function listSkills(): Promise<SkillEntry[]> {
  const { skillsDir, skillsJsonPath } = await ensureSkillsStore();
  let list: SkillEntry[] = [];
  try {
    const raw = await fs.readFile(skillsJsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    list = [];
  }

  // Sync directory info for all skills on disk
  for (const item of list) {
    const folder = item.folder_path || path.join(skillsDir, item.name);
    item.folder_path = folder;
    item.skill_md_path = path.join(folder, 'SKILL.md');
    if (fsSync.existsSync(folder)) {
      const info = await collectDirInfo(folder);
      item.subfolders = info.subfolders;
      item.files = info.files;
    }
  }
  return list;
}

async function copyDirectoryRecursive(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Used by the `create_skill` native tool: copies a completed skill directory from `source_path`
 * into `.mythgram/skills/<name>` and records it in `.mythgram/skills/skills.json`.
 */
export async function createSkillFromDirectory(params: {
  name: string;
  description: string;
  sourcePath: string;
}): Promise<SkillEntry> {
  const { skillsDir, skillsJsonPath } = await ensureSkillsStore();
  const cleanName = params.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!cleanName) {
    throw new Error('Invalid skill name.');
  }

  const absSource = path.resolve(params.sourcePath);
  let stat;
  try {
    stat = await fs.stat(absSource);
  } catch {
    throw new Error(`Skill source_path does not exist: ${absSource}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Skill source_path must be a directory: ${absSource}`);
  }

  const sourceSkillMd = path.join(absSource, 'SKILL.md');
  if (!fsSync.existsSync(sourceSkillMd)) {
    throw new Error(`SKILL.md not found inside source_path: ${absSource}`);
  }

  const targetFolder = path.join(skillsDir, cleanName);
  if ( path.resolve(absSource) !== path.resolve(targetFolder) ) {
    await fs.rm(targetFolder, { recursive: true, force: true });
    await copyDirectoryRecursive(absSource, targetFolder);
  }

  const skillMdPath = path.join(targetFolder, 'SKILL.md');
  const info = await collectDirInfo(targetFolder);
  const list = await listSkills();
  const now = Date.now();

  const existingIdx = list.findIndex((s) => s.name === cleanName);
  const entry: SkillEntry = {
    id: `skill_${cleanName}`,
    name: cleanName,
    description: params.description.trim(),
    is_default: existingIdx !== -1 ? list[existingIdx].is_default : false,
    folder_path: targetFolder,
    skill_md_path: skillMdPath,
    subfolders: info.subfolders,
    files: info.files,
    created_at: existingIdx !== -1 ? list[existingIdx].created_at : now,
    updated_at: now,
  };

  if (existingIdx !== -1) {
    list[existingIdx] = entry;
  } else {
    list.push(entry);
  }

  await fs.writeFile(skillsJsonPath, JSON.stringify(list, null, 2) + '\n', 'utf-8');
  return entry;
}

/**
 * Used by the Skills Page UI for manual creation / editing of a skill with SKILL.md and subfolders/files.
 */
export async function createOrUpdateManualSkill(params: {
  name: string;
  description: string;
  skillMdContent: string;
  subfolders?: string[];
  extraFiles?: { relativePath: string; content: string }[];
}): Promise<SkillEntry> {
  const { skillsDir, skillsJsonPath } = await ensureSkillsStore();
  const cleanName = params.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!cleanName) {
    throw new Error('Skill name is required (lowercase letters, digits, hyphens).');
  }

  const targetFolder = path.join(skillsDir, cleanName);
  await fs.mkdir(targetFolder, { recursive: true });

  const skillMdPath = path.join(targetFolder, 'SKILL.md');
  await fs.writeFile(skillMdPath, params.skillMdContent || `# ${cleanName}\n`, 'utf-8');

  if (Array.isArray(params.subfolders)) {
    for (const sub of params.subfolders) {
      const safeSub = sub.replace(/^(\.\.(\/|\\|$))+/, '').trim();
      if (safeSub) {
        await fs.mkdir(path.join(targetFolder, safeSub), { recursive: true });
      }
    }
  }

  if (Array.isArray(params.extraFiles)) {
    for (const f of params.extraFiles) {
      const safeRel = f.relativePath.replace(/^(\.\.(\/|\\|$))+/, '').trim();
      if (safeRel) {
        const fullPath = path.join(targetFolder, safeRel);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, f.content || '', 'utf-8');
      }
    }
  }

  const info = await collectDirInfo(targetFolder);
  const list = await listSkills();
  const now = Date.now();
  const existingIdx = list.findIndex((s) => s.name === cleanName);

  const entry: SkillEntry = {
    id: `skill_${cleanName}`,
    name: cleanName,
    description: params.description.trim(),
    is_default: existingIdx !== -1 ? list[existingIdx].is_default : false,
    folder_path: targetFolder,
    skill_md_path: skillMdPath,
    subfolders: info.subfolders,
    files: info.files,
    created_at: existingIdx !== -1 ? list[existingIdx].created_at : now,
    updated_at: now,
  };

  if (existingIdx !== -1) {
    list[existingIdx] = entry;
  } else {
    list.push(entry);
  }

  await fs.writeFile(skillsJsonPath, JSON.stringify(list, null, 2) + '\n', 'utf-8');
  return entry;
}

export async function getSkillDetail(name: string): Promise<{
  skill: SkillEntry;
  skillMdContent: string;
} | null> {
  const list = await listSkills();
  const found = list.find((s) => s.name === name || s.id === name);
  if (!found) return null;

  let skillMdContent = '';
  try {
    skillMdContent = await fs.readFile(found.skill_md_path, 'utf-8');
  } catch {
    skillMdContent = '';
  }

  return {
    skill: found,
    skillMdContent,
  };
}

export async function deleteSkill(name: string): Promise<boolean> {
  const { skillsDir, skillsJsonPath } = await ensureSkillsStore();
  const list = await listSkills();
  const idx = list.findIndex((s) => s.name === name || s.id === name);
  if (idx === -1) return false;

  const [removed] = list.splice(idx, 1);
  await fs.writeFile(skillsJsonPath, JSON.stringify(list, null, 2) + '\n', 'utf-8');

  const folder = removed.folder_path || path.join(skillsDir, removed.name);
  try {
    await fs.rm(folder, { recursive: true, force: true });
  } catch {
    // ignore
  }
  return true;
}
