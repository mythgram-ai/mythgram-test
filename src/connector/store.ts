import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../datadir/index.js';
import { ConnectorStoreData } from './types.js';

const DEFAULT_DATA: ConnectorStoreData = {
  api_key: '',
  user_id: 'mythgram-user',
  enabled: true,
  allow_sub_agents: false,
  connections: {},
};

let cache: ConnectorStoreData | null = null;

function storePaths() {
  const { dataDir } = getDataDir();
  const dir = path.join(dataDir, 'connectors');
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return { dir, file: path.join(dir, 'connectors.json') };
}

export async function readConnectorStore(): Promise<ConnectorStoreData> {
  if (cache) return cache;
  const { file } = storePaths();
  try {
    const raw = await fs.readFile(file, 'utf-8');
    const parsed = JSON.parse(raw);
    cache = { ...DEFAULT_DATA, ...parsed, connections: parsed?.connections || {} };
  } catch {
    cache = { ...DEFAULT_DATA, connections: {} };
  }
  return cache!;
}

export function readConnectorStoreSync(): ConnectorStoreData {
  if (cache) return cache;
  try {
    const raw = fsSync.readFileSync(storePaths().file, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DATA, ...parsed, connections: parsed?.connections || {} };
  } catch {
    return { ...DEFAULT_DATA, connections: {} };
  }
}

export async function writeConnectorStore(data: ConnectorStoreData): Promise<void> {
  const { file } = storePaths();
  cache = data;
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

export async function updateConnectorStore(
  patch: Partial<ConnectorStoreData>
): Promise<ConnectorStoreData> {
  const current = await readConnectorStore();
  const next: ConnectorStoreData = {
    ...current,
    ...patch,
    connections: patch.connections ?? current.connections,
  };
  await writeConnectorStore(next);
  return next;
}
