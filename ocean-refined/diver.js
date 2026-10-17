import * as THREE from './vendor/three.module.min.js';
import { shareLater } from './assets.js';

// Procedural, articulated scuba equipment. Local +Y is headward; +Z is the face.
// Each rigid section is merged by material, leaving elbow and knee pivots intact.
function ellipsoid(parent, material, position, scale, segments = 14) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(6, Math.round(segments * .65))), material);
  mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh);
  return mesh;
}

function tube(parent, material, points, radius = .015, segments = 16) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, segments, radius, 6, false), material);
  parent.add(mesh); return mesh;
}

function cylinder(parent, material, position, radius, height) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), material);
  mesh.position.set(...position); parent.add(mesh); return mesh;
}

function roundedBox(parent, material, position, size, radius = .025) {
  const [w, h, d] = size;
  const r = Math.min(radius, w / 2, h / 2);
  const bevel = Math.min(r * .4, d * .32);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(.001, d - bevel * 2), bevelEnabled: true,
    bevelSegments: 2, steps: 1, bevelSize: bevel, bevelThickness: bevel,
    curveSegments: 3
  });
  geometry.translate(0, 0, -(d - bevel * 2) / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); parent.add(mesh); return mesh;
}

// Continuous oval sections give the torso an anatomical taper instead of spheres.
function shapedBody(parent, material, rings, position = [0, 0, 0]) {
  const spline = new THREE.CatmullRomCurve3(rings.map(([y, x, z]) => new THREE.Vector3(y, x, z)));
  const positions = [], indices = [], rows = 14, segments = 16;
  for (let row = 0; row <= rows; row++) {
    const p = spline.getPoint(row / rows);
    for (let col = 0; col <= segments; col++) {
      const a = col / segments * Math.PI * 2;
      positions.push(Math.cos(a) * Math.max(.001, p.y), p.x, Math.sin(a) * Math.max(.001, p.z));
    }
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < segments; col++) {
    const a = row * (segments + 1) + col, b = a + segments + 1;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  // Seal each limb segment; neighboring joints overlap these small end caps.
  const top = positions.length / 3, bottom = top + 1;
  positions.push(0, rings[0][0], 0, 0, rings[rings.length - 1][0], 0);
  for (let col = 0; col < segments; col++) {
    indices.push(top, col + 1, col);
    const last = rows * (segments + 1) + col;
    indices.push(bottom, last, last + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  // Weld the shading at the oval seam while retaining simple indexed topology.
  const normals = geometry.getAttribute('normal');
  for (let row = 0; row <= rows; row++) {
    const a = row * (segments + 1), b = a + segments;
    const n = new THREE.Vector3(normals.getX(a) + normals.getX(b), normals.getY(a) + normals.getY(b), normals.getZ(a) + normals.getZ(b)).normalize();
    normals.setXYZ(a, n.x, n.y, n.z); normals.setXYZ(b, n.x, n.y, n.z);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); parent.add(mesh); return mesh;
}

// Each rigid group becomes one mesh per surface. The matte materials (suit,
// panels, rubber, webbing, skin) differ only in colour once the shared look
// lights them, so they share the painted material and carry their colour in
// the vertices; the glossy ones (cylinder, metal, lens) keep a mesh each.
function mergeRigid(group, painted) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), batches = new Map(), originals = [];
  for (const child of group.children) {
    if (!child.isMesh) continue;
    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld));
    const source = child.material, matte = painted && source.roughness >= .5 && source.metalness <= .1 && source.emissiveIntensity * (source.emissive.r + source.emissive.g + source.emissive.b) === 0;
    const count = geometry.getAttribute('position').count, tint = new Uint8Array(count * 3), shade = matte ? source.color : { r: 1, g: 1, b: 1 };
    for (let i = 0; i < count; i++) { tint[i * 3] = Math.round(shade.r * 255); tint[i * 3 + 1] = Math.round(shade.g * 255); tint[i * 3 + 2] = Math.round(shade.b * 255); }
    geometry.setAttribute('color', new THREE.BufferAttribute(tint, 3, true));
    const material = matte ? painted : source;
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(geometry); originals.push(child);
  }
  for (const mesh of originals) { group.remove(mesh); mesh.geometry.dispose(); }
  for (const [material, geometries] of batches) {
    const merged = new THREE.BufferGeometry();
    // These assets have no texture maps; avoid requiring UVs on custom geometry.
    for (const name of ['position', 'normal']) {
      const length = geometries.reduce((sum, g) => sum + g.getAttribute(name).array.length, 0);
      const data = new Float32Array(length); let offset = 0;
      for (const g of geometries) { const a = g.getAttribute(name).array; data.set(a, offset); offset += a.length; }
      merged.setAttribute(name, new THREE.BufferAttribute(data, 3));
    }
    if (material === painted) {
      const data = new Uint8Array(merged.getAttribute('position').count * 3); let offset = 0;
      for (const g of geometries) { const a = g.getAttribute('color').array; data.set(a, offset); offset += a.length; }
      merged.setAttribute('color', new THREE.BufferAttribute(data, 3, true));
    }
    merged.computeBoundingSphere();
    // The parts arrive unshared, three vertices to a triangle: sharing the identical ones leaves the diver a fifth of the vertex work.
    const mesh = shareLater(new THREE.Mesh(merged, material));
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    geometries.forEach(g => g.dispose());
  }
}

function ring(parent, material, position, radius, thickness, rotation = [Math.PI / 2, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 6, 20), material);
  mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.scale.set(...scale); parent.add(mesh); return mesh;
}

// A closed elliptical band around the body axis (belt, cummerbund, tank straps).
function band(parent, material, y, a, b, radius, z = 0) {
  const points = [];
  for (let i = 0; i < 14; i++) { const t = i / 14 * Math.PI * 2; points.push(new THREE.Vector3(Math.sin(t) * a, y, z + Math.cos(t) * b)); }
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 28, radius, 6, true), material);
  parent.add(mesh); return mesh;
}

// Ribbed low-pressure hose: a tube with collars threaded along it.
function corrugated(parent, material, collar, points, radius, count) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  parent.add(new THREE.Mesh(new THREE.TubeGeometry(path, 24, radius, 6, false), material));
  const forward = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < count; i++) {
    const t = (i + .5) / count, mesh = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.12, radius * .34, 5, 10), collar);
    mesh.position.copy(path.getPoint(t)); mesh.quaternion.setFromUnitVectors(forward, path.getTangent(t)); parent.add(mesh);
  }
}

// Foot-space convention: toes and blades project along +Z, width is X.
// The ankle supplies plantar flexion; fins never reverse direction in a pose.
function fin(parent, rubber, accent) {
  const shape = new THREE.Shape();
  shape.moveTo(-.065, 0);
  shape.bezierCurveTo(-.09, .10, -.165, .29, -.17, .45);
  shape.quadraticCurveTo(-.17, .58, -.11, .58);
  shape.quadraticCurveTo(-.035, .58, 0, .55);
  shape.quadraticCurveTo(.035, .58, .11, .58);
  shape.quadraticCurveTo(.17, .58, .17, .45);
  shape.bezierCurveTo(.165, .29, .09, .10, .065, 0);
  shape.closePath();
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth: .013, steps: 1, bevelEnabled: true, bevelThickness: .004,
    bevelSize: .006, bevelSegments: 1, curveSegments: 5
  }), accent);
  blade.rotation.x = Math.PI / 2; blade.position.set(0, -.014, .13); parent.add(blade);
  for (const side of [-1, 1]) {
    tube(parent, rubber, [[side*.066,-.015,.13],[side*.11,-.015,.33],[side*.17,-.015,.58],[side*.14,-.015,.70]], .013, 14);
    // Raised ribs share the actual blade plane; no coplanar inset strips.
    tube(parent, rubber, [[side*.04,-.032,.28],[side*.06,-.032,.48],[side*.065,-.032,.65]], .008, 10);
  }
  ellipsoid(parent, rubber, [0, .018, .055], [.071, .066, .15]);
  tube(parent, rubber, [[-.067,.035,.04],[-.073,.06,-.045],[0,.073,-.08],[.073,.06,-.045],[.067,.035,.04]], .012, 12);
  roundedBox(parent, accent, [0, .082, -.048], [.042, .016, .024], .005);
  const tip = new THREE.Object3D(); tip.name = 'Fin tip +Z'; tip.position.set(0, -.014, .71); parent.add(tip);
  return tip;
}

// The regulator follows the head while the first stage stays on the cylinder.
// Reuse one small dynamic tube instead of rebuilding geometry as the neck turns.
function breathingHose(parent, material, head) {
  const points = [[.11,.33,-.365],[.30,.31,-.27],[.345,.37,-.04],[.26,.43,.17],[.06,.437,.238]].map(p => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(points), rings = 24, sides = 6;
  const geometry = new THREE.BufferGeometry(), positions = new Float32Array((rings + 1) * (sides + 1) * 3), normals = new Float32Array(positions.length), indices = [];
  for(let i=0;i<rings;i++) for(let j=0;j<sides;j++) { const a=i*(sides+1)+j,b=a+sides+1; indices.push(a,a+1,b,b,a+1,b+1); }
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry,material); mesh.name='Flexible regulator hose'; mesh.frustumCulled=false; parent.add(mesh);
  const center=new THREE.Vector3(),before=new THREE.Vector3(),after=new THREE.Vector3(),tangent=new THREE.Vector3(),normal=new THREE.Vector3(),binormal=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  let lastX=NaN,lastY=NaN,lastZ=NaN;
  function update() {
    if(head.rotation.x===lastX&&head.rotation.y===lastY&&head.rotation.z===lastZ)return;
    lastX=head.rotation.x;lastY=head.rotation.y;lastZ=head.rotation.z;
    points[4].set(.06,.157,.238).applyEuler(head.rotation).add(head.position);
    points[3].set(.26,.43,.17).lerp(points[4],.12);
    for(let i=0;i<=rings;i++) {
      const t=i/rings;curve.getPoint(t,center);curve.getPoint(Math.max(0,t-.0001),before);curve.getPoint(Math.min(1,t+.0001),after);tangent.subVectors(after,before).normalize();
      normal.crossVectors(tangent,up).normalize(); binormal.crossVectors(tangent,normal).normalize();
      for(let j=0;j<=sides;j++) {
        const angle=j/sides*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle),offset=(i*(sides+1)+j)*3;
        const nx=normal.x*c+binormal.x*s,ny=normal.y*c+binormal.y*s,nz=normal.z*c+binormal.z*s;
        positions[offset]=center.x+nx*.018;positions[offset+1]=center.y+ny*.018;positions[offset+2]=center.z+nz*.018;
        normals[offset]=nx;normals[offset+1]=ny;normals[offset+2]=nz;
      }
    }
    geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;
  }
  update();return {mesh,update,end:points[4]};
}

export function createDiver() {
  const root = new THREE.Group(); root.name = 'Articulated scuba diver';
  const rig = new THREE.Group(); rig.name = 'Buoyancy and breathing pivot'; root.add(rig);
  const body = new THREE.Group(); body.name = 'Wetsuit and scuba rig'; rig.add(body);
  // Dusty navy suit with aqua panels sits inside the ocean palette; marigold
  // and a cream cylinder are the only warm notes, so the kit reads at a glance.
  const mat = (color, roughness = .75, metalness = .02) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const suit = mat('#315a75'), panel = mat('#58c9bf', .7), rubber = mat('#2f404d', .62), gear = mat('#5a7088', .8);
  const accent = mat('#eab75b', .55), tank = mat('#f1ebd9', .45, .08), metal = mat('#c3d0d3', .4, .6), skin = mat('#dba586', .8);
  const lens = mat('#93e4ee', .16, .1); lens.emissive.set('#1b6a7a'); lens.emissiveIntensity = .3;
  for (const [name, material] of Object.entries({ suit, panel, rubber, gear, accent, tank, metal, skin, lens })) material.name = `Diver ${name}`;
  const painted = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .75, metalness: .02, vertexColors: true }); painted.name = 'Diver painted surfaces';

  shapedBody(body, suit, [
    [.22, .105, .105], [.13, .255, .157], [-.03, .29, .18],
    [-.28, .255, .168], [-.51, .22, .15], [-.70, .242, .16],
    [-.83, .225, .153], [-.90, .12, .11]
  ]);
  // Aqua flank panels run armpit to hip beneath the harness.
  for (const side of [-1, 1]) ellipsoid(body, panel, [side * .19, -.32, .008], [.067, .31, .144]);

  // Hooded head: the face is a slightly forward ellipsoid that breaks through
  // the hood, which leaves a clean oval opening without any boolean work.
  cylinder(body, suit, [0, .24, 0], .105, .19);
  const head = new THREE.Group(); head.name = 'Head and mask'; head.position.y = .28; rig.add(head);
  ellipsoid(head, suit, [0, .56, .01], [.2, .235, .2], 28);
  ellipsoid(head, skin, [0, .536, .088], [.166, .2, .16], 24);
  { const points = [];
    for (let i = 0; i <= 8; i++) { const a = -.72 + i / 8 * 3.25; points.push([0, .56 + Math.cos(a) * .232, .01 + Math.sin(a) * .197]); }
    tube(head, panel, points, .02, 20).scale.x = 2.4; }
  // One wide lens in a marigold frame over a dark skirt.
  roundedBox(head, rubber, [0, .585, .228], [.325, .158, .064], .05);
  roundedBox(head, accent, [0, .586, .261], [.312, .144, .034], .046);
  roundedBox(head, rubber, [0, .586, .278], [.262, .098, .012], .034);
  roundedBox(head, lens, [0, .586, .284], [.25, .087, .012], .03);
  roundedBox(head, tank, [-.07, .606, .2915], [.05, .012, .003], .005).rotation.z = .5;
  ellipsoid(head, rubber, [0, .528, .252], [.042, .046, .042], 12);
  tube(head, rubber, [[.155, .586, .215], [.21, .586, .06], [.188, .586, -.1], [.1, .586, -.19], [0, .586, -.207], [-.1, .586, -.19], [-.188, .586, -.1], [-.21, .586, .06], [-.155, .586, .215]], .019, 30);
  for (const side of [-1, 1]) roundedBox(head, accent, [side * .206, .586, .07], [.02, .05, .05], .008);

  // Second stage: round body, bright purge cover and exhaust tee.
  cylinder(head, rubber, [0, .437, .236], .064, .07).rotation.x = Math.PI / 2;
  cylinder(head, accent, [0, .437, .276], .046, .014).rotation.x = Math.PI / 2;
  cylinder(head, metal, [0, .437, .282], .02, .01).rotation.x = Math.PI / 2;
  tube(head, rubber, [[-.11, .40, .17], [-.06, .392, .229], [0, .388, .242], [.06, .392, .229], [.11, .40, .17]], .021, 14);
  // Emitter is a retained Object3D, independent of merged equipment geometry.
  const regulator = new THREE.Object3D(); regulator.name = 'Regulator bubble outlet';
  regulator.position.set(0, .443, .292); head.add(regulator);

  for (const child of head.children) child.position.y -= .28;

  // Wing BCD: two lobes beside the cylinder, padded shoulder straps, cummerbund.
  for (const side of [-1, 1]) {
    ellipsoid(body, gear, [side * .205, -.25, -.14], [.145, .42, .175]).rotation.z = side * -.055;
    tube(body, accent, [[side * .25, .08, -.25], [side * .335, -.17, -.225], [side * .32, -.42, -.21], [side * .245, -.62, -.2]], .01, 20);
    tube(body, gear, [[side * .195, .16, -.17], [side * .245, .225, -.02], [side * .245, .13, .155], [side * .205, -.18, .235], [side * .2, -.45, .19]], .042);
    tube(body, accent, [[side * .262, .2, .06], [side * .262, .1, .185], [side * .22, -.16, .268], [side * .214, -.4, .228]], .009, 18);
    ring(body, metal, [side * .2, -.085, .285], .026, .007, [.25, 0, 0], [1, 1.15, 1]);
    const pocket = roundedBox(body, gear, [side * .25, -.47, .11], [.15, .2, .13], .04);
    pocket.rotation.z = -side * .065;
    roundedBox(body, accent, [side * .262, -.4, .178], [.1, .014, .01], .004).rotation.z = -side * .065;
    tube(body, gear, [[side * .195, .12, -.22], [side * .2, -.08, -.27], [side * .19, -.40, -.268], [side * .16, -.65, -.23]], .023, 20);
  }
  roundedBox(body, metal, [0, -.30, -.217], [.205, .72, .025], .035).rotation.y = Math.PI;
  band(body, gear, -.47, .262, .188, .043);
  roundedBox(body, rubber, [0, -.47, .232], [.12, .07, .02], .012);
  tube(body, gear, [[-.2, -.17, .245], [0, -.185, .25], [.2, -.17, .245]], .017, 10);
  roundedBox(body, metal, [0, -.185, .27], [.058, .032, .014], .006);

  // Weight belt: webbing, square lead blocks and a cam buckle.
  band(body, rubber, -.655, .262, .18, .032);
  for (const angle of [.62, 1.35, 2.25, -.62, -1.35, -2.25]) {
    const weight = roundedBox(body, metal, [Math.sin(angle) * .272, -.655, Math.cos(angle) * .19], [.1, .078, .046], .014);
    weight.rotation.y = angle;
  }
  roundedBox(body, metal, [0, -.655, .205], [.07, .058, .02], .008);
  roundedBox(body, accent, [0, -.655, .217], [.03, .04, .008], .005);

  // Cream cylinder with a marigold shoulder band, boot, cam bands and valve.
  cylinder(body, tank, [0, -.22, -.365], .15, .81);
  ellipsoid(body, tank, [0, .183, -.365], [.15, .115, .15]);
  ellipsoid(body, gear, [0, -.61, -.365], [.156, .09, .156]);
  cylinder(body, gear, [0, -.6, -.365], .156, .07);
  cylinder(body, accent, [0, .105, -.365], .152, .07);
  cylinder(body, panel, [0, .05, -.365], .152, .018);
  cylinder(body, metal, [0, .304, -.365], .034, .1);
  roundedBox(body, metal, [.03, .335, -.365], [.15, .056, .066], .014);
  cylinder(body, rubber, [-.085, .335, -.365], .036, .05).rotation.z = Math.PI / 2;
  cylinder(body, metal, [.105, .335, -.365], .042, .07).rotation.z = Math.PI / 2;
  for (const y of [-.06, -.44]) {
    cylinder(body, gear, [0, y, -.365], .155, .06);
    roundedBox(body, metal, [-.13, y, -.468], [.04, .074, .027], .008).rotation.y = Math.PI * .80;
    for (const side of [-1, 1]) tube(body, gear, [[side * .132, y, -.445], [side * .188, y, -.333], [side * .208, y, -.248]], .02, 10);
  }

  // Hoses: primary over the right shoulder, yellow octopus clipped to the
  // chest, ribbed inflator on the left strap and a gauge console at the hip.
  const regulatorHose = breathingHose(rig, rubber, head);
  tube(body, accent, [[.12, .31, -.36], [.33, .12, -.26], [.365, -.14, -.06], [.31, -.3, .16], [.17, -.29, .262]], .015, 26);
  ellipsoid(body, accent, [.14, -.288, .272], [.056, .05, .034], 12);
  cylinder(body, rubber, [.14, -.288, .3], .026, .014).rotation.x = Math.PI / 2;
  corrugated(body, rubber, gear, [[-.07, .31, -.36], [-.29, .25, -.24], [-.335, .12, -.02], [-.295, -.08, .2], [-.27, -.2, .262]], .026, 9);
  roundedBox(body, rubber, [-.265, -.255, .272], [.06, .11, .05], .014);
  roundedBox(body, accent, [-.265, -.235, .301], [.03, .03, .01], .006);
  roundedBox(body, metal, [-.265, -.285, .3], [.026, .022, .008], .005);
  tube(body, rubber, [[-.075, .30, -.365], [-.28, .13, -.32], [-.372, -.2, -.2], [-.378, -.45, -.02], [-.345, -.55, .1]], .014, 26);
  const consoleBody = roundedBox(body, rubber, [-.335, -.6, .12], [.03, .16, .1], .012);
  consoleBody.rotation.set(.25, -.35, 0);
  const dial = cylinder(body, tank, [-.354, -.575, .114], .036, .012);
  dial.rotation.set(.25, -.35, Math.PI / 2);
  const needle = roundedBox(body, accent, [-.362, -.575, .112], [.006, .03, .006], .002);
  needle.rotation.set(.25, -.35 + Math.PI / 2, .6);

  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.name = `${side < 0 ? 'Left' : 'Right'} shoulder`;
    shoulder.position.set(side * .265, .075, 0); rig.add(shoulder);
    // Each pivot is buried inside both adjacent shells so joints remain joined
    // when the elbow bends, instead of exposing chopped cylinder ends.
    ellipsoid(shoulder, suit, [side * .024, -.035, 0], [.105, .12, .104]);
    shapedBody(shoulder, suit, [[.025,.078,.078],[-.08,.094,.092],[-.23,.077,.077],[-.355,.067,.067],[-.39,.055,.055]], [side * .027, 0, 0]);
    tube(shoulder, panel, [[side*.097,-.025,.012],[side*.112,-.14,.016],[side*.092,-.28,.012]], .022, 12);
    const forearm = new THREE.Group(); forearm.name = `${side < 0 ? 'Left' : 'Right'} elbow`;
    forearm.position.set(side * .027, -.355, 0); shoulder.add(forearm);
    ellipsoid(forearm, suit, [0, -.012, 0], [.068, .078, .068]);
    shapedBody(forearm, suit, [[.025,.057,.057],[-.09,.072,.069],[-.22,.057,.055],[-.31,.046,.045],[-.335,.042,.041]]);
    tube(forearm, panel, [[side*.055,-.04,.012],[side*.06,-.14,.014],[side*.045,-.265,.012]], .019, 12);
    cylinder(forearm, rubber, [0, -.303, 0], .052, .047);
    const wrist = new THREE.Group(); wrist.name = `${side < 0 ? 'Left' : 'Right'} wrist`;
    wrist.position.y = -.327; forearm.add(wrist);
    ellipsoid(wrist, skin, [0, -.06, .004], [.052, .078, .035]);
    ellipsoid(wrist, skin, [-side * .042, -.04, .025], [.023, .045, .023], 12);
    let computer = null;
    if (side < 0) {
      computer = new THREE.Group(); computer.name = 'Left wrist computer'; computer.position.set(0, -.263, .067); forearm.add(computer);
      roundedBox(computer, rubber, [0,0,0], [.104,.083,.032], .016);
      roundedBox(computer, metal, [0,0,.019], [.086,.065,.01], .01);
      roundedBox(computer, lens, [0,0,.026], [.068,.047,.005], .007);
      // Three quiet physical display marks remain readable without a texture.
      for(let i=0;i<3;i++) roundedBox(computer, tank, [-.019+i*.018,.005,.03], [.009,.02-i*.004,.002], .002);
      roundedBox(computer, accent, [.056,0,.003], [.011,.026,.017], .003);
      mergeRigid(computer, painted);
    }
    shoulder.rotation.z = side * .14; forearm.rotation.x = -.35;
    mergeRigid(wrist, painted); mergeRigid(forearm, painted); mergeRigid(shoulder, painted);
    arms.push({ shoulder, forearm, wrist, computer, side });

    const hip = new THREE.Group(); hip.name = `${side < 0 ? 'Left' : 'Right'} hip`;
    hip.position.set(side * .13, -.80, .004); rig.add(hip);
    ellipsoid(hip, suit, [0,-.035,0], [.116,.13,.118]);
    shapedBody(hip, suit, [[.025,.10,.104],[-.09,.116,.115],[-.25,.103,.104],[-.41,.08,.082],[-.50,.066,.068]]);
    tube(hip, panel, [[side*.092,-.07,.008],[side*.099,-.2,.012],[side*.077,-.385,.015]], .026, 14);
    const shin = new THREE.Group(); shin.name = `${side < 0 ? 'Left' : 'Right'} knee`; shin.position.set(0, -.47, 0); hip.add(shin);
    ellipsoid(shin, suit, [0,-.012,0], [.071,.082,.073]);
    ellipsoid(shin, panel, [0,-.018,.055], [.058,.075,.027]);
    shapedBody(shin, suit, [[.025,.058,.06],[-.12,.079,.08],[-.25,.067,.071],[-.39,.044,.047],[-.45,.042,.044]]);
    tube(shin, panel, [[side*.056,-.11,.016],[side*.063,-.22,.018],[side*.036,-.37,.014]], .02, 12);
    cylinder(shin, rubber, [0,-.412,0], .048, .05);
    if (side > 0) {
      roundedBox(shin, rubber, [.075,-.23,0], [.026,.145,.043], .01);
      roundedBox(shin, accent, [.078,-.135,0], [.023,.049,.03], .008);
    }
    const ankle = new THREE.Group(); ankle.name = `${side < 0 ? 'Left' : 'Right'} ankle`;
    ankle.position.set(0,-.435,0); shin.add(ankle);
    ellipsoid(ankle, rubber, [0,.005,0], [.053,.059,.057]);
    const finTip = fin(ankle, rubber, accent);
    ankle.rotation.x = 1.08; hip.rotation.x = -.04; shin.rotation.x = .12;
    mergeRigid(ankle, painted); mergeRigid(shin, painted); mergeRigid(hip, painted);
    legs.push({ hip, shin, ankle, finTip, side });
  }
  mergeRigid(head, painted); mergeRigid(body, painted);
  root.userData.asset = { source: 'procedural', headAxis: '+Y', faceAxis: '+Z', toeAxis: '+Z', approximateHeight: 3.2 };
  return { root, rig, body, head, arms, legs, regulator, regulatorHose, materials: { suit, panel, rubber, accent, metal, skin, gear, tank, lens } };
}
