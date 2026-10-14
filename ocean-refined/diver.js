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

// Blade frame: (across, along, lift) on the tilted blade, expressed in shin space.
const FIN_SIN = Math.sin(.16), FIN_COS = Math.cos(.16);
const onFin = (x, along, lift = 0) => [x, -.48 - FIN_COS * along + FIN_SIN * lift, .12 + FIN_SIN * along + FIN_COS * lift];

function fin(parent, rubber, accent, side) {
  // Paddle blade that flares from the foot pocket into a shallow swallow tail;
  // the bright blade inside dark rails is what the chase camera reads first.
  const shape = new THREE.Shape(); shape.moveTo(-.075, 0);
  shape.bezierCurveTo(-.10, .16, -.205, .40, -.205, .62);
  shape.quadraticCurveTo(-.205, .745, -.12, .75); shape.quadraticCurveTo(-.045, .745, 0, .685);
  shape.quadraticCurveTo(.045, .745, .12, .75); shape.quadraticCurveTo(.205, .745, .205, .62);
  shape.bezierCurveTo(.205, .40, .10, .16, .075, 0); shape.closePath();
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth: .018, steps: 1, bevelEnabled: true, bevelThickness: .007, bevelSize: .010, bevelSegments: 2, curveSegments: 7
  }), accent);
  // Suspended divers point their toes, so the blade trails feetward (-Y).
  blade.rotation.set(-.16, 0, Math.PI); blade.position.set(0, -.48, .12); parent.add(blade);
  for (const sign of [-1, 1]) {
    tube(parent, rubber, [onFin(sign * .08, .0, .01), onFin(sign * .118, .2, .01), onFin(sign * .188, .44, .01), onFin(sign * .214, .63, .01), onFin(sign * .175, .742, .01)], .019, 18);
    // Dark channel inserts break the blade into three painted panels.
    for (const lift of [-.011, .029]) {
      const channel = roundedBox(parent, rubber, onFin(sign * .068, .43, lift), [.036, .40, .006], .016);
      channel.rotation.set(-.16, 0, sign * .09);
    }
  }
  tube(parent, accent, [onFin(0, .1, .02), onFin(0, .4, .022), onFin(0, .66, .02)], .013, 10);
  // Open-heel foot pocket with a spring strap.
  ellipsoid(parent, rubber, [0, -.515, .105], [.086, .17, .07]);
  tube(parent, rubber, [[-.084, -.45, .10], [-.078, -.43, .04], [0, -.42, .012], [.078, -.43, .04], [.084, -.45, .10]], .015, 14);
  roundedBox(parent, accent, [side * .0, -.418, .004], [.05, .026, .012], .006);
}

export function createDiver() {
  const root = new THREE.Group(); root.name = 'Articulated scuba diver';
  const body = new THREE.Group(); body.name = 'Wetsuit and scuba rig'; root.add(body);
  // Dusty navy suit with aqua panels sits inside the ocean palette; marigold
  // and a cream cylinder are the only warm notes, so the kit reads at a glance.
  const mat = (color, roughness = .75, metalness = .02) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const suit = mat('#3f78a6'), panel = mat('#58c9bf', .7), rubber = mat('#2f404d', .62), gear = mat('#5a7088', .8);
  const accent = mat('#ffb23f', .55), tank = mat('#f1ebd9', .45, .08), metal = mat('#c3d0d3', .4, .6), skin = mat('#dba586', .8);
  const lens = mat('#93e4ee', .16, .1); lens.emissive.set('#1b6a7a'); lens.emissiveIntensity = .3;
  for (const [name, material] of Object.entries({ suit, panel, rubber, gear, accent, tank, metal, skin, lens })) material.name = `Diver ${name}`;
  const painted = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .75, metalness: .02, vertexColors: true }); painted.name = 'Diver painted surfaces';

  shapedBody(body, suit, [
    [.23, .15, .11], [.15, .285, .16], [-.03, .305, .19],
    [-.28, .262, .178], [-.52, .215, .148], [-.71, .255, .17],
    [-.85, .25, .17], [-.96, .08, .075]
  ]);
  // Aqua flank panels run armpit to hip beneath the harness.
  for (const side of [-1, 1]) ellipsoid(body, panel, [side * .188, -.36, .0], [.095, .40, .155]);

  // Hooded head: the face is a slightly forward ellipsoid that breaks through
  // the hood, which leaves a clean oval opening without any boolean work.
  cylinder(body, suit, [0, .27, 0], .10, .2);
  ellipsoid(body, suit, [0, .56, .01], [.2, .235, .2], 28);
  ellipsoid(body, skin, [0, .536, .088], [.166, .2, .16], 24);
  { const points = [];
    for (let i = 0; i <= 8; i++) { const a = -.72 + i / 8 * 3.25; points.push([0, .56 + Math.cos(a) * .232, .01 + Math.sin(a) * .197]); }
    tube(body, panel, points, .02, 20).scale.x = 2.4; }
  // One wide lens in a marigold frame over a dark skirt.
  roundedBox(body, rubber, [0, .585, .228], [.325, .158, .064], .05);
  roundedBox(body, accent, [0, .586, .261], [.312, .144, .034], .046);
  roundedBox(body, rubber, [0, .586, .278], [.262, .098, .012], .034);
  roundedBox(body, lens, [0, .586, .284], [.25, .087, .012], .03);
  roundedBox(body, tank, [-.07, .606, .2915], [.05, .012, .003], .005).rotation.z = .5;
  ellipsoid(body, rubber, [0, .528, .252], [.042, .046, .042], 12);
  tube(body, rubber, [[.155, .586, .215], [.21, .586, .06], [.188, .586, -.1], [.1, .586, -.19], [0, .586, -.207], [-.1, .586, -.19], [-.188, .586, -.1], [-.21, .586, .06], [-.155, .586, .215]], .019, 30);
  for (const side of [-1, 1]) roundedBox(body, accent, [side * .206, .586, .07], [.02, .05, .05], .008);

  // Second stage: round body, bright purge cover and exhaust tee.
  cylinder(body, rubber, [0, .437, .236], .064, .07).rotation.x = Math.PI / 2;
  cylinder(body, accent, [0, .437, .276], .046, .014).rotation.x = Math.PI / 2;
  cylinder(body, metal, [0, .437, .282], .02, .01).rotation.x = Math.PI / 2;
  tube(body, rubber, [[-.11, .40, .17], [-.06, .392, .229], [0, .388, .242], [.06, .392, .229], [.11, .40, .17]], .021, 14);
  // Emitter is a retained Object3D, independent of merged equipment geometry.
  const regulator = new THREE.Object3D(); regulator.name = 'Regulator bubble outlet';
  regulator.position.set(0, .443, .292); body.add(regulator);

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
  tube(body, rubber, [[.11, .33, -.365], [.3, .31, -.27], [.345, .37, -.04], [.26, .43, .17], [.06, .437, .238]], .018, 28);
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
    shoulder.position.set(side * .29, .10, 0); root.add(shoulder);
    ellipsoid(shoulder, suit, [side * .034, -.065, 0], [.114, .16, .115]);
    shapedBody(shoulder, suit, [[0, .078, .078], [-.09, .104, .099], [-.24, .083, .082], [-.38, .072, .074], [-.415, .041, .042]], [side * .035, 0, 0]);
    tube(shoulder, panel, [[side * .104, -.02, .0], [side * .118, -.14, .008], [side * .1, -.27, .008], [side * .088, -.37, .004]], .028, 12);
    const forearm = new THREE.Group(); forearm.name = 'Elbow';
    forearm.position.set(side * .035, -.38, 0); shoulder.add(forearm);
    ellipsoid(forearm, suit, [0, -.024, 0], [.075, .082, .075]);
    shapedBody(forearm, suit, [[.01, .060, .060], [-.10, .077, .075], [-.24, .058, .056], [-.33, .048, .046], [-.35, .026, .026]]);
    tube(forearm, panel, [[side * .052, -.03, .0], [side * .058, -.12, .0], [side * .04, -.24, .0], [side * .032, -.31, .0]], .024, 12);
    // Slightly oversized mitten hands keep the gesture readable at a distance.
    ellipsoid(forearm, skin, [0, -.412, .004], [.06, .09, .037]);
    ellipsoid(forearm, skin, [-side * .05, -.385, .02], [.025, .05, .025], 12);
    cylinder(forearm, rubber, [0, -.315, 0], .058, .05);
    if (side < 0) {
      roundedBox(forearm, rubber, [0, -.302, .065], [.09, .07, .031], .011);
      roundedBox(forearm, metal, [0, -.302, .084], [.066, .05, .009], .006);
      roundedBox(forearm, accent, [0, -.302, .090], [.05, .034, .003], .003);
    }
    shoulder.rotation.z = side * .13; forearm.rotation.x = -.23;
    mergeRigid(forearm, painted); mergeRigid(shoulder, painted); arms.push({ shoulder, forearm, side });

    const hip = new THREE.Group(); hip.name = `${side < 0 ? 'Left' : 'Right'} hip`;
    hip.position.set(side * .145, -.83, .015); root.add(hip);
    shapedBody(hip, suit, [[.035, .093, .101], [-.08, .124, .121], [-.24, .11, .112], [-.42, .081, .082], [-.52, .07, .072], [-.55, .038, .04]]);
    tube(hip, panel, [[side * .092, -.04, .0], [side * .1, -.2, .004], [side * .08, -.38, .006], [side * .056, -.5, .006]], .032, 14);
    const shin = new THREE.Group(); shin.name = 'Knee'; shin.position.set(0, -.52, 0); hip.add(shin);
    ellipsoid(shin, panel, [0, -.02, .03], [.078, .095, .062]);
    shapedBody(shin, suit, [[.01, .058, .062], [-.11, .083, .086], [-.24, .077, .079], [-.40, .048, .049], [-.47, .044, .045], [-.49, .025, .026]]);
    tube(shin, panel, [[side * .056, -.1, .0], [side * .066, -.22, .0], [side * .04, -.36, .0], [side * .03, -.42, .0]], .026, 12);
    // Neoprene boot; the right calf carries a small sheathed knife.
    ellipsoid(shin, rubber, [0, -.47, .03], [.066, .1, .092]);
    cylinder(shin, rubber, [0, -.41, .0], .055, .05);
    if (side > 0) {
      roundedBox(shin, rubber, [side * .082, -.23, .0], [.03, .17, .05], .012);
      roundedBox(shin, accent, [side * .086, -.115, .0], [.026, .07, .034], .01);
    }
    fin(shin, rubber, accent, side);
    hip.rotation.x = -.04; shin.rotation.x = .08;
    mergeRigid(shin, painted); mergeRigid(hip, painted); legs.push({ hip, shin, side });
  }
  mergeRigid(body, painted);
  root.userData.asset = { source: 'procedural', headAxis: '+Y', faceAxis: '+Z', approximateHeight: 3.33 };
  return { root, arms, legs, regulator, materials: { suit, panel, rubber, accent, metal, skin, gear, tank, lens } };
}
