import * as THREE from './vendor/three.module.min.js';

// A camera-space extension of the articulated diver's left arm. Its screen is
// real geometry, so the bezel, band and hand retain depth as the arm is raised.
export function createWristComputer(camera, materials) {
  const root = new THREE.Group(); root.name = 'Left forearm and dive computer';
  root.visible = false; camera.add(root);
  const { suit, panel, rubber, accent, metal, skin } = materials;
  const sphere = new THREE.SphereGeometry(1, 16, 10);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const limb = (material, xyz, size) => {
    const mesh = new THREE.Mesh(sphere, material);
    mesh.position.set(...xyz); mesh.scale.set(...size); root.add(mesh); return mesh;
  };
  const block = (parent, material, xyz, size) => {
    const mesh = new THREE.Mesh(box, material);
    mesh.position.set(...xyz); mesh.scale.set(...size); parent.add(mesh); return mesh;
  };
  // The forearm exits at the lower left; a relaxed bare hand matches the diver.
  const sleeve = limb(suit, [-.20, -.085, -.05], [.28, .083, .075]);
  sleeve.rotation.z = .29;
  const seam = limb(panel, [-.23, -.033, .010], [.22, .008, .007]); seam.rotation.z = .29;
  limb(rubber, [.047, -.014, -.027], [.049, .065, .064]);
  const hand = limb(skin, [.143, .012, -.034], [.091, .056, .033]); hand.rotation.z = .12;
  const thumb = limb(skin, [.107, -.036, .006], [.046, .024, .023]); thumb.rotation.z = -.5;
  for (let i = 0; i < 3; i++) limb(skin, [.207 + i * .003, .034 - i * .020, -.038], [.028, .012, .027]);
  // Elliptical rubber band encircles the sleeve, with a separate clasp and lugs.
  const bandGeometry = new THREE.CylinderGeometry(.081, .081, .080, 18, 1, true);
  const band = new THREE.Mesh(bandGeometry, rubber); band.rotation.z = Math.PI / 2;
  band.position.set(-.015, -.004, -.045); band.scale.z = .90; root.add(band);
  block(root, metal, [-.015, -.062, -.021], [.064, .012, .070]);
  const instrument = new THREE.Group(); instrument.name = 'Dive computer bezel';
  instrument.position.set(-.015, .020, .037); root.add(instrument);
  block(instrument, rubber, [0, 0, 0], [.190, .145, .042]);
  block(instrument, metal, [0, 0, .021], [.172, .127, .012]);
  block(instrument, rubber, [0, 0, .028], [.156, .111, .009]);
  for (const side of [-1, 1]) {
    block(instrument, rubber, [side * .069, -.081, -.013], [.027, .019, .025]);
    block(instrument, rubber, [side * .069, .081, -.013], [.027, .019, .025]);
    block(instrument, accent, [side * .104, -.015, .002], [.014, .027, .020]);
  }
  const display = document.createElement('canvas'); display.width = 768; display.height = 512;
  const ctx = display.getContext('2d');
  const texture = new THREE.CanvasTexture(display); texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.145, .097), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false }));
  screen.position.z = .034; instrument.add(screen);
  const dotGeometry = new THREE.SphereGeometry(.0028, 8, 6);
  for (const x of [-.081, .081]) for (const y of [-.058, .058]) {
    const screw = new THREE.Mesh(dotGeometry, metal); screw.position.set(x, y, .028); instrument.add(screw);
  }
  let progress = 0, start = 0, target = 0, animationTime = 0, lastRefresh = -Infinity;
  const diagnostics = { visible: false, progress: 0, meshCount: 0, finiteTransforms: true, textureUpdates: 0 };
  root.traverse(o => { if (o.isMesh) diagnostics.meshCount++; });
  function paint(data, depth, location) {
    if (!ctx) return;
    const seconds = Math.max(0, Number(data?.elapsed) || 0);
    const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const air = THREE.MathUtils.clamp(Number.isFinite(data?.air) ? data.air : 100, 0, 100);
    ctx.fillStyle = '#091d24'; ctx.fillRect(0, 0, 768, 512);
    ctx.fillStyle = '#91bdb8'; ctx.font = '500 30px system-ui'; ctx.fillText('DIVE COMPUTER', 32, 47);
    ctx.fillStyle = '#355159'; ctx.fillRect(32, 67, 704, 2);
    ctx.fillStyle = '#a2bbb9'; ctx.font = '26px system-ui'; ctx.fillText('DEPTH', 32, 110); ctx.fillText('DIVE TIME', 400, 110);
    ctx.fillStyle = '#e7f4e8'; ctx.font = '600 88px system-ui'; ctx.fillText(`${depth.toFixed(1)}`, 32, 207);
    ctx.font = '500 30px system-ui'; ctx.fillText('m', 292, 205);
    ctx.font = '600 65px system-ui'; ctx.fillText(time, 400, 201);
    ctx.fillStyle = '#a2bbb9'; ctx.font = '26px system-ui'; ctx.fillText('AIR REMAINING', 32, 273);
    ctx.fillStyle = '#c8e6d0'; ctx.font = '600 48px system-ui'; ctx.fillText(`${Math.round(air)}%`, 600, 280);
    ctx.fillStyle = '#253e46'; ctx.fillRect(32, 305, 704, 17); ctx.fillStyle = '#93c6a5'; ctx.fillRect(32, 305, 704 * air / 100, 17);
    ctx.fillStyle = '#a2bbb9'; ctx.font = '24px system-ui'; ctx.fillText('LOCATION', 32, 374);
    ctx.fillStyle = '#e7f4e8'; ctx.font = '500 34px system-ui'; ctx.fillText(location, 32, 420);
    ctx.fillStyle = '#91bdb8'; ctx.font = '22px system-ui'; ctx.fillText('PORTFOLIO DIVE · SIMULATED AIR', 32, 478);
    texture.needsUpdate = true; diagnostics.textureUpdates++;
  }
  function update(dt, { open, allowed, reducedMotion, depth, location, data }) {
    const nextTarget = open && allowed ? 1 : 0;
    if (nextTarget !== target) { start = progress; target = nextTarget; animationTime = 0; }
    if (reducedMotion || !allowed) progress = target;
    else {
      animationTime += dt;
      const t = Math.min(1, animationTime / (target ? .48 : .30));
      const eased = target ? 1 - Math.pow(1 - t, 3) : t * t * t;
      progress = THREE.MathUtils.lerp(start, target, eased);
    }
    root.visible = allowed && progress > .001;
    // Adapt the physical instrument's framing to narrow phones without obscuring
    // the central swim direction. The scene stays visible above the wrist.
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * .78;
    const halfWidth = halfHeight * camera.aspect;
    const compact = camera.aspect < .9;
    root.scale.setScalar(Math.min(1.45, halfWidth / (compact ? .25 : .28)));
    root.position.set(halfWidth * .17, -halfHeight * ((compact ? .15 : .47) + .62 * (1 - progress)), -.78);
    root.rotation.set(-.06 - (1 - progress) * .38, .02, -.07 - (1 - progress) * .24);
    const now = performance.now();
    if (root.visible && now - lastRefresh >= 200) { paint(data, Math.max(0, depth || 0), data?.location?.toUpperCase() || location || 'CORAL GARDENS'); lastRefresh = now; }
    diagnostics.visible = root.visible; diagnostics.progress = Number(progress.toFixed(4));
    diagnostics.animating = allowed && Math.abs(progress - target) > .001;
    diagnostics.finiteTransforms = [...root.position.toArray(), ...root.rotation.toArray().slice(0, 3), ...root.scale.toArray()].every(Number.isFinite);
  }
  paint(null, 0, 'CORAL GARDENS');
  return { root, update, diagnostics };
}
