import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { intensity } from './weather.js';

// Shared gull anatomy, articulated shoulder/elbow joints and long glides.
export function createSeabirds({ economy = false } = {}) {
  const root = new THREE.Group();
  root.name = 'Coastal gull flock';
  const count = economy ? 7 : 12;
  const white = new THREE.MeshStandardMaterial({ color: '#e2e6df', roughness: .85, side: THREE.DoubleSide });
  const tips = new THREE.MeshStandardMaterial({ color: '#58636a', roughness: .9, side: THREE.DoubleSide });
  const yellow = new THREE.MeshStandardMaterial({ color: '#b9a46d', roughness: .9 });
  function ellipsoid(x, y, z, sx, sy, sz) {
    const geometry = new THREE.SphereGeometry(1, 10, 7).scale(sx, sy, sz).translate(x, y, z).toNonIndexed();
    geometry.deleteAttribute('uv');
    return geometry;
  }
  function surface(stations) {
    const vertices = [], indices = [];
    // Cambered chord samples give each wing a curved, tapered outline.
    stations.forEach(([x, front, back, lift]) => {
      vertices.push(x, 0, front, x, lift, (front + back) / 2, x, 0, back);
    });
    for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < 2; j++) {
      const a = i * 3 + j, b = a + 3;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }
  const tail = surface([[0, .30, .47, .015], [.11, .34, .59, .01], [.17, .44, .56, 0]]).toNonIndexed();
  const otherTail = tail.clone().scale(-1, 1, 1);
  const bodyParts = [ellipsoid(0, 0, .02, .095, .105, .32),
    ellipsoid(0, .055, -.24, .067, .074, .13),
    ellipsoid(0, .07, -.35, .078, .073, .095), tail, otherTail];
  const bodyGeometry = mergeGeometries(bodyParts, false);
  bodyParts.forEach(part => part.dispose());
  const beakGeometry = new THREE.ConeGeometry(.032, .13, 6).rotateX(-Math.PI / 2).translate(0, .061, -.474);
  const innerGeometry = surface([[.045, -.10, .12, .018], [.21, -.16, .19, .033],
    [.40, -.12, .21, .027], [.57, -.055, .18, .012]]);
  const outerGeometry = surface([[0, -.055, .18, .012], [.19, -.02, .20, .023],
    [.39, .045, .235, .016], [.58, .13, .27, .008], [.75, .25, .285, 0]]);
  const tipGeometry = surface([[.54, .12, .265, .008], [.64, .177, .282, .003], [.75, .25, .285, 0]]);
  function instances(geometry, material, amount) {
    const mesh = new THREE.InstancedMesh(geometry, material, amount);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  }
  const bodies = instances(bodyGeometry, white, count), beaks = instances(beakGeometry, yellow, count);
  const innerWings = instances(innerGeometry, white, count * 2);
  const outerWings = instances(outerGeometry, white, count * 2);
  const darkTips = instances(tipGeometry, tips, count * 2);
  const bird = new THREE.Object3D(), shoulder = new THREE.Object3D(), elbow = new THREE.Object3D();
  bird.add(shoulder); shoulder.add(elbow);
  const meshes = [bodies, beaks, innerWings, outerWings, darkTips];
  const counts = { birds: count, meshes: meshes.length, drawCalls: meshes.length, triangles: 0 };
  for (const mesh of meshes) counts.triangles += mesh.count * (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  function update(time, camera, night, underwater) {
    // Gulls thin out as rain sets in and are gone before a storm arrives.
    const flying = count * Math.max(0, 1 - .45 * Math.min(1, intensity.rain * 2) - .6 * intensity.storm);
    root.visible = underwater < .4 && night < .85 && flying > .02;
    if (!root.visible) return;
    for (let i = 0; i < count; i++) {
      const phase = i * 1.7, radius = 26 + i * 3.2, angle = time * .025 + phase;
      const vx = Math.cos(angle), vz = -Math.sin(angle) * .42;
      bird.position.set(Math.sin(angle) * radius, 17 + Math.sin(time * .12 + phase) * 1.6 + i * .45,
        -64 + Math.cos(angle) * radius * .42);
      bird.rotation.set(.025 * Math.sin(time * .5 + phase), Math.atan2(-vx, -vz), -.16 * Math.sin(angle));
      bird.scale.setScalar((.92 + (i % 4) * .07) * Math.min(1, Math.max(0, flying - i)));
      bird.updateMatrixWorld(true);
      bodies.setMatrixAt(i, bird.matrixWorld); beaks.setMatrixAt(i, bird.matrixWorld);
      // A short smoothly enveloped burst every 15 seconds, followed by a glide.
      const cycle = (time + phase * 2.3) % 15;
      const envelope = cycle < 3.4 ? Math.sin(Math.PI * cycle / 3.4) ** 2 : 0;
      const flap = Math.sin(time * 5.5 + phase) * .36 * envelope;
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? 1 : -1, index = i * 2 + side;
        shoulder.scale.set(sign, 1, 1);
        shoulder.rotation.set(0, 0, sign * (.09 + flap));
        elbow.position.set(.57, 0, 0);
        elbow.rotation.set(.035 * envelope, -.035,
          -.06 + .14 * envelope * Math.sin(time * 5.5 + phase - .55));
        bird.updateMatrixWorld(true);
        innerWings.setMatrixAt(index, shoulder.matrixWorld);
        outerWings.setMatrixAt(index, elbow.matrixWorld);
        darkTips.setMatrixAt(index, elbow.matrixWorld);
      }
    }
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  }
  update(0, null, 0, 0);
  return { root, update, counts };
}
