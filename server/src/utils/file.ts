import type { FastifyRequest } from 'fastify';
import { Env } from '../runtime/types';

export function sanitizeFileName(name: string): string {
  return String(name || '').replace(/[^\w.\-]+/g, '_');
}

function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  return trimmed;
}

export function buildPublicUrl(request: FastifyRequest, env: Env, path: string): string {
  const configured = typeof env.PUBLIC_BASE_URL === 'string' ? normalizeBaseUrl(env.PUBLIC_BASE_URL) : '';
  if (configured) {
    return `${configured}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  const protoHeader = String(request.headers['x-forwarded-proto'] || '').trim();
  const proto = protoHeader || (request.protocol || 'http');
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || '').trim();
  const base = host ? `${proto}://${host}` : `${proto}://127.0.0.1`;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

