import assert from 'node:assert/strict';
import { createAscentComposition } from '../ocean-refined/ascent-composition.js';
import { sampleDiverPose } from '../ocean-refined/diver-animation.js';

for (const hz of [30, 60, 120]) {
  for (const depth of [1, 4, 8, 25]) {
    const composition = createAscentComposition();
    const nav = { mode: 'transition', returning: true, returnPhase: 'return' };
    assert.equal(composition.update(nav, depth), 0, 'return keeps the body at its actual swimming position');
    nav.returning = false;
    for (const phase of ['offer', 'stop']) {
      nav.returnPhase = phase;
      for (let i = 0; i < hz * 10; i++) assert.equal(composition.update(nav, depth), 0, 'waiting cannot jump to the surface composition');
    }
    nav.returnPhase = 'ascent';
    assert.equal(composition.update(nav, depth), 0, 'departure has no composition discontinuity');
    let previous = 0;
    const frames = hz * 8;
    for (let i = 1; i <= frames; i++) {
      const next = composition.update(nav, depth * (1 - i / frames));
      assert.ok(next >= previous && next <= 1);
      assert.ok(next - previous < .03, 'waterline reveal is continuous');
      previous = next;
    }
    assert.equal(previous, 1);
    assert.equal(composition.update({ mode: 'surface' }, 0), 0, 'next dive resets the composition');
  }
  const swim = sampleDiverPose(1, { dive: 1, moving: 1, ascending: 0 });
  const launch = sampleDiverPose(1, { dive: 1, moving: 1, ascending: .0001 });
  for (const key of Object.keys(swim)) if (typeof swim[key] === 'number') {
    assert.ok(Math.abs(swim[key] - launch[key]) < .001, `launch pose ${key} must blend instead of switch`);
  }
  console.log(`PASS ascent composition and pose continuity at ${hz} Hz`);
}
