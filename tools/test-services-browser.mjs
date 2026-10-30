import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:900},userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'});
const errors=[],submissions=[],analytics=[];let failFeedback=true;
page.on('pageerror',error=>errors.push(error.message));
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'apikey,content-type,x-request-id','access-control-allow-methods':'POST,OPTIONS'};
await page.route('https://ngtdxvgsauaqioygadlk.supabase.co/functions/**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
  const kind=new URL(route.request().url()).pathname.split('/').pop();
  submissions.push({kind,body:kind==='feedback'?route.request().postDataJSON():null});
  return route.fulfill({status:kind==='feedback'&&failFeedback?503:201,headers:cors,contentType:'application/json',body:JSON.stringify(kind==='feedback'&&failFeedback?{error:'Please try again.'}:{saved:true,id:crypto.randomUUID()})});
});
await page.route('https://us.i.posthog.com/**',async route=>{
  analytics.push(route.request().url());return route.fulfill({status:200,headers:cors,contentType:'application/json',body:'{}'});
});
await page.route('http://127.0.0.1:4190/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/test-fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><canvas width="80" height="60"></canvas><button id="photo-settings">Take a photo</button><button data-analytics-toggle>Analytics</button><script>
    window.position={x:0,y:-6,z:0};window.oceanDiagnostics={ready:true,submerged:true,cameraMode:'first',frames:1};
    window.oceanControls={nav:{mode:'diver'},getPlayerPosition(){return {...position}},getMode(){return 'diver'},getTransition(){return false},setSafetyStop(v){window.staged=v},setInterfaceOpen(v){window.hold=v},getScene(){return{add(){}}},reef:{userData:{terrainHeightAt:()=>-20}},render(){const c=document.querySelector('canvas'),g=c.getContext('2d');g.fillStyle='#176e84';g.fillRect(0,0,80,60)},getRenderer(){return{domElement:document.querySelector('canvas')}}};
    </script><script type="module" src="/expedition-interactions.js"></script></body></html>`});
  if(pathname==='/services-config.js')return route.fulfill({contentType:'text/javascript',body:`export const services={supabaseURL:'https://ngtdxvgsauaqioygadlk.supabase.co',supabaseKey:'test-public',posthogToken:'phc_synthetic_browser_test',posthogHost:'https://us.i.posthog.com'};`});
  const file=path.resolve(root,'ocean-refined','.'+pathname);
  if(!file.startsWith(path.join(root,'ocean-refined')+path.sep))return route.abort();
  try{
    let body=await fs.readFile(file);
    // The SDK normally excludes webdriver/bot traffic. Enable it only in this synthetic test.
    if(pathname==='/analytics.js')body=body.toString().replace('autocapture:false','opt_out_useragent_filter:true, autocapture:false');
    return route.fulfill({body,contentType:pathname.endsWith('.css')?'text/css':'text/javascript'});
  }catch{return route.abort();}
});
try{
  await page.goto('http://127.0.0.1:4190/test-fixture');
  await page.waitForFunction(()=>window.oceanExpedition);
  // Analytics are on by default (no stored choice): the SDK loads once the page is idle.
  await page.waitForFunction(()=>document.querySelector('[data-analytics-toggle]')?.textContent.startsWith('Analytics on'));
  await page.waitForTimeout(1200);
  await page.evaluate(()=>oceanExpedition.openStop());
  await page.getByRole('radio',{name:'5 out of 5',exact:true}).check();
  await page.locator('[name=feedback]').fill('Synthetic browser note');
  await page.locator('[name=name]').fill('Do not send');await page.locator('[name=email]').fill('private@example.com');
  await page.locator('[type=submit]').click();await page.locator('.feedback-error:not([hidden])').waitFor();
  assert.equal(await page.locator('[name=feedback]').inputValue(),'Synthetic browser note');
  assert.equal(submissions[0].body.contact,null);
  assert.equal(await page.locator('dialog').evaluate(el=>el.open),true,'Failure must keep the form open');
  failFeedback=false;await page.locator('[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
  assert.equal(submissions[0].body.id,submissions[1].body.id,'Retry must reuse the id');
  await page.evaluate(()=>oceanExpedition.openStop());await page.getByRole('radio',{name:'4 out of 5',exact:true}).check();
  await page.locator('[name=email]').fill('consented@example.com');await page.locator('[name=consent]').check();
  await page.locator('[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
  assert.equal(submissions[2].body.contact.email,'consented@example.com');
  const download=page.waitForEvent('download');await page.evaluate(()=>oceanExpedition.takePhoto());await download;
  const share=page.getByRole('button',{name:'Share last reef photo',exact:true});await share.waitFor();
  assert.equal(submissions.filter(item=>item.kind==='photo').length,0,'Taking a photo must not upload it');
  await share.click();await page.getByRole('button',{name:'Share with Anshul',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
  assert.equal(submissions.filter(item=>item.kind==='photo').length,1);
  if(!analytics.some(url=>url.includes('/e/')))await page.waitForRequest(request=>request.url().includes('us.i.posthog.com')&&request.url().includes('/e/'),{timeout:10000});
  await page.waitForTimeout(100);
  assert.ok(analytics.some(url=>url.includes('/e/')),'Real PostHog SDK should send events by default');
  await page.locator('[data-analytics-toggle]').click();await page.waitForFunction(()=>window.localStorage.getItem('ocean-analytics-consent-v1')==='no');await page.waitForTimeout(500);const before=analytics.length;
  await page.evaluate(()=>{document.body.dataset.submerged='true'});await page.waitForTimeout(500);assert.equal(analytics.length,before,'Turning analytics off must stop capture');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(root,'release/services-browser-qa.png')});
  console.log('Browser checks passed: real SDK on by default, feedback failure/retry, contact opt-in, explicit photo sharing, analytics opt-out.');
}finally{await browser.close();}
