import { pushAppLog } from '../admin/log-buffer';
import { Env } from '../runtime/types';
import { upsertDiaryHighlightsMemory } from '../services/memory-service';
import { getEffectiveRuntimeSettings } from '../services/runtime-settings';

function safeInt(value: any, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function safeText(value: any) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function buildHighlights(summary: string, content: string) {
  const rawHighlights = summary
    ? summary.split('；').map((s) => s.trim()).filter(Boolean)
    : [];
  if (rawHighlights.length) return rawHighlights.slice(0, 10);
  const trimmed = String(content || '').trim();
  return trimmed ? [trimmed.slice(0, 800)] : [];
}

async function hasEmbeddingsConfigured(env: Env) {
  const settings = await getEffectiveRuntimeSettings(env);
  return Boolean(
    String(settings.embeddingsApiUrl || '').trim()
    && String(settings.embeddingsApiKey || '').trim()
    && String(settings.embeddingsModel || '').trim()
  );
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
      pushAppLog('warn', 'memory_rebuild_lock_busy', { event: 'memory_rebuild_lock_busy', lock: lockName });
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

export async function rebuildDiaryHighlightVectors(env: Env, options?: {
  fullRebuild?: boolean;
  logEvery?: number;
}) {
  const fullRebuild = options?.fullRebuild ?? true;
  const logEvery = Math.min(Math.max(safeInt(options?.logEvery, 10), 1), 200);

  const embeddingsOk = await hasEmbeddingsConfigured(env);
  if (!embeddingsOk) {
    pushAppLog('warn', 'memory_rebuild_skip', { event: 'memory_rebuild_skip', reason: 'missing_embeddings_config' });
    return { ok: false, reason: 'missing_embeddings_config' as const };
  }

  const diariesResult = await env.db.query(
    `SELECT user_id as "userId", date, summary, content, mood, updated_at as "updatedAt"
       FROM diary_entries
      WHERE status = 'ready'
      ORDER BY date ASC`
  );
  const diaries = Array.isArray(diariesResult.rows) ? diariesResult.rows : [];
  if (!diaries.length) {
    pushAppLog('warn', 'memory_rebuild_skip', { event: 'memory_rebuild_skip', reason: 'no_diary_entries' });
    return { ok: false, reason: 'no_diary_entries' as const };
  }

  const startedAt = Date.now();
  pushAppLog('info', 'memory_rebuild_start', { event: 'memory_rebuild_start', diaries: diaries.length, fullRebuild });

  await withAdvisoryLock(env, 'atri:memory_rebuild', async () => {
    if (fullRebuild) {
      await env.db.query(`DELETE FROM memory_vectors WHERE id LIKE 'hl:%'`);
      pushAppLog('info', 'memory_rebuild_cleared', { event: 'memory_rebuild_cleared' });
    }

    let rebuilt = 0;
    for (const row of diaries) {
      const userId = safeText((row as any).userId).trim();
      const date = safeText((row as any).date).trim();
      const mood = safeText((row as any).mood).trim();
      const summary = safeText((row as any).summary);
      const content = safeText((row as any).content);
      const updatedAt = safeInt((row as any).updatedAt, Date.now());
      const highlights = buildHighlights(summary, content);
      if (!userId || !date || !highlights.length) continue;

      await upsertDiaryHighlightsMemory(env, { userId, date, mood, highlights, timestamp: updatedAt });
      rebuilt++;
      if (rebuilt % logEvery === 0) {
        pushAppLog('info', 'memory_rebuild_progress', { event: 'memory_rebuild_progress', rebuilt });
      }
    }

    pushAppLog('info', 'memory_rebuild_done', {
      event: 'memory_rebuild_done',
      rebuilt,
      durationMs: Date.now() - startedAt
    });
  });

  return { ok: true, diaries: diaries.length };
}

export function maybeStartMemoryRebuildOnBoot(env: Env) {
  const mode = String(process.env.MEMORY_REBUILD_ON_START || '').trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(mode)) {
    pushAppLog('warn', 'memory_rebuild_on_start_disabled', { event: 'memory_rebuild_on_start_disabled' });
    return;
  }

  setTimeout(() => {
    (async () => {
      const force = ['1', 'true', 'yes', 'on', 'force'].includes(mode);
      if (!force) {
        const countRes = await env.db.query(
          `SELECT COUNT(1) as "count"
             FROM memory_vectors
            WHERE id LIKE 'hl:%'`
        );
        const count = safeInt(countRes.rows?.[0]?.count, 0);
        if (count > 0) {
          pushAppLog('info', 'memory_rebuild_skip', { event: 'memory_rebuild_skip', reason: 'already_has_vectors', count });
          return;
        }
      }

      await rebuildDiaryHighlightVectors(env, { fullRebuild: true, logEvery: 10 });
    })().catch((error: any) => {
      pushAppLog('error', 'memory_rebuild_failed', { event: 'memory_rebuild_failed', error: String(error?.message || error) });
    });
  }, 2500);
}

