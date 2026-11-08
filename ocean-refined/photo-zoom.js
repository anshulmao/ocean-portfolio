// A full-screen viewer for the dive log's postcards (dive-summary.js) that zooms and pans. It is a modal <dialog>
// nested in the log's own, so the browser traps focus in it and Escape closes only the picture. Zoom with a pinch, the
// mouse wheel, a double tap or click, the + and − buttons or keys; drag (or use the arrow keys) to look round a zoomed
// picture; 0 fits it again. Only transform and opacity move. Styled in dive-summary.css (.pz).
const MIN = 1, MAX = 6, STEP = 1.5;
let box = null, stage = null, image = null, caption = null, level = null, opener = null, url = null;
let scale = 1, x = 0, y = 0;
const pointers = new Map();
let pinch = null, drag = null, lastTap = 0;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
// Keep the picture covering what it can of the stage: no panning it off into empty space.
function bound() {
  const w = stage.clientWidth, h = stage.clientHeight, iw = image.clientWidth * scale, ih = image.clientHeight * scale;
  const mx = Math.max(0, (iw - w) / 2), my = Math.max(0, (ih - h) / 2);
  x = clamp(x, -mx, mx); y = clamp(y, -my, my);
}
function apply(animate = false) {
  bound();
  image.style.transition = animate ? 'transform var(--motion-settle,.24s) var(--journey-ease,ease)' : 'none';
  image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  level.textContent = `${Math.round(scale * 100)}%`;
  box.dataset.zoomed = String(scale > 1.01);
  box.querySelector('[data-zoom="out"]').disabled = scale <= MIN + .001;
  box.querySelector('[data-zoom="in"]').disabled = scale >= MAX - .001;
}
// Zoom to `next` about a point of the stage (cx, cy from its centre), so what is under the fingers stays there.
function zoomTo(next, cx = 0, cy = 0, animate = false) {
  next = clamp(next, MIN, MAX);
  const k = next / scale;
  x = cx - (cx - x) * k; y = cy - (cy - y) * k; scale = next;
  if (scale <= MIN + .001) { x = 0; y = 0; }
  apply(animate);
}
const fromCentre = event => { const r = stage.getBoundingClientRect(); return [event.clientX - r.left - r.width / 2, event.clientY - r.top - r.height / 2]; };

function build(host) {
  box = document.createElement('dialog');
  box.className = 'pz'; box.setAttribute('aria-labelledby', 'pz-caption');
  box.innerHTML = `<div class="pz-bar">
      <p id="pz-caption"></p>
      <div class="pz-tools" role="group" aria-label="Zoom">
        <button type="button" class="holo-chip" data-zoom="out" aria-label="Zoom out">−</button>
        <output class="pz-level" aria-live="polite">100%</output>
        <button type="button" class="holo-chip" data-zoom="in" aria-label="Zoom in">+</button>
        <button type="button" class="holo-chip" data-zoom="fit">Fit</button>
        <button type="button" class="holo-chip pz-close">Close <kbd>Esc</kbd></button>
      </div></div>
    <div class="pz-stage" tabindex="0" aria-label="Photo. Pinch, scroll or double-tap to zoom; drag or use the arrow keys to look round."><img alt="" draggable="false"></div>
    <p class="pz-hint">Pinch, scroll or double-tap to zoom · drag to look round</p>`;
  stage = box.querySelector('.pz-stage'); image = stage.querySelector('img'); caption = box.querySelector('#pz-caption'); level = box.querySelector('.pz-level');
  box.querySelector('.pz-close').addEventListener('click', closeZoom);
  box.querySelector('[data-zoom="in"]').addEventListener('click', () => zoomTo(scale * STEP, 0, 0, true));
  box.querySelector('[data-zoom="out"]').addEventListener('click', () => zoomTo(scale / STEP, 0, 0, true));
  box.querySelector('[data-zoom="fit"]').addEventListener('click', () => zoomTo(1, 0, 0, true));
  box.addEventListener('cancel', event => { event.preventDefault(); closeZoom(); });
  box.addEventListener('close', restore);
  // Keys belong to the picture while it is open: the log's carousel underneath never sees them.
  box.addEventListener('keydown', event => {
    const pan = 60;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeZoom(); return; }
    if (event.key === '+' || event.key === '=') zoomTo(scale * STEP, 0, 0, true);
    else if (event.key === '-' || event.key === '_') zoomTo(scale / STEP, 0, 0, true);
    else if (event.key === '0') zoomTo(1, 0, 0, true);
    else if (event.key.startsWith('Arrow') && event.target === stage) {
      x += event.key === 'ArrowLeft' ? pan : event.key === 'ArrowRight' ? -pan : 0; y += event.key === 'ArrowUp' ? pan : event.key === 'ArrowDown' ? -pan : 0; apply(true);
    } else return;
    event.preventDefault(); event.stopPropagation();
  });
  stage.addEventListener('wheel', event => {
    event.preventDefault();
    const [cx, cy] = fromCentre(event);
    zoomTo(scale * Math.exp(-event.deltaY * (event.ctrlKey ? .01 : .0025)), cx, cy);
  }, { passive: false });
  stage.addEventListener('pointerdown', event => {
    stage.setPointerCapture(event.pointerId); pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { distance: Math.hypot(a[0] - b[0], a[1] - b[1]), scale }; drag = null; }
    else if (pointers.size === 1) drag = { x: event.clientX, y: event.clientY, ox: x, oy: y, moved: false };
  });
  stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()], r = stage.getBoundingClientRect();
      zoomTo(pinch.scale * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.distance, (a[0] + b[0]) / 2 - r.left - r.width / 2, (a[1] + b[1]) / 2 - r.top - r.height / 2);
    } else if (drag) {
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      x = drag.ox + dx; y = drag.oy + dy; apply();
    }
  });
  const lift = event => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (event.type === 'pointerup' && drag && !drag.moved) {
      // A double tap or click zooms in on that spot, or back out to fit.
      const now = performance.now();
      if (now - lastTap < 320) { const [cx, cy] = fromCentre(event); zoomTo(scale > 1.01 ? 1 : 2.5, cx, cy, true); lastTap = 0; } else lastTap = now;
    }
    drag = pointers.size === 1 ? { x: [...pointers.values()][0][0], y: [...pointers.values()][0][1], ox: x, oy: y, moved: true } : null;
  };
  stage.addEventListener('pointerup', lift); stage.addEventListener('pointercancel', lift);
  addEventListener('resize', () => { if (box.open) apply(); });
  host.append(box);
}
function restore() {
  if (url) { URL.revokeObjectURL(url); url = null; }
  image.removeAttribute('src');
  const back = opener; opener = null;
  if (back?.isConnected) back.focus({ preventScroll: true });
}

/** Opens a photo: src (a URL) or blob (a full-size Blob, preferred), with alt text and a caption line. */
export function openZoom(host, { src, blob, alt = '', label = '' }, from = document.activeElement) {
  if (!box) build(host);
  if (box.open) return;
  opener = from; scale = 1; x = 0; y = 0; pointers.clear(); pinch = drag = null;
  if (blob) url = URL.createObjectURL(blob);
  image.src = url || src; image.alt = alt; caption.textContent = label;
  box.showModal(); apply(); stage.focus({ preventScroll: true });
}
export function closeZoom() { if (box?.open) box.close(); }
export const zoomOpen = () => Boolean(box?.open);
