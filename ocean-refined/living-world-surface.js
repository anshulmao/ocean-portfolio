import * as THREE from './vendor/three.module.min.js';
import { waveHeight } from './shaders.js';
import { createParticles } from './living-world-shaders.js';

// Life at the surface, where every visit begins: a dolphin pod that passes in porpoising arcs and sometimes rides
// round the diver, flying fish, a turtle coming up to breathe, a whale's blow and flukes on the horizon, and fry
// skittering out of the water. Everything arrives from under the surface or out of the haze and leaves the same way.
// Nothing here runs unless an event is under way.
const { clamp, smoothstep, lerp } = THREE.MathUtils;
const TAU = Math.PI * 2;
const turnTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function createSurfaceLife({ kit, random, emit, economy = false }) {
  const root = new THREE.Group(); root.name = 'Living world · surface life'; root.matrixAutoUpdate = false; root.visible = false;
  const rr = (a, b) => a + random() * (b - a);
  const DOLPHINS = economy ? 4 : 6, FLYERS = economy ? 5 : 8;
  const cast = (geometry, count, name) => { const mesh = kit.lifeMesh(geometry, kit.surface, count, name); mesh.frustumCulled = false; mesh.visible = false; root.add(mesh); return mesh; };
  const dolphins = cast(kit.geometries.dolphin, DOLPHINS, 'Living world · dolphin pod');
  const flyers = cast(kit.geometries.flyer, FLYERS, 'Living world · flying fish');
  const turtle = cast(kit.geometries.turtle, 1, 'Living world · surfacing turtle');
  const whale = cast(kit.geometries.whale, 1, 'Living world · whale flukes');
  const spray = createParticles({ count: economy ? 96 : 160, haze: .004, shared: kit.shared, name: 'Living world · spray and blow' });
  spray.points.visible = false; root.add(spray.points);
  const kindOf = (mesh, kind) => { const life = mesh.geometry.attributes.aLife.array; for (let i = 0; i < mesh.count; i++) { life[i * 4] = random() * TAU; life[i * 4 + 3] = kind; } };
  kindOf(dolphins, 70); kindOf(flyers, 80); kindOf(turtle, 21); kindOf(whale, 99);
  const shade = new THREE.Color();
  for (let i = 0; i < DOLPHINS; i++) dolphins.setColorAt(i, shade.setScalar(rr(.82, 1.05)));

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(0, 0, 0, 'YXZ');
  // pitch > 0 lifts the nose.
  function pose(mesh, i, x, y, z, yaw, pitch, roll, scale) {
    E.set(-pitch, yaw, roll, 'YXZ'); Q.setFromEuler(E); M.compose(P.set(x, y, z), Q, S.setScalar(scale)); mesh.setMatrixAt(i, M);
  }
  const hide = (mesh, i) => mesh.setMatrixAt(i, kit.ZERO_MATRIX);
  function splash(x, z, strength, time) {
    const y = waveHeight(x, z, time) + .05, n = Math.round(3 + strength * 3);
    for (let k = 0; k < n; k++) { const a = random() * TAU, v = rr(.5, 1.5) * strength; spray.emit(7, x, y, z, Math.cos(a) * v, rr(1.6, 3.4) * strength, Math.sin(a) * v, rr(.07, .16), rr(.55, .95), random()); }
  }

  // --- Dolphins -------------------------------------------------------------
  const formation = [[0, 0], [-2.3, -2.6], [2.5, -3.1], [-4.4, -6.2], [4.7, -6.6], [.6, -9]];
  const pod = { active: false, t: 0, x: 0, z: 0, heading: 0, speed: 7.4, stage: 0, bow: false, orbit: 0, laps: 0, turn: 1, w1x: 0, w1z: 0, w2x: 0, w2z: 0, cx: 0, cz: 0, leaving: false, heard: false, deep: 0 };
  const pack = [];
  for (let i = 0; i < DOLPHINS; i++) pack.push({ side: formation[i][0], back: formation[i][1], cycle: random(), period: rr(2.7, 3.3), height: rr(1.15, 1.65), leap: 0, lead: 1 + i * .6 + random(), scale: rr(2.05, 2.5), above: false, y: -2 });
  function startDolphins(env, { bow = random() < .45, overhead = false } = {}) {
    if (pod.active || env.storm > .55) return false;
    const sign = random() < .5 ? -1 : 1, fx = env.fwdX, fz = env.fwdZ, sx = fz, sz = -fx;
    const from = env.underwater > .5 ? Math.min(120, env.range * .85) : 150, a0 = sign * rr(.85, 1.2), a1 = -sign * rr(.9, 1.3);
    pod.x = env.eye.x + (fx * Math.cos(a0) + sx * Math.sin(a0)) * from; pod.z = env.eye.z + (fz * Math.cos(a0) + sz * Math.sin(a0)) * from;
    if (overhead) { pod.cx = env.focusX; pod.cz = env.focusZ; pod.w1x = pod.cx + sx * sign * 5; pod.w1z = pod.cz + sz * sign * 5; }
    else {
      // The pod crosses in front; a bow-riding pod first swings round a point just beyond the diver.
      pod.cx = env.focusX + fx * 7.5; pod.cz = env.focusZ + fz * 7.5;
      const ahead = rr(16, 23), across = sign * rr(2, 5);
      pod.w1x = env.eye.x + fx * ahead + sx * across; pod.w1z = env.eye.z + fz * ahead + sz * across;
    }
    pod.w2x = env.eye.x + (fx * Math.cos(a1) + sx * Math.sin(a1)) * 230; pod.w2z = env.eye.z + (fz * Math.cos(a1) + sz * Math.sin(a1)) * 230;
    pod.heading = Math.atan2(pod.w1x - pod.x, pod.w1z - pod.z); pod.turn = -sign;
    pod.active = true; pod.t = 0; pod.stage = 0; pod.bow = bow || overhead; pod.orbit = 0; pod.laps = rr(1.1, 1.7); pod.leaving = false; pod.heard = false; pod.deep = overhead ? .5 : 0;
    for (const d of pack) { d.leap = 0; d.above = false; }
    dolphins.visible = true;
    return true;
  }
  function updateDolphins(dt, time, env) {
    pod.t += dt;
    const ex = pod.x - env.eye.x, ez = pod.z - env.eye.z, away = Math.hypot(ex, ez);
    let tx = pod.w2x, tz = pod.w2z, rate = .5;
    if (pod.stage === 0) { tx = pod.w1x; tz = pod.w1z; if (Math.hypot(tx - pod.x, tz - pod.z) < 7) pod.stage = pod.bow ? 1 : 2; }
    if (pod.stage === 1) {
      const a = Math.atan2(pod.x - pod.cx, pod.z - pod.cz) + pod.turn * .75;
      tx = pod.cx + Math.sin(a) * 9; tz = pod.cz + Math.cos(a) * 9; rate = 1;
      pod.orbit += dt * pod.speed / (TAU * 9); if (pod.orbit > pod.laps) pod.stage = 2;
    }
    if (env.storm > .6 || pod.t > 150) { pod.stage = 2; pod.leaving = true; }
    if (pod.stage === 2 && away > (env.underwater > .5 ? Math.min(env.range, 130) : 150)) pod.leaving = true;
    const speed = pod.stage === 1 ? 6.3 : pod.speed;
    pod.heading += clamp(turnTo(pod.heading, Math.atan2(tx - pod.x, tz - pod.z)), -rate * dt, rate * dt);
    const hx = Math.sin(pod.heading), hz = Math.cos(pod.heading);
    pod.x += hx * speed * dt; pod.z += hz * speed * dt;
    if (!pod.heard && away < 60) { pod.heard = true; emit('dolphin-pass', pod.x, 0, pod.z, pod.bow ? 1 : .7); }
    let resting = 0;
    for (let i = 0; i < DOLPHINS; i++) {
      const d = pack[i];
      d.leap += clamp((!pod.leaving && pod.t > d.lead ? 1 : 0) - d.leap, -dt * .55, dt * .45);
      if (d.leap < .02 && pod.leaving) resting++;
      d.cycle += dt / d.period;
      const u = d.cycle - Math.floor(d.cycle), sink = (1 - d.leap) * .9 + pod.deep;
      let y, vy;
      // A leap and the dive that follows it meet at the surface with the same slope.
      if (u < .42) { const v = u / .42; y = Math.sin(Math.PI * v) * d.height * d.leap - sink; vy = Math.PI * Math.cos(Math.PI * v) * d.height * d.leap / (.42 * d.period); }
      else { const w = (u - .42) / .58, depth = d.height * 1.38 * (.4 + .6 * d.leap); y = -Math.sin(Math.PI * w) * depth - sink; vy = -Math.PI * Math.cos(Math.PI * w) * depth / (.58 * d.period); }
      const x = pod.x + hz * d.side + hx * d.back, z = pod.z - hx * d.side + hz * d.back, wave = waveHeight(x, z, time) * .6;
      const above = y > .12;
      if (above !== d.above) { d.above = above; if (away < 130 && env.eye.y > -6) splash(x + hx * (above ? .8 : 1.1), z + hz * (above ? .8 : 1.1), above ? .8 : 1.1, time); }
      pose(dolphins, i, x, y + wave, z, pod.heading, Math.atan2(vy, speed), pod.stage === 1 ? pod.turn * -.25 : 0, d.scale);
      dolphins.geometry.attributes.aLife.array[i * 4 + 2] = .35 + .4 * d.leap;
    }
    dolphins.instanceMatrix.needsUpdate = true; dolphins.geometry.attributes.aLife.needsUpdate = true;
    // Seen from below they dissolve into the haze; past it they are not drawn.
    dolphins.visible = !(env.underwater > .5 && away > env.range);
    if (resting === DOLPHINS) { pod.active = false; dolphins.visible = false; }
  }

  // --- Flying fish ----------------------------------------------------------
  const flock = { active: false, t: 0, ox: 0, oz: 0, dx: 0, dz: 0, end: 0 };
  const fliers = [];
  for (let i = 0; i < FLYERS; i++) fliers.push({ delay: 0, speed: 10, span: 2.6, lift: 1, off: 0, y: 0, stage: 0 });
  function startFlyingFish(env) {
    if (flock.active || env.storm > .5 || env.underwater > .5) return false;
    const sign = random() < .5 ? -1 : 1, fx = env.fwdX, fz = env.fwdZ, sx = fz * sign, sz = -fx * sign, ahead = rr(13, 21), lean = rr(-.3, .3);
    flock.ox = env.eye.x + fx * ahead - sx * rr(8, 11); flock.oz = env.eye.z + fz * ahead - sz * rr(8, 11);
    const lx = sx + fx * lean, lz = sz + fz * lean, length = Math.hypot(lx, lz);
    flock.dx = lx / length; flock.dz = lz / length; flock.t = 0; flock.end = 0; flock.active = true;
    for (const f of fliers) { f.delay = rr(0, .75); f.speed = rr(9, 11.5); f.span = rr(2.2, 3.1); f.lift = rr(.7, 1.25); f.off = rr(-3.2, 3.2); f.stage = 0; flock.end = Math.max(flock.end, f.delay + f.span + .2); }
    flyers.visible = true;
    emit('flying-fish', flock.ox, 0, flock.oz, .6);
    return true;
  }
  function updateFlyingFish(dt, time) {
    flock.t += dt;
    const life = flyers.geometry.attributes.aLife.array, yaw = Math.atan2(flock.dx, flock.dz);
    for (let i = 0; i < FLYERS; i++) {
      const f = fliers[i], t = flock.t - f.delay;
      if (t < 0 || t > f.span) { if (f.stage === 3) { f.stage = 4; splash(flock.ox + flock.dx * f.speed * f.span - flock.dz * f.off, flock.oz + flock.dz * f.speed * f.span + flock.dx * f.off, .5, time); } hide(flyers, i); continue; }
      const u = t / f.span, d = f.speed * t, x = flock.ox + flock.dx * d - flock.dz * f.off, z = flock.oz + flock.dz * d + flock.dx * f.off;
      // Two glides: the tail dips at the first touch and kicks the fish back into the air.
      const first = u < .56, v = first ? u / .56 : (u - .56) / .44, height = f.lift * (first ? 1 : .55), arc = Math.pow(Math.sin(Math.PI * v), .8) * height;
      const vy = (arc - f.y) / Math.max(dt, .001); f.y = arc;
      if (f.stage === 0) { f.stage = 1; splash(x, z, .55, time); } else if (f.stage === 1 && !first) { f.stage = 3; splash(x, z, .4, time); }
      pose(flyers, i, x, arc + waveHeight(x, z, time) + .06, z, yaw, clamp(Math.atan2(vy, f.speed), -.5, .5), Math.sin(t * 3 + i) * .3, .55);
      life[i * 4 + 1] = smoothstep(arc, .03, .2);
    }
    flyers.instanceMatrix.needsUpdate = true; flyers.geometry.attributes.aLife.needsUpdate = true;
    if (flock.t > flock.end) { flock.active = false; flyers.visible = false; }
  }

  // --- A turtle coming up for air ---------------------------------------------
  const breath = { active: false, t: 0, x: 0, z: 0, yaw: 0, puffed: false };
  function startTurtle(env) {
    if (breath.active || env.storm > .5 || env.underwater > .5) return false;
    const side = (random() < .5 ? -1 : 1) * rr(2, 7), ahead = rr(9, 14);
    breath.x = env.eye.x + env.fwdX * ahead + env.fwdZ * side; breath.z = env.eye.z + env.fwdZ * ahead - env.fwdX * side;
    if (Math.hypot(breath.x - env.focusX, breath.z - env.focusZ) < 4) { breath.x += env.fwdX * 5; breath.z += env.fwdZ * 5; }
    breath.yaw = random() * TAU; breath.t = 0; breath.puffed = false; breath.active = true; turtle.visible = true;
    return true;
  }
  function updateTurtle(dt, time) {
    breath.t += dt;
    const t = breath.t, up = smoothstep(t, 0, 1.7) * (1 - smoothstep(t, 6.2, 8.6)), wave = waveHeight(breath.x, breath.z, time);
    const y = lerp(-1.5, .02, up) + wave + Math.sin(t * 1.7) * .025;
    pose(turtle, 0, breath.x, y, breath.z, breath.yaw + t * .05, .12 + .3 * up, Math.sin(t * 1.1) * .05, 1.15);
    turtle.geometry.attributes.aLife.array[2] = .25 + .35 * (1 - up); turtle.geometry.attributes.aLife.needsUpdate = true; turtle.instanceMatrix.needsUpdate = true;
    if (!breath.puffed && t > 2) {
      breath.puffed = true;
      const hx = Math.sin(breath.yaw), hz = Math.cos(breath.yaw);
      for (let k = 0; k < 3; k++) spray.emit(8, breath.x + hx * .55, wave + .18, breath.z + hz * .55, hx * .4 + rr(-.2, .2), rr(.5, .9), hz * .4 + rr(-.2, .2), rr(.22, .34), rr(1, 1.5), random());
      splash(breath.x + hx * .5, breath.z + hz * .5, .35, time);
      emit('turtle-breath', breath.x, 0, breath.z, .5);
    }
    if (t > 8.8) { breath.active = false; turtle.visible = false; }
  }

  // --- A whale on the horizon ---------------------------------------------------
  const giant = { active: false, t: 0, x: 0, z: 0, heading: 0, blown: 0 };
  function startWhale(env) {
    if (giant.active || env.underwater > .5 || env.storm > .85) return false;
    const a = (random() < .5 ? -1 : 1) * rr(.15, .55), fx = env.fwdX, fz = env.fwdZ, sx = fz, sz = -fx, far = rr(110, 150);
    giant.x = env.eye.x + (fx * Math.cos(a) + sx * Math.sin(a)) * far; giant.z = env.eye.z + (fz * Math.cos(a) + sz * Math.sin(a)) * far;
    // Travelling across the view, so the flukes are seen side on.
    giant.heading = Math.atan2(sx, sz) + (random() < .5 ? 0 : Math.PI) + rr(-.4, .4);
    giant.t = 0; giant.blown = 0; giant.active = true; whale.visible = true;
    return true;
  }
  function blow(x, z, hx, hz, strength, time) {
    const bx = x + hx * 5.2, bz = z + hz * 5.2, y = waveHeight(bx, bz, time) + .4;
    for (let k = 0; k < 4; k++) spray.emit(8, bx + rr(-.3, .3), y, bz + rr(-.3, .3), rr(-.9, .9) + hx * .6, rr(5.2, 7.6) * strength, rr(-.9, .9) + hz * .6, rr(1.5, 2.5) * strength, rr(3.8, 5.4), random());
  }
  function updateWhale(dt, time) {
    giant.t += dt;
    const t = giant.t, hx = Math.sin(giant.heading), hz = Math.cos(giant.heading);
    giant.x += hx * 1.6 * dt; giant.z += hz * 1.6 * dt;
    // Two blows, each a second of vapour, then the back rolls and the flukes lift and slide under.
    while (giant.blown < 10 && t >= (giant.blown < 6 ? giant.blown * .14 : 5 + (giant.blown - 6) * .14)) {
      const strength = giant.blown < 6 ? 1 : .7;
      if (giant.blown === 0 || giant.blown === 6) emit('whale-blow', giant.x, 0, giant.z, strength);
      blow(giant.x, giant.z, hx, hz, strength, time); giant.blown++;
    }
    const lift = smoothstep(t, 7, 10.5), tilt = lerp(.1 + .05 * Math.sin(t * .9), 1.36, lift) + .14 * smoothstep(t, 10.5, 14);
    const depth = lerp(-3.2, -1.15, smoothstep(t, 0, 1.2)) + Math.sin(t * .9) * .12 * (1 - lift) - 2.3 * lift - 7.8 * smoothstep(t, 10.5, 14);
    pose(whale, 0, giant.x, depth, giant.z, giant.heading + Math.PI, tilt, 0, 1);
    whale.instanceMatrix.needsUpdate = true;
    if (t > 14.5) { giant.active = false; whale.visible = false; }
  }

  // --- Fry skittering out of the water: small, frequent, never an event -------------
  let nextFry = 5;
  function fry(env, time) {
    const a = rr(-.9, .9), far = rr(6, 19), fx = env.fwdX, fz = env.fwdZ, sx = fz, sz = -fx;
    const x = env.eye.x + (fx * Math.cos(a) + sx * Math.sin(a)) * far, z = env.eye.z + (fz * Math.cos(a) + sz * Math.sin(a)) * far, y = waveHeight(x, z, time) + .03;
    const heading = random() * TAU, hx = Math.cos(heading), hz = Math.sin(heading), n = economy ? 6 : 11;
    for (let k = 0; k < n; k++) spray.emit(10, x + rr(-.5, .5), y, z + rr(-.5, .5), hx * rr(1.2, 2.6) + rr(-.3, .3), rr(1.3, 2.4), hz * rr(1.2, 2.6) + rr(-.3, .3), rr(.045, .07), rr(.4, .62), random());
    for (let k = 0; k < 3; k++) spray.emit(7, x + rr(-.4, .4), y, z + rr(-.4, .4), rr(-.4, .4), rr(.8, 1.4), rr(-.4, .4), .06, .5, random());
  }

  function update(dt, time, env) {
    // The breeze carries vapour; the scene's wind is 0.18 on a calm day.
    spray.uniforms.uCurrent.value.set(1.2 + env.wind * 3, 0, .5 + env.wind);
    if (dt > 0) {
      if (pod.active) updateDolphins(dt, time, env);
      if (flock.active) updateFlyingFish(dt, time);
      if (breath.active) updateTurtle(dt, time);
      if (giant.active) updateWhale(dt, time);
      if (env.underwater < .5 && env.storm < .4 && (nextFry -= dt) <= 0) { nextFry = rr(7, 15) * (1 + env.night); fry(env, time); }
    }
    spray.flush();
    spray.points.visible = spray.busy && env.eye.y > -8;
    root.visible = pod.active || flock.active || breath.active || giant.active || spray.points.visible;
  }
  function rest() { root.visible = false; }
  function trigger(type, env, options) {
    if (type === 'dolphin-pass') return startDolphins(env, options);
    if (type === 'dolphin-overhead') return startDolphins(env, { overhead: true });
    if (type === 'flying-fish') return startFlyingFish(env);
    if (type === 'turtle-breath') return startTurtle(env);
    if (type === 'whale-blow') return startWhale(env);
    return false;
  }
  const triangles = mesh => mesh.userData.triangles * mesh.count;
  return {
    root, update, rest, trigger, spray,
    get active() { return pod.active || flock.active || breath.active || giant.active; },
    get busy() { return pod.active || flock.active || breath.active || giant.active || spray.busy; },
    state: { pod, pack, flock, fliers, breath, giant },
    meshes: { dolphins, flyers, turtle, whale },
    counts: { dolphins: DOLPHINS, flyingFish: FLYERS, drawCalls: 5, triangles: triangles(dolphins) + triangles(flyers) + triangles(turtle) + triangles(whale) }
  };
}
