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

function sanitizeMeta(meta: unknown): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  const src = meta as Record<string, unknown>;
  const allow = ['status', 'url', 'method', 'route', 'code', 'error', 'details', 'stack', 'hint', 'userId', 'event'];
  for (const key of allow) {
    if (!(key in src)) continue;
    const val = src[key];
    if (typeof val === 'string') out[key] = truncateText(val, 2000);
    else out[key] = val;
  }
  return Object.keys(out).length ? out : undefined;
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

