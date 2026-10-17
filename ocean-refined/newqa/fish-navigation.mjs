import assert from 'node:assert/strict';
import { fishNavigator } from '../fish-navigation.js';
import { createMarineLife } from '../marine-life.js';

// A tall, finite reef wall blocks the direct route. A low fish must swim round its end, remain low,
// clear its body, and eventually resume its original destination rather than orbiting the obstacle forever.
for (const hz of [30, 60, 120]) {
  const floor = (x, z) => x > 0 && x < 5 && Math.abs(z) < 7 ? -8 : -30;
  const nav = fishNavigator(floor), s = nav.create(-9, -28.2, 0, Math.PI / 2);
  let maxZ = 0, reached = false;
  for (let i = 0; i < 40 * hz; i++) {
    const previous = { ...s };
    nav.step(s, { x: 12, y: -28.2, z: 0 }, 1 / hz, { speed: 1.5, clearance: .6, radius: .4 });
    assert.ok(s.y - floor(s.x, s.z) >= .6 - 1e-8, 'wall penetration');
    assert.ok(Math.abs(s.y - previous.y) <= .45 / hz + 1e-8, 'uncapped vertical step');
    assert.ok(Math.abs(s.yaw - previous.yaw) <= 1.3 / hz + 1e-8, 'heading snap');
    assert.ok(s.y < -28, 'wall was climbed rather than bypassed');
    maxZ = Math.max(maxZ, Math.abs(s.z));
    if (Math.hypot(s.x - 12, s.z) < .4) { reached = true; break; }
  }
  assert.ok(maxZ > 7.4, 'failed to route around the reef');
  assert.ok(reached, `never recovered destination at ${hz} Hz`);
}

// A gentle slope is traversable. Rejecting all uphill movement would hide the cliff bug by freezing fish.
const slopes = [];
for (const hz of [30, 60, 120]) {
  const floor = x => -30 + x * .15;
  const nav = fishNavigator(floor), s = nav.create(-10, -30.3, 0, Math.PI / 2);
  for (let i = 0; i < 20 * hz; i++) {
    nav.step(s, { x: 25, y: floor(s.x) + 1.2, z: 0 }, 1 / hz, { speed: 1.5, clearance: .6, radius: .4 });
    assert.ok(s.y > floor(s.x) + .6, 'slope penetration');
    assert.ok(Math.abs(s.pitch) < .31, 'unnatural slope pitch');
  }
  assert.ok(s.x > 19 && s.y > -27, 'fish stalled at a swimmable slope');
  slopes.push(s);
}
assert.ok(Math.abs(slopes[0].y - slopes[2].y) < .02, 'frame-dependent climb');

// A ledge beside the body must constrain descent even while the fish's center stays over deeper water.
// Otherwise it sinks below the lateral footprint, every heading becomes invalid, and the fish strands.
for (const initialY of [-6, -7.7]) {
  const nav = fishNavigator((x, z) => x > .2 ? -8 : -10), s = nav.create(0, initialY, 0, 0);
  for (let i = 0; i < 1000; i++) nav.step(s, { x: 0, y: -9.5, z: 100 }, .016, { radius: .3, clearance: .5, speed: 1 });
  assert.ok(s.y >= -7.50001, 'descended below the side ledge footprint');
  assert.ok(s.z > 14, 'fish stranded beside a raised ledge');
  assert.equal(s.blocked, false, 'clear course never recovered');
}

// Actual legacy flock integration, including its cached grid and diver separation, against an adversarial
// seabed. This catches reintroduction of the old post-integration p.y = floor snap outside the helper.
const cliff = (x, z) => x > 2 && x < 10 && z > -45 && z < -15 ? -8 : -34;
let analyticCalls = 0;
const life = createMarineLife({ economy: true, terrainHeightAt: (x, z) => { analyticCalls++; return cliff(x, z); }, debug: true });
let before = life.inspect().fish;
const started = performance.now(), initialCalls = analyticCalls;
for (let frame = 1; frame <= 600; frame++) {
  life.update(1 / 60, frame / 60, null);
  const after = life.inspect().fish;
  for (let i = 0; i < after.length; i++) {
    assert.ok(Math.abs(after[i].position[1] - before[i].position[1]) < .018, 'legacy flock teleported vertically at reef');
    assert.ok(after[i].position.every(Number.isFinite), 'invalid flock position');
  }
  before = after;
}
// Schools may evaluate their one roaming target per update; individual fish must use the cached grid.
assert.ok(analyticCalls - initialCalls <= life.schoolCount * 601, 'per-fish analytic terrain query');
console.log(JSON.stringify({ cliffs: 'pass at 30/60/120 Hz', slope: 'pass', legacyFish: life.count, simulatedSeconds: 10, cpuMs: Math.round(performance.now() - started) }));
