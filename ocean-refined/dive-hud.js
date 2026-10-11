const $ = selector => document.querySelector(selector);
const computer = $('#dive-computer'), toggle = $('#dive-computer-toggle');
let expanded = true, elapsed = 0, wasUnderwater = false, previous = performance.now();
try { expanded = localStorage.getItem('ocean-dive-computer') !== 'closed'; } catch {}
function paintToggle() {
  toggle.setAttribute('aria-expanded', String(expanded));
  computer.hidden = !expanded || !window.oceanDiagnostics?.submerged;
}
function toggleComputer() {
  expanded = !expanded; paintToggle();
  try { localStorage.setItem('ocean-dive-computer', expanded ? 'open' : 'closed'); } catch {}
}
toggle.addEventListener('click', toggleComputer);
addEventListener('keydown', event => {
  if (event.code !== 'KeyC' || event.repeat || event.target.closest?.('input,textarea,select,button,[contenteditable="true"]') || document.querySelector('dialog[open]') || !window.oceanDiagnostics?.submerged) return;
  event.preventDefault(); toggleComputer();
});
function update() {
  const now = performance.now(), dt = Math.min((now - previous) / 1000, .5); previous = now;
  const state = window.oceanDiagnostics, underwater = Boolean(state?.submerged);
  if (underwater && !wasUnderwater) elapsed = 0;
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
  state.diveComputer = {elapsed, air, expanded};
}
setInterval(update, 200);
document.addEventListener('visibilitychange', () => {previous = performance.now();});
