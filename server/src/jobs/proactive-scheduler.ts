import { pushAppLog } from '../admin/log-buffer';
import { Env } from '../runtime/types';
import { listProactiveCandidateUsers } from '../services/data-service';
import { evaluateProactiveForUser } from '../services/proactive-service';
import { getEffectiveRuntimeSettings } from '../services/runtime-settings';

type SchedulerOptions = {
  enabled?: unknown;
  intervalMinutes?: unknown;
  timeZone?: string;
};

function readBool(raw: unknown, fallback: boolean) {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!text) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

function readInt(raw: unknown, fallback: number, min: number, max: number) {
  const n = typeof raw === 'number' ? raw : Number(String(raw || '').trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

async function withAdvisoryLock<T>(env: Env, lockName: string, fn: () => Promise<T>) {
  const client = await env.db.connect();
  try {
    const lockRes = await client.query(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
      [lockName]
    );
    const locked = Boolean(lockRes.rows?.[0]?.locked);
    if (!locked) {
      pushAppLog('warn', 'proactive_lock_busy', { event: 'proactive_lock_busy', lock: lockName });
      return null as any;
    }
    try {
      return await fn();
    } finally {
      try {
        await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockName]);
      } catch {
        // ignore
      }
    }
  } finally {
    client.release();
  }
}

export function startProactiveScheduler(env: Env, options?: SchedulerOptions) {
  const defaultEnabled = readBool(options?.enabled, false);
  const defaultInterval = readInt(options?.intervalMinutes, 60, 5, 720);
  const defaultTimeZone = String(options?.timeZone || 'Asia/Shanghai').trim() || 'Asia/Shanghai';

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let running = false;

  const scheduleNext = (minutes: number) => {
    if (stopped) return;
    const delayMs = Math.max(5000, Math.trunc(minutes * 60 * 1000));
    timer = setTimeout(runOnce, delayMs);
    pushAppLog('info', 'proactive_scheduler_next', {
      event: 'proactive_scheduler_next',
      inMinutes: Math.round(delayMs / 60000)
    });
  };

  const runOnce = async () => {
    if (stopped) return;
    if (running) return scheduleNext(defaultInterval);
    running = true;
    const startedAt = Date.now();

    let nextIntervalMinutes = defaultInterval;
    try {
      const settings = await getEffectiveRuntimeSettings(env);
      const enabled = settings.proactiveEnabled ?? defaultEnabled;
      nextIntervalMinutes = readInt(settings.proactiveIntervalMinutes, defaultInterval, 5, 720);
      const timeZone = String(settings.proactiveTimeZone || defaultTimeZone).trim() || defaultTimeZone;

      if (!enabled) {
        pushAppLog('warn', 'proactive_scheduler_disabled', { event: 'proactive_scheduler_disabled' });
      } else {
        await withAdvisoryLock(env, 'atri:proactive_cron', async () => {
          const users = await listProactiveCandidateUsers(env, { lookbackHours: 24 * 30, limit: 500 });
          pushAppLog('info', 'proactive_scheduler_run', {
            event: 'proactive_scheduler_run',
            users: users.length,
            intervalMinutes: nextIntervalMinutes
          });

          for (const user of users) {
            try {
              await evaluateProactiveForUser(env, {
                userId: user.userId,
                userName: user.userName,
                timeZone: user.timeZone || timeZone,
                now: Date.now(),
                settings
              });
            } catch (error: any) {
              pushAppLog('warn', 'proactive_user_failed', {
                event: 'proactive_user_failed',
                userId: user.userId,
                error: String(error?.message || error)
              });
            }
          }
        });
      }
    } catch (error: any) {
      pushAppLog('error', 'proactive_scheduler_failed', {
        event: 'proactive_scheduler_failed',
        error: String(error?.message || error)
      });
    } finally {
      running = false;
      pushAppLog('info', 'proactive_scheduler_done', {
        event: 'proactive_scheduler_done',
        durationMs: Date.now() - startedAt
      });
      scheduleNext(nextIntervalMinutes);
    }
  };

  scheduleNext(1);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
