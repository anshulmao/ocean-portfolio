import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),base=process.argv.find(a=>a.startsWith('--base-url='))?.split('=')[1]||'http://127.0.0.1:4197/ocean-refined/';
let chromium;try{({chromium}=await import('playwright'));}catch{({chromium}=await import('playwright'));}
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();await page.route('**/assets/models/prepared-corals/*.json',async route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);if(!['full.json','economy.json'].includes(name)){await route.continue();return;}const file=path.join(root,'ocean-refined/assets/models/prepared-corals',name.replace('.json','-webp.json'));await route.fulfill({contentType:'application/json',body:await fs.readFile(file,'utf8')});});await page.goto(base+'ui-gallery.html');
 const reports=await page.evaluate(async base=>{
  const[{createModelScene},{createReef}]=await Promise.all([import(base+'model-scene.js'),import(base+'reef.js')]);const results=[];
  const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  async function geometry(g){const attributes={};for(const [name,a]of Object.entries(g.attributes)){const values=new Float32Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let c=0;c<a.itemSize;c++)values[i*a.itemSize+c]=a.getComponent(i,c);attributes[name]={size:a.itemSize,count:a.count,sha256:await digest(values.buffer)};}return{attributes,index:g.index?await digest(new Uint32Array(Array.from(g.index.array)).buffer):null};}
  async function material(m){const maps={};for(const name of['map','normalMap','emissiveMap','roughnessMap','metalnessMap','alphaMap','aoMap'])if(m[name]?.image){const img=m[name].image,canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const context=canvas.getContext('2d');context.drawImage(img,0,0);maps[name]={width:img.width,height:img.height,flipY:m[name].flipY,pixels:await digest(context.getImageData(0,0,img.width,img.height).data.buffer)};}return{color:m.color.toArray(),emissive:m.emissive.toArray(),roughness:m.roughness,metalness:m.metalness,opacity:m.opacity,side:m.side,transparent:m.transparent,flatShading:m.flatShading,depthWrite:m.depthWrite,alphaTest:m.alphaTest,maps};}
  const canonical=items=>items.map(item=>JSON.stringify(item)).sort();
  for(const economy of[false,true]){
   const reef=createReef({economy}),snapshot=reef.userData.collisions.boxes.length;
   const original=createModelScene({reef,terrainHeightAt:reef.userData.terrainHeightAt,collisions:reef.userData.collisions,economy,preparedCorals:false});const start=performance.now(),data=await original.prepareCoralCache(),beforeMs=performance.now()-start;
   const baseline=[];for(const batch of data.batches)baseline.push({full:await geometry(batch.full),light:await geometry(batch.light||batch.full),material:await material(batch.mesh.material),sphere:{center:batch.sphere.center.toArray(),radius:batch.sphere.radius},renderOrder:batch.mesh.renderOrder,layers:batch.mesh.layers.mask});
   const reefCached=createReef({economy}),cachedSnapshot=reefCached.userData.collisions.boxes.length,cached=createModelScene({reef:reefCached,terrainHeightAt:reefCached.userData.terrainHeightAt,collisions:reefCached.userData.collisions,economy});const cachedStart=performance.now();if(!await cached.loadPreparedCorals())throw Error('Fast path missed: '+JSON.stringify(cached.coralCache));const afterMs=performance.now()-cachedStart;
   const meta=await fetch(base+'assets/models/prepared-corals/'+(economy?'economy':'full')+'.json').then(r=>r.json());
   const loaded=[];for(const mesh of cached.root.children){cached.update(0,0,null,0,null);const full=mesh.geometry;const spec=meta.batches.find(b=>b.name===mesh.name&&b.sphere.radius===full.boundingSphere.radius);const before=data.batches.find(b=>b.mesh.name===mesh.name&&b.sphere.radius===full.boundingSphere.radius);if(!before)throw Error('Prepared batch match missing: '+JSON.stringify({name:mesh.name,radius:full.boundingSphere.radius,available:data.batches.map(b=>({name:b.mesh.name,radius:b.sphere.radius}))}));
    // Use the actual culling path to select and inspect the preserved light LOD.
    cached.update(0,0,null,0,{eye:full.boundingSphere.center.clone().addScalar(1000),range:Infinity});const light=mesh.geometry;cached.update(0,0,null,0,null);
    loaded.push({full:await geometry(full),light:await geometry(light),material:await material(mesh.material),sphere:{center:full.boundingSphere.center.toArray(),radius:full.boundingSphere.radius},renderOrder:mesh.renderOrder,layers:mesh.layers.mask});
   }
   if(JSON.stringify(canonical(baseline))!==JSON.stringify(canonical(loaded))){const missing=canonical(baseline).filter(s=>!canonical(loaded).includes(s));throw Error('Geometry/LOD/material/texture difference: '+missing[0]);}
   const proxies=reef=>reef.userData.collisions.boxes.filter(b=>b.mesh?.startsWith('Coral habitat')).map(b=>({min:b.box.min.toArray(),max:b.box.max.toArray(),mesh:b.mesh}));
   if(JSON.stringify(canonical(proxies(reef)))!==JSON.stringify(canonical(proxies(reefCached))))throw Error('Prepared collision proxies changed');
   results.push({economy,beforeMs:Math.round(beforeMs),afterMs:Math.round(afterMs),cache:cached.coralCache,coralProxies:data.proxies.length,originalReefProxies:snapshot,cachedReefProxies:cachedSnapshot,identicalGeometry:true,identicalLOD:true,identicalMaterialAndPixels:true,identicalProxies:true});original.dispose();cached.dispose();
  }return results;
 },base);
 // Stale metadata must decline the cache before adding any geometry/proxies.
 await page.route('**/assets/models/prepared-corals/full.json',async route=>{const response=await route.fetch(),metadata=await response.json();metadata.sources[0].sha256='0'.repeat(64);await route.fulfill({json:metadata});});
 const stale=await page.evaluate(async base=>{const[{createModelScene},{createReef}]=await Promise.all([import(base+'model-scene.js'),import(base+'reef.js')]);const reef=createReef(),models=createModelScene({reef,terrainHeightAt:reef.userData.terrainHeightAt,collisions:reef.userData.collisions});const result=await models.load();return{result,cache:models.coralCache,children:models.root.children.length};},base);
 if(stale.cache.status!=='fallback'||stale.result.loaded!==8||stale.result.failed||stale.result.coralLoaded!==5)throw Error('Stale cache original fallback failed: '+JSON.stringify(stale));
 const output={reports,staleFallback:stale};await fs.mkdir(path.join(root,'qa'),{recursive:true});await fs.writeFile(path.join(root,'qa/prepared-corals-webp-verification.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
}finally{await browser.close();}
