import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4210/ocean-refined/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.oceanDiagnostics?.ready,null,{timeout:120000});
 await page.evaluate(()=>{window.oceanControls.startDive();window.oceanControls.step?.(12);});
 await page.waitForFunction(()=>document.body.dataset.submerged==='true',null,{timeout:45000});
 await page.waitForFunction(()=>window.oceanDiagnostics.landmarksSettled,null,{timeout:120000});
 await page.evaluate(()=>window.oceanControls.step(8));
 await page.waitForFunction(()=>!window.oceanDiagnostics.transition,null,{timeout:45000});
 for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]){
  await page.setViewportSize({width,height});
  const boxes=await page.evaluate(()=>Object.fromEntries(['#clear-ui-toggle','#dive-computer-toggle','.depth','.reef-map'].map(s=>{const b=document.querySelector(s).getBoundingClientRect();return[s,{x:b.x,y:b.y,w:b.width,h:b.height}]})));
  const a=boxes['#clear-ui-toggle'],b=boxes['#dive-computer-toggle'];
  assert.ok(a.y>=b.y+b.h || a.x>=b.x+b.w,`${name} clear overlaps computer`);
  
  await page.locator('#world').focus(); await page.keyboard.press('u');  assert.equal(await page.locator('.reef-map').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  await page.keyboard.press('c'); await page.waitForFunction(()=>document.body.dataset.computerOpen==='true',null,{timeout:5000});
  await page.keyboard.press('c'); await page.keyboard.press('u');
  await page.screenshot({path:`${process.env.TEMP}/ocean-controls-${name}.png`});
  console.log(name,JSON.stringify(boxes));
 }
 console.log('Page errors:',JSON.stringify(errors));assert.equal(errors.length,0);
}finally{await browser.close();}
