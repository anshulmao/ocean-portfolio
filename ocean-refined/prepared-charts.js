// Prepared raster charts are exact exports of the terrain renderer, not a
// substitute map. Any changed terrain or drawing source restores live drawing.
const images=new Map();
export const preparedChartsReady=(async()=>{
  try{
    const base=new URL('./assets/prepared/charts/',import.meta.url);
    const response=await fetch(new URL('manifest.json',base));if(!response.ok)return false;
    const manifest=await response.json();
    const valid=await Promise.all(Object.entries(manifest.sources).map(async([file,expected])=>{
      const response=await fetch(new URL(file,import.meta.url));if(!response.ok)return false;
      const digest=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());
      return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')===expected;
    }));
    if(valid.some(v=>!v))return false;
    await Promise.all(Object.entries(manifest.charts).map(async([kind,entry])=>{
      const response=await fetch(new URL(entry.file,base));if(!response.ok)throw new Error('Chart unavailable');
      const data=new Uint8ClampedArray(await response.arrayBuffer());
      images.set(kind,new ImageData(data,entry.width,entry.height));
    }));return true;
  }catch{return false;}
})();
export function drawPreparedChart(kind,canvas){
  const image=images.get(kind);if(!image||!canvas)return false;
  canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').putImageData(image,0,0);
  canvas.dataset.source='prepared-scene-terrain';canvas.dataset.depthScale='0-40';canvas.dataset.depthMax='40';canvas.dataset.contourInterval='5';if(kind==='hud')canvas.dataset.worldBounds='-62,-105,62,35';canvas.setAttribute('aria-label','Reef terrain depth chart, 0 to 40 metres, with 5 metre contours');return true;
}
