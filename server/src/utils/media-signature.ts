import crypto from 'node:crypto';
import { Env } from '../runtime/types';

let cachedSecret: string | null = null;
let cachedKey: Buffer | null = null;

function getSigningSecret(env: Env): string {
  return String(env.MEDIA_SIGNING_KEY || env.APP_TOKEN || '').trim();
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    const max = Math.max(aBuf.length, bBuf.length);
    const paddedA = Buffer.concat([aBuf, Buffer.alloc(Math.max(0, max - aBuf.length))]);
    const paddedB = Buffer.concat([bBuf, Buffer.alloc(Math.max(0, max - bBuf.length))]);
    Buffer.compare(paddedA, paddedB);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBuf.length; i++) {
    diff |= aBuf[i] ^ bBuf[i];
  }
  return diff === 0;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getHmacKey(secret: string): Buffer {
  if (cachedKey && cachedSecret === secret) return cachedKey;
  cachedSecret = secret;
  cachedKey = Buffer.from(secret, 'utf8');
  return cachedKey;
}

function hmacSha256Base64Url(secret: string, message: string): string {
  const key = getHmacKey(secret);
  const digest = crypto.createHmac('sha256', key).update(message, 'utf8').digest();
  return base64UrlEncode(digest);
}

function extractMediaKeyFromUrl(url: URL): string | null {
  if (!url.pathname.startsWith('/media/')) return null;
  const raw = url.pathname.slice('/media/'.length);
  const key = raw.replace(/^\/+/, '');
  return key ? key : null;
}

function getExistingSignedExp(url: URL): number | null {
  const expRaw = (url.searchParams.get('exp') || '').trim();
  if (!expRaw) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp)) return null;
  return exp;
}

function isExistingSignatureStillValid(url: URL): boolean {
  const sig = (url.searchParams.get('sig') || '').trim();
  if (!sig) return false;
  const exp = getExistingSignedExp(url);
  if (exp == null) return false;
  const now = Math.floor(Date.now() / 1000);
  return exp >= now - 30;
}

async function signMediaUrl(
  rawUrl: string | null | undefined,
  env: Env,
  options: { ttlSeconds: number; maxTtlSeconds: number }
): Promise<string | null> {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  const secret = getSigningSecret(env);
  if (!secret) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  const key = extractMediaKeyFromUrl(url);
  if (!key) return trimmed;

  if (isExistingSignatureStillValid(url)) {
    return url.toString();
  }

  const ttlSeconds = Math.max(30, Math.min(options.maxTtlSeconds, options.ttlSeconds));
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = hmacSha256Base64Url(secret, `${key}\n${exp}`);

  url.searchParams.set('exp', String(exp));
  url.searchParams.set('sig', sig);
  return url.toString();
}

export async function signMediaUrlForModel(
  rawUrl: string | null | undefined,
  env: Env,
  options?: { ttlSeconds?: number }
): Promise<string | null> {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  const secret = getSigningSecret(env);
  if (!secret) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (url.pathname.startsWith('/media-s/')) {
    return url.toString();
  }

  const key = extractMediaKeyFromUrl(url);
  if (!key) return trimmed;

  const ttlSeconds = Math.max(30, Math.min(3600, options?.ttlSeconds ?? 600));
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = hmacSha256Base64Url(secret, `${key}\n${exp}`);

  url.pathname = `/media-s/${exp}/${sig}/${key}`;
  url.search = '';
  return url.toString();
}

export async function signMediaUrlForClient(
  rawUrl: string | null | undefined,
  env: Env,
  options?: { ttlSeconds?: number }
): Promise<string | null> {
  const ttlSeconds = options?.ttlSeconds ?? 31536000;
  return signMediaUrl(rawUrl, env, { ttlSeconds, maxTtlSeconds: 315360000 });
}

export async function validateSignedMediaRequest(requestUrl: string, env: Env, objectKey: string): Promise<boolean> {
  const secret = getSigningSecret(env);
  if (!secret) return false;

  let url: URL;
  try {
    url = new URL(requestUrl, 'http://localhost');
  } catch {
    return false;
  }

  const expRaw = (url.searchParams.get('exp') || '').trim();
  const sig = (url.searchParams.get('sig') || '').trim();
  if (!expRaw || !sig) return false;

  const exp = Number(expRaw);
  if (!Number.isFinite(exp)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (exp < now - 30) return false;

  const expected = hmacSha256Base64Url(secret, `${objectKey}\n${exp}`);
  return timingSafeEqual(sig, expected);
}

export async function validateSignedMediaPathParams(
  env: Env,
  objectKey: string,
  expRaw: string,
  sig: string
): Promise<boolean> {
  const secret = getSigningSecret(env);
  if (!secret) return false;

  const expText = String(expRaw || '').trim();
  const providedSig = String(sig || '').trim();
  if (!expText || !providedSig) return false;

  const exp = Number(expText);
  if (!Number.isFinite(exp)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (exp < now - 30) return false;

  const expected = hmacSha256Base64Url(secret, `${objectKey}\n${exp}`);
  return timingSafeEqual(providedSig, expected);
}
