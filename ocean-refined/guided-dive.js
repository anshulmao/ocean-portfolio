import * as THREE from './vendor/three.module.min.js';
import { LANDMARKS, terrainHeightAt } from './reef.js';
import { onFrame, setQuiet, discover, say, splash } from './journey.js';
import { planGuidedRoute } from './guided-route.js';
import { STEPS, SPEED, FLYBY, REACH, SLOW, BRIEF, WELCOME, flyBys, pointOf } from './guided-script.js';
import { track } from './analytics.js';

// The guided dive runs the steps in guided-script.js. Each leg is a scripted route, not a camera path: it hands
// waypoints to the same autopilot the atlas uses, so the diver still collides and still routes over terrain. The
// visitor keeps the view (free look: the mouse, a drag, the arrow keys and a look stick only look), and any input
// that swims takes the controls straight back.
export { STEPS };
// The portfolio sites among the steps: the tour's three stories.
export const STOPS = STEPS.filter(step => step.kind === 'stop');
// Analytics (only with consent; analytics-privacy.js declares what is kept): which step, by its key and number.
// tour_version: the shape of the tour, so a funnel never mixes one round's steps with another's (4: three stops and the
// long way up to the shallows; 5: the same three stops, ending in open water above the wreck; 6: in from open water over
// the far side of the reef, the treasure before the wreck; 7: from out over the treasure, the cathedral from its front;
// 8: Experience in the treasure and Projects in the wreck, so the step keys swap places, and a direct leg to the cathedral).
const VERSION = 8;
const note = (event, extra = {}) => track(event, { step: STEPS[index].key, index, tour_version: VERSION, ...extra });
const ARRIVE_RADIUS = 1.6, PAN_BEAT = 3, INTRO_BEAT = 4.5, HOLD_SIGNAL = '#8ff4ff';
// The opening from the surface (SPEC step 0): a held beat while the surface copy fades, the camera eases in on the diver
// (world.js frameDiver), and the dive starts in first person. Underwater, the title card shows before the welcome sheet.
// REVEAL outlasts the title card (announce.js holds a short one about 2.5 s, then fades), so the two never overlap.
// The opening from the surface: the camera starts in on the diver at once (PRELUDE_HOLD, a beat for the hero to start
// fading) and the dive starts as that move ends (world.js PRELUDE, 1.4 s). It used to hold a full second first, which read
// as the button doing nothing.
const PRELUDE_HOLD = .2, PRELUDE_DIVE = 1.6, REVEAL = 3.2;
// The controls the tour teaches (SPEC: teaching schedule). The welcome asks for PRIMER one at a time, ticks each as it is
// done and moves to the next; N skips them all and starts the tour. A later beat names its `teach` control once, and not at
// all if it has been tried. Use is read from what changed (the lamp, the view, the scooter, the computer, a photo, the
// records), so a key, a touch button and a gamepad all count. Each `try` (the welcome) and `tip` (a beat) is [keyboard, touch].
const CONTROLS = {
  computer: { key: 'C', name: 'Dive computer', touch: 'Computer', try: ['Press C to open your dive computer.', 'Tap the computer button.'],
    tip: ['Press C to check your depth on your dive computer.', 'Tap Dive computer to check your depth.'] },
  interact: { key: 'F', name: 'Open a site', touch: 'Read it' },
  // Swimming and rising or sinking are noticed by the diver moving under the visitor's own control (notice()).
  swim: { key: 'W A S D', name: 'Swim', touch: 'Stick: swim', try: ['Swim with W A S D. The guide picks up again when you let go.', 'Swim with the stick. The guide picks up again when you let go.'] },
  updown: { key: 'Space · Shift', name: 'Up and down', touch: 'Rise and sink', try: ['Space to rise, Shift to sink.', 'Use the rise and sink buttons.'] },
  scooter: { key: 'E', name: 'Scooter', touch: 'Scooter (hold)', try: ['Hold E to spin up your scooter.', 'Hold the scooter button.'],
    tip: ['Hold E for your scooter: the guide speeds up with you.', 'Hold ⚡ for your scooter: the guide speeds up with you.'] },
  lamp: { key: 'Q', name: 'Flashlight', touch: 'Lamp', try: ['Press Q to switch your flashlight.', 'Tap the lamp button.'],
    tip: ['It’s dark under the arch. Press Q for your lamp.', 'It’s dark under the arch. Tap the lamp button.'] },
  view: { key: 'V', name: 'Third person view', touch: 'View', try: ['Press V to see yourself in third person.', 'Tap the view button.'],
    tip: ['Press V to see yourself against the reef.', 'Tap the view button to see yourself against the reef.'] },
  photo: { key: 'H', name: 'Photo', touch: 'Camera',
    tip: ['Press H to take a photo of it.', 'Tap the camera button to take a photo of it.'] },
};
// F is not among them: there is nothing to open where the welcome is read; it is taught at the anchor, where there is.
// The rest are taught by the fly-bys that use them: the guide runs the scooter across the reef shelf, the lamp comes in under
// the arch and the camera as the whale shark passes; the computer at the treasure, the deepest stop, and the view at the end.
// On a phone the computer and the view live in the menu, not on the deck, so the welcome asks only for what the deck has and
// no later beat teaches them there (DESK).
const PRIMER = { keys: ['swim', 'updown', 'computer', 'view'], touch: ['swim', 'updown'] }, DESK = new Set(['computer', 'view']);
const CHEER = 1.5, MOVED = 1.2;
// CEILING: in the welcome the visitor may swim anywhere, up and down included, but no higher than this (world y), so rising
// cannot carry them out of the tour and up to the surface. Only Skip (or Start) leaves the welcome.
const CEILING = -3.5;
// The welcome's drift toward the reef (m/s), and how long (s) after the visitor lets go of the swim it picks up again.
const DRIFT = .9, RESUME = 2.5;
let idle = 0;
// Big animals passing while the tour swims: the view turns to one coming within its SPOT range (m; the look-there marker's,
// big-life.js, a little inside it) that is no fly-by's subject, for SPOT_HOLD s, and not to the same one again within SPOT_AGAIN s.
const SPOT = { whale: 100, orcas: 80, 'whale-shark': 60, dolphins: 40 }, SPOT_HOLD = 5, SPOT_AGAIN = 45;
// After a fly-by the view goes back to the way ahead. A subject the swim has left behind (further than BEHIND rad off the
// way it is going) is let go once the fly-by has had BRIEF s, rather than watched over the shoulder. On a calm stretch the
// view looks round now and then: after CALM s on the course, a look to one side at the reef (LOOK_OUT rad off, LOOK_FAR m
// away) for LOOK_FOR s, the other side next time.
const BEHIND = 1.9, CALM = 8, LOOK_OUT = .6, LOOK_FAR = 20, LOOK_FOR = 3.5;
// The tour waits up to ASSETS_WAIT seconds at Start for the creature set (the nurse shark, the whale shark) to be in.
const ASSETS_WAIT = 20;
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
  + '<footer><button type="button" data-tour="pause">Pause <kbd>P</kbd></button><button type="button" data-tour="read">Read it <kbd>F</kbd></button><button type="button" data-tour="next">Next <kbd>N</kbd></button><button type="button" data-tour="rejoin">Rejoin <kbd>G</kbd></button><button type="button" data-tour="surface">Surface <kbd>N</kbd></button><button type="button" data-tour="explore">Keep exploring</button><button type="button" data-tour="exit">Exit tour</button></footer>';
fade.className = 'tour-fade'; fade.setAttribute('aria-hidden', 'true');
// A fly-by's caption: a title and a line over the water, no card. On a phone it sits under the depth chip, clear of the
// subject and the controls; the sheet itself stays folded while the tour swims.
const caption = document.createElement('div');
caption.className = 'tour-caption'; caption.dataset.show = 'false'; caption.setAttribute('role', 'status');
caption.innerHTML = '<b></b><span></span><small hidden></small>';
document.body.append(fade, caption, card);
const part = name => card.querySelector(name), bar = part('.tour-progress i');
// open: the visitor's own choice for this step (null follows the tour); more: the full caption on a phone.
let open = null, more = false, shownFor = '';

// status: off · starting (waiting for the dive) · intro (the welcome) · travel (a leg, fly-bys and all) · dwell (a portfolio
// site; waits for Continue) · free (visitor has the controls) · done (the ending)
let status = 'off', index = 0, arrived = -1, legTime = 0, paused = false, inputs = 0;
let best = Infinity, stall = 0, settle = 0, waited = 0, cut = null, cutTime = 0, barShown = -1;
let detours = 0, routeIssue = false, panIndex = 0, panTime = 0, prelude = -1, reveal = 0;
// Seconds since the tour's title card went up, or -1: it goes up as the camera goes under, not once the dive settles.
let titled = -1;
// The leg's fly-bys: those ahead in order, the one under way (and for how long), and the keys done, so a replanned leg
// never shows one twice. cued: the fly-bys whose animal has been called in.
const sights = [], passed = new Set(), cued = new Set(); let sight = null, sightTime = 0;
// spotted: the big animal the view has turned to between fly-bys, and for how long; spottedAt: when each was last turned to.
let spotted = null, spottedFor = 0, tourTime = 0; const spottedAt = new Map();
// heading: the way the swim is going, smoothed from the diver's own steps (lastAt). calmFor: time on the course with nothing
// to look at; looking: time left on a look round, and lookSide, which side it is to.
const heading = new THREE.Vector3(0, 0, -1), lastAt = new THREE.Vector3(), stepped = new THREE.Vector3();
let hasLast = false, calmFor = 0, looking = 0, lookSide = 1;
// held: the subject the view stays on between two fly-bys (HOLD_GAP), let go once the swim leaves it behind.
let held = null;
// A fly-by that teaches a control waits up to WAIT s for the visitor to try it, the swim at HUSH of its cruise; holdFor: how
// long the fly-by under way lasts. HOLD_GAP: back-to-back fly-bys nearer than this (m) keep the view on a subject between them.
const WAIT = 7, HUSH = .12, HOLD_GAP = 30; let waiting = false, holdFor = 0;
// Where the current leg set off along its scenic waypoints, or null on a leg without them.
let scenicFrom = null;
// The leg's scenic route as swum: the step's own, with any orbit worked out where things are now, and the approach that
// brings the swim in on the line from the stop's subject, so the diver arrives facing it rather than swinging round to it.
let legVia = [];
const APPROACH = 8, LEAD = 16;
function legOf(step) {
  const items = (step.via ?? []).flatMap((item, i, all) => item.orbit ? orbitOf(item, all[i + 1]) : [item]);
  if (step.kind === 'stop' || step.approach) {
    const dx = goal[0] - look[0], dz = goal[2] - look[2], length = Math.hypot(dx, dz) || 1, distance = step.approach ?? APPROACH;
    const x = goal[0] + dx / length * distance, z = goal[2] + dz / length * distance;
    items.push([x, Math.max(goal[1] + .5, terrainHeightAt(x, z) + 2.5), z]);
  }
  return items;
}
// An orbit fly-by: round a landmark from where the last stop left the diver, the view held on its subject, turning the way
// that ends nearer what comes next. The fly-by itself starts at the first point of the turn.
function orbitOf(item, after) {
  const { around, radius, turn, rise, points = 3 } = item.orbit, centre = [0, 0, 0];
  resolve(STEPS.find(step => step.landmark === around), [0, 0, 0], centre);
  const from = scenicFrom ?? item.at, a0 = Math.atan2(from[2] - centre[2], from[0] - centre[0]), next = after ? pointOf(after) : from;
  const at = (sign, k) => { const a = a0 + sign * turn * Math.PI / 180 * k / points, x = centre[0] + Math.cos(a) * radius, z = centre[2] + Math.sin(a) * radius;
    return [x, Math.max(centre[1] + rise, terrainHeightAt(x, z) + 2.5), z]; };
  const sign = Math.hypot(...at(1, points).map((v, k) => v - next[k])) < Math.hypot(...at(-1, points).map((v, k) => v - next[k])) ? 1 : -1;
  const path = Array.from({ length: points }, (_, k) => at(sign, k + 1));
  return [{ ...item, at: path[0] }, ...path.slice(1)];
}
// cheer: the control just done where the tour was teaching it (a welcome chip, a fly-by's caption, a stop's tip), shown
// pressed and ticked for CHEER seconds before the next is asked for. tipShown: what the tip holds, so a repaint leaves the
// tick's animation running.
let cheer = null, cheerFor = 0, keysShown = '', tipShown = '';
// roaming: the visitor is swimming about in the welcome (the drift waits for them). starting: Start pressed, waiting on the assets.
let roaming = false, starting = false, introFor = 0; const start = new THREE.Vector3();
// used: the controls tried on this tour. seen: what they last read, to notice a change.
const used = new Set(); let seen = null;
const leg = [], goal = [0, 0, 0], look = [0, 0, 0], pans = [], from = new THREE.Vector3(), to = new THREE.Vector3(), here = new THREE.Vector3(), probe = new THREE.Vector3();
const controls = () => window.oceanControls;
const touring = () => status === 'intro' || status === 'travel' || status === 'dwell';

function landmarkOf(step) {
  const placed = controls()?.landmarks?.find(item => item.id === step.landmark);
  return placed && (window.oceanDiagnostics?.landmarksReady || window.oceanDiagnostics?.landmarksSettled) ? placed : null;
}
// Where a step swims to, and the subject it turns to on arrival.
function resolve(step, target = goal, subject = look) {
  if (!step.landmark) { target.splice(0, 3, ...step.at); subject.splice(0, 3, ...(Array.isArray(step.pan?.[0]) ? step.pan[0] : step.at)); return true; }
  const placed = landmarkOf(step);
  if (placed) { target.splice(0, 3, ...placed.interactionPosition); subject.splice(0, 3, ...placed.position); own(step, target, subject); lift(target, subject); return true; }
  // Before the models settle, a viewpoint beside the charted position stands in.
  const [x, , z] = LANDMARKS.find(item => item.id === step.landmark).position, floor = terrainHeightAt(x, z);
  target.splice(0, 3, x + 6, floor + 5, z); subject.splice(0, 3, x, floor + 1.5, z); own(step, target, subject); lift(target, subject); return false;
}
// A stop's own viewpoint (step.view) where the model's is not the one to see it from: a point, or { behind, near, distance,
// rise } to stand squarely in front of the landmark with that resident (where it settled; near until it has) lined up behind.
function own(step, target, subject) {
  const view = step.view; if (!view) return;
  if (Array.isArray(view)) { target.splice(0, 3, ...view); return; }
  const animal = controls()?.residentAt?.(view.behind) ?? view.near, dx = subject[0] - animal[0], dz = subject[2] - animal[2], length = Math.hypot(dx, dz) || 1;
  const x = subject[0] + dx / length * view.distance, z = subject[2] + dz / length * view.distance;
  target.splice(0, 3, x, Math.max(subject[1] + view.rise, terrainHeightAt(x, z) + 2.5), z);
}
// On a phone the sheet covers the lower part of the screen at a stop, so the view aims a little below the landmark and the
// landmark sits above the middle, clear of it: about 12°, a fifth of the distance down.
function lift(target, subject) {
  if (compact.matches) subject[1] -= .2 * Math.hypot(subject[0] - target[0], subject[1] - target[1], subject[2] - target[2]);
}
function clear(a, b) {
  if (controls()?.settings?.collisionEnabled === false) return true;
  const world = controls()?.reef?.userData.collisions;
  const radius = Math.max(.85, (controls()?.settings?.collisionRadius ?? .55) + .25);
  return !world?.segmentClear || world.segmentClear(from.fromArray(a), to.fromArray(b), radius);
}
// A leg from the step before takes the step's scenic waypoints. Replanned mid-leg (a detour, or Resume after Pause), it keeps
// the ones still ahead: dropping them turned the arch's swim-through into a straight line over its roof.
function route(start, step, via = onward(step, start)) {
  leg.length = 0;
  leg.push(...planGuidedRoute(start, goal, { via: via.map(pointOf), floor: terrainHeightAt, clear,
    clearance: Math.max(1.5, controls()?.settings?.floorClearance ?? 1.5) }));
  return leg.length > 0;
}
// The scenic waypoints after the stretch of the scenic line (the leg's start, its waypoints, its goal) the diver is nearest.
// A leg that set off from anywhere but the step before has no scenic line: it swims the planner's own route.
function onward(step, at) {
  if (!scenicFrom || !legVia.length) return [];
  const line = [scenicFrom, ...legVia.map(pointOf), goal]; let nearest = Infinity, next = 0;
  for (let i = 1; i < line.length; i++) {
    from.fromArray(line[i - 1]); to.fromArray(line[i]).sub(from);
    const t = Math.max(0, Math.min(1, probe.fromArray(at).sub(from).dot(to) / Math.max(to.lengthSq(), 1e-6)));
    const d = probe.fromArray(at).distanceTo(from.addScaledVector(to, t));
    if (d < nearest) { nearest = d; next = i - 1; }
  }
  return legVia.slice(next);
}
function paint() {
  const step = STEPS[index], shown = status !== 'off' && status !== 'starting' && reveal <= 0, reading = status === 'intro' || status === 'dwell' || status === 'done';
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
    : status === 'travel' ? (routeIssue ? 'The route is blocked. Resume to try again, skip this swim, or explore freely.' : fingers ? 'On the way there. Drag the water to look around, or touch the pad to take over.' : 'On the way there. Look around freely; any movement key hands the dive to you.')
    : step.line;
  const brief = reading ? step.short ?? full : full;
  part('.tour-lines').textContent = small && !more ? brief : full;
  const moreButton = part('.tour-more');
  // On a phone the welcome's controls take the caption's place, so More is how it is read there.
  moreButton.hidden = !(small && wide && (brief !== full || status === 'intro'));
  moreButton.setAttribute('aria-expanded', String(more));
  moreButton.firstChild.textContent = more ? 'Less' : 'More';
  card.dataset.more = String(small && more);
  const tip = paintControls(step, fingers);
  // Folded, the row offers one action: the one the moment calls for.
  const primary = status === 'dwell' ? (step.landmark ? 'read' : 'next') : status === 'free' ? 'rejoin' : status === 'done' ? 'surface' : 'next';
  const show = { pause: status === 'travel', read: status === 'dwell' && Boolean(step.landmark), next: touring(), rejoin: status === 'free', surface: status === 'done', explore: status === 'done', exit: touring() || status === 'free' };
  for (const button of card.querySelectorAll('footer [data-tour]')) { const action = button.dataset.tour; button.hidden = wide ? !show[action] : action !== primary; }
  part('[data-tour="pause"]').firstChild.textContent = paused ? 'Resume ' : 'Pause ';
  part('[data-tour="pause"]').setAttribute('aria-pressed', String(paused));
  part('[data-tour="next"]').firstChild.textContent = status === 'travel' ? (wide ? 'Skip travel ' : 'Skip ') : status === 'intro' ? (primerLeft().length ? 'Skip controls ' : 'Start ') : 'Continue ';
  part('.tour-pace').textContent = status === 'intro' ? (primerLeft().length ? (fingers ? 'Or skip the controls and start the tour.' : 'Or press N to skip the controls and start the tour.') : '')
    : status === 'dwell' ? `${step.landmark ? (fingers ? 'Tap Read it to open it. ' : 'Press F to open it. ') : ''}Take your time. Continue when you’re ready.`
    : status === 'travel' ? (routeIssue ? '' : paused ? 'Travel paused. Resume when you’re ready.' : 'You can skip this swim or take the controls at any time.') : '';
  setQuiet(touring() || status === 'starting');
  setBar(status === 'done' ? 1 : (index + (arrived === index ? 1 : 0)) / STEPS.length);
  const flyTip = paintCaption(fingers);
  if (window.oceanDiagnostics) window.oceanDiagnostics.tour = { status, stop: index, key: step.key, kind: step.kind, arrived, paused, routeIssue, detours, tip, sight: sight?.key ?? null, flyTip, goal: [...goal] };
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
  // The guide running the scooter is not the visitor trying it; their own E (or ⚡) is, guide or not.
  if (api.nav.scooterAsked || (api.nav.scooter > .1 && !api.nav.guideScooter)) used.add('scooter');
  if (status === 'intro' && api.nav.manualInput) {
    const [x, y, z] = window.oceanDiagnostics.playerPosition;
    if (Math.hypot(x - start.x, z - start.z) > MOVED) used.add('swim');
    if (Math.abs(y - start.y) > MOVED) used.add('updown');
  }
  seen = now;
  if (used.size === before) return;
  const done = [...used].at(-1);
  // Ticked where it was being asked for: the welcome's chips, the fly-by under way, or the stop reached.
  const asked = status === 'intro' ? primer() : status === 'travel' ? [sight?.teach] : status === 'dwell' || status === 'done' ? [STEPS[index]?.teach] : [];
  if (asked.includes(done)) { cheer = done; cheerFor = CHEER; }
  paint();
}
// The welcome's controls, as key buttons ticked once done with the one to try next lit, and one prompt at a time; a beat's
// one tip. All worded for the input in hand.
const primer = () => touch() ? PRIMER.touch : PRIMER.keys, primerLeft = () => primer().filter(id => !used.has(id));
// The tick: its key pressed in, then the check drawn on (journey.css tour-press, tour-draw). Built from constants only.
const TICK = '<svg class="tour-tick" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.4 6.5 5 9l4.7-5.6" pathLength="1"/></svg>';
const cheerHTML = (id, fingers) => `<span class="tour-cheer">${fingers ? '' : `<kbd>${CONTROLS[id].key}</kbd>`}${TICK}${fingers ? CONTROLS[id].touch : CONTROLS[id].name}</span>`;
function paintKeys(fingers) {
  const list = part('.tour-keys'), next = primerLeft()[0];
  list.hidden = status !== 'intro';
  const shown = list.hidden ? '' : primer().map(id => `${id}:${used.has(id)}`).join() + next + fingers;
  if (shown && shown !== keysShown) list.replaceChildren(...primer().map(id => {
    const control = CONTROLS[id], item = document.createElement('li');
    item.dataset.done = String(used.has(id)); item.dataset.next = String(id === next); item.dataset.fresh = String(id === cheer);
    item.innerHTML = (fingers ? control.touch : `<kbd>${control.key}</kbd>${control.name}`) + (used.has(id) ? TICK : '');
    item.setAttribute('aria-label', `${fingers ? control.touch : `${control.key}: ${control.name}`}${used.has(id) ? ', done' : ''}`);
    return item;
  }));
  keysShown = shown;
}
function paintControls(step, fingers) {
  const tip = part('.tour-teach'), input = fingers ? 1 : 0;
  let text = '', html = '';
  paintKeys(fingers);
  if (status === 'intro' && starting) text = 'Getting the reef ready…';
  else if (status === 'intro') {
    const left = primerLeft(), next = left[0];
    if (cheer) html = cheerHTML(cheer, fingers);
    text = cheer ? `✓ ${CONTROLS[cheer].name}`
      : next ? `Try it, ${primer().length - left.length + 1} of ${primer().length}: ${CONTROLS[next].try[input]}`
      : fingers ? 'That’s the controls. Tap Start for the tour.' : 'That’s the controls. Press N to start the tour.';
  } else {
    // A stop or the ending teaches once it is reached; a fly-by teaches in its own caption.
    const id = step.teach, here = status === 'dwell' || status === 'done';
    if (here && id && cheer === id) { html = cheerHTML(id, fingers); text = `✓ ${CONTROLS[id].name}`; }
    else if (here && id && !used.has(id) && !(fingers && DESK.has(id))) text = CONTROLS[id]?.tip?.[input] ?? '';
  }
  if ((html || text) !== tipShown) { tipShown = html || text; if (html) tip.innerHTML = html; else tip.textContent = text; }
  tip.hidden = !text; card.dataset.tip = String(Boolean(text));
  return text;
}
// The fly-by's caption: its title, its line and the control it teaches, if that has not been tried.
let captionShown = '';
function paintCaption(fingers) {
  const id = sight?.teach, on = status === 'travel' && Boolean(sight) && !paused, tip = on && id && !used.has(id) ? CONTROLS[id]?.tip?.[fingers ? 1 : 0] ?? '' : '';
  // Tried while it was asked for: the caption shows it pressed and ticked, and the deck key flashes.
  const cheering = on && id && cheer === id;
  if (cheering) document.body.dataset.tourCheer = id; else delete document.body.dataset.tourCheer;
  const key = on ? `${sight.key}:${tip}:${cheering}` : '';
  // The deck key it teaches calls the thumb to it, and the scooter key reads as held while the guide runs the scooter.
  if (tip) document.body.dataset.tourTeach = id; else delete document.body.dataset.tourTeach;
  if (on && sight.scooter) document.body.dataset.guideScooter = 'true'; else delete document.body.dataset.guideScooter;
  if (key === captionShown) return tip;
  // While a fly-by's caption names its subject, the floating landmark labels step back (journey.css).
  captionShown = key; caption.dataset.show = String(on); document.body.dataset.tourFlyby = String(on);
  if (!on) return tip;
  const small = caption.querySelector('small');
  caption.querySelector('b').textContent = sight.title; caption.querySelector('span').textContent = sight.line;
  if (cheering) small.innerHTML = cheerHTML(id, fingers); else small.textContent = tip;
  small.hidden = !tip && !cheering;
  return tip;
}
function setBar(value) { const rounded = Math.round(value * 250) / 250; if (rounded !== barShown) { barShown = rounded; bar.style.transform = `scaleX(${rounded})`; } }

// The camera's subjects once a step is reached: the step's own, then a site's landmark. Reduced motion holds the first.
function startPan() {
  const step = STEPS[index]; pans.length = 0; panIndex = 0; panTime = 0;
  if (step.pan) pans.push(...step.pan);
  if (step.landmark) { const subject = [0, 0, 0]; resolve(step, [0, 0, 0], subject); pans.push(subject); }
  if (pans.length && !reduced()) aim(pans[0]);
}
// A pan subject is a point, or { visitor } for an animal passing (null while it is not there).
const visitorAt = id => { const found = controls()?.visitors?.().find(item => item.id === id); return found ? [found.x, found.y, found.z] : null; };
// In the welcome the diver is drifting in, so a subject is a glance too (lookAt only holds a view at rest).
function aim(subject, follow = false) { const point = subject.visitor ? visitorAt(subject.visitor) : subject; if (!point) return; controls()?.lookAt(point, follow); if (status === 'intro') controls()?.glance?.(point); }
function pan(dt) {
  if (paused) return;
  const beat = STEPS[index].kind === 'intro' ? INTRO_BEAT : PAN_BEAT;
  panTime += dt;
  // The visitor swimming about in the welcome has the view; the look-around waits.
  if (roaming) return;
  if (!reduced() && panIndex < pans.length - 1 && panTime >= beat) { panIndex++; panTime = 0; aim(pans[panIndex]); }
  else if (!reduced() && pans[panIndex]?.visitor) aim(pans[panIndex], true);
}
// A fly-by's subject now: a point, an animal passing (null while it is not there) or one where it settled.
function subjectOf(look) {
  if (!look || Array.isArray(look)) return look ?? null;
  if (look.visitor) return visitorAt(look.visitor);
  if (look.bait) return controls()?.baitBall?.()?.slice(0, 3) ?? null;
  return controls()?.residentAt?.(look.resident) ?? look.near ?? null;
}
// Fly-bys, while a leg swims on. The next one ahead begins as the diver comes within its reach: the swim slows, the view
// glances at its subject (an animal is followed), the guide may run the scooter, and the caption names it. It lasts its
// hold (or until the next comes into reach, after BRIEF), then the swim and the view go back to the course. An animal is
// called in `cue` metres early, so it is there.
// Keeps `heading` to the way the diver has been swimming.
function steer(at) {
  stepped.fromArray(at);
  if (hasLast) { const step = lastAt.subVectors(stepped, lastAt); if (step.lengthSq() > 1e-6) heading.lerp(step.normalize(), .08).normalize(); }
  lastAt.copy(stepped); hasLast = true;
}
// Whether a point is behind the diver, off the way the swim is going by more than `limit` rad.
function behind(point, at, limit = BEHIND) {
  if (!point) return false;
  const dx = point[0] - at[0], dy = point[1] - at[1], dz = point[2] - at[2], length = Math.hypot(dx, dy, dz) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (dx * heading.x + dy * heading.y + dz * heading.z) / length))) > limit;
}
function flyBy(dt, at) {
  const api = controls();
  steer(at);
  for (const item of sights) {
    if (!item.encounter || cued.has(item.key) || probe.fromArray(at).distanceTo(to.fromArray(item.at)) > item.encounter.cue) continue;
    if (api?.encounter?.(item.encounter.id, { ...item.encounter.course, from: item.at })) cued.add(item.key);
  }
  // A fly-by the swim has already gone past (the scenic line ahead no longer holds it) is dropped, so it never holds up
  // the ones after it.
  const ahead = new Set(flyBys({ via: onward(STEPS[index], at) }).map(item => item.key));
  while (sights.length && !ahead.has(sights[0].key)) sights.shift();
  const next = sights[0], due = next && probe.fromArray(at).distanceTo(to.fromArray(next.at)) <= (next.reach ?? REACH);
  if (sight) {
    sightTime += dt;
    if (sight.look && !Array.isArray(sight.look)) { const point = subjectOf(sight.look); if (point) api?.glance(point, true); }
    // A fly-by that teaches a control waits (up to WAIT s, the swim all but still) for the visitor to try it, then goes on;
    // a visitor who has not tried it by then is shown it (the guide runs the scooter).
    if (waiting) {
      const tried = used.has(sight.wait);
      if (!tried && sightTime < WAIT) return;
      waiting = false; sightTime = 0; holdFor = tried ? CHEER + .8 : sight.hold ?? FLYBY;
      api?.pacing(sight.slow ?? SLOW); if (!tried && sight.scooter) api?.guideScooter(true);
      paint();
    }
    // A subject left behind is let go (after BRIEF), and the view turns back to the way ahead.
    const left = sightTime >= BRIEF && behind(subjectOf(sight.look), at);
    if (left || sightTime >= holdFor || (due && sightTime >= BRIEF)) {
      // Back to back, the view stays on this subject until the next one's pan, rather than swinging back to the way ahead
      // between them, but only while the subject is still ahead of the diver.
      const next = sights[0], subject = subjectOf(sight.look);
      const keep = !left && Boolean(sight.look && next?.look && probe.fromArray(at).distanceTo(to.fromArray(next.at)) < HOLD_GAP) && !behind(subject, at, 1.2);
      held = keep && Array.isArray(subject) ? subject : null;
      endSight(keep);
    }
    if (sight || !due) return;
  }
  if (held && behind(held, at, 1.6)) { held = null; api?.glance(null); }
  if (!due) { if (!held && !spot(dt, at)) lookRound(dt, at); return; }
  held = null;
  if (spotted) { spotted = null; api?.glance(null); }
  if (looking > 0) looking = 0;
  calmFor = 0;
  sights.shift(); passed.add(next.key); sight = next; sightTime = 0; holdFor = next.hold ?? FLYBY; if (next.look?.visitor) spottedAt.set(next.look.visitor, tourTime);
  waiting = Boolean(next.wait) && !used.has(next.wait);
  api?.pacing(waiting ? HUSH : next.slow ?? SLOW); if (next.look) api?.glance(subjectOf(next.look)); api?.guideScooter(Boolean(next.scooter) && !waiting);
  if (next.through) throughBall(at);
  paint();
}
// The bait ball wanders a few metres round its home, and a corner of the planned route clipped its edge rather than going
// through it. From here the swim lines up on the ball as it is now: in short of it, through its middle and out the far side,
// then on along the rest of the scenic route.
function throughBall(at) {
  const ball = controls()?.baitBall?.(); if (!ball) return;
  const centre = ball.slice(0, 3), [x, y, z] = centre, dx = x - at[0], dy = y - at[1], dz = z - at[2], length = Math.hypot(dx, dy, dz) || 1;
  const along = k => [x + dx / length * k, y + dy / length * k, z + dz / length * k];
  const step = STEPS[index], rest = onward(step, at), after = rest.findIndex(item => item.key === 'bait-ball');
  if (after < 0) return;
  // A route that cannot be made through the ball keeps the one under way.
  if (route(probe.fromArray(at).toArray(), step, [along(-6), { ...rest[after], at: centre }, along(8), ...rest.slice(after + 1)])) launch();
}
// Between fly-bys, a big animal passing near (a whale, the whale shark, orcas, dolphins) is worth turning for: the view
// follows it for SPOT_HOLD s while the swim carries on, and the look-there marker names it.
// Returns whether the view is on an animal.
function spot(dt, at) {
  const api = controls();
  if (spotted) {
    spottedFor += dt; const point = visitorAt(spotted);
    if (point && spottedFor < SPOT_HOLD && !behind(point, at, 2.2)) { api?.glance(point, true); return true; }
    spotted = null; calmFor = 0; api?.glance(null); return false;
  }
  // Not one a fly-by ahead is about to show (the whale shark called in for its drift), and not one already behind.
  const shown = new Set(sights.map(item => item.look?.visitor).filter(Boolean));
  for (const item of api?.visitors?.() ?? []) {
    if (!(item.id in SPOT) || shown.has(item.id) || tourTime - (spottedAt.get(item.id) ?? -Infinity) < SPOT_AGAIN) continue;
    if (Math.hypot(item.x - at[0], item.y - at[1], item.z - at[2]) > SPOT[item.id] || behind([item.x, item.y, item.z], at)) continue;
    if (looking > 0) looking = 0;
    spotted = item.id; spottedFor = 0; spottedAt.set(item.id, tourTime); api?.glance([item.x, item.y, item.z]); return true;
  }
  return false;
}
// On a calm stretch, now and then a look to one side at the reef and back, like a diver looking round. Not on the run in to
// a stop, where the view turns to its subject (LEAD). The visitor's own look still wins over it (exploration.js glance).
function lookRound(dt, at) {
  const api = controls(), step = STEPS[index];
  if (looking > 0) { looking -= dt; if (looking <= 0) { calmFor = 0; api?.glance(null); } else api?.glance(aside(at), true); return; }
  calmFor += dt;
  const near = probe.fromArray(at).distanceTo(to.fromArray(goal)) < (step.lead ?? LEAD) + 10;
  if (calmFor < CALM || near || reduced()) return;
  lookSide = -lookSide; looking = LOOK_FOR; api?.glance(aside(at));
}
// Where a look round looks: LOOK_FAR m out to one side of the way ahead, down toward the reef, kept there as the diver swims.
function aside(at) {
  const flat = Math.hypot(heading.x, heading.z) || 1, cos = Math.cos(LOOK_OUT * lookSide), sin = Math.sin(LOOK_OUT * lookSide);
  const fx = heading.x / flat, fz = heading.z / flat, x = at[0] + (fx * cos - fz * sin) * LOOK_FAR, z = at[2] + (fx * sin + fz * cos) * LOOK_FAR;
  return [x, Math.max(terrainHeightAt(x, z) + 3, at[1] - 8), z];
}
function endSight(keep = false) {
  if (!keep) held = null;
  if (spotted) { spotted = null; controls()?.glance(null); }
  if (looking > 0) { looking = 0; controls()?.glance(null); }
  calmFor = 0;
  if (!sight) return;
  sight = null; waiting = false; const api = controls(); if (!keep) api?.glance(null); api?.pacing(1); api?.guideScooter(false); paint();
}
// The fly-bys still ahead on the leg's scenic route from here, less any already shown.
function lineUp(at) {
  sights.length = 0;
  if (scenicFrom) sights.push(...flyBys({ via: onward(STEPS[index], at) }).filter(item => !passed.has(item.key)));
}
function launch() {
  const api = controls();
  api.guide(true, true, true);
  inputs = api.nav.inputs; best = Infinity; stall = 0; legTime = 0; settle = 2; calmFor = 0; hasLast = false;
  if (!api.travelPath(leg, look, STEPS[index].speed ?? SPEED, STEPS[index].lead ?? LEAD)) blockRoute();
  else lineUp(window.oceanDiagnostics.playerPosition);
}
function blockRoute() {
  endSight(); controls()?.cancelTravel(); paused = routeIssue = true; paint();
}
function arrive() {
  const step = STEPS[index]; endSight(); arrived = index; waited = 0; inputs = controls().nav.inputs; paused = false;
  status = step.kind === 'stop' ? 'dwell' : 'done';
  if (step.landmark) discover(step.landmark, true);
  note('tour_step'); startPan(); paint();
}
// A cut: fade the water over, move the diver, fade back. Reduced motion always travels this way.
function cutTo(then) { endSight(); controls()?.cancelTravel(); cut = then; cutTime = .24; fade.dataset.on = 'true'; }
function go(next) {
  controls()?.tether?.(null); controls()?.glance?.(null); index = next; resolve(STEPS[index]); status = 'travel'; paused = routeIssue = roaming = false; detours = 0;
  inputs = controls().nav.inputs; paint();
  here.fromArray(window.oceanDiagnostics.playerPosition);
  // The scenic line starts where the step before is, so a leg rejoined partway takes up the waypoints still ahead.
  scenicFrom = arrived === index - 1 && STEPS[index].via ? resolveAt(STEPS[index - 1]) : null;
  legVia = scenicFrom ? legOf(STEPS[index]) : [];
  sight = null; sights.length = 0; passed.clear(); cued.clear();
  if (reduced()) { cutTo(land); return; }
  if (!route(here.toArray(), STEPS[index])) { blockRoute(); return; }
  launch();
}
function resolveAt(step) { const point = [0, 0, 0]; resolve(step, point, [0, 0, 0]); return point; }
function land() { const api = controls(); api.guide(true, true, true); api.place(goal, look); arrive(); }
function advance() { if (index < STEPS.length - 1) go(index + 1); }
// The welcome is read where the dive levels out: nothing to swim to, only a look around.
function begin() {
  const api = controls(); index = 0; arrived = 0; status = 'intro'; paused = false; inputs = api.nav.inputs;
  roaming = starting = false; introFor = 0; start.fromArray(window.oceanDiagnostics.playerPosition);
  // The welcome sheet follows the title card by REVEAL, counted from when the card went up during the descent.
  if (titled < 0) { titled = 0; splash('Guided dive', 'Welcome to the reef'); }
  endPrelude(); reveal = Math.max(.4, REVEAL - titled); titled = -1; note('tour_step');
  api.guide(true, true, true); api.tether?.(CEILING); drift(); startPan(); paint();
}
// The welcome drifts in toward the reef at an easy pace while the controls are tried. A visitor swimming about takes over,
// and the drift picks up again once they have let go for RESUME seconds.
function drift() {
  const api = controls(), step = STEPS[0]; if (!step.at || reduced()) return;
  resolve(step); here.fromArray(window.oceanDiagnostics.playerPosition);
  leg.length = 0; leg.push(...planGuidedRoute(here.toArray(), goal, { floor: terrainHeightAt, clear, clearance: Math.max(1.5, api.settings?.floorClearance ?? 1.5) }));
  if (leg.length) { api.guide(true, true, true); api.travelPath(leg, null, DRIFT); inputs = api.nav.inputs; }
}
function endPrelude() { prelude = -1; delete document.body.dataset.prelude; controls()?.frameDiver?.(false); }
function handOver() { note('tour_taken_over'); endSight(); controls()?.tether?.(null); status = 'free'; paused = false; cut = null; fade.dataset.on = 'false'; controls()?.guide(false); paint(); }
// Rejoin takes up the step the tour was on, through the scenic waypoints still ahead of wherever the visitor swam to. It used
// to take the nearest step left, which, with the ending beside the wreck, could skip the treasure altogether.
function rejoin() {
  if (status !== 'free') return;
  note('tour_rejoined'); go(Math.min(Math.max(1, arrived + 1), STEPS.length - 1));
}
// how: why it ended, for the funnel (exit, explore, surface, swam_off, surfaced, failed, or stopped from elsewhere).
function stop(message, how = 'stopped') {
  if (status === 'off') return;
  note('tour_ended', { how });
  endSight(); const api = controls(); status = 'off'; paused = false; cut = null; fade.dataset.on = 'false'; reveal = 0; endPrelude(); roaming = starting = false;
  // Let go of the view too, so it does not stay on the last subject the tour showed.
  if (api) { api.guide(false); api.cancelTravel(); api.lookAt?.(null); api.tether?.(null); }
  paint();
  if (message) say('Guided dive', message, HOLD_SIGNAL, 3200);
}
export function startTour() {
  const api = controls();
  if (!api || !window.oceanDiagnostics?.ready || status !== 'off') return false;
  if (api.getMode() !== 'surface' && api.getMode() !== 'diver') return false;
  // From the surface the opening plays first; under water the tour starts where the diver is.
  // The ocean starts on what the dive will wait for now, not when the prelude ends 1.6 s from here (world.js expectDive).
  if (api.getMode() === 'surface') { prelude = 0; document.body.dataset.prelude = 'on'; api.expectDive?.(); }
  track('tour_started', { from: prelude === 0 ? 'surface' : 'underwater', tour_version: VERSION });
  status = 'starting'; index = 0; arrived = -1; waited = 0; paused = false; titled = -1; used.clear(); spottedAt.clear(); seen = null; cheer = null; cheerFor = 0; paint();
  return true;
}
export const tourStatus = () => status;
// Swimming and scenic time only. Reading at the welcome and the sites has no countdown or automatic advance: the
// visitor chooses Continue after reading as much as they want.
export const DIVE_IN = 4.2;
export function tourPlan() {
  let distance = 0, seconds = DIVE_IN; const point = [0, 0, 0], subject = [0, 0, 0]; let last = [0, -6, -2];
  for (const item of STEPS) {
    if (item.kind === 'intro') continue;
    resolve(item, point, subject);
    for (const next of [...(item.via || []).map(pointOf), point]) { const d = from.fromArray(last).distanceTo(to.fromArray(next)); distance += d; seconds += d / (item.speed ?? SPEED); last = [...next]; }
    // A fly-by slows the swim for its hold: the time it costs over swimming that stretch at the cruise.
    for (const sight of flyBys(item)) seconds += (sight.hold ?? FLYBY) * (1 - (sight.slow ?? SLOW));
    seconds += 1.4;
  }
  return { stops: STOPS.length, distance, seconds };
}

function update(dt, api, state, diving) {
  if (stopOnWay) holdStop(api);
  if (status === 'off') return;
  tourTime += dt;
  const mode = api.getMode();
  if (status === 'starting') {
    waited += dt;
    if (prelude >= 0) {
      const before = prelude; prelude += dt;
      if (before < PRELUDE_HOLD && prelude >= PRELUDE_HOLD) api.frameDiver?.(true);
      if (prelude >= PRELUDE_DIVE) { prelude = -1; waited = 0; if (!api.startDive({ capture: false, perspective: 'first' })) stop('The ocean is still getting ready. Try again in a moment.', 'failed'); }
      return;
    }
    // The title card goes up as the camera goes under, so the descent is not a wait with nothing to read.
    if (titled < 0 && state.submerged) { titled = 0; splash('Guided dive', 'Welcome to the reef'); }
    else if (titled >= 0) titled += dt;
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
  if (api.nav.suspended || status === 'free') return;
  const nav = api.nav;
  // In the welcome the visitor may swim anywhere to try the controls and stays on the tour; only Skip or Start leaves it. Swimming
  // off from the overview simply ends the tour; anywhere else it puts the tour on hold.
  if (nav.inputs !== inputs) {
    if (status === 'intro') { roaming = true; idle = 0; inputs = nav.inputs; }
    else { if (status === 'done') stop(null, 'swam_off'); else handOver(); return; }
  }
  if (status === 'intro') {
    introFor += dt;
    if (roaming) { idle = nav.manualInput ? 0 : idle + dt; if (idle > RESUME) { roaming = false; drift(); } }
    if (starting && (assetsIn(state) || introFor > ASSETS_WAIT)) { starting = false; advance(); return; }
  }
  if (cut) { cutTime -= dt; if (cutTime <= 0) { const then = cut; cut = null; then(); fade.dataset.on = 'false'; } return; }
  if (reveal > 0) { reveal -= dt; if (reveal <= 0) paint(); }
  if (cheerFor > 0) { cheerFor -= dt; if (cheerFor <= 0) { cheer = null; paint(); } }
  if (status !== 'travel') { pan(dt); return; }
  // Pause the route itself, rather than only its caption.
  if (paused) return;
  legTime += dt;
  const distance = here.fromArray(state.playerPosition).distanceTo(to.fromArray(goal));
  if (distance < ARRIVE_RADIUS && (!nav.travelling || distance < .6)) { arrive(); return; }
  flyBy(dt, state.playerPosition);
  // A scenic route can initially swim away from its destination. Its remaining
  // path length, rather than straight-line distance, measures forward progress.
  const remaining = Number.isFinite(nav.travelRemaining) ? nav.travelRemaining : distance;
  // A route launched this frame (a detour, or the line through the bait ball) still reads the old route's remaining length
  // until the swim has run a frame on the new one: those readings are not progress, and a longer new route never beat them.
  if (settle > 0) { settle--; best = Infinity; stall = 0; }
  else if (remaining < best - .25) { best = remaining; stall = 0; } else stall += dt;
  if (legTime > 1 && (stall > 5 || !nav.travelling || nav.travelBlocked)) {
    if (detours++ < 2 && route(here.fromArray(state.playerPosition).toArray(), STEPS[index])) { launch(); paint(); }
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
  else if (action === 'surface') surface();
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
  if (prompt && !prompt.hidden) prompt.click();
  else if (window.oceanLandmarks?.openSite) window.oceanLandmarks.openSite(step.landmark, step.opens ?? step.landmark);
  else window.oceanArchive?.open?.(step.opens ?? step.landmark);
}
// The tour's own animals (user-creatures.js: the nurse shark, the whale shark) are in, and drawn, once the optional sets
// have settled: oceanDiagnostics.enriched says so (the loading work), as optionalModels did before it. userCreatures.ready
// alone is too early: the set is loaded, but not yet prepared for drawing.
const assetsIn = state => state.enriched === true || state.optionalModels === undefined || state.optionalModels === 'settled';
function next() {
  if (cut) return;
  // Start waits (ASSETS_WAIT at most) for the animals the tour shows, so none of them comes in late.
  if (status === 'intro' && !assetsIn(window.oceanDiagnostics ?? {}) && introFor < ASSETS_WAIT) { starting = true; paint(); return; }
  if (status === 'intro' || status === 'dwell') { paused = false; advance(); }
  else if (status === 'travel') cutTo(land);
}
// Surface from the ending (its button, or N): the ascent home, and the safety stop held on the way up as it comes due, as on
// a real dive (Esc still skips it).
let stopOnWay = false;
function surface() { stop(null, 'surface'); stopOnWay = Boolean(controls()?.surface()); }
function holdStop(api) {
  if (api.getMode() === 'surface' || !api.nav.returnPhase) { stopOnWay = api.getMode() !== 'surface' && api.nav.mode === 'transition'; return; }
  if (api.nav.returnPhase === 'offer') { stopOnWay = false; window.oceanExpedition?.openStop?.(); }
}
function togglePause() {
  if (status !== 'travel') return;
  paused = !paused;
  if (paused && !cut) { endSight(); controls()?.cancelTravel(); }
  if (!paused && !cut) {
    routeIssue = false; detours = 0; here.fromArray(window.oceanDiagnostics.playerPosition);
    if (!route(here.toArray(), STEPS[index])) { blockRoute(); return; }
    launch();
  }
  paint();
}
addEventListener('keydown', event => {
  if (status === 'off' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
  if (event.code === 'KeyG' && status === 'free') { event.preventDefault(); rejoin(); }
  else if (event.code === 'KeyN' && touring()) { event.preventDefault(); next(); }
  else if (event.code === 'KeyN' && status === 'done') { event.preventDefault(); surface(); }
  else if (event.code === 'KeyP' && status === 'travel') { event.preventDefault(); togglePause(); }
  // F at a site: its stop viewpoint can stand further off than the landmark's own reach (landmark-interactions.js), so
  // when that prompt is not up, the tour opens the site itself, as Read it does.
  else if (event.code === 'KeyF' && status === 'dwell' && STEPS[index].landmark && !document.querySelector('#interact-prompt:not([hidden])')) { event.preventDefault(); read(); }
});
window.oceanTour = { start: startTour, stop, rejoin, next, plan: tourPlan, get status() { return status; }, STEPS, STOPS, get tried() { return [...used]; },
  // The archive asks: At a glance carries the welcome only on the tour (SPEC D6), and a site opens the page its step names.
  get welcome() { return status === 'off' ? null : WELCOME; },
  opens(id) { const step = STEPS[index]; return status !== 'off' && step.landmark === id ? step.opens ?? null : null; } };
