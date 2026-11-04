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
// The coral-restoration nursery: a feature of the reef of its own, not a portfolio site. Three PVC "trees" float on
// tethers over concrete blocks, coral fragments hanging from their arms on monofilament (the big tree's six larger,
// brighter ones are the projects'), a fragment table and broken branches beside them, and a small school of chromis.
// When a diver swims up, a pulse of current sways the trees (the fragments lag behind on their lines) and the fish
// dart out, then drift back; reveal() plays the same pulse.
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
  const root = new THREE.Group(); root.name = 'nursery placement wrapper';
  const random = seededRandom(5303);
  const trees = [
    { x, z, scale: 1, levels: 5, projects, delay: 0, amplitude: .2 },
    // The two small trees and the table stand east of the big one, on the open sand (a coral carpet lies to the west).
    { x: x + 3.4, z: z + 2.7, scale: .78, levels: 3, projects: 0, delay: .18, amplitude: .16 },
    { x: x + 2.5, z: z - 3.3, scale: .7, levels: 3, projects: 0, delay: .32, amplitude: .15 }
  ].map((spec, index) => {
    const { material, uSwing } = swingMaterial();
    const tree = nurseryTree({ ...spec, floorAt, random, economy, frame: root, fragmentMaterial: material });
    return { ...spec, ...tree, material, uSwing, phase: index * 1.7 };
  });
  const main = trees[0];

  // The fragment table (its smallest pieces grow here) and broken branches on the sand.
  { const ground = new Kit(), pipe = standard({ roughness: .7, name: 'nursery table' });
    const tx = x + 5.8, tz = z + .3, top = floorAt(tx, tz) + .72;
    for (const [dx, dz] of [[-.8, -.45], [.8, -.45], [-.8, .45], [.8, .45]]) { const lx = tx + dx, lz = tz + dz; rod(ground, pipe, [lx, floorAt(lx, lz) - .05, lz], [lx, top, lz], .028, .028, { color: '#e6eae0' }, 6); }
    for (const dz of [-.45, -.15, .15, .45]) rod(ground, pipe, [tx - .85, top, tz + dz], [tx + .85, top, tz + dz], .028, .028, { color: '#e6eae0' }, 6);
    for (const dx of [-.8, .8]) rod(ground, pipe, [tx + dx, top, tz - .5], [tx + dx, top, tz + .5], .028, .028, { color: '#e6eae0' }, 6);
    const tips = ['#c58cff', '#ffd36a', '#ff8fb0', '#7fe0b0', '#d8c39a', '#e6c9a0'];
    for (let i = 0; i < 14; i++) {
      const px = tx - .65 + (i % 7) * .22, pz = tz + (i < 7 ? -.15 : .15), h = .16 + random() * .12;
      ground.add(pipe, new THREE.ConeGeometry(.035, h, 5), { at: [px, top + h / 2 + .03, pz], turn: [(random() - .5) * .4, random() * TAU, (random() - .5) * .4], color: tips[i % tips.length] });
    }
    for (let i = 0, n = economy ? 22 : 36; i < n; i++) {
      const angle = random() * TAU, radius = 1.4 + Math.pow(random(), .8) * 2.2, px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius, len = .18 + random() * .25;
      ground.add(pipe, new THREE.CylinderGeometry(.02, .035, len, 5), { at: [px, floorAt(px, pz) + .03, pz], turn: [Math.PI / 2 + (random() - .5) * .3, random() * TAU, 0], color: random() < .3 ? '#d6c8aa' : '#ede7d6' });
    }
    ground.meshes('Nursery table and rubble', root); }

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
      // A diver swimming up brings a pulse of current with them (not more often than every 14 s).
      if (eye && near_ < 8 && now - pulseAt > 14) pulseAt = now;
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
export function buildNautilus({ x, z, floorAt, economy = false, diameter = 3.3 }) {
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
  // Lying on its side as an empty shell rests, the spiral tipped up 24 degrees towards the approach (+x), the aperture
  // turned to the side so its pearl septum shows.
  const spin = new THREE.Group(); spin.rotation.z = -thetaMax - .9; spin.add(shell);
  const holder = new THREE.Group(); holder.rotation.set(-Math.PI / 2, 0, -.42, 'ZYX'); holder.add(spin);
  holder.position.set(x, 0, z); root.add(holder);
  holder.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(holder);
  let low = Infinity;
  for (const [dx, dz] of [[0, 0], [0, diameter * .35], [0, -diameter * .35], [diameter * .35, 0], [-diameter * .35, 0]]) low = Math.min(low, floorAt(x + dx, z + dz));
  holder.position.y = low - .16 - box.min.y;
  holder.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(holder);
  const focus = box.clone(), center = focus.getCenter(new THREE.Vector3());
  const ax = center.x + 6.2, az = center.z;
  const approach = new THREE.Vector3(ax, Math.max(floorAt(ax, az) + 3, center.y + 1.6), az);
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
  // What grows on a line left in the water: algae in the light near the top, sponges, hydroids and small corals lower down.
  { const random = seededRandom(611), algae = ['#6f9a4a', '#8a7a3a', '#5e8a52'], lower = ['#e07b4a', '#b86bc8', '#e8c35a', '#f2f0e6', '#6fc7b0'];
    for (let i = 0, count = economy ? 46 : 80; i < count; i++) {
      const y = head.y - Math.pow(random(), 1.3) * (head.y - foot.y - .6), p = lineAt(y), angle = random() * TAU;
      if (y > -16) for (let b = 0; b < 3; b++) {
        const a = angle + b * 2.1, len = .14 + random() * .22, dir = new THREE.Vector3(Math.cos(a), -.5 - random() * .6, Math.sin(a)).normalize();
        rod(kit, gear, p.toArray(), p.clone().addScaledVector(dir, len).toArray(), .012, .003, { color: algae[(i + b) % 3] }, 3);
      }
      else if (random() < .55) { const size = .05 + random() * .09; kit.add(gear, new THREE.SphereGeometry(1, 6, 4), { at: [p.x + Math.cos(angle) * .03, y, p.z + Math.sin(angle) * .03], size: [size, size * .8, size], color: lower[i % lower.length] }); }
      else { const len = .12 + random() * .18, dir = new THREE.Vector3(Math.cos(angle), .4 + random() * .5, Math.sin(angle)).normalize(); rod(kit, gear, p.toArray(), p.clone().addScaledVector(dir, len).toArray(), .02, .006, { color: lower[(i + 2) % lower.length] }, 5); }
    } }
  // Spare tanks for divers, clipped to the line just above the slate (safety-stop gas), each with its regulator.
  for (const [side, color, band] of [[-1, '#b9c0c4', '#e5c33a'], [1, '#e5c33a', '#2b3a44']]) {
    const top = lineAt(-depth + 2.4).add(new THREE.Vector3(-.12, 0, side * .26)), height = .82, radius = .115, cx = top.x, cz = top.z, ty = top.y - .14;
    rod(kit, gear, lineAt(-depth + 2.5).toArray(), [cx, ty + .06, cz], .006, .006, { color: '#2f2f2f' }, 3);
    kit.add(gear, new THREE.CylinderGeometry(radius, radius, height, 14), { at: [cx, ty - .12 - height / 2, cz], color });
    kit.add(gear, new THREE.SphereGeometry(radius, 14, 7, 0, TAU, 0, Math.PI / 2), { at: [cx, ty - .12, cz], color });
    kit.add(gear, new THREE.SphereGeometry(radius, 14, 7, 0, TAU, Math.PI / 2, Math.PI / 2), { at: [cx, ty - .12 - height, cz], color });
    kit.add(gear, new THREE.CylinderGeometry(radius * 1.01, radius * 1.01, .06, 14), { at: [cx, ty - .3, cz], color: band });
    kit.add(gear, new THREE.CylinderGeometry(.03, .03, .1, 8), { at: [cx, ty - .05, cz], color: '#c9ccce' });
    kit.add(gear, new THREE.BoxGeometry(.07, .06, .1), { at: [cx, ty, cz], color: '#3a3d40' });
    kit.add(gear, new THREE.TorusGeometry(.12, .012, 5, 14, Math.PI * 1.3), { at: [cx - .02, ty - .14, cz + side * .06], turn: [0, Math.PI / 2, -.5], color: '#1f2326' });
    kit.add(gear, new THREE.BoxGeometry(.08, .1, .06), { at: [cx - .02, ty - .34, cz + side * .14], color: '#1f2326' });
  }
  kit.meshes('Descent line', root);

  // A school of fusiliers that has made the line its own, circling it around the stop.
  const schoolKit = new Kit(), schoolMaterial = standard({ roughness: .55, name: 'line fusiliers' });
  const fusiliers = new THREE.InstancedMesh(fishGeometry(schoolKit, schoolMaterial, { length: .1, depth: .035, width: .018, body: '#5d8fd6', belly: '#e8eef5', back: '#2f5d9a', tail: '#f2c94c' }), schoolMaterial, economy ? 12 : 20);
  fusiliers.name = 'Line fusiliers'; fusiliers.frustumCulled = false;
  const lineFish = [], schoolRandom = seededRandom(733);
  for (let i = 0; i < fusiliers.count; i++) lineFish.push({ radius: 1.1 + schoolRandom() * 1.6, y: -depth - 1 + schoolRandom() * 4.5, speed: .35 + schoolRandom() * .15, phase: schoolRandom() * TAU });
  const fishDummy = new THREE.Object3D();

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
    root, surface, free: [fusiliers], focus, approach, solids,
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
      if (eye && eye.distanceTo(center) > 50) return;
      for (let i = 0; i < lineFish.length; i++) {
        const f = lineFish[i], a = f.phase + elapsed * f.speed, at = lineAt(f.y);
        fishDummy.position.set(at.x + Math.cos(a) * f.radius, f.y + Math.sin(elapsed * .5 + i) * .2, at.z + Math.sin(a) * f.radius);
        // Swimming round the line: heading along the circle's tangent.
        fishDummy.rotation.set(0, -a - Math.PI / 2 + Math.sin(elapsed * 9 + i) * .08, 0); fishDummy.updateMatrix();
        fusiliers.setMatrixAt(i, fishDummy.matrix);
      }
      fusiliers.instanceMatrix.needsUpdate = true;
    },
    updateSurface(elapsed) {
      const h = waveHeight(x, z, elapsed), hx = waveHeight(x + .6, z, elapsed) - waveHeight(x - .6, z, elapsed), hz = waveHeight(x, z + .6, elapsed) - waveHeight(x, z - .6, elapsed);
      surface.position.y = h + .08;
      surface.rotation.set(hz * .7, 0, -hx * .7);
    },
    dispose() { textures.map?.dispose(); textures.glow?.dispose(); }
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Projects: a modern steel trawler, 16 m long, sunk on the mid-depth sand, heeled over so its working deck faces the
// approach. A breach is torn in its high side, and the fish hold's hatch stands open: a school of glassy sweepers lives
// in the hold, a few cardinalfish in the wheelhouse. Reveal: the wheelhouse lights flicker on and the sweepers pour up
// out of the hatch, swirl, and settle back in.
function fishGeometry(kit, material, { length = .07, depth = .045, width = .018, body = '#c98a4b', belly = '#efd2a8', back = '#8a5a30', tail = '#b77a40' } = {}) {
  kit.add(material, new THREE.SphereGeometry(1, 8, 6), { size: [length, depth, width], color: body,
    paint: (v, c) => v.y < -depth * .2 ? c.lerp(new THREE.Color(belly), .6) : v.y > depth * .45 ? c.lerp(new THREE.Color(back), .5) : c });
  const t = new THREE.BufferGeometry();
  t.setAttribute('position', new THREE.Float32BufferAttribute([-length * .85, 0, 0, -length * 1.55, depth * .8, 0, -length * 1.55, -depth * .8, 0, -length * .85, 0, 0, -length * 1.55, -depth * .8, 0, -length * 1.55, depth * .8, 0], 3));
  kit.add(material, t, { color: tail });
  return kit.geometry(material);
}

export function buildFishingBoat({ x, z, floorAt, economy = false }) {
  const root = new THREE.Group(); root.name = 'projects placement wrapper';
  const boat = new THREE.Group(); boat.name = 'Sunken trawler'; root.add(boat);
  const random = seededRandom(9127);
  const L = 16, B = 5.4, BULWARK = .9, stations = economy ? 20 : 30;
  const half = s => B / 2 * (s < .35 ? .82 + .18 * smooth(s / .35) : s < .6 ? 1 : Math.pow(Math.max(0, Math.cos((s - .6) / .4 * Math.PI / 2)), .75));
  const deckAt = s => 2.8 + .6 * smooth((s - .55) / .45);
  const keelAt = s => .3 * (1 - smooth(s / .2)) + 1.3 * smooth((s - .82) / .18);
  const xAt = s => -L / 2 + s * L;
  // The section from the keel up to the deck edge, as [breadth, height] fractions; then the bulwark's top.
  const profile = [[0, 0], [.32, .08], [.72, .3], [.93, .62], [1, .9], [1.01, 1]];
  const P = profile.length + 1, ring = 2 * P - 1;
  const point = (s, j, side) => {
    const b = half(s), d = deckAt(s), k0 = keelAt(s);
    const [zf, yf] = j < P - 1 ? profile[j] : [1.03, null];
    const y = j < P - 1 ? k0 + yf * (d - k0) : d + BULWARK;
    const rake = 1.4 * smooth((s - .75) / .25) * (y - k0) / (d + BULWARK - k0);
    return new THREE.Vector3(xAt(s) + rake, y, side * zf * b);
  };
  const ringPoint = (s, k) => k < P - 1 ? point(s, P - 1 - k, -1) : point(s, k - (P - 1), 1);

  // Hull: outside painted (navy topsides, a white boot stripe, red antifouling, rust runs and growth); inside dark.
  const navy = new THREE.Color('#46667a'), red = new THREE.Color('#9a4434'), white = new THREE.Color('#cfd2cc'), rust = new THREE.Color('#7a4a2a'), growth = new THREE.Color('#4d5a3c');
  const hullPaint = (p, s) => {
    const d = deckAt(s), k0 = keelAt(s), f = (p.y - k0) / (d - k0), c = new THREE.Color();
    c.copy(f < .42 ? red : f > .78 && f < .86 ? white : navy);
    if (Math.sin(p.x * 3.1 + 1.3) > .82 && f > .45) c.lerp(rust, .55 * smooth((f - .45) / .5));
    const n = Math.sin(p.x * 1.7 + p.y * 2.3) * Math.cos(p.z * 2.1 - p.x * .9);
    if (n > .2) c.lerp(growth, (n - .2) * .7);
    return c;
  };
  const positions = [], colors = [], index = [];
  for (let i = 0; i <= stations; i++) for (let k = 0; k < ring; k++) {
    const s = i / stations, p = ringPoint(s, k), c = hullPaint(p, s);
    positions.push(p.x, p.y, p.z); colors.push(c.r, c.g, c.b);
  }
  const at = (i, k) => i * ring + k, va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), n = new THREE.Vector3(), out = new THREE.Vector3();
  const vertex = (i, v) => v.fromArray(positions, i * 3);
  // A triangle, wound to face away from the hull's long axis (outward).
  const tri = (a, b, c) => {
    vertex(a, va); vertex(b, vb); vertex(c, vc);
    n.subVectors(vb, va).cross(vc.clone().sub(va));
    const cx = (va.x + vb.x + vc.x) / 3, s = clamp01((cx + L / 2) / L), axisY = keelAt(s) + .55 * (deckAt(s) - keelAt(s));
    out.set(0, (va.y + vb.y + vc.y) / 3 - axisY, (va.z + vb.z + vc.z) / 3);
    if (n.dot(out) < 0) index.push(a, c, b); else index.push(a, b, c);
  };
  // The breach: a ragged hole in the port (high) side, abreast of the hold.
  const breached = (s, k) => {
    if (k >= P - 1) return false;
    const j = P - 1 - k, f = j / (P - 1), ds = (s - .37) / .075, df = (f - .62) / .26;
    return ds * ds + df * df < 1 + .35 * Math.sin(s * 90 + f * 23);
  };
  for (let i = 0; i < stations; i++) for (let k = 0; k < ring - 1; k++) {
    if (breached((i + .5) / stations, k)) continue;
    tri(at(i, k), at(i + 1, k), at(i, k + 1)); tri(at(i + 1, k), at(i + 1, k + 1), at(i, k + 1));
  }
  // The transom: closed across the stern.
  { const start = positions.length / 3, k0 = keelAt(0), d = deckAt(0);
    positions.push(xAt(0), (k0 + d) / 2, 0); colors.push(navy.r, navy.g, navy.b);
    for (let k = 0; k < ring - 1; k++) {
      vertex(at(0, k), va); vertex(at(0, k + 1), vb); vertex(start, vc);
      n.subVectors(vb, va).cross(vc.clone().sub(va));
      if (n.x > 0) index.push(at(0, k + 1), at(0, k), start); else index.push(at(0, k), at(0, k + 1), start);
    } }
  const hullGeometry = new THREE.BufferGeometry();
  hullGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hullGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  hullGeometry.setIndex(index); hullGeometry.computeVertexNormals();
  const outside = new THREE.Mesh(hullGeometry, standard({ roughness: .8, name: 'trawler hull' })); outside.name = 'Trawler hull';
  const insideColors = new Float32Array(colors.length); for (let i = 0; i < insideColors.length; i += 3) insideColors.set([.23, .2, .18], i);
  const insideGeometry = hullGeometry.clone(); insideGeometry.setAttribute('color', new THREE.BufferAttribute(insideColors, 3));
  const inside = new THREE.Mesh(insideGeometry, standard({ roughness: .95, side: THREE.BackSide, name: 'trawler hull inside' })); inside.name = 'Trawler hull inside';
  boat.add(outside, inside);

  // The deck (with the hold's hatch open), the wheelhouse, gantry, net drum, mast and an outrigger, and the growth on them.
  const steel = standard({ roughness: .75, side: THREE.DoubleSide, name: 'trawler steel' });
  const glass = new THREE.MeshStandardMaterial({ name: 'wheelhouse windows', color: '#1b2f38', roughness: .3, emissive: '#ffd27a', emissiveIntensity: 0, side: THREE.DoubleSide });
  const kit = new Kit(), windows = new Kit();
  const hatch = { s0: .2, s1: .34, z: 1.1 };
  { const dp = [], dc = [], di = [], columns = 8, deckColor = new THREE.Color('#59654f'), last = stations - 2;
    for (let i = 0; i <= last; i++) for (let c = 0; c <= columns; c++) {
      const s = i / stations, b = half(s) * 1.0, zc = -b + 2 * b * c / columns, col = deckColor.clone();
      if (Math.sin(xAt(s) * 2.3 + zc * 3.1) > .6) col.lerp(rust, .4);
      dp.push(xAt(s), deckAt(s), zc); dc.push(col.r, col.g, col.b);
    }
    for (let i = 0; i < last; i++) for (let c = 0; c < columns; c++) {
      const s = (i + .5) / stations, b = half(s), zc = -b + 2 * b * (c + .5) / columns;
      if (s > hatch.s0 && s < hatch.s1 && Math.abs(zc) < hatch.z) continue;
      const a = i * (columns + 1) + c; di.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2);
    }
    const deck = new THREE.BufferGeometry();
    deck.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); deck.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3));
    deck.setIndex(di); deck.computeVertexNormals();
    const mesh = new THREE.Mesh(deck, steel); mesh.name = 'Trawler deck'; boat.add(mesh); }
  // Hatch coaming and its cover, thrown aside.
  { const x0 = xAt(hatch.s0), x1 = xAt(hatch.s1), y = deckAt(.27) + .22, len = x1 - x0, color = '#6f7468';
    kit.add(steel, new THREE.BoxGeometry(len + .1, .45, .1), { at: [(x0 + x1) / 2, y, hatch.z], color });
    kit.add(steel, new THREE.BoxGeometry(len + .1, .45, .1), { at: [(x0 + x1) / 2, y, -hatch.z], color });
    kit.add(steel, new THREE.BoxGeometry(.1, .45, hatch.z * 2), { at: [x0, y, 0], color });
    kit.add(steel, new THREE.BoxGeometry(.1, .45, hatch.z * 2), { at: [x1, y, 0], color });
    kit.add(steel, new THREE.BoxGeometry(len * .9, .08, hatch.z * 1.8), { at: [x1 + 1.3, deckAt(.4) + .35, -1.2], turn: [.5, .3, .12], color: '#5e6458' }); }
  // Wheelhouse: walls with a window band, a doorway on the port side, one front pane gone; a console inside; the roof.
  const w = { x0: xAt(.55), x1: xAt(.75), base: deckAt(.65), height: 2.3, half: 1.6 }, white2 = '#d5d3c8';
  { const { x0, x1, base, height, half: hz } = w, len = x1 - x0, mid = (x0 + x1) / 2;
    const fade = (v, c) => c.lerp(rust, clamp01(Math.sin(v.x * 4 + v.y * 6) - .55) * .8);
    kit.add(steel, new THREE.BoxGeometry(.1, height, hz * 2), { at: [x0, base + height / 2, 0], color: white2, paint: fade });
    kit.add(steel, new THREE.BoxGeometry(.1, 1.15, hz * 2), { at: [x1, base + .575, 0], color: white2, paint: fade });
    kit.add(steel, new THREE.BoxGeometry(.1, .3, hz * 2), { at: [x1, base + height - .15, 0], color: white2 });
    for (const pz of [-hz, -hz / 3, hz / 3, hz]) kit.add(steel, new THREE.BoxGeometry(.12, height - 1.45, .1), { at: [x1, base + 1.15 + (height - 1.45) / 2, pz], color: white2 });
    for (const [pz, broken] of [[-hz * 2 / 3, false], [0, true], [hz * 2 / 3, false]]) if (!broken)
      windows.add(glass, new THREE.PlaneGeometry(hz * 2 / 3 - .1, height - 1.5), { at: [x1 + .02, base + 1.15 + (height - 1.45) / 2, pz], turn: [0, Math.PI / 2, 0] });
    // Starboard wall, whole, with two side windows; port wall with a doorway.
    kit.add(steel, new THREE.BoxGeometry(len, 1.15, .1), { at: [mid, base + .575, hz], color: white2, paint: fade });
    kit.add(steel, new THREE.BoxGeometry(len, .3, .1), { at: [mid, base + height - .15, hz], color: white2 });
    for (const px of [x0, mid, x1]) kit.add(steel, new THREE.BoxGeometry(.1, height - 1.45, .1), { at: [px, base + 1.15 + (height - 1.45) / 2, hz], color: white2 });
    for (const px of [(x0 + mid) / 2, (mid + x1) / 2]) windows.add(glass, new THREE.PlaneGeometry(len / 2 - .12, height - 1.5), { at: [px, base + 1.15 + (height - 1.45) / 2, hz + .02] });
    kit.add(steel, new THREE.BoxGeometry(len * .55, height, .1), { at: [x1 - len * .275, base + height / 2, -hz], color: white2, paint: fade });
    kit.add(steel, new THREE.BoxGeometry(len * .2, height, .1), { at: [x0 + len * .1, base + height / 2, -hz], color: white2, paint: fade });
    kit.add(steel, new THREE.BoxGeometry(len + .4, .14, hz * 2 + .4), { at: [mid, base + height + .07, 0], color: '#c9c7bb', paint: (v, c) => c.lerp(growth, clamp01(Math.sin(v.x * 3 + v.z * 2) * .5 + .2)) });
    kit.add(steel, new THREE.BoxGeometry(.6, .9, 1.6), { at: [x1 - .45, base + .45, 0], color: '#3a3d40' });
    // Mast, radar and lights; a whip antenna.
    const mx = x0 + .6, top = base + height + 3.6;
    rod(kit, steel, [mx, base + height, 0], [mx, top, 0], .09, .06, { color: '#bdbdb4' }, 8);
    kit.add(steel, new THREE.BoxGeometry(1.7, .1, .28), { at: [mx, top + .1, 0], turn: [0, .6, 0], color: '#e1e0d8' });
    rod(kit, steel, [mx, top - 1.1, -.7], [mx, top - 1.1, .7], .035, .035, { color: '#bdbdb4' }, 6);
    for (const pz of [-.7, .7]) kit.add(steel, new THREE.SphereGeometry(.09, 8, 6), { at: [mx, top - 1, pz], color: pz < 0 ? '#c0392b' : '#2e8b57' });
    rod(kit, steel, [x1 - .3, base + height, -1.2], [x1 - .5, base + height + 2.6, -1.4], .025, .012, { color: '#d9d7cf' }, 4);
    // One outrigger boom still rigged, drooping off the low (starboard) side.
    rod(kit, steel, [mx, base + height + .4, .3], [mx - 1.2, base + .2, 6.2], .1, .07, { color: '#8a8c86' }, 8); }
  // Stern gantry and the net drum, its net still wound on.
  { const xs = xAt(.04), d = deckAt(.04);
    for (const pz of [-2, 2]) rod(kit, steel, [xs + .3, d, pz], [xs - .2, d + 3.6, pz * .9], .12, .1, { color: '#c46a2c' }, 8);
    rod(kit, steel, [xs - .2, d + 3.6, -1.8], [xs - .2, d + 3.6, 1.8], .12, .12, { color: '#c46a2c' }, 8);
    kit.add(steel, new THREE.BoxGeometry(.4, .5, .3), { at: [xs - .2, d + 3.2, 0], color: '#3a3d40' });
    const xd = xAt(.13), dd = deckAt(.13);
    kit.add(steel, new THREE.CylinderGeometry(.55, .55, 2.3, 16), { at: [xd, dd + .75, 0], turn: [Math.PI / 2, 0, 0], color: '#3f6b4a', paint: (v, c) => c.offsetHSL(0, 0, Math.sin(v.y * 40 + v.x * 30) * .05) });
    for (const pz of [-1.2, 1.2]) kit.add(steel, new THREE.CylinderGeometry(.85, .85, .08, 18), { at: [xd, dd + .75, pz], turn: [Math.PI / 2, 0, 0], color: '#6a6e68' });
    for (const pz of [-1.3, 1.3]) kit.add(steel, new THREE.BoxGeometry(.3, .75, .15), { at: [xd, dd + .37, pz], color: '#5a5e58' }); }
  // Growth: sponges and small corals along the bulwarks, on the wheelhouse roof and the gantry.
  { const tones = ['#e07b4a', '#b86bc8', '#e8c35a', '#6fc7b0', '#f2f0e6', '#d9534f'];
    for (let i = 0, count = economy ? 26 : 44; i < count; i++) {
      const pick = random(), s = .05 + random() * .85, side = random() < .5 ? -1 : 1;
      let p;
      if (pick < .62) p = point(s, P - 1, side).add(new THREE.Vector3(0, .02, 0));
      else if (pick < .85) p = new THREE.Vector3(w.x0 + random() * (w.x1 - w.x0), w.base + w.height + .14, (random() - .5) * 3.2);
      else p = new THREE.Vector3(xAt(.13) + (random() - .5) * .6, deckAt(.13) + 1.3, (random() - .5) * 2);
      const size = .1 + random() * .2, tone = tones[Math.floor(random() * tones.length)];
      if (random() < .5) kit.add(steel, new THREE.SphereGeometry(1, 7, 5), { at: p.toArray(), size: [size, size * .7, size], color: tone });
      else kit.add(steel, new THREE.ConeGeometry(size * .45, size * 1.8, 6), { at: [p.x, p.y + size * .8, p.z], turn: [(random() - .5) * .6, 0, (random() - .5) * .6], color: tone });
    } }
  kit.meshes('Trawler fittings', boat); windows.meshes('Trawler windows', boat);

  // Seat it: bow pitched to the slope, heeled 17 degrees so its deck faces the approach (+x), its keel bedded in the sand.
  // The bow points south and a little west, clear of the sea grass south-east of it. (Turned by yaw, the bow is +x local:
  // world (cos yaw, -sin yaw).)
  const yaw = Math.PI / 2 + .35, bx = Math.cos(yaw) * L / 2, bz = -Math.sin(yaw) * L / 2, fB = floorAt(x + bx, z + bz), fS = floorAt(x - bx, z - bz);
  const pitch = THREE.MathUtils.clamp(Math.atan2(fB - fS, L), -.18, .18);
  boat.rotation.set(.3, yaw, pitch, 'YZX'); boat.position.set(x, 0, z); boat.updateMatrixWorld(true);
  let lift = -Infinity; const sample = new THREE.Vector3();
  for (let i = 0; i <= 8; i++) for (const k of [0, 1, 2, ring - 2, ring - 3, Math.floor(ring / 2)]) {
    sample.copy(ringPoint(i / 8, k)).applyMatrix4(boat.matrixWorld);
    lift = Math.max(lift, floorAt(sample.x, sample.z) - sample.y);
  }
  boat.position.y = lift - .55; boat.updateMatrixWorld(true);

  // The fish: sweepers schooling in the hold, cardinalfish in the wheelhouse. They move in the boat's own frame.
  const fishFrame = new THREE.Group(); fishFrame.name = 'Trawler fish'; fishFrame.matrixAutoUpdate = false; fishFrame.matrix.copy(boat.matrixWorld);
  const fishMaterial = standard({ roughness: .5, name: 'wreck fish' });
  const sweeperCount = economy ? 18 : 30, cardinalCount = economy ? 4 : 6;
  const sweepers = new THREE.InstancedMesh(fishGeometry(new Kit(), fishMaterial), fishMaterial, sweeperCount);
  const cardinals = new THREE.InstancedMesh(fishGeometry(new Kit(), fishMaterial, { length: .055, depth: .03, width: .015, body: '#d6553e', belly: '#f0a58a', back: '#9a3020', tail: '#c4482f' }), fishMaterial, cardinalCount);
  for (const mesh of [sweepers, cardinals]) { mesh.frustumCulled = false; fishFrame.add(mesh); }
  sweepers.name = 'Hold sweepers'; cardinals.name = 'Wheelhouse cardinalfish';
  const holdCenter = new THREE.Vector3((xAt(hatch.s0) + xAt(hatch.s1)) / 2, keelAt(.27) + .5 * (deckAt(.27) - keelAt(.27)), 0);
  const exit = new THREE.Vector3(holdCenter.x, deckAt(.27) + 2.4, -.4);
  const offsets = Array.from({ length: sweeperCount }, () => new THREE.Vector3((random() - .5) * 1.1, (random() - .5) * .55, (random() - .5) * .9));
  const cardinalSpots = Array.from({ length: cardinalCount }, () => ({ at: new THREE.Vector3(w.x0 + .5 + random() * (w.x1 - w.x0 - 1.3), w.base + .9 + random() * .9, (random() - .5) * 2.2), phase: random() * TAU }));
  const school = new THREE.Vector3(), previous = new THREE.Vector3(), heading = new THREE.Vector3(), dummy = new THREE.Object3D(), spot = new THREE.Vector3();

  const focus = new THREE.Box3().setFromObject(boat), center = focus.getCenter(new THREE.Vector3());
  const ax = center.x + 8.5, az = center.z;
  const approach = new THREE.Vector3(ax, Math.max(floorAt(ax, az) + 3.5, center.y + .6), az);
  // Collision: the hull aft of the wheelhouse and the bow with the wheelhouse, as two boxes. Named as the old wreck's
  // were, so the animals still treat the whole wreck as solid (user-creatures.js).
  const worldBox = (x0, x1, y0, y1, zh) => { const box = new THREE.Box3(); for (const cx of [x0, x1]) for (const cy of [y0, y1]) for (const cz of [-zh, zh]) box.expandByPoint(new THREE.Vector3(cx, cy, cz).applyMatrix4(boat.matrixWorld)); return box; };
  const solids = [
    { box: worldBox(-L / 2, w.x0 - .3, .2, deckAt(.3) + .6, B / 2 * .92), name: 'ship stern hull' },
    { box: worldBox(w.x0 - .3, L / 2 - .6, .4, deckAt(.65) + .5, B / 2 * .88), name: 'ship bow hull' },
    { box: worldBox(w.x0, w.x1, w.base, w.base + w.height + .2, w.half + .05), name: 'trawler wheelhouse' }
  ];

  let now = 0, open = false, openedAt = -100, glow = 0, near_ = Infinity;
  return {
    root, free: [fishFrame], focus, approach, solids,
    reveal(isOpen, motion = true) {
      open = isOpen;
      if (!isOpen) return true;
      openedAt = motion ? now : now - 10;
      return motion ? 1 : 0;
    },
    update(step, elapsed, eye) {
      now = elapsed;
      near_ = eye ? eye.distanceTo(center) : 0;
      // The lights: a flicker as they come on, then steady while the records are open.
      const t = elapsed - openedAt;
      const target = open ? (t < .4 ? (Math.sin(t * 70) > -.2 ? 1.2 : .1) : 1.1) : near(eye, center, 6, 16) * .12;
      glow += (target - glow) * (step > 0 ? 1 - Math.exp(-step * (open ? 30 : 2.5)) : 1);
      glass.emissiveIntensity = glow;
      if (near_ > 60) return;
      // The school: milling in the hold, or, after a reveal, up through the hatch and back down.
      const pull = smooth(t / .55) * (1 - smooth((t - 1.4) / 1.8));
      previous.copy(school);
      school.set(holdCenter.x + Math.sin(elapsed * .35) * 1, holdCenter.y + Math.sin(elapsed * .5 + 1) * .25, Math.sin(elapsed * .27 + 2) * .6).lerp(exit, pull);
      heading.subVectors(school, previous);
      const turn = heading.lengthSq() > 1e-8 ? Math.atan2(-heading.z, heading.x) : 0;
      for (let i = 0; i < sweeperCount; i++) {
        const o = offsets[i], spread = 1 + pull * 1.2;
        dummy.position.set(school.x + o.x * spread + Math.sin(elapsed * 1.3 + i) * .06, school.y + o.y * spread, school.z + o.z * spread + Math.cos(elapsed * 1.1 + i * 2) * .06);
        dummy.rotation.set(0, turn + Math.sin(elapsed * 2 + i) * .25, 0); dummy.updateMatrix();
        sweepers.setMatrixAt(i, dummy.matrix);
      }
      sweepers.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < cardinalCount; i++) {
        const c = cardinalSpots[i];
        spot.copy(c.at).add(new THREE.Vector3(Math.sin(elapsed * .4 + c.phase) * .15, Math.sin(elapsed * .6 + c.phase) * .05, 0));
        dummy.position.copy(spot); dummy.rotation.set(0, Math.sin(elapsed * .3 + c.phase) * 1.2, 0); dummy.updateMatrix();
        cardinals.setMatrixAt(i, dummy.matrix);
      }
      cardinals.instanceMatrix.needsUpdate = true;
    }
  };
}
