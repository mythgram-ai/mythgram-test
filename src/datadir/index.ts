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
    paths.customAgentsDir,
    paths.customAgentLogosDir,
    paths.skillsDir,
    paths.mcpDir,
    paths.memoryDir,
    paths.knowledgeDir,
    paths.webSearchDir,
    paths.ttsDir,
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
  };

  return ensureDataDirIntegrity(cachedPaths);
}

export function getDataDir(): MythgramPaths {
  return cachedPaths ? ensureDataDirIntegrity(cachedPaths) : initDataDir();
}
