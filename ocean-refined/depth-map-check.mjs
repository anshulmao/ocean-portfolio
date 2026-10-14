import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:4190/ocean-refined/');await page.waitForFunction(()=>oceanDiagnostics?.ready&&window.oceanExpedition,null,{timeout:120000});
 assert.equal(await page.locator('#predive').count(),0);
 await page.evaluate(()=>{dispatchEvent(new Event('blur'));oceanControls.world.finish();oceanControls.startDive();oceanControls.step(8);});
 const readings=[];
 for(const raw of [30,60,7.5]){
 await page.evaluate(raw=>{oceanControls.place([0,-raw,-90]);oceanControls.step(1);},raw);await page.waitForTimeout(1000);
 const r=await page.evaluate(()=>({raw:oceanDiagnostics.depth,display:oceanDiagnostics.displayDepth,computer:oceanDiagnostics.diveComputer.depth,footer:document.querySelector('#depth-value').textContent,source:document.querySelector('#reef-bathymetry').dataset.source}));
 assert.ok(Math.abs(r.display-Math.min(40,r.raw*2/3))<.02);assert.ok(Math.abs(r.computer-r.display)<.2);readings.push(r);
 }
 await page.evaluate(()=>oceanExpedition.openStop());assert.equal(await page.evaluate(()=>oceanExpedition.holding),true);await page.keyboard.press('Escape');
 await page.evaluate(()=>oceanPlan.open());assert.equal(await page.locator('.plan-key').textContent().then(t=>t.includes('60 m')),false);
 await page.screenshot({path:'depth-map-qa.png'});
 await page.goto('http://127.0.0.1:4190/ocean-refined/ui-gallery.html');await page.waitForSelector('#ui-component');await page.selectOption('#ui-component','map');await page.selectOption('#ui-component','computer');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,readings,errors}));
}finally{await browser.close();}
