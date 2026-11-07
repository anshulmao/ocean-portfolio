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
// height (the nursery's fragments swing by it). A kit made withUv keeps each piece's texture coordinates, for the
// textured surfaces (the trawler's fittings, the nautilus's neighbours).
class Kit {
  constructor(withDrop = false, withUv = false) { this.parts = new Map(); this.withDrop = withDrop; this.withUv = withUv; }
  add(material, geometry, { at = [0, 0, 0], turn = [0, 0, 0], quat = null, size = [1, 1, 1], color = '#ffffff', paint = null, matrix = null, drop = null, tile = 1 } = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && !(this.withUv && name === 'uv')) g.deleteAttribute(name);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (this.withUv && !g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    // tile: repeats a tiling texture across a large piece instead of stretching it once over each face.
    if (this.withUv && tile !== 1) { const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * tile, uv.getY(i) * tile); }
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
// Textures painted on a canvas as the page builds the landmarks: nothing is downloaded for them. Without a document
// (the offline tools) they are null and the surfaces keep their vertex colours alone.
function canvasTexture(width, height, paint, { repeat = false } = {}) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
const rgba = (hex, alpha) => { const c = new THREE.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`; };
// A run of rust or dirt down from (x, y): a soft streak, widest and strongest where it starts.
function streak(g, x, y, width, length, hex, alpha) {
  const gradient = g.createLinearGradient(0, y, 0, y + length);
  gradient.addColorStop(0, rgba(hex, alpha)); gradient.addColorStop(.35, rgba(hex, alpha * .6)); gradient.addColorStop(1, rgba(hex, 0));
  g.fillStyle = gradient; g.beginPath(); g.moveTo(x - width / 2, y); g.lineTo(x + width / 2, y); g.lineTo(x + width * .15, y + length); g.lineTo(x - width * .15, y + length); g.fill();
}
function blotch(g, x, y, radius, hex, alpha) {
  const gradient = g.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(hex, alpha)); gradient.addColorStop(1, rgba(hex, 0));
  g.fillStyle = gradient; g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

// Painted steel for every fitting: white, so the vertex colour gives the paint, with rust runs from the top, chips,
// grime settling low and a fine speckle. Tiles.
function grimeTexture(size = 256) {
  return canvasTexture(size, size, (g, w, h) => {
    const random = seededRandom(41);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${.03 + random() * .06})`; g.fillRect(random() * w, random() * h, 1.5, 1.5); }
    for (let i = 0; i < 14; i++) blotch(g, random() * w, random() * h, 20 + random() * 50, '#8a8a7a', .14);
    for (let i = 0; i < 26; i++) streak(g, random() * w, random() * h * .5, 2 + random() * 6, 30 + random() * 140, '#7a4a2a', .3 + random() * .25);
    for (let i = 0; i < 45; i++) { g.fillStyle = rgba(random() < .5 ? '#8a5a3a' : '#5a4a3a', .25 + random() * .3); g.beginPath(); g.ellipse(random() * w, random() * h, 1 + random() * 5, 1 + random() * 3, random() * 3, 0, TAU); g.fill(); }
    const dirt = g.createLinearGradient(0, h * .55, 0, h); dirt.addColorStop(0, 'rgba(90,85,60,0)'); dirt.addColorStop(1, 'rgba(90,85,60,.35)');
    g.fillStyle = dirt; g.fillRect(0, 0, w, h);
  }, { repeat: true });
}

// The trawler's hull, starboard on the top half of the canvas and port on the bottom (u along the hull, bow at the
// right; v from the keel up to the bulwark's top). The port half is painted mirrored where it carries lettering, so the
// name reads the right way round from both sides. `zones` are heights as shares of keel to bulwark top.
function hullTexture({ economy = false, zones }) {
  const W = economy ? 1024 : 2048, H = economy ? 512 : 1024, half = H / 2, sx = W / 1024, sy = half / 256;
  return canvasTexture(W, H, (g) => {
    const random = seededRandom(73);
    for (const side of [1, -1]) {
      const top = side > 0 ? 0 : half, row = share => top + (1 - share) * half;
      g.fillStyle = '#4a6b80'; g.fillRect(0, top, W, half);
      g.fillStyle = '#9a4434'; g.fillRect(0, row(zones.water), W, half - (row(zones.water) - top));
      g.fillStyle = '#d9d8cf'; g.fillRect(0, row(zones.stripe[1]), W, row(zones.stripe[0]) - row(zones.stripe[1]));
      g.fillStyle = '#3d5a6c'; g.fillRect(0, top, W, row(zones.deck) - top);
      g.fillStyle = '#e4e2d8'; g.fillRect(0, top, W, 4 * sy);
      // Plating: seams across and down, a weld bead along each.
      for (const share of [.14, zones.water, .47, zones.deck]) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, row(share), W, 1.5 * sy); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, row(share) + 1.5 * sy, W, 1 * sy); }
      for (let u = 0; u < 1; u += 1 / 9) { g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(u * W, row(zones.deck), 1.5 * sx, row(0) - row(zones.deck)); }
      // Freeing ports in the bulwark, each weeping rust down the side.
      for (const u of [.07, .14, .21, .28, .36, .44, .52, .6]) {
        const x = u * W, y0 = row(.9), y1 = row(zones.deck + .02);
        g.fillStyle = '#121a1f'; g.fillRect(x, y0, 16 * sx, y1 - y0);
        streak(g, x + 8 * sx, y1, 10 * sx, (60 + random() * 110) * sy, '#7a4a2a', .55);
      }
      for (let i = 0; i < 40; i++) streak(g, random() * W, row(zones.deck) + random() * 30 * sy, (2 + random() * 6) * sx, (30 + random() * 120) * sy, random() < .7 ? '#7a4a2a' : '#3a3228', .25 + random() * .25);
      // Chipped paint, and grime in broad patches.
      for (let i = 0; i < 160; i++) { g.fillStyle = rgba(random() < .6 ? '#8a5a3a' : '#2e3b44', .25 + random() * .35); g.beginPath(); g.ellipse(random() * W, top + random() * half, (1 + random() * 6) * sx, (1 + random() * 3) * sy, random() * 3, 0, TAU); g.fill(); }
      for (let i = 0; i < 24; i++) blotch(g, random() * W, top + random() * half, (30 + random() * 90) * sx, random() < .5 ? '#2c3a2c' : '#6a6450', .16);
      // Barnacles along and under the waterline, thicker towards the keel.
      for (let i = 0; i < 700; i++) { const share = Math.pow(random(), 1.6) * zones.water * 1.15; g.fillStyle = `rgba(225,222,205,${.25 + random() * .4})`; g.beginPath(); g.arc(random() * W, row(share), (.8 + random() * 2.2) * sx, 0, TAU); g.fill(); }
      // Portholes forward (landmark-builds.js rings them in brass at the same places).
      for (const u of PORTHOLES) { const x = u * W, y = row(zones.porthole); g.fillStyle = '#b08a45'; g.beginPath(); g.arc(x, y, 9 * sx, 0, TAU); g.fill(); g.fillStyle = '#16242c'; g.beginPath(); g.arc(x, y, 6.5 * sx, 0, TAU); g.fill(); streak(g, x, y + 8 * sy, 6 * sx, 50 * sy, '#7a4a2a', .45); }
      // Draft marks at bow and stern, and the name on the bow, the port of registry on the quarter.
      g.save();
      if (side < 0) { g.translate(W, 0); g.scale(-1, 1); }
      const ux = u => side < 0 ? (1 - u) * W : u * W;
      g.fillStyle = 'rgba(240,238,228,.85)'; g.font = `700 ${11 * sy}px system-ui, sans-serif`; g.textAlign = 'center';
      for (const u of [.035, .96]) for (const [n, share] of [['2', .08], ['4', .17], ['6', .26]]) g.fillText(n, ux(u), row(share));
      g.font = `800 ${30 * sy}px Outfit, Montserrat, system-ui, sans-serif`; g.fillStyle = 'rgba(236,234,224,.92)';
      g.fillText('SEA WREN', ux(.83), row(zones.porthole + .045));
      g.font = `700 ${14 * sy}px system-ui, sans-serif`; g.fillText('PORT KLANG  ·  KL 2617', ux(.12), row(zones.stripe[1] + .07));
      g.restore();
    }
  });
}
const PORTHOLES = [.705, .745, .785];

// The working deck: plates, a scuffed walkway, rust where the paint has gone, sediment drifted to the low (starboard)
// side and yellow safety lines round the hatch. u along the hull, v across it (port 0, starboard 1).
function deckTexture({ economy = false, hatch }) {
  const W = economy ? 512 : 1024, H = economy ? 128 : 256;
  return canvasTexture(W, H, (g) => {
    const random = seededRandom(97);
    g.fillStyle = '#5d6853'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${random() < .5 ? '0,0,0' : '255,255,255'},${.03 + random() * .05})`; g.fillRect(random() * W, random() * H, 2, 2); }
    for (let u = 0; u < W; u += W / 18) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(u, 0, 1.5, H); }
    for (const v of [.25, .5, .75]) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, v * H, W, 1.5); }
    for (let i = 0; i < 40; i++) blotch(g, random() * W, random() * H, 8 + random() * 30, '#7a4a2a', .45);
    const x0 = hatch.s0 * W - 10, x1 = hatch.s1 * W + 10, y0 = (.5 - hatch.v) * H - 8, y1 = (.5 + hatch.v) * H + 8;
    g.strokeStyle = 'rgba(226,190,60,.7)'; g.lineWidth = 5; g.setLineDash([14, 8]); g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.setLineDash([]);
    const silt = g.createLinearGradient(0, H * .55, 0, H); silt.addColorStop(0, 'rgba(178,166,130,0)'); silt.addColorStop(1, 'rgba(178,166,130,.85)');
    g.fillStyle = silt; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) blotch(g, random() * W, H * (.7 + random() * .3), 20 + random() * 40, '#b2a682', .5);
  });
}

// A fishing net, for the one snagged on the gantry: knotted mesh on clear ground (alpha-tested).
function netTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#4e7a5e'; g.lineWidth = 3;
    for (let i = -w; i < w * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
    g.fillStyle = '#3d6650';
    for (let i = -w; i < w * 2; i += 32) for (let j = 0; j <= h; j += 32) { g.beginPath(); g.arc(i + 16, j + 16, 3.5, 0, TAU); g.fill(); g.beginPath(); g.arc(i, j, 3.5, 0, TAU); g.fill(); }
  }, { repeat: true });
}

// The nautilus's shell, u along the spiral (oldest at 0, the aperture at 1) and v round its section (0 the outer rim,
// a half the inner face against the previous whorl): fine growth lines, flame stripes that run from the umbilicus
// across each flank and curve back, fading before the rim and towards the aperture, and the black callus at the lip.
function nautilusTexture(economy = false) {
  const W = economy ? 1024 : 2048, H = economy ? 256 : 512;
  return canvasTexture(W, H, (g) => {
    const random = seededRandom(19), stripes = document.createElement('canvas'); stripes.width = W; stripes.height = H;
    const s = stripes.getContext('2d');
    g.fillStyle = '#efe4cc'; g.fillRect(0, 0, W, H);
    const warm = g.createLinearGradient(0, 0, W, 0); warm.addColorStop(0, 'rgba(214,180,120,.35)'); warm.addColorStop(1, 'rgba(255,250,240,.2)');
    g.fillStyle = warm; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 2 + random() * 3) { g.fillStyle = `rgba(120,90,60,${.04 + random() * .07})`; g.fillRect(x, 0, 1, H); }
    const count = 30, fadeFrom = .82, fadeTo = .95;
    for (let k = 0; k < count; k++) {
      const u = (k + .3 + random() * .4) / count, fade = 1 - smooth((u - fadeFrom) / (fadeTo - fadeFrom));
      if (fade <= 0) continue;
      for (const dir of [-1, 1]) {
        const left = [], right = [], width = (10 + random() * 6) * W / 2048 * 2, back = (34 + random() * 20) * W / 2048 * 2;
        for (let i = 0; i <= 16; i++) {
          const t = i / 16, y = H / 2 + dir * t * H * .46, x = u * W - back * Math.pow(t, 1.4), zig = Math.sin(t * 22 + k) * width * .35;
          const half = width * (1 - .55 * t) * (.8 + .2 * Math.sin(t * 9 + k));
          left.push([x - half + zig, y]); right.push([x + half + zig, y]);
        }
        s.fillStyle = rgba(random() < .5 ? '#9b4f2b' : '#874224', .85 * fade);
        s.beginPath(); s.moveTo(...left[0]); for (const p of left) s.lineTo(...p); for (const p of right.reverse()) s.lineTo(...p); s.fill();
      }
    }
    g.filter = 'blur(1.4px)'; g.drawImage(stripes, 0, 0); g.filter = 'none';
    // The outer rim keeps light, a band either side of v = 0.
    for (const y of [0, H]) { const rim = g.createLinearGradient(0, y, 0, y + (y ? -1 : 1) * H * .1); rim.addColorStop(0, 'rgba(245,238,222,.9)'); rim.addColorStop(1, 'rgba(245,238,222,0)'); g.fillStyle = rim; g.fillRect(0, y ? H * .9 : 0, W, H * .1); }
    const callus = g.createRadialGradient(W * .99, H / 2, 0, W * .99, H / 2, H * .22);
    callus.addColorStop(0, 'rgba(40,30,26,.85)'); callus.addColorStop(1, 'rgba(40,30,26,0)');
    g.fillStyle = callus; g.fillRect(W * .85, 0, W * .15, H);
  });
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
// Experience: a nautilus shell lying on its side on the deep ledge, tipped up towards the approach. The shell is a
// true logarithmic spiral (each whorl three times the last), cut into chambers along its length, painted with its
// flame stripes, pearl inside, and the deep ledge's small life around it: shells of real size (two little nautiluses
// among them), glass sponges, sea pens, feather stars on stones, brittle stars and black coral.
// Reveal: the chambers light one after another from the centre outwards.
function nautilusSurface(diameter) {
  const thetaMax = 4 * Math.PI, b = Math.log(3) / TAU, radiusMax = diameter / 2.49;
  const R = theta => radiusMax * Math.exp(b * (theta - thetaMax));
  const flare = theta => smooth((theta - (thetaMax - .5)) / .5);
  const K = theta => .56 + .06 * flare(theta), W = theta => .47 * (1 + .1 * flare(theta));
  const point = (theta, phi, out) => {
    const r = R(theta), radial = r * (1 + K(theta) * Math.cos(phi)), axial = r * W(theta) * Math.sin(phi);
    return out.set(Math.cos(theta) * radial, Math.sin(theta) * radial, axial);
  };
  return { thetaMax, thetaMin: thetaMax - 4 * Math.PI, b, R, K, W, point };
}
// A stretch of the shell's surface, from theta `from` to `to`: positions, texture coordinates (u along the spiral,
// v round the section), and a colour per vertex from `paint(theta, phi, color)`.
function shellGrid(surface, from, to, rows, around, paint) {
  const positions = [], colors = [], uvs = [], index = [], v = new THREE.Vector3(), c = new THREE.Color();
  const span = surface.thetaMax - surface.thetaMin;
  for (let i = 0; i <= rows; i++) {
    const theta = from + (to - from) * i / rows;
    for (let j = 0; j <= around; j++) {
      const phi = j / around * TAU;
      surface.point(theta, phi, v); positions.push(v.x, v.y, v.z);
      paint(theta, phi, c.set('#ffffff'), i, rows); colors.push(c.r, c.g, c.b);
      uvs.push((theta - surface.thetaMin) / span, phi / TAU);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < around; j++) { const a = i * (around + 1) + j, d = a + around + 1; index.push(a, d, a + 1, a + 1, d, d + 1); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index); geometry.computeVertexNormals();
  return geometry;
}
// The stripes as vertex colour, for the little shells (too small to need the texture).
const smallShellPaint = surface => (theta, phi, c) => {
  c.set('#efe4cc');
  const fade = 1 - smooth((theta - (surface.thetaMax - 1.5)) / 1.1), flank = .35 + .65 * Math.abs(Math.sin(phi));
  if (Math.sin(theta * 11 + .7 * Math.sin(phi * 2)) > .2) c.lerp(new THREE.Color('#9b4f2b'), fade * flank * .9);
};

export function buildNautilus({ x, z, floorAt, economy = false, diameter = 3.3 }) {
  const root = new THREE.Group(); root.name = 'experience placement wrapper';
  const surface = nautilusSurface(diameter), { thetaMax, thetaMin, b, R, K, W } = surface;
  const chambers = 10, visibleFrom = thetaMax - 2.2 * Math.PI;
  const steps = economy ? 120 : 200, around = economy ? 20 : 32;
  const texture = nautilusTexture(economy);
  const materials = [], shell = new THREE.Group(); shell.name = 'Nautilus shell';
  // Four whorls, so the spiral closes at its centre as a real (involute) shell does; the inner two are hidden under the
  // outer one and make a single unlit core, and the ten chambers that light are spread over the visible last whorl.
  const span = (thetaMax - visibleFrom) / chambers, bounds = [thetaMin, ...Array.from({ length: chambers + 1 }, (_, n) => visibleFrom + n * span)];
  for (let n = 0; n < bounds.length - 1; n++) {
    const from = bounds[n], to = bounds[n + 1], rows = Math.max(4, Math.round(steps * (to - from) / (thetaMax - thetaMin)));
    // A faint suture where one chamber meets the next.
    const geometry = shellGrid(surface, from, to, rows, around, (theta, phi, c, i) => { if (n && (i === 0 || i === rows)) c.multiplyScalar(.86); });
    const material = standard({ roughness: .55, map: texture, emissive: '#ffcf7a', emissiveIntensity: 0, name: n ? `nautilus chamber ${n}` : 'nautilus core' });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = n ? `Nautilus chamber ${n}` : 'Nautilus core';
    shell.add(mesh); materials.push(material);
  }
  // Inside, nacre: the same surface seen from within, pearl with a faint play of pink and green.
  // It darkens with depth, so the aperture reads as an opening into the shell.
  { const pink = new THREE.Color('#f1e2ea'), green = new THREE.Color('#e0efe8'), deep = new THREE.Color('#3e3a46');
    const inner = shellGrid(surface, visibleFrom - .6, thetaMax, Math.round(steps * .6), around, (theta, phi, c) => c.copy(pink).lerp(green, .5 + .5 * Math.sin(theta * 3 + phi * 2)).lerp(deep, smooth((thetaMax - theta) / .45) * .9));
    inner.deleteAttribute('uv');
    const mesh = new THREE.Mesh(inner, standard({ roughness: .35, side: THREE.BackSide, name: 'nautilus nacre' })); mesh.name = 'Nautilus nacre';
    shell.add(mesh); }
  // The lip of the aperture, and the last septum set back inside it (pearl).
  { const kit = new Kit(), lipMaterial = standard({ roughness: .5, name: 'nautilus lip' }), points = [], v = new THREE.Vector3();
    for (let j = 0; j <= 40; j++) points.push(surface.point(thetaMax, j / 40 * TAU, v).clone());
    kit.add(lipMaterial, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 80, diameter * .012, 6, true), { color: '#f4ecd8',
      paint: (p, c) => p.length() < R(thetaMax) * (1 - K(thetaMax) * .5) ? c.lerp(new THREE.Color('#3a2a22'), .7) : c });
    // Set well back inside, so the aperture reads as an opening into pearl, not a lid across it.
    const theta = thetaMax - 1.3, r = R(theta), u = new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0);
    const tangent = new THREE.Vector3(b * Math.cos(theta) - Math.sin(theta), b * Math.sin(theta) + Math.cos(theta), 0).normalize();
    kit.add(lipMaterial, new THREE.CircleGeometry(1, 28), { matrix: new THREE.Matrix4().makeBasis(u.clone().multiplyScalar(r * K(theta) * .97), new THREE.Vector3(0, 0, r * W(theta) * .97), tangent).setPosition(u.multiplyScalar(r)), color: '#ece6f2' });
    kit.meshes('Nautilus lip and septum', shell); }
  // Lying on its side as an empty shell rests, the spiral tipped up 24 degrees towards the approach (+x), the aperture
  // turned to the side so its pearl shows.
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

  // The ledge around it, within 4 m of the shell (the ledge's own coral carpets begin beyond). Low things anywhere on the
  // sand; tall ones off the approach lane (+x).
  const random = seededRandom(2203), life = new Kit(), lifeMaterial = standard({ roughness: .7, side: THREE.DoubleSide, name: 'deep ledge life' });
  const spot = (r0, r1, clearLane = false) => {
    for (let tries = 0; tries < 12; tries++) {
      const angle = random() * TAU, radius = r0 + random() * (r1 - r0);
      if (clearLane && Math.cos(angle) > .55) continue;
      const px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
      return [px, floorAt(px, pz), pz, angle];
    }
    const px = x - r0, pz = z; return [px, floorAt(px, pz), pz, Math.PI];
  };
  // Two small nautilus shells (their real size, a fifth of a metre) and other shells: cowries, and spired conchs.
  for (let i = 0; i < 2; i++) {
    const small = nautilusSurface(.2 + random() * .06), [px, py, pz] = spot(2.2, 3.4);
    life.add(lifeMaterial, shellGrid(small, small.thetaMax - 2.4 * Math.PI, small.thetaMax, 48, 12, smallShellPaint(small)), { at: [px, py + .07, pz], turn: [Math.PI / 2 + (random() - .5) * .5, random() * TAU, 0] });
  }
  for (let i = 0, n = economy ? 6 : 10; i < n; i++) {
    const [px, py, pz] = spot(1.9, 4.0), k = .8 + random() * .6, base = ['#d9b48a', '#c99a6a', '#e8d2b8', '#b07a5a'][i % 4];
    life.add(lifeMaterial, new THREE.SphereGeometry(1, 12, 8), { at: [px, py + .03 * k, pz], size: [.08 * k, .045 * k, .05 * k], turn: [0, random() * TAU, 0], color: base,
      paint: (v, c) => Math.sin(v.x * 140) * Math.sin(v.z * 130) > .55 ? c.lerp(new THREE.Color('#5b3a24'), .7) : c });
  }
  for (let i = 0, n = economy ? 3 : 5; i < n; i++) {
    const [px, py, pz] = spot(2.0, 4.0), k = .9 + random() * .5, yaw = random() * TAU, dir = new THREE.Vector3(Math.cos(yaw), .12, Math.sin(yaw));
    const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    life.add(lifeMaterial, new THREE.LatheGeometry([[0, -.16], [.05, -.1], [.08, .02], [.07, .08], [.04, .13], [0, .2]].map(([r, y]) => new THREE.Vector2(r * k, y * k)), 10), { at: [px, py + .07 * k, pz], quat, color: '#e8d3b0',
      paint: (v, c) => Math.sin(v.y * 90 + v.x * 40) > .4 ? c.lerp(new THREE.Color('#a0623a'), .5) : c });
  }
  // Glass sponges: pale vases, open at the top.
  for (let i = 0, n = economy ? 3 : 5; i < n; i++) {
    const [px, py, pz] = spot(2.6, 4.0, true), k = 1.2 + random() * 1.2;
    life.add(lifeMaterial, new THREE.LatheGeometry([[.04, 0], [.1, .08], [.13, .3], [.16, .55], [.19, .7], [.2, .72]].map(([r, y]) => new THREE.Vector2(r * k, y * k)), 14), { at: [px, py - .03, pz], turn: [(random() - .5) * .2, random() * TAU, (random() - .5) * .2], color: '#dfe9ec',
      paint: (v, c) => c.lerp(new THREE.Color('#a9c7d1'), clamp01(Math.sin(v.y * 60) * .5 + .3) * .5) });
  }
  // Sea pens: a stalk and a feather of paired leaves.
  for (let i = 0, n = economy ? 5 : 9; i < n; i++) {
    const [px, py, pz] = spot(1.8, 4.0, true), h = .4 + random() * .3, tint = random() < .5 ? '#f08a4b' : '#f3efe2', lean = (random() - .5) * .25;
    rod(life, lifeMaterial, [px, py - .05, pz], [px + lean * h, py + h, pz], .012, .008, { color: '#e9d6b4' }, 5);
    for (let leaf = 0; leaf < 8; leaf++) for (const side of [-1, 1]) {
      const t = .35 + leaf / 8 * .6, ly = py + h * t, lx = px + lean * h * t;
      life.add(lifeMaterial, new THREE.SphereGeometry(1, 6, 4), { at: [lx, ly, pz + side * .04], size: [.022, .012, .06 * (1 - t * .5)], turn: [side * .7, 0, 0], color: tint });
    }
  }
  // Feather stars on stones: a disc and ten arms curling up and back.
  for (let i = 0, n = economy ? 2 : 4; i < n; i++) {
    const [px, py, pz] = spot(2.8, 4.0, true), s = .3 + random() * .2;
    life.add(lifeMaterial, rockGeometry(i * 3.1, .4), { at: [px, py + s * .3, pz], size: [s * 1.3, s * .9, s * 1.1], turn: [0, random() * TAU, 0], color: '#7385a0' });
    const top = new THREE.Vector3(px, py + s * .3 + s * .55, pz), tint = ['#f2c94c', '#c0392b', '#e8e2d0', '#7a3b8f'][i % 4];
    life.add(lifeMaterial, new THREE.SphereGeometry(.05, 8, 6), { at: top.toArray(), color: '#5a3b2a' });
    for (let arm = 0; arm < 10; arm++) {
      const a = arm / 10 * TAU; let from = top.clone(), dir = new THREE.Vector3(Math.cos(a), .9, Math.sin(a)).normalize();
      for (let seg = 0; seg < 5; seg++) {
        const to = from.clone().addScaledVector(dir, .07);
        rod(life, lifeMaterial, from.toArray(), to.toArray(), .012, .008, { color: tint }, 4);
        dir.applyAxisAngle(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), -.45); from = to;
      }
    }
  }
  // Brittle stars on the sand: a small disc and five wavering arms.
  for (let i = 0, n = economy ? 4 : 7; i < n; i++) {
    const [px, py, pz] = spot(1.8, 4.0), tint = ['#8a6a8a', '#c49a6c', '#6a7a8a'][i % 3], turn = random() * TAU;
    life.add(lifeMaterial, new THREE.SphereGeometry(.04, 8, 5), { at: [px, py + .015, pz], size: [1, .35, 1], color: tint });
    for (let arm = 0; arm < 5; arm++) {
      let a = turn + arm / 5 * TAU, from = new THREE.Vector3(px, py + .015, pz);
      for (let seg = 0; seg < 5; seg++) { a += (random() - .5) * .7; const to = from.clone().add(new THREE.Vector3(Math.cos(a) * .06, 0, Math.sin(a) * .06)); to.y = floorAt(to.x, to.z) + .012; rod(life, lifeMaterial, from.toArray(), to.toArray(), .009, .006, { color: tint }, 3); from = to; }
    }
  }
  // Black coral: dark branching bushes with white polyps at their tips.
  for (let i = 0, n = economy ? 2 : 3; i < n; i++) {
    const [px, py, pz] = spot(3.0, 4.0, true), height = .8 + random() * .5;
    const grow = (from, dir, length, radius, depth) => {
      const to = from.clone().addScaledVector(dir, length);
      rod(life, lifeMaterial, from.toArray(), to.toArray(), radius, radius * .7, { color: '#2f3a35', paint: (v, c) => depth > 1 ? c.lerp(new THREE.Color('#e9e3d0'), .4) : c }, 5);
      if (depth >= 3) return;
      for (let k = 0; k < 2 + (depth ? 1 : 0); k++) grow(to, dir.clone().add(new THREE.Vector3((random() - .5) * 1.1, .3, (random() - .5) * 1.1)).normalize(), length * .62, radius * .65, depth + 1);
    };
    grow(new THREE.Vector3(px, py - .05, pz), new THREE.Vector3(0, 1, 0), height * .45, .035, 0);
  }
  // Pebbles in a loose ring, where the current has sorted them.
  for (let i = 0, n = economy ? 18 : 34; i < n; i++) {
    const [px, py, pz] = spot(1.9, 3.2), s = .04 + random() * .08;
    life.add(lifeMaterial, new THREE.IcosahedronGeometry(1, 0), { at: [px, py + s * .3, pz], size: [s * 1.3, s * .7, s], turn: [random(), random() * TAU, random()], color: ['#9aa6b4', '#c8c0b0', '#7f8a96'][i % 3] });
  }
  life.meshes('Deep ledge life', root);

  // The fish by the shell are the reef's own (user-creature-routes.js SCHOOLS.nautilus), and a whitetip patrols the ledge.

  let now = 0, openedAt = -100, open = false;
  const levels = materials.map(() => 0);
  return {
    root, focus, approach, solids,
    reveal(isOpen, motion = true) {
      if (isOpen) { open = true; openedAt = motion ? now : now - 10; return motion ? 1.1 : 0; }
      open = false; return true;
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

  // The fish round the line are the reef's own fusiliers, wheeling round it at the stop (user-creature-routes.js SCHOOLS.line).

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

  // The slate turns about the line facing west (yaw π), towards the wreck the diver comes up from.
  const focus = new THREE.Box3().setFromCenterAndSize(clip.clone().add(new THREE.Vector3(-.36, -.44, 0)), new THREE.Vector3(.4, .6, .8));
  const center = focus.getCenter(new THREE.Vector3());
  const approach = new THREE.Vector3(center.x - 2.8, center.y, center.z);
  const solids = [new THREE.Box3(new THREE.Vector3(foot.x - .3, floor - .1, foot.z - .3), new THREE.Vector3(foot.x + .3, floor + .34, foot.z + .3))];

  let now = 0, open = false, turnedAt = -100, releasedAt = -100, from = 0, to = 0, glow = 0, yaw = 0, seen = false;
  const lastEye = new THREE.Vector3();
  const drift = t => Math.PI + .55 * Math.sin(t * .31) + .25 * Math.sin(t * .13 + 1.3);
  const toward = new THREE.Vector3();
  return {
    root, surface, focus, approach, solids,
    reveal(isOpen, motion = true, eye = null) {
      open = isOpen;
      if (!isOpen) { releasedAt = now; from = yaw; return true; }
      // Towards the diver (as last seen by update), or straight out along the approach lane.
      const target = eye ? toward.copy(eye).sub(clip) : seen ? toward.copy(lastEye).sub(clip) : toward.set(-1, 0, 0);
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

// ---------------------------------------------------------------------------------------------------------------
// Projects: a modern steel trawler, 16 m long, sunk on the mid-depth sand, heeled over so its working deck faces the
// approach. Its hull is painted (plating, freeing ports weeping rust, the boot stripe, portholes, draft marks and her
// name), its deck plated and silted, and it carries what a trawler carries: wheelhouse, mast and funnel, gantry with
// its trawl doors and a net still snagged on it, net drum, winch, crane, crates, bollards, tyres, anchor, propeller and
// rudder. A breach is torn in its high side, and the fish hold's hatch stands open. The reef's own fish live round it
// (user-creature-routes.js SCHOOLS.wreck). Reveal: the wheelhouse lights flicker on.
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
  const L = 16, B = 5.4, BULWARK = .9, stations = economy ? 26 : 44;
  const half = s => B / 2 * (s < .35 ? .82 + .18 * smooth(s / .35) : s < .6 ? 1 : Math.pow(Math.max(0, Math.cos((s - .6) / .4 * Math.PI / 2)), .75));
  const deckAt = s => 2.8 + .6 * smooth((s - .55) / .45);
  const keelAt = s => .3 * (1 - smooth(s / .2)) + 1.3 * smooth((s - .82) / .18);
  const xAt = s => -L / 2 + s * L;
  // The section from the keel up to the deck edge, as [breadth, height] fractions; then the bulwark's top.
  const profile = [[0, 0], [.18, .03], [.32, .08], [.52, .17], [.72, .3], [.85, .45], [.93, .62], [.98, .78], [1, .9], [1.01, 1]];
  const P = profile.length + 1, ring = 2 * P - 1, DECK = P - 2;
  const point = (s, j, side) => {
    const b = half(s), d = deckAt(s), k0 = keelAt(s);
    const [zf, yf] = j < P - 1 ? profile[j] : [1.03, null];
    const y = j < P - 1 ? k0 + yf * (d - k0) : d + BULWARK;
    const rake = 1.4 * smooth((s - .75) / .25) * (y - k0) / (d + BULWARK - k0);
    return new THREE.Vector3(xAt(s) + rake, y, side * zf * b);
  };
  // How far the bow's rake carries the hull forward at height y (point uses the same).
  const rakeAt = (s, y) => 1.4 * smooth((s - .75) / .25) * (y - keelAt(s)) / (deckAt(s) + BULWARK - keelAt(s));
  const ringPoint = (s, k) => k < P - 1 ? point(s, P - 1 - k, -1) : point(s, k - (P - 1), 1);
  const share = (s, y) => clamp01((y - keelAt(s)) / (deckAt(s) + BULWARK - keelAt(s)));
  // Heights on the painted hull, as shares of keel to bulwark top at midships (deck 2.8 m, bulwark 0.9 m).
  const zones = { water: .42 * 2.8 / 3.7, stripe: [.78 * 2.8 / 3.7, .86 * 2.8 / 3.7], deck: 2.8 / 3.7, porthole: .69 };
  const hatch = { s0: .2, s1: .34, z: 1.1 };
  const textures = { hull: hullTexture({ economy, zones }), deck: deckTexture({ economy, hatch: { ...hatch, v: hatch.z / B } }), grime: grimeTexture(), net: netTexture() };

  // Hull: the painted texture gives the colour; the vertices add only silt and shade low down.
  const silt = new THREE.Color('#c9c2a4');
  const positions = [], colors = [], uvs = [], index = [];
  for (let i = 0; i <= stations; i++) for (let k = 0; k < ring; k++) {
    const s = i / stations, p = ringPoint(s, k), side = k < P - 1 ? -1 : 1, h = share(s, p.y), c = new THREE.Color('#ffffff');
    c.lerp(silt, clamp01(Math.sin(p.x * 1.3 + p.y * 2.1) * .5 + .2) * .35).multiplyScalar(.8 + .2 * h);
    positions.push(p.x, p.y, p.z); colors.push(c.r, c.g, c.b);
    uvs.push(s, side > 0 ? .5 + .5 * h : .5 * h);
  }
  const at = (i, k) => i * ring + k, va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), n = new THREE.Vector3(), out = new THREE.Vector3();
  const vertex = (i, v) => v.fromArray(positions, i * 3);
  // A triangle, wound to face away from the hull's long axis (outward).
  const tri = (a, b2, c) => {
    vertex(a, va); vertex(b2, vb); vertex(c, vc);
    n.subVectors(vb, va).cross(vc.clone().sub(va));
    const cx = (va.x + vb.x + vc.x) / 3, s = clamp01((cx + L / 2) / L), axisY = keelAt(s) + .55 * (deckAt(s) - keelAt(s));
    out.set(0, (va.y + vb.y + vc.y) / 3 - axisY, (va.z + vb.z + vc.z) / 3);
    if (n.dot(out) < 0) index.push(a, c, b2); else index.push(a, b2, c);
  };
  // The breach: a ragged hole in the port (high) side, abreast of the hold.
  const breach = { s: .37, f: .62, ds: .075, df: .26 };
  const breached = (s, k) => {
    if (k >= P - 1) return false;
    const j = P - 1 - k, f = j / (P - 1), ds = (s - breach.s) / breach.ds, df = (f - breach.f) / breach.df;
    return ds * ds + df * df < 1 + .35 * Math.sin(s * 90 + f * 23);
  };
  for (let i = 0; i < stations; i++) for (let k = 0; k < ring - 1; k++) {
    if (breached((i + .5) / stations, k)) continue;
    tri(at(i, k), at(i + 1, k), at(i, k + 1)); tri(at(i + 1, k), at(i + 1, k + 1), at(i, k + 1));
  }
  // The transom: closed across the stern.
  { const start = positions.length / 3, k0 = keelAt(0), d = deckAt(0);
    positions.push(xAt(0), (k0 + d) / 2, 0); colors.push(.85, .85, .85); uvs.push(.01, .75);
    for (let k = 0; k < ring - 1; k++) {
      vertex(at(0, k), va); vertex(at(0, k + 1), vb); vertex(start, vc);
      n.subVectors(vb, va).cross(vc.clone().sub(va));
      if (n.x > 0) index.push(at(0, k + 1), at(0, k), start); else index.push(at(0, k), at(0, k + 1), start);
    } }
  const hullGeometry = new THREE.BufferGeometry();
  hullGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hullGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  hullGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  hullGeometry.setIndex(index); hullGeometry.computeVertexNormals();
  const outside = new THREE.Mesh(hullGeometry, standard({ roughness: .8, map: textures.hull, name: 'trawler hull' })); outside.name = 'Trawler hull';
  if (!textures.hull) for (let i = 0; i < positions.length / 3; i++) { const s = clamp01((positions[i * 3] + L / 2) / L), h = share(s, positions[i * 3 + 1]); const c = new THREE.Color(h < zones.water ? '#9a4434' : '#4a6b80'); hullGeometry.attributes.color.setXYZ(i, c.r, c.g, c.b); }
  const insideColors = new Float32Array(colors.length); for (let i = 0; i < insideColors.length; i += 3) insideColors.set([.23, .2, .18], i);
  const insideGeometry = hullGeometry.clone(); insideGeometry.setAttribute('color', new THREE.BufferAttribute(insideColors, 3)); insideGeometry.deleteAttribute('uv');
  const inside = new THREE.Mesh(insideGeometry, standard({ roughness: .95, side: THREE.BackSide, name: 'trawler hull inside' })); inside.name = 'Trawler hull inside';
  boat.add(outside, inside);

  // The deck (the hold's hatch open in it), out to the stem. It follows the bow's rake at deck height, as the hull's sides
  // do (point), and the hull's breadth at the deck: it used to stop a station short of the bow and ignore the rake, which
  // left the foredeck open.
  { const dp = [], dc = [], du = [], di = [], columns = 10, last = stations;
    for (let i = 0; i <= last; i++) for (let c = 0; c <= columns; c++) {
      const s = i / stations, b = half(s) * 1.01, zc = -b + 2 * b * c / columns;
      dp.push(xAt(s) + rakeAt(s, deckAt(s)), deckAt(s), zc); dc.push(1, 1, 1); du.push(s, c / columns);
    }
    for (let i = 0; i < last; i++) for (let c = 0; c < columns; c++) {
      const s = (i + .5) / stations, b = half(s), zc = -b + 2 * b * (c + .5) / columns;
      if (s > hatch.s0 && s < hatch.s1 && Math.abs(zc) < hatch.z) continue;
      const a = i * (columns + 1) + c; di.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2);
    }
    const deck = new THREE.BufferGeometry();
    deck.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); deck.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3)); deck.setAttribute('uv', new THREE.Float32BufferAttribute(du, 2));
    deck.setIndex(di); deck.computeVertexNormals();
    const mesh = new THREE.Mesh(deck, standard({ roughness: .85, side: THREE.DoubleSide, map: textures.deck, color: textures.deck ? '#ffffff' : '#59654f', name: 'trawler deck' })); mesh.name = 'Trawler deck'; boat.add(mesh); }

  const steel = standard({ roughness: .75, side: THREE.DoubleSide, map: textures.grime, name: 'trawler fittings' });
  const glass = new THREE.MeshStandardMaterial({ name: 'wheelhouse windows', color: '#1b2f38', roughness: .3, emissive: '#ffd27a', emissiveIntensity: 0, side: THREE.DoubleSide });
  const kit = new Kit(false, true), windows = new Kit();
  const rust = new THREE.Color('#7a4a2a'), growth = new THREE.Color('#4d5a3c');
  const white2 = '#d5d3c8', dark = '#2c3135', orange = '#c46a2c';

  // Rub rail along the sheer and a cap on the bulwarks; brass portholes where the hull's paint has them.
  for (const side of [-1, 1]) {
    const edge = [], cap = [];
    for (let i = 0; i <= 30; i++) { const s = .012 + i / 30 * .95, e = point(s, DECK, side); e.z *= 1.035; e.y -= .12; edge.push(e); cap.push(point(s, P - 1, side).add(new THREE.Vector3(0, .03, 0))); }
    kit.add(steel, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), economy ? 50 : 90, .085, 6), { color: dark });
    kit.add(steel, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cap), economy ? 50 : 90, .045, 5), { color: white2 });
    for (const u of PORTHOLES) {
      const y = keelAt(u) + zones.porthole * (deckAt(u) + BULWARK - keelAt(u)), z0 = side * (half(u) * 1.0 + .015);
      kit.add(steel, new THREE.TorusGeometry(.1, .022, 6, 16), { at: [xAt(u) + 1.4 * smooth((u - .75) / .25) * zones.porthole, y, z0], color: '#b08a45' });
    }
  }
  // Hatch coaming and its cover, thrown aside.
  { const x0 = xAt(hatch.s0), x1 = xAt(hatch.s1), y = deckAt(.27) + .22, len = x1 - x0, color = '#6f7468';
    kit.add(steel, new THREE.BoxGeometry(len + .1, .45, .1), { at: [(x0 + x1) / 2, y, hatch.z], color });
    kit.add(steel, new THREE.BoxGeometry(len + .1, .45, .1), { at: [(x0 + x1) / 2, y, -hatch.z], color });
    kit.add(steel, new THREE.BoxGeometry(.1, .45, hatch.z * 2), { at: [x0, y, 0], color });
    kit.add(steel, new THREE.BoxGeometry(.1, .45, hatch.z * 2), { at: [x1, y, 0], color });
    kit.add(steel, new THREE.BoxGeometry(len * .9, .08, hatch.z * 1.8), { at: [x1 + 1.3, deckAt(.4) + .35, -1.2], turn: [.5, .3, .12], color: '#5e6458' });
    for (const dz of [-.5, .5]) kit.add(steel, new THREE.TorusGeometry(.08, .015, 4, 10, Math.PI), { at: [x1 + 1.3, deckAt(.4) + .42, -1.2 + dz], turn: [.5, .3, .12], color: dark }); }
  // Wheelhouse: walls with a window band, a doorway on the port side, one front pane gone; a console inside; the roof
  // with its railing, a life raft canister, a searchlight; the mast with radar, lights, horn and stays; a funnel aft.
  const w = { x0: xAt(.55), x1: xAt(.75), base: deckAt(.65), height: 2.3, half: 1.6 };
  const roofTop = w.base + w.height + .14, mx = w.x0 + .6, mastTop = w.base + w.height + 3.6;
  { const { x0, x1, base, height, half: hz } = w, len = x1 - x0, mid = (x0 + x1) / 2;
    kit.add(steel, new THREE.BoxGeometry(.1, height, hz * 2), { at: [x0, base + height / 2, 0], color: white2, tile: 2.5 });
    kit.add(steel, new THREE.BoxGeometry(.1, 1.15, hz * 2), { at: [x1, base + .575, 0], color: white2, tile: 2.5 });
    kit.add(steel, new THREE.BoxGeometry(.1, .3, hz * 2), { at: [x1, base + height - .15, 0], color: white2, tile: 2.5 });
    for (const pz of [-hz, -hz / 3, hz / 3, hz]) kit.add(steel, new THREE.BoxGeometry(.12, height - 1.45, .1), { at: [x1, base + 1.15 + (height - 1.45) / 2, pz], color: white2, tile: 2.5 });
    for (const [pz, broken] of [[-hz * 2 / 3, false], [0, true], [hz * 2 / 3, false]]) if (!broken)
      windows.add(glass, new THREE.PlaneGeometry(hz * 2 / 3 - .1, height - 1.5), { at: [x1 + .02, base + 1.15 + (height - 1.45) / 2, pz], turn: [0, Math.PI / 2, 0] });
    // Visors over the front windows, and a wiper on each pane left.
    kit.add(steel, new THREE.BoxGeometry(.45, .05, hz * 2 + .1), { at: [x1 + .22, base + height - .02, 0], turn: [0, 0, -.25], color: white2, tile: 2.5 });
    for (const pz of [-hz * 2 / 3, hz * 2 / 3]) rod(kit, steel, [x1 + .05, base + 1.25, pz], [x1 + .05, base + 1.7, pz + .2], .01, .01, { color: dark }, 3);
    kit.add(steel, new THREE.BoxGeometry(len, 1.15, .1), { at: [mid, base + .575, hz], color: white2, tile: 2.5 });
    kit.add(steel, new THREE.BoxGeometry(len, .3, .1), { at: [mid, base + height - .15, hz], color: white2, tile: 2.5 });
    for (const px of [x0, mid, x1]) kit.add(steel, new THREE.BoxGeometry(.1, height - 1.45, .1), { at: [px, base + 1.15 + (height - 1.45) / 2, hz], color: white2, tile: 2.5 });
    for (const px of [(x0 + mid) / 2, (mid + x1) / 2]) windows.add(glass, new THREE.PlaneGeometry(len / 2 - .12, height - 1.5), { at: [px, base + 1.15 + (height - 1.45) / 2, hz + .02] });
    kit.add(steel, new THREE.BoxGeometry(len * .55, height, .1), { at: [x1 - len * .275, base + height / 2, -hz], color: white2, tile: 2.5 });
    kit.add(steel, new THREE.BoxGeometry(len * .2, height, .1), { at: [x0 + len * .1, base + height / 2, -hz], color: white2, tile: 2.5 });
    // The door, hanging open off one hinge.
    kit.add(steel, new THREE.BoxGeometry(.75, height * .85, .06), { at: [x0 + len * .2 + .1, base + height * .45, -hz - .35], turn: [0, -1.1, .05], color: white2, tile: 2.5 });
    kit.add(steel, new THREE.BoxGeometry(len + .4, .14, hz * 2 + .4), { at: [mid, base + height + .07, 0], color: '#c9c7bb', paint: (v, c) => c.lerp(growth, clamp01(Math.sin(v.x * 3 + v.z * 2) * .5 + .2)) });
    kit.add(steel, new THREE.BoxGeometry(.6, .9, 1.6), { at: [x1 - .45, base + .45, 0], color: '#3a3d40' });
    kit.add(steel, new THREE.TorusGeometry(.2, .025, 5, 14), { at: [x1 - .75, base + 1.05, 0], turn: [0, Math.PI / 2, 0], color: '#8a6a3a' });
    // Railing round the roof.
    const rail = .45, rx0 = x0 - .1, rx1 = x1 + .1, rz = hz + .12, posts = [];
    for (let px = rx0; px <= rx1 + .01; px += (rx1 - rx0) / 4) for (const pz of [-rz, rz]) posts.push([px, pz]);
    for (const pz of [-rz / 2, 0, rz / 2]) posts.push([rx0, pz]);
    for (const [px, pz] of posts) rod(kit, steel, [px, roofTop, pz], [px, roofTop + rail, pz], .02, .02, { color: '#cfd0c8' }, 4);
    for (const pz of [-rz, rz]) rod(kit, steel, [rx0, roofTop + rail, pz], [rx1, roofTop + rail, pz], .022, .022, { color: '#cfd0c8' }, 4);
    rod(kit, steel, [rx0, roofTop + rail, -rz], [rx0, roofTop + rail, rz], .022, .022, { color: '#cfd0c8' }, 4);
    // Life raft canister in its cradle, a searchlight, and a lifering on the rail.
    const raft = [x0 + .9, roofTop + .34, hz - .55];
    kit.add(steel, new THREE.CylinderGeometry(.28, .28, 1, 14), { at: raft, turn: [0, 0, Math.PI / 2], color: '#efeee6' });
    for (const dx of [-.5, .5]) kit.add(steel, new THREE.SphereGeometry(.28, 12, 8), { at: [raft[0] + dx, raft[1], raft[2]], size: [.45, 1, 1], color: '#efeee6' });
    for (const dx of [-.3, .3]) { kit.add(steel, new THREE.BoxGeometry(.06, .07, .62), { at: [raft[0] + dx, raft[1], raft[2]], color: '#2b3a44' }); kit.add(steel, new THREE.BoxGeometry(.08, .22, .5), { at: [raft[0] + dx, roofTop + .1, raft[2]], color: '#8a8c86' }); }
    rod(kit, steel, [x1 - .2, roofTop, -1.2], [x1 - .2, roofTop + .3, -1.2], .03, .03, { color: dark }, 6);
    kit.add(steel, new THREE.CylinderGeometry(.12, .1, .26, 12), { at: [x1 - .12, roofTop + .38, -1.2], turn: [0, 0, Math.PI / 2], color: '#3a3d40' });
    kit.add(steel, new THREE.CylinderGeometry(.1, .1, .02, 12), { at: [x1 + .02, roofTop + .38, -1.2], turn: [0, 0, Math.PI / 2], color: '#efe6b8' });
    kit.add(steel, new THREE.TorusGeometry(.26, .06, 6, 16), { at: [x0 - .1, roofTop + .3, -.9], turn: [0, Math.PI / 2, 0], color: '#e2553a', paint: (v, c) => Math.sin(Math.atan2(v.y - roofTop - .3, v.z + .9) * 4) > 0 ? c.set('#f2f0e8') : c });
    // Mast: radar, crosstree with lights, a horn, stays to the roof corners, a whip antenna.
    rod(kit, steel, [mx, base + height, 0], [mx, mastTop, 0], .09, .06, { color: '#bdbdb4' }, 8);
    kit.add(steel, new THREE.BoxGeometry(1.7, .1, .28), { at: [mx, mastTop + .1, 0], turn: [0, .6, 0], color: '#e1e0d8' });
    kit.add(steel, new THREE.CylinderGeometry(.12, .12, .14, 10), { at: [mx, mastTop + .02, 0], color: '#3a3d40' });
    rod(kit, steel, [mx, mastTop - 1.1, -.7], [mx, mastTop - 1.1, .7], .035, .035, { color: '#bdbdb4' }, 6);
    for (const pz of [-.7, .7]) kit.add(steel, new THREE.SphereGeometry(.09, 8, 6), { at: [mx, mastTop - 1, pz], color: pz < 0 ? '#c0392b' : '#2e8b57' });
    kit.add(steel, new THREE.SphereGeometry(.08, 8, 6), { at: [mx + .12, mastTop - .5, 0], color: '#f2f0e0' });
    kit.add(steel, new THREE.ConeGeometry(.08, .3, 8, 1, true), { at: [mx + .2, mastTop - 1.7, 0], turn: [0, 0, -Math.PI / 2], color: '#d9d7cf' });
    for (const pz of [-1.6, 1.6]) rod(kit, steel, [mx, mastTop - .4, 0], [x0 - .05, roofTop, pz], .01, .01, { color: '#8a8c86' }, 3);
    rod(kit, steel, [x1 - .3, roofTop, -1.2], [x1 - .5, roofTop + 2.6, -1.4], .025, .012, { color: '#d9d7cf' }, 4);
    // One outrigger boom still rigged, drooping off the low (starboard) side, its stay hanging slack.
    rod(kit, steel, [mx, base + height + .4, .3], [mx - 1.2, base + .2, 6.2], .1, .07, { color: '#8a8c86' }, 8);
    rod(kit, steel, [mx, mastTop - .2, .1], [mx - .7, base + 1.6, 4.2], .012, .012, { color: '#6f7270' }, 3);
    // Funnel aft of the wheelhouse: blue, with a black top and a rust-run cap.
    const fx = x0 - .75, fz = -.95, fy = deckAt(.5);
    kit.add(steel, new THREE.CylinderGeometry(.3, .34, 1.9, 14), { at: [fx, fy + .95, fz], turn: [0, 0, .08], color: '#2f5d7a' });
    kit.add(steel, new THREE.CylinderGeometry(.31, .31, .32, 14), { at: [fx - .07, fy + 1.78, fz], turn: [0, 0, .08], color: '#1d1f21' });
    kit.add(steel, new THREE.CylinderGeometry(.36, .36, .05, 14), { at: [fx - .08, fy + 1.95, fz], turn: [0, 0, .08], color: '#3a3d40' }); }
  // Stern gantry, its trawl doors hanging off it, the net drum with its net wound on, and the net that snagged on the
  // gantry draped over the stern with its floats.
  const xs = xAt(.04), ds = deckAt(.04);
  { for (const pz of [-2, 2]) rod(kit, steel, [xs + .3, ds, pz], [xs - .2, ds + 3.6, pz * .9], .12, .1, { color: orange }, 8);
    rod(kit, steel, [xs - .2, ds + 3.6, -1.8], [xs - .2, ds + 3.6, 1.8], .12, .12, { color: orange }, 8);
    for (const pz of [-1.2, 0, 1.2]) kit.add(steel, new THREE.BoxGeometry(.35, .45, .28), { at: [xs - .2, ds + 3.25, pz], color: '#3a3d40' });
    for (const side of [-1, 1]) {
      const door = [xs - .15, ds + 1.6, side * 2.5];
      kit.add(steel, new THREE.BoxGeometry(1.5, .95, .1), { at: door, turn: [0, side * .15, .08], color: '#a9512c' });
      kit.add(steel, new THREE.BoxGeometry(1.5, .1, .22), { at: [door[0], door[1] - .5, door[2]], turn: [0, side * .15, .08], color: '#3a3d40' });
      for (const dx of [-.5, .5]) kit.add(steel, new THREE.BoxGeometry(.08, .9, .14), { at: [door[0] + dx, door[1], door[2] - side * .06], turn: [0, side * .15, .08], color: '#5a4434' });
      for (const dx of [-.55, .55]) rod(kit, steel, [xs - .2, ds + 3.5, side * 1.85], [door[0] + dx, door[1] + .47, door[2]], .015, .015, { color: '#4d5257' }, 3);
    }
    const xd = xAt(.13), dd = deckAt(.13);
    kit.add(steel, new THREE.CylinderGeometry(.55, .55, 2.3, 18), { at: [xd, dd + .75, 0], turn: [Math.PI / 2, 0, 0], color: '#3f6b4a', paint: (v, c) => c.offsetHSL(0, 0, Math.sin(v.y * 40 + v.x * 30) * .05) });
    for (const pz of [-1.2, 1.2]) kit.add(steel, new THREE.CylinderGeometry(.85, .85, .08, 20), { at: [xd, dd + .75, pz], turn: [Math.PI / 2, 0, 0], color: '#6a6e68' });
    for (const pz of [-1.3, 1.3]) kit.add(steel, new THREE.BoxGeometry(.3, .75, .15), { at: [xd, dd + .37, pz], color: '#5a5e58' });
    for (const pz of [-1.6, -.8, 0, .8, 1.6]) kit.add(steel, new THREE.SphereGeometry(.1, 8, 6), { at: [xs - .32, ds + 3.42, pz], color: pz % 1.6 ? '#f08a2c' : '#f2c230' }); }
  const netMesh = (() => {
    if (!textures.net) return null;
    const cols = 12, rows = 16, geometry = new THREE.PlaneGeometry(1, 1, cols, rows), p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      const u = uv.getX(i), t = 1 - uv.getY(i), zc = (u - .5) * 3.4 * (1 - .2 * t);
      // It hangs off the transom and stops short of the sand (and the sea grass behind the stern).
      const xx = xs - .25 - .75 * t - .3 * Math.sin(t * Math.PI) + .12 * Math.sin(u * 17 + t * 9);
      const yy = ds + 3.45 - t * (ds + 2.1) + .3 * Math.sin(t * Math.PI * 1.3) * (1 - t) + .1 * Math.sin(u * 13);
      p.setXYZ(i, xx, yy, zc + .15 * Math.sin(t * 7 + u * 5)); uv.setXY(i, u * 4, t * 6);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: 'snagged net', map: textures.net, alphaTest: .45, side: THREE.DoubleSide, roughness: .9, color: '#c9d6c9' }));
    mesh.name = 'Snagged net'; return mesh;
  })();
  if (netMesh) boat.add(netMesh);
  // Deck gear: the trawl winch, a stack of fish crates, bollards along both sides, a crane, a coil of warp.
  { const wx = xAt(.46), wd = deckAt(.46);
    for (const pz of [-.6, .6]) {
      kit.add(steel, new THREE.CylinderGeometry(.34, .34, .55, 16), { at: [wx, wd + .55, pz], turn: [Math.PI / 2, 0, 0], color: '#7b7f80', paint: (v, c) => c.offsetHSL(0, 0, Math.sin(v.y * 70) * .06) });
      for (const dz of [-.3, .3]) kit.add(steel, new THREE.CylinderGeometry(.48, .48, .05, 16), { at: [wx, wd + .55, pz + dz], turn: [Math.PI / 2, 0, 0], color: '#3a3d40' });
    }
    kit.add(steel, new THREE.BoxGeometry(.7, .3, 1.9), { at: [wx, wd + .15, 0], color: '#3f6b4a' });
    kit.add(steel, new THREE.BoxGeometry(.5, .5, .5), { at: [wx + .55, wd + .25, 0], color: '#3a3d40' });
    const tones = ['#2f6fb3', '#c0392b', '#e9e7df', '#2f6fb3', '#f2c230', '#c0392b'];
    for (let i = 0; i < 6; i++) kit.add(steel, new THREE.BoxGeometry(.62, .26, .42), { at: [xAt(.39) + (i % 2) * .68, deckAt(.39) + .13 + Math.floor(i / 2) * .27, -1.55 + (random() - .5) * .08], turn: [0, (random() - .5) * .15, 0], color: tones[i] });
    for (const s of [.08, .42, .86]) for (const side of [-1, 1]) for (const dx of [-.18, .18]) {
      const bz = side * (half(s) - .32);
      kit.add(steel, new THREE.CylinderGeometry(.1, .11, .32, 10), { at: [xAt(s) + dx, deckAt(s) + .16, bz], color: dark });
      kit.add(steel, new THREE.CylinderGeometry(.13, .13, .04, 10), { at: [xAt(s) + dx, deckAt(s) + .33, bz], color: dark });
    }
    const cx = xAt(.16), cd = deckAt(.16);
    rod(kit, steel, [cx, cd, 1.75], [cx, cd + 1.15, 1.75], .17, .15, { color: '#d9a42c' }, 10);
    rod(kit, steel, [cx, cd + 1.15, 1.75], [cx + 2.1, cd + 2.3, .9], .1, .07, { color: '#d9a42c' }, 8);
    rod(kit, steel, [cx + 2.1, cd + 2.3, .9], [cx + 2.15, cd + 1.3, .95], .01, .01, { color: '#4d5257' }, 3);
    kit.add(steel, new THREE.BoxGeometry(.16, .22, .12), { at: [cx + 2.15, cd + 1.2, .95], color: '#3a3d40' });
    for (let r = 0; r < 4; r++) kit.add(steel, new THREE.TorusGeometry(.42 - r * .06, .04, 5, 18), { at: [xAt(.88), deckAt(.88) + .04 + r * .07, .2], turn: [Math.PI / 2, 0, 0], color: '#d9b35a' }); }
  // Bow: the hawse pipe with the anchor still housed, a short length of chain out of it. On the port bow, the high
  // side, clear of the sand and its sea grass.
  { const hawse = point(.9, DECK, -1).add(new THREE.Vector3(0, -.4, -.05)), top = hawse.clone().add(new THREE.Vector3(-.05, -.18, -.1)), crown = top.clone().add(new THREE.Vector3(-.06, -1.05, -.1)), color = '#47535c';
    kit.add(steel, new THREE.TorusGeometry(.15, .045, 6, 14), { at: hawse.toArray(), color: dark });
    for (let i = 0; i < 4; i++) kit.add(steel, new THREE.TorusGeometry(.06, .018, 4, 8), { at: hawse.clone().lerp(top, (i + .5) / 4).toArray(), turn: [i % 2 ? Math.PI / 2 : 0, 0, 0], size: [1, 1.6, 1], color: '#3a3d40' });
    rod(kit, steel, top.toArray(), crown.toArray(), .055, .05, { color }, 6);
    kit.add(steel, new THREE.BoxGeometry(.3, .14, .18), { at: crown.toArray(), color });
    for (const sx of [-1, 1]) {
      const tip = crown.clone().add(new THREE.Vector3(sx * .36, .32, -.07));
      rod(kit, steel, crown.toArray(), tip.toArray(), .05, .025, { color }, 5);
      kit.add(steel, new THREE.BoxGeometry(.2, .26, .05), { at: tip.toArray(), turn: [0, 0, sx * -.7], color });
    } }
  // Stern gear below the waterline: shaft, a bronze three-bladed propeller, and the rudder.
  { const hub = new THREE.Vector3(-7.55, .3, 0);
    rod(kit, steel, [-6.4, .62, 0], hub.toArray(), .07, .07, { color: '#7b7f80' }, 8);
    kit.add(steel, new THREE.SphereGeometry(.15, 10, 8), { at: hub.toArray(), size: [1.3, 1, 1], color: '#b07a3a' });
    for (let blade = 0; blade < 3; blade++) {
      const a = blade * TAU / 3, quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a).multiply(new THREE.Quaternion().setFromAxisAngle(UP, .6));
      kit.add(steel, new THREE.SphereGeometry(1, 10, 6), { at: [hub.x, hub.y + Math.cos(a) * .36, hub.z + Math.sin(a) * .36], quat, size: [.05, .36, .19], color: '#b07a3a' });
    }
    kit.add(steel, new THREE.BoxGeometry(.75, 1.25, .07), { at: [-8.05, .72, 0], color: '#9a4434' });
    rod(kit, steel, [-7.95, 1.35, 0], [-7.95, 1.9, 0], .05, .05, { color: '#7b7f80' }, 6); }
  // Tyres hung over the high (port) side as fenders.
  for (const s of [.3, .5, .66]) {
    const p = point(s, P - 1, -1), c = p.clone().add(new THREE.Vector3(0, -.7, -.3));
    rod(kit, steel, p.toArray(), [c.x, c.y + .3, c.z], .015, .015, { color: '#6f6450' }, 3);
    kit.add(steel, new THREE.TorusGeometry(.3, .12, 6, 14), { at: c.toArray(), turn: [0, (random() - .5) * .4, 0], color: '#26282a' });
  }
  // Plates torn back round the breach.
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU + random() * .4, s = breach.s + Math.cos(a) * breach.ds * 1.05, f = breach.f + Math.sin(a) * breach.df * 1.05;
    const j = Math.max(1, Math.min(P - 2, Math.round(f * (P - 1)))), p = point(s, j, -1).add(new THREE.Vector3(0, 0, .12));
    kit.add(steel, new THREE.BoxGeometry(.55, .4, .03), { at: p.toArray(), turn: [(random() - .5) * .8, (random() - .5) * .8 + .4, a], color: '#6a4a35', paint: (v, c) => c.lerp(rust, .4) });
  }
  // Growth: sponges, soft corals, small fans and anemones along the bulwark caps, the wheelhouse roof, the gantry and the
  // high side of the hull.
  { const tones = ['#e07b4a', '#b86bc8', '#e8c35a', '#6fc7b0', '#f2f0e6', '#d9534f', '#f08aa8'];
    for (let i = 0, count = economy ? 50 : 96; i < count; i++) {
      const pick = random(), side = random() < .5 ? -1 : 1;
      let p, outward = new THREE.Vector3(0, 1, 0);
      if (pick < .38) p = point(.05 + random() * .85, P - 1, side).add(new THREE.Vector3(0, .05, 0));
      else if (pick < .52) p = new THREE.Vector3(w.x0 + random() * (w.x1 - w.x0), roofTop, (random() - .5) * 3.2);
      else if (pick < .6) p = new THREE.Vector3(xs - .2 + (random() - .5) * .3, ds + 3.72, (random() - .5) * 3.4);
      else { const s = .06 + random() * .8, j = 2 + Math.floor(random() * (P - 4)); p = point(s, j, -1); p.z -= .03; outward = new THREE.Vector3(0, .3, -1).normalize(); }
      const size = .08 + random() * .2, tone = tones[Math.floor(random() * tones.length)], kind = random(), quat = new THREE.Quaternion().setFromUnitVectors(UP, outward);
      if (kind < .35) kit.add(steel, new THREE.SphereGeometry(1, 7, 5), { at: p.toArray(), size: [size, size * .7, size], color: tone });
      else if (kind < .65) for (let c = 0; c < 3; c++) { const o = new THREE.Vector3((random() - .5) * size, size * .7, (random() - .5) * size).applyQuaternion(quat); kit.add(steel, new THREE.ConeGeometry(size * .3, size * 1.6, 6), { at: p.clone().add(o).toArray(), quat, color: tone }); }
      else if (kind < .82) kit.add(steel, new THREE.SphereGeometry(1, 8, 5), { at: p.clone().addScaledVector(outward, size * 1.4).toArray(), quat: quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, random() * TAU)), size: [size * 1.8, size * 1.6, size * .15], color: tone });
      else { kit.add(steel, new THREE.SphereGeometry(size * .5, 8, 6), { at: p.toArray(), color: '#f3d9c0' }); for (let t = 0; t < 7; t++) { const a = t / 7 * TAU, dir = new THREE.Vector3(Math.cos(a) * .6, 1, Math.sin(a) * .6).normalize().applyQuaternion(quat); rod(kit, steel, p.toArray(), p.clone().addScaledVector(dir, size * 1.3).toArray(), size * .1, size * .03, { color: tone }, 4); } }
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

  // The fish round it are the reef's own (user-creature-routes.js SCHOOLS.wreck), drawn with the rest of the reef's fish.
  const focus = new THREE.Box3().setFromObject(boat), center = focus.getCenter(new THREE.Vector3());
  const ax = center.x + 8.5, az = center.z;
  const approach = new THREE.Vector3(ax, Math.max(floorAt(ax, az) + 3.5, center.y + .6), az);
  // Collision, close to the wreck's shape. The collision world takes boxes square to the world, and the hull is turned and
  // heeled, so it is cut into short slabs along its length and three strips across its beam, each boxed on its own: solid
  // from the keel to the deck, with a wall for each bulwark above it, so a diver can swim over the deck but not through
  // the ship. Then the wheelhouse, the funnel, the mast, the stern gantry, the net drum and the winch. (It used to be
  // three boxes: the hull below the bulwarks and the wheelhouse, a diver swimming straight through the bulwarks, the
  // rigging and the gear, and bumping into nothing in the water beside the hull.) The hull's slabs are named `ship hull`,
  // so the animals still take the whole wreck for one block (user-creatures.js).
  const worldBox = (x0, x1, y0, y1, z0, z1) => { const box = new THREE.Box3(); for (const cx of [x0, x1]) for (const cy of [y0, y1]) for (const cz of [z0, z1]) box.expandByPoint(new THREE.Vector3(cx, cy, cz).applyMatrix4(boat.matrixWorld)); return box; };
  const solids = [], SLABS = 16;
  for (let i = 0; i < SLABS; i++) {
    const s0 = i / SLABS, s1 = (i + 1) / SLABS, b = Math.max(half(s0), half(s1)) * 1.01;
    if (b < .08) continue;
    const deck = Math.max(deckAt(s0), deckAt(s1)), keel = Math.min(keelAt(s0), keelAt(s1)) + .1;
    const x0 = xAt(s0), x1 = xAt(s1) + rakeAt(s1, deck + BULWARK);
    for (let strip = 0; strip < 3; strip++) solids.push({ box: worldBox(x0, x1, keel, deck, -b + strip * 2 * b / 3, -b + (strip + 1) * 2 * b / 3), name: `ship hull ${i}.${strip}` });
    for (const side of [-1, 1]) solids.push({ box: worldBox(x0, x1, deck, deck + BULWARK, side < 0 ? -b : b - .3, side < 0 ? -b + .3 : b), name: `ship hull bulwark ${i}` });
  }
  solids.push(
    { box: worldBox(w.x0, w.x1, w.base, w.base + w.height + .2, -w.half - .05, w.half + .05), name: 'trawler wheelhouse' },
    { box: worldBox(w.x0 - 1.15, w.x0 - .35, deckAt(.5), deckAt(.5) + 2, -1.35, -.55), name: 'trawler funnel' },
    { box: worldBox(mx - .15, mx + .15, w.base + w.height, mastTop + .2, -.15, .15), name: 'trawler mast' },
    { box: worldBox(xs - .45, xs + .45, ds, ds + 3.75, -2.2, -1.65), name: 'trawler gantry' },
    { box: worldBox(xs - .45, xs + .45, ds, ds + 3.75, 1.65, 2.2), name: 'trawler gantry' },
    { box: worldBox(xs - .4, xs, ds + 3.4, ds + 3.8, -1.9, 1.9), name: 'trawler gantry' },
    { box: worldBox(xAt(.13) - .85, xAt(.13) + .85, deckAt(.13), deckAt(.13) + 1.6, -1.3, 1.3), name: 'trawler net drum' },
    { box: worldBox(xAt(.46) - .5, xAt(.46) + .8, deckAt(.46), deckAt(.46) + .95, -1, 1), name: 'trawler winch' });

  let now = 0, open = false, openedAt = -100, glow = 0;
  return {
    root, focus, approach, solids,
    reveal(isOpen, motion = true) {
      open = isOpen;
      if (!isOpen) return true;
      openedAt = motion ? now : now - 10;
      return motion ? 1 : 0;
    },
    update(step, elapsed, eye) {
      now = elapsed;
      // The lights: a flicker as they come on, then steady while the records are open.
      const t = elapsed - openedAt;
      const target = open ? (t < .4 ? (Math.sin(t * 70) > -.2 ? 1.2 : .1) : 1.1) : near(eye, center, 6, 16) * .12;
      glow += (target - glow) * (step > 0 ? 1 - Math.exp(-step * (open ? 30 : 2.5)) : 1);
      glass.emissiveIntensity = glow;
    }
  };
}
