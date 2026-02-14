import type { FastifyInstance } from 'fastify';
import { Env } from '../runtime/types';
import { requireAppToken } from '../utils/auth';
import { sendJson } from '../utils/reply';
import { fetchPendingProactiveMessages, markProactiveMessagesDelivered } from '../services/data-service';

export function registerProactiveRoutes(app: FastifyInstance, env: Env) {
  app.get('/proactive/pending', async (request, reply) => {
    const auth = requireAppToken(request, env);
    if (auth) return sendJson(reply, auth.body, auth.status);

    const userId = String((request.query as any)?.userId || '').trim();
    const limitRaw = Number((request.query as any)?.limit || '20');
    const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
    if (!userId) {
      return sendJson(reply, { error: 'missing_user' }, 400);
    }

    try {
      const messages = await fetchPendingProactiveMessages(env, { userId, limit });
      if (messages.length) {
        await markProactiveMessagesDelivered(env, {
          userId,
          ids: messages.map((msg) => msg.id),
          deliveredAt: Date.now()
        });
      }
      return sendJson(reply, { messages });
    } catch (error: any) {
      request.log.error({ error, userId }, '[ATRI] proactive pending error');
      return sendJson(reply, { error: 'proactive_pending_failed', details: String(error?.message || error) }, 500);
    }
  });
}
