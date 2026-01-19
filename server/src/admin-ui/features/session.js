import { api } from '../lib/api.js';
import { $ } from '../lib/dom.js';
import { setText } from '../lib/ui.js';

function setLoggedIn(ok) {
  setText($('sessionStatus'), ok ? '已登录' : '未登录');
  $('logoutBtn').hidden = !ok;
  $('loginCard').hidden = ok;
  $('app').hidden = !ok;
}

export async function checkSession() {
  try {
    await api('/admin/api/session');
    setLoggedIn(true);
    return true;
  } catch {
    setLoggedIn(false);
    return false;
  }
}

export async function login(apiKey) {
  await api('/admin/api/login', {
    method: 'POST',
    body: JSON.stringify({ apiKey })
  });
}

export async function logout() {
  try {
    await api('/admin/api/logout', { method: 'POST', body: '{}' });
  } catch {
    // ignore
  }
}

export function initSessionHandlers({ onLoginSuccess, onLogout }) {
  $('apiKey').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') $('loginBtn').click();
  });

  $('loginBtn').addEventListener('click', async () => {
    setText($('loginMsg'), '');
    try {
      await login(String($('apiKey').value || '').trim());
      $('apiKey').value = '';
      const ok = await checkSession();
      if (ok) await onLoginSuccess?.();
    } catch {
      setText($('loginMsg'), '登录失败');
    }
  });

  $('logoutBtn').addEventListener('click', async () => {
    await logout();
    await onLogout?.();
    await checkSession();
  });
}
