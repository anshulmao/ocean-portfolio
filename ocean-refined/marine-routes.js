// Shared, allocation-free route sampling for the large visitors. Their long
// passes use different centres, phases and depth lanes rather than one orbit.
export const WHALE_SHARK_ROUTE={x:5,z:-78,rx:43,rz:17,speed:1.45,depth:35,clearance:4.5,lift:1.3,phase:2.25};
export const DEEP_VISITOR_ROUTES={
  finWhale:{x:-17,z:-98,rx:37,rz:16,speed:1.65,depth:43,clearance:5,lift:1.5,phase:.8},
  orca:{x:17,z:-85,rx:37,rz:20,speed:1.85,depth:27,clearance:4,lift:1.2,phase:3.9}
};
export function sampleMarineRoute(route,time,phase,floorAt,reach,out){
  const rate=route.speed/Math.max(route.rx,route.rz),a=time*rate+phase;
  out.angle=a;out.x=route.x+route.rx*(Math.cos(a)+.045*Math.sin(2*a));
  out.z=route.z+route.rz*(Math.sin(a)+.035*Math.sin(3*a));
  out.dx=route.rx*rate*(-Math.sin(a)+.09*Math.cos(2*a));
  out.dz=route.rz*rate*(Math.cos(a)+.105*Math.cos(3*a));
  out.yaw=Math.atan2(out.dx,out.dz);
  const fx=Math.sin(out.yaw)*reach,fz=Math.cos(out.yaw)*reach;
  out.floor=Math.max(floorAt(out.x,out.z),floorAt(out.x+fx,out.z+fz),floorAt(out.x-fx,out.z-fz));
  const wave=Math.sin(a*1.35+phase)* (route.lift??.45);
  // Keep a full-body clearance where a bank rises into the visitor's lane.
  out.y=route.depth?Math.max(out.floor+route.clearance,-route.depth+wave):Math.min(-7,out.floor+route.height+wave);
  out.pitch=route.depth?Math.cos(a*1.35+phase)*(route.lift??.45)*rate*1.35/Math.max(.1,Math.hypot(out.dx,out.dz)):0;
  return out;
}
