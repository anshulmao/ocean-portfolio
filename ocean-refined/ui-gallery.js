import { toDisplayDepth, toWorldDepth, DISPLAY_MAX_DEPTH } from './depth-metrics.js';
import * as THREE from './vendor/three.module.min.js';
import {terrainHeightAt,LANDMARKS} from './reef.js';
import {drawReefChart} from './expedition-ui.js';
import {createMovementPanel} from './movement-panel.js';
// Reuse the actual interface markup and controllers; no renderer or world is created.
const source=await fetch('./index.html').then(r=>r.text()),documentSource=new DOMParser().parseFromString(source,'text/html');
for(const node of [...documentSource.body.children])if(!['SCRIPT','NOSCRIPT'].includes(node.tagName))document.body.append(node);
const $=selector=>document.querySelector(selector);
document.body.dataset.ready='true';document.body.dataset.submerged='true';document.body.dataset.exploring='true';document.documentElement.dataset.skyPreset='day';
const state={ready:true,submerged:true,transition:false,depth:24.6,cameraMode:'third',wristComputer:{visible:false},playerPosition:[0,-24.6,-14]};window.oceanDiagnostics=state;
// Stand-ins for the scene: a camera the heading tape and minimap can follow, and the sky locks the settings menu reflects.
const camera=new THREE.PerspectiveCamera();let bearing=72;
const aim=()=>{const angle=(90-bearing)*Math.PI/180;camera.lookAt(-Math.sin(angle),0,-Math.cos(angle));camera.updateMatrixWorld(true);};aim();
const changed=()=>window.dispatchEvent(new Event('oceanweatherchange'));
const time={locked:false,lock(value){this.locked=Boolean(value);changed();}};
const weather={state:'clear',target:'clear',locked:false,states:['clear','rain','storm'],set(name){if(name==='auto')this.locked=false;else if(this.states.includes(name)){this.state=this.target=name;this.locked=true;}changed();},lock(value){this.locked=Boolean(value);changed();}};
window.oceanControls={getMode:()=>state.submerged?'diver':'surface',getTransition:()=>false,getPlayerPosition:()=>new THREE.Vector3(50,-24,20),getCamera:()=>camera,setComputerOpen:()=>{},setInterfaceOpen:()=>{},time,weather};
await import('./landmark-interactions.js');await import('./dive-hud.js');await import('./hud.js');createMovementPanel(()=>{},()=>{});
drawReefChart(terrainHeightAt);const map=$('.reef-map');map.hidden=false;$('.swim-controls').hidden=false;
LANDMARKS.forEach((item,i)=>{const marker=document.createElement('button');marker.type='button';marker.textContent=i+1;marker.dataset.landmark=item.id;marker.style.left=(item.position[0]+62)/124*100+'%';marker.style.top=(item.position[2]+105)/140*100+'%';marker.title=item.title;marker.setAttribute('aria-label',`Map marker ${item.title}`);$('#map-chart').append(marker);const legend=document.createElement('button');legend.type='button';legend.innerHTML=`<span>0${i+1}</span>${item.title}`;$('#map-legend').append(legend);});$('#map-player').style.cssText='left:50%;top:65%';
$('#camera-toggle').hidden=false;
$('#depth-marker').style.top='41%';$('#depth-value').textContent='16 M';$('#dive').disabled=false;$('#dive-label').textContent='Back to the surface';
const tools=document.createElement('nav');tools.className='gallery-tools';tools.setAttribute('aria-label','Interface collection');tools.innerHTML='<label>Component <select id="ui-component"><option value="hud">Complete HUD</option><option value="map">Reef map</option><option value="computer">Dive computer + console</option><option value="heading">Compass, depth gauge + console</option><option value="clock">Settings menu</option><option value="profile">Dive records</option><option value="settings">Scene controls</option></select></label><button id="ui-surface">Surface / underwater</button><button id="ui-camera">First / third person</button><button id="ui-turn">Turn 25°</button><button id="ui-descend">Descend 6 m</button><button id="ui-ascend">Ascend 2 m</button><button id="ui-slate">Show a note</button><a href="./world-viewer.html">World viewer</a><a href="./">Live scene</a>';document.body.append(tools);
const parts=['.masthead','.hero','.heading-indicator','.reef-map','.depth','.air-gauge','.scene-footer','.swim-controls','.view-controls','#archive-toggle','#dive-computer-toggle','.mask-frame'];
const groups={hud:parts,map:['.reef-map'],computer:['#dive-computer-toggle','.air-gauge','.depth'],heading:['.heading-indicator','.depth','.air-gauge'],clock:['.masthead'],profile:['#archive-toggle'],settings:['.masthead']};
$('#ui-component').onchange=e=>{const choice=e.target.value;for(const selector of parts)if($(selector))$(selector).style.visibility=groups[choice].includes(selector)?'visible':'hidden';$('#dive-computer').hidden=true;window.oceanHud.setMenu(choice==='clock');window.oceanHud.setMapView(choice==='map');if(choice==='profile')$('#archive-toggle').click();if(choice==='settings')$('#movement-toggle').click();if(choice==='computer'){state.submerged=true;$('#dive-computer-toggle').click();}};
$('#ui-surface').onclick=()=>{state.submerged=!state.submerged;document.body.dataset.submerged=String(state.submerged);document.body.dataset.exploring=String(state.submerged);map.hidden=!state.submerged;$('#camera-toggle').hidden=!state.submerged;$('#dive-label').textContent=state.submerged?'Back to the surface':'Dive in';window.dispatchEvent(new Event('oceanmediumchange'));};
$('#ui-camera').onclick=()=>{state.cameraMode=state.cameraMode==='third'?'first':'third';$('#camera-toggle').setAttribute('aria-pressed',String(state.cameraMode==='third'));$('#camera-toggle').textContent=state.cameraMode==='third'?'First-person view · V':'Third-person view · V';window.dispatchEvent(new Event('oceanmediumchange'));};
$('#camera-toggle').onclick=()=>$('#ui-camera').click();$('#camera-toggle').setAttribute('aria-pressed','true');$('#camera-toggle').textContent='First-person view · V';
$('#ui-turn').onclick=()=>{bearing=(bearing+25)%360;aim();$('#heading-value').textContent=String(Math.round(bearing)).padStart(3,'0')+'°';$('#heading-cardinal').textContent=['N','NE','E','SE','S','SW','W','NW'][Math.round(bearing/45)%8];$('#map-player').style.setProperty('--heading',(bearing-90)*Math.PI/180+'rad');window.oceanHud.sync();};
// Depth changes for the console: the dive model in dive-hud.js works out the rest (no-stop time, ascent meter, safety stop, profile).
const setDepth=value=>{state.depth=Math.max(0,Math.min(58,value));state.playerPosition[1]=-state.depth;$('#depth-marker').style.top=toDisplayDepth(state.depth)/DISPLAY_MAX_DEPTH*100+'%';$('#depth-value').textContent=String(Math.round(toDisplayDepth(state.depth))).padStart(2,'0')+' M';};
$('#ui-descend').onclick=()=>setDepth(state.depth+toWorldDepth(6));$('#ui-ascend').onclick=()=>setDepth(state.depth-toWorldDepth(2));
// A sample note in the slate idiom (the live scene's toasts come from journey.js, which needs the 3D scene).
const note=document.createElement('div');note.className='journey-toast';note.setAttribute('role','status');note.innerHTML='<i></i><div><small>Safety stop</small><span>Level off at 5 m for 3 minutes. Simulated: surfacing early costs nothing.</span></div>';note.dataset.show='false';document.body.append(note);
$('#ui-slate').onclick=()=>{note.dataset.show=String(note.dataset.show!=='true');};
$('#heading-value').textContent='072°';$('#map-player').style.setProperty('--heading',(bearing-90)*Math.PI/180+'rad');window.oceanHud.sync();
// The sky presets and the motion switch are painted by the scene; here they only mirror themselves.
for(const id of ['dawn','day','dusk','night'])$('#'+id).onclick=()=>{document.documentElement.dataset.skyPreset=id;document.documentElement.dataset.theme=id==='night'?'night':'day';for(const other of ['dawn','day','dusk','night'])$('#'+other).setAttribute('aria-pressed',String(other===id));};
$('#motion').onclick=()=>{const paused=$('#motion').getAttribute('aria-pressed')!=='true';$('#motion').setAttribute('aria-pressed',String(paused));$('#motion-label').textContent=paused?'Resume motion':'Pause motion';};
$('#time-slider').oninput=e=>{const minutes=Number(e.target.value);$('#time-reading').textContent=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');const orb=$('#time-orb');orb.style.left=minutes/1440*100+'%';orb.dataset.kind=minutes<360||minutes>1140?'moon':'sun';};$('#time-orb').style.left='29%';
window.uiGallery={ready:true,renderer:false,components:Object.keys(groups)};
