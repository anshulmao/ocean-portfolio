// Frame timing at fixed places on the reef, for before/after comparisons of anything that adds life to it.
// Dives, then stands at each spot for a few seconds looking along a fixed heading, and records frame times,
// draw calls and triangles there. Headless, real GPU.
//   node reef-probe.mjs [--url http://127.0.0.1:4190/ocean-refined/] [--label name] [--seconds 6] [--hold 0] [--force whale-shark,dolphins]
// --hold N first waits N seconds underwater (so timed visitors have had a chance to arrive).
import { chromium } from 'playwright';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const FORCE = option('force', '').split(',').filter(Boolean), URL = option('url', 'http://127.0.0.1:4190/ocean-refined/'), LABEL = option('label', 'probe'), SECONDS = Number(option('seconds', 6)), HOLD = Number(option('hold', 0));
const here = dirname(fileURLToPath(import.meta.url)), shots = join(here, '..', 'qa', 'captures', `probe-${LABEL}`);
mkdirSync(shots, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// [name, eye, look-at]
const SPOTS = [
  ['start shallows', [0, -9, 4], [6, -12, -14]],
  ['about reef', [-4, -10, -6], [-12, -12, -18]],
  ['wreck', [8, -19, -30], [18, -24, -40]],
  ['mid slope', [-20, -22, -40], [-6, -28, -60]],
  ['deep ledge', [-8, -38, -70], [-18, -46, -84]],
  ['open blue', [30, -14, -60], [10, -16, -90]]
];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await context.addInitScript(() => { const frames = []; let last = 0; window.__probe = { take: () => frames.splice(0) }; const loop = now => { if (last) frames.push(now - last); last = now; requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(String(error.message).slice(0, 200)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.oceanDiagnostics?.ready === true, null, { timeout: 90000 });
await page.evaluate(() => { document.querySelector('#day')?.click(); window.oceanControls.weather?.set?.('clear'); });
await page.locator('#dive').click();
await page.waitForFunction(() => window.oceanControls?.getMode?.() === 'diver', null, { timeout: 60000 });
// Let every model pack finish loading and compiling before timing anything.
await page.waitForFunction(() => { const d = window.oceanDiagnostics; return !d.modelLoading && (d.userCreatures?.ready ?? true) && (d.userCorals?.ready ?? true); }, null, { timeout: 120000 }).catch(() => errors.push('models never settled'));
await sleep(4000 + HOLD * 1000);
const stats = deltas => { const s = [...deltas].sort((a, b) => a - b), at = q => +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(1), total = deltas.reduce((a, b) => a + b, 0); return { fps: +(1000 * deltas.length / total).toFixed(1), p50: at(.5), p95: at(.95), worst: +s[s.length - 1].toFixed(1), over33: deltas.filter(v => v > 33.4).length }; };
const rows = [];
for (const [name, eye, look] of SPOTS) {
  await page.evaluate(([eye, look]) => window.oceanControls.place(eye, look), [eye, look]);
  // --force whale,orcas: bring encounters in at their closest pass at every spot, for the worst case.
  if (FORCE.length) await page.evaluate(ids => { const c = window.oceanControls, p = c.getPlayerPosition(); for (const id of ids) { c.creatures?.debug.spawn(id, p); c.creatures?.debug.seek(id, .47); } }, FORCE);
  await sleep(1500); await page.evaluate(() => window.__probe.take());
  await sleep(SECONDS * 1000);
  const deltas = await page.evaluate(() => window.__probe.take());
  const state = await page.evaluate(() => { const d = window.oceanDiagnostics; return { calls: d.drawCalls, triangles: d.triangles, scale: d.renderScale, creatures: d.userCreatures?.shown ? JSON.parse(JSON.stringify(d.userCreatures.shown)) : null }; });
  await page.screenshot({ path: join(shots, `${name.replace(/\s+/g, '-')}.png`) });
  rows.push({ name, ...stats(deltas), ...state });
}
const summary = `${new Date().toISOString()} ${LABEL} | ` + rows.map(r => `${r.name}: ${r.fps} fps p95 ${r.p95} worst ${r.worst} >33:${r.over33} calls ${r.calls} tris ${Math.round(r.triangles / 1000)}k`).join(' | ') + ` | errors ${errors.length}`;
appendFileSync(join(here, '..', 'qa', 'captures', 'probe-history.log'), summary + '\n');
writeFileSync(join(shots, 'report.json'), JSON.stringify({ rows, errors }, null, 1));
console.log(JSON.stringify({ rows, errors }, null, 1));
await browser.close();
