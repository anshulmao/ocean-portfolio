import * as THREE from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';

// One authored animal, calibrated from its skeleton rather than guessed axes.
export function createLargeMarine({terrainHeightAt=()=>-40}={}){
  const root=new THREE.Group(),traveller=new THREE.Group(),visual=new THREE.Group();root.name='Authored whale shark';root.add(traveller);traveller.add(visual);
  let mixer=null,head=null,tail=null,loaded=false,clock=0;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),forward=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),right=new THREE.Vector3();
  const diagnostics={loaded:false,error:null,headingDot:1};
  async function load(){
    try{
      const gltf=await new GLTFLoader().loadAsync('./assets/models/whale_shark_fantasy.glb');
      gltf.scene.traverse(n=>{if(/^(ocean|particles)/i.test(n.name)||n.isLight)n.visible=false;if(n.isMesh)n.frustumCulled=false;});
      visual.add(gltf.scene);mixer=new THREE.AnimationMixer(gltf.scene);
      const clip=gltf.animations.find(c=>c.name==='Swimming');if(clip)mixer.clipAction(clip).setEffectiveTimeScale(.38).play();mixer.update(0);root.updateMatrixWorld(true);
      head=gltf.scene.getObjectByName('head_WhaleSharkRig');tail=gltf.scene.getObjectByName('spine05_WhaleSharkRig');
      if(!head||!tail)throw new Error('Whale shark orientation anchors missing');
      head.getWorldPosition(a);tail.getWorldPosition(b);forward.subVectors(a,b).setY(0).normalize();
      right.crossVectors(up,forward).normalize();visual.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward)).invert();root.updateMatrixWorld(true);
      const bounds=new THREE.Box3();gltf.scene.traverseVisible(n=>{if(n.isMesh){n.computeBoundingBox?.();if(!n.boundingBox)n.geometry.computeBoundingBox();bounds.union((n.boundingBox||n.geometry.boundingBox).clone().applyMatrix4(n.matrixWorld));}});
      const size=bounds.getSize(a),scale=12/Math.max(size.x,size.y,size.z);const center=bounds.getCenter(b);visual.scale.setScalar(scale);visual.position.copy(center).multiplyScalar(-scale);
      loaded=true;diagnostics.loaded=true;update(0);return diagnostics;
    }catch(e){diagnostics.error=e.message;root.visible=false;return diagnostics;}
  }
  function update(dt){
    if(!loaded)return;clock+=Math.min(Math.max(dt||0,0),.1);mixer.update(Math.min(Math.max(dt||0,0),.1));
    const angle=clock*.014+.35,x=36*Math.cos(angle),z=-48+27*Math.sin(angle),dx=-36*Math.sin(angle),dz=27*Math.cos(angle);
    // Route stays above the local canopy; sample forward/back for the long body.
    const yaw=Math.atan2(dx,dz),fx=Math.sin(yaw),fz=Math.cos(yaw);
    const floor=Math.max(terrainHeightAt(x,z),terrainHeightAt(x+fx*7,z+fz*7),terrainHeightAt(x-fx*7,z-fz*7));
    const targetY=Math.min(-8,floor+9);
    traveller.position.set(x,clock?THREE.MathUtils.lerp(traveller.position.y||targetY,targetY,1-Math.exp(-Math.max(dt,0)*1.2)):targetY,z);traveller.rotation.set(0,yaw,0);
    root.updateMatrixWorld(true);head.getWorldPosition(a);tail.getWorldPosition(b);forward.subVectors(a,b).normalize();diagnostics.headingDot=forward.dot(right.set(fx,0,fz));diagnostics.position=traveller.position.toArray();
  }
  return{root,load,update,diagnostics};
}
