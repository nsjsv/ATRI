import 'dotenv/config';
import { buildApp } from './app';
import { loadEnv } from './runtime/env';
import { bootstrapDatabase } from './services/db-bootstrap';
import { startDiaryScheduler } from './jobs/diary-scheduler';
import { maybeStartMemoryRebuildOnBoot } from './jobs/memory-rebuild';
import { startProactiveScheduler } from './jobs/proactive-scheduler';

async function main() {
  const env = loadEnv(process.env);
  await bootstrapDatabase(env);
  const app = await buildApp(env);

  const host = env.HOST || '0.0.0.0';
  const port = env.PORT || 3111;

  try {
    await app.listen({ host, port });
    app.log.info({ host, port }, '[ATRI] server started');
    startDiaryScheduler(env, {
      enabled: process.env.DIARY_CRON_ENABLED,
      time: process.env.DIARY_CRON_TIME || '23:59',
      timeZone: process.env.DIARY_CRON_TIMEZONE || undefined,
      catchupDays: process.env.DIARY_CRON_CATCHUP_DAYS
    });
    startProactiveScheduler(env, {
      enabled: process.env.PROACTIVE_ENABLED,
      intervalMinutes: process.env.PROACTIVE_INTERVAL_MINUTES || '60',
      timeZone: process.env.DIARY_CRON_TIMEZONE || undefined
    });
    maybeStartMemoryRebuildOnBoot(env);
  } catch (error) {
    app.log.error(error, '[ATRI] server failed to start');
    process.exit(1);
  }
}

main();
