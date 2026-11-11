// What the ocean reports about how it ran (ocean-refined/health-summary.js): coarse values only, and every one of them
// passes the analytics allow-list unchanged, so nothing is silently dropped or sent that should not be.
import test from 'node:test';
import assert from 'node:assert/strict';
import {gpuFamily, viewportClass, failureReason, errorFile, readyReport, failedReport, healthReport} from '../ocean-refined/health-summary.js';
import {eventProperties} from '../ocean-refined/analytics-privacy.js';

const diagnostics = {quality: 'economy', gpuTier: 'integrated', gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', readyAt: 1812.4, error: null};
const snapshot = {activeFrames: {count: 600, meanMs: 17.2, p95Ms: '250+', worstMs: 300, over50: 12}, browser: {longTasks: 3}};

test('graphics adapters are reduced to a family', () => {
  assert.equal(gpuFamily(diagnostics.gpu), 'apple');
  assert.equal(gpuFamily('Adreno (TM) 740'), 'adreno');
  assert.equal(gpuFamily('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)'), 'software');
  assert.equal(gpuFamily('Some New Chip'), 'other');
  assert.equal(gpuFamily(null), 'unknown');
});
test('width class, failure reason and error file are slugs', () => {
  assert.deepEqual([390, 820, 1440].map(viewportClass), ['phone', 'tablet', 'desktop']);
  assert.equal(failureReason('WebGL context lost'), 'context_lost');
  assert.equal(failureReason('Error creating WebGL context.'), 'no_webgl');
  assert.equal(failureReason('x is not a function'), 'error');
  assert.equal(errorFile('https://example.com/world.js?v=2#x'), 'world-js');
  assert.equal(errorFile(''), 'unknown');
});
test('a health report waits for enough frames', () => {
  assert.equal(healthReport(diagnostics, {activeFrames: {count: 40}}, 390), null);
  assert.equal(healthReport(diagnostics, null, 390), null);
});
test('every reported value passes the analytics allow-list', () => {
  const reports = {
    world_ready: readyReport(diagnostics, 390),
    world_failed: failedReport({...diagnostics, error: 'WebGL context lost'}, 1440),
    world_health: healthReport(diagnostics, snapshot, 390, {dived: true, scriptErrors: 1}),
    script_error: {file: errorFile('/reef.js'), line: 12},
  };
  for (const [event, report] of Object.entries(reports)) assert.deepEqual(eventProperties(event, report), report, event);
  assert.deepEqual(reports.world_health, {quality: 'economy', gpu_tier: 'integrated', gpu_family: 'apple', viewport: 'phone', frames: 600,
    frame_mean_ms: 17.2, frame_p95_ms: 250, slow_frame_pct: 2, long_tasks: 3, dived: 'yes', script_errors: 1});
  assert.equal(reports.world_ready.ready_ms, 1812);
  assert.equal(reports.world_failed.reason, 'context_lost');
  // The adapter's full name never leaves the page.
  assert.ok(!JSON.stringify(reports).includes('M2'));
});
