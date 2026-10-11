const $ = selector => document.querySelector(selector);
const computer = $('#dive-computer'), toggle = $('#dive-computer-toggle');
let expanded = false, elapsed = 0, wasUnderwater = false, previous = performance.now();
let sideVisible = false, reveal = null;
function paintToggle() {
  const state = window.oceanDiagnostics;
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.setAttribute('aria-label', `${expanded ? 'Lower' : 'Check'} dive computer. Press C.`);
  const showSide = expanded && state?.submerged && state.cameraMode === 'third' && !state.transition;
  document.body.dataset.computerOpen = String(expanded && Boolean(state?.submerged));
  if (showSide === sideVisible) return;
  sideVisible = showSide; reveal?.cancel();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (showSide) {
    computer.hidden = false;
    if (!reduced) reveal = computer.animate([{opacity:0,transform:'translateY(28px) rotate(-3deg) scale(.96)'},{opacity:1,transform:'translateY(0) rotate(0) scale(1)'}],{duration:460,easing:'cubic-bezier(.16,1,.3,1)'});
  } else if (!computer.hidden && !reduced) {
    reveal = computer.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(18px)'}],{duration:220,easing:'cubic-bezier(.4,0,1,1)'});
    reveal.onfinish = () => {if (!sideVisible) computer.hidden = true;};
  } else computer.hidden = true;
}
function toggleComputer() {
  const state = window.oceanDiagnostics;
  if (!state?.submerged || state.transition || document.querySelector('dialog[open]') || document.body.dataset.movementPanel === 'open') return;
  expanded = !expanded;
  if (state.diveComputer) state.diveComputer.expanded = expanded;
  window.oceanControls?.setComputerOpen?.(expanded); paintToggle();
}
toggle.addEventListener('click', toggleComputer);
addEventListener('keydown', event => {
  if (event.code !== 'KeyC' || event.repeat || event.target.closest?.('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open]') || !window.oceanDiagnostics?.submerged) return;
  event.preventDefault(); toggleComputer();
});
function update() {
  const now = performance.now(), dt = Math.min((now - previous) / 1000, .5); previous = now;
  const state = window.oceanDiagnostics, underwater = Boolean(state?.submerged);
  if (underwater && !wasUnderwater) {elapsed = 0; expanded = false; window.oceanControls?.setComputerOpen?.(false);}
  if (!underwater && wasUnderwater) {expanded = false; window.oceanControls?.setComputerOpen?.(false);}
  if (underwater && !document.hidden && !document.querySelector('dialog[open]') && document.body.dataset.movementPanel !== 'open') elapsed += dt;
  wasUnderwater = underwater; toggle.hidden = !underwater; paintToggle();
  if (!underwater) return;
  const air = Math.max(25, 100 - elapsed / 24);
  $('#computer-depth').replaceChildren(document.createTextNode((state.depth || 0).toFixed(1)), Object.assign(document.createElement('small'), {textContent:'m'}));
  $('#computer-time').textContent = `${String(Math.floor(elapsed / 60)).padStart(2,'0')}:${String(Math.floor(elapsed % 60)).padStart(2,'0')}`;
  $('#computer-air').replaceChildren(document.createTextNode(String(Math.ceil(air))), Object.assign(document.createElement('small'), {textContent:'%'}));
  $('#computer-air-fill').style.width = `${air}%`;
  $('#computer-location').textContent = state.nearbyLandmark ? ({about:'Anchor / About',experience:'Wreck / Experience',projects:'Treasure / Projects'}[state.nearbyLandmark]) : $('#scene-location').textContent.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  $('#computer-mode').textContent = state.transition ? 'IN TRANSIT' : state.cameraMode === 'third' ? 'THIRD PERSON' : 'FIRST PERSON';
  state.diveComputer = {elapsed, air, expanded, location:$('#computer-location').textContent};
  if (expanded && state.cameraMode === 'first' && !document.hidden && !document.querySelector('dialog[open]') && document.body.dataset.movementPanel !== 'open') window.oceanControls?.setComputerOpen?.(true);
}
addEventListener('oceanmediumchange',update);
setInterval(update, 200);
document.addEventListener('visibilitychange', () => {previous = performance.now();});
