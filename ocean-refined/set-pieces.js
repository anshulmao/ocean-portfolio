import * as THREE from './vendor/three.module.min.js';
import { seededRandom } from './assets.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const SITES = {
  about: { x: -12, z: -15, color: '#7ff0cf' },
  // About is the diver's helmet, Experience the nautilus on the deep ledge, Projects the coral nursery (landmark-builds.js).
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
  // Projects: a fragment table (where the nursery grows its smallest pieces) and broken branches on the sand.
  const pipe = batch('Nursery table frame', new THREE.CylinderGeometry(.028, .028, 1, 6), mat('#e6eae0'));
  const sprig = batch('Coral sprigs', new THREE.ConeGeometry(.035, .22, 5).translate(0, .11, 0), mat('#ffffff'));
  const rubble = batch('Coral rubble', new THREE.CylinderGeometry(.02, .035, 1, 5), mat('#e8e0cc'));
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
    // Projects (the nursery): a fragment table behind the trees, broken branches on the sand, stones framing the far side.
    placing = 'projects';
    { const { at, yaw } = frame('projects'), [tx, tz] = at(-5.8, .3), top = floor(tx, tz) + .72;
      for (const [da, db] of [[-.8, -.45], [.8, -.45], [-.8, .45], [.8, .45]]) { const [x, z] = at(-5.8 + da, .3 + db), y = floor(x, z); pipe(x, (y + top) / 2, z, [1, top - y + .05, 1]); }
      for (const db of [-.45, -.15, .15, .45]) { const [x, z] = at(-5.8, .3 + db); pipe(x, top, z, [1, 1.7, 1], [0, yaw, Math.PI / 2]); }
      for (const da of [-.8, .8]) { const [x, z] = at(-5.8 + da, .3); pipe(x, top, z, [1, .95, 1], [Math.PI / 2, yaw, 0]); }
      solid(tx, top - .3, tz, .9, .4, .55, 'Nursery table');
      const tips = ['#c58cff', '#ffd36a', '#ff8fb0', '#7fe0b0', '#d8c39a', '#e6c9a0'];
      for (let i = 0; i < 14; i++) { const [x, z] = at(-5.8 - .65 + (i % 7) * .22, .3 + (i < 7 ? -.15 : .15)); sprig(x, top + .03, z, [1, .8 + random() * .6, 1], [(random() - .5) * .4, random() * TAU, (random() - .5) * .4], tips[i % tips.length]); }
      for (let i = 0, n = economy ? 22 : 36; i < n; i++) {
        const angle = random() * TAU, radius = 1.6 + Math.pow(random(), .8) * 6.5, [x, z] = at(Math.cos(angle) * radius, Math.sin(angle) * radius);
        rubble(x, floor(x, z) + .03, z, [1, .18 + random() * .25, 1], [Math.PI / 2 + (random() - .5) * .3, random() * TAU, 0], random() < .3 ? '#d6c8aa' : '#ede7d6');
      }
      for (let i = 0; i < 10; i++) {
        const angle = 1.9 + random() * 2.6, radius = 8 + random() * 4, [x, z] = at(Math.cos(angle) * radius, Math.sin(angle) * radius), s = .4 + random() * .5;
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
