import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import { createExploration } from '../exploration.js';
import { defaults } from '../movement-settings.js';

class Events {
  listeners = new Map();
  addEventListener(name, fn) { const group = this.listeners.get(name) ?? new Set(); group.add(fn); this.listeners.set(name, group); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  dispatchEvent(event) { for (const fn of this.listeners.get(event.type) ?? []) fn(event); }
}

function environment({ settings={...defaults}, collision=null, buttons=[] }={}) {
  const doc = new Events();
  const win = new Events();
  let pointerRequests = 0;
  doc.pointerLockElement = null;
  doc.hidden = false;
  doc.querySelectorAll = () => buttons;
  doc.exitPointerLock = () => { doc.pointerLockElement = null; doc.dispatchEvent({type:'pointerlockchange'}); };
  globalThis.document = doc;
  globalThis.window = win;
  const canvas = new Events();
  canvas.focus = () => {};
  canvas.requestPointerLock = () => { pointerRequests++; doc.pointerLockElement = canvas; doc.dispatchEvent({type:'pointerlockchange'}); };
  canvas.setPointerCapture = () => {};
  const controller = createExploration(canvas, () => {}, settings);
  if (collision) controller.setCollisions(collision);
  return {controller, canvas, doc, win, settings, get pointerRequests(){return pointerRequests;}};
}

function tick(controller, hz, seconds, submerged=true) {
  const dt = 1 / hz;
  for (let i=0; i<Math.round(hz*seconds); i++) controller.update(dt, submerged);
}

function key(win,code,type='keydown') {
  win.dispatchEvent({type,code,repeat:false,target:{closest:()=>null},preventDefault(){}});
}

// Surface capture supports mouse and arrows while all swim controls stay still.
{
  const env=environment();
  const before=env.controller.getPlayerPosition().toArray();
  env.canvas.dispatchEvent({type:'pointerdown',pointerType:'mouse',clientX:0,clientY:0});
  assert.equal(env.pointerRequests,1,'surface click captures the pointer');
  env.canvas.dispatchEvent({type:'pointermove',pointerType:'mouse',movementX:100,movementY:-70});
  tick(env.controller,60,.4,false);
  assert.ok(env.controller.state.yaw<-.1,'mouse aims horizontally on surface');
  assert.ok(env.controller.state.pitch>.1,'mouse aims vertically on surface');
  const yaw=env.controller.state.yaw;
  key(env.win,'ArrowLeft');key(env.win,'ArrowUp');
  for(const code of ['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft'])key(env.win,code);
  tick(env.controller,60,.6,false);
  assert.ok(env.controller.state.yaw>yaw+.1,'surface arrows turn the view');
  assert.deepEqual(env.controller.getPlayerPosition().toArray(),before,'surface controls never translate the player');
  key(env.win,'Escape');
  assert.equal(env.doc.pointerLockElement,null,'Escape releases surface pointer lock');
  assert.equal(env.controller.state.exploring,false);
  tick(env.controller,60,1,false);
  const releasedYaw=env.controller.state.yaw;
  key(env.win,'ArrowLeft');
  env.canvas.dispatchEvent({type:'pointermove',pointerType:'mouse',movementX:300,movementY:100});
  tick(env.controller,60,.5,false);
  assert.ok(Math.abs(env.controller.state.yaw-releasedYaw)<.001,'released surface ignores look input');
  env.controller.startDive();
  assert.equal(env.controller.state.mode,'diver');
  assert.equal(env.controller.state.pitch,-.18,'dive restores its initial heading');
  tick(env.controller,60,.1);
  key(env.win,'KeyW');tick(env.controller,60,.5);
  assert.ok(env.controller.getPlayerPosition().z<-1,'swimming still works after surface exploration');
  env.controller.destroy();
}

// Touch can look around the surface without requesting a pointer lock.
{
  const env=environment();
  env.canvas.dispatchEvent({type:'pointerdown',pointerType:'touch',pointerId:1,clientX:20,clientY:20});
  env.canvas.dispatchEvent({type:'pointermove',pointerType:'touch',pointerId:1,clientX:120,clientY:80});
  tick(env.controller,60,.4,false);
  assert.ok(env.controller.state.yaw<-.1&&env.controller.state.pitch<-.1);
  assert.equal(env.pointerRequests,0);
  assert.deepEqual(env.controller.getPlayerPosition().toArray(),[0,0,0]);
  env.controller.destroy();
}

// Surface arrow buttons activate look without a separate canvas click.
{
  const arrow=new Events();arrow.dataset={swim:'ArrowLeft'};arrow.setPointerCapture=()=>{};
  const swim=new Events();swim.dataset={swim:'KeyW'};swim.setPointerCapture=()=>{};
  const env=environment({buttons:[arrow,swim]});
  arrow.dispatchEvent({type:'pointerdown',pointerType:'mouse',pointerId:1,preventDefault(){}});
  swim.dispatchEvent({type:'pointerdown',pointerType:'mouse',pointerId:2,preventDefault(){}});
  tick(env.controller,60,.5,false);
  assert.ok(env.controller.state.yaw>.1);
  assert.equal(env.pointerRequests,0,'arrow buttons do not capture the pointer');
  assert.deepEqual(env.controller.getPlayerPosition().toArray(),[0,0,0]);
  arrow.dispatchEvent({type:'pointerup'});key(env.win,'Escape');
  arrow.dispatchEvent({type:'keydown',code:'Enter',preventDefault(){}});
  tick(env.controller,60,.5,false);
  assert.equal(env.controller.state.exploring,true,'keyboard activation also enables surface look');
  env.controller.destroy();
}

// Returning to the surface settles the view and permits capture again.
{
  const env=environment();
  env.controller.frameSky(.3);env.controller.startDive();
  tick(env.controller,60,.1);
  key(env.win,'ArrowLeft');tick(env.controller,60,.4);key(env.win,'ArrowLeft','keyup');
  env.controller.beginAscent();tick(env.controller,60,10);
  assert.equal(env.controller.state.mode,'surface');
  assert.equal(env.controller.state.yaw,.3);
  assert.equal(env.controller.state.pitch,0);
  assert.equal(env.controller.state.exploring,false);
  assert.equal(env.controller.recapture(),true,'surface return can recapture');
  tick(env.controller,60,.1,false);
  assert.equal(env.controller.state.exploring,true);
  env.controller.destroy();
}

// Perspective changes only camera intent and stays attached to the diver.
{
  const env = environment();
  env.controller.startDive();
  assert.equal(env.pointerRequests, 1, 'Dive requests pointer lock synchronously');
  assert.equal(env.controller.state.pitch, -.18, 'Dive begins with a slight downward view');
  const before = env.controller.getPlayerPosition().clone();
  env.controller.togglePerspective();
  assert.equal(env.controller.state.perspective, 'third');
  assert.equal(env.settings.cameraMode, 'third', 'V keeps the settings panel value in sync');
  assert.deepEqual(env.controller.getPlayerPosition().toArray(), before.toArray(), 'perspective never moves the diver');
  env.settings.cameraMode = 'first';
  env.controller.update(1/60, true);
  assert.equal(env.controller.state.perspective, 'first', 'panel changes update the active perspective');
  env.controller.destroy();
}

// Atlas focus aims at the landmark on arrival and manual input takes over.
{
  const env=environment();
  env.controller.startDive();
  env.controller.travel([10,-12,-10],[12,-9,-10]);
  tick(env.controller,60,7);
  assert.equal(env.controller.state.travelling,false);
  assert.ok(env.controller.state.pitch>.4,'arrival pitch points toward the landmark');
  const yawAtArrival=env.controller.state.yaw;
  env.win.dispatchEvent({type:'keydown',code:'ArrowLeft',repeat:false,target:{closest:()=>null},preventDefault(){}});
  tick(env.controller,60,.5);
  assert.ok(env.controller.state.yaw>yawAtArrival+.1,'manual steering overrides landmark focus');
  env.controller.destroy();
}

// Atlas travel proceeds after Escape and settles at its safe target without recapturing.
{
  const env = environment();
  env.controller.startDive();
  tick(env.controller, 60, .1);
  env.win.dispatchEvent({type:'keydown', code:'Escape', repeat:false, target:{closest:()=>null}, preventDefault(){}});
  const requestsAfterEscape = env.pointerRequests;
  env.controller.setTerrain(()=>-14);
  env.controller.travel([10,-12,-10]);
  tick(env.controller, 60, 6);
  const position = env.controller.getPlayerPosition();
  assert.equal(env.pointerRequests, requestsAfterEscape, 'atlas travel does not request pointer capture');
  assert.equal(env.controller.state.travelling, false, 'atlas travel eases to completion');
  assert.ok(position.distanceTo(new THREE.Vector3(10,-12,-10)) < 1.5, `arrival is close to target (${position.toArray()})`);
  assert.ok(position.y > -14, 'terrain clearance keeps the diver above the seabed');
  env.controller.destroy();
}

// Exponential steering should be close across the same elapsed time at 30 and 60 Hz.
{
  const a = environment({settings:{...defaults,collisionEnabled:false}});
  const b = environment({settings:{...defaults,collisionEnabled:false}});
  for (const env of [a,b]) { env.controller.startDive(); env.controller.travel([12,-12,-12]); }
  tick(a.controller, 30, 2);
  tick(b.controller, 60, 2);
  const pa=a.controller.getPlayerPosition(), pb=b.controller.getPlayerPosition();
  assert.ok(pa.distanceTo(pb)<.55, `30/60 Hz positions stay close (${pa.toArray()} vs ${pb.toArray()})`);
  a.controller.destroy(); b.controller.destroy();
}

// An authored cave route is followed before the cached clearance check finds a side exit.
{
  const caveCollision = {
    move(position, displacement) { position.add(displacement); return {blocked:false,contacts:0}; },
    segmentClear(from) { return Math.abs(from.x)>1.5; },
  };
  const env = environment({collision:caveCollision});
  env.controller.startDive();
  const safeRoute=[new THREE.Vector3(0,-8,-3)];
  env.controller.beginAscent(()=>safeRoute);
  tick(env.controller, 30, .4);
  assert.ok(env.controller.getPlayerPosition().z < -1, 'authored safe ascent route is used first');
  tick(env.controller, 30, 8);
  assert.ok(env.controller.state.ascentDepth < 8, 'side clearance route permits ascent past cave obstruction');
  env.controller.destroy();
}

console.log('navigation-refined: 9 controller checks passed');
