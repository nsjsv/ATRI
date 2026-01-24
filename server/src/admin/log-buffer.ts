export type AppLogLevel = 'info' | 'warn' | 'error';

export type AppLogEntry = {
  id: string;
  ts: number;
  level: AppLogLevel;
  message: string;
  meta?: Record<string, unknown>;
};

const MAX_ITEMS = 1000;
const items: AppLogEntry[] = [];
let seq = 0;

type Subscriber = (entry: AppLogEntry) => void;
const subscribers = new Set<Subscriber>();

function nextId() {
  seq = (seq + 1) % 1_000_000_000;
  return `${Date.now()}-${seq}`;
}

function truncateText(value: unknown, maxChars: number) {
  const text = String(value ?? '').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

const MAX_META_DEPTH = 4;
const MAX_META_KEYS = 60;
const MAX_META_ARRAY = 30;
const MAX_META_STRING = 4000;

const BLOCKED_KEY_RE = /(password|token|secret|api[-_]?key|authorization|cookie)/i;

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): any {
  if (value == null) return null;

  const t = typeof value;
  if (t === 'string') return truncateText(value, MAX_META_STRING);
  if (t === 'number' || t === 'boolean') return value;

  if (value instanceof Error) {
    return {
      message: truncateText(value.message, MAX_META_STRING),
      stack: typeof value.stack === 'string' ? truncateText(value.stack, MAX_META_STRING) : undefined
    };
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_META_DEPTH) return `[Array(${value.length})]`;
    return value.slice(0, MAX_META_ARRAY).map((item) => sanitizeValue(item, depth + 1, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (depth >= MAX_META_DEPTH) {
      try {
        return truncateText(JSON.stringify(value), MAX_META_STRING);
      } catch {
        return '[Object]';
      }
    }

    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const keys = Object.keys(src).slice(0, MAX_META_KEYS);
    for (const key of keys) {
      if (BLOCKED_KEY_RE.test(key)) continue;
      out[key] = sanitizeValue(src[key], depth + 1, seen);
    }
    return out;
  }

  return truncateText(String(value), MAX_META_STRING);
}

function sanitizeMeta(meta: unknown): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const seen = new WeakSet<object>();
  const cleaned = sanitizeValue(meta, 0, seen);
  if (!cleaned || typeof cleaned !== 'object') return undefined;
  return Object.keys(cleaned as any).length ? (cleaned as Record<string, unknown>) : undefined;
}

export function pushAppLog(level: AppLogLevel, message: string, meta?: Record<string, unknown>) {
  const entry: AppLogEntry = {
    id: nextId(),
    ts: Date.now(),
    level,
    message: truncateText(message, 500),
    meta: sanitizeMeta(meta)
  };

  items.push(entry);
  if (items.length > MAX_ITEMS) {
    items.splice(0, items.length - MAX_ITEMS);
  }

  for (const fn of subscribers) {
    try {
      fn(entry);
    } catch {
      // ignore
    }
  }

  return entry;
}

export function listAppLogs() {
  return items.slice();
}

export function subscribeAppLogs(fn: Subscriber) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
