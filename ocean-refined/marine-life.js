import * as THREE from './vendor/three.module.min.js';

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
  const radialSegments = economy ? 8 : 12;
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

function bodyMaterial(type) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: type === 'silver' ? .34 : .4, metalness: type === 'silver' ? .13 : 0, side: THREE.DoubleSide });
  if (type === 'silver' || type === 'clown') {
    mat.onBeforeCompile = shader => {
      shader.vertexShader = `varying float vFishX;\nvarying float vFishY;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFishX = position.x;\nvFishY = position.y;');
      let pattern = '';
      if (type === 'silver') {
        pattern = 'float lateralStripe = 1.0 - smoothstep(0.018, 0.055, abs(vFishY - 0.035));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.83, 0.92, 0.91), lateralStripe * 0.5);';
      } else {
        pattern = 'float bandDistance = min(abs(vFishX + 0.38), min(abs(vFishX - 0.015), abs(vFishX - 0.36)));\nfloat bandEdge = 1.0 - smoothstep(0.05, 0.082, bandDistance);\nfloat bandWhite = 1.0 - smoothstep(0.025, 0.043, bandDistance);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.20, 0.21), bandEdge * 0.84);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.94, 0.86), bandWhite);';
      }
      shader.fragmentShader = `varying float vFishX;\nvarying float vFishY;\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', `#include <color_fragment>\n${pattern}`);
    };
    mat.customProgramCacheKey = () => `marine-fish-body-${type}-v1`;
  }
  return mat;
}

export function createMarineLife({ economy = false, terrainHeightAt = () => -54, debug = false } = {}) {
  const root = new THREE.Group(); root.name = 'Schooling reef fish';
  const random = seededRandom(906);
  // Twenty-five small habitats keep neighbor work local while covering every depth
  // and both outer reefs. Coral residents stay close; pelagic schools roam.
  const schools = [];
  for (let row = 0; row < 5; row++) for (let column = 0; column < 5; column++) {
    const index = row * 5 + column;
    const x = [-53, -26, 0, 26, 53][column];
    const z = row===1&&column===2 ? -12 : [27, -4, -35, -66, -97][row] + (column % 2 ? -1 : 1);
    const type = ['silver', 'tang', 'clown'][index % 3];
    const resident = type === 'clown';
    const floor = terrainHeightAt(x, z);
    const clearance = Math.max(resident ? 3.1 : 4.5 + index % 3 * .8, (resident ? -53 : -49) - floor);
    schools.push({ center: new THREE.Vector3(x, Math.min(-2.5, floor + clearance), z), color: type,
      count: economy ? 6 : 11, resident, clearance,
      spread: resident ? 2.3 : 4.4, radius: resident ? 3.4 : 7.5, members: [],
      fear: 0, away: new THREE.Vector3(), travel: new THREE.Vector3(), target: new THREE.Vector3() });
  }
  const count = schools.reduce((sum, school) => sum + school.count, 0);
  const familyCounts = { silver: 0, tang: 0, clown: 0 };
  schools.forEach(school => { familyCounts[school.color] += school.count; });
  const families = {};
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .48, metalness: 0, side: THREE.DoubleSide, ...options });
  const palettes = {
    silver: ['#b9d5d6', '#d1e1dc', '#96bdc8'],
    tang: ['#559ab5', '#78b6c2', '#477c9e'],
    clown: ['#e9985f', '#f0b06a', '#d98958']
  };
  for (const type of Object.keys(familyCounts)) {
    families[type] = {
      bodies: new THREE.InstancedMesh(bodyGeometry(type, economy), bodyMaterial(type), familyCounts[type]),
      tails: new THREE.InstancedMesh(finGeometry('tail'), material('#ffffff', { roughness: .52 }), familyCounts[type]),
      dorsal: new THREE.InstancedMesh(finGeometry('dorsal'), material('#ffffff', { roughness: .52 }), familyCounts[type]),
      pectorals: new THREE.InstancedMesh(finGeometry('pectoral'), material('#ffffff', { roughness: .55 }), familyCounts[type]),
      cursor: 0
    };
    for (const mesh of [families[type].bodies, families[type].tails, families[type].dorsal, families[type].pectorals]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      root.add(mesh);
    }
  }
  const eyeGeometry = new THREE.SphereGeometry(1, economy ? 5 : 7, 5);
  const eyes = new THREE.InstancedMesh(eyeGeometry, material('#102a35', { roughness: .26 }), count * 2);
  eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage); eyes.frustumCulled = false; eyes.name = 'Small fish eyes'; root.add(eyes);

  const fish = [];
  for (let school = 0; school < schools.length; school++) {
    const habitat = schools[school], family = families[habitat.color];
    for (let member = 0; member < habitat.count; member++) {
      const slot = family.cursor++;
      const angle = random() * TAU, radial = Math.sqrt(random()) * habitat.spread;
      const f = {
        position: habitat.center.clone().add(new THREE.Vector3(Math.cos(angle) * radial, (random() - .5) * 1.5, Math.sin(angle) * radial)),
        velocity: new THREE.Vector3(.65 + random() * .35, (random() - .5) * .08, (random() - .5) * .2),
        acceleration: new THREE.Vector3(), school, type: habitat.color, slot, fear: 0,
        side: Math.cos(angle) >= 0 ? 1 : -1,
        size: (habitat.color === 'silver' ? .64 : habitat.color === 'clown' ? .55 : .84) * (.88 + random() * .24) * (.9 + school % 4 * .1),
        phase: random() * TAU,
        tint: palettes[habitat.color][Math.floor(random() * palettes[habitat.color].length)]
      };
      f.position.y = Math.max(f.position.y, terrainHeightAt(f.position.x, f.position.z) + 1.7);
      fish.push(f); habitat.members.push(f);
      const color = new THREE.Color(fish[fish.length - 1].tint);
      family.bodies.setColorAt(slot, color);
      family.tails.setColorAt(slot, habitat.color === 'tang'
        ? new THREE.Color('#e6c66f').offsetHSL((random() - .5) * .015, 0, (random() - .5) * .05)
        : color.clone().multiplyScalar(.84));
      family.dorsal.setColorAt(slot, color.clone().multiplyScalar(.82));
      family.pectorals.setColorAt(slot, color.clone().multiplyScalar(.8));
    }
  }

  const dummy = new THREE.Object3D(), orientation = new THREE.Quaternion();
  const heading = new THREE.Euler(0, 0, 0, 'YZX');
  const tailWag = new THREE.Quaternion();
  const direction = new THREE.Vector3(), center = new THREE.Vector3(), alignment = new THREE.Vector3();
  const separation = new THREE.Vector3(), offset = new THREE.Vector3(), target = new THREE.Vector3(), steering = new THREE.Vector3();
  const swimmerPrevious = new THREE.Vector3(), swimmerVelocity = new THREE.Vector3();
  const swimmerAhead = new THREE.Vector3(), swimmerSegment = new THREE.Vector3(), closest = new THREE.Vector3();
  const tangent = new THREE.Vector3(), avoidance = new THREE.Vector3();
  let hadSwimmer = false;
  const bounds = { x: [-61, 61], y: [-68, -1.6], z: [-104, 34] };

  function draw(elapsed) {
    fish.forEach((f, i) => {
      const family = families[f.type];
      direction.copy(f.velocity).normalize();
      heading.set(0, Math.atan2(-direction.z, direction.x), Math.atan2(direction.y, Math.hypot(direction.x, direction.z)), 'YZX');
      orientation.setFromEuler(heading);
      dummy.position.copy(f.position); dummy.quaternion.copy(orientation); dummy.scale.setScalar(f.size); dummy.updateMatrix();
      family.bodies.setMatrixAt(f.slot, dummy.matrix);
      const wag = Math.sin(elapsed * 6.3 + f.phase) * .11;
      tailWag.setFromAxisAngle(UP, wag);
      dummy.position.copy(f.position).addScaledVector(direction, -.63 * f.size);
      dummy.quaternion.copy(orientation).multiply(tailWag); dummy.scale.setScalar(f.size); dummy.updateMatrix();
      family.tails.setMatrixAt(f.slot, dummy.matrix);
      dummy.position.copy(f.position);
      dummy.quaternion.copy(orientation); dummy.scale.setScalar(f.size); dummy.updateMatrix(); family.dorsal.setMatrixAt(f.slot, dummy.matrix);
      offset.set(-.02 * f.size, -.02 * f.size, .12 * f.size).applyQuaternion(orientation);
      dummy.position.copy(f.position).add(offset);
      dummy.scale.set(f.size, f.size, f.size); dummy.updateMatrix(); family.pectorals.setMatrixAt(f.slot, dummy.matrix);
      for (let side = 0; side < 2; side++) {
        offset.set(.37 * f.size, .045 * f.size, (side ? 1 : -1) * .087 * f.size).applyQuaternion(orientation);
        dummy.position.copy(f.position).add(offset); dummy.quaternion.copy(orientation); dummy.scale.setScalar(.022 * f.size); dummy.updateMatrix(); eyes.setMatrixAt(i * 2 + side, dummy.matrix);
      }
    });
    for (const family of Object.values(families)) for (const mesh of [family.bodies, family.tails, family.dorsal, family.pectorals]) mesh.instanceMatrix.needsUpdate = true;
    eyes.instanceMatrix.needsUpdate = true;
  }

  function update(dt, elapsed, swimmerPosition) {
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
      for (let substep = 0; substep < steps; substep++) {
        const simulationTime = elapsed - frameDelta + step * (substep + 1);
        for (let index = 0; index < schools.length; index++) {
          const home = schools[index], drift = simulationTime * (home.resident ? .14 : .065) + index * 1.35;
          const roam = home.resident ? .6 : 5.3;
          home.target.set(home.center.x + Math.sin(drift) * roam, home.center.y, home.center.z + Math.cos(drift) * roam * .75);
          home.target.y = Math.min(-2.5, terrainHeightAt(home.target.x, home.target.z) + home.clearance + Math.sin(drift * .72) * .35);
          home.travel.set(Math.cos(drift), 0, -Math.sin(drift) * .75).normalize();
          let pressure = 0;
          if (hasSwimmer) {
            offset.subVectors(home.target, swimmerAhead);
            pressure = 1 - THREE.MathUtils.smoothstep(offset.length(), 4, 13);
            if (offset.lengthSq() > .001) home.away.lerp(offset.normalize(), 1 - Math.exp(-step * 4));
          }
          home.fear += (pressure - home.fear) * (1 - Math.exp(-step * (pressure > home.fear ? 5 : .55)));
          home.target.addScaledVector(home.away, home.fear * 4.5);
        }
        fish.forEach(f => {
        center.set(0, 0, 0); alignment.set(0, 0, 0); separation.set(0, 0, 0);
        let neighbors = 0;
        const home = schools[f.school];
        for (const other of home.members) {
          if (other === f) continue;
          offset.subVectors(other.position, f.position);
          const distanceSq = offset.lengthSq();
          if (distanceSq < 22) {
            center.add(other.position); alignment.add(other.velocity); neighbors++;
            if (distanceSq < 1.1 && distanceSq > .0001) separation.addScaledVector(offset, -1 / distanceSq);
          }
        }
        f.acceleration.copy(separation).multiplyScalar(.95);
        if (neighbors) {
          center.multiplyScalar(1 / neighbors).sub(f.position);
          alignment.multiplyScalar(1 / neighbors).sub(f.velocity);
          f.acceleration.addScaledVector(center, .11).addScaledVector(alignment, .65);
        }
        target.copy(home.target);
        steering.subVectors(target, f.position).multiplyScalar(home.resident ? .3 : .16);
        f.acceleration.add(steering).addScaledVector(home.travel, home.resident ? .08 : .24);
        const margin = home.radius + home.fear * 3;
        offset.subVectors(f.position, home.target); offset.y = 0;
        const radialDistance = offset.length();
        if (radialDistance > margin) f.acceleration.addScaledVector(offset.normalize(), -Math.min(1, (radialDistance - margin) * .18));
        let pressure = 0;
        if (hasSwimmer) {
          offset.subVectors(f.position, swimmerAhead);
          pressure = 1 - THREE.MathUtils.smoothstep(offset.length(), 2.6, 8.5);
          // Each member keeps its side of the approach, producing two coherent
          // arcs around the diver instead of a radial explosion through it.
          tangent.copy(swimmerVelocity);
          if (tangent.lengthSq() < .1) tangent.copy(home.travel);
          tangent.cross(UP).normalize().multiplyScalar(f.side);
          avoidance.copy(offset);
          if (avoidance.lengthSq() < .001) avoidance.copy(tangent);
          avoidance.normalize().multiplyScalar(3.8).addScaledVector(tangent, 3.1);
          f.acceleration.addScaledVector(avoidance, pressure);
          offset.subVectors(f.position, swimmerPosition);
          const distance = offset.length();
          if (distance < 4.2) {
            if (distance < .001) offset.copy(tangent);
            f.acceleration.addScaledVector(offset.normalize(), (1 - Math.min(distance / 4.2, 1)) * 7);
          }
        }
        f.fear += (Math.max(pressure, home.fear * .7) - f.fear) * (1 - Math.exp(-step * (pressure > f.fear ? 8 : .8)));
        const floor = terrainHeightAt(f.position.x, f.position.z) + 2.35;
        if (f.position.y < floor) f.acceleration.y += (floor - f.position.y) * .65;
        f.acceleration.clampLength(0, 1.5 + f.fear * 7);
        });
        fish.forEach(f => {
        f.velocity.addScaledVector(f.acceleration, step);
        const speed = f.velocity.length();
        const minSpeed = schools[f.school].resident ? .18 : .65;
        const maxSpeed = (schools[f.school].resident ? .8 : 1.5) + f.fear * 2.5;
        if (speed < .00001) f.velocity.copy(schools[f.school].travel).multiplyScalar(minSpeed);
        else if (speed < minSpeed) f.velocity.setLength(minSpeed);
        else if (speed > maxSpeed) f.velocity.setLength(maxSpeed);
        f.position.addScaledVector(f.velocity, step);
        if (hasSwimmer) {
          // Swept-body clearance catches an advancing diver between frames.
          closest.copy(swimmerPosition);
          const segmentLengthSq = swimmerSegment.lengthSq();
          if (segmentLengthSq > .00001) {
            offset.subVectors(f.position, swimmerPosition);
            closest.addScaledVector(swimmerSegment, THREE.MathUtils.clamp(offset.dot(swimmerSegment) / segmentLengthSq, 0, 1));
          }
          offset.subVectors(f.position, closest);
          const clearance = 1.65 + f.size * .75, distance = offset.length();
          if (distance < clearance) {
            if (distance < .0001) offset.copy(schools[f.school].travel).cross(UP).multiplyScalar(f.side);
            offset.normalize();
            f.position.copy(closest).addScaledVector(offset, clearance);
            const inwardSpeed = f.velocity.dot(offset);
            if (inwardSpeed < 0) f.velocity.addScaledVector(offset, -inwardSpeed);
          }
        }
        const floor = terrainHeightAt(f.position.x, f.position.z) + 1.7;
        if (f.position.y < floor) { f.position.y = floor; f.velocity.y = Math.abs(f.velocity.y) * .35; }
        for (const axis of ['x', 'y', 'z']) {
          const [min, max] = bounds[axis];
          if (f.position[axis] < min || f.position[axis] > max) {
            f.position[axis] = THREE.MathUtils.clamp(f.position[axis], min, max);
            f.velocity[axis] *= -.45;
          }
        }
        });
      }
    }
    if (hasSwimmer) swimmerPrevious.copy(swimmerPosition);
    hadSwimmer = hasSwimmer;
    draw(elapsed || 0);
  }
  update(0, 0);
  const api = { root, update, count };
  if (debug) api.inspect = () => ({
    schools: schools.map(s => ({ center: s.center.toArray(), target: s.target.toArray(), resident: s.resident, count: s.count, fear: s.fear })),
    fish: fish.map(f => ({ position: f.position.toArray(), velocity: f.velocity.toArray(), school: f.school, size: f.size, fear: f.fear }))
  });
  return api;
}
