// Start npm run dev first; optionally pass another source-server URL.
import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
const browser=await launchBrowser();
try {
  const page=await browser.newPage({viewport:{width:900,height:650}});
  await page.goto(process.argv[2]||'http://127.0.0.1:4190/ocean-refined/');
  await page.waitForFunction(()=>window.oceanDiagnostics?.ready,null,{timeout:90000});
  await page.evaluate(()=>{oceanControls.time.lock();oceanControls.weather.set('clear');oceanControls.settings.pointerLock=false;});
  const lookUp=async()=>{
    await page.evaluate(()=>{
      const canvas=document.querySelector('#world');
      canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'mouse',clientX:850,clientY:400,bubbles:true}));
      window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowUp',bubbles:true}));
    });
    await page.waitForTimeout(700);
    await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowUp',bubbles:true})));
    await page.waitForFunction(()=>oceanControls.nav.pitch>.1);
  };
  await lookUp();
  await page.locator('#explore').click();
  await page.waitForTimeout(2500);
  assert.ok(await page.evaluate(()=>!oceanControls.nav.exploring&&Math.abs(oceanControls.nav.pitch)<.001),'Back restores the original level view');
  await lookUp();
  await page.waitForTimeout(8000);
  assert.ok(await page.evaluate(()=>oceanControls.nav.exploring),'idle return waits ten seconds');
  await page.waitForTimeout(5000);
  assert.ok(await page.evaluate(()=>!oceanControls.nav.exploring&&Math.abs(oceanControls.nav.pitch)<.001),'idle sky exploration returns home');
  const positions=await page.evaluate(async()=>{
    const camera=oceanControls.getCamera(),start=camera.position.clone();
    document.querySelector('#dusk').click();
    const immediate=camera.position.distanceTo(start);
    await new Promise(r=>setTimeout(r,1000));const middle=camera.position.clone();
    await new Promise(r=>setTimeout(r,2000));
    return {immediate,half:middle.distanceTo(start),full:camera.position.distanceTo(start),radius:Math.hypot(middle.x,middle.z)};
  });
  assert.ok(positions.immediate<.01,'preset does not snap the camera');
  assert.ok(positions.half>1&&positions.full>positions.half,'preset progresses toward the opposite framing');
  assert.ok(positions.radius>8,'half turn stays outside the diver');
  console.log('Surface Back, ten-second idle return, and eased dusk orbit passed');
} finally {await browser.close();}
