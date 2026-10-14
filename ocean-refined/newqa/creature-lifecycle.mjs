import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.OCEAN_TEST_BASE||'http://127.0.0.1:4190/ocean-refined/';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>window.oceanDiagnostics?.ready,null,{timeout:120000});await page.locator('#dive').click();await page.waitForFunction(()=>oceanDiagnostics.userCreatures?.ready,null,{timeout:120000});
 const result=await page.evaluate(()=>{document.querySelector('#motion').click();const c=oceanControls.creatures,p=oceanControls.getPlayerPosition(),samples=[];
 for(const id of ['whale','whale-shark','orcas','dolphins','blacktips','tuna']){
  if(!c.debug.spawn(id,p)||!c.debug.seek(id,.5))throw Error('Unable to start '+id);c.update(.1,p,null);
  const actors=c.sites();if(!actors.length||!c.diagnostics.finite)throw Error('Non-finite or absent actors '+id);
  c.debug.seek(id,2);c.update(.1,p,null);
  const slot=c.debug.slots().find(s=>s.slot===(['whale','whale-shark','orcas'].includes(id)?'giant':'pelagic'));
  if(slot.active!==null||slot.wait<=0)throw Error('Encounter did not switch off '+id);samples.push({id,cooldown:slot.wait});
 }
 const before=c.diagnostics.encounters.history.length;for(let i=0;i<2000;i++)c.update(.1,p,null);
 return {samples,history:c.diagnostics.encounters.history,finite:c.diagnostics.finite,before,count:c.diagnostics.count};
 });
 assert.equal(result.samples.length,6);assert.ok(result.finite);assert.ok(result.history.length>result.before);
 // Authored and procedural surface life and the 40 m instruments must coexist.
 assert.equal(await page.locator('#predive').count(),0);assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,...result}));
}finally{await browser.close();}
