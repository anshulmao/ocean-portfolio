import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {launchBrowser} from './browser.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await launchBrowser({headless:true});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:900},userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'});
const errors=[],submissions=[],analytics=[],eventNames=[];let failFeedback=true;
// The SDK file is held back until released, so the test can act before analytics has loaded.
let releaseSDK=null;const sdkGate=new Promise(resolve=>{releaseSDK=resolve;});
function namesIn(buffer){
  if(!buffer)return [];
  for(const read of [()=>gunzipSync(buffer).toString(),()=>buffer.toString(),()=>Buffer.from(decodeURIComponent(buffer.toString().replace(/^data=/,'')),'base64').toString()])
    try{const parsed=JSON.parse(read());return [parsed].flat().flatMap(item=>item?.batch||item).map(item=>item?.event).filter(Boolean);}catch{}
  return [];
}
// No test request may reach a live backend or analytics collector.
await page.route('**/*',route=>route.abort('blockedbyclient'));
page.on('pageerror',error=>errors.push(error.message));
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'apikey,content-type,x-request-id,x-photo-note','access-control-allow-methods':'POST,OPTIONS'};
await page.route('https://intake.invalid/functions/**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
  const kind=new URL(route.request().url()).pathname.split('/').pop();
  submissions.push({kind,body:kind==='feedback'?route.request().postDataJSON():null,headers:route.request().headers(),bytes:route.request().postDataBuffer()?.length||0});
  return route.fulfill({status:kind==='feedback'&&failFeedback?503:201,headers:cors,contentType:'application/json',body:JSON.stringify(kind==='feedback'&&failFeedback?{error:'Please try again.'}:{saved:true,id:crypto.randomUUID()})});
});
await page.route('https://analytics.invalid/**',async route=>{
  analytics.push(route.request().url());eventNames.push(...namesIn(route.request().postDataBuffer()));return route.fulfill({status:200,headers:cors,contentType:'application/json',body:'{}'});
});
await page.route('http://127.0.0.1:4190/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/test-fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><canvas width="80" height="60"></canvas><button id="photo-settings">Take a photo</button><button data-analytics-toggle>Analytics</button><script type="module">
    import {PerspectiveCamera,Vector3} from "/vendor/three.module.min.js"; const camera=new PerspectiveCamera(60,4/3,.1,200); camera.position.set(0,-6,0); camera.updateMatrixWorld();
    window.position={x:0,y:-6,z:0};window.oceanDiagnostics={ready:true,submerged:true,cameraMode:'first',frames:1,playerPosition:[0,-6,0]};
    window.oceanControls={nav:{mode:'diver'},getPlayerPosition(){return new Vector3(position.x,position.y,position.z)},getCamera(){return camera},getMode(){return 'diver'},getTransition(){return false},setSafetyStop(v){window.staged=v},setInterfaceOpen(v){window.hold=v},getScene(){return{add(){}}},reef:{userData:{terrainHeightAt:()=>-20}},render(){const c=document.querySelector('canvas'),g=c.getContext('2d');g.fillStyle='#176e84';g.fillRect(0,0,80,60)},getRenderer(){return{domElement:document.querySelector('canvas')}}};
    </script><script type="module" src="/expedition-interactions.js"></script><script type="module" src="/dive-summary.js"></script></body></html>`});
  if(pathname==='/services-config.js')return route.fulfill({contentType:'text/javascript',body:`export const services={supabaseURL:'https://intake.invalid',supabaseKey:'test-public',posthogToken:'phc_synthetic_browser_test',posthogHost:'https://analytics.invalid'};`});
  const file=path.resolve(root,'ocean-refined','.'+pathname);
  if(!file.startsWith(path.join(root,'ocean-refined')+path.sep))return route.abort();
  try{
    if(pathname==='/vendor/posthog.js')await sdkGate;
    let body=await fs.readFile(file);
    // The SDK normally excludes webdriver/bot traffic. Enable it only in this synthetic test.
    if(pathname==='/analytics.js')body=body.toString().replace('autocapture:false','opt_out_useragent_filter:true, autocapture:false');
    return route.fulfill({body,contentType:pathname.endsWith('.css')?'text/css':'text/javascript'});
  }catch{return route.abort();}
});
try{
  await page.goto('http://127.0.0.1:4190/test-fixture');
  await page.waitForFunction(()=>window.oceanExpedition && window.oceanDiveSummary && window.oceanDiveLog?.current);
  // A dive begun and ended before the SDK has arrived is kept and sent after the page view, not dropped.
  await page.evaluate(()=>{document.body.dataset.submerged='true'});await page.evaluate(()=>{document.body.dataset.submerged='false'});
  releaseSDK();
  // Analytics are on by default (no stored choice): the SDK loads once the page is idle.
  await page.waitForFunction(()=>document.querySelector('[data-analytics-toggle]')?.textContent.startsWith('Analytics on'));
  await page.waitForTimeout(1200);
  await page.evaluate(()=>oceanExpedition.openStop());
  assert.equal(await page.locator('.feedback-details').isVisible(),false,'Feedback fields stay hidden until a rating is chosen');
  assert.equal(await page.locator('.expedition-dialog [type=submit]').isVisible(),false);
  await page.getByRole('radio',{name:'5 out of 5',exact:true}).check();
  const held=await page.evaluate(async()=>{
    const before=oceanExpedition.safetyStop.remaining;
    const {tick}=await import('/ui-ticker.js');tick(60);
    return {before,...oceanExpedition.safetyStop};
  });
  assert.equal(held.paused,true,'Choosing a rating pauses the safety stop');
  assert.equal(held.remaining,held.before,'Time spent writing feedback cannot complete the stop');
  await page.locator('[name=feedback]').fill('Synthetic browser note');
  await page.locator('.expedition-dialog [type=submit]').click();await page.locator('.feedback-error:not([hidden])').waitFor();
  assert.equal(await page.locator('[name=feedback]').inputValue(),'Synthetic browser note');
  assert.equal(submissions[0].body.contact,null);
  assert.equal(await page.locator('.expedition-dialog').evaluate(el=>el.open),true,'Failure must keep the form open');
  failFeedback=false;await page.locator('.expedition-dialog [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('.expedition-dialog').open);
  assert.equal(submissions[0].body.id,submissions[1].body.id,'Retry must reuse the id');
  await page.evaluate(()=>oceanExpedition.openStop());await page.getByRole('radio',{name:'4 out of 5',exact:true}).check();
  // PR #38 intentionally removed the checkbox: optional contact fields are
  // shared only by the visitor's explicit submission of this form.
  await page.locator('[name=email]').fill('consented@example.com');
  assert.equal(submissions.length,2,'Typing optional contact information never sends it');
  await page.locator('.expedition-dialog [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('.expedition-dialog').open);
  assert.equal(submissions[2].body.contact.email,'consented@example.com');
  assert.equal(submissions[2].body.contact.consent,true);
  await page.evaluate(()=>oceanExpedition.takePhoto());
  await page.waitForFunction(()=>oceanDiveLog.photos.length===1);
  assert.equal(submissions.filter(item=>item.kind==='photo').length,0,'Taking a photo must not upload it');
  await page.evaluate(()=>{
    oceanDiagnostics.submerged=false;
    dispatchEvent(new CustomEvent('oceandiveend',{detail:{time:140,maxDepth:4,found:0}}));
    oceanDiveSummary.open();
  });
  const summary=page.locator('#dive-summary');
  assert.equal(await summary.locator('.postcard').count(),1,'Captured photo appears in the dive log');
  const download=page.waitForEvent('download');
  await summary.locator('.ds-download').click();await download;
  assert.equal(submissions.filter(item=>item.kind==='photo').length,0,'Downloading a photo must not upload it');
  await summary.locator('.ds-share-open').click();
  await summary.locator('#ds-note').fill('Synthetic private photo note');
  assert.equal(submissions.filter(item=>item.kind==='photo').length,0,'Opening the share form must not upload it');
  await summary.getByRole('button',{name:'Send privately',exact:true}).click();
  await page.waitForFunction(()=>oceanDiveLog.photos[0].shared);
  assert.equal(submissions.filter(item=>item.kind==='photo').length,1,'Explicit confirmation uploads one photo');
  const uploaded=submissions.find(item=>item.kind==='photo');
  assert.equal(uploaded.headers['content-type'],'image/jpeg');
  assert.equal(decodeURIComponent(uploaded.headers['x-photo-note']),'Synthetic private photo note');
  assert.ok(uploaded.bytes>0 && uploaded.bytes<=1048576);
  await page.evaluate(()=>oceanDiveSummary.close(true));
  if(!analytics.some(url=>url.includes('/e/')))await page.waitForRequest(request=>request.url().includes('analytics.invalid')&&request.url().includes('/e/'),{timeout:10000});
  await page.waitForTimeout(100);
  assert.ok(analytics.some(url=>url.includes('/e/')),'Real PostHog SDK should send events by default');
  await page.waitForTimeout(3500);   // the SDK sends in batches every few seconds
  const view=eventNames.indexOf('$pageview'),began=eventNames.indexOf('dive_started'),ended=eventNames.indexOf('dive_completed');
  assert.ok(view>=0&&began>view&&ended>began,`Events before the SDK loaded should follow the page view, in order: ${eventNames.join(', ')}`);
  await page.locator('[data-analytics-toggle]').click();await page.waitForFunction(()=>window.localStorage.getItem('ocean-analytics-consent-v1')==='no');await page.waitForTimeout(500);const before=analytics.length;
  await page.evaluate(()=>{document.body.dataset.submerged='true'});await page.waitForTimeout(500);assert.equal(analytics.length,before,'Turning analytics off must stop capture');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(root,'release/services-browser-qa.png')});
  console.log('Browser checks passed: real SDK on by default, feedback failure/retry, contact opt-in, explicit photo sharing, analytics opt-out.');
}finally{await browser.close();}
