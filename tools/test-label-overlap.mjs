import assert from 'node:assert/strict';
import test from 'node:test';
import {labelOverlaps} from '../ocean-refined/label-overlap.js';

const control = {left: 65, top: 250, right: 220, bottom: 294};
test('a tall label above its anchor cannot cover the clear-screen control', () => {
  assert.equal(labelOverlaps(200, 350, 150, 100, control), true);
  assert.equal(labelOverlaps(200, 350, 150, 44, control), false,
    'the previous 44 px estimate missed this visible overlap');
});
test('wide text uses its actual horizontal extent', () => {
  assert.equal(labelOverlaps(300, 280, 200, 50, control), true);
  assert.equal(labelOverlaps(300, 280, 150, 50, control), false);
});
test('a clear label remains available instead of hiding all world labels', () => {
  for (const [x,y] of [[400,280],[150,240],[150,410]]) {
    assert.equal(labelOverlaps(x,y,150,100,control), false);
  }
});
test('a label touching the boundary without covering it is clear', () => {
  assert.equal(labelOverlaps(295,280,150,100,control), false);
  assert.equal(labelOverlaps(150,394,150,100,control), false);
});
