export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(path, { ...options, headers });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    let msg = '';
    if (data && typeof data === 'object') {
      if (typeof data.error === 'string') msg = data.error;
      else if (data.error && typeof data.error === 'object' && typeof data.error.message === 'string') msg = data.error.message;
      else if (typeof data.message === 'string') msg = data.message;

      const details = typeof data.details === 'string' ? data.details : '';
      if (details) msg = msg ? `${msg}: ${details}` : details;
    }
    msg = String(msg || '').trim();
    if (msg.length > 800) msg = `${msg.slice(0, 800)}…`;
    throw new Error(msg || `HTTP ${res.status}`);
  }

  return data;
}
