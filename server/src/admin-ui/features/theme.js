import { $ } from '../lib/dom.js';

const STORAGE_KEY = 'atri_admin_theme';

function getSystemTheme() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    // ignore
  }
  const btn = $('themeToggleBtn');
  if (btn) btn.textContent = t === 'dark' ? '浅色' : '深色';
}

function loadStoredTheme() {
  try {
    const t = String(localStorage.getItem(STORAGE_KEY) || '').trim();
    if (t === 'dark' || t === 'light') return t;
  } catch {
    // ignore
  }
  return null;
}

export function initTheme() {
  const stored = loadStoredTheme();
  applyTheme(stored || getSystemTheme());

  $('themeToggleBtn')?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

