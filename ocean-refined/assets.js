import * as THREE from './vendor/three.module.min.js';
import { weatherUniforms } from './shaders.js';

// All assets are generated locally: no model downloads, textures or HDR maps.
export function seededRandom(seed = 821) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Each puff is a camera-facing quad shaded as a sphere, then bent toward the
// shape of the whole cloud so a cluster lights as one body: sunlit shoulders,
// a shaded flat base, soft stepped bands and a bright rim against the sun.
// Drawn twice: solid cores first, nearest first, writing depth, so a pixel
// inside a cloud is shaded once however many puffs overlap it; then only the
// soft fringes are blended. Blending whole puffs cost several ms of overdraw.
const cloudVertex = /* glsl */ `
attribute vec4 aPuff;attribute vec4 aLocal;attribute vec2 aExtra;
uniform vec4 uFlash;uniform vec4 uCloudHaze;
varying vec2 vUv;varying vec3 vRight;varying vec3 vUp;varying vec3 vToEye;varying vec4 vLocal;varying vec3 vExtra;varying float vHaze;
void main(){
  vec3 toEye=normalize(cameraPosition-aPuff.xyz);
  vHaze=smoothstep(450.0,1500.0,distance(cameraPosition,aPuff.xyz))*uCloudHaze.w;
  vec3 right=normalize(cross(vec3(0.0,1.0,0.0),toEye)),up=cross(toEye,right);
  vUv=position.xy;vRight=right;vUp=up;vToEye=toEye;vLocal=aLocal;
  vExtra=vec3(aExtra,uFlash.w*(.25+.75*pow(max(dot(-toEye,uFlash.xyz),0.0),2.0)));
  gl_Position=projectionMatrix*viewMatrix*vec4(aPuff.xyz+(right*position.x+up*position.y)*aPuff.w,1.0);
}`;
const cloudFragment = /* glsl */ `
uniform vec3 uCloudLit;uniform vec3 uCloudShade;uniform vec3 uCloudRim;uniform vec3 uCloudSun;uniform vec4 uCloudHaze;uniform vec2 uCloudSoft;uniform float uDive;uniform sampler2D uNoiseMap;
varying vec2 vUv;varying vec3 vRight;varying vec3 vUp;varying vec3 vToEye;varying vec4 vLocal;varying vec3 vExtra;varying float vHaze;
void main(){
  float r2=dot(vUv,vUv);
  // Baked noise frays the silhouette, so no puff ends in a clean circle.
  float fray=texture2D(uNoiseMap,vUv*.04+vExtra.x).r-.47;
  // A cloud arriving or leaving erodes inward from its edges, so it keeps a solid core while it fades.
  float shape=r2+fray*1.7+(1.0-vLocal.w)*1.25;
  #ifdef CLOUD_CORE
  float alpha=1.0;
  if(shape>uCloudSoft.x)discard;
  #else
  float alpha=smoothstep(1.0,uCloudSoft.x,shape)*min(vLocal.w*5.0,1.0)*(1.0-uDive);
  if(alpha<.012)discard;
  #endif
  float z=sqrt(max(1.0-r2,0.0));
  vec3 n=normalize(vRight*vUv.x+vUp*vUv.y+vToEye*z);
  n=normalize(mix(n,normalize(vLocal.xyz*vec3(1.0,.6,1.0)+vec3(0.0,.35,0.0)),.62));
  float height=clamp(.5+.5*(vLocal.y+vUv.y*vExtra.y),0.0,1.0);
  float lit=clamp((dot(n,uCloudSun)*.6+.46)*(.2+.8*smoothstep(.0,.66,height))+fray*.3,0.0,1.0);
  lit=(floor(lit*4.0)+smoothstep(.2,.8,fract(lit*4.0)))*.25;
  vec3 color=mix(uCloudShade,uCloudLit,lit);
  // Silver lining on the crowns when the sun is behind the cloud; distance pales it into the horizon.
  color+=uCloudRim*pow(max(dot(-vToEye,uCloudSun),0.0),5.0)*(1.0-z)*smoothstep(-.2,.8,vLocal.y);
  color=mix(color,uCloudHaze.rgb,vHaze)+vec3(.30,.36,.50)*vExtra.z;
  // The palette arrives already tone mapped (see display()), so overlapping puffs cost a blend, not a film curve each.
  gl_FragColor=vec4(color,alpha);
}`;

// Cumulus field: a few hero clouds, a mid layer and small scud, plus a reserve
// that only fades in as the weather closes. Tuning: [count, economy count,
// width range (m), puffs, base height range (m), reserve].
const CLOUD_LAYERS = [
  [8, 4, [330, 500], 16, [95, 135], false],
  [20, 10, [160, 260], 10, [105, 170], false],
  [22, 10, [70, 120], 6, [100, 210], false],
  [20, 10, [260, 440], 11, [95, 140], true]
];
// The scene's exposure above water; display() repeats the renderer's ACES curve and sRGB encoding for the cloud palette.
const EXPOSURE = 1.15;
function display(color) {
  const r = color.r * EXPOSURE / .6, g = color.g * EXPOSURE / .6, b = color.b * EXPOSURE / .6;
  const fit = v => (v * (v + .0245786) - .000090537) / (v * (.983729 * v + .432951) + .238081);
  const x = fit(.59719 * r + .35458 * g + .04823 * b), y = fit(.076 * r + .90834 * g + .01566 * b), z = fit(.0284 * r + .13383 * g + .83777 * b);
  const encode = v => { v = Math.min(1, Math.max(0, v)); return v <= .0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - .055; };
  color.r = encode(1.60475 * x - .53108 * y - .07367 * z); color.g = encode(-.10208 * x + 1.10813 * y - .00605 * z); color.b = encode(-.00327 * x - .07276 * y + 1.07602 * z);
  return color;
}
const CLOUD_FIELD = 3200, CLOUD_NEAR = [500, 640], CLOUD_RESERVE_NEAR = [780, 940], CLOUD_FAR = [1360, 1500], CLOUD_CURVE = 8e-5;

export function createClouds({ uniforms, economy = false } = {}) {
  uniforms = weatherUniforms(uniforms ?? { uNight: { value: 0 }, uDive: { value: 0 }, uSun: { value: new THREE.Vector3(-.4, .6, -.7).normalize() }, uMoon: { value: new THREE.Vector3(.4, .5, .7).normalize() } });
  const random = seededRandom(2917), between = ([low, high]) => low + random() * (high - low);
  const clouds = [], puffs = [];
  for (const [count, lean, width, perCloud, base, reserve] of CLOUD_LAYERS) for (let i = 0; i < (economy ? lean : count); i++) {
    const w = between(width), depth = w * (.45 + random() * .25), tall = w * (.2 + random() * .1);
    const cloud = { x: (random() - .5) * CLOUD_FIELD, y: between(base), z: (random() - .5) * CLOUD_FIELD, need: reserve ? .06 + random() * .5 : 0, shy: !reserve && random() < .4, alpha: 0 };
    const first = puffs.length; let top = 1;
    for (let j = 0; j < perCloud; j++) {
      const crown = j >= perCloud * .6, u = random() * 2 - 1, v = random() * 2 - 1, reach = crown ? .5 : .95;
      const radius = crown ? w * (.115 + .085 * random()) : w * (.125 + .075 * random()) * Math.sqrt(1 - u * u * .75);
      const y = radius * .8 + (crown ? tall * (.4 + .6 * random()) * (1 - u * u) : 0);
      puffs.push({ cloud, x: u * w * .5 * reach, y, z: v * depth * .5 * reach, radius, seed: random() * 8, lx: u * reach, lz: v * reach });
      top = Math.max(top, y + radius);
    }
    for (let j = first; j < puffs.length; j++) { puffs[j].ly = puffs[j].y / top * 2 - 1; puffs[j].span = puffs[j].radius / top * 2; }
    clouds.push(cloud);
  }
  const STRIDE = 10, quad = new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3);
  function instances() {
    const data = new Float32Array(puffs.length * STRIDE), buffer = new THREE.InstancedInterleavedBuffer(data, STRIDE);
    buffer.setUsage(THREE.DynamicDrawUsage);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', quad); geometry.setIndex([0, 1, 2, 2, 1, 3]);
    geometry.setAttribute('aPuff', new THREE.InterleavedBufferAttribute(buffer, 4, 0));
    geometry.setAttribute('aLocal', new THREE.InterleavedBufferAttribute(buffer, 4, 4));
    geometry.setAttribute('aExtra', new THREE.InterleavedBufferAttribute(buffer, 2, 8));
    return { data, buffer, geometry };
  }
  const fringe = instances(), core = instances();
  const lit = new THREE.Color(), shade = new THREE.Color(), rim = new THREE.Color(), tint = new THREE.Color(), sunward = new THREE.Vector3(0, 1, 0), hazeColor = new THREE.Vector4(), soft = new THREE.Vector2(.68, 1);
  const cloudUniforms = { uCloudLit: { value: lit }, uCloudShade: { value: shade }, uCloudRim: { value: rim }, uCloudSun: { value: sunward }, uCloudHaze: { value: hazeColor }, uCloudSoft: { value: soft },
    uDive: uniforms.uDive, uFlash: uniforms.uFlash, uNoiseMap: uniforms.uNoiseMap };
  const material = new THREE.ShaderMaterial({ uniforms: cloudUniforms, vertexShader: cloudVertex, fragmentShader: cloudFragment,
    transparent: true, depthWrite: false, depthFunc: THREE.LessDepth, fog: false });
  const coreMaterial = new THREE.ShaderMaterial({ uniforms: cloudUniforms, vertexShader: cloudVertex, fragmentShader: cloudFragment,
    defines: { CLOUD_CORE: 1 }, fog: false });
  const mesh = new THREE.Mesh(fringe.geometry, material), solid = new THREE.Mesh(core.geometry, coreMaterial);
  // Cores go after the water and before the sky fills what is left; fringes after the stars, before anything else transparent.
  mesh.frustumCulled = solid.frustumCulled = false; mesh.renderOrder = -50; solid.renderOrder = 25; mesh.name = 'Cumulus fringes'; solid.name = 'Cumulus cores';
  const group = new THREE.Group(); group.name = 'Volumetric cumulus field'; group.add(solid, mesh);

  const litDay = new THREE.Color(1, .985, .95), litGold = new THREE.Color(1, .60, .35), litNight = new THREE.Color(.075, .10, .15);
  const shadeDay = new THREE.Color(.40, .48, .61), shadeGold = new THREE.Color(.36, .24, .38), shadeNight = new THREE.Color(.022, .032, .055);
  const rimDay = new THREE.Color(.55, .52, .44), rimGold = new THREE.Color(1, .58, .28);
  const position = new Float32Array(puffs.length * 3), range = new Float32Array(puffs.length), order = new Uint16Array(puffs.length).map((_, i) => i);
  const half = CLOUD_FIELD / 2, wrap = v => ((v + half) % CLOUD_FIELD + CLOUD_FIELD) % CLOUD_FIELD - half;
  const { smoothstep } = THREE.MathUtils;
  const tint4 = new THREE.Vector4();
  let sortIn = 0;

  function update(eye, underwater = 0) {
    group.visible = underwater < .995;
    if (!group.visible) return;
    const over = uniforms.uWeather.value.w, offset = uniforms.uCloudOffset.value, night = uniforms.uNight.value, sun = uniforms.uSun.value;
    const low = uniforms.uDeckLow.value, high = uniforms.uDeckHigh.value;
    const golden = (1 - smoothstep(Math.abs(sun.y), .025, .24)) * (1 - night * .65);
    lit.copy(litDay).lerp(litGold, golden * .85).lerp(litNight, night).lerp(tint.setRGB(high.x * 1.06, high.y * 1.06, high.z * 1.06), Math.min(1, over * 1.1));
    shade.copy(shadeDay).lerp(shadeGold, golden * .8).lerp(shadeNight, night).lerp(tint.setRGB(low.x * .88, low.y * .88, low.z * .88), Math.min(1, over * 1.1));
    // Far clouds pale toward the horizon colour (not at dusk, when the horizon is not one colour); storm scud is softer and thinner.
    hazeColor.set(THREE.MathUtils.lerp(.50, .057, night), THREE.MathUtils.lerp(.70, .101, night), THREE.MathUtils.lerp(.80, .17, night), .55 * (1 - golden)).lerp(tint4.set(low.x, low.y, low.z, .85), over);
    soft.set(.74 - over * .14, 1);
    display(lit); display(shade); display(tint.setRGB(hazeColor.x, hazeColor.y, hazeColor.z)); hazeColor.x = tint.r; hazeColor.y = tint.g; hazeColor.z = tint.b;
    rim.copy(rimDay).lerp(rimGold, golden).multiplyScalar(.6 * (1 - night) * (1 - over));
    // The light swings from the sun to the moon through dusk instead of snapping.
    sunward.copy(sun); sunward.y = Math.max(sunward.y, .06); sunward.lerp(uniforms.uMoon.value, smoothstep(night, .55, .95)).normalize();
    // Weather swells every cloud and lowers its base; the wind carries the field across a wrapping square.
    // Night thins the fair-weather field, leaving more of the sky to the stars.
    const grow = 1 + over * .22, sink = over * 22, shyAlpha = 1 - smoothstep(night, .35, .9) * (1 - over);
    for (const cloud of clouds) {
      cloud.wx = wrap(cloud.x + offset.x); cloud.wz = wrap(cloud.z + offset.y);
      const away = Math.hypot(cloud.wx - eye.x, cloud.wz - eye.z);
      // A little false curvature drops distant clouds onto the horizon, where the big banks belong.
      cloud.drop = sink + away * away * CLOUD_CURVE;
      // Nothing hangs overhead (the sky shader owns the zenith) and the far edge fades before the clip plane.
      // The storm reserve stays a distant bank: close overhead it would only be fill the deck already covers.
      const near = cloud.need ? CLOUD_RESERVE_NEAR : CLOUD_NEAR;
      cloud.alpha = smoothstep(away, near[0], near[1]) * (1 - smoothstep(away, CLOUD_FAR[0], CLOUD_FAR[1]))
        * (cloud.need ? smoothstep(over, cloud.need, cloud.need + .22) : cloud.shy ? shyAlpha : 1);
    }
    for (let i = 0; i < puffs.length; i++) {
      const puff = puffs[i], cloud = puff.cloud, x = cloud.wx + puff.x * grow, y = cloud.y - cloud.drop + puff.y * grow, z = cloud.wz + puff.z * grow;
      position[i * 3] = x; position[i * 3 + 1] = y; position[i * 3 + 2] = z;
      range[i] = (x - eye.x) ** 2 + (y - eye.y) ** 2 + (z - eye.z) ** 2;
    }
    // Blending wants far puffs first, the depth test near ones first; the order changes slowly, so it is refreshed twice a second.
    if (--sortIn <= 0) { sortIn = 30; order.sort((a, b) => range[b] - range[a]); }
    // Seen through the waterline the whole field fades with the sky, so nothing is solid then.
    const solidAbove = underwater < .001 ? .2 : 2;
    let drawn = 0, cores = 0;
    for (let k = 0; k < order.length; k++) {
      const i = order[k], puff = puffs[i], alpha = puff.cloud.alpha;
      if (alpha < .01) continue;
      const data = fringe.data, at = drawn++ * STRIDE;
      data[at] = position[i * 3]; data[at + 1] = position[i * 3 + 1]; data[at + 2] = position[i * 3 + 2]; data[at + 3] = puff.radius * grow;
      data[at + 4] = puff.lx; data[at + 5] = puff.ly; data[at + 6] = puff.lz; data[at + 7] = alpha;
      data[at + 8] = puff.seed; data[at + 9] = puff.span;
    }
    for (let k = order.length - 1; k >= 0; k--) {
      const i = order[k], puff = puffs[i];
      if (puff.cloud.alpha < solidAbove) continue;
      const data = core.data, at = cores++ * STRIDE;
      data[at] = position[i * 3]; data[at + 1] = position[i * 3 + 1]; data[at + 2] = position[i * 3 + 2]; data[at + 3] = puff.radius * grow;
      data[at + 4] = puff.lx; data[at + 5] = puff.ly; data[at + 6] = puff.lz; data[at + 7] = puff.cloud.alpha;
      data[at + 8] = puff.seed; data[at + 9] = puff.span;
    }
    fringe.geometry.instanceCount = drawn; fringe.buffer.needsUpdate = true; mesh.visible = drawn > 0;
    core.geometry.instanceCount = cores; core.buffer.needsUpdate = true; solid.visible = cores > 0;
  }
  return { group, material, update, counts: { clouds: clouds.length, puffs: puffs.length, drawCalls: 2 } };
}

// The frame is bound by its vertices on an integrated GPU: over half a million
// triangles are in view under water, and their vertex stage costs more than
// the pixels. Two tools for that.
//
// reindex(): a geometry whose triangles do not share their vertices runs its
// vertex shader three times per triangle. Vertices that agree in every
// attribute, byte for byte, are shared here, so the picture is the same and (on a smooth mesh) a fifth of the
// vertices remain. Returns the same geometry when there is nothing to gain.
// pause(), here and in simplify(): returns a promise when the caller wants the
// frame loop to have a turn (the scene is on screen while this runs), else nothing.
// reindexSteps() is the same work as a generator that yields every few thousand
// vertices, for a caller that runs it between frames a step at a time.
export async function reindex(geometry, pause = null) {
  const steps = reindexSteps(geometry); let step;
  while (!(step = steps.next()).done) { const wait = pause?.(); if (wait) await wait; }
  return step.value;
}
export function* reindexSteps(geometry) {
  const names = Object.keys(geometry.attributes), attributes = names.map(name => geometry.getAttribute(name));
  if (!attributes.length || attributes.some(a => a.isInterleavedBufferAttribute) || Object.keys(geometry.morphAttributes).length) return geometry;
  // Each attribute is read as 32-bit words where its vertices are whole words wide, else as bytes.
  const count = attributes[0].count, views = attributes.map(a => { const width = a.array.BYTES_PER_ELEMENT * a.itemSize, words = width % 4 === 0 && a.array.byteOffset % 4 === 0; return { data: words ? new Uint32Array(a.array.buffer, a.array.byteOffset, count * width / 4) : new Uint8Array(a.array.buffer, a.array.byteOffset, count * width), width: words ? width / 4 : width }; });
  const remap = new Uint32Array(count), first = new Uint32Array(count), next = new Int32Array(count), heads = new Map();
  let unique = 0;
  for (let i = 0; i < count; i++) {
    let hash = 2166136261;
    for (let a = 0; a < views.length; a++) { const data = views[a].data, width = views[a].width; for (let k = 0, p = i * width; k < width; k++) hash = Math.imul(hash ^ data[p + k], 16777619); }
    let slot = heads.get(hash);
    scan: while (slot !== undefined && slot >= 0) {
      const j = first[slot];
      for (let a = 0; a < views.length; a++) { const data = views[a].data, width = views[a].width; for (let k = 0, p = i * width, q = j * width; k < width; k++) if (data[p + k] !== data[q + k]) { slot = next[slot]; continue scan; } }
      break;
    }
    if (slot === undefined || slot < 0) { slot = unique++; first[slot] = i; const head = heads.get(hash); next[slot] = head === undefined ? -1 : head; heads.set(hash, slot); }
    remap[i] = slot;
    if ((i & 4095) === 4095) yield;
  }
  if (unique > count * .8) return geometry;
  yield;
  const shared = new THREE.BufferGeometry();
  for (let a = 0; a < attributes.length; a++) {
    const source = attributes[a], size = source.itemSize, from = source.array, data = new from.constructor(unique * size);
    for (let i = 0; i < unique; i++) for (let k = 0, p = first[i] * size; k < size; k++) data[i * size + k] = from[p + k];
    shared.setAttribute(names[a], new THREE.BufferAttribute(data, size, source.normalized));
    yield;
  }
  let order = remap;
  if (geometry.index) { const corners = geometry.index.array; order = new Uint32Array(corners.length); for (let i = 0; i < corners.length; i++) order[i] = remap[corners[i]]; yield; }
  shared.setIndex(new THREE.BufferAttribute(unique > 65535 ? order : new Uint16Array(order), 1));
  for (const group of geometry.groups) shared.addGroup(group.start, group.count, group.materialIndex);
  if (geometry.boundingSphere) shared.boundingSphere = geometry.boundingSphere.clone();
  if (geometry.boundingBox) shared.boundingBox = geometry.boundingBox.clone();
  geometry.dispose();
  return shared;
}

// Pacing for work written as async functions (the model pipelines), which runs while the scene is on screen. It works
// in slices: breathe() returns nothing while the current slice has time left and a promise for the next one once it
// has not, and turn() ends the slice at once. Left alone, a slice is five milliseconds and the next begins after a task
// break (a message, not a timer, so a background tab is not held to one step a second). The page installs its own
// gate (setPacer, see world.js): a function returning a promise for the length of the next slice in ms, so this work
// shares the frame's time budget with everything else that runs between frames.
const nextTask = () => new Promise(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = () => resolve(); channel.port2.postMessage(0); });
let pacer = null, paceEnd = 0;
export function setPacer(gate) { pacer = gate; }
export function turn() { return (pacer ? pacer() : nextTask().then(() => 5)).then(ms => { paceEnd = performance.now() + (ms > 0 ? ms : 5); }); }
export function breathe() { return performance.now() < paceEnd ? null : turn(); }

// A skinned model's joint indices arrive as unsigned shorts. Direct3D has no vertex format that feeds those to the
// float input the skinning shader reads, so a browser drawing through it rebuilds the vertex shader for that layout at
// the model's first draw: a tenth of a second in the graphics process for every skinned program, in the middle of a
// frame. As floats (the indices are small whole numbers, so nothing changes) the layout is the one the program was
// compiled for. Call once per loaded file, before its meshes are merged, shared or cloned.
export function floatSkinIndices(root) {
  const done = new Set();
  root.traverse(node => {
    const geometry = node.geometry, joints = geometry?.getAttribute?.('skinIndex');
    if (!joints || done.has(geometry)) return;
    done.add(geometry);
    if (joints.array instanceof Float32Array && !joints.isInterleavedBufferAttribute) return;
    const data = new Float32Array(joints.count * joints.itemSize);
    for (let i = 0; i < joints.count; i++) for (let k = 0; k < joints.itemSize; k++) data[i * joints.itemSize + k] = joints.getComponent(i, k);
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(data, joints.itemSize));
  });
  return root;
}

// Sharing is not needed for the first frame and takes a few hundredths of a second per mesh, so the meshes built at
// start-up queue here and the page shares them a step at a time behind the first frame (see world.js).
const loose = [];
let shareSlice = 0;
const sharePause = () => performance.now() - shareSlice < 4 ? null : nextTask().then(() => { shareSlice = performance.now(); });
export function shareLater(mesh) { loose.push(mesh); return mesh; }
export async function shareNext() { const mesh = loose.shift(); if (mesh) { shareSlice = performance.now(); mesh.geometry = await reindex(mesh.geometry, sharePause); } return loose.length; }
// The same, every queued mesh in turn, as steps for a caller that runs them between frames.
export function* shareSteps() { while (loose.length) { const mesh = loose.shift(); mesh.geometry = yield* reindexSteps(mesh.geometry); yield; } }

// simplify(): a lighter stand-in for a model seen through ten metres of water
// or more. Vertices are clustered on a grid (one vertex per occupied cell, at
// the mean of those it replaces and with the first one's other attributes,
// skin weights included) and the triangles that collapse are dropped; the grid
// is sized from the mesh's own grain and corrected over a pass or two until
// about `share` of the triangles remain. Nothing is welded
// across parts that are further apart than a cell, so silhouettes keep their
// shape. Returns null when the model is too small to be worth a second copy.
export async function simplify(geometry, share = .4, least = 1500, pause = null) {
  const turn = pause ? async i => { if ((i & 8191) === 8190) { const wait = pause(); if (wait) await wait; } } : null;
  const position = geometry.getAttribute('position'), index = geometry.index;
  const corners = index ? index.count : position.count, count = position.count;
  if (corners / 3 < least || Object.keys(geometry.morphAttributes).length) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox, span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  // Plain copies to work on: the files pack some attributes interleaved or as normalized integers.
  const points = new Float32Array(count * 3), order = new Uint32Array(corners);
  for (let i = 0; i < count; i++) { points[i * 3] = position.getX(i) - box.min.x; points[i * 3 + 1] = position.getY(i) - box.min.y; points[i * 3 + 2] = position.getZ(i) - box.min.z; if (turn && (i & 8191) === 8190) await turn(i); }
  for (let i = 0; i < corners; i++) order[i] = index ? index.getX(i) : i;
  // The grid starts from the mesh's own grain (the typical edge, over a sample of its triangles), not from its
  // extent: a cluster of small sculptures spread over thirty metres has the grain of one sculpture.
  let edges = 0, sampled = 0;
  for (let i = 0, stride = Math.max(3, Math.floor(corners / 900) * 3); i < corners; i += stride, sampled++) {
    const a = order[i] * 3, b = order[i + 1] * 3;
    edges += Math.hypot(points[a] - points[b], points[a + 1] - points[b + 1], points[a + 2] - points[b + 2]);
  }
  let cell = Math.max(span / 1000, edges / sampled / Math.sqrt(share) * .85), kept = 0, slots = 0;
  const remap = new Uint32Array(count), first = new Uint32Array(count), sums = new Float32Array(count * 4), cells = new Map();
  for (let attempt = 0; attempt < 4; attempt++) {
    cells.clear(); slots = 0;
    for (let i = 0, p = 0; i < count; i++, p += 3) {
      const key = (Math.floor(points[p] / cell) * 1024 + Math.floor(points[p + 1] / cell)) * 1024 + Math.floor(points[p + 2] / cell);
      let slot = cells.get(key);
      if (slot === undefined) { slot = slots++; cells.set(key, slot); first[slot] = i; sums[slot * 4] = sums[slot * 4 + 1] = sums[slot * 4 + 2] = sums[slot * 4 + 3] = 0; }
      sums[slot * 4] += points[p]; sums[slot * 4 + 1] += points[p + 1]; sums[slot * 4 + 2] += points[p + 2]; sums[slot * 4 + 3]++;
      remap[i] = slot;
      if (turn && (i & 8191) === 8190) await turn(i);
    }
    kept = 0;
    for (let i = 0; i < corners; i += 3) { const a = remap[order[i]], b = remap[order[i + 1]], c = remap[order[i + 2]]; if (a !== b && b !== c && a !== c) kept++; }
    const ratio = kept * 3 / (corners * share);
    if (ratio > .75 && ratio < 1.12) break;
    // What survives falls off roughly with the square of the cell.
    cell *= Math.min(2.2, Math.max(.6, Math.sqrt(ratio)));
  }
  const light = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes)) {
    const source = geometry.getAttribute(name), size = source.itemSize;
    const target = new THREE.BufferAttribute(new (source.isInterleavedBufferAttribute ? source.data.array : source.array).constructor(slots * size), size, source.normalized);
    for (let i = 0; i < slots; i++) { for (let k = 0; k < size; k++) target.setComponent(i, k, source.getComponent(first[i], k)); if (turn && (i & 8191) === 8190) await turn(i); }
    light.setAttribute(name, target);
  }
  const moved = light.getAttribute('position');
  for (let i = 0; i < slots; i++) moved.setXYZ(i, sums[i * 4] / sums[i * 4 + 3] + box.min.x, sums[i * 4 + 1] / sums[i * 4 + 3] + box.min.y, sums[i * 4 + 2] / sums[i * 4 + 3] + box.min.z);
  const list = new (slots > 65535 ? Uint32Array : Uint16Array)(kept * 3);
  for (let i = 0, k = 0; i < corners; i += 3) { const a = remap[order[i]], b = remap[order[i + 1]], c = remap[order[i + 2]]; if (a !== b && b !== c && a !== c) { list[k++] = a; list[k++] = b; list[k++] = c; } }
  light.setIndex(new THREE.BufferAttribute(list, 1));
  light.boundingBox = box.clone(); if (!geometry.boundingSphere) geometry.computeBoundingSphere(); light.boundingSphere = geometry.boundingSphere.clone();
  return light;
}
