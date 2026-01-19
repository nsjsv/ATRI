import type { FastifyReply } from 'fastify';

export function sendJson(
  reply: FastifyReply,
  data: unknown,
  status = 200,
  headers?: Record<string, string>
) {
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      reply.header(key, value);
    }
  }
  reply.code(status).type('application/json; charset=utf-8').send(data);
}

