import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { fishNavigator } from './fish-navigation.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function bodyGeometry(kind, economy) {
  const profile = kind === 'clown'
    ? [[-.72,.018,.018],[-.58,.095,.075],[-.38,.18,.13],[-.05,.235,.17],[.25,.205,.145],[.48,.13,.1],[.61,.07,.06],[.68,.008,.008]]
    : kind === 'tang'
      ? [[-.72,.012,.012],[-.56,.12,.07],[-.35,.205,.115],[-.04,.245,.145],[.25,.20,.12],[.47,.12,.075],[.60,.055,.042],[.68,.006,.006]]
      : [[-.72,.01,.01],[-.56,.08,.052],[-.34,.145,.09],[-.04,.18,.105],[.26,.15,.09],[.49,.09,.06],[.61,.045,.03],[.68,.005,.005]];
  const radialSegments = 10;
  const positions = [], indices = [];
  profile.forEach(([x, ry, rz]) => {
    for (let j = 0; j <= radialSegments; j++) {
      const angle = j / radialSegments * TAU;
      positions.push(x, Math.cos(angle) * ry, Math.sin(angle) * rz);
    }
  });
  const ring = radialSegments + 1;
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * ring + j, b = a + ring;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function finGeometry(kind) {
  const shape = new THREE.Shape();
  if (kind === 'tail') {
    shape.moveTo(0, 0); shape.quadraticCurveTo(-.21, .12, -.48, .28);
    shape.quadraticCurveTo(-.40, .03, -.46, 0);
    shape.quadraticCurveTo(-.40, -.03, -.48, -.28);
    shape.quadraticCurveTo(-.21, -.12, 0, 0);
  } else if (kind === 'dorsal') {
    shape.moveTo(-.37, .15); shape.quadraticCurveTo(-.12, .34, .22, .16);
    shape.quadraticCurveTo(.04, .13, -.21, .12);
  } else {
    shape.moveTo(-.18, -.015); shape.quadraticCurveTo(.01, -.22, .25, -.14);
    shape.quadraticCurveTo(.12, -.015, -.18, -.015);
  }
  const geometry = new THREE.ShapeGeometry(shape, kind === 'tail' ? 6 : 4);
  geometry.computeVertexNormals();
  return geometry;
}

// Every body flexes from the shoulders back, faster as the fish travels, so
// a school reads as swimming rather than sliding. Patterns are painted in the
// shader: a pale lateral line, clownfish bands, and a tang's mask and tail.
function bodyMaterial(type) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: type === 'silver' ? .34 : .42, metalness: type === 'silver' ? .1 : 0, side: THREE.DoubleSide });
  const pattern = type === 'silver'
    ? `float lateralStripe = 1.0 - smoothstep(0.018, 0.055, abs(vFishY - 0.035));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.95, 0.94), lateralStripe * 0.55);
diffuseColor.rgb *= mix(.72, 1.0, smoothstep(-.02, .09, -vFishY + .06));`
    : type === 'clown'
      ? `float bandDistance = min(abs(vFishX + 0.38), min(abs(vFishX - 0.015), abs(vFishX - 0.36)));
float bandEdge = 1.0 - smoothstep(0.05, 0.082, bandDistance);
float bandWhite = 1.0 - smoothstep(0.025, 0.043, bandDistance);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.20, 0.21), bandEdge * 0.84);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.96, 0.88), bandWhite);`
      : `float mask = 1.0 - smoothstep(0.03, 0.07, abs(vFishX - 0.4 + vFishY * .5));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.13, 0.24), mask * .8);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.98, 0.83, 0.33), 1.0 - smoothstep(-0.52, -0.40, vFishX));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.12, 0.25), (1.0 - smoothstep(0.012, 0.04, abs(abs(vFishY) - 0.2))) * .45);`;
  mat.onBeforeCompile = shader => {
    shader.uniforms.uSwimTime = swimTime;
    shader.vertexShader = `uniform float uSwimTime;
varying float vFishX;
varying float vFishY;
${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFishX = position.x; vFishY = position.y;
#ifdef USE_INSTANCING
float swimPhase = dot(instanceMatrix[3].xyz, vec3(3.1, 1.7, 2.3));
transformed.z += sin(position.x * 4.2 - uSwimTime * 5.5 + swimPhase) * .085 * (1.0 - smoothstep(-.72, .45, position.x));
#endif`);
    shader.fragmentShader = `varying float vFishX;
varying float vFishY;
${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
${pattern}`);
  };
  mat.customProgramCacheKey = () => `marine-fish-body-${type}-v2`;
  return mat;
}
const swimTime = { value: 0 };

// The dorsal fin, pectoral fin and both eyes ride on the body transform, so
// they are one mesh with painted eyes: one matrix per fish instead of four.
function trimGeometry() {
  const paint = (geometry, hex) => {
    const color = new THREE.Color(hex), count = geometry.getAttribute('position').count, data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(data, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
    return geometry;
  };
  const parts = [paint(finGeometry('dorsal'), '#ffffff'), paint(finGeometry('pectoral').translate(-.02, -.02, .12), '#ffffff'),
    paint(new THREE.SphereGeometry(.022, 4, 2).translate(.37, .045, -.087), '#102a35'),
    paint(new THREE.SphereGeometry(.022, 4, 2).translate(.37, .045, .087), '#102a35')];
  const geometry = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  return geometry;
}

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
    const type = ['silver', 'tang', 'clown'][index % 3];
    const resident = type === 'clown';
    const floor = terrainHeightAt(x, z);
    const clearance = Math.max(resident ? 3.1 : 4.5 + index % 3 * .8, (resident ? -53 : -49) - floor);
    const center = new THREE.Vector3(x, Math.min(-2.5, floor + clearance), z);
    schools.push({ center, color: type,
      count: economy ? 5 : 10, resident, clearance,
      spread: resident ? 2.3 : 4.4, radius: resident ? 3.4 : 7.5, members: [],
      fear: 0, away: new THREE.Vector3(), travel: new THREE.Vector3(), target: center.clone(),
      near: true, shown: true, dt: 0, idle: 0, wake: 0 });
  }
  const count = schools.reduce((sum, school) => sum + school.count, 0);
  const familyCounts = { silver: 0, tang: 0, clown: 0 };
  schools.forEach(school => { familyCounts[school.color] += school.count; });
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .48, metalness: 0, side: THREE.DoubleSide, ...options });
  const palettes = {
    silver: ['#c4dfe2', '#dcebe6', '#a2c9d6'],
    tang: ['#3f8fd6', '#55a8e0', '#3a74c4'],
    clown: ['#ff8a4a', '#ffa25a', '#f2783f']
  };
  // Five draw calls for every fish on the reef: a body mesh per species, one
  // mesh of tails and one of fins and eyes shared by all of them.
  const families = {}, meshes = [], white = new THREE.Color('#ffffff');
  const moving = (mesh, name) => {
    mesh.name = name; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Schools are culled one by one in draw(); the mesh itself spans the reef.
    for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, white);
    mesh.frustumCulled = false; root.add(mesh); meshes.push(mesh); return mesh;
  };
  for (const type of Object.keys(familyCounts)) {
    yield;
    families[type] = { bodies: moving(new THREE.InstancedMesh(bodyGeometry(type, economy), bodyMaterial(type), familyCounts[type]), `${type} fish bodies`), drawn: 0 };
  }
  yield;
  const tails = moving(new THREE.InstancedMesh(finGeometry('tail'), material('#ffffff', { roughness: .52 }), count), 'Fish tails');
  const trim = moving(new THREE.InstancedMesh(trimGeometry(), material('#ffffff', { roughness: .52, vertexColors: true }), count), 'Fish fins and eyes');

  yield;
  const fish = [];
  for (let school = 0; school < schools.length; school++) {
    const habitat = schools[school];
    for (let member = 0; member < habitat.count; member++) {
      const angle = random() * TAU, radial = Math.sqrt(random()) * habitat.spread;
      const f = {
        position: habitat.center.clone().add(new THREE.Vector3(Math.cos(angle) * radial, (random() - .5) * 1.5, Math.sin(angle) * radial)),
        velocity: new THREE.Vector3(.65 + random() * .35, (random() - .5) * .08, (random() - .5) * .2),
        acceleration: new THREE.Vector3(), school, type: habitat.color, fear: 0,
        side: Math.cos(angle) >= 0 ? 1 : -1,
        size: (habitat.color === 'silver' ? .64 : habitat.color === 'clown' ? .55 : .84) * (.88 + random() * .24) * (.9 + school % 4 * .1),
        phase: random() * TAU,
        tint: palettes[habitat.color][Math.floor(random() * palettes[habitat.color].length)]
      };
      f.position.y = Math.max(f.position.y, terrainHeightAt(f.position.x, f.position.z) + 1.7);
      fish.push(f); habitat.members.push(f);
      f.bodyColor = new THREE.Color(f.tint);
      f.tailColor = habitat.color === 'tang'
        ? new THREE.Color('#e6c66f').offsetHSL((random() - .5) * .015, 0, (random() - .5) * .05)
        : f.bodyColor.clone().multiplyScalar(.84);
      f.trimColor = f.bodyColor.clone().multiplyScalar(.81);
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
    const { x, z } = f.position, r = f.size * .45;
    const startFloor = Math.max(floorAt(x, z), floorAt(x - r, z - r), floorAt(x - r, z + r), floorAt(x + r, z - r), floorAt(x + r, z + r));
    f.position.y = Math.max(f.position.y, startFloor + 1.95);
    f.nav = navigation.create(f.position.x, f.position.y, f.position.z, Math.atan2(f.velocity.x, f.velocity.z));
    f.navOptions = { speed: 1, clearance: 1.7, radius: f.size * .45, ceiling: -1.6 };
  }

  const dummy = new THREE.Object3D(), orientation = new THREE.Quaternion();
  const heading = new THREE.Euler(0, 0, 0, 'YZX');
  const tailWag = new THREE.Quaternion(), bounds3 = new THREE.Sphere();
  const direction = new THREE.Vector3();
  const offset = new THREE.Vector3(), steering = new THREE.Vector3();
  const swimmerPrevious = new THREE.Vector3(), swimmerVelocity = new THREE.Vector3();
  const swimmerAhead = new THREE.Vector3(), swimmerSegment = new THREE.Vector3(), closest = new THREE.Vector3();
  const tangent = new THREE.Vector3(), avoidance = new THREE.Vector3();
  let hadSwimmer = false, frame = 0, painted = -1;
  const bounds = { x: [-84, 84], y: [-85, -1.6], z: [-128, 56] };
  // Beyond this distance from the diver a school cannot feel them (its
  // members stay within ~20 m of the roaming target; avoidance reaches 13 m).
  const NEAR_SQ = 40 * 40;

  // view: { frustum, eye, range }. Only schools in view and within the haze
  // are written, packed to the front of each mesh, so the instance count (and
  // the vertex work) follows what can be seen rather than the whole reef.
  function draw(elapsed, view) {
    swimTime.value = elapsed;
    let total = 0, mask = '';
    for (const type in families) families[type].drawn = 0;
    for (let s = 0; s < schools.length; s++) {
      const home = schools[s], members = home.members;
      home.shown = true;
      if (view) {
        let cx = 0, cy = 0, cz = 0, reach = 0;
        for (let m = 0; m < members.length; m++) { const p = members[m].position; cx += p.x; cy += p.y; cz += p.z; }
        bounds3.center.set(cx / members.length, cy / members.length, cz / members.length);
        for (let m = 0; m < members.length; m++) reach = Math.max(reach, bounds3.center.distanceToSquared(members[m].position));
        bounds3.radius = Math.sqrt(reach) + 1.2;
        // A half-metre fish is lost in the haze well before the range itself.
        home.shown = view.eye.distanceTo(bounds3.center) - bounds3.radius < view.range * .75 && view.frustum.intersectsSphere(bounds3);
      }
      mask += home.shown ? '1' : '0';
    }
    // Instance colours only move when the set of visible schools changes.
    const repaint = mask !== painted; painted = mask;
    for (let s = 0; s < schools.length; s++) {
      const home = schools[s], members = home.members;
      if (!home.shown) continue;
      const family = families[home.color], bodies = family.bodies;
      for (let m = 0; m < members.length; m++) {
        const f = members[m], slot = family.drawn++, index = total++;
        direction.copy(f.velocity).normalize();
        heading.set(0, Math.atan2(-direction.z, direction.x), Math.atan2(direction.y, Math.hypot(direction.x, direction.z)), 'YZX');
        orientation.setFromEuler(heading);
        dummy.position.copy(f.position); dummy.quaternion.copy(orientation); dummy.scale.setScalar(f.size); dummy.updateMatrix();
        bodies.setMatrixAt(slot, dummy.matrix); trim.setMatrixAt(index, dummy.matrix);
        tailWag.setFromAxisAngle(UP, Math.sin(elapsed * 6.3 + f.phase) * .11);
        dummy.position.addScaledVector(direction, -.63 * f.size);
        dummy.quaternion.multiply(tailWag); dummy.updateMatrix();
        tails.setMatrixAt(index, dummy.matrix);
        if (repaint) { bodies.setColorAt(slot, f.bodyColor); tails.setColorAt(index, f.tailColor); trim.setColorAt(index, f.trimColor); }
      }
    }
    for (const type in families) { const bodies = families[type].bodies; bodies.count = families[type].drawn; bodies.visible = bodies.count > 0; }
    tails.count = trim.count = total; tails.visible = trim.visible = total > 0;
    for (const mesh of meshes) { mesh.instanceMatrix.needsUpdate = true; if (repaint) mesh.instanceColor.needsUpdate = true; }
  }

  function update(dt, elapsed, swimmerPosition, view = null) {
    elapsed = Number.isFinite(elapsed) ? elapsed : 0;
    const frameDelta = Math.min(Math.max(dt || 0, 0), .1);
    const steps = frameDelta > 0 ? Math.ceil(frameDelta / (1 / 60)) : 0;
    const step = steps ? frameDelta / steps : 0;
    const hasSwimmer = !!swimmerPosition?.isVector3;
    if (hasSwimmer) {
      swimmerVelocity.set(0, 0, 0);
      if (hadSwimmer && frameDelta > 0) swimmerVelocity.subVectors(swimmerPosition, swimmerPrevious).divideScalar(frameDelta).clampLength(0, 12);
      swimmerAhead.copy(swimmerPosition).addScaledVector(swimmerVelocity, .55);
      swimmerSegment.copy(swimmerVelocity).multiplyScalar(-frameDelta);
    }
    if (steps > 0) {
      frame++;
      // Schools near the diver keep the fine fixed step, so parting around
      // them is unchanged. A distant school takes one step per frame, and one
      // that is also out of sight catches up every fourth frame.
      for (let index = 0; index < schools.length; index++) {
        const home = schools[index];
        home.near = !hasSwimmer || home.target.distanceToSquared(swimmerPosition) < NEAR_SQ;
        home.wake = 0;
        if (!home.near) {
          if (home.shown) home.wake = frameDelta;
          else { home.idle += frameDelta; if ((frame + index) % 4 === 0) { home.wake = Math.min(home.idle, .1); home.idle = 0; } }
        }
      }
      for (let substep = 0; substep < steps; substep++) {
        const last = substep === steps - 1;
        for (let index = 0; index < schools.length; index++) {
          const home = schools[index], h = home.near ? step : last ? home.wake : 0;
          home.dt = h;
          if (!h) continue;
          const drift = (home.near ? elapsed - frameDelta + step * (substep + 1) : elapsed) * (home.resident ? .16 : .095) + index * 1.35;
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
          v.addScaledVector(f.acceleration, h);
          const speed = v.length();
          const minSpeed = home.resident ? .24 : .85;
          const maxSpeed = (home.resident ? 1 : 1.9) + f.fear * 2.5;
          if (speed < .00001) v.copy(home.travel).multiplyScalar(minSpeed);
          else if (speed < minSpeed) v.setLength(minSpeed);
          else if (speed > maxSpeed) v.setLength(maxSpeed);
          // Flocking supplies the desired direction; cached look-ahead steering supplies a swimmable route.
          // The former integration moved straight through the reef and then snapped p.y up to its new floor.
          swimTarget.x = p.x + v.x * 3; swimTarget.y = p.y + v.y; swimTarget.z = p.z + v.z * 3;
          const nav = f.nav; nav.x = p.x; nav.y = p.y; nav.z = p.z;
          f.navOptions.speed = Math.hypot(v.x, v.z); navigation.step(nav, swimTarget, h, f.navOptions);
          p.set(nav.x, nav.y, nav.z); v.set(nav.vx, nav.vy, nav.vz);
          if (hasSwimmer && home.near) {
            // Swept-body clearance catches an advancing diver between frames.
            closest.copy(swimmerPosition);
            const segmentLengthSq = swimmerSegment.lengthSq();
            if (segmentLengthSq > .00001) {
              offset.subVectors(p, swimmerPosition);
              closest.addScaledVector(swimmerSegment, THREE.MathUtils.clamp(offset.dot(swimmerSegment) / segmentLengthSq, 0, 1));
            }
            offset.subVectors(p, closest);
            const clearance = 1.65 + f.size * .75, distance = offset.length();
            if (distance < clearance) {
              if (distance < .0001) offset.copy(home.travel).cross(UP).multiplyScalar(f.side);
              offset.normalize();
              p.copy(closest).addScaledVector(offset, clearance);
              const inwardSpeed = v.dot(offset);
              if (inwardSpeed < 0) v.addScaledVector(offset, -inwardSpeed);
            }
          }
          if (p.x < bounds.x[0] || p.x > bounds.x[1]) { p.x = THREE.MathUtils.clamp(p.x, bounds.x[0], bounds.x[1]); v.x *= -.45; }
          if (p.y < bounds.y[0] || p.y > bounds.y[1]) { p.y = THREE.MathUtils.clamp(p.y, bounds.y[0], bounds.y[1]); v.y *= -.45; }
          if (p.z < bounds.z[0] || p.z > bounds.z[1]) { p.z = THREE.MathUtils.clamp(p.z, bounds.z[0], bounds.z[1]); v.z *= -.45; }
        }
      }
    }
    if (hasSwimmer) swimmerPrevious.copy(swimmerPosition);
    hadSwimmer = hasSwimmer;
    draw(elapsed || 0, view);
  }
  update(0, 0);
  const api = { root, update, count, schoolCount: schools.length, drawCalls: meshes.length };
  if (debug) api.inspect = () => ({
    schools: schools.map(s => ({ center: s.center.toArray(), target: s.target.toArray(), resident: s.resident, count: s.count, fear: s.fear, near: s.near, shown: s.shown })),
    fish: fish.map(f => ({ position: f.position.toArray(), velocity: f.velocity.toArray(), school: f.school, size: f.size, fear: f.fear }))
  });
  return api;
}
