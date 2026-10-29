import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone } from './vendor/SkeletonUtils.js';
import { floatSkinIndices, turn, modelBytes } from './assets.js';
import { creatureGeometry, speciesById } from './creature-species.js';
import { ENCOUNTERS, RESIDENTS, SCHOOLS } from './user-creature-routes.js';
import { fishNavigator } from './fish-navigation.js';
import { createMorayDenMotion, updateMorayDenMotion } from './moray-resident.js';

// The creature set at home in the ocean (see user-creature-routes.js for the numbers).
//
// The great animals are encounters: a whale far out in the blue, a whale shark with its remoras, an orca family, a
// dolphin pod, a pair of reef sharks, a tuna school. A director brings one in from beyond the haze, lets it pass the
// diver and swim out of sight, and then nothing of it exists (no drawing, no animation) until it is chosen again.
// Residents (bumpheads, rays, a sleeping nurse shark, the wreck's barracuda, morays in their dens) live on the reef
// and cost nothing while out of view. Fish in numbers are instances of the set's own models, one draw call a
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
  const diagnostics = { loading: {}, ready: false, loaded: 0, loadedSpecies: 0, failed: 0, species: 0, errors: [], visitors: 0, visitorCount: 0, schoolFish: 0, schoolCount: 0, schoolDrawCalls: 0, encounters: { active: [], history: [] } };
  const gltfs = new Map(), facts = new Map(), actors = [], groups = [], kinds = new Map(), herds = [];
  let clock = 0, frame = 0;

  // --- The seabed, as the animals see it ------------------------------------------------------------------------
  // A one-metre height map of the terrain and every collision box on it, widened and softened, so an animal keeping
  // its height above it rises over a coral head in a curve instead of a step. Built once, a few rows at a time.
  const GX = -64, GZ = -108, GW = 129, GH = 146, hard = new Float32Array(GW * GH), soft = new Float32Array(GW * GH);
  const floor = (x, z) => { const h = terrainHeightAt(x, z); return Number.isFinite(h) ? Math.max(h, -200) : -60; };
  async function buildCover() {
    for (let z = 0; z < GH; z++) { for (let x = 0; x < GW; x++) hard[z * GW + x] = floor(GX + x, GZ + z); if (z % 24 === 23) await turn(); }
    for (const { box } of collisions?.boxes || []) {
      const x0 = Math.max(0, Math.floor(box.min.x - GX - .5)), x1 = Math.min(GW - 1, Math.ceil(box.max.x - GX + .5)), z0 = Math.max(0, Math.floor(box.min.z - GZ - .5)), z1 = Math.min(GH - 1, Math.ceil(box.max.z - GZ + .5));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const i = z * GW + x; if (box.max.y > hard[i]) hard[i] = box.max.y; }
    }
    await turn();
    const wide = new Float32Array(GW * GH);
    for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) { let top = -1e9; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) top = Math.max(top, hard[clamp(z + dz, 0, GH - 1) * GW + clamp(x + dx, 0, GW - 1)]); wide[z * GW + x] = top; }
    await turn();
    for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) { let sum = 0; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) sum += wide[clamp(z + dz, 0, GH - 1) * GW + clamp(x + dx, 0, GW - 1)]; soft[z * GW + x] = Math.max(sum / 25, hard[z * GW + x]); }
  }
  function cover(x, z) {
    const fx = clamp(x - GX, 0, GW - 1.001), fz = clamp(z - GZ, 0, GH - 1.001), ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * GW + ix;
    return (soft[i] * (1 - tx) + soft[i + 1] * tx) * (1 - tz) + (soft[i + GW] * (1 - tx) + soft[i + GW + 1] * tx) * tz;
  }
  const ground = (x, z) => hard[clamp(Math.round(z - GZ), 0, GH - 1) * GW + clamp(Math.round(x - GX), 0, GW - 1)];
  const navigation = fishNavigator(cover);
  const resting = {};
  const solid = (x, z) => ground(x, z) > floor(x, z) + .25;
  /** Open, fairly level sand near a wished-for spot: for the animals that lie on the bottom. */
  function sand(x, z, radius = 2) {
    for (let ring = 0; ring <= 16; ring++) for (let k = 0, n = ring ? ring * 6 : 1; k < n; k++) {
      const a = k / n * TAU + ring, px = x + Math.cos(a) * ring, pz = z + Math.sin(a) * ring; let ok = Math.abs(px) < 58 && pz > -100 && pz < 30;
      for (let s = 0; ok && s < 6; s++) { const qx = px + Math.cos(s * TAU / 6) * radius, qz = pz + Math.sin(s * TAU / 6) * radius; ok = !solid(qx, qz) && Math.abs(floor(qx, qz) - floor(px, pz)) < radius * .45; }
      if (ok && !solid(px, pz)) return [px, pz];
    }
    return [x, z];
  }
  // What the reef offers to gather round: the tall formations, the coral gardens, residents' sites and landmarks.
  const formations = () => (sites.formations || []).map(s => ({ name: s.name, x: s.position[0], y: s.position[1], z: s.position[2], radius: s.radius, height: s.height }));
  const patches = zone => (sites.patches?.() || []).filter(p => !zone || p.zone === zone).map(p => ({ x: p.x, z: p.z, y: floor(p.x, p.z), radius: p.radius || 5, zone: p.zone }));
  const lifeSite = id => { const s = (sites.life || []).find(item => item.id === id); return s && { x: s.position[0], y: s.position[1], z: s.position[2], radius: s.radius }; };
  const landmark = id => { const s = (sites.landmarks || []).find(item => item.id === id); return s && { x: s.position[0], y: s.position[1], z: s.position[2] }; };

  // --- Skinned animals --------------------------------------------------------------------------------------------
  const lighter = new Map();
  function actor(species, { clip = 'swim', scale = 1, name = species } = {}) {
    const gltf = gltfs.get(species), fact = facts.get(species); if (!gltf) return null;
    const model = clone(gltf.scene), wrapper = new THREE.Group(); wrapper.name = `Creature set · ${name}`; wrapper.userData.creatureId = species; wrapper.add(model); wrapper.scale.setScalar(scale);
    let mesh = null; model.traverse(n => { if (n.isSkinnedMesh && !mesh) mesh = n; }); if (!mesh) return null;
    mesh.frustumCulled = false;   // culled here, against the haze as well as the view
    const mixer = new THREE.AnimationMixer(model), actions = {};
    for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c);
    const swim = gltf.animations.find(c => c.name === 'swim') || gltf.animations[0], L = fact.lengthMetres * scale;
    const a = { species, name, wrapper, mesh, full: mesh.geometry, light: lighter.get(species), mixer, actions, clip: null, after: null, until: 0, L, scale,
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
    if (view) { d = view.eye.distanceTo(a.pos); sphere.center.copy(a.pos); sphere.radius = a.L * .7; seen = d - sphere.radius < view.range && view.frustum.intersectsSphere(sphere); }
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
      m.navOptions = { speed: g.speed, clearance: m.clearance, radius: m.navRadius };
    }
    if (dt > 0) {
      // Keep a nearby point in front of the swimmer rather than steering directly toward its current station.
      want.x += tx * Math.max(1, g.speed * 1.8); want.z += tz * Math.max(1, g.speed * 1.8);
      want.y = g.height(m.nav.x, m.nav.z, t) + m.up + Math.sin(t * m.w2 + m.p2) * m.bob;
      // Members keep their own lanes while a detour compresses the formation; no forced positional offsets
      // after navigation, which would put a safe fish back inside the obstacle it has just avoided.
      for (const other of g.members) {
        if (other === m || !other.nav) continue;
        const dx = m.nav.x - other.nav.x, dz = m.nav.z - other.nav.z, dy = m.nav.y - other.nav.y;
        const distance = Math.hypot(dx, dy, dz), room = (m.navLength + other.navLength) * .35;
        if (distance > .01 && distance < room) { const push = Math.min(2, (room - distance) * 1.5) / distance; want.x += dx * push; want.z += dz * push; }
      }
      if (player) {
        const dx = m.nav.x - player.x, dz = m.nav.z - player.z, distance = Math.hypot(dx, dz), room = 3 + (m.actor?.L || 1) * .4;
        if (Math.abs(m.nav.y - player.y) < room && distance < room && distance > .01) { want.x += dx / distance * (room - distance) * 2; want.z += dz / distance * (room - distance) * 2; }
      }
      m.navOptions.speed = g.speed * (g.pace ?? 1); navigation.step(m.nav, want, dt, m.navOptions);
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
  // depth, and ahead starts it that many metres short of its closest approach instead of out beyond the haze.
  function begin(e, player, view, course = null) {
    // A kind with `across` swims parallel to the reef, across its face (the reef deepens towards -z, so that is east or west),
    // its line kept out over the deep shelf at z `across` or deeper, never in over the shallows.
    const across = !course && e.across !== undefined;
    const range = view ? Math.min(view.range, 130) : 110, R = range + e.length + 12, angle = course?.angle ?? (across ? (Math.random() < .5 ? 1 : -1) * Math.PI / 2 : rr(0, TAU)), sideOf = course?.side ?? (Math.random() < .5 ? 1 : -1);
    const dx = Math.sin(angle), dz = Math.cos(angle), nx = dz * sideOf, nz = -dx * sideOf, pass = course?.pass ?? rr(...e.pass), px = player?.x ?? 0, pz = player?.z ?? -30;
    const cx = across ? px : px + nx * pass, cz = across ? Math.min(pz - pass, e.across) : pz + nz * pass;
    e.path = { sx: cx - dx * R, sz: cz - dz * R, ex: cx + dx * R, ez: cz + dz * R, nx, nz, len: 2 * R, bulge: rr(-1, 1) * e.bulge * R };
    e.u = course?.ahead === undefined ? 0 : clamp(.5 - course.ahead / e.path.len, 0, .5); e.y0 = course?.y ?? rr(...e.depth); e.next = clock + rr(4, 8);
    for (const c of e.cast) { c.actor.active = true; c.actor.started = false; play(c.actor, 'swim', 0); }
    for (const r of e.riders) { r.actor.active = true; r.actor.started = false; }
    if (e.school) e.school.active = true;
    diagnostics.encounters.history.push({ id: e.id, at: Math.round(clock), pass: Math.round(pass) }); if (diagnostics.encounters.history.length > 12) diagnostics.encounters.history.shift();
  }
  function end(e) {
    for (const c of e.cast) c.actor.active = false; for (const r of e.riders) r.actor.active = false;
    if (e.school) e.school.active = false; e.path = null;
  }
  // A point on the pass (u: 0 at the far start, 1 at the far end): a straight line with a gentle bow in it.
  function onPath(e, u, out, tangent) {
    const p = e.path, bow = Math.sin(Math.PI * u) * p.bulge, slope = Math.PI * Math.cos(Math.PI * u) * p.bulge;
    out.x = p.sx + (p.ex - p.sx) * u + p.nx * bow; out.z = p.sz + (p.ez - p.sz) * u + p.nz * bow;
    tangent.set(p.ex - p.sx + p.nx * slope, 0, p.ez - p.sz + p.nz * slope).normalize();
  }
  const T = new THREE.Vector3();
  function bandHeight(e, x, z, phase) {
    let y = e.low ? Math.min(e.depth[1], cover(x, z) + 3.2) : e.y0 + Math.sin(clock * .11 + phase) * 1.2;
    if (e.porpoise) y = e.y0 + e.porpoise * Math.sin(clock * .95 + phase);
    return Math.min(-1.8, Math.max(y, cover(x, z) + e.clearance));
  }
  function driveEncounter(e, dt, player) {
    e.u += e.speed * dt / e.path.len;
    const backest = Math.max(0, ...e.cast.map(c => c.back), e.school ? e.school.spread[0] : 0);
    if (e.u - (backest + e.length) / e.path.len > 1) return false;
    for (const c of e.cast) {
      const a = c.actor;
      onPath(e, clamp(e.u - c.back / e.path.len, 0, 1), want, T);
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
      a.ease = 6; place(a, C, host.yaw + r.yaw + (r.trip > 0 ? Math.cos((1 - r.trip) * TAU) * .5 * r.side : 0), host.pitch, 0, dt);
    }
  }
  function direct(dt, player, view) {
    diagnostics.encounters.active.length = 0;
    for (const s of slots) {
      if (s.active) {
        if (driveEncounter(s.active, dt, player)) { diagnostics.encounters.active.push(s.active.id); continue; }
        end(s.active); s.last = s.active.id; s.active = null; s.wait = rr(...s.config.cooldown) * (economy ? 1.3 : 1);
      } else if ((s.wait -= dt) <= 0) {
        const choices = s.kinds.filter(k => k.id !== s.last), e = choices[Math.floor(Math.random() * choices.length)] || s.kinds[0];
        begin(e, player, view); s.active = e;
      }
    }
  }

  // --- Residents ------------------------------------------------------------------------------------------------
  const spotted = [], dens = [];
  let sentinel = null, grazers = null;
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
    if (gltfs.has(w.species)) { const a = actor(w.species); if (a) herds.push({ route: route(...w.loop), height: over(w.height, -4), speed: w.speed, pace: 1, members: [{ actor: a, ...member(0, 0, 0, { drift: .6, bob: .12 }) }], look: 6, bank: .12 }); }
    const s = RESIDENTS.bluespots;
    if (gltfs.has(s.species)) for (const [x, z] of s.spots.slice(0, economy ? s.lean : s.spots.length)) {
      const a = actor(s.species, { clip: 'rest' }); if (!a) continue;
      const [px, pz] = sand(x, z, 1.8); a.pos.set(px, floor(px, pz) + .1, pz); a.yaw = rr(0, TAU); a.started = true;
      spotted.push({ actor: a, from: a.pos.clone(), to: a.pos.clone(), go: 0, yaw: a.yaw });
    }
    const n = RESIDENTS.sleeper;
    if (gltfs.has(n.species)) { const a = actor(n.species, { clip: 'rest' }); if (a) { const [x, z] = sand(...n.near, 3.5); a.pos.set(x, floor(x, z) + .45, z); resting.sleeper = a.pos.toArray(); a.yaw = rr(0, TAU); a.started = true; a.wrapper.position.copy(a.pos); a.wrapper.rotation.set(0, a.yaw, 0, 'YXZ'); } }
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
      dens.push({ actor: a, rest: 0, motion, pose });
    }
  }
  function driveResidents(dt, player) {
    if (grazers) {
      grazers.timer -= dt;
      if (grazers.timer < 0) { grazers.grazing = !grazers.grazing; grazers.timer = grazers.grazing ? rr(6, 10) : rr(18, 32); for (const m of grazers.members) play(m.actor, grazers.grazing ? 'graze' : 'swim', 1.1); }
      grazers.pace += ((grazers.grazing ? .05 : 1) - grazers.pace) * ease(dt, 1.2);
    }
    for (const g of herds) driveHerd(g, dt, clock, player);
    for (const s of spotted) {
      const a = s.actor;
      if (s.go > 0) {
        s.go = Math.max(0, s.go - dt / 2.4); const u = 1 - s.go, k = u * u * (3 - 2 * u);
        a.pos.lerpVectors(s.from, s.to, k); a.pos.y += Math.sin(u * Math.PI) * 1.2; a.yaw += turnTo(a.yaw, s.yaw) * ease(dt, 6);
        if (s.go === 0) play(a, 'rest', 1);
      } else if (player && a.pos.distanceToSquared(player) < 6 * 6) {
        // Away from the diver, to the first open sand in that direction.
        const base = Math.atan2(a.pos.x - player.x, a.pos.z - player.z);
        for (const t of [0, .5, -.5, 1, -1, 1.6]) { const yaw = base + t, x = a.pos.x + Math.sin(yaw) * 10, z = a.pos.z + Math.cos(yaw) * 10; if (Math.abs(x) < 58 && z > -100 && z < 30 && !solid(x, z)) { s.from.copy(a.pos); s.to.set(x, floor(x, z) + .1, z); s.yaw = yaw; s.go = 1; play(a, 'fast', .25); break; } }
      }
      a.wrapper.position.copy(a.pos); a.wrapper.rotation.set(0, a.yaw, 0, 'YXZ');
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
      if (s.dart <= 0 && s.calm <= 0 && d < 6) { s.dart = 1; s.hover = 0; s.away.copy(a.pos).sub(player).setY(0).normalize().multiplyScalar(16).add(a.pos); s.away.y = s.home.y + 2; play(a, 'strike', .15, true, 'fast'); }
      if (s.dart > 0) {
        s.dart -= dt / 6; const out = s.dart > .75;
        if (out) { C.copy(s.away); a.ease = 3; } else a.ease = .8;
        yaw = Math.atan2(C.x - a.pos.x, C.z - a.pos.z);
        if (s.dart <= 0) { s.calm = 6; s.cruise = rr(14, 22); play(a, 'swim', 1.2); a.ease = 1.2; }
      }
      place(a, C, yaw, 0, 0, dt);
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
      g.centre.set(x, y, z); g.size = size; g.heading = rr(0, TAU); g.radius = Math.max(...size) + L(species);
      for (let i = 0; i < count; i++) { const a = rr(0, TAU), r = Math.cbrt(Math.random()), u = rr(-1, 1), s = Math.sqrt(1 - u * u); g.members.push({ hx: Math.cos(a) * s * r * size[0], hy: u * r * size[1], hz: Math.sin(a) * s * r * size[2], scale: rr(.85, 1.1), w1: rr(.35, 1.1), w2: rr(.4, 1.2), w3: rr(.2, .7), p1: rr(0, TAU), p2: rr(0, TAU), p3: rr(0, TAU), beat: rr(0, TAU) }); }
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
    const anchors = near => { const list = near === 'formations' ? all.map(f => ({ x: f.x + f.radius * 1.1, z: f.z })) : patches(); return list.length ? list : all.map(f => ({ x: f.x - f.radius * 1.2, z: f.z + 2 })); };
    for (const id of ['butterflies', 'idols', 'tangs', 'angels']) {
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
    // One mesh a species; the groups in sight are packed to its front each frame.
    for (const k of kinds.values()) {
      if (!k.capacity) continue;
      const mesh = new THREE.InstancedMesh(k.geometry, k.material, k.capacity); mesh.name = `Creature set · ${k.species} (${k.capacity})`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
      k.beats = new THREE.InstancedBufferAttribute(new Float32Array(k.capacity), 1); k.beats.setUsage(THREE.DynamicDrawUsage); mesh.geometry.setAttribute('aBeat', k.beats);
      k.mesh = mesh; root.add(mesh); diagnostics.schoolDrawCalls++;
    }
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler(0, 0, 0, 'YXZ');
  function write(k, x, y, z, yaw, pitch, roll, scale, beat) {
    const slot = k.drawn++; want.set(x, y, z); E.set(-pitch, yaw, roll, 'YXZ'); M.compose(want, Q.setFromEuler(E), S.setScalar(scale)); k.mesh.setMatrixAt(slot, M); k.beats.array[slot] = beat;
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
      if (g.kind === 'encounter') { const e = casts.get('tuna'); if (!e?.path) continue; onPath(e, clamp(e.u, 0, 1), A, T); g.centre.set(A.x, bandHeight(e, A.x, A.z, 0), A.z); g.radius = g.spread[0] + 6; }
      g.shown = true;
      if (view) { sphere.center.copy(g.centre); sphere.radius = g.radius; g.shown = view.eye.distanceTo(g.centre) - g.radius < view.range * (g.kind === 'cloud' || g.kind === 'burrows' ? .55 : .8) && view.frustum.intersectsSphere(sphere); }
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
        // Holding station facing the current, darting a little; they sink into the coral as the diver comes close.
        let near = 0; if (player) near = 1 - smoothstep(player.distanceTo(g.centre), g.radius + 1, g.radius + 7);
        g.fear += (near - g.fear) * ease(dt, near > g.fear ? 4 : .5);
        const tight = 1 - g.fear * .55, drop = g.fear * g.size[1] * 1.3;
        for (const m of g.members) write(k, g.centre.x + m.hx * tight + Math.sin(t * m.w1 + m.p1) * .5, g.centre.y - drop + m.hy * tight + Math.sin(t * m.w2 + m.p2) * .3, g.centre.z + m.hz * tight + Math.cos(t * m.w1 * .9 + m.p3) * .5,
          g.heading + Math.sin(t * m.w3 + m.p3) * .7 + Math.sin(t * m.w1 * 2.3 + m.p1) * .25, Math.sin(t * m.w2 + m.p3) * .18, 0, m.scale, m.beat);
      } else if (g.kind === 'burrows') {
        // Upright in the sand; as the diver comes over they draw back until only their heads show.
        const L = facts.get(g.k.species).lengthMetres; let near = 0; if (player) near = 1 - smoothstep(player.distanceTo(g.centre), 5, 11);
        g.sink += (near - g.sink) * ease(dt, near > g.sink ? 2.5 : .35);
        for (const m of g.members) write(k, m.x, m.y - L * (.08 + .4 * g.sink) * m.scale, m.z, m.yaw + Math.sin(t * m.w1 + m.p1) * .4, Math.PI / 2 - .12, 0, m.scale, m.beat);
      } else if (g.kind === 'encounter') {
        const e = casts.get('tuna');
        for (const m of g.members) { onPath(e, clamp(e.u - m.back / e.path.len, 0, 1), A, T); write(k, A.x - T.z * m.side, bandHeight(e, A.x, A.z, 0) + m.up, A.z + T.x * m.side, Math.atan2(T.x, T.z) + Math.sin(t * m.w1 + m.p1) * .05, 0, 0, m.scale, m.beat); }
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
    timed('encounters', buildEncounters); await turn();
    timed('schools', buildSchools); await turn();
    diagnostics.loading.total = Math.round(performance.now() - started);
    update(0); diagnostics.ready = true;
    return diagnostics;
  }

  /** view: { frustum, eye, range } or null (the orbit viewer: everything resident is drawn). */
  function update(dt = 0, player = null, view = null) {
    const step = Math.min(.1, Math.max(0, dt)); clock += step; frame++; swimTime.value = clock;
    if (step > 0) { direct(step, player, view); driveResidents(step, player); }
    for (const a of actors) present(a, step, view);
    paintSchools(step, player, view);
  }

  Object.defineProperties(diagnostics, {
    count: { enumerable: true, get: () => diagnostics.visitorCount + diagnostics.schoolFish },
    shown: { enumerable: true, get: () => ({ skinned: actors.filter(a => a.seen).length, instances: [...kinds.values()].reduce((sum, k) => sum + (k.drawn || 0), 0), encounters: [...diagnostics.encounters.active] }) },
    finite: { enumerable: true, get: () => actors.every(a => a.pos.toArray().every(Number.isFinite)) }
  });
  const sitesNow = () => [...actors.filter(a => a.active).map(a => ({ id: a.name, species: a.species, kind: 'animal', position: a.pos.toArray(), length: a.L, seen: a.seen })),
    ...groups.filter(g => g.active).map(g => ({ id: g.name, species: g.k.species, kind: g.kind, position: g.centre.toArray(), length: g.radius, seen: g.shown }))];
  const debug = {
    swimmers: () => [...herds, ...groups.filter(g => g.kind === 'shoal')].flatMap(g => g.members.filter(m => m.nav).map(m => ({ species: m.actor?.species || g.k.species, x: m.nav.x, y: m.nav.y, z: m.nav.z, yaw: m.nav.yaw, pitch: m.nav.pitch, floor: cover(m.nav.x, m.nav.z), clearance: m.clearance, speed: g.speed, blocked: m.nav.blocked }))),
    /** Bring an encounter in now, wherever the diver is: 'whale', 'whale-shark', 'orcas', 'dolphins', 'blacktips', 'tuna'. */
    spawn(id, player = null, view = null) { const e = casts.get(id); if (!e) return false; const s = slots.find(item => item.slot === e.slot); if (s.active) end(s.active); begin(e, player, view); s.active = e; return true; },
    slots: () => slots.map(s => ({ slot: s.slot, active: s.active?.id || null, wait: Math.round(s.wait), progress: s.active ? +s.active.u.toFixed(3) : null })),
    /** Move an encounter under way to a point of its pass (0..1; .5 is its closest approach). */
    seek(id, u) { const e = casts.get(id); if (!e?.path) return false; e.u = u; for (const c of e.cast) c.actor.started = false; for (const r of e.riders) r.actor.started = false; return true; }
  };
  // Where a resident that stays put actually settled (sand() can move it well away from its wished-for spot): the guided dive frames it from here.
  const residentAt = id => resting[id] ?? null;
  // The guided dive brings one encounter in on a course of its own, and points out the visitors passing: where each lead animal is now.
  function encounter(id, player, view, course) { const e = casts.get(id); if (!e?.cast.length) return false; const s = slots.find(item => item.slot === e.slot); if (s.active) end(s.active); begin(e, player, view, course); s.active = e; return true; }
  const visitors = () => slots.filter(s => s.active?.path && s.active.cast[0]?.actor.started).map(s => { const p = s.active.cast[0].actor.pos; return { id: s.active.id, x: p.x, y: p.y, z: p.z }; });
  return { root, load, update, diagnostics, sites: sitesNow, debug, residentAt, encounter, visitors };
}
