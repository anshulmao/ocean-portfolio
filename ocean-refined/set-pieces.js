import * as THREE from './vendor/three.module.min.js';
import { seededRandom } from './assets.js';

const TAU = Math.PI * 2;
const SITES = {
  about: { x: -12, z: -15, color: '#7ff0cf' },
  // Experience is the treasure on the deep ledge, Projects the wreck.
  experience: { x: -18, z: -82, color: '#ffcf7a' },
  projects: { x: 18, z: -39, color: '#c9a2ff' }
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
const ringFragment = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uStrength; uniform float uSeed;
varying vec2 vUv;
void main(){
  float radius = length(vUv - .5) * 2.0;
  float alpha = 0.0;
  for (int n = 0; n < 2; n++) {
    float phase = fract(uTime * .16 + uSeed + float(n) * .5);
    alpha += (1.0 - smoothstep(0.0, .07, abs(radius - phase))) * (1.0 - phase) * (1.0 - phase);
  }
  gl_FragColor = vec4(uColor, alpha * uStrength * .5);
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
// props of a site are baked into one mesh per kind of surface (matte, gold,
// gem), so a site costs a draw call or three while it is near and none beyond
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

  const iron = mat('#4d5a66', { roughness: .7 }), wood = mat('#8a6a4c'), clay = mat('#c98a5e');
  const stone = mat('#6d7f93', { roughness: .95, flatShading: true });
  const gold = mat('#f3c552', { roughness: .42, emissive: '#b8791a', emissiveIntensity: .55 });
  const gem = mat('#ffffff', { roughness: .2, flatShading: true, vertexColors: true });
  // Iron, wood, clay and stone shade alike under the shared look; their colours are baked into vertices.
  const matte = mat('#ffffff', { vertexColors: true }), culled = [];

  const link = batch('Anchor chain links', new THREE.TorusGeometry(.17, .045, 5, 10), iron);
  const amphora = batch('Half-buried amphorae', new THREE.LatheGeometry([
    [.07, 0], [.2, .1], [.3, .38], [.27, .66], [.13, .86], [.11, 1.02], [.17, 1.08]
  ].map(([r, y]) => new THREE.Vector2(r, y)), 10), clay);
  const rockGeometry = new THREE.IcosahedronGeometry(1, 1), rp = rockGeometry.getAttribute('position');
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    const bump = 1 + .16 * Math.sin(x * 4.1 + y * 2.3) * Math.cos(z * 3.7 - y * 1.9) + .08 * Math.sin(z * 7.3 + x * 5.1);
    rp.setXYZ(i, x * bump, y * bump, z * bump);
  }
  rockGeometry.computeVertexNormals();
  const rock = batch('Framing stones', rockGeometry, stone);
  const barrel = batch('Cargo barrels', new THREE.LatheGeometry([
    [0, 0], [.3, 0], [.36, .25], [.38, .5], [.36, .75], [.3, 1], [0, 1]
  ].map(([r, y]) => new THREE.Vector2(r, y)), 10), wood);
  const hoop = batch('Barrel hoops', new THREE.TorusGeometry(.375, .022, 4, 12), iron);
  const crate = batch('Cargo crates and planks', new THREE.BoxGeometry(1, 1, 1), wood);
  const mast = batch('Fallen spars', new THREE.CylinderGeometry(.16, .22, 1, 8), wood);
  const cannon = batch('Deck cannons', new THREE.LatheGeometry([
    [0, 0], [.2, 0], [.23, .12], [.19, .2], [.17, 1.1], [.14, 1.6], [.17, 1.66], [.1, 1.7], [0, 1.7]
  ].map(([r, y]) => new THREE.Vector2(r, y)), 10), iron);
  const ball = batch('Cannonballs', new THREE.SphereGeometry(.11, 8, 6), iron);
  const coin = batch('Spilled coins', new THREE.CylinderGeometry(.06, .06, .014, 8), gold);
  const goblet = batch('Gold goblets', new THREE.LatheGeometry([
    [.1, 0], [.03, .04], [.025, .2], [.11, .3], [.13, .42]
  ].map(([r, y]) => new THREE.Vector2(r, y)), 8), gold);
  const jewel = batch('Scattered gems', new THREE.OctahedronGeometry(.09, 0), gem);

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
    // About: the anchor's chain trails off across the sand toward old pottery.
    placing = 'about';
    { const { at, yaw } = frame('about'), path = t => at(-1.4 - t * 8.2, .8 + Math.sin(t * 2.6) * 2.6);
      for (let i = 0; i < 30; i++) {
        const [x, z] = path(i / 29), [nx, nz] = path(i / 29 + .03);
        link(x, floor(x, z) + .07, z, [1, 1, 1], [i % 2 ? Math.PI / 2 : .25, Math.atan2(nx - x, nz - z), 0]);
      }
      [[-9.4, 4.2, 1.15, 1.1], [-10.6, 3.2, .5, .85], [-3.4, 5.2, -1.3, 1], [1.6, -5.4, .35, .9]].forEach(([a, b, tilt, s], i) => {
        const [x, z] = at(a, b); amphora(x, floor(x, z) - .06, z, [s, s, s], [tilt, a + yaw, 0], ['#c98a5e', '#b9785a', '#d6a071'][i % 3]);
      });
      for (let i = 0; i < 9; i++) {
        const angle = 1.3 + i / 8 * 3.6, radius = 4.6 + random() * 1.3, [x, z] = at(Math.cos(angle) * radius, Math.sin(angle) * radius), s = .32 + random() * .4;
        rock(x, floor(x, z) + s * .2, z, [s * 1.2, s * .7, s], [random(), random() * TAU, random()], i % 2 ? '#8496ab' : '#a3b1bf');
      }
    }
    // Projects (the wreck): cargo and spars thrown clear of the hull on its far side.
    placing = 'projects';
    { const { at, yaw } = frame('projects');
      [[-10.5, 3.2, 0], [-11.6, 2.4, 0], [-10.9, 4.4, 1], [-12.6, -3.8, 1], [-9.6, -6.2, 0], [-4.5, 12.6, 1]].forEach(([a, b, lying], i) => {
        const [x, z] = at(a, b), y = floor(x, z), s = .95 + (i % 3) * .12;
        if (lying) barrel(x, y + .36 * s, z, [s, s, s], [Math.PI / 2, 0, i * 1.3]);
        else { barrel(x, y - .05, z, [s, s, s]); for (const h of [.25, .75]) hoop(x, y - .05 + h * s, z, [s, s, s], [Math.PI / 2, 0, 0]); }
      });
      { const [x, z] = at(-11, 3.3); solid(x, floor(x, z) + .5, z, 1.2, .6, 1.2, 'Wreck cargo barrels'); }
      for (const [a, b, s, turn] of [[-13.2, 1.2, .8, .4], [-13.6, .2, .6, 1.2], [-8.8, -8.4, .7, 2.2], [-2.6, 13.6, .75, .9]]) {
        const [x, z] = at(a, b); crate(x, floor(x, z) + s * .42, z, [s, s, s], [.08, turn, .12], '#7d6048');
      }
      for (let i = 0; i < 12; i++) {
        const angle = 1.9 + random() * 2.6, radius = 9 + random() * 6, [x, z] = at(Math.cos(angle) * radius, Math.sin(angle) * radius);
        crate(x, floor(x, z) + .05, z, [1.4 + random() * 1.4, .07, .24], [(random() - .5) * .25, random() * TAU, (random() - .5) * .2], i % 2 ? '#94765a' : '#6f5642');
      }
      { const [x, z] = at(-12.5, -9.5); mast(x, floor(x, z) + .3, z, [1, 9.5, 1], [Math.PI / 2 - .05, 0, .9 + yaw]); }
      for (const [a, b, turn] of [[-9.2, 7.6, .7], [-7.4, -11.2, 2.5]]) {
        const [x, z] = at(a, b); cannon(x, floor(x, z) + .22, z, [1, 1, 1], [Math.PI / 2 - .12, 0, turn]);
        for (let n = 0; n < 4; n++) { const [bx, bz] = at(a + 1 + (n % 2) * .24, b + .6 + Math.floor(n / 2) * .24); ball(bx, floor(bx, bz) + .1, bz); }
      }
    }
    // Experience (the treasure): the chests have spilled, and a horseshoe of stone cradles them.
    placing = 'experience';
    { const { at } = frame('experience'), origin = frames.experience, centers = [[origin.x, origin.z], origin.second || [origin.x + 2.9, origin.z - 1.35]];
      const middle = [(centers[0][0] + centers[1][0]) / 2 - origin.x, (centers[0][1] + centers[1][1]) / 2 - origin.z];
      for (let i = 0, coins = economy ? 90 : 170; i < coins; i++) {
        const [ox, oz] = centers[i % 2], angle = random() * TAU, radius = .7 + Math.pow(random(), 1.6) * 2.6;
        const x = ox + Math.cos(angle) * radius, z = oz + Math.sin(angle) * radius;
        coin(x, floor(x, z) + .03 + random() * .03, z, [1, 1, 1], [(random() - .5) * .9, random() * TAU, (random() - .5) * .9]);
      }
      const gems = ['#ff6f8f', '#62e6c5', '#7fa8ff', '#ffd76a', '#c58cff'];
      for (let i = 0; i < 16; i++) {
        const [ox, oz] = centers[i % 2], angle = random() * TAU, radius = .9 + random() * 2.2, x = ox + Math.cos(angle) * radius, z = oz + Math.sin(angle) * radius;
        jewel(x, floor(x, z) + .08, z, [1, 1.3, 1], [random(), random() * TAU, random()], gems[i % gems.length]);
      }
      for (const [a, b, tilt] of [[1.4, 1.5, 0], [-1.3, -1.2, 1.4], [2.2, -2.4, -1.2]]) { const [x, z] = at(a, b); goblet(x, floor(x, z) + (tilt ? .1 : 0), z, [1.2, 1.2, 1.2], [tilt, a, 0]); }
      for (let i = 0; i < 8; i++) {
        // An arc of roughly 200 degrees, open toward the approach lane.
        const angle = Math.PI - 1.75 + i / 7 * 3.5, radius = 6.3 + (i % 2) * .7, s = 1 + random() * .75;
        const [x, z] = at(Math.cos(angle) * radius, Math.sin(angle) * radius), wx = x + middle[0], wz = z + middle[1], y = floor(wx, wz) + s * .35;
        rock(wx, y, wz, [s * 1.15, s * (.8 + random() * .5), s], [random() * .4, random() * TAU, random() * .4], i % 3 ? '#7385a0' : '#93a3b6');
        solid(wx, y, wz, s * .8, s * .75, s * .75, 'Treasure alcove stone');
      }
    }
    // Bake: one mesh per site and surface, world-space vertices, material colour times tint in the vertex colour.
    const groups = new Map(), base = new THREE.Color(), normalMatrix = new THREE.Matrix3(), point = new THREE.Vector3(), normal = new THREE.Vector3();
    for (const { name, geometry, material, entries } of batches) {
      counts[name] = entries.length;
      const surface = material === gold ? gold : material === gem ? gem : matte, flat = material.flatShading && geometry.index ? geometry.toNonIndexed() : null;
      flat?.computeVertexNormals();
      const source = flat || geometry, p = source.getAttribute('position'), n = source.getAttribute('normal'), order = source.index;
      base.copy(surface === gold ? color.set('#ffffff') : material.color);
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
      const mesh = new THREE.Mesh(geometry, group.surface); mesh.name = `${group.site} set pieces · ${group.surface === gold ? 'gold' : group.surface === gem ? 'gems' : 'props'}`;
      root.add(mesh); culled.push(mesh); fresh.push(mesh);
    }
  }
  const counts = {};

  // Beacons: a soft column, a ripple at its foot and rising motes. They mark
  // each landmark through the haze without adding real lights to the scene.
  const beacons = [], time = { value: 0 }, ratio = { value: 1 };
  Object.entries(SITES).forEach(([id, site], index) => {
    const base = floor(site.x, site.z), height = Math.min(30, -base - 1.5);
    const uniforms = { uColor: { value: new THREE.Color(site.color) }, uTime: time, uStrength: { value: .5 }, uSeed: { value: index * 2.1 }, uHeight: { value: height }, uRatio: ratio };
    const group = new THREE.Group(); group.name = `${id} beacon`; group.position.set(site.x, base + .2, site.z);
    const options = { uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false };
    const column = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 1.5, height, 24, 1, true).translate(0, height / 2, 0),
      new THREE.ShaderMaterial({ ...options, vertexShader: beaconVertex, fragmentShader: beaconFragment }));
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ ...options, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: ringFragment }));
    ring.position.y = .25;
    const total = economy ? 26 : 44, positions = [], seeds = [];
    for (let i = 0; i < total; i++) { const a = random() * TAU, r = Math.sqrt(random()) * 2.4; positions.push(Math.cos(a) * r, 0, Math.sin(a) * r); seeds.push(random()); }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    const sparks = new THREE.Points(geometry, new THREE.ShaderMaterial({ ...options, vertexShader: sparkVertex, fragmentShader: sparkFragment }));
    // Sparks rise in the shader, so their bounds are stated here; the column
    // and ring then cull like any other mesh instead of drawing off screen.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, height / 2, 0), height / 2 + 3);
    for (const mesh of [column, ring, sparks]) { mesh.renderOrder = 3; group.add(mesh); }
    root.add(group); beacons.push({ id, group, uniforms, found: false });
  });

  /** Build props around the grounded landmarks and seat each beacon on its model. */
  function place(landmarks = []) {
    const frames = {};
    for (const [id, site] of Object.entries(SITES)) {
      const landmark = landmarks.find(item => item.id === id), [x, , z] = landmark?.position || [site.x, 0, site.z];
      const [ax, , az] = landmark?.interactionPosition || [x + 1, 0, z];
      frames[id] = { x, z, angle: Math.atan2(az - z, ax - x) };
      beacons.find(item => item.id === id).group.position.set(x, floor(x, z) + .2, z);
    }
    build(frames);
    // The meshes just built, for a caller that wants their shaders ready before they show (userData.waiting keeps one hidden, see cull).
    return fresh.splice(0);
  }
  function setFound(id, found = true) { const beacon = beacons.find(item => item.id === id); if (beacon) beacon.found = found; }
  function update(elapsed, cameraPosition, night = 0, depth = 0, pixelRatio = 1) {
    time.value = elapsed; ratio.value = pixelRatio;
    gold.emissiveIntensity = .45 + depth * .5 + night * .35 + Math.sin(elapsed * .8) * .06;
    for (const beacon of beacons) {
      // A visited landmark settles to a quieter glow; the next one stays bright.
      const target = (beacon.found ? .2 : .52) + depth * .22 + night * .18;
      beacon.uniforms.uStrength.value += (target - beacon.uniforms.uStrength.value) * .04;
    }
  }
  // view: { frustum, eye, range }, or null to show everything. Props are small: the haze has them well before the range.
  function cull(view = null) {
    for (const mesh of culled) { const sphere = mesh.geometry.boundingSphere; mesh.visible = !mesh.userData.waiting && (!view || view.eye.distanceTo(sphere.center) - sphere.radius < view.range * .7); }
  }
  return { root, place, update, cull, setFound, counts, sites: SITES };
}
