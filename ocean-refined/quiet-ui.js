// Presentation only: navigation, shortcuts and dive physics keep running.
const body = document.body, canvas = document.getElementById('world');
const toggle = document.getElementById('clear-ui-toggle'), settings = document.getElementById('clear-ui-settings');
const restore = document.getElementById('restore-ui'), status = document.getElementById('quiet-ui-status');
const computer = document.createElement('button');
computer.type = 'button'; computer.id = 'quiet-check-computer'; computer.className = 'quiet-ui-computer';
computer.textContent = 'Check computer'; computer.hidden = true; restore.after(computer);
let clear = false, revealTimer = 0, down = null;
const submerged = () => body.dataset.submerged === 'true';
function hideReveal() { clearTimeout(revealTimer); restore.hidden = computer.hidden = true; }
function setClear(value) {
  clear = Boolean(value) && submerged();
  body.dataset.clearUi = String(clear);
  settings.setAttribute('aria-pressed', String(clear)); toggle.setAttribute('aria-pressed', String(clear));
  hideReveal();
  if (clear) {
    window.oceanHud?.setMenu(false, false);
    if (document.activeElement !== canvas) canvas?.focus({preventScroll:true});
  }
  status.textContent = clear ? 'Screen cleared. Press U or Escape to restore. On touch, tap the water for the computer and restore controls. The hidden left thumb-stick still swims.' : 'Interface restored.';
  window.dispatchEvent(new CustomEvent('oceanclearuichange', {detail:clear}));
}
function sync() {
  toggle.hidden = !submerged(); settings.disabled = !submerged();
  if (!submerged() && clear) setClear(false);
}
toggle.addEventListener('click', () => setClear(!clear));
settings.addEventListener('click', () => setClear(!clear));
restore.addEventListener('click', () => { setClear(false); toggle.focus({preventScroll:true}); });
computer.addEventListener('click', () => {
  document.getElementById('dive-computer-toggle')?.click(); hideReveal();
});
const editable = target => target?.closest?.('input,textarea,select,[contenteditable="true"],dialog[open]');
addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || editable(event.target)) return;
  if (event.code === 'KeyU' && submerged()) { event.preventDefault(); setClear(!clear); }
  else if (event.code === 'Escape' && clear) { event.preventDefault(); setClear(false); }
});
// A short tap, rather than a drag, opens a temporary touch escape hatch. Nothing
// stays on screen in clear mode, and the known left thumb-stick remains usable.
addEventListener('pointerdown', event => {
  if (!clear || event.pointerType !== 'touch' || event.target !== canvas) return;
  down = {id:event.pointerId, x:event.clientX, y:event.clientY, time:performance.now()};
}, {passive:true});
addEventListener('pointerup', event => {
  if (!clear || !down || event.pointerId !== down.id) return;
  const tap = performance.now() - down.time < 400 && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 12;
  down = null;
  if (!tap) return;
  restore.hidden = computer.hidden = false;
  clearTimeout(revealTimer); revealTimer = setTimeout(hideReveal, 4500);
}, {passive:true});
addEventListener('pointercancel', () => { down = null; }, {passive:true});
for (const [id, method] of [['photo-settings','takePhoto'], ['finds-settings','openInventory']]) {
  document.getElementById(id)?.addEventListener('click', () => {
    window.oceanHud?.setMenu(false, false); window.oceanExpedition?.[method]?.();
  });
}
new MutationObserver(sync).observe(body, {attributes:true, attributeFilter:['data-submerged']});
window.oceanQuietUi = {setClear, get cleared() {return clear;}};
sync();
