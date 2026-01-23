import { api } from '../lib/api.js';
import { $ } from '../lib/dom.js';
import { runBusy, setTagState, setText } from '../lib/ui.js';

function fmtTs(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || '');
  }
}

function clearSecretsInputs() {
  for (const id of ['openaiApiKey', 'embeddingsApiKey', 'diaryApiKey', 'tavilyApiKey']) {
    const el = $(id);
    el.value = '';
  }
}

function resetClearCheckboxes() {
  for (const key of ['openai', 'embeddings', 'diary', 'tavily']) {
    const id = `clear${key[0].toUpperCase() + key.slice(1)}ApiKey`;
    const el = document.getElementById(id);
    if (el) el.checked = false;
  }
}

function getEffectiveDiaryFormat() {
  const chat = String($('chatApiFormat')?.value || 'openai').trim() || 'openai';
  const diaryRaw = String($('diaryApiFormat')?.value || '').trim();
  const diary = diaryRaw || chat;
  return { chat, diary };
}

function applyUpstreamHints() {
  const { chat, diary } = getEffectiveDiaryFormat();

  const urlHint =
    chat === 'anthropic'
      ? 'https://api.anthropic.com'
      : chat === 'gemini'
        ? 'https://generativelanguage.googleapis.com'
        : 'https://api.openai.com';
  $('openaiApiUrl').placeholder = urlHint;

  const modelHint =
    chat === 'anthropic'
      ? 'claude-3-5-sonnet-20241022'
      : chat === 'gemini'
        ? 'gemini-1.5-pro'
        : 'gpt-4o';
  $('defaultChatModel').placeholder = modelHint;

  const diaryModelHint =
    diary === 'anthropic'
      ? 'claude-3-5-sonnet-20241022'
      : diary === 'gemini'
        ? 'gemini-1.5-pro'
        : 'gpt-4o-mini';
  $('diaryModel').placeholder = diaryModelHint;

  const needsAnthropic = chat === 'anthropic' || diary === 'anthropic';
  const anthropicCol = $('anthropicVersion')?.closest('.col');
  if (anthropicCol) anthropicCol.hidden = !needsAnthropic;
}

export async function loadConfig() {
  const data = await api('/admin/api/config');
  const c = data.stored?.config || {};

  setText(
    $('configMeta'),
    `已保存更新时间：${data.stored?.updatedAt ? fmtTs(data.stored.updatedAt) : '（无）'}；加密键：${
      data.stored?.encryption?.configured ? '已配置' : '未配置'
    }`
  );

  $('chatApiFormat').value = c.chatApiFormat || data.effective?.chatApiFormat || 'openai';
  $('anthropicVersion').value = c.anthropicVersion || data.effective?.anthropicVersion || '';

  $('openaiApiUrl').value = c.openaiApiUrl || data.effective?.openaiApiUrl || '';
  $('defaultChatModel').value = c.defaultChatModel || data.effective?.defaultChatModel || '';

  $('embeddingsApiUrl').value = c.embeddingsApiUrl || data.effective?.embeddingsApiUrl || '';
  $('embeddingsModel').value = c.embeddingsModel || data.effective?.embeddingsModel || '';

  $('diaryApiFormat').value = c.diaryApiFormat || '';
  $('diaryApiUrl').value = c.diaryApiUrl || data.effective?.diaryApiUrl || '';
  $('diaryModel').value = c.diaryModel || data.effective?.diaryModel || '';

  $('agentTemperature').value = c.agentTemperature ?? data.effective?.agentTemperature ?? '';
  $('agentMaxTokens').value = c.agentMaxTokens ?? data.effective?.agentMaxTokens ?? '';
  $('diaryTemperature').value = c.diaryTemperature ?? data.effective?.diaryTemperature ?? '';
  $('diaryMaxTokens').value = c.diaryMaxTokens ?? data.effective?.diaryMaxTokens ?? '';
  $('profileTemperature').value = c.profileTemperature ?? data.effective?.profileTemperature ?? '';

  const flags = data.stored?.secrets || {};
  setTagState($('openaiKeyFlag'), flags.openaiApiKey);
  setTagState($('embeddingsKeyFlag'), flags.embeddingsApiKey);
  setTagState($('diaryKeyFlag'), flags.diaryApiKey);
  setTagState($('tavilyKeyFlag'), flags.tavilyApiKey);

  resetClearCheckboxes();
  clearSecretsInputs();
  applyUpstreamHints();
}

function buildSavePayload() {
  const { chat, diary } = getEffectiveDiaryFormat();
  const needsAnthropic = chat === 'anthropic' || diary === 'anthropic';

  const config = {
    chatApiFormat: $('chatApiFormat').value,
    openaiApiUrl: $('openaiApiUrl').value,
    defaultChatModel: $('defaultChatModel').value,
    anthropicVersion: needsAnthropic ? $('anthropicVersion').value : '',
    embeddingsApiUrl: $('embeddingsApiUrl').value,
    embeddingsModel: $('embeddingsModel').value,
    diaryApiFormat: $('diaryApiFormat').value,
    diaryApiUrl: $('diaryApiUrl').value,
    diaryModel: $('diaryModel').value,
    agentTemperature: $('agentTemperature').value,
    agentMaxTokens: $('agentMaxTokens').value,
    diaryTemperature: $('diaryTemperature').value,
    diaryMaxTokens: $('diaryMaxTokens').value,
    profileTemperature: $('profileTemperature').value
  };

  const secrets = {};

  const s1 = $('openaiApiKey').value;
  const s2 = $('embeddingsApiKey').value;
  const s3 = $('diaryApiKey').value;
  const s4 = $('tavilyApiKey').value;
  if (s1) secrets.openaiApiKey = s1;
  if (s2) secrets.embeddingsApiKey = s2;
  if (s3) secrets.diaryApiKey = s3;
  if (s4) secrets.tavilyApiKey = s4;

  if ($('clearOpenaiApiKey').checked) secrets.openaiApiKey = null;
  if ($('clearEmbeddingsApiKey').checked) secrets.embeddingsApiKey = null;
  if ($('clearDiaryApiKey').checked) secrets.diaryApiKey = null;
  if ($('clearTavilyApiKey').checked) secrets.tavilyApiKey = null;

  return { config, secrets };
}

export async function saveConfig() {
  setText($('configMsg'), '');
  await api('/admin/api/config', {
    method: 'POST',
    body: JSON.stringify(buildSavePayload())
  });
  setText($('configMsg'), '已保存');
  await loadConfig();
}

export async function resetConfig() {
  if (!confirm('确定清空运行时配置？清空后会回退到 .env 配置。')) return;
  await api('/admin/api/config/reset', { method: 'POST', body: '{}' });
  setText($('configMsg'), '已清空');
  await loadConfig();
}

export function initConfigHandlers() {
  $('saveConfigBtn').addEventListener('click', () => {
    runBusy($('saveConfigBtn'), () => saveConfig().catch(e => setText($('configMsg'), String(e?.message || e))), '保存中...');
  });
  $('resetConfigBtn').addEventListener('click', () => {
    runBusy($('resetConfigBtn'), () => resetConfig().catch(e => setText($('configMsg'), String(e?.message || e))), '重置中...');
  });

  $('chatApiFormat')?.addEventListener('change', applyUpstreamHints);
  $('diaryApiFormat')?.addEventListener('change', applyUpstreamHints);
}
