import { terrainHeightAt } from './reef.js';
import { toDisplayDepth, DISPLAY_MAX_DEPTH } from './depth-metrics.js';

// The dive log's reef chart (dive-summary.js): a dive-site briefing chart of the swim area, north up. The scene's north
// is -x and its east -z (expedition-ui.js), so the chart runs east to the right (the deep ledge) and north up, and the
// area, 140 m east-west by 124 m north-south, is drawn landscape. The base is painted once a page and reused:
//   - depth tints stepped every 5 m, from pale shallows to the deep, with hill-shading from the north-west;
//   - smooth contours (marching squares on a half-metre grid, stroked as paths, so they are anti-aliased, not the
//     pixel steps of the planner's chart), every 10 m heavier and labelled;
//   - the reef where it really is: every coral colony, formation and outcrop the scene placed (its collision boxes),
//     as speckled coral or grey stone, so the chart shows the reef and not only the sand.
// Overlays (the swim, pins, features, photos) are the page's own, positioned with chartUV.
export const CHART = Object.freeze({ west: 35, east: -105, north: -62, south: 62, width: 140, height: 124 });
/** A world position as fractions of the chart (u across from the west edge, v down from the north edge). */
export const chartUV = (x, z) => ({ u: (CHART.west - z) / CHART.width, v: (x - CHART.north) / CHART.height });
const RES = 2;   // grid cells a metre
const PX = 6;    // canvas pixels a metre

// Depth (display metres) to colour: the stops of the tint ramp.
const RAMP = [[0, [190, 244, 233]], [6, [128, 222, 220]], [12, [72, 186, 206]], [20, [40, 140, 186]], [28, [26, 100, 158]], [36, [17, 66, 120]], [DISPLAY_MAX_DEPTH, [11, 42, 84]]];
function tint(depth) {
  for (let i = 1; i < RAMP.length; i++) if (depth <= RAMP[i][0]) {
    const [d0, c0] = RAMP[i - 1], [d1, c1] = RAMP[i], k = (depth - d0) / (d1 - d0);
    return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
  }
  return RAMP[RAMP.length - 1][1];
}
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

let base = null, baseKey = '';
function depthGrid() {
  const nu = CHART.width * RES + 1, nv = CHART.height * RES + 1, depth = new Float32Array(nu * nv);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) depth[j * nu + i] = toDisplayDepth(-terrainHeightAt(CHART.north + j / RES, CHART.west - i / RES));
  return { nu, nv, depth };
}
// Contour segments for one level, in grid units, by marching squares.
function contour({ nu, nv, depth }, level) {
  const out = [];
  const at = (i0, j0, i1, j1) => { const a = depth[j0 * nu + i0], b = depth[j1 * nu + i1], k = (level - a) / (b - a); return [i0 + (i1 - i0) * k, j0 + (j1 - j0) * k]; };
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
    const a = depth[j * nu + i] > level, b = depth[j * nu + i + 1] > level, c = depth[(j + 1) * nu + i + 1] > level, d = depth[(j + 1) * nu + i] > level;
    const code = a | b << 1 | c << 2 | d << 3; if (code === 0 || code === 15) continue;
    const top = () => at(i, j, i + 1, j), right = () => at(i + 1, j, i + 1, j + 1), bottom = () => at(i, j + 1, i + 1, j + 1), left = () => at(i, j, i, j + 1);
    switch (code) {
      case 1: case 14: out.push([left(), top()]); break;
      case 2: case 13: out.push([top(), right()]); break;
      case 3: case 12: out.push([left(), right()]); break;
      case 4: case 11: out.push([right(), bottom()]); break;
      case 6: case 9: out.push([top(), bottom()]); break;
      case 7: case 8: out.push([left(), bottom()]); break;
      case 5: out.push([left(), top()], [right(), bottom()]); break;
      case 10: out.push([top(), right()], [left(), bottom()]); break;
    }
  }
  return out;
}
// What the scene placed on the reef, from its collision boxes: coral (colonies, the coral set, formations' growth) or
// stone (outcrops, grottos, the arch). Landmarks and the nursery are drawn by the page as pins, so they are left out.
function reefPieces() {
  const boxes = window.oceanControls?.viewer?.layers?.().reef?.userData?.collisions?.boxes || [];
  const pieces = [];
  for (const entry of boxes) {
    const name = String(entry.mesh || entry.kind || ''), box = entry.box; if (!box) continue;
    if (/helmet|trawler|ship|hull|wreck|nautilus|nursery|descent|landmark|diver/i.test(name)) continue;
    const stone = /outcrop|limestone|rock|stone|grotto|arch|boulder(?! coral)|ledge/i.test(name);
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, r = Math.min(4, Math.max(.35, Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2));
    if (Math.abs(cx) > 62 || cz > 35 || cz < -105) continue;
    pieces.push({ x: cx, z: cz, r, stone });
  }
  return pieces;
}

function paintBase(pieces) {
  const W = CHART.width * PX, H = CHART.height * PX, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const context = canvas.getContext('2d'), grid = depthGrid(), { nu, depth } = grid, image = context.createImageData(W, H), data = image.data;
  const sample = (gi, gj) => { const i = Math.min(nu - 2, Math.max(0, Math.floor(gi))), j = Math.min(grid.nv - 2, Math.max(0, Math.floor(gj))), u = gi - i, v = gj - j;
    return (depth[j * nu + i] * (1 - u) + depth[j * nu + i + 1] * u) * (1 - v) + (depth[(j + 1) * nu + i] * (1 - u) + depth[(j + 1) * nu + i + 1] * u) * v; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gi = x / PX * RES, gj = y / PX * RES, d = sample(gi, gj);
    // Stepped bands with a little of the smooth ramp left in, so each band has depth of its own.
    const stepped = Math.floor(d / 5) * 5 + 2.5, colour = tint(d * .3 + stepped * .7);
    // Hill-shading: light from the north-west (up and left); the depth rising toward it lights the slope.
    const sx = sample(gi + 1, gj) - sample(gi - 1, gj), sy = sample(gi, gj + 1) - sample(gi, gj - 1);
    const shade = Math.max(.72, Math.min(1.22, 1 + (sx + sy) * .16)), grain = 1 + (hash(x, y) - .5) * .05;
    const o = (y * W + x) * 4; data[o] = colour[0] * shade * grain; data[o + 1] = colour[1] * shade * grain; data[o + 2] = colour[2] * shade * grain; data[o + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  // The reef, kept quiet under the contours: stone as a faint slate wash, coral as a soft warm wash with a few muted
  // flecks, so a dense patch of reef reads as texture rather than confetti. Washes are laid first, flecks after.
  const random = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const fleck = ['#f3b9a6', '#ecd0a0', '#e2b6cf', '#b9e8d6'];
  for (const p of pieces) {
    const { u, v } = chartUV(p.x, p.z), cx = u * W, cy = v * H, r = p.r * PX * (p.stone ? .9 : 1.25);
    const wash = context.createRadialGradient(cx, cy, 0, cx, cy, r);
    if (p.stone) { wash.addColorStop(0, 'rgba(46,70,98,.32)'); wash.addColorStop(1, 'rgba(46,70,98,0)'); }
    else { wash.addColorStop(0, 'rgba(236,150,128,.30)'); wash.addColorStop(.7, 'rgba(236,150,128,.12)'); wash.addColorStop(1, 'rgba(236,150,128,0)'); }
    context.fillStyle = wash; context.beginPath(); context.arc(cx, cy, r, 0, Math.PI * 2); context.fill();
  }
  for (const p of pieces) {
    if (p.stone || random() > .7) continue;
    const { u, v } = chartUV(p.x, p.z), cx = u * W, cy = v * H, r = p.r * PX * .8;
    for (let k = 0, n = Math.min(5, 1 + Math.round(p.r * 1.5)); k < n; k++) {
      const a = random() * Math.PI * 2, d = Math.sqrt(random()) * r;
      context.fillStyle = fleck[Math.floor(random() * fleck.length)]; context.globalAlpha = .35 + random() * .25;
      context.beginPath(); context.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + random() * 1.3, 0, Math.PI * 2); context.fill();
    }
  }
  context.globalAlpha = 1;
  // Contours, smooth, every 5 m; every 10 m heavier and labelled where it runs longest across the middle of the chart.
  const scale = PX / RES;
  for (let level = 5; level < DISPLAY_MAX_DEPTH; level += 5) {
    const segments = contour(grid, level), major = level % 10 === 0;
    context.strokeStyle = major ? 'rgba(232,252,255,.78)' : 'rgba(232,252,255,.36)'; context.lineWidth = major ? 1.6 : 1; context.lineCap = 'round';
    context.beginPath(); for (const [[a0, a1], [b0, b1]] of segments) { context.moveTo(a0 * scale, a1 * scale); context.lineTo(b0 * scale, b1 * scale); } context.stroke();
    if (!major || !segments.length) continue;
    // The label: on a segment near the chart's middle row, turned along it, on a halo of the water's colour.
    let best = null, score = Infinity;
    for (const segment of segments) { const [[a0, a1], [b0, b1]] = segment, my = (a1 + b1) / 2 * scale, mx = (a0 + b0) / 2 * scale, s = Math.abs(my - H * .5) + Math.abs(mx - W * .5) * .15 + (Math.abs(b1 - a1) > Math.abs(b0 - a0) ? 40 : 0); if (s < score) { score = s; best = segment; } }
    const [[a0, a1], [b0, b1]] = best; let angle = Math.atan2(b1 - a1, b0 - a0); if (angle > Math.PI / 2) angle -= Math.PI; if (angle < -Math.PI / 2) angle += Math.PI;
    context.save(); context.translate((a0 + b0) / 2 * scale, (a1 + b1) / 2 * scale); context.rotate(angle);
    context.font = '600 13px Outfit, system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.lineWidth = 4; context.strokeStyle = 'rgba(12,52,86,.85)'; context.strokeText(`${level} m`, 0, 0); context.fillStyle = '#eafcff'; context.fillText(`${level} m`, 0, 0);
    context.restore();
  }
  return canvas;
}

/** Paints the chart's base into `canvas` (sized to it), painting it first if the reef has changed since. */
export function paintDiveChart(canvas) {
  const pieces = reefPieces(), key = `${pieces.length}`;
  if (!base || key !== baseKey) { base = paintBase(pieces); baseKey = key; }
  canvas.width = base.width; canvas.height = base.height;
  canvas.getContext('2d').drawImage(base, 0, 0);
  canvas.dataset.source = 'scene-terrain'; canvas.dataset.reefPieces = key;
}
