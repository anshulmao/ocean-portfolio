import * as THREE from './vendor/three.module.min.js';
import { LANDMARKS, terrainHeightAt } from './reef.js';
import { onFrame, setQuiet, discover, say, splash } from './journey.js';
import { planGuidedRoute } from './guided-route.js';
import { STEPS, SPEED, BEAT, WELCOME, holdOf } from './guided-script.js';
import { pointAt } from './look-indicator.js';
import { track } from './analytics.js';

// The guided dive runs the steps in guided-script.js. Each leg is a scripted route, not a camera path: it hands
// waypoints to the same autopilot the atlas uses, so the diver still collides and still routes over terrain. The
// visitor keeps the view (free look: the mouse, a drag, the arrow keys and a look stick only look), and any input
// that swims takes the controls straight back.
export { STEPS, holdOf };
// The portfolio sites among the steps: the tour's three stories.
export const STOPS = STEPS.filter(step => step.kind === 'stop');
// Analytics (only with consent; analytics-privacy.js declares what is kept): which step, by its key and number.
const note = (event, extra = {}) => track(event, { step: STEPS[index].key, index, ...extra });
const ARRIVE_RADIUS = 1.6, PAN_BEAT = 3, INTRO_BEAT = 4.5, HOLD_SIGNAL = '#8ff4ff';
// The opening from the surface (SPEC step 0): a held beat while the surface copy fades, the camera eases in on the diver
// (world.js frameDiver), and the dive starts in first person. Underwater, the title card shows before the welcome sheet.
// REVEAL outlasts the title card (announce.js holds a short one about 2.5 s, then fades), so the two never overlap.
const PRELUDE_HOLD = 1, PRELUDE_DIVE = 2.4, REVEAL = 3.2;
// The controls the tour teaches (SPEC: teaching schedule). The welcome lists PRIMER and ticks each one the visitor tries;
// a later beat names its `teach` control once, and not at all if it has been tried. Use is read from what changed (the
// lamp, the view, the scooter, the computer, a photo, the records), so a key, a touch button and a gamepad all count.
// Each tip is [keyboard, touch].
const CONTROLS = {
  computer: { key: 'C', name: 'Dive computer', touch: 'Computer',
    tip: ['Press C to check your depth on your dive computer.', 'Tap Dive computer to check your depth.'] },
  interact: { key: 'F', name: 'Open a site', touch: 'Read it' },
  scooter: { key: 'E', name: 'Scooter (hold)', touch: 'Scooter (hold)',
    tip: ['Hold E for the scooter: the guide speeds up too.', 'Hold the scooter button: the guide speeds up too.'] },
  lamp: { key: 'Q', name: 'Flashlight', touch: 'Lamp',
    tip: ['It’s darker by the wreck. Press Q for your lamp.', 'It’s darker by the wreck. Tap the lamp button.'] },
  view: { key: 'V', name: 'First / third person', touch: 'View',
    tip: ['Press V to see yourself against the reef.', 'Tap the view button to see yourself against the reef.'] },
  photo: { key: 'H', name: 'Photo', touch: 'Photo',
    tip: ['Press H to take a photo.', 'Tap Photo to take a picture.'] },
};
const PRIMER = ['computer', 'interact', 'scooter', 'lamp', 'view'];
// Visitors worth turning for while the tour leads, and how near one must be to be pointed out (m).
const NOTED = { 'whale-shark': ['Whale shark', 90], whale: ['A whale', 110], orcas: ['Orcas', 90], dolphins: ['Dolphins', 50], blacktips: ['Reef sharks', 40] };
const SEEN_AFTER = 2.4;
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
// It opens itself at a stop and folds away for the swim; the row toggles it, and that choice holds until the next stop.
card.className = 'tour-card holo holo--reading'; card.setAttribute('aria-label', 'Guided dive'); card.dataset.show = 'false'; card.dataset.sheet = 'collapsed'; card.inert = true;
card.innerHTML = '<div class="tour-progress" aria-hidden="true"><i></i></div>'
  + '<button type="button" class="tour-head" data-tour="toggle" aria-expanded="false"><span class="holo-label tour-kicker"></span><span class="holo-value tour-count"></span><i class="tour-chevron" aria-hidden="true"></i></button>'
  + '<h2 class="tour-title"></h2><div class="tour-body"><p class="tour-lines" aria-live="polite"></p><button type="button" class="tour-more" data-tour="more" aria-expanded="false"><span>More</span></button><ul class="tour-keys" aria-label="Controls to try" hidden></ul><p class="tour-teach" hidden></p></div><p class="tour-pace"></p>'
  + '<footer><button type="button" data-tour="pause">Pause <kbd>P</kbd></button><button type="button" data-tour="read">Read it <kbd>F</kbd></button><button type="button" data-tour="next">Next <kbd>N</kbd></button><button type="button" data-tour="rejoin">Rejoin <kbd>G</kbd></button><button type="button" data-tour="surface">Surface</button><button type="button" data-tour="explore">Keep exploring</button><button type="button" data-tour="exit">Exit tour</button></footer>';
fade.className = 'tour-fade'; fade.setAttribute('aria-hidden', 'true');
document.body.append(fade, card);
const part = name => card.querySelector(name), bar = part('.tour-progress i');
// open: the visitor's own choice for this step (null follows the tour); more: the full caption on a phone.
let open = null, more = false, shownFor = '';

// status: off · starting (waiting for the dive) · intro (the welcome) · travel · look (a scenic beat that moves on by
// itself) · dwell (a portfolio site; waits for Continue) · free (visitor has the controls) · done (the overview)
let status = 'off', index = 0, arrived = -1, legTime = 0, paused = false, inputs = 0;
let best = Infinity, stall = 0, waited = 0, cut = null, cutTime = 0, barShown = -1;
let detours = 0, routeIssue = false, panIndex = 0, panTime = 0, stepTime = 0, prelude = -1, reveal = 0, keysShown = '', called = true;
// used: the controls tried on this tour. seen: what they last read, to notice a change.
const used = new Set(); let seen = null;
// pointed: visitors already seen on their current pass. marked: the one the marker is on, and how long it has been in view.
const pointed = new Set(); let marked = null, markedFor = 0;
const leg = [], goal = [0, 0, 0], look = [0, 0, 0], pans = [], from = new THREE.Vector3(), to = new THREE.Vector3(), here = new THREE.Vector3();
const controls = () => window.oceanControls;
const touring = () => status === 'intro' || status === 'travel' || status === 'look' || status === 'dwell';

function landmarkOf(step) {
  const placed = controls()?.landmarks?.find(item => item.id === step.landmark);
  return placed && (window.oceanDiagnostics?.landmarksReady || window.oceanDiagnostics?.landmarksSettled) ? placed : null;
}
// An animal that lies still is framed from where it actually settled: the open spot a few metres from it, with a
// clear line of sight, nearest to where the tour comes from. Far enough to take in the whole animal: the nurse shark's
// model is about 7.5 m long in the scene, so it is framed from about 11 m out and 5 m above. Worked out once a tour; null until the creatures load.
const framed = new Map();
function frame(step) {
  if (framed.has(step.resident)) return framed.get(step.resident);
  const at = controls()?.residentAt?.(step.resident); if (!at) return null;
  const before = [0, 0, 0], eye = [at[0], at[1] + 1.2, at[2]], prior = STEPS[STEPS.indexOf(step) - 1];
  if (prior) resolve(prior, before, [0, 0, 0]);
  // The closest ring that has a clear spot wins, and a spot never crowds a landmark's model.
  const models = (controls()?.landmarks ?? LANDMARKS).map(item => item.position);
  let best = null, nearest = Infinity;
  for (const radius of [11, 9.5, 12.5]) {
    for (let k = 0; k < 16; k++) {
      const angle = k / 16 * Math.PI * 2, x = at[0] + Math.cos(angle) * radius, z = at[2] + Math.sin(angle) * radius;
      const point = [x, Math.max(terrainHeightAt(x, z) + 3, at[1] + 5), z], d = from.fromArray(point).distanceTo(to.fromArray(before));
      if (d < nearest && !models.some(model => Math.hypot(model[0] - x, model[2] - z) < 6) && clear(point, eye)) { nearest = d; best = point; }
    }
    if (best) break;
  }
  const result = best && { point: best, subject: at };
  framed.set(step.resident, result); return result;
}
// Where a step swims to, and the subject it turns to on arrival.
function resolve(step, target = goal, subject = look) {
  const resident = step.resident && frame(step);
  if (resident) { target.splice(0, 3, ...resident.point); subject.splice(0, 3, ...resident.subject); return true; }
  if (!step.landmark) { target.splice(0, 3, ...step.at); subject.splice(0, 3, ...(Array.isArray(step.pan?.[0]) ? step.pan[0] : step.at)); return true; }
  const placed = landmarkOf(step);
  if (placed) { target.splice(0, 3, ...placed.interactionPosition); subject.splice(0, 3, ...placed.position); return true; }
  // Before the models settle, a viewpoint beside the charted position stands in.
  const [x, , z] = LANDMARKS.find(item => item.id === step.landmark).position, floor = terrainHeightAt(x, z);
  target.splice(0, 3, x + 6, floor + 5, z); subject.splice(0, 3, x, floor + 1.5, z); return false;
}
function clear(a, b) {
  if (controls()?.settings?.collisionEnabled === false) return true;
  const world = controls()?.reef?.userData.collisions;
  const radius = Math.max(.85, (controls()?.settings?.collisionRadius ?? .55) + .25);
  return !world?.segmentClear || world.segmentClear(from.fromArray(a), to.fromArray(b), radius);
}
function route(start, step, scenic = true) {
  leg.length = 0;
  leg.push(...planGuidedRoute(start, goal, { via: scenic && arrived === index - 1 ? step.via : [], floor: terrainHeightAt, clear,
    clearance: Math.max(1.5, controls()?.settings?.floorClearance ?? 1.5) }));
  return leg.length > 0;
}
function paint() {
  const step = STEPS[index], shown = status !== 'off' && status !== 'starting' && reveal <= 0, reading = status === 'intro' || status === 'look' || status === 'dwell' || status === 'done';
  // A new step, or a change of state, starts from the tour's own choice again.
  if (`${status}:${index}` !== shownFor) { shownFor = `${status}:${index}`; open = null; more = false; }
  // Open where there is something to read or decide; folded while the tour swims or waits on hold.
  const wide = open ?? (reading || routeIssue), small = compact.matches, fingers = touch();
  document.body.dataset.tour = status; card.dataset.state = status; card.dataset.show = String(shown);
  card.dataset.sheet = wide ? 'expanded' : 'collapsed';
  // The rest of the interface reads the sheet from the body: world labels and announcements keep out of its way.
  if (shown) document.body.dataset.sheet = card.dataset.sheet; else delete document.body.dataset.sheet;
  card.inert = !shown; card.style.setProperty('--signal', status === 'free' ? HOLD_SIGNAL : step.signal ?? HOLD_SIGNAL);
  part('.tour-count').textContent = `${index + 1}/${STEPS.length}`;
  part('.tour-kicker').textContent = status === 'free' ? 'Guided dive · on hold' : status === 'travel' ? `Next · ${step.place}` : step.place;
  const head = part('.tour-head');
  head.setAttribute('aria-expanded', String(wide));
  head.setAttribute('aria-label', `${part('.tour-kicker').textContent}. Step ${index + 1} of ${STEPS.length}. ${wide ? 'Fold the guide away' : 'Show the guide'}`);
  part('.tour-title').textContent = status === 'free' ? 'You have the controls' : step.title;
  // The caption. On a phone the short one, with More for the full text; the hint follows the input in hand.
  const full = status === 'free' ? `Swim wherever you like. ${fingers ? 'Tap Rejoin' : 'Press G'} when you want me to lead again.`
    : status === 'travel' ? (routeIssue ? 'The route is blocked. Resume to try again, skip this swim, or explore freely.' : fingers ? 'Swimming there now. Drag the water to look around, or touch the pad to take over.' : 'Swimming there now. Look around freely; any movement key hands the dive to you.')
    : step.line;
  const brief = reading ? step.short ?? full : full;
  part('.tour-lines').textContent = small && !more ? brief : full;
  const moreButton = part('.tour-more');
  moreButton.hidden = !(small && wide && brief !== full);
  moreButton.setAttribute('aria-expanded', String(more));
  // On a phone the welcome's controls are behind this button, so there it says what it opens.
  moreButton.firstChild.textContent = more ? 'Less' : status === 'intro' ? 'Controls' : 'More';
  card.dataset.more = String(small && more);
  const tip = paintControls(step, fingers);
  // Folded, the row offers one action: the one the moment calls for.
  const primary = status === 'dwell' ? (step.landmark ? 'read' : 'next') : status === 'free' ? 'rejoin' : status === 'done' ? 'explore' : 'next';
  const show = { pause: status === 'travel' || status === 'look', read: status === 'dwell' && Boolean(step.landmark), next: touring(), rejoin: status === 'free', surface: status === 'done', explore: status === 'done', exit: touring() || status === 'free' };
  for (const button of card.querySelectorAll('footer [data-tour]')) { const action = button.dataset.tour; button.hidden = wide ? !show[action] : action !== primary; }
  part('[data-tour="pause"]').firstChild.textContent = paused ? 'Resume ' : 'Pause ';
  part('[data-tour="pause"]').setAttribute('aria-pressed', String(paused));
  part('[data-tour="next"]').firstChild.textContent = status === 'travel' ? (wide ? 'Skip travel ' : 'Skip ') : status === 'intro' ? 'Start ' : 'Continue ';
  part('.tour-pace').textContent = status === 'intro' ? (fingers ? 'Try them as we go, and tap Start when you’re ready.' : 'Try them now if you like, and press N when you’re ready.')
    : status === 'dwell' ? `${step.landmark ? (fingers ? 'Tap Read it to open it. ' : 'Press F to open it. ') : ''}Take your time. Continue when you’re ready.`
    : status === 'look' ? (paused ? 'Paused here. Resume when you’re ready.' : '')
    : status === 'travel' ? (routeIssue ? '' : paused ? 'Travel paused. Resume when you’re ready.' : 'You can skip this swim or take the controls at any time.') : '';
  setQuiet(touring() || status === 'starting');
  setBar(status === 'done' ? 1 : (index + (arrived === index ? 1 : 0)) / STEPS.length);
  if (window.oceanDiagnostics) window.oceanDiagnostics.tour = { status, stop: index, key: step.key, kind: step.kind, arrived, paused, routeIssue, detours, tip };
}
// Notices a control in use by what it changed. The first reading of a tour is only a baseline.
function notice(api) {
  const now = { lamp: api.nav.lamp, view: api.nav.perspective, computer: document.body.dataset.computerOpen === 'true',
    photos: window.oceanExpedition?.photos ?? 0, reading: Boolean(window.oceanArchive?.isOpen) };
  if (!seen) { seen = now; return; }
  const before = used.size;
  if (now.lamp !== seen.lamp) used.add('lamp');
  if (now.view !== seen.view) used.add('view');
  if (now.computer && !seen.computer) used.add('computer');
  if (now.photos > seen.photos) used.add('photo');
  if (now.reading && !seen.reading) used.add('interact');
  if (api.nav.scooter > .1) used.add('scooter');
  seen = now;
  if (used.size !== before) paint();
}
// The welcome's checklist and a beat's one tip, worded for the input in hand.
function paintControls(step, fingers) {
  const list = part('.tour-keys'), tip = part('.tour-teach');
  list.hidden = status !== 'intro';
  const shown = list.hidden ? '' : PRIMER.map(id => `${id}:${used.has(id)}`).join() + fingers;
  if (shown && shown !== keysShown) {
    list.replaceChildren(...PRIMER.map(id => {
      const control = CONTROLS[id], item = document.createElement('li');
      item.dataset.done = String(used.has(id));
      if (fingers) item.textContent = control.touch;
      else { const key = document.createElement('kbd'); key.textContent = control.key; item.append(key, control.name); }
      item.setAttribute('aria-label', `${fingers ? control.touch : `${control.key}: ${control.name}`}${used.has(id) ? ', tried' : ''}`);
      return item;
    }));
  }
  keysShown = shown;
  // The scooter is taught on the swim into its beat, where it does something; the rest once the beat is reached.
  const id = step.teach, here = id === 'scooter' ? status === 'travel' : status === 'look' || status === 'dwell' || status === 'done';
  const text = here && !used.has(id) ? CONTROLS[id]?.tip?.[fingers ? 1 : 0] ?? '' : '';
  tip.hidden = !text; tip.textContent = text;
  return text;
}
// Points out the nearest notable visitor not yet seen on this pass; once it has been in view for SEEN_AFTER seconds the
// marker lets it go. A visitor that leaves can be pointed out again on a later pass.
function lookThere(dt, api, state) {
  const camera = api.getCamera?.(); if (!camera) return;
  const live = api.visitors?.() ?? [], [px, py, pz] = state.playerPosition;
  for (const id of pointed) if (!live.some(item => item.id === id)) pointed.delete(id);
  let subject = null, nearest = Infinity;
  for (const item of live) {
    const noted = NOTED[item.id]; if (!noted || pointed.has(item.id)) continue;
    const d = Math.hypot(item.x - px, item.y - py, item.z - pz);
    if (d < noted[1] && d < nearest) { nearest = d; subject = item; }
  }
  if (!subject) { if (marked) { pointAt(camera, null); marked = null; } return; }
  if (marked !== subject.id) { marked = subject.id; markedFor = 0; }
  const rise = subject.y - py, where = rise > 4 ? 'above' : rise < -4 ? 'below' : 'nearby';
  markedFor = pointAt(camera, [subject.x, subject.y, subject.z], `${NOTED[subject.id][0]} · ${where}`) ? markedFor + dt : 0;
  if (markedFor > SEEN_AFTER) { pointed.add(subject.id); pointAt(camera, null); marked = null; }
}
function setBar(value) { const rounded = Math.round(value * 250) / 250; if (rounded !== barShown) { barShown = rounded; bar.style.transform = `scaleX(${rounded})`; } }

// The camera's subjects once a step is reached: the step's own, then a site's landmark. Reduced motion holds the first.
function startPan() {
  const step = STEPS[index]; pans.length = 0; panIndex = 0; panTime = 0; stepTime = 0;
  if (step.pan) pans.push(...step.pan);
  // A resident found where it settled replaces the stand-in first subject.
  const resident = step.resident && frame(step); if (resident) pans.splice(0, 1, resident.subject);
  if (step.landmark) { const subject = [0, 0, 0]; resolve(step, [0, 0, 0], subject); pans.push(subject); }
  // The creature set loads after the dive starts: a beat that calls an animal in keeps asking until it can come.
  called = !step.encounter || Boolean(controls()?.encounter?.(step.encounter.id, step.encounter.course));
  if (pans.length && !reduced()) aim(pans[0]);
}
// A pan subject is a point, or { visitor } for an animal passing (null while it is not there).
const visitorAt = id => { const found = controls()?.visitors?.().find(item => item.id === id); return found ? [found.x, found.y, found.z] : null; };
function aim(subject, follow = false) { const point = subject.visitor ? visitorAt(subject.visitor) : subject; if (point) controls()?.lookAt(point, follow); }
function pan(dt) {
  if (paused) return;
  const step = STEPS[index], beat = step.kind === 'look' ? step.beat ?? BEAT : step.kind === 'intro' ? INTRO_BEAT : PAN_BEAT;
  stepTime += dt; panTime += dt;
  if (!called) called = Boolean(controls()?.encounter?.(step.encounter.id, step.encounter.course));
  if (!reduced() && panIndex < pans.length - 1 && panTime >= beat) { panIndex++; panTime = 0; aim(pans[panIndex]); }
  else if (!reduced() && pans[panIndex]?.visitor) aim(pans[panIndex], true);
  if (status === 'look' && stepTime >= holdOf(step)) advance();
}
function launch() {
  const api = controls();
  api.guide(true, true, true);
  inputs = api.nav.inputs; best = Infinity; stall = 0; legTime = 0;
  if (!api.travelPath(leg, look, STEPS[index].speed ?? SPEED)) blockRoute();
}
function blockRoute() {
  controls()?.cancelTravel(); paused = routeIssue = true; paint();
}
function arrive() {
  const step = STEPS[index]; arrived = index; waited = 0; inputs = controls().nav.inputs; paused = false;
  status = step.kind === 'stop' ? 'dwell' : step.kind === 'look' ? 'look' : 'done';
  if (step.landmark) discover(step.landmark, true);
  note('tour_step'); startPan(); paint();
}
// A cut: fade the water over, move the diver, fade back. Reduced motion always travels this way.
function cutTo(then) { controls()?.cancelTravel(); cut = then; cutTime = .24; fade.dataset.on = 'true'; }
function go(next) {
  index = next; resolve(STEPS[index]); status = 'travel'; paused = routeIssue = false; detours = 0;
  inputs = controls().nav.inputs; paint();
  here.fromArray(window.oceanDiagnostics.playerPosition);
  if (reduced()) { cutTo(land); return; }
  if (!route(here.toArray(), STEPS[index])) { blockRoute(); return; }
  launch();
}
function land() { const api = controls(); api.guide(true, true, true); api.place(goal, look); arrive(); }
function advance() { if (index < STEPS.length - 1) go(index + 1); }
// The welcome is read where the dive levels out: nothing to swim to, only a look around.
function begin() {
  const api = controls(); index = 0; arrived = 0; status = 'intro'; paused = false; inputs = api.nav.inputs;
  endPrelude(); splash('Guided dive', 'Welcome to the reef'); reveal = REVEAL; note('tour_step');
  api.guide(true, true, true); startPan(); paint();
}
function endPrelude() { prelude = -1; delete document.body.dataset.prelude; controls()?.frameDiver?.(false); }
function handOver() { note('tour_taken_over'); status = 'free'; paused = false; cut = null; fade.dataset.on = 'false'; controls()?.guide(false); paint(); }
function rejoin() {
  if (status !== 'free') return;
  here.fromArray(window.oceanDiagnostics.playerPosition);
  let nearest = Math.max(1, arrived + 1), distance = Infinity; const point = [0, 0, 0], subject = [0, 0, 0];
  for (let i = nearest; i < STEPS.length; i++) { resolve(STEPS[i], point, subject); const d = here.distanceTo(to.fromArray(point)); if (d < distance) { distance = d; nearest = i; } }
  note('tour_rejoined'); go(Math.min(nearest, STEPS.length - 1));
}
// how: why it ended, for the funnel (exit, explore, surface, swam_off, surfaced, failed, or stopped from elsewhere).
function stop(message, how = 'stopped') {
  if (status === 'off') return;
  note('tour_ended', { how });
  const api = controls(); status = 'off'; paused = false; cut = null; fade.dataset.on = 'false'; reveal = 0; endPrelude(); pointAt(null); marked = null;
  // Let go of the view too, so it does not stay on the last subject the tour showed.
  if (api) { api.guide(false); api.cancelTravel(); api.lookAt?.(null); }
  paint();
  if (message) say('Guided dive', message, HOLD_SIGNAL, 3200);
}
export function startTour() {
  const api = controls();
  if (!api || !window.oceanDiagnostics?.ready || status !== 'off') return false;
  if (api.getMode() !== 'surface' && api.getMode() !== 'diver') return false;
  // From the surface the opening plays first; under water the tour starts where the diver is.
  if (api.getMode() === 'surface') { prelude = 0; document.body.dataset.prelude = 'on'; }
  track('tour_started', { from: prelude === 0 ? 'surface' : 'underwater' });
  status = 'starting'; index = 0; arrived = -1; waited = 0; paused = false; framed.clear(); used.clear(); seen = null; pointed.clear(); paint();
  return true;
}
export const tourStatus = () => status;
// Swimming and scenic time only. Reading at the welcome and the sites has no countdown or automatic advance: the
// visitor chooses Continue after reading as much as they want.
export const DIVE_IN = 6.5;
export function tourPlan() {
  let distance = 0, seconds = DIVE_IN; const point = [0, 0, 0], subject = [0, 0, 0]; let last = [0, -6, -2];
  for (const item of STEPS) {
    if (item.kind === 'intro') continue;
    resolve(item, point, subject);
    for (const next of [...(item.via || []), point]) { const d = from.fromArray(last).distanceTo(to.fromArray(next)); distance += d; seconds += d / (item.speed ?? SPEED); last = [...next]; }
    seconds += 1.4 + (item.kind === 'look' ? holdOf(item) : 0);
  }
  return { stops: STOPS.length, distance, seconds };
}

function update(dt, api, state, diving) {
  if (status === 'off') return;
  const mode = api.getMode();
  if (status === 'starting') {
    waited += dt;
    if (prelude >= 0) {
      const before = prelude; prelude += dt;
      if (before < PRELUDE_HOLD && prelude >= PRELUDE_HOLD) api.frameDiver?.(true);
      if (prelude >= PRELUDE_DIVE) { prelude = -1; waited = 0; if (!api.startDive({ capture: false, perspective: 'first' })) stop('The ocean is still getting ready. Try again in a moment.', 'failed'); }
      return;
    }
    // Navigation started during the entry animation is overwritten by startDive.
    // Landmarks also move while models load: wait for their final viewpoints.
    if (diving && !api.getTransition() && (state.landmarksReady || state.landmarksSettled)) begin();
    else if (mode === 'surface' && waited > 8) stop(null, 'failed');
    return;
  }
  // Surfacing, by Space or the button, ends the tour without ceremony.
  if (!diving) { if (mode !== 'diver') stop(null, 'surfaced'); return; }
  notice(api);
  // Reading the archive or changing settings holds the tour where it is.
  if (api.nav.suspended || status === 'free') { pointAt(null); return; }
  lookThere(dt, api, state);
  const nav = api.nav;
  // Swimming off from the overview simply ends the tour; anywhere else it puts the tour on hold.
  if (nav.inputs !== inputs) { if (status === 'done') stop(null, 'swam_off'); else handOver(); return; }
  if (cut) { cutTime -= dt; if (cutTime <= 0) { const then = cut; cut = null; then(); fade.dataset.on = 'false'; } return; }
  if (reveal > 0) { reveal -= dt; if (reveal <= 0) paint(); }
  if (status !== 'travel') { pan(dt); return; }
  // Pause the route itself, rather than only its caption.
  if (paused) return;
  legTime += dt;
  const distance = here.fromArray(state.playerPosition).distanceTo(to.fromArray(goal));
  if (distance < ARRIVE_RADIUS && (!nav.travelling || distance < .6)) { arrive(); return; }
  // A scenic route can initially swim away from its destination. Its remaining
  // path length, rather than straight-line distance, measures forward progress.
  const remaining = Number.isFinite(nav.travelRemaining) ? nav.travelRemaining : distance;
  if (remaining < best - .25) { best = remaining; stall = 0; } else stall += dt;
  if (legTime > 1 && (stall > 5 || !nav.travelling || nav.travelBlocked)) {
    if (detours++ < 2 && route(here.toArray(), STEPS[index], false)) { launch(); paint(); }
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
  else if (action === 'surface') { stop(null, 'surface'); controls()?.surface(); }
  else if (action === 'explore') stop('The reef is yours. The lights still mark the three sites.', 'explore');
  else if (action === 'exit') stop('Tour ended. The reef is yours.', 'exit');
  else if (action === 'toggle') { open = card.dataset.sheet !== 'expanded'; more = false; paint(); }
  else if (action === 'more') { more = !more; paint(); }
  // The sheet's own toggles keep the focus where it is, for a keyboard; the actions hand it back to the scene.
  if (action && !['read', 'toggle', 'more'].includes(action)) document.querySelector('#world')?.focus({ preventScroll: true });
});
// A phone turned on its side, or a window narrowed past the phone width, changes the copy the sheet carries.
compact.addEventListener?.('change', () => { if (status !== 'off') paint(); });
// On a phone the sheet stands in for the scene's own prompt, so it offers the same action.
function read() {
  const prompt = document.querySelector('#interact-prompt'), step = STEPS[index];
  if (prompt && !prompt.hidden) prompt.click(); else window.oceanArchive?.open?.(step.opens ?? step.landmark);
}
function next() {
  if (cut) return;
  if (status === 'intro' || status === 'look' || status === 'dwell') { paused = false; advance(); }
  else if (status === 'travel') cutTo(land);
}
function togglePause() {
  if (status === 'look') { paused = !paused; paint(); return; }
  if (status !== 'travel') return;
  paused = !paused;
  if (paused && !cut) controls()?.cancelTravel();
  if (!paused && !cut) {
    routeIssue = false; detours = 0; here.fromArray(window.oceanDiagnostics.playerPosition);
    if (!route(here.toArray(), STEPS[index], false)) { blockRoute(); return; }
    launch();
  }
  paint();
}
addEventListener('keydown', event => {
  if (status === 'off' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
  if (event.code === 'KeyG' && status === 'free') { event.preventDefault(); rejoin(); }
  else if (event.code === 'KeyN' && touring()) { event.preventDefault(); next(); }
  else if (event.code === 'KeyP' && (status === 'travel' || status === 'look')) { event.preventDefault(); togglePause(); }
});
window.oceanTour = { start: startTour, stop, rejoin, next, plan: tourPlan, get status() { return status; }, STEPS, STOPS, get tried() { return [...used]; },
  // The archive asks: At a glance carries the welcome only on the tour (SPEC D6), and a site opens the page its step names.
  get welcome() { return status === 'off' ? null : WELCOME; },
  opens(id) { const step = STEPS[index]; return status !== 'off' && step.landmark === id ? step.opens ?? null : null; } };
