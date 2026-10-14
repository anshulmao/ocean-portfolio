import * as THREE from './vendor/three.module.min.js';
import { stylize } from './ocean-look.js';

// The kit behind living-world.js: one lit program for every animated creature
// (a per-instance "kind" picks the deformer and the painted pattern), one for
// the bait ball (each fish flies its own orbit in the vertex shader) and one
// for every particle (bubbles, sand, ink, plankton, eyeshine, spray).
const TAU = Math.PI * 2;
const ZERO4 = [0, 0, 0, 0];
const clamp01 = value => Math.min(1, Math.max(0, value));
const smooth = (value, low, high) => { const t = clamp01((value - low) / (high - low)); return t * t * (3 - 2 * t); };
export const tone = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const blend = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Accumulates painted, rigged triangles: position, colour and a four-float rig weight per vertex. */
export class Mesher {
  constructor() { this.p = []; this.c = []; this.r = []; this.i = []; this.xf = null; this._v = new THREE.Vector3(); }
  get count() { return this.p.length / 3; }
  v(x, y, z, paint, rig, t = 0, a = 0) {
    const c = typeof paint === 'function' ? paint(x, y, z, t, a) : paint, r = typeof rig === 'function' ? rig(x, y, z, t, a) : rig || ZERO4;
    if (this.xf) { const w = this._v.set(x, y, z).applyMatrix4(this.xf); x = w.x; y = w.y; z = w.z; }
    this.p.push(x, y, z); this.c.push(c[0], c[1], c[2]); this.r.push(r[0], r[1], r[2], r[3]);
    return this.count - 1;
  }
  /** A tube through points. radii: a number or [across, up] per point. */
  sweep(points, radii, radial, paint, rig, { up = [0, 1, 0], capStart = true, capEnd = true } = {}) {
    const n = points.length, rings = [];
    const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), U = new THREE.Vector3(...up);
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
      T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      if (i === 0) { B.copy(U).addScaledVector(T, -U.dot(T)); if (B.lengthSq() < 1e-6) B.set(1, 0, 0).addScaledVector(T, -T.x); }
      else B.addScaledVector(T, -B.dot(T));
      B.normalize(); N.crossVectors(B, T);
      const rad = radii[i], rx = Array.isArray(rad) ? rad[0] : rad, ry = Array.isArray(rad) ? rad[1] : rad, ring = [];
      for (let j = 0; j < radial; j++) {
        const angle = j / radial * TAU, cx = Math.cos(angle) * rx, cy = Math.sin(angle) * ry;
        ring.push(this.v(points[i][0] + N.x * cx + B.x * cy, points[i][1] + N.y * cx + B.y * cy, points[i][2] + N.z * cx + B.z * cy, paint, rig, i / (n - 1), angle));
      }
      rings.push(ring);
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
      const a = rings[i][j], b = rings[i][(j + 1) % radial], c = rings[i + 1][j], d = rings[i + 1][(j + 1) % radial];
      this.i.push(a, b, c, b, d, c);
    }
    if (capStart) { const tip = this.v(points[0][0], points[0][1], points[0][2], paint, rig, 0, 0); for (let j = 0; j < radial; j++) this.i.push(tip, rings[0][(j + 1) % radial], rings[0][j]); }
    if (capEnd) { const tip = this.v(points[n - 1][0], points[n - 1][1], points[n - 1][2], paint, rig, 1, 0); for (let j = 0; j < radial; j++) this.i.push(tip, rings[n - 1][j], rings[n - 1][(j + 1) % radial]); }
    return this;
  }
  /** An ellipsoid; warp(x, y, z) on the unit sphere reshapes it before scaling. */
  blob(cx, cy, cz, rx, ry, rz, seg, rings, paint, rig, warp = null) {
    const at = (x, y, z, t, a) => { if (warp) { const w = warp(x, y, z); x = w[0]; y = w[1]; z = w[2]; } return this.v(cx + x * rx, cy + y * ry, cz + z * rz, paint, rig, t, a); };
    const top = at(0, 1, 0, 0, 0), rows = [];
    for (let i = 1; i < rings; i++) {
      const phi = i / rings * Math.PI, y = Math.cos(phi), s = Math.sin(phi), row = [];
      for (let j = 0; j < seg; j++) { const th = j / seg * TAU; row.push(at(Math.cos(th) * s, y, Math.sin(th) * s, i / rings, th)); }
      rows.push(row);
    }
    const bottom = at(0, -1, 0, 1, 0);
    for (let j = 0; j < seg; j++) this.i.push(top, rows[0][(j + 1) % seg], rows[0][j]);
    for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < seg; j++) {
      const a = rows[i][j], b = rows[i][(j + 1) % seg], c = rows[i + 1][j], d = rows[i + 1][(j + 1) % seg];
      this.i.push(a, b, c, b, d, c);
    }
    const last = rows[rows.length - 1];
    for (let j = 0; j < seg; j++) this.i.push(bottom, last[j], last[(j + 1) % seg]);
    return this;
  }
  /** A flat fan from the first point: fins, wings and flukes. */
  fan(points, paint, rig) {
    const ids = points.map((p, k) => this.v(p[0], p[1], p[2], paint, rig, k / (points.length - 1), 0));
    for (let k = 1; k < ids.length - 1; k++) this.i.push(ids[0], ids[k], ids[k + 1]);
    return this;
  }
  /** A strip between two lines of equal length. */
  ribbon(a, b, paint, rig) {
    const ia = a.map((p, k) => this.v(p[0], p[1], p[2], paint, rig, k / (a.length - 1), 0)), ib = b.map((p, k) => this.v(p[0], p[1], p[2], paint, rig, k / (b.length - 1), 1));
    for (let k = 0; k < a.length - 1; k++) this.i.push(ia[k], ia[k + 1], ib[k], ia[k + 1], ib[k + 1], ib[k]);
    return this;
  }
  /** Faceted stone: an icosphere with jittered corners and a flattened base, every face on its own vertices. */
  rock(cx, cy, cz, rx, ry, rz, seed, paint, detail = 1, rough = .42) {
    const source = new THREE.IcosahedronGeometry(1, detail), p = source.getAttribute('position');
    const hash = (x, y, z) => { const s = Math.sin(Math.round(x * 50) * 12.9898 + Math.round(y * 50) * 78.233 + Math.round(z * 50) * 37.719 + seed * 3.17) * 43758.5453; return s - Math.floor(s); };
    for (let k = 0; k < p.count; k += 3) {
      const ids = [];
      for (let n = 0; n < 3; n++) {
        let x = p.getX(k + n), y = p.getY(k + n), z = p.getZ(k + n);
        const j = 1 + (hash(x, y, z) - .5) * rough;
        x *= j; y *= j; z *= j; if (y < 0) y *= .3;
        ids.push(this.v(cx + x * rx, cy + y * ry, cz + z * rz, paint, null, y * .5 + .5, hash(z, x, y)));
      }
      this.i.push(ids[0], ids[1], ids[2]);
    }
    source.dispose();
    return this;
  }
  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    geometry.setAttribute('aRig', new THREE.Float32BufferAttribute(this.r, 4));
    geometry.setIndex(this.i); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    return geometry;
  }
}

// ---------------------------------------------------------------------------
// Creatures. One unit is one metre before the instance scale; all face +Z.

/** Generic reef fish, one unit long. rig: x tail flex, y puff, z jaw, w fin (takes the second colour). */
function fishGeometry() {
  const m = new Mesher();
  const stations = [[.5, .005, .005], [.44, .05, .036], [.32, .125, .07], [.12, .175, .085], [-.1, .165, .072], [-.28, .1, .045], [-.4, .045, .02], [-.455, .03, .012]];
  const rig = fin => (x, y, z) => [Math.pow(clamp01((.32 - z) / .8), 1.4), smooth(z, -.46, -.2) * (1 - smooth(z, .3, .5)), z > .34 && y < 0 ? clamp01((z - .34) / .12) : 0, fin];
  const paint = (x, y) => { const v = .62 + .36 * (1 - smooth(y, -.06, .1)); return [v, v, v]; };
  m.sweep(stations.map(s => [0, 0, s[0]]), stations.map(s => [s[2], s[1]]), 8, paint, rig(0), { capStart: false });
  const fin = [.86, .86, .86];
  m.fan([[0, 0, -.43], [0, .18, -.63], [0, .06, -.56], [0, 0, -.54], [0, -.06, -.56], [0, -.18, -.63]], fin, rig(1));
  m.fan([[0, .165, .16], [0, .275, .0], [0, .245, -.16], [0, .105, -.29]], fin, rig(1));
  m.fan([[0, -.16, -.02], [0, -.245, -.14], [0, -.1, -.3]], fin, rig(1));
  for (const side of [-1, 1]) m.fan([[side * .07, -.03, .2], [side * .17, -.08, .09], [side * .12, -.115, .15]], fin, rig(1));
  return m.build();
}

/** A slender upright tube one unit tall with a hooked head: garden eels; with fewer rings, anemone tentacles and whips. */
function tubeGeometry(radial, heights, radii) {
  const m = new Mesher(), hook = h => h > .7 ? .12 * ((h - .7) / .3) ** 2 : 0;
  m.sweep(heights.map(h => [0, h - hook(h) * .25, hook(h)]), radii, radial, (x, y) => { const v = .72 + .28 * y; return [v, v, v]; }, null, { up: [0, 0, 1], capStart: false });
  return m.build();
}

/** Moray: the den mouth is the origin, the body runs back into it. rig: z lower jaw. */
function morayGeometry() {
  const m = new Mesher(), olive = tone('#6f8a2e'), dark = tone('#3d4c1c'), pale = tone('#ecdcc0');
  const body = [[-.72, 0, .05, .065], [-.45, 0, .056, .085], [-.15, 0, .056, .087], [.1, 0, .056, .083], [.24, .004, .058, .074], [.31, .012, .052, .058], [.39, .018, .041, .04], [.445, .02, .024, .02]];
  m.sweep(body.map(s => [0, s[1], s[0]]), body.map(s => [s[2], s[3]]), 8, (x, y, z) => z > .25 && y < -.004 ? pale : blend(dark, olive, smooth(y, -.06, .05)), null, { capStart: false });
  const jaw = [[.2, -.052, .046, .02], [.3, -.05, .042, .018], [.385, -.043, .032, .014], [.435, -.037, .014, .008]];
  m.sweep(jaw.map(s => [0, s[1], s[0]]), jaw.map(s => [s[2], s[3]]), 6, (x, y) => y > -.044 && Math.abs(x) < .026 ? pale : olive, (x, y, z) => [0, 0, clamp01((z - .2) / .235), 0]);
  const ridge = [-.65, -.45, -.25, -.05, .12, .22];
  m.ribbon(ridge.map(z => [0, .078, z]), ridge.map((z, k) => [0, .12 + (k === ridge.length - 1 ? -.03 : .012), z - .03]), tone('#93a04f'));
  for (const side of [-1, 1]) { m.blob(side * .041, .036, .335, .014, .014, .014, 5, 4, tone('#f6efc4')); m.blob(side * .051, .037, .341, .006, .008, .008, 4, 3, [.01, .01, .012]); }
  return m.build();
}

/** Octopus: arms splayed on the ground plane, mantle toward +Z (it leads when jetting). rig: x along arm, y mantle. */
function octopusGeometry() {
  const m = new Mesher(), skin = [.94, .94, .94], under = [.8, .8, .8];
  for (let k = 0; k < 8; k++) {
    const base = (k + .5) / 8 * TAU, curl = k % 2 ? 1 : -1, points = [], radii = [];
    // Arms drape down over whatever it sits on and curl at the tips.
    for (let i = 0; i <= 5; i++) {
      const s = i / 5, a = base + .6 * s * s * curl, r = .07 + .36 * s;
      points.push([Math.cos(a) * r, .04 + .03 * Math.sin(Math.PI * s) - .2 * Math.pow(s, 1.7), Math.sin(a) * r]); radii.push(.044 - .036 * Math.pow(s, .8));
    }
    m.sweep(points, radii, 5, (x, y, z, t, a) => Math.sin(a) < -.3 ? under : skin, (x, y, z, t) => [t, 0, 0, 0], { capStart: false });
  }
  m.blob(0, .085, 0, .095, .08, .095, 8, 5, skin, ZERO4);
  m.blob(0, .17, .17, .125, .13, .2, 8, 6, skin, [0, 1, 0, 0], (x, y, z) => [x * (1 - .25 * z), y * (1 - .2 * z) + .1 * z, z]);
  for (const side of [-1, 1]) m.blob(side * .074, .145, .015, .028, .03, .028, 5, 4, [1, .96, .7], ZERO4);
  return m.build();
}

/** Stingray, one unit across. rig: x wing (rises toward the tips), y tail. */
function rayGeometry() {
  const m = new Mesher(), back = tone('#8f8256'), edge = tone('#b3a57a'), seg = 16;
  const outline = a => { const s = Math.sin(a), c = Math.cos(a); return [Math.sign(s) * Math.pow(Math.abs(s), 1.25) * .5, Math.sign(c) * Math.pow(Math.abs(c), 1.25) * (c > 0 ? .42 : .36)]; };
  const wing = x => Math.pow(clamp01((Math.abs(x) - .07) / .43), 1.2);
  const dome = (x, f) => .055 * Math.pow(1 - f * f, 1.2) + .04 * Math.exp(-((x / .1) ** 2)) * (1 - f * .7);
  const centre = m.v(0, dome(0, 0), 0, back, ZERO4), rings = [];
  for (const f of [.36, .7, 1]) {
    const ring = [];
    for (let j = 0; j < seg; j++) { const [ox, oz] = outline(j / seg * TAU), x = ox * f, z = oz * f; ring.push(m.v(x, dome(x, f), z, blend(back, edge, f * f), [wing(x), 0, 0, 0])); }
    rings.push(ring);
  }
  for (let j = 0; j < seg; j++) m.i.push(centre, rings[0][j], rings[0][(j + 1) % seg]);
  for (let i = 0; i < 2; i++) for (let j = 0; j < seg; j++) { const a = rings[i][j], b = rings[i][(j + 1) % seg], c = rings[i + 1][j], d = rings[i + 1][(j + 1) % seg]; m.i.push(a, c, b, b, c, d); }
  m.sweep([[0, .03, -.33], [0, .026, -.58], [0, .02, -.82], [0, .014, -1.05]], [.024, .015, .009, .003], 3, back, (x, y, z, t) => [0, t, 0, 0], { capStart: false });
  for (const side of [-1, 1]) m.blob(side * .07, .088, .2, .024, .022, .03, 5, 4, tone('#5d5338'), ZERO4);
  return m.build();
}

/** Crab about 16 cm across. rig: x leg phase, y how far down the leg, z hermit shell, w claw. */
function crabGeometry() {
  const m = new Mesher(), shell = tone('#c8553b'), legTone = tone('#d9774f'), tip = tone('#f1d6b8'), black = [.02, .02, .02];
  m.blob(0, .052, 0, .062, .026, .046, 8, 4, (x, y) => blend(tone('#8e3a2b'), shell, smooth(y, .04, .07)), ZERO4);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const z = (k - 1.6) * .028, phase = (k % 2 ? .5 : 0) + (side > 0 ? .25 : 0);
      m.sweep([[side * .045, .05, z], [side * .105, .078, z * 1.5], [side * .15, .002, z * 1.9]], [.008, .0065, .003], 3, legTone, (x, y, zz, t) => [phase, t, 0, 0], { capStart: false });
    }
    m.sweep([[side * .04, .05, .035], [side * .078, .058, .075], [side * .06, .056, .112]], [.011, .012, .015], 4, (x, y, z, t) => blend(shell, tip, t * t), (x, y, z, t) => [0, 0, 0, t], { capStart: false });
    m.sweep([[side * .02, .068, .04], [side * .024, .094, .046]], [.004, .0045], 3, legTone, ZERO4, { capStart: false, capEnd: false });
    m.blob(side * .024, .098, .046, .0075, .0075, .0075, 4, 3, black, ZERO4);
  }
  const whorl = tone('#e9dcc0'), band = tone('#b98a5a');
  m.blob(0, .085, -.035, .055, .058, .06, 7, 5, (x, y, z, t) => Math.sin(t * 22) > .2 ? whorl : band, [0, 0, 1, 0], (x, y, z) => [x * (1 - .3 * y), y + .25 * Math.max(0, y) ** 2, z - .25 * y]);
  return m.build();
}

/** Seahorse about 17 cm tall, tail curled round the origin. rig: x sway with height. */
function seahorseGeometry() {
  const m = new Mesher();
  const path = [[0, .036, .03], [0, .012, .036], [0, 0, .016], [0, .01, -.006], [0, .04, -.013], [0, .075, -.004], [0, .105, .012], [0, .132, .012], [0, .152, -.002], [0, .165, .004], [0, .168, .028], [0, .158, .056]];
  const radii = [.004, .006, .008, .011, .016, .021, .022, .016, .013, .015, .011, .005];
  m.sweep(path, radii, 5, (x, y) => { const v = .78 + 1.2 * y; return [v, v, v]; }, (x, y) => [clamp01(y / .17), 0, 0, 0], { up: [0, 0, 1] });
  m.fan([[0, .1, -.012], [0, .12, -.04], [0, .092, -.045], [0, .07, -.02]], [1, 1, 1], [.5, 0, 0, 0]);
  m.fan([[0, .178, .004], [0, .195, -.006], [0, .186, -.02], [0, .168, -.01]], [1, 1, 1], [1, 0, 0, 0]);
  return m.build();
}

/** Dolphin, one unit long. rig: x flex toward the flukes (vertical). */
function dolphinGeometry() {
  const m = new Mesher(), back = tone('#44607a'), belly = tone('#dfe8ea');
  const stations = [[.5, -.02, .008, .008], [.44, -.02, .03, .028], [.36, 0, .07, .085], [.2, 0, .105, .12], [0, 0, .11, .125], [-.2, 0, .085, .095], [-.36, .005, .04, .05], [-.46, .01, .018, .03]];
  const rig = (x, y, z) => [Math.pow(clamp01((.1 - z) / .6), 1.3), 0, 0, 0];
  m.sweep(stations.map(s => [0, s[1], s[0]]), stations.map(s => [s[2], s[3]]), 8, (x, y) => blend(belly, back, smooth(y, -.05, .02)), rig, { capStart: false });
  m.fan([[0, .118, .03], [0, .255, -.1], [0, .215, -.145], [0, .112, -.17]], back, rig);
  for (const side of [-1, 1]) m.fan([[side * .085, -.07, .19], [side * .225, -.15, .06], [side * .15, -.135, .15]], back, rig);
  m.fan([[0, .012, -.44], [.175, .012, -.565], [.06, .012, -.53], [0, .012, -.505], [-.06, .012, -.53], [-.175, .012, -.565]], back, rig);
  return m.build();
}

/** Flying fish, one unit long. rig: x wing. */
function flyingFishGeometry() {
  const m = new Mesher(), back = tone('#2a5390'), belly = tone('#e3edf2'), wingTone = tone('#d9ecf6');
  const stations = [[.5, .005, .005], [.4, .03, .035], [.2, .045, .055], [-.1, .04, .05], [-.35, .018, .022], [-.45, .008, .012]];
  m.sweep(stations.map(s => [0, 0, s[0]]), stations.map(s => [s[1], s[2]]), 5, (x, y) => blend(belly, back, smooth(y, -.02, .03)), ZERO4, { capStart: false });
  const wing = (x) => [clamp01((Math.abs(x) - .04) / .36), 0, 0, 0];
  for (const side of [-1, 1]) {
    m.fan([[side * .04, .02, .24], [side * .43, .17, .04], [side * .37, .14, -.13], [side * .05, .012, -.01]], wingTone, wing);
    m.fan([[side * .03, -.01, -.12], [side * .2, .05, -.2], [side * .16, .04, -.3], [side * .03, -.01, -.24]], wingTone, wing);
  }
  m.fan([[0, 0, -.44], [0, .1, -.6], [0, 0, -.5], [0, -.17, -.67]], back, ZERO4);
  return m.build();
}

/** Turtle for the surface, about 80 cm of shell. rig: x flipper. */
function turtleGeometry() {
  const m = new Mesher(), shell = tone('#566a44'), scute = tone('#74875a'), skin = tone('#8fa884'), plastron = tone('#cfd0a6');
  m.blob(0, 0, 0, .3, .15, .39, 10, 6, (x, y, z, t, a) => y < -.01 ? plastron : (Math.sin(a * 5) * Math.sin(t * 14) > .25 ? scute : shell), ZERO4, (x, y, z) => [x, y < 0 ? y * .3 : y, z]);
  m.sweep([[0, -.01, .33], [0, .02, .47]], [[.055, .05], [.06, .055]], 6, skin, ZERO4, { capStart: false, capEnd: false });
  m.blob(0, .03, .53, .068, .062, .09, 7, 5, (x, y, z) => z > .58 ? tone('#b9c59a') : skin, ZERO4);
  for (const side of [-1, 1]) {
    m.blob(side * .05, .058, .565, .012, .012, .012, 4, 3, [.02, .03, .03], ZERO4);
    const flip = (x) => [clamp01((Math.abs(x) - .22) / .4), 0, 0, 0];
    m.fan([[side * .2, -.02, .27], [side * .62, -.035, .2], [side * .52, -.035, -.02], [side * .24, -.02, .09]], skin, flip);
    m.fan([[side * .17, -.02, -.27], [side * .36, -.03, -.42], [side * .24, -.03, -.5], [side * .1, -.02, -.34]], skin, flip);
  }
  return m.build();
}

/** A whale's back, tail stock and flukes: about seven metres, pivoted near the back for the fluke-up dive. */
function whaleTailGeometry() {
  const m = new Mesher(), slate = tone('#1d2730'), wet = tone('#2c3a46'), mark = tone('#8f9ba3');
  const stations = [[0, 1.25], [1.2, 1.3], [2.6, 1.05], [4, .7], [5.2, .4], [6, .24]];
  m.sweep(stations.map(s => [0, 0, s[0]]), stations.map(s => [s[1] * .9, s[1] * 1.08]), 8, (x, y) => blend(slate, wet, smooth(y, 0, .8)), ZERO4);
  m.fan([[0, 1.18, 2.1], [0, 1.52, 2.55], [0, 1.02, 3.0]], wet, ZERO4);
  for (const side of [-1, 1]) m.fan([[0, 0, 5.85], [side * .3, 0, 6.5], [side * 1.25, 0, 6.72], [side * 2.3, 0, 6.95], [side * 1.5, 0, 6.2], [side * .4, 0, 5.9]], (x) => blend(slate, mark, smooth(Math.abs(x), 1.2, 2.3) * .55), ZERO4);
  return m.build();
}

/** Bait fish: a 20 cm sliver, eight triangles and a tail. */
function baitGeometry() {
  const m = new Mesher(), back = tone('#7c97a6'), flank = tone('#e6f0f2');
  const nose = m.v(0, 0, .1, flank), tail = m.v(0, 0, -.07, flank);
  const ring = [m.v(0, .027, .015, back), m.v(.012, 0, .015, flank), m.v(0, -.024, .015, flank), m.v(-.012, 0, .015, flank)];
  for (let j = 0; j < 4; j++) { m.i.push(nose, ring[j], ring[(j + 1) % 4]); m.i.push(tail, ring[(j + 1) % 4], ring[j]); }
  m.fan([[0, 0, -.06], [0, .027, -.105], [0, -.027, -.105]], back);
  const geometry = m.build(); geometry.deleteAttribute('aRig');
  return geometry;
}

// ---------------------------------------------------------------------------
// Programs.

const LIFE_VERTEX_HEAD = /* glsl */ `
attribute vec4 aRig; attribute vec4 aLife; attribute vec4 aTint;
uniform float uLifeTime;
varying vec3 vLifePos; varying vec4 vLifeTint; varying vec4 vLifeInfo;`;

// aLife: x phase, y state, z drive, w kind. Kinds: 0-5 fish (plain, banded, barred, striped, spotted + puff, flatfish),
// 10-13 upright tubes (spotted eel, tentacle, whip, banded eel), 20-21 flappers (ray, turtle), 30-31 crabs (crab, hermit), 40 octopus,
// 50 moray, 60 seahorse, 70 dolphin, 80 flying fish, 99 still.
const LIFE_VERTEX_BODY = /* glsl */ `#include <begin_vertex>
vLifePos = position; vLifeTint = aTint; vLifeInfo = vec4(aLife.w, aLife.y, aLife.z, aRig.w);
{
  float lt = uLifeTime, ph = aLife.x, st = aLife.y, pr = aLife.z, kind = aLife.w;
  if (kind < 9.5) {
    transformed.x += sin(position.z * 6.0 + lt * 7.0 + ph) * (.012 + .07 * pr) * aRig.x;
    if (kind > 3.5 && kind < 4.5) { transformed.xy *= 1.0 + st * aRig.y * vec2(2.2, .85); transformed.z *= 1.0 - .1 * st; }
    else transformed.y -= st * aRig.z * .1;
  } else if (kind < 19.5) {
    // st: how far the eel has sunk into its burrow. Whatever is under the sand collapses onto the hole.
    float h = position.y, y = h - st * 1.04, ext = 1.0 - st;
    transformed.x += sin(lt * 1.1 + ph + h * 2.6) * pr * h * h * (.25 + .75 * ext);
    transformed.z += cos(lt * .83 + ph * 1.7 + h * 2.1) * pr * .7 * h * h * (.25 + .75 * ext);
    transformed.y = y;
    if (y < 0.0) transformed = vec3(0.0);
  } else if (kind < 29.5) {
    transformed.y += sin(lt * 3.2 - aRig.x * 2.2 + ph) * aRig.x * (.015 + .2 * pr);
    transformed.y -= st * (.03 + aRig.x * .05) * step(kind, 20.5);
    transformed.x += sin(lt * 2.0 + position.z * 4.0 + ph) * aRig.y * .06 * (.3 + pr);
  } else if (kind < 39.5) {
    float stride = sin(lt * 15.0 + aRig.x * 6.2832 + ph);
    transformed.y += max(stride, 0.0) * aRig.y * .03 * pr;
    transformed.x += stride * aRig.y * .028 * pr;
    if (kind < 30.5) { transformed = mix(transformed, vec3(0.0, .05, -.01), aRig.z); transformed.y += st * aRig.w * .05; }
    else transformed.xz *= 1.0 - st * max(aRig.y, aRig.w) * .7;
  } else if (kind < 49.5) {
    float s = aRig.x, around = atan(position.z, position.x), reach = length(position.xz);
    transformed.y += sin(lt * 1.3 + s * 5.0 + around * 2.0 + ph) * .035 * s * (1.0 - st);
    transformed.xz *= 1.0 + sin(lt * .7 + around * 3.0 + ph) * .07 * s * (1.0 - st);
    vec3 trail = vec3(position.x * .2, position.y * .5 + .05 + sin(lt * 9.0 + s * 7.0 + around) * .03 * s, -reach * 1.2 - .04);
    transformed = mix(transformed, trail, st * min(1.0, s * 5.0));
    transformed += normal * aRig.y * mix(sin(lt * 1.6 + ph), sin(lt * 9.0 + ph), st) * .012;
  } else if (kind < 59.5) {
    // The neck bends progressively toward where the head is looking; ph carries the pitch, pr the yaw.
    float w = smoothstep(-.15, .5, position.z);
    transformed.x += sin(lt * 1.1 + position.z * 4.0) * .026 * w;
    transformed.y += sin(lt * .9 + position.z * 3.0 + 1.3) * .018 * w - aRig.z * (.012 + .034 * (.5 + .5 * sin(lt * 1.5)));
    float cy = cos(pr * w), sy = sin(pr * w); transformed.xz = vec2(transformed.x * cy + transformed.z * sy, -transformed.x * sy + transformed.z * cy);
    float cp = cos(ph * w), sp = sin(ph * w); transformed.yz = vec2(transformed.y * cp + transformed.z * sp, -transformed.y * sp + transformed.z * cp);
    transformed.z -= st * .62;
  } else if (kind < 69.5) {
    transformed.x += sin(lt * 1.2 + ph + position.y * 9.0) * .012 * aRig.x;
    transformed.z += sin(lt * .8 + ph * 1.3) * .01 * aRig.x;
  } else if (kind < 79.5) {
    transformed.y += sin(position.z * 2.4 + lt * 6.5 + ph) * (.012 + .07 * pr) * aRig.x;
  } else if (kind < 89.5) {
    transformed.x *= mix(.12, 1.0, mix(1.0, st, step(.001, aRig.x)));
    transformed.y += sin(lt * 38.0 + ph) * .012 * aRig.x * st;
  }
}`;

const LIFE_FRAGMENT_HEAD = /* glsl */ `
uniform float uLifeNight;
varying vec3 vLifePos; varying vec4 vLifeTint; varying vec4 vLifeInfo;`;

const LIFE_FRAGMENT_COLOR = /* glsl */ `#include <color_fragment>
{
  float k = vLifeInfo.x, m = 0.0; vec3 q = vLifePos;
  if (k < 9.5) {
    if (k < .5) m = vLifeInfo.w;
    else if (k < 1.5) { float d = min(abs(q.z - .27), min(abs(q.z + .02), abs(q.z + .3))); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.02), (1.0 - smoothstep(.05, .075, d)) * .85); m = 1.0 - smoothstep(.032, .048, d); }
    else if (k < 2.5) m = max((1.0 - smoothstep(.03, .06, min(abs(q.z - .33), abs(q.z - .08)))) * .9, vLifeInfo.w * .8);
    else if (k < 3.5) m = max(1.0 - smoothstep(.014, .03, abs(q.y - .025)), vLifeInfo.w * .5);
    else if (k < 4.5) m = smoothstep(.45, .75, sin(q.z * 36.0) * sin(q.y * 36.0 + q.z * 11.0)) * smoothstep(-.07, .01, q.y);
    else m = .5 + .5 * sin(q.z * 31.0 + sin(q.y * 23.0) * 2.0) * sin(q.y * 27.0 + q.z * 9.0);
    float eye = (1.0 - smoothstep(.014, .026, distance(q.zy, vec2(.37, .035)))) * step(.012, abs(q.x));
    diffuseColor.rgb = mix(mix(diffuseColor.rgb, vLifeTint.rgb, clamp(m, 0.0, 1.0)), vec3(.015, .02, .03), eye);
  } else {
    if (k < 10.5) m = smoothstep(.5, .8, sin(q.y * 40.0) * sin(atan(q.x, q.z) * 2.0 + q.y * 9.0)) * .8;
    else if (k < 11.5) m = smoothstep(.7, .98, q.y);
    else if (k > 12.5 && k < 13.5) m = smoothstep(.42, .5, abs(fract(q.y * 8.0 + .25) - .5) * 2.0) * (1.0 - smoothstep(.86, .9, q.y));
    else if (k > 19.5 && k < 20.5) {
      m = smoothstep(.62, .86, sin(q.x * 27.0 + 1.0) * sin(q.z * 27.0 + q.x * 6.0)) * step(-.34, q.z);
      // Half buried: sand lies over the wings and thins toward the eyes.
      float sand = vLifeInfo.y * smoothstep(.02, .3, length(q.xz - vec2(0.0, .12))) * (.75 + .25 * sin(q.x * 61.0) * sin(q.z * 53.0));
      diffuseColor.rgb = mix(mix(diffuseColor.rgb, vLifeTint.rgb, m), vec3(.56, .45, .27), clamp(sand, 0.0, .92)); m = 0.0;
    }
    else if (k > 39.5 && k < 49.5) m = (.5 + .5 * sin(q.x * 37.0 + sin(q.z * 29.0) * 2.0) * sin(q.z * 33.0 + q.y * 21.0)) * (.22 + .3 * vLifeInfo.z);
    else if (k > 49.5 && k < 59.5) m = smoothstep(.3, .7, sin(q.z * 44.0 + q.y * 30.0) * sin(q.y * 52.0 - q.z * 17.0)) * .7 * step(-.04, q.y);
    else if (k > 59.5 && k < 69.5) m = step(.55, fract(q.y * 42.0)) * .35;
    diffuseColor.rgb = mix(diffuseColor.rgb, vLifeTint.rgb, clamp(m, 0.0, 1.0));
  }
}`;

const LIFE_FRAGMENT_GLOW = /* glsl */ `#include <emissivemap_fragment>
if (vLifeTint.a > 0.0) {
  float lifeRim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
  totalEmissiveRadiance += mix(diffuseColor.rgb, vec3(.3, .95, .85), .45) * (vLifeTint.a * uLifeNight * (.16 + lifeRim * lifeRim));
}`;

function lifeMaterial(shared, { fog = false, look = {} } = {}) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .62, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.uLifeTime = shared.uLifeTime; shader.uniforms.uLifeNight = shared.uLifeNight;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>${LIFE_VERTEX_HEAD}`).replace('#include <begin_vertex>', LIFE_VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>${LIFE_FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', LIFE_FRAGMENT_COLOR).replace('#include <emissivemap_fragment>', LIFE_FRAGMENT_GLOW);
  };
  material.customProgramCacheKey = () => 'living-world-life-v1';
  stylize(material, { toon: .4, rim: .42, caustics: .7, ...look });
  // Above the water the shared look leaves a surface to the scene fog; these are seen from both sides of it.
  if (fog) material.fog = true;
  return material;
}

const BAIT_VERTEX_HEAD = /* glsl */ `
attribute vec4 aOrbit; attribute vec2 aSeed;
uniform vec4 uBall; uniform vec4 uBallMove; uniform vec4 uBallDiver; uniform vec3 uBallDiverDir; uniform vec4 uBallPred[3];
vec3 baitOrbit(float th, float ct, float st, float cn, float sn) {
  vec3 q = vec3(cos(th), 0.0, sin(th));
  q = vec3(q.x, -q.z * st, q.z * ct);
  return vec3(q.x * cn + q.z * sn, q.y, -q.x * sn + q.z * cn);
}
// Pushes a point out of a sphere without folding the school: order along every ray is kept.
vec3 baitPush(vec3 w, vec3 c, float r) { vec3 d = w - c; float l = max(length(d), .001), x = l / r; return w + d / l * (r * exp(-x * x)); }`;

// aOrbit: x radius (fraction of the ball), y tilt of the orbit plane, z where the plane crosses, w phase.
// uBallMove: x spin (integrated on the CPU so the ball can speed up), y squash, z time.
const BAIT_VERTEX_NORMAL = /* glsl */ `
float bT = uBallMove.z;
float bCt = cos(aOrbit.y), bSt = sin(aOrbit.y), bCn = cos(aOrbit.z), bSn = sin(aOrbit.z);
float bTh = aOrbit.w + uBallMove.x * (.55 + .9 * (1.0 - aOrbit.x)) * (.85 + .3 * aSeed.x);
float bR = uBall.w * aOrbit.x * (1.0 + .1 * sin(bT * .9 + aOrbit.w * 3.0));
vec3 bC = baitOrbit(bTh, bCt, bSt, bCn, bSn) * bR;
vec3 bF = baitOrbit(bTh + .06, bCt, bSt, bCn, bSn) * bR - bC;
bC.y *= uBallMove.y; bF.y *= uBallMove.y;
vec3 bW = uBall.xyz + bC;
// The diver opens a tunnel: a capsule along the way they are heading.
vec3 bD = bW - uBallDiver.xyz; bD -= uBallDiverDir * clamp(dot(bD, uBallDiverDir), -3.0, 5.0);
float bL = max(length(bD), .001), bX = bL / max(uBallDiver.w, .01);
bW += bD / bL * (uBallDiver.w * exp(-bX * bX));
for (int i = 0; i < 3; i++) bW = baitPush(bW, uBallPred[i].xyz, max(uBallPred[i].w, .01));
vec3 bFw = normalize(bF), bRt = normalize(cross(vec3(0.0, 1.0, 0.0), bFw)), bUp = cross(bFw, bRt);
vec3 objectNormal = bRt * normal.x + bUp * normal.y + bFw * normal.z;`;

const BAIT_VERTEX_BODY = /* glsl */ `
vec3 bP = position * (.8 + .45 * aSeed.y);
bP.x += sin(position.z * 28.0 + bT * 16.0 + aOrbit.w * 7.0) * .018 * (1.0 - smoothstep(-.09, .03, position.z));
vec3 transformed = bW + bRt * bP.x + bUp * bP.y + bFw * bP.z;
#ifdef USE_COLOR
// Silver flanks flash as a fish rolls through its turn.
vColor.rgb *= .72 + .6 * pow(abs(sin(bTh * 1.5 + aSeed.x * 6.0 + bT * .7)), 6.0);
#endif`;

function baitMaterial(uniforms) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .5, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>${BAIT_VERTEX_HEAD}`)
      .replace('#include <beginnormal_vertex>', BAIT_VERTEX_NORMAL).replace('#include <begin_vertex>', BAIT_VERTEX_BODY);
  };
  material.customProgramCacheKey = () => 'living-world-bait-v1';
  return stylize(material, { toon: .25, rim: .5, caustics: .5 });
}

const PARTICLE_VERTEX = /* glsl */ `
attribute vec4 aMove; attribute vec4 aKind;
uniform float uTime; uniform float uPx; uniform float uNight; uniform float uHaze; uniform float uStir;
uniform vec3 uPlayer; uniform vec4 uLamp; uniform vec3 uLampDir; uniform vec4 uTrail[8]; uniform vec4 uBloom; uniform vec3 uCurrent;
varying vec4 vCol; varying vec3 vShape;
void main() {
  // aKind: x kind, y size in metres, z life in seconds, w seed. aMove: xyz velocity, w birth (or a switch).
  float kind = aKind.x, seed = aKind.w, life = max(aKind.z, .001), age = uTime - aMove.w, u = age / life;
  vec3 p = position, col = vec3(1.0);
  float size = aKind.y, alpha = 0.0, add = 0.0, shape = 0.0, spin = 0.0, minPx = 1.0, maxPx = 64.0;
  bool live = u >= 0.0 && u < 1.0;
  if (kind < .5) {
  } else if (kind < 1.5) {
    // Vent: a looping stream of bubbles that wander wider as they rise.
    u = fract(uTime / life + seed);
    p.y += aMove.y * life * u; p.x += sin(u * 21.0 + seed * 40.0) * (.04 + .24 * u); p.z += cos(u * 17.0 + seed * 31.0) * (.04 + .24 * u);
    size *= .6 + u; col = vec3(.78, .95, 1.0); shape = 1.0; minPx = 1.5; maxPx = 14.0;
    alpha = p.y > -.3 ? 0.0 : .62 * smoothstep(0.0, .05, u) * (1.0 - smoothstep(.82, 1.0, u));
  } else if (kind < 2.5) {
    if (live) { p += aMove.xyz * (1.0 - exp(-age * 2.4)) / 2.4; p.y -= .03 * age * age; size *= .3 + 1.3 * sqrt(u); col = vec3(.66, .58, .42); alpha = .42 * pow(1.0 - u, 1.4) * smoothstep(0.0, .06, u); maxPx = 90.0; }
  } else if (kind < 3.5) {
    if (live) { p += aMove.xyz * (1.0 - exp(-age * 1.6)) / 1.6; p.y += .05 * age; size *= .35 + 1.8 * sqrt(u); col = vec3(.012, .01, .02); alpha = .82 * pow(1.0 - u, 1.2) * smoothstep(0.0, .03, u); maxPx = 120.0; }
  } else if (kind < 4.5) {
    // Eyeshine answers the dive lamp only.
    if (aMove.w > .5) {
      vec3 to = p - uLamp.xyz; float d = max(length(to), .01);
      alpha = smoothstep(.87, .95, dot(to / d, uLampDir)) * (1.0 - smoothstep(13.0, 20.0, d)) * uLamp.w * (.75 + .25 * sin(uTime * 5.0 + seed * 60.0));
      col = mix(vec3(1.0, .5, .25), vec3(.6, 1.0, .7), step(.5, seed)); add = 1.0; minPx = 2.2; maxPx = 6.0;
    }
  } else if (kind < 5.5) {
    // Plankton lives in a box that follows the diver and lights where they have just been.
    vec3 box = vec3(10.0, 6.0, 10.0);
    p = uPlayer + mod(p - uPlayer + box * .5, box) - box * .5;
    p += vec3(sin(uTime * .31 + seed * 30.0), sin(uTime * .23 + seed * 17.0), cos(uTime * .27 + seed * 23.0)) * .25;
    float g = 0.0;
    for (int i = 0; i < 8; i++) { float past = uTime - uTrail[i].w; g += (1.0 - smoothstep(0.0, 1.8, distance(p, uTrail[i].xyz))) * exp(-past * .85) * step(0.0, past); }
    // ...and where they are pushing through it now.
    g += (1.0 - smoothstep(.3, 2.0, distance(p, uPlayer))) * uStir;
    float since = uTime - uBloom.w;
    g += (1.0 - smoothstep(0.0, 2.6, abs(distance(p, uBloom.xyz) - since * 6.5))) * exp(-since * .3) * step(0.0, since) * 1.6;
    g += .12 * pow(max(0.0, sin(uTime * (.5 + seed) + seed * 90.0)), 24.0);
    // Below the sunlit layer, occasional living sparks remain visible by day.
    float deepGlow = smoothstep(22.0, 55.0, -p.y);
    g += deepGlow * (.045 + .16 * pow(max(0.0, sin(uTime * .65 + seed * 90.0)), 12.0));
    alpha = min(g, 1.0) * max(uNight, deepGlow * .75) * (.8 + .2 * sin(uTime * 2.0 + seed * 50.0));
    col = mix(vec3(.3, 1.0, .85), vec3(.45, .8, 1.0), fract(seed * 7.0)); add = 1.0; minPx = 1.6; maxPx = 7.0;
    if (p.y > -.4) alpha = 0.0;
  } else if (kind < 6.5) {
    // Leaf and weed fragments ride the current a few metres, then fade and start again.
    u = fract(uTime / life + seed);
    p += uCurrent * ((u - .5) * life); p.y += sin(u * 19.0 + seed * 12.0) * .25; p.x += sin(u * 11.0 + seed * 7.0) * .4;
    alpha = .9 * sin(u * 3.14159);
    col = seed < .33 ? vec3(.23, .32, .09) : seed < .66 ? vec3(.3, .2, .08) : vec3(.36, .1, .12);
    shape = 2.0; spin = uTime * (.4 + seed) + seed * 20.0; minPx = 1.5; maxPx = 22.0;
  } else if (kind < 7.5 || kind > 9.5) {
    // Spray, and (kind 10) fry skittering clear of the water.
    if (live) {
      p += aMove.xyz * age; p.y -= 4.9 * age * age;
      col = kind > 9.5 ? vec3(.8, .9, .95) : mix(vec3(.92, .97, 1.0), vec3(.35, 1.0, .9), uNight * .8);
      add = kind > 9.5 ? 0.0 : uNight * .8; alpha = p.y > -.12 ? (1.0 - u * u) * .9 : 0.0; minPx = 1.5; maxPx = 10.0;
    }
  } else if (kind < 8.5) {
    if (live) { p += aMove.xyz * (1.0 - exp(-age * 1.3)) / 1.3 + uCurrent * age; size *= .5 + 2.2 * sqrt(u); col = vec3(.9, .95, 1.0) * (.3 + .7 * (1.0 - uNight)); alpha = .34 * (1.0 - u) * smoothstep(0.0, .1, u); maxPx = 110.0; }
  } else {
    if (live) { p += aMove.xyz * age; p.x += sin(age * 6.0 + seed * 40.0) * .1; p.z += cos(age * 5.0 + seed * 31.0) * .1; col = vec3(.78, .95, 1.0); shape = 1.0; minPx = 1.5; maxPx = 18.0; alpha = p.y > -.3 ? 0.0 : .65 * (1.0 - u * u * u); }
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(length(mv.xyz), .1);
  // An eye's glint sits on the eye, not inside it.
  if (kind > 3.5 && kind < 4.5) mv.xyz *= 1.0 - .04 / dist;
  alpha *= exp(-dist * uHaze);
  vCol = vec4(col, alpha); vShape = vec3(shape, add, spin);
  gl_PointSize = clamp(size * uPx / dist, minPx, maxPx);
  gl_Position = alpha < .004 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
}`;

// One blend state serves both kinds of particle: colour arrives premultiplied, and alpha 0 leaves it added.
const PARTICLE_FRAGMENT = /* glsl */ `
varying vec4 vCol; varying vec3 vShape;
void main() {
  vec2 c = gl_PointCoord - .5; float a;
  if (vShape.x > 1.5) { float s = sin(vShape.z), k = cos(vShape.z); c = vec2(c.x * k - c.y * s, c.x * s + c.y * k) * vec2(1.0, 2.8); a = 1.0 - smoothstep(.3, .5, length(c)); }
  else if (vShape.x > .5) { float r = length(c) * 2.0; a = smoothstep(.5, .85, r) * (1.0 - smoothstep(.85, 1.0, r)) + (1.0 - smoothstep(0.0, .2, length(c + vec2(.16, .16)))) * .7; }
  else a = 1.0 - smoothstep(.15, 1.0, length(c) * 2.0);
  a *= vCol.a;
  if (a < .003) discard;
  gl_FragColor = vec4(vCol.rgb * a, a * (1.0 - vShape.y));
}`;

/**
 * A pool of points. The first `fixed` entries are looping or persistent and written once; the rest is a ring
 * for one-shot bursts. Nothing is uploaded unless something was written.
 */
export function createParticles({ count, fixed = 0, haze = .03, name = 'Living world particles', shared }) {
  const position = new Float32Array(count * 3), move = new Float32Array(count * 4), kind = new Float32Array(count * 4);
  const geometry = new THREE.BufferGeometry();
  const aPosition = new THREE.BufferAttribute(position, 3), aMove = new THREE.BufferAttribute(move, 4), aKind = new THREE.BufferAttribute(kind, 4);
  for (const attribute of [aPosition, aMove, aKind]) attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', aPosition); geometry.setAttribute('aMove', aMove); geometry.setAttribute('aKind', aKind);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -30, -35), 400);
  const uniforms = {
    uTime: shared.uLifeTime, uNight: shared.uLifeNight, uPx: { value: 600 }, uHaze: { value: haze }, uStir: { value: 0 },
    uPlayer: { value: new THREE.Vector3() }, uLamp: { value: new THREE.Vector4(0, 0, 0, 0) }, uLampDir: { value: new THREE.Vector3(0, 0, -1) },
    uTrail: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 9999, 0, -1e6)) }, uBloom: { value: new THREE.Vector4(0, 9999, 0, -1e6) }, uCurrent: { value: new THREE.Vector3(.22, 0, .1) }
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_FRAGMENT, transparent: true, depthWrite: false, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  const points = new THREE.Points(geometry, material); points.name = name; points.frustumCulled = false; points.matrixAutoUpdate = false; points.renderOrder = 4;
  const size = new THREE.Vector2();
  // Point sizes are in device pixels: the scale is read from the frame being drawn.
  points.onBeforeRender = (renderer, scene, camera) => { renderer.getDrawingBufferSize(size); uniforms.uPx.value = .5 * size.y * camera.projectionMatrix.elements[5]; };
  let cursor = fixed, dirty = false, lastDeath = -1e9;
  function write(i, k, x, y, z, vx, vy, vz, w, s, life, seed) {
    position[i * 3] = x; position[i * 3 + 1] = y; position[i * 3 + 2] = z;
    move[i * 4] = vx; move[i * 4 + 1] = vy; move[i * 4 + 2] = vz; move[i * 4 + 3] = w;
    kind[i * 4] = k; kind[i * 4 + 1] = s; kind[i * 4 + 2] = life; kind[i * 4 + 3] = seed; dirty = true;
  }
  return {
    points, uniforms, count, fixed,
    /** Write a looping or persistent entry (index below `fixed`). */
    set: write,
    /** Switch a persistent entry on or off, optionally moving it. */
    toggle(i, on, x, y, z) { if (x !== undefined) { position[i * 3] = x; position[i * 3 + 1] = y; position[i * 3 + 2] = z; } move[i * 4 + 3] = on ? 1 : 0; dirty = true; },
    /** One-shot: born now, gone after `life` seconds. */
    emit(k, x, y, z, vx, vy, vz, s, life, seed) {
      write(cursor, k, x, y, z, vx, vy, vz, shared.uLifeTime.value, s, life, seed);
      cursor = cursor + 1 >= count ? fixed : cursor + 1; lastDeath = Math.max(lastDeath, shared.uLifeTime.value + life);
    },
    /** True while any one-shot is still alive. */
    get busy() { return shared.uLifeTime.value < lastDeath; },
    flush() { if (dirty) { aPosition.needsUpdate = aMove.needsUpdate = aKind.needsUpdate = true; dirty = false; } }
  };
}

const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0), WHITE = new THREE.Color(1, 1, 1);

/**
 * One draw call of creatures. Vertex buffers are shared with every other mesh of the same species; the
 * per-instance state (aLife, aTint) belongs to this one. Instances start hidden (zero scale).
 */
function lifeMesh(base, material, count, name) {
  const geometry = new THREE.BufferGeometry();
  for (const key of ['position', 'normal', 'color', 'aRig']) geometry.setAttribute(key, base.getAttribute(key));
  geometry.setIndex(base.index); geometry.boundingSphere = base.boundingSphere.clone();
  const life = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4), tint = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  life.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aLife', life); geometry.setAttribute('aTint', tint);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name; mesh.matrixAutoUpdate = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < count; i++) { mesh.setMatrixAt(i, ZERO_MATRIX); mesh.setColorAt(i, WHITE); life.array[i * 4 + 3] = 99; }
  mesh.userData.triangles = base.index.count / 3;
  return mesh;
}

export function createKit() {
  const shared = { uLifeTime: { value: 0 }, uLifeNight: { value: 0 } };
  const geometries = {
    fish: fishGeometry(), tube: tubeGeometry(5, [0, .2, .4, .58, .72, .84, .93, .985], [.028, .03, .03, .031, .033, .037, .034, .02]),
    tendril: tubeGeometry(4, [0, .25, .5, .72, .88, .985], [.03, .03, .03, .033, .037, .02]), moray: morayGeometry(), octopus: octopusGeometry(), ray: rayGeometry(), crab: crabGeometry(),
    seahorse: seahorseGeometry(), dolphin: dolphinGeometry(), flyer: flyingFishGeometry(), turtle: turtleGeometry(), whale: whaleTailGeometry(), bait: baitGeometry()
  };
  return {
    shared, geometries, lifeMesh, baitMaterial, ZERO_MATRIX,
    life: lifeMaterial(shared),
    // Surface animals are seen from above (scene fog) and from below (the look's haze).
    surface: lifeMaterial(shared, { fog: true, look: { caustics: .3 } })
  };
}
