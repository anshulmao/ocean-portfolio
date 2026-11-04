import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { waveHeight } from './shaders.js';
import { seededRandom } from './assets.js';
import { PORTFOLIO_CONTENT } from './portfolio-content.js';

// The portfolio landmarks, built in code rather than downloaded: the diver's helmet (About), the coral nursery
// (Projects), the nautilus (Experience) and the descent line with its slate (Résumé). Each is a handful of merged
// meshes in world space, placed on the terrain it stands on, and each has a short reveal that plays before its page
// of the records opens (landmark-interactions.js waits for the seconds reveal() returns).
//
// Every builder takes { x, z, floorAt, economy } and returns:
//   root     the meshes, in world coordinates (the model scene's root is at the origin)
//   free     (optional) moving things that are not part of the landmark's shape (the nursery's fish): kept out of root,
//            so whatever measures a landmark by its meshes (grounding, tools/audit-reef.mjs) does not count them
//   focus    a box around the landmark itself: its centre is where the diver reads it from
//   approach where the diver hovers to read it (the open lane on the +x side, as the old landmarks had)
//   solids   collision boxes, in world space
//   reveal(open, motion)  open: seconds until the records should open (0 with motion off); close: true
//   update(step, elapsed, eye)

const TAU = Math.PI * 2;
const clamp01 = t => Math.min(Math.max(t, 0), 1);
const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
const UP = new THREE.Vector3(0, 1, 0);
const standard = (extra = {}) => new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .82, ...extra });
const near = (eye, center, from, to) => eye ? 1 - smooth((eye.distanceTo(center) - from) / (to - from)) : 0;

// Pieces of geometry painted with a colour (or a colour worked out per vertex) and merged per material, so a landmark
// costs a draw call per kind of surface. `drop`, where given, is written per vertex as how far it hangs below that
// height (the nursery's fragments swing by it).
class Kit {
  constructor(withDrop = false) { this.parts = new Map(); this.withDrop = withDrop; }
  add(material, geometry, { at = [0, 0, 0], turn = [0, 0, 0], quat = null, size = [1, 1, 1], color = '#ffffff', paint = null, matrix = null, drop = null } = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    g.applyMatrix4(matrix || new THREE.Matrix4().compose(new THREE.Vector3(...at), quat || new THREE.Quaternion().setFromEuler(new THREE.Euler(...turn)), new THREE.Vector3(...size)));
    const p = g.getAttribute('position'), colors = new Float32Array(p.count * 3), base = new THREE.Color(color), c = new THREE.Color(), v = new THREE.Vector3();
    const drops = this.withDrop ? new Float32Array(p.count) : null;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const out = paint ? (paint(v, c.copy(base)) || c) : base;
      colors[i * 3] = out.r; colors[i * 3 + 1] = out.g; colors[i * 3 + 2] = out.b;
      if (drops) drops[i] = drop === null ? 0 : Math.max(0, drop - v.y);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (drops) g.setAttribute('aDrop', new THREE.BufferAttribute(drops, 1));
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(g);
    geometry.dispose();
    return this;
  }
  geometry(material) {
    const pieces = this.parts.get(material) || [];
    const merged = pieces.length > 1 ? mergeGeometries(pieces, false) : pieces[0];
    if (pieces.length > 1) pieces.forEach(piece => piece.dispose());
    merged?.computeBoundingSphere(); merged?.computeBoundingBox();
    return merged;
  }
  meshes(name, parent) {
    const out = [];
    for (const material of [...this.parts.keys()]) {
      const geometry = this.geometry(material);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `${name} · ${material.name || 'surface'}`;
      parent?.add(mesh); out.push(mesh);
    }
    this.parts.clear();
    return out;
  }
}

// A tapered cylinder from a to b (thick at a), for poles, hoses, branches and lines.
function rod(kit, material, a, b, radiusA, radiusB, options = {}, sides = 6) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), length = from.distanceTo(to);
  const geometry = new THREE.CylinderGeometry(radiusB, radiusA, length, sides, 1, options.open ?? false);
  const quat = new THREE.Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize());
  return kit.add(material, geometry, { ...options, at: from.clone().lerp(to, .5).toArray(), quat });
}

// A rock with a lumpy surface; `flat` squashes its top into a table to set things on.
function rockGeometry(seed, flat = 0) {
  const geometry = new THREE.IcosahedronGeometry(1, 2), p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const bump = 1 + .14 * Math.sin(x * 4.1 + y * 2.3 + seed) * Math.cos(z * 3.7 - y * 1.9) + .07 * Math.sin(z * 7.3 + x * 5.1 + seed * 2);
    x *= bump; y *= bump; z *= bump;
    if (flat && y > flat) y = flat + (y - flat) * .18;
    p.setXYZ(i, x, y, z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------------------------------------------
// Bubbles: one Points draw for a burst (on reveal) and a slow trickle (always), rising in the shader from up to two
// origins. Nothing moves on the CPU.
const bubbleVertex = /* glsl */ `
uniform float uTime; uniform float uBurst; uniform float uRatio; uniform float uSize; uniform vec3 uOrigin[2];
attribute vec3 aSeed;
varying float vAlpha;
void main(){
  float s = aSeed.x, life;
  float t;
  if (aSeed.z > .5) { t = uTime - uBurst - s * .5; life = 2.4 + s * 1.4; }
  else { float period = 4.5 + s * 5.0; t = mod(uTime + s * 31.0, period); life = 2.6; }
  if (t < 0.0 || t > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
  vec3 origin = aSeed.y > .5 ? uOrigin[1] : uOrigin[0];
  float spread = aSeed.z > .5 ? .55 : .12;
  vec3 p = origin + vec3(
    sin(t * 7.0 + s * 40.0) * .05 * (1.0 + t) + (fract(s * 13.7) - .5) * spread * t,
    t * (.8 + s * .7) + t * t * .3,
    cos(t * 6.0 + s * 23.0) * .05 * (1.0 + t) + (fract(s * 7.3) - .5) * spread * t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  float size = uSize * (.5 + s * .9) * (1.0 + t * .3) * (aSeed.z > .5 ? 1.0 : .75);
  gl_PointSize = clamp(size * 900.0 * uRatio / max(.5, -mv.z), 1.0, 64.0);
  vAlpha = (1.0 - smoothstep(life * .7, life, t)) * smoothstep(0.0, .1, t) * exp(mv.z * .02);
}`;
const bubbleFragment = /* glsl */ `
varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - .5; float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float rim = smoothstep(.55, .9, d) * (1.0 - smoothstep(.92, 1.0, d));
  float shine = 1.0 - smoothstep(0.0, .26, length(c - vec2(-.16, -.18)));
  gl_FragColor = vec4(mix(vec3(.74, .9, .98), vec3(1.0), shine), (rim * .75 + shine * .85 + .06) * vAlpha);
}`;
function bubbles({ burst = 36, trickle = 6, size = .05, seed = 7 } = {}) {
  const random = seededRandom(seed), total = burst + trickle, seeds = new Float32Array(total * 3);
  for (let i = 0; i < total; i++) seeds.set([random(), i % 3 === 0 ? 1 : 0, i < burst ? 1 : 0], i * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  const uniforms = { uTime: { value: 0 }, uBurst: { value: -1000 }, uRatio: { value: Math.min(globalThis.devicePixelRatio || 1, 2) }, uSize: { value: size },
    uOrigin: { value: [new THREE.Vector3(), new THREE.Vector3()] } };
  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({ uniforms, vertexShader: bubbleVertex, fragmentShader: bubbleFragment, transparent: true, depthWrite: false, fog: false }));
  points.name = 'Landmark bubbles'; points.renderOrder = 4;
  return {
    points, uniforms,
    from(a, b = a) { uniforms.uOrigin.value[0].copy(a); uniforms.uOrigin.value[1].copy(b); geometry.boundingSphere = new THREE.Sphere(a.clone().lerp(b, .5).add(new THREE.Vector3(0, 3, 0)), 5); },
    burst(at) { uniforms.uBurst.value = at; },
    tick(elapsed) { uniforms.uTime.value = elapsed; }
  };
}

// ---------------------------------------------------------------------------------------------------------------
// About: an old-school copper and brass diving helmet on a flat rock, its air hose trailing off across the sand.
// The fins, lantern and weight belt around it are set pieces (set-pieces.js). Reveal: the exhaust valve and the top
// port let go a burst of air while the faceplates warm to amber.
export function buildHelmet({ x, z, floorAt, economy = false }) {
  const root = new THREE.Group(); root.name = 'about placement wrapper';
  const S = 1.9;
  const metal = standard({ roughness: .55, name: 'brass and copper' });
  const glass = new THREE.MeshStandardMaterial({ name: 'helmet glass', color: '#1d3a44', roughness: .3, emissive: '#ffb45c', emissiveIntensity: 0 });
  const stone = standard({ roughness: .95, flatShading: true, name: 'stone' });
  const rubber = standard({ roughness: .9, name: 'hose' });

  // The rock: a flattened boulder whose underside reaches below the lowest sand around it.
  let low = Infinity;
  for (const [dx, dz] of [[0, 0], [.9, 0], [-.9, 0], [0, .8], [0, -.8]]) low = Math.min(low, floorAt(x + dx, z + dz));
  const rockKit = new Kit();
  rockKit.add(stone, rockGeometry(1.7, .5), { at: [x, low + .16, z], size: [1.35, .62, 1.15], turn: [0, .5, 0], color: '#8496ab',
    paint: (v, c) => c.lerp(new THREE.Color('#5f7a6c'), clamp01((v.y - low - .35) * 2.5) * .55) });
  const [rockMesh] = rockKit.meshes('About rock', root);
  const rockTop = rockMesh.geometry.boundingBox.max.y - .06;

  // The helmet, in real measurements times S, its faceplate towards +x (the approach lane).
  const helmet = new THREE.Group(); helmet.name = 'Diving helmet';
  helmet.position.set(x - .05, rockTop, z + .05); helmet.rotation.set(.05, -.42, .06);
  root.add(helmet);
  const brass = '#a8823e', darkBrass = '#86642a', copper = '#9c5a34', patinaColor = new THREE.Color('#5d8f7c');
  const patina = (v, c) => { const n = Math.sin(v.x * 9 + v.y * 5) * Math.sin(v.z * 8 - v.y * 4) + .5 * Math.sin(v.x * 23 + v.z * 19); if (n > .42) c.lerp(patinaColor, Math.min(1, (n - .42) * 1.8)); return c; };
  const k = new Kit(), g = new Kit();
  const at = (px, py, pz) => [px * S, py * S, pz * S];
  const sz = (sx, sy, sz_) => [sx * S, sy * S, sz_ * S];
  const corselet = new THREE.LatheGeometry([[.34, 0], [.335, .025], [.3, .07], [.25, .12], [.215, .165], [.205, .19]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
  k.add(metal, corselet, { size: sz(.82, 1, 1), color: brass, paint: (v, c) => c.lerp(patinaColor, clamp01(.35 - v.y) * .35) });
  k.add(metal, new THREE.TorusGeometry(.335, .016, 6, 36), { at: at(0, .012, 0), turn: [Math.PI / 2, 0, 0], size: sz(.82, 1, 1), color: darkBrass });
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; k.add(metal, new THREE.SphereGeometry(.017, 6, 4), { at: at(Math.cos(a) * .315 * .82, .045, Math.sin(a) * .315), size: sz(1, 1, 1), color: '#6f5424' }); }
  for (const side of [-1, 1]) k.add(metal, new THREE.BoxGeometry(.05, .035, .022), { at: at(.25, .075, side * .13), turn: [0, side * .5, 0], size: sz(1, 1, 1), color: darkBrass });
  k.add(metal, new THREE.TorusGeometry(.21, .024, 6, 32), { at: at(0, .19, 0), turn: [Math.PI / 2, 0, 0], size: sz(1, 1, 1), color: brass });
  k.add(metal, new THREE.SphereGeometry(.2, economy ? 20 : 28, economy ? 14 : 18), { at: at(0, .37, 0), size: sz(1, 1.08, 1), color: copper, paint: patina });
  k.add(metal, new THREE.TorusGeometry(.19, .013, 6, 32), { at: at(0, .3, 0), turn: [Math.PI / 2, 0, 0], size: sz(1, 1, 1), color: brass });
  // Faceplate (front) and the two side ports, each with its glass and, at the sides, a guard.
  k.add(metal, new THREE.TorusGeometry(.088, .021, 8, 28), { at: at(.2, .37, 0), turn: [0, Math.PI / 2, 0], size: sz(1, 1, 1), color: brass });
  g.add(glass, new THREE.CylinderGeometry(.074, .074, .02, 24), { at: at(.207, .37, 0), turn: [0, 0, Math.PI / 2], size: sz(1, 1, 1), color: '#ffffff' });
  rod(k, metal, at(.205, .34, -.1), at(.205, .4, -.1), .013 * S, .013 * S, { color: darkBrass });
  for (const side of [-1, 1]) {
    k.add(metal, new THREE.TorusGeometry(.068, .017, 8, 24), { at: at(0, .37, side * .198), size: sz(1, 1, 1), color: brass });
    g.add(glass, new THREE.CylinderGeometry(.058, .058, .018, 20), { at: at(0, .37, side * .204), turn: [Math.PI / 2, 0, 0], size: sz(1, 1, 1), color: '#ffffff' });
    for (const offset of [-.034, 0, .034]) rod(k, metal, at(offset, .3, side * .217), at(offset, .44, side * .217), .006 * S, .006 * S, { color: darkBrass }, 5);
  }
  // Top port, on the brow, facing up and forward.
  { const d = new THREE.Vector3(.5, .86, 0).normalize(), quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    k.add(metal, new THREE.TorusGeometry(.046, .013, 6, 20), { at: at(.106, .566, 0), quat, size: sz(1, 1, 1), color: brass });
    g.add(glass, new THREE.CylinderGeometry(.038, .038, .014, 16), { at: at(.108, .57, 0), quat: new THREE.Quaternion().setFromUnitVectors(UP, d), size: sz(1, 1, 1), color: '#ffffff' }); }
  // Exhaust valve (right side, where the burst comes from) and the gooseneck air inlet at the back.
  rod(k, metal, at(-.06, .27, .17), at(-.06, .27, .235), .026 * S, .022 * S, { color: brass }, 10);
  rod(k, metal, at(-.17, .44, 0), at(-.235, .52, 0), .02 * S, .018 * S, { color: brass }, 8);
  rod(k, metal, at(-.235, .52, 0), at(-.3, .5, 0), .018 * S, .018 * S, { color: darkBrass }, 8);
  k.meshes('Diving helmet', helmet); g.meshes('Diving helmet', helmet);
  helmet.updateMatrixWorld(true);
  const valve = helmet.localToWorld(new THREE.Vector3(...at(-.06, .27, .25)));
  const topPort = helmet.localToWorld(new THREE.Vector3(...at(.11, .58, 0)));
  const inlet = helmet.localToWorld(new THREE.Vector3(...at(-.3, .5, 0)));

  // The air hose: off the back of the helmet, down the rock and a few metres across the sand in a lazy S (short of the
  // coral carpets and sea grass further west).
  const path = [inlet, inlet.clone().add(new THREE.Vector3(-.3, -.12, .05)), new THREE.Vector3(x - 1.25, rockTop - .25, z + .2)];
  { const sx = x - 1.75, sz2 = z + .45; path.push(new THREE.Vector3(sx, floorAt(sx, sz2) + .06, sz2)); }
  for (let i = 1; i <= 5; i++) { const px = x - 1.75 - i * .62, pz = z + .45 + Math.sin(i * .95) * .9; path.push(new THREE.Vector3(px, floorAt(px, pz) + .06, pz)); }
  const hoseKit = new Kit();
  hoseKit.add(rubber, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), economy ? 50 : 80, .05, 6, false), { color: '#5b4a3b',
    paint: (v, c) => c.offsetHSL(0, 0, Math.sin(v.x * 3.1 + v.z * 2.3) * .03) });
  hoseKit.meshes('Air hose', root);

  const air = bubbles({ burst: economy ? 26 : 40, trickle: 6, size: .055, seed: 31 });
  air.from(valve, topPort); root.add(air.points);

  const helmetBox = new THREE.Box3().setFromObject(helmet), focus = helmetBox.clone().union(rockMesh.geometry.boundingBox);
  const center = focus.getCenter(new THREE.Vector3());
  const ax = center.x + 4.8, az = center.z;
  const approach = new THREE.Vector3(ax, Math.max(floorAt(ax, az) + 2.6, center.y + .8), az);
  const solids = [
    new THREE.Box3(new THREE.Vector3(x - 1.05, low - .3, z - .9), new THREE.Vector3(x + 1.05, rockTop, z + .9)),
    helmetBox.clone().expandByScalar(-.06)
  ];

  let now = 0, open = false, glow = 0;
  return {
    root, focus, approach, solids,
    reveal(isOpen, motion = true) {
      open = isOpen;
      if (!isOpen) return true;
      air.burst(now);
      if (!motion) { glow = 1.4; glass.emissiveIntensity = glow; return 0; }
      return .95;
    },
    update(step, elapsed, eye) {
      now = elapsed; air.tick(elapsed);
      const target = open ? 1.4 : near(eye, center, 3, 9) * .3;
      glow += (target - glow) * (step > 0 ? 1 - Math.exp(-step * (open ? 6 : 2.5)) : 1);
      glass.emissiveIntensity = glow;
    }
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Projects: a coral-restoration nursery. Three PVC "trees" float on tethers over concrete blocks, coral fragments
// hanging from their arms on monofilament; the big one in front has a fragment for every project, larger and
// brighter. A small school of chromis hangs about it. Reveal: a pulse of current sways the trees (the fragments lag
// behind on their lines) and the fish dart out, then drift back.
const PROJECT_TIPS = ['#c58cff', '#ffd36a', '#ff8fb0', '#7fe0b0', '#7fb7ff', '#ff9d5c', '#f2f2a0', '#9ef0ff'];
const PLAIN_TIPS = ['#e8d6b0', '#d4b38a', '#b98fc9', '#e6c9a0'];

function swingMaterial() {
  const material = standard({ roughness: .85, name: 'nursery fragments', emissive: '#c9a2ff', emissiveIntensity: 0 });
  const uSwing = { value: new THREE.Vector2() };
  material.onBeforeCompile = shader => {
    shader.uniforms.uSwing = uSwing;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDrop; uniform vec2 uSwing;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xz += uSwing * aDrop;');
  };
  material.customProgramCacheKey = () => 'nursery-swing';
  return { material, uSwing };
}

// A staghorn fragment hanging from `top`: a main branch pointing down and a few side branches, tan at the base and
// coloured at the tips.
function fragment(kit, material, top, size, tip, random, drop) {
  const base = new THREE.Color('#d8c39a'), tipColor = new THREE.Color(tip), main = new THREE.Vector3((random() - .5) * .3, -1, (random() - .5) * .3).normalize();
  const length = .3 * size, end = top.clone().addScaledVector(main, length);
  const paint = (v, c) => c.copy(base).lerp(tipColor, clamp01(v.distanceTo(top) / length * 1.1));
  rod(kit, material, top.toArray(), end.toArray(), .03 * size, .011 * size, { paint, drop }, 6);
  for (let i = 0, n = 2 + Math.floor(random() * 2); i < n; i++) {
    const from = top.clone().lerp(end, .3 + random() * .45), angle = random() * TAU;
    const dir = new THREE.Vector3(Math.cos(angle), -.35 - random() * .5, Math.sin(angle)).normalize();
    rod(kit, material, from.toArray(), from.clone().addScaledVector(dir, (.13 + random() * .1) * size).toArray(), .018 * size, .008 * size, { paint, drop }, 5);
  }
}

function nurseryTree({ x, z, floorAt, scale = 1, levels = 5, projects = 0, random, economy, frame, fragmentMaterial }) {
  const base = floorAt(x, z);
  const pivot = new THREE.Group(); pivot.name = 'Nursery tree'; pivot.position.set(x, base + .3 * scale, z);
  const pvc = standard({ roughness: .7, name: 'PVC' });
  const treeKit = new Kit(), fragKit = new Kit(true);
  const trunkTop = (1.1 + levels * .62 + .3) * scale;
  const algae = new THREE.Color('#9fb08a');
  rod(treeKit, pvc, [0, 0, 0], [0, 1.05 * scale, 0], .012, .012, { color: '#ddd6c2' }, 4);
  rod(treeKit, pvc, [0, 1 * scale, 0], [0, trunkTop, 0], .045 * scale, .045 * scale, { color: '#e9ede4', paint: (v, c) => c.lerp(algae, clamp01(1 - v.y / trunkTop) * .55) }, 8);
  treeKit.add(pvc, new THREE.SphereGeometry(.24 * scale, 14, 10), { at: [0, trunkTop + .2 * scale, 0], color: '#f07f3a' });
  rod(treeKit, pvc, [0, trunkTop, 0], [0, trunkTop + .1 * scale, 0], .02, .02, { color: '#ddd6c2' }, 4);
  const ends = [];
  for (let level = 0; level < levels; level++) {
    const y = (1.5 + level * .62) * scale, turn = level * Math.PI / 5;
    for (const angle of [turn, turn + Math.PI / 2]) {
      const dx = Math.cos(angle) * .8 * scale, dz = Math.sin(angle) * .8 * scale;
      rod(treeKit, pvc, [-dx, y, -dz], [dx, y, dz], .028 * scale, .028 * scale, { color: '#eef1ea', paint: (v, c) => c.lerp(algae, .25) }, 6);
      ends.push(new THREE.Vector3(dx * .92, y, dz * .92), new THREE.Vector3(-dx * .92, y, -dz * .92));
    }
  }
  const wanted = Math.min(ends.length, economy ? Math.ceil(ends.length * .65) : ends.length);
  // Spread the project fragments over the tree, then fill in with plain ones.
  const order = ends.map((end, i) => ({ end, key: (i * 7) % ends.length })).sort((a, b) => a.key - b.key).slice(0, wanted);
  order.forEach(({ end }, i) => {
    const hang = .16 + random() * .2, top = end.clone().add(new THREE.Vector3(0, -hang, 0));
    rod(fragKit, fragmentMaterial, end.toArray(), top.toArray(), .004, .004, { color: '#e8eef0', drop: end.y }, 3);
    const project = i < projects;
    fragment(fragKit, fragmentMaterial, top, (project ? 1.55 : .95 + random() * .3) * scale, project ? PROJECT_TIPS[i % PROJECT_TIPS.length] : PLAIN_TIPS[i % PLAIN_TIPS.length], random, end.y);
  });
  treeKit.meshes('Nursery tree', pivot); fragKit.meshes('Nursery fragments', pivot);
  // The concrete block and the tether's foot do not sway.
  const blockKit = new Kit();
  blockKit.add(pvc, new THREE.BoxGeometry(.5 * scale, .34 * scale, .5 * scale), { at: [x, base + .12 * scale, z], turn: [0, random(), 0], color: '#8d9393' });
  blockKit.meshes('Nursery block', frame);
  frame.add(pivot);
  return {
    pivot, top: trunkTop, base,
    solids: [new THREE.Box3(new THREE.Vector3(x - .3 * scale, base - .2, z - .3 * scale), new THREE.Vector3(x + .3 * scale, base + trunkTop + .5 * scale, z + .3 * scale))]
  };
}

export function buildNursery({ x, z, floorAt, economy = false, projects = 6 }) {
  const root = new THREE.Group(); root.name = 'projects placement wrapper';
  const random = seededRandom(5303);
  const trees = [
    { x, z, scale: 1, levels: 5, projects, delay: 0, amplitude: .2 },
    { x: x - 3.4, z: z + 2.7, scale: .78, levels: 3, projects: 0, delay: .18, amplitude: .16 },
    { x: x - 2.5, z: z - 3.3, scale: .7, levels: 3, projects: 0, delay: .32, amplitude: .15 }
  ].map((spec, index) => {
    const { material, uSwing } = swingMaterial();
    const tree = nurseryTree({ ...spec, floorAt, random, economy, frame: root, fragmentMaterial: material });
    return { ...spec, ...tree, material, uSwing, phase: index * 1.7 };
  });
  const main = trees[0];

  // The chromis: one instanced draw, each fish circling the big tree at its own radius, height and pace.
  const fishKit = new Kit(), fishMaterial = standard({ roughness: .6, name: 'chromis' });
  fishKit.add(fishMaterial, new THREE.SphereGeometry(1, 8, 6), { size: [.11, .05, .028], color: '#4fb7c9', paint: (v, c) => v.y < -.01 ? c.lerp(new THREE.Color('#c4ecf0'), .7) : v.y > .025 ? c.lerp(new THREE.Color('#2e6f8a'), .5) : c });
  { const tail = new THREE.BufferGeometry(); tail.setAttribute('position', new THREE.Float32BufferAttribute([-.09, 0, 0, -.17, .045, 0, -.17, -.045, 0, -.09, 0, 0, -.17, -.045, 0, -.17, .045, 0], 3));
    fishKit.add(fishMaterial, tail, { color: '#3a8fb0' }); }
  const fishCount = economy ? 9 : 14;
  const school = new THREE.InstancedMesh(fishKit.geometry(fishMaterial), fishMaterial, fishCount);
  school.name = 'Nursery chromis'; school.frustumCulled = false;
  const fish = Array.from({ length: fishCount }, (_, i) => ({ radius: 1 + random() * 1.1, height: 1.4 + random() * 2.8, speed: (.22 + random() * .2) * (i % 3 ? 1 : -1), phase: random() * TAU, dart: 2.2 + random() * 1.8,
    position: new THREE.Vector3(), previous: new THREE.Vector3(), yaw: 0 }));
  const dummy = new THREE.Object3D(), outward = new THREE.Vector3();

  const focus = new THREE.Box3(new THREE.Vector3(x - .95, main.base, z - .95), new THREE.Vector3(x + .95, main.base + main.top + .7, z + .95));
  const center = focus.getCenter(new THREE.Vector3());
  const ax = x + 6.2, az = z;
  const approach = new THREE.Vector3(ax, Math.max(floorAt(ax, az) + 3.2, center.y), az);
  const current = new THREE.Vector3(.25, 0, 1).normalize(), axis = new THREE.Vector3(current.z, 0, -current.x);

  let now = 0, pulseAt = -100, open = false, lit = 0;
  const period = 1.35, decay = 1.05;
  return {
    root, free: [school], focus, approach, solids: trees.flatMap(tree => tree.solids),
    reveal(isOpen, motion = true) {
      open = isOpen;
      if (!isOpen) return true;
      pulseAt = now;
      return motion ? .9 : 0;
    },
    update(step, elapsed, eye) {
      now = elapsed;
      const near_ = eye ? eye.distanceTo(center) : 0;
      if (eye && near_ > 55) return;
      lit += ((open ? .35 : near(eye, center, 4, 10) * .08) - lit) * (step > 0 ? 1 - Math.exp(-step * 3) : 1);
      for (const tree of trees) {
        const t = now - pulseAt - tree.delay, w = TAU / period;
        let angle = .022 * Math.sin(now * TAU / 5.5 + tree.phase), speed = .022 * TAU / 5.5 * Math.cos(now * TAU / 5.5 + tree.phase);
        if (t > 0 && t < 6) {
          const fade = Math.exp(-t / decay);
          angle += tree.amplitude * Math.sin(w * t) * fade;
          speed += tree.amplitude * fade * (w * Math.cos(w * t) - Math.sin(w * t) / decay);
        }
        tree.pivot.quaternion.setFromAxisAngle(axis, angle);
        // The fragments hang on lines: they lag the tree, by how fast it is turning.
        tree.uSwing.value.set(current.x, current.z).multiplyScalar(-speed * .35);
        tree.material.emissiveIntensity = lit;
      }
      const t = now - pulseAt, push = t > 0 && t < 8 ? (1 - Math.exp(-t / .12)) * Math.exp(-t / 1.4) : 0;
      for (let i = 0; i < fish.length; i++) {
        const f = fish[i], phi = f.phase + now * f.speed;
        f.previous.copy(f.position);
        f.position.set(x + Math.cos(phi) * f.radius, main.base + f.height + Math.sin(now * .7 + i) * .15, z + Math.sin(phi) * f.radius);
        if (push > 0) { outward.set(Math.cos(phi), .25, Math.sin(phi)).normalize(); f.position.addScaledVector(outward, push * f.dart); }
        const dx = f.position.x - f.previous.x, dz = f.position.z - f.previous.z;
        if (dx * dx + dz * dz > 1e-8) f.yaw = Math.atan2(-dz, dx);
        dummy.position.copy(f.position); dummy.rotation.set(0, f.yaw + Math.sin(now * 11 + i) * .12, 0); dummy.updateMatrix();
        school.setMatrixAt(i, dummy.matrix);
      }
      school.instanceMatrix.needsUpdate = true;
    }
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Experience: a nautilus shell resting upright on the deep ledge, its spiral facing the approach. The shell is a true
// logarithmic spiral (each whorl three times the last), cut into chambers along its length. Reveal: the chambers
// light one after another from the centre outwards.
export function buildNautilus({ x, z, floorAt, economy = false, diameter = 2.4 }) {
  const root = new THREE.Group(); root.name = 'experience placement wrapper';
  // Four whorls, so the spiral closes at its centre as a real (involute) shell does; the inner two are hidden under the
  // outer one and make a single unlit core, and the ten chambers that light are spread over the visible last whorl.
  const chambers = 10, thetaMax = 4 * Math.PI, thetaMin = thetaMax - 4 * Math.PI, visibleFrom = thetaMax - 2.2 * Math.PI, b = Math.log(3) / TAU;
  const radiusMax = diameter / 2.49;
  const R = theta => radiusMax * Math.exp(b * (theta - thetaMax));
  const flare = theta => smooth((theta - (thetaMax - .5)) / .5);
  const K = theta => .56 + .06 * flare(theta), W = theta => .47 * (1 + .1 * flare(theta));
  const steps = economy ? 96 : 150, around = economy ? 16 : 22;
  const cream = new THREE.Color('#efe3c8'), stripe = new THREE.Color('#9b4f2b'), nacre = new THREE.Color('#ece6f2');
  const point = (theta, phi, out) => {
    const r = R(theta), radial = r * (1 + K(theta) * Math.cos(phi)), axial = r * W(theta) * Math.sin(phi);
    return out.set(Math.cos(theta) * radial, Math.sin(theta) * radial, axial);
  };
  const colorAt = (theta, phi, out) => {
    out.copy(cream);
    const fade = 1 - smooth((theta - (thetaMax - 1.5)) / 1.1), flank = .35 + .65 * Math.abs(Math.sin(phi));
    if (Math.sin(theta * 11 + .7 * Math.sin(phi * 2)) > .2) out.lerp(stripe, fade * flank * .9);
    return out;
  };
  const materials = [], shell = new THREE.Group(); shell.name = 'Nautilus shell';
  const v = new THREE.Vector3(), c = new THREE.Color();
  const span = (thetaMax - visibleFrom) / chambers, bounds = [thetaMin, ...Array.from({ length: chambers + 1 }, (_, n) => visibleFrom + n * span)];
  for (let n = 0; n < bounds.length - 1; n++) {
    const from = bounds[n], to = bounds[n + 1], rows = Math.max(4, Math.round(steps * (to - from) / (thetaMax - thetaMin)));
    const positions = [], colors = [], index = [];
    for (let i = 0; i <= rows; i++) {
      const theta = from + (to - from) * i / rows, suture = i === 0 || i === rows ? .82 : 1;
      for (let j = 0; j <= around; j++) {
        const phi = j / around * TAU;
        point(theta, phi, v); positions.push(v.x, v.y, v.z);
        colorAt(theta, phi, c).multiplyScalar(suture); colors.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < around; j++) {
      const a = i * (around + 1) + j, d = a + around + 1;
      index.push(a, d, a + 1, a + 1, d, d + 1);
    }
    let geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(index); geometry.computeVertexNormals();
    // The last septum closes the shell a little inside the aperture: pearl, and it lights with the last chamber.
    if (n === bounds.length - 2) {
      const theta = thetaMax - .45, r = R(theta), u = new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0);
      const tangent = new THREE.Vector3(b * Math.cos(theta) - Math.sin(theta), b * Math.sin(theta) + Math.cos(theta), 0).normalize();
      const septum = new THREE.CircleGeometry(1, 24);
      septum.applyMatrix4(new THREE.Matrix4().makeBasis(u.clone().multiplyScalar(r * K(theta) * .97), new THREE.Vector3(0, 0, r * W(theta) * .97), tangent).setPosition(u.multiplyScalar(r)));
      const sc = new Float32Array(septum.getAttribute('position').count * 3);
      for (let i = 0; i < sc.length; i += 3) sc.set([nacre.r, nacre.g, nacre.b], i);
      septum.setAttribute('color', new THREE.BufferAttribute(sc, 3)); septum.deleteAttribute('uv');
      const plain = geometry.toNonIndexed(), flat = septum.toNonIndexed();
      geometry.dispose(); septum.dispose();
      geometry = mergeGeometries([plain, flat], false); plain.dispose(); flat.dispose();
    }
    const material = standard({ roughness: .6, side: THREE.DoubleSide, emissive: '#ffcf7a', emissiveIntensity: 0, name: n ? `nautilus chamber ${n}` : 'nautilus core' });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = n ? `Nautilus chamber ${n}` : 'Nautilus core';
    shell.add(mesh); materials.push(material);
  }
  // Spiral facing +x (towards the approach), turned so the aperture rests down and forward on the sand, leaning back a touch.
  const spin = new THREE.Group(); spin.rotation.z = -Math.PI / 2 - thetaMax + .55; spin.add(shell);
  const holder = new THREE.Group(); holder.rotation.set(0, Math.PI / 2, .1, 'ZYX'); holder.add(spin);
  holder.position.set(x, 0, z); root.add(holder);
  holder.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(holder);
  let low = Infinity;
  for (const [dx, dz] of [[0, 0], [0, diameter * .35], [0, -diameter * .35], [.4, 0], [-.4, 0]]) low = Math.min(low, floorAt(x + dx, z + dz));
  holder.position.y = low - .16 - box.min.y;
  holder.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(holder);
  const focus = box.clone(), center = focus.getCenter(new THREE.Vector3());
  const ax = center.x + 5.8, az = center.z;
  const approach = new THREE.Vector3(ax, Math.max(floorAt(ax, az) + 2.6, center.y + .4), az);
  const size = box.getSize(new THREE.Vector3());
  const solids = [new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(size.x * .8, size.y * .82, size.z * .82))];

  let now = 0, openedAt = -100, open = false, closedAt = -100;
  const levels = materials.map(() => 0);
  return {
    root, focus, approach, solids,
    reveal(isOpen, motion = true) {
      if (isOpen) { open = true; openedAt = motion ? now : now - 10; return motion ? 1.1 : 0; }
      open = false; closedAt = now; return true;
    },
    update(step, elapsed, eye) {
      now = elapsed;
      const closeness = near(eye, center, 4, 11);
      for (let n = 0; n < materials.length; n++) {
        // The core lights with the first chamber.
        const order = Math.max(0, n - 1);
        let target = closeness * .1 * (.5 + .5 * Math.sin(elapsed * 1.2 - order * .6));
        if (open) {
          const t = elapsed - openedAt - order * .08;
          // Each chamber flares as the light reaches it, then settles to a steady glow while the records are open.
          target = Math.max(target, easeOut(t / .3) * (.62 + .38 * Math.exp(-Math.max(0, t - .3) * 3)));
        }
        const rate = open ? 14 : 3;
        levels[n] += (target - levels[n]) * (step > 0 ? 1 - Math.exp(-step * rate) : 1);
        materials[n].emissiveIntensity = levels[n];
      }
    }
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Résumé: a descent line from a surface buoy (with a diver-down flag) to a block on the deep sand, and at safety-stop
// depth a dive slate clipped to it, turning slowly about the line. Reveal: the slate swings round to face the diver
// and its writing lights. The buoy is returned separately (`surface`): the landmarks are hidden above water, the buoy
// is not.
function slateTextures(lines) {
  if (typeof document === 'undefined') return {};
  const draw = (ink, paper) => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
    const g = canvas.getContext('2d');
    g.fillStyle = paper; g.fillRect(0, 0, 512, 384);
    if (ink !== '#000000') { g.strokeStyle = 'rgba(60,80,90,.12)'; g.lineWidth = 2; for (let y = 120; y < 370; y += 44) { g.beginPath(); g.moveTo(28, y); g.lineTo(484, y); g.stroke(); } }
    g.fillStyle = ink; g.textAlign = 'center';
    // Each line at its size, or smaller where it would run off the slate.
    const write = (text, weight, size, y) => { let px = size; do g.font = `${weight} ${px}px Outfit, Montserrat, system-ui, sans-serif`; while (g.measureText(text).width > 464 && --px > 12); g.fillText(text, 256, y); };
    write(lines[0], 700, 72, 98); write(lines[1], 600, 32, 168); write(lines[2], 500, 28, 222); write(lines[3], 500, 26, 300);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    return texture;
  };
  // Lit, the board glows and the writing stays dark on it: backlit, so it reads better, not worse.
  return { map: draw('#24323a', '#f3f1e8'), glow: draw('#000000', '#ffffff') };
}

export function buildDescentLine({ x, z, floorAt, economy = false, depth = 7.5 }) {
  const root = new THREE.Group(); root.name = 'resume placement wrapper';
  const surface = new THREE.Group(); surface.name = 'Descent line buoy';
  const gear = standard({ roughness: .7, name: 'line and block' });
  const floor = floorAt(x, z), foot = new THREE.Vector3(x + .3, floor + .34, z + .25), head = new THREE.Vector3(x, -.55, z);
  const lineAt = y => head.clone().lerp(foot, (head.y - y) / (head.y - foot.y));
  const kit = new Kit();
  rod(kit, gear, head.toArray(), foot.toArray(), .016, .016, { color: '#ece6d4' }, 5);
  kit.add(gear, new THREE.BoxGeometry(.55, .36, .55), { at: [foot.x, floor + .14, foot.z], turn: [0, .4, 0], color: '#8b9192' });
  kit.add(gear, new THREE.TorusGeometry(.09, .02, 5, 12), { at: [foot.x, floor + .36, foot.z], turn: [0, .4, 0], color: '#596066' });
  kit.meshes('Descent line', root);

  // The slate: clipped to the line, hanging a little off it so it can turn about it, writing on the face towards +x
  // when the pivot is unturned.
  const content = PORTFOLIO_CONTENT.resume?.entries?.[0] || {};
  const role = (content.tag || '').replace(/^Resume\s*·\s*/i, '') || 'Résumé';
  const textures = slateTextures(['RÉSUMÉ', role, `One page · ${content.format || 'PDF'} · ${content.issued || ''}`.replace(/ · $/, ''), 'Read it here, take it with you']);
  const clip = lineAt(-depth + .55);
  const pivot = new THREE.Group(); pivot.name = 'Dive slate'; pivot.position.copy(clip); root.add(pivot);
  const slateKit = new Kit(), body = standard({ roughness: .6, name: 'slate' });
  slateKit.add(body, new THREE.TorusGeometry(.05, .012, 5, 12), { at: [0, 0, 0], turn: [0, Math.PI / 2, 0], color: '#9aa3a8' });
  rod(slateKit, body, [0, -.03, 0], [.34, -.16, 0], .006, .006, { color: '#2f2f2f' }, 4);
  slateKit.add(body, new THREE.BoxGeometry(.03, .5, .68), { at: [.36, -.44, 0], color: '#f1efe6', paint: (v, c) => v.x < .355 ? c.multiplyScalar(.92) : c });
  slateKit.add(body, new THREE.BoxGeometry(.034, .06, .7), { at: [.36, -.17, 0], color: '#2b3a44' });
  rod(slateKit, body, [.38, -.68, -.3], [.4, -.88, -.26], .01, .008, { color: '#f2c230' }, 6);
  rod(slateKit, body, [.37, -.66, -.31], [.38, -.69, -.3], .003, .003, { color: '#2f2f2f' }, 3);
  slateKit.meshes('Dive slate', pivot);
  const face = new THREE.MeshStandardMaterial({ name: 'slate writing', color: '#ffffff', roughness: .6, map: textures.map || null, emissive: '#fff1d6', emissiveMap: textures.glow || null, emissiveIntensity: 0 });
  const writing = new THREE.Mesh(new THREE.PlaneGeometry(.64, .46), face); writing.name = 'Slate writing';
  writing.position.set(.377, -.47, 0); writing.rotation.y = Math.PI / 2; pivot.add(writing);

  // The buoy and its flag, riding the waves.
  const buoyKit = new Kit(), buoyMaterial = standard({ roughness: .55, name: 'buoy' });
  buoyKit.add(buoyMaterial, new THREE.SphereGeometry(.34, 18, 12), { color: '#e8553a' });
  buoyKit.add(buoyMaterial, new THREE.TorusGeometry(.335, .04, 6, 28), { turn: [Math.PI / 2, 0, 0], color: '#f4f1e8' });
  rod(buoyKit, buoyMaterial, [0, .3, 0], [0, 1.45, 0], .02, .016, { color: '#d9d4c4' }, 6);
  buoyKit.add(buoyMaterial, new THREE.BoxGeometry(.012, .36, .54), { at: [0, 1.24, .29], color: '#d8322b' });
  buoyKit.add(buoyMaterial, new THREE.BoxGeometry(.016, .075, .66), { at: [0, 1.24, .29], turn: [Math.atan2(.36, .54), 0, 0], color: '#f6f3ea' });
  rod(buoyKit, buoyMaterial, [0, -.3, 0], [0, -1.05, 0], .018, .018, { color: '#ece6d4' }, 5);
  buoyKit.meshes('Surface buoy', surface);
  surface.position.set(x, 0, z);

  const focus = new THREE.Box3().setFromCenterAndSize(clip.clone().add(new THREE.Vector3(.36, -.44, 0)), new THREE.Vector3(.4, .6, .8));
  const center = focus.getCenter(new THREE.Vector3());
  const approach = new THREE.Vector3(center.x + 2.8, center.y, center.z);
  const solids = [new THREE.Box3(new THREE.Vector3(foot.x - .3, floor - .1, foot.z - .3), new THREE.Vector3(foot.x + .3, floor + .34, foot.z + .3))];

  let now = 0, open = false, turnedAt = -100, releasedAt = -100, from = 0, to = 0, glow = 0, yaw = 0, seen = false;
  const lastEye = new THREE.Vector3();
  const drift = t => .55 * Math.sin(t * .31) + .25 * Math.sin(t * .13 + 1.3);
  const toward = new THREE.Vector3();
  return {
    root, surface, focus, approach, solids,
    reveal(isOpen, motion = true, eye = null) {
      open = isOpen;
      if (!isOpen) { releasedAt = now; from = yaw; return true; }
      // Towards the diver (as last seen by update), or straight out along the approach lane.
      const target = eye ? toward.copy(eye).sub(clip) : seen ? toward.copy(lastEye).sub(clip) : toward.set(1, 0, 0);
      const goal = Math.atan2(-target.z, target.x);
      from = yaw; to = from + Math.atan2(Math.sin(goal - from), Math.cos(goal - from));
      turnedAt = motion ? now : now - 10;
      return motion ? .8 : 0;
    },
    update(step, elapsed, eye) {
      now = elapsed;
      if (eye) { lastEye.copy(eye); seen = true; }
      if (open) yaw = from + (to - from) * easeOut((elapsed - turnedAt) / .6);
      else yaw = drift(elapsed) + (from - drift(elapsed)) * (1 - smooth((elapsed - releasedAt) / 1.6));
      if (!open && elapsed - releasedAt > 1.6) from = yaw;
      pivot.rotation.set(Math.sin(elapsed * .7) * .03, yaw, Math.sin(elapsed * .53) * .04);
      const target = open ? .55 : near(eye, center, 2, 7) * .12;
      glow += (target - glow) * (step > 0 ? 1 - Math.exp(-step * (open ? 5 : 2.5)) : 1);
      face.emissiveIntensity = glow;
    },
    updateSurface(elapsed) {
      const h = waveHeight(x, z, elapsed), hx = waveHeight(x + .6, z, elapsed) - waveHeight(x - .6, z, elapsed), hz = waveHeight(x, z + .6, elapsed) - waveHeight(x, z - .6, elapsed);
      surface.position.y = h + .08;
      surface.rotation.set(hz * .7, 0, -hx * .7);
    },
    dispose() { textures.map?.dispose(); textures.glow?.dispose(); }
  };
}
