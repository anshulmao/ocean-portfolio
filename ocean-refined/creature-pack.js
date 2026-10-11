import * as THREE from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {clone} from './vendor/SkeletonUtils.js';

export function createCreaturePack({terrainHeightAt,economy=false}){
  const root=new THREE.Group();root.name='Rigged creature visitors';const animals=[],diagnostics={loaded:0,failed:0,animals:[],rigged:true};
  const configs=[
    {id:'fin-whale',size:11,x:-25,z:-74,rx:22,rz:20,speed:1.1,height:14},
    {id:'orca',size:6,x:28,z:-67,rx:23,rz:25,speed:1.25,height:10},
    {id:'hammerhead',size:3.4,x:16,z:-36,rx:31,rz:25,speed:.9,height:7},
    {id:'manta-ray',size:4.3,x:-19,z:-30,rx:26,rz:25,speed:.7,height:8},
    ...economy?[]:[{id:'manta-ray',size:3.2,x:22,z:-80,rx:25,rz:16,speed:.6,height:8},{id:'magic-ray-1',size:3.4,x:25,z:-84,rx:18,rz:15,speed:.48,height:6},{id:'magic-ray-2',size:3.1,x:-24,z:-63,rx:21,rz:19,speed:.5,height:6}],
  ];
  let clock=0;const cache=new Map();
  async function load(){await Promise.all(configs.map(async(config,index)=>{
    try{if(!cache.has(config.id))cache.set(config.id,new GLTFLoader().loadAsync(`./assets/models/creatures/${config.id}.glb`));const gltf=await cache.get(config.id),model=clone(gltf.scene),wrapper=new THREE.Group();wrapper.name=config.id+' visitor '+index;wrapper.userData.creatureId=config.id;wrapper.add(model);model.scale.setScalar(config.size);root.add(wrapper);
      model.traverse(n=>{if(n.isSkinnedMesh){n.computeBoundingSphere();n.boundingSphere.radius*=1.2;n.frustumCulled=true;}});const mixer=new THREE.AnimationMixer(model);for(const clip of gltf.animations)mixer.clipAction(clip).setEffectiveTimeScale(.65+index*.025).play();mixer.update(index*.7);animals.push({config,wrapper,mixer,phase:index*1.38});diagnostics.loaded++;diagnostics.animals.push(config.id);update(0);
    }catch(e){diagnostics.failed++;diagnostics.error=e.message;}
  }));return diagnostics;}
  function update(dt,player=new THREE.Vector3()){
    clock+=Math.min(.1,Math.max(0,dt));
    for(const {config:c,wrapper,mixer,phase} of animals){
      const angle=clock*c.speed/Math.max(c.rx,c.rz)+phase,x=c.x+c.rx*Math.cos(angle),z=c.z+c.rz*Math.sin(angle),dx=-c.rx*Math.sin(angle),dz=c.rz*Math.cos(angle);
      const yaw=Math.atan2(dx,dz),reach=c.size*.5,floor=Math.max(terrainHeightAt(x,z),terrainHeightAt(x+Math.sin(yaw)*reach,z+Math.cos(yaw)*reach),terrainHeightAt(x-Math.sin(yaw)*reach,z-Math.cos(yaw)*reach));
      const targetY=Math.min(-7,floor+c.height),avoid=new THREE.Vector3(x,targetY,z).sub(player);avoid.y=0;const distance=avoid.length();if(distance<7&&distance>.01)avoid.multiplyScalar((7-distance)*.35/distance);else avoid.set(0,0,0);
      const target=new THREE.Vector3(x+avoid.x,targetY+Math.sin(clock*.18+phase)*.25,z+avoid.z);const initial=!wrapper.userData.started;if(initial){wrapper.position.copy(target);wrapper.userData.started=true;}else wrapper.position.lerp(target,1-Math.exp(-dt*1.3));
      const targetQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,yaw,Math.sin(angle)*.025));if(initial)wrapper.quaternion.copy(targetQ);else wrapper.quaternion.slerp(targetQ,1-Math.exp(-Math.max(dt,.01)*2));wrapper.userData.headingDot=new THREE.Vector3(0,0,1).applyQuaternion(wrapper.quaternion).dot(new THREE.Vector3(dx,0,dz).normalize());
      if(wrapper.position.distanceToSquared(player)<10000)mixer.update(dt);
    }
    diagnostics.headingDots=animals.map(a=>a.wrapper.userData.headingDot);
    diagnostics.finite=animals.every(a=>a.wrapper.position.toArray().every(Number.isFinite));
  }
  return {root,load,update,diagnostics};
}
