// How the ocean ran for this visitor, once per visit, through the same analytics switch as everything else (analytics.js):
// that it came up (world_ready) or did not (world_failed), how smoothly it drew when the page was left (world_health),
// and which script threw, if one did (script_error). Tests run in software rendering only; this is the one view of real
// phones and laptops. Nothing here changes the page, and nothing is sent with analytics off.
import {track} from './analytics.js';
import {readyReport, failedReport, healthReport, errorFile} from './health-summary.js';

const sent = new Set(), body = document.body;
let dived = body.dataset.submerged === 'true', scriptErrors = 0;
const once = (event, properties) => { if (!properties || sent.has(event)) return; sent.add(event); track(event, properties); };
const diagnostics = () => window.oceanDiagnostics;

function look() {
  if (body.dataset.submerged === 'true') dived = true;
  if (body.dataset.fallback === 'true') once('world_failed', failedReport(diagnostics(), innerWidth));
  else if (body.dataset.ready === 'true') once('world_ready', readyReport(diagnostics(), innerWidth));
}
new MutationObserver(look).observe(body, { attributes: true, attributeFilter: ['data-ready', 'data-fallback', 'data-submerged'] });
look();
// A lost context does not bubble; the capture phase still passes through the document.
document.addEventListener('webglcontextlost', () => once('world_failed', failedReport({ ...diagnostics(), error: 'WebGL context lost' }, innerWidth)), true);

function noteError(filename, line) {
  if (++scriptErrors > 3) return;   // the first few say where; a loop of them says nothing more
  track('script_error', { file: errorFile(filename), line: Number.isFinite(line) ? line : 0 });
}
addEventListener('error', event => { if (event.filename || event.error) noteError(event.filename, event.lineno); });
addEventListener('unhandledrejection', () => noteError('promise', 0));

// Leaving is the last moment the frame record is complete; on a phone that is the page being hidden, not unloaded.
const leave = () => once('world_health', healthReport(diagnostics(), window.oceanExperienceMetrics?.snapshot(), innerWidth, { dived, scriptErrors }));
document.addEventListener('visibilitychange', () => { if (document.hidden) leave(); });
addEventListener('pagehide', leave);
