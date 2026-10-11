import * as THREE from './vendor/three.module.min.js';
import { settings as savedSettings } from './movement-settings.js';

// Navigation is always stored in world metres. The camera follows the diver;
// perspective only changes how the world renders around that same position.
export function createExploration(canvas, wake, settings=savedSettings) {
  const keys=new Set(),offset=new THREE.Vector3(0,8,0),velocity=new THREE.Vector3(),desired=new THREE.Vector3();
  const zero=new THREE.Vector3(),delta=new THREE.Vector3(),position=new THREE.Vector3(),step=new THREE.Vector3(),body=new THREE.Vector3();
  const bounds={x:62,zMin:-105,zMax:35,yMin:-52,yMax:8};
  const initialPerspective=settings.cameraMode==='third'?'third':'first';
  let syncedCameraMode=initialPerspective;
  const state={offset,yaw:0,pitch:0,perspective:initialPerspective,moving:false,exploring:false,speed:0,atBoundary:false,colliding:false,mode:'surface',transition:false,ascentProgress:0,ascentDepth:0};
  let yaw=0,pitch=0,targetYaw=0,targetPitch=0,defaultYaw=0,destination=null,travelFocus=null,terrain=()=>-15,collisions=null;
  let suspended=false,captureRequired=true,lastPointer=null,touchId=null,blockedTime=0,ascent=null,lastSubmerged=false,surfaceLocked=true,intentionalUnlock=false,pathCheckAt=0,pathCheckPosition=new THREE.Vector3(),pathIsClear=true;
  const cleanup=[],controls=new Set(['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  function listen(target,event,handler){target.addEventListener(event,handler);cleanup.push(()=>target.removeEventListener(event,handler));}
  function releasePointer(){if(document.pointerLockElement===canvas){intentionalUnlock=true;document.exitPointerLock();}}
  function press(code){if(ascent||(!lastSubmerged&&!surfaceLocked)||(surfaceLocked&&!code.startsWith('Arrow')))return;keys.add(code);destination=null;travelFocus=null;wake();}
  function clear(){keys.clear();lastPointer=null;touchId=null;velocity.set(0,0,0);wake();}
  function requireRecapture(){captureRequired=true;clear();releasePointer();state.exploring=false;}
  function recapture(){if(suspended||ascent)return false;captureRequired=false;state.exploring=true;canvas.focus({preventScroll:true});if(settings.pointerLock){try{const result=canvas.requestPointerLock();result?.catch(()=>{state.pointerLockFailed=true;wake();});}catch{state.pointerLockFailed=true;}}wake();return true;}
  function syncPerspectiveSetting(){if(settings.cameraMode!==syncedCameraMode){state.perspective=settings.cameraMode==='third'?'third':'first';syncedCameraMode=state.perspective;}}
  function togglePerspective(value){if(state.mode==='surface'||ascent)return state.perspective==='third';state.perspective=value===undefined?(state.perspective==='first'?'third':'first'):(value?'third':'first');settings.cameraMode=state.perspective;syncedCameraMode=state.perspective;wake();return state.perspective==='third';}
  function toggleFreeCam(value){return togglePerspective(value);}
  function playerPosition(){return new THREE.Vector3(offset.x,offset.y-8,offset.z);}
  listen(window,'keydown',e=>{
    if(e.code==='Escape'){requireRecapture();return;}
    if(e.target.closest?.('input,textarea,select,button,[contenteditable="true"]'))return;
    if(e.code==='KeyV'&&!suspended&&!e.repeat&&lastSubmerged){e.preventDefault();togglePerspective();return;}
    if(suspended||captureRequired||!controls.has(e.code))return;
    e.preventDefault();press(e.code);
  });
  listen(window,'keyup',e=>{keys.delete(e.code);wake();});
  listen(window,'blur',requireRecapture);
  listen(document,'visibilitychange',()=>{if(document.hidden)requireRecapture();});
  function aim(dx,dy){if(suspended||captureRequired||!state.exploring)return;travelFocus=null;targetYaw-=dx*settings.mouseSensitivity;targetPitch-=dy*settings.mouseSensitivity*(settings.invertMouse?-1:1);destination=null;wake();}
  listen(canvas,'pointerdown',e=>{if(suspended||ascent)return;if(e.pointerType==='touch'){captureRequired=false;state.exploring=true;touchId=e.pointerId;canvas.setPointerCapture(e.pointerId);lastPointer={x:e.clientX,y:e.clientY};wake();return;}recapture();lastPointer={x:e.clientX,y:e.clientY};});
  listen(canvas,'pointermove',e=>{if(suspended||captureRequired)return;if(document.pointerLockElement===canvas){aim(e.movementX,e.movementY);return;}if(e.pointerType==='touch'&&e.pointerId!==touchId)return;if(settings.pointerLock&&e.pointerType!=='touch'&&!state.pointerLockFailed)return;if(lastPointer)aim(e.clientX-lastPointer.x,e.clientY-lastPointer.y);lastPointer={x:e.clientX,y:e.clientY};});
  listen(canvas,'pointerleave',()=>{if(touchId===null)lastPointer=null;});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(canvas,event,()=>{touchId=null;lastPointer=null;});
  listen(document,'pointerlockchange',()=>{lastPointer=null;const locked=document.pointerLockElement===canvas;if(state.pointerLocked&&!locked){const intentional=intentionalUnlock;intentionalUnlock=false;state.pointerLocked=false;if(!intentional)requireRecapture();}else{state.pointerLocked=locked;if(locked)intentionalUnlock=false;}wake();});
  listen(document,'pointerlockerror',()=>{state.pointerLockFailed=true;wake();});
  document.querySelectorAll('[data-swim]').forEach(button=>{
    const surfaceLook=()=>state.mode==='surface'&&button.dataset.swim.startsWith('Arrow');
    const allowed=()=>!suspended&&!ascent&&(state.mode==='diver'||surfaceLook());
    function activateSurfaceLook(){if(surfaceLook()){captureRequired=false;state.exploring=true;}}
    listen(button,'pointerdown',e=>{if(!allowed())return;activateSurfaceLook();if(captureRequired&&e.pointerType==='touch'){captureRequired=false;state.exploring=true;}if(captureRequired)return;e.preventDefault();button.setPointerCapture(e.pointerId);press(button.dataset.swim);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(button,event,()=>{keys.delete(button.dataset.swim);wake();});
    listen(button,'keydown',e=>{if(allowed()&&(e.code==='Space'||e.code==='Enter')){activateSurfaceLook();if(captureRequired)return;e.preventDefault();press(button.dataset.swim);}});
    listen(button,'keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();keys.delete(button.dataset.swim);wake();}});
    listen(button,'blur',()=>{keys.delete(button.dataset.swim);wake();});
    listen(button,'click',e=>{if(e.detail===0&&allowed()){activateSurfaceLook();if(captureRequired)return;press(button.dataset.swim);setTimeout(()=>{keys.delete(button.dataset.swim);wake();},450);}});
  });
  function reset(){offset.set(0,lastSubmerged?0:8,0);velocity.set(0,0,0);yaw=targetYaw=defaultYaw;pitch=targetPitch=0;destination=null;travelFocus=null;blockedTime=0;state.travelBlocked=false;ascent=null;surfaceLocked=!lastSubmerged;state.mode=lastSubmerged?'diver':'surface';requireRecapture();}
  function frameSky(value){defaultYaw=value;if(!state.exploring){yaw=targetYaw=value;state.yaw=value;}}
  function setTerrain(fn){if(typeof fn==='function')terrain=fn;}
  function setCollisions(value){collisions=value;}
  function suspend(value){suspended=Boolean(value);clear();if(value)requireRecapture();}
  function setInterfaceOpen(value){if(value)suspend(true);else{suspended=false;requireRecapture();}}
  function travel(point,focusPoint){const coordinate=value=>Array.isArray(value)?value:[value.x,value.y,value.z];const target=coordinate(point),safeMaxY=8-settings.ascentThreshold-1;destination=new THREE.Vector3(THREE.MathUtils.clamp(target[0],-bounds.x,bounds.x),THREE.MathUtils.clamp((target[1]??-8)+8,bounds.yMin,safeMaxY),THREE.MathUtils.clamp(target[2]??0,bounds.zMin,bounds.zMax));travelFocus=focusPoint?(Array.isArray(focusPoint)?new THREE.Vector3(...focusPoint):focusPoint.clone()):null;targetPitch=0;blockedTime=0;state.travelBlocked=false;state.exploring=true;wake();}
  function beginAscent(routeProvider){if(ascent||state.mode==='surface')return false;clear();state.mode='transition';releasePointer();const start=playerPosition();let route=[];try{route=routeProvider?.(start.clone())||[];}catch{}ascent={start,route:route.map(p=>p.isVector3?p.clone():new THREE.Vector3(...p)),started:0,initialDepth:Math.max(0,-start.y),elapsed:0,waypoint:0};pathCheckAt=0;pathIsClear=true;pathCheckPosition.copy(start);wake();return true;}
  function startDive(){syncPerspectiveSetting();ascent=null;surfaceLocked=false;offset.y=0;velocity.set(0,0,0);yaw=targetYaw=defaultYaw;pitch=targetPitch=-.18;state.yaw=yaw;state.pitch=pitch;state.mode='diver';captureRequired=true;state.exploring=false;recapture();wake();}
  function checkedMove(origin,displacement,instantly=false){const resultPos=origin.clone(),vel=instantly?new THREE.Vector3():velocity;if(collisions&&settings.collisionEnabled){const result=collisions.move(resultPos,displacement.clone(),{radius:settings.collisionRadius,length:settings.collisionLength,yaw,pitch:0,padding:settings.collisionPadding,step:settings.collisionStep,iterations:settings.collisionIterations},vel);return {position:resultPos,blocked:result.blocked};}return {position:resultPos.add(displacement),blocked:false};}
  function verticalPathClear(current){if(!collisions||!settings.collisionEnabled)return true;let from=current.clone();while(from.y<-.1){const to=from.clone();to.y=Math.min(0,from.y+1);if(!collisions.segmentClear(from,to,settings.collisionRadius+.05))return false;from=to;}return true;}
  function findAscentExit(current){if(!collisions)return null;const candidates=[];for(let r=3;r<=15;r+=3)for(let a=0;a<Math.PI*2;a+=Math.PI/4)candidates.push(new THREE.Vector3(current.x+Math.cos(a)*r,current.y,current.z+Math.sin(a)*r));candidates.sort((a,b)=>Math.hypot(a.x-current.x,a.z-current.z)-Math.hypot(b.x-current.x,b.z-current.z));for(const candidate of candidates){let p=current.clone(),ok=true;for(let i=0;i<Math.ceil(Math.max(0,-current.y)/1.25);i++){const next=new THREE.Vector3(candidate.x,Math.min(0,p.y+1.25),candidate.z),result=checkedMove(p,next.clone().sub(p),true);if(result.blocked||result.position.distanceTo(next)>.2){ok=false;break;}p=result.position;}if(ok)return candidate;}return null;}
  function updateAscent(dt,routeProvider){
    ascent.elapsed+=dt;let current=playerPosition();
    if(ascent.waypoint<ascent.route.length){const point=ascent.route[ascent.waypoint];delta.copy(point).sub(current);if(delta.length()<.55){ascent.waypoint++;}else{delta.setLength(Math.min(delta.length(),settings.ascentSpeed*dt));const result=checkedMove(current,delta);current.copy(result.position);if(result.blocked)ascent.route=[];}}
    else if(current.y<0){
      if(ascent.elapsed-pathCheckAt>.5||Math.hypot(current.x-pathCheckPosition.x,current.z-pathCheckPosition.z)>.35){pathIsClear=verticalPathClear(current);pathCheckAt=ascent.elapsed;pathCheckPosition.copy(current);}
      if(!pathIsClear){if(ascent.elapsed-(ascent.exitSearchAt||0)>.6){ascent.exitSearchAt=ascent.elapsed;const exit=findAscentExit(current);if(exit){ascent.route=[new THREE.Vector3(exit.x,current.y,exit.z)];ascent.waypoint=0;}}}
      else{const planned=Math.min(12,Math.max(settings.ascentSpeed,ascent.initialDepth/Math.max(.1,settings.ascentMaxDuration)));const speed=planned*(.3+.7*THREE.MathUtils.smoothstep(-current.y,0,settings.ascentSlowdown));step.set(0,Math.min(-current.y,speed*dt),0);const result=checkedMove(current,step);current.copy(result.position);if(result.blocked){state.ascentBlocked=true;const lateral=new THREE.Vector3((rngSide(ascent.elapsed*17)-.5)*.32,0,(rngSide(ascent.elapsed*29)-.5)*.32);const side=checkedMove(current,lateral);current.copy(side.position);}}
    }
    offset.set(current.x,current.y+8,current.z);state.ascentDepth=Math.max(0,-current.y);state.ascentProgress=ascent.initialDepth?1-state.ascentDepth/ascent.initialDepth:1;
    if(current.y>=-.025){offset.y=8;ascent=null;surfaceLocked=true;yaw=targetYaw=defaultYaw;pitch=targetPitch=0;state.ascentProgress=1;state.mode='surface';state.exploring=false;captureRequired=true;destination=null;travelFocus=null;clear();return;}
  }
  function rngSide(v){return Math.sin(v*12.9898)*43758.5453%1;}
  function update(dt,submerged,instant=false,routeProvider){
    syncPerspectiveSetting();
    lastSubmerged=submerged;
    if(!ascent&&!surfaceLocked&&submerged&&!destination&&keys.has('Space')&&playerPosition().y>=-settings.ascentThreshold){beginAscent(routeProvider);}
    if(ascent)updateAscent(dt,routeProvider);
    if(!submerged&&keys.size)for(const code of keys)if(!surfaceLocked||!code.startsWith('Arrow'))keys.delete(code);
    if(!submerged&&!ascent&&surfaceLocked){state.mode='surface';}
    if(submerged&&!ascent&&state.mode==='surface'&&!surfaceLocked){state.mode='diver';}
    const manual=keys.size>0;
    if(!ascent){
      const turn=Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')),sideways=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
      targetYaw+=(turn-(!surfaceLocked&&settings.keyboardMode==='turn'?sideways:0))*dt*settings.keyTurnSpeed;targetPitch+=(Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*dt*settings.keyLookSpeed;
      const limit=THREE.MathUtils.degToRad(settings.pitchLimit);targetPitch=THREE.MathUtils.clamp(targetPitch,-limit,limit);
      let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),vertical=Number(keys.has('Space'))-Number(keys.has('ShiftLeft')||keys.has('ShiftRight')),strafe=settings.keyboardMode==='strafe'?sideways:0;
      const traveling=Boolean(destination&&submerged&&!suspended);
      if(traveling){
        delta.copy(destination).sub(offset);
        if(delta.length()<settings.travelArrival){destination=null;forward=0;vertical=0;desired.set(0,0,0);}
        else {
          const horizontal=Math.hypot(delta.x,delta.z),heading=Math.atan2(-delta.x,-delta.z),difference=Math.atan2(Math.sin(heading-yaw),Math.cos(heading-yaw));
          targetYaw=yaw+difference;
          let routeY=destination.y;
          for(let i=1;i<=16;i++){const t=i/16,x=offset.x+(destination.x-offset.x)*t,z=offset.z+(destination.z-offset.z)*t;routeY=Math.max(routeY,terrain(x,z)+settings.floorClearance+8);}
          routeY=Math.min(routeY,8-settings.ascentThreshold-1);
          delta.set(destination.x-offset.x,routeY-offset.y,destination.z-offset.z);
          const distance=delta.length(),ease=THREE.MathUtils.clamp(distance/settings.travelSlowdown,0,1);
          if(distance>.001)desired.copy(delta).setLength(settings.atlasCruiseSpeed*Math.min(1,ease));else desired.set(0,0,0);
          forward=vertical=strafe=0;
        }
      }
      if(travelFocus&&!destination&&submerged&&!suspended){
        const current=playerPosition(),focusDelta=travelFocus.clone().sub(current),horizontal=Math.hypot(focusDelta.x,focusDelta.z);
        if(focusDelta.lengthSq()>.01){const heading=Math.atan2(-focusDelta.x,-focusDelta.z);targetYaw=yaw+Math.atan2(Math.sin(heading-yaw),Math.cos(heading-yaw));targetPitch=THREE.MathUtils.clamp(Math.atan2(focusDelta.y,horizontal),-THREE.MathUtils.degToRad(settings.pitchLimit),THREE.MathUtils.degToRad(settings.pitchLimit));}
      }
      const blend=instant?1:1-Math.exp(-dt*settings.lookResponse);yaw=THREE.MathUtils.lerp(yaw,targetYaw,blend);pitch=THREE.MathUtils.lerp(pitch,targetPitch,blend);
      const f=forward*(forward<0?settings.reverseMultiplier:1),s=strafe*settings.strafeMultiplier,swimPitch=settings.swimTowardLook&&!destination?pitch:0;
      if(!traveling)desired.set((-Math.sin(yaw)*Math.cos(swimPitch)*f+Math.cos(yaw)*s)*settings.swimSpeed,Math.sin(swimPitch)*f*settings.swimSpeed+vertical*settings.verticalSpeed,(-Math.cos(yaw)*Math.cos(swimPitch)*f-Math.sin(yaw)*s)*settings.swimSpeed);
      const inputLength=Math.hypot(forward,strafe,vertical);if(inputLength>1)desired.divideScalar(inputLength);if(surfaceLocked||!submerged||suspended||(captureRequired&&!traveling))desired.set(0,0,0);if(surfaceLocked)velocity.set(0,0,0);
      velocity.lerp(desired,1-Math.exp(-dt*(desired.lengthSq()?settings.acceleration:settings.deceleration)));
      position.set(offset.x,offset.y-8,offset.z);step.copy(velocity).multiplyScalar(dt);state.colliding=false;state.contacts=0;
      if(submerged&&settings.collisionEnabled&&collisions){const result=collisions.move(position,step,{radius:settings.collisionRadius,length:settings.collisionLength,yaw,pitch,padding:settings.collisionPadding,step:settings.collisionStep,iterations:settings.collisionIterations},velocity);state.colliding=result.blocked;state.contacts=result.contacts;}else position.add(step);
      offset.copy(position);offset.y+=8;const half=Math.max(0,settings.collisionLength/2-settings.collisionRadius),fx=-Math.sin(yaw)*Math.cos(pitch),fz=-Math.cos(yaw)*Math.cos(pitch),fy=Math.sin(pitch);
      let floor=terrain(offset.x,offset.z)+settings.floorClearance;for(const sign of [-1,1])floor=Math.max(floor,terrain(offset.x+sign*fx*half,offset.z+sign*fz*half)+settings.floorClearance-sign*fy*half);
      const minY=Math.max(bounds.yMin,floor+8),maxY=8;state.atBoundary=Math.abs(offset.x)>=bounds.x||offset.z<=bounds.zMin||offset.z>=bounds.zMax||offset.y<=minY||offset.y>=maxY;
      offset.x=THREE.MathUtils.clamp(offset.x,-bounds.x,bounds.x);offset.z=THREE.MathUtils.clamp(offset.z,bounds.zMin,bounds.zMax);offset.y=THREE.MathUtils.clamp(offset.y,minY,maxY);
      if(state.atBoundary){if(Math.abs(offset.x)>=bounds.x)velocity.x=0;if(offset.z<=bounds.zMin||offset.z>=bounds.zMax)velocity.z=0;if(offset.y<=minY||offset.y>=maxY)velocity.y=0;}
      if(destination&&state.colliding&&velocity.length()<.15){blockedTime+=dt;if(blockedTime>2){destination=null;state.travelBlocked=true;}}else blockedTime=0;
    }
    state.offset=offset;state.yaw=yaw;state.pitch=pitch;state.travelling=Boolean(destination);state.manualInput=manual;state.speed=velocity.length();state.moving=manual||state.speed>.015||Math.abs(yaw-targetYaw)+Math.abs(pitch-targetPitch)>.0002||Boolean(ascent);state.transition=Boolean(ascent);state.mode=ascent?'transition':surfaceLocked?'surface':submerged?'diver':'surface';state.exploring=state.exploring&&!suspended&&!captureRequired;
    return state;
  }
  function getPlayerPosition(target=new THREE.Vector3()){return target.set(offset.x,offset.y-8,offset.z);}
    return {state,update,reset,startDive,travel,frameSky,setTerrain,setCollisions,suspend,setInterfaceOpen,beginAscent,togglePerspective,toggleFreeCam,setFreeCam:value=>toggleFreeCam(value),recapture,getPlayerPosition,getCameraPose:()=>({perspective:state.perspective}),bounds,destroy(){cleanup.forEach(fn=>fn());}};
}
