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
const { startTour, tourStatus, STOPS, STEPS, tourPlan, holdOf } = await import('../ocean-refined/guided-dive.js');
const { BEAT } = await import('../ocean-refined/guided-script.js');
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
  // Placed model viewpoints: model-scene.js's own, before a model's bounds refine them, with the real seabed beneath.
  const approach = { about: [5.2, 5.3], experience: [6, 4.4], projects: [6, 4.3] };
  const landmarks = LANDMARKS.map(item => { const [x, , z] = item.position, floor = terrainHeightAt(x, z), [dx, up] = approach[item.id];
    return { ...item, position: [x, floor + 1.4, z], interactionPosition: [x + dx, floor + up, z] }; });
  const api = window.oceanControls = {
    nav: nav.state, settings, landmarks, reef: { userData: { collisions: collision } }, getMode: () => atSurface ? 'surface' : nav.state.mode,
    frameDiver: value => calls.push(['frameDiver', value]),
    // A called-in whale shark swims its course at its own pace (user-creature-routes.js: 1.5 m/s), from `ahead` short of its closest approach.
    // The creature set may still be loading when the beat asks: here it can come only two seconds after the first ask.
    encounter: (id, course) => { asked ??= clock; if (clock < asked + 2) return false; calls.push(['encounter', id, course]); whaleFrom = { at: [...state.playerPosition], course, clock }; return true; },
    visitors: () => whaleFrom ? [whaleAt(whaleFrom, clock)] : [], startDive: options => { calls.push(['startDive', options]); nav.startDive(); atSurface = false; return true; }, getTransition: () => transition,
    guide: (...args) => nav.setGuided(...args), travelPath: (...args) => unavailable ? false : nav.travelPath(...args),
    cancelTravel: (...args) => nav.cancelTravel(...args), place: (...args) => { placed++; nav.place(...args); }, lookAt: (point, follow) => nav.lookAt(point, follow), residentAt: id => residents[id] ?? null,
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

// From the surface: a held beat while the copy fades, the camera's move in on the diver, then the dive in first person;
// under water the title card comes before the welcome sheet.
{
  const env = environment(60, { surface: true });
  globalThis.splashes = [];
  assert.equal(startTour(), true);
  assert.equal(document.body.dataset.prelude, 'on', 'the surface copy steps aside');
  env.tick(.8);
  assert.deepEqual(env.calls, [], 'a held beat first');
  env.tick(.4);
  assert.deepEqual(env.calls, [['frameDiver', true]], 'then the camera moves in on the diver');
  env.tick(1);
  assert.equal(env.calls.length, 1, 'the dive waits for the move to finish');
  env.tick(.4);
  assert.deepEqual(env.calls[1], ['startDive', { capture: false, perspective: 'first' }], 'and the dive starts in first person');
  env.tick(.2);
  assert.equal(tourStatus(), 'intro');
  assert.equal(document.body.dataset.prelude, undefined, 'the surface copy is back for the dive interface');
  assert.deepEqual(globalThis.splashes, [['Guided dive', 'Welcome to the reef']], 'the title card');
  assert.deepEqual(env.calls.at(-1), ['frameDiver', false]);
  window.oceanTour.stop(); env.nav.destroy();
  console.log('PASS: the opening holds, moves in on the diver and dives in first person.');
}

// A solid coral outcrop blocks the first approach. The production planner and
// CollisionWorld must take the body around it, with no endpoint-only assertions.
{
  const collision = new CollisionWorld();
  collision.addBox(new THREE.Box3(new THREE.Vector3(-4, -15, -10), new THREE.Vector3(-1, -2, -6)));
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

// The controls: the welcome asks for one at a time, ticks each as it is done (by what it changed, whatever the input) and
// moves on; done out of order, it asks for the first one left. A beat's tip is shown once, where the control is useful,
// and not at all once it has been tried. N skips the controls (toTravel above).
{
  const env = environment(60);
  startTour(); env.tick(.5);
  assert.equal(tourStatus(), 'intro');
  assert.equal(env.state.tour.tip, 'Try it, 1 of 4: Press C to open your dive computer.');
  env.nav.setLamp(!env.nav.state.lamp); env.tick(.1);
  assert.equal(env.state.tour.tip, '✓ Flashlight', 'a control done is ticked');
  env.tick(1.3);
  assert.equal(env.state.tour.tip, 'Try it, 2 of 4: Press C to open your dive computer.', 'then the first one left is asked for');
  document.body.dataset.computerOpen = 'true'; env.tick(.1); delete document.body.dataset.computerOpen;
  assert.equal(env.state.tour.tip, '✓ Dive computer'); env.tick(1.3);
  assert.equal(env.state.tour.tip, 'Try it, 3 of 4: Hold E to spin up your scooter.');
  key('KeyE'); env.tick(.6); keyup('KeyE'); env.tick(1.3);
  assert.equal(env.state.tour.tip, 'Try it, 4 of 4: Press V to see yourself in third person.');
  env.nav.togglePerspective(); env.tick(1.5);
  assert.equal(env.state.tour.tip, 'That’s the controls. Press N to start the tour.');
  assert.equal(tourStatus(), 'intro', 'trying the controls never hands the dive over, nor starts the tour');
  assert.deepEqual(window.oceanTour.tried.sort(), ['computer', 'lamp', 'scooter', 'view']);
  // Opening a site counts as F, from wherever it was opened.
  window.oceanArchive = { isOpen: true }; env.tick(.1); window.oceanArchive = { isOpen: false };
  assert.ok(window.oceanTour.tried.includes('interact'));
  // The photo tip at the table coral tower, gone once a photo is taken; the computer tip is skipped, already tried.
  window.oceanTour.next();
  const tower = STEPS.findIndex(step => step.key === 'tower'), deep = STEPS.findIndex(step => step.key === 'deep');
  for (let frame = 0; frame < 60 * 400 && !(env.state.tour.stop === tower && tourStatus() === 'look'); frame++) { env.tick(); if (tourStatus() === 'dwell') window.oceanTour.next(); }
  assert.equal(env.state.tour.tip, 'Press H to take a photo.');
  window.oceanExpedition = { photos: 1 }; env.tick(.1);
  assert.equal(env.state.tour.tip, '', 'a tried control is not taught again');
  for (let frame = 0; frame < 60 * 400 && !(env.state.tour.stop === deep && tourStatus() === 'look'); frame++) { env.tick(); if (tourStatus() === 'dwell') window.oceanTour.next(); }
  assert.equal(env.state.tour.tip, '', 'the computer was tried in the welcome');
  window.oceanTour.stop(); env.nav.destroy(); delete window.oceanExpedition; delete window.oceanArchive;
  console.log('PASS: the welcome asks for each control in turn and ticks it; beat tips show once and skip what was tried.');
}

// Build the production procedural reef and its collision geometry. Only the
// decorative canvas texture is stubbed; navigation uses the real solid reef.
const reefCollision = createReef({ economy: true }).userData.collisions;
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
  let totalDistance = 0, maxStep = 0, moving = 0, scenic = 0;
  for (let i = 1; i < STEPS.length; i++) {
    const step = STEPS[i], before = env.samples.length;
    assert.equal(tourStatus(), 'travel', `${step.key}: swims there`);
    for (let frame = 0; frame < hz * 100 && tourStatus() === 'travel'; frame++) env.tick();
    const leg = env.samples.slice(before);
    moving += leg.length / hz;
    assert.equal(tourStatus(), { stop: 'dwell', look: 'look', end: 'done' }[step.kind], `${step.key} arrived at ${hz} Hz: ${JSON.stringify(env.state.tour)}`);
    const target = step.landmark ? env.landmarks.find(item => item.id === step.landmark).interactionPosition : step.resident ? null : step.at;
    if (step.resident) assert.ok(distance(env.state.playerPosition, sleeper) < 14, `${step.key}: framed from beside where it lies (at ${env.state.playerPosition.map(v => v.toFixed(1))}, shark ${sleeper.map(v => v.toFixed(1))})`);
    else assert.ok(distance(env.state.playerPosition, target) < 1.6, `${step.key}: arrival reflects the body position`);
    assert.ok(leg.length > hz, 'the swim lasts across many frames');
    // The arch beat swims through the arch itself, under its roof (reef.js: arch at 20, -72, roof 9.6 m over its floor).
    if (step.key === 'arch') {
      const roof = terrainHeightAt(20, -72) + 9.6 - .6, under = leg.filter(p => Math.abs(p[2] + 72) < 1.5);
      assert.ok(under.length && under.every(p => Math.abs(p[0] - 20) < 3.5 && p[1] < roof), `through the arch, under its roof (${JSON.stringify(under[0])})`);
    }
    for (let j = 1; j < leg.length; j++) { const d = distance(leg[j - 1], leg[j]); maxStep = Math.max(maxStep, d); totalDistance += d; }
    if (step.kind === 'stop') {
      assert.equal(window.oceanTour.opens(step.landmark), step.opens ?? null, `${step.key}: Read it opens ${step.opens ?? 'its own section'}`);
      const settled = env.state.playerPosition; env.tick(8);
      assert.equal(tourStatus(), 'dwell', 'reading has no automatic advance');
      assert.ok(distance(settled, env.state.playerPosition) < 1.7, 'the diver settles at the stop');
      window.oceanTour.next();
    } else if (step.kind === 'look') {
      // A scenic beat pans its subjects, then moves on by itself.
      const yaw = env.nav.state.yaw, pitch = env.nav.state.pitch, hold = holdOf(step); let frames = 0;
      while (tourStatus() === 'look' && frames < hz * (hold + 2)) {
        env.tick(); frames++;
        if (step.encounter && frames === Math.round(hz * (step.beat ?? BEAT) * 1.9)) {
          const whale = whaleAt(env.whaleFrom, env.clock), at = env.state.playerPosition, s = env.nav.state;
          const aim = [-Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch)], to = [whale.x - at[0], whale.y - at[1], whale.z - at[2]];
          const angle = Math.acos(Math.max(-1, Math.min(1, aim.reduce((sum, v, k) => sum + v * to[k], 0) / Math.hypot(...to))));
          assert.ok(angle < .15, `${step.key}: the view follows the whale shark as it swims (${angle.toFixed(3)} rad off)`);
        }
        if (step.resident && frames === Math.round(hz * (step.beat ?? BEAT) * .9)) {
          const at = env.state.playerPosition, s = env.nav.state, aim = [-Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch)];
          const to = sleeper.map((v, k) => v - at[k]), length = Math.hypot(...to), angle = Math.acos(Math.max(-1, Math.min(1, aim.reduce((sum, v, k) => sum + v * to[k], 0) / length)));
          assert.ok(angle < .12, `${step.key}: the view settles on the shark itself (${angle.toFixed(3)} rad off)`);
        }
      }
      scenic += frames / hz;
      assert.equal(tourStatus(), 'travel', `${step.key}: moves on after ${hold} s`);
      assert.ok(Math.abs(frames / hz - hold) < .2, `${step.key}: holds ${hold} s (${(frames / hz).toFixed(2)})`);
      assert.ok(Math.abs(env.nav.state.yaw - yaw) + Math.abs(env.nav.state.pitch - pitch) > .1, `${step.key}: the view pans`);
    }
  }
  assert.equal(tourStatus(), 'done', 'the tour ends at the overview');
  // The whale shark is called in at the deep beat, on a course that stays over open water (SPEC D4): along its whole
  // line across the reef the seabed is deep, and it swims well clear of it.
  const called = env.calls.filter(call => call[0] === 'encounter');
  assert.deepEqual(called.map(call => call[1]), ['whale-shark'], 'one guaranteed whale shark, even when it was not ready at first');
  for (let x = -62; x <= 62; x += 2) {
    const { course, at } = env.whaleFrom, along = (x - at[0]) / Math.sin(course.angle), z = at[2] - Math.sin(course.angle) * course.side * course.pass + Math.cos(course.angle) * along;
    assert.ok(terrainHeightAt(x, z) < -38 && course.y - terrainHeightAt(x, z) > 10, `open water under the whale shark at x ${x} (seabed ${terrainHeightAt(x, z).toFixed(1)})`);
  }
  assert.equal(env.placed, 0, 'full-motion tour never places the player, even when OS reduced motion is enabled');
  assert.ok(maxStep < 7 / hz, `bounded continuous body steps (${maxStep})`);
  assert.ok(totalDistance > 250, `the player crossed the whole reef (${totalDistance})`);
  // About two minutes of movement (SPEC: timing budget); the reading is on top and at the visitor's pace.
  // Relaxed on review: longer looks and a slower swim, about three and a half minutes of motion (SPEC: timing budget).
  assert.ok(moving + scenic > 170 && moving + scenic < 260, `a relaxed pace (${(moving + scenic).toFixed(0)} s of motion)`);
  const plan = tourPlan();
  assert.ok(Math.abs(plan.seconds - (moving + scenic)) < 40, `the planner's estimate is close (${plan.seconds.toFixed(0)} s planned)`);
  // Swimming off from the overview simply ends the tour.
  key('KeyW'); env.tick(.2); keyup('KeyW');
  assert.equal(tourStatus(), 'off');
  assert.equal(window.oceanTour.welcome, null, 'the welcome is only for the tour');
  env.nav.destroy();
  console.log(`PASS: ${hz} Hz, ${STEPS.length - 1} real swims, ${totalDistance.toFixed(1)} m, ${moving.toFixed(0)} s swimming + ${scenic.toFixed(0)} s scenic, maximum step ${maxStep.toFixed(3)} m.`);
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
  startTour(); env.tick(.5); window.oceanTour.next(); env.tick(10);
  assert.equal(tourStatus(), 'travel'); assert.equal(env.state.tour.routeIssue, true);
  assert.equal(env.state.tour.paused, true); assert.equal(env.placed, 0);
  assert.ok(distance(env.state.playerPosition, [0, -8, 0]) < .01);
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
// Reduced motion: every leg is a fade, the camera never pans by itself, and the tour still runs start to finish on
// Continue alone, whale shark and all. The analytics funnel records each step and how the tour ended, in fields the
// privacy allowlist keeps.
{
  globalThis.tracked = [];
  const env = environment(60, { reducedMotion: true });
  let looked = 0; const lookAt = window.oceanControls.lookAt; window.oceanControls.lookAt = (...args) => { looked++; return lookAt(...args); };
  startTour(); env.tick(.5);
  // A moment at the deep beat for the whale shark, which the stand-in creature set only lets come after two seconds.
  for (let i = 0; i < 200 && tourStatus() !== 'done'; i++) {
    env.tick(.5); if (env.state.tour?.key === 'deep' && tourStatus() === 'look') env.tick(3);
    if (tourStatus() !== 'done') window.oceanTour.next();
  }
  assert.equal(tourStatus(), 'done', 'the whole tour on Continue alone');
  assert.equal(env.placed, STEPS.length - 1, 'every leg is a fade');
  assert.equal(looked, 0, 'no pans of its own');
  assert.ok(env.calls.some(call => call[0] === 'encounter'), 'the whale shark still comes');
  key('KeyW'); env.tick(.2); keyup('KeyW');
  const steps = tracked.filter(([event]) => event === 'tour_step').map(([, p]) => p.index);
  assert.deepEqual(steps, STEPS.map((step, i) => i), 'a tour_step for every step, in order');
  assert.deepEqual(tracked[0], ['tour_started', { from: 'underwater' }]);
  assert.deepEqual(tracked.at(-1), ['tour_ended', { step: 'overview', index: STEPS.length - 1, how: 'swam_off' }]);
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
console.log('PASS: rejected routes hold, explicit Skip and reduced motion fade, scenic curve checked.');
