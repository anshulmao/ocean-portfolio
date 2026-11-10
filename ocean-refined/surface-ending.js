import { PORTFOLIO_CONTENT, PORTFOLIO_MEDIA } from './portfolio-content.js';
import { SITES } from './dive-log.js';
import { track } from './analytics.js';

// The ending. A dive used to end where it began: the hero again, with one new button. This is the card that meets the
// visitor back at the surface after a dive worth the name (dive-log.js hands the record over as `oceandivelog`): what
// the dive was, the work itself, and the ways to get in touch, so the last thing seen is the reason for the visit.
// It is not a dialog: nothing is blocked, the hero stays in reach beside it, and it goes when it is closed (its button,
// Escape) or when the next dive starts. Each dive brings it up once.
//   WORTH: a dive shorter than this (s) that reached no site is a dip, not a dive, and gets no card.
//   SETTLE: how long after the diver is back at the surface, with nothing else open, it comes up (ms).
const WORTH = 40, SETTLE = 900, WAIT = 250, GIVE_UP = 20000;
const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const WORK = PORTFOLIO_CONTENT.projects.entries.filter(entry => PORTFOLIO_MEDIA[entry.id]).slice(0, 3);
const links = PORTFOLIO_CONTENT.about.entries[0].links, linkTo = label => links.find(link => link.label === label)?.url;
const email = linkTo('Email'), linkedin = linkTo('LinkedIn');

const card = document.createElement('section');
card.className = 'surface-ending'; card.id = 'surface-ending'; card.hidden = true; card.setAttribute('aria-labelledby', 'surface-ending-title');
card.innerHTML = `<button type="button" class="surface-ending-close" data-ending="close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
  <p class="surface-ending-kicker"></p>
  <h2 id="surface-ending-title"></h2>
  <p class="surface-ending-line"></p>
  <ul class="surface-ending-work" aria-label="The work">${WORK.map(entry => `<li><button type="button" data-ending="project" data-project="${esc(entry.id)}">
    <img src="${esc(PORTFOLIO_MEDIA[entry.id].src)}" alt="" loading="lazy" decoding="async" width="96" height="60">
    <span><b>${esc(entry.title)}</b><small>${esc(entry.summary)}</small></span><i aria-hidden="true">→</i></button></li>`).join('')}</ul>
  <div class="surface-ending-actions">${email ? `<a class="surface-ending-primary" data-ending="email" href="${esc(email)}">Get in touch</a>` : ''}<button type="button" data-ending="resume">Résumé</button></div>
  <p class="surface-ending-more">${linkedin ? `<a data-ending="linkedin" href="${esc(linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}<button type="button" data-ending="log">Dive log</button><button type="button" data-ending="again">Dive again</button></p>`;
document.body.append(card);
const part = selector => card.querySelector(selector);

// Whether the dive just ended was the guided one, and whether it reached its ending (guided-dive.js writes its state
// on the body).
let toured = false, finished = false, timer = 0, waitedFor = 0;
new MutationObserver(() => {
  const status = document.body.dataset.tour;
  if (status && status !== 'off') toured = true;
  if (status === 'done') finished = true;
  if (document.body.dataset.submerged === 'true' || document.body.dataset.prelude === 'on') hide();
}).observe(document.body, { attributes: true, attributeFilter: ['data-tour', 'data-submerged', 'data-prelude'] });

function hide() { clearTimeout(timer); if (!card.hidden) { card.hidden = true; delete document.body.dataset.ending; } }
function fill(record) {
  const names = Object.keys(SITES), found = names.filter(id => record.sites?.[id]).length, seen = Object.keys(record.seen ?? {}).length;
  part('.surface-ending-kicker').textContent = `Back at the surface · ${clock(record.time)} · ${Math.round(record.maxDepth)} m`;
  part('h2').textContent = finished ? 'That’s the whole reef.' : 'Good dive.';
  const sites = found === names.length ? `You reached all ${names.length} sites` : found ? `You reached ${found} of ${names.length} sites` : 'The sites are still down there';
  part('.surface-ending-line').textContent = `${sites}${seen ? ` and met ${seen} species` : ''}. Here’s the work the reef is about.`;
  track('ending_shown', { sites: found, toured: toured ? 'yes' : 'no' });
}
// Up once the diver is back at the surface with nothing over it: the ascent done, no page or dialog open.
function settle(record) {
  const controls = window.oceanControls, busy = !controls || controls.getMode?.() !== 'surface' || controls.getTransition?.() || document.querySelector('dialog[open]') || document.body.dataset.menu === 'open';
  if (document.body.dataset.submerged === 'true') return;
  if (busy) { waitedFor += WAIT; if (waitedFor < GIVE_UP) timer = setTimeout(settle, WAIT, record); return; }
  fill(record); card.hidden = false; document.body.dataset.ending = 'true'; toured = finished = false;
}
addEventListener('oceandivelog', ({ detail }) => {
  hide();
  if (detail.time < WORTH && !Object.keys(detail.sites ?? {}).length) { toured = finished = false; return; }
  waitedFor = 0; timer = setTimeout(settle, SETTLE, detail);
});
card.addEventListener('click', event => {
  const action = event.target.closest('[data-ending]'); if (!action) return;
  const what = action.dataset.ending;
  // The mail and LinkedIn links are counted where every link is (analytics.js: contact_clicked).
  if (what !== 'email' && what !== 'linkedin') track('ending_action', { action: what, project_id: action.dataset.project });
  if (what === 'close') { hide(); document.getElementById('dive')?.focus({ preventScroll: true }); }
  else if (what === 'project') window.oceanArchive?.open?.('projects', action.dataset.project);
  else if (what === 'resume') window.oceanArchive?.open?.('resume');
  else if (what === 'log') window.oceanDiveSummary?.open?.();
  else if (what === 'again') { hide(); document.getElementById('dive')?.click(); }
});
addEventListener('keydown', event => {
  if (event.code !== 'Escape' || card.hidden || document.querySelector('dialog[open]') || document.body.dataset.menu === 'open') return;
  hide();
});
window.oceanEnding = { get shown() { return !card.hidden; }, hide };
