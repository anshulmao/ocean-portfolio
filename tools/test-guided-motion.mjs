import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createExploration } from '../ocean-refined/exploration.js';
import { defaults } from '../ocean-refined/movement-settings.js';
import { LANDMARKS, terrainHeightAt, createReef } from '../ocean-refined/reef.js';
import { planGuidedRoute } from '../ocean-refined/guided-route.js';
import { distance } from '../ocean-refined/cinematic-route.js';
import * as THREE from '../ocean-refined/vendor/three.module.min.js';
import { CollisionWorld } from '../ocean-refined/collisions.js';
import { heroFormationSteps } from '../ocean-refined/hero-formations.js';
import { createWildlifeGuide, wildlifeBearing } from '../ocean-refined/guided-wildlife.js';

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
document.createElement = () => Object.assign(new Element(), { getContext: () => ({ createImageData: (w,h) => ({ data: new Uint8ClampedArray(w*h*4) }), putImageData() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, quadraticCurveTo() {} }) });
canvas.requestPointerLock = () => {}; canvas.setPointerCapture = () => {};
Object.assign(globalThis, { document, window, matchMedia: query => ({ matches: query.includes('reduced-motion') }),
  addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window) });
const { startTour, tourStatus, STOPS, tourPlan } = await import('../ocean-refined/guided-dive.js');

const key = code => window.dispatchEvent({ type: 'keydown', code, repeat: false, target: { closest: () => null }, preventDefault() {} });

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
  for (let frame = 0; frame < 60 * 100 && !['dwell', 'done'].includes(tourStatus()); frame++) env.tick();
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
const formations = heroFormationSteps({ terrainHeightAt, collisions: reefCollision, economy: true });
while (!formations.next().done) {}
for (const hz of [30, 60, 120]) {
  const env = environment(hz, { collision: reefCollision });
  env.transition = true;
  assert.equal(startTour(), true);
  env.tick(1);
  assert.equal(tourStatus(), 'starting', 'entry animation cannot overwrite the route');
  env.transition = false; env.state.landmarksReady = false; env.tick(.5);
  assert.equal(tourStatus(), 'starting', 'wait for final landmark viewpoints');
  env.state.landmarksReady = true;
  let totalDistance = 0, maxStep = 0, travelSeconds = 0;
  for (let stop = 0; stop < STOPS.length; stop++) {
    const before = env.samples.length;
    for (let frame = 0; frame < hz * 100 && !['dwell', 'done'].includes(tourStatus()); frame++) env.tick();
    assert.equal(tourStatus(), stop === STOPS.length - 1 ? 'done' : 'dwell', `stop ${stop + 1} arrived at ${hz} Hz: ${JSON.stringify(env.state.tour)}`);
    const target = STOPS[stop].landmark ? env.landmarks.find(item => item.id === STOPS[stop].landmark).interactionPosition : STOPS[stop].point;
    assert.ok(distance(env.state.playerPosition, target) < 1.6, 'arrival reflects the body position');
    const leg = env.samples.slice(before);
    travelSeconds += leg.length / hz;
    if (hz === 30) console.log(STOPS[stop].key, (leg.length / hz).toFixed(1), env.state.tour.detours);
    assert.ok(leg.length > hz, 'the swim lasts across many frames');
    for (let i = 1; i < leg.length; i++) { const step = distance(leg[i - 1], leg[i]); maxStep = Math.max(maxStep, step); totalDistance += step; }
    if (STOPS[stop].scenic && tourStatus() === 'dwell') key('KeyP');
    const settled = env.state.playerPosition; env.tick(8);
    assert.equal(tourStatus(), stop === STOPS.length - 1 ? 'done' : 'dwell', 'reading and paused scenic moments have no automatic advance');
    assert.ok(distance(settled, env.state.playerPosition) < 1.7, 'the diver settles at the stop');
    window.oceanTour.next();
  }
  assert.equal(tourStatus(), 'done');
  assert.equal(env.placed, 0, 'full-motion tour never places the player, even when OS reduced motion is enabled');
  assert.ok(maxStep < 7 / hz, `bounded continuous body steps (${maxStep})`);
  assert.ok(totalDistance > 100, `the player traversed the reef (${totalDistance})`);
  assert.ok(travelSeconds > 90 && travelSeconds < 150, `roughly two minutes of movement (${travelSeconds})`);
  window.oceanTour.stop(); env.nav.destroy();
  console.log(`PASS: ${hz} Hz, eight reef stages, ${totalDistance.toFixed(1)} m, ${travelSeconds.toFixed(1)} seconds swimming, maximum step ${maxStep.toFixed(3)} m.`);
}

// A rejected path holds the player rather than triggering the old timed cut.

{
  const env = environment(60);
  startTour(); env.tick(6); window.oceanTour.next(); env.tick(1.5);
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

// Compare the real integrator frame for frame, with and without free look.
// Input changes the view but never cancels the route or redirects its thrust.
let baseline;
for (const input of ['none', 'mouse', 'touch', 'arrows']) {
  const env = environment(60);
  env.nav.setGuided(true, true);
  env.nav.travelPath([[0, -8, -35]], [0, -8, -40], 4);
  env.tick(.1);
  const inputsBefore = env.nav.state.inputs;
  if (input === 'arrows') key('ArrowLeft');
  if (input === 'mouse' || input === 'touch') {
    canvas.dispatchEvent({ type: 'pointerdown', pointerType: input, pointerId: 1, clientX: 100, clientY: 100 });
    canvas.dispatchEvent({ type: 'pointermove', pointerType: input, pointerId: 1, clientX: 700, clientY: 160 });
  }
  env.tick(3);
  assert.equal(env.nav.state.inputs, inputsBefore, `${input} leaves movement guided`);
  assert.equal(env.nav.state.guided, true);
  assert.equal(env.nav.state.travelling, true);
  if (input === 'none') baseline = env.samples;
  else {
    assert.ok(Math.abs(env.nav.state.yaw) > .3, `${input} turns the view`);
    for (let i = 0; i < baseline.length; i++) assert.ok(distance(env.samples[i], baseline[i]) < .001, `${input} preserves the swim at frame ${i}`);
  }
  env.nav.destroy();
}
assert.ok(wildlifeBearing([10, 0, -10]).x > 0);
assert.ok(wildlifeBearing([10, 0, 10]).x > 0, 'behind-camera animal keeps its right bearing');
assert.ok(wildlifeBearing([-10, 0, 10]).x < 0);
assert.ok(wildlifeBearing([0, 10, -10]).y < 0);
assert.equal(wildlifeBearing([0, 0, -10]).onScreen, true);
assert.equal(wildlifeBearing([0, 0, 10]).onScreen, false);
assert.equal(tourPlan().stops, 3, 'the planner counts portfolio sites separately from scenic stages');
{
  let cue, samples = 0;
  const guideDocument = { createElement: () => (cue = new Element()), body: { append() {} } };
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 100); camera.updateMatrixWorld();
  let animals = [{ id: 'visitor', species: 'whale-shark', position: [12, 0, -20] }];
  const api = { getCamera: () => camera, creatures: { root: { visible: false }, sites: () => { samples++; return animals; } } };
  const guide = createWildlifeGuide(guideDocument, new THREE.Vector3());
  guide.update(.25, api, true);
  assert.equal(cue.hidden, true, 'unprepared creatures cannot create a phantom cue at the origin');
  api.creatures.root.visible = true; guide.update(.25, api, true);
  assert.equal(cue.hidden, false, 'a nearby prepared animal produces a cue');
  const bearing = cue.style.left;
  camera.rotation.y = -.5; camera.updateMatrixWorld(); guide.update(.01, api, true);
  assert.notEqual(cue.style.left, bearing, 'camera look updates the cue between animal samples');
  assert.equal(samples, 1, 'camera frames do not reallocate the animal list');
  guide.update(.01, api, false); assert.equal(cue.hidden, true, 'reading hides the cue');
  animals = []; guide.update(.25, api, true);
  assert.equal(cue.hidden, true, 'departed animal clears the cue');
  guide.reset(); animals = [{ id: 'visitor', species: 'whale-shark', position: [0, 0, -20] }];
  guide.update(.25, api, true); assert.equal(cue.hidden, false);
  animals[0].position = [100, 0, -20]; guide.update(.25, api, true);
  assert.equal(cue.hidden, true, 'an active animal outside the nearby range clears the cue');
  guide.reset(); animals[0].position = [0, 0, -20]; guide.update(.25, api, true);
  for (let i = 0; i < 41; i++) guide.update(.25, api, true);
  assert.equal(cue.hidden, true, 'a cue expires without waiting for the animal');
}
console.log('PASS: mouse, touch and arrow-key free look preserve the body route; wildlife bearings follow the view.');
