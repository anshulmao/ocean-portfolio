// Node check of the creature set: every species builds at each level of detail, its skin weights sum to one, nothing
// is NaN, and every clip plays. Prints sizes, triangle counts, bones and clips.  node creature-smoke.mjs <ocean-refined dir>
import { pathToFileURL } from 'node:url';
const dir = process.argv[2];
const THREE = await import(pathToFileURL(dir + '/vendor/three.module.min.js').href);
const { SPECIES, creature } = await import(pathToFileURL(dir + '/creature-species.js').href);
let failed = 0;
for (const s of SPECIES) {
  const row = [];
  for (const lod of [0, 1, 2]) {
    const t0 = performance.now(), t = creature(s.id, { lod }), g = t.geometry, w = g.getAttribute('skinWeight'), p = g.getAttribute('position'), uv = g.getAttribute('uv');
    let bad = 0; for (let i = 0; i < w.count; i++) { const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i); if (!(Math.abs(sum - 1) < 1e-3)) bad++; }
    for (const a of [p.array, uv.array]) for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) bad++;
    for (let i = 0; i < uv.array.length; i++) if (uv.array[i] < 0 || uv.array[i] > 1) bad++;
    if (lod === 0) { const inst = t.instantiate(), mixer = new THREE.AnimationMixer(inst.object); for (const c of t.clips) { mixer.clipAction(c).reset().play(); mixer.update(c.duration * .37); } inst.object.updateMatrixWorld(true); inst.mesh.skeleton.update(); for (const b of inst.bones) if (!b.matrixWorld.elements.every(Number.isFinite)) bad++; }
    if (bad) failed++;
    row.push(`${t.triangles}${bad ? ' BAD' + bad : ''} (${(performance.now() - t0).toFixed(0)}ms)`);
  }
  const t = creature(s.id);
  console.log(s.id.padEnd(22), `${s.realLength}m->${s.length}m`.padEnd(14), 'tris', row.join(' / ').padEnd(44), 'bones', String(t.bones).padEnd(3), 'clips', t.clips.map(c => c.name).join(','));
}
console.log(failed ? `${failed} FAILED` : 'all species build cleanly');
process.exit(failed ? 1 : 0);
