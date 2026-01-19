import { $, $all } from '../lib/dom.js';

const TAB_KEYS = ['config', 'overview', 'prompts', 'conversation', 'logs'];

function setAriaSelected(el, selected) {
  el.setAttribute('aria-selected', selected ? 'true' : 'false');
}

export function setTab(activeKey) {
  for (const el of $all('.tab[data-tab]')) {
    const selected = el.dataset.tab === activeKey;
    el.classList.toggle('active', selected);
    setAriaSelected(el, selected);
  }

  for (const key of TAB_KEYS) {
    const panel = $(`tab-${key}`);
    panel.hidden = key !== activeKey;
  }
}

export function initTabs() {
  for (const el of $all('.tab[data-tab]')) {
    el.addEventListener('click', () => setTab(String(el.dataset.tab || 'config')));
  }
}
