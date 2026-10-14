// CPU time spent each frame in the creature set's update, with and without encounters under way.
//   node creature-cpu.mjs [--url http://127.0.0.1:4190/ocean-refined/]
import { chromium } from 'playwright';
const args = process.argv.slice(2), i = args.indexOf('--url'), URL = i >= 0 ? args[i + 1] : 'http://127.0.0.1:4190/ocean-refined/';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.oceanDiagnostics?.ready === true, null, { timeout: 90000 });
await page.locator('#dive').click();
await page.waitForFunction(() => window.oceanDiagnostics.userCreatures?.ready, null, { timeout: 120000 });
await sleep(3000);
await page.evaluate(() => { const c = window.oceanControls.creatures, update = c.update, times = []; window.__cpu = times; c.update = (...a) => { const t = performance.now(); update(...a); times.push(performance.now() - t); }; });
const measure = async label => { await page.evaluate(() => window.__cpu.splice(0)); await sleep(5000); const t = await page.evaluate(() => window.__cpu.splice(0)); t.sort((a, b) => a - b); return { label, frames: t.length, mean: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(3), p95: +t[Math.floor(t.length * .95)].toFixed(3), worst: +t[t.length - 1].toFixed(3) }; };
const rows = [];
for (const [label, eye, look] of [['shallows', [0, -9, 4], [6, -12, -14]], ['mid reef', [20, -16, -12], [30, -20, -30]]]) {
  await page.evaluate(([e, l]) => window.oceanControls.place(e, l), [eye, look]); await sleep(1200);
  rows.push(await measure(`${label}, no encounter`));
  await page.evaluate(() => { const c = window.oceanControls, p = c.getPlayerPosition(); for (const id of ['whale-shark', 'dolphins']) { c.creatures.debug.spawn(id, p); c.creatures.debug.seek(id, .47); } });
  rows.push(await measure(`${label}, whale shark and dolphins passing`));
}
console.log(JSON.stringify(rows, null, 1));
await browser.close();
