import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createExploration } from '../ocean-refined/exploration.js';
import { defaults } from '../ocean-refined/movement-settings.js';
import { LANDMARKS, terrainHeightAt, createReef } from '../ocean-refined/reef.js';
import { planGuidedRoute } from '../ocean-refined/guided-route.js';
import { distance } from '../ocean-refined/cinematic-route.js';
import * as THREE from '../ocean-refined/vendor/three.module.min.js';
import { CollisionWorld } from '../ocean-refined/collisions.js';

// Only replace the journey UI scheduler; the tour and swimming integrator below
// are the production modules. Every assertion samples the actual player body.
const journey = 'data:text/javascript,' + encodeURIComponent('export const onFrame=fn=>globalThis.tourFrame=fn; export const setQuiet=()=>{}; export const discover=()=>{}; export const say=()=>{}; export const splash=(...a)=>(globalThis.splashes??=[]).push(a);');
// Analytics is replaced by a recorder, and checked against the privacy allowlist the real module applies.
const analytics = 'data:text/javascript,' + encodeURIComponent('export const track=(event,properties)=>(globalThis.tracked??=[]).push([event,properties]);');
registerHooks({ resolve(specifier, context, next) {
  if (specifier === './journey.js' && context.parentURL?.endsWith('/guided-dive.js')) return { url: journey, shortCircuit: true };
  if (specifier === './analytics.js' && context.parentURL?.endsWith('/guided-dive.js')) return { url: analytics, shortCircuit: true };
  return next(specifier, context);
} });
class Element {
  listeners = new Map(); dataset = {}; style = { setProperty() {} }; firstChild = { textContent: '' }; parts = new Map();
  addEventListener(name, fn) { const group = this.listeners.get(name) ?? new Set(); group.add(fn); this.listeners.set(name, group); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  dispatchEvent(event) { for (const fn of this.listeners.get(event.type) ?? []) fn(event); }
  setAttribute() {} focus() {} append() {} replaceChildren() {}
  querySelector(selector) { if (!this.parts.has(selector)) this.parts.set(selector, new Element()); return this.parts.get(selector); }
  querySelectorAll() { return []; }
}
const document = new Element(), window = new Element(), canvas = new Element();
document.body = new Element(); document.documentElement = new Element();
document.getElementById = () => null; document.querySelector = () => null;
document.createElement = () => Object.assign(new Element(), { getContext: () => ({ beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, quadraticCurveTo() {} }) });
canvas.requestPointerLock = () => {}; canvas.setPointerCapture = () => {};
Object.assign(globalThis, { document, window, matchMedia: query => ({ matches: query.includes('reduced-motion') }),
  addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window) });
const { startTour, tourStatus, STOPS, STEPS, tourPlan } = await import('../ocean-refined/guided-dive.js');
const { flyBys, pointOf } = await import('../ocean-refined/guided-script.js');
const { eventProperties } = await import('../ocean-refined/analytics-privacy.js');

function environment(hz, { reducedMotion = false, unavailable = false, collision = null, residents = {}, surface = false } = {}) {
  const settings = { ...defaults, pointerLock: false, idleMotion: 0 };
  const nav = createExploration(canvas, () => {}, settings);
  nav.setTerrain(terrainHeightAt);
  if (collision) nav.setCollisions(collision);
  let placed = 0, transition = false;
  const state = window.oceanDiagnostics = { ready: true, landmarksReady: true, reducedMotion, playerPosition: [0, -8, 0] };
  let atSurface = surface, clock = 0, whaleFrom = null, asked = null; const calls = [];
  if (!surface) nav.startDive();
  // Placed model viewpoints as the live app has them once the models' bounds refine them (read from oceanControls.landmarks):
  // [x, height over the seabed, z] from the charted spot. The wreck's is well north of its hull, the treasure's just north.
  const approach = { about: [5.8, 2.8, 0], experience: [0, 5.4, 17.2], projects: [0, 2.8, 4] };
  const landmarks = LANDMARKS.map(item => { const [x, , z] = item.position, floor = terrainHeightAt(x, z), [dx, up, dz] = approach[item.id];
    return { ...item, position: [x, floor + 1.4, z], interactionPosition: [x + dx, floor + up, z + dz] }; });
  const api = window.oceanControls = {
    nav: nav.state, settings, landmarks, reef: { userData: { collisions: collision } }, getMode: () => atSurface ? 'surface' : nav.state.mode,
    frameDiver: value => calls.push(['frameDiver', value]),
    // A called-in whale shark swims its course at its own pace (user-creature-routes.js: 1.5 m/s), from `ahead` short of its closest approach.
    // The creature set may still be loading when the beat asks: here it can come only two seconds after the first ask.
    encounter: (id, course) => { asked ??= clock; if (clock < asked + 2) return false; calls.push(['encounter', id, course]); whaleFrom = { at: [...(course.from ?? state.playerPosition)], course, clock }; return true; },
    visitors: () => whaleFrom ? [whaleAt(whaleFrom, clock)] : [], startDive: options => { calls.push(['startDive', options]); nav.startDive(); atSurface = false; return true; }, getTransition: () => transition,
    guide: (...args) => nav.setGuided(...args), travelPath: (...args) => unavailable ? false : nav.travelPath(...args),
    cancelTravel: (...args) => nav.cancelTravel(...args), place: (...args) => { placed++; nav.place(...args); }, lookAt: (point, follow) => nav.lookAt(point, follow), residentAt: id => residents[id] ?? null,
    glance: (point, follow) => nav.glance(point, follow), pacing: scale => nav.pacing(scale), guideScooter: on => nav.guideScooter(on), tether: top => nav.tether(top),
    surface: () => { calls.push(['surface']); return true; },
    // The bait ball as living-world.js places it (its home over the spire, 3.6 m across), here off home by its full wander.
    baitBall: () => [50.5, -27.8, -66, 3.6],
  };
  const samples = [];
  function tick(seconds = 1 / hz) {
    for (let i = 0; i < Math.round(seconds * hz); i++) {
      nav.update(1 / hz, true, state.reducedMotion); clock += 1 / hz;
      state.playerPosition = nav.getPlayerPosition().toArray(); samples.push([...state.playerPosition]);
      globalThis.tourFrame(1 / hz, api, state, true);
    }
  }
  return { nav, state, landmarks, samples, tick, calls, get clock() { return clock; }, get whaleFrom() { return whaleFrom; }, set transition(value) { transition = value; }, get placed() { return placed; } };
}

// Where a whale shark on a course is, `clock` seconds on: the same line user-creatures.js begin() lays down.
function whaleAt({ at, course, clock: from }, clock) {
  const dx = Math.sin(course.angle), dz = Math.cos(course.angle), nx = dz * course.side, nz = -dx * course.side, along = -course.ahead + 1.5 * (clock - from);
  return { id: 'whale-shark', x: at[0] + nx * course.pass + dx * along, y: course.y, z: at[2] + nz * course.pass + dz * along };
}

// Past the welcome, which waits for Continue where the dive levels out, onto the first swim.
function toTravel(env) {
  startTour(); env.tick(.5);
  assert.equal(tourStatus(), 'intro', 'the tour opens with the welcome');
  window.oceanTour.next(); env.tick(1);
  assert.equal(tourStatus(), 'travel');
}

// From the surface: only a beat while the copy starts to fade (no second of nothing after the click), the camera's move in
// on the diver, then the dive in first person; under water the title card comes before the welcome sheet.
{
  const env = environment(60, { surface: true });
  globalThis.splashes = [];
  assert.equal(startTour(), true);
  assert.equal(document.body.dataset.prelude, 'on', 'the surface copy steps aside');
  env.tick(.1);
  assert.deepEqual(env.calls, [], 'a short beat first');
  env.tick(.2);
  assert.deepEqual(env.calls, [['frameDiver', true]], 'then, within a third of a second, the camera moves in on the diver');
  env.tick(1.1);
  assert.equal(env.calls.length, 1, 'the dive waits for the move to finish');
  env.tick(.3);
  assert.deepEqual(env.calls[1], ['startDive', { capture: false, perspective: 'first' }], 'and the dive starts in first person');
  env.tick(.2);
  assert.equal(tourStatus(), 'intro');
  assert.equal(document.body.dataset.prelude, undefined, 'the surface copy is back for the dive interface');
  assert.deepEqual(globalThis.splashes, [['Guided dive', 'Welcome to the reef']], 'the title card');
  assert.deepEqual(env.calls.at(-1), ['frameDiver', false]);
  window.oceanTour.stop(); env.nav.destroy();
  console.log('PASS: the opening moves in on the diver at once and dives in first person.');
}

// A solid coral outcrop blocks the first approach. The production planner and
// CollisionWorld must take the body around it, with no endpoint-only assertions.
{
  const collision = new CollisionWorld();
  collision.addBox(new THREE.Box3(new THREE.Vector3(-23, -18, -57), new THREE.Vector3(-17, -6, -53)));
  const env = environment(60, { collision });
  toTravel(env);
  for (let frame = 0; frame < 60 * 100 && tourStatus() !== 'dwell'; frame++) env.tick();
  assert.equal(tourStatus(), 'dwell', 'collision-checked scenic detour arrives');
  assert.equal(env.placed, 0);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 1; i < env.samples.length; i++) {
    assert.ok(collision.segmentClear(a.fromArray(env.samples[i - 1]), b.fromArray(env.samples[i]), .5), 'every actual body step clears the outcrop');
    assert.ok(distance(env.samples[i - 1], env.samples[i]) < 7 / 60);
  }
  window.oceanTour.stop(); env.nav.destroy();
  console.log('PASS: real CollisionWorld outcrop is bypassed continuously.');
}

const key = code => window.dispatchEvent({ type: 'keydown', code, repeat: false, target: { closest: () => null }, preventDefault() {} });
const keyup = code => window.dispatchEvent({ type: 'keyup', code, target: { closest: () => null }, preventDefault() {} });

// The controls: the welcome lays out W A S D, up and down, C and V as key chips and asks for one at a time, ticking each as
// it is done (by what it changed, whatever the input) and moving on, while the guide drifts in toward the reef. Swimming
// about to try them holds the drift and keeps the tour within ROAM (5 m) of where they took over; letting go picks the
// drift up again. The rest come with the fly-bys that use them (the scooter across the reef shelf,
// the lamp under the arch, the camera at the whale shark), and a control already tried is not taught again. N skips the
// controls (toTravel above).
{
  const env = environment(60);
  startTour(); env.tick(.5);
  assert.equal(tourStatus(), 'intro');
  assert.equal(env.state.tour.tip, 'Try it, 1 of 4: Swim with W A S D. The guide picks up again when you let go.');
  env.tick(2);
  const drifted = [...env.state.playerPosition];
  assert.ok(env.nav.state.travelling, 'the welcome drifts in toward the reef');
  key('KeyW'); env.tick(.8); keyup('KeyW'); env.tick(.6);
  const swum = Math.hypot(env.state.playerPosition[0] - drifted[0], env.state.playerPosition[2] - drifted[2]);
  assert.ok(swum > 1.2 && swum < 5, `swum a little (${swum.toFixed(2)} m)`);
  assert.equal(tourStatus(), 'intro', 'swimming about in the welcome keeps the tour');
  assert.ok(window.oceanTour.tried.includes('swim'));
  env.tick(2.2);
  assert.ok(env.nav.state.travelling, 'and the drift picks up again once they let go');
  assert.equal(env.state.tour.tip, 'Try it, 2 of 4: Space to rise, Shift to sink.');
  key('ShiftLeft'); env.tick(1); keyup('ShiftLeft'); env.tick(.6);
  assert.ok(window.oceanTour.tried.includes('updown'), 'sinking counts as up and down');
  env.tick(1);
  assert.equal(env.state.tour.tip, 'Try it, 3 of 4: Press C to open your dive computer.');
  document.body.dataset.computerOpen = 'true'; env.tick(.1); delete document.body.dataset.computerOpen;
  assert.equal(env.state.tour.tip, '✓ Dive computer', 'a control done is ticked'); env.tick(1.3);
  assert.equal(env.state.tour.tip, 'Try it, 4 of 4: Press V to see yourself in third person.');
  env.nav.togglePerspective(); env.tick(1.5);
  assert.equal(env.state.tour.tip, 'That’s the controls. Press N to start the tour.');
  assert.equal(tourStatus(), 'intro', 'trying the controls never hands the dive over, nor starts the tour');
  assert.deepEqual(window.oceanTour.tried.sort(), ['computer', 'swim', 'updown', 'view']);
  // Opening a site counts as F, from wherever it was opened.
  window.oceanTour.next(); env.tick(.5);
  assert.equal(tourStatus(), 'travel', 'Start leads on from wherever the visitor swam to');
  window.oceanArchive = { isOpen: true }; env.tick(.1); window.oceanArchive = { isOpen: false };
  assert.ok(window.oceanTour.tried.includes('interact'));
  // Taught where it is used: the fly-by's caption carries the control once, and drops it once tried.
  const until = (test, seconds = 400) => { for (let frame = 0; frame < 60 * seconds && !test(); frame++) { env.tick(); if (!test() && tourStatus() === 'dwell') window.oceanTour.next(); } assert.ok(test(), JSON.stringify(env.state.tour)); };
  // The scooter: across the reef shelf the swim all but stops and waits for the visitor to try it (up to 7 s). Holding E is
  // trying it, and the fly-by goes on.
  until(() => env.state.tour.sight === 'scooter'); env.tick(2);
  assert.equal(env.state.tour.flyTip, 'Hold E for your scooter: the guide speeds up with you.');
  assert.ok(env.nav.state.velocity.length() < 1, `the swim waits (${env.nav.state.velocity.length().toFixed(2)} m/s)`);
  assert.ok(!env.nav.state.guideScooter, 'the guide does not run it while it waits for the visitor');
  key('KeyE'); env.tick(.6); keyup('KeyE'); env.tick(.1);
  assert.equal(env.state.tour.flyTip, '', 'gone once used');
  assert.equal(tourStatus(), 'travel', 'the scooter speeds the guide, it does not take over');
  env.tick(2.5);
  assert.notEqual(env.state.tour.sight, 'scooter', 'and once tried, the fly-by goes on');
  // The lamp under the arch, the camera as the whale shark passes; the computer at the treasure was tried in the welcome.
  until(() => env.state.tour.sight === 'arch');
  assert.equal(env.state.tour.flyTip, 'It’s dark under the arch. Press Q for your lamp.');
  until(() => env.state.tour.key === 'projects' && tourStatus() === 'dwell');
  assert.equal(env.state.tour.tip, '', 'the computer was tried in the welcome');
  until(() => env.state.tour.sight === 'whale-shark');
  assert.equal(env.state.tour.flyTip, 'Press H to take a photo of it.');
  window.oceanExpedition = { photos: 1 }; env.tick(.1);
  assert.equal(env.state.tour.flyTip, '', 'a tried control is not taught again');
  window.oceanTour.stop(); env.nav.destroy(); delete window.oceanExpedition; delete window.oceanArchive;
  console.log('PASS: the welcome asks for each control in turn and ticks it; the guide shows the scooter; tips come with their fly-bys, once.');
}

// In the welcome the visitor may swim anywhere and stays on the tour: only Skip (or Start) leaves it.
{
  const env = environment(60);
  startTour(); env.tick(.5);
  const from = [...env.state.playerPosition];
  key('KeyW'); env.tick(8); keyup('KeyW'); env.tick(.5);
  const swum = Math.hypot(...env.state.playerPosition.map((v, i) => v - from[i]));
  assert.equal(tourStatus(), 'intro', 'swimming far keeps the welcome');
  assert.ok(swum > 15, `swum well away (${swum.toFixed(1)} m)`);
  window.oceanTour.next(); env.tick(.5);
  assert.equal(tourStatus(), 'travel', 'and Skip leads on from wherever they are');
  window.oceanTour.stop(); env.nav.destroy();
  console.log(`PASS: the welcome lets the visitor swim anywhere (${swum.toFixed(0)} m) and stays on the tour.`);
}

// Start waits for the tour's animals: while the creature set loads it says so, then leads on as soon as it is in.
{
  const env = environment(60);
  startTour(); env.tick(.5);
  env.state.optionalModels = 'loading';
  window.oceanTour.next(); env.tick(1);
  assert.equal(tourStatus(), 'intro', 'Start waits for the animals');
  assert.equal(env.state.tour.tip, 'Getting the reef ready…');
  env.state.optionalModels = 'settled'; env.tick(.5);
  assert.equal(tourStatus(), 'travel', 'and leads on once they are in');
  window.oceanTour.stop(); env.nav.destroy();
  const slow = environment(60);
  startTour(); slow.tick(.5);
  slow.state.optionalModels = 'loading';
  window.oceanTour.next();
  for (let frame = 0; frame < 60 * 25 && tourStatus() === 'intro'; frame++) slow.tick();
  assert.equal(tourStatus(), 'travel', 'never longer than ASSETS_WAIT');
  assert.ok(slow.clock < 21.5, `led on after ${slow.clock.toFixed(1)} s`);
  window.oceanTour.stop(); slow.nav.destroy();
  console.log('PASS: Start waits for the creature set, at most 20 s.');
}

// Build the production procedural reef and its collision geometry. Only the
// decorative canvas texture is stubbed; navigation uses the real solid reef.
const reefCollision = createReef({ economy: true }).userData.collisions;
// The wreck as the live app places it, masts and sails included, and the sentinel barracuda's beat (user-creature-routes.js:
// an oval 7 x 4.5 m round the wreck's live position plus [9, 7, 4]): the nearest a point comes to either.
const WRECK = { min: [11.4, -26, -43.6], max: [24.6, -16.4, -34.4] };
const beat = p => { let nearest = Infinity; for (let k = 0; k < 64; k++) { const a = k / 64 * Math.PI * 2; nearest = Math.min(nearest, Math.hypot(p[0] - 27 - Math.cos(a) * 7, p[1] + 14.2, p[2] + 35 - Math.sin(a) * 4.5)); } return nearest; };
for (const hz of [30, 60, 120]) {
  // The nurse shark settles on level sand behind the anchor in the app; a stand-in spot there exercises the framing.
  const sleeper = [-17, terrainHeightAt(-17, -19) + .45, -19];
  const env = environment(hz, { collision: reefCollision, residents: { sleeper } });
  env.transition = true;
  assert.equal(startTour(), true);
  env.tick(1);
  assert.equal(tourStatus(), 'starting', 'entry animation cannot overwrite the route');
  env.transition = false; env.state.landmarksReady = false; env.tick(.5);
  assert.equal(tourStatus(), 'starting', 'wait for final landmark viewpoints');
  env.state.landmarksReady = true; env.tick(.1);
  assert.equal(tourStatus(), 'intro');
  assert.equal(window.oceanTour.welcome !== null, true, 'At a glance carries the welcome while the tour is on');
  const yaw0 = env.nav.state.yaw; let swing = 0;
  for (let t = 0; t < 12; t += .25) { env.tick(.25); swing = Math.max(swing, Math.abs(Math.atan2(Math.sin(env.nav.state.yaw - yaw0), Math.cos(env.nav.state.yaw - yaw0)))); }
  assert.equal(tourStatus(), 'intro', 'the welcome has no automatic advance');
  assert.ok(swing > .8, `the welcome looks around the reef (${swing.toFixed(2)} rad)`);
  window.oceanTour.next();
  let totalDistance = 0, maxStep = 0, moving = 0;
  const aimAt = point => { const at = env.state.playerPosition, s = env.nav.state, aim = [-Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch)];
    const to = point.map((v, k) => v - at[k]); return Math.acos(Math.max(-1, Math.min(1, aim.reduce((sum, v, k) => sum + v * to[k], 0) / Math.hypot(...to)))); };
  for (let i = 1; i < STEPS.length; i++) {
    const step = STEPS[i], before = env.samples.length, shown = new Map();
    assert.equal(tourStatus(), 'travel', `${step.key}: swims there`);
    for (let frame = 0; frame < hz * 160 && tourStatus() === 'travel'; frame++) {
      env.tick();
      // Each fly-by: how long it lasts, how slow the swim gets and how near the view comes to its subject.
      const key = env.state.tour.sight; if (!key) continue;
      const sight = flyBys(step).find(item => item.key === key), record = shown.get(key) ?? { frames: 0, slowest: Infinity, nearest: Infinity, scooter: 0 };
      record.frames++; shown.set(key, record);
      if (record.frames > hz * 1.5) record.slowest = Math.min(record.slowest, env.nav.state.velocity.length());
      if (record.frames > hz * 1.5) record.scooter = Math.max(record.scooter, env.nav.state.scooter);
      const subject = sight.look?.visitor ? (env.whaleFrom && [whaleAt(env.whaleFrom, env.clock)].map(w => [w.x, w.y, w.z])[0]) : sight.look?.resident === 'sleeper' ? sleeper : sight.look?.resident ? sight.look.near : sight.look?.bait ? [50.5, -27.8, -66] : sight.look;
      if (subject && record.frames > hz * 2.5) record.nearest = Math.min(record.nearest, aimAt(subject));
    }
    const leg = env.samples.slice(before);
    moving += leg.length / hz;
    assert.equal(tourStatus(), { stop: 'dwell', end: 'done' }[step.kind], `${step.key} arrived at ${hz} Hz: ${JSON.stringify(env.state.tour)}`);
    const target = env.state.tour.goal;
    assert.ok(distance(env.state.playerPosition, target) < 1.6, `${step.key}: arrival reflects the body position`);
    assert.ok(leg.length > hz, 'the swim lasts across many frames');
    // Every fly-by on the leg shows once, for its hold, and turns the view to its subject while the swim carries on.
    assert.deepEqual([...shown.keys()], flyBys(step).map(item => item.key), `${step.key}: every fly-by, in order`);
    for (const sight of flyBys(step)) {
      const record = shown.get(sight.key), hold = (sight.hold ?? 5) + (sight.wait ? 7 : 0);
      // Its hold, or cut short once the next is in reach: never under BRIEF (2.5 s).
      assert.ok(record.frames / hz > 2.45 && record.frames / hz < hold + .1, `${sight.key}: lasts up to ${hold} s (${(record.frames / hz).toFixed(2)})`);
      if (sight.look && record.frames / hz > 3.5) assert.ok(record.nearest < .2, `${sight.key}: the view turns to it (${record.nearest.toFixed(3)} rad off at nearest)`);
      if (!sight.scooter) assert.ok(record.slowest < 3.6 * (sight.slow ?? .5) + .4, `${sight.key}: the swim slows (${record.slowest.toFixed(2)} m/s)`);
      assert.equal(record.scooter > .5, Boolean(sight.scooter), `${sight.key}: the scooter runs only where the guide shows it`);
    }
    // The leg to the treasure swims through the arch itself, under its roof (reef.js: arch at 20, -72, roof 9.6 m over its floor).
    if (step.key === 'projects') {
      const roof = terrainHeightAt(20, -72) + 9.6 - .6, under = leg.filter(p => Math.abs(p[2] + 72) < 1.5 && Math.abs(p[0] - 20) < 10);
      assert.ok(under.length && under.every(p => Math.abs(p[0] - 20) < 3.5 && p[1] < roof), `through the arch, under its roof (${JSON.stringify(under[0])})`);
    }
    // The way up ends in open water just seaward of the wreck, well above the seabed, with the reef rising to the north.
    // Through the middle of the bait ball where it has wandered to, not past its edge.
    if (step.key === 'experience') {
      const middle = Math.min(...leg.map(p => distance(p, [50.5, -27.8, -66])));
      assert.ok(middle < 1.5, `straight through the bait ball (${middle.toFixed(2)} m from its middle)`);
    }
    // A stop is come in to on the line from its subject: the last stretch heads at it, with no swing round to face it.
    if (step.kind === 'stop') {
      const tail = leg.slice(-Math.round(hz * 2.5)), [a, b] = [tail[0], tail.at(-1)], subject = env.landmarks.find(item => item.id === step.landmark).position;
      const heading = Math.atan2(b[0] - a[0], b[2] - a[2]), facing = Math.atan2(subject[0] - b[0], subject[2] - b[2]);
      const off = Math.abs(Math.atan2(Math.sin(heading - facing), Math.cos(heading - facing)));
      assert.ok(off < .5, `${step.key}: comes in facing it (${off.toFixed(2)} rad off over the last 2.5 s)`);
    }
    if (step.key === 'open-water') {
      const [x, y, z] = env.state.playerPosition;
      assert.ok(y - terrainHeightAt(x, z) > 20 && z < WRECK.max[2] - 8, `in open water seaward of the wreck (${env.state.playerPosition.map(v => v.toFixed(1))})`);
    }
    // No leg swims through the wreck (its masts and sails have no collision volume) or crowds the barracuda off it.
    const wreck = Math.min(...leg.map(p => Math.hypot(...[0, 1, 2].map(k => Math.max(WRECK.min[k] - p[k], 0, p[k] - WRECK.max[k]))))), cuda = Math.min(...leg.map(beat));
    assert.ok(wreck > 2 && cuda > 8, `${step.key}: clear of the wreck (${wreck.toFixed(1)} m) and the barracuda's beat (${cuda.toFixed(1)} m)`);
    for (let j = 1; j < leg.length; j++) { const d = distance(leg[j - 1], leg[j]); maxStep = Math.max(maxStep, d); totalDistance += d; }
    if (step.kind === 'stop') {
      assert.equal(window.oceanTour.opens(step.landmark), step.opens ?? null, `${step.key}: Read it opens ${step.opens ?? 'its own section'}`);
      const settled = env.state.playerPosition; env.tick(8);
      assert.equal(tourStatus(), 'dwell', 'reading has no automatic advance');
      assert.ok(distance(settled, env.state.playerPosition) < 1.7, 'the diver settles at the stop');
      window.oceanTour.next();
    }
  }
  assert.equal(tourStatus(), 'done', 'the tour ends in open water');
  // The whale shark is called in at the deep beat, on a course that stays over open water (SPEC D4): along its whole
  // line across the reef the seabed is deep, and it swims well clear of it.
  const called = env.calls.filter(call => call[0] === 'encounter');
  assert.deepEqual(called.map(call => call[1]), ['whale-shark'], 'one guaranteed whale shark, even when it was not ready at first');
  // Side-on, not overhead: from the drift, its line rises no steeper than 30°.
  { const { course, at } = env.whaleFrom; assert.ok((course.y - at[1]) / course.pass < Math.tan(Math.PI / 6), `the whale shark passes side-on (${course.y - at[1]} m up, ${course.pass} m out)`); }
  for (let x = -62; x <= 62; x += 2) {
    const { course, at } = env.whaleFrom, along = (x - at[0]) / Math.sin(course.angle), z = at[2] - Math.sin(course.angle) * course.side * course.pass + Math.cos(course.angle) * along;
    assert.ok(terrainHeightAt(x, z) < -38 && course.y - terrainHeightAt(x, z) > 10, `open water under the whale shark at x ${x} (seabed ${terrainHeightAt(x, z).toFixed(1)})`);
  }
  assert.equal(env.placed, 0, 'full-motion tour never places the player, even when OS reduced motion is enabled');
  assert.ok(maxStep < 7 / hz, `bounded continuous body steps (${maxStep})`);
  assert.ok(totalDistance > 250, `the player crossed the whole reef (${totalDistance})`);
  // Round 6: the far side of the reef and more of its life, about three minutes of motion (SPEC: timing budget); the
  // welcome's drift and the reading are on top, at the visitor's pace.
  assert.ok(moving > 140 && moving < 260, `a full dive's pace (${moving.toFixed(0)} s of motion)`);
  const plan = tourPlan();
  assert.ok(Math.abs(plan.seconds - moving) < 40, `the planner's estimate is close (${plan.seconds.toFixed(0)} s planned)`);
  // Swimming off from the ending simply ends the tour.
  key('KeyW'); env.tick(.2); keyup('KeyW');
  assert.equal(tourStatus(), 'off');
  assert.equal(window.oceanTour.welcome, null, 'the welcome is only for the tour');
  env.nav.destroy();
  console.log(`PASS: ${hz} Hz, ${STEPS.length - 1} real swims, ${STEPS.flatMap(flyBys).length} fly-bys, ${totalDistance.toFixed(1)} m, ${moving.toFixed(0)} s of motion, maximum step ${maxStep.toFixed(3)} m.`);
}

// A rejected path holds the player rather than triggering the old timed cut.
{
  const env = environment(60);
  toTravel(env);
  key('KeyP'); env.tick(2);
  assert.equal(env.state.tour.paused, true);
  const hold = [...env.state.playerPosition]; env.tick(2);
  assert.ok(distance(hold, env.state.playerPosition) < .01, 'Pause holds after the existing velocity eases out');
  key('KeyP'); env.tick(1);
  assert.equal(env.state.tour.paused, false);
  assert.ok(distance(hold, env.state.playerPosition) > 1, 'Resume restarts the swim from the body position');
  key('KeyW'); env.tick(.2);
  assert.equal(tourStatus(), 'free', 'deliberate movement takes back the controls');
  assert.equal(env.placed, 0);
  window.oceanTour.stop(); env.nav.destroy();
}
{
  const env = environment(60, { unavailable: true });
  startTour(); env.tick(.5); window.oceanTour.next(); env.tick(1); const held = [...env.state.playerPosition]; env.tick(9);
  assert.equal(tourStatus(), 'travel'); assert.equal(env.state.tour.routeIssue, true);
  assert.equal(env.state.tour.paused, true); assert.equal(env.placed, 0);
  assert.ok(distance(env.state.playerPosition, held) < .01, 'the diver holds where the route was refused');
  // An explicit Skip remains available for an unreachable route.
  window.oceanTour.next(); env.tick(1);
  assert.equal(tourStatus(), 'dwell'); assert.equal(env.placed, 1);
  window.oceanTour.stop(); env.nav.destroy();
}
{
  const env = environment(60, { reducedMotion: true });
  startTour(); env.tick(.5); window.oceanTour.next(); env.tick(1);
  assert.equal(tourStatus(), 'dwell'); assert.equal(env.placed, 1, 'effective reduced motion uses the deliberate fade');
  window.oceanTour.stop(); env.nav.destroy();
}
{
  const env = environment(60);
  startTour(); env.tick(.1); window.oceanTour.next(); env.tick(.1); window.oceanTour.next();
  key('KeyW'); env.tick(1);
  assert.equal(tourStatus(), 'free', 'manual takeover also cancels an explicit skip fade');
  assert.equal(env.placed, 0, 'the pending placement cannot overrule manual control');
  window.oceanTour.stop(); env.nav.destroy();
}
// Free look: under the guide the visitor's look is theirs and the course is the guide's.
{
  const run = looking => {
    const env = environment(60);
    toTravel(env);
    assert.equal(env.nav.state.freeLook, true, 'the tour guides with free look');
    let turned = 0;
    for (let frame = 0; frame < 60 * 100 && tourStatus() !== 'dwell'; frame++) {
      if (looking && frame % 20 === 0) window.oceanInput.aim(frame % 40 ? 160 : -90, frame % 60 ? 25 : -40);
      env.tick();
      if (looking) turned = Math.max(turned, Math.abs(Math.atan2(Math.sin(env.nav.state.yaw - env.nav.state.bodyYaw), Math.cos(env.nav.state.yaw - env.nav.state.bodyYaw))));
    }
    assert.equal(tourStatus(), 'dwell', `the swim arrives ${looking ? 'while the visitor looks around' : 'untouched'}`);
    return { env, samples: env.samples.slice(), turned };
  };
  const still = run(false); window.oceanTour.stop(); still.env.nav.destroy();
  const looked = run(true);
  assert.equal(looked.env.nav.state.inputs, 0, 'looking never hands the dive over');
  assert.ok(looked.turned > .5, `the view really turned away from the body (${looked.turned.toFixed(2)} rad)`);
  assert.equal(looked.samples.length, still.samples.length, 'looking does not change how long the swim takes');
  const drift = Math.max(...looked.samples.map((p, i) => distance(p, still.samples[i])));
  assert.ok(drift < 1e-6, `looking does not change the course (${drift})`);
  // At the stop the guide's look comes back to the subject once the visitor has let go for LOOK_HOLD.
  const env = looked.env;
  window.oceanInput.aim(400, 0); env.tick(.2);
  const away = env.nav.state.yaw; env.tick(1);
  assert.ok(Math.abs(env.nav.state.yaw - away) < .05, 'the visitor\'s look holds for a moment');
  // The hold, then an eased sweep back of up to PAN_MAX seconds.
  env.tick(8.5);
  const subject = env.landmarks.find(item => item.id === STOPS[0].landmark).position, at = env.state.playerPosition;
  const facing = Math.atan2(-(subject[0] - at[0]), -(subject[2] - at[2]));
  assert.ok(Math.abs(Math.atan2(Math.sin(env.nav.state.yaw - facing), Math.cos(env.nav.state.yaw - facing))) < .15, 'then the view drifts back to the subject');
  // The arrow keys look; a swim key takes over and the body turns back onto the view.
  window.oceanTour.next(); env.tick(1.5);
  assert.equal(tourStatus(), 'travel');
  key('ArrowLeft'); env.tick(.6); keyup('ArrowLeft');
  assert.equal(tourStatus(), 'travel', 'an arrow key only looks');
  key('KeyD'); env.tick(.2); keyup('KeyD');
  assert.equal(tourStatus(), 'free', 'a swim key takes over');
  assert.equal(env.nav.state.freeLook, false);
  env.tick(3);
  assert.ok(Math.abs(Math.atan2(Math.sin(env.nav.state.yaw - env.nav.state.bodyYaw), Math.cos(env.nav.state.yaw - env.nav.state.bodyYaw))) < .02, 'the body settles back onto the view');
  window.oceanTour.stop(); env.nav.destroy();
  // On a phone, a drag on the water only looks and the thumb-stick takes over.
  const phone = environment(60);
  toTravel(phone);
  for (let i = 0; i < 10; i++) { window.oceanInput.aim(30, 6); phone.tick(.05); }
  assert.equal(tourStatus(), 'travel', 'a drag on the water only looks');
  window.oceanInput.axis(0, 1); phone.tick(.2); window.oceanInput.axis(0, 0);
  assert.equal(tourStatus(), 'free', 'the thumb-stick takes over');
  window.oceanTour.stop(); phone.nav.destroy();
  console.log(`PASS: free look turned the view ${looked.turned.toFixed(2)} rad with no change to the guided course; hold, drift back, arrows and takeover.`);
}
// A guided pan eases in and out: it starts slowly, is fastest about midway and comes slowly to rest.
{
  const env = environment(120);
  toTravel(env);
  for (let frame = 0; frame < 120 * 100 && tourStatus() !== 'dwell'; frame++) env.tick();
  env.tick(6);
  const at = env.state.playerPosition, start = env.nav.state.yaw, side = start + Math.PI / 2;
  window.oceanControls.lookAt([at[0] - Math.sin(side) * 10, at[1], at[2] - Math.cos(side) * 10]);
  const rates = []; let last = start;
  for (let i = 0; i < 120 * 6; i++) { env.tick(1 / 120); const yaw = env.nav.state.yaw; rates.push(Math.abs(Math.atan2(Math.sin(yaw - last), Math.cos(yaw - last))) * 120); last = yaw; }
  const moving = rates.findLastIndex(rate => rate > 1e-3) + 1, peak = Math.max(...rates), at10 = rates[Math.round(moving * .1)], at90 = rates[Math.round(moving * .9)];
  const peakAt = rates.indexOf(peak) / moving;
  assert.ok(moving / 120 > 2.5 && moving / 120 < 5.6, `a quarter turn takes a few seconds (${(moving / 120).toFixed(2)} s)`);
  assert.ok(at10 < peak * .4 && at90 < peak * .4, `slow at both ends (${at10.toFixed(2)}, ${at90.toFixed(2)} of ${peak.toFixed(2)} rad/s)`);
  assert.ok(peakAt > .35 && peakAt < .65, `fastest about midway (${peakAt.toFixed(2)})`);
  const final = Math.atan2(Math.sin(env.nav.state.yaw - side), Math.cos(env.nav.state.yaw - side));
  assert.ok(Math.abs(final) < .02, 'and it arrives on the subject');
  window.oceanTour.stop(); env.nav.destroy();
  console.log(`PASS: eased pan, ${(moving / 120).toFixed(1)} s for a quarter turn, fastest at ${Math.round(peakAt * 100)}%.`);
}
// Reduced motion: every leg is a fade, the camera never pans by itself and there are no fly-bys (the whale shark among
// them: big-life.js still brings a big animal by on every dive), and the tour still runs start to finish on Continue
// alone. The analytics funnel records each step and how the tour ended, in fields the privacy allowlist keeps.
{
  globalThis.tracked = [];
  const env = environment(60, { reducedMotion: true });
  let looked = 0, glanced = 0; const lookAt = window.oceanControls.lookAt, glance = window.oceanControls.glance;
  window.oceanControls.lookAt = (...args) => { looked++; return lookAt(...args); };
  window.oceanControls.glance = (point, ...args) => { if (point) glanced++; return glance(point, ...args); };
  startTour(); env.tick(.5);
  for (let i = 0; i < 200 && tourStatus() !== 'done'; i++) { env.tick(.5); assert.equal(env.state.tour.sight, null, 'no fly-bys'); if (tourStatus() !== 'done') window.oceanTour.next(); }
  assert.equal(tourStatus(), 'done', 'the whole tour on Continue alone');
  assert.equal(env.placed, STEPS.length - 1, 'every leg is a fade');
  assert.equal(looked + glanced, 0, 'no pans or glances of its own');
  assert.ok(!env.calls.some(call => call[0] === 'encounter'), 'the tour calls no animal in');
  key('KeyW'); env.tick(.2); keyup('KeyW');
  const steps = tracked.filter(([event]) => event === 'tour_step').map(([, p]) => p.index);
  assert.deepEqual(steps, STEPS.map((step, i) => i), 'a tour_step for every step, in order');
  assert.deepEqual(tracked[0], ['tour_started', { from: 'underwater', tour_version: 7 }]);
  assert.deepEqual(tracked.at(-1), ['tour_ended', { step: 'open-water', index: STEPS.length - 1, how: 'swam_off', tour_version: 7 }]);
  for (const [event, properties] of tracked) assert.deepEqual(eventProperties(event, properties), properties, `${event} passes the privacy allowlist whole`);
  env.nav.destroy();
  console.log(`PASS: reduced motion runs the tour on fades with no pans; ${tracked.length} analytics events, all allowed.`);
}

// The look-there marker: on screen it rings the animal; behind or off to the side it points the short way round.
{
  const { pointAt } = await import('../ocean-refined/look-indicator.js');
  Object.assign(globalThis, { innerWidth: 1280, innerHeight: 800 });
  const camera = new THREE.PerspectiveCamera(60, 1.6, .1, 500); camera.position.set(0, -20, 0); camera.lookAt(0, -20, -10); camera.updateMatrixWorld(true);
  assert.equal(pointAt(camera, [2, -18, -30], 'Whale shark · above'), true, 'ahead: on screen');
  assert.equal(pointAt(camera, [0, -20, 30], 'Whale shark'), false, 'behind: an arrow at the edge');
  assert.equal(pointAt(camera, [40, -20, -2], 'Whale shark'), false, 'far to the side: an arrow at the edge');
  assert.equal(pointAt(camera, null), false, 'and it hides');
  console.log('PASS: the look-there marker rings what is in view and points the way to what is not.');
}
// The actual planned open-water body route bows across the view, and an
// impenetrable collision world never yields a successful route.
const bow = planGuidedRoute([0, -10, 0], [30, -10, 0], { floor: () => -30, clear: () => true });
assert.ok(Math.max(...bow.map(point => Math.abs(point[2]))) > 3, 'a visible gentle curve');
assert.deepEqual(planGuidedRoute([0, -10, 0], [30, -10, 0], { floor: () => -30, clear: () => false }), []);
// A scenic route with one waypoint walled in keeps the rest: the stretches round it are planned on their own and the
// waypoint is left out, rather than the whole route falling back to a straight line.
{
  const wall = new CollisionWorld();
  wall.addBox(new THREE.Box3(new THREE.Vector3(18, -14, -4), new THREE.Vector3(22, -6, 4)));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), clear = (p, q) => wall.segmentClear(a.fromArray(p), b.fromArray(q), .85);
  const route = planGuidedRoute([0, -10, 0], [40, -10, 0], { via: [[10, -10, 12], [20, -10, 0], [30, -10, -12]], floor: () => -30, clear });
  const near = point => Math.min(...route.map(p => distance(p, point)));
  assert.ok(route.length && distance(route.at(-1), [40, -10, 0]) < .01, 'still reaches the goal');
  assert.ok(near([10, -10, 12]) < .5 && near([30, -10, -12]) < .5, `through the reachable waypoints (${near([10, -10, 12]).toFixed(2)}, ${near([30, -10, -12]).toFixed(2)})`);
  for (let i = 1; i < route.length; i++) assert.ok(clear(route[i - 1], route[i]), 'every stretch clear of the wall');
}
console.log('PASS: rejected routes hold, explicit Skip and reduced motion fade, scenic curve checked, a walled-in waypoint is left out.');

// On a phone the computer and the view are in the menu, not on the deck: the welcome asks only for the stick and rising and
// sinking, and no later beat teaches either of the two.
{
  document.documentElement.dataset.input = 'touch';
  const env = environment(60);
  startTour(); env.tick(.5);
  assert.equal(env.state.tour.tip, 'Try it, 1 of 2: Swim with the stick. The guide picks up again when you let go.');
  window.oceanTour.next(); env.tick(.5);
  for (let i = 0; i < 60 * 400 && !(env.state.tour.key === 'projects' && tourStatus() === 'dwell'); i++) { env.tick(); if (tourStatus() === 'dwell') window.oceanTour.next(); }
  assert.equal(env.state.tour.tip, '', 'no computer tip at the treasure on a phone');
  window.oceanTour.stop(); env.nav.destroy(); delete document.documentElement.dataset.input;
  console.log('PASS: on a phone the welcome asks for what the deck has, and the menu-only controls are not taught.');
}

// In the welcome, rising stops 3.5 m under the surface: it cannot carry the visitor out of it and up to the surface.
// Leaving the welcome lets the ceiling go.
{
  const env = environment(60);
  startTour(); env.tick(.5);
  const from = env.state.playerPosition[1];
  key('Space'); env.tick(6); keyup('Space'); env.tick(1);
  const rose = env.state.playerPosition[1] - from, top = env.state.playerPosition[1];
  assert.equal(tourStatus(), 'intro', 'still in the welcome');
  assert.ok(top > -4.3 && top < -3.2, `rose to the welcome's ceiling and no further (${top.toFixed(2)} m)`);
  window.oceanTour.next(); env.tick(.5); window.oceanTour.stop();
  key('Space'); env.tick(3); keyup('Space'); env.tick(.5);
  assert.ok(env.state.playerPosition[1] > top + 1, 'with the tour over, rising is the visitor’s own again');
  env.nav.destroy();
  console.log(`PASS: the welcome holds rising at ${top.toFixed(1)} m; the ceiling goes with it.`);
}

// Under way, the visitor's own look holds for a moment once they let go, then the view eases back onto where the guide is
// looking: slowly away, fastest midway, slowly onto it, not a snap or a chase. It ends where a visitor who never looked
// would be looking.
{
  const run = looking => {
    const env = environment(120); toTravel(env);
    for (let i = 0; i < 120 * 120 && tourStatus() !== 'dwell'; i++) env.tick();
    // A calm stretch, between the tower's fly-by and the cathedral's, where the guide's own view is not turning to a subject.
    window.oceanTour.next();
    for (let i = 0; i < 120 * 120 && env.state.tour.sight !== 'tower'; i++) env.tick();
    for (let i = 0; i < 120 * 30 && env.state.tour.sight === 'tower'; i++) env.tick();
    env.tick(.3);
    if (looking) window.oceanInput.aim(500, 0);
    env.tick(.1);
    const away = env.nav.state.yaw; env.tick(1.2);
    const held = Math.abs(env.nav.state.yaw - away), rates = []; let last = env.nav.state.yaw;
    for (let i = 0; i < 120 * 4.5; i++) { env.tick(1 / 120); const yaw = env.nav.state.yaw; rates.push(Math.abs(Math.atan2(Math.sin(yaw - last), Math.cos(yaw - last))) * 120); last = yaw; }
    const yaw = env.nav.state.yaw; window.oceanTour.stop(); env.nav.destroy();
    return { held, rates, yaw };
  };
  const looked = run(true), still = run(false);
  assert.ok(looked.held < .02, 'the visitor’s look holds while they may still be using it');
  const { rates } = looked, moving = rates.findLastIndex(rate => rate > .05) + 1, peak = Math.max(...rates.slice(0, moving)), peakAt = rates.indexOf(peak) / moving;
  assert.ok(rates[2] < peak * .4, `it eases away (${rates[2].toFixed(2)} of ${peak.toFixed(2)} rad/s)`);
  assert.ok(peakAt > .2 && peakAt < .8, `fastest partway through the turn back (${peakAt.toFixed(2)})`);
  const off = Math.abs(Math.atan2(Math.sin(looked.yaw - still.yaw), Math.cos(looked.yaw - still.yaw)));
  assert.ok(off < .1, `and it ends where the guide is looking (${off.toFixed(3)} rad off)`);
  console.log(`PASS: under way, the view holds, then eases back in ${(moving / 120).toFixed(1)} s, fastest at ${Math.round(peakAt * 100)}%.`);
}

// From one fly-by's subject to the next the view makes one eased pan: it turns one way only (no swing back to the way ahead
// and out again), slowly away, fastest partway, slowly onto the new subject.
{
  const env = environment(120);
  toTravel(env); env.tick(1);
  const at = env.state.playerPosition, ahead = env.nav.state.yaw, side = ahead + 1.2;
  const point = yaw => [at[0] - Math.sin(yaw) * 20, at[1], at[2] - Math.cos(yaw) * 20];
  window.oceanControls.glance(point(ahead - .6)); env.tick(3);
  const yaws = []; window.oceanControls.glance(point(side));
  for (let i = 0; i < 120 * 4; i++) { env.tick(1 / 120); yaws.push(env.nav.state.yaw); }
  const steps = yaws.slice(1).map((v, i) => Math.atan2(Math.sin(v - yaws[i]), Math.cos(v - yaws[i])));
  const turning = Math.sign(steps.reduce((sum, v) => sum + v, 0)), back = steps.filter(v => Math.sign(v) === -turning && Math.abs(v) > 2e-3).length;
  const moving = steps.findLastIndex(v => Math.abs(v) * 120 > .05) + 1, rates = steps.slice(0, moving).map(Math.abs), peak = Math.max(...rates);
  assert.equal(back, 0, 'it turns one way only');
  assert.ok(rates[3] < peak * .4 && rates.indexOf(peak) / moving > .2 && rates.indexOf(peak) / moving < .8, `eased in and out (fastest at ${(rates.indexOf(peak) / moving).toFixed(2)})`);
  window.oceanTour.stop(); env.nav.destroy();
  console.log(`PASS: from one fly-by's subject to the next, one eased pan, one way (${(moving / 120).toFixed(1)} s).`);
}
// The ending: N surfaces, as its Surface button does.
{
  globalThis.tracked = [];
  const env = environment(60, { reducedMotion: true });
  startTour(); env.tick(.5);
  for (let i = 0; i < 200 && tourStatus() !== 'done'; i++) { env.tick(.5); if (tourStatus() !== 'done') window.oceanTour.next(); }
  key('KeyN'); env.tick(.1);
  assert.equal(tourStatus(), 'off');
  assert.ok(env.calls.some(call => call[0] === 'surface'), 'the ascent home begins');
  assert.equal(tracked.at(-1)[1].how, 'surface');
  env.nav.destroy();
  console.log('PASS: N at the ending surfaces.');
}

// A leg replanned partway (a stall's detour, Resume after Pause, or Rejoin after a takeover) keeps the scenic waypoints
// still ahead. It used to drop them, so a stall going over the cliff edge below the wreck sent the swim in a straight
// line over the arch's roof.
for (const interruption of ['stall', 'pause', 'takeover']) {
  const env = environment(60, { collision: reefCollision, residents: { sleeper: [-17, terrainHeightAt(-17, -19) + .45, -19] } });
  toTravel(env);
  // Skip ahead with Continue to the anchor, then let the leg through the arch to the treasure swim.
  for (let i = 0; i < 400 && !(tourStatus() === 'dwell' && env.state.tour.key === 'about'); i++) { window.oceanTour.next(); env.tick(.5); }
  assert.equal(env.state.tour.key, 'about', 'reached the anchor by Continue');
  window.oceanTour.next(); env.tick(.1);
  assert.equal(env.state.tour.key, 'projects');
  const before = env.samples.length;
  // On the way down to the gully, short of the cliff edge where the live app stalled, the swim is interrupted.
  for (let i = 0; i < 60 * 120 && env.state.playerPosition[1] > -30; i++) env.tick();
  if (interruption === 'stall') env.nav.cancelTravel();
  else if (interruption === 'pause') { key('KeyP'); env.tick(1); key('KeyP'); }
  else { key('KeyW'); env.tick(.3); keyup('KeyW'); env.tick(1); assert.equal(tourStatus(), 'free'); key('KeyG'); env.tick(.1); }
  for (let i = 0; i < 60 * 100 && tourStatus() === 'travel'; i++) env.tick();
  assert.equal(tourStatus(), 'dwell', `the treasure reached after a ${interruption}`);
  if (interruption === 'stall') assert.equal(env.state.tour.detours, 1, 'the stall was recovered by a detour');
  const roof = terrainHeightAt(20, -72) + 9.6 - .6, under = env.samples.slice(before).filter(p => Math.abs(p[2] + 72) < 1.5 && Math.abs(p[0] - 20) < 10);
  assert.ok(under.length && under.every(p => Math.abs(p[0] - 20) < 3.5 && p[1] < roof), `still through the arch after a ${interruption} (${JSON.stringify(under[0])})`);
  window.oceanTour.stop(); env.nav.destroy();
}
console.log('PASS: a stall, a pause or a takeover and rejoin partway keeps the swim through the arch.');
