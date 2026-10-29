import { createExperienceMetrics } from './experience-performance.js';
import { createWaterlineSplash } from './waterline-splash.js';
import { toDisplayDepth, DISPLAY_MAX_DEPTH } from './depth-metrics.js';
import {createDiveScooter} from './scooter.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import { createExpeditionUI, drawReefChart } from './expedition-ui.js';
import { drawPreparedChart } from './prepared-charts.js';
import * as THREE from './vendor/three.module.min.js';
import { createClouds, seededRandom, shareSteps, setPacer } from './assets.js';
import { createDiver } from './diver.js';
import { createDiverAnimator } from './diver-animation.js';
import { createWristComputer } from './wrist-computer.js';
import { reefSteps, LANDMARKS, terrainHeightAt } from './reef.js';
import { marineLifeSteps } from './marine-life.js';
import { underwaterLifeSteps } from './underwater-life.js';
import { createDistantScenery } from './distant-scenery.js';
import { createSeabirds } from './seabirds.js';
import { createWeather } from './weather.js';
import { createSkySystem } from './sky-system.js';
import { createExploration } from './exploration.js';
import { createAscentComposition } from './ascent-composition.js';
import { settings } from './movement-settings.js';
import { createMovementPanel } from './movement-panel.js';
import { look, stylize, stylizeTree, stylizeImported, lookGlowAt } from './ocean-look.js';
import { createSetPieces } from './set-pieces.js';
import { heroFormationSteps } from './hero-formations.js';
import { livingWorldSteps } from './living-world.js';
import { waveHeight, waterVertex, waterFragment, beamVertex, beamFragment, smoothVertex, smoothFragment } from './shaders.js';
import { refreshRate, drawStride, windowPace, windowHitch, workBudget, createScaleController } from './frame-pacing.js';

// Matrix4.toArray writes a matrix into whatever array it is handed. three hands it every kind there is (plain arrays,
// Float32Arrays, Float64Arrays), so its sixteen stores are megamorphic and run on V8's slow generic path: 650 ns a
// matrix where 25 would do. It is behind every InstancedMesh.setMatrixAt (every school fish, bubble, jellyfish and
// turtle part, each frame) and every bone of every skinned animal in Skeleton.update: the costliest single function of
// a dive's frame. Writes into a Float32Array, which is what all of those are, now go through a loop that only ever sees
// one; the values written are the same.
const intoFloats=(array,offset,e)=>{for(let i=0;i<16;i++)array[offset+i]=e[i];return array;},matrixToArray=THREE.Matrix4.prototype.toArray;
THREE.Matrix4.prototype.toArray=function(array=[],offset=0){return array instanceof Float32Array?intoFloats(array,offset,this.elements):matrixToArray.call(this,array,offset);};
const $=s=>document.querySelector(s), canvas=$('#world'), status=$('#status');
const themeMedia=matchMedia('(prefers-color-scheme: dark)'), motionMedia=matchMedia('(prefers-reduced-motion: reduce)');
let selectedNight=false;
// Respect the system by default, but let a visitor explicitly resume the ocean.
let motionPreference=null;
try{const saved=localStorage.getItem('ocean-motion');if(saved==='full'||saved==='reduced')motionPreference=saved;}catch{}
const requestedMotion=new URLSearchParams(location.search).get('motion');
if(requestedMotion==='full'||requestedMotion==='reduced'){
  motionPreference=requestedMotion;
  try{localStorage.setItem('ocean-motion',motionPreference);}catch{}
}
// A fresh visit starts with the ocean moving. The in-page control can pause it,
// and an explicit saved/query preference still wins; OS changes are honored below.
let reducedMotion=motionPreference?motionPreference==='reduced':false,paused=reducedMotion;
let renderer,scene,camera,water,waterCalm,waterRough,waterFine,waterCoarse,diver,reef,skySystem,marine,clouds,sunlight,ambient,beamGroup,motes,bubbleMesh,diveLamp;
let viewerOrbit=null,scooterModel=null;
let diverAnimator=null;
const diverAnimationState={};
const beams=[],beamPose=new THREE.Object3D();
let setPieces=null,heroFormations=null,livingWorld=null;
// Weather drifts on its own unless the visitor holds it; a locked clock stops the automatic day/night advance only.
let weather=null,timeLocked=false;try{timeLocked=localStorage.getItem('ocean-time-lock')==='1';}catch{}
let userCreatures=null,userCorals=null;
let largeMarine=null,extraLife=null,distantScenery=null,birds=null,modelScene=null,modelsLoading=false,modelsBusy=0,optionalModelsStarted=false,interactionTargets=[];
// The surface is on screen first; the world under the water is built behind it, in steps (see buildUnderwater).
// built: every part exists. underReady: its shaders have linked as well, so a dive can go under without waiting on one.
let built=false,underReady=false,buildSteps=null,buildStage='reef',modelsWanted=false,diveHeldFor=0,holdNoted=false;
const DIVE_HOLD=.2,HOLD_NOTE='Preparing the reef…';
let running=false,raf=0,lastFrame=0,elapsed=0,focused=!document.hidden;
let phase=selectedNight?Math.PI:0,phaseTarget=null;
const cycleSeconds=1200;
const skyClockFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',hour:'2-digit',minute:'2-digit',hour12:false});
// Formatting in a time zone is the dearest call of a HUD paint; the clock shows minutes, so it is formatted once a minute.
let skyClockMinute=NaN,skyClockText='';const skyClock=date=>{const minute=Math.floor(date.getTime()/60000);if(minute!==skyClockMinute){skyClockMinute=minute;skyClockText=skyClockFormat.format(date);}return skyClockText;};
let night=selectedNight?1:0,diveTarget=0,dive=0,frameCount=0,perfDuration=0,perfSamples=0;
let mobile=innerWidth<600,quality=mobile||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<5)?'economy':'standard';
let nextBubble=0,bubbleCursor=0,bubbleClock=-1,exploring=false,mapDestination=null;
let mapCollapsed=mobile;
let previousMode='surface',surfaceX=0,surfaceZ=0,surfaceFramingYaw=0,expeditionUI=null;
// The guided dive's opening (release/guided-dive/SPEC.md, step 0): at the surface the camera eases in on the diver and
// centres them before the dive. prelude runs 0..1 over PRELUDE seconds with a sine ease in and out, and gives way to
// the dive's own approach as the descent starts.
const PRELUDE=1.4,PRELUDE_ZOOM=.62;let prelude=0,preludeOn=false;
let ascentCameraTime=0,surfaceLandingTime=0;const ascentCameraStart=new THREE.Vector3(),ascentAimStart=new THREE.Vector3();
const ascentComposition=createAscentComposition(),diverPoseGoal=new THREE.Quaternion();
const aimObject=new THREE.Object3D(),aimQuaternion=new THREE.Quaternion();
let wristComputer=null,computerOpen=false,interfaceOpen=false,movementPanelOpen=false,settingsMenuOpen=false;
const safetyStop={active:false,blend:0,yaw:0,computerWas:false};
let waterlineSplash=null;const splashState={cameraY:2,transition:false,reducedMotion:false};
const rng=seededRandom(541),dummy=new THREE.Object3D(),lookTarget=new THREE.Vector3(),viewDirection=new THREE.Vector3();
const emitter=new THREE.Vector3(),relative=new THREE.Vector3(),projected=new THREE.Vector3(),labelDirection=new THREE.Vector3();
const playerPosition=new THREE.Vector3(),chasePosition=new THREE.Vector3();
// Camera rig: the spring's velocity, where the diver was last frame, how far out the follow camera currently sits (a share of its full distance), and a perspective switch still gliding.
const cameraVelocity=new THREE.Vector3(),cameraAnchor=new THREE.Vector3(),axisZ=new THREE.Vector3(0,0,1);let cameraPull=.95,cameraShift=0,cameraWas='';
// The follow camera's own bearing, as [angle, rate]: a critically damped follower of the diver's yaw and pitch, exact over a step of any length.
const cameraYaw=[0,0],cameraPitch=[0,0];
function followAngle(state,goal,frequency,dt){const gap=Math.atan2(Math.sin(state[0]-goal),Math.cos(state[0]-goal)),lead=state[1]+frequency*gap,decay=Math.exp(-frequency*dt);state[0]=goal+(gap+lead*dt)*decay;state[1]=(state[1]-frequency*lead*dt)*decay;}
const cameraGoal=new THREE.Vector3(),swimDirection=new THREE.Vector3();
const poseYaw=new THREE.Quaternion(),posePitch=new THREE.Quaternion(),axisY=new THREE.Vector3(0,1,0),axisX=new THREE.Vector3(1,0,0);
const fogDay=new THREE.Color('#accdd5'),fogNight=new THREE.Color('#152740'),fogDeep=new THREE.Color('#075361'),fogAbyss=new THREE.Color('#022532');
const lightDay=new THREE.Color('#ffe6bf'),lightNight=new THREE.Color('#97bded'),skyFillNight=new THREE.Color('#7493bd');
const cloudDay=new THREE.Color('#ffffff'),cloudNight=new THREE.Color('#526a8b');
// Per-frame temporaries: the update loop allocates nothing.
const scratchA=new THREE.Vector3(),scratchB=new THREE.Vector3(),scratchC=new THREE.Vector3(),scratchQ=new THREE.Quaternion(),downLight=new THREE.Vector3(),beamAim=new THREE.Quaternion();
const diverGlow=new THREE.Color(0,0,0),halfTurn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI),ambientDay=new THREE.Color('#c8e7e6'),depthTint=new THREE.Color('#72cbd1'),goldenCloud=new THREE.Color('#ffab79'),goldenSun=new THREE.Color('#ffb57c');
const wrapBeam=(v,c)=>c+((v-c+36)%72+72)%72-36;
// What the camera can see this frame: its frustum and the distance at which the haze has absorbed a surface.
const view={frustum:new THREE.Frustum(),eye:new THREE.Vector3(),range:Infinity},viewProjection=new THREE.Matrix4();
// Adaptive resolution steps and their controller (see frame-pacing.js), and counters for the frame-rate windows.
const RENDER_SCALES=[1,.85,.72,.6],scaler=createScaleController({floor:RENDER_SCALES.length-1,economy:quality==='economy',scales:RENDER_SCALES});
let tickCount=0,displayHz=60,viewWidth=innerWidth,viewHeight=innerHeight;
// Projected labels keep out of the HUD's bands: 110 px at the top and bottom, and on a phone (the layout tokens' query)
// the top bar with the scope under it, and the controls zone with the collapsed sheet above it (hud.css 14).
const phoneLayout=matchMedia('(max-width:599px),(pointer:coarse) and (max-height:499px)');let labelTop=110,labelBottom=110;
function measureLabelBands(){const phone=phoneLayout.matches;labelTop=phone?180:110;labelBottom=phone?(innerWidth>innerHeight?80:210):110;}
measureLabelBands();
// Frame pacing: the display's refresh interval is read from the callbacks themselves, and a frame is drawn every stride-th one.
const frameGaps=new Float32Array(24),gapOrder=new Float32Array(24),drawGaps=new Float32Array(160),drawOrder=new Float32Array(160);
let gapCursor=0,stride=1,sinceDraw=0,drawCount=0,lastDraw=0,gpuTier='unknown',started=false;
// Render budget: 'full' draws at the display's pace (55 to 100 frames a second), 'reduced' at 30, 'idle' at 15. Left on
// 'auto', the scene idles behind a dialog that covers it, halves behind the settings panel, and halves at the surface
// once nobody has touched the page for a few seconds; any input brings it straight back.
const BUDGET_FPS={reduced:30,idle:15},IDLE_AFTER=6000;
let budgetAsked='auto',lastInput=performance.now(),heldClock=0;
for(const type of ['pointermove','pointerdown','keydown','wheel','touchstart'])addEventListener(type,()=>{lastInput=performance.now();},{passive:true,capture:true});
// The HUD is repainted about twelve times a second, and a node is only touched when its value changed.
const hudNodes=new Map(),hudStyles=new Map(),CARDINALS=['N','NE','E','SE','S','SW','W','NW'];
let hudPainted=-1e9,hudForce=false,skyLabelsLit=true,presetTick=30,depthTrack=0;
const uniforms={uTime:{value:0},uNight:{value:night},uDive:{value:0},uDepth:{value:0},uSun:{value:new THREE.Vector3(-.43,.2,-1).normalize()},uMoon:{value:new THREE.Vector3(-.41,.25,-1).normalize()},uSurfaceLight:{value:1},uRatio:{value:1},uLookSun:look.uLookSun};
const diagnostic={ready:false,error:null,frames:0,fps:0,quality,reducedMotion,paused,theme:selectedNight?'night':'day',submerged:false,cycleSeconds,dayToNightSeconds:600};
window.oceanDiagnostics=diagnostic;
// Start-up timings in ms. modules: when this file began to run. Then the main-thread time of each stage up to the first
// frame (shaders: the wait for the browser to compile the surface's programs, which blocks nothing), and under: the
// main-thread time of each part of the world built after it.
const experienceMetrics=window.oceanExperienceMetrics=createExperienceMetrics();
const startup=diagnostic.startup={modules:Math.round(performance.now()),under:{}};let markAt=performance.now();
const mark=name=>{const now=performance.now();startup[name]=+((startup[name]||0)+now-markAt).toFixed(1);markAt=now;};
const exploration=createExploration(canvas,wake),bubbleData=[],skyLabels=[],reefLabels=[];
createMovementPanel(()=>{
  if(camera){camera.fov=settings.cameraFov+(mobile?7:0);camera.updateProjectionMatrix();}
  if(!settings.pointerLock&&document.pointerLockElement===canvas)document.exitPointerLock();
  wake();
},open=>{movementPanelOpen=open;syncControlSuspension();});

const hud=selector=>{let node=hudNodes.get(selector);if(!node?.isConnected){node=$(selector);if(node)hudNodes.set(selector,node);}return node;};
// Text is compared with what was last written here, not read back from the page, and goes straight into the node's text when that is all it holds.
const hudTexts=new WeakMap();
const setText=(node,value)=>{if(!node||hudTexts.get(node)===value)return;hudTexts.set(node,value);const first=node.firstChild;if(first&&first===node.lastChild&&first.nodeType===3)first.data=value;else node.textContent=value;};
const setHidden=(node,value)=>{if(node&&node.hidden!==value)node.hidden=value;};
const setAttribute=(node,name,value)=>{if(node&&node.getAttribute(name)!==value)node.setAttribute(name,value);};
const setStyle=(selector,name,value)=>{const key=selector+name;if(hudStyles.get(key)!==value){hudStyles.set(key,value);hud(selector)?.style.setProperty(name,value);}};
function getPlayerPosition(){return exploration.getPlayerPosition(new THREE.Vector3()).clone();}
function getMode(){return exploration.state.transition||Math.abs(dive-diveTarget)>.002?'transition':exploration.state.mode;}
function getTransition(){return exploration.state.transition||Math.abs(dive-diveTarget)>.002;}
function syncControlSuspension(){
  movementPanelOpen=Boolean($('#movement-panel')?.open);
  exploration.setInterfaceOpen(interfaceOpen||movementPanelOpen||settingsMenuOpen);wake();
}
function setInterfaceOpen(value){interfaceOpen=Boolean(value);syncControlSuspension();}
function setSettingsMenuOpen(value){settingsMenuOpen=Boolean(value);syncControlSuspension();}
function setComputerOpen(value){computerOpen=Boolean(value);wake();return computerOpen;}
function setSafetyStop(value){
  const active=Boolean(value);if(active===safetyStop.active)return active;
  if(active){safetyStop.yaw=exploration.state.yaw;safetyStop.computerWas=computerOpen;computerOpen=false;}
  else computerOpen=safetyStop.computerWas;
  exploration.holdSafetyStop(active);
  safetyStop.active=active;document.body.dataset.safetyStop=String(active);diagnostic.safetyStop=active;wake();return active;
}
function toggleCamera(){const active=exploration.toggleFreeCam();const button=$('#camera-toggle');if(button){button.setAttribute('aria-pressed',String(active));setText(button,active?'First-person view':'Third-person view');}wake();return active;}
// A model is first drawn only once its shaders have compiled (off the main thread where the browser allows it) and
// its textures have been uploaded one per frame: it appears a moment later instead of stalling the frame it appears in.
const prepared=new WeakSet();
// Background work. Whatever is not this frame's picture (building the world under the water, shader source, first
// draws, model parsing and uploads, sharing vertices) queues here and runs in small steps around the frames.
// A job is a function (one step) or a generator (a step per yield), and what a generator yields describes its next
// step: a number is the main-thread time it expects in ms; GPU marks a step whose cost lands in the graphics process
// (a program's first draw, an upload); a promise parks the job until it settles.
// Steps on this thread run in a task of their own just after a frame has been handed to the browser, in what is left
// of the display interval, and at most a few ms of it (see workBudget): a step is not started unless its expected time
// fits, and time spent over the budget is paid back by resting. GPU steps run one at a time just before a frame is
// drawn, when the graphics process has finished the last one, and rest for a few frames after one that stalled it.
// A visitor waiting on the work (a dive asked for before the world is ready) gets most of every interval instead.
const GPU=Symbol('gpu'),jobs=[],buildName='the world under the water',work=diagnostic.work={pending:0,steps:0,ms:0,longest:0,longestName:'',over8:0,over16:0,gpuSteps:0,turns:0,long:[]};
let jobDebt=0,jobsStarved=0,jobsAt=-1e9,jobsQuietAt=-1e9,jobFrameAt=0,jobGap=0,jobFrameDrew=false,jobPosted=false,pumpQueued=false,gpuRest=0,gpuRan=false,paceGap=16.7,hurry=0,ticking=false;
// urgent: ahead of everything queued (what a held dive waits on, the landmarks, goes before the first draws of the rest).
function later(name,task,{gpu=false,cost=1,tally=null,urgent=false}={}){
  return new Promise((resolve,reject)=>{const job={name,task,steps:null,resolve,reject,gpu,cost,tally,waiting:false};if(urgent)jobs.unshift(job);else jobs.push(job);work.pending=jobs.length;pump();wake();});
}
// One step of a job; true when the job has finished.
function stepJob(job){
  const before=performance.now();let result=null,finished=false;
  try{
    if(!job.steps){const made=job.task();if(made&&typeof made.next==='function')job.steps=made;else{job.resolve(made);finished=true;}}
    if(!finished){result=job.steps.next();if(result.done){job.resolve(result.value);finished=true;}}
  }catch(error){job.reject(error);finished=true;}
  const took=performance.now()-before;work.steps++;work.ms+=took;job.tally?.(took);
  if(took>work.longest){work.longest=+took.toFixed(1);work.longestName=job.name===buildName?buildStage:job.name;}
  if(took>8){work.over8++;if(work.long.length<60)work.long.push(`${Math.round(before-(diagnostic.readyAt||0))}:${job.name===buildName?buildStage:job.name}:${Math.round(took)}`);}if(took>16)work.over16++;
  if(finished)return true;
  const hint=result.value;job.gpu=hint===GPU;job.cost=typeof hint==='number'?hint:1;
  if(hint&&typeof hint.then==='function'){job.waiting=true;const resume=()=>{job.waiting=false;pump();wake();};hint.then(resume,resume);}
  return false;
}
// kind: 'gpu' takes one GPU step, 'cpu' the steps of this thread up to the budget, 'all' both (no frame is being drawn). Returns the steps taken.
function runJobs(budget,kind){
  const start=performance.now();let ran=0;
  for(let i=0;i<jobs.length;){
    const job=jobs[i];
    if(job.waiting||kind!=='all'&&(kind==='gpu')!==job.gpu){i++;continue;}
    if(ran&&(kind==='gpu'||performance.now()-start+job.cost>budget))break;
    // A turn for the model pipelines (see setPacer below): they take what is left of this slice, so it is the last thing in it.
    if(job.turn){jobs.splice(i,1);const left=Math.max(2,budget-(performance.now()-start));turnEnd=performance.now()+left;turnCallbacks=callbacks;work.turns++;ran++;job.turn(left);break;}
    ran++;if(job.gpu)work.gpuSteps++;
    if(stepJob(job))jobs.splice(i,1);
    if(performance.now()-start>=budget)break;
  }
  work.pending=jobs.length;if(!jobs.length)jobsQuietAt=performance.now();
  if(kind==='cpu'&&hurry<2)jobDebt+=Math.max(0,performance.now()-start-Math.max(budget,1));
  return ran;
}
// The model pipelines are async functions that work in slices (see assets.js): each slice is a turn in this queue, as
// long as what is left of the budget when its turn comes, and time one of them runs past its slice is paid back like any
// other: when no frame callback came in between (one that did means the pipeline had let go of the thread, waiting on a
// download or a decode, and comes back owing nothing).
let turnEnd=0,turnCallbacks=0,callbacks=0;
setPacer(()=>new Promise(resolve=>{
  const now=performance.now();if(turnEnd&&now>turnEnd&&callbacks===turnCallbacks&&hurry<2)jobDebt+=Math.min(now-turnEnd,60);turnEnd=0;
  jobs.push({name:'model work',turn:resolve,gpu:false,cost:2,waiting:false});work.pending=jobs.length;pump();wake();
}));
// After a frame: the steps of this thread, in a task that starts once the browser has the frame.
const jobPort=new MessageChannel();
jobPort.port1.onmessage=()=>{jobPosted=false;afterFrame();};
function afterFrame(){
  if(!jobs.length)return;
  const interval=1000/displayHz,used=performance.now()-jobFrameAt,waiting=hurry>1;
  // A frame that was drawn at full pace leaves a few ms; a callback that drew nothing (a reduced budget, a fast display) leaves most of its interval.
  // A visitor waiting on the work gets up to half of the time between callbacks, whatever sets that pace: where the
  // graphics process does (a weak GPU; SwiftShader in perf-hold.mjs) callbacks come a few times a second, the main thread
  // is free for most of each, and 14 ms of it left the build under a tenth. Where the main thread sets the pace, half the
  // gap settles at what the frame itself takes (the gap is frame plus work): frames come at most half as often while the
  // dive is held, and no task runs over 50 ms.
  let budget=waiting?workBudget(Math.max(interval,jobGap),ticking?0:used,Math.min(50,Math.max(14,jobGap/2)),jobsStarved):workBudget(interval,ticking?0:used,jobFrameDrew&&diagnostic.renderBudget==='full'?(hurry?6:4):9,jobsStarved);
  if(waiting)budget=Math.max(budget,9);
  else if(jobDebt>0){jobDebt-=Math.max(budget,2);budget=0;}
  if(budget<=0){jobsStarved++;idleSlices();return;}
  jobsStarved=0;runJobs(budget,'cpu');
  idleSlices();
}
// The time between the callbacks that this thread would otherwise spend idle. Where the frames are not this thread's to
// pace (a weak GPU, or SwiftShader in perf-hold.mjs, busy building shader variants: callbacks then come a tenth of a
// second apart while this thread works for a fraction of each; frames drawn every other callback) the work goes on in
// slices of its own, each in a task of its own and ending a few ms before the next callback is due (by the pace the
// callbacks have kept: paceGap), so the frames still come when they would have. While a dive is held and the visitor is
// waiting on the work, the slices go on whatever the pace, up to 30 ms each, and the frames fit between them.
let callbackAt=0,slicePosted=false;
const slicePort=new MessageChannel();
slicePort.port1.onmessage=()=>{slicePosted=false;idleSlice();};
function idleSlices(){if(!slicePosted&&!ticking&&diagnostic.ready&&jobs.some(job=>!job.waiting&&!job.gpu)){slicePosted=true;slicePort.port2.postMessage(0);}}
function idleSlice(){
  if(!running||diagnostic.error)return;
  const room=hurry>1?30:Math.min(30,callbackAt+paceGap-performance.now()-4);
  if(room<2)return;
  if(runJobs(room,'cpu'))idleSlices();
}
// When no frame is being drawn (a hidden tab, a paused scene at rest) the queue runs in tasks of its own.
function pump(){
  if(pumpQueued||!jobs.length)return;pumpQueued=true;
  const idle=performance.now()-jobsAt>250,turn=()=>{
    pumpQueued=false;if(!jobs.length||diagnostic.error)return;
    if(performance.now()-jobsAt>250)runJobs(document.hidden?40:10,'all');
    if(jobs.some(job=>!job.waiting))pump();
  };
  if(idle)nextTask().then(turn);else setTimeout(turn,125);
}
// Shaders. three assembles a program's source on this thread, a few ms each: one mesh a step. The browser then
// compiles and links it on another thread; `linking` collects the materials for whoever waits on that (programsLinked),
// and without one the job itself waits.
function* compileSteps(root,linking=null){
  const nodes=[],materials=linking||new Set();
  root.traverse(node=>{if(node.isMesh||node.isPoints||node.isLine||node.isSprite)nodes.push(node);});
  for(const node of nodes){
    const list=[node.material].flat().filter(Boolean);
    yield list.some(material=>!renderer.properties.get(material).currentProgram)?3:.3;
    renderer.compile(node,camera,scene);for(const material of list)materials.add(material);
  }
  if(!linking)yield programsLinked(materials);
}
const programsLinked=materials=>new Promise(resolve=>{
  const check=()=>{for(const material of materials){const program=renderer.properties.get(material).currentProgram;if(!program||program.isReady())materials.delete(material);}if(materials.size&&!diagnostic.error)setTimeout(check,25);else resolve();};
  check();
});
// Everything under the water is drawn once before the first dive: a few meshes a frame, into a target of 8x8 pixels.
// What a first draw costs (buffers, textures and, most of all, the shader variant the graphics driver only builds
// when a program is first used) was a stall of a second or more in the first frames of the descent; here it is paid
// one program at a time while the visitor is still at the surface. A dive that goes under first drops what is left.
// The graphics process builds that variant after the draw has been handed to it, and this thread would wait for it at
// the next call that asks the graphics process anything (the next new program's first use): a tenth to a third of a
// second each in SwiftShader. A fence goes in behind each new program's draw, and the next step waits until it has been
// passed, without blocking: this thread goes on with frames and the build meanwhile. Each part of the world is drawn
// this way as soon as it is built (warmFirst), so its variants are built while the next part is; listWarm then draws
// everything once more (buffers, the distant cells, whatever was left out), most of it with programs already built.
const warmQueue=[],warmed=new WeakSet(),warmCamera=new THREE.PerspectiveCamera(120,1,.5,4000);
let warmTarget=null,warming=false,warmListed=false;
warmCamera.position.set(0,170,-35);warmCamera.lookAt(0,-30,-35);warmCamera.layers.set(1);
// Each root may itself be hidden (the reef is, above water); whatever is hidden inside it stays out.
function warmLater(...roots){
  for(const root of roots){const visit=node=>{if(node.isMesh||node.isPoints||node.isLine)warmQueue.push({node,root});for(const child of node.children)if(child.visible)visit(child);};if(root)visit(root);}
  warmSoon();
}
// One draw for each material of these parts not drawn before.
const warmListedMaterials=new WeakSet();
function warmFirst(...roots){
  for(const root of roots){const visit=node=>{if(node.isMesh||node.isPoints||node.isLine){const material=[node.material].flat()[0];if(material&&!warmListedMaterials.has(material)){warmListedMaterials.add(material);warmQueue.push({node,root});}}for(const child of node.children)if(child.visible)visit(child);};if(root)visit(root);}
  warmSoon();
}
// Settles once the graphics process has passed the fence (polled: asking does not wait).
const fencePassed=fence=>new Promise(resolve=>{const gl=renderer.getContext(),poll=()=>{if(!diagnostic.error&&gl.clientWaitSync(fence,0,0)===gl.TIMEOUT_EXPIRED){setTimeout(poll,8);return;}gl.deleteSync(fence);resolve();};poll();});
function warmSoon(){
  if(warming||!warmQueue.length)return;warming=true;
  later('first draws',function*(){
    while(warmQueue.length){if(uniforms.uDive.value>0){warmQueue.length=0;break;}yield GPU;if(warmQueue.length&&uniforms.uDive.value===0&&warmStep()){const gl=renderer.getContext(),fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();if(fence)yield fencePassed(fence);}}
    warming=false;if(warmListed)startup.warmedAt??=Math.round(performance.now());
  }).catch(error=>{warming=false;console.warn('First draws stopped:',error);});
}
function warmStep(){
  // Up to 96 draws whose programs have been used before, or exactly one that uses a new one. True when there was one.
  const batch=[],hidden=[];let fresh=false;
  while(warmQueue.length&&batch.length<96){const item=warmQueue.shift(),material=[item.node.material].flat()[0];batch.push(item);if(material&&!warmed.has(material)){warmed.add(material);fresh=true;break;}}
  for(const item of batch){
    for(let node=item.root;node&&node!==scene;node=node.parent)if(!node.visible){node.visible=true;hidden.push(node);}
    if(item.geometry){item.usual=item.node.geometry;item.node.geometry=item.geometry;}
    item.node.layers.enable(1);
  }
  // The target is drawn into exactly as the frame is (see makePost), so the programs and their state are the frame's own.
  if(!warmTarget){warmTarget=new THREE.WebGLRenderTarget(8,8,{depthBuffer:true,generateMipmaps:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});warmTarget.isXRRenderTarget=true;warmTarget.texture.colorSpace=THREE.SRGBColorSpace;warmTarget.texture.internalFormat='RGBA8';}
  const target=renderer.getRenderTarget();renderer.setRenderTarget(warmTarget);renderer.render(scene,warmCamera);renderer.setRenderTarget(target);
  for(const item of batch){item.node.layers.disable(1);if(item.geometry)item.node.geometry=item.usual;}
  for(const node of hidden)node.visible=false;
  return fresh;
}
// Anti-aliasing. Multisampling is close to free on a discrete GPU and on a phone's tile renderer, and a fifth of the
// frame on a laptop's integrated one (3 to 5 ms of 17 under water at 1280x800). There the scene is drawn once per pixel
// into a target the size of the canvas and a single pass smooths the edges of the finished picture (see smoothFragment).
// ?aa=msaa|smooth|none overrides the choice for a comparison.
let post=null,antialias='msaa';
function chooseAntialias(){
  const asked=new URLSearchParams(location.search).get('aa');
  if(asked==='msaa'||asked==='smooth'||asked==='none')return asked;
  if(quality!=='standard')return 'none';
  return gpuTier==='integrated'&&!diagnostic.gpuTiled&&!window.oceanViewer?'smooth':'msaa';
}
function makePost(){
  const target=new THREE.WebGLRenderTarget(4,4,{depthBuffer:true,generateMipmaps:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
  // Drawn into exactly as onto the canvas: tone-mapped and encoded by each material (three does both for the canvas and for an XR target), eight bits a channel.
  target.isXRRenderTarget=true;target.texture.colorSpace=THREE.SRGBColorSpace;target.texture.internalFormat='RGBA8';
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  const material=new THREE.ShaderMaterial({uniforms:{tFrame:{value:target.texture},uTexel:{value:new THREE.Vector2(1,1)}},vertexShader:smoothVertex,fragmentShader:smoothFragment,depthTest:false,depthWrite:false,fog:false,toneMapped:false});
  const mesh=new THREE.Mesh(geometry,material),stage=new THREE.Scene();mesh.frustumCulled=false;stage.add(mesh);
  post={target,stage,material,camera:new THREE.Camera()};
}
const postSize=new THREE.Vector2();
function sizePost(){if(!post)return;renderer.getDrawingBufferSize(postSize);if(post.target.width!==postSize.x||post.target.height!==postSize.y)post.target.setSize(postSize.x,postSize.y);post.material.uniforms.uTexel.value.set(1/postSize.x,1/postSize.y);}
// One frame: the scene, then the smoothing pass where there is one. renderer.info is reset here, so it counts a whole frame.
function drawFrame(){
  renderer.info.reset();
  if(!post){renderer.render(scene,camera);return;}
  sizePost();renderer.setRenderTarget(post.target);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(post.stage,post.camera);
}
// Ends the current task so a frame can be drawn; a message, not a timer, so a background tab is not held to one step a second.
const nextTask=()=>new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=()=>resolve();channel.port2.postMessage(0);});
// Parts added to something already on show (the props laid out around the landmarks once the models have settled)
// stay hidden until their shaders have linked, and above water are drawn once like everything else.
async function showWhenReady(nodes){
  if(!nodes.length)return;
  try{await later('prop shaders',function*(){const linking=new Set();for(const node of nodes)yield* compileSteps(node,linking);yield programsLinked(linking);});}catch{}
  for(const node of nodes)node.userData.waiting=false;
  if(uniforms.uDive.value===0)warmLater(...nodes);wake();
}
async function prepare(root,urgent=false){
  const textures=new Set();
  root.traverse(node=>{for(const material of [node.material].flat())if(material)for(const key of ['map','emissiveMap','alphaMap'])if(material[key]?.image)textures.add(material[key]);});
  try{await later('model shaders',()=>compileSteps(root),{urgent});}catch{}
  for(const texture of textures)try{await later('texture upload',()=>{renderer.initTexture(texture);},{gpu:true,urgent});}catch{}
  if(uniforms.uDive.value===0)warmLater(root);
  prepared.add(root);wake();
}
// Prewarm after the surface is interactive; the dive button can request it sooner.
// Visitors who explicitly enable data saving defer these downloads until diving.
function preloadModels(){
  // Begin only after the surface is interactive. Work remains frame-budgeted on
  // phones too; an explicit data-saving preference defers model downloads.
  // Check before attaching intent listeners: keyboard focus and hover are not a dive.
  if(navigator.connection?.saveData){diagnostic.prewarm='data-saver';return;}
  const button=$('#dive');
  const start=()=>{if(!diagnostic.ready)return;modelsWanted=true;startUnderwater();beginModels();wake();};
  button.addEventListener('pointerenter',start,{once:true});button.addEventListener('focus',start,{once:true});
  diagnostic.prewarm='loading';startup.prewarmAt=Math.round(performance.now());start();
}

let diveAskedNow=null;const diveAsked=new Promise(resolve=>{diveAskedNow=resolve;});
// Downloads ahead of the work that needs them. The landmark files go first, as soon as the build starts: the dive waits
// on them. The creature set's follow once those are in (they share the connection), as soon as the build starts in
// standard detail, which loads the set right after the landmarks anyway, and in economy once a dive is asked for
// (Dive in, Show me around): the guided dive shows those animals, and it should not reach one still in transit.
let filesFetched=null,enrichmentFetched=false;
const prefetchFiles=()=>filesFetched??=import('./model-scene.js').then(({prefetchLandmarks})=>prefetchLandmarks(quality==='economy')).catch(()=>{});
function prefetchEnrichment(){
  if(enrichmentFetched)return;enrichmentFetched=true;
  prefetchFiles().then(()=>import('./user-creatures.js')).then(({prefetchCreatures})=>prefetchCreatures()).catch(()=>{});
}
diveAsked.then(prefetchEnrichment);
// Everything a first dive and the guided dive show: the landmarks and the optional creature and coral sets have all
// settled (loaded or failed; either way nothing more is coming). oceanControls.world.whenEnriched, oceanDiagnostics.enriched.
let enrichedDone=null;const enriched=new Promise(resolve=>{enrichedDone=()=>{diagnostic.enriched=true;startup.enrichedAt??=Math.round(performance.now());resolve();};});
function beginModels(){
  // The models stand on the reef: asked for sooner, they start the moment it exists, part way through the build (see
  // buildUnderwater), and are grounded and prepared while the rest of it is built. What they add to the collision world
  // waits for the end of the build (deferred below), so the parts built after the reef find that world exactly as they
  // did when the landmarks came after them, and the props laid out around them wait for the set pieces.
  if(!reef){modelsWanted=true;return;}
  if(modelsLoading||modelScene)return;modelsLoading=true;
  const deferred=[],collisions=reef.userData.collisions&&{addBox:(...box)=>{if(built)reef.userData.collisions.addBox(...box);else deferred.push(box);}};
  // Three pipelines parse, bake and compile for a few seconds; the frame-rate windows wait for all of them (see frame()).
  const busy=promise=>{modelsBusy++;return promise.finally(()=>{modelsBusy--;scaler.state.settling=1;});};
  const landmarksLoad=busy(import('./model-scene.js').then(({createModelScene})=>{
    if(!reef)return;modelScene=createModelScene({reef,terrainHeightAt:reef.userData.terrainHeightAt,collisions,economy:quality==='economy',onStatus:value=>{if(value.status==='loading')diagnostic.modelLoading=true;diagnostic.modelsLoaded=value.loaded??diagnostic.modelsLoaded??0;diagnostic.modelsFailed=value.failed??diagnostic.modelsFailed??0;if(value.status==='fallback'&&value.message&&!exploration.state.transition)status.textContent='Some optional ocean models could not load.';}});
    scene.add(modelScene.root);interactionTargets=modelScene.landmarks||[];
    return modelScene.load().then(async result=>{stylizeImported(modelScene.root,{glow:'near'});const ready=prepare(modelScene.root,true);
      await worldBuilt;for(const box of deferred)reef.userData.collisions.addBox(...box);deferred.length=0;
      if(setPieces)await later('landmark props',()=>{const props=setPieces.place(modelScene.landmarks)||[];stylizeTree(setPieces.root);diagnostic.setPieces=setPieces.counts;for(const mesh of props){mesh.userData.waiting=true;mesh.visible=false;}showWhenReady(props);},{cost:20});modelScene.update(0,elapsed,playerPosition,night);diagnostic.modelLoading=false;diagnostic.modelsLoaded=result.loaded;diagnostic.modelsFailed=result.failed;for(const item of reefLabels){const placed=modelScene.landmarks.find(p=>p.id===item.landmark.id);if(placed){item.anchor.fromArray(placed.position).add(new THREE.Vector3(0,1.2,0));const marker=document.querySelector(`[data-landmark="${placed.id}"]`);if(marker){marker.style.left=`${(placed.position[0]+62)/124*100}%`;marker.style.top=`${(placed.position[2]+105)/140*100}%`;}item.label.querySelector("span").textContent=`Seafloor landmark · ${Math.round(toDisplayDepth(-placed.position[1]))} m`;}}diagnostic.reefFishCount=result.reefFishCount;diagnostic.reefFishGroups=result.reefFishGroups;return ready.then(()=>{diagnostic.landmarksReady=true;startup.landmarksReadyAt=Math.round(performance.now());experienceMetrics.mark('landmarksReady');});});
  }).catch(error=>{console.warn('Optional landmark models could not load:',error);diagnostic.modelLoading=false;}).finally(()=>{modelsLoading=false;diagnostic.landmarksSettled=true;wake();}));
  // Keep the first dive's essential destinations ahead of optional model parsing and texture uploads.
  // Existing generated schools/coral are already part of the reef; optional packs enrich them afterward.
  // Failure still settles this promise, so missing landmark assets cannot prevent wildlife from loading.
  diagnostic.optionalModels='waiting-for-landmarks';
  // In economy detail (phones, small machines) they also wait for a dive to be asked for: a visit that only reads the
  // portfolio at the surface is spared their 9 MB and the seconds of parsing and baking, and a dive gets them a few
  // seconds into its descent, as the enrichment they are (nothing waits on them).
  landmarksLoad.then(()=>worldBuilt).then(()=>{if(quality!=='economy'||diveTarget===1||viewerOrbit)return;diagnostic.optionalModels='waiting-for-dive';return diveAsked;}).then(()=>nextTask()).then(()=>{
    if(diagnostic.error||optionalModelsStarted)return;optionalModelsStarted=true;
    diagnostic.optionalModels='loading';startup.optionalModelsAt=Math.round(performance.now());
  // The creature set (user-creatures.js): residents on the reef, schools by the coral, and big animals that come and go.
  const creaturesLoad=busy(import('./user-creatures.js').then(({createUserCreatures})=>{userCreatures=createUserCreatures({terrainHeightAt:reef.userData.terrainHeightAt,collisions:reef.userData.collisions,economy:quality==='economy',sites:{formations:heroFormations?.sites||[],life:livingWorld?.sites||[],landmarks:LANDMARKS,patches:()=>userCorals?.diagnostics?.patches||[]}});scene.add(userCreatures.root);userCreatures.root.visible=false;diagnostic.userCreatures=userCreatures.diagnostics;return userCreatures.load();}).then(()=>{stylizeTree(userCreatures.root,{toon:.25,rim:.22,caustics:.45});return prepare(userCreatures.root);}).catch(error=>console.warn('New creature set unavailable:',error)));
  const coralsLoad=busy(import('./user-corals.js').then(({createUserCorals})=>{userCorals=createUserCorals({terrainHeightAt:reef.userData.terrainHeightAt,collisions:reef.userData.collisions,economy:quality==='economy'});scene.add(userCorals.root);userCorals.root.visible=false;diagnostic.userCorals=userCorals.diagnostics;return userCorals.load();}).then(()=>{stylizeTree(userCorals.root,{toon:.3,rim:.2,caustics:.55});return prepare(userCorals.root);}).catch(error=>console.warn('New coral set unavailable:',error)));

    Promise.allSettled([creaturesLoad,coralsLoad]).then(()=>{diagnostic.optionalModels='settled';experienceMetrics.mark('optionalModelsSettled');enrichedDone();});
  }).catch(error=>{console.warn('Optional ocean enrichment could not start:',error);enrichedDone();});
}
// Set for one frame when the diver is moved at once (start-at-site, tour cuts): the camera cuts with it instead of sweeping.
let snapCamera=false;
Object.defineProperty(window,'oceanControls',{configurable:true,value:{getPlayerPosition,getCamera:()=>camera,getScene:()=>scene,viewer:{get orbit(){return viewerOrbit;},layers:()=>({reef,creatures:[marine?.root,extraLife?.root,userCreatures?.root],corals:userCorals?.root,models:modelScene?.root,diver:diver?.root,water,coast:distantScenery?.root,clouds:clouds?.group,life:livingWorld?.root,formations:heroFormations?.root}),focusPoint(point,distance=30){if(!viewerOrbit)return;viewerOrbit.target.copy(point);camera.position.copy(point).add(new THREE.Vector3(distance*.6,distance*.3,distance));viewerOrbit.update();wake();},focus(preset){const views={surface:[[0,2,0],35],reef:[[0,-18,-35],25],deep:[[0,-40,-82],25],overview:[[0,-15,-45],110]};const [point,distance]=views[preset]||views.reef;this.focusPoint(new THREE.Vector3(...point),distance);}},getMode,getTransition,getRenderer:()=>renderer,
  // Weather: set('clear'|'rain'|'storm') cross-fades to that state and holds it, set('auto') lets it drift again. Time: lock stops the clock advancing by itself; scrubbing and presets still work.
  weather:{get state(){return weather?.state??'clear';},get target(){return weather?.target??'clear';},get locked(){return weather?.locked??false;},set(name){const result=weather?.set(name);wake();return result;},lock(value=true){const result=weather?.lock(value);wake();return result;},states:['clear','rain','storm']},
  time:{get locked(){return timeLocked;},lock(value=true){timeLocked=Boolean(value);diagnostic.timeLocked=timeLocked;try{localStorage.setItem('ocean-time-lock',timeLocked?'1':'0');}catch{}window.dispatchEvent(new CustomEvent('oceantimelockchange',{detail:{locked:timeLocked}}));wake();return timeLocked;}},
  // QA hook: advance the simulation in fixed steps when the tab is not painting.
  step(seconds=1,dt=1/30){finishUnderwater();for(let t=0;t<seconds;t+=dt){elapsed+=dt;hudForce=t+dt>=seconds;updateWorld(dt,dt);window.oceanJourney?.tick(dt);}drawFrame();diagnostic.frames++;},
  // QA hook: draw the current state once more, exactly as the frame loop draws it (smoothing pass included).
  render:drawFrame,
  // How often the scene draws: 'full', 'reduced' (30 a second), 'idle' (15), or 'auto' to let the page decide (dialogs, the settings panel, an untouched surface).
  setRenderBudget(mode='auto'){budgetAsked=mode==='full'||mode==='reduced'||mode==='idle'?mode:'auto';wake();return budgetAsked;},get renderBudget(){return renderBudget();},
  // QA hook: one pass of the real frame loop (pacing, budget, adaptive scale, warm-up, draw) as if the browser had called it at `now` ms, for a tab that is not painting.
  tick(now){const was=focused;focused=true;ticking=true;try{frame(now);}finally{ticking=false;cancelAnimationFrame(raf);running=false;focused=was;}return diagnostic.frames;},
  // QA hook: finish the first-dive warm-up at once (the frame loop spreads it over the first idle seconds). Returns the draws it made.
  warm(){finishUnderwater();listWarm();let steps=0;while(warmQueue.length){warmStep();steps++;}return steps;},
  // The world under the water is built after the surface is ready. built: every part exists; ready: its shaders have linked too.
  // finish() builds whatever is left at once (a stall of a second or so) and whenReady resolves when a dive can go straight under.
  // whenEnriched: the landmarks and the optional sets have settled as well (see enriched), what the guided dive waits for before it sets off.
  world:{get built(){return built;},get ready(){return underReady;},finish(){finishUnderwater();return built;},get whenReady(){return worldReady;},get enriched(){return diagnostic.enriched===true;},get whenEnriched(){return enriched;}},
  // QA hook: after placing the camera by hand, cull the scene for it again.
  recull(){camera.updateMatrixWorld(true);refreshView();userCreatures?.update(0,playerPosition,viewerOrbit?null:view);if(built)cullWorld(0);},
  // Dive planner and guided tour hooks: autopilot, instant placement, dive start / surfacing, and the flashlight and scooter state.
  travel(point,focus,speed){exploration.travel(point,focus,speed);wake();},place(point,focus){exploration.place(point,focus);snapCamera=true;wake();},guide(value,free,looking){exploration.setGuided(value,free,looking);},frameDiver(value){preludeOn=Boolean(value);if(reducedMotion)prelude=Number(preludeOn);wake();},lookAt(point,follow){exploration.lookAt(point,follow);wake();},residentAt(id){return userCreatures?.residentAt?.(id)??null;},
  encounter(id,course){return userCreatures?.encounter?.(id,playerPosition,viewerOrbit?null:view,course)??false;},visitors(){return userCreatures?.visitors?.()??[];},
  travelPath(points,focus,speed){return exploration.travelPath(points,focus,speed);},
  cancelTravel(options){return exploration.cancelTravel(options);},
  // The guided dive's surface prelude: a dive is asked for, and goes under a couple of seconds from now. What it will wait
  // for starts at once (the build, the landmarks, and in economy detail the optional packs, which wait for a dive to be
  // asked for), with a little more of every frame (not most of it: the prelude's camera is moving). See guided-dive.js.
  expectDive(){if(!diagnostic.ready||diveTarget===1||getMode()!=='surface')return false;startUnderwater();modelsWanted=true;beginModels();diveAskedNow();hurry=Math.max(hurry,1);wake();return true;},
  startDive(options){if(!diagnostic.ready||diveTarget===1||getMode()!=='surface')return false;exploration.prepareDive(options);if(options?.at)snapCamera=true;$('#dive').click();return true;},
  surface(options){if(options?.instant)return surfaceNow();if(diveTarget!==1||exploration.state.mode!=='diver')return false;window.oceanTour?.stop();mapDestination=null;const started=exploration.beginAscent(reef?.userData.safeAscentRoute,true);wake();return started;},
  skipSafetyStop(){exploration.skipSafetyStop();},
  get nav(){return exploration.state;},get settings(){return settings;},get landmarks(){return modelScene?.landmarks||null;},get formations(){return heroFormations?.sites||[];},get life(){return livingWorld;},get creatures(){return userCreatures;},
  get flashlight(){return exploration.state.lamp;},set flashlight(value){exploration.setLamp(value);},get scooter(){return exploration.state.scooter;},
  get setPieces(){return setPieces;},get models(){return modelScene;},get reef(){return reef;},setInterfaceOpen,setSettingsMenuOpen,setComputerOpen,setSafetyStop,recapture:()=>exploration.recapture(),toggleCamera}});

function paintTheme(isNight,preset=isNight?'night':'day'){
  const theme=isNight?'night':'day';selectedNight=isNight;
  document.documentElement.dataset.theme=theme;
  for(const id of ['dawn','day','dusk','night'])$('#'+id).setAttribute('aria-pressed',String(id===preset));
  document.documentElement.dataset.skyPreset=preset;diagnostic.skyPreset=preset;
  $('meta[name="theme-color"]').content=isNight?'#10213b':'#b9dfea';diagnostic.theme=theme;
}
function setTheme(isNight,persist=true){
  setSkyPreset(isNight?'night':'day',persist);
}
function setSkyPreset(preset,persist=true){
  const wanted=skySystem?.presets[preset]??(preset==='night'?Math.PI:0);
  phaseTarget=phase+Math.atan2(Math.sin(wanted-phase),Math.cos(wanted-phase));
  if(reducedMotion){phase=phaseTarget;phaseTarget=null;night=skySystem?.getNightFactor(phase)??0;}
  paintTheme(preset==='night',preset);
  frameSurface(wanted);
  if(persist)try{localStorage.setItem('ocean-theme',preset);}catch{}
  wake();
}
function frameSurface(phaseValue=phase){
  if(!skySystem||exploration.state.mode!=='surface')return;
  const sun=skySystem.getState(phaseValue).sunDirection;
  // The horizontal sun direction uses east -Z / west +Z, consistent with the star map.
  surfaceFramingYaw=sun[2]<=0?0:Math.PI;
  exploration.frameSky(surfaceFramingYaw);
}
function updateMotionUI(){
  diagnostic.paused=paused;
  diagnostic.reducedMotion=reducedMotion;
  diagnostic.motionSource=motionPreference?'visitor':'system';
  document.body.dataset.motion=paused?'paused':'running';
  const button=$('#motion');
  if(button){button.setAttribute('aria-pressed',String(paused));button.textContent=paused?'Resume ocean motion':'Pause ocean motion';}
}
$('#motion')?.addEventListener('click',()=>{
  paused=!paused;reducedMotion=paused;motionPreference=paused?'reduced':'full';
  try{localStorage.setItem('ocean-motion',motionPreference);}catch{}
  updateMotionUI();hudForce=true;wake();
});
function setExploring(value){
  exploring=value;exploration.state.exploring=value;document.body.dataset.exploring=String(value);
  $('#explore').setAttribute('aria-pressed',String(value));$('#explore').innerHTML=value?'Release mouse <span>↙</span>':'Look around <span>↗</span>';wake();
}
$('#day').addEventListener('click',()=>setTheme(false));$('#night').addEventListener('click',()=>setTheme(true));
$('#dawn').addEventListener('click',()=>setSkyPreset('dawn'));$('#dusk').addEventListener('click',()=>setSkyPreset('dusk'));
$('#explore').addEventListener('click',()=>{if(exploring){exploration.setInterfaceOpen(false);setExploring(false);}else{exploration.recapture();setExploring(true);}});
function paintAtlas(){
  $('.reef-map').dataset.collapsed=String(mapCollapsed);$('#map-toggle').setAttribute('aria-expanded',String(!mapCollapsed));$('#map-toggle').setAttribute('aria-label',mapCollapsed?'Expand reef atlas':'Collapse reef atlas');$('#map-toggle').textContent=mapCollapsed?'＋':'−';
}
$('#map-toggle').addEventListener('click',()=>{mapCollapsed=!mapCollapsed;paintAtlas();});
// A visitor reaching for a way into the water (Dive in, Show me around, Choose a destination): the first draws go one a
// frame from here on, since what is not drawn by the time the camera goes under is all paid in one frame there. A touch
// screen has no hover, so a finger landing on one counts too. (Delegated: the guided dive's buttons are added by dive-plan.js.)
const DIVE_WAYS='#dive,#guided-dive,#plan-dive';
for(const type of ['pointerover','pointerdown','focusin'])document.addEventListener(type,event=>{if(hurry<1&&event.target.closest?.(DIVE_WAYS)){hurry=1;wake();}},{passive:true,capture:true});
$('#camera-toggle')?.addEventListener('click',toggleCamera);
$('#capture-hint')?.addEventListener('click',()=>exploration.recapture());
$('#reset-view').addEventListener('click',()=>{exploration.reset();mapDestination=null;$('#map-caption').textContent='Choose a marker to swim closer.';});
function surfaceNow(){
  if(!diagnostic.ready||(!diagnostic.submerged&&diveTarget===0)||document.querySelector('dialog[open]'))return false;
  window.oceanTour?.stop();exploration.returnToSurface();
  dive=diveTarget=0;previousMode='surface';surfaceLandingTime=ascentCameraTime=0;
  computerOpen=false;mapDestination=null;snapCamera=true;hudForce=true;
  $('#map-caption').textContent='Choose a marker to swim closer.';
  $('#dive-label').textContent='Dive in';status.textContent='';
  frameSurface();setExploring(false);updateWorld(1/60);wake();return true;
}
$('#dive').addEventListener('click',()=>{
  if(!diagnostic.ready)return;const wasDiving=diveTarget===1;mapDestination=null;$('#map-caption').textContent='Choose a marker to swim closer.';
  diveTarget=wasDiving?1:1;
  $('#dive-label').textContent=wasDiving?'Ascending to the surface…':'Back to the surface';
  status.textContent=wasDiving?'Returning to the surface.':'Diving beneath the surface.';
  setTimeout(()=>{if(diagnostic.ready)status.textContent='';},1600);
  if(!wasDiving){startup.diveAskedAt??=Math.round(performance.now());exploration.startDive();beginModels();diveAskedNow();setExploring(true);hurry=Math.max(hurry,1);}
  else if(exploration.state.mode!=='surface'){window.oceanTour?.stop();exploration.beginAscent(reef?.userData.safeAscentRoute,true);}
  if(reducedMotion){dive=diveTarget;status.textContent='';}canvas.focus({preventScroll:true});wake();
});
addEventListener('keydown',event=>{if((event.code==='ShiftLeft'||event.code==='ShiftRight')&&!event.repeat&&diagnostic.ready&&getMode()==='surface'&&!interfaceOpen&&!movementPanelOpen&&!event.target.closest?.('input,textarea,select,[contenteditable="true"]')){event.preventDefault();$('#dive').click();}});
themeMedia.addEventListener('change',e=>{let stored;try{stored=localStorage.getItem('ocean-theme');}catch{}if(!stored)setTheme(e.matches,false);});
motionMedia.addEventListener('change',e=>{if(motionPreference)return;reducedMotion=e.matches;paused=reducedMotion;updateMotionUI();wake();});
addEventListener('resize',()=>{if(renderer){resize();wake();}});
document.addEventListener('visibilitychange',()=>{focused=!document.hidden;if(!focused){cancelAnimationFrame(raf);running=false;lastFrame=0;}else wake();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);running=false;diagnostic.ready=false;diagnostic.error='WebGL context lost';status.textContent='The ocean paused. Reload this page to restore the scene.';$('#dive').disabled=true;});
canvas.addEventListener('webglcontextrestored',()=>location.reload());

function resize(){
  const wasMobile=mobile;mobile=innerWidth<600;
  if(wasMobile!==mobile)mapCollapsed=mobile;paintAtlas();
  viewWidth=innerWidth;viewHeight=innerHeight;depthTrack=0;measureLabelBands();const scaleStep=scaler.state.step=Math.min(scaler.state.step,quality==='economy'?2:RENDER_SCALES.length-1);
  const ratio=fullRatio()*RENDER_SCALES[scaleStep];
  renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight,false);uniforms.uRatio.value=ratio;sizePost();
  camera.aspect=innerWidth/innerHeight;camera.fov=settings.cameraFov+(mobile?7:0);camera.updateProjectionMatrix();
  if(getMode()==='surface')frameSurface();diagnostic.pixelRatio=ratio;diagnostic.renderScale=RENDER_SCALES[scaleStep];
}
function makeWater(){
  const grid=segments=>{const geo=new THREE.PlaneGeometry(2,2,segments,segments),p=geo.getAttribute('position');
    for(let i=0;i<p.count;i++){const x=p.getX(i),z=-p.getY(i);p.setXYZ(i,(x*.015+Math.pow(x,5)*.985)*1600,0,(z*.015+Math.pow(z,5)*.985)*1600-45);}
    geo.computeBoundingSphere();return geo;};
  // From below the swell is seen through haze: the economy grid carries it there with a third of the vertices.
  const geo=waterFine=grid(quality==='economy'?96:160);waterCoarse=quality==='economy'?geo:grid(96);
  // Calm water is a program without foam streaks and rain rings; the weather one waits on a hidden mesh so both compile at start-up.
  waterCalm=new THREE.ShaderMaterial({uniforms,vertexShader:waterVertex,fragmentShader:waterFragment,side:THREE.DoubleSide});
  waterRough=new THREE.ShaderMaterial({uniforms,defines:{WATER_WEATHER:1},vertexShader:waterVertex,fragmentShader:waterFragment,side:THREE.DoubleSide});
  water=new THREE.Mesh(geo,waterCalm);
  const spare=new THREE.Mesh(geo,waterRough);spare.visible=false;spare.name='Water program warm-up';scene.add(spare);
  // The swell and the sky shell are full-screen shaders: drawn after everything else opaque, they only run on pixels still uncovered.
  water.name='Analytic ocean swells';water.frustumCulled=false;water.renderOrder=20;scene.add(water);
  skySystem.root.traverse(node=>{if(node.isMesh&&node.material.side===THREE.BackSide&&!node.material.transparent)node.renderOrder=30;});
}
// The landmarks' labels and chart markers need only the list of them: they are on the page from the start.
function makeLandmarkMarks(){
  for(const [index,landmark] of LANDMARKS.entries()){
    const label=document.createElement('div');label.className='reef-label';label.innerHTML=`${landmark.title}<span>${landmark.description.replace(/\d+(?:\.\d+)? m/, `${Math.round(toDisplayDepth(-landmark.position[1]))} m`)}</span><i></i>`;$('#reef-labels').append(label);label.style.left=label.style.top='0';reefLabels.push({label,landmark,shift:' translate(-50%,-100%)',anchor:new THREE.Vector3(...landmark.position).add(new THREE.Vector3(0,2,0))});
    const marker=document.createElement('button');marker.type='button';marker.textContent=String(index+1);marker.setAttribute('aria-label',`Map marker ${landmark.title}`);marker.title=landmark.title;marker.dataset.landmark=landmark.id;
    marker.style.left=`${(landmark.position[0]+62)/124*100}%`;marker.style.top=`${(landmark.position[2]+105)/140*100}%`;
    const visit=()=>{if(!diagnostic.submerged)return;mapDestination=landmark;const target=modelScene?.landmarks?.find(item=>item.id===landmark.id);const approach=target?.interactionPosition;exploration.travel(approach||landmark.position,target?.position||landmark.position);setExploring(true);canvas.focus({preventScroll:true});$('#map-caption').textContent=`Swimming toward ${landmark.title}. WASD takes control.`;};
    marker.addEventListener('click',visit);$('#map-chart').append(marker);
    const legend=document.createElement('button');legend.type='button';legend.setAttribute('aria-label',`Swim to ${landmark.title}`);legend.innerHTML=`<span>0${index+1}</span>${landmark.title}`;legend.addEventListener('click',visit);$('#map-legend').append(legend);
  }
}
// The chart samples the seabed 160,000 times. The heights are worked out a few rows a step and handed to
// drawReefChart() in the order it asks for them; a sample it asks for anywhere else is simply computed.
function* chartSteps(){
  if(drawPreparedChart('hud',document.querySelector('#reef-bathymetry'))){diagnostic.preparedChart=true;return;}
  const size=400,span=240,half=span/2,centreZ=-35,xs=new Float64Array(size),zs=new Float64Array(size),heights=new Float64Array(size*size);
  for(let i=0;i<size;i++){xs[i]=(i+.5)/size*span-half;zs[i]=(i+.5)/size*span-half+centreZ;}
  for(let y=0;y<size;y++){for(let x=0;x<size;x++)heights[y*size+x]=terrainHeightAt(xs[x],zs[y]);if(y%16===15)yield;}
  let next=0;yield 30;
  drawReefChart((x,z)=>{const i=next++;return i<heights.length&&x===xs[i%size]&&z===zs[(i/size)|0]?heights[i]:terrainHeightAt(x,z);});
}
// Everything under the water, built in the order the parts depend on each other: the reef (seabed, coral, collision
// world), the chart, the animals, the set pieces and formations that stand on the reef and add to its collisions, the
// living world that reads them, then the shafts, bubbles and motes. As a generator it is run a few ms at a time between
// frames (see later()); finishUnderwater() runs what is left of it at once. Each part is added hidden and shown by
// updateWorld() once all of them exist, and its shader sources are handed to the browser as soon as it is built, so
// they compile while the rest is being made.
function* buildUnderwater(linking){
  const economy=quality==='economy';
  // First the programs of the surface that its first frame did not need (see boot).
  buildStage='spares';yield* compileSteps(scene,linking);
  buildStage='reef';yield;
  reef=yield* reefSteps({economy});reef.visible=false;scene.add(reef);
  exploration.setCollisions(reef.userData.collisions);if(modelsWanted)beginModels();
  diagnostic.collisionPieces=reef.userData.collisions?.count??0;diagnostic.habitats=reef.userData.habitatCounts;
  yield;stylizeTree(reef,{glow:'near'});yield* compileSteps(reef,linking);warmFirst(reef);
  buildStage='chart';yield* chartSteps();
  buildStage='animals';yield 8;
  marine=yield* marineLifeSteps({economy,terrainHeightAt,collisions:reef.userData.collisions});marine.root.visible=false;scene.add(marine.root);diagnostic.fishCount=marine.count;
  yield;extraLife=yield* underwaterLifeSteps({economy,terrainHeightAt});extraLife.root.visible=false;scene.add(extraLife.root);diagnostic.extraLife=extraLife.counts;
  yield 5;setPieces=createSetPieces({terrainHeightAt,collisions:reef.userData.collisions,economy});setPieces.root.visible=false;scene.add(setPieces.root);diagnostic.setPieces=setPieces.counts;
  yield;stylizeTree(marine.root,{toon:.35,rim:.45,caustics:.5});stylizeTree(extraLife.root,{rim:.42});stylizeTree(setPieces.root);
  yield* compileSteps(marine.root,linking);yield* compileSteps(extraLife.root,linking);yield* compileSteps(setPieces.root,linking);warmFirst(marine.root,extraLife.root,setPieces.root);
  // The polyp glows reach about fifteen metres: only what stands inside that takes them (see ocean-look.js). The diver, who swims through them, takes one colour.
  buildStage='formations';yield;
  const formations=yield* heroFormationSteps({terrainHeightAt,collisions:reef.userData.collisions,economy});
  yield;stylizeTree(formations.root,{glow:'near'});formations.root.visible=false;scene.add(formations.root);heroFormations=formations;diagnostic.heroFormations=heroFormations.counts;
  yield* compileSteps(formations.root,linking);warmFirst(formations.root);
  // Built after the formations so its height map sees their collision boxes; nothing in it is solid.
  buildStage='living';yield;
  const living=yield* livingWorldSteps({terrainHeightAt,collisions:reef.userData.collisions,economy,uniforms});
  yield;scene.add(living.root);livingWorld=living;diagnostic.livingWorld=livingWorld.counts;
  yield* compileSteps(living.root,linking);warmFirst(living.under,...Object.values(living.debug?.surface?.meshes||{}));
  diagnostic.visitorCount=0;
  buildStage='effects';yield;
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:beamVertex,fragmentShader:beamFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  // Shafts wrap around the swimmer, so light follows the whole dive. They are instances of one quad: a single draw call.
  for(let i=0;i<(quality==='economy'?10:16);i++)beams.push({width:1.6+rng()*3.4,home:new THREE.Vector2((rng()-.5)*72,(rng()-.5)*72),spin:new THREE.Quaternion().setFromAxisAngle(axisY,rng()*Math.PI)});
  const shafts=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,34),material,beams.length);shafts.name='Sun shafts';shafts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);shafts.frustumCulled=false;shafts.renderOrder=2;shafts.visible=false;scene.add(shafts);
  // Transparent rims and a small reflected highlight make these read as air.
  const bubbleMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uNight:uniforms.uNight},
    vertexShader:`varying vec3 vNormal;varying vec3 vView;void main(){vec4 p=instanceMatrix*vec4(position,1.);vec4 mv=modelViewMatrix*p;vNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);vView=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform float uNight;varying vec3 vNormal;varying vec3 vView;void main(){vec3 n=normalize(vNormal);float edge=pow(1.-abs(dot(n,normalize(vView))),2.7);float glint=pow(max(0.,dot(n,normalize(vec3(-.45,.7,.6)))),22.);gl_FragColor=vec4(mix(vec3(.72,.93,.97),vec3(.47,.72,.89),uNight)+glint*.3,edge*.48+glint*.64+.015);}`});
  const air=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,6),bubbleMaterial,72);air.instanceMatrix.setUsage(THREE.DynamicDrawUsage);air.frustumCulled=false;air.visible=false;scene.add(air);
  for(let i=0;i<72;i++)bubbleData.push({birth:-100,position:new THREE.Vector3(),size:.04,drift:0});
  yield;
  const positions=[];for(let i=0;i<(mobile?420:850);i++){const x=(rng()-.5)*120,z=30-rng()*135;positions.push(x,terrainHeightAt(x,z)+2+rng()*15,z);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const dust=new THREE.Points(geo,new THREE.ShaderMaterial({uniforms:{uTime:uniforms.uTime,uRatio:uniforms.uRatio},transparent:true,depthWrite:false,
    vertexShader:`uniform float uTime;uniform float uRatio;varying float vAlpha;void main(){vec3 p=position;p.x+=sin(uTime*.16+position.z*.06)*1.3;p.z+=sin(uTime*.11+position.x*.08)*.9;p.y+=sin(uTime*.19+position.x*.1)*.25;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(100.*uRatio/max(1.,-mv.z),1.,7.);vAlpha=.25*exp(-length(mv.xyz)*.026);}`,
    fragmentShader:`varying float vAlpha;void main(){vec2 p=(gl_PointCoord-.5)*vec2(1.,2.8);float a=exp(-dot(p,p)*8.);gl_FragColor=vec4(.68,.86,.91,a*vAlpha);}`}));dust.visible=false;scene.add(dust);
  beamGroup=shafts;bubbleMesh=air;motes=dust;
  yield* compileSteps(shafts,linking);yield* compileSteps(air,linking);yield* compileSteps(dust,linking);warmFirst(shafts,air,dust);
  // Meshes built with unshared vertices are shared now, a few thousand vertices a step (see assets.js), before anything of theirs is uploaded.
  buildStage='sharing';yield* shareSteps();
  built=true;diagnostic.underwater='built';builtDone();
}
let worldLinking=null,worldReadyDone=null,builtDone=null;
const worldBuilt=new Promise(resolve=>{builtDone=resolve;});
const worldReady=new Promise(resolve=>{worldReadyDone=resolve;});
// Queues the build, then waits for the browser to link its shaders: from then a dive goes under without compiling anything.
function startUnderwater(){
  if(buildSteps)return;
  worldLinking=new Set();buildSteps=buildUnderwater(worldLinking);diagnostic.underwater='building';
  // The landmarks are placed once the reef exists (beginModels), but their files can be on their way and parsed meanwhile.
  // (Not with Save-Data on: the files then come with the dive, see preloadModels.)
  if(!navigator.connection?.saveData){prefetchFiles();if(quality!=='economy')prefetchEnrichment();}
  const tally=ms=>{startup.under[buildStage]=+((startup.under[buildStage]||0)+ms).toFixed(1);};
  const queued=later(buildName,()=>buildSteps,{tally});
  queued.then(()=>{startup.builtAt=Math.round(performance.now());if(modelsWanted)beginModels();return programsLinked(worldLinking);})
    .then(()=>{if(diagnostic.error)return;underReady=true;diagnostic.underwater='ready';experienceMetrics.mark('reefReady');startup.underReadyAt??=Math.round(performance.now());scaler.state.settling=1;listWarm();worldReadyDone();wake();})
    .catch(fail);
}
// Builds whatever is left of the world at once: for the QA hooks, which step a scene nobody is drawing, and the orbit viewer.
function finishUnderwater(){
  if(built||!renderer||diagnostic.error)return;
  if(!buildSteps){worldLinking=new Set();buildSteps=buildUnderwater(worldLinking);diagnostic.underwater='building';later(buildName,()=>buildSteps).then(()=>{if(modelsWanted)beginModels();worldReadyDone();wake();}).catch(fail);}
  const before=performance.now();let step;while(!(step=buildSteps.next()).done);
  startup.under.atOnce=+(performance.now()-before).toFixed(1);startup.builtAt??=Math.round(performance.now());
  // Its programs may still be compiling: a frame that needs one now simply waits for it, as the first frame of the page used to.
  underReady=true;diagnostic.underwater='ready';experienceMetrics.mark('reefReady');startup.underReadyAt??=Math.round(performance.now());
}
// The first draws of everything under the water (see warmLater), listed once.
function listWarm(){
  if(warmListed||!built)return;warmListed=true;
  warmLater(reef,heroFormations.root,marine.root,extraLife.root,setPieces.root,beamGroup,motes,bubbleMesh,livingWorld.under,...Object.values(livingWorld.debug?.surface?.meshes||{}));scene.traverse(node=>{if(node.name.endsWith('program warm-up'))warmLater(node);});
  for(const cell of reef.userData.cells)if(cell.distant)warmQueue.push({node:cell.mesh,root:reef,geometry:cell.distant});if(waterCoarse!==waterFine)warmQueue.push({node:water,root:water,geometry:waterCoarse});
  warmSoon();
}
let bubblesAlive=true;
function updateBubbles(underwater){
  if(underwater>.5&&bubbleClock!==elapsed){
    if(elapsed>=nextBubble){
      // The regulator's world position is only needed at the moment of a burst.
      diver.root.updateMatrixWorld(true);
      if(diver.regulator)diver.regulator.getWorldPosition(emitter);else emitter.copy(diver.root.position);
      const burst=Math.sin(elapsed*2.1)>.1?5:2;
      for(let i=0;i<burst;i++){const b=bubbleData[bubbleCursor++%bubbleData.length];b.birth=elapsed;b.position.copy(emitter);b.size=.027+rng()*.047;b.drift=rng()*Math.PI*2;}
      nextBubble=elapsed+(.16+rng()*.16)*(1-.6*exploration.state.scooter);bubblesAlive=true;
    }
    bubbleClock=elapsed;
  }
  bubbleMesh.visible=underwater>.05&&bubblesAlive;
  if(!bubbleMesh.visible)return;
  // Living bubbles are packed to the front, so spent ones cost nothing.
  let alive=0;
  for(let i=0;i<bubbleData.length;i++){
    const b=bubbleData[i],age=elapsed-b.birth;
    if(age<0||age>=6)continue;
    dummy.position.copy(b.position);dummy.position.y+=age*.8;dummy.position.x+=Math.sin(age*2+b.drift)*age*.09;dummy.position.z+=Math.cos(b.drift)*age*.08;
    dummy.scale.setScalar(b.size*(1+age*.18));dummy.updateMatrix();bubbleMesh.setMatrixAt(alive++,dummy.matrix);
  }
  bubbleMesh.count=alive;bubbleMesh.instanceMatrix.needsUpdate=true;bubblesAlive=alive>0;
}
// A reef label stands aside for the guided dive's own interface: the clear-screen button, the tour sheet and the
// look-there marker. Their boxes are read a few times a second, not every frame.
const KEEP_OUT='#clear-ui-toggle:not([hidden]),section.tour-card[data-show="true"],.look-there[data-show="true"] span,.look-there[data-show="true"] i';
let keepOut=[],keepOutAt=-1;
function keptOut(x,y){
  const now=performance.now();
  if(now-keepOutAt>250){keepOutAt=now;keepOut=[];for(const el of document.querySelectorAll(KEEP_OUT)){const r=el.getBoundingClientRect();if(r.width&&r.height)keepOut.push(r);}}
  // A label is centred over its point and stands above it: about 150 px wide and 44 px tall at most.
  for(const r of keepOut)if(x+75>r.left&&x-75<r.right&&y>r.top&&y-44<r.bottom)return true;
  return false;
}
function labelVisible(worldPosition,item,alpha,padding=35){
  let shown=alpha>0;
  if(shown){
    // Use a separate temporary: callers sometimes pass relative itself.
    labelDirection.copy(worldPosition).sub(camera.position);
    shown=labelDirection.dot(viewDirection)>0;
  }
  if(shown){
    projected.copy(worldPosition).project(camera);
    const x=(projected.x*.5+.5)*viewWidth,y=(-projected.y*.5+.5)*viewHeight;
    shown=projected.z<1&&x>padding&&x<viewWidth-padding&&y>labelTop&&y<viewHeight-labelBottom&&!keptOut(x,y);
    // Moved by transform alone, so a label that tracks the camera costs the page no layout.
    if(shown)item.label.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)${item.shift}`;
  }
  // A hidden label keeps its last position and is not written again.
  const opacity=shown?String(alpha):'0';
  if(item.opacity!==opacity){item.opacity=opacity;item.label.style.opacity=opacity;}
}
// Haze range: beyond it the shared look has absorbed a surface to under about
// 1.5 % of its colour, so reef cells, schools and animals out there are skipped.
function refreshView(){
  // Clearer water (look.uLookClarity) reaches further, so what is drawn reaches as far.
  view.eye.copy(camera.position);view.range=4.2*look.uLookClarity.value/(THREE.MathUtils.lerp(.021,.034,look.uLookDepth.value)+.008);
  view.frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
}
function cullWorld(dt){
  // The orbit viewer looks at the whole reef from far away: nothing is culled there.
  const culling=viewerOrbit?null:view;
  reef.userData.cull(view.eye,culling?view.range:Infinity);heroFormations?.cull(culling);setPieces?.cull(culling);
  marine.update(dt,elapsed,playerPosition,culling);extraLife.update(dt,elapsed,playerPosition,culling);largeMarine?.update(dt,culling);modelScene?.update(dt,elapsed,playerPosition,night,culling);reef.userData.update?.(elapsed,night,uniforms.uDepth.value);
}
function paintHud(nav,submerged,depth,edge,skyState){
  const ascending=nav.mode==='transition';
  setText(hud('#look-hint'),nav.mode==='transition'?`Ascending · ${Math.ceil(toDisplayDepth(nav.ascentDepth))} m remaining`:nav.pointerLocked?(submerged?(settings.keyboardMode==='turn'?'W/S swim · A/D turn':'WASD swim')+' · Space/Shift depth · E scooter · Q light · Esc / ; frees mouse':'Look around · Mouse or arrow keys · Esc / ; releases mouse'):submerged?'Click ocean to aim · '+(settings.keyboardMode==='turn'?'W/S swim · A/D turn':'WASD swim')+' · E scooter · Q light':'Click the ocean to look around · Esc / ; releases mouse');
  setText(hud('#depth-value'),`${String(Math.round(toDisplayDepth(depth))).padStart(2,'0')} M`);
  // The marker moves by whole pixels of its track (measured once, and again after a resize): a tenth of a percent was a layout write every six centimetres of depth.
  if(!depthTrack)depthTrack=hud('#depth-marker')?.parentElement?.clientHeight||-1;
  setStyle('#depth-marker','top',depthTrack>0?`${Math.round(Math.min(toDisplayDepth(depth)/DISPLAY_MAX_DEPTH,1)*depthTrack)}px`:`${Math.round(Math.min(toDisplayDepth(depth)/DISPLAY_MAX_DEPTH,1)*100)}%`);
  setHidden(hud('#capture-hint'),!(submerged&&!nav.exploring&&!nav.pointerLocked&&!ascending));
  setHidden(hud('#crosshair'),!(nav.pointerLocked&&(nav.mode==='diver'||nav.mode==='surface')));
  const cameraButton=hud('#camera-toggle');if(cameraButton){setHidden(cameraButton,!submerged);setAttribute(cameraButton,'aria-pressed',String(nav.perspective==='third'));setText(cameraButton,nav.perspective==='third'?'First-person view · V':'Third-person view · V');}
  const diveButton=hud('#dive');if(diveButton.disabled!==ascending)diveButton.disabled=ascending;
  const ascentStatus=hud('#ascent-status');if(ascentStatus){setHidden(ascentStatus,!ascending);setText(ascentStatus,`ASCENDING · ${Math.ceil(toDisplayDepth(nav.ascentDepth))} M TO SURFACE`);}
  setText(hud('#scene-location'),submerged?(edge?'REEF DROP-OFF':'CORAL GARDENS'):'AT THE SURFACE');
  // In the round minimap the stylesheet pins the marker and hud.js steers it: these three are only written for the full chart.
  if(hud('.reef-map')?.dataset.view!=='round'){setStyle('#map-player','left',`${((playerPosition.x+62)/124*100).toFixed(2)}%`);setStyle('#map-player','top',`${((playerPosition.z+105)/140*100).toFixed(2)}%`);setStyle('#map-player','--heading',`${(-nav.yaw).toFixed(3)}rad`);}
  const bearing=((90-Math.atan2(-viewDirection.x,-viewDirection.z)*180/Math.PI)%360+360)%360;
  setText(hud('#heading-value'),`${String(Math.round(bearing)).padStart(3,'0')}°`);
  setText(hud('#heading-cardinal'),CARDINALS[Math.round(bearing/45)%8]);
  setAttribute(hud('.heading-indicator'),'aria-label',`Heading ${Math.round(bearing)} degrees. North is ${Math.round((360-bearing)%360)} degrees clockwise.`);
  setText(hud('#speed-value'),`${nav.speed.toFixed(1)} M/S`);
  setText(hud('#reef-zone'),nav.colliding?'CORAL NEARBY':nav.atBoundary?'EXPLORATION LIMIT':edge?'OUTER SLOPE':'REEF SHELF');
  const skyTime=skyState.date?skyClock(skyState.date):'';
  setText(hud('#sky-clock'),`KL ${skyTime} · ${paused?'PAUSED':'72× TIME'}`);
  setAttribute(hud('#sky-clock'),'title','Kuala Lumpur sky · current lunar phase · 20 minutes per simulated day');
  // Diagnostics nobody polls per frame follow the HUD rate.
  projected.copy(diver.root.position).project(camera);
  let activeBubbles=0;for(const b of bubbleData)if(elapsed-b.birth>=0&&elapsed-b.birth<6)activeBubbles++;
  diagnostic.diverScreen=projected.toArray();diagnostic.bounds=exploration.bounds;diagnostic.look=[nav.yaw,nav.pitch];diagnostic.sunDirection=uniforms.uSun.value.toArray();diagnostic.moonDirection=uniforms.uMoon.value.toArray();diagnostic.activeBubbles=activeBubbles;
  Object.assign(diagnostic,{simulatedUTC:skyState.simulatedUTC,observer:skyState.observer,moonIllumination:skyState.moonIllumination,moonPhaseAngle:skyState.moonPhaseAngle,sunAltitude:skyState.sunAltitude,moonAltitude:skyState.moonAltitude,movement:{...settings}});
}
function updateWorld(dt,clockDt=dt){
  if(phaseTarget!==null){phase=THREE.MathUtils.lerp(phase,phaseTarget,1-Math.exp(-dt*1.6));if(Math.abs(phase-phaseTarget)<.002){phase=phaseTarget;phaseTarget=null;}}
  else if(!paused&&!timeLocked&&!expeditionUI?.isScrubbing())phase+=clockDt*Math.PI*2/cycleSeconds;
  night=skySystem.getNightFactor?skySystem.getNightFactor(phase):THREE.MathUtils.smoothstep(-Math.cos(phase),-.15,.3);
  // The preset name only changes around dawn and dusk, and finding it costs two more ephemeris evaluations: look twice a second.
  if(phaseTarget===null&&++presetTick>=30){presetTick=0;const altitude=skySystem.getState(phase).sunAltitude;const rising=skySystem.getState(phase+.0001).sunAltitude>altitude;const preset=altitude>-6&&altitude<8?(rising?'dawn':'dusk'):night>.5?'night':'day';if(diagnostic.skyPreset!==preset)paintTheme(night>.5,preset);}
  dive=THREE.MathUtils.lerp(dive,diveTarget,1-Math.exp(-dt*settings.diveResponse));if(Math.abs(dive-diveTarget)<.002)dive=diveTarget;
  // A dive asked for before the world under the water is ready waits in the first tenth of the transition, the camera
  // still above the surface, while the rest is built with most of every frame's time (see afterFrame); the status line
  // says so if that takes more than a moment. The first draws get up to two and a half seconds of it as well (of the
  // page's clock as well as the scene's: on a slow device frames come so far apart that the scene's ran at half speed).
  if(diveTarget===1&&(!underReady||!diagnostic.landmarksSettled||warmQueue.length&&diveHeldFor>0&&diveHeldFor<2.5&&performance.now()-startup.heldFrom<2500)){if(!diveHeldFor)startup.heldFrom=Math.round(performance.now());if(!buildSteps)startUnderwater();modelsWanted=true;if(built)beginModels();dive=Math.min(dive,DIVE_HOLD);diveHeldFor+=Math.max(dt,1e-4);hurry=2;if(diveHeldFor>.7&&(!underReady||!diagnostic.landmarksSettled)&&!holdNoted){holdNoted=true;status.textContent=HOLD_NOTE;}}
  else if(diveHeldFor){diveHeldFor=0;hurry=1;startup.heldMs=Math.round(performance.now())-startup.heldFrom;if(holdNoted){holdNoted=false;if(status.textContent===HOLD_NOTE)status.textContent='';}if(reducedMotion&&diveTarget===1)dive=diveTarget;}
  let easedDive=THREE.MathUtils.smoothstep(dive,0,1);let underwater=THREE.MathUtils.smoothstep(easedDive,.13,.27);
  uniforms.uTime.value=elapsed;uniforms.uNight.value=night;uniforms.uDive.value=underwater;
  const nav=exploration.update(dt,easedDive>.95,reducedMotion,reef?.userData.safeAscentRoute);
  safetyStop.blend=reducedMotion?Number(safetyStop.active):THREE.MathUtils.lerp(safetyStop.blend,Number(safetyStop.active),1-Math.exp(-dt*6));if(safetyStop.blend<.001)safetyStop.blend=0;
  if(nav.mode==='transition'&&previousMode!=='transition'){ascentCameraTime=0;ascentCameraStart.copy(camera.position).sub(playerPosition);camera.getWorldDirection(ascentAimStart);ascentAimStart.multiplyScalar(10).add(camera.position).sub(playerPosition);}
  if(nav.mode==='transition')ascentCameraTime+=dt;
  surfaceLandingTime=Math.max(0,surfaceLandingTime-dt);
  if(previousMode==='transition'&&nav.mode==='surface'){surfaceLandingTime=2;diveTarget=0;dive=0;frameSurface();computerOpen=false;$('#dive-label').textContent='Dive in';status.textContent='Back at the surface.';setTimeout(()=>{if(status.textContent==='Back at the surface.')status.textContent='';},1800);}
  if(nav.mode==='surface'&&diveTarget===0)easedDive=0;
  previousMode=nav.mode;
  if(nav.mode==='diver'&&easedDive>.75)beginModels();
  if(mapDestination&&!nav.travelling){$('#map-caption').textContent=nav.travelBlocked?'Coral ahead. Steer around it to continue.':nav.manualInput?'Free swimming. Choose a marker to explore.':`${mapDestination.title} reef · A home for this part of the portfolio.`;mapDestination=null;}
  if(nav.exploring!==exploring)setExploring(nav.exploring);
  const bob=paused?0:Math.sin(elapsed*settings.bobFrequency)*settings.bobAmplitude;
  playerPosition.set(nav.offset.x,-8+nav.offset.y,nav.offset.z);
  const ascentLanding=ascentComposition.update(nav,Math.max(0,-playerPosition.y));
  if(nav.mode==='transition')underwater=THREE.MathUtils.smoothstep(Math.max(0,-playerPosition.y),0,8);
  uniforms.uDive.value=underwater;
  swimDirection.set(-Math.sin(nav.yaw)*Math.cos(nav.pitch),Math.sin(nav.pitch),-Math.cos(nav.yaw)*Math.cos(nav.pitch));
  const firstPerson=nav.perspective==='first';
  // In the follow view the camera comes round behind the diver on a bearing of its own, so a turn shows the diver turning before the view follows.
  if(firstPerson||easedDive<=.95||reducedMotion||snapCamera||diagnostic.frames===0){cameraYaw[0]=nav.yaw;cameraPitch[0]=nav.pitch;cameraYaw[1]=cameraPitch[1]=0;}
  else{followAngle(cameraYaw,nav.yaw,settings.cameraResponse*1.4,dt);followAngle(cameraPitch,nav.pitch,settings.cameraResponse*1.4,dt);}
  chasePosition.copy(playerPosition);
  if(firstPerson)chasePosition.addScaledVector(swimDirection,.95);
  else chasePosition.addScaledVector(scratchA.set(-Math.sin(cameraYaw[0])*Math.cos(cameraPitch[0]),Math.sin(cameraPitch[0]),-Math.cos(cameraYaw[0])*Math.cos(cameraPitch[0])),-(settings.cameraDistance+(mobile?.6:0)));
  chasePosition.y+=firstPerson?.15:settings.cameraHeight;
  if(easedDive>.95)chasePosition.y=THREE.MathUtils.clamp(chasePosition.y,reef.userData.terrainHeightAt(chasePosition.x,chasePosition.z)+.45,-.4);
  // The follow camera pulls in past coral that would hide the diver. The distance is eased: in quickly, so nothing crosses the lens, and out slowly, so a passing branch does not pump the view.
  if(easedDive>.95&&!firstPerson&&settings.collisionEnabled&&reef.userData.collisions){const cameraPath=scratchA.copy(chasePosition).sub(playerPosition),cameraCandidate=scratchB.copy(playerPosition);let open=.1;for(let fraction=.95;fraction>=.1;fraction-=.1){cameraCandidate.copy(playerPosition).addScaledVector(cameraPath,fraction);if(reef.userData.collisions.segmentClear(playerPosition,cameraCandidate,.28)){open=fraction;break;}}
    cameraPull=reducedMotion||snapCamera?open:cameraPull+(open-cameraPull)*(1-Math.exp(-dt*(open<cameraPull?14:2.5)));chasePosition.copy(playerPosition).addScaledVector(cameraPath,cameraPull);}else cameraPull=.95;
  const ascending=nav.mode==='transition';
  if(!viewerOrbit){cameraGoal.set(THREE.MathUtils.lerp(playerPosition.x+10*Math.sin(surfaceFramingYaw),chasePosition.x,easedDive),THREE.MathUtils.lerp(2.5,chasePosition.y,easedDive)+bob,THREE.MathUtils.lerp(playerPosition.z+10*Math.cos(surfaceFramingYaw),chasePosition.z,easedDive));
  if(ascending){
    cameraGoal.copy(playerPosition).add(scratchA.set(7,2.2,6));
    cameraGoal.y=Math.max(cameraGoal.y,reef.userData.terrainHeightAt(cameraGoal.x,cameraGoal.z)+1);
    if(settings.collisionEnabled&&!reef.userData.collisions.segmentClear(playerPosition,cameraGoal,.28))cameraGoal.copy(playerPosition).add(scratchA.set(2,1.5,2));
  }
  relative.set(-Math.sin(nav.yaw)*Math.cos(nav.pitch-.04),Math.sin(nav.pitch-.04),-Math.cos(nav.yaw)*Math.cos(nav.pitch-.04)).add(cameraGoal);
  lookTarget.copy(playerPosition).addScaledVector(swimDirection,firstPerson?10:settings.cameraLookAhead);
  if(!firstPerson&&!reducedMotion&&nav.velocity)lookTarget.addScaledVector(nav.velocity,.18);
  lookTarget.lerp(relative,1-easedDive);
  prelude=THREE.MathUtils.clamp(prelude+(preludeOn?dt:-dt)/PRELUDE,0,1);
  const framing=(1-Math.cos(Math.PI*prelude))/2*(1-THREE.MathUtils.smoothstep(easedDive,0,.4));
  if(framing>0&&!viewerOrbit&&!ascending){
    // In toward the diver along the line the camera already has, and turned to hold them in the middle of the frame.
    cameraGoal.lerp(scratchA.copy(cameraGoal).sub(diver.root.position).multiplyScalar(PRELUDE_ZOOM).add(diver.root.position),framing);
    lookTarget.lerp(scratchB.copy(diver.root.position).add(scratchC.set(0,.35,0)),framing);
  }
  if(diveTarget===1&&easedDive>.03&&easedDive<.95&&!ascending){
    const approach=THREE.MathUtils.smoothstep(easedDive,.03,.45)*(1-THREE.MathUtils.smoothstep(easedDive,.45,.95));
    const surfaceOffset=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*camera.aspect*7.2*.66;
    const faceOffset=scratchA.set(surfaceOffset,0,2.8).applyAxisAngle(axisY,surfaceFramingYaw).multiplyScalar(1-easedDive);
    const face=scratchB.set(playerPosition.x+faceOffset.x,THREE.MathUtils.lerp(.55,playerPosition.y+.3,easedDive),playerPosition.z+faceOffset.z);
    cameraGoal.lerp(scratchC.set(2.3*Math.sin(surfaceFramingYaw),.15,2.3*Math.cos(surfaceFramingYaw)).add(face),approach);
    lookTarget.lerp(face,approach);
  }
  if(ascending){
    lookTarget.copy(playerPosition).add(scratchA.set(0,.7,0));
    const landing=ascentLanding;
    const sun=skySystem.getState(phase).sunDirection;
    surfaceFramingYaw=sun[2]<=0?0:Math.PI;
    const surfaceCamera=scratchA.set(playerPosition.x+10*Math.sin(surfaceFramingYaw),2.5,playerPosition.z+10*Math.cos(surfaceFramingYaw));
    cameraGoal.lerp(surfaceCamera,landing);
    const surfaceAim=scratchB.set(-Math.sin(surfaceFramingYaw),-.04,-Math.cos(surfaceFramingYaw)).add(surfaceCamera);
    lookTarget.lerp(surfaceAim,landing);
    const reveal=THREE.MathUtils.smootherstep(ascentCameraTime,0,1.6);
    // Carry the starting view with the swimmer while revealing the ascent view.
    cameraGoal.lerp(scratchA.copy(ascentCameraStart).add(playerPosition),1-reveal);lookTarget.lerp(scratchB.copy(ascentAimStart).add(playerPosition),1-reveal);
  }
  if(safetyStop.blend>0){
    const yaw=safetyStop.yaw,side=mobile?8:7,forward=mobile?1.2:2.2;
    const stopCamera=scratchA.set(playerPosition.x+Math.cos(yaw)*side-Math.sin(yaw)*forward,playerPosition.y+(mobile?1.2:.6),playerPosition.z-Math.sin(yaw)*side-Math.cos(yaw)*forward);
    const composition=mobile?.05:Math.min(2.3,camera.aspect*1.25);
    const stopAim=scratchB.set(playerPosition.x-Math.sin(yaw)*composition,playerPosition.y-(mobile?2.1:.65),playerPosition.z-Math.cos(yaw)*composition);
    cameraGoal.lerp(stopCamera,safetyStop.blend);lookTarget.lerp(stopAim,safetyStop.blend);
  }
  // The descent keeps easing after swimming becomes available. Hand the camera to the
  // same controls at that point; waiting for the transition's tail makes aim feel heavy.
  const descentControlled=diveTarget===1&&nav.mode==='diver';
  const settledView=!(ascending||dive!==diveTarget&&!descentControlled||surfaceLandingTime>0||safetyStop.blend>0);
  if(cameraWas!==nav.perspective){if(cameraWas)cameraShift=1;cameraWas=nav.perspective;}
  if(reducedMotion||snapCamera||diagnostic.frames===0){camera.position.copy(cameraGoal);cameraVelocity.set(0,0,0);cameraShift=0;}
  else {
    // A critically damped spring, exact over the step: the camera eases after its goal and settles without overshoot at any frame rate.
    // First person sits tight on the diver's eye; the follow camera trails softly; a switch between them glides for a moment.
    cameraShift*=Math.exp(-dt*3);
    const follow=settledView?THREE.MathUtils.lerp(settings.cameraResponse*(firstPerson?3:2),8,Math.min(1,cameraShift*1.6)):4.5,decay=Math.exp(-follow*dt);
    scratchA.copy(camera.position);
    // Half of the diver's own movement carries the camera along, so a steady swim stretches the gap a little instead of dragging it.
    if(settledView||ascending)camera.position.addScaledVector(scratchB.copy(playerPosition).sub(cameraAnchor),.5);
    scratchB.copy(camera.position).sub(cameraGoal);scratchC.copy(cameraVelocity).addScaledVector(scratchB,follow);
    camera.position.copy(cameraGoal).add(scratchB.addScaledVector(scratchC,dt).multiplyScalar(decay));
    cameraVelocity.addScaledVector(scratchC,-follow*dt).multiplyScalar(decay);
    diagnostic.cameraFrameStep=scratchA.distanceTo(camera.position);
  }
  cameraAnchor.copy(playerPosition);
  diagnostic.cameraMoving=camera.position.distanceToSquared(cameraGoal)>.00001;
  aimObject.position.copy(camera.position);aimObject.lookAt(lookTarget);
  // Object3D looks along +Z; the camera looks along -Z.
  aimQuaternion.copy(aimObject.quaternion).multiply(halfTurn);
  if(firstPerson&&wristComputer?.diagnostics.visible)aimQuaternion.multiply(scratchQ.setFromAxisAngle(axisX,-.18*wristComputer.diagnostics.progress));
  // A slight roll with the diver's bank and idle sway (exploration.js reports both as zero under reduced motion).
  if(easedDive>.95&&!ascending&&nav.roll!==undefined)aimQuaternion.multiply(scratchQ.setFromAxisAngle(axisZ,nav.roll*(firstPerson?.3:.22)+nav.lean));
  // The view the diver steers is eased where it is made (exploration.js), so in a settled dive the camera stays with it; the dive and the ascent keep their slow, rate-limited swing.
  const aimAngle=camera.quaternion.angleTo(aimQuaternion),aimBlend=1-Math.exp(-dt*(settledView?THREE.MathUtils.lerp(settings.cameraResponse*(firstPerson?4:1.5),8,Math.min(1,cameraShift*1.6)):3));
  camera.quaternion.slerp(aimQuaternion,reducedMotion||snapCamera||diagnostic.frames===0?1:settledView?aimBlend:Math.min(aimBlend,dt*2.8/Math.max(.0001,aimAngle)));snapCamera=false;}else{viewerOrbit.update();diagnostic.cameraMoving=true;}camera.getWorldDirection(viewDirection);camera.updateMatrixWorld(true);
  underwater=THREE.MathUtils.smoothstep(-camera.position.y,-.12,1.2);uniforms.uDive.value=underwater;
  splashState.cameraY=camera.position.y;splashState.transition=dive!==diveTarget||nav.mode==='transition'||surfaceLandingTime>0;splashState.reducedMotion=reducedMotion;waterlineSplash?.update(splashState);
  const skyState=skySystem.update(phase,camera.position,night,underwater,elapsed);
  // Weather sets the sea state before anything below reads waveHeight(), and its light before the lighting is built.
  weather.update(paused?0:dt,elapsed,camera.position,underwater,night);
  const waterNow=uniforms.uSea.value.w>.01||uniforms.uWeather.value.x>.01?waterRough:waterCalm;if(water.material!==waterNow)water.material=waterNow;
  const waterGrid=underwater>=.999?waterCoarse:waterFine;if(water.geometry!==waterGrid)water.geometry=waterGrid;
  skySystem.bake(renderer,weather.flash>0||weather.fading||phaseTarget!==null||paused||Boolean(expeditionUI?.isScrubbing()));
  const depthLight=THREE.MathUtils.smoothstep(Math.max(0,-camera.position.y),22,60)*underwater;
  uniforms.uDepth.value=depthLight;diagnostic.depthLighting=depthLight;
  scene.fog.color.copy(fogDay).lerp(fogNight,night).lerp(fogDeep,underwater).lerp(fogAbyss,depthLight);// Underwater haze is painted by the shared look so it can absorb colour.
  scene.fog.density=.0048*(1-underwater);
  const sunHeight=Math.max(0,uniforms.uSun.value.y),moonHeight=Math.max(0,uniforms.uMoon.value.y);
  const solar=THREE.MathUtils.smoothstep(sunHeight,0,.6),lunar=moonHeight*Math.sqrt(skyState.moonIllumination??0);
  const surfaceLight=weather.surfaceLight(solar+lunar*.12),boost=settings.brightnessBoost/100;
  uniforms.uSurfaceLight.value=surfaceLight;
  look.uLookClarity.value=(settings.waterClarity??100)/100;look.uLookTime.value=elapsed;look.uLookUnder.value=underwater;look.uLookLight.value=surfaceLight;look.uLookDepth.value=depthLight;look.uLookBrightness.value=boost*underwater;look.uLookSun.value.copy(sunHeight>0?uniforms.uSun.value:uniforms.uMoon.value);
  renderer.toneMappingExposure=1.15;
  ambient.color.copy(ambientDay).lerp(skyFillNight,night);
  ambient.intensity=(.55+solar*1.3)*(1-underwater*.18)*(1-depthLight*.62);
  sunlight.color.copy(lightDay).lerp(lightNight,night).lerp(depthTint,depthLight*.55);
  sunlight.intensity=(sunHeight>0?.35+solar*2.1:lunar*.65)*Math.exp(-Math.max(0,-camera.position.y)*.026);
  sunlight.position.copy(sunHeight>0?uniforms.uSun.value:uniforms.uMoon.value).multiplyScalar(100);
  weather.applyLighting({fog:scene.fog,sunlight,ambient,underwater});
  // Light shafts are only drawn underwater, so they are only posed there.
  if(underwater>.01){
    downLight.copy(sunHeight>0?uniforms.uSun.value:uniforms.uMoon.value);
    downLight.x*=-.65;downLight.z*=-.65;downLight.y=-Math.sqrt(Math.max(.01,1-downLight.x*downLight.x-downLight.z*downLight.z));downLight.normalize();
    beamAim.setFromUnitVectors(axisY,scratchA.copy(downLight).negate());
    for(let i=0;i<beams.length;i++){const beam=beams[i];beamPose.position.set(wrapBeam(beam.home.x,camera.position.x),0,wrapBeam(beam.home.y,camera.position.z)).addScaledVector(downLight,17);beamPose.quaternion.copy(beamAim).multiply(beam.spin);beamPose.scale.set(beam.width,1,1);beamPose.updateMatrix();beamGroup.setMatrixAt(i,beamPose.matrix);}
    beamGroup.instanceMatrix.needsUpdate=true;
  }
  if(reef?.userData.surfaceLight)reef.userData.surfaceLight.value=surfaceLight;
  diagnostic.surfaceLight=surfaceLight;diagnostic.brightnessBoost=settings.brightnessBoost;diagnostic.exposure=renderer.toneMappingExposure;diagnostic.ambientIntensity=ambient.intensity;
  const golden=(1-THREE.MathUtils.smoothstep(Math.abs(uniforms.uSun.value.y),.025,.24))*(1-night*.65);
  clouds?.update(camera.position,underwater);birds?.update(elapsed,camera.position,night,underwater);
  sunlight.color.lerp(goldenSun,golden*.7);distantScenery?.update(elapsed,night,underwater);
  // The scooter widens the lens a little. Its boost is already eased, so the field of view follows it directly.
  const fovGoal=settings.cameraFov+(mobile?7:0)+(reducedMotion?0:nav.scooter*5);if(Math.abs(camera.fov-fovGoal)>.01){camera.fov=fovGoal;camera.updateProjectionMatrix();}
  const scale=settings.diverScale*(mobile?1.03/1.35:camera.aspect<1?1.17/1.35:1);
  diver.root.scale.setScalar(scale);
  diver.root.visible=safetyStop.blend>.01||ascending||diveTarget===0||!(firstPerson&&easedDive>.92);
  const surfaceX=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*camera.aspect*7.2*.66;
  const framingYaw=surfaceFramingYaw;
  relative.set(surfaceX,0,-7.2).applyAxisAngle(axisY,framingYaw);
  const surfaceWorldX=playerPosition.x+10*Math.sin(framingYaw)+relative.x,surfaceWorldZ=playerPosition.z+10*Math.cos(framingYaw)+relative.z;
  const surfaceY=waveHeight(surfaceWorldX,surfaceWorldZ,elapsed)-.06;
  const diverBlend=ascending?1-ascentLanding:easedDive;
  diver.root.position.set(THREE.MathUtils.lerp(surfaceWorldX,playerPosition.x,diverBlend),THREE.MathUtils.lerp(surfaceY,playerPosition.y,diverBlend),THREE.MathUtils.lerp(surfaceWorldZ,playerPosition.z,diverBlend));
  // Deliberate trim change followed by small alternating fin kicks.
  // The body, not the view: under the guide's free look they differ (exploration.js: bodyYaw, bodyPitch).
  const swimPitch=Math.PI/2-settings.diverTrim-nav.bodyPitch-(nav.pitchLead||0);
  poseYaw.setFromAxisAngle(axisY,THREE.MathUtils.lerp(framingYaw-.2,Math.PI+nav.bodyYaw,diverBlend));posePitch.setFromAxisAngle(axisX,diverBlend*(ascending?THREE.MathUtils.lerp(swimPitch,.22,nav.ascentLaunch||0):swimPitch));
  // The body banks into a turn and sways a little at rest (exploration.js: roll and lean, in radians, zero under reduced motion).
  diverPoseGoal.copy(poseYaw).multiply(posePitch).multiply(scratchQ.setFromAxisAngle(axisY,-diverBlend*((nav.roll||0)+(nav.lean||0))));lookGlowAt(diver.root.position,diverGlow);
  if(safetyStop.blend>0){
    const hold=safetyStop.blend;
    poseYaw.setFromAxisAngle(axisY,Math.PI+safetyStop.yaw);posePitch.setFromAxisAngle(axisX,.1);
    scratchQ.copy(poseYaw).multiply(posePitch);diverPoseGoal.slerp(scratchQ,hold);
    diver.root.position.y+=reducedMotion?0:Math.sin(elapsed*1.35)*.07*hold;
  }
  diver.root.quaternion.slerp(diverPoseGoal,!reducedMotion&&(ascending||surfaceLandingTime>0)?1-Math.exp(-dt*5):1);
  diveLamp.position.copy(playerPosition);diveLamp.position.y+=.4;diveLamp.intensity=nav.lamp?underwater*((night>.5?70:55)+depthLight*18):0;
  diveLamp.target.position.copy(playerPosition).addScaledVector(swimDirection,45);
  diagnostic.flashlightRange=diveLamp.distance;diagnostic.flashlightIntensity=diveLamp.intensity;diagnostic.neutralBrightness=look.uLookBrightness.value;
  diverAnimationState.dive=easedDive;diverAnimationState.moving=nav.moving;diverAnimationState.ascending=ascending?(nav.ascentLaunch||0):0;
  diverAnimationState.safetyStop=safetyStop.blend;diverAnimationState.wristOpen=computerOpen;
  diverAnimationState.kickFrequency=settings.kickFrequency;diverAnimationState.kickAmplitude=settings.kickAmplitude;
  diverAnimationState.reducedMotion=reducedMotion;diverAnimationState.paused=paused;
  diverAnimator?.update(dt,diverAnimationState);
  scooterModel?.update(dt,{active:nav.scooter,allowed:nav.mode==='diver'&&underwater>.55&&!getTransition()&&!interfaceOpen&&!movementPanelOpen&&!viewerOrbit,firstPerson,reducedMotion,wristOpen:computerOpen});
  if(largeMarine)largeMarine.root.visible=underwater>.01&&largeMarine.diagnostics.loaded&&prepared.has(largeMarine.root);
  if(built){extraLife.root.visible=Boolean(viewerOrbit)||underwater>.01;reef.visible=Boolean(viewerOrbit)||underwater>.01;marine.root.visible=Boolean(viewerOrbit)||underwater>.01;beamGroup.visible=underwater>.01;motes.visible=underwater>.01;}
  if(modelScene)modelScene.root.visible=prepared.has(modelScene.root)&&(Boolean(viewerOrbit)||underwater>.01);
  refreshView();
  // The module hides its own underwater and surface casts, so it runs above and below the surface.
  livingWorld?.update(paused?0:dt,elapsed,{player:playerPosition,camera,view:viewerOrbit?null:view,underwater,night,depth:depthLight,weather:weather.intensity,lamp:nav.lamp,paused,aim:swimDirection,diver:diver.root.position});
  if(heroFormations){heroFormations.root.visible=Boolean(viewerOrbit)||underwater>.01;if(heroFormations.root.visible)heroFormations.update(elapsed,night,depthLight);}
  if(setPieces){setPieces.root.visible=Boolean(viewerOrbit)||underwater>.01;if(setPieces.root.visible)setPieces.update(elapsed,camera.position,night,depthLight,uniforms.uRatio.value);}
  if(userCreatures){userCreatures.root.visible=prepared.has(userCreatures.root)&&(Boolean(viewerOrbit)||underwater>.01);if(userCreatures.root.visible)userCreatures.update(paused?0:dt,playerPosition,viewerOrbit?null:view);}
  if(userCorals)userCorals.root.visible=prepared.has(userCorals.root)&&(Boolean(viewerOrbit)||underwater>.01);
  if(built){if(underwater>.01)cullWorld(paused?0:dt);motes.position.y=Math.sin(elapsed*.07)*.2;updateBubbles(underwater);}
  // Constellation labels cannot show underwater or by day: once hidden, their projection is skipped altogether.
  const skyAlpha=night*(1-underwater)*.7*(1-THREE.MathUtils.smoothstep(weather.intensity.cloud,.08,.55));
  if(skyAlpha>0||skyLabelsLit){skyLabelsLit=skyAlpha>0;for(const item of skyLabels){if(skyLabelsLit)item.anchor.getWorldPosition(relative);labelVisible(relative,item,skyLabelsLit&&relative.y-camera.position.y>20?skyAlpha:0);}}
  for(const item of reefLabels){
    const {anchor}=item;
    if(underwater>0&&(!item.checkedAt||elapsed-item.checkedAt>.2||paused)){
      item.checkedAt=elapsed;item.clear=camera.position.distanceTo(anchor)<65;
      for(let t=.08;item.clear&&t<.96;t+=.06){relative.lerpVectors(camera.position,anchor,t);if(relative.y<reef.userData.terrainHeightAt(relative.x,relative.z)+.15)item.clear=false;}
    }
    labelVisible(anchor,item,item.clear?underwater*.85:0);
  }
  const submerged=nav.mode==='transition'||underwater>.55;
  if(diagnostic.submerged!==submerged){diagnostic.submerged=submerged;scaler.state.costs.length=0;document.body.dataset.submerged=String(submerged);$('.deep-copy').setAttribute('aria-hidden',String(!submerged));$('.surface-copy').setAttribute('aria-hidden',String(submerged));$('.reef-map').hidden=!submerged;$('.swim-controls').hidden=!submerged;window.dispatchEvent(new Event('oceanmediumchange'));}
  const depth=nav.mode==='surface'?0:Math.max(0,-diver.root.position.y),edge=Math.abs(playerPosition.x)>32||playerPosition.z< -65||playerPosition.z>15;
  wristComputer?.update(dt,{open:computerOpen,allowed:firstPerson&&nav.mode==='diver'&&easedDive>.95&&!getTransition()&&!interfaceOpen&&!movementPanelOpen,reducedMotion,depth,location:edge?'REEF DROP-OFF':'CORAL GARDENS',data:diagnostic.diveComputer});
  // Fields other scripts poll stay current every frame; the rest follow the HUD.
  diagnostic.depth=Number(depth.toFixed(2));diagnostic.displayDepth=Number(toDisplayDepth(depth).toFixed(2));diagnostic.transition=nav.transition||dive!==diveTarget||phaseTarget!==null;diagnostic.phase=phase;diagnostic.night=night;diagnostic.position=camera.position.toArray();diagnostic.playerPosition=playerPosition.toArray();diagnostic.exploring=exploring;diagnostic.swimming=nav.moving;diagnostic.colliding=nav.colliding;diagnostic.contacts=nav.contacts;diagnostic.pointerLocked=Boolean(nav.pointerLocked);diagnostic.cameraMode=safetyStop.active?'third':nav.mode==='surface'?'third':nav.perspective;diagnostic.safetyStopBlend=+safetyStop.blend.toFixed(3);
  // A paused scene stops its loop as soon as it settles, so it paints every frame and never ends on a stale HUD.
  const clock=performance.now(),paint=hudForce||paused||clock-hudPainted>=80;
  if(paint||phaseTarget!==null||expeditionUI?.isScrubbing())expeditionUI?.update(skyState);
  if(paint){hudPainted=clock;hudForce=false;paintHud(nav,submerged,depth,edge,skyState);}
  if(viewerOrbit)window.oceanControls.viewer.applyLayers?.();
}
// The pixel ratio at render scale 1: the display's own, capped by a pixel budget.
function fullRatio(){return Math.min(devicePixelRatio||1,quality==='economy'?1:1.5,Math.sqrt(2200000/(innerWidth*innerHeight)));}
// Integrated and mobile GPUs pay for every pixel, and a display scaled above 100 %
// multiplies them: such a GPU starts at about one render pixel per CSS pixel and
// climbs from there only while the frame rate holds (see frame-pacing.js). A GPU that
// cannot be identified starts between the two.
function classifyGpu(gl){
  let name='';try{const info=gl.getExtension('WEBGL_debug_renderer_info');name=String(gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER)||'');}catch{}
  return classifyGpuName(name);
}
function classifyGpuName(name){
  diagnostic.gpu=name;diagnostic.gpuTiled=/Mali|Adreno|PowerVR|Apple/i.test(name);// tile renderers resolve multisampling in the tile: it stays on there
  if(/NVIDIA|GeForce|Quadro|RTX|GTX|Radeon(?: ?\(TM\))? ?(?:RX|Pro|HD) ?\w{0,2}\d{3,4}|Arc(?:\(TM\))? [AB]\d{3}|Apple M\d|Apple GPU/i.test(name))return 'discrete';
  if(/Vega|Radeon(?:\(TM\))? ?(?:R\d )?Graphics|Radeon(?:\(TM\))? \d{3}M|Intel|Iris|UHD|HD Graphics|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Basic Render/i.test(name))return 'integrated';
  return 'unknown';
}
function startingScale(){
  const [ratioLimit,pixelLimit]=gpuTier==='discrete'?[1.5,2.2e6]:gpuTier==='integrated'?[1,1.3e6]:[1.25,1.8e6],full=fullRatio(),area=innerWidth*innerHeight;
  let step=0;while(step<(quality==='economy'?2:RENDER_SCALES.length-1)&&(full*RENDER_SCALES[step]>ratioLimit+.03||area*(full*RENDER_SCALES[step])**2>pixelLimit*1.05))step++;
  return step;
}
// Resolution follows the frame rate (the rules are in frame-pacing.js). The windows are a second long, so a slow
// device is a step lower within about two seconds of the first frame instead of leaving the first impression janky.
function adaptQuality(fps,seconds,info){
  scaler.state.floor=quality==='economy'?2:RENDER_SCALES.length-1;
  const change=scaler.update(fps,seconds,displayHz/stride,elapsed,info);
  diagnostic.gpuCost=info.cost?+info.cost.toFixed(2):0;diagnostic.windowsIgnored=scaler.state.ignored;
  if(change==='economy'){quality='economy';diagnostic.quality=quality;}
  if(change)resize();
}
// The GPU's own time for a frame, where the browser will say (a timer query around one frame in every few): what the
// scale controller reads its headroom from, since a frame rate capped by the display cannot show any.
let gpuTimer=null,gpuQuery=null,gpuOpen=false,gpuSum=0,gpuCount=0,windowBusy=false;
function gpuBegin(){
  if(!gpuTimer||gpuQuery)return;
  const gl=renderer.getContext();gpuQuery=gl.createQuery();gl.beginQuery(gpuTimer.TIME_ELAPSED_EXT,gpuQuery);gpuOpen=true;
}
function gpuEnd(){if(gpuOpen){renderer.getContext().endQuery(gpuTimer.TIME_ELAPSED_EXT);gpuOpen=false;}}
function gpuPoll(){
  if(!gpuQuery||gpuOpen)return;
  const gl=renderer.getContext();
  if(!gl.getQueryParameter(gpuQuery,gl.QUERY_RESULT_AVAILABLE))return;
  const ms=gl.getQueryParameter(gpuQuery,gl.QUERY_RESULT)/1e6,disjoint=gl.getParameter(gpuTimer.GPU_DISJOINT_EXT);
  gl.deleteQuery(gpuQuery);gpuQuery=null;
  if(!disjoint&&ms>0&&ms<500){gpuSum+=ms;gpuCount++;diagnostic.gpuMs=+ms.toFixed(2);}
}
function renderBudget(){
  if(budgetAsked!=='auto')return budgetAsked;
  if(interfaceOpen)return 'idle';
  if(movementPanelOpen||settingsMenuOpen)return 'reduced';
  // A dive held at the waterline (see updateWorld) waits on the work, not on the picture: the camera is still and the
  // status line says what is happening. Half the frames are drawn there, and what they took goes to the work. On a slow
  // device, the only kind that is held for long, the full pace left the build a third of the main thread (perf-hold.mjs).
  if(diveHeldFor>0)return 'held';
  // (Not while the first dive is still being warmed up: that work is paced by drawn frames and should be done before the visitor dives.)
  return exploration.state.mode==='surface'&&diveTarget===0&&!viewerOrbit&&!warmQueue.length&&!modelsBusy&&performance.now()-lastInput>IDLE_AFTER?'reduced':'full';
}
function frame(now){
  if(!focused||!renderer){running=false;return;}
  callbacks++;callbackAt=performance.now();
  const raw=lastFrame?Math.min((now-lastFrame)/1000,1):1/60;lastFrame=now;
  // The refresh rate is read from the callback gaps and a frame is drawn every stride-th callback (see frame-pacing.js).
  // A new reading of the rate (the first one, or the window moved to another display) starts the frame-rate windows afresh.
  if(raw<.25){frameGaps[gapCursor++%24]=raw*1000;if(gapCursor%24===0){const hz=refreshRate(frameGaps,gapOrder);if(Math.abs(hz-displayHz)>displayHz*.03){scaler.state.settling=1;frameCount=0;perfDuration=0;drawCount=0;lastDraw=0;}displayHz=hz;}}
  const budget=renderBudget(),full=budget==='full';
  if(diagnostic.renderBudget!==budget){diagnostic.renderBudget=budget;scaler.state.settling=1;frameCount=0;perfDuration=0;}
  stride=drawStride(displayHz,full?(quality==='economy'?30:60):budget==='held'?(quality==='economy'?15:30):BUDGET_FPS[budget]);diagnostic.displayHz=Math.round(displayHz);
  const draw=++sinceDraw>=stride||full&&(paused||diagnostic.transition);
  // One step of graphics work goes ahead of the frame (see later()): the graphics process has had a whole interval to
  // finish the last frame, so a call that has to wait for it waits least here. Callbacks that draw nothing take one as
  // well (a held dive, economy's every other callback): the first draws and uploads are what a dive waits on.
  // A step stalled the frame when the gap after it is well over the usual one: half as long again as the display's
  // interval, or as the gaps this device keeps between callbacks anyway (paceGap; on a slow phone that is often two or
  // three intervals, and every step read as a stall, so the queue rested four frames after each and took three steps a
  // second). After a stall one frame is drawn clean before the next step; after a step that cost nothing visible the
  // next goes ahead of the next callback.
  if(gpuRan){gpuRan=false;gpuRest=raw*1000>Math.max(1500/displayHz,paceGap*1.5)?1:0;}
  else if(raw<.25)paceGap+=(raw*1000-paceGap)*.1;
  // Steps that cost next to nothing (draws of programs already built, small uploads) follow one another for up to 3 ms.
  if(jobs.length&&diagnostic.ready){if(gpuRest>0&&!hurry){if(draw||budget==='held')gpuRest--;}else{const begun=performance.now();while(runJobs(0,'gpu')>0){gpuRan=true;if(performance.now()-begun>3||!jobs.length)break;}}}
  // The world moves once per drawn frame, by the time that has passed since the last one. (It used to move on every
  // callback at full pace, drawn or not: with a stride of 2, an economy 30 fps or a fast display, that doubled the
  // simulation per frame seen, on machines whose main thread is already the limit.)
  heldClock+=raw;
  if(draw){const dt=Math.min(heldClock,.1);if(!paused)elapsed+=dt;try{updateWorld(dt,heldClock);}catch(error){running=false;fail(error);return;}heldClock=0;}
  if(draw){sinceDraw=0;
    gpuPoll();gpuBegin();drawFrame();gpuEnd();diagnostic.frames++;frameCount++;diagnostic.drawCalls=renderer.info.render.calls;diagnostic.triangles=renderer.info.render.triangles;
    if(lastDraw&&full&&!getTransition())experienceMetrics.frame(now-lastDraw);
    if(diagnostic.submerged&&getMode()==='diver'&&!getTransition())experienceMetrics.mark('firstUsableDive');
    if(lastDraw&&drawCount<drawGaps.length)drawGaps[drawCount++]=now-lastDraw;lastDraw=now;}
  // Windows of a second run whenever the scene draws at full pace, and each is handed to the scale controller with what
  // it cannot see for itself: whether background work, a model pipeline or a transition was running in it (their stalls
  // are not the GPU's: read as its pace, they took an integrated GPU to the lowest scale within seconds of loading),
  // whether it held a long task, and what the GPU says a frame cost. The controller ignores the first two kinds
  // (see frame-pacing.js). It is given the window's pace with its hitches left out (see windowPace); diagnostic.fps is the plain count.
  if(!paused&&diagnostic.ready&&full){
    perfDuration+=raw;tickCount++;windowBusy||=jobs.length>0||modelsBusy>0||Boolean(diagnostic.transition)||performance.now()-jobsQuietAt<400;
    if(perfDuration>=1){diagnostic.fps=Math.round(frameCount/perfDuration);adaptQuality(windowPace(drawGaps,drawCount,drawOrder)||frameCount/perfDuration,perfDuration,{busy:windowBusy,hitch:windowHitch(drawGaps,drawCount,100),cost:gpuCount?gpuSum/gpuCount:0});frameCount=0;tickCount=0;perfDuration=0;drawCount=0;perfSamples++;windowBusy=false;gpuSum=0;gpuCount=0;}
  }else{frameCount=0;tickCount=0;perfDuration=0;drawCount=0;lastDraw=0;windowBusy=false;gpuSum=0;gpuCount=0;}
  // Background work for this thread follows the frame in a task of its own (see afterFrame).
  if(jobs.length&&diagnostic.ready){jobFrameAt=ticking?performance.now():now;jobGap=raw*1000;jobFrameDrew=draw;jobsAt=performance.now();if(ticking)afterFrame();else if(!jobPosted){jobPosted=true;jobPort.port2.postMessage(0);}}
  if(paused&&!diagnostic.transition&&!exploration.state.moving&&!diagnostic.cameraMoving&&!wristComputer?.diagnostics.animating){running=false;lastFrame=0;pump();return;}
  raf=requestAnimationFrame(frame);
}
function wake(){if(!running&&renderer&&focused&&started&&!diagnostic.error){running=true;lastFrame=0;raf=requestAnimationFrame(frame);}}
function fail(error){console.error('Ocean scene:',error);diagnostic.error=error.message;diagnostic.ready=false;document.body.dataset.fallback='true';canvas.style.display='none';$('#dive-label').textContent='Ocean unavailable';$('#dive').disabled=true;status.textContent='The 3D ocean needs WebGL 2. Try a browser with hardware acceleration enabled.';}
paintTheme(selectedNight);updateMotionUI();
// Start-up. Only what the surface shows is built before the first frame: the renderer, the sky, the sea and what floats
// on and over it, and the diver. Each stage ends its task, so none of them is long, and hands its shader sources to the
// browser as soon as its materials exist, so they compile on another thread while the next stage is built. The first
// frame is drawn once they have linked, the page is ready with it, and the sea is moving from then on. Everything
// under the water is built behind that frame (see buildUnderwater); the dive button works from the start (see updateWorld).
async function boot(){
  mark('setup');
  // The scene is GPU-bound; on a laptop with two GPUs the default hint picks the weak one. It changes nothing on a single integrated GPU.
  // The GPU is named before the canvas gets its context, since multisampling is fixed at that moment: a throwaway context asks, and is given back at once.
  // The page's first WebGL context costs a fifth of a second wherever it is made, so index.html asks from a worker while the
  // scripts are still downloading (window.oceanGpuProbe: a promise for the GPU's name); the throwaway context here is the fallback.
  let named=null;try{named=await Promise.race([window.oceanGpuProbe,new Promise(resolve=>setTimeout(resolve,300))]);}catch{}
  markAt=performance.now();
  if(typeof named==='string'&&named){gpuTier=classifyGpuName(named);startup.probedEarly=1;}
  else{const probe=document.createElement('canvas').getContext('webgl2',{powerPreference:'high-performance'});if(probe){gpuTier=classifyGpu(probe);probe.getExtension('WEBGL_lose_context')?.loseContext();}}
  antialias=chooseAntialias();mark('probe');
  renderer=new THREE.WebGLRenderer({canvas,antialias:antialias==='msaa',alpha:false,powerPreference:'high-performance'});if(gpuTier==='unknown')gpuTier=classifyGpu(renderer.getContext());scaler.state.step=scaler.state.origin=startingScale();diagnostic.gpuTier=gpuTier;diagnostic.antialias=antialias;
  renderer.info.autoReset=false;if(antialias==='smooth')makePost();renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.debug.onShaderError=()=>fail(new Error('A scene shader could not compile'));
  try{gpuTimer=renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2');}catch{}diagnostic.gpuTimer=Boolean(gpuTimer);
  scene=new THREE.Scene();scene.fog=new THREE.FogExp2(fogDay,.0048);camera=new THREE.PerspectiveCamera(47,innerWidth/innerHeight,.05,1800);scene.add(camera);
  ambient=new THREE.HemisphereLight('#c8e7e6','#294e55',1.85);scene.add(ambient);sunlight=new THREE.DirectionalLight('#ffe6bf',2.3);scene.add(sunlight);
  const rim=new THREE.DirectionalLight('#7acecd',.65);rim.position.set(8,3,3);scene.add(rim);
  diveLamp=new THREE.SpotLight('#fff7ed',0,65,.30,.48,1.0);scene.add(diveLamp,diveLamp.target);
  for(const light of [ambient,sunlight,rim,diveLamp])light.layers.enable(1);// the warm-up camera sees layer 1 only, and must see the same lights
  // What has been handed to the browser to compile so far: the first frame waits for these to link.
  // Only what the first frame shows: the spare programs (the sea in a storm, the sky seen from under it, the forearm
  // computer, the rain) are handed over behind it, with the world under the water (see buildUnderwater).
  const linking=new Set(),early=(root,eye=camera,stage=scene)=>{
    const visit=node=>{if(!node.visible)return;if(node.isMesh||node.isPoints||node.isLine||node.isSprite)for(const material of renderer.compile(node,eye,stage))linking.add(material);for(const child of node.children)visit(child);};
    visit(root);
  };
  const stage=async name=>{mark(name);await nextTask();if(diagnostic.error)throw new Error(diagnostic.error);markAt=performance.now();};
  if(post)early(post.stage,post.camera,post.stage);
  await stage('renderer');
  // The diver first: its programs are the largest of the surface's, and they compile while the sky and the sea are built.
  diver=createDiver();diverAnimator=createDiverAnimator(diver);diagnostic.diverAnimation=diverAnimator.diagnostics;stylizeTree(diver.root,{toon:.45,rim:.4,caustics:.6,glow:'flat',glowColor:diverGlow});for(const material of Object.values(diver.materials))stylize(material,{toon:.45,rim:.4,caustics:.6,glow:'flat',glowColor:diverGlow});scene.add(diver.root);
  early(diver.root);
  await stage('diver');
  skySystem=createSkySystem(uniforms,rng);scene.add(skySystem.root);expeditionUI=createExpeditionUI({sky:skySystem,getPhase:()=>phase,setPhase:value=>{phase=value;phaseTarget=null;wake();},frameSurface});
  diagnostic.starCount=skySystem.starCount;diagnostic.constellationCount=skySystem.constellationCount;
  phase=skySystem.openingPhase;paintTheme(false,'dawn');diagnostic.openingSunAltitude=skySystem.getState(phase).sunAltitude;
  for(const item of skySystem.labels){const label=document.createElement('div');label.className='constellation-label';label.innerHTML=`<i></i>${item.name.toUpperCase()}`;$('#sky-labels').append(label);label.style.left=label.style.top='0';skyLabels.push({label,shift:'',anchor:item.anchor});}
  early(skySystem.root);for(const material of skySystem.prepare(renderer))linking.add(material);
  await stage('sky');
  weather=createWeather({uniforms,scene,economy:quality==='economy',onChange:detail=>{diagnostic.weather=detail;wake();}});diagnostic.timeLocked=timeLocked;
  makeWater();distantScenery=createDistantScenery({economy:quality==='economy',skyMap:uniforms.uSkyMap});scene.add(distantScenery.root);diagnostic.distantScenery=distantScenery.counts;birds=createSeabirds({economy:quality==='economy'});scene.add(birds.root);diagnostic.cloudImpostorsRemoved=true;
  early(scene);
  await stage('sea');
  makeLandmarkMarks();exploration.setTerrain(terrainHeightAt);resize();
  scooterModel=createDiveScooter(camera,diver.root);diagnostic.scooterModel=scooterModel.diagnostics;
  waterlineSplash=createWaterlineSplash();diagnostic.waterlineSplash=waterlineSplash.diagnostics;
  wristComputer=createWristComputer(camera,diver.materials);diagnostic.wristComputer=wristComputer.diagnostics;
  // The orbit viewer looks at the whole reef: it is all there before its first frame.
  if(window.oceanViewer){viewerOrbit=new OrbitControls(camera,canvas);viewerOrbit.enableDamping=true;viewerOrbit.dampingFactor=.08;viewerOrbit.minDistance=1;viewerOrbit.maxDistance=250;viewerOrbit.addEventListener('change',wake);exploration.suspend(true);finishUnderwater();beginModels();}
  early(scene);mark('fittings');
  await programsLinked(linking);
  if(diagnostic.error)return;
  mark('shaders');
  // The first update settles what is on show (the sea's program for the weather, the stars by night): anything it
  // brought out is compiled before the frame as well. Usually that is nothing.
  updateWorld(1/60);mark('firstUpdate');
  early(scene);if(linking.size){await programsLinked(linking);if(diagnostic.error)return;}
  markAt=performance.now();drawFrame();mark('firstDraw');
  if(diagnostic.error)return;
  experienceMetrics.mark('surfaceReady');started=true;diagnostic.ready=true;diagnostic.readyAt=Math.round(performance.now());document.body.dataset.ready='true';$('#dive').disabled=false;$('#dive-label').textContent='Dive in';status.textContent='';preloadModels();
  // The build starts with the first frame: its steps are paced around the frames (see afterFrame), and a visitor who
  // dives within the first seconds should find as much of it done as possible.
  if(!built)startUnderwater();
  wake();
}
// In a task of its own: the scripts this one imports have only just been evaluated in this one.
nextTask().then(boot).catch(fail);
