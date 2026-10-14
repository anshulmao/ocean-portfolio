import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { shareLater } from './assets.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

// All animals share a small set of instanced parts, including moving flippers
// and tentacles. Adding a habitat does not add another material or draw call.
// Whatever is rigid in an animal is one part: a turtle is a shell, a body and
// four flippers (three draw calls for every turtle on the reef).
export function createUnderwaterLife(options) { const steps = underwaterLifeSteps(options); let step; while (!(step = steps.next()).done); return step.value; }
// The same build, pausing (yielding) every few milliseconds of work so the page can do it between frames.
export function* underwaterLifeSteps({ economy = false, terrainHeightAt = () => -54 } = {}) {
  const root = new THREE.Group(); root.name = 'Turtles, jellyfish and seabed life';
  const turtleCount = economy ? 4 : 7, jellyCount = economy ? 16 : 30;
  const starCount = economy ? 35 : 60, urchinCount = economy ? 30 : 54;
  const mat = (color, extras = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, ...extras });
  const sphere = new THREE.SphereGeometry(1, economy ? 12 : 18, economy ? 8 : 12);
  // Eyes, oral arms and urchins are a few centimetres to a hand across: they
  // do not need the turtle shell's tessellation.
  const bead = new THREE.SphereGeometry(1, 8, 6), blob = new THREE.SphereGeometry(1, 10, 6), round = new THREE.SphereGeometry(1, 12, 8);
  const skin = mat('#8eaa87');
  const shellMat = mat('#667d5b');
  // Fine seams provide the characteristic shell plates without extra geometry.
  shellMat.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vShellPoint;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvShellPoint = position;');
    shader.fragmentShader = `varying vec3 vShellPoint;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
      float seamA = abs(abs(vShellPoint.x) - .43);
      float seamB = abs(fract((vShellPoint.z + 1.0) * 2.0) - .5);
      float seams = (1.0 - smoothstep(.018,.044,min(seamA,seamB))) * smoothstep(.0,.28,vShellPoint.y);
      diffuseColor.rgb *= 1.0 - seams * .27;`);
  };
  shellMat.customProgramCacheKey = () => 'turtle-shell-plates-v1';
  const batches = [];
  function batch(name, geometry, material, count) {
    const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = name;
    // Animals are culled one by one in update(); the mesh spans the reef.
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    root.add(mesh); batches.push(mesh); return mesh;
  }
  const paint = (geometry, hex) => {
    const color = new THREE.Color(hex), count = geometry.getAttribute('position').count, data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(data, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
    return geometry;
  };
  const part = new THREE.Object3D();
  // A copy of a primitive, posed in the animal's own frame and painted.
  const posed = (geometry, hex, px, py, pz, sx, sy, sz, rx = 0) => {
    part.position.set(px, py, pz); part.scale.set(sx, sy, sz); part.rotation.set(rx, 0, 0); part.updateMatrix();
    return paint(geometry.clone().applyMatrix4(part.matrix), hex);
  };
  const shell = batch('Olive turtle shells', sphere, shellMat, turtleCount);
  // Plastron, neck, head, eyes and tail never move against each other.
  const torsoParts = [posed(round, '#c5c5a0', 0, -.10, .03, .56, .11, .74), posed(round, '#8eaa87', 0, 0, -.87, .13, .12, .30), posed(round, '#8eaa87', 0, .02, -1.12, .19, .15, .23),
    posed(bead, '#293d38', -.163, .075, -1.20, .028, .028, .028), posed(bead, '#293d38', .163, .075, -1.20, .028, .028, .028),
    posed(new THREE.ConeGeometry(.07, .32, 7), '#8eaa87', 0, -.06, .92, 1, 1, 1, Math.PI / 2)];
  const torso = batch('Turtle bodies', mergeGeometries(torsoParts, false), mat('#ffffff', { vertexColors: true }), turtleCount);
  torsoParts.forEach(geometry => geometry.dispose());
  yield;
  const paddle = new THREE.Shape();
  paddle.moveTo(0, -.12); paddle.quadraticCurveTo(.45, -.40, 1.04, -.18);
  paddle.quadraticCurveTo(1.24, -.10, 1.05, .04); paddle.quadraticCurveTo(.45, .27, 0, .10);
  const paddleGeometry = new THREE.ExtrudeGeometry(paddle, { depth: .055, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 1, steps: 1, curveSegments: economy ? 5 : 8 });
  paddleGeometry.rotateX(Math.PI / 2);
  const flippers = batch('Turtle flippers', paddleGeometry, skin, turtleCount * 4);
  const turtleMeshes = batches.slice();

  yield;
  const jellyMat = mat('#ba83e8', { transparent: true, opacity: .67, depthWrite: false, side: THREE.DoubleSide, emissive: '#7146b3', emissiveIntensity: .16 });
  const bells = batch('Soft translucent jellyfish bells', new THREE.SphereGeometry(1, economy ? 12 : 14, 7, 0, TAU, 0, Math.PI * .54), jellyMat, jellyCount);
  const oral = batch('Jellyfish oral arms', blob, mat('#debdff', { transparent: true, opacity: .65, depthWrite: false }), jellyCount);
  const trail = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => new THREE.Vector3(Math.sin(i * .9) * .055, -i * .15, Math.cos(i * .8) * .035)));
  // A tentacle is a 2.4 cm thread: three sides and one ring per control point.
  const tentacles = batch('Trailing jellyfish tentacles', new THREE.TubeGeometry(trail, economy ? 8 : 9, .012, 3, false), mat('#a97cd8', { transparent: true, opacity: .72, depthWrite: false }), jellyCount * 6);
  const jellyMeshes = [bells, oral, tentacles];

  const animal = new THREE.Object3D(), transform = new THREE.Matrix4();
  const direction = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const bounds = new THREE.Sphere();
  const floorAt = (x,z) => { const h = terrainHeightAt(x,z); return Number.isFinite(h) ? h : -54; };
  function place(mesh, index, px, py, pz, sx, sy, sz, rx = 0, ry = 0, rz = 0, parent = null) {
    part.position.set(px, py, pz); part.scale.set(sx, sy, sz); part.rotation.set(rx, ry, rz); part.updateMatrix();
    if (parent) transform.multiplyMatrices(parent, part.matrix); else transform.copy(part.matrix);
    mesh.setMatrixAt(index, transform);
  }

  // Seabed residents never move. They are baked, starfish and urchins together,
  // into one mesh per band down the reef, so the renderer culls what is off
  // screen and update() drops the distant bands.
  yield;
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? .17 : .48; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (!i) star.moveTo(x,y); else star.lineTo(x,y); }
  star.closePath();
  const starGeometry = paint(new THREE.ExtrudeGeometry(star, { depth: .06, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 1, steps: 1 }), '#c18d70');
  starGeometry.rotateX(-Math.PI / 2);
  // An urchin is one mesh: its eighteen spines are baked around the body.
  const urchinParts = [paint(new THREE.SphereGeometry(1, 8, 6).scale(1, .7, 1), '#63586c')];
  for (let j = 0; j < 18; j++) {
    const a = j * 2.399, elevation = .12 + (j / 18) * 1.25;
    direction.set(Math.cos(a) * Math.cos(elevation), Math.sin(elevation), Math.sin(a) * Math.cos(elevation));
    rotation.setFromUnitVectors(UP, direction);
    urchinParts.push(paint(new THREE.ConeGeometry(.053, 1.15, 4, 1, true).applyQuaternion(rotation).translate(direction.x * 1.15, direction.y * 1.15, direction.z * 1.15), '#706477'));
  }
  const urchinGeometry = mergeGeometries(urchinParts, false).toNonIndexed();
  urchinParts.forEach(geometry => geometry.dispose());
  yield;
  const statics = [], residents = new Map(), residentMaterial = mat('#ffffff', { vertexColors: true });
  function scatter(geometry, items) {
    for (const [x, y, z, sx, sy, sz, turn] of items) {
      const key = Math.floor((z + 105) / 36);
      part.position.set(x, y, z); part.scale.set(sx, sy, sz); part.rotation.set(0, turn, 0); part.updateMatrix();
      if (!residents.has(key)) residents.set(key, []);
      residents.get(key).push(geometry.clone().applyMatrix4(part.matrix));
    }
  }
  function residentPosition(index, count, phase = 0) {
    // A staggered spread covers the whole reef, with residents on the outer
    // edges of landmark gardens rather than inside their approach pads.
    let x = Math.sin(index * 2.399 + phase) * (22 + (index % 5) * 6);
    const z = 25 - ((index + .5) / count) * 123;
    for (const [px, pz] of [[0, 0], [-12, -15], [18, -39], [-18, -82]]) {
      if (Math.hypot(x - px, z - pz) < 7) x += x < px ? -8 : 8;
    }
    if (Math.abs(x - 20) < 8 && z < -56 && z > -81) x = 34;
    return [Math.max(-54, Math.min(54, x)), z];
  }
  const starItems = [], urchinItems = [];
  for (let i = 0; i < starCount; i++) {
    const [x, z] = residentPosition(i, starCount);
    const s = .68 + (i % 4) * .12;
    starItems.push([x, floorAt(x,z) + .025, z, s, 1, s, i * 1.7]);
  }
  for (let i = 0; i < urchinCount; i++) {
    const [x, z] = residentPosition(i, urchinCount, 1.17);
    const s = .20 + (i % 3) * .025;
    urchinItems.push([x, floorAt(x,z) + .15, z, s, s, s, 0]);
  }
  scatter(starGeometry, starItems); yield; scatter(urchinGeometry, urchinItems);
  for (const pieces of residents.values()) {
    yield;
    const mesh = shareLater(new THREE.Mesh(mergeGeometries(pieces, false), residentMaterial)); mesh.name = 'Seabed starfish and urchins';
    pieces.forEach(geometry => geometry.dispose());
    mesh.geometry.computeBoundingSphere(); mesh.matrixAutoUpdate = false; root.add(mesh); statics.push(mesh);
  }
  starGeometry.dispose(); urchinGeometry.dispose();

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
  }
  for(const pieces of glowBands.values()){
    const mesh=shareLater(new THREE.Mesh(mergeGeometries(pieces,false),glowMaterial));mesh.name='Deep luminous sea pens';mesh.matrixAutoUpdate=false;mesh.geometry.computeBoundingSphere();root.add(mesh);statics.push(mesh);pieces.forEach(g=>g.dispose());
  }
  seaPen.dispose();stem.dispose();crown.dispose();

  const habitats = [
    {x:-24,z:-6,rx:8,rz:6},{x:34,z:-39,rx:9,rz:7},
    {x:-35,z:-72,rx:8,rz:7},{x:31,z:14,rx:9,rz:6},
    {x:33,z:-91,rx:8,rz:6}
  ];
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
    let turtles = 0;
    for (let i = 0; i < turtleCount; i++) {
      const h = habitats[i % habitats.length], angle = time * .055 + i * 2.2;
      const x = h.x + Math.cos(angle) * h.rx, z = h.z + Math.sin(angle) * h.rz;
      const y = floorAt(x,z) + 3.4 + Math.sin(time * .4 + i) * .22;
      if (!seen(view, x, y, z, 1.7, .85)) continue;
      const t = turtles++;
      animal.position.set(x,y,z); animal.rotation.set(0,Math.atan2(Math.sin(angle) * h.rx,-Math.cos(angle) * h.rz),0);
      animal.scale.setScalar(i === 1 ? .82 : .96); animal.updateMatrix();
      const base = animal.matrix, flap = Math.sin(time * 1.65 + i * 1.8) * .28;
      place(shell,t,0,.08,0,.64,.27,.86,0,0,0,base);
      torso.setMatrixAt(t, base);
      for (let side = 0; side < 2; side++) {
        const sign = side ? 1 : -1;
        place(flippers,t*4+side,sign*.43,-.045,-.44,.89,1,.90,0,side ? .22 : Math.PI-.22,sign * flap,base);
        place(flippers,t*4+2+side,sign*.38,-.08,.59,.46,1,.58,0,side ? -.38 : Math.PI+.38,sign * flap*.48,base);
      }
    }
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
    for (const mesh of turtleMeshes) { mesh.count = turtles * (mesh === flippers ? 4 : 1); mesh.visible = turtles > 0; mesh.instanceMatrix.needsUpdate = true; }
    for (const mesh of jellyMeshes) { mesh.count = jellies * (mesh === tentacles ? 6 : 1); mesh.visible = jellies > 0; mesh.instanceMatrix.needsUpdate = true; }
    initialized = true;
  }
  update(0,0);
  return { root, update, counts: { turtles:turtleCount, jellyfish:jellyCount, starfish:starCount, urchins:urchinCount, drawCalls:batches.length + statics.length } };
}
