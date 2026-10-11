import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.OCEAN_QA_URL || 'http://127.0.0.1:4175/ocean-refined/';
const browser = await chromium.launch({  headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/grounding-qa.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Imported model grounding QA</title>' }));
  await page.goto(new URL('grounding-qa.html', base).href);
  const result = await page.evaluate(async () => {
    const T = await import('./vendor/three.module.min.js');
    const { createModelScene } = await import('./model-scene.js');
    const { terrainHeightAt } = await import('./reef.js');
    const proxies = [];
    const models = createModelScene({ terrainHeightAt, collisions: { addBox: (box, meta) => proxies.push({ box: box.clone(), ...meta }) } });
    const loaded = await models.load();
    const samples = [];
    const point = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
    function inspectGeometry(node, matrix, name) {
      const geometry = node.geometry, count = geometry.index?.count ?? geometry.attributes.position.count;
      let minGap = Infinity, maxGap = -Infinity, countSamples = 0;
      const sample = p => { const gap = p.y - terrainHeightAt(p.x, p.z); minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap); countSamples++; };
      const read = (i, out) => node.getVertexPosition(geometry.index ? geometry.index.getX(i) : i, out).applyMatrix4(matrix);
      for (let i = 0; i + 2 < count; i += 3) {
        read(i,a); read(i+1,b); read(i+2,c); sample(a); sample(b); sample(c);
        const steps = Math.min(40, Math.ceil(Math.max(a.distanceTo(b),a.distanceTo(c),b.distanceTo(c)) / .31));
        if (steps < 2) continue;
        for (let u = 0; u <= steps; u++) for (let v = 0; v <= steps-u; v++) {
          point.copy(a).multiplyScalar(1-(u+v)/steps).addScaledVector(b,u/steps).addScaledVector(c,v/steps); sample(point);
        }
      }
      samples.push({ name, minGap, maxGap, samples: countSamples });
    }
    const instances = new T.Matrix4(), world = new T.Matrix4();
    models.root.traverseVisible(node => {
      if (!node.isMesh || !node.geometry?.attributes.position || /glow/.test(node.name)) return;
      if (node.isInstancedMesh) {
        for (let i = 0; i < node.count; i++) { node.getMatrixAt(i, instances); world.multiplyMatrices(node.matrixWorld, instances); inspectGeometry(node, world, `${node.name} ${i}`); }
      } else inspectGeometry(node, node.matrixWorld, node.name);
    });
    const placements = models.root.children.filter(node => node.userData.grounding).map(node => {
      const grounding = node.userData.grounding;
      const [x,y,z] = grounding.contact;
      return { name: node.name, ...grounding, contactGap: y-terrainHeightAt(x,z) };
    });
    const landmarks = models.landmarks.map(landmark => {
      const approach = new T.Vector3(...landmark.interactionPosition), center = new T.Vector3(...landmark.position);
      const box = placements.find(item => item.name === `${landmark.id} placement wrapper`);
      return { ...landmark, centerError: center.distanceTo(new T.Vector3(...box.center)), approachDistance: center.distanceTo(approach), approachFloorGap: approach.y-terrainHeightAt(approach.x,approach.z), approachCollisions: proxies.filter(proxy => proxy.box.clone().expandByScalar(.7).containsPoint(approach)).map(proxy => proxy.mesh) };
    });
    return { loaded, placements, landmarks, minGap: Math.min(...samples.map(sample => sample.minGap)), samples, proxies: proxies.map(proxy => ({ name: proxy.mesh, min: proxy.box.min.toArray(), max: proxy.box.max.toArray() })) };
  });
  await fs.writeFile(new URL('./captures/grounded-landmarks.json', import.meta.url), JSON.stringify({ ...result, errors }, null, 2));
  assert.equal(result.loaded.loaded, 8);
  assert.equal(result.loaded.failed, 0);
  assert.equal(result.placements.length, 19);
  for (const placement of result.placements) {
    assert(placement.samples > 0, `${placement.name} has no visible grounded geometry`);
    assert(placement.min.every(Number.isFinite) && placement.max.every(Number.isFinite), `${placement.name} bounds are invalid`);
    assert(Math.abs(placement.contactGap-placement.clearance) < .00001, `${placement.name} is floating above its terrain support`);
  }
  // Coral bases are intentionally embedded; branches on slopes may intersect
  // terrain. Individual root contact is checked by newqa/sky-chapters.mjs.
  for (const landmark of result.landmarks) {
    assert(landmark.centerError < .001, `${landmark.id} checkpoint does not match geometry`);
    assert(landmark.approachDistance < landmark.maxRange, `${landmark.id} approach cannot interact`);
    assert(landmark.approachFloorGap >= 2.79, `${landmark.id} approach is below safe swim height`);
    assert.equal(landmark.approachCollisions.length, 0, `${landmark.id} approach hits ${landmark.approachCollisions.join(', ')}`);
  }
  assert.equal(errors.length, 0, errors.join('; '));
  console.log(JSON.stringify({ ok: true, placements: result.placements, minGap: result.minGap, landmarks: result.landmarks, errors }, null, 2));
} finally { await browser.close(); }
