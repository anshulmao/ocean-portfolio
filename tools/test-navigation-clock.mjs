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
 nav.travel([0,-12,-20],null,5);
 for(let t=0;t<1;t+=dt)nav.update(dt,true);
 const beforeCancel=nav.getPlayerPosition(),speedBefore=nav.state.speed;
 assert.ok(nav.cancelTravel({hold:true}));
 assert.ok(nav.state.speed>0,'Holding a cancelled route preserves momentum for a smooth stop');
 assert.ok(speedBefore>0&&nav.getPlayerPosition().distanceTo(beforeCancel)<.2);
 for(let t=0;t<5&&nav.state.speed>.05;t+=dt)nav.update(dt,true);
 assert.ok(nav.state.speed<.1,'A cancelled route eases to rest');
 {
  nav.place([0,-10,0]);nav.setGuided(true,true);
  assert.ok(nav.travelPath([[8,-12,-5],[15,-20,-18],[24,-25,-20]],[25,-26,-22],6));
  let moved=0,previous=nav.getPlayerPosition();
  for(let t=0;t<35;t+=dt){nav.update(dt,true);const p=nav.getPlayerPosition();const gap=p.distanceTo(previous);assert.ok(gap<10*dt,'No instantaneous placement');moved+=gap;previous=p;}
  assert.ok(previous.distanceTo({x:24,y:-25,z:-20})<.1,'The curved swim reaches its viewpoint');
  assert.ok(moved>30);console.log('PASS continuous navigation at',hz,'Hz');
 }
 nav.destroy();
 const returning=make();
 {
  returning.place([40,-45,-90]);assert.ok(returning.beginAscent(undefined,true));
  for(let t=0;t<60&&returning.state.returnPhase!=='offer';t+=dt)returning.update(dt,true);
  assert.equal(returning.state.returnPhase,'offer');
  const held=returning.getPlayerPosition();assert.ok(Math.hypot(held.x,held.z+6)<.5);
  returning.holdSafetyStop(true);
  for(let t=0;t<3;t+=dt)returning.update(dt,true);
  assert.ok(returning.getPlayerPosition().distanceTo(held)<.3,'Residual route momentum eases into the safety hold');
  assert.equal(returning.state.returnPhase,'stop','A safety stop stays in place instead of launching ascent');
  returning.holdSafetyStop(false);
  let maxRiseStep=0,maxAcceleration=0,previous=returning.getPlayerPosition(),previousVelocity=returning.state.velocity.clone(),sawLaunch=false;
  for(let t=0;t<20;t+=dt){
   returning.update(dt,true);const p=returning.getPlayerPosition(),currentVelocity=returning.state.velocity;
   maxRiseStep=Math.max(maxRiseStep,p.distanceTo(previous));previous=p;
   if(t<1.5)maxAcceleration=Math.max(maxAcceleration,currentVelocity.distanceTo(previousVelocity)/dt);previousVelocity.copy(currentVelocity);
   if(returning.state.ascentLaunch>0)sawLaunch=true;
   if(returning.state.mode==='surface')break;
  }
  assert.ok(sawLaunch,'The transition exposes a gradual vertical launch');
  assert.ok(maxRiseStep<.5,'The final ascent has bounded per-frame movement');
  assert.ok(maxAcceleration<18,`The launch acceleration stays bounded (${maxAcceleration.toFixed(2)} m/s²)`);
  assert.equal(returning.state.mode,'surface');console.log('PASS held stop and final ascent at',hz,'Hz');
 }
 returning.destroy();
 const skipped=make();
 skipped.place([40,-45,-90]);assert.ok(skipped.beginAscent(undefined,true));
 let collisionMoves=0;
 skipped.setCollisions({segmentClear:()=>true,move(position,step){collisionMoves++;position.add(step);return {blocked:false,contacts:0};}});
 for(let t=0;t<60&&skipped.state.returnPhase!=='offer';t+=dt)skipped.update(dt,true);
 assert.equal(skipped.state.returnPhase,'offer');
 const movesBeforeAscent=collisionMoves;
 skipped.skipSafetyStop();assert.equal(skipped.state.returnPhase,'ascent','Escape skips the safety invitation');
 let maxSkipAcceleration=0,skipVelocity=skipped.state.velocity.clone();
 for(let t=0;t<20&&skipped.state.mode!=='surface';t+=dt){skipped.update(dt,true);if(t<1.5)maxSkipAcceleration=Math.max(maxSkipAcceleration,skipped.state.velocity.distanceTo(skipVelocity)/dt);skipVelocity.copy(skipped.state.velocity);}
 assert.equal(skipped.state.mode,'surface','Skipping still completes the waterline crossing');
 assert.ok(maxSkipAcceleration<18,`Skipping ramps actual ascent velocity smoothly (${maxSkipAcceleration.toFixed(2)} m/s²)`);
 assert.ok(collisionMoves>movesBeforeAscent,'Ascent movement stays on the collision-aware integrator');
 skipped.destroy();console.log('PASS Escape skip and waterline crossing at',hz,'Hz');
 const expired=make();expired.place([40,-45,-90]);assert.ok(expired.beginAscent(undefined,true));
 for(let t=0;t<60&&expired.state.returnPhase!=='offer';t+=dt)expired.update(dt,true);
 assert.equal(expired.state.returnPhase,'offer');
 let maxExpiryAcceleration=0,expiryVelocity=expired.state.velocity.clone(),elapsed=0;
 while(expired.state.returnPhase==='offer'&&elapsed<12){expired.update(dt,true);if(elapsed>8.5)maxExpiryAcceleration=Math.max(maxExpiryAcceleration,expired.state.velocity.distanceTo(expiryVelocity)/dt);expiryVelocity.copy(expired.state.velocity);elapsed+=dt;}
 assert.equal(expired.state.returnPhase,'ascent','The invitation timer starts ascent when it expires');
 for(let t=0;t<1.5;t+=dt){expired.update(dt,true);maxExpiryAcceleration=Math.max(maxExpiryAcceleration,expired.state.velocity.distanceTo(expiryVelocity)/dt);expiryVelocity.copy(expired.state.velocity);}
 assert.ok(maxExpiryAcceleration<18,`Offer expiry ramps actual ascent velocity smoothly (${maxExpiryAcceleration.toFixed(2)} m/s²)`);
 expired.destroy();console.log('PASS invitation expiry launch at',hz,'Hz');
}
