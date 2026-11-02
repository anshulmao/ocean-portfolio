// Production UI regression: reading and ocean routes share their type/control
// system, fit small screens, and keep keyboard, no-JS and reduced-motion paths.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.resolve(process.env.UI_REVIEW_OUT || path.join(root, '.taste-skill/ui-review'));
await fs.mkdir(out, {recursive:true});
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary'};
const server = http.createServer(async (req, res) => {
  let file = path.resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(dist + path.sep) && file !== dist) { res.writeHead(403).end(); return; }
  try {
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await launchBrowser({args:['--enable-unsafe-swiftshader']});
const failures = [], results = [];
async function check(name, run) {
  try { await run(); results.push({name,pass:true}); console.log('PASS', name); }
  catch(error) { failures.push(name); results.push({name,pass:false,error:error.message}); console.error('FAIL', name, error.message); }
}
async function fit(page, selector = 'html') {
  assert.ok(await page.locator(selector).evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${selector} overflows horizontally`);
}
async function shot(page, name, fullPage = false) {
  await page.screenshot({path:path.join(out, name + '.png'),fullPage,animations:'disabled'});
}
try {
  for (const width of [320,390,768,1440]) {
    await check(`reading page ${width}px, both colour schemes`, async () => {
      for (const colorScheme of ['light','dark']) {
        const page = await browser.newPage({viewport:{width,height:900},colorScheme});
        try {
          await page.goto(base + 'profile.html');
          await page.evaluate(() => document.fonts.ready);
          await page.locator('img').evaluateAll(images => Promise.all(images.map(image => { image.loading='eager'; return image.decode().catch(() => {}); })));
          await fit(page);
          for (const selector of ['#experience','#resume','#contact']) {
            const contrast = await page.locator(selector).evaluate(el => {
              const luminance = color => {
                const rgb = color.match(/[\d.]+/g).slice(0,3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
                return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
              };
              const s = getComputedStyle(el), a = luminance(s.color), b = luminance(s.backgroundColor);
              return (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
            });
            assert.ok(contrast >= 4.5, `${selector} text contrast ${contrast.toFixed(2)}:1`);
          }
          assert.match(await page.locator('h1').evaluate(el => getComputedStyle(el).fontFamily), /Outfit/);
          const lines = await page.locator('h1').evaluate(el => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
          assert.ok(lines <= 2.1, `headline occupies ${lines.toFixed(1)} lines`);
          await page.locator('#projects').scrollIntoViewIfNeeded();
          await shot(page, `work-${width}-${colorScheme}`);
          await page.evaluate(() => scrollTo(0,0));
          await shot(page, `reading-${width}-${colorScheme}`, true);
        } finally { await page.close(); }
      }
    });
  }
  await check('reading path works without JavaScript', async () => {
    const context = await browser.newContext({javaScriptEnabled:false,reducedMotion:'reduce',viewport:{width:390,height:844}});
    try {
      const page = await context.newPage(); await page.goto(base + 'profile.html');
      await page.getByRole('link',{name:/Explore my work/}).click();
      await page.locator('a[href="./projects/rae/index.html"]').first().click();
      await page.locator('h1').waitFor(); await fit(page);
      assert.match(await page.locator('h1').innerText(), /Rae/i);
    } finally { await context.close(); }
  });
  for (const viewport of [{width:390,height:844},{width:768,height:1024},{width:1440,height:900},{width:844,height:390}]) {
    await check(`ocean, settings and project archive ${viewport.width}×${viewport.height}`, async () => {
      const page = await browser.newPage({viewport,reducedMotion:'reduce'}), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(base);
        await page.waitForFunction(() => window.oceanArchive && window.oceanPlan, null, {timeout:30000});
        await page.evaluate(() => document.fonts.ready);
        await fit(page); await shot(page, `surface-${viewport.width}`);
        await page.locator('#menu-toggle').click();
        await page.locator('#settings-menu').waitFor({state:'visible'});
        assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'true');
        await shot(page, `settings-${viewport.width}`);
        await page.keyboard.press('Escape');
        await page.locator('#settings-menu').waitFor({state:'hidden'});
        await page.locator('#logbook-link').click();
        await page.locator('#landmark-dialog[open]').waitFor();
        await fit(page, '#landmark-dialog');
        assert.equal(await page.locator('#landmark-dialog').evaluate(el => getComputedStyle(el).backgroundImage),'none');
        await shot(page, `archive-${viewport.width}`);
        for (const section of ['about','experience','projects','resume']) {
          await page.evaluate(section => window.oceanArchive.open(section), section);
          assert.equal(await page.evaluate(() => window.oceanArchive.current.section),section);
          await fit(page, '#landmark-dialog');
        }
        await page.evaluate(() => window.oceanArchive.open('projects','rae'));
        await shot(page, `project-${viewport.width}`);
        await page.keyboard.press('Escape');
        await page.locator('#landmark-dialog').waitFor({state:'hidden'});
        await page.locator('#plan-dive').click();
        await page.locator('dialog[open]').waitFor();
        await shot(page, `sites-${viewport.width}`);
        await page.keyboard.press('Escape');
        await page.evaluate(() => dispatchEvent(new CustomEvent('oceandivelog', {detail:{
          number:1,started:Date.now()-140000,ended:Date.now(),time:134,maxDepth:18.4,averageDepth:9.2,
          profile:[[0,0],[40,9],[90,18.4],[134,0]],track:[[0,8],[-8,-6],[-12,-14],[4,-20]],
          sites:{about:{t:44,depth:9}},features:{},seen:{anthias:{t:50,depth:9,place:'The Anchor',fresh:true}},photos:[],safetyStop:false,found:2
        }})));
        await page.locator('.ds-open').click();
        await page.locator('#dive-summary[open]').waitFor();
        await fit(page, '#dive-summary'); await shot(page, `dive-log-${viewport.width}`);
        await page.keyboard.press('Escape');
        await page.locator('#dive-summary').waitFor({state:'hidden'});
        await page.evaluate(() => window.oceanProfile.open());
        await page.locator('#diver-profile').waitFor({state:'visible'});
        await shot(page, `profile-card-${viewport.width}`);
        await page.keyboard.press('Escape');
        assert.deepEqual(errors,[]);
      } finally { await page.close(); }
    });
  }
  await check('normal-motion sheets animate, settle, and dismiss from the keyboard', async () => {
    const page = await browser.newPage({reducedMotion:'no-preference'});
    try {
      await page.goto(base);
      await page.waitForFunction(() => window.oceanArchive);
      await page.locator('#logbook-link').click();
      assert.equal(await page.locator('#landmark-dialog').evaluate(el => getComputedStyle(el).animationName),'ui-sheet');
      await page.waitForTimeout(600);
      assert.equal(await page.locator('#landmark-dialog').evaluate(el => getComputedStyle(el).opacity),'1');
      await page.keyboard.press('Escape');
      await page.locator('#landmark-dialog').waitFor({state:'hidden'});
      await page.goto(base + 'profile.html');
      await page.getByRole('link',{name:/Explore my work/}).click();
      assert.equal(new URL(page.url()).hash,'#projects');
    } finally { await page.close(); }
  });
  await check('reduced motion removes shared arrivals and keeps the title visible', async () => {
    const page = await browser.newPage({reducedMotion:'reduce'});
    try {
      await page.goto(base);
      await page.locator('.surface-copy h1').waitFor({state:'visible'});
      for (const selector of ['.surface-copy','.portfolio-actions','.portfolio-links']) {
        assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).animationName),'none');
      }
      await page.goto(base + 'profile.html');
      assert.equal(await page.locator('.reading-hero-copy').evaluate(el => getComputedStyle(el).animationName),'none');
    } finally { await page.close(); }
  });
} finally {
  await browser.close(); server.close();
  await fs.writeFile(path.join(out,'results.json'), JSON.stringify(results,null,2));
}
console.log(`${results.length - failures.length}/${results.length} UI checks passed; screenshots: ${out}`);
process.exitCode = failures.length ? 1 : 0;
