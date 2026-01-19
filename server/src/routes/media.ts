import type { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { Env } from '../runtime/types';
import { requireAppToken } from '../utils/auth';
import { sendJson } from '../utils/reply';
import { buildPublicUrl, sanitizeFileName } from '../utils/file';
import {
  signMediaUrlForClient,
  signMediaUrlForModel,
  validateSignedMediaPathParams,
  validateSignedMediaRequest
} from '../utils/media-signature';

type MediaMeta = {
  contentType?: string;
  contentDisposition?: string;
  size?: number;
};

async function readMeta(filePath: string): Promise<MediaMeta> {
  const metaPath = `${filePath}.meta.json`;
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      contentType: typeof parsed?.contentType === 'string' ? parsed.contentType : undefined,
      contentDisposition: typeof parsed?.contentDisposition === 'string' ? parsed.contentDisposition : undefined,
      size: typeof parsed?.size === 'number' ? parsed.size : undefined
    };
  } catch {
    return {};
  }
}

function validateMediaToken(requestUrl: string, env: Env): boolean {
  const expected = String(env.APP_TOKEN || '').trim();
  if (!expected) return true;
  let url: URL;
  try {
    url = new URL(requestUrl, 'http://localhost');
  } catch {
    return false;
  }
  const token = String(url.searchParams.get('token') || '').trim();
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function validateMediaHeaderToken(headers: Record<string, any>, env: Env): boolean {
  const expected = String(env.APP_TOKEN || '').trim();
  if (!expected) return true;
  const provided = String(headers['x-app-token'] || '').trim();
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function resolveKey(mediaRoot: string, key: string): string | null {
  const normalized = String(key || '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');
  if (!normalized || normalized.includes('..')) return null;

  const resolved = path.resolve(mediaRoot, normalized);
  const root = path.resolve(mediaRoot);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return resolved;
}

export function registerMediaRoutes(app: FastifyInstance, env: Env) {
  app.post('/upload', { bodyLimit: 50 * 1024 * 1024 }, async (request, reply) => {
    try {
      const auth = requireAppToken(request, env);
      if (auth) return sendJson(reply, auth.body, auth.status);

      const body = request.body as any;
      if (!body) {
        return sendJson(reply, { error: 'Missing file body' }, 400);
      }
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);

      const fileNameHeader = String(request.headers['x-file-name'] || `upload-${Date.now()}`);
      const userIdHeader = String(request.headers['x-user-id'] || 'anonymous');
      const mime = String(request.headers['x-file-type'] || 'application/octet-stream');
      const sizeHeader = request.headers['x-file-size'];
      const size = sizeHeader ? Number(sizeHeader) : undefined;

      const safeName = sanitizeFileName(fileNameHeader);
      const safeUser = sanitizeFileName(userIdHeader) || 'anon';
      const objectKey = `u/${safeUser}/${Date.now()}-${safeName}`;

      const targetPath = resolveKey(env.MEDIA_ROOT, objectKey);
      if (!targetPath) {
        return sendJson(reply, { error: 'invalid_path' }, 400);
      }
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, buffer);

      const meta: MediaMeta = {
        contentType: mime,
        contentDisposition: `inline; filename="${safeName}"`,
        size: typeof size === 'number' && Number.isFinite(size) ? size : buffer.length
      };
      await fs.writeFile(`${targetPath}.meta.json`, JSON.stringify(meta), 'utf8');

      const rawUrl = buildPublicUrl(request, env, `/media/${objectKey}`);
      const url = await signMediaUrlForClient(rawUrl, env);
      const signedUrl = await signMediaUrlForModel(rawUrl, env, { ttlSeconds: 600 });

      return sendJson(reply, {
        key: objectKey,
        url: url || rawUrl,
        signedUrl,
        rawUrl,
        mime,
        size: meta.size
      });
    } catch (error: unknown) {
      request.log.error({ error }, '[ATRI] Upload failed');
      return sendJson(reply, { error: 'Upload failed' }, 500);
    }
  });

  app.head('/media-s/:exp/:sig/*', async (request, reply) => {
    const rawKey = String((request.params as any)['*'] || '');
    const exp = String((request.params as any).exp || '');
    const sig = String((request.params as any).sig || '');
    const key = rawKey.replace(/^\/+/, '');
    if (!key || !exp || !sig) {
      reply.code(404).send('Not found');
      return;
    }

    const signedOk = await validateSignedMediaPathParams(env, key, exp, sig);
    if (!signedOk && !validateMediaHeaderToken(request.headers as any, env) && !validateMediaToken(request.url, env)) {
      reply.code(401).send('Unauthorized');
      return;
    }

    const filePath = resolveKey(env.MEDIA_ROOT, key);
    if (!filePath) {
      reply.code(404).send('Not found');
      return;
    }
    try {
      const stat = await fs.stat(filePath);
      const meta = await readMeta(filePath);
      reply.header('Cache-Control', 'public, max-age=31536000');
      if (meta.contentType) reply.header('Content-Type', meta.contentType);
      if (meta.contentDisposition) reply.header('Content-Disposition', meta.contentDisposition);
      reply.header('Content-Length', String(stat.size));
      reply.code(200).send();
    } catch {
      reply.code(404).send('Not found');
    }
  });

  app.get('/media-s/:exp/:sig/*', async (request, reply) => {
    const rawKey = String((request.params as any)['*'] || '');
    const exp = String((request.params as any).exp || '');
    const sig = String((request.params as any).sig || '');
    const key = rawKey.replace(/^\/+/, '');
    if (!key || !exp || !sig) {
      reply.code(404).send('Not found');
      return;
    }

    const signedOk = await validateSignedMediaPathParams(env, key, exp, sig);
    if (!signedOk && !validateMediaHeaderToken(request.headers as any, env) && !validateMediaToken(request.url, env)) {
      reply.code(401).send('Unauthorized');
      return;
    }

    const filePath = resolveKey(env.MEDIA_ROOT, key);
    if (!filePath) {
      reply.code(404).send('Not found');
      return;
    }
    try {
      const meta = await readMeta(filePath);
      reply.header('Cache-Control', 'public, max-age=31536000');
      if (meta.contentType) reply.header('Content-Type', meta.contentType);
      if (meta.contentDisposition) reply.header('Content-Disposition', meta.contentDisposition);
      return reply.send(fssync.createReadStream(filePath));
    } catch {
      reply.code(404).send('Not found');
    }
  });

  app.head('/media/*', async (request, reply) => {
    const rawKey = String((request.params as any)['*'] || '');
    const key = rawKey.replace(/^\/+/, '');
    if (!key) {
      reply.code(404).send('Not found');
      return;
    }

    const signedOk = await validateSignedMediaRequest(request.url, env, key);
    if (!signedOk && !validateMediaHeaderToken(request.headers as any, env) && !validateMediaToken(request.url, env)) {
      reply.code(401).send('Unauthorized');
      return;
    }

    const filePath = resolveKey(env.MEDIA_ROOT, key);
    if (!filePath) {
      reply.code(404).send('Not found');
      return;
    }
    try {
      const stat = await fs.stat(filePath);
      const meta = await readMeta(filePath);
      reply.header('Cache-Control', 'public, max-age=31536000');
      if (meta.contentType) reply.header('Content-Type', meta.contentType);
      if (meta.contentDisposition) reply.header('Content-Disposition', meta.contentDisposition);
      reply.header('Content-Length', String(stat.size));
      reply.code(200).send();
    } catch {
      reply.code(404).send('Not found');
    }
  });

  app.get('/media/*', async (request, reply) => {
    const rawKey = String((request.params as any)['*'] || '');
    const key = rawKey.replace(/^\/+/, '');
    if (!key) {
      reply.code(404).send('Not found');
      return;
    }

    const signedOk = await validateSignedMediaRequest(request.url, env, key);
    if (!signedOk && !validateMediaHeaderToken(request.headers as any, env) && !validateMediaToken(request.url, env)) {
      reply.code(401).send('Unauthorized');
      return;
    }

    const filePath = resolveKey(env.MEDIA_ROOT, key);
    if (!filePath) {
      reply.code(404).send('Not found');
      return;
    }
    try {
      const meta = await readMeta(filePath);
      reply.header('Cache-Control', 'public, max-age=31536000');
      if (meta.contentType) reply.header('Content-Type', meta.contentType);
      if (meta.contentDisposition) reply.header('Content-Disposition', meta.contentDisposition);
      return reply.send(fssync.createReadStream(filePath));
    } catch {
      reply.code(404).send('Not found');
    }
  });
}
