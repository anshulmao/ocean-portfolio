// Production models and creature update, without rendering the whole world.
// A diver entering/leaving a cloud changes the fish's heading; the bank must
// follow that actual turn. No backend, frame timer, WebGL or external server.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const source = fileURLToPath(new URL('../ocean-refined/', import.meta.url));
const origin = 'http://127.0.0.1:4190';
const browser = await launchBrowser();
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/bank-fixture') return route.fulfill({contentType: 'text/html', body: '<!doctype html><title>Cloud motion fixture</title>'});
    const file = path.resolve(source, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(source)) return route.abort();
    const contentType = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    await route.fulfill({contentType, body: await fs.readFile(file)});
  });
  await page.goto(origin + '/bank-fixture');
  const results = await page.evaluate(async () => {
    const T = await import('./vendor/three.module.min.js');
    const {createUserCreatures} = await import('./user-creatures.js');
    const results = [];
    for (const hz of [30, 60, 120]) {
      let seed = 20261029;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const system = createUserCreatures({economy: true, terrainHeightAt: () => -40,
        sites: {formations: [{name: 'Coral head', position: [0, -40, -20], radius: 6, height: 6}]}});
      await system.load();
      if (!system.diagnostics.ready || system.diagnostics.failed) throw Error('Creature models did not fully load');
      const matrix = new T.Matrix4(), position = new T.Vector3(), quaternion = new T.Quaternion(), scale = new T.Vector3(), euler = new T.Euler(0, 0, 0, 'YXZ');
      const meshes = new Map();
      system.root.traverse(node => { if (node.isInstancedMesh) meshes.set(node.name.replace(/^Creature set · | \(\d+\)$/g, ''), node); });
      const initial = system.debug.groups(), cloud = initial.find(group => group.kind === 'cloud');
      if (!cloud) throw Error('No cloud was exercised');
      const diver = new T.Vector3(...cloud.centre), previous = new Map();
      let turns = 0, wrong = 0;
      for (let frame = 0; frame < hz * 8; frame++) {
        // Two seconds calm, four with the diver in the cloud, two recovering.
        system.update(1 / hz, frame >= hz * 2 && frame < hz * 6 ? diver : null, null);
        const packed = new Map();
        for (const [index, group] of system.debug.groups().entries()) {
          if (!group.active || !group.shown) continue;
          const mesh = meshes.get(group.species), start = packed.get(mesh) || 0;
          packed.set(mesh, start + group.count);
          if (group.kind !== 'cloud') continue;
          for (let i = 0; i < group.count; i++) {
            mesh.getMatrixAt(start + i, matrix); matrix.decompose(position, quaternion, scale); euler.setFromQuaternion(quaternion, 'YXZ');
            if (![...position.toArray(), euler.y, euler.z].every(Number.isFinite)) throw Error('Non-finite cloud pose');
            const key = `${index}:${i}`, last = previous.get(key);
            if (last !== undefined) {
              const rate = Math.atan2(Math.sin(euler.y - last), Math.cos(euler.y - last)) * hz;
              if (Math.abs(rate) > .25 && Math.abs(euler.z) > .02) { turns++; if (Math.sign(rate) === Math.sign(euler.z)) wrong++; }
            }
            previous.set(key, euler.y);
          }
        }
      }
      results.push({hz, turns, wrong});
    }
    return results;
  });
  assert.deepEqual(errors, []);
  for (const result of results) {
    assert.ok(result.turns > 0, `no turns checked at ${result.hz} Hz`);
    assert.equal(result.wrong, 0, `cloud fish banked away from their actual turn at ${result.hz} Hz (${result.wrong}/${result.turns} frames)`);
    console.log('Cloud banking:', result);
  }
} finally { await browser.close(); }
