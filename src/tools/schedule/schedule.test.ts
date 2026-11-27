import assert from 'node:assert/strict';
import { executeNativeTool } from '../index.js';
import { buildNormalTrigger } from './schedule_shared.js';

const ctx = {
  sessionId: 'test_schedule_tools',
  workspace: process.cwd(),
  visionSupport: true,
};

function futureDate(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
}

export async function testScheduleTools() {
  const createdIds: string[] = [];

  try {
    // Cadence mapping is pure and must produce the engine's NormalTrigger shape.
    const once = buildNormalTrigger({
      schedule_name: 'n',
      task_prompt: 'p',
      cadence: 'one_time',
      date: '2030-01-02',
      time: '03:04',
      timezone: 'UTC',
    });
    assert.equal(once.mode, 'once');
    assert.equal(new Date(once.run_at as number).toISOString(), '2030-01-02T03:04:00.000Z');

    const everyX = buildNormalTrigger({
      schedule_name: 'n',
      task_prompt: 'p',
      cadence: 'every_x',
      interval: 30,
      interval_unit: 'minutes',
      timezone: 'UTC',
    });
    assert.equal(everyX.mode, 'interval');
    assert.equal(everyX.interval_value, 30);
    assert.equal(everyX.interval_unit, 'minutes');

    const weeklyTrigger = buildNormalTrigger({
      schedule_name: 'n',
      task_prompt: 'p',
      cadence: 'weekly',
      weekdays: ['monday', 'sunday'],
      time: '09:00',
      timezone: 'UTC',
    });
    assert.equal(weeklyTrigger.mode, 'weekly');
    assert.deepEqual(weeklyTrigger.weekdays, [1, 0]);
    assert.equal(weeklyTrigger.time_of_day, '09:00');

    const monthlyTrigger = buildNormalTrigger({
      schedule_name: 'n',
      task_prompt: 'p',
      cadence: 'monthly',
      day_of_month: 15,
      time: '08:30',
      timezone: 'UTC',
    });
    assert.equal(monthlyTrigger.mode, 'monthly');
    assert.deepEqual(monthlyTrigger.days_of_month, [15]);

    const cronTrigger = buildNormalTrigger({
      schedule_name: 'n',
      task_prompt: 'p',
      cadence: 'custom_cron',
      cron_expression: '*/15 * * * *',
      timezone: 'UTC',
    });
    assert.equal(cronTrigger.mode, 'cron');
    assert.equal(cronTrigger.cron_expression, '*/15 * * * *');

    // Create one schedule per cadence through the registered tool.
    const oneTime = await executeNativeTool(
      'schedule_create',
      {
        schedule_name: 'Test one-time report',
        task_prompt: 'Write a short report to /tmp/report.md',
        cadence: 'one_time',
        date: futureDate(3),
        time: '10:15',
        timezone: 'UTC',
      },
      ctx
    );
    createdIds.push(oneTime.schedule_id);
    assert.equal(oneTime.success, true);
    assert.ok(oneTime.schedule_id.startsWith('sched_'));
    assert.equal(oneTime.cadence, 'once');
    assert.equal(oneTime.status, 'active');
    assert.equal(oneTime.enabled, true);
    assert.ok(oneTime.next_run_at, 'one-time schedule must expose a next run');

    const daily = await executeNativeTool(
      'schedule_create',
      {
        schedule_name: 'Test daily summary',
        task_prompt: 'Summarise new files in the workspace',
        cadence: 'daily',
        time: '09:00',
        timezone: 'Asia/Calcutta',
      },
      ctx
    );
    createdIds.push(daily.schedule_id);
    assert.equal(daily.cadence, 'daily');
    assert.equal(daily.timezone, 'Asia/Calcutta');
    assert.ok(daily.next_run_local);

    const interval = await executeNativeTool(
      'schedule_create',
      {
        schedule_name: 'Test interval ping',
        task_prompt: 'Check the build status',
        cadence: 'every_x',
        interval: 30,
        interval_unit: 'minutes',
        timezone: 'UTC',
      },
      ctx
    );
    createdIds.push(interval.schedule_id);
    assert.equal(interval.cadence, 'interval');
    const intervalNext = Date.parse(interval.next_run_at as string);
    assert.ok(intervalNext > Date.now());
    assert.ok(intervalNext <= Date.now() + 31 * 60_000);

    const weekly = await executeNativeTool(
      'schedule_create',
      {
        schedule_name: 'Test weekly review',
        task_prompt: 'Review open pull requests',
        cadence: 'weekly',
        weekdays: ['monday', 'friday'],
        time: '17:00',
        timezone: 'UTC',
        start_date: futureDate(1),
      },
      ctx
    );
    createdIds.push(weekly.schedule_id);
    assert.equal(weekly.cadence, 'weekly');

    const monthly = await executeNativeTool(
      'schedule_create',
      {
        schedule_name: 'Test monthly cleanup',
        task_prompt: 'Delete temporary files older than 30 days',
        cadence: 'monthly',
        day_of_month: 15,
        time: '08:30',
        timezone: 'UTC',
      },
      ctx
    );
    createdIds.push(monthly.schedule_id);
    assert.equal(monthly.cadence, 'monthly');

    const cronSchedule = await executeNativeTool(
      'schedule_create',
      {
        schedule_name: 'Test cron heartbeat',
        task_prompt: 'Ping the health endpoint',
        cadence: 'custom_cron',
        cron_expression: '*/15 * * * *',
        timezone: 'UTC',
      },
      ctx
    );
    createdIds.push(cronSchedule.schedule_id);
    assert.equal(cronSchedule.cadence, 'cron');

    // list (active) must include every schedule just created.
    const listed = await executeNativeTool('schedule_list', { status: 'active' }, ctx);
    assert.equal(listed.success, true);
    assert.equal(listed.filter, 'active');
    for (const id of createdIds) {
      assert.ok(
        listed.schedules.some((s: any) => s.schedule_id === id),
        `Schedule ${id} must appear in schedule_list`
      );
    }
    assert.ok(listed.schedules.every((s: any) => s.status === 'active'));

    const pausedOnly = await executeNativeTool('schedule_list', { status: 'paused' }, ctx);
    assert.ok(
      pausedOnly.schedules.every((s: any) => s.status === 'paused'),
      'paused filter must only return paused schedules'
    );

    // get must return the full prompt, upcoming runs, and run history.
    const got = await executeNativeTool(
      'schedule_get',
      { schedule_id: oneTime.schedule_id },
      ctx
    );
    assert.equal(got.success, true);
    assert.equal(got.task_prompt, 'Write a short report to /tmp/report.md');
    assert.equal(got.schedule_id, oneTime.schedule_id);
    assert.ok(Array.isArray(got.upcoming_runs));
    assert.ok(got.upcoming_runs.length >= 1);
    assert.ok(got.upcoming_runs[0].at);
    assert.ok(Array.isArray(got.recent_runs));

    // Cadence-specific validation and schema strictness.
    await assert.rejects(
      executeNativeTool(
        'schedule_create',
        { schedule_name: 'x', task_prompt: 'y', cadence: 'daily', timezone: 'UTC' },
        ctx
      ),
      /time/i
    );
    await assert.rejects(
      executeNativeTool(
        'schedule_create',
        {
          schedule_name: 'x',
          task_prompt: 'y',
          cadence: 'weekly',
          time: '09:00',
          timezone: 'UTC',
        },
        ctx
      ),
      /weekdays/i
    );
    await assert.rejects(
      executeNativeTool(
        'schedule_create',
        {
          schedule_name: 'x',
          task_prompt: 'y',
          cadence: 'custom_cron',
          cron_expression: 'not a cron',
          timezone: 'UTC',
        },
        ctx
      ),
      /cron/i
    );
    await assert.rejects(
      executeNativeTool(
        'schedule_create',
        {
          schedule_name: 'x',
          task_prompt: 'y',
          cadence: 'daily',
          time: '09:00',
          timezone: 'Mars/Olympus_Mons',
        },
        ctx
      ),
      /timezone/i
    );
    await assert.rejects(
      executeNativeTool(
        'schedule_create',
        {
          schedule_name: 'x',
          task_prompt: 'y',
          cadence: 'daily',
          time: '9:00',
          timezone: 'UTC',
        },
        ctx
      ),
      /HH:MM/i
    );
    await assert.rejects(
      executeNativeTool(
        'schedule_create',
        {
          schedule_name: 'x',
          task_prompt: 'y',
          cadence: 'one_time',
          date: '2030-02-30',
          time: '09:00',
          timezone: 'UTC',
        },
        ctx
      ),
      /real calendar date/i
    );
    await assert.rejects(
      executeNativeTool(
        'schedule_create',
        {
          schedule_name: 'x',
          task_prompt: 'y',
          cadence: 'daily',
          time: '09:00',
          timezone: 'UTC',
          unexpected: true,
        } as any,
        ctx
      ),
      /unrecognized/i
    );

    // run_now must reject an unknown schedule instead of silently starting work.
    await assert.rejects(
      executeNativeTool('schedule_run_now', { schedule_id: 'sched_missing' }, ctx),
      /not found/i
    );

    // delete removes schedules permanently.
    for (const id of createdIds) {
      const deleted = await executeNativeTool('schedule_delete', { schedule_id: id }, ctx);
      assert.equal(deleted.success, true);
      assert.equal(deleted.schedule_id, id);
    }
    createdIds.length = 0;

    await assert.rejects(
      executeNativeTool('schedule_get', { schedule_id: oneTime.schedule_id }, ctx),
      /not found/i
    );
    await assert.rejects(
      executeNativeTool('schedule_delete', { schedule_id: oneTime.schedule_id }, ctx),
      /not found/i
    );
    const afterDelete = await executeNativeTool('schedule_list', { status: 'all' }, ctx);
    assert.ok(
      !afterDelete.schedules.some((s: any) => s.schedule_id === oneTime.schedule_id),
      'Deleted schedule must not appear in schedule_list'
    );
  } finally {
    for (const id of createdIds) {
      await executeNativeTool('schedule_delete', { schedule_id: id }, ctx).catch(() => undefined);
    }
  }
}
