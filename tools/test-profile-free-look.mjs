// Run npm run dev first. Verify the real diver click and Escape flow at desktop width.
import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
const browser=await launchBrowser();
try {
  const page=await browser.newPage({viewport:{width:1240,height:762}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.argv[2]||'http://127.0.0.1:4190/ocean-refined/');
  await page.waitForFunction(()=>window.oceanDiagnostics?.ready,null,{timeout:90000});
  await page.evaluate(()=>{
    oceanControls.settings.pointerLock=false;
    oceanControls.time.lock();oceanControls.recapture();
  });
  await page.waitForFunction(()=>document.body.dataset.exploring==='true');
  // A real click on the diver while drag-to-look is active, without pointer lock.
  const point=await page.evaluate(()=>oceanProfile.screenPoint(.9));
  await page.mouse.click(...point);
  await page.locator('#diver-profile').waitFor({state:'visible'});
  assert.ok(await page.locator('.hero').isHidden(),'profile hides the hero on desktop');
  assert.equal(await page.evaluate(()=>document.body.dataset.exploring),'true','opening profile retains free look');
  await page.keyboard.press('Escape');
  await page.locator('#diver-profile').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.body.dataset.exploring),'true','first Escape returns to free look');
  assert.ok(await page.locator('.surface-copy').isHidden(),'first Escape keeps hero copy hidden');
  await page.waitForFunction(()=>oceanControls.nav.exploring);
  const yaw=await page.evaluate(()=>oceanControls.nav.yaw);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(start=>Math.abs(oceanControls.nav.yaw-start)>.05,yaw);
  await page.keyboard.up('ArrowRight');
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',repeat:true,bubbles:true})));
  assert.equal(await page.evaluate(()=>document.body.dataset.exploring),'true','holding Escape cannot skip free look');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.body.dataset.exploring==='false');
  assert.ok(await page.locator('.surface-copy').isVisible(),'second Escape restores the hero');
  assert.ok(await page.locator('#settings-menu').isHidden(),'Escape does not open settings');
  // Pointer-locked free look follows the same two Escape steps. Opening the card
  // releases the lock; Escape must not request another lock without a mouse gesture.
  await page.evaluate(()=>{oceanControls.settings.pointerLock=true;});
  await page.mouse.click(40,700);
  await page.waitForFunction(()=>document.pointerLockElement===document.querySelector('#world'));
  await page.evaluate(()=>oceanProfile.open());
  await page.locator('#diver-profile').waitFor({state:'visible'});
  assert.ok(await page.locator('.hero').isHidden());
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!oceanProfile.isOpen&&oceanControls.nav.exploring);
  assert.equal(await page.evaluate(()=>document.pointerLockElement),null,'Escape resumes without requesting pointer lock');
  assert.ok(await page.locator('.surface-copy').isHidden());
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.body.dataset.exploring==='false');
  assert.ok(await page.locator('.surface-copy').isVisible());
  assert.deepEqual(errors,[]);
  console.log('Diver click from free look: profile only → Escape to free look → Escape to hero passed');
} finally {await browser.close();}
