import { onTick, ui } from './ui-ticker.js';
import { createDiveModel, pressureDial, profilePoints, profileScale, needleAngle, clockText, surfaceTemperature, STOP, LOW_BAR, RESERVE_BAR } from './instruments.js';
import { toDisplayDepth, DISPLAY_MAX_DEPTH } from './depth-metrics.js';

// The dive console and the dive computer. The console (bottom right, always up under water) is a compact
// computer face (depth, no-stop time or the safety stop, dive time, maximum depth, ascent meter) beside the
// submersible pressure gauge; the dive computer proper is the full wrist face that C raises in third person
// (water temperature, tank pressure, the dive profile). The model behind every reading is in instruments.js.
// update() runs five times a second on the interface clock (ui-ticker.js). Every node is looked up once, each
// reading is written only when the value shown would change, the needle and the max-depth tick are one
// transform write each, and the full face is painted only while it is in view.
const $ = selector => document.querySelector(selector);
const computer = $('#dive-computer'), toggle = $('#dive-computer-toggle'), gauge = $('#air-gauge');
const spg = $('#spg'), needle = $('#air-fill'), airFlag = $('#air-flag'), depthMax = $('#depth-max'), sceneLocation = $('#scene-location');
const PLACES = {about:'Anchor / About',experience:'Wreck / Experience',projects:'Treasure / Projects'};
// What the no-stop cell says in each state, on the console and on the full face. Colour never carries it alone.
const SHORT = {ndl:'NDL', low:'NDL · LOW', due:`STOP · ${STOP.depth} m`, stop:'STOP · HOLD', deco:`DECO · ${STOP.depth} m`, done:'STOP DONE'};
const LONG = {ndl:'NO-DECO LIMIT', low:'NO-DECO LIMIT · LOW', due:`SAFETY STOP · ${STOP.depth} m`, stop:`SAFETY STOP · HOLD ${STOP.depth} m`, deco:`DECO STOP · ${STOP.depth} m`, done:'STOP COMPLETE'};
const RISING = ['steady', 'rising', 'too fast, slow down'];
spg?.insertAdjacentHTML('afterbegin', pressureDial());
// A reading keeps the text node the markup gives it (the unit sits beside it in a <small>): a new value
// changes that node's data and nothing else in the element.
const reading = selector => { const node = $(selector); return node.firstChild?.nodeType === 3 ? node.firstChild : node.insertBefore(document.createTextNode(''), node.firstChild); };
const face = (prefix, labels) => ({cell:$(`#${prefix}-ndl`), label:$(`#${prefix}-ndl-label`), value:reading(`#${prefix}-ndl-value`), unit:$(`#${prefix}-ndl-value small`), ascent:$(`#${prefix}-ascent`), labels, mode:'', number:-1, level:-1, slow:null});
const deck = {depth:reading('#console-depth'), time:reading('#console-time'), max:reading('#console-max'), air:reading('#air-value'), ...face('console', SHORT)};
const panel = {depth:reading('#computer-depth'), time:reading('#computer-time'), max:reading('#computer-max'), temp:reading('#computer-temp'), air:reading('#computer-air'), profile:$('#computer-profile'), scale:reading('#computer-profile-scale'), location:$('#computer-location'), status:$('#computer-mode'), ...face('computer', LONG)};
const shown = {depth:'', time:-1, max:'', bar:-1, level:'', tick:-1, rising:-1, stop:'none', alert:null};
const side = {depth:'', time:-1, max:'', temp:-99, bar:-1, profile:-1, scale:-1, location:'', mode:''};
const model = createDiveModel(), dive = model.dive;
let expanded = false, wasUnderwater = false, surface = 28;
let sideVisible = false, reveal = null, shownExpanded = null, shownOpen = null, shownCamera = null, place = '', placeSource = '';
function paintToggle() {
  const state = window.oceanDiagnostics;
  if (expanded !== shownExpanded) {
    shownExpanded = expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', `${expanded ? 'Lower' : 'Check'} dive computer. Press C.`);
  }
  const showSide = Boolean(expanded && state?.submerged && state.cameraMode === 'third' && !state.transition);
  const open = expanded && Boolean(state?.submerged);
  if (open !== shownOpen) { shownOpen = open; document.body.dataset.computerOpen = String(open); }
  if (showSide === sideVisible) return;
  sideVisible = showSide; reveal?.cancel();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (showSide) {
    paintPanel(state);
    computer.hidden = false;
    // The face is projected: it rises into place and catches for a moment as it switches on.
    if (!reduced) reveal = computer.animate([{opacity:0,transform:'translateY(14px)'},{opacity:.78,offset:.2},{opacity:.34,offset:.32},{opacity:.92,offset:.5},{opacity:1,transform:'translateY(0)'}],{duration:420,easing:'cubic-bezier(.05,.7,.1,1)'});
  } else if (!computer.hidden && !reduced) {
    reveal = computer.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(12px)'}],{duration:250,easing:'cubic-bezier(.3,0,1,1)'});
    reveal.onfinish = () => {if (!sideVisible) computer.hidden = true;};
  } else computer.hidden = true;
}
function toggleComputer() {
  const state = window.oceanDiagnostics;
  if (!state?.submerged || state.transition || ui.dialog || ui.panel) return;
  expanded = !expanded; dive.expanded = expanded;
  window.oceanControls?.setComputerOpen?.(expanded); paintToggle();
}
toggle.addEventListener('click', toggleComputer);
addEventListener('keydown', event => {
  if (event.code !== 'KeyC' || event.repeat || event.target.closest?.('input,textarea,select,[contenteditable="true"]') || ui.dialog || !window.oceanDiagnostics?.submerged) return;
  event.preventDefault(); toggleComputer();
});
// Where the diver is, in the computer's words: the landmark in reach, or the scene's own location line in title case.
function locate(state) {
  if (state.nearbyLandmark) return PLACES[state.nearbyLandmark];
  const source = sceneLocation.textContent;
  if (source !== placeSource) { placeSource = source; place = source.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()); }
  return place;
}
// The no-stop cell: minutes of no-stop time, or the stop that is due, counting or done. One number decides
// whether anything is written: whole minutes for the limit, whole seconds for a stop.
function paintCell(target) {
  const stopping = dive.stop === 'due' || dive.stop === 'hold';
  const mode = dive.stop === 'done' ? 'done' : dive.deco ? 'deco' : dive.stop === 'hold' ? 'stop' : dive.stop === 'due' ? 'due' : dive.ndl <= 5 ? 'low' : 'ndl';
  const limit = mode === 'ndl' || mode === 'low';
  const number = mode === 'done' ? 0 : limit ? Math.min(100, Math.floor(dive.ndl)) : Math.ceil(stopping ? dive.stopLeft : STOP.decoSeconds);
  if (mode !== target.mode) { target.mode = mode; target.number = -1; target.cell.dataset.mode = mode; target.label.textContent = target.labels[mode]; target.unit.textContent = limit ? 'min' : ''; }
  if (number === target.number) return;
  target.number = number;
  target.value.data = mode === 'done' ? 'OK' : limit ? (number > 99 ? '99+' : String(number)) : `${Math.floor(number / 60)}:${String(number % 60).padStart(2, '0')}`;
}
// The ascent meter: five chevrons, and the word SLOW above the limit.
function paintAscent(target) {
  if (dive.ascentLevel !== target.level) { target.level = dive.ascentLevel; target.ascent.dataset.level = String(dive.ascentLevel); }
  if (dive.slow !== target.slow) { target.slow = dive.slow; target.ascent.dataset.slow = String(dive.slow); }
}
// The console: compact computer face, pressure gauge and the depth gauge's maximum-depth tick.
function paintConsole() {
  const depth = dive.depth.toFixed(1), seconds = Math.floor(dive.elapsed), max = dive.maxDepth.toFixed(1);
  if (depth !== shown.depth) { shown.depth = depth; deck.depth.data = depth; }
  if (seconds !== shown.time) { shown.time = seconds; deck.time.data = clockText(seconds); }
  if (max !== shown.max) { shown.max = max; deck.max.data = `${max} m`; }
  paintCell(deck); paintAscent(deck);
  // While the wrist computer is raised in first person the compact face steps aside, unless it has something to say.
  const alert = deck.mode !== 'ndl' && deck.mode !== 'done';
  if (alert !== shown.alert) { shown.alert = alert; gauge.dataset.alert = String(alert); }
  const rising = dive.slow ? 2 : dive.ascentLevel ? 1 : 0;
  if (rising !== shown.rising) { shown.rising = rising; deck.ascent.setAttribute('aria-label', `Ascent rate: ${RISING[rising]}`); }
  if (dive.bar !== shown.bar) {
    shown.bar = dive.bar; deck.air.data = String(dive.bar);
    // One transform: the stylesheet eases the needle to its new place (motion.css).
    needle.style.transform = `rotate(${needleAngle(dive.bar).toFixed(1)}deg)`;
    const level = dive.bar <= RESERVE_BAR ? 'reserve' : dive.bar <= LOW_BAR ? 'low' : 'ok';
    if (level !== shown.level) { shown.level = level; spg.dataset.level = level; airFlag.textContent = level === 'ok' ? '' : level.toUpperCase(); }
  }
  // The memory tick on the depth gauge moves in half metres, by one transform.
  const tick = Math.round(Math.min(dive.maxDepth, DISPLAY_MAX_DEPTH) * 2) / 2;
  if (depthMax && tick !== shown.tick) { shown.tick = tick; depthMax.style.transform = `translateY(${(tick / DISPLAY_MAX_DEPTH * 100).toFixed(2)}%)`; depthMax.dataset.set = String(tick > 0); }
}
// The full face. Only the third-person panel shows it, so it is written while it is up; the profile is redrawn
// when a new point arrives, which is once a second at most.
function paintPanel(state) {
  if (!state) return;
  const depth = dive.depth.toFixed(1), seconds = Math.floor(dive.elapsed), max = dive.maxDepth.toFixed(1), temp = Math.round(dive.temperature);
  const mode = state.transition ? 'ASCENT' : dive.deco ? 'DECO' : dive.stop === 'due' || dive.stop === 'hold' ? 'SAFETY STOP' : dive.slow ? 'SLOW' : 'DIVE';
  if (depth !== side.depth) { side.depth = depth; panel.depth.data = depth; }
  if (seconds !== side.time) { side.time = seconds; panel.time.data = clockText(seconds); }
  if (max !== side.max) { side.max = max; panel.max.data = max; }
  if (temp !== side.temp) { side.temp = temp; panel.temp.data = String(temp); }
  if (dive.bar !== side.bar) { side.bar = dive.bar; panel.air.data = String(dive.bar); }
  paintCell(panel); paintAscent(panel);
  if (dive.profileVersion !== side.profile) {
    side.profile = dive.profileVersion; panel.profile.setAttribute('points', profilePoints(dive));
    const scale = profileScale(dive);
    if (scale !== side.scale) { side.scale = scale; panel.scale.data = `${scale} m`; }
  }
  if (dive.location !== side.location) { side.location = dive.location; panel.location.textContent = dive.location; }
  if (mode !== side.mode) { side.mode = mode; panel.status.textContent = mode; }
}
// One line on the slate when a stop is done (journey.js owns the toast).
function announceStop(state) {
  if (dive.stop === shown.stop) return;
  const from = shown.stop; shown.stop = dive.stop;
  if (state.transition || !window.oceanJourney?.say) return;
  // A stop coming due is shown by the ascent's own offer (expedition-interactions.js), not a banner over the view.
  if (dive.stop === 'done' && from !== 'none') window.oceanJourney.say('Stop complete', 'OK to surface. Ascend slowly.', '#8ff4ff', 3600);
}
function update(dt = 0) {
  const state = window.oceanDiagnostics, underwater = Boolean(state?.submerged);
  if (underwater && !wasUnderwater) {
    surface = surfaceTemperature(document.documentElement.dataset.skyPreset); model.reset(surface); shown.stop = 'none';
    expanded = false; window.oceanControls?.setComputerOpen?.(false);
  }
  if (!underwater && wasUnderwater) {expanded = false; window.oceanControls?.setComputerOpen?.(false);}
  wasUnderwater = underwater;
  if (toggle.hidden === underwater) toggle.hidden = !underwater;
  paintToggle();
  // The stylesheet gives the depth gauge and the console less weight in first person, and frames the view in the mask.
  const camera = state?.cameraMode === 'first' ? 'first' : 'third';
  if (camera !== shownCamera) { shownCamera = camera; document.body.dataset.camera = camera; }
  if (gauge && gauge.hidden === underwater) gauge.hidden = !underwater;
  if (!underwater) return;
  // Dive time, air and nitrogen hold still while a dialog or the scene controls are open.
  const running = !document.hidden && !ui.dialog && !ui.panel;
  // Engine diagnostics stay in physical world units. Convert exactly once at
  // the instrument boundary; every downstream reading/profile/stop uses this.
  model.step(running ? Math.min(dt, .5) : 0, toDisplayDepth(state.depth || 0), surface, dt);
  // The wrist computer in the scene reads this record; it is updated in place.
  if (state.diveComputer !== dive) state.diveComputer = dive;
  dive.expanded = expanded; dive.location = locate(state);
  paintConsole(); announceStop(state);
  if (sideVisible) paintPanel(state);
  if (expanded && state.cameraMode === 'first' && running) window.oceanControls?.setComputerOpen?.(true);
}
addEventListener('oceanmediumchange', () => update());
onTick(update, 5);
