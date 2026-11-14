import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRainTexture, rainMix} from '../ocean-refined/rain-acoustics.js';
import {whaleCruise} from '../ocean-refined/whale-cruise.js';

test('rain is silent in clear weather and remains bounded across weather transitions', () => {
  assert.equal(rainMix(0).bed, 0); assert.equal(rainMix(0).drops, 0);
  for (const input of [-1, 0, .01, .5, 1, 2, NaN, Infinity]) {
    const mix = rainMix(input, input, input);
    assert.ok(Object.values(mix).every(Number.isFinite));
    assert.ok(mix.bed >= 0 && mix.bed <= .306);
    assert.ok(mix.drops >= 0 && mix.drops <= .2);
    assert.ok(mix.lowpass >= 5800 && mix.lowpass <= 8600);
  }
  let previous = rainMix(0);
  for (let frame = 1; frame <= 1000; frame++) {
    const next = rainMix(frame / 1000, .5, frame / 60);
    assert.ok(Math.abs(next.bed - previous.bed) < .001);
    assert.ok(Math.abs(next.drops - previous.drops) < .007);
    previous = next;
  }
});

test('rain has finite independent stereo channels and wet transients without a short repeating loop', () => {
  let seed = 918273;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const context = {sampleRate: 44100, createBuffer(channels, length, sampleRate) {
    const data = Array.from({length: channels}, () => new Float32Array(length));
    return {numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: c => data[c]};
  }};
  const {bed, drops} = createRainTexture(context, random);
  assert.ok(bed.duration > 10 && drops.duration > 10);
  assert.notEqual(bed.length, drops.length);
  for (const buffer of [bed, drops]) {
    let peak = 0, l2 = 0, r2 = 0, cross = 0;
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
    for (let i = 0; i < buffer.length; i++) {
      assert.ok(Number.isFinite(left[i]) && Number.isFinite(right[i]));
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      l2 += left[i] ** 2; r2 += right[i] ** 2; cross += left[i] * right[i];
    }
    assert.ok(peak <= 1 && peak > .1);
    assert.ok(Math.sqrt(l2 / buffer.length) > .02);
    // The impacts share their timing, but their varying bearings retain width.
    assert.ok(cross / Math.sqrt(l2 * r2) < (buffer === bed ? .03 : .85));
  }
});

test('whale noses into its vertical course and alternates unhurried strokes with glides at every frame rate', () => {
  for (const hz of [30, 60, 120]) {
    let previous = whaleCruise(0), glides = 0, strokes = 0;
    for (let frame = 1; frame <= hz * 80; frame++) {
      const seconds = frame / hz, pose = whaleCruise(seconds), h = .0001;
      const verticalSpeed = (whaleCruise(seconds + h).heave - whaleCruise(seconds - h).heave) / (2 * h);
      assert.ok(Math.abs(Math.tan(pose.pitch) * 2.4 - verticalSpeed) < 1e-7);
      assert.ok(Math.abs(pose.heave - previous.heave) <= .18 / hz);
      assert.ok(Math.abs(pose.pitch) < .08 && Math.abs(pose.roll) < .019);
      if (pose.clip === 'idle') glides++; else strokes++;
      previous = pose;
    }
    assert.ok(glides > hz * 15 && strokes > hz * 40);
  }
  assert.ok(Object.values(whaleCruise(NaN, Infinity, NaN)).every(value => typeof value === 'string' || Number.isFinite(value)));
});
