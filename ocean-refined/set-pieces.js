import * as THREE from './vendor/three.module.min.js';
import { seededRandom } from './assets.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { DESCENT_LINE } from './return-route.js';

const TAU = Math.PI * 2;
// How far outside a hull its oval runs (m).
const OUTSIDE = .9;
// span: the beacon's ripple and highlight plane, across (m); ring: the highlight's ring, as a share of its half width
// (round the helmet's plinth, the nautilus's alcove). The wreck's is an oval under her hull (round 16, the owner's notes:
// a circle round all of her was too big): stretch, the plane's scale along and across her; turn, her heading (rad, about
// y). Once she is built, place() fits it to her hull as it lies (her collision slabs: middle, heading and length; round
// 17, the oval stood off to one side of her, laid out from her charted spot and a heading guessed from it).
const SITES = {
  about: { x: -12, z: -15, color: '#7ff0cf', span: 13, ring: .44 },
  // About is the diver's helmet, Experience the nautilus on the deep ledge, Projects the sunken trawler (landmark-builds.js).
  experience: { x: -18, z: -82, color: '#ffcf7a', span: 13, ring: .5 },
  projects: { x: 18, z: -39, color: '#c9a2ff', span: 13, ring: .78, stretch: [2, .87], turn: Math.atan2(-.943, .332), hull: /^ship hull/ }
};

const beaconVertex = /* glsl */ `
varying vec3 vNormalW; varying vec3 vWorld; varying float vHeight;
void main(){
  vHeight = uv.y;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz; vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const beaconFragment = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uStrength; uniform float uSeed;
varying vec3 vNormalW; varying vec3 vWorld; varying float vHeight;
void main(){
  vec3 toEye = cameraPosition - vWorld; float distanceToEye = length(toEye);
  float facing = abs(dot(normalize(vNormalW), toEye / distanceToEye));
  float body = pow(facing, 1.6);
  float rise = pow(1.0 - vHeight, 1.5) * smoothstep(0.0, .04, vHeight);
  float drift = .78 + .22 * sin(vHeight * 9.0 - uTime * .7 + uSeed);
  float near = smoothstep(3.0, 11.0, distanceToEye);
  float far = exp(-distanceToEye * .011);
  gl_FragColor = vec4(uColor, body * rise * drift * near * far * uStrength);
}`;
// The ripple at a beacon's foot, and its highlight (uFocus, round 15: the owner's notes): while its site is pointed at or
// its card is up, a pool of light on the bottom under it and a ring round its foot (uRing, a share of the plane's half
// width) that pulses, in place of the circle that used to be drawn over it on the screen.
const ringFragment = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uStrength; uniform float uSeed; uniform float uFocus; uniform float uRing; uniform float uRipple; uniform float uAura;
varying vec2 vUv;
void main(){
  float radius = length(vUv - .5) * 2.0, ripple = radius * uRipple;
  float alpha = 0.0;
  for (int n = 0; n < 2; n++) {
    float phase = fract(uTime * .16 + uSeed + float(n) * .5);
    alpha += (1.0 - smoothstep(0.0, .07, abs(ripple - phase))) * (1.0 - phase) * (1.0 - phase);
  }
  alpha *= uStrength * .5 * step(ripple, 1.0);
  float beat = .5 + .5 * sin(uTime * 3.2);
  float ring = 1.0 - smoothstep(.012, .045 + beat * .02, abs(radius - uRing * (.96 + beat * .06)));
  float pool = exp(-radius * radius / (uRing * uRing * .7));
  alpha += uFocus * (ring * (.55 + .45 * beat) + pool * .24) * step(radius, 1.0);
  gl_FragColor = vec4(uColor, alpha * uAura);
}`;
const sparkVertex = /* glsl */ `
uniform float uTime; uniform float uHeight; uniform float uRatio;
attribute float aSeed; varying float vAlpha;
void main(){
  float life = fract(uTime * (.035 + aSeed * .03) + aSeed * 7.0);
  vec3 p = position; p.y = life * uHeight;
  p.x += sin(uTime * .5 + aSeed * 40.0) * .35; p.z += cos(uTime * .43 + aSeed * 23.0) * .35;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(90.0 * uRatio / max(1.0, -mv.z), 1.0, 6.0);
  vAlpha = sin(life * 3.14159) * exp(mv.z * .018);
}`;
const sparkFragment = /* glsl */ `
uniform vec3 uColor; uniform float uStrength; varying float vAlpha;
void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(uColor, smoothstep(.5, .05, d) * vAlpha * uStrength); }`;

// Composed props and light markers around the three portfolio landmarks. The
// props of a site are baked into one vertex-coloured mesh, so a site costs a
// draw call while it is near and none beyond
// the haze; the beacons stay separate, since they are meant to show through it.
export function createSetPieces({ terrainHeightAt = () => -20, collisions = null, economy = false } = {}) {
  const root = new THREE.Group(); root.name = 'Landmark set pieces';
  const random = seededRandom(4127), dummy = new THREE.Object3D(), color = new THREE.Color();
  const floor = (x, z) => terrainHeightAt(x, z);
  const mat = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: .82, ...extra });
  const batches = [];
  let placing = '';
  function batch(name, geometry, material) {
    const entries = [];
    batches.push({ name, geometry, material, entries });
    return (x, y, z, scale = [1, 1, 1], rotation = [0, 0, 0], tint = null) => {
      dummy.position.set(x, y, z); dummy.scale.set(...scale); dummy.rotation.set(...rotation); dummy.updateMatrix();
      entries.push({ matrix: dummy.matrix.clone(), tint, site: placing });
    };
  }
  const solid = (x, y, z, hx, hy, hz, name) => collisions?.addBox?.(new THREE.Box3(
    new THREE.Vector3(x - hx, y - hy, z - hz), new THREE.Vector3(x + hx, y + hy, z + hz)), { mesh: name, kind: 'prop' });

  const stone = mat('#6d7f93', { roughness: .95, flatShading: true });
  // Everything shades alike under the shared look; the colours are baked into vertices.
  const matte = mat('#ffffff', { vertexColors: true }), culled = [];
  const plain = geometry => { const g = geometry.index ? geometry.toNonIndexed() : geometry; for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name); return g; };

  const rockGeometry = new THREE.IcosahedronGeometry(1, 1), rp = rockGeometry.getAttribute('position');
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    const bump = 1 + .16 * Math.sin(x * 4.1 + y * 2.3) * Math.cos(z * 3.7 - y * 1.9) + .08 * Math.sin(z * 7.3 + x * 5.1);
    rp.setXYZ(i, x * bump, y * bump, z * bump);
  }
  rockGeometry.computeVertexNormals();
  const rock = batch('Framing stones', rockGeometry, stone);
  // About: the diver's kit around the helmet. A fin lies flat: blade along +x, the foot pocket at its heel.
  const finShape = new THREE.Shape([[0, -.07], [.28, -.09], [.62, -.13], [.95, -.14], [.98, -.06], [.92, 0], [.98, .06], [.95, .14], [.62, .13], [.28, .09], [0, .07]].map(([x, y]) => new THREE.Vector2(x, y)));
  const finBlade = new THREE.ExtrudeGeometry(finShape, { depth: .018, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const fin = batch('Fins', plain(finBlade), mat('#f2c230'));
  const finPocket = batch('Fin foot pockets', new THREE.SphereGeometry(1, 10, 6).scale(.17, .06, .085).translate(.15, .04, 0), mat('#2b2d30'));
  // An old brass lantern: base, a glass between four bars, a conical cap and a carrying ring.
  const lanternBars = [0, 1, 2, 3].map(i => plain(new THREE.CylinderGeometry(.009, .009, .2, 4).translate(Math.cos(i * Math.PI / 2 + .78) * .088, .15, Math.sin(i * Math.PI / 2 + .78) * .088)));
  const lantern = batch('Diving lantern', mergeGeometries([plain(new THREE.CylinderGeometry(.1, .11, .05, 12).translate(0, .025, 0)), plain(new THREE.CylinderGeometry(.045, .105, .09, 12).translate(0, .295, 0)), plain(new THREE.CylinderGeometry(.025, .025, .04, 8).translate(0, .355, 0)), ...lanternBars]), mat('#8e6c34'));
  const lanternGlass = batch('Lantern glass', new THREE.CylinderGeometry(.078, .078, .2, 12).translate(0, .15, 0), mat('#bfe3e6'));
  const lanternHandle = batch('Lantern handle', new THREE.TorusGeometry(.06, .011, 5, 14).translate(0, .42, 0), mat('#6f5424'));
  const strap = batch('Weight belt', new THREE.BoxGeometry(1.1, .014, .07), mat('#3c3a37'));
  const lead = batch('Weight belt lead', new THREE.BoxGeometry(.11, .07, .1), mat('#71767c'));
  // Projects: what a trawler loses when it goes down. Trawl floats, fish crates, a tyre fender, a coil of rope, a life
  // ring and the broken half of an outrigger boom.
  const float = batch('Trawl floats', new THREE.SphereGeometry(.2, 10, 7), mat('#ffffff'));
  const fishCrate = batch('Fish crates', new THREE.BoxGeometry(.7, .3, .45), mat('#ffffff'));
  const tyre = batch('Tyre fender', new THREE.TorusGeometry(.34, .13, 6, 14), mat('#26282a'));
  const coil = batch('Rope coil', new THREE.TorusGeometry(.32, .05, 5, 16), mat('#d9b35a'));
  const lifeRing = batch('Life ring', new THREE.TorusGeometry(.3, .07, 6, 16), mat('#e2553a'));
  const boom = batch('Broken outrigger', new THREE.CylinderGeometry(.08, .1, 1, 8), mat('#8a8c86'));
  // Experience: sea whips and fans, the deep reef's slow growers, in the shelter of the stones.
  const whip = batch('Sea whips', new THREE.CylinderGeometry(.012, .035, 1, 5).translate(0, .5, 0), mat('#ffffff'));
  const fan = batch('Sea fans', new THREE.IcosahedronGeometry(1, 1).scale(.85, .7, .05).translate(0, .62, 0), mat('#ffffff'));

  // Props are laid out in a site frame: +a points at the diver's approach
  // lane, which depends on each grounded model, so nothing blocks the view.
  let built = false;
  const fresh = [];
  function build(frames) {
    if (built) return; built = true;
    const frame = id => {
      const { x, z, angle = 0 } = frames[id], fx = Math.cos(angle), fz = Math.sin(angle);
      return { at: (a, b) => [x + fx * a - fz * b, z + fz * a + fx * b], yaw: -angle };
    };
    // About: fins dropped on the sand in front of the helmet's rock, a lantern and a weight belt beside it.
    placing = 'about';
    { const { at, yaw } = frame('about');
      for (const [a, b, turn, s] of [[1.55, 1.45, .7, 1.3], [1.85, 1.15, .45, 1.3]]) { const [x, z] = at(a, b), y = floor(x, z) + .02; fin(x, y, z, [s, s, s], [0, turn + yaw, .03]); finPocket(x, y, z, [s, s, s], [0, turn + yaw, .03]); }
      { const [x, z] = at(-.5, -1.75), y = floor(x, z) - .02, s = 1.6; lantern(x, y, z, [s, s, s], [.05, .3, -.04]); lanternGlass(x, y, z, [s, s, s], [.05, .3, -.04]); lanternHandle(x, y, z, [s, s, s], [.05, .3, -.04]); }
      { const [x, z] = at(1.25, -1.6), y = floor(x, z) + .01, turn = .9 + yaw; strap(x, y, z, [1, 1, 1], [0, turn, .02]);
        for (const d of [-.3, 0, .3]) { const px = x + Math.cos(turn) * d, pz = z - Math.sin(turn) * d; lead(px, floor(px, pz) + .035, pz, [1, 1, 1], [0, turn, 0]); } }
      for (let i = 0; i < 9; i++) {
        const angle = 1.3 + i / 8 * 3.6, radius = 4.6 + random() * 1.3, [x, z] = at(Math.cos(angle) * radius, Math.sin(angle) * radius), s = .32 + random() * .4;
        rock(x, floor(x, z) + s * .2, z, [s * 1.2, s * .7, s], [random(), random() * TAU, random()], i % 2 ? '#8496ab' : '#a3b1bf');
      }
    }
    // Projects (the trawler): its losses spilled on the sand on the far (high) side and off bow and stern, clear of the approach.
    placing = 'projects';
    { const { at, yaw } = frame('projects');
      for (const [a, b, tone] of [[-6.2, 3.1, '#f08a2c'], [-6.6, 3.6, '#f2c230'], [-5.9, 3.9, '#f08a2c'], [-7.4, -4.2, '#f2c230'], [-2.5, 10.2, '#f08a2c'], [-3.1, -10.6, '#f08a2c'], [-8.8, .6, '#f2c230']]) {
        const [x, z] = at(a, b); float(x, floor(x, z) + .16, z, [1, 1, 1], [0, 0, 0], tone);
      }
      for (const [a, b, turn, tone, stacked] of [[-5.4, -2.2, .4, '#2f6fb3', 0], [-5.6, -2.3, .5, '#c0392b', 1], [-7.9, 2.2, 1.3, '#2f6fb3', 0], [-1.8, 11.4, .2, '#2f6fb3', 0]]) {
        const [x, z] = at(a, b); fishCrate(x, floor(x, z) + .14 + stacked * .3, z, [1, 1, 1], [.04, turn + yaw, .05], tone);
      }
      { const [x, z] = at(-4.6, 6.8); tyre(x, floor(x, z) + .1, z, [1, 1, 1], [Math.PI / 2 - .08, 0, .3]); }
      { const [x, z] = at(-6.8, -1); coil(x, floor(x, z) + .05, z, [1, 1, 1], [Math.PI / 2, 0, 0]); coil(x + .05, floor(x, z) + .12, z + .04, [.8, .8, .8], [Math.PI / 2, 0, 0]); }
      { const [x, z] = at(-3.4, -9.4); lifeRing(x, floor(x, z) + .07, z, [1, 1, 1], [Math.PI / 2 - .1, 0, .4]); }
      { const [x, z] = at(-8.5, -7.5); boom(x, floor(x, z) + .1, z, [1, 6.5, 1], [Math.PI / 2 - .04, 0, .7 + yaw]); }
      for (let i = 0; i < 10; i++) {
        const angle = 1.9 + random() * 2.6, radius = 9.5 + random() * 4, [x, z] = at(Math.cos(angle) * radius, Math.sin(angle) * radius), s = .4 + random() * .5;
        rock(x, floor(x, z) + s * .25, z, [s * 1.2, s * .7, s], [random(), random() * TAU, random()], i % 2 ? '#8496ab' : '#a3b1bf');
      }
    }
    // Experience (the nautilus): a horseshoe of stone cradles it, sea whips and fans growing in its shelter.
    placing = 'experience';
    { const { at } = frame('experience');
      for (let i = 0; i < 8; i++) {
        // An arc of roughly 200 degrees, open toward the approach lane.
        const angle = Math.PI - 1.75 + i / 7 * 3.5, radius = 5.6 + (i % 2) * .7, s = 1 + random() * .75;
        const [x, z] = at(Math.cos(angle) * radius, Math.sin(angle) * radius), y = floor(x, z) + s * .35;
        rock(x, y, z, [s * 1.15, s * (.8 + random() * .5), s], [random() * .4, random() * TAU, random() * .4], i % 3 ? '#7385a0' : '#93a3b6');
        solid(x, y, z, s * .8, s * .75, s * .75, 'Nautilus alcove stone');
      }
      const whips = ['#d9643a', '#e8a33a', '#c94a5a', '#e07a4a'];
      for (let i = 0, n = economy ? 9 : 14; i < n; i++) {
        const angle = Math.PI - 1.6 + random() * 3.2, radius = 3.4 + random() * 1.8, [x, z] = at(Math.cos(angle) * radius, Math.sin(angle) * radius), h = 1.1 + random() * 1.4;
        whip(x, floor(x, z) - .05, z, [1, h, 1], [(random() - .5) * .35, 0, (random() - .5) * .35], whips[i % whips.length]);
      }
      for (let i = 0; i < 5; i++) {
        const angle = Math.PI - 1.3 + i / 4 * 2.6 + (random() - .5) * .3, radius = 4.3 + random(), [x, z] = at(Math.cos(angle) * radius, Math.sin(angle) * radius), s = .8 + random() * .5;
        fan(x, floor(x, z) - .05, z, [s, s, s], [0, angle + Math.PI / 2 + (random() - .5) * .5, 0], i % 2 ? '#a85fb0' : '#d9784a');
      }
    }
    // Bake: one mesh per site and surface, world-space vertices, material colour times tint in the vertex colour.
    const groups = new Map(), base = new THREE.Color(), normalMatrix = new THREE.Matrix3(), point = new THREE.Vector3(), normal = new THREE.Vector3();
    for (const { name, geometry, material, entries } of batches) {
      counts[name] = entries.length;
      const surface = matte, flat = material.flatShading && geometry.index ? geometry.toNonIndexed() : null;
      flat?.computeVertexNormals();
      const source = flat || geometry, p = source.getAttribute('position'), n = source.getAttribute('normal'), order = source.index;
      base.copy(material.color);
      for (const entry of entries) {
        const key = `${entry.site}|${surface.uuid}`;
        if (!groups.has(key)) groups.set(key, { site: entry.site, surface, position: [], normal: [], color: [], index: [] });
        const group = groups.get(key), start = group.position.length / 3;
        normalMatrix.getNormalMatrix(entry.matrix); color.set(entry.tint || '#ffffff').multiply(base);
        for (let i = 0; i < p.count; i++) {
          point.fromBufferAttribute(p, i).applyMatrix4(entry.matrix); normal.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
          group.position.push(point.x, point.y, point.z); group.normal.push(normal.x, normal.y, normal.z); group.color.push(color.r, color.g, color.b);
        }
        if (order) for (let i = 0; i < order.count; i++) group.index.push(start + order.getX(i));
        else for (let i = 0; i < p.count; i++) group.index.push(start + i);
      }
      flat?.dispose(); geometry.dispose();
    }
    for (const group of groups.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(group.position, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(group.normal, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(group.color, 3));
      geometry.setIndex(group.index); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, group.surface); mesh.name = `${group.site} set pieces · props`;
      root.add(mesh); culled.push(mesh); fresh.push(mesh);
    }
  }
  const counts = {};

  // Beacons: a soft column, a ripple at its foot and rising motes. They mark
  // each landmark through the haze without adding real lights to the scene.
  // aura: how bright the rings and the pool of light are (the visitor's Aura circles setting, movement-settings.js).
  const beacons = [], time = { value: 0 }, ratio = { value: 1 }, aura = { value: 1 };
  Object.entries(SITES).forEach(([id, site], index) => {
    const base = floor(site.x, site.z), height = Math.min(30, -base - 1.5);
    const uniforms = { uColor: { value: new THREE.Color(site.color) }, uTime: time, uStrength: { value: .5 }, uSeed: { value: index * 2.1 }, uHeight: { value: height }, uRatio: ratio, uFocus: { value: 0 }, uRing: { value: site.ring }, uRipple: { value: site.span / 13 }, uAura: aura };  // the ripple keeps its 13 m
    const group = new THREE.Group(); group.name = `${id} beacon`; group.position.set(site.x, base + .2, site.z);
    const options = { uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false };
    const column = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 1.5, height, 24, 1, true).translate(0, height / 2, 0),
      new THREE.ShaderMaterial({ ...options, vertexShader: beaconVertex, fragmentShader: beaconFragment }));
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(site.span, site.span).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ ...options, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: ringFragment }));
    ring.position.y = .25;
    if (site.stretch) { ring.scale.set(site.stretch[0], 1, site.stretch[1]); ring.rotation.y = site.turn; }
    const total = economy ? 26 : 44, positions = [], seeds = [];
    for (let i = 0; i < total; i++) { const a = random() * TAU, r = Math.sqrt(random()) * 2.4; positions.push(Math.cos(a) * r, 0, Math.sin(a) * r); seeds.push(random()); }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    const sparks = new THREE.Points(geometry, new THREE.ShaderMaterial({ ...options, vertexShader: sparkVertex, fragmentShader: sparkFragment }));
    // Sparks rise in the shader, so their bounds are stated here; the column
    // and ring then cull like any other mesh instead of drawing off screen.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, height / 2, 0), height / 2 + 3);
    for (const mesh of [column, ring, sparks]) { mesh.renderOrder = 3; group.add(mesh); }
    root.add(group); beacons.push({ id, group, ring, uniforms, found: false, focus: 0 });
  });
  // The résumé's slate hangs on the descent line in mid-water (reef.js RESUME_SITE): no column or motes there, only its
  // highlight, a ring round the line just under the slate.
  {
    const uniforms = { uColor: { value: new THREE.Color('#f4e3b5') }, uTime: time, uStrength: { value: 0 }, uSeed: { value: 7.3 }, uFocus: { value: 0 }, uRing: { value: .62 }, uRipple: { value: 0 }, uAura: aura };
    const group = new THREE.Group(); group.name = 'resume beacon'; group.position.set(DESCENT_LINE.x, -8.6, DESCENT_LINE.z);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: ringFragment }));
    ring.renderOrder = 3; group.add(ring); group.visible = false;
    root.add(group); beacons.push({ id: 'resume', group, uniforms, found: true, focus: 0, quiet: true });
  }
  // The site highlighted (site-cards.js): pointed at, or its card up; null for none.
  let focused = null;
  function focus(id = null) { focused = id; }

  /** Build props around the grounded landmarks and seat each beacon on its model. */
  // The oval under a hull, fitted to its collision slabs: their middle, the line they run along, and their reach along
  // and across it, the ring just outside them (OUTSIDE m).
  function fitHull(beacon, site) {
    const boxes = (collisions?.boxes || []).filter(entry => site.hull.test(entry.mesh || '')); if (boxes.length < 4) return;
    let mx = 0, mz = 0; for (const { box } of boxes) { mx += (box.min.x + box.max.x) / 2; mz += (box.min.z + box.max.z) / 2; } mx /= boxes.length; mz /= boxes.length;
    let xx = 0, zz = 0, xz = 0;
    for (const { box } of boxes) { const dx = (box.min.x + box.max.x) / 2 - mx, dz = (box.min.z + box.max.z) / 2 - mz; xx += dx * dx; zz += dz * dz; xz += dx * dz; }
    const angle = .5 * Math.atan2(2 * xz, xx - zz), ux = Math.cos(angle), uz = Math.sin(angle);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const { box } of boxes) for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) {
      const a = (x - mx) * ux + (z - mz) * uz, b = -(x - mx) * uz + (z - mz) * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
    }
    const am = (a0 + a1) / 2, bm = (b0 + b1) / 2, cx = mx + ux * am - uz * bm, cz = mz + uz * am + ux * bm, radius = site.ring * site.span / 2;
    const ring = beacon.ring, group = beacon.group;
    // The plane's x runs along her (rotation about y: x goes to cos, -sin), its z across.
    ring.rotation.y = Math.atan2(-uz, ux);
    ring.scale.set(((a1 - a0) / 2 + OUTSIDE) / radius, 1, ((b1 - b0) / 2 + OUTSIDE) / radius);
    group.position.set(cx, floor(cx, cz) + .2, cz); ring.position.set(0, .25, 0);
  }
  function place(landmarks = []) {
    const frames = {};
    for (const [id, site] of Object.entries(SITES)) {
      const landmark = landmarks.find(item => item.id === id), [x, , z] = landmark?.position || [site.x, 0, site.z];
      const [ax, , az] = landmark?.interactionPosition || [x + 1, 0, z];
      frames[id] = { x, z, angle: Math.atan2(az - z, ax - x) };
      const beacon = beacons.find(item => item.id === id);
      beacon.group.position.set(x, floor(x, z) + .2, z);
      if (site.hull) fitHull(beacon, site);
    }
    build(frames);
    // The meshes just built, for a caller that wants their shaders ready before they show (userData.waiting keeps one hidden, see cull).
    return fresh.splice(0);
  }
  function setFound(id, found = true) { const beacon = beacons.find(item => item.id === id); if (beacon) beacon.found = found; }
  function update(elapsed, cameraPosition, night = 0, depth = 0, pixelRatio = 1, brightness = 1) {
    aura.value = brightness;
    const step = Math.min(.1, Math.max(0, elapsed - time.value)); time.value = elapsed; ratio.value = pixelRatio;
    for (const beacon of beacons) {
      // The highlight eases in and out over about half a second.
      beacon.focus += ((focused === beacon.id ? 1 : 0) - beacon.focus) * (1 - Math.exp(-step * 7)); if (beacon.focus < .002) beacon.focus = 0;
      beacon.uniforms.uFocus.value = beacon.focus;
      if (beacon.quiet) { beacon.group.visible = beacon.focus > 0 && brightness > 0; continue; }
      // A visited landmark settles to a quieter glow; the next one stays bright.
      const target = (beacon.found ? .2 : .52) + depth * .22 + night * .18;
      beacon.uniforms.uStrength.value += (target - beacon.uniforms.uStrength.value) * .04;
    }
  }
  // view: { frustum, eye, range }, or null to show everything. Props are small: the haze has them well before the range.
  function cull(view = null) {
    for (const mesh of culled) { const sphere = mesh.geometry.boundingSphere; mesh.visible = !mesh.userData.waiting && (!view || view.eye.distanceTo(sphere.center) - sphere.radius < view.range * .7); }
  }
  return { root, place, update, cull, setFound, focus, counts, sites: SITES };
}
