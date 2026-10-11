import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const $ = id => document.getElementById(id);
const notes = {
  whale_shark_fantasy: 'Animated fantasy whale shark. Its display ocean and particles are hidden here so you can inspect the animal itself.',
  treasure_chest: 'Opening and closing clips are included. A useful Projects landmark; select either clip to inspect the lid movement.',
  anchor: 'Rusty nautical anchor. Its temporary exported rig is unnecessary for a static landmark; motion is paused here. We can lay it on the reef for About.',
  sunken_ship_low_poly: 'Static shipwreck. Large 4K source textures have been resized to 1K for this review. It still needs scale, placement and separate collision proxies.',
};
const scene = new THREE.Scene(); scene.background = new THREE.Color('#102531');
const camera = new THREE.PerspectiveCamera(42, 1, .01, 10000);
const renderer = new THREE.WebGLRenderer({ canvas: $('preview'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .07;
scene.add(new THREE.HemisphereLight('#e5f4ff', '#597261', 2.4));
const key = new THREE.DirectionalLight('#fff2d6', 3.4); key.position.set(3, 6, 5); scene.add(key);
const fill = new THREE.DirectionalLight('#9cd7ff', 1.7); fill.position.set(-4, 2, -3); scene.add(fill);
let current, mixer, clips = [], active = [], paused = false, generation = 0;
const box = new THREE.Box3(), size = new THREE.Vector3(), center = new THREE.Vector3();
const loader = new GLTFLoader();
const manifest = await fetch('./assets/models/manifest.json').then(response => {
  if (!response.ok) throw new Error('Model manifest unavailable'); return response.json();
});
window.assetReview = { ready: false, loaded: [], errors: [], current: null };
for (const item of manifest) {
  const option = document.createElement('option'); option.value = item.id;
  option.textContent = item.metadata.title || item.id; $('model').append(option);
}

function dispose(root) {
  const textures = new Set(), materials = new Set(), geometries = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.skeleton) object.skeleton.dispose();
    for (const material of [object.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const texture of textures) { texture.dispose(); texture.source?.data?.close?.(); }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function frame() {
  if (!current) return;
  current.updateMatrixWorld(true);
  box.makeEmpty();
  current.traverse(object => {
    if (!object.isMesh || !object.visible) return;
    object.computeBoundingBox?.();
    if (!object.boundingBox) object.geometry.computeBoundingBox();
    box.union((object.boundingBox || object.geometry.boundingBox).clone().applyMatrix4(object.matrixWorld));
  });
  box.getSize(size); box.getCenter(center);
  const extent = Math.max(size.x, size.y, size.z, .1);
  const distance = extent / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * Math.max(1, 1 / camera.aspect) * 1.3;
  camera.near = Math.max(.001, extent / 1000); camera.far = extent * 100;
  const direction = window.assetReview.current === 'anchor' || $('model').value === 'anchor'
    ? new THREE.Vector3(-1, .3, 1) : new THREE.Vector3(.85, .5, 1);
  camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
  camera.updateProjectionMatrix(); controls.target.copy(center);
  controls.minDistance = extent * .04; controls.maxDistance = extent * 12; controls.update();
  window.assetReview.bounds = { size: size.toArray(), center: center.toArray() };
}

function animation() {
  if (!mixer) return;
  mixer.stopAllAction(); active = [];
  const selected = $('clip').value;
  const chosen = selected === 'all' ? clips : clips.filter(clip => clip.name === selected);
  for (const clip of chosen) {
    const action = mixer.clipAction(clip); action.reset();
    if (/open|close/i.test(clip.name)) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
    action.play(); active.push(action);
  }
  paused = false; $('play').textContent = 'Pause';
  window.assetReview.animation = selected;
}

async function load(id) {
  const token = ++generation;
  const item = manifest.find(item => item.id === id);
  $('status').textContent = 'Loading ' + item.metadata.title + '…';
  window.assetReview.ready = false; $('clip').disabled = $('play').disabled = true;
  try {
    const gltf = await loader.loadAsync('./assets/models/' + item.file);
    if (token !== generation) { dispose(gltf.scene); return; }
    if (current) { mixer?.stopAllAction(); mixer?.uncacheRoot(current); scene.remove(current); dispose(current); }
    current = gltf.scene; clips = gltf.animations; scene.add(current);
    current.traverse(object => {
      if (id === 'whale_shark_fantasy' && /^(ocean|particles)/i.test(object.name)) object.visible = $('extras').checked;
      if (object.material) for (const material of [object.material].flat()) material.wireframe = $('wire').checked;
    });
    mixer = new THREE.AnimationMixer(current);
    $('clip').replaceChildren();
    if (id.startsWith('coral_') && clips.length > 1) {
      const option = document.createElement('option'); option.value = 'all'; option.textContent = 'All fish idle clips'; $('clip').append(option);
    }
    for (const clip of clips) { const option = document.createElement('option'); option.value = clip.name; option.textContent = clip.name; $('clip').append(option); }
    if (!clips.length) { const option = document.createElement('option'); option.textContent = 'Static model'; $('clip').append(option); }
    $('clip').disabled = $('play').disabled = !clips.length;
    if (clips.length) animation();
    if (id === 'anchor') { mixer.stopAllAction(); active = []; paused = true; $('play').textContent = 'Play'; }
    $('notes').textContent = notes[id] || 'Coral arrangement with animated reef fish. These are complete mini-scenes; we can separate coral and fish for placement and schooling later.';
    $('stats').textContent = `${item.triangles.toLocaleString()} triangles · ${item.meshes} meshes · ${clips.length} clips · ${(item.preparedBytes / 1e6).toFixed(2)} MB prepared / ${(item.originalBytes / 1e6).toFixed(2)} MB original`;
    $('credit').replaceChildren();
    const author = document.createElement('p'); author.textContent = item.metadata.author; $('credit').append(author);
    const link = document.createElement('a'); link.href = item.metadata.source; link.textContent = 'Creator’s source page'; link.target = '_blank'; link.rel = 'noopener'; $('credit').append(link);
    const licence = document.createElement('p'); licence.textContent = 'CC BY 4.0 · textures resized for this preview'; $('credit').append(licence);
    mixer.update(0); frame();
    $('status').textContent = 'Ready to inspect';
    Object.assign(window.assetReview, { ready: true, current: id, clips: clips.map(clip => ({name: clip.name, duration: clip.duration})), triangles: item.triangles });
    window.assetReview.loaded.push(id);
  } catch (error) {
    $('status').textContent = 'Could not load this model: ' + error.message;
    window.assetReview.errors.push({ id, message: error.message }); console.error(error);
  }
}

function resize() {
  const stage = $('stage'); renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($('stage'));
$('model').addEventListener('change', () => load($('model').value));
$('clip').addEventListener('change', animation);
$('play').addEventListener('click', () => { paused = !paused; $('play').textContent = paused ? 'Play' : 'Pause'; });
$('frame').addEventListener('click', frame);
$('extras').addEventListener('change', () => { if (window.assetReview.current === 'whale_shark_fantasy') load($('model').value); });
$('wire').addEventListener('change', () => current?.traverse(object => { if (object.material) for (const material of [object.material].flat()) material.wireframe = $('wire').checked; }));
$('theme').addEventListener('change', () => { document.body.classList.toggle('light', $('theme').checked); scene.background.set($('theme').checked ? '#dce8e3' : '#102531'); });
let previous = performance.now();
function tick(now) {
  requestAnimationFrame(tick); const dt = Math.min((now - previous) / 1000, .05); previous = now;
  if (!paused && !document.hidden) mixer?.update(dt);
  controls.update(); renderer.render(scene, camera);
}
resize(); requestAnimationFrame(tick); await load(manifest[0].id);
