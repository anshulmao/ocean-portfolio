import * as THREE from './vendor/three.module.min.js';

// Thirteen more coral families for the reef, scattered in small clusters by depth zone:
//
//   const corals = yield* coralVarietySteps({ terrainHeightAt, collisions, economy, avoid });
//   scene.add(corals.root);  corals.update(elapsed, night, depth);  corals.cull(view);
//
// Everything is faceted (one normal per face) and coloured in its vertices, and every colony is baked into
// a handful of buffers: six cells of still coral and two of swaying coral, two materials in all.
// Nothing here is solid, so nothing is ever placed across a lane, a landmark pad or a hero formation.
// buildCoralSpecimen() makes one colony of any family at the origin for a catalogue page.
// This module needs three.js and nothing else from the kit.

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), FRONT = new THREE.Vector3(0, 0, 1), BACK = new THREE.Vector3(0, 0, -1);
const { clamp, smoothstep } = THREE.MathUtils;
const C = hex => new THREE.Color(hex);

/** size: typical colony width in metres. zone: where the scatter puts it. */
export const CORAL_VARIETIES = [
  { id: 'elkhorn', name: 'Elkhorn coral', scientific: 'Acropora palmata', size: 2, zone: 'shallow' },
  { id: 'fire', name: 'Blade fire coral', scientific: 'Millepora complanata', size: .55, zone: 'shallow' },
  { id: 'finger', name: 'Finger coral', scientific: 'Porites porites', size: .7, zone: 'shallow' },
  { id: 'cauliflower', name: 'Cauliflower coral', scientific: 'Pocillopora meandrina', size: .4, zone: 'shallow' },
  { id: 'lettuce', name: 'Lettuce coral', scientific: 'Turbinaria reniformis', size: .8, zone: 'mid' },
  { id: 'vase', name: 'Cup coral', scientific: 'Turbinaria peltata', size: .6, zone: 'mid' },
  { id: 'toadstool', name: 'Toadstool leather coral', scientific: 'Sarcophyton glaucum', size: .65, zone: 'mid' },
  { id: 'bubble', name: 'Bubble coral', scientific: 'Plerogyra sinuosa', size: .4, zone: 'mid' },
  { id: 'organpipe', name: 'Organ pipe coral', scientific: 'Tubipora musica', size: .45, zone: 'mid' },
  { id: 'starmound', name: 'Great star coral', scientific: 'Montastraea cavernosa', size: 1.1, zone: 'mid' },
  { id: 'softtree', name: 'Soft tree coral', scientific: 'Dendronephthya sp.', size: .65, zone: 'deep' },
  { id: 'suncoral', name: 'Orange sun coral', scientific: 'Tubastraea coccinea', size: .4, zone: 'deep' },
  { id: 'searod', name: 'Candelabra sea rod', scientific: 'Eunicea sp.', size: .8, zone: 'deep' }
];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashText = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };

const _t = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _e2 = new THREE.Euler();
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _l = new THREE.Vector3(), _c = new THREE.Color(), _m3 = new THREE.Matrix3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const xf = (x, y, z, scale = 1, rotation = null) => new THREE.Matrix4().compose(_t.set(x, y, z),
  rotation?.isQuaternion ? rotation : rotation ? _q.setFromEuler(_e.set(rotation[0], rotation[1], rotation[2])) : _q.identity(),
  typeof scale === 'number' ? _s.setScalar(scale) : _s.set(scale[0], scale[1], scale[2]));
const aim = direction => new THREE.Quaternion().setFromUnitVectors(UP, direction);
// Lean an upright piece toward a compass angle, then spin it about its own axis.
const lean = (angle, amount, spin = 0) => new THREE.Quaternion().setFromAxisAngle(_t.set(Math.sin(angle), 0, -Math.cos(angle)), amount)
  .multiply(_q.setFromAxisAngle(UP, spin));
// Point a piece authored along +X toward a compass angle, lift its tip by tilt and roll it about its length.
const reach = (angle, tilt, roll = 0) => new THREE.Quaternion().setFromEuler(_e2.set(roll, -angle, tilt, 'YZX'));
const speck = l => { const h = Math.sin(l.x * 91.7 + l.y * 13.1 + l.z * 47.3) * 43758.5453; return h - Math.floor(h); };

// --- Buffers ------------------------------------------------------------------------------------------
// Painters receive (out, worldPosition, worldNormal, localPosition, shade); shade is a per-vertex mark some
// pieces carry (a pipe's cap, a polyp's tentacle tips, the knobs of a mound). Sway weights ride along in the
// swaying buffers only: aSway = (reach in metres, phase, cross phase).
function bucket(swaying) {
  const position = [], normal = [], color = [], sway = [];
  return {
    low: Infinity, top: -Infinity,
    get triangles() { return position.length / 9; },
    add(geometry, matrix, paint, wave = null) {
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), mark = geometry.getAttribute('shade');
      _m3.getNormalMatrix(matrix); this.top = -Infinity;
      for (let i = 0; i < p.count; i++) {
        _l.fromBufferAttribute(p, i); _p.copy(_l).applyMatrix4(matrix);
        _n.fromBufferAttribute(n, i).applyMatrix3(_m3).normalize();
        paint(_c, _p, _n, _l, mark ? mark.getX(i) : 0);
        position.push(_p.x, _p.y, _p.z); normal.push(_n.x, _n.y, _n.z); color.push(_c.r, _c.g, _c.b);
        if (_p.y < this.low) this.low = _p.y; if (_p.y > this.top) this.top = _p.y;
        if (!swaying) continue;
        if (wave) sway.push(wave.amp * Math.pow(clamp((_p.y - wave.base) / wave.height, 0, 1), wave.power ?? 1.5), wave.phase, wave.phase * 1.7);
        else sway.push(0, 0, 0);
      }
      return p.count / 3;
    },
    build(name, material, lift = 0) {
      if (lift) for (let i = 1; i < position.length; i += 3) position[i] += lift;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
      if (swaying) geometry.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 3));
      geometry.computeBoundingSphere(); geometry.computeBoundingBox();
      if (swaying) geometry.boundingSphere.radius += .5;
      const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.matrixAutoUpdate = false; return mesh;
    }
  };
}

// --- Faceted geometry -----------------------------------------------------------------------------------
// Pieces are authored as loose triangles. faceted() drops the slivers a lathe leaves at its poles and gives
// each face its own normal (round: sphere normals instead, for the pearls of a bubble coral).
function faceted(position, { round = false, shade = null } = {}) {
  const out = [], normal = [], marks = [];
  for (let i = 0; i < position.length; i += 9) {
    _a.set(position[i], position[i + 1], position[i + 2]); _b.set(position[i + 3], position[i + 4], position[i + 5]); _d.set(position[i + 6], position[i + 7], position[i + 8]);
    _n.subVectors(_d, _b).cross(_t.subVectors(_a, _b));
    if (_n.lengthSq() < 1e-12) continue;
    _n.normalize();
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? _a : k === 1 ? _b : _d;
      out.push(v.x, v.y, v.z);
      if (round) { _t.copy(v).normalize(); normal.push(_t.x, _t.y, _t.z); } else normal.push(_n.x, _n.y, _n.z);
      if (shade) marks.push(shade[i / 3 + k]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  if (shade) geometry.setAttribute('shade', new THREE.Float32BufferAttribute(marks, 1));
  return geometry;
}
// Turn every triangle to face out of the volume it encloses. Open ends are fine as long as they lie in a
// plane through the origin (the foot of a stalk), where they would add nothing to the volume anyway.
function outward(position) {
  let volume = 0;
  for (let i = 0; i < position.length; i += 9) {
    _a.set(position[i], position[i + 1], position[i + 2]); _b.set(position[i + 3], position[i + 4], position[i + 5]); _d.set(position[i + 6], position[i + 7], position[i + 8]);
    volume += _a.dot(_b.cross(_d));
  }
  if (volume < 0) for (let i = 0; i < position.length; i += 9) for (let k = 0; k < 3; k++) { const hold = position[i + 3 + k]; position[i + 3 + k] = position[i + 6 + k]; position[i + 6 + k] = hold; }
  return position;
}
const loose = geometry => { const flat = geometry.index ? geometry.toNonIndexed() : geometry; return Array.from(flat.getAttribute('position').array); };
// profile: [radius, height] pairs from the foot up. warp(vertex) may bend it; it must depend on position alone.
function lathed(profile, sides, warp = null) {
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), sides), p = geometry.getAttribute('position');
  if (warp) for (let i = 0; i < p.count; i++) { warp(_t.fromBufferAttribute(p, i)); p.setXYZ(i, _t.x, _t.y, _t.z); }
  return outward(loose(geometry));
}
// Loose triangles with a hint of which way each should face; tones: one shade for the face, or one per corner.
function soup() {
  const position = [], shade = [];
  const tri = (a, b, c, hint = null, tones = 0) => {
    let s = Array.isArray(tones) ? tones : [tones, tones, tones];
    if (hint && _n.set(c[0] - b[0], c[1] - b[1], c[2] - b[2]).cross(_t.set(a[0] - b[0], a[1] - b[1], a[2] - b[2])).dot(hint) < 0) { const hold = b; b = c; c = hold; s = [s[0], s[2], s[1]]; }
    position.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); shade.push(s[0], s[1], s[2]);
  };
  return { position, shade, tri, both(a, b, c) { tri(a, b, c); tri(a, c, b); } };
}

// Elkhorn blade along +X: a thick slab that cups upward and ends in blunt lobes, like the palm of an antler.
// shade: 0 on top, .5 round the growing edge, 1 underneath.
function frondGeometry(simple) {
  const outline = simple
    ? [[0, -.11], [.5, -.38], [1, -.42], [.84, -.04], [1.08, .2], [.6, .42], [0, .11]]
    : [[0, -.11], [.4, -.3], [.82, -.56], [1.04, -.4], [.82, -.1], [1.12, 0], [1.06, .26], [.7, .5], [.3, .26], [0, .11]];
  const lift = x => .18 * x * x, half = .05, s = soup(), out = new THREE.Vector3();
  const top = outline.map(([x, z]) => [x, lift(x) + half, z]), bottom = outline.map(([x, z]) => [x, lift(x) - half, z]);
  const crown = [.55, lift(.55) + half * 1.5, 0], belly = [.55, lift(.55) - half * 1.5, 0];
  let turn = 0;
  for (let i = 0; i < outline.length; i++) { const j = (i + 1) % outline.length; turn += outline[i][0] * outline[j][1] - outline[j][0] * outline[i][1]; }
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    s.tri(crown, top[i], top[j], UP, 0); s.tri(belly, bottom[i], bottom[j], DOWN, 1);
    if (j === 0) continue; // the root is buried in the trunk
    out.set(outline[j][1] - outline[i][1], 0, outline[i][0] - outline[j][0]).multiplyScalar(Math.sign(turn));
    s.tri(top[i], top[j], bottom[j], out, .5); s.tri(top[i], bottom[j], bottom[i], out, .5);
  }
  return faceted(s.position, { shade: s.shade });
}
// Fire-coral blade standing in the XY plane: a broad thin plate with a gently knuckled top edge.
function plateGeometry(simple) {
  const outline = simple
    ? [[-.34, 0], [-.52, .55], [-.34, .95], [0, .88], [.3, 1], [.54, .6], [.34, 0]]
    : [[-.34, 0], [-.5, .34], [-.54, .7], [-.4, .95], [-.2, .88], [0, 1], [.22, .9], [.4, .97], [.56, .66], [.48, .3], [.34, 0]];
  const ring = outline.map(([x, y]) => [x, y, .04 * Math.sin(x * 5)]), front = [0, .48, .07], back = [0, .48, -.07], s = soup();
  for (let i = 0; i < ring.length; i++) { const j = (i + 1) % ring.length; s.tri(front, ring[i], ring[j], FRONT); s.tri(back, ring[i], ring[j], BACK); }
  return faceted(s.position);
}
// Finger: a stubby column with a bevelled, flat end, so it reads as a blunt finger and not as a crystal.
function fingerGeometry(sides) {
  const s = soup(), lid = Array.from({ length: sides }, (_, k) => [Math.sin(k / sides * TAU) * .52, 1, Math.cos(k / sides * TAU) * .52]);
  for (let k = 1; k < sides - 1; k++) s.tri(lid[0], lid[k], lid[k + 1], UP);
  return faceted(lathed([[1, 0], [.9, .8], [.52, 1]], sides).concat(s.position));
}
// Lettuce-coral leaf: a third of a flaring cup wall with a rippled rim, seen from both sides.
function petalGeometry(columns, rows) {
  const at = (u, v) => {
    const turn = u * .9, out = .3 + .7 * Math.pow(v, .8) + .1 * v * v * v;
    return [Math.sin(turn) * out, .9 * Math.pow(v, 1.6) + (.07 * Math.sin(turn * 5 + 1) - .1 * u * u) * v * v, Math.cos(turn) * out];
  };
  const s = soup();
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const u0 = i / columns * 2 - 1, u1 = (i + 1) / columns * 2 - 1, v0 = j / rows, v1 = (j + 1) / rows;
    const a = at(u0, v0), b = at(u1, v0), c = at(u1, v1), d = at(u0, v1);
    s.both(a, b, c); s.both(a, c, d);
  }
  return faceted(s.position);
}
// Cup coral: a chalice with a wall of real thickness, so one side is the whole shape.
function chaliceGeometry(sides) {
  return faceted(lathed([[.16, 0], [.2, .28], [.68, .74], [1, 1], [.86, .97], [.5, .62], [0, .45]], sides, v => {
    const angle = Math.atan2(v.z, v.x), r = Math.hypot(v.x, v.z), k = 1 + .09 * Math.sin(angle * 3 + .5) * smoothstep(v.y, .3, 1);
    v.set(v.x * k, v.y + .06 * Math.sin(angle * 2 + 1.2) * r * r, v.z * k);
  }));
}
// Toadstool cap: a thick disc whose rim folds like the brim of a soft hat.
function capGeometry(sides) {
  return faceted(lathed([[.28, -.1], [.85, -.06], [1, .02], [.62, .1], [0, .05]], sides, v => {
    const angle = Math.atan2(v.z, v.x), r = Math.hypot(v.x, v.z), k = 1 + .07 * Math.sin(angle * 2 + 1);
    v.set(v.x * k, v.y + (.17 * Math.sin(angle * 3 + .4) + .06 * Math.sin(angle * 5 + 2)) * r * r, v.z * k);
  }));
}
// Bubble: an icosahedron stood on a corner with the five faces round that corner left out (they sit inside the cluster).
function pearlGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 0).rotateZ(Math.PI - Math.atan(2 / (1 + Math.sqrt(5)))), position = loose(geometry), kept = [];
  let lowest = Infinity;
  for (let i = 1; i < position.length; i += 3) lowest = Math.min(lowest, position[i]);
  for (let i = 0; i < position.length; i += 9) if (Math.min(position[i + 1], position[i + 4], position[i + 7]) > lowest + .01) kept.push(...position.slice(i, i + 9));
  return faceted(kept, { round: true });
}
// Organ pipe: a straight tube with a flat lid (shade 1), which the painter makes a dark mouth or a mat of polyps.
function pipeGeometry(sides) {
  const s = soup(), ring = Array.from({ length: sides }, (_, k) => [Math.sin(k / sides * TAU), Math.cos(k / sides * TAU)]), out = new THREE.Vector3();
  for (let k = 0; k < sides; k++) {
    const [x0, z0] = ring[k], [x1, z1] = ring[(k + 1) % sides];
    out.set(x0 + x1, 0, z0 + z1);
    s.tri([x0, 0, z0], [x1, 0, z1], [x1, 1, z1], out); s.tri([x0, 0, z0], [x1, 1, z1], [x0, 1, z0], out);
    if (k > 0 && k < sides - 1) s.tri([ring[0][0], 1, ring[0][1]], [x0, 1, z0], [x1, 1, z1], UP, 1);
  }
  return faceted(s.position, { shade: s.shade });
}
// Great star coral: a dome whose corallites stand proud as knobs (shade 1). Its foot is at y = 0.
function moundGeometry(detail) {
  const source = loose(new THREE.IcosahedronGeometry(1, detail)), position = [], shade = [];
  const knob = (x, y, z) => { const h = Math.sin(Math.round(x * 1e3) * .1271 + Math.round(y * 1e3) * .3117 + Math.round(z * 1e3) * .0747) * 43758.5453; return h - Math.floor(h) > .6 ? 1 : 0; };
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < source.length; i += 9) {
    if ((source[i + 1] + source[i + 4] + source[i + 7]) / 3 < -.1) continue;
    for (let k = 0; k < 9; k += 3) {
      const x = source[i + k], y = source[i + k + 1], z = source[i + k + 2], up = knob(x, y, z), r = (up ? 1.1 : .96) * (1 + .05 * Math.sin(x * 3.1 + z * 2.3));
      position.push(x * r, y * r * .8, z * r); shade.push(up); low = Math.min(low, y * r * .8); high = Math.max(high, y * r * .8);
    }
  }
  for (let i = 1; i < position.length; i += 3) position[i] -= low;
  const geometry = faceted(position, { shade }); geometry.userData.height = high - low; return geometry;
}
// Sun-coral polyp: a flared cup (shade 0) with a dark throat (.25), a bright lip (.5) and a ring of tentacle tips (1).
function cupGeometry(sides) {
  const body = lathed([[.72, 0], [1, 1]], sides), s = soup(), throat = [0, .86, 0], ring = [];
  for (let k = 0; k < sides * 2; k++) { const angle = k / (sides * 2) * TAU, tip = k % 2 === 1, r = tip ? 1.8 : .98; ring.push([Math.sin(angle) * r, tip ? 1.14 : 1, Math.cos(angle) * r]); }
  for (let k = 0; k < ring.length; k++) {
    const j = (k + 1) % ring.length;
    s.tri(throat, ring[k], ring[j], UP, [.25, k % 2 ? 1 : .5, j % 2 ? 1 : .5]);
    if (k % 2) s.tri(ring[k - 1], ring[k], ring[j], DOWN, [.5, 1, .5]);
  }
  return faceted(body.concat(s.position), { shade: new Array(body.length / 3).fill(0).concat(s.shade) });
}
function rockGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 1), position = loose(geometry);
  for (let i = 0; i < position.length; i += 3) {
    const x = position[i], y = position[i + 1], z = position[i + 2];
    const bump = 1 + .5 * (.2 * Math.sin(x * 3.1 + y * 2.3) * Math.cos(z * 2.9 - y * 1.7) + .09 * Math.sin(z * 6.3 + x * 5.1) + .06 * Math.cos(y * 7.7 - x * 3.3));
    position[i] = x * bump; position[i + 1] = y * bump; position[i + 2] = z * bump;
  }
  return faceted(position);
}
// A four-sided tube along a path in the XY plane, rings square to the path, closed by a point.
function armGeometry(points, radius, sides) {
  const last = points.length - 1, position = [], tangent = i => { const a = points[Math.max(i - 1, 0)], b = points[Math.min(i + 1, last)], d = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
  const rings = points.map(([x, y], i) => {
    const [tx, ty] = tangent(i), r = radius * (1 - .4 * i / last);
    return Array.from({ length: sides }, (_, k) => { const angle = k / sides * TAU + .6, c = Math.cos(angle) * r; return [x - ty * c, y + tx * c, Math.sin(angle) * r]; });
  });
  const [tx, ty] = tangent(last), tip = [points[last][0] + tx * radius * 1.4, points[last][1] + ty * radius * 1.4, 0];
  for (let i = 0; i <= last; i++) for (let k = 0; k < sides; k++) {
    const a = rings[i][k], b = rings[i][(k + 1) % sides];
    if (i === last) { position.push(...a, ...b, ...tip); continue; }
    const c = rings[i + 1][k], d = rings[i + 1][(k + 1) % sides];
    position.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  return faceted(outward(position));
}

// The pieces every colony is assembled from, one set per quality. Each is made the first time a colony asks for it,
// so no single step of the build pays for all of them.
const kits = new Map();
// mode: true for economy, false for the reef, 'fine' for a single colony shown or exported on its own (about half as
// many faces again).
function kitFor(mode) {
  const e = mode === true, f = mode === 'fine', n = (lean, normal, fine) => e ? lean : f ? fine : normal;
  if (kits.has(mode)) return kits.get(mode);
  const armPath = ratio => e ? [[0, 0], [ratio * .8, .1], [ratio * 1.03, .5], [ratio, 1]] : [[0, 0], [ratio * .6, .05], [ratio * .98, .28], [ratio * 1.04, .62], [ratio, 1]];
  const makers = {
    stub: () => faceted(lathed([[1, 0], [.62, 1], [0, 1.04]], n(5, 5, 7))),
    limb: () => faceted(lathed([[1, 0], [.55, 1]], n(3, 4, 6))),
    finger: () => fingerGeometry(n(4, 5, 7)),
    stalk: () => faceted(lathed(e ? [[1, 0], [.8, 1]] : [[1, 0], [.72, .5], [.92, 1]], n(5, 6, 8))),
    ball: () => faceted(loose(new THREE.IcosahedronGeometry(1, 0))),
    gem: () => faceted(loose(new THREE.OctahedronGeometry(1, 0))),
    frond: () => frondGeometry(e), plate: () => plateGeometry(e), petal: () => petalGeometry(n(2, 3, 4), 2),
    chalice: () => chaliceGeometry(n(6, 8, 11)), cap: () => capGeometry(n(8, 10, 13)), pearl: () => pearlGeometry(), pipe: () => pipeGeometry(n(4, 5, 7)),
    mound: () => moundGeometry(n(2, 3, 4)), cup: () => cupGeometry(n(4, 5, 7)), rock: () => rockGeometry(),
    arms: () => [.3, .45, .62].map(ratio => ({ ratio, geometry: armGeometry(armPath(ratio), .048, n(4, 4, 6)) })),
    rod: () => armGeometry(e ? [[0, 0], [.03, .4], [-.01, 1]] : [[0, 0], [.03, .35], [-.02, .7], [.01, 1]], .048, n(4, 4, 6))
  };
  const kit = {};
  for (const [name, make] of Object.entries(makers)) Object.defineProperty(kit, name, { configurable: true, get() { const value = make(); Object.defineProperty(kit, name, { value }); return value; } });
  kits.set(e, kit); return kit;
}

// --- Colonies -------------------------------------------------------------------------------------------
// Each builder plants one colony of width s (metres) at (x, y, z), y being the ground. k carries the kit,
// the random stream, the ground and the two buffers. tone: [shaded base, body, growing edge].
const fibonacci = (i, count, phase, span = .92) => { const up = 1 - (i + .5) / count * span, flat = Math.sqrt(1 - up * up), angle = i * 2.4 + phase; return _d.set(Math.cos(angle) * flat, up, Math.sin(angle) * flat); };

function elkhorn(k, x, y, z, s, tone) {
  const { kit, rr, R } = k, [dark, mid, pale] = tone.map(C), shadow = dark.clone().multiplyScalar(.6);
  const bark = (c, p, n, l) => c.copy(shadow).lerp(dark, clamp(l.y * 1.4, 0, 1));
  const blade = (c, p, n, l, shade) => { c.copy(dark).lerp(mid, clamp(l.x * 1.25, 0, 1)).lerp(pale, smoothstep(l.x, .66, 1.05)); if (shade > .75) c.lerp(shadow, .6); else if (shade > .25) c.lerp(pale, .4 * smoothstep(l.x, .3, .9)); };
  const tall = s * rr(.3, .4), q = lean(R() * TAU, rr(.04, .2), R() * TAU);
  const base = new THREE.Vector3(x, y - .06 * s, z), axis = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  k.fixed(kit.stub, xf(base.x, base.y, base.z, [s * .1, tall, s * .1], q), bark);
  const blades = Math.max(3, Math.round((k.e ? 4 : 6) * clamp(s / 1.6, .55, 1.15))), phase = R() * TAU;
  for (let i = 0; i < blades; i++) {
    // The lowest blades are the longest and lie flattest; the crown reaches up.
    const f = (i + .5) / blades, at = tall * (.5 + .5 * f), length = s * rr(.43, .51) * (1.1 - .3 * f), tilt = .08 + .42 * f * f + rr(-.06, .1);
    k.fixed(kit.frond, xf(base.x + axis.x * at, base.y + axis.y * at, base.z + axis.z * at, [length, length * rr(.75, 1), length * rr(.8, 1.1)], reach(i * 2.4 + phase + rr(-.35, .35), tilt, rr(-.3, .3))), blade);
  }
}

function fire(k, x, y, z, s, tone) {
  const { kit, rr, R } = k, [dark, mid, pale] = tone.map(C);
  const paint = (c, p, n, l) => c.copy(dark).lerp(mid, clamp(l.y * 1.2, 0, 1)).lerp(pale, smoothstep(l.y, .42, .9) * smoothstep(Math.hypot(l.x, l.y - .48), .12, .4));
  const blades = k.e ? 4 : 6, yaw = R() * TAU, cos = Math.cos(yaw), sin = Math.sin(yaw);
  for (let i = 0; i < blades; i++) {
    const u = ((i + .5) / blades - .5) * s * .45 + rr(-.04, .04) * s, v = rr(-.15, .15) * s, px = x + u * cos - v * sin, pz = z + u * sin + v * cos;
    const wide = s * rr(.48, .66), tall = s * rr(.6, .95);
    k.fixed(kit.plate, xf(px, k.floor(px, pz) - .05 * s, pz, [wide, tall, wide], lean(R() * TAU, rr(0, .14), -yaw + (i % 3 === 1 ? 1.1 : 0) + rr(-.4, .4))), paint);
  }
}

function finger(k, x, y, z, s, tone) {
  const { kit, rr, R } = k, [dark, mid, pale] = tone.map(C);
  const paint = (c, p, n, l) => c.copy(dark).lerp(mid, clamp(l.y * 1.1, 0, 1)).lerp(pale, smoothstep(l.y, .68, 1));
  const fingers = k.e ? 7 : 9, phase = R() * TAU;
  for (let i = 0; i < fingers; i++) {
    const d = Math.sqrt((i + .35) / fingers) * .64, angle = i * 2.4 + phase, px = x + Math.cos(angle) * d * s * .5, pz = z + Math.sin(angle) * d * s * .5;
    const tall = s * (.3 + .3 * (1 - d * d)) * rr(.8, 1.15), thick = s * rr(.075, .095);
    k.fixed(kit.finger, xf(px, k.floor(px, pz) - .05 * s, pz, [thick, tall, thick], lean(angle, .08 + .55 * d + rr(-.06, .06), R() * TAU)), paint);
  }
}

function cauliflower(k, x, y, z, s, tone) {
  const { kit, rr, R } = k, [dark, mid, pale] = tone.map(C);
  const paint = (c, p, n, l) => c.copy(dark).lerp(mid, smoothstep(l.y, -.7, .45)).lerp(pale, smoothstep(l.y, .3, 1));
  const knobs = k.e ? 6 : 7, radius = s * .5, phase = R() * TAU;
  for (let i = 0; i < knobs; i++) {
    const d = fibonacci(i, knobs, phase), out = radius * rr(.48, .56);
    const q = aim(d).multiply(_q.setFromAxisAngle(UP, R() * TAU));
    k.fixed(kit.ball, xf(x + d.x * out, y + radius * .1 + d.y * out * .85, z + d.z * out, [radius * rr(.4, .5), radius * rr(.42, .5), radius * rr(.28, .36)], q), paint);
  }
}

function lettuce(k, x, y, z, s, tone) {
  const { kit, rr, R } = k, [dark, mid, pale] = tone.map(C);
  const paint = (c, p, n, l) => { const r = Math.hypot(l.x, l.z); c.copy(dark).lerp(mid, smoothstep(r, .3, .85)).lerp(pale, smoothstep(r, .8, 1.1)); if (n.y < -.15) c.lerp(dark, .35); };
  const leaves = k.e ? 5 : 7, radius = s * .47, phase = R() * TAU;
  for (let i = 0; i < leaves; i++) {
    // Inner leaves stand tall and tight, outer ones open into a wide whorl.
    const f = i / (leaves - 1), wide = radius * (.3 + .7 * f) * rr(.92, 1.06), tall = radius * (.95 - .35 * f) * rr(.9, 1.1), turn = i * 2.4 + phase;
    k.fixed(kit.petal, xf(x, y - .03 * s, z, [wide, tall, wide], lean(turn, rr(0, .12), turn)), paint);
  }
}

function vase(k, x, y, z, s, tone) {
  const { kit, rr, R } = k, [dark, mid, pale] = tone.map(C), inner = mid.clone().lerp(pale, .45);
  const paint = (c, p, n, l) => {
    c.copy(dark).lerp(mid, smoothstep(l.y, .05, .85));
    if (n.y > .2) c.lerp(inner, .7).lerp(dark, (1 - smoothstep(l.y, .45, .8)) * .45);
    c.lerp(pale, smoothstep(l.y, .86, 1.02) * smoothstep(Math.hypot(l.x, l.z), .7, .95));
  };
  k.fixed(kit.chalice, xf(x, y - .04 * s, z, [s * .5, s * rr(.7, 1), s * .5], lean(R() * TAU, rr(0, .14), R() * TAU)), paint);
}

function toadstool(k, x, y, z, s, tone) {
  const { kit, rr, R } = k, [dark, mid, pale] = tone.map(C), stem = mid.clone().lerp(C('#fff4e6'), .5), under = dark.clone().multiplyScalar(.72);
  const tall = s * rr(.45, .75), wave = { base: y, height: tall + s * .12, amp: s * .04, phase: x * .7 + z * .5, power: 1.5 };
  const q = lean(R() * TAU, rr(0, .12), R() * TAU), top = new THREE.Vector3(0, tall, 0).applyQuaternion(q);
  k.sway(kit.stalk, xf(x, y - .04 * s, z, [s * .15, tall + .04 * s, s * .15], q), (c, p, n, l) => c.copy(dark).lerp(stem, smoothstep(l.y, 0, .7)), wave);
  // The polyp-covered top is pale and faintly mottled; the smooth underside stays in shade.
  const cap = (c, p, n, l) => { const r = Math.hypot(l.x, l.z); if (n.y < -.1) c.copy(under).lerp(mid, smoothstep(r, .5, 1) * .5); else c.copy(mid).lerp(pale, smoothstep(r, .4, 1.02)).multiplyScalar(.9 + .1 * speck(l)); };
  k.sway(kit.cap, xf(x + top.x, y + top.y, z + top.z, [s * .47, s * .5, s * .47], lean(R() * TAU, rr(.03, .2), R() * TAU)), cap, wave);
}

function bubble(k, x, y, z, s, tone) {
  const { kit, rr, R } = k, [dark, mid, pale] = tone.map(C), core = dark.clone().multiplyScalar(.6);
  const paint = (c, p, n) => c.copy(dark).lerp(mid, smoothstep(n.y, -.5, .35)).lerp(pale, smoothstep(n.y, .3, .95));
  const pearls = k.e ? 6 : 8, radius = s * .5, phase = R() * TAU;
  k.fixed(kit.gem, xf(x, y + radius * .1, z, [radius * .62, radius * .5, radius * .62], [0, R() * TAU, 0]), c => c.copy(core));
  for (let i = 0; i < pearls; i++) {
    const d = fibonacci(i, pearls, phase, .9), out = radius * rr(.5, .58), size = radius * rr(.36, .47);
    k.fixed(kit.pearl, xf(x + d.x * out, y + radius * .06 + d.y * out * .8, z + d.z * out, [size, size * rr(1.05, 1.2), size], aim(d)), paint);
  }
}

function organpipe(k, x, y, z, s, tone) {
  const { kit, rr, R } = k, [dark, mid, pale] = tone.map(C), mouth = dark.clone().multiplyScalar(.5), polyps = C('#bfe6c9');
  const pipes = k.e ? 9 : 12, radius = s * .5, phase = R() * TAU;
  for (let i = 0; i < pipes; i++) {
    const d = Math.sqrt((i + .3) / pipes) * .74, angle = i * 2.4 + phase, px = x + Math.cos(angle) * d * radius, pz = z + Math.sin(angle) * d * radius;
    const wide = radius * .9 / Math.sqrt(pipes) * rr(.9, 1.08), tall = s * (.3 + .45 * (1 - d * d)) * rr(.85, 1.1), lid = R() < .45 ? polyps : mouth;
    k.fixed(kit.pipe, xf(px, k.floor(px, pz) - .06 * s, pz, [wide, tall + .06 * s, wide], lean(angle, .26 * d, R() * TAU)),
      (c, p, n, l, shade) => (shade > .5 ? c.copy(lid) : c.copy(dark).lerp(mid, clamp(l.y, 0, 1)).lerp(pale, smoothstep(l.y, .82, 1))));
  }
}

function starmound(k, x, y, z, s, tone) {
  const { kit, rr, R } = k, [dark, mid, pale] = tone.map(C);
  const paint = (c, p, n, l, shade) => c.copy(dark).lerp(mid, smoothstep(l.y, .02, .7)).lerp(pale, shade * .8);
  const wide = s * .47, tall = s * rr(.32, .46);
  k.fixed(kit.mound, xf(x, y - tall * .1, z, [wide * rr(.94, 1.04), tall * 1.1 / kit.mound.userData.height, wide * rr(.94, 1.04)], [0, R() * TAU, 0]), paint);
}

function softtree(k, x, y, z, s, tone) {
  const { kit, rr, R } = k, [dark, mid, pale] = tone.map(C), foot = C('#f4e2ea').lerp(mid, .14), glass = C('#fffaf5');
  // The trunk is nearly white, as if lit through; only the polyp clusters carry the colour.
  const trunk = (c, p, n, l) => c.copy(foot).lerp(glass, clamp(l.y, 0, 1));
  const bloom = (c, p, n) => c.copy(dark).lerp(mid, smoothstep(n.y, -.7, .2)).lerp(pale, smoothstep(n.y, .25, .95));
  const tall = s * rr(1.15, 1.45), wave = { base: y, height: tall, amp: s * .08, phase: x * .7 + z * .5, power: 1.35 };
  const q = lean(R() * TAU, rr(.03, .16), R() * TAU), base = new THREE.Vector3(x, y - .04 * s, z), axis = new THREE.Vector3(0, 1, 0).applyQuaternion(q), stem = tall * .52;
  k.sway(kit.stub, xf(base.x, base.y, base.z, [s * .085, stem, s * .085], q), trunk, wave);
  const puff = (px, py, pz, r) => k.sway(kit.ball, xf(px, py, pz, [r, r * rr(.8, .95), r], [R() * 3, R() * 3, R() * 3]), bloom, wave);
  const branches = k.e ? 3 : 4, phase = R() * TAU, from = new THREE.Vector3(), arm = new THREE.Vector3();
  for (let b = 0; b <= branches; b++) {
    const leader = b === branches, spread = rr(.75, 1), turn = b / branches * TAU + phase;
    from.copy(base).addScaledVector(axis, stem * (leader ? .98 : .55 + .4 * b / branches));
    if (leader) arm.copy(axis); else arm.set(Math.sin(spread) * Math.cos(turn), Math.cos(spread), Math.sin(spread) * Math.sin(turn)).applyQuaternion(q);
    const length = leader ? tall * .34 : s * rr(.36, .48);
    k.sway(kit.limb, xf(from.x, from.y, from.z, [s * .045, length, s * .045], aim(arm)), trunk, wave);
    puff(from.x + arm.x * length, from.y + arm.y * length, from.z + arm.z * length, s * rr(.15, .2) * (leader ? 1.12 : 1));
    if (leader || (!k.e && b === 0)) puff(from.x + arm.x * length * .5 + rr(-.07, .07) * s, from.y + arm.y * length * .5, from.z + arm.z * length * .5 + rr(-.07, .07) * s, s * rr(.11, .15));
  }
}

// One clump of polyps of width s growing out of a surface point along direction.
function sunClump(k, px, py, pz, direction, s, tone) {
  const { kit, rr, R } = k, [dark, mid, pale] = tone.map(C), throat = dark.clone().multiplyScalar(.6), lip = mid.clone().lerp(pale, .3);
  const paint = (c, p, n, l, shade) => (shade < .1 ? c.copy(dark).lerp(mid, clamp(l.y, 0, 1)) : shade < .4 ? c.copy(throat) : c.copy(lip).lerp(pale, (shade - .5) * 2));
  const out = direction.clone(), u = new THREE.Vector3().crossVectors(out, Math.abs(out.y) < .9 ? UP : FRONT).normalize(), v = new THREE.Vector3().crossVectors(out, u);
  const polyps = k.e ? 4 : 5, phase = R() * TAU, way = new THREE.Vector3();
  for (let i = 0; i < polyps; i++) {
    const angle = i * 2.4 + phase, d = Math.sqrt(i / polyps) * s * .36, a = Math.cos(angle) * d, b = Math.sin(angle) * d;
    way.copy(out).addScaledVector(u, a * 1.6 / s).addScaledVector(v, b * 1.6 / s).normalize();
    const wide = s * rr(.105, .13), tall = s * rr(.3, .46);
    k.fixed(kit.cup, xf(px + u.x * a + v.x * b - out.x * tall * .2, py + u.y * a + v.y * b - out.y * tall * .2, pz + u.z * a + v.z * b - out.z * tall * .2, [wide, tall, wide],
      aim(way).multiply(_q.setFromAxisAngle(UP, R() * TAU))), paint);
  }
}
// Sun coral wants a rock face, so each colony brings a stone: s is the width of one clump, the stone is about three
// clumps wide. A full-grown colony carries two clumps, a young one a single clump.
function suncoral(k, x, y, z, s, tone, { clumps = s > .22 ? 2 : 1, stone = k.rr(2.4, 3.1) } = {}) {
  const { kit, rr, R } = k, low = C('#3f5069'), high = C('#8597ad');
  const half = [s * stone * .5, s * stone * rr(.34, .42), s * stone * rr(.4, .48)], q = new THREE.Quaternion().setFromEuler(_e.set(rr(-.15, .15), R() * TAU, rr(-.15, .15))), cy = y + half[1] * .4;
  k.fixed(kit.rock, xf(x, cy, z, half, q), (c, p, n) => c.copy(low).lerp(high, smoothstep(n.y, -.3, .9)));
  const phase = R() * TAU, at = new THREE.Vector3(), out = new THREE.Vector3();
  for (let i = 0; i < clumps; i++) {
    const up = i === 0 ? .88 : rr(.3, .62), flat = Math.sqrt(1 - up * up), angle = i / Math.max(1, clumps - 1) * 2.6 + phase;
    _d.set(Math.cos(angle) * flat, up, Math.sin(angle) * flat);
    at.set(_d.x * half[0], _d.y * half[1], _d.z * half[2]).multiplyScalar(.84).applyQuaternion(q);
    out.set(_d.x / half[0], _d.y / half[1], _d.z / half[2]).normalize().applyQuaternion(q);
    sunClump(k, x + at.x, cy + at.y, z + at.z, out, s * (i ? rr(.75, 1) : 1), tone);
  }
}

function searod(k, x, y, z, s, tone) {
  const { kit, rr, R } = k, [dark, mid, pale] = tone.map(C);
  const paint = (c, p, n, l) => c.copy(dark).lerp(mid, clamp(l.y * 1.1, 0, 1)).lerp(pale, smoothstep(l.y, .74, 1.05));
  const tall = s * rr(1.3, 1.6), stem = tall * .14, wave = { base: y, height: tall, amp: tall * .055, phase: x * .6 + z * .45, power: 1.6 };
  k.sway(kit.stub, xf(x, y - .03 * s, z, [tall * .042, stem + .03 * s, tall * .042], [0, R() * TAU, 0]), c => c.copy(dark), wave);
  // Arms leave the stem sideways and turn upward, mostly in one plane, like the branches of a candelabrum.
  const arms = k.e ? 3 : 4, yaw = R() * TAU;
  for (let i = 0; i < arms; i++) {
    const high = (tall - stem) * rr(.58, .97), ratio = s * .5 * rr(.65, 1.05) / high, turn = yaw + (i % 2 ? Math.PI : 0) + rr(-.5, .5);
    const arm = kit.arms.reduce((best, next) => (Math.abs(next.ratio - ratio) < Math.abs(best.ratio - ratio) ? next : best));
    k.sway(arm.geometry, xf(x, y + stem * rr(.55, .95), z, high, [0, -turn, 0]), paint, wave);
  }
  k.sway(kit.rod, xf(x, y + stem * .8, z, (tall - stem * .8) * rr(.86, 1), [0, R() * TAU, 0]), paint, wave);
}

// size: narrowest and widest colony (m). count: colonies in a cluster [standard, economy]. spread: how far they stand from
// its centre (m). foot: the part of the width that rests on the ground, as a fraction; a wide foot is set at the lowest
// ground under it, so nothing hangs over a slope. Tones sit with the reef's own palette (see coralPalette in reef.js).
const FAMILY = {
  elkhorn: { build: elkhorn, size: [.7, 2.5], count: [3, 2], spread: 2.4, foot: .1, tones: [['#b9722f', '#e9a64c', '#fff0c4'], ['#b86a48', '#f09a62', '#ffe2c0'], ['#a97c3a', '#dcb25a', '#fff6d0']] },
  fire: { build: fire, size: [.35, .7], count: [3, 2], spread: 1.3, foot: 0, tones: [['#a8761f', '#e2b040', '#fff6d8'], ['#a56a2c', '#dc9c48', '#fff0cf']] },
  finger: { build: finger, size: [.4, .9], count: [3, 2], spread: 1.4, foot: 0, tones: [['#b78a3a', '#ecc566', '#fff3bf'], ['#8670b8', '#b99ae6', '#efe4ff'], ['#7c9c72', '#b4d08a', '#eef7c8']] },
  cauliflower: { build: cauliflower, size: [.25, .5], count: [3, 2], spread: 1.1, foot: .35, tones: [['#a83f6c', '#e0609a', '#ffd3e3'], ['#a06c48', '#d9a070', '#ffe8c8'], ['#7d8c4e', '#b8c070', '#f0f4b8']] },
  lettuce: { build: lettuce, size: [.5, 1.1], count: [2, 2], spread: 1.4, foot: .15, tones: [['#8c9a34', '#cdd060', '#f8f4a8'], ['#b06c3c', '#eba55c', '#ffe2a8'], ['#2f8f80', '#5fd0b8', '#c4f5e2']] },
  vase: { build: vase, size: [.35, .8], count: [3, 2], spread: 1.2, foot: .08, tones: [['#7a58b0', '#b987e8', '#e9d6ff'], ['#2f9080', '#5fd0b8', '#c8f6e6'], ['#c27a34', '#ffb35c', '#ffe6b4']] },
  toadstool: { build: toadstool, size: [.35, .9], count: [3, 2], spread: 1.3, foot: .1, tones: [['#a98a62', '#dcbd8c', '#fff2d2'], ['#b47c6c', '#eaab98', '#ffe6da'], ['#8e9e62', '#bdcc8a', '#f0f6cc']] },
  bubble: { build: bubble, size: [.25, .5], count: [3, 2], spread: 1, foot: .35, tones: [['#9fc0ae', '#dcebdc', '#ffffff'], ['#c4aab6', '#eedde4', '#ffffff'], ['#b4bc8c', '#e6e8c4', '#fffff4']] },
  organpipe: { build: organpipe, size: [.3, .6], count: [3, 2], spread: 1.1, foot: 0, tones: [['#8f1d2a', '#d8382f', '#ff7a5c'], ['#9a2238', '#e04a4a', '#ff8f76']] },
  starmound: { build: starmound, size: [.6, 1.5], count: [2, 2], spread: 1.8, foot: .35, tones: [['#5f7e42', '#a4bf62', '#eaf5a8'], ['#9a5634', '#dc8f56', '#ffdca4'], ['#4f8078', '#86c8b4', '#dcfff0']] },
  softtree: { build: softtree, size: [.4, .9], count: [3, 2], spread: 1.4, foot: .06, tones: [['#d83f84', '#ff6fa8', '#ffd0e2'], ['#e0602c', '#ff8a5c', '#ffd8b4'], ['#8e58d8', '#c58cff', '#eed8ff'], ['#d83a5a', '#ff6f84', '#ffd2d6']] },
  suncoral: { build: suncoral, size: [.16, .3], count: [2, 1], spread: 1.5, foot: .35, tones: [['#b8401a', '#ff8a1f', '#ffe066'], ['#c2501c', '#ffa23a', '#fff0a0']] },
  searod: { build: searod, size: [.5, 1], count: [2, 2], spread: 1.5, foot: .03, tones: [['#7a5a40', '#b89060', '#f1dfa5'], ['#66508c', '#9a7cc4', '#e3ccff'], ['#96502f', '#d88a56', '#ffd8a8']] }
};
const NAMES = Object.fromEntries(CORAL_VARIETIES.map(variety => [variety.id, variety.name]));

// --- Materials ------------------------------------------------------------------------------------------
// Per-vertex sway: aSway = (reach in metres, phase, cross phase). The constant term leans everything
// slightly down-current, as the hero formations do.
function swayPatch(shader, time) {
  shader.uniforms.uCoralTime = time;
  shader.vertexShader = `uniform float uCoralTime;\nattribute vec3 aSway;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
float coralWave = uCoralTime * .7 + aSway.y + position.y * .4;
transformed.x += (sin(coralWave) + .3 * sin(coralWave * 2.3 + aSway.z) + .35) * aSway.x;
transformed.z += cos(coralWave * .77 + aSway.z) * aSway.x * .6;`);
}
// Matte and vertex-coloured: under the shared look (ocean-look.js) both take the cheap matte path.
function materials(time) {
  const still = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .72, metalness: 0 });
  const swaying = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .68, metalness: 0 });
  swaying.onBeforeCompile = shader => swayPatch(shader, time);
  swaying.customProgramCacheKey = () => 'coral-varieties-sway-v1';
  return { still, swaying };
}

function context(economy, random, floor, tally) {
  const k = {
    e: economy === true, kit: kitFor(economy), R: random, rr: (a, b) => a + random() * (b - a), pick: list => list[Math.floor(random() * list.length)],
    // Ground under a part of a colony; a specimen stands on a level floor.
    floor: (x, z) => floor(x, z),
    still: null, swaying: null, variety: '',
    fixed(geometry, matrix, paint) { tally(k.variety, k.still.add(geometry, matrix, paint), k.still.top); },
    sway(geometry, matrix, paint, wave) { tally(k.variety, k.swaying.add(geometry, matrix, paint, wave), k.swaying.top); }
  };
  return k;
}

/**
 * One colony at the origin with its base at y = 0, at its typical width (CORAL_VARIETIES[].size, metres).
 * seed changes its shape and walks through the family's colours. Returns a Group of one or two meshes;
 * group.userData = { variety, triangles, size: [x, y, z], update(elapsed) } (update drives the sway of the soft ones).
 */
let showcase = null;
export function buildCoralSpecimen(id, { seed = 1, economy = false } = {}) {
  const variety = CORAL_VARIETIES.find(entry => entry.id === id), family = FAMILY[id];
  if (!variety) throw new Error(`Unknown coral variety "${id}"`);
  if (!showcase) { const time = { value: 0 }; showcase = { time, ...materials(time) }; }
  const whole = Math.abs(Math.round(seed)) || 1, random = mulberry(hashText(id) + whole * 7919);
  let triangles = 0;
  const k = context(economy ? true : 'fine', random, () => 0, (name, count) => { triangles += count; });
  k.still = bucket(false); k.swaying = bucket(true); k.variety = id;
  // A sun coral is shown as one clump on its stone: the catalogue width is the pair, the builder wants the clump.
  if (id === 'suncoral') family.build(k, 0, 0, 0, variety.size * .65, family.tones[(whole - 1) % family.tones.length], { clumps: 1, stone: 1.1 });
  else family.build(k, 0, 0, 0, variety.size, family.tones[(whole - 1) % family.tones.length]);
  const group = new THREE.Group(), lift = -Math.min(k.still.low, k.swaying.low), box = new THREE.Box3(); group.name = `${variety.name} specimen`;
  for (const [buffer, material] of [[k.still, showcase.still], [k.swaying, showcase.swaying]]) {
    if (!buffer.triangles) continue;
    const mesh = buffer.build(variety.name, material, lift); mesh.matrixAutoUpdate = true; group.add(mesh); box.union(mesh.geometry.boundingBox);
  }
  group.userData = { variety: id, triangles, size: box.getSize(new THREE.Vector3()).toArray(), update: elapsed => { showcase.time.value = elapsed; } };
  return group;
}

// --- Placement ------------------------------------------------------------------------------------------
// Ground the scene has already spoken for (the same list living-world.js keeps): the start, the three
// landmarks and the arch (11 to 12 m each), the grottos (10 m); the lanes between the landmarks and along the guided tour; the gully
// under the arch; the flat of each landmark pad; and the seven hero formations with their outliers.
const KEEP = [[0, 0, 12], [-12, -15, 11], [18, -39, 11], [-18, -82, 11], [20, -72, 12], [-35, -30, 10], [36, -48, 10], [-33, -73, 10], [39, -91, 10], [7, 18, 10]];
const ROUTE = [[0, 0], [-12, -15], [18, -39], [-18, -82]];
const TOUR = [[0, -5], [-12, -15], [28.5, -11], [18, -21.8], [31, -30], [31, -48], [25, -58], [20, -62.6], [20, -87.5], [4, -80], [-18, -82]];
const PADS = [[0, 0, 11.4, 13.2], [-12, -15, 6.9, 7.4], [18, -39, 9.9, 12.1], [-18, -82, 6.6, 7.5]];
const HERO = [[38, -8, 6.5], [-42, -2, 11], [48, -28, 9], [-50, -52, 10], [-9, -54, 4], [50, -72, 7], [8, -86, 7]];
const LANE_CLEAR = 3.2, SITE_REACH = 1.6, SITE_GAP = 7.5;
function lineDistance(x, z, line) {
  let closest = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = line[i - 1][0], az = line[i - 1][1], dx = line[i][0] - ax, dz = line[i][1] - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    closest = Math.min(closest, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return closest;
}
const ZONES = {
  shallow: { quota: 24, cycle: ['elkhorn', 'finger', 'fire', 'cauliflower'] },
  mid: { quota: 30, cycle: ['lettuce', 'toadstool', 'vase', 'bubble', 'starmound', 'organpipe'] },
  deep: { quota: 21, cycle: ['softtree', 'searod', 'suncoral'] }
};
// The seabed runs from about -10 m by the shore to -65 m at the far wall: above SHALLOW is the sunlit reef top (the
// About pad is at -11), below DEEP the deep shelf (the Projects pad is at -48). Ground steeper than STEEP is a terrace face.
const SHALLOW = -16.5, DEEP = -37.5, STEEP = .62;

export function createCoralVarieties(options) { const steps = coralVarietySteps(options); let step; while (!(step = steps.next()).done); return step.value; }
// The same build, pausing (yielding) after every colony so the page can do it between frames; what it yields is the
// time in ms it expects its next step to take, which is how world.js paces its jobs.
export function* coralVarietySteps({ terrainHeightAt = () => -20, collisions = null, economy = false, avoid = [], seed = 5417 } = {}) {
  const root = new THREE.Group(); root.name = 'Coral varieties';
  const floor = (x, z) => { const h = terrainHeightAt(x, z); return Number.isFinite(h) ? h : -20; };
  const time = { value: 0 }, { still, swaying } = materials(time);
  yield 2;

  // What already stands on the seabed, as a one-metre height map of the collision boxes (as living-world.js reads it).
  const GX = -62, GZ = -105, GW = 125, GH = 141, cover = new Float32Array(GW * GH).fill(-1e9);
  if (collisions && Array.isArray(collisions.boxes)) for (const { box } of collisions.boxes) {
    const x0 = Math.max(0, Math.floor(box.min.x - GX - .3)), x1 = Math.min(GW - 1, Math.ceil(box.max.x - GX + .3));
    const z0 = Math.max(0, Math.floor(box.min.z - GZ - .3)), z1 = Math.min(GH - 1, Math.ceil(box.max.z - GZ + .3));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const i = z * GW + x; if (box.max.y > cover[i]) cover[i] = box.max.y; }
  }
  const solid = (x, z) => cover[clamp(Math.round(z - GZ), 0, GH - 1) * GW + clamp(Math.round(x - GX), 0, GW - 1)] > floor(x, z) + .3;
  // Circles the caller wants left alone: { x, z, radius }, or a formation site { position: [x, y, z], radius }.
  const circles = HERO.concat((avoid || []).map(entry => [entry.x ?? entry.position?.[0], entry.z ?? entry.position?.[2], entry.radius ?? 4]).filter(([x, z]) => Number.isFinite(x) && Number.isFinite(z)));
  /** May something of this radius stand here? Clear of lanes, landmarks, pads, formations, the caller's circles and anything solid. */
  function clear(x, z, r) {
    if (Math.abs(x) > 56 - r || z < -99 + r || z > 30 - r) return false;
    for (let i = 0; i < KEEP.length; i++) if (Math.hypot(x - KEEP[i][0], z - KEEP[i][1]) < KEEP[i][2] + r) return false;
    if (x > 7 - r && x < 33 + r && z > -77 - r && z < -53 + r) return false;
    for (let i = 0; i < PADS.length; i++) if (((x - PADS[i][0]) / (PADS[i][2] + r + 1)) ** 2 + ((z - PADS[i][1]) / (PADS[i][3] + r + 1)) ** 2 < 1) return false;
    for (let i = 0; i < circles.length; i++) if (Math.hypot(x - circles[i][0], z - circles[i][1]) < circles[i][2] + .8 + r) return false;
    if (lineDistance(x, z, ROUTE) < LANE_CLEAR + r || lineDistance(x, z, TOUR) < LANE_CLEAR + r) return false;
    if (solid(x, z)) return false;
    return r < .5 || !(solid(x + r * .7, z) || solid(x - r * .7, z) || solid(x, z + r * .7) || solid(x, z - r * .7));
  }
  yield;

  // Clusters: seeded darts over the whole reef, each kept if the ground is free, no other cluster is within
  // SITE_GAP and its depth zone still has room. The plan is the same in economy; economy then builds two in three.
  const random = mulberry(seed), plan = [], filled = { shallow: 0, mid: 0, deep: 0 }, wanted = ZONES.shallow.quota + ZONES.mid.quota + ZONES.deep.quota;
  for (let dart = 0; dart < 12000 && plan.length < wanted; dart++) {
    if (dart % 250 === 249) yield 2;
    const x = (random() * 2 - 1) * 56, z = -99 + random() * 129;
    if (!clear(x, z, SITE_REACH)) continue;
    const y = floor(x, z), slope = Math.hypot(floor(x + 1, z) - floor(x - 1, z), floor(x, z + 1) - floor(x, z - 1)) / 2;
    // The lip of the arch gully is close to a cliff: a colony there would hang in the water or drown in the rock.
    if (slope > 1) continue;
    const zone = y > SHALLOW ? 'shallow' : y > DEEP ? 'mid' : 'deep';
    if (filled[zone] >= ZONES[zone].quota) continue;
    let near = false;
    for (let i = 0; i < plan.length && !near; i++) near = Math.hypot(x - plan[i].x, z - plan[i].z) < SITE_GAP;
    if (near) continue;
    filled[zone]++; plan.push({ x, y, z, zone, slope, seed: seed * 31 + plan.length * 977 });
  }
  // Families take turns within a zone. On the deep shelf the steepest third goes to the sun corals, which want a rock face.
  const turns = {}, ordinal = {};
  const wall = plan.filter(site => site.zone === 'deep').sort((a, b) => b.slope - a.slope);
  wall.slice(0, Math.ceil(wall.length / 3)).forEach(site => { site.variety = 'suncoral'; });
  for (const site of plan) {
    const cycle = site.zone === 'deep' ? ['softtree', 'searod'] : ZONES[site.zone].cycle, turn = turns[site.zone] = (turns[site.zone] ?? -1) + (site.variety ? 0 : 1);
    if (!site.variety) site.variety = cycle[turn % cycle.length];
    // The guest colony is a neighbour from the same zone; on a terrace face above the deep shelf it is one of the wall's families.
    const others = (site.zone === 'mid' && site.slope > STEEP ? ZONES.deep.cycle : ZONES[site.zone].cycle).filter(id => id !== site.variety);
    site.companion = others[(plan.indexOf(site) + Math.max(turn, 0)) % others.length];
    site.ordinal = ordinal[site.variety] = (ordinal[site.variety] ?? -1) + 1;
  }
  yield;

  // Six cells of still coral (three bands down the slope, two sides) and two of swaying coral (the upper reef and the deep).
  const band = z => (z > -12 ? 0 : z > -55 ? 1 : 2), BANDS = ['shallows', 'middle reef', 'deep reef'];
  const cells = new Map();
  const cell = (key, name, sways) => cells.get(key) || cells.set(key, { name, sways, buffer: bucket(sways) }).get(key);
  const sites = [], varieties = Object.fromEntries(CORAL_VARIETIES.map(({ id }) => [id, { sites: 0, colonies: 0, triangles: 0 }]));
  let site = null, top = -Infinity;
  const k = context(economy, null, floor, (name, count, high) => { varieties[name].triangles += count; site.triangles += count; if (high > top) top = high; });
  const ground = (x, z, r) => (r < .04 ? floor(x, z) : Math.min(floor(x, z), floor(x + r, z), floor(x - r, z), floor(x, z + r), floor(x, z - r)));

  for (const planned of plan) {
    if (economy && planned.ordinal % 3 === 2) continue;
    const local = mulberry(planned.seed), rr = (a, b) => a + local() * (b - a), b = band(planned.z);
    k.R = local; k.rr = rr; k.pick = list => list[Math.floor(local() * list.length)];
    k.still = cell(`still ${b} ${planned.x < 0 ? 0 : 1}`, `Coral varieties · ${BANDS[b]} ${planned.x < 0 ? 'west' : 'east'}`, false).buffer;
    k.swaying = cell(`sway ${b < 2 ? 0 : 1}`, `Swaying coral varieties · ${b < 2 ? 'upper reef' : 'deep reef'}`, true).buffer;
    site = { name: `${NAMES[planned.variety]} cluster ${planned.ordinal + 1}`, variety: planned.variety, zone: planned.zone, position: [planned.x, planned.y, planned.z], radius: 0, height: 0, colonies: 0, triangles: 0 };
    top = -Infinity;
    const taken = [], turn = local() * TAU;
    // Nearest free ground to a wished-for spot round the cluster's centre: free of the keep-outs and of its own neighbours.
    const spot = (index, spread, r) => {
      for (let attempt = 0; attempt < 7; attempt++) {
        const far = index || attempt ? spread * (.55 + .45 * local()) * (1 + attempt * .1) : 0, angle = turn + index * 2.4 + attempt * .9;
        const x = planned.x + Math.cos(angle) * far, z = planned.z + Math.sin(angle) * far;
        if (clear(x, z, r) && !taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < (r + tr) * .85)) { taken.push([x, z, r]); return [x, z]; }
      }
      return null;
    };
    const plant = (id, s, tone, far, index) => {
      const family = FAMILY[id], width = id === 'suncoral' ? s * 3 : s, at = spot(index, far, width * .5);
      if (!at) return;
      k.variety = id; family.build(k, at[0], ground(at[0], at[1], width * family.foot), at[1], s, tone);
      varieties[id].colonies++; site.colonies++; site.radius = Math.max(site.radius, Math.hypot(at[0] - planned.x, at[1] - planned.z) + width * .5);
    };
    const family = FAMILY[planned.variety], [small, large] = family.size, tone = k.pick(family.tones);
    // One full-grown colony and its smaller neighbours, then a single colony of another family from the same zone.
    for (let i = 0, n = family.count[economy ? 1 : 0]; i < n; i++) {
      plant(planned.variety, i ? rr(small, small + (large - small) * .4) : rr(small + (large - small) * .5, large), i && local() < .35 ? k.pick(family.tones) : tone, family.spread, i);
      yield 2;
    }
    const guest = FAMILY[planned.companion];
    plant(planned.companion, rr(guest.size[0], guest.size[0] + (guest.size[1] - guest.size[0]) * .45), k.pick(guest.tones), family.spread + 1, family.count[0] + 1);
    if (!site.colonies) continue;
    site.height = Math.max(0, top - planned.y); site.radius = Math.round(site.radius * 100) / 100; site.height = Math.round(site.height * 100) / 100;
    site.position = site.position.map(value => Math.round(value * 100) / 100);
    varieties[planned.variety].sites++; sites.push(site);
    yield 3;
  }

  yield 3;
  const culled = [];
  for (const { name, sways, buffer } of cells.values()) {
    if (!buffer.triangles) continue;
    const mesh = buffer.build(name, sways ? swaying : still); mesh.userData.triangles = buffer.triangles;
    root.add(mesh); culled.push({ mesh, sphere: mesh.geometry.boundingSphere });
    yield 3;
  }
  const counts = { sites: sites.length, colonies: 0, drawCalls: root.children.length, triangles: 0, swaying: 0, varieties };
  for (const entry of Object.values(varieties)) { counts.colonies += entry.colonies; counts.triangles += entry.triangles; }
  for (const { mesh } of culled) if (mesh.material === swaying) counts.swaying += mesh.userData.triangles;

  // Only the time uniform moves; night and depth are accepted so the call matches the other reef modules.
  function update(elapsed = 0) { time.value = elapsed; }
  // view: { frustum, eye, range }, or null to show everything. The renderer culls each cell against the
  // view; the haze range is tested here.
  function cull(view = null) {
    for (const { mesh, sphere } of culled) mesh.visible = !view || view.eye.distanceTo(sphere.center) - sphere.radius < view.range;
  }
  return { root, update, cull, counts, sites };
}
