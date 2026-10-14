import {DEEP_VISITOR_ROUTES,WHALE_SHARK_ROUTE} from './marine-routes.js';
// Authored GLBs are already in metres. These records only move them.
export const USER_VISITOR_ROUTES=[
  {id:'right-whale',...DEEP_VISITOR_ROUTES.finWhale,clearance:4.2},
  {id:'whale-shark',...WHALE_SHARK_ROUTE,clearance:4},
  {id:'orca',...DEEP_VISITOR_ROUTES.orca},
  {id:'orca-cow',x:-13,z:-91,rx:34,rz:15,speed:1.7,depth:30,clearance:3,lift:1,phase:1.7},
  {id:'pink-whipray',x:-13,z:-62,rx:38,rz:25,speed:1,height:1.4,phase:4},
  {id:'bottlenose-dolphin',x:5,z:-39,rx:43,rz:25,speed:2.2,depth:12,clearance:4,lift:1,phase:1},
  {id:'bottlenose-dolphin',x:0,z:-53,rx:41,rz:26,speed:2,height:13,phase:3.3},
  {id:'nurse-shark',x:-9,z:-75,rx:39,rz:25,speed:.95,height:2.5,phase:5.1},
  {id:'blacktip-reef-shark',x:8,z:-56,rx:44,rz:32,speed:1.7,height:8,phase:2.8},
  {id:'blacktip-reef-shark',x:-7,z:-44,rx:40,rz:31,speed:1.5,height:7,phase:5.7}
];
export function schoolHabitat(speciesIndex,index){
  return {x:Math.sin(speciesIndex*2.399+index*2.1)*43,z:13-(speciesIndex*19+index*47)%113,
    rx:6+(speciesIndex%3)*2,rz:5+(speciesIndex%4),height:2.5+(speciesIndex%3),speed:.4+(speciesIndex%5)*.09,phase:speciesIndex*.9+index*2.4};
}
