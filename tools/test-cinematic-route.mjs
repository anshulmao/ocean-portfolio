import assert from 'node:assert/strict';
import {smoothRoute,routeTarget,distance} from '../ocean-refined/cinematic-route.js';
const wall=(a,b)=>{
 for(let i=0;i<=20;i++){
  const t=i/20,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;
  if(x>4&&x<6&&z<2)return false;
 }
 return true;
};
const route=smoothRoute([[0,-10,0],[3,-8,4],[7,-6,4],[10,-5,0]],{clear:wall,floor:()=>-15});
assert.ok(route.length>15);
assert.deepEqual(route[0],[0,-10,0]);assert.deepEqual(route.at(-1),[10,-5,0]);
for(let i=1;i<route.length;i++){assert.ok(wall(route[i-1],route[i]));assert.ok(distance(route[i-1],route[i])<2);}
assert.deepEqual(smoothRoute([[0,-10,0],[10,-5,0]],{clear:wall}),[],'An obstructed chord cannot become a cinematic rail');
const start=[0,-10,0],blockedNext=[[.1,-10,0],[5,-10,0],[10,-10,0]];
assert.equal(routeTarget(blockedNext,0,start,4,wall),0,'Look-ahead does not cut through a wall');
assert.ok(routeTarget(route,0,start,4,wall)>0,'Open route advances through small samples without stopping');
console.log('PASS: smooth route endpoints, collision envelope, bounded samples, and checked look-ahead.');
