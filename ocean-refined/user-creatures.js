import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone } from './vendor/SkeletonUtils.js';
import { floatSkinIndices, turn, modelBytes } from './assets.js';
import { creatureGeometry, speciesById } from './creature-species.js';
import { ENCOUNTERS, RESIDENTS, SCHOOLS, SEABED, WRECK_HEIGHT } from './user-creature-routes.js';
import { DESCENT_LINE } from './return-route.js';
import { fishNavigator } from './fish-navigation.js';
import { createMorayDenMotion, updateMorayDenMotion } from './moray-resident.js';
import { terrainHeightAt as reefTerrain, seabedHeightAt } from './reef.js';

// The creature set at home in the ocean (see user-creature-routes.js for the numbers).
//
// The great animals are encounters: a whale far out in the blue, a whale shark with its remoras, an orca family, a
// dolphin pod, a pair of reef sharks, a tuna school. A director brings one in from beyond the haze, lets it pass the
// diver and swim out of sight, and then nothing of it exists (no drawing, no animation) until it is chosen again.
// Residents (bumpheads, rays, a sleeping nurse shark, the wreck's barracuda, morays in their dens, turtles, whitetips,
// cuttlefish) live on the reef and cost nothing while out of view. Sea stars and urchins lie on the bottom as instances.
// The pufferfish, the octopus and the crabs keep the behaviour living-world.js gives them; this set only draws them
// (puppets: that file writes their pose, this one plays the matching clip on the model). Fish in numbers are instances of the set's own models, one draw call a
// species, swimming in the vertex shader with the same wave their clips were made from.
//
// Every model is a GLB from assets/models/user-sets/sets/creature-set (rig, clips, painted skin). Lighter shapes for
// the far and the many come from creature-species.js, whose texture layout matches the files.
const BASE = './assets/models/user-sets/sets/creature-set/';
// In the published build the 8.8 MB of models travel gzipped, as 3.2 (modelBytes, assets.js).
async function loadModel(url, fetched = null) {
  const bytes = await (fetched || modelBytes(url));
  if (bytes) try { return await new GLTFLoader().parseAsync(bytes, new URL('./', new URL(url, location.href)).href); } catch {}
  return new GLTFLoader().loadAsync(url);
}
// The files, fetched before the set is built (world.js prefetchEnrichment): the guided dive shows these animals, and on
// a slow connection their download no longer starts only when the landmarks have been placed. Kept by file name until
// load() takes them; only the published build's gzipped copies are fetched this way (modelBytes).
let manifestEarly = null;
const early = new Map();
const fetchManifest = () => fetch(BASE + 'manifest.json').then(r => { if (!r.ok) throw new Error('Creature manifest ' + r.status); return r.json(); });
export function prefetchCreatures() {
  if (manifestEarly) return;
  manifestEarly = fetchManifest();
  manifestEarly.then(manifest => { for (const spec of manifest.creatures) early.set(spec.file, modelBytes(BASE + spec.file)); }, () => { manifestEarly = null; });
}
const TAU = Math.PI * 2, { clamp, smoothstep } = THREE.MathUtils;
const turnTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);
const rr = (a, b) => a + Math.random() * (b - a);
// A passing visitor rises no steeper than 30° over the diver (tan 30°), swimming up to DEEPEN m under its band to keep to it.
const RISE = Math.tan(Math.PI / 6), DEEPEN = 12;
const swimTime = { value: 0 };

// A species drawn as instances bends from the shoulders back, each fish on its own beat (aBeat). The shape of the
// wave is in uniforms, so every school shares one shader program: one arriving mid-dive compiles nothing.
function schoolMaterial(source, id, length, beatRate) {
  const swim = speciesById(id)?.swimShader || { amp: .09, waves: .75, power: 2 };
  const material = source.clone(), own = { uSwimShape: { value: new THREE.Vector4(length, swim.amp * length, swim.power, TAU * swim.waves) }, uSwimRate: { value: beatRate } };
  material.name = `${id} school`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, own); shader.uniforms.uSetTime = swimTime;
    shader.vertexShader = `uniform float uSetTime; uniform vec4 uSwimShape; uniform float uSwimRate;
attribute float aBeat;
${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
float setAlong = clamp(.5 - position.z / uSwimShape.x, 0.0, 1.0), setPhase = uSetTime * uSwimRate - aBeat;
transformed.x += uSwimShape.y * (pow(setAlong, uSwimShape.z) * sin(uSwimShape.w * setAlong - setPhase) - .14 * (1.0 - setAlong) * sin(.6 - setPhase));`);
  };
  material.customProgramCacheKey = () => 'user-creature-school-v2';
  return material;
}

export function createUserCreatures({ terrainHeightAt = () => -40, collisions = null, economy = false, sites = {} } = {}) {
  const root = new THREE.Group(); root.name = 'Creature set';
  const pair = value => Array.isArray(value) ? value[economy ? 1 : 0] : value;
  // sentinel: where the wreck's barracuda is, and how often a diver has crowded it into bolting.
  const diagnostics = { slowestFrame: 0, frame: 0, sentinel: { at: null, darts: 0 }, loading: {}, ready: false, loaded: 0, loadedSpecies: 0, failed: 0, species: 0, errors: [], visitors: 0, visitorCount: 0, schoolFish: 0, schoolCount: 0, schoolDrawCalls: 0, encounters: { active: [], history: [] } };
  const gltfs = new Map(), facts = new Map(), actors = [], groups = [], kinds = new Map(), herds = [];
  let clock = 0, frame = 0;

  // --- The seabed, as the animals see it ------------------------------------------------------------------------
  // A one-metre height map of the terrain and every collision box on it, widened and softened, so an animal keeping
  // its height above it rises over a coral head in a curve instead of a step. Built once, a few rows at a time.
  const GX = -64, GZ = -108, GW = 129, GH = 146, hard = new Float32Array(GW * GH), soft = new Float32Array(GW * GH);
  // The sand as it is drawn (reef.js seabedHeightAt), up to 1.5 m off terrainHeightAt across a crease: what lies on the
  // bottom lies on this, and swimmers keep clear of both.
  const drawn = terrainHeightAt === reefTerrain ? (x, z) => seabedHeightAt(x, z, economy) : terrainHeightAt;
  const floor = (x, z) => { const h = drawn(x, z); return Number.isFinite(h) ? Math.max(h, -200) : -60; };
  const terrain = (x, z) => { const h = terrainHeightAt(x, z); return Number.isFinite(h) ? Math.max(h, -200) : -60; };
  const bed = (x, z) => Math.max(floor(x, z), terrain(x, z));
  const wide = new Float32Array(GW * GH);
  let covered = -1;
  // Raise the map under the collision boxes from index `from` on, then widen and soften it: all of it, or with
  // `local` only the cells in reach of those boxes.
  function coverBoxes(from, local = false) {
    let x0 = local ? GW : 0, x1 = local ? -1 : GW - 1, z0 = local ? GH : 0, z1 = local ? -1 : GH - 1;
    const boxes = collisions?.boxes || [], solids = boxes.slice(from).map(entry => entry.box);
    // The wreck's collision follows its hull, slab by slab, leaving the diver the water over the deck. To the animals the
    // whole wreck is solid, decks and masts too (WRECK_HEIGHT): a blacktip cruising low went through its decks.
    const hull = boxes.filter(entry => /^ship hull/.test(entry.mesh || ''));
    if (hull.length > 1 && hull.some(entry => boxes.indexOf(entry) >= from)) { const wreck = hull.reduce((sum, entry) => sum.union(entry.box), hull[0].box.clone()); wreck.max.y = wreck.min.y + WRECK_HEIGHT; solids.push(wreck); }
    for (const box of solids) {
      const bx0 = Math.max(0, Math.floor(box.min.x - GX - .5)), bx1 = Math.min(GW - 1, Math.ceil(box.max.x - GX + .5)), bz0 = Math.max(0, Math.floor(box.min.z - GZ - .5)), bz1 = Math.min(GH - 1, Math.ceil(box.max.z - GZ + .5));
      for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) { const i = z * GW + x; if (box.max.y > hard[i]) hard[i] = box.max.y; }
      if (local) { x0 = Math.min(x0, bx0); x1 = Math.max(x1, bx1); z0 = Math.min(z0, bz0); z1 = Math.max(z1, bz1); }
    }
    covered = boxes.length;
    if (x0 > x1) return;
    const span = (lo, hi, pad, size) => [Math.max(0, lo - pad), Math.min(size - 1, hi + pad)];
    const [wx0, wx1] = span(x0, x1, 1, GW), [wz0, wz1] = span(z0, z1, 1, GH), [sx0, sx1] = span(x0, x1, 3, GW), [sz0, sz1] = span(z0, z1, 3, GH);
    for (let z = wz0; z <= wz1; z++) for (let x = wx0; x <= wx1; x++) { let top = -1e9; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) top = Math.max(top, hard[clamp(z + dz, 0, GH - 1) * GW + clamp(x + dx, 0, GW - 1)]); wide[z * GW + x] = top; }
    for (let z = sz0; z <= sz1; z++) for (let x = sx0; x <= sx1; x++) { let sum = 0; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) sum += wide[clamp(z + dz, 0, GH - 1) * GW + clamp(x + dx, 0, GW - 1)]; soft[z * GW + x] = Math.max(sum / 25, hard[z * GW + x]); }
  }
  async function buildCover() {
    for (let z = 0; z < GH; z++) { for (let x = 0; x < GW; x++) hard[z * GW + x] = bed(GX + x, GZ + z); if (z % 24 === 23) await turn(); }
    await turn();
    coverBoxes(0);
  }
  // Collision boxes added after the map was built (on a slow connection the landmarks' models can arrive after this
  // set) are laid into it as they come.
  function coverLate() {
    const boxes = collisions?.boxes; if (!boxes || covered < 0 || boxes.length <= covered) return;
    coverBoxes(covered, true);
    // Coral colonies can arrive after an animal has settled on the sand (the coral set loads alongside this one): one
    // now lying in a colony moves to the nearest open sand.
    for (const s of sleepers) {
      const a = s.actor; if (s.go > 0) continue;
      const fx = Math.sin(a.yaw) * a.L * .45, fz = Math.cos(a.yaw) * a.L * .45;
      if (!solid(a.pos.x, a.pos.z) && !solid(a.pos.x + fx, a.pos.z + fz) && !solid(a.pos.x - fx, a.pos.z - fz)) continue;
      const place = restingPlace(a.pos.x, a.pos.z, Math.max(2, a.L * .6), a.L); if (!place) continue;
      const [x, z, yaw] = place; a.yaw = yaw; lie(x, z, a.yaw, a.L, s.lift); a.pos.set(x, LIE.y, z); a.pitch = LIE.pitch; a.roll = LIE.roll;
      a.wrapper.position.copy(a.pos); a.wrapper.rotation.set(-a.pitch, a.yaw, a.roll, 'YXZ');
    }
  }
  function cover(x, z) {
    const fx = clamp(x - GX, 0, GW - 1.001), fz = clamp(z - GZ, 0, GH - 1.001), ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * GW + ix;
    return (soft[i] * (1 - tx) + soft[i + 1] * tx) * (1 - tz) + (soft[i + GW] * (1 - tx) + soft[i + GW + 1] * tx) * tz;
  }
  const ground = (x, z) => hard[clamp(Math.round(z - GZ), 0, GH - 1) * GW + clamp(Math.round(x - GX), 0, GW - 1)];
  const navigation = fishNavigator(cover);
  const resting = {};
  const solid = (x, z) => ground(x, z) > bed(x, z) + .25;
  // An animal lying on the sand follows its slope: height, nose-up pitch and roll from the drawn seabed under its
  // nose, tail and flanks (it used to lie level, its nose or tail in the sand on a slope). Written to LIE.
  const LIE = { y: 0, pitch: 0, roll: 0 };
  function lie(x, z, yaw, length, lift) {
    const half = length * .4, side = length * .22, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const nose = floor(x + fx * half, z + fz * half), tail = floor(x - fx * half, z - fz * half), left = floor(x + fz * side, z - fx * side), right = floor(x - fz * side, z + fx * side);
    LIE.pitch = Math.atan2(nose - tail, 2 * half); LIE.roll = Math.atan2(left - right, 2 * side);
    LIE.y = Math.max(floor(x, z), (nose + tail + left + right) / 4) + lift;
    return LIE;
  }
  /** Open, fairly level sand near a wished-for spot: for the animals that lie on the bottom. strict: null when there is
   *  none within 16 m (otherwise the wished-for spot itself, open or not). */
  function sand(x, z, radius = 2, strict = false) {
    for (let ring = 0; ring <= 16; ring++) for (let k = 0, n = ring ? ring * 6 : 1; k < n; k++) {
      const a = k / n * TAU + ring, px = x + Math.cos(a) * ring, pz = z + Math.sin(a) * ring; let ok = Math.abs(px) < 58 && pz > -100 && pz < 30;
      for (let s = 0; ok && s < 6; s++) { const qx = px + Math.cos(s * TAU / 6) * radius, qz = pz + Math.sin(s * TAU / 6) * radius; ok = !solid(qx, qz) && Math.abs(terrain(qx, qz) - terrain(px, pz)) < radius * .45; }
      if (ok && !solid(px, pz)) return [px, pz];
    }
    return strict ? null : [x, z];
  }
  /** A flat body lying on the sand (a sea star, an urchin): fitted to the slope with lie(), then raised as far as it
   *  takes for its nose, tail and both sides to clear the sand under them as it is tilted. Written to LIE. */
  function settleFlat(x, z, yaw, length, lift) {
    lie(x, z, yaw, length, lift);
    const r = length * .45, fx = Math.sin(yaw), fz = Math.cos(yaw), up = Math.sin(LIE.pitch) * r, side = Math.sin(LIE.roll) * r * .5;
    LIE.y = Math.max(LIE.y, floor(x + fx * r, z + fz * r) - up + .015, floor(x - fx * r, z - fz * r) + up + .015,
      floor(x + fz * r * .5, z - fx * r * .5) - side + .015, floor(x - fz * r * .5, z + fx * r * .5) + side + .015);
    return LIE;
  }
  /** Whether the drawn sand at (x, z) slopes more than about one in three. */
  const steep = (x, z) => Math.max(Math.abs(floor(x + .5, z) - floor(x - .5, z)), Math.abs(floor(x, z + .5) - floor(x, z - .5))) > .34;
  /** Whether a body of this length lying at (x, z) along yaw is clear of the reef from nose to tail. */
  const clearBody = (x, z, yaw, length) => { for (const t of [-.45, -.2, 0, .2, .45]) if (solid(x + Math.sin(yaw) * length * t, z + Math.cos(yaw) * length * t)) return false; return true; };
  /** A resting place for a long body near a wished-for spot: open sand, clear nose to tail on some heading; or null. */
  function restingPlace(x, z, clear, length) {
    for (const r of [clear, clear * .7, 2]) {
      const spot = sand(x, z, r, true); if (!spot) continue;
      for (let k = 0; k < 8; k++) { const yaw = k / 8 * TAU + rr(0, .3); if (clearBody(spot[0], spot[1], yaw, length)) return [spot[0], spot[1], yaw]; }
    }
    return null;
  }
  // What the reef offers to gather round: the tall formations, the coral gardens, residents' sites and landmarks.
  const formations = () => (sites.formations || []).map(s => ({ name: s.name, x: s.position[0], y: s.position[1], z: s.position[2], radius: s.radius, height: s.height }));
  const patches = zone => (sites.patches?.() || []).filter(p => !zone || p.zone === zone).map(p => ({ x: p.x, z: p.z, y: floor(p.x, p.z), radius: p.radius || 5, zone: p.zone }));
  const lifeSite = id => { const s = (sites.life || []).find(item => item.id === id); return s && { x: s.position[0], y: s.position[1], z: s.position[2], radius: s.radius }; };
  const landmark = id => { const s = (sites.landmarks || []).find(item => item.id === id); return s && { x: s.position[0], y: s.position[1], z: s.position[2] }; };

  // --- Skinned animals --------------------------------------------------------------------------------------------
  const lighter = new Map(), bottoms = new Map();
  /** How far a model reaches below its origin (m, at scale 1): legs, arms or belly, so it stands on what it is put on. */
  function bottomOf(species) {
    if (!bottoms.has(species)) { let box = null; gltfs.get(species)?.scene.traverse(n => { if (n.isSkinnedMesh && !box) { n.geometry.computeBoundingBox(); box = n.geometry.boundingBox; } }); bottoms.set(species, box ? -box.min.y : 0); }
    return bottoms.get(species);
  }
  function actor(species, { clip = 'swim', scale = 1, name = species, reach = Infinity } = {}) {
    const gltf = gltfs.get(species), fact = facts.get(species); if (!gltf) return null;
    const model = clone(gltf.scene), wrapper = new THREE.Group(); wrapper.name = `Creature set · ${name}`; wrapper.userData.creatureId = species; wrapper.add(model); wrapper.scale.setScalar(scale);
    let mesh = null; model.traverse(n => { if (n.isSkinnedMesh && !mesh) mesh = n; }); if (!mesh) return null;
    mesh.frustumCulled = false;   // culled here, against the haze as well as the view
    const mixer = new THREE.AnimationMixer(model), actions = {};
    for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c);
    const swim = gltf.animations.find(c => c.name === 'swim') || gltf.animations[0], L = fact.lengthMetres * scale;
    const a = { species, name, wrapper, mesh, full: mesh.geometry, light: lighter.get(species), mixer, actions, clip: null, after: null, until: 0, L, scale, reach,
      pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, started: false, ease: 1.6, tick: 0, seen: false, active: true,
      // How far one stroke of the swim clip carries it: the clip runs faster or slower to match the animal's speed.
      stride: .72 * L / swim.duration };
    play(a, clip, 0); mixer.update(Math.random() * 4); wrapper.visible = false; root.add(wrapper); actors.push(a); diagnostics.visitors++; diagnostics.visitorCount++;
    return a;
  }
  /** Cross-fade to a clip. once: an action that plays to its end and hands back to `back`. */
  function play(a, name, fade = .6, once = false, back = 'swim') {
    const next = a.actions[name]; if (!next || (a.clip === name && !once)) return;
    next.reset(); next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); next.clampWhenFinished = once; next.setEffectiveWeight(1).play();
    const previous = a.clip && a.clip !== name ? a.actions[a.clip] : null;
    if (previous) { if (fade > 0) previous.crossFadeTo(next, fade, false); else previous.stop(); }
    a.clip = name; a.after = once ? back : null; a.until = once ? clock + next.getClip().duration - Math.min(fade, .3) : 0;
  }
  function place(a, target, yaw, pitch, roll, dt) {
    if (!a.started) { a.pos.copy(target); a.yaw = yaw; a.pitch = pitch; a.roll = roll; a.started = true; }
    else { a.pos.lerp(target, ease(dt, a.ease)); a.yaw += turnTo(a.yaw, yaw) * ease(dt, 2.2); a.pitch += (pitch - a.pitch) * ease(dt, 1.8); a.roll += (roll - a.roll) * ease(dt, 1.5); }
    a.wrapper.position.copy(a.pos); a.wrapper.rotation.set(-a.pitch, a.yaw, a.roll, 'YXZ');
  }
  const sphere = new THREE.Sphere();
  // Drawn only in sight and within the haze; far off a lighter mesh, and beyond 50 m a stroke at half rate.
  function present(a, dt, view) {
    if (!a.active) { a.wrapper.visible = a.seen = false; return; }
    let seen = true, d = 0;
    if (view) { d = view.eye.distanceTo(a.pos); sphere.center.copy(a.pos); sphere.radius = a.L * .7; seen = d - sphere.radius < Math.min(view.range, a.reach) && view.frustum.intersectsSphere(sphere); }
    a.wrapper.visible = a.seen = seen;
    if (a.after && clock >= a.until) play(a, a.after, .5);
    a.tick += dt; if (!seen) return;
    // A band around 24 m keeps the lighter mesh from flickering at the boundary. Animation keeps the full frame
    // rate out to 50 m; a half-rate stroke closer than that reads as a stutter against the smooth body motion.
    const gap = view ? d - a.L : 0;
    a.far = Boolean(view) && (a.far ? gap > 21 : gap > 27);
    const geometry = a.far && a.light ? a.light : a.full;
    if (a.mesh.geometry !== geometry) a.mesh.geometry = geometry;
    if (gap > 50 && (frame & 1)) return;
    a.mixer.update(a.tick); a.tick = 0;
  }

  // --- Routes for the residents ------------------------------------------------------------------------------------
  const route = (cx, cz, rx, rz, { dir = Math.random() < .5 ? 1 : -1, wobble = .1 } = {}) => ({ cx, cz, rx, rz, dir, wobble, theta: rr(0, TAU), radius: (rx + rz) / 2, seed: rr(0, TAU) });
  function along(r, theta, out) { const k = 1 + r.wobble * Math.sin(theta * 3 + r.seed); out.x = r.cx + r.rx * Math.cos(theta) * k; out.z = r.cz + r.rz * Math.sin(theta) * k; return out; }
  const over = (height, ceiling = -2) => (x, z) => Math.min(ceiling, cover(x, z) + height);
  const level = (y, swing = 0, period = 30, phase = rr(0, TAU)) => (x, z, t) => y + swing * Math.sin(t * TAU / period + phase);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), want = new THREE.Vector3(), spot = { yaw: 0, pitch: 0 };
  const member = (back = 0, side = 0, up = 0, { drift = .3, bob = .2, scale = 1 } = {}) => ({ back, side, up, drift, bob, scale, w1: rr(.25, .6), w2: rr(.3, .8), p1: rr(0, TAU), p2: rr(0, TAU), beat: rr(0, TAU) });
  // The orbit suggests a destination; the swimmer chooses a traversable approach. Keeping x/z fixed to the
  // ellipse while replacing y with cover(x,z) used to force fish vertically up every steep reef/coral wall.
  function station(g, m, t, dt = 0, player = null) {
    const r = g.route, theta = r.theta - m.back / r.radius * r.dir;
    along(r, theta, A); along(r, theta + .03 * r.dir, B);
    let tx = B.x - A.x, tz = B.z - A.z; const span = Math.hypot(tx, tz) || 1; tx /= span; tz /= span;
    want.x = A.x - tz * m.side + Math.sin(t * m.w1 + m.p1) * m.drift; want.z = A.z + tx * m.side + Math.cos(t * m.w1 * .83 + m.p2) * m.drift;
    const here = g.height(want.x, want.z, t) + m.up + Math.sin(t * m.w2 + m.p2) * m.bob, ahead = g.height(want.x + tx * g.look, want.z + tz * g.look, t) + m.up;
    want.y = here; spot.yaw = Math.atan2(tx, tz); spot.pitch = clamp(Math.atan2(ahead - here, g.look), -.45, .45);
    if (!m.nav) {
      const length = m.actor?.L || facts.get(g.k.species).lengthMetres * m.scale;
      m.clearance = Math.max(.24, length * .22);
      m.navLength = length;
      m.navRadius = Math.max(.16, Math.min(1.5, length * .4));
      const r = m.navRadius, startFloor = Math.max(cover(want.x, want.z), cover(want.x - r, want.z - r), cover(want.x - r, want.z + r), cover(want.x + r, want.z - r), cover(want.x + r, want.z + r));
      m.nav = navigation.create(want.x, Math.max(want.y, startFloor + m.clearance + .25), want.z, spot.yaw);
      m.navOptions = { speed: g.speed, clearance: m.clearance, radius: m.navRadius, rise: true };
    }
    if (dt > 0) {
      // Keep a nearby point in front of the swimmer rather than steering directly toward its current station.
      const lead = Math.max(1, g.speed * 1.8);
      want.x += tx * lead; want.z += tz * lead;
      // A swimmer that fell behind (round a formation, say) catches up: its station moves on as fast as it swims.
      const behind = clamp((Math.hypot(want.x - m.nav.x, want.z - m.nav.z) - lead - 2) / 8, 0, 1);
      want.y = g.height(m.nav.x, m.nav.z, t) + m.up + Math.sin(t * m.w2 + m.p2) * m.bob;
      // One that has lost its station aims for the height of the water there, too: from the foot of a cliff below its
      // beat it rises as it goes, until the way up is open (keeping to the bottom, it followed the foot of the cliff
      // away, and herds were found forty metres off their loops).
      if (behind > 0) want.y = Math.max(want.y, here);
      // Members keep their own lanes while a detour compresses the formation; no forced positional offsets
      // after navigation, which would put a safe fish back inside the obstacle it has just avoided.
      for (const other of g.members) {
        if (other === m || !other.nav) continue;
        const dx = m.nav.x - other.nav.x, dz = m.nav.z - other.nav.z, dy = m.nav.y - other.nav.y;
        const distance = Math.hypot(dx, dy, dz), room = (m.navLength + other.navLength) * .35;
        if (distance > .01 && distance < room) { const push = Math.min(2, (room - distance) * 1.5) / distance; want.x += dx * push; want.z += dz * push; }
      }
      // A diver in the way: steer off and quicken, turning harder the closer it is (fish passed within half a metre)
      let flee = 0;
      if (player) {
        const dx = m.nav.x - player.x, dz = m.nav.z - player.z, distance = Math.hypot(dx, dz), room = 3 + (m.actor?.L || 1) * .4;
        if (Math.abs(m.nav.y - player.y) < room && distance < room && distance > .01) {
          flee = 1 - distance / room; want.x += dx / distance * (room - distance) * 4; want.z += dz / distance * (room - distance) * 4;
          // and over or under the diver, whichever side it is already on (a fast fusilier could not turn wide enough).
          want.y = m.nav.y + (m.nav.y >= player.y ? 1 : -1) * (room - distance) * 1.5;
        }
      }
      m.navOptions.speed = g.speed * (g.pace ?? 1) * (1 + Math.max(flee * 1.5, behind * .7)); m.navOptions.turnRate = 1.3 + flee * 2.5; if (flee > .25) m.nav.next = 0;
      navigation.step(m.nav, want, dt, m.navOptions);
    }
    want.set(m.nav.x, m.nav.y, m.nav.z); spot.yaw = m.nav.yaw; spot.pitch = m.nav.pitch;
    return spot;
  }
  function driveHerd(g, dt, t, player) {
    g.route.theta += g.route.dir * g.speed * g.pace * dt / g.route.radius;
    for (const m of g.members) {
      const a = m.actor, p = station(g, m, t, dt, player);
      // Navigation already limits speed/heading; another positional lerp cuts the cleared corner.
      a.pos.copy(want); a.yaw = p.yaw; a.pitch = p.pitch; a.roll = clamp(-m.nav.turn * .07, -.16, .16); a.started = true;
      a.wrapper.position.copy(a.pos); a.wrapper.rotation.set(-a.pitch, a.yaw, a.roll, 'YXZ');
      a.mixer.timeScale = clamp(g.speed * g.pace / a.stride, .3, 2.2);
    }
  }

  // --- The director: big animals come, pass, and go ------------------------------------------------------------
  const casts = new Map(), slots = [];
  function buildEncounters() {
    for (const [slot, config] of Object.entries(ENCOUNTERS)) {
      const kinds = [];
      for (const kind of config.kinds) {
        const cast = [];
        if (kind.cast) for (const role of kind.cast) { const a = actor(role.species, { scale: role.scale ?? 1, name: role.name || role.species }); if (a) { a.active = false; cast.push({ actor: a, side: role.side ?? 0, back: role.back ?? 0, phase: rr(0, TAU), lean: role.lean }); } }
        const riders = [];
        if (kind.riders) for (let i = 0; i < pair(kind.riders); i++) { const a = actor('remora', { clip: 'ride', scale: rr(.85, 1.1), name: `remora ${i + 1}` }); if (a) { a.active = false; riders.push({ actor: a, home: new THREE.Vector3(...[[1, -1.6, 4.3], [-1, -1.9, -.4], [2.3, -.6, 1.9]][i]), yaw: [0, .1, -.05][i], next: rr(14, 40) + i * 9, trip: 0, side: i % 2 ? -1 : 1, p: rr(0, TAU) }); } }
        const school = kind.school ? schoolGroup(kind.school.species, { kind: 'encounter', count: pair(kind.school.count), spread: kind.school.spread }) : null;
        if (school) for (let i = 0; i < pair(kind.school.count); i++) school.members.push(member(i ? rr(0, school.spread[0]) : 0, rr(-school.spread[1], school.spread[1]), rr(-school.spread[2], school.spread[2]), { scale: rr(.85, 1.08) }));
        if (!cast.length && !school) continue;
        const length = Math.max(...cast.map(c => c.actor.L), school ? facts.get(kind.school.species).lengthMetres : 0);
        const record = { ...kind, slot, cast, riders, school, length, path: null, u: 0, y0: 0, next: 0 };
        casts.set(kind.id, record); kinds.push(record);
      }
      if (kinds.length) slots.push({ slot, config, kinds, active: null, wait: rr(...config.first) * (economy ? 1.2 : 1), last: null });
    }
  }
  // course (the guided dive's own call): angle and side fix the line of the pass, pass its distance from the diver, y its
  // depth, and ahead starts it that many metres short of its closest approach instead of out beyond the haze. from, when given,
  // is the point the pass is measured from (a fly-by's spot on the route) rather than where the diver is when it is called.
  function begin(e, player, view, course = null) {
    // A kind with `across` swims parallel to the reef, across its face (the reef deepens towards -z, so that is east or west),
    // its line kept out over the deep shelf at z `across` or deeper, never in over the shallows.
    const across = !course && e.across !== undefined;
    const range = view ? Math.min(view.range, 130) : 110, R = range + e.length + 12, angle = course?.angle ?? (across ? (Math.random() < .5 ? 1 : -1) * Math.PI / 2 : rr(0, TAU)), sideOf = course?.side ?? (Math.random() < .5 ? 1 : -1);
    const dx = Math.sin(angle), dz = Math.cos(angle), nx = dz * sideOf, nz = -dx * sideOf, px = course?.from?.[0] ?? player?.x ?? 0, pz = course?.from?.[2] ?? player?.z ?? -30;
    // Seen from straight below, a great animal is only its belly. A pass rises no steeper than RISE over the diver: the animal
    // swims up to DEEPEN metres under its band and, if that is not enough, its line runs further out. The guided dive's own
    // course sets both itself.
    let pass = course?.pass ?? rr(...e.pass), y0 = course?.y ?? rr(...e.depth);
    if (!course && player && y0 - player.y > pass * RISE) { y0 = Math.max(player.y + pass * RISE, y0 - DEEPEN); pass = Math.max(pass, (y0 - player.y) / RISE); }
    const cx = across ? px : px + nx * pass, cz = across ? Math.min(pz - pass, e.across) : pz + nz * pass;
    // The gentle bow in the line; one swimming across the reef bows out to sea, never in over the shallows. The guided dive's
    // own course is straight (or bows as it says): up to a fifth of the pass out either way at random, and the whale shark it
    // frames could come by 26 m nearer or further than planned.
    const bow = course ? course.bow ?? 0 : rr(-1, 1) * e.bulge * R;
    e.path = { sx: cx - dx * R, sz: cz - dz * R, ex: cx + dx * R, ez: cz + dz * R, nx, nz, len: 2 * R, bulge: across ? -Math.sign(nz) * Math.abs(bow) : bow };
    e.u = course?.ahead === undefined ? 0 : clamp(.5 - course.ahead / e.path.len, 0, .5); e.y0 = y0; e.next = clock + rr(4, 8);
    for (const c of e.cast) { c.actor.active = true; c.actor.started = false; play(c.actor, 'swim', 0); }
    for (const r of e.riders) { r.actor.active = true; r.actor.started = false; }
    if (e.school) e.school.active = true;
    diagnostics.encounters.history.push({ id: e.id, at: Math.round(clock), pass: Math.round(pass) }); if (diagnostics.encounters.history.length > 12) diagnostics.encounters.history.shift();
  }
  function end(e) {
    for (const c of e.cast) c.actor.active = false; for (const r of e.riders) r.actor.active = false;
    if (e.school) e.school.active = false; e.path = null;
  }
  // A point on the pass (u: 0 at the far start, 1 at the far end): a straight line with a gentle bow in it. Before 0
  // and after 1 it runs on straight along the end's heading, so the animals behind the leader (or the leader, while the
  // last of its group finishes) keep swimming instead of waiting at the end of the line.
  function onPath(e, u, out, tangent) {
    const p = e.path, k = clamp(u, 0, 1), bow = Math.sin(Math.PI * k) * p.bulge, slope = Math.PI * Math.cos(Math.PI * k) * p.bulge;
    const tx = p.ex - p.sx + p.nx * slope, tz = p.ez - p.sz + p.nz * slope;
    out.x = p.sx + (p.ex - p.sx) * k + p.nx * bow + tx * (u - k); out.z = p.sz + (p.ez - p.sz) * k + p.nz * bow + tz * (u - k);
    tangent.set(tx, 0, tz).normalize();
  }
  const T = new THREE.Vector3();
  function bandHeight(e, x, z, phase) {
    // Low over the reef inside the swim area; out beyond it (outside the seabed map) in mid-water at the pass's depth.
    const out = smoothstep(Math.max(Math.abs(x) - 54, -100 - z, 0), 0, 10);
    let y = e.low ? THREE.MathUtils.lerp(Math.min(e.depth[1], cover(x, z) + 3.2), e.y0, out) : e.y0 + Math.sin(clock * .11 + phase) * 1.2;
    if (e.porpoise) y = e.y0 + e.porpoise * Math.sin(clock * .95 + phase);
    return Math.min(-1.8, Math.max(y, cover(x, z) + e.clearance));
  }
  function driveEncounter(e, dt, player, range = 110) {
    e.u += e.speed * dt / e.path.len;
    const backest = Math.max(0, ...e.cast.map(c => c.back), e.school ? e.school.spread[0] : 0);
    // Done once the whole group is past the end of the line, and out of sight: a diver who swam along with it would see
    // it switched off, so it swims on (the line runs on straight) until it is beyond the haze.
    if (e.u - (backest + e.length) / e.path.len > 1 && (!player || e.cast.every(c => c.actor.pos.distanceTo(player) > range + c.actor.L)) && (!e.school || !player || e.school.centre.distanceTo(player) - e.school.radius > range)) return false;
    for (const c of e.cast) {
      const a = c.actor;
      onPath(e, e.u - c.back / e.path.len, want, T);
      want.x += -T.z * c.side; want.z += T.x * c.side;
      // A long body clears the bottom along its whole length.
      const reach = a.L * .45;
      want.y = Math.max(bandHeight(e, want.x, want.z, c.phase), cover(want.x + T.x * reach, want.z + T.z * reach) + e.clearance, cover(want.x - T.x * reach, want.z - T.z * reach) + e.clearance);
      if (player) { C.copy(want).sub(player); const d = C.length(), room = 4 + a.L * .5; if (d < room && d > .01) { C.y *= .3; want.addScaledVector(C, (room - d) * .5 / d); } }
      const yaw = Math.atan2(T.x, T.z) + (c.lean ? Math.sin(clock * .7 + c.phase) * .08 : 0), climb = e.porpoise ? Math.cos(clock * .95 + c.phase) * .25 : 0;
      a.ease = e.porpoise ? 2.6 : 1.2; place(a, want, yaw, climb, Math.sin(clock * .3 + c.phase) * .03, dt);
      a.mixer.timeScale = clamp(e.speed / a.stride, .4, 2.2);
      const near = player ? a.pos.distanceTo(player) : 1e9;
      if (e.id === 'orcas') play(a, near < 30 ? 'fast' : 'swim', 1.2);
      if (e.id === 'blacktips' && near < 7 && a.clip !== 'burst') play(a, 'burst', .2, true);
      // A manta near the diver sometimes loops over backwards, a slow somersault, and flies on.
      if (e.loop && a.seen && near < 30) { c.loopAt ??= clock + rr(3, 8); if (clock > c.loopAt && a.clip === 'swim') { play(a, 'loop', .5, true); c.loopAt = clock + rr(...e.loop) + 7; } }
    }
    // Now and then one dolphin spins out of the line.
    if (e.porpoise && clock > e.next) { e.next = clock + rr(5, 10); const c = e.cast[Math.floor(Math.random() * e.cast.length)]; if (c.actor.seen) play(c.actor, 'spin', .3, true); }
    if (e.riders.length) driveRiders(e, dt);
    return true;
  }
  // Remoras ride under the whale shark; now and then one lets go, swings out round its host and comes back.
  function driveRiders(e, dt) {
    const host = e.cast[0].actor; host.wrapper.updateMatrixWorld(true);
    for (const r of e.riders) {
      const a = r.actor; r.next -= dt;
      if (r.next < 0 && r.trip <= 0) { r.trip = 1; r.next = rr(22, 55); }
      let ox = 0, oy = 0, oz = 0;
      if (r.trip > 0) { r.trip -= dt / 7; const u = 1 - Math.max(r.trip, 0), swing = Math.sin(u * Math.PI); ox = Math.sin(u * TAU) * 2.8 * r.side * swing; oy = -.9 * swing; oz = -(1 - Math.cos(u * TAU)) * 2; play(a, 'swim', .5); } else play(a, 'ride', .8);
      C.set(r.home.x + ox + Math.sin(clock * .4 + r.p) * .1, r.home.y + oy + Math.sin(clock * .53 + r.p) * .07, r.home.z + oz + Math.sin(clock * .31 + r.p) * .18);
      C.applyMatrix4(host.wrapper.matrixWorld);
      // Riding it faces as its host does; out on its loop it faces the way it is going (it swam the loop sideways).
      a.ease = 6; place(a, C, r.trip > 0 && a.started ? Math.atan2(C.x - a.pos.x, C.z - a.pos.z) : host.yaw + r.yaw, host.pitch, 0, dt);
    }
  }
  function direct(dt, player, view) {
    diagnostics.encounters.active.length = 0;
    for (const s of slots) {
      if (s.active) {
        if (driveEncounter(s.active, dt, player, view ? view.range : 110)) { diagnostics.encounters.active.push(s.active.id); continue; }
        end(s.active); s.last = s.active.id; s.active = null; s.wait = rr(...s.config.cooldown) * (economy ? 1.3 : 1);
      } else if ((s.wait -= dt) <= 0) {
        const choices = s.kinds.filter(k => k.id !== s.last), e = choices[Math.floor(Math.random() * choices.length)] || s.kinds[0];
        begin(e, player, view); s.active = e;
      }
    }
  }

  // --- Residents ------------------------------------------------------------------------------------------------
  const spotted = [], dens = [], hovering = [], sleepers = [], cruisers = [];
  let sentinel = null, grazers = null, whipray = null, nurse = null;
  // Dens: out from the formation's middle, through its rock, to the first open ground beyond it: the den mouth, with
  // the body back in the rock. A heading that never crosses rock, or only reaches open ground far out (a gap in a ring
  // of columns, say), would leave the eel lying on bare sand, so headings nearest the authored one are tried first.
  const openGround = (x, z) => !solid(x, z);
  function denMouth(f, preferred) {
    for (const turn of [0, .3, -.3, .6, -.6, .9, -.9, 1.2, -1.2, 1.6, -1.6, 2.1, -2.1, 2.6, -2.6, Math.PI]) {
      const angle = preferred + turn, dx = Math.sin(angle), dz = Math.cos(angle);
      let edge = .5, rock = false;
      for (; edge < f.radius * 1.4; edge += .5) { if (!openGround(f.x + dx * edge, f.z + dz * edge)) rock = true; else if (rock) break; }
      const x = f.x + dx * edge, z = f.z + dz * edge;
      if (rock && edge < f.radius * 1.4 && Math.abs(x) < 56 && z > -100 && z < 30) return { angle, dx, dz, edge };
    }
    return null;
  }
  function buildResidents() {
    const b = RESIDENTS.bumpheads;
    if (gltfs.has(b.species)) {
      const herd = Array.from({ length: pair(b.count) }, (_, i) => ({ actor: actor(b.species, { scale: rr(.88, 1.05), name: `bumphead ${i + 1}` }), ...member(i * 4, [0, 3, -3, 1][i] ?? 0, rr(-.4, .4), { drift: .5, bob: .2 }) })).filter(m => m.actor);
      grazers = { route: route(...b.loop, { wobble: .12 }), height: over(b.height, -4), speed: b.speed, pace: 1, members: herd, look: 4, bank: .05, timer: rr(10, 20), grazing: false };
      herds.push(grazers);
    }
    const w = RESIDENTS.whipray;
    if (gltfs.has(w.species)) { const a = actor(w.species); if (a) whipray = a; if (a) herds.push({ route: route(...w.loop), height: over(w.height, -4), speed: w.speed, pace: 1, members: [{ actor: a, ...member(0, 0, 0, { drift: .6, bob: .12 }) }], look: 6, bank: .12 }); }
    const s = RESIDENTS.bluespots;
    if (gltfs.has(s.species)) for (const [x, z] of s.spots.slice(0, economy ? s.lean : s.spots.length)) {
      const a = actor(s.species, { clip: 'rest' }); if (!a) continue;
      const [px, pz] = sand(x, z, 1.8); a.yaw = rr(0, TAU); lie(px, pz, a.yaw, a.L, .1); a.pos.set(px, LIE.y, pz); a.pitch = LIE.pitch; a.roll = LIE.roll; a.started = true;
      spotted.push({ actor: a, from: a.pos.clone(), to: a.pos.clone(), go: 0, yaw: a.yaw, pitch: [a.pitch, a.pitch], roll: [a.roll, a.roll] });
    }
    const n = RESIDENTS.sleeper;
    if (gltfs.has(n.species)) { const a = actor(n.species, { clip: 'rest' }); if (a) nurse = nurseCircuit(a, n); }
    const g = RESIDENTS.sentinel, wreck = landmark(g.landmark) || { x: 18, y: -23, z: -39 };
    if (gltfs.has(g.species)) { const a = actor(g.species, { clip: 'swim' }); if (a) { sentinel = { actor: a, home: new THREE.Vector3(wreck.x + g.offset[0], wreck.y + g.offset[1], wreck.z + g.offset[2]), drift: rr(0, TAU), dart: 0, calm: 0, away: new THREE.Vector3(), phase: rr(0, TAU), turn: Math.random() < .5 ? 1 : -1, hover: 0, cruise: rr(8, 14) }; a.pos.copy(sentinel.home); a.pos.x += Math.cos(sentinel.phase) * g.patrol[0]; a.pos.z += Math.sin(sentinel.phase) * g.patrol[1]; a.started = true; a.ease = 1.2; } }
    // Dens: at the foot of a formation, looking out from it, the rest of the body inside the rock.
    const all = formations();
    for (const d of RESIDENTS.dens) {
      if (economy && d.lean) continue;
      const f = all.find(item => item.name === d.formation); if (!f || !gltfs.has(d.species)) continue;
      const den = denMouth(f, d.angle); if (!den) continue;
      const a = actor(d.species, { clip: 'breathe' }); if (!a) continue;
      const { angle, dx, dz, edge } = den;
      const x = f.x + dx * (edge - a.L * .08), z = f.z + dz * (edge - a.L * .08);
      a.pos.set(x, floor(f.x + dx * edge, f.z + dz * edge) + a.L * .06, z); a.yaw = angle; a.pitch = .12; a.started = true; a.wrapper.position.copy(a.pos); a.wrapper.rotation.set(-a.pitch, a.yaw, 0, 'YXZ');
      const motion = d.species === 'giant-moray' ? createMorayDenMotion({ mouth: { x: f.x + dx * edge, y: a.pos.y, z: f.z + dz * edge }, yaw: angle, length: a.L, scale: a.scale }) : null;
      const pose = {};
      if (motion) {
        updateMorayDenMotion(motion, 0, null, pose);
        a.pos.set(pose.x, pose.y, pose.z); a.pitch = 0;
        a.wrapper.position.copy(a.pos); a.wrapper.rotation.set(0, a.yaw, 0, 'YXZ');
      }
      // The guided dive frames the giant moray where its den mouth actually is (denMouth may turn from the authored heading).
      if (d.species === 'giant-moray') resting.moray = [f.x + dx * edge, a.pos.y, f.z + dz * edge];
      dens.push({ actor: a, rest: 0, motion, pose });
    }
    // Turtles, each cruising its own loop; one asleep on the sand.
    const tu = RESIDENTS.turtles;
    if (gltfs.has(tu.species)) {
      for (let i = 0; i < pair(tu.count); i++) {
        const a = actor(tu.species, { scale: rr(...tu.scale), name: `green turtle ${i + 1}` }); if (!a) continue;
        const g = { route: route(...tu.loops[i % tu.loops.length], { wobble: .1 }), height: over(tu.height, -3), speed: tu.speed, pace: 1, members: [{ actor: a, ...member(0, 0, 0, { drift: .5, bob: .3 }) }], look: 5, bank: .1, stroke: rr(4, 9), gliding: false };
        herds.push(g); cruisers.push(g);
      }
      if (!economy) rest(tu.species, tu.sleeper, 3, .26, 'sleeping turtle');
    }
    // Whitetips: one patrolling low over the deep reef, the others lying on the sand.
    const wt = RESIDENTS.whitetips;
    if (gltfs.has(wt.species)) {
      const a = actor(wt.species, { name: 'whitetip reef shark' });
      if (a) herds.push({ route: route(...wt.patrol.loop, { wobble: .12 }), height: wt.patrol.y !== undefined ? level(wt.patrol.y, .25, 30, 0) : over(wt.patrol.height, -4), speed: wt.patrol.speed, pace: 1, members: [{ actor: a, ...member(0, 0, 0, { drift: .8, bob: .25 }) }], look: 8, bank: .14 });
      wt.resting.slice(0, economy ? wt.lean : wt.resting.length).forEach((spot, i) => rest(wt.species, spot, 3.5, .32, `resting whitetip ${i + 1}`, rr(.85, 1)));
    }
    // Cuttlefish off the side of tall formations, on the side towards the middle of the reef.
    const cu = RESIDENTS.cuttlefish;
    if (gltfs.has(cu.species)) for (const name of cu.formations.slice(0, pair(cu.count))) {
      const f = all.find(item => item.name === name); if (!f) continue;
      const dx = -f.x, dz = -40 - f.z, d = Math.hypot(dx, dz) || 1, x = f.x + dx / d * (f.radius * 1.2 + 2.5), z = f.z + dz / d * (f.radius * 1.2 + 2.5);
      const a = actor(cu.species, { clip: 'hover', name: `cuttlefish ${hovering.length + 1}`, reach: 60 }); if (!a) continue;
      a.pos.set(x, cover(x, z) + cu.height, z); a.yaw = Math.atan2(f.x - x, f.z - z); a.started = true; a.ease = .7;
      // Dark bands roll down its back like passing clouds, faint at rest and strong as it stalks (the skin's own copy).
      a.clouds = clouds(a.mesh);
      hovering.push({ kind: 'cuttle', actor: a, home: new THREE.Vector3(x, 0, z), height: cu.height, drift: rr(0, TAU), flash: 0, hunt: rr(8, 18), stalk: 0 });
    }
    const hw = RESIDENTS.humphead;
    if (gltfs.has(hw.species)) { const a = actor(hw.species, { name: 'humphead wrasse' }); if (a) herds.push({ route: route(...hw.loop, { wobble: .14 }), height: over(hw.height, -4), speed: hw.speed, pace: 1, members: [{ actor: a, ...member(0, 0, 0, { drift: .6, bob: .3 }) }], look: 6, bank: .1 }); }
  }
  // A material of its own with a band of shade that can roll along the body (object z, so it rides the skinning).
  function clouds(mesh) {
    const uniforms = { uCloudTime: { value: 0 }, uCloudOn: { value: .3 } };
    mesh.material = mesh.material.clone();
    mesh.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `varying float vCloudZ;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloudZ = position.z;');
      shader.fragmentShader = `uniform float uCloudTime; uniform float uCloudOn; varying float vCloudZ;\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - .5 * uCloudOn * smoothstep(.35, .95, sin(vCloudZ * 6.0 + uCloudTime));');
    };
    mesh.material.customProgramCacheKey = () => 'cuttlefish-clouds-v1';
    return uniforms;
  }
  // An animal lying still on open sand near a wished-for spot, nose-up or rolled to the slope.
  function rest(species, near, clear, lift, name, scale = 1) {
    // Nowhere open and clear enough near the spot: better no animal than one lying in the coral.
    const place = restingPlace(...near, clear, (facts.get(species)?.lengthMetres || 1) * scale); if (!place) { diagnostics.unplaced = [...(diagnostics.unplaced || []), name]; return null; }
    const a = actor(species, { clip: 'rest', name, scale }); if (!a) return null;
    const [x, z, yaw] = place; a.yaw = yaw; lie(x, z, a.yaw, a.L, lift * scale); a.pos.set(x, LIE.y, z); a.pitch = LIE.pitch; a.roll = LIE.roll; a.started = true;
    a.wrapper.position.copy(a.pos); a.wrapper.rotation.set(-a.pitch, a.yaw, a.roll, 'YXZ');
    const wake = RESIDENTS.wake[species];
    if (wake) sleepers.push({ actor: a, wake, go: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), yaw: 0, pitch: [0, 0], roll: [0, 0], lift: lift * scale, calm: 0 });
    return a;
  }
  // A sleeper crowded by the diver wakes with a start, swims off in a long low arc away from them and settles on the
  // first open sand there; it will not be moved again for a while.
  function driveSleepers(dt, player) {
    for (const s of sleepers) {
      const a = s.actor, w = s.wake; s.calm -= dt;
      if (s.go > 0) {
        s.go = Math.max(0, s.go - dt / w.seconds); const u = 1 - s.go, k = u * u * (3 - 2 * u), ox = a.pos.x, oz = a.pos.z, oy = a.pos.y;
        a.pos.lerpVectors(s.from, s.to, k); a.pos.y += Math.sin(u * Math.PI) * w.rise;
        a.pos.y = Math.max(a.pos.y, cover(a.pos.x, a.pos.z) + .5 * Math.sin(u * Math.PI) + s.lift);
        const h = Math.hypot(a.pos.x - ox, a.pos.z - oz);
        if (h > 1e-4) { a.yaw += turnTo(a.yaw, Math.atan2(a.pos.x - ox, a.pos.z - oz)) * ease(dt, 4); a.pitch = clamp(Math.atan2(a.pos.y - oy, h), -.35, .35) * Math.sin(u * Math.PI); }
        const settle = Math.max(0, 1 - 5 * Math.min(u, 1 - u)); a.roll = (u < .5 ? s.roll[0] : s.roll[1]) * settle;
        if (u > .85 && a.clip !== 'rest') play(a, 'rest', 1.4);
        else if (u > .25 && u < .85 && a.clip === 'fast') play(a, 'swim', .8);
        a.mixer.timeScale = 1;
        if (s.go === 0) { a.pitch = s.pitch[1]; s.calm = 25; }
      } else if (player && s.calm <= 0 && a.pos.distanceToSquared(player) < w.flee * w.flee) {
        const base = Math.atan2(a.pos.x - player.x, a.pos.z - player.z);
        for (const t of [0, .5, -.5, 1, -1, 1.6, -1.6]) {
          const spot = sand(a.pos.x + Math.sin(base + t) * w.hop, a.pos.z + Math.cos(base + t) * w.hop, 2.5, true); if (!spot) continue;
          const [x, z] = spot;
          if (Math.abs(x) > 56 || z < -99 || z > 28 || Math.hypot(x - a.pos.x, z - a.pos.z) < w.hop * .5 || !clearBody(x, z, base + t, a.L)) continue;
          lie(x, z, base + t, a.L, s.lift); s.from.copy(a.pos); s.to.set(x, LIE.y, z); s.pitch = [a.pitch, LIE.pitch]; s.roll = [a.roll, LIE.roll]; s.go = 1;
          play(a, 'fast', .2); break;
        }
      }
      a.wrapper.position.copy(a.pos); a.wrapper.rotation.set(-a.pitch, a.yaw, a.roll, 'YXZ');
    }
  }

  // The nurse shark by the nursery. It keeps to one smooth circuit of open sand round the nursery, worked out when it
  // loads: points round an oval, each pushed out until a body's width either side of it is clear of the reef, the
  // radii smoothed, and a closed spline through them measured by length. Its resting spots are on the circuit, so it
  // never leaves it: it lies on the sand, breathing, then picks up speed along the circuit, rising a little off the
  // bottom as it goes, cruises slowly with its body following the sand and banking into the bends, and slows over the
  // next spot and sinks onto it. Position, heading, height, pitch and roll all come from the one curve and the one speed,
  // so lifting off and settling are part of the swim, not separate moves. (It used to ride the fish navigator, which
  // jinked round obstacles and climbed over the nursery's trees, with a straight-line glide bolted on to land.)
  function nurseCircuit(a, cfg) {
    const [cx, cz, rx, rz] = cfg.loop, count = 28, radii = [];
    // Blocked: reef at the point or a metre either side (it swims over the small coral heads; see poseNurse).
    const blocked = (x, z) => { if (solid(x, z)) return true; for (let k = 0; k < 4; k++) if (solid(x + Math.cos(k * TAU / 4) * 1.2, z + Math.sin(k * TAU / 4) * 1.2)) return true; return false; };
    for (let i = 0; i < count; i++) {
      const t = i / count * TAU; let r = 1;
      while (r < 1.3 && blocked(cx + Math.cos(t) * rx * r, cz + Math.sin(t) * rz * r)) r += .06;
      radii.push(r);
    }
    for (let pass = 0; pass < 3; pass++) { const next = radii.map((r, i) => Math.max(r, (radii[(i + count - 1) % count] + r * 2 + radii[(i + 1) % count]) / 4)); radii.splice(0, count, ...next); }
    const knots = radii.map((r, i) => { const t = i / count * TAU; return [clamp(cx + Math.cos(t) * rx * r, -54, 54), clamp(cz + Math.sin(t) * rz * r, -98, 26)]; });
    // The closed Catmull-Rom spline, sampled densely, with the length run so far at each sample.
    const points = [], run = [0];
    for (let i = 0; i < count; i++) for (let k = 0; k < 16; k++) {
      const t = k / 16, p0 = knots[(i + count - 1) % count], p1 = knots[i], p2 = knots[(i + 1) % count], p3 = knots[(i + 2) % count], t2 = t * t, t3 = t2 * t;
      const f = (a0, a1, a2, a3) => .5 * (2 * a1 + (-a0 + a2) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t2 + (-a0 + 3 * a1 - 3 * a2 + a3) * t3);
      points.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
    for (let i = 1; i <= points.length; i++) { const [x0, z0] = points[i - 1], [x1, z1] = points[i % points.length]; run.push(run[i - 1] + Math.hypot(x1 - x0, z1 - z0)); }
    const length = run[points.length];
    const circuit = { points, run, length, at(s) {
      s = ((s % length) + length) % length; let lo = 0, hi = points.length; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (run[mid] <= s) lo = mid; else hi = mid; }
      const k = (s - run[lo]) / (run[lo + 1] - run[lo] || 1), [x0, z0] = points[lo], [x1, z1] = points[(lo + 1) % points.length];
      return { x: x0 + (x1 - x0) * k, z: z0 + (z1 - z0) * k };
    }, pose(s) {
      // Heading from a chord a metre either side: it turns continuously, not in steps at each sample.
      const p = this.at(s), b = this.at(s - 1), f = this.at(s + 1); p.yaw = Math.atan2(f.x - b.x, f.z - b.z); return p;
    } };
    // Resting spots: where a body along the circuit lies clear and nearly level, at least a quarter of it apart.
    const spots = [];
    for (let s = 0; s < length; s += 1.5) {
      const p = circuit.pose(s); if (!clearBody(p.x, p.z, p.yaw, a.L) || blocked(p.x, p.z)) continue;
      lie(p.x, p.z, p.yaw, a.L, 0); if (Math.abs(LIE.pitch) > .18 || Math.abs(LIE.roll) > .18 || steep(p.x, p.z)) continue;
      if (spots.every(q => Math.min(Math.abs(q - s), length - Math.abs(q - s)) > length / 4)) spots.push(s);
    }
    if (!spots.length) spots.push(0);
    // It starts resting on the spot nearest where it always slept.
    const home = spots.reduce((best, s) => { const p = circuit.at(s), q = circuit.at(best); return Math.hypot(p.x - cfg.near[0], p.z - cfg.near[1]) < Math.hypot(q.x - cfg.near[0], q.z - cfg.near[1]) ? s : best; }, spots[0]);
    const nurseState = { actor: a, circuit, spots, s: home, stop: home, from: home, v: 0, state: 'rest', timer: rr(...cfg.rest) * .4, pitch: 0, roll: 0, y: null, lastYaw: null };
    poseNurse(nurseState, 0);
    a.started = true; resting.sleeper = a.pos.toArray();
    return nurseState;
  }
  // Where the shark is and how it lies, from its place on the circuit and its speed. `lift` (0 resting, 1 cruising)
  // comes from how far it is from where it set off and from where it will stop, so it rises as it leaves a spot and
  // sinks as it comes to the next.
  function poseNurse(n, dt) {
    const a = n.actor, cfg = RESIDENTS.sleeper, p = n.circuit.pose(n.s), L = n.circuit.length;
    const gone = (n.s - n.from + L) % L, left = (n.stop - n.s + L) % L;
    const k = n.state === 'rest' ? 0 : Math.min(1, Math.min(gone, left) / 4), lift = k * k * (3 - 2 * k);
    lie(p.x, p.z, p.yaw, a.L, .45 + (cfg.height - .45) * lift);
    // Cruising, it keeps over whatever stands on the bottom as well as the sand, nose, middle, tail and flanks. Height eases there, so a coral head is a gentle rise, not a step.
    // (The exact map, `ground`, not the smoothed one: that rises metres round the nursery's tall, thin trees.)
    const fx = Math.sin(p.yaw) * a.L * .42, fz = Math.cos(p.yaw) * a.L * .42, sx = Math.cos(p.yaw) * .6, sz = -Math.sin(p.yaw) * .6;
    // And the reef a few metres on along the circuit, so it rises before a coral head rather than at it.
    let tallest = Math.max(ground(p.x, p.z), ground(p.x + fx, p.z + fz), ground(p.x - fx, p.z - fz), ground(p.x + sx, p.z + sz), ground(p.x - sx, p.z - sz));
    // (Only as it cruises: lying down or lifting off, what lies ahead is no concern; it fades in with `lift`.)
    for (const ahead of [2.5, 5]) { const q = n.circuit.at(n.s + a.L * .42 + ahead); tallest = Math.max(tallest, ground(q.x, q.z) - .15 * ahead - (1 - lift) * 4); }
    const over = tallest + .5 * lift;
    const target = Math.max(LIE.y, over);
    // Eased both ways, through the stop too (it used to snap to the resting height on arrival).
    // Never faster than a slow glide up or down (.35 m/s; dropping off a coral head it used to fall at 3 m/s).
    n.y = n.y === null || dt <= 0 ? target : n.y + clamp((target - n.y) * ease(dt, 1.6), -.35 * dt, .35 * dt);
    // Banking into the bends: the turn rate (yaw per second) rolls it the other way of the turn's sign, a little.
    const turn = n.lastYaw === null || dt <= 0 ? 0 : turnTo(n.lastYaw, p.yaw) / dt; n.lastYaw = p.yaw;
    const pitch = LIE.pitch * (1 - .4 * lift), roll = LIE.roll * (1 - lift) + clamp(-turn * .5, -.12, .12) * lift;
    n.pitch = dt > 0 ? n.pitch + (pitch - n.pitch) * ease(dt, 3) : pitch; n.roll = dt > 0 ? n.roll + (roll - n.roll) * ease(dt, 2.5) : roll;
    a.pos.set(p.x, n.y, p.z); a.yaw = p.yaw; a.pitch = n.pitch; a.roll = n.roll;
    a.wrapper.position.copy(a.pos); a.wrapper.rotation.set(-a.pitch, a.yaw, a.roll, 'YXZ');
  }
  function driveNurse(dt, player) {
    const n = nurse, a = n.actor, cfg = RESIDENTS.sleeper, L = n.circuit.length;
    if (n.state === 'rest') {
      n.timer -= dt;
      if (player && a.pos.distanceToSquared(player) < 3.5 * 3.5) n.timer = Math.min(n.timer, 0);
      if (n.timer <= 0) {
        // The next spot round the circuit, far enough on for a proper swim (a quarter of the way at least).
        const ahead = n.spots.map(s => ({ s, d: (s - n.s + L) % L })).filter(q => q.d > L / 4).sort((p, q) => p.d - q.d);
        n.from = n.s; n.stop = ahead.length ? ahead[0].s : (n.s + L * .5) % L;
        n.state = 'swim'; n.v = 0; play(a, 'swim', 2.2);
      }
    } else {
      // Speed: up gently from rest, a slow cruise, and down to nothing over the last few metres to the spot.
      const left = (n.stop - n.s + L) % L, want = cfg.speed * Math.min(1, Math.sqrt(left / 5));
      n.v += clamp(want - n.v, -.3 * dt, .18 * dt); n.v = Math.max(n.v, Math.min(.03, left * 2));
      n.s = (n.s + Math.min(n.v * dt, left)) % L;
      a.mixer.timeScale = clamp(.25 + n.v / Math.max(.1, a.stride) * 1.4, .25, 1.2);
      if (left < .6 && a.clip !== 'rest') play(a, 'rest', 2.4);
      if (left <= .002) { n.v = 0; n.state = 'rest'; n.timer = rr(...cfg.rest); a.mixer.timeScale = 1; }
    }
    poseNurse(n, dt);
    if (n.state === 'rest') resting.sleeper = a.pos.toArray();
  }

  // --- Puppets: animals whose behaviour is living-world.js's, drawn here ----------------------------------------
  const puppets = [];
  function buildPuppets() {
    for (const p of sites.puppets || []) {
      if (!gltfs.has(p.species)) continue;
      const crab = p.species.endsWith('crab'), a = actor(p.species, { clip: p.action, name: `${p.species} (living world)`, reach: crab || p.species === 'clownfish' ? 28 : 45 }); if (!a) continue;
      // living-world.js sizes its crabs for a 16 cm model: a hermit at 1.5 and a crab at 2.2 are these models at scale 1.
      const unit = p.species === 'hermit-crab' ? 1.5 : crab ? 2.2 : 1, spec = speciesById(p.species);
      if (spec?.eyeshine) { const L = facts.get(p.species).lengthMetres; p.eye = [spec.eyeshine[0] * L / unit, (spec.eyeshine[1] * L + bottomOf(p.species)) / unit, spec.eyeshine[2] * L / unit]; }
      // The octopus wears its own copy of the skin, tinted to the colour living-world.js says it has taken.
      if (p.species === 'day-octopus') { a.mesh.material = a.mesh.material.clone(); a.tintBase = new THREE.Color('#bf9c80'); }
      a.active = false; a.started = true; a.puppet = p; a.unit = unit; a.crawls = crab; a.lift = crab || p.species === 'day-octopus' ? bottomOf(p.species) : 0;
      puppets.push(a); p.adopted = true;
    }
  }
  function drivePuppets() {
    for (const a of puppets) {
      const p = a.puppet; a.active = p.on; if (!p.on) continue;
      const s = p.scale / a.unit;
      // Crabs walk on the sand as it is drawn, which can lie above the terrain living-world.js stands them on (a crab
      // a few centimetres tall vanished into it); how far they dig in at dusk is kept. rise is handed back for the eyeshine.
      if (a.crawls) p.rise = Math.max(0, bed(p.x, p.z) - terrain(p.x, p.z));
      a.pos.set(p.x, p.y + (p.rise || 0) + a.lift * s, p.z); a.yaw = p.yaw; a.pitch = p.pitch; a.roll = p.roll;
      a.wrapper.position.copy(a.pos); a.wrapper.rotation.set(-p.pitch, p.yaw, p.roll, 'YXZ');
      // A puffer swells round, wider and deeper more than longer.
      a.wrapper.scale.set(s * (1 + .55 * p.puff), s * (1 + .5 * p.puff), s * (1 + .2 * p.puff)); a.L = facts.get(a.species).lengthMetres * s;
      if (a.clip !== p.action) play(a, p.action, p.action === 'jet' ? .2 : .45);
      a.mixer.timeScale = p.rate;
      if (a.tintBase && p.tint) a.mesh.material.color.setRGB(p.tint.r / a.tintBase.r, p.tint.g / a.tintBase.g, p.tint.b / a.tintBase.b);
    }
  }
  function driveResidents(dt, player) {
    if (grazers) {
      grazers.timer -= dt;
      if (grazers.timer < 0) { grazers.grazing = !grazers.grazing; grazers.timer = grazers.grazing ? rr(6, 10) : rr(18, 32); for (const m of grazers.members) play(m.actor, grazers.grazing ? 'graze' : 'swim', 1.1); }
      grazers.pace += ((grazers.grazing ? .05 : 1) - grazers.pace) * ease(dt, 1.2);
    }
    // Turtles row a few strokes and then glide, and slow to look at a diver nearby.
    for (const g of cruisers) {
      const a = g.members[0].actor, near = player && a.pos.distanceTo(player) < 9;
      g.stroke -= dt;
      if (g.stroke <= 0) { g.gliding = !g.gliding; g.stroke = g.gliding ? rr(3, 6) : rr(5, 10); }
      const glide = g.gliding || near;
      g.pace += ((near ? .35 : glide ? .6 : 1) - g.pace) * ease(dt, .8);
      if (a.clip !== (glide ? 'idle' : 'swim')) play(a, glide ? 'idle' : 'swim', 1.2);
    }
    for (const g of herds) driveHerd(g, dt, clock, player);
    for (const g of cruisers) if (g.gliding || g.pace < .7) g.members[0].actor.mixer.timeScale = 1;
    driveSleepers(dt, player);
    if (nurse) driveNurse(dt, player);
    for (const s of spotted) {
      const a = s.actor;
      if (s.go > 0) {
        s.go = Math.max(0, s.go - dt / 2.4); const u = 1 - s.go, k = u * u * (3 - 2 * u);
        a.pos.lerpVectors(s.from, s.to, k); a.pos.y += Math.sin(u * Math.PI) * 1.2; a.yaw += turnTo(a.yaw, s.yaw) * ease(dt, 6);
        // Level in flight, settling to the slope of the new patch as it lands.
        const settle = Math.max(0, 1 - 4 * Math.min(u, 1 - u)); a.pitch = (u < .5 ? s.pitch[0] : s.pitch[1]) * settle; a.roll = (u < .5 ? s.roll[0] : s.roll[1]) * settle;
        if (s.go === 0) play(a, 'rest', 1);
      } else if (player && a.pos.distanceToSquared(player) < 6 * 6) {
        // Away from the diver, to the first open sand in that direction.
        const base = Math.atan2(a.pos.x - player.x, a.pos.z - player.z);
        for (const t of [0, .5, -.5, 1, -1, 1.6]) { const yaw = base + t, x = a.pos.x + Math.sin(yaw) * 10, z = a.pos.z + Math.cos(yaw) * 10; if (Math.abs(x) < 58 && z > -100 && z < 30 && !solid(x, z)) { lie(x, z, yaw, a.L, .1); s.from.copy(a.pos); s.to.set(x, LIE.y, z); s.pitch = [a.pitch, LIE.pitch]; s.roll = [a.roll, LIE.roll]; s.yaw = yaw; s.go = 1; play(a, 'fast', .25); break; } }
      }
      a.wrapper.position.copy(a.pos); a.wrapper.rotation.set(-a.pitch, a.yaw, a.roll, 'YXZ');
    }
    if (sentinel) {
      // A slow oval off the wreck, broken by spells of hanging still the way barracuda hold station. A diver
      // coming close stops it to watch; crowding it sends it off in a burst before it comes back to its beat.
      const s = sentinel, a = s.actor, [rx, rz] = RESIDENTS.sentinel.patrol, d = player ? a.pos.distanceTo(player) : Infinity;
      s.calm = Math.max(0, s.calm - dt);
      if (s.dart <= 0 && s.hover <= 0 && d < 14) { s.hover = 4; play(a, 'hover', 1.2); }
      if (s.hover > 0) { s.hover -= dt; if (s.hover <= 0 && d < 14) s.hover = .5; else if (s.hover <= 0) { s.cruise = rr(14, 22); play(a, 'swim', 1.2); } }
      else if (s.dart <= 0) { s.phase += s.turn * dt * RESIDENTS.sentinel.speed / ((rx + rz) / 2); s.cruise -= dt; if (s.cruise <= 0) { s.hover = rr(5, 9); play(a, 'hover', 1.2); } }
      const cx = Math.cos(s.phase), sz = Math.sin(s.phase);
      C.set(s.home.x + cx * rx, s.home.y + Math.sin(clock * .21 + s.drift) * .5, s.home.z + sz * rz); C.y = Math.max(C.y, cover(C.x, C.z) + 2.5);
      let yaw = s.hover > 0 ? (d < 24 ? Math.atan2(player.x - a.pos.x, player.z - a.pos.z) : a.yaw) : Math.atan2(-sz * rx * s.turn, cx * rz * s.turn);
      if (s.dart <= 0 && s.calm <= 0 && d < 6) { diagnostics.sentinel.darts++; s.dart = 1; s.hover = 0; s.away.copy(a.pos).sub(player).setY(0).normalize().multiplyScalar(16).add(a.pos); s.away.y = s.home.y + 2; play(a, 'strike', .15, true, 'fast'); }
      if (s.dart > 0) {
        s.dart -= dt / 6; const out = s.dart > .75;
        if (out) { C.copy(s.away); a.ease = 3; } else a.ease = .8;
        yaw = Math.atan2(C.x - a.pos.x, C.z - a.pos.z);
        if (s.dart <= 0) { s.calm = 6; s.cruise = rr(14, 22); play(a, 'swim', 1.2); a.ease = 1.2; }
      }
      place(a, C, yaw, 0, 0, dt); diagnostics.sentinel.at = a.pos;
    }
    for (const d of dens) {
      const a = d.actor; d.rest -= dt;
      if (d.motion) {
        const pose = updateMorayDenMotion(d.motion, dt, player, d.pose);
        a.pos.set(pose.x, pose.y, pose.z); a.yaw = pose.yaw;
        a.wrapper.position.copy(a.pos); a.wrapper.rotation.set(0, a.yaw, 0, 'YXZ');
        continue;
      }
      if (player && d.rest <= 0) {
        C.copy(player).sub(a.pos); const dist = C.length(), facing = (Math.sin(a.yaw) * C.x + Math.cos(a.yaw) * C.z) / Math.max(dist, .01);
        if (dist < a.L * .9 && facing > .5) { play(a, 'strike', .15, true, 'breathe'); d.rest = 7; }
      }
    }
    // Cuttlefish drift a slow figure of eight off their formation. Within a few body lengths they turn to watch the
    // diver; closer, a flash of raised arms, and a diver who keeps coming sees it turn and jet away.
    for (const h of hovering) {
      if (h.kind !== 'cuttle') continue;
      const a = h.actor, d = player ? a.pos.distanceTo(player) : Infinity; h.drift += dt * .1; h.flash -= dt;
      C.set(h.home.x + Math.cos(h.drift) * 2.6, 0, h.home.z + Math.sin(h.drift * 2) * 1.3);
      let yaw = Math.atan2(C.x - a.pos.x, C.z - a.pos.z), clip = 'hover';
      // Hunting, when left alone: it slows, the clouds roll faster and darker down its back, it creeps a little
      // forward, and then lunges, arms flaring.
      h.hunt -= dt;
      if (d > 8 && h.hunt <= 0 && h.stalk <= 0) h.stalk = 3.2;
      if (h.stalk > 0) {
        h.stalk -= dt; C.set(a.pos.x + Math.sin(a.yaw) * .35, 0, a.pos.z + Math.cos(a.yaw) * .35); yaw = a.yaw;
        if (h.stalk <= 0) { play(a, 'strike', .15, true, 'hover'); h.hunt = rr(14, 30); }
      }
      if (a.clouds) { a.clouds.uCloudTime.value += dt * (h.stalk > 0 ? 6 : 1.6); a.clouds.uCloudOn.value += ((h.stalk > 0 ? 1 : d < 8 ? .55 : .25) - a.clouds.uCloudOn.value) * ease(dt, 2); }
      if (d < 8) {
        h.stalk = 0;
        const ax = a.pos.x - player.x, az = a.pos.z - player.z, al = Math.hypot(ax, az) || 1;
        yaw = Math.atan2(-ax, -az);
        // Watching, it holds its place and faces the diver; too close, after its warning, it turns and jets off.
        if (d < 2.4 && h.flash < 10) { yaw = Math.atan2(ax, az); C.set(a.pos.x + ax / al * 2.5, 0, a.pos.z + az / al * 2.5); clip = 'fast'; } else C.set(a.pos.x, 0, a.pos.z);
        if (d < 3.4 && h.flash <= 0) { play(a, 'flash', .3, true, 'hover'); h.flash = 14; }
      }
      // Like any swimmer it moves only the way it faces: it turns on the spot first, then goes.
      if (Math.abs(turnTo(a.yaw, yaw)) > .5) C.set(a.pos.x, 0, a.pos.z);
      // Never far from home, and never into the coral.
      const off = Math.hypot(C.x - h.home.x, C.z - h.home.z); if (off > 9) { C.x = h.home.x + (C.x - h.home.x) * 9 / off; C.z = h.home.z + (C.z - h.home.z) * 9 / off; }
      C.y = Math.min(-2, cover(C.x, C.z) + h.height);
      // It banks into the turn it is making (rolled to the inside), by how fast it is turning.
      const turning = dt > 0 ? turnTo(h.lastYaw ?? a.yaw, a.yaw) / dt : 0; h.lastYaw = a.yaw;
      place(a, C, yaw, 0, clamp(-turning * .3, -.18, .18), dt);
      if (a.clip !== clip && a.clip !== 'flash' && a.clip !== 'strike') play(a, clip, .7);
    }
    drivePuppets();
  }

  // --- Schools ----------------------------------------------------------------------------------------------------
  function kindOf(species, { lod = 1, pose = null, clip = 'swim', scale = 1 } = {}) {
    const key = `${species}|${lod}|${pose}|${clip}`;
    if (kinds.has(key)) return kinds.get(key);
    const gltf = gltfs.get(species), fact = facts.get(species); if (!gltf) return null;
    let source = null; gltf.scene.traverse(n => { if (n.isSkinnedMesh && !source) source = n; });
    const geometry = creatureGeometry(species, { lod, pose }).clone(); for (const name of ['skinIndex', 'skinWeight']) geometry.deleteAttribute(name);
    const beats = (gltf.animations.find(c => c.name === clip) || gltf.animations[0]).duration;
    const k = { species, key, geometry, material: schoolMaterial(source.material, species, fact.lengthMetres, TAU / beats), groups: [], capacity: 0, mesh: null, beats: null, drawn: 0 };
    kinds.set(key, k); return k;
  }
  function schoolGroup(species, options) {
    const k = kindOf(species, options); if (!k) return null;
    const count = options.count, g = { kind: options.kind, k, members: [], centre: new THREE.Vector3(), radius: 6, shown: false, active: options.kind !== 'encounter', fear: 0, spread: options.spread || [6, 2, 1], name: `${species} ${options.kind}`, ...options };
    k.groups.push(g); k.capacity += count; groups.push(g); diagnostics.schoolFish += count; diagnostics.schoolCount++;
    return g;
  }
  function buildSchools() {
    const L = id => facts.get(id)?.lengthMetres || 1;
    const cloud = (species, x, y, z, count, size, extra = {}) => {
      const g = schoolGroup(species, { kind: 'cloud', count, lod: extra.lod, clip: 'idle' }); if (!g) return;
      g.within = Boolean(extra.within);
      g.centre.set(x, y, z); g.size = size; g.heading = rr(0, TAU); g.radius = Math.max(...size) + L(species);
      for (let i = 0; i < count; i++) { const a = rr(0, TAU), r = Math.cbrt(Math.random()), u = rr(-1, 1), s = Math.sqrt(1 - u * u); g.members.push({ hx: Math.cos(a) * s * r * size[0], hy: u * r * size[1], hz: Math.sin(a) * s * r * size[2], scale: rr(.85, 1.1), w1: rr(.35, 1.1), w2: rr(.4, 1.2), w3: rr(.2, .7), p1: rr(0, TAU), p2: rr(0, TAU), p3: rr(0, TAU), beat: rr(0, TAU), loop: rr(.35, .8), flat: rr(.3, .55), turn: Math.random() < .5 ? 1 : -1 }); }
    };
    const shoal = (species, r, height, speed, count, spread, extra = {}) => {
      const g = schoolGroup(species, { kind: 'shoal', count, lod: extra.lod, pose: extra.pose, spread }); if (!g) return;
      g.route = r; g.height = height; g.speed = speed; g.look = Math.max(2, L(species) * 1.2); g.radius = spread[0] + L(species) + 2; g.ring = extra.ring;
      for (let i = 0; i < count; i++) g.members.push(member(extra.ring ? i / count * TAU * r.radius + rr(-1, 1) : (i ? rr(0, spread[0]) : 0), rr(-spread[1], spread[1]), rr(-spread[2], spread[2]), { drift: extra.drift ?? .4, bob: extra.bob ?? .2, scale: rr(.85, 1.1) * (extra.scale ?? 1) }));
      if (extra.ring) g.radius = r.radius + spread[1] + L(species);
    };
    const all = formations(), clouds = SCHOOLS.anthias;
    // Anthias over the tops of the tall formations, and over the shallow coral gardens.
    for (const f of all.filter(f => !/clam|kelp/i.test(f.name))) cloud(clouds.species, f.x, f.y + f.height * .78 + 1, f.z, pair(clouds.count), [f.radius * .75, Math.min(2.4, f.height * .18), f.radius * .75], { lod: clouds.lod });
    for (const p of patches(clouds.patches.zone).slice(0, clouds.patches.max)) cloud(clouds.species, p.x, cover(p.x, p.z) + 3.2, p.z, pair(clouds.patches.count), [p.radius * .8, 1.4, p.radius * .8], { lod: clouds.lod });
    const ch = SCHOOLS.chromis;
    for (const p of patches(ch.zone).slice(0, ch.max)) cloud(ch.species, p.x + 1.5, cover(p.x, p.z) + 2.4, p.z - 1, pair(ch.count), [p.radius * .6, 1.1, p.radius * .6], { lod: ch.lod });
    const sg = SCHOOLS.sergeants;
    for (const [x, z] of sg.at.slice(0, economy ? 2 : sg.at.length)) cloud(sg.species, x, Math.max(sg.y, cover(x, z) + 4), z, pair(sg.count), sg.size);
    const wr = SCHOOLS.wrasse, station = lifeSite(wr.site);
    if (station) cloud(wr.species, station.x, cover(station.x, station.z) + wr.lift, station.z, pair(wr.count), wr.size);
    // Pairs and small parties working the reef close to the bottom.
    // At a formation, on its reef side (toward the middle of the site): on the +x side, the loops round the eastern
    // formations ran out to the edge of the world and round the back of them.
    const inward = f => { const dx = -f.x, dz = -40 - f.z, d = Math.hypot(dx, dz) || 1; return { x: f.x + dx / d * f.radius * 1.1, z: f.z + dz / d * f.radius * 1.1 }; };
    const anchors = near => { const list = near === 'formations' ? all.map(inward) : patches(); return list.length ? list : all.map(f => ({ x: f.x - f.radius * 1.2, z: f.z + 2 })); };
    for (const id of ['butterflies', 'idols', 'tangs', 'angels', 'yellowTangs', 'triggers']) {
      const s = SCHOOLS[id], list = anchors(s.near);
      for (let i = 0; i < Math.min(pair(s.groups), list.length); i++) { const a = list[(i * 3 + id.length) % list.length]; shoal(s.species, route(a.x, a.z, s.loop, s.loop * .78, { wobble: .2 }), over(s.height, -3), .5 + L(s.species) * .15, s.count, [L(s.species) * 1.2, L(s.species) * .5, .2], { drift: .2, bob: .15 }); }
    }
    // Garden eels: a colony on open sand, standing in their burrows.
    const ge = SCHOOLS.gardenEels;
    if (gltfs.has(ge.species)) {
      const [cx, cz] = sand(...ge.near, 4), g = schoolGroup(ge.species, { kind: 'burrows', count: pair(ge.count), lod: ge.lod, clip: 'sway' });
      if (g) { g.centre.set(cx, floor(cx, cz), cz); g.radius = 6 + L(ge.species); g.sink = 0; for (let i = 0; i < pair(ge.count); i++) { const a = i * 2.4, r = .8 + Math.sqrt(i) * 1.15, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; g.members.push({ x, z, y: floor(x, z), yaw: rr(0, TAU), scale: rr(.8, 1.1), beat: rr(0, TAU), w1: rr(.3, .7), p1: rr(0, TAU) }); } }
    }
    const fu = SCHOOLS.fusiliers;
    shoal(fu.species, route(...fu.loop, { wobble: .09 }), over(fu.height, fu.ceiling), fu.speed, pair(fu.count), fu.spread);
    const bw = SCHOOLS.barracudaWheel;
    shoal(bw.species, route(bw.centre[0], bw.centre[1], bw.radius, bw.radius, { wobble: .03 }), level(bw.y, .5, 20), bw.speed, pair(bw.count), [0, 1.2, bw.stack], { ring: true, scale: bw.scale, drift: .2, bob: .15 });
    const tr = SCHOOLS.trevally, bait = lifeSite(tr.site) || { x: 48, y: -27.8, z: -67 };
    shoal(tr.species, route(bait.x - 1, bait.z, tr.radius * .9, tr.radius, { wobble: .1 }), level(bait.y + tr.lift, 1.6, 26), tr.speed, pair(tr.count), tr.spread);
    const ff = SCHOOLS.flyingFish;
    shoal(ff.species, route(...ff.loop, { wobble: .12 }), level(ff.y, .25, 9), ff.speed, pair(ff.count), ff.spread, { pose: ff.pose, drift: .3, bob: .05 });
    // Added after the reef's other schools, so every school before them draws the same random numbers as it always did.
    // The wreck's and the nautilus's fish, placed from their charted spots (the landmarks themselves may still be loading).
    for (const [group, fallback] of [[SCHOOLS.wreck, { x: 18, z: -39 }], [SCHOOLS.nautilus, { x: -18, z: -82 }]]) {
      const spot = landmark(group.landmark) || fallback, base = bed(spot.x, spot.z);
      for (const c of group.clouds) cloud(c.species, spot.x + c.at[0], base + c.at[1], spot.z + c.at[2], pair(c.count), c.size, { within: group.within });
    }
    // Fusiliers wheeling round the descent line at the safety stop.
    const ln = SCHOOLS.line;
    shoal(ln.species, route(DESCENT_LINE.x, DESCENT_LINE.z, ln.radius, ln.radius, { wobble: .04 }), level(ln.y, .4, 18), ln.speed, pair(ln.count), [0, .8, ln.stack], { ring: true, drift: .2, bob: .12 });
    // Sea stars and urchins on the bottom: still instances, each its own small group so it is culled on its own.
    for (const b of seabedPlaces) {
      const g = schoolGroup(b.species, { kind: 'bed', count: 1, lod: 1, clip: 'idle' }); if (!g) continue;
      g.centre.set(b.x, b.y, b.z); g.radius = b.length * .6; g.members.push(b);
    }
    // One mesh a species; the groups in sight are packed to its front each frame.
    for (const k of kinds.values()) {
      if (!k.capacity) continue;
      const mesh = new THREE.InstancedMesh(k.geometry, k.material, k.capacity); mesh.name = `Creature set · ${k.species} (${k.capacity})`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
      k.beats = new THREE.InstancedBufferAttribute(new Float32Array(k.capacity), 1); k.beats.setUsage(THREE.DynamicDrawUsage); mesh.geometry.setAttribute('aBeat', k.beats);
      k.mesh = mesh; root.add(mesh); diagnostics.schoolDrawCalls++;
    }
  }
  // Where each sea star and urchin lies (open sand near its spot, on the slope there), worked out a dozen at a time
  // before the schools are built: all at once it was a single task of 30 ms here, several times that on a tablet.
  const seabedPlaces = [];
  async function placeSeabed() {
    let done = 0;
    for (const bed of Object.values(SEABED)) {
      const n = pair(bed.count);
      for (let i = 0; i < n; i++) {
        const species = bed.species[i % bed.species.length]; if (!gltfs.has(species)) continue;
        // Open sand that is not too steep: a flat star on a steep bank sank its downhill arms into it.
        let [x, z] = seabedSpot(i, n, bed.phase);
        if (solid(x, z) || steep(x, z)) { const spot = sand(x, z, .8, true); if (!spot || steep(...spot)) continue; [x, z] = spot; }
        const scale = bed.scale[0] + (bed.scale[1] - bed.scale[0]) * ((i * .618) % 1), yaw = i * 1.7, length = (facts.get(species)?.lengthMetres || 1) * scale, lift = bottomOf(species) * scale;
        settleFlat(x, z, yaw, length, lift);
        seabedPlaces.push({ species, length, x, y: LIE.y, z, yaw, pitch: LIE.pitch, roll: LIE.roll, scale, beat: 0 });
        if (++done % 12 === 0) await turn();
      }
    }
  }
  // Where the reef's sea stars and urchins have always been: a staggered zigzag from the shallows to the deep ledge, kept
  // off the landmarks' pads and the arch's gully (as underwater-life.js placed them).
  function seabedSpot(index, count, phase = 0) {
    let x = Math.sin(index * 2.399 + phase) * (22 + (index % 5) * 6);
    const z = 25 - ((index + .5) / count) * 123;
    for (const [px, pz] of [[0, 0], [-12, -15], [18, -39], [-18, -82]]) if (Math.hypot(x - px, z - pz) < 7) x += x < px ? -8 : 8;
    if (Math.abs(x - 20) < 8 && z < -56 && z > -81) x = 34;
    return [Math.max(-54, Math.min(54, x)), z];
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler(0, 0, 0, 'YXZ');
  function write(k, x, y, z, yaw, pitch, roll, scale, beat) {
    const slot = k.drawn++; want.set(x, y, z); E.set(-pitch, yaw, roll, 'YXZ'); M.compose(want, Q.setFromEuler(E), S.setScalar(scale)); k.mesh.setMatrixAt(slot, M); k.beats.array[slot] = beat;
  }
  // A milling fish's offset from its spot, the way it faces and its speed at time t (written to MILL).
  const MILL = { x: 0, z: 0, yaw: 0, speed: 0 };
  function mill(m, heading, t) {
    const h = heading + Math.sin(t * m.w3 + m.p3) * .3, theta = t * m.w1 * m.turn + m.p1, c = Math.cos(theta), s = Math.sin(theta);
    const along = c * m.loop, across = s * m.loop * m.flat, vAlong = -s * m.loop * m.w1 * m.turn, vAcross = c * m.loop * m.flat * m.w1 * m.turn;
    const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    MILL.x = fx * along + rx * across; MILL.z = fz * along + rz * across;
    MILL.yaw = Math.atan2(fx * vAlong + rx * vAcross, fz * vAlong + rz * vAcross); MILL.speed = Math.hypot(vAlong, vAcross);
    return MILL;
  }
  function paintSchools(dt, player, view) {
    for (const k of kinds.values()) k.drawn = 0;
    const t = clock;
    for (const g of groups) {
      if (!g.active || !g.k.mesh) continue;
      if (g.kind === 'shoal') { g.route.theta += g.route.dir * g.speed * dt / g.route.radius; if (g.ring) g.centre.set(g.route.cx, g.height(g.route.cx, g.route.cz, t), g.route.cz); else { along(g.route, g.route.theta, A); g.centre.set(A.x, g.height(A.x, A.z, t), A.z); } }
      if (g.kind === 'shoal' && g.members[0]?.nav) {
        g.centre.set(0, 0, 0);
        for (const m of g.members) { g.centre.x += m.nav.x; g.centre.y += m.nav.y; g.centre.z += m.nav.z; }
        g.centre.multiplyScalar(1 / g.members.length);
        let reach = 0;
        for (const m of g.members) reach = Math.max(reach, Math.hypot(m.nav.x - g.centre.x, m.nav.y - g.centre.y, m.nav.z - g.centre.z));
        g.radius = facts.get(g.k.species).lengthMetres + reach;
      }
      if (g.kind === 'encounter') { const e = casts.get('tuna'); if (!e?.path) continue; onPath(e, e.u - g.spread[0] / 2 / e.path.len, A, T); g.centre.set(A.x, bandHeight(e, A.x, A.z, 0), A.z); g.radius = g.spread[0] + 6; }
      g.shown = true;
      if (view) { sphere.center.copy(g.centre); sphere.radius = g.radius; g.shown = view.eye.distanceTo(g.centre) - g.radius < view.range * (g.kind === 'bed' ? .4 : g.kind === 'cloud' || g.kind === 'burrows' ? .55 : .8) && view.frustum.intersectsSphere(sphere); }
      // A hidden school continues navigating (without rendering) so re-entering view cannot teleport it up
      // a different terrain sample. Only the bounded height-grid probes run for these small moving groups.
      // Out of sight it steps every fourth frame with the time gathered since; nothing on screen can stutter.
      if (!g.shown) {
        g.idle = (g.idle ?? 0) + dt; g.wake = ((g.wake ?? Math.floor(Math.random() * 4)) + 1) % 4;
        if (g.kind === 'shoal' && g.wake === 0) { for (const m of g.members) station(g, m, t, g.idle, player); g.idle = 0; }
        continue;
      }
      g.idle = 0;
      const k = g.k;
      if (g.kind === 'shoal') for (const m of g.members) { const p = station(g, m, t, dt, player); write(k, want.x, want.y, want.z, p.yaw, p.pitch, clamp(-m.nav.turn * .06, -.15, .15), m.scale, m.beat); }
      else if (g.kind === 'cloud') {
        // Each fish mills round its own spot on a small loop drawn out along the current, always swimming forward
        // and banking round the turns; they sink into the coral as the diver comes close.
        let near = 0; if (player) near = 1 - smoothstep(player.distanceTo(g.centre), g.radius + 1, g.radius + 7);
        g.fear += (near - g.fear) * ease(dt, near > g.fear ? 4 : .5);
        const tight = 1 - g.fear * .55, drop = g.fear * g.size[1] * 1.3;
        for (const m of g.members) {
          mill(m, g.heading, t); const x = MILL.x, z = MILL.z, yaw = MILL.yaw, speed = MILL.speed;
          mill(m, g.heading, t + .1); const rate = turnTo(yaw, MILL.yaw) / .1;
          const climb = .15 * m.w2 * Math.cos(t * m.w2 + m.p2);
          // Over the coral, never in it: not into a formation's rock when the cloud sinks, nor under a table's plates
          // (the map's nearest cell, and the sand under the fish, which on a slope can lie above that cell).
          const fx = g.centre.x + m.hx * tight + x, fz = g.centre.z + m.hz * tight + z;
          // As the cloud draws in and sinks the fish face the way they are actually going, not only round their loop.
          const moved = m.at === frame - 1 && dt > 0 ? Math.hypot(fx - m.lx, fz - m.lz) / dt : 0, facing = moved > .05 ? Math.atan2(fx - m.lx, fz - m.lz) : yaw;
          // Avoiding the diver changes the actual heading. Bank into that
          // turn, rather than into the loop we would have followed undisturbed.
          const actualRate = m.at === frame - 1 && dt > 0 && m.facing !== undefined ? turnTo(m.facing, facing) / dt : rate;
          m.lx = fx; m.lz = fz; m.at = frame; m.facing = facing;
          // The whole fish clears the sand, nose and tail as well as middle (on a steep slope its nose dug in).
          const nx = Math.sin(facing) * m.scale * .35, nz = Math.cos(facing) * m.scale * .35, sand = Math.max(floor(fx, fz), floor(fx + nx, fz + nz), floor(fx - nx, fz - nz));
          // A cloud that lives in a wreck (`within`) keeps off the sand only: to the animals the whole wreck is a block
          // WRECK_HEIGHT tall, which would lift its fish clear over the masts.
          // The floor under a fish steps where it crosses the edge of a stone or a colony (the map is in 1 m cells), and
          // set straight onto it the fish jumped up and down on every crossing (the light blue chromis over the nautilus's
          // stones). It eases there instead: up quickly, so it never sits in the rock for long, and down slowly.
          const goal = Math.max(g.centre.y - drop + m.hy * tight + .15 * Math.sin(t * m.w2 + m.p2), g.within ? -Infinity : ground(fx, fz) + .35, sand + .35);
          m.y = m.y === undefined || dt <= 0 ? goal : m.y + (goal - m.y) * ease(dt, goal > m.y ? 9 : 1.6);
          write(k, fx, Math.max(m.y, sand + .35), fz,
            facing, clamp(Math.atan2(climb, speed), -.3, .3), clamp(-actualRate * .07, -.16, .16), m.scale, m.beat);
        }
      } else if (g.kind === 'burrows') {
        // Upright in the sand; as the diver comes over they draw back until only their heads show.
        const L = facts.get(g.k.species).lengthMetres; let near = 0; if (player) near = 1 - smoothstep(player.distanceTo(g.centre), 5, 11);
        g.sink += (near - g.sink) * ease(dt, near > g.sink ? 2.5 : .35);
        for (const m of g.members) write(k, m.x, m.y - L * (.08 + .4 * g.sink) * m.scale, m.z, m.yaw + Math.sin(t * m.w1 + m.p1) * .4, Math.PI / 2 - .12, 0, m.scale, m.beat);
      } else if (g.kind === 'bed') {
        for (const m of g.members) {
          // Sea stars and urchins lie still where they were placed: the creeping walk turned them on the spot (at a
          // steep edge it span them round every frame), which read as a spinning star.
          write(k, m.x, m.y, m.z, m.yaw, m.pitch, m.roll, m.scale, m.beat);
        }
      } else if (g.kind === 'encounter') {
        const e = casts.get('tuna');
        for (const m of g.members) { onPath(e, e.u - m.back / e.path.len, A, T); write(k, A.x - T.z * m.side, bandHeight(e, A.x, A.z, 0) + m.up, A.z + T.x * m.side, Math.atan2(T.x, T.z) + Math.sin(t * m.w1 + m.p1) * .05, 0, 0, m.scale, m.beat); }
      }
    }
    for (const k of kinds.values()) { if (!k.mesh) continue; k.mesh.count = k.drawn; k.mesh.visible = k.drawn > 0; if (k.drawn) { k.mesh.instanceMatrix.needsUpdate = true; k.beats.needsUpdate = true; } }
  }

  // --- Loading -----------------------------------------------------------------------------------------------------
  async function load() {
    const manifest = await (manifestEarly || fetchManifest());
    diagnostics.species = manifest.creatures.length;
    let cursor = 0;
    const worker = async () => { while (cursor < manifest.creatures.length) { const spec = manifest.creatures[cursor++]; try {
      const fetched = early.get(spec.file); early.delete(spec.file);
      const gltf = await loadModel(BASE + spec.file, fetched); floatSkinIndices(gltf.scene); gltfs.set(spec.id, gltf); facts.set(spec.id, spec);
      diagnostics.loaded++; diagnostics.loadedSpecies++; await turn();
    } catch (error) { diagnostics.failed++; diagnostics.errors.push(spec.id + ': ' + error.message); } } };
    await Promise.all([worker(), worker()]);
    // Each step is timed, and the longest stretch without a pause is kept: none of this should hold up a frame.
    const timed = (name, fn) => { const t = performance.now(), out = fn(), ms = performance.now() - t; diagnostics.loading[name] = (diagnostics.loading[name] || 0) + Math.round(ms * 10) / 10; diagnostics.loading.longest = Math.max(diagnostics.loading.longest || 0, Math.round(ms * 10) / 10); return out; };
    const started = performance.now();
    await buildCover();
    // The lighter shapes for animals seen far off: built once a species, a species a slice.
    for (const id of gltfs.keys()) { if (facts.get(id).lengthMetres > 2.5 || id === 'remora') { timed('lighter', () => lighter.set(id, creatureGeometry(id, { lod: 1 }))); await turn(); } }
    // And the shapes the schools are drawn with, likewise a species a slice, so building the schools is quick.
    for (const s of [...Object.values(SCHOOLS), ...Object.values(ENCOUNTERS).flatMap(slot => slot.kinds.map(kind => kind.school).filter(Boolean))]) {
      if (!gltfs.has(s.species)) continue; timed('school shapes', () => creatureGeometry(s.species, { lod: s.lod ?? 1, pose: s.pose ?? null })); await turn();
    }
    timed('residents', buildResidents); await turn();
    timed('puppets', buildPuppets); await turn();
    timed('encounters', buildEncounters); await turn();
    const placing = performance.now(); await placeSeabed(); diagnostics.loading.seabed = Math.round(performance.now() - placing);
    timed('schools', buildSchools); await turn();
    diagnostics.loading.total = Math.round(performance.now() - started);
    update(0); diagnostics.ready = true;
    return diagnostics;
  }

  /** view: { frustum, eye, range } or null (the orbit viewer: everything resident is drawn). */
  function update(dt = 0, player = null, view = null) {
    const started = performance.now(), step = Math.min(.1, Math.max(0, dt)); clock += step; frame++; swimTime.value = clock;
    coverLate();
    if (step > 0) { direct(step, player, view); driveResidents(step, player); }
    for (const a of actors) present(a, step, view);
    paintSchools(step, player, view);
    // The slowest a frame of this set has been (ms): nothing here should ever hold up a tap.
    const spent = performance.now() - started; diagnostics.frame = Math.round(spent * 100) / 100; if (spent > diagnostics.slowestFrame) diagnostics.slowestFrame = Math.round(spent * 10) / 10;
  }

  Object.defineProperties(diagnostics, {
    count: { enumerable: true, get: () => diagnostics.visitorCount + diagnostics.schoolFish },
    shown: { enumerable: true, get: () => ({ skinned: actors.filter(a => a.seen).length, instances: [...kinds.values()].reduce((sum, k) => sum + (k.drawn || 0), 0), encounters: [...diagnostics.encounters.active] }) },
    finite: { enumerable: true, get: () => actors.every(a => a.pos.toArray().every(Number.isFinite)) }
  });
  const sitesNow = () => [...actors.filter(a => a.active).map(a => ({ id: a.name, species: a.species, kind: 'animal', position: a.pos.toArray(), length: a.L, seen: a.seen })),
    ...groups.filter(g => g.active).map(g => ({ id: g.name, species: g.k.species, kind: g.kind, position: g.centre.toArray(), length: g.radius, seen: g.shown }))];
  const debug = {
    /** The seabed map the swimmers steer by, and the solid tops in it (m). */
    cover: (x, z) => ({ soft: cover(x, z), hard: ground(x, z), sand: floor(x, z), covered }),
    /** Every skinned animal as it stands (tools/audit-reef.mjs): pose, clip and clip rate. */
    actors: () => actors.map(a => ({ name: a.name, species: a.species, active: a.active, seen: a.seen, clip: a.clip, x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: a.yaw, pitch: a.pitch, roll: a.roll, length: a.L, rate: a.mixer.timeScale })),
    /** The instanced groups, in the order they are packed into their species' mesh. */
    groups: () => groups.map(g => ({ name: g.name, kind: g.kind, species: g.k.species, key: g.k.key, active: g.active, shown: g.shown, count: g.members.length, centre: g.centre.toArray(), radius: g.radius, spread: g.spread, size: g.size })),
    swimmers: () => [...herds, ...groups.filter(g => g.kind === 'shoal')].flatMap((g, group) => g.members.filter(m => m.nav).map(m => ({ group: g.name ? `${g.name} #${groups.indexOf(g)}` : `herd ${group}`, route: [g.route.cx, g.route.cz, g.route.rx, g.route.rz], species: m.actor?.species || g.k.species, name: m.actor?.name || null, x: m.nav.x, y: m.nav.y, z: m.nav.z, yaw: m.nav.yaw, pitch: m.nav.pitch, floor: cover(m.nav.x, m.nav.z), clearance: m.clearance, speed: g.speed, blocked: m.nav.blocked }))),
    /** Bring an encounter in now, wherever the diver is: 'whale', 'whale-shark', 'orcas', 'dolphins', 'blacktips', 'tuna'. */
    spawn(id, player = null, view = null) { const e = casts.get(id); if (!e) return false; const s = slots.find(item => item.slot === e.slot); if (s.active) end(s.active); begin(e, player, view); s.active = e; return true; },
    slots: () => slots.map(s => ({ slot: s.slot, active: s.active?.id || null, wait: Math.round(s.wait), progress: s.active ? +s.active.u.toFixed(3) : null })),
    /** Move an encounter under way to a point of its pass (0..1; .5 is its closest approach). */
    seek(id, u) { const e = casts.get(id); if (!e?.path) return false; e.u = u; for (const c of e.cast) c.actor.started = false; for (const r of e.riders) r.actor.started = false; return true; }
  };
  // Where a resident that stays put actually settled (sand() can move it well away from its wished-for spot): the guided dive frames it from here.
  // Where a resident is: one lying still where it settled, or the whipray where it glides now (the guided dive follows it).
  const residentAt = id => resting[id] ?? (id === 'whipray' && whipray ? [whipray.pos.x, whipray.pos.y, whipray.pos.z] : null);
  // The guided dive brings one encounter in on a course of its own, and points out the visitors passing: where each lead animal is now.
  function encounter(id, player, view, course) { const e = casts.get(id); if (!e?.cast.length) return false; const s = slots.find(item => item.slot === e.slot); if (s.active) end(s.active); begin(e, player, view, course); s.active = e; return true; }
  const visitors = () => slots.filter(s => s.active?.path && s.active.cast[0]?.actor.started).map(s => { const p = s.active.cast[0].actor.pos; return { id: s.active.id, x: p.x, y: p.y, z: p.z }; });
  return { root, load, update, diagnostics, sites: sitesNow, debug, residentAt, encounter, visitors };
}
