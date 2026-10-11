import * as THREE from './vendor/three.module.min.js';

const TAU = Math.PI * 2;
const FORWARD = new THREE.Vector3(0, 0, -1);

function sharkGeometry() {
  const body = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#4d8292', roughness: .72, metalness: .02 });
  const pale = new THREE.MeshStandardMaterial({ color: '#b7d1cc', roughness: .86 });
  const finMat = new THREE.MeshStandardMaterial({ color: '#416e7e', roughness: .76, side: THREE.DoubleSide });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), skin);
  torso.scale.set(.72, .7, 2.75); torso.position.z = -.12; body.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), pale);
  belly.scale.set(.59, .24, 2.14); belly.position.set(0, -.35, -.2); body.add(belly);
  function fin(points, z = 0) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex([0, 1, 2]); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, finMat); mesh.position.z = z; body.add(mesh); return mesh;
  }
  fin([[0, .55, 0], [-.77, 0, -.7], [.77, 0, -.7]], -.1);
  fin([[0, .1, 0], [-.53, 0, -.62], [.53, 0, -.62]], 1.18);
  fin([[0, .08, 0], [-.38, 0, -.48], [.38, 0, -.48]], -1.2);
  const tail = new THREE.Group(); tail.position.z = 2.45; body.add(tail);
  const upper = new THREE.Mesh(new THREE.ConeGeometry(.52, 1.65, 3), finMat);
  upper.rotation.x = Math.PI; upper.scale.set(.46, 1, .25); upper.position.y = .48; tail.add(upper);
  const lower = new THREE.Mesh(new THREE.ConeGeometry(.4, 1.12, 3), finMat);
  lower.scale.set(.48, 1, .25); lower.position.y = -.38; tail.add(lower);
  return { body, tail };
}

function mantaGeometry() {
  const body = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#354e70', roughness: .55, side: THREE.DoubleSide });
  const light = new THREE.MeshStandardMaterial({ color: '#bbd1d6', roughness: .72, side: THREE.DoubleSide });
  const mantle = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), dark);
  mantle.scale.set(1.2, .23, 1.42); body.add(mantle);
  const underside = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), light);
  underside.scale.set(.84, .12, 1.13); underside.position.y = -.13; body.add(underside);
  const wings = [];
  for (const side of [-1, 1]) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([0, 0, -.3, side * 1.25, -.04, -.12, side * 3.65, -.1, -.88, side * 2.2, -.03, .66]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
    const wing = new THREE.Mesh(geometry, dark); body.add(wing); wings.push({ geometry, side, base: positions.slice() });
  }
  const cephalic = new THREE.Mesh(new THREE.ConeGeometry(.24, .8, 8), dark);
  cephalic.rotation.x = Math.PI / 2; cephalic.position.set(.72, 0, -1.05); body.add(cephalic);
  cephalic.updateMatrix(); const left = cephalic.clone(); left.position.x *= -1; left.rotation.z = Math.PI; body.add(left);
  const tailCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, .8), new THREE.Vector3(0, -.05, 1.55), new THREE.Vector3(.03, -.08, 2.5)]);
  body.add(new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 10, .045, 5, false), dark));
  return { body, wings };
}

function routePoint(elapsed, index, radiusX, radiusZ, phase, direction = 1) {
  const angle = elapsed * .035 * direction + phase + index * Math.PI;
  return new THREE.Vector3(Math.cos(angle) * radiusX, 0, Math.sin(angle) * radiusZ - 70);
}

export function createVisitors({ terrainHeightAt, economy = false } = {}) {
  const root = new THREE.Group(); root.name = 'Calm large marine visitors';
  const sharks = [], rays = [];
  const sharkCount = economy ? 1 : 2;
  const rayCount = economy ? 1 : 2;
  for (let i = 0; i < sharkCount; i++) {
    const made = sharkGeometry();
    const scale = i === 0 ? 1.15 : .94;
    made.body.scale.setScalar(scale);
    root.add(made.body); sharks.push({ ...made, phase: i * .35, scale });
  }
  for (let i = 0; i < rayCount; i++) {
    const made = mantaGeometry();
    made.body.scale.setScalar(i === 0 ? 1.15 : .95);
    root.add(made.body); rays.push({ ...made, phase: i * .35 + .9 });
  }
  const target = new THREE.Vector3(), ahead = new THREE.Vector3(), floorAt = (x, z) => terrainHeightAt?.(x, z) ?? -36;

  let initialized=false;
  function update(dt, elapsed = 0, playerPosition = null) {
    if(initialized && !dt)return;
    const time = Math.max(0, elapsed || 0);
    sharks.forEach((shark, i) => {
      const p = routePoint(time, i, 42, 30, shark.phase, .72);
      p.y = Math.max(floorAt(p.x,p.z)+3,Math.min(-29, floorAt(p.x, p.z) + 10 + Math.sin(time * .28 + i) * .8))+Math.sin(time*.75+i*2)*.1;
      if(!initialized)shark.body.position.copy(p);else shark.body.position.lerp(p,1-Math.exp(-dt*.8));
      const next = routePoint(time + .4, i, 42, 30, shark.phase, .72);
      ahead.set(next.x - p.x, 0, next.z - p.z).normalize();
      shark.body.quaternion.setFromUnitVectors(FORWARD, ahead);
      shark.body.rotateY(Math.sin(time * 1.3 + i) * .045);
      shark.tail.rotation.y = Math.sin(time * 2.2 + i) * .24;
    });
    rays.forEach((ray, i) => {
      const p = routePoint(time, i, 33, 23, ray.phase, -.48);
      p.y = Math.max(floorAt(p.x,p.z)+3,Math.min(-30, floorAt(p.x, p.z) + 12 + Math.sin(time * .2 + i) * 1.2))+Math.sin(time*1.1+i)*.1;
      if(!initialized)ray.body.position.copy(p);else ray.body.position.lerp(p,1-Math.exp(-dt*.72));
      const next = routePoint(time + .5, i, 33, 23, ray.phase, -.48);
      ahead.set(next.x - p.x, 0, next.z - p.z).normalize();
      ray.body.quaternion.setFromUnitVectors(FORWARD, ahead);
      ray.body.rotateZ(Math.sin(time * .32 + i) * .055);
      ray.wings.forEach(({ geometry, side, base }) => {
        const position = geometry.getAttribute('position');
        position.array.set(base);
        const flap = Math.sin(time * 2.2 + i * 1.7) * .5;
        position.setY(2, base[7] + flap * 1.3);
        position.needsUpdate = true; geometry.computeVertexNormals();
      });
    });
    initialized=true;
  }
  update(0, 0);
  return { root, update, count: sharks.length + rays.length };
}
