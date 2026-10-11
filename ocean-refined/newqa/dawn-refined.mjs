import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{const Original=Date;window.Date=class extends Original{constructor(...args){super(...(args.length?args:['2026-10-10T23:05:00Z']))}static now(){return new Original('2026-10-10T23:05:00Z').getTime()}}});
await page.goto('http://127.0.0.1:4175/ocean-refined/');await page.waitForFunction(()=>window.oceanDiagnostics?.ready);await page.screenshot({path:'ocean-refined/qa/captures/dawn.png'});console.log(JSON.stringify({errors,sunAltitude:await page.evaluate(()=>window.oceanDiagnostics.sunAltitude)}));await browser.close();
