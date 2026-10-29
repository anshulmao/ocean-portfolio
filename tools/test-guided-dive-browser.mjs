// Complete guided dive against the shipped world, loaded models and real UI.
// npm run build && npm run test:guided:browser
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  let file = path.join(root, 'dist', decodeURIComponent(new URL(req.url, 'http://local').pathname));
  try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html'); res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchBrowser({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const errors = [], report = {};
const base = `http://127.0.0.1:${server.address().port}/`;
const snapshot = page => page.evaluate(() => ({ ...window.oceanDiagnostics.tour, mode: window.oceanControls.getMode(), returnPhase: window.oceanControls.nav.returnPhase, position: window.oceanDiagnostics.playerPosition, yaw: window.oceanControls.nav.yaw }));
const step = (page, seconds = 1) => page.evaluate(seconds => window.oceanControls.step(seconds, 1 / 30), seconds);
async function until(page, predicate, seconds = 150) {
  for (let i = 0; i < seconds; i++) {
    const state = await snapshot(page);
    assert.equal(state.routeIssue, false, `route stalled: ${JSON.stringify(state)}`);
    if (predicate(state)) return state;
    // Asset preparation is asynchronous wall time; simulated navigation time
    // must not run out while shaders/models are still being prepared.
    if (state.status === 'starting') await page.waitForFunction(() => window.oceanDiagnostics.landmarksSettled && window.oceanControls.world.ready, null, { timeout: 90000 });
    await step(page);
  }
  throw Error(`Did not reach expected state: ${JSON.stringify(await snapshot(page))}`);
}
async function open(options) {
  const page = await browser.newPage(options);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base, { timeout: 60000 });
  await page.waitForFunction(() => window.oceanDiagnostics?.ready && window.oceanTour, null, { timeout: 90000 });
  await page.evaluate(() => { window.oceanControls.time.lock(true); window.oceanControls.world.finish(); });
  return page;
}
try {
  const page = await open({ viewport: { width: 1440, height: 1000 } });
  await page.locator('#portfolio-options > summary').click();
  await page.locator('#guided-dive').click();
  assert.equal((await snapshot(page)).status, 'entering');
  assert.equal(await page.locator('.hero').evaluate(el => getComputedStyle(el).visibility), 'hidden');
  await until(page, state => state.status === 'dwell' && state.key === 'welcome');
  assert.equal(await page.evaluate(() => window.oceanDiagnostics.cameraMode), 'first');
  await step(page, 15);
  assert.equal((await snapshot(page)).key, 'welcome', 'welcome waits for Continue');
  await page.screenshot({ path: path.join(root, 'ocean-refined/qa/captures/guided-welcome-qa.png') });
  await page.waitForFunction(() => window.oceanControls.creatures?.diagnostics.ready && window.oceanControls.creatures.root.visible, null, { timeout: 60000 });
  await page.evaluate(() => { const api = window.oceanControls; api.creatures.debug.spawn('whale-shark', api.getPlayerPosition()); api.creatures.debug.seek('whale-shark', .5); });
  await step(page, .5);
  assert.equal(await page.locator('.tour-wildlife').isVisible(), true);
  assert.match(await page.locator('.tour-wildlife-name').textContent(), /Whale shark/);
  const bearingBefore = await page.locator('.tour-wildlife').getAttribute('style');
  await page.keyboard.down('ArrowRight'); await step(page, 1); await page.keyboard.up('ArrowRight');
  assert.notEqual(await page.locator('.tour-wildlife').getAttribute('style'), bearingBefore);
  await page.screenshot({ path: path.join(root, 'ocean-refined/qa/captures/guided-wildlife-qa.png') });
  await page.evaluate(() => window.oceanControls.creatures.debug.seek('whale-shark', .999));
  await step(page, 2);
  assert.equal(await page.locator('.tour-wildlife').isVisible(), false);
  report.wildlife = 'real encounter cue tracks looking and disappears when the animal leaves';
  await page.keyboard.press('n');
  // Free look in the live controller leaves the destination and guidance intact.
  const before = await snapshot(page);
  await page.keyboard.down('ArrowLeft'); await step(page, 1); await page.keyboard.up('ArrowLeft');
  const after = await snapshot(page);
  assert.equal(after.status, 'travel'); assert.ok(Math.abs(after.yaw - before.yaw) > .2);
  await page.keyboard.press('p'); await step(page, 2);
  const held = (await snapshot(page)).position; await step(page, 2);
  const still = (await snapshot(page)).position;
  assert.ok(held.every((v, i) => Math.abs(v - still[i]) < .15));
  assert.equal((await snapshot(page)).paused, true);
  await page.keyboard.press('p');
  await page.keyboard.down('w'); await step(page, .1); await page.keyboard.up('w');
  assert.equal((await snapshot(page)).status, 'free');
  await page.keyboard.press('g');
  assert.equal((await snapshot(page)).key, 'about');
  await until(page, state => state.status === 'dwell' && state.key === 'about');
  assert.equal(await page.evaluate(() => window.oceanArchive.current?.section), 'glance');
  await step(page, 10); assert.equal((await snapshot(page)).key, 'about');
  await page.screenshot({ path: path.join(root, 'ocean-refined/qa/captures/guided-about-qa.png') });
  await page.locator('.tour-archive-continue').click();
  report.stages = [];
  for (const key of ['cathedral', 'bait-ball', 'experience', 'deep', 'projects', 'overview']) {
    const state = await until(page, state => state.key === key && ['dwell', 'done'].includes(state.status));
    report.stages.push({ key, position: state.position, detours: state.detours });
    if (key === 'experience' || key === 'projects') {
      await page.locator('[data-tour="read"]').click();
      assert.equal(await page.evaluate(() => window.oceanArchive.current?.section), key);
      await page.keyboard.press('n');
    } else if (key !== 'overview') await page.keyboard.press('n');
  }
  await page.screenshot({ path: path.join(root, 'ocean-refined/qa/captures/guided-overview-qa.png') });
  assert.equal((await snapshot(page)).status, 'done');
  report.swimSeconds = (await snapshot(page)).swimSeconds;
  await page.locator('[data-tour="surface"]').click();
  for (let i = 0; i < 150; i++) {
    if (await page.evaluate(() => window.oceanControls.nav.returnPhase === 'offer')) break;
    await step(page, .5);
  }
  assert.equal(await page.evaluate(() => window.oceanControls.nav.returnPhase), 'offer');
  await page.keyboard.press('Escape');
  await until(page, state => state.mode === 'surface');
  report.surfaceWithoutStop = true;
  await page.close();

  const mobile = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await mobile.locator('#portfolio-options > summary').tap();
  await mobile.locator('#guided-dive').tap();
  await until(mobile, state => state.status === 'dwell' && state.key === 'welcome');
  assert.match(await mobile.locator('.tour-lines').textContent(), /Drag the water/);
  await mobile.locator('[data-tour="next"]').tap();
  await until(mobile, state => state.key === 'about' && state.status === 'dwell');
  assert.equal(await mobile.evaluate(() => window.oceanArchive.isOpen), true);
  await mobile.locator('.tour-archive-continue').tap();
  await until(mobile, state => state.key === 'cathedral' && state.status === 'dwell');
  await mobile.locator('[data-tour="pause"]').tap(); await step(mobile, 8);
  assert.equal((await snapshot(mobile)).key, 'cathedral');
  await mobile.screenshot({ path: path.join(root, 'ocean-refined/qa/captures/guided-mobile-qa.png') });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  // Touch drag changes the view during a held scenic moment without leaving it.
  const touchBefore = await snapshot(mobile);
  await mobile.locator('#world').dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: 80, clientY: 200 });
  await mobile.locator('#world').dispatchEvent('pointermove', { pointerType: 'touch', pointerId: 7, clientX: 300, clientY: 220 });
  await mobile.locator('#world').dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7 });
  await step(mobile);
  const touchAfter = await snapshot(mobile);
  assert.equal(touchAfter.status, 'dwell'); assert.ok(Math.abs(touchAfter.yaw - touchBefore.yaw) > .1);
  await mobile.locator('[data-tour="exit"]').tap();
  assert.equal((await snapshot(mobile)).status, 'off');
  // The other ending leaves the visitor at the overview; surfacing later still
  // offers the same optional stop, whose clock can complete without feedback.
  await mobile.evaluate(() => window.oceanTour.start());
  await until(mobile, state => state.key === 'welcome' && state.status === 'dwell');
  for (let i = 0; i < 30 && (await snapshot(mobile)).status !== 'done'; i++) {
    await mobile.evaluate(() => { window.oceanArchive.close(); window.oceanTour.next(); });
    await step(mobile, .6);
  }
  assert.equal((await snapshot(mobile)).status, 'done');
  await mobile.locator('[data-tour="explore"]').tap();
  assert.equal((await snapshot(mobile)).status, 'off');
  assert.equal((await snapshot(mobile)).mode, 'diver');
  await mobile.evaluate(() => window.oceanControls.surface());
  await until(mobile, state => state.returnPhase === 'offer');
  await mobile.locator('.expedition-tools [data-stop]').tap();
  assert.equal(await mobile.evaluate(() => window.oceanControls.nav.returnPhase), 'stop');
  await step(mobile, 20);
  assert.equal(await mobile.evaluate(() => window.oceanControls.nav.returnPhase), 'stop');
  await step(mobile, 28);
  await until(mobile, state => state.mode === 'surface');
  report.completedSafetyStop = true;
  report.mobile = 'touch look, pause, reading continuation, exit and reduced motion passed';
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(root, 'ocean-refined/qa/captures/guided-dive-qa.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.log('Completed checks:', JSON.stringify(report));
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: path.join(root, 'ocean-refined/qa/captures/guided-failure-qa.png') }).catch(() => {});
    console.log('Failure state:', await snapshot(page).catch(() => null), errors);
  }
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
