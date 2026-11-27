import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import archiver from 'archiver';
import extractZip from 'extract-zip';
import fg from 'fast-glob';
import { getDataDir } from '../datadir/index.js';

export interface CheckpointEntry {
  id: string;
  name: string;
  description: string;
  /** Zip filename relative to `.mythgram/checkpoints`. */
  file: string;
  file_path: string;
  /** Workspace the checkpoint was taken from. */
  workspace: string;
  files_count: number;
  size_bytes: number;
  created_at: number;
  updated_at: number;
}

export interface CheckpointBackup {
  file: string;
  file_path: string;
  size_bytes: number;
  created_at: number;
}

export interface RestoreResult {
  success: true;
  workspace: string;
  checkpoint: CheckpointEntry;
  backup_path: string | null;
  restored_files: number;
  message: string;
}

export interface RestoreBackupResult {
  success: true;
  workspace: string;
  backup_file: string;
  safety_backup_path: string | null;
  restored_files: number;
  message: string;
}

/** The Mythgram data directory is never part of a workspace checkpoint. */
const DATA_DIR_NAME = '.mythgram';

function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sanitizeName(input: string): string {
  const cleaned = input
    .trim()
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned || `checkpoint-${nowStamp()}`;
}

async function readIndex(jsonPath: string): Promise<CheckpointEntry[]> {
  try {
    const raw = await fsp.readFile(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(jsonPath: string, entries: CheckpointEntry[]): Promise<void> {
  await fsp.writeFile(jsonPath, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
}

async function listWorkspaceFiles(workspace: string): Promise<string[]> {
  return fg('**/*', {
    cwd: workspace,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: [`${DATA_DIR_NAME}/**`],
  });
}

/**
 * Ensures `.mythgram/checkpoints` and its `backup` folder exist, and rebuilds the index
 * from zip files found on disk when the index file is missing or stale.
 */
export async function ensureCheckpointStore(): Promise<CheckpointEntry[]> {
  const paths = getDataDir();
  await fsp.mkdir(paths.checkpointsDir, { recursive: true });
  await fsp.mkdir(paths.checkpointsBackupDir, { recursive: true });
  if (!fs.existsSync(paths.checkpointsJsonPath)) {
    await fsp.writeFile(paths.checkpointsJsonPath, '[]\n', 'utf-8');
  }

  const stored = await readIndex(paths.checkpointsJsonPath);
  const entries = stored.filter((entry) => {
    entry.file_path = path.join(paths.checkpointsDir, entry.file);
    return fs.existsSync(entry.file_path);
  });

  let diskFiles: string[] = [];
  try {
    diskFiles = await fsp.readdir(paths.checkpointsDir);
  } catch {
    diskFiles = [];
  }
  const known = new Set(entries.map((entry) => entry.file.toLowerCase()));
  for (const file of diskFiles) {
    if (!file.toLowerCase().endsWith('.zip') || known.has(file.toLowerCase())) continue;
    const filePath = path.join(paths.checkpointsDir, file);
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat) continue;
    entries.push({
      id: `cp_${Math.round(stat.birthtimeMs || stat.mtimeMs || Date.now())}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      name: file.replace(/\.zip$/i, ''),
      description: 'Recovered checkpoint found on disk.',
      file,
      file_path: filePath,
      workspace: '',
      files_count: 0,
      size_bytes: stat.size,
      created_at: stat.birthtimeMs || stat.mtimeMs || Date.now(),
      updated_at: stat.mtimeMs || Date.now(),
    });
  }

  const changed =
    entries.length !== stored.length ||
    entries.some((entry, index) => entry.id !== stored[index]?.id);
  if (changed) {
    await writeIndex(paths.checkpointsJsonPath, entries);
  }

  return entries;
}

export async function listCheckpoints(limit?: number): Promise<CheckpointEntry[]> {
  const entries = await ensureCheckpointStore();
  const sorted = [...entries].sort((a, b) => b.created_at - a.created_at);
  return typeof limit === 'number' && limit > 0 ? sorted.slice(0, limit) : sorted;
}

export async function getCheckpoint(idOrName: string): Promise<CheckpointEntry | null> {
  const entries = await ensureCheckpointStore();
  const needle = idOrName.trim().toLowerCase();
  return (
    entries.find((entry) => entry.id.toLowerCase() === needle) ||
    entries.find((entry) => entry.name.toLowerCase() === needle) ||
    entries.find((entry) => entry.file.toLowerCase() === needle) ||
    entries.find((entry) => entry.file_path.toLowerCase() === needle) ||
    null
  );
}

/**
 * Creates a zip of the workspace at `outputPath`, excluding the `.mythgram` data directory.
 */
async function zipWorkspace(
  workspace: string,
  outputPath: string
): Promise<{ files_count: number; size_bytes: number }> {
  const files = await listWorkspaceFiles(workspace);
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('warning', (err) => {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') reject(err);
    });
    archive.on('error', reject);

    archive.pipe(output);
    for (const rel of files) {
      archive.file(path.join(workspace, rel), { name: rel });
    }
    void archive.finalize();
  });

  const stat = await fsp.stat(outputPath);
  return { files_count: files.length, size_bytes: stat.size };
}

async function uniqueFileName(dir: string, baseName: string): Promise<string> {
  const safeBase = sanitizeName(baseName);
  let candidate = `${safeBase}.zip`;
  let counter = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${safeBase}-${counter}.zip`;
    counter += 1;
  }
  return candidate;
}

export async function createCheckpoint(params: {
  workspace: string;
  name?: string;
  description?: string;
}): Promise<CheckpointEntry> {
  const workspace = path.resolve(params.workspace);
  const stat = await fsp.stat(workspace).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Workspace "${workspace}" does not exist or is not a directory.`);
  }

  const entries = await ensureCheckpointStore();
  const paths = getDataDir();

  const name = (params.name || `checkpoint-${nowStamp()}`).trim();
  if (!name) throw new Error('Checkpoint name is required.');
  if (entries.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`A checkpoint named "${name}" already exists.`);
  }

  const file = await uniqueFileName(paths.checkpointsDir, name);
  const filePath = path.join(paths.checkpointsDir, file);

  let zipInfo: { files_count: number; size_bytes: number };
  try {
    zipInfo = await zipWorkspace(workspace, filePath);
  } catch (err) {
    await fsp.rm(filePath, { force: true }).catch(() => {});
    throw err;
  }

  const now = Date.now();
  const entry: CheckpointEntry = {
    id: `cp_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: (params.description || '').trim(),
    file,
    file_path: filePath,
    workspace,
    files_count: zipInfo.files_count,
    size_bytes: zipInfo.size_bytes,
    created_at: now,
    updated_at: now,
  };

  entries.unshift(entry);
  await writeIndex(paths.checkpointsJsonPath, entries);
  return entry;
}

export async function updateCheckpoint(
  idOrName: string,
  patch: { name?: string; description?: string }
): Promise<CheckpointEntry | null> {
  const entries = await ensureCheckpointStore();
  const paths = getDataDir();
  const needle = idOrName.trim().toLowerCase();
  const entry = entries.find(
    (item) =>
      item.id.toLowerCase() === needle ||
      item.name.toLowerCase() === needle ||
      item.file.toLowerCase() === needle
  );
  if (!entry) return null;

  if (patch.name !== undefined) {
    const nextName = patch.name.trim();
    if (!nextName) throw new Error('Checkpoint name cannot be empty.');
    const duplicate = entries.some(
      (item) => item.id !== entry.id && item.name.toLowerCase() === nextName.toLowerCase()
    );
    if (duplicate) throw new Error(`A checkpoint named "${nextName}" already exists.`);
    entry.name = nextName;
  }
  if (patch.description !== undefined) entry.description = patch.description.trim();
  entry.updated_at = Date.now();

  await writeIndex(paths.checkpointsJsonPath, entries);
  return entry;
}

export async function deleteCheckpoint(idOrName: string): Promise<boolean> {
  const entries = await ensureCheckpointStore();
  const paths = getDataDir();
  const needle = idOrName.trim().toLowerCase();
  const entry = entries.find(
    (item) =>
      item.id.toLowerCase() === needle ||
      item.name.toLowerCase() === needle ||
      item.file.toLowerCase() === needle
  );
  if (!entry) return false;

  const next = entries.filter((item) => item.id !== entry.id);
  await fsp.rm(path.join(paths.checkpointsDir, entry.file), { force: true }).catch(() => {});
  await writeIndex(paths.checkpointsJsonPath, next);
  return true;
}

/**
 * Restores a checkpoint into the workspace. The workspace is zipped to
 * `.mythgram/checkpoints/backup` before extraction, so the restore is reversible.
 */
export async function restoreCheckpoint(params: {
  workspace: string;
  checkpointId: string;
  createBackup?: boolean;
}): Promise<RestoreResult> {
  const workspace = path.resolve(params.workspace);
  const stat = await fsp.stat(workspace).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Workspace "${workspace}" does not exist or is not a directory.`);
  }

  const entry = await getCheckpoint(params.checkpointId);
  if (!entry) {
    throw new Error(`Checkpoint "${params.checkpointId}" was not found.`);
  }
  await fsp.access(entry.file_path);

  const paths = getDataDir();
  await fsp.mkdir(paths.checkpointsBackupDir, { recursive: true });

  let backupPath: string | null = null;
  if (params.createBackup !== false) {
    backupPath = path.join(paths.checkpointsBackupDir, `backup-${nowStamp()}.zip`);
    await zipWorkspace(workspace, backupPath);
  }

  await extractZip(entry.file_path, { dir: workspace });

  const message = backupPath
    ? `Checkpoint "${entry.name}" was restored into workspace "${workspace}". The previous workspace state was backed up to "${backupPath}".`
    : `Checkpoint "${entry.name}" was restored into workspace "${workspace}". No backup was created.`;

  return {
    success: true,
    workspace,
    checkpoint: entry,
    backup_path: backupPath,
    restored_files: entry.files_count,
    message,
  };
}

export async function listBackups(): Promise<CheckpointBackup[]> {
  const paths = getDataDir();
  await fsp.mkdir(paths.checkpointsBackupDir, { recursive: true });
  let files: string[] = [];
  try {
    files = await fsp.readdir(paths.checkpointsBackupDir);
  } catch {
    files = [];
  }

  const backups: CheckpointBackup[] = [];
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.zip')) continue;
    const filePath = path.join(paths.checkpointsBackupDir, file);
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat) continue;
    backups.push({
      file,
      file_path: filePath,
      size_bytes: stat.size,
      created_at: stat.birthtimeMs || stat.mtimeMs || Date.now(),
    });
  }
  return backups.sort((a, b) => b.created_at - a.created_at);
}

function resolveBackupPath(fileName: string): string {
  const base = path.basename(fileName.trim());
  if (!base || base !== fileName.trim()) {
    throw new Error('Invalid backup file name.');
  }
  const paths = getDataDir();
  const filePath = path.join(paths.checkpointsBackupDir, base);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup "${base}" was not found.`);
  }
  return filePath;
}

export async function deleteBackup(fileName: string): Promise<boolean> {
  const filePath = resolveBackupPath(fileName);
  await fsp.rm(filePath, { force: true });
  return true;
}

/**
 * Restores a workspace backup. The current workspace is backed up first so this action
 * can also be reversed.
 */
export async function restoreBackup(params: {
  workspace: string;
  backupFile: string;
}): Promise<RestoreBackupResult> {
  const workspace = path.resolve(params.workspace);
  const stat = await fsp.stat(workspace).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Workspace "${workspace}" does not exist or is not a directory.`);
  }

  const backupPath = resolveBackupPath(params.backupFile);
  const paths = getDataDir();
  const safetyBackupPath = path.join(
    paths.checkpointsBackupDir,
    `backup-before-restore-${nowStamp()}.zip`
  );
  await zipWorkspace(workspace, safetyBackupPath);
  await extractZip(backupPath, { dir: workspace });
  const restoredFiles = (await listWorkspaceFiles(workspace)).length;

  return {
    success: true,
    workspace,
    backup_file: path.basename(backupPath),
    safety_backup_path: safetyBackupPath,
    restored_files: restoredFiles,
    message: `Backup "${path.basename(backupPath)}" was restored into workspace "${workspace}". The previous workspace state was backed up to "${safetyBackupPath}".`,
  };
}
