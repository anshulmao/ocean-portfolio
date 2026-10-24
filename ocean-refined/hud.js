import * as THREE from './vendor/three.module.min.js';
import { onTick } from './ui-ticker.js';
import { icon } from './ui-icons.js';
import { conditions } from './instruments.js';
import { settings, setSetting } from './movement-settings.js';

// HUD wiring: the compass card and its bezel marker, the sonar scope (the round
// minimap), the settings menu, the sun / moon button, the time and weather locks
// and the planner's conditions line. Like the other HUD files it only reads
// the public controls and diagnostics. sync() runs on the interface's one clock
// (ui-ticker.js): it slides the card and pans and turns the scope under the diver
// (transform writes only, and only when a value moved by an amount a pixel can
// show); it reads no layout, and does nothing while the instruments are out of sight.
const $ = selector => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// 1. Compass card. Three pixels per degree; the strip runs past both ends of the
// circle so the window never shows an edge, and 0° repeats seamlessly at 360°.
// Numbers every 30°, the cardinal letters, the intercardinals between them, and two
// copies of the bezel marker (one for each lap of the strip that can be in view).
const PX_PER_DEGREE = 3, TAPE_START = -120, TAPE_END = 480, CARDINAL = {0:'N', 90:'E', 180:'S', 270:'W'}, INTER = {45:'NE', 135:'SE', 225:'SW', 315:'NW'};
const tape = $('#heading-tape'), compass = $('.heading-indicator'), bugs = [document.createElement('i'), document.createElement('i')];
if (tape) {
  const marks = document.createDocumentFragment();
  for (let degrees = TAPE_START; degrees <= TAPE_END; degrees += 15) {
    const bearing = (degrees % 360 + 360) % 360;
    if (degrees % 30 && !INTER[bearing]) continue;
    const mark = document.createElement('span');
    mark.textContent = CARDINAL[bearing] || INTER[bearing] || String(bearing).padStart(3, '0');
    if (CARDINAL[bearing]) mark.dataset.cardinal = ''; else if (INTER[bearing]) mark.dataset.inter = '';
    if (bearing === 0) mark.dataset.north = '';
    mark.style.left = `${(degrees - TAPE_START) * PX_PER_DEGREE}px`;
    marks.append(mark);
  }
  for (const bug of bugs) { bug.className = 'heading-bug'; marks.append(bug); }
  tape.replaceChildren(marks);
}

// 2. Minimap. Round by default: MAP_RADIUS metres of reef around the diver, heading up, with the
// diver's arrow fixed at the centre. The chart is the same canvas the expanded view shows; the frame
// loop only pans and turns it. A site beyond the rim rests on the rim as a pip, so all three are
// always in sight. The expand control opens the whole chart, north-fixed, with its legend. world.js
// keeps writing the markers' and the diver's chart positions; the round view reads the markers' and
// overrides the diver's (hud.css), and the expanded view uses both as they are.
const map = $('.reef-map'), expand = $('#map-expand');
const chart = $('#map-chart'), arrow = $('#map-player'), rose = $('.map-rose'), roseMark = rose?.querySelector('b');
// hud.css draws one metre as 1% of the lens, so the radius here and the chart size there go together.
const MAP_RADIUS = 50, RIM = MAP_RADIUS * .86, CHART = {x:-62, z:-105, width:124, depth:140};
let mapFull = false, markers = [], lastX = null, lastZ = null, lastTurn = null, lastBearing = null, lastUpright = null;
function mapMarkers() {
  if (!markers.length || !markers[0].node.isConnected) markers = [...chart.querySelectorAll('button[data-landmark]')].map(node => ({node, left:null, top:null, x:0, z:0, dx:null, dz:null, turn:null, off:null}));
  return markers;
}
function setMapView(full) {
  if (!map || mapFull === full) return;
  mapFull = full; lastX = lastZ = lastTurn = lastBearing = lastUpright = null;
  map.dataset.view = full ? 'full' : 'round';
  expand.setAttribute('aria-expanded', String(full));
  expand.setAttribute('aria-label', full ? 'Collapse reef map' : 'Expand reef map');
  // The expanded chart is laid out by the stylesheet alone: hand back everything the round view was steering.
  if (full) {
    for (const node of [chart, arrow, rose, roseMark]) node?.style.removeProperty('transform');
    for (const marker of mapMarkers()) { marker.node.style.removeProperty('transform'); delete marker.node.dataset.off; marker.dx = marker.dz = marker.turn = marker.off = null; }
  }
}
expand?.addEventListener('click', () => setMapView(!mapFull));
map?.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !mapFull) return;
  setMapView(false); expand.focus({preventScroll:true});
});
// Choosing a destination hands the view back to the dive.
map?.addEventListener('click', event => {
  if (mapFull && document.body.dataset.submerged === 'true' && event.target.closest('#map-chart button, #map-legend button')) setMapView(false);
});
addEventListener('oceanmediumchange', () => setMapView(false));

// 3. Following the view, once per drawn frame. The bearing uses the scene's own convention
// (world.js paintHud), so the tape and the three-digit readout always agree.
const direction = new THREE.Vector3();
let lastOffset = null, pixel = 1 / (devicePixelRatio || 1), viewBearing = 0;
addEventListener('resize', () => { pixel = 1 / (devicePixelRatio || 1); lastOffset = null; });
function sync() {
  const camera = window.oceanControls?.getCamera?.(), state = window.oceanDiagnostics;
  if (!camera || !tape) return;
  // At the surface the tape and the minimap are not drawn (hud.css), so there is nothing to follow.
  if (state && !state.submerged && !state.exploring) return;
  camera.getWorldDirection(direction);
  const bearing = viewBearing = ((90 - Math.atan2(-direction.x, -direction.z) * 180 / Math.PI) % 360 + 360) % 360;
  // The strip rests on whole device pixels: its marks stay sharp, and a turn too small to show writes nothing.
  const offset = Math.round((bearing - TAPE_START) * PX_PER_DEGREE / pixel) * pixel;
  if (offset !== lastOffset) { lastOffset = offset; tape.style.transform = `translate3d(${-offset.toFixed(2)}px,0,0)`; }
  if (mapFull || !chart || map.hidden) return;
  // The chart draws east up, so turning it by (90° - bearing) puts the view direction at the top.
  // With reduced motion the chart still follows the diver but keeps its orientation, and the arrow turns instead.
  const turn = reducedMotion.matches ? 0 : Math.round((90 - bearing) * 5) / 5;
  // Values are rounded to what a pixel can show (a fifth of a degree is a quarter of a pixel at the rim, a fifth of a
  // metre the same on the chart), and nothing is written (or even formatted) while they hold still.
  const position = state?.playerPosition, x = position ? Math.round(position[0] * 5) / 5 : 0, z = position ? Math.round(position[2] * 5) / 5 : 0;
  const heading = Math.round((bearing - 90) * 2) / 2, moved = x !== lastX || z !== lastZ, turned = turn !== lastTurn;
  // Pan first, then turn about the lens centre (the chart's transform origin): the diver's point lands under the arrow.
  if (moved || turned) chart.style.transform = `rotate(${turn}deg) translate(${(-(x - CHART.x) / CHART.width * 100).toFixed(2)}%,${(-(z - CHART.z) / CHART.depth * 100).toFixed(2)}%)`;
  // --map-m is one metre on the minimap. The arrow rides the chart, so it is placed in chart space and points along the view.
  if (moved || heading !== lastBearing) arrow.style.transform = `translate(calc(var(--map-m)*${(x - CHART.x).toFixed(1)}),calc(var(--map-m)*${(z - CHART.z).toFixed(1)})) translate(-50%,-50%) rotate(${heading}deg)`;
  if (turned && rose) rose.style.transform = `rotate(${turn}deg)`;
  // What only has to stay upright (the N on the rose, the numbers on the markers) is turned back by whole degrees.
  const upright = Math.round(turn);
  if (upright !== lastUpright && roseMark) roseMark.style.transform = `rotate(${-upright}deg)`;
  lastX = x; lastZ = z; lastTurn = turn; lastBearing = heading; lastUpright = upright;
  const list = mapMarkers();
  for (let i = 0; i < list.length; i++) {
    const marker = list[i], style = marker.node.style;
    if (style.left !== marker.left || style.top !== marker.top) {
      marker.left = style.left; marker.top = style.top; marker.turn = null;
      marker.x = CHART.x + parseFloat(style.left) / 100 * CHART.width; marker.z = CHART.z + parseFloat(style.top) / 100 * CHART.depth;
    }
    // Inside the rim a marker stays where the chart puts it and is only kept upright; beyond it, it is drawn back along its bearing to the rim.
    const dx = marker.x - x, dz = marker.z - z, distance = Math.hypot(dx, dz), off = distance > RIM, pull = off ? RIM / distance - 1 : 0;
    // A pip on the rim is a plain dot, so it has no upright to keep and is only moved, in steps of about half a pixel.
    const px = Math.round(dx * pull * 2.5) / 2.5, pz = Math.round(dz * pull * 2.5) / 2.5, facing = off ? 0 : upright;
    if (px !== marker.dx || pz !== marker.dz || facing !== marker.turn) {
      marker.dx = px; marker.dz = pz; marker.turn = facing;
      style.transform = off ? `translate(calc(var(--map-m)*${px}),calc(var(--map-m)*${pz}))` : `rotate(${-facing}deg)`;
    }
    if (off !== marker.off) { marker.off = off; marker.node.dataset.off = String(off); }
  }
}
onTick(sync);

// 3b. The bezel marker: the bearing from the diver to the nearest site not yet found, four times a second.
// It reads the scope's markers (placed by the scene; journey.js keeps their found state) and moves the marker
// only when the bearing changes by a whole degree. When the bearing is outside the window, a chevron at that
// end of the card says which way to turn. Close to the site the marker rests: the bearing means nothing there.
const narrow = matchMedia('(max-width:600px)'), medium = matchMedia('(max-width:900px)');
let bugBearing = -2, bugTurn = null, bugLimit = 40;
function measureTape() { bugLimit = narrow.matches ? 18 : medium.matches ? 30 : 40; }
narrow.addEventListener('change', measureTape); medium.addEventListener('change', measureTape); measureTape();
function aim() {
  const state = window.oceanDiagnostics, position = state?.playerPosition;
  if (!tape || !compass || !chart || !position || !state.submerged) return;
  const list = mapMarkers();
  let target = null, best = Infinity;
  for (let i = 0; i < list.length; i++) {
    const marker = list[i];
    if (marker.left === null || marker.node.dataset.found === 'true') continue;
    const distance = Math.hypot(marker.x - position[0], marker.z - position[2]);
    if (distance < best) { best = distance; target = marker; }
  }
  const bearing = target && best > 4 ? Math.round(((90 - Math.atan2(position[0] - target.x, position[2] - target.z) * 180 / Math.PI) % 360 + 360) % 360) % 360 : -1;
  if (bearing !== bugBearing) {
    bugBearing = bearing;
    const on = bearing >= 0, lap = bearing < 120 ? bearing + 360 : bearing > 240 ? bearing - 360 : null;
    bugs[0].dataset.on = String(on); bugs[1].dataset.on = String(on && lap !== null);
    if (on) bugs[0].style.transform = `translate3d(${(bearing - TAPE_START) * PX_PER_DEGREE}px,0,0)`;
    if (on && lap !== null) bugs[1].style.transform = `translate3d(${(lap - TAPE_START) * PX_PER_DEGREE}px,0,0)`;
  }
  const off = bearing < 0 ? 0 : (bearing - viewBearing + 540) % 360 - 180;
  const turn = off > bugLimit ? 'right' : off < -bugLimit ? 'left' : '';
  if (turn !== bugTurn) { bugTurn = turn; compass.dataset.turn = turn; }
}
onTick(aim, 4);

// 4. Settings menu: a disclosure under the menu button. Escape, the close
// button, a click elsewhere or capturing the mouse closes it.
const menu = $('#settings-menu'), menuToggle = $('#menu-toggle'), surfaceButton = $('#settings-surface-now');
function paintMenuActions(){
  if(!surfaceButton)return;
  surfaceButton.hidden=!window.oceanDiagnostics?.submerged;
  surfaceButton.disabled=!window.oceanDiagnostics?.ready||window.oceanControls?.getMode()==='transition';
}
function setMenu(open, refocus = true) {
  if (!menu || menu.hidden === !open) return;
  const hadFocus = menu.contains(document.activeElement);
  menu.hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close settings menu' : 'Open settings menu');
  if (open) document.body.dataset.menu = 'open'; else delete document.body.dataset.menu;
  if (!open) $('#movement-panel')?.removeAttribute('open');
  window.oceanControls?.setSettingsMenuOpen?.(open);
  if (open) {
    if (document.pointerLockElement) document.exitPointerLock();
    paintLocks();
    paintMenuActions();
    if (refocus) menu.querySelector('.settings-close').focus({preventScroll:true});
  } else if (refocus && hadFocus) menuToggle.focus({preventScroll:true});
}
menuToggle?.addEventListener('click', () => setMenu(menu.hidden));
menu?.querySelector('.settings-close').addEventListener('click', () => setMenu(false));
surfaceButton?.addEventListener('click',()=>{
  const controls=window.oceanControls;
  if(!controls?.surface||!window.oceanDiagnostics?.submerged)return;
  setMenu(false,false);
  controls.surface({viaReef:true});
  menuToggle.focus({preventScroll:true});
});
addEventListener('oceanmediumchange',paintMenuActions);
document.addEventListener('keydown', event => {
  if (!menu || menu.hidden || document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape') {
    const movement = $('#movement-panel');
    if (movement?.open) {
      movement.open = false;
      $('#movement-toggle')?.focus({preventScroll:true});
      event.preventDefault(); event.stopImmediatePropagation();
    } else setMenu(false);
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...menu.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[href],[tabindex]:not([tabindex="-1"])')]
    .filter(element => {
      if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return false;
      for (let parent = element.parentElement; parent && parent !== menu; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS' && !parent.open && element !== parent.querySelector(':scope > summary')) return false;
      }
      return true;
    });
  const first = focusable[0], last = focusable.at(-1);
  if (!first || !last) return;
  if (!menu.contains(document.activeElement)) { event.preventDefault(); first.focus({preventScroll:true}); }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus({preventScroll:true}); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus({preventScroll:true}); }
});
document.addEventListener('pointerdown', event => {
  if (!menu || menu.hidden) return;
  if (event.target.closest?.('#settings-menu, #menu-toggle, dialog')) return;
  setMenu(false, false);
});
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) setMenu(false, false); });
// At the surface a bare Shift starts the dive. Shift+Tab through the top row or the menu must not.
addEventListener('keydown', event => {
  if ((event.code === 'ShiftLeft' || event.code === 'ShiftRight') && event.target.closest?.('#settings-menu, .masthead')) event.stopPropagation();
}, true);

// 4b. Gear glyphs in the menu's headings.
$('.settings-head .holo-label')?.prepend(icon('tank', 'settings-glyph'));
$('#settings-view-title')?.prepend(icon('mask', 'settings-glyph'));
$('#settings-keys-title')?.prepend(icon('regulator', 'settings-glyph'));

// 4c. A single conditions line remains in the planner. The surface condition
// board was removed; weather and water temperature still follow the live sky.
let conditionsKey = '', planText = '', planLine = null;
function paintConditions() {
  const state = skyApi().weather?.state, preset = currentPreset(), key = `${state}|${preset}`;
  if (key !== conditionsKey) {
    conditionsKey = key;
    const now = conditions(state, preset);
    planText = `Sea ${now.short.toLowerCase()} · viz ${now.visibility} m · water ${now.temperature} °C${now.night ? ' · night dive' : ''}`;
  }
  const head = document.querySelector('#dive-plan .plan-head > div');
  if (!head) return;
  if (!planLine) { planLine = document.createElement('p'); planLine.className = 'plan-conditions'; head.append(planLine); }
  if (planLine.textContent !== planText) planLine.textContent = planText;
}

// 5. Time of day: one button whose glyph follows html[data-sky-preset] (maintained
// by world.js). A click steps to the next preset through the existing preset buttons.
const PRESETS = ['dawn', 'day', 'dusk', 'night'], timeButton = $('#time-cycle'), root = document.documentElement;
const currentPreset = () => PRESETS.includes(root.dataset.skyPreset) ? root.dataset.skyPreset : root.dataset.theme === 'night' ? 'night' : 'day';
const nextPreset = () => PRESETS[(PRESETS.indexOf(currentPreset()) + 1) % PRESETS.length];
function paintTime() {
  paintConditions();
  if (!timeButton) return;
  const now = currentPreset(), next = nextPreset(), locked = Boolean(skyApi().time?.locked);
  timeButton.setAttribute('aria-label', `Time of day: ${now}${locked ? ', locked' : ''}. Switch to ${next}.`);
  timeButton.title = `${now[0].toUpperCase()}${now.slice(1)}${locked ? ' · locked' : ''} · click for ${next}`;
  timeButton.dataset.locked = String(locked);
}
timeButton?.addEventListener('click', () => { $(`#${nextPreset()}`)?.click(); paintTime(); });
new MutationObserver(paintTime).observe(root, {attributes:true, attributeFilter:['data-sky-preset', 'data-theme']});

// 6. Locks and weather. The scene owns and persists these values; the menu only
// reflects them, and each control hides itself when the scene does not offer it.
const WEATHER = {clear:'clear', rain:'light rain', storm:'storm'};
const WEATHER_MODES=['clear','rain','storm','auto'];
const timeLockRow = $('#time-lock-row'), timeLock = $('#time-lock'), weatherLock = $('#weather-lock');
const weatherSection = $('#weather-settings'), weatherGlyph = $('#weather-glyph'), weatherButtons = [...document.querySelectorAll('.weather-picker button')];
const weatherSlider=$('#weather-slider'),weatherReading=$('#weather-reading'),weatherOrb=$('#weather-orb');
function skyApi() {
  const controls = window.oceanControls, time = controls?.time, weather = controls?.weather;
  return {time: typeof time?.lock === 'function' ? time : null, weather: typeof weather?.set === 'function' ? weather : null};
}
function paintLocks() {
  const {time, weather} = skyApi();
  if (timeLockRow) { timeLockRow.hidden = !time; if (time) timeLock.checked = Boolean(time.locked); }
  paintTime();
  if (weatherSection) weatherSection.hidden = !weather;
  if (weatherGlyph) weatherGlyph.hidden = !weather;
  if (!weather || !weatherGlyph) return;
  const state = weather.state in WEATHER ? weather.state : 'clear', locked = Boolean(weather.locked);
  // While the sky is still changing, the picker shows where it is heading and the glyph shows what is overhead.
  const aim = weather.target in WEATHER ? weather.target : state;
  const mode=locked?aim:'auto',index=WEATHER_MODES.indexOf(mode),next=WEATHER_MODES[(index+1)%4];
  const label=mode==='auto'?'Auto':WEATHER[mode];
  weatherGlyph.dataset.weather = mode; weatherGlyph.dataset.locked = String(locked);
  weatherGlyph.setAttribute('aria-label', `Weather: ${label}. Switch to ${WEATHER[next]||'auto'}.`);
  weatherGlyph.title = `${label} · click for ${WEATHER[next]||'auto'}`;
  if(weatherSlider){weatherSlider.value=String(index);weatherSlider.setAttribute('aria-valuetext',label);}
  if(weatherReading)weatherReading.value=label;
  if(weatherOrb){weatherOrb.dataset.weather=mode;weatherOrb.style.left=`calc(${index/3*100}% + ${13-26*index/3}px)`;}
  if (weatherLock) { weatherLock.checked = locked; weatherLock.disabled = typeof weather.lock !== 'function'; }
  for (const button of weatherButtons) {
    const name = button.dataset.weather;
    // Auto means the weather is free to drift; a named state is held only while locked.
    button.setAttribute('aria-pressed', String(name === 'auto' ? !locked : locked && name === aim));
    if (name === state) button.dataset.current = 'true'; else delete button.dataset.current;
  }
}
timeLock?.addEventListener('change', () => { skyApi().time?.lock(timeLock.checked); paintLocks(); });
weatherLock?.addEventListener('change', () => { skyApi().weather?.lock?.(weatherLock.checked); paintLocks(); });
for (const button of weatherButtons) button.addEventListener('click', () => { skyApi().weather?.set(button.dataset.weather); paintLocks(); });
weatherSlider?.addEventListener('input',()=>{skyApi().weather?.set(WEATHER_MODES[Number(weatherSlider.value)]);paintLocks();});
weatherGlyph?.addEventListener('click',()=>{
  const weather=skyApi().weather;if(!weather)return;
  const current=weather.locked?weather.target:'auto';
  weather.set(WEATHER_MODES[(WEATHER_MODES.indexOf(current)+1)%4]);paintLocks();
});
addEventListener('oceanweatherchange', paintLocks);
addEventListener('oceantimelockchange', paintLocks);
// The scene may attach its sky controls while it initialises.
new MutationObserver(paintLocks).observe(document.body, {attributes:true, attributeFilter:['data-ready']});
paintLocks();

// Two brightness sliders share one persisted value and the scene's existing update path.
const brightnessQuick=$('#brightness-quick'),brightnessReading=$('#brightness-quick-value');
function paintBrightness(){if(!brightnessQuick)return;brightnessQuick.value=String(settings.brightnessBoost);brightnessReading.value=`${settings.brightnessBoost}%`;}
brightnessQuick?.addEventListener('input',()=>{
  const control=$('#movement-brightnessBoost');
  if(control){control.value=brightnessQuick.value;control.dispatchEvent(new Event('input',{bubbles:true}));}
  else setSetting('brightnessBoost',Number(brightnessQuick.value));
  paintBrightness();
});
addEventListener('oceanmovementchange',paintBrightness);paintBrightness();

// QA hook: paint one frame by hand when the tab is not painting.
window.oceanHud = {sync, aim, setMenu, setMapView, paintLocks, paintConditions};
