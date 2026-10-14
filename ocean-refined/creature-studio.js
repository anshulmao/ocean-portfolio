import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { SPECIES, creature } from './creature-species.js';
import { CORAL_VARIETIES } from './coral-varieties.js';
import { creatureGLB, creatureFacts, coralGLB, coralFacts, coralSpecimen } from './creature-export.js';
import { siteLength } from './creature-species.js';

// A bench for the model set: one model at a time (an animal with its clips, or a coral colony), everything lined
// up at true scale beside a diver, and contact sheets for checking shapes.
// ?id=orca&clip=fast&view=model|lineup|sheet&kind=creature|coral&angle=side|top|front&bare=1 are read from the
// address, and window.creatureStudio drives the same things from a test.
const $ = id => document.getElementById(id), params = new URLSearchParams(location.search);
const canvas = $('view'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has('bare') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, .01, 400);
scene.background = new THREE.Color('#0d4a5d');
scene.add(new THREE.HemisphereLight('#eefaff', '#5f8f96', 2.6));
const sun = new THREE.DirectionalLight('#fff4dd', 2.6); sun.position.set(-4, 9, 6); scene.add(sun);
const fill = new THREE.DirectionalLight('#8fd8e6', .7); fill.position.set(5, -3, -6); scene.add(fill);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
if (params.has('bare')) document.body.classList.add('bare');

const size = metres => metres < 1 ? `${Math.round(metres * 100)} cm` : `${metres} m`;
const ITEMS = [
  ...SPECIES.map(s => ({ kind: 'creature', id: s.id, name: s.name, scientific: s.scientific, length: s.length, real: s.realLength })),
  ...CORAL_VARIETIES.map(c => ({ kind: 'coral', id: `coral-${c.id}`, coral: c.id, name: c.name, scientific: c.scientific, length: siteLength(c.size), real: c.size }))
];
const itemOf = id => ITEMS.find(item => item.id === id) || ITEMS[0];
const state = { view: params.get('view') || 'model', id: params.get('id') || 'whale-shark', clip: params.get('clip') || 'swim', kind: params.get('kind') || 'creature', playing: !params.has('still'), speed: 1, bones: false,
  angle: params.get('angle') || 'quarter', time: 0, per: Number(params.get('per')) || 0, page: Number(params.get('page')) || 0 };
const stage = new THREE.Group(); scene.add(stage);
let actors = [], cells = [];

// One model on the bench: an animal with a mixer on its clip, or a coral that only sways.
function actor(item, clipName = 'swim') {
  if (item.kind === 'coral') {
    const object = coralSpecimen(item.coral), box = new THREE.Box3().setFromObject(object);
    return { item, object, box, mixer: null, clip: null, tick: time => object.userData.update?.(time) };
  }
  const template = creature(item.id), made = template.instantiate(), mixer = new THREE.AnimationMixer(made.object);
  const clip = template.clips.find(c => c.name === clipName) || template.clips[0];
  mixer.clipAction(clip).play(); mixer.update(0);
  return { item, object: made.object, box: template.geometry.boundingBox.clone(), mixer, clip, tick: () => {} };
}
// A plain figure 1.8 m long, swimming: the only thing on the bench that is not part of the set.
function diver() {
  const group = new THREE.Group(), suit = new THREE.MeshStandardMaterial({ color: '#17323c', roughness: .8, flatShading: true }), kit = new THREE.MeshStandardMaterial({ color: '#f2c14e', roughness: .8, flatShading: true });
  const part = (geometry, material, x, y, z, rx = 0) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.rotation.x = rx; group.add(mesh); };
  part(new THREE.IcosahedronGeometry(.12, 0), suit, 0, 0, .78); part(new THREE.CylinderGeometry(.17, .14, .62, 6), suit, 0, 0, .36, Math.PI / 2);
  part(new THREE.CylinderGeometry(.09, .08, .5, 6), kit, 0, .2, .36, Math.PI / 2);
  for (const side of [-1, 1]) { part(new THREE.CylinderGeometry(.07, .05, .82, 5), suit, side * .09, 0, -.36, Math.PI / 2); part(new THREE.BoxGeometry(.16, .02, .36), kit, side * .09, 0, -.93); part(new THREE.CylinderGeometry(.045, .04, .5, 5), suit, side * .2, -.06, .42, Math.PI / 2 + .5); }
  return group;
}

function clear() { for (const a of actors) a.mixer?.stopAllAction(); actors = []; cells = []; stage.clear(); $('labels').replaceChildren(); }
const ANGLES = { quarter: [.72, .28, 1], side: [1, 0, 0], top: [0, 1, .001], front: [0, .08, 1], below: [.5, -.6, .8], back: [-.6, .3, -1] };
// How far back the eye must stand for a box to fill a view of this shape, seen along `direction`.
function standOff(box, direction, aspect) {
  const s = box.getSize(new THREE.Vector3()), ax = Math.abs(direction.x), ay = Math.abs(direction.y), az = Math.abs(direction.z);
  const across = s.z * Math.hypot(ax, ay) + s.x * az, up = s.y * (1 - ay) + (s.x * az + s.z * ax) * ay + s.x * ay, depth = s.x * ax + s.y * ay + s.z * az;
  const fit = Math.max(up, across / aspect) * .5 / Math.tan(camera.fov * Math.PI / 360);
  return { distance: fit * 1.2 + depth * .5, fit };
}

function showModel() {
  clear();
  const a = actor(itemOf(state.id), state.clip); actors.push(a); stage.add(a.object);
  if (state.bones && a.mixer) stage.add(new THREE.SkeletonHelper(a.object));
  const direction = new THREE.Vector3(...(ANGLES[state.angle] || ANGLES.quarter)).normalize(), centre = a.box.getCenter(new THREE.Vector3()), view = standOff(a.box, direction, camera.aspect);
  controls.target.copy(centre); camera.position.copy(centre).addScaledVector(direction, view.distance); camera.near = view.fit / 200; camera.far = view.fit * 60; camera.updateProjectionMatrix(); controls.update();
}
// Largest first, nose to the left, packed in rows; a diver at the head of each row for scale, corals on the last.
function showLineup() {
  clear();
  // Each model is given at least the width of its caption, so the small ones are spread out rather than piled up.
  const rows = [], width = 36, pitch = 3.9; let row = null;
  for (const item of ITEMS) {
    const a = actor(item, 'swim'), s = a.box.getSize(new THREE.Vector3()), long = item.kind === 'coral' ? s.x : s.z, w = Math.max(long + .9, pitch);
    if (!row || row.kind !== item.kind || row.used + w > width || (item.kind === 'creature' && row.items.length && row.items[0].long > long * 3.4)) rows.push(row = { used: 2.6, items: [], height: 0, kind: item.kind });
    row.items.push({ a, s, long, x: row.used + w / 2 }); row.used += w; row.height = Math.max(row.height, s.y);
  }
  let y = 0;
  for (const r of rows) {
    const half = Math.max(r.height, 1.1) / 2; y -= half;
    const d = diver(); d.rotation.y = -Math.PI / 2; d.position.set(1.1, y, 0); stage.add(d);
    for (const { a, s, x } of r.items) {
      actors.push(a); stage.add(a.object);
      if (a.item.kind === 'coral') a.object.position.set(x, y - s.y / 2, 0); else { a.object.rotation.y = -Math.PI / 2; a.object.position.set(x, y, 0); }
      a.label = [x, y - Math.max(s.y / 2, .1) - .18, 0];
    }
    y -= half + 1.25;
  }
  // Framed from the layout itself: the chart is `width` metres across and runs from the top row down to y.
  const tall = -y + .2, fit = Math.max(tall, width / camera.aspect) * .5 / Math.tan(camera.fov * Math.PI / 360);
  controls.target.set(width / 2, -tall / 2 + .5, 0); camera.position.set(width / 2, -tall / 2 + .5, fit * 1.03); camera.near = .1; camera.far = fit * 4; camera.updateProjectionMatrix(); controls.update();
  for (const a of actors) { const el = document.createElement('div'); el.innerHTML = `${a.item.name}<small>${size(a.item.length)}</small>`; $('labels').append(el); a.el = el; }
}
// Every model the same size on the page, to judge shape rather than scale.
function showSheet() {
  clear();
  const list = ITEMS.filter(item => item.kind === state.kind), per = state.per || list.length, from = state.page * per;
  for (const item of list.slice(from, from + per)) { const a = actor(item, state.clip); actors.push(a); a.object.visible = false; stage.add(a.object); cells.push(a); }
}
function drawSheet() {
  const w = canvas.clientWidth, h = canvas.clientHeight, cols = Math.ceil(Math.sqrt(cells.length * w / h)), rowsN = Math.ceil(cells.length / cols), cw = w / cols, ch = h / rowsN;
  renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h); renderer.clear(); renderer.setScissorTest(true);
  const direction = new THREE.Vector3(...(ANGLES[state.angle] || ANGLES.quarter)).normalize();
  cells.forEach((a, i) => {
    const cx = i % cols, cy = Math.floor(i / cols), centre = a.box.getCenter(new THREE.Vector3());
    renderer.setViewport(cx * cw, h - (cy + 1) * ch, cw, ch); renderer.setScissor(cx * cw, h - (cy + 1) * ch, cw, ch);
    camera.aspect = cw / ch; const view = standOff(a.box, direction, camera.aspect);
    camera.position.copy(centre).addScaledVector(direction, view.distance); camera.up.set(0, 1, 0); camera.lookAt(centre); camera.near = view.fit / 100; camera.far = view.fit * 40; camera.updateProjectionMatrix();
    for (const other of cells) other.object.visible = other === a;
    renderer.render(scene, camera);
  });
  renderer.setScissorTest(false);
}

function show() {
  $('tab-model').setAttribute('aria-pressed', String(state.view === 'model')); $('tab-lineup').setAttribute('aria-pressed', String(state.view === 'lineup'));
  $('tab-creatures').setAttribute('aria-pressed', String(state.view === 'sheet' && state.kind === 'creature')); $('tab-corals').setAttribute('aria-pressed', String(state.view === 'sheet' && state.kind === 'coral'));
  camera.up.set(0, 1, 0); camera.aspect = canvas.clientWidth / canvas.clientHeight; camera.updateProjectionMatrix();
  if (state.view === 'lineup') showLineup(); else if (state.view === 'sheet') showSheet(); else showModel();
  describe();
}
function describe() {
  const item = itemOf(state.id), coral = item.kind === 'coral', facts = coral ? coralFacts(item.coral) : creatureFacts(item.id);
  $('name').textContent = facts.name; $('latin').textContent = facts.scientific; $('note').textContent = facts.note || '';
  $('facts').textContent = coral ? `About ${size(facts.widthMetres)} across on the site (${size(facts.realWidthMetres)} in life) · ${facts.triangles} triangles · not rigged`
    : `${size(facts.lengthMetres)} on the site (${size(facts.realLengthMetres)} in life)${facts.discWidthMetres ? `, ${size(facts.discWidthMetres)} across` : ''} · ${facts.triangles} triangles · ${facts.bones} bones`;
  $('clips').replaceChildren(...(coral ? [] : creature(item.id).clips.map(clip => { const b = document.createElement('button'); b.textContent = clip.userData?.once ? `${clip.name} ▸` : clip.name; b.title = clip.userData?.once ? 'An action that plays once (repeated here to preview it)' : 'Loops'; b.setAttribute('aria-pressed', String(clip.name === state.clip)); b.onclick = () => { state.clip = clip.name; state.view = 'model'; show(); }; return b; })));
  $('bones').hidden = coral;
  for (const li of $('list').querySelectorAll('li[data-id]')) li.setAttribute('aria-selected', String(li.dataset.id === item.id));
}
let heading = null;
for (const item of ITEMS) {
  if (heading !== item.kind) { heading = item.kind; const h = document.createElement('li'); h.className = 'heading'; h.setAttribute('role', 'presentation'); h.textContent = item.kind === 'coral' ? 'Corals' : 'Animals'; $('list').append(h); }
  const li = document.createElement('li'); li.dataset.id = item.id; li.tabIndex = 0; li.setAttribute('role', 'option');
  li.innerHTML = `<b>${item.name}</b><i>${item.scientific}</i><span>${size(item.length)}</span>`; if (item.real) li.title = `${size(item.real)} in life`;
  const pick = () => { state.id = item.id; if (item.kind === 'creature' && !creature(item.id).clips.some(c => c.name === state.clip)) state.clip = 'swim'; state.view = 'model'; show(); };
  li.onclick = pick; li.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(); } };
  $('list').append(li);
}
$('tab-model').onclick = () => { state.view = 'model'; show(); };
$('tab-lineup').onclick = () => { state.view = 'lineup'; show(); };
$('tab-creatures').onclick = () => { state.view = 'sheet'; state.kind = 'creature'; state.per = state.page = 0; show(); };
$('tab-corals').onclick = () => { state.view = 'sheet'; state.kind = 'coral'; state.per = state.page = 0; show(); };
$('play').onclick = () => { state.playing = !state.playing; $('play').setAttribute('aria-pressed', String(state.playing)); $('play').textContent = state.playing ? 'Playing' : 'Paused'; };
$('bones').onclick = () => { state.bones = !state.bones; $('bones').setAttribute('aria-pressed', String(state.bones)); show(); };
$('speed').oninput = event => { state.speed = Number(event.target.value); };
const glb = item => item.kind === 'coral' ? coralGLB(item.coral) : creatureGLB(item.id);
const save = (buffer, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
$('download').onclick = async () => { const item = itemOf(state.id); save(await glb(item), `${item.id}.glb`); };
$('all').onclick = async () => { for (const item of ITEMS) { save(await glb(item), `${item.id}.glb`); await new Promise(resolve => setTimeout(resolve, 250)); } };

function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', () => { resize(); if (state.view !== 'sheet') show(); });
const clock = new THREE.Clock(), projected = new THREE.Vector3();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), .1) * (state.playing ? state.speed : 0);
  state.time += dt; for (const a of actors) { a.mixer?.update(dt); a.tick(state.time); }
  if (state.view === 'sheet') { drawSheet(); return; }
  renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight); camera.aspect = canvas.clientWidth / canvas.clientHeight; camera.updateProjectionMatrix();
  controls.update(); renderer.render(scene, camera);
  for (const a of actors) if (a.el) { projected.fromArray(a.label).project(camera); a.el.style.left = `${(projected.x * .5 + .5) * canvas.clientWidth}px`; a.el.style.top = `${(-projected.y * .5 + .5) * canvas.clientHeight}px`; }
}
resize(); show(); tick();

window.creatureStudio = {
  ready: true, items: ITEMS.map(item => ({ id: item.id, kind: item.kind })), state,
  set(next) { Object.assign(state, next); show(); },
  /** Put every clip on screen at a moment of its cycle (0..1), for still captures. */
  pose(phase) { for (const a of actors) if (a.mixer) { a.mixer.setTime(0); a.mixer.update(a.clip.duration * phase); } },
  facts: () => ITEMS.map(item => item.kind === 'coral' ? coralFacts(item.coral) : creatureFacts(item.id)),
  /** Load an exported file back and say what a 3D tool would find in it. */
  async inspect(url) {
    const { GLTFLoader } = await import('./vendor/GLTFLoader.js'), gltf = await new GLTFLoader().loadAsync(url); let bones = 0, skinned = 0, meshes = 0, vertices = 0, colours = false, textured = false;
    gltf.scene.updateMatrixWorld(true); gltf.scene.traverse(node => { if (node.isBone) bones++; if (node.isSkinnedMesh) skinned++; if (node.isMesh) { meshes++; vertices += node.geometry.attributes.position.count; colours ||= Boolean(node.geometry.attributes.color); textured ||= Boolean(node.material.map?.image?.width); } });
    const mixer = new THREE.AnimationMixer(gltf.scene); for (const clip of gltf.animations) mixer.clipAction(clip).play(); mixer.update(.4);
    return { bones, skinned, meshes, vertices, colours, textured, clips: gltf.animations.map(c => `${c.name}:${c.duration.toFixed(2)}s`), size: new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).toArray().map(v => Math.round(v * 100) / 100) };
  }
};
