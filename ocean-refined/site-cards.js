import * as THREE from './vendor/three.module.min.js';
import { onFrame } from './journey.js';
import { LANDMARKS, RESUME_SITE } from './reef.js';
import { toDisplayDepth } from './depth-metrics.js';

// A card on the site itself (the owner's notes, round 12), as the surface diver has its profile card over its head
// (diver-profile.js): a snapshot of the place, its name and depth, what is inside, and the actions. It is a card in the
// water, at one fixed spot over the site, always turned to face the view (round 15): look away and it is out of sight,
// look back and it is there again. It comes up when the site is pointed at (the cursor, or the crosshair while the mouse
// aims), when the diver comes within reach of it, or while the guided dive waits there, and stays LINGER seconds once
// none of those holds any more, then fades. It takes the place of the prompt at the bottom of the screen and the "Here"
// card for that site.
//   hover: how far round the site (m) counts as pointing at it; lift: how far over its middle the card stands (m).
const SITES = {
  about: { name: 'The Helmet', section: 'About', note: 'Who I am, how I approach the work, and where everything lives.', signal: '#7ff0cf', hover: 2, lift: 1.25 },
  experience: { name: 'The Nautilus', section: 'Experience', note: 'Three roles, 2023 to now, one chamber at a time.', signal: '#ffcf7a', hover: 2.4, lift: 2 },
  projects: { name: 'The Wreck', section: 'Projects', note: 'Six projects across the AI product loop.', signal: '#c9a2ff', hover: 8, lift: 6.2 },
  resume: { name: 'The Slate', section: 'Résumé', note: 'One page, to read here or take with you.', signal: '#f4e3b5', hover: 1, lift: .9 }
};
// How far its card reaches (round 15, the owner's notes): it comes up only within RANGE m of the site itself, measured to
// the site's own extent round its middle (x and z either way, then below and above, m; the wreck's runs from bow to
// stern, and from its keel to its rigging), and is gone again beyond it.
const RANGE = 8;
const EXTENT = { about: [-1.5, 1.5, -1.5, 1.5, 2, 2], experience: [-2, 2, -2, 2, 2, 2.5], projects: [-6, 11, -11, 9, 5, 9], resume: [-.6, .6, -.6, .6, 1.2, 1.2] };
function within(id, point, player) {
  const [x0, x1, z0, z1, below, above] = EXTENT[id];
  const dx = Math.max(point[0] + x0 - player[0], 0, player[0] - point[0] - x1), dz = Math.max(point[2] + z0 - player[2], 0, player[2] - point[2] - z1);
  const dy = Math.max(point[1] - below - player[1], 0, player[1] - point[1] - above);
  return Math.hypot(dx, dy, dz) <= RANGE;
}
// SMALLEST, NEAR_SIZE: drawn at full size out to NEAR_SIZE m, smaller beyond, never below SMALLEST of it.
// FIT: how small it may be drawn to keep its place close under a site before it slides down to stay on screen.
const LINGER = 8, REACH = 45, EDGE = 12, TAIL = 16, SMALLEST = .8, NEAR_SIZE = 16, FIT = .8;
const fingers = () => touch() || innerWidth < 600;
const touch = () => document.documentElement.dataset.input === 'touch' || (!document.documentElement.dataset.input && matchMedia('(pointer: coarse)').matches);

const card = document.createElement('section');
card.className = 'site-card'; card.dataset.anchored = 'true'; card.dataset.show = 'false'; card.setAttribute('aria-live', 'polite'); card.inert = true;
card.innerHTML = `<button type="button" class="site-card-close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
  <figure class="site-card-shot"><img alt="" decoding="async" width="800" height="500"></figure>
  <div class="site-card-text"><p class="site-card-kicker"></p><h2 class="site-card-title"></h2><p class="site-card-note"></p></div>
  <footer class="site-card-actions"><button type="button" data-site="read">Read it <kbd>F</kbd></button><button type="button" data-site="next">Continue <kbd>N</kbd></button></footer>
  <i class="site-card-tail" aria-hidden="true"></i>`;
document.body.append(card);
const part = selector => card.querySelector(selector), image = part('img');

const pointer = { x: innerWidth / 2, y: innerHeight / 2, seen: false };
addEventListener('pointermove', event => { if (event.pointerType === 'mouse') { pointer.x = event.clientX; pointer.y = event.clientY; pointer.seen = true; } }, { passive: true });

const at = new THREE.Vector3(), top = new THREE.Vector3(), view = new THREE.Vector3(), lift = new THREE.Vector3();
// The card's site, why it is up (tour, near, hover), when it last was, and a site closed by hand until it cools.
let shown = null, why = '', hotAt = -Infinity, clock = 0, closed = null, drawn = '', reading = false, litSite = null;
const positionOf = (controls, id) => {
  const placed = controls.models?.landmarks?.find(item => item.id === id);
  return placed?.position ?? (id === 'resume' ? RESUME_SITE.position : LANDMARKS.find(item => item.id === id)?.position);
};
// The site the guided dive is waiting at (a stop, or the ending's slate), if any.
function tourSite() {
  const tour = window.oceanTour, status = tour?.status;
  if (status === 'travel') return tour.nearSite ?? null;
  if (status !== 'dwell' && status !== 'done') return null;
  const step = tour.STEPS?.[window.oceanDiagnostics?.tour?.stop ?? -1];
  return step?.landmark ?? step?.site ?? null;
}
// Where a site's middle and the card's foot fall on the screen (px), or null when it is behind the camera or far off.
function project(camera, id, point) {
  at.fromArray(point); const distance = camera.position.distanceTo(at);
  view.copy(at).applyMatrix4(camera.matrixWorldInverse); if (view.z > -.5 || distance > REACH) return null;
  const middle = at.clone().project(camera);
  const scale = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  // The card's anchor, over the site: only while it is in view (in front, and within the screen).
  top.copy(at).add(lift.set(0, SITES[id].lift, 0)); const anchorDistance = camera.position.distanceTo(top); view.copy(top).applyMatrix4(camera.matrixWorldInverse);
  top.project(camera); const ax = (top.x * .5 + .5) * innerWidth, ay = (-top.y * .5 + .5) * innerHeight;
  const anchor = view.z < -.5 && ax >= 0 && ax <= innerWidth && ay >= 0 && ay <= innerHeight ? { x: ax, y: ay, distance: anchorDistance } : null;
  return { x: (middle.x * .5 + .5) * innerWidth, y: (-middle.y * .5 + .5) * innerHeight, anchor, radius: Math.max(28, SITES[id].hover * scale / distance), distance };
}
function fill(id, controls) {
  const site = SITES[id], point = positionOf(controls, id), depth = Math.round(toDisplayDepth(-(point?.[1] ?? 0)));
  card.style.setProperty('--signal', site.signal);
  image.src = `./assets/portfolio/sites/${id}.jpg`; image.alt = `${site.name}, on the reef`;
  part('.site-card-kicker').textContent = `${site.section} · ${depth} m`;
  part('.site-card-title').textContent = site.name;
  part('.site-card-note').textContent = site.note;
  card.setAttribute('aria-label', `${site.name}. ${site.note}`);
}
// keep: the card goes, but the page stays as it is with a card up (the prompt, the labels and the tour's sheet stay
// folded away). That is while the site is being read: the panel it opens comes up over the reef, and dropping the card's
// state then showed the interface it had put away for a moment, between the click and the panel.
function hide(keep = false) {
  if (card.dataset.show !== 'false') { card.dataset.show = 'false'; card.inert = true; }
  if (!keep && document.body.dataset.siteCard) { delete document.body.dataset.siteCard; dispatchEvent(new CustomEvent('oceansitecard', { detail: null })); }
}

onFrame((dt, controls, state, diving) => {
  // Real seconds, not the scene's: a slow frame should not stretch how long the card stays.
  clock = performance.now() / 1000;
  const camera = controls?.getCamera?.();
  // Reading the site the card was up for (its Read it, the tour's, F): the controls are suspended under the panel.
  if (controls?.nav?.suspended && (reading || document.body.dataset.siteCard) && diving) { reading = true; hide(true); return; }
  reading = false;
  if (!diving || !camera || controls.getMode?.() !== 'diver' || controls.getTransition?.() || controls.nav?.suspended || document.body.dataset.clearUi === 'true') { hide(); shown = null; if (litSite) { litSite = null; controls?.setPieces?.focus?.(null); } return; }
  // Which sites are hot now: the tour's, the one in reach, and the one pointed at (the nearest, if several).
  const locked = Boolean(document.pointerLockElement) || !pointer.seen || touch(), px = locked ? innerWidth / 2 : pointer.x, py = locked ? innerHeight / 2 : pointer.y;
  const placed = {}, waiting = tourSite(), near = state?.nearbyLandmark ?? null;
  let pointed = null, pointedAt = Infinity;
  for (const id of Object.keys(SITES)) {
    const point = positionOf(controls, id); if (!point) continue;
    const spot = project(camera, id, point); placed[id] = spot; if (!spot) continue;
    const off = Math.hypot(px - spot.x, py - spot.y);
    if (off < spot.radius && spot.distance < pointedAt) { pointed = id; pointedAt = spot.distance; }
  }
  // While the tour leads (its welcome, and the swims between sites) its own captions speak: no cards then.
  // On the way in to a site, near it with no caption up, its card comes up for it (guided-dive.js nearing).
  const leading = ['starting', 'intro', 'travel'].includes(window.oceanTour?.status) && !(waiting && window.oceanTour?.status === 'travel');
  const hot = leading ? null : waiting && placed[waiting] ? waiting : near && placed[near] ? near : pointed;
  if (closed && closed !== hot) closed = null;
  if (hot && hot !== closed) { if (hot !== shown) { shown = hot; fill(hot, controls); } hotAt = clock; why = hot === waiting ? 'tour' : hot === near ? 'near' : 'hover'; }
  // The site lit on the bottom (set-pieces.js focus): the one pointed at, wherever it is, else the one whose card is up.
  const player = state?.playerPosition, close = shown && player && within(shown, positionOf(controls, shown), player);
  const lit = pointed && !leading ? pointed : shown && close && clock - hotAt <= LINGER && shown !== closed ? shown : null;
  if (lit !== litSite) { litSite = lit; controls.setPieces?.focus?.(lit); }
  const spot = shown && placed[shown];
  if (!shown || !spot || shown === closed || clock - hotAt > LINGER) { hide(); if (shown && clock - hotAt > LINGER) shown = null; return; }
  if (!close) { hide(); return; }
  // Where the card goes: one place, fixed in the water over the site (lift m above its middle), drawn facing the view
  // (the owner's notes, round 15: it used to choose between several places on screen, and jumped between them). Out of
  // view, it is not there; looked at again while it still lingers, it is back where it was.
  if (!spot.anchor) { hide(); return; }
  pinned = { id: shown, point: positionOf(controls, shown) };
  if (!controls.onDraw) place(camera);
  // Highlighted while it is pointed at, waited at or in reach; fading meanwhile once it is only lingering.
  const live = clock - hotAt < .3;
  const key = `${shown}|${why}|${live}|${waiting === shown}|${window.oceanTour?.status}|${touch()}`;
  if (key !== drawn) {
    drawn = key; card.dataset.hot = String(live); card.dataset.why = why;
    // Continue at a stop the tour waits at; at its ending, Surface (the owner's notes, round 14: with only Read it on the
    // résumé's card there was no way up from it once the résumé was closed).
    const status = window.oceanTour?.status, next = part('[data-site="next"]');
    next.hidden = waiting !== shown || (status !== 'dwell' && status !== 'done');
    next.dataset.act = status === 'done' ? 'surface' : 'next'; next.firstChild.textContent = status === 'done' ? 'Surface ' : 'Continue ';
    for (const kbd of card.querySelectorAll('kbd')) kbd.hidden = touch();
  }
  if (card.dataset.show !== 'true') { card.dataset.show = 'true'; card.inert = false; place(camera); }
  if (document.body.dataset.siteCard !== shown) { document.body.dataset.siteCard = shown; dispatchEvent(new CustomEvent('oceansitecard', { detail: shown })); }
  card.dataset.fading = String(clock - hotAt > LINGER - 1.2);
});

// Where the card stands on screen this frame: placed after the scene is drawn, with the camera it was drawn with
// (oceanControls.onDraw). Its anchor out of view, it is out of sight at once, not left at the edge.
let pinned = null, cardHeight = 0;
function place(camera) {
  if (!pinned?.point || card.dataset.show !== 'true') return;
  const spot = project(camera, pinned.id, pinned.point), anchor = spot?.anchor;
  card.dataset.out = String(!anchor);
  if (!anchor) return;
  // Further off it is drawn smaller, as a thing in the water would be, down to SMALLEST of its size.
  // Close under the site, with too little room over it, it is drawn smaller still to stand where it is (down to FIT), and
  // only then slides down to stay on screen.
  // On a touch screen it is the small card already, and never drawn smaller: its keys stay a finger wide.
  const full = cardHeight || 300, room = (anchor.y - EDGE) / (full + TAIL), least = fingers() ? 1 : SMALLEST;
  const size = least >= 1 ? 1 : Math.max(FIT, Math.min(1, Math.max(least, NEAR_SIZE / anchor.distance), room));
  const y = Math.max(anchor.y, EDGE + (full + TAIL) * size);
  card.style.transform = `translate3d(${anchor.x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${size.toFixed(3)}) translate(-50%, calc(-100% - ${TAIL}px))`;
}
const hookDraw = () => { const controls = window.oceanControls; if (controls?.onDraw) controls.onDraw(place); else setTimeout(hookDraw, 250); };
hookDraw();
// Its height, read only when what is on it changes (not every frame).
new ResizeObserver(() => { cardHeight = card.offsetHeight; }).observe(card);

function read() {
  const id = shown; if (!id) return;
  reading = true;
  if (window.oceanLandmarks?.openSite) window.oceanLandmarks.openSite(id, window.oceanTour?.opens?.(id) ?? id);
  else window.oceanArchive?.open?.(id);
}
card.addEventListener('click', event => {
  const action = event.target.closest('[data-site],.site-card-close');
  if (!action) return;
  if (action.classList.contains('site-card-close')) { closed = shown; hide(); }
  else if (action.dataset.site === 'read') read();
  else if (action.dataset.site === 'next') { if (action.dataset.act === 'surface') window.oceanTour?.surface?.(); else window.oceanTour?.next?.(); }
  document.querySelector('#world')?.focus({ preventScroll: true });
});
// F reads the site the card is on when it is up only because it is pointed at: in reach the site's own prompt
// (landmark-interactions.js) and at a tour stop the tour (guided-dive.js) already answer F.
addEventListener('keydown', event => {
  if (event.code !== 'KeyF' || event.repeat || card.dataset.show !== 'true' || why !== 'hover' || window.oceanDiagnostics?.nearbyLandmark || tourSite()) return;
  if (event.target.closest?.('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
  event.preventDefault(); read();
});
window.oceanSiteCard = { get shown() { return card.dataset.show === 'true' || reading ? shown : null; }, get why() { return why; } };
