// Prepared bathymetry charts (assets/prepared/charts): the HUD's chart and the dive planner's, exactly as the page draws
// them live from the terrain, saved as raw RGBA so a visit can put them on screen instead of sampling the seabed 160,000
// times (prepared-charts.js). The manifest records the SHA-256 of every source the drawing depends on; the page draws
// live whenever one of them has changed, and the build points those hashes at the published scripts (tools/build.mjs).
// Run it again after a change to the terrain or to either chart's drawing:
//   node ocean-refined/tools/prepare-charts.mjs            (writes the charts and the manifest)
//   node ocean-refined/tools/prepare-charts.mjs --verify   (exits non-zero when the saved charts differ from a live draw)
// It serves ocean-refined/ itself and keeps the page from reading the saved charts, so what it captures is the live
// drawing. PLAYWRIGHT_CHROMIUM_PATH as for the other tools.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from '../../tools/browser.mjs';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), output = path.join(site, 'assets/prepared/charts');
const verify = process.argv.includes('--verify');
// What the drawings read: the terrain (reef.js), the HUD chart (expedition-ui.js), the planner's (dive-plan.js), depths (depth-metrics.js).
const SOURCES = ['reef.js', 'expedition-ui.js', 'dive-plan.js', 'depth-metrics.js'];
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2'};
const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  let file = path.join(site, pathname);
  if (!file.startsWith(site)) { response.writeHead(403).end(); return; }
  try {
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const bytes = await fs.readFile(file);
    response.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'}); response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchBrowser({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
let failed = false;
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  // No saved charts: the page draws both from the terrain.
  await page.route('**/assets/prepared/charts/**', route => route.fulfill({status: 404, body: ''}));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.oceanDiagnostics?.ready, null, {timeout: 180000});
  await page.evaluate(() => window.oceanControls.world.finish());
  await page.waitForFunction(() => document.querySelector('#reef-bathymetry')?.width === 400, null, {timeout: 60000});
  const charts = await page.evaluate(() => {
    window.oceanPlan.open(); window.oceanPlan.close();
    const read = canvas => { const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height); return {width: canvas.width, height: canvas.height, source: canvas.dataset.source, pixels: Array.from(image.data)}; };
    return {hud: read(document.querySelector('#reef-bathymetry')), planner: read(document.querySelector('.dive-plan canvas') || document.querySelector('canvas[data-source="scene-terrain"]:not(#reef-bathymetry)'))};
  });
  for (const [kind, chart] of Object.entries(charts)) if (chart.source !== 'scene-terrain') throw Error(`${kind}: not drawn live (${chart.source})`);
  const sources = Object.fromEntries(await Promise.all(SOURCES.map(async file => [file, createHash('sha256').update(await fs.readFile(path.join(site, file))).digest('hex')])));
  if (verify) {
    const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'));
    for (const file of SOURCES) if (manifest.sources[file] !== sources[file]) { console.log(`stale: ${file} changed since the charts were prepared`); failed = true; }
    for (const [kind, chart] of Object.entries(charts)) {
      const saved = await fs.readFile(path.join(output, manifest.charts[kind].file));
      const differing = chart.pixels.reduce((n, value, i) => n + (value !== saved[i] ? 1 : 0), 0);
      console.log(`${kind}: ${differing ? `${differing} channel values differ` : 'identical to the live drawing'}`); if (differing || saved.length !== chart.pixels.length) failed = true;
    }
  } else {
    const manifest = {sources, charts: {}};
    for (const [kind, chart] of Object.entries(charts)) {
      await fs.writeFile(path.join(output, `${kind}.rgba`), Buffer.from(chart.pixels));
      manifest.charts[kind] = {file: `${kind}.rgba`, width: chart.width, height: chart.height};
    }
    await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
    console.log('prepared', Object.entries(manifest.charts).map(([kind, c]) => `${kind} ${c.width}x${c.height}`).join(', '));
  }
} finally { await browser.close(); server.close(); }
process.exit(failed ? 1 : 0);
