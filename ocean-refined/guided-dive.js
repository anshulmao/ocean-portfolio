import { toDisplayDepth } from './depth-metrics.js';
import * as THREE from './vendor/three.module.min.js';
import { LANDMARKS, terrainHeightAt } from './reef.js';
import { onFrame, setQuiet, discover, say } from './journey.js';

// The guided dive is a scripted route, not a camera path: it hands waypoints to
// the same autopilot the atlas uses, so the diver still collides, still routes
// over terrain, and any input from the visitor takes the controls straight back.
const SPEED = 5.6, VIA_RADIUS = 3.2, ARRIVE_RADIUS = 1.6;
// Coordinates are world metres (x, y, z); y is negative below the surface.
// A stop with `landmark` takes its viewpoint and subject from the placed model.
export const STOPS = [
  { key: 'about', landmark: 'about', title: 'A model response is not a product outcome.', kicker: `About · The Anchor · ${Math.round(toDisplayDepth(9))} m`, signal: '#7ff0cf',
    lines: 'The complete system includes the workflow, boundaries, evaluation, recovery path, and the reason a user returns. That’s the quality bar behind my work. Press F to read it.' },
  // The wreck's viewpoint sits just above an outcrop, so the route comes down onto it.
  { key: 'experience', landmark: 'experience', title: 'From research to AI product ownership.', kicker: `Experience · The Wreck · ${Math.round(toDisplayDepth(21))} m`, signal: '#ffcf7a', via: [[19, -14.5, -21]],
    lines: 'I learned the market by studying it, the product by operating it, and AI systems by improving and building them. Today I lead Rae across discovery, product strategy, launches, and adoption. Press F to read it.' },
  // Round the wreck, come down the cliff into the gully and swim through the arch.
  // The waypoints follow the gully floor closely because the autopilot rounds every corner by VIA_RADIUS.
  { key: 'projects', landmark: 'projects', title: 'Useful outcomes, different contexts.', kicker: `Projects · The Treasure · ${Math.round(toDisplayDepth(47))} m`, signal: '#c9a2ff', via: [[31, -19, -30], [31, -27, -48], [25, -40, -58], [21, -44.4, -60], [20, -47.3, -62.6], [20, -49.9, -66], [20, -51.6, -70], [20, -52.2, -78.5], [4, -46, -80]],
    lines: 'Rae brings AI into sales work. WattMana helps households understand an electricity bill. Sage supports organization between appointments. Explore my contribution, the boundaries, and the thinking behind each. Press F to read it.' }
];
const FINALE = 'Three places, one thread: making complex systems useful to people. Keep exploring, open the Portfolio button for any section, or surface when you’re ready.';

const reduced = matchMedia('(prefers-reduced-motion: reduce)'), coarse = matchMedia('(pointer: coarse)');
const card = document.createElement('section'), fade = document.createElement('div');
card.className = 'tour-card holo holo--reading'; card.setAttribute('aria-label', 'Guided dive'); card.dataset.show = 'false'; card.inert = true;
card.innerHTML = '<header><span class="holo-label tour-kicker"></span><span class="holo-value tour-count"></span></header><h2 class="tour-title"></h2><p class="tour-lines" aria-live="polite"></p><p class="tour-pace"></p><div class="tour-progress" aria-hidden="true"><i></i></div>'
  + '<footer><button type="button" data-tour="pause">Pause <kbd>P</kbd></button><button type="button" data-tour="read">Read it <kbd>F</kbd></button><button type="button" data-tour="next">Next <kbd>N</kbd></button><button type="button" data-tour="rejoin">Rejoin the tour <kbd>G</kbd></button><button type="button" data-tour="surface">Surface</button><button type="button" data-tour="explore">Keep exploring</button><button type="button" data-tour="exit">Exit tour</button></footer>';
fade.className = 'tour-fade'; fade.setAttribute('aria-hidden', 'true');
document.body.append(fade, card);
const part = name => card.querySelector(name), bar = part('.tour-progress i');

// status: off · starting (waiting for the dive) · travel · dwell · free (visitor has the controls) · done
let status = 'off', index = 0, arrived = -1, legIndex = 0, legTime = 0, paused = false, inputs = 0;
let best = Infinity, stall = 0, waited = 0, cut = null, cutTime = 0, barShown = -1;
const leg = [], goal = [0, 0, 0], look = [0, 0, 0], from = new THREE.Vector3(), to = new THREE.Vector3(), here = new THREE.Vector3();
const controls = () => window.oceanControls;

function resolve(stop, target = goal, subject = look) {
  if (!stop.landmark) { target.splice(0, 3, ...stop.point); subject.splice(0, 3, ...stop.focus); return true; }
  const placed = controls()?.landmarks?.find(item => item.id === stop.landmark);
  if (placed && window.oceanDiagnostics?.modelLoading === false) { target.splice(0, 3, ...placed.interactionPosition); subject.splice(0, 3, ...placed.position); return true; }
  // Before the models settle, a viewpoint beside the charted position stands in.
  const [x, , z] = LANDMARKS.find(item => item.id === stop.landmark).position, floor = terrainHeightAt(x, z);
  target.splice(0, 3, x + 6, floor + 5, z); subject.splice(0, 3, x, floor + 1.5, z); return false;
}
function clear(a, b) {
  const world = controls()?.reef?.userData.collisions;
  return !world?.segmentClear || world.segmentClear(from.fromArray(a), to.fromArray(b), .85);
}
// Scripted waypoints when the way is open, a straight swim when it is not, a
// climb over the reef as the next choice, and null when only a cut will do.
function route(start, stop) {
  leg.length = 0;
  const scripted = stop.via || [];
  let open = arrived === index - 1, last = start;
  for (const point of scripted) { if (!open) break; open = clear(last, point); last = point; }
  if (open && clear(last, goal)) { leg.push(...scripted, goal); return true; }
  if (clear(start, goal)) { leg.push(goal); return true; }
  let crest = -Infinity;
  for (let i = 0; i <= 12; i++) crest = Math.max(crest, terrainHeightAt(start[0] + (goal[0] - start[0]) * i / 12, start[2] + (goal[2] - start[2]) * i / 12));
  const lane = Math.min(-5, Math.max(start[1], goal[1], crest + 14)), up = [start[0], lane, start[2]], over = [goal[0], lane, goal[2]];
  if (clear(start, up) && clear(up, over) && clear(over, goal)) { leg.push(up, over, goal); return true; }
  return false;
}
function paint() {
  const stop = STOPS[index], touring = status === 'travel' || status === 'dwell';
  document.body.dataset.tour = status; card.dataset.state = status; card.dataset.show = String(status !== 'off' && status !== 'starting');
  card.inert = card.dataset.show !== 'true'; card.style.setProperty('--signal', status === 'done' ? '#ff9d8a' : status === 'free' ? '#8ff4ff' : stop.signal);
  part('.tour-count').textContent = status === 'done' ? 'Complete' : `${index + 1} / ${STOPS.length}`;
  part('.tour-kicker').textContent = status === 'free' ? 'Guided dive · on hold' : status === 'done' ? 'Guided dive' : status === 'travel' ? `Next stop · ${stop.kicker}` : stop.kicker;
  part('.tour-title').textContent = status === 'free' ? 'You have the controls' : status === 'done' ? 'Back to you' : stop.title;
  part('.tour-lines').textContent = status === 'free' ? 'Swim wherever you like. Press G when you want me to lead again.' : status === 'done' ? FINALE : status === 'travel' ? (coarse.matches ? 'Swimming there now. Drag the water or touch the pad to take over.' : 'Swimming there now. Any movement key hands the dive to you.') : coarse.matches ? stop.lines.replace('Press F to read it.', 'Tap Read it to open it.') : stop.lines;
  const show = { pause: status === 'travel', read: status === 'dwell' && Boolean(stop.landmark), next: touring, rejoin: status === 'free', surface: status === 'done', explore: status === 'done', exit: touring || status === 'free' };
  for (const button of card.querySelectorAll('[data-tour]')) button.hidden = !show[button.dataset.tour];
  part('[data-tour="pause"]').firstChild.textContent = paused ? 'Resume ' : 'Pause ';
  part('[data-tour="pause"]').setAttribute('aria-pressed', String(paused));
  part('[data-tour="next"]').firstChild.textContent = status === 'travel' ? 'Skip travel ' : index === STOPS.length - 1 ? 'Finish route ' : 'Continue ';
  part('.tour-pace').textContent = status === 'dwell' ? 'Take your time. Continue when you’re ready.' : status === 'travel' ? (paused ? 'Travel paused. Resume when you’re ready.' : 'You can skip this swim or take the controls at any time.') : '';
  setQuiet(touring || status === 'starting');
  setBar(status === 'done' ? 1 : (index + (status === 'dwell' ? 1 : 0)) / STOPS.length);
  if (window.oceanDiagnostics) window.oceanDiagnostics.tour = { status, stop: index, key: stop.key, arrived, paused };
}
function setBar(value) { const rounded = Math.round(value * 250) / 250; if (rounded !== barShown) { barShown = rounded; bar.style.transform = `scaleX(${rounded})`; } }
function launch() {
  const api = controls(), final = legIndex === leg.length - 1;
  api.guide(true, true); api.travel(leg[legIndex], final ? look : null, SPEED);
  inputs = api.nav.inputs; best = Infinity; stall = 0; legTime = 0;
}
function arrive() {
  const stop = STOPS[index]; arrived = index; waited = 0; status = 'dwell'; inputs = controls().nav.inputs;
  if (stop.landmark) discover(stop.landmark, true);
  paint();
}
// A cut: fade the water over, move the diver, fade back. Reduced motion always travels this way.
function cutTo(then) { cut = then; cutTime = .24; fade.dataset.on = 'true'; }
function go(next) {
  index = next; resolve(STOPS[index]); status = 'travel'; paint();
  here.fromArray(window.oceanDiagnostics.playerPosition);
  if (reduced.matches || !route(here.toArray(), STOPS[index])) { cutTo(land); return; }
  legIndex = 0; launch();
}
function land() { const api = controls(); api.guide(true, true); api.place(goal, look); arrive(); }
function advance() { if (index >= STOPS.length - 1) { finish(); return; } go(index + 1); }
function finish() { status = 'done'; paused = false; controls()?.guide(false); paint(); }
function handOver() { status = 'free'; paused = false; paint(); }
function rejoin() {
  if (status !== 'free') return;
  if (arrived >= STOPS.length - 1) { finish(); return; }
  here.fromArray(window.oceanDiagnostics.playerPosition);
  let nearest = arrived + 1, distance = Infinity; const point = [0, 0, 0], subject = [0, 0, 0];
  for (let i = arrived + 1; i < STOPS.length; i++) { resolve(STOPS[i], point, subject); const d = here.distanceTo(to.fromArray(point)); if (d < distance) { distance = d; nearest = i; } }
  go(nearest);
}
function stop(message) {
  if (status === 'off') return;
  const api = controls(); status = 'off'; paused = false; cut = null; fade.dataset.on = 'false';
  if (api) { api.guide(false); if (api.getMode() === 'diver' && api.nav.travelling) api.travel(window.oceanDiagnostics.playerPosition); }
  paint();
  if (message) say('Guided dive', message, '#8ff4ff', 3200);
}
export function startTour() {
  const api = controls();
  if (!api || !window.oceanDiagnostics?.ready || status !== 'off') return false;
  if (api.getMode() === 'surface' && !api.startDive({ capture: false })) return false;
  status = 'starting'; index = 0; arrived = -1; waited = 0; paused = false; paint();
  return true;
}
export const tourStatus = () => status;
// Travel estimate only. Reading at each landmark has no countdown or automatic
// advance: the visitor chooses Continue after reading as much as they want.
export const DIVE_IN = 6.5;
export function tourPlan() {
  let distance = 0, seconds = DIVE_IN; const point = [0, 0, 0], subject = [0, 0, 0]; let last = [0, -8, 0];
  for (const item of STOPS) {
    resolve(item, point, subject);
    for (const next of [...(item.via || []), point]) { distance += from.fromArray(last).distanceTo(to.fromArray(next)); last = [...next]; }
    seconds += 1.4;
  }
  return { stops: STOPS.length, distance: distance + 8, seconds: seconds + distance / SPEED };
}

function update(dt, api, state, diving) {
  if (status === 'off') return;
  const mode = api.getMode();
  if (status === 'starting') {
    waited += dt;
    if (diving) { status = 'free'; arrived = -1; rejoin(); }
    else if (mode === 'surface' && waited > 8) stop();
    return;
  }
  // Surfacing, by Space or the button, ends the tour without ceremony.
  if (!diving) { if (mode !== 'diver') stop(); return; }
  // Reading the archive or changing settings holds the tour where it is.
  if (api.nav.suspended) return;
  if (cut) { cutTime -= dt; if (cutTime <= 0) { const then = cut; cut = null; then(); fade.dataset.on = 'false'; } return; }
  if (status !== 'travel' && status !== 'dwell') return;
  const nav = api.nav;
  if (nav.inputs !== inputs) { handOver(); return; }
  if (status === 'dwell') return;
  // Pause the route itself, rather than only its caption countdown.
  if (paused) return;
  legTime += dt;
  const target = leg[legIndex], final = legIndex === leg.length - 1;
  const distance = here.fromArray(state.playerPosition).distanceTo(to.fromArray(target));
  if (!final && distance < VIA_RADIUS) { legIndex++; launch(); return; }
  if (final && distance < ARRIVE_RADIUS && (!nav.travelling || distance < .6)) { arrive(); return; }
  if (distance < best - .25) { best = distance; stall = 0; } else stall += dt;
  // Coral in the way that the autopilot cannot slide past: cut to the stop.
  if (legTime > .4 && (stall > 3.5 || !nav.travelling)) cutTo(land);
}
onFrame(update);

card.addEventListener('click', event => {
  const action = event.target.closest('[data-tour]')?.dataset.tour;
  if (action === 'pause') togglePause();
  else if (action === 'next') next();
  else if (action === 'read') read();
  else if (action === 'rejoin') rejoin();
  else if (action === 'surface') { stop(); controls()?.surface(); }
  else if (action === 'explore') stop('The reef is yours. The lights still mark the three sites.');
  else if (action === 'exit') stop('Tour ended. The reef is yours.');
  if (action && action !== 'read') document.querySelector('#world')?.focus({ preventScroll: true });
});
// The card can cover the scene's own prompt on a small screen, so it offers the same action.
function read() {
  const prompt = document.querySelector('#interact-prompt'), id = STOPS[index].landmark;
  if (prompt && !prompt.hidden) prompt.click(); else window.oceanArchive?.open?.(id);
}
function next() {
  if (cut) return;
  if (status === 'dwell') { paused = false; advance(); }
  else if (status === 'travel') cutTo(land);
}
function togglePause() {
  if (status !== 'travel') return;
  paused = !paused;
  if (paused && !cut) controls()?.travel(window.oceanDiagnostics.playerPosition, look);
  if (!paused && !cut) launch();
  paint();
}
addEventListener('keydown', event => {
  if (status === 'off' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
  if (event.code === 'KeyG' && status === 'free') { event.preventDefault(); rejoin(); }
  else if (event.code === 'KeyN' && (status === 'travel' || status === 'dwell')) { event.preventDefault(); next(); }
  else if (event.code === 'KeyP' && status === 'travel') { event.preventDefault(); togglePause(); }
});
window.oceanTour = { start: startTour, stop, rejoin, next, plan: tourPlan, get status() { return status; }, STOPS };
