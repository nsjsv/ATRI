import { Env } from '../runtime/types';
import { pushAppLog } from '../admin/log-buffer';
import { DEFAULT_TIMEZONE, formatDateInZone } from '../utils/date';
import { runDiaryCron } from './diary-cron';

function readBool(raw: unknown, fallback: boolean) {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!text) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

function readInt(raw: unknown, fallback: number) {
  const n = typeof raw === 'number' ? raw : Number(String(raw || '').trim());
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseTime(raw: string | undefined) {
  const text = String(raw || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function addDays(isoDate: string, deltaDays: number) {
  const m = String(isoDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const base = new Date(Date.UTC(y, mo - 1, d));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getTimePartsInZone(ts: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(new Date(ts));
  const pick = (type: string) => parts.find(p => p.type === type)?.value || '';
  const hour = Number(pick('hour'));
  const minute = Number(pick('minute'));
  const second = Number(pick('second'));
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
    second: Number.isFinite(second) ? second : 0
  };
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
      pushAppLog('warn', 'cron_lock_busy', { event: 'cron_lock_busy', lock: lockName });
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

export function startDiaryScheduler(env: Env, options?: {
  enabled?: unknown;
  time?: string;
  timeZone?: string;
  catchupDays?: unknown;
}) {
  const enabled = readBool(options?.enabled, true);
  const timeZone = String(options?.timeZone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
  const parsedTime = parseTime(options?.time) || { hour: 23, minute: 59 };
  const catchupDays = Math.min(Math.max(readInt(options?.catchupDays, 2), 1), 14);

  if (!enabled) {
    pushAppLog('warn', 'diary_scheduler_disabled', { event: 'diary_scheduler_disabled' });
    return () => {};
  }

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let running = false;

  const scheduleNext = () => {
    if (stopped) return;

    const now = Date.now();
    const nowParts = getTimePartsInZone(now, timeZone);
    const nowSec = nowParts.hour * 3600 + nowParts.minute * 60 + nowParts.second;
    const targetSec = parsedTime.hour * 3600 + parsedTime.minute * 60;

    let deltaSec = targetSec - nowSec;
    if (deltaSec <= 0) deltaSec += 86400;

    const delayMs = Math.max(500, deltaSec * 1000);
    timer = setTimeout(runOnce, delayMs);

    pushAppLog('info', 'diary_scheduler_next', {
      event: 'diary_scheduler_next',
      timeZone,
      time: `${String(parsedTime.hour).padStart(2, '0')}:${String(parsedTime.minute).padStart(2, '0')}`,
      inSeconds: deltaSec
    });
  };

  const runOnce = async () => {
    if (stopped) return;
    if (running) return scheduleNext();
    running = true;

    const startedAt = Date.now();
    const today = formatDateInZone(Date.now(), timeZone);
    const dates: string[] = [];
    for (let i = catchupDays - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      if (d) dates.push(d);
    }

    pushAppLog('info', 'diary_scheduler_run', {
      event: 'diary_scheduler_run',
      today,
      dates,
      timeZone
    });

    try {
      await withAdvisoryLock(env, 'atri:diary_cron', async () => {
        for (const date of dates) {
          try {
            await runDiaryCron(env, date);
          } catch (error: any) {
            pushAppLog('error', 'diary_cron_date_failed', {
              event: 'diary_cron_date_failed',
              date,
              error: String(error?.message || error)
            });
          }
        }
      });
    } catch (error: any) {
      pushAppLog('error', 'diary_scheduler_failed', {
        event: 'diary_scheduler_failed',
        error: String(error?.message || error)
      });
    } finally {
      running = false;
      pushAppLog('info', 'diary_scheduler_done', {
        event: 'diary_scheduler_done',
        durationMs: Date.now() - startedAt
      });
      scheduleNext();
    }
  };

  scheduleNext();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
