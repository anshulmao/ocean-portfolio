// Screenshots of the sky at fixed times of day, from fixed cameras, for before/after comparisons of sky and cloud work.
// The clock is set through the time scrubber and locked, the weather held clear, the frame loop paused (the tab is
// told it is hidden) and the world stepped by hand, so the same build gives the same pictures.
// Clouds are drawn differently on every visit; --seed picks one draw so a build's pictures can be repeated (builds
// without per-visit clouds ignore it). --time also reports how long the surface view takes to draw: SwiftShader draws
// on the CPU, so that time follows the work per pixel (the sky, the water) where a GPU would hide it.
//   node tools/sky-shots.mjs [--out dir] [--label name] [--times 07:30,12:30,16:00,18:55] [--weather clear] [--seed 1] [--time] [--surface-only] [--dist dir] [--evolve 240] [--size 960x600]
// Each time gives surface-HHMM (the surface view as a visitor meets it), up-HHMM (the same place looking 35 degrees
// higher, interface hidden) and under-HHMM (a few metres down, looking up at the underside). --evolve N adds
// evolve-<s>.png: the first time's upward view after 0, N/2 and N seconds of the clouds moving with the clock held.
// Run `npm run build` first. PLAYWRIGHT_CHROMIUM_PATH as for smoke.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
// --dist serves another build (a copy of an earlier one, for the "before" pictures).
const dist = path.resolve(option('dist', path.join(root, 'dist')));
const OUT = path.resolve(option('out', 'sky-shots')), LABEL = option('label', 'shot'), WEATHER = option('weather', 'clear');
const [WIDTH, HEIGHT] = option('size', '960x600').split('x').map(Number);
const TIMES = option('times', '07:30,12:30,16:00,18:55').split(','), EVOLVE = Number(option('evolve', 0)), SEED = Number(option('seed', 1)), TIME = args.includes('--time'), SURFACE_ONLY = args.includes('--surface-only');
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
  const page = await browser.newPage({viewport: {width: WIDTH, height: HEIGHT}});
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
  // Set the clock, put the clouds back where they start (and draw them from the chosen seed), settle, and draw.
  const at = async clock => page.evaluate(({clock, seed}) => {
    const [h, m] = clock.split(':').map(Number), range = document.querySelector('#time-slider');
    range.value = String(h * 60 + m); range.dispatchEvent(new Event('input'));
    let uniforms = null; oceanControls.getScene().traverse(node => { if (!uniforms && node.material?.uniforms?.uCloudOffset) uniforms = node.material.uniforms; });
    uniforms.uCloudOffset.value.set(0, 0);
    if (uniforms.cloudVisit) {
      let state = seed * 2654435761 >>> 0; const random = () => (state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296;
      const visit = uniforms.cloudVisit.value;
      visit.turn = random() * Math.PI * 2; visit.offset.set(random() * 16, random() * 16); visit.scale = .018 + random() * .016;
      visit.streak = random() * Math.PI * 2; visit.cirrusOffset.set(random() * 64, random() * 64);
      uniforms.uCloudClimate.value.set(random(), random());
      uniforms.uCloudShape.value.set(0, .25 + random() * 1.25, -.14 + random() * .3, 0);
    }
    oceanControls.step(1, 1 / 10);
    return {sun: oceanDiagnostics.sunAltitude, preset: oceanDiagnostics.skyPreset};
  }, {clock, seed: SEED});
  // Median ms to draw the surface view, synchronised with a one-pixel read: the whole view, and the sky dome alone
  // (everything else hidden, the camera turned up so the dome fills the frame).
  const timeDraw = () => page.evaluate(() => {
    const gl = oceanControls.getRenderer().getContext(), pixel = new Uint8Array(4);
    const median = () => { const times = []; for (let i = 0; i < 25; i++) { const t = performance.now(); oceanControls.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); times.push(performance.now() - t); } return times.slice(3).sort((a, b) => a - b)[11]; };
    const all = median(), scene = oceanControls.getScene(), camera = oceanControls.getCamera(), hidden = [], pitch = camera.rotation.x;
    let sky = null; scene.traverse(node => { if (!sky && node.name === 'Moving celestial sphere') sky = node; });
    for (const child of scene.children) if (child !== sky && child.visible && !child.isLight) { child.visible = false; hidden.push(child); }
    camera.rotation.x = pitch + .5; camera.updateMatrixWorld(true);
    const dome = median();
    camera.rotation.x = pitch; camera.updateMatrixWorld(true); for (const child of hidden) child.visible = true;
    return {all: Number(all.toFixed(1)), dome: Number(dome.toFixed(1))};
  });
  const shot = async name => page.screenshot({path: path.join(OUT, `${LABEL}-${name}.png`)});
  // Draws once with the camera turned up and the interface hidden, then puts both back.
  const up = async name => {
    await page.evaluate(() => {
      const camera = oceanControls.getCamera(); camera.rotateX(.6); camera.updateMatrixWorld(true); oceanControls.render(); camera.rotateX(-.6);
      const style = document.createElement('style'); style.id = 'sky-shots-bare'; style.textContent = 'body>:not(#world){display:none!important}'; document.head.append(style);
    });
    await shot(name); await page.evaluate(() => document.querySelector('#sky-shots-bare').remove());
  };
  for (const clock of TIMES) {
    const state = await at(clock); if (TIME) state.drawMs = await timeDraw();
    console.log(clock, JSON.stringify(state)); await shot(`surface-${clock.replace(':', '')}`); await up(`up-${clock.replace(':', '')}`);
  }
  if (EVOLVE) {
    await at(TIMES[0]);
    for (let t = 0; t <= EVOLVE; t += EVOLVE / 2) { if (t) await page.evaluate(seconds => oceanControls.step(seconds, 1 / 5), EVOLVE / 2); await up(`evolve-${t}`); }
  }
  if (!SURFACE_ONLY) {
    // Under the water, a few metres down, looking up toward Snell's window.
    await page.evaluate(() => { oceanControls.world.finish(); oceanControls.startDive({perspective: 'first'}); });
    for (let i = 0; i < 60 && !(await page.evaluate(() => oceanControls.getMode() === 'diver' && !oceanControls.getTransition())); i++) await page.evaluate(() => oceanControls.step(1, 1 / 10));
    // First person, interface cleared, so the view is the water's underside and nothing else.
    await page.keyboard.press('KeyU');
    const look = () => page.evaluate(() => { oceanControls.place({x: 0, y: -6, z: 0}, {x: 0, y: 4, z: -14}); oceanControls.step(1.5, 1 / 10); });
    for (const clock of TIMES) { await look(); await at(clock); await look(); await shot(`under-${clock.replace(':', '')}`); }
  }
} finally { await browser.close(); server.close(); }
