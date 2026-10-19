import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';

const browser = await chromium.launch({channel:'chrome',headless:true});
const errors = [];
try {
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.OCEAN_TEST_URL || 'http://127.0.0.1:4210/dist/',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>oceanDiagnostics?.ready && window.oceanJourney,null,{timeout:120000});
  const toggle = page.locator('.dive-summary-toggle');
  const summary = page.locator('#dive-summary');
  assert.equal(await toggle.isVisible(),false,'No summary before the first dive');
  await page.evaluate(()=>{oceanControls.startDive({capture:false});oceanControls.step(12);});
  await page.waitForFunction(()=>oceanDiagnostics.submerged && !oceanControls.getTransition(),null,{timeout:60000});
  await page.evaluate(()=>{oceanJourney.tick(5);oceanControls.surface({instant:true});oceanJourney.tick(.1);});
  await toggle.waitFor({state:'visible'});
  assert.equal(await toggle.textContent(),'Show dive summary');
  assert.equal(await summary.getAttribute('data-show'),'false','Surfacing never auto-opens the card');
  assert.equal(await summary.evaluate(node=>node.inert),true);
  for (const [name,width,height] of [['desktop',1440,900],['phone',390,844]]) {
    await page.setViewportSize({width,height});
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    assert.equal(await summary.evaluate(node=>node.inert),false);
    assert.match(await summary.locator('.sum-time').innerText(),/^\d\d:\d\d$/);
    const buttonBox = await toggle.boundingBox(), cardBox = await summary.boundingBox();
    assert.ok(buttonBox.x>=0 && buttonBox.x+buttonBox.width<=width,'Button stays inside viewport');
    assert.ok(cardBox.x>=0 && cardBox.x+cardBox.width<=width,'Card stays inside viewport');
    assert.ok(cardBox.y>=buttonBox.y+buttonBox.height,'Card clears its button');
    await page.screenshot({path:path.join(process.env.TEMP,`ocean-summary-${name}.png`),animations:'disabled'});
    await summary.locator('.summary-close').click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    assert.equal(await toggle.evaluate(node=>node===document.activeElement),true);
    await toggle.press('Enter');
    await page.keyboard.press('Escape');
    assert.equal(await summary.getAttribute('data-show'),'false');
    await page.locator('#menu-toggle').click();
    assert.equal(await toggle.isVisible(),false,'Hidden behind settings');
    await page.locator('.settings-close').click();
    assert.equal(await toggle.isVisible(),true,'Returns when settings close');
  }
  await page.evaluate(()=>{oceanControls.startDive({capture:false});oceanControls.step(12);});
  await page.waitForFunction(()=>oceanDiagnostics.submerged,null,{timeout:60000});
  assert.equal(await toggle.isVisible(),false,'Hidden on the next dive');
  assert.equal(await summary.getAttribute('data-show'),'false');
  assert.deepEqual(errors,[]);
  console.log('PASS: actual dive/surface lifecycle; collapsed summary; desktop/phone disclosure, keyboard, focus, settings, and next-dive cleanup.');
} finally { await browser.close(); }
