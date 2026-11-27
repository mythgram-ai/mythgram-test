import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildBackendCommand,
  buildFrontendCommand,
  childEnvironment,
  describeConfig,
  ensureDaemonDirs,
  type DaemonConfig,
} from './config.js';
import { DaemonLogger, openChildLog, rotateFile } from './logger.js';
import {
  findListeningPids,
  formatDuration,
  httpHealth,
  isPortFree,
  killProcessTree,
  looksLikeMythgramProcess,
  pidAlive,
  readPid,
  sleep,
  waitForPortFree,
  type HttpHealth,
} from './health.js';

export type ProcessState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'unhealthy'
  | 'backoff'
  | 'stopping';

export interface ManagedProcessSnapshot {
  name: string;
  pid: number | null;
  state: ProcessState;
  restarts: number;
  restartsInWindow: number;
  healthFailures: number;
  lastStartAt: number | null;
  lastExitAt: number | null;
  lastExitCode: number | null;
  lastExitSignal: string | null;
  lastReason: string | null;
  nextRestartAt: number | null;
  uptimeMs: number;
  healthy: boolean;
  lastHealth: HttpHealth | null;
  port: number | null;
  healthUrl: string | null;
}

export interface ManagedProcessOptions {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  logFile: string;
  pidFile: string;
  port?: number;
  healthUrl?: string;
  config: DaemonConfig;
  logger: DaemonLogger;
  onEvent: (type: string, message: string, data?: unknown) => void;
}

export class ManagedProcess {
  private child: ChildProcess | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private state: ProcessState = 'stopped';
  private restarts: number[] = [];
  private consecutiveFailures = 0;
  private healthFailures = 0;
  private lastStartAt: number | null = null;
  private lastExitAt: number | null = null;
  private lastExitCode: number | null = null;
  private lastExitSignal: string | null = null;
  private lastReason: string | null = null;
  private nextRestartAt: number | null = null;
  private lastHealth: HttpHealth | null = null;
  private stopping = false;
  private generation = 0;

  constructor(private readonly options: ManagedProcessOptions) {}

  public getName(): string {
    return this.options.name;
  }

  public isStopping(): boolean {
    return this.stopping;
  }

  public isRunning(): boolean {
    return this.state === 'running' || this.state === 'starting' || this.state === 'unhealthy';
  }

  private event(type: string, message: string, data?: unknown): void {
    this.options.onEvent(type, `[${this.options.name}] ${message}`, data);
  }

  private writePidFile(): void {
    try {
      fs.mkdirSync(path.dirname(this.options.pidFile), { recursive: true });
      if (this.child?.pid) {
        fs.writeFileSync(this.options.pidFile, String(this.child.pid), 'utf-8');
      }
    } catch {
      // pid files are advisory
    }
  }

  private removePidFile(): void {
    try {
      fs.unlinkSync(this.options.pidFile);
    } catch {
      // ignore
    }
  }

  private async clearStaleListener(reason: string): Promise<boolean> {
    let killed = false;
    const stalePid = readPid(this.options.pidFile);
    if (stalePid && stalePid !== process.pid && pidAlive(stalePid)) {
      if (looksLikeMythgramProcess(stalePid, this.options.config.projectRoot)) {
        this.event('recover', `Stopping stale ${this.options.name} process ${stalePid} (${reason}).`, {
          pid: stalePid,
        });
        killProcessTree(stalePid, 'SIGTERM');
        await sleep(1_200);
        if (pidAlive(stalePid)) {
          killProcessTree(stalePid, 'SIGKILL');
          await sleep(600);
        }
        killed = true;
      } else {
        this.event('recover', `Ignoring stale pid ${stalePid}; it is not a Mythgram process.`, {
          pid: stalePid,
        });
      }
    }
    this.removePidFile();

    if (this.options.port) {
      const listeners = findListeningPids(this.options.port);
      for (const pid of listeners) {
        if (pid === process.pid || !pidAlive(pid)) continue;
        if (!looksLikeMythgramProcess(pid, this.options.config.projectRoot)) continue;
        this.event(
          'recover',
          `Stopping orphaned listener ${pid} on port ${this.options.port} (${reason}).`,
          { pid }
        );
        killProcessTree(pid, 'SIGTERM');
        await sleep(800);
        if (pidAlive(pid)) {
          killProcessTree(pid, 'SIGKILL');
          await sleep(400);
        }
        killed = true;
      }
    }
    return killed;
  }

  public async start(reason = 'initial'): Promise<void> {
    if (this.stopping) return;
    if (this.child && pidAlive(this.child.pid)) return;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    this.state = 'starting';
    this.lastReason = reason;
    this.nextRestartAt = null;
    this.event('start', `Starting (${reason}).`, {
      command: this.options.command,
      args: this.options.args,
      cwd: this.options.cwd,
    });

    if (this.options.port) {
      if (!(await isPortFree(this.options.port))) {
        const cleared = await this.clearStaleListener('port already in use');
        const free = cleared
          ? await waitForPortFree(this.options.port, 5_000)
          : await isPortFree(this.options.port);
        if (!free) {
          this.event('error', `Port ${this.options.port} is occupied by an unknown process.`, {
            port: this.options.port,
          });
          this.scheduleRestart(`port ${this.options.port} occupied`);
          return;
        }
      }
    }

    rotateFile(this.options.logFile, this.options.config.logMaxBytes, this.options.config.logMaxFiles);
    let fd: number | null = null;
    try {
      fd = openChildLog(this.options.logFile);
      const generation = ++this.generation;
      const child = spawn(this.options.command, this.options.args, {
        cwd: this.options.cwd,
        env: this.options.env,
        detached: true,
        stdio: ['ignore', fd, fd],
      });
      this.child = child;
      this.writePidFile();

      child.once('spawn', () => {
        if (generation !== this.generation) return;
        this.state = 'running';
        this.lastStartAt = Date.now();
        this.healthFailures = 0;
        this.event('spawned', `Process started with pid ${child.pid}.`, { pid: child.pid });
      });

      child.once('exit', (code, signal) => {
        if (generation !== this.generation) return;
        this.child = null;
        this.lastExitAt = Date.now();
        this.lastExitCode = code;
        this.lastExitSignal = signal ? String(signal) : null;
        this.removePidFile();
        if (this.stopping) {
          this.state = 'stopped';
          this.event('stopped', 'Process stopped.');
          return;
        }
        this.event('exit', `Process exited (code=${code}, signal=${signal ?? 'none'}).`, {
          code,
          signal,
        });
        this.scheduleRestart(`exit code ${code ?? 'null'} signal ${signal ?? 'none'}`);
      });

      child.once('error', (err) => {
        if (generation !== this.generation) return;
        this.event('error', `Failed to spawn: ${err.message}`);
        this.child = null;
        this.removePidFile();
        if (!this.stopping) this.scheduleRestart(`spawn error: ${err.message}`);
      });
    } catch (err: any) {
      this.event('error', `Spawn threw: ${err?.message || err}`);
      this.scheduleRestart(`spawn threw: ${err?.message || err}`);
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          // ignore
        }
      }
    }
  }

  private scheduleRestart(reason: string): void {
    if (this.stopping) return;
    const now = Date.now();
    if (this.lastStartAt && now - this.lastStartAt > this.options.config.stableUptimeMs) {
      this.consecutiveFailures = 0;
    }
    this.consecutiveFailures += 1;
    this.restarts.push(now);
    const windowMs = this.options.config.restartWindowMs;
    this.restarts = this.restarts.filter((at) => now - at <= windowMs);
    const restartsInWindow = this.restarts.length;

    const exponent = Math.min(this.consecutiveFailures - 1, 6);
    let delay =
      this.options.config.restartBaseDelayMs * Math.pow(2, exponent) +
      Math.floor(Math.random() * 400);
    if (restartsInWindow > this.options.config.maxRestartsInWindow) {
      delay = Math.max(this.options.config.restartMaxDelayMs, 60_000);
      this.event(
        'storm',
        `Restart storm detected (${restartsInWindow} restarts in ${Math.round(windowMs / 1000)}s); cooling down for ${Math.round(delay / 1000)}s.`
      );
    }
    delay = Math.min(Math.max(delay, this.options.config.restartBaseDelayMs), Math.max(delay, this.options.config.restartMaxDelayMs));

    this.state = 'backoff';
    this.lastReason = reason;
    this.nextRestartAt = now + delay;
    this.event('backoff', `Restarting in ${Math.round(delay / 1000)}s (${reason}).`, {
      delayMs: delay,
      failures: this.consecutiveFailures,
      restartsInWindow,
    });

    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.start('restart');
    }, delay);
  }

  public async stop(graceMs = this.options.config.stopGraceMs): Promise<void> {
    this.stopping = true;
    this.generation += 1;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    if (!child || !child.pid) {
      this.state = 'stopped';
      this.removePidFile();
      return;
    }
    this.state = 'stopping';
    this.event('stopping', `Sending SIGTERM to pid ${child.pid}.`, { pid: child.pid });
    killProcessTree(child.pid, 'SIGTERM');
    const exited = await Promise.race([
      new Promise<boolean>((resolve) => child.once('exit', () => resolve(true))),
      sleep(graceMs).then(() => false),
    ]);
    if (!exited) {
      this.event('force-kill', `Grace period expired; sending SIGKILL to pid ${child.pid}.`);
      killProcessTree(child.pid, 'SIGKILL');
      await Promise.race([
        new Promise<void>((resolve) => child.once('exit', () => resolve())),
        sleep(2_000).then(() => undefined),
      ]);
    }
    this.child = null;
    this.state = 'stopped';
    this.nextRestartAt = null;
    await this.clearStaleListener('stop cleanup');
    this.removePidFile();
    this.event('stopped', 'Process stopped.');
  }

  public async restart(reason: string): Promise<void> {
    this.stopping = false;
    await this.stop();
    this.stopping = false;
    await sleep(300);
    await this.start(reason);
  }

  public async checkHealth(): Promise<void> {
    if (!this.options.healthUrl) return;
    if (!this.child || !pidAlive(this.child.pid)) return;
    if (this.state === 'backoff' || this.state === 'stopping' || this.state === 'stopped') return;
    if (this.lastStartAt && Date.now() - this.lastStartAt < this.options.config.startupGraceMs) {
      return;
    }
    const result = await httpHealth(this.options.healthUrl, this.options.config.healthTimeoutMs);
    this.lastHealth = result;
    if (result.ok) {
      if (this.state === 'unhealthy') {
        this.state = 'running';
        this.event('recovered', `Health check recovered (${result.status}).`);
      }
      this.healthFailures = 0;
      return;
    }
    this.healthFailures += 1;
    this.event('unhealthy', `Health check failed (${this.healthFailures}/${this.options.config.healthFailureThreshold}): ${result.error || result.status}.`);
    if (this.healthFailures >= this.options.config.healthFailureThreshold) {
      this.state = 'unhealthy';
      this.event('restart', 'Health threshold reached; restarting the process.');
      await this.restart('health check failed');
    }
  }

  public snapshot(): ManagedProcessSnapshot {
    const uptimeMs =
      this.lastStartAt && this.child && pidAlive(this.child.pid)
        ? Date.now() - this.lastStartAt
        : 0;
    return {
      name: this.options.name,
      pid: this.child?.pid ?? null,
      state: this.state,
      restarts: this.restarts.length,
      restartsInWindow: this.restarts.filter(
        (at) => Date.now() - at <= this.options.config.restartWindowMs
      ).length,
      healthFailures: this.healthFailures,
      lastStartAt: this.lastStartAt,
      lastExitAt: this.lastExitAt,
      lastExitCode: this.lastExitCode,
      lastExitSignal: this.lastExitSignal,
      lastReason: this.lastReason,
      nextRestartAt: this.nextRestartAt,
      uptimeMs,
      healthy: this.lastHealth?.ok ?? false,
      lastHealth: this.lastHealth,
      port: this.options.port ?? null,
      healthUrl: this.options.healthUrl ?? null,
    };
  }

  public describeUptime(): string {
    const snapshot = this.snapshot();
    return snapshot.uptimeMs ? formatDuration(snapshot.uptimeMs) : '—';
  }
}

export interface DaemonEvent {
  at: number;
  type: string;
  message: string;
  data?: unknown;
}

export interface SupervisorState {
  daemonPid: number;
  startedAt: number;
  updatedAt: number;
  status: 'running' | 'stopping' | 'stopped' | 'error';
  processes: ManagedProcessSnapshot[];
  events: DaemonEvent[];
  config: Record<string, unknown>;
  serviceManager?: string;
  lastHealthAt?: number | null;
}

export class Supervisor {
  private readonly processes: ManagedProcess[] = [];
  private healthTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private startedAt = 0;
  private status: SupervisorState['status'] = 'stopped';
  private events: DaemonEvent[] = [];
  private lastHealthAt: number | null = null;
  private serviceManager = 'none';

  constructor(
    private readonly config: DaemonConfig,
    private readonly logger: DaemonLogger
  ) {
    const backend = buildBackendCommand(config);
    this.processes.push(
      new ManagedProcess({
        name: 'backend',
        command: backend.command,
        args: backend.args,
        cwd: config.projectRoot,
        env: childEnvironment(config, {
          PORT: String(config.backendPort),
        }),
        logFile: config.backendLog,
        pidFile: config.backendPidFile,
        port: config.backendPort,
        healthUrl: `http://127.0.0.1:${config.backendPort}${config.healthPath}`,
        config,
        logger,
        onEvent: (type, message, data) => this.recordEvent(type, message, data),
      })
    );

    if (config.frontendEnabled) {
      const frontend = buildFrontendCommand(config);
      this.processes.push(
        new ManagedProcess({
          name: 'frontend',
          command: frontend.command,
          args: frontend.args,
          cwd: path.join(config.projectRoot, 'webui'),
          env: childEnvironment(config, {
            PORT: String(config.frontendPort),
            MYTHGRAM_BACKEND_URL: `http://127.0.0.1:${config.backendPort}`,
          }),
          logFile: config.frontendLog,
          pidFile: config.frontendPidFile,
          port: config.frontendPort,
          healthUrl: `http://127.0.0.1:${config.frontendPort}/`,
          config,
          logger,
          onEvent: (type, message, data) => this.recordEvent(type, message, data),
        })
      );
    }
  }

  public setServiceManager(manager: string): void {
    this.serviceManager = manager;
  }

  public recordEvent(type: string, message: string, data?: unknown): void {
    const event: DaemonEvent = { at: Date.now(), type, message, data };
    this.events.push(event);
    if (this.events.length > 300) this.events = this.events.slice(-300);
    if (type === 'error' || type === 'storm' || type === 'crash') {
      this.logger.error(message, data);
    } else if (type === 'exit' || type === 'unhealthy' || type === 'restart') {
      this.logger.warn(message, data);
    } else {
      this.logger.info(message, data);
    }
  }

  public getConfig(): DaemonConfig {
    return this.config;
  }

  public getProcess(name: string): ManagedProcess | undefined {
    return this.processes.find((process) => process.getName() === name);
  }

  public async start(): Promise<void> {
    ensureDaemonDirs(this.config);
    if (this.status === 'running') return;
    this.startedAt = Date.now();
    this.status = 'running';
    this.recordEvent('daemon-start', 'Daemon started; launching supervised processes.', {
      projectRoot: this.config.projectRoot,
      frontend: this.config.frontendEnabled,
    });
    this.writeState();
    await Promise.all(this.processes.map((process) => process.start('daemon start')));
    this.startTimers();
    this.writeState();
    this.writeHeartbeat();
  }

  private startTimers(): void {
    if (!this.healthTimer) {
      this.healthTimer = setInterval(() => {
        void this.checkAllHealth();
      }, this.config.healthIntervalMs);
      if (this.healthTimer.unref) this.healthTimer.unref();
    }
    if (!this.tickTimer) {
      this.tickTimer = setInterval(() => {
        try {
          this.writeState();
          this.writeHeartbeat();
        } catch (err: any) {
          this.logger.error('Failed to write daemon state/heartbeat.', err?.message || err);
        }
      }, this.config.tickIntervalMs);
      if (this.tickTimer.unref) this.tickTimer.unref();
    }
  }

  private stopTimers(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.healthTimer = null;
    this.tickTimer = null;
  }

  public async checkAllHealth(): Promise<void> {
    if (this.status !== 'running') return;
    try {
      await Promise.all(this.processes.map((process) => process.checkHealth()));
      this.lastHealthAt = Date.now();
      this.writeState();
      this.writeHeartbeat();
    } catch (err: any) {
      this.recordEvent('error', `Health sweep failed: ${err?.message || err}`);
    }
  }

  public async restartAll(reason: string): Promise<void> {
    this.recordEvent('restart-all', `Restarting all processes: ${reason}.`);
    await Promise.all(this.processes.map((process) => process.restart(reason)));
    this.writeState();
    this.writeHeartbeat();
  }

  public async stop(): Promise<void> {
    if (this.status === 'stopped' || this.status === 'stopping') return;
    this.status = 'stopping';
    this.recordEvent('daemon-stop', 'Stopping daemon and all supervised processes.');
    this.writeState();
    this.stopTimers();
    await Promise.all(this.processes.map((process) => process.stop()));
    this.status = 'stopped';
    this.recordEvent('daemon-stopped', 'Daemon stopped.');
    this.writeState();
    this.writeHeartbeat();
  }

  public getSnapshot(): SupervisorState {
    return {
      daemonPid: process.pid,
      startedAt: this.startedAt,
      updatedAt: Date.now(),
      status: this.status,
      processes: this.processes.map((process) => process.snapshot()),
      events: this.events.slice(-200),
      config: describeConfig(this.config),
      serviceManager: this.serviceManager,
      lastHealthAt: this.lastHealthAt,
    };
  }

  public getEvents(limit = 50): DaemonEvent[] {
    return this.events.slice(-Math.max(1, limit));
  }

  private atomicWrite(file: string, contents: string): void {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
      fs.writeFileSync(tmp, contents, 'utf-8');
      fs.renameSync(tmp, file);
    } catch (err: any) {
      this.logger.error(`Failed to write ${file}: ${err?.message || err}`);
    }
  }

  public writeState(): void {
    const state = this.getSnapshot();
    this.atomicWrite(this.config.stateFile, JSON.stringify(state, null, 2) + '\n');
  }

  public writeHeartbeat(): void {
    const heartbeat = {
      pid: process.pid,
      at: Date.now(),
      status: this.status,
      processes: this.processes.map((process) => {
        const snapshot = process.snapshot();
        return {
          name: snapshot.name,
          pid: snapshot.pid,
          state: snapshot.state,
          healthy: snapshot.healthy,
          restarts: snapshot.restarts,
        };
      }),
    };
    this.atomicWrite(this.config.heartbeatFile, JSON.stringify(heartbeat, null, 2) + '\n');
  }
}
