import { SPECIES, portraitURL } from './field-guide.js';
import { SITES } from './journey.js';

// The logbook's Dive log page (archive.js, #dives): the visit's dives as the dive log keeps them (dive-log.js), one at a
// time, newest first, with View more logs at the top to turn to another. Each shows its numbers and depth profile, the
// sites reached, the animals seen and its photos, and opens the full dive log page (dive-summary.js).
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clock = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const two = n => String(n).padStart(2, '0');
const SHOW_SPECIES = 8, SHOW_PHOTOS = 4;

function sparkline(record) {
  const span = Math.max(1, record.time), floor = Math.max(10, Math.ceil((record.maxDepth + 2) / 10) * 10);
  const line = record.profile.map(([t, d], i) => `${i ? 'L' : 'M'}${(t / span * 300).toFixed(1)} ${(4 + d / floor * 52).toFixed(1)}`).join('');
  return `<svg class="dl-spark" viewBox="0 0 300 60" preserveAspectRatio="none" role="img" aria-label="Depth over ${clock(record.time)}, down to ${record.maxDepth.toFixed(1)} metres">
    <path d="${line}L300 4L0 4Z" class="dl-spark-fill"/><path d="${line}" class="dl-spark-line" vector-effect="non-scaling-stroke"/></svg>`;
}

function fill(root, number) {
  const dives = window.oceanDiveLog?.dives || [];
  const head = `<p class="holo-label">Dive log · This visit</p><h3 id="archive-entry-title">Dive log</h3>`;
  if (!dives.length) {
    root.innerHTML = `<header class="dl-head" data-rise>${head}</header><p class="dl-empty" data-rise>No dives yet on this visit. Dive in, and each dive's depth, sites, animals and photos are logged here when you come back up.</p>`;
    return;
  }
  const record = dives.find(item => item.number === number) || dives[dives.length - 1];
  const started = new Date(record.started), photos = (window.oceanDiveLog?.photos || []).filter(photo => photo.dive === record.number);
  const seen = SPECIES.filter(item => record.seen[item.id]).sort((a, b) => record.seen[a.id].t - record.seen[b.id].t);
  const sites = Object.keys(SITES).map(id => ({ id, ...SITES[id], visit: record.sites[id] }));
  const more = dives.length > 1 ? `<details class="dl-more"><summary class="holo-chip">View more logs <span aria-hidden="true">▾</span></summary><ul class="ds-more-list" aria-label="Your dives this visit">${[...dives].reverse().map(dive =>
    `<li><button type="button" data-number="${dive.number}" aria-current="${dive === record}"><b>Dive ${two(dive.number)}</b><span>${clock(dive.time)} · ${dive.maxDepth.toFixed(1)} m · ${Object.keys(dive.seen).length} species</span></button></li>`).join('')}</ul></details>` : '';
  root.innerHTML = `<header class="dl-head" data-rise><div>${head}<p class="dl-when">Dive ${two(record.number)} · ${started.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}, ${started.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p></div>${more}</header>
    <dl class="dl-stats" data-rise>
      <div><dt>Dive time</dt><dd>${clock(record.time)}</dd></div><div><dt>Max depth</dt><dd>${record.maxDepth.toFixed(1)} m</dd></div>
      <div><dt>Species</dt><dd>${seen.length} / ${SPECIES.length}</dd></div><div><dt>Photos</dt><dd>${photos.length}</dd></div>
      <div><dt>Safety stop</dt><dd>${record.safetyStop ? 'Done ✓' : 'Not made'}</dd></div></dl>
    <figure class="dl-profile" data-rise>${sparkline(record)}</figure>
    <section class="dl-block" data-rise><h4 class="holo-label">Sites</h4><ul class="dl-sites">${sites.map(site =>
      `<li data-done="${Boolean(site.visit)}" style="--signal:${site.signal}"><b>${site.name}</b><span>${site.visit ? `Reached at ${clock(site.visit.t)} · ${site.visit.depth.toFixed(0)} m` : 'Not reached on this dive'}</span></li>`).join('')}</ul></section>
    <section class="dl-block" data-rise><h4 class="holo-label">Animals seen</h4>${seen.length ? `<ul class="dl-species">${seen.slice(0, SHOW_SPECIES).map(item =>
      `<li><img src="${portraitURL(item.id)}" alt="" loading="lazy" decoding="async"><b>${esc(item.name)}</b><span>${record.seen[item.id].depth.toFixed(0)} m · ${esc(record.seen[item.id].place)}</span></li>`).join('')}</ul>${seen.length > SHOW_SPECIES ? `<p class="dl-note">And ${seen.length - SHOW_SPECIES} more in the full log.</p>` : ''}` : '<p class="dl-note">None counted on this dive. Animals count once they have been in view for a moment.</p>'}</section>
    ${photos.length ? `<section class="dl-block" data-rise><h4 class="holo-label">Photos</h4><ul class="dl-photos">${photos.slice(0, SHOW_PHOTOS).map(photo =>
      `<li><img src="${photo.url}" alt="Your photo at ${esc(photo.place)}, ${photo.depth.toFixed(0)} metres down" loading="lazy" decoding="async"></li>`).join('')}</ul>${photos.length > SHOW_PHOTOS ? `<p class="dl-note">And ${photos.length - SHOW_PHOTOS} more in the full log.</p>` : ''}</section>` : ''}
    <p class="dl-actions" data-rise><button type="button" class="holo-chip holo-chip--go" data-open-log="${record.number}">Open the full dive log <span aria-hidden="true">→</span></button></p>`;
}

export function diveLogPage() {
  const root = document.createElement('div');
  root.className = 'dl-page';
  fill(root);
  root.addEventListener('click', event => {
    const pick = event.target.closest('[data-number]');
    if (pick) { fill(root, Number(pick.dataset.number)); root.querySelector('.dl-more summary')?.focus(); return; }
    const open = event.target.closest('[data-open-log]');
    if (!open) return;
    const record = window.oceanDiveLog?.dives.find(item => item.number === Number(open.dataset.openLog));
    // The full page is a dialog of its own: the logbook steps aside for it.
    window.oceanArchive?.close();
    requestAnimationFrame(() => window.oceanDiveSummary?.open(record));
  });
  return [root];
}
