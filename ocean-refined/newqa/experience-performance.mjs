import assert from 'node:assert/strict';
import {createExperienceMetrics} from '../experience-performance.js';
let time=10;
const entries=new Map();
class Observer {
  static supportedEntryTypes=['longtask','event','largest-contentful-paint','layout-shift'];
  constructor(callback){this.callback=callback;}
  observe({type}){entries.set(type,this);}
  disconnect(){this.closed=true;}
}
const metrics=createExperienceMetrics({clock:()=>time,observer:Observer});
metrics.mark('surface');time=20;metrics.mark('surface');
for(let i=0;i<100;i++)metrics.frame(i<95?16.7:80);
for(const invalid of [0,-1,NaN,Infinity])metrics.frame(invalid);
const send=(type,list)=>entries.get(type).callback({getEntries:()=>list});
send('longtask',[{duration:80},{duration:120}]);
send('event',[{interactionId:1,duration:48},{interactionId:0,duration:800}]);
send('layout-shift',[{startTime:100,value:.01},{startTime:500,value:.02},{startTime:2000,value:.04},{startTime:2100,value:1,hadRecentInput:true}]);
const report=metrics.snapshot();
assert.equal(report.stages.surface,10);
assert.equal(report.activeFrames.count,100);assert.equal(report.activeFrames.p95Ms,17);assert.equal(report.activeFrames.over50,5);
assert.equal(report.browser.longTaskMs,200);assert.equal(report.browser.longestTaskMs,120);
assert.equal(report.browser.maxObservedInteractionMs,48);assert.equal(report.browser.cls,.04);
report.stages.surface=999;assert.equal(metrics.snapshot().stages.surface,10);
metrics.disconnect();assert.ok([...entries.values()].every(handle=>handle.closed));
assert.doesNotThrow(()=>createExperienceMetrics({observer:null}).snapshot());
console.log('Experience metrics: bounded frame distribution, one-time stages, browser aggregates, and unsupported-observer fallback passed.');
