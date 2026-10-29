// The schooling fish of marine-life.js drawn as creature-set species (school-fish.js): the swim stroke follows each
// fish, the schools swim the same course at 30, 60 and 120 frames a second, a paused world stands still, and the
// reef keeps within the old budget of fish and draw calls.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createMarineLife } from '../marine-life.js';
import { SCHOOL_SPECIES } from '../school-fish.js';
import { speciesById } from '../creature-species.js';
import { terrainHeightAt } from '../reef.js';

// The lengths and waves school-fish.js carries (so the schools can be laid out before the species module loads).
for (const [id, fact] of Object.entries(SCHOOL_SPECIES)) {
  const spec = speciesById(id);
  assert.equal(fact.length, spec.length, `${id} length`);
  assert.deepEqual(fact.wave, spec.swimShader, `${id} wave`);
}

// Budget: no more fish than the procedural schools had (490, economy 245), and fewer draw calls (5).
for (const [economy, limit] of [[false, 490], [true, 245]]) {
  const life = createMarineLife({ economy, terrainHeightAt });
  assert.ok(life.count <= limit, `economy ${economy}: ${life.count} fish`);
  assert.ok(life.drawCalls <= 4, `economy ${economy}: ${life.drawCalls} draw calls`);
}

const report = {};

// Frame-rate independence: with no diver every school is on the fixed step, so 30, 60 and 120 Hz swim one course.
const run = (hz, seconds = 6) => {
  const life = createMarineLife({ terrainHeightAt, debug: true });
  for (let i = 1; i <= seconds * hz; i++) life.update(1 / hz, i / hz, null);
  return life.inspect().fish;
};
const at30 = run(30), at60 = run(60), at120 = run(120);
let apart = 0, beatApart = 0;
for (let i = 0; i < at60.length; i++) for (const other of [at30, at120]) {
  apart = Math.max(apart, new T.Vector3(...at60[i].position).distanceTo(new T.Vector3(...other[i].position)));
  beatApart = Math.max(beatApart, Math.abs(at60[i].beat - other[i].beat));
}
assert.ok(apart < 1e-6, `courses differ by ${apart} m between frame rates`);
assert.ok(beatApart < .05, `tail beats differ by ${beatApart} Hz between frame rates`);

// The stroke follows the fish: beat rate rises with speed, between the hovering flutter and the sprint.
{
  const fish = at60.map(f => ({ speed: Math.hypot(...f.velocity) / f.size, beat: f.beat }));
  const mean = list => list.reduce((a, b) => a + b, 0) / list.length, ms = mean(fish.map(f => f.speed)), mb = mean(fish.map(f => f.beat));
  let n = 0, a = 0, b = 0; for (const f of fish) { n += (f.speed - ms) * (f.beat - mb); a += (f.speed - ms) ** 2; b += (f.beat - mb) ** 2; }
  assert.ok(n / Math.sqrt(a * b) > .8, `beat and speed correlate ${n / Math.sqrt(a * b)}`);
  assert.ok(Math.min(...fish.map(f => f.beat)) >= .79 && Math.max(...fish.map(f => f.beat)) <= 5.21, 'beat out of range');
}

// Drawn between steps: at 120 Hz a moving fish moves on every frame drawn, not on every other one.
{
  const life = createMarineLife({ terrainHeightAt, debug: true });
  let previous = null, still = 0, frames = 0;
  for (let i = 1; i <= 240; i++) {
    life.update(1 / 120, i / 120, null);
    const drawn = life.inspect().fish.map(f => f.drawn);
    if (previous && i > 30) for (let k = 0; k < drawn.length; k += 7) { frames++; if (Math.hypot(drawn[k][0] - previous[k][0], drawn[k][1] - previous[k][1], drawn[k][2] - previous[k][2]) < 1e-5) still++; }
    previous = drawn;
  }
  assert.equal(still, 0, `${still} of ${frames} drawn frames did not move`);
}

// A diver swimming in: the school bursts away (faster beat, wider stroke) and keeps its clearance.
{
  const life = createMarineLife({ terrainHeightAt, debug: true }), start = life.inspect();
  const school = 10, centre = new T.Vector3(...start.schools[school].center), player = centre.clone().add(new T.Vector3(-16, 0, 0));
  const members = () => life.inspect().fish.filter(f => f.school === school);
  for (let i = 1; i <= 120; i++) life.update(1 / 60, i / 60, player);
  const calm = members(), calmBeat = Math.max(...calm.map(f => f.beat));
  // The diver heads for the school's middle as it is now, at 3 m/s.
  let closest = Infinity, fear = 0, beat = 0;
  for (let i = 1; i <= 300; i++) {
    const now = members(), middle = now.reduce((sum, f) => sum.add(new T.Vector3(...f.position)), new T.Vector3()).divideScalar(now.length);
    if (middle.distanceTo(player) > .5) player.addScaledVector(middle.sub(player).normalize(), 3 / 60);
    life.update(1 / 60, 2 + i / 60, player);
    for (const f of members()) { closest = Math.min(closest, new T.Vector3(...f.position).distanceTo(player)); fear = Math.max(fear, f.fear); beat = Math.max(beat, f.beat); }
  }
  assert.ok(fear > .3, `school never took fright (${fear})`);
  assert.ok(beat > calmBeat + .3, `no burst: ${calmBeat} → ${beat} Hz`);
  assert.ok(closest > 1.6, `a fish came within ${closest} m of the diver`);
  Object.assign(report, { burst: { calmHz: +calmBeat.toFixed(2), burstHz: +beat.toFixed(2), fear: +fear.toFixed(2), closestMetres: +closest.toFixed(2) } });
  // Banked into its turns, never rolled over.
  assert.ok(life.inspect().fish.every(f => Math.abs(f.roll) <= .42 + 1e-9), 'rolled past the bank limit');
}

// A paused world (dt 0, as with reduced motion) stands still: no course, no stroke.
{
  const life = createMarineLife({ terrainHeightAt, debug: true });
  for (let i = 1; i <= 60; i++) life.update(1 / 60, i / 60, null);
  const before = JSON.stringify(life.inspect().fish);
  for (let i = 0; i < 30; i++) life.update(0, 1, null);
  assert.equal(JSON.stringify(life.inspect().fish), before, 'the schools moved while paused');
}

// The species' shapes and skins: here (no page to fetch the files from) the skins are painted in code. Every fish then
// draws with a real shape, with finite matrices and stroke values.
{
  const life = createMarineLife({ economy: true, terrainHeightAt, debug: true });
  const looks = await life.loadLooks();
  assert.deepEqual(looks.failed, []);
  assert.equal(looks.loaded.length, 4);
  life.update(1 / 30, 1 / 30, null);
  let drawn = 0;
  life.root.traverse(node => {
    if (!node.isInstancedMesh) return;
    drawn += node.count;
    assert.ok(node.geometry.getAttribute('position').count > 100, `${node.name} has no shape`);
    assert.ok(node.material.map?.image?.width >= 64, `${node.name} has no skin`);
    assert.ok([...node.instanceMatrix.array.slice(0, node.count * 16)].every(Number.isFinite), `${node.name} matrices`);
    assert.ok([...node.geometry.getAttribute('aSwim').array.slice(0, node.count * 3)].every(Number.isFinite), `${node.name} stroke`);
  });
  assert.equal(drawn, life.count);
  console.log(JSON.stringify({ fish: life.count, ...report, apartMetres: apart, beatApartHz: +beatApart.toFixed(4), looks: { skins: looks.skins, triangles: looks.triangles, mainThreadMs: looks.mainThreadMs, longestMs: looks.longestMs } }));
}
