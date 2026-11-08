import { toDisplayDepth, DISPLAY_MAX_DEPTH } from './depth-metrics.js';
import { LANDMARKS, terrainHeightAt } from './reef.js';
import { drawPreparedChart } from './prepared-charts.js';
import { ART, SCENERY } from './site-art.js';
import { PORTFOLIO_CONTENT } from './portfolio-content.js';
import { onFrame, say } from './journey.js';
import { startTour, tourPlan, tourStatus, DIVE_IN } from './guided-dive.js';

// Plan your dive: the surface entry points, the site map signboard, starting a
// dive at a chosen site, and links that open straight onto a dive. The summary
// on the way back up is dive-summary.js. Everything here reads the scene through oceanControls.
const $ = selector => document.querySelector(selector);
const controls = () => window.oceanControls, ready = () => Boolean(window.oceanDiagnostics?.ready && controls());
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const node = (tag, className, html = '') => { const item = document.createElement(tag); if (className) item.className = className; item.innerHTML = html; return item; };
const list = entries => entries.map(entry => entry.title).join(', ');
// Portfolio sites are the reason for the dive; the copy takes its section names from the archive itself.
const PRIMARY = [
  { id: 'about', name: 'The Helmet', signal: '#7ff0cf', depth: 9, entry: [5.8, 0], bullets: ['Who I am and how I work', PORTFOLIO_CONTENT.about.subtitle, `${PORTFOLIO_CONTENT.about.entries.length} short reads, in the shallows`] },
  { id: 'experience', name: 'The Nautilus', signal: '#ffcf7a', depth: 47, entry: [0, 4], bullets: ['The roles I’ve held and what each one taught me', PORTFOLIO_CONTENT.experience.subtitle, `${PORTFOLIO_CONTENT.experience.entries.length} chambers in the shell`] },
  { id: 'projects', name: 'The Wreck', signal: '#c9a2ff', depth: 21, entry: [0, 17.2], bullets: ['The things I’ve built', PORTFOLIO_CONTENT.projects.subtitle, `${PORTFOLIO_CONTENT.projects.entries.length} finds in the hull: ${list(PORTFOLIO_CONTENT.projects.entries)}`] }
].map((site, index) => ({ ...site, kind: 'primary', number: index + 1, section: PORTFOLIO_CONTENT[site.id].title, position: LANDMARKS.find(item => item.id === site.id).position }));
// Charted positions of the scenic formations; the scene's own list replaces them once it is available.
const CHARTED = [['Table coral tower', 38, -8, 6, 10.5], ['Brain coral dome', -42, -2, 8, 9.2], ['Pillar coral cathedral', 48, -28, 8, 10.5], ['Kelp grove', -50, -52, 8.5, 15], ['Giant clam', -9, -54, 3.5, 2.6], ['Soft coral spire', 50, -72, 6, 15], ['Lantern garden', 8, -86, 6.5, 5.5]];
function scenery() {
  const live = controls()?.formations, sites = live?.length ? live.map(item => [item.name, item.position[0], item.position[2], item.radius, item.height]) : CHARTED;
  return [...sites, ['The arch', 20, -83, 6, 8]].filter(([name]) => SCENERY[name]).map(([name, x, z, radius, height]) => ({ id: name, name, kind: 'scenic', signal: '#8ff4ff', section: 'Reef feature', position: [x, terrainHeightAt(x, z), z], radius, height, bullets: [SCENERY[name], 'Nothing to read here, just somewhere good to be'] }));
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
document.body.append(plan, prompt);
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
function guided() { pending = null; window.oceanDiveSummary?.close(true); if (!startTour()) say('Guided dive', 'The ocean is still getting ready. Try again in a moment.', '#8ff4ff', 2600); }

// Start at a site: the dive begins on the water above it, then the autopilot descends to its viewpoint.
export function startAt(site) {
  const api = controls();
  if (typeof site === 'string') site = sites.find(item => item.id === site);
  if (!site || !ready()) return false;
  const view = viewpoint(site), mode = api.getMode();
  closePlan(true); window.oceanDiveSummary?.close(true); window.oceanTour?.stop();
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

// Deep links: #helmet, #wreck, #nautilus, #tour and #plan (#anchor and #treasure, from before those landmarks changed,
// still lead to the same sites).
const LINKS = { helmet: 'about', wreck: 'projects', nautilus: 'experience', anchor: 'about', treasure: 'experience' };
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

window.oceanPlan = { open: openPlan, close: closePlan, startAt, get sites() { return sites; }, viewpoint, get pending() { return pending; } };
