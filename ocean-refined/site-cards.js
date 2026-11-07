import * as THREE from './vendor/three.module.min.js';
import { onFrame } from './journey.js';
import { LANDMARKS, RESUME_SITE } from './reef.js';
import { toDisplayDepth } from './depth-metrics.js';

// A card on the site itself (the owner's notes, round 12), as the surface diver has its profile card over its head
// (diver-profile.js): a snapshot of the place, its name and depth, what is inside, and the actions. It stands over the
// site and follows it on screen as the diver moves and looks around. It comes up when the site is pointed at (the
// cursor, or the crosshair while the mouse aims), when the diver comes within reach of it, or while the guided dive waits
// there, and stays LINGER seconds once none of those holds any more, then fades. It takes the place of the prompt at the
// bottom of the screen and the "Here" card for that site.
//   hover: how far round the site (m) counts as pointing at it; lift: how far over its middle the card stands (m).
const SITES = {
  about: { name: 'The Helmet', section: 'About', note: 'Who I am, how I approach the work, and where everything lives.', signal: '#7ff0cf', hover: 2, lift: 1.7 },
  experience: { name: 'The Nautilus', section: 'Experience', note: 'Three roles, 2023 to now, one chamber at a time.', signal: '#ffcf7a', hover: 2.4, lift: 2 },
  projects: { name: 'The Wreck', section: 'Projects', note: 'Six projects across the AI product loop.', signal: '#c9a2ff', hover: 8, lift: 6.2 },
  resume: { name: 'The Slate', section: 'Résumé', note: 'One page, to read here or take with you.', signal: '#f4e3b5', hover: 1, lift: .9 }
};
const LINGER = 8, REACH = 45, EDGE = 12, TOP = 64, TAIL = 16;
// The interface the card keeps off (read a few times a second), and the middle of the view it keeps clear where it can
// (the layout contract: x 30–70%, y 30–65%, tools/test-mobile-layout.mjs).
const HUD = '.reef-map,.heading-indicator,.masthead,.calm-depth,.depth,.air-gauge,.dive-computer,.swim-controls,.touch-actions,.touch-stick,.tour-card[data-show="true"],.tour-caption[data-show="true"],.archive-toggle,.dive-computer-toggle,.dive-button,.quiet-ui-toggle,.expedition-tools,.view-controls,.scene-footer,.lamp-notice[data-show="true"],.journey-toast[data-show="true"]';
let hud = [], hudAt = -1;
function keepOut() {
  const now = performance.now(); if (now - hudAt < 400) return hud;
  hudAt = now; hud = [];
  for (const el of document.querySelectorAll(HUD)) { const r = el.getBoundingClientRect(); if (r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden') hud.push(r); }
  return hud;
}
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
// On a phone there is no room by the site without covering it or the controls: the card docks above the controls, where
// the guided dive's sheet sits (which steps aside meanwhile), and a ring marks the site it is about.
const docked = () => innerWidth < 600 || (matchMedia('(pointer: coarse)').matches && innerHeight < 500);
const touch = () => document.documentElement.dataset.input === 'touch' || (!document.documentElement.dataset.input && matchMedia('(pointer: coarse)').matches);

const card = document.createElement('section');
card.className = 'site-card'; card.dataset.show = 'false'; card.setAttribute('aria-live', 'polite'); card.inert = true;
card.innerHTML = `<button type="button" class="site-card-close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
  <figure class="site-card-shot"><img alt="" decoding="async" width="800" height="500"></figure>
  <div class="site-card-text"><p class="site-card-kicker"></p><h2 class="site-card-title"></h2><p class="site-card-note"></p></div>
  <footer class="site-card-actions"><button type="button" data-site="read">Read it <kbd>F</kbd></button><button type="button" data-site="next">Continue <kbd>N</kbd></button></footer>
  <i class="site-card-tail" aria-hidden="true"></i>`;
const ring = document.createElement('div');
ring.className = 'site-ring'; ring.dataset.show = 'false'; ring.setAttribute('aria-hidden', 'true');
document.body.append(ring, card);
const part = selector => card.querySelector(selector), image = part('img');

const pointer = { x: innerWidth / 2, y: innerHeight / 2, seen: false };
addEventListener('pointermove', event => { if (event.pointerType === 'mouse') { pointer.x = event.clientX; pointer.y = event.clientY; pointer.seen = true; } }, { passive: true });

const at = new THREE.Vector3(), top = new THREE.Vector3(), view = new THREE.Vector3();
// The card's site, why it is up (tour, near, hover), when it last was, and a site closed by hand until it cools.
let shown = null, why = '', hotAt = -Infinity, clock = 0, closed = null, drawn = '', reading = false;
const positionOf = (controls, id) => {
  const placed = controls.models?.landmarks?.find(item => item.id === id);
  return placed?.position ?? (id === 'resume' ? RESUME_SITE.position : LANDMARKS.find(item => item.id === id)?.position);
};
// The site the guided dive is waiting at (a stop, or the ending's slate), if any.
function tourSite() {
  const tour = window.oceanTour, status = tour?.status;
  if (status !== 'dwell' && status !== 'done') return null;
  const step = tour.STEPS?.[window.oceanDiagnostics?.tour?.stop ?? -1];
  return step?.landmark ?? step?.site ?? null;
}
// Where a site's middle and the card's foot fall on the screen (px), or null when it is behind the camera or far off.
function project(camera, id, point) {
  at.fromArray(point); const distance = camera.position.distanceTo(at);
  view.copy(at).applyMatrix4(camera.matrixWorldInverse); if (view.z > -.5 || distance > REACH) return null;
  const middle = at.clone().project(camera);
  top.copy(at).add(new THREE.Vector3(0, SITES[id].lift, 0)).project(camera);
  const scale = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return { x: (middle.x * .5 + .5) * innerWidth, y: (-middle.y * .5 + .5) * innerHeight, footX: (top.x * .5 + .5) * innerWidth, footY: (-top.y * .5 + .5) * innerHeight, radius: Math.max(28, SITES[id].hover * scale / distance), distance };
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
  if (!keep && document.body.dataset.siteCard) { delete document.body.dataset.siteCard; delete document.body.dataset.siteCardDock; dispatchEvent(new CustomEvent('oceansitecard', { detail: null })); }
  if (ring.dataset.show !== 'false') ring.dataset.show = 'false';
}

onFrame((dt, controls, state, diving) => {
  // Real seconds, not the scene's: a slow frame should not stretch how long the card stays.
  clock = performance.now() / 1000;
  const camera = controls?.getCamera?.();
  // Reading the site the card was up for (its Read it, the tour's, F): the controls are suspended under the panel.
  if (controls?.nav?.suspended && (reading || document.body.dataset.siteCard) && diving) { reading = true; hide(true); return; }
  reading = false;
  if (!diving || !camera || controls.getMode?.() !== 'diver' || controls.getTransition?.() || controls.nav?.suspended || document.body.dataset.clearUi === 'true') { hide(); shown = null; return; }
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
  const leading = ['starting', 'intro', 'travel'].includes(window.oceanTour?.status);
  const hot = leading ? null : waiting && placed[waiting] ? waiting : near && placed[near] ? near : pointed;
  if (closed && closed !== hot) closed = null;
  if (hot && hot !== closed) { if (hot !== shown) { shown = hot; fill(hot, controls); } hotAt = clock; why = hot === waiting ? 'tour' : hot === near ? 'near' : 'hover'; }
  const spot = shown && placed[shown];
  if (!shown || !spot || shown === closed || clock - hotAt > LINGER) { hide(); if (shown && clock - hotAt > LINGER) shown = null; return; }
  // Where the card goes. Docked on a phone. Elsewhere it stands on the site: over it with its tail pointing down at it,
  // or beside it, or in the open band to one side, whichever keeps off the interface and covers least of the middle of
  // the view, and stays nearest the site.
  const width = card.offsetWidth || 290, height = card.offsetHeight || 300, dock = docked();
  let left, topEdge, side = '';
  if (dock) {
    // Portrait: just above the touch deck. Sideways: at the foot of the screen between the stick and the keys, as the
    // tour's sheet sits there.
    let floor = innerHeight - EDGE;
    if (innerWidth < 600) for (const el of document.querySelectorAll('.swim-controls,.touch-actions,.touch-stick')) { const r = el.getBoundingClientRect(); if (r.height > 4 && r.top > innerHeight * .5) floor = Math.min(floor, r.top); }
    left = (innerWidth - width) / 2; topEdge = floor - 8 - height; side = 'dock';
  } else {
    const W = innerWidth, H = innerHeight, middle = { left: W * .3, right: W * .7, top: H * .3, bottom: H * .65 }, gap = Math.min(spot.radius * .7, 260) + 18;
    const candidates = [
      ['', spot.footX - width / 2, spot.footY - TAIL - height],
      ['right', spot.x + gap, spot.y - height / 2], ['left', spot.x - gap - width, spot.y - height / 2],
      ['right', Math.max(W * .7 + 8, spot.x + gap), Math.min(spot.y, H * .3) - height / 3], ['left', Math.min(W * .3 - 8 - width, spot.x - gap - width), Math.min(spot.y, H * .3) - height / 3],
      ['right', W * .7 + 8, TOP + 140], ['left', W * .3 - 8 - width, TOP + 140]
    ];
    let best = Infinity;
    for (const [where, x, y] of candidates) {
      const l = Math.min(W - EDGE - width, Math.max(EDGE, x)), t = Math.min(H - EDGE - height, Math.max(TOP, y)), box = { left: l, right: l + width, top: t, bottom: t + height };
      const score = keepOut().reduce((sum, r) => sum + overlap(box, r), 0) * 10 + overlap(box, middle) * 3 + Math.hypot(l + width / 2 - spot.x, t + height / 2 - spot.y) * 20;
      if (score < best) { best = score; left = l; topEdge = t; side = where; }
    }
  }
  left = Math.min(innerWidth - EDGE - width, Math.max(EDGE, left)); topEdge = Math.min(innerHeight - EDGE - height, Math.max(dock ? EDGE : TOP, topEdge));
  const tail = Math.min(width - 22, Math.max(22, spot.footX - left));
  card.style.transform = `translate(${left.toFixed(1)}px, ${topEdge.toFixed(1)}px)`; card.style.setProperty('--tail', `${tail.toFixed(0)}px`);
  card.dataset.tail = String(!side && Math.abs(topEdge + height + TAIL - spot.footY) < 4); card.dataset.side = side;
  if (document.body.dataset.siteCardDock !== String(dock)) document.body.dataset.siteCardDock = String(dock);
  // Highlighted while it is pointed at, waited at or in reach; fading meanwhile once it is only lingering.
  const live = clock - hotAt < .3;
  const key = `${shown}|${why}|${live}|${waiting === shown}|${window.oceanTour?.status}|${touch()}`;
  if (key !== drawn) {
    drawn = key; card.dataset.hot = String(live); card.dataset.why = why;
    // Continue only at a stop the tour waits at; at its ending the tour's sheet offers Surface and Keep exploring.
    part('[data-site="next"]').hidden = waiting !== shown || window.oceanTour?.status !== 'dwell';
    for (const kbd of card.querySelectorAll('kbd')) kbd.hidden = touch();
  }
  if (card.dataset.show !== 'true') { card.dataset.show = 'true'; card.inert = false; }
  if (document.body.dataset.siteCard !== shown) { document.body.dataset.siteCard = shown; dispatchEvent(new CustomEvent('oceansitecard', { detail: shown })); }
  card.dataset.fading = String(clock - hotAt > LINGER - 1.2);
  // A ring on the site while it is pointed at, so the pointer knows what it is on, and on a phone, where the card is
  // docked away from it, whenever the card is up.
  const ringOn = (live && why === 'hover') || dock;
  if (ringOn) { ring.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px)`; ring.style.setProperty('--size', `${Math.min(220, spot.radius * 2).toFixed(0)}px`); ring.style.setProperty('--signal', SITES[shown].signal); }
  if (ring.dataset.show !== String(ringOn)) ring.dataset.show = String(ringOn);
});

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
  else if (action.dataset.site === 'next') window.oceanTour?.next?.();
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
