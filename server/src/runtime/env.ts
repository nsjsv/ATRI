import { Pool } from 'pg';
import { Env } from './types';

function readText(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text : '';
}

function readOptionalText(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text : undefined;
}

function readBool(value: unknown) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!text) return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(text);
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function loadEnv(source: NodeJS.ProcessEnv): Env {
  const databaseUrl = readText(source.DATABASE_URL);
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing');
  }

  const db = new Pool({ connectionString: databaseUrl });

  const env: Env = {
    db,
    MEDIA_ROOT: readText(source.MEDIA_ROOT) || '/data/media',
    PUBLIC_BASE_URL: readOptionalText(source.PUBLIC_BASE_URL),

    HOST: readOptionalText(source.HOST),
    PORT: readNumber(source.PORT),

    OPENAI_API_KEY: readText(source.OPENAI_API_KEY),
    OPENAI_API_URL: readText(source.OPENAI_API_URL),

    TAVILY_API_KEY: readOptionalText(source.TAVILY_API_KEY),
    MEDIA_SIGNING_KEY: readOptionalText(source.MEDIA_SIGNING_KEY),
    DIARY_API_KEY: readOptionalText(source.DIARY_API_KEY),
    DIARY_API_URL: readOptionalText(source.DIARY_API_URL),
    DIARY_MODEL: readOptionalText(source.DIARY_MODEL),

    EMBEDDINGS_API_KEY: readText(source.EMBEDDINGS_API_KEY),
    EMBEDDINGS_API_URL: readText(source.EMBEDDINGS_API_URL),
    EMBEDDINGS_MODEL: readText(source.EMBEDDINGS_MODEL),

    ADMIN_API_KEY: readOptionalText(source.ADMIN_API_KEY),
    ADMIN_PUBLIC: readBool(source.ADMIN_PUBLIC),
    ADMIN_ALLOWED_ORIGINS: readOptionalText(source.ADMIN_ALLOWED_ORIGINS),
    ADMIN_CONFIG_ENCRYPTION_KEY: readOptionalText(source.ADMIN_CONFIG_ENCRYPTION_KEY),
    ADMIN_ALLOWED_IPS: readOptionalText(source.ADMIN_ALLOWED_IPS),
    APP_TOKEN: readOptionalText(source.APP_TOKEN),
    COMPAT_API_KEY: readOptionalText(source.COMPAT_API_KEY)
  };

  return env;
}
