import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { getDataDir } from '../datadir/index.js';
import { assertAbsolutePath } from '../tools/types.js';

export const DEFAULT_LOCAL_TTS_BASE_URL = 'http://localhost:7878';

export interface TtsSettings {
  base_url: string;
}

export interface LocalTtsServiceStatus {
  status: 'stopped' | 'installing' | 'starting' | 'running' | 'error';
  pid: number | null;
  base_url: string;
  logs: string[];
  error?: string;
  started_at?: number;
  reachable?: boolean;
}

const DEFAULT_TTS_SETTINGS: TtsSettings = {
  base_url: DEFAULT_LOCAL_TTS_BASE_URL,
};

let ttsProc: ChildProcess | null = null;
let serviceStatus: LocalTtsServiceStatus['status'] = 'stopped';
let serviceError: string | undefined = undefined;
let startedAt: number | undefined = undefined;
const serviceLogs: string[] = [];
const MAX_LOG_LINES = 600;

function appendLog(text: string) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() && lines.length > 1) continue;
    const timestamp = new Date().toLocaleTimeString();
    serviceLogs.push(`[${timestamp}] ${line}`);
    if (serviceLogs.length > MAX_LOG_LINES) {
      serviceLogs.shift();
    }
  }
}

export function ensureTtsStore(): { ttsDir: string; ttsJsonPath: string } {
  const paths = getDataDir();
  if (!fsSync.existsSync(paths.ttsDir)) {
    fsSync.mkdirSync(paths.ttsDir, { recursive: true, mode: 0o700 });
  }
  if (!fsSync.existsSync(paths.ttsJsonPath)) {
    fsSync.writeFileSync(
      paths.ttsJsonPath,
      JSON.stringify(DEFAULT_TTS_SETTINGS, null, 2) + '\n',
      'utf-8'
    );
  }
  return { ttsDir: paths.ttsDir, ttsJsonPath: paths.ttsJsonPath };
}

export async function getTtsSettings(): Promise<TtsSettings> {
  const { ttsJsonPath } = ensureTtsStore();
  try {
    const raw = await fs.readFile(ttsJsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const baseUrl =
      typeof parsed?.base_url === 'string' && parsed.base_url.trim()
        ? parsed.base_url.trim().replace(/\/+$/, '')
        : DEFAULT_LOCAL_TTS_BASE_URL;
    return { base_url: baseUrl };
  } catch {
    return { ...DEFAULT_TTS_SETTINGS };
  }
}

export function getTtsSettingsSync(): TtsSettings {
  const { ttsJsonPath } = ensureTtsStore();
  try {
    const raw = fsSync.readFileSync(ttsJsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const baseUrl =
      typeof parsed?.base_url === 'string' && parsed.base_url.trim()
        ? parsed.base_url.trim().replace(/\/+$/, '')
        : DEFAULT_LOCAL_TTS_BASE_URL;
    return { base_url: baseUrl };
  } catch {
    return { ...DEFAULT_TTS_SETTINGS };
  }
}

export async function updateTtsSettings(patch: Partial<TtsSettings>): Promise<TtsSettings> {
  const current = await getTtsSettings();
  const nextBaseUrl =
    typeof patch.base_url === 'string' && patch.base_url.trim()
      ? patch.base_url.trim().replace(/\/+$/, '')
      : current.base_url || DEFAULT_LOCAL_TTS_BASE_URL;

  if (!/^https?:\/\//i.test(nextBaseUrl)) {
    throw new Error('Base URL must start with http:// or https://');
  }

  const next: TtsSettings = {
    base_url: nextBaseUrl,
  };
  const { ttsJsonPath } = ensureTtsStore();
  await fs.writeFile(ttsJsonPath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  return next;
}

export async function checkLocalTtsReachable(baseUrl?: string): Promise<boolean> {
  const target = (baseUrl || getTtsSettingsSync().base_url || DEFAULT_LOCAL_TTS_BASE_URL).replace(
    /\/+$/,
    ''
  );
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(target, { signal: controller.signal }).catch(() => null);
    clearTimeout(timer);
    return Boolean(res);
  } catch {
    return false;
  }
}

export async function getLocalTtsStatus(): Promise<LocalTtsServiceStatus> {
  const settings = await getTtsSettings();
  const reachable = await checkLocalTtsReachable(settings.base_url);
  let effectiveStatus = serviceStatus;
  if (reachable && (effectiveStatus === 'starting' || effectiveStatus === 'stopped')) {
    effectiveStatus = 'running';
  }
  return {
    status: effectiveStatus,
    pid: ttsProc?.pid ?? null,
    base_url: settings.base_url,
    logs: [...serviceLogs],
    error: serviceError,
    started_at: startedAt,
    reachable,
  };
}

export function clearLocalTtsLogs(): void {
  serviceLogs.length = 0;
}

export function stopLocalTtsService(): LocalTtsServiceStatus {
  if (ttsProc && !ttsProc.killed) {
    try {
      ttsProc.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
  ttsProc = null;
  serviceStatus = 'stopped';
  appendLog('Local TTS process stopped by user.');
  const settings = getTtsSettingsSync();
  return {
    status: serviceStatus,
    pid: null,
    base_url: settings.base_url,
    logs: [...serviceLogs],
    error: serviceError,
    started_at: startedAt,
  };
}

/**
 * Runs the two terminal commands required by the specification:
 * 1) `pip install local-tts-studio`
 * 2) `local-tts`
 * Captures live stdout/stderr logs so the user can monitor installation and startup in real time.
 */
export async function startLocalTtsService(): Promise<LocalTtsServiceStatus> {
  const settings = await getTtsSettings();
  if (
    ttsProc &&
    !ttsProc.killed &&
    (serviceStatus === 'installing' || serviceStatus === 'starting' || serviceStatus === 'running')
  ) {
    return await getLocalTtsStatus();
  }

  serviceError = undefined;
  startedAt = Date.now();
  serviceStatus = 'installing';
  appendLog('$ pip install local-tts-studio');

  const isWin = process.platform === 'win32';
  const shellCmd = isWin ? 'cmd.exe' : '/bin/bash';
  // Ensure ~/.local/bin and standard python script paths are in PATH when running local-tts
  const commandStr = isWin
    ? 'pip install local-tts-studio && local-tts'
    : 'export PATH="$HOME/.local/bin:$PATH"; pip install local-tts-studio && local-tts';
  const shellArgs = isWin ? ['/d', '/s', '/c', commandStr] : ['-lc', commandStr];

  try {
    const child = spawn(shellCmd, shellArgs, {
      cwd: getDataDir().baseDir,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    ttsProc = child;

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      appendLog(text);
      if (
        serviceStatus === 'installing' &&
        (/Successfully installed|Requirement already satisfied|Starting|Running on|Uvicorn|http:\/\/|7878/i.test(
          text
        ))
      ) {
        serviceStatus = 'starting';
      }
      if (/Running on|Uvicorn running|http:\/\/.*7878|Application startup complete|Listening/i.test(text)) {
        serviceStatus = 'running';
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      appendLog(text);
      if (/Running on|Uvicorn running|http:\/\/.*7878|Application startup complete/i.test(text)) {
        serviceStatus = 'running';
      }
    });

    child.on('error', (err) => {
      serviceStatus = 'error';
      serviceError = err.message || 'Failed to spawn local-tts process.';
      appendLog(`[ERROR] ${serviceError}`);
      ttsProc = null;
    });

    child.on('close', (code) => {
      if (code !== 0 && code !== null) {
        serviceStatus = 'error';
        serviceError = `Process exited with code ${code}. See logs and manual setup guide below.`;
        appendLog(`[EXIT] Process exited with code ${code}`);
      } else {
        if (serviceStatus !== 'error') {
          serviceStatus = 'stopped';
        }
        appendLog(`[EXIT] Process exited with code ${code ?? 0}`);
      }
      ttsProc = null;
    });
  } catch (err: any) {
    serviceStatus = 'error';
    serviceError = err?.message || 'Unable to start local-tts.';
    appendLog(`[ERROR] ${serviceError}`);
  }

  return {
    status: serviceStatus,
    pid: ttsProc?.pid ?? null,
    base_url: settings.base_url,
    logs: [...serviceLogs],
    error: serviceError,
    started_at: startedAt,
  };
}

export interface GenerateSpeechParams {
  speech: string;
  output_directory: string;
  baseUrl?: string;
  signal?: AbortSignal;
}

export interface GenerateSpeechResult {
  success: boolean;
  file_path: string;
  file_name: string;
  output_directory: string;
  bytes: number;
  format: string;
  content_type: string;
  provider: 'local-tts';
  endpoint: string;
  speech_length: number;
  created_at: string;
}

/**
 * Calls the OpenAI-compatible Local TTS endpoint:
 * POST `<baseUrl>/v1/audio/speech` with `{"input": speech}`
 * Saves the generated audio file into `output_directory` and returns only file metadata (never raw audio to LLM).
 */
export async function generateSpeechWithLocalTts(
  params: GenerateSpeechParams
): Promise<GenerateSpeechResult> {
  const speech = typeof params.speech === 'string' ? params.speech.trim() : '';
  if (!speech) {
    throw new Error('speech is required and must be a non-empty string.');
  }

  const outputDir = assertAbsolutePath(params.output_directory, 'output_directory');
  await fs.mkdir(outputDir, { recursive: true });

  const settings = await getTtsSettings();
  const rawBaseUrl = (params.baseUrl || settings.base_url || DEFAULT_LOCAL_TTS_BASE_URL)
    .trim()
    .replace(/\/+$/, '');

  // Support base URLs with or without `/v1` suffix
  const endpoint = rawBaseUrl.endsWith('/v1/audio/speech')
    ? rawBaseUrl
    : rawBaseUrl.endsWith('/v1')
    ? `${rawBaseUrl}/audio/speech`
    : `${rawBaseUrl}/v1/audio/speech`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: speech,
      }),
      signal: params.signal,
    });
  } catch (err: any) {
    throw new Error(
      `Failed to connect to local-tts server at ${endpoint}: ${
        err?.message || String(err)
      }. Make sure local-tts is running (open the TTS page in Mythgram or run "pip install local-tts-studio && local-tts").`
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `local-tts server returned HTTP ${response.status} (${response.statusText})${
        errText ? `: ${errText.slice(0, 400)}` : ''
      }`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);
  if (audioBuffer.length === 0) {
    throw new Error('local-tts server returned an empty audio response.');
  }

  const contentType = (response.headers.get('content-type') || 'audio/wav').toLowerCase();
  let ext = 'wav';
  if (contentType.includes('mpeg') || contentType.includes('mp3')) ext = 'mp3';
  else if (contentType.includes('ogg')) ext = 'ogg';
  else if (contentType.includes('flac')) ext = 'flac';
  else if (contentType.includes('aac') || contentType.includes('m4a')) ext = 'm4a';

  const timestamp = Date.now();
  const uniqueSuffix = Math.random().toString(36).slice(2, 7);
  const fileName = `speech_${timestamp}_${uniqueSuffix}.${ext}`;
  const filePath = path.join(outputDir, fileName);

  await fs.writeFile(filePath, audioBuffer);

  return {
    success: true,
    file_path: filePath,
    file_name: fileName,
    output_directory: outputDir,
    bytes: audioBuffer.length,
    format: ext,
    content_type: contentType,
    provider: 'local-tts',
    endpoint,
    speech_length: speech.length,
    created_at: new Date(timestamp).toISOString(),
  };
}
