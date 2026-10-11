import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {createReef,terrainHeightAt} from '../reef.js';
import {createUnderwaterLife} from '../underwater-life.js';
const sites=[[-35,-30,3.5],[36,-48,5],[-33,-73,5.5],[39,-91,4],[7,18,3]];
for(const economy of [false,true]){
 const reef=createReef({economy});assert.equal(reef.userData.grottoCount,5);
 for(const [x,z,length] of sites){const y=terrainHeightAt(x,z)+1.8;assert.ok(reef.userData.collisions.segmentClear(new T.Vector3(x,y,z-length-1),new T.Vector3(x,y,z+length+1),.45),`Blocked cave ${x},${z}`);assert.equal(reef.userData.safeAscentRoute(new T.Vector3(x,y,z)).length,2);}
 const arches=reef.getObjectByName('Limestone grotto arches');assert.ok(arches.isInstancedMesh);assert.equal(arches.count,15);
 const life=createUnderwaterLife({economy,terrainHeightAt});for(let i=0;i<100;i++)life.update(.1,i*2);
 life.root.traverse(node=>{if(node.isInstancedMesh)for(const value of node.instanceMatrix.array)assert.ok(Number.isFinite(value));});
 console.log(JSON.stringify({economy,clearCaves:5,batchedRibs:arches.count,...life.counts}));
}
