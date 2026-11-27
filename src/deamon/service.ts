import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildSelfCommand,
  childEnvironment,
  ensureDaemonDirs,
  type DaemonConfig,
} from './config.js';
import type { DaemonLogger } from './logger.js';

export type ServiceManager = 'systemd' | 'launchd' | 'cron' | 'none';

const CRON_BEGIN = '# >>> mythgram-deamon >>>';
const CRON_END = '# <<< mythgram-deamon <<<';
const LAUNCHD_LABEL = 'com.mythgram.deamon';

interface RunResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(command: string, args: string[], input?: string): RunResult {
  try {
    const result = spawnSync(command, args, {
      input,
      encoding: 'utf-8',
      timeout: 20_000,
      env: process.env,
    });
    return {
      ok: result.status === 0,
      status: result.status,
      stdout: String(result.stdout || ''),
      stderr: String(result.stderr || ''),
    };
  } catch (err: any) {
    return { ok: false, status: null, stdout: '', stderr: err?.message || String(err) };
  }
}

function commandExists(name: string): boolean {
  const result = run('sh', ['-lc', `command -v ${name}`]);
  return result.ok && Boolean(result.stdout.trim());
}

export function detectServiceManager(): ServiceManager {
  if (process.platform === 'darwin' && commandExists('launchctl')) return 'launchd';
  if (process.platform === 'linux' && fs.existsSync('/run/systemd/system') && commandExists('systemctl')) {
    return 'systemd';
  }
  if (commandExists('crontab')) return 'cron';
  return 'none';
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function systemdQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ensureCommandArgs(config: DaemonConfig, frontendEnabled: boolean): string[] {
  const args = [
    'ensure',
    '--backend-port',
    String(config.backendPort),
    '--frontend-port',
    String(config.frontendPort),
  ];
  if (!frontendEnabled) args.push('--no-frontend');
  return args;
}

export function buildEnsureCommand(config: DaemonConfig, frontendEnabled: boolean): string {
  const self = buildSelfCommand(config, ensureCommandArgs(config, frontendEnabled));
  const env = [
    `MYTHGRAM_PROJECT_ROOT=${shellQuote(config.projectRoot)}`,
    `MYTHGRAM_START_DIR=${shellQuote(config.projectRoot)}`,
    `MYTHGRAM_DEAMON_DATA_DIR=${shellQuote(config.dataDir)}`,
  ].join(' ');
  return `${env} ${[self.command, ...self.args].map(shellQuote).join(' ')}`;
}

function systemdUnitPath(user: boolean): string {
  return user
    ? path.join(os.homedir(), '.config', 'systemd', 'user', 'mythgram.service')
    : '/etc/systemd/system/mythgram.service';
}

function systemdUnit(config: DaemonConfig, user: boolean, frontendEnabled: boolean): string {
  const self = buildSelfCommand(config, [
    'start',
    '--foreground',
    '--no-watchdog',
    '--backend-port',
    String(config.backendPort),
    '--frontend-port',
    String(config.frontendPort),
    ...(frontendEnabled ? [] : ['--no-frontend']),
  ]);
  const execStart = [self.command, ...self.args].map(systemdQuote).join(' ');
  const pathValue = [
    path.dirname(config.nodeBinary),
    '/usr/local/sbin',
    '/usr/local/bin',
    '/usr/sbin',
    '/usr/bin',
    '/sbin',
    '/bin',
  ].join(':');
  return `[Unit]
Description=Mythgram AI Agent (self-healing daemon)
Documentation=https://github.com/
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=${config.projectRoot}
Environment=${systemdQuote(`MYTHGRAM_START_DIR=${config.projectRoot}`)}
Environment=${systemdQuote(`MYTHGRAM_PROJECT_ROOT=${config.projectRoot}`)}
Environment=${systemdQuote(`MYTHGRAM_DEAMON_FRONTEND=${frontendEnabled ? '1' : '0'}`)}
Environment=${systemdQuote(`NODE_ENV=${process.env.NODE_ENV || 'development'}`)}
Environment=${systemdQuote(`PATH=${pathValue}`)}
ExecStart=${execStart}
Restart=always
RestartSec=3
TimeoutStopSec=25
KillMode=control-group
KillSignal=SIGTERM
StandardOutput=append:${config.daemonLog}
StandardError=append:${config.daemonLog}

[Install]
WantedBy=${user ? 'default.target' : 'multi-user.target'}
`;
}

function launchdPlistPath(): string {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`);
}

function launchdPlist(config: DaemonConfig, frontendEnabled: boolean): string {
  const self = buildSelfCommand(config, [
    'start',
    '--foreground',
    '--no-watchdog',
    '--backend-port',
    String(config.backendPort),
    '--frontend-port',
    String(config.frontendPort),
    ...(frontendEnabled ? [] : ['--no-frontend']),
  ]);
  const args = [self.command, ...self.args]
    .map((arg) => `      <string>${xmlEscape(arg)}</string>`)
    .join('\n');
  const env = childEnvironment(config, {
    MYTHGRAM_DEAMON_FRONTEND: frontendEnabled ? '1' : '0',
  });
  // Never write credentials or unrelated secrets into a world-readable plist.
  const safeEnvKey = /^(MYTHGRAM_|PORT$|NODE_ENV$|PATH$|HOME$|USER$|LOGNAME$|SHELL$|TMPDIR$|LANG$|LC_)/;
  const envEntries = Object.entries(env)
    .filter(([key, value]) => typeof value === 'string' && safeEnvKey.test(key))
    .map(
      ([key, value]) =>
        `      <key>${xmlEscape(key)}</key>\n      <string>${xmlEscape(String(value))}</string>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LAUNCHD_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${args}
    </array>
    <key>WorkingDirectory</key>
    <string>${xmlEscape(config.projectRoot)}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>${xmlEscape(config.daemonLog)}</string>
    <key>StandardErrorPath</key>
    <string>${xmlEscape(config.daemonLog)}</string>
    <key>EnvironmentVariables</key>
    <dict>
${envEntries}
    </dict>
  </dict>
</plist>
`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripCronBlock(content: string): string {
  const pattern = new RegExp(
    `${escapeRegExp(CRON_BEGIN)}[\\s\\S]*?${escapeRegExp(CRON_END)}\\n?`,
    'g'
  );
  return content.replace(pattern, '');
}

function cronBlock(config: DaemonConfig, frontendEnabled: boolean): string {
  const ensure = buildEnsureCommand(config, frontendEnabled);
  const log = shellQuote(config.daemonLog);
  return [
    CRON_BEGIN,
    `@reboot ${ensure} >> ${log} 2>&1`,
    `* * * * * ${ensure} >> ${log} 2>&1`,
    CRON_END,
    '',
  ].join('\n');
}

function readCrontab(): string {
  const result = run('crontab', ['-l']);
  if (result.ok) return result.stdout;
  if (/no crontab/i.test(result.stderr) || /no crontab/i.test(result.stdout)) return '';
  return '';
}

function writeCrontab(content: string): RunResult {
  return run('crontab', ['-'], content.endsWith('\n') ? content : `${content}\n`);
}

export interface InstallOptions {
  user?: boolean;
  frontendEnabled?: boolean;
  manager?: ServiceManager;
}

export interface InstallResult {
  manager: ServiceManager;
  path?: string;
  notes: string[];
}

export function installService(
  config: DaemonConfig,
  logger: DaemonLogger,
  options: InstallOptions = {}
): InstallResult {
  ensureDaemonDirs(config);
  const manager = options.manager || detectServiceManager();
  const frontendEnabled = options.frontendEnabled ?? config.frontendEnabled;
  const notes: string[] = [];

  if (manager === 'systemd') {
    const user = options.user ?? (process.getuid ? process.getuid() !== 0 : true);
    const unitPath = systemdUnitPath(user);
    fs.mkdirSync(path.dirname(unitPath), { recursive: true });
    fs.writeFileSync(unitPath, systemdUnit(config, user, frontendEnabled), 'utf-8');
    const scope = user ? ['--user'] : [];
    const reload = run('systemctl', [...scope, 'daemon-reload']);
    if (!reload.ok) notes.push(`systemctl daemon-reload failed: ${reload.stderr.trim()}`);
    const enable = run('systemctl', [...scope, 'enable', '--now', 'mythgram.service']);
    if (!enable.ok) notes.push(`systemctl enable --now failed: ${enable.stderr.trim()}`);
    if (user) {
      const linger = run('loginctl', ['enable-linger', os.userInfo().username]);
      if (!linger.ok) {
        notes.push(
          `loginctl enable-linger failed (boot start may require login): ${linger.stderr.trim()}`
        );
      }
    }
    logger.info(`Installed systemd ${user ? 'user' : 'system'} service at ${unitPath}.`);
    return { manager, path: unitPath, notes };
  }

  if (manager === 'launchd') {
    const plistPath = launchdPlistPath();
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(plistPath, launchdPlist(config, frontendEnabled), 'utf-8');
    run('launchctl', ['unload', plistPath]);
    const load = run('launchctl', ['load', '-w', plistPath]);
    if (!load.ok) notes.push(`launchctl load failed: ${load.stderr.trim()}`);
    logger.info(`Installed launchd service at ${plistPath}.`);
    return { manager, path: plistPath, notes };
  }

  if (manager === 'cron') {
    const existing = readCrontab();
    const cleaned = stripCronBlock(existing).replace(/\s+$/, '');
    const next = `${cleaned ? `${cleaned}\n` : ''}${cronBlock(config, frontendEnabled)}`;
    const written = writeCrontab(next);
    if (!written.ok) {
      throw new Error(`Failed to install crontab entries: ${written.stderr.trim()}`);
    }
    notes.push('Installed @reboot and per-minute cron watchdog entries.');
    logger.info('Installed cron @reboot + per-minute self-healing entries.');
    return { manager, path: 'crontab', notes };
  }

  throw new Error(
    'No supported service manager found (systemd, launchd, or crontab). Run the daemon with `npm run daemon:start`.'
  );
}

export interface UninstallResult {
  manager: ServiceManager;
  notes: string[];
}

export function uninstallService(
  config: DaemonConfig,
  logger: DaemonLogger
): UninstallResult {
  const manager = detectServiceManager();
  const notes: string[] = [];

  if (manager === 'systemd') {
    for (const user of [false, true]) {
      const unitPath = systemdUnitPath(user);
      if (!fs.existsSync(unitPath)) continue;
      const scope = user ? ['--user'] : [];
      run('systemctl', [...scope, 'stop', 'mythgram.service']);
      run('systemctl', [...scope, 'disable', 'mythgram.service']);
      try {
        fs.unlinkSync(unitPath);
      } catch {
        // ignore
      }
      run('systemctl', [...scope, 'daemon-reload']);
      notes.push(`Removed systemd ${user ? 'user' : 'system'} unit ${unitPath}.`);
    }
    logger.info('Removed systemd service unit(s).');
    return { manager, notes };
  }

  if (manager === 'launchd') {
    const plistPath = launchdPlistPath();
    if (fs.existsSync(plistPath)) {
      run('launchctl', ['unload', plistPath]);
      try {
        fs.unlinkSync(plistPath);
      } catch {
        // ignore
      }
      notes.push(`Removed launchd plist ${plistPath}.`);
    }
    logger.info('Removed launchd service.');
    return { manager, notes };
  }

  if (manager === 'cron') {
    const existing = readCrontab();
    const cleaned = stripCronBlock(existing).replace(/\s+$/, '');
    const written = writeCrontab(cleaned ? `${cleaned}\n` : '');
    if (!written.ok) notes.push(`crontab update failed: ${written.stderr.trim()}`);
    else notes.push('Removed cron watchdog entries.');
    logger.info('Removed cron watchdog entries.');
    return { manager, notes };
  }

  notes.push('No supported service manager found; nothing to uninstall.');
  return { manager, notes };
}

export interface ServiceStatus {
  manager: ServiceManager;
  installed: boolean;
  active: boolean;
  path?: string;
  details: string;
}

export function getServiceStatus(config: DaemonConfig): ServiceStatus {
  const manager = detectServiceManager();

  if (manager === 'systemd') {
    const user = process.getuid ? process.getuid() !== 0 : true;
    const candidates = [systemdUnitPath(false), systemdUnitPath(true)];
    const unitPath = candidates.find((candidate) => fs.existsSync(candidate));
    const scope = unitPath === systemdUnitPath(true) ? ['--user'] : [];
    const active = run('systemctl', [...scope, 'is-active', 'mythgram.service']);
    return {
      manager,
      installed: Boolean(unitPath),
      active: active.stdout.trim() === 'active',
      path: unitPath,
      details: active.stdout.trim() || active.stderr.trim() || 'unknown',
    };
  }

  if (manager === 'launchd') {
    const plistPath = launchdPlistPath();
    const installed = fs.existsSync(plistPath);
    const listed = run('launchctl', ['list']);
    const active = listed.stdout.includes(LAUNCHD_LABEL);
    return {
      manager,
      installed,
      active,
      path: plistPath,
      details: active ? 'loaded' : 'not loaded',
    };
  }

  if (manager === 'cron') {
    const content = readCrontab();
    const installed = content.includes(CRON_BEGIN);
    return {
      manager,
      installed,
      active: installed,
      path: 'crontab',
      details: installed ? 'cron watchdog entries present' : 'no cron entries',
    };
  }

  return { manager, installed: false, active: false, details: 'no service manager detected' };
}
