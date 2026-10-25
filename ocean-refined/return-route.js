import {smoothRoute,distance as length} from './cinematic-route.js';
// World coordinates; -5.5 world metres reads 3.7 m on the dive instrument.
export function planSurfaceReturn(start, {floor, clear, exits = []}) {
  const crest = [0, -5.5, -6];
  // A rising bow reaches the upper reef in one sweep instead of completing a
  // vertical climb before starting the horizontal swim. Try open water first;
  // cave/arch exits are only mandatory when that sweep actually intersects them.
  const bow=from=>{
    const span=length(from,crest),count=Math.max(12,Math.ceil(span));
    for(const lift of [.65,.85,1]){
      const control=[from[0]*.55,from[1]+(crest[1]-from[1])*lift,from[2]+(crest[2]-from[2])*.45];
      const points=[];let last=from,valid=true;
      for(let i=1;i<=count;i++){
        const t=i/count,u=1-t,p=from.map((v,k)=>u*u*v+2*u*t*control[k]+t*t*crest[k]);
        if(p[1]<floor(p[0],p[2])+1.5||!clear(last,p)){valid=false;break;}
        points.push(p);last=p;
      }
      if(valid)return points;
    }
    return null;
  };
  const direct=bow(start);if(direct)return direct;
  const route = exits.map(p => p.isVector3 ? p.toArray() : [...p]);
  let previous=start;
  if(!route.every(point=>{const ok=clear(previous,point);previous=point;return ok;}))route.length=0;
  let last = route.at(-1) || start;
  const exited=bow(last);
  if(exited){const rounded=smoothRoute([start,...route,...exited],{clear,floor});if(rounded.length)return rounded.slice(1);}
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
  const finish=points=>smoothRoute([start,...route,...points],{clear,floor}).slice(1);
  if (open(slope)) {const rounded=finish(slope);if(rounded.length)return rounded;}
  // A bounded visibility search finds an exit around cave walls and coral.
  // It runs only on an explicit return, never on the animation loop.
  const span=3, root={point:last,cost:0,score:0,parent:null,key:'0,0,0',grid:[0,0,0]};
  const queue=[root], visited=new Map([[root.key,0]]);
  const directions=[];
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)directions.push([x,y,z]);
  for(let expanded=0;queue.length&&expanded<1600;expanded++){
    let best=0;for(let i=1;i<queue.length;i++)if(queue[i].score<queue[best].score)best=i;
    const current=queue.splice(best,1)[0];
    if(clear(current.point,crest)){
      const found=[crest];let at=current;while(at.parent){found.unshift(at.point);at=at.parent;}
      const rounded=finish(found);if(rounded.length)return rounded;
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
  // An exit without a complete route home is not a successful plan.
  return [];
}
