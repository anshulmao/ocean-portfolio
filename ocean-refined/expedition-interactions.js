import { toDisplayDepth, DISPLAY_MAX_DEPTH } from './depth-metrics.js';
import * as THREE from './vendor/three.module.min.js';
import { onTick, ui } from './ui-ticker.js';

// This module deliberately has no network adapter. Visitors own the optional exported JSON.
const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet'; stylesheet.href = new URL('./expedition-interactions.css', import.meta.url).href;
document.head.append(stylesheet);
const dock = document.createElement('aside'); dock.className = 'expedition-tools'; dock.hidden = true;
dock.setAttribute('aria-label', 'Expedition tools');
dock.innerHTML = '<button type="button" data-stop>Safety stop <kbd>F2</kbd></button><button type="button" data-photo>Photo <kbd>H</kbd></button><button type="button" data-inventory>Finds <span data-score>0</span></button>';
const notice = document.createElement('div'); notice.className = 'expedition-notice'; notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
const prompt = document.createElement('div'); prompt.className = 'artifact-prompt'; prompt.hidden = true;
const dialog = document.createElement('dialog'); dialog.className = 'expedition-dialog'; dialog.setAttribute('aria-labelledby', 'expedition-title');
document.body.append(dock, notice, prompt, dialog);
const score = dock.querySelector('[data-score]'), photoButton = dock.querySelector('[data-photo]');
const point = new THREE.Vector3(), matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(1,1,1);
const normal = new THREE.Vector3(), artifactPoint = new THREE.Vector3();
const finds = [
  ['Compass medallion',-15,-17], ['Pearl fragment',23,-29], ['Old navigation token',-31,-52],
  ['Ceramic seal',36,-67], ['Glass float',-11,-87], ['Brass tide marker',25,-96],
  ['Reef survey tag',-43,-25], ['Mariner’s coin',47,-45], ['Moon shell',-29,-94], ['Ship’s tally',7,-51],
].map(([name,x,z],id)=>({id,name,x,z,y:0,collected:false}));
let mesh = null, nearest = null, active = '', previousFocus = null, heldDepth = 0, noticeLeft = 0, elapsed = 0, photos = 0;
let lastScore = -1, lastPrompt = '', lastSubmerged = null;
function say(message) { notice.textContent = message; noticeLeft = 5; }
function download(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); setTimeout(()=>URL.revokeObjectURL(url), 10000);
}
function begin(title, contents, mode) {
  if (ui.dialog || ui.panel || dialog.open) return false;
  previousFocus = document.activeElement; active = mode;
  window.oceanControls?.setInterfaceOpen(true);
  dialog.innerHTML = `<header><div><small>REEF FIELD NOTES</small><h2 id="expedition-title">${title}</h2></div><button type="button" data-close aria-label="Close">×</button></header>${contents}`;
  dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
  dialog.showModal(); dialog.querySelector('[data-close]').focus(); return true;
}
dialog.addEventListener('close',()=> {
  active = ''; window.oceanControls?.setInterfaceOpen(false);
  if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
});
function openStop() {
  const controls = window.oceanControls, state = window.oceanDiagnostics;
  if (dialog.open) { if (active === 'stop') dialog.close(); return; }
  const ascending = controls?.nav?.mode === 'transition' && controls.nav.transition;
  if (!state?.submerged || (!ascending && (controls?.getMode() !== 'diver' || controls?.getTransition()))) { say('Safety stop is available underwater at 3–6 m.'); return; }
  point.copy(controls.getPlayerPosition()); heldDepth = toDisplayDepth(-point.y);
  if (heldDepth < 3 || heldDepth > 6) { say('Swim to 3–6 m depth, then press F2 to hold and leave a field note.'); return; }
  if (!begin('A moment at the surface', `<p class="stop-hold">Holding at ${heldDepth.toFixed(1)} m · Movement and guided travel paused</p>
    <p>How did the reef feel? Leave a note while you pause. This is an optional experience feature, not dive training.</p>
    <form id="reef-feedback"><label>Your experience<select name="rating" required><option value="">Choose a rating</option><option value="5">Loved it</option><option value="4">Enjoyed it</option><option value="3">It was okay</option><option value="2">Needs work</option><option value="1">Had trouble</option></select></label>
    <label>What worked, or what should improve?<textarea name="feedback" maxlength="2000" rows="4" placeholder="Your field note"></textarea></label>
    <div class="feedback-contact"><label>Name <small>optional</small><input name="name" autocomplete="name" maxlength="100"></label><label>Email <small>optional</small><input name="email" type="email" autocomplete="email" maxlength="254"></label></div>
    <label class="feedback-check"><input name="consent" type="checkbox">Include my optional contact details in the exported note.</label>
    <p class="feedback-privacy">Local demo: nothing is sent or saved to a server. Export downloads a JSON file on your device. Contact details are included only with your consent. Closing discards this form.</p>
    <p class="feedback-error" role="alert" hidden></p><button type="submit" class="expedition-primary">Export my field note</button></form>`, 'stop')) return;
  dialog.querySelector('form').addEventListener('submit', event=> {
    event.preventDefault(); const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form), consent = data.get('consent') === 'on';
    const hasContact = Boolean(String(data.get('name')).trim() || String(data.get('email')).trim());
    const error = dialog.querySelector('.feedback-error');
    if (hasContact && !consent) { error.hidden = false; error.textContent = 'Select the consent checkbox to include your details, or clear the optional contact fields.'; return; }
    error.hidden = true;
    const record = {version:1,createdAt:new Date().toISOString(),rating:Number(data.get('rating')),feedback:String(data.get('feedback')).trim(),depthMeters:Number(heldDepth.toFixed(1)),contact:consent?{name:String(data.get('name')).trim(),email:String(data.get('email')).trim(),consent:true}:null};
    download(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}),`reef-field-note-${new Date().toISOString().slice(0,10)}.json`);
    say('Your field note was exported to your device. Nothing was sent.');
  });
}
function openInventory() {
  const collected = finds.filter(item=>item.collected);
  begin('Your reef finds', `<p>${collected.length} of ${finds.length} artifacts · ${collected.length*100} discovery points</p><p>These are imaginary finds. Enjoy collecting without disturbing the real reef.</p><ul class="artifact-list">${collected.length?collected.map(item=>`<li><span>◈</span>${item.name}<small>+100</small></li>`).join(''):'<li>No finds yet. Look for small gold tokens near the seabed; press F when in reach.</li>'}</ul><p class="feedback-privacy">Inventory lasts for this page session. It does not change your dive or portfolio access.</p>`, 'inventory');
}
function collect() {
  if (!nearest || !mesh) return false;
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
  const controls = window.oceanControls, state = window.oceanDiagnostics;
  if (noticeLeft > 0) { noticeLeft -= dt; if (noticeLeft <= 0) notice.textContent = ''; }
  if (!controls || !state?.ready) return;
  if (!mesh && controls.reef) buildArtifacts(controls);
  const underwater = Boolean(state.submerged);
  if (underwater !== lastSubmerged) { lastSubmerged = underwater; dock.hidden = !underwater; }
  photoButton.disabled = state.cameraMode !== 'first' || Boolean(controls.getTransition());
  if (mesh) mesh.visible = underwater;
  const count = finds.reduce((total,item)=>total+Number(item.collected),0);
  if (count !== lastScore) { lastScore = count; score.textContent = String(count); }
  elapsed += dt;
  if (elapsed < .2) return; elapsed = 0; nearest = null;
  if (underwater && controls.getMode() === 'diver' && !controls.getTransition() && !ui.dialog && !ui.panel && !state.nearbyLandmark) {
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
  if (event.repeat || event.target.closest?.('input,textarea,select,button,[contenteditable="true"]')) return;
  if (event.code === 'F2') { event.preventDefault(); event.stopImmediatePropagation(); openStop(); }
  else if (event.code === 'KeyH' && !ui.dialog) { event.preventDefault(); takePhoto(); }
  else if (event.code === 'KeyF' && nearest && !ui.dialog && !window.oceanDiagnostics?.nearbyLandmark) { event.preventDefault(); event.stopImmediatePropagation(); collect(); }
}, {capture:true});
window.oceanExpedition = {openStop,openInventory,takePhoto,collect,get inventory(){return finds.filter(item=>item.collected).map(({id,name})=>({id,name}));},get locations(){return finds.map(({id,name,x,y,z})=>({id,name,x,y,z}));},get score(){return finds.filter(item=>item.collected).length*100;},get photos(){return photos;},get holding(){return active === 'stop';}};
