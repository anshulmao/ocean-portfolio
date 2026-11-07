import * as THREE from './vendor/three.module.min.js';

const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const compass=angle=>['N','NE','E','SE','S','SW','W','NW'][Math.round(angle/45)%8];

// A visitor-led tour of the actual sky drawn by sky-system.js. It temporarily
// borrows the surface camera and clock; it never changes saved preferences.
export function createSkyViewer({sky,camera,available,begin,end,wake,reducedMotion=()=>false}) {
  const opener=document.querySelector('#sky-viewer-open');
  if(!opener)return null;
  const dialog=document.createElement('dialog');dialog.id='sky-viewer';dialog.className='sky-viewer';
  dialog.setAttribute('aria-labelledby','sky-viewer-title');dialog.setAttribute('data-ui','');
  dialog.innerHTML=`<div class="sky-viewer-head"><div><h2 id="sky-viewer-title">Sky above Kuala Lumpur</h2><p id="sky-viewer-clock"></p></div><button type="button" class="sky-viewer-close" aria-label="Close sky viewer">Close <span aria-hidden="true">×</span></button></div>
    <section class="sky-viewer-panel" aria-labelledby="sky-target-name"><div class="sky-viewer-choice"><label for="sky-target">Find in this sky</label><select id="sky-target"></select></div><div class="sky-viewer-reading" aria-live="polite" aria-atomic="true"><h3 id="sky-target-name"></h3><p id="sky-target-position" class="sky-target-position"></p><p id="sky-target-description"></p></div><div class="sky-viewer-actions"><button type="button" id="sky-previous">Previous</button><button type="button" id="sky-play" aria-pressed="false">Play tour</button><button type="button" id="sky-next">Next <span aria-hidden="true">→</span></button></div><p class="sky-viewer-source">Real catalogue stars · time held for the tour. <a href="https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50" target="_blank" rel="noopener">Yale Bright Star Catalogue</a></p></section>`;
  document.body.append(dialog);
  const find=selector=>dialog.querySelector(selector),select=find('#sky-target'),play=find('#sky-play');
  let active=false,targets=[],index=0,saved=null,restoreFocus=null,playing=false,dwell=0,panTime=0,panFor=1;
  const viewRotation=new THREE.Quaternion(),fromRotation=new THREE.Quaternion(),goalRotation=new THREE.Quaternion();
  const aim=new THREE.PerspectiveCamera(),direction=new THREE.Vector3(),aimPoint=new THREE.Vector3();
  const offsetRotation=new THREE.Quaternion(),forward=new THREE.Vector3(0,0,-1),localRay=new THREE.Vector3();
  let fromFov=camera.fov,goalFov=camera.fov;
  function paintTarget() {
    const target=targets[index];if(!target)return;
    select.value=target.id;
    find('#sky-target-name').textContent=target.name;
    find('#sky-target-position').textContent=`${target.kind} · ${Math.round(target.altitude)}° above ${compass(target.azimuth)}${target.magnitude===undefined?'':` · magnitude ${target.magnitude}`}`;
    find('#sky-target-description').textContent=target.description;
    // Frame the subject in the open sky, above a phone sheet or beside a
    // landscape sheet. A constellation must not disappear under its own caption.
    const head=find('.sky-viewer-head').getBoundingClientRect(),panel=find('.sky-viewer-panel').getBoundingClientRect();
    let x=innerWidth/2,y=innerHeight/2,width=innerWidth-48,height=innerHeight-48;
    if(panel.left>innerWidth*.45&&panel.top<innerHeight*.6){width=panel.left-24;height=innerHeight-head.bottom-24;x=(panel.left+12)/2;y=(head.bottom+innerHeight-12)/2;}
    else if(panel.width>innerWidth*.7){height=Math.max(80,panel.top-head.bottom-32);y=(head.bottom+panel.top)/2;}
    const radius=target.angularRadius??.01,fit=Math.tan(radius)*1.12;
    fromFov=camera.fov;goalFov=Math.min(100,Math.max(saved.fov,2*Math.atan(Math.max(fit*innerHeight/height,fit*innerWidth/width/camera.aspect))*180/Math.PI));
    direction.fromArray(target.direction);aim.position.copy(saved.position);aim.lookAt(aimPoint.copy(saved.position).add(direction));
    const tangent=Math.tan(goalFov*Math.PI/360);
    localRay.set((x/innerWidth*2-1)*tangent*camera.aspect,(1-y/innerHeight*2)*tangent,-1).normalize();
    aim.quaternion.multiply(offsetRotation.setFromUnitVectors(localRay,forward));
    fromRotation.copy(viewRotation);goalRotation.copy(aim.quaternion);panTime=0;panFor=Math.min(5,1.6+fromRotation.angleTo(goalRotation)*1.15);dwell=0;
    sky.focusTarget(target.id);wake();
  }
  function move(offset){if(!active||!targets.length)return;index=(index+offset+targets.length)%targets.length;paintTarget();}
  function setPlaying(value){playing=Boolean(value);dwell=0;play.setAttribute('aria-pressed',String(playing));play.textContent=playing?'Pause tour':'Play tour';wake();}
  function close() {
    if(!active)return;
    active=false;setPlaying(false);sky.focusTarget();
    camera.position.copy(saved.position);camera.quaternion.copy(saved.rotation);camera.fov=saved.fov;camera.updateProjectionMatrix();
    delete document.body.dataset.skyViewer;
    end(saved.state);dialog.close();saved=null;
    if(restoreFocus?.isConnected)restoreFocus.focus({preventScroll:true});
    wake();
  }
  function open() {
    if(active||!available())return false;
    restoreFocus=document.activeElement;
    saved={position:camera.position.clone(),rotation:camera.quaternion.clone(),fov:camera.fov,state:begin()};
    active=true;index=0;viewRotation.copy(camera.quaternion);fromRotation.copy(camera.quaternion);setPlaying(false);
    const phase=sky.phaseAtLocalHour(22);
    targets=sky.tourTargets(phase);
    // Near the equator there are always bright catalogue stars above this
    // cutoff. Keep this failure reversible if the observing site ever changes.
    if(!targets.length){close();return false;}
    select.replaceChildren(...targets.map(target=>{const option=document.createElement('option');option.value=target.id;option.textContent=target.name;return option;}));
    const state=sky.getState(phase);
    find('#sky-viewer-clock').textContent=`${clock.format(state.date)} MYT · clear-sky preview · ${sky.observer.latitude}° N, ${sky.observer.longitude}° E`;
    document.body.dataset.skyViewer='open';dialog.showModal();paintTarget();
    find('.sky-viewer-close').focus({preventScroll:true});wake();return true;
  }
  opener.addEventListener('click',open);
  find('.sky-viewer-close').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(active)close();});
  dialog.addEventListener('keydown',event=>{
    if(event.target===select)return;
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}
  });
  select.addEventListener('change',()=>{index=targets.findIndex(target=>target.id===select.value);paintTarget();});
  find('#sky-previous').addEventListener('click',()=>move(-1));find('#sky-next').addEventListener('click',()=>move(1));
  play.addEventListener('click',()=>setPlaying(!playing));
  addEventListener('resize',()=>{if(active)paintTarget();});
  function update(dt) {
    if(!active)return;
    panTime+=dt;const progress=reducedMotion()?1:Math.min(1,panTime/panFor),blend=(1-Math.cos(Math.PI*progress))/2;
    viewRotation.slerpQuaternions(fromRotation,goalRotation,blend);camera.position.copy(saved.position);camera.quaternion.copy(viewRotation);
    const fov=fromFov+(goalFov-fromFov)*blend;if(Math.abs(camera.fov-fov)>.001){camera.fov=fov;camera.updateProjectionMatrix();}
    if(playing&&progress===1){dwell+=dt;if(dwell>=12)move(1);}
  }
  return {open,close,update,get active(){return active;},get target(){return targets[index]??null;},get playing(){return playing;},get settled(){return panTime>0&&(reducedMotion()||panTime>=panFor);}};
}
