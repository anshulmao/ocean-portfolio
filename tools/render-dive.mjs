// The reading site's markup, drawn from the portfolio sheet in the ocean (ocean-refined/archive.js): the same sections in
// the same order (About, Experience, Projects, Résumé), the same night palette with one light per section, and the same
// pieces (the portrait hero, the career track, the project finds, the case-study blocks, the résumé and its versions).
// The page reads as a dive: it starts at the surface and the water darkens with the scroll, a depth gauge counts down to
// 40 m, and each section rises in as it is reached. All of it is markup and CSS (portfolio-dive.css); there is no script,
// so every link, anchor and disclosure works without JavaScript and the motion is skipped where it is not supported.
import {readingIcon as icon} from './reading-icons.mjs';
import {PROJECT_SECTIONS} from '../ocean-refined/portfolio-content.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthIndex = value => { const [year, month] = value.split('-').map(Number); return year * 12 + month - 1; };
const monthLabel = value => { const [year, month] = value.split('-').map(Number); return `${MONTHS[month - 1]} ${year}`; };
const duration = months => {
  const years = Math.floor(months / 12), rest = months % 12;
  return [years && `${years} yr${years > 1 ? 's' : ''}`, rest && `${rest} mo`].filter(Boolean).join(' ') || 'Under 1 mo';
};
const pad = n => String(n).padStart(2, '0');

// Each section is read at a depth and lit by the colour of its site in the ocean (archive.css, section tints).
export const DIVE_SECTIONS = [
  {id: 'about', label: 'About', depth: 8, tint: '#7ff0cf'},
  {id: 'experience', label: 'Experience', depth: 16, tint: '#ffcf7a'},
  {id: 'projects', label: 'Projects', depth: 26, tint: '#c9a2ff'},
  {id: 'resume', label: 'Résumé', depth: 34, tint: '#ff9d8a'},
  {id: 'contact', label: 'Contact', depth: 40, tint: '#8ff4ff'},
];
export const PROJECT_ICONS = {rae: 'build', reengage: 'chat', sage: 'health', wattmana: 'energy', 'ocean-world': 'wave', openclaw: 'code'};
const ACCENTS = {rae: 'rae', reengage: 'engage', sage: 'sage', wattmana: 'watt', 'ocean-world': 'world', openclaw: 'claw'};
export const accentStyle = id => `--accent:var(--o-${ACCENTS[id] ?? 'accent'})`;

export function diveRenderer({escape, localURL, media, content, now = new Date()}) {
  const projects = content.projects.entries;
  const overview = content.about.entries.find(entry => entry.id === 'overview') ?? content.about.entries[0];
  const approach = content.about.entries.find(entry => entry.id === 'approach');
  const resume = content.resume.entries[0];
  const roles = [...content.experience.entries].sort((a, b) => (b.start ? monthIndex(b.start) : -1) - (a.start ? monthIndex(a.start) : -1));
  const thisMonth = now.getFullYear() * 12 + now.getMonth();
  const roleEnd = entry => entry.end ? monthIndex(entry.end) : thisMonth;
  const split = entry => { const [kind, ...rest] = entry.tag.split(' · '); return {kind, status: rest.join(' · ') || null}; };

  const external = url => url.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : '';
  const newTab = url => url.startsWith('https:') ? '<span class="sr-only"> (opens a new tab)</span>' : '';
  const linkIcon = link => link.download ? 'download' : link.url.startsWith('mailto:') ? 'mail' : /github/.test(link.url) ? 'code' : /linkedin/.test(link.url) ? 'users' : 'diagonal';
  // The sheet's pill: filled for the action the page is for.
  const pill = (link, prefix, primary = false) => {
    const url = localURL(link.url, prefix); if (!url) return '';
    return `<a class="dv-pill${primary ? ' dv-pill--primary' : ''}" href="${escape(url)}"${link.download ? ' download' : ''}${external(url)}><span>${escape(link.label)}</span>${icon(linkIcon(link))}${newTab(url)}</a>`;
  };
  const pills = (links, prefix, label, primaryFirst = false) => {
    const items = (links ?? []).map((link, i) => pill(link, prefix, primaryFirst && i === 0)).filter(Boolean);
    return items.length ? `<div class="dv-pills" role="group" aria-label="${escape(label)}">${items.join('')}</div>` : '';
  };
  const picture = (id, prefix, {eager = false, sizes = ''} = {}) => {
    const asset = media[id]; if (!asset) return '';
    const src = localURL(asset.src, prefix); if (!src) return '';
    return `<img src="${escape(src)}" alt="${escape(asset.alt)}" width="${Number(asset.width)}" height="${Number(asset.height)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${sizes}>`;
  };
  // A project with no screenshot shows its steps on a field of its own colour.
  const plate = entry => `<span class="dv-plate" role="img" aria-label="${escape(entry.title)}${entry.diagram ? `: ${escape(entry.diagram.steps.join(', then '))}` : ''}">${icon(PROJECT_ICONS[entry.id])}${entry.diagram ? `<span class="dv-plate-steps" aria-hidden="true">${entry.diagram.steps.map((step, i) => `<span><b>${pad(i + 1)}</b>${escape(step)}</span>`).join('')}</span>` : ''}</span>`;
  const thumb = (entry, prefix, eager = false) => picture(entry.id, prefix, {eager}) || plate(entry);
  const label = (text, mark) => `<p class="dv-label">${mark ? icon(mark) : ''}<span>${text}</span></p>`;

  // --- The frame of every page: the water, the nav, the gauge and the footer ------------------------------------------
  // Fixed layers behind the page: the water column, the caustics near the surface, marine snow and a few bubbles.
  const ocean = `<div class="dv-ocean" aria-hidden="true"><i class="dv-ocean-light"></i><i class="dv-ocean-snow"></i><i class="dv-ocean-deep"></i>${Array.from({length: 9}, (_, i) => `<b class="dv-bubble" style="--i:${i}"></b>`).join('')}</div>`;
  const nav = (prefix, home) => `<header class="dv-nav"><a class="dv-wordmark" href="${prefix}profile.html${home ? '#top' : ''}" aria-label="Anshul Ramprasad, portfolio home"><span class="dv-monogram" aria-hidden="true">a.</span><span>Anshul Ramprasad<small>Forward deployed AI</small></span></a><nav class="dv-tabs" aria-label="Portfolio"><ul>${DIVE_SECTIONS.map(section => `<li><a href="${home ? '' : prefix + 'profile.html'}#${section.id}" style="--tint:${section.tint}">${section.label}</a></li>`).join('')}</ul></nav><a class="dv-pill dv-pill--dive" href="${prefix}index.html?world=1">${icon('wave')}<span>Dive in</span></a></header>`;
  // The gauge: the dive computer's depth, read off the scroll. Ticks name the sections at their depths.
  const gauge = `<aside class="dv-gauge" aria-hidden="true"><p class="dv-gauge-read"><span class="dv-gauge-value"></span><small>m</small></p><div class="dv-gauge-rail"><i></i>${[{label: 'Surface', depth: 0, tint: '#e8f3f7'}, ...DIVE_SECTIONS].map(stop => `<span style="--at:${stop.depth / 40};--tint:${stop.tint}">${stop.label}</span>`).join('')}</div></aside>`;

  // --- Home ------------------------------------------------------------------------------------------------------------
  const resumeLink = resume?.links?.find(link => link.download);
  const current = roles.find(entry => entry.start && !entry.end);
  const headline = overview.title.split(' ');
  const hero = `<section class="dv-hero" id="top" aria-labelledby="hero-title"><div class="dv-hero-copy reading-hero-copy"><p class="dv-depth-tag"><i></i>00 m · At the surface</p><h1 id="hero-title">${headline.map((word, i) => `<span class="dv-word" style="--i:${i}">${escape(word)}</span>`).join(' ')}</h1><p class="dv-lead">I lead product for an enterprise AI sales platform, combining customer discovery with hands-on work on prompts, routing, retrieval, and evaluations.</p><div class="dv-pills"><a class="dv-pill dv-pill--primary" href="#projects">Explore my work ${icon('arrow')}</a>${resumeLink ? `<a class="dv-pill" href="${escape(localURL(resumeLink.url, './'))}" download>${icon('download')}Download résumé</a>` : ''}</div><dl class="dv-proof"><div><dt>Now</dt><dd>${escape(current?.title ?? '')}<span>${escape(current?.org ?? '')}</span></dd></div><div><dt>Based in</dt><dd>${escape(overview.base)}<span>Malaysia</span></dd></div><div><dt>Focus</dt><dd>Forward deployed AI<span>Product &amp; engineering</span></dd></div></dl></div><figure class="dv-porthole"><div class="dv-porthole-glass"><picture><source srcset="./assets/portfolio/surface-night.jpg" media="(prefers-color-scheme: dark)"><img src="./assets/portfolio/surface-day.jpg" alt="The ocean surface in my interactive portfolio" width="720" height="840" fetchpriority="high" decoding="async"></picture><i class="dv-porthole-sweep" aria-hidden="true"></i></div><figcaption><span>A little of my world</span><a class="dv-pill dv-pill--small dv-pill--ping" href="./index.html?world=1">Take a dive ${icon('diagonal')}</a></figcaption></figure><a class="dv-descend" href="#about"><span>Scroll to descend</span><i aria-hidden="true"></i></a></section>`;

  const section = (id, body, extra = '') => {
    const info = DIVE_SECTIONS.find(item => item.id === id);
    return `<section id="${id}" class="dv-section dv-section--${id}" style="--tint:${info.tint}" aria-labelledby="${id}-title"${extra}><p class="dv-site" aria-hidden="true"><i></i>${pad(info.depth)} m · ${info.label}</p>${body}</section>`;
  };
  const head = (id, title, strap, aside = '') => `<header class="dv-head${aside ? ' dv-head--stat' : ''}"><div><h2 id="${id}-title">${title}</h2>${strap ? `<p class="dv-strap">${strap}</p>` : ''}</div>${aside}</header>`;

  // About: who this is and how to reach them, then the story in three parts with a rail that fills as each is read.
  const contacts = (overview.links ?? []).filter(link => localURL(link.url, './'));
  const rules = (approach?.facts ?? []).map((fact, i) => ({title: fact, text: approach.body[i] ?? ''}));
  const chapters = [
    {id: 'in-short', label: 'In short', body: `<p class="dv-chapter-lead">${escape(overview.summary)}</p><div class="dv-spoken">${overview.body.map(text => `<p>${escape(text)}</p>`).join('')}</div>`},
    approach && {id: 'approach', label: approach.tag || 'How I work', body: `<h3 class="dv-chapter-title">${escape(approach.title)}</h3><p class="dv-chapter-strap">${escape(approach.summary)}</p><ol class="dv-focus" aria-label="Working principles">${rules.map(rule => `<li><strong>${escape(rule.title)}</strong><p>${escape(rule.text)}</p></li>`).join('')}</ol>`},
    approach?.examples?.length && {id: 'in-the-work', label: 'In the work', body: `<h3 class="dv-chapter-title">Examples from my work</h3><ul class="dv-focus" aria-label="In the work">${approach.examples.map(example => { const project = projects.find(entry => entry.id === example.project); return `<li><strong>${escape(example.title)}</strong><p>${escape(example.text)}</p>${project ? `<a class="dv-chip" href="./projects/${project.id}/index.html" style="${accentStyle(project.id)}">${escape(project.title)} ${icon('arrow')}</a>` : ''}</li>`; }).join('')}</ul>`},
  ].filter(Boolean);
  const about = section('about', `<div class="dv-intro"><figure class="dv-portrait">${picture('overview', './')}</figure><div class="dv-intro-text"><h2 id="about-title">Hi, I’m ${escape(overview.name || 'Anshul')}.</h2><p class="dv-intro-role">${escape(overview.role || overview.title)}</p><ul class="dv-where" aria-label="Where and what"><li>${icon('pin')}<span>${escape(overview.base)}</span></li>${current ? `<li>${icon('briefcase')}<span>${escape(current.title)} at ${escape(current.org)}</span></li>` : ''}<li>${icon('wave')}<span>Certified diver at ten</span></li></ul><div class="dv-pills" role="group" aria-label="Résumé and contact">${resumeLink ? pill({...resumeLink, label: 'Download résumé'}, './', true) : ''}${contacts.map(link => pill(link, './')).join('')}</div></div></div><div class="dv-tale" style="timeline-scope:${chapters.map((_, i) => `--chapter-${i}`).join(',')}"><nav class="dv-rail" aria-label="About me, in three parts"><ol>${chapters.map((item, i) => `<li><a href="#${item.id}" style="--t:--chapter-${i}"><i aria-hidden="true"></i><span>${item.label}</span></a></li>`).join('')}</ol></nav><div class="dv-chapters">${chapters.map((item, i) => `<article class="dv-chapter" id="${item.id}" style="view-timeline-name:--chapter-${i}" aria-labelledby="${item.id}-label"><p class="dv-chapter-label" id="${item.id}-label">${item.label}</p>${item.body}</article>`).join('')}</div></div>`);

  // Experience: the time at the organisation, the career on one track, then each role, newest first.
  const dated = roles.filter(entry => entry.start).sort((a, b) => monthIndex(a.start) - monthIndex(b.start));
  const first = monthIndex(dated[0].start), last = Math.max(...dated.map(roleEnd)), span = Math.max(1, last - first);
  const at = month => `${((month - first) / span * 100).toFixed(2)}%`;
  const ongoing = dated.some(entry => !entry.end), org = dated.every(entry => entry.org === dated[0].org) && dated[0].org;
  const ticks = []; for (let month = Math.ceil((first + 1) / 12) * 12; month < last - 2; month += 12) ticks.push(month);
  const stat = `<p class="dv-stat"><b>${duration(last - first)}</b><span>across ${dated.length} roles${org ? ` at ${escape(org)}` : ''}${ongoing ? ', and counting' : ''}</span></p>`;
  const roleIndex = new Map(roles.map((entry, i) => [entry.id, i]));
  const track = `<div class="dv-track" role="group" aria-label="Career track, ${monthLabel(dated[0].start)} to ${ongoing ? 'present' : monthLabel(dated.at(-1).end)}"><div class="dv-track-bar">${dated.map((entry, i) => `<a class="dv-track-seg" href="#${escape(entry.id)}" style="left:${at(monthIndex(entry.start))};width:${((roleEnd(entry) - monthIndex(entry.start)) / span * 100).toFixed(2)}%;--n:${i};--t:--role-${roleIndex.get(entry.id)}" aria-label="${escape(entry.title)}, ${monthLabel(entry.start)} to ${entry.end ? monthLabel(entry.end) : 'present'}"></a>`).join('')}</div><div class="dv-track-axis" aria-hidden="true"><span data-edge="start">${monthLabel(dated[0].start)}</span>${ticks.map(month => `<span style="left:${at(month)}"${(month - first) / span < .16 || (last - month) / span < .16 ? ' data-tight' : ''}>${month / 12}</span>`).join('')}<span data-edge="end">${ongoing ? 'Present' : monthLabel(dated.at(-1).end)}</span></div></div>`;
  const roleCard = (entry, i) => {
    const months = entry.start ? roleEnd(entry) - monthIndex(entry.start) : null, live = Boolean(entry.start && !entry.end);
    const stages = (entry.stages ?? []).filter(stage => stage.start && stage.end).sort((a, b) => monthIndex(b.start) - monthIndex(a.start));
    const facts = entry.facts.filter(fact => !(entry.stages ?? []).some(stage => fact.startsWith(stage.label)) && fact !== entry.site);
    return `<li id="${escape(entry.id)}" class="dv-role reading-role${live ? ' dv-role--now' : ''}" style="view-timeline-name:--role-${i}"><div class="dv-role-when"><i class="dv-role-dot" aria-hidden="true"></i>${entry.start ? `<b>${monthLabel(entry.start)} — ${entry.end ? monthLabel(entry.end) : 'Present'}</b><span>${duration(months)}${live ? ' so far' : ''}</span>` : `<b>${escape(entry.tag)}</b>`}</div><div class="dv-role-body"><h3>${escape(entry.title)}</h3><p class="dv-role-org">${escape([entry.org, entry.site].filter(Boolean).join(' · ') || entry.tag)}</p><p class="dv-role-lead">${escape(entry.summary)}</p>${(entry.body ?? []).map(text => `<p>${escape(text)}</p>`).join('')}${stages.length ? `<ul class="dv-stages" aria-label="Titles held">${stages.map(stage => `<li><b>${escape(stage.label)}</b><span>${monthLabel(stage.start)} — ${monthLabel(stage.end)}</span></li>`).join('')}</ul>` : ''}${facts.length ? `<ul class="dv-facts" aria-label="Covered">${facts.map(text => `<li>${icon('check')}<span>${escape(text)}</span></li>`).join('')}</ul>` : ''}</div></li>`;
  };
  const experience = section('experience', `${head('experience', escape(content.experience.title), escape(content.experience.subtitle), stat)}<div class="dv-career" style="timeline-scope:${roles.map((_, i) => `--role-${i}`).join(',')}">${track}<ol class="dv-roles"><i class="dv-roles-fill" aria-hidden="true"></i>${roles.map(roleCard).join('')}</ol></div>`);

  // Projects: every find on one grid, each in its own colour.
  const find = (entry, i) => {
    const {kind, status} = split(entry);
    return `<li class="dv-find-item" style="--n:${i % 3}"><a class="dv-find reading-project-card" href="./projects/${entry.id}/index.html" style="${accentStyle(entry.id)}"><span class="dv-find-art">${thumb(entry, './', i < 3)}</span><span class="dv-find-text"><span class="dv-find-kind">${icon(PROJECT_ICONS[entry.id])}${escape(kind)}</span><strong>${escape(entry.title)}</strong><span class="dv-find-line">${escape(entry.summary)}</span></span><span class="dv-find-foot">${status ? `<span class="dv-chip">${escape(status)}</span>` : ''}<span class="dv-find-open">Read the story ${icon('arrow')}</span></span></a></li>`;
  };
  const work = section('projects', `${head('projects', escape(content.projects.title), escape(content.projects.subtitle))}<p class="dv-count">${projects.length} projects · open one to read the story</p><ul class="dv-grid" aria-label="Projects">${projects.map(find).join('')}</ul>`);

  // Résumé: the document, and the ways to take it.
  const others = (resume?.alternatives ?? []).filter(link => localURL(link.url, './'));
  const resumeSection = resume ? section('resume', `<div class="dv-resume"><a class="dv-document" href="${escape(localURL(resumeLink.url, './'))}"${external(resumeLink.url)} aria-label="Open the featured résumé PDF">${picture('portfolio-resume', './')}<span class="dv-document-open">${icon('diagonal')}Open the full résumé</span></a><div class="dv-resume-text">${head('resume', 'Résumé', escape(resume.summary))}<p class="dv-resume-meta">${escape(resume.facts.join(' · '))}</p><div class="dv-prose">${resume.body.map(text => `<p>${escape(text)}</p>`).join('')}</div>${pills(resume.links, './', 'Résumé', true)}${others.length ? `<div class="dv-versions"><p>Other versions</p><ul>${others.map((link, i) => `<li style="--n:${i}"><a href="${escape(localURL(link.url, './'))}" download>${icon('file')}<span>${escape(link.label)}</span>${icon('download')}</a></li>`).join('')}</ul></div>` : ''}</div></div>`) : '';

  const contact = section('contact', `<div class="dv-contact"><h2 id="contact-title">Have a customer problem<br>that needs building?</h2><div><p>I’m looking for forward deployed product and engineering roles in AI. Email is the fastest way to reach me.</p>${pills([...contacts].sort((a, b) => b.url.startsWith('mailto:') - a.url.startsWith('mailto:')), './', 'Contact', true)}<p class="dv-contact-foot"><a class="dv-textlink" href="#top">${icon('arrow')}Back to the surface</a><a class="dv-quietlink" href="./privacy.html">Privacy</a></p></div></div>`);

  const home = hero + about + experience + work + resumeSection + contact;

  // --- A project: what it is, my part, the screens, then the story in blocks ----------------------------------------
  const STORY = PROJECT_SECTIONS;
  const project = index => {
    const entry = projects[index], study = entry.caseStudy, {kind, status} = split(entry), prefix = '../../';
    const neighbours = [[projects[index - 1], 'Previous', 'prev'], [projects[index + 1] ?? projects[0], index + 1 < projects.length ? 'Next' : 'Back to the first', 'next']].filter(([target]) => target);
    const parts = STORY.filter(([key]) => study?.[key]);
    const screens = (entry.gallery ?? []).filter(id => media[id] && media[id].src !== media[entry.id]?.src);
    const hero = media[entry.id]
      ? `<figure class="dv-case-visual"><a class="dv-frame" href="${escape(localURL(media[entry.id].src, prefix))}" target="_blank" rel="noopener noreferrer" aria-label="View full-size image: ${escape(media[entry.id].caption)}">${picture(entry.id, prefix, {eager: true})}</a><figcaption>${escape(media[entry.id].caption)}</figcaption></figure>`
      : `<figure class="dv-case-visual dv-case-visual--plate">${plate(entry)}<figcaption>${escape(entry.diagram?.caption ?? entry.title)}</figcaption></figure>`;
    const blocks = parts.map(([key, title, mark], i) => {
      const texts = Array.isArray(study[key]) ? study[key] : [study[key]];
      return `<section class="dv-block dv-block--${key} reading-story-section" id="story-${key}" aria-labelledby="heading-${key}"><h2 id="heading-${key}"><span aria-hidden="true">${pad(i + 1)}</span>${icon(mark)}${title}</h2>${texts.map(text => `<p>${escape(text)}</p>`).join('')}</section>`;
    }).join('');
    const gallery = screens.length ? `<section class="dv-screens" aria-labelledby="screens-title"><header class="dv-head"><div><p class="dv-label">Inside the product</p><h2 id="screens-title">${escape(entry.galleryTitle || 'Product screens')}</h2>${entry.galleryIntro ? `<p class="dv-strap">${escape(entry.galleryIntro)}</p>` : ''}</div></header><ol class="dv-screen-grid${entry.galleryLayout === 'wide' ? ' dv-screen-grid--wide' : ''}">${screens.map((id, i) => { const asset = media[id]; return `<li style="--n:${i % 2}"><figure><a class="dv-frame" href="${escape(localURL(asset.src, prefix))}" target="_blank" rel="noopener noreferrer" aria-label="View full-size image: ${escape(asset.caption)}">${picture(id, prefix)}</a><figcaption><span>${pad(i + 1)}</span><div><strong>${escape(asset.caption)}</strong>${asset.description ? `<p>${escape(asset.description)}</p>` : ''}</div></figcaption></figure></li>`; }).join('')}</ol></section>` : '';
    const diagram = entry.diagram && media[entry.id] ? `<div class="dv-diagram"><p>${escape(entry.diagram.label)}</p><ol>${entry.diagram.steps.map((step, i) => `<li><span>${pad(i + 1)}</span><strong>${escape(step)}</strong></li>`).join('')}</ol><small>${escape(entry.diagram.caption ?? '')}</small></div>` : '';
    const main = `<div class="dv-case" style="${accentStyle(entry.id)}"><nav class="dv-crumb" aria-label="Breadcrumb"><a class="dv-pill dv-pill--small" href="${prefix}profile.html#projects">${icon('arrow')}<span>All projects</span></a><span class="dv-crumb-count">${index + 1} of ${projects.length}</span></nav><header class="dv-case-head"><p class="dv-kind">${icon(PROJECT_ICONS[entry.id])}<span>${escape(kind)}</span>${status ? `<span class="dv-chip">${escape(status)}</span>` : ''}</p><h1>${escape(entry.title)}</h1><p class="dv-strap">${escape(entry.summary)}</p></header>${hero}<div class="dv-story">${blocks}</div>${diagram}<section class="dv-block dv-project-links" aria-labelledby="project-links-title"><h2 id="project-links-title">Links</h2>${pills(entry.links, prefix, `${entry.title} links`, true)}</section>${gallery}<aside class="dv-exit" aria-label="Keep exploring"><a class="dv-ocean-link" href="${prefix}index.html?world=1#finds/${encodeURIComponent(entry.id)}">${icon('wave')}<span>Explore the ocean<strong>Find ${escape(entry.title)} underwater</strong></span>${icon('diagonal')}</a><nav class="dv-turner" aria-label="Other projects">${neighbours.map(([target, word, side]) => `<a class="dv-turn dv-turn--${side}" href="../${target.id}/index.html" style="${accentStyle(target.id)}"><span class="dv-turn-art" aria-hidden="true">${thumb(target, prefix)}</span><span class="dv-turn-text"><span>${word} project</span><strong>${escape(target.title)}</strong></span>${icon('arrow')}</a>`).join('')}</nav></aside></div>`;
    return main;
  };

  return {ocean, nav, gauge, home, project};
}
