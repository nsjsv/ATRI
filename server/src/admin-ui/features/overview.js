import { api } from '../lib/api.js';
import { $ } from '../lib/dom.js';
import { copyToClipboard, runBusy, setText } from '../lib/ui.js';

function fmtList(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr.map((item) => String(item || '').trim()).filter(Boolean);
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

export async function loadOverviewInfo() {
  try {
    await refreshInfo();
  } catch (e) {
    $('overviewBaseUrl').value = location.origin;
    setText($('overviewMode'), '（获取失败）');
    setText($('overviewOrigins'), '（获取失败）');
    setText($('overviewBuildInfo'), '（获取失败）');
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
}

