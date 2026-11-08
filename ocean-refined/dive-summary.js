import { SITES, features } from './dive-log.js';
import { SPECIES, portraitURL } from './field-guide.js';
import { LANDMARKS } from './reef.js';
import { DISPLAY_MAX_DEPTH } from './depth-metrics.js';
import { paintDiveChart, chartUV, CHART } from './dive-chart.js';
import { ART, SCENERY } from './site-art.js';
import { openZoom, zoomOpen } from './photo-zoom.js';
import { PORTFOLIO_CONTENT } from './portfolio-content.js';
import { sendPhoto, wordCount, NOTE_WORDS } from './submissions.js';
import { track } from './analytics.js';

// The dive log page: once the diver is back at the surface a Dive log button beside Guided dive opens the last dive's
// log (the record comes from dive-log.js as `oceandivelog`), and View more logs at the top turns to the visit's other dives. The page shows the numbers and the depth profile, the reef chart
// with the swim drawn over it and the sites ticked off, the photos as postcards, and a field guide to the animals seen.
// Photos are in memory only; sharing one with Anshul, with a short note, is the only thing that leaves the device.
const $ = (selector, root = document) => root.querySelector(selector);
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clock = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const two = n => String(n).padStart(2, '0');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const EXIT_MS = 250;
// The water behind a portrait, by where the animal lives.
const HABITAT = {
  open: 'radial-gradient(120% 90% at 50% -10%,#79d9ee 0,#1d84aa 38%,#0b4262 76%,#062a40)',
  reef: 'radial-gradient(70% 45% at 85% 105%,#ff9d8a40,#0000 70%),radial-gradient(60% 40% at 10% 110%,#c9a2ff33,#0000 70%),linear-gradient(#49bcd4,#147090 62%,#0b4560)',
  floor: 'linear-gradient(#3aa6c2 0,#176f8c 52%,#3f7a78 78%,#b3a47f 100%)'
};
const HINT = {
  open: 'Something lives out in the blue. Look away from the reef now and then.',
  reef: 'Something lives around the coral. Slow down near the formations.',
  floor: 'Something lives on the sea floor. Look down as you cross the sand.'
};
// Each site's depth as the planner gives it (dive-plan.js), with its values as a fallback.
const siteDepth = id => window.oceanPlan?.sites?.find(site => site.id === id)?.depth ?? { about: 9, experience: 47, projects: 21 }[id];

// The way in sits with the hero's calls to action, after Guided dive, and takes its style (surface.css .guided-button).
const button = document.createElement('button');
button.type = 'button'; button.className = 'guided-button ds-open'; button.hidden = true;
button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'dive-summary');
button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg><span>Dive log</span><small></small>';
const dialog = document.createElement('dialog');
dialog.className = 'ds'; dialog.id = 'dive-summary'; dialog.setAttribute('aria-labelledby', 'ds-title');
dialog.innerHTML = `<div class="ds-inner">
  <header class="ds-head ds-step" style="--i:0"><div><p class="holo-label ds-kicker"></p><h2 id="ds-title"></h2><p class="ds-sub"></p></div>
    <div class="ds-head-tools"><details class="ds-more" hidden><summary class="holo-chip">View more logs <span aria-hidden="true">▾</span></summary><ul class="ds-more-list" aria-label="Your dives this visit"></ul></details>
    <button type="button" class="holo-chip ds-close">Close <kbd>Esc</kbd></button></div></header>
  <section class="ds-stats ds-step" style="--i:1" aria-label="Dive numbers">
    <dl class="ds-tiles"></dl>
    <figure class="ds-panel ds-profile"><div class="ds-label"><span class="holo-label">Dive profile</span><span class="ds-average"></span></div>
      <svg viewBox="0 0 640 200" role="img"></svg>
      <figcaption><span><i style="--c:#7ff0cf"></i>Dive site</span><span><i style="--c:#eefdff"></i>Photo</span><span><i style="--c:#7ff0cf55"></i>Safety stop</span></figcaption></figure>
  </section>
  <section class="ds-panel ds-step ds-photos" style="--i:2" aria-labelledby="ds-photos-title" aria-roledescription="carousel">
      <div class="ds-label"><span class="holo-label" id="ds-photos-title">Postcards from the reef</span><span class="ds-count" aria-live="polite"></span></div>
      <div class="ds-cards" tabindex="0" aria-label="Your photos. Swipe or use the arrow keys; Enter opens the photo to zoom."></div>
      <div class="ds-carousel-bar"><div class="ds-dots"></div><div class="ds-arrows"><button type="button" class="holo-chip" data-step="-1" aria-label="Previous photo">←</button><button type="button" class="holo-chip" data-step="1" aria-label="Next photo">→</button></div></div>
      <div class="ds-photo-actions"><button type="button" class="holo-chip ds-zoom">Zoom <span aria-hidden="true">⤢</span></button><button type="button" class="holo-chip ds-download">Download <span aria-hidden="true">↓</span></button><button type="button" class="holo-chip holo-chip--go ds-share-open" aria-expanded="false" aria-controls="ds-share">Share with Anshul <span aria-hidden="true">→</span></button></div>
      <form class="ds-share" id="ds-share" hidden>
        <label for="ds-note">Add a note <small>(optional, up to ${NOTE_WORDS} words)</small></label>
        <textarea id="ds-note" rows="3" maxlength="400" placeholder="A favourite moment from the dive…"></textarea>
        <div class="meta"><span>Only this photo and your note are sent, privately to Anshul. Your other photos stay on this device and are gone when you close the tab.</span><output for="ds-note">0 / ${NOTE_WORDS}</output></div>
        <div class="row"><button type="submit" class="holo-chip holo-chip--go">Send privately</button><button type="button" class="holo-chip ds-share-cancel">Cancel</button></div>
      </form>
      <p class="ds-status" role="status"></p>
    </section>
  <section class="ds-panel ds-step ds-sites" style="--i:3" aria-labelledby="ds-sites-title">
    <div class="ds-label"><span class="holo-label" id="ds-sites-title">Where you went</span><span class="ds-sites-count"></span></div>
    <div class="ds-sites-body">
      <div class="ds-map"><canvas width="840" height="744" aria-hidden="true"></canvas>
        <span class="ds-compass" aria-hidden="true"><b>N</b><i></i></span>
        <span class="ds-scale" aria-hidden="true" style="--w:${20 / CHART.width * 100}%"><i></i>20 m</span>
        <span class="ds-key" aria-hidden="true">${[0, 10, 20, 30, DISPLAY_MAX_DEPTH].map(d => `<i data-d="${d}"></i>`).join('')}<small>0</small><small>${DISPLAY_MAX_DEPTH} m</small></span></div>
      <div class="ds-sites-side">
        <p class="ds-sites-hint">Tap a site or a feature, on the chart or below, for more.</p>
        <ul class="ds-checks" aria-label="Portfolio sites"></ul>
        <ul class="ds-features" aria-label="Reef features"></ul>
        <article class="ds-place" aria-live="polite"></article>
        <div class="ds-story"><p class="holo-label">The dive, in order</p><ol></ol></div>
      </div>
    </div>
  </section>
  <section class="ds-panel ds-step" style="--i:4" aria-labelledby="ds-guide-title">
    <div class="ds-label"><span class="holo-label" id="ds-guide-title">Field guide · what you saw</span><span class="ds-filter" role="group" aria-label="Show"></span></div>
    <article class="ds-detail" aria-live="polite"></article>
    <div class="ds-grid"></div>
  </section>
  <footer class="ds-foot ds-step" style="--i:5"><p></p><div></div></footer>
</div>`;
document.body.append(dialog);
const guidedButton = document.getElementById('guided-dive');
if (guidedButton) guidedButton.after(button); else (document.querySelector('.portfolio-actions') || document.body).append(button);

// latest: the newest dive, which the button opens; record: the dive the page is showing.
let latest = null, record = null, photos = [], current = 0, selected = null, filter = 'dive', closing = 0;
// Sites found: those the journey has found this session, and any this dive reached.
const foundSites = () => new Set([...(window.oceanDiagnostics?.journey?.found || []), ...Object.keys(record.sites)]);

// --- The numbers and the depth profile -----------------------------------------------------------------------------
function paintStats() {
  const found = foundSites().size;
  const seen = Object.keys(record.seen).length, taken = photos.filter(photo => photo.dive === record.number).length;
  $('.ds-tiles', dialog).innerHTML = [
    ['Dive time', clock(record.time)], ['Max depth', `${record.maxDepth.toFixed(1)}<small> m</small>`], ['Sites', `${found}<small> / 3</small>`],
    ['Photos', taken], ['Species', `${seen}<small> / ${SPECIES.length}</small>`]
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('') +
    `<div><dt>Safety stop</dt><dd data-ok="${record.safetyStop}">${record.safetyStop ? 'Done ✓' : 'Not made this time'}</dd></div>`;
  $('.ds-average', dialog).textContent = `average ${record.averageDepth.toFixed(1)} m`;
}
function depthAt(t) {
  const p = record.profile; let i = 0; while (i < p.length - 2 && p[i + 1][0] < t) i++;
  const [t0, d0] = p[i], [t1, d1] = p[i + 1] || p[i]; return t1 > t0 ? d0 + (d1 - d0) * Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : d0;
}
// The safety stop as flown: the last stretch held between 3 and 6.5 m before the final climb.
function stopBand() {
  if (!record.safetyStop) return null;
  const p = record.profile; let end = p.length - 1;
  while (end > 0 && p[end][1] < 2.5) end--;
  let start = end; while (start > 0 && p[start - 1][1] >= 2.5 && p[start - 1][1] <= 6.5) start--;
  return p[end][0] - p[start][0] >= 20 ? [p[start][0], p[end][0]] : null;
}
function paintProfile() {
  const svg = $('.ds-profile svg', dialog), span = Math.max(1, record.time), floor = Math.max(10, Math.ceil((record.maxDepth + 2) / 10) * 10);
  const X = t => 38 + t / span * 590, Y = d => 14 + d / floor * 160;
  const line = record.profile.map(([t, d], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(d).toFixed(1)}`).join('');
  const ticks = Array.from({ length: floor / 10 + 1 }, (_, i) => i * 10).map(d => `<line class="pf-axis" x1="38" x2="628" y1="${Y(d)}" y2="${Y(d)}"/><text class="pf-tick" x="30" y="${Y(d) + 3}" text-anchor="end">${d} m</text>`).join('');
  const times = [0, span / 3, span * 2 / 3, span].map((t, i) => `<text class="pf-tick" x="${X(t)}" y="194" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${clock(t)}</text>`).join('');
  const band = stopBand();
  const stop = band ? `<rect class="pf-stop" x="${X(band[0])}" y="${Y(3)}" width="${X(band[1]) - X(band[0])}" height="${Y(6.5) - Y(3)}" rx="2"/><text class="pf-tick" x="${(X(band[0]) + X(band[1])) / 2}" y="${Y(3) - 5}" text-anchor="middle">Safety stop ${clock(band[1] - band[0])}</text>` : '';
  const sites = Object.entries(record.sites).map(([id, visit]) => `<g class="pf-mark"><circle cx="${X(visit.t)}" cy="${Y(visit.depth)}" r="5.5" fill="${SITES[id].signal}"/><text x="${X(visit.t) + 9}" y="${Y(visit.depth) + 16}">${SITES[id].name}</text></g>`).join('');
  const cams = photos.filter(photo => photo.dive === record.number).map(photo => `<path class="pf-cam" d="M${X(photo.t)} ${Y(depthAt(photo.t)) - 13}l4 4-4 4-4-4z"/>`).join('');
  svg.innerHTML = `<defs><linearGradient id="ds-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8ff4ff" stop-opacity=".02"/><stop offset="1" stop-color="#8ff4ff" stop-opacity=".2"/></linearGradient></defs>
    ${ticks}${times}${stop}<path d="${line}L${X(span)} ${Y(0)}L${X(0)} ${Y(0)}Z" fill="url(#ds-fill)"/><path class="pf-line" d="${line}"/>
    <line class="pf-axis" x1="38" x2="628" y1="${Y(record.maxDepth)}" y2="${Y(record.maxDepth)}" stroke-dasharray="2 4"/><text class="pf-tick" x="626" y="${Y(record.maxDepth) - 4}" text-anchor="end">max ${record.maxDepth.toFixed(1)} m</text>${cams}${sites}`;
  const visited = Object.keys(record.sites).map(id => SITES[id].name);
  svg.setAttribute('aria-label', `Depth over ${clock(record.time)}, down to ${record.maxDepth.toFixed(1)} metres${visited.length ? `, by way of ${visited.join(' and ')}` : ''}${band ? ', with a safety stop near 5 metres' : ''}.`);
}

// --- Sites ---------------------------------------------------------------------------------------------------------
function smooth(points) {
  let d = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(2)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(2)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(2)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}
// The reef chart under the swim: a dive-site chart of the swim area painted from the scene itself (dive-chart.js).
const at = (x, z) => { const { u, v } = chartUV(x, z); return [u * 100, v * 100]; };
// Where the diver was when a photo was taken: the track is sampled with the profile (one point a sample, after the
// profile's opening [0, 0]), so a photo's time finds its point.
function photoPoint(photo) {
  const p = record.profile; let i = 1; while (i < p.length - 1 && p[i][0] < photo.t) i++;
  return record.track[Math.min(record.track.length - 1, Math.max(0, i - 1))];
}
// Arrowheads along the swim, every `gap` metres of it, pointing the way it went (chart units: metres).
function arrows(points, gap = 16) {
  let out = '', run = gap * .6;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i], length = Math.hypot(x1 - x0, y1 - y0); if (!length) continue;
    while (run <= length) { const k = run / length, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k, a = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI; out += `<path class="ds-arrow" d="M-.9 -.75L.85 0L-.9 .75z" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${a.toFixed(1)})"/>`; run += gap; }
    run -= length;
  }
  return out;
}
// What the chart and the chips point at: 'site:<id>' or 'feature:<name>'. The card under the chips tells the rest
// (progressive disclosure: the chart and chips stay short, the detail is one tap away).
let place = null;
const featureDone = name => Boolean(record.features[name]);
function paintSites() {
  const map = $('.ds-map', dialog), found = foundSites();
  paintDiveChart($('canvas', map));
  map.querySelectorAll('svg,.ds-pin,.ds-glyph,.ds-shot').forEach(node => node.remove());
  // The swim, in chart metres: a glowing line that brightens from the way in to the way out, arrows along it, and
  // In and Out at its ends.
  const track = record.track.map(([x, z]) => { const { u, v } = chartUV(x, z); return [u * CHART.width, v * CHART.height]; });
  if (track.length > 1) {
    const [sx, sy] = track[0], [ex, ey] = track[track.length - 1];
    map.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${CHART.width} ${CHART.height}" aria-hidden="true">
      <defs><linearGradient id="ds-swim" gradientUnits="userSpaceOnUse" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}"><stop offset="0" stop-color="#7ff0cf"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
      <path class="ds-track-glow" d="${smooth(track)}"/><path class="ds-track" d="${smooth(track)}"/>${arrows(track)}
      <g class="ds-end" transform="translate(${sx} ${sy})"><circle r="1.3"/><text x="2.2" y=".9">In</text></g>
      <g class="ds-end" data-out transform="translate(${ex} ${ey})"><rect x="-1.1" y="-1.1" width="2.2" height="2.2" rx=".4"/><text x="-2.2" y=".9" text-anchor="end">Out</text></g></svg>`);
  }
  const list = features();
  // The reef features as their own line drawings, named on hover or when picked; lit once visited.
  for (const [name, x, z] of list) { const [u, v] = at(x, z); map.insertAdjacentHTML('beforeend', `<button type="button" class="ds-glyph" data-key="feature:${esc(name)}" data-done="${featureDone(name)}" style="left:${u}%;top:${v}%" aria-label="${esc(name)}${featureDone(name) ? ', visited' : ''}">${ART[name] || ''}<span>${esc(name)}</span></button>`); }
  LANDMARKS.forEach((landmark, index) => {
    const site = SITES[landmark.id], ticked = found.has(landmark.id), [u, v] = at(landmark.position[0], landmark.position[2]);
    map.insertAdjacentHTML('beforeend', `<button type="button" class="ds-pin" data-key="site:${landmark.id}" data-done="${ticked}" style="left:${u}%;top:${v}%;--signal:${site.signal}" aria-label="${esc(site.name)}${ticked ? ', found' : ''}">${ticked ? '✓' : index + 1}<span>${site.name}</span></button>`);
  });
  // The photos of this dive, where they were taken: a tap brings that postcard up.
  photos.forEach((photo, index) => {
    if (photo.dive !== record.number || !record.track.length) return;
    const [x, z] = photoPoint(photo), [u, v] = at(x, z);
    map.insertAdjacentHTML('beforeend', `<button type="button" class="ds-shot" data-photo="${index}" style="left:${u}%;top:${v}%" aria-label="Photo at ${esc(photo.place)}: show the postcard"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg></button>`);
  });
  // The chips: the three sites, then the features, each a name and a tick; everything else is in the card.
  $('.ds-checks', dialog).innerHTML = LANDMARKS.map(({ id }) => `<li data-done="${found.has(id)}" style="--signal:${SITES[id].signal}"><button type="button" data-key="site:${id}"><i aria-hidden="true">${found.has(id) ? '✓' : ''}</i>${SITES[id].name}<em>${siteDepth(id)} m</em></button></li>`).join('');
  $('.ds-features', dialog).innerHTML = list.map(([name]) => `<li data-done="${featureDone(name)}"><button type="button" data-key="feature:${esc(name)}">${esc(name)}</button></li>`).join('');
  // The dive in order: in, each site and feature as it was reached, each photo, and out. Sites and features open
  // their card; a photo brings its postcard up.
  const story = [[0, 'In', 'entry'],
    ...Object.entries(record.sites).map(([id, visit]) => [visit.t, SITES[id].name, 'site', `site:${id}`, SITES[id].signal]),
    ...Object.entries(record.features).map(([name, t]) => [t, name, 'feature', `feature:${name}`]),
    ...photos.map((photo, index) => photo.dive === record.number ? [photo.t, `Photo · ${photo.place}`, 'photo', null, null, index] : null).filter(Boolean),
    [record.time, 'Out', 'entry']].sort((a, b) => a[0] - b[0]);
  $('.ds-story ol', dialog).innerHTML = story.map(([t, name, kind, key, signal, photo]) => `<li data-kind="${kind}"${signal ? ` style="--signal:${signal}"` : ''}><time>${clock(t)}</time>${key ? `<button type="button" data-key="${esc(key)}">${esc(name)}</button>` : photo !== undefined && photo !== null ? `<button type="button" data-photo="${photo}">${esc(name)}</button>` : `<span>${esc(name)}</span>`}</li>`).join('');
  const featureCount = list.filter(([name]) => featureDone(name)).length;
  $('.ds-sites-count', dialog).textContent = `${found.size} of 3 sites · ${featureCount} of ${list.length} features`;
  // Open on the last site reached on this dive, else the first one still to find.
  const reached = Object.entries(record.sites).sort((a, b) => b[1].t - a[1].t)[0]?.[0];
  if (!place || !dialog.querySelector(`[data-key="${CSS.escape(place)}"]`)) place = `site:${reached || LANDMARKS.find(({ id }) => !found.has(id))?.id || LANDMARKS[0].id}`;
  paintPlace(place);
}
function paintPlace(key) {
  place = key;
  const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)], card = $('.ds-place', dialog);
  for (const node of dialog.querySelectorAll('.ds-sites [data-key]')) node.setAttribute('aria-pressed', String(node.dataset.key === key));
  if (kind === 'site') {
    const site = SITES[id], visit = record.sites[id], found = foundSites().has(id), content = PORTFOLIO_CONTENT[id] || {};
    const status = visit ? `Reached ${clock(visit.t)} into the dive, at ${visit.depth.toFixed(0)} m` : found ? 'Found on an earlier dive' : 'Still down there';
    card.style.setProperty('--signal', site.signal); card.dataset.done = String(found);
    card.innerHTML = `<div class="art">${ART[id] || ''}</div><div><p class="holo-label">Portfolio site · ${esc(content.title || '')}</p><h3>${esc(site.name)}</h3>
      <p class="ds-place-status">${found ? '✓ ' : ''}${status} · charted at ${siteDepth(id)} m</p>${content.subtitle ? `<p>${esc(content.subtitle)}</p>` : ''}
      <div class="row">${found ? `<button type="button" class="holo-chip" data-read="${id}">Read ${esc(content.title || 'it')} <span aria-hidden="true">→</span></button>` : `<button type="button" class="holo-chip holo-chip--go" data-dive="${id}">Dive to ${esc(site.name)} <span aria-hidden="true">→</span></button>`}</div></div>`;
  } else {
    const done = featureDone(id);
    card.style.setProperty('--signal', '#8ff4ff'); card.dataset.done = String(done);
    card.innerHTML = `<div class="art">${ART[id] || ''}</div><div><p class="holo-label">Reef feature</p><h3>${esc(id)}</h3>
      <p class="ds-place-status">${done ? '✓ Visited on this dive' : 'Not visited on this dive'}</p>${SCENERY[id] ? `<p>${esc(SCENERY[id])}</p>` : ''}</div>`;
  }
}
$('.ds-sites', dialog).addEventListener('click', event => {
  const action = event.target.closest('button'); if (!action) return;
  if (action.dataset.key) { paintPlace(action.dataset.key); return; }
  if (action.dataset.photo) { const section = $('.ds-photos', dialog); section.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'center' }); go(Number(action.dataset.photo)); return; }
  if (action.dataset.read) { close(true); window.oceanArchive?.open(action.dataset.read); }
  else if (action.dataset.dive) { close(true); window.oceanPlan?.startAt(action.dataset.dive); }
});

// --- Postcards -----------------------------------------------------------------------------------------------------
function paintPhotos() {
  // This dive's photos in the order taken, then earlier dives', newest first.
  const all = window.oceanDiveLog?.photos || [];
  photos = [...all.filter(photo => photo.dive === record.number), ...all.filter(photo => photo.dive !== record.number).reverse()];
  const track = $('.ds-cards', dialog), section = $('.ds-photos', dialog);
  section.dataset.empty = String(!photos.length);
  for (const node of section.querySelectorAll('.ds-carousel-bar,.ds-photo-actions')) node.hidden = !photos.length;
  $('.ds-share', dialog).hidden = true; $('.ds-share-open', dialog).setAttribute('aria-expanded', 'false'); $('.ds-status', dialog).textContent = '';
  if (!photos.length) {
    track.removeAttribute('tabindex');
    track.innerHTML = '<p class="ds-empty"><span>No photos on this dive.<br>Next time press <kbd>H</kbd> underwater in first-person view, or tap Photo on a touch screen.</span></p>';
    $('.ds-count', dialog).textContent = ''; $('.ds-dots', dialog).innerHTML = '';
    return;
  }
  track.tabIndex = 0;
  track.innerHTML = photos.map((photo, i) => `<figure class="postcard" data-current="${i === 0}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${photos.length}: ${esc(photo.place)}">
    <img src="${photo.url}" alt="Your photo at ${esc(photo.place)}, ${photo.depth.toFixed(0)} metres down" loading="lazy" decoding="async"><span class="zoom-hint" aria-hidden="true">⤢ Zoom</span>${photo.shared ? '<span class="sent">Shared</span>' : ''}
    <figcaption><b>${esc(photo.place)}</b><small>${photo.dive === record.number ? `${clock(photo.t)} into the dive` : `Dive ${two(photo.dive)} · ${clock(photo.t)} in`}</small><span class="stamp"><span>${photo.depth.toFixed(0)} m<br><small>depth</small></span></span></figcaption></figure>`).join('');
  $('.ds-dots', dialog).innerHTML = photos.map((photo, i) => `<button type="button" aria-label="Photo ${i + 1}" aria-current="${i === 0}"></button>`).join('');
  current = 0; settle(true);
}
function go(index) {
  const cards = $('.ds-cards', dialog).children; if (!cards.length) return;
  index = Math.max(0, Math.min(cards.length - 1, index));
  cards[index].scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
}
function settle(force = false) {
  const track = $('.ds-cards', dialog), cards = [...track.querySelectorAll('.postcard')]; if (!cards.length) return;
  const middle = track.scrollLeft + track.clientWidth / 2;
  let best = 0; cards.forEach((card, i) => { if (Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle) < Math.abs(cards[best].offsetLeft + cards[best].offsetWidth / 2 - middle)) best = i; });
  if (best === current && !force) return;
  if (best !== current) { $('.ds-share', dialog).hidden = true; $('.ds-share-open', dialog).setAttribute('aria-expanded', 'false'); }
  current = best;
  cards.forEach((card, i) => { card.dataset.current = String(i === best); });
  [...$('.ds-dots', dialog).children].forEach((dot, i) => dot.setAttribute('aria-current', String(i === best)));
  $('.ds-count', dialog).textContent = `${best + 1} / ${cards.length}`;
  const shared = photos[best]?.shared, open = $('.ds-share-open', dialog);
  open.disabled = Boolean(shared); open.innerHTML = shared ? 'Shared with Anshul ✓' : 'Share with Anshul <span aria-hidden="true">→</span>';
}
$('.ds-cards', dialog).addEventListener('scroll', () => requestAnimationFrame(() => settle()), { passive: true });
$('.ds-cards', dialog).addEventListener('keydown', event => {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  event.preventDefault(); go(current + (event.key === 'ArrowRight' ? 1 : -1));
});
$('.ds-dots', dialog).addEventListener('click', event => { const dot = event.target.closest('button'); if (dot) go([...dot.parentNode.children].indexOf(dot)); });
dialog.querySelectorAll('[data-step]').forEach(step => step.addEventListener('click', () => go(current + Number(step.dataset.step))));
// Zoom: the photo full size in its own viewer (photo-zoom.js), from the Zoom button, a click on the photo in the middle
// of the carousel (a click on one beside it brings it to the middle first), or Enter on the carousel.
function zoomCurrent(from) {
  const photo = photos[current]; if (!photo || zoomOpen()) return;
  openZoom(dialog, { blob: photo.full, src: photo.url, alt: `Your photo at ${photo.place}, ${photo.depth.toFixed(0)} metres down`, label: `${photo.place} · ${photo.depth.toFixed(0)} m · ${photo.dive === record.number ? `${clock(photo.t)} into the dive` : `Dive ${two(photo.dive)}`}` }, from);
  track('reef_photo_zoomed');
}
$('.ds-zoom', dialog).addEventListener('click', event => zoomCurrent(event.currentTarget));
$('.ds-cards', dialog).addEventListener('click', event => {
  const card = event.target.closest('.postcard'); if (!card) return;
  const index = [...card.parentNode.children].indexOf(card);
  if (index === current) zoomCurrent($('.ds-cards', dialog)); else go(index);
});
$('.ds-cards', dialog).addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); zoomCurrent(event.currentTarget); } });
$('.ds-download', dialog).addEventListener('click', () => {
  const photo = photos[current]; if (!photo) return;
  const url = URL.createObjectURL(photo.full), link = document.createElement('a');
  link.href = url; link.download = `reef-photo-dive-${two(photo.dive)}-${clock(photo.t).replace(':', 'm')}s.jpg`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  track('reef_photo_downloaded');
});

// Sharing: one photo and an optional note of up to NOTE_WORDS words.
const share = $('.ds-share', dialog), note = $('#ds-note', share), words = $('output', share), send = $('[type="submit"]', share), status = $('.ds-status', dialog), openShare = $('.ds-share-open', dialog);
function countWords() { const n = wordCount(note.value); words.textContent = `${n} / ${NOTE_WORDS}`; words.dataset.over = String(n > NOTE_WORDS); send.disabled = n > NOTE_WORDS; return n; }
note.addEventListener('input', countWords);
openShare.addEventListener('click', () => {
  share.hidden = !share.hidden; openShare.setAttribute('aria-expanded', String(!share.hidden)); status.textContent = '';
  if (!share.hidden) { countWords(); note.focus(); }
});
$('.ds-share-cancel', share).addEventListener('click', () => { share.hidden = true; openShare.setAttribute('aria-expanded', 'false'); openShare.focus(); });
share.addEventListener('submit', async event => {
  event.preventDefault();
  const photo = photos[current]; if (!photo || share.dataset.sending === 'true' || countWords() > NOTE_WORDS) return;
  // A retry of the same photo keeps its id, so the intake can tell it from a new one.
  photo.shareId ||= crypto.randomUUID();
  share.dataset.sending = 'true'; send.disabled = note.disabled = true; send.textContent = 'Sending…'; delete status.dataset.error; status.textContent = '';
  try {
    await sendPhoto(photo.share, note.value, photo.shareId);
    photo.shared = true; track('reef_photo_shared');
    status.textContent = `Sent privately to Anshul${note.value.trim() ? ', with your note' : ''}. Thank you.`;
    share.hidden = true; note.value = ''; openShare.setAttribute('aria-expanded', 'false');
    $('.ds-cards', dialog).children[current]?.insertAdjacentHTML('beforeend', '<span class="sent">Shared</span>');
    settle(true);
  } catch (failure) {
    status.dataset.error = 'true'; status.textContent = failure.message || 'Could not send it. Please try again.';
  } finally { delete share.dataset.sending; send.disabled = note.disabled = false; send.textContent = 'Send privately'; countWords(); }
});

// --- Field guide ---------------------------------------------------------------------------------------------------
const seenBefore = id => !record.seen[id] && Boolean(window.oceanDiveLog?.seenEver?.has(id));
function ordered() {
  const order = item => record.seen[item.id] ? record.seen[item.id].t : seenBefore(item.id) ? 1e6 : 2e6 - item.real;
  return [...SPECIES].sort((a, b) => order(a) - order(b));
}
function paintGuide() {
  const list = ordered(), here = list.filter(item => record.seen[item.id]).length, known = list.filter(item => record.seen[item.id] || seenBefore(item.id)).length;
  filter = here ? 'dive' : 'all';
  $('.ds-filter', dialog).innerHTML = [['dive', `This dive ${here}`], ['all', `All ${SPECIES.length}`], ['unseen', `Not yet ${SPECIES.length - known}`]]
    .map(([key, label]) => `<button type="button" class="holo-chip" data-filter="${key}" aria-pressed="${key === filter}">${label}</button>`).join('');
  $('.ds-grid', dialog).innerHTML = list.map(item => {
    const seen = record.seen[item.id], before = seenBefore(item.id), known = Boolean(seen) || before;
    const note = seen ? `${seen.depth.toFixed(0)} m · ${esc(seen.place)}` : before ? 'Seen on an earlier dive' : 'Not seen yet';
    return `<button type="button" class="species" data-id="${item.id}" data-seen="${known}" data-here="${Boolean(seen)}" aria-pressed="false" style="--habitat:${HABITAT[item.habitat]}">
      <span class="art"><img src="${portraitURL(item.id)}" alt="" loading="lazy" decoding="async">${seen?.fresh ? '<span class="new">NEW</span>' : ''}</span>
      <span class="name">${known ? esc(item.name) : '? ? ?'}<small>${note}</small></span></button>`;
  }).join('');
  applyFilter();
  showDetail((list.find(item => record.seen[item.id]) || list[0]).id, false);
}
function applyFilter() {
  for (const chip of dialog.querySelectorAll('[data-filter]')) chip.setAttribute('aria-pressed', String(chip.dataset.filter === filter));
  for (const card of $('.ds-grid', dialog).children) card.hidden = filter === 'dive' ? card.dataset.here !== 'true' : filter === 'unseen' ? card.dataset.seen === 'true' : false;
}
function showDetail(id, swap = true) {
  selected = id;
  const item = SPECIES.find(entry => entry.id === id), seen = record.seen[id], before = seenBefore(id), known = Boolean(seen) || before, detail = $('.ds-detail', dialog);
  detail.dataset.seen = String(known); detail.style.setProperty('--habitat', HABITAT[item.habitat]);
  const facts = seen ? `<dl><div><dt>Where</dt><dd>${esc(seen.place)}</dd></div><div><dt>Depth</dt><dd>${seen.depth.toFixed(0)} m</dd></div><div><dt>Seen at</dt><dd>${clock(seen.t)}</dd></div><div><dt>Real length</dt><dd>${item.real} m</dd></div></dl>`
    : before ? `<dl><div><dt>Real length</dt><dd>${item.real} m</dd></div></dl>` : '';
  detail.innerHTML = `<div class="art"><img src="${portraitURL(id)}" alt="${known ? esc(item.name) : 'A silhouette of an animal not seen yet'}"></div><div class="copy">
    <p class="holo-label">${seen ? (seen.fresh ? 'New to your log' : 'Seen on this dive') : before ? 'Seen on an earlier dive' : 'Not seen yet'}</p>
    <h3>${known ? esc(item.name) : 'Still out there'}</h3><p class="sci">${known ? esc(item.scientific) : `${item.real >= 2 ? 'Something big' : 'Something small'}, ${item.habitat === 'floor' ? 'down on the sand' : item.habitat === 'open' ? 'out in the blue' : 'around the coral'}`}</p>
    ${facts}<p class="fact">${known ? esc(item.fact) : HINT[item.habitat]}</p></div>`;
  detail.dataset.swap = 'false'; if (swap) { void detail.offsetWidth; detail.dataset.swap = 'true'; }
  for (const card of $('.ds-grid', dialog).children) card.setAttribute('aria-pressed', String(card.dataset.id === id));
}
$('.ds-grid', dialog).addEventListener('click', event => { const card = event.target.closest('.species'); if (card) showDetail(card.dataset.id); });
$('.ds-filter', dialog).addEventListener('click', event => {
  const chip = event.target.closest('[data-filter]'); if (!chip) return;
  filter = chip.dataset.filter; applyFilter();
  const first = [...$('.ds-grid', dialog).children].find(card => !card.hidden);
  if (first && $(`.species[data-id="${selected}"]`, dialog)?.hidden) showDetail(first.dataset.id);
});

// --- The page ------------------------------------------------------------------------------------------------------
function paintFoot() {
  // The next site to suggest is the shallowest one not found yet.
  const found = foundSites(), next = LANDMARKS.filter(item => !found.has(item.id)).sort((a, b) => siteDepth(a.id) - siteDepth(b.id))[0];
  const last = Object.entries(record.sites).sort((a, b) => b[1].t - a[1].t)[0]?.[0] || 'about';
  $('.ds-foot p', dialog).textContent = next ? `${SITES[next.id].name} is still down there at ${siteDepth(next.id)} m. Its light is waiting.` : 'All three sites found. The whole story is in the logbook.';
  $('.ds-foot div', dialog).innerHTML = `<button type="button" class="holo-chip" data-log="${last}">Open the logbook <span aria-hidden="true">→</span></button>` +
    (next ? `<button type="button" class="holo-chip holo-chip--go" data-dive="${next.id}">Dive to ${SITES[next.id].name} <span aria-hidden="true">→</span></button>` : '<button type="button" class="holo-chip holo-chip--go" data-plan>Choose a dive site <span aria-hidden="true">→</span></button>');
}
$('.ds-foot', dialog).addEventListener('click', event => {
  const action = event.target.closest('button'); if (!action) return;
  close(true);
  if (action.dataset.log) window.oceanArchive?.open(action.dataset.log);
  else if (action.dataset.dive) window.oceanPlan?.startAt(action.dataset.dive);
  else if ('plan' in action.dataset) window.oceanPlan?.open();
});
function paint() {
  const started = new Date(record.started), ended = new Date(record.ended || Date.now());
  const time = date => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('.ds-kicker', dialog).textContent = `Dive log · No. ${two(record.number)}`;
  $('#ds-title', dialog).textContent = 'Back on the surface';
  $('.ds-sub', dialog).textContent = `${started.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })} · In at ${time(started)}, out at ${time(ended)}`;
  paintMore(); paintPhotos(); paintStats(); paintProfile(); paintSites(); paintGuide(); paintFoot();
}
// View more logs: the visit's other dives, newest first, in a small list under the button.
function paintMore() {
  const all = window.oceanDiveLog?.dives || [], more = $('.ds-more', dialog);
  more.hidden = all.length < 2; more.open = false;
  $('.ds-more-list', more).innerHTML = [...all].reverse().map(dive => `<li><button type="button" data-number="${dive.number}" aria-current="${dive === record}">
    <b>Dive ${two(dive.number)}</b><span>${clock(dive.time)} · ${dive.maxDepth.toFixed(1)} m · ${Object.keys(dive.seen).length} species</span></button></li>`).join('');
}
$('.ds-more', dialog).addEventListener('click', event => {
  const pick = event.target.closest('[data-number]'); if (!pick) return;
  const dive = window.oceanDiveLog?.dives.find(item => item.number === Number(pick.dataset.number)); if (!dive) return;
  record = dive; paint(); dialog.scrollTop = 0; $('.ds-more summary', dialog).focus();
});

// open(): the newest dive; open(record): any dive of the visit (the logbook's Dive log page opens them).
function open(chosen) {
  const dive = chosen?.number ? chosen : latest;
  if (!dive || dialog.open || document.querySelector('dialog[open]')) return false;
  record = dive; paint();
  dialog.scrollTop = 0; delete dialog.dataset.closing;
  window.oceanControls?.setInterfaceOpen?.(true);
  dialog.showModal(); document.body.dataset.summary = 'true';
  button.dataset.seen = 'true'; button.setAttribute('aria-expanded', 'true'); $('small', button).textContent = clock(latest.time);
  track('dive_summary_opened');
  return true;
}
// Closing plays a short exit first; `now` skips it when another action follows at once.
function close(now = false) {
  if (!dialog.open) return;
  clearTimeout(closing);
  if (now || reduced.matches) { dialog.close(); return; }
  dialog.dataset.closing = 'true'; closing = setTimeout(() => dialog.close(), EXIT_MS);
}
dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
dialog.addEventListener('close', () => {
  clearTimeout(closing); delete dialog.dataset.closing; delete document.body.dataset.summary;
  button.setAttribute('aria-expanded', 'false');
  window.oceanControls?.setInterfaceOpen?.(false);
  if (!button.hidden && !document.querySelector('dialog[open]') && !window.oceanDiagnostics?.submerged) button.focus({ preventScroll: true });
});
dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
$('.ds-close', dialog).addEventListener('click', () => close());
button.addEventListener('click', () => open());

addEventListener('oceandivelog', ({ detail }) => {
  latest = record = detail;
  const seen = Object.keys(detail.seen).length;
  $('small', button).textContent = 'New';
  button.setAttribute('aria-label', `Dive log: ${clock(detail.time)}, ${detail.maxDepth.toFixed(1)} metres, ${seen} species`);
  button.hidden = false; button.dataset.seen = 'false'; button.setAttribute('aria-expanded', 'false');
});
window.oceanDiveSummary = { open, close, get isOpen() { return dialog.open; }, get record() { return record; }, get latest() { return latest; } };
