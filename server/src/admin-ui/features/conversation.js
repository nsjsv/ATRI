import { api } from '../lib/api.js';
import { $ } from '../lib/dom.js';
import { runBusy, setText } from '../lib/ui.js';

function fmtTime(ts) {
  const n = Number(ts || 0);
  if (!Number.isFinite(n) || n <= 0) return '--';
  try {
    return new Date(n).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return String(n);
  }
}

function fmtLog(line) {
  const role = line.role === 'atri' ? 'ATRI' : 'USER';
  const replyTo = line.replyTo ? ` ↩ ${String(line.replyTo).slice(0, 8)}` : '';
  const text = String(line.content || '').replace(/\s+/g, ' ').trim();
  return `[${fmtTime(line.timestamp)}] ${role}${replyTo}: ${text}`;
}

function appendOut(lines) {
  const box = $('convOut');
  const prev = String(box.textContent || '');
  const next = (Array.isArray(lines) ? lines : []).filter(Boolean).join('\n');
  box.textContent = prev && next ? `${prev}\n${next}` : (prev || next);
}

function setAfterFromLogs(logs) {
  const arr = Array.isArray(logs) ? logs : [];
  const last = arr.length ? arr[arr.length - 1] : null;
  const ts = last && typeof last.timestamp === 'number' ? last.timestamp : null;
  if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
    $('convAfter').value = String(ts);
  }
}

async function pullOnce({ append }) {
  setText($('convMsg'), '');
  const userId = String($('convUserId').value || '').trim();
  if (!userId) {
    setText($('convMsg'), '请先填 userId');
    return;
  }

  const after = Number(String($('convAfter').value || '0').trim() || '0');
  const limit = Number(String($('convLimit').value || '50').trim() || '50');
  const role = String($('convRole').value || '').trim();

  const qs = new URLSearchParams();
  qs.set('userId', userId);
  if (Number.isFinite(after) && after > 0) qs.set('after', String(after));
  if (Number.isFinite(limit) && limit > 0) qs.set('limit', String(limit));
  if (role) qs.set('role', role);

  const data = await api(`/admin/api/conversation/pull?${qs.toString()}`);
  const logs = Array.isArray(data?.logs) ? data.logs : [];
  if (!append) $('convOut').textContent = '';

  appendOut(logs.map(fmtLog));
  setAfterFromLogs(logs);
  setText($('convMsg'), logs.length ? `拉到 ${logs.length} 条` : '没有新消息');
}

export function initConversationHandlers() {
  $('convPullBtn')?.addEventListener('click', () => {
    runBusy($('convPullBtn'), () => pullOnce({ append: false }), '拉取中...');
  });

  $('convNextBtn')?.addEventListener('click', () => {
    runBusy($('convNextBtn'), () => pullOnce({ append: true }), '拉取中...');
  });

  $('convClearBtn')?.addEventListener('click', () => {
    $('convOut').textContent = '';
    setText($('convMsg'), '');
  });
}

