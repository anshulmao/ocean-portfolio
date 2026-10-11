// Both chart and clock are derived from the scene, not illustrative artwork.
export function createExpeditionUI({sky, getPhase, setPhase, frameSurface}) {
  const range=document.querySelector('#time-slider'), icon=document.querySelector('#time-orb');
  const reference=Date.parse(sky.referenceUTC), day=86400000, tau=Math.PI*2;
  const referenceLocal=new Date(reference+8*3600000);
  const midnight=Date.UTC(referenceLocal.getUTCFullYear(),referenceLocal.getUTCMonth(),referenceLocal.getUTCDate())-8*3600000;
  let scrubbing=false;
  function select(){const phase=(midnight+Number(range.value)*60000-reference)/day*tau;setPhase(phase);frameSurface(phase);}
  range.addEventListener('input',select);
  range.addEventListener('pointerdown',()=>scrubbing=true);
  window.addEventListener('pointerup',()=>scrubbing=false);
  range.addEventListener('blur',()=>scrubbing=false);
  function update(state){
    const date=new Date(Date.parse(state.simulatedUTC)+8*3600000),minutes=date.getUTCHours()*60+date.getUTCMinutes();
    if(!scrubbing)range.value=minutes;
    range.setAttribute('aria-valuetext',`${String(date.getUTCHours()).padStart(2,'0')}:${String(date.getUTCMinutes()).padStart(2,'0')} Kuala Lumpur time`);
    const night=state.sunAltitude< -6;
    icon.dataset.kind=night?'moon':'sun';icon.style.left=`${Number(range.value)/1440*100}%`;
    icon.style.setProperty('--rise',`${-Math.max(0,Math.sin((minutes-360)/1440*tau))*8}px`);
    document.querySelector('#time-reading').textContent=range.getAttribute('aria-valuetext').split(' Kuala')[0];
  }
  return {update,isScrubbing:()=>scrubbing};
}

export function drawReefChart(terrainHeightAt) {
  const canvas=document.querySelector('#reef-bathymetry'),size=248;canvas.width=size;canvas.height=280;
  const context=canvas.getContext('2d'),image=context.createImageData(size,280);
  const depths=new Float32Array(size*280);
  for(let y=0;y<280;y++)for(let x=0;x<size;x++)depths[y*size+x]=-terrainHeightAt(x/size*124-62,y/280*140-105);
  for(let y=0;y<280;y++)for(let x=0;x<size;x++){
    const i=y*size+x,d=depths[i],t=Math.max(0,Math.min(1,(d-12)/48));
    const contour=x>0&&y>0&&(Math.floor(d/5)!==Math.floor(depths[i-1]/5)||Math.floor(d/5)!==Math.floor(depths[i-size]/5));
    const grid=x%40===0||y%40===0;
    const colors=contour?[216,244,250]:[Math.round(164*(1-t)+23*t),Math.round(211*(1-t)+68*t),Math.round(220*(1-t)+81*t)];
    image.data.set([...colors.map(c=>grid?Math.min(255,c+18):c),255],i*4);
  }
  context.putImageData(image,0,0);
  canvas.dataset.source='scene-terrain';
}
