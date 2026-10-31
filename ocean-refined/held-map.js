// A momentary chart shortcut: Caps Lock's toggle state never acts as a latch.
export function bindHeldMap({window, document, available, getExpanded, setExpanded}) {
  const held = new Set();
  let previous = false;
  const isMapKey = code => code === 'KeyM' || code === 'CapsLock';
  function release() {
    if (!held.size) return;
    held.clear(); setExpanded(previous);
  }
  window.addEventListener('keydown', event => {
    if (!isMapKey(event.code) || event.repeat || !available() ||
        event.ctrlKey || event.altKey || event.metaKey ||
        event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    event.preventDefault();
    if (!held.size) previous = getExpanded();
    held.add(event.code); setExpanded(true);
  });
  window.addEventListener('keyup', event => {
    if (!held.has(event.code)) return;
    event.preventDefault(); held.delete(event.code);
    if (!held.size) setExpanded(previous);
  });
  window.addEventListener('blur', release);
  window.addEventListener('oceanmediumchange', () => { release(); setExpanded(false); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
}
