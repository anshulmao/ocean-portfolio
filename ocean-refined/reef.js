import * as THREE from './vendor/three.module.min.js';
import { seededRandom } from './assets.js';
import { createCollisionWorld } from './collisions.js';

export const LANDMARKS = [
  { id: 'about', title: 'About', description: 'Shallow reef · 8 m', position: [-12, -8, -15] },
  { id: 'experience', title: 'Experience', description: 'Mid-depth wreck · 23 m', position: [18, -23, -39] },
  { id: 'projects', title: 'Projects', description: 'Deep ledge · 45 m', position: [-18, -45, -82] }
];

// Horizontal coordinates are world coordinates; vertical limits are camera
// offsets from the normal swimming depth, shared with the exploration module.
export const WORLD_BOUNDS = { x: 62, zMin: -105, zMax: 35, yMin: -56, yMax: 5 };

export function terrainHeightAt(x, z) {
  const descent = THREE.MathUtils.clamp((35 - z) / 140, 0, 1);
  const terraceA = THREE.MathUtils.smoothstep(-z, 32, 43) * 4.2;
  const terraceB = THREE.MathUtils.smoothstep(-z, 61, 74) * 5.3;
  const terraceC = THREE.MathUtils.smoothstep(-z, 87, 101) * 4.8;
  const shelf = -8.2 - descent * 45 - terraceA - terraceB - terraceC;
  // Broad, low-frequency contours keep the seabed rolling. The former
  // high-frequency positive pinnacles read as spikes at swim height.
  const ridge = Math.sin(x * .068 + z * .026) * .92
    + Math.cos(z * .061 - x * .019) * .63
    + Math.sin(x * .039 - z * .052) * .48;
  const gullies = Math.exp(-(((x - 8 * Math.sin(z * .028)) / 8.5) ** 2)) * 1.65
    + Math.exp(-(((x + 31) / 11) ** 2)) * .72;
  const ledge = Math.exp(-(((z + 66) / 9.5) ** 2)) * (1.1 + 1.15 * Math.cos(x * .072));
  let height = shelf + ridge - gullies - ledge;
  // Broad, gently blended shelves give each large landmark a grounded
  // approach pad while the surrounding contours remain distinctly deeper.
  const pads = [
    { x: 0, z: 0, floor: -13, radiusX: 19, radiusZ: 22, flat: .60 },
    { x: -12, z: -15, floor: -11, radiusX: 15, radiusZ: 16, flat: .46 },
    { x: 18, z: -39, floor: -26, radiusX: 18, radiusZ: 22, flat: .55 },
    { x: -18, z: -82, floor: -48, radiusX: 15, radiusZ: 17, flat: .44 }
  ];
  for (const pad of pads) {
    const radius = Math.hypot((x - pad.x) / pad.radiusX, (z - pad.z) / pad.radiusZ);
    const blend = 1 - THREE.MathUtils.smoothstep(radius, pad.flat, 1);
    height = THREE.MathUtils.lerp(height, pad.floor, blend);
  }
  return height;
}

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(1, 0, 0);
const TAU = Math.PI * 2;

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .66, ...options });
}

// Store transforms first so every family costs one draw call, irrespective of
// the number of coral branches or grass blades. Geometry is reused throughout.
function batch(root, geometry, mat) {
  const entries = [];
  const dummy = new THREE.Object3D();
  return {
    add(position, scale, rotation, color) {
      dummy.position.copy(position);
      dummy.scale.set(...scale);
      if (rotation?.isQuaternion) dummy.quaternion.copy(rotation);
      else dummy.rotation.set(...(rotation || [0, 0, 0]));
      dummy.updateMatrix();
      entries.push({ matrix: dummy.matrix.clone(), color });
    },
    finish(name, collisionKind) {
      if (!entries.length) { geometry.dispose(); return; }
      const mesh = new THREE.InstancedMesh(geometry, mat, entries.length);
      mesh.name = name;
      if (collisionKind) mesh.userData.collisionKind = collisionKind;
      const color = new THREE.Color();
      entries.forEach((entry, i) => {
        mesh.setMatrixAt(i, entry.matrix);
        if (entry.color) mesh.setColorAt(i, color.set(entry.color));
      });
      mesh.computeBoundingSphere();
      root.add(mesh);
      return mesh;
    }
  };
}

function segment(target, start, end, radius, color) {
  const direction = new THREE.Vector3().subVectors(end, start);
  target.add(new THREE.Vector3().addVectors(start, end).multiplyScalar(.5),
    [radius, direction.length(), radius], new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()), color);
}

function plateGeometry(economy = false, carpet = false) {
  const positions = [], indices = [];
  const rings = carpet ? 2 : economy ? 3 : 4, sides = carpet ? 12 : economy ? 22 : 30;
  for (let r = 0; r <= rings; r++) {
    const radius = r / rings;
    for (let i = 0; i <= sides; i++) {
      const angle = i / sides * TAU;
      const ripple = 1 + .055 * Math.sin(angle * 7) + .025 * Math.cos(angle * 13);
      positions.push(Math.cos(angle) * radius * ripple,
        .15 * radius * radius + .025 * Math.sin(angle * 9) * radius ** 3,
        Math.sin(angle) * radius * ripple);
      if (r < rings && i < sides) {
        const a = r * (sides + 1) + i, b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function fanGeometry(economy = false) {
  // A fan is an open lattice, not a filled panel. Build the radial ribs and
  // fine cross-links into one reusable geometry so each fan remains one draw.
  const positions = [], indices = [];
  const ribCount = economy ? 9 : 13, ribSteps = economy ? 6 : 8;
  const tieRows = economy ? 4 : 6;
  const point = (angle, radius) => {
    const scallop = 1 + .035 * Math.sin(angle * 12);
    return new THREE.Vector3(Math.sin(angle) * radius * scallop,
      .16 + Math.cos(angle) * radius * scallop,
      .07 * Math.sin(angle * 3) * radius * radius);
  };
  const rod = (start, end, radius) => {
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const side = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
    const depth = new THREE.Vector3(0, 0, radius * .62);
    const first = positions.length / 3;
    for (const center of [start, end]) {
      const across = side.clone().multiplyScalar(radius);
      positions.push(
        center.x + across.x + depth.x, center.y + across.y + depth.y, center.z + across.z + depth.z,
        center.x - across.x + depth.x, center.y - across.y + depth.y, center.z - across.z + depth.z,
        center.x - across.x - depth.x, center.y - across.y - depth.y, center.z - across.z - depth.z,
        center.x + across.x - depth.x, center.y + across.y - depth.y, center.z + across.z - depth.z
      );
    }
    for (let sideIndex = 0; sideIndex < 4; sideIndex++) {
      const a = first + sideIndex, b = first + (sideIndex + 1) % 4;
      indices.push(a, a + 4, b, b, a + 4, b + 4);
    }
  };
  const angleAt = index => -.5 * Math.PI + index / (ribCount - 1) * Math.PI;
  for (let rib = 0; rib < ribCount; rib++) {
    const angle = angleAt(rib);
    for (let step = 0; step < ribSteps; step++) {
      const a = point(angle, step / ribSteps);
      const b = point(angle, (step + 1) / ribSteps);
      rod(a, b, (economy ? .012 : .013) * (1 - step / ribSteps * .28));
    }
  }
  for (let row = 1; row <= tieRows; row++) {
    const radius = row / (tieRows + 1);
    for (let rib = 0; rib < ribCount - 1; rib++) {
      rod(point(angleAt(rib), radius), point(angleAt(rib + 1), radius), .0065);
    }
  }
  for (let rib = 0; rib < ribCount - 1; rib++) {
    rod(point(angleAt(rib), 1), point(angleAt(rib + 1), 1), .009);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function bladeGeometry() {
  const positions = [], indices = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7, width = .065 * (1 - t) + .008;
    const bend = .3 * t * t;
    positions.push(bend - width, t, .07 * Math.sin(t * Math.PI), bend + width, t, .07 * Math.sin(t * Math.PI));
    if (i < 7) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function brainGeometry(economy) {
  const geometry = new THREE.SphereGeometry(1, economy ? 16 : 24, economy ? 10 : 16);
  const p = geometry.getAttribute('position'), colors = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const theta = Math.atan2(z, x), latitude = Math.asin(THREE.MathUtils.clamp(y, -1, 1));
    const ridge = Math.sin(theta * 11 + Math.sin(latitude * 5) * 2.8) * Math.cos(latitude * 9 + theta * .8);
    const radius = 1 + ridge * .075;
    p.setXYZ(i, x * radius, y * radius, z * radius);
    const shade = .68 + .32 * THREE.MathUtils.smoothstep(ridge, -.65, .4);
    colors.push(shade, shade, shade);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); return geometry;
}

function spongeGeometry(economy) {
  return new THREE.LatheGeometry([
    new THREE.Vector2(.18, 0), new THREE.Vector2(.29, .55),
    new THREE.Vector2(.34, 1), new THREE.Vector2(.23, 1.01),
    new THREE.Vector2(.18, .76), new THREE.Vector2(.12, .18)
  ], economy ? 9 : 12);
}

function barrelGeometry(economy) {
  // One continuous lathe profile forms a broad hollow barrel with a visible
  // rolled rim; the opening stays readable from the swimming camera.
  const profile = [
    new THREE.Vector2(.52, 0), new THREE.Vector2(.62, .08),
    new THREE.Vector2(.82, .3), new THREE.Vector2(.96, .78),
    new THREE.Vector2(.94, 1.12), new THREE.Vector2(.86, 1.2),
    new THREE.Vector2(.68, 1.18), new THREE.Vector2(.64, .98),
    new THREE.Vector2(.58, .53), new THREE.Vector2(.42, .16),
    new THREE.Vector2(.34, 0)
  ];
  return new THREE.LatheGeometry(profile, economy ? 10 : 14);
}

function boulderGeometry(economy) {
  const geometry = new THREE.IcosahedronGeometry(1, economy ? 1 : 2);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const ripple = 1 + .055 * Math.sin(x * 5.2 + z * 3.1) * Math.cos(y * 4.4 - z * 2.7);
    positions.setXYZ(i, x * ripple, y * ripple, z * ripple);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function swayMaterial(color, time) {
  const mat = material(color, { side: THREE.DoubleSide });
  mat.onBeforeCompile = shader => {
    shader.uniforms.uReefTime = time;
    shader.vertexShader = `uniform float uReefTime;\n${shader.vertexShader}`.replace('#include <begin_vertex>',
      `#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat reefPhase = instanceMatrix[3].x * .4 + instanceMatrix[3].z * .19;\ntransformed.x += sin(uReefTime * .65 + reefPhase + transformed.y * 2.) * transformed.y * .035;\n#endif`);
  };
  mat.customProgramCacheKey = () => 'reef-gentle-sway-v1';
  return mat;
}

export function createReef({ economy = false } = {}) {
  const root = new THREE.Group(); root.name = 'Living reef garden';
  const random = seededRandom(371);
  const swayTime = { value: 0 };
  const surfaceLight={value:1};root.userData.surfaceLight=surfaceLight;
  const coralPalette = ['#ea8c70', '#dfb27b', '#bf7d9a', '#c98ca5', '#8bbcaf', '#d4b6a0'];
  const rocks = batch(root, new THREE.IcosahedronGeometry(1, 2), material('#ffffff', { roughness: .9 }));
  const branches = batch(root, new THREE.CylinderGeometry(.68, 1, 1, 5), material('#ffffff'));
  const tips = batch(root, new THREE.SphereGeometry(1, 6, 4), material('#ffffff'));
  const plates = batch(root, plateGeometry(economy), material('#ffffff', { side: THREE.DoubleSide }));
  const carpets = batch(root, plateGeometry(true,true), material('#ffffff', {side:THREE.DoubleSide}));
  const fans = batch(root, fanGeometry(economy), material('#ffffff', { side: THREE.DoubleSide }));
  const colonyProxies = batch(root, new THREE.SphereGeometry(1, 8, 6), material('#ffffff'));
  const grass = batch(root, bladeGeometry(), swayMaterial('#ffffff', swayTime));
  const brains = batch(root, brainGeometry(economy), material('#ffffff', { vertexColors: true, roughness: .7 }));
  const sponges = batch(root, spongeGeometry(economy), material('#ffffff', { side: THREE.DoubleSide }));
  const whipCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(.12, .7, .04), new THREE.Vector3(-.16, 1.4, .08), new THREE.Vector3(.26, 2, 0)]);
  const whips = batch(root, new THREE.TubeGeometry(whipCurve, economy ? 7 : 10, .035, 4, false), swayMaterial('#ffffff', swayTime));
  const glowMat = material('#90e6d7', { emissive: '#54dbc3', emissiveIntensity: .25, roughness: .45 });
  const glow = batch(root, new THREE.SphereGeometry(1, 5, 4), glowMat);
  const tentacleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(.07, .24, 0),
    new THREE.Vector3(-.04, .48, .04), new THREE.Vector3(.10, .7, .07)
  ]);
  const tentacles = batch(root, new THREE.TubeGeometry(tentacleCurve, economy ? 5 : 7, .035, 4, false), swayMaterial('#ffffff', swayTime));
  const domes = batch(root, new THREE.SphereGeometry(1, 10, 6), material('#ffffff'));
  const barrels = batch(root, barrelGeometry(economy), material('#ffffff', { side: THREE.DoubleSide, roughness: .72 }));
  const boulders = batch(root, boulderGeometry(economy), material('#ffffff', { roughness: .76 }));
  const clusters = [
    [-8, -5, 1.05], [9, -9, 1.25], [-13, -14, 1.5], [16, -18, 1.5],
    [-5, -8, .9], [6, -8, 1.1], [8, -15, 1.35], [5, -20, 1.2],
    [-7, -23, 1.35], [10, -28, 1.4], [-17, -30, 1.6], [17, -35, 1.8],
    [-10, -40, 1.9], [7, -45, 1.7], [-21, -48, 2], [22, -52, 1.8],
    [-13, -61, 2.3], [12, -64, 2.4], [-28, -69, 2.7], [28, -76, 2.8],
    [-28, 2, 2], [26, 5, 2.1], [-35, -23, 2.2], [34, -35, 2.3],
    [-37, -49, 2.2], [39, -59, 2.7], [-16, 22, 1.8], [16, 23, 1.9],
    [-3, -78, 2.7], [23, -89, 2.5], [-34, -87, 2.8], [48, -16, 2.8],
    [-49, -15, 2.9], [48, -79, 3.3], [-48, -83, 3.2], [3, -103, 3.1]
  ];
  const archX = 20, archZ = -72, archExitZ = -59;
  const grottoSites=[[-35,-30,4.5,3.5],[36,-48,5,5],[-33,-73,5.5,5.5],[39,-91,4.5,4],[7,18,4,3]];
  // Broad reef beds consist of overlapping small colonies. Keeping their
  // individual height restrained avoids turning the seabed into giant blobs.
  const coverageRandom = seededRandom(1482);
  for (let row = 0; row < 10; row++) {
    const z = 25 - row * 14;
    for (let column = 0; column < 9; column++) {
      if (economy && (row + column) % 4 === 0) continue;
      const x = -52 + column * 13 + (row % 2 ? 3 : -2);
      clusters.push([x + (coverageRandom() - .5) * 3,
        z + (coverageRandom() - .5) * 3, 1.25 + coverageRandom() * .8]);
    }
  }
  const routePoints = [[0, 0], [-12, -15], [18, -39], [-18, -82]];
  function routeDistance(x, z) {
    let closest = Infinity;
    for (let i = 1; i < routePoints.length; i++) {
      const [ax, az] = routePoints[i - 1], [bx, bz] = routePoints[i];
      const dx = bx - ax, dz = bz - az;
      const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      closest = Math.min(closest, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return closest;
  }
  let colonyCount = 0, groundCoverPatches = 0, meadowTufts = 0;

  function staghorn(origin, scale, color) {
    const base = origin.clone();
    const crown = base.clone().add(new THREE.Vector3(.06, scale * .7, .03));
    segment(branches, base, crown, scale * .11, color);
    const arms = economy ? 4 : 5;
    for (let n = 0; n < arms; n++) {
      const angle = n / arms * TAU + random() * .25;
      const join = base.clone().lerp(crown, .32 + random() * .55);
      const end = join.clone().add(new THREE.Vector3(Math.cos(angle) * scale * (.4 + random() * .3), scale * (.35 + random() * .42), Math.sin(angle) * scale * (.4 + random() * .3)));
      segment(branches, join, end, scale * .061, color);
      const twigs = 2;
      for (let k = 0; k < twigs; k++) {
        const fork = join.clone().lerp(end, .42 + k * .19);
        const tip = fork.clone().add(new THREE.Vector3(Math.cos(angle + .6) * scale * .18, scale * (.23 + random() * .24), Math.sin(angle + .6) * scale * .18));
        segment(branches, fork, tip, scale * .036, color);
        tips.add(tip, [scale * .033, scale * .06, scale * .033], null, '#f3d5bd');
      }
      tips.add(end, [scale * .05, scale * .07, scale * .05], null, '#eed8c3');
    }
  }

  function seaFan(origin, scale, color) {
    const angle = random() * Math.PI;
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.07, angle, -.12 + random() * .24));
    fans.add(origin, [scale, scale * 1.25, scale], rotation, color);
  }

  clusters.forEach(([cx, cz, size], index) => {
    if (Math.hypot(cx, cz) < 6 + size * 3.5 || routeDistance(cx, cz) < 3.2 + size * 3.5) return;
    if (LANDMARKS.some(({ position: [x, , z] }) => Math.hypot(cx - x, cz - z) < 6 + size * 4.2)) return;
    // Keep the entire arch corridor and ascent shaft free of rendered reef
    // and colony proxies. Measure to the horizontal route segment and include
    // the full opening width plus the colony's largest outcrop reach.
    const routeZ = THREE.MathUtils.clamp(cz, Math.min(archZ, archExitZ), Math.max(archZ, archExitZ));
    if (Math.hypot(cx - archX, cz - routeZ) < 6.5 + size * 3.5) return;
    if(grottoSites.some(([x,z,radius,length])=>Math.abs(cx-x)<radius+size*2&&Math.abs(cz-z)<length+3+size*2))return;
    colonyCount++;
    const deep = terrainHeightAt(cx, cz) < -28;
    const floor = terrainHeightAt(cx, cz);
    // One hidden rounded-volume proxy per colony blocks its main body while
    // leaving individual branches and tips free of collision clutter.
    colonyProxies.add(new THREE.Vector3(cx, floor + size * .88, cz),
      [size * 1.3, size * .92, size * 1.3], [0, random() * TAU, 0]);
    const rockCount = economy ? 3 : 5;
    for (let r = 0; r < rockCount; r++) {
      const angle = random() * TAU, distance = random() * size * 1.9;
      const s = size * (.55 + random() * .85);
      const x = cx + Math.cos(angle) * distance, z = cz + Math.sin(angle) * distance;
      if(grottoSites.some(([ax,az,,length])=>Math.abs(x-ax)<3.5+s*2&&Math.abs(z-az)<length+2+s*2))continue;
      rocks.add(new THREE.Vector3(x, terrainHeightAt(x, z) + s * .24, z),
        [s * 1.25, s * (.45 + random() * .25), s], [random() * .3, random() * TAU, random() * .3], r % 3 ? '#416e73' : '#628d8b');
    }
    const plants = deep ? (economy ? 6 : 9) : (economy ? 8 : 12);
    for (let p = 0; p < plants; p++) {
      const a = p / plants * TAU + random() * .4;
      const radius = size * (.35 + random() * 1.8);
      const x = cx + Math.cos(a) * radius, z = cz + Math.sin(a) * radius;
      const origin = new THREE.Vector3(x, terrainHeightAt(x, z) + .35 + random() * .28, z);
      const plantScale = size * (.5 + random() * .55);
      const color = coralPalette[(index + p) % coralPalette.length];
      const type = (p + index) % 8;
      if (type === 0) staghorn(origin, plantScale, color);
      else if (type === 1) {
        for (let tier = 0; tier < 3; tier++) {
          const point = origin.clone().add(new THREE.Vector3((tier - 1) * plantScale * .15, tier * plantScale * .23, 0));
          const diameter = plantScale * (.95 - tier * .18);
          plates.add(point, [diameter, plantScale * .55, diameter * .8], [.08, random() * TAU, -.12], color);
          segment(branches, origin, point.clone().add(new THREE.Vector3(0, .08, 0)), plantScale * .075, '#b2937f');
        }
      } else if (type === 2) seaFan(origin, plantScale * .88, color);
      else if (type === 3) brains.add(origin.clone().add(new THREE.Vector3(0, plantScale * .32, 0)), [plantScale * .7, plantScale * .5, plantScale * .65], [0, random() * TAU, .05], index % 2 ? '#d0bc7c' : '#8ebba7');
      else if (type === 4) {
        // A paired barrel grouping gives the reef a distinct large-sponge
        // silhouette; a smaller tube sponge adds scale around its base.
        const angle = random() * TAU;
        const offset = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const barrelScale = plantScale * (.72 + random() * .18);
        barrels.add(origin.clone().addScaledVector(offset, plantScale * .18),
          [barrelScale, plantScale * (1.02 + random() * .18), barrelScale],
          [0, angle, (random() - .5) * .08], index % 2 ? '#c58b79' : '#d1a36f');
        const tubePoint = origin.clone().add(new THREE.Vector3(
          -offset.z * plantScale * .42, plantScale * .04, offset.x * plantScale * .42
        ));
        sponges.add(tubePoint, [plantScale * .25, plantScale * .68, plantScale * .25], [.05, angle + .8, 0], '#b99ca9');
      } else if (type === 5) {
        for (let tube = 0; tube < (economy ? 3 : 5); tube++) {
          const angle = tube * 2.4, height = plantScale * (.75 + random() * .6);
          const point = origin.clone().add(new THREE.Vector3(Math.cos(angle) * plantScale * .35, -.15, Math.sin(angle) * plantScale * .35));
          sponges.add(point, [plantScale * .72, height, plantScale * .72], [.06, angle, (random() - .5) * .2], index % 2 ? '#b89bc2' : '#d7ad81');
          glow.add(point.clone().add(new THREE.Vector3(0, height * .99, 0)), [plantScale * .08, .035, plantScale * .08], null, null);
        }
      } else if (type === 6) {
        for (let whip = 0; whip < (economy ? 3 : 5); whip++) {
          const point = origin.clone().add(new THREE.Vector3((random() - .5) * plantScale, 0, (random() - .5) * plantScale));
          const height = plantScale * (.65 + random() * .55);
          whips.add(point, [plantScale * .75, height, plantScale * .75], [.08, whip * 1.8, (random() - .5) * .15], index % 2 ? '#ccabcb' : '#d7b48d');
          const tip = new THREE.Vector3(.26 * plantScale * .75, height * 2, 0).applyAxisAngle(UP, whip * 1.8).add(point);
          glow.add(tip, [.055, .10, .055], null, null);
        }
      } else {
        const mound = origin.clone().add(new THREE.Vector3(0, plantScale * .22, 0));
        boulders.add(mound,
          [plantScale * (.78 + random() * .18), plantScale * (.5 + random() * .14), plantScale * (.72 + random() * .2)],
          [random() * .12, random() * TAU, random() * .12], index % 2 ? '#c9ad77' : '#8fb3a2');
      }
    }
    // Low cushions, anemones and curved grass soften the rock edges.
    for (let a = 0; a < (economy || deep ? 1 : 2); a++) {
      const ox = cx + (random() - .5) * size * 3, oz = cz + (random() - .5) * size * 3;
      const origin = new THREE.Vector3(ox, terrainHeightAt(ox, oz) + .25, oz);
      const s = size * (.28 + random() * .2);
      domes.add(origin, [s * 1.1, s * .55, s], null, '#bc9a82');
      const tentacleCount = economy ? 7 : 11;
      for (let t = 0; t < tentacleCount; t++) {
        const theta = t * 2.4, radius = Math.sqrt(t / tentacleCount) * s * .8;
        const point = origin.clone().add(new THREE.Vector3(Math.cos(theta) * radius, s * .24, Math.sin(theta) * radius));
        tentacles.add(point, [s * 1.25, s * (1 + random() * .7), s * 1.25], [0, theta, (random() - .5) * .35], a % 2 ? '#bfabcc' : '#a7c6a4');
      }
      for (let g = 0; g < (economy ? 6 : 11); g++) {
        const gx = cx + (random() - .5) * size * 5, gz = cz + (random() - .5) * size * 4;
        const point = new THREE.Vector3(gx, terrainHeightAt(gx, gz) + .06, gz);
        const h = .6 + random() * size;
        grass.add(point, [1.3, h, 1.3], [0, random() * TAU, (random() - .5) * .22], g % 3 ? '#619e8e' : '#90b698');
      }
    }
  });

  // Connected meadows and encrusting plate carpets fill the spaces between
  // colonies without creating additional solid obstacles. Separate seeding
  // keeps this coverage stable when a coral family's detail level changes.
  const groundRandom = seededRandom(8293);
  const spacing = economy ? 4.8 : 3.5;
  for (let z = -101; z <= 29; z += spacing) {
    for (let x = -57; x <= 57; x += spacing) {
      const gx = x + (groundRandom() - .5) * spacing * .75;
      const gz = z + (groundRandom() - .5) * spacing * .75;
      const archRouteZ = THREE.MathUtils.clamp(gz, archZ - 8, archExitZ + 3);
      if (Math.hypot(gx - archX, gz - archRouteZ) < 7.8) continue;
      if (Math.hypot(gx, gz) < 5 || routeDistance(gx, gz) < 2.8) continue;
      if (LANDMARKS.some(({ position: [lx, , lz] }) => Math.hypot(gx - lx, gz - lz) < 6)) continue;
      // Long, organic meadow bands connect shallow shelves and outer ledges.
      const meadow = Math.sin(gx * .10 + gz * .065) + Math.cos(gz * .11 - gx * .045);
      if (meadow < -.7 && groundRandom() < .62) continue;
      meadowTufts++;
      const blades = economy ? 4 : 6;
      for (let blade = 0; blade < blades; blade++) {
        const angle = blade * 2.399, radius = .18 + groundRandom() * .65;
        const bx = gx + Math.cos(angle) * radius, bz = gz + Math.sin(angle) * radius;
        grass.add(new THREE.Vector3(bx, terrainHeightAt(bx, bz) + .025, bz),
          [.9, .3 + groundRandom() * .7, .9], [0, angle, (groundRandom() - .5) * .3],
          blade % 3 ? '#5a9482' : '#8aaa8f');
      }
      if (groundRandom() > .45) continue;
      groundCoverPatches++;
      for (let lobe = 0; lobe < (economy ? 2 : 3); lobe++) {
        const px = gx + (groundRandom() - .5) * 1.6, pz = gz + (groundRandom() - .5) * 1.6;
        const width = .45 + groundRandom() * .65;
        carpets.add(new THREE.Vector3(px, terrainHeightAt(px, pz) + .06, pz),
          [width, .18, width * (.7 + groundRandom() * .3)], [0, groundRandom() * TAU, 0],
          ['#a59181', '#83a797', '#c49c86', '#b4aa7e'][groundCoverPatches % 4]);
      }
    }
  }
  root.userData.habitatCounts = { colonies: colonyCount, meadowTufts, groundCoverPatches };

  // The shelf rolls into a deep basin well outside the swim boundary. Vertex
  // colors make sand, cliff faces and abyss readable without texture downloads.
  const sandGeometry = new THREE.PlaneGeometry(250, 340, economy ? 96 : 128, economy ? 128 : 172);
  sandGeometry.rotateX(-Math.PI / 2);
  sandGeometry.translate(0, 0, -45);
  const positions = sandGeometry.getAttribute('position'), sandColors = [], sandColor = new THREE.Color();
  const shelfColor = new THREE.Color('#b5c2ad'), abyssColor = new THREE.Color('#284d5d'), cliffColor = new THREE.Color('#638582');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const height = terrainHeightAt(x, z);
    positions.setY(i, height + .05 * Math.sin(x * 1.3 + z * .22));
    const depth = THREE.MathUtils.smoothstep(-height, 17, 46);
    sandColor.copy(shelfColor).lerp(cliffColor, THREE.MathUtils.smoothstep(-height, 16, 30)).lerp(abyssColor, depth);
    sandColors.push(sandColor.r, sandColor.g, sandColor.b);
  }
  sandGeometry.setAttribute('color', new THREE.Float32BufferAttribute(sandColors, 3));
  sandGeometry.computeVertexNormals();
  const sandMaterial = material('#ffffff', { vertexColors: true, roughness: .93 });
  sandMaterial.onBeforeCompile = shader => {
    shader.uniforms.uSandTime=swayTime;shader.uniforms.uSandLight=surfaceLight;
    shader.vertexShader = `varying vec3 vSandWorldPosition;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvSandWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `uniform float uSandTime;uniform float uSandLight;varying vec3 vSandWorldPosition;\n${shader.fragmentShader}`
      .replace('#include <common>', `#include <common>
float sandHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float sandNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = sandHash(cell);
  float b = sandHash(cell + vec2(1.0, 0.0));
  float c = sandHash(cell + vec2(0.0, 1.0));
  float d = sandHash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 sandP = vSandWorldPosition.xz;
float broadMottle = sandNoise(sandP * 0.075);
float fineMottle = sandNoise(sandP * 0.31 + vec2(broadMottle * 1.7));
float rippleWarp = sandNoise(sandP * 0.055 + vec2(19.0));
float softRipples = sin(sandP.x * 0.31 + sandP.y * 0.23 + (rippleWarp - 0.5) * 2.0)
  * sin(sandP.x * -0.17 + sandP.y * 0.29 + broadMottle * 1.2);
diffuseColor.rgb *= 0.91 + broadMottle * 0.12 + fineMottle * 0.075 + softRipples * 0.035;
vec2 causticP=sandP*.75+vec2(uSandTime*.12,-uSandTime*.08);
float cells=sin(causticP.x+sin(causticP.y*1.3)) * sin(causticP.y+sin(causticP.x*.8));
float caustics=pow(max(0.0,1.0-abs(cells)),14.0);
diffuseColor.rgb+=vec3(.15,.23,.20)*caustics*uSandLight*exp(min(vSandWorldPosition.y,0.0)*.043);`);
  };
  sandMaterial.customProgramCacheKey = () => 'reef-sand-surface-light-v2';
  const sand = new THREE.Mesh(sandGeometry, sandMaterial);
  sand.name = 'Sculpted reef shelf and abyss drop-off'; root.add(sand);

  // A compact limestone arch encloses an open 8 m swimming corridor. Its
  // three proxies stay separate so the central passage remains traversable.
  const archFloor = terrainHeightAt(archX, archZ);
  const archTop = archFloor + 8.4, archRoofBottom = archFloor + 6.1;
  const rockGeometry = new THREE.IcosahedronGeometry(1, 2);
  const archMat = material('#547574', { roughness: .94 });
  const archPieces = [
    { name: 'Arch left column', x: archX - 5.3, y: archFloor + 3.05, z: archZ, sx: 1.6, sy: 3.05, sz: 7.0 },
    { name: 'Arch right column', x: archX + 5.3, y: archFloor + 3.05, z: archZ, sx: 1.6, sy: 3.05, sz: 7.0 },
    { name: 'Arch overhang roof', x: archX, y: archFloor + 7.25, z: archZ, sx: 7.6, sy: 1.25, sz: 7.2 }
  ];
  for (const piece of archPieces) {
    const mesh = new THREE.Mesh(rockGeometry, archMat);
    mesh.name = piece.name;
    mesh.position.set(piece.x, piece.y, piece.z);
    mesh.scale.set(piece.sx, piece.sy, piece.sz);
    root.add(mesh);
  }
  const grottoProxies=[];
  const archGeometry=new THREE.TorusGeometry(1,.18,economy?7:10,economy?18:26,Math.PI);
  const grottoRibs=new THREE.InstancedMesh(archGeometry,archMat,grottoSites.length*3);
  grottoRibs.name='Limestone grotto arches';root.add(grottoRibs);
  const ribPose=new THREE.Object3D();let ribIndex=0;
  for(const [x,z,radius,length] of grottoSites){
    const floor=terrainHeightAt(x,z);
    // Successive stone ribs make a genuinely open tunnel, with a clear front/back exit.
    for(let rib=0;rib<3;rib++){
      const pz=z+(rib-1)*length*.62;
      ribPose.position.set(x,floor+.45,pz);ribPose.scale.set(radius,radius*.88,1.7);ribPose.updateMatrix();grottoRibs.setMatrixAt(ribIndex++,ribPose.matrix);
      for(let segment=0;segment<12;segment++){
        const angle=(segment+.5)/12*Math.PI;
        const center=new THREE.Vector3(x+Math.cos(angle)*radius,floor+.45+Math.sin(angle)*radius*.88,pz);
        const half=new THREE.Vector3(radius*.19,radius*.19,.42);
        grottoProxies.push(new THREE.Box3(center.clone().sub(half),center.clone().add(half)));
      }
    }
    for(const sign of [-1,1]){
      const px=x+sign*radius,base=terrainHeightAt(px,z);
      const top=floor+1;rocks.add(new THREE.Vector3(px,(base+top)*.5,z),[1.3,Math.max(.6,(top-base)*.5+.3),length],null,'#547574');
    }
    for(let n=0;n<12;n++){
      const a=n*2.4,px=x+Math.cos(a)*(radius+1.2),pz=z+Math.sin(a)*length;
      glow.add(new THREE.Vector3(px,terrainHeightAt(px,pz)+.35,pz),[.14,.23,.14],null,n%2?'#ba8fe8':'#81ded1');
      seaFan(new THREE.Vector3(px,terrainHeightAt(px,pz)-.08,pz),.6+n%3*.18,n%2?'#b187af':'#d39975');
    }
  }
  root.userData.grottoCount=grottoSites.length;
  grottoRibs.computeBoundingSphere();
  const localLights = [
    { x: archX, y: archFloor + 3.5, z: archZ, color: '#70d9c3', intensity: 7, distance: 15 },
    { x: -39, y: terrainHeightAt(-39, -86) + 5.2, z: -86, color: '#86bfe8', intensity: 5.5, distance: 16 },
    { x: 39, y: terrainHeightAt(39, -54) + 4.8, z: -54, color: '#8ce2bf', intensity: 5, distance: 14 },
    { x: -7, y: terrainHeightAt(-7, -100) + 5.5, z: -100, color: '#c1a5e8', intensity: 5.5, distance: 16 }
  ];
  for (const source of localLights) {
    const light = new THREE.PointLight(source.color, source.intensity, source.distance, 2);
    light.position.set(source.x, source.y, source.z);
    root.add(light);
    const polyp = new THREE.Mesh(new THREE.SphereGeometry(.27, 8, 6),
      material(source.color, { emissive: source.color, emissiveIntensity: 1.35, roughness: .3 }));
    polyp.name = 'Bioluminescent polyp cluster';
    polyp.position.copy(light.position);
    root.add(polyp);
  }
  // Collision proxies focus on substantial masses. Delicate branches, fans,
  // ribs and whips stay swimmable, avoiding thousands of tiny boxes.
  rocks.finish('Limestone outcrops', 'solid'); branches.finish('Branching staghorn coral'); tips.finish('Pale growing coral tips');
  plates.finish('Layered table corals');carpets.finish('Encrusting coral carpets'); fans.finish('Lacy branching sea fans');
  grass.finish('Curved sea grass'); tentacles.finish('Anemone tentacles'); domes.finish('Anemone cushions', 'solid');
  brains.finish('Grooved brain coral', 'solid'); sponges.finish('Hollow tube sponges', 'solid'); barrels.finish('Barrel sponge coral', 'solid');
  boulders.finish('Boulder coral', 'solid'); whips.finish('Swaying sea whips'); glow.finish('Bioluminescent reef polyps');
  const colonyProxyMesh = colonyProxies.finish('Hidden rounded coral colony collision volumes', 'solid');
  if (colonyProxyMesh) colonyProxyMesh.visible = false;
  root.userData.collisions = createCollisionWorld(root);
  for(const box of grottoProxies)root.userData.collisions.addBox(box,{mesh:'Grotto rib',kind:'arch'});
  for (const piece of archPieces) {
    const half = piece.name.includes('roof')
      ? new THREE.Vector3(7.6, 1.35, 7.2)
      : new THREE.Vector3(1.6, 3.05, 7.0);
    root.userData.collisions.addBox(new THREE.Box3(
      new THREE.Vector3(piece.x, piece.y, piece.z).sub(half),
      new THREE.Vector3(piece.x, piece.y, piece.z).add(half)
    ), { mesh: piece.name, kind: 'arch' });
  }
  root.userData.safeAscentRoute = position => {
    if (!position?.isVector3) return [];
    for(const [x,z,radius,length] of grottoSites){
      if(Math.abs(position.x-x)<radius+1&&Math.abs(position.z-z)<length+1&&position.y<terrainHeightAt(x,z)+radius+2){
        return [new THREE.Vector3(position.x,position.y,z+length+3),new THREE.Vector3(position.x,position.y+radius+3,z+length+3)];
      }
    }
    const dx = position.x - archX, dz = position.z - archZ;
    const underRoof = Math.abs(dx) < 6.4 && Math.abs(dz) < 6.5
      && position.y < archRoofBottom + .8 && position.y > archFloor - 1;
    if (!underRoof) return [];
    const exitZ = archZ + 12.5;
    return [
      new THREE.Vector3(position.x, Math.min(position.y, archRoofBottom - .6), exitZ),
      new THREE.Vector3(position.x, archTop + 2.5, exitZ)
    ];
  };
  root.userData.terrainHeightAt = terrainHeightAt;
  root.userData.bounds = WORLD_BOUNDS;
  root.userData.update = (elapsed, night = 0, depth = 0) => {
    swayTime.value = elapsed;
    glowMat.emissiveIntensity = .1 + depth * .4 + night * (.85 + .12 * Math.sin(elapsed * .6));
  };
  return root;
}

function tailGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, -.33, .27, 0, -.24, 0, .018,
    0, 0, 0, -.24, 0, .018, -.33, -.27, 0
  ], 3));
  geometry.computeVertexNormals(); return geometry;
}

function fishBodyGeometry(type, economy) {
  const geometry = new THREE.SphereGeometry(1, economy ? 10 : 14, economy ? 6 : 8);
  const vertices = geometry.getAttribute('position');
  const dimensions = type === 'tang' ? [.48, .43, .125] : type === 'clown' ? [.59, .28, .17] : [.79, .16, .105];
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), taper = .78 + .22 * (1 - x * x);
    vertices.setXYZ(i, x * dimensions[0], vertices.getY(i) * dimensions[1] * taper, vertices.getZ(i) * dimensions[2] * taper);
  }
  geometry.computeVertexNormals(); return geometry;
}

function clownMaterial() {
  const mat = material('#ffffff', { roughness: .43 });
  mat.onBeforeCompile = shader => {
    shader.vertexShader = `varying float vFishX;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFishX = position.x;');
    shader.fragmentShader = `varying float vFishX;\n${shader.fragmentShader}`.replace('#include <color_fragment>',
      `#include <color_fragment>\nfloat bandDistance = min(abs(vFishX-.34),min(abs(vFishX+.02),abs(vFishX+.37)));\nfloat bandEdge = 1.-smoothstep(.057,.072,bandDistance);\nfloat bandWhite = 1.-smoothstep(.033,.048,bandDistance);\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.10,.20,.23),bandEdge);\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.92,.95,.87),bandWhite);`);
  };
  mat.customProgramCacheKey = () => 'clownfish-white-bands-v1';
  return mat;
}

function roundedTailGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -.055); shape.quadraticCurveTo(-.17, -.10, -.32, -.22);
  shape.quadraticCurveTo(-.43, 0, -.32, .22); shape.quadraticCurveTo(-.17, .10, 0, .055); shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 5); geometry.computeVertexNormals(); return geometry;
}

export function createMarineLife({ economy = false } = {}) {
  const root = new THREE.Group(); root.name = 'Schooling reef fish';
  const random = seededRandom(906);
  const count = economy ? 48 : 80;
  const familyCounts = economy ? { silver: 20, tang: 16, clown: 12 } : { silver: 34, tang: 24, clown: 22 };
  const families = {};
  for (const type of ['silver', 'tang', 'clown']) {
    const bodies = new THREE.InstancedMesh(fishBodyGeometry(type, economy), type === 'clown' ? clownMaterial() : material('#ffffff', { roughness: type === 'silver' ? .3 : .45, metalness: type === 'silver' ? .32 : .05 }), familyCounts[type]);
    const tails = new THREE.InstancedMesh(type === 'clown' ? roundedTailGeometry() : tailGeometry(), material('#ffffff', { side: THREE.DoubleSide, roughness: .48 }), familyCounts[type]);
    bodies.name = `${type} fish bodies`; tails.name = `${type} animated tails`;
    families[type] = { bodies, tails, cursor: 0 };
    root.add(bodies, tails);
  }
  const finGeometry = new THREE.BufferGeometry();
  finGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-.35, .23, 0, -.15, .58, 0, .22, .24, 0], 3));
  finGeometry.computeVertexNormals();
  const fins = new THREE.InstancedMesh(finGeometry, material('#ffffff', { side: THREE.DoubleSide }), count);
  const eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), material('#142c33', { roughness: .25 }), count * 2);
  root.add(fins, eyes);
  for (const mesh of root.children) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Fish move continuously; this bounded swarm is cheap enough to draw whole.
    mesh.frustumCulled = false;
  }
  fins.name = 'Dorsal fins'; eyes.name = 'Fish eyes';
  const schools = [
    { center: new THREE.Vector3(-5, -7.4, -9), color: '#c4e0df', size: .74, type: 'silver', count: economy ? 10 : 18 },
    { center: new THREE.Vector3(7, -9, -19), color: '#75abd4', size: .86, type: 'tang', count: economy ? 8 : 12 },
    { center: new THREE.Vector3(-11, -10.2, -32), color: '#eea26c', size: .75, type: 'clown', count: economy ? 6 : 12 },
    { center: new THREE.Vector3(28, -31, -52), color: '#c5d7de', size: .83, type: 'silver', count: economy ? 10 : 16 },
    { center: new THREE.Vector3(-32, -39, -66), color: '#dec77b', size: .94, type: 'tang', count: economy ? 8 : 12 },
    { center: new THREE.Vector3(12, -48, -88), color: '#d69a88', size: .82, type: 'clown', count: economy ? 6 : 10 }
  ];
  const disturbances = schools.map(() => ({ scatterUntil: 0, cooldownUntil: 0, near: false, away: new THREE.Vector3(1, .12, 0) }));
  const fish = [];
  const color = new THREE.Color();
  for (let school = 0; school < schools.length; school++) {
    const group = schools[school];
    for (let member = 0; member < group.count; member++) {
    const i = fish.length, family = families[group.type], slot = family.cursor++;
    fish.push({
      position: group.center.clone().add(new THREE.Vector3((random() - .5) * 5, (random() - .5) * 1.4, (random() - .5) * 4)),
      velocity: new THREE.Vector3(1.1 + random() * .5, (random() - .5) * .12, (random() - .5) * .6),
      acceleration: new THREE.Vector3(), school, type: group.type, slot,
      size: group.size * (.75 + random() * .45), phase: random() * TAU
    });
    color.set(group.color).offsetHSL((random() - .5) * .018, 0, (random() - .5) * .08);
    family.bodies.setColorAt(slot, color);
    family.tails.setColorAt(slot, group.type === 'tang' ? new THREE.Color('#e5c779') : color);
    fins.setColorAt(i, color);
    }
  }
  const dummy = new THREE.Object3D(), quaternion = new THREE.Quaternion();
  const direction = new THREE.Vector3(), tailRotation = new THREE.Quaternion();
  const cohesion = new THREE.Vector3(), alignment = new THREE.Vector3(), separation = new THREE.Vector3();
  const offset = new THREE.Vector3(), target = new THREE.Vector3(), steering = new THREE.Vector3();
  const bounds = { x: [-54, 54], y: [-56, -5.2], z: [-98, 29] };

  function draw(elapsed) {
    fish.forEach((f, i) => {
      const family = families[f.type];
      direction.copy(f.velocity).normalize();
      quaternion.setFromUnitVectors(FORWARD, direction);
      dummy.position.copy(f.position); dummy.quaternion.copy(quaternion); dummy.scale.setScalar(f.size);
      dummy.updateMatrix(); family.bodies.setMatrixAt(f.slot, dummy.matrix);
      dummy.scale.set(f.size, f.size * (f.type === 'silver' ? .6 : f.type === 'clown' ? .8 : 1), f.size);
      dummy.updateMatrix(); fins.setMatrixAt(i, dummy.matrix);
      dummy.scale.setScalar(f.size);
      offset.set((f.type === 'silver' ? -.72 : f.type === 'tang' ? -.43 : -.53) * f.size, 0, 0).applyQuaternion(quaternion);
      dummy.position.copy(f.position).add(offset);
      tailRotation.setFromAxisAngle(UP, Math.sin(elapsed * (8 + f.size) + f.phase) * .48);
      dummy.quaternion.copy(quaternion).multiply(tailRotation); dummy.updateMatrix(); family.tails.setMatrixAt(f.slot, dummy.matrix);
      for (let side = 0; side < 2; side++) {
        offset.set((f.type === 'silver' ? .49 : .29) * f.size, .07 * f.size, (side ? 1 : -1) * (f.type === 'clown' ? .15 : .11) * f.size).applyQuaternion(quaternion);
        dummy.position.copy(f.position).add(offset); dummy.quaternion.copy(quaternion);
        dummy.scale.setScalar(.026 * f.size); dummy.updateMatrix(); eyes.setMatrixAt(i * 2 + side, dummy.matrix);
      }
    });
    for (const mesh of root.children) mesh.instanceMatrix.needsUpdate = true;
  }

  function update(dt, elapsed, cameraPosition) {
    const step = Math.min(Math.max(dt || 0, 0), .05);
    if (cameraPosition?.isVector3) schools.forEach((school, index) => {
      const disturbance = disturbances[index];
      const distanceSq = cameraPosition.distanceToSquared(school.center);
      if (distanceSq > 196) disturbance.near = false;
      if (distanceSq < 100 && !disturbance.near && elapsed >= disturbance.cooldownUntil) {
        disturbance.near = true;
        disturbance.away.subVectors(school.center, cameraPosition).setY(.12).normalize();
        disturbance.scatterUntil = elapsed + 2.4;
        disturbance.cooldownUntil = elapsed + 6.5;
      }
    });
    if (step) {
      // Compute forces from the previous frame before integrating any fish.
      fish.forEach(f => {
        cohesion.set(0, 0, 0); alignment.set(0, 0, 0); separation.set(0, 0, 0);
        let neighbors = 0;
        for (const other of fish) {
          if (other === f || other.school !== f.school) continue;
          offset.subVectors(f.position, other.position);
          const distanceSq = offset.lengthSq();
          if (distanceSq < 30.25) {
            cohesion.add(other.position); alignment.add(other.velocity); neighbors++;
            if (distanceSq < 1.35 && distanceSq > .0001) separation.addScaledVector(offset, 1 / distanceSq);
          }
        }
        f.acceleration.copy(separation).multiplyScalar(1.65);
        if (neighbors) {
          cohesion.multiplyScalar(1 / neighbors).sub(f.position);
          alignment.multiplyScalar(1 / neighbors).sub(f.velocity);
          f.acceleration.addScaledVector(cohesion, .18).addScaledVector(alignment, .72);
        }
        const school = schools[f.school], disturbance = disturbances[f.school];
        const phase = elapsed * .12 + f.school * 1.6;
        target.set(school.center.x + Math.sin(phase) * 5.5,
          school.center.y + Math.sin(phase * .7) * .55,
          school.center.z + Math.cos(phase) * 3.2);
        if (elapsed < disturbance.scatterUntil) {
          target.addScaledVector(disturbance.away, 12);
          target.y += 2.1;
        }
        steering.subVectors(target, f.position).multiplyScalar(elapsed < disturbance.scatterUntil ? .16 : .095);
        f.acceleration.add(steering);
        const floor = terrainHeightAt(f.position.x, f.position.z) + 2.8;
        if (f.position.y < floor) f.acceleration.y += (floor - f.position.y) * .8;
        for (const axis of ['x', 'y', 'z']) {
          const [min, max] = bounds[axis], p = f.position[axis], margin = axis === 'y' ? .8 : 3;
          if (p < min + margin) f.acceleration[axis] += (min + margin - p) * .85;
          if (p > max - margin) f.acceleration[axis] -= (p - max + margin) * .85;
        }
        if (cameraPosition?.isVector3) {
          offset.subVectors(f.position, cameraPosition);
          const distanceSq = offset.lengthSq();
          if (distanceSq < 5 && distanceSq > .001) f.acceleration.addScaledVector(offset, .7 / distanceSq);
        }
        f.acceleration.clampLength(0, 2.2);
      });
      fish.forEach(f => {
        f.velocity.addScaledVector(f.acceleration, step);
        const speed = f.velocity.length();
        if (speed < .65) {
          if (speed < .0001) f.velocity.set(1, 0, 0);
          f.velocity.setLength(.65);
        } else if (speed > 1.8) f.velocity.setLength(1.8);
        f.position.addScaledVector(f.velocity, step);
        const floor = terrainHeightAt(f.position.x, f.position.z) + 1.7;
        if (f.position.y < floor) { f.position.y = floor; f.velocity.y = Math.abs(f.velocity.y) * .5; }
        for (const axis of ['x', 'y', 'z']) {
          const [min, max] = bounds[axis];
          if (f.position[axis] < min || f.position[axis] > max) {
            f.position[axis] = THREE.MathUtils.clamp(f.position[axis], min, max);
            f.velocity[axis] *= -.5;
          }
        }
      });
    }
    draw(elapsed || 0);
  }
  update(0, 0);
  return { root, update, count };
}
