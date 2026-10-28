// Smoke test of the built site: every page loads without a script error and every way into the portfolio opens it.
// It needs no GPU; the reading content never waits on the 3D scene.
//   npm run smoke                      checks dist/ (run `npm run build` first) on a local server
//   npm run smoke -- <url>             checks a deployment, e.g. production after `vercel deploy`
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), dist = path.join(root, 'dist');
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.pdf': 'application/pdf', '.xml': 'application/xml', '.txt': 'text/plain'};

function serve() {
  const server = http.createServer(async (request, response) => {
    let file = path.join(dist, decodeURIComponent(new URL(request.url, 'http://local').pathname));
    if (!file.startsWith(dist)) { response.writeHead(403).end(); return; }
    try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html'); response.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'}); response.end(await fs.readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const server = process.argv[2] ? null : await serve();
const base = process.argv[2] ? new URL(process.argv[2]).href : `http://127.0.0.1:${server.address().port}/`;
const browser = await launchBrowser();
const failures = [];
const check = async (name, fn) => { try { await fn(); console.log(`ok   ${name}`); } catch (error) { failures.push(name); console.log(`FAIL ${name}\n     ${error.message.split('\n').slice(0, 4).join('\n     ')}`); } };

// Script errors and missing same-origin files on any page fail the check that loaded it.
async function open(url, viewport = {width: 1440, height: 900}) {
  const page = await browser.newPage({viewport}), problems = [];
  page.on('pageerror', error => problems.push(`script error: ${error.message}`));
  page.on('response', response => { const target = new URL(response.url()); if (target.origin === new URL(base).origin && response.status() >= 400) problems.push(`${response.status()} ${target.pathname}`); });
  await page.goto(new URL(url, base).href, {waitUntil: 'load', timeout: 60000});
  return {page, problems};
}

try {
  await check('ocean page loads and every way into the portfolio opens it', async () => {
    const {page, problems} = await open('./');
    await page.waitForFunction(() => window.oceanArchive && window.oceanLandmarks, null, {timeout: 20000})
      .catch(() => { throw Error(`portfolio modules never loaded (oceanArchive/oceanLandmarks missing)${problems.length ? '; ' + problems.join('; ') : ''}`); });
    const dialog = page.locator('#landmark-dialog');
    for (const name of ['Work', 'About', 'Experience', 'Résumé']) {
      await page.locator('.surface-nav a', {hasText: name}).click();
      await dialog.and(page.locator('[open]')).waitFor({timeout: 5000}).catch(() => { throw Error(`surface nav "${name}" did not open the portfolio`); });
      assert.ok(await page.evaluate(() => window.oceanArchive.current?.section), `"${name}" opened no section`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#landmark-dialog').open, null, {timeout: 5000});
    }
    await page.evaluate(() => window.oceanArchive.open('projects', 'rae'));
    assert.equal(await page.evaluate(() => window.oceanArchive.current?.entry), 'rae', 'a project link did not open its entry');
    assert.deepEqual(problems, []);
    await page.close();
  });

  await check('a deep link opens its section on arrival', async () => {
    const {page, problems} = await open('./#log');
    await page.locator('#landmark-dialog[open]').waitFor({timeout: 20000});
    assert.equal(await page.evaluate(() => window.oceanArchive.current?.section), 'experience');
    assert.deepEqual(problems, []);
    await page.close();
  });

  let projects = [];
  await check('reading page renders at desktop and phone widths', async () => {
    for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
      const {page, problems} = await open('./profile.html', viewport);
      assert.equal(await page.locator('h1').count(), 1, 'profile has no heading');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `profile scrolls sideways at ${viewport.width}px`);
      projects = await page.locator('a[href*="projects/"]').evaluateAll(links => [...new Set(links.map(link => link.href).filter(href => /\/projects\/[^/]+\/$/.test(href)))]);
      assert.deepEqual(problems, []);
      await page.close();
    }
    assert.ok(projects.length > 0, 'profile links to no project pages');
  });

  await check('every project page renders', async () => {
    for (const url of projects) {
      const {page, problems} = await open(url);
      assert.equal(await page.locator('h1').count(), 1, `${url} has no heading`);
      assert.deepEqual(await page.locator('img').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).map(image => image.src)), [], `${url} has broken images`);
      assert.deepEqual(problems, [], url);
      await page.close();
    }
  });
} finally {
  await browser.close();
  server?.close();
}
console.log(failures.length ? `\n${failures.length} smoke check(s) failed against ${base}` : `\nAll smoke checks passed against ${base}`);
process.exitCode = failures.length ? 1 : 0;
