import assert from 'node:assert/strict';
import test from 'node:test';
import {planSurfaceReturn} from '../ocean-refined/return-route.js';

test('a deep return reaches the safety stop above the seabed', () => {
  const start = [40, -50, -95];
  const route = planSurfaceReturn(start, {floor: () => -60, clear: () => true});
  assert.ok(route.length > 2, 'a deep return must contain a route');
  assert.deepEqual(route.at(-1), [0, -5.5, -6]);
  for (const point of route) {
    assert.ok(point.every(Number.isFinite));
    assert.ok(point[1] > -60 && point[1] < 0, 'return stays above the seabed and underwater');
  }
});

test('a blocked return does not invent a route through the obstacle', () => {
  assert.deepEqual(planSurfaceReturn([0, -20, 0], {floor: () => -10, clear: () => false}), []);
});
