import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import { createReef, LANDMARKS, terrainHeightAt } from '../reef.js';
import { waveGLSL, waveHeight } from '../shaders.js';

const closeTo = (actual, expected, tolerance, label) => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, got ${actual}`);
};
const failures = [];

for (const [id, floor, depth] of [
  ['about', -11, 8], ['experience', -26, 23], ['projects', -48, 45]
]) {
  const landmark = LANDMARKS.find(item => item.id === id);
  assert.ok(landmark, `missing ${id} landmark`);
  const [x, y, z] = landmark.position;
  closeTo(terrainHeightAt(x, z), floor, .01, `${id} seabed pad`);
  closeTo(y - terrainHeightAt(x, z), 3, .01, `${id} swimmer clearance`);
  closeTo(-y, depth, .01, `${id} depth label`);
}

const caveFloor = terrainHeightAt(20, -72);
assert.ok(caveFloor < -50 && caveFloor > -55, `cave should remain around 52m deep, got ${caveFloor}`);
assert.ok(terrainHeightAt(-18, -100) < -60, 'rear basin should deepen beyond the Projects pad');
assert.ok(terrainHeightAt(70, -110) < -55, 'surrounding scenery should continue into the deep basin beyond bounds');
assert.ok(terrainHeightAt(18, -60) < -38, 'Experience pad should blend into deeper terraces nearby');
closeTo(terrainHeightAt(0, 0), -13, .01, 'initial shallow garden floor');

const reef = createReef({ economy: true });
const collisions = reef.userData.collisions;
const floor = terrainHeightAt(20, -72);
const start = new THREE.Vector3(20, floor + 2, -72);
const exit = new THREE.Vector3(20, floor + 2, -59);
const move = collisions.move(start, new THREE.Vector3(0, 0, 13), {
  radius: .45, length: .9, padding: 0, step: .16, iterations: 8
});
assert.equal(move.unresolved, false, 'arch crossing should not end embedded');
assert.equal(move.blocked, false, 'central arch corridor should remain open');
closeTo(start.z, -59, .05, 'arch corridor traversal endpoint');
assert.equal(collisions.segmentClear(new THREE.Vector3(20, floor + 2, -80), exit), true,
  'line through the open arch corridor should be clear');
assert.equal(collisions.segmentClear(new THREE.Vector3(20, floor + 3, -72),
  new THREE.Vector3(20, floor + 12, -72)), false, 'roof should block a vertical line');
assert.equal(collisions.segmentClear(new THREE.Vector3(0, -12.8, 0),
  new THREE.Vector3(0, -7, 0), 2.5), true, 'initial diver lane should have a clear 2.5m radius');

const ascent = reef.userData.safeAscentRoute(new THREE.Vector3(20, floor + 2, -72));
assert.equal(ascent.length, 2, 'under-roof ascent should provide two route waypoints');
assert.ok(ascent.every(point => point.isVector3), 'route waypoints should be world Vector3 values');
assert.ok(ascent[0].y < floor + 6.1, 'first waypoint should leave the roof footprint below the ceiling');
assert.ok(ascent[1].y > floor + 8.4, 'second waypoint should rise above the roof');
assert.ok(collisions.segmentClear(new THREE.Vector3(20, floor + 2, -72), ascent[0]), 'first ascent leg should be clear');
const secondAscentClear = collisions.segmentClear(ascent[0], ascent[1]);
if (!secondAscentClear) failures.push('second ascent leg intersects a reef collider');
assert.ok(collisions.segmentClear(ascent[0], ascent[1], 2.5),
  'second ascent leg should clear a 2.5m radius around the climb');
assert.deepEqual(reef.userData.safeAscentRoute(new THREE.Vector3(0, -10, 0)), [],
  'positions outside the roof should not receive a cave route');

// Read the live GLSL wave terms and evaluate them independently, so this
// catches drift between the CPU float calculation and the rendered shader.
const waveTerm = /([+-]?\s*[\d.]+)\s*\*\s*sin\(dot\(p,vec2\(([-\d.]+),([-\d.]+)\)\)\+uTime\*([-\d.]+)\)/g;
const terms = [...waveGLSL.matchAll(waveTerm)].map(match => ({
  amplitude: Number(match[1].replaceAll(' ', '')),
  x: Number(match[2]), z: Number(match[3]), speed: Number(match[4])
}));
assert.equal(terms.length, 4, `expected four shared displacement waves, parsed ${terms.length}`);
const gpuFormula = (x, z, time) => terms.reduce((sum, term) =>
  sum + term.amplitude * Math.sin(x * term.x + z * term.z + time * term.speed), 0);
for (const [x, z, time] of [[0, 0, 0], [13.5, -82, 17.25], [-61, 34, 2.8], [123, -214, 61]]) {
  closeTo(waveHeight(x, z, time), gpuFormula(x, z, time), 1e-12,
    `CPU/GPU water displacement at (${x},${z},${time})`);
}

reef.traverse(node => {
  if (node.geometry && !node.isInstancedMesh) node.geometry.dispose();
  if (node.material) {
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
  }
});

console.log(JSON.stringify({
  ok: failures.length === 0,
  failures,
  landmarks: LANDMARKS.map(({ id, position: [x, y, z] }) => ({ id, floor: terrainHeightAt(x, z), depth: -y })),
  caveFloor,
  corridorEnd: start.toArray(),
  ascent: ascent.map(point => point.toArray()),
  parsedWaveTerms: terms.length,
  ascentLegsClear: [true, secondAscentClear]
}, null, 2));
if (failures.length) process.exitCode = 1;
