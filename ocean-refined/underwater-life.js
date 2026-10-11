import * as THREE from './vendor/three.module.min.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

// All animals share a small set of instanced parts, including moving flippers
// and tentacles. Adding a habitat does not add another material or draw call.
export function createUnderwaterLife({ economy = false, terrainHeightAt = () => -54 } = {}) {
  const root = new THREE.Group(); root.name = 'Turtles, jellyfish and seabed life';
  const turtleCount = economy ? 3 : 5, jellyCount = economy ? 10 : 20;
  const starCount = economy ? 25 : 40, urchinCount = economy ? 25 : 40;
  const mat = (color, extras = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, ...extras });
  const sphere = new THREE.SphereGeometry(1, economy ? 12 : 18, economy ? 8 : 12);
  const skin = mat('#8eaa87'), dark = mat('#293d38'), pale = mat('#c5c5a0');
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
  function batch(name, geometry, material, count, moving = true) {
    const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = name;
    if (moving) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; }
    root.add(mesh); batches.push(mesh); return mesh;
  }
  const shell = batch('Olive turtle shells', sphere, shellMat, turtleCount);
  const belly = batch('Turtle plastrons', sphere, pale, turtleCount);
  const heads = batch('Turtle heads', sphere, skin, turtleCount);
  const necks = batch('Turtle necks', sphere, skin, turtleCount);
  const eyes = batch('Turtle eyes', sphere, dark, turtleCount * 2);
  const paddle = new THREE.Shape();
  paddle.moveTo(0, -.12); paddle.quadraticCurveTo(.45, -.40, 1.04, -.18);
  paddle.quadraticCurveTo(1.24, -.10, 1.05, .04); paddle.quadraticCurveTo(.45, .27, 0, .10);
  const paddleGeometry = new THREE.ExtrudeGeometry(paddle, { depth: .055, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 1, steps: 1, curveSegments: economy ? 5 : 8 });
  paddleGeometry.rotateX(Math.PI / 2);
  const fronts = batch('Sweeping turtle foreflippers', paddleGeometry, skin, turtleCount * 2);
  const backs = batch('Turtle hindflippers', paddleGeometry, skin, turtleCount * 2);
  const tails = batch('Small turtle tails', new THREE.ConeGeometry(.07, .32, 7), skin, turtleCount);

  const jellyMat = mat('#a9d6d1', { transparent: true, opacity: .67, depthWrite: false, side: THREE.DoubleSide, emissive: '#36626a', emissiveIntensity: .16 });
  const bells = batch('Soft translucent jellyfish bells', new THREE.SphereGeometry(1, economy ? 12 : 18, 9, 0, TAU, 0, Math.PI * .54), jellyMat, jellyCount);
  const oral = batch('Jellyfish oral arms', sphere, mat('#bddbd2', { transparent: true, opacity: .65, depthWrite: false }), jellyCount);
  const trail = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => new THREE.Vector3(Math.sin(i * .9) * .055, -i * .15, Math.cos(i * .8) * .035)));
  const tentacles = batch('Trailing jellyfish tentacles', new THREE.TubeGeometry(trail, economy ? 10 : 14, .012, 4, false), mat('#a4c8c5', { transparent: true, opacity: .72, depthWrite: false }), jellyCount * 6);

  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? .17 : .48; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (!i) star.moveTo(x,y); else star.lineTo(x,y); }
  star.closePath();
  const starGeometry = new THREE.ExtrudeGeometry(star, { depth: .06, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 1, steps: 1 });
  starGeometry.rotateX(-Math.PI / 2);
  const stars = batch('Ochre seabed starfish', starGeometry, mat('#c18d70'), starCount, false);
  const urchins = batch('Small seabed urchins', sphere, mat('#63586c'), urchinCount, false);
  const spines = batch('Fine urchin spines', new THREE.ConeGeometry(.012, 1, 4), mat('#706477'), urchinCount * 18, false);

  const part = new THREE.Object3D(), animal = new THREE.Object3D(), transform = new THREE.Matrix4();
  const direction = new THREE.Vector3(), point = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const floorAt = (x,z) => { const h = terrainHeightAt(x,z); return Number.isFinite(h) ? h : -54; };
  function place(mesh, index, position, scale, angles = [0,0,0], parent = null) {
    part.position.set(...position); part.scale.set(...scale); part.rotation.set(...angles); part.updateMatrix();
    if (parent) transform.multiplyMatrices(parent, part.matrix); else transform.copy(part.matrix);
    mesh.setMatrixAt(index, transform);
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
  for (let i = 0; i < starCount; i++) {
    const [x, z] = residentPosition(i, starCount);
    const s = .68 + (i % 4) * .12;
    place(stars,i,[x,floorAt(x,z)+.025,z],[s,1,s],[0,i * 1.7,0]);
  }
  for (let i = 0; i < urchinCount; i++) {
    const [x, z] = residentPosition(i, urchinCount, 1.17);
    const y = floorAt(x,z) + .15, s = .20 + (i % 3) * .025;
    place(urchins,i,[x,y,z],[s,s * .7,s]);
    for (let j = 0; j < 18; j++) {
      const a = j * 2.399, elevation = .12 + (j / 18) * 1.25;
      direction.set(Math.cos(a) * Math.cos(elevation),Math.sin(elevation),Math.sin(a) * Math.cos(elevation));
      point.set(x,y,z).addScaledVector(direction,s * 1.15);
      rotation.setFromUnitVectors(UP,direction); part.position.copy(point); part.quaternion.copy(rotation); part.scale.set(1,s * 1.15,1); part.updateMatrix(); spines.setMatrixAt(i * 18+j,part.matrix);
    }
  }
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
  let initialized = false;
  function update(dt, elapsed = 0, playerPosition = null) {
    if (initialized && !(dt > 0)) return;
    const time = Number.isFinite(elapsed) ? Math.max(0,elapsed) : 0;
    for (let i = 0; i < turtleCount; i++) {
      const h = habitats[i], angle = time * .055 + i * 2.2;
      const x = h.x + Math.cos(angle) * h.rx, z = h.z + Math.sin(angle) * h.rz;
      const y = floorAt(x,z) + 3.4 + Math.sin(time * .4 + i) * .22;
      animal.position.set(x,y,z); animal.rotation.set(0,Math.atan2(Math.sin(angle) * h.rx,-Math.cos(angle) * h.rz),0);
      animal.scale.setScalar(i === 1 ? .82 : .96); animal.updateMatrix();
      const base = animal.matrix, flap = Math.sin(time * 1.65 + i * 1.8) * .28;
      place(shell,i,[0,.08,0],[.64,.27,.86],[0,0,0],base);
      place(belly,i,[0,-.10,.03],[.56,.11,.74],[0,0,0],base);
      place(necks,i,[0,0,-.87],[.13,.12,.30],[0,0,0],base);
      place(heads,i,[0,.02,-1.12],[.19,.15,.23],[0,0,0],base);
      for (let side = 0; side < 2; side++) {
        const sign = side ? 1 : -1;
        place(eyes,i*2+side,[sign * .163,.075,-1.20],[.028,.028,.028],[0,0,0],base);
        place(fronts,i*2+side,[sign*.43,-.045,-.44],[.89,1,.90],[0,side ? .22 : Math.PI-.22,sign * flap],base);
        place(backs,i*2+side,[sign*.38,-.08,.59],[.46,1,.58],[0,side ? -.38 : Math.PI+.38,sign * flap*.48],base);
      }
      place(tails,i,[0,-.06,.92],[1,1,1],[Math.PI/2,0,0],base);
    }
    for (let i = 0; i < jellyCount; i++) {
      const habitat = jellyHabitats[i % jellyHabitats.length];
      const member = Math.floor(i / jellyHabitats.length), spread = 2.4 + member * 1.1;
      const x = habitat.x + Math.sin(i * 2.4) * spread + Math.sin(time*.10+i) * .65;
      const z = habitat.z + Math.cos(i*2.4) * spread + Math.cos(time*.08+i)*.5;
      const y = floorAt(x,z) + habitat.lift + member * .8 + Math.sin(time*.65+i)*.18;
      const size = .64 + (i%3)*.12, pulse = Math.sin(time * 1.8 + i * 1.1);
      place(bells,i,[x,y,z],[size * (.50 + pulse*.035),size * (.33-pulse*.025),size * (.50+pulse*.035)]);
      place(oral,i,[x,y-.15*size,z],[size*.12,size*.28,size*.12]);
      for (let j = 0; j < 6; j++) {
        const a = j / 6 * TAU;
        place(tentacles,i*6+j,[x+Math.cos(a)*size*.29,y-.02,z+Math.sin(a)*size*.29],[size, size * (.83+(j%3)*.12), size],[Math.sin(time*.7+i+j)*.05,a+time*.05,Math.sin(time*.6+i+j)*.06]);
      }
    }
    for (const mesh of batches) {
      if (!initialized || mesh.instanceMatrix.usage === THREE.DynamicDrawUsage) mesh.instanceMatrix.needsUpdate = true;
    }
    initialized = true;
  }
  update(0,0);
  for (const mesh of [stars,urchins,spines]) mesh.computeBoundingSphere();
  return { root, update, counts: { turtles:turtleCount, jellyfish:jellyCount, starfish:starCount, urchins:urchinCount, drawCalls:batches.length } };
}
