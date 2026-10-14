import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

// Compact diver propulsion vehicle. Three static material batches and one
// rotating propeller; no downloaded textures, shadows or per-frame geometry.
export function createDiveScooter(camera, diver) {
  const root = new THREE.Group(); root.name = 'Red handheld dive scooter'; camera.add(root); root.visible = false;
  const bins = [[], [], []];
  function part(geometry, bucket, position, scale, rotation = [0, 0, 0]) {
    const transform = new THREE.Object3D(); transform.position.set(...position); transform.scale.set(...scale); transform.rotation.set(...rotation); transform.updateMatrix();
    const baked = geometry.toNonIndexed(); baked.applyMatrix4(transform.matrix); bins[bucket].push(baked); geometry.dispose();
  }
  const red = new THREE.MeshStandardMaterial({color:0xd94236, roughness:.38, metalness:.2});
  const rubber = new THREE.MeshStandardMaterial({color:0x142b35, roughness:.6, metalness:.12});
  const alloy = new THREE.MeshStandardMaterial({color:0xb7d6db, roughness:.32, metalness:.65});
  // Forward is local -Z. A rounded battery nose and a shrouded aft propeller.
  part(new THREE.CylinderGeometry(.13,.15,.44,20),0,[0,0,-.08],[1,1,1],[Math.PI/2,0,0]);
  part(new THREE.SphereGeometry(.13,20,12),0,[0,0,-.30],[1,1,.65]);
  part(new THREE.TorusGeometry(.166,.027,8,24),1,[0,0,.20],[1,1,1]);
  part(new THREE.TorusGeometry(.134,.012,6,20),2,[0,0,-.245],[1,1,1]);
  part(new THREE.CylinderGeometry(.042,.042,.075,12),1,[0,0,.18],[1,1,1],[Math.PI/2,0,0]);
  for (const side of [-1,1]) {
    part(new THREE.BoxGeometry(.13,.032,.034),2,[side*.16,.055,.075],[1,1,1]);
    part(new THREE.CylinderGeometry(.027,.027,.13,10),1,[side*.222,.055,.075],[1,1,1],[Math.PI/2,0,0]);
    part(new THREE.BoxGeometry(.016,.15,.025),1,[side*.105,0,.20],[1,1,1],[0,0,side*Math.PI/4]);
  }
  part(new THREE.BoxGeometry(.054,.012,.085),1,[0,.135,-.09],[1,1,1]);
  part(new THREE.BoxGeometry(.034,.005,.023),2,[0,.143,-.10],[1,1,1]);
  [red,rubber,alloy].forEach((material,i)=>{
    const geometry=mergeGeometries(bins[i]); const mesh=new THREE.Mesh(geometry,material); root.add(mesh); bins[i].forEach(g=>g.dispose());
  });
  const blades=[];
  for(let i=0;i<3;i++){
    const g=new THREE.BoxGeometry(.11,.035,.014).toNonIndexed();
    g.translate(.071,0,0);g.rotateZ(i*Math.PI*2/3); blades.push(g);
  }
  const propeller=new THREE.Mesh(mergeGeometries(blades),rubber); blades.forEach(g=>g.dispose()); propeller.position.z=.21; root.add(propeller);
  let progress=0, attachedFirst=true, clock=0;
  const diagnostics={visible:false,progress:0,firstPerson:true,meshCount:4,triangles:0,finiteTransforms:true};
  root.traverse(o=>{if(o.isMesh)diagnostics.triangles+=o.geometry.attributes.position.count/3;});
  function update(dt,{active=0,allowed=false,firstPerson=true,reducedMotion=false,wristOpen=false}={}) {
    dt=Math.min(Math.max(dt,0),.1);clock+=dt;
    const target=allowed?THREE.MathUtils.clamp(active,0,1):0;
    progress=reducedMotion?target:THREE.MathUtils.lerp(progress,target,1-Math.exp(-dt*(target>progress?8:12)));
    if(firstPerson!==attachedFirst){(firstPerson?camera:diver).add(root);attachedFirst=firstPerson;}
    root.visible=allowed&&progress>.015;
    if(firstPerson){
      const halfHeight=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*.88;
      root.scale.setScalar(Math.min(.9,halfHeight*camera.aspect/.34));
      root.position.set(0,-halfHeight*(.74+.8*(1-progress)+(wristOpen?.35:0)),-.88);
      root.rotation.set(-.08,0,0);
      if(!reducedMotion)root.position.y+=Math.sin(clock*2)*.003*progress;
    } else {
      // The swimmer's arms bend forward to local +Z, while swimming forward
      // follows local +Y after the body's trim rotation. Put the grips between
      // those hands rather than underneath the hips.
      root.scale.setScalar(.95);root.position.set(0,-.32,.52);root.rotation.set(Math.PI/2,0,0);
    }
    if(!reducedMotion&&root.visible)propeller.rotation.z=(propeller.rotation.z+dt*progress*14)%(Math.PI*2);
    diagnostics.visible=root.visible;diagnostics.progress=progress;diagnostics.firstPerson=firstPerson;
    diagnostics.finiteTransforms=Number.isFinite(root.position.x+root.position.y+root.position.z+root.scale.x+root.rotation.x);
  }
  function destroy(){root.removeFromParent();root.traverse(o=>{if(o.isMesh)o.geometry.dispose();});red.dispose();rubber.dispose();alloy.dispose();}
  return {root,update,diagnostics,destroy};
}
