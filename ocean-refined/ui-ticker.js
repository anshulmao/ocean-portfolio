// One clock for the whole interface. The heading tape and minimap, the journey
// layer (with the guided tour and the dive planner on its back), the landmark
// prompt, the dive computer and the ambient sound all subscribe here instead of
// running animation-frame loops and timers of their own.
//
// A subscriber asks for every frame (hz 0) or for a rate (10, 5, 4 times a
// second) and is handed the seconds since it last ran. The rules they share:
// read no layout, allocate nothing, look nothing up in the document, and write
// to the page only when the value on screen would change.
//
// The loop follows the scene. While the scene draws, frame subscribers run once
// per drawn frame; when it stops drawing (paused and settled, still loading, or
// no 3D scene at all) the loop hands over to a slow timer, and while the tab is
// hidden nothing runs. tick(dt) drives everything by hand: oceanControls.step
// does that through oceanJourney.tick when the page is not painting.
const DOZE = 125, SETTLE = 30;
const subscribers = [];
let frameId = 0, timerId = 0, last = 0, drawn = -1, still = 0;

/** Calls fn(seconds) every frame (hz 0) or about hz times a second. Returns a function that unsubscribes. */
export function onTick(fn, hz = 0) {
  // Rate subscribers start out of step with one another, so they never all land on one frame.
  const every = hz > 0 ? 1 / hz : 0, subscriber = { fn, every, wait: every * (subscribers.length % 4) / 4, since: 0 };
  subscribers.push(subscriber);
  // A subscriber may leave from inside its own call: it is dropped the next time the list is walked.
  return () => { subscriber.fn = null; };
}
function dispatch(dt, frames) {
  for (let i = 0; i < subscribers.length; i++) {
    const subscriber = subscribers[i];
    if (!subscriber.fn) { subscribers.splice(i--, 1); continue; }
    subscriber.since += dt;
    if (subscriber.every) { subscriber.wait -= dt; if (subscriber.wait > 0) continue; subscriber.wait = subscriber.every; }
    else if (!frames) continue;
    const since = subscriber.since; subscriber.since = 0;
    subscriber.fn(since);
  }
}
/** QA hook: advance every subscriber by dt seconds, whatever the scene is doing. */
export function tick(dt = 1 / 60) { dispatch(dt, true); }

// Shared interface state, kept by observers so no subscriber has to search the document each frame:
// whether a dialog is open, whether the scene controls are open and whether motion is paused.
// The stylesheets read the same facts from body[data-dialog] and body[data-motion].
export const ui = { dialog: false, panel: false, paused: false };
function readDialogs() {
  const open = Boolean(document.querySelector('dialog[open]'));
  if (open === ui.dialog) return;
  ui.dialog = open;
  if (open) document.body.dataset.dialog = 'open'; else delete document.body.dataset.dialog;
}
function readPanel() { ui.panel = document.body.dataset.movementPanel === 'open'; }
function readMotion() {
  const paused = document.querySelector('#motion')?.getAttribute('aria-pressed') === 'true';
  if (paused === ui.paused) return;
  ui.paused = paused;
  if (paused) document.body.dataset.motion = 'paused'; else delete document.body.dataset.motion;
}
new MutationObserver(readDialogs).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
new MutationObserver(readPanel).observe(document.body, { attributes: true, attributeFilter: ['data-movement-panel'] });
const motionButton = document.querySelector('#motion');
if (motionButton) new MutationObserver(readMotion).observe(motionButton, { attributes: true, attributeFilter: ['aria-pressed'] });
readDialogs(); readPanel(); readMotion();

function frame(now) {
  frameId = requestAnimationFrame(frame);
  const dt = last ? Math.min((now - last) / 1000, .1) : 0, frames = window.oceanDiagnostics?.frames;
  last = now;
  // A display faster than the scene draws gets one interface frame per drawn frame, not one per refresh.
  // Each subscriber is handed the whole time since it last ran, so a skipped refresh loses nothing.
  if (frames !== drawn) { drawn = frames; still = 0; dispatch(dt, true); return; }
  dispatch(dt, false);
  if (++still > SETTLE) doze();
}
function doze() {
  cancelAnimationFrame(frameId); frameId = 0; last = 0;
  if (!timerId) timerId = setInterval(slow, DOZE);
}
function slow() {
  if (typeof window.oceanDiagnostics?.frames === 'number' && window.oceanDiagnostics.frames !== drawn) { run(); return; }
  dispatch(DOZE / 1000, true);
}
function run() {
  clearInterval(timerId); timerId = 0;
  if (!frameId && !document.hidden) { still = 0; frameId = requestAnimationFrame(frame); }
}
function stop() { cancelAnimationFrame(frameId); clearInterval(timerId); frameId = timerId = 0; last = 0; }
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else run(); });
run();

window.oceanUi = { tick, ui, get running() { return frameId ? 'frames' : timerId ? 'slow' : 'stopped'; }, get subscribers() { return subscribers.length; } };
