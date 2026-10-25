// Planned once per trip. Every sampled segment, including rounded corners, must
// clear the same collision envelope as the diver. No unchecked camera rails.
export const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export function smoothRoute(points,{clear=()=>true,floor=()=>-Infinity,clearance=1.5,spacing=1}={}) {
  const anchors=points.filter((p,i)=>!i||distance(p,points[i-1])>.001).map(p=>[...p]);
  if(anchors.length<2)return anchors;
  const result=[anchors[0]];
  for(let i=0;i<anchors.length-1;i++){
    const a=anchors[i],b=anchors[i+1],before=anchors[i-1]||a,after=anchors[i+2]||b;
    const count=Math.max(2,Math.ceil(distance(a,b)/spacing));
    let accepted=null;
    for(const tension of [.5,.25,.1,0]){
      const segment=[];let last=a,valid=true;
      for(let n=1;n<=count;n++){
        const t=n/count,t2=t*t,t3=t2*t;
        const p=a.map((v,k)=>(2*t3-3*t2+1)*v+(t3-2*t2+t)*(b[k]-before[k])*tension+(-2*t3+3*t2)*b[k]+(t3-t2)*(after[k]-a[k])*tension);
        if(p[1]<floor(p[0],p[2])+clearance||!clear(last,p)){valid=false;break;}
        segment.push(p);last=p;
      }
      if(valid){accepted=segment;break;}
    }
    if(!accepted)return [];
    result.push(...accepted);
  }
  return result;
}

// Look ahead by distance, never by elapsed time: a slow frame cannot jump the
// diver forward, and a shortcut around a corner must still clear the reef.
export function routeTarget(route,index,position,lookAhead,clear){
  while(index<route.length-1&&distance(position,route[index])<lookAhead&&clear(position,route[index+1]))index++;
  return index;
}
