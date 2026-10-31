import { toDisplayDepth, DISPLAY_MAX_DEPTH } from './depth-metrics.js';
import { LANDMARKS, terrainHeightAt } from './reef.js';
import { drawPreparedChart } from './prepared-charts.js';
import { PORTFOLIO_CONTENT } from './portfolio-content.js';
import { onFrame, say } from './journey.js';
import { startTour, tourPlan, tourStatus, DIVE_IN } from './guided-dive.js';

// Plan your dive: the surface entry points, the site map signboard, starting a
// dive at a chosen site, links that open straight onto a dive, and the summary
// card on the way back up. Everything here reads the scene through oceanControls.
const $ = selector => document.querySelector(selector);
const controls = () => window.oceanControls, ready = () => Boolean(window.oceanDiagnostics?.ready && controls());
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const node = (tag, className, html = '') => { const item = document.createElement(tag); if (className) item.className = className; item.innerHTML = html; return item; };
const art = paths => `<svg viewBox="0 0 96 64" aria-hidden="true">${paths}<path class="art-floor" d="M6 59h84"/></svg>`;
const ART = {
  about: art('<circle cx="48" cy="11" r="5"/><path d="M48 16v38M36 25h24M24 37c2 12 12 17 24 17s22-5 24-17M20 42l4-7 6 5M76 42l-4-7-6 5"/>'),
  experience: art('<path d="M8 38h62l16-9-7 25H19zM33 38V12M53 38V19M33 18h13M53 25h10M33 12l-12 22M22 46h2M34 46h2M46 46h2M58 46h2"/>'),
  projects: art('<path d="M12 35h32v20H12zM12 35c0-12 32-12 32 0M25 41h6v7h-6zM52 41h30v14H52zM52 41c0-10 30-10 30 0M64 45h6v5h-6zM66 10v10M61 15h10M82 22v6M79 25h6"/>'),
  'Table coral tower': art('<path d="M47 58c-3-18 5-33 2-50"/><ellipse cx="46" cy="46" rx="20" ry="3"/><ellipse cx="50" cy="35" rx="17" ry="2.6"/><ellipse cx="46" cy="25" rx="13" ry="2.3"/><ellipse cx="50" cy="15" rx="9" ry="2"/>'),
  'Brain coral dome': art('<path d="M14 50c0-42 68-42 68 0zM24 43c6-6 10 6 16 0s10 6 16 0 10 6 16 0M30 31c5-5 9 5 14 0s9 5 14 0 5 2 8 0M40 20c4-3 8 3 12 0M8 50h80M30 50v8M66 50v8"/>'),
  'Pillar coral cathedral': art('<path d="M14 58V34a4 4 0 0 1 8 0v24M26 58V22a4 4 0 0 1 8 0v36M39 58V10a5 5 0 0 1 10 0v48M54 58V16a4 4 0 0 1 8 0v42M66 58V28a4 4 0 0 1 8 0v30M78 58V40a3 3 0 0 1 6 0v18"/>'),
  'Kelp grove': art('<path d="M24 58c-7-12 7-18 0-30s6-14 1-22M48 58c7-13-7-19 0-32s-5-12 0-20M72 58c-6-11 6-17 0-28s5-13 1-20M24 40l8-4M24 22l-8-3M48 44l-8-4M48 26l8-4M72 42l8-3M72 24l-7-4"/>'),
  'Giant clam': art('<path d="M10 40c8-26 68-26 76 0M10 40c10 20 66 20 76 0M10 40q9.5 7 19 0t19 0 19 0 19 0M30 26l4 9M48 21v12M66 26l-4 9"/>'),
  'Soft coral spire': art('<path d="M38 58l5-50 9 7 7 43z"/><circle cx="34" cy="42" r="5"/><circle cx="60" cy="32" r="5"/><circle cx="36" cy="24" r="4"/><circle cx="62" cy="48" r="4"/>'),
  'Lantern garden': art('<path d="M20 58V42M38 58V30M56 58V38M74 58V46M38 14v-5M28 18l-4-3M48 18l4-3"/><circle cx="20" cy="36" r="6"/><circle cx="38" cy="23" r="7"/><circle cx="56" cy="32" r="6"/><circle cx="74" cy="41" r="5"/>'),
  'The arch': art('<path d="M12 58V32c0-30 72-30 72 0v26H68V36c0-14-40-14-40 0v22zM20 30l6 3M70 22l-5 4M46 12l2 6"/>')
};
const list = entries => entries.map(entry => entry.title).join(', ');
// Portfolio sites are the reason for the dive; the copy takes its section names from the archive itself.
const PRIMARY = [
  { id: 'about', name: 'The Anchor', signal: '#7ff0cf', depth: 9, entry: [5.8, 0], bullets: ['Who I am and how I work', PORTFOLIO_CONTENT.about.subtitle, `${PORTFOLIO_CONTENT.about.entries.length} short reads, in the shallows`] },
  { id: 'experience', name: 'The Treasure', signal: '#ffcf7a', depth: 47, entry: [0, 4], bullets: ['The roles I’ve held and what each one taught me', PORTFOLIO_CONTENT.experience.subtitle, `${PORTFOLIO_CONTENT.experience.entries.length} chapters in the chests`] },
  { id: 'projects', name: 'The Wreck', signal: '#c9a2ff', depth: 21, entry: [0, 17.2], bullets: ['The things I’ve built', PORTFOLIO_CONTENT.projects.subtitle, `${PORTFOLIO_CONTENT.projects.entries.length} finds in the hull: ${list(PORTFOLIO_CONTENT.projects.entries)}`] }
].map((site, index) => ({ ...site, kind: 'primary', number: index + 1, section: PORTFOLIO_CONTENT[site.id].title, position: LANDMARKS.find(item => item.id === site.id).position }));
const SCENERY = {
  'Table coral tower': 'Plates of table coral spiral up a leaning stone trunk.',
  'Brain coral dome': 'A wide dome on a stone ledge, with a swim-through underneath.',
  'Pillar coral cathedral': 'Organ-pipe columns in a horseshoe, tallest at the back.',
  'Kelp grove': 'Kelp and sea whips. Nothing solid, so you can drift straight through.',
  'Giant clam': 'One enormous clam. Its shell breathes and the mantle glows.',
  'Soft coral spire': 'A rock spire dressed in soft coral.',
  'Lantern garden': 'Sea pens and glowing bulbs that light the deep shelf.',
  'The arch': 'A limestone arch over the drop-off, wide enough to swim straight through.'
};
// Charted positions of the scenic formations; the scene's own list replaces them once it is available.
const CHARTED = [['Table coral tower', 38, -8, 6, 10.5], ['Brain coral dome', -42, -2, 8, 9.2], ['Pillar coral cathedral', 48, -28, 8, 10.5], ['Kelp grove', -50, -52, 8.5, 15], ['Giant clam', -9, -54, 3.5, 2.6], ['Soft coral spire', 50, -72, 6, 15], ['Lantern garden', 8, -86, 6.5, 5.5]];
function scenery() {
  const live = controls()?.formations, sites = live?.length ? live.map(item => [item.name, item.position[0], item.position[2], item.radius, item.height]) : CHARTED;
  return [...sites, ['The arch', 20, -72, 6, 8]].filter(([name]) => SCENERY[name]).map(([name, x, z, radius, height]) => ({ id: name, name, kind: 'scenic', signal: '#8ff4ff', section: 'Reef feature', position: [x, terrainHeightAt(x, z), z], radius, height, bullets: [SCENERY[name], 'Nothing to read here, just somewhere good to be'] }));
}
let sites = [...PRIMARY, ...scenery()], selected = sites[0];

// Where the diver ends up for a site, and what the camera frames there.
function viewpoint(site) {
  const [x, , z] = site.position, floor = terrainHeightAt(x, z);
  if (site.kind === 'primary') {
    const placed = controls()?.landmarks?.find(item => item.id === site.id);
    if (placed && window.oceanDiagnostics.modelLoading === false) return { point: placed.interactionPosition, focus: placed.position, ready: true };
    const px = x + site.entry[0], pz = z + site.entry[1];
    return { point: [px, Math.max(floor, terrainHeightAt(px, pz)) + 5, pz], focus: [x, floor + 1.5, z], ready: false };
  }
  // The arch is viewed from where the tour stops: its deep, open side.
  // The scenic arch remains independently selectable, even though the guided
  // story now has only its three portfolio stops. View it from its deep side.
  if (site.name === 'The arch') return { point: [20, -52, -87.5], focus: [20, -50.5, -72], ready: true };
  // Scenic formations are viewed from the side that faces the middle of the reef.
  const dx = -x, dz = -42 - z, length = Math.hypot(dx, dz) || 1, reach = site.radius + 6.5, px = x + dx / length * reach, pz = z + dz / length * reach;
  return { point: [px, Math.max(terrainHeightAt(px, pz) + 3, floor + Math.min(site.height * .55, 6.5)), pz], focus: [x, floor + site.height * .45, z], ready: true };
}
const depthOf = site => Math.round(toDisplayDepth(-(site.kind === 'primary' ? (controls()?.landmarks?.find(item => item.id === site.id)?.position[1] ?? -site.depth) : site.position[1] + site.height * .4)));
// What "Start dive here" really takes. From the surface the dive begins on the water above the site, so the trip is the
// dive in (8 m, DIVE_IN seconds) and then the autopilot's descent to the viewpoint; underwater it is the swim from where
// the diver is. The path is traced the way the autopilot steers, lifting its line over the seabed, at the pace it swims.
const CRUISE = 6.5, point = [0, 0, 0];
function routeLength(from, to) {
  const clearance = (controls()?.settings?.floorClearance ?? 1.7);
  let length = 0; point.splice(0, 3, ...from);
  for (let guard = 0; guard < 240; guard++) {
    const dx = to[0] - point[0], dz = to[2] - point[2];
    let aim = to[1];
    for (let i = 1; i <= 16; i++) aim = Math.max(aim, terrainHeightAt(point[0] + dx * i / 16, point[2] + dz * i / 16) + clearance);
    const dy = aim - point[1], left = Math.hypot(dx, dy, dz), step = Math.min(1.5, left);
    if (left < .5) break;
    point[0] += dx / left * step; point[1] += dy / left * step; point[2] += dz / left * step; length += step;
  }
  return length;
}
function swim(site) {
  const api = controls(), view = viewpoint(site), under = api?.getMode() === 'diver' && Boolean(window.oceanDiagnostics?.submerged);
  const length = routeLength(under ? window.oceanDiagnostics.playerPosition : [view.point[0], -8, view.point[2]], view.point);
  // The autopilot eases off over its last few metres, which takes longer than cruising them.
  const slow = api?.settings?.travelSlowdown ?? 5, arrive = api?.settings?.travelArrival ?? .45, tail = Math.min(length, slow);
  const seconds = (under ? 0 : DIVE_IN) + (length - tail) / CRUISE + (tail > arrive ? slow / CRUISE * Math.log(tail / arrive) : 0);
  // Shown as the swim from here when underwater, and as how far down the viewpoint is when starting from the surface.
  return { under, distance: under ? length : toDisplayDepth(-view.point[1]), seconds };
}
// Times are estimates, so they are given the way a person would say them: to the nearest five seconds, then in half minutes.
function about(seconds) {
  if (seconds < 50) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} s`;
  const halves = Math.round(seconds / 30);
  return `about ${Math.floor(halves / 2) || ''}${halves % 2 ? '½' : ''} min`;
}
const metres = value => value < 20 ? Math.max(1, Math.round(value)) : Math.round(value / 5) * 5;

// The guided dive and the site map are started from the hero (index.html: #guided-dive, #plan-dive).

// The site map: a signboard on two posts carrying the reef chart.
const plan = node('dialog', 'dive-plan holo-deep', `<div class="plan-wrap">
  <header class="plan-head"><div><p class="holo-label">Plan your dive</p><h2 id="dive-plan-title">Site map</h2></div><button type="button" class="plan-close holo-chip" aria-label="Close the dive planner">Close <kbd>Esc</kbd></button></header>
  <div class="plan-main">
    <div class="plan-sign"><div class="plan-board holo">
      <div class="plan-chart"><canvas width="372" height="420" role="img" aria-label="Depth chart of the reef with 5 metre contours. Shallow water at the bottom, the deep ledge at the top."></canvas><span class="plan-north" aria-hidden="true"><i></i>N</span><span class="plan-entry" aria-hidden="true"><i></i>Entry</span><div class="plan-marks" role="group" aria-label="Dive sites"></div></div>
      <p class="plan-key"><span class="key-ramp" aria-hidden="true"></span><span>0 m</span><span>20 m</span><span>40 m</span><span class="key-note">5 m contours</span><span class="key-note"><b class="key-x" aria-hidden="true"></b>Dive site</span><span class="key-note"><b class="key-dot" aria-hidden="true"></b>Reef feature</span></p>
    </div><i class="plan-post" aria-hidden="true"></i><i class="plan-post" aria-hidden="true"></i></div>
    <aside class="plan-info holo holo--reading" aria-live="polite" aria-atomic="true"><div class="plan-art"></div><p class="holo-label plan-kicker"></p><h3></h3><dl><div><dt>Depth</dt><dd class="plan-depth"></dd></div><div><dt class="plan-from">From the surface</dt><dd class="plan-swim"></dd></div></dl><ul></ul><button type="button" class="plan-start holo-chip holo-chip--go">Start dive here <span aria-hidden="true">→</span></button></aside>
  </div>
  <footer class="plan-overview holo"><p class="holo-label">Dive overview</p><ol></ol><p class="plan-total"></p><button type="button" class="plan-tour holo-chip">Take the guided dive <span aria-hidden="true">→</span></button></footer>
</div>`);
plan.id = 'dive-plan'; plan.setAttribute('aria-labelledby', 'dive-plan-title');
// A link that opens onto a dive asks once, so the browser has a gesture for the mouse capture.
const prompt = node('dialog', 'dive-prompt holo holo--reading', '<p class="holo-label">Dive link</p><h2 id="dive-prompt-title"></h2><p class="prompt-note"></p><div><button type="button" class="holo-chip holo-chip--go" data-go>Start dive <span aria-hidden="true">→</span></button><button type="button" class="holo-chip" data-skip>Not now</button></div>');
prompt.setAttribute('aria-labelledby', 'dive-prompt-title');
const summary = node('aside', 'dive-summary holo holo--reading', '<header><p class="holo-label">Dive summary</p><button type="button" class="summary-close" aria-label="Dismiss the dive summary">×</button></header><dl><div><dt>Sites found</dt><dd class="sum-found"></dd></div><div><dt>Max depth</dt><dd class="sum-depth"></dd></div><div><dt>Dive time</dt><dd class="sum-time"></dd></div></dl><p class="sum-note" role="status"></p><button type="button" class="holo-chip sum-log">Open the logbook <span aria-hidden="true">→</span></button>');
summary.id = 'dive-summary';
summary.setAttribute('aria-label', 'Dive summary'); summary.dataset.show = 'false'; summary.inert = true;
// After a dive the way back to its summary is one of the hero's links (index.html .portfolio-links), not a chip over the hero.
const summaryToggle = node('button', 'dive-summary-toggle hero-link', 'Last dive');
summaryToggle.type = 'button'; summaryToggle.hidden = true;
summaryToggle.setAttribute('aria-controls', summary.id);
summaryToggle.setAttribute('aria-expanded', 'false');
document.body.append(plan, prompt, summary);
($('.portfolio-links') || document.body).append(summaryToggle);
const marks = plan.querySelector('.plan-marks'), info = plan.querySelector('.plan-info');
let charted = false, opener = null, pending = null, linkHandled = false, linkAction = null, held = false;
// The scene's controls are suspended while a dialog is up. Releasing is done in step with the action that follows,
// never from a late close event, which would drop a mouse capture the new dive has just taken.
function hold() { held = true; controls().setInterfaceOpen(true); }
function release() { if (held) { held = false; controls()?.setInterfaceOpen(false); } }

function drawChart() {
  if(drawPreparedChart('planner',plan.querySelector('canvas'))){charted=true;return;}
  const canvas = plan.querySelector('canvas'), width = canvas.width, height = canvas.height, context = canvas.getContext('2d'), image = context.createImageData(width, height), depths = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) depths[y * width + x] = toDisplayDepth(-terrainHeightAt((x + .5) / width * 124 - 62, (y + .5) / height * 140 - 105));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, depth = depths[i], band = Math.floor(depth / 5), shallow = 1 - Math.max(0, Math.min(1, depth / DISPLAY_MAX_DEPTH));
    const contour = x > 0 && y > 0 && (band !== Math.floor(depths[i - 1] / 5) || band !== Math.floor(depths[i - width] / 5));
    // Projected light: shallows glow brighter, contours are the brightest lines, nothing is opaque.
    image.data.set(contour ? [201, 251, 255, band % 2 ? 120 : 215] : [64 + shallow * 91, 155 + shallow * 78, 191 + shallow * 64, 40 + shallow * 42], i * 4);
  }
  context.putImageData(image, 0, 0); canvas.dataset.source = 'scene-terrain'; charted = true;
}
function select(site, focus = false) {
  selected = site;
  for (const button of marks.children) button.setAttribute('aria-pressed', String(button.dataset.site === site.id));
  info.style.setProperty('--signal', site.signal); info.dataset.kind = site.kind;
  info.querySelector('.plan-art').innerHTML = ART[site.id] || ART['The arch'];
  info.querySelector('.plan-kicker').textContent = site.kind === 'primary' ? `Dive site 0${site.number} · ${site.section}` : site.section;
  info.querySelector('h3').textContent = site.name;
  const trip = swim(site);
  info.querySelector('.plan-depth').textContent = `${depthOf(site)} m`;
  info.querySelector('.plan-from').textContent = trip.under ? 'From here' : 'From the surface';
  info.querySelector('.plan-swim').textContent = `${about(trip.seconds)} · ${metres(trip.distance)} m ${trip.under ? 'swim' : 'down'}`;
  info.querySelector('ul').replaceChildren(...site.bullets.map(text => Object.assign(document.createElement('li'), { textContent: text })));
  if (focus) marks.querySelector('[aria-pressed="true"]')?.focus();
}
function build() {
  sites = [...PRIMARY, ...scenery()];
  marks.replaceChildren(...sites.map((site, index) => {
    const button = node('button', 'plan-mark', site.kind === 'primary' ? `<i></i><span>${site.name}</span>` : '<i></i>');
    button.type = 'button'; button.dataset.site = site.id; button.dataset.kind = site.kind; button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${site.name}. ${site.section}, ${depthOf(site)} metres.`);
    button.style.cssText = `left:${((site.position[0] + 62) / 124 * 100).toFixed(2)}%;top:${((site.position[2] + 105) / 140 * 100).toFixed(2)}%;--signal:${site.signal};--order:${index}`;
    const choose = () => select(site);
    button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') choose(); }); button.addEventListener('focus', choose); button.addEventListener('click', choose);
    return button;
  }));
  const plan3 = tourPlan();
  plan.querySelector('.plan-overview ol').replaceChildren(...PRIMARY.map(site => { const item = node('li', '', `<b>0${site.number}</b><span>${site.name}</span><em>${depthOf(site)} m</em>`); item.style.setProperty('--signal', site.signal); return item; }));
  plan.querySelector('.plan-total').textContent = `Guided dive · ${plan3.stops} stories · about ${Math.round(plan3.distance / 10) * 10} m · ${about(plan3.seconds)} swimming, plus reading at your pace`;
  select(sites.find(site => site.id === selected.id) || sites[0]);
}
export function openPlan(siteId) {
  if (plan.open || !ready() || $('dialog[open]') || controls().getTransition()) return false;
  if (!charted) drawChart();
  opener = document.activeElement; build();
  if (siteId) select(sites.find(site => site.id === siteId) || sites[0]);
  hold(); plan.dataset.closing = 'false'; plan.showModal();
  marks.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  return true;
}
// Exits leave faster than entrances; the dialog closes once its exit has played.
function closePlan(now = false) {
  if (!plan.open || plan.dataset.closing === 'true') return;
  if (now || reduced.matches) { release(); plan.close(); return; }
  plan.dataset.closing = 'true'; setTimeout(() => { release(); plan.close(); }, 240);
}
plan.addEventListener('cancel', event => { event.preventDefault(); closePlan(); });
plan.addEventListener('close', () => {
  plan.dataset.closing = 'false'; release();
  if (!pending && tourStatus() === 'off' && opener?.isConnected && opener.offsetParent) opener.focus({ preventScroll: true });
});
plan.addEventListener('click', event => { if (event.target === plan) closePlan(); });
plan.querySelector('.plan-close').addEventListener('click', () => closePlan());
plan.querySelector('.plan-start').addEventListener('click', () => startAt(selected));
plan.querySelector('.plan-tour').addEventListener('click', () => { closePlan(true); guided(); });
$('#plan-dive').addEventListener('click', () => openPlan());
$('#guided-dive').addEventListener('click', guided);
function guided() { pending = null; hideSummary(); if (!startTour()) say('Guided dive', 'The ocean is still getting ready. Try again in a moment.', '#8ff4ff', 2600); }

// Start at a site: the dive begins on the water above it, then the autopilot descends to its viewpoint.
export function startAt(site) {
  const api = controls();
  if (typeof site === 'string') site = sites.find(item => item.id === site);
  if (!site || !ready()) return false;
  const view = viewpoint(site), mode = api.getMode();
  closePlan(true); hideSummary(); window.oceanTour?.stop();
  if (mode === 'surface') { if (!api.startDive({ at: view.point })) return false; }
  else if (mode !== 'diver') return false;
  pending = { site, stage: 'dive', time: 0, inputs: 0, still: 0 };
  window.oceanDiagnostics.diveTarget = site.id;
  return true;
}
function settle(message) { const api = controls(); if (api?.getMode() === 'diver' && api.nav.travelling && pending?.still >= 3) api.travel(window.oceanDiagnostics.playerPosition); api?.guide(false); if (window.oceanDiagnostics) window.oceanDiagnostics.diveTarget = null; pending = null; if (message) say('Arrived', message, '#8ff4ff', 3400); }
function follow(dt, api, state, diving) {
  if (!linkHandled && state.ready) { linkHandled = true; readLink(); }
  if (!pending) return;
  pending.time += dt;
  if (!diving) { if (api.getMode() === 'surface' && pending.time > 8) settle(); return; }
  const nav = api.nav;
  if (nav.suspended) return;
  if (pending.stage === 'dive' || (pending.stage === 'descend' && state.modelLoading === false)) {
    const view = viewpoint(pending.site);
    api.guide(true); api.travel(view.point, view.focus, CRUISE);
    pending.inputs = nav.inputs; pending.stage = view.ready ? 'final' : 'descend'; pending.time = 0; pending.aim = [...view.point]; return;
  }
  // Any deliberate input cancels the autopilot; the visitor is already where they chose to be.
  if (nav.inputs !== pending.inputs) { settle(); return; }
  // A landmark's viewpoint moves when its model lands on the seabed, which can be after the scene first reports its models in: follow it.
  if (pending.stage === 'final' && pending.site.kind === 'primary') {
    const view = viewpoint(pending.site);
    if (Math.hypot(view.point[0] - pending.aim[0], view.point[1] - pending.aim[1], view.point[2] - pending.aim[2]) > .5) { api.travel(view.point, view.focus, CRUISE); pending.aim = [...view.point]; pending.time = 0; pending.still = 0; return; }
  }
  // A diver the autopilot cannot move any further has arrived as far as this site allows.
  pending.still = nav.speed < .05 ? pending.still + dt : 0;
  if (pending.time < .5 || (nav.travelling && pending.still < 3)) return;
  if (pending.stage === 'descend' && pending.time < 20) return;
  settle(pending.site.kind === 'scenic' ? `${pending.site.name}. Explore freely.` : '');
}
onFrame(follow);

// Deep links: #anchor, #wreck, #treasure, #tour and #plan.
const LINKS = { anchor: 'about', wreck: 'projects', treasure: 'experience' };
function readLink() {
  const key = location.hash.slice(1).toLowerCase();
  if (!ready() || controls().getMode() !== 'surface' || plan.open || prompt.open) return;
  if (key === 'plan') openPlan();
  else if (key === 'tour') guided();
  else if (LINKS[key]) {
    const site = PRIMARY.find(item => item.id === LINKS[key]);
    prompt.style.setProperty('--signal', site.signal);
    prompt.querySelector('h2').textContent = `Dive straight to ${site.name}`;
    prompt.querySelector('.prompt-note').textContent = `${site.section} · ${depthOf(site)} m down. Your mouse will steer once you start.`;
    linkAction = () => startAt(site);
    if ($('dialog[open]')) return;
    hold(); prompt.showModal(); prompt.querySelector('[data-go]').focus();
  }
}
prompt.querySelector('[data-go]').addEventListener('click', () => { const action = linkAction; linkAction = null; release(); prompt.close(); action?.(); });
prompt.querySelector('[data-skip]').addEventListener('click', () => prompt.close());
prompt.addEventListener('close', release);
addEventListener('hashchange', readLink);

// Keep the surface quiet: the last dive's details are available on demand.
function hideSummary() {
  summary.dataset.show = 'false'; summary.inert = true; delete document.body.dataset.summary;
  summaryToggle.setAttribute('aria-expanded', 'false');
}
summaryToggle.addEventListener('click', () => {
  if (summary.dataset.show === 'true') { hideSummary(); return; }
  summary.dataset.show = 'true'; summary.inert = false; document.body.dataset.summary = 'true';
  summaryToggle.setAttribute('aria-expanded', 'true');
});
addEventListener('oceandiveend', event => {
  const { time, maxDepth, found } = event.detail;
  if (time < 4) return;
  summary.querySelector('.sum-found').textContent = `${found} / 3`;
  summary.querySelector('.sum-depth').textContent = `${maxDepth.toFixed(1)} m`;
  summary.querySelector('.sum-time').textContent = `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
  summary.querySelector('.sum-note').textContent = found === 3 ? 'All three sites found. The whole story is in the logbook.' : found ? 'There is more down there. The lights mark what is left.' : 'Three lights mark the sites. Follow one next time.';
  hideSummary(); summaryToggle.hidden = false;
});
addEventListener('oceanmediumchange', () => {
  if (window.oceanDiagnostics?.submerged) { hideSummary(); summaryToggle.hidden = true; }
});
summary.querySelector('.summary-close').addEventListener('click', () => { hideSummary(); summaryToggle.focus(); });
addEventListener('keydown', event => {
  if (event.key === 'Escape' && summary.dataset.show === 'true' && !$('dialog[open]')) {
    hideSummary(); summaryToggle.focus();
  }
});
summary.querySelector('.sum-log').addEventListener('click', () => {
  if (window.oceanArchive?.open) window.oceanArchive.open('experience'); else $('#archive-toggle')?.click();
  // The archive only opens underwater in some builds: say so rather than do nothing.
  if ($('dialog[open]')) hideSummary(); else summary.querySelector('.sum-note').textContent = 'The logbook opens underwater. Dive in and press F at any site.';
});
window.oceanPlan = { open: openPlan, close: closePlan, startAt, get sites() { return sites; }, viewpoint, get pending() { return pending; } };
