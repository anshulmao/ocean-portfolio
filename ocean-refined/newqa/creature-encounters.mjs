// The creature set in the real scene: loads, dives, brings in each encounter at its closest pass and photographs it,
// then visits the residents and schools. Headless, real GPU.
//   node ocean-refined/newqa/creature-encounters.mjs [--url http://127.0.0.1:4190/ocean-refined/] [--out name] [--only whale,orcas]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const URL = option('url', 'http://127.0.0.1:4190/ocean-refined/');
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'qa', 'captures', option('out', 'encounters'));
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error.message).slice(0, 300)));
page.on('console', message => { if (message.type() === 'error' || /unavailable|warn/i.test(message.text())) errors.push(`${message.type()}: ${message.text().slice(0, 300)}`); });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.oceanDiagnostics?.ready === true, null, { timeout: 90000 });
await page.evaluate(() => { document.querySelector('#day')?.click(); window.oceanControls.weather?.set?.('clear'); });
await page.locator('#dive').click();
await page.waitForFunction(() => window.oceanControls?.getMode?.() === 'diver', null, { timeout: 60000 });
await page.waitForFunction(() => window.oceanDiagnostics.userCreatures?.ready, null, { timeout: 120000 }).catch(() => errors.push('creature set never became ready'));
await sleep(2500);
await page.evaluate(() => { const c = window.oceanControls; if (c.nav.perspective === 'third') c.toggleCamera(); const style = document.createElement('style'); style.textContent = 'body>*:not(#world):not(canvas){opacity:0!important}'; document.head.append(style); });
const snap = name => page.screenshot({ path: join(out, `${name}.png`) });
const diagnostics = await page.evaluate(() => { const d = window.oceanDiagnostics.userCreatures; return { ready: d.ready, loaded: d.loaded, failed: d.failed, errors: d.errors, visitors: d.visitors, schoolFish: d.schoolFish, schoolDrawCalls: d.schoolDrawCalls, slots: window.oceanControls.creatures.debug.slots() }; });
const look = async (filter, gap, up = .25) => page.evaluate(([filter, gap, up]) => {
  const c = window.oceanControls, list = c.creatures.sites().filter(s => s.id === filter || s.species === filter || s.kind === filter), site = list[0]; if (!site) return null;
  const [x, y, z] = site.position, d = Math.max(4, site.length * gap), p = c.getPlayerPosition(), a = Math.atan2(p.x - x, p.z - z) || .7;
  c.place([x + Math.sin(a) * d, Math.min(-1.5, y + d * up), z + Math.cos(a) * d], [x, y, z]); return site;
}, [filter, gap, up]);
const report = { diagnostics, encounters: {}, residents: {} };
const only = option('only', '');
for (const id of only ? only.split(',') : ['whale', 'whale-shark', 'orcas', 'manta', 'dolphins', 'blacktips', 'hammerheads', 'eagle-rays', 'tuna']) {
  await page.evaluate(id => { const c = window.oceanControls, p = c.getPlayerPosition(); c.creatures.debug.spawn(id, p); c.creatures.debug.seek(id, .5); }, id);
  await sleep(600);
  const lead = { whale: 'right-whale', 'whale-shark': 'whale-shark', orcas: 'orca', dolphins: 'bottlenose-dolphin', blacktips: 'blacktip-reef-shark', hammerheads: 'scalloped-hammerhead', manta: 'manta-ray', 'eagle-rays': 'spotted-eagle-ray', tuna: 'yellowfin-tuna' }[id];
  // The whale is meant to be seen far off: photograph it from where the diver is, then from closer to check the model.
  if (id === 'whale') { await page.evaluate(() => { const c = window.oceanControls, s = c.creatures.sites().find(s => s.species === 'right-whale'), p = c.getPlayerPosition(); c.place([p.x, p.y, p.z], s.position); }); await sleep(1200); await snap('whale-as-seen'); }
  report.encounters[id] = await look(lead, id === 'whale' ? 1.3 : 1.6);
  await sleep(1500); await snap(`encounter-${id}`);
}
for (const [name, filter, gap] of [['bumpheads', 'bumphead-parrotfish', 2], ['whipray', 'pink-whipray', 1.6], ['moray', 'giant-moray', 1.1], ['ribbon-eel', 'ribbon-eel', 1.2], ['sleeper', 'nurse-shark', 1.4], ['sentinel', 'great-barracuda', 2.2], ['bluespot', 'bluespotted-ray', 2], ['anthias', 'anthias', 1.4], ['garden-eels', 'garden-eel', .9], ['fusiliers', 'fusilier', .8], ['wheel', 'shoal', .9], ['trevally', 'giant-trevally', .8], ['butterflies', 'butterflyfish', 3], ['flying-fish', 'flying-fish', 1],
  ['turtle', 'green-turtle', 1.5], ['whitetip', 'whitetip-reef-shark', 1.3], ['cuttlefish', 'broadclub-cuttlefish', 1.8], ['blue-star', 'blue-sea-star', 4], ['chip-star', 'chocolate-chip-sea-star', 4], ['urchin', 'long-spined-urchin', 3],
  ['humphead', 'humphead-wrasse', 1.4], ['yellow-tang', 'yellow-tang', 3], ['triggerfish', 'picasso-triggerfish', 3]]) {
  report.residents[name] = await look(filter, gap, name === 'garden-eels' ? .5 : .25);
  await sleep(1600); await snap(`resident-${name}`);
}
// The pufferfish, octopus and crabs are living-world.js's animals drawn with the set's models: they wake when the diver
// comes near their site, so the camera goes there first.
for (const [name, site, species, gap] of [['puffer', 'puffer-shallows', 'white-spotted-puffer', 3], ['octopus', 'octopus', 'day-octopus', 3], ['crabs', 'crabs-shallows', 'spotted-reef-crab', 14], ['clownfish', 'anemone-anchor', 'clownfish', 14]]) {
  await page.evaluate(id => { const c = window.oceanControls, s = c.life.sites.find(item => item.id === id), [x, y, z] = s.position; c.place([x + 3, y + 2.5, z + 3], [x, y, z]); }, site);
  await sleep(1200);
  report.residents[name] = await look(species, gap, .4);
  await sleep(1400); await snap(`puppet-${name}`);
}
report.puppets = await page.evaluate(() => window.oceanControls.life.puppets.reduce((out, p) => { out[p.species] = (out[p.species] || 0) + (p.adopted ? 1 : 0); return out; }, {}));
report.after = await page.evaluate(() => ({ shown: window.oceanDiagnostics.userCreatures.shown, finite: window.oceanDiagnostics.userCreatures.finite, calls: window.oceanDiagnostics.drawCalls, triangles: window.oceanDiagnostics.triangles }));
report.errors = [...new Set(errors)];
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ out, diagnostics, puppets: report.puppets, after: report.after, errors: report.errors }, null, 1));
await browser.close();

if (!diagnostics.ready || diagnostics.loaded !== 45 || diagnostics.failed || !report.after.finite || report.errors.length || Object.values(report.encounters).some(value=>!value) || Object.values(report.residents).some(value=>!value)) process.exitCode=1;
