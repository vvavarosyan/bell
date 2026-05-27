// Tiny global toast helper. Lives in the DOM, no React state needed.
let timer = null;
export function toast(message, kind = 'success') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'toast ' + kind;
  clearTimeout(timer);
  timer = setTimeout(() => { el.remove(); }, 2200);
}
