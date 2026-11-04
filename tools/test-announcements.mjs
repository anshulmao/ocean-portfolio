// Real queue and real wall clock decisions; only the DOM and ticker are adapters.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';

let tick, clock = 0;
globalThis.__announcementTick = fn => { tick = fn; };
globalThis.__announcementUI = {dialog: false};
const ticker = 'data:text/javascript,' + encodeURIComponent('export const onTick=globalThis.__announcementTick; export const ui=globalThis.__announcementUI;');
registerHooks({resolve(specifier, context, next) {
  if (specifier === './ui-ticker.js' && context.parentURL?.includes('/announce.js')) return {url: ticker, shortCircuit: true};
  return next(specifier, context);
}});
const nodes = [];
globalThis.document = {body: {dataset: {}, append: node => nodes.push(node)}, createElement() {
  const parts = Array.from({length: 3}, () => ({textContent: ''}));
  return {dataset: {}, style: {setProperty() {}}, setAttribute() {}, querySelectorAll: () => parts};
}};
Object.defineProperty(globalThis, 'performance', {configurable: true, value: {now: () => clock * 1000}});
const {announce, clearAnnouncements, announcing} = await import('../ocean-refined/announce.js');
const advance = seconds => { clock += seconds; tick(); };
const showing = () => nodes.filter(node => node.dataset.show === 'true');

test('labels stay suppressed throughout the outgoing announcement fade', () => {
  announce({title: 'Found the treasure'});
  assert.equal(announcing(), true);
  assert.equal(document.body.dataset.announce, 'on');
  advance(2.6);
  assert.equal(announcing(), false);
  assert.equal(showing().length, 0);
  // journey.css fades out for 300 ms. Labels must not reappear on top of it.
  assert.equal(document.body.dataset.announce, 'on', 'fading toast still occupies the announce zone');
  advance(.3);
  assert.equal(document.body.dataset.announce, 'on');
  advance(.2);
  assert.equal(document.body.dataset.announce, undefined);
});

test('blocked messages wait, keyed messages replace pending items, stale messages expire', () => {
  clearAnnouncements();
  globalThis.__announcementUI.dialog = true;
  announce({title: 'Old chapter', key: 'zone'});
  announce({title: 'New chapter', key: 'zone'});
  assert.equal(showing().length, 0);
  globalThis.__announcementUI.dialog = false;
  advance(.5);
  assert.equal(showing().length, 1);
  assert.equal(showing()[0].querySelectorAll()[1].textContent, 'New chapter');
  clearAnnouncements();
  globalThis.__announcementUI.dialog = true;
  announce({title: 'No longer news', stale: 1});
  advance(2);
  globalThis.__announcementUI.dialog = false;
  advance(.5);
  assert.equal(showing().length, 0);
});

test('opening a sheet hides the active message and clear discards queued messages', () => {
  announce({title: 'Visible'});
  announce({title: 'Waiting'});
  document.body.dataset.sheet = 'expanded';
  advance(.1);
  assert.equal(showing().length, 0);
  clearAnnouncements();
  delete document.body.dataset.sheet;
  advance(1);
  assert.equal(showing().length, 0);
  document.body.dataset.clearUi = 'true';
  announce({title: 'Ignored in clear UI'});
  delete document.body.dataset.clearUi;
  advance(1);
  assert.equal(showing().length, 0);
});
