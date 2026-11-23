import fs from 'node:fs';
import path from 'node:path';

export interface MythgramPaths {
  baseDir: string;
  dataDir: string;
  dbPath: string;
  uploadsDir: string;
  cacheDir: string;
  logsDir: string;
  artifactsDir: string;
  artifactsJsonPath: string;
  subAgentsDir: string;
  subAgentsJsonPath: string;
  subAgentOutputsDir: string;
  skillsDir: string;
  skillsJsonPath: string;
}

let cachedPaths: MythgramPaths | null = null;

/**
 * Ensures all required `.mythgram` directories and JSON index files exist.
 * Safe to call repeatedly; recreates deleted folders or JSON files without crashing.
 */
export function ensureDataDirIntegrity(paths: MythgramPaths): MythgramPaths {
  const dirs = [
    paths.dataDir,
    paths.uploadsDir,
    paths.cacheDir,
    paths.logsDir,
    paths.artifactsDir,
    paths.subAgentsDir,
    paths.subAgentOutputsDir,
    paths.skillsDir,
  ];

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // ignore transient fs errors
    }
  }

  for (const jsonPath of [
    paths.artifactsJsonPath,
    paths.subAgentsJsonPath,
    paths.skillsJsonPath,
  ]) {
    try {
      if (!fs.existsSync(jsonPath)) {
        fs.writeFileSync(jsonPath, '[]\n', 'utf-8');
      }
    } catch {
      // ignore transient fs errors
    }
  }

  return paths;
}

/**
 * Initializes the `.mythgram` data directory in the folder where the user started the application.
 */
export function initDataDir(
  startDir: string = process.env.MYTHGRAM_START_DIR || process.cwd()
): MythgramPaths {
  if (cachedPaths) return ensureDataDirIntegrity(cachedPaths);

  const resolvedBase = path.resolve(startDir);
  const dataDir = path.join(resolvedBase, '.mythgram');
  const uploadsDir = path.join(dataDir, 'uploads');
  const cacheDir = path.join(dataDir, 'cache');
  const logsDir = path.join(dataDir, 'logs');
  const dbPath = path.join(dataDir, 'mythgram.sqlite');

  const artifactsDir = path.join(dataDir, 'artifacts');
  const artifactsJsonPath = path.join(artifactsDir, 'artifacts.json');

  const subAgentsDir = path.join(dataDir, 'sub-agents');
  const subAgentsJsonPath = path.join(subAgentsDir, 'sub-agents.json');
  const subAgentOutputsDir = path.join(subAgentsDir, 'outputs');

  const skillsDir = path.join(dataDir, 'skills');
  const skillsJsonPath = path.join(skillsDir, 'skills.json');

  cachedPaths = {
    baseDir: resolvedBase,
    dataDir,
    dbPath,
    uploadsDir,
    cacheDir,
    logsDir,
    artifactsDir,
    artifactsJsonPath,
    subAgentsDir,
    subAgentsJsonPath,
    subAgentOutputsDir,
    skillsDir,
    skillsJsonPath,
  };

  return ensureDataDirIntegrity(cachedPaths);
}

export function getDataDir(): MythgramPaths {
  return cachedPaths ? ensureDataDirIntegrity(cachedPaths) : initDataDir();
}
