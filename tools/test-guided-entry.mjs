import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.OCEAN_URL||'http://127.0.0.1:4210/dist/')+'?motion=full',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.oceanDiagnostics?.ready&&window.oceanTour,null,{timeout:120000});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:900});
  assert.equal(await page.locator('.portfolio-actions>button').count(),2);
  assert.equal(await page.locator('#guided-dive').isVisible(),true);
  assert.equal(await page.locator('#dive-label').innerText(),'Explore');
  assert.equal(await page.locator('#guided-dive').evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.equal(await page.locator('#guided-dive').evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:process.env.TEMP+`/guided-entry-${width}.png`,animations:'disabled'});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.locator('#guided-dive').click();
 await page.evaluate(()=>oceanControls.step(12));
 await page.waitForFunction(()=>oceanDiagnostics.landmarksReady&&!oceanControls.getTransition(),null,{timeout:120000});
 await page.evaluate(()=>oceanControls.step(.3));
 assert.equal(await page.evaluate(()=>oceanDiagnostics.tour.key),'about');
 assert.equal(await page.evaluate(()=>oceanDiagnostics.reducedMotion),false,'Visitor motion choice overrides OS reduce');
 await page.evaluate(()=>{window.tourCuts=0;const place=oceanControls.place;oceanControls.place=(...args)=>{window.tourCuts++;return place(...args);};});
 for(const [index,key] of ['about','experience','projects'].entries()){
  for(let elapsed=0;elapsed<110;elapsed+=2){
   const status=await page.evaluate(()=>({status:oceanTour.status,paused:oceanDiagnostics.tour.paused}));
   if(status.status==='dwell')break;
   assert.equal(status.paused,false,'Route should swim through '+key);
   await page.evaluate(()=>oceanControls.step(2));
  }
  assert.equal(await page.evaluate(()=>oceanTour.status),'dwell','Arrive naturally at '+key);
  assert.equal(await page.evaluate(()=>oceanDiagnostics.tour.key),key);
  await page.evaluate(()=>oceanUi.tick(60));
  assert.equal(await page.evaluate(()=>oceanTour.status),'dwell','Reading never auto advances');
  console.log('Natural guided arrival and reading dwell: '+key);
  assert.equal(await page.evaluate(()=>window.tourCuts),0,'Continuous guided travel never calls instant placement');
  if(index<2)await page.locator('[data-tour="next"]').click();
 }
 await page.locator('[data-tour="next"]').click();
 assert.equal(await page.evaluate(()=>oceanTour.status),'done');
 await page.evaluate(()=>{oceanTour.stop();oceanControls.place([-40,-6,20]);oceanControls.guide(true,true);oceanControls.travel([40,-6,20],[40,-6,10],9.2);});
 const trajectory=[];
 for(let i=0;i<12;i++)trajectory.push(await page.evaluate(()=>{oceanControls.step(.5);return oceanControls.getPlayerPosition().toArray();}));
 assert.ok(trajectory.some(p=>Math.abs(p[2]-20)>.1),'Open-water atlas leg has a gentle arc');
 assert.ok(trajectory.every(p=>p.every(Number.isFinite)));
 await page.locator('#world').focus();await page.keyboard.press('w');
 await page.evaluate(()=>oceanControls.step(.2));
 assert.equal(await page.evaluate(()=>oceanControls.nav.guided),false,'Manual swim takes control');
 assert.deepEqual(errors,[]);console.log('PASS: two visible entry options, all three stops without cuts, reading dwell, curved atlas travel, manual takeover.');
}finally{console.log({errors});await browser.close();}
