import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSelfCommand,
  childEnvironment,
  describeConfig,
  ensureDaemonDirs,
  getDaemonConfig,
  type DaemonConfig,
} from './config.js';
import { DaemonLogger, openChildLog, readLogTail } from './logger.js';
import {
  formatDuration,
  httpHealth,
  isPortFree,
  killProcessTree,
  pidAlive,
  processCommand,
  readPid,
  sleep,
} from './health.js';
import { Supervisor } from './supervisor.js';
import {
  detectServiceManager,
  getServiceStatus,
  installService,
  uninstallService,
  type ServiceManager,
} from './service.js';

const HELP = `Mythgram self-healing daemon

Usage:
  mythgram-daemon <command> [options]

Commands:
  start                 Start the daemon (background by default)
  stop                  Stop the daemon and every supervised process
  restart               Restart the daemon
  status [--json]       Show daemon, process, health, and service status
  logs [--follow]       Tail the daemon log (--file daemon|backend|frontend)
  ensure                Start the daemon only if it is not already running
  doctor [--json]       Run environment and health diagnostics
  install [options]     Install as a systemd / launchd / cron service
  uninstall             Remove the installed service
  help                  Show this help

Options:
  --foreground          Run in the foreground (used by service managers)
  --no-frontend         Supervise only the backend
  --watchdog            Run an outer watchdog that restarts the daemon
  --no-watchdog         Do not run the watchdog (default for service managers)
  --backend-port <n>    Backend port (default 1000, or PORT)
  --frontend-port <n>   WebUI port (default 2000)
  --lines <n>           Log lines for "logs" (default 80)
  --file <name>         Log file: daemon | backend | frontend
  --json                Machine-readable output for status/doctor
  --user                Install a systemd user service
  --manager <name>      Force service manager: systemd | launchd | cron
  --no-start            Do not start after install

Environment:
  MYTHGRAM_PROJECT_ROOT, MYTHGRAM_START_DIR, PORT,
  MYTHGRAM_DEAMON_FRONTEND=0, MYTHGRAM_DEAMON_BACKEND_PORT,
  MYTHGRAM_DEAMON_FRONTEND_PORT, MYTHGRAM_DEAMON_WATCHDOG=1,
  MYTHGRAM_DEAMON_HEALTH_INTERVAL_MS, MYTHGRAM_DEAMON_HEALTH_FAILURES,
  MYTHGRAM_DEAMON_RESTART_BASE_MS, MYTHGRAM_DEAMON_RESTART_MAX_MS,
  MYTHGRAM_DEAMON_MAX_RESTARTS, MYTHGRAM_DEAMON_STARTUP_GRACE_MS,
  MYTHGRAM_DEAMON_HEARTBEAT_STALE_MS, MYTHGRAM_DEAMON_LOG_MAX_BYTES
`;

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function flagValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

function makeLogger(
  config: DaemonConfig,
  echo = Boolean(process.stdout.isTTY)
): DaemonLogger {
  return new DaemonLogger(config.daemonLog, config.logMaxBytes, config.logMaxFiles, echo);
}

function acquireLock(config: DaemonConfig, logger: DaemonLogger): boolean {
  ensureDaemonDirs(config);
  const write = (): boolean => {
    try {
      const fd = fs.openSync(config.lockFile, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      fs.closeSync(fd);
      return true;
    } catch (err: any) {
      if (err?.code !== 'EEXIST') {
        logger.error(`Could not create daemon lock: ${err?.message || err}`);
        return false;
      }
      return false;
    }
  };

  if (write()) return true;

  const existingPid = (() => {
    try {
      const raw = JSON.parse(fs.readFileSync(config.lockFile, 'utf-8')) as { pid?: number };
      return typeof raw.pid === 'number' ? raw.pid : null;
    } catch {
      return null;
    }
  })();

  if (existingPid && pidAlive(existingPid) && existingPid !== process.pid) {
    logger.error(`Another daemon is already running (pid ${existingPid}).`);
    return false;
  }

  try {
    fs.unlinkSync(config.lockFile);
  } catch {
    // ignore
  }
  if (write()) {
    logger.warn(`Removed stale daemon lock (pid ${existingPid ?? 'unknown'}).`);
    return true;
  }
  return false;
}

function releaseLock(config: DaemonConfig): void {
  try {
    fs.unlinkSync(config.lockFile);
  } catch {
    // ignore
  }
}

function writePid(file: string): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, String(process.pid), 'utf-8');
  } catch {
    // pid files are advisory
  }
}

function removePidIfOwned(file: string): void {
  try {
    if (readPid(file) === process.pid) fs.unlinkSync(file);
  } catch {
    // ignore
  }
}

function removePidFile(file: string): void {
  try {
    fs.unlinkSync(file);
  } catch {
    // ignore
  }
}

function readState(config: DaemonConfig): any | null {
  try {
    return JSON.parse(fs.readFileSync(config.stateFile, 'utf-8'));
  } catch {
    return null;
  }
}

function daemonIsAlive(config: DaemonConfig): boolean {
  const pid = readPid(config.pidFile);
  return pidAlive(pid) && looksLikeOurProcess(pid as number, config);
}

function watchdogIsAlive(config: DaemonConfig): boolean {
  const pid = readPid(config.watchdogPidFile);
  return pidAlive(pid) && looksLikeOurProcess(pid as number, config);
}

function configFromArgs(args: string[]): DaemonConfig {
  const overrides: Partial<DaemonConfig> = {};
  if (hasFlag(args, '--no-frontend')) overrides.frontendEnabled = false;
  if (hasFlag(args, '--watchdog')) overrides.watchdogEnabled = true;
  if (hasFlag(args, '--no-watchdog')) overrides.watchdogEnabled = false;
  const backendPort = flagValue(args, '--backend-port');
  if (backendPort && Number(backendPort) > 0) overrides.backendPort = Number(backendPort);
  const frontendPort = flagValue(args, '--frontend-port');
  if (frontendPort && Number(frontendPort) > 0) overrides.frontendPort = Number(frontendPort);
  return getDaemonConfig(overrides);
}

function selfStartArgs(config: DaemonConfig, watchdog: boolean): string[] {
  const args = ['start', '--foreground'];
  args.push(watchdog ? '--watchdog' : '--no-watchdog');
  if (!config.frontendEnabled) args.push('--no-frontend');
  args.push('--backend-port', String(config.backendPort));
  args.push('--frontend-port', String(config.frontendPort));
  return args;
}

function spawnDetached(config: DaemonConfig, args: string[], logFile: string): number | null {
  const self = buildSelfCommand(config, args);
  const fd = openChildLog(logFile);
  try {
    const child = spawn(self.command, self.args, {
      cwd: config.projectRoot,
      env: childEnvironment(config),
      detached: true,
      stdio: ['ignore', fd, fd],
    });
    child.unref();
    return child.pid ?? null;
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // ignore
    }
  }
}

async function runSupervisor(config: DaemonConfig, logger: DaemonLogger): Promise<void> {
  if (!acquireLock(config, logger)) {
    process.exitCode = 1;
    return;
  }
  writePid(config.pidFile);
  const supervisor = new Supervisor(config, logger);
  supervisor.setServiceManager(detectServiceManager());
  let shuttingDown = false;
  const crashes: number[] = [];

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}; shutting down.`);
    try {
      await supervisor.stop();
    } catch (err: any) {
      logger.error(`Shutdown error: ${err?.message || err}`);
    } finally {
      removePidIfOwned(config.pidFile);
      releaseLock(config);
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGHUP', () => {
    supervisor.recordEvent('reload', 'SIGHUP received; restarting supervised processes.');
    void supervisor.restartAll('SIGHUP');
  });
  process.on('SIGUSR2', () => {
    logger.rotate();
    supervisor.recordEvent('log-rotate', 'SIGUSR2 received; rotated logs.');
  });
  process.on('uncaughtException', (err) => {
    supervisor.recordEvent('crash', `Uncaught exception: ${err?.stack || err}`);
    const now = Date.now();
    crashes.push(now);
    while (crashes.length && now - crashes[0] > 60_000) crashes.shift();
    if (crashes.length > 10) {
      logger.error('Too many uncaught exceptions in 60s; exiting so the service manager can restart the daemon.');
      process.exit(1);
    }
    void supervisor.restartAll(`uncaught exception: ${err?.message || err}`);
  });
  process.on('unhandledRejection', (reason) => {
    supervisor.recordEvent('crash', `Unhandled rejection: ${String(reason)}`);
  });

  logger.info('Mythgram daemon starting.', describeConfig(config));
  await supervisor.start();
  logger.info(
    `Daemon ready. Backend: http://127.0.0.1:${config.backendPort} | WebUI: ${
      config.frontendEnabled ? `http://127.0.0.1:${config.frontendPort}` : 'disabled'
    } | State: ${config.stateFile}`
  );
  await new Promise<void>(() => {
    // The supervisor timers and child processes keep the event loop alive.
  });
}

async function runWatchdog(config: DaemonConfig, logger: DaemonLogger): Promise<void> {
  writePid(config.watchdogPidFile);
  let child: ReturnType<typeof spawn> | null = null;
  let childStartedAt = 0;
  let stopping = false;
  let restarts = 0;
  let restartTimer: NodeJS.Timeout | null = null;
  let monitorTimer: NodeJS.Timeout | null = null;

  const startChild = (reason: string): void => {
    if (stopping) return;
    const args = selfStartArgs(config, false);
    const self = buildSelfCommand(config, args);
    logger.info(`Watchdog starting daemon child (${reason}).`, {
      command: self.command,
      args: self.args,
    });
    childStartedAt = Date.now();
    child = spawn(self.command, self.args, {
      cwd: config.projectRoot,
      env: childEnvironment(config, {
        MYTHGRAM_DEAMON_CHILD: '1',
        MYTHGRAM_DEAMON_WATCHDOG: '0',
      }),
      stdio: 'inherit',
    });
    child.once('exit', (code, signal) => {
      child = null;
      if (stopping) return;
      logger.warn(`Daemon child exited (code=${code}, signal=${signal ?? 'none'}).`);
      scheduleRestart(`child exit code ${code ?? 'null'}`);
    });
    child.once('error', (err) => {
      logger.error(`Watchdog could not spawn daemon child: ${err.message}`);
      child = null;
      scheduleRestart(`spawn error: ${err.message}`);
    });
  };

  const scheduleRestart = (reason: string): void => {
    if (stopping) return;
    restarts += 1;
    const delay = Math.min(30_000, 1_000 * Math.pow(2, Math.min(restarts - 1, 5)));
    logger.warn(`Watchdog restarting daemon in ${Math.round(delay / 1000)}s (${reason}).`);
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      startChild('watchdog restart');
    }, delay);
  };

  const checkHeartbeat = (): void => {
    if (!child || stopping) return;
    if (Date.now() - childStartedAt < config.heartbeatStaleMs) return;
    let heartbeatAge = Number.POSITIVE_INFINITY;
    try {
      heartbeatAge = Date.now() - fs.statSync(config.heartbeatFile).mtimeMs;
    } catch {
      // heartbeat file missing
    }
    if (heartbeatAge > config.heartbeatStaleMs) {
      logger.error(
        `Daemon heartbeat is stale (${Math.round(heartbeatAge / 1000)}s); restarting the daemon child.`
      );
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      const victim = child;
      setTimeout(() => {
        try {
          if (victim && !victim.killed) victim.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 8_000).unref();
      scheduleRestart('stale heartbeat');
    }
  };

  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    logger.info(`Watchdog received ${signal}; stopping daemon child.`);
    if (restartTimer) clearTimeout(restartTimer);
    if (monitorTimer) clearInterval(monitorTimer);
    try {
      child?.kill('SIGTERM');
    } catch {
      // ignore
    }
    setTimeout(() => {
      try {
        if (child) child.kill('SIGKILL');
      } catch {
        // ignore
      }
      removePidIfOwned(config.watchdogPidFile);
      process.exit(0);
    }, 3_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.error(`Watchdog uncaught exception: ${err?.stack || err}`);
    scheduleRestart('watchdog exception');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`Watchdog unhandled rejection: ${String(reason)}`);
  });

  startChild('initial start');
  monitorTimer = setInterval(() => {
    checkHeartbeat();
    if (!child && !restartTimer) scheduleRestart('missing child');
  }, config.watchdogIntervalMs);
  if (monitorTimer.unref) monitorTimer.unref();

  logger.info(`Watchdog running (pid ${process.pid}); monitoring heartbeat ${config.heartbeatFile}.`);
  await new Promise<void>(() => {
    // Keep the watchdog alive until a signal arrives.
  });
}

async function startCommand(config: DaemonConfig, args: string[]): Promise<number> {
  const logger = makeLogger(config);
  ensureDaemonDirs(config);
  const isWatchdogChild = process.env.MYTHGRAM_DEAMON_CHILD === '1';

  if (!isWatchdogChild && daemonIsAlive(config)) {
    const pid = readPid(config.pidFile);
    console.log(`Mythgram daemon is already running (pid ${pid ?? 'unknown'}).`);
    return 0;
  }
  if (!isWatchdogChild && watchdogIsAlive(config)) {
    const pid = readPid(config.watchdogPidFile);
    console.log(`Mythgram watchdog is already running (pid ${pid ?? 'unknown'}).`);
    return 0;
  }

  if (config.frontendEnabled && !fs.existsSync(path.join(config.projectRoot, 'webui', 'node_modules'))) {
    logger.warn('webui/node_modules is missing. Run "npm install --prefix webui" or start with --no-frontend.');
  }

  const foreground = hasFlag(args, '--foreground');
  const watchdog = hasFlag(args, '--watchdog') || config.watchdogEnabled;

  if (foreground) {
    if (watchdog) await runWatchdog(config, logger);
    else await runSupervisor(config, logger);
    return 0;
  }

  const pid = spawnDetached(config, selfStartArgs(config, watchdog), config.daemonLog);
  await sleep(1_500);
  if (daemonIsAlive(config) || watchdogIsAlive(config)) {
    console.log(
      `Mythgram daemon started${pid ? ` (pid ${pid})` : ''}. Logs: ${config.daemonLog}`
    );
    return 0;
  }
  console.error(
    `Daemon did not report a live pid. Check ${config.daemonLog} and run "npm run daemon:doctor".`
  );
  return 1;
}

function looksLikeOurProcess(pid: number, config: DaemonConfig): boolean {
  try {
    const command = processCommand(pid);
    if (!command) return false;
    return (
      command.includes(config.projectRoot) ||
      command.includes('src/index.ts') ||
      command.includes('src/deamon/index.ts') ||
      command.includes('vite')
    );
  } catch {
    return false;
  }
}

async function stopCommand(config: DaemonConfig): Promise<number> {
  const logger = makeLogger(config);
  const state = readState(config);
  const targets = new Map<number, string>();
  const add = (pid: number | null, label: string) => {
    if (pid && pid !== process.pid && looksLikeOurProcess(pid, config)) {
      targets.set(pid, label);
    }
  };

  add(readPid(config.watchdogPidFile), 'watchdog');
  add(readPid(config.pidFile), 'daemon');
  add(state?.daemonPid ?? null, 'daemon(state)');
  for (const processInfo of state?.processes ?? []) {
    if (processInfo?.pid && looksLikeOurProcess(processInfo.pid, config)) {
      add(processInfo.pid, `process:${processInfo.name}`);
    }
  }

  if (targets.size === 0) {
    releaseLock(config);
    removePidFile(config.pidFile);
    removePidFile(config.watchdogPidFile);
    console.log('Mythgram daemon is not running.');
    return 0;
  }

  for (const [pid, label] of targets) {
    if (!pidAlive(pid)) continue;
    logger.info(`Stopping ${label} (pid ${pid}).`);
    killProcessTree(pid, 'SIGTERM');
  }

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if ([...targets.keys()].every((pid) => !pidAlive(pid))) break;
    await sleep(300);
  }
  for (const [pid, label] of targets) {
    if (!pidAlive(pid)) continue;
    logger.warn(`Force killing ${label} (pid ${pid}).`);
    killProcessTree(pid, 'SIGKILL');
  }
  releaseLock(config);
  removePidFile(config.pidFile);
  removePidFile(config.watchdogPidFile);
  console.log('Mythgram daemon stopped.');
  return 0;
}

async function restartCommand(config: DaemonConfig, args: string[]): Promise<number> {
  await stopCommand(config);
  await sleep(600);
  return startCommand(config, args);
}

async function statusCommand(config: DaemonConfig, args: string[]): Promise<number> {
  const state = readState(config);
  const service = getServiceStatus(config);
  const daemonPid = readPid(config.pidFile);
  const watchdogPid = readPid(config.watchdogPidFile);
  const backend = state?.processes?.find((process: any) => process.name === 'backend');
  const frontend = state?.processes?.find((process: any) => process.name === 'frontend');
  const backendHealth = await httpHealth(
    `http://127.0.0.1:${config.backendPort}${config.healthPath}`,
    config.healthTimeoutMs
  );
  const frontendHealth = config.frontendEnabled
    ? await httpHealth(`http://127.0.0.1:${config.frontendPort}/`, config.healthTimeoutMs)
    : null;

  const report = {
    daemon: {
      pid: daemonPid,
      alive: daemonIsAlive(config),
      watchdogPid,
      watchdogAlive: watchdogIsAlive(config),
      state: state?.status ?? 'unknown',
      startedAt: state?.startedAt ?? null,
      uptimeMs: state?.startedAt ? Date.now() - state.startedAt : null,
    },
    service,
    backend: {
      pid: backend?.pid ?? null,
      state: backend?.state ?? 'unknown',
      restarts: backend?.restarts ?? 0,
      port: config.backendPort,
      health: backendHealth,
    },
    frontend: config.frontendEnabled
      ? {
          pid: frontend?.pid ?? null,
          state: frontend?.state ?? 'unknown',
          restarts: frontend?.restarts ?? 0,
          port: config.frontendPort,
          health: frontendHealth,
        }
      : null,
    events: (state?.events ?? []).slice(-10),
    config: describeConfig(config),
  };

  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify(report, null, 2));
    return report.daemon.alive && backendHealth.ok ? 0 : 1;
  }

  console.log('Mythgram daemon');
  console.log(
    `  daemon:   ${report.daemon.alive ? `running (pid ${daemonPid})` : 'not running'}${
      report.daemon.uptimeMs ? ` · up ${formatDuration(report.daemon.uptimeMs)}` : ''
    }`
  );
  console.log(
    `  watchdog: ${report.daemon.watchdogAlive ? `running (pid ${watchdogPid})` : 'not running'}`
  );
  console.log(
    `  service:  ${service.manager}${service.installed ? ' installed' : ' not installed'}${
      service.active ? ' · active' : ''
    }`
  );
  const line = (name: string, info: any, health: any) => {
    const healthText = health
      ? health.ok
        ? `healthy (${health.status}, ${health.durationMs}ms)`
        : `unhealthy (${health.error || health.status})`
      : 'disabled';
    console.log(
      `  ${name}: ${info?.state ?? 'unknown'}${
        info?.pid ? ` pid ${info.pid}` : ''
      } · port ${info?.port ?? '-'} · ${healthText}${info?.restarts ? ` · restarts ${info.restarts}` : ''}`
    );
  };
  line('backend ', report.backend, backendHealth);
  if (report.frontend) line('frontend', report.frontend, frontendHealth);
  if (report.events.length) {
    console.log('  recent events:');
    for (const event of report.events) {
      console.log(
        `    ${new Date(event.at).toISOString()} ${event.type}: ${event.message}`
      );
    }
  }
  return report.daemon.alive && backendHealth.ok ? 0 : 1;
}

function logsCommand(config: DaemonConfig, args: string[]): number {
  const file = flagValue(args, '--file') || 'daemon';
  const linesRaw = flagValue(args, '--lines');
  const lines = linesRaw ? Math.max(1, Math.min(5_000, Number(linesRaw) || 80)) : 80;
  const target =
    file === 'backend' ? config.backendLog : file === 'frontend' ? config.frontendLog : config.daemonLog;

  if (!fs.existsSync(target)) {
    console.error(`Log file does not exist yet: ${target}`);
    return 1;
  }

  if (hasFlag(args, '--follow')) {
    const child = spawn('tail', ['-n', String(lines), '-f', target], {
      stdio: 'inherit',
    });
    child.on('error', () => {
      console.error('tail is not available; showing the current tail only.');
      for (const line of readLogTail(target, lines)) console.log(line);
    });
    return 0;
  }

  for (const line of readLogTail(target, lines)) console.log(line);
  return 0;
}

async function ensureCommand(config: DaemonConfig): Promise<number> {
  if (daemonIsAlive(config) || watchdogIsAlive(config)) return 0;
  const watchdog = config.watchdogEnabled;
  const pid = spawnDetached(config, selfStartArgs(config, watchdog), config.daemonLog);
  await sleep(1_500);
  if (daemonIsAlive(config)) return 0;
  const logger = makeLogger(config);
  logger.error(`ensure failed to start the daemon${pid ? ` (spawn pid ${pid})` : ''}.`);
  return 1;
}

interface DoctorCheck {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
}

async function doctorCommand(config: DaemonConfig, args: string[]): Promise<number> {
  const checks: DoctorCheck[] = [];
  const add = (name: string, status: DoctorCheck['status'], detail: string) => {
    checks.push({ name, status, detail });
  };

  const major = Number(process.versions.node.split('.')[0]);
  add(
    'node version',
    major >= 20 ? 'PASS' : 'FAIL',
    `${process.version} (need >= 20)`
  );

  const packageJson = path.join(config.projectRoot, 'package.json');
  const backendEntry = path.join(config.projectRoot, 'src', 'index.ts');
  add(
    'project files',
    fs.existsSync(packageJson) && fs.existsSync(backendEntry) ? 'PASS' : 'FAIL',
    `${packageJson}${fs.existsSync(packageJson) ? '' : ' missing'} · ${backendEntry}${
      fs.existsSync(backendEntry) ? '' : ' missing'
    }`
  );

  add(
    'tsx runner',
    config.tsxCli ? 'PASS' : 'WARN',
    config.tsxCli || 'not found; will fall back to npx tsx'
  );

  const hono = path.join(config.projectRoot, 'node_modules', 'hono');
  add('backend dependencies', fs.existsSync(hono) ? 'PASS' : 'FAIL', hono);

  if (config.frontendEnabled) {
    const webuiModules = path.join(config.projectRoot, 'webui', 'node_modules');
    const vite = path.join(webuiModules, 'vite');
    add(
      'webui dependencies',
      fs.existsSync(webuiModules) && fs.existsSync(vite) ? 'PASS' : 'FAIL',
      webuiModules
    );
  }

  try {
    fs.mkdirSync(config.deamonDir, { recursive: true });
    const probe = path.join(config.deamonDir, `.doctor-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    add('data directory writable', 'PASS', config.deamonDir);
  } catch (err: any) {
    add('data directory writable', 'FAIL', err?.message || String(err));
  }

  const backendHealth = await httpHealth(
    `http://127.0.0.1:${config.backendPort}${config.healthPath}`,
    config.healthTimeoutMs
  );
  add(
    'backend health',
    backendHealth.ok ? 'PASS' : 'WARN',
    backendHealth.ok
      ? `${backendHealth.status} in ${backendHealth.durationMs}ms`
      : `${backendHealth.error || backendHealth.status}; port ${config.backendPort} ${
          (await isPortFree(config.backendPort)) ? 'free' : 'in use'
        }`
  );

  if (config.frontendEnabled) {
    const frontendHealth = await httpHealth(
      `http://127.0.0.1:${config.frontendPort}/`,
      config.healthTimeoutMs
    );
    add(
      'webui health',
      frontendHealth.ok ? 'PASS' : 'WARN',
      frontendHealth.ok
        ? `${frontendHealth.status} in ${frontendHealth.durationMs}ms`
        : `${frontendHealth.error || frontendHealth.status}; port ${config.frontendPort} ${
            (await isPortFree(config.frontendPort)) ? 'free' : 'in use'
          }`
    );
  }

  const state = readState(config);
  add(
    'daemon state',
    state ? 'PASS' : 'WARN',
    state ? `status=${state.status} updated=${new Date(state.updatedAt).toISOString()}` : 'state.json missing'
  );

  const service = getServiceStatus(config);
  add(
    'service manager',
    service.manager === 'none' ? 'WARN' : 'PASS',
    `${service.manager}${service.installed ? ' installed' : ' not installed'}${
      service.active ? ' active' : ''
    }`
  );

  const pidFiles = [
    ['daemon', config.pidFile],
    ['watchdog', config.watchdogPidFile],
    ['backend', config.backendPidFile],
    ['frontend', config.frontendPidFile],
  ] as const;
  for (const [name, file] of pidFiles) {
    const pid = readPid(file);
    if (!pid) {
      add(`${name} pid file`, 'PASS', 'not present');
    } else if (pidAlive(pid)) {
      add(`${name} pid file`, 'PASS', `pid ${pid} alive`);
    } else {
      add(`${name} pid file`, 'WARN', `stale pid ${pid}`);
    }
  }

  try {
    const stats = (fs as any).statfsSync?.(config.dataDir);
    if (stats) {
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      add(
        'disk space',
        freeBytes > 100 * 1024 * 1024 ? 'PASS' : 'WARN',
        `${Math.round(freeBytes / 1024 / 1024)} MB free`
      );
    }
  } catch {
    // optional check
  }

  const failures = checks.filter((check) => check.status === 'FAIL').length;
  const warnings = checks.filter((check) => check.status === 'WARN').length;

  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify({ checks, failures, warnings }, null, 2));
  } else {
    console.log('Mythgram daemon doctor');
    for (const check of checks) {
      console.log(`  [${check.status}] ${check.name}: ${check.detail}`);
    }
    console.log(`  ${failures} failure(s), ${warnings} warning(s)`);
  }
  return failures > 0 ? 1 : 0;
}

async function installCommand(config: DaemonConfig, args: string[]): Promise<number> {
  const logger = makeLogger(config);
  const managerRaw = flagValue(args, '--manager');
  const manager: ServiceManager | undefined =
    managerRaw === 'systemd' || managerRaw === 'launchd' || managerRaw === 'cron'
      ? managerRaw
      : undefined;
  const result = installService(config, logger, {
    user: hasFlag(args, '--user'),
    frontendEnabled: config.frontendEnabled,
    manager,
  });
  console.log(`Installed ${result.manager} service${result.path ? ` at ${result.path}` : ''}.`);
  for (const note of result.notes) console.log(`  note: ${note}`);
  if (!hasFlag(args, '--no-start') && result.manager === 'cron') {
    await ensureCommand(config);
  }
  console.log(`Logs: ${config.daemonLog}`);
  return 0;
}

async function uninstallCommand(config: DaemonConfig): Promise<number> {
  const logger = makeLogger(config);
  await stopCommand(config);
  const result = uninstallService(config, logger);
  console.log(`Uninstalled ${result.manager} service.`);
  for (const note of result.notes) console.log(`  note: ${note}`);
  return 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0] || 'help';
  const args = argv.slice(1);
  const config = configFromArgs(args);
  ensureDaemonDirs(config);

  let code = 0;
  switch (command) {
    case 'start':
      code = await startCommand(config, args);
      break;
    case 'stop':
      code = await stopCommand(config);
      break;
    case 'restart':
      code = await restartCommand(config, args);
      break;
    case 'status':
      code = await statusCommand(config, args);
      break;
    case 'logs':
      code = logsCommand(config, args);
      break;
    case 'ensure':
      code = await ensureCommand(config);
      break;
    case 'doctor':
      code = await doctorCommand(config, args);
      break;
    case 'install':
      code = await installCommand(config, args);
      break;
    case 'uninstall':
      code = await uninstallCommand(config);
      break;
    case 'version':
      console.log('mythgram-daemon 1.0.0');
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      code = 1;
  }
  process.exitCode = code;
}

main().catch((err) => {
  console.error(`Fatal daemon error: ${err?.stack || err}`);
  process.exit(1);
});
