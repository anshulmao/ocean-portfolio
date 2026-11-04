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
  about: { hash: 'profile', label: 'About', site: 'The helmet', where: 'the diver’s helmet on the shallow reef, 8 m down' },
  experience: { hash: 'log', label: 'Experience', site: 'The nautilus', where: 'the nautilus on the deep ledge, 45 m down' },
  projects: { hash: 'finds', label: 'Projects', site: 'The nursery', where: 'the coral nursery, 23 m down' },
  resume: { hash: 'resume', label: 'Résumé', site: 'One page', where: 'the slate on the descent line, 5 m down' },
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
const tabPill = el('i', { class: 'arc-tab-pill', 'aria-hidden': 'true' });
tabs.prepend(tabPill);
panel.querySelector('.arc-place').after(tabs);
// The highlight glides to the section being read: it is placed from the tab's own box, and the first placement is not animated.
function placeTabPill() {
  const tab = tabs.querySelector('[aria-current]');
  if (!tab || !tab.offsetWidth) return;
  tabPill.style.setProperty('--x', `${tab.offsetLeft}px`); tabPill.style.setProperty('--w', `${tab.offsetWidth}px`);
  if (!tabPill.dataset.ready) requestAnimationFrame(() => { tabPill.dataset.ready = 'true'; });
  if (tabs.scrollWidth > tabs.clientWidth + 1) tabs.scrollTo({ left: tab.offsetLeft - (tabs.clientWidth - tab.offsetWidth) / 2, behavior: tabPill.dataset.ready ? 'smooth' : 'auto' });
}
// The end of every page: the way out, and where the other sections are on the reef.
function foot(section) {
  const elsewhere = SITES.filter(id => id !== section);
  return el('footer', { class: 'arc-foot' },
    el('button', { type: 'button', class: 'arc-pill arc-pill--primary dialog-return' }, glyph('back'), el('span', { id: 'archive-return-label', text: returnLabel() }), el('kbd', { text: 'Esc' })),
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
// The story under the hero is one stage. Scrolling moves through its three chapters in place (who I am in short, how
// I work, what that looks like in the work): the words of the first light up as you read, the principles of the second
// and the examples of the third take the light one at a time, and a rail beside them (above them on a phone) fills as
// you go and jumps to a chapter when pressed. Without script, with reduced motion, or on a screen too short to hold a
// chapter, the same chapters are simply stacked and fully lit.
let wordNo = 0;
const spoken = text => { const p = el('p'); text.split(' ').forEach((word, index, all) => { p.append(el('span', { class: 'w', style: `--i:${wordNo++}`, text: word })); if (index < all.length - 1) p.append(' '); }); return p; };
function chapter(id, label, ...children) {
  return el('article', { class: 'arc-chapter', id, 'aria-labelledby': `${id}-label` }, el('h4', { class: 'arc-chapter-label', id: `${id}-label`, text: label }), ...children);
}
function renderAbout() {
  wordNo = 0;
  const section = PORTFOLIO_CONTENT.about, card = section.entries[0], approach = section.entries.find(entry => entry.id === 'approach');
  const now = roles().find(entry => entry.start && !entry.end), art = media[card.id];
  const resume = safeLinks(PORTFOLIO_CONTENT.resume.entries[0]?.links).find(link => link.download);
  const contacts = safeLinks(card.links);
  const contactMark = link => link.url.startsWith('mailto:') ? glyph('mail') : /github\.com/.test(link.url) ? glyph('code') : icon('overview');
  const rules = (approach?.facts || []).map((fact, index) => ({ title: fact, text: approach.body[index] || null }));
  const examples = approach?.examples || [];
  const chapters = [
    chapter('arc-short', 'In short',
      el('p', { class: 'arc-lead', text: card.summary }), el('div', { class: 'arc-spoken' }, card.body.map(spoken))),
    approach && chapter('arc-how', approach.tag || 'How I work',
      el('p', { class: 'arc-chapter-title', text: approach.title }), el('p', { class: 'arc-chapter-strap', text: approach.summary }),
      rules.length > 0 && el('ol', { class: 'arc-focus', 'aria-label': 'Working principles' }, rules.map(rule => el('li', {}, el('strong', { text: rule.title }), rule.text && el('p', { text: rule.text }))))),
    examples.length > 0 && chapter('arc-work', 'In the work',
      el('p', { class: 'arc-chapter-title', text: 'What that looks like in the work' }),
      el('ul', { class: 'arc-focus', 'aria-label': 'In the work' }, examples.map(example => {
        const project = PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === example.project);
        return el('li', {}, el('strong', { text: example.title }), el('p', { text: example.text }), project && el('span', { class: 'arc-chip', text: project.title }));
      }))),
  ].filter(Boolean);
  return [
    el('section', { class: 'arc-hero' },
      art && el('figure', { class: 'arc-portrait' }, picture(art)),
      el('div', { class: 'arc-hero-text' },
        el('h3', { id: 'archive-entry-title', text: `Hi, I’m ${card.name || 'Anshul'}.` }),
        (card.role || card.title) && el('p', { class: 'arc-hero-role', text: card.role || card.title }),
        el('ul', { class: 'arc-where', 'aria-label': 'Where and what' },
          card.base && el('li', {}, glyph('pin'), el('span', { text: card.base })),
          now && el('li', {}, icon('experience'), el('span', { text: `${now.title}${now.org ? ` at ${now.org}` : ''}` })))),
      // The guided dive's welcome, only while the tour is on (release/guided-dive/SPEC.md, D6).
      window.oceanTour?.welcome && el('p', { class: 'arc-welcome', text: window.oceanTour.welcome }),
      el('div', { class: 'arc-pills arc-actions', id: 'arc-contact', role: 'group', 'aria-label': 'Résumé and contact' },
        resume && pill(resume, true),
        contacts.map(link => anchorFor(link, 'arc-pill arc-pill--contact', contactMark(link), el('span', { text: link.label }))))),
    el('section', { class: 'arc-tale', 'data-pinned': 'false', 'aria-label': 'About me, in three parts' },
      el('div', { class: 'arc-stage' },
        el('nav', { class: 'arc-story-rail', 'aria-label': 'Parts of the story' }, chapters.map((item, index) =>
          el('button', { type: 'button', class: 'arc-rail-stop', 'data-stop': index }, el('i', { 'aria-hidden': 'true' }), el('span', { text: item.querySelector('.arc-chapter-label').textContent })))),
        el('div', { class: 'arc-layers' }, chapters))),
    foot('about'),
  ];
}

// The stage's controller. The stage is pinned while the track under it scrolls, and the scroll goes one chapter at a time: a
// chapter plays through by itself (in time, not with the scroll) and then rests with everything lit; the next scroll in either
// direction moves to the next chapter and the scroll comes to rest on it. Pressing a stop on the rail goes straight to its
// chapter. Nothing is shown half-way.
const story = { el: null, n: 0, top: 0, step: 0, range: 0, on: false, layers: [], stops: [], cur: -1, rest: 0, timer: 0, from: null, last: 0, auto: false, touching: false, raf: 0 };
const clamp01 = value => Math.min(1, Math.max(0, value));
const PACE = .7, SETTLE = 130;
function armStory() {
  clearTimeout(story.timer); story.timer = 0; story.from = null; story.auto = false;
  story.el = page.querySelector('.arc-tale'); story.on = false; story.cur = -1; story.rest = 0;
  if (!story.el) return;
  story.layers = [...story.el.querySelectorAll('.arc-chapter')]; story.n = story.layers.length;
  story.stops = [...story.el.querySelectorAll('.arc-rail-stop')];
  measureStory(); showChapter(0, false);
  // The first chapter plays when the stage first comes into view.
  if ('IntersectionObserver' in window) {
    const watch = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { watch.disconnect(); if (story.on && story.el?.isConnected) showChapter(Math.max(0, chapterAt()), true); } }, { root: page, threshold: .5 });
    watch.observe(story.el.querySelector('.arc-stage'));
  }
  document.fonts?.ready.then(() => { measureStory(); });
}
function measureStory() {
  const root = story.el;
  if (!root?.isConnected) return;
  const height = page.clientHeight, rail = root.querySelector('.arc-story-rail');
  // The chapters are measured stacked, with the rail showing, to see whether the tallest fits the screen.
  root.dataset.pinned = 'measure'; root.style.removeProperty('--stage'); root.style.removeProperty('--track'); root.style.removeProperty('--lift');
  const need = Math.max(...story.layers.map(layer => layer.offsetHeight)) + (rail.offsetWidth > 400 ? rail.offsetHeight + 24 : 0) + 72;
  const pin = !calm.matches && height >= 480 && need <= height && story.n > 1;
  if (pin) {
    // The stage is as tall as its tallest chapter needs and sits a little above the middle of the screen while pinned, so the
    // last chapter is followed straight by the end of the page.
    const stage = Math.round(need + 16);
    story.step = Math.round(height * PACE); story.range = story.step * (story.n - 1);
    root.style.setProperty('--stage', `${stage}px`); root.style.setProperty('--lift', `${Math.max(0, Math.round((height - stage) * .4))}px`);
    root.style.setProperty('--track', `${stage + story.range}px`);
  }
  root.dataset.pinned = String(pin); story.on = pin;
  story.top = offsetWithin(root); story.last = page.scrollTop - story.top;
}
// An element's distance from the top of the page's scrolling content, from layout (not affected by the sheet's opening scale).
function offsetWithin(node) { let y = 0; for (let n = node; n && n !== page; n = n.offsetParent) y += n.offsetTop; return y; }
// The chapter the scroll is on: the nearest resting place.
const chapterAt = (y = page.scrollTop - story.top) => Math.min(story.n - 1, Math.max(0, Math.round(y / story.step)));
function showChapter(index, play) {
  if (index === story.cur && !play) return;
  story.cur = index;
  story.layers.forEach((layer, i) => {
    layer.dataset.pos = i < index ? 'before' : i > index ? 'after' : 'current';
    if (i === index) { layer.dataset.live = 'false'; if (play) requestAnimationFrame(() => { layer.dataset.live = 'true'; }); }
  });
  story.stops.forEach((stop, i) => { stop.dataset.state = i < index ? 'done' : i === index ? 'now' : 'next'; if (i === index) stop.setAttribute('aria-current', 'step'); else stop.removeAttribute('aria-current'); });
}
function paintStory() {
  if (!story.el?.isConnected || !story.on || story.cur < 0) return;
  const index = chapterAt();
  if (index !== story.cur) showChapter(index, true);
}
// Where in the page's scroll a chapter rests.
const storyTarget = index => story.top + index * story.step;
function goToChapter(index, smooth = true) {
  story.auto = true; story.rest = index;
  page.scrollTo({ top: storyTarget(index), behavior: smooth && !calm.matches ? 'smooth' : 'auto' });
}
// Called on every scroll event of the page. When the scroll has gone quiet it is brought to a resting place: one chapter on
// from where the gesture began (or back to where it began, if it did not go far), never two at once.
function storyScrolled() {
  if (!story.on) return;
  const y = page.scrollTop - story.top;
  if (!story.from) story.from = { y: story.last, index: story.rest };
  clearTimeout(story.timer); story.timer = setTimeout(settleStory, SETTLE);
  story.last = y;
}
function settleStory() {
  story.timer = 0;
  if (!story.on) return;
  if (story.touching) { story.timer = setTimeout(settleStory, SETTLE); return; }
  const y = page.scrollTop - story.top, from = story.from; story.from = null; story.last = y;
  if (story.auto) { story.auto = false; story.rest = chapterAt(y); return; }
  const last = story.n - 1, moved = y - (from?.y ?? y), far = Math.abs(moved) > story.step * .08;
  let index = null;
  if (y >= 0 && y <= story.range) {
    // Inside the track. A gesture that began inside it moves one chapter in its direction; one that came in from outside
    // lands on the nearest chapter.
    const inside = from && from.y >= -2 && from.y <= story.range + 2;
    index = inside ? Math.min(last, Math.max(0, from.index + (far ? Math.sign(moved) : 0))) : chapterAt(y);
  } else if (y < 0 && y > -page.clientHeight * .35 && moved > 0) index = 0;   // just above the pin, going down: seat the first chapter
  else if (y > story.range) story.rest = last;
  else if (y < 0) story.rest = 0;
  if (index === null) return;
  story.rest = index;
  if (Math.abs(y - index * story.step) > 2) { story.auto = true; page.scrollTo({ top: storyTarget(index), behavior: calm.matches ? 'auto' : 'smooth' }); }
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
  const now = list[0];
  // Sticky: it stays at the top while the roles scroll under it, lights the role being read, and jumps to any role.
  return el('div', { class: 'arc-track', role: 'group', 'aria-label': `Career track, ${monthLabel(dated[0].start)} to ${ongoing ? 'present' : monthLabel(dated.at(-1).end)}` },
    el('div', { class: 'arc-track-bar' }, el('i', { class: 'arc-track-lens', 'aria-hidden': 'true' }), dated.map(entry =>
      el('button', { type: 'button', class: 'arc-track-seg', 'data-role': entry.id, 'data-now': !entry.end, 'data-active': entry === now, style: `left:${at(monthIndex(entry.start))};width:${((roleEnd(entry) - monthIndex(entry.start)) / span * 100).toFixed(2)}%`,
        'aria-label': `${entry.title}, ${monthLabel(entry.start)} to ${entry.end ? monthLabel(entry.end) : 'present'}` }, el('span', { text: entry.title })))),
    el('div', { class: 'arc-track-axis', 'aria-hidden': 'true' },
      el('span', { 'data-edge': 'start', text: monthLabel(dated[0].start) }),
      // A year that sits close to an end label is dropped on a phone, where the two would overlap.
      ticks.map(month => el('span', { style: `left:${at(month)}`, 'data-tight': (month - first) / span < .16 || (last - month) / span < .16, text: String(month / 12) })),
      el('span', { 'data-edge': 'end', text: ongoing ? 'Present' : monthLabel(dated.at(-1).end) })),
    el('p', { class: 'arc-track-now', 'aria-live': 'polite' }, el('b', { text: now.title }), el('span', { text: now.start ? `${monthLabel(now.start)} — ${now.end ? monthLabel(now.end) : 'Present'}` : now.tag })));
}
// Time at the organisation, from the first role to the last, said once beside the heading.
function careerStat(list) {
  const dated = list.filter(entry => entry.start);
  if (!dated.length) return null;
  const first = Math.min(...dated.map(entry => monthIndex(entry.start))), last = Math.max(...dated.map(roleEnd)), ongoing = dated.some(entry => !entry.end);
  const org = dated.every(entry => entry.org === dated[0].org) && dated[0].org;
  return el('p', { class: 'arc-stat' }, el('b', { text: duration(last - first) }), el('span', { text: `across ${dated.length} roles${org ? ` at ${org}` : ''}${ongoing ? ', and counting' : ''}` }));
}
function roleCard(entry) {
  const months = entry.start ? roleEnd(entry) - monthIndex(entry.start) : null;
  // Titles held, newest first, like the roles themselves.
  const stages = (entry.stages || []).filter(stage => stage.start && stage.end).sort((a, b) => monthIndex(b.start) - monthIndex(a.start));
  const facts = entry.facts.filter(fact => !(entry.stages || []).some(stage => fact.startsWith(stage.label)) && fact !== entry.site);
  const current = Boolean(entry.start && !entry.end);
  const detail = [el('div', { class: 'arc-prose' }, paragraphs(entry.body)),
    stages.length > 0 && el('ul', { class: 'arc-stages', 'aria-label': 'Titles held' }, stages.map(stage => el('li', {}, el('b', { text: stage.label }), el('span', { text: `${monthLabel(stage.start)} — ${monthLabel(stage.end)}` })))),
    facts.length > 0 && el('ul', { class: 'arc-facts', 'aria-label': 'Covered' }, facts.map(text => el('li', {}, glyph('check'), el('span', { text })))),
    pills(entry.links, `${entry.title} links`)].filter(Boolean);
  return el('article', { class: 'arc-role', id: `arc-role-${entry.id}`, 'data-role': entry.id, 'data-now': current, 'aria-labelledby': `arc-role-title-${entry.id}` },
    el('div', { class: 'arc-role-when' },
      el('span', { class: 'arc-role-dot', 'aria-hidden': 'true' }),
      entry.start ? [el('b', { text: `${monthLabel(entry.start)} — ${entry.end ? monthLabel(entry.end) : 'Present'}` }), el('span', { text: `${duration(months)}${entry.end ? '' : ' so far'}` })] : el('b', { text: entry.tag })),
    el('div', { class: 'arc-role-body' },
      el('h4', { id: `arc-role-title-${entry.id}`, text: entry.title }),
      el('p', { class: 'arc-role-org', text: [entry.org, entry.site].filter(Boolean).join(' · ') || entry.tag }),
      el('p', { class: 'arc-role-lead', text: entry.summary }),
      detail));
}
function renderExperience() {
  const section = PORTFOLIO_CONTENT.experience, list = roles();
  return [
    Object.assign(head(section.title, section.subtitle, careerStat(list)), { className: 'arc-head arc-head--exp' }),
    careerTrack(list),
    el('div', { class: 'arc-roles' }, el('i', { class: 'arc-roles-fill', 'aria-hidden': 'true' }), list.map(roleCard)),
    foot('experience'),
  ];
}
// The controller for the page: roles rise in as they come into view, the track lights the role being read and the line beside
// the roles fills as you go. Only opacity and transforms change.
const exp = { el: null, io: null, roles: [], segs: [], track: null, now: null, active: null };
function armExperience() {
  exp.io?.disconnect(); exp.io = null; exp.el = page.querySelector('.arc-roles'); exp.active = null;
  if (!exp.el) return;
  exp.roles = [...exp.el.querySelectorAll('.arc-role')]; exp.segs = [...page.querySelectorAll('.arc-track-seg')];
  exp.track = page.querySelector('.arc-track'); exp.fill = exp.el.querySelector('.arc-roles-fill'); exp.lens = exp.track.querySelector('.arc-track-lens');
  if (!calm.matches && 'IntersectionObserver' in window) {
    exp.io = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { entry.target.dataset.rise = 'in'; exp.io.unobserve(entry.target); } }, { root: page, threshold: .12 });
    const edge = page.getBoundingClientRect().bottom - 80;
    for (const role of exp.roles) if (role.getBoundingClientRect().top > edge) { role.dataset.rise = 'pending'; exp.io.observe(role); }
  }
  page.querySelector('.arc-view').style.setProperty('--sticky', `${Math.round(exp.track.offsetHeight + 24)}px`);
  paintExperience();
}
function paintExperience() {
  if (!exp.el?.isConnected) return;
  const line = exp.track.getBoundingClientRect().bottom + 28;
  let active = exp.roles[0];
  for (const role of exp.roles) if (role.getBoundingClientRect().top <= line) active = role;
  const box = exp.el.getBoundingClientRect(), from = 40, to = Math.max(from + 1, box.height - 40);
  exp.fill.style.transform = `scaleY(${clamp01((line - box.top - from) / (to - from)).toFixed(3)})`;
  if (active === exp.active) return;
  exp.active = active;
  placeLens();
  for (const role of exp.roles) role.dataset.active = String(role === active);
  for (const seg of exp.segs) seg.dataset.active = String(seg.dataset.role === active.dataset.role);
  const now = exp.track.querySelector('.arc-track-now');
  now.querySelector('b').textContent = active.querySelector('h4').textContent; now.querySelector('span').textContent = active.querySelector('.arc-role-when b').textContent;
}
// The lens sits over the segment of the role being read; moving from one role to the next it glides and resizes. The first
// placement is not animated.
function placeLens() {
  const seg = exp.segs.find(item => item.dataset.role === exp.active?.dataset.role);
  if (!seg || !exp.lens || !seg.offsetWidth) return;
  // The lens covers exactly the coloured part of the segment (inside its 1.5px side gaps), so nothing shows around it.
  exp.lens.style.setProperty('--x', `${seg.offsetLeft + 1.5}px`); exp.lens.style.setProperty('--w', `${Math.max(0, seg.offsetWidth - 3)}px`);
  if (!exp.lens.dataset.ready) requestAnimationFrame(() => { exp.lens.dataset.ready = 'true'; });
}
// Scrolls a role to just under the track.
function gotoRole(id, smooth = true) {
  const role = page.querySelector(`#arc-role-${id}`);
  if (!role) return;
  role.dataset.rise = 'in';
  const top = role.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop - (exp.track?.offsetHeight || 0) - 24;
  page.scrollTo({ top: Math.max(0, top), behavior: smooth && !calm.matches ? 'smooth' : 'auto' });
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
    (entry.body.length > 0 || entry.facts.length > 0) && story && el('div', { class: 'arc-more' },
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
  for (const tab of tabs.querySelectorAll('button')) { if (tab.dataset.section === stop.section) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current'); }
  placeTabPill();
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
    armStory(); armExperience();
    page.setAttribute('aria-label', `${SECTIONS[stop.section].label}: ${page.querySelector('#archive-entry-title')?.textContent || ''}`);
    rendered = key; renderedIndex = index;
    if (options.scroll !== false) page.scrollTop = 0;
    if (inside) page.focus({ preventScroll: true });
  } else if (!stop.anchor && options.scroll !== false) page.scrollTop = 0;
  // A place on the page (a role, how I work, contact) is scrolled to and, for a role, lit.
  for (const node of page.querySelectorAll('[data-current]')) delete node.dataset.current;
  if (stop.anchor) {
    const target = page.querySelector(stop.anchor), within = target?.closest?.('.arc-chapter');
    if (story.on && within) { const index = story.layers.indexOf(within); story.rest = index; page.scrollTop = storyTarget(index); showChapter(index, true); story.last = index * story.step; }
    else if (stop.section === 'experience' && exp.el) gotoRole(stop.id, false);
    else if (target) target.scrollIntoView({ block: 'start', behavior: 'auto' });
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
  const seg = event.target.closest?.('.arc-track-seg');
  if (seg) { gotoRole(seg.dataset.role); return; }
  const stop = event.target.closest?.('.arc-rail-stop');
  if (stop && story.on) { goToChapter(Number(stop.dataset.stop)); return; }
  const control = event.target.closest?.('[data-go],[data-lightbox],[data-print],[data-role],[data-section]');
  if (!control || !page.contains(control)) return;
  if (control.dataset.lightbox) openLightbox(panel, media[control.dataset.lightbox], control);
  else if (control.dataset.section) show(control.dataset.section, null, { focus: '#archive-entry-title' });
  else if (control.dataset.print !== undefined) print();
  else if (control.dataset.go) go(control.dataset.go, { focus: control.dataset.focus });
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

// The story follows the scroll, one frame at a time, and is measured again when the sheet changes size.
page.addEventListener('scroll', () => { storyScrolled(); if ((!story.on && !exp.el) || story.raf) return; story.raf = requestAnimationFrame(() => { story.raf = 0; paintStory(); paintExperience(); }); }, { passive: true });
page.addEventListener('touchstart', () => { story.touching = true; }, { passive: true });
for (const type of ['touchend', 'touchcancel']) page.addEventListener(type, () => { story.touching = false; }, { passive: true });
if ('ResizeObserver' in window) new ResizeObserver(() => { if (story.el?.isConnected) { measureStory(); } if (exp.el?.isConnected) { placeLens(); placeTabPill(); } }).observe(page);
calm.addEventListener?.('change', () => { if (story.el?.isConnected) measureStory(); });
