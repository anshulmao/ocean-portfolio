// The touch deck for a dive: a thumb-stick bottom left and a cluster of buttons bottom right (markup in index.html,
// looks in controls.css). The stick writes an analog vector that the swimming model reads on its own clock; nothing
// here runs per frame, and the only layout read is one rectangle when a thumb lands.
//
// The deck shows only while touch is the kind of input in use: <html data-input="touch">. A fine pointer never sees it.
// REACH: how far the knob travels (px). BASE: the ring's radius, which keeps it whole inside its corner. CURVE: the response curve.
const REACH = 40, BASE = 52, CURVE = 1.5;

/**
 * @param {object} options
 * @param {Element|null} options.root     the .swim-controls element
 * @param {{x:number,y:number,active:boolean}} options.stick  written here: x right, y forward, each -1..1 after dead zone and curve
 * @param {() => number} options.deadZone fraction of the travel ignored round the centre
 * @param {() => boolean} options.onEngage a thumb landed on the stick; return false to refuse it (a dialog is open, the diver is surfacing)
 * @param {(name:string) => void} options.onAction  'interact' | 'camera' | 'lamp'
 */
export function createTouchControls({ root, stick, deadZone = () => .14, onEngage = () => true, onAction = () => {}, wake = () => {} }) {
  const html = document.documentElement, removers = [];
  const listen = (target, event, handler, options) => { target.addEventListener(event, handler, options); removers.push(() => target.removeEventListener(event, handler, options)); };
  const setInput = type => { if (html.dataset.input !== type) html.dataset.input = type; };
  // The last pointer to go down decides: a tablet with a mouse plugged in gets the deck when it is touched and loses it when the mouse clicks.
  if (html.dataset.input === undefined) setInput(matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse');
  listen(window, 'pointerdown', event => { if (event.pointerType === 'touch') setInput('touch'); else if (event.pointerType === 'mouse') setInput('mouse'); }, { capture: true, passive: true });
  if (!root) return { destroy() { for (const remove of removers) remove(); } };
  // A long press must not open the browser's menu over the controls.
  listen(root, 'contextmenu', event => event.preventDefault());

  const zone = root.querySelector('.touch-stick'), knob = zone?.querySelector('.touch-stick-knob');
  let pointer = null, centreX = 0, centreY = 0;
  // dx right and dy down, in pixels from where the thumb landed.
  function deflect(dx, dy) {
    const length = Math.hypot(dx, dy), held = length > REACH ? REACH / length : 1;
    knob.style.translate = `${(dx * held).toFixed(1)}px ${(dy * held).toFixed(1)}px`;
    // A radial dead zone, then a curve that leaves the first part of the travel for slow, precise swimming.
    const travel = Math.min(1, length / REACH), dead = Math.min(.9, Math.max(0, deadZone())), drive = travel <= dead ? 0 : Math.pow((travel - dead) / (1 - dead), CURVE), unit = length > 0 ? drive / length : 0;
    stick.x = dx * unit; stick.y = -dy * unit;
    wake();
  }
  function letGo(event) {
    if (event && event.pointerId !== pointer) return;
    pointer = null; stick.x = stick.y = 0; stick.active = false;
    if (zone) { delete zone.dataset.held; zone.style.removeProperty('--stick-x'); zone.style.removeProperty('--stick-y'); knob.style.translate = ''; }
    wake();
  }
  if (zone && knob) {
    listen(zone, 'pointerdown', event => {
      if (pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      if (onEngage() === false) return;
      pointer = event.pointerId;
      try { zone.setPointerCapture(pointer); } catch { /* a synthetic pointer cannot be captured; the moves still arrive */ }
      // The base floats to the thumb, kept whole inside its corner.
      const box = zone.getBoundingClientRect();
      centreX = Math.min(box.right - BASE, Math.max(box.left + BASE, event.clientX)); centreY = Math.min(box.bottom - BASE, Math.max(box.top + BASE, event.clientY));
      zone.style.setProperty('--stick-x', `${(centreX - box.left).toFixed(1)}px`); zone.style.setProperty('--stick-y', `${(centreY - box.top).toFixed(1)}px`);
      zone.dataset.held = 'true'; stick.active = true;
      deflect(event.clientX - centreX, event.clientY - centreY);
    });
    listen(zone, 'pointermove', event => { if (event.pointerId === pointer) deflect(event.clientX - centreX, event.clientY - centreY); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(zone, type, letGo);
    // Leaving the page mid-swim (a call, the app switcher) must not leave the stick held over.
    listen(window, 'blur', () => letGo());
    listen(document, 'visibilitychange', () => { if (document.hidden) letGo(); });
  }

  // Taps: interact, camera. (The flashlight button is wired with the keys it mirrors, in exploration.js; rise, sink and the scooter are held keys.)
  for (const button of root.querySelectorAll('[data-action]')) listen(button, 'click', () => onAction(button.dataset.action));
  // The buttons mirror state that lives elsewhere, by watching it change rather than by asking every frame.
  const observers = [];
  const mirror = (source, attribute, apply) => { if (!source) return; const observer = new MutationObserver(apply); observer.observe(source, { attributes: true, attributeFilter: [attribute] }); observers.push(observer); apply(); };
  const interact = root.querySelector('[data-action="interact"]'), camera = root.querySelector('[data-action="camera"]');
  const prompt = document.getElementById('interact-prompt'), cameraToggle = document.getElementById('camera-toggle');
  if (interact) mirror(prompt, 'hidden', () => { interact.dataset.ready = String(!prompt.hidden); interact.setAttribute('aria-disabled', String(prompt.hidden)); });
  if (camera) mirror(cameraToggle, 'aria-pressed', () => camera.setAttribute('aria-pressed', cameraToggle.getAttribute('aria-pressed') === 'true' ? 'true' : 'false'));

  return { destroy() { letGo(); for (const remove of removers) remove(); for (const observer of observers) observer.disconnect(); } };
}
