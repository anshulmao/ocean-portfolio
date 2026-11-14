// The guided dive's payoff, against the built site (run `npm run build` first):
//   - the welcome is the water, the depth and the guide's card: compass, chart and page buttons come in with the swim;
//   - the wreck's card shows the projects themselves, and opening the wreck opens the project it is showing;
//   - back at the surface the diver's card opens on its Last dive page, the dive log in small, which opens the full log.
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
    await page.evaluate(() => window.oceanTour.next()); await page.waitForFunction(() => window.oceanTour.status === 'travel', null, {timeout:150000});
    await page.evaluate(() => window.oceanTour.next()); await page.waitForFunction(() => ['dwell', 'done'].includes(window.oceanTour.status), null, {timeout:150000});
  };

  assert.ok(await page.evaluate(() => window.oceanTour.start()), 'the tour starts from the surface');
  await page.waitForFunction(() => window.oceanTour.status === 'intro', null, {timeout:90000});
  await page.waitForFunction(() => document.querySelector('.tour-card')?.dataset.show === 'true', null, {timeout:90000});
  for (const selector of ['.heading-indicator', '.reef-map', '#archive-toggle', '#clear-ui-toggle'])
    assert.equal(await visible(selector), false, `${selector} waits for the first swim`);
  assert.equal(await visible('.calm-depth'), true, 'the depth card is up in the welcome');
  assert.equal(await page.locator('.tour-pace').textContent(), '', 'the welcome does not repeat its Skip button in a line');
  console.log('PASS the welcome is the water, the depth and the guide');

  await page.evaluate(() => window.oceanTour.next());
  await page.waitForFunction(() => window.oceanTour.status === 'travel', null, {timeout:150000});
  assert.equal(await visible('.reef-map'), true, 'the chart comes in with the swim');
  // The dive's tools are one row: the computer, a photo and Clear screen. The Portfolio button is retired under water.
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.dive-tools > button')].map(button => button.id)), ['dive-computer-toggle', 'dive-photo', 'clear-ui-toggle']);
  assert.equal(await page.locator('#dive-photo').isVisible(), true, 'the photo button is on the row');
  assert.equal(await page.locator('#archive-toggle').isVisible(), false, 'no Portfolio button under water');
  await page.evaluate(() => window.oceanTour.next());
  await page.waitForFunction(() => window.oceanTour.status === 'dwell', null, {timeout:150000});
  await hop(); await hop();
  assert.equal(await page.evaluate(() => window.oceanDiagnostics.tour.key), 'projects');
  await page.waitForFunction(() => window.oceanSiteCard?.shown === 'projects' && document.querySelector('.site-card')?.dataset.show === 'true', null, {timeout:90000});
  // One Open it on screen: while the site's card is up, the tour's sheet does not offer it again.
  assert.equal(await page.locator('.tour-card [data-tour="read"]').isVisible(), false, 'the sheet leaves Open it to the site’s card');
  assert.equal(await page.locator('.site-card [data-site="read"]').isVisible(), true);
  const work = await page.evaluate(() => window.oceanSiteCard.work);
  assert.ok(work.length >= 3, 'the wreck has projects to show');
  // Tab turns to the next project while the view has the keyboard, Shift+Tab to the one before.
  await page.evaluate(() => document.activeElement?.blur?.());
  const before = await page.evaluate(() => window.oceanSiteCard.entryFor('projects'));
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => window.oceanSiteCard.entryFor('projects')), work[(work.indexOf(before) + 1) % work.length], 'Tab turns to the next project');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => window.oceanSiteCard.entryFor('projects')), before, 'Shift+Tab turns back');
  const chips = await page.evaluate(() => [...document.querySelectorAll('.site-card [data-work]')].map(chip => Math.round(chip.getBoundingClientRect().top)));
  assert.equal(new Set(chips).size, 1, 'the project chips sit on one line');
  // Picked by hand, as the card is drawn in the water and may be scaled: a click on the chip itself.
  await page.evaluate(() => document.querySelector('.site-card [data-work="2"]').click());
  assert.equal(await page.evaluate(() => window.oceanSiteCard.entryFor('projects')), work[2], 'a chip picks its project');
  assert.equal(await page.locator('.site-card [data-work="2"]').getAttribute('aria-pressed'), 'true');
  const title = await page.locator('.site-card-title').textContent();
  assert.notEqual(title, 'The Wreck', 'the card names a project, not only the site');
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.oceanArchive?.isOpen, null, {timeout:90000});
  assert.deepEqual(await page.evaluate(() => window.oceanArchive.current), {section:'projects', entry:work[2]}, 'F opens the project the card shows');
  await page.evaluate(() => window.oceanArchive.close());
  await page.waitForFunction(() => !window.oceanArchive.isOpen && !window.oceanControls.nav.suspended, null, {timeout:90000});
  // While the tour waits at the wreck her card stays up however wide the visitor swims round her: here 9.5 m beyond
  // her stern, outside the range the card otherwise keeps to.
  await page.evaluate(() => window.oceanControls.place([20, -22, -60], [19, -22.5, -39.5]));
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => window.oceanSiteCard.shown === 'projects' && document.querySelector('.site-card').dataset.show), 'true', 'the wreck’s card holds while the tour waits there');
  console.log('PASS the wreck shows a project and opens it');

  await hop();
  assert.equal(await status(), 'done');
  assert.equal(await page.evaluate(() => window.oceanEnding.shown), false, 'no ending card under water');
  await page.evaluate(() => window.oceanTour.surface());
  // The safety stop is offered on the way up (it may be skipped, as Esc does for a visitor).
  // Escape only while the stop is on offer or being made. Pressed on every pass it also landed just after the card had
  // opened, on a slow machine, and closed it (Escape closes the diver's card), and at the surface it opened Settings,
  // which the card waits behind.
  for (let i = 0; i < 90; i += 1) {
    const state = await page.evaluate(() => {
      if (window.oceanEnding.shown) return 'shown';
      document.querySelector('dialog[open] [data-close]')?.click();
      // An Escape that arrives after the stop has passed opens Settings, which holds the ascent: the next one closes it.
      // The card cannot open while Settings is, so that Escape never reaches the card.
      if (document.body.dataset.menu === 'open') return 'menu';
      return ['offer', 'stop'].includes(window.oceanControls.nav.returnPhase) ? 'stop' : 'wait';
    });
    if (state === 'shown') break;
    if (state === 'stop' || state === 'menu') await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  }
  assert.equal(await page.evaluate(() => window.oceanEnding.shown), true, 'the ending card meets the diver at the surface');
  assert.equal(await page.locator('.surface-ending h2').textContent(), 'That’s the whole reef.');
  assert.equal(await page.locator('.surface-ending-tiles div').count(), 4, 'time, depth, sites and species');
  assert.match(await page.locator('.surface-ending-profile .line').getAttribute('d'), /^M[\d.,L-]+$/, 'the depth profile is drawn');
  // It is a page of the diver's own card, not a card of its own: one card over the diver, with tabs between the two.
  assert.equal(await page.evaluate(() => window.oceanProfile.isOpen && window.oceanProfile.page), 'dive', 'it is the Last dive page of the diver’s card');
  assert.equal(await page.locator('#diver-profile .surface-ending').count(), 1);
  // It stands over the diver, not where the diver was while the view was still coming round to the surface.
  await page.waitForFunction(() => { const r = document.querySelector('#diver-profile').getBoundingClientRect(), [x] = window.oceanProfile.screenPoint(1), left = Math.min(Math.max(12, x - r.width / 2), innerWidth - r.width - 12); return Math.abs(r.left - left) < 30; }, null, {timeout:90000});
  // The light or dark switch on the card: a press anywhere on it turns the interface over, and again turns it back.
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme), themeBefore = await theme(), switchBox = await page.locator('.diver-profile-theme').boundingBox();
  await page.mouse.click(switchBox.x + 4, switchBox.y + switchBox.height / 2);
  assert.notEqual(await theme(), themeBefore, 'a press on one end of the switch changes the theme');
  assert.equal(await page.locator('.diver-profile-theme').getAttribute('aria-checked'), String(await theme() === 'night'));
  await page.mouse.click(switchBox.x + 4, switchBox.y + switchBox.height / 2);
  assert.equal(await theme(), themeBefore, 'a press on the same end changes it back');
  assert.equal(await page.evaluate(() => window.oceanProfile.isOpen), true, 'the card stays open through it');
  await page.locator('#diver-profile [role="tab"][data-page="about"]').click();
  assert.equal(await page.locator('#diver-profile .diver-profile-head').isVisible(), true, 'the tabs turn to About me');
  assert.equal(await page.locator('#diver-profile .surface-ending').isVisible(), false);
  await page.locator('#diver-profile [role="tab"][data-page="dive"]').click();
  assert.equal(await page.locator('#diver-profile .surface-ending').isVisible(), true, 'and back to Last dive');
  await page.locator('.surface-ending [data-ending="log"]').click();
  await page.waitForFunction(() => window.oceanDiveSummary?.isOpen, null, {timeout:90000});
  assert.equal(await page.evaluate(() => window.oceanEnding.shown), false, 'the full log takes over from the card');
  await page.evaluate(() => window.oceanDiveSummary.close(true));
  await page.waitForFunction(() => !window.oceanDiveSummary.isOpen, null, {timeout:90000});
  assert.equal(await visible('.portfolio-actions .ds-open'), true, 'afterwards the Dive log button is the way back');
  assert.deepEqual(errors, [], 'no script errors');
  console.log('PASS the dive log comes up in small at the surface and opens the full log');
} catch (error) { failed = true; console.error('FAIL', error.message); }
finally { await browser.close(); server.close(); }
if (failed) process.exit(1);
console.log('Tour payoff checks passed.');
