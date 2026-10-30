// Hitches across the handoffs of a visit, in real time on the built site (dist/): Dive in, Back to the surface (the
// ascent, a safety stop held for a few seconds, the surface), Dive in again, the reading archive opened and closed, and
// Show me around from the surface. For each phase: animation-frame gaps over 50 ms, the worst gap, and long tasks.
// The first dive starts once the world is ready (oceanControls.world.whenReady and the landmarks), so what is measured
// is the handoffs themselves, not the first load (tools/perf-hold.mjs measures that).
// As in perf-hold.mjs: SwiftShader, a quarter of a pixel per CSS pixel, the CPU throttled through CDP (1× by default
// here: under a throttle every frame of SwiftShader's is over 50 ms and the gaps say nothing about the handoffs).
//   node tools/perf-handoffs.mjs [--runs 2] [--only phone|desktop] [--throttle 1] [--label name] [--out dir] [--dist dir]
// Run `npm run build` first. Writes <out>/handoffs-<label>.json and prints a table. PLAYWRIGHT_CHROMIUM_PATH as for smoke.
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const dist = path.resolve(option('dist', path.join(root, 'dist')));
const RUNS = Number(option('runs', 2)), ONLY = option('only', ''), THROTTLE = Number(option('throttle', 1)), LABEL = option('label', 'handoffs');
const OUT = path.resolve(option('out', path.join(os.tmpdir(), 'ocean-perf')));
await fs.mkdir(OUT, {recursive: true});
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream'};
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
  phone: {context: {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 3}, cores: 6},
  desktop: {context: {viewport: {width: 1440, height: 900}, deviceScaleFactor: 1}, cores: 8}
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function instrument({cores}) {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {get: () => cores, configurable: true});
  Object.defineProperty(window, 'devicePixelRatio', {get: () => .25, configurable: true});
  const probe = window.__probe = {longTasks: [], gaps: []};
  try { new PerformanceObserver(list => { for (const entry of list.getEntries()) probe.longTasks.push([Math.round(entry.startTime), Math.round(entry.duration)]); }).observe({type: 'longtask', buffered: true}); } catch {}
  let last = 0; const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(now => { if (last && probe.gaps.length < 50000) probe.gaps.push([Math.round(now), +(now - last).toFixed(1)]); last = now; callback(now); });
}

async function run(name, profile, index) {
  const browser = await launchBrowser({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
  const phases = [], errors = [];
  try {
    const context = await browser.newContext(profile.context), page = await context.newPage();
    await context.addInitScript(instrument, {cores: profile.cores});
    page.on('pageerror', error => errors.push(String(error.message).slice(0, 200)));
    const cdp = await context.newCDPSession(page);
    if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', {rate: THROTTLE});
    await page.goto(base, {waitUntil: 'domcontentloaded', timeout: 180000});
    await page.waitForFunction(() => window.oceanDiagnostics?.ready === true || window.oceanDiagnostics?.error, null, {timeout: 240000, polling: 100});
    await page.evaluate(() => window.oceanControls.world.whenReady);
    await page.waitForFunction(() => window.oceanDiagnostics.landmarksSettled && window.oceanDiagnostics.startup.warmedAt, null, {timeout: 240000, polling: 250});
    await sleep(1500);
    const now = () => page.evaluate(() => Math.round(performance.now()));
    const usable = () => page.waitForFunction(() => window.oceanDiagnostics.submerged && window.oceanControls.getMode() === 'diver' && !window.oceanControls.getTransition(), null, {timeout: 120000, polling: 100});
    const surfaced = () => page.waitForFunction(() => window.oceanControls.nav.mode === 'surface' && !window.oceanControls.getTransition(), null, {timeout: 240000, polling: 100});
    const phase = async (label, act) => { const from = await now(); await act(); phases.push({label, from, to: await now()}); };

    await phase('dive in', async () => { await page.locator('#dive').click({timeout: 60000}); await usable(); await sleep(2000); });
    await phase('ascent', async () => {
      await page.evaluate(() => window.oceanControls.surface());
      await page.waitForFunction(() => window.oceanControls.nav.returnPhase === 'offer' || window.oceanControls.nav.mode === 'surface', null, {timeout: 240000, polling: 100});
    });
    await phase('safety stop', async () => {
      if (await page.evaluate(() => window.oceanControls.nav.returnPhase === 'offer')) { await page.evaluate(() => window.oceanControls.setSafetyStop(true)); await sleep(3000); await page.evaluate(() => window.oceanControls.setSafetyStop(false)); }
    });
    await phase('to the surface', async () => { await surfaced(); await sleep(2000); });
    await phase('dive again', async () => { await page.locator('#dive').click({timeout: 60000}); await usable(); await sleep(2000); });
    await phase('archive open/close', async () => {
      await page.evaluate(() => window.oceanArchive.open('experience')); await sleep(2000);
      await page.evaluate(() => document.querySelector('#landmark-dialog .dialog-close')?.click()); await sleep(2000);
    });
    await phase('guided start', async () => {
      await page.evaluate(() => window.oceanControls.surface({instant: true})); await surfaced(); await sleep(1500);
      await page.evaluate(() => document.querySelector('#guided-dive').click()); await usable(); await sleep(3000);
    });
    const probe = await page.evaluate(() => window.__probe);
    return {profile: name, run: index, errors, phases: Object.fromEntries(phases.map(({label, from, to}) => {
      const gaps = probe.gaps.filter(([at]) => at > from && at <= to).map(([, gap]) => gap), long = probe.longTasks.filter(([at]) => at > from && at <= to);
      return [label, {ms: to - from, frames: gaps.length, over50: gaps.filter(gap => gap > 50).length, worstGap: Math.round(Math.max(0, ...gaps)), longTasks: long.length, longTaskMs: long.reduce((n, [, d]) => n + d, 0)}];
    }))};
  } finally { await browser.close(); }
}

const median = values => { const list = values.filter(v => typeof v === 'number').sort((a, b) => a - b); return list.length ? list[list.length >> 1] : null; };
const results = {};
try {
  for (const [name, profile] of Object.entries(PROFILES)) {
    if (ONLY && ONLY !== name) continue;
    const runs = [];
    for (let i = 0; i < RUNS; i++) { const r = await run(name, profile, i); runs.push(r); console.log(JSON.stringify(r)); }
    const labels = Object.keys(runs[0].phases);
    results[name] = {runs, median: Object.fromEntries(labels.map(label => [label, Object.fromEntries(Object.keys(runs[0].phases[label]).map(key => [key, median(runs.map(r => r.phases[label]?.[key]))]))]))};
  }
} finally { server.close(); }
await fs.writeFile(path.join(OUT, `handoffs-${LABEL}.json`), JSON.stringify({label: LABEL, throttle: THROTTLE, results}, null, 1));
for (const [name, {median: m}] of Object.entries(results)) { console.log(`\n${LABEL} ${name}: CPU ${THROTTLE}× (medians of ${RUNS})`); console.table(m); }
