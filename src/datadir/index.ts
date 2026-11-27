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
  customAgentsDir: string;
  customAgentsJsonPath: string;
  customAgentLogosDir: string;
  skillsDir: string;
  skillsJsonPath: string;
  mcpDir: string;
  mcpServersJsonPath: string;
  memoryDir: string;
  memoryJsonPath: string;
  knowledgeDir: string;
  knowledgeJsonPath: string;
  webSearchDir: string;
  webSearchJsonPath: string;
  ttsDir: string;
  ttsJsonPath: string;
  cronDir: string;
  cronSchedulesJsonPath: string;
  cronRunsJsonPath: string;
  checkpointsDir: string;
  checkpointsBackupDir: string;
  checkpointsJsonPath: string;
  profilesDir: string;
  profilesJsonPath: string;
  profileLogosDir: string;
  profilesDataDir: string;
  deamonDir: string;
}

export const DEFAULT_PROFILE_ID = 'default';
export const PROFILES_REGISTRY_FILENAME = 'profiles.json';

let cachedPaths: MythgramPaths | null = null;
let basePaths: MythgramPaths | null = null;

function buildPaths(resolvedBase: string, dataDir: string): MythgramPaths {
  const rootDataDir = path.join(resolvedBase, '.mythgram');
  const uploadsDir = path.join(dataDir, 'uploads');
  const cacheDir = path.join(dataDir, 'cache');
  const logsDir = path.join(dataDir, 'logs');
  const dbPath = path.join(dataDir, 'mythgram.sqlite');

  const artifactsDir = path.join(dataDir, 'artifacts');
  const artifactsJsonPath = path.join(artifactsDir, 'artifacts.json');

  const subAgentsDir = path.join(dataDir, 'sub-agents');
  const subAgentsJsonPath = path.join(subAgentsDir, 'sub-agents.json');
  const subAgentOutputsDir = path.join(subAgentsDir, 'outputs');

  const customAgentsDir = path.join(dataDir, 'custom-agents');
  const customAgentsJsonPath = path.join(customAgentsDir, 'custom-agents.json');
  const customAgentLogosDir = path.join(customAgentsDir, 'logos');

  const skillsDir = path.join(dataDir, 'skills');
  const skillsJsonPath = path.join(skillsDir, 'skills.json');

  const mcpDir = path.join(dataDir, 'mcp');
  const mcpServersJsonPath = path.join(mcpDir, 'mcp-servers.json');

  const memoryDir = path.join(dataDir, 'memory');
  const memoryJsonPath = path.join(memoryDir, 'memory-entry.json');

  const knowledgeDir = path.join(dataDir, 'knowledge');
  const knowledgeJsonPath = path.join(knowledgeDir, 'knowledge-entry.json');

  const webSearchDir = path.join(dataDir, 'web-search');
  const webSearchJsonPath = path.join(webSearchDir, 'web-search.json');

  const ttsDir = path.join(dataDir, 'tts');
  const ttsJsonPath = path.join(ttsDir, 'tts.json');

  const cronDir = path.join(dataDir, 'cron');
  const cronSchedulesJsonPath = path.join(cronDir, 'schedules.json');
  const cronRunsJsonPath = path.join(cronDir, 'runs.json');

  const checkpointsDir = path.join(dataDir, 'checkpoints');
  const checkpointsBackupDir = path.join(checkpointsDir, 'backup');
  const checkpointsJsonPath = path.join(checkpointsDir, 'checkpoints.json');

  // Profiles are always registered at the base `.mythgram` level so switching a
  // profile never hides the registry of the other profiles.
  const profilesDir = path.join(rootDataDir, 'profiles');
  const profilesJsonPath = path.join(profilesDir, PROFILES_REGISTRY_FILENAME);
  const profileLogosDir = path.join(profilesDir, 'logos');
  const profilesDataDir = path.join(profilesDir, 'data');

  const deamonDir = path.join(dataDir, 'deamon');

  return {
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
    customAgentsDir,
    customAgentsJsonPath,
    customAgentLogosDir,
    skillsDir,
    skillsJsonPath,
    mcpDir,
    mcpServersJsonPath,
    memoryDir,
    memoryJsonPath,
    knowledgeDir,
    knowledgeJsonPath,
    webSearchDir,
    webSearchJsonPath,
    ttsDir,
    ttsJsonPath,
    cronDir,
    cronSchedulesJsonPath,
    cronRunsJsonPath,
    checkpointsDir,
    checkpointsBackupDir,
    checkpointsJsonPath,
    profilesDir,
    profilesJsonPath,
    profileLogosDir,
    profilesDataDir,
    deamonDir,
  };
}

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
    paths.customAgentsDir,
    paths.customAgentLogosDir,
    paths.skillsDir,
    paths.mcpDir,
    paths.memoryDir,
    paths.knowledgeDir,
    paths.webSearchDir,
    paths.ttsDir,
    paths.cronDir,
    paths.checkpointsDir,
    paths.checkpointsBackupDir,
    paths.profilesDir,
    paths.profileLogosDir,
    paths.profilesDataDir,
    paths.deamonDir,
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
    paths.customAgentsJsonPath,
    paths.skillsJsonPath,
    paths.mcpServersJsonPath,
    paths.memoryJsonPath,
    paths.knowledgeJsonPath,
    paths.cronSchedulesJsonPath,
    paths.cronRunsJsonPath,
    paths.checkpointsJsonPath,
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

function isValidProfileId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(id);
}

function readActiveProfileIdSync(paths: MythgramPaths): string | null {
  try {
    const raw = fs.readFileSync(paths.profilesJsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const active = typeof parsed?.activeProfileId === 'string' ? parsed.activeProfileId.trim() : '';
    if (!active || active === DEFAULT_PROFILE_ID || !isValidProfileId(active)) return null;
    const profiles = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
    const exists = profiles.some((entry: any) => entry && entry.id === active);
    return exists ? active : null;
  } catch {
    return null;
  }
}

/**
 * Initializes the `.mythgram` data directory in the folder where the user started the application.
 * When a custom profile was active before shutdown, that profile's isolated data directory is used.
 */
export function initDataDir(
  startDir: string = process.env.MYTHGRAM_START_DIR || process.cwd()
): MythgramPaths {
  if (cachedPaths) return ensureDataDirIntegrity(cachedPaths);

  const resolvedBase = path.resolve(startDir);
  basePaths = buildPaths(resolvedBase, path.join(resolvedBase, '.mythgram'));
  ensureDataDirIntegrity(basePaths);

  const activeProfileId = readActiveProfileIdSync(basePaths);
  cachedPaths = activeProfileId
    ? buildPaths(resolvedBase, path.join(basePaths.profilesDataDir, activeProfileId))
    : basePaths;

  return ensureDataDirIntegrity(cachedPaths);
}

/** Returns the paths of the default profile (the `.mythgram` root). */
export function getBasePaths(): MythgramPaths {
  if (!basePaths) initDataDir();
  return ensureDataDirIntegrity(basePaths!);
}

/** Returns the isolated data paths of a specific profile without activating it. */
export function getProfilePaths(profileId: string): MythgramPaths {
  if (!isValidProfileId(profileId) || profileId === DEFAULT_PROFILE_ID) {
    return getBasePaths();
  }
  const base = getBasePaths();
  return ensureDataDirIntegrity(
    buildPaths(base.baseDir, path.join(base.profilesDataDir, profileId))
  );
}

/**
 * Switches the data directory used by every store. `null` (or the default profile id)
 * selects the `.mythgram` root, which is the default profile.
 */
export function setActiveProfileDataDir(profileId: string | null): MythgramPaths {
  const base = getBasePaths();
  const id = profileId && profileId !== DEFAULT_PROFILE_ID ? profileId : null;
  cachedPaths = id
    ? buildPaths(base.baseDir, path.join(base.profilesDataDir, id))
    : base;
  return ensureDataDirIntegrity(cachedPaths);
}

export function getDataDir(): MythgramPaths {
  return cachedPaths ? ensureDataDirIntegrity(cachedPaths) : initDataDir();
}
