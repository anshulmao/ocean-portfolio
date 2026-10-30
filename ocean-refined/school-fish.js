import * as THREE from './vendor/three.module.min.js';
import { modelBytes } from './assets.js';

// The look of the schooling fish of marine-life.js: species from the creature set (creature-species.js), one
// instanced mesh a species, swimming in the vertex shader.
//
// Each fish carries its own swim state in one instanced attribute, aSwim (written by marine-life.js every frame):
//   x  the phase of its tail beat, in radians. It is integrated on the CPU from the fish's own speed, so the beat
//      speeds up and slows down with the fish and never jumps when the speed changes;
//   y  the stroke's amplitude (1 at cruise, more in a burst, less while hovering);
//   z  the curvature of its path (1/m in the model's own metres): the body bends into a turn along that arc.
// The wave is the one the creature set's clips were made from (swimShader in creature-species.js): it grows from the
// shoulders to the tail, with a little recoil at the head.
//
// The meshes exist from the start, with an empty shape and a one-texel skin, so the world compiles and warms their
// program with everything else. load() fills them later, off the first dive's path: the shape is built in code (a
// few ms a species) and the painted skin is the one inside the species' GLB, the same file the creature set fetches
// (the browser's cache serves the second request). If that file cannot be had, the skin is painted in code instead.

const BASE = './assets/models/user-sets/sets/creature-set/';
const TAU = Math.PI * 2;
// Site lengths (siteLength in creature-species.js) and the swim wave of each species used here, so the schools can be
// laid out before that module is loaded. newqa/school-fish.mjs checks them against creature-species.js.
export const SCHOOL_SPECIES = {
  'sergeant-major': { length: 1.06, wave: { amp: .09, waves: .75, power: 2 } },
  anthias: { length: .81, wave: { amp: .09, waves: .75, power: 2 } },
  'powder-blue-tang': { length: 1.29, wave: { amp: .09, waves: .75, power: 2 } },
  fusilier: { length: 1.69, wave: { amp: .09, waves: .75, power: 2 } }
};

let placeholder = null;
function blankSkin() {
  if (!placeholder) {
    placeholder = new THREE.DataTexture(new Uint8Array([150, 170, 180, 255]), 1, 1, THREE.RGBAFormat);
    placeholder.colorSpace = THREE.SRGBColorSpace; placeholder.needsUpdate = true; placeholder.name = 'school skin (waiting)';
  }
  return placeholder;
}
// Position, normal and uv: the attributes the real shape has, so the program built for this one is the program it uses.
function blankShape() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(6), 2));
  return geometry;
}

function swimMaterial(id) {
  const { length, wave } = SCHOOL_SPECIES[id];
  const material = new THREE.MeshStandardMaterial({ name: `${id} school`, map: blankSkin(), roughness: .7, metalness: 0, flatShading: true });
  const own = { uSwimShape: { value: new THREE.Vector4(length, wave.amp * length, wave.power, TAU * wave.waves) } };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, own);
    shader.vertexShader = `uniform vec4 uSwimShape;
attribute vec3 aSwim;
${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
float swimAlong = clamp(.5 - position.z / uSwimShape.x, 0.0, 1.0);
transformed.x += uSwimShape.y * aSwim.y * (pow(swimAlong, uSwimShape.z) * sin(uSwimShape.w * swimAlong - aSwim.x) - .14 * (1.0 - swimAlong) * sin(.6 - aSwim.x))
  + .5 * aSwim.z * position.z * position.z;`);
  };
  // Every species shares the one program; the wave's shape is a uniform.
  material.customProgramCacheKey = () => 'marine-school-fish-v1';
  return material;
}

/** One species' mesh for `capacity` fish. swim is its aSwim attribute (see above); ready is false until load(). */
export function schoolMesh(id, capacity) {
  const swim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  swim.setUsage(THREE.DynamicDrawUsage);
  const geometry = blankShape(); geometry.setAttribute('aSwim', swim);
  const mesh = new THREE.InstancedMesh(geometry, swimMaterial(id), capacity);
  mesh.name = `${id} school (${capacity})`;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0;
  return { id, mesh, swim, ready: false };
}

// The painted skin inside a creature-set GLB: the file's first image, decoded off the main thread where the browser can.
async function skinFromFile(id) {
  if (typeof fetch !== 'function' || typeof location === 'undefined') return null;
  const url = BASE + id + '.glb';
  let bytes = await modelBytes(url);
  if (!bytes) { const response = await fetch(url); if (!response.ok) throw Error(`${id}: ${response.status}`); bytes = await response.arrayBuffer(); }
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x46546c67) throw Error(`${id}: not a GLB`);
  const jsonLength = view.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)));
  const binStart = 20 + jsonLength + 8, image = json.images?.[0], part = image && json.bufferViews[image.bufferView];
  if (!part) throw Error(`${id}: no skin`);
  const blob = new Blob([new Uint8Array(bytes, binStart + (part.byteOffset || 0), part.byteLength)], { type: image.mimeType || 'image/png' });
  let picture;
  if (typeof createImageBitmap === 'function') picture = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  else {
    const address = URL.createObjectURL(blob);
    try { picture = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = address; }); }
    finally { URL.revokeObjectURL(address); }
  }
  const texture = new THREE.Texture(picture);
  // glTF images are stored top row first, as the creature set's UVs expect (GLTFLoader's flipY = false).
  texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; texture.name = `${id} school skin`;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 2; texture.needsUpdate = true;
  return texture;
}

const pause = () => new Promise(resolve => typeof requestIdleCallback === 'function' ? requestIdleCallback(() => resolve(), { timeout: 200 }) : setTimeout(resolve, 0));

/**
 * Give each mesh its species' shape and skin, a species at a time between frames. lod 1 has every fin; lod 2 drops
 * the paired fins (economy detail). Resolves with what was loaded, how the skins were had, and the main-thread time
 * it took (ms in all, and the longest single stretch); a species that fails keeps drawing nothing.
 */
export async function loadSchoolLooks(looks, { lod = 1 } = {}) {
  const started = performance.now();
  const { creatureGeometry, speciesById } = await import('./creature-species.js');
  const loaded = [], failed = [], skinsFrom = {}, work = { ms: 0, longest: 0 };
  const timed = fn => { const t = performance.now(), out = fn(), ms = performance.now() - t; work.ms += ms; work.longest = Math.max(work.longest, ms); return out; };
  // The skins download together; the shapes are built one a pause.
  const skins = looks.map(look => skinFromFile(look.id).catch(error => { console.warn('School skin unavailable:', error.message); return null; }));
  for (let i = 0; i < looks.length; i++) {
    const look = looks[i];
    try {
      await pause();
      let geometry, texture = await skins[i];
      if (texture) { geometry = timed(() => creatureGeometry(look.id, { lod }).clone()); skinsFrom[look.id] = 'file'; }
      else {
        // Painted here instead: a shape of its own whose texture layout matches the smaller skin.
        await pause();
        const { buildCreature } = await import('./creature-kit.js'), made = timed(() => buildCreature({ ...speciesById(look.id), texture: [256, 128] }, { lod }));
        geometry = made.geometry.clone(); texture = made.texture; made.material.dispose(); skinsFrom[look.id] = 'painted';
      }
      timed(() => {
        for (const name of ['skinIndex', 'skinWeight']) if (geometry.getAttribute(name)) geometry.deleteAttribute(name);
        geometry.setAttribute('aSwim', look.swim);
        const blank = look.mesh.geometry;
        look.mesh.geometry = geometry; blank.dispose();
        // The same program: map was set before (to the one-texel skin), only the texture changes.
        look.mesh.material.map = texture;
      });
      look.ready = true; loaded.push(look.id);
    } catch (error) { failed.push(look.id); console.warn('School fish unavailable:', look.id, error.message); }
  }
  const round = v => Math.round(v * 10) / 10;
  return { loaded, failed, skins: skinsFrom, mainThreadMs: round(work.ms), longestMs: round(work.longest), totalMs: Math.round(performance.now() - started), triangles: Object.fromEntries(looks.map(look => [look.id, look.mesh.geometry.getAttribute('position').count / 3])) };
}
