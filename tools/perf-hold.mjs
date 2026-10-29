// How long a first dive waits at the waterline on a slow device: the built site (dist/), the CPU slowed through CDP,
// and a visitor who asks for the dive a moment after the surface is ready. world.js holds the dive just under the
// surface until the world under the water is built and linked, the landmarks have settled and the first draws are done
// (see updateWorld); this records how long that hold lasted and which of those finished last.
// Profiles: a phone (390×844, touch, economy detail) and a desktop (1440×900), both CPU-throttled (4× by default).
// Actions: `dive` clicks Dive in (a pointer that hovers on the way, as a mouse does), `guided` clicks Show me around,
// whose surface prelude starts the dive 2.4 s later (guided-dive.js). Each run is a fresh browser with an empty cache.
// As in perf-probe.mjs the page is told its display has a quarter of a pixel per CSS pixel, so SwiftShader's fill
// does not stand in for the CPU work being measured.
// --mbps adds a network of that many megabits a second down (and 150 ms of latency), for what downloads cost.
//   node tools/perf-hold.mjs [--runs 3] [--only phone|desktop] [--action dive|guided|both] [--after 2000] [--throttle 4] [--mbps 10] [--label name] [--out dir] [--dist dir]
// Run `npm run build` first. Writes <out>/hold-<label>.json and prints a table. PLAYWRIGHT_CHROMIUM_PATH as for smoke.
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const dist = path.resolve(option('dist', path.join(root, 'dist')));
const RUNS = Number(option('runs', 3)), ONLY = option('only', ''), ACTION = option('action', 'both'), AFTER = Number(option('after', 2000)), THROTTLE = Number(option('throttle', 4)), MBPS = Number(option('mbps', 0)), LABEL = option('label', 'hold');
const OUT = path.resolve(option('out', path.join(os.tmpdir(), 'ocean-perf')));
await fs.mkdir(OUT, {recursive: true});
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream'};
// Headers as the host sends them (the coral cache checks its sources by X-Asset-SHA256, see perf-probe.mjs).
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

// Before any of the page's scripts: long tasks, and the gaps between animation-frame callbacks (the surface's pacing).
function instrument({cores}) {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {get: () => cores, configurable: true});
  Object.defineProperty(window, 'devicePixelRatio', {get: () => .25, configurable: true});
  const probe = window.__probe = {longTasks: [], gaps: []};
  try { new PerformanceObserver(list => { for (const entry of list.getEntries()) probe.longTasks.push([Math.round(entry.startTime), Math.round(entry.duration)]); }).observe({type: 'longtask', buffered: true}); } catch {}
  let last = 0; const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(now => { if (last && probe.gaps.length < 20000) probe.gaps.push([Math.round(now), +(now - last).toFixed(1)]); last = now; callback(now); });
  // The moment the camera is under the water, from the page's own clock.
  const watch = setInterval(() => { if (window.oceanDiagnostics?.submerged) { probe.submergedAt = Math.round(performance.now()); clearInterval(watch); } }, 20);
}

async function run(name, profile, action, index) {
  const browser = await launchBrowser({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
  try {
    const context = await browser.newContext(profile.context), page = await context.newPage(), errors = [];
    await context.addInitScript(instrument, {cores: profile.cores});
    page.on('pageerror', error => errors.push(String(error.message).slice(0, 200)));
    const cdp = await context.newCDPSession(page);
    if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', {rate: THROTTLE});
    if (MBPS) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 150, downloadThroughput: MBPS * 125000, uploadThroughput: MBPS * 62500}); }
    await page.goto(base, {waitUntil: 'domcontentloaded', timeout: 180000});
    await page.waitForFunction(() => window.oceanDiagnostics?.ready === true || window.oceanDiagnostics?.error, null, {timeout: 240000, polling: 50});
    await sleep(AFTER);
    const clickAt = await page.evaluate(() => Math.round(performance.now()));
    if (action === 'dive') await page.locator('#dive').click({timeout: 60000});
    // Show me around can sit in a sheet that is not on screen at this moment; the click is what matters here.
    else await page.evaluate(() => document.querySelector('#guided-dive').click());
    await page.waitForFunction(() => window.__probe.submergedAt || window.oceanDiagnostics?.error, null, {timeout: 300000, polling: 100});
    await page.waitForFunction(() => window.oceanExperienceMetrics?.snapshot().stages.firstUsableDive !== undefined, null, {timeout: 120000, polling: 100}).catch(() => errors.push('no usable dive'));
    const result = await page.evaluate(() => { const d = window.oceanDiagnostics; return {startup: d.startup, quality: d.quality, error: d.error, probe: window.__probe, usable: window.oceanExperienceMetrics.snapshot().stages.firstUsableDive}; });
    const s = result.startup, readyAt = (await page.evaluate(() => window.oceanDiagnostics.readyAt)), rel = at => typeof at === 'number' ? at - readyAt : null;
    // The surface between ready and the click: frame gaps over 50 ms and the worst one; long tasks.
    const surfaceGaps = result.probe.gaps.filter(([at]) => at > readyAt && at <= clickAt).map(([, gap]) => gap);
    const surfaceLong = result.probe.longTasks.filter(([at]) => at > readyAt && at <= clickAt);
    return {
      profile: name, action, run: index, quality: result.quality, errors: result.error ? [result.error, ...errors] : errors,
      // ms after the surface was ready
      marks: {prewarm: rel(s.prewarmAt), built: rel(s.builtAt), underReady: rel(s.underReadyAt), landmarks: rel(s.landmarksReadyAt), warmed: rel(s.warmedAt), optional: rel(s.optionalModelsAt), click: clickAt - readyAt, diveAsked: rel(s.diveAskedAt)},
      // ms after the dive was asked for (the click; for the guided dive, the end of its prelude)
      hold: {heldMs: s.heldMs ?? 0, toSubmerged: result.probe.submergedAt - (s.diveAskedAt ?? clickAt), clickToSubmerged: result.probe.submergedAt - clickAt, clickToUsable: typeof result.usable === 'number' ? Math.round(result.usable - clickAt) : null},
      surface: {frames: surfaceGaps.length, over50: surfaceGaps.filter(gap => gap > 50).length, worstGap: Math.round(Math.max(0, ...surfaceGaps)), longTasks: surfaceLong.length, longTaskMs: surfaceLong.reduce((n, [, d]) => n + d, 0)}
    };
  } finally { await browser.close(); }
}

const median = values => { const list = values.filter(v => typeof v === 'number').sort((a, b) => a - b); return list.length ? list[list.length >> 1] : null; };
const combine = runs => { const merge = items => { const first = items[0]; if (typeof first === 'number' || first === null) return median(items); if (first && typeof first === 'object' && !Array.isArray(first)) return Object.fromEntries(Object.keys(first).map(key => [key, merge(items.map(item => item?.[key]))])); return first; }; return merge(runs); };

const results = {};
try {
  for (const [name, profile] of Object.entries(PROFILES)) {
    if (ONLY && ONLY !== name) continue;
    for (const action of ACTION === 'both' ? ['dive', 'guided'] : [ACTION]) {
      const runs = [];
      for (let i = 0; i < RUNS; i++) { const r = await run(name, profile, action, i); runs.push(r); console.log(JSON.stringify(r)); }
      results[`${name}-${action}`] = {median: combine(runs), runs};
    }
  }
} finally { server.close(); }
await fs.writeFile(path.join(OUT, `hold-${LABEL}.json`), JSON.stringify({label: LABEL, throttle: THROTTLE, mbps: MBPS, after: AFTER, results}, null, 1));
console.log(`\n${LABEL}: CPU ${THROTTLE}×${MBPS ? `, ${MBPS} Mbit/s` : ''}, dive asked ${AFTER} ms after ready (medians of ${RUNS})`);
console.table(Object.fromEntries(Object.entries(results).map(([key, {median: m}]) => [key, {held: m.hold.heldMs, toSubmerged: m.hold.toSubmerged, clickToUsable: m.hold.clickToUsable, built: m.marks.built, underReady: m.marks.underReady, landmarks: m.marks.landmarks, warmed: m.marks.warmed, surfaceOver50: m.surface.over50, surfaceWorst: m.surface.worstGap, longTaskMs: m.surface.longTaskMs}])));
