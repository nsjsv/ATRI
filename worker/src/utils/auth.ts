import { Env } from '../types';
import { jsonResponse } from './json-response';

export function requireAppToken(request: Request, env: Env) {
  const expected = (env.APP_TOKEN || '').trim();
  if (!expected) {
    return jsonResponse({ error: 'app_token_missing' }, 503);
  }
  const provided = (request.headers.get('X-App-Token') || request.headers.get('x-app-token') || '').trim();
  if (provided !== expected) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  return null;
}
