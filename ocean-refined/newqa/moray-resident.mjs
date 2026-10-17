import assert from 'node:assert/strict';
import { createMorayDenMotion, updateMorayDenMotion, MORAY_DEN_GEOMETRY } from '../moray-resident.js';

const mouth = { x: 4, y: -22, z: -18 };
const yaw = Math.PI / 2; // local +Z faces world +X
const state = createMorayDenMotion({ mouth, yaw });
const rest = updateMorayDenMotion(state, 0);
const headRest = rest.x + Math.sin(yaw) * MORAY_DEN_GEOMETRY.headFromWrapper;
assert.ok(Math.abs(headRest - (mouth.x - MORAY_DEN_GEOMETRY.retractedInset)) < 1e-9, 'resting head sits just inside the den mouth');
assert.ok(Math.abs(rest.z - mouth.z) < 1e-9, 'den position stays on its fixed axis');

// A diver in front brings the eel out gradually, without a sudden wrapper translation.
const diver = { x: mouth.x + 2, y: mouth.y, z: mouth.z };
let previous = rest;
for (let i = 0; i < 60; i++) {
  const pose = updateMorayDenMotion(state, 1 / 30, diver);
  assert.ok(pose.emergence >= previous.emergence && pose.emergence <= 1, 'approach emergence is monotone and bounded');
  assert.ok(Math.hypot(pose.x - previous.x, pose.y - previous.y, pose.z - previous.z) < 0.03, 'per-frame movement is eased');
  previous = pose;
}
assert.ok(previous.emergence > 0.6, 'close diver elicits emergence');
assert.ok(Math.abs(previous.x + MORAY_DEN_GEOMETRY.headFromWrapper - (mouth.x - MORAY_DEN_GEOMETRY.retractedInset + MORAY_DEN_GEOMETRY.emergeDistance * previous.emergence)) < 0.02, 'emerged head remains within the configured reach');

// Leaving the den front retracts smoothly and leaves the anchor fixed.
for (let i = 0; i < 360; i++) previous = updateMorayDenMotion(state, 1 / 30, null);
assert.ok(previous.emergence < 0.02, 'moray retracts when the diver is gone');
assert.deepEqual(state.mouth, mouth, 'motion never drifts the den anchor');

// Facing away from the den does not pull the moray into an unsupported path.
const away = createMorayDenMotion({ mouth, yaw: -Math.PI / 2 });
let pose;
for (let i = 0; i < 60; i++) pose = updateMorayDenMotion(away, 1 / 30, diver);
assert.equal(pose.emergence, 0);
assert.throws(() => createMorayDenMotion({ mouth, yaw, length: 0 }), TypeError);
const scaled = createMorayDenMotion({ mouth, yaw, scale: .5 }), output = {};
assert.equal(scaled.length, 6.95 * .5);
assert.equal(updateMorayDenMotion(scaled, 0, null, output), output, 'runtime can reuse its output pose');
assert.ok(Math.abs(output.x + MORAY_DEN_GEOMETRY.headFromWrapper * .5 - (mouth.x - MORAY_DEN_GEOMETRY.retractedInset * .5)) < 1e-9, 'wrapper and GLB head offset scale together');
assert.throws(() => createMorayDenMotion({ mouth, yaw, scale: 0 }), TypeError);
console.log('Moray den motion passed: anchored, bounded, eased, and retracting.');
