import * as THREE from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {turn,floatSkinIndices} from './assets.js';
import {sampleMarineRoute,WHALE_SHARK_ROUTE} from './marine-routes.js';

// One authored animal, calibrated from its skeleton rather than guessed axes.
export function createLargeMarine({terrainHeightAt=()=>-40}={}){
  const root=new THREE.Group(),traveller=new THREE.Group(),visual=new THREE.Group();root.name='Authored whale shark';root.add(traveller);traveller.add(visual);
  let mixer=null,head=null,tail=null,loaded=false,clock=0;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),forward=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),right=new THREE.Vector3();
  const diagnostics={loaded:false,error:null},bounds=new THREE.Sphere(),heading=new THREE.Vector3(0,0,1);
  // Read on demand: forcing the whole rig's world matrices every frame, a second time, only fed these two numbers.
  Object.defineProperties(diagnostics,{headingDot:{enumerable:true,get(){if(!loaded)return 1;root.updateMatrixWorld(true);head.getWorldPosition(a);tail.getWorldPosition(b);return forward.subVectors(a,b).normalize().dot(heading);}},position:{enumerable:true,get:()=>traveller.position.toArray()}});
  async function load(){
    try{
      const gltf=await new GLTFLoader().loadAsync('./assets/models/whale_shark_fantasy.glb');
      await turn();floatSkinIndices(gltf.scene);
      gltf.scene.traverse(n=>{if(/^(ocean|particles)/i.test(n.name)||n.isLight)n.visible=false;if(n.isMesh)n.frustumCulled=false;});
      visual.add(gltf.scene);mixer=new THREE.AnimationMixer(gltf.scene);
      const clip=gltf.animations.find(c=>c.name==='Swimming');if(clip)mixer.clipAction(clip).setEffectiveTimeScale(.32).play();mixer.update(0);root.updateMatrixWorld(true);
      head=gltf.scene.getObjectByName('head_WhaleSharkRig');tail=gltf.scene.getObjectByName('spine05_WhaleSharkRig');
      if(!head||!tail)throw new Error('Whale shark orientation anchors missing');
      head.getWorldPosition(a);tail.getWorldPosition(b);forward.subVectors(a,b).setY(0).normalize();
      right.crossVectors(up,forward).normalize();visual.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward)).invert();root.updateMatrixWorld(true);
      const bounds=new THREE.Box3();gltf.scene.traverseVisible(n=>{if(n.isMesh){n.computeBoundingBox?.();if(!n.boundingBox)n.geometry.computeBoundingBox();bounds.union((n.boundingBox||n.geometry.boundingBox).clone().applyMatrix4(n.matrixWorld));}});
      const size=bounds.getSize(a),scale=16/Math.max(size.x,size.y,size.z);const center=bounds.getCenter(b);visual.scale.setScalar(scale);visual.position.copy(center).multiplyScalar(-scale);diagnostics.length=16;
      loaded=true;diagnostics.loaded=true;update(0);return diagnostics;
    }catch(e){diagnostics.error=e.message;root.visible=false;return diagnostics;}
  }
  // view: { frustum, eye, range }. Beyond the haze or outside the view the
  // animal keeps to its route but is neither animated nor drawn.
  const route={},targetQ=new THREE.Quaternion(),pose=new THREE.Euler();
  function update(dt,view=null){
    if(!loaded)return;const step=Math.min(Math.max(dt||0,0),.1);clock+=step;
    const {angle,x,z,y:targetY,yaw,pitch}=sampleMarineRoute(WHALE_SHARK_ROUTE,clock,WHALE_SHARK_ROUTE.phase,terrainHeightAt,9,route);
    // Route stays above the local canopy; sample forward/back for the long body.
    const fx=Math.sin(yaw),fz=Math.cos(yaw);
    if(!traveller.userData.started){traveller.position.set(x,targetY,z);traveller.userData.started=true;}
    else traveller.position.lerp(a.set(x,targetY,z),1-Math.exp(-step*1.8));
    targetQ.setFromEuler(pose.set(-pitch,yaw,Math.sin(angle)*.02));if(!clock)traveller.quaternion.copy(targetQ);else traveller.quaternion.slerp(targetQ,1-Math.exp(-step*2.5));
    traveller.visible=true;
    if(view){bounds.center.copy(traveller.position);bounds.radius=10;traveller.visible=view.eye.distanceTo(bounds.center)-10<view.range&&view.frustum.intersectsSphere(bounds);if(!traveller.visible)return;}
    mixer.update(step);heading.set(fx,0,fz);
  }
  return{root,load,update,diagnostics};
}
