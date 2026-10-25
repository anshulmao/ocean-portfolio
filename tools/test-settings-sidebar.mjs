import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={checks:[],errors:[],layouts:[]};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(process.env.OCEAN_TEST_URL||'http://127.0.0.1:4210/dist/',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.oceanDiagnostics?.ready,null,{timeout:120000});
  for(const [name,width,height] of [['desktop',1440,900],['phone',390,844]]){
    await page.setViewportSize({width,height});
    await page.locator('#menu-toggle').click();
    assert.equal(await page.locator('#settings-surface-now').isVisible(),false,'Quick return only appears underwater');
    const layout=await page.evaluate(()=>{
      const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,width:r.width};};
      const sections=[...document.querySelectorAll('#settings-general-content>.settings-subgroup')];
      const buttons=[...document.querySelectorAll('.theme-control>button,.weather-picker>button')];
      return {viewport:innerWidth,overflow:document.querySelector('.settings-body').scrollWidth>document.querySelector('.settings-body').clientWidth,
        sections:sections.map(section=>({id:section.id,...rect(section)})),
        buttons:buttons.map(button=>({text:button.innerText,...rect(button),overflow:button.scrollWidth>button.clientWidth+1})),
        locks:[...document.querySelectorAll('#settings-general-content .holo-switch')].map(rect)};
    });
    assert.equal(layout.overflow,false,`${name}: no horizontal menu overflow`);
    for(const button of layout.buttons){assert.ok(button.height<=46&&button.height>=36,`${button.text} stays compact`);assert.equal(button.overflow,false,`${button.text} label fits`);if(width<600)assert.ok(button.height>=44,'Phone preset remains finger-sized');}
    for(let i=1;i<layout.sections.length;i++)assert.ok(layout.sections[i].top>=layout.sections[i-1].bottom-1,'Sections do not overlap');
    await page.locator('.settings-body').evaluate(node=>node.scrollTop=0);
    await page.screenshot({path:path.join(process.env.TEMP,`ocean-sidebar-${name}.png`),animations:'disabled'});
    report.layouts.push({name,presetHeight:layout.buttons[0].height,sections:layout.sections.map(({id,height})=>({id,height}))});
    await page.locator('.settings-close').click();
  }
  report.checks.push('Compact presets, readable labels, consistent separated sections, no horizontal overflow, and 44px phone targets.');

  await page.waitForFunction(()=>oceanDiagnostics.landmarksReady&&oceanControls.world.ready,null,{timeout:120000});
  await page.evaluate(()=>{oceanControls.startDive({capture:false});oceanControls.step(12);});
  await page.waitForFunction(()=>oceanDiagnostics.submerged&&!oceanControls.getTransition(),null,{timeout:60000});
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:width===390?844:900});
    await page.evaluate(()=>{oceanControls.place([20,-50,-78]);oceanControls.step(1);});
    await page.locator('#menu-toggle').click();
    assert.equal(await page.locator('#settings-surface-now').isVisible(),true);
    const location=await page.locator('#settings-surface-now').boundingBox();
    const header=await page.locator('#settings-sky-title').boundingBox();
    assert.ok(location.y<header.y,'Surface action stays above General');
    await page.locator('.settings-body').evaluate(node=>node.scrollTop=0);
    await page.screenshot({path:path.join(process.env.TEMP,`ocean-sidebar-underwater-${width}.png`),animations:'disabled'});
    // Start visibly from the current location, then follow the reef home.
    await page.locator('#settings-surface-now').click();
    assert.equal(await page.evaluate(()=>oceanControls.getMode()),'transition');
    await page.evaluate(()=>oceanControls.step(85));
    const state=await page.evaluate(()=>({mode:oceanControls.getMode(),transition:oceanControls.getTransition(),submerged:oceanDiagnostics.submerged,depth:oceanDiagnostics.displayDepth,
      menu:document.querySelector('#settings-menu').hidden,focus:document.activeElement.id,diver:oceanControls.viewer.layers().diver.visible,velocity:oceanControls.nav.velocity.length(),positionY:oceanControls.getCamera().position.y}));
    assert.equal(state.mode,'surface');assert.equal(state.transition,false);assert.equal(state.submerged,false);assert.ok(state.depth<.1);
    assert.equal(state.menu,true);assert.equal(state.focus,'menu-toggle');assert.equal(state.diver,true);assert.ok(state.velocity<.01);assert.ok(state.positionY>0);
    await page.locator('#menu-toggle').click();assert.equal(await page.locator('#settings-surface-now').isVisible(),false);await page.locator('.settings-close').click();
    if(width===1440){await page.evaluate(()=>{oceanControls.startDive({capture:false});oceanControls.step(12);});await page.waitForFunction(()=>oceanDiagnostics.submerged&&!oceanControls.getTransition(),null,{timeout:60000});}
  }
  report.checks.push('Desktop/phone: guided return closes settings, swims home, restores the surface hero and hides the action on surface.');
  assert.deepEqual(report.errors,[]);report.passed=true;
}finally{console.log(JSON.stringify(report,null,2));await browser.close();}
