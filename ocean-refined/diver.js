import * as THREE from './vendor/three.module.min.js';

// Procedural, articulated scuba equipment. Local +Y is headward; +Z is the face.
// Each rigid section is merged by material, leaving elbow and knee pivots intact.
function ellipsoid(parent, material, position, scale, segments = 20) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 12), material);
  mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh);
  return mesh;
}

function tube(parent, material, points, radius = .015, segments = 28) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, segments, radius, 6, false), material);
  parent.add(mesh); return mesh;
}

function cylinder(parent, material, position, radius, height) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24), material);
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
    bevelSegments: 3, steps: 1, bevelSize: bevel, bevelThickness: bevel,
    curveSegments: 6
  });
  geometry.translate(0, 0, -(d - bevel * 2) / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); parent.add(mesh); return mesh;
}

// Continuous oval sections give the torso an anatomical taper instead of spheres.
function shapedBody(parent, material, rings, position = [0, 0, 0]) {
  const spline = new THREE.CatmullRomCurve3(rings.map(([y, x, z]) => new THREE.Vector3(y, x, z)));
  const positions = [], indices = [], rows = 28, segments = 24;
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

function mergeRigid(group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), batches = new Map(), originals = [];
  for (const child of group.children) {
    if (!child.isMesh) continue;
    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld));
    if (!batches.has(child.material)) batches.set(child.material, []);
    batches.get(child.material).push(geometry); originals.push(child);
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
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    geometries.forEach(g => g.dispose());
  }
}

function fin(parent, rubber, accent, side) {
  // Flat blade with a subtle scoop, flared rails and open-heel foot pocket.
  const points = [[-.085, 0], [-.13, .18], [-.18, .64], [-.16, .72], [.16, .72], [.18, .64], [.13, .18], [.085, 0]];
  const shape = new THREE.Shape(); shape.moveTo(...points[0]);
  points.slice(1).forEach(p => shape.lineTo(...p)); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: .019, steps: 1, bevelEnabled: true, bevelThickness: .007,
    bevelSize: .012, bevelSegments: 2, curveSegments: 5
  });
  const mesh = new THREE.Mesh(geometry, accent);
  // Suspended divers point their toes. The blade continues feetward (-Y),
  // with a gentle plantar-flex angle, rather than hanging across their swim path.
  mesh.rotation.set(-.16, 0, Math.PI); mesh.position.set(0, -.48, .12); parent.add(mesh);
  for (const sign of [-1, 1]) {
    tube(parent, rubber, [[sign * .077, -.51, .14], [sign * .13, -.70, .16], [sign * .168, -1.10, .222], [sign * .155, -1.18, .233]], .014, 16);
  }
  tube(parent, accent, [[0, -.62, .157], [0, -.87, .197], [0, -1.15, .24]], .009, 12);
  // Raised longitudinal channels also read from the third-person rear camera.
  for (const sign of [-1, 1]) {
    tube(parent, rubber, [[sign * .055, -.67, .141], [sign * .066, -.89, .176], [sign * .075, -1.16, .218]], .008, 16);
  }
  ellipsoid(parent, rubber, [0, -.50, .10], [.075, .15, .063]);
  tube(parent, rubber, [[-.079, -.44, .10], [-.072, -.425, .046], [0, -.42, .024], [.072, -.425, .046], [.079, -.44, .10]], .013, 16);
  // Small muted identification strip on each blade.
  const strip = roundedBox(parent, rubber, [side * .06, -1.03, .231], [.04, .14, .012], .003);
  strip.rotation.x = -.16;
}

export function createDiver() {
  const root = new THREE.Group(); root.name = 'Articulated scuba diver';
  const body = new THREE.Group(); body.name = 'Wetsuit and scuba rig'; root.add(body);
  const suit = new THREE.MeshStandardMaterial({ color: '#21383e', roughness: .77, metalness: .03 });
  const panel = new THREE.MeshStandardMaterial({ color: '#324b50', roughness: .78 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#112227', roughness: .63, metalness: .04 });
  const accent = new THREE.MeshStandardMaterial({ color: '#79aaa2', roughness: .60, metalness: .04 });
  const metal = new THREE.MeshStandardMaterial({ color: '#b8c6c6', roughness: .40, metalness: .65 });
  const skin = new THREE.MeshStandardMaterial({ color: '#ba8c73', roughness: .82 });
  const hair = new THREE.MeshStandardMaterial({ color: '#263033', roughness: .95 });
  const lens = new THREE.MeshStandardMaterial({ color: '#a6d1cf', roughness: .11, metalness: .12, transparent: true, opacity: .55, depthWrite: false });
  for (const [name, material] of Object.entries({ suit, panel, rubber, accent, metal, skin, hair, lens })) material.name = `Diver ${name}`;

  shapedBody(body, suit, [
    [.23, .15, .11], [.15, .285, .16], [-.03, .305, .19],
    [-.28, .27, .18], [-.52, .225, .15], [-.71, .26, .17],
    [-.85, .25, .17], [-.96, .08, .075]
  ]);
  // Two sculpted rear-wing lobes sit alongside the cylinder, leaving a clear
  // backplate and tank silhouette instead of one inflated spherical backpack.
  for (const side of [-1, 1]) {
    const wing = ellipsoid(body, rubber, [side * .20, -.25, -.135], [.135, .41, .17]);
    wing.rotation.z = side * -.055;
    tube(body, panel, [[side * .246, .07, -.24], [side * .315, -.17, -.22], [side * .30, -.41, -.205], [side * .235, -.60, -.205]], .008, 24);
  }
  const backplate = roundedBox(body, metal, [0, -.30, -.217], [.205, .72, .025], .035);
  backplate.rotation.y = Math.PI;
  for (const side of [-1, 1]) {
    const pocket = roundedBox(body, rubber, [side * .245, -.43, .117], [.145, .255, .12], .035);
    pocket.rotation.z = -side * .065;
    tube(body, rubber, [[side * .20, .17, -.16], [side * .245, .22, -.02], [side * .245, .13, .15], [side * .20, -.18, .23], [side * .19, -.47, .18]], .037);
    tube(body, accent, [[side * .274, .05, .125], [side * .275, -.13, .15], [side * .25, -.28, .165]], .008, 16);
    roundedBox(body, metal, [side * .213, -.235, .248], [.065, .041, .022], .008);
    tube(body, panel, [[side * .215, -.62, .10], [side * .235, -.73, .13], [side * .195, -.87, .12]], .009, 12);
    tube(body, panel, [[side * .22, -.62, -.086], [side * .221, -.74, -.117], [side * .185, -.85, -.113]], .006, 16);
    tube(body, rubber, [[side * .195, .12, -.22], [side * .20, -.08, -.27], [side * .19, -.40, -.268], [side * .16, -.65, -.23]], .023, 24);
  }
  tube(body, rubber, [[-.255, -.64, .08], [-.21, -.66, .18], [0, -.665, .185], [.21, -.66, .18], [.255, -.64, .08]], .034, 22);
  roundedBox(body, metal, [0, -.658, .22], [.082, .061, .019], .009);
  // Chest bridge remains narrow enough to reveal the wetsuit silhouette.
  tube(body, rubber, [[-.19, -.18, .236], [0, -.19, .238], [.19, -.18, .236]], .016, 12);
  roundedBox(body, metal, [0, -.19, .26], [.051, .026, .012], .004);

  cylinder(body, suit, [0, .25, 0], .095, .21);
  cylinder(body, skin, [0, .32, .015], .079, .105);
  ellipsoid(body, skin, [0, .55, .025], [.175, .22, .172], 32);
  // A single continuous close-cropped cap; no stacked hair blobs.
  const capGeometry = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, 1.36);
  const cap = new THREE.Mesh(capGeometry, hair);
  cap.position.set(0, .55, .014); cap.scale.set(.181, .228, .177); body.add(cap);
  for (const side of [-1, 1]) {
    ellipsoid(body, skin, [side * .174, .525, .018], [.026, .048, .024], 16);
    // Rounded rectangular mask reads as equipment, with separate inset lenses.
    const rim = roundedBox(body, rubber, [side * .087, .574, .187], [.17, .126, .043], .027);
    rim.rotation.z = -side * .035;
    const glass = roundedBox(body, lens, [side * .087, .574, .218], [.133, .089, .014], .017);
    glass.rotation.z = -side * .035;
    tube(body, rubber, [[side * .158, .572, .16], [side * .185, .572, .05], [side * .164, .573, -.12], [side * .095, .572, -.16]], .013, 18);
    tube(body, panel, [[side * .092, .636, .217], [side * .13, .636, .213]], .005, 8);
  }
  tube(body, rubber, [[-.10, .573, -.147], [0, .574, -.159], [.10, .573, -.147]], .015, 16);
  const maskBuckle = roundedBox(body, rubber, [0, .572, -.173], [.08, .044, .015], .008);
  maskBuckle.rotation.y = Math.PI;
  ellipsoid(body, rubber, [0, .537, .194], [.048, .075, .058]);
  ellipsoid(body, skin, [0, .414, .113], [.086, .065, .067]);
  ellipsoid(body, rubber, [0, .443, .194], [.071, .055, .058]);
  const regulatorFace = cylinder(body, metal, [0, .443, .248], .045, .016);
  regulatorFace.rotation.x = Math.PI / 2;
  ellipsoid(body, rubber, [0, .443, .26], [.027, .027, .008]);
  // Emitter is a retained Object3D, independent of merged equipment geometry.
  const regulator = new THREE.Object3D(); regulator.name = 'Regulator bubble outlet';
  regulator.position.set(0, .443, .274); body.add(regulator);

  // Single back-mounted cylinder with domed ends and two retaining bands.
  cylinder(body, metal, [0, -.22, -.365], .145, .81);
  ellipsoid(body, metal, [0, .183, -.365], [.145, .11, .145]);
  ellipsoid(body, rubber, [0, -.623, -.365], [.146, .076, .146]);
  cylinder(body, metal, [0, .304, -.365], .031, .095);
  roundedBox(body, rubber, [.054, .32, -.365], [.081, .05, .06], .012);
  const firstStage = cylinder(body, metal, [.09, .30, -.365], .029, .064);
  firstStage.rotation.z = Math.PI / 2;
  for (const y of [-.035, -.44]) {
    cylinder(body, rubber, [0, y, -.365], .149, .058);
    const tankBuckle = roundedBox(body, metal, [-.125, y, -.462], [.037, .072, .027], .008);
    tankBuckle.rotation.y = Math.PI * .80;
    tube(body, rubber, [[-.128, y, -.445], [-.185, y, -.333], [-.205, y, -.248]], .02, 12);
    tube(body, rubber, [[.128, y, -.445], [.185, y, -.333], [.205, y, -.248]], .02, 12);
  }
  // Quiet painted cylinder markings, no generated logos or baked text textures.
  cylinder(body, accent, [0, .136, -.365], .146, .019);
  const tankMark = roundedBox(body, panel, [0, -.225, -.513], [.062, .195, .004], .009);
  tankMark.rotation.y = Math.PI;
  const inspectionMark = roundedBox(body, accent, [0, -.181, -.517], [.037, .050, .002], .004);
  inspectionMark.rotation.y = Math.PI;
  tube(body, rubber, [[.04, .31, -.365], [.285, .30, -.28], [.33, .36, -.05], [.292, .43, .20], [.09, .443, .235]], .018, 32);
  tube(body, rubber, [[-.055, .31, -.36], [-.29, .23, -.25], [-.337, -.05, -.10], [-.29, -.22, .105]], .022, 24);
  tube(body, rubber, [[-.065, .30, -.365], [-.265, .14, -.315], [-.342, -.18, -.23], [-.325, -.43, -.184]], .015, 32);
  const gauge = cylinder(body, metal, [-.325, -.447, -.194], .040, .012);
  gauge.rotation.x = Math.PI / 2;
  ellipsoid(body, panel, [-.325, -.447, -.202], [.031, .031, .006], 16);
  roundedBox(body, rubber, [-.285, -.24, .12], [.057, .105, .05], .012);
  roundedBox(body, accent, [-.285, -.245, .151], [.027, .034, .008], .004);

  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.name = `${side < 0 ? 'Left' : 'Right'} shoulder`;
    shoulder.position.set(side * .29, .10, 0); root.add(shoulder);
    ellipsoid(shoulder, suit, [side * .034, -.065, 0], [.112, .16, .113]);
    shapedBody(shoulder, suit, [[0, .078, .078], [-.09, .102, .097], [-.24, .081, .08], [-.38, .071, .073], [-.415, .041, .042]], [side * .035, 0, 0]);
    tube(shoulder, panel, [[side * .119, -.08, .018], [side * .123, -.19, .032], [side * .107, -.29, .032]], .009, 12);
    tube(shoulder, panel, [[side * .030, -.055, -.109], [side * .048, -.16, -.095], [side * .045, -.29, -.079]], .005, 18);
    const forearm = new THREE.Group(); forearm.name = 'Elbow';
    forearm.position.set(side * .035, -.38, 0); shoulder.add(forearm);
    ellipsoid(forearm, suit, [0, -.024, 0], [.073, .08, .073]);
    shapedBody(forearm, suit, [[.01, .060, .060], [-.10, .075, .073], [-.24, .056, .054], [-.33, .046, .044], [-.35, .026, .026]]);
    tube(forearm, panel, [[side * .029, -.055, -.072], [side * .021, -.18, -.067], [side * .014, -.285, -.049]], .0045, 16);
    // Closed fingers form a relaxed hand, without exaggerated mitten proportions.
    ellipsoid(forearm, skin, [0, -.407, .003], [.055, .085, .033]);
    ellipsoid(forearm, skin, [-side * .045, -.384, .017], [.022, .045, .022], 16);
    cylinder(forearm, rubber, [0, -.303, 0], .056, .048);
    if (side < 0) {
      roundedBox(forearm, rubber, [0, -.302, .065], [.085, .065, .031], .011);
      roundedBox(forearm, metal, [0, -.302, .084], [.063, .048, .009], .006);
      roundedBox(forearm, accent, [0, -.302, .090], [.048, .033, .003], .003);
    }
    shoulder.rotation.z = side * .13; forearm.rotation.x = -.23;
    mergeRigid(forearm); mergeRigid(shoulder); arms.push({ shoulder, forearm, side });

    const hip = new THREE.Group(); hip.name = `${side < 0 ? 'Left' : 'Right'} hip`;
    hip.position.set(side * .145, -.83, .015); root.add(hip);
    shapedBody(hip, suit, [[.035, .093, .101], [-.08, .122, .119], [-.24, .108, .11], [-.42, .079, .08], [-.52, .069, .071], [-.55, .038, .04]]);
    tube(hip, panel, [[side * .099, -.10, .03], [side * .10, -.27, .035], [side * .078, -.43, .04]], .01, 16);
    tube(hip, panel, [[side * .060, -.06, -.107], [side * .051, -.23, -.102], [side * .038, -.40, -.076]], .0055, 20);
    const shin = new THREE.Group(); shin.name = 'Knee'; shin.position.set(0, -.52, 0); hip.add(shin);
    ellipsoid(shin, rubber, [0, -.017, .025], [.074, .088, .058]);
    shapedBody(shin, suit, [[.01, .058, .062], [-.11, .081, .084], [-.24, .075, .077], [-.40, .047, .048], [-.47, .043, .044], [-.49, .025, .026]]);
    tube(shin, panel, [[side * .062, -.12, .042], [side * .063, -.27, .045], [side * .043, -.39, .031]], .007, 12);
    tube(shin, panel, [[side * .028, -.075, -.074], [side * .033, -.19, -.077], [side * .015, -.35, -.055]], .0045, 18);
    ellipsoid(shin, rubber, [0, -.485, .043], [.069, .076, .104]);
    fin(shin, rubber, accent, side);
    hip.rotation.x = -.04; shin.rotation.x = .08;
    mergeRigid(shin); mergeRigid(hip); legs.push({ hip, shin, side });
  }
  mergeRigid(body);
  root.userData.asset = { source: 'procedural', headAxis: '+Y', faceAxis: '+Z', approximateHeight: 3.33 };
  return { root, arms, legs, regulator };
}
