import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {checkPortfolioPages} from './check-portfolio-pages.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=file=>{const result=spawnSync(process.execPath,[path.join(root,file)],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);};
await fs.mkdir(path.join(root,'dist'),{recursive:true});
await fs.writeFile(path.join(root,'dist/retired-test-model.glb'),'stale');run('tools/build.mjs');
await assert.rejects(fs.access(path.join(root,'dist/retired-test-model.glb')));
await assert.rejects(fs.access(path.join(root,'dist/creature-pack.js')));
await assert.rejects(fs.access(path.join(root,'dist/assets/models/creatures')));
await fs.mkdir(path.join(root,'.vercel/output/static'),{recursive:true});
await fs.writeFile(path.join(root,'.vercel/output/static/retired-test-model.glb'),'stale');run('tools/prepare-output.mjs');
await assert.rejects(fs.access(path.join(root,'.vercel/output/static/retired-test-model.glb')));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const variant of ['full','economy']){const meta=JSON.parse(await fs.readFile(path.join(root,`dist/assets/models/prepared-corals/${variant}.json`)));for(const source of meta.sources)assert.equal(digest(await fs.readFile(path.join(root,'dist',source.file))),source.sha256);}
const code=await fs.readFile(path.join(root,'dist/user-creatures.js'),'utf8');const version=code.match(/user-sets\/(v-[a-f0-9]{16})\/sets/)[1];const packs=path.join(root,'dist/assets/models/user-sets',version,'sets/creature-set');const manifest=JSON.parse(await fs.readFile(path.join(packs,'manifest.json')));assert.equal(manifest.creatures.length,27);for(const item of manifest.creatures){await fs.access(path.join(packs,item.file));assert.deepEqual(gunzipSync(await fs.readFile(path.join(packs,item.file+'.gz'))),await fs.readFile(path.join(packs,item.file)),`${item.file}.gz does not inflate to the model`);}assert.match(await fs.readFile(path.join(root,'dist/assets.js'),'utf8'),/GZIPPED=!0|GZIPPED = true/,'assets.js does not read the gzipped models');for(const name of ['anchor.glb','treasure_chest-economy.glb','prepared-corals/economy-webp.glb'])assert.deepEqual(gunzipSync(await fs.readFile(path.join(root,'dist/assets/models',name+'.gz'))),await fs.readFile(path.join(root,'dist/assets/models',name)));
// The schooling fish take their skins from the same files (school-fish.js): the same versioned folder.
assert.ok((await fs.readFile(path.join(root,'dist/school-fish.js'),'utf8')).includes(`assets/models/user-sets/${version}/sets/creature-set/`),'school-fish.js does not point at the versioned creature set');
// The published page links one bundled stylesheet (print apart) that holds every sheet of the source page, in order, and
// preloads every module its entry scripts import statically.
const page=await fs.readFile(path.join(root,'dist/index.html'),'utf8'),source=await fs.readFile(path.join(root,'ocean-refined/index.html'),'utf8');
const linked=[...page.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)">/g)].map(m=>m[1]);assert.equal(linked.length,1,'the page should link exactly one bundled stylesheet');
const bundle=await fs.readFile(path.join(root,'dist',linked[0]),'utf8'),uncomment=css=>css.replace(/("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\/\*[\s\S]*?\*\//g,(match,string)=>string||'').replace(/\s+/g,' ').trim();
let cursor=0;const flat=uncomment(bundle);for(const [,media,href] of source.matchAll(/<link rel="stylesheet"(?: media="(\w+)")? href="\.\/([^"]+\.css)">/g)){if(media==='print'){assert.match(page,new RegExp(`media="print" href="\\./${href}"`));continue;}const at=flat.indexOf(uncomment(await fs.readFile(path.join(root,'ocean-refined',href),'utf8')),cursor);assert.ok(at>=cursor,`${href} missing from the bundle or out of order`);cursor=at;}
const preloaded=new Set([...page.matchAll(/rel="modulepreload" href="\.\/([^"]+)"/g)].map(m=>m[1]));for(const module of ['reef.js','frame-pacing.js','living-world.js','vendor/three.core.min.js'])assert.ok(preloaded.has(module),`${module} is not preloaded`);
{const clips=await fs.readdir(path.join(root,'dist/assets/audio/clips'));for(const name of ['breath0.mp3','sea.mp3','whale0.mp3','clicks0.mp3','thunder0.mp3'])assert.ok(clips.includes(name),`sound clip ${name} missing`);await assert.rejects(fs.access(path.join(root,'dist/assets/audio/source')),'sound sources must not ship');}
console.log('Build checks passed: stale files removed, retired assets excluded, 27 species (gzipped copies exact) and coral cache inputs valid, one bundled stylesheet, modules preloaded, sound clips without their sources');

await assert.rejects(fs.access(path.join(root,'dist/assets/models/user-sets/sets')));
const {PORTFOLIO_CONTENT}=await import('../ocean-refined/portfolio-content.js');
console.log('Static portfolio integrity:',await checkPortfolioPages({out:path.join(root,'dist'),content:PORTFOLIO_CONTENT,siteURL:'https://anshul-portfolio-rho.vercel.app'}));
