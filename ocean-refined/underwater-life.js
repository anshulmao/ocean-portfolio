import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { shareLater } from './assets.js';

const TAU = Math.PI * 2;

// Jellyfish share a small set of instanced parts (bells, oral arms, tentacles):
// adding a habitat does not add another material or draw call. The turtles,
// sea stars and urchins that used to be built here are models of the creature
// set now (creature-species.js), placed by user-creatures.js, so they count in
// the dive log.
export function createUnderwaterLife(options) { const steps = underwaterLifeSteps(options); let step; while (!(step = steps.next()).done); return step.value; }
// The same build, pausing (yielding) every few milliseconds of work so the page can do it between frames.
export function* underwaterLifeSteps({ economy = false, terrainHeightAt = () => -54 } = {}) {
  const root = new THREE.Group(); root.name = 'Jellyfish and sea pens';
  const jellyCount = economy ? 16 : 30;
  const mat = (color, extras = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, ...extras });
  // Oral arms are a hand across: a coarse sphere is enough.
  const blob = new THREE.SphereGeometry(1, 10, 6);
  const batches = [];
  function batch(name, geometry, material, count) {
    const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = name;
    // Animals are culled one by one in update(); the mesh spans the reef.
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    root.add(mesh); batches.push(mesh); return mesh;
  }
  const part = new THREE.Object3D();

  yield;
  const jellyMat = mat('#ba83e8', { transparent: true, opacity: .67, depthWrite: false, side: THREE.DoubleSide, emissive: '#7146b3', emissiveIntensity: .16 });
  const bells = batch('Soft translucent jellyfish bells', new THREE.SphereGeometry(1, economy ? 12 : 14, 7, 0, TAU, 0, Math.PI * .54), jellyMat, jellyCount);
  const oral = batch('Jellyfish oral arms', blob, mat('#debdff', { transparent: true, opacity: .65, depthWrite: false }), jellyCount);
  const trail = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => new THREE.Vector3(Math.sin(i * .9) * .055, -i * .15, Math.cos(i * .8) * .035)));
  // A tentacle is a 2.4 cm thread: three sides and one ring per control point.
  const tentacles = batch('Trailing jellyfish tentacles', new THREE.TubeGeometry(trail, economy ? 8 : 9, .012, 3, false), mat('#a97cd8', { transparent: true, opacity: .72, depthWrite: false }), jellyCount * 6);
  const jellyMeshes = [bells, oral, tentacles];

  const transform = new THREE.Matrix4();
  const bounds = new THREE.Sphere();
  const floorAt = (x,z) => { const h = terrainHeightAt(x,z); return Number.isFinite(h) ? h : -54; };
  function place(mesh, index, px, py, pz, sx, sy, sz, rx = 0, ry = 0, rz = 0, parent = null) {
    part.position.set(px, py, pz); part.scale.set(sx, sy, sz); part.rotation.set(rx, ry, rz); part.updateMatrix();
    if (parent) transform.multiplyMatrices(parent, part.matrix); else transform.copy(part.matrix);
    mesh.setMatrixAt(index, transform);
  }

  const statics = [];

  // Sparse living sea pens on the deep shelf. Tiny crowns glow locally; the
  // surrounding water stays dark. Three spatial batches, no point lights.
  yield;
  const glowMaterial = mat('#83cfcf', { emissive: '#4cabae', emissiveIntensity: .6, roughness: .8 });
  const stem = new THREE.CylinderGeometry(.023, .048, .58, 5).translate(0, .29, 0);
  const crown = new THREE.SphereGeometry(.075, 5, 4).scale(1, 1.4, 1).translate(0, .62, 0);
  const seaPen = mergeGeometries([stem, crown], false), glowBands = new Map();
  for(let i=0;i<(economy?66:132);i++){
    const x=Math.sin(i*2.399)* (27 + i%6*7), z=-37-(i*.723)%86, y=floorAt(x,z);
    if(y>-28 || [[18,-39],[-18,-82],[20,-72],[-33,-73],[39,-91]].some(([px,pz])=>Math.hypot(x-px,z-pz)<7))continue;
    const band=Math.floor((z+130)/32), scale=.7+(i%5)*.2;
    part.position.set(x,y-.025,z);part.scale.set(scale,scale,scale);part.rotation.set(0,i*1.7,0);part.updateMatrix();
    if(!glowBands.has(band))glowBands.set(band,[]);glowBands.get(band).push(seaPen.clone().applyMatrix4(part.matrix));
    if(i%22===21)yield;
  }
  for(const pieces of glowBands.values()){
    yield;
    const mesh=shareLater(new THREE.Mesh(mergeGeometries(pieces,false),glowMaterial));mesh.name='Deep luminous sea pens';mesh.matrixAutoUpdate=false;mesh.geometry.computeBoundingSphere();root.add(mesh);statics.push(mesh);pieces.forEach(g=>g.dispose());
  }
  seaPen.dispose();stem.dispose();crown.dispose();

  const jellyHabitats = [
    {x:8,z:-20,lift:5.5},{x:-34,z:-39,lift:6.8},
    {x:37,z:-53,lift:7.8},{x:-9,z:-65,lift:9.5},
    {x:-37,z:-93,lift:11}
  ];
  // view: { frustum, eye, range }. far shortens the range for small animals.
  const seen = (view, x, y, z, radius, far) => {
    if (!view) return true;
    bounds.center.set(x, y, z); bounds.radius = radius;
    return view.eye.distanceTo(bounds.center) - radius < view.range * far && view.frustum.intersectsSphere(bounds);
  };
  let initialized = false;
  function update(dt, elapsed = 0, playerPosition = null, view = null) {
    // A paused scene still needs culling when the camera turns.
    if (initialized && !(dt > 0) && !view) return;
    const time = Number.isFinite(elapsed) ? Math.max(0,elapsed) : 0;
    for (const mesh of statics) {
      const sphere = mesh.geometry.boundingSphere;
      mesh.visible = !view || view.eye.distanceTo(sphere.center) - sphere.radius < view.range * .4;
    }
    // Animals in view are packed to the front of each mesh; the rest are
    // neither animated nor counted, so they cost no matrix or vertex work.
    let jellies = 0;
    for (let i = 0; i < jellyCount; i++) {
      const habitat = jellyHabitats[i % jellyHabitats.length];
      const member = Math.floor(i / jellyHabitats.length), spread = 2.4 + member * 1.1;
      const x = habitat.x + Math.sin(i * 2.4) * spread + Math.sin(time*.10+i) * .65;
      const z = habitat.z + Math.cos(i*2.4) * spread + Math.cos(time*.08+i)*.5;
      const y = floorAt(x,z) + habitat.lift + member * .8 + Math.sin(time*.65+i)*.18;
      const size = .64 + (i%3)*.12, pulse = Math.sin(time * 1.8 + i * 1.1);
      if (!seen(view, x, y - .5 * size, z, 1.3 * size, .65)) continue;
      const n = jellies++;
      place(bells,n,x,y,z,size * (.50 + pulse*.035),size * (.33-pulse*.025),size * (.50+pulse*.035));
      place(oral,n,x,y-.15*size,z,size*.12,size*.28,size*.12);
      for (let j = 0; j < 6; j++) {
        const a = j / 6 * TAU;
        place(tentacles,n*6+j,x+Math.cos(a)*size*.29,y-.02,z+Math.sin(a)*size*.29,size, size * (.83+(j%3)*.12), size,Math.sin(time*.7+i+j)*.05,a+time*.05,Math.sin(time*.6+i+j)*.06);
      }
    }
    for (const mesh of jellyMeshes) { mesh.count = jellies * (mesh === tentacles ? 6 : 1); mesh.visible = jellies > 0; mesh.instanceMatrix.needsUpdate = true; }
    initialized = true;
  }
  update(0,0);
  return { root, update, counts: { jellyfish:jellyCount, drawCalls:batches.length + statics.length } };
}
