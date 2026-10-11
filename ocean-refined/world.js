import * as THREE from './vendor/three.module.min.js';
import { createClouds, seededRandom } from './assets.js';
import { createDiver } from './diver.js';
import { createWristComputer } from './wrist-computer.js';
import { createReef, LANDMARKS } from './reef.js';
import { createMarineLife } from './marine-life.js';
import { createUnderwaterLife } from './underwater-life.js';
import { createDistantScenery } from './distant-scenery.js';
import { createSeabirds } from './seabirds.js';
import { createSkySystem } from './sky-system.js';
import { createExploration } from './exploration.js';
import { settings } from './movement-settings.js';
import { createMovementPanel } from './movement-panel.js';
import { waveHeight, waterVertex, waterFragment, beamVertex, beamFragment } from './shaders.js';

const $=s=>document.querySelector(s), canvas=$('#world'), status=$('#status');
const themeMedia=matchMedia('(prefers-color-scheme: dark)'), motionMedia=matchMedia('(prefers-reduced-motion: reduce)');
let savedTheme;try{savedTheme=localStorage.getItem('ocean-theme');}catch{}
let selectedNight=savedTheme?savedTheme==='night':themeMedia.matches;
let reducedMotion=motionMedia.matches,paused=reducedMotion;
let renderer,scene,camera,water,diver,reef,skySystem,marine,clouds,sunlight,ambient,beamGroup,motes,bubbleMesh,diveLamp;
let largeMarine=null,extraLife=null,distantScenery=null,birds=null,modelScene=null,modelsLoading=false,interactionTargets=[];
let running=false,raf=0,lastFrame=0,lastDraw=0,elapsed=0,focused=!document.hidden;
let phase=selectedNight?Math.PI:0,phaseTarget=null;
const cycleSeconds=1200;
const skyClockFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',hour:'2-digit',minute:'2-digit',hour12:false});
let night=selectedNight?1:0,diveTarget=0,dive=0,frameCount=0,perfDuration=0,perfSamples=0;
let mobile=innerWidth<600,quality=mobile||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<5)?'economy':'standard';
let nextBubble=0,bubbleCursor=0,bubbleClock=-1,exploring=false,mapDestination=null;
let mapCollapsed=mobile;
let previousMode='surface',surfaceX=0,surfaceZ=0;
let wristComputer=null,computerOpen=false,interfaceOpen=false,movementPanelOpen=false;
const rng=seededRandom(541),dummy=new THREE.Object3D(),lookTarget=new THREE.Vector3(),viewDirection=new THREE.Vector3();
const emitter=new THREE.Vector3(),relative=new THREE.Vector3(),projected=new THREE.Vector3(),labelDirection=new THREE.Vector3();
const playerPosition=new THREE.Vector3(),chasePosition=new THREE.Vector3();
const cameraGoal=new THREE.Vector3(),swimDirection=new THREE.Vector3();
const poseYaw=new THREE.Quaternion(),posePitch=new THREE.Quaternion(),axisY=new THREE.Vector3(0,1,0),axisX=new THREE.Vector3(1,0,0);
const fogDay=new THREE.Color('#accdd5'),fogNight=new THREE.Color('#152740'),fogDeep=new THREE.Color('#075361'),fogAbyss=new THREE.Color('#022532');
const lightDay=new THREE.Color('#ffe6bf'),lightNight=new THREE.Color('#97bded'),skyFillNight=new THREE.Color('#7493bd');
const cloudDay=new THREE.Color('#ffffff'),cloudNight=new THREE.Color('#526a8b');
const uniforms={uTime:{value:0},uNight:{value:night},uDive:{value:0},uDepth:{value:0},uSun:{value:new THREE.Vector3(-.43,.2,-1).normalize()},uMoon:{value:new THREE.Vector3(-.41,.25,-1).normalize()},uSurfaceLight:{value:1},uRatio:{value:1}};
const diagnostic={ready:false,error:null,frames:0,fps:0,quality,reducedMotion,paused,theme:selectedNight?'night':'day',submerged:false,cycleSeconds,dayToNightSeconds:600};
window.oceanDiagnostics=diagnostic;
const exploration=createExploration(canvas,wake),bubbleData=[],skyLabels=[],reefLabels=[];
createMovementPanel(()=>{
  if(camera){camera.fov=settings.cameraFov+(mobile?7:0);camera.updateProjectionMatrix();}
  if(!settings.pointerLock&&document.pointerLockElement===canvas)document.exitPointerLock();
  wake();
},open=>{movementPanelOpen=open;exploration.suspend(open);wake();});

function getPlayerPosition(){return exploration.getPlayerPosition(new THREE.Vector3()).clone();}
function getMode(){return exploration.state.transition||Math.abs(dive-diveTarget)>.002?'transition':exploration.state.mode;}
function getTransition(){return exploration.state.transition||Math.abs(dive-diveTarget)>.002;}
function setInterfaceOpen(value){interfaceOpen=Boolean(value);exploration.setInterfaceOpen(value);wake();}
function setComputerOpen(value){computerOpen=Boolean(value);wake();return computerOpen;}
function toggleCamera(){const active=exploration.toggleFreeCam();const button=$('#camera-toggle');if(button){button.setAttribute('aria-pressed',String(active));button.textContent=active?'First-person view':'Third-person view';}wake();return active;}
function beginModels(){
  if(modelsLoading||modelScene)return;modelsLoading=true;
  import('./large-marine.js').then(({createLargeMarine})=>{largeMarine=createLargeMarine({terrainHeightAt:reef.userData.terrainHeightAt});scene.add(largeMarine.root);diagnostic.largeMarine=largeMarine.diagnostics;return largeMarine.load();}).then(()=>wake()).catch(error=>console.warn('Large animal unavailable:',error));
  import('./model-scene.js').then(({createModelScene})=>{
    if(!reef)return;modelScene=createModelScene({reef,terrainHeightAt:reef.userData.terrainHeightAt,collisions:reef.userData.collisions,economy:quality==='economy',onStatus:value=>{diagnostic.modelLoading=value.status==='loading';diagnostic.modelsLoaded=value.loaded??diagnostic.modelsLoaded??0;diagnostic.modelsFailed=value.failed??diagnostic.modelsFailed??0;if(value.status==='fallback'&&value.message&&!exploration.state.transition)status.textContent='Some optional ocean models could not load.';}});
    scene.add(modelScene.root);interactionTargets=modelScene.landmarks||[];
    return modelScene.load().then(result=>{modelScene.update(0,elapsed,playerPosition,night);diagnostic.modelLoading=false;diagnostic.modelsLoaded=result.loaded;diagnostic.modelsFailed=result.failed;for(const item of reefLabels){const placed=modelScene.landmarks.find(p=>p.id===item.landmark.id);if(placed){item.anchor.fromArray(placed.position).add(new THREE.Vector3(0,1.2,0));item.label.querySelector("span").textContent=`Seafloor landmark · ${Math.round(-placed.position[1])} m`;}}diagnostic.reefFishCount=result.reefFishCount;diagnostic.reefFishGroups=result.reefFishGroups;wake();});
  }).catch(error=>{console.warn('Optional landmark models could not load:',error);}).finally(()=>{modelsLoading=false;wake();});
}
Object.defineProperty(window,'oceanControls',{configurable:true,value:{getPlayerPosition,getCamera:()=>camera,getMode,getTransition,get models(){return modelScene;},get reef(){return reef;},setInterfaceOpen,setComputerOpen,recapture:()=>exploration.recapture(),toggleCamera}});

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
  if((preset==='dawn'||preset==='dusk')&&exploration.state.mode==='surface'&&skySystem){const sun=skySystem.getState(wanted).sunDirection;exploration.frameSky(Math.atan2(-sun[0],-sun[2]));}
  if(persist)try{localStorage.setItem('ocean-theme',preset);}catch{}
  wake();
}
function updateMotionUI(){
  $('#motion').setAttribute('aria-pressed',String(paused));$('#motion').setAttribute('aria-label',paused?'Resume animation':'Pause animation');
  $('#motion-label').textContent=paused?'Resume motion':'Pause motion';$('#motion-icon').innerHTML=paused?'<path d="m8 5 11 7-11 7Z"/>':'<path d="M9 5v14M15 5v14"/>';
  diagnostic.paused=paused;
}
function setExploring(value){
  exploring=value;exploration.state.exploring=value;document.body.dataset.exploring=String(value);
  $('#explore').setAttribute('aria-pressed',String(value));$('#explore').innerHTML=value?'Release mouse <span>↙</span>':'Look around <span>↗</span>';wake();
}
$('#day').addEventListener('click',()=>setTheme(false));$('#night').addEventListener('click',()=>setTheme(true));
$('#dawn').addEventListener('click',()=>setSkyPreset('dawn'));$('#dusk').addEventListener('click',()=>setSkyPreset('dusk'));
$('#motion').addEventListener('click',()=>{paused=!paused;updateMotionUI();wake();});
$('#explore').addEventListener('click',()=>{if(exploring){exploration.setInterfaceOpen(false);setExploring(false);}else{exploration.recapture();setExploring(true);}});
function paintAtlas(){
  $('.reef-map').dataset.collapsed=String(mapCollapsed);$('#map-toggle').setAttribute('aria-expanded',String(!mapCollapsed));$('#map-toggle').setAttribute('aria-label',mapCollapsed?'Expand reef atlas':'Collapse reef atlas');$('#map-toggle').textContent=mapCollapsed?'＋':'−';
}
$('#map-toggle').addEventListener('click',()=>{mapCollapsed=!mapCollapsed;paintAtlas();});
$('#camera-toggle')?.addEventListener('click',toggleCamera);
$('#capture-hint')?.addEventListener('click',()=>exploration.recapture());
$('#reset-view').addEventListener('click',()=>{exploration.reset();mapDestination=null;$('#map-caption').textContent='Choose a marker to swim closer.';});
$('#dive').addEventListener('click',()=>{
  if(!diagnostic.ready)return;const wasDiving=diveTarget===1;mapDestination=null;$('#map-caption').textContent='Choose a marker to swim closer.';
  diveTarget=wasDiving?1:1;
  $('#dive-label').textContent=wasDiving?'Ascending to the surface…':'Back to the surface';
  status.textContent=wasDiving?'Returning to the surface.':'Diving beneath the surface.';
  setTimeout(()=>{if(diagnostic.ready)status.textContent='';},1600);
  if(!wasDiving){exploration.startDive();beginModels();setExploring(true);}
  else if(exploration.state.mode!=='surface')exploration.beginAscent(reef?.userData.safeAscentRoute);
  if(reducedMotion){dive=diveTarget;status.textContent='';}canvas.focus({preventScroll:true});wake();
});
addEventListener('keydown',event=>{if((event.code==='ShiftLeft'||event.code==='ShiftRight')&&!event.repeat&&diagnostic.ready&&getMode()==='surface'&&!interfaceOpen&&!movementPanelOpen&&!event.target.closest?.('input,textarea,select,[contenteditable="true"]')){event.preventDefault();$('#dive').click();}});
themeMedia.addEventListener('change',e=>{let stored;try{stored=localStorage.getItem('ocean-theme');}catch{}if(!stored)setTheme(e.matches,false);});
motionMedia.addEventListener('change',e=>{reducedMotion=e.matches;paused=reducedMotion;diagnostic.reducedMotion=reducedMotion;updateMotionUI();wake();});
addEventListener('resize',()=>{if(renderer){resize();wake();}});
document.addEventListener('visibilitychange',()=>{focused=!document.hidden;if(!focused){cancelAnimationFrame(raf);running=false;lastFrame=0;}else wake();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);running=false;diagnostic.ready=false;diagnostic.error='WebGL context lost';status.textContent='The ocean paused. Reload this page to restore the scene.';$('#dive').disabled=true;});
canvas.addEventListener('webglcontextrestored',()=>location.reload());

function resize(){
  const wasMobile=mobile;mobile=innerWidth<600;
  if(wasMobile!==mobile)mapCollapsed=mobile;paintAtlas();
  const ratio=Math.min(devicePixelRatio||1,quality==='economy'?1:1.5,Math.sqrt(2200000/(innerWidth*innerHeight)));
  renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight,false);uniforms.uRatio.value=ratio;
  camera.aspect=innerWidth/innerHeight;camera.fov=settings.cameraFov+(mobile?7:0);camera.updateProjectionMatrix();
  if(getMode()==='surface'){const sun=skySystem?.getState(phase).sunDirection;exploration.frameSky(sun&&['dawn','dusk'].includes(diagnostic.skyPreset)?Math.atan2(-sun[0],-sun[2]):0);}diagnostic.pixelRatio=ratio;
}
function makeWater(){
  const segments=quality==='economy'?96:160,geo=new THREE.PlaneGeometry(2,2,segments,segments),p=geo.getAttribute('position');
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=-p.getY(i);p.setXYZ(i,(x*.015+Math.pow(x,5)*.985)*1600,0,(z*.015+Math.pow(z,5)*.985)*1600-45);}
  geo.computeBoundingSphere();water=new THREE.Mesh(geo,new THREE.ShaderMaterial({uniforms,vertexShader:waterVertex,fragmentShader:waterFragment,side:THREE.DoubleSide}));
  water.name='Analytic ocean swells';water.frustumCulled=false;scene.add(water);
}
function makeUnderwater(){
  reef=createReef({economy:quality==='economy'});reef.visible=false;scene.add(reef);
  exploration.setTerrain(reef.userData.terrainHeightAt);
  exploration.setCollisions(reef.userData.collisions);
  diagnostic.collisionPieces=reef.userData.collisions?.count??0;diagnostic.habitats=reef.userData.habitatCounts;
  marine=createMarineLife({economy:quality==='economy',terrainHeightAt:reef.userData.terrainHeightAt});scene.add(marine.root);diagnostic.fishCount=marine.count;extraLife=createUnderwaterLife({economy:quality==='economy',terrainHeightAt:reef.userData.terrainHeightAt});scene.add(extraLife.root);diagnostic.extraLife=extraLife.counts;
  diagnostic.visitorCount=0;
  beamGroup=new THREE.Group();
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:beamVertex,fragmentShader:beamFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  for(let i=0;i<9;i++){const beam=new THREE.Mesh(new THREE.PlaneGeometry(1+rng()*2,30),material);beam.position.set(-16+i*4,-7,-20-rng()*35);beam.userData.entry=beam.position.clone().setY(0);beamGroup.add(beam);}scene.add(beamGroup);
  // Transparent rims and a small reflected highlight make these read as air.
  const bubbleMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uNight:uniforms.uNight},
    vertexShader:`varying vec3 vNormal;varying vec3 vView;void main(){vec4 p=instanceMatrix*vec4(position,1.);vec4 mv=modelViewMatrix*p;vNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);vView=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform float uNight;varying vec3 vNormal;varying vec3 vView;void main(){vec3 n=normalize(vNormal);float edge=pow(1.-abs(dot(n,normalize(vView))),2.7);float glint=pow(max(0.,dot(n,normalize(vec3(-.45,.7,.6)))),22.);gl_FragColor=vec4(mix(vec3(.72,.93,.97),vec3(.47,.72,.89),uNight)+glint*.3,edge*.48+glint*.64+.015);}`});
  bubbleMesh=new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,8),bubbleMaterial,72);bubbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);bubbleMesh.frustumCulled=false;scene.add(bubbleMesh);
  for(let i=0;i<72;i++)bubbleData.push({birth:-100,position:new THREE.Vector3(),size:.04,drift:0});
  const positions=[];for(let i=0;i<(mobile?420:850);i++){const x=(rng()-.5)*120,z=30-rng()*135;positions.push(x,reef.userData.terrainHeightAt(x,z)+2+rng()*15,z);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  motes=new THREE.Points(geo,new THREE.ShaderMaterial({uniforms:{uTime:uniforms.uTime,uRatio:uniforms.uRatio},transparent:true,depthWrite:false,
    vertexShader:`uniform float uTime;uniform float uRatio;varying float vAlpha;void main(){vec3 p=position;p.x+=sin(uTime*.16+position.z*.06)*1.3;p.z+=sin(uTime*.11+position.x*.08)*.9;p.y+=sin(uTime*.19+position.x*.1)*.25;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(100.*uRatio/max(1.,-mv.z),1.,7.);vAlpha=.25*exp(-length(mv.xyz)*.026);}`,
    fragmentShader:`varying float vAlpha;void main(){vec2 p=(gl_PointCoord-.5)*vec2(1.,2.8);float a=exp(-dot(p,p)*8.);gl_FragColor=vec4(.68,.86,.91,a*vAlpha);}`}));scene.add(motes);
  for(const [index,landmark] of LANDMARKS.entries()){
    const label=document.createElement('div');label.className='reef-label';label.innerHTML=`${landmark.title}<span>${landmark.description}</span><i></i>`;$('#reef-labels').append(label);reefLabels.push({label,landmark,anchor:new THREE.Vector3(...landmark.position).add(new THREE.Vector3(0,2,0))});
    const marker=document.createElement('button');marker.type='button';marker.textContent=String(index+1);marker.setAttribute('aria-label',`Map marker ${landmark.title}`);marker.title=landmark.title;
    marker.style.left=`${(landmark.position[0]+62)/124*100}%`;marker.style.top=`${(landmark.position[2]+105)/140*100}%`;
    const visit=()=>{if(!diagnostic.submerged)return;mapDestination=landmark;const target=modelScene?.landmarks?.find(item=>item.id===landmark.id);const approach=target?.interactionPosition;exploration.travel(approach||landmark.position,target?.position||landmark.position);setExploring(true);canvas.focus({preventScroll:true});$('#map-caption').textContent=`Swimming toward ${landmark.title}. WASD takes control.`;};
    marker.addEventListener('click',visit);$('#map-chart').append(marker);
    const legend=document.createElement('button');legend.type='button';legend.setAttribute('aria-label',`Swim to ${landmark.title}`);legend.innerHTML=`<span>0${index+1}</span>${landmark.title}`;legend.addEventListener('click',visit);$('#map-legend').append(legend);
  }
}
function updateBubbles(underwater){
  diver.root.updateMatrixWorld(true);
  if(diver.regulator)diver.regulator.getWorldPosition(emitter);else emitter.copy(diver.root.position);
  if(underwater>.5&&bubbleClock!==elapsed){
    if(elapsed>=nextBubble){
      const burst=Math.sin(elapsed*2.1)>.1?5:2;
      for(let i=0;i<burst;i++){const b=bubbleData[bubbleCursor++%bubbleData.length];b.birth=elapsed;b.position.copy(emitter);b.size=.027+rng()*.047;b.drift=rng()*Math.PI*2;}
      nextBubble=elapsed+.16+rng()*.16;
    }
    bubbleClock=elapsed;
  }
  bubbleMesh.visible=underwater>.05;
  for(let i=0;i<bubbleData.length;i++){
    const b=bubbleData[i],age=elapsed-b.birth,alive=age>=0&&age<6;
    dummy.position.copy(b.position);dummy.position.y+=age*.8;dummy.position.x+=Math.sin(age*2+b.drift)*age*.09;dummy.position.z+=Math.cos(b.drift)*age*.08;
    dummy.scale.setScalar(alive?b.size*(1+age*.18):0);dummy.updateMatrix();bubbleMesh.setMatrixAt(i,dummy.matrix);
  }
  bubbleMesh.instanceMatrix.needsUpdate=true;
}
function labelVisible(worldPosition,label,alpha,padding=35){
  // Use a separate temporary: callers sometimes pass relative itself.
  labelDirection.copy(worldPosition).sub(camera.position);
  if(labelDirection.dot(viewDirection)<=0){label.style.opacity='0';return;}
  projected.copy(worldPosition).project(camera);
  const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
  const visible=projected.z<1&&x>padding&&x<innerWidth-padding&&y>110&&y<innerHeight-110;
  label.style.left=`${x}px`;label.style.top=`${y}px`;label.style.opacity=visible?String(alpha):'0';
}
function updateWorld(dt,clockDt=dt){
  if(phaseTarget!==null){phase=THREE.MathUtils.lerp(phase,phaseTarget,1-Math.exp(-dt*1.6));if(Math.abs(phase-phaseTarget)<.002){phase=phaseTarget;phaseTarget=null;}}
  else if(!paused)phase+=clockDt*Math.PI*2/cycleSeconds;
  night=skySystem.getNightFactor?skySystem.getNightFactor(phase):THREE.MathUtils.smoothstep(-Math.cos(phase),-.15,.3);
  if(phaseTarget===null){const altitude=skySystem.getState(phase).sunAltitude;const rising=skySystem.getState(phase+.0001).sunAltitude>altitude;const preset=altitude>-6&&altitude<8?(rising?'dawn':'dusk'):night>.5?'night':'day';if(diagnostic.skyPreset!==preset)paintTheme(night>.5,preset);}
  dive=THREE.MathUtils.lerp(dive,diveTarget,1-Math.exp(-dt*settings.diveResponse));if(Math.abs(dive-diveTarget)<.002)dive=diveTarget;
  const easedDive=THREE.MathUtils.smoothstep(dive,0,1);let underwater=THREE.MathUtils.smoothstep(easedDive,.13,.27);
  uniforms.uTime.value=elapsed;uniforms.uNight.value=night;uniforms.uDive.value=underwater;
  const nav=exploration.update(dt,easedDive>.95,reducedMotion,reef?.userData.safeAscentRoute);
  if(previousMode==='transition'&&nav.mode==='surface'){diveTarget=0;computerOpen=false;$('#dive-label').textContent='Dive in';status.textContent='Back at the surface.';setTimeout(()=>{if(status.textContent==='Back at the surface.')status.textContent='';},1800);}
  previousMode=nav.mode;
  if(nav.mode==='diver'&&easedDive>.75)beginModels();
  if(mapDestination&&!nav.travelling){$('#map-caption').textContent=nav.travelBlocked?'Coral ahead. Steer around it to continue.':nav.manualInput?'Free swimming. Choose a marker to explore.':`${mapDestination.title} reef · A home for this part of the portfolio.`;mapDestination=null;}
  if(nav.exploring!==exploring)setExploring(nav.exploring);
  const bob=paused?0:Math.sin(elapsed*settings.bobFrequency)*settings.bobAmplitude;
  playerPosition.set(nav.offset.x,-8+nav.offset.y,nav.offset.z);
  if(nav.mode==='transition')underwater=THREE.MathUtils.smoothstep(Math.max(0,-playerPosition.y),0,4);
  uniforms.uDive.value=underwater;
  swimDirection.set(-Math.sin(nav.yaw)*Math.cos(nav.pitch),Math.sin(nav.pitch),-Math.cos(nav.yaw)*Math.cos(nav.pitch));
  const firstPerson=nav.perspective==='first';
  chasePosition.copy(playerPosition).addScaledVector(swimDirection,firstPerson?.95:-(settings.cameraDistance+(mobile?.6:0)));
  chasePosition.y+=firstPerson?.15:settings.cameraHeight;
  if(easedDive>.95)chasePosition.y=THREE.MathUtils.clamp(chasePosition.y,reef.userData.terrainHeightAt(chasePosition.x,chasePosition.z)+.45,-.4);
  if(easedDive>.95&&!firstPerson&&settings.collisionEnabled&&reef.userData.collisions){const cameraPath=chasePosition.clone().sub(playerPosition),cameraCandidate=playerPosition.clone();for(let fraction=.95;fraction>=.1;fraction-=.1){cameraCandidate.copy(playerPosition).addScaledVector(cameraPath,fraction);if(reef.userData.collisions.segmentClear(playerPosition,cameraCandidate,.28)){chasePosition.copy(cameraCandidate);break;}}}
  cameraGoal.set(THREE.MathUtils.lerp(playerPosition.x,chasePosition.x,easedDive),THREE.MathUtils.lerp(2.5,chasePosition.y,easedDive)+bob,THREE.MathUtils.lerp(playerPosition.z+10,chasePosition.z,easedDive));
  const ascending=nav.mode==='transition';
  if(ascending){
    cameraGoal.copy(playerPosition).add(new THREE.Vector3(7,2.2,6));
    cameraGoal.y=Math.max(cameraGoal.y,reef.userData.terrainHeightAt(cameraGoal.x,cameraGoal.z)+1);
    if(settings.collisionEnabled&&!reef.userData.collisions.segmentClear(playerPosition,cameraGoal,.28))cameraGoal.copy(playerPosition).add(new THREE.Vector3(2,1.5,2));
  }
  relative.set(-Math.sin(nav.yaw)*Math.cos(nav.pitch-.04),Math.sin(nav.pitch-.04),-Math.cos(nav.yaw)*Math.cos(nav.pitch-.04)).add(cameraGoal);
  lookTarget.copy(playerPosition).addScaledVector(swimDirection,firstPerson?10:settings.cameraLookAhead);
  lookTarget.lerp(relative,1-easedDive);
  if(diveTarget===1&&easedDive>.03&&easedDive<.95&&!ascending){
    const approach=THREE.MathUtils.smoothstep(easedDive,.03,.45)*(1-THREE.MathUtils.smoothstep(easedDive,.45,.95));
    const surfaceOffset=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*camera.aspect*7.2*.66;
    const face=new THREE.Vector3(playerPosition.x+surfaceOffset*(1-easedDive),THREE.MathUtils.lerp(.55,playerPosition.y+.3,easedDive),playerPosition.z+2.8*(1-easedDive));
    cameraGoal.lerp(face.clone().add(new THREE.Vector3(0,.15,2.3)),approach);
    lookTarget.lerp(face,approach);
  }
  if(ascending)lookTarget.copy(playerPosition).add(new THREE.Vector3(0,.7,0));
  if(reducedMotion||diagnostic.frames===0)camera.position.copy(cameraGoal);
  else camera.position.lerp(cameraGoal,1-Math.exp(-dt*(ascending?3:settings.cameraResponse)));
  diagnostic.cameraMoving=camera.position.distanceToSquared(cameraGoal)>.00001;
  camera.lookAt(lookTarget);if(firstPerson&&wristComputer?.diagnostics.visible)camera.rotateX(-.18*wristComputer.diagnostics.progress);camera.getWorldDirection(viewDirection);camera.updateMatrixWorld(true);
  underwater=THREE.MathUtils.smoothstep(-camera.position.y,-.12,1.2);uniforms.uDive.value=underwater;
  const skyState=skySystem.update(phase,camera.position,night,underwater,elapsed);
  const depthLight=THREE.MathUtils.smoothstep(Math.max(0,-camera.position.y),22,60)*underwater;
  uniforms.uDepth.value=depthLight;diagnostic.depthLighting=depthLight;
  scene.fog.color.copy(fogDay).lerp(fogNight,night).lerp(fogDeep,underwater).lerp(fogAbyss,depthLight);scene.fog.density=THREE.MathUtils.lerp(.0048,.019,underwater)+depthLight*.025;
  const sunHeight=Math.max(0,uniforms.uSun.value.y),moonHeight=Math.max(0,uniforms.uMoon.value.y);
  const solar=THREE.MathUtils.smoothstep(sunHeight,0,.6),lunar=moonHeight*Math.sqrt(skyState.moonIllumination??0);
  const surfaceLight=solar+lunar*.12,boost=settings.brightnessBoost/100;
  uniforms.uSurfaceLight.value=surfaceLight;
  renderer.toneMappingExposure=1.15*(1+boost*.55*underwater);
  ambient.color.set('#c8e7e6').lerp(skyFillNight,night);
  ambient.intensity=(.55+solar*1.3)*(1-underwater*.18)*(1-depthLight*.62)+boost*underwater*.8;
  sunlight.color.copy(lightDay).lerp(lightNight,night).lerp(new THREE.Color('#72cbd1'),depthLight*.55);
  sunlight.intensity=(sunHeight>0?.35+solar*2.1:lunar*.65)*Math.exp(-Math.max(0,-camera.position.y)*.026);
  sunlight.position.copy(sunHeight>0?uniforms.uSun.value:uniforms.uMoon.value).multiplyScalar(100);
  const downLight=new THREE.Vector3().copy(sunHeight>0?uniforms.uSun.value:uniforms.uMoon.value);
  downLight.x*=-.65;downLight.z*=-.65;downLight.y=-Math.sqrt(Math.max(.01,1-downLight.x*downLight.x-downLight.z*downLight.z));downLight.normalize();
  for(const beam of beamGroup.children){beam.position.copy(beam.userData.entry).addScaledVector(downLight,15);beam.quaternion.setFromUnitVectors(axisY,downLight);}
  reef.userData.surfaceLight&&(reef.userData.surfaceLight.value=surfaceLight);
  diagnostic.surfaceLight=surfaceLight;diagnostic.brightnessBoost=settings.brightnessBoost;diagnostic.exposure=renderer.toneMappingExposure;diagnostic.ambientIntensity=ambient.intensity;
  const golden=(1-THREE.MathUtils.smoothstep(Math.abs(uniforms.uSun.value.y),.025,.24))*(1-night*.65);
  clouds.material.color.copy(cloudDay).lerp(cloudNight,night).lerp(new THREE.Color('#ffab79'),golden*.72);clouds.material.opacity=(1-underwater)*THREE.MathUtils.lerp(.9,.4,night);clouds.group.rotation.y=phase*.16;clouds.group.position.x=Math.sin(elapsed*.015)*2;birds?.update(elapsed,camera.position,night,underwater);
  sunlight.color.lerp(new THREE.Color('#ffb57c'),golden*.7);distantScenery?.update(elapsed,night,underwater);
  const scale=settings.diverScale*(mobile?1.03/1.35:camera.aspect<1?1.17/1.35:1);
  diver.root.scale.setScalar(scale);
  diver.root.visible=ascending||!(firstPerson&&easedDive>.92);
  const surfaceX=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*camera.aspect*7.2*.66;
  const framingYaw=0;
  relative.set(surfaceX,0,-7.2).applyAxisAngle(axisY,framingYaw);
  const surfaceWorldX=playerPosition.x+relative.x,surfaceWorldZ=playerPosition.z+10+relative.z;
  const surfaceY=waveHeight(surfaceWorldX,surfaceWorldZ,elapsed)-.06;
  diver.root.position.set(THREE.MathUtils.lerp(surfaceWorldX,playerPosition.x,easedDive),THREE.MathUtils.lerp(surfaceY,playerPosition.y,easedDive),THREE.MathUtils.lerp(surfaceWorldZ,playerPosition.z,easedDive));
  // Deliberate trim change followed by small alternating fin kicks.
  poseYaw.setFromAxisAngle(axisY,THREE.MathUtils.lerp(framingYaw-.2,Math.PI+nav.yaw,easedDive));posePitch.setFromAxisAngle(axisX,easedDive*(ascending?.22:Math.PI/2-settings.diverTrim-nav.pitch));
  diver.root.quaternion.copy(poseYaw).multiply(posePitch);
  diveLamp.position.copy(playerPosition);diveLamp.position.y+=.4;diveLamp.intensity=underwater*((night>.5?12:7)+depthLight*8);
  diveLamp.target.position.copy(playerPosition).addScaledVector(swimDirection,12);
  for(const {shoulder,forearm,side} of diver.arms){shoulder.rotation.z=side*(.13-easedDive*.03);shoulder.rotation.x=-.08-easedDive*.17;forearm.rotation.x=-.28-easedDive*.72;}
  for(const {hip,shin,side} of diver.legs){const kick=paused?0:Math.sin(elapsed*settings.kickFrequency+(side===1?Math.PI:0));hip.rotation.x=kick*easedDive*settings.kickAmplitude;shin.rotation.x=.08+easedDive*.16+kick*easedDive*settings.kickAmplitude*.79;}
  if(largeMarine)largeMarine.root.visible=underwater>.01&&largeMarine.diagnostics.loaded;extraLife.root.visible=underwater>.01;reef.visible=underwater>.01;marine.root.visible=underwater>.01;beamGroup.visible=underwater>.01;motes.visible=underwater>.01;
  if(modelScene)modelScene.root.visible=underwater>.01;
  if(underwater>.01){marine.update(paused?0:dt,elapsed,playerPosition);extraLife.update(paused?0:dt,elapsed,playerPosition);largeMarine?.update(paused?0:dt);modelScene?.update(paused?0:dt,elapsed,playerPosition,night);reef.userData.update?.(elapsed,night,depthLight);}
  motes.position.y=Math.sin(elapsed*.07)*.2;updateBubbles(underwater);
  for(const {label,anchor} of skyLabels){anchor.getWorldPosition(relative);labelVisible(relative,label,relative.y-camera.position.y>20?night*(1-underwater)*.7:0);}
  for(const item of reefLabels){
    const {label,anchor}=item;
    if(!item.checkedAt||elapsed-item.checkedAt>.2||paused){
      item.checkedAt=elapsed;item.clear=camera.position.distanceTo(anchor)<65;
      for(let t=.08;item.clear&&t<.96;t+=.06){relative.lerpVectors(camera.position,anchor,t);if(relative.y<reef.userData.terrainHeightAt(relative.x,relative.z)+.15)item.clear=false;}
    }
    labelVisible(anchor,label,item.clear?underwater*.85:0);
  }
  const submerged=nav.mode==='transition'||underwater>.55;
  if(diagnostic.submerged!==submerged){diagnostic.submerged=submerged;document.body.dataset.submerged=String(submerged);$('.deep-copy').setAttribute('aria-hidden',String(!submerged));$('.surface-copy').setAttribute('aria-hidden',String(submerged));$('.reef-map').hidden=!submerged;$('.swim-controls').hidden=!submerged;}
  $('#look-hint').textContent=nav.mode==='transition'?`Ascending · ${Math.ceil(nav.ascentDepth)} m remaining`:nav.pointerLocked?(submerged?'Mouse captured · WASD swim · Space/Shift depth · Esc releases mouse':'Look around · Mouse or arrow keys · Esc releases mouse'):submerged?'Click ocean to swim · WASD · Space/Shift depth':'Click the ocean to look around · Esc releases mouse';
  const depth=Math.max(0,-diver.root.position.y);$('#depth-value').textContent=`${String(Math.round(depth)).padStart(2,'0')} M`;$('#depth-marker').style.top=`${Math.min(depth/60,1)*100}%`;
  const captureHint=$('#capture-hint');if(captureHint)captureHint.hidden=!(submerged&&!nav.exploring&&!nav.pointerLocked&&nav.mode!=='transition');
  const crosshair=$('#crosshair');if(crosshair)crosshair.hidden=!(nav.pointerLocked&&(nav.mode==='diver'||nav.mode==='surface'));
  const cameraButton=$('#camera-toggle');if(cameraButton){cameraButton.hidden=!submerged;cameraButton.setAttribute('aria-pressed',String(nav.perspective==='third'));cameraButton.textContent=nav.perspective==='third'?'First-person view · V':'Third-person view · V';}
  $('#dive').disabled=nav.mode==='transition';
  const ascentStatus=$('#ascent-status');if(ascentStatus){ascentStatus.hidden=nav.mode!=='transition';ascentStatus.textContent=`ASCENDING · ${Math.ceil(nav.ascentDepth)} M TO SURFACE`;}
  const edge=Math.abs(playerPosition.x)>32||playerPosition.z< -65||playerPosition.z>15;
  $('#scene-location').textContent=submerged?(edge?'REEF DROP-OFF':'CORAL GARDENS'):'AT THE SURFACE';
  wristComputer?.update(dt,{open:computerOpen,allowed:firstPerson&&nav.mode==='diver'&&easedDive>.95&&!getTransition()&&!interfaceOpen&&!movementPanelOpen,reducedMotion,depth,location:edge?'REEF DROP-OFF':'CORAL GARDENS',data:diagnostic.diveComputer});
  $('#map-player').style.left=`${(playerPosition.x+62)/124*100}%`;$('#map-player').style.top=`${(playerPosition.z+105)/140*100}%`;$('#map-player').style.setProperty('--heading',`${-nav.yaw}rad`);
  const bearing=((90-Math.atan2(-viewDirection.x,-viewDirection.z)*180/Math.PI)%360+360)%360;
  $('#heading-value').textContent=`${String(Math.round(bearing)).padStart(3,'0')}°`;
  $('#heading-cardinal').textContent=['N','NE','E','SE','S','SW','W','NW'][Math.round(bearing/45)%8];
  $('#north-arrow').style.transform=`rotate(${-bearing}deg)`;
  $('.heading-indicator').setAttribute('aria-label',`Heading ${Math.round(bearing)} degrees. North is ${Math.round((360-bearing)%360)} degrees clockwise.`);
  $('#speed-value').textContent=`${nav.speed.toFixed(1)} M/S`;
  $('#reef-zone').textContent=nav.colliding?'CORAL NEARBY':nav.atBoundary?'EXPLORATION LIMIT':edge?'OUTER SLOPE':'REEF SHELF';
  const skyTime=skyState.date?skyClockFormat.format(skyState.date):'';
  $('#sky-clock').textContent=`KL ${skyTime} · ${paused?'PAUSED':'72× TIME'}`;
  $('#sky-clock').title='Kuala Lumpur sky · current lunar phase · 20 minutes per simulated day';
  projected.copy(diver.root.position).project(camera);
  diagnostic.depth=Number(depth.toFixed(2));diagnostic.transition=nav.transition||dive!==diveTarget||phaseTarget!==null;diagnostic.phase=phase;diagnostic.night=night;diagnostic.position=camera.position.toArray();diagnostic.playerPosition=playerPosition.toArray();diagnostic.diverScreen=projected.toArray();diagnostic.bounds=exploration.bounds;diagnostic.look=[nav.yaw,nav.pitch];diagnostic.sunDirection=uniforms.uSun.value.toArray();diagnostic.moonDirection=uniforms.uMoon.value.toArray();diagnostic.exploring=exploring;diagnostic.swimming=nav.moving;diagnostic.activeBubbles=bubbleData.filter(b=>elapsed-b.birth>=0&&elapsed-b.birth<6).length;
  Object.assign(diagnostic,{simulatedUTC:skyState.simulatedUTC,observer:skyState.observer,moonIllumination:skyState.moonIllumination,moonPhaseAngle:skyState.moonPhaseAngle,sunAltitude:skyState.sunAltitude,moonAltitude:skyState.moonAltitude});
  Object.assign(diagnostic,{movement:{...settings},colliding:nav.colliding,contacts:nav.contacts,pointerLocked:Boolean(nav.pointerLocked),cameraMode:nav.perspective});
}
function frame(now){
  if(!focused||!renderer){running=false;return;}
  const raw=lastFrame?Math.min((now-lastFrame)/1000,1):1/60,dt=Math.min(raw,.1);lastFrame=now;
  if(!paused)elapsed+=dt;
  try{updateWorld(dt,raw);}catch(error){running=false;fail(error);return;}
  const interval=quality==='economy'?1000/30:1000/60;
  if(now-lastDraw>=interval-.5||paused||diagnostic.transition){lastDraw=now;renderer.render(scene,camera);diagnostic.frames++;frameCount++;diagnostic.drawCalls=renderer.info.render.calls;diagnostic.triangles=renderer.info.render.triangles;}
  if(!paused&&!diagnostic.transition){perfDuration+=raw;if(perfDuration>=3){diagnostic.fps=Math.round(frameCount/perfDuration);frameCount=0;perfDuration=0;perfSamples++;if(perfSamples>1&&diagnostic.fps<24&&quality!=='economy'){quality='economy';diagnostic.quality=quality;resize();}}}else{frameCount=0;perfDuration=0;}
  if(paused&&!diagnostic.transition&&!exploration.state.moving&&!diagnostic.cameraMoving&&!wristComputer?.diagnostics.animating){running=false;lastFrame=0;return;}
  raf=requestAnimationFrame(frame);
}
function wake(){if(!running&&renderer&&focused){running=true;lastFrame=0;raf=requestAnimationFrame(frame);}}
function fail(error){console.error('Ocean scene:',error);diagnostic.error=error.message;diagnostic.ready=false;document.body.dataset.fallback='true';canvas.style.display='none';$('#dive-label').textContent='Ocean unavailable';$('#dive').disabled=true;status.textContent='The 3D ocean needs WebGL 2. Try a browser with hardware acceleration enabled.';}
paintTheme(selectedNight);updateMotionUI();
try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:quality==='standard',alpha:false,powerPreference:'low-power'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.debug.onShaderError=()=>fail(new Error('A scene shader could not compile'));
  scene=new THREE.Scene();scene.fog=new THREE.FogExp2(fogDay,.0048);camera=new THREE.PerspectiveCamera(47,innerWidth/innerHeight,.05,1800);scene.add(camera);
  ambient=new THREE.HemisphereLight('#c8e7e6','#294e55',1.85);scene.add(ambient);sunlight=new THREE.DirectionalLight('#ffe6bf',2.3);scene.add(sunlight);
  const rim=new THREE.DirectionalLight('#7acecd',.65);rim.position.set(8,3,3);scene.add(rim);
  diveLamp=new THREE.SpotLight('#c4ebe4',0,22,.42,.72,1.35);scene.add(diveLamp,diveLamp.target);
  skySystem=createSkySystem(uniforms,rng);scene.add(skySystem.root);diagnostic.starCount=skySystem.starCount;diagnostic.constellationCount=skySystem.constellationCount;
  if(!savedTheme)phase=skySystem.initialPhase;
  else if(skySystem.presets[savedTheme]!==undefined){phase=skySystem.presets[savedTheme];paintTheme(savedTheme==='night',savedTheme);}
  for(const item of skySystem.labels){const label=document.createElement('div');label.className='constellation-label';label.innerHTML=`<i></i>${item.name.toUpperCase()}`;$('#sky-labels').append(label);skyLabels.push({label,anchor:item.anchor});}
  makeWater();distantScenery=createDistantScenery({economy:quality==='economy'});scene.add(distantScenery.root);diagnostic.distantScenery=distantScenery.counts;birds=createSeabirds({economy:quality==='economy'});scene.add(birds.root);clouds=createClouds();scene.add(clouds.group);diver=createDiver();scene.add(diver.root);makeUnderwater();resize();
  wristComputer=createWristComputer(camera,diver.materials);diagnostic.wristComputer=wristComputer.diagnostics;
  updateWorld(1/60);renderer.compile(scene,camera);renderer.render(scene,camera);
  if(!diagnostic.error){diagnostic.ready=true;document.body.dataset.ready='true';$('#dive').disabled=false;$('#dive-label').textContent='Dive in';status.textContent='';wake();}
}catch(error){fail(error);}

