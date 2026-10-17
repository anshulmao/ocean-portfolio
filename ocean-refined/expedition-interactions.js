import { toDisplayDepth } from './depth-metrics.js';
import * as THREE from './vendor/three.module.min.js';
import { onTick, ui } from './ui-ticker.js';
import { safetyRatingMarkup } from './safety-rating.js';
import { createSafetyStopClock, SAFETY_STOP_SECONDS, inSafetyStopRange } from './safety-stop-clock.js';

// This module deliberately has no network adapter. Visitors own the optional exported JSON.
const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet'; stylesheet.href = new URL('./expedition-interactions.css', import.meta.url).href;
document.head.append(stylesheet);
const ratingStylesheet = document.createElement('link');
ratingStylesheet.rel = 'stylesheet'; ratingStylesheet.href = new URL('./safety-rating.css', import.meta.url).href;
document.head.append(ratingStylesheet);
const dock = document.createElement('aside'); dock.className = 'expedition-tools'; dock.hidden = true;
dock.setAttribute('aria-label', 'Expedition tools');
dock.innerHTML = '<button type="button" data-stop hidden>Safety stop · 3–5 m <kbd>F2</kbd></button><button type="button" data-photo hidden>Photo <kbd>H</kbd></button><button type="button" data-inventory hidden>Finds <span data-score>0</span></button>';
const notice = document.createElement('div'); notice.className = 'expedition-notice'; notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
const prompt = document.createElement('div'); prompt.className = 'artifact-prompt'; prompt.hidden = true;
const dialog = document.createElement('dialog'); dialog.className = 'expedition-dialog'; dialog.setAttribute('aria-labelledby', 'expedition-title');
document.body.append(dock, notice, prompt, dialog);
const score = dock.querySelector('[data-score]'), photoButton = dock.querySelector('[data-photo]'), stopButton = dock.querySelector('[data-stop]');
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
  if (completionLeft > 0) { completionLeft -= dt; if (completionLeft <= 0) completion.hidden = true; }
  if (stopClock.advance(dt)) {
    countdown.dataset.complete = 'true'; completion.hidden = false; completionLeft = 2.6;
    dialog.querySelector('.stop-hold').textContent = 'Stop complete. Finish your note or keep exploring.';
    dialog.querySelector('[data-skip]').textContent = 'Keep exploring';
    window.dispatchEvent(new CustomEvent('oceansafetystopcomplete'));
  }
  renderStopClock();
}
function say(message) { notice.textContent = message; noticeLeft = 3; }
function download(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); setTimeout(()=>URL.revokeObjectURL(url), 10000);
}
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
    <p class="feedback-privacy">This demo downloads your note as JSON. Nothing is sent to Anshul or saved to a server. Contact details are included only if you opt in.</p>
    </section><p class="feedback-error" role="alert" hidden></p><div class="feedback-actions"><button type="button" data-skip>Skip & keep exploring</button><button type="submit" class="expedition-primary" hidden>Save field note ↓</button></div></form>`, 'stop')) return;
  const form = dialog.querySelector('form');
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
  dialog.querySelector('form').addEventListener('submit', event=> {
    event.preventDefault(); const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form), consent = data.get('consent') === 'on';
    const error = dialog.querySelector('.feedback-error');
    // Optional contact is omitted unless explicitly opted in, never accidentally exported.
    error.hidden = true;
    const record = {version:1,createdAt:new Date().toISOString(),rating:Number(data.get('rating')),feedback:String(data.get('feedback')).trim(),depthMeters:Number(heldDepth.toFixed(1)),contact:consent?{name:String(data.get('name')).trim(),email:String(data.get('email')).trim(),consent:true}:null};
    download(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}),`reef-field-note-${new Date().toISOString().slice(0,10)}.json`);
    say('Your field note was exported to your device. Nothing was sent.');
    dialog.close();
  });
}
function openInventory() {
  const collected = finds.filter(item=>item.collected);
  begin('Your reef finds', `<p>${collected.length} of ${finds.length} artifacts · ${collected.length*100} discovery points</p><p>These are imaginary finds. Enjoy collecting without disturbing the real reef.</p><ul class="artifact-list">${collected.length?collected.map(item=>`<li><span>◈</span>${item.name}<small>+100</small></li>`).join(''):'<li>No finds yet. Look for small gold tokens near the seabed; press F when in reach.</li>'}</ul><p class="feedback-privacy">Inventory lasts for this page session. It does not change your dive or portfolio access.</p>`, 'inventory');
}
function collect() {
  if (!nearest || !mesh || dialog.open || ui.dialog || ui.panel) return false;
  nearest.collected = true; matrix.makeScale(0,0,0); mesh.setMatrixAt(nearest.id,matrix); mesh.instanceMatrix.needsUpdate = true;
  say(`${nearest.name} collected · +100 discovery points`); nearest = null; prompt.hidden = true; return true;
}
function takePhoto() {
  const controls = window.oceanControls, state = window.oceanDiagnostics;
  if (!state?.submerged || state.cameraMode !== 'first' || controls?.getTransition() || ui.dialog || ui.panel) { say('Photos are available in first-person underwater. Press V to change view.'); return; }
  try {
    controls.render();
    // Read once in the same task as the draw; no preserveDrawingBuffer or per-frame GPU readback.
    const canvas = controls.getRenderer().domElement, data = canvas.toDataURL('image/png');
    const link = document.createElement('a'); link.download = `reef-photo-${new Date().toISOString().replace(/[:.]/g,'-')}.png`; link.href = data; link.click();
    photos++; say('Reef photo downloaded · the world only, without the HUD.');
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
  stopButton.hidden = !underwater || !inSafetyStopRange(reading) || dialog.open || Boolean(ui.dialog || ui.panel);
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
  if (event.repeat || event.target.closest?.('input,textarea,select,[contenteditable="true"]') || (event.code !== 'F2' && event.target.closest?.('button'))) return;
  if (event.code === 'F2') { event.preventDefault(); event.stopImmediatePropagation(); openStop(); }
  else if (event.code === 'KeyH' && !dialog.open && !ui.dialog) { event.preventDefault(); takePhoto(); }
  else if (event.code === 'KeyF' && nearest && !dialog.open && !ui.dialog && !window.oceanDiagnostics?.nearbyLandmark) { event.preventDefault(); event.stopImmediatePropagation(); collect(); }
}, {capture:true});
window.oceanExpedition = {openStop,openInventory,takePhoto,collect,get safetyStop(){return {remaining:stopClock.remaining,completed:stopClock.completed,active:stopClock.active};},get inventory(){return finds.filter(item=>item.collected).map(({id,name})=>({id,name}));},get locations(){return finds.map(({id,name,x,y,z})=>({id,name,x,y,z}));},get score(){return finds.filter(item=>item.collected).length*100;},get photos(){return photos;},get holding(){return active === 'stop';}};
