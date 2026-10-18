// Dive Explorer archive: renders the portfolio as a diver's records inside
// <dialog id="landmark-dialog">. At a glance (the opening view), About, Experience,
// Projects and Résumé, with nautical cues as secondary labels. Every value shown comes from PORTFOLIO_CONTENT; derived fields
// (dive numbers, bottom time, find numbers, chart shapes) are computed here from that data and labelled as such
// in the interface. Nothing here runs while the dialog is closed: pages are built when they are shown, entry
// motion is CSS on the shared tokens in motion.css, and the only listeners left idle are for printing.
import { PORTFOLIO_CONTENT, PORTFOLIO_MEDIA, COPY_VARIANTS } from './portfolio-content.js';
import { icon } from './ui-icons.js';
import { openLightbox, closeLightbox, lightboxOpen } from './archive-lightbox.js';

const panel = document.querySelector('#landmark-dialog');
const page = panel.querySelector('#archive-page');
const indexNav = panel.querySelector('#explorer-index');
const variant = panel.querySelector('#copy-variant');
const counter = panel.querySelector('#entry-number');
const previousButton = panel.querySelector('#archive-prev');
const nextButton = panel.querySelector('#archive-next');

export const GLANCE = 'glance';
export const SECTIONS = {
  glance: { hash: 'records', label: 'At a glance', short: 'Glance', site: 'START HERE' },
  about: { hash: 'profile', label: 'About', short: 'About', site: 'THE ANCHOR', line: 'An anchor for my story.' },
  experience: { hash: 'log', label: 'Experience', short: 'Experience', site: 'THE WRECK', line: 'Explore the chapters of my journey.' },
  projects: { hash: 'finds', label: 'Projects', short: 'Projects', site: 'THE TREASURE', line: 'Discover what I’ve been building.' },
  resume: { hash: 'resume', label: 'Résumé', short: 'Résumé', site: 'THE LOGBOOK', line: 'The work, on one page.' },
};
const media = PORTFOLIO_MEDIA;
// Images carry their pixel size and decode off the main thread; the stylesheet still decides the box each one is
// drawn in. They are only created when a page that shows them is rendered, so there is nothing to defer further.
const picture = visual => el('img', { decoding: 'async', width: visual.width, height: visual.height, src: visual.src, alt: visual.alt });
const CATALOGUE = 'catalogue';
const SAFE_LINK = /^(https:\/\/|mailto:|\.\/assets\/portfolio\/)/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = value => String(value).padStart(2, '0');
// The four records quoted on the opening view: [section, entry, the line to quote]. Each line is shown word for
// word from the entry it names. When dive or find entries carry their own `proof` string, those entries (the
// first four) are quoted with it instead of this list.
const PROOF = [
  ['experience', 'product-manager', entry => entry.summary],
  ['projects', 'rae', entry => entry.summary],
  ['projects', 'reengage', entry => entry.body[0]],
  ['projects', 'sage', entry => entry.body[1]],
];

// Icons that only this dialog uses (ui-icons.js belongs to the shared HUD).
const glyphs = {
  previous: '<path d="m14 6-6 6 6 6"/>',
  next: '<path d="m10 6 6 6-6 6"/>',
  grid: '<path d="M4 4h7v7H4ZM13 4h7v7h-7ZM4 13h7v7H4ZM13 13h7v7h-7Z"/>',
  expand: '<path d="M4 10V4h6M20 14v6h-6M4 4l7 7M20 20l-7-7"/>',
  stamp: '<path d="m12 3 9 9-9 9-9-9 9-9ZM8.5 12l2.5 2.5 4.5-5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7Z"/>',
  flip: '<path d="M4 9a8 8 0 0 1 14-4l2 2M20 3v4h-4M20 15a8 8 0 0 1-14 4l-2-2M4 21v-4h4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  mail: '<path d="M3 6h18v12H3ZM3 7l9 7 9-7"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
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
const paragraphs = list => list.map(text => el('p', { text }));
// A titled part of a page. `step` numbers the parts of a case study (01 What it is, 02 Highlights ...).
function block(title, id, ...children) {
  const [label, step, note] = Array.isArray(title) ? title : [title];
  return el('section', { class: 'arc-block', 'data-rise': true, 'aria-labelledby': id },
    el('h4', { class: 'holo-label', id }, step && el('span', { class: 'arc-step', 'aria-hidden': 'true', text: step }), label, note && el('small', { text: note })), ...children);
}
function fields(items, className = 'arc-strip') {
  return el('dl', { class: className, 'data-rise': true }, items.filter(Boolean).map(([label, value, hint]) =>
    el('div', {}, el('dt', { class: 'holo-label' }, label, hint && el('small', { text: hint })), el('dd', { class: 'holo-value', text: value }))));
}
const safeLinks = links => links.filter(link => SAFE_LINK.test(link.url));
function anchorFor(link, ...children) {
  const anchor = el('a', { href: link.url }, ...children);
  if (link.download) anchor.download = 'Anshul-Ramprasad-Resume.pdf';
  else if (link.url.endsWith('.pdf')) { anchor.target = '_blank'; anchor.rel = 'noopener'; }
  if (link.url.startsWith('https:')) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  return anchor;
}
function linkList(links, label, extra = null) {
  const safe = safeLinks(links);
  if (!safe.length && !extra) return null;
  return el('ul', { class: 'arc-links', 'aria-label': label },
    safe.map(link => el('li', {}, anchorFor(link, icon(link.download ? 'download' : 'arrow'), link.label))), extra && el('li', {}, extra));
}
// Surface contact: each destination as one large action that shows where it leads.
function contactTiles(links) {
  const safe = safeLinks(links);
  if (!safe.length) return null;
  return el('ul', { class: 'arc-contacts', 'aria-label': 'Surface contact links' }, safe.map(link => {
    const mail = link.url.startsWith('mailto:'), where = mail ? link.url.slice(7) : link.url.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '');
    const mark = mail ? glyph('mail') : /github\.com/.test(link.url) ? glyph('code') : icon('overview');
    return el('li', {}, anchorFor(link, el('span', { class: 'arc-contact-mark', 'aria-hidden': 'true' }, mark),
      el('span', { class: 'arc-contact-text' }, el('strong', { text: link.label }), el('span', { text: where })), icon('arrow')));
  }));
}
// Pictures open in the lightbox (archive-lightbox.js) instead of a new tab.
function figure(id, extraClass = '') {
  const visual = media[id];
  if (!visual) return null;
  return el('figure', { class: `arc-media ${extraClass}`.trim(), 'data-kind': visual.kind, 'data-rise': true },
    el('button', { type: 'button', class: 'media-full', 'data-lightbox': id, 'aria-label': `Enlarge image: ${visual.caption}` },
      picture(visual), el('span', { class: 'arc-expand', 'aria-hidden': 'true' }, glyph('expand'), 'Enlarge')),
    el('figcaption', { text: visual.caption }));
}
// Original diagrams describe decisions without inventing a product screenshot.
function diagram(entry, compact = false) {
  const data = entry.diagram;
  if (!data) return null;
  return el('div', { class: `arc-diagram${compact ? ' arc-diagram--compact' : ''}`, role: 'img', 'aria-label': `${data.label}: ${data.steps.join(' → ')}` },
    el('span', { class: 'holo-label', text: data.label }),
    el('ol', {}, data.steps.map((text, index) => el('li', {}, el('span', { class: 'arc-diagram-dot', 'aria-hidden': 'true', text: pad(index + 1) }), el('strong', { text })))),
    !compact && el('small', { text: data.caption }));
}
function plate(find, size = 'full') {
  return diagram(find.entry, size === 'thumb') || el('span', { class: `arc-noimage arc-noimage--${size}`, role: 'img', 'aria-label': `${find.entry.title} field notes` },
    el('span', { class: 'arc-noimage-no', 'aria-hidden': 'true', text: pad(find.number) }), icon(find.entry.id),
    size === 'full' && el('span', { class: 'holo-label', 'aria-hidden': 'true', text: 'Field notes' }));
}
const thumb = find => media[find.entry.id] ? picture(media[find.entry.id]) : plate(find, 'thumb');
// The reading-style select swaps the intro line for an unapproved draft, so the draft is labelled.
const draftFor = sectionKey => variant.value !== 'baseline' && COPY_VARIANTS[variant.value]?.[sectionKey] || null;
const draftBadge = () => el('span', { class: 'arc-draft', text: `${COPY_VARIANTS[variant.value].label} draft intro` });
function intro(sectionKey, baseline, rise = true) {
  const draft = draftFor(sectionKey);
  return el('p', { class: 'arc-intro', 'data-rise': rise }, draft || baseline, draft && draftBadge());
}

// Dive log fields are derived only from the dates stored with each entry.
const monthIndex = value => { const [year, month] = value.split('-').map(Number); return year * 12 + month - 1; };
const monthLabel = value => { const [year, month] = value.split('-').map(Number); return `${MONTHS[month - 1]} ${year}`; };
const currentMonth = () => { const now = new Date(); return now.getFullYear() * 12 + now.getMonth(); };
function duration(months) {
  const years = Math.floor(months / 12), rest = months % 12;
  return [years && `${years} yr`, rest && `${rest} mo`].filter(Boolean).join(' ') || 'Under 1 mo';
}
function dives() {
  const entries = PORTFOLIO_CONTENT.experience.entries;
  const dated = entries.filter(entry => entry.start).sort((a, b) => monthIndex(a.start) - monthIndex(b.start));
  const list = entries.map(entry => ({ entry, number: dated.includes(entry) ? dated.indexOf(entry) + 1 : null }));
  // Newest first. Entries without dates keep their written order after the dated ones.
  return list.sort((a, b) => (b.number ?? -1) - (a.number ?? -1));
}
const bottomTime = entry => entry.start ? (entry.end ? monthIndex(entry.end) : currentMonth()) - monthIndex(entry.start) : null;
const finds = () => PORTFOLIO_CONTENT.projects.entries.map((entry, index) => {
  const [kind, ...rest] = entry.tag.split(' · ');
  return { entry, number: index + 1, kind, status: rest.join(' · ') || null };
});

// The records are one reading order: the opening view, then every entry of every section. The rail, the
// breadcrumb, the previous / next controls, the progress track and the deep links all walk this list.
let cachedStops = null;
function sequence() {
  if (cachedStops) return cachedStops;
  const content = PORTFOLIO_CONTENT, list = [{ section: GLANCE, id: GLANCE, slug: null, code: 'START', title: SECTIONS.glance.label, glyph: 'compass' }];
  content.about.entries.forEach((entry, index) => list.push(entry.id === 'approach'
    ? { section: 'about', id: entry.id, slug: 'rules', code: 'RULES', title: 'How I think', icon: entry.id }
    : index === 0 ? { section: 'about', id: entry.id, slug: null, aliases: ['card'], code: 'CARD', title: 'About me', icon: entry.id }
      : { section: 'about', id: entry.id, slug: entry.id, code: pad(index + 1), title: entry.title, icon: entry.id }));
  for (const dive of dives()) list.push({ section: 'experience', id: dive.entry.id, slug: dive.entry.id, code: dive.number ? `DIVE ${pad(dive.number)}` : 'DIVE', mark: dive.number && pad(dive.number), title: dive.entry.title, icon: 'experience' });
  list.push({ section: 'projects', id: CATALOGUE, slug: null, aliases: ['all'], code: 'ALL', title: 'Selected work', glyph: 'grid' });
  for (const find of finds()) list.push({ section: 'projects', id: find.entry.id, slug: find.entry.id, code: `FIND ${pad(find.number)}`, mark: pad(find.number), title: find.entry.title, icon: find.entry.id });
  content.resume.entries.forEach((entry, index) => list.push({ section: 'resume', id: entry.id, slug: index ? entry.id : null, aliases: index ? [] : ['card'], code: 'PDF', title: content.resume.entries.length === 1 ? SECTIONS.resume.label : entry.title, icon: 'resume' }));
  list.forEach((stop, index) => { stop.index = index; stop.hash = SECTIONS[stop.section].hash + (stop.slug ? `/${stop.slug}` : ''); });
  return cachedStops = list;
}
const stopsFor = id => sequence().filter(stop => stop.section === id);
// Unknown entries fall back to the first stop of the section.
function findStop(id, entry) {
  const stops = stopsFor(id), key = String(entry ?? '').toLowerCase();
  return stops.find(stop => key && (stop.id === key || stop.slug === key || stop.aliases?.includes(key))) || stops[0];
}
const stopByHash = hash => { const target = parseHash(hash); return target ? findStop(target.id, target.entry) : null; };
const stopName = stop => stop.code === 'DIVE' || /^(DIVE|FIND) \d/.test(stop.code) ? `${stop.code[0]}${stop.code.slice(1).toLowerCase()} · ${stop.title}` : stop.title;

/** Reads #records, #profile, #log, #finds, #resume and their entries (#log/product-manager, #profile/rules ...). */
export function parseHash(hash = location.hash) {
  let text = String(hash || '').replace(/^#/, '');
  try { text = decodeURIComponent(text); } catch {}
  const [name = '', entry = ''] = text.split('/'), key = name.toLowerCase();
  const id = Object.keys(SECTIONS).find(section => SECTIONS[section].hash === key) || (key === GLANCE ? GLANCE : null);
  return id ? { id, entry: entry || null } : null;
}
/** The shareable address of a page of the records (the current one when called without arguments). */
export function linkFor(id = sectionId, entry = entryId) {
  return `${location.origin}${location.pathname}${location.search}#${findStop(SECTIONS[id] ? id : GLANCE, entry).hash}`;
}

// What has been read in this browser session: the last entry (offered again on the opening view) and every
// page seen (ticked in the rail and filled in on the progress track).
const memory = { last: null, seen: new Set() };
try {
  const saved = JSON.parse(sessionStorage.getItem('ocean-archive-session') || 'null');
  if (saved) { memory.last = saved.last || null; memory.seen = new Set(saved.seen || []); }
} catch {}
function remember(stop) {
  if (memory.seen.has(stop.hash) && (stop.section === GLANCE || memory.last === stop.hash)) return;
  memory.seen.add(stop.hash); if (stop.section !== GLANCE) memory.last = stop.hash;
  try { sessionStorage.setItem('ocean-archive-session', JSON.stringify({ last: memory.last, seen: [...memory.seen] })); } catch {}
}

// Charts. Lines are drawn in an SVG that stretches with the box; labels and numbered markers are HTML placed by
// percentage, so type keeps its size at every width. Time on x comes from the log dates. Depth on y is
// illustrative and says so: one level per logged role, deeper with each dive.
const VIEW = { w: 1000, h: 300, surface: 34, floor: 268 };
function plot({ label, levels, shapes, marks, ticks }) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${VIEW.w} ${VIEW.h}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = levels.map(level => `<path class="${level.surface ? 'surface' : 'level'}" d="M0 ${level.y.toFixed(1)}H${VIEW.w}"/>`).join('') + shapes;
  const left = x => `${(x / VIEW.w * 100).toFixed(2)}%`, top = y => `${(y / VIEW.h * 100).toFixed(2)}%`;
  return [
    el('div', { class: 'arc-chart-plot', role: 'img', 'aria-label': label }, svg,
      levels.map(level => el('span', { class: 'arc-chart-level', 'data-current': level.current, 'aria-hidden': 'true', style: `top:${top(level.y)}`, text: level.text })),
      marks.map(mark => el('i', { class: 'arc-chart-mark', 'data-current': mark.current, 'aria-hidden': 'true', style: `left:${left(mark.x)};top:${top(mark.y)};--i:${mark.order}`, text: mark.text }))),
    el('div', { class: 'arc-chart-axis', 'aria-hidden': 'true' }, ticks.map(tick => el('span', { 'data-edge': tick.edge, 'data-tight': tick.tight, style: `left:${left(tick.x)}`, text: tick.text }))),
  ];
}
const levelY = (number, count) => VIEW.surface + number / count * (VIEW.floor - VIEW.surface);
// Each January inside the range is a tick, unless it would sit on top of an end label. Ticks marked tight are
// the ones a narrow screen has no room for.
function yearTicks(from, to, x) {
  const ticks = [];
  for (let month = Math.ceil(from / 12) * 12; month < to; month += 12) if (x(month) > VIEW.w * .14 && x(month) < VIEW.w * .86) ticks.push({ x: x(month), text: String(month / 12), tight: x(month) < VIEW.w * .42 || x(month) > VIEW.w * .68 });
  return ticks;
}
// One dive: down from the surface on the start date, along the bottom, and up on the end date (or still down).
function diveChart(dive, list) {
  const entry = dive.entry;
  if (!entry.start || !dive.number) return null;
  const dated = list.filter(item => item.number).sort((a, b) => a.number - b.number), count = dated.length;
  const from = monthIndex(entry.start), to = entry.end ? monthIndex(entry.end) : currentMonth(), span = Math.max(1, to - from);
  const x = month => (month - from) / span * VIEW.w, ramp = VIEW.w * .05, floor = levelY(dive.number, count), above = levelY(dive.number - 1, count);
  // Stages named in the entry become steps between the level above and this dive's level.
  const stages = (entry.stages || []).filter(stage => stage.start && monthIndex(stage.start) >= from && monthIndex(stage.start) <= to);
  const steps = (stages.length > 1 ? stages : [{ start: entry.start }]).map((stage, index, all) => ({ ...stage, at: Math.max(0, x(monthIndex(stage.start))), y: above + (floor - above) * (index + 1) / all.length }));
  let line = `M0 ${VIEW.surface}`;
  steps.forEach((step, index) => { line += `${index ? `H${step.at.toFixed(1)}` : ''}L${(step.at + ramp).toFixed(1)} ${step.y.toFixed(1)}`; });
  const marks = steps.map((step, index) => ({ x: step.at + ramp, y: step.y, label: index ? step.label : 'Descent', when: monthLabel(step.start), note: index ? null : step.label }));
  // An entry may also carry dated moments ({ label, date }); each is marked on the bottom line at its month.
  for (const moment of entry.moments || []) {
    const at = moment.date && moment.label ? monthIndex(moment.date) : null;
    if (at === null || at <= from || at >= to) continue;
    const step = steps.filter(item => item.at <= x(at)).at(-1) || steps[0];
    marks.push({ x: Math.max(x(at), step.at + ramp), y: step.y, label: moment.label, when: monthLabel(moment.date) });
  }
  if (entry.end) { line += `H${(VIEW.w - ramp).toFixed(1)}L${VIEW.w} ${VIEW.surface}`; marks.push({ x: VIEW.w - ramp, y: floor, label: 'Ascent', when: monthLabel(entry.end) }); }
  else { line += `H${VIEW.w}`; marks.push({ x: VIEW.w, y: floor, label: 'Still down', when: 'Present', current: true }); }
  marks.sort((a, b) => a.x - b.x).forEach((mark, index) => { mark.text = String(index + 1); mark.order = index; });
  const shapes = `<path class="water" d="${line}${entry.end ? '' : `V${VIEW.surface}`}Z"/><path class="track" d="${line}"/>`;
  const levels = [{ y: VIEW.surface, text: 'Surface', surface: true }, ...dated.map(item => ({ y: levelY(item.number, count), text: `Dive ${pad(item.number)}`, current: item === dive }))];
  const ticks = [{ x: 0, text: monthLabel(entry.start), edge: 'start' }, ...yearTicks(from, to, x), { x: VIEW.w, text: entry.end ? monthLabel(entry.end) : 'Present', edge: 'end' }];
  const months = to - from, summary = `Dive profile for ${entry.title}: ${marks.map(mark => `${mark.label.toLowerCase()} ${mark.when}`).join(', ')}. Bottom time ${duration(months)}${entry.end ? '' : ' to date'}. Depth is illustrative.`;
  return el('figure', { class: 'arc-chart', 'data-rise': true },
    el('figcaption', {}, el('span', { class: 'holo-label', text: 'Dive profile' }), el('small', { text: 'Time runs left to right, from the log dates. Depth is illustrative: one level per logged role.' })),
    plot({ label: summary, levels, shapes, marks, ticks }),
    el('ol', { class: 'arc-chart-key', 'aria-label': 'Key moments on the profile' }, marks.map(mark =>
      el('li', {}, el('span', { class: 'arc-chart-no', 'data-current': mark.current, 'aria-hidden': 'true', text: mark.text }), el('strong', { text: mark.label }), el('span', { text: [mark.when, mark.note].filter(Boolean).join(' · ') })))));
}
// The whole log as one profile: one step down per role, the width of a step is the time in that role.
function careerChart(list) {
  const dated = list.filter(dive => dive.number).sort((a, b) => a.number - b.number), count = dated.length;
  if (count < 2) return null;
  const first = monthIndex(dated[0].entry.start), ongoing = dated.some(dive => !dive.entry.end);
  const last = ongoing ? currentMonth() : Math.max(...dated.map(dive => monthIndex(dive.entry.end))), span = Math.max(1, last - first);
  const x = month => (month - first) / span * VIEW.w, ramp = VIEW.w * .025;
  let line = `M0 ${VIEW.surface}`;
  const marks = dated.map((dive, index) => {
    const from = x(monthIndex(dive.entry.start)), to = dive.entry.end ? x(monthIndex(dive.entry.end)) : VIEW.w, y = levelY(dive.number, count);
    line += `${index ? `H${from.toFixed(1)}` : ''}L${(from + ramp).toFixed(1)} ${y.toFixed(1)}H${to.toFixed(1)}`;
    return { x: (from + ramp + to) / 2, y, text: pad(dive.number), order: index, current: !dive.entry.end };
  });
  if (!ongoing) line += `L${VIEW.w} ${VIEW.surface}`;
  const shapes = `<path class="water" d="${line}${ongoing ? `V${VIEW.surface}` : ''}Z"/><path class="track" d="${line}"/>`;
  const levels = [{ y: VIEW.surface, text: 'Surface', surface: true }, ...dated.map(dive => ({ y: levelY(dive.number, count), text: `Dive ${pad(dive.number)}` }))];
  const ticks = [{ x: 0, text: monthLabel(dated[0].entry.start), edge: 'start' }, ...yearTicks(first, last, x), { x: VIEW.w, text: ongoing ? 'Present' : monthLabel(dated.at(-1).entry.end), edge: 'end' }];
  const summary = `Dive profile across ${count} logged dives, ${monthLabel(dated[0].entry.start)} to ${ongoing ? 'present' : monthLabel(dated.at(-1).entry.end)}. Each step down is the next role; the width of a step is the time in that role. Depth is illustrative.`;
  return el('figure', { class: 'arc-chart arc-chart--career' },
    plot({ label: summary, levels, shapes, marks, ticks }),
    el('ol', { class: 'arc-chart-key arc-chart-key--links', 'aria-label': 'Logged dives, oldest first' }, dated.map(dive =>
      el('li', {}, el('button', { type: 'button', 'data-go': `log/${dive.entry.id}` }, el('span', { class: 'arc-chart-no', 'data-current': !dive.entry.end, 'aria-hidden': 'true', text: pad(dive.number) }),
        el('strong', { text: dive.entry.title }), el('span', { text: dive.entry.tag }))))),
    el('figcaption', {}, el('small', { text: `${duration(last - first)} logged${ongoing ? ' to date' : ''}, from the log dates. Depth is illustrative: one step down per role.` })));
}

// Bottom of every page: the pages on either side in the reading order, across sections.
function turner(stop) {
  const list = sequence(), cards = [[list[stop.index - 1], -1, 'Previous'], [list[stop.index + 1], 1, 'Next']].filter(([target]) => target);
  if (!cards.length) return null;
  return el('nav', { class: 'arc-turner', 'aria-label': 'Continue reading', 'data-rise': true }, cards.map(([target, direction, word]) => {
    const find = target.section === 'projects' && finds().find(item => item.entry.id === target.id);
    return el('button', { type: 'button', class: `arc-turn arc-turn--${direction < 0 ? 'prev' : 'next'}`, 'data-step': direction },
      find && el('span', { class: 'arc-turn-thumb', 'aria-hidden': 'true' }, thumb(find)),
      el('span', { class: 'arc-turn-text' }, el('span', { class: 'holo-label', text: `${word} · ${SECTIONS[target.section].label}` }), el('strong', { text: stopName(target) })),
      glyph(direction < 0 ? 'previous' : 'next'));
  }));
}

function renderGlance() {
  const about = PORTFOLIO_CONTENT.about, card = about.entries[0], list = dives(), found = finds();
  const now = list.find(dive => dive.entry.start && !dive.entry.end);
  const resume = safeLinks(PORTFOLIO_CONTENT.resume.entries[0]?.links || []).find(link => link.download);
  const mail = safeLinks(card.links).find(link => link.url.startsWith('mailto:'));
  const resumeStop = memory.last && stopByHash(memory.last);
  const authored = ['experience', 'projects'].flatMap(section => PORTFOLIO_CONTENT[section].entries.filter(entry => entry.proof).map(entry => [section, entry.id, item => item.proof]));
  const proof = (authored.length ? authored.slice(0, 4) : PROOF).map(([section, id, pick]) => {
    const entry = PORTFOLIO_CONTENT[section].entries.find(item => item.id === id), quote = entry && pick(entry);
    if (!quote) return null;
    const dive = section === 'experience' && list.find(item => item.entry === entry), find = section === 'projects' && found.find(item => item.entry === entry);
    const source = dive ? [dive.number && `Dive ${pad(dive.number)}`, entry.tag] : [`Find ${pad(find.number)}`, find.status || find.kind];
    return el('li', {}, el('button', { type: 'button', class: 'arc-proof', 'data-go': `${SECTIONS[section].hash}/${id}` },
      el('span', { class: 'holo-label', text: source.filter(Boolean).join(' · ') }), el('strong', { text: entry.title }), el('span', { class: 'arc-proof-line', text: quote }),
      el('span', { class: 'arc-proof-more' }, dive ? 'Explore the role' : 'Explore the project', glyph('next'))));
  }).filter(Boolean);
  const logged = list.filter(dive => dive.entry.start), career = careerChart(list), contact = contactTiles(card.links);
  return [
    el('header', { class: 'arc-glance', 'data-hero': true },
      el('div', { class: 'arc-glance-lead' },
        el('p', { class: 'holo-label', text: `${card.name ? `${card.name} · ` : ''}The portfolio at a glance` }),
        el('h3', { id: 'archive-entry-title', text: card.title }),
        intro('about', card.summary, false),
        el('p', { class: 'arc-strap', text: about.subtitle }),
        el('div', { class: 'arc-actions' },
          el('button', { type: 'button', class: 'arc-action arc-action--primary', 'data-step': '1' }, 'Meet Anshul', glyph('next')),
          resume && anchorFor(resume, icon('download'), resume.label),
          mail && anchorFor(mail, glyph('mail'), mail.label)),
        resumeStop && resumeStop.section !== GLANCE && el('button', { type: 'button', class: 'arc-resume', 'data-go': resumeStop.hash },
          el('span', { class: 'holo-label', text: 'Pick up where you left off' }), el('strong', { text: `${SECTIONS[resumeStop.section].label} · ${stopName(resumeStop)}` }), glyph('next'))),
      el('dl', { class: 'arc-plate' }, [
        now && ['Current role', now.entry.title, now.entry.tag],
        card.tag && ['Focus', card.tag],
        card.base && ['Based in', card.base],
        logged.length && ['Explore', `${logged.length} career chapters · ${found.length} projects`],
      ].filter(Boolean).map(([label, value, note]) => el('div', {}, el('dt', { class: 'holo-label', text: label }), el('dd', {}, el('strong', { text: value }), note && el('span', { text: note })))))),
    proof.length && block(['The work behind the words', null, 'Choose a story'], 'arc-proof-title', el('ul', { class: 'arc-proofs' }, proof)),
    block(['Selected work', null, 'Enterprise products & independent builds'], 'arc-reel-title', el('ul', { class: 'arc-reel' }, found.map(find =>
      el('li', {}, el('button', { type: 'button', class: 'arc-reel-find', 'data-go': `finds/${find.entry.id}` },
        el('span', { class: 'arc-thumb' }, thumb(find)), el('span', { class: 'holo-label', text: `Find ${pad(find.number)}` }), el('strong', { text: find.entry.title }), el('span', { class: 'arc-find-kind', text: find.kind })))))),
    career && block(['Experience', null, PORTFOLIO_CONTENT.experience.subtitle], 'arc-career-title', career),
    contact && block('Surface contact', 'arc-contact', contact),
  ];
}
// The certification card: identity on the front, certifications and the dive rules on the back.
function certificate(section, card, rules) {
  const base = card.base ? `Based in ${card.base}` : null, capabilities = card.facts.filter(fact => fact !== base);
  const now = dives().find(dive => dive.entry.start && !dive.entry.end), art = media[card.id];
  const front = el('section', { class: 'arc-cert-face arc-cert-front', 'aria-label': 'Profile card, front' },
    el('p', { class: 'arc-cert-band' }, el('span', { text: 'Dive Explorer' }), el('span', { text: 'Profile card' })),
    el('div', { class: 'arc-cert-body' },
      art && el('span', { class: 'arc-cert-art' }, picture(art)),
      el('div', { class: 'arc-cert-id' },
        el('p', { class: 'holo-label', text: 'Diver' }),
        el('p', { class: 'arc-cert-name', text: card.name || card.title }),
        card.role && el('p', { class: 'arc-cert-role', text: card.role }),
        el('dl', {}, [['Focus', card.tag], card.base && ['Based in', card.base], now && ['Current dive', `${now.entry.title} · ${now.entry.org || now.entry.tag}`]].filter(Boolean).map(([label, value]) =>
          el('div', {}, el('dt', { class: 'holo-label', text: label }), el('dd', { text: value })))))),
    el('p', { class: 'arc-cert-strap', text: section.subtitle }));
  const back = el('section', { class: 'arc-cert-face arc-cert-back', 'aria-label': 'Profile card, back', inert: true },
    el('p', { class: 'arc-cert-band' }, el('span', { text: 'Capabilities' }), el('span', { text: card.name || '' })),
    el('div', { class: 'arc-cert-lists' },
      capabilities.length && el('ul', { class: 'arc-certs', 'aria-label': 'Capabilities' }, capabilities.map(text => el('li', {}, glyph('stamp'), el('span', { text })))),
      rules && el('div', {}, el('p', { class: 'holo-label', text: 'Dives by these rules' }),
        el('ol', { class: 'arc-cert-rules' }, rules.facts.map((text, index) => el('li', {}, el('span', { 'aria-hidden': 'true', text: pad(index + 1) }), text))))),
    rules && el('button', { type: 'button', class: 'arc-cert-more', 'data-go': 'profile/rules' }, 'Read the dive rules', glyph('next')));
  return el('div', { class: 'arc-cert', 'data-face': 'front', 'data-rise': true },
    el('div', { class: 'arc-cert-turn' }, front, back),
    el('button', { type: 'button', class: 'arc-flip', 'data-flip': true, 'aria-pressed': 'false' }, glyph('flip'), el('span', { text: 'Turn the card over' })));
}
function renderProfile() {
  const section = PORTFOLIO_CONTENT.about, card = section.entries[0], rules = section.entries.find(entry => entry.id === 'approach'), contact = contactTiles(card.links);
  return [
    el('div', { class: 'arc-id' },
      el('header', { class: 'arc-pagehead', 'data-hero': true },
        el('p', { class: 'holo-label', text: `${SECTIONS.about.label} · The anchor` }),
        el('h3', { id: 'archive-entry-title', text: card.title }),
        intro('about', card.summary, false)),
      certificate(section, card, rules),
      el('div', { class: 'arc-prose', 'data-rise': true }, paragraphs(card.body))),
    contact && block('Surface contact', 'arc-contact', contact),
  ];
}
function renderRules(id) {
  const section = PORTFOLIO_CONTENT.about, rules = section.entries.find(entry => entry.id === id) || section.entries[0], dedicated = rules.id === 'approach';
  return [
    el('header', { class: 'arc-pagehead', 'data-hero': true },
      el('p', { class: 'holo-label', text: `${dedicated ? 'Dive rules' : SECTIONS.about.label} · ${rules.tag}` }),
      el('h3', { id: 'archive-entry-title', text: rules.title }),
      el('p', { class: 'arc-intro', text: rules.summary })),
    rules.facts.length && el('ol', { class: 'arc-rule-list', 'data-rise': true, 'aria-label': 'Dive rules' }, rules.facts.map((text, index) =>
      el('li', {}, el('span', { class: 'arc-rule-no', 'aria-hidden': 'true', text: pad(index + 1) }), el('span', { class: 'holo-label', text: `Rule ${pad(index + 1)}` }), el('strong', { text })))),
    rules.examples?.length && el('div', { class: 'arc-principles', 'data-rise': true }, rules.examples.map(example =>
      el('article', {}, el('h4', { text: example.title }), el('p', { text: example.text }), el('button', { type: 'button', class: 'arc-back', 'data-go': `finds/${example.project}` }, 'See it in the work', glyph('next'))))),
    block('Notes on the rules', 'arc-notes', el('div', { class: 'arc-prose' }, paragraphs(rules.body))),
    linkList(rules.links, 'Dive rule links') && block('Links', 'arc-links-title', linkList(rules.links, 'Dive rule links')),
  ];
}
// A page of the paper logbook: numbered, boxed fields, the profile, then lead, notes and observations.
function renderDive(id) {
  const list = dives(), dive = list.find(item => item.entry.id === id) || list[0], entry = dive.entry, total = list.filter(item => item.number).length;
  const months = bottomTime(entry), card = PORTFOLIO_CONTENT.about.entries[0], draft = draftFor('experience');
  const links = linkList(entry.links, 'Dive links');
  return [el('div', { class: 'arc-sheet' },
    el('header', { class: 'arc-sheet-head', 'data-hero': true },
      el('div', {},
        el('p', { class: 'holo-label', text: `${SECTIONS.experience.label} · The wreck · ${dive.number ? `Chapter ${pad(dive.number)} of ${pad(total)}` : 'Career chapter'}` }),
        el('h3', { id: 'archive-entry-title', text: entry.title })),
      dive.number && el('p', { class: 'arc-diveno' }, el('span', { class: 'holo-label', text: 'Dive no.' }), el('strong', { text: pad(dive.number) }))),
    // The role is the page heading, so the boxes start with the facts the heading does not carry.
    fields([
      entry.org && ['Operator', entry.org, 'organisation'],
      entry.start && ['Descent', monthLabel(entry.start), 'start date'],
      entry.start && ['Ascent', entry.end ? monthLabel(entry.end) : 'Still down', entry.end ? 'end date' : 'present'],
      months !== null && ['Bottom time', `${duration(months)}${entry.end ? '' : ' to date'}`, 'time in role, from the dates'],
      entry.site && ['Dive site', entry.site, 'location'],
      // Shown only when an entry carries them; nothing is assumed for an entry that does not.
      entry.conditions && ['Conditions', entry.conditions],
      entry.buddy && ['Buddy', entry.buddy, 'worked alongside'],
      entry.verifiedBy && ['Verified by', entry.verifiedBy],
    ], 'arc-strip arc-strip--sheet'),
    diveChart(dive, list),
    draft && el('p', { class: 'arc-draftline', 'data-rise': true }, draft, draftBadge()),
    el('p', { class: 'arc-intro', 'data-rise': true, text: entry.summary }),
    block('Log notes', 'arc-notes', el('div', { class: 'arc-prose' }, paragraphs(entry.body))),
    entry.facts.length && block('Observations', 'arc-observations', el('ul', { class: 'arc-facts' }, entry.facts.map(text => el('li', { text })))),
    links && block('Links', 'arc-links-title', links),
    // Decoration only: the diver signs their own log, and the stamp repeats facts already in the boxes above.
    el('footer', { class: 'arc-sheet-foot', 'data-rise': true },
      card.name && el('p', { class: 'arc-sign' }, el('span', { class: 'holo-label', text: 'Logged by' }), el('strong', { text: card.name }),
        el('span', { class: 'arc-sign-line', 'aria-hidden': 'true' }, signature())),
      el('p', { class: 'arc-stamp', 'aria-hidden': 'true' }, el('span', { text: 'Logged' }), el('strong', { text: dive.number ? `Dive ${pad(dive.number)}` : 'Dive' }), el('span', { text: entry.end ? monthLabel(entry.end) : entry.start ? 'Still down' : entry.org || '' }))))];
}
function signature() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 160 40'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = '<path d="M4 30c10-22 16-24 18-8s8-26 16-12 6 16 14 0 10 10 20 4 14-16 22-6 20 14 62 2"/>';
  return svg;
}
function findCard(find) {
  return el('li', { 'data-rise': true }, el('button', { type: 'button', class: 'arc-find', 'data-go': `finds/${find.entry.id}`, 'data-entry': find.entry.id },
    el('span', { class: 'arc-thumb' }, thumb(find)),
    el('span', { class: 'arc-find-meta' }, el('span', { class: 'holo-label', text: `Find ${pad(find.number)}` }), el('span', { class: 'arc-find-kind', text: find.kind })),
    el('strong', { text: find.entry.title }),
    el('span', { class: 'arc-find-line', text: find.entry.summary }),
    find.status && el('span', { class: 'arc-find-status', text: find.status })));
}
function renderCatalogue() {
  const section = PORTFOLIO_CONTENT.projects, list = finds();
  return [
    el('header', { class: 'arc-pagehead', 'data-hero': true },
      el('p', { class: 'holo-label', text: `Projects · The treasure · ${list.length} stories` }),
      el('h3', { id: 'archive-entry-title', text: SECTIONS.projects.label }),
      intro('projects', section.subtitle, false)),
    el('ul', { class: 'arc-grid' }, list.map(findCard)),
  ];
}
// Each project offers a quick brief, the decision behind it, and an optional deeper reading layer.
function renderFind(id) {
  const list = finds(), find = list.find(item => item.entry.id === id) || list[0], entry = find.entry, story = entry.caseStudy;
  const links = linkList(entry.links, `${entry.title} links`);
  const visual = figure(entry.id) || diagram(entry);
  return [
    el('header', { class: 'arc-pagehead arc-case-head', 'data-hero': true },
      el('button', { type: 'button', class: 'arc-back', 'data-go': 'finds', 'data-focus': `.arc-find[data-entry="${entry.id}"]` }, glyph('previous'), 'All projects'),
      el('p', { class: 'holo-label', text: `Project ${pad(find.number)} · ${entry.tag}` }),
      el('h3', { id: 'archive-entry-title', text: entry.title }),
      el('p', { class: 'arc-intro', text: entry.summary }),
      story && el('p', { class: 'arc-role' }, el('span', { class: 'holo-label', text: 'My role' }), el('span', { text: story.role }))),
    visual && el('div', { class: 'arc-case-visual', 'data-project': entry.id, 'data-rise': true }, visual),
    story ? el('div', { class: 'arc-story' },
      block(['The problem', '01'], 'arc-problem', el('p', { text: story.problem })),
      block(['The decision', '02'], 'arc-decision', el('p', { text: story.decision })),
      block(['What came out of it', '03'], 'arc-outcome', el('p', { text: story.outcome })),
      block(['The takeaway', '04'], 'arc-learning', el('p', { text: story.learning }))) : block('Overview', 'arc-what', el('div', { class: 'arc-prose' }, paragraphs(entry.body))),
    entry.facts.length && el('details', { class: 'arc-depth', 'data-rise': true },
      el('summary', {}, 'Go a little deeper', glyph('next')),
      el('div', { class: 'arc-prose' }, paragraphs(entry.body)),
      el('ul', { class: 'arc-facts' }, entry.facts.map(text => el('li', { text })))),
    story?.evidence && el('aside', { class: 'arc-evidence', 'data-rise': true }, glyph('compass'), el('p', {}, el('strong', { text: 'About the evidence. ' }), story.evidence)),
    links && block('Explore the work', 'arc-open', links),
  ];
}
// The resume as a document in its sleeve: preview, download, open, and the printable summary of the records.
function renderCard(id) {
  const section = PORTFOLIO_CONTENT.resume, entry = section.entries.find(item => item.id === id) || section.entries[0];
  const print = el('button', { type: 'button', class: 'arc-linklike', 'data-print': true }, glyph('print'), 'Print the records summary');
  return [
    el('header', { class: 'arc-pagehead', 'data-hero': true },
      el('p', { class: 'holo-label', text: 'Résumé · The logbook' }),
      el('h3', { id: 'archive-entry-title', text: entry.title }),
      intro('resume', entry.summary, false)),
    el('div', { class: 'arc-export' },
      el('div', { class: 'arc-sleeve', 'data-rise': true },
        el('p', { class: 'arc-sleeve-tab' }, el('span', { text: SECTIONS.resume.label }), [entry.format, entry.issued].filter(Boolean).map(text => el('span', { text }))),
        figure(entry.id, 'arc-media--sleeve')),
      el('div', { class: 'arc-export-text' },
        el('div', { class: 'arc-prose', 'data-rise': true }, paragraphs(entry.body)),
        entry.facts.length && block('Card details', 'arc-details', el('ul', { class: 'arc-facts' }, entry.facts.map(text => el('li', { text })))),
        block('Export', 'arc-actions', linkList(entry.links, 'Resume actions', print)))),
  ];
}
function render(stop) {
  const { section, id } = stop;
  if (section === GLANCE) return renderGlance();
  if (section === 'about') return stop.index === stopsFor('about')[0].index ? renderProfile() : renderRules(id);
  if (section === 'experience') return renderDive(id);
  if (section === 'resume') return renderCard(id);
  return id === CATALOGUE ? renderCatalogue() : renderFind(id);
}

// The shell: breadcrumb, tools, progress track and status line are part of the dialog's markup in index.html.
// They are created here when a page still carries the earlier markup, so the records never depend on it.
let crumbs = panel.querySelector('#archive-crumbs'), copyButton = panel.querySelector('#archive-copy'), printButton = panel.querySelector('#archive-print');
let track = panel.querySelector('#archive-progress'), live = panel.querySelector('#archive-live'), toggle = null, railBuilt = false;
function ensureShell() {
  panel.querySelector('.arc-tabs')?.remove();
  const closeButton = panel.querySelector('.dialog-close');
  if (!crumbs) { crumbs = el('nav', { id: 'archive-crumbs', class: 'arc-crumbs', 'aria-label': 'You are here' }); panel.querySelector('.arc-identity p')?.replaceWith(crumbs); if (!crumbs.isConnected) panel.querySelector('#landmark-title').after(crumbs); }
  if (!copyButton || !printButton) {
    copyButton = el('button', { id: 'archive-copy', class: 'arc-tool', type: 'button' }, el('span', { text: 'Copy link' }));
    printButton = el('button', { id: 'archive-print', class: 'arc-tool', type: 'button' }, el('span', { text: 'Print' }));
    const tools = el('div', { class: 'arc-tools' });
    closeButton.before(tools); tools.append(copyButton, printButton, closeButton);
  }
  if (!track) {
    const progress = el('div', { class: 'arc-progress' });
    track = el('span', { id: 'archive-progress', class: 'arc-progress-track', 'aria-hidden': 'true' });
    counter.before(progress); progress.append(counter, track);
  }
  if (!live) { live = el('p', { id: 'archive-live', class: 'arc-live', role: 'status', 'aria-live': 'polite' }); panel.append(live); }
  indexNav.setAttribute('aria-label', 'Records contents'); counter.removeAttribute('aria-hidden');
  copyButton.prepend(glyph('link')); printButton.prepend(glyph('print'));
  copyButton.setAttribute('aria-label', 'Copy a link to this page'); printButton.setAttribute('aria-label', 'Print or save a summary of the records');
  panel.querySelector('.arc-emblem')?.replaceChildren(icon('computer'));
  previousButton.prepend(glyph('previous')); nextButton.append(glyph('next'));
}
// The rail lists every page of the records under its section. Built once, the first time the records open.
function buildRail() {
  const groups = Object.keys(SECTIONS).map((id, number) => {
    const stops = stopsFor(id), meta = SECTIONS[id];
    return el('li', { 'data-group': id },
      el('button', { type: 'button', class: 'arc-rail-section', 'data-section': id, 'aria-label': meta.label },
        id === GLANCE ? glyph('compass') : icon(id),
        el('span', { class: 'arc-rail-name' }, el('span', { class: 'arc-tab-long', text: meta.label }), el('span', { class: 'arc-tab-short', 'aria-hidden': 'true', text: meta.short }), el('small', { text: meta.site })),
        id !== GLANCE && el('small', { class: 'arc-rail-no', 'aria-hidden': 'true', text: pad(number) })),
      stops.length > 1 && el('ol', { class: 'arc-rail-entries', id: `archive-rail-${id}` }, stops.map(stop =>
        el('li', {}, el('button', { type: 'button', 'data-stop': stop.hash }, el('span', { class: 'holo-label', 'aria-hidden': !stop.mark && 'true', text: stop.mark || '' }), el('strong', { text: stop.title }), el('span', { class: 'arc-seen', 'aria-hidden': 'true' }, glyph('check')))))));
  });
  toggle = el('button', { type: 'button', class: 'arc-index-toggle', 'aria-expanded': 'false' }, el('span', { class: 'holo-label' }), el('span'), el('span', { class: 'arc-count' }));
  // First in the rail for keyboard readers: straight to the page, past the list of every other page.
  const skip = el('button', { type: 'button', class: 'arc-skip', text: 'Skip to the page' });
  skip.addEventListener('click', event => { event.stopPropagation(); page.focus(); });
  indexNav.replaceChildren(skip, el('ol', { class: 'arc-rail' }, groups), toggle);
  track.replaceChildren(...sequence().map((stop, index, list) => el('i', { 'data-group': stop.section, 'data-first': index > 0 && list[index - 1].section !== stop.section })));
  railBuilt = true;
}
function setIndexOpen(open) {
  indexNav.dataset.open = String(open); toggle?.setAttribute('aria-expanded', String(open));
}

let sectionId = GLANCE, entryId = GLANCE, rendered = null, position = 0, announced = null;
function paint(stop) {
  const list = sequence(), stops = stopsFor(stop.section), meta = SECTIONS[stop.section];
  counter.textContent = `${pad(stop.index + 1)} / ${pad(list.length)}`;
  counter.setAttribute('aria-label', `Page ${stop.index + 1} of ${list.length}`);
  for (const [button, target, word] of [[previousButton, list[stop.index - 1], 'Previous'], [nextButton, list[stop.index + 1], 'Next']]) {
    button.setAttribute('aria-disabled', String(!target));
    button.setAttribute('aria-label', target ? `${word}: ${SECTIONS[target.section].label}, ${stopName(target)}` : `No ${word.toLowerCase()} page`);
  }
  for (const group of indexNav.querySelectorAll('[data-group]')) {
    const own = group.dataset.group === stop.section, head = group.firstElementChild;
    group.dataset.current = String(own);
    if (own) head.setAttribute('aria-current', stops.length > 1 ? 'true' : 'page'); else head.removeAttribute('aria-current');
  }
  for (const button of indexNav.querySelectorAll('[data-stop]')) {
    if (button.dataset.stop === stop.hash) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    button.dataset.seen = String(memory.seen.has(button.dataset.stop));
  }
  [...track.children].forEach((segment, index) => { segment.dataset.state = index === stop.index ? 'current' : memory.seen.has(list[index].hash) ? 'seen' : 'ahead'; });
  toggle.children[0].textContent = stop.code; toggle.children[1].textContent = stop.title;
  toggle.children[2].textContent = `${stops.length} ${stops.length === 1 ? 'page' : 'pages'}`;
  toggle.setAttribute('aria-controls', `archive-rail-${stop.section}`);
  indexNav.dataset.single = String(stops.length < 2); setIndexOpen(false);
  const trail = [el('li', {}, el('button', { type: 'button', 'data-section': GLANCE, text: 'Records' }))];
  if (stop.section !== GLANCE && stops.length > 1) trail.push(el('li', {}, el('button', { type: 'button', 'data-section': stop.section, text: meta.label })));
  trail.push(el('li', { 'aria-current': 'page', text: stop.section === GLANCE || stops.length > 1 ? stopName(stop) : meta.label }));
  // The breadcrumb is rebuilt, so a reader who was on one of its links is put on the page they asked for.
  const onTrail = crumbs.contains(document.activeElement);
  crumbs.replaceChildren(el('ol', {}, trail));
  if (onTrail) page.focus({ preventScroll: true });
  panel.dataset.section = stop.section; panel.dataset.entry = stop.id;
  if (!panel.open) return;
  // The address always names the page being read, without adding history entries or waking other hash listeners.
  try { history.replaceState(history.state, '', `#${stop.hash}`); } catch {}
  const line = `${meta.label}${stops.length > 1 ? `: ${stopName(stop)}` : ''}. Page ${stop.index + 1} of ${list.length}.`;
  if (line !== announced) live.textContent = announced = line;
}
// Shows a section and one of its entries. Unknown ids fall back to the opening view / the first entry.
// `entry` may be an entry id or its link name (#profile/rules, #finds/all); 'contact' is a place on the diver card.
export function show(id = sectionId, entry = null, options = {}) {
  if (!SECTIONS[id]) id = GLANCE;
  if (!railBuilt) buildRail();
  closeLightbox();
  const stop = findStop(id, entry), key = `${stop.hash}:${variant.value}`, moved = stop.index - position;
  const anchor = options.anchor || (id === 'about' && String(entry).toLowerCase() === 'contact' ? '#arc-contact' : null);
  sectionId = stop.section; entryId = stop.id; position = stop.index;
  if (key !== rendered || options.force) {
    const inside = page.contains(document.activeElement) && !options.focus;
    const nodes = [...render(stop), stop.section !== GLANCE && turner(stop)].flat().filter(Boolean);
    // Entry motion is CSS: the page says which way it was turned and each block carries its place in the stagger.
    if (options.still) page.removeAttribute('data-enter'); else page.dataset.enter = rendered === null || Math.abs(moved) !== 1 ? 'open' : moved > 0 ? 'next' : 'previous';
    let order = 0;
    for (const node of nodes) for (const rise of node.matches('[data-rise]') ? [node] : node.querySelectorAll('[data-rise]')) rise.style.setProperty('--i', Math.min(order++, 8));
    page.replaceChildren(...nodes);
    page.setAttribute('aria-label', `${SECTIONS[stop.section].label}: ${page.querySelector('#archive-entry-title')?.textContent || ''}`);
    if (options.scroll !== false) page.scrollTop = 0;
    rendered = key;
    if (inside) page.focus({ preventScroll: true });
  } else if (!anchor && options.scroll !== false) page.scrollTop = 0;
  remember(stop); paint(stop);
  if (anchor) page.querySelector(anchor)?.scrollIntoView({ block: 'start', behavior: 'auto' });
  if (options.focus) page.querySelector(options.focus)?.focus({ preventScroll: true });
}
/** Turns to the next (1) or previous (-1) page of the whole records, across sections. */
export function step(direction) {
  const target = sequence()[position + direction];
  if (target) show(target.section, target.id);
  return Boolean(target);
}
function go(hash, options) {
  const target = parseHash(hash);
  if (target) show(target.id, target.entry, options);
}
export const current = () => ({ section: sectionId, entry: entryId });
/** Every page of the records in reading order: { section, entry, hash, title }. */
export const stops = () => sequence().map(stop => ({ section: stop.section, entry: stop.id, hash: stop.hash, title: stopName(stop) }));
export function resolveSection(name) {
  const key = String(name || '').toLowerCase();
  return SECTIONS[key] ? key : Object.keys(SECTIONS).find(id => SECTIONS[id].hash === key) || null;
}
/** Called when the records close: the address stops naming a page, and nothing is left open on top. */
export function leave() {
  closeLightbox(); clearPrint();
  try { if (parseHash()) history.replaceState(history.state, '', `${location.pathname}${location.search}`); } catch {}
  announced = null; if (live) live.textContent = '';
}

// Copy link. The address bar already carries the same link, which is the fallback when copying is blocked.
let copyTimer = 0;
async function copyLink() {
  const url = linkFor();
  let done = false;
  // The clipboard may refuse, or (in an embedded or unfocused view) never answer; either way the older route is tried.
  try { await Promise.race([navigator.clipboard.writeText(url), new Promise((resolve, reject) => setTimeout(reject, 1200))]); done = true; } catch {
    const field = el('textarea', { class: 'arc-live', readonly: true, 'aria-hidden': 'true' }); field.value = url;
    const back = document.activeElement; panel.append(field); field.select();
    try { done = document.execCommand('copy'); } catch {}
    field.remove(); back?.focus?.({ preventScroll: true });
  }
  copyButton.dataset.done = String(done); copyButton.querySelector('span').textContent = done ? 'Copied' : 'Copy link';
  live.textContent = announced = done ? 'Link to this page copied.' : 'Copying is blocked here. The link to this page is in the address bar.';
  clearTimeout(copyTimer); copyTimer = setTimeout(() => { delete copyButton.dataset.done; copyButton.querySelector('span').textContent = 'Copy link'; }, 1800);
}

// Printing. The browser prints a plain, ink-friendly summary (profile, log, finds) built from the same content,
// styled by archive-print.css. It exists only between beforeprint and afterprint.
let sheet = null;
function printable() {
  const content = PORTFOLIO_CONTENT, card = content.about.entries[0], rules = content.about.entries.find(entry => entry.id === 'approach');
  const base = card.base ? `Based in ${card.base}` : null, list = dives(), home = `${location.origin}${location.pathname}`;
  const where = link => link.url.replace(/^mailto:|^https:\/\/(www\.)?/, '').replace(/\/$/, '').replace(/^\.\//, home.replace(/[^/]*$/, ''));
  const inline = (links, label) => safeLinks(links).length ? el('p', { class: 'arc-print-links' }, label && el('b', { text: `${label} ` }), safeLinks(links).flatMap((link, index) => [index ? ' · ' : '', `${link.label}: `, el('a', { href: link.url, text: where(link) })])) : null;
  const facts = (items, label) => items.length ? el('p', { class: 'arc-print-facts' }, el('b', { text: `${label}: ` }), items.join(' · ')) : null;
  return el('div', { id: 'arc-print-sheet', class: 'arc-print' },
    el('header', {},
      el('p', { class: 'arc-print-kicker', text: `Dive Explorer · Diver’s records${card.tag ? ` · ${card.tag}` : ''}` }),
      el('h1', { text: card.name ? `${card.name} · ${card.title}` : card.title }),
      el('p', { class: 'arc-print-lead', text: card.summary }),
      el('p', { class: 'arc-print-meta', text: [content.about.subtitle, base].filter(Boolean).join(' · ') }),
      inline(card.links)),
    el('section', {}, el('h2', { text: SECTIONS.about.label }), paragraphs(card.body), facts(card.facts.filter(fact => fact !== base), 'Capabilities'),
      rules && [el('h3', { text: `Dive rules · ${rules.title}` }), el('p', { text: rules.summary }), el('ol', {}, rules.facts.map(text => el('li', { text }))), ...paragraphs(rules.body)]),
    el('section', {}, el('h2', { text: `${SECTIONS.experience.label} · ${content.experience.subtitle}` }), list.map(dive => {
      const entry = dive.entry, months = bottomTime(entry);
      return el('article', {},
        el('h3', {}, `${dive.number ? `Dive ${pad(dive.number)} · ` : ''}${entry.title}`, el('span', { text: [entry.tag, months !== null && `${duration(months)}${entry.end ? '' : ' to date'}`].filter(Boolean).join(' · ') })),
        el('p', { text: entry.summary }), paragraphs(entry.body.filter(text => text !== entry.summary)), facts(entry.facts, 'Observations'), inline(entry.links));
    })),
    el('section', {}, el('h2', { text: `${SECTIONS.projects.label} · ${content.projects.subtitle}` }), finds().map(find =>
      el('article', {},
        el('h3', {}, `Find ${pad(find.number)} · ${find.entry.title}`, el('span', { text: find.entry.tag })),
        el('p', { class: 'arc-print-lead', text: find.entry.summary }), paragraphs(find.entry.body), facts(find.entry.facts, 'Highlights'), inline(find.entry.links)))),
    el('footer', {}, content.resume.entries.map(entry => inline(entry.links.filter(link => !link.download), `${SECTIONS.resume.label} · ${entry.facts.join(' · ')}.`)),
      el('p', { text: `Printed from the Dive Explorer records at ${home}` })));
}
function preparePrint() {
  if (sheet) return;
  if (!document.querySelector('link[href*="archive-print.css"]')) document.head.append(el('link', { rel: 'stylesheet', media: 'print', href: new URL('./archive-print.css', import.meta.url).href }));
  sheet = printable(); document.body.append(sheet); document.documentElement.classList.add('arc-printing');
}
function clearPrint() {
  sheet?.remove(); sheet = null; document.documentElement.classList.remove('arc-printing');
}
/** Prints (or saves as PDF) the one-to-two page summary of the records. */
export function print() { preparePrint(); window.print(); }
addEventListener('beforeprint', () => { if (panel.open) preparePrint(); });
addEventListener('afterprint', clearPrint);

function flip(button) {
  const card = button.closest('.arc-cert'), turned = card.dataset.face !== 'back';
  card.dataset.face = turned ? 'back' : 'front';
  card.querySelector('.arc-cert-front').inert = turned; card.querySelector('.arc-cert-back').inert = !turned;
  button.setAttribute('aria-pressed', String(turned)); button.querySelector('span').textContent = turned ? 'Turn the card back' : 'Turn the card over';
  live.textContent = announced = turned ? 'Card back: capabilities and operating principles.' : 'Card front.';
}

ensureShell();
page.addEventListener('click', event => {
  const control = event.target.closest?.('[data-go],[data-step],[data-lightbox],[data-flip],[data-print]');
  if (!control || !page.contains(control)) return;
  if (control.dataset.lightbox) openLightbox(panel, media[control.dataset.lightbox], control);
  else if (control.dataset.flip !== undefined) flip(control);
  else if (control.dataset.print !== undefined) print();
  else if (control.dataset.step) step(Number(control.dataset.step));
  else go(control.dataset.go, { focus: control.dataset.focus });
});
indexNav.addEventListener('click', event => {
  const control = event.target.closest?.('button');
  if (!control) return;
  if (control === toggle) setIndexOpen(indexNav.dataset.open !== 'true');
  else if (control.dataset.stop) go(control.dataset.stop);
  else if (control.dataset.section) show(control.dataset.section);
  // On a small screen the page menu closes behind the choice; focus follows the reader to the page.
  if (control !== toggle && !control.offsetParent) page.focus({ preventScroll: true });
});
crumbs.addEventListener('click', event => { const section = event.target.closest?.('[data-section]')?.dataset.section; if (section) show(section); });
copyButton.addEventListener('click', copyLink);
printButton.addEventListener('click', print);
previousButton.addEventListener('click', () => step(-1));
nextButton.addEventListener('click', () => step(1));
// Left and right turn the pages. Heard on the document, so the keys still work when focus has fallen back to the
// page body, and only while the records are open.
document.addEventListener('keydown', event => {
  if (!panel.open || !['ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (lightboxOpen() || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
  // The dialog owns the arrow keys while it is open, so the scene behind never turns.
  event.preventDefault(); event.stopPropagation(); step(event.key === 'ArrowRight' ? 1 : -1);
});

try { variant.value = localStorage.getItem('ocean-copy-variant') || 'baseline'; } catch {}
if (!['baseline', ...Object.keys(COPY_VARIANTS)].includes(variant.value)) variant.value = 'baseline';
variant.addEventListener('change', () => {
  show(sectionId, entryId, { force: true, still: true, scroll: false });
  try { localStorage.setItem('ocean-copy-variant', variant.value); } catch {}
});
