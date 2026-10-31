// Field guide portraits (assets/prepared/portraits): one WebP a species, rendered from the creature set's own GLBs so
// the dive summary shows the animals the diver met, not pictures of other ones. Each model is posed a third of the way
// into its swim clip, lit from above with a cool rim, framed three-quarters on (rays from above), and cut to the
// pixels it covers at 4:3 on a transparent background; the summary paints the water behind it.
// Run it again after a change to a creature model or to SPECIES in field-guide.js:
//   node ocean-refined/tools/prepare-portraits.mjs
// It serves ocean-refined/ itself. PLAYWRIGHT_CHROMIUM_PATH as for the other tools.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from '../../tools/browser.mjs';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), output = path.join(site, 'assets/prepared/portraits');
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary'};
// The page that renders them: imported modules only, nothing of the scene.
const PAGE = `<!doctype html><meta charset="utf-8"><script type="module">
import * as THREE from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {SPECIES} from './field-guide.js';
const W = 1024, H = 768, renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0, 0);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(28, W / H, .01, 500);
scene.add(new THREE.HemisphereLight('#c9f6ff', '#0c3d55', 2.1));
const sun = new THREE.DirectionalLight('#fff6e6', 2.4); sun.position.set(3, 7, 4); scene.add(sun);
const rim = new THREE.DirectionalLight('#7fe8ff', 1.6); rim.position.set(-5, 2, -6); scene.add(rim);
const work = document.createElement('canvas'); work.width = W; work.height = H;
const out = document.createElement('canvas'); out.width = 480; out.height = 360;
// Skinned bounds run loose, so the frame is cut to the pixels the animal covers, with a margin.
function crop() {
  const c = work.getContext('2d', {willReadFrequently: true}); c.clearRect(0, 0, W, H); c.drawImage(renderer.domElement, 0, 0);
  const {data} = c.getImageData(0, 0, W, H); let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  let w = (x1 - x0 + 1) * 1.12, h = (y1 - y0 + 1) * 1.12; if (w / h > 4 / 3) h = w * .75; else w = h * 4 / 3;
  const o = out.getContext('2d'); o.clearRect(0, 0, 480, 360);
  o.drawImage(work, (x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h, 0, 0, 480, 360);
  return out.toDataURL('image/webp', .86);
}
window.render = async () => {
  const loader = new GLTFLoader(), done = {};
  for (const item of SPECIES) {
    const gltf = await loader.loadAsync('./assets/models/user-sets/sets/creature-set/' + (item.models?.[0] || item.id) + '.glb'), root = gltf.scene;
    const clip = gltf.animations.find(c => c.name === 'swim') || gltf.animations[0];
    if (clip) { const mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play(); mixer.update(clip.duration * .3); }
    scene.add(root); root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root, true), centre = box.getCenter(new THREE.Vector3()), radius = box.getSize(new THREE.Vector3()).length() / 2;
    const view = (item.id.endsWith('ray') ? new THREE.Vector3(.85, .75, .55) : new THREE.Vector3(1, .2, .5)).normalize();
    camera.position.copy(centre).addScaledVector(view, radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.lookAt(centre); camera.updateProjectionMatrix(); renderer.render(scene, camera);
    done[item.id] = crop(); scene.remove(root);
  }
  return done;
};
window.ready = true;
</script>`;
const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  if (pathname === '/__portraits.html') { response.writeHead(200, {'Content-Type': 'text/html'}); response.end(PAGE); return; }
  const file = path.join(site, pathname);
  if (!file.startsWith(site)) { response.writeHead(403).end(); return; }
  try { const bytes = await fs.readFile(file); response.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'}); response.end(bytes); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchBrowser({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage();
  page.on('pageerror', error => console.error(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/__portraits.html`);
  await page.waitForFunction(() => window.ready, null, {timeout: 60000});
  const portraits = await page.evaluate(() => window.render());
  await fs.mkdir(output, {recursive: true});
  let bytes = 0;
  for (const [id, url] of Object.entries(portraits)) {
    if (!url.startsWith('data:image/webp')) throw Error(`${id}: the browser did not encode WebP`);
    const data = Buffer.from(url.split(',')[1], 'base64'); bytes += data.length;
    await fs.writeFile(path.join(output, `${id}.webp`), data);
  }
  console.log(`prepared ${Object.keys(portraits).length} portraits, ${Math.round(bytes / 1024)} KB in all`);
} finally { await browser.close(); server.close(); }
