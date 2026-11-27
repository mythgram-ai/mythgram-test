import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface DaemonConfig {
  projectRoot: string;
  dataDir: string;
  deamonDir: string;
  logsDir: string;
  backendPort: number;
  frontendPort: number;
  backendLog: string;
  frontendLog: string;
  daemonLog: string;
  pidFile: string;
  watchdogPidFile: string;
  lockFile: string;
  stateFile: string;
  heartbeatFile: string;
  backendPidFile: string;
  frontendPidFile: string;
  healthPath: string;
  healthIntervalMs: number;
  healthTimeoutMs: number;
  healthFailureThreshold: number;
  restartBaseDelayMs: number;
  restartMaxDelayMs: number;
  restartWindowMs: number;
  maxRestartsInWindow: number;
  stableUptimeMs: number;
  startupGraceMs: number;
  stopGraceMs: number;
  tickIntervalMs: number;
  logMaxBytes: number;
  logMaxFiles: number;
  frontendEnabled: boolean;
  watchdogEnabled: boolean;
  watchdogIntervalMs: number;
  heartbeatStaleMs: number;
  nodeBinary: string;
  tsxCli: string | null;
  npmBinary: string | null;
}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

function fileExists(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function findExecutable(names: string[]): string | null {
  const dirs = [
    path.dirname(process.execPath),
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/opt/homebrew/bin',
    ...(process.env.PATH || '').split(path.delimiter),
  ].filter(Boolean);
  for (const name of names) {
    if (path.isAbsolute(name) && fileExists(name)) return name;
    for (const dir of dirs) {
      const candidate = path.join(dir, name);
      if (fileExists(candidate)) return candidate;
    }
  }
  return null;
}

function detectProjectRoot(): string {
  const explicit =
    process.env.MYTHGRAM_PROJECT_ROOT || process.env.MYTHGRAM_START_DIR;
  if (explicit) return path.resolve(explicit);

  let current = process.cwd();
  for (let depth = 0; depth < 4; depth++) {
    if (fileExists(path.join(current, 'package.json')) && fileExists(path.join(current, 'src', 'index.ts'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

export function getDaemonConfig(overrides: Partial<DaemonConfig> = {}): DaemonConfig {
  const projectRoot = overrides.projectRoot || detectProjectRoot();
  const dataDir =
    overrides.dataDir ||
    process.env.MYTHGRAM_DATA_DIR ||
    process.env.MYTHGRAM_DEAMON_DATA_DIR ||
    path.join(projectRoot, '.mythgram');
  const deamonDir = overrides.deamonDir || path.join(dataDir, 'deamon');
  const logsDir = overrides.logsDir || path.join(dataDir, 'logs');
  const backendPort = overrides.backendPort || envInt('MYTHGRAM_DEAMON_BACKEND_PORT', envInt('PORT', 1000));
  const frontendPort = overrides.frontendPort || envInt('MYTHGRAM_DEAMON_FRONTEND_PORT', 2000);

  const nodeBinary = overrides.nodeBinary || process.execPath;
  const tsxCandidate = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const tsxCli =
    overrides.tsxCli !== undefined
      ? overrides.tsxCli
      : fileExists(tsxCandidate)
        ? tsxCandidate
        : null;
  const npmBinary =
    overrides.npmBinary !== undefined
      ? overrides.npmBinary
      : findExecutable(['npm', 'npm.cmd']);

  const config: DaemonConfig = {
    projectRoot,
    dataDir,
    deamonDir,
    logsDir,
    backendPort,
    frontendPort,
    backendLog: path.join(logsDir, 'backend.log'),
    frontendLog: path.join(logsDir, 'frontend.log'),
    daemonLog: path.join(logsDir, 'deamon.log'),
    pidFile: path.join(deamonDir, 'daemon.pid'),
    watchdogPidFile: path.join(deamonDir, 'watchdog.pid'),
    lockFile: path.join(deamonDir, 'daemon.lock'),
    stateFile: path.join(deamonDir, 'state.json'),
    heartbeatFile: path.join(deamonDir, 'heartbeat.json'),
    backendPidFile: path.join(dataDir, 'backend.pid'),
    frontendPidFile: path.join(dataDir, 'frontend.pid'),
    healthPath: '/api/health',
    healthIntervalMs: envInt('MYTHGRAM_DEAMON_HEALTH_INTERVAL_MS', 15_000),
    healthTimeoutMs: envInt('MYTHGRAM_DEAMON_HEALTH_TIMEOUT_MS', 6_000),
    healthFailureThreshold: envInt('MYTHGRAM_DEAMON_HEALTH_FAILURES', 3),
    restartBaseDelayMs: envInt('MYTHGRAM_DEAMON_RESTART_BASE_MS', 1_000),
    restartMaxDelayMs: envInt('MYTHGRAM_DEAMON_RESTART_MAX_MS', 30_000),
    restartWindowMs: envInt('MYTHGRAM_DEAMON_RESTART_WINDOW_MS', 60_000),
    maxRestartsInWindow: envInt('MYTHGRAM_DEAMON_MAX_RESTARTS', 12),
    stableUptimeMs: envInt('MYTHGRAM_DEAMON_STABLE_MS', 60_000),
    startupGraceMs: envInt('MYTHGRAM_DEAMON_STARTUP_GRACE_MS', 20_000),
    stopGraceMs: envInt('MYTHGRAM_DEAMON_STOP_GRACE_MS', 8_000),
    tickIntervalMs: envInt('MYTHGRAM_DEAMON_TICK_MS', 5_000),
    logMaxBytes: envInt('MYTHGRAM_DEAMON_LOG_MAX_BYTES', 5 * 1024 * 1024),
    logMaxFiles: envInt('MYTHGRAM_DEAMON_LOG_MAX_FILES', 5),
    frontendEnabled: envBool('MYTHGRAM_DEAMON_FRONTEND', true),
    watchdogEnabled: envBool('MYTHGRAM_DEAMON_WATCHDOG', false),
    watchdogIntervalMs: envInt('MYTHGRAM_DEAMON_WATCHDOG_INTERVAL_MS', 10_000),
    heartbeatStaleMs: envInt('MYTHGRAM_DEAMON_HEARTBEAT_STALE_MS', 60_000),
    nodeBinary,
    tsxCli,
    npmBinary,
    ...overrides,
  };

  return config;
}

export function ensureDaemonDirs(config: DaemonConfig): void {
  for (const dir of [config.dataDir, config.deamonDir, config.logsDir]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // transient fs errors are retried on the next tick
    }
  }
}

export function buildBackendCommand(
  config: DaemonConfig
): { command: string; args: string[] } {
  if (config.tsxCli) {
    return { command: config.nodeBinary, args: [config.tsxCli, 'src/index.ts'] };
  }
  return { command: 'npx', args: ['--yes', 'tsx', 'src/index.ts'] };
}

export function buildFrontendCommand(
  config: DaemonConfig
): { command: string; args: string[] } {
  const npm = config.npmBinary || 'npm';
  return { command: npm, args: ['run', 'dev'] };
}

export function buildSelfCommand(
  config: DaemonConfig,
  extraArgs: string[]
): { command: string; args: string[] } {
  const script = path.join(config.projectRoot, 'src', 'deamon', 'index.ts');
  if (config.tsxCli) {
    return { command: config.nodeBinary, args: [config.tsxCli, script, ...extraArgs] };
  }
  return { command: 'npx', args: ['--yes', 'tsx', script, ...extraArgs] };
}

export function childEnvironment(
  config: DaemonConfig,
  extra: Record<string, string> = {}
): NodeJS.ProcessEnv {
  const pathValue = [
    path.dirname(config.nodeBinary),
    '/usr/local/sbin',
    '/usr/local/bin',
    '/usr/sbin',
    '/usr/bin',
    '/sbin',
    '/bin',
    process.env.PATH || '',
  ]
    .filter(Boolean)
    .join(path.delimiter);

  return {
    ...process.env,
    PATH: pathValue,
    MYTHGRAM_START_DIR: config.projectRoot,
    MYTHGRAM_PROJECT_ROOT: config.projectRoot,
    NODE_ENV: process.env.NODE_ENV || 'development',
    ...extra,
  };
}

export function describeConfig(config: DaemonConfig): Record<string, unknown> {
  return {
    projectRoot: config.projectRoot,
    dataDir: config.dataDir,
    backendPort: config.backendPort,
    frontendPort: config.frontendPort,
    frontendEnabled: config.frontendEnabled,
    watchdogEnabled: config.watchdogEnabled,
    healthIntervalMs: config.healthIntervalMs,
    restartBaseDelayMs: config.restartBaseDelayMs,
    restartMaxDelayMs: config.restartMaxDelayMs,
    heartbeatStaleMs: config.heartbeatStaleMs,
    tsxCli: config.tsxCli,
    npmBinary: config.npmBinary,
    node: process.version,
    platform: `${process.platform}/${os.arch()}`,
  };
}
