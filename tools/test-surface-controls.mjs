// Start npm run dev first; optionally pass another source-server URL.
import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
const browser=await launchBrowser();
try {
  const page=await browser.newPage({viewport:{width:900,height:650}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.argv[2]||'http://127.0.0.1:4190/ocean-refined/');
  await page.waitForFunction(()=>window.oceanDiagnostics?.ready,null,{timeout:90000});
  await page.evaluate(()=>{oceanControls.time.lock();oceanControls.weather.set('clear');oceanControls.settings.pointerLock=false;});
  const lookUp=async()=>{
    await page.evaluate(()=>{
      const canvas=document.querySelector('#world');
      canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'mouse',clientX:850,clientY:400,bubbles:true}));
      window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowUp',bubbles:true}));
    });
    await page.waitForFunction(()=>oceanControls.nav.pitch>.1);
    await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowUp',bubbles:true})));
    await page.waitForFunction(()=>oceanControls.nav.pitch>.1);
  };
  console.log('Checking surface look and return');
  await lookUp();
  await page.locator('#explore').click();
  await page.waitForTimeout(2500);
  assert.ok(await page.evaluate(()=>!oceanControls.nav.exploring&&Math.abs(oceanControls.nav.pitch)<.001),'Back restores the original level view');
  await lookUp();
  await page.waitForTimeout(8000);
  assert.ok(await page.evaluate(()=>oceanControls.nav.exploring),'idle return waits ten seconds');
  await page.waitForTimeout(5000);
  assert.ok(await page.evaluate(()=>!oceanControls.nav.exploring&&Math.abs(oceanControls.nav.pitch)<.001),'idle sky exploration returns home');
  await page.evaluate(()=>document.querySelector('#dawn').click());
  await page.waitForFunction(()=>Math.abs(oceanControls.nav.yaw)<.001,null,{timeout:90000});
  console.log('Checking fixed pivot across evening turn');
  const positions=await page.evaluate(async()=>{
    const camera=oceanControls.getCamera(),diver=oceanControls.viewer.layers().diver;
    const start=camera.position.clone(),pivot=diver.position.clone();
    const projected=()=>diver.position.clone().project(camera);
    const screen=projected();
    let drift=0,screenDrift=0,maxStep=0,last=start.clone();
    document.querySelector('#dusk').click();
    const immediate=camera.position.distanceTo(start);
    for(let i=0;i<90;i++){
      await new Promise(r=>setTimeout(r,50));
      drift=Math.max(drift,Math.hypot(diver.position.x-pivot.x,diver.position.z-pivot.z));
      const p=projected();screenDrift=Math.max(screenDrift,Math.abs(p.x-screen.x));
      maxStep=Math.max(maxStep,camera.position.distanceTo(last));last.copy(camera.position);
    }
    return {immediate,drift,screenDrift,maxStep,start:start.toArray()};
  });
  assert.ok(positions.immediate<.01,'preset does not snap the camera');
  await page.waitForFunction(()=>Math.abs(oceanControls.nav.yaw-Math.PI)<.001,null,{timeout:90000});
  const travel=await page.evaluate(start=>oceanControls.getCamera().position.distanceTo({x:start[0],y:start[1],z:start[2]}),positions.start);
  assert.ok(travel>10,'evening turns to the opposite heading');
  assert.ok(positions.drift<.001,'diver stays at the same horizontal world position throughout the turn');
  assert.ok(positions.screenDrift<.025,`diver stays in the same screen position (${positions.screenDrift})`);
  assert.ok(positions.maxStep<2,'camera rotates smoothly around its fixed pivot');
  assert.deepEqual(errors,[],'surface interactions have no script exceptions');
  console.log('Surface Back, ten-second idle return, and fixed-pivot dusk rotation passed');
} finally {await browser.close();}
