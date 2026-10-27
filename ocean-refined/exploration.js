import * as THREE from './vendor/three.module.min.js';
import { settings as savedSettings } from './movement-settings.js';
import { createTouchControls } from './touch-controls.js';
import { createGamepad } from './gamepad.js';
import { planSurfaceReturn } from './return-route.js';
import { toDisplayDepth } from './depth-metrics.js';
import {routeTarget,smoothRoute,distance as routeDistance} from './cinematic-route.js';

// The swimming model. Everything that moves is eased by a critically damped follower that is exact over a step of
// any length, so the same input gives the same swim at 30, 60 or 120 updates a second:
//   linear   velocity chases the commanded velocity (frequency `acceleration` while swimming, `deceleration` while
//            gliding to rest, 0.8 of that vertically), so a swim starts from zero acceleration, never overshoots and stops soft;
//   turning  A / D, the arrow keys and the sticks set a turn *rate* that eases in and out over `turnEase` seconds;
//   aim      mouse and touch deltas are summed between frames and (optionally) spread through a light smoothing;
//   limits   the seabed, the ceiling under the surface and the edges of the world slow an approach instead of stopping it;
//   autopilot a commanded course that swings round to each new bearing, a pace that ramps up and brakes, and a look that leads.
const { clamp, smoothstep } = THREE.MathUtils, RAD = Math.PI / 180;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
// T90: a critically damped follower covers 90% of a step in 3.89 / frequency seconds.
const T90 = 3.89, VERTICAL = .8;
const AUTO_RESPONSE = 10, AUTO_ACCEL = 3.5, AUTO_BRAKE = 3.5, COURSE_RATE = 4, FOCUS_RANGE = 5;
const LOOK_AUTO = 4, LOOK_GUIDED = 3.2, SWEEP_AUTO = 2.2, SWEEP_GUIDED = 1.4;
const SOFT_RATE = 2.2, HARD_RATE = 4.5, FLOOR_GIVE = .5, LOOK_AHEAD = .5, PITCH_ZONE = 14 * RAD, CARVE_RATE = 2.2, ASCENT_RESPONSE = 3.2;
// value[key] follows goal with rate[key] as its derivative; returns the integral of the value over the step (the distance covered, when the value is a velocity).
function ease(value, rate, key, goal, frequency, dt) {
  const gap = value[key] - goal, lead = rate[key] + frequency * gap, decay = Math.exp(-frequency * dt), span = frequency * dt;
  const covered = goal * dt + gap * (1 - decay) / frequency + lead * (1 - decay * (1 + span)) / (frequency * frequency);
  value[key] = goal + (gap + lead * dt) * decay; rate[key] = (rate[key] - frequency * lead * dt) * decay;
  return covered;
}
// Adds `change` to an angle that may not pass ±limit: free until `zone` short of it, then every further radian of input closes the same fraction of what is left.
function soften(angle, change, limit, zone) {
  if (!change) return clamp(angle, -limit, limit);
  const sign = change > 0 ? 1 : -1, edge = limit - zone; let along = angle * sign, left = Math.abs(change);
  if (along < edge) { const free = Math.min(left, edge - along); along += free; left -= free; }
  if (left > 0) along = limit - Math.max(0, limit - along) * Math.exp(-left / zone);
  return along * sign;
}

// Navigation is always stored in world metres. The camera follows the diver;
// perspective only changes how the world renders around that same position.
export function createExploration(canvas, wake, settings=savedSettings) {
  const keys=new Set(),padKeys=new Set(),cleanup=[],controls=new Set(['KeyW','KeyA','KeyS','KeyD','KeyE','Space','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  // `base` is where the controls have put the diver; `offset` (what the scene reads) adds the idle drift on top.
  const offset=new THREE.Vector3(0,8,0),base=new THREE.Vector3(0,8,0),drift=new THREE.Vector3();
  const velocity=new THREE.Vector3(),thrust=new THREE.Vector3(),desired=new THREE.Vector3(),course=new THREE.Vector3(0,0,-1),dest=new THREE.Vector3(),focus=new THREE.Vector3();
  const travelStart=new THREE.Vector3(),curveTarget=new THREE.Vector3(),curveFrom=new THREE.Vector3(),curveTo=new THREE.Vector3();
  let travelSpan=0,curveProbe=0,curveClear=false;
  let travelRoute=[],travelIndex=0;const travelRemaining=[],routePosition=[0,0,0];
  const delta=new THREE.Vector3(),position=new THREE.Vector3(),step=new THREE.Vector3(),before=new THREE.Vector3(),scratchA=new THREE.Vector3(),scratchB=new THREE.Vector3(),pathCheckPosition=new THREE.Vector3();
  const bounds={x:62,zMin:-105,zMax:35,yMin:-52,yMax:8};
  const initialPerspective=settings.cameraMode==='third'?'third':'first';
  let syncedCameraMode=initialPerspective;
  // Beyond the fields other modules read: velocity (m/s, live), turnRate (rad/s, smoothed), roll (rad, positive banks left into a left turn),
  // pitchLead (rad, the body tipping into a climb or a descent), lean (rad, the idle sway), float (m, the idle drift already inside offset), idle (0..1).
  const state={offset,yaw:0,pitch:0,perspective:initialPerspective,moving:false,exploring:false,speed:0,atBoundary:false,colliding:false,contacts:0,mode:'surface',transition:false,ascentProgress:0,ascentDepth:0,ascentLaunch:0,travelling:false,travelBlocked:false,manualInput:false,pointerLocked:false,scooter:0,lamp:true,inputs:0,guided:false,suspended:false,velocity,turnRate:0,roll:0,pitchLead:0,lean:0,float:drift,idle:0,device:'keys'};
  // look: where the diver faces. spin: its turn rate (rad/s). spinPush: the rate's own derivative while the keys drive it.
  // pend: aim input summed since the last update (rad). lag: aim not yet shown, when smoothing is on.
  const look={yaw:0,pitch:0},spin={yaw:0,pitch:0},spinPush={yaw:0,pitch:0},pend={yaw:0,pitch:0},lag={yaw:0,pitch:0},bank={roll:0,lead:0},bankRate={roll:0,lead:0};
  // The touch thumb-stick and the gamepad write here; update() reads them. x is right, y is forward (or up, for a look).
  const stick={x:0,y:0,active:false},pad={active:false,x:0,y:0,lookX:0,lookY:0,rise:0,sink:0,scooter:false};
  const moveOptions={radius:.55,length:2,yaw:0,pitch:0,padding:.08,step:.2,iterations:4},lastPointer={x:0,y:0,set:false};
  // The reef surfaces within reach of the body this step (filled by collisions.nearby).
  const contact={count:0,gaps:new Float32Array(24),normals:new Float32Array(72)};
  let defaultYaw=0,terrain=()=>-15,collisions=null,floorY=-Infinity,floorStale=true;
  // Autopilot (atlas, start-at-site, guided tour): travelSpeed is its pace; while guided, mouse jitter under the slack is forgiven
  // and, when freeControl is set, the keys work without a captured mouse so the tour's buttons stay clickable.
  // hasDest: swimming to `dest`. docking: inside the arrival distance, settling onto the point. coursed: `course` holds a bearing to turn from.
  let hasDest=false,hasFocus=false,docking=false,dockTime=0,coursed=false,pace=0,travelSpeed=0,guided=false,freeControl=false,slack=0,boost=0,spool=0,coast=1,pendingDive=null;
  const coordinate=value=>Array.isArray(value)?value:[value.x,value.y,value.z];
  let suspended=false,captureRequired=true,touchId=null,skipMove=false,blockedTime=0,ascent=null,lastSubmerged=false,surfaceLocked=true,intentionalUnlock=false,pathCheckAt=0,pathIsClear=true;
  let lookIdle=0,breath=0,sway=0,wander=0,calm=false,engaged=false;const hover={idle:0},hoverRate={idle:0};
  const motionButton=document.getElementById('motion'),interactPrompt=document.getElementById('interact-prompt'),lampButton=document.querySelector('.swim-controls [data-lamp]');
  let motionPaused=motionButton?.getAttribute('aria-pressed')==='true';
  if(motionButton){const watch=new MutationObserver(()=>{motionPaused=motionButton.getAttribute('aria-pressed')==='true';});watch.observe(motionButton,{attributes:true,attributeFilter:['aria-pressed']});cleanup.push(()=>watch.disconnect());}
  function listen(target,event,handler,options){target.addEventListener(event,handler,options);cleanup.push(()=>target.removeEventListener(event,handler,options));}
  function releasePointer(){if(document.pointerLockElement===canvas){intentionalUnlock=true;document.exitPointerLock();}}
  // The scooter key only modifies a swim, so it leaves the autopilot alone; from the touch pad with nothing else under way it swims, which is deliberate input.
  function press(code,fromPad=false){if(ascent||(!lastSubmerged&&!surfaceLocked)||(surfaceLocked&&!code.startsWith('Arrow')))return;keys.add(code);if(fromPad)padKeys.add(code);if(code!=='KeyE'||(fromPad&&!hasDest))takeControl();if(code.startsWith('Arrow'))lookIdle=0;wake();}
  function release(code){keys.delete(code);padKeys.delete(code);wake();}
  // Any deliberate input hands the dive back to the visitor at once. Nothing is reset: the swim and the turn under way ease into whatever is asked next.
  function takeControl(){hasDest=hasFocus=docking=false;travelRoute=[];state.inputs++;guided=freeControl=false;state.guided=false;slack=0;}
  // Cancel an atlas or guided leg without throwing away the swimmer's momentum.
  // The normal velocity follower then eases the diver to a stop at the current spot.
  function cancelTravel({hold=true}={}){
    if(!hasDest&&!docking&&!travelRoute.length)return false;
    hasDest=hasFocus=docking=false;travelRoute=[];pace=0;travelSpeed=0;coursed=false;state.travelRemaining=0;state.travelBlocked=false;blockedTime=0;
    if(!hold){velocity.set(0,0,0);thrust.set(0,0,0);}
    wake();return true;
  }
  function setGuided(value,free=false){guided=Boolean(value);freeControl=guided&&Boolean(free);state.guided=guided;slack=0;wake();}
  function setLamp(value){const on=Boolean(value);if(on===state.lamp)return on;state.lamp=on;lampButton?.setAttribute('aria-pressed',String(on));window.dispatchEvent(new CustomEvent('oceanlamp',{detail:on}));wake();return on;}
  // Lets go of every held input. The swim itself is left to glide out.
  function clear(){keys.clear();padKeys.clear();lastPointer.set=false;touchId=null;pend.yaw=pend.pitch=0;wake();}
  function halt(){velocity.set(0,0,0);thrust.set(0,0,0);spin.yaw=spin.pitch=spinPush.yaw=spinPush.pitch=lag.yaw=lag.pitch=pend.yaw=pend.pitch=0;}
  function requireRecapture(){captureRequired=true;clear();releasePointer();state.exploring=false;}
  function lockFailed(){state.pointerLockFailed=true;wake();}
  // Only ever called from a click, a tap or a key: the browser refuses a pointer lock asked for at any other time.
  function lockPointer(){
    const raw=settings.rawMouse;
    try{const result=raw?canvas.requestPointerLock({unadjustedMovement:true}):canvas.requestPointerLock();
      result?.catch?.(error=>{if(raw&&error?.name==='NotSupportedError'){try{canvas.requestPointerLock()?.catch?.(lockFailed);}catch{lockFailed();}}else lockFailed();});}catch{lockFailed();}
  }
  function recapture(){if(suspended||ascent)return false;captureRequired=false;state.exploring=true;canvas.focus({preventScroll:true});if(settings.pointerLock)lockPointer();wake();return true;}
  function syncPerspectiveSetting(){if(settings.cameraMode!==syncedCameraMode){state.perspective=settings.cameraMode==='third'?'third':'first';syncedCameraMode=state.perspective;}}
  function togglePerspective(value){if(state.mode==='surface'||ascent)return state.perspective==='third';state.perspective=value===undefined?(state.perspective==='first'?'third':'first'):(value?'third':'first');settings.cameraMode=state.perspective;syncedCameraMode=state.perspective;wake();return state.perspective==='third';}
  function toggleFreeCam(value){return togglePerspective(value);}
  function getPlayerPosition(target=new THREE.Vector3()){return target.set(offset.x,offset.y-8,offset.z);}
  listen(window,'keydown',e=>{
    if(e.code==='Escape'||(e.code==='Semicolon'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.target.closest?.('input,textarea,select,[contenteditable="true"]'))){if(e.code==='Semicolon')e.preventDefault();requireRecapture();return;}
    if(e.target.closest?.('input,textarea,select,button,[contenteditable="true"]'))return;
    if(e.code==='KeyV'&&!suspended&&!e.repeat&&lastSubmerged){e.preventDefault();togglePerspective();return;}
    if(e.code==='KeyQ'&&!suspended&&!e.repeat&&lastSubmerged&&!e.ctrlKey&&!e.metaKey){e.preventDefault();setLamp(!state.lamp);return;}
    if(suspended||captureRequired||!controls.has(e.code))return;
    e.preventDefault();state.device='keys';press(e.code);
  });
  listen(window,'keyup',e=>{if(!padKeys.has(e.code))keys.delete(e.code);wake();});
  listen(window,'blur',requireRecapture);
  function holdSafetyStop(active){
    if(!ascent?.returnViaReef)return;
    ascent.offerWait=0;state.safetyOfferRemaining=0;
    state.returnPhase=active?'stop':'ascent';wake();
  }
  function skipSafetyStop(){if(ascent?.returnViaReef&&state.returnPhase==='offer')holdSafetyStop(false);}
  listen(document,'visibilitychange',()=>{if(document.hidden)requireRecapture();});
  // Aim input in pixels. It is only summed here; update() turns the sum into a change of view, so nothing depends on how many events a frame delivers.
  function aim(dx,dy,gain=settings.mouseSensitivity){if(suspended||captureRequired||!state.exploring||ascent)return;if(guided){slack+=Math.abs(dx)+Math.abs(dy);if(slack<90)return;}takeControl();pend.yaw-=dx*gain;pend.pitch-=dy*gain*(settings.invertMouse?-1:1);lookIdle=0;wake();}
  listen(canvas,'pointerdown',e=>{
    if(suspended||ascent)return;
    // One finger on the water looks; the thumb-stick and the buttons keep their own fingers.
    if(e.pointerType==='touch'){if(touchId!==null)return;captureRequired=false;state.exploring=true;state.device='touch';touchId=e.pointerId;try{canvas.setPointerCapture(e.pointerId);}catch{}lastPointer.x=e.clientX;lastPointer.y=e.clientY;lastPointer.set=true;wake();return;}
    recapture();lastPointer.x=e.clientX;lastPointer.y=e.clientY;lastPointer.set=true;
  });
  listen(canvas,'pointermove',e=>{
    if(suspended||captureRequired)return;
    // The first movement after the lock is taken can carry the whole distance the cursor travelled to get there.
    if(document.pointerLockElement===canvas){if(skipMove){skipMove=false;return;}if(Math.abs(e.movementX)<4000&&Math.abs(e.movementY)<4000)aim(e.movementX,e.movementY);return;}
    const touch=e.pointerType==='touch';
    if(touch&&e.pointerId!==touchId)return;
    if(settings.pointerLock&&!touch&&!state.pointerLockFailed)return;
    if(lastPointer.set)aim(e.clientX-lastPointer.x,e.clientY-lastPointer.y,touch?settings.touchSensitivity:settings.mouseSensitivity);
    lastPointer.x=e.clientX;lastPointer.y=e.clientY;lastPointer.set=true;
  });
  listen(canvas,'pointerleave',()=>{if(touchId===null)lastPointer.set=false;});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(canvas,event,e=>{if(e.pointerType==='touch'&&e.pointerId!==touchId)return;touchId=null;lastPointer.set=false;});
  listen(document,'pointerlockchange',()=>{lastPointer.set=false;skipMove=true;pend.yaw=pend.pitch=0;const locked=document.pointerLockElement===canvas;if(state.pointerLocked&&!locked){const intentional=intentionalUnlock;intentionalUnlock=false;state.pointerLocked=false;if(!intentional)requireRecapture();}else{state.pointerLocked=locked;if(locked){intentionalUnlock=false;state.device='keys';}}wake();});
  listen(document,'pointerlockerror',lockFailed);
  // What the touch buttons and the gamepad buttons can ask for besides swimming.
  function act(name){
    if(name==='lamp'){if(!suspended&&lastSubmerged)setLamp(!state.lamp);}
    else if(name==='camera'){if(!suspended&&lastSubmerged)togglePerspective();}
    else if(name==='interact'){if(state.mode==='surface'&&!suspended)document.getElementById('dive')?.click();else if(interactPrompt&&!interactPrompt.hidden)interactPrompt.click();}
    else if(name==='dive'){if(state.mode==='surface'&&!suspended)document.getElementById('dive')?.click();}
    else if(name==='menu')document.getElementById('menu-toggle')?.click();
    wake();
  }
  // Held buttons (rise, sink and the scooter on the touch deck; the look arrows at the surface) act as the key they name.
  if(lampButton)listen(lampButton,'click',()=>act('lamp'));
  document.querySelectorAll('[data-swim]').forEach(button=>{
    const surfaceLook=()=>state.mode==='surface'&&button.dataset.swim.startsWith('Arrow');
    const allowed=()=>!suspended&&!ascent&&(state.mode==='diver'||surfaceLook());
    function activateSurfaceLook(){if(surfaceLook()){captureRequired=false;state.exploring=true;}}
    listen(button,'pointerdown',e=>{if(!allowed())return;activateSurfaceLook();if(captureRequired&&e.pointerType==='touch'){captureRequired=false;state.exploring=true;}if(captureRequired)return;e.preventDefault();try{button.setPointerCapture(e.pointerId);}catch{}if(e.pointerType==='touch')state.device='touch';press(button.dataset.swim,true);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(button,event,()=>release(button.dataset.swim));
    listen(button,'keydown',e=>{if(allowed()&&(e.code==='Space'||e.code==='Enter')){activateSurfaceLook();if(captureRequired)return;e.preventDefault();press(button.dataset.swim,true);}});
    listen(button,'keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();release(button.dataset.swim);}});
    listen(button,'blur',()=>release(button.dataset.swim));
    listen(button,'click',e=>{if(e.detail===0&&allowed()){activateSurfaceLook();if(captureRequired)return;press(button.dataset.swim,true);setTimeout(()=>release(button.dataset.swim),450);}});
  });
  const touch=createTouchControls({root:document.querySelector('.swim-controls'),stick,deadZone:()=>settings.stickDeadZone,onAction:act,wake,
    // A thumb on the stick is as deliberate as a key: it needs no captured mouse, and it takes the dive back from the autopilot.
    onEngage(){if(suspended||ascent||state.mode!=='diver')return false;captureRequired=false;state.exploring=true;state.device='touch';takeControl();wake();return true;}});
  const gamepad=createGamepad({onAction:act,wake});
  cleanup.push(()=>touch.destroy(),()=>gamepad.destroy());

  function reset(){base.set(0,lastSubmerged?0:8,0);offset.copy(base);halt();look.yaw=defaultYaw;look.pitch=0;blockedTime=0;state.travelBlocked=false;ascent=null;state.ascentLaunch=0;surfaceLocked=!lastSubmerged;state.mode=lastSubmerged?'diver':'surface';takeControl();boost=spool=0;floorStale=true;requireRecapture();}
  // An explicit quick return, separate from the normal collision-routed ascent.
  function returnToSurface(){
    ascent=null;pendingDive=null;lastSubmerged=false;surfaceLocked=true;
    takeControl();requireRecapture();halt();boost=spool=coast=0;
    base.y=8;offset.copy(base);drift.set(0,0,0);floorStale=true;
    look.yaw=defaultYaw;look.pitch=0;state.yaw=look.yaw;state.pitch=0;
    state.mode='surface';state.transition=false;state.ascentProgress=1;state.ascentDepth=0;
    state.speed=state.scooter=0;state.moving=state.travelling=state.colliding=false;state.contacts=0;
    state.travelBlocked=false;blockedTime=0;wake();
  }
  function frameSky(value){defaultYaw=value;if(!state.exploring){look.yaw=value;lag.yaw=pend.yaw=spin.yaw=0;state.yaw=value;}}
  function setTerrain(fn){if(typeof fn==='function'){terrain=fn;floorStale=true;}}
  function setCollisions(value){collisions=value;}
  function suspend(value){suspended=state.suspended=Boolean(value);clear();if(value)requireRecapture();}
  function setInterfaceOpen(value){if(value)suspend(true);else{suspended=state.suspended=false;requireRecapture();}}
  // Move the diver at once: under a fade for tour cuts, or over the water before a dive that starts at a site.
  function place(point,focusPoint){
    const target=coordinate(point),limit=settings.pitchLimit*RAD;
    base.set(clamp(target[0],-bounds.x,bounds.x),surfaceLocked?8:clamp((target[1]??-8)+8,bounds.yMin,8-settings.ascentThreshold-1),clamp(target[2]??0,bounds.zMin,bounds.zMax));offset.copy(base);
    halt();hasDest=hasFocus=docking=false;blockedTime=0;state.travelBlocked=false;floorStale=true;
    if(focusPoint&&!surfaceLocked){const at=coordinate(focusPoint),dx=at[0]-base.x,dy=at[1]-(base.y-8),dz=at[2]-base.z;look.yaw=Math.atan2(-dx,-dz);look.pitch=clamp(Math.atan2(dy,Math.hypot(dx,dz)),-limit,limit);focus.set(at[0],at[1],at[2]);hasFocus=true;}
    wake();
  }
  function prepareDive(options){pendingDive=options||null;}
  const travelClear=(a,b)=>!collisions||!settings.collisionEnabled||collisions.segmentClear(scratchA.fromArray(a),scratchB.fromArray(b),Math.max(settings.collisionRadius+.25,.85));
  function useTravelRoute(points){
    travelRoute=points;travelIndex=0;travelRemaining.length=points.length;
    for(let i=points.length-1;i>=0;i--)travelRemaining[i]=i===points.length-1?0:travelRemaining[i+1]+routeDistance(points[i],points[i+1]);
  }
  function travel(point,focusPoint,speed){
    const target=coordinate(point),safeMaxY=8-settings.ascentThreshold-1;travelSpeed=speed>0?speed:settings.atlasCruiseSpeed;
    dest.set(clamp(target[0],-bounds.x,bounds.x),clamp((target[1]??-8)+8,bounds.yMin,safeMaxY),clamp(target[2]??0,bounds.zMin,bounds.zMax));
    travelStart.copy(base);travelSpan=Math.hypot(dest.x-base.x,dest.z-base.z);curveProbe=0;curveClear=false;
    // A fresh departure builds its pace from the swim already under way and turns from the way the diver is drifting; a new waypoint mid-route keeps both.
    if(!hasDest){pace=Math.min(travelSpeed,velocity.length());coursed=false;}
    hasDest=true;docking=false;hasFocus=Boolean(focusPoint);if(hasFocus){const at=coordinate(focusPoint);focus.set(at[0],at[1],at[2]);}
    blockedTime=0;state.travelBlocked=false;state.exploring=true;wake();
    const start=[base.x,base.y-8,base.z],end=[dest.x,dest.y-8,dest.z];
    const dx=end[0]-start[0],dz=end[2]-start[2],span=Math.hypot(dx,dz),arc=span>12?Math.min(3,span*.06):0;
    const mid=[(start[0]+end[0])/2-(span?dz/span*arc:0),(start[1]+end[1])/2,(start[2]+end[2])/2+(span?dx/span*arc:0)];
    mid[1]=Math.max(mid[1],terrain(mid[0],mid[2])+settings.floorClearance);
    useTravelRoute(smoothRoute([start,mid,end],{clear:travelClear}));
  }
  function travelPath(points,focusPoint,speed){
    if(!points?.length)return false;
    const start=[base.x,base.y-8,base.z],route=smoothRoute([start,...points],{clear:travelClear});
    if(!route.length)return false;
    travel(points.at(-1),focusPoint,speed);useTravelRoute(route);return true;
  }
  function beginAscent(routeProvider,returnViaReef=false){
    if(ascent||state.mode==='surface')return false;clear();state.mode='transition';releasePointer();position.set(base.x,base.y-8,base.z);let route=[];try{route=routeProvider?.(position.clone())||[];}catch{}
    if(returnViaReef)route=planSurfaceReturn(position.toArray(),{floor:terrain,exits:route,clear:(a,b)=>!collisions||collisions.segmentClear(scratchA.fromArray(a),scratchB.fromArray(b),Math.max(settings.collisionRadius+.25,settings.collisionLength/2+settings.collisionPadding+.15))});
    if(returnViaReef&&!route.length){state.mode='diver';state.ascentBlocked=true;wake();return false;}
    state.returnRoute=returnViaReef?route.map(p=>p.isVector3?p.toArray():[...p]):null;
    state.returnPhase=returnViaReef?'travel':null;state.safetyOfferRemaining=0;
    ascent={route:route.map(p=>p.isVector3?p.clone():new THREE.Vector3(...p)),returnViaReef,routeProvider,offerWait:returnViaReef?10:0,initialDepth:Math.max(0,-position.y),elapsed:0,waypoint:0,exitSearchAt:0,blockedFor:0,launchAt:null};state.ascentLaunch=0;
    hasDest=hasFocus=docking=false;spin.yaw=spin.pitch=spinPush.yaw=spinPush.pitch=lag.yaw=lag.pitch=0;pathCheckAt=0;pathIsClear=true;pathCheckPosition.copy(position);wake();return true;
  }
  function startDive(){syncPerspectiveSetting();ascent=null;state.ascentLaunch=0;surfaceLocked=false;base.y=0;halt();look.yaw=defaultYaw;look.pitch=-.18;state.yaw=look.yaw;state.pitch=look.pitch;state.mode='diver';captureRequired=true;state.exploring=false;setGuided(false);boost=spool=0;floorStale=true;
    // A dive may begin over a chosen site, and a guided one leaves the mouse free for the tour's own buttons.
    const options=pendingDive;pendingDive=null;if(options?.at){const at=coordinate(options.at);base.x=clamp(at[0],-bounds.x,bounds.x);base.z=clamp(at[2]??0,bounds.zMin,bounds.zMax);}
    offset.copy(base);
    if(options?.capture===false){captureRequired=false;state.exploring=true;}else recapture();wake();}
  function describeBody(pitch){moveOptions.radius=settings.collisionRadius;moveOptions.length=settings.collisionLength;moveOptions.yaw=look.yaw;moveOptions.pitch=pitch;moveOptions.padding=settings.collisionPadding;moveOptions.step=settings.collisionStep;moveOptions.iterations=settings.collisionIterations;}
  // Eases a vector off the surfaces near the body: toward each of them it keeps no more than `rate` times the clear water left.
  // With a velocity and a rate per second that is an approach that slows as it closes; with this step's displacement and a share of the gap, the same thing exactly.
  // Movement along a surface, or away from it, is never touched, so sliding stays free. Returns true if it took anything from a surface the body is all but resting on.
  function cushion(vector,rate){
    let pressed=false;
    for(let i=0;i<contact.count;i++){
      const nx=contact.normals[i*3],ny=contact.normals[i*3+1],nz=contact.normals[i*3+2],gap=Math.max(0,contact.gaps[i]),excess=-(vector.x*nx+vector.y*ny+vector.z*nz)-gap*rate;
      if(excess>0){vector.x+=nx*excess;vector.y+=ny*excess;vector.z+=nz*excess;if(gap<.06)pressed=true;}
    }
    return pressed;
  }
  // One collision-checked move of `position` by `step`; the reef takes whatever part of the velocity ran into it, and the follower's push in that direction goes with it.
  function moveBody(pitch){
    if(!(collisions&&settings.collisionEnabled)){position.add(step);state.colliding=false;state.contacts=0;return false;}
    describeBody(pitch);before.copy(velocity);const result=collisions.move(position,step,moveOptions,velocity);state.colliding=result.blocked;state.contacts=result.contacts;
    if(result.blocked){delta.copy(before).sub(velocity);const lost=delta.lengthSq();if(lost>1e-10){const into=thrust.dot(delta)/lost;if(into>0)thrust.addScaledVector(delta,-into);}}
    return result.blocked;
  }
  function probeMove(origin,displacement){const resultPos=origin.clone();if(collisions&&settings.collisionEnabled){const result=collisions.move(resultPos,displacement.clone(),{radius:settings.collisionRadius,length:settings.collisionLength,yaw:look.yaw,pitch:0,padding:settings.collisionPadding,step:settings.collisionStep,iterations:settings.collisionIterations},new THREE.Vector3());return {position:resultPos,blocked:result.blocked};}return {position:resultPos.add(displacement),blocked:false};}
  function verticalPathClear(current){if(!collisions||!settings.collisionEnabled)return true;scratchA.copy(current);while(scratchA.y<-.1){scratchB.copy(scratchA);scratchB.y=Math.min(0,scratchA.y+1);if(!collisions.segmentClear(scratchA,scratchB,settings.collisionRadius+.05))return false;scratchA.copy(scratchB);}return true;}
  function findAscentExit(current){if(!collisions)return null;const candidates=[];for(let r=3;r<=15;r+=3)for(let a=0;a<Math.PI*2;a+=Math.PI/4)candidates.push(new THREE.Vector3(current.x+Math.cos(a)*r,current.y,current.z+Math.sin(a)*r));candidates.sort((a,b)=>Math.hypot(a.x-current.x,a.z-current.z)-Math.hypot(b.x-current.x,b.z-current.z));for(const candidate of candidates){let p=current.clone(),ok=true;for(let i=0;i<Math.ceil(Math.max(0,-current.y)/1.25);i++){const next=new THREE.Vector3(candidate.x,Math.min(0,p.y+1.25),candidate.z),result=probeMove(p,next.clone().sub(p));if(result.blocked||result.position.distanceTo(next)>.2){ok=false;break;}p=result.position;}if(ok)return candidate;}return null;}
  // The ascent keeps the swim it started from and eases into the climb: a route to open water first if the reef gave one, then straight up, slowing near the surface.
  function updateAscent(dt){
    ascent.elapsed+=dt;position.set(base.x,base.y-8,base.z);desired.set(0,0,0);
    const segmentClear=(a,b)=>!collisions||collisions.segmentClear(scratchA.fromArray(a),scratchB.fromArray(b),Math.max(settings.collisionRadius+.25,settings.collisionLength/2+settings.collisionPadding+.15));
    if(ascent.returnViaReef&&ascent.waypoint<ascent.route.length){
      ascent.waypoint=routeTarget(state.returnRoute,ascent.waypoint,position.toArray(),2.8,segmentClear);
    }
    const routed=ascent.waypoint<ascent.route.length;
    state.returning=routed&&ascent.returnViaReef;
    if(routed){
      const point=ascent.route[ascent.waypoint];delta.copy(point).sub(position);const gap=delta.length(),final=ascent.waypoint===ascent.route.length-1;
      if(gap<(final?.25:1)&&(!final||velocity.length()<.5)){
        ascent.waypoint++;
        if(final&&ascent.returnViaReef){state.returnPhase='offer';state.safetyOfferRemaining=ascent.offerWait;}
      }
      else if(gap>.001){const cruise=ascent.returnViaReef?Math.min(10,settings.atlasCruiseSpeed*1.2):settings.ascentSpeed;desired.copy(delta).multiplyScalar(Math.min(cruise,gap*(final?1.2:2.5)+(final?0:.4))/gap);}
    }
    else if(ascent.returnViaReef&&state.returnPhase==='stop'){
      // Keep the diver at the return waypoint for as long as the stop is active.
      // Releasing the stop resumes ascent; it must not fall through on its own.
      const hold=ascent.route.at(-1);if(hold){delta.copy(hold).sub(position);delta.y=0;desired.copy(delta).multiplyScalar(1.5);}
    }
    else if(ascent.offerWait>0&&toDisplayDepth(-position.y)>=3&&toDisplayDepth(-position.y)<=5){
      state.returnPhase='offer';ascent.offerWait=Math.max(0,ascent.offerWait-dt);state.safetyOfferRemaining=ascent.offerWait;
      if(!ascent.offerWait)state.returnPhase='ascent';
      const hold=ascent.route.at(-1);desired.copy(hold).sub(position).multiplyScalar(1.5);
    }
    else if(position.y<0){
      if(ascent.launchAt===null)ascent.launchAt=ascent.elapsed;
      state.ascentLaunch=smoothstep(ascent.elapsed-ascent.launchAt,0,1.25);
      if(ascent.elapsed-pathCheckAt>.5||Math.hypot(position.x-pathCheckPosition.x,position.z-pathCheckPosition.z)>.35){pathIsClear=verticalPathClear(position);pathCheckAt=ascent.elapsed;pathCheckPosition.copy(position);}
      if(!pathIsClear){if(ascent.elapsed-ascent.exitSearchAt>.6){ascent.exitSearchAt=ascent.elapsed;const exit=findAscentExit(position);if(exit){ascent.route=[new THREE.Vector3(exit.x,position.y,exit.z)];ascent.waypoint=0;}}}
      else{
        const planned=Math.min(12,Math.max(settings.ascentSpeed,ascent.initialDepth/Math.max(.1,settings.ascentMaxDuration))),launch=smoothstep(ascent.elapsed-ascent.launchAt,0,.65);desired.y=Math.min(planned*(.2+.8*smoothstep(-position.y,0,settings.ascentSlowdown))*launch,-position.y*1.8+.06);
        // Coral overhead: sidle round it in a slow circle rather than nudging at random.
        if(ascent.blockedFor>0){ascent.blockedFor-=dt;desired.x=Math.cos(ascent.elapsed*1.7)*.9;desired.z=Math.sin(ascent.elapsed*1.7)*.9;}
      }
    }
    step.set(ease(velocity,thrust,'x',desired.x,ASCENT_RESPONSE,dt),ease(velocity,thrust,'y',desired.y,ASCENT_RESPONSE,dt),ease(velocity,thrust,'z',desired.z,ASCENT_RESPONSE,dt));
    // Keep the moving body below the waterline while it rounds the upper reef.
    // Upward momentum at a high waypoint must not finish the ascent mid-route.
    if(routed&&position.y+step.y> -1.8){step.y=-1.8-position.y;velocity.y=Math.min(0,velocity.y);thrust.y=0;}
    if(position.y+step.y>0)step.y=-position.y;
    if(moveBody(0)){
      if(routed){
        // Glancing contact can slide along a wall; it must not discard the trip home.
        ascent.blockedFor=velocity.length()<.3?ascent.blockedFor+dt:0;
        if(ascent.blockedFor>2){
          if(ascent.returnViaReef){
            const replanned=planSurfaceReturn(position.toArray(),{floor:terrain,clear:segmentClear,exits:ascent.routeProvider?.(position.clone())||[]});
            if(replanned.length){state.returnRoute=replanned;ascent.route=replanned.map(p=>new THREE.Vector3(...p));ascent.waypoint=0;ascent.launchAt=null;state.ascentLaunch=0;state.ascentBlocked=false;}
            else state.ascentBlocked=true;
          }else{const exit=findAscentExit(position);if(exit)ascent.route.splice(ascent.waypoint,0,new THREE.Vector3(exit.x,position.y,exit.z));}
          ascent.blockedFor=0;
        }
      }else{state.ascentBlocked=true;ascent.blockedFor=.8;}
    }else if(routed)ascent.blockedFor=0;
    if(state.returning&&Math.hypot(velocity.x,velocity.z)>.2)look.yaw+=wrap(Math.atan2(-velocity.x,-velocity.z)-look.yaw)*(1-Math.exp(-dt*3));
    base.set(position.x,position.y+8,position.z);state.ascentDepth=Math.max(0,-position.y);state.ascentProgress=ascent.initialDepth?1-state.ascentDepth/ascent.initialDepth:1;
    if(position.y>=-.025){base.y=8;ascent=null;state.returning=false;state.returnPhase=null;state.safetyOfferRemaining=0;surfaceLocked=true;look.yaw=defaultYaw;look.pitch=0;state.ascentProgress=1;state.ascentLaunch=1;state.mode='surface';state.exploring=false;captureRequired=true;clear();halt();}
  }
  // Mouse and touch aim for this step. Raw, it is applied whole. Smoothed, the input is taken as spread evenly over the step and what has not been shown yet is carried in `lag`: the exact answer of a first-order follower to a steady movement, at any frame rate.
  function settleAim(key,dt,raw){
    const input=pend[key];pend[key]=0;
    if(raw||dt<=0){const out=lag[key]+input;lag[key]=0;return out;}
    const span=settings.lookResponse*dt,decay=Math.exp(-span);let rest=lag[key]*decay+(span>1e-6?input*(1-decay)/span:input);if(Math.abs(rest)<1e-6)rest=0;
    const out=lag[key]+input-rest;lag[key]=rest;return out;
  }
  // The seabed under the body: the terrain under its middle and under both ends of the capsule, plus the clearance.
  function measureFloor(){
    const half=Math.max(0,settings.collisionLength/2-settings.collisionRadius),cosine=Math.cos(look.pitch),fx=-Math.sin(look.yaw)*cosine*half,fz=-Math.cos(look.yaw)*cosine*half,fy=Math.sin(look.pitch)*half,clearance=settings.floorClearance;
    floorY=Math.max(terrain(base.x,base.z)+clearance,terrain(base.x-fx,base.z-fz)+clearance+fy,terrain(base.x+fx,base.z+fz)+clearance-fy,bounds.yMin-8)+8;floorStale=false;
  }
  function update(dt,submerged,instant=false,routeProvider){
    syncPerspectiveSetting();
    lastSubmerged=submerged;calm=instant||motionPaused;
    if(gamepad.connected){gamepad.poll(pad,settings.stickDeadZone);if(pad.active)state.device='gamepad';}else if(pad.active){pad.active=pad.scooter=false;pad.x=pad.y=pad.lookX=pad.lookY=pad.rise=pad.sink=0;}
    const diving=submerged&&!surfaceLocked&&!ascent&&!suspended;
    // A stick held over is deliberate input for as long as it is held, the way a held key repeats: it wakes the controls and keeps the autopilot off.
    const analog=!suspended&&!ascent&&(pad.active||(stick.active&&diving));
    if(analog){if(captureRequired&&(diving||pad.active)){captureRequired=false;state.exploring=true;}if(!engaged||hasDest||hasFocus||docking||guided)takeControl();engaged=true;}else engaged=false;
    const live=analog&&!captureRequired,rising=keys.has('Space')||(live&&pad.rise>.5);
    if(!ascent&&!surfaceLocked&&submerged&&!hasDest&&rising&&base.y-8>=-settings.ascentThreshold){beginAscent(routeProvider);}
    if(ascent&&!suspended)updateAscent(dt);
    if(!submerged&&keys.size)for(const code of keys)if(!surfaceLocked||!code.startsWith('Arrow'))keys.delete(code);
    if(!submerged&&!ascent&&surfaceLocked){state.mode='surface';}
    if(submerged&&!ascent&&state.mode==='surface'&&!surfaceLocked){state.mode='diver';}
    const manual=keys.size>0||live;
    if(guided){slack=Math.max(0,slack-dt*140);if(freeControl&&captureRequired&&!suspended&&!ascent&&!surfaceLocked&&submerged){captureRequired=false;state.exploring=true;}}
    let yawStep=0;
    if(!ascent){
      const limit=settings.pitchLimit*RAD,turnMode=settings.keyboardMode==='turn',yawBefore=look.yaw;
      // --- what is being asked for ---
      const side=clamp(Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+(live&&diving?stick.x+pad.x:0),-1,1);
      let forward=clamp(Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+(live&&diving?stick.y+pad.y:0),-1,1),vertical=clamp(Number(keys.has('Space'))-Number(keys.has('ShiftLeft')||keys.has('ShiftRight'))+(live&&diving?pad.rise-pad.sink:0),-1,1),strafe=turnMode?0:side;
      // A fast swim turns a little wider: the scooter trades a quarter of the turn rate for its speed.
      const yawAsk=(Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')))*settings.keyTurnSpeed-(live?pad.lookX:0)*settings.gamepadLookSpeed-(!surfaceLocked&&turnMode?side:0)*settings.turnSpeed*(1-.25*boost);
      const pitchAsk=(Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*settings.keyLookSpeed+(live?pad.lookY:0)*settings.gamepadLookSpeed*.7*(settings.invertMouse?-1:1);
      if(pitchAsk||(live&&pad.lookX))lookIdle=0;
      const traveling=hasDest&&submerged&&!suspended;
      // The scooter is a boost, not a motor: E multiplies the pace of a swim already under way (W, S or the autopilot).
      // Held by itself on a keyboard it only spools; on the touch deck, where two buttons are hard to hold, it swims forward too.
      const scooting=(keys.has('KeyE')||(live&&pad.scooter))&&submerged&&!surfaceLocked&&!suspended;
      if(scooting&&padKeys.has('KeyE')&&!traveling&&forward===0)forward=1;
      const boosting=scooting&&(forward!==0||traveling);if(boosting)coast=traveling?0:forward;
      // The boost eases in and out so the speed never steps; a waiting scooter idles at a fraction of it, which the bubbles, the lens and the motor hum pick up.
      boost+=(Number(boosting)-boost)*(1-Math.exp(-dt*(boosting?3.2:2.4)));if(boost<.002&&!boosting)boost=0;
      spool+=((scooting&&!boosting?.16:0)-spool)*(1-Math.exp(-dt*3));if(spool<.002)spool=0;state.scooter=Math.max(boost,spool);
      // Letting go of the swim key coasts to a stop rather than braking; the autopilot arrives without drifting on.
      if(!boosting&&forward===0&&!traveling&&submerged&&!surfaceLocked)forward=coast*boost;
      // --- autopilot: where to swim and where to look ---
      let steering=false,autoLook=false,goalYaw=look.yaw,goalPitch=0;
      if(traveling){delta.copy(dest).sub(base);if(delta.length()<settings.travelArrival){hasDest=false;docking=true;dockTime=0;}}
      if((hasDest||docking)&&submerged&&!suspended){
        steering=true;autoLook=true;const cruise=travelSpeed||settings.atlasCruiseSpeed,rate=cruise/Math.max(.1,settings.travelSlowdown);
        if(docking){
          // Inside the arrival distance the diver settles onto the point itself rather than coasting past it.
          delta.copy(dest).sub(base);const gap=delta.length();dockTime+=dt;desired.copy(delta).multiplyScalar(rate);
          if((gap<.03&&velocity.lengthSq()<.0009)||dockTime>5||(state.colliding&&dockTime>.5)){docking=false;desired.set(0,0,0);}
          if(!hasFocus){autoLook=false;}
        }else{
          // The route clears the highest ground on the straight line to the point.
          let routeY=dest.y;
          if(travelRoute.length){
            routePosition[0]=base.x;routePosition[1]=base.y-8;routePosition[2]=base.z;
            travelIndex=routeTarget(travelRoute,travelIndex,routePosition,Math.min(4,2+velocity.length()*.3),travelClear);
            const target=travelRoute[travelIndex];curveTarget.set(target[0],target[1]+8,target[2]);routeY=target[1]+8;
          }else{
          for(let i=1;i<=16;i++){const t=i/16,x=base.x+(dest.x-base.x)*t,z=base.z+(dest.z-base.z)*t;routeY=Math.max(routeY,terrain(x,z)+settings.floorClearance+8);}
          routeY=Math.min(routeY,8-settings.ascentThreshold-1);
          curveTarget.copy(dest);
          // A short look-ahead along a shallow arc gives long atlas legs a swim
          // rather than a ruler-straight camera rail. Tight passages stay straight.
          if(!calm&&travelSpan>16){
            const dx=dest.x-travelStart.x,dz=dest.z-travelStart.z;
            const progress=clamp(((base.x-travelStart.x)*dx+(base.z-travelStart.z)*dz)/(travelSpan*travelSpan),0,1);
            const t=Math.min(1,progress+10/travelSpan),arc=Math.sin(Math.PI*t)*Math.min(2.2,travelSpan*.045);
            curveTo.set(travelStart.x+dx*t-dz/travelSpan*arc,routeY-8,travelStart.z+dz*t+dx/travelSpan*arc);
            curveProbe-=dt;
            if(curveProbe<=0){curveProbe=.25;curveFrom.set(base.x,base.y-8,base.z);curveClear=!collisions||!settings.collisionEnabled||collisions.segmentClear(curveFrom,curveTo,settings.collisionRadius+.45);}
            if(curveClear){curveTarget.x=curveTo.x;curveTarget.z=curveTo.z;routeY=Math.max(routeY,terrain(curveTarget.x,curveTarget.z)+settings.floorClearance+8);}
          }
          }
          delta.set(curveTarget.x-base.x,routeY-base.y,curveTarget.z-base.z);const distance=delta.length();
          if(distance>.001){
            delta.multiplyScalar(1/distance);
            // The commanded course swings round to a new bearing instead of jumping to it, and is the bearing itself over the last metre.
            if(!coursed){if(velocity.lengthSq()>.16)course.copy(velocity).normalize();else course.copy(delta);coursed=true;}
            course.lerp(delta,Math.max(1-Math.exp(-dt*COURSE_RATE),1-smoothstep(distance,1,4)));if(course.lengthSq()<1e-6)course.copy(delta);else course.normalize();
            // The pace builds at a set acceleration, eases through a turn, and brakes at a set deceleration into a proportional last stretch.
            // A waypoint without a subject is one to pass through: it only slows the swim if the caller never sends the next one.
            pace=Math.min(cruise,pace+AUTO_ACCEL*dt);
            const remaining=travelRoute.length?distance+travelRemaining[travelIndex]:distance;
            state.travelRemaining=remaining;
            const allowed=Math.min(pace*(.55+.45*Math.max(0,course.dot(delta))),hasFocus?Math.min(rate*remaining,Math.sqrt(2*AUTO_BRAKE*remaining)+.2):rate*remaining*2);
            desired.copy(course).multiplyScalar(allowed*(1+(settings.scooterBoost-1)*boost));
          }else desired.set(0,0,0);
          // Look where the swim is going, a little down or up the slope of it.
          const flat=Math.hypot(course.x,course.z);
          if(flat>.2)goalYaw=Math.atan2(-course.x,-course.z);else if(Math.hypot(dest.x-base.x,dest.z-base.z)>.6)goalYaw=Math.atan2(-(dest.x-base.x),-(dest.z-base.z));
          goalPitch=clamp(Math.asin(clamp(course.y,-1,1))*.45,-.38,.38);
        }
        forward=vertical=strafe=0;
      }
      // The subject of a stop: the look turns to it over the last few metres of the approach and holds it afterwards.
      if(hasFocus&&submerged&&!suspended){
        const fx=focus.x-base.x,fy=focus.y-(base.y-8),fz=focus.z-base.z,horizontal=Math.hypot(fx,fz);
        if(fx*fx+fy*fy+fz*fz>.01){
          const weight=hasDest?1-smoothstep(base.distanceTo(dest),settings.travelArrival,FOCUS_RANGE):1,focusYaw=Math.atan2(-fx,-fz),focusPitch=clamp(Math.atan2(fy,horizontal),-limit,limit);
          goalYaw+=wrap(focusYaw-goalYaw)*weight;goalPitch+=(focusPitch-goalPitch)*weight;autoLook=true;
        }
      }
      // --- the view ---
      if(autoLook){
        // A guided camera turns slowly enough to read as a sweep rather than a snap, and a long turn is held to a steady rate.
        const frequency=guided?LOOK_GUIDED:LOOK_AUTO,reach=(guided?SWEEP_GUIDED:SWEEP_AUTO)*Math.E/frequency,turn=wrap(goalYaw-look.yaw);
        if(instant){look.yaw+=turn;look.pitch=goalPitch;spin.yaw=spin.pitch=0;}
        else{ease(look,spin,'yaw',look.yaw+clamp(turn,-reach,reach),frequency,dt);ease(look,spin,'pitch',goalPitch,frequency,dt);}
        spinPush.yaw=spinPush.pitch=lag.yaw=lag.pitch=pend.yaw=pend.pitch=0;
      }else{
        const frequency=T90/Math.max(.03,settings.turnEase),raw=instant||!settings.mouseSmoothing;
        const turned=ease(spin,spinPush,'yaw',yawAsk,frequency,dt)+settleAim('yaw',dt,raw),tilted=ease(spin,spinPush,'pitch',pitchAsk,frequency,dt)+settleAim('pitch',dt,raw);
        if(!yawAsk&&Math.abs(spin.yaw)<1e-4&&Math.abs(spinPush.yaw)<1e-3)spin.yaw=spinPush.yaw=0;
        if(!pitchAsk&&Math.abs(spin.pitch)<1e-4&&Math.abs(spinPush.pitch)<1e-3)spin.pitch=spinPush.pitch=0;
        look.yaw+=turned;look.pitch=soften(look.pitch,tilted,limit,Math.min(PITCH_ZONE,limit*.5));
        // Optional: with no aim input for a few seconds of swimming, the view drifts back to level.
        lookIdle+=dt;
        if(settings.depthAssist&&lookIdle>3&&forward!==0&&!surfaceLocked)look.pitch*=Math.exp(-dt*.9*smoothstep(lookIdle,3,4.5));
      }
      yawStep=look.yaw-yawBefore;
      // --- the swim ---
      const f=forward*(forward<0?settings.reverseMultiplier:1)*(1+(settings.scooterBoost-1)*boost),s=strafe*settings.strafeMultiplier,swimPitch=settings.swimTowardLook?look.pitch:look.pitch*boost;
      if(!steering){
        const sinYaw=Math.sin(look.yaw),cosYaw=Math.cos(look.yaw),level=Math.cos(swimPitch);
        desired.set((-sinYaw*level*f+cosYaw*s)*settings.swimSpeed,Math.sin(swimPitch)*f*settings.swimSpeed+vertical*settings.verticalSpeed,(-cosYaw*level*f-sinYaw*s)*settings.swimSpeed);
        const inputLength=Math.hypot(forward,strafe,vertical);if(inputLength>1)desired.divideScalar(inputLength);
      }
      const afloat=submerged&&!surfaceLocked;
      if(!afloat||suspended||(captureRequired&&!steering))desired.set(0,0,0);if(surfaceLocked){velocity.set(0,0,0);thrust.set(0,0,0);}
      if(floorStale)measureFloor();
      // Limits ask for a slower approach the closer they are, so the diver arrives at them instead of hitting them.
      // The seabed is also read where the swim will be in half a second: the diver has to be over that ground by the time it gets there, which lifts it up a slope at the slope's own rate.
      const ceiling=8-Math.min(1,settings.ascentThreshold*.6),floorAhead=afloat?terrain(base.x+velocity.x*LOOK_AHEAD,base.z+velocity.z*LOOK_AHEAD)+settings.floorClearance+8:-Infinity;
      if(afloat){
        desired.x=clamp(desired.x,(-bounds.x-base.x)*SOFT_RATE,(bounds.x-base.x)*SOFT_RATE);desired.z=clamp(desired.z,(bounds.zMin-base.z)*SOFT_RATE,(bounds.zMax-base.z)*SOFT_RATE);
        desired.y=Math.min(Math.max(desired.y,(floorY-base.y)*SOFT_RATE,(floorAhead-base.y)/LOOK_AHEAD),Math.max(0,ceiling-base.y)*SOFT_RATE);
      }
      // The reef gets the same courtesy: the nearer a surface, the slower the swim may close on it, so the diver settles against coral instead of bumping it.
      position.set(base.x,base.y-8,base.z);contact.count=0;let pressed=false;
      if(afloat&&settings.collisionEnabled&&collisions?.nearby){
        const reach=Math.min(3,Math.max(velocity.length()/HARD_RATE,desired.length()/SOFT_RATE)+.1);
        if(reach>.15){describeBody(look.pitch);collisions.nearby(position,moveOptions,reach,contact);pressed=cushion(desired,SOFT_RATE);}
      }
      // Momentum follows part of a turn, so a turning swim carves a curve instead of sliding sideways through it. A flick of the mouse carves no more than a brisk turn would.
      if(!steering&&settings.carve>0&&yawStep){const angle=clamp(yawStep,-CARVE_RATE*dt,CARVE_RATE*dt)*settings.carve,sine=Math.sin(angle),cosine=Math.cos(angle);let x=velocity.x,z=velocity.z;velocity.x=x*cosine+z*sine;velocity.z=z*cosine-x*sine;x=thrust.x;z=thrust.z;thrust.x=x*cosine+z*sine;thrust.z=z*cosine-x*sine;}
      const response=steering?AUTO_RESPONSE:desired.lengthSq()>1e-6?settings.acceleration:settings.deceleration;
      step.set(ease(velocity,thrust,'x',desired.x,response,dt),ease(velocity,thrust,'y',desired.y,response*VERTICAL,dt),ease(velocity,thrust,'z',desired.z,response,dt));
      if(desired.lengthSq()<1e-8&&velocity.lengthSq()<1e-5&&thrust.lengthSq()<1e-4){velocity.set(0,0,0);thrust.set(0,0,0);}
      if(afloat){
        // The same limits as a last word on the step itself: whatever the follower still carries, this step closes no more than its share of the room left.
        const share=1-Math.exp(-HARD_RATE*dt);let room=(bounds.x-base.x)*share;
        if(step.x>room){step.x=room;velocity.x=Math.min(velocity.x,(bounds.x-base.x)*HARD_RATE);thrust.x=Math.min(thrust.x,0);}
        room=(-bounds.x-base.x)*share;if(step.x<room){step.x=room;velocity.x=Math.max(velocity.x,(-bounds.x-base.x)*HARD_RATE);thrust.x=Math.max(thrust.x,0);}
        room=(bounds.zMax-base.z)*share;if(step.z>room){step.z=room;velocity.z=Math.min(velocity.z,(bounds.zMax-base.z)*HARD_RATE);thrust.z=Math.min(thrust.z,0);}
        room=(bounds.zMin-base.z)*share;if(step.z<room){step.z=room;velocity.z=Math.max(velocity.z,(bounds.zMin-base.z)*HARD_RATE);thrust.z=Math.max(thrust.z,0);}
        room=Math.max((floorY-base.y)*share,(floorAhead-base.y)*(1-Math.exp(-dt/LOOK_AHEAD)));if(step.y<room){step.y=room;velocity.y=Math.max(velocity.y,(floorY-base.y)*HARD_RATE,(floorAhead-base.y)/LOOK_AHEAD);thrust.y=Math.max(thrust.y,0);}
        room=Math.max(0,ceiling-base.y)*share;if(step.y>room&&base.y<=ceiling+.001){step.y=room;velocity.y=Math.min(velocity.y,(ceiling-base.y)*HARD_RATE);thrust.y=Math.min(thrust.y,0);}
        if(contact.count){
          cushion(step,share);
          for(let i=0;i<contact.count;i++){
            const nx=contact.normals[i*3],ny=contact.normals[i*3+1],nz=contact.normals[i*3+2],excess=-(velocity.x*nx+velocity.y*ny+velocity.z*nz)-Math.max(0,contact.gaps[i])*HARD_RATE;
            if(excess>0){velocity.x+=nx*excess;velocity.y+=ny*excess;velocity.z+=nz*excess;const push=-(thrust.x*nx+thrust.y*ny+thrust.z*nz);if(push>0){thrust.x+=nx*push;thrust.y+=ny*push;thrust.z+=nz*push;}}
          }
        }
      }
      state.colliding=false;state.contacts=0;
      if(submerged)moveBody(look.pitch);else position.add(step);
      if(pressed)state.colliding=true;
      base.copy(position);base.y+=8;measureFloor();
      // The hard stops behind the soft ones: the world's edge, the surface, and half a metre under the seabed clearance.
      const minY=floorY-FLOOR_GIVE,maxY=8;
      if(Math.abs(base.x)>bounds.x){base.x=clamp(base.x,-bounds.x,bounds.x);velocity.x=thrust.x=0;}
      if(base.z<bounds.zMin||base.z>bounds.zMax){base.z=clamp(base.z,bounds.zMin,bounds.zMax);velocity.z=thrust.z=0;}
      if(base.y<minY){base.y=minY;velocity.y=Math.max(0,velocity.y);thrust.y=Math.max(0,thrust.y);}else if(base.y>maxY){base.y=maxY;velocity.y=Math.min(0,velocity.y);thrust.y=Math.min(0,thrust.y);}
      state.atBoundary=Math.abs(base.x)>=bounds.x-.25||base.z<=bounds.zMin+.25||base.z>=bounds.zMax-.25||(afloat&&(base.y<=floorY+.06||base.y>=ceiling-.06))||base.y>=maxY;
      if(hasDest&&state.colliding&&velocity.length()<.15){blockedTime+=dt;if(blockedTime>2){hasDest=false;state.travelBlocked=true;}}else blockedTime=0;
    }
    state.speed=velocity.length();
    // --- what the body shows of it: a bank into the turn, a tip into a climb, and a slow life of its own when hovering ---
    const turnNow=dt>0?clamp(yawStep/dt,-2.5,2.5):0;state.turnRate+=(turnNow-state.turnRate)*(1-Math.exp(-dt*9));if(Math.abs(state.turnRate)<1e-4&&!turnNow)state.turnRate=0;
    const showing=!calm&&!ascent&&!surfaceLocked&&submerged,pace01=Math.min(1,state.speed/Math.max(.5,settings.swimSpeed));
    ease(bank,bankRate,'roll',showing?clamp(state.turnRate*.12*(.35+.65*pace01)*settings.bank,-.45,.45):0,6,dt);
    ease(bank,bankRate,'lead',showing?clamp(velocity.y*.09,-.25,.25):0,5,dt);
    if(Math.abs(bank.roll)<1e-4&&Math.abs(bankRate.roll)<1e-3&&!state.turnRate)bank.roll=bankRate.roll=0;
    // (It fades in and out through the same follower as everything else, so taking the controls never tugs the diver.)
    const hovering=showing&&!manual&&!hasDest&&state.speed<.3&&!suspended?1:0;ease(hover,hoverRate,'idle',hovering,hovering?1.3:3.2,dt);if(hover.idle<.0005&&!hovering)hover.idle=hoverRate.idle=0;
    const idle=hover.idle,amount=idle*settings.idleMotion;
    if(amount>0){
      // A breath every five and a half seconds lifts and lowers the diver; a slower wander and sway stand in for the current.
      breath+=dt*1.14;sway+=dt*.82;wander+=dt*.57;
      drift.set(Math.sin(wander)*.035*amount,Math.sin(breath)*.045*amount,Math.cos(wander*.8+1.3)*.035*amount);state.lean=Math.sin(sway)*.02*amount;
    }else{drift.set(0,0,0);state.lean=0;}
    offset.copy(base).add(drift);
    state.roll=bank.roll;state.pitchLead=bank.lead;state.idle=idle;
    state.offset=offset;state.yaw=look.yaw;state.pitch=look.pitch;state.travelling=hasDest;state.manualInput=manual;
    const ascentMoving=Boolean(ascent)&&!(ascent.returnViaReef&&(state.returnPhase==='offer'||state.returnPhase==='stop')&&state.speed<.05);
    state.moving=manual||state.speed>.015||Math.abs(spin.yaw)+Math.abs(spin.pitch)>.0005||Math.abs(lag.yaw)+Math.abs(lag.pitch)>.0002||Math.abs(bank.roll)>.0005||docking||ascentMoving;
    state.transition=Boolean(ascent);state.mode=ascent?'transition':surfaceLocked?'surface':submerged?'diver':'surface';state.exploring=state.exploring&&!suspended&&!captureRequired;
    return state;
  }
  // QA hook: scripted aim (pixels) and a scripted thumb-stick, for checks where no pointer can be captured.
  window.oceanInput={aim:(dx,dy)=>aim(dx,dy),axis(x=0,y=0){stick.x=clamp(x,-1,1);stick.y=clamp(y,-1,1);stick.active=Boolean(x||y);if(stick.active&&state.mode==='diver'&&!suspended){captureRequired=false;state.exploring=true;}wake();},pad,stick,get gamepad(){return gamepad.connected;}};
  return {state,update,reset,returnToSurface,startDive,prepareDive,travel,travelPath,cancelTravel,stopTravel:cancelTravel,place,setGuided,setLamp,frameSky,setTerrain,setCollisions,suspend,setInterfaceOpen,beginAscent,holdSafetyStop,skipSafetyStop,togglePerspective,toggleFreeCam,setFreeCam:value=>toggleFreeCam(value),recapture,getPlayerPosition,getCameraPose:()=>({perspective:state.perspective}),bounds,destroy(){cleanup.forEach(fn=>fn());}};
}
