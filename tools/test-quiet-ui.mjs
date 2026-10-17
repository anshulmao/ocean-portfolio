import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 await page.setContent(`<style>body{margin:0}#world{width:390px;height:844px;position:absolute;inset:0}button{position:relative}#restore-ui{position:fixed;bottom:20px}</style><canvas id="world" tabindex="0"></canvas><button id="clear-ui-toggle" hidden>Clear</button><button id="clear-ui-settings">Clear</button><button id="restore-ui" hidden>Restore</button><div id="quiet-ui-status"></div><button id="dive-computer-toggle" hidden>C</button><button id="photo-settings">Photo</button><button id="finds-settings">Finds</button><input id="text"><div class="reef-map">Map</div><div id="dive-computer">Computer</div>`);
 await page.addStyleTag({content:await readFile('ocean-refined/quiet-ui.css','utf8')});
 await page.addScriptTag({content:await readFile('ocean-refined/quiet-ui.js','utf8')});
 await page.evaluate(()=>{document.body.dataset.submerged='true';window.computerClicks=0;document.querySelector('#dive-computer-toggle').onclick=()=>window.computerClicks++;});
 await page.keyboard.press('u');
 assert.equal(await page.evaluate(()=>window.oceanQuietUi.cleared),true);
 assert.equal(await page.locator('.reef-map').evaluate(el=>getComputedStyle(el).visibility),'hidden');
 assert.equal(await page.locator('#dive-computer').evaluate(el=>getComputedStyle(el).visibility),'visible');
 await page.keyboard.press('Escape'); assert.equal(await page.evaluate(()=>window.oceanQuietUi.cleared),false);
 await page.locator('#text').focus(); await page.keyboard.press('u'); assert.equal(await page.evaluate(()=>window.oceanQuietUi.cleared),false);
 await page.evaluate(()=>window.oceanQuietUi.setClear(true));
 await page.touchscreen.tap(200,400); await page.locator('#quiet-check-computer').click();
 assert.equal(await page.evaluate(()=>window.computerClicks),1);
 await page.touchscreen.tap(200,400); await page.locator('#restore-ui').click(); assert.equal(await page.evaluate(()=>window.oceanQuietUi.cleared),false);
 await page.evaluate(()=>{window.oceanQuietUi.setClear(true);document.body.dataset.submerged='false';});
 await page.waitForFunction(()=>!window.oceanQuietUi.cleared);
 console.log('PASS: U/Escape, editable guard, HUD hiding, computer exception, touch restore/computer, surface reset');
}finally{await browser.close();}
