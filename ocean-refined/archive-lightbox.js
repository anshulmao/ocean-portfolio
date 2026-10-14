// Image lightbox for the Dive Explorer records. A second modal <dialog> nested inside the records dialog, so the
// browser supplies the focus trap, Escape closes only the picture, and focus goes back to the control that opened
// it. Nothing is created until a picture is opened for the first time, and nothing runs while it is closed.
// Styled in archive.css (.arc-lightbox); only opacity and scale move.
let box = null, image = null, caption = null, original = null, opener = null;

function build(host) {
  box = document.createElement('dialog');
  box.className = 'arc-lightbox'; box.setAttribute('aria-labelledby', 'arc-lightbox-caption');
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'arc-lightbox-close'; close.setAttribute('aria-label', 'Close image');
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" class="hud-icon"><path d="M6 6l12 12M18 6 6 18"/></svg><span>Close</span><kbd>Esc</kbd>';
  image = document.createElement('img'); image.decoding = 'async';
  caption = document.createElement('p'); caption.id = 'arc-lightbox-caption';
  original = document.createElement('a'); original.target = '_blank'; original.rel = 'noopener'; original.textContent = 'Open original in a new tab';
  const frame = document.createElement('figure'), foot = document.createElement('figcaption');
  foot.append(caption, original); frame.append(image, foot); box.append(close, frame);
  close.addEventListener('click', closeLightbox);
  // A click on the dimmed area around the picture closes it; a click on the picture or its caption does not.
  box.addEventListener('click', event => { if (event.target === box) closeLightbox(); });
  // Escape is answered here, so one press closes the picture and never the records underneath (the browser
  // closes both at once when the picture was opened without a fresh click or key press). Arrow keys belong to
  // the records; while a picture is open they do nothing.
  box.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeLightbox(); }
    else if (event.key.startsWith('Arrow')) event.stopPropagation();
  });
  box.addEventListener('cancel', event => { event.preventDefault(); closeLightbox(); });
  box.addEventListener('close', restore);
  host.append(box);
}
function restore() {
  const target = opener; opener = null;
  if (target?.isConnected) target.focus({ preventScroll: true });
}

/** Shows one picture. visual: { src, alt, width, height, caption }. from: the control focus returns to. */
export function openLightbox(host, visual, from = document.activeElement) {
  if (!box) build(host);
  if (box.open) return;
  opener = from;
  image.src = visual.src; image.alt = visual.alt; image.width = visual.width; image.height = visual.height;
  // The stylesheet sizes the picture from these, so its box is right before the file has arrived.
  image.style.setProperty('--w', visual.width); image.style.setProperty('--ar', visual.width / visual.height);
  caption.textContent = visual.caption; original.href = visual.src;
  box.showModal();
  box.querySelector('.arc-lightbox-close').focus({ preventScroll: true });
}
export function closeLightbox() {
  if (!box?.open) return;
  box.close();
  // Some embedded views never deliver the close event, so focus is handed back here as well.
  restore();
}
export const lightboxOpen = () => Boolean(box?.open);
