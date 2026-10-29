// Pictures of the ocean from fixed camera spots, for a before/after comparison of what a change draws. The built site
// (dist/ or --dist) is stepped deterministically: the tab reads as hidden from the start, so the frame loop never runs
// and the scene moves only by oceanControls.step; time of day and weather are locked; Math.random is seeded. Once the world, the landmarks and
// the optional sets have settled, the diver is placed at each spot, the scene is stepped a little, and the canvas is
// read back (and saved as a PNG). Before the spots, a census of each layer (meshes, instances, triangles, vertices,
// materials, texture sizes) is written as well; --against compares both. Run it for two builds and compare the two outputs with --against:
//   node tools/compare-views.mjs --dist dist-main --out /tmp/views/main
//   node tools/compare-views.mjs --dist dist --out /tmp/views/pr --against /tmp/views/main
// Profiles: phone (economy detail) and desktop (standard detail), at a pixel ratio of 1. PLAYWRIGHT_CHROMIUM_PATH as for smoke.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const dist = path.resolve(option('dist', path.join(root, 'dist')));
const OUT = path.resolve(option('out', '/tmp/ocean-views')), AGAINST = option('against', ''), ONLY = option('only', '');
await fs.mkdir(OUT, {recursive: true});
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2'};
const HOST_HEADERS = JSON.parse(await fs.readFile(path.join(dist, '..', 'vercel.json'), 'utf8')).headers.map(rule => ({match: new RegExp(`^${rule.source}$`), headers: rule.headers}));
const hostHeaders = pathname => Object.fromEntries(HOST_HEADERS.filter(rule => rule.match.test(pathname)).flatMap(rule => rule.headers.map(header => [header.key, header.value])));
const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  let file = path.join(dist, pathname);
  if (!file.startsWith(dist)) { response.writeHead(403).end(); return; }
  try {
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const bytes = await fs.readFile(file);
    response.writeHead(200, {...hostHeaders(pathname), 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': bytes.length}); response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const PROFILES = {
  phone: {context: {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 1}, cores: 4},
  desktop: {context: {viewport: {width: 1280, height: 800}, deviceScaleFactor: 1}, cores: 8}
};
// [name, where the diver is, what it looks at] in world coordinates; null: the surface as the page opens.
const SPOTS = [
  ['surface', null],
  ['reef-wide', [0, -6, 8], [0, -14, -30]],
  ['about-anchor', [-3, -9, -7], [-12, -10, -15]],
  ['wreck', [27, -19, -29], [18, -23, -39]],
  ['coral-habitat', [-30, -14, -10], [-25, -18, -17]],
  ['chest-ledge', [-9, -40, -73], [-18, -44, -82]],
  ['deep-reef', [10, -38, -60], [0, -46, -85]]
];

function seed({cores}) {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {get: () => cores, configurable: true});
  let s = 0x9e3779b9; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { localStorage.clear(); } catch {}
  // Hidden from the start: no frame is ever drawn by the page's own loop, so nothing (the time of day, the render scale)
  // moves with how long the start-up took.
  Object.defineProperty(document, 'hidden', {get: () => true, configurable: true});
}

async function capture(name, profile) {
  const browser = await launchBrowser({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
  const shots = {}, errors = [];
  try {
    const context = await browser.newContext(profile.context), page = await context.newPage();
    await context.addInitScript(seed, {cores: profile.cores});
    page.on('pageerror', error => errors.push(String(error.message).slice(0, 200)));
    await page.goto(base, {waitUntil: 'domcontentloaded', timeout: 180000});
    await page.waitForFunction(() => window.oceanDiagnostics?.ready === true || window.oceanDiagnostics?.error, null, {timeout: 240000, polling: 100});
    // From here the scene moves only when stepped; queued work runs in tasks of its own (world.js pump).
    const facts = await page.evaluate(() => {
      const c = window.oceanControls; c.time.lock(true); c.weather.lock(true); c.weather.set('clear');
      return {quality: window.oceanDiagnostics.quality};
    });
    const read = () => page.evaluate(() => {
      const c = window.oceanControls, gl = c.getRenderer().getContext(); c.render();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let hash = 2166136261; for (let i = 0; i < px.length; i++) hash = Math.imul(hash ^ px[i], 16777619);
      return {w, h, hash: (hash >>> 0).toString(16), pixels: Array.from(px)};
    });
    const shoot = async spot => { const shot = await read(); await fs.writeFile(path.join(OUT, `${name}-${spot}.json`), JSON.stringify(shot)); await page.locator('canvas').first().screenshot({path: path.join(OUT, `${name}-${spot}.png`)}).catch(() => {}); shots[spot] = shot.hash; };
    await page.evaluate(() => window.oceanControls.step(1, 1 / 30));
    await shoot('surface');
    // A dive asked for: the world is built, the landmarks placed and (in economy detail) the optional sets loaded.
    await page.evaluate(() => { window.oceanControls.startDive({capture: false}); });
    await page.evaluate(async () => { const c = window.oceanControls; c.world.finish(); for (let i = 0; i < 600 && c.nav.mode !== 'diver'; i++) c.step(1 / 30, 1 / 30); await c.world.whenEnriched; });
    await page.waitForFunction(() => window.oceanDiagnostics.landmarksSettled && window.oceanDiagnostics.enriched, null, {timeout: 240000, polling: 250});
    // What there is to draw, layer by layer: the same counts, geometry and textures on both builds, whatever is moving.
    const census = await page.evaluate(() => {
      const layers = window.oceanControls.viewer.layers(), out = {};
      const add = (name, root) => {
        if (!root) return; const row = out[name] ??= {meshes: 0, instances: 0, triangles: 0, vertices: 0, materials: new Set(), textures: []}, seen = new Set();
        root.traverse(node => {
          if (!(node.isMesh || node.isPoints || node.isLine) || !node.geometry) return;
          const instances = node.isInstancedMesh ? node.count : 1, g = node.geometry, count = g.index ? g.index.count : g.attributes.position?.count || 0;
          row.meshes++; row.instances += instances; row.triangles += Math.round(count / 3) * instances; if (!seen.has(g)) { seen.add(g); row.vertices += g.attributes.position?.count || 0; }
          for (const m of [node.material].flat()) if (m) { row.materials.add(m.uuid); for (const key of ['map', 'emissiveMap', 'alphaMap', 'normalMap']) if (m[key]?.image && !seen.has(m[key])) { seen.add(m[key]); row.textures.push(`${m[key].image.width}x${m[key].image.height}`); } }
        });
      };
      for (const [name, value] of Object.entries(layers)) [value].flat().forEach((root, i) => add(Array.isArray(value) ? `${name}${i}` : name, root));
      for (const row of Object.values(out)) { row.materials = row.materials.size; row.textures = row.textures.sort().join(' '); }
      return out;
    });
    await fs.writeFile(path.join(OUT, `${name}-census.json`), JSON.stringify(census, null, 1));
    for (const [spot, at, look] of SPOTS) {
      if (!at) continue;
      await page.evaluate(([at, look]) => { const c = window.oceanControls; c.place(at, look); c.step(1.5, 1 / 30); c.recull(); }, [at, look]);
      await shoot(spot);
      // The same view without the creature set (user-creatures.js), whose animals swim on their own clocks: where it shows,
      // when its loading finished decides where they are, and the comparison of the rest should not depend on that.
      await page.evaluate(() => { const root = window.oceanControls.creatures?.root; if (root) root.userData.compareHidden = root.visible, root.visible = false; });
      await shoot(`${spot}-still`);
      await page.evaluate(() => { const root = window.oceanControls.creatures?.root; if (root) root.visible = root.userData.compareHidden; });
    }
    return {quality: facts.quality, shots, errors};
  } finally { await browser.close(); }
}

const report = {};
try {
  for (const [name, profile] of Object.entries(PROFILES)) { if (ONLY && ONLY !== name) continue; report[name] = await capture(name, profile); console.log(name, JSON.stringify(report[name])); }
} finally { server.close(); }
await fs.writeFile(path.join(OUT, 'views.json'), JSON.stringify(report, null, 1));
if (AGAINST) {
  // Per spot: pixels whose colour differs at all, and those that differ by more than 8 levels in a channel.
  const rows = {};
  for (const name of Object.keys(report)) for (const spot of SPOTS.flatMap(([spot, at]) => at ? [spot, `${spot}-still`] : [spot])) {
    const read = async dir => JSON.parse(await fs.readFile(path.join(dir, `${name}-${spot}.json`), 'utf8'));
    let a, b; try { [a, b] = [await read(AGAINST), await read(OUT)]; } catch { rows[`${name}/${spot}`] = {missing: true}; continue; }
    if (a.w !== b.w || a.h !== b.h) { rows[`${name}/${spot}`] = {size: `${a.w}x${a.h} vs ${b.w}x${b.h}`}; continue; }
    let any = 0, over8 = 0, worst = 0;
    for (let i = 0; i < a.pixels.length; i += 4) { const d = Math.max(Math.abs(a.pixels[i] - b.pixels[i]), Math.abs(a.pixels[i + 1] - b.pixels[i + 1]), Math.abs(a.pixels[i + 2] - b.pixels[i + 2])); if (d) any++; if (d > 8) over8++; if (d > worst) worst = d; }
    rows[`${name}/${spot}`] = {pixels: a.w * a.h, differing: any, over8, worstChannel: worst};
  }
  await fs.writeFile(path.join(OUT, 'compare.json'), JSON.stringify(rows, null, 1));
  console.table(rows);
  for (const name of Object.keys(report)) {
    const [a, b] = await Promise.all([AGAINST, OUT].map(async dir => JSON.parse(await fs.readFile(path.join(dir, `${name}-census.json`), 'utf8'))));
    const differs = Object.keys({...a, ...b}).filter(layer => JSON.stringify(a[layer]) !== JSON.stringify(b[layer]));
    console.log(`${name} census:`, differs.length ? `differs in ${differs.join(', ')}` : `identical (${Object.keys(a).length} layers)`);
    for (const layer of differs) console.log(' ', layer, JSON.stringify(a[layer]), '->', JSON.stringify(b[layer]));
  }
}
