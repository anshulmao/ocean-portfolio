import * as THREE from './vendor/three.module.min.js';
import { createKit, createParticles, Mesher, tone } from './living-world-shaders.js';
import { createSurfaceLife } from './living-world-surface.js';

// Behaviour and small-scale life for the reef: animals that notice the diver, animals busy with something,
// and a slow director that makes sure there is a moment worth stopping for every half minute or so.
//
//   const life = createLivingWorld({ terrainHeightAt, collisions, economy, uniforms });
//   scene.add(life.root);
//   life.update(dt, elapsed, { player, camera, view, underwater, night, depth, weather, lamp, paused });
//
// Nothing here is solid. Creatures keep clear of the diver; the diver never has to keep clear of them.
// Every creature belongs to a group with an interest radius: a group the diver is far from, and that
// the camera cannot see, is neither simulated nor drawn.
const { clamp, smoothstep, lerp } = THREE.MathUtils;
const TAU = Math.PI * 2;
const turnTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);
const blend = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Ground the scene has already spoken for: the start, the three landmarks, the arch, the grottos (12 m each),
// the gully under the arch, and the lanes between the landmarks and along the guided tour.
const KEEP = [[0, 0], [-12, -15], [18, -39], [-18, -82], [20, -72], [-35, -30], [36, -48], [-33, -73], [39, -91], [7, 18]];
const ROUTE = [[0, 0], [-12, -15], [18, -39], [-18, -82]];
const TOUR = [[0, -5], [-12, -15], [28.5, -11], [18, -21.8], [31, -30], [31, -48], [25, -58], [20, -62.6], [20, -87.5], [4, -80], [-18, -82]];
function lineDistance(x, z, line) {
  let closest = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = line[i - 1][0], az = line[i - 1][1], dx = line[i][0] - ax, dz = line[i][1] - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    closest = Math.min(closest, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return closest;
}
/** May something small live here? clear: metres from the sites above; lane: metres from the routes. */
function open(x, z, clear = 12, lane = 2.5) {
  if (Math.abs(x) > 58 || z < -101 || z > 31) return false;
  for (let i = 0; i < KEEP.length; i++) if (Math.hypot(x - KEEP[i][0], z - KEEP[i][1]) < clear) return false;
  if (x > 7 && x < 33 && z > -77 && z < -53) return false;
  return lane <= 0 || (lineDistance(x, z, ROUTE) >= lane && lineDistance(x, z, TOUR) >= lane);
}

export function createLivingWorld(options) { const steps = livingWorldSteps(options); let step; while (!(step = steps.next()).done); return step.value; }
// The same build, pausing (yielding) between its sections so the page can do it between frames.
export function* livingWorldSteps({ terrainHeightAt = () => -30, collisions = null, economy = false, uniforms = null, seed = 20261013 } = {}) {
  const root = new THREE.Group(); root.name = 'Living world'; root.matrixAutoUpdate = false;
  const under = new THREE.Group(); under.name = 'Living world · underwater life'; under.matrixAutoUpdate = false; root.add(under);
  const random = mulberry(seed), rr = (a, b) => a + random() * (b - a), pick = list => list[Math.floor(random() * list.length)];
  const floor = (x, z) => { const h = terrainHeightAt(x, z); return Number.isFinite(h) ? h : -30; };
  const kit = createKit(), geo = kit.geometries, shared = kit.shared;
  const events = new EventTarget(), sites = [], log = [];
  const round = value => Math.round(value * 100) / 100;
  const site = (id, name, x, y, z, radius, kind, note) => sites.push({ id, name, position: [round(x), round(y), round(z)], radius, kind, note });

  yield;
  // What already stands on the seabed, as a one-metre height map of the collision boxes: used once to find
  // open sand for the residents, and by the swimmers to pass over coral instead of through it.
  const GX = -62, GZ = -105, GW = 125, GH = 141, cover = new Float32Array(GW * GH).fill(-1e9);
  if (collisions && Array.isArray(collisions.boxes)) for (const { box } of collisions.boxes) {
    const x0 = Math.max(0, Math.floor(box.min.x - GX - .3)), x1 = Math.min(GW - 1, Math.ceil(box.max.x - GX + .3));
    const z0 = Math.max(0, Math.floor(box.min.z - GZ - .3)), z1 = Math.min(GH - 1, Math.ceil(box.max.z - GZ + .3));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const i = z * GW + x; if (box.max.y > cover[i]) cover[i] = box.max.y; }
  }
  const cell = (x, z) => clamp(Math.round(z - GZ), 0, GH - 1) * GW + clamp(Math.round(x - GX), 0, GW - 1);
  const coverAt = (x, z) => Math.max(cover[cell(x, z)], floor(x, z));
  const solid = (x, z) => cover[cell(x, z)] > floor(x, z) + .3;
  function crowded(x, z, radius) {
    for (let dz = -radius; dz <= radius; dz += 1) for (let dx = -radius; dx <= radius; dx += 1) if (dx * dx + dz * dz <= radius * radius + .5 && solid(x + dx, z + dz)) return true;
    return false;
  }
  /** The nearest open ground to a wished-for spot that no other resident has claimed. radius: the clear sand it needs. */
  const claims = [];
  function settle(x, z, radius = 1.5, clear = 12, lane = 2.5) {
    const free = (px, pz) => { for (let i = 0; i < claims.length; i++) if (Math.hypot(px - claims[i][0], pz - claims[i][1]) < radius + claims[i][2] + .6) return false; return true; };
    for (let ring = 0; ring <= 16; ring++) {
      const r = ring * .8, steps = ring ? Math.ceil(TAU * r / 1.2) : 1;
      for (let k = 0; k < steps; k++) {
        const a = k / steps * TAU + ring * .7, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (open(px, pz, clear, lane) && !crowded(px, pz, radius) && free(px, pz)) { claims.push([px, pz, radius]); return [px, pz]; }
      }
    }
    claims.push([x, z, radius]);
    return [x, z];
  }

  yield;
  // --- The diver, as the residents see them -----------------------------------
  const me = new THREE.Vector3(0, 0, 0), meLast = new THREE.Vector3(), meVel = new THREE.Vector3(), eye = new THREE.Vector3(0, 2.5, 10);
  const fwd = new THREE.Vector3(0, 0, -1), aim = new THREE.Vector3(0, 0, -1), heading = new THREE.Vector3(0, 0, -1), lampAt = new THREE.Vector3(), beam = new THREE.Vector3(0, 0, -1);
  let speed = 0, hadPlayer = false, time = 0, night = 0, depth = 0, storm = 0, wind = .18, underwater = 0, lampOn = false, dusk = 0, hunker = 0, view = null, range = 400;

  // --- Instanced creatures --------------------------------------------------------
  const lifeMeshes = [];
  function cast(geometry, count, name, culled = false) {
    const mesh = kit.lifeMesh(geometry, kit.life, count, name);
    mesh.frustumCulled = culled; mesh.userData.dm = mesh.userData.dl = mesh.userData.dc = true; mesh.userData.on = false;
    mesh.userData.life = mesh.geometry.attributes.aLife.array; mesh.userData.tint = mesh.geometry.attributes.aTint.array;
    under.add(mesh); lifeMeshes.push(mesh); return mesh;
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(0, 0, 0, 'YXZ'), UP = new THREE.Vector3(0, 1, 0), AXIS = new THREE.Vector3();
  // yaw turns +Z toward +X; pitch > 0 lifts the nose.
  function pose(mesh, i, x, y, z, yaw, pitch, roll, sx, sy, sz) {
    E.set(-pitch, yaw, roll, 'YXZ'); Q.setFromEuler(E); M.compose(P.set(x, y, z), Q, S.set(sx, sy, sz)); mesh.setMatrixAt(i, M); mesh.userData.dm = true;
  }
  const conceal = (mesh, i) => { mesh.setMatrixAt(i, kit.ZERO_MATRIX); mesh.userData.dm = true; };
  function life(mesh, i, phase, state, drive, kind) { const a = mesh.userData.life, o = i * 4; a[o] = phase; a[o + 1] = state; a[o + 2] = drive; a[o + 3] = kind; mesh.userData.dl = true; }
  function drive(mesh, i, state, amount) { const a = mesh.userData.life, o = i * 4; if (a[o + 1] !== state || a[o + 2] !== amount) { a[o + 1] = state; a[o + 2] = amount; mesh.userData.dl = true; } }
  const colour = new THREE.Color();
  function dress(mesh, i, base, second, glow = 0) { mesh.setColorAt(i, colour.set(base)); const t = tone(second), a = mesh.userData.tint, o = i * 4; a[o] = t[0]; a[o + 1] = t[1]; a[o + 2] = t[2]; a[o + 3] = glow; mesh.userData.dc = true; }

  // --- Moments the audio or the interface may want to hear about ---------------------
  const beat = { next: rr(6, 9), last: '', opening: 0, count: 0 };
  function emit(type, x, y, z, strength = 1) {
    const detail = { type, position: [round(x), round(y), round(z)], strength: round(strength), time: round(time) };
    log.push(detail); if (log.length > 60) log.shift();
    // Something the diver set off is a moment in itself: the director gives it room.
    if (strength >= .5) beat.next = Math.max(beat.next, 16 + random() * 12);
    events.dispatchEvent(new CustomEvent(type, { detail })); events.dispatchEvent(new CustomEvent('oceanlife', { detail }));
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('oceanlife', { detail }));
  }

  // --- Groups: the unit of simulation and of culling ---------------------------------
  const groups = [];
  function group(name, x, y, z, radius, options) {
    const g = { name, sphere: new THREE.Sphere(new THREE.Vector3(x, y, z), radius), interest: 14, draw: 40, far: .4, meshes: null, shared: null, update: null, conceal: null,
      near: false, shown: false, drawn: true, live: false, busy: false, toPlayer: 1e9, toEye: 1e9, ...options };
    groups.push(g); return g;
  }
  const inSight = (g, reach) => g.toEye < reach && (!view || view.frustum.intersectsSphere(g.sphere));

  // --- Particles: one draw call for bubbles, sand, ink, plankton, weed and eyeshine -------
  const VENTS = [[-14, 12], [40, -66], [-42, -62], [-9, -99]];
  const VENT_BUBBLES = economy ? 8 : 12, LEAVES = economy ? 28 : 50, PLANKTON = economy ? 210 : 420, SHRIMP = 12, CRABS = economy ? 18 : 30, RING = economy ? 64 : 96;
  const fixed = VENTS.length * VENT_BUBBLES + LEAVES + PLANKTON + SHRIMP * 2 + CRABS * 2;
  const motes = createParticles({ count: fixed + RING, fixed, haze: .03, shared, name: 'Living world · bubbles, plankton and sand' });
  under.add(motes.points);
  let reserved = 0;
  const reserve = n => { const start = reserved; reserved += n; return start; };
  function puff(x, y, z, n, spread, size) {
    for (let k = 0; k < n; k++) { const a = random() * TAU, v = rr(.3, 1) * spread; motes.emit(2, x + Math.cos(a) * .12, y + .06, z + Math.sin(a) * .12, Math.cos(a) * v, rr(.15, .6) * spread, Math.sin(a) * v, rr(.6, 1.2) * size, rr(1.6, 2.8), random()); }
  }
  const shrimpStart = reserve(SHRIMP * 2);
  let shrimps = 0;
  /** A pair of eyes in a crevice: nothing to see until the lamp finds them. */
  function nook(x, y, z) {
    if (shrimps >= SHRIMP) return;
    const a = random() * TAU, i = shrimpStart + shrimps++ * 2, tintSeed = random();
    motes.set(i, 4, x + Math.cos(a) * .013, y, z + Math.sin(a) * .013, 0, 0, 0, 1, .03, 1, tintSeed);
    motes.set(i + 1, 4, x - Math.cos(a) * .013, y, z - Math.sin(a) * .013, 0, 0, 0, 1, .03, 1, tintSeed);
  }

  // --- Scenery the residents need: dens, perches, a coral head. Baked into one mesh per depth zone. ---
  yield;
  const propZones = [new Mesher(), new Mesher(), new Mesher()], zoneOf = z => z > -30 ? 0 : z > -65 ? 1 : 2;
  const STONES = ['#7688a2', '#99a9ba', '#8092aa', '#6d7f97'];
  const stonePaint = k => { const base = tone(STONES[k % 4]), moss = tone('#5f7a6a'); return (x, y, z, t, a) => { const v = .8 + .34 * a, c = blend(moss, base, clamp(t * 1.6, 0, 1)); return [c[0] * v, c[1] * v, c[2] * v]; }; };
  const NUDI = [['#ff7a1a', '#ffffff'], ['#3b6cf0', '#ffd23a'], ['#b04ad9', '#ffe9a8'], ['#f4f0e2', '#ff4f6a'], ['#12b5a6', '#ff9a3a']];
  let nudibranchs = 0;
  function nudibranch(x, y, z, yaw) {
    const m = propZones[zoneOf(z)], body = tone(NUDI[nudibranchs % NUDI.length][0]), trim = tone(NUDI[nudibranchs % NUDI.length][1]);
    nudibranchs++;
    m.xf = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(1.5, 1.5, 1.5));
    m.blob(0, .012, 0, .016, .013, .042, 6, 4, (px, py, pz) => Math.abs(px) > .011 || Math.sin(pz * 190) > .55 ? trim : body);
    for (const side of [-1, 1]) m.sweep([[side * .007, .02, .028], [side * .011, .042, .035]], [.003, .0016], 3, trim, null, { capStart: false });
    for (let j = 0; j < 3; j++) m.sweep([[0, .02, -.026], [Math.sin(j * 2.1) * .012, .044, -.03 + Math.cos(j * 2.1) * .008]], [.003, .0012], 3, trim, null, { capStart: false });
    m.xf = null;
  }

  // =========================================================================
  // THE CAST
  // =========================================================================

  // --- Reef characters: every free-swimming fish shares one mesh and one draw call ---
  yield;
  const FISH = 24, fish = cast(geo.fish, FISH, 'Living world · reef characters');
  let fishSlots = 0;
  function fishNew(kind, base, second, glow = 0) { const i = fishSlots++; life(fish, i, random() * TAU, 0, .3, kind); dress(fish, i, base, second, glow); return i; }
  // length in metres; deep and wide stretch the shared body into a species.
  function fishPose(i, x, y, z, yaw, pitch, roll, length, deep, wide, amount, state) {
    pose(fish, i, x, y, z, yaw, pitch, roll, length * wide, length * deep, length);
    const a = fish.userData.life, o = i * 4; a[o + 1] = state; a[o + 2] = amount; fish.userData.dl = true;
  }

  // --- Garden eels: a colony that sinks into the sand ahead of the diver and rises again in waves ---
  function eelColony(id, name, tx, tz, count, radius, banded, note) {
    const [cx, cz] = settle(tx, tz, radius, 12, 3), cy = floor(cx, cz);
    const mesh = cast(geo.tube, count, `Living world · ${name}`, true), lifeArray = mesh.userData.life;
    const ex = new Float32Array(count), ey = new Float32Array(count), ez = new Float32Array(count), hid = new Float32Array(count), sent = new Float32Array(count);
    const nerve = new Float32Array(count), wait = new Float32Array(count), delay = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996 + rr(-.25, .25), r = Math.sqrt((i + .6) / count) * radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, length = rr(.5, .85), girth = length * rr(1.35, 1.7);
      ex[i] = x; ez[i] = z; ey[i] = floor(x, z); nerve[i] = rr(-.9, .9); delay[i] = rr(.4, 3.6);
      // Every eel faces the current, so the colony reads as a field of question marks.
      pose(mesh, i, x, ey[i] - .01, z, .45 + rr(-.35, .35), 0, 0, girth, length, girth);
      life(mesh, i, random() * TAU, 0, .06 / girth, banded ? 13 : 10);
      if (banded) dress(mesh, i, pick(['#f6efe0', '#f1e6d2']), pick(['#f08a2c', '#e87a22'])); else dress(mesh, i, pick(['#f2ead6', '#e9dfc6']), '#33291c');
    }
    mesh.computeBoundingSphere(); mesh.boundingSphere.radius += .6;
    const state = { wave: -1e9, waveX: 0, waveZ: 0, dirX: 1, dirZ: 0, down: false, out: count, count, cx, cy, cz };
    state.group = group(name, cx, cy + .3, cz, radius + 1, { interest: 15, draw: 46, far: .34, meshes: [mesh], update(dt) {
      // Asleep in their burrows at night; low in a storm.
      const asleep = Math.max(night > .6 ? .9 : night * .3, hunker * .55), wary = 4.3 + Math.min(speed, 3) * .7, sweep = time - state.wave;
      let changed = false, out = 0;
      for (let i = 0; i < count; i++) {
        const dx = me.x - ex[i], dz = me.z - ez[i], dy = (me.y - ey[i]) * .6, d = Math.sqrt(dx * dx + dz * dz + dy * dy), edge = wary + nerve[i];
        let target = Math.max(underwater > .5 ? 1 - smoothstep(d, edge, edge + 2.4) : 0, asleep);
        // A shadow crossing the colony: a front moving at 2.5 m/s that each eel ducks under.
        if (sweep < 7) target = Math.max(target, 1 - smoothstep(Math.abs((ex[i] - state.waveX) * state.dirX + (ez[i] - state.waveZ) * state.dirZ - sweep * 2.5), 0, 1.3));
        let h = hid[i];
        if (target > h + .001) { wait[i] = 0; h = Math.min(target, h + dt * (2.6 + nerve[i])); }
        else if (target < h - .001) { wait[i] += dt; if (wait[i] > delay[i]) h = Math.max(target, h - dt * .32); }
        hid[i] = h; if (h < .5) out++;
        if (Math.abs(h - sent[i]) > .004 || (h !== sent[i] && h === target)) { lifeArray[i * 4 + 1] = h; sent[i] = h; changed = true; }
      }
      if (changed) mesh.userData.dl = true;
      state.out = out;
      // Half the colony gone to ground because of the diver is the moment; it re-arms once most are back up.
      if (!state.down && out < count * .5 && asleep < .5 && sweep > 7) { state.down = true; emit('eel-retreat', cx, cy, cz, 1 - out / count); }
      else if (state.down && out > count * .8) state.down = false;
    } });
    site(id, name, cx, cy, cz, radius + 1, 'colony', note);
    return state;
  }
  yield;
  const eelGardens = [
    eelColony('eel-garden', 'Garden eel colony', -25, -1, economy ? 24 : 44, 3.2, true, 'Approach slowly: the eels sink into the sand ahead of you and rise again once you back away.'),
    eelColony('deep-eel-garden', 'Deep garden eels', -3, -95, economy ? 16 : 30, 2.6, false, 'A second colony on the deep sand beside the lantern garden.')
  ];

  // --- Anemones with their clownfish --------------------------------------------------
  function anemone(id, name, tx, tz, residents, tones, note) {
    const [cx, cz] = settle(tx, tz, 1.2, 12, 3), cy = floor(cx, cz), count = economy ? 24 : 40, m = propZones[zoneOf(cz)];
    m.rock(cx + .28, cy + .12, cz - .2, .55, .42, .5, cx * 1.3, stonePaint(sites.length));
    m.blob(cx, cy + .3, cz, .3, .17, .3, 8, 4, tone(tones[2]));
    nook(cx + .5, cy + .2, cz + .1);
    const mesh = cast(geo.tendril, count, `Living world · ${name}`, true);
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996, r = Math.sqrt((i + .5) / count), length = rr(.2, .3) * (1.15 - .3 * r);
      Q.setFromAxisAngle(AXIS.set(Math.sin(a), 0, -Math.cos(a)), r * .95);
      M.compose(P.set(cx + Math.cos(a) * r * .24, cy + .4 + (1 - r * r) * .05, cz + Math.sin(a) * r * .24), Q, S.set(.85, length, .85)); mesh.setMatrixAt(i, M);
      life(mesh, i, random() * TAU, 0, .045, 11); dress(mesh, i, tones[0], tones[1], .55);
    }
    mesh.userData.dm = true; mesh.computeBoundingSphere(); mesh.boundingSphere.radius += .2;
    const top = cy + .62, clowns = [];
    for (let k = 0; k < residents; k++) clowns.push({ slot: fishNew(1, k ? '#ff8a35' : '#f96f22', '#f6f2e6'), size: .125 - k * .02, ph: random() * TAU, w: rr(.7, 1.1), yaw: random() * TAU, mode: 0, t: 0, timer: rr(.6, 2) + k * 1.5, vx: 0, vy: 0, vz: 0 });
    let tuck = 0;
    group(name, cx, top, cz, 1.6, { interest: 9, draw: 30, far: .28, meshes: [mesh], shared: fish, update(dt) {
      const d = Math.hypot(me.x - cx, me.y - top, me.z - cz), reach = underwater > .5 && d < 4.6 && d > 1.5;
      tuck += ((d < 1.5 || night > .6 || hunker > .5 ? 1 : 0) - tuck) * ease(dt, 4);
      for (let k = 0; k < clowns.length; k++) {
        const c = clowns[k], a = time * c.w + c.ph, spread = (1 - tuck * .8) * (1 + k * .3);
        let x = cx + Math.cos(a) * .24 * spread, y = top + .1 + k * .07 + Math.sin(a * 1.7) * .06 - tuck * .16, z = cz + Math.sin(a * 1.3 + k) * .24 * spread;
        let face = Math.atan2(-Math.sin(a), Math.cos(a * 1.3 + k) * 1.3), amount = 0;
        // The resident pair defend the anemone: out at the diver, a pause, and back.
        if (k < 2) {
          if (c.mode === 0) { c.timer -= dt; if (c.timer <= 0 && reach && tuck < .3) { c.mode = 1; c.t = 0; const far = Math.min(1.4, d - 1.25) / d; c.vx = (me.x - cx) * far; c.vy = (me.y - top) * far * .6; c.vz = (me.z - cz) * far; } }
          else if (c.mode === 1) { c.t += dt / .26; if (c.t >= 1) { c.t = 1; c.mode = 2; c.timer = rr(.4, .85); } }
          else if (c.mode === 2) { c.timer -= dt; if (c.timer <= 0 || !reach) c.mode = 3; }
          else { c.t -= dt / .4; if (c.t <= 0) { c.t = 0; c.mode = 0; c.timer = rr(1.1, 2.8) + k * 1.2; } }
          amount = c.t * c.t * (3 - 2 * c.t);
          if (amount > .02) { x += c.vx * amount; y += c.vy * amount; z += c.vz * amount; face = Math.atan2(c.vx, c.vz) + (c.mode === 3 ? Math.PI * (1 - amount) : 0); }
        }
        c.yaw += turnTo(c.yaw, face) * ease(dt, 9);
        fishPose(c.slot, x, y, z, c.yaw, 0, 0, c.size, 1.15, 1.3, .3 + amount * .7, 0);
      }
    }, conceal() { for (let k = 0; k < clowns.length; k++) conceal(fish, clowns[k].slot); } });
    site(id, name, cx, cy, cz, 1.5, 'resident', note);
  }
  yield;
  anemone('anemone-anchor', 'Clownfish anemone', -25, -21, 3, ['#c9a7e8', '#ff8fb8', '#8f6ab8'], 'The larger clownfish darts out at anyone who comes within a few metres.');
  anemone('anemone-brain-dome', 'Brain dome anemone', -37, 6, 3, ['#9fd6a0', '#fff0a0', '#5f9a72'], 'Beside the brain coral dome.');
  anemone('anemone-cathedral', 'Cathedral anemone', 43, -35, 2, ['#f0b6a0', '#ffe2c2', '#c97a6a'], 'At the foot of the pillar coral cathedral, in sight of the tour.');

  // --- Cleaning station: a coral trout holds still, mouth open, while wrasse work over it ---
  {
    const [cx, cz] = settle(31, -6, .6, 12, 3), cy = floor(cx, cz), m = propZones[zoneOf(cz)];
    const headA = tone('#c7a06a'), headB = tone('#e2c58a');
    m.blob(cx, cy + .12, cz, .78, .66, .72, 12, 7, (x, y, z, t, a) => blend(headA, headB, .5 + .5 * Math.sin(a * 7) * Math.sin(t * 9)), null, (x, y, z) => { const b = 1 + .09 * Math.sin(x * 9) * Math.sin(z * 8 + y * 7); return [x * b, y * b, z * b]; });
    m.rock(cx + .75, cy + .1, cz + .45, .5, .36, .45, 3.3, stonePaint(1));
    nook(cx + .62, cy + .22, cz + .12); nook(cx - .55, cy + .2, cz - .5);
    nudibranch(cx + .2, cy + .76, cz + .12, 1.1); nudibranch(cx + .78, cy + .42, cz + .5, 2.6);
    // Side on to the tour's coral tower viewpoint.
    const home = Math.atan2(28.5 - cx, -11 - cz) + 1.25;
    const trout = fishNew(4, '#b5553c', '#4fb3d9'), wrasse = [];
    for (let k = 0; k < 4; k++) wrasse.push({ slot: fishNew(3, '#4fb7ee', '#0c1016'), x: cx, y: cy + .9, z: cz, yaw: 0, spot: k, dwell: rr(.2, 1) });
    const G = { x: cx, y: cy + 1.45, z: cz, yaw: home, pitch: .38, gape: 0, wary: false, calm: 0 };
    const spots = [[0, 0, .5], [.1, .04, .28], [-.1, .04, .28], [0, .19, .02], [.09, -.06, -.12], [-.09, -.02, -.3], [0, -.16, .1]];
    group('Cleaning station', cx, cy + 1.2, cz, 2.6, { interest: 12, draw: 40, far: .4, shared: fish, update(dt) {
      const d = Math.hypot(me.x - G.x, me.y - G.y, me.z - G.z), asleep = night > .65;
      if (d < 3.3 && underwater > .5) { if (!G.wary && !asleep) emit('cleaning-interrupted', G.x, G.y, G.z, .4); G.wary = true; G.calm = 0; }
      else if (d > 5.5) { G.calm += dt; if (G.calm > 2.5) G.wary = false; }
      let tx = cx, ty = cy + 1.45, tz = cz, gape = .8 + .2 * Math.sin(time * .9), pitch = .38, yaw = home + Math.sin(time * .3) * .12;
      if (asleep) { tx = cx + 1.05; ty = cy + .42; tz = cz - .55; gape = 0; pitch = 0; }
      else if (G.wary) {
        // It backs off four metres and watches side on until the diver leaves.
        const ax = cx - me.x, az = cz - me.z, al = Math.hypot(ax, az) || 1;
        tx = cx + ax / al * 4.2; tz = cz + az / al * 4.2; ty = Math.max(cy + 1.7, coverAt(tx, tz) + 1.1); gape = 0; pitch = 0; yaw = Math.atan2(me.x - G.x, me.z - G.z) + 1.1;
      }
      const k = ease(dt, G.wary ? 1.6 : .9), slide = Math.hypot(tx - G.x, tz - G.z);
      G.x += (tx - G.x) * k; G.y += (ty - G.y) * k; G.z += (tz - G.z) * k;
      G.yaw += turnTo(G.yaw, yaw) * ease(dt, 2.2); G.pitch += (pitch - G.pitch) * k; G.gape += (gape - G.gape) * ease(dt, 3);
      fishPose(trout, G.x, G.y + Math.sin(time * .8) * .04, G.z, G.yaw, G.pitch, 0, .95, 1, 1.25, .1 + Math.min(slide * .2, .5), G.gape);
      const cos = Math.cos(G.yaw), sin = Math.sin(G.yaw);
      for (let j = 0; j < wrasse.length; j++) {
        const w = wrasse[j];
        if (asleep) { conceal(fish, w.slot); continue; }
        if ((w.dwell -= dt) <= 0) { w.spot = (w.spot + 1 + Math.floor(random() * 3)) % spots.length; w.dwell = rr(.35, 1.3); }
        let sx, sy, sz;
        if (G.wary) { const a = time * .6 + j * 1.6; sx = cx + Math.cos(a) * .55; sy = cy + .92 + Math.sin(a * 2) * .08; sz = cz + Math.sin(a) * .55; }
        else { const s = spots[w.spot], lx = s[0] * 1.3, lz = s[2] * .95; sx = G.x + lx * cos + lz * sin; sy = G.y + s[1] + lz * Math.sin(G.pitch); sz = G.z - lx * sin + lz * cos; }
        const q = ease(dt, 7), ox = w.x, oz = w.z;
        w.x += (sx - w.x) * q; w.y += (sy - w.y) * q; w.z += (sz - w.z) * q;
        const vx = w.x - ox, vz = w.z - oz, v = dt > 0 ? Math.hypot(vx, vz) / dt : 0;
        if (v > .05) w.yaw += turnTo(w.yaw, Math.atan2(vx, vz)) * ease(dt, 12);
        fishPose(w.slot, w.x, w.y, w.z, w.yaw, 0, 0, .12, .8, .9, .3 + Math.min(v * .5, .7), 0);
      }
    }, conceal() { conceal(fish, trout); for (let j = 0; j < wrasse.length; j++) conceal(fish, wrasse[j].slot); } });
    site('cleaning-station', 'Cleaning station', cx, cy, cz, 3, 'behaviour', 'A coral trout hovers mouth open over a coral head while cleaner wrasse dart around it. Come closer than three metres and it backs away.');
  }

  // --- Pufferfish: inflates when crowded -----------------------------------------------
  function puffer(id, tx, tz, up, note) {
    const [hx, hz] = settle(tx, tz, 1.5, 12, 2), hy = coverAt(hx, hz) + up, slot = fishNew(4, '#e0cf8c', '#4d3b28');
    const s = { a: random() * TAU, puff: 0, target: 0, calm: 0, ox: 0, oz: 0, x: hx, y: hy, z: hz, yaw: 0, spin: 0, last: 1e9 };
    group('Pufferfish', hx, hy, hz, 4, { interest: 11, draw: 34, far: .3, shared: fish, update(dt, g) {
      const d = Math.hypot(me.x - s.x, me.y - s.y, me.z - s.z), closing = s.last > 1e8 || dt <= 0 ? 0 : (s.last - d) / dt; s.last = d;
      if (s.target === 0 && underwater > .5 && (d < 2.7 || (d < 4.4 && closing > 1.3))) { s.target = 1; s.calm = 0; emit('puffer-inflate', s.x, s.y, s.z, 1); }
      else if (s.target === 1) { if (d > 5) { s.calm += dt; if (s.calm > 3.5) s.target = 0; } else s.calm = 0; }
      s.puff += clamp(s.target - s.puff, -dt * .55, dt * 4.5);
      s.a += dt * .26 * (1 - s.puff);
      const R = 2.2 * (1 - hunker * .5);
      let x = hx + Math.cos(s.a) * R, z = hz + Math.sin(s.a) * R * .7, y = hy + Math.sin(s.a * 2.3) * .25;
      // Inflated, it cannot swim: it bobs away from the diver and drifts home once it has let the water out.
      if (s.puff > .3 && d < 4.5) { const ax = s.x - me.x, az = s.z - me.z, al = Math.hypot(ax, az) || 1; s.ox = clamp(s.ox + ax / al * dt * .5, -3, 3); s.oz = clamp(s.oz + az / al * dt * .5, -3, 3); }
      else if (s.puff < .05) { const fade = Math.exp(-dt * .4); s.ox *= fade; s.oz *= fade; }
      x += s.ox; z += s.oz; y = Math.max(y, coverAt(x, z) + .7) + Math.sin(time * 2.1) * .05 * s.puff;
      s.spin += dt * s.puff * .5;
      s.yaw += turnTo(s.yaw, Math.atan2(-Math.sin(s.a), Math.cos(s.a) * .7) + s.spin) * ease(dt, 3);
      s.x = x; s.y = y; s.z = z; g.sphere.center.set(x, y, z);
      fishPose(slot, x, y, z, s.yaw, -.1 * s.puff, Math.sin(time * 1.7) * .25 * s.puff, .28, 1.05, 1.25, .25 * (1 - s.puff) + .05, s.puff);
    }, conceal() { conceal(fish, slot); s.last = 1e9; } });
    site(id, 'Pufferfish', hx, hy, hz, 4, 'behaviour', note);
    return s;
  }
  yield;
  const puffers = [puffer('puffer-shallows', 15, 3.5, 1.3, 'Patrols a small loop over the sand. Crowd it and it inflates.'), puffer('puffer-lanterns', 14, -95, 1.5, 'A second puffer beside the lantern garden.')];

  // --- Batfish: curious for a while, then not ----------------------------------------------
  yield;
  const batfish = { mode: 'home', t: 0, cool: rr(6, 16), span: 0, called: false, group: null, list: [] };
  {
    const [hx, hz] = settle(40, -27, 1, 10, 0), hy = coverAt(hx, hz) + 5.2, B = batfish;
    for (let k = 0; k < 2; k++) B.list.push({ slot: fishNew(2, '#cfd3c6', '#2a2c2e'), x: hx + k * 1.5, y: hy + k * .6, z: hz - k, vx: 0, vy: 0, vz: 0, yaw: k * 2, side: k ? 1 : -1, ph: k * 2.1 });
    B.group = group('Batfish pair', hx, hy, hz, 4, { interest: 17, draw: 55, far: .5, shared: fish, update(dt, g) {
      const lead = B.list[0], d = Math.hypot(me.x - lead.x, me.y - lead.y, me.z - lead.z), day = night < .45 && hunker < .5 && underwater > .5;
      B.cool -= dt; B.t += dt;
      if (B.mode === 'home') {
        if (B.called && (!day || d >= 50)) B.called = false;
        if (day && B.cool <= 0 && (d < 15 || B.called)) { B.mode = 'follow'; B.t = 0; B.span = rr(26, 42); emit('batfish-curious', lead.x, lead.y, lead.z, .6); }
      }
      // They lose interest after half a minute, or when the diver outruns them.
      else if (B.t > B.span || !day || (d > 17 && (!B.called || B.t > 14))) { B.mode = 'home'; B.called = false; B.cool = rr(60, 100); }
      const follow = B.mode === 'follow';
      for (let k = 0; k < 2; k++) {
        const b = B.list[k];
        let tx, ty, tz, max;
        // A polite slot: behind the diver's shoulder, never in front of the mask.
        if (follow) { tx = me.x - heading.x * 3.1 + heading.z * b.side * 2.5 + Math.sin(time * .5 + b.ph) * .5; tz = me.z - heading.z * 3.1 - heading.x * b.side * 2.5 + Math.cos(time * .4 + b.ph) * .5; ty = me.y + .7 + k * .5 + Math.sin(time * .6 + b.ph) * .2; max = 2.5; }
        else { const a = time * .12 + b.ph; tx = hx + Math.cos(a) * 3; tz = hz + Math.sin(a) * 3; ty = hy + Math.sin(a * 1.7) * .6; max = 1.3; }
        const dx = tx - b.x, dy = ty - b.y, dz = tz - b.z, dl = Math.hypot(dx, dy, dz) || 1, want = Math.min(max, dl * .9);
        let wx = dx / dl * want, wy = dy / dl * want, wz = dz / dl * want;
        const px = b.x - me.x, py = b.y - me.y, pz = b.z - me.z, pd = Math.hypot(px, py, pz);
        if (pd < 2.7) { const push = (2.7 - pd) * 2.2 / Math.max(pd, .1); wx += px * push; wy += py * push; wz += pz * push; }
        const k2 = ease(dt, 1.6);
        b.vx += (wx - b.vx) * k2; b.vy += (wy - b.vy) * k2; b.vz += (wz - b.vz) * k2;
        let nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, nz = b.z + b.vz * dt;
        // Over the coral, or held back from a wall of it.
        const top = coverAt(nx, nz) + 1.1;
        if (ny < top) { if (top - ny > 3) { nx = b.x; nz = b.z; b.vx *= .5; b.vz *= .5; } ny += (top - ny) * Math.min(1, dt * 3); }
        b.x = clamp(nx, -60, 60); b.y = Math.min(ny, -1.5); b.z = clamp(nz, -103, 33);
        const sp = Math.hypot(b.vx, b.vz);
        b.yaw += turnTo(b.yaw, sp > .08 ? Math.atan2(b.vx, b.vz) : follow ? Math.atan2(me.x - b.x, me.z - b.z) : b.yaw) * ease(dt, sp > .08 ? 4 : 1.5);
        fishPose(b.slot, b.x, b.y, b.z, b.yaw, clamp(b.vy * .4, -.4, .4), 0, .46, 1.9, .8, .15 + sp * .3, 0);
      }
      g.sphere.center.set(lead.x, lead.y, lead.z); g.busy = follow || B.called;
    }, conceal() { conceal(fish, B.list[0].slot); conceal(fish, B.list[1].slot); } });
    site('batfish', 'Batfish pair', hx, hy, hz, 6, 'behaviour', 'Two batfish that live among the coral pillars. By day they follow a passing diver at a polite distance, then lose interest.');
  }

  // --- Goatfish rooting in the sand ---------------------------------------------------------
  {
    const [gx, gz] = settle(-18, -36, 1.5, 12, 3), goats = [], F = { ox: 0, oz: 0 };
    for (let k = 0; k < 2; k++) goats.push({ slot: fishNew(3, '#f1e8d2', '#efc136'), ph: k * 2.4, yaw: 0, next: rr(.5, 1.5) });
    group('Goatfish', gx, floor(gx, gz) + .3, gz, 3, { interest: 10, draw: 30, far: .28, shared: fish, update(dt, g) {
      const px = gx + F.ox, pz = gz + F.oz, d = Math.hypot(me.x - px, me.y - floor(px, pz), me.z - pz), feeding = d > 3.2 && night < .6;
      if (d < 3 && underwater > .5) { const ax = px - me.x, az = pz - me.z, al = Math.hypot(ax, az) || 1; F.ox = clamp(F.ox + ax / al * dt * 1.2, -4, 4); F.oz = clamp(F.oz + az / al * dt * 1.2, -4, 4); }
      else if (d > 7) { const fade = Math.exp(-dt * .25); F.ox *= fade; F.oz *= fade; }
      for (let k = 0; k < 2; k++) {
        const f = goats[k], a = time * .35 + f.ph, x = px + Math.cos(a) * .8 + k * .5, z = pz + Math.sin(a * 1.3) * .7, y = floor(x, z) + .17;
        f.yaw += turnTo(f.yaw, Math.atan2(-Math.sin(a), Math.cos(a * 1.3) * 1.3)) * ease(dt, 4);
        // Barbels in the sand: a small cloud every second or two.
        if (feeding && dt > 0 && g.shown && g.toEye < 24 && (f.next -= dt) <= 0) { f.next = rr(1, 2.1); puff(x + Math.sin(f.yaw) * .14, y - .12, z + Math.cos(f.yaw) * .14, 2, .5, .35); }
        fishPose(f.slot, x, y + (feeding ? 0 : .25), z, f.yaw, feeding ? -.55 : 0, 0, .27, .85, .9, feeding ? .5 : .3, 0);
      }
    }, conceal() { conceal(fish, goats[0].slot); conceal(fish, goats[1].slot); } });
    site('goatfish', 'Feeding goatfish', gx, floor(gx, gz), gz, 3, 'behaviour', 'A pair of goatfish rooting through the sand, raising small clouds.');
  }

  // --- Flounder: only there when it moves --------------------------------------------------------
  yield;
  function flounder(id, tx, tz) {
    const [x0, z0] = settle(tx, tz, 1.2, 12, 1.5), slot = fishNew(5, '#a3916a', '#77684a');
    const s = { x: x0, z: z0, yaw: random() * TAU, mode: 0, t: 0, fx: 0, fz: 0, tx: 0, tz: 0, cool: 0 };
    group('Flounder', x0, floor(x0, z0), z0, 2, { interest: 8, draw: 26, far: .24, shared: fish, update(dt, g) {
      const y = floor(s.x, s.z) + .035; s.cool -= dt;
      if (s.mode === 0) {
        if (s.cool <= 0 && underwater > .5 && me.y - y < 4.2 && Math.hypot(me.x - s.x, me.z - s.z) < 2.4) {
          let a = Math.atan2(s.x - me.x, s.z - me.z) + rr(-.7, .7); const far = rr(2.6, 3.6);
          for (let tries = 0; tries < 6 && (solid(s.x + Math.sin(a) * far, s.z + Math.cos(a) * far) || !open(s.x + Math.sin(a) * far, s.z + Math.cos(a) * far, 9, 0)); tries++) a += 1.05;
          s.fx = s.x; s.fz = s.z; s.tx = s.x + Math.sin(a) * far; s.tz = s.z + Math.cos(a) * far; s.yaw = a; s.mode = 1; s.t = 0;
          puff(s.x, y, s.z, 4, .7, .4); emit('flounder-scoot', s.x, y, s.z, .4);
        }
      } else {
        s.t += dt / 1.3; const t = Math.min(s.t, 1), e = 1 - Math.pow(1 - t, 2.4);
        s.x = lerp(s.fx, s.tx, e); s.z = lerp(s.fz, s.tz, e);
        if (s.t >= 1) { s.mode = 0; s.cool = 1.5; puff(s.x, floor(s.x, s.z), s.z, 2, .4, .3); }
      }
      const lift = s.mode ? Math.sin(Math.min(s.t, 1) * Math.PI) * .12 : 0, ground = floor(s.x, s.z);
      // Lying on its side, the colour of the sand.
      fishPose(slot, s.x, ground + .035 + lift, s.z, s.yaw, 0, Math.PI / 2, .3, 1.5, .55, s.mode ? 1 : 0, 0);
      g.sphere.center.set(s.x, ground, s.z);
    }, conceal() { conceal(fish, slot); } });
    site(id, 'Flounder', x0, floor(x0, z0), z0, 3, 'hidden', 'Flat on the sand and the colour of it: you will only see it when it moves.');
    return s;
  }
  const flounders = [flounder('flounder-wreck-side', 11, -23), flounder('flounder-west', -31, -12)];

  // --- Octopus: matches its rock, flushes when noticed, jets away behind ink if rushed ----------------
  yield;
  const octopus = { perch: 0, next: 0, x: 0, y: 0, z: 0, yaw: 1, pitch: 0, mode: 'rest', t: 0, flush: 0, jet: 0, calm: 0, last: 1e9, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0, tx: 0, ty: 0, tz: 0, dur: 1, quiet: false, go: false, rush: false, stroll: rr(30, 60), group: null, perches: [] };
  {
    const O = octopus, perches = O.perches;
    [[-11.5, -50], [-9, -60.5], [-12.5, -65.5], [-4, -57.5]].forEach(([px, pz], k) => {
      const [x, z] = settle(px, pz, 1, 12, 3), y = floor(x, z), m = propZones[zoneOf(z)], high = rr(.5, .7);
      m.rock(x, y + .28, z, rr(.6, .8), high, rr(.55, .75), 20 + k, stonePaint(k));
      m.rock(x + .62, y + .12, z - .3, .36, .3, .4, 30 + k, stonePaint(k + 1), 0);
      nook(x - .45, y + .18, z + .42);
      if (k % 2 === 0) nudibranch(x + .6, y + .4, z - .28, k * 1.7);
      perches.push({ x, y: y + .28 + high * .86, z, tone: STONES[k % 4] });
    });
    const mesh = cast(geo.octopus, 1, 'Living world · octopus');
    life(mesh, 0, 1.3, 0, 0, 40); dress(mesh, 0, perches[0].tone, '#4a2f24', .35);
    O.x = perches[0].x; O.y = perches[0].y; O.z = perches[0].z;
    const camo = new THREE.Color(perches[0].tone), alarm = new THREE.Color('#a8321f'), pale = new THREE.Color('#e9d8c6'), skin = new THREE.Color().copy(camo), worn = new THREE.Color().copy(camo);
    function leave(fast) {
      // To the perch farthest from the diver.
      let best = 0, score = -1e9;
      for (let k = 0; k < perches.length; k++) if (k !== O.perch) { const p = perches[k], s = Math.hypot(p.x - me.x, p.z - me.z) - Math.hypot(p.x - O.x, p.z - O.z) * .25 + random() * 2; if (s > score) { score = s; best = k; } }
      const p = perches[best], span = Math.hypot(p.x - O.x, p.z - O.z) || 1;
      let lift = Math.max(O.y, p.y) + (fast ? 1.5 : .7);
      for (let s = 1; s < 6; s++) lift = Math.max(lift, coverAt(lerp(O.x, p.x, s / 6), lerp(O.z, p.z, s / 6)) + .7);
      const side = (random() < .5 ? -1 : 1) * (fast ? 1.5 : 0);
      O.next = best; O.fx = O.x; O.fy = O.y; O.fz = O.z; O.tx = p.x; O.ty = p.y; O.tz = p.z;
      O.mx = (O.x + p.x) / 2 + (p.z - O.z) / span * side; O.my = 2 * lift - (O.y + p.y) / 2; O.mz = (O.z + p.z) / 2 - (p.x - O.x) / span * side;
      O.dur = fast ? Math.max(1.6, span / 3.4) : span / .7; O.quiet = !fast; O.mode = 'jet'; O.t = 0;
      if (fast) {
        const ix = (O.x - p.x) / span, iz = (O.z - p.z) / span;
        for (let k = 0; k < 9; k++) motes.emit(3, O.x + rr(-.1, .1), O.y + .15, O.z + rr(-.1, .1), rr(-.5, .5) + ix * .6, rr(.1, .5), rr(-.5, .5) + iz * .6, rr(.5, .95), rr(4.5, 7), random());
        emit('octopus-jet', O.x, O.y, O.z, 1);
      }
    }
    O.group = group('Octopus', O.x, O.y, O.z, 1.2, { interest: 13, draw: 42, far: .36, meshes: [mesh], update(dt, g) {
      const d = Math.hypot(me.x - O.x, me.y - O.y, me.z - O.z), closing = O.last > 1e8 || dt <= 0 ? 0 : (O.last - d) / dt; O.last = d;
      let flushTo = 0;
      if (O.mode === 'rest') {
        if (O.rush) { O.rush = false; leave(true); }
        else if (d < 5.6 && underwater > .5) { O.mode = 'alert'; O.calm = 0; emit('octopus-notice', O.x, O.y, O.z, .5); }
        // It hunts at night: on its own it moves between perches, arms rippling.
        else if (O.go || (O.stroll -= dt * (night > .5 ? 2 : .35)) <= 0) { O.go = false; O.stroll = rr(35, 70); leave(false); }
      } else if (O.mode === 'alert') {
        // Keep still for a few seconds and it settles; rush it and it is gone.
        flushTo = O.calm > 7 ? .35 : 1;
        if (speed < .6 && d > 2.5) O.calm += dt; else O.calm = Math.max(0, O.calm - dt * 2);
        if (O.rush || d < 2.2 || (d < 4.6 && closing > 1.15)) { O.rush = false; leave(true); }
        else if (d > 7.5) O.mode = 'rest';
      } else if (O.mode === 'jet') {
        O.t += dt / O.dur;
        const t = Math.min(O.t, 1), e = O.quiet ? t * t * (3 - 2 * t) : 1 - Math.pow(1 - t, 2.2), a = 1 - e, ox = O.x, oy = O.y, oz = O.z;
        O.x = a * a * O.fx + 2 * a * e * O.mx + e * e * O.tx; O.y = a * a * O.fy + 2 * a * e * O.my + e * e * O.ty; O.z = a * a * O.fz + 2 * a * e * O.mz + e * e * O.tz;
        const vx = O.x - ox, vy = O.y - oy, vz = O.z - oz, hv = Math.hypot(vx, vz);
        if (hv > 1e-4) { O.yaw = Math.atan2(vx, vz); O.pitch = Math.atan2(vy, hv); }
        O.jet = (O.quiet ? .3 : 1) * smoothstep(t, 0, .12) * (1 - smoothstep(t, .8, 1)); flushTo = O.quiet ? .2 : 1;
        if (t >= 1) { O.mode = 'land'; O.t = 0; O.perch = O.next; camo.set(perches[O.perch].tone); O.pitch = 0; O.last = 1e9; }
      } else {
        O.t += dt; O.jet = 0; flushTo = O.quiet ? 0 : Math.max(0, 1 - O.t / 3);
        if (O.t > (O.quiet ? .5 : 3.2)) { O.mode = d < 5.6 ? 'alert' : 'rest'; O.calm = 0; }
      }
      O.flush += clamp(flushTo - O.flush, -dt * .6, dt * 3.5);
      // Skin: the rock it sits on, flushed toward alarm red; it blanches for a moment where it lands.
      skin.copy(camo).lerp(alarm, O.flush); if (O.mode === 'land' && !O.quiet) skin.lerp(pale, Math.max(0, .6 - O.t * .4));
      if (Math.abs(skin.r - worn.r) + Math.abs(skin.g - worn.g) + Math.abs(skin.b - worn.b) > .004) { worn.copy(skin); mesh.setColorAt(0, skin); mesh.userData.dc = true; }
      pose(mesh, 0, O.x, O.y, O.z, O.yaw, O.pitch * O.jet, 0, 1.15, 1.15, 1.15);
      drive(mesh, 0, O.jet, O.flush);
      g.sphere.center.set(O.x, O.y, O.z); g.busy = O.mode === 'jet';
    } });
    site('octopus', 'Octopus territory', perches[0].x, perches[0].y, perches[0].z, 9, 'behaviour', 'An octopus on one of four rocks beyond the giant clam, the colour of the stone until it notices you. Approach slowly and it will let you watch; rush it and it jets to another perch behind a puff of ink.');
  }

  // --- Morays: each in a den of leaning stones, watching whoever passes --------------------------------
  yield;
  const morays = cast(geo.moray, 2, 'Living world · moray eels');
  function den(x, z, yaw, k) {
    const m = propZones[zoneOf(z)], y = floor(x, z), fx = Math.sin(yaw), fz = Math.cos(yaw), sx = fz, sz = -fx;
    m.rock(x - sx * .46 - fx * .28, y + .3, z - sz * .46 - fz * .28, .5, .64, .62, 50 + k, stonePaint(k));
    m.rock(x + sx * .48 - fx * .32, y + .26, z + sz * .48 - fz * .32, .48, .54, .64, 60 + k, stonePaint(k + 2));
    m.rock(x - fx * .42, y + .66, z - fz * .42, .78, .34, .58, 70 + k, stonePaint(k + 1));
    m.rock(x - fx * .85, y + .25, z - fz * .85, .72, .58, .62, 80 + k, stonePaint(k + 3));
    m.blob(x - fx * .34, y + .3, z - fz * .34, .2, .2, .2, 6, 4, [.012, .014, .018]);
    nook(x + sx * .34 + fx * .1, y + .12, z + sz * .34 + fz * .1); nook(x - sx * .2 - fx * .2, y + .52, z - sz * .2 - fz * .2);
    nudibranch(x - fx * .3 + sx * .2, y + 1.0, z - fz * .3 + sz * .2, yaw + 1);
    return [x + fx * .02, y + .3, z + fz * .02];
  }
  function moray(i, id, name, tx, tz, faceX, faceZ, hue, note) {
    const [x, z] = settle(tx, tz, 1.6, 12, 3.5), yaw = Math.atan2(faceX - x, faceZ - z), [mx, my, mz] = den(x, z, yaw, i);
    pose(morays, i, mx, my, mz, yaw, 0, 0, 1.55, 1.55, 1.55);
    life(morays, i, .1, .14, 0, 50); dress(morays, i, hue, '#d9c45c');
    const s = { yaw: 0, pitch: .1, st: .14, sentYaw: 9, sentPitch: 9, sentSt: 9, crowded: false, hold: 0 };
    group(name, mx, my, mz, 1.6, { interest: 13, draw: 40, far: .34, shared: morays, update(dt) {
      const dx = me.x - mx, dy = me.y - my, dz = me.z - mz, d = Math.hypot(dx, dy, dz);
      let wantYaw = Math.sin(time * .4 + i * 2) * .35, wantPitch = .1 + Math.sin(time * .3 + i) * .08;
      // The head follows the diver as far as the neck will bend.
      if (d < 10 && underwater > .5) { wantYaw = clamp(turnTo(yaw, Math.atan2(dx, dz)), -1.05, 1.05); wantPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -.15, .8); }
      const k = ease(dt, 2.6);
      s.yaw += (wantYaw - s.yaw) * k; s.pitch += (wantPitch - s.pitch) * k;
      if (d < 2.3 && underwater > .5) { if (!s.crowded) emit('moray-withdraw', mx, my, mz, .6); s.crowded = true; s.hold = 3; }
      else if (d > 4.2 && s.crowded) { s.hold -= dt; if (s.hold <= 0) s.crowded = false; }
      // Further out at night, when it hunts; back in the den when crowded or when a storm stirs the shallows.
      s.st += clamp(Math.max(s.crowded ? 1 : night > .5 ? 0 : .14, hunker * .7) - s.st, -dt * .45, dt * 3.2);
      if (Math.abs(s.yaw - s.sentYaw) + Math.abs(s.pitch - s.sentPitch) + Math.abs(s.st - s.sentSt) > .004) { s.sentYaw = s.yaw; s.sentPitch = s.pitch; s.sentSt = s.st; life(morays, i, s.pitch, s.st, s.yaw, 50); }
    } });
    site(id, name, mx, my, mz, 3, 'resident', note);
    return s;
  }
  const morayStates = [
    moray(0, 'moray-den-wreck', 'Moray den', 34, -25, 31, -31, '#ffffff', 'A moray in a den of leaning stones beside the way down to the wreck. Its head follows you; crowd it and it withdraws.'),
    moray(1, 'moray-den-deep', 'Deep moray den', -1, -71, 4, -80, '#e8d2b4', 'A second moray on the deep ledge, facing the way to the treasure.')
  ];

  // --- A blue-spotted ray under the sand ----------------------------------------------------------
  yield;
  const ray = { spot: 0, next: 1, x: 0, y: 0, z: 0, yaw: rr(0, TAU), pitch: 0, roll: 0, mode: 'buried', t: 0, bury: 1, flap: 0, cool: 0, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0, tx: 0, ty: 0, tz: 0, dur: 1, go: false, startle: false, lieP: 0, lieR: 0, group: null, spots: [] };
  {
    const R = ray, spots = R.spots;
    for (const [x, z] of [[-3, -31], [-24, -40], [4, -53], [-29, -57]]) spots.push(settle(x, z, 1.6, 12, 0));
    const mesh = cast(geo.ray, 1, 'Living world · stingray');
    life(mesh, 0, 0, 1, 0, 20); dress(mesh, 0, '#ffffff', '#2f6fe0');
    R.x = spots[0][0]; R.z = spots[0][1]; R.y = floor(R.x, R.z) + .035;
    // The pitch and roll that lay it flat on the slope it has settled on.
    const lie = () => { const gx = (floor(R.x + .4, R.z) - floor(R.x - .4, R.z)) / .8, gz = (floor(R.x, R.z + .4) - floor(R.x, R.z - .4)) / .8, s = Math.sin(R.yaw), c = Math.cos(R.yaw); R.lieP = Math.atan(gx * s + gz * c); R.lieR = Math.atan(gx * c - gz * s); };
    lie(); R.pitch = R.lieP; R.roll = R.lieR;
    function plan() {
      let best = 0, score = -1e9;
      for (let k = 0; k < spots.length; k++) if (k !== R.spot) { const s = Math.hypot(spots[k][0] - me.x, spots[k][1] - me.z) * .5 + random() * 12; if (s > score) { score = s; best = k; } }
      const tx = spots[best][0], tz = spots[best][1], span = Math.hypot(tx - R.x, tz - R.z) || 1, side = (random() < .5 ? -1 : 1) * 3;
      R.next = best; R.fx = R.x; R.fy = R.y; R.fz = R.z; R.tx = tx; R.tz = tz; R.ty = floor(tx, tz) + .04;
      let lift = Math.max(R.y, R.ty) + 1.3;
      for (let s = 1; s < 8; s++) lift = Math.max(lift, coverAt(lerp(R.x, tx, s / 8), lerp(R.z, tz, s / 8)) + .9);
      R.mx = (R.x + tx) / 2 + (tz - R.z) / span * side; R.mz = (R.z + tz) / 2 - (tx - R.x) / span * side; R.my = 2 * lift - (R.y + R.ty) / 2; R.dur = span / 2;
    }
    R.group = group('Blue-spotted ray', R.x, R.y, R.z, 1.5, { interest: 12, draw: 46, far: .42, meshes: [mesh], update(dt, g) {
      R.cool -= dt;
      if (R.mode === 'buried') {
        R.bury = Math.min(1, R.bury + dt * .4);
        // A diver passing low overhead shakes it out of the sand.
        const over = underwater > .5 && R.cool <= 0 && me.y - R.y < 3.8 && Math.hypot(me.x - R.x, me.z - R.z) < 3.3;
        if (over || R.go || R.startle) {
          const startled = over || R.startle; R.go = R.startle = false; R.mode = 'shake'; R.t = 0;
          if (startled) { puff(R.x, R.y, R.z, 12, 1.4, .8); emit('ray-flush', R.x, R.y, R.z, 1); } else puff(R.x, R.y, R.z, 5, .8, .6);
          plan();
        }
      } else if (R.mode === 'shake') {
        R.t += dt / .45; R.bury = Math.max(0, 1 - R.t * 1.4); R.flap = Math.min(1, R.t * 1.5); R.y = R.fy + .3 * smoothstep(R.t, 0, 1); R.roll = R.lieR + Math.sin(R.t * 40) * .08;
        if (R.t >= 1) { R.mode = 'glide'; R.t = 0; R.fy = R.y; R.roll = 0; }
      } else if (R.mode === 'glide') {
        R.t += dt / R.dur;
        const t = Math.min(R.t, 1), e = 1 - Math.pow(1 - t, 1.7), a = 1 - e, ox = R.x, oy = R.y, oz = R.z;
        R.x = a * a * R.fx + 2 * a * e * R.mx + e * e * R.tx; R.y = a * a * R.fy + 2 * a * e * R.my + e * e * R.ty; R.z = a * a * R.fz + 2 * a * e * R.mz + e * e * R.tz;
        const vx = R.x - ox, vy = R.y - oy, vz = R.z - oz, hv = Math.hypot(vx, vz);
        if (hv > 1e-5 && dt > 0) { const want = Math.atan2(vx, vz); R.roll += (clamp(-turnTo(R.yaw, want) / dt * .3, -.4, .4) - R.roll) * ease(dt, 4); R.yaw = want; R.pitch = Math.atan2(vy, hv) * .7; }
        R.flap = .45 + .55 * (1 - t);
        if (t >= 1) { R.mode = 'settle'; R.t = 0; R.spot = R.next; lie(); puff(R.x, R.y, R.z, 4, .6, .5); }
      } else { R.t += dt / 2.6; R.bury = Math.min(1, R.t); R.flap = Math.max(0, .4 - R.t); R.pitch += (R.lieP - R.pitch) * ease(dt, 4); R.roll += (R.lieR - R.roll) * ease(dt, 4); if (R.t >= 1) { R.mode = 'buried'; R.cool = 5; } }
      pose(mesh, 0, R.x, R.y, R.z, R.yaw, R.pitch, R.roll, .95, .95, .95);
      drive(mesh, 0, R.bury, R.flap);
      g.sphere.center.set(R.x, R.y, R.z); g.busy = R.mode !== 'buried';
    } });
    spots.forEach(([x, z], k) => site(`ray-sand-${k + 1}`, 'Ray sand patch', x, floor(x, z), z, 3, 'hidden', k ? 'Open sand the ray may move to.' : 'A blue-spotted ray lies half buried here. Pass low over it and it shakes free and glides to another patch.'));
  }

  // --- Crabs and hermit crabs -------------------------------------------------------------------
  yield;
  const crabs = cast(geo.crab, CRABS, 'Living world · crabs'), crabEyes = reserve(CRABS * 2), crabList = [];
  for (let k = 0; k < CRABS * 2; k++) motes.set(crabEyes + k, 4, 0, 99, 0, 0, 0, 0, 0, .03, 1, .2 + .05 * (k >> 1) % .3);
  function eyes(c, on, y) {
    if (!on) { motes.toggle(crabEyes + c.i * 2, false); motes.toggle(crabEyes + c.i * 2 + 1, false); return; }
    const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw), s = c.scale;
    for (let side = 0; side < 2; side++) { const ox = (side ? .024 : -.024) * s, oz = .046 * s; motes.toggle(crabEyes + c.i * 2 + side, true, c.x + ox * cos + oz * sin, y + .098 * s, c.z - ox * sin + oz * cos); }
  }
  function crabPatch(id, name, tx, tz, count, note) {
    const [cx, cz] = settle(tx, tz, 1.5, 12, 2), cy = floor(cx, cz), list = [];
    for (let k = 0; k < count && crabList.length < CRABS; k++) {
      const i = crabList.length, hermit = k % 4 === 3, a = random() * TAU, r = rr(.5, 3.2);
      let x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (solid(x, z)) { x = cx; z = cz; }
      const c = { i, hermit, x, z, yaw: random() * TAU, tx: x, tz: z, wait: rr(0, 4), walk: 0, claw: 0, scale: hermit ? rr(1.3, 1.7) : rr(1.8, 2.6), still: false, flee: 0, shy: i % 5 === 4, grow: i % 5 === 4 ? 0 : 1, hidden: true };
      life(crabs, i, random() * TAU, 0, 0, hermit ? 31 : 30); dress(crabs, i, pick(hermit ? ['#f0c9a0', '#e9b48c'] : ['#ffffff', '#f2c6a8', '#c9a2c8', '#ffd9a0']), '#000000');
      list.push(c); crabList.push(c);
    }
    group(name, cx, cy, cz, 4.5, { interest: 14, draw: 36, far: .42, shared: crabs, update(dt) {
      for (let n = 0; n < list.length; n++) {
        const c = list[n];
        // By day the shy ones stay under the sand; at dusk they dig themselves out.
        c.grow = clamp(c.grow + (c.shy && night < .35 ? -1 : 1) * dt * .6, 0, 1);
        if (c.grow <= .01) { if (!c.hidden) { c.hidden = true; c.still = false; conceal(crabs, c.i); eyes(c, false); } continue; }
        c.hidden = false;
        const y = floor(c.x, c.z), dx = c.x - me.x, dy = y - me.y, dz = c.z - me.z, d = Math.hypot(dx, dy, dz);
        let lit = false;
        if (lampOn) { const lx = c.x - lampAt.x, ly = y - lampAt.y, lz = c.z - lampAt.z, ll = Math.hypot(lx, ly, lz); lit = ll < 16 && lx * beam.x + ly * beam.y + lz * beam.z > ll * .9; }
        if (d < 1.8 && c.flee <= 0 && underwater > .5) {
          let a = Math.atan2(dx, dz) + rr(-.5, .5); const far = rr(1.4, 2.2);
          for (let tries = 0; tries < 5 && solid(c.x + Math.sin(a) * far, c.z + Math.cos(a) * far); tries++) a += 1.2;
          c.tx = c.x + Math.sin(a) * far; c.tz = c.z + Math.cos(a) * far; c.flee = 1.4; c.wait = 0;
        }
        let pace = 0;
        if (c.flee > 0) { c.flee -= dt; pace = c.hermit ? .35 : .95; }
        // Caught in the beam, a crab freezes.
        else if (lit) pace = 0;
        else if (c.wait > 0) c.wait -= dt * (1 + night);
        else pace = (c.hermit ? .09 : .2) * (1 + night * .5);
        let moving = false;
        if (pace > 0 && dt > 0) {
          const mx = c.tx - c.x, mz = c.tz - c.z, ml = Math.hypot(mx, mz);
          if (ml < .06) { c.wait = rr(1.2, 5); const a = random() * TAU, r = rr(.4, 3.4), nx = cx + Math.cos(a) * r, nz = cz + Math.sin(a) * r; if (!solid(nx, nz)) { c.tx = nx; c.tz = nz; } }
          // Sideways, as crabs go.
          else { const step = Math.min(ml, pace * dt); c.x += mx / ml * step; c.z += mz / ml * step; moving = true; c.yaw += turnTo(c.yaw, Math.atan2(mx, mz) + Math.PI / 2) * ease(dt, 6); }
        }
        c.walk += ((moving ? Math.min(1, pace / .25) : 0) - c.walk) * ease(dt, 8);
        c.claw += ((lit || d < 3 ? 1 : 0) - c.claw) * ease(dt, 5);
        // The eyes only answer the lamp while the crab is still.
        if (moving === c.still) { c.still = !moving; eyes(c, c.still, floor(c.x, c.z)); }
        const s = c.scale * (.4 + .6 * c.grow);
        pose(crabs, c.i, c.x, floor(c.x, c.z) - .004 - (1 - c.grow) * .09 * c.scale, c.z, c.yaw, 0, 0, s, s, s);
        drive(crabs, c.i, c.claw, c.walk);
      }
    }, conceal() { for (let n = 0; n < list.length; n++) { const c = list[n]; conceal(crabs, c.i); eyes(c, false); c.still = false; c.hidden = true; } } });
    site(id, name, cx, cy, cz, 4.5, 'seabed', note);
  }
  yield;
  const perPatch = Math.ceil(CRABS / 6);
  crabPatch('crabs-shallows', 'Crab flat', 9, -9, perPatch, 'Crabs and a hermit crab working the sand beside the first leg of the tour. They freeze in the lamp and their eyes shine back.');
  crabPatch('crabs-brain-dome', 'Brain dome crabs', -45, 6, perPatch, 'More come out at dusk.');
  crabPatch('crabs-deep', 'Deep ledge crabs', -30, -93, perPatch, 'On the deep sand west of the treasure.');
  crabPatch('crabs-east', 'East slope crabs', 26, -97, perPatch, 'Below the arch on the eastern side.');
  crabPatch('crabs-west', 'West coral crabs', -49, -47, perPatch, 'Larger crabs crawling across the western coral shelf.');
  crabPatch('crabs-outer', 'Outer shelf crabs', 50, 13, perPatch, 'Crabs on the bright sand near the edge of the reef.');

  // --- Seahorses on sea whips at the edge of the kelp grove -----------------------------------------
  {
    const [cx, cz] = settle(-53.5, -51.5, 1.6, 8, 3), n = economy ? 3 : 5, list = [];
    const whips = cast(geo.tendril, n + 2, 'Living world · sea whips', true), horses = cast(geo.seahorse, n, 'Living world · seahorses', true);
    for (let k = 0; k < n + 2; k++) {
      const a = k * 2.4, r = .35 + Math.sqrt(k) * .5, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = floor(x, z), length = rr(1.1, 1.8);
      pose(whips, k, x, y - .03, z, random() * TAU, 0, 0, .55, length, .55);
      life(whips, k, random() * TAU, 0, .4, 12); dress(whips, k, pick(['#d98a4a', '#c9b24a', '#b56a7a']), '#ffffff');
      if (k < n) { const h = { i: k, x, z, y: y + length * rr(.2, .32), yaw: random() * TAU, home: random() * TAU, sent: 99, scale: rr(1.1, 1.5) }; list.push(h); life(horses, k, random() * TAU, 0, 0, 60); dress(horses, k, pick(['#f2c230', '#f08a3c', '#e96f8f', '#d9d2b0']), '#7a4a1a', .5); }
    }
    const place = h => pose(horses, h.i, h.x - Math.sin(h.yaw) * .02 * h.scale, h.y, h.z - Math.cos(h.yaw) * .02 * h.scale, h.yaw, 0, 0, h.scale, h.scale, h.scale);
    for (const h of list) place(h);
    whips.computeBoundingSphere(); horses.computeBoundingSphere(); whips.boundingSphere.radius += .4; horses.boundingSphere.radius += .2;
    group('Seahorses', cx, floor(cx, cz) + .6, cz, 2, { interest: 9, draw: 24, far: .22, meshes: [whips, horses], update(dt) {
      for (let k = 0; k < list.length; k++) {
        const h = list[k], close = underwater > .5 && Math.hypot(me.x - h.x, me.y - h.y, me.z - h.z) < 3.6;
        // A seahorse shows its back to whoever comes close.
        h.yaw += turnTo(h.yaw, close ? Math.atan2(h.x - me.x, h.z - me.z) : h.home + Math.sin(time * .2 + h.i) * .5) * ease(dt, 1.4);
        if (Math.abs(turnTo(h.sent, h.yaw)) > .03) { h.sent = h.yaw; place(h); }
      }
    } });
    site('seahorses', 'Seahorse whips', cx, floor(cx, cz), cz, 2.5, 'resident', 'Seahorses holding onto sea whips inside the kelp grove. They turn their backs on anyone who comes close.');
  }

  // --- The bait ball: every fish flies its own orbit on the GPU -----------------------------------------
  yield;
  const bait = { spin: 0, kick: 0, kickTarget: 0, radius: 3.6, spinRate: .55, tunnel: .01, inside: false, raid: 0, group: null, jacks: [], count: economy ? 420 : 900 };
  {
    const N = bait.count, home = new THREE.Vector3(48, Math.min(-8, floor(48, -67) + 19), -67), geometry = new THREE.InstancedBufferGeometry();
    for (const key of ['position', 'normal', 'color']) geometry.setAttribute(key, geo.bait.getAttribute(key));
    geometry.setIndex(geo.bait.index);
    const orbit = new Float32Array(N * 4), seeds = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { orbit[i * 4] = 1 - .62 * Math.pow(random(), 1.8); orbit[i * 4 + 1] = rr(-1.05, 1.05); orbit[i * 4 + 2] = random() * TAU; orbit[i * 4 + 3] = random() * TAU; seeds[i * 2] = random(); seeds[i * 2 + 1] = random(); }
    geometry.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(orbit, 4)); geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 2));
    geometry.instanceCount = N; geometry.boundingSphere = new THREE.Sphere(home.clone(), 13);
    const U = { uBall: { value: new THREE.Vector4(home.x, home.y, home.z, 3.6) }, uBallMove: { value: new THREE.Vector4(0, .82, 0, 0) }, uBallDiver: { value: new THREE.Vector4(0, 999, 0, .01) },
      uBallDiverDir: { value: new THREE.Vector3(0, 0, 1) }, uBallPred: { value: [new THREE.Vector4(0, 999, 0, .01), new THREE.Vector4(0, 999, 0, .01), new THREE.Vector4(0, 999, 0, .01)] } };
    const ball = new THREE.Mesh(geometry, kit.baitMaterial(U)); ball.name = 'Living world · bait ball'; ball.matrixAutoUpdate = false; under.add(ball);
    ball.userData.triangles = geo.bait.index.count / 3 * N;
    for (let k = 0; k < 3; k++) bait.jacks.push({ slot: fishNew(0, '#a9bfcc', '#d8c452'), a: k * TAU / 3, r: 9 + k * 1.2, lift: rr(-1.5, 1.5), strike: -1, hit: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, v: 0, wide: 0, cool: rr(6, 14), seen: false });
    bait.group = group('Bait ball', home.x, home.y, home.z, 12, { interest: 26, draw: 80, far: .62, meshes: [ball], shared: fish, update(dt) {
      const c = U.uBall.value, d = Math.hypot(me.x - c.x, me.y - c.y, me.z - c.z), fear = underwater > .5 ? 1 - smoothstep(d, 6, 14) : 0;
      bait.kickTarget *= Math.exp(-dt * .85);
      bait.kick += (bait.kickTarget - bait.kick) * ease(dt, 2.2);
      // The ball breathes, tightens and spins faster as the diver closes, and flares when a jack goes through.
      bait.radius += (3.6 * (1 - .2 * fear) * (1 + .07 * Math.sin(time * .55)) * (1 + bait.kick) - bait.radius) * ease(dt, 2);
      const R = bait.radius;
      bait.spinRate += (.45 + .35 * fear + bait.kick * 1.1 - bait.spinRate) * ease(dt, 1.6);
      bait.spin += dt * bait.spinRate;
      c.set(home.x + Math.sin(time * .05) * 2.5, home.y + Math.sin(time * .083) * 1 - hunker * 3, home.z + Math.cos(time * .041) * 2.5, R);
      U.uBallMove.value.set(bait.spin, .82, time, 0);
      const inside = underwater > .5 && d < R * 1.05;
      if (inside && !bait.inside) emit('bait-part', me.x, me.y, me.z, 1);
      if (inside) bait.inside = true; else if (d > R + 3) bait.inside = false;
      // A tunnel opens along the diver's heading and closes behind them.
      bait.tunnel += ((underwater > .5 && d < R + 2.5 ? 2.1 : .01) - bait.tunnel) * ease(dt, 5);
      U.uBallDiver.value.set(me.x, me.y, me.z, bait.tunnel); U.uBallDiverDir.value.copy(aim);
      for (let k = 0; k < 3; k++) {
        const j = bait.jacks[k];
        j.cool -= dt * (1 + dusk);
        if (j.strike < 0 && d > R + 4 && (j.cool <= 0 || bait.raid > 0)) { j.strike = 0; j.hit = false; j.cool = rr(9, 17); if (bait.raid > 0) bait.raid--; }
        j.a += dt * (j.strike >= 0 ? .07 : .12 + .012 * k); j.wide += ((d < 12 ? 3 : 0) - j.wide) * ease(dt, 1);
        let rad = j.r + j.wide;
        // A strike: straight through the middle of the ball and out the other side.
        if (j.strike >= 0) {
          j.strike += dt / 5.8; const s = Math.min(j.strike, 1); rad *= 1 - 2 * s * s * (3 - 2 * s);
          if (!j.hit && s > .5) { j.hit = true; bait.kickTarget = Math.max(bait.kickTarget, .22); emit('bait-part', c.x, c.y, c.z, .7); }
          if (s >= 1) { j.strike = -1; j.a += Math.PI; rad = j.r + j.wide; }
        }
        const ox = j.x, oy = j.y, oz = j.z;
        j.x = c.x + Math.cos(j.a) * rad; j.z = c.z + Math.sin(j.a) * rad; j.y = Math.min(-2, c.y + j.lift * Math.abs(rad) / j.r + Math.sin(time * .4 + k) * .5);
        const vx = j.x - ox, vy = j.y - oy, vz = j.z - oz, hv = Math.hypot(vx, vz);
        if (!j.seen) { j.seen = true; j.yaw = Math.atan2(-Math.sin(j.a), Math.cos(j.a)); }
        else if (hv > 1e-5 && dt > 0) { j.yaw += turnTo(j.yaw, Math.atan2(vx, vz)) * ease(dt, 4); j.pitch += (Math.atan2(vy, hv) - j.pitch) * ease(dt, 3); j.v += (hv / dt - j.v) * ease(dt, 3); }
        const pred = U.uBallPred.value[k], response = ease(dt, 3.5);
        if(pred.y > 900)pred.set(j.x, j.y, j.z, .01);
        pred.x += (j.x - pred.x) * response; pred.y += (j.y - pred.y) * response; pred.z += (j.z - pred.z) * response; pred.w += (1.65 - pred.w) * response;
        fishPose(j.slot, j.x, j.y, j.z, j.yaw, j.pitch, 0, .6, .95, .9, .25 + Math.min(j.v * .12, .75), 0);
      }
    }, conceal() { for (let k = 0; k < 3; k++) { conceal(fish, bait.jacks[k].slot); bait.jacks[k].seen = false; } } });
    bait.ball = ball; bait.uniforms = U; bait.home = home;
    site('bait-ball', 'Bait ball', home.x, home.y, home.z, 12, 'behaviour', 'A turning ball of silver fry over the soft coral spire, with three jacks circling. Swim through it: it opens a tunnel around you.');
  }

  // --- Seabed: vents, drifting weed, plankton -----------------------------------------------------
  yield;
  const ventStart = reserve(VENTS.length * VENT_BUBBLES), vents = [];
  VENTS.forEach(([tx, tz], k) => {
    const [x, z] = settle(tx, tz, 1.2, 12, 3), y = floor(x, z), m = propZones[zoneOf(z)], crust = tone('#b9a36a'), ash = tone('#5f5a4a');
    m.rock(x, y + .05, z, .44, .32, .44, 40 + k, (px, py, pz, t, a) => blend(ash, crust, clamp(t * 1.4 + a * .3, 0, 1)), 0, .5);
    m.blob(x, y + .19, z, .11, .05, .11, 6, 3, [.02, .02, .02]);
    for (let b = 0; b < VENT_BUBBLES; b++) motes.set(ventStart + k * VENT_BUBBLES + b, 1, x + rr(-.07, .07), y + .24, z + rr(-.07, .07), 0, rr(.75, 1.05), 0, 0, rr(.035, .075), rr(4.5, 7), random());
    vents.push({ x, y, z });
    site(`vent-${k + 1}`, 'Bubble vent', x, y, z, 2, 'seabed', 'A thin stream of bubbles rising from a crusted mound in the sand.');
  });
  const leafStart = reserve(LEAVES);
  for (let i = 0; i < LEAVES; i++) { const x = rr(-56, 56), z = rr(-100, 30); motes.set(leafStart + i, 6, x, Math.min(-1, coverAt(x, z) + rr(.8, 2.8)), z, 0, 0, 0, 0, rr(.07, .14), rr(18, 30), random()); }
  const planktonStart = reserve(PLANKTON);
  for (let i = 0; i < PLANKTON; i++) motes.set(planktonStart + i, 5, rr(0, 10), rr(0, 6), rr(0, 10), 0, 0, 0, 0, .05, 1, random());
  let trailCursor = 0, trailAt = -1e9, burstAt = -1e9;

  // --- Bake the props ---------------------------------------------------------------------------
  yield;
  const props = [];
  propZones.forEach((mesher, k) => {
    if (!mesher.count) return;
    const mesh = kit.lifeMesh(mesher.build(), kit.life, 1, `Living world · dens, perches and coral heads ${k + 1}`);
    mesh.setMatrixAt(0, M.identity()); mesh.computeBoundingSphere(); under.add(mesh); props.push(mesh);
  });

  // --- The surface ----------------------------------------------------------------------------------
  yield;
  const surface = createSurfaceLife({ kit, random, emit, economy });
  root.add(surface.root);
  const env = { eye, fwdX: 0, fwdZ: -1, focusX: 0, focusZ: 0, underwater: 0, night: 0, storm: 0, wind: .18, range: 400 };

  // =========================================================================
  // THE DIRECTOR
  // =========================================================================
  // One clock. When it runs out the director looks at what is within sight and can happen now, and starts
  // one thing. Anything the diver sets off themselves pushes the clock back, so moments never pile up.
  const nearestVent = () => { let best = null, d = 1e9; for (let k = 0; k < vents.length; k++) { const v = vents[k], dv = Math.hypot(v.x - eye.x, v.y - eye.y, v.z - eye.z); if (dv < d) { d = dv; best = v; } } return d < 28 ? best : null; };
  const eelsInSight = () => { for (let k = 0; k < eelGardens.length; k++) { const s = eelGardens[k]; if (s.group.toPlayer > 9 && s.out > s.count * .5 && inSight(s.group, 26)) return s; } return null; };
  const moments = [
    { type: 'flying-fish', zone: 'surface', weight: () => storm < .5 ? 3 : 0, run: () => surface.trigger('flying-fish', env) },
    { type: 'dolphin-pass', zone: 'surface', weight: () => storm < .5 ? (night > .6 ? .8 : 3) : 0, run: options => surface.trigger('dolphin-pass', env, options) },
    { type: 'turtle-breath', zone: 'surface', weight: () => storm < .5 ? 2 : 0, run: () => surface.trigger('turtle-breath', env) },
    { type: 'whale-blow', zone: 'surface', weight: () => storm < .8 ? 1.4 : 0, run: () => surface.trigger('whale-blow', env) },
    { type: 'jack-raid', zone: 'under', weight: () => inSight(bait.group, 45) && bait.group.toPlayer > 9 ? 3 : 0, run: () => { bait.raid = 2; return true; } },
    { type: 'ray-pass', zone: 'under', weight: () => ray.mode === 'buried' && ray.cool <= 0 && ray.group.toPlayer > 5 && inSight(ray.group, 26) ? 2 : 0, run: () => { ray.go = true; ray.group.busy = true; return true; } },
    { type: 'batfish-visit', zone: 'under', weight: () => batfish.mode === 'home' && night < .45 && hunker < .5 && batfish.group.toPlayer < 50 ? 2 : 0, run: () => { batfish.called = true; batfish.cool = 0; batfish.group.busy = true; return true; } },
    { type: 'dolphin-overhead', zone: 'under', weight: () => -me.y < 16 && night < .5 && storm < .5 ? 1.5 : 0, run: () => surface.trigger('dolphin-overhead', env) },
    { type: 'biolume-bloom', zone: 'under', weight: () => night > .6 ? 3 : 0, run: () => { motes.uniforms.uBloom.value.set(me.x + fwd.x * 5, me.y + fwd.y * 5, me.z + fwd.z * 5, time); emit('biolume-burst', me.x + fwd.x * 5, me.y + fwd.y * 5, me.z + fwd.z * 5, 1); return true; } },
    { type: 'octopus-stroll', zone: 'under', weight: () => octopus.mode === 'rest' && octopus.group.toPlayer > 6.5 && inSight(octopus.group, 22) ? (night > .5 ? 2.5 : 1.2) : 0, run: () => { octopus.go = true; octopus.group.busy = true; return true; } },
    { type: 'eel-wave', zone: 'under', weight: () => night < .5 && eelsInSight() ? 1.6 : 0, run: () => {
      const s = eelsInSight() || eelGardens[0], dx = s.cx - me.x, dz = s.cz - me.z, dl = Math.hypot(dx, dz) || 1, r = s.group.sphere.radius;
      s.dirX = dx / dl; s.dirZ = dz / dl; s.waveX = s.cx - s.dirX * (r + 1.3); s.waveZ = s.cz - s.dirZ * (r + 1.3); s.wave = time; emit('eel-wave', s.cx, s.cy, s.cz, .4); return true; } },
    { type: 'vent-burst', zone: 'under', weight: () => nearestVent() ? 1 : 0, run: () => {
      const v = nearestVent() || vents[0];
      for (let k = 0; k < 18; k++) motes.emit(9, v.x + rr(-.1, .1), v.y + .25, v.z + rr(-.1, .1), rr(-.12, .12), rr(.9, 1.7), rr(-.12, .12), rr(.05, .13), rr(3, 5.5), random());
      emit('vent-burst', v.x, v.y, v.z, .4); return true; } }
  ];
  function direct(dt) {
    if (!(dt > 0)) return;
    // Busier at dawn and dusk, quieter in a storm.
    beat.next -= dt * (1 + .5 * dusk) / (1 + storm * .6);
    if (beat.next > 0) return;
    const zone = underwater > .5 ? 'under' : eye.y > -.5 ? 'surface' : '';
    // The visit opens with something close and quick, then the pod.
    if (zone === 'surface' && beat.opening < 2 && storm < .5) {
      const started = beat.opening === 0 ? surface.trigger('flying-fish', env) : surface.trigger('dolphin-pass', env, { bow: true });
      beat.last = beat.opening === 0 ? 'flying-fish' : 'dolphin-pass'; beat.opening++; beat.count++; beat.next = started ? (beat.opening === 1 ? rr(18, 26) : rr(34, 56)) : rr(6, 10);
      return;
    }
    let total = 0;
    for (let i = 0; i < moments.length; i++) { const m = moments[i]; m.w = m.zone === zone ? m.weight() * (m.type === beat.last ? .25 : 1) : 0; total += m.w; }
    if (total <= 0) { beat.next = rr(8, 14); return; }
    let roll = random() * total;
    for (let i = 0; i < moments.length; i++) {
      const m = moments[i]; if (m.w <= 0) continue;
      roll -= m.w;
      if (roll <= 0) { const started = m.run(); beat.last = m.type; beat.next = started ? rr(30, 60) : rr(6, 10); if (started) beat.count++; break; }
    }
  }

  // =========================================================================
  // UPDATE
  // =========================================================================
  function updateUnder(dt) {
    const U = motes.uniforms;
    U.uPlayer.value.copy(me); U.uStir.value += ((night > .2 ? clamp(speed / 1.5, 0, 1) : 0) - U.uStir.value) * ease(dt, 3); U.uLamp.value.set(lampAt.x, lampAt.y, lampAt.z, lampOn ? clamp(.25 + night + depth * .8, 0, 1) : 0); U.uLampDir.value.copy(beam);
    // The wake: where the diver has just been, for the plankton to light.
    if (dt > 0 && night > .2 && speed > .25 && time - trailAt > .28) {
      trailAt = time; U.uTrail.value[trailCursor++ % 8].set(me.x, me.y, me.z, time);
      if (speed > 2.2 && night > .5 && time - burstAt > 9) { burstAt = time; emit('biolume-burst', me.x, me.y, me.z, Math.min(1, speed / 4)); }
    }
    fish.userData.on = crabs.userData.on = morays.userData.on = false;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i], c = g.sphere.center;
      g.toPlayer = Math.hypot(me.x - c.x, me.y - c.y, me.z - c.z); g.toEye = Math.hypot(eye.x - c.x, eye.y - c.y, eye.z - c.z);
      g.near = g.toPlayer < g.interest + g.sphere.radius;
      g.shown = !view || (g.toEye - g.sphere.radius < Math.min(g.draw, range * g.far) && view.frustum.intersectsSphere(g.sphere));
      if (g.near || g.shown || g.busy) { g.live = true; g.update(dt, g); }
      else if (g.live) { g.live = false; if (g.conceal) g.conceal(); }
      if (g.shown !== g.drawn) { g.drawn = g.shown; if (g.meshes) for (let k = 0; k < g.meshes.length; k++) g.meshes[k].visible = g.shown; }
      if (g.shown && g.shared) g.shared.userData.on = true;
    }
    fish.visible = fish.userData.on; crabs.visible = crabs.userData.on; morays.visible = morays.userData.on;
    for (let i = 0; i < props.length; i++) { const s = props[i].boundingSphere; props[i].visible = !view || Math.hypot(eye.x - s.center.x, eye.y - s.center.y, eye.z - s.center.z) - s.radius < Math.min(60, range * .5); }
    for (let i = 0; i < lifeMeshes.length; i++) {
      const mesh = lifeMeshes[i], d = mesh.userData;
      if (d.dm) { d.dm = false; mesh.instanceMatrix.needsUpdate = true; }
      if (d.dl) { d.dl = false; mesh.geometry.attributes.aLife.needsUpdate = true; }
      if (d.dc) { d.dc = false; mesh.instanceColor.needsUpdate = true; mesh.geometry.attributes.aTint.needsUpdate = true; }
    }
    motes.flush();
  }

  function update(dt = 0, elapsed, ctx = {}) {
    const camera = ctx.camera || null;
    view = ctx.view === undefined ? null : ctx.view;
    dt = ctx.paused || !(dt > 0) ? 0 : Math.min(dt, .1);
    time = Number.isFinite(elapsed) ? elapsed : time + dt;
    if (ctx.player) me.copy(ctx.player); else if (camera) me.copy(camera.position);
    if (view && view.eye) eye.copy(view.eye); else if (camera) eye.copy(camera.position); else eye.copy(me);
    range = view && Number.isFinite(view.range) ? view.range : 400;
    if (camera) { const e = camera.matrixWorld.elements; fwd.set(-e[8], -e[9], -e[10]); if (fwd.lengthSq() > 1e-6) fwd.normalize(); else fwd.set(0, 0, -1); }
    underwater = ctx.underwater ?? (eye.y < 0 ? 1 : 0); night = ctx.night ?? 0; depth = ctx.depth ?? clamp((-eye.y - 22) / 38, 0, 1);
    storm = ctx.weather?.storm ?? 0; wind = ctx.weather?.wind ?? .18;
    lampOn = Boolean(ctx.lamp) && underwater > .5;
    if (dt > 0) {
      if (hadPlayer) { meVel.subVectors(me, meLast).divideScalar(dt); if (meVel.lengthSq() > 400) meVel.set(0, 0, 0); }
      meLast.copy(me); hadPlayer = true; speed += (meVel.length() - speed) * Math.min(1, dt * 6);
    }
    // Where the diver is going: their motion while they move, their gaze while they hang still.
    if (speed > .3 && meVel.lengthSq() > .01) aim.copy(meVel).normalize(); else aim.copy(ctx.aim || fwd);
    const hl = Math.hypot(aim.x, aim.z); if (hl > .2) heading.set(aim.x / hl, 0, aim.z / hl);
    lampAt.set(me.x, me.y + .4, me.z); beam.copy(ctx.aim || fwd);
    dusk = Math.max(0, 1 - Math.abs(night - .5) * 2); hunker = storm * (1 - smoothstep(-me.y, 10, 26));
    shared.uLifeTime.value = time; shared.uLifeNight.value = night;
    // Under water, or in the orbit viewer (no view), the reef's residents; nothing while the camera is in the air.
    if (underwater > .01 || !view) { if (!under.visible) under.visible = true; updateUnder(dt); } else if (under.visible) under.visible = false;
    // The surface cast costs nothing once the camera is deep and no event is running.
    if (eye.y > -18 || surface.active || !view) {
      const fl = Math.hypot(fwd.x, fwd.z);
      if (fl > .15) { env.fwdX = fwd.x / fl; env.fwdZ = fwd.z / fl; } else { env.fwdX = heading.x; env.fwdZ = heading.z; }
      env.underwater = underwater; env.night = night; env.storm = storm; env.wind = wind; env.range = range;
      // Where the diver's body is: under water, the player; at the surface the scene frames them ahead of the
      // camera and to the right (ctx.diver says exactly where, when the scene passes it).
      if (ctx.diver) { env.focusX = ctx.diver.x; env.focusZ = ctx.diver.z; }
      else if (underwater > .5) { env.focusX = me.x; env.focusZ = me.z; }
      else { const aside = camera ? 4.75 / camera.projectionMatrix.elements[0] : 3.5; env.focusX = eye.x + env.fwdX * 7.2 - env.fwdZ * aside; env.focusZ = eye.z + env.fwdZ * 7.2 + env.fwdX * aside; }
      surface.update(dt, time, env);
    } else if (surface.root.visible) surface.rest();
    direct(dt);
  }

  // --- Reporting and test hooks -------------------------------------------------------------------
  const triangles = mesh => (mesh.userData.triangles || 0) * (mesh.isInstancedMesh ? mesh.count : 1);
  const counts = {
    gardenEels: eelGardens.reduce((sum, s) => sum + s.count, 0), morays: 2, octopus: 1, baitFish: bait.count, jacks: 3, clownfish: 8, cleanerWrasse: 4, pufferfish: 2, batfish: 2, goatfish: 2, flounder: 2,
    rays: 1, crabs: crabList.length, seahorses: economy ? 3 : 5, nudibranchs, shrimpEyes: shrimps, vents: vents.length, plankton: PLANKTON, driftingWeed: LEAVES, ...surface.counts,
    groups: groups.length, sites: sites.length,
    drawCalls: { underwaterMeshes: under.children.length, surfaceMeshes: surface.root.children.length },
    triangles: { underwater: under.children.reduce((sum, mesh) => sum + triangles(mesh), 0), surface: surface.counts.triangles }
  };
  const forced = {
    'octopus-jet': () => { octopus.rush = true; octopus.group.busy = true; return true; },
    'ray-flush': () => { ray.startle = true; ray.cool = 0; ray.group.busy = true; return true; },
    'bait-part': () => { bait.raid = 3; return true; },
    'eel-retreat': () => moments.find(m => m.type === 'eel-wave').run(),
    'biolume-burst': () => moments.find(m => m.type === 'biolume-bloom').run()
  };
  const debug = {
    /** Start a moment now, whatever the director thinks: any moment type, or one of the reactions above. */
    trigger(type, options) { const moment = moments.find(m => m.type === type); return forced[type] ? forced[type]() : moment ? Boolean(moment.run(options)) : surface.trigger(type, env, options); },
    get moments() { return moments.map(m => m.type).concat(Object.keys(forced)); },
    beat, groups, log, octopus, ray, bait, batfish, puffers, flounders, eelGardens, morayStates, crabList, surface, motes, kit, under, props,
    /** Every mover's position, for bounds checks. */
    positions() {
      const list = [];
      const add = (name, x, y, z) => list.push({ name, x, y, z, floor: floor(x, z) });
      add('octopus', octopus.x, octopus.y, octopus.z); add('ray', ray.x, ray.y, ray.z);
      batfish.list.forEach((b, k) => add(`batfish-${k}`, b.x, b.y, b.z)); bait.jacks.forEach((j, k) => add(`jack-${k}`, j.x, j.y, j.z));
      puffers.forEach((p, k) => add(`puffer-${k}`, p.x, p.y, p.z)); flounders.forEach((f, k) => add(`flounder-${k}`, f.x, floor(f.x, f.z) + .035, f.z));
      crabList.forEach(c => add(`crab-${c.i}`, c.x, floor(c.x, c.z), c.z));
      const ball = bait.uniforms.uBall.value; add('bait-ball', ball.x, ball.y, ball.z);
      return list;
    }
  };
  // `under` holds everything below the surface: hand it to the scene's shader warm-up before the first dive.
  return { root, under, update, counts, sites, events, debug };
}
