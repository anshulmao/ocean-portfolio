// Frames of the schooling fish (marine-life.js) for before/after comparisons: at the shallow reef and around the wreck,
// a still and a short sequence stepped at a fixed 1/30 s, written as a JPEG still, an animated GIF and a strip.
//   node tools/capture-schools.mjs [--dist dir] [--out dir] [--label name] [--frames 36]
// Run `npm run build` first (or pass --dist, a copy of an earlier build). PLAYWRIGHT_CHROMIUM_PATH as for smoke. The GIF
// and strip need ffmpeg and ImageMagick; without them the PNG frames are left in <out>/<label>-<place>/.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const dist = path.resolve(option('dist', path.join(root, 'dist'))), OUT = path.resolve(option('out', path.join(root, 'release/fish'))), LABEL = option('label', 'after');
const FRAMES = Number(option('frames', 36));
await fs.mkdir(OUT, {recursive: true});
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.gz': 'application/gzip'};
const server = http.createServer(async (request, response) => {
  let file = path.join(dist, decodeURIComponent(new URL(request.url, 'http://local').pathname));
  if (!file.startsWith(dist)) { response.writeHead(403).end(); return; }
  try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html'); response.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'}); response.end(await fs.readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

// Where to look: a point near each place; the camera is set beside the school found closest to it.
const SPOTS = {
  'shallow-reef': {near: [6, -12, -8], side: [-1, .25, .6]},
  wreck: {near: [18, -22, -36], side: [.8, .2, .8]},
  // The diver swims at the school at 3 m/s, from 9 m: the school takes fright and bursts away.
  'wreck-approach': {near: [18, -22, -36], side: [.8, .2, .8], from: 9, approach: 3}
};

const browser = await launchBrowser({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
try {
  const page = await browser.newPage({viewport: {width: 640, height: 400}, deviceScaleFactor: 1});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {get: () => 8, configurable: true}));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'domcontentloaded', timeout: 120000});
  await page.waitForFunction(() => window.oceanDiagnostics?.ready === true || window.oceanDiagnostics?.error, null, {timeout: 240000, polling: 100});
  await page.evaluate(() => { document.querySelector('#day')?.click(); window.oceanControls.weather.set('clear'); window.oceanControls.weather.lock(true); window.oceanControls.startDive({capture: false, perspective: 'first'}); });
  await page.waitForFunction(() => window.oceanExperienceMetrics.snapshot().stages.firstUsableDive !== undefined, null, {timeout: 240000, polling: 200});
  await page.waitForFunction(() => window.oceanDiagnostics.enriched, null, {timeout: 300000, polling: 250}).catch(() => errors.push('enrichment never settled'));
  // From here the page draws only when stepped: the frame loop stops for a hidden page. Only the scene is shown.
  await page.addStyleTag({content: '* { visibility: hidden !important; } canvas { visibility: visible !important; }'});
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => true}); document.dispatchEvent(new Event('visibilitychange')); });
  const info = {};
  for (const [name, spot] of Object.entries(SPOTS)) {
    // Arrive, then find the school nearest the spot and sit beside it.
    const fish = await page.evaluate(({near, side, from = 5.5}) => {
      const c = window.oceanControls, marine = c.viewer.layers().creatures[0];
      c.place([near[0] + side[0] * 10, near[1] + side[1] * 10, near[2] + side[2] * 10], near); c.step(2, 1 / 30);
      const points = [];
      marine.traverse(node => { if (!node.isInstancedMesh || /tails|fins/i.test(node.name)) return; const a = node.instanceMatrix.array; for (let i = 0; i < node.count; i++) points.push([a[i * 16 + 12], a[i * 16 + 13], a[i * 16 + 14]]); });
      const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      const first = points.sort((p, q) => d(p, near) - d(q, near))[0], group = points.filter(p => d(p, first) < 6);
      const centre = [0, 1, 2].map(k => group.reduce((n, p) => n + p[k], 0) / group.length);
      c.place([centre[0] + side[0] * from, centre[1] + side[1] * from, centre[2] + side[2] * from], centre); c.step(.5, 1 / 30);
      window.__schoolSpot = {centre, side, from};
      const r = c.getRenderer(); c.render?.();
      return {centre: centre.map(v => +v.toFixed(1)), fish: group.length, calls: r.info.render.calls, triangles: r.info.render.triangles, programs: r.info.programs?.length ?? 0};
    }, spot);
    info[name] = fish;
    const dir = path.join(OUT, `${LABEL}-${name}`);
    await fs.rm(dir, {recursive: true, force: true}); await fs.mkdir(dir, {recursive: true});
    for (let i = 0; i < FRAMES; i++) {
      await page.evaluate(speed => {
        const {centre, side, from} = window.__schoolSpot;
        if (speed) { window.__schoolSpot.from = from - speed / 30; window.oceanControls.place(centre.map((v, k) => v + side[k] * window.__schoolSpot.from), centre); }
        window.oceanControls.step(1 / 30, 1 / 30);
      }, spot.approach || 0);
      await page.locator('canvas').first().screenshot({path: path.join(dir, `${String(i).padStart(3, '0')}.png`)});
    }
    try {
      // Kept small for the repository: a JPEG still, a 400 px GIF at 15 fps (64 colours) and a strip of six frames.
      execFileSync('convert', [path.join(dir, '000.png'), '-quality', '82', path.join(OUT, `${LABEL}-${name}.jpg`)]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, '%03d.png'), '-vf', 'fps=15,scale=400:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer', path.join(OUT, `${LABEL}-${name}.gif`)]);
      const picks = Array.from({length: 6}, (_, k) => path.join(dir, `${String(Math.round(k * (FRAMES - 1) / 5)).padStart(3, '0')}.png`));
      execFileSync('convert', [...picks, '-resize', '320x', '+append', '-quality', '80', path.join(OUT, `${LABEL}-${name}-strip.jpg`)]);
      await fs.rm(dir, {recursive: true, force: true});
    } catch (error) { console.warn('GIF/strip skipped:', error.message); }
  }
  const looks = await page.evaluate(() => window.oceanControls.viewer.layers().creatures[0].userData.looks ?? null);
  console.log(JSON.stringify({label: LABEL, info, looks, errors}, null, 1));
} finally { await browser.close(); server.close(); }
