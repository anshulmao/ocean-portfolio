import {toDisplayDepth,DISPLAY_MAX_DEPTH} from './depth-metrics.js';

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
  // The scrubber lives in the settings menu. The scene calls update() at HUD rate, but while the menu is closed
  // nothing is written, and while it is open only what changed is: the clock moves once a simulated minute.
  const menu=document.querySelector('#settings-menu'),reading=document.querySelector('#time-reading');
  let latest=null,shownMinutes=-1,shownValue='',shownKind='';
  function update(state){
    latest=state;
    if(menu?.hidden)return;
    const time=(state.date instanceof Date?state.date.getTime():Date.parse(state.simulatedUTC))+8*3600000;
    const minutes=Math.floor((time%day+day)%day/60000),kind=state.sunAltitude< -6?'moon':'sun';
    if(kind!==shownKind){shownKind=kind;icon.dataset.kind=kind;}
    if(!scrubbing&&range.value!==String(minutes))range.value=minutes;
    if(minutes!==shownMinutes){
      shownMinutes=minutes;
      const clock=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
      range.setAttribute('aria-valuetext',`${clock} Kuala Lumpur time`);
      icon.style.setProperty('--rise',`${-Math.max(0,Math.sin((minutes-360)/1440*tau))*8}px`);
      reading.textContent=clock;
    }
    // While the thumb is held the orb follows it, not the clock.
    if(range.value!==shownValue){shownValue=range.value;icon.style.left=`${Number(shownValue)/1440*100}%`;}
  }
  if(menu)new MutationObserver(()=>{if(!menu.hidden&&latest)update(latest);}).observe(menu,{attributes:true,attributeFilter:['hidden']});
  return {update,isScrubbing:()=>scrubbing};
}

export const REEF_CHART=Object.freeze({size:400,span:240,centreZ:-35,minX:-62,maxX:62,minZ:-105,maxZ:35});
// Chart north is left (-X), east is up (-Z). Only depth is calibrated: X/Z
// metres, distances, marker positions and the 50 m scope radius stay unchanged.
export function reefChartUV(x,z){return {u:(x+REEF_CHART.span/2)/REEF_CHART.span,v:(z-REEF_CHART.centreZ+REEF_CHART.span/2)/REEF_CHART.span};}
export function reefMarkerUV(x,z){return {u:(x-REEF_CHART.minX)/(REEF_CHART.maxX-REEF_CHART.minX),v:(z-REEF_CHART.minZ)/(REEF_CHART.maxZ-REEF_CHART.minZ)};}

// A hologram chart: actual relief, depth bands and a lit contour every 5 display metres. The canvas covers
// a 240 m square, 50 m wider than the reef's bounds on every side (hud.css places it over #map-chart), so the
// round minimap, which shows 50 m around the diver, is filled to its rim wherever the diver is and however it
// is turned; water outside the explorable bounds is drawn fainter. Drawn once: the minimap only moves the canvas.
export function drawReefChart(terrainHeightAt) {
  const canvas=document.querySelector('#reef-bathymetry');if(!canvas)return;
  const {size,span,centreZ,minX,maxX,minZ,maxZ}=REEF_CHART,half=span/2;canvas.width=canvas.height=size;
  const context=canvas.getContext('2d'),image=context.createImageData(size,size);
  const depths=new Float32Array(size*size),worldX=x=>(x+.5)/size*span-half,worldZ=y=>(y+.5)/size*span-half+centreZ;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const raw=-terrainHeightAt(worldX(x),worldZ(y));depths[y*size+x]=toDisplayDepth(Number.isFinite(raw)?raw:60);}
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x,d=depths[i],band=Math.min(7,Math.floor(d/5)),t=band/7;
    const contour=x>0&&y>0&&(Math.floor(d/5)!==Math.floor(depths[i-1]/5)||Math.floor(d/5)!==Math.floor(depths[i-size]/5));
    const inside=worldX(x)>=minX&&worldX(x)<=maxX&&worldZ(y)>=minZ&&worldZ(y)<=maxZ;
    // A subtle slope shade reveals gullies and terraces without inventing
    // terrain. It samples the same field already used for the depth bands.
    const dx=depths[y*size+Math.min(size-1,x+1)]-depths[y*size+Math.max(0,x-1)],dz=depths[Math.min(size-1,y+1)*size+x]-depths[Math.max(0,y-1)*size+x];
    const relief=Math.max(.72,Math.min(1.18,1+(dx-dz)*.22)),alpha=(contour?.90:.62-.30*t)*(inside?1:.24);
    image.data.set(contour?[220,252,255,alpha*255]:[(152-85*t)*relief,(229-68*t)*relief,(239-48*t)*relief,alpha*255],i*4);
  }
  const corner=reefChartUV(minX,minZ),width=(maxX-minX)/span*size,height=(maxZ-minZ)/span*size;
  const x0=Math.floor(corner.u*size),y0=Math.floor(corner.v*size),x1=Math.floor(corner.u*size+width),y1=Math.floor(corner.v*size+height);
  // The boundary is part of the same raster export as the terrain. Prepared
  // charts capture putImageData, so drawing afterward would lose the outline.
  const edge=(x,y,distance)=>{if(distance%7<4)image.data.set([224,252,255,209],(y*size+x)*4);};
  for(let x=x0;x<=x1;x++){edge(x,y0,x-x0);edge(x,y1,x-x0);}
  for(let y=y0;y<=y1;y++){edge(x0,y,y-y0);edge(x1,y,y-y0);}
  context.putImageData(image,0,0);
  canvas.dataset.source='scene-terrain';
  canvas.dataset.depthMax=String(DISPLAY_MAX_DEPTH);canvas.dataset.contourInterval='5';canvas.dataset.worldBounds=`${minX},${minZ},${maxX},${maxZ}`;
  canvas.setAttribute('aria-label',`Reef terrain chart, 0 to ${DISPLAY_MAX_DEPTH} metres with 5 metre depth contours. Exploration boundary is dashed. North is left; east is up.`);
}
