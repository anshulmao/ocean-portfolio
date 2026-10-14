import * as THREE from './vendor/three.module.min.js';

// The workshop every animal in the creature set is made in. A species is a page of numbers (creature-species.js):
// cross-sections along its length, fin outlines, a painter and a skeleton. This file turns one into a faceted,
// skinned mesh with a painted skin and looping swim clips. One unit is one metre, +Y up, nose to +Z. Nothing here
// touches the page, so the same code builds the animals in the browser and exports them as GLB from Node.
//
// Shapes are written in fractions of the animal's total length and scaled once at the end. A point on the body is
// (t, a): t runs 0 at the nose to 1 at the tip of the tail, a is the angle round the body from the dorsal midline
// toward the animal's left (+X).
//
// The skin is a small texture painted from the species' painter, texel by texel, in the same (t, a) terms: so a
// marking keeps its own outline (a round spot, a curved eye patch, a soft countershading line) whatever the facets
// under it, and every animal is coloured the same way.

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const { clamp, lerp, smoothstep } = THREE.MathUtils;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Polygon budget against the first version of the set: about half as many faces again (girth and length each 1.22x).
const DETAIL = 1.22;

const tones = new Map();
/** A shared colour for a hex string. */
export const tone = hex => { let c = tones.get(hex); if (!c) tones.set(hex, c = new THREE.Color(hex)); return c; };
const asColor = value => value?.isColor ? value : tone(value || '#888888');
// Painters return colours from a small ring of scratch colours: each is read at once, so they never collide.
const pool = Array.from({ length: 64 }, () => new THREE.Color()); let poolAt = 0;
/** a blended toward b by k (0..1); either may be a hex string or a colour. */
export const blend = (a, b, k) => pool[poolAt = (poolAt + 1) & 63].copy(asColor(a)).lerp(asColor(b), clamp(k, 0, 1));
/** A colour made brighter or darker by a factor. */
export const shadeBy = (a, f) => pool[poolAt = (poolAt + 1) & 63].copy(asColor(a)).multiplyScalar(f);

export function seeded(seed = 1) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// Smooth value noise, for the mottling that keeps a large flank from reading as flat paint.
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
export function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), ux), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux), uy);
}

// --- Body ---------------------------------------------------------------------------------------------------------
// stations: [t, half width, height above the centreline, depth below it, centreline height]. Between stations the
// outline follows a Hermite curve held back so it never bulges past the numbers given.
function sampler(stations) {
  const rows = stations.map(s => [s[0], s[1], s[2], s[3] ?? s[2], s[4] ?? 0]).sort((a, b) => a[0] - b[0]);
  return t => {
    t = clamp(t, rows[0][0], rows[rows.length - 1][0]);
    let i = 0; while (i < rows.length - 2 && t > rows[i + 1][0]) i++;
    const a = rows[i], b = rows[i + 1], p = rows[Math.max(i - 1, 0)], q = rows[Math.min(i + 2, rows.length - 1)];
    const span = b[0] - a[0], s = span > 0 ? (t - a[0]) / span : 0, out = [t, 0, 0, 0, 0];
    const s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    for (let k = 1; k < 5; k++) {
      const d = span > 0 ? (b[k] - a[k]) / span : 0;
      let m0 = i > 0 ? (b[k] - p[k]) / (b[0] - p[0]) : d, m1 = i < rows.length - 2 ? (q[k] - a[k]) / (q[0] - a[0]) : d;
      if (d === 0) m0 = m1 = 0;
      else { m0 = m0 / d < 0 ? 0 : Math.sign(d) * Math.min(Math.abs(m0), 3 * Math.abs(d)); m1 = m1 / d < 0 ? 0 : Math.sign(d) * Math.min(Math.abs(m1), 3 * Math.abs(d)); }
      out[k] = h00 * a[k] + h10 * span * m0 + h01 * b[k] + h11 * span * m1;
      if (k < 4) out[k] = Math.max(0, out[k]);
    }
    return out;
  };
}

function ringTimes(body, lod) {
  let ts = [...new Set(body.stations.map(s => s[0]))].sort((a, b) => a - b);
  if (lod) {
    // A lighter body keeps its ends and thins the rings between them.
    const keep = lod > 1 ? 5 : body.lodRings || Math.max(5, Math.ceil(ts.length * .55)), out = [];
    for (let i = 0; i < keep; i++) out.push(ts[Math.round(i * (ts.length - 1) / (keep - 1))]);
    return [...new Set(out)];
  }
  const gap = (body.maxGap ?? .1) / DETAIL, out = [ts[0]];
  for (let i = 1; i < ts.length; i++) {
    const n = Math.ceil((ts[i] - ts[i - 1]) / gap - 1e-6);
    for (let k = 1; k <= n; k++) out.push(lerp(ts[i - 1], ts[i], k / n));
  }
  return out;
}

function loft(body, lod) {
  const profile = sampler(body.stations), ts = ringTimes(body, lod), base = body.K ?? 10;
  const K = lod > 1 ? 4 : lod ? Math.max(4, body.lodK ?? Math.round(base * .6 / 2) * 2) : Math.max(base + 2, Math.round(base * DETAIL / 2) * 2);
  const ex = body.ex ?? 1, ey = body.ey ?? 1, pow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const at = (s, a, t) => {
    if (body.shape) { const [x, y] = body.shape(a, s, t); return V(x, s[4] + y, .5 - t); }
    const sx = Math.sin(a), cy = Math.cos(a);
    return V(pow(sx, ex) * s[1], s[4] + pow(cy, ey) * (cy >= 0 ? s[2] : s[3]), .5 - t);
  };
  const point = (t, a) => at(profile(t), a, t);
  const rings = ts.map(t => { const s = profile(t); return Array.from({ length: K }, (_, j) => at(s, j / K * TAU, t)); });
  const t0 = ts[0], t1 = ts[ts.length - 1];
  return { profile, ts, K, rings, point, at, t0, t1, center: t => { const s = profile(t); return V(0, s[4], .5 - t); } };
}

// --- Geometry sink --------------------------------------------------------------------------------------------------
// Every face is its own three vertices: the facets are the low-poly look. Each vertex carries the place in the skin
// texture it shows, and a note on how it is to be skinned.
function sink() {
  const verts = [], uvs = [], skins = [];
  const ab = V(), ac = V(), n = V();
  return {
    verts, uvs, skins,
    /** out: a direction the face should look along; the winding is turned to agree with it. */
    tri(a, b, c, ua, ub, uc, out, sa, sb, sc) {
      n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
      if (n.lengthSq() < 1e-14) return;
      if (out && n.dot(out) < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; [sb, sc] = [sc, sb]; }
      verts.push(a, b, c); uvs.push(ua, ub, uc); skins.push(sa, sb, sc);
    }
  };
}
const skinOf = (chain, extra) => ({ chain, at: null, bone: null, f: 0, ...extra });

// --- The skin texture -----------------------------------------------------------------------------------------------
// One texture per species, laid out in bands: the body (t across, the angle round it up), a ray's tail, a slot for
// each fin (each face of a paired fin that looks up or down gets its own), flat caps, and a row of plain swatches
// for the eyes and small solids. Slots are inset by a few texels so mipmaps do not bleed between them.
function layout(spec, size) {
  const [W, H] = size, slots = new Map(), swatches = new Map(), PAD = 3;
  const finKeys = [];
  for (const fin of spec.fins || []) for (const key of fin.mirror || fin.plane !== 'side' ? [`${fin.name}|U`, `${fin.name}|D`] : [`${fin.name}|U`]) if (!finKeys.includes(key)) finKeys.push(key);
  for (const cap of ['front', 'back']) finKeys.push(`cap|${cap}`);
  const bodyTop = spec.tail ? .6 : .66, tailTop = spec.tail ? .68 : bodyTop, finTop = .95;
  const rect = (x0, y0, x1, y1) => ({ x0: Math.round(x0 * W) + PAD, y0: Math.round(y0 * H) + PAD, x1: Math.round(x1 * W) - PAD, y1: Math.round(y1 * H) - PAD });
  const regions = { body: rect(0, 0, 1, bodyTop), tail: spec.tail ? rect(0, bodyTop, 1, tailTop) : null };
  // Fins share two rows of slots.
  const perRow = Math.ceil(finKeys.length / 2);
  finKeys.forEach((key, i) => { const row = Math.floor(i / perRow), col = i % perRow, h = (finTop - tailTop) / 2; slots.set(key, rect(col / perRow, tailTop + row * h, (col + 1) / perRow, tailTop + (row + 1) * h)); });
  const swatchRow = rect(0, finTop, 1, 1);
  return { W, H, regions, slots, swatches, swatchRow, PAD };
}
const uvIn = (r, W, H, x, y) => [(r.x0 + clamp(x, 0, 1) * (r.x1 - r.x0)) / W, (r.y0 + clamp(y, 0, 1) * (r.y1 - r.y0)) / H];
function swatch(lay, colour) {
  const key = asColor(colour).getHexString();
  if (!lay.swatches.has(key)) lay.swatches.set(key, { index: lay.swatches.size, colour: asColor(colour).clone() });
  const s = lay.swatches.get(key), r = lay.swatchRow, cell = 10;   // a cell is ten texels wide, its middle is sampled
  return [(r.x0 + s.index * cell + cell / 2) / lay.W, (r.y0 + r.y1) / 2 / lay.H];
}

function paintSkin(spec, lay, body, tail, fins) {
  const { W, H } = lay, data = new Uint8Array(W * H * 4), rgb = {}, paint = spec.paint, p = V();
  const put = (x, y, colour) => { asColor(colour).getRGB(rgb, THREE.SRGBColorSpace); const o = (y * W + x) * 4; data[o] = rgb.r * 255 + .5; data[o + 1] = rgb.g * 255 + .5; data[o + 2] = rgb.b * 255 + .5; data[o + 3] = 255; };
  // A painted band reaches past its slot by the inset, so filtering at the edge picks up the same colour.
  const fill = (r, shade) => {
    for (let y = Math.max(0, r.y0 - lay.PAD); y < Math.min(H, r.y1 + lay.PAD); y++) for (let x = Math.max(0, r.x0 - lay.PAD); x < Math.min(W, r.x1 + lay.PAD); x++)
      put(x, y, shade(clamp((x + .5 - r.x0) / (r.x1 - r.x0), 0, 1), clamp((y + .5 - r.y0) / (r.y1 - r.y0), 0, 1)));
  };
  const surface = (loftOf, part) => (u, v) => {
    const t = lerp(loftOf.t0, loftOf.t1, u), a = v * TAU, s = loftOf.profile(t);
    p.copy(loftOf.at(s, a, t));
    return paint({ part, t, a, h: Math.cos(a), lat: Math.sin(a), side: Math.sin(a) >= 0 ? 1 : -1, p, w: s[1], up: s[2], down: s[3], y: s[4], L: spec.length });
  };
  fill(lay.regions.body, surface(body, spec.rig.kind === 'ray' ? 'disc' : 'spine'));
  if (tail) fill(lay.regions.tail, surface(tail, 'tail'));
  for (const [key, r] of lay.slots) {
    const [name, face] = key.split('|');
    if (name === 'cap') fill(r, (u, v) => paint({ part: spec.rig.kind === 'ray' ? 'disc' : 'spine', cap: face, lat: u * 2 - 1, h: v * 2 - 1, t: face === 'front' ? body.t0 : body.t1, a: 0, side: 1, p: V(), L: spec.length }));
    else { const fin = fins.get(name); fill(r, (u, v) => (fin?.paint || paint)({ part: 'fin', name, u, s: v, up: face === 'U' ? 1 : -1, side: 1, h: 0, t: fin?.root?.[0] ?? .5, L: spec.length })); }
  }
  // Spots are painted last, each a soft-edged disc measured on the skin itself, so they stay round on any body.
  if (spec.spots) {
    const r = lay.regions.body, list = spec.spots(seeded(spec.seed ?? 7)), centre = V(), here = V(), texel = 1 / (r.x1 - r.x0) * (body.t1 - body.t0);
    for (const spot of list) for (const side of spot.mirror === false ? [1] : [1, -1]) {
      const a0 = (spot.a * DEG * side + TAU) % TAU, s0 = body.profile(spot.t), girth = Math.max(s0[1], (s0[2] + s0[3]) / 2, 1e-3);
      centre.copy(body.at(s0, a0, spot.t));
      const reachT = spot.r * (spot.long ?? 1) * 1.6, reachA = spot.r * 1.6 / girth;
      const x0 = Math.floor((spot.t - reachT - body.t0) / (body.t1 - body.t0) * (r.x1 - r.x0) + r.x0), x1 = Math.ceil((spot.t + reachT - body.t0) / (body.t1 - body.t0) * (r.x1 - r.x0) + r.x0);
      const ya = (a0 - reachA) / TAU, yb = (a0 + reachA) / TAU, y0 = Math.floor(ya * (r.y1 - r.y0) + r.y0), y1 = Math.ceil(yb * (r.y1 - r.y0) + r.y0);
      for (let y = y0; y <= y1; y++) for (let x = Math.max(r.x0 - lay.PAD, x0); x <= Math.min(r.x1 + lay.PAD - 1, x1); x++) {
        const t = lerp(body.t0, body.t1, (x + .5 - r.x0) / (r.x1 - r.x0)), a = ((y + .5 - r.y0) / (r.y1 - r.y0)) * TAU, s = body.profile(t);
        here.copy(body.at(s, a, t));
        const dx = (here.z - centre.z) / (spot.long ?? 1), d = Math.hypot(here.x - centre.x, here.y - centre.y, dx);
        const wobble = spot.rough ? 1 + spot.rough * (noise(t * 90 + spot.t * 7, a * 9) - .5) : 1;
        const k = 1 - smoothstep(d / (spot.r * wobble), 1 - 1.5 * texel / spot.r, 1 + 1.5 * texel / spot.r);
        if (k <= 0) continue;
        if (x < 0 || x >= W) continue;
        const wrapped = ((y - r.y0) % (r.y1 - r.y0) + (r.y1 - r.y0)) % (r.y1 - r.y0) + r.y0, o = (wrapped * W + x) * 4;
        const under = new THREE.Color().setRGB(data[o] / 255, data[o + 1] / 255, data[o + 2] / 255, THREE.SRGBColorSpace);
        put(x, wrapped, under.lerp(asColor(spot.color), k * (spot.opacity ?? 1)));
      }
    }
  }
  for (const s of lay.swatches.values()) { const r = lay.swatchRow; for (let y = r.y0 - lay.PAD; y < r.y1 + lay.PAD; y++) for (let x = r.x0 + s.index * 10; x < r.x0 + s.index * 10 + 10; x++) put(x, y, s.colour); }
  const texture = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4; texture.name = `${spec.id} skin`; texture.needsUpdate = true;
  return texture;
}

function skinBody(out, body, spec, chain, lay, region) {
  const { rings, ts, K } = body, o = V(), mid = V(), skin = skinOf(chain), { W, H } = lay;
  const uvOf = (i, j) => uvIn(region, W, H, (ts[i] - body.t0) / (body.t1 - body.t0), j / K);
  // An end that does not close to a point is capped flat: a whale shark's mouth, a parrotfish's face.
  for (const [i, cap, dir] of [[0, 'front', 1], [rings.length - 1, 'back', -1]]) {
    const ring = rings[i], centre = ring.reduce((sum, q) => sum.add(q), V()).multiplyScalar(1 / K);
    if (ring[0].distanceToSquared(centre) < 1e-10) continue;
    const s = body.profile(ts[i]), slot = lay.slots.get(`cap|${cap}`);
    const capUv = q => uvIn(slot, W, H, (q.x / Math.max(s[1], 1e-4) + 1) / 2, ((q.y - s[4]) / Math.max(q.y >= s[4] ? s[2] : s[3], 1e-4) + 1) / 2);
    for (let j = 0; j < K; j++) { const a = ring[j], b = ring[(j + 1) % K]; out.tri(centre, a, b, capUv(centre), capUv(a), capUv(b), o.set(0, 0, dir), skin, skin, skin); }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < K; j++) {
    const j1 = (j + 1) % K, a = rings[i][j], b = rings[i][j1], c = rings[i + 1][j1], d = rings[i + 1][j];
    mid.copy(a).add(b).add(c).add(d).multiplyScalar(.25); o.copy(mid).sub(body.center((ts[i] + ts[i + 1]) / 2));
    // Texture coordinates run on past the seam (j + 1, not wrapped), so the last strip does not smear the whole band.
    const ua = uvOf(i, j), ub = uvOf(i, j + 1), uc = uvOf(i + 1, j + 1), ud = uvOf(i + 1, j);
    // The diagonal mirrors across the back so both flanks facet alike.
    if (j >= K / 2) { out.tri(a, b, d, ua, ub, ud, o, skin, skin, skin); out.tri(b, c, d, ub, uc, ud, o, skin, skin, skin); }
    else { out.tri(a, b, c, ua, ub, uc, o, skin, skin, skin); out.tri(a, c, d, ua, uc, ud, o, skin, skin, skin); }
  }
}

// --- Fins -----------------------------------------------------------------------------------------------------------
// A fin is an outline in its own plane: u runs along the chord toward the tail, v out along the span. It is given a
// little thickness toward its middle so it catches the light as a solid, and thins to an edge all round.
function finFrame(fin, body, side) {
  const frame = { origin: V(), chord: V(0, 0, -1), span: V(0, 1, 0) };
  if (fin.plane === 'side') {          // a median fin: dorsal, anal, caudal
    const t = fin.root[0], s = body.profile(t), down = fin.down ? -1 : 1;
    const y = fin.root[1] ?? s[4] + down * (down > 0 ? s[2] : s[3]) * (1 - (fin.embed ?? .25));
    frame.origin.set(0, y, .5 - t); frame.span.set(0, down, 0);
    if (fin.lean) { frame.chord.set(0, Math.sin(fin.lean * DEG) * down, -Math.cos(fin.lean * DEG)); frame.span.set(0, Math.cos(fin.lean * DEG) * down, Math.sin(fin.lean * DEG)); }
  } else {                               // one of a pair, given for the left side
    const [t, a, inset = .25] = fin.root, p = body.point(t, a * DEG), c = body.center(t);
    frame.origin.copy(p).lerp(c, inset);
    frame.span.fromArray(fin.span).normalize(); frame.chord.fromArray(fin.chord || [0, 0, -1]).normalize();
    // The chord is squared to the span so the outline is not sheared.
    frame.chord.addScaledVector(frame.span, -frame.chord.dot(frame.span)).normalize();
    if (side < 0) { frame.origin.x *= -1; frame.span.x *= -1; frame.chord.x *= -1; }
  }
  frame.normal = V().crossVectors(frame.chord, frame.span).normalize();
  return frame;
}

function addFin(out, fin, body, side, lod, lay) {
  const frame = finFrame(fin, body, side), outline = fin.outline, n = outline.length;
  const reach = Math.max(...outline.map(q => Math.abs(q[1]))) || 1, uMin = Math.min(...outline.map(q => q[0])), uMax = Math.max(...outline.map(q => q[0]));
  const place = (u, v, w = 0) => V().copy(frame.origin).addScaledVector(frame.chord, u).addScaledVector(frame.span, v).addScaledVector(frame.normal, w);
  const bone = fin.bone ? fin.bone + (fin.mirror ? (side > 0 ? '_L' : '_R') : '') : null;
  // A fin with a bone swings from its root; one without bends with whatever part of the body it stands on.
  const skin = (u, v) => bone ? skinOf(fin.chain || 'spine', { at: frame.origin, bone, f: smoothstep(Math.abs(v) / reach, fin.hinge ?? .02, fin.stiff ?? .3) }) : skinOf(fin.chain || 'spine');
  const uvAt = (u, v, face) => {
    const up = frame.normal.y * face, key = lay.slots.has(`${fin.name}|D`) && up < -.05 ? `${fin.name}|D` : `${fin.name}|U`;
    return uvIn(lay.slots.get(key), lay.W, lay.H, (u - uMin) / Math.max(uMax - uMin, 1e-6), Math.abs(v) / reach);
  };
  const rim = outline.map(([u, v]) => ({ p: place(u, v), s: skin(u, v), u, v }));
  const core = fin.core || [outline.reduce((sum, q) => sum + q[0], 0) / n, outline.reduce((sum, q) => sum + q[1], 0) / n];
  if (lod) {                             // far off, a fin is a sheet
    const centre = { p: place(core[0], core[1]), s: skin(core[0], core[1]), u: core[0], v: core[1] };
    for (const face of [1, -1]) for (let i = 0; i < n; i++) {
      const a = rim[i], b = rim[(i + 1) % n];
      out.tri(centre.p, a.p, b.p, uvAt(centre.u, centre.v, face), uvAt(a.u, a.v, face), uvAt(b.u, b.v, face), V().copy(frame.normal).multiplyScalar(face), centre.s, a.s, b.s);
    }
    return;
  }
  // A ring part-way in gives the fin a soft ridge; two rings on the larger fins, so they bend in a curve.
  const thick = fin.thick ?? .006, rings = (uMax - uMin) + reach > .12 ? [.36, .7] : [.5];
  for (const face of [1, -1]) {
    const facing = V().copy(frame.normal).multiplyScalar(face);
    const layers = [rim, ...rings.map(inset => outline.map(([u, v]) => { const iu = lerp(u, core[0], inset), iv = lerp(v, core[1], inset); return { p: place(iu, iv, face * thick * inset / rings[rings.length - 1] * (1 - .55 * Math.abs(iv) / reach)), s: skin(iu, iv), u: iu, v: iv }; }))];
    const hub = { p: place(core[0], core[1], face * thick * (1 - .55 * Math.abs(core[1]) / reach)), s: skin(core[0], core[1]), u: core[0], v: core[1] };
    for (let l = 0; l < layers.length - 1; l++) for (let i = 0; i < n; i++) {
      const a = layers[l][i], b = layers[l][(i + 1) % n], c = layers[l + 1][(i + 1) % n], d = layers[l + 1][i];
      out.tri(a.p, b.p, c.p, uvAt(a.u, a.v, face), uvAt(b.u, b.v, face), uvAt(c.u, c.v, face), facing, a.s, b.s, c.s);
      out.tri(a.p, c.p, d.p, uvAt(a.u, a.v, face), uvAt(c.u, c.v, face), uvAt(d.u, d.v, face), facing, a.s, c.s, d.s);
    }
    const inner = layers[layers.length - 1];
    for (let i = 0; i < n; i++) { const c = inner[(i + 1) % n], d = inner[i]; out.tri(hub.p, d.p, c.p, uvAt(hub.u, hub.v, face), uvAt(d.u, d.v, face), uvAt(c.u, c.v, face), facing, hub.s, d.s, c.s); }
  }
}

// --- Small solids: eyes, lumps, barbels ---------------------------------------------------------------------------
const ICO = new THREE.IcosahedronGeometry(1, 0), ICO1 = new THREE.IcosahedronGeometry(1, 1), OCT = new THREE.OctahedronGeometry(1, 0);
function addSolid(out, source, centre, scale, rotation, uv, skin) {
  const p = source.getAttribute('position'), q = rotation || new THREE.Quaternion(), v = [V(), V(), V()], o = V();
  for (let i = 0; i < p.count; i += 3) {
    for (let k = 0; k < 3; k++) v[k] = V().fromBufferAttribute(p, i + k).multiply(scale).applyQuaternion(q).add(centre);
    o.copy(v[0]).add(v[1]).add(v[2]).multiplyScalar(1 / 3).sub(centre);
    out.tri(v[0], v[1], v[2], uv, uv, uv, o, skin, skin, skin);
  }
}
// A frame standing on the body's skin at (t, a): outward, toward the tail, and round the girth.
function surfaceFrame(body, t, a) {
  const p = body.point(t, a), dt = body.point(Math.min(t + .01, 1), a).sub(body.point(Math.max(t - .01, 0), a)).normalize();
  const da = body.point(t, a + .05).sub(body.point(t, a - .05)).normalize(), n = V().crossVectors(da, dt).normalize();
  if (n.dot(V().copy(p).sub(body.center(t))) < 0) n.negate();
  return { p, n, along: dt, around: da };
}

function addExtras(out, spec, body, lod, lay) {
  const sides = item => item.mirror === false ? [1] : [1, -1];
  for (const eye of spec.eyes && lod < 2 ? [].concat(spec.eyes) : []) for (const side of sides(eye)) {
    const [t, a] = eye.at, f = surfaceFrame(body, t, a * DEG * side), r = eye.r, skin = skinOf(eye.chain || 'spine');
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), f.n);
    if (eye.ring && !lod) addSolid(out, OCT, V().copy(f.p).addScaledVector(f.n, -r * .5), V(r * 1.55, r * .62, r * 1.55), q, swatch(lay, eye.ring), skin);
    addSolid(out, lod ? OCT : ICO1, V().copy(f.p).addScaledVector(f.n, -r * .35), V(r, r * .75, r), q, swatch(lay, eye.color || '#0d1418'), skin);
    if (eye.glint !== false && !lod) addSolid(out, OCT, V().copy(f.p).addScaledVector(f.n, r * .3).addScaledVector(f.along, -r * .3).addScaledVector(V(0, 1, 0), r * .3), V(r * .26, r * .26, r * .26), q, swatch(lay, '#eef6f8'), skin);
  }
  for (const lump of spec.lumps || []) for (const side of sides(lump)) {
    if (lod && !lump.keep) continue;
    const [t, a] = lump.at, f = surfaceFrame(body, t, a * DEG * side), [sa, sn, st] = lump.size, skin = skinOf(lump.chain || 'spine');
    // The solid's own axes are laid round the girth, out from the skin, and along the body.
    const basis = new THREE.Matrix4().makeBasis(f.around, f.n, V().crossVectors(f.around, f.n)), q = new THREE.Quaternion().setFromRotationMatrix(basis);
    if (lump.turn) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...lump.turn.map(d => d * DEG))));
    addSolid(out, lump.sharp ? OCT : lod ? ICO : ICO1, V().copy(f.p).addScaledVector(f.n, (lump.lift ?? 0) * sn), V(sa, sn, st), q, swatch(lay, lump.color), skin);
  }
  // The inside of the mouth: dark, so a jaw that opens shows a throat rather than the far side of the head.
  if (spec.mouth && !lod) { const m = spec.mouth, c = body.center(m.t); c.y += m.drop ?? 0; addSolid(out, ICO, c, V(...m.size), null, swatch(lay, m.color || '#2a1717'), skinOf('spine')); }
}

// --- Skeletons ----------------------------------------------------------------------------------------------------
// A swimmer: root at the shoulders, a head, and a chain of joints down the back that the swim wave travels along.
// Each joint takes the body over from the one before it across a short ramp, so a bend is spread, not creased.
function ramps(joints, lead) {
  return joints.map((t, k) => { const before = k ? t - joints[k - 1] : lead, after = k < joints.length - 1 ? joints[k + 1] - t : before; return Math.min(before, after) * .5; });
}
function swimmerRig(spec, body) {
  const r = spec.rig, bones = [], index = new Map();
  const add = (name, parent, pos, extra = {}) => { index.set(name, bones.length); bones.push({ name, parent, pos, ...extra }); return bones.length - 1; };
  const rootT = r.root ?? .36;
  add('root', -1, body.center(rootT));
  const headT = r.head ?? null; if (headT != null) add('head', 0, body.center(headT));
  // A jaw hinges at the back of the mouth; everything below the mouth line in front of it rides on it.
  const jaw = r.jaw ? { ...r.jaw, id: add('jaw', index.get('head') ?? 0, body.center(r.jaw.hinge).add(V(0, r.jaw.line ?? 0, 0))) } : null;
  const joints = r.spine, half = ramps(joints, joints[0] - (headT ?? rootT - .1)), ids = [];
  joints.forEach((t, k) => ids.push(add(k === joints.length - 1 ? 'tail' : `spine_${k + 1}`, k ? ids[k - 1] : 0, body.center(t), { q: (k + 1) / joints.length })));
  const headHalf = headT != null ? Math.min(.06, (joints[0] - headT) * .45) : 0;
  const spine = p => {
    const t = .5 - p.z, w = new Map(), S = joints.map((jt, k) => smoothstep(t, jt - half[k], jt + half[k]));
    const H = headT != null ? 1 - smoothstep(t, headT - headHalf, headT + headHalf) : 0;
    for (let k = 0; k < joints.length; k++) { const v = S[k] - (S[k + 1] ?? 0); if (v > 1e-4) w.set(ids[k], v); }
    if (H > 1e-4) w.set(index.get('head'), H);
    const rest = 1 - S[0] - H; if (rest > 1e-4) w.set(0, rest);
    if (jaw) {
      const c = body.profile(clamp(t, body.t0, body.t1)), below = (c[4] + (jaw.line ?? 0)) - p.y, J = (1 - smoothstep(t, jaw.hinge - .012, jaw.hinge + .006)) * smoothstep(below, 0, (c[3] || .01) * .25);
      if (J > 1e-4) { for (const [id, v] of w) w.set(id, v * (1 - J)); w.set(jaw.id, (w.get(jaw.id) || 0) + J); }
    }
    return w;
  };
  return { kind: 'swimmer', bones, index, add, chains: { spine }, spineIds: ids, dominant: p => [...spine(p)].sort((a, b) => b[1] - a[1])[0][0] };
}

// A ray: three ribs a side fan out from the middle of the disc, two bones each, and a whip of a tail. A wave handed
// from the front rib to the back one is how a stingray swims; flapped together they are a manta's wings.
function rayRig(spec, body, tail) {
  const r = spec.rig, bones = [], index = new Map();
  const add = (name, parent, pos, extra = {}) => { index.set(name, bones.length); bones.push({ name, parent, pos, ...extra }); return bones.length - 1; };
  const centre = body.center(r.centre), W = r.halfSpan;
  add('root', -1, centre);
  const ribs = [];
  for (const side of [1, -1]) r.ribs.forEach((deg, m) => {
    const dir = V(Math.sin(deg * DEG) * side, 0, Math.cos(deg * DEG)), tag = `${['front', 'mid', 'back'][m] ?? m}_${side > 0 ? 'L' : 'R'}`;
    const axis = [-dir.z, 0, dir.x];   // a turn about it lifts the rib's tip
    const inner = add(`wing_${tag}_1`, 0, V().copy(centre).addScaledVector(dir, W * r.radii[0]), { axis, rib: m, side, ring: 0 });
    const outer = add(`wing_${tag}_2`, inner, V().copy(centre).addScaledVector(dir, W * r.radii[1]), { axis, rib: m, side, ring: 1 });
    ribs.push({ side, deg, inner, outer });
  });
  const tailIds = []; (r.tail || []).forEach((t, k) => tailIds.push(add(`tail_${k + 1}`, k ? tailIds[k - 1] : 0, tail.center(t), { q: (k + 1) / r.tail.length })));
  const h = W * (r.radii[1] - r.radii[0]) * .5;
  const disc = p => {
    const w = new Map(), dx = p.x, dz = p.z - centre.z, rad = Math.hypot(dx, dz), side = dx >= 0 ? 1 : -1;
    const phi = Math.atan2(Math.abs(dx), dz) / DEG, mine = ribs.filter(rib => rib.side === side);
    const Sin = smoothstep(rad, W * r.radii[0] - h, W * r.radii[0] + h), Sout = smoothstep(rad, W * r.radii[1] - h, W * r.radii[1] + h);
    // Near the midline the two sides share the body, so the disc does not tear down its spine.
    const lateral = smoothstep(Math.abs(dx), 0, W * r.radii[0] * .9);
    let total = 0;
    for (let m = 0; m < mine.length; m++) {
      const lo = m ? mine[m - 1].deg : -Infinity, hi = m < mine.length - 1 ? mine[m + 1].deg : Infinity, at = mine[m].deg;
      const g = phi <= at ? (lo === -Infinity ? 1 : clamp((phi - lo) / (at - lo), 0, 1)) : (hi === Infinity ? 1 : clamp((hi - phi) / (hi - at), 0, 1));
      const a = g * (Sin - Sout) * lateral, b = g * Sout * lateral;
      if (a > 1e-4) { w.set(mine[m].inner, a); total += a; } if (b > 1e-4) { w.set(mine[m].outer, b); total += b; }
    }
    if (1 - total > 1e-4) w.set(0, 1 - total);
    return w;
  };
  const joints = r.tail || [], half = ramps(joints, .08);
  const whip = p => {
    const t = .5 - p.z, w = new Map(), S = joints.map((jt, k) => smoothstep(t, jt - half[k], jt + half[k]));
    for (let k = 0; k < joints.length; k++) { const v = S[k] - (S[k + 1] ?? 0); if (v > 1e-4) w.set(tailIds[k], v); }
    const rest = 1 - (S[0] ?? 0); if (rest > 1e-4) w.set(0, rest);
    return w;
  };
  return { kind: 'ray', bones, index, add, chains: { spine: disc, disc, tail: whip }, ribs, tailIds, dominant: () => 0 };
}

// --- Clips --------------------------------------------------------------------------------------------------------
// A clip is a set of turns per bone, each a sine about an axis: amplitude, phase (in cycles, a later bone lags),
// an optional bias, and a skew that makes one half of the stroke quicker than the other. Sines close on themselves,
// so a looping clip has no seam. An action (loop: false) plays once: each turn then follows an envelope, a few
// [moment, strength] keys eased from one to the next, so it can wind up, strike and settle.
// The pseudo-bone 'spine' spreads a turn down the backbone the way a swim stroke is spread.
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _axis = V();
function envelope(keys, tau) {
  if (!keys) return 1;
  let i = 0; while (i < keys.length - 2 && tau > keys[i + 1][0]) i++;
  const [t0, v0] = keys[i], [t1, v1] = keys[i + 1], k = t1 > t0 ? clamp((tau - t0) / (t1 - t0), 0, 1) : 1;
  return v0 + (v1 - v0) * k * k * (3 - 2 * k);
}
const wave = (part, tau) => { const th = TAU * ((part.freq ?? 1) * tau - (part.phase ?? 0)), e = envelope(part.env, tau); return ((part.bias ?? 0) + part.amp * Math.sin(th + (part.skew ?? 0) * Math.sin(th))) * e; };
function spread(def, rig) {
  const bones = { ...(def.bones || {}) }, parts = bones.spine; delete bones.spine;
  if (!parts || !rig.spineIds) return bones;
  const m = MODES[def.mode || 'carangiform'], chain = rig.spineIds.map(id => rig.bones[id]), weights = chain.map(b => m.env(b.q)), total = weights.reduce((a, b) => a + b, 0);
  for (const part of [].concat(parts)) chain.forEach((bone, k) => (bones[bone.name] = [...(bones[bone.name] || [])]).push({ ...part, amp: (part.amp ?? 0) * weights[k] / total, bias: (part.bias ?? 0) * weights[k] / total, phase: (part.phase ?? 0) + (part.travel ?? m.waves) * bone.q }));
  return bones;
}
function makeClip(def, rig, L) {
  const loop = def.loop !== false, N = def.samples ?? (loop ? 32 : 60), times = new Float32Array(N + 1), tracks = [];
  for (let i = 0; i <= N; i++) times[i] = i / N * def.duration;
  for (const [name, parts] of Object.entries(spread(def, rig))) {
    if (!rig.index.has(name) || !parts.length) continue;
    const values = new Float32Array((N + 1) * 4);
    for (let i = 0; i <= N; i++) {
      const tau = loop && i === N ? 0 : i / N; _q.identity();
      for (const part of parts) _q.multiply(_q2.setFromAxisAngle(_axis.fromArray(part.axis).normalize(), wave(part, tau)));
      _q.toArray(values, i * 4);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values));
  }
  if (def.root) {
    const base = rig.bones[0].pos, values = new Float32Array((N + 1) * 3);
    for (let i = 0; i <= N; i++) {
      const tau = loop && i === N ? 0 : i / N;
      ['x', 'y', 'z'].forEach((key, k) => { const r = def.root[key]; values[i * 3 + k] = (base.getComponent(k) + (r ? (Array.isArray(r) ? wave({ amp: r[0], phase: r[1] ?? 0, freq: r[2] ?? 1 }, tau) : wave({ amp: 0, ...r }, tau)) : 0)) * L; });
    }
    tracks.push(new THREE.VectorKeyframeTrack('root.position', times, values));
  }
  const clip = new THREE.AnimationClip(def.name, def.duration, tracks); if (!loop) clip.userData = { once: true };
  return clip;
}
const push = (bones, name, part) => { (bones[name] ||= []).push(part); };
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

const STYLE = 1.2;
// How far down the body the swim wave reaches, and how many wavelengths lie along it.
const MODES = {
  thunniform: { env: q => q ** 3.4, waves: .45 },       // tuna: a stiff body driving a tail
  carangiform: { env: q => q ** 2.1, waves: .7 },       // jacks, requiem sharks, most reef fish
  subcarangiform: { env: q => q ** 1.4, waves: .9 },    // the back half and more
  anguilliform: { env: q => .3 + .7 * q, waves: 1.25 }  // the whole body, eel-like
};

/**
 * Side-to-side swimming (fish and sharks), or up-and-down with plane: 'pitch' (whales and dolphins).
 * amp is the swing the tail reaches, in radians, shared out along the spine by the mode's envelope.
 */
export function swimClip(rig, { name = 'swim', period = 1, amp: lifelike = .5, mode = 'carangiform', plane = 'yaw', recoil = 1, pectoral = 0, pectoralMode = 'trail', follow = .09, dorsal = 0, roll = .012, heave = .004, jaw = 0, jawRate = 1, samples, pose = {} } = {}) {
  // The set swims a little larger than life, so a stroke still reads across twenty metres of water.
  const amp = lifelike * STYLE, m = MODES[mode], axis = plane === 'pitch' ? X : Y, bones = {}, chain = rig.spineIds.map(id => rig.bones[id]);
  const weights = chain.map(b => m.env(b.q)), total = weights.reduce((a, b) => a + b, 0);
  chain.forEach((bone, k) => {
    // The last joint carries the tail fin or flukes, and trails the stroke: that lag is what makes it look wet.
    const last = k === chain.length - 1;
    push(bones, bone.name, { axis, amp: amp * weights[k] / total * (last ? 1.15 : 1), phase: m.waves * bone.q + (last ? follow : 0) });
  });
  // The front of the animal answers the tail: a small opposite turn of the head, and the shoulders slipping sideways.
  push(bones, 'head', { axis, amp: -amp * .07 * recoil, phase: -.04 });
  push(bones, 'root', { axis, amp: amp * .055 * recoil, phase: .22 });
  push(bones, 'root', { axis: Z, amp: roll * (plane === 'pitch' ? .5 : 1), phase: .1 });
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'L' : 'R';
    if (pectoral && pectoralMode === 'row') {            // wrasses and parrotfish row with both fins together
      push(bones, `pectoral_${tag}`, { axis: Z, amp: pectoral * side, phase: .0, skew: .5, bias: -pectoral * .35 * side });
      push(bones, `pectoral_${tag}`, { axis: Y, amp: pectoral * .45 * side, phase: .25 });
    } else if (pectoral) {                               // held out as planes, trailing the body's sway
      push(bones, `pectoral_${tag}`, { axis: Z, amp: pectoral * side, phase: .3 + (plane === 'pitch' ? 0 : side * .25) });
      push(bones, `pectoral_${tag}`, { axis: X, amp: pectoral * .5, phase: .45 });
    }
    if (pectoral) push(bones, `pelvic_${tag}`, { axis: Z, amp: pectoral * .4 * side, phase: .55 });
  }
  if (dorsal) push(bones, 'dorsal', { axis: plane === 'pitch' ? X : Z, amp: dorsal, phase: m.waves * .4 + .12 });
  // A jaw that breathes: open and shut once or twice a stroke, never quite closed.
  if (jaw) push(bones, 'jaw', { axis: X, amp: jaw * .5, bias: jaw * .5, phase: .1, freq: jawRate, skew: .3 });
  for (const [bone, parts] of Object.entries(pose)) for (const part of [].concat(parts)) push(bones, bone, { amp: 0, ...part });
  const root = plane === 'pitch' ? { y: [amp * .03, .3], z: [heave, .1, 2] } : { x: [amp * .016 * recoil, .28], y: [heave, .1, 2] };
  return { name, duration: period, bones, root, samples };
}

/** A ray's stroke. wave: how much of a cycle the back rib trails the front one (0 flaps like a manta). */
export function rayClip(rig, { name = 'swim', period = 2.4, amp = .34, wave: lag = .34, skew = .32, tail = .12, heave = .012, ripple = 0, turn = 0, pose = {} } = {}) {
  const bones = {};
  // turn: the wing on the outside of the turn strokes harder, and the disc banks into it.
  for (const bone of rig.bones) if (bone.axis) {
    const outer = bone.ring === 1, drive = 1 - turn * bone.side * .55;
    push(bones, bone.name, { axis: bone.axis, amp: amp * drive * (outer ? .62 : .38) * (1 + ripple * (outer ? 1 : -.6)), phase: bone.rib * lag + (outer ? .11 : 0), skew, bias: outer ? -amp * .12 : amp * .05 });
  }
  if (turn) { push(bones, 'root', { axis: Z, amp: 0, bias: -turn * .22 }); push(bones, 'root', { axis: Y, amp: 0, bias: turn * .1 }); rig.tailIds.forEach(id => push(bones, rig.bones[id].name, { axis: Y, amp: 0, bias: -turn * .12 })); }
  rig.tailIds.forEach(id => { const bone = rig.bones[id]; push(bones, bone.name, { axis: Y, amp: tail * bone.q, phase: .2 + bone.q * .6 }); push(bones, bone.name, { axis: X, amp: tail * .35 * bone.q, phase: .45 + bone.q * .4 }); });
  for (const [bone, parts] of Object.entries(pose)) for (const part of [].concat(parts)) push(bones, bone, { amp: 0, ...part });
  // The body rides its own stroke: up as the wings press down.
  return { name, duration: period, bones, root: { y: [heave, .32] } };
}

/**
 * Turning while swimming: the stroke goes on, the body holds a curve toward the turn and banks into it.
 * side: 1 turns left (toward +X), -1 right. Cetaceans turn the same way, by bending sideways.
 */
export function turnClip(rig, swim, side, { curve = .55, bank = .16 } = {}) {
  const def = { ...swim, name: `turn_${side > 0 ? 'left' : 'right'}`, bones: {} };
  for (const [key, parts] of Object.entries(swim.bones)) def.bones[key] = [...parts];
  def.bones.spine = [{ axis: Y, amp: 0, bias: side * curve, travel: 0 }];
  push(def.bones, 'head', { axis: Y, amp: 0, bias: side * curve * .18 });
  push(def.bones, 'root', { axis: Z, amp: 0, bias: -side * bank });
  // The inside fin drops to pivot on, the outside one stays out.
  push(def.bones, `pectoral_${side > 0 ? 'L' : 'R'}`, { axis: Z, amp: 0, bias: -side * .28 });
  return def;
}
/**
 * The escape start every fish has: a small wind-up the other way, the body snapped into a C, whipped back, then a
 * few hard strokes that die away to a glide, ending straight. Plays once. side: which way it bolts.
 */
export function burstClip(rig, { name = 'burst', duration = 1, side = 1, power = 1, plane = 'yaw', mode = 'carangiform', jaw = 0 } = {}) {
  const axis = plane === 'pitch' ? X : Y, s = plane === 'pitch' ? -1 : side, bones = {};
  bones.spine = [
    { axis, amp: 0, bias: s * 1.25 * power, travel: .1, env: [[0, 0], [.07, -.12], [.2, 1], [.34, -.65], [.48, .22], [.6, 0], [1, 0]] },
    { axis, amp: .55 * power, freq: 3.5, env: [[0, 0], [.36, 0], [.48, 1], [.82, .35], [1, 0]] }
  ];
  push(bones, 'head', { axis, amp: 0, bias: s * .3 * power, env: [[0, 0], [.07, -.1], [.2, 1], [.34, -.5], [.5, 0], [1, 0]] });
  push(bones, 'root', { axis: Z, amp: 0, bias: -side * .2, env: [[0, 0], [.25, 1], [.7, .3], [1, 0]] });
  for (const tag of ['L', 'R']) push(bones, `pectoral_${tag}`, { axis: Y, amp: 0, bias: (tag === 'L' ? 1 : -1) * .9, env: [[0, 0], [.12, 1], [.75, 1], [1, 0]] });
  if (jaw) push(bones, 'jaw', { axis: X, amp: 0, bias: jaw, env: [[0, 0], [.25, 0], [.4, 1], [.6, 1], [.8, 0], [1, 0]] });
  return { name, duration, loop: false, mode, bones, root: { [plane === 'pitch' ? 'y' : 'x']: { bias: .04 * side * power, env: [[0, 0], [.3, 1], [1, 0]] } } };
}
/** Any one-off action, written as turns with envelopes (see makeClip). */
export const actionClip = def => ({ loop: false, ...def });

// --- Assembly -----------------------------------------------------------------------------------------------------
const skins = new WeakMap();
/**
 * Build one species. Returns a template: shared geometry and material, the bone layout, the clips, and
 * instantiate(), which makes one animal of it (its own skeleton, the shared mesh data).
 * lod 1 is a lighter body with sheet fins, for animals drawn in numbers or far away; lod 2 is the least that still
 * reads as the species, for the smallest fish in a cloud. Every level shares the one painted skin.
 */
export function buildCreature(spec, { lod = 0, paint = true } = {}) {
  const L = spec.length, out = sink();
  const body = loft(spec.body, lod), tail = spec.tail ? loft(spec.tail, lod) : null;
  // The skin is laid out and painted once per species, from the full body, and shared by every level of detail.
  let skin = skins.get(spec);
  if (!skin) {
    const full = lod ? loft(spec.body, 0) : body, fullTail = spec.tail ? (lod ? loft(spec.tail, 0) : tail) : null;
    const size = spec.texture || (spec.realLength >= 1.5 ? [1024, 512] : [512, 256]), lay = layout(spec, size);
    const fins = new Map((spec.fins || []).map(fin => [fin.name, fin]));
    skin = { lay, full, fullTail, fins, texture: null };
    // Every plain colour the solids will ask for, whatever level of detail is built first.
    for (const item of [...[].concat(spec.eyes || []), ...(spec.lumps || []), ...(spec.mouth ? [spec.mouth] : [])]) for (const colour of [item.ring, item.color || (item.r ? '#0d1418' : '#2a1717')]) if (colour) swatch(lay, colour);
    swatch(lay, '#eef6f8');
    skins.set(spec, skin);
  }
  const lay = skin.lay;
  const rig = spec.rig.kind === 'ray' ? rayRig(spec, body, tail) : swimmerRig(spec, body);
  skinBody(out, body, spec, spec.rig.kind === 'ray' ? 'disc' : 'spine', lay, lay.regions.body);
  if (tail) skinBody(out, tail, spec, 'tail', lay, lay.regions.tail);
  for (const fin of spec.fins || []) for (const side of fin.mirror ? [1, -1] : [1]) {
    if (lod > 1 && fin.mirror && !fin.keep) continue;   // a speck in a shoal keeps only the fins that make its outline
    if (fin.bone) {
      const name = fin.bone + (fin.mirror ? (side > 0 ? '_L' : '_R') : '');
      if (!rig.index.has(name)) { const frame = finFrame(fin, body, side); rig.add(name, fin.parent ? rig.index.get(fin.parent) : rig.dominant(frame.origin), frame.origin.clone()); }
    }
    addFin(out, fin, fin.on === 'tail' && tail ? tail : body, side, lod, lay);
  }
  addExtras(out, spec, body, lod, lay);
  // Painted after every swatch the solids asked for is known.
  // paint: false builds the shape alone, for a page that takes its skin from the exported file.
  if (!skin.texture && paint) skin.texture = paintSkin(spec, lay, skin.full, skin.fullTail, skin.fins);

  const count = out.verts.length, position = new Float32Array(count * 3), normal = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4), n = V(), ab = V(), ac = V();
  for (let i = 0; i < count; i += 3) {
    n.crossVectors(ab.subVectors(out.verts[i + 1], out.verts[i]), ac.subVectors(out.verts[i + 2], out.verts[i])).normalize();
    for (let k = 0; k < 3; k++) {
      const p = out.verts[i + k], o = (i + k) * 3, s = out.skins[i + k];
      position[o] = p.x * L; position[o + 1] = p.y * L; position[o + 2] = p.z * L; n.toArray(normal, o); uv[(i + k) * 2] = out.uvs[i + k][0]; uv[(i + k) * 2 + 1] = out.uvs[i + k][1];
      const base = (rig.chains[s.chain] || rig.chains.spine)(s.at || p), list = [];
      for (const [id, w] of base) list.push([id, w * (1 - (s.bone ? s.f : 0))]);
      if (s.bone && s.f > 0) list.push([rig.index.get(s.bone), s.f]);
      list.sort((a, b) => b[1] - a[1]); list.length = Math.min(list.length, 4);
      const sum = list.reduce((acc, item) => acc + item[1], 0) || 1;
      list.forEach(([id, w], slot) => { skinIndex[(i + k) * 4 + slot] = id; skinWeight[(i + k) * 4 + slot] = w / sum; });
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();

  const helpers = { swim: options => swimClip(rig, options), ray: options => rayClip(rig, options), turn: (swim, side, options) => turnClip(rig, swim, side, options), burst: options => burstClip(rig, options), act: actionClip, rig };
  const clips = (spec.clips ? spec.clips(helpers) : []).map(def => makeClip(def, rig, L));
  const material = new THREE.MeshStandardMaterial({ name: `${spec.id} skin`, map: skin.texture, roughness: spec.roughness ?? .7, metalness: 0, flatShading: true });
  const size = geometry.boundingBox.getSize(V());

  function instantiate({ skinned = true } = {}) {
    const group = new THREE.Group(); group.name = spec.id;
    group.userData = { species: spec.id, name: spec.name, scientific: spec.scientific, lengthMetres: L, realLengthMetres: spec.realLength ?? L, forward: '+Z', up: '+Y', units: 'metres', rig: rig.kind === 'ray' ? 'disc ribs and tail whip' : 'spine chain, head and fins', license: 'Made for this project; no third-party assets' };
    if (!skinned) { const mesh = new THREE.Mesh(geometry, material); mesh.name = `${spec.id}_mesh`; group.add(mesh); return { object: group, mesh, bones: [] }; }
    const made = rig.bones.map(b => { const bone = new THREE.Bone(); bone.name = b.name; return bone; });
    rig.bones.forEach((b, i) => {
      const parent = b.parent >= 0 ? rig.bones[b.parent] : null;
      made[i].position.copy(b.pos).sub(parent ? parent.pos : V()).multiplyScalar(L);
      if (parent) made[b.parent].add(made[i]); else group.add(made[i]);
    });
    group.updateMatrixWorld(true);
    const mesh = new THREE.SkinnedMesh(geometry, material); mesh.name = `${spec.id}_mesh`;
    group.add(mesh); mesh.bind(new THREE.Skeleton(made), new THREE.Matrix4());
    // Bounds from the rest pose with room for the stroke, so nothing skins on the CPU to be culled.
    mesh.boundingSphere = geometry.boundingSphere.clone(); mesh.boundingSphere.radius *= 1.3; mesh.boundingBox = geometry.boundingBox.clone().expandByScalar(L * .12);
    return { object: group, mesh, bones: made };
  }
  return { id: spec.id, spec, lod, geometry, material, texture: skin.texture, rig, clips, size, length: L, triangles: count / 3, bones: rig.bones.length, instantiate };
}

/**
 * The mesh of a template frozen in a pose, without its skeleton: for animals drawn as instances, whose swimming is
 * done in the vertex shader. pose: { bone: { axis, bias } or a list of them }, as in a clip.
 */
export function posedGeometry(template, pose = {}) {
  const { object, mesh, bones } = template.instantiate();
  for (const [name, parts] of Object.entries(pose)) {
    const bone = bones.find(b => b.name === name); if (!bone) continue;
    _q.identity(); for (const part of [].concat(parts)) _q.multiply(_q2.setFromAxisAngle(_axis.fromArray(part.axis).normalize(), part.bias ?? 0));
    bone.quaternion.copy(_q);
  }
  object.updateMatrixWorld(true); mesh.skeleton.update();
  const geometry = template.geometry.clone(), p = geometry.getAttribute('position'), v = V();
  for (let i = 0; i < p.count; i++) { mesh.applyBoneTransform(i, v.fromBufferAttribute(p, i)); p.setXYZ(i, v.x, v.y, v.z); }
  geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight');
  // Faces keep their own normals: the three vertices of each are rebuilt from its new plane.
  const n = geometry.getAttribute('normal'), a = V(), b = V(), c = V();
  for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1).sub(a); c.fromBufferAttribute(p, i + 2).sub(a); b.cross(c).normalize(); for (let k = 0; k < 3; k++) n.setXYZ(i + k, b.x, b.y, b.z); }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); mesh.skeleton.dispose();
  return geometry;
}
