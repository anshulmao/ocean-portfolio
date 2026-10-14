import * as THREE from './vendor/three.module.min.js';
import {clone} from './vendor/SkeletonUtils.js';
import {GLTFExporter} from './vendor/GLTFExporter.js';

export async function exportReef(controls){
  const snapshot=new THREE.Group();snapshot.name='Ocean reef editing snapshot';
  const layers=controls.viewer.layers();
  // Portable geometry, not the custom water/atmosphere shaders or particle systems.
  for(const source of [layers.reef,layers.corals,layers.formations,layers.models,layers.diver,...layers.creatures.slice(2)].filter(Boolean)){
    const object=clone(source);object.visible=true;
    object.traverse(n=>{if(n.isMesh){const convert=m=>m.isShaderMaterial?new THREE.MeshStandardMaterial({color:'#68969c',roughness:.8}):m.clone();n.material=Array.isArray(n.material)?n.material.map(convert):convert(n.material);}});
    snapshot.add(object);
  }
  snapshot.updateMatrixWorld(true);snapshot.userData.note='Editing snapshot. Water, sky, currents and flocking remain browser systems. Animal swim clips are in the separate creature GLBs.';
  const bytes=await new GLTFExporter().parseAsync(snapshot,{binary:true,maxTextureSize:1024});
  const url=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'})),link=document.createElement('a');link.href=url;link.download='ocean-reef-editing.glb';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  return bytes.byteLength;
}
