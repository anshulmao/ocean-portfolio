// Performance probe of the built site (dist/), for before/after comparisons of anything that changes its weight.
// Two profiles: a phone (390×844, touch, CPU slowed 4× through CDP) and a desktop (1440×900). Each run is a fresh
// browser with an empty cache, and records:
//   load     requests and bytes until the surface is ready, until the first dive is usable, and until every model pack
//            has settled; bytes are raw and "wire" (text types gzipped as a host would; GLB, fonts, images as they are)
//   time     ms to ready, to the first usable dive, to settled; long tasks (count, total ms) up to the first usable dive
//   memory   JS heap after load and after a 20 s dive (after a forced collection)
//   renderer renderer.info at the surface and in the dive: draw calls, triangles, programs, textures, geometries
//   frame    main-thread cost while diving: the time spent in animation-frame callbacks per drawn frame (the frame loop:
//            simulation, culling and the WebGL calls of the draw), and CDP's script/task time per second of dive
// SwiftShader draws on the CPU, so frame rates here say little about a GPU; the CPU/JS numbers, bytes, requests,
// calls, triangles and memory are what to compare. Noisy numbers are the median of the runs.
// SwiftShader also fills pixels slowly enough (a frame or two a second at 1440×900 on a shared machine) that everything
// the page paces by its frames, loading included, waits on it. So by default the page is told its display has a quarter
// of a pixel per CSS pixel: draw calls, triangles and the CPU work are unchanged, the fill is a sixteenth, and the
// timings measure the page rather than the software rasteriser. --real-fill keeps the profile's own pixel ratio (use it
// for screenshots and to read the pixel ratio the page picks); the result records which was used.
// --profile adds a CPU profile of the fixed steps (CDP sampling): the functions with the most self time (with
// PROBE_JS_FLAGS=--max-inlined-bytecode-size=0 a function inlined into its caller is counted as itself), and saves
// the profile as <out>/<label>-<profile>-<run>.cpuprofile (DevTools opens it).
//   node tools/perf-probe.mjs [--runs 3] [--only phone|desktop] [--label name] [--shots] [--real-fill] [--profile] [--out dir] [--dist dir]
// Run `npm run build` first. Writes <out>/perf-<label>.json and prints a table. PLAYWRIGHT_CHROMIUM_PATH as for smoke.
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
// --dist serves another build (a copy of an earlier one, to compare against); its vercel.json is the one beside it.
const dist = path.resolve(option('dist', path.join(root, 'dist')));
const RUNS = Number(option('runs', 3)), ONLY = option('only', ''), LABEL = option('label', 'probe'), SHOTS = args.includes('--shots'), FILL = args.includes('--real-fill') ? 'real' : 'lite', PROFILE = args.includes('--profile');
const OUT = path.resolve(option('out', path.join(os.tmpdir(), 'ocean-perf')));
await fs.mkdir(OUT, {recursive: true});
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.pdf': 'application/pdf', '.xml': 'application/xml', '.txt': 'text/plain', '.md': 'text/markdown'};
const TEXT = /^(?:text\/|application\/(?:json|xml)|image\/svg)/;

// The server notes every response with its raw size and the size a compressing host would send.
const wire = new Map();
async function wireSize(file, bytes, type) { if (!TEXT.test(type)) return bytes.length; if (!wire.has(file)) wire.set(file, zlib.gzipSync(bytes, {level: 6}).length); return wire.get(file); }
// Headers as the host sends them (vercel.json, written by the build): the coral cache checks its source models by the
// X-Asset-SHA256 header there, and without it would fall back to downloading and placing the 24 MB of originals.
const HOST_HEADERS = JSON.parse(await fs.readFile(path.join(dist, '..', 'vercel.json'), 'utf8')).headers.map(rule => ({match: new RegExp(`^${rule.source}$`), headers: rule.headers}));
const hostHeaders = pathname => Object.fromEntries(HOST_HEADERS.filter(rule => rule.match.test(pathname)).flatMap(rule => rule.headers.map(header => [header.key, header.value])));
let log = [];
const server = http.createServer(async (request, response) => {
  let file = path.join(dist, decodeURIComponent(new URL(request.url, 'http://local').pathname));
  if (!file.startsWith(dist)) { response.writeHead(403).end(); return; }
  try {
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const bytes = await fs.readFile(file), type = TYPES[path.extname(file)] || 'application/octet-stream';
    const head = request.method === 'HEAD';
    log.push({at: Date.now(), method: request.method, path: path.relative(dist, file), raw: head ? 0 : bytes.length, wire: head ? 0 : await wireSize(file, bytes, type)});
    response.writeHead(200, {...hostHeaders(new URL(request.url, 'http://local').pathname), 'Content-Type': type, 'Content-Length': bytes.length}); response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const PROFILES = {
  phone: {context: {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 3}, throttle: 4, cores: 6},
  // This machine has few cores, and fewer than five puts world.js in economy detail: a desktop says it has eight.
  desktop: {context: {viewport: {width: 1440, height: 900}, deviceScaleFactor: 1}, throttle: 1, cores: 8}
};
// Fixed places for the dive: [eye, look-at], each held for half of the dive.
const SPOTS = [[[0, -9, 4], [6, -12, -14]], [[-20, -22, -40], [-6, -28, -60]]];
const DIVE_SECONDS = 20;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Runs in the page before any of its scripts: long tasks from the start, every resource timed, and the time spent in
// each animation-frame callback.
function instrument({cores, lite}) {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {get: () => cores, configurable: true});
  if (lite) Object.defineProperty(window, 'devicePixelRatio', {get: () => .25, configurable: true});
  performance.setResourceTimingBufferSize(5000);
  const probe = window.__probe = {longTasks: [], rafMs: 0, rafCalls: 0};
  try { new PerformanceObserver(list => { for (const entry of list.getEntries()) probe.longTasks.push([Math.round(entry.startTime), Math.round(entry.duration)]); }).observe({type: 'longtask', buffered: true}); } catch {}
  // The dive waits for the landmarks (world.js): the wall-clock moment they settle marks what a first dive must download.
  const watch = setInterval(() => { if (window.oceanDiagnostics?.landmarksSettled) { probe.landmarksAt = Date.now(); clearInterval(watch); } }, 50);
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(now => { const start = performance.now(); try { callback(now); } finally { probe.rafMs += performance.now() - start; probe.rafCalls++; } });
}

async function heap(cdp) { await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize; }
async function cdpTimes(cdp) { const {metrics} = await cdp.send('Performance.getMetrics'), get = name => metrics.find(m => m.name === name)?.value ?? 0; return {task: get('TaskDuration') * 1000, script: get('ScriptDuration') * 1000, layout: get('LayoutDuration') * 1000, style: get('RecalcStyleDuration') * 1000}; }
const info = page => page.evaluate(() => {
  const r = window.oceanControls.getRenderer(), d = window.oceanDiagnostics;
  window.oceanControls.render();
  return {calls: r.info.render.calls, triangles: r.info.render.triangles, programs: r.info.programs?.length ?? 0, textures: r.info.memory.textures, geometries: r.info.memory.geometries, pixelRatio: d.pixelRatio, renderScale: d.renderScale, quality: d.quality, antialias: d.antialias};
});
const sumLog = (from, to) => { const list = log.filter(entry => entry.at >= from && entry.at <= to); return {requests: list.length, raw: list.reduce((n, e) => n + e.raw, 0), wire: list.reduce((n, e) => n + e.wire, 0)}; };

async function run(name, profile, index) {
  const browser = await launchBrowser({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...(process.env.PROBE_JS_FLAGS ? [`--js-flags=${process.env.PROBE_JS_FLAGS}`] : [])]});
  try { return await measure(name, profile, index, browser); } finally { await browser.close(); }
}
async function measure(name, profile, index, browser) {
  const context = await browser.newContext(profile.context), page = await context.newPage(), errors = [];
  await context.addInitScript(instrument, {cores: profile.cores, lite: FILL === 'lite'});
  page.on('pageerror', error => errors.push(String(error.message).slice(0, 200)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (profile.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', {rate: profile.throttle});
  log = [];
  const t0 = Date.now();
  await page.goto(base, {waitUntil: 'domcontentloaded', timeout: 120000});
  await page.waitForFunction(() => window.oceanDiagnostics?.ready === true || window.oceanDiagnostics?.error, null, {timeout: 180000, polling: 50});
  const tReady = Date.now();
  const ready = await page.evaluate(() => ({readyAt: window.oceanDiagnostics.readyAt, error: window.oceanDiagnostics.error, startup: window.oceanDiagnostics.startup}));
  if (ready.error) throw Error(`${name}: ${ready.error}`);
  const loadReady = sumLog(t0, tReady);
  // The surface as a visitor first sees it: a clear day held clear (rain changes the cost), the clock left running as it runs for a visitor.
  await page.evaluate(() => { document.querySelector('#day')?.click(); window.oceanControls.weather.set('clear'); window.oceanControls.weather.lock(true); window.oceanControls.setRenderBudget('full'); });
  await sleep(1500);
  const surface = await info(page);
  if (SHOTS) await page.screenshot({path: path.join(OUT, `${LABEL}-${name}-surface.png`)});
  const heapReady = await heap(cdp), atSurface = await page.evaluate(() => ({optionalModels: window.oceanDiagnostics.optionalModels, requests: performance.getEntriesByType('resource').length}));
  // The first dive, as the dive button asks for it.
  await page.evaluate(() => window.oceanControls.startDive());
  await page.waitForFunction(() => window.oceanExperienceMetrics.snapshot().stages.firstUsableDive !== undefined, null, {timeout: 240000, polling: 100});
  const tDive = Date.now();
  const diveStages = await page.evaluate(() => ({stages: window.oceanExperienceMetrics.snapshot().stages, longTasks: window.__probe.longTasks}));
  const loadDive = sumLog(t0, tDive);
  const longUntilDive = diveStages.longTasks.filter(([start]) => start <= diveStages.stages.firstUsableDive);
  // Every model pack settled (landmarks, then creatures and corals): what the whole first visit downloads.
  await page.waitForFunction(() => { const d = window.oceanDiagnostics; return d.landmarksSettled && (d.optionalModels === 'settled' || d.prewarm === 'data-saver'); }, null, {timeout: 300000, polling: 250}).catch(() => errors.push('models never settled'));
  const tSettled = Date.now(), loadSettled = sumLog(t0, tSettled), loadGate = sumLog(t0, await page.evaluate(() => window.__probe.landmarksAt || Date.now()));
  // What was fetched, largest first (a file fetched twice shows count 2).
  const files = {};for (const entry of log) if (entry.at <= tSettled) { const f = files[entry.path] ||= {count: 0, wire: 0, first: entry.at - t0}; f.count++; f.wire += entry.wire; }
  const settledAt = await page.evaluate(() => window.oceanExperienceMetrics.snapshot().stages.optionalModelsSettled ?? null);
  // The dive: two fixed places, half of it each. Frame cost is what the frame loop spent per frame it drew.
  const frames = [];
  let dive = null, hotspots = null, fixed = null;
  const before = await cdpTimes(cdp), clockBefore = Date.now();
  for (const [i, [eye, look]] of SPOTS.entries()) {
    await page.evaluate(([eye, look]) => window.oceanControls.place(eye, look), [eye, look]);
    await sleep(1500);
    const start = await page.evaluate(() => ({ms: window.__probe.rafMs, calls: window.__probe.rafCalls, frames: window.oceanDiagnostics.frames}));
    await sleep(DIVE_SECONDS * 500 - 1500);
    const end = await page.evaluate(() => ({ms: window.__probe.rafMs, calls: window.__probe.rafCalls, frames: window.oceanDiagnostics.frames}));
    frames.push({ms: end.ms - start.ms, calls: end.calls - start.calls, drawn: end.frames - start.frames});
    if (i === 0) {
      dive = await info(page); if (SHOTS) await page.screenshot({path: path.join(OUT, `${LABEL}-${name}-dive.png`)});
      // The frame loop's own pace here is SwiftShader's, and a slow pace hands the world long steps (up to 0.1 s), which
      // cost more than a phone's 1/30 s ones. So the world is also stepped at a fixed 1/30 s, synchronously, as on a
      // device that keeps 30 frames a second. The draw is left out (renderer.render does nothing meanwhile): its WebGL
      // calls wait on SwiftShader's command buffer here, which says nothing about a phone. What is left is the world's
      // own update per frame: simulation, animation mixers, culling, the HUD.
      if (PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', {interval: 200}); await cdp.send('Profiler.start'); }
      fixed = await page.evaluate(() => {
        const c = window.oceanControls, renderer = c.getRenderer(), render = renderer.render, steps = [], median = list => list.sort((a, b) => a - b)[list.length >> 1];
        renderer.render = () => {};
        try { for (let i = 0; i < 130; i++) { const start = performance.now(); c.step(1 / 30, 1 / 30); if (i >= 10) steps.push(performance.now() - start); } } finally { renderer.render = render; }
        return {updateMs: +median(steps).toFixed(2), updateP90Ms: +steps.sort((a, b) => a - b)[Math.floor(steps.length * .9)].toFixed(2)};
      });
      if (PROFILE) { const {profile: cpu} = await cdp.send('Profiler.stop'); hotspots = selfTimes(cpu, 120); await fs.writeFile(path.join(OUT, `${LABEL}-${name}-${index}.cpuprofile`), JSON.stringify(cpu)); }
    }
    else if (SHOTS) await page.screenshot({path: path.join(OUT, `${LABEL}-${name}-slope.png`)});
  }
  const after = await cdpTimes(cdp), seconds = (Date.now() - clockBefore) / 1000;
  const heapDive = await heap(cdp);
  const drawn = frames.reduce((n, f) => n + f.drawn, 0), rafMs = frames.reduce((n, f) => n + f.ms, 0);
  const detail = await page.evaluate(() => { const d = window.oceanDiagnostics; return {renderScale: d.renderScale, pixelRatio: d.pixelRatio, quality: d.quality, gpuTier: d.gpuTier, antialias: d.antialias, fps: d.fps, work: {steps: d.work.steps, ms: Math.round(d.work.ms), longest: d.work.longest, longestName: d.work.longestName}, under: d.startup.under, coralCache: window.oceanControls.models?.coralCache?.status ?? null}; });
  detail.atSurface = atSurface;
  return {
    profile: name, run: index, errors, files: Object.fromEntries(Object.entries(files).sort((a, b) => b[1].wire - a[1].wire)),
    load: {ready: loadReady, gate: loadGate, dive: loadDive, settled: loadSettled},
    time: {readyMs: ready.readyAt, diveMs: diveStages.stages.firstUsableDive, settledMs: settledAt, longTasksToDive: longUntilDive.length, longTaskMsToDive: longUntilDive.reduce((n, [, d]) => n + d, 0), longestToDive: Math.max(0, ...longUntilDive.map(([, d]) => d))},
    memory: {heapReadyMB: +(heapReady / 1e6).toFixed(1), heapDiveMB: +(heapDive / 1e6).toFixed(1)},
    renderer: {surface, dive},
    frame: {drawn, fps: +(drawn / (frames.length * (DIVE_SECONDS / 2 - 1.5))).toFixed(1), rafMsPerFrame: drawn ? +(rafMs / drawn).toFixed(2) : null, scriptMsPerSecond: +((after.script - before.script) / seconds).toFixed(1), taskMsPerSecond: +((after.task - before.task) / seconds).toFixed(1), styleLayoutMsPerSecond: +((after.style + after.layout - before.style - before.layout) / seconds).toFixed(1), ...fixed},
    detail, startup: ready.startup, ...(hotspots ? {hotspots} : {})
  };
}

// Self time per function (ms per fixed step), from a CDP CPU profile.
function selfTimes(profile, drawn) {
  const byId = new Map(profile.nodes.map(node => [node.id, node])), self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]), frame = node.callFrame, dt = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    const key = `${frame.functionName || '(anonymous)'} ${frame.url.split('/').pop()}:${frame.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + dt);
  }
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([key, ms]) => [key, +(ms / Math.max(1, drawn)).toFixed(3)]);
}
const median = values => { const list = values.filter(v => typeof v === 'number').sort((a, b) => a - b); return list.length ? list[list.length >> 1] : null; };
// The median of every numeric leaf across the runs; the rest is taken from the first run.
function combine(runs) {
  const merge = (items) => {
    const first = items[0];
    if (typeof first === 'number') return median(items);
    if (first && typeof first === 'object' && !Array.isArray(first)) return Object.fromEntries(Object.keys(first).map(key => [key, merge(items.map(item => item?.[key]))]));
    return first;
  };
  return merge(runs);
}

const results = {label: LABEL, at: new Date().toISOString(), runs: RUNS, fill: FILL, profiles: {}};
try {
  for (const [name, profile] of Object.entries(PROFILES)) {
    if (ONLY && ONLY !== name) continue;
    const runs = [];
    for (let i = 0; i < RUNS; i++) { const result = await run(name, profile, i); runs.push(result); console.error(`${name} run ${i + 1}/${RUNS}: ready ${result.time.readyMs} ms, dive ${result.time.diveMs} ms, ${result.frame.rafMsPerFrame} ms/frame${result.errors.length ? ', errors: ' + result.errors.join(' | ') : ''}`); }
    results.profiles[name] = {median: combine(runs), runs};
  }
} finally { server.close(); }
await fs.writeFile(path.join(OUT, `perf-${LABEL}.json`), JSON.stringify(results, null, 1));

const kb = n => `${(n / 1024).toFixed(0)} KB`, mb = n => `${(n / 1048576).toFixed(2)} MB`;
const rows = [
  ['requests to ready', m => m.load.ready.requests], ['wire bytes to ready', m => kb(m.load.ready.wire)], ['raw bytes to ready', m => kb(m.load.ready.raw)],
  ['requests until dive may go under', m => m.load.gate.requests], ['wire bytes until dive may go under', m => mb(m.load.gate.wire)],
  ['requests to first dive', m => m.load.dive.requests], ['wire bytes to first dive', m => mb(m.load.dive.wire)],
  ['requests to settled', m => m.load.settled.requests], ['wire bytes to settled', m => mb(m.load.settled.wire)],
  ['ready (ms)', m => m.time.readyMs], ['first usable dive (ms)', m => m.time.diveMs], ['models settled (ms)', m => m.time.settledMs],
  ['long tasks to dive', m => `${m.time.longTasksToDive} / ${m.time.longTaskMsToDive} ms (max ${m.time.longestToDive})`],
  ['heap after ready (MB)', m => m.memory.heapReadyMB], ['heap after dive (MB)', m => m.memory.heapDiveMB],
  ['surface calls / tris', m => `${m.renderer.surface.calls} / ${Math.round(m.renderer.surface.triangles / 1000)}k`],
  ['dive calls / tris', m => `${m.renderer.dive.calls} / ${Math.round(m.renderer.dive.triangles / 1000)}k`],
  ['programs / textures / geometries', m => `${m.renderer.dive.programs} / ${m.renderer.dive.textures} / ${m.renderer.dive.geometries}`],
  ['world update ms (1/30 s step)', m => m.frame.updateMs], ['world update p90 ms', m => m.frame.updateP90Ms],
  ['frame-loop ms per drawn frame', m => m.frame.rafMsPerFrame], ['script ms per s (dive)', m => m.frame.scriptMsPerSecond], ['main-thread task ms per s', m => m.frame.taskMsPerSecond],
  ['drawn fps (SwiftShader)', m => m.frame.fps], ['pixel ratio × scale', m => `${m.renderer.dive.pixelRatio} (${m.renderer.dive.renderScale})`]
];
const names = Object.keys(results.profiles);
console.log(`\nperf-probe ${LABEL}, median of ${RUNS} run(s), ${FILL} fill\n`);
console.log(['metric'.padEnd(34), ...names.map(n => n.padStart(26))].join(''));
for (const [title, get] of rows) console.log([title.padEnd(34), ...names.map(n => String(get(results.profiles[n].median)).padStart(26))].join(''));
console.log(`\n${path.join(OUT, `perf-${LABEL}.json`)}`);
