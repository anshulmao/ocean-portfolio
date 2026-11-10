// The guided dive's payoff, against the built site (run `npm run build` first):
//   - the welcome is the water, the depth and the guide's card: compass, chart and page buttons come in with the swim;
//   - the wreck's card shows the projects themselves, and opening the wreck opens the project it is showing;
//   - back at the surface a card offers the work, the résumé and the ways to get in touch, once per dive.
// Each assertion is a visitor-visible contract (release/TESTING.md); the swims are skipped, not the states.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary'};
const server = http.createServer(async (req, res) => {
  let file = path.resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(dist + path.sep) && file !== dist) { res.writeHead(403).end(); return; }
  try {
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchBrowser({args:['--enable-unsafe-swiftshader']});
let failed = false;
try {
  const page = await browser.newPage({viewport:{width:1280,height:800}}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.oceanDiagnostics?.ready && window.oceanTour, null, {timeout:90000});
  const status = () => page.evaluate(() => window.oceanTour.status);
  const visible = selector => page.evaluate(sel => { const node = document.querySelector(sel); return Boolean(node) && !node.hidden && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none'; }, selector);
  // Continue starts the swim; Continue again skips it, so the tour stands at the next stop.
  const hop = async () => {
    await page.evaluate(() => window.oceanTour.next()); await page.waitForFunction(() => window.oceanTour.status === 'travel', null, {timeout:60000});
    await page.evaluate(() => window.oceanTour.next()); await page.waitForFunction(() => ['dwell', 'done'].includes(window.oceanTour.status), null, {timeout:60000});
  };

  assert.ok(await page.evaluate(() => window.oceanTour.start()), 'the tour starts from the surface');
  await page.waitForFunction(() => window.oceanTour.status === 'intro', null, {timeout:90000});
  await page.waitForFunction(() => document.querySelector('.tour-card')?.dataset.show === 'true', null, {timeout:30000});
  for (const selector of ['.heading-indicator', '.reef-map', '#archive-toggle', '#clear-ui-toggle'])
    assert.equal(await visible(selector), false, `${selector} waits for the first swim`);
  assert.equal(await visible('.calm-depth'), true, 'the depth card is up in the welcome');
  assert.equal(await page.locator('.tour-pace').textContent(), '', 'the welcome does not repeat its Skip button in a line');
  console.log('PASS the welcome is the water, the depth and the guide');

  await page.evaluate(() => window.oceanTour.next());
  await page.waitForFunction(() => window.oceanTour.status === 'travel', null, {timeout:60000});
  assert.equal(await visible('.reef-map'), true, 'the chart comes in with the swim');
  await page.evaluate(() => window.oceanTour.next());
  await page.waitForFunction(() => window.oceanTour.status === 'dwell', null, {timeout:60000});
  await hop(); await hop();
  assert.equal(await page.evaluate(() => window.oceanDiagnostics.tour.key), 'projects');
  await page.waitForFunction(() => window.oceanSiteCard?.shown === 'projects' && document.querySelector('.site-card')?.dataset.show === 'true', null, {timeout:30000});
  const work = await page.evaluate(() => window.oceanSiteCard.work);
  assert.ok(work.length >= 3, 'the wreck has projects to show');
  // Picked by hand, as the card is drawn in the water and may be scaled: a click on the chip itself.
  await page.evaluate(() => document.querySelector('.site-card [data-work="2"]').click());
  assert.equal(await page.evaluate(() => window.oceanSiteCard.entryFor('projects')), work[2], 'a chip picks its project');
  assert.equal(await page.locator('.site-card [data-work="2"]').getAttribute('aria-pressed'), 'true');
  const title = await page.locator('.site-card-title').textContent();
  assert.notEqual(title, 'The Wreck', 'the card names a project, not only the site');
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.oceanArchive?.isOpen, null, {timeout:30000});
  assert.deepEqual(await page.evaluate(() => window.oceanArchive.current), {section:'projects', entry:work[2]}, 'F opens the project the card shows');
  await page.evaluate(() => window.oceanArchive.close());
  await page.waitForFunction(() => !window.oceanArchive.isOpen && !window.oceanControls.nav.suspended, null, {timeout:30000});
  console.log('PASS the wreck shows a project and opens it');

  await hop();
  assert.equal(await status(), 'done');
  assert.equal(await page.evaluate(() => window.oceanEnding.shown), false, 'no ending card under water');
  await page.evaluate(() => window.oceanTour.surface());
  // The safety stop is offered on the way up (it may be skipped, as Esc does for a visitor).
  for (let i = 0; i < 90 && !(await page.evaluate(() => window.oceanEnding.shown)); i += 1) {
    await page.evaluate(() => document.querySelector('dialog[open] [data-close]')?.click());
    await page.keyboard.press('Escape'); await page.waitForTimeout(1000);
  }
  assert.equal(await page.evaluate(() => window.oceanEnding.shown), true, 'the ending card meets the diver at the surface');
  assert.equal(await page.locator('.surface-ending h2').textContent(), 'That’s the whole reef.');
  assert.equal(await page.locator('.surface-ending [data-ending="project"]').count(), 3);
  assert.match(await page.locator('.surface-ending [data-ending="email"]').getAttribute('href'), /^mailto:/);
  const box = await page.locator('.surface-ending').boundingBox(), hero = await page.locator('.hero .portfolio-actions').boundingBox();
  assert.ok(box.x >= hero.x + hero.width || box.y >= hero.y + hero.height, 'the card stands clear of the hero’s buttons');
  await page.locator('.surface-ending [data-ending="project"]').first().click();
  await page.waitForFunction(() => window.oceanArchive?.isOpen, null, {timeout:30000});
  assert.deepEqual(await page.evaluate(() => window.oceanArchive.current), {section:'projects', entry:work[0]});
  await page.evaluate(() => window.oceanArchive.close());
  await page.waitForFunction(() => !window.oceanArchive.isOpen, null, {timeout:30000});
  await page.locator('.surface-ending [data-ending="close"]').click();
  assert.equal(await page.evaluate(() => window.oceanEnding.shown), false, 'closed, it stays closed');
  assert.deepEqual(errors, [], 'no script errors');
  console.log('PASS the ending card offers the work and the ways to get in touch');
} catch (error) { failed = true; console.error('FAIL', error.message); }
finally { await browser.close(); server.close(); }
if (failed) process.exit(1);
console.log('Tour payoff checks passed.');
