import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.OCEAN_TEST_BASE || 'http://127.0.0.1:4210/ocean-refined/');
  await page.waitForFunction(() => window.oceanDiagnostics?.ready, null, { timeout: 120000 });
  await page.locator('#dive').click();
  await page.waitForFunction(() => window.oceanDiagnostics.userCreatures?.ready, null, { timeout: 120000 });
  const result = await page.evaluate(() => {
    const c = oceanControls.creatures, player = oceanControls.getPlayerPosition().clone();
    oceanControls.place([0, -10, 0], [-12, -10, -15]);
    c.update(1 / 60, player, null);
    let before = c.debug.swimmers(), maxClimb = 0, maxYaw = 0, minClearance = Infinity, invalidMatrices = 0;
    const origins = before.map(s => [s.x, s.y, s.z]);
    for (let frame = 0; frame < 1200; frame++) {
      c.update(1 / 60, player, null);
      const after = c.debug.swimmers();
      after.forEach((s, i) => {
        maxClimb = Math.max(maxClimb, Math.abs(s.y - before[i].y) / (s.speed / 60));
        maxYaw = Math.max(maxYaw, Math.abs(s.yaw - before[i].yaw) * 60);
        minClearance = Math.min(minClearance, s.y - s.floor);
      });
      before = after;
    }
    const moving = before.filter((s, i) => Math.hypot(s.x - origins[i][0], s.z - origins[i][2]) > .2).length;
    c.root.traverse(node => { if (node.instanceMatrix && !node.instanceMatrix.array.every(Number.isFinite)) invalidMatrices++; });
    const moray = c.root.children.find(n => n.userData.creatureId === 'giant-moray');
    let maxMorayStep = 0, morayYawDrift = 0;
    if (moray) {
      const initialYaw = moray.rotation.y, dx = Math.sin(initialYaw), dz = Math.cos(initialYaw);
      player.copy(moray.position); player.x += dx * 5; player.z += dz * 5;
      let previous = moray.position.clone();
      for (let frame = 0; frame < 600; frame++) {
        c.update(1 / 60, frame < 300 ? player : null, null);
        maxMorayStep = Math.max(maxMorayStep, previous.distanceTo(moray.position));
        morayYawDrift = Math.max(morayYawDrift, Math.abs(moray.rotation.y - initialYaw));
        previous.copy(moray.position);
      }
    }
    return { ready: c.diagnostics.ready, loaded: c.diagnostics.loaded, fish: before.length, moving, maxClimb, maxYaw, minClearance, invalidMatrices, finite: c.diagnostics.finite, maxMorayStep, morayYawDrift };
  });
  assert.equal(result.loaded, 27);
  assert.ok(result.fish > 70);
  assert.ok(result.maxClimb <= .30001, 'scene fish exceeded climb cap');
  assert.ok(result.maxYaw <= 1.30001, 'scene fish heading snapped');
  assert.ok(result.minClearance > .2, 'scene fish penetrated terrain');
  assert.ok(result.moving > result.fish * .65, 'most scene swimmers stranded');
  assert.equal(result.invalidMatrices, 0);
  assert.ok(result.finite);
  assert.ok(result.maxMorayStep < .012, 'moray snapped outside den');
  assert.equal(result.morayYawDrift, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
