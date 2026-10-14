import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
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
const code=await fs.readFile(path.join(root,'dist/user-creatures.js'),'utf8');const version=code.match(/user-sets\/(v-[a-f0-9]{16})\/sets/)[1];const packs=path.join(root,'dist/assets/models/user-sets',version,'sets/creature-set');const manifest=JSON.parse(await fs.readFile(path.join(packs,'manifest.json')));assert.equal(manifest.creatures.length,27);for(const item of manifest.creatures)await fs.access(path.join(packs,item.file));
console.log('Build checks passed: stale files removed, retired assets excluded, 27 species and coral cache inputs valid');

await assert.rejects(fs.access(path.join(root,'dist/assets/models/user-sets/sets')));
