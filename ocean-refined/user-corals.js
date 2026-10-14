import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

const DIRECTORY=new URL('./assets/models/user-sets/sets/coral-set/',import.meta.url);
const ZONES={shallow:[5,18],mid:[18,34],deep:[34,65]};
const LANDMARK_LANES=[[-12,-15,7],[18,-39,9],[-18,-82,7],[0,0,5],[20,-66,7]];
const UP=new THREE.Vector3(0,1,0);
function randomSeed(seed=0x431ac8){return()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};}
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

// All colonies share one geometry/material batch per species. Placement is
// baked once; runtime cost is thirteen bounded instanced draws, not one draw
// per colony. Existing coral and landscape geometry are left alone.
export function createUserCorals({terrainHeightAt,collisions,economy=false}={}){
  const root=new THREE.Group();root.name='User coral pack · grounded reef gardens';
  const diagnostics={status:'idle',ready:false,loaded:0,loadedSpecies:0,failed:0,species:0,colonies:0,count:0,batches:0,triangles:0,proxies:0,rejected:0,maxBaseGap:0,minContact:Infinity,maxSlope:0,zones:{shallow:0,mid:0,deep:0},speciesCounts:{},errors:[],patches:[],loading:{durationMs:0,terrainSamples:0,collisionTests:0,baseVerticesBefore:0,baseVerticesAfter:0}};
  const placements=[],loader=new GLTFLoader(),rng=randomSeed(),normal=new THREE.Vector3(),yawQ=new THREE.Quaternion(),tiltQ=new THREE.Quaternion(),rotation=new THREE.Quaternion(),matrix=new THREE.Matrix4(),point=new THREE.Vector3(),position=new THREE.Vector3(),scaleV=new THREE.Vector3(),probe=new THREE.Vector3();
  const floor=(x,z)=>{diagnostics.loading.terrainSamples++;return terrainHeightAt?.(x,z)??-12;};
  function isLane(x,z,r=0){for(let i=0;i<LANDMARK_LANES.length;i++){const lane=LANDMARK_LANES[i],dx=x-lane[0],dz=z-lane[1],reach=lane[2]+r;if(dx*dx+dz*dz<reach*reach)return true;}return false;}
  function gradient(x,z){const dx=(floor(x+.35,z)-floor(x-.35,z))/.7,dz=(floor(x,z+.35)-floor(x,z-.35))/.7;normal.set(-dx,1,-dz).normalize();return Math.hypot(dx,dz);}
  function centers(){
    const candidates={shallow:[],mid:[],deep:[]};
    for(let z=-96;z<=22;z+=5)for(let x=-51;x<=51;x+=5){const depth=-floor(x,z);if(isLane(x,z,3)||gradient(x,z)>.35)continue;for(const [zone,[min,max]]of Object.entries(ZONES))if(depth>=min&&depth<max)candidates[zone].push({x,z,depth});}
    const selected={};
    for(const zone of Object.keys(ZONES)){
      const available=candidates[zone],chosen=[];
      for(let i=0;i<4&&available.length;i++){
        // Farthest-point selection spreads each depth band across the map.
        let item=available[Math.floor(rng()*available.length)];
        if(chosen.length){
          const distance=q=>{let closest=Infinity;for(let c=0;c<chosen.length;c++){const dx=q.x-chosen[c].x,dz=q.z-chosen[c].z;closest=Math.min(closest,dx*dx+dz*dz);}return closest;};
          let best=distance(item);for(let p=0;p<available.length;p++){const score=distance(available[p]);if(score>best){item=available[p];best=score;}}
        }
        chosen.push(item);available.splice(available.indexOf(item),1);
      }
      selected[zone]=chosen;diagnostics.patches.push(...chosen.map(p=>({...p,zone,radius:5})));
    }
    return selected;
  }
  function speciesGeometry(scene){
    scene.updateMatrixWorld(true);const grouped=new Map();
    scene.traverseVisible(mesh=>{
      if(!mesh.isMesh||mesh.isSkinnedMesh)return;
      if(Array.isArray(mesh.material))throw new Error('Coral material arrays require explicit primitive separation');
      const material=mesh.material;let bin=grouped.get(material);if(!bin){bin=[];grouped.set(material,bin);}
      const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geometry.applyMatrix4(mesh.matrixWorld);bin.push(geometry);
    });
    const all=new THREE.Box3().setFromObject(scene),offset=new THREE.Vector3(-(all.min.x+all.max.x)/2,-all.min.y,-(all.min.z+all.max.z)/2);
    const parts=[];let totalTriangles=0;
    for(const [source,pieces]of grouped){const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());geometry.translate(offset.x,offset.y,offset.z);geometry.computeBoundingBox();geometry.computeBoundingSphere();const material=source.clone();material.roughness=Math.max(.65,material.roughness??.8);material.metalness=0;const triangles=geometry.attributes.position.count/3;totalTriangles+=triangles;parts.push({geometry,material});}
    const bounds=new THREE.Box3();for(const part of parts)bounds.union(part.geometry.boundingBox);
    const base=[],seen=new Set();
    // Shared triangle corners have exactly the same transformed coordinates.
    // Sampling each unique base point once preserves min/max support exactly.
    for(const {geometry}of parts){const p=geometry.attributes.position;for(let i=0;i<p.count;i++)if(p.getY(i)<=.012){diagnostics.loading.baseVerticesBefore++;const x=p.getX(i),y=p.getY(i),z=p.getZ(i),key=x+','+y+','+z;if(!seen.has(key)){seen.add(key);base.push(new THREE.Vector3(x,y,z));}}}
    if(!base.length)base.push(new THREE.Vector3());
    diagnostics.loading.baseVerticesAfter+=base.length;
    const disposeGeo=new Set(),disposeMat=new Set();scene.traverse(o=>{if(o.isMesh){disposeGeo.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])disposeMat.add(m);}});disposeGeo.forEach(g=>g.dispose());disposeMat.forEach(m=>m.dispose());
    return{parts,bounds,base,totalTriangles};
  }
  let promise=null;
  async function build(){
    const started=performance.now();diagnostics.status='loading';const response=await fetch(new URL('manifest.json',DIRECTORY));if(!response.ok)throw Error('Coral manifest unavailable');const manifest=await response.json(),patches=centers();
    const originalBoxes=collisions?.boxes?.map(entry=>entry.box)??[];
    // Load-only broad phase, frozen to the same original collision snapshot.
    // A point inside any original box must share an X/Z cell with that box;
    // the final exact containsPoint test also checks height.
    const boxCells=new Map(),cellSize=8;
    for(const box of originalBoxes){for(let x=Math.floor(box.min.x/cellSize);x<=Math.floor(box.max.x/cellSize);x++)for(let z=Math.floor(box.min.z/cellSize);z<=Math.floor(box.max.z/cellSize);z++){const key=x+','+z;let cell=boxCells.get(key);if(!cell){cell=[];boxCells.set(key,cell);}cell.push(box);}}
    function occupied(point){const nearby=boxCells.get(Math.floor(point.x/cellSize)+','+Math.floor(point.z/cellSize));if(!nearby)return false;for(let i=0;i<nearby.length;i++){diagnostics.loading.collisionTests++;if(nearby[i].containsPoint(point))return true;}return false;}
    for(const species of manifest.corals){
      try{
        const gltf=await loader.loadAsync(new URL(species.file,DIRECTORY).href);const prepared=speciesGeometry(gltf.scene),matrices=[],target=economy?7:16;
        const anchors=patches[species.zone]??[],[minDepth,maxDepth]=ZONES[species.zone]??ZONES.mid;
        for(let i=0;i<target;i++){
          let placed=false;
          for(let attempt=0;attempt<100&&!placed&&anchors.length;attempt++){
            const anchor=anchors[(i+Math.floor(attempt/25))%anchors.length],angle=rng()*Math.PI*2,radius=Math.sqrt(rng())*5;
            const x=anchor.x+Math.cos(angle)*radius,z=anchor.z+Math.sin(angle)*radius,height=floor(x,z),depth=-height;
            const scale=(species.widthMetres>1?1.05:1.3)+rng()*(species.widthMetres>1?.55:.9);
            const slope=gradient(x,z);
            if(depth<minDepth||depth>=maxDepth||isLane(x,z,species.widthMetres*scale*.35)||slope>.35){diagnostics.rejected++;continue;}
            probe.set(x,height+.3,z);if(occupied(probe)){diagnostics.rejected++;continue;}
            let overlaps=false;for(let p=0;p<placements.length;p++){const placed=placements[p],dx=placed.x-x,dz=placed.z-z,reach=(placed.width+species.widthMetres*scale)*.28;if(dx*dx+dz*dz<reach*reach){overlaps=true;break;}}
            if(overlaps){diagnostics.rejected++;continue;}
            tiltQ.setFromUnitVectors(UP,normal);yawQ.setFromAxisAngle(UP,rng()*Math.PI*2);rotation.copy(tiltQ).multiply(yawQ);position.set(x,0,z);scaleV.setScalar(scale);matrix.compose(position,rotation,scaleV);
            let support=-Infinity,lowest=Infinity;
            for(const vertex of prepared.base){point.copy(vertex).applyMatrix4(matrix);const offset=floor(point.x,point.z)-point.y;support=Math.max(support,offset);lowest=Math.min(lowest,offset);}
            const gap=support-lowest;
            if(!Number.isFinite(support)||gap>.10){diagnostics.rejected++;continue;}
            position.y=support-.025;matrix.compose(position,rotation,scaleV);matrices.push(matrix.clone());
            const box=prepared.bounds.clone().applyMatrix4(matrix),size=box.getSize(new THREE.Vector3());
            if(collisions?.addBox&&size.y>.4&&Math.max(size.x,size.z)>.45){const center=box.getCenter(new THREE.Vector3()),half=size.multiplyScalar(.32);collisions.addBox(new THREE.Box3(center.clone().sub(half),center.clone().add(half)),{mesh:species.name,kind:'user-coral',species:species.id});diagnostics.proxies++;}
            placements.push({species:species.id,zone:species.zone,x,y:position.y,z,width:species.widthMetres*scale,depth,slope,contact:-.025,maxGap:gap-.025,matrix:matrix.toArray()});diagnostics.maxBaseGap=Math.max(diagnostics.maxBaseGap,gap-.025);diagnostics.minContact=Math.min(diagnostics.minContact,-.025);diagnostics.maxSlope=Math.max(diagnostics.maxSlope,slope);placed=true;
          }
        }
        for(const {geometry,material}of prepared.parts){const batch=new THREE.InstancedMesh(geometry,material,matrices.length);batch.name=species.name+' colonies';batch.userData.species=species.id;batch.userData.zone=species.zone;batch.castShadow=false;batch.receiveShadow=false;matrices.forEach((m,i)=>batch.setMatrixAt(i,m));batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);batch.instanceMatrix.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere();root.add(batch);diagnostics.batches++;}
        diagnostics.loaded++;diagnostics.loadedSpecies++;diagnostics.species++;diagnostics.colonies+=matrices.length;diagnostics.count=diagnostics.colonies;diagnostics.triangles+=prepared.totalTriangles*matrices.length;diagnostics.zones[species.zone]+=matrices.length;diagnostics.speciesCounts[species.id]=matrices.length;
      }catch(error){diagnostics.failed++;diagnostics.errors.push(species.id+': '+error.message);}
      await pause();
    }
    diagnostics.status=diagnostics.failed?'partial':'ready';diagnostics.ready=true;diagnostics.loading.durationMs=Math.round((performance.now()-started)*100)/100;root.userData.placements=placements;return diagnostics;
  }
  function load(){return promise??=build().catch(error=>{diagnostics.status='error';diagnostics.errors.push(error.message);throw error;});}
  return{root,load,diagnostics,placements};
}
