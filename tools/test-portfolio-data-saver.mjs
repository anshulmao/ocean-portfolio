import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={checks:[],errors:[]};
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const models=[];
  page.on('request',request=>{if(/\.glb(?:\?|$)/.test(request.url()))models.push(request.url());});
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.addInitScript(()=>Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:true}}));
  await page.goto(process.env.OCEAN_TEST_URL||'http://127.0.0.1:4210/ocean-refined/',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.oceanDiagnostics?.ready,null,{timeout:120000});
  assert.equal(await page.evaluate(()=>oceanDiagnostics.prewarm),'data-saver');
  await page.locator('#dive').focus();
  await page.locator('#dive').hover();
  await page.waitForFunction(()=>oceanControls.world.ready,null,{timeout:120000});
  assert.equal(models.length,0,'No GLB downloads before diving, including after focus/hover and local reef generation.');
  assert.equal(await page.evaluate(()=>Boolean(oceanDiagnostics.modelLoading)),false);
  report.checks.push('Data Saver prevents timer, keyboard-focus and hover-triggered model downloads.');

  // Content and shortcuts remain keyboard-operable without requiring a dive.
  await page.locator('#logbook-link').focus();await page.keyboard.press('Enter');
  await page.locator('#landmark-dialog[open]').waitFor();
  assert.equal(await page.evaluate(()=>oceanArchive.current.section),'projects');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('#landmark-dialog').open);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'logbook-link');
  // Every way in is on screen at once (no disclosure): the guided dive and the site map are a Tab away.
  assert.equal(await page.locator('#guided-dive').isVisible(),true);
  assert.equal(await page.locator('#plan-dive').isVisible(),true);
  await page.keyboard.press('Tab');
  assert.ok(['plan-dive'].includes(await page.evaluate(()=>document.activeElement.id)));
  report.checks.push('Keyboard opens Projects, Escape returns focus, and the guided dive and site map are visible beside it.');

  await page.locator('#dive').click();
  await page.waitForFunction(()=>oceanDiagnostics.landmarksReady&&oceanDiagnostics.submerged&&!oceanControls.getTransition(),null,{timeout:120000});
  assert.ok(models.length>0,'Explicit dive starts model loading.');
  report.checks.push('An explicit dive loads the essential models and reaches controllable underwater exploration.');
  assert.deepEqual(report.errors,[]);report.passed=true;
}finally{console.log(JSON.stringify(report,null,2));await browser.close();}
