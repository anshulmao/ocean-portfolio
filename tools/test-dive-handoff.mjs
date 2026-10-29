import { launchBrowser } from './browser.mjs';
import assert from 'node:assert/strict';

const browser = await launchBrowser();
const report = { checks: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`${process.env.OCEAN_TEST_URL || 'http://127.0.0.1:4210'}/ocean-refined/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.oceanDiagnostics?.ready && oceanDiagnostics.landmarksReady, null, { timeout: 120000 });
  await page.evaluate(() => oceanControls.warm());
  await page.waitForFunction(() => oceanControls.world.ready && oceanDiagnostics.landmarksSettled, null, { timeout: 60000 });

  // Run synchronously in fixed steps, so page rendering and event delivery cannot
  // move one measurement to a later part of the handoff than the other.
  report.response = await page.evaluate(() => {
    const dt = 1 / 60, pixels = 100, wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
    const advance = frames => { for (let i = 0; i < frames; i++) oceanControls.step(dt, dt); };
    const heading = () => { const direction = oceanControls.getCamera().getWorldDirection(oceanControls.getCamera().position.clone()); return Math.atan2(-direction.x, -direction.z); };
    const pulse = () => {
      const before = heading(), navBefore = oceanControls.nav.yaw;
      oceanInput.aim(pixels, 0);
      advance(9); // First 150 ms of the same mouse gesture.
      return { camera: Math.abs(wrap(heading() - before)), navigation: Math.abs(wrap(oceanControls.nav.yaw - navBefore)) };
    };
    // Raw aim isolates the camera's response from the optional user aim smoothing.
    oceanControls.settings.mouseSmoothing = false;
    const sensitivity = oceanControls.settings.mouseSensitivity;
    oceanControls.startDive({ capture: false });
    advance(1);
    const cinematic = { mode: oceanControls.nav.mode, transitioning: oceanDiagnostics.transition };
    let frames = 1;
    while (oceanControls.nav.mode !== 'diver' && frames < 600) { advance(1); frames++; }
    const handoff = { frames, mode: oceanControls.nav.mode, transitioning: oceanDiagnostics.transition };
    const early = pulse();
    advance(600);
    const settledTransition = oceanDiagnostics.transition;
    const settled = pulse();
    return { sensitivity, pixels, cinematic, handoff, early, settled, settledTransition };
  });
  const { sensitivity, pixels, cinematic, handoff, early, settled } = report.response;
  assert.equal(cinematic.mode, 'surface', 'the opening descent remains cinematic');
  assert.equal(cinematic.transitioning, true);
  assert.equal(handoff.mode, 'diver', 'swimming becomes available during descent');
  assert.equal(handoff.transitioning, true, 'the handoff is tested before the cinematic transition finishes');
  assert.equal(report.response.settledTransition, false);
  assert.ok(Math.abs(early.navigation - pixels * sensitivity) < 1e-6, 'the first mouse pulse keeps its configured sensitivity');
  assert.ok(Math.abs(settled.navigation - early.navigation) < 1e-6, 'the same gesture has the same sensitivity after settling');
  assert.ok(early.camera >= early.navigation * .7, `camera must respond during the first 150 ms: ${JSON.stringify(early)}`);
  assert.ok(early.camera >= settled.camera * .75, `handoff response must match normal aim: ${JSON.stringify({ early, settled })}`);
  report.checks.push('Cinematic descent remains active before swimming; camera responds immediately at control handoff with unchanged mouse sensitivity.');
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
