import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import { createDiver } from '../diver.js';
import { createDiverAnimator, sampleDiverPose } from '../diver-animation.js';

const diver = createDiver(), animator = createDiverAnimator(diver);
const vector = new THREE.Vector3();
let meshes = 0, triangles = 0;
diver.root.traverse(node => {
  if (!node.isMesh) return;
  meshes++;
  const geometry = node.geometry, positions = geometry.getAttribute('position');
  triangles += (geometry.index?.count ?? positions.count) / 3;
  for (const value of positions.array) assert(Number.isFinite(value), `${node.name}: invalid vertex`);
  for (const value of geometry.getAttribute('normal').array) assert(Number.isFinite(value), 'Invalid surface normal');
  assert(!node.material.map, 'The procedural diver should not load textures');
});
assert(meshes <= 28, `Diver has ${meshes} meshes`);
assert(triangles < 35000, `Diver has ${triangles} triangles`);
assert.equal(diver.arms.length, 2); assert.equal(diver.legs.length, 2);
assert.equal(diver.root.userData.asset.toeAxis, '+Z');

const scenarios = {
  surface: { dive: 0 }, hover: { dive: 1 }, swimming: { dive: 1, moving: true },
  ascent: { dive: 1, moving: true, ascending: true },
  checking: { dive: 1, wristOpen: true }, stop: { dive: 1, safetyStop: 1 }
};
const dimensions = {};
for (const [name, input] of Object.entries(scenarios)) {
  for (let frame = 0; frame < 300; frame++) {
    animator.update(1 / 60, input); diver.root.updateMatrixWorld(true);
    diver.root.traverse(node => {
      for (const value of node.matrixWorld.elements) assert(Number.isFinite(value), `${name}: invalid pose`);
    });
    const mouthConnector = new THREE.Vector3(.06, .157, .238).applyEuler(diver.head.rotation).add(diver.head.position);
    assert(mouthConnector.distanceTo(diver.regulatorHose.end) < 1e-10, `${name}: hose detached from regulator`);
    for (const value of diver.regulatorHose.mesh.geometry.attributes.position.array) assert(Number.isFinite(value), 'Invalid articulated hose');
    for (const leg of diver.legs) {
      assert(leg.shin.rotation.x >= .09 && leg.shin.rotation.x < .58, `${name}: unnatural knee bend`);
      assert(leg.ankle.rotation.x > .65 && leg.ankle.rotation.x < 1.4, `${name}: backward foot`);
      assert.equal(leg.finTip.parent, leg.ankle);
      // A fin follows the toe, never the heel, through every swim/surface pose.
      const toe = new THREE.Vector3(0, 0, 1).transformDirection(leg.ankle.matrixWorld);
      const blade = leg.finTip.getWorldPosition(new THREE.Vector3()).sub(leg.ankle.getWorldPosition(new THREE.Vector3())).normalize();
      assert(toe.dot(blade) > .99, `${name}: fin points opposite the toes`);
      assert(leg.shin.position.y > -.5 && leg.ankle.position.y > -.46, 'Joint length changed');
    }
  }
  const bounds = new THREE.Box3().setFromObject(diver.root), size = bounds.getSize(vector);
  assert(size.x > .7 && size.x < 1.1, `${name}: divergent shoulder width`);
  assert(size.y > 2.8 && size.y < 3.4, `${name}: inconsistent body proportions`);
  dimensions[name] = size.toArray().map(value => +value.toFixed(3));
  if (name === 'swimming') assert(diver.head.rotation.x < -.45, 'Swimming head should look ahead');
  if (name === 'stop' || name === 'checking') {
    const computer = diver.arms[0].computer;
    const position = computer.getWorldPosition(new THREE.Vector3());
    const towardsFace = diver.head.getWorldPosition(new THREE.Vector3()).sub(position).normalize();
    const screenNormal = new THREE.Vector3(0, 0, 1).transformDirection(computer.matrixWorld);
    assert(screenNormal.dot(towardsFace) > .65, 'Computer face must point towards the diver');
    assert(position.z > .2 && position.z < .5 && position.y > -.15, 'Computer should rise in front of the chest');
  }
}

// Alternating hip propulsion, delayed flexible ankles, no backwards knees.
for (let t = 0; t < 12; t += .037) {
  const p = sampleDiverPose(t, { dive: 1, moving: 1 });
  assert(Math.abs(p.left.hipX + p.right.hipX + .15) < 1e-12);
  assert(Math.abs(p.left.ankleX + p.right.ankleX - 2.54) < 1e-12);
  assert(p.left.kneeX >= .21 && p.right.kneeX >= .21);
}

// Reduced motion retains the meaningful reading pose with no ambient drift.
assert.deepEqual(sampleDiverPose(1, { reducedMotion: true, dive: 1, safetyStop: 1 }), sampleDiverPose(19, { reducedMotion: true, dive: 1, safetyStop: 1 }));
animator.update(.1, { dive: 1, paused: true }); const pausedPhase = animator.diagnostics.phase;
animator.update(.1, { dive: 1, paused: true }); assert.equal(animator.diagnostics.phase, pausedPhase);

const poseAtRate = rate => {
  const rig = createDiver(), animation = createDiverAnimator(rig);
  for (let i = 0; i < rate * 4; i++) animation.update(1 / rate, { dive: 1, moving: true });
  return rig.legs[0].hip.rotation.x;
};
assert(Math.abs(poseAtRate(30) - poseAtRate(120)) < 1e-10, 'Swim motion depends on frame rate');
console.log(JSON.stringify({ passed: true, meshes, triangles, dimensions, checks: ['finite surfaces and transforms', 'forward fins', 'joint limits', 'computer sightline', 'opposed strokes', 'reduced motion', 'pause', 'frame independence'] }, null, 2));
