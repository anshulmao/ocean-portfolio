import * as THREE from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {clone} from './vendor/SkeletonUtils.js';
import {floatSkinIndices,turn} from './assets.js';
import {sampleMarineRoute} from './marine-routes.js';
import {USER_VISITOR_ROUTES,schoolHabitat} from './user-creature-routes.js';

const BASE='./assets/models/user-sets/sets/creature-set/',FRAMES=32;
// A school samples the supplied authored rig on the GPU. One small palette per
// species replaces a CPU skeleton and draw call for each little fish.
async function schoolPalette(gltf,mesh,clip){
  const mixer=new THREE.AnimationMixer(gltf.scene),action=mixer.clipAction(clip);action.play();
  const bones=mesh.skeleton.bones.length,data=new Float32Array(FRAMES*bones*16);
  for(let frame=0;frame<FRAMES;frame++){
    mixer.setTime(clip.duration*frame/FRAMES);gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();
    data.set(mesh.skeleton.boneMatrices,frame*bones*16);if(frame%8===7)await turn();
  }
  mixer.stopAllAction();mixer.setTime(0);
  const texture=new THREE.DataTexture(data,4,FRAMES*bones,THREE.RGBAFormat,THREE.FloatType);
  texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  return {texture,bones,duration:clip.duration};
}
function schoolMaterial(source,palette,mesh,time){
  const material=source.clone(),uniforms={uSchoolBones:{value:palette.texture},uSchoolTime:time,
    uSchoolDuration:{value:palette.duration},uSchoolBind:{value:mesh.bindMatrix.clone()},uSchoolUnbind:{value:mesh.bindMatrixInverse.clone()}};
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec4 skinIndex; attribute vec4 skinWeight; attribute vec2 aSchoolPhase;
uniform sampler2D uSchoolBones; uniform float uSchoolTime; uniform float uSchoolDuration;
uniform mat4 uSchoolBind; uniform mat4 uSchoolUnbind;
mat4 schoolBone(float bone,float frame){
  float row=(frame*${palette.bones.toFixed(1)}+bone+.5)/${(FRAMES*palette.bones).toFixed(1)};
  return mat4(texture2D(uSchoolBones,vec2(.125,row)),texture2D(uSchoolBones,vec2(.375,row)),texture2D(uSchoolBones,vec2(.625,row)),texture2D(uSchoolBones,vec2(.875,row)));
}
mat4 schoolPose(float frame){
  mat4 result=skinWeight.x*schoolBone(skinIndex.x,frame);
  if(skinWeight.y>0.0)result+=skinWeight.y*schoolBone(skinIndex.y,frame);
  if(skinWeight.z>0.0)result+=skinWeight.z*schoolBone(skinIndex.z,frame);
  if(skinWeight.w>0.0)result+=skinWeight.w*schoolBone(skinIndex.w,frame);
  return result;
}
`).replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
float schoolFrame=mod((uSchoolTime*aSchoolPhase.y/uSchoolDuration+aSchoolPhase.x)*${FRAMES.toFixed(1)},${FRAMES.toFixed(1)});
float frameA=floor(schoolFrame),frameB=mod(frameA+1.0,${FRAMES.toFixed(1)});
mat4 schoolSkin=uSchoolUnbind*(schoolPose(frameA)*(1.0-fract(schoolFrame))+schoolPose(frameB)*fract(schoolFrame))*uSchoolBind;
objectNormal=mat3(schoolSkin)*objectNormal;
`).replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed=(schoolSkin*vec4(transformed,1.0)).xyz;');
  };
  material.customProgramCacheKey=()=>`user-authored-school-sparse-v2-${palette.bones}-${FRAMES}`;
  return material;
}
export function createUserCreatures({terrainHeightAt=()=>-40,economy=false}={}){
  const root=new THREE.Group();root.name='User authored marine species';
  const diagnostics={ready:false,loaded:0,loadedSpecies:0,failed:0,species:24,visitors:0,visitorCount:0,schoolFish:0,schoolCount:0,schoolDrawCalls:0,authoredClips:true,realUnits:true,errors:[]};
  const visitors=[],schools=[],cache=new Map(),time={value:0},origin=new THREE.Vector3(),sphere=new THREE.Sphere();
  const target=new THREE.Vector3(),away=new THREE.Vector3(),pose=new THREE.Euler(0,0,0,'YXZ'),quaternion=new THREE.Quaternion(),dummy=new THREE.Object3D(),forward=new THREE.Vector3(),direction=new THREE.Vector3();
  // Zero-reach route samples ask for this exact coordinate three times. Retain
  // only the latest answer, so changing terrain/editor data is never gridded.
  let floorX=NaN,floorZ=NaN,floorY=0;
  const schoolFloor=(x,z)=>{if(x!==floorX||z!==floorZ){floorX=x;floorZ=z;floorY=terrainHeightAt(x,z);}return floorY;};
  const loadFile=spec=>{if(!cache.has(spec.id))cache.set(spec.id,new GLTFLoader().loadAsync(BASE+spec.file).then(async gltf=>{floatSkinIndices(gltf.scene);await turn();return gltf;}));return cache.get(spec.id);};
  async function addVisitors(spec,gltf){
    const routes=USER_VISITOR_ROUTES.filter(r=>r.id===spec.id);
    for(const config of routes.slice(0,economy&&routes.length>1?1:routes.length)){
      const model=clone(gltf.scene),wrapper=new THREE.Group();wrapper.name=spec.id+' authored visitor';wrapper.userData.creatureId=spec.id;wrapper.add(model);root.add(wrapper);
      const mixer=new THREE.AnimationMixer(model),clip=gltf.animations.find(c=>c.name==='swim')||gltf.animations[0];
      if(!clip)throw new Error(spec.id+' has no authored animation');
      const swim=mixer.clipAction(clip).play(),fastClip=gltf.animations.find(c=>c.name==='fast'),fast=fastClip?mixer.clipAction(fastClip).setEffectiveWeight(0).play():null;
      mixer.setTime(config.phase*.7);model.traverse(n=>{if(n.isSkinnedMesh){n.geometry.computeBoundingSphere();n.boundingSphere=n.geometry.boundingSphere.clone();n.boundingSphere.radius*=1.4;n.frustumCulled=true;}});
      visitors.push({spec,config,wrapper,mixer,swim,fast,boost:0,route:{},started:false,headingDot:1});diagnostics.visitors++;diagnostics.visitorCount++;
    }
  }
  async function addSchool(spec,gltf,index){
    let source=null;gltf.scene.traverse(n=>{if(n.isSkinnedMesh&&!source)source=n;});if(!source)throw new Error(spec.id+' has no skinned mesh');
    const clip=gltf.animations.find(c=>c.name==='swim')||gltf.animations[0],palette=await schoolPalette(gltf,source,clip);
    const count=spec.id==='remora'?(economy?4:6):(economy?8:14),geometry=source.geometry.clone(),phase=new THREE.InstancedBufferAttribute(new Float32Array(count*2),2);phase.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('aSchoolPhase',phase);
    const material=schoolMaterial(source.material,palette,source,time),mesh=new THREE.InstancedMesh(geometry,material,count);mesh.name=spec.id+' authored school';mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);
    const habitats=[schoolHabitat(index,0),schoolHabitat(index,1)],members=[];
    if(spec.id==='cleaner-wrasse')for(const home of habitats){home.rx=2;home.rz=2;home.height=1.5;home.speed=.2;}
    if(spec.id==='bluespotted-ray')for(const home of habitats){home.rx=5;home.rz=4;home.height=.5;home.speed=.5;}
    if(spec.id==='bumphead-parrotfish')for(const home of habitats){home.height=1.8;home.speed=.65;}
    if(['yellowfin-tuna','great-barracuda','giant-trevally'].includes(spec.id))for(const home of habitats){home.rx=17;home.rz=12;home.height=8;home.speed=spec.id==='yellowfin-tuna'?1.7:1.35;}
    for(let k=0;k<count;k++)members.push({position:new THREE.Vector3(),started:false,phase:k*2.399+index*.23,pace:.9+(k%4)*.04,habitat:k%2,yaw:0,pitch:0});
    schools.push({spec,mesh,phase,members,habitats,route:{},palette,visibleMask:-1,slots:new Uint8Array(count)});diagnostics.schoolFish+=count;diagnostics.schoolDrawCalls++;diagnostics.schoolCount+=habitats.length;
  }
  async function load(){
    const manifest=await fetch(BASE+'manifest.json').then(r=>{if(!r.ok)throw new Error('Creature manifest '+r.status);return r.json();});
    let cursor=0;const worker=async()=>{while(cursor<manifest.creatures.length){const index=cursor++,spec=manifest.creatures[index];try{
      const gltf=await loadFile(spec);if(USER_VISITOR_ROUTES.some(r=>r.id===spec.id))await addVisitors(spec,gltf);else await addSchool(spec,gltf,index);
      diagnostics.loaded++;diagnostics.loadedSpecies++;await turn();
    }catch(error){diagnostics.failed++;diagnostics.errors.push(spec.id+': '+error.message);}}};
    await Promise.all([worker(),worker()]);update(0);diagnostics.ready=true;return diagnostics;
  }
  function shown(position,radius,view,range=1){if(!view)return true;sphere.center.copy(position);sphere.radius=radius;return view.eye.distanceTo(position)-radius<view.range*range&&view.frustum.intersectsSphere(sphere);}
  function update(dt=0,player=origin,view=null){
    const step=Math.min(.1,Math.max(0,dt));time.value+=step;
    for(const animal of visitors){
      if(step===0&&animal.started){animal.wrapper.visible=shown(animal.wrapper.position,animal.spec.lengthMetres,view);continue;}
      const {config:c,spec,wrapper}=animal,r=sampleMarineRoute(c,time.value,c.phase,terrainHeightAt,spec.lengthMetres*.5,animal.route);
      target.set(r.x,r.y,r.z);away.copy(target).sub(player);const distance=away.length(),reach=spec.lengthMetres>5?7:3.5;
      if(distance<reach&&distance>.01){away.y=0;away.normalize();target.addScaledVector(away,(reach-distance)*.5);}
      // Gentle, bounded displacement between giants; never an impulsive kick.
      if(spec.lengthMetres>5)for(const other of visitors){if(other===animal||other.spec.lengthMetres<=5||!other.started)continue;away.copy(target).sub(other.wrapper.position);const length=away.length();if(length>0.01&&length<7){away.normalize();target.addScaledVector(away,(7-length)*.24);}}
      const initial=!animal.started;if(initial){wrapper.position.copy(target);animal.started=true;}else wrapper.position.lerp(target,1-Math.exp(-step*1.7));
      quaternion.setFromEuler(pose.set(-r.pitch,r.yaw,Math.sin(r.angle)*.02));if(initial)wrapper.quaternion.copy(quaternion);else if(step>0)wrapper.quaternion.slerp(quaternion,1-Math.exp(-step*2.8));
      animal.headingDot=forward.set(0,0,1).applyQuaternion(wrapper.quaternion).dot(direction.set(r.dx,0,r.dz).normalize());
      wrapper.visible=shown(wrapper.position,spec.lengthMetres,view);
      if(wrapper.visible){const alarm=distance<reach?Math.min(.25,(reach-distance)*.07):0;animal.boost+=(alarm-animal.boost)*(1-Math.exp(-step*1.3));animal.swim.setEffectiveWeight(1-animal.boost);if(animal.fast)animal.fast.setEffectiveWeight(animal.boost);animal.mixer.update(step);}
    }
    for(const school of schools){
      const {spec,mesh,members,habitats,phase,slots}=school;let drawn=0,mask=0;
      for(let h=0;h<habitats.length;h++){
        const home=habitats[h],r=step>0||school.visibleMask<0?sampleMarineRoute(home,time.value,home.phase,schoolFloor,0,school.route):null;
        for(let k=h;k<members.length;k+=2){
          const member=members[k];
          if(step>0||!member.started){
          const a=member.phase,spread=Math.max(1.6,spec.lengthMetres*2.2),targetX=r.x+Math.cos(a)*spread,targetZ=r.z+Math.sin(a)*spread;
          target.set(targetX,Math.max(r.y+Math.sin(a)*.45,terrainHeightAt(targetX,targetZ)+(spec.id==='bluespotted-ray'?.25:1)),targetZ);
          if(spec.id==='flying-fish')target.y=-2.6+Math.sin(a)*.4;
          if(spec.id==='remora'){
            const host=visitors.find(v=>v.spec.id==='whale-shark');if(host){const yaw=host.route.yaw??0,side=Math.cos(a)*1.5,back=-3.8-k*.17;target.copy(host.wrapper.position);target.x+=Math.cos(yaw)*side+Math.sin(yaw)*back;target.z+=-Math.sin(yaw)*side+Math.cos(yaw)*back;target.y-=.8;r.yaw=yaw;}
          }
          away.copy(target).sub(player);const distance=away.length();if(distance<3&&distance>.01)target.addScaledVector(away.normalize(),(3-distance)*.65);
          const spacing=.18+spec.lengthMetres*.85;
          for(let j=h;j<members.length;j+=2){if(j===k||!members[j].started)continue;away.copy(target).sub(members[j].position);const apart=away.length();if(apart>.01&&apart<spacing)target.addScaledVector(away.normalize(),(spacing-apart)*.3);}
          if(!member.started){member.position.copy(target);member.started=true;member.yaw=r.yaw;}else{
            direction.subVectors(target,member.position);const horizontal=Math.hypot(direction.x,direction.z),angle=horizontal>.004?Math.atan2(direction.x,direction.z):r.yaw;
            if(step>0){member.yaw+=Math.atan2(Math.sin(angle-member.yaw),Math.cos(angle-member.yaw))*(1-Math.exp(-step*5));const tilt=horizontal>.004?THREE.MathUtils.clamp(Math.atan2(direction.y,horizontal),-.3,.3):0;member.pitch+=(tilt-member.pitch)*(1-Math.exp(-step*4));}
            member.position.lerp(target,1-Math.exp(-step*2));
          }
          }
          if(!shown(member.position,Math.max(.25,spec.lengthMetres),view,spec.lengthMetres<.4?.45:.75))continue;
          slots[drawn++]=k;mask|=1<<k;
        }
      }
      const repack=mask!==school.visibleMask;
      if(drawn&&(step>0||repack)){
        for(let index=0;index<drawn;index++){
          const member=members[slots[index]];
          dummy.position.copy(member.position);dummy.rotation.set(-member.pitch,member.yaw,0,'YXZ');dummy.scale.setScalar(1);dummy.updateMatrix();
          mesh.setMatrixAt(index,dummy.matrix);
          if(repack)phase.setXY(index,member.phase,member.pace);
        }
        mesh.instanceMatrix.needsUpdate=true;
      }
      if(drawn&&repack)phase.needsUpdate=true;
      school.visibleMask=mask;mesh.count=drawn;mesh.visible=drawn>0;
    }
  }
  Object.defineProperties(diagnostics,{count:{enumerable:true,get:()=>diagnostics.visitorCount+diagnostics.schoolFish},headingDots:{enumerable:true,get:()=>visitors.map(a=>a.headingDot)},finite:{enumerable:true,get:()=>visitors.every(a=>a.wrapper.position.toArray().every(Number.isFinite))&&schools.every(s=>s.members.every(m=>m.position.toArray().every(Number.isFinite)))}});
  return {root,load,update,diagnostics,inspect:()=>({visitors:visitors.map(a=>({id:a.spec.id,length:a.spec.lengthMetres,position:a.wrapper.position.toArray(),headingDot:a.headingDot})),schools:schools.map(s=>({id:s.spec.id,count:s.members.length,drawn:s.mesh.count,bones:s.palette.bones,duration:s.palette.duration,members:s.members.map(m=>({position:m.position.toArray(),yaw:m.yaw}))}))})};
}
