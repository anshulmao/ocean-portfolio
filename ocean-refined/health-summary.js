// What the world reports about how it ran (health-report.js), worked out from the diagnostics the page already keeps.
// Pure: no DOM, no network. Every value is a finite number or a short slug, which is all analytics-privacy.js lets through,
// and none of it identifies a device: a graphics family, not the adapter's name; a width class, not the screen size.
export function gpuFamily(name) {
  const text = String(name || '');
  for (const [family, pattern] of [['apple', /apple/i], ['adreno', /adreno/i], ['mali', /mali/i], ['powervr', /powervr/i],
    ['software', /swiftshader|llvmpipe|software/i], ['nvidia', /nvidia|geforce|rtx|gtx/i], ['amd', /amd|radeon/i], ['intel', /intel/i]])
    if (pattern.test(text)) return family;
  return text ? 'other' : 'unknown';
}
export const viewportClass = width => width < 600 ? 'phone' : width < 1024 ? 'tablet' : 'desktop';
// Why the ocean is not on screen, from the message the world recorded.
export const failureReason = message => /context lost/i.test(message || '') ? 'context_lost' : /webgl/i.test(message || '') ? 'no_webgl' : 'error';
// The script an error came from, as a slug: "world-js", never the message (which can carry anything).
export function errorFile(filename) {
  const base = String(filename || '').split(/[?#]/)[0].split('/').pop() || '';
  return base.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'unknown';
}
const device = (diagnostics, width) => ({ quality: diagnostics?.quality || 'unknown', gpu_tier: diagnostics?.gpuTier || 'unknown',
  gpu_family: gpuFamily(diagnostics?.gpu), viewport: viewportClass(width) });
export const readyReport = (diagnostics, width) => ({ ...device(diagnostics, width), ready_ms: Math.round(diagnostics?.readyAt || 0) });
export const failedReport = (diagnostics, width) => ({ ...device(diagnostics, width), reason: failureReason(diagnostics?.error) });
// Null until there are enough frames to mean anything (two seconds at 60 Hz).
export function healthReport(diagnostics, snapshot, width, { dived = false, scriptErrors = 0 } = {}) {
  const frames = snapshot?.activeFrames; if (!frames || frames.count < 120) return null;
  return { ...device(diagnostics, width), frames: frames.count, frame_mean_ms: frames.meanMs, frame_p95_ms: frames.p95Ms === '250+' ? 250 : frames.p95Ms,
    slow_frame_pct: Math.round(1000 * frames.over50 / frames.count) / 10, long_tasks: snapshot.browser?.longTasks || 0,
    dived: dived ? 'yes' : 'no', script_errors: scriptErrors };
}
