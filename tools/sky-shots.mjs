// Screenshots of the sky at fixed times of day, from fixed cameras, for before/after comparisons of sky and cloud work.
// The clock is set through the time scrubber and locked, the weather held clear, the frame loop paused (the tab is
// told it is hidden) and the world stepped by hand, so the same build gives the same pictures.
//   node tools/sky-shots.mjs [--out dir] [--label name] [--times 07:30,12:30,16:00,18:55] [--weather clear]
// Run `npm run build` first. PLAYWRIGHT_CHROMIUM_PATH as for smoke.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), dist = path.join(root, 'dist');
const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const OUT = path.resolve(option('out', 'sky-shots')), LABEL = option('label', 'shot'), WEATHER = option('weather', 'clear');
const TIMES = option('times', '07:30,12:30,16:00,18:55').split(',');
await fs.mkdir(OUT, {recursive: true});
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.rgba': 'application/octet-stream'};
const server = http.createServer(async (request, response) => {
  let file = path.join(dist, decodeURIComponent(new URL(request.url, 'http://local').pathname));
  if (!file.startsWith(dist)) { response.writeHead(403).end(); return; }
  try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html'); response.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'}); response.end(await fs.readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchBrowser();
try {
  const page = await browser.newPage({viewport: {width: 960, height: 600}});
  page.on('pageerror', error => console.log('page error:', error.message));
  await page.addInitScript(weather => { try { localStorage.setItem('ocean-weather', weather); } catch {} }, WEATHER);
  await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction(() => window.oceanDiagnostics?.ready, null, {timeout: 180000});
  await page.evaluate(weather => {
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
    document.dispatchEvent(new Event('visibilitychange'));
    oceanControls.weather.set(weather); oceanControls.time.lock(true);
    oceanControls.step(20, 1 / 10);
  }, WEATHER);
  // Set the clock, put the clouds back where they start, settle, and draw.
  const at = async clock => page.evaluate(clock => {
    const [h, m] = clock.split(':').map(Number), range = document.querySelector('#time-slider');
    range.value = String(h * 60 + m); range.dispatchEvent(new Event('input'));
    let uniforms = null; oceanControls.getScene().traverse(node => { if (!uniforms && node.material?.uniforms?.uCloudOffset) uniforms = node.material.uniforms; });
    uniforms.uCloudOffset.value.set(0, 0);
    oceanControls.step(1, 1 / 10);
    return {sun: oceanDiagnostics.sunAltitude, preset: oceanDiagnostics.skyPreset};
  }, clock);
  const shot = async name => page.screenshot({path: path.join(OUT, `${LABEL}-${name}.png`)});
  for (const clock of TIMES) { const state = await at(clock); console.log(clock, JSON.stringify(state)); await shot(`surface-${clock.replace(':', '')}`); }
  // Under the water, a few metres down, looking up toward Snell's window.
  await page.evaluate(() => { oceanControls.world.finish(); oceanControls.startDive({perspective: 'first'}); });
  for (let i = 0; i < 60 && !(await page.evaluate(() => oceanControls.getMode() === 'diver' && !oceanControls.getTransition())); i++) await page.evaluate(() => oceanControls.step(1, 1 / 10));
  // First person, interface cleared, so the view is the water's underside and nothing else.
  await page.keyboard.press('KeyU');
  const look = () => page.evaluate(() => { oceanControls.place({x: 0, y: -6, z: 0}, {x: 0, y: 4, z: -14}); oceanControls.step(1.5, 1 / 10); });
  for (const clock of TIMES) { await look(); await at(clock); await look(); await shot(`under-${clock.replace(':', '')}`); }
} finally { await browser.close(); server.close(); }
