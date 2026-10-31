import assert from 'node:assert/strict';
import path from 'node:path';
import {launchBrowser} from './browser.mjs';

// The dive summary end to end: a real dive to the Anchor with a photo, back to the surface, the button beside Guided dive,
// the log page (numbers, profile, chart, postcard, field guide), sharing the photo with a note, keyboard and focus,
// desktop and phone, and the button gone on the next dive. The photo intake is answered here; nothing is sent.
const browser = await launchBrowser({headless: true});
const errors = [];
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.on('pageerror', error => errors.push(error.message));
  let shared = null;
  await page.route('**/functions/v1/portfolio-intake/photo', async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers: {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS'}});
    shared = {note: decodeURIComponent(request.headers()['x-photo-note'] || ''), type: request.headers()['content-type'], bytes: request.postDataBuffer()?.length || 0};
    return route.fulfill({status: 201, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify({id: 'x', saved: true})});
  });
  await page.goto(process.env.OCEAN_TEST_URL || 'http://127.0.0.1:4210/dist/', {waitUntil: 'domcontentloaded', timeout: 90000});
  await page.waitForFunction(() => oceanDiagnostics?.ready && window.oceanJourney && window.oceanDiveSummary && window.oceanPlan, null, {timeout: 120000});
  const open = page.locator('.ds-open'), dialog = page.locator('#dive-summary');
  assert.equal(await open.isVisible(), false, 'No summary before the first dive');

  // A dive to the Anchor, a photo there, and a while looking about so the reef fish count as seen.
  assert.ok(await page.evaluate(() => oceanPlan.startAt('about')), 'Dive starts at the Anchor');
  await page.waitForFunction(() => oceanDiagnostics.submerged, null, {timeout: 60000});
  await page.evaluate(() => oceanControls.step(40));
  await page.waitForFunction(() => !oceanControls.getTransition(), null, {timeout: 60000});
  // The animals load after the dive begins; once they are in, a few seconds at the Anchor show some of them.
  await page.waitForFunction(() => oceanControls.creatures?.diagnostics?.ready, null, {timeout: 90000});
  await page.waitForFunction(() => Object.keys(oceanDiveLog.current?.seen || {}).length > 0, null, {timeout: 45000});
  await page.evaluate(() => { oceanExpedition.takePhoto(); oceanControls.step(4); });
  await page.waitForFunction(() => oceanDiveLog.photos.length === 1, null, {timeout: 10000});
  const during = await page.evaluate(() => ({seen: Object.keys(oceanDiveLog.current.seen), sites: Object.keys(oceanDiveLog.current.sites), samples: oceanDiveLog.current.profile.length}));
  assert.ok(during.seen.length > 0, 'Animals in view are logged');
  assert.ok(during.sites.includes('about'), `The Anchor is logged as visited (${during.sites})`);
  assert.ok(during.samples > 10, 'The profile is sampled');
  await page.evaluate(() => { oceanControls.surface({instant: true}); oceanJourney.tick(.1); });
  await open.waitFor({state: 'visible'});
  assert.match(await open.innerText(), /Dive log\s*New/);
  assert.equal(await dialog.evaluate(node => node.open), false, 'Surfacing never opens the page by itself');

  for (const [name, width, height] of [['desktop', 1440, 900], ['phone', 390, 844]]) {
    await page.setViewportSize({width, height});
    const box = await open.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width, 'Button inside the viewport');
    assert.equal(await open.evaluate(node => node.previousElementSibling?.id), 'guided-dive', 'Button sits after Guided dive');
    await open.click();
    await page.waitForFunction(() => document.querySelector('#dive-summary').open);
    await page.waitForTimeout(800);
    const view = await dialog.evaluate(node => ({
      tiles: [...node.querySelectorAll('.ds-tiles dd')].map(dd => dd.textContent),
      profile: node.querySelector('.ds-profile .pf-line')?.getAttribute('d').length || 0,
      track: Boolean(node.querySelector('.ds-track')), chart: node.querySelector('.ds-map canvas').dataset.source || '',
      anchorTicked: node.querySelector('.ds-checks li')?.dataset.done, postcards: node.querySelectorAll('.postcard').length,
      species: node.querySelectorAll('.species').length, overflow: node.scrollWidth - node.clientWidth}));
    assert.match(view.tiles[0], /^\d\d:\d\d$/); assert.match(view.tiles[1], /m$/);
    assert.ok(view.profile > 100, 'Depth profile drawn'); assert.ok(view.track, 'Swim drawn on the chart');
    assert.ok(view.chart, 'Reef chart drawn'); assert.equal(view.anchorTicked, 'true', 'The Anchor is ticked off');
    assert.equal(view.postcards, 1, 'The photo is a postcard'); assert.equal(view.species, 26, 'The whole field guide');
    assert.equal(view.overflow, 0, 'No sideways scroll');
    const portrait = await page.evaluate(() => fetch(document.querySelector('.species img').src).then(r => r.blob()).then(createImageBitmap).then(image => image.width));
    assert.equal(portrait, 480, 'Portraits load');
    await page.screenshot({path: path.join(process.env.TEMP || '.', `ocean-dive-summary-${name}.png`)});
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#dive-summary').open, null, {timeout: 3000});
    assert.equal(await open.evaluate(node => node === document.activeElement), true, 'Focus returns to the button');
  }

  // Sharing the photo with a note: more than 40 words cannot be sent; a short note goes with the photo.
  await page.setViewportSize({width: 1440, height: 900});
  await open.click(); await page.waitForTimeout(600);
  await page.locator('.ds-share-open').click();
  await page.locator('#ds-note').fill(Array(41).fill('reef').join(' '));
  assert.equal(await page.locator('.ds-share [type="submit"]').isDisabled(), true, '41 words cannot be sent');
  await page.locator('#ds-note').fill('Loved the sea goldies at the Anchor — thank you!');
  await page.locator('.ds-share [type="submit"]').click();
  await page.waitForFunction(() => /Sent privately/.test(document.querySelector('.ds-status').textContent), null, {timeout: 10000});
  assert.equal(shared?.note, 'Loved the sea goldies at the Anchor — thank you!'); assert.equal(shared?.type, 'image/jpeg'); assert.ok(shared.bytes > 1000);
  assert.equal(await page.locator('.ds-share-open').isDisabled(), true, 'A shared photo is marked as shared');
  // The field guide filters.
  await page.locator('[data-filter="unseen"]').click();
  const unseen = await page.evaluate(() => [...document.querySelectorAll('.species')].filter(card => !card.hidden).every(card => card.dataset.seen === 'false'));
  assert.ok(unseen, 'Not yet shows only silhouettes');
  await page.locator('.ds-close').click();
  await page.waitForFunction(() => !document.querySelector('#dive-summary').open, null, {timeout: 3000});

  await page.evaluate(() => { oceanControls.startDive({capture: false}); oceanControls.step(12); });
  await page.waitForFunction(() => oceanDiagnostics.submerged, null, {timeout: 60000});
  assert.equal(await open.isVisible(), false, 'Hidden on the next dive');
  assert.deepEqual(errors, []);
  console.log(`PASS: real dive (seen: ${during.seen.join(', ') || 'none'}); button beside Guided dive; log page on desktop and phone; photo shared with a note; filters; focus; next-dive cleanup.`);
} finally { await browser.close(); }
