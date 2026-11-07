// Built-site regression for first attempt, persisted returning visit, replay,
// keyboard controls, and the reduced-motion travel path. All data stays local.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist'), out = path.join(root,'.taste-skill/guided-return');
await fs.mkdir(out,{recursive:true});
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.glb':'model/gltf-binary','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer(async (req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://local').pathname);
  let file = path.resolve(dist,'.'+pathname);
  if(!file.startsWith(dist+path.sep) && file!==dist) {res.writeHead(403).end();return;}
  try {if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));}
  catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
let browser;
try {
  browser=await launchBrowser({args:['--enable-unsafe-swiftshader']});
  for(const profile of [
    {name:'desktop',viewport:{width:1440,height:900},reducedMotion:'no-preference'},
    {name:'phone',viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'},
  ]) {
    const {name,...options}=profile,context=await browser.newContext(options),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    // Keep the regression offline from third-party telemetry.
    await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin ? route.continue() : route.abort());
    const start=async()=>{
      await page.waitForFunction(()=>window.oceanDiagnostics?.ready && window.oceanTour,null,{timeout:60000});
      assert.equal(await page.evaluate(()=>window.oceanTour.start()),true);
      await page.waitForFunction(()=>window.oceanTour.status==='intro',null,{timeout:60000});
      await page.locator('.tour-card[data-show="true"]').waitFor({timeout:60000});
    };
    try {
      // Main deliberately opens with a moving ocean. Exercise the effective
      // in-page motion preference, rather than assuming the OS setting changes it.
      await page.goto(base + (profile.reducedMotion==='reduce' ? '?motion=reduced' : '?motion=full'));await start();
      assert.equal(await page.locator('.tour-keys').isVisible(),true);
      assert.equal(await page.evaluate(()=>localStorage.getItem('ocean-guided-controls-attempted-v1')),'1');
      await page.screenshot({path:path.join(out,`${name}-first.png`)});
      await page.reload();
      await page.waitForFunction(()=>window.oceanTour);
      assert.equal(await page.evaluate(()=>window.oceanTour.status),'off','a returning page never starts a tour itself');
      await start();
      assert.equal(await page.locator('.tour-title').innerText(),'Welcome back to the reef');
      assert.equal(await page.locator('.tour-keys').isVisible(),false);
      assert.equal(await page.locator('.tour-teach').isVisible(),false);
      await page.screenshot({path:path.join(out,`${name}-return.png`)});
      await page.getByRole('button',{name:'Try the controls again'}).click();
      await page.locator('.tour-keys').waitFor({state:'visible'});
      await page.keyboard.press('n');
      if(profile.reducedMotion==='reduce') {
        await page.waitForFunction(()=>window.oceanTour.status==='dwell');
        assert.equal(await page.evaluate(()=>window.oceanDiagnostics.tour.sight),null);
      } else {
        await page.waitForFunction(()=>window.oceanTour.status==='travel');
        await page.keyboard.press('p');
        assert.equal(await page.evaluate(()=>window.oceanDiagnostics.tour.paused),true);
        await page.keyboard.press('p');
        assert.equal(await page.evaluate(()=>window.oceanDiagnostics.tour.paused),false);
        await page.waitForFunction(()=>window.oceanDiagnostics.tour.sight==='scooter',null,{timeout:45000});
        await page.waitForTimeout(800);
        assert.ok(await page.locator('.tour-caption').evaluate(el=>Number(getComputedStyle(el).opacity)>.95),'caption settles to readable ink');
        await page.screenshot({path:path.join(out,`${name}-caption.png`)});
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow');
      assert.deepEqual(errors,[]);
      console.log(`PASS ${name}: interrupted attempt, persisted reload, explicit start, replay, keyboard and motion`);
    } finally {await context.close();}
  }
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
