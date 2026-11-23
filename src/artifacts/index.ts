import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDataDir } from '../datadir/index.js';

export type ArtifactType =
  | 'markdown'
  | 'code_file'
  | 'text'
  | 'html'
  | 'csv'
  | 'json'
  | 'docs'
  | 'design'
  | 'slides';

export interface ArtifactEntry {
  id: string;
  name: string;
  title: string;
  description: string;
  type: ArtifactType;
  file: string; // Stored filename in .mythgram/artifacts/
  file_path: string; // Absolute path inside .mythgram/artifacts/
  original_path?: string;
  session_id?: string;
  created_at: number;
  updated_at: number;
}

const DISALLOWED_MEDIA_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.tiff',
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',
  '.aac',
  '.m4a',
]);

/**
 * Ensures `.mythgram/artifacts` and `.mythgram/artifacts/artifacts.json` exist.
 * If deleted by user or agent, recreates them safely without crashing.
 */
export async function ensureArtifactsStore(): Promise<{
  artifactsDir: string;
  artifactsJsonPath: string;
}> {
  const paths = getDataDir();
  if (!fsSync.existsSync(paths.artifactsDir)) {
    await fs.mkdir(paths.artifactsDir, { recursive: true });
  }
  if (!fsSync.existsSync(paths.artifactsJsonPath)) {
    await fs.writeFile(paths.artifactsJsonPath, '[]\n', 'utf-8');
  }
  return {
    artifactsDir: paths.artifactsDir,
    artifactsJsonPath: paths.artifactsJsonPath,
  };
}

export async function readArtifactsJson(): Promise<ArtifactEntry[]> {
  const { artifactsJsonPath } = await ensureArtifactsStore();
  try {
    const raw = await fs.readFile(artifactsJsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      await fs.writeFile(artifactsJsonPath, '[]\n', 'utf-8');
      return [];
    }
    return parsed;
  } catch {
    await fs.writeFile(artifactsJsonPath, '[]\n', 'utf-8');
    return [];
  }
}

export async function writeArtifactsJson(entries: ArtifactEntry[]): Promise<void> {
  const { artifactsJsonPath } = await ensureArtifactsStore();
  await fs.writeFile(artifactsJsonPath, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
}

export async function saveArtifact(params: {
  artifactFilePath: string;
  title: string;
  description: string;
  type: ArtifactType;
  sessionId?: string;
}): Promise<ArtifactEntry> {
  const { artifactsDir } = await ensureArtifactsStore();
  const absSource = path.resolve(params.artifactFilePath);

  let stat;
  try {
    stat = await fs.stat(absSource);
  } catch {
    throw new Error(`Artifact source file does not exist: ${absSource}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Artifact source path is not a regular file: ${absSource}`);
  }

  const ext = path.extname(absSource).toLowerCase();
  if (DISALLOWED_MEDIA_EXTS.has(ext)) {
    throw new Error(
      `Media files (images, video, audio) cannot be saved as artifacts (extension "${ext}").`
    );
  }

  const id = `art_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const baseName = path.basename(absSource).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storedFileName = `${id}_${baseName}`;
  const destPath = path.join(artifactsDir, storedFileName);

  await fs.copyFile(absSource, destPath);

  const now = Date.now();
  const entry: ArtifactEntry = {
    id,
    name: params.title.trim(),
    title: params.title.trim(),
    description: params.description.trim(),
    type: params.type,
    file: storedFileName,
    file_path: destPath,
    original_path: absSource,
    session_id: params.sessionId,
    created_at: now,
    updated_at: now,
  };

  const list = await readArtifactsJson();
  list.unshift(entry);
  await writeArtifactsJson(list);

  return entry;
}

export async function listArtifacts(): Promise<ArtifactEntry[]> {
  const list = await readArtifactsJson();
  return list;
}

export async function getArtifactById(artifactId: string): Promise<{
  artifact: ArtifactEntry;
  content: string;
} | null> {
  const { artifactsDir } = await ensureArtifactsStore();
  const list = await readArtifactsJson();
  const found = list.find((a) => a.id === artifactId);
  if (!found) return null;

  const candidatePath = found.file_path || path.join(artifactsDir, found.file);
  let content = '';
  try {
    content = await fs.readFile(candidatePath, 'utf-8');
  } catch {
    content = '[Artifact file missing on disk]';
  }
  return {
    artifact: {
      ...found,
      file_path: candidatePath,
    },
    content,
  };
}

export async function updateArtifact(
  artifactId: string,
  patch: {
    name?: string;
    title?: string;
    description?: string;
    type?: ArtifactType;
    content?: string;
  }
): Promise<ArtifactEntry | null> {
  const { artifactsDir } = await ensureArtifactsStore();
  const list = await readArtifactsJson();
  const idx = list.findIndex((a) => a.id === artifactId);
  if (idx === -1) return null;

  const item = list[idx];
  const candidatePath = item.file_path || path.join(artifactsDir, item.file);

  if (patch.name !== undefined || patch.title !== undefined) {
    const newTitle = (patch.title ?? patch.name ?? item.title).trim();
    item.name = newTitle;
    item.title = newTitle;
  }
  if (patch.description !== undefined) {
    item.description = patch.description.trim();
  }
  if (patch.type !== undefined) {
    item.type = patch.type;
  }
  if (patch.content !== undefined) {
    await fs.mkdir(path.dirname(candidatePath), { recursive: true });
    await fs.writeFile(candidatePath, patch.content, 'utf-8');
  }
  item.updated_at = Date.now();
  list[idx] = item;
  await writeArtifactsJson(list);
  return item;
}

export async function deleteArtifact(artifactId: string): Promise<boolean> {
  const { artifactsDir } = await ensureArtifactsStore();
  const list = await readArtifactsJson();
  const idx = list.findIndex((a) => a.id === artifactId);
  if (idx === -1) return false;

  const [removed] = list.splice(idx, 1);
  await writeArtifactsJson(list);

  const candidatePath = removed.file_path || path.join(artifactsDir, removed.file);
  try {
    if (fsSync.existsSync(candidatePath)) {
      await fs.unlink(candidatePath);
    }
  } catch {
    // ignore unlink error
  }
  return true;
}
