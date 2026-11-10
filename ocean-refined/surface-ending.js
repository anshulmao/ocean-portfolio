import { PORTFOLIO_CONTENT } from './portfolio-content.js';
import { SITES } from './dive-log.js';
import { SPECIES, portraitURL } from './field-guide.js';
import { track } from './analytics.js';

// The ending: the dive log in small, as a page of the diver's own card. A dive used to end on the hero again, with a
// Dive log button added to it. Now, back at the surface (dive-log.js hands the record over as `oceandivelog`), the
// card over the diver (diver-profile.js) gains a Last dive page: the dive's numbers, its depth profile and the animals
// met, and the way into the full log (dive-summary.js). After a dive worth the name the card opens on that page by
// itself; it is the same card, in the same place, that a click on the diver opens, and its tabs turn back to About me.
// Closed, it is a click on the diver away, and the hero's Dive log button is there as before.
//   WORTH: a dive shorter than this (s) that reached no site is a dip, not a dive: the page is there, but the card
//          does not open by itself.
//   SETTLE: how long after the diver is back at the surface, with nothing else open, it opens (ms).
//   FACES: how many of the animals met are shown, the newest to the visitor first.
const WORTH = 40, SETTLE = 900, WAIT = 250, GIVE_UP = 20000, FACES = 6;
const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const email = PORTFOLIO_CONTENT.about.entries[0].links.find(link => link.label === 'Email')?.url;

const card = document.createElement('div');
card.className = 'surface-ending';
card.innerHTML = `<p class="surface-ending-kicker"></p>
  <h2 id="surface-ending-title"></h2>
  <dl class="surface-ending-tiles"></dl>
  <svg class="surface-ending-profile" viewBox="0 0 320 56" preserveAspectRatio="none" role="img" aria-label="Depth over the dive"><path class="fill"/><path class="line"/></svg>
  <p class="surface-ending-line"></p>
  <ul class="surface-ending-faces" aria-label="Animals met on this dive"></ul>
  <div class="surface-ending-actions"><button type="button" class="surface-ending-primary" data-ending="log">Open dive log</button><button type="button" data-ending="again">Dive again</button></div>
  <p class="surface-ending-more"><button type="button" data-ending="work">See the work</button>${email ? `<a data-ending="email" href="${esc(email)}">Get in touch</a>` : ''}</p>`;
const part = selector => card.querySelector(selector);

// Whether the dive just ended was the guided one, and whether it reached its ending (guided-dive.js writes its state
// on the body).
let toured = false, finished = false, timer = 0, waitedFor = 0;
new MutationObserver(() => {
  const status = document.body.dataset.tour;
  if (status && status !== 'off') toured = true;
  if (status === 'done') finished = true;
  if (document.body.dataset.submerged === 'true' || document.body.dataset.prelude === 'on') clearTimeout(timer);
}).observe(document.body, { attributes: true, attributeFilter: ['data-tour', 'data-submerged', 'data-prelude'] });

const profile = () => window.oceanProfile;
const shown = () => Boolean(profile()?.isOpen && profile().page === 'dive');
function hide() { clearTimeout(timer); if (shown()) profile().close(false); }
function fill(record) {
  const names = Object.keys(SITES), reached = names.filter(id => record.sites?.[id]), missed = names.filter(id => !record.sites?.[id]);
  const met = Object.keys(record.seen ?? {});
  part('.surface-ending-kicker').textContent = `Dive ${record.number} · back at the surface`;
  part('h2').textContent = finished ? 'That’s the whole reef.' : 'Good dive.';
  part('.surface-ending-tiles').innerHTML = [['Dive time', clock(record.time)], ['Max depth', `${record.maxDepth.toFixed(1)}<small> m</small>`],
    ['Sites', `${reached.length}<small> / ${names.length}</small>`], ['Species', `${met.length}<small> / ${SPECIES.length}</small>`]]
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
  // The depth profile: time across, depth down, as on the log's own chart.
  const profile = record.profile ?? [], span = Math.max(1, record.time), deep = Math.max(1, record.maxDepth);
  const points = profile.map(([t, d]) => `${(t / span * 320).toFixed(1)},${(3 + d / deep * 50).toFixed(1)}`);
  part('.surface-ending-profile .line').setAttribute('d', points.length > 1 ? `M${points.join('L')}` : '');
  part('.surface-ending-profile .fill').setAttribute('d', points.length > 1 ? `M0,3L${points.join('L')}L320,3Z` : '');
  part('.surface-ending-profile').style.display = points.length > 1 ? '' : 'none';
  // What is still down there is the reason to dive again.
  const line = part('.surface-ending-line');
  line.textContent = missed.length ? `Still down there: ${missed.map(id => SITES[id].name).join(' and ')}.` : record.safetyStop ? 'Every site reached, and the safety stop made.' : 'Every site reached.';
  // The animals met, the ones new to this visitor first; the rest are counted.
  const known = met.filter(id => SPECIES.some(item => item.id === id)).sort((a, b) => Number(Boolean(record.seen[b].fresh)) - Number(Boolean(record.seen[a].fresh)));
  const faces = part('.surface-ending-faces');
  faces.innerHTML = known.slice(0, FACES).map(id => `<li><img src="${esc(portraitURL(id))}" alt="${esc(SPECIES.find(item => item.id === id).name)}" title="${esc(SPECIES.find(item => item.id === id).name)}" loading="lazy" decoding="async" width="44" height="44"></li>`).join('')
    + (known.length > FACES ? `<li class="more">+${known.length - FACES}</li>` : '');
  faces.hidden = !known.length;
  return reached.length;
}
// Opened once the diver is back at the surface with nothing over it: the ascent done, no page or dialog open.
function settle(sites) {
  const controls = window.oceanControls, busy = !controls || controls.getMode?.() !== 'surface' || controls.getTransition?.() || document.querySelector('dialog[open]') || document.body.dataset.menu === 'open';
  if (document.body.dataset.submerged === 'true') return;
  if (busy) { waitedFor += WAIT; if (waitedFor < GIVE_UP) timer = setTimeout(settle, WAIT, sites); return; }
  if (profile()?.open('dive')) track('ending_shown', { sites, toured: toured ? 'yes' : 'no' });
  toured = finished = false;
}
addEventListener('oceandivelog', ({ detail }) => {
  clearTimeout(timer);
  if (!profile()?.setDive) return;
  const sites = fill(detail); profile().setDive(card);
  if (detail.time < WORTH && !sites) { toured = finished = false; return; }
  waitedFor = 0; timer = setTimeout(settle, SETTLE, sites);
});
card.addEventListener('click', event => {
  const action = event.target.closest('[data-ending]'); if (!action) return;
  const what = action.dataset.ending;
  // The mail link is counted where every link is (analytics.js: contact_clicked).
  if (what !== 'email') track('ending_action', { action: what });
  if (what === 'email') return;
  // Whatever is chosen opens over the surface, or starts a dive: the card steps aside for it.
  profile()?.close(false);
  if (what === 'log') window.oceanDiveSummary?.open?.();
  else if (what === 'work') window.oceanArchive?.open?.('projects');
  else if (what === 'again') document.getElementById('dive')?.click();
});
window.oceanEnding = { get shown() { return shown(); }, hide };
