import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the real HUD listener with the capture and overlay states it sees.
const source = fs.readFileSync(new URL('../ocean-refined/hud.js', import.meta.url), 'utf8');
const start = source.indexOf("document.addEventListener('keydown', event => {");
const end = source.indexOf("document.addEventListener('pointerdown'", start);
function setup() {
  const menu = {hidden: true}, nav = {exploring: false};
  const movement = {open: false};
  const overlays = new Set();
  let handler;
  const document = {pointerLockElement: null, body: {dataset: {}},
    querySelector: selector => overlays.has(selector),
    addEventListener: (_, callback) => {handler = callback;}};
  vm.runInNewContext(source.slice(start, end), {document, menu,
    window: {oceanControls: {nav}}, setMenu: open => {menu.hidden = !open;},
    $: selector => selector === '#movement-panel' ? movement : {focus() {}}});
  function press(extra = {}) {
    const event = {key: 'Escape', target: {closest: () => false},
      preventDefault() {this.defaultPrevented = true;},
      stopImmediatePropagation() {this.stopped = true;}, ...extra};
    handler(event); return event;
  }
  return {menu, nav, document, overlays, movement, press};
}
const s = setup();
s.nav.exploring = true; s.document.pointerLockElement = {};
assert.ok(!s.press().stopped && s.menu.hidden, 'first Escape belongs to mouse release');
s.document.pointerLockElement = null;
assert.ok(!s.press().stopped && s.menu.hidden, 'drag look also releases before opening');
s.nav.exploring = false;
assert.ok(s.press().stopped && !s.menu.hidden, 'next Escape opens Settings');
s.press({repeat: true}); assert.equal(s.menu.hidden, false, 'holding Escape cannot close it');
s.movement.open = true; s.press();
assert.ok(!s.movement.open && !s.menu.hidden, 'nested controls close first');
s.press(); assert.ok(s.menu.hidden, 'next Escape closes Settings');
for (const guard of [
  s => {s.overlays.add('dialog[open]');},
  s => {s.nav.returnPhase = 'offer';},
  s => {s.nav.returnPhase = 'stop';},
  s => {s.document.body.dataset.clearUi = 'true';},
]) {
  const s = setup(); guard(s);
  assert.ok(!s.press().stopped && s.menu.hidden, 'existing Escape action keeps priority');
}
for (const event of [{repeat:true}, {defaultPrevented:true}, {ctrlKey:true},
  {target:{closest:()=>true}}, {key:'Tab'}]) {
  const s = setup(); s.press(event); assert.ok(s.menu.hidden);
}
console.log('Settings Escape transitions and overlay priority passed.');
