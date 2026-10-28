import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {renderPortfolio} from './render-portfolio.mjs';
import {copyAnalyticsSDK} from './sync-services.mjs';
const launch=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.resolve(launch,'ocean-refined');
const out=path.join(launch,'dist');
if(path.dirname(out)!==launch||path.basename(out)!=='dist')throw Error('Unexpected build output path');
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
await copyAnalyticsSDK(out);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const written=new Set();
async function copy(rel){const file=path.join(source,rel),target=path.join(out,rel);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(file,target);written.add(rel.replaceAll('\\','/'));}
async function tree(rel,filter=()=>true){for(const item of await fs.readdir(path.join(source,rel),{withFileTypes:true})){const child=path.join(rel,item.name);if(item.isDirectory())await tree(child,filter);else if(filter(child))await copy(child);}}
// Only scripts reachable from the live entry point; studio, tests and export tools stay private.
const pending=['index.html'],seen=new Set();
while(pending.length){const rel=pending.pop();if(seen.has(rel))continue;seen.add(rel);await copy(rel);const text=await fs.readFile(path.join(source,rel),'utf8');
 const refs=rel.endsWith('.html')?[...text.matchAll(/(?:src|href)=["'](\.\/[^"']+\.(?:js|css))["']/g)].map(m=>m[1]):rel.endsWith('.js')?[...text.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["'](\.\.?\/[^"']+\.js)["']/g)].map(m=>m[1]):[];
 for(const ref of refs)pending.push(path.normalize(path.join(path.dirname(rel),ref)));
}
// A module that fails to parse silently takes every module importing it down in the
// browser (a duplicate `track` in archive.js once disabled all portfolio access), so
// the build refuses to ship any reachable script that does not parse.
const broken=[...seen].filter(rel=>rel.endsWith('.js')).map(rel=>[rel,spawnSync(process.execPath,['--check',path.join(source,rel)],{encoding:'utf8'})]).filter(([,run])=>run.status!==0);
if(broken.length)throw Error('Scripts failed to parse:\n'+broken.map(([rel,run])=>`${rel}\n${run.stderr.trim()}`).join('\n\n'));
// Runtime-injected stylesheets.
for(const name of ['ambient-audio.css','expedition-interactions.css','controls.css','waterline-splash.css','safety-rating.css'])await copy(name);
await copy('favicon.svg');await tree('assets/fonts');await tree('assets/portfolio',f=>!f.endsWith('.md'));await tree('assets/prepared/charts',f=>!f.endsWith('.png'));
const active=['anchor.glb','sunken_ship_low_poly.glb','treasure_chest.glb','coral_waterverbruik_gezond.glb','coral_landbouw_gezond.glb','coral_anker_kleur.glb','coral_uitstoot_gezond.glb','coral_visnet_gezond_fish.glb','manifest.json','CREDITS.md'];
for(const f of active)await copy('assets/models/'+f);
await tree('assets/models/user-sets/sets/creature-set',f=>/\.(?:glb|json|md)$/i.test(f));await tree('assets/models/user-sets/sets/coral-set',f=>/\.(?:glb|json|md)$/i.test(f));

// Content-address the model packs so returning visitors never combine old cached
// GLBs/manifests with a new runtime. Hash both model bytes and their LOD recipe.
const packRoot=path.join(out,'assets/models/user-sets/sets'),packHash=createHash('sha256');
async function hashPack(directory){for(const entry of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(directory,entry.name);if(entry.isDirectory())await hashPack(file);else{packHash.update(path.relative(packRoot,file).replaceAll('\\','/'));packHash.update(await fs.readFile(file));}}}
await hashPack(packRoot);for(const file of ['creature-kit.js','creature-species.js'])packHash.update(await fs.readFile(path.join(out,file)));
const packVersion='v-'+packHash.digest('hex').slice(0,16),packParent=path.join(out,'assets/models/user-sets',packVersion);
await fs.mkdir(packParent,{recursive:true});await fs.rename(packRoot,path.join(packParent,'sets'));
for(const file of ['user-creatures.js','user-corals.js']){const target=path.join(out,file);await fs.writeFile(target,(await fs.readFile(target,'utf8')).replaceAll('assets/models/user-sets/sets/',`assets/models/user-sets/${packVersion}/sets/`));}

for(const f of ['full.json','economy.json','full-webp.glb','economy-webp.glb'])await copy('assets/models/prepared-corals/'+f);
// Public hosts assign their own ETags and dates. Hash headers preserve cheap,
// exact source validation without forcing a 24 MB fallback download.
const modelPath=path.join(out,'model-scene.js');let model=await fs.readFile(modelPath,'utf8');
model=model.replace('if (!head.ok || (!sizeMatches && !tagMatches) || !modified || modified !== asset.lastModified)',"if (!head.ok || (head.headers.get('x-asset-sha256') !== asset.sha256 && ((!sizeMatches && !tagMatches) || !modified || modified !== asset.lastModified)))");await fs.writeFile(modelPath,model);
const assetHeaders=[];
for(const variant of ['full','economy']){const file=path.join(out,'assets/models/prepared-corals/'+variant+'.json'),meta=JSON.parse(await fs.readFile(file));for(const entry of meta.sources)entry.sha256=hash(await fs.readFile(path.join(out,entry.file)));for(const entry of meta.assets){if(hash(await fs.readFile(path.join(out,'assets/models',entry.file)))!==entry.sha256)throw Error('Stale prepared coral input '+entry.file);if(variant==='full')assetHeaders.push({source:'/assets/models/'+entry.file,headers:[{key:'X-Asset-SHA256',value:entry.sha256}]});}await fs.writeFile(file,JSON.stringify(meta));}
// Keep approved baseline narratives; omit the copy-review draft alternatives.
const contentPath=path.join(out,'portfolio-content.js');let content=await fs.readFile(contentPath,'utf8');content=content.slice(0,content.indexOf('export const COPY_VARIANTS ='))+'export const COPY_VARIANTS = {};\n';await fs.writeFile(contentPath,content);
let html=await fs.readFile(path.join(out,'index.html'),'utf8');html=html.replace('<title>Refined · Anshul · Beneath the surface</title>','<title>Anshul Ramprasad · Applied AI & Product</title>').replace("Anshul's quiet corner of the ocean. An interactive 3D landing scene.",'Explore Anshul Ramprasad’s work in applied AI, product strategy and enterprise delivery through an interactive ocean portfolio.');
html=html.replace(/<label class="arc-variant">[\s\S]*?<\/label>/,'<label hidden>Reading style <select id="copy-variant"><option value="baseline">Portfolio</option></select></label>');
html=html.replace('</head>','<meta property="og:title" content="Anshul Ramprasad · Applied AI & Product"><meta property="og:description" content="Go a little deeper. Explore my work in applied AI and product."><meta property="og:type" content="website"><meta name="twitter:card" content="summary"><style>.launch-profile{display:none;position:fixed;left:24px;bottom:80px;z-index:12;padding:10px 15px;border-radius:24px;background:#e9f8f4e6;color:#173f49;font:14px Outfit,sans-serif;text-decoration:none}body[data-submerged="true"] .launch-profile{display:none}body[data-fallback="true"] .launch-profile{display:block}body[data-submerged="true"] .hero{visibility:hidden!important}#landmark-dialog{background:rgba(12,45,58,.96)}@media(max-width:600px){.launch-profile{bottom:112px;left:24px}}</style></head>');
html=html.replace('</body>','<a class="launch-profile" href="./profile.html">Read without 3D ↗</a></body>').replace('Enable JavaScript to explore the 3D ocean.','<a href="./profile.html">Read the portfolio without the 3D ocean.</a>');await fs.writeFile(path.join(out,'index.html'),html);
const {PORTFOLIO_CONTENT,PORTFOLIO_MEDIA}=await import(pathToFileURL(path.join(source,'portfolio-content.js')));
const siteURL='https://anshul-portfolio-rho.vercel.app';
const reading=await renderPortfolio({out,content:PORTFOLIO_CONTENT,media:PORTFOLIO_MEDIA,siteURL});
await fs.writeFile(path.join(out,'privacy.html'),"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Privacy · Anshul</title><script type=\"module\" src=\"./analytics.js\"></script></head><body style=\"max-width:700px;margin:50px auto;padding:24px;font:18px/1.6 system-ui\"><a href=\"./profile.html\">Back to portfolio</a><h1>Privacy</h1><h2>Feedback</h2><p>When you send a field note, your rating, message and dive depth are saved privately in Supabase for Anshul. Your name and email are sent only if you explicitly choose to include contact details. Notes are not published automatically.</p><h2>Reef photos</h2><p>Taking a photo downloads it to your device. Only choosing “Share with Anshul” uploads a reduced-size copy to private Supabase storage. Shared photos are not published automatically.</p><h2>Analytics</h2><p>Optional PostHog analytics measures page visits and actions such as opening a project, diving, clicking a résumé link or successfully sending a note. Analytics is off until you enable it and can be turned off here or in Settings. Session recordings and automatic form capture are disabled. Messages, contact details and photo contents are not included in analytics; URL queries and fragments are removed.</p><button type=\"button\" data-analytics-toggle hidden>Analytics off · enable</button><h2>Storage and retention</h2><p>Preferences, analytics choices and local exploration records may be stored in your browser. Clearing site data removes these local records. Submitted feedback and photos remain privately stored until Anshul deletes them. To request deletion, <a href=\"mailto:anshulramprasad@gmail.com\">contact Anshul</a> with the approximate submission date and details that identify your submission.</p><p>Submission protection uses temporary request counters and a keyed hash of a network address, removed on the next submission after two days. Supabase, PostHog and the hosting provider may process technical request logs. External links have their own privacy practices.</p></body></html>");
await fs.writeFile(path.join(out,'404.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>Page not found</title><body><h1>This part of the reef is uncharted.</h1><a href="/">Return to the ocean</a> · <a href="/profile.html">Read the portfolio</a></body></html>');
for(const [file,route] of [['index.html','/']]){const pagePath=path.join(out,file);let page=await fs.readFile(pagePath,'utf8');page=page.replace('</head>',`<link rel="canonical" href="${siteURL}${route}"><meta property="og:url" content="${siteURL}${route}"><meta property="og:image" content="${siteURL}/assets/portfolio/ocean-world.png"></head>`);await fs.writeFile(pagePath,page);}
await fs.writeFile(path.join(out,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${siteURL}/sitemap.xml\n`);
await fs.writeFile(path.join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${reading.routes.map(route=>`<url><loc>${siteURL}${route}</loc></url>`).join('')}</urlset>`);
const headers=[{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'SAMEORIGIN'}]},{source:'/(.*)\\.(js|css|html|json)',headers:[{key:'Cache-Control',value:'public, max-age=0, must-revalidate'}]},{source:'/assets/(.*)',headers:[{key:'Cache-Control',value:'public, max-age=3600, must-revalidate'}]},...assetHeaders];
await fs.writeFile(path.join(launch,'vercel.json'),JSON.stringify({$schema:'https://openapi.vercel.sh/vercel.json',framework:null,buildCommand:'npm run build',installCommand:'npm install --omit=dev',outputDirectory:'dist',headers},null,2));
const files=[];async function inventory(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,item.name);if(item.isDirectory())await inventory(f);else files.push({file:path.relative(out,f).replaceAll('\\','/'),bytes:(await fs.stat(f)).size});}}await inventory(out);
await fs.writeFile(path.join(launch,'build-report.json'),JSON.stringify({generatedAt:new Date().toISOString(),files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),largest:files.sort((a,b)=>b.bytes-a.bytes).slice(0,10)},null,2));console.log(JSON.stringify({files:files.length,MB:files.reduce((n,f)=>n+f.bytes,0)/1e6}));
