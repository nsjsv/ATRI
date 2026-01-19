export function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`找不到元素：#${id}`);
  return el;
}

export function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}
