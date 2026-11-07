// Real production Web Audio graph rendered offline. No microphone, external
// audio host, network writes, wall clock wait, or audible autoplay is involved.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';

const source = path.resolve(fileURLToPath(new URL('../ocean-refined/', import.meta.url)));
const origin = 'http://127.0.0.1:4190';
const browser = await launchBrowser();
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/audio-fixture') return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Ocean sound fixture</title><div id="settings-general-content"></div>'});
    const file = path.resolve(source, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(source + path.sep)) return route.abort();
    await route.fulfill({contentType:file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream',body:await fs.readFile(file)});
  });
  await page.goto(origin + '/audio-fixture');
  const results = await page.evaluate(async () => {
    localStorage.setItem('ocean-sound', 'off');
    await import('./ambient-audio.js');
    const audio = window.oceanAudio, results = {};
    const measure = buffer => {
      let power = 0, peak = 0, samples = 0;
      for (let c = 0; c < buffer.numberOfChannels; c++) for (const value of buffer.getChannelData(c)) {
        if (!Number.isFinite(value)) throw Error('Non-finite audio output');
        power += value * value; peak = Math.max(peak, Math.abs(value)); samples++;
      }
      return {rms:Math.sqrt(power / samples),peak};
    };
    const render = (state, extra = {}) => audio.render(7, state, {solo:['rain','patter'],rate:32000,level:.7,recorded:false,...extra});
    for (const [name, state, extra] of [
      ['clear',{rain:0}], ['shower',{rain:.5,wind:.45}], ['storm',{rain:1,wind:1}],
      ['deep',{rain:1,wind:1,under:1,depth:24}], ['records',{rain:1,open:true}],
      ['muted',{rain:1},{level:0}],
    ]) results[name] = measure(await render(state, extra));
    // A sudden manual request still follows the production parameter glide.
    const transition = await render(t => ({rain:t < 1 ? 0 : t < 4 ? 1 : 0}));
    const data = transition.getChannelData(0);
    const rms = (from, to) => Math.sqrt(data.subarray(from * 32000, to * 32000).reduce((sum, value) => sum + value * value, 0) / ((to - from) * 32000));
    results.transition = {before:rms(.2,.8),wet:rms(2,3),after:rms(6,7)};
    results.whale = measure(await audio.render(7, {under:1,depth:18,breathing:0}, {solo:'whale',events:[['upcall',.3,[32,.6]]],rate:32000,level:.7,recorded:false}));
    results.status = audio.status();
    return results;
  });
  assert.deepEqual(errors, []);
  assert.equal(results.clear.peak, 0); assert.equal(results.muted.peak, 0);
  assert.ok(results.storm.rms > results.shower.rms * 1.15, 'storm should build beyond the shower');
  assert.ok(results.deep.rms < results.storm.rms * .15, 'deep water should muffle surface rain');
  assert.ok(results.records.rms < results.storm.rms * .4, 'reading should duck the rain');
  for (const name of ['shower','storm','deep','records','whale']) assert.ok(results[name].peak < .9 && results[name].rms > 0, name + ' must be audible and have headroom');
  assert.equal(results.transition.before, 0);
  assert.ok(results.transition.wet > .005 && results.transition.after < .0001, 'rain should rise and settle to silence');
  assert.equal(results.status.context, 'none', 'offline review must not enable live audio');
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
