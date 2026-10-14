import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const sceneDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(sceneDir,'assets/models/prepared-corals');
const base=(process.argv.find(a=>a.startsWith('--base-url='))?.split('=')[1]||'http://127.0.0.1:4197/ocean-refined/').replace(/\/?$/,'/');
const verify=process.argv.includes('--verify');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// The five source packs repeat the same texture PNGs. glTF's exporter treats
// their separate texture objects as separate images; share identical encoded
// image payloads losslessly, then remove only the orphaned image views.
function compactImages(bytes){
 const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8')),bin=bytes.subarray(28+jsonLength);
 const unique=[],seen=new Map(),imageMap=[];
 for(const image of json.images||[]){const view=json.bufferViews[image.bufferView],key=image.mimeType+':'+hash(bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength));let index=seen.get(key);if(index===undefined){index=unique.length;seen.set(key,index);unique.push(image);}imageMap.push(index);}
 for(const texture of json.textures||[])if(texture.source!==undefined)texture.source=imageMap[texture.source];json.images=unique;
 const used=new Set();for(const accessor of json.accessors||[]){if(accessor.bufferView!==undefined)used.add(accessor.bufferView);if(accessor.sparse){used.add(accessor.sparse.indices.bufferView);used.add(accessor.sparse.values.bufferView);}}for(const image of unique)used.add(image.bufferView);
 const views=[],buffers=[],viewMap=new Map();let offset=0;
 for(let i=0;i<json.bufferViews.length;i++)if(used.has(i)){const view=json.bufferViews[i],chunk=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);viewMap.set(i,views.length);views.push({...view,buffer:0,byteOffset:offset});buffers.push(chunk);const padding=(4-chunk.length%4)%4;if(padding)buffers.push(Buffer.alloc(padding));offset+=chunk.length+padding;}
 for(const accessor of json.accessors||[]){if(accessor.bufferView!==undefined)accessor.bufferView=viewMap.get(accessor.bufferView);if(accessor.sparse){accessor.sparse.indices.bufferView=viewMap.get(accessor.sparse.indices.bufferView);accessor.sparse.values.bufferView=viewMap.get(accessor.sparse.values.bufferView);}}for(const image of unique)image.bufferView=viewMap.get(image.bufferView);
 json.bufferViews=views;json.buffers=[{byteLength:offset}];const encoded=Buffer.from(JSON.stringify(json)),padded=Buffer.concat([encoded,Buffer.alloc((4-encoded.length%4)%4,32)]),body=Buffer.concat(buffers),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
 header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+body.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(body.length,0);binHeader.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([header,padded,binHeader,body]);
}
const files=['coral_waterverbruik_gezond.glb','coral_landbouw_gezond.glb','coral_anker_kleur.glb','coral_uitstoot_gezond.glb','coral_visnet_gezond_fish.glb'];
async function inputs(){
 const sources=await Promise.all(['reef.js','model-scene.js'].map(async file=>({file,sha256:hash(await fs.readFile(path.join(sceneDir,file)))})));
 const assets=await Promise.all(files.map(async file=>{const filename=path.join(sceneDir,'assets/models',file),bytes=await fs.readFile(filename),stat=await fs.stat(filename);return{file,bytes:bytes.length,sha256:hash(bytes),lastModified:stat.mtime.toUTCString()};}));
 return{sources,assets};
}
const expected=await inputs();
if(verify){
 for(const variant of['full','economy']){
  const meta=JSON.parse(await fs.readFile(path.join(output,variant+'.json'),'utf8'));
  for(const source of expected.sources)if(meta.sources.find(s=>s.file===source.file)?.sha256!==source.sha256)throw Error('Prepared coral source changed: '+source.file);
  for(const asset of expected.assets)if(meta.assets.find(a=>a.file===asset.file)?.sha256!==asset.sha256)throw Error('Prepared coral asset changed: '+asset.file);
  const glb=await fs.readFile(path.join(output,meta.glb.file));if(glb.length!==meta.glb.bytes||hash(glb)!==meta.glb.sha256)throw Error('Prepared GLB integrity failed');
 }
 console.log('Prepared coral inputs and geometry checksums verified.');process.exit(0);
}
await fs.mkdir(output,{recursive:true});
for(const asset of expected.assets){const head=await fetch(base+'assets/models/'+asset.file,{method:'HEAD'});if(!head.ok||head.headers.get('last-modified')!==asset.lastModified)throw Error('Builder server/source mismatch: '+asset.file);asset.etag=head.headers.get('etag')||null;}
let chromium;try{({chromium}=await import('playwright'));}catch{({chromium}=await import('playwright'));}
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({acceptDownloads:true});page.on('console',m=>{if(m.type()==='warning')console.log('Browser: '+m.text());});
 await page.goto(base+'ui-gallery.html');
 for(const variant of['full','economy']){
  const start=performance.now(),downloadPromise=page.waitForEvent('download',{timeout:240000});
  const record=await page.evaluate(async({base,variant})=>{
   const[{createModelScene},{createReef},{GLTFExporter},THREE]=await Promise.all([import(base+'model-scene.js'),import(base+'reef.js'),import(base+'vendor/GLTFExporter.js'),import(base+'vendor/three.module.min.js')]);
   const reef=createReef({economy:variant==='economy'}),models=createModelScene({reef,terrainHeightAt:reef.userData.terrainHeightAt,collisions:reef.userData.collisions,economy:variant==='economy',preparedCorals:false});
   const prepared=await models.prepareCoralCache(),snapshot=new THREE.Group();snapshot.name='Pre-grounded static coral LOD batches';
   const batches=prepared.batches.map((batch,index)=>{
    const full='coral_full_'+index,light='coral_light_'+index;
    const mesh=new THREE.Mesh(batch.full,batch.mesh.material);mesh.name=full;snapshot.add(mesh);
    const low=new THREE.Mesh(batch.light||batch.full,batch.mesh.material);low.name=light;snapshot.add(low);
    const material=batch.mesh.material;
    return{full,light,name:batch.mesh.name,renderOrder:batch.mesh.renderOrder,layers:batch.mesh.layers.mask,sphere:{center:batch.sphere.center.toArray(),radius:batch.sphere.radius},fullTriangles:batch.full.index?batch.full.index.count/3:batch.full.attributes.position.count/3,lightTriangles:batch.light?(batch.light.index?batch.light.index.count/3:batch.light.attributes.position.count/3):0,material:{flatShading:material.flatShading,depthWrite:material.depthWrite,depthTest:material.depthTest,alphaTest:material.alphaTest,side:material.side}};
   });
   const bytes=await new GLTFExporter().parseAsync(snapshot,{binary:true,onlyVisible:true});
   const url=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'})),link=document.createElement('a');link.href=url;link.download=variant+'.glb';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
   return{schema:1,variant,coralLoaded:prepared.coralLoaded,habitats:prepared.habitats,proxies:prepared.proxies,batches};
  },{base,variant});
  const download=await downloadPromise;await download.saveAs(path.join(output,variant+'.glb'));
  const bytes=compactImages(await fs.readFile(path.join(output,variant+'.glb')));await fs.writeFile(path.join(output,variant+'.glb'),bytes);record.sources=expected.sources;record.assets=expected.assets;record.glb={file:variant+'.glb',bytes:bytes.length,sha256:hash(bytes)};
  await fs.writeFile(path.join(output,variant+'.json'),JSON.stringify(record,null,2));
  console.log(JSON.stringify({variant,bytes:bytes.length,batches:record.batches.length,habitats:record.habitats.length,proxies:record.proxies.length,elapsedMs:Math.round(performance.now()-start)}));
 }
}finally{await browser.close();}
