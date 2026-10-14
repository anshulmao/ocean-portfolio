import * as THREE from './vendor/three.module.min.js';
import { seededRandom, shareLater } from './assets.js';
import { stylize } from './ocean-look.js';

const TAU = Math.PI * 2, UP = new THREE.Vector3(0, 1, 0);
const { clamp, smoothstep } = THREE.MathUtils;
const C = hex => new THREE.Color(hex);

// Painters receive (out, worldPosition, worldNormal, localPosition).
const flat = hex => { const a = C(hex); return c => c.copy(a); };
const upLit = (dark, light) => { const a = C(dark), b = C(light); return (c, p, n) => c.copy(a).lerp(b, smoothstep(n.y, -.3, .9)); };
const ramp = (from, to, axis = 'y', start = 0, end = 1) => {
  const a = C(from), b = C(to); return (c, p, n, l) => c.copy(a).lerp(b, clamp((l[axis] - start) / (end - start), 0, 1));
};

const _t = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _l = new THREE.Vector3(), _c = new THREE.Color(), _m3 = new THREE.Matrix3();
const xf = (x, y, z, scale = 1, rotation = null) => new THREE.Matrix4().compose(_t.set(x, y, z),
  rotation?.isQuaternion ? rotation : rotation ? _q.setFromEuler(_e.set(...rotation)) : _q.identity(),
  typeof scale === 'number' ? _s.setScalar(scale) : _s.set(...scale));
const aim = direction => new THREE.Quaternion().setFromUnitVectors(UP, direction);
// Lean an upright piece toward a compass angle, then spin it about its own axis.
const lean = (angle, amount, spin = 0) => new THREE.Quaternion().setFromAxisAngle(_t.set(Math.sin(angle), 0, -Math.cos(angle)), amount)
  .multiply(_q.setFromAxisAngle(UP, spin));

// Each formation bakes into at most four buffers of its own (stone and coral,
// brain coral, swaying growth, lights), so a formation is a few draw calls
// while it is in view and none when it is not. Colour lives in vertices; sway
// weights ride along.
function bucket(count) {
  const position = [], normal = [], color = [], sway = [], uvs = [], index = [];
  return {
    get empty() { return !index.length; },
    add(geometry, matrix, paint, wave = null) {
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv'), base = position.length / 3;
      _m3.getNormalMatrix(matrix);
      for (let i = 0; i < p.count; i++) {
        _l.fromBufferAttribute(p, i); _p.copy(_l).applyMatrix4(matrix);
        _n.fromBufferAttribute(n, i).applyMatrix3(_m3).normalize();
        paint(_c, _p, _n, _l); uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
        position.push(_p.x, _p.y, _p.z); normal.push(_n.x, _n.y, _n.z); color.push(_c.r, _c.g, _c.b);
        if (wave) sway.push(wave.amp * Math.pow(clamp((_p.y - wave.base) / wave.height, 0, 1), wave.power ?? 1.5), wave.phase, wave.phase * 1.7);
        else sway.push(0, 0, 0);
      }
      const source = geometry.index, total = source ? source.count : p.count;
      for (let i = 0; i < total; i++) index.push(base + (source ? source.getX(i) : i));
      count(total / 3);
    },
    build(name, material, mapped = false) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
      geometry.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 3));
      if (mapped) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(position.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
      geometry.computeBoundingSphere(); geometry.boundingSphere.radius += 2;
      const mesh = shareLater(new THREE.Mesh(geometry, material)); mesh.name = name; return mesh;
    }
  };
}

// Average normals of coincident vertices so lathe seams and poles shade smoothly.
function weld(geometry) {
  geometry.computeVertexNormals();
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), sums = new Map();
  const key = i => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  for (let i = 0; i < p.count; i++) { const k = key(i), s = sums.get(k) || sums.set(k, new THREE.Vector3()).get(k); s.x += n.getX(i); s.y += n.getY(i); s.z += n.getZ(i); }
  for (let i = 0; i < p.count; i++) { const s = _t.copy(sums.get(key(i))).normalize(); n.setXYZ(i, s.x, s.y, s.z); }
  return geometry;
}

function craggy(detail, roughness = 1) {
  const geometry = new THREE.IcosahedronGeometry(1, detail), p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const bump = 1 + roughness * (.2 * Math.sin(x * 3.1 + y * 2.3) * Math.cos(z * 2.9 - y * 1.7) + .09 * Math.sin(z * 6.3 + x * 5.1) + .06 * Math.cos(y * 7.7 - x * 3.3));
    p.setXYZ(i, x * bump, y * bump, z * bump);
  }
  geometry.computeVertexNormals(); return geometry;
}

// A closed, lens-thin plate with a rippled lip: a table coral seen from any side.
function tableGeometry(sides) {
  const geometry = new THREE.LatheGeometry([[0, -.11], [.74, -.07], [.98, -.012], [1, .03], [.95, .062], [.55, .04], [0, .02]]
    .map(([r, y]) => new THREE.Vector2(r, y)), sides), p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x);
    const k = 1 + (.07 * Math.sin(a * 5 + .6) + .035 * Math.sin(a * 11)) * r;
    p.setXYZ(i, x * k, p.getY(i) + .05 * Math.sin(a * 3 + 1) * r * r, z * k);
  }
  return weld(geometry);
}

function pillarGeometry(sides) {
  const geometry = new THREE.LatheGeometry([[1, 0], [1.07, .1], [.9, .3], [.97, .52], [.84, .74], [.8, .9], [.56, .985], [0, 1.01]]
    .map(([r, y]) => new THREE.Vector2(r, y)), sides), p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + .07 * Math.sin(Math.atan2(z, x) * 3 + y * 9);
    p.setXYZ(i, x * k, y, z * k);
  }
  return weld(geometry);
}

// Zero crossings of a band-limited random wave field wander like the grooves
// of a brain coral; painting them costs no triangles and never aliases.
// A generator: it yields every few rows, so the page can paint it between frames (see heroFormationSteps).
function* brainTexture(size = 384) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const context = canvas.getContext('2d'), image = context.createImageData(size, size), random = seededRandom(77), waves = [];
  for (let i = 0; i < 9; i++) { const a = random() * TAU, k = 40 + random() * 9; waves.push([Math.cos(a) * k, Math.sin(a) * k, random() * TAU]); }
  // The pixels are written through one reference to the image's buffer (reading image.data anew for every byte made
  // this loop a fifth of a second), and the waves are read from a flat array; the sums are the same sums.
  const data = image.data, flat = new Float64Array(waves.flat()), count = flat.length;
  for (let y = 0; y < size; y++) {
    if (y % 12 === 0) yield;
    for (let x = 0; x < size; x++) {
      const u = x / size * 2 - 1, v = y / size * 2 - 1; let sum = 0;
      for (let w = 0; w < count; w += 3) sum += Math.cos(flat[w] * u + flat[w + 1] * v + flat[w + 2]);
      const value = Math.round(255 * (.4 + .6 * smoothstep(Math.abs(sum) / 2.1, .1, .62))), o = (y * size + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = value; data[o + 3] = 255;
    }
  }
  yield;
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}
// Lumpy dome whose UVs unroll from the crown, so the pattern has no pole pinch.
function brainGeometry(around, rings) {
  const reach = Math.PI * .56, geometry = new THREE.SphereGeometry(1, around, rings, 0, TAU, 0, reach), p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), polar = Math.acos(clamp(y, -1, 1)) / reach, turn = Math.atan2(z, x);
    uv.setXY(i, .5 + .5 * polar * Math.cos(turn), .5 + .5 * polar * Math.sin(turn));
    const k = 1 + .05 * Math.sin(3.1 * x + 1) * Math.cos(2.7 * z) + .03 * Math.sin(5 * y + 2 * x);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  return weld(geometry);
}

// Tube swept along path(t) -> [x, y, z]; closed rings, so there is no seam.
function tubeAlong(path, segments, sides, radius, taper) {
  const position = [], index = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, [x, y, z] = path(t), r = radius * (1 - (1 - taper) * t);
    for (let k = 0; k < sides; k++) { const a = k / sides * TAU; position.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r); }
  }
  for (let i = 0; i < segments; i++) for (let k = 0; k < sides; k++) {
    const a = i * sides + k, b = i * sides + (k + 1) % sides, c = a + sides, d = b + sides;
    index.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index); geometry.computeVertexNormals(); return geometry;
}
// Stipes are authored one unit tall with their wander in radius units.
const stipePath = t => [4.5 * Math.sin(t * 6.3) * (.3 + .7 * t), t, 4.5 * Math.sin(t * 4.7 + 1.3) * (.3 + .7 * t) - 1.3];

// A folded blade along +X that droops toward its tip; five triangles.
function leafGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -.03, 0, 0, .03, .3, .0, -.16, .3, .0, .16, .66, -.07, -.13, .66, -.07, .13, 1, -.24, 0,
    .3, -.035, 0, .66, -.1, 0
  ], 3));
  geometry.setIndex([0, 1, 7, 0, 7, 2, 1, 3, 7, 2, 7, 8, 2, 8, 4, 3, 8, 7, 3, 5, 8, 4, 8, 6, 5, 6, 8]);
  geometry.computeVertexNormals(); return geometry;
}

// Giant-clam valve: hinge on the X axis, five flutes, a scalloped lip.
const clamFlute = s => Math.cos(s * Math.PI * 4.5);
// The gape narrows to nothing at both ends, where the valves meet.
const clamSpan = s => Math.sqrt(Math.max(0, 1 - s ** 4));
const clamLip = s => ({ y: .62 * (1 - .45 * s ** 4) + .09 * clamFlute(s) * clamSpan(s), z: .015 + (.176 + .05 * clamFlute(s)) * clamSpan(s) });
function valveGeometry(across, up) {
  const position = [], shade = [], index = [];
  for (let j = 0; j <= up; j++) for (let i = 0; i <= across; i++) {
    const s = i / across * 2 - 1, v = j / up, flute = clamFlute(s);
    position.push(s * .5 * (.42 + .58 * Math.pow(Math.sin(v * Math.PI / 2), .7)),
      .62 * Math.sin(v * Math.PI / 2) * (1 - .45 * s ** 4) + .09 * flute * v * v * clamSpan(s),
      .015 + (.30 * Math.sin(v * Math.PI * .8) + .05 * flute * v) * clamSpan(s));
    shade.push((.74 + .26 * Math.sin(v * 21)) * (.6 + .4 * v) * (.86 + .14 * flute));
    if (i < across && j < up) { const a = j * (across + 1) + i, b = a + across + 1; index.push(a, a + 1, b, b, a + 1, b + 1); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index); geometry.computeVertexNormals();
  const tone = new THREE.Color(), cream = C('#efe4cf'), umber = C('#8f7f6c'), colors = [];
  for (const value of shade) { tone.copy(umber).lerp(cream, value); colors.push(tone.r, tone.g, tone.b); }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}
// The mantle fills the gape; its edges follow both scalloped lips at rest.
function mantleGeometry(along, across, restAngle) {
  const position = [], colors = [], index = [], tone = new THREE.Color();
  const deep = C('#2438c8'), edge = C('#2ff0d2'), spot = C('#ffe36b'), dark = C('#0d1340');
  for (let j = 0; j <= across; j++) for (let i = 0; i <= along; i++) {
    const s = i / along * 2 - 1, w = j / across * 2 - 1, lip = clamLip(s);
    const reach = (lip.z + lip.y * restAngle) * (1.05 + .05 * Math.sin(s * 31));
    position.push(s * .5, lip.y - lip.z * restAngle - .035 - .12 * (1 - w * w) + .014 * Math.sin(s * 23 + w * 5), w * reach);
    tone.copy(deep).lerp(edge, Math.pow(Math.abs(w), 2.2));
    if (Math.sin(s * 34 + 1) * Math.sin(w * 11 + s * 6) > .74) tone.lerp(spot, .6);
    for (const siphon of [-.34, .3]) tone.lerp(dark, 1 - smoothstep(Math.hypot((s - siphon) * 1.4, w * .55), .05, .16));
    colors.push(tone.r, tone.g, tone.b);
    if (i < along && j < across) { const a = j * (along + 1) + i, b = a + along + 1; index.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index); geometry.computeVertexNormals(); return geometry;
}

// Per-vertex sway: aSway = (reach in metres, phase, cross phase). The constant
// term leans everything slightly down-current.
function swayPatch(shader, time) {
  shader.uniforms.uHeroTime = time;
  shader.vertexShader = `uniform float uHeroTime;\nattribute vec3 aSway;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
float heroWave = uHeroTime * .6 + aSway.y + position.y * .32;
transformed.x += (sin(heroWave) + .35 * sin(heroWave * 2.3 + aSway.z) + .45) * aSway.x;
transformed.z += cos(heroWave * .77 + aSway.z) * aSway.x * .55;`);
}
const standard = options => new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .72, ...options });
// Emissive follows the vertex colour, so one material carries every glow hue.
function glowMaterial(time, sways) {
  const material = standard({ color: '#9aa3a3', roughness: .5, emissive: '#ffffff', emissiveIntensity: .6, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    if (sways) swayPatch(shader, time);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;');
  };
  material.customProgramCacheKey = () => `hero-glow-${sways ? 'sway' : 'still'}-v1`;
  return stylize(material, { toon: 0, rim: .2, caustics: 0 });
}

/**
 * Seven hand-composed reef landmarks placed between the portfolio sites.
 * Returns { root, update(elapsed, night, depth), counts, sites }.
 */
export function createHeroFormations(options) { const steps = heroFormationSteps(options); let step; while (!(step = steps.next()).done); return step.value; }
// The same build, pausing (yielding) between formations so the page can do it between frames.
export function* heroFormationSteps({ terrainHeightAt = () => -20, collisions = null, economy = false } = {}) {
  const root = new THREE.Group(); root.name = 'Hero reef formations';
  const R = seededRandom(9031), rr = (a, b) => a + R() * (b - a), pick = list => list[Math.floor(R() * list.length)];
  const floor = (x, z) => terrainHeightAt(x, z);
  const time = { value: 0 }, sites = [];
  let site = null;
  const count = triangles => { site.triangles += triangles; };
  // One set of buffers per formation. The faceted stone carries its face
  // normals in its vertices, so it shares the coral's buffer and material.
  let rocks, corals, brains, swayers, glows;
  const glowSway = glowMaterial(time, true);
  const swayMaterial = standard({ side: THREE.DoubleSide, roughness: .66 });
  swayMaterial.onBeforeCompile = shader => swayPatch(shader, time);
  swayMaterial.customProgramCacheKey = () => 'hero-sway-v1';
  yield;
  const coralMaterial = standard({ roughness: .7 }), brainMaterial = standard({ roughness: .74, map: yield* brainTexture(economy ? 256 : 384) });
  const culled = [];
  const cullable = (mesh, sphere = mesh.geometry.boundingSphere) => { culled.push({ mesh, sphere }); return mesh; };
  const finish = () => {
    if (!site) return;
    for (const [buffer, name, material, mapped] of [[corals, 'Hero formation stone and coral', coralMaterial], [brains, 'Hero formation brain coral', brainMaterial, true], [swayers, 'Hero formation kelp and soft coral', swayMaterial], [glows, 'Hero formation lights', glowSway]]) {
      if (!buffer.empty) root.add(cullable(buffer.build(`${name} · ${site.name}`, material, mapped)));
    }
  };
  const solid = (x0, y0, z0, x1, y1, z1) => collisions?.addBox?.(new THREE.Box3(
    new THREE.Vector3(Math.min(x0, x1), y0, Math.min(z0, z1)), new THREE.Vector3(Math.max(x0, x1), y1, Math.max(z0, z1))), { mesh: site.name, kind: 'prop' });
  const begin = (name, x, z, radius, height) => {
    finish();
    rocks = corals = bucket(count); brains = bucket(count); swayers = bucket(count); glows = bucket(count);
    site = { name, position: [x, floor(x, z), z], radius, height, triangles: 0 }; sites.push(site); return site.position[1];
  };

  yield;
  const rockLo = craggy(1), rockHi = craggy(economy ? 1 : 2, 1.25), plate = tableGeometry(economy ? 12 : 18);
  const stalk = new THREE.CylinderGeometry(.55, 1, 1, economy ? 5 : 6, 1, true).translate(0, .5, 0);
  const pillar = pillarGeometry(economy ? 6 : 8), dome = brainGeometry(economy ? 30 : 48, economy ? 10 : 16), domeLo = brainGeometry(economy ? 14 : 20, economy ? 5 : 7);
  yield;
  const puff = new THREE.IcosahedronGeometry(1, 0), orb = new THREE.IcosahedronGeometry(1, 1), bead = new THREE.OctahedronGeometry(1, 0);
  const stipe = tubeAlong(stipePath, economy ? 7 : 12, 4, 1, .45), blade = leafGeometry();
  const tentacle = tubeAlong(t => [.75 * t * t + .15 * t, t - .25 * t * t, 0], economy ? 3 : 4, 3, .05, .3);
  // Sphere normals keep the low-poly puffs and beads soft rather than faceted.
  for (const geometry of [puff, bead]) geometry.getAttribute('normal').copy(geometry.getAttribute('position'));

  const stone = upLit('#52667c', '#a2b2c0'), deepStone = upLit('#3f5069', '#8597ad');
  const boulders = (cx, cz, list, paint = stone) => list.forEach(([dx, dz, s]) => {
    const x = cx + dx, z = cz + dz;
    rocks.add(rockLo, xf(x, floor(x, z) + s * .3, z, [s * rr(1, 1.35), s * rr(.6, .85), s], [rr(-.3, .3), R() * TAU, rr(-.3, .3)]), paint);
  });
  // Plant position along a swaying stipe, so blades and beads stay attached.
  const alongStipe = (x, y, z, width, height, yaw, t) => {
    const [wx, , wz] = stipePath(t), c = Math.cos(yaw), s = Math.sin(yaw);
    return [x + (wx * c + wz * s) * width, y + t * height, z + (-wx * s + wz * c) * width];
  };

  // 1. Table-coral tower: plates spiral up a leaning stone trunk in the shallows.
  function tableTower(cx, cz) {
    const g = begin('Table coral tower', cx, cz, 6, 10.5);
    const trunk = h => [cx + Math.sin(h * .55) * .7 + h * .07, cz + Math.cos(h * .4) * .5 - .5];
    for (let i = 0; i < 6; i++) {
      const h = i * 1.5, [x, z] = trunk(h), r = 2.5 - i * .3;
      rocks.add(rockLo, xf(x, g + h + .3, z, [r, 1.6, r * .9], [rr(-.2, .2), R() * TAU, rr(-.2, .2)]), stone);
    }
    solid(cx - 1.4, g, cz - 1.6, cx + 1.7, g + 8.4, cz + 1.2);
    const table = (x, y, z, r, rotation, tone, stem) => {
      const base = C(tone), under = base.clone().multiplyScalar(.5), rim = base.clone().lerp(C('#fff0c4'), .42);
      corals.add(plate, xf(x, y, z, [r, r * .85, r], rotation), (c, p, n, l) => (n.y < -.2 ? c.copy(under) : c.copy(base).lerp(rim, Math.pow(Math.min(1, Math.hypot(l.x, l.z)), 3))));
      corals.add(stalk, xf(x, y - stem, z, [r * .2, stem, r * .2]), c => c.copy(under));
    };
    const tones = ['#ffa23f', '#ff7f50', '#ffc94d', '#f58a80'], tiers = economy ? 7 : 9;
    for (let i = 0; i < tiers; i++) {
      const h = 1.6 + i * (7.2 / (tiers - 1)), angle = i * 2.4 + .5, [tx, tz] = trunk(h), r = 3.3 - i * .21 + rr(-.2, .2), d = .9 + r * .55;
      const x = tx + Math.cos(angle) * d, z = tz + Math.sin(angle) * d;
      table(x, g + h, z, r, lean(angle, .13, R() * TAU), tones[i % tones.length], 1.1);
      solid(x - r * .65, g + h - .25, z - r * .65, x + r * .65, g + h + .25, z + r * .65);
    }
    { const [tx, tz] = trunk(9.2); table(tx, g + 10, tz, 2.4, lean(1, .06, 2), '#ffd27a', 1.8); solid(tx - 1.5, g + 9.7, tz - 1.5, tx + 1.5, g + 10.3, tz + 1.5); }
    // Brackets on the trunk and seedlings on the sand echo the big plates.
    for (let i = 0, n = economy ? 5 : 8; i < n; i++) {
      const h = .8 + i * 1.0, angle = i * 2.4 + 2.1, [tx, tz] = trunk(h), d = 2.1 - h * .14;
      table(tx + Math.cos(angle) * d, g + h + .5, tz + Math.sin(angle) * d, rr(.6, 1.05), lean(angle, .3, R() * TAU), pick(tones), .3);
    }
    for (const [dx, dz, r] of [[5.6, 2.2, 1.5], [-4.8, 4.4, 1.2], [-5.4, -3.6, 1.7], [3.2, -5.8, 1.1], [6.6, -2.8, .9]]) {
      const x = cx + dx, z = cz + dz; table(x, floor(x, z) + .7 + r * .3, z, r, lean(R() * TAU, .1, R() * TAU), pick(tones), 1 + r * .3);
    }
    boulders(cx, cz, [[3.4, 3.6, 1.2], [-3.6, 1.2, 1.5], [-1.6, -4, 1.1], [4.2, -2, .9]]);
  }

  // 2. Brain-coral dome on a stone ledge; the gap beneath is a swim-through.
  function brainDome(cx, cz) {
    const g = begin('Brain coral dome', cx, cz, 8, 9.2), ledge = g + 3.2;
    for (const side of [-1, 1]) {
      for (const [dx, w] of [[-3.3, 2.5], [.3, 3], [3.5, 2.4]]) {
        rocks.add(rockLo, xf(cx + dx, g + 1.4, cz + side * (5.7 + rr(-.2, .3)), [w, 3.5, 2.4], [rr(-.15, .15), R() * TAU, rr(-.15, .15)]), stone);
      }
      solid(cx - 4.4, g, cz + side * 4.2, cx + 4.6, g + 4.2, cz + side * 7);
    }
    rocks.add(rockHi, xf(cx, ledge + 1, cz, [6.3, 1, 6.7], [0, .4, 0]), stone);
    const low = C('#7fb886'), high = C('#eef0a0'), brain = (c, p, n, l) => c.copy(low).lerp(high, smoothstep(l.y, -.1, .95));
    brains.add(dome, xf(cx, ledge + 1.5, cz, [5.6, 4.5, 5.6], [0, 1.1, 0]), brain);
    solid(cx - 4.3, ledge + .35, cz - 4.5, cx + 4.3, ledge + 5, cz + 4.5);
    for (const [dx, dz, r] of [[6.6, 9.2, 1.7], [-7.2, -9, 1.4], [2.4, -10.2, 1.1]]) {
      const x = cx + dx, z = cz + dz; brains.add(domeLo, xf(x, floor(x, z) - .1, z, [r, r * .8, r], [0, R() * TAU, 0]), brain);
    }
    // Lantern polyps under the overhang mark the passage from a distance.
    const lantern = flat('#7ff3e2');
    for (let i = 0, n = economy ? 7 : 12; i < n; i++) {
      const dx = rr(-3.6, 3.6), dz = rr(-2.6, 2.6), y = ledge + 1 - Math.sqrt(Math.max(.05, 1 - (dx / 6.3) ** 2 - (dz / 6.7) ** 2));
      glows.add(puff, xf(cx + dx, y - .12, cz + dz, [.2, .3, .2].map(v => v * rr(.8, 1.3))), lantern);
    }
    boulders(cx, cz, [[6.4, 5.2, 1.3], [-6.2, 5.6, 1.1], [-6, -5.4, 1.4], [6.2, -5.8, 1]]);
  }

  // 3. Pillar-coral cathedral: organ-pipe columns in a horseshoe, tallest at the back.
  function pillarCathedral(cx, cz, open) {
    begin('Pillar coral cathedral', cx, cz, 8, 10.5);
    const base = C('#7658ad'), mid = C('#c3a0ee'), tip = C('#fff1fb');
    const paint = (c, p, n, l) => c.copy(base).lerp(mid, clamp(l.y * 1.5, 0, 1)).lerp(tip, smoothstep(l.y, .72, 1));
    const column = (x, z, r, h) => {
      const y = floor(x, z) - .4;
      corals.add(pillar, xf(x, y, z, [r, h, r], [rr(-.05, .05), R() * TAU, rr(-.05, .05)]), paint);
      if (r > .5) solid(x - r * .7, y, z - r * .7, x + r * .7, y + h * .93, z + r * .7);
    };
    // [radius, count, gap either side of the entrance, shortest, tallest, girth]
    for (const [radius, total, gap, low, high, girth] of [[5.7, economy ? 13 : 19, .85, 2.6, 10.2, .72], [3.9, economy ? 5 : 8, 1.9, 2.2, 6.4, .6], [7.4, economy ? 7 : 11, 1.2, 1, 3, .46]]) {
      for (let i = 0; i < total; i++) {
        const f = i / (total - 1), a = open + gap + f * (TAU - gap * 2), back = Math.pow(.5 - .5 * Math.cos(f * TAU), 1.3);
        const d = radius + rr(-.35, .35), h = (low + (high - low) * back) * rr(.85, 1.1);
        column(cx + Math.cos(a) * d, cz + Math.sin(a) * d, girth * (.75 + .4 * back) * rr(.9, 1.1), h);
      }
    }
    boulders(cx, cz, [[Math.cos(open + 1.5) * 8.4, Math.sin(open + 1.5) * 8.4, 1.3], [Math.cos(open + 3.4) * 8.8, Math.sin(open + 3.4) * 8.8, 1.6], [Math.cos(open - 1.6) * 8.2, Math.sin(open - 1.6) * 8.2, 1.2]]);
  }

  // 4. Kelp and sea-whip grove: nothing solid, so the diver can drift through it.
  function kelpGrove(cx, cz) {
    begin('Kelp grove', cx, cz, 8.5, 15);
    const stems = economy ? 13 : 22, leaves = economy ? 8 : 12;
    const stemPaint = ramp('#6d6a30', '#a9a84c'), leafPaint = [ramp('#3d7d44', '#c3d76b', 'x'), ramp('#4f8a3c', '#e0d06a', 'x'), ramp('#2f7550', '#a6d67c', 'x')];
    for (let i = 0; i < stems; i++) {
      const a = i * 2.4 + rr(-.3, .3), d = Math.sqrt((i + .5) / stems) * 7.6, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = floor(x, z) - .2;
      const height = rr(10, 15) * (1 - d / 24), yaw = R() * TAU, width = .075;
      const wave = { base: y, height, amp: rr(.9, 1.5), phase: x * .35 + z * .2, power: 1.6 };
      swayers.add(stipe, xf(x, y, z, [width, height, width], [0, yaw, 0]), stemPaint, wave);
      const paint = pick(leafPaint);
      for (let j = 0; j < leaves; j++) {
        const t = .1 + .88 * (j + R() * .5) / leaves, [px, py, pz] = alongStipe(x, y, z, width, height, yaw, t), size = rr(1.6, 2.6) * (1 - .3 * t);
        swayers.add(blade, xf(px, py, pz, [size, size, size * rr(1.1, 1.6)], [0, j * 2.4 + yaw, rr(.1, .65)]), paint, wave);
      }
    }
    const whipTones = ['#ff7f6a', '#ffb35c', '#e0609a'];
    for (let i = 0, n = economy ? 8 : 14; i < n; i++) {
      const a = i * 2.4 + 1, d = rr(5.5, 9.5), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = floor(x, z) - .1, height = rr(2.6, 5), tone = pick(whipTones);
      swayers.add(stipe, xf(x, y, z, [.05, height, .05], [0, R() * TAU, 0]), ramp(tone, '#ffe9c9'), { base: y, height, amp: rr(.3, .5), phase: x * .4 + z * .3, power: 1.8 });
    }
    boulders(cx, cz, [[1.5, .8, 1.4], [-2.6, 2.4, 1.1], [3.4, -2.6, 1.2], [-3.2, -3, 1.5], [5.6, 2.8, .9], [-.6, 5.4, 1]], deepStone);
  }

  // 5. Giant clam: the valves breathe and the mantle glows between them.
  let clam = null;
  function giantClam(cx, cz, yaw) {
    const g = begin('Giant clam', cx, cz, 3.5, 2.6), size = 3.6, restAngle = .1;
    const shell = standard({ side: THREE.DoubleSide, roughness: .8 });
    const valves = new THREE.InstancedMesh(valveGeometry(economy ? 26 : 44, economy ? 6 : 9), shell, 2); valves.name = 'Giant clam valves';
    const mantleMaterial = glowMaterial(time, false);
    const mantle = new THREE.Mesh(mantleGeometry(economy ? 28 : 48, economy ? 6 : 10, restAngle), mantleMaterial); mantle.name = 'Giant clam mantle';
    const origin = new THREE.Vector3(cx, g - .3, cz);
    mantle.position.copy(origin); mantle.rotation.y = yaw; mantle.scale.setScalar(size);
    count(valves.geometry.index.count / 3 * 2 + mantle.geometry.index.count / 3);
    clam = { valves, mantle, material: mantleMaterial, origin, yaw, size, restAngle };
    const reach = new THREE.Sphere(new THREE.Vector3(cx, g + 1, cz), 4);
    root.add(cullable(valves, reach), cullable(mantle, reach)); breathe(0, 0, 0);
    solid(cx - 1.3, g - .3, cz - 1.3, cx + 1.3, g + 1.6, cz + 1.3);
    const c = Math.cos(yaw), s = Math.sin(yaw), around = (a, b) => [a * c + b * s, -a * s + b * c];
    boulders(cx, cz, [around(2.5, .3), around(-2.6, -.2), around(.7, 2.1), around(-.9, -2.2), around(1.9, -1.8)].map(([dx, dz], i) => [dx, dz, .5 + (i % 3) * .12]), deepStone);
    const fringe = ['#ff7f6a', '#b987e8', '#ffb35c'];
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = around(Math.cos(i * 1.57 + .8) * 2.9, Math.sin(i * 1.57 + .8) * 2.5), x = cx + dx, z = cz + dz, r = rr(.45, .8), tone = pick(fringe);
      brains.add(domeLo, xf(x, floor(x, z) - .05, z, [r, r * .8, r], [0, R() * TAU, 0]), flat(tone));
    }
  }
  const valveMatrix = new THREE.Matrix4(), valveTurn = new THREE.Quaternion(), valveTilt = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0);
  function breathe(elapsed, night, depth) {
    if (!clam) return;
    // A slow swell with a brief shiver every twenty seconds or so.
    const flinch = Math.pow(Math.max(0, Math.sin(elapsed * .31)), 40), swell = Math.sin(elapsed * .5) * .05 - flinch * .07;
    for (let i = 0; i < 2; i++) {
      valveTurn.setFromAxisAngle(UP, clam.yaw + i * Math.PI).multiply(valveTilt.setFromAxisAngle(X, clam.restAngle + swell));
      clam.valves.setMatrixAt(i, valveMatrix.compose(clam.origin, valveTurn, _s.setScalar(clam.size)));
    }
    clam.valves.instanceMatrix.needsUpdate = true;
    clam.mantle.scale.z = clam.size * (1 + swell * 2.3);
    clam.material.emissiveIntensity = .55 + night * .7 + depth * .5 + Math.sin(elapsed * 1.3) * .12 - flinch * .3;
  }

  // 6. Rock spire dressed in soft-coral bouquets.
  function bouquet(x, y, z, direction, size, tone) {
    const q = aim(direction), wave = { base: y - .2, height: size * 2.2, amp: .16 * size, phase: x * .7 + z * .5, power: 1.2 };
    const pale = flat('#ffe4ec'), body = C(tone), bright = body.clone().lerp(C('#ffffff'), .45);
    const bloom = (c, p, n) => c.copy(body).lerp(bright, smoothstep(n.y, -.4, .9));
    swayers.add(stalk, xf(x, y, z, [size * .15, size * .8, size * .15], q), pale, wave);
    const top = new THREE.Vector3(0, size * .74, 0).applyQuaternion(q).add(_p.set(x, y, z)).clone(), arm = new THREE.Vector3();
    const branches = economy ? 3 : 4;
    for (let k = 0; k <= branches; k++) {
      const spread = k === branches ? 0 : .8, turn = k / branches * TAU + size;
      arm.set(Math.sin(spread) * Math.cos(turn), Math.cos(spread), Math.sin(spread) * Math.sin(turn)).applyQuaternion(q);
      const length = size * rr(.5, .78);
      swayers.add(stalk, xf(top.x, top.y, top.z, [size * .085, length, size * .085], aim(arm)), pale, wave);
      for (let m = 0; m < 2; m++) {
        const reach = length * (1 - m * .3), r = size * rr(.24, .34);
        swayers.add(puff, xf(top.x + arm.x * reach + rr(-.1, .1) * size, top.y + arm.y * reach + rr(-.1, .1) * size, top.z + arm.z * reach + rr(-.1, .1) * size, r, [R() * 3, R() * 3, R() * 3]), bloom, wave);
      }
    }
  }
  function rockSpire(cx, cz) {
    const g = begin('Soft coral spire', cx, cz, 6, 15), height = 14;
    const axis = h => [cx + h * .09 + Math.sin(h * .5) * .5, cz - h * .05 + Math.cos(h * .37) * .4 - .4];
    const girth = h => 3.3 * Math.pow(Math.max(0, 1 - h / (height + 1.5)), .8) + .45;
    for (let i = 0; i < 8; i++) {
      const h = i * 1.8, [x, z] = axis(h), r = girth(h);
      rocks.add(rockHi, xf(x, g + h + .4, z, [r * rr(.9, 1.1), 2.2, r * rr(.85, 1.05)], [rr(-.25, .25), R() * TAU, rr(-.25, .25)]), deepStone);
      solid(x - r * .62, g + h - .8, z - r * .62, x + r * .62, g + h + 1.6, z + r * .62);
    }
    // A shorter companion needle and a skirt of fallen blocks.
    for (let i = 0; i < 4; i++) {
      const r = 1.9 - i * .4;
      rocks.add(rockLo, xf(cx - 4.6 + i * .25, g + i * 1.6 + .4, cz + 2.6 - i * .15, [r, 1.7, r * .9], [rr(-.2, .2), R() * TAU, rr(-.2, .2)]), deepStone);
    }
    solid(cx - 5.6, g, cz + 1.6, cx - 3.3, g + 5.2, cz + 3.6);
    boulders(cx, cz, [[4.4, 2.2, 1.5], [3.2, -3.8, 1.2], [-2.4, -4.2, 1.6], [-6.4, -.6, 1], [1, 5, 1.1]], deepStone);
    const tones = ['#ff6fa8', '#ff8a5c', '#c58cff', '#ffc45c', '#ff7f9c'];
    for (let i = 0, n = economy ? 9 : 16; i < n; i++) {
      const h = 1.4 + i / n * 11 + rr(0, .5), a = i * 2.4 + .7, [x, z] = axis(h), r = girth(h) * .92;
      bouquet(x + Math.cos(a) * r, g + h + .4, z + Math.sin(a) * r, _n.set(Math.cos(a), .6, Math.sin(a)).normalize().clone(), rr(.9, 1.5), tones[i % tones.length]);
    }
    for (let i = 0; i < 3; i++) {
      const x = cx - 4.4 + rr(-.6, .6), z = cz + 2.5 + rr(-.6, .6);
      bouquet(x, g + 2 + i * 1.5, z, _n.set(rr(-.6, .2), .8, rr(-.2, .6)).normalize().clone(), rr(.8, 1.1), pick(tones));
    }
    const [tx, tz] = axis(height);
    for (let i = 0; i < 5; i++) {
      const whipHeight = rr(2, 3.6), x = tx + rr(-.5, .5), z = tz + rr(-.5, .5);
      swayers.add(stipe, xf(x, g + height - .4, z, [.045, whipHeight, .045], [0, R() * TAU, 0]), ramp('#ff8a5c', '#ffe9c9'), { base: g + height - .4, height: whipHeight, amp: .35, phase: i * 1.3, power: 1.8 });
    }
  }

  // 7. Lantern garden: sea pens, tube anemones and bulbs that light the deep shelf.
  function lanternGarden(cx, cz) {
    begin('Lantern garden', cx, cz, 6.5, 5.5);
    boulders(cx, cz, [[0, 0, 1.9], [1.8, 1.2, 1.2], [-1.6, .6, 1.3]].concat(Array.from({ length: 7 }, (_, i) => [Math.cos(i * .9 + .3) * 5.4, Math.sin(i * .9 + .3) * 5.4, .8 + (i % 3) * .25])), deepStone);
    solid(cx - 1.4, floor(cx, cz), cz - 1.2, cx + 1.4, floor(cx, cz) + 1.2, cz + 1.2);
    const frond = ramp('#2f9c98', '#aef5e6', 'x'), spine = ramp('#3a6f86', '#bfeee6');
    for (let i = 0, n = economy ? 6 : 9; i < n; i++) {
      const a = i * 2.4 + .6, d = 2.4 + (i % 3) * 1.3, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = floor(x, z) - .1;
      const height = rr(3.2, 5.4), yaw = R() * TAU, width = .05, wave = { base: y, height, amp: rr(.4, .6), phase: x * .5 + z * .4, power: 1.7 };
      swayers.add(stipe, xf(x, y, z, [width, height, width], [0, yaw, 0]), spine, wave);
      const light = flat(i % 2 ? '#8dfff0' : '#b9a2ff');
      for (let j = 0, pairs = economy ? 6 : 9; j < pairs; j++) {
        const t = .32 + .66 * j / (pairs - 1), [px, py, pz] = alongStipe(x, y, z, width, height, yaw, t), size = height * .26 * (1.15 - t);
        for (const turn of [0, Math.PI]) {
          const matrix = xf(px, py, pz, [size, size, size * .9], [0, yaw + turn, .55]);
          swayers.add(blade, matrix, frond, wave);
          _t.set(1, -.22, 0).applyMatrix4(matrix); glows.add(bead, xf(_t.x, _t.y, _t.z, .06 + size * .04), light, wave);
        }
      }
      { const [px, py, pz] = alongStipe(x, y, z, width, height, yaw, 1); glows.add(puff, xf(px, py + .1, pz, .16), light, wave); }
    }
    // Tube anemones: a leathery sleeve with a glowing crown.
    for (let i = 0, n = economy ? 3 : 5; i < n; i++) {
      const a = i * 1.26 + 2, d = 4 + (i % 2) * .9, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = floor(x, z) - .2, top = y + rr(.9, 1.4);
      corals.add(pillar, xf(x, y, z, [.24, top - y, .24]), ramp('#4a3f6e', '#8c78b8'));
      const crown = ramp(i % 2 ? '#7a4dff' : '#ff5fb4', i % 2 ? '#9ff6ff' : '#ffd0a8'), wave = { base: top - .2, height: 1.2, amp: .14, phase: i * 2.1, power: 1 };
      for (let k = 0, arms = economy ? 8 : 12; k < arms; k++) glows.add(tentacle, xf(x, top - .12, z, rr(.75, 1.05), [0, k / arms * TAU + i, rr(-.25, .2)]), crown, wave);
    }
    // Bulb lanterns on thin stalks give the garden its warm points of light.
    const warm = flat('#ffd98a');
    for (let i = 0, n = economy ? 5 : 8; i < n; i++) {
      const a = i * 2.4 + 3, d = rr(1.4, 6), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = floor(x, z) - .1, height = rr(.9, 2.2), yaw = R() * TAU;
      const wave = { base: y, height, amp: .22, phase: x + z, power: 1.5 };
      swayers.add(stipe, xf(x, y, z, [.03, height, .03], [0, yaw, 0]), spine, wave);
      const [px, py, pz] = alongStipe(x, y, z, .03, height, yaw, 1); glows.add(orb, xf(px, py + .12, pz, [.2, .26, .2]), warm, wave);
    }
  }

  yield; tableTower(38, -8);
  yield; brainDome(-42, -2);
  yield; pillarCathedral(48, -28, Math.atan2(-39 + 28, 18 - 48));
  yield; kelpGrove(-50, -52);
  yield; giantClam(-9, -54, .5);
  yield; rockSpire(50, -72);
  yield; lanternGarden(8, -86);

  yield; finish();
  for (const geometry of [rockLo, rockHi, plate, stalk, pillar, dome, domeLo, puff, orb, bead, stipe, blade, tentacle]) geometry.dispose();

  const counts = { formations: sites.length, drawCalls: root.children.length, triangles: 0 };
  for (const entry of sites) { entry.triangles = Math.round(entry.triangles); counts[entry.name] = entry.triangles; counts.triangles += entry.triangles; }

  function update(elapsed = 0, night = 0, depth = 0) {
    time.value = elapsed;
    glowSway.emissiveIntensity = .5 + night * .8 + depth * .6 + Math.sin(elapsed * .9) * .08;
    if (!clam || clam.valves.visible) breathe(elapsed, night, depth);
  }
  // view: { frustum, eye, range }, or null to show everything. The renderer
  // culls each formation against the view; the haze range is tested here.
  function cull(view = null) {
    for (const { mesh, sphere } of culled) mesh.visible = !view || view.eye.distanceTo(sphere.center) - sphere.radius < view.range;
  }
  return { root, update, cull, counts, sites };
}
