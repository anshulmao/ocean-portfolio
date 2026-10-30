// Audit of the reef's corals and animals in the real world, headless.
//
// Corals: every colony of the coral set (user-corals.js), every coral of the procedural reef (reef.js) and the hero
// formations are measured against the seabed as it is drawn (the sculpted lattice, not the smooth height function),
// against the landmarks (anchor, wreck, treasure), the arch, the formations and the open-sand sites of the living world,
// and against their own collision proxies.
// Animals: the creature set (user-creatures.js) is stepped by hand, frame by frame, and every animal and school fish is
// sampled: which way it faces against the way it moves, how it banks, whether any part of it is in the seabed or the
// reef, whether residents keep to their habitat, whether schools hold together and keep off the diver, and how each
// encounter comes and goes. The same stretch is run at 30, 60 and 120 Hz to check nothing depends on the frame rate.
//
//   node tools/audit-reef.mjs [url] [--quick] [--quality=economy|standard|both] [--json=report.json]
//
// With no url it serves ocean-refined/ itself (the source, as `npm run dev` does). The full audit (both qualities, every
// encounter from three spots) takes about a quarter of an hour under software rendering, most of it loading the world;
// --quick (economy, from the middle of the reef; the CI job) about five minutes. Exits non-zero when any check fails.
// PLAYWRIGHT_CHROMIUM_PATH picks the browser (tools/browser.mjs).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), site = path.join(root, 'ocean-refined');
const args = process.argv.slice(2), flag = name => args.find(a => a.startsWith(`--${name}`))?.split('=')[1] ?? (args.includes(`--${name}`) ? true : undefined);
const target = args.find(a => !a.startsWith('--'));
// How much is run: --quick one quality and the middle of the reef, otherwise everything.
const ALL = ['whale', 'whale-shark', 'orcas', 'dolphins', 'blacktips', 'tuna'];
const mode = flag('quick') ? {qualities: ['economy'], resident: 30, encounters: ALL, spots: ['middle'], schools: 20, rates: 10}
  : {qualities: ['economy', 'standard'], resident: 90, encounters: ALL, spots: ['shallow', 'middle', 'deep'], schools: 60, rates: 20};
const qualities = (flag('quality') && flag('quality') !== 'both') ? [flag('quality')] : mode.qualities;
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.rgba': 'application/octet-stream'};
let server = null;
if (!target) {
  server = http.createServer(async (request, response) => {
    let file = path.join(site, decodeURIComponent(new URL(request.url, 'http://local').pathname));
    if (!file.startsWith(site)) { response.writeHead(403).end(); return; }
    try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html'); response.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'}); response.end(await fs.readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}
const base = target ? new URL(target).href : `http://127.0.0.1:${server.address().port}/`;

// --- In the page ------------------------------------------------------------------------------------------------------
// Installs window.reefAudit. Self-contained: it is serialised into the page.
function install() {
  const C = window.oceanControls, L = C.viewer.layers(), reef = L.reef, THREE = reef.constructor.prototype.isObject3D ? null : null;
  const V = () => new reef.position.constructor();   // a THREE.Vector3 without importing three here
  const Box = () => new (reef.userData.collisions.boxes[0].box.constructor)();
  const terrain = reef.userData.terrainHeightAt;
  // The seabed as drawn: the sculpted lattice, two triangles a cell, plus its 5 cm ripple.
  const sand = reef.children.find(child => child.name === 'Sculpted reef shelf and abyss drop-off');
  const sp = sand.geometry.getAttribute('position'), cols = sand.geometry.parameters.widthSegments + 1, rows = sand.geometry.parameters.heightSegments + 1;
  const xs = Array.from({length: cols}, (_, i) => sp.getX(i)), zs = Array.from({length: rows}, (_, j) => sp.getZ(j * cols));
  const find = (list, v) => { let lo = 0, hi = list.length - 2; if (v <= list[0]) return 0; if (v >= list[hi + 1]) return hi; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (list[mid] <= v) lo = mid; else hi = mid - 1; } return lo; };
  const H = (i, j) => sp.getY(j * cols + i);
  function floor(x, z) {
    const i = find(xs, x), j = find(zs, z), u = Math.min(1, Math.max(0, (x - xs[i]) / (xs[i + 1] - xs[i]))), v = Math.min(1, Math.max(0, (z - zs[j]) / (zs[j + 1] - zs[j])));
    const a = H(i, j), b = H(i, j + 1), c = H(i + 1, j + 1), d = H(i + 1, j);
    return u + v <= 1 ? a + u * (d - a) + v * (b - a) : c + (1 - u) * (b - c) + (1 - v) * (d - c);
  }
  const boxes = reef.userData.collisions.boxes;
  const solidBoxes = () => boxes.filter(b => b.kind !== 'user-coral-ignore');
  // Landmarks (the anchor, the wreck, the treasure): their visible models.
  const landmarkBoxes = (L.models?.children || []).filter(c => /placement wrapper/.test(c.name)).map(c => ({name: c.name.replace(' placement wrapper', ''), box: Box().setFromObject(c), object: c}));
  // The landmarks' surfaces, as 0.4 m cells: a point in one of those cells is on (or in) the anchor, wreck or chest.
  // Their bounding boxes take in a lot of open water beside a hull, so they are only the broad test.
  const surface = new Map(), CELL = .4, key = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
  for (const landmark of landmarkBoxes) {
    landmark.object.updateWorldMatrix(true, true);
    const a = V(), b = V(), c = V(), p = V();
    landmark.object.traverseVisible(node => {
      if (!node.isMesh || !node.geometry?.attributes.position) return;
      const g = node.geometry, count = g.index?.count ?? g.attributes.position.count, vertex = (i, out) => node.getVertexPosition(g.index ? g.index.getX(i) : i, out).applyMatrix4(node.matrixWorld);
      for (let i = 0; i + 2 < count; i += 3) {
        vertex(i, a); vertex(i + 1, b); vertex(i + 2, c);
        const steps = Math.min(40, Math.ceil(Math.max(a.distanceTo(b), a.distanceTo(c), b.distanceTo(c)) / (CELL * .7)));
        for (let u = 0; u <= steps; u++) for (let v = 0; v <= steps - u; v++) { p.copy(a).multiplyScalar(1 - (u + v) / Math.max(1, steps)).addScaledVector(b, u / Math.max(1, steps)).addScaledVector(c, v / Math.max(1, steps)); surface.set(key(p.x, p.y, p.z), landmark.name); }
      }
    });
  }
  const onLandmark = (x, y, z) => surface.get(key(x, y, z)) || '';
  const arch = boxes.filter(b => /^Arch|arch/i.test(b.mesh || '')).map(b => ({name: b.mesh, box: b.box}));
  const formations = C.formations.map(f => ({name: f.name, x: f.position[0], y: f.position[1], z: f.position[2], radius: f.radius, height: f.height}));
  const life = (C.life?.sites || []).map(s => ({id: s.id, name: s.name, kind: s.kind, x: s.position[0], y: s.position[1], z: s.position[2], radius: s.radius}));
  const round = v => Math.round(v * 100) / 100, at = (x, y, z) => [round(x), round(y), round(z)];
  const inBox = (b, x, y, z, pad = 0) => x > b.min.x - pad && x < b.max.x + pad && y > b.min.y - pad && y < b.max.y + pad && z > b.min.z - pad && z < b.max.z + pad;
  window.reefAudit = {floor, terrain, boxes, landmarkBoxes, onLandmark, arch, formations, life, at, inBox, round, V, Box,
    describe: () => ({landmarks: landmarkBoxes.map(l => ({name: l.name, min: at(l.box.min.x, l.box.min.y, l.box.min.z), max: at(l.box.max.x, l.box.max.y, l.box.max.z)})), arch: arch.map(a => a.name), collisionKinds: boxes.reduce((m, b) => (m[b.kind] = (m[b.kind] || 0) + 1, m), {}), cover: (() => { const D = C.creatures?.debug; if (!D?.cover) return null; const w = landmarkBoxes.find(l => l.name === 'experience'); const c = D.cover((w.box.min.x + w.box.max.x) / 2, (w.box.min.z + w.box.max.z) / 2); return {covered: c.covered, boxes: boxes.length, overWreck: round(c.hard), wreckTop: round(w.box.max.y)}; })(), drawnVsSmooth: (() => { let worst = 0; for (let x = -60; x <= 60; x += 1.7) for (let z = -104; z <= 34; z += 1.9) worst = Math.max(worst, Math.abs(floor(x, z) - terrain(x, z))); return round(worst); })()})};
}

// The coral set and the hero formations, measured against the drawn seabed and what stands on it.
function auditCorals() {
  const A = window.reefAudit, C = window.oceanControls, L = C.viewer.layers(), out = [], note = [], {floor, at, inBox, round} = A;
  const flag = (check, subject, where, detail) => out.push({check, subject, where, detail});
  const placements = L.corals?.userData.placements || [];
  // Per instance of each species: world vertices from every part of that species.
  const bySpecies = new Map();
  for (const mesh of L.corals?.children || []) { if (!mesh.isInstancedMesh) continue; const list = bySpecies.get(mesh.userData.species) || []; list.push(mesh); bySpecies.set(mesh.userData.species, list); }
  const M = new (L.corals.matrix.constructor)(), v = A.V();
  const colonies = [];
  for (const [species, meshes] of bySpecies) {
    const count = meshes[0].count, records = placements.filter(p => p.species === species);
    for (let i = 0; i < count; i++) {
      let minClear = Infinity, baseLow = Infinity, baseHigh = -Infinity, top = -Infinity;
      const min = A.V().set(Infinity, Infinity, Infinity), max = A.V().set(-Infinity, -Infinity, -Infinity), verts = [];
      for (const mesh of meshes) {
        mesh.getMatrixAt(i, M); const p = mesh.geometry.getAttribute('position');
        for (let k = 0; k < p.count; k += (p.count > 3000 ? 3 : 1)) {
          v.fromBufferAttribute(p, k); const local = v.y; v.applyMatrix4(M);
          const clear = v.y - floor(v.x, v.z); minClear = Math.min(minClear, clear); top = Math.max(top, clear);
          if (local <= .012) { baseLow = Math.min(baseLow, clear); baseHigh = Math.max(baseHigh, clear); }
          min.min(v); max.max(v); verts.push(v.x, v.y, v.z);
        }
      }
      const rec = records[i] || {}, c = min.clone().add(max).multiplyScalar(.5);
      colonies.push({species, i, x: c.x, z: c.z, px: rec.x, pz: rec.z, y: min.y, min, max, verts, zone: rec.zone, depth: rec.depth, width: rec.width});
      const where = at(c.x, min.y, c.z), name = `${species} #${i}`;
      // A colony stands on the drawn seabed: its base touches it, and no edge of the base hangs over a dip.
      if (baseLow > .04) flag('coral.floating', name, where, `base ${round(baseLow)} m above the drawn seabed`);
      if (baseHigh > .2) flag('coral.overhang', name, where, `an edge of the base ${round(baseHigh)} m above the drawn seabed`);
      if (top < .05) flag('coral.buried', name, where, 'entirely under the seabed');
      // Clear of the landmarks, the arch and the formations.
      for (const {name: what, box} of A.arch) {
        let inside = 0; for (let k = 0; k < verts.length; k += 3) if (inBox(box, verts[k], verts[k + 1], verts[k + 2], .3)) inside++;
        if (inside) flag('coral.intersects', name, where, `${inside} vertices inside ${what}`);
      }
      { const hits = {}; for (let k = 0; k < verts.length; k += 3) { const hit = A.onLandmark(verts[k], verts[k + 1], verts[k + 2]); if (hit) hits[hit] = (hits[hit] || 0) + 1; } for (const [what, n] of Object.entries(hits)) flag('coral.intersects', name, where, `${n} vertices in the ${what} model`); }
      for (const f of A.formations) { const d = Math.hypot(c.x - f.x, c.z - f.z); if (d < f.radius + (rec.width || 1) * .4) flag('coral.intersects', name, where, `${round(d)} m from the centre of ${f.name} (radius ${f.radius})`); }
      // Not on the sand the rays, garden eels, crabs and vents need, nor on an anemone or a den.
      // (Crabs walk among coral and the behaviour sites are mid-water: those are not counted.)
      for (const s of A.life) { if (!['hidden', 'colony', 'resident'].includes(s.kind) && !/^vent/.test(s.id)) continue; const d = Math.hypot((rec.x ?? c.x) - s.x, (rec.z ?? c.z) - s.z); if (d < s.radius + (rec.width || 1) * .4) flag('coral.habitat', name, where, `on ${s.name} (${s.id}), ${round(d)} m from its centre`); }
      // Grows where the depth suits it.
      const depth = -floor(c.x, c.z), band = {shallow: [5, 18], mid: [18, 34], deep: [34, 65]}[rec.zone];
      if (band && (depth < band[0] - .5 || depth > band[1] + .5)) flag('coral.depth', name, where, `${round(depth)} m deep, outside its ${rec.zone} band ${band.join('–')} m`);
      // Slope across the footprint, on the drawn seabed.
      let lo = Infinity, hi = -Infinity; const r = Math.max(.3, (max.x - min.x + max.z - min.z) / 4);
      for (let a = 0; a < 8; a++) { const h = floor(c.x + Math.cos(a * Math.PI / 4) * r, c.z + Math.sin(a * Math.PI / 4) * r); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      if ((hi - lo) / (2 * r) > .45) flag('coral.slope', name, where, `seabed rises ${round((hi - lo) / (2 * r))} m a metre across its footprint`);
    }
  }
  // Collision proxies: each colony large enough to have one, and the proxy inside what is drawn.
  const proxies = A.boxes.filter(b => b.kind === 'user-coral');
  for (const col of colonies) {
    const size = col.max.clone().sub(col.min), mine = proxies.filter(b => b.species === col.species && inBox(b.box, (col.min.x + col.max.x) / 2, (col.min.y + col.max.y) / 2, (col.min.z + col.max.z) / 2));
    if (!mine.length) { if (size.y > .5 && Math.max(size.x, size.z) > .6) flag('coral.proxy', `${col.species} #${col.i}`, at(col.x, col.y, col.z), `no collision proxy for a colony ${round(size.x)}×${round(size.y)}×${round(size.z)} m`); continue; }
    const p = mine[0].box; let inside = 0; for (let k = 0; k < col.verts.length; k += 3) if (inBox(p, col.verts[k], col.verts[k + 1], col.verts[k + 2])) inside++;
    col.proxyCover = inside / (col.verts.length / 3);
    const over = Math.max(col.min.x - p.min.x, p.max.x - col.max.x, col.min.y - p.min.y, p.max.y - col.max.y, col.min.z - p.min.z, p.max.z - col.max.z);
    if (over > .25) flag('coral.proxy', `${col.species} #${col.i}`, at(col.x, col.y, col.z), `collision proxy reaches ${round(over)} m beyond the drawn colony`);
  }
  // Colonies standing in each other.
  for (let a = 0; a < colonies.length; a++) for (let b = a + 1; b < colonies.length; b++) {
    const p = colonies[a], q = colonies[b], d = Math.hypot((p.px ?? p.x) - (q.px ?? q.x), (p.pz ?? p.z) - (q.pz ?? q.z)), rp = Math.min(p.max.x - p.min.x, p.max.z - p.min.z) / 2, rq = Math.min(q.max.x - q.min.x, q.max.z - q.min.z) / 2;
    if (d < (rp + rq) * .5) flag('coral.crowded', `${p.species} #${p.i} / ${q.species} #${q.i}`, at(p.x, p.y, p.z), `${round(d)} m apart, trunks ${round(rp)} and ${round(rq)} m`);
  }
  // Gardens: patches of one depth band laid on top of another's make a dense knot with empty reef around it.
  const patches = window.oceanDiagnostics.userCorals?.patches || [];
  for (let a = 0; a < patches.length; a++) for (let b = a + 1; b < patches.length; b++) {
    const p = patches[a], q = patches[b], d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d < p.radius + q.radius) flag('coral.cluster', `${p.zone} garden at ${p.x},${p.z} / ${q.zone} garden at ${q.x},${q.z}`, at(p.x, -p.depth, p.z), `${round(d)} m apart: gardens of radius ${p.radius} overlap`);
  }
  // The formations: on ground they can stand on, clear of the landmarks.
  for (const f of A.formations) {
    let lo = Infinity, hi = -Infinity; for (let a = 0; a < 16; a++) { const h = floor(f.x + Math.cos(a * Math.PI / 8) * f.radius * .6, f.z + Math.sin(a * Math.PI / 8) * f.radius * .6); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    note.push({formation: f.name, depth: round(-f.y), footprintRise: round(hi - lo)});
    for (const {name, box} of A.landmarkBoxes) { const dx = Math.max(box.min.x - f.x, 0, f.x - box.max.x), dz = Math.max(box.min.z - f.z, 0, f.z - box.max.z); if (Math.hypot(dx, dz) < f.radius) flag('formation.intersects', f.name, at(f.x, f.y, f.z), `within ${round(Math.hypot(dx, dz))} m of ${name}`); }
  }
  const counts = {}; for (const c of colonies) { const key = `${c.zone}`; counts[key] = (counts[key] || 0) + 1; }
  return {violations: out, notes: note, colonies: colonies.length, proxyCover: round(colonies.filter(c => c.proxyCover !== undefined).reduce((s, c) => s + c.proxyCover, 0) / Math.max(1, colonies.filter(c => c.proxyCover !== undefined).length)), zones: counts};
}

// The procedural reef's corals (reef.js), captured as they were placed (see the hook in main()).
function auditReefFamilies() {
  const A = window.reefAudit, families = window.__reefFamilies || [], out = [], summary = {}, {floor, at, inBox, round} = A;
  if (!families.length) return {violations: [], summary: null};
  // Families that stand on the sand themselves; the rest (branches, tips, polyps, tentacles) grow from something else.
  const GROUNDED = /outcrops|carpets|brain coral|tube sponges|barrel sponge|boulder coral|sea fans|sea whips|grass|cushions|meadow/i, BUILT = /staghorn|table corals|coral tips/i;
  const built = [];
  const v = A.V();
  // A coral may grow on one of its colony's rocks as well as on the sand: the rocks as ellipsoids (their chiselled
  // surface swells to 1.27 of the unit sphere and sinks to 0.73, hence the two margins).
  const rocks = [], rockSpot = A.V(), rockScale = A.V(), rockTurn = new (window.oceanControls.getCamera().quaternion.constructor)();
  for (const entry of families.find(f => f.name === 'Limestone outcrops')?.entries || []) {
    entry.matrix.decompose(rockSpot, rockTurn, rockScale);
    rocks.push({x: rockSpot.x, y: rockSpot.y, z: rockSpot.z, rx: rockScale.x, ry: rockScale.y, rz: rockScale.z, inverse: rockTurn.clone().invert()});
  }
  const rockCells = new Map(), rockKey = (x, z) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
  for (const r of rocks) { const reach = Math.max(r.rx, r.rz) * 1.3; for (let x = r.x - reach; x <= r.x + reach + 4; x += 4) for (let z = r.z - reach; z <= r.z + reach + 4; z += 4) { const k = rockKey(Math.min(x, r.x + reach), Math.min(z, r.z + reach)); const list = rockCells.get(k) || []; if (!list.includes(r)) list.push(r); rockCells.set(k, list); } }
  // Where the vertical line at x,z leaves the rock's turned, tilted ellipsoid (radii scaled by margin).
  const ra = A.V(), rb = A.V();
  const rockTop = (x, z, margin) => {
    let top = -Infinity;
    for (const r of rockCells.get(rockKey(x, z)) || []) {
      ra.set(x - r.x, 0, z - r.z).applyQuaternion(r.inverse); rb.set(0, 1, 0).applyQuaternion(r.inverse);
      const ex = (r.rx * margin) ** 2, ey = (r.ry * margin) ** 2, ez = (r.rz * margin) ** 2, qa = rb.x * rb.x / ex + rb.y * rb.y / ey + rb.z * rb.z / ez;
      const qb = 2 * (ra.x * rb.x / ex + ra.y * rb.y / ey + ra.z * rb.z / ez), qc = ra.x * ra.x / ex + ra.y * ra.y / ey + ra.z * ra.z / ez - 1, disc = qb * qb - 4 * qa * qc;
      if (disc >= 0) top = Math.max(top, r.y + (-qb + Math.sqrt(disc)) / (2 * qa));
    }
    return top;
  };
  for (const family of families) {
    const p = family.geometry.getAttribute('position'), step = Math.max(1, Math.floor(p.count / 160)), grounded = GROUNDED.test(family.name);
    const s = summary[family.name] = {count: family.entries.length, grounded, floating: 0, buried: 0, intersects: 0, worstFloat: 0};
    for (const entry of family.entries) {
      let minClear = Infinity, maxClear = -Infinity, inside = '';
      for (let k = 0; k < p.count; k += step) {
        v.fromBufferAttribute(p, k).applyMatrix4(entry.matrix);
        const sand = floor(v.x, v.z), onRock = family.name === 'Limestone outcrops' ? -Infinity : rockTop(v.x, v.z, 1.27);
        minClear = Math.min(minClear, v.y - Math.max(sand, onRock)); maxClear = Math.max(maxClear, v.y - Math.max(sand, family.name === 'Limestone outcrops' ? -Infinity : rockTop(v.x, v.z, .73)));
        if (!inside) { inside = A.onLandmark(v.x, v.y, v.z); if (!inside) for (const {name, box} of A.arch) if (inBox(box, v.x, v.y, v.z, -.05)) { inside = name; break; } }
      }
      const e = entry.matrix.elements, where = at(e[12], e[13], e[14]), outside = Math.abs(e[12]) > 62 || e[14] < -105 || e[14] > 35;
      // Beyond the swim area, seen only through the haze, nothing is reported (a branching colony still counts the
      // pieces there, so one that straddles the edge is judged whole).
      if (outside && !BUILT.test(family.name)) continue;
      // Massive and branching corals need a footing: not on a face steeper than 45°. (Tube sponges, fans, whips and
      // encrusting corals grow on walls.)
      if (/brain coral|barrel sponge|boulder coral/i.test(family.name) && minClear < .3) {
        const slope = Math.hypot(floor(e[12] + .5, e[14]) - floor(e[12] - .5, e[14]), floor(e[12], e[14] + .5) - floor(e[12], e[14] - .5));
        if (slope > 1) { (s.cliff = (s.cliff || 0) + 1); out.push({check: 'reef.cliff', subject: family.name, where, detail: `on a face rising ${round(slope)} m a metre`}); }
      }
      if (BUILT.test(family.name)) { const box = A.Box().setFromBufferAttribute(p).applyMatrix4(entry.matrix); built.push({box, minClear, name: family.name, where, outside, x: e[12], z: e[14]}); }
      if (outside) continue;
      if (family.name !== 'Hidden rounded coral colony collision volumes' && inside) { s.intersects++; out.push({check: 'reef.intersects', subject: family.name, where, detail: `inside ${inside}`}); }
      if (grounded && minClear > .08) { s.floating++; s.worstFloat = Math.max(s.worstFloat, round(minClear)); out.push({check: 'reef.floating', subject: family.name, where, detail: `lowest point ${round(minClear)} m above the drawn seabed`}); }
      // (Sea grass, carpets and anemones laid on the sand where a rock later stood are out of sight, not misplaced; the
      // polyps go with the sponge or whip they tip.)
      if (maxClear < -.02 && !/collision|grass|carpets|anemone|polyps/i.test(family.name)) { s.buried++; out.push({check: 'reef.buried', subject: family.name, where, detail: `entirely under the seabed or inside a rock (top ${round(maxClear)} m)`}); }
    }
  }
  // Branching and table corals are built of pieces: each colony (pieces that touch) must reach the seabed somewhere.
  const parent = built.map((_, i) => i), top = i => parent[i] === i ? i : (parent[i] = top(parent[i]));
  const cells = new Map(), cell = (x, z) => `${Math.floor(x / 3)},${Math.floor(z / 3)}`;
  built.forEach((b, i) => { for (let x = Math.floor(b.box.min.x / 3); x <= Math.floor(b.box.max.x / 3); x++) for (let z = Math.floor(b.box.min.z / 3); z <= Math.floor(b.box.max.z / 3); z++) { const k = `${x},${z}`; const list = cells.get(k) || []; for (const j of list) if (built[j].box.clone().expandByScalar(.03).intersectsBox(b.box)) parent[top(i)] = top(j); list.push(i); cells.set(k, list); } });
  const colonies = new Map(); built.forEach((b, i) => { const r = top(i), c = colonies.get(r) || {low: Infinity, pieces: 0, where: b.where, name: b.name, inside: false}; if (b.minClear < c.low) { c.low = b.minClear; c.foot = b; } c.pieces++; c.inside ||= !b.outside; colonies.set(r, c); });
  // Its footing is where its lowest piece meets the ground: not a face steeper than 45°.
  for (const c of colonies.values()) {
    const {x, z} = c.foot, slope = Math.hypot(floor(x + .5, z) - floor(x - .5, z), floor(x, z + .5) - floor(x, z - .5));
    if (c.inside && c.low < .3 && slope > 1) { summary[c.name].cliff = (summary[c.name].cliff || 0) + 1; out.push({check: 'reef.cliff', subject: c.name, where: c.foot.where, detail: `a colony footed on a face rising ${round(slope)} m a metre`}); }
  }
  for (const c of colonies.values()) if (c.low > .08 && c.inside) { (summary[c.name].floating++, summary[c.name].worstFloat = Math.max(summary[c.name].worstFloat, round(c.low))); out.push({check: 'reef.floating', subject: c.name, where: c.where, detail: `a colony of ${c.pieces} pieces whose lowest point is ${round(c.low)} m above the drawn seabed`}); }
  return {violations: out, summary};
}

// The creature set, stepped by hand. Returns the samples' verdicts.
async function auditCreatures({seconds, rate, player, spawn, label, until = 0, castOnly = true}) {
  const A = window.reefAudit, C = window.oceanControls, U = C.creatures, D = U.debug, {floor, at, inBox, round} = A, out = [];
  const flag = (check, subject, where, detail) => out.push({check, subject, where, detail, run: label});
  const P = C.getPlayerPosition().clone(); if (player) P.set(...player);
  if (spawn) D.spawn(spawn, P, null);
  const dt = 1 / rate, frames = Math.round(Math.max(seconds, until) * rate);
  // An encounter run follows the visitors only, until its slot is empty again (or `until` seconds).
  const cast = spawn && castOnly ? new Set() : null;
  const solid = A.boxes.filter(b => b.kind !== 'user-coral' || true);
  const insideSolid = (x, y, z) => { for (const b of solid) if (inBox(b.box, x, y, z, -.1)) return b.mesh || b.kind; const hit = A.onLandmark(x, y, z); return hit ? `the ${hit} model` : ''; };
  const prev = new Map(), stats = new Map(), encounter = {starts: [], samples: []};
  const BOTTOM = /bluespotted-ray|nurse-shark|garden-eel|giant-moray|ribbon-eel/;
  const stat = key => { let s = stats.get(key); if (!s) stats.set(key, s = {moving: 0, sideways: 0, backwards: 0, streak: 0, worstStreak: 0, clipFloor: 0, clipSolid: 0, worstDepth: 0, solidName: '', where: null, solidWhere: null, sideWhere: null, rollTurn: 0, turnSamples: 0, wrongBank: 0, clipMismatch: 0, clipWhere: null, distance: 0, time: 0, minDiver: Infinity, maxY: -Infinity, shallow: Infinity, shallowWhere: null, path: []}); return s; };
  function sample(key, species, x, y, z, yaw, pitch, roll, length, clip, frame, bottom) {
    const s = stat(key), last = prev.get(key); prev.set(key, {x, y, z, yaw});
    s.minDiver = Math.min(s.minDiver, Math.hypot(x - P.x, y - P.y, z - P.z)); s.maxY = Math.max(s.maxY, y); s.time += dt;
    if (frame % Math.max(1, Math.round(rate / 4)) === 0) s.path.push([round(x), round(y), round(z)]);
    const fx = Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = Math.cos(yaw) * Math.cos(pitch);
    // The body: nose, middle and tail, against the drawn seabed and the solid reef.
    const denned = /moray|ribbon-eel|garden-eel/.test(species);
    if (!denned) for (const t of [.45, 0, -.45]) {
      const px = x + fx * length * t, py = y + fy * length * t, pz = z + fz * length * t, under = py - floor(px, pz);
      if (under < (bottom ? -.25 : -.05)) { s.clipFloor++; if (under < s.worstDepth) { s.worstDepth = under; s.where = at(px, py, pz); } }
      const hit = insideSolid(px, py, pz); if (hit) { s.clipSolid++; s.solidName = hit; s.solidWhere = at(px, py, pz); }
    }
    s.shallow = Math.min(s.shallow, -floor(x, z)); if (s.shallow === -floor(x, z)) s.shallowWhere = at(x, y, z);
    if (!last) return;
    const vx = (x - last.x) / dt, vz = (z - last.z) / dt, speed = Math.hypot(vx, vz), moving = Math.hypot(vx, (y - last.y) / dt, vz); s.distance += speed * dt;
    // Which way it moves against which way it faces (horizontal), once it is moving at all.
    if (speed > Math.max(.2, length * .12)) {
      s.moving++; const off = Math.abs(Math.atan2(Math.sin(Math.atan2(vx, vz) - yaw), Math.cos(Math.atan2(vx, vz) - yaw)));
      if (off > Math.PI * 2 / 3) s.backwards++; else if (off > Math.PI / 3) s.sideways++;
      s.streak = off > Math.PI / 3 ? s.streak + dt : 0; if (s.streak > s.worstStreak) { s.worstStreak = s.streak; s.sideWhere = at(x, y, z); }
    } else s.streak = 0;
    // Banking: rolled into the turn (yaw rising = turning to its left = left side, +x local, down = negative roll).
    const turn = Math.atan2(Math.sin(yaw - last.yaw), Math.cos(yaw - last.yaw)) / dt;
    if (roll !== null && Math.abs(turn) > .25 && Math.abs(roll) > .02) { s.turnSamples++; if (Math.sign(roll) === Math.sign(turn)) s.wrongBank++; }
    // The clip matches the motion: no resting clip on the move, no stroke while lying still.
    // (Rising or sinking counts as swimming here: a ray pulling up over a coral head moves vertically.)
    if (clip && ((/rest|breathe|sway/.test(clip) && moving > .6) || (/swim|fast/.test(clip) && moving < .02 && !bottom))) { s.clipMismatch++; s.clipWhere = `${clip} at ${round(moving)} m/s`; s.clipRun = (s.clipRun || 0) + dt; s.clipLongest = Math.max(s.clipLongest || 0, s.clipRun); }
    else s.clipRun = 0;
  }
  // Instanced fish, read back from their meshes in the order the groups were packed.
  const meshes = new Map(); U.root.traverse(n => { if (n.isInstancedMesh) meshes.set(n.name.replace(/^Creature set · | \(\d+\)$/g, ''), n); });
  const M = new (U.root.matrix.constructor)(), pos = A.V(), quat = new (U.root.quaternion.constructor)(), scl = A.V(), euler = new (U.root.rotation.constructor)(0, 0, 0, 'YXZ');
  for (let frame = 0; frame < frames; frame++) {
    U.update(dt, P, null);
    if (cast && frame > rate && frame / rate >= seconds && !D.slots().some(s => s.active === spawn)) break;
    for (const [index, a] of D.actors().entries()) {
      if (!a.active) { prev.delete(`actor:${a.name}@${index}`); continue; }
      if (cast && !/whale|orca|dolphin|blacktip|remora/.test(a.species)) continue;
      const bottom = BOTTOM.test(a.species) || /remora/.test(a.species);
      sample(`actor:${a.name}@${index}`, a.species, a.x, a.y, a.z, a.yaw, a.pitch, a.roll, a.length, a.clip, frame, bottom);
    }
    const packed = new Map();
    for (const [index, g] of D.groups().entries()) {
      if (!g.active || !g.shown) continue;
      const mesh = meshes.get(g.species); if (!mesh) continue;
      const start = packed.get(mesh) || 0; packed.set(mesh, start + g.count);
      if (g.kind === 'burrows' || (cast && g.kind !== 'encounter')) continue;
      const length = 0; // fish under a metre: the centre is the check
      for (let i = 0; i < g.count; i++) {
        mesh.getMatrixAt(start + i, M); M.decompose(pos, quat, scl); euler.setFromQuaternion(quat, 'YXZ');
        sample(`fish:${g.name}#${index}:${i}`, g.species, pos.x, pos.y, pos.z, euler.y, -euler.x, euler.z, scl.x * .6, null, frame, false);
      }
    }
    for (const v of C.visitors()) encounter.samples.push([v.id, round(v.x), round(v.y), round(v.z)]);
  }
  // Verdicts.
  const summary = {};
  for (const [key, s] of stats) {
    const [kind, name] = [key.split(':')[0], key.slice(key.indexOf(':') + 1)], group = kind === 'fish' ? name.replace(/:\d+$/, '') : name, subject = group;
    const g = summary[group] ??= {samples: 0, moving: 0, sideways: 0, backwards: 0, clipFloor: 0, clipSolid: 0, wrongBank: 0, turnSamples: 0, clipMismatch: 0, minDiver: Infinity, members: 0, distance: 0};
    g.members++; g.moving += s.moving; g.sideways += s.sideways; g.backwards += s.backwards; g.clipFloor += s.clipFloor; g.clipSolid += s.clipSolid; g.wrongBank += s.wrongBank; g.turnSamples += s.turnSamples; g.clipMismatch += s.clipMismatch; g.minDiver = Math.min(g.minDiver, s.minDiver); g.distance += s.distance;
    if (s.moving > 10 && (s.sideways + s.backwards) / s.moving > .05) flag('swim.sideways', subject, s.sideWhere, `${round(100 * s.sideways / s.moving)}% of its moving time sideways, ${round(100 * s.backwards / s.moving)}% backwards; longest ${round(s.worstStreak)} s`);
    if (s.clipFloor) flag('swim.seabed', subject, s.where, `${s.clipFloor} body samples under the drawn seabed, deepest ${round(-s.worstDepth)} m`);
    if (s.clipSolid) flag('swim.reef', subject, s.solidWhere, `${s.clipSolid} body samples inside ${s.solidName}`);
    if (s.turnSamples > 10 && s.wrongBank / s.turnSamples > .2) flag('swim.bank', subject, null, `banks out of the turn ${round(100 * s.wrongBank / s.turnSamples)}% of the time`);
    // A clip fading in or out as an animal starts or stops is not counted: a second or more at a time is.
    if (s.clipLongest >= 1) flag('swim.clip', subject, null, `${round(s.clipMismatch / rate)} s on the wrong clip, up to ${round(s.clipLongest)} s at a time (${s.clipWhere})`);
  }
  for (const g of Object.values(summary)) { g.minDiver = round(g.minDiver); g.distance = round(g.distance); }
  const actors = D.actors().map(a => ({name: a.name, species: a.species, active: a.active, clip: a.clip, at: at(a.x, a.y, a.z), floor: round(floor(a.x, a.z)), yaw: round(a.yaw)}));
  const paths = {}; for (const [key, s] of stats) if (key.startsWith('actor:') || /#\d+:0$/.test(key)) paths[key] = {path: s.path, shallow: round(s.shallow), shallowWhere: s.shallowWhere, maxY: round(s.maxY), minDiver: round(s.minDiver), distance: round(s.distance)};
  return {violations: out, summary, actors, paths, encounter, slots: D.slots()};
}

// Schools: do they hold together, and do they keep off a diver who swims into them?
function auditSchools({seconds, rate}) {
  const A = window.reefAudit, C = window.oceanControls, U = C.creatures, D = U.debug, {at, round} = A, out = [], dt = 1 / rate;
  const P = C.getPlayerPosition().clone();
  // Cohesion: the shoals and herds, from the navigators themselves.
  const widest = new Map(), last = new Map();
  P.set(0, 5, 200);   // a diver far away: nothing to avoid
  for (let f = 0; f < seconds * rate; f++) {
    U.update(dt, P, null);
    const byGroup = new Map(); D.swimmers().forEach((m, i) => { const list = byGroup.get(m.group) || []; list.push(m); byGroup.set(m.group, list);
      // A stall: hardly moving for a second or more while its group swims on (a grazing herd stops on purpose: its
      // pace is in m.speed... so only stalls longer than a graze, 12 s, or of a swimmer whose group is moving).
      const before = last.get(i); last.set(i, {x: m.x, z: m.z, still: before && Math.hypot(m.x - before.x, m.z - before.z) / dt < m.speed * .1 ? before.still + dt : 0});
      m.still = last.get(i).still; });
    for (const [group, list] of byGroup) {
      if (list.length < 2) { const m = list[0], w = widest.get(group) || {far: 0, blocked: 0, samples: 0, species: m.species}; w.stall = Math.max(w.stall || 0, m.still); w.blocked += m.blocked ? 1 : 0; w.samples++; w.where = at(m.x, m.y, m.z); const off = Math.hypot((m.x - m.route[0]) / (m.route[2] + 4), (m.z - m.route[1]) / (m.route[3] + 4)); w.off = Math.max(w.off || 0, off); if (off > 1.5) { w.away = (w.away || 0) + 1; w.awayWhere = w.where; } widest.set(group, w); continue; }
      const cx = list.reduce((s, m) => s + m.x, 0) / list.length, cy = list.reduce((s, m) => s + m.y, 0) / list.length, cz = list.reduce((s, m) => s + m.z, 0) / list.length;
      const far = Math.max(...list.map(m => Math.hypot(m.x - cx, m.y - cy, m.z - cz))), w = widest.get(group) || {far: 0, blocked: 0, samples: 0, species: list[0].species};
      // Off its beat: further from its loop than half as much again as the loop itself.
      for (const m of list) { const [rx0, rz0, rx, rz] = m.route, off = Math.hypot((m.x - rx0) / (rx + 4), (m.z - rz0) / (rz + 4)); w.off = Math.max(w.off || 0, off); if (off > 1.5) { w.away = (w.away || 0) + 1; w.awayWhere = at(m.x, m.y, m.z); } }
      w.stall = Math.max(w.stall || 0, ...list.map(m => m.still)); w.far = Math.max(w.far, far); w.blocked += list.filter(m => m.blocked).length; w.samples += list.length; if (far >= w.far) w.where = at(cx, cy, cz); widest.set(group, w);
    }
  }
  const groups = D.groups(), cohesion = {};
  for (const [group, w] of widest) {
    const g = groups.find((item, index) => group === `${item.name} #${index}`) || null, expected = g ? Math.max(6, (g.spread?.[0] || 4) * .75 + 6, g.spread?.[0] === 0 ? g.radius + 1 : 0) : 12;
    cohesion[group] = {widest: round(w.far), expected: round(expected), blocked: round(w.blocked / w.samples), off: round(w.off || 0), stall: round(w.stall || 0)};
    // A fish working round a formation may go well out from a small loop now and then; off its beat for long, or
    // far off it at all, it has lost its way.
    if ((w.off || 0) > 2.5 || (w.away || 0) > .2 * w.samples) out.push({check: 'resident.strays', subject: group, where: w.awayWhere, detail: `${w.away} samples well off its loop (furthest ${round(w.off)} loop radii out)`});
    if (w.far && w.far > expected) out.push({check: 'school.scattered', subject: group, where: w.where, detail: `a member strays ${round(w.far)} m from the school's middle (expected within ${round(expected)} m)`});
    if (w.stall > (group.startsWith('herd') ? 12 : 1.5)) out.push({check: 'school.stuck', subject: group, where: w.where, detail: `a member stalls for ${round(w.stall)} s (no way on ${round(100 * w.blocked / w.samples)}% of the time)`});
  }
  // The diver in the middle of each group (the first of each species and kind), holding still for a few seconds.
  const meshes = new Map(); U.root.traverse(n => { if (n.isInstancedMesh) meshes.set(n.name.replace(/^Creature set · | \(\d+\)$/g, ''), n); });
  const M = new (U.root.matrix.constructor)(), v = A.V(), seen = new Set(), diver = {};
  for (const [index, g] of groups.entries()) {
    // Cleaner wrasse come to a diver as they come to a fish waiting at their station: they are left out.
    const key = `${g.species} ${g.kind}`; if (seen.has(key) || !g.active || g.kind === 'burrows' || g.kind === 'encounter' || g.species === 'cleaner-wrasse') continue; seen.add(key);
    let nearest = Infinity;
    P.set(...D.groups()[index].centre);   // the diver stops where the group was, and stays
    for (let f = 0; f < 6 * rate; f++) {
      U.update(dt, P, null);
      if (f < rate) continue;   // a second to react
      const packed = D.groups().slice(0, index).filter(o => o.species === g.species && o.active && o.shown).reduce((n, o) => n + o.count, 0), mesh = meshes.get(g.species);
      for (let i = 0; i < g.count; i++) { mesh.getMatrixAt(packed + i, M); v.setFromMatrixPosition(M); nearest = Math.min(nearest, v.distanceTo(P)); }
    }
    diver[key] = round(nearest);
    // Centre to centre: closer than 0.6 m, a fish of the site's size is brushing the diver's body.
    if (nearest < .6) out.push({check: 'school.diver', subject: key, where: at(P.x, P.y, P.z), detail: `a fish comes within ${round(nearest)} m of a diver in the middle of the ${g.kind}`});
  }
  return {violations: out, cohesion, diver};
}

// Frame-rate independence: three fresh, identically seeded copies of the creature set, each run for the same time at
// 30, 60 and 120 Hz with a tuna school passing; where every animal and swimmer ends up is compared.
async function auditRates({seconds}) {
  const C = window.oceanControls, A = window.reefAudit, {round} = A, L = C.viewer.layers(), out = [];
  const [{createUserCreatures}, {LANDMARKS}] = await Promise.all([import('./user-creatures.js'), import('./reef.js')]);
  const ends = {};
  for (const rate of [30, 60, 120]) {
    window.__reseed(20261029);
    const sys = createUserCreatures({terrainHeightAt: L.reef.userData.terrainHeightAt, collisions: L.reef.userData.collisions, economy: window.oceanDiagnostics.quality === 'economy', sites: {formations: C.formations, life: C.life?.sites || [], landmarks: LANDMARKS, patches: () => window.oceanDiagnostics.userCorals?.patches || []}});
    await sys.load();
    window.__reseed(4242);
    const P = C.getPlayerPosition().clone().set(10, -18, -40);
    sys.debug.spawn('tuna', P, null);
    const swum = {}, last = {};
    for (let f = 0; f < seconds * rate; f++) {
      sys.update(1 / rate, P, null);
      for (const [name, x, z] of [...sys.debug.actors().filter(a => a.active).map(a => [a.name, a.x, a.z]), ...sys.debug.swimmers().map((m, i) => [`${m.group}:${i}`, m.x, m.z])]) {
        if (last[name]) swum[name] = (swum[name] || 0) + Math.hypot(x - last[name][0], z - last[name][1]);
        last[name] = [x, z];
      }
    }
    ends[rate] = {swum,actors: sys.debug.actors().filter(a => a.active).map(a => [a.name, a.x, a.y, a.z]), swimmers: sys.debug.swimmers().map(m => [m.group, m.x, m.y, m.z]), groups: sys.debug.groups().filter(g => g.active).map(g => [g.name, ...g.centre]), u: sys.debug.slots().find(s => s.slot === 'pelagic')?.progress};
  }
  const apart = {};
  for (const kind of ['actors', 'swimmers', 'groups']) ends[30][kind].forEach((item, i) => {
    const others = [ends[60][kind][i], ends[120][kind][i]].filter(Boolean), worst = Math.max(...others.map(o => Math.hypot(o[1] - item[1], o[2] - item[2], o[3] - item[3])));
    const key = `${item[0]}`; apart[key] = Math.max(apart[key] || 0, round(worst));
  });
  // What follows the clock alone (clouds, encounters, residents at rest) must end where it ends at any rate. A
  // navigating swimmer's course round an obstacle is a run of choices that two runs can make differently, so for
  // those the test is how far each swims, which a speed or turn scaled by frames would change.
  const navigated = subject => /shoal|herd|bumphead|whipray/.test(subject);
  for (const [subject, d] of Object.entries(apart)) if (!navigated(subject) && d > .3) out.push({check: 'rate.dependent', subject, where: null, detail: `ends ${d} m apart after ${seconds} s at 30, 60 and 120 Hz`});
  for (const name of Object.keys(ends[60].swum)) {
    const lengths = [30, 60, 120].map(r => ends[r].swum[name] || 0), mean = lengths.reduce((a, b) => a + b) / 3;
    if (navigated(name) && mean > 2 && Math.max(...lengths.map(v => Math.abs(v - mean))) / mean > .12) out.push({check: 'rate.dependent', subject: name, where: null, detail: `swims ${lengths.map(round).join(' / ')} m in ${seconds} s at 30 / 60 / 120 Hz`});
  }
  const progress = [30, 60, 120].map(r => ends[r].u);
  if (Math.max(...progress) - Math.min(...progress) > .002) out.push({check: 'rate.dependent', subject: 'tuna pass', where: null, detail: `progress ${progress.join(' / ')} at 30 / 60 / 120 Hz`});
  return {violations: out, apart, progress};
}

// --- Driving it -------------------------------------------------------------------------------------------------------
const browser = await launchBrowser();
const report = {base, runs: {}}, failures = [];
try {
  for (const quality of qualities) {
    const started = Date.now();
    const page = await browser.newPage({viewport: {width: 960, height: 600}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Repeatable: one seed for every Math.random in the page. Standard quality needs five or more cores.
    await page.addInitScript(cores => {
      let seed = 0x5eed1234; window.__reseed = value => { seed = value; }; Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => cores});
    }, quality === 'standard' ? 8 : 4);
    // The procedural reef keeps no record of where it put each coral: keep a copy of each family as it is finished.
    await page.route(/\/reef\.js(\?.*)?$/, async route => {
      const response = await route.fetch(), body = await response.text(), hooked = body.replace(/finish\((\w+),\s*(\w+)\)\s*\{/, (m, a) => `${m}(globalThis.__reefFamilies??=[]).push({name:${a},geometry,entries});`);
      if (hooked === body) console.warn('reef.js: no finish(name, kind) to hook; the procedural reef is not audited');
      await route.fulfill({response, body: hooked});
    });
    await page.goto(base, {waitUntil: 'load', timeout: 120000});
    await page.waitForFunction(() => window.oceanDiagnostics?.ready, null, {timeout: 300000});
    await page.evaluate(() => window.oceanControls.startDive({capture: false}));
    await page.waitForFunction(() => window.oceanDiagnostics.submerged && window.oceanDiagnostics.userCreatures?.ready && window.oceanDiagnostics.userCorals?.ready && window.oceanDiagnostics.landmarksSettled !== false && window.oceanControls.getMode() === 'diver' && !window.oceanControls.getTransition(), null, {timeout: 600000});
    await page.waitForFunction(() => (window.oceanControls.viewer.layers().models?.children || []).filter(c => /placement wrapper/.test(c.name)).length >= 3, null, {timeout: 120000}).catch(() => errors.push('landmark models never placed'));
    // Stop the page's own loop: from here every frame is stepped by hand.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => true}); Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'}); document.dispatchEvent(new Event('visibilitychange')); });
    await page.evaluate(install);
    const run = report.runs[quality] = {quality: await page.evaluate(() => window.oceanDiagnostics.quality), loadSeconds: Math.round((Date.now() - started) / 1000), world: await page.evaluate(() => window.reefAudit.describe())};
    const timed = async (name, fn, arg) => {
      const t = Date.now();
      try { const result = await page.evaluate(fn, arg); console.log(`  ${quality}: ${name} in ${Math.round((Date.now() - t) / 1000)} s`); return result; }
      catch (error) { console.log(`  ${quality}: ${name} failed: ${error.message.split('\n')[0]}`); return {violations: [{check: 'audit.error', subject: name, where: null, detail: error.message.split('\n')[0]}], summary: {}, paths: {}, slots: []}; }
    };
    console.log(`  ${quality}: loaded in ${run.loadSeconds} s`);
    run.corals = await timed('coral set', auditCorals);
    run.reef = await timed('procedural reef', auditReefFamilies);
    // The reef as a diver hovering over the middle of it finds it, then each encounter from a shallow, a middle and a deep spot.
    run.creatures = {resident: await timed('residents', auditCreatures, {seconds: mode.resident, rate: 60, label: 'resident 60 Hz'})};
    const spots = {shallow: [0, -5, 4], middle: [10, -18, -40], deep: [-14, -40, -80]};
    run.encounters = {};
    for (const id of mode.encounters) for (const spot of mode.spots) {
      run.encounters[`${id} from ${spot}`] = await timed(`${id} from ${spot}`, auditCreatures, {seconds: 20, until: 330, rate: 30, player: spots[spot], spawn: id, label: `${id} from ${spot}`});
    }
    run.schools = await timed('schools', auditSchools, {seconds: mode.schools, rate: 30});
    // The same stretch at three frame rates: the shoals, clouds and an encounter cover the same ground.
    run.rates = mode.rates ? await timed('frame rates', auditRates, {seconds: mode.rates}) : {violations: []};
    run.errors = errors;
    await page.close();
    // Verdicts for this quality.
    const all = [...run.corals.violations, ...run.reef.violations, ...run.creatures.resident.violations, ...run.schools.violations];
    for (const [name, e] of Object.entries(run.encounters)) {
      all.push(...e.violations.filter(v => !/^(fish|actor)/.test(v.subject) || true));
      // Encounters: in from beyond the haze, out of sight again, and never over the shallows.
      const id = name.split(' ')[0], lead = Object.entries(e.paths).filter(([key]) => key.startsWith('actor:'))
        .filter(([key]) => ({whale: /right-whale/, 'whale-shark': /:whale-shark@/, orcas: /orca/, dolphins: /dolphin/, blacktips: /blacktip/, tuna: /tuna/})[id].test(key));
      for (const [key, p] of lead) {
        if (p.shallow < 20) all.push({check: 'encounter.shallows', subject: key.slice(6).replace(/@\d+$/, ''), where: p.shallowWhere, detail: `over water ${p.shallow} m deep`, run: name});
        const first = p.path[0], last = p.path.at(-1);
        if (first && last) { const dx = last[0] - first[0], dz = last[2] - first[2]; p.heading = Math.round(Math.atan2(dx, dz) * 180 / Math.PI); if (Math.abs(dz) > Math.abs(dx) * .36) all.push({check: 'encounter.across', subject: key.slice(6).replace(/@\d+$/, ''), where: first, detail: `line runs ${p.heading}° from +z, not along the reef face`, run: name}); }
      }
      const ended = e.slots.every(s => s.active !== id);
      if (!ended) all.push({check: 'encounter.lingers', subject: id, where: null, detail: 'still under way when its run ended', run: name});
    }
    all.push(...run.rates.violations);
    if (errors.length) all.push({check: 'page.error', subject: 'page', where: null, detail: errors.join('; ')});
    // One line a finding (the same finding on several members is counted, not repeated).
    const grouped = new Map();
    for (const v of all) { const key = `${v.check}|${v.subject.replace(/#\d+(:\d+)?$/, '').replace(/ #\d+$/, '')}|${v.run || ''}`; const g = grouped.get(key); if (g) g.count++; else grouped.set(key, {...v, count: 1}); }
    run.violations = [...grouped.values()];
    console.log(`\n${quality} (${run.quality}, loaded in ${run.loadSeconds} s): ${run.corals.colonies} colonies, ${Object.keys(run.reef.summary || {}).length} reef families, ${run.violations.length} findings`);
    for (const v of run.violations) console.log(`  ${v.check.padEnd(20)} ${v.subject}${v.count > 1 ? ` (×${v.count})` : ''}${v.run ? ` [${v.run}]` : ''}: ${v.detail}${v.where ? ` at ${v.where.join(', ')}` : ''}`);
    if (run.violations.length) failures.push(quality);
  }
} finally {
  await browser.close();
  server?.close();
}
const json = flag('json'); if (typeof json === 'string') await fs.writeFile(json, JSON.stringify(report, null, 1));
console.log(failures.length ? `\nReef audit: findings in ${failures.join(', ')}` : '\nReef audit: clean');
process.exitCode = failures.length ? 1 : 0;
