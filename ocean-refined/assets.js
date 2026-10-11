import * as THREE from './vendor/three.module.min.js';

// All assets are generated locally: no model downloads, textures or HDR maps.
export function seededRandom(seed = 821) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function createClouds() {
  // One small locally painted atlas, reused by every cloud. The alpha silhouette
  // and lit upper surface read as cumulus; fine cirrus remains in the sky shader.
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d');
  ctx.filter='blur(2px)';ctx.fillStyle='white';
  const puffs=[[80,169,40],[121,143,54],[170,151,62],[216,113,78],[273,104,62],[329,142,69],[386,154,49],[435,170,28]];
  for(const [x,y,r] of puffs){ctx.beginPath();ctx.ellipse(x,y,r,r*.83,0,0,Math.PI*2);ctx.fill();}
  ctx.filter='none';ctx.globalCompositeOperation='source-in';
  const gradient=ctx.createLinearGradient(0,35,0,220);gradient.addColorStop(0,'#fffaf0');gradient.addColorStop(.48,'#f7f5ef');gradient.addColorStop(.8,'#c9d9df');gradient.addColorStop(1,'#a0bac8');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,512,256);
  ctx.globalCompositeOperation='source-atop';
  for(const [x,y,r] of puffs){
    const light=ctx.createRadialGradient(x-r*.20,y-r*.32,0,x,y,r);
    light.addColorStop(0,'#ffffff95');light.addColorStop(.5,'#ffffff19');light.addColorStop(1,'#ffffff00');
    ctx.fillStyle=light;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=true;
  const material=new THREE.SpriteMaterial({map:texture,color:'#ffffff',transparent:true,opacity:.9,depthWrite:false,fog:false,toneMapped:false});
  const group=new THREE.Group();group.name='Soft cumulus formations';
  const layout=[[-175,52,-340,65],[-70,58,-360,42],[60,35,-250,90],[128,48,-300,120],[194,30,-320,65]];
  for(const [x,y,z,width] of layout){const cloud=new THREE.Sprite(material);cloud.position.set(x,y,z);cloud.scale.set(width,width*.5,1);group.add(cloud);}
  return {group,material,texture};
}


