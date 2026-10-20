import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const templateRoot=path.join(path.dirname(fileURLToPath(import.meta.url)),'templates');
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const projectPath=id=>`projects/${id}/index.html`;
const sectionNames={projects:'Work',about:'About',experience:'Experience',resume:'Résumé',contact:'Contact'};
// Each project keeps one hue everywhere it appears (tokens.css --o-*); unknown ids use the UI accent.
const ACCENTS={rae:'rae',reengage:'engage',wattmana:'watt',sage:'sage',openclaw:'claw','ocean-world':'world'};
const accent=id=>`--c:var(--o-${ACCENTS[id]??'accent'})`;
const pad=n=>String(n).padStart(2,'0');

// Public pages and the in-world archive read the same content module. This renderer imports no
// browser/world code and emits no runtime JS. The look is design/ui-overhaul/depth.html, screens
// 04 and 05: the page background descends through the depth ramp, surfaces are tinted glass, and
// dark mode follows the visitor's system setting (tokens.css: a root without data-theme).
export async function renderPortfolio({out,content,media={},siteURL}){
  const origin=new URL(siteURL).origin;
  const projects=content.projects.entries;
  const ids=new Set();
  for(const entry of projects){
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)||ids.has(entry.id))throw Error('Invalid or duplicate project route: '+entry.id);
    ids.add(entry.id);
  }
  const overview=content.about.entries.find(entry=>entry.id==='overview')??content.about.entries[0];
  const approach=content.about.entries.find(entry=>entry.id==='approach');
  const resumeEntry=content.resume.entries[0];
  const publicLinks=(overview.links??[]).filter(link=>/^https:\/\/(?:www\.)?(?:linkedin\.com|github\.com)\//.test(link.url)).map(link=>link.url);
  const person={'@context':'https://schema.org','@type':'Person','@id':origin+'/profile.html#person',name:'Anshul Ramprasad',url:origin+'/profile.html',jobTitle:overview.role??overview.tag,sameAs:publicLinks};
  const paths=[];

  const localURL=(value,prefix)=>{
    if(/^https:\/\//.test(value)||/^mailto:/.test(value))return value;
    if(/^\.\/assets\/[a-zA-Z0-9_./-]+$/.test(value)&&!value.includes('..'))return prefix+value.slice(2);
    return null;
  };
  const linkAttrs=url=>url.startsWith('https:')?' target="_blank" rel="noopener noreferrer"':'';
  const newTab=url=>url.startsWith('https:')?'<span class="sr-only"> (opens a new tab)</span>':'';
  const links=(entry,prefix,className='reading-links')=>{
    const items=(entry.links??[]).map(link=>{const url=localURL(link.url,prefix);return url&&`<a class="reading-chip" href="${escape(url)}"${link.download?' download':''}${linkAttrs(url)}>${escape(link.label)}<span aria-hidden="true"> ↗</span>${newTab(url)}</a>`;}).filter(Boolean);
    return items.length?`<div class="${className}">${items.join('')}</div>`:'';
  };
  const image=(entry,prefix,{eager=false,caption=true}={})=>{
    const asset=media[entry.id];if(!asset)return '';
    const src=localURL(asset.src,prefix);if(!src)return '';
    return `<img src="${escape(src)}" alt="${escape(asset.alt)}"${asset.width?' width="'+Number(asset.width)+'"':''}${asset.height?' height="'+Number(asset.height)+'"':''} loading="${eager?'eager':'lazy'}" decoding="async">${caption&&asset.caption?`<figcaption>${escape(asset.caption)}</figcaption>`:''}`;
  };
  const tags=list=>list?.length?`<ul class="reading-tags">${list.map(item=>`<li>${escape(item)}</li>`).join('')}</ul>`:'';
  // A drawn cover for work shown as a diagram: three steps around a loop, in the project's hue.
  const loopCover=entry=>{
    const steps=entry.diagram?.steps??[];
    if(steps.length!==3)return `<div class="reading-cover-number" aria-hidden="true">${pad(projects.indexOf(entry)+1)}</div>`;
    const nodes=[[300,62],[430,282],[170,282]],anchor=['middle','start','end'],dx=[0,30,-30],dy=[-26,6,6];
    return `<svg class="reading-loop" viewBox="-90 0 780 340" role="img" aria-label="${escape(`${entry.diagram.label}: ${steps.join(', then ')}`)}"><circle cx="300" cy="200" r="138" class="reading-loop-ring"/><path d="M322 64 A138 138 0 0 1 426 258" class="reading-loop-arc"/><path d="M406 300 A138 138 0 0 1 194 300" class="reading-loop-arc"/><path d="M174 258 A138 138 0 0 1 278 64" class="reading-loop-arc"/>${nodes.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="18" class="reading-loop-node"/><text x="${x}" y="${y+4}" class="reading-loop-no">${pad(i+1)}</text><text x="${x+dx[i]}" y="${y+dy[i]}" text-anchor="${anchor[i]}" class="reading-loop-label">${escape(steps[i])}</text>`).join('')}<text x="300" y="205" class="reading-loop-core">${escape(entry.diagram.label)}</text></svg>`;
  };
  const cover=(entry,prefix,options={})=>image(entry,prefix,{caption:false,...options})||loopCover(entry);
  const nav=prefix=>`<header class="reading-nav"><a class="reading-wordmark" href="${prefix}profile.html">ANSHUL<span>Applied AI product</span></a><nav aria-label="Portfolio"><ul>${Object.entries(sectionNames).map(([key,label])=>`<li><a href="${prefix}profile.html#${key}">${label}</a></li>`).join('')}</ul></nav><a class="reading-dive" href="${prefix}">Dive in <span aria-hidden="true">↗</span></a></header>`;
  const footer=prefix=>`<footer class="reading-footer"><p>Curiosity below the surface. Useful work above it.</p><ul><li><a href="mailto:anshulramprasad@gmail.com">Get in touch ↗</a></li>${publicLinks.map(url=>`<li><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${/linkedin/.test(url)?'LinkedIn':'GitHub'} ↗<span class="sr-only"> (opens a new tab)</span></a></li>`).join('')}<li><a href="${prefix}privacy.html">Privacy</a></li><li><a href="${prefix}assets/models/CREDITS.md">Model credits</a></li></ul></footer>`;
  // The depth gauge rides the page scroll where the browser supports scroll-driven animation; elsewhere it is hidden.
  const gauge=labels=>`<div class="reading-gauge" aria-hidden="true"><span class="reading-gauge-read"></span><i class="reading-gauge-mark"></i><ol>${labels.map(([metres,label])=>`<li style="--at:${metres/40}"><b>${metres} m</b> ${escape(label)}</li>`).join('')}</ol></div>`;
  const document=({title,description,route,prefix='../../',main,socialImage,structured=person,page='home',labels,bodyStyle=''})=>{
    const canonical=origin+route;
    const social=socialImage?origin+'/'+socialImage.replace(/^\.\//,''):origin+'/assets/portfolio/ocean-world.png';
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="theme-color" media="(prefers-color-scheme: light)" content="#f3fbfa"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b1630"><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(canonical)}"><meta property="og:site_name" content="Anshul Ramprasad"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escape(canonical)}"><meta property="og:image" content="${escape(social)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${escape(social)}"><link rel="icon" href="${prefix}favicon.svg"><link rel="preload" href="${prefix}assets/fonts/outfit-300.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="${prefix}assets/fonts/outfit-400.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="${prefix}tokens.css"><link rel="stylesheet" href="${prefix}portfolio-reading.css"><script type="application/ld+json">${json(structured)}</script></head><body class="reading-page reading-page--${page}"${bodyStyle?` style="${bodyStyle}"`:''}><a class="reading-skip" href="#main">Skip to content</a>${nav(prefix)}${labels?gauge(labels):''}<main id="main">${main}</main>${footer(prefix)}</body></html>\n`;
  };
  const write=async(file,text)=>{await fs.mkdir(path.dirname(path.join(out,file)),{recursive:true});await fs.writeFile(path.join(out,file),text);paths.push(file);};
  await fs.copyFile(path.join(templateRoot,'portfolio-reading.css'),path.join(out,'portfolio-reading.css'));

  /* ---------- profile.html ---------- */
  const [lead,...more]=overview.body??[];
  const now=content.experience.entries[0];
  const resumeLink=resumeEntry?.links?.find(link=>link.download)??resumeEntry?.links?.[0];
  const hero=`<section class="reading-hero" aria-labelledby="hero-title"><div class="reading-hero-copy"><p class="reading-kicker">Anshul Ramprasad · ${escape(overview.role??overview.tag)}</p><h1 id="hero-title">${escape(overview.title).replace(/ (people use\.)$/,' <em>$1</em>')}</h1><p class="reading-lead">${escape(lead??overview.summary)}</p><div class="reading-actions"><a class="reading-button reading-button--primary" href="#projects">Selected work <span aria-hidden="true">↓</span></a>${resumeLink?`<a class="reading-button" href="${escape(localURL(resumeLink.url,'./'))}" download>Résumé · ${escape(resumeEntry.format??'PDF')} <span aria-hidden="true">↓</span></a>`:''}</div><dl class="reading-proof glass"><div><dt>Now</dt><dd>${escape(`${now.title}, ${now.org}`)}</dd></div><div><dt>Focus</dt><dd>${escape(overview.tag)}</dd></div><div><dt>Based in</dt><dd>${escape(overview.base)}</dd></div></dl></div><figure class="reading-porthole"><picture><source srcset="./assets/portfolio/surface-night.jpg" media="(prefers-color-scheme: dark)"><img src="./assets/portfolio/surface-day.jpg" alt="The ocean surface of this portfolio's 3D world, with the sun low over the water" width="720" height="840" fetchpriority="high" decoding="async"></picture><figcaption><a href="./">This portfolio is also an ocean. <b>Dive in ↗</b></a></figcaption></figure></section>`;

  const card=(entry,{featured=false}={})=>`<article id="${escape(entry.id)}" class="reading-project-card${featured?' reading-project-card--featured':''} ${media[entry.id]?'has-image':'has-diagram'}" style="${accent(entry.id)}"><a class="reading-card-link" href="./projects/${entry.id}/"><div class="reading-card-cover">${cover(entry,'./',{eager:featured})}</div><div class="reading-card-copy"><p class="reading-kicker"><i aria-hidden="true"></i>${featured?'Featured · ':''}${escape(entry.tag)}</p><h3>${escape(entry.title)}</h3><p>${escape(entry.summary)}</p><span class="reading-card-action">Read the story <span aria-hidden="true">→</span></span></div></a></article>`;
  const work=`<section id="projects" class="reading-section reading-section--work" aria-labelledby="projects-title"><div class="reading-section-heading"><p class="reading-kicker">01 · Selected work</p><h2 id="projects-title">${escape(content.projects.subtitle)}</h2></div>${card(projects[0],{featured:true})}<div class="reading-project-grid">${projects.slice(1).map(entry=>card(entry)).join('')}</div></section>`;

  const examples=approach?.examples??[];
  const about=`<section id="about" class="reading-section reading-section--deep reading-section--about" aria-labelledby="about-title"><div class="reading-section-heading"><p class="reading-kicker">02 · How I work</p><h2 id="about-title">${escape(approach?.summary??content.about.subtitle)}</h2></div><div class="reading-principles">${examples.map((example,i)=>`<article class="reading-principle glass-deep"><p class="reading-kicker">${pad(i+1)}</p><h3>${escape(example.title)}</h3><p>${escape(example.text)}</p></article>`).join('')}</div><div class="reading-about-detail"><div class="reading-prose">${(approach?.body??[]).map(p=>`<p>${escape(p)}</p>`).join('')}</div><div class="reading-prose">${more.map(p=>`<p>${escape(p)}</p>`).join('')}${tags(overview.facts)}${links(overview,'./')}</div></div></section>`;

  // The career as a dive profile: each role sits one level deeper, along a time axis from the first start to now.
  const roles=[...content.experience.entries].sort((a,b)=>String(a.start).localeCompare(String(b.start)));
  const month=value=>{const [y,m]=String(value).split('-').map(Number);return y*12+(m-1);};
  const today=new Date(),first=month(roles[0]?.start??'2023-09'),last=today.getFullYear()*12+today.getMonth(),span=Math.max(1,last-first);
  const x=value=>Math.round(40+(month(value)-first)/span*900),level=i=>40+(i+1)*48;
  let profile='M0 40',marks='';
  roles.forEach((role,i)=>{const at=x(role.start);profile+=` L${at} ${i?level(i-1):40} L${at+24} ${level(i)}`;marks+=`<circle cx="${at+24}" cy="${level(i)}" r="7"/>`;});
  profile+=` L1000 ${level(roles.length-1)}`;
  const experience=`<section id="experience" class="reading-section reading-section--deep reading-section--experience" aria-labelledby="experience-title"><div class="reading-section-heading"><p class="reading-kicker">03 · Experience</p><h2 id="experience-title">${escape(content.experience.subtitle)}</h2></div><figure class="reading-profile glass-deep"><svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40H1000" class="reading-profile-surface"/><path d="${profile} L1000 200 L0 200Z" class="reading-profile-fill"/><path d="${profile}" class="reading-profile-line"/>${marks}</svg><figcaption class="sr-only">Career dive profile: ${escape(roles.map(role=>`${role.title}, ${role.tag.split('·').pop().trim()}`).join('; '))}</figcaption></figure><ol class="reading-roles">${content.experience.entries.map(entry=>`<li id="${escape(entry.id)}" class="reading-role"><p class="reading-kicker">${escape(entry.tag)}</p><h3>${escape(entry.title)}</h3><p>${escape(entry.summary)}</p>${(entry.body??[]).map(p=>`<p>${escape(p)}</p>`).join('')}${tags(entry.facts)}</li>`).join('')}</ol></section>`;

  const resume=resumeEntry?`<section id="resume" class="reading-section reading-section--deep reading-section--resume" aria-labelledby="resume-title"><div class="reading-section-heading"><p class="reading-kicker">04 · Résumé</p><h2 id="resume-title">${escape(resumeEntry.title)}</h2></div><div class="reading-resume glass-deep"><div><p class="reading-lead">${escape(resumeEntry.summary)}</p>${(resumeEntry.body??[]).map(p=>`<p>${escape(p)}</p>`).join('')}${tags(resumeEntry.facts)}</div>${links(resumeEntry,'./','reading-resume-links')}</div></section>`:'';
  const contact=`<section id="contact" class="reading-section reading-section--deep reading-contact" aria-labelledby="contact-title"><h2 id="contact-title">Something worth building?</h2><div><p>Get in touch about applied AI, product work, or an interesting problem.</p>${links(overview,'./','reading-contact-links')}</div></section>`;
  const homeLabels=[[0,'surface'],[5,'work'],[12,'how I work'],[22,'experience'],[32,'résumé'],[40,'contact']];
  await write('profile.html',document({title:'Anshul Ramprasad · Applied AI & Product Portfolio',description:overview.summary,route:'/profile.html',prefix:'./',main:hero+work+about+experience+resume+contact,labels:homeLabels}));

  /* ---------- projects/<id>/ ---------- */
  const STORY={problem:'The problem',role:'My contribution',decision:'The decision',outcome:'What changed',learning:'What I learned',evidence:'Evidence and limits'};
  for(let index=0;index<projects.length;index++){
    const entry=projects[index];const next=projects[(index+1)%projects.length];
    const study=entry.caseStudy;
    const parts=study?Object.entries(STORY).filter(([key])=>study[key]):[];
    const story=study?parts.map(([key,label],i)=>`<section class="reading-story-section${key==='learning'?' reading-story-quote':''}" aria-labelledby="story-${key}"><h2 id="story-${key}"><span class="reading-step">${pad(i+1)}</span>${label}</h2>${(Array.isArray(study[key])?study[key]:[study[key]]).map(text=>key==='learning'?`<blockquote><p>${escape(text)}</p></blockquote>`:`<p>${escape(text)}</p>`).join('')}</section>`).join(''):`<section class="reading-story-section"><h2>Behind the work</h2>${(entry.body??[]).map(p=>`<p>${escape(p)}</p>`).join('')}${tags(entry.facts)}</section>`;
    const toc=parts.length?`<nav class="reading-toc glass" aria-label="On this page"><ol>${parts.map(([key,label],i)=>`<li><a href="#story-${key}"><span>${pad(i+1)}</span>${label}</a></li>`).join('')}</ol></nav>`:'';
    const figure=media[entry.id]?`<figure class="reading-media">${image(entry,'../../',{eager:true})}</figure>`:entry.diagram?`<figure class="reading-media reading-media--diagram">${loopCover(entry)}<figcaption>${escape(entry.diagram.caption)}</figcaption></figure>`:'';
    const facts=`<aside class="reading-facts" aria-label="At a glance"><dl>${study?.role?`<div><dt>Role</dt><dd>${escape(study.role)}</dd></div>`:''}<div><dt>Type</dt><dd>${escape(entry.tag)}</dd></div>${entry.facts?.length?`<div><dt>Focus</dt><dd>${entry.facts.map(escape).join('<br>')}</dd></div>`:''}</dl>${links(entry,'../../','reading-facts-links')}</aside>`;
    const projectMain=`<p class="reading-breadcrumb"><a href="../../profile.html#projects">Selected work</a><span aria-hidden="true"> / </span><span aria-current="page">${escape(entry.title)}</span></p><header class="reading-project-hero"><div><p class="reading-kicker"><i aria-hidden="true"></i>${escape(entry.tag)}</p><h1>${escape(entry.title)}</h1><p class="reading-project-premise">${escape(entry.summary)}</p></div>${facts}</header>${figure}<div class="reading-story-layout">${toc}<div class="reading-story">${story}</div></div><aside class="reading-project-exit" aria-label="Keep exploring"><a class="reading-ocean glass" href="../../index.html#finds/${encodeURIComponent(entry.id)}"><span class="reading-kicker">A different way to explore</span><b>Explore ${escape(entry.title)} in the ocean ↗</b></a><a class="reading-next" href="../${next.id}/" style="${accent(next.id)}"><span class="reading-next-copy"><span class="reading-kicker">Next project · ${escape(next.tag.split('·')[0].trim())}</span><b>${escape(next.title)} <span aria-hidden="true">→</span></b><span>${escape(next.summary)}</span></span><span class="reading-next-cover">${cover(next,'../../',{eager:true})}</span></a></aside>`;
    const route=`/projects/${entry.id}/`;
    const creativeWork={'@context':'https://schema.org','@type':'CreativeWork',name:entry.title,description:entry.summary,url:origin+route,creator:{'@id':person['@id'],'@type':'Person',name:person.name},isPartOf:{'@type':'WebSite',name:'Anshul Ramprasad · Portfolio',url:origin}};
    await write(projectPath(entry.id),document({title:`${entry.title} · Anshul Ramprasad`,description:entry.summary,route,main:projectMain,socialImage:media[entry.id]?.src,structured:[person,creativeWork],page:'project',bodyStyle:accent(entry.id)}));
  }
  return {files:paths,routes:['/','/profile.html',...projects.map(entry=>`/projects/${entry.id}/`)]};
}
