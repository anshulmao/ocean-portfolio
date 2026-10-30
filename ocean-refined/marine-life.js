import * as THREE from './vendor/three.module.min.js';
import { fishNavigator } from './fish-navigation.js';
import { SCHOOL_SPECIES, schoolMesh, loadSchoolLooks } from './school-fish.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const { clamp } = THREE.MathUtils;
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

// Who lives where. Each habitat is one of three roles, and the role and the depth of the seabed under it pick the
// species: fusiliers stream over the reef at every depth, powder blue tangs graze the shallow and middle reef (the
// deep slope's grazers are more fusiliers), and the residents that hold close to the coral are sergeant majors in the
// shallows and anthias down the slope. Four species, one draw call each. The reef's total stays within what it was
// (478 fish, 231 in economy detail, against 490 and 245); the fusiliers' schools are the big ones.
const ROLES = {
  open: { count: [14, 7], species: () => 'fusilier' },
  grazer: { count: [8, 4], species: floor => floor > -32 ? 'powder-blue-tang' : 'fusilier' },
  resident: { count: [7, 3], species: floor => floor > -22 ? 'sergeant-major' : 'anthias' }
};
// The size of a fish of each species, as a share of its site length (creature-species.js), so the schools stay about a
// metre long, as they were.
const SCALE = { fusilier: .68, 'powder-blue-tang': .78, 'sergeant-major': .86, anthias: 1 };

// How the swim stroke follows the fish (see school-fish.js for the wave itself). A fish moves about 0.62 of its length
// a beat, so the beat rate is its speed in lengths a second over that, never slower than a hovering flutter. The stroke
// widens with speed and in a burst. A turn bends the body along the arc it swims and banks it into the turn.
const STRIDE = .62, HOVER_HZ = .8, MAX_HZ = 5.2;

export function createMarineLife(options) { const steps = marineLifeSteps(options); let step; while (!(step = steps.next()).done); return step.value; }
// The same build, pausing (yielding) between its parts so the page can do it between frames.
export function* marineLifeSteps({ economy = false, terrainHeightAt = () => -54, collisions = null, debug = false } = {}) {
  const root = new THREE.Group(); root.name = 'Schooling reef fish';
  const random = seededRandom(906);
  // Forty-nine small habitats keep neighbor work local. The outer row lives
  // beyond the swim boundary so the reef continues into the haze.
  const schools = [];
  for (let row = 0; row < 7; row++) for (let column = 0; column < 7; column++) {
    const index = row * 7 + column;
    const x = [-73, -49, -25, 0, 25, 49, 73][column];
    const z = row===2&&column===3 ? -12 : [43, 20, -3, -26, -51, -78, -116][row] + (column % 2 ? -1 : 1);
    const role = ['open', 'grazer', 'resident'][index % 3];
    const resident = role === 'resident';
    const floor = terrainHeightAt(x, z);
    const clearance = Math.max(resident ? 3.1 : 4.5 + index % 3 * .8, (resident ? -53 : -49) - floor);
    const center = new THREE.Vector3(x, Math.min(-2.5, floor + clearance), z);
    schools.push({ center, role, species: ROLES[role].species(floor),
      count: ROLES[role].count[economy ? 1 : 0], resident, clearance,
      spread: resident ? 2.3 : 4.4, radius: resident ? 3.4 : 7.5, members: [],
      fear: 0, away: new THREE.Vector3(), travel: new THREE.Vector3(), target: center.clone(),
      near: true, shown: true, dt: 0, last: 1, idle: 0, wake: 0 });
  }
  const count = schools.reduce((sum, school) => sum + school.count, 0);
  const capacity = {};
  for (const school of schools) capacity[school.species] = (capacity[school.species] || 0) + school.count;
  // One mesh a species (school-fish.js). They draw nothing until loadLooks() has given them their shape and skin.
  const looks = {}, meshes = [];
  for (const id of Object.keys(capacity)) {
    yield;
    const look = looks[id] = schoolMesh(id, capacity[id]);
    look.drawn = 0; root.add(look.mesh); meshes.push(look.mesh);
  }

  yield;
  const fish = [];
  for (let school = 0; school < schools.length; school++) {
    const habitat = schools[school], length = SCHOOL_SPECIES[habitat.species].length;
    for (let member = 0; member < habitat.count; member++) {
      const angle = random() * TAU, radial = Math.sqrt(random()) * habitat.spread;
      const scale = SCALE[habitat.species] * (.88 + random() * .24);
      const f = {
        position: habitat.center.clone().add(new THREE.Vector3(Math.cos(angle) * radial, (random() - .5) * 1.5, Math.sin(angle) * radial)),
        velocity: new THREE.Vector3(.65 + random() * .35, (random() - .5) * .08, (random() - .5) * .2),
        acceleration: new THREE.Vector3(), school, species: habitat.species, fear: 0,
        side: Math.cos(angle) >= 0 ? 1 : -1,
        // size is the fish's length in metres (scale times its species' length).
        scale, size: scale * length,
        // The stroke: phase (radians), beat rate (Hz), amplitude; the bend of the body (1/m, model metres) and its bank.
        phase: random() * TAU, beat: 1, amp: .6, bend: 0, roll: 0,
        // Where it was before its last step, to draw it between the two.
        px: 0, py: 0, pz: 0, pyaw: 0, ppitch: 0,
        // As last drawn: x, y, z, yaw, pitch.
        pose: new Float64Array(5)
      };
      f.position.y = Math.max(f.position.y, terrainHeightAt(f.position.x, f.position.z) + 1.7);
      fish.push(f); habitat.members.push(f);
    }
  }

  // Fish only need the seabed to within a hand's width. A 2 m height grid
  // replaces two analytic terrain evaluations per fish per step.
  yield;
  const GRID_X = -86, GRID_Z = -130, GRID_STEP = 2, GRID_W = 87, GRID_H = 95, floorGrid = new Float32Array(GRID_W * GRID_H);
  for (let gz = 0; gz < GRID_H; gz++) for (let gx = 0; gx < GRID_W; gx++) floorGrid[gz * GRID_W + gx] = terrainHeightAt(GRID_X + gx * GRID_STEP, GRID_Z + gz * GRID_STEP);
  for (const { box } of collisions?.boxes || []) {
    const x0 = Math.max(0, Math.floor((box.min.x - GRID_X) / GRID_STEP)), x1 = Math.min(GRID_W - 1, Math.ceil((box.max.x - GRID_X) / GRID_STEP));
    const z0 = Math.max(0, Math.floor((box.min.z - GRID_Z) / GRID_STEP)), z1 = Math.min(GRID_H - 1, Math.ceil((box.max.z - GRID_Z) / GRID_STEP));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) floorGrid[z * GRID_W + x] = Math.max(floorGrid[z * GRID_W + x], box.max.y);
  }
  function floorAt(x, z) {
    const fx = Math.min(Math.max((x - GRID_X) / GRID_STEP, 0), GRID_W - 1.001), fz = Math.min(Math.max((z - GRID_Z) / GRID_STEP, 0), GRID_H - 1.001);
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * GRID_W + ix;
    return (floorGrid[i] * (1 - tx) + floorGrid[i + 1] * tx) * (1 - tz) + (floorGrid[i + GRID_W] * (1 - tx) + floorGrid[i + GRID_W + 1] * tx) * tz;
  }
  const navigation = fishNavigator(floorAt), swimTarget = { x: 0, y: 0, z: 0 };
  for (const f of fish) {
    const { x, z } = f.position, r = f.size * .3;
    const startFloor = Math.max(floorAt(x, z), floorAt(x - r, z - r), floorAt(x - r, z + r), floorAt(x + r, z - r), floorAt(x + r, z + r));
    f.position.y = Math.max(f.position.y, startFloor + 1.95);
    f.nav = navigation.create(f.position.x, f.position.y, f.position.z, Math.atan2(f.velocity.x, f.velocity.z));
    f.navOptions = { speed: 1, clearance: 1.7, radius: f.size * .3, ceiling: -1.6, turnRate: 1.3 };
    f.px = f.nav.x; f.py = f.nav.y; f.pz = f.nav.z; f.pyaw = f.nav.yaw; f.ppitch = f.nav.pitch;
  }

  const matrix = new THREE.Matrix4(), orientation = new THREE.Quaternion(), turn = new THREE.Euler(0, 0, 0, 'YXZ');
  const scale3 = new THREE.Vector3(), bounds3 = new THREE.Sphere();
  const offset = new THREE.Vector3(), steering = new THREE.Vector3();
  const swimmerPrevious = new THREE.Vector3(), swimmerVelocity = new THREE.Vector3();
  const swimmerAhead = new THREE.Vector3(), swimmerSegment = new THREE.Vector3(), closest = new THREE.Vector3();
  const tangent = new THREE.Vector3(), avoidance = new THREE.Vector3();
  // rest: time gathered toward the next fixed step; clock: the time of the last one (the schools keep their own).
  let hadSwimmer = false, frame = 0, nudges = 0, rest = 0, clock = 0;
  const at = new THREE.Vector3();
  const bounds = { x: [-84, 84], y: [-85, -1.6], z: [-128, 56] }, EDGE = 7;
  // Beyond this distance from the diver a school cannot feel them (its
  // members stay within ~20 m of the roaming target; avoidance reaches 13 m).
  const NEAR_SQ = 40 * 40, FINE_STEP = economy ? 1 / 30 : 1 / 60;

  // The stroke follows the fish: its beat from its speed, its bend and bank from its turn. dt is the frame's own time,
  // so the beat is the same at 30, 60 or 120 frames a second, and stands still when the world is paused (dt 0).
  function stroke(f, dt) {
    const n = f.nav, flat = Math.hypot(n.vx, n.vz), speed = Math.hypot(flat, n.vy), lengths = speed / f.size;
    const beat = clamp(lengths / STRIDE, HOVER_HZ, MAX_HZ);
    const amp = clamp(.42 + .32 * lengths, .42, 1.15) + f.fear * .18;
    // Curvature of the path (1/m) in the model's own metres; at most 1/length, which moves the tail an eighth of a length.
    const rate = n.yawRate ?? 0, reach = 1 / SCHOOL_SPECIES[f.species].length;
    const bend = clamp(rate / Math.max(flat, .35) * f.scale, -reach, reach);
    const roll = clamp(-.2 * rate * Math.max(flat, .4), -.42, .42);
    const k = ease(dt, 5);
    f.beat += (beat - f.beat) * k; f.amp += (amp - f.amp) * k; f.bend += (bend - f.bend) * ease(dt, 7); f.roll += (roll - f.roll) * ease(dt, 4);
    f.phase = (f.phase + TAU * f.beat * dt) % TAU;
  }

  // view: { frustum, eye, range }. Only schools in view and within the haze
  // are written, packed to the front of each mesh, so the instance count (and
  // the vertex work) follows what can be seen rather than the whole reef.
  function draw(dt, view) {
    for (const id in looks) looks[id].drawn = 0;
    for (let s = 0; s < schools.length; s++) {
      const home = schools[s], members = home.members, look = looks[home.species];
      home.shown = true;
      if (view) {
        let cx = 0, cy = 0, cz = 0, reach = 0;
        for (let m = 0; m < members.length; m++) { const p = members[m].position; cx += p.x; cy += p.y; cz += p.z; }
        bounds3.center.set(cx / members.length, cy / members.length, cz / members.length);
        for (let m = 0; m < members.length; m++) reach = Math.max(reach, bounds3.center.distanceToSquared(members[m].position));
        bounds3.radius = Math.sqrt(reach) + 1.2;
        // A metre-long fish is lost in the haze well before the range itself.
        home.shown = view.eye.distanceTo(bounds3.center) - bounds3.radius < view.range * .75 && view.frustum.intersectsSphere(bounds3);
      }
      if (!home.shown) continue;
      // A school is drawn between its last two steps, by the time gathered since the last one (one step behind).
      const k = Math.min(1, rest / home.last), mesh = look.mesh, swim = look.swim.array;
      for (let m = 0; m < members.length; m++) {
        const f = members[m], n = f.nav, pose = f.pose;
        stroke(f, dt);
        pose[0] = f.px + (n.x - f.px) * k; pose[1] = f.py + (n.y - f.py) * k; pose[2] = f.pz + (n.z - f.pz) * k;
        // Face along the navigator's eased yaw and pitch, not the raw velocity: the velocity is zero whenever a fish
        // pauses at a wall, and normalising it would turn the fish to face +X for that frame.
        pose[3] = f.pyaw + Math.atan2(Math.sin(n.yaw - f.pyaw), Math.cos(n.yaw - f.pyaw)) * k; pose[4] = f.ppitch + (n.pitch - f.ppitch) * k;
        if (!look.ready) continue;
        const slot = look.drawn++;
        turn.set(-pose[4], pose[3], f.roll, 'YXZ');
        matrix.compose(at.fromArray(pose), orientation.setFromEuler(turn), scale3.setScalar(f.scale));
        mesh.setMatrixAt(slot, matrix);
        swim[slot * 3] = f.phase; swim[slot * 3 + 1] = f.amp; swim[slot * 3 + 2] = f.bend;
      }
    }
    for (const id in looks) {
      const look = looks[id], mesh = look.mesh;
      mesh.count = look.drawn;
      // Until its look has loaded a mesh stays in the scene drawing nothing, so the world can compile its program.
      mesh.visible = !look.ready || look.drawn > 0;
      if (look.drawn) { mesh.instanceMatrix.needsUpdate = true; look.swim.needsUpdate = true; }
    }
  }

  // elapsed is not used: the schools keep their own clock, which a paused world (dt 0) stops.
  function update(dt, elapsed, swimmerPosition, view = null) {
    const frameDelta = Math.min(Math.max(dt || 0, 0), .1);
    // Schools near the diver take a fixed step, whatever the frame rate: time gathers toward the next step and the
    // fish are drawn between their last two (draw), so 30, 60 and 120 frames a second swim the same course. Economy
    // detail draws 30 frames a second and steps a thirtieth (one step a frame drawn); otherwise a sixtieth. The
    // diver's swept clearance is tested on every step either way.
    rest += frameDelta;
    const steps = Math.min(Math.floor(rest / FINE_STEP + 1e-6), Math.ceil(.1 / FINE_STEP - 1e-6));
    rest = Math.min(Math.max(rest - steps * FINE_STEP, 0), FINE_STEP * .999);
    const hasSwimmer = !!swimmerPosition?.isVector3;
    if (hasSwimmer) {
      swimmerVelocity.set(0, 0, 0);
      if (hadSwimmer && frameDelta > 0) swimmerVelocity.subVectors(swimmerPosition, swimmerPrevious).divideScalar(frameDelta).clampLength(0, 12);
      swimmerAhead.copy(swimmerPosition).addScaledVector(swimmerVelocity, .55);
      swimmerSegment.copy(swimmerVelocity).multiplyScalar(-frameDelta);
    }
    // Schools near the diver keep the fine fixed step, so parting around them is unchanged. A distant school takes
    // one step a frame that steps, of the time gathered since its last; one that is also out of sight, every fourth.
    if (steps > 0) frame++;
    for (let index = 0; index < schools.length; index++) {
      const home = schools[index];
      home.near = !hasSwimmer || home.target.distanceToSquared(swimmerPosition) < NEAR_SQ;
      home.wake = 0; home.idle = home.near ? 0 : home.idle + frameDelta;
      if (steps > 0 && !home.near && (home.shown || (frame + index) % 4 === 0)) { home.wake = Math.min(home.idle, .1); home.idle = 0; }
    }
    if (steps > 0) {
      for (let substep = 0; substep < steps; substep++) {
        const last = substep === steps - 1;
        for (let index = 0; index < schools.length; index++) {
          const home = schools[index], h = home.near ? FINE_STEP : last ? home.wake : 0;
          home.dt = h;
          if (!h) continue;
          home.last = h;
          const drift = (clock + FINE_STEP * (home.near ? substep + 1 : steps)) * (home.resident ? .16 : .095) + index * 1.35;
          const roam = home.resident ? 1.2 : 9;
          home.target.set(home.center.x + Math.sin(drift) * roam, home.center.y, home.center.z + Math.cos(drift) * roam * .75);
          home.target.y = Math.min(-2.5, terrainHeightAt(home.target.x, home.target.z) + home.clearance + Math.sin(drift * .72) * .35);
          home.travel.set(Math.cos(drift), 0, -Math.sin(drift) * .75).normalize();
          let pressure = 0;
          if (hasSwimmer) {
            offset.subVectors(home.target, swimmerAhead);
            pressure = 1 - THREE.MathUtils.smoothstep(offset.length(), 4, 13);
            if (offset.lengthSq() > .001) home.away.lerp(offset.normalize(), 1 - Math.exp(-h * 4));
          }
          home.fear += (pressure - home.fear) * (1 - Math.exp(-h * (pressure > home.fear ? 5 : .55)));
          home.target.addScaledVector(home.away, home.fear * 4.5);
        }
        // Compute forces from the previous state before integrating any fish.
        for (let i = 0; i < fish.length; i++) {
          const f = fish[i], home = schools[f.school], h = home.dt;
          if (!h) continue;
          const p = f.position, v = f.velocity, a = f.acceleration, members = home.members;
          let cx = 0, cy = 0, cz = 0, ax = 0, ay = 0, az = 0, sx = 0, sy = 0, sz = 0, neighbors = 0;
          for (let m = 0; m < members.length; m++) {
            const other = members[m];
            if (other === f) continue;
            const q = other.position, dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, distanceSq = dx * dx + dy * dy + dz * dz;
            if (distanceSq < 22) {
              const w = other.velocity;
              cx += q.x; cy += q.y; cz += q.z; ax += w.x; ay += w.y; az += w.z; neighbors++;
              if (distanceSq < 1.1 && distanceSq > .0001) { const push = -1 / distanceSq; sx += dx * push; sy += dy * push; sz += dz * push; }
            }
          }
          a.set(sx * .95, sy * .95, sz * .95);
          if (neighbors) {
            const inverse = 1 / neighbors;
            a.x += (cx * inverse - p.x) * .11; a.y += (cy * inverse - p.y) * .11; a.z += (cz * inverse - p.z) * .11;
            a.x += (ax * inverse - v.x) * .65; a.y += (ay * inverse - v.y) * .65; a.z += (az * inverse - v.z) * .65;
          }
          steering.subVectors(home.target, p).multiplyScalar(home.resident ? .3 : .16);
          a.add(steering).addScaledVector(home.travel, home.resident ? .08 : .24);
          const margin = home.radius + home.fear * 3;
          offset.subVectors(p, home.target); offset.y = 0;
          const radialDistance = offset.length();
          if (radialDistance > margin) a.addScaledVector(offset.normalize(), -Math.min(1, (radialDistance - margin) * .18));
          // The edge of the world turns a fish in good time, instead of the clamp below sliding it along the wall.
          if (p.x < bounds.x[0] + EDGE) a.x += (bounds.x[0] + EDGE - p.x) * .5; else if (p.x > bounds.x[1] - EDGE) a.x -= (p.x - bounds.x[1] + EDGE) * .5;
          if (p.z < bounds.z[0] + EDGE) a.z += (bounds.z[0] + EDGE - p.z) * .5; else if (p.z > bounds.z[1] - EDGE) a.z -= (p.z - bounds.z[1] + EDGE) * .5;
          let pressure = 0;
          if (hasSwimmer && home.near) {
            offset.subVectors(p, swimmerAhead);
            pressure = 1 - THREE.MathUtils.smoothstep(offset.length(), 2.6, 8.5);
            // Each member keeps its side of the approach, producing two coherent
            // arcs around the diver instead of a radial explosion through it.
            tangent.copy(swimmerVelocity);
            if (tangent.lengthSq() < .1) tangent.copy(home.travel);
            tangent.cross(UP).normalize().multiplyScalar(f.side);
            avoidance.copy(offset);
            if (avoidance.lengthSq() < .001) avoidance.copy(tangent);
            avoidance.normalize().multiplyScalar(3.8).addScaledVector(tangent, 3.1);
            a.addScaledVector(avoidance, pressure);
            offset.subVectors(p, swimmerPosition);
            const distance = offset.length();
            if (distance < 4.2) {
              if (distance < .001) offset.copy(tangent);
              a.addScaledVector(offset.normalize(), (1 - Math.min(distance / 4.2, 1)) * 7);
            }
          }
          f.fear += (Math.max(pressure, home.fear * .7) - f.fear) * (1 - Math.exp(-h * (pressure > f.fear ? 8 : .8)));
          const floor = floorAt(p.x, p.z) + 2.35;
          if (p.y < floor) a.y += (floor - p.y) * .65;
          a.clampLength(0, 1.5 + f.fear * 7);
        }
        for (let i = 0; i < fish.length; i++) {
          const f = fish[i], home = schools[f.school], h = home.dt;
          if (!h) continue;
          const p = f.position, v = f.velocity;
          f.px = p.x; f.py = p.y; f.pz = p.z; f.pyaw = f.nav.yaw; f.ppitch = f.nav.pitch;
          v.addScaledVector(f.acceleration, h);
          const speed = v.length();
          const minSpeed = home.resident ? .24 : .85;
          const maxSpeed = (home.resident ? 1 : 1.9) + f.fear * 2.5;
          if (speed < .00001) v.copy(home.travel).multiplyScalar(minSpeed);
          else if (speed < minSpeed) v.setLength(minSpeed);
          else if (speed > maxSpeed) v.setLength(maxSpeed);
          // Flocking supplies the desired direction; cached look-ahead steering supplies a swimmable route. The fish
          // always travels the way it faces (the navigator moves it along its own heading), and a frightened fish
          // turns faster: the burst is a quick turn away and a sprint, not a slide.
          swimTarget.x = p.x + v.x * 3; swimTarget.y = p.y + v.y; swimTarget.z = p.z + v.z * 3;
          const nav = f.nav; nav.x = p.x; nav.y = p.y; nav.z = p.z;
          f.navOptions.speed = Math.hypot(v.x, v.z); f.navOptions.turnRate = 1.3 + f.fear * 2.6;
          navigation.step(nav, swimTarget, h, f.navOptions);
          p.set(nav.x, nav.y, nav.z); v.set(nav.vx, nav.vy, nav.vz);
          if (hasSwimmer && home.near) {
            // Swept-body clearance catches an advancing diver between frames: the last resort, rarely reached.
            closest.copy(swimmerPosition);
            const segmentLengthSq = swimmerSegment.lengthSq();
            if (segmentLengthSq > .00001) {
              offset.subVectors(p, swimmerPosition);
              closest.addScaledVector(swimmerSegment, THREE.MathUtils.clamp(offset.dot(swimmerSegment) / segmentLengthSq, 0, 1));
            }
            offset.subVectors(p, closest);
            const clearance = 1.65 + f.size * .45, distance = offset.length();
            if (distance < clearance) {
              if (distance < .0001) offset.copy(home.travel).cross(UP).multiplyScalar(f.side);
              offset.normalize();
              p.copy(closest).addScaledVector(offset, clearance);
              const inwardSpeed = v.dot(offset);
              if (inwardSpeed < 0) v.addScaledVector(offset, -inwardSpeed);
              nudges++;
            }
          }
          if (p.x < bounds.x[0] || p.x > bounds.x[1]) { p.x = THREE.MathUtils.clamp(p.x, bounds.x[0], bounds.x[1]); v.x *= -.45; }
          if (p.y < bounds.y[0] || p.y > bounds.y[1]) { p.y = THREE.MathUtils.clamp(p.y, bounds.y[0], bounds.y[1]); v.y *= -.45; }
          if (p.z < bounds.z[0] || p.z > bounds.z[1]) { p.z = THREE.MathUtils.clamp(p.z, bounds.z[0], bounds.z[1]); v.z *= -.45; }
        }
      }
    }
    clock += steps * FINE_STEP;
    if (hasSwimmer) swimmerPrevious.copy(swimmerPosition);
    hadSwimmer = hasSwimmer;
    draw(frameDelta, view);
  }

  // Shapes and skins for the schools (school-fish.js), asked for by the world once the first dive's own files are in.
  let loading = null;
  const looksState = root.userData.looks = { ready: false, loaded: [], failed: [] };
  function loadLooks() {
    return loading ??= loadSchoolLooks(Object.values(looks), { lod: economy ? 2 : 1 }).then(result => {
      Object.assign(looksState, result, { ready: true });
      return looksState;
    });
  }

  update(0, 0);
  const api = { root, update, loadLooks, looks: looksState, count, schoolCount: schools.length, drawCalls: meshes.length, species: { ...capacity } };
  if (debug) api.inspect = () => ({
    nudges,
    schools: schools.map(s => ({ center: s.center.toArray(), target: s.target.toArray(), resident: s.resident, species: s.species, count: s.count, fear: s.fear, near: s.near, shown: s.shown })),
    fish: fish.map(f => ({ position: f.position.toArray(), velocity: f.velocity.toArray(), yaw: f.nav.yaw, pitch: f.nav.pitch, roll: f.roll, drawn: [...f.pose], school: f.school, size: f.size, fear: f.fear, phase: f.phase, beat: f.beat, amp: f.amp, bend: f.bend }))
  });
  return api;
}
