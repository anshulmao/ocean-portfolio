// World coordinates; depth readings are calibrated separately. Planned once per return.
export function planSurfaceReturn(start, {floor, clear, exits = []}) {
  const route = exits.map(p => p.isVector3 ? p.toArray() : [...p]);
  let previous=start;
  if(!route.every(point=>{const ok=clear(previous,point);previous=point;return ok;}))route.length=0;
  let last = route.at(-1) || start;
  const crest = [0, -5.5, -6];
  const distance = Math.hypot(crest[0]-last[0], crest[2]-last[2]);
  const count = Math.max(1, Math.ceil(distance/5)), slope = [];
  let height = last[1];
  for (let i=1;i<=count;i++) {
    const t=i/count, x=last[0]*(1-t), z=last[2]+(crest[2]-last[2])*t;
    height=Math.max(height,last[1]+(crest[1]-last[1])*t,floor(x,z)+3.2);
    slope.push([x,Math.min(-1.8,height),z]);
  }
  const open = points => {
    let from=last;
    for (const point of points) { if (!clear(from,point)) return false; from=point; }
    return true;
  };
  if (open(slope)) return [...route,...slope];
  // If a cliff interrupts the contour, rise in open water before crossing its crest.
  const over = [[last[0],-4,last[2]],crest];
  if (open(over)) return [...route,...over];
  // A bounded visibility search finds an exit around cave walls and coral.
  // It runs only on an explicit return, never on the animation loop.
  const span=3, root={point:last,cost:0,score:0,parent:null,key:'0,0,0',grid:[0,0,0]};
  const queue=[root], visited=new Map([[root.key,0]]);
  const length=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  const directions=[];
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)directions.push([x,y,z]);
  for(let expanded=0;queue.length&&expanded<1600;expanded++){
    let best=0;for(let i=1;i<queue.length;i++)if(queue[i].score<queue[best].score)best=i;
    const current=queue.splice(best,1)[0];
    if(clear(current.point,crest)){
      const found=[crest];let at=current;while(at.parent){found.unshift(at.point);at=at.parent;}
      return [...route,...found];
    }
    for(const direction of directions){
      const grid=current.grid.map((v,i)=>v+direction[i]),key=grid.join(',');
      const point=grid.map((v,i)=>last[i]+v*span);
      if(Math.abs(point[0])>61||point[2]<-104||point[2]>34||point[1]<-59||point[1]>-1.8||point[1]<floor(point[0],point[2])+1.5)continue;
      const cost=current.cost+length(current.point,point);
      if(cost>=(visited.get(key)??Infinity)||!clear(current.point,point))continue;
      visited.set(key,cost);queue.push({point,grid,key,cost,score:cost+length(point,crest)*1.15,parent:current});
    }
  }
  return route;
}
