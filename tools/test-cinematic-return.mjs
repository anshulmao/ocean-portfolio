import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {planSurfaceReturn} from '../ocean-refined/return-route.js';
const route=planSurfaceReturn([40,-50,-95],{floor:()=>-60,clear:()=>true});
assert.deepEqual(route.at(-1),[0,-5.5,-6]);
assert.ok(route[0][0]<40&&route[0][1]>-50,'The return rises and crosses from its first segment');
const midpoint=route[Math.floor(route.length/2)];
assert.ok(Math.abs(midpoint[1]-(-50+(44.5)*(40-midpoint[0])/40))>1,'The open-water route bows above the chord');
assert.deepEqual(planSurfaceReturn([0,-20,0],{floor:()=>-60,clear:()=>false}),[]);
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.OCEAN_URL||'http://127.0.0.1:4210/dist/')+'?motion=full');
 await page.waitForFunction(()=>oceanDiagnostics?.ready&&window.oceanExpedition);
 await page.evaluate(()=>{oceanControls.startDive({capture:false});oceanControls.step(12);});
 await page.waitForFunction(()=>oceanDiagnostics.landmarksReady&&!oceanControls.getTransition(),null,{timeout:120000});
 for(const [action,point] of [['escape',[40,-45,-90]],['timeout',[-35,-32,-55]],['complete',[20,-52,-72]],['decline',[0,-6,-6]]]){
  await page.evaluate(p=>{oceanControls.place(p);oceanControls.step(.2);},point);
  await page.locator('#menu-toggle').click();await page.locator('#settings-surface-now').click();
  assert.equal(await page.evaluate(()=>oceanControls.nav.returnPhase),'travel');
  const history=[];
  for(let t=0;t<120;t+=.5){
   const sample=await page.evaluate(()=>{oceanControls.step(.5);return {phase:oceanControls.nav.returnPhase,p:oceanControls.getPlayerPosition().toArray()};});
   history.push(sample.p);if(sample.phase==='offer')break;
  }
  assert.equal(await page.evaluate(()=>oceanControls.nav.returnPhase),'offer',action);
  assert.ok(await page.locator('[data-stop]').isVisible());
  const held=await page.evaluate(()=>oceanControls.getPlayerPosition().toArray());
  assert.ok(Math.hypot(held[0],held[2]+6)<.5);
  assert.ok(-held[1]*2/3>=3&&-held[1]*2/3<=5);
  if(action==='decline')await page.keyboard.press('Escape');
  else if(action==='timeout')await page.evaluate(()=>oceanControls.step(11));
  else{
   // The Settings button still owns keyboard focus: F must work without a canvas click.
   await page.keyboard.press('f');
   await page.waitForFunction(()=>oceanExpedition.holding&&oceanControls.nav.returnPhase==='stop');
   await page.evaluate(()=>oceanControls.step(2));
   assert.ok(await page.evaluate(()=>oceanDiagnostics.safetyStopBlend>.95));
   const after=await page.evaluate(()=>oceanControls.getPlayerPosition().toArray());
   assert.ok(Math.hypot(...after.map((v,i)=>v-held[i]))<.1,'The accepted stop holds depth');
   if(action==='escape')await page.keyboard.press('Escape');
   else await page.evaluate(()=>oceanControls.step(49));
   await page.waitForFunction(()=>!oceanExpedition.holding&&!document.querySelector('dialog[open]'));
  }
  await page.evaluate(()=>oceanControls.step(20));
  assert.equal(await page.evaluate(()=>oceanControls.getMode()),'surface',action+' must finish surfacing');
  console.log('PASS return:',action,'samples:',history.length);
  await page.evaluate(()=>{oceanControls.startDive({capture:false});oceanControls.step(12);});
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
