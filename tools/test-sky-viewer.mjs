// Production sky: real catalogue targets, reversible camera/time/weather,
// keyboard navigation, clear storm preview and phone/tablet composition.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'dist'),out=path.join(root,'.taste-skill/sky-viewer');
await fs.mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.glb':'model/gltf-binary','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  let file=path.resolve(dist,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(file!==dist&&!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
  try{if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/`;
let browser;
try{
  browser=await launchBrowser({args:['--enable-unsafe-swiftshader']});
  for(const profile of [
    {name:'desktop',viewport:{width:1440,height:900},reducedMotion:'no-preference'},
    {name:'phone',viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'},
    {name:'tablet',viewport:{width:768,height:1024},isMobile:true,hasTouch:true,reducedMotion:'reduce'},
    {name:'landscape',viewport:{width:844,height:390},isMobile:true,hasTouch:true,reducedMotion:'reduce'},
  ]){
    const {name,...options}=profile,context=await browser.newContext(options),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
    await page.addInitScript(()=>{localStorage.setItem('ocean-analytics-consent-v1','no');localStorage.setItem('ocean-weather','storm');localStorage.setItem('ocean-time-lock','1');});
    try{
      await page.goto(base+'?motion='+(profile.reducedMotion==='reduce'?'reduced':'full'));
      await page.waitForFunction(()=>window.oceanDiagnostics?.ready&&window.oceanControls?.sky?.viewer,null,{timeout:90000});
      const before=await page.evaluate(()=>({time:oceanControls.sky.state.simulatedUTC,rotation:oceanControls.getCamera().quaternion.toArray(),weather:oceanControls.weather.target,locked:oceanControls.weather.locked,storage:JSON.stringify({...localStorage})}));
      await page.locator('#sky-viewer-open').focus();await page.keyboard.press('Enter');
      await page.locator('#sky-viewer[open]').waitFor();
      await page.waitForFunction(()=>oceanControls.sky.state.sunAltitude < -6 && oceanControls.weather.state==='clear');
      const targets=await page.evaluate(()=>oceanControls.sky.targets());
      assert.ok(targets.length>=3);
      assert.ok(targets.every(target=>target.altitude>=15&&Math.abs(Math.hypot(...target.direction)-1)<1e-8));
      assert.equal(new Set(targets.map(target=>target.id)).size,targets.length);
      assert.ok(targets.some(target=>target.kind==='Star'));
      const first=await page.locator('#sky-target').inputValue();
      await page.getByRole('button',{name:/^Next/}).click();
      assert.notEqual(await page.locator('#sky-target').inputValue(),first);
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('#sky-target').inputValue(),first);
      await page.evaluate(async()=>{window.SkyTestVector=(await import('./vendor/three.module.min.js')).Vector3;});
      await page.waitForFunction(()=>oceanControls.sky.viewer.settled,null,{timeout:10000});
      if(name==='phone'){
        await page.locator('#sky-target').selectOption(targets.find(target=>target.kind==='Star').id);
        await page.waitForFunction(()=>oceanControls.sky.viewer.settled,null,{timeout:10000});
      }
      const autoplayFrom=await page.locator('#sky-target').inputValue();
      await page.getByRole('button',{name:'Play tour',exact:true}).click();
      assert.equal(await page.locator('#sky-play').getAttribute('aria-pressed'),'true');
      // In reduced motion a paused world's normal frame loop stops. Exercise
      // actual elapsed autoplay on a star to catch a scheduler that stalls there.
      if(name==='phone')await page.waitForFunction(id=>oceanControls.sky.viewer.target.id!==id,autoplayFrom,{timeout:25000});
      else await page.evaluate(()=>oceanControls.sky.viewer.update(20));
      assert.notEqual(await page.locator('#sky-target').inputValue(),autoplayFrom,'the playing tour advances after its reading hold');
      await page.getByRole('button',{name:'Pause tour',exact:true}).click();
      assert.equal(await page.locator('#sky-play').getAttribute('aria-pressed'),'false');
      const geometry=await page.locator('#sky-viewer').evaluate(el=>{
        const head=el.querySelector('.sky-viewer-head').getBoundingClientRect(),panel=el.querySelector('.sky-viewer-panel').getBoundingClientRect();
        return {overflow:el.scrollWidth>innerWidth,overlap:Math.min(head.right,panel.right)>Math.max(head.left,panel.left)&&Math.min(head.bottom,panel.bottom)>Math.max(head.top,panel.top),
          controls:[...el.querySelectorAll('button,select')].map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})),panel:{left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom}};
      });
      assert.equal(geometry.overflow,false);assert.equal(geometry.overlap,false,'header and reading sheet remain separate');
      assert.ok(geometry.controls.every(box=>box.width>=44&&box.height>=44),'all controls fit a finger');
      assert.ok(geometry.panel.left>=0&&geometry.panel.right<=profile.viewport.width&&geometry.panel.bottom<=profile.viewport.height);
      await page.waitForFunction(()=>oceanControls.sky.viewer.settled,null,{timeout:10000});
      const subject=await page.evaluate(()=>{
        const camera=oceanControls.getCamera(),point=new SkyTestVector(...oceanControls.sky.viewer.target.direction).multiplyScalar(680).add(camera.position).project(camera);
        const x=(point.x+1)/2*innerWidth,y=(1-point.y)/2*innerHeight;
        const covered=[...document.querySelectorAll('.sky-viewer-head,.sky-viewer-panel')].some(node=>{const r=node.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;});
        return {x,y,covered};
      });
      assert.ok(subject.x>0&&subject.x<profile.viewport.width&&subject.y>0&&subject.y<profile.viewport.height&&!subject.covered,'the selected astronomical target stays in the open sky');
      await page.screenshot({path:path.join(out,`${name}.png`)});
      await page.keyboard.press('Escape');await page.locator('#sky-viewer').waitFor({state:'hidden'});
      const after=await page.evaluate(()=>({phase:oceanControls.sky.state.date.toISOString(),diagnosticPhase:oceanDiagnostics.phase,weather:oceanControls.weather.target,locked:oceanControls.weather.locked,storage:JSON.stringify({...localStorage}),focused:document.activeElement.id,mode:oceanControls.getMode()}));
      assert.equal(after.phase,before.time,'clock returns to the saved phase');
      assert.equal(after.weather,before.weather);assert.equal(after.locked,before.locked);assert.equal(after.storage,before.storage);
      assert.equal(after.focused,'sky-viewer-open');assert.equal(after.mode,'surface');
      assert.deepEqual(errors,[]);
      console.log(`PASS ${name}: catalogue targets, camera, time/weather restore, keyboard, touch and layout`);
    }finally{await context.close();}
  }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
