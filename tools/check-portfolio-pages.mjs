import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const decode=value=>value.replaceAll('&amp;','&').replaceAll('&quot;','"');
export async function checkPortfolioPages({out,content,siteURL}){
  const files=['profile.html',...content.projects.entries.map(entry=>`projects/${entry.id}/index.html`)];
  const sitemap=await fs.readFile(path.join(out,'sitemap.xml'),'utf8');
  let linkCount=0,imageCount=0;
  for(const file of files){
    const html=await fs.readFile(path.join(out,file),'utf8');
    const route=file==='profile.html'?'/profile.html':'/'+file.replace(/index\.html$/,'');
    assert.ok(html.includes(`<link rel="canonical" href="${siteURL}${route}">`),'Missing or wrong canonical: '+file);
    assert.ok(sitemap.includes(`<loc>${siteURL}${route}</loc>`),'Page missing from sitemap: '+file);
    assert.equal([...html.matchAll(/<h1(?:\s|>)/g)].length,1,'Expected one page heading: '+file);
    assert.ok(/<html lang="en">/.test(html)&&/<main id="main">/.test(html),'Missing document landmarks: '+file);
    for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
      assert.ok(script[1].includes('type="application/ld+json"'),'Reading page requires runtime JavaScript: '+file);
      const schema=JSON.parse(script[2]);
      assert.ok((Array.isArray(schema)?schema:[schema]).some(item=>item['@type']==='Person'&&item.name==='Anshul Ramprasad'),'Missing accurate Person data: '+file);
    }
    assert.ok(!/\b(?:world\.js|three\.module|\.glb\b|COPY_VARIANTS)\b/.test(html),'World dependency/draft leaked into static page: '+file);
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
    assert.equal(ids.length,new Set(ids).size,'Duplicate HTML IDs: '+file);
    for(const image of html.matchAll(/<img\b([^>]+)>/g)){
      imageCount++;
      assert.ok(/\balt="[^"]+"/.test(image[1]),'Image lacks meaningful alt: '+file);
      assert.ok(/\bwidth="\d+"/.test(image[1])&&/\bheight="\d+"/.test(image[1]),'Image lacks layout dimensions: '+file);
    }
    for(const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)){
      const href=decode(match[1]);
      if(/^(?:https:\/\/|mailto:)/.test(href))continue;
      const url=new URL(href,'https://build.invalid/'+file);
      assert.equal(url.origin,'https://build.invalid','Unexpected local URL: '+href);
      let target=decodeURIComponent(url.pathname).slice(1);
      if(!target||target.endsWith('/'))target+='index.html';
      const resolved=path.resolve(out,target);
      assert.ok(resolved.startsWith(path.resolve(out)+path.sep),'Link escapes build: '+href);
      await fs.access(resolved).catch(()=>assert.fail(`Broken local asset/link in ${file}: ${href}`));
      // World fragment routing is intentionally interpreted by its archive;
      // static reading anchors must exist without any JavaScript.
      if(url.hash&&target!=='index.html'){
        const destination=await fs.readFile(resolved,'utf8');
        assert.ok(destination.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),`Broken fragment ${href} in ${file}`);
      }
      linkCount++;
    }
    const entry=content.projects.entries.find(entry=>file===`projects/${entry.id}/index.html`);
    if(entry){
      assert.ok(html.includes(escapeHTML(entry.title)),file+' missing project title');
      assert.ok(html.includes(`#finds/${entry.id}`),file+' missing ocean deep link');
      for(const value of Object.values(entry.caseStudy??{}))for(const paragraph of Array.isArray(value)?value:[value])assert.ok(html.includes(escapeHTML(paragraph)),file+' missing shared narrative');
    }
  }
  const css=await fs.readFile(path.join(out,'portfolio-reading.css'),'utf8');
  assert.ok(css.includes('prefers-reduced-motion'),'Reading stylesheet lacks reduced-motion support');
  for(const match of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g))await fs.access(path.join(out,match[1]));
  return {pages:files.length,localLinks:linkCount,images:imageCount,runtimeScripts:0};
}
const escapeHTML=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
