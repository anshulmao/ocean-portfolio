import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const templateRoot=path.join(path.dirname(fileURLToPath(import.meta.url)),'templates');
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const projectPath=id=>`projects/${id}/index.html`;
const sectionNames={about:'About',experience:'Experience',projects:'Projects',resume:'Résumé'};

// Public pages and the in-world archive read the same content module. This
// renderer deliberately imports no browser/world code and emits no runtime JS.
export async function renderPortfolio({out,content,media={},siteURL}){
  const origin=new URL(siteURL).origin;
  const projects=content.projects.entries;
  const ids=new Set();
  for(const entry of projects){
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)||ids.has(entry.id))throw Error('Invalid or duplicate project route: '+entry.id);
    ids.add(entry.id);
  }
  const overview=content.about.entries.find(entry=>entry.id==='overview')??content.about.entries[0];
  const publicLinks=(overview.links??[]).filter(link=>/^https:\/\/(?:www\.)?(?:linkedin\.com|github\.com)\//.test(link.url)).map(link=>link.url);
  const person={'@context':'https://schema.org','@type':'Person','@id':origin+'/profile.html#person',name:'Anshul Ramprasad',url:origin+'/profile.html',jobTitle:overview.role??overview.tag,sameAs:publicLinks};
  const paths=[];

  const localURL=(value,prefix)=>{
    if(/^https:\/\//.test(value)||/^mailto:/.test(value))return value;
    if(/^\.\/assets\/[a-zA-Z0-9_./-]+$/.test(value)&&!value.includes('..'))return prefix+value.slice(2);
    return null;
  };
  const links=(entry,prefix)=>`<div class="reading-links">${(entry.links??[]).map(link=>{
    const url=localURL(link.url,prefix);if(!url)return '';
    return `<a href="${escape(url)}"${link.download?' download':''}${url.startsWith('https:')?' target="_blank" rel="noopener noreferrer"':''}>${escape(link.label)}<span aria-hidden="true"> ↗</span>${url.startsWith('https:')?'<span class="sr-only"> (opens a new tab)</span>':''}</a>`;
  }).join('')}</div>`;
  const image=(entry,prefix,{eager=false}={})=>{
    const asset=media[entry.id];if(!asset)return '';
    const src=localURL(asset.src,prefix);if(!src)return '';
    return `<figure class="reading-image"><img src="${escape(src)}" alt="${escape(asset.alt)}"${asset.width?' width="'+Number(asset.width)+'"':''}${asset.height?' height="'+Number(asset.height)+'"':''} loading="${eager?'eager':'lazy'}" decoding="async">${asset.caption?`<figcaption>${escape(asset.caption)}</figcaption>`:''}</figure>`;
  };
  const facts=entry=>entry.facts?.length?`<ul class="reading-facts">${entry.facts.map(fact=>`<li>${escape(fact)}</li>`).join('')}</ul>`:'';
  const body=entry=>(entry.body??[]).filter(p=>p!==entry.summary).map(p=>`<p>${escape(p)}</p>`).join('');
  const nav=(prefix,active='')=>`<nav class="reading-nav" aria-label="Portfolio"><a class="reading-wordmark" href="${prefix}profile.html">ANSHUL<span>A world to explore</span></a><div>${Object.entries(sectionNames).map(([key,label])=>`<a href="${prefix}profile.html#${key}"${active===key?' aria-current="location"':''}>${label}</a>`).join('')}<a class="ocean-link" href="${prefix}">Explore the ocean <span aria-hidden="true">↗</span></a></div></nav>`;
  const footer=prefix=>`<footer class="reading-footer"><p>Curiosity below the surface. Useful work above it.</p><div><a href="mailto:anshulramprasad@gmail.com">Get in touch ↗</a><a href="${prefix}privacy.html">Privacy</a><a href="${prefix}assets/models/CREDITS.md">Model credits</a></div></footer>`;
  const document=({title,description,route,prefix='../../',main,socialImage,structured=person})=>{
    const canonical=origin+route;
    const social=socialImage?origin+'/'+socialImage.replace(/^\.\//,''):origin+'/assets/portfolio/ocean-world.png';
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#edf5f4"><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(canonical)}"><meta property="og:site_name" content="Anshul Ramprasad"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escape(canonical)}"><meta property="og:image" content="${escape(social)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${escape(social)}"><link rel="icon" href="${prefix}favicon.svg"><link rel="preload" href="${prefix}assets/fonts/outfit-400.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="${prefix}tokens.css"><link rel="stylesheet" href="${prefix}portfolio-reading.css"><script type="application/ld+json">${json(structured)}</script></head><body><a class="reading-skip" href="#main">Skip to content</a>${nav(prefix)}<main id="main">${main}</main>${footer(prefix)}</body></html>\n`;
  };
  const write=async(file,text)=>{await fs.mkdir(path.dirname(path.join(out,file)),{recursive:true});await fs.writeFile(path.join(out,file),text);paths.push(file);};
  await fs.copyFile(path.join(templateRoot,'portfolio-reading.css'),path.join(out,'portfolio-reading.css'));

  const about=content.about.entries.map((entry,index)=>`<article id="${escape(entry.id)}" class="${index?'reading-principles':'reading-introduction'}"><p class="reading-kicker">${escape(entry.tag)}</p><h3>${escape(entry.title)}</h3><p class="reading-lead">${escape(entry.summary)}</p>${body(entry)}${facts(entry)}${links(entry,'./')}</article>`).join('');
  const experience=content.experience.entries.map(entry=>`<article id="${escape(entry.id)}" class="reading-role"><p class="reading-kicker">${escape(entry.tag)}</p><h3>${escape(entry.title)}</h3><p>${escape(entry.summary)}</p>${body(entry)}${facts(entry)}${links(entry,'./')}</article>`).join('');
  const projectCards=projects.map((entry,index)=>`<article id="${escape(entry.id)}" class="reading-project-card ${media[entry.id]?'has-image':'has-diagram'}"><a class="reading-card-link" href="./projects/${entry.id}/" aria-label="Read ${escape(entry.title)} case study">${image(entry,'./')||`<div class="reading-card-diagram reading-card-process">${entry.diagram?`<p class="reading-kicker">${escape(entry.diagram.label)}</p><ol>${entry.diagram.steps.map(step=>`<li>${escape(step)}</li>`).join('')}</ol>`:`<span aria-hidden="true">${String(index+1).padStart(2,'0')}</span><p>${escape(entry.caseStudy?.role??entry.tag)}</p>`}</div>`}<div class="reading-card-copy"><p class="reading-kicker">${escape(entry.tag)}</p><h3>${escape(entry.title)} <span aria-hidden="true">↗</span></h3><p>${escape(entry.summary)}</p><span class="reading-card-action">Read the story <span aria-hidden="true">→</span></span></div></a></article>`).join('');
  const resume=content.resume.entries.map(entry=>`<article id="${escape(entry.id)}" class="reading-resume"><p class="reading-kicker">${escape(entry.tag)}</p><h3>${escape(entry.title)}</h3><p>${escape(entry.summary)}</p>${body(entry)}${facts(entry)}${links(entry,'./')}</article>`).join('');
  const profileMain=`<header class="reading-hero"><p class="reading-kicker">Anshul Ramprasad · ${escape(overview.base??'Kuala Lumpur')}</p><h1>${escape(overview.title)}</h1><p class="reading-lead">${escape(overview.summary)}</p><p>${escape(content.about.subtitle)}</p><div class="reading-hero-actions"><a class="reading-button" href="#projects">Selected work <span aria-hidden="true">↓</span></a><a href="#resume">Read my résumé ↗</a></div></header><section id="projects" class="reading-section"><div class="reading-section-heading"><p class="reading-kicker">01 / Selected work</p><h2>${escape(content.projects.subtitle)}</h2></div><div class="reading-project-grid">${projectCards}</div></section><section id="about" class="reading-section"><div class="reading-section-heading"><p class="reading-kicker">02 / About</p><h2>How I approach the work.</h2></div><div class="reading-about">${about}</div></section><section id="experience" class="reading-section"><div class="reading-section-heading"><p class="reading-kicker">03 / Experience</p><h2>${escape(content.experience.subtitle)}</h2></div><div class="reading-timeline">${experience}</div></section><section id="resume" class="reading-section"><div class="reading-section-heading"><p class="reading-kicker">04 / Résumé</p><h2>${escape(content.resume.subtitle)}</h2></div>${resume}</section><section class="reading-contact reading-section" id="contact"><p class="reading-kicker">Start a conversation</p><h2>Something worth building?</h2><p>Get in touch about applied AI, product work, or an interesting problem.</p>${links(overview,'./')}</section>`;
  await write('profile.html',document({title:'Anshul Ramprasad · Applied AI & Product Portfolio',description:overview.summary,route:'/profile.html',prefix:'./',main:profileMain}));

  for(let index=0;index<projects.length;index++){
    const entry=projects[index];const next=projects[(index+1)%projects.length];
    const study=entry.caseStudy;
    const story=study?Object.entries({problem:'The problem',role:'My contribution',decision:'The decision',outcome:'What changed',learning:'What I learned',evidence:'Evidence and limits'}).filter(([key])=>study[key]).map(([key,label],i)=>`<section class="reading-story-section" aria-labelledby="story-${key}"><p class="reading-kicker">${String(i+1).padStart(2,'0')}</p><div><h2 id="story-${key}">${label}</h2>${(Array.isArray(study[key])?study[key]:[study[key]]).map(text=>`<p>${escape(text)}</p>`).join('')}</div></section>`).join(''):`<section class="reading-story-section"><div><h2>Behind the work</h2>${body(entry)}${facts(entry)}</div></section>`;
    const diagram=entry.diagram?`<figure class="reading-process"><p class="reading-kicker">${escape(entry.diagram.label)}</p><ol>${entry.diagram.steps.map(step=>`<li>${escape(step)}</li>`).join('')}</ol><figcaption>${escape(entry.diagram.caption)}</figcaption></figure>`:'';
    const projectMain=`<div class="reading-breadcrumb"><a href="../../profile.html#projects">Selected work</a><span aria-hidden="true">/</span><span>${escape(entry.title)}</span></div><header class="reading-project-hero"><p class="reading-kicker">${escape(entry.tag)}</p><h1>${escape(entry.title)}</h1><p class="reading-project-premise">${escape(entry.summary)}</p>${links(entry,'../../')}</header>${image(entry,'../../',{eager:true})}${diagram}<div class="reading-story">${story}</div><aside class="reading-project-exit"><div><p class="reading-kicker">A different way to explore</p><h2>The work lives in a world, too.</h2><a href="../../index.html#finds/${encodeURIComponent(entry.id)}">Explore ${escape(entry.title)} in the ocean ↗</a></div><div><p class="reading-kicker">Next project</p><a class="reading-next" href="../${next.id}/">${escape(next.title)} <span aria-hidden="true">→</span></a><a href="../../profile.html#projects">All selected work</a></div></aside>`;
    const route=`/projects/${entry.id}/`;
    const creativeWork={'@context':'https://schema.org','@type':'CreativeWork',name:entry.title,description:entry.summary,url:origin+route,creator:{'@id':person['@id'],'@type':'Person',name:person.name},isPartOf:{'@type':'WebSite',name:'Anshul Ramprasad · Portfolio',url:origin}};
    await write(projectPath(entry.id),document({title:`${entry.title} · Anshul Ramprasad`,description:entry.summary,route,main:projectMain,socialImage:media[entry.id]?.src,structured:[person,creativeWork]}));
  }
  return {files:paths,routes:['/','/profile.html',...projects.map(entry=>`/projects/${entry.id}/`)]};
}
