import { api } from '../lib/api.js';
import { $ } from '../lib/dom.js';
import { runBusy, setText } from '../lib/ui.js';

const STORAGE_IMPORT_URL = 'atri_admin_prompts_import_url';
const STORAGE_AUTO_SYNC = 'atri_admin_prompts_auto_sync';

let autoSynced = false;

function readStorage(key) {
  try {
    return String(localStorage.getItem(key) || '');
  } catch {
    return '';
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, String(value ?? ''));
  } catch {
    // ignore
  }
}

function isAutoSyncEnabled() {
  const raw = readStorage(STORAGE_AUTO_SYNC).trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function setAutoSyncEnabled(enabled) {
  writeStorage(STORAGE_AUTO_SYNC, enabled ? '1' : '0');
}

function loadImportPrefsIntoUi() {
  const url = readStorage(STORAGE_IMPORT_URL).trim();
  if (url) $('promptsImportUrl').value = url;
  $('promptsAutoSync').checked = isAutoSyncEnabled();
}

function persistImportPrefsFromUi() {
  const url = String($('promptsImportUrl').value || '').trim();
  writeStorage(STORAGE_IMPORT_URL, url);
  setAutoSyncEnabled(Boolean($('promptsAutoSync').checked));
}

export async function loadPrompts() {
  const data = await api('/admin/api/prompts');
  const p = data.effective || {};
  $('p_agent_system').value = (p.agent && p.agent.system) || '';
  $('p_diary_system').value = (p.diary && p.diary.system) || '';
  $('p_diary_userTemplate').value = (p.diary && p.diary.userTemplate) || '';
  $('p_profile_system').value = (p.profile && p.profile.system) || '';
  $('p_profile_userTemplate').value = (p.profile && p.profile.userTemplate) || '';
  $('p_sticky_system').value = (p.stickyNote && p.stickyNote.system) || '';
  $('p_sticky_userTemplate').value = (p.stickyNote && p.stickyNote.userTemplate) || '';
  setText($('promptsMsg'), data.hasOverride ? '（当前使用自定义提示词）' : '（当前使用默认提示词）');
}

export async function savePrompts() {
  setText($('promptsMsg'), '');
  const payload = {
    agent: { system: $('p_agent_system').value },
    diary: { system: $('p_diary_system').value, userTemplate: $('p_diary_userTemplate').value },
    profile: { system: $('p_profile_system').value, userTemplate: $('p_profile_userTemplate').value },
    stickyNote: { system: $('p_sticky_system').value, userTemplate: $('p_sticky_userTemplate').value }
  };
  await api('/admin/api/prompts', { method: 'POST', body: JSON.stringify(payload) });
  setText($('promptsMsg'), '已保存');
  await loadPrompts();
}

export async function resetPrompts() {
  if (!confirm('确定恢复默认提示词？')) return;
  await api('/admin/api/prompts/reset', { method: 'POST', body: '{}' });
  setText($('promptsMsg'), '已恢复默认');
  await loadPrompts();
}

export async function importPrompts() {
  const url = String($('promptsImportUrl')?.value || '').trim();
  setText($('promptsImportMsg'), '');
  if (!url) {
    setText($('promptsImportMsg'), '请先填 Raw JSON 地址');
    return;
  }
  if (!confirm('确定从该地址导入并覆盖当前提示词？')) return;
  await api('/admin/api/prompts/import', {
    method: 'POST',
    body: JSON.stringify({ url })
  });
  persistImportPrefsFromUi();
  setText($('promptsImportMsg'), '已导入并覆盖');
  await loadPrompts();
}

export async function autoSyncPromptsIfEnabled() {
  if (autoSynced) return;
  autoSynced = true;

  const url = String($('promptsImportUrl')?.value || '').trim();
  const enabled = Boolean($('promptsAutoSync')?.checked);
  if (!enabled || !url) return;

  try {
    await api('/admin/api/prompts/import', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
    setText($('promptsImportMsg'), '已自动同步');
  } catch (e) {
    setText($('promptsImportMsg'), `自动同步失败：${String(e?.message || e)}`);
  }
}

export function initPromptsHandlers() {
  loadImportPrefsIntoUi();
  $('promptsImportUrl')?.addEventListener('change', persistImportPrefsFromUi);
  $('promptsAutoSync')?.addEventListener('change', persistImportPrefsFromUi);

  $('savePromptsBtn').addEventListener('click', () => {
    runBusy($('savePromptsBtn'), () => savePrompts().catch(e => setText($('promptsMsg'), String(e?.message || e))), '保存中...');
  });
  $('resetPromptsBtn').addEventListener('click', () => {
    runBusy($('resetPromptsBtn'), () => resetPrompts().catch(e => setText($('promptsMsg'), String(e?.message || e))), '恢复中...');
  });
  $('importPromptsBtn')?.addEventListener('click', () => {
    runBusy($('importPromptsBtn'), () => importPrompts().catch(e => setText($('promptsImportMsg'), String(e?.message || e))), '导入中...');
  });
}
