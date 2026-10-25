// Run the actual navigation integrator without WebGL or a browser. Only the
// device adapters are replaced; routes, velocity, steering and ascent are real.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {movementDefaults} from '../ocean-refined/movement-defaults.js';
const moduleURL=new URL('../ocean-refined/exploration.js',import.meta.url);
let code=await fs.readFile(moduleURL,'utf8');
code=code.replace(/import \{ createTouchControls \}[^;]+;/,"const createTouchControls=()=>({destroy(){}});")
 .replace(/import \{ createGamepad \}[^;]+;/,"const createGamepad=()=>({connected:false,destroy(){}});")
 .replace(/import \{ settings as savedSettings \}[^;]+;/,"const savedSettings={};")
 .replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL(path,moduleURL).href}'`);
globalThis.window=new EventTarget();
globalThis.document=Object.assign(new EventTarget(),{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],pointerLockElement:null});
const {createExploration}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function make(){const canvas=Object.assign(new EventTarget(),{focus(){}});const nav=createExploration(canvas,()=>{},{...movementDefaults,pointerLock:false,idleMotion:0});nav.setTerrain(()=>-60);nav.startDive();nav.update(1/60,true);return nav;}
for(const hz of [30,60,120]){
 const nav=make(),dt=1/hz;
 if(nav.travelPath){
  nav.place([0,-10,0]);nav.setGuided(true,true);
  assert.ok(nav.travelPath([[8,-12,-5],[15,-20,-18],[24,-25,-20]],[25,-26,-22],6));
  let moved=0,previous=nav.getPlayerPosition();
  for(let t=0;t<35;t+=dt){nav.update(dt,true);const p=nav.getPlayerPosition();const gap=p.distanceTo(previous);assert.ok(gap<10*dt,'No instantaneous placement');moved+=gap;previous=p;}
  assert.ok(previous.distanceTo({x:24,y:-25,z:-20})<.1,'The curved swim reaches its viewpoint');
  assert.ok(moved>30);console.log('PASS continuous navigation at',hz,'Hz');
 }
 nav.destroy();
 const returning=make();
 if(returning.holdSafetyStop){
  returning.place([40,-45,-90]);assert.ok(returning.beginAscent(undefined,true));
  for(let t=0;t<60&&returning.state.returnPhase!=='offer';t+=dt)returning.update(dt,true);
  assert.equal(returning.state.returnPhase,'offer');
  const held=returning.getPlayerPosition();assert.ok(Math.hypot(held.x,held.z+6)<.5);
  returning.holdSafetyStop(true);returning.setInterfaceOpen(true);
  for(let t=0;t<3;t+=dt)returning.update(dt,true);
  assert.ok(returning.getPlayerPosition().distanceTo(held)<.01);
  returning.holdSafetyStop(false);returning.setInterfaceOpen(false);
  for(let t=0;t<20;t+=dt)returning.update(dt,true);
  assert.equal(returning.state.mode,'surface');console.log('PASS held stop and final ascent at',hz,'Hz');
 }
 returning.destroy();
}
