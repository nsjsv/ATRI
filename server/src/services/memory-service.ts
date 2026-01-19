import { Env } from '../runtime/types';
import { sanitizeText } from '../utils/sanitize';
import { getEffectiveRuntimeSettings } from './runtime-settings';

function toPgVector(values: number[]) {
  return `[${values.join(',')}]`;
}

export async function embedText(text: string, env: Env): Promise<number[]> {
  const settings = await getEffectiveRuntimeSettings(env);
  const base = String(settings.embeddingsApiUrl || '').trim();
  const model = String(settings.embeddingsModel || '').trim();
  const apiKey = String(settings.embeddingsApiKey || '').trim();
  if (!base || !model || !apiKey) {
    throw new Error('missing_embeddings_config');
  }

  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, input: text })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Embeddings API error: ${res.status} ${t}`);
  }
  const data = await res.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('Invalid embeddings response');
  }
  return embedding as number[];
}

export async function searchMemories(
  env: Env,
  userId: string,
  queryText: string,
  topK = 5
) {
  const vector = await embedText(queryText, env);
  const vectorSql = toPgVector(vector);

  const limit = Math.min(Math.max(1, Math.trunc(topK)), 50);

  const result = await env.db.query(
    `SELECT id,
            date,
            text,
            mood,
            importance,
            timestamp,
            (1 - (embedding <=> $1::vector)) AS score
       FROM memory_vectors
      WHERE user_id = $2
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $3`,
    [vectorSql, userId, limit]
  );

  const items: any[] = [];
  for (const row of result.rows) {
    items.push({
      id: String(row.id || ''),
      score: typeof row.score === 'number' ? row.score : Number(row.score || 0),
      category: 'highlight',
      date: String(row.date || '').trim(),
      matchedHighlight: String(row.text || '').trim(),
      mood: String(row.mood || '').trim(),
      importance: Number(row.importance || 6),
      timestamp: Number(row.timestamp || 0)
    });
  }

  return items;
}

export async function upsertDiaryHighlightsMemory(
  env: Env,
  params: {
    userId: string;
    date: string;
    highlights: string[];
    mood?: string;
    timestamp?: number;
  }
) {
  const date = String(params.date || '').trim();
  if (!date) throw new Error('Diary date is missing');

  const MAX_HIGHLIGHTS_PER_DAY = 10;

  const rawHighlights = Array.isArray(params.highlights) ? params.highlights : [];
  const highlights = rawHighlights
    .map((h) => sanitizeText(String(h || '')).trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .slice(0, MAX_HIGHLIGHTS_PER_DAY);

  if (!highlights.length) {
    throw new Error('Diary highlights are empty');
  }

  const mood = String(params.mood || '').trim();
  const ts = typeof params.timestamp === 'number' ? params.timestamp : Date.now();

  const client = await env.db.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < highlights.length; i++) {
      const text = highlights[i];
      const values = await embedText(text, env);
      const vectorSql = toPgVector(values);
      const id = `hl:${params.userId}:${date}:${i}`;

      await client.query(
        `INSERT INTO memory_vectors (id, user_id, date, idx, text, mood, importance, timestamp, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector)
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           date = EXCLUDED.date,
           idx = EXCLUDED.idx,
           text = EXCLUDED.text,
           mood = EXCLUDED.mood,
           importance = EXCLUDED.importance,
           timestamp = EXCLUDED.timestamp,
           embedding = EXCLUDED.embedding`,
        [id, params.userId, date, i, text, mood || null, 6, ts, vectorSql]
      );
    }

    if (highlights.length < MAX_HIGHLIGHTS_PER_DAY) {
      const idsToDelete: string[] = [];
      for (let i = highlights.length; i < MAX_HIGHLIGHTS_PER_DAY; i++) {
        idsToDelete.push(`hl:${params.userId}:${date}:${i}`);
      }
      await client.query(
        `DELETE FROM memory_vectors WHERE id = ANY($1::text[])`,
        [idsToDelete]
      );
    }

    await client.query('COMMIT');
    return { count: highlights.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteDiaryVectors(env: Env, ids: string[]) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return 0;
  }
  const result = await env.db.query(
    `DELETE FROM memory_vectors WHERE id = ANY($1::text[])`,
    [ids]
  );
  return Number(result.rowCount || 0);
}
