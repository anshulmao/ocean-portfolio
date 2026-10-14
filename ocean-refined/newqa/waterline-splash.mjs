import assert from 'node:assert/strict';
import { createWaterlineCrossingGate, createWaterlineSplash } from '../waterline-splash.js';
const gate = createWaterlineCrossingGate();
for (const cameraY of [2, .01, -.1, .01, -1]) assert.equal(gate.update({cameraY}), null, 'No splash outside transitions');
assert.equal(gate.update({cameraY:2,transition:true}), null);
assert.equal(gate.update({cameraY:-.02,transition:true}), null, 'Deadband rejects jitter');
assert.equal(gate.update({cameraY:-.08,transition:true}), 'in');
assert.equal(gate.update({cameraY:1,transition:true}), null, 'At most one splash per transition');
gate.update({cameraY:-7});
assert.equal(gate.update({cameraY:-7,transition:true}), null);
assert.equal(gate.update({cameraY:.1,transition:true}), 'out');
gate.reset();
assert.equal(gate.update({cameraY:0,transition:true}), null);
assert.equal(gate.update({cameraY:-.01,transition:true}), null);
function element() {
  const classes = new Set();
  return { hidden:false,dataset:{},setAttribute(){},append(){},remove(){this.removed=true;},
    classList:{add:key=>classes.add(key),remove:key=>classes.delete(key),toggle:(key,on)=>on?classes.add(key):classes.delete(key),contains:key=>classes.has(key)} };
}
const nodes=[]; const doc={head:element(),createElement(){const e=element();nodes.push(e);return e;}};
const parent=element();parent.ownerDocument=doc;
const splash=createWaterlineSplash({parent,reducedMotion:true});
assert.equal(splash.diagnostics().active,false);
assert.equal(nodes[1].hidden,true,'No idle animation or visible overlay');
assert.equal(splash.trigger('out'),true);
assert.equal(splash.trigger('in'),false,'Repeated triggers cannot restart active splash');
assert.equal(nodes[1].classList.contains('waterline-splash--reduced'),true);
assert.equal(splash.diagnostics().count,1);
await new Promise(resolve=>setTimeout(resolve,250));
assert.equal(splash.diagnostics().active,false);
assert.equal(nodes[1].hidden,true);
splash.dispose(); assert.equal(nodes[1].removed,true);
assert.equal(splash.trigger(),false);
console.log('Waterline transition gating, idle state, reduced motion and cleanup passed.');
