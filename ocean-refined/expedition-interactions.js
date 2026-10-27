import { toDisplayDepth } from './depth-metrics.js';
import * as THREE from './vendor/three.module.min.js';
import { onTick, ui } from './ui-ticker.js';
import { safetyRatingMarkup } from './safety-rating.js';
import { createSafetyStopClock, SAFETY_STOP_SECONDS, inSafetyStopRange } from './safety-stop-clock.js';
import {sendFeedback, sendPhoto} from './submissions.js';
import {track} from './analytics.js';

// Visitor submissions are explicit; photos still download locally unless separately shared.
const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet'; stylesheet.href = new URL('./expedition-interactions.css', import.meta.url).href;
document.head.append(stylesheet);
const ratingStylesheet = document.createElement('link');
ratingStylesheet.rel = 'stylesheet'; ratingStylesheet.href = new URL('./safety-rating.css', import.meta.url).href;
document.head.append(ratingStylesheet);
const dock = document.createElement('aside'); dock.className = 'expedition-tools'; dock.hidden = true;
dock.setAttribute('aria-label', 'Expedition tools');
dock.innerHTML = '<button type="button" data-stop hidden><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2v9m-4-4 4 4 4-4M7 16h18M16 30v-9m-4 4 4-4 4 4"/></svg><span><strong>Safety stop available</strong><small>Hold at 3–5 m · Press <kbd>F</kbd></small></span><output class="stop-offer-time">10s</output><span class="stop-offer-track" aria-hidden="true"><i></i></span></button><button type="button" data-photo hidden>Photo <kbd>H</kbd></button><button type="button" data-inventory hidden>Finds <span data-score>0</span></button>';
const notice = document.createElement('div'); notice.className = 'expedition-notice'; notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
const prompt = document.createElement('div'); prompt.className = 'artifact-prompt'; prompt.hidden = true;
const dialog = document.createElement('dialog'); dialog.className = 'expedition-dialog'; dialog.setAttribute('aria-labelledby', 'expedition-title');
document.body.append(dock, notice, prompt, dialog);
const score = dock.querySelector('[data-score]'), photoButton = dock.querySelector('[data-photo]'), stopButton = dock.querySelector('[data-stop]');
const offerFill = stopButton.querySelector('i'), offerTime = stopButton.querySelector('output');
let offerLeft=0, offerUsed=false, offerSecond=-1,returnOffer=false;
function offerAvailable() { return offerLeft>0&&!dialog.open&&!ui.dialog&&!ui.panel&&!window.oceanControls?.nav?.suspended&&(window.oceanControls?.nav.returnPhase==='offer'||(!window.oceanDiagnostics?.nearbyLandmark&&!nearest)); }
const point = new THREE.Vector3(), matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(1,1,1);
const normal = new THREE.Vector3(), artifactPoint = new THREE.Vector3();
const finds = [
  ['Compass medallion',-15,-17], ['Pearl fragment',23,-29], ['Old navigation token',-31,-52],
  ['Ceramic seal',36,-67], ['Glass float',-11,-87], ['Brass tide marker',25,-96],
  ['Reef survey tag',-43,-25], ['Mariner’s coin',47,-45], ['Moon shell',-29,-94], ['Ship’s tally',7,-51],
].map(([name,x,z],id)=>({id,name,x,z,y:0,collected:false}));
let mesh = null, nearest = null, active = '', previousFocus = null, heldDepth = 0, noticeLeft = 0, elapsed = 0, photos = 0;
let lastScore = -1, lastPrompt = '', lastSubmerged = null;
const stopClock = createSafetyStopClock();
let countdown = null, countdownFill = null, countdownTime = null, completion = null, completionLeft = 0, lastSecond = -1;
function startStopClock() {
  stopClock.start(); lastSecond = -1; completionLeft = 0;
  countdown = dialog.querySelector('.safety-countdown');
  countdownFill = dialog.querySelector('.safety-countdown-fill');
  countdownTime = dialog.querySelector('.safety-countdown-time');
  completion = dialog.querySelector('.safety-complete');
  renderStopClock();
}
function renderStopClock() {
  if (!countdown) return;
  const seconds = Math.ceil(stopClock.remaining);
  if (seconds !== lastSecond) {
    lastSecond = seconds;
    countdownTime.textContent = stopClock.completed ? 'Complete' : `0:${String(seconds).padStart(2,'0')}`;
    countdown.setAttribute('aria-valuenow', String(SAFETY_STOP_SECONDS - seconds));
    countdown.setAttribute('aria-valuetext', stopClock.completed ? 'Safety stop complete' : `${seconds} seconds remaining`);
  }
  countdownFill.style.transform = `scaleX(${stopClock.progress})`;
}
function updateStopClock(dt) {
  if (active !== 'stop' || !dialog.open) return;
  if (completionLeft > 0) { completionLeft -= dt; if (completionLeft <= 0) {completion.hidden = true;if(window.oceanControls?.nav.returnPhase==='stop'){dialog.close();return;}} }
  if (stopClock.advance(dt)) {
    countdown.dataset.complete = 'true'; completion.hidden = false; completionLeft = 2.6;
    dialog.querySelector('.stop-hold').textContent = window.oceanControls?.nav.returnPhase==='stop'?'Stop complete. Continuing to the surface…':'Stop complete. Finish your note or keep exploring.';
    dialog.querySelector('[data-skip]').textContent = window.oceanControls?.nav.returnPhase==='stop'?'Continue surfacing':'Keep exploring';
    window.dispatchEvent(new CustomEvent('oceansafetystopcomplete'));
  }
  renderStopClock();
}
function say(message) { notice.textContent = message; noticeLeft = 3; }
function begin(title, contents, mode) {
  if (ui.dialog || ui.panel || dialog.open) return false;
  previousFocus = document.activeElement; active = mode;
  dialog.classList.toggle('safety-feedback', mode === 'stop');
  if (mode === 'stop') {
    document.body.dataset.safetyStop = 'true';
    window.oceanControls?.setSafetyStop?.(true);
  }
  window.oceanControls?.setInterfaceOpen(true);
  dialog.innerHTML = `<header><div><small>REEF FIELD NOTES</small><h2 id="expedition-title">${title}</h2></div><button type="button" data-close aria-label="Close">×</button></header>${contents}`;
  dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
  dialog.showModal(); dialog.querySelector('[data-close]').focus(); return true;
}
dialog.addEventListener('close',()=> {
  stopClock.cancel(); countdown = countdownFill = countdownTime = completion = null; completionLeft = 0;
  if (active === 'stop') window.oceanControls?.setSafetyStop?.(false);
  delete document.body.dataset.safetyStop;
  active = ''; window.oceanControls?.setInterfaceOpen(false);
  if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
});
function openStop() {
  const controls = window.oceanControls, state = window.oceanDiagnostics;
  if (dialog.open) { if (active === 'stop') dialog.close(); return; }
  const ascending = controls?.nav?.mode === 'transition' && controls.nav.transition;
  if (!state?.submerged || (!ascending && (controls?.getMode() !== 'diver' || controls?.getTransition()))) return;
  point.copy(controls.getPlayerPosition()); heldDepth = toDisplayDepth(-point.y);
  if (!inSafetyStopRange(heldDepth)) return;
  if (!begin('Safety stop', `<div class="safety-countdown" role="progressbar" aria-label="Safety stop" aria-valuemin="0" aria-valuemax="45" aria-valuenow="0"><div><span>SAFETY STOP</span><strong class="safety-countdown-time">0:45</strong></div><span class="safety-countdown-track"><i class="safety-countdown-fill"></i></span></div>
    <div class="safety-complete" role="status" hidden><span>Safety stop</span><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16"/><path d="m10 18 6 6 11-12"/></svg><span class="sr-only">complete</span></div>
    <p class="stop-hold"><span aria-hidden="true">⌛</span> 45 seconds to pause at ${heldDepth.toFixed(1)} m</p>
    <form id="reef-feedback">${safetyRatingMarkup()}
    <section class="feedback-details" hidden aria-label="Optional field note">
    <label>Anything to share? <small>optional</small><textarea name="feedback" maxlength="2000" rows="3" placeholder="A favourite moment, an idea, or something to improve…"></textarea></label>
    <div class="feedback-contact"><label>Name <small>optional</small><input name="name" autocomplete="name" maxlength="100"></label><label>Email <small>optional</small><input name="email" type="email" autocomplete="email" maxlength="254"></label></div>
    <label class="feedback-check"><input name="consent" type="checkbox">Include my contact details so I can share them with Anshul.</label>
    <p class="feedback-privacy">Sending saves your note privately for Anshul. Contact details are included only if you opt in. <a href="./privacy.html" target="_blank" rel="noopener">Privacy</a></p>
    </section><p class="feedback-error" role="alert" hidden></p><div class="feedback-actions"><button type="button" data-skip>Skip & keep exploring</button><button type="submit" class="expedition-primary" hidden>Send field note</button></div></form>`, 'stop')) return;
  track('feedback_started');
  if(controls.nav.returnPhase==='stop')dialog.querySelector('[data-skip]').textContent='Skip stop & surface · Esc';
  const form = dialog.querySelector('form');
  offerLeft=0;offerUsed=true;stopButton.hidden=true;
  startStopClock();
  form.addEventListener('change', event => {
    if (event.target.name !== 'rating') return;
    const rating = Number(event.target.value);
    dialog.querySelector('.feedback-details').hidden = false;
    dialog.querySelector('[type=submit]').hidden = false;
    dialog.querySelector('.rating-caption').textContent = `${rating} of 5 · ${['','Room to improve','Finding its feet','A good dive','Loved exploring','An unforgettable dive'][rating]}`;
    dialog.querySelectorAll('.star-options label').forEach((label,index)=>label.classList.toggle('rated',index < rating));
  });
  dialog.querySelector('[data-skip]').addEventListener('click',()=>dialog.close());
  let submissionId = crypto.randomUUID(), lastPayload = '';
  dialog.querySelector('form').addEventListener('submit', async event=> {
    event.preventDefault(); const form = event.currentTarget;
    if (form.dataset.sending === 'true' || !form.reportValidity()) return;
    const data = new FormData(form), consent = data.get('consent') === 'on';
    const error = dialog.querySelector('.feedback-error');
    // Optional contact is omitted unless explicitly opted in.
    error.hidden = true;
    const payload = {rating:Number(data.get('rating')),feedback:String(data.get('feedback')).trim(),depthMeters:Number(heldDepth.toFixed(1)),contact:consent?{name:String(data.get('name')).trim(),email:String(data.get('email')).trim(),consent:true}:null};
    const fingerprint=JSON.stringify(payload);
    if(lastPayload && lastPayload!==fingerprint)submissionId=crypto.randomUUID();
    lastPayload=fingerprint;const record={id:submissionId,...payload};
    const submit=form.querySelector('[type=submit]');
    const fields=[...form.querySelectorAll('input,textarea')];
    form.dataset.sending='true';submit.disabled=true;submit.textContent='Sending…';fields.forEach(field=>field.disabled=true);
    try {
      await sendFeedback(record);
      track('feedback_saved',{rating:record.rating});say('Your field note was sent to Anshul. Thank you.');
      if(form.isConnected)dialog.close();
    } catch (failure) {
      if(form.isConnected){error.textContent=failure.message;error.hidden=false;}
    } finally {
      delete form.dataset.sending;submit.disabled=false;submit.textContent='Send field note';fields.forEach(field=>field.disabled=false);
    }
  });
}
function openInventory() {
  const collected = finds.filter(item=>item.collected);
  begin('Your reef finds', `<p>${collected.length} of ${finds.length} artifacts · ${collected.length*100} discovery points</p><p>These are imaginary finds. Enjoy collecting without disturbing the real reef.</p><ul class="artifact-list">${collected.length?collected.map(item=>`<li><span>◈</span>${item.name}<small>+100</small></li>`).join(''):'<li>No finds yet. Look for small gold tokens near the seabed; press F when in reach.</li>'}</ul><p class="feedback-privacy">Inventory lasts for this page session. It does not change your dive or portfolio access.</p>`, 'inventory');
}
function collect() {
  if (!nearest || !mesh || dialog.open || ui.dialog || ui.panel) return false;
  nearest.collected = true; matrix.makeScale(0,0,0); mesh.setMatrixAt(nearest.id,matrix); mesh.instanceMatrix.needsUpdate = true;
  track('artifact_collected',{artifact_id:nearest.id});
  say(`${nearest.name} collected · +100 discovery points`); nearest = null; prompt.hidden = true; return true;
}
let sharedPhoto = null;
const sharePhotoButton=document.createElement('button');sharePhotoButton.type='button';sharePhotoButton.className='motion-control';sharePhotoButton.textContent='Share last reef photo';sharePhotoButton.hidden=true;
document.querySelector('#photo-settings')?.after(sharePhotoButton);
sharePhotoButton.addEventListener('click',()=> {
  if(!sharedPhoto || dialog.open)return;
  window.oceanHud?.setMenu(false,false);
  const photo=sharedPhoto;
  if(!begin('Share your reef photo', '<p>Send this reef photo privately to Anshul? It will not appear in a public gallery.</p><div data-photo-preview></div><p class="feedback-error" role="alert" hidden></p><div class="feedback-actions"><button type="button" data-cancel>Keep it on my device</button><button type="button" class="expedition-primary" data-share>Share with Anshul</button></div>', 'photo'))return;
  const preview=document.createElement('img'), objectURL=URL.createObjectURL(photo);preview.src=objectURL;preview.alt='Your reef photo';preview.style.cssText='width:100%;height:auto;border-radius:12px';dialog.querySelector('[data-photo-preview]').append(preview);
  dialog.addEventListener('close',()=>URL.revokeObjectURL(objectURL),{once:true});
  dialog.querySelector('[data-cancel]').addEventListener('click',()=>dialog.close());
  const button=dialog.querySelector('[data-share]'),error=dialog.querySelector('.feedback-error');
  button.addEventListener('click',async()=> {
    button.disabled=true;button.textContent='Sharing…';error.hidden=true;
    try {await sendPhoto(photo);track('reef_photo_shared');say('Your reef photo was shared privately with Anshul.');if(button.isConnected)dialog.close();}
    catch(failure){if(button.isConnected){error.textContent=failure.message;error.hidden=false;button.disabled=false;button.textContent='Share with Anshul';}}
  });
});
function takePhoto() {
  const controls = window.oceanControls, state = window.oceanDiagnostics;
  if (!state?.submerged || state.cameraMode !== 'first' || controls?.getTransition() || ui.dialog || ui.panel) { say('Photos are available in first-person underwater. Press V to change view.'); return; }
  try {
    controls.render();
    // Read once in the same task as the draw; no preserveDrawingBuffer or per-frame GPU readback.
    const canvas = controls.getRenderer().domElement, data = canvas.toDataURL('image/png');
    const link = document.createElement('a'); link.download = `reef-photo-${new Date().toISOString().replace(/[:.]/g,'-')}.png`; link.href = data; link.click();
    photos++;track('reef_photo_downloaded');say('Reef photo downloaded. You can share it with Anshul from Settings.');
    const preview=document.createElement('canvas');const ratio=Math.min(1,1280/canvas.width,720/canvas.height);preview.width=Math.max(1,Math.round(canvas.width*ratio));preview.height=Math.max(1,Math.round(canvas.height*ratio));
    preview.getContext('2d').drawImage(canvas,0,0,preview.width,preview.height);
    preview.toBlob(blob=> {if(blob && blob.size<=1048576){sharedPhoto=blob;sharePhotoButton.hidden=false;}},'image/jpeg',.8);
  } catch { say('This browser could not export a photo. Please try again after the scene finishes loading.'); }
}
function buildArtifacts(controls) {
  const floor = controls.reef?.userData.terrainHeightAt;
  if (mesh || typeof floor !== 'function') return;
  mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.28,.28,.075,12),new THREE.MeshStandardMaterial({color:0xe4bb6f,metalness:.65,roughness:.34,emissive:0x6d4012,emissiveIntensity:.22}),finds.length);
  mesh.name = 'Optional reef artifacts';
  // Tokens are static and slightly sunk into the terrain so they never float above the seabed.
  for (const item of finds) {
    item.y = floor(item.x,item.z)+.025; point.set(item.x,item.y,item.z);
    normal.set(floor(item.x-.3,item.z)-floor(item.x+.3,item.z),.6,floor(item.x,item.z-.3)-floor(item.x,item.z+.3)).normalize();
    quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP,normal); matrix.compose(point,quaternion,scale); mesh.setMatrixAt(item.id,matrix);
  }
  mesh.instanceMatrix.needsUpdate = true; controls.getScene().add(mesh);
}
onTick(dt=> {
  updateStopClock(dt);
  const controls = window.oceanControls, state = window.oceanDiagnostics;
  if (noticeLeft > 0) { noticeLeft -= dt; if (noticeLeft <= 0) notice.textContent = ''; }
  if (!controls || !state?.ready) return;
  if (!mesh && controls.reef) buildArtifacts(controls);
  const underwater = Boolean(state.submerged);
  if (underwater !== lastSubmerged) { lastSubmerged = underwater; dock.hidden = !underwater; }
  photoButton.disabled = state.cameraMode !== 'first' || Boolean(controls.getTransition());
  const reading = toDisplayDepth(-controls.getPlayerPosition().y);
  const returning=controls.nav.returnPhase;
  if(returnOffer!==(returning==='offer')){returnOffer=returning==='offer';stopButton.querySelector('small').innerHTML=returnOffer?'Hold at 3–5 m · <kbd>F</kbd> to stop · <kbd>Esc</kbd> to surface':'Hold at 3–5 m · Press <kbd>F</kbd>';}
  const inRange=underwater&&inSafetyStopRange(reading)&&(!returning||returning==='offer');
  // A small dead band avoids retriggering on idle bobbing, while a route that
  // passes above the stop zone can offer the invitation again on its final hold.
  if(!underwater||reading>5.2||reading<2.8){offerUsed=false;offerLeft=0;}
  if(returning==='offer'){offerUsed=true;offerLeft=controls.nav.safetyOfferRemaining;}
  else if(inRange&&!offerUsed){offerUsed=true;offerLeft=10;offerSecond=-1;}
  if(!inRange)offerLeft=0;
  const offerVisible=inRange&&offerAvailable();
  stopButton.hidden=!offerVisible;
  if(offerVisible){
    if(returning!=='offer')offerLeft=Math.max(0,offerLeft-dt);
    offerFill.style.transform=`scaleX(${offerLeft/10})`;
    const second=Math.ceil(offerLeft);if(second!==offerSecond){offerSecond=second;offerTime.textContent=`${second}s`;}
    if(!offerLeft)stopButton.hidden=true;
  }
  if (mesh) mesh.visible = underwater;
  const count = finds.reduce((total,item)=>total+Number(item.collected),0);
  if (count !== lastScore) { lastScore = count; score.textContent = String(count); }
  elapsed += dt;
  if (elapsed < .2) return; elapsed = 0; nearest = null;
  if (underwater && controls.getMode() === 'diver' && !controls.getTransition() && !dialog.open && !ui.dialog && !ui.panel && !state.nearbyLandmark) {
    point.copy(controls.getPlayerPosition()); let best = 2.8*2.8;
    for (const item of finds) {
      if (item.collected) continue;
      const distance = (point.x-item.x)**2+(point.y-item.y)**2+(point.z-item.z)**2;
      if (distance >= best) continue;
      artifactPoint.set(item.x,item.y+.15,item.z);
      const collisions = controls.reef?.userData.collisions;
      if (collisions?.segmentClear && !collisions.segmentClear(point,artifactPoint,.02)) continue;
      best = distance; nearest = item;
    }
  }
  const text = nearest ? `F · Collect ${nearest.name}` : '';
  if (text !== lastPrompt) { lastPrompt = text; prompt.textContent = text; prompt.hidden = !text; }
}, 10);
dock.querySelector('[data-stop]').addEventListener('click',openStop);
dock.querySelector('[data-photo]').addEventListener('click',takePhoto);
dock.querySelector('[data-inventory]').addEventListener('click',openInventory);
addEventListener('keydown',event=> {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
  if(event.code==='Escape'&&window.oceanControls?.nav.returnPhase==='offer'&&!dialog.open&&!ui.dialog){event.preventDefault();event.stopImmediatePropagation();window.oceanControls.skipSafetyStop();offerLeft=0;stopButton.hidden=true;return;}
  if (event.code === 'KeyF' && offerAvailable() && inSafetyStopRange(toDisplayDepth(-window.oceanControls.getPlayerPosition().y))) { event.preventDefault(); event.stopImmediatePropagation(); openStop(); }
  else if(event.code==='KeyF'&&!dialog.open&&!ui.dialog&&window.oceanLandmarks?.interactNearby()){event.preventDefault();event.stopImmediatePropagation();}
  else if(event.target.closest?.('button'))return;
  else if (event.code === 'KeyH' && !dialog.open && !ui.dialog) { event.preventDefault(); takePhoto(); }
  else if (event.code === 'KeyF' && nearest && !dialog.open && !ui.dialog && !window.oceanDiagnostics?.nearbyLandmark) { event.preventDefault(); event.stopImmediatePropagation(); collect(); }
}, {capture:true});
window.oceanExpedition = {openStop,openInventory,takePhoto,collect,get offerRemaining(){return offerLeft;},get safetyStop(){return {remaining:stopClock.remaining,completed:stopClock.completed,active:stopClock.active};},get inventory(){return finds.filter(item=>item.collected).map(({id,name})=>({id,name}));},get locations(){return finds.map(({id,name,x,y,z})=>({id,name,x,y,z}));},get score(){return finds.filter(item=>item.collected).length*100;},get photos(){return photos;},get holding(){return active === 'stop';}};
