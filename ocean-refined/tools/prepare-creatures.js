import * as T from '../vendor/three.module.min.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {GLTFExporter} from '../vendor/GLTFExporter.js';

function softened(material){const m=material.clone();if('metalness' in m)m.metalness=.03;if('roughness' in m)m.roughness=.65;return m;}
export function rigCreature(meshes,id,{ray=false,vertical=false,length=1}={}){
  const group=new T.Group();group.name=id;
  const bounds=new T.Box3();for(const m of meshes){m.geometry.computeBoundingBox();bounds.union(m.geometry.boundingBox);}
  const size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),scale=length/Math.max(size.x,size.z);
  const width=size.x*scale,bodyLength=size.z*scale;
  const bones=[new T.Bone(),new T.Bone(),new T.Bone(),new T.Bone(),new T.Bone(),new T.Bone()];
  bones.forEach((b,i)=>b.name=`${id}_joint_${i}`);
  bones[0].add(bones[1],bones[4],bones[5]);bones[1].position.z=-bodyLength*.13;bones[1].add(bones[2]);bones[2].position.z=-bodyLength*.17;bones[2].add(bones[3]);bones[3].position.z=-bodyLength*.16;
  bones[4].position.x=-width*.15;bones[5].position.x=width*.15;group.add(bones[0]);group.updateMatrixWorld(true);
  const skeleton=new T.Skeleton(bones);skeleton.calculateInverses();
  for(const m of meshes){
    const g=m.geometry.clone();g.translate(-center.x,-center.y,-center.z);g.scale(scale,scale,scale);
    const indices=[],weights=[],p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=p.getZ(i),tail=T.MathUtils.clamp((-z/bodyLength-.02)/.42,0,1)*3;
      const low=Math.min(2,Math.floor(tail)),high=low+1,blend=tail-low;
      if(ray&&Math.abs(x)>width*.13){const wing=T.MathUtils.smoothstep(Math.abs(x),width*.13,width*.42);indices.push(0,x<0?4:5,0,0);weights.push(1-wing,wing,0,0);}
      else{indices.push(low,high,0,0);weights.push(1-blend,blend,0,0);}
    }
    g.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
    const skin=new T.SkinnedMesh(g,Array.isArray(m.material)?m.material.map(softened):softened(m.material));skin.name=id+'_body_'+group.children.length;skin.bind(skeleton,new T.Matrix4());skin.frustumCulled=false;group.add(skin);
  }
  group.updateMatrixWorld(true);
  const times=[],tracks=[],duration=ray?3.6:vertical?3.8:2.8;
  for(let i=0;i<=48;i++)times.push(i/48*duration);
  for(let i=1;i<6;i++){
    const values=[];for(const time of times){let angle=Math.sin(time/duration*Math.PI*2-i*.38)*(ray?(i>=4?.23:.04):i>=4?.035:.085+i*.025);if(i===4)angle*=-1;
      const axis=ray&&i>=4?new T.Vector3(0,0,1):vertical?new T.Vector3(1,0,0):new T.Vector3(0,1,0);values.push(...new T.Quaternion().setFromAxisAngle(axis,angle).toArray());}
    tracks.push(new T.QuaternionKeyframeTrack(bones[i].name+'.quaternion',times,values));
  }
  const clip=new T.AnimationClip('Gentle swim',duration,tracks);group.userData={forward:'+Z',rig:'six-joint weighted swimming skeleton',sourcePack:id.startsWith('magic')?'magic_ocean':'sea_creatures',license:'CC-BY-SA-4.0',author:id.startsWith('magic')?'mister_monopoly':'Lhimo',source:id.startsWith('magic')?'https://sketchfab.com/3d-models/magic-ocean-f595e1812f0f42e0a4ce16acc0ac7107':'https://sketchfab.com/3d-models/sea-creatures-a9e579418f36468ba33902eeb8d9d96a'};
  return {group,clip};
}

// Export a self-contained GLB for each creature, including textures, skin and clip.
export async function prepareSeaCreatures(){
  const pack=await new GLTFLoader().loadAsync('../assets/models/sea_creatures.glb');pack.scene.updateMatrixWorld(true);const meshes=[];pack.scene.traverse(n=>{if(n.isMesh){const geometry=n.geometry.clone().applyMatrix4(n.matrixWorld);meshes.push(new T.Mesh(geometry,n.material));}});
  const configs=[['fin-whale',{vertical:true}],['manta-ray',{ray:true}],['hammerhead',{}],['orca',{vertical:true}]],result=[];
  for(let i=0;i<configs.length;i++){const [id,config]=configs[i],rig=rigCreature([meshes[i]],id,config);const buffer=await new GLTFExporter().parseAsync(rig.group,{binary:true,animations:[rig.clip],maxTextureSize:1024});result.push({id,buffer,vertices:meshes[i].geometry.attributes.position.count});}
  return result;
}

function components(mesh){
  const g=mesh.geometry,p=g.attributes.position,count=p.count,parent=Array.from({length:count},(_,i)=>i),weld=new Map();
  function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
  function union(a,b){parent[root(a)]=root(b);}
  for(let i=0;i<count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(5)).join(',');if(weld.has(key))union(i,weld.get(key));else weld.set(key,i);}
  const order=g.index?Array.from(g.index.array):Array.from({length:count},(_,i)=>i);
  for(let i=0;i<order.length;i+=3){union(order[i],order[i+1]);union(order[i],order[i+2]);}
  const groups=new Map();for(let i=0;i<order.length;i+=3){const key=root(order[i]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(order[i],order[i+1],order[i+2]);}
  const result=[];for(const vertices of groups.values()){
    if(vertices.length<18)continue;const geometry=new T.BufferGeometry();
    for(const [name,attribute] of Object.entries(g.attributes)){const values=[];for(const index of vertices)for(let j=0;j<attribute.itemSize;j++)values.push(attribute.array[index*attribute.itemSize+j]);geometry.setAttribute(name,new T.Float32BufferAttribute(values,attribute.itemSize));}
    geometry.applyMatrix4(mesh.matrixWorld);geometry.computeBoundingBox();result.push({mesh:new T.Mesh(geometry,mesh.material),box:geometry.boundingBox.clone(),count:vertices.length});
  }return result;
}
export async function prepareMagic(){
  const pack=await new GLTFLoader().loadAsync('../assets/models/magic_ocean.glb');pack.scene.updateMatrixWorld(true);let parts=[];pack.scene.traverse(n=>{if(n.isMesh)parts.push(...components(n));});
  const candidates=parts.filter(p=>{const s=p.box.getSize(new T.Vector3());return Math.max(s.x,s.z)>.7&&p.count>600;}).sort((a,b)=>b.count-a.count);
  const chosen=[],used=new Set(),result=[];
  for(const anchor of candidates){
    if(used.has(anchor)||chosen.length>=6)continue;
    const box=anchor.box.clone().expandByScalar(.06),cluster=parts.filter(p=>!used.has(p)&&box.containsPoint(p.box.getCenter(new T.Vector3()))&&box.intersectsBox(p.box));
    if(cluster.length<1)continue;cluster.forEach(p=>used.add(p));chosen.push(anchor);
    const id='magic-ray-'+chosen.length;for(const part of cluster)part.mesh.geometry.rotateY(-Math.PI/2);const rig=rigCreature(cluster.map(p=>p.mesh),id,{ray:true});
    const buffer=await new GLTFExporter().parseAsync(rig.group,{binary:true,animations:[rig.clip],maxTextureSize:1024});result.push({id,buffer,parts:cluster.length,vertices:cluster.reduce((sum,p)=>sum+p.count,0)});
  }
  return result;
}
