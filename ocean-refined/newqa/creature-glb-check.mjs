// Loads every exported GLB of the model set back through GLTFLoader in a real browser and compares what comes out
// (skeleton, clips, painted skin or vertex colours, size) with the manifest beside it.
//   node creature-glb-check.mjs [--base http://127.0.0.1:4190/ocean-refined/]
import { chromium } from 'playwright';
const args = process.argv.slice(2), i = args.indexOf('--base'), BASE = i >= 0 ? args[i + 1] : 'http://127.0.0.1:4190/ocean-refined/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
const errors = []; page.on('pageerror', error => errors.push(String(error.message).slice(0, 300)));
await page.goto(`${BASE}creature-studio.html?bare=1&still=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.creatureStudio?.ready === true, null, { timeout: 30000 });
let failed = 0;
for (const [folder, key] of [['creature-set', 'creatures'], ['coral-set', 'corals']]) {
  // Read through the page: Node's fetch refuses the dev server's port (4190 is on the fetch spec's blocked list).
  const manifest = await page.evaluate(url => fetch(url).then(r => r.json()), `./assets/models/user-sets/sets/${folder}/manifest.json`);
  for (const entry of manifest[key]) {
    const found = await page.evaluate(url => window.creatureStudio.inspect(url), `./assets/models/user-sets/sets/${folder}/${entry.file}`);
    const near = (a, b) => Math.abs(a - b) <= Math.max(.02, b * .16);   // a clip in play moves the box a little
    const ok = key === 'creatures'
      ? found.bones === entry.bones && found.skinned === 1 && found.textured && found.clips.length === entry.clips.length && found.vertices === entry.triangles * 3 && near(found.size[2], entry.boundsMetres[2])
      : found.bones === 0 && found.meshes >= 1 && found.colours && near(found.size[0], entry.boundsMetres[0]) && near(found.size[1], entry.boundsMetres[1]);
    if (!ok) failed++;
    console.log(ok ? 'ok  ' : 'FAIL', entry.file.padEnd(30), `${(entry.bytes / 1024).toFixed(0)} KB`.padStart(7), `size ${found.size.join(' x ')} m`, key === 'creatures' ? `bones ${found.bones} clips ${found.clips.join(' ')}` : `meshes ${found.meshes}`);
  }
}
console.log(failed ? `${failed} FAILED` : 'all files load back as expected', errors.length ? errors : '');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
