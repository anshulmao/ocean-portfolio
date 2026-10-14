import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({acceptDownloads:true});
const errors = []; page.on('pageerror',error=>errors.push(error.message));
await page.route('http://kit.test/**',async route=> {
  const pathname = new URL(route.request().url()).pathname;
  if (pathname === '/') return route.fulfill({contentType:'text/html',body:`<!doctype html><body><canvas id="world" width="80" height="60"></canvas><script>
    window.position={x:0,y:-5,z:0};window.hold=false;
    window.oceanDiagnostics={ready:true,submerged:true,cameraMode:'first',frames:1};
    window.oceanControls={getPlayerPosition(){return {...position}},getMode(){return 'diver'},getTransition(){return false},setInterfaceOpen(v){window.hold=v},getScene(){return{add(mesh){window.tokenCount=mesh.count}}},reef:{userData:{terrainHeightAt:()=>-20}},render(){const c=document.querySelector('canvas');const g=c.getContext('2d');g.fillStyle='#176e84';g.fillRect(0,0,80,60)},getRenderer(){return {domElement:document.querySelector('canvas')}}};
    </script><script type="module" src="/expedition-interactions.js"></script></body>`});
  const file = path.resolve(root,`.${pathname}`);
  if (!file.startsWith(root+path.sep)) return route.abort();
  try { await route.fulfill({body:await fs.readFile(file),contentType:pathname.endsWith('.css')?'text/css':'text/javascript'}); } catch { await route.abort(); }
});
try {
  await page.goto('http://kit.test/');
  await page.waitForFunction(()=>window.oceanExpedition && window.tokenCount===10);
  await page.keyboard.press('F2');
  assert.equal(await page.evaluate(()=>window.hold && window.oceanExpedition.holding),true);
  await page.locator('[name=rating]').selectOption('5');
  await page.locator('[name=name]').fill('Test visitor');
  await page.locator('[name=email]').fill('visitor@example.com');
  await page.locator('[name=feedback]').fill('Readable and peaceful.');
  await page.locator('[type=submit]').click();
  assert.equal(await page.locator('.feedback-error').isVisible(),true);
  await page.locator('[name=consent]').check();
  const exported = page.waitForEvent('download'); await page.locator('[type=submit]').click();
  const download = await exported, data=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  assert.equal(data.rating,5); assert.equal(data.contact.email,'visitor@example.com'); assert.equal(data.contact.consent,true);
  await page.keyboard.press('Escape'); await page.waitForFunction(()=>window.hold===false);
  await page.evaluate(()=>{oceanControls.nav={mode:'transition',transition:true};oceanControls.getMode=()=> 'transition';oceanControls.getTransition=()=>true;});
  await page.keyboard.press('F2');
  assert.equal(await page.evaluate(()=>window.hold && window.oceanExpedition.holding),true);
  await page.keyboard.press('Escape'); await page.waitForFunction(()=>window.hold===false);
  await page.evaluate(()=>{oceanControls.nav={mode:'diver',transition:false};oceanControls.getMode=()=> 'diver';});
  await page.keyboard.press('F2');
  assert.equal(await page.evaluate(()=>window.oceanExpedition.holding),false);
  await page.evaluate(()=>oceanControls.getTransition=()=>false);
  await page.evaluate(()=>position.y=-12); await page.keyboard.press('F2');
  assert.equal(await page.evaluate(()=>window.oceanExpedition.holding),false);
  await page.evaluate(()=>{const item=oceanExpedition.locations[0];position={x:item.x,y:item.y+1,z:item.z};});
  await page.waitForTimeout(450); await page.keyboard.press('f');
  assert.equal(await page.evaluate(()=>oceanExpedition.score),100);
  await page.evaluate(()=>{const item=oceanExpedition.locations[1];position={x:item.x,y:item.y+1,z:item.z};oceanDiagnostics.nearbyLandmark='about';});
  await page.waitForTimeout(450); await page.keyboard.press('f');
  assert.equal(await page.evaluate(()=>oceanExpedition.score),100);
  await page.evaluate(()=>delete oceanDiagnostics.nearbyLandmark);
  const photo = page.waitForEvent('download'); await page.keyboard.press('h');
  const image = await photo, png = await fs.readFile(await image.path());
  assert.equal(png.readUInt32BE(16),80); assert.equal(png.readUInt32BE(20),60);
  assert.equal(await page.evaluate(()=>oceanExpedition.photos),1);
  await page.evaluate(()=>oceanDiagnostics.cameraMode='third'); await page.keyboard.press('h');
  assert.equal(await page.evaluate(()=>oceanExpedition.photos),1);
  assert.deepEqual(errors,[]);
  console.log('Expedition feature checks passed: F2 hold/range/Escape, consent JSON export, artifact collection/landmark priority, first-person world-only photo.');
} finally { await browser.close(); }
