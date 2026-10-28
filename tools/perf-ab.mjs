// A/B of the world's per-frame update between two builds, side by side in one browser so that the load on the machine
// falls on both alike. Each build is opened (phone or desktop profile, as in perf-probe.mjs), dived and left to settle
// with every model pack loaded, then held at the same place with its own frame loop stopped; the two are then stepped
// in turns, a round of 60 fixed 1/30 s steps each (renderer.render stubbed out: the update alone), and the medians of
// the rounds are compared.
//   node tools/perf-ab.mjs <distA> <distB> [--only phone|desktop] [--rounds 9]
// Each dist's vercel.json is the one beside it, as for perf-probe.mjs --dist.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser} from './browser.mjs';

const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const [distA, distB] = args.filter((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--')).map(dir => path.resolve(dir));
const ROUNDS = Number(option('rounds', 9)), ONLY = option('only', '');
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png'};
async function serve(dist) {
  const rules = JSON.parse(await fs.readFile(path.join(dist, '..', 'vercel.json'), 'utf8')).headers.map(rule => ({match: new RegExp(`^${rule.source}$`), headers: rule.headers}));
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://local').pathname;
    let file = path.join(dist, decodeURIComponent(pathname));
    try {
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const body = await fs.readFile(file), headers = Object.fromEntries(rules.filter(rule => rule.match.test(pathname)).flatMap(rule => rule.headers.map(h => [h.key, h.value])));
      response.writeHead(200, {...headers, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': body.length}); response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}
const PROFILES = {
  phone: {context: {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}, cores: 6},
  desktop: {context: {viewport: {width: 1440, height: 900}}, cores: 8}
};
const servers = [await serve(distA), await serve(distB)];
const browser = await launchBrowser({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const median = list => [...list].sort((a, b) => a - b)[list.length >> 1];
try {
  for (const [name, profile] of Object.entries(PROFILES)) {
    if (ONLY && ONLY !== name) continue;
    const pages = [];
    for (const server of servers) {
      const context = await browser.newContext(profile.context);
      await context.addInitScript(cores => { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {get: () => cores}); Object.defineProperty(window, 'devicePixelRatio', {get: () => .25}); }, profile.cores);
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => window.oceanDiagnostics?.ready, null, {timeout: 300000});
      await page.evaluate(() => { document.querySelector('#day')?.click(); window.oceanControls.weather.set('clear'); window.oceanControls.weather.lock(true); window.oceanControls.startDive(); });
      pages.push(page);
    }
    for (const page of pages) {
      await page.waitForFunction(() => window.oceanControls.getMode() === 'diver' && !window.oceanControls.getTransition() && window.oceanDiagnostics.optionalModels === 'settled', null, {timeout: 900000, polling: 500});
      await page.evaluate(() => { window.oceanControls.place([0, -9, 4], [6, -12, -14]); window.requestAnimationFrame = () => 0; });
    }
    const rounds = [[], []];
    const round = page => page.evaluate(() => {
      const c = window.oceanControls, renderer = c.getRenderer(), render = renderer.render, times = [];
      renderer.render = () => {};
      try { for (let i = 0; i < 60; i++) { const start = performance.now(); c.step(1 / 30, 1 / 30); times.push(performance.now() - start); } } finally { renderer.render = render; }
      return times.sort((a, b) => a - b)[30];
    });
    for (const page of pages) await round(page);                      // a first round each to settle the code
    for (let r = 0; r < ROUNDS; r++) for (const [i, page] of (r % 2 ? [...pages].reverse().entries() : pages.entries())) rounds[r % 2 ? 1 - i : i].push(await round(page));
    const [a, b] = rounds.map(median);
    console.log(`${name}: world update per 1/30 s step, median of ${ROUNDS} rounds: A ${a.toFixed(2)} ms, B ${b.toFixed(2)} ms (${((b / a - 1) * 100).toFixed(0)}%)  rounds A ${rounds[0].map(v => v.toFixed(1)).join(' ')} | B ${rounds[1].map(v => v.toFixed(1)).join(' ')}`);
    for (const page of pages) await page.context().close();
  }
} finally { await browser.close(); for (const server of servers) server.close(); }
