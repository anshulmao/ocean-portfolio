import * as THREE from './vendor/three.module.min.js';
import { LANDMARKS, terrainHeightAt } from './reef.js';
import { onFrame, setQuiet, discover, say } from './journey.js';
import { planGuidedRoute } from './guided-route.js';

import { STOPS, SPEED, SCENIC_SECONDS } from './guided-itinerary.js';
import { createWildlifeGuide } from './guided-wildlife.js';
export { STOPS };
const ARRIVE_RADIUS = 1.6;
const FINALE = 'This is my reef, and my portfolio. Explore at your own pace, or surface. On the way up, you can choose a safety stop or continue straight to the surface.';
const FINALE_SHORT = FINALE;

const motionMedia = matchMedia('(prefers-reduced-motion: reduce)'), coarse = matchMedia('(pointer: coarse)');
// The phone layout of the layout contract (tokens.css): there the card is a bottom sheet and the copy is the short one.
const compact = matchMedia('(max-width:599px),(pointer:coarse) and (max-height:499px)');
// Kept here rather than imported from journey.js, which the unit tests replace with a stub.
const touch = () => document.documentElement.dataset.input === 'touch' || (!document.documentElement.dataset.input && coarse.matches);
// The in-app motion choice is the effective preference, including a full-motion
// override on a device whose operating system asks for reduced motion.
const reduced = () => window.oceanDiagnostics?.reducedMotion ?? motionMedia.matches;
const card = document.createElement('section'), fade = document.createElement('div');
// The card is a sheet (release/MOBILE_OVERHAUL.md): collapsed it is one row, the stop, the count and one action, so
// the water stays clear while the tour swims; expanded it carries the stop's headline, its caption and every action.
// Guidance stays visible while swimming; the row can fold it away until the next stage.
card.className = 'tour-card holo holo--reading'; card.setAttribute('aria-label', 'Guided dive'); card.dataset.show = 'false'; card.dataset.sheet = 'collapsed'; card.inert = true;
card.innerHTML = '<div class="tour-progress" aria-hidden="true"><i></i></div>'
  + '<button type="button" class="tour-head" data-tour="toggle" aria-expanded="false"><span class="holo-label tour-kicker"></span><span class="holo-value tour-count"></span><i class="tour-chevron" aria-hidden="true"></i></button>'
  + '<h2 class="tour-title"></h2><div class="tour-body"><p class="tour-lines" aria-live="polite"></p><button type="button" class="tour-more" data-tour="more" aria-expanded="false"><span>More</span></button></div><p class="tour-pace"></p>'
  + '<footer><button type="button" data-tour="pause">Pause <kbd>P</kbd></button><button type="button" data-tour="read">Read it <kbd>F</kbd></button><button type="button" data-tour="next">Next <kbd>N</kbd></button><button type="button" data-tour="rejoin">Rejoin <kbd>G</kbd></button><button type="button" data-tour="surface">Surface</button><button type="button" data-tour="explore">Keep exploring</button><button type="button" data-tour="exit">Exit tour</button></footer>';
fade.className = 'tour-fade'; fade.setAttribute('aria-hidden', 'true');
document.body.append(fade, card);
const part = name => card.querySelector(name), bar = part('.tour-progress i');
// open: the visitor's own choice for this stop (null follows the tour); more: the full caption on a phone.
let open = null, more = false, shownFor = '';

// status: off · entering (surface framing) · starting (descent) · travel · dwell · free · done
let status = 'off', index = 0, arrived = -1, legTime = 0, swimSeconds = 0, paused = false, inputs = 0;
let best = Infinity, stall = 0, waited = 0, cut = null, cutTime = 0, barShown = -1;
let detours = 0, routeIssue = false;
const leg = [], goal = [0, 0, 0], look = [0, 0, 0], from = new THREE.Vector3(), to = new THREE.Vector3(), here = new THREE.Vector3();
const controls = () => window.oceanControls;
const wildlife = createWildlifeGuide(document, new THREE.Vector3());
const archiveContinue = document.createElement('button');
archiveContinue.type = 'button'; archiveContinue.className = 'tour-archive-continue holo-chip'; archiveContinue.hidden = true;
archiveContinue.textContent = 'Continue guided dive · N';
document.querySelector('#landmark-dialog .arc-footer')?.append(archiveContinue);
archiveContinue.addEventListener('click', () => { window.oceanArchive?.close(); next(); });

function resolve(stop, target = goal, subject = look) {
  if (!stop.landmark) { target.splice(0, 3, ...stop.point); subject.splice(0, 3, ...stop.focus); return true; }
  const placed = controls()?.landmarks?.find(item => item.id === stop.landmark);
  if (placed && (window.oceanDiagnostics?.landmarksReady || window.oceanDiagnostics?.landmarksSettled)) { target.splice(0, 3, ...placed.interactionPosition); subject.splice(0, 3, ...placed.position); return true; }
  // Before the models settle, a viewpoint beside the charted position stands in.
  const [x, , z] = LANDMARKS.find(item => item.id === stop.landmark).position, floor = terrainHeightAt(x, z);
  target.splice(0, 3, x + 6, floor + 5, z); subject.splice(0, 3, x, floor + 1.5, z); return false;
}
function clear(a, b) {
  if (controls()?.settings?.collisionEnabled === false) return true;
  const world = controls()?.reef?.userData.collisions;
  const radius = Math.max(.85, (controls()?.settings?.collisionRadius ?? .55) + .25);
  return !world?.segmentClear || world.segmentClear(from.fromArray(a), to.fromArray(b), radius);
}
function route(start, stop, scenic = true) {
  const via = Array.isArray(scenic) ? scenic : scenic && arrived === index - 1 ? stop.via : [];
  leg.length = 0;
  leg.push(...planGuidedRoute(start, goal, { via, floor: terrainHeightAt, clear,
    clearance: Math.max(1.5, controls()?.settings?.floorClearance ?? 1.5) }));
  return leg.length > 0;
}
function paint() {
  const stop = STOPS[index], touring = status === 'travel' || status === 'dwell', shown = !['off', 'entering', 'starting'].includes(status);
  // A new stop, or a change of state, starts from the tour's own choice again.
  if (`${status}:${index}` !== shownFor) { shownFor = `${status}:${index}`; open = null; more = false; }
  // Keep progressive instructions visible; folding the guide is the visitor's choice.
  const wide = open ?? (status === 'dwell' || status === 'done' || status === 'travel' || routeIssue), small = compact.matches, fingers = touch();
  document.body.dataset.tour = status; card.dataset.state = status; card.dataset.show = String(shown);
  archiveContinue.hidden = status !== 'dwell' || !stop.landmark;
  archiveContinue.textContent = fingers ? 'Continue guided dive' : 'Continue guided dive · N';
  card.dataset.sheet = wide ? 'expanded' : 'collapsed';
  // The rest of the interface reads the sheet from the body: world labels and announcements keep out of its way.
  if (shown) document.body.dataset.sheet = card.dataset.sheet; else delete document.body.dataset.sheet;
  card.inert = !shown; card.style.setProperty('--signal', status === 'done' ? '#ff9d8a' : status === 'free' ? '#8ff4ff' : stop.signal);
  part('.tour-count').textContent = status === 'done' ? 'Done' : `${index + 1}/${STOPS.length}`;
  part('.tour-kicker').textContent = status === 'free' ? 'Guided dive · on hold' : status === 'done' ? 'Guided dive · complete' : status === 'travel' ? `Next · ${stop.place}` : stop.kicker;
  const head = part('.tour-head');
  head.setAttribute('aria-expanded', String(wide));
  head.setAttribute('aria-label', `${part('.tour-kicker').textContent}. ${status === 'done' ? 'Tour complete' : `Stop ${index + 1} of ${STOPS.length}`}. ${wide ? 'Fold the guide away' : 'Show the guide'}`);
  part('.tour-title').textContent = status === 'free' ? 'You have the controls' : status === 'done' ? 'Back to you' : stop.title;
  // The caption. On a phone the short one, with More for the full text; the hint follows the input in hand.
  const full = status === 'free' ? `Swim wherever you like. ${fingers ? 'Tap Rejoin' : 'Press G'} when you want me to lead again.`
    : status === 'done' ? FINALE
    : status === 'travel' ? (routeIssue ? 'The route is blocked. Resume to try again, skip this swim, or explore freely.' : fingers ? (stop.touchLines || stop.lines) : stop.lines)
    : fingers ? (stop.touchLines || stop.short) : stop.lines;
  const brief = fingers ? full : status === 'done' ? FINALE_SHORT : status === 'dwell' ? stop.short : full;
  part('.tour-lines').textContent = small && !more ? brief : full;
  const moreButton = part('.tour-more');
  moreButton.hidden = !(small && wide && (brief !== full || full.length > 95));
  moreButton.setAttribute('aria-expanded', String(more));
  moreButton.firstChild.textContent = more ? 'Less' : 'More';
  card.dataset.more = String(small && more);
  // Folded, the row offers one action: the one the moment calls for.
  const primary = status === 'travel' ? 'pause' : status === 'dwell' ? 'next' : status === 'free' ? 'rejoin' : 'explore';
  const show = { pause: status === 'travel' || (status === 'dwell' && stop.scenic), read: status === 'dwell' && Boolean(stop.landmark), next: touring, rejoin: status === 'free', surface: status === 'done', explore: status === 'done', exit: touring || status === 'free' };
  for (const button of card.querySelectorAll('footer [data-tour]')) { const action = button.dataset.tour; button.hidden = wide ? !show[action] : action !== primary; }
  part('[data-tour="pause"]').firstChild.textContent = paused ? 'Resume ' : 'Pause ';
  part('[data-tour="pause"]').setAttribute('aria-pressed', String(paused));
  part('[data-tour="next"]').firstChild.textContent = status === 'travel' ? (wide ? 'Skip travel ' : 'Skip ') : index === STOPS.length - 1 ? 'Finish route ' : 'Continue ';
  part('.tour-pace').textContent = status === 'dwell' ? `${stop.landmark ? (fingers ? 'Tap Read it to open the log. ' : 'Press F to read it. ') : ''}${stop.scenic ? (paused ? 'Paused. Resume when you’re ready.' : 'A moment to look. We’ll continue shortly; Pause to stay.') : 'Take your time. Continue when you’re ready.'}` : status === 'travel' ? (routeIssue ? '' : paused ? 'Travel paused. Resume when you’re ready.' : 'Look freely. P pauses; N skips this swim. Movement keys take over; G rejoins.') : '';
  setQuiet(touring || status === 'starting' || status === 'entering');
  setBar(status === 'done' ? 1 : (index + (status === 'dwell' ? 1 : 0)) / STOPS.length);
  if (window.oceanDiagnostics) window.oceanDiagnostics.tour = { status, stop: index, key: stop.key, arrived, paused, routeIssue, detours, goal: [...goal], swimSeconds };
}
function setBar(value) { const rounded = Math.round(value * 250) / 250; if (rounded !== barShown) { barShown = rounded; bar.style.transform = `scaleX(${rounded})`; } }
function launch() {
  const api = controls();
  api.guide(true, true);
  inputs = api.nav.inputs; best = Infinity; stall = 0; legTime = 0;
  if (!api.travelPath(leg, look, SPEED)) blockRoute();
}
function blockRoute() {
  controls()?.cancelTravel(); paused = routeIssue = true; paint();
}
function arrive() {
  const stop = STOPS[index]; arrived = index; waited = 0; status = 'dwell'; inputs = controls().nav.inputs;
  if (stop.landmark) discover(stop.landmark, true);
  paint();
  if (stop.key === 'overview') finish();
  else if (stop.key === 'about') window.oceanArchive?.open?.('glance');
}
// A cut: fade the water over, move the diver, fade back. Reduced motion always travels this way.
function cutTo(then) { controls()?.cancelTravel(); cut = then; cutTime = .24; fade.dataset.on = 'true'; }
function go(next) {
  index = next; resolve(STOPS[index]); status = 'travel'; paused = routeIssue = false; detours = 0;
  inputs = controls().nav.inputs; paint();
  here.fromArray(window.oceanDiagnostics.playerPosition);
  if (reduced()) { cutTo(land); return; }
  if (!route(here.toArray(), STOPS[index])) { blockRoute(); return; }
  launch();
}
function land() { const api = controls(); api.guide(true, true); api.place(goal, look); arrive(); }
function advance() { if (index >= STOPS.length - 1) { finish(); return; } go(index + 1); }
function finish() { status = 'done'; paused = false; controls()?.cancelTravel(); controls()?.guide(false); paint(); }
function handOver() { status = 'free'; paused = false; cut = null; fade.dataset.on = 'false'; controls()?.guide(false); paint(); }
function rejoin() {
  if (status !== 'free') return;
  if (arrived >= STOPS.length - 1) { finish(); return; }
  // Rejoin the interrupted leg; looking around or taking a detour never skips sites.
  go(index);
}
function stop(message) {
  if (status === 'off') return;
  const api = controls(); status = 'off'; paused = false; cut = null; fade.dataset.on = 'false';
  if (api) { api.guide(false); api.cancelTravel(); }
  wildlife.reset();
  paint();
  if (message) say('Guided dive', message, '#8ff4ff', 3200);
}
export function startTour() {
  const api = controls();
  if (!api || !window.oceanDiagnostics?.ready || status !== 'off' || api.getMode() === 'transition') return false;
  wildlife.reset();
  status = api.getMode() === 'surface' ? 'entering' : 'starting'; index = 0; arrived = -1; waited = swimSeconds = 0; paused = false; paint();
  return true;
}
export const tourStatus = () => status;
// Travel estimate only. Reading at each landmark has no countdown or automatic
// advance: the visitor chooses Continue after reading as much as they want.
export const DIVE_IN = 7.5;
export function tourPlan() {
  let distance = 0, seconds = DIVE_IN; const point = [0, 0, 0], subject = [0, 0, 0]; let last = [0, -8, 0];
  for (const item of STOPS) {
    resolve(item, point, subject);
    for (const next of [...(item.via || []), point]) { distance += from.fromArray(last).distanceTo(to.fromArray(next)); last = [...next]; }
    seconds += item.scenic ? SCENIC_SECONDS + 1.4 : 1.4;
  }
  return { stops: STOPS.filter(stop => stop.landmark).length, stages: STOPS.length, distance: distance + 8, seconds: seconds + distance / SPEED };
}

function update(dt, api, state, diving) {
  wildlife.update(dt, api, diving && !api.nav.suspended && ['travel', 'dwell'].includes(status));
  if (status === 'off') return;
  const mode = api.getMode();
  if (status === 'entering') {
    if (api.nav.suspended) return;
    waited += dt;
    if (waited >= 1) {
      if (!api.startDive({ capture: false, guided: true })) { stop(); return; }
      status = 'starting'; waited = 0; paint();
    }
    return;
  }
  if (status === 'starting') {
    waited += dt;
    // Navigation started during the entry animation is overwritten by startDive.
    // Landmarks also move while models load: wait for their final viewpoints.
    if (diving && !api.getTransition() && (state.landmarksReady || state.landmarksSettled)) go(0);
    else if (mode === 'surface' && waited > 8) stop();
    return;
  }
  // Surfacing, by Space or the button, ends the tour without ceremony.
  if (!diving) { if (mode !== 'diver') stop(); return; }
  // Reading the archive or changing settings holds the tour where it is.
  if (api.nav.suspended) return;
  if (status !== 'travel' && status !== 'dwell') return;
  const nav = api.nav;
  if (nav.inputs !== inputs) { handOver(); return; }
  if (cut) { if (!paused) cutTime -= dt; if (cutTime <= 0) { const then = cut; cut = null; then(); fade.dataset.on = 'false'; } return; }
  if (status === 'dwell') {
    if (STOPS[index].scenic && !paused) { waited += dt; if (waited >= SCENIC_SECONDS) advance(); }
    return;
  }
  // Pause the route itself, rather than only its caption countdown.
  if (paused) return;
  legTime += dt;
  swimSeconds += dt;
  const distance = here.fromArray(state.playerPosition).distanceTo(to.fromArray(goal));
  if (distance < ARRIVE_RADIUS && (!nav.travelling || distance < .6)) { arrive(); return; }
  // A scenic route can initially swim away from its destination. Its remaining
  // path length, rather than straight-line distance, measures forward progress.
  const remaining = Number.isFinite(nav.travelRemaining) ? nav.travelRemaining : distance;
  if (remaining < best - .25) { best = remaining; stall = 0; } else stall += dt;
  if (legTime > 1 && (stall > 5 || !nav.travelling || nav.travelBlocked)) {
    if (detours++ < 2 && route(here.toArray(), STOPS[index], false)) { launch(); paint(); }
    else blockRoute();
  }
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
  else if (action === 'toggle') { open = card.dataset.sheet !== 'expanded'; more = false; paint(); }
  else if (action === 'more') { more = !more; paint(); }
  // The sheet's own toggles keep the focus where it is, for a keyboard; the actions hand it back to the scene.
  if (action && !['read', 'toggle', 'more'].includes(action)) document.querySelector('#world')?.focus({ preventScroll: true });
});
// A phone turned on its side, or a window narrowed past the phone width, changes the copy the sheet carries.
compact.addEventListener?.('change', () => { if (status !== 'off') paint(); });
// On a phone the sheet stands in for the scene's own prompt, so it offers the same action.
function read() {
  const prompt = document.querySelector('#interact-prompt'), id = STOPS[index].landmark;
  if (prompt && !prompt.hidden) prompt.click(); else window.oceanArchive?.open?.(id);
}
function next() {
  if (cut) return;
  if (status === 'dwell') { paused = false; advance(); }
  else if (status === 'travel') { paused = false; cutTo(land); }
}
function togglePause() {
  if (status === 'dwell' && STOPS[index].scenic) { paused = !paused; paint(); return; }
  if (status !== 'travel') return;
  paused = !paused;
  if (paused && !cut) controls()?.cancelTravel();
  if (!paused && !cut) {
    routeIssue = false; detours = 0; here.fromArray(window.oceanDiagnostics.playerPosition);
    let nearest = 0, distance = Infinity;
    for (let i = 0; i < leg.length; i++) { const d = here.distanceToSquared(to.fromArray(leg[i])); if (d < distance) { nearest = i; distance = d; } }
    const remaining = leg.slice(nearest);
    if (!route(here.toArray(), STOPS[index], remaining)) { blockRoute(); return; }
    launch();
  }
  paint();
}
addEventListener('keydown', event => {
  if (status === 'off' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
  if (document.querySelector('dialog[open]')) {
    if (event.code === 'KeyN' && status === 'dwell' && window.oceanArchive?.isOpen) { event.preventDefault(); window.oceanArchive.close(); next(); }
    return;
  }
  if (event.code === 'KeyG' && status === 'free') { event.preventDefault(); rejoin(); }
  else if (event.code === 'KeyN' && (status === 'travel' || status === 'dwell')) { event.preventDefault(); next(); }
  else if (event.code === 'KeyP' && (status === 'travel' || status === 'dwell')) { event.preventDefault(); togglePause(); }
});
window.oceanTour = { start: startTour, stop, rejoin, next, plan: tourPlan, get status() { return status; }, get entryFraming() { return status === 'entering' ? THREE.MathUtils.smoothstep(waited, .2, 1) : status === 'starting' ? 1 : 0; }, STOPS };
