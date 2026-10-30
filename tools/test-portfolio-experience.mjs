import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const base=process.env.OCEAN_TEST_URL||'http://127.0.0.1:4210/dist/';
let browser=await chromium.launch({channel:'chrome',headless:true});
const report={checks:[],errors:[],reading:[]};
const shot=name=>path.join(process.env.TEMP||'/tmp',`ocean-portfolio-${name}.png`);
try {
  console.log('Checking no-JavaScript reading routes…');
  // Reading and all six project stories work with JavaScript disabled and no GPU.
  const reading=await browser.newContext({javaScriptEnabled:false,viewport:{width:1440,height:900}});
  const page=await reading.newPage();
  page.on('pageerror',error=>report.errors.push(error.message));
  for(const [width,height] of [[1440,900],[390,844]]) {
    await page.setViewportSize({width,height});
    await page.goto(new URL('profile.html',base).href,{waitUntil:'load'});
    assert.match(await page.locator('h1').innerText(),/AI into products/);
    assert.equal(await page.locator('.reading-project-card').count(),6);
    assert.equal(await page.locator('script:not([type="application/ld+json"])').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:shot(`reading-${width}`)});
    for(const id of ['rae','reengage','wattmana','sage','openclaw','ocean-world']) {
      const started=Date.now();await page.goto(new URL(`projects/${id}/`,base).href,{waitUntil:'load'});
      assert.equal(await page.locator('h1').count(),1);
      assert.equal(await page.locator('.reading-story-section').count(),6);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${id}: ${width}px overflow`);
      assert.deepEqual(await page.locator('img').evaluateAll(images=>images.filter(image=>!image.complete||!image.naturalWidth).map(image=>image.src)),[]);
      assert.equal(await page.locator(`a[href="../../index.html#finds/${id}"]`).count(),1);
      const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>entry.name));
      assert.equal(resources.some(url=>/\.glb|three\.core|world\.js/.test(url)),false);
      report.reading.push({id,width,loadWallMs:Date.now()-started});
      if(id==='wattmana')await page.screenshot({path:shot(`project-${width}`)});
    }
  }
  report.checks.push('Seven static reading routes work without JavaScript; six shared stories, responsive layout, images and ocean deep links; zero world/model requests.');
  await reading.close();
  await browser.close();browser=await chromium.launch({channel:'chrome',headless:true});

  console.log('Checking world entry, archive and guided dive…');
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const world=await context.newPage();world.on('pageerror',error=>report.errors.push(error.message));
  await world.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
  await world.locator('#logbook-link').waitFor({state:'visible'});
  await world.locator('#logbook-link').evaluate(node=>node.addEventListener('click',()=>{window.__portfolioClickAt=performance.now();},{once:true,capture:true}));
  const opening=Date.now();await world.locator('#logbook-link').click();
  await world.locator('#landmark-dialog[open]').waitFor();report.workOpenWallMs=Date.now()-opening;report.workOpenFromEventMs=await world.evaluate(()=>performance.now()-window.__portfolioClickAt);
  assert.equal(await world.evaluate(()=>oceanArchive.current.section),'projects');
  assert.equal(await world.locator('.arc-find').count(),6);
  await world.evaluate(()=>oceanArchive.open('projects','rae'));
  await world.locator('#archive-entry-title').filter({hasText:'Rae'}).waitFor();
  assert.equal(await world.locator('.arc-diagram').count()>0,true);
  assert.equal(await world.locator('#archive-page').innerText().then(text=>/No image/.test(text)),false);
  await world.screenshot({path:shot('archive-desktop'),animations:'disabled'});
  for(const id of ['wattmana','sage','openclaw','ocean-world']) {
    await world.evaluate(id=>oceanArchive.open('projects',id),id);
    assert.equal(await world.locator('.arc-role').count()>0,true);
    assert.equal(await world.evaluate(()=>oceanArchive.current.entry),id);
  }
  await world.setViewportSize({width:390,height:844});
  await world.evaluate(()=>oceanArchive.open('projects','wattmana'));
  assert.equal(await world.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await world.screenshot({path:shot('archive-phone'),animations:'disabled'});
  await world.locator('#landmark-dialog .dialog-close').click();
  await world.setViewportSize({width:1440,height:900});
  await world.waitForFunction(()=>window.oceanDiagnostics?.ready&&oceanDiagnostics.landmarksReady,null,{timeout:120000});
  await world.screenshot({path:shot('surface'),animations:'disabled'});
  await world.locator('#portfolio-options summary').click();
  await world.locator('#guided-dive').click();
  await world.waitForFunction(()=>oceanDiagnostics.submerged&&!oceanControls.getTransition(),null,{timeout:120000});
  // (In economy detail the optional packs wait for a dive: see world.js.)
  await world.waitForFunction(()=>oceanDiagnostics.startup.optionalModelsAt>0,null,{timeout:120000});
  const startup=await world.evaluate(()=>({...oceanDiagnostics.startup}));
  assert.ok(startup.optionalModelsAt>=startup.landmarksReadyAt,'Landmarks prepare before optional pack processing.');
  await world.waitForFunction(()=>oceanTour.status==='intro',null,{timeout:30000});
  await world.locator('[data-tour="next"]').click();
  await world.waitForFunction(()=>['travel','dwell'].includes(oceanTour.status),null,{timeout:30000});
  if(await world.evaluate(()=>oceanTour.status==='travel'))await world.locator('[data-tour="next"]').click();
  await world.waitForFunction(()=>oceanTour.status==='dwell',null,{timeout:30000});
  const stop=await world.evaluate(()=>oceanDiagnostics.tour.stop);
  await world.evaluate(()=>oceanUi.tick(90));
  assert.equal(await world.evaluate(()=>oceanTour.status),'dwell');
  assert.equal(await world.evaluate(()=>oceanDiagnostics.tour.stop),stop);
  await world.locator('[data-tour="read"]').click();
  await world.locator('#landmark-dialog[open]').waitFor();
  // On the tour the anchor opens At a glance, with the tour's welcome on it.
  assert.equal(await world.evaluate(()=>oceanArchive.current.section),'glance');
  assert.ok(await world.locator('#landmark-dialog .arc-welcome').isVisible(),'the tour welcome shows on At a glance');
  await world.locator('#landmark-dialog .dialog-close').click();
  await world.locator('[data-tour="next"]').click();
  await world.waitForFunction(()=>['travel','dwell'].includes(oceanTour.status));
  await world.keyboard.press('w');
  await world.waitForFunction(()=>oceanTour.status==='free',null,{timeout:5000});
  await world.evaluate(()=>oceanTour.stop());
  report.metrics=await world.evaluate(()=>oceanExperienceMetrics.snapshot());
  report.startup=startup;
  report.checks.push('Immediate work entry; all case studies and mobile archive; essential-first prewarm; guided route opens with a welcome, opens At a glance at the anchor, waits for reading and yields on movement.');
  await context.close();
  await browser.close();browser=await chromium.launch({channel:'chrome',headless:true});
  const fallback=await browser.newContext({viewport:{width:390,height:844}});
  const linked=await fallback.newPage();
  await linked.route('**/world.js',route=>route.abort());
  await linked.goto(new URL('index.html#finds/rae',base).href,{waitUntil:'domcontentloaded'});
  await linked.locator('#landmark-dialog[open]').waitFor({timeout:5000});
  assert.equal(await linked.locator('#archive-entry-title').innerText(),'Rae');
  assert.equal(await linked.evaluate(()=>Boolean(window.oceanDiagnostics?.ready)),false);
  assert.equal(await linked.locator('.portfolio-links a[href$="profile.html"]').count(),1);
  report.checks.push('A shared Rae deep link opens with world.js blocked; reading/PDF/contact remain independent of WebGL.');
  await fallback.close();

  assert.deepEqual(report.errors,[]);
  report.passed=true;
} catch(error) {report.failure=error.message;throw error;} finally {
  console.log(JSON.stringify(report,null,2));
  await fs.writeFile(new URL('../release/portfolio-three-stage-qa.json',import.meta.url),JSON.stringify(report,null,2));
  await browser.close();
}
