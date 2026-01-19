export function setText(el, text) {
  el.textContent = String(text || '');
}

export function setTagState(el, state) {
  el.classList.remove('set');
  if (state === true) {
    el.classList.add('set');
    el.textContent = '（已设置）';
    return;
  }
  if (state === false) {
    el.textContent = '（未设置）';
    return;
  }
  el.textContent = '（未知）';
}

export async function runBusy(button, fn, busyText = '处理中...') {
  const prevText = button.textContent || '';
  const prevDisabled = button.disabled;
  button.disabled = true;
  button.textContent = busyText;
  try {
    return await fn();
  } finally {
    button.disabled = prevDisabled;
    button.textContent = prevText;
  }
}

export async function copyToClipboard(text) {
  const value = String(text ?? '');
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // fallback for non-secure context / older browsers
    try {
      const el = document.createElement('textarea');
      el.value = value;
      el.setAttribute('readonly', 'true');
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      el.style.top = '0';
      document.body.appendChild(el);
      el.select();
      el.setSelectionRange(0, el.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}
