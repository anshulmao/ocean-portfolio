import * as THREE from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {clone} from './vendor/SkeletonUtils.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {reindex,simplify,breathe,turn,floatSkinIndices} from './assets.js';
import {sampleMarineRoute,DEEP_VISITOR_ROUTES} from './marine-routes.js';

// A creature arrives as up to a dozen skinned parts on one six-joint skeleton,
// each its own draw call and, once cloned, its own skeleton to update and
// upload. Parts that share a surface are merged into one skinned mesh; this
// runs once per file, before the animals are cloned from it.
function fuse(scene){
  const parts=[];scene.traverse(n=>{if(n.isSkinnedMesh)parts.push(n);});
  if(parts.length<2)return;
  const first=parts[0],same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  // Only when every part hangs off the same node, untransformed, on the same bones and bind pose.
  if(!parts.every(p=>p.parent===first.parent&&p.matrix.equals(first.matrix)&&!Array.isArray(p.material)&&same(p.skeleton.bones,first.skeleton.bones)&&p.skeleton.boneInverses.every((m,i)=>m.equals(first.skeleton.boneInverses[i]))&&p.bindMatrix.equals(first.bindMatrix)&&same(Object.keys(p.geometry.attributes).sort(),Object.keys(first.geometry.attributes).sort())&&Boolean(p.geometry.index)===Boolean(first.geometry.index)))return;
  const groups=new Map(),parent=first.parent;
  for(const part of parts){const m=part.material,key=[m.type,m.map?.source.uuid,m.color?.getHex(),m.emissive?.getHex(),m.emissiveMap?.source.uuid,m.transparent,m.opacity,m.side,m.alphaTest,m.vertexColors,m.normalMap?.source.uuid].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(part);}
  for(const group of groups.values()){
    if(group.length<2)continue;
    const geometry=mergeGeometries(group.map(p=>p.geometry),false);if(!geometry)continue;
    const mesh=new THREE.SkinnedMesh(geometry,group[0].material);mesh.name=group[0].name+' merged';mesh.matrix.copy(first.matrix);mesh.matrix.decompose(mesh.position,mesh.quaternion,mesh.scale);
    parent.add(mesh);mesh.bind(first.skeleton,first.bindMatrix);
    for(const part of group){parent.remove(part);part.geometry.dispose();}
  }
}
// Once per file, shared by every animal cloned from it: its vertices without duplicates (two of the files carry three
// to a triangle), and a lighter copy of each large part for an animal seen across twenty metres of water. Skinning is
// the dearest vertex work in the frame, and these animals are mostly seen far off.
const lighter=new WeakMap();
// The steps of preparing a file run in slices between frames (breathe and turn, see assets.js).
async function lighten(scene){const parts=[];scene.traverse(n=>{if(n.isSkinnedMesh)parts.push(n);});for(const n of parts){n.geometry=await reindex(n.geometry,breathe);await turn();const light=await simplify(n.geometry,.4,3000,breathe);if(light)lighter.set(n.geometry,light);await turn();}}
export function createCreaturePack({terrainHeightAt,economy=false}){
  const root=new THREE.Group();root.name='Rigged creature visitors';const animals=[],diagnostics={loaded:0,failed:0,animals:[],rigged:true};
  const configs=[
    {id:'manta-ray',size:4.3,x:-7,z:-37,rx:43,rz:32,speed:1.05,height:8},
    ...economy?[]:[{id:'manta-ray',size:3.2,x:5,z:-76,rx:44,rz:25,speed:.95,height:8},{id:'magic-ray-1',size:3.4,x:7,z:-83,rx:43,rz:22,speed:.8,height:6},{id:'magic-ray-2',size:3.1,x:-7,z:-55,rx:44,rz:35,speed:.85,height:6}],
  ];
  let clock=0;const cache=new Map();
  // Two files at a time: seven parsed at once made one long stall, and the landmarks are loading too.
  async function load(){let cursor=0;const one=async(config,index)=>{
    try{if(!cache.has(config.id))cache.set(config.id,new GLTFLoader().loadAsync(`./assets/models/creatures/${config.id}.glb`).then(async gltf=>{await turn();floatSkinIndices(gltf.scene);fuse(gltf.scene);await turn();await lighten(gltf.scene);return gltf;}));const gltf=await cache.get(config.id);await turn();const model=clone(gltf.scene),wrapper=new THREE.Group();wrapper.name=config.id+' visitor '+index;wrapper.userData.creatureId=config.id;wrapper.add(model);model.scale.setScalar(config.size);root.add(wrapper);
      // Every part of an animal follows the same bones: one skeleton, one bone upload a frame.
      let shared=null;model.traverse(n=>{if(n.isSkinnedMesh){if(!shared)shared=n.skeleton;else if(n.skeleton.bones.every((bone,i)=>bone===shared.bones[i])&&n.skeleton.boneInverses.every((m,i)=>m.equals(shared.boneInverses[i]))){n.skeleton.dispose();n.skeleton=shared;}
        // Bounds from the bind pose, with room for the swim: skinning every vertex on the CPU to measure them stalled the load.
        if(!n.geometry.boundingSphere)n.geometry.computeBoundingSphere();n.boundingSphere=n.geometry.boundingSphere.clone();n.boundingSphere.radius*=1.35;n.frustumCulled=true;}});
      // The translucent outline hull doubles a ray's skinned vertices and cannot be made out past forty metres of water.
      const shells=[],swaps=[],swimBones=[];model.traverse(n=>{if(n.isSkinnedMesh&&/outline/i.test(n.material.name||''))shells.push(n);if(n.isSkinnedMesh&&lighter.has(n.geometry))swaps.push({mesh:n,full:n.geometry,light:lighter.get(n.geometry)});if(n.isBone&&/_joint_[1-5]$/.test(n.name))swimBones.push({bone:n,rest:n.quaternion.clone(),joint:Number(n.name.slice(-1))});});
      const harmonic=['fin-whale','orca','hammerhead'].includes(config.id),mixer=new THREE.AnimationMixer(model);
      // Mammal flukes beat vertically; shark tails sweep laterally. Reuse the
      // existing skin weights, with a continuous wave through its six joints.
      if(!harmonic)for(const clip of gltf.animations)mixer.clipAction(clip).setEffectiveTimeScale(.51+index*.015).play();
      mixer.update(index*.7);animals.push({config,wrapper,mixer,shells,swaps,swimBones,harmonic,phase:config.phase??index*1.38});diagnostics.loaded++;diagnostics.animals.push(config.id);update(0);
    }catch(e){diagnostics.failed++;diagnostics.error=e.message;}
  },worker=async()=>{while(cursor<configs.length){const index=cursor++;await one(configs[index],index);}};await Promise.all([worker(),worker()]);return diagnostics;}
  const avoid=new THREE.Vector3(),target=new THREE.Vector3(),targetQ=new THREE.Quaternion(),swimQ=new THREE.Quaternion(),swimAxis=new THREE.Vector3(),lean=new THREE.Euler(),facing=new THREE.Vector3(),course=new THREE.Vector3(),origin=new THREE.Vector3(),bounds=new THREE.Sphere();
  const route={};
  // Read on demand rather than rebuilt every frame.
  Object.defineProperties(diagnostics,{headingDots:{enumerable:true,get:()=>animals.map(a=>a.wrapper.userData.headingDot)},finite:{enumerable:true,get:()=>animals.every(a=>a.wrapper.position.toArray().every(Number.isFinite))}});
  // view: { frustum, eye, range }. An animal beyond the haze is not drawn, and
  // one outside the view keeps to its route but skips its skeleton animation.
  function update(dt,player=origin,view=null){
    clock+=Math.min(.1,Math.max(0,dt));
    for(const {config:c,wrapper,mixer,shells,swaps,swimBones,harmonic,phase} of animals){
      const {angle,x,z,dx,dz,yaw,y:targetY,pitch}=sampleMarineRoute(c,clock,phase,terrainHeightAt,c.size*.5,route);
      avoid.set(x,targetY,z).sub(player);const distance=avoid.length();avoid.y=0;if(distance<7&&distance>.01)avoid.multiplyScalar((7-distance)*.35/Math.max(.01,avoid.length()));else avoid.set(0,0,0);
      target.set(x+avoid.x,targetY,z+avoid.z);const initial=!wrapper.userData.started;if(initial){wrapper.position.copy(target);wrapper.userData.started=true;}else wrapper.position.lerp(target,1-Math.exp(-dt*1.8));
      targetQ.setFromEuler(lean.set(-pitch,yaw,Math.sin(angle)*.035));if(initial)wrapper.quaternion.copy(targetQ);else wrapper.quaternion.slerp(targetQ,1-Math.exp(-Math.max(dt,.01)*2.5));wrapper.userData.headingDot=facing.set(0,0,1).applyQuaternion(wrapper.quaternion).dot(course.set(dx,0,dz).normalize());
      let animate=wrapper.position.distanceToSquared(player)<10000;wrapper.visible=true;
      if(view){bounds.center.copy(wrapper.position);bounds.radius=c.size;wrapper.visible=view.eye.distanceTo(bounds.center)-bounds.radius<view.range;animate=wrapper.visible&&view.frustum.intersectsSphere(bounds);}
      if(shells.length){const close=!view||view.eye.distanceToSquared(wrapper.position)<1600;for(const shell of shells)shell.visible=close;}
      if(swaps.length){const far=Boolean(view)&&view.eye.distanceTo(wrapper.position)-c.size>18;for(const swap of swaps){const geometry=far?swap.light:swap.full;if(swap.mesh.geometry!==geometry)swap.mesh.geometry=geometry;}}
      if(animate){if(harmonic){const mammal=c.id!=='hammerhead',frequency=c.id==='fin-whale'?.84:c.id==='orca'?1.24:1.5;swimAxis.set(mammal?1:0,mammal?0:1,0);for(const {bone,rest,joint} of swimBones){const amplitude=.015+Math.pow(joint/5,1.7)*(mammal?.075:.10);swimQ.setFromAxisAngle(swimAxis,Math.sin(clock*frequency+phase-joint*.62)*amplitude);bone.quaternion.copy(rest).multiply(swimQ);}}else mixer.update(dt);}
    }
  }
  return {root,load,update,diagnostics};
}
