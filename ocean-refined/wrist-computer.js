import * as THREE from './vendor/three.module.min.js';
import { profileScale, ndlText, clockText, STOP, TANK_BAR, LOW_BAR, RESERVE_BAR } from './instruments.js';
import { toDisplayDepth, DISPLAY_MAX_DEPTH } from './depth-metrics.js';

// The face echoes the 2D dive computer (dive-hud.js, hud.css, hologram.css): the same record, palette and
// words. 512 x 342 matches the screen's aspect; about half of it reaches the display, so nothing is under 18 px.
const W = 512, H = 342, INK = '#eefdff', HOLO = '#8ff4ff', DIM = '#8ff4ffa6', FAINT = '#8ff4ff38', AMBER = '#ffcf7a', CORAL = '#ff9d8a', MINT = '#7ff0cf';
const SANS = 'Outfit,system-ui,sans-serif', MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';
const LABEL = `500 20px ${SANS}`, STRONG = `600 20px ${SANS}`, PLACE = `500 22px ${SANS}`, UNIT = `500 30px ${SANS}`;
const DEPTH = `600 92px ${MONO}`, LIMIT = `600 46px ${MONO}`, CLOCK = `600 40px ${MONO}`, ROW = `600 34px ${MONO}`;
// What the no-stop cell and the tank say in each state. Colour never carries it alone.
const CELL = { ndl: 'NDL', low: 'NDL · LOW', due: `STOP ${STOP.depth} m`, hold: `STOP ${STOP.depth} m · HOLD`, deco: `DECO · STOP ${STOP.depth} m`, decoHold: `DECO ${STOP.depth} m · HOLD`, done: 'STOP' };
const TANK = { ok: 'TANK', low: 'TANK · LOW', reserve: 'TANK · RESERVE' };
const NONE = {};

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
  block(instrument, rubber, [0, 0, 0], [.224, .168, .042]);
  block(instrument, metal, [0, 0, .021], [.206, .151, .012]);
  block(instrument, rubber, [0, 0, .028], [.187, .130, .009]);
  for (const side of [-1, 1]) {
    block(instrument, rubber, [side * .080, -.092, -.013], [.027, .019, .025]);
    block(instrument, rubber, [side * .080, .092, -.013], [.027, .019, .025]);
    block(instrument, accent, [side * .121, -.015, .002], [.014, .027, .020]);
  }
  const display = document.createElement('canvas'); display.width = W; display.height = H;
  const ctx = display.getContext('2d');
  const glass = ctx?.createLinearGradient(0, 0, 0, H); glass?.addColorStop(0, '#073342'); glass?.addColorStop(1, '#041c29');
  const texture = new THREE.CanvasTexture(display); texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.174, .116), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false }));
  screen.position.z = .034; instrument.add(screen);
  const dotGeometry = new THREE.SphereGeometry(.0028, 8, 6);
  for (const x of [-.097, .097]) for (const y of [-.070, .070]) {
    const screw = new THREE.Mesh(dotGeometry, metal); screw.position.set(x, y, .028); instrument.add(screw);
  }
  let progress = 0, start = 0, target = 0, animationTime = 0, lastRefresh = -Infinity, shown = '';
  const diagnostics = { visible: false, progress: 0, animating: false, meshCount: 0, finiteTransforms: true, textureUpdates: 0, face: '' };
  root.traverse(o => { if (o.isMesh) diagnostics.meshCount++; });
  const text = (string, x, y, font, colour, align = 'left', width) => {
    ctx.font = font; ctx.fillStyle = colour; ctx.textAlign = align; ctx.fillText(string, x, y, width);
  };
  // A reading and its unit: the unit follows the digits wherever they end (measured in the reading's font).
  const reading = (string, unit, x, y, font, colour = INK, width = 150) => {
    text(string, x, y, font, colour, 'left', width);
    if (unit) text(unit, x + Math.min(width, ctx.measureText(string).width) + 6, y, font === DEPTH ? UNIT : LABEL, colour === INK ? HOLO : colour);
  };
  // Called five times a second at most while the wrist is up. Everything shown is reduced to one signature of
  // the rounded values; the canvas is redrawn and the texture uploaded only when that changes.
  function refresh(data, liveDepth, place, pulse) {
    if (!ctx) return;
    const d = data || NONE, finite = Number.isFinite;
    const depth = Math.max(0, finite(d.depth) ? Math.min(DISPLAY_MAX_DEPTH, d.depth) : toDisplayDepth(liveDepth)).toFixed(1);
    const time = finite(d.elapsed) ? clockText(d.elapsed) : '--:--';
    const max = finite(d.maxDepth) ? Math.max(0, Math.min(DISPLAY_MAX_DEPTH, d.maxDepth)).toFixed(1) : '--.-';
    const temp = finite(d.temperature) ? String(Math.round(d.temperature)) : '--';
    const bar = finite(d.bar) ? Math.round(d.bar) : finite(d.air) ? Math.round(d.air * TANK_BAR / 100) : -1;
    const tank = bar < 0 ? 'ok' : bar <= RESERVE_BAR ? 'reserve' : bar <= LOW_BAR ? 'low' : 'ok';
    const stopping = d.stop === 'due' || d.stop === 'hold', slow = Boolean(d.slow), blink = slow ? pulse : 0;
    // The no-stop cell, in dive-hud's order: stop done, deco, the stop counting or due, then the limit.
    const mode = d.stop === 'done' ? 'done' : d.deco ? 'deco' : stopping ? d.stop : d.ndl <= 5 ? 'low' : 'ndl';
    const limit = mode === 'ndl' || mode === 'low';
    const left = Math.ceil(stopping && finite(d.stopLeft) ? d.stopLeft : d.deco ? STOP.decoSeconds : STOP.seconds);
    const value = mode === 'done' ? 'OK' : !limit ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : d.ndl >= 0 ? ndlText(d.ndl) : '--';
    const level = THREE.MathUtils.clamp(Math.round(d.ascentLevel) || 0, 0, 5);
    const version = finite(d.profileVersion) ? d.profileVersion : d.samples | 0;
    const signature = `${place}|${depth}|${time}|${mode}|${d.stop === 'hold'}|${value}|${level}|${slow}|${blink}|${max}|${temp}|${bar}|${version}`;
    if (signature === shown) return;
    shown = diagnostics.face = signature;
    ctx.globalAlpha = 1; ctx.fillStyle = glass; ctx.fillRect(0, 0, W, H);
    // Match the projected interface's subtle ruled glass and illuminated
    // corners. Draw underneath the readings so scanlines never cut the text.
    ctx.fillStyle = '#8ff4ff09';
    for (let line=3;line<H;line+=6)ctx.fillRect(0,line,W,1);
    ctx.strokeStyle = '#8ff4ff66';ctx.lineWidth=1;ctx.strokeRect(4.5,4.5,W-9,H-9);
    ctx.strokeStyle = HOLO;ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(5,19);ctx.lineTo(5,5);ctx.lineTo(19,5);
    ctx.moveTo(W-19,H-5);ctx.lineTo(W-5,H-5);ctx.lineTo(W-5,H-19);ctx.stroke();
    ctx.fillStyle = FAINT; ctx.fillRect(16, 38, 480, 2); ctx.fillRect(16, 178, 480, 2);
    // Top line: where the diver is, and what the computer is doing in a word. The readings are simulated.
    const status = d.deco ? 'SIM · DECO' : stopping ? 'SIM · SAFETY STOP' : slow ? 'SIM · SLOW' : 'SIM · DIVE';
    text(status, 496, 28, STRONG, d.deco ? CORAL : stopping || slow ? AMBER : DIM, 'right');
    text(place.toUpperCase(), 16, 28, PLACE, HOLO, 'left', 464 - ctx.measureText(status).width);
    // Depth leads; the no-stop cell and the dive time stand beside it, the ascent meter at the edge.
    text('DEPTH', 16, 60, LABEL, DIM); reading(depth, 'm', 16, 148, DEPTH, INK, 232);
    const hue = mode === 'deco' ? CORAL : mode === 'low' || mode === 'due' ? AMBER : INK;
    text(CELL[mode === 'deco' && d.stop === 'hold' ? 'decoHold' : mode], 292, 60, mode === 'ndl' ? LABEL : STRONG, mode === 'ndl' ? DIM : hue, 'left', 160);
    reading(value, limit ? 'min' : '', 292, 104, LIMIT, mode === 'done' ? MINT : hue, 120);
    text('DIVE TIME', 292, 128, LABEL, DIM); text(time, 292, 166, CLOCK, INK, 'left', 150);
    // Five chevrons lit from the bottom by the ascent rate; over the limit they turn amber and the word SLOW appears.
    ctx.lineWidth = 5; ctx.lineJoin = 'miter'; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const y = 132 - i * 19;
      ctx.strokeStyle = i < level ? (slow ? AMBER : HOLO) : FAINT;
      ctx.beginPath(); ctx.moveTo(467, y + 11); ctx.lineTo(480, y); ctx.lineTo(493, y + 11); ctx.stroke();
    }
    if (slow) { ctx.globalAlpha = blink ? .5 : 1; text('SLOW', 496, 168, STRONG, AMBER, 'right'); ctx.globalAlpha = 1; }
    // Second row: maximum depth, water temperature, and the tank with its slim bar.
    text('MAX', 16, 200, LABEL, DIM); reading(max, 'm', 16, 236, ROW);
    text('WATER', 186, 200, LABEL, DIM); reading(temp, '°C', 186, 236, ROW);
    const tankHue = tank === 'reserve' ? CORAL : tank === 'low' ? AMBER : INK;
    text(TANK[tank], 346, 200, tank === 'ok' ? LABEL : STRONG, tank === 'ok' ? DIM : tankHue, 'left', 150);
    reading(bar < 0 ? '---' : String(bar), 'bar', 346, 236, ROW, tankHue, 110);
    ctx.fillStyle = FAINT; ctx.fillRect(346, 244, 150, 6);
    if (bar > 0) { ctx.fillStyle = tank === 'ok' ? HOLO : tankHue; ctx.fillRect(346, 244, 150 * Math.min(1, bar / TANK_BAR), 6); }
    // The dive profile, surface at the top, against the same scale as the 2D face (named at the right).
    const px = 16, py = 264, pw = 424, ph = 62, scale = finite(d.maxDepth) ? profileScale(d) : 20;
    const count = Math.min(d.samples | 0, d.profile?.length || 0);
    ctx.fillStyle = FAINT; ctx.fillRect(px, py, pw, 1); ctx.fillRect(px, py + ph / 2, pw, 1); ctx.fillRect(px, py + ph, pw, 1);
    let y = py; ctx.beginPath(); ctx.moveTo(px, py);
    for (let i = 0; i < count; i++) { y = py + Math.min(1, Math.max(0, d.profile[i]) / scale) * ph; ctx.lineTo(px + (i + 1) / count * pw, y); }
    if (!count) ctx.lineTo(px + pw, py);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    if (count) {
      ctx.lineTo(px + pw, py); ctx.closePath(); ctx.fillStyle = '#8ff4ff1f'; ctx.fill();
      ctx.fillStyle = HOLO; ctx.beginPath(); ctx.arc(px + pw, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    text(`${scale} m`, 496, py + ph + 2, LABEL, HOLO, 'right');
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
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * .72;
    const halfWidth = halfHeight * camera.aspect;
    const compact = camera.aspect < .9;
    root.scale.setScalar(Math.min(1.58, halfWidth / (compact ? .28 : .30)));
    root.position.set(halfWidth * .14, -halfHeight * ((compact ? .15 : .43) + .62 * (1 - progress)), -.72);
    root.rotation.set(-.06 - (1 - progress) * .38, .02, -.07 - (1 - progress) * .24);
    const now = performance.now();
    // Reduced motion: the SLOW word holds steady (pulse 0); otherwise it dims on alternate half seconds.
    if (root.visible && now - lastRefresh >= 200) { lastRefresh = now; refresh(data, depth || 0, data?.location || location || 'Coral gardens', reducedMotion ? 0 : Math.floor(now / 500) & 1); }
    diagnostics.visible = root.visible; diagnostics.progress = Math.round(progress * 1e4) / 1e4;
    diagnostics.animating = allowed && Math.abs(progress - target) > .001;
    // A sum is finite only when every term is: no arrays are built per frame.
    const p = root.position, r = root.rotation, s = root.scale;
    diagnostics.finiteTransforms = Number.isFinite(p.x + p.y + p.z + r.x + r.y + r.z + s.x + s.y + s.z);
  }
  refresh(null, 0, 'Coral gardens', 0);
  return { root, update, diagnostics };
}
