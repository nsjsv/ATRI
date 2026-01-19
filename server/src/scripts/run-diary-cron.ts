import 'dotenv/config';
import { loadEnv } from '../runtime/env';
import { runDiaryCron } from '../jobs/diary-cron';

function pickArg(name: string) {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length).trim();
  }
  return '';
}

async function main() {
  const env = loadEnv(process.env);
  const targetDate = String(process.env.TARGET_DATE || pickArg('date') || '').trim() || undefined;

  try {
    await runDiaryCron(env, targetDate);
  } finally {
    await env.db.end();
  }
}

main().catch((err) => {
  console.error('[ATRI] diary cron failed', err);
  process.exit(1);
});

