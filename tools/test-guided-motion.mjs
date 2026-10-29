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
const journey = 'data:text/javascript,' + encodeURIComponent('export const onFrame=fn=>globalThis.tourFrame=fn; export const setQuiet=()=>{}; export const discover=()=>{}; export const say=()=>{};');
registerHooks({ resolve(specifier, context, next) {
  if (specifier === './journey.js' && context.parentURL?.endsWith('/guided-dive.js')) return { url: journey, shortCircuit: true };
  return next(specifier, context);
} });
class Element {
  listeners = new Map(); dataset = {}; style = { setProperty() {} }; firstChild = { textContent: '' }; parts = new Map();
  addEventListener(name, fn) { const group = this.listeners.get(name) ?? new Set(); group.add(fn); this.listeners.set(name, group); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  dispatchEvent(event) { for (const fn of this.listeners.get(event.type) ?? []) fn(event); }
  setAttribute() {} focus() {} append() {}
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

function environment(hz, { reducedMotion = false, unavailable = false, collision = null } = {}) {
  const settings = { ...defaults, pointerLock: false, idleMotion: 0 };
  const nav = createExploration(canvas, () => {}, settings);
  nav.setTerrain(terrainHeightAt);
  if (collision) nav.setCollisions(collision);
  let placed = 0, transition = false;
  const state = window.oceanDiagnostics = { ready: true, landmarksReady: true, reducedMotion, playerPosition: [0, -8, 0] };
  nav.startDive();
  // Placed model viewpoints: model-scene.js's own, before a model's bounds refine them, with the real seabed beneath.
  const approach = { about: [5.2, 5.3], experience: [6, 4.4], projects: [6, 4.3] };
  const landmarks = LANDMARKS.map(item => { const [x, , z] = item.position, floor = terrainHeightAt(x, z), [dx, up] = approach[item.id];
    return { ...item, position: [x, floor + 1.4, z], interactionPosition: [x + dx, floor + up, z] }; });
  const api = window.oceanControls = {
    nav: nav.state, settings, landmarks, reef: { userData: { collisions: collision } }, getMode: () => nav.state.mode, getTransition: () => transition,
    guide: (...args) => nav.setGuided(...args), travelPath: (...args) => unavailable ? false : nav.travelPath(...args),
    cancelTravel: (...args) => nav.cancelTravel(...args), place: (...args) => { placed++; nav.place(...args); }, lookAt: point => nav.lookAt(point),
  };
  const samples = [];
  function tick(seconds = 1 / hz) {
    for (let i = 0; i < Math.round(seconds * hz); i++) {
      nav.update(1 / hz, true, state.reducedMotion);
      state.playerPosition = nav.getPlayerPosition().toArray(); samples.push([...state.playerPosition]);
      globalThis.tourFrame(1 / hz, api, state, true);
    }
  }
  return { nav, state, landmarks, samples, tick, set transition(value) { transition = value; }, get placed() { return placed; } };
}

// Past the welcome, which waits for Continue where the dive levels out, onto the first swim.
function toTravel(env) {
  startTour(); env.tick(.5);
  assert.equal(tourStatus(), 'intro', 'the tour opens with the welcome');
  window.oceanTour.next(); env.tick(1);
  assert.equal(tourStatus(), 'travel');
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

// Build the production procedural reef and its collision geometry. Only the
// decorative canvas texture is stubbed; navigation uses the real solid reef.
const reefCollision = createReef({ economy: true }).userData.collisions;
for (const hz of [30, 60, 120]) {
  const env = environment(hz, { collision: reefCollision });
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
    const target = step.landmark ? env.landmarks.find(item => item.id === step.landmark).interactionPosition : step.at;
    assert.ok(distance(env.state.playerPosition, target) < 1.6, `${step.key}: arrival reflects the body position`);
    assert.ok(leg.length > hz, 'the swim lasts across many frames');
    for (let j = 1; j < leg.length; j++) { const d = distance(leg[j - 1], leg[j]); maxStep = Math.max(maxStep, d); totalDistance += d; }
    if (step.kind === 'stop') {
      assert.equal(window.oceanTour.opens(step.landmark), step.opens ?? null, `${step.key}: Read it opens ${step.opens ?? 'its own section'}`);
      const settled = env.state.playerPosition; env.tick(8);
      assert.equal(tourStatus(), 'dwell', 'reading has no automatic advance');
      assert.ok(distance(settled, env.state.playerPosition) < 1.7, 'the diver settles at the stop');
      window.oceanTour.next();
    } else if (step.kind === 'look') {
      // A scenic beat pans its subjects, then moves on by itself.
      const yaw = env.nav.state.yaw, pitch = env.nav.state.pitch; let frames = 0;
      while (tourStatus() === 'look' && frames < hz * (step.hold + 2)) { env.tick(); frames++; }
      scenic += frames / hz;
      assert.equal(tourStatus(), 'travel', `${step.key}: moves on after ${step.hold} s`);
      assert.ok(Math.abs(frames / hz - step.hold) < .2, `${step.key}: holds ${step.hold} s (${(frames / hz).toFixed(2)})`);
      assert.ok(Math.abs(env.nav.state.yaw - yaw) + Math.abs(env.nav.state.pitch - pitch) > .1, `${step.key}: the view pans`);
    }
  }
  assert.equal(tourStatus(), 'done', 'the tour ends at the overview');
  assert.equal(env.placed, 0, 'full-motion tour never places the player, even when OS reduced motion is enabled');
  assert.ok(maxStep < 7 / hz, `bounded continuous body steps (${maxStep})`);
  assert.ok(totalDistance > 250, `the player crossed the whole reef (${totalDistance})`);
  // About two minutes of movement (SPEC: timing budget); the reading is on top and at the visitor's pace.
  assert.ok(moving + scenic > 100 && moving + scenic < 150, `about two minutes of motion (${(moving + scenic).toFixed(0)} s)`);
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
  env.tick(6);
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
// The actual planned open-water body route bows across the view, and an
// impenetrable collision world never yields a successful route.
const bow = planGuidedRoute([0, -10, 0], [30, -10, 0], { floor: () => -30, clear: () => true });
assert.ok(Math.max(...bow.map(point => Math.abs(point[2]))) > 3, 'a visible gentle curve');
assert.deepEqual(planGuidedRoute([0, -10, 0], [30, -10, 0], { floor: () => -30, clear: () => false }), []);
console.log('PASS: rejected routes hold, explicit Skip and reduced motion fade, scenic curve checked.');
