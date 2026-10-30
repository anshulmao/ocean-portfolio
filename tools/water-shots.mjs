// Fixed-camera captures of the water colour, for before/after comparisons of the underwater look.
// Same time of day (the day preset, clock locked), clear weather, deterministic stepping with the tab "hidden".
//   node tools/water-shots.mjs <base-url> <out-dir> [clarity%] [day|dawn|dusk|night]
// base-url serves the repository root (python serve.py --port 4190), e.g. http://127.0.0.1:4190/
import fs from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser} from './browser.mjs';

const [base = 'http://127.0.0.1:4190/', out = 'release/water/after', clarity, preset = 'day'] = process.argv.slice(2);
// [name, eye, look-at]
const SPOTS = [
  ['shallows-anchor', [-4, -6.5, -6], [-12, -9, -15]],
  ['reef-slope', [12, -14, -14], [4, -30, -60]],
  ['wreck', [27, -19, -35], [18, -21, -39]],
  ['deep-spire-up', [40, -46, -80], [20, -20, -42]]
];
await fs.mkdir(out, {recursive: true});
const browser = await launchBrowser();
const page = await browser.newPage({viewport: {width: 1280, height: 800}});
page.on('pageerror', error => console.log('page error:', error.message));
await page.addInitScript(() => { try { localStorage.setItem('ocean-time-lock', '1'); } catch {} });
await page.goto(new URL('ocean-refined/', base).href, {waitUntil: 'domcontentloaded'});
await page.waitForFunction(() => window.oceanDiagnostics?.ready, null, {timeout: 180000});
await page.evaluate(() => oceanControls.warm());
await page.waitForFunction(() => oceanControls.world.ready, null, {timeout: 180000});
await page.evaluate(async ([clarity, preset]) => {
  Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
  document.dispatchEvent(new Event('visibilitychange'));
  if (clarity) oceanControls.settings.waterClarity = Number(clarity);
  oceanControls.weather.set('clear'); oceanControls.weather.lock(true); oceanControls.time.lock(true);
  document.querySelector(`#${preset}`).click();
  oceanControls.step(8, 1 / 30);
}, [clarity, preset]);
await page.screenshot({path: path.join(out, 'surface-above.jpg'), quality: 90});
await page.evaluate(async () => {
  oceanControls.startDive({capture: false});
  for (let i = 0; i < 40 && (oceanControls.nav.mode !== 'diver' || oceanDiagnostics.transition); i++) oceanControls.step(1, 1 / 30);
  await oceanControls.world.whenEnriched;
});
for (const [name, eye, focus] of SPOTS) {
  await page.evaluate(([eye, focus]) => { oceanControls.place(eye, focus); oceanControls.step(1.5, 1 / 30); oceanControls.place(eye, focus); oceanControls.step(.5, 1 / 30); }, [eye, focus]);
  await page.screenshot({path: path.join(out, `${name}.jpg`), quality: 90});
  console.log(name, await page.evaluate(() => ({depth: oceanDiagnostics.displayDepth, camera: oceanDiagnostics.position.map(v => +v.toFixed(1))})));
}
await browser.close();
