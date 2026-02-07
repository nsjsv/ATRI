import { api } from '../lib/api.js';
import { $ } from '../lib/dom.js';
import { copyToClipboard, runBusy, setText } from '../lib/ui.js';

function fmtList(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr.map((item) => String(item || '').trim()).filter(Boolean);
}

function fmtTs(ts) {
  const n = Number(ts || 0);
  if (!Number.isFinite(n) || n <= 0) return '';
  try {
    return new Date(n).toLocaleString();
  } catch {
    return '';
  }
}

function shortDigest(digest) {
  const text = String(digest || '').trim().toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(text)) return '';
  return `${text.slice(0, 19)}…${text.slice(-8)}`;
}

function renderUpdateResult(result) {
  const status = String(result?.status || '').trim();
  const image = String(result?.image || '').trim();
  const tag = String(result?.tag || '').trim();
  const remoteDigest = shortDigest(result?.remoteDigest);
  const currentDigest = shortDigest(result?.currentDigest);
  const checkedAt = fmtTs(result?.checkedAt);
  const modifiedAt = fmtTs(result?.remoteLastModifiedAt);
  const details = String(result?.details || '').trim();

  if (status === 'up_to_date') {
    setText($('overviewUpdateStatus'), '当前已是最新镜像');
  } else if (status === 'update_available') {
    setText($('overviewUpdateStatus'), '检测到新镜像，请在 Zeabur 执行更新');
  } else if (status === 'cannot_compare') {
    setText($('overviewUpdateStatus'), '镜像可查到，但当前实例 digest 未注入，无法比较');
  } else if (status === 'misconfigured') {
    setText($('overviewUpdateStatus'), '镜像检查配置无效');
  } else if (status === 'check_failed') {
    setText($('overviewUpdateStatus'), '镜像检查失败');
  } else {
    setText($('overviewUpdateStatus'), '状态未知');
  }

  const lines = [];
  if (image) lines.push(`镜像：${image}${tag ? `:${tag}` : ''}`);
  if (remoteDigest) lines.push(`远端：${remoteDigest}`);
  if (currentDigest) lines.push(`当前：${currentDigest}`);
  if (modifiedAt) lines.push(`远端时间：${modifiedAt}`);
  if (checkedAt) lines.push(`检查时间：${checkedAt}`);
  if (details) lines.push(`详情：${details}`);
  setText($('overviewUpdateMeta'), lines.join('\n') || '（无）');
}

async function refreshInfo() {
  setText($('overviewMsg'), '');
  const data = await api('/admin/api/info');

  const origin = String(data?.origin || '').trim() || location.origin;
  $('overviewBaseUrl').value = origin;

  const adminPublic = Boolean(data?.admin?.public);
  setText($('overviewMode'), adminPublic ? '公网模式（已开启）' : '本机模式（仅本机/隧道）');

  const allowedOrigins = fmtList(data?.admin?.allowedOrigins);
  setText($('overviewOrigins'), allowedOrigins.length ? allowedOrigins.join('\n') : '（空）');

  const commit = String(data?.build?.commitSha || '').trim();
  const node = String(data?.build?.node || '').trim();
  const buildInfoParts = [
    commit ? `commit：${commit}` : null,
    node ? `node：${node}` : null
  ].filter(Boolean);
  setText($('overviewBuildInfo'), buildInfoParts.join('；') || '（平台未提供构建信息）');
}

async function checkUpdate() {
  setText($('overviewMsg'), '');
  const data = await api('/admin/api/update-check');
  renderUpdateResult(data || {});
}

export async function loadOverviewInfo() {
  try {
    await refreshInfo();
    await checkUpdate();
  } catch (e) {
    $('overviewBaseUrl').value = location.origin;
    setText($('overviewMode'), '（获取失败）');
    setText($('overviewOrigins'), '（获取失败）');
    setText($('overviewBuildInfo'), '（获取失败）');
    setText($('overviewUpdateStatus'), '（获取失败）');
    setText($('overviewUpdateMeta'), '（获取失败）');
    setText($('overviewMsg'), String(e?.message || e));
  }
}

export function initOverviewHandlers() {
  $('copyOverviewBaseUrlBtn')?.addEventListener('click', () => {
    runBusy(
      $('copyOverviewBaseUrlBtn'),
      async () => {
        const ok = await copyToClipboard(String($('overviewBaseUrl').value || '').trim());
        setText($('overviewMsg'), ok ? '已复制' : '复制失败');
      },
      '复制中...'
    );
  });

  $('refreshOverviewBtn')?.addEventListener('click', () => {
    runBusy($('refreshOverviewBtn'), () => loadOverviewInfo(), '刷新中...');
  });

  $('checkUpdateBtn')?.addEventListener('click', () => {
    runBusy(
      $('checkUpdateBtn'),
      () => checkUpdate().catch(e => setText($('overviewMsg'), String(e?.message || e))),
      '检查中...'
    );
  });
}
