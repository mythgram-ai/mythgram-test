import fs from 'node:fs';
import path from 'node:path';

export interface MythgramPaths {
  baseDir: string;
  dataDir: string;
  dbPath: string;
  uploadsDir: string;
  cacheDir: string;
  logsDir: string;
}

let cachedPaths: MythgramPaths | null = null;

/**
 * Initializes the `.mythgram` data directory in the folder where the user started the application.
 */
export function initDataDir(startDir: string = process.env.MYTHGRAM_START_DIR || process.cwd()): MythgramPaths {
  if (cachedPaths) return cachedPaths;

  const resolvedBase = path.resolve(startDir);
  const dataDir = path.join(resolvedBase, '.mythgram');
  const uploadsDir = path.join(dataDir, 'uploads');
  const cacheDir = path.join(dataDir, 'cache');
  const logsDir = path.join(dataDir, 'logs');
  const dbPath = path.join(dataDir, 'mythgram.sqlite');

  for (const dir of [dataDir, uploadsDir, cacheDir, logsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  cachedPaths = {
    baseDir: resolvedBase,
    dataDir,
    dbPath,
    uploadsDir,
    cacheDir,
    logsDir,
  };

  return cachedPaths;
}

export function getDataDir(): MythgramPaths {
  return cachedPaths || initDataDir();
}
