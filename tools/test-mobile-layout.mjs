// Layout check for the ocean interface on phones (and a desktop pass so phone fixes do not regress it).
// It drives the main states a visitor meets, then measures what is on screen:
//   overlap   two separate pieces of interface (text or controls) drawn over each other
//   target    a control smaller than 40 px in either direction (phones only)
//   scroll    the page or a dialog scrolling sideways
//   view      in a dive, how much of the screen is left for the ocean, and how much of its middle is covered
// Screenshots and a JSON report go to $LAYOUT_OUT (default: a temp folder).
//   node tools/test-mobile-layout.mjs [url] [--only=phone|landscape|desktop]
// Run `npm run build` first when no url is given: it serves dist/ itself, like tools/smoke.mjs.
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), dist = path.join(root, 'dist');
const args = process.argv.slice(2), only = args.find(arg => arg.startsWith('--only='))?.slice(7), target = args.find(arg => !arg.startsWith('--'));
const out = process.env.LAYOUT_OUT || path.join(os.tmpdir(), 'ocean-layout');
await fs.mkdir(out, {recursive: true});
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.pdf': 'application/pdf', '.rgba': 'application/octet-stream'};
let server = null;
if (!target) {
  server = http.createServer(async (request, response) => {
    let file = path.join(dist, decodeURIComponent(new URL(request.url, 'http://local').pathname));
    if (!file.startsWith(dist)) { response.writeHead(403).end(); return; }
    try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html'); response.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'}); response.end(await fs.readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}
const base = target ? new URL(target).href : `http://127.0.0.1:${server.address().port}/`;

const PROFILES = {
  phone: {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2, phone: true},
  landscape: {viewport: {width: 844, height: 390}, isMobile: true, hasTouch: true, deviceScaleFactor: 2, phone: true},
  desktop: {viewport: {width: 1440, height: 900}, isMobile: false, hasTouch: false, deviceScaleFactor: 1, phone: false},
};

// Runs in the page. Everything visible that is text or a control is a "leaf"; leaves belong to the nearest fixed
// (or sticky) ancestor, their "component"; an absolute element placed against the page itself (no positioned ancestor:
// the page never scrolls, so the HUD's absolute instruments are as fixed as the rest) is a component too. Overlaps are
// only counted between different components: two parts of one
// card may sit close, but the tour card may not sit on the depth chip. Anything behind an open modal dialog is inert
// and skipped, so a reading sheet is measured on its own.
function measure({phone, dive}) {
  const W = innerWidth, H = innerHeight, modal = document.querySelector(':modal');
  const opacity = el => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || s.contentVisibility === 'hidden') return 0; o *= +s.opacity; } return o; };
  const name = el => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  const component = el => { for (let n = el; n && n !== document.body; n = n.parentElement) { if (n.tagName === 'DIALOG' && n.open) return n; const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky' || (p === 'absolute' && n.offsetParent === document.body)) return n; } return document.body; };
  const ownText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  // What of a box is on screen: cut by every ancestor that clips its overflow (a scrolling panel, a round lens).
  const seen = (el, r) => { let left = r.left, top = r.top, right = r.right, bottom = r.bottom; for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (s.overflowX === 'visible' && s.overflowY === 'visible') continue; const b = n.getBoundingClientRect(); left = Math.max(left, b.left); top = Math.max(top, b.top); right = Math.min(right, b.right); bottom = Math.min(bottom, b.bottom); } return {left, top, right, bottom, width: right - left, height: bottom - top}; };
  const CONTROL = 'button,a[href],[role=button],summary,input,select,textarea';
  const leaves = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.id === 'world' || el.closest('script,style,template,noscript')) continue;
    if (modal && !modal.contains(el)) continue;
    if (!modal && el.closest('dialog:not([open])')) continue;
    if (el.closest('details:not([open]) > :not(summary)')) continue;     // folded away: laid out for queries, never drawn
    const control = el.matches(CONTROL);
    if (!control && !ownText(el) && !el.matches('svg,canvas,img')) continue;
    if (!control && el.closest(CONTROL)) continue;                       // a control's label is part of the control
    if (el.matches('svg') && el.closest(CONTROL)) continue;
    const box = el.getBoundingClientRect(), r = seen(el, box);
    if (r.width < 2 || r.height < 2 || r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H) continue;
    if (opacity(el) < .15) continue;
    if (el.checkVisibility && !el.checkVisibility()) continue;           // not rendered, e.g. inside a closed <details>
    const c = component(el);
    // r is the part on screen (overlaps); box is the whole control (its size, even when a panel has scrolled half of it away).
    leaves.push({el, r, box, control, c, name: name(el), text: (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)});
  }
  const overlaps = [];
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j];
    if (a.c === b.c || a.el.contains(b.el) || b.el.contains(a.el) || a.c.contains(b.c) || b.c.contains(a.c)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w <= 2 || h <= 2) continue;
    const share = w * h / Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
    if (share > .1) overlaps.push(`${name(a.c)} "${a.text || a.name}" over ${name(b.c)} "${b.text || b.name}" (${Math.round(share * 100)}%)`);
  }
  const targets = phone ? leaves.filter(l => l.control && !l.el.closest('p,li,dd') && (l.box.width < 40 || l.box.height < 40)).map(l => `${l.name} "${l.text}" ${Math.round(l.box.width)}x${Math.round(l.box.height)}`) : [];
  const scroll = [];
  if (document.scrollingElement.scrollWidth > W + 1) scroll.push(`page is ${document.scrollingElement.scrollWidth}px wide`);
  if (modal) for (const el of modal.querySelectorAll('*')) { const s = getComputedStyle(el); if (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1 && !el.matches('[role=tablist],[data-scroll-x]')) scroll.push(`${name(el)} scrolls sideways`); }
  // Screen left for the ocean: sample a grid against the boxes of the components that hold visible leaves.
  let view = null, middle = null;
  if (dive && !modal) {
    const boxes = [...new Set(leaves.map(l => l.c))].filter(c => c !== document.body).map(c => c.getBoundingClientRect()).filter(r => r.width * r.height < W * H * .9);
    let covered = 0, total = 0, mid = 0, midTotal = 0;
    for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) {
      const hit = boxes.some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom); total++; covered += hit;
      if (x > W * .3 && x < W * .7 && y > H * .3 && y < H * .65) { midTotal++; mid += hit; }
    }
    view = +(1 - covered / total).toFixed(2); middle = +(mid / midTotal).toFixed(2);
  }
  return {leaves: leaves.length, overlaps, targets, scroll, view, middle};
}

const LIMITS = {view: .6, middle: .12};
const browser = await launchBrowser({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const report = {base, profiles: {}}, failures = [];
async function run(profileName) {
  const profile = PROFILES[profileName], {phone, ...options} = profile;
  const context = await browser.newContext(options), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const results = report.profiles[profileName] = {errors, states: {}};
  const state = async (label, dive = false) => {
    await page.waitForTimeout(900);
    const file = path.join(out, `${profileName}-${label}.png`);
    await page.screenshot({path: file});
    const result = await page.evaluate(measure, {phone, dive});
    results.states[label] = {...result, screenshot: file};
    const problems = [...result.overlaps.map(x => `overlap: ${x}`), ...result.targets.map(x => `small target: ${x}`), ...result.scroll.map(x => `scroll: ${x}`)];
    if (dive && result.view !== null && result.view < LIMITS.view) problems.push(`view: only ${Math.round(result.view * 100)}% of the screen is left for the ocean (want ≥ ${LIMITS.view * 100}%)`);
    if (dive && result.middle !== null && result.middle > LIMITS.middle) problems.push(`view: ${Math.round(result.middle * 100)}% of the middle of the screen is covered (want ≤ ${LIMITS.middle * 100}%)`);
    results.states[label].problems = problems;
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${profileName}/${label}${problems.length ? '' : ` (${result.leaves} items${result.view !== null ? `, ocean ${Math.round(result.view * 100)}%` : ''})`}`);
    for (const problem of problems.slice(0, 12)) console.log(`       ${problem}`);
    if (problems.length > 12) console.log(`       … ${problems.length - 12} more`);
    if (problems.length) failures.push(`${profileName}/${label}`);
  };
  const step = async (label, fn) => { try { await fn(); } catch (error) { failures.push(`${profileName}/${label}`); console.log(`FAIL ${profileName}/${label}: could not reach this state (${error.message.split('\n')[0]})`); } };
  await page.goto(base, {waitUntil: 'domcontentloaded', timeout: 120000});
  await page.waitForFunction(() => window.oceanDiagnostics?.ready && window.oceanArchive, null, {timeout: 180000});
  // A real phone switches the page to touch input on the first touch (touch-controls.js); emulation sends none.
  if (phone) await page.evaluate(() => { document.documentElement.dataset.input = 'touch'; });
  await page.waitForTimeout(2500);
  await state('surface');
  // On a phone the summary is tapped: a click is a mouse event, and the page would rightly switch back to mouse input.
  const press = locator => phone ? locator.tap({timeout: 5000}) : locator.click({timeout: 5000});
  await step('surface-options', async () => { await press(page.locator('#portfolio-options summary')); await state('surface-options'); await press(page.locator('#portfolio-options summary')); });
  await step('reading-glance', async () => { await page.evaluate(() => oceanArchive.open('glance')); await state('reading-glance'); });
  await step('reading-project', async () => { await page.evaluate(() => oceanArchive.open('projects', 'rae')); await state('reading-project'); await page.evaluate(() => oceanArchive.close()); });
  await step('dive', async () => {
    await page.evaluate(() => oceanControls.startDive({capture: false}));
    await page.waitForFunction(() => oceanDiagnostics.submerged && !oceanControls.getTransition() && oceanControls.getMode() === 'diver', null, {timeout: 120000});
    await state('dive-arrival', true);                                    // the location splash is up now
    await page.waitForTimeout(5000); await state('dive', true);
  });
  await step('landmark', async () => {
    await page.evaluate(() => { const l = oceanControls.models.landmarks.find(item => item.id === 'experience'), p = l.position; oceanControls.place(l.interactionPosition, [p.x ?? p[0], p.y ?? p[1], p.z ?? p[2]]); });
    await page.waitForFunction(() => oceanDiagnostics.nearbyLandmark, null, {timeout: 20000});
    await state('landmark', true);
  });
  await step('settings', async () => { await page.evaluate(() => oceanHud.setMenu(true)); await state('settings'); await page.evaluate(() => oceanHud.setMenu(false)); });
  await step('guided', async () => {
    await page.evaluate(() => oceanControls.surface({instant: true}));
    await page.waitForFunction(() => oceanControls.getMode() === 'surface', null, {timeout: 60000});
    await page.evaluate(() => oceanTour.start());
    await page.waitForFunction(() => oceanDiagnostics.submerged && ['travel', 'dwell'].includes(oceanTour.status), null, {timeout: 120000});
    await page.waitForTimeout(2500); await state('guided-travel', true);
    await page.waitForFunction(() => oceanTour.status === 'dwell', null, {timeout: 120000});
    await state('guided-stop', true);
    await page.evaluate(() => oceanTour.stop());
  });
  if (errors.length) { failures.push(`${profileName}/script-errors`); console.log(`FAIL ${profileName}: script errors\n       ${errors.join('\n       ')}`); }
  await context.close();
}
try { for (const name of Object.keys(PROFILES)) if (!only || only === name) await run(name); }
finally { await browser.close(); server?.close(); await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1)); }
console.log(`\n${failures.length ? `${failures.length} state(s) failed` : 'All layout checks passed'} · screenshots and report.json in ${out}`);
process.exitCode = failures.length ? 1 : 0;
