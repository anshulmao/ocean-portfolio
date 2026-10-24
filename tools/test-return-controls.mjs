import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {planSurfaceReturn} from '../ocean-refined/return-route.js';
const route=planSurfaceReturn([40,-50,-95],{floor:()=>-12,clear:()=>true});
assert.ok(route.length>10);assert.deepEqual(route.at(-1),[0,-5.5,-6]);
assert.deepEqual(planSurfaceReturn([0,-20,0],{floor:()=>-10,clear:()=>false}),[]);
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4210/dist/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.oceanDiagnostics?.ready&&window.oceanExpedition,null,{timeout:120000});
 await page.evaluate(()=>{oceanControls.startDive({capture:false});oceanControls.step(12);});
 await page.waitForFunction(()=>oceanDiagnostics.submerged&&!oceanControls.getTransition(),null,{timeout:90000});
 await page.locator('#world').click({position:{x:700,y:450}});
 await page.keyboard.press(';');
 await page.waitForFunction(()=>!document.pointerLockElement&&!oceanControls.nav.exploring);
 await page.evaluate(()=>{oceanControls.place([45,-6,20]);oceanControls.step(.3);});
 await page.locator('[data-stop]').waitFor({state:'visible'});
 assert.ok(await page.evaluate(()=>oceanExpedition.offerRemaining)>0);
 await page.locator('#world').focus();await page.keyboard.press('f');
 await page.waitForFunction(()=>oceanExpedition.holding);
 assert.equal(await page.locator('.safety-countdown').isVisible(),true);
 await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!oceanExpedition.holding&&!document.querySelector('dialog[open]'));
 await page.evaluate(()=>{oceanControls.place([45,-12,20]);oceanControls.step(.3);oceanControls.place([45,-6,20]);oceanControls.step(.3);oceanUi.tick(11);});
 assert.equal(await page.locator('[data-stop]').isVisible(),false,'Offer expires');
 await page.keyboard.press('f');assert.equal(await page.evaluate(()=>oceanExpedition.holding),false,'Expired offer does not claim F');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:900});
  await page.locator('#menu-toggle').click();
  await page.locator('#settings-general').evaluate(n=>n.open=false);
  assert.equal(await page.locator('#settings-surface-now').isVisible(),true);
  await page.screenshot({path:process.env.TEMP+`/return-settings-${width}.png`,animations:'disabled'});
  await page.locator('.settings-close').click();
 }
 for(const point of [[40,-45,-90],[-35,-32,-55],[20,-52,-72],[0,-6,-6]]){
  await page.evaluate(p=>{oceanControls.place(p);oceanControls.step(.2);},point);
  const start=await page.evaluate(()=>oceanControls.getPlayerPosition().toArray());
  await page.locator('#menu-toggle').click();await page.locator('#settings-surface-now').click();
  assert.equal(await page.evaluate(()=>oceanControls.getMode()),'transition');
  assert.ok(await page.evaluate(()=>oceanControls.nav.returnRoute.length)>0);
  const first=await page.evaluate(()=>oceanControls.getPlayerPosition().toArray());
  assert.ok(Math.hypot(...first.map((v,i)=>v-start[i]))<2,'No teleport on return');
  await page.evaluate(()=>oceanControls.step(85));
  assert.equal(await page.evaluate(()=>oceanControls.getMode()),'surface',JSON.stringify(point));
  const end=await page.evaluate(()=>oceanControls.getPlayerPosition().toArray());
  assert.ok(Math.hypot(end[0],end[2]+6)<3,'Return reaches the upper reef before surfacing: '+JSON.stringify({point,start,end}));
  console.log('Guided return passed: '+point);
  if(point[0]!==0){await page.evaluate(()=>{oceanControls.startDive({capture:false});oceanControls.step(12);});}
 }
 assert.deepEqual(errors,[]);console.log('PASS: mouse release, timed F prompt, desktop/mobile menu and collision-aware surfacing.');
}finally{console.log({errors});await browser.close();}
