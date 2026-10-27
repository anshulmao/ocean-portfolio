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
const { startTour, tourStatus, STOPS } = await import('../ocean-refined/guided-dive.js');

function environment(hz, { reducedMotion = false, unavailable = false, collision = null } = {}) {
  const settings = { ...defaults, pointerLock: false, idleMotion: 0 };
  const nav = createExploration(canvas, () => {}, settings);
  nav.setTerrain(terrainHeightAt);
  if (collision) nav.setCollisions(collision);
  let placed = 0, transition = false;
  const state = window.oceanDiagnostics = { ready: true, landmarksReady: true, reducedMotion, playerPosition: [0, -8, 0] };
  nav.startDive();
  // Placed model viewpoints use their actual pads, with the real seabed beneath.
  const landmarks = LANDMARKS.map(item => ({ ...item, interactionPosition: [item.position[0] + 6, terrainHeightAt(item.position[0], item.position[2]) + 5, item.position[2]] }));
  const api = window.oceanControls = {
    nav: nav.state, settings, landmarks, reef: { userData: { collisions: collision } }, getMode: () => nav.state.mode, getTransition: () => transition,
    guide: (value, free) => nav.setGuided(value, free), travelPath: (...args) => unavailable ? false : nav.travelPath(...args),
    cancelTravel: (...args) => nav.cancelTravel(...args), place: (...args) => { placed++; nav.place(...args); },
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

// A solid coral outcrop blocks the first approach. The production planner and
// CollisionWorld must take the body around it, with no endpoint-only assertions.
{
  const collision = new CollisionWorld();
  collision.addBox(new THREE.Box3(new THREE.Vector3(-4, -15, -10), new THREE.Vector3(-1, -2, -6)));
  const env = environment(60, { collision });
  startTour();
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
  env.state.landmarksReady = true;
  let totalDistance = 0, maxStep = 0;
  for (let stop = 0; stop < STOPS.length; stop++) {
    const before = env.samples.length;
    for (let frame = 0; frame < hz * 100 && tourStatus() !== 'dwell'; frame++) env.tick();
    assert.equal(tourStatus(), 'dwell', `stop ${stop + 1} arrived at ${hz} Hz: ${JSON.stringify(env.state.tour)}`);
    assert.ok(distance(env.state.playerPosition, env.landmarks[stop].interactionPosition) < 1.6, 'arrival reflects the body position');
    const leg = env.samples.slice(before);
    assert.ok(leg.length > hz, 'the swim lasts across many frames');
    for (let i = 1; i < leg.length; i++) { const step = distance(leg[i - 1], leg[i]); maxStep = Math.max(maxStep, step); totalDistance += step; }
    const settled = env.state.playerPosition; env.tick(8);
    assert.equal(tourStatus(), 'dwell', 'reading has no automatic advance');
    assert.ok(distance(settled, env.state.playerPosition) < 1.7, 'the diver settles at the stop');
    window.oceanTour.next();
  }
  assert.equal(tourStatus(), 'done');
  assert.equal(env.placed, 0, 'full-motion tour never places the player, even when OS reduced motion is enabled');
  assert.ok(maxStep < 7 / hz, `bounded continuous body steps (${maxStep})`);
  assert.ok(totalDistance > 100, `the player traversed the reef (${totalDistance})`);
  window.oceanTour.stop(); env.nav.destroy();
  console.log(`PASS: ${hz} Hz, three real swims, ${totalDistance.toFixed(1)} m, maximum step ${maxStep.toFixed(3)} m.`);
}

// A rejected path holds the player rather than triggering the old timed cut.
const key = code => window.dispatchEvent({ type: 'keydown', code, repeat: false, target: { closest: () => null }, preventDefault() {} });
{
  const env = environment(60);
  startTour(); env.tick(1.5);
  assert.equal(tourStatus(), 'travel');
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
  startTour(); env.tick(10);
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
  startTour(); env.tick(1);
  assert.equal(tourStatus(), 'dwell'); assert.equal(env.placed, 1, 'effective reduced motion uses the deliberate fade');
  window.oceanTour.stop(); env.nav.destroy();
}
{
  const env = environment(60);
  startTour(); env.tick(.1); window.oceanTour.next();
  key('KeyW'); env.tick(1);
  assert.equal(tourStatus(), 'free', 'manual takeover also cancels an explicit skip fade');
  assert.equal(env.placed, 0, 'the pending placement cannot overrule manual control');
  window.oceanTour.stop(); env.nav.destroy();
}
// The actual planned open-water body route bows across the view, and an
// impenetrable collision world never yields a successful route.
const bow = planGuidedRoute([0, -10, 0], [30, -10, 0], { floor: () => -30, clear: () => true });
assert.ok(Math.max(...bow.map(point => Math.abs(point[2]))) > 3, 'a visible gentle curve');
assert.deepEqual(planGuidedRoute([0, -10, 0], [30, -10, 0], { floor: () => -30, clear: () => false }), []);
console.log('PASS: rejected routes hold, explicit Skip and reduced motion fade, scenic curve checked.');
