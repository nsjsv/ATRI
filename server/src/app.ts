import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Env } from './runtime/types';
import { registerRoutes } from './routes';
import { pushAppLog } from './admin/log-buffer';

export async function buildApp(env: Env) {
  const app = Fastify({
    logger: true,
    trustProxy: true
  });

  app.addHook('onError', async (request, reply, error) => {
    (request as any).__atriErrorLogged = true;
    pushAppLog('error', 'request_error', {
      method: request.method,
      url: request.url,
      status: reply.statusCode,
      error: error?.message ? String(error.message) : String(error),
      stack: typeof error?.stack === 'string' ? error.stack : undefined
    });
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (reply.statusCode < 500) return payload;
    if ((request as any).__atriErrorLogged) return payload;

    let details = '';
    if (typeof payload === 'string') {
      details = payload;
    } else if (Buffer.isBuffer(payload)) {
      details = payload.toString('utf8');
    }

    let summary = '';
    try {
      const parsed = details ? JSON.parse(details) : null;
      if (parsed && typeof parsed === 'object') {
        summary = String((parsed as any).error || (parsed as any).message || '');
      }
    } catch {
      // ignore
    }

    pushAppLog('error', 'http_5xx', {
      method: request.method,
      url: request.url,
      status: reply.statusCode,
      error: summary || undefined
    });

    return payload;
  });

  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'X-App-Token',
      'Authorization',
      'X-API-Key',
      'X-Goog-Api-Key',
      'X-File-Name',
      'X-File-Type',
      'X-File-Size',
      'X-User-Id'
    ]
  });

  await registerRoutes(app, env);

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).type('text/plain').send('Not Found');
  });

  return app;
}
