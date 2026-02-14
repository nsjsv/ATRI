import type { FastifyInstance } from 'fastify';
import { Env } from '../runtime/types';
import { registerMediaRoutes } from './media';
import { registerChatRoutes } from './chat';
import { registerDiaryRoutes } from './diary';
import { registerConversationRoutes } from './conversation';
import { registerAdminRoutes } from './admin';
import { registerAdminUiRoutes } from './admin-ui';
import { registerModelRoutes } from './models';
import { registerCompatRoutes } from './compat';
import { registerProactiveRoutes } from './proactive';

export async function registerRoutes(app: FastifyInstance, env: Env) {
  registerMediaRoutes(app, env);
  registerChatRoutes(app, env);
  registerDiaryRoutes(app, env);
  registerConversationRoutes(app, env);
  registerAdminRoutes(app, env);
  registerAdminUiRoutes(app, env);
  registerModelRoutes(app, env);
  registerCompatRoutes(app, env);
  registerProactiveRoutes(app, env);

  app.get('/health', async () => ({ ok: true }));
}
