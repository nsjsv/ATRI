import { api } from '../lib/api.js';
import { $ } from '../lib/dom.js';
import { setText } from '../lib/ui.js';

function fmtTs(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || '');
  }
}

export function createLogsController() {
  let streaming = false;
  let es = null;
  let logs = [];

  function render() {
    const lines = (logs || []).map((it) => {
      const lvl = String(it.level || 'info').toUpperCase();
      const msg = it.message || '';
      const meta = it.meta ? JSON.stringify(it.meta) : '';
      return `[${fmtTs(it.ts)}] [${lvl}] ${msg}${meta ? ' ' + meta : ''}`;
    });
    $('logsBox').textContent = lines.join('\n');
  }

  async function load() {
    const data = await api('/admin/api/logs');
    logs = data.items || [];
    render();
    setText($('logsMsg'), `共 ${logs.length} 条`);
  }

  function start() {
    if (streaming) return;
    streaming = true;
    setText($('toggleStreamBtn'), '停止实时');
    es = new EventSource('/admin/api/logs/stream');

    es.addEventListener('snapshot', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        logs = data.items || [];
        render();
      } catch {
        // ignore
      }
    });

    es.addEventListener('log', (ev) => {
      try {
        const item = JSON.parse(ev.data);
        logs.push(item);
        if (logs.length > 1000) logs = logs.slice(-1000);
        render();
      } catch {
        // ignore
      }
    });

    es.onerror = () => {
      setText($('logsMsg'), '实时连接断开');
    };
  }

  function stop() {
    if (!streaming) return;
    streaming = false;
    setText($('toggleStreamBtn'), '开始实时');
    try {
      es && es.close();
    } catch {
      // ignore
    }
    es = null;
  }

  function toggle() {
    if (streaming) stop();
    else start();
  }

  return { load, start, stop, toggle };
}

export function initLogsHandlers(controller) {
  $('refreshLogsBtn').addEventListener('click', () => controller.load().catch(e => setText($('logsMsg'), String(e?.message || e))));
  $('toggleStreamBtn').addEventListener('click', () => controller.toggle());
}
