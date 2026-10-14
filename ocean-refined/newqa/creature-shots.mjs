// Still captures of the creature set from the studio page (headless, real GPU).
//   node creature-shots.mjs [--url http://127.0.0.1:4190/ocean-refined/creature-studio.html] [--only id,id] [--out name]
// Writes contact sheets (side, quarter, top), the size line-up, and with --only a close view of each named animal
// at several moments of each clip.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const URL = option('url', 'http://127.0.0.1:4190/ocean-refined/creature-studio.html');
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'qa', 'captures', option('out', 'creatures'));
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error.message).slice(0, 300)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 300)); });
await page.goto(`${URL}?bare=1&still=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.creatureStudio?.ready === true, null, { timeout: 30000 });
const set = async (next, phase = .2) => { await page.evaluate(([n, p]) => { window.creatureStudio.set(n); window.creatureStudio.pose(p); }, [next, phase]); await sleep(350); };
const snap = name => page.screenshot({ path: join(out, `${name}.png`) });

const only = option('only', '');
if (only) {
  for (const id of only.split(',')) {
    const clips = await page.evaluate(id => (window.creatureStudio.facts().find(f => f.id === id).clips || [{ name: 'still' }]).map(c => c.name), id);
    if (!args.includes('--clips')) for (const angle of ['side', 'quarter', 'top', 'front']) { await set({ view: 'model', id, clip: clips[0], angle }, .2); await snap(`${id}-${angle}`); }
    // A film strip: each clip at four moments of its cycle, seen from the side that shows its stroke.
    if (args.includes('--clips')) for (const clip of clips) for (const phase of [0, .25, .5, .75]) { await set({ view: 'model', id, clip, angle: option('angle', 'top') }, phase); await snap(`${id}-${clip}-${phase * 100}`); }
  }
} else {
  const kind = option('kind', 'creature'), pages = Number(option('pages', kind === 'coral' ? 2 : 3)), count = await page.evaluate(kind => window.creatureStudio.items.filter(item => item.kind === kind).length, kind), per = Math.ceil(count / pages), clip = option('clip', 'swim'), phase = Number(option('phase', .2));
  for (const angle of option('angles', 'side,quarter,top').split(',')) for (let p = 0; p < pages; p++) { await set({ view: 'sheet', kind, angle, clip, per, page: p }, phase); await snap(`${kind === 'coral' ? 'coral-' : ''}sheet-${angle}-${p + 1}`); }
  await set({ view: 'lineup' }, .2); await snap('lineup');
}
writeFileSync(join(out, 'facts.json'), JSON.stringify(await page.evaluate(() => window.creatureStudio.facts()), null, 1));
console.log(JSON.stringify({ out, errors: [...new Set(errors)] }));
await browser.close();
