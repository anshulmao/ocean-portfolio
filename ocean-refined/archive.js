// The portfolio inside <dialog id="landmark-dialog">: About, Experience, Projects, Résumé, and the visit's own Dive
// log. Each section is its own page, reached from its own site on the reef (or a surface link, a deep link, the HUD
// button or window.oceanArchive). Nothing inside a section leads to another section: the reef is how you get about.
// Within Projects, the grid opens one case study at a time and the case study leads back to the grid, or to the
// project on either side. Every value shown comes from PORTFOLIO_CONTENT; the few derived figures (time in a
// role, the career track) are computed here from the dates stored with each entry. Nothing runs while the dialog
// is closed: a page is built when it is shown, and entry motion is CSS on the shared tokens in motion.css.
import { PORTFOLIO_CONTENT, PORTFOLIO_MEDIA } from './portfolio-content.js';
import { icon } from './ui-icons.js';
import { openLightbox, closeLightbox, lightboxOpen } from './archive-lightbox.js';
import { track as trackEvent } from './analytics.js';
import { diveLogPage } from './dive-log-page.js';

const panel = document.querySelector('#landmark-dialog');
const page = panel.querySelector('#archive-page');
const title = panel.querySelector('#landmark-title');
const place = panel.querySelector('#archive-place');
const live = panel.querySelector('#archive-live');

// `site` is the landmark the section is read at, `where` tells a reader where the other sections are found. The
// depths restate reef.js LANDMARKS (descriptions), kept here so reading never loads the world's modules.
export const SECTIONS = {
  about: { hash: 'profile', label: 'About', site: 'The anchor', where: 'the anchor on the shallow reef, 8 m down' },
  experience: { hash: 'log', label: 'Experience', site: 'The treasure', where: 'the treasure on the deep ledge, 45 m down' },
  projects: { hash: 'finds', label: 'Projects', site: 'The wreck', where: 'the wreck, 23 m down' },
  resume: { hash: 'resume', label: 'Résumé', site: 'One page', where: null },
  dives: { hash: 'dives', label: 'Dive log', site: 'This visit', where: null },
};
// The opening view, for callers with no section in mind (the HUD button, #records): About, which begins with who
// this is, how to reach them and the résumé.
export const GLANCE = 'about';
const ALIASES = { glance: 'about', records: 'about', card: 'about', work: 'projects' };
const SITES = ['about', 'experience', 'projects'];
const media = PORTFOLIO_MEDIA;
const picture = visual => el('img', { decoding: 'async', width: visual.width, height: visual.height, src: visual.src, alt: visual.alt });
const SAFE_LINK = /^(https:\/\/|mailto:|\.\/assets\/portfolio\/)/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = value => String(value).padStart(2, '0');

const glyphs = {
  previous: '<path d="m14 6-6 6 6 6"/>',
  next: '<path d="m10 6 6 6-6 6"/>',
  back: '<path d="M11 5 4 12l7 7M4 12h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  expand: '<path d="M4 10V4h6M20 14v6h-6M4 4l7 7M20 20l-7-7"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7Z"/>',
  mail: '<path d="M3 6h18v12H3ZM3 7l9 7 9-7"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11Z"/><circle cx="12" cy="10" r="2.2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  file: '<path d="M6 3h9l4 4v14H6V3ZM14 3v5h5"/>',
};
function glyph(name, className = 'hud-icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', className);
  svg.innerHTML = glyphs[name]; return svg;
}
function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}
const paragraphs = (list, className = null) => list.map(text => el('p', { class: className, text }));
const safeLinks = links => (links || []).filter(link => SAFE_LINK.test(link.url));
function anchorFor(link, className, ...children) {
  const anchor = el('a', { href: link.url, class: className }, ...children);
  if (link.download) anchor.download = 'Anshul-Ramprasad-Resume.pdf';
  else if (link.url.endsWith('.pdf')) { anchor.target = '_blank'; anchor.rel = 'noopener'; }
  if (link.url.startsWith('https:')) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  return anchor;
}
// Buttons share one shape with the surface controls (Dive in, Guided dive): a pill, filled when it is the action
// the page is for, outlined for the rest.
const pill = (link, primary = false) => anchorFor(link, `arc-pill${primary ? ' arc-pill--primary' : ''}`, el('span', { text: link.label }), icon(link.download ? 'download' : 'arrow'));
function pills(links, label) {
  const safe = safeLinks(links);
  return safe.length ? el('div', { class: 'arc-pills', role: 'group', 'aria-label': label }, safe.map((link, index) => pill(link, index === 0))) : null;
}
// Pictures open in the lightbox (archive-lightbox.js) rather than a new tab.
function figure(id, extraClass = '') {
  const visual = media[id];
  if (!visual) return null;
  return el('figure', { class: `arc-media ${extraClass}`.trim(), 'data-kind': visual.kind },
    el('button', { type: 'button', class: 'media-full', 'data-lightbox': id, 'aria-label': `Enlarge image: ${visual.caption}` },
      picture(visual), el('span', { class: 'arc-expand', 'aria-hidden': 'true' }, glyph('expand'))),
    el('figcaption', {}, el('span', { text: visual.caption }), visual.description && el('small', { text: visual.description })));
}
// Several screens of one project: a strip that scrolls sideways and snaps, swiped on touch, with arrows and dots.
// Each slide is a figure that opens in the lightbox. One screen alone is a plain figure.
function carousel(ids, label) {
  const slides = ids.map(id => figure(id, 'arc-slide')).filter(Boolean);
  if (!slides.length) return null;
  if (slides.length === 1) return el('div', { class: 'arc-case-visual' }, slides[0]);
  const track = el('div', { class: 'arc-carousel-track', 'data-scroll-x': true, tabindex: '0', role: 'group', 'aria-roledescription': 'carousel', 'aria-label': label }, slides);
  const dots = el('div', { class: 'arc-carousel-dots', role: 'tablist', 'aria-label': 'Screens' }, slides.map((slide, index) =>
    el('button', { type: 'button', role: 'tab', 'data-slide': index, 'aria-label': `Screen ${index + 1} of ${slides.length}: ${media[ids[index]].caption}`, 'aria-selected': String(index === 0) })));
  const count = el('span', { class: 'arc-carousel-count', text: `1 / ${slides.length}` });
  const root = el('div', { class: 'arc-carousel' }, track,
    el('div', { class: 'arc-carousel-bar' },
      el('button', { type: 'button', class: 'arc-carousel-arrow', 'data-slide-by': '-1', 'aria-label': 'Previous screen' }, glyph('previous')),
      dots, count,
      el('button', { type: 'button', class: 'arc-carousel-arrow', 'data-slide-by': '1', 'aria-label': 'Next screen' }, glyph('next'))));
  let at = 0, frame = 0;
  const mark = () => {
    frame = 0;
    const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (index === at) return;
    at = index; count.textContent = `${at + 1} / ${slides.length}`;
    dots.querySelectorAll('[role="tab"]').forEach((dot, i) => dot.setAttribute('aria-selected', String(i === at)));
    root.dataset.first = String(at === 0); root.dataset.last = String(at === slides.length - 1);
  };
  root.dataset.first = 'true'; root.dataset.last = 'false';
  track.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(mark); }, { passive: true });
  root.addEventListener('click', event => {
    const control = event.target.closest('[data-slide],[data-slide-by]');
    if (!control) return;
    const target = control.dataset.slide !== undefined ? Number(control.dataset.slide) : Math.min(slides.length - 1, Math.max(0, at + Number(control.dataset.slideBy)));
    track.scrollTo({ left: target * track.clientWidth, behavior: calm.matches ? 'auto' : 'smooth' });
  });
  return el('div', { class: 'arc-case-visual arc-case-visual--strip' }, root);
}
const calm = matchMedia('(prefers-reduced-motion: reduce)');
// Original diagrams explain a decision without inventing a product screenshot.
function diagram(entry) {
  const data = entry.diagram;
  if (!data) return null;
  return el('div', { class: 'arc-diagram', role: 'img', 'aria-label': `${data.label}: ${data.steps.join(', then ')}` },
    el('p', { class: 'arc-diagram-label', text: data.label }),
    el('ol', {}, data.steps.map((text, index) => el('li', {}, el('span', { 'aria-hidden': 'true', text: pad(index + 1) }), el('strong', { text })))),
    el('small', { text: data.caption }));
}
// A section's heading: the one large line, and one quiet line under it.
const head = (heading, strap, ...extra) => el('header', { class: 'arc-head' }, el('h3', { id: 'archive-entry-title', text: heading }), strap && el('p', { class: 'arc-strap', text: strap }), ...extra);
const submerged = () => Boolean(window.oceanDiagnostics?.submerged);
const returnLabel = () => submerged() ? 'Back to the reef' : 'Back to the surface';
// Read from the surface (the hero links, the surface nav, a deep link), the sheet links its sections together:
// tabs in the header, and the other sections at the foot of every page. On a dive each site shows only its own.
const LINKED = ['about', 'experience', 'projects', 'resume'];
const tabs = el('nav', { class: 'arc-tabs', 'aria-label': 'Sections', 'data-scroll-x': true }, LINKED.map(id =>
  el('button', { type: 'button', 'data-section': id, text: SECTIONS[id].label })));
panel.querySelector('.arc-place').after(tabs);
// The end of every page: the way out, and where the other sections are on the reef.
function foot(section) {
  const elsewhere = SITES.filter(id => id !== section);
  return el('footer', { class: 'arc-foot' },
    el('button', { type: 'button', class: 'arc-pill arc-pill--primary dialog-return' }, glyph('back'), el('span', { id: 'archive-return-label', text: returnLabel() }), el('kbd', { text: 'Esc' })),
    !submerged() && LINKED.includes(section) && el('div', { class: 'arc-next', role: 'group', 'aria-label': 'Other sections' }, LINKED.filter(id => id !== section).map(id =>
      el('button', { type: 'button', class: 'arc-pill', 'data-section': id }, el('span', { text: SECTIONS[id].label }), glyph('next')))),
    submerged() && elsewhere.length > 0 && SECTIONS[section].where && el('p', { class: 'arc-elsewhere' }, 'Also on this reef: ', elsewhere.flatMap((id, index) => [index ? ', and ' : '', el('b', { text: SECTIONS[id].label }), ` at ${SECTIONS[id].where}`]), '.'));
}

// Dates. Time in a role is derived only from the dates stored with each entry.
const monthIndex = value => { const [year, month] = value.split('-').map(Number); return year * 12 + month - 1; };
const monthLabel = value => { const [year, month] = value.split('-').map(Number); return `${MONTHS[month - 1]} ${year}`; };
const currentMonth = () => { const now = new Date(); return now.getFullYear() * 12 + now.getMonth(); };
function duration(months) {
  const years = Math.floor(months / 12), rest = months % 12;
  return [years && `${years} yr${years > 1 ? 's' : ''}`, rest && `${rest} mo`].filter(Boolean).join(' ') || 'Under 1 mo';
}
const roleEnd = entry => entry.end ? monthIndex(entry.end) : currentMonth();
// Roles newest first; entries without dates keep their written order after the dated ones.
function roles() {
  const entries = PORTFOLIO_CONTENT.experience.entries;
  return [...entries].sort((a, b) => (b.start ? monthIndex(b.start) : -1) - (a.start ? monthIndex(a.start) : -1));
}
const projects = () => PORTFOLIO_CONTENT.projects.entries.map((entry, index) => {
  const [kind, ...rest] = entry.tag.split(' · ');
  return { entry, number: index + 1, kind, status: rest.join(' · ') || null };
});

// Deep links. #profile, #log, #finds, #resume, #dives, and an entry: #log/product-manager, #finds/sage,
// #profile/rules (how I work), #profile/contact. #records and #glance open About.
export function resolveSection(name) {
  const key = String(name || '').toLowerCase();
  if (SECTIONS[key]) return key;
  if (ALIASES[key]) return ALIASES[key];
  return Object.keys(SECTIONS).find(id => SECTIONS[id].hash === key) || null;
}
export function parseHash(hash = location.hash) {
  let text = String(hash || '').replace(/^#/, '');
  try { text = decodeURIComponent(text); } catch {}
  const [name = '', entry = ''] = text.split('/'), id = resolveSection(name);
  return id ? { id, entry: entry || null } : null;
}
// The pages a section has: one each, except Projects, where every project is a page of its own after the grid.
// `anchor` is a place on the section's page (About and Experience are read as one page).
function stopsFor(id) {
  if (id === 'about') return [
    { section: id, id: 'overview', slug: null, aliases: ['card', 'overview', 'glance'], title: SECTIONS.about.label },
    { section: id, id: 'approach', slug: 'rules', aliases: ['approach', 'how'], anchor: '#arc-how', title: 'How I work' },
    { section: id, id: 'contact', slug: 'contact', aliases: [], anchor: '#arc-contact', title: 'Contact' },
  ];
  if (id === 'experience') return roles().map((entry, index) => ({ section: id, id: entry.id, slug: index ? entry.id : null, aliases: [entry.id], anchor: index ? `#arc-role-${entry.id}` : null, title: entry.title }));
  if (id === 'projects') return [{ section: id, id: 'all', slug: null, aliases: ['all', 'catalogue'], title: SECTIONS.projects.label },
    ...projects().map(find => ({ section: id, id: find.entry.id, slug: find.entry.id, aliases: [], title: find.entry.title }))];
  return [{ section: id, id, slug: null, aliases: [], title: SECTIONS[id].label }];
}
function findStop(id, entry) {
  const stops = stopsFor(id), key = String(entry ?? '').toLowerCase();
  return stops.find(stop => key && (stop.id === key || stop.slug === key || stop.aliases.includes(key))) || stops[0];
}
const hashFor = stop => SECTIONS[stop.section].hash + (stop.slug ? `/${stop.slug}` : '');
/** The shareable address of a page (the current one when called without arguments). */
export function linkFor(id = sectionId, entry = entryId) {
  return `${location.origin}${location.pathname}${location.search}#${hashFor(findStop(resolveSection(id) || GLANCE, entry))}`;
}
/** Every page, by section: { section, entry, hash, title }. */
export const stops = () => Object.keys(SECTIONS).flatMap(id => stopsFor(id).map(stop => ({ section: id, entry: stop.id, hash: hashFor(stop), title: stop.title })));

// --- About -----------------------------------------------------------------------------------------------------------
// Who this is first: the photo, the name, what they do and where, then the ways to reach them and the résumé.
// Then a short bio, then how they work, with the three places that shows in the projects.
function renderAbout() {
  const section = PORTFOLIO_CONTENT.about, card = section.entries[0], approach = section.entries.find(entry => entry.id === 'approach');
  const now = roles().find(entry => entry.start && !entry.end), art = media[card.id];
  const resume = safeLinks(PORTFOLIO_CONTENT.resume.entries[0]?.links).find(link => link.download);
  const contacts = safeLinks(card.links);
  const contactMark = link => link.url.startsWith('mailto:') ? glyph('mail') : /github\.com/.test(link.url) ? glyph('code') : icon('overview');
  const rules = (approach?.facts || []).map((fact, index) => ({ title: fact, text: approach.body[index] || null }));
  return [
    el('section', { class: 'arc-hero' },
      art && el('figure', { class: 'arc-portrait' }, picture(art)),
      el('div', { class: 'arc-hero-text' },
        el('h3', { id: 'archive-entry-title', text: `Hi, I’m ${card.name || 'Anshul'}.` }),
        (card.role || card.title) && el('p', { class: 'arc-hero-role', text: card.role || card.title }),
        el('ul', { class: 'arc-where', 'aria-label': 'Where and what' },
          card.base && el('li', {}, glyph('pin'), el('span', { text: card.base })),
          now && el('li', {}, icon('experience'), el('span', { text: `${now.title}${now.org ? ` at ${now.org}` : ''}` }))),
        // The guided dive's welcome, only while the tour is on (release/guided-dive/SPEC.md, D6).
        window.oceanTour?.welcome && el('p', { class: 'arc-welcome', text: window.oceanTour.welcome }),
        el('div', { class: 'arc-pills', id: 'arc-contact', role: 'group', 'aria-label': 'Contact and résumé' },
          resume && pill(resume, true),
          contacts.map(link => anchorFor(link, 'arc-pill', contactMark(link), el('span', { text: link.label })))))),
    el('section', { class: 'arc-bio', 'aria-labelledby': 'arc-bio-title' },
      el('h4', { id: 'arc-bio-title', text: 'In short' }),
      el('div', { class: 'arc-prose arc-prose--lead' }, el('p', { text: card.summary }), paragraphs(card.body))),
    approach && el('section', { class: 'arc-how', id: 'arc-how', 'aria-labelledby': 'arc-how-title' },
      el('div', { class: 'arc-how-head' }, el('h4', { id: 'arc-how-title', text: approach.tag || 'How I work' }), el('p', { class: 'arc-how-line', text: approach.title }), el('p', { class: 'arc-how-strap', text: approach.summary })),
      rules.length > 0 && el('ol', { class: 'arc-rules', 'aria-label': 'Working principles' }, rules.map((rule, index) =>
        el('li', {}, el('span', { class: 'arc-rule-no', 'aria-hidden': 'true', text: pad(index + 1) }), el('strong', { text: rule.title }), rule.text && el('p', { text: rule.text })))),
      approach.examples?.length > 0 && el('div', { class: 'arc-examples' },
        el('p', { class: 'arc-examples-label', text: 'What that looks like in the work' }),
        el('ul', {}, approach.examples.map(example => {
          const project = PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === example.project);
          return el('li', {}, el('strong', { text: example.title }), el('p', { text: example.text }), project && el('span', { class: 'arc-chip', text: project.title }));
        })))),
    foot('about'),
  ];
}

// --- Experience ------------------------------------------------------------------------------------------------------
// The whole career on one track, then each role, newest first, with its dates, what the work was and what it covered.
function careerTrack(list) {
  const dated = list.filter(entry => entry.start).sort((a, b) => monthIndex(a.start) - monthIndex(b.start));
  if (!dated.length) return null;
  const first = monthIndex(dated[0].start), last = Math.max(...dated.map(roleEnd)), span = Math.max(1, last - first);
  const at = month => `${((month - first) / span * 100).toFixed(2)}%`;
  const ongoing = dated.some(entry => !entry.end);
  const ticks = [];
  for (let month = Math.ceil((first + 1) / 12) * 12; month < last - 2; month += 12) ticks.push(month);
  return el('div', { class: 'arc-track', role: 'group', 'aria-label': `Career track, ${monthLabel(dated[0].start)} to ${ongoing ? 'present' : monthLabel(dated.at(-1).end)}` },
    el('div', { class: 'arc-track-bar' }, dated.map(entry =>
      el('button', { type: 'button', class: 'arc-track-seg', 'data-role': entry.id, 'data-now': !entry.end, style: `left:${at(monthIndex(entry.start))};width:${((roleEnd(entry) - monthIndex(entry.start)) / span * 100).toFixed(2)}%`,
        'aria-label': `${entry.title}, ${monthLabel(entry.start)} to ${entry.end ? monthLabel(entry.end) : 'present'}` }, el('span', { text: entry.title })))),
    el('div', { class: 'arc-track-axis', 'aria-hidden': 'true' },
      el('span', { 'data-edge': 'start', text: monthLabel(dated[0].start) }),
      // A year that sits close to an end label is dropped on a phone, where the two would overlap.
      ticks.map(month => el('span', { style: `left:${at(month)}`, 'data-tight': (month - first) / span < .16 || (last - month) / span < .16, text: String(month / 12) })),
      el('span', { 'data-edge': 'end', text: ongoing ? 'Present' : monthLabel(dated.at(-1).end) })),
    el('p', { class: 'arc-track-sum', text: `${dated.length} roles${dated.every(entry => entry.org === dated[0].org) && dated[0].org ? ` at ${dated[0].org}` : ''} · ${duration(last - first)}${ongoing ? ' and counting' : ''}` }));
}
function roleCard(entry) {
  const months = entry.start ? roleEnd(entry) - monthIndex(entry.start) : null;
  const stages = (entry.stages || []).filter(stage => stage.start && stage.end);
  const facts = entry.facts.filter(fact => !stages.some(stage => fact.startsWith(stage.label)) && fact !== entry.site);
  return el('article', { class: 'arc-role', id: `arc-role-${entry.id}`, 'data-role': entry.id, 'data-now': Boolean(entry.start && !entry.end), 'aria-labelledby': `arc-role-title-${entry.id}` },
    el('div', { class: 'arc-role-when' },
      el('span', { class: 'arc-role-dot', 'aria-hidden': 'true' }),
      entry.start ? [el('b', { text: `${monthLabel(entry.start)} — ${entry.end ? monthLabel(entry.end) : 'Present'}` }), el('span', { text: `${duration(months)}${entry.end ? '' : ' so far'}` })] : el('b', { text: entry.tag })),
    el('div', { class: 'arc-role-body' },
      el('h4', { id: `arc-role-title-${entry.id}`, text: entry.title }),
      el('p', { class: 'arc-role-org', text: [entry.org, entry.site].filter(Boolean).join(' · ') || entry.tag }),
      el('p', { class: 'arc-role-lead', text: entry.summary }),
      el('div', { class: 'arc-prose' }, paragraphs(entry.body)),
      stages.length > 0 && el('ul', { class: 'arc-stages', 'aria-label': 'Titles held' }, stages.map(stage => el('li', {}, el('b', { text: stage.label }), el('span', { text: `${monthLabel(stage.start)} — ${monthLabel(stage.end)}` })))),
      facts.length > 0 && el('ul', { class: 'arc-facts', 'aria-label': 'Covered' }, facts.map(text => el('li', {}, glyph('check'), el('span', { text })))),
      pills(entry.links, `${entry.title} links`)));
}
function renderExperience() {
  const section = PORTFOLIO_CONTENT.experience, list = roles();
  return [
    head(section.title, section.subtitle),
    careerTrack(list),
    el('div', { class: 'arc-roles' }, list.map(roleCard)),
    foot('experience'),
  ];
}

// --- Projects --------------------------------------------------------------------------------------------------------
// A field with the project's own colour, for a project with no screenshot: its steps are the picture.
function plate(find) {
  const data = find.entry.diagram;
  return el('span', { class: 'arc-plate', role: 'img', 'aria-label': `${find.entry.title}${data ? `: ${data.steps.join(', then ')}` : ''}` },
    icon(find.entry.id, 'arc-plate-icon'),
    data && el('span', { class: 'arc-plate-steps', 'aria-hidden': 'true' }, data.steps.map((text, index) => el('span', {}, el('b', { text: pad(index + 1) }), text))));
}
const thumb = find => media[find.entry.id] ? picture(media[find.entry.id]) : plate(find);
function findCard(find) {
  return el('li', {}, el('button', { type: 'button', class: 'arc-find', 'data-go': `finds/${find.entry.id}`, 'data-entry': find.entry.id },
    el('span', { class: 'arc-find-art' }, thumb(find)),
    el('span', { class: 'arc-find-text' },
      el('span', { class: 'arc-find-kind', text: find.kind }),
      el('strong', { text: find.entry.title }),
      el('span', { class: 'arc-find-line', text: find.entry.summary })),
    el('span', { class: 'arc-find-foot' }, find.status && el('span', { class: 'arc-chip', text: find.status }), el('span', { class: 'arc-find-open', 'aria-hidden': 'true' }, 'Read', glyph('next')))));
}
function renderProjects() {
  const section = PORTFOLIO_CONTENT.projects, list = projects();
  return [
    head(section.title, section.subtitle, el('p', { class: 'arc-count', text: `${list.length} projects · open one to read the story` })),
    el('ul', { class: 'arc-grid', 'aria-label': 'Projects' }, list.map(findCard)),
    foot('projects'),
  ];
}
// One case study: what it is, my part, the screens, then the problem, the decision, what came of it and the takeaway.
function renderProject(id) {
  const list = projects(), index = Math.max(0, list.findIndex(item => item.entry.id === id)), find = list[index], entry = find.entry, story = entry.caseStudy;
  const screens = [entry.id, ...(entry.gallery || [])].filter(id => media[id]);
  const visual = carousel(screens, `${entry.title} screens`), neighbours = [[list[index - 1], -1, 'Previous'], [list[index + 1], 1, 'Next']].filter(([target]) => target);
  return [
    el('nav', { class: 'arc-crumb', 'aria-label': 'Projects' },
      el('button', { type: 'button', class: 'arc-pill arc-pill--small', 'data-go': 'finds', 'data-focus': `.arc-find[data-entry="${entry.id}"]` }, glyph('back'), el('span', { text: 'All projects' })),
      el('span', { class: 'arc-crumb-count', text: `${find.number} of ${list.length}` })),
    el('header', { class: 'arc-head arc-head--case' },
      el('p', { class: 'arc-kind' }, el('span', { text: find.kind }), find.status && el('span', { class: 'arc-chip', text: find.status })),
      el('h3', { id: 'archive-entry-title', text: entry.title }),
      el('p', { class: 'arc-strap arc-strap--case', text: entry.summary }),
      story && el('p', { class: 'arc-role-line' }, el('span', { text: 'My role' }), el('b', { text: story.role }))),
    visual,
    visual && screens.length > 1 && (entry.galleryTitle || entry.galleryIntro) && el('p', { class: 'arc-strip-lead' }, entry.galleryTitle && el('b', { text: entry.galleryTitle }), entry.galleryIntro && ` ${entry.galleryIntro}`),
    story ? el('div', { class: 'arc-story' }, [['The problem', story.problem], ['The decision', story.decision], ['What came out of it', story.outcome], ['The takeaway', story.learning]].map(([label, text], step) =>
      el('section', { class: 'arc-block', 'aria-label': label }, el('h4', {}, el('span', { 'aria-hidden': 'true', text: pad(step + 1) }), label), el('p', { text }))))
      : el('div', { class: 'arc-prose arc-prose--lead' }, paragraphs(entry.body)),
    !visual && diagram(entry),
    visual && entry.diagram && el('div', { class: 'arc-case-diagram' }, diagram(entry)),
    (entry.body.length > 0 || entry.facts.length > 0) && story && el('details', { class: 'arc-more' },
      el('summary', {}, el('span', { text: 'More detail' }), glyph('next')),
      el('div', { class: 'arc-prose' }, paragraphs(entry.body)),
      entry.facts.length > 0 && el('ul', { class: 'arc-facts' }, entry.facts.map(text => el('li', {}, glyph('check'), el('span', { text }))))),
    pills(entry.links, `${entry.title} links`),
    story?.evidence && el('p', { class: 'arc-evidence' }, el('b', { text: 'About the evidence. ' }), story.evidence),
    neighbours.length > 0 && el('nav', { class: 'arc-turner', 'aria-label': 'Other projects' }, neighbours.map(([target, direction, word]) =>
      el('button', { type: 'button', class: `arc-turn arc-turn--${direction < 0 ? 'prev' : 'next'}`, 'data-go': `finds/${target.entry.id}`, 'data-turn': direction },
        el('span', { class: 'arc-turn-art', 'aria-hidden': 'true' }, thumb(target)),
        el('span', { class: 'arc-turn-text' }, el('span', { text: `${word} project` }), el('strong', { text: target.entry.title })),
        glyph(direction < 0 ? 'previous' : 'next')))),
    foot('projects'),
  ];
}

// --- Résumé ----------------------------------------------------------------------------------------------------------
function renderResume() {
  const section = PORTFOLIO_CONTENT.resume, entry = section.entries[0], links = safeLinks(entry.links), others = safeLinks(entry.alternatives);
  return [
    el('div', { class: 'arc-resume' },
      figure(entry.id, 'arc-media--document'),
      el('div', { class: 'arc-resume-text' },
        head(SECTIONS.resume.label, entry.summary),
        entry.facts.length > 0 && el('p', { class: 'arc-resume-meta', text: entry.facts.join(' · ') }),
        el('div', { class: 'arc-prose' }, paragraphs(entry.body)),
        pills(links, 'Résumé'),
        others.length > 0 && el('div', { class: 'arc-versions' },
          el('p', { class: 'arc-versions-label', text: 'Other versions, by role' }),
          el('ul', {}, others.map(link => el('li', {}, anchorFor(link, null, glyph('file'), el('span', { text: link.label }), icon('download')))))),
        el('button', { type: 'button', class: 'arc-textlink', 'data-print': true }, glyph('print'), 'Print a one-page summary of this portfolio'))),
    foot('resume'),
  ];
}

function render(stop) {
  if (stop.section === 'about') return renderAbout();
  if (stop.section === 'experience') return renderExperience();
  if (stop.section === 'resume') return renderResume();
  if (stop.section === 'dives') return [...diveLogPage(), foot('dives')];
  return stop.id === 'all' ? renderProjects() : renderProject(stop.id);
}

// --- Showing a page --------------------------------------------------------------------------------------------------
let sectionId = GLANCE, entryId = 'overview', rendered = null, renderedIndex = 0, announced = null;
const viewKey = stop => stop.section === 'projects' ? `projects:${stop.id}` : stop.section;
function paint(stop) {
  const meta = SECTIONS[stop.section];
  title.textContent = meta.label; place.textContent = meta.site;
  panel.dataset.section = stop.section; panel.dataset.entry = stop.id; panel.dataset.mode = submerged() ? 'dive' : 'surface';
  for (const tab of tabs.children) { if (tab.dataset.section === stop.section) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current'); }
  if (!panel.open) return;
  // The address names the page being read, without adding history entries or waking other hash listeners.
  try { history.replaceState(history.state, '', `#${hashFor(stop)}`); } catch {}
  const line = stop.section === 'projects' && stop.id !== 'all' ? `${meta.label}: ${stop.title}.` : `${meta.label}.`;
  if (line !== announced) live.textContent = announced = line;
}
/** Shows a section, and one of its entries. Unknown ids fall back to About, or to the section's first page. */
export function show(id = sectionId, entry = null, options = {}) {
  id = resolveSection(id) || GLANCE;
  closeLightbox();
  const stop = findStop(id, entry), key = viewKey(stop), index = stopsFor(id).indexOf(stop);
  if (key !== rendered) {
    trackEvent('portfolio_section_opened', { section: stop.section, project_id: stop.section === 'projects' && stop.id !== 'all' ? stop.id : undefined });
    if (stop.section === 'projects' && stop.id !== 'all') trackEvent('project_opened', { project_id: stop.id, experience: 'ocean' });
  }
  const inside = page.contains(document.activeElement) && !options.focus;
  sectionId = stop.section; entryId = stop.id;
  // The Dive log changes with every dive, so it is drawn afresh each time it is shown.
  if (key !== rendered || options.force || stop.section === 'dives') {
    const sameSection = rendered?.split(':')[0] === stop.section;
    // The way a page arrives says where it came from: opened, deeper into a project, back out to the grid, or across to
    // the project on either side.
    page.dataset.enter = !sameSection || options.still ? 'open' : stop.id === 'all' ? 'back' : rendered === 'projects:all' ? 'deeper' : index > renderedIndex ? 'next' : 'previous';
    page.replaceChildren(el('div', { class: 'arc-view' }, ...render(stop).flat().filter(Boolean)));
    page.setAttribute('aria-label', `${SECTIONS[stop.section].label}: ${page.querySelector('#archive-entry-title')?.textContent || ''}`);
    rendered = key; renderedIndex = index;
    if (options.scroll !== false) page.scrollTop = 0;
    if (inside) page.focus({ preventScroll: true });
  } else if (!stop.anchor && options.scroll !== false) page.scrollTop = 0;
  // A place on the page (a role, how I work, contact) is scrolled to and, for a role, lit.
  for (const node of page.querySelectorAll('[data-current]')) delete node.dataset.current;
  if (stop.anchor) {
    const target = page.querySelector(stop.anchor);
    if (target) { if (stop.section === 'experience') target.dataset.current = 'true'; target.scrollIntoView({ block: 'start', behavior: 'auto' }); }
  }
  paint(stop);
  if (options.focus) page.querySelector(options.focus)?.focus({ preventScroll: true });
}
/** Within Projects: the project on either side of the one being read (1 next, -1 previous). */
export function step(direction) {
  if (sectionId !== 'projects' || entryId === 'all') return false;
  const list = stopsFor('projects'), index = list.findIndex(stop => stop.id === entryId), target = list[index + direction];
  if (!target || target.id === 'all') return false;
  show('projects', target.id); return true;
}
function go(hash, options) {
  const target = parseHash(hash);
  if (target) show(target.id, target.entry, options);
}
export const current = () => ({ section: sectionId, entry: entryId });
/** Called when the dialog closes: the address stops naming a page, and nothing is left open on top. */
export function leave() {
  closeLightbox(); clearPrint();
  try { if (parseHash()) history.replaceState(history.state, '', `${location.pathname}${location.search}`); } catch {}
  announced = null; live.textContent = '';
}

// --- Printing --------------------------------------------------------------------------------------------------------
// The browser prints a plain, ink-friendly summary (profile, roles, projects) built from the same content, styled by
// archive-print.css. It exists only between beforeprint and afterprint.
let sheet = null;
function printable() {
  const content = PORTFOLIO_CONTENT, card = content.about.entries[0], rules = content.about.entries.find(entry => entry.id === 'approach');
  const base = card.base ? `Based in ${card.base}` : null, home = `${location.origin}${location.pathname}`;
  const where = link => link.url.replace(/^mailto:|^https:\/\/(www\.)?/, '').replace(/\/$/, '').replace(/^\.\//, home.replace(/[^/]*$/, ''));
  const inline = (links, label) => safeLinks(links).length ? el('p', { class: 'arc-print-links' }, label && el('b', { text: `${label} ` }), safeLinks(links).flatMap((link, index) => [index ? ' · ' : '', `${link.label}: `, el('a', { href: link.url, text: where(link) })])) : null;
  const facts = (items, label) => items.length ? el('p', { class: 'arc-print-facts' }, el('b', { text: `${label}: ` }), items.join(' · ')) : null;
  return el('div', { id: 'arc-print-sheet', class: 'arc-print' },
    el('header', {},
      el('p', { class: 'arc-print-kicker', text: `Anshul Ramprasad · Portfolio${card.tag ? ` · ${card.tag}` : ''}` }),
      el('h1', { text: card.name ? `${card.name} · ${card.title}` : card.title }),
      el('p', { class: 'arc-print-lead', text: card.summary }),
      el('p', { class: 'arc-print-meta', text: [content.about.subtitle, base].filter(Boolean).join(' · ') }),
      inline(card.links)),
    el('section', {}, el('h2', { text: SECTIONS.about.label }), paragraphs(card.body), facts(card.facts.filter(fact => fact !== base), 'Focus'),
      rules && [el('h3', { text: `How I work · ${rules.title}` }), el('p', { text: rules.summary }), el('ol', {}, rules.facts.map(text => el('li', { text }))), ...paragraphs(rules.body)]),
    el('section', {}, el('h2', { text: `${SECTIONS.experience.label} · ${content.experience.subtitle}` }), roles().map(entry => {
      const months = entry.start ? roleEnd(entry) - monthIndex(entry.start) : null;
      return el('article', {},
        el('h3', {}, entry.title, el('span', { text: [entry.tag, months !== null && `${duration(months)}${entry.end ? '' : ' to date'}`].filter(Boolean).join(' · ') })),
        el('p', { text: entry.summary }), paragraphs(entry.body.filter(text => text !== entry.summary)), facts(entry.facts, 'Covered'), inline(entry.links));
    })),
    el('section', {}, el('h2', { text: `${SECTIONS.projects.label} · ${content.projects.subtitle}` }), projects().map(find =>
      el('article', {},
        el('h3', {}, find.entry.title, el('span', { text: find.entry.tag })),
        el('p', { class: 'arc-print-lead', text: find.entry.summary }), paragraphs(find.entry.body), facts(find.entry.facts, 'Highlights'), inline(find.entry.links)))),
    el('footer', {}, content.resume.entries.map(entry => inline(entry.links.filter(link => !link.download), `${SECTIONS.resume.label} · ${entry.facts.join(' · ')}.`)),
      el('p', { text: `Printed from ${home}` })));
}
function preparePrint() {
  if (sheet) return;
  if (!document.querySelector('link[href*="archive-print.css"]')) document.head.append(el('link', { rel: 'stylesheet', media: 'print', href: new URL('./archive-print.css', import.meta.url).href }));
  sheet = printable(); document.body.append(sheet); document.documentElement.classList.add('arc-printing');
}
function clearPrint() {
  sheet?.remove(); sheet = null; document.documentElement.classList.remove('arc-printing');
}
/** Prints (or saves as PDF) the one-to-two page summary. */
export function print() { preparePrint(); window.print(); }
addEventListener('beforeprint', () => { if (panel.open) preparePrint(); });
addEventListener('afterprint', clearPrint);

// --- Listeners -------------------------------------------------------------------------------------------------------
page.addEventListener('click', event => {
  const control = event.target.closest?.('[data-go],[data-lightbox],[data-print],[data-role],[data-section]');
  if (!control || !page.contains(control)) return;
  if (control.dataset.lightbox) openLightbox(panel, media[control.dataset.lightbox], control);
  else if (control.dataset.section) show(control.dataset.section, null, { focus: '#archive-entry-title' });
  else if (control.dataset.print !== undefined) print();
  else if (control.dataset.go) go(control.dataset.go, { focus: control.dataset.focus });
  else if (control.matches('.arc-track-seg')) show('experience', control.dataset.role, { focus: `#arc-role-${control.dataset.role} h4` });
});
// Left and right turn between projects while a case study is open. The dialog owns the arrow keys while it is open
// either way, so the scene behind never turns.
document.addEventListener('keydown', event => {
  if (!panel.open || !['ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (lightboxOpen() || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
  event.preventDefault(); event.stopPropagation(); step(event.key === 'ArrowRight' ? 1 : -1);
});
// A quick, clearly sideways swipe on a case study turns to the project beside it. It never starts on something that
// scrolls sideways itself or at the screen edge (the system's back gesture), and the listeners are passive.
let swipe = null;
page.addEventListener('touchstart', event => {
  const touch = event.touches[0];
  swipe = event.touches.length === 1 && touch.clientX > 24 && touch.clientX < innerWidth - 24 && !event.target.closest?.('[data-scroll-x],input,select,textarea')
    ? { x: touch.clientX, y: touch.clientY, time: event.timeStamp } : null;
}, { passive: true });
page.addEventListener('touchend', event => {
  if (!swipe) return;
  const touch = event.changedTouches[0], dx = touch.clientX - swipe.x, dy = touch.clientY - swipe.y, quick = event.timeStamp - swipe.time < 700;
  swipe = null;
  if (quick && Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 2 && !String(getSelection?.() || '') && !lightboxOpen()) step(dx < 0 ? 1 : -1);
}, { passive: true });
page.addEventListener('touchcancel', () => { swipe = null; }, { passive: true });
tabs.addEventListener('click', event => { const tab = event.target.closest('[data-section]'); if (tab) show(tab.dataset.section, null, { focus: '#archive-entry-title' }); });
