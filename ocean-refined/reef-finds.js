import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

// The five things to find on the reef: small gold keepsakes from a lost ship, each hovering a hand above the sand with a
// small life of its own. A compass whose needle hunts for north, a sextant whose arm sweeps its arc, a medallion turning
// like a dropped coin, a conch rocking on the swell and a pirate's hat tipping at a jaunty angle. Every few seconds one
// catches the light.
//
//   const finds = createReefFinds({ floor });  scene.add(finds.root);
//   finds.update(dt, player, underwater);       finds.take(id);   (expedition-interactions.js does both)
//
// Cost: eleven small meshes in all (moving parts and the sextant's glass are their own), none drawn
// beyond REACH or out of view, nothing animated that is not drawn. One gold program; each find has its own copy of the
// material only so it can catch the light on its own beat. The gold is plainly lit, without the reef's toon look
// (ocean-look.js), which flattened it to yellow paint: a keepsake should catch the eye a little more than the reef.

// id, name, where (x, z), a line for the inventory, and how high it hovers over the sand (m).
export const FINDS = [
  { key: 'compass', name: 'Gold compass', x: -15, z: -17, line: 'Its needle still hunts for a north it has not seen in two hundred years.' },
  { key: 'hat', name: 'Gold pirate hat', x: 23, z: -29, line: 'A captain’s tricorne, cast in gold, from beside the wreck.' },
  { key: 'sextant', name: 'Gold sextant', x: -31, z: -52, line: 'For reading the height of the sun, and from it where the ship was.' },
  { key: 'medallion', name: 'Gold medallion', x: 36, z: -67, line: 'A star struck on both faces, and a loop for a chain long gone.' },
  { key: 'conch', name: 'Gold conch', x: -29, z: -94, line: 'A shell cast in gold, found on the deep sand by the treasure.' }
];
const HOVER = .5, REACH = 48, TAU = Math.PI * 2;

// --- Shapes: everything in metres, built round the origin, merged into one geometry per moving part ------------------
const shape = parts => {
  const merged = mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)), false);
  parts.forEach(g => g.dispose()); merged.computeVertexNormals(); merged.computeBoundingSphere();
  return merged;
};
const at = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s)));
// A flat five-pointed star, raised `depth` off a face.
function star(outer, inner, depth) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + Math.PI / 2, r = i % 2 ? inner : outer; if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
}

function compass() {
  // A pocket compass, lid thrown open behind it, the rose embossed on its face.
  const face = [new THREE.CylinderGeometry(.22, .22, .06, 18), at(new THREE.TorusGeometry(.22, .022, 5, 18), 0, .03, 0, Math.PI / 2),
    at(new THREE.TorusGeometry(.045, .014, 4, 8), 0, 0, -.25, 0, Math.PI / 2),
    // The lid, open past upright on its hinge at the back.
    at(new THREE.CylinderGeometry(.22, .22, .02, 18), 0, .19, -.27, -1.75), at(new THREE.TorusGeometry(.22, .016, 4, 18), 0, .19, -.27, -1.75 + Math.PI / 2)];
  for (let k = 0; k < 8; k++) face.push(at(new THREE.BoxGeometry(.012, .012, k % 2 ? .1 : .17), 0, .036, 0, 0, k * Math.PI / 4));
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = k % 2 ? .13 : .175; face.push(at(new THREE.ConeGeometry(.018, .04, 4), Math.sin(a) * r, .04, Math.cos(a) * r, Math.PI / 2, a, 0)); }
  const needle = shape([at(new THREE.ConeGeometry(.026, .17, 4), 0, 0, .085, Math.PI / 2), at(new THREE.ConeGeometry(.026, .13, 4), 0, 0, -.065, -Math.PI / 2), new THREE.CylinderGeometry(.02, .02, .03, 8)]);
  return { body: shape(face), part: needle, partAt: [0, .055, 0] };
}

function sextant() {
  // A navigator's sextant, stood upright on its frame: the frame a sixty-degree sector hanging from its pivot, made as a
  // lattice of two radii, an outer graduated limb and an inner arc, with three round lightening holes; the half-silvered
  // horizon glass on the left radius with its sun shades, the telescope on the right looking across at it; the handle
  // and three feet behind. The index arm swings from the pivot, carrying the index mirror and its shades at the top and
  // the vernier, clamp and micrometer drum at the arc. Moving parts: the arm (and the drum on it) and the horizon shades.
  const R = .5, H = Math.PI / 6, span = H + .07, P = (a, r = R) => [Math.sin(a) * r, -Math.cos(a) * r];
  const flat = (g, z = .55) => g.scale(1, 1, z);
  const frame = [
    flat(at(new THREE.TorusGeometry(R, .034, 4, 22, 2 * span), 0, 0, 0, 0, 0, -Math.PI / 2 - span)),
    flat(at(new THREE.TorusGeometry(R * .8, .018, 4, 18, 2 * H), 0, 0, 0, 0, 0, -Math.PI / 2 - H)),
    at(new THREE.TorusGeometry(R + .026, .007, 3, 22, 2 * span), 0, 0, .008, 0, 0, -Math.PI / 2 - span),
    at(new THREE.CylinderGeometry(.06, .06, .05, 12), 0, 0, 0, Math.PI / 2)];
  for (const a of [-H, H]) { const [x, y] = P(a); frame.push(at(new THREE.BoxGeometry(.05, R, .026), x / 2, y / 2, 0, 0, 0, a)); }
  // The lattice: three round holes braced into the frame.
  for (const [x, y, r] of [[-.105, -.26, .065], [.105, -.26, .065], [0, -.18, .045]]) frame.push(at(new THREE.TorusGeometry(r, .013, 4, 12), x, y, 0));
  frame.push(at(new THREE.BoxGeometry(.3, .024, .02), 0, -.345, 0));
  // The scale: a tick every two degrees, a longer one every ten.
  for (let k = 0; k <= 35; k++) { const a = -span + .02 + k * (2 * span - .04) / 35, long = k % 5 === 0, [x, y] = P(a, R - .02 - (long ? .012 : 0)); frame.push(at(new THREE.BoxGeometry(.006, long ? .05 : .026, .016), x, y, .014, 0, 0, a)); }
  // The horizon glass's frame on the left radius, turned to face the index mirror; its three shades swing in front.
  const [hx, hy] = P(-H, R * .42);
  frame.push(at(new THREE.BoxGeometry(.012, .09, .075), hx, hy, .06, 0, -.35, 0), at(new THREE.BoxGeometry(.03, .02, .06), hx + .01, hy - .05, .03), at(new THREE.CylinderGeometry(.012, .012, .1, 6), hx - .045, hy - .05, .05));
  // The telescope on its rising piece on the right radius, looking across at the horizon glass.
  const [tx, ty] = P(H, R * .42);
  frame.push(at(new THREE.BoxGeometry(.05, .04, .05), tx, ty, .04), at(new THREE.CylinderGeometry(.022, .022, .17, 10), tx + .02, ty, .085, 0, 0, Math.PI / 2),
    at(new THREE.CylinderGeometry(.03, .027, .04, 10), tx + .12, ty, .085, 0, 0, Math.PI / 2), at(new THREE.TorusGeometry(.024, .007, 4, 10), tx - .065, ty, .085, 0, Math.PI / 2),
    at(new THREE.TorusGeometry(.029, .006, 4, 10), tx + .14, ty, .085, 0, Math.PI / 2));
  // Behind: the handle on two posts, and three feet to stand it on a chart table.
  frame.push(at(new THREE.CylinderGeometry(.032, .028, .24, 8), .08, -.27, -.11, 0, 0, .45), at(new THREE.SphereGeometry(.034, 6, 4), .135, -.37, -.11), at(new THREE.SphereGeometry(.03, 6, 4), .03, -.17, -.11),
    at(new THREE.BoxGeometry(.03, .03, .11), .03, -.17, -.055), at(new THREE.BoxGeometry(.03, .03, .11), .13, -.36, -.055));
  for (const [x, y] of [[-.2, -.38], [.21, -.36], [0, -.03]]) frame.push(at(new THREE.CylinderGeometry(.014, .02, .05, 6), x, y, -.035, Math.PI / 2));
  const glass = [at(new THREE.BoxGeometry(.004, .075, .06), hx + .007, hy, .06, 0, -.35, 0), at(new THREE.CylinderGeometry(.018, .018, .004, 10), tx - .065, ty, .085, 0, 0, Math.PI / 2)];
  // The index arm: bar, index mirror and its shades at the pivot; vernier and clamp at the arc; the drum is its own part.
  const arm = [at(new THREE.BoxGeometry(.045, R + .07, .022), 0, -(R + .07) / 2, .035), at(new THREE.CylinderGeometry(.04, .04, .06, 10), 0, 0, .045, Math.PI / 2),
    at(new THREE.BoxGeometry(.014, .12, .085), 0, .07, .06), at(new THREE.BoxGeometry(.11, .05, .014), 0, -R + .005, .05), at(new THREE.BoxGeometry(.035, .06, .025), .05, -R - .045, .05),
    at(new THREE.BoxGeometry(.008, .022, .006), -.03, -R + .03, .06), at(new THREE.BoxGeometry(.008, .022, .006), .03, -R + .03, .06)];
  for (let k = 0; k < 3; k++) arm.push(at(new THREE.BoxGeometry(.06, .045, .006), -.07, .02 - k * .012, .085 - k * .014, 0, .2, 0));
  const armGlass = [at(new THREE.BoxGeometry(.004, .1, .07), .009, .07, .06)];
  const drum = shape([new THREE.CylinderGeometry(.04, .04, .035, 12), at(new THREE.TorusGeometry(.04, .007, 4, 12), 0, .012, 0, Math.PI / 2), at(new THREE.TorusGeometry(.04, .007, 4, 12), 0, -.012, 0, Math.PI / 2), at(new THREE.BoxGeometry(.01, .045, .02), 0, 0, .04)].map(g => g.rotateZ(Math.PI / 2)));
  const shades = shape([0, 1, 2].map(k => at(new THREE.BoxGeometry(.004, .045, .055), .03 + k * .009, -.025, 0)).concat([new THREE.CylinderGeometry(.008, .008, .07, 6)]));
  return { body: shape(frame), part: shape(arm), partAt: [0, 0, 0], glass: shape(glass), partGlass: shape(armGlass), drum, drumAt: [.085, -R - .025, .06], shades, shadesAt: [hx - .045, hy - .025, .1] };
}

function medallion() {
  // A thick coin with a rolled rim, a star struck on both faces and a loop at the top.
  return { body: shape([at(new THREE.CylinderGeometry(.21, .21, .045, 20), 0, 0, 0, Math.PI / 2), at(new THREE.TorusGeometry(.21, .024, 5, 20), 0, 0, 0),
    at(star(.14, .06, .018), 0, 0, .022), at(star(.14, .06, .018), 0, 0, -.022, 0, Math.PI),
    at(new THREE.TorusGeometry(.045, .015, 4, 10), 0, .26, 0, 0, Math.PI / 2)]) };
}

function conch() {
  // A queen conch lying on its side: a long lathed body from the tall spire to the siphon, a crown of blunt knobs round
  // the shoulder of the last whorl, ridges spiralling up the spire, and the wide flared lip that makes it a conch.
  const profile = [[0, -.36], [.025, -.32], [.06, -.22], [.12, -.1], [.165, .0], [.17, .05], [.13, .1], [.095, .14], [.07, .19], [.045, .25], [.022, .31], [0, .35]].map(([r, y]) => new THREE.Vector2(r, y));
  const parts = [new THREE.LatheGeometry(profile, 10)];
  for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + .3; parts.push(at(new THREE.ConeGeometry(.028, .055, 5), Math.sin(a) * .17, .05, Math.cos(a) * .17, Math.cos(a) * 1.4, 0, -Math.sin(a) * 1.4)); }
  for (let k = 0; k < 3; k++) parts.push(at(new THREE.TorusGeometry(.1 - k * .025, .012, 3, 10), 0, .14 + k * .055, 0, Math.PI / 2));
  // The lip: a broad curved flange down one side of the body whorl.
  const lip = new THREE.CylinderGeometry(.25, .17, .38, 9, 1, true, -1, 2);
  parts.push(at(lip, .02, -.06, 0, 0, 0, -.12));
  return { body: shape(parts.map(g => at(g, 0, 0, 0, 0, 0, Math.PI / 2).scale(1.2, 1, 1))) };
}

function hat() {
  // A tricorne: the brim cocked up into three walls that lean out from the crown and meet in three points, a domed
  // crown standing inside them, and a band round it.
  const outer = new THREE.Shape(), corner = k => k / 3 * TAU;
  for (let k = 0; k < 3; k++) {
    // Each side bows out a little between two points.
    const a0 = corner(k), a1 = corner(k + 1), am = (a0 + a1) / 2, P = a => [Math.sin(a) * .29, Math.cos(a) * .29];
    if (!k) outer.moveTo(...P(a0));
    outer.quadraticCurveTo(Math.sin(am) * .24, Math.cos(am) * .24, ...P(a1));
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, .135, 0, TAU, true); outer.holes.push(hole);
  const brim = new THREE.ExtrudeGeometry(outer, { depth: .1, bevelEnabled: false, curveSegments: 4 });
  // Stood up and flared: the higher a point of the brim, the further out it leans.
  brim.rotateX(-Math.PI / 2); const pos = brim.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), k = 1 + y * 1.1; pos.setXYZ(i, pos.getX(i) * k, y, pos.getZ(i) * k); }
  const floorRing = new THREE.ExtrudeGeometry(outer, { depth: .018, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2);
  const parts = [brim, floorRing, new THREE.CylinderGeometry(.125, .14, .18, 12).translate(0, .09, 0), new THREE.SphereGeometry(.125, 12, 4, 0, TAU, 0, Math.PI / 2).scale(1, .55, 1).translate(0, .18, 0),
    at(new THREE.TorusGeometry(.13, .014, 4, 12), 0, .05, 0, Math.PI / 2)];
  return { body: shape(parts.map(g => g.index ? g.toNonIndexed() : g)) };
}
const BUILD = { compass, sextant, medallion, conch, hat };

// --- The finds on the reef -----------------------------------------------------------------------------------------
export function createReefFinds({ floor }) {
  const root = new THREE.Group(); root.name = 'Reef finds';
  const gold = new THREE.MeshStandardMaterial({ name: 'Reef find gold', color: '#f2b93a', metalness: .3, roughness: .34, emissive: '#9a6412', emissiveIntensity: .45, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({ name: 'Reef find glass', color: '#d5ecf2', metalness: .7, roughness: .12, emissive: '#3c6370', emissiveIntensity: .35, flatShading: true });
  const items = FINDS.map((find, id) => {
    const made = BUILD[find.key](), material = gold.clone(), group = new THREE.Group(), spin = new THREE.Group();
    group.name = `Reef find · ${find.name}`; group.add(spin);
    const body = new THREE.Mesh(made.body, material); body.name = `${find.name} body`; spin.add(body);
    let part = null, drum = null, shades = null;
    if (made.part) { part = new THREE.Mesh(made.part, material); part.name = `${find.name} moving part`; part.position.fromArray(made.partAt); spin.add(part); }
    // Mirrors and lenses in silvered glass; a drum turned by the arm; shades that swing in and out of the sight line.
    if (made.glass) { const m = new THREE.Mesh(made.glass, glass); m.name = `${find.name} glass`; spin.add(m); }
    if (made.partGlass) { const m = new THREE.Mesh(made.partGlass, glass); m.name = `${find.name} moving glass`; part.add(m); }
    if (made.drum) { drum = new THREE.Mesh(made.drum, material); drum.name = `${find.name} drum`; drum.position.fromArray(made.drumAt); part.add(drum); }
    if (made.shades) { shades = new THREE.Mesh(made.shades, material); shades.name = `${find.name} shades`; shades.position.fromArray(made.shadesAt); spin.add(shades); }
    const y = floor(find.x, find.z) + HOVER;
    group.position.set(find.x, y, find.z); root.add(group);
    return { id, ...find, y, group, spin, body, part, drum, shades, material, phase: id * 1.37, taken: 0, collected: false, shown: false };
  });
  let time = 0;
  const player = new THREE.Vector3();
  /** player: where the diver is (or null for the orbit viewer: everything drawn). */
  function update(dt, from = null, underwater = true) {
    time += dt; root.visible = underwater; if (!underwater) return;
    if (from) player.copy(from);
    for (const it of items) {
      if (it.collected && it.taken >= 1) continue;
      const near = !from || Math.hypot(player.x - it.x, player.y - it.y, player.z - it.z) < REACH;
      it.group.visible = near; if (!near) continue;
      const t = time + it.phase, g = it.group, s = it.spin;
      // Hovering: a slow bob, and every ten seconds or so a glint as it turns into the light.
      g.position.y = it.y + Math.sin(t * 1.3) * .05;
      it.material.emissiveIntensity = .45 + 1.3 * Math.max(0, Math.sin(t * .6)) ** 30;
      if (it.key === 'compass') { s.rotation.set(.38, t * .25, 0); it.part.rotation.y = -t * .25 + .55 * Math.sin(t * .9) + .08 * Math.sin(t * 4.1); }
      else if (it.key === 'sextant') {
        // Taking a sight: the arm sweeps along the arc, the drum winding as it goes, and every few seconds the
        // shades swing into the sight line and out again.
        const arm = .42 * Math.sin(t * .55);
        s.rotation.set(0, t * .3, .06 * Math.sin(t * .7)); it.part.rotation.z = arm; it.drum.rotation.x = arm * 14;
        it.shades.rotation.y = -1.3 * Math.min(1, Math.max(0, Math.sin(t * .4) * 3 - 1.5));
      }
      else if (it.key === 'medallion') s.rotation.set(0, t * .9, .08 * Math.sin(t * .8));
      else if (it.key === 'conch') s.rotation.set(.2 * Math.sin(t * .8), t * .2, .1 * Math.sin(t * .6));
      else s.rotation.set(.1 * Math.sin(t * .9), t * .35, .14 * Math.sin(t * .7 + 1));
      // Taken: it spins up and rises, shrinking away to nothing.
      if (it.collected) {
        it.taken = Math.min(1, it.taken + dt / .7); const k = it.taken * it.taken;
        g.position.y += k * 1.2; s.rotation.y += k * 9; s.scale.setScalar(Math.max(.001, 1 - k)); it.material.emissiveIntensity = .45 + 1.6 * (1 - k);
        if (it.taken >= 1) g.visible = false;
      }
    }
  }
  function take(id) { const it = items[id]; if (!it || it.collected) return false; it.collected = true; it.taken = 0; return true; }
  return { root, items, update, take, material: gold };
}
