import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../datadir/index.js';
import type { ScheduleDefinition, ScheduleRun } from './types.js';

const MAX_RUNS_PER_SCHEDULE = 200;
const MAX_RUNS_TOTAL = 4000;

let mutationQueue: Promise<unknown> = Promise.resolve();

/**
 * Serializes all schedule/run mutations so concurrent HTTP requests and the scheduler
 * tick can never interleave read-modify-write cycles on the JSON stores.
 */
export function withCronStoreLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const next = mutationQueue.then(fn, fn);
  mutationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export interface CronStorePaths {
  cronDir: string;
  schedulesPath: string;
  runsPath: string;
}

export function getCronStorePaths(): CronStorePaths {
  const paths = getDataDir();
  return {
    cronDir: paths.cronDir,
    schedulesPath: paths.cronSchedulesJsonPath,
    runsPath: paths.cronRunsJsonPath,
  };
}

export async function ensureCronStore(): Promise<CronStorePaths> {
  const paths = getCronStorePaths();
  await fs.mkdir(paths.cronDir, { recursive: true });
  for (const file of [paths.schedulesPath, paths.runsPath]) {
    if (!fsSync.existsSync(file)) {
      await fs.writeFile(file, '[]\n', 'utf-8');
    }
  }
  return paths;
}

async function readJsonArray<T>(file: string): Promise<T[]> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf-8');
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
    await atomicWrite(file, '[]\n');
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Expected a JSON array.');
    return parsed as T[];
  } catch {
    await fs.copyFile(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined);
    await atomicWrite(file, '[]\n');
    return [];
  }
}

async function atomicWrite(file: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmp, contents, 'utf-8');
  await fs.rename(tmp, file);
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRun(raw: any): ScheduleRun | null {
  if (!raw || typeof raw !== 'object' || !raw.id || !raw.schedule_id) return null;
  return {
    id: String(raw.id),
    schedule_id: String(raw.schedule_id),
    trigger: raw.trigger || 'schedule',
    status: raw.status || 'queued',
    scheduled_for: numberOrNull(raw.scheduled_for),
    started_at: Number(raw.started_at) || Date.now(),
    finished_at: numberOrNull(raw.finished_at),
    duration_ms: numberOrNull(raw.duration_ms),
    session_id: raw.session_id ? String(raw.session_id) : null,
    error: raw.error ? String(raw.error) : null,
    summary: raw.summary ? String(raw.summary) : null,
    payload_preview: raw.payload_preview ? String(raw.payload_preview) : null,
    event_type: raw.event_type ? String(raw.event_type) : null,
    source_ip: raw.source_ip ? String(raw.source_ip) : null,
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : undefined,
  };
}

export async function readSchedules(): Promise<ScheduleDefinition[]> {
  const { schedulesPath } = await ensureCronStore();
  const rows = await readJsonArray<ScheduleDefinition>(schedulesPath);
  return rows.filter((row) => row && typeof row === 'object' && row.id && row.name);
}

export async function writeSchedules(schedules: ScheduleDefinition[]): Promise<void> {
  const { schedulesPath } = await ensureCronStore();
  await atomicWrite(schedulesPath, JSON.stringify(schedules, null, 2) + '\n');
}

export async function readRuns(): Promise<ScheduleRun[]> {
  const { runsPath } = await ensureCronStore();
  const rows = await readJsonArray<ScheduleRun>(runsPath);
  return rows
    .map(normalizeRun)
    .filter((row): row is ScheduleRun => row !== null);
}

export async function writeRuns(runs: ScheduleRun[]): Promise<void> {
  const { runsPath } = await ensureCronStore();
  await atomicWrite(runsPath, JSON.stringify(runs, null, 2) + '\n');
}

export async function getScheduleById(id: string): Promise<ScheduleDefinition | null> {
  const schedules = await readSchedules();
  return schedules.find((s) => s.id === id) || null;
}

export async function saveSchedule(schedule: ScheduleDefinition): Promise<ScheduleDefinition> {
  return withCronStoreLock(async () => {
    const schedules = await readSchedules();
    const idx = schedules.findIndex((s) => s.id === schedule.id);
    if (idx === -1) schedules.push(schedule);
    else schedules[idx] = schedule;
    await writeSchedules(schedules);
    return schedule;
  });
}

export async function deleteScheduleRecord(id: string): Promise<boolean> {
  return withCronStoreLock(async () => {
    const schedules = await readSchedules();
    const next = schedules.filter((s) => s.id !== id);
    if (next.length === schedules.length) return false;
    await writeSchedules(next);
    const runs = await readRuns();
    await writeRuns(runs.filter((r) => r.schedule_id !== id));
    return true;
  });
}

export async function appendRun(run: ScheduleRun): Promise<ScheduleRun> {
  return withCronStoreLock(async () => {
    const runs = await readRuns();
    runs.push(run);

    const perSchedule = new Map<string, number>();
    for (let i = runs.length - 1; i >= 0; i--) {
      const count = (perSchedule.get(runs[i].schedule_id) || 0) + 1;
      perSchedule.set(runs[i].schedule_id, count);
      if (count > MAX_RUNS_PER_SCHEDULE) runs.splice(i, 1);
    }
    const pruned = runs.length > MAX_RUNS_TOTAL ? runs.slice(runs.length - MAX_RUNS_TOTAL) : runs;
    await writeRuns(pruned);
    return run;
  });
}

export async function updateRun(
  runId: string,
  patch: Partial<ScheduleRun>
): Promise<ScheduleRun | null> {
  return withCronStoreLock(async () => {
    const runs = await readRuns();
    const idx = runs.findIndex((r) => r.id === runId);
    if (idx === -1) return null;
    runs[idx] = { ...runs[idx], ...patch };
    await writeRuns(runs);
    return runs[idx];
  });
}

export async function getRunById(runId: string): Promise<ScheduleRun | null> {
  const runs = await readRuns();
  return runs.find((r) => r.id === runId) || null;
}

export async function getRunsForSchedule(
  scheduleId: string,
  limit = 50
): Promise<ScheduleRun[]> {
  const runs = await readRuns();
  return runs
    .filter((r) => r.schedule_id === scheduleId)
    .sort((a, b) => b.started_at - a.started_at)
    .slice(0, Math.max(1, limit));
}

export async function getRunsSince(scheduleId: string, sinceMs: number): Promise<ScheduleRun[]> {
  const runs = await readRuns();
  return runs.filter((r) => r.schedule_id === scheduleId && r.started_at >= sinceMs);
}
