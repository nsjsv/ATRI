import 'dotenv/config';
import { buildApp } from './app';
import { loadEnv } from './runtime/env';
import { bootstrapDatabase } from './services/db-bootstrap';

async function main() {
  const env = loadEnv(process.env);
  await bootstrapDatabase(env);
  const app = await buildApp(env);

  const host = env.HOST || '0.0.0.0';
  const port = env.PORT || 3111;

  try {
    await app.listen({ host, port });
    app.log.info({ host, port }, '[ATRI] server started');
  } catch (error) {
    app.log.error(error, '[ATRI] server failed to start');
    process.exit(1);
  }
}

main();
