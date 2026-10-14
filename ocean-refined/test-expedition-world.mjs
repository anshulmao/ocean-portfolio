import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root=path.dirname(fileURLToPath(import.meta.url)),report={checks:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
page.on('pageerror',error=>report.errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:4190/ocean-refined/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.oceanDiagnostics?.ready&&window.oceanExpedition,null,{timeout:120000});
  await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));oceanControls.world.finish();oceanControls.startDive();oceanControls.step(8);});
  await page.waitForFunction(()=>oceanExpedition.locations[0].y!==0);
  await page.evaluate(()=>{oceanControls.place([0,-7.5,0]);oceanControls.step(2);});
  console.log(await page.evaluate(()=>({mode:oceanControls.getMode(),transition:oceanControls.getTransition(),depth:oceanDiagnostics.depth,nav:oceanControls.nav.mode,dialogs:[...document.querySelectorAll('dialog[open]')].map(x=>x.id),submerged:oceanDiagnostics.submerged,ui:oceanUi.ui,player:oceanControls.getPlayerPosition({copy(v){return {x:v.x,y:v.y,z:v.z}}})})));
  await page.evaluate(()=>oceanExpedition.openStop());
  assert.equal(await page.evaluate(()=>oceanExpedition.holding),true);
  const start=await page.evaluate(()=>oceanDiagnostics.playerPosition[1]);
  await page.evaluate(()=>oceanControls.step(5));
  const end=await page.evaluate(()=>oceanDiagnostics.playerPosition[1]);
  assert.ok(Math.abs(start-end)<.2,`hold depth drift ${start} → ${end}`);
  report.checks.push({name:'Free-swim F2 movement hold',depthBefore:start,depthAfter:end});
  await page.locator('[name=rating]').selectOption('4');
  await page.locator('[name=feedback]').fill('Full-world QA note.');
  const exported=page.waitForEvent('download');await page.locator('.expedition-dialog [type=submit]').click();
  const file=await exported,data=JSON.parse(await fs.readFile(await file.path(),'utf8'));
  assert.equal(data.contact,null);assert.equal(data.rating,4);report.checks.push({name:'Local-only field note JSON',contact:data.contact});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!oceanExpedition.holding);
  await page.evaluate(()=>{oceanControls.place([0,-7.5,0]);oceanControls.step(2);oceanControls.surface();oceanControls.step(.1);});
  assert.equal(await page.evaluate(()=>oceanControls.nav.mode),'transition');
  await page.evaluate(()=>oceanExpedition.openStop());
  assert.equal(await page.evaluate(()=>oceanExpedition.holding),true);
  const ascentBefore=await page.evaluate(()=>oceanDiagnostics.playerPosition[1]);
  await page.evaluate(()=>oceanControls.step(10));
  const ascentAfter=await page.evaluate(()=>oceanDiagnostics.playerPosition[1]);
  assert.ok(Math.abs(ascentBefore-ascentAfter)<.02);
  report.checks.push({name:'Automatic ascent F2 hold',depthBefore:ascentBefore,depthAfter:ascentAfter});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!oceanExpedition.holding);
  await page.evaluate(()=>oceanControls.step(20));
  assert.equal(await page.evaluate(()=>oceanControls.getMode()),'surface');report.checks.push({name:'Ascent resumes on close and surfaces'});
  await page.evaluate(()=>{oceanControls.startDive();oceanControls.step(8);if(oceanDiagnostics.cameraMode!=='first')oceanControls.toggleCamera();oceanControls.step(1);});
  const photo=page.waitForEvent('download');await page.evaluate(()=>oceanExpedition.takePhoto());
  const shot=await photo,png=await fs.readFile(await shot.path());
  assert.ok(png.length>10000);report.checks.push({name:'Actual world PNG photo',bytes:png.length,width:png.readUInt32BE(16),height:png.readUInt32BE(20)});
  await fs.writeFile(path.join(root,'expedition-photo-qa.png'),png);
  let collected=false;
  for(let id=0;id<10&&!collected;id++) {
    await page.evaluate(id=>{const item=oceanExpedition.locations[id];oceanControls.place([item.x,item.y+1.4,item.z]);oceanControls.step(1);},id);
    await page.waitForTimeout(400);await page.keyboard.press('f');
    collected=await page.evaluate(()=>oceanExpedition.score===100);
  }
  assert.equal(collected,true);report.checks.push({name:'Actual terrain artifact F pickup',inventory:await page.evaluate(()=>oceanExpedition.inventory)});
  assert.deepEqual(report.errors,[]);report.passed=true;
} catch(error){report.passed=false;report.failure=error.stack;throw error;}
finally{await fs.writeFile(path.join(root,'expedition-world-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
