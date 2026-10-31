import { toDisplayDepth, DISPLAY_MAX_DEPTH } from './depth-metrics.js';
import * as THREE from './vendor/three.module.min.js';
import { LANDMARKS } from './reef.js';
import { onTick, tick as tickInterface, ui } from './ui-ticker.js';
import { announce, clearAnnouncements } from './announce.js';

// The journey layer turns free swimming into a light quest: three lights to
// find, a pointer to the next one, and a title card for each depth chapter.
// It only reads the public controls and diagnostics, like the other HUD files.
const SITES = {
  about: { name: 'The Anchor', signal: '#7ff0cf' },
  experience: { name: 'The Wreck', signal: '#ffcf7a' },
  projects: { name: 'The Treasure', signal: '#c9a2ff' }
};
const ZONES = [
  { until: 16, title: 'Sunlit shallows', place: 'Coral gardens', range: '0 – 11 m' },
  { until: 34, title: 'The reef slope', place: 'Terraces and grottos', range: '11 – 23 m' },
  { until: Infinity, title: 'The deep ledge', place: 'Quiet water', range: 'Below 23 m' }
];
const element = (tag, className, html = '') => { const node = document.createElement(tag); node.className = className; node.innerHTML = html; document.body.append(node); return node; };
const waypoint = element('div', 'waypoint', '<i></i><span></span><b></b>');
const wash = element('div', 'surface-wash');
for (const node of [waypoint, wash]) node.setAttribute('aria-hidden', 'true');

let found = new Set();
try { found = new Set(JSON.parse(sessionStorage.getItem('ocean-found') || '[]').filter(id => id in SITES)); } catch {}
let zone = -1, zoneSince = 0, greeted = false, submergedAt = 0, synced = false;
const point = new THREE.Vector3(), projected = new THREE.Vector3(), forward = new THREE.Vector3(), offset = new THREE.Vector3();
const SITE_IDS = Object.keys(SITES), CHARTED = Object.fromEntries(LANDMARKS.map(item => [item.id, item.position]));
// The waypoint chip as it is on screen. Each part is written only when it changes; the label lives in two text nodes,
// so a new distance swaps a few glyphs rather than the chip's children.
const chip = { shown: null, edge: null, id: null, metres: -1, bearing: null, left: null, top: null, key: '', halfWidth: 8, halfHeight: 8,
  name: waypoint.querySelector('span').appendChild(document.createTextNode('')), range: waypoint.querySelector('b').appendChild(document.createTextNode('')) };
// The chip's size depends only on which site it names and how many digits the distance has, so each shape is
// measured once and remembered: the frame loop reads no layout. The window's size is remembered the same way.
const chipSizes = new Map(), viewport = { width: innerWidth, height: innerHeight };
function forgetSizes() { chipSizes.clear(); chip.key = ''; chip.metres = -1; viewport.width = innerWidth; viewport.height = innerHeight; }
addEventListener('resize', forgetSizes);
document.fonts?.ready.then(forgetSizes);
// The journey layer runs on the interface's one clock (ui-ticker.js). The planner and the
// guided tour register here instead of running loops of their own, and oceanJourney.tick()
// drives the whole interface by hand (oceanControls.step does) when nothing paints.
const hooks = [], player = new THREE.Vector3(), dive = { active: false, time: 0, maxDepth: 0 };
let clock = 0, quiet = false;
export const onFrame = fn => { hooks.push(fn); };
export const foundCount = () => found.size;
// While the tour narrates, its caption card stands in for toasts and the waypoint.
export function setQuiet(value) { quiet = Boolean(value); }
// What a prompt tells the visitor to do depends on what they hold: a key on a keyboard, the Read action on a touch screen.
export const touchInput = () => document.documentElement.dataset.input === 'touch' || (!document.documentElement.dataset.input && matchMedia('(pointer: coarse)').matches);
export const readHint = () => touchInput() ? 'Tap Read to open it.' : 'Press F to read it.';
// The chapter the diver is in, for the depth chip (hud-calm.js); the title card itself may be skipped by the queue.
export const currentZone = () => ZONES[Math.max(0, zone)];

// Every short message goes through the one queue (announce.js). The hold is the queue's: it follows the length of the words.
export function say(kicker, text, signal = '#7ff0cf') { announce({ kicker, text, signal }); }
// A chapter title card, as the depth zones use: the guided dive opens with one. It takes the zone's place in the queue.
export function splash(kicker, title, signal = '#c9fbff') { announce({ kind: 'zone', key: 'zone', kicker, title, signal, stale: 4 }); }
function showZone(index) {
  const { title, place, range } = ZONES[index];
  announce({ kind: 'zone', key: 'zone', kicker: `${range} · ${place}`, title, signal: '#c9fbff', stale: 3 });
}
function paintProgress() {
  LANDMARKS.forEach((landmark, index) => {
    const isFound = found.has(landmark.id), signal = SITES[landmark.id].signal;
    for (const node of [document.querySelector(`#map-chart [data-landmark="${landmark.id}"]`), document.querySelectorAll('#map-legend button')[index]]) {
      if (!node) continue; node.dataset.found = String(isFound); node.style.setProperty('--signal', signal);
    }
    window.oceanControls?.setPieces?.setFound(landmark.id, isFound);
  });
  const reading = document.querySelector('.map-reading');
  if (reading) {
    let progress = document.querySelector('.journey-progress');
    if (!progress) { progress = document.createElement('span'); progress.className = 'journey-progress'; reading.after(progress); }
    progress.textContent = found.size === 3 ? 'All three lights found' : `${found.size} of 3 lights found`;
  }
  if (window.oceanDiagnostics) window.oceanDiagnostics.journey = { found: [...found] };
}
export function discover(id, silent = quiet) {
  if (found.has(id) || !(id in SITES)) return;
  found.add(id); try { sessionStorage.setItem('ocean-found', JSON.stringify([...found])); } catch {}
  paintProgress();
  if (silent) return;
  announce({ kicker: `Found · ${found.size} of 3`, title: SITES[id].name, text: readHint(), signal: SITES[id].signal, stale: 12 });
  if (found.size === 3) announce({ kicker: 'Dive complete', text: 'All three lights found. Your dive log is in the records.', signal: '#ff9d8a', stale: 15 });
}
function target(id) {
  const placed = window.oceanControls?.models?.landmarks;
  if (placed) for (let i = 0; i < placed.length; i++) if (placed[i].id === id && placed[i].position) return point.fromArray(placed[i].position);
  return point.fromArray(CHARTED[id]);
}
// The capture hint ("Click to swim") sits low and centred until the visitor clicks in; the chip keeps above it. Its top is
// measured once for each viewport size.
let hint = null, hintClear = { size: '', bottom: 0 };
function clearOfHint(width, height) {
  hint ??= document.getElementById('capture-hint');
  if (!hint || hint.hidden) return 0;
  const size = `${width}x${height}`;
  if (hintClear.size !== size) hintClear = { size, bottom: Math.max(0, height - hint.getBoundingClientRect().top + 8) };
  return hintClear.bottom;
}
function showWaypoint(value) { if (chip.shown !== value) { chip.shown = value; waypoint.dataset.show = String(value); } }
function updateWaypoint(controls, player) {
  const camera = controls.getCamera();
  let nearest = null, best = Infinity;
  for (let i = 0; i < SITE_IDS.length; i++) { const id = SITE_IDS[i]; if (found.has(id)) continue; const distance = target(id).distanceTo(player); if (distance < best) { best = distance; nearest = id; } }
  const blocked = !nearest || !camera || best < 13 || ui.dialog || ui.panel;
  showWaypoint(!blocked);
  if (blocked) return;
  // The label first: its text decides the chip's size, which the placement below needs.
  const metres = Math.round(best);
  if (nearest !== chip.id) { chip.id = nearest; chip.metres = -1; chip.name.data = SITES[nearest].name; waypoint.style.setProperty('--signal', SITES[nearest].signal); }
  if (metres !== chip.metres) {
    chip.metres = metres; chip.range.data = `${metres} m`;
    const key = `${nearest}:${chip.range.data.length}`;
    if (key !== chip.key) {
      chip.key = key;
      let size = chipSizes.get(key);
      if (!size) { size = [waypoint.offsetWidth / 2 + 8, waypoint.offsetHeight / 2 + 8]; chipSizes.set(key, size); }
      chip.halfWidth = size[0]; chip.halfHeight = size[1];
    }
  }
  target(nearest).y += 3.2; camera.getWorldDirection(forward);
  const behind = offset.copy(point).sub(camera.position).dot(forward) <= 0;
  projected.copy(point).project(camera);
  let x = projected.x, y = projected.y;
  if (behind) { x = -x; y = -y; }
  const limitX = .86, limitY = .7, edge = behind || Math.abs(x) > limitX || Math.abs(y) > limitY;
  if (edge) {
    const scale = Math.max(Math.abs(x) / limitX, Math.abs(y) / limitY, .0001); x /= scale; y /= scale;
    if (behind && Math.abs(x) < .2 && Math.abs(y) < .2) y = -limitY;
  }
  if (edge !== chip.edge) { chip.edge = edge; waypoint.dataset.edge = String(edge); }
  // The arrow is only drawn at the edge, and a turn of less than a degree cannot be seen on it.
  const bearing = edge ? Math.round(Math.atan2(x, y) * 60) / 60 : chip.bearing;
  if (bearing !== chip.bearing) { chip.bearing = bearing; waypoint.style.setProperty('--bearing', `${bearing}rad`); }
  // Keep the whole chip on screen, whatever its label length.
  const halfWidth = chip.halfWidth, halfHeight = chip.halfHeight, width = viewport.width, height = viewport.height;
  // Stay clear of the HUD columns: buttons and depth scale on the left, map and air bar on the right, tape on top.
  const wide = width > 600, insetLeft = wide ? 236 : 104, insetRight = wide ? 160 : 8, insetTop = wide ? 104 : 372, insetBottom = Math.max(wide ? 56 : 270, clearOfHint(width, height));
  // Placed to the half pixel, and moved only when that changes.
  const left = Math.round(Math.min(width - insetRight - halfWidth, Math.max(insetLeft + halfWidth, (x * .5 + .5) * width)) * 2) / 2;
  const top = Math.round(Math.min(height - insetBottom - halfHeight, Math.max(insetTop + halfHeight, (-y * .5 + .5) * height)) * 2) / 2;
  if (left !== chip.left || top !== chip.top) { chip.left = left; chip.top = top; waypoint.style.transform = `translate(${left}px,${top}px) translate(-50%,-50%)`; }
}

// The wash is only rendered while it plays (journey.css): at rest it is not in the page's rendering at all.
addEventListener('oceanmediumchange', () => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  wash.dataset.play = 'false'; void wash.offsetWidth; wash.dataset.play = 'true';
});
wash.addEventListener('animationend', () => { wash.dataset.play = 'false'; });

// One confirmation for each state per page session. Gear feedback lives at the edge,
// separate from the journey narration, and never queues repeated key presses.
const lampNotice = element('div', 'lamp-notice');
lampNotice.setAttribute('role', 'status'); lampNotice.setAttribute('aria-live', 'polite');
const lampSeen = new Set(); let lampTimer;
addEventListener('oceanlamp', event => {
  const state = Boolean(event.detail);
  if (lampSeen.has(state)) return;
  lampSeen.add(state);
  if (document.body.dataset.clearUi === 'true') return;
  lampNotice.textContent = `Flashlight ${state ? 'on' : 'off'}`;
  lampNotice.dataset.show = 'true'; clearTimeout(lampTimer);
  lampTimer = setTimeout(() => { lampNotice.dataset.show = 'false'; }, 2000);
});
addEventListener('oceanclearuichange', event => {
  if (!event.detail) return;
  clearAnnouncements();
  lampNotice.dataset.show = 'false';
});

function tick(dt) {
  const controls = window.oceanControls, state = window.oceanDiagnostics;
  if (!controls || !state?.ready) return;
  clock += dt; const now = clock * 1000, mode = controls.getMode();
  if (!synced && document.querySelector('#map-legend button')) { synced = true; paintProgress(); }
  const diving = state.submerged && mode === 'diver';
  if (state.playerPosition) player.fromArray(state.playerPosition);
  // The dive log behind the summary card: time under water and the deepest point reached.
  if (diving) { if (!dive.active) { dive.active = true; dive.time = 0; dive.maxDepth = 0; } dive.time += dt; dive.maxDepth = Math.max(dive.maxDepth, toDisplayDepth(-player.y)); }
  else if (dive.active && mode === 'surface') { dive.active = false; clearAnnouncements(); window.dispatchEvent(new CustomEvent('oceandiveend', { detail: { time: dive.time, maxDepth: dive.maxDepth, found: found.size } })); }
  for (let i = 0; i < hooks.length; i++) hooks[i](dt, controls, state, diving, player);
  if (!diving) { showWaypoint(false); if (!state.submerged) { zone = -1; submergedAt = 0; } return; }
  if (!submergedAt) submergedAt = now;
  if (!greeted && !quiet && now - submergedAt > 2600) {
    greeted = true;
    if (found.size < 3) say('Welcome below', found.size ? 'Pick up where you left off. Follow the next light.' : 'Three lights mark the way. Follow one.', '#7ff0cf', 4600);
  }
  const depth = Math.max(0, -player.y);
  let index = 0; while (depth >= ZONES[index].until) index++;
  // A short dwell stops the card flickering when the diver hovers on a boundary.
  if (index !== zone && now - zoneSince > 1500) { zone = index; zoneSince = now; showZone(index); }
  if (state.nearbyLandmark) discover(state.nearbyLandmark);
  if (quiet) showWaypoint(false); else updateWaypoint(controls, player);
}
onTick(tick);
// oceanJourney.tick(dt) advances every interface subscriber, this layer among them.
window.oceanJourney = { tick: tickInterface, say, discover, get found() { return [...found]; }, get dive() { return dive; } };
