import { intensity } from './weather.js';
import { onTick } from './ui-ticker.js';

// Ambient sound, synthesised with the Web Audio API: no audio files and no
// libraries. It is off until the visitor asks for it. One graph is built once
// from a few looped noise buffers and steered ten times a second on the
// interface's shared clock (ui-ticker.js); while the sound is off there is no
// AudioContext, no subscription and nothing scheduled. Like the HUD files it
// only reads the public controls, the diagnostics and the scene's window events.

// Tuning. MASTER: output gain at full volume. LEVEL: each layer's gain on the
// mix (noise loops are normalised to an RMS of .2; the baked patter, bubbles,
// cues and calls to a peak of 1 before their level). BREATH: seconds per cycle,
// how much shorter it gets on the scooter, and the share of a cycle spent
// inhaling, holding and exhaling. THUNDER: seconds from the flash to the
// rumble, its soft attack and its tail. WHALE: seconds before the first call
// and between calls, and the depth they need. DUCK: the mix while the records
// are open. FADE: time constants of the master fade. TICK: milliseconds
// between parameter updates; GLIDE: how long each update takes to land; LOW:
// sample rate of the buffers that hold nothing above a few kilohertz.
const MASTER = 1.25;
const LEVEL = { wind: .4, wave: .9, rain: .3, patter: .16, thunder: .26, drone: .14, tone: .012, rush: .4, motor: .02, breath: .65, bubbles: .14, splash: .42, cue: .042, whale: .024 };
const BREATH = { cycle: 5.6, scooter: .8, inhale: .29, hold: .07, exhale: .42 };
const THUNDER = { delay: [.7, 2.8], attack: .45, tail: 6.5 };
const WHALE = { first: [25, 60], gap: [65, 130], below: 12 };
const DUCK = { gain: .35, cutoff: 700 };
const FADE = { in: .3, out: .07 };
const TICK = 100, GLIDE = .12, LOW = 24000;

const { PI } = Math, TAU = PI * 2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value)), lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (x, low, high) => { const t = clamp((x - low) / (high - low), 0, 1); return t * t * (3 - 2 * t); };
const span = ([low, high]) => low + Math.random() * (high - low);
const loudness = value => value ** 1.5;

// 1. Buffers. Two noise loops feed every continuous layer; the rain patter, the
// bubble stream, the interface cues and the whale calls are drawn once here, so
// nothing is synthesised per event while the scene runs.
function bake(ctx) {
  const rate = ctx.sampleRate, make = (seconds, channels = 2, at = rate) => ctx.createBuffer(channels, Math.round(seconds * at), at);
  const each = (buffer, fn) => { for (let c = 0; c < buffer.numberOfChannels; c++) fn(buffer.getChannelData(c)); };
  const scale = (data, k) => { for (let i = 0; i < data.length; i++) data[i] *= k; };
  const top = (buffer, value) => { let max = 0; each(buffer, data => { for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i])); }); each(buffer, data => scale(data, value / (max || 1))); return buffer; };
  // The right channel of a noise loop is the left one half a loop later: unrelated at any moment, for half the work.
  const twin = buffer => { const left = buffer.getChannelData(0), right = buffer.getChannelData(1), half = left.length >> 1; right.set(left.subarray(half)); right.set(left.subarray(0, half), left.length - half); return buffer; };
  // A damped sine whose pitch glides from f0 to f1: a raindrop, a bubble or a note. Two rotating phasors draw the
  // glide, so the loop has no sine or exponential in it, and it wraps, so loops stay seamless.
  const ring = (buffer, at, f0, f1, life, gain, pan = .5) => {
    const left = buffer.getChannelData(0), right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null, r = buffer.sampleRate, n = left.length;
    const count = Math.min(n, life * 6 * r | 0), attack = Math.min(.008, life / 3) * r, fade = Math.exp(-1 / (life * r)), bend = TAU * (f1 - f0) / (count * r), bc = Math.cos(bend), bs = Math.sin(bend);
    const l = right ? gain * Math.cos(pan * PI / 2) : gain, k = gain * Math.sin(pan * PI / 2);
    let c = 1, s = 0, rc = Math.cos(TAU * f0 / r), rs = Math.sin(TAU * f0 / r), level = 1, j = at % n;
    for (let i = 0; i < count; i++) {
      const value = s * level * (i < attack ? i / attack : 1), turned = c * rc - s * rs, bent = rc * bc - rs * bs;
      s = s * rc + c * rs; c = turned; rs = rs * bc + rc * bs; rc = bent; level *= fade;
      left[j] += value * l; if (right) right[j] += value * k;
      if (++j === n) j = 0;
    }
  };

  const white = make(3), hiss = white.getChannelData(0);
  for (let i = 0; i < hiss.length; i++) hiss[i] = (Math.random() * 2 - 1) * .3464;
  // Brown-ish noise: white through a one-pole low-pass at 150 Hz, with everything under 45 Hz taken out again (it would
  // only cost headroom). Like the bubbles, cues and calls it needs no more than LOW samples a second. The tail is folded
  // over the head, so the loop has no seam.
  const brown = make(6, 2, LOW), rumble = brown.getChannelData(0), lap = LOW >> 2, pole = 1 - Math.exp(-TAU * 150 / LOW), floor = 1 - Math.exp(-TAU * 45 / LOW);
  const raw = new Float32Array(rumble.length + lap);
  for (let i = 0, y = 0, low = 0; i < raw.length; i++) { y += pole * (Math.random() * 2 - 1 - y); low += floor * (y - low); raw[i] = y - low; }
  let power = 0;
  for (let i = 0; i < rumble.length; i++) { rumble[i] = i < lap ? raw[i] * Math.sin(i / lap * PI / 2) + raw[rumble.length + i] * Math.cos(i / lap * PI / 2) : raw[i]; power += rumble[i] * rumble[i]; }
  scale(rumble, .2 / Math.sqrt(power / rumble.length));
  twin(white); twin(brown);
  const rainfall = () => {
    const patter = make(4);
    for (let i = 0; i < 400; i++) { const f = 1300 * 2 ** (Math.random() * 2.3); ring(patter, Math.random() * patter.length | 0, f, f * .9, .002 + Math.random() * .006, Math.random() ** 3, Math.random()); }
    return top(patter, 1);
  };
  // Bubbles leave in small clusters; each one is a short blip that rises in pitch, and the big ones ring longer.
  const stream = () => {
    const bubbles = make(7, 2, LOW);
    for (let burst = 0; burst < 44; burst++) {
      const start = Math.random() * 7, pan = .3 + .4 * Math.random();
      for (let i = 0, count = 2 + Math.random() * 4 | 0; i < count; i++) {
        const f = 300 * 2 ** (Math.random() * 2.2);
        ring(bubbles, (start + i * (.03 + .05 * Math.random())) * LOW | 0, f, f * (1.5 + Math.random()), 9 / f + .008, .35 + .65 * Math.random(), pan + .2 * (Math.random() - .5));
      }
    }
    return top(bubbles, 1);
  };
  // Notes are [start, pitch, decay, gain]; the last quiet note of the chime and the arrival is their echo.
  const cue = (seconds, notes) => { const buffer = make(seconds, 1, LOW); for (const [at, f, life, gain] of notes) ring(buffer, at * LOW | 0, f, f, life, gain * LEVEL.cue); return buffer; };
  // A far whale: a slow glide with two soft harmonics and a faint pulse, then three darker echoes on alternate sides.
  // Pitch and loudness are worked out once per block of 32 samples; the phasor in between keeps the tone unbroken.
  const call = (f0, lift, fall, seconds) => {
    const buffer = make(seconds + 2.4, 2, LOW), n = seconds * LOW | 0, dry = new Float32Array(n), block = 32;
    for (let i = 0, c = 1, s = 0, level = 0; i < n; i += block) {
      const x = i / n, t = i / LOW, turn = TAU * f0 * 2 ** (lift * Math.sin(PI * x) ** 2 - fall * x * x) * (1 + .012 * x * Math.sin(t * 31)) / LOW, rc = Math.cos(turn), rs = Math.sin(turn);
      const step = (Math.sin(PI * Math.min(1, (i + block) / n)) ** 1.5 * (1 - .18 * Math.sin((t + block / LOW) * 150)) - level) / block;
      for (let j = i, end = Math.min(n, i + block); j < end; j++) { const turned = c * rc - s * rs; s = s * rc + c * rs; c = turned; level += step; dry[j] = (s + .64 * s * c + .14 * (3 * s - 4 * s * s * s)) * level; }
    }
    [[0, .5, 1], [.52, .2, .5], [1.1, .8, .28], [1.75, .35, .14]].forEach(([delay, pan, gain], tap) => {
      const left = buffer.getChannelData(0), right = buffer.getChannelData(1), offset = delay * LOW | 0, k = 1 / (1 + tap * 3), l = gain * Math.cos(pan * PI / 2), r = gain * Math.sin(pan * PI / 2);
      for (let i = 0, y = 0; i < n; i++) { y += k * (dry[i] - y); left[offset + i] += y * l; right[offset + i] += y * r; }
    });
    return top(buffer, LEVEL.whale);
  };
  // The two noise loops and the short cues are drawn at once: they are needed from the first moment and cost little.
  // The rain patter, the bubble stream and the whale calls are most of the work and none is heard in the first
  // second, so they are handed back as jobs; the live engine draws one per idle moment after the click that
  // turned the sound on, and the offline render draws them all before it starts.
  const buffers = { white, brown,
    chime: cue(2.6, [[0, 880, .28, 1], [.27, 1318.5, .36, .85], [.72, 1318.5, .3, .22]]),
    arrive: cue(1.6, [[0, 659.3, .22, .8], [.42, 659.3, .18, .2]]),
    open: cue(.8, [[0, 587.3, .07, .7], [.09, 880, .1, .7]]),
    close: cue(.8, [[0, 880, .07, .7], [.09, 587.3, .1, .6]]),
    lamp: cue(.3, [[0, 1900, .006, .5], [0, 240, .022, .8]]) };
  const jobs = [['bubbles', stream], ['patter', rainfall], ['whaleA', () => call(170, .85, .35, 3.2)], ['whaleB', () => call(240, .25, 1, 3.8)]];
  return { buffers, jobs };
}

// 2. The graph, built once. Everything heard through air (wind, waves, rain,
// thunder) shares one filter and gain, and so does everything heard through
// water, so crossing the surface is two parameters and never a hard switch.
function build(ctx, whole = false) {
  const { buffers, jobs } = bake(ctx), open = Math.min(18000, ctx.sampleRate * .45); let count = 0;
  const made = node => { count++; return node; };
  const gain = (value = 0) => { const node = made(ctx.createGain()); node.gain.value = value; return node; };
  // For a low-pass, Q is its resonance in decibels; for a band-pass it is the usual ratio.
  const filter = (type, frequency, Q = 0) => { const node = made(ctx.createBiquadFilter()); node.type = type; node.frequency.value = frequency; node.Q.value = Q; return node; };
  const loop = (buffer, rate = 1) => { const node = made(ctx.createBufferSource()); node.buffer = buffer; node.loop = true; node.playbackRate.value = rate; node.start(0, Math.random() * buffer.duration); return node; };
  const tone = (type, frequency) => { const node = made(ctx.createOscillator()); node.type = type; node.frequency.value = frequency; node.start(); return node; };
  const wire = (...nodes) => nodes.reduce((from, to) => (from.connect(to), to));

  const limiter = made(ctx.createDynamicsCompressor()), master = gain(), bus = gain(1), duck = filter('lowpass', open, -3);
  limiter.threshold.value = -10; limiter.knee.value = 8; limiter.ratio.value = 16; limiter.attack.value = .004; limiter.release.value = .25;
  wire(bus, duck, master, limiter, ctx.destination);
  const airLP = filter('lowpass', open, -3), air = gain(1), waterLP = filter('lowpass', 5200, -3), water = gain();
  wire(airLP, air, bus); wire(waterLP, water, bus);
  // The patter and bubble loops are wired in now and start playing when their buffers have been drawn.
  const later = () => { const node = made(ctx.createBufferSource()); node.loop = true; return node; };
  const white = loop(buffers.white), brownA = loop(buffers.brown), brownB = loop(buffers.brown, .5), patterLoop = later(), bubbleLoop = later();

  const windBP = filter('bandpass', 400, .7), wind = gain(), waveLP = filter('lowpass', 900, -3), wave = gain(), rainBP = filter('bandpass', 2000, .5), rain = gain(), patter = gain();
  const thunderLP = filter('lowpass', 120), thunder = gain();
  wire(brownA, windBP, wind, airLP); wire(white, waveLP, wave, airLP); wire(white, rainBP, rain, airLP); wire(patterLoop, patter, airLP); wire(brownB, thunderLP, thunder, airLP);

  const droneBP = filter('bandpass', 240, .7), drone = gain(), humA = tone('sine', 73.4), humB = tone('sine', 110), hum = gain();
  const rushBP = filter('bandpass', 500, .8), rush = gain(), motorTone = tone('sawtooth', 96), motorLP = filter('lowpass', 320, 6), motor = gain();
  wire(brownB, droneBP, drone, waterLP); humA.connect(hum); wire(humB, hum, waterLP); wire(white, rushBP, rush, waterLP); wire(motorTone, motorLP, motor, waterLP);

  // The regulator is in the diver's mouth: it stays in the middle and is not darkened by the water in between.
  const breathBP = filter('bandpass', 1500, 1.6), breath = gain(), bubbles = gain(), splashLP = filter('lowpass', 6000, -3), splash = gain();
  breathBP.channelCount = 1; breathBP.channelCountMode = 'explicit';
  wire(white, breathBP, breath, water); wire(bubbleLoop, bubbles, water); wire(white, splashLP, splash, bus);

  // draw(): the next deferred buffer; true while more are waiting.
  const draw = () => {
    const job = jobs.shift();
    if (!job) return false;
    const buffer = buffers[job[0]] = job[1](), node = job[0] === 'patter' ? patterLoop : job[0] === 'bubbles' ? bubbleLoop : null;
    if (node) { node.buffer = buffer; node.start(0, Math.random() * buffer.duration); }
    return jobs.length > 0;
  };
  if (whole) while (draw());
  return { ctx, buffers, draw, open, count, limiter, master, bus, duck, airLP, air, waterLP, water, windBP, waveLP, rainBP, thunderLP, droneBP, humB, rushBP, motorTone, motorLP, breathBP, bubbleLoop, splashLP,
    layers: { wind, wave, rain, patter, thunder, drone, tone: hum, rush, motor, breath, bubbles, splash }, aim: new Map(), breathAt: 0 };
}

// 3. Steering. Continuous parameters follow the scene: s is { under, depth,
// wind, rain, storm, speed, scooter, open }. Gusts, swell and the drone's drift
// are slow sines evaluated here rather than extra oscillators in the graph.
function steer(g, s, at, glide = GLIDE) {
  const set = (param, value, k = glide) => {
    if (Math.abs(g.aim.get(param) - value) <= Math.abs(value) * .003) return;
    g.aim.set(param, value); if (k > 0) param.setTargetAtTime(value, at, k); else param.setValueAtTime(value, at);
  };
  const L = g.layers, blow = clamp((s.wind - .18) / .82, 0, 1), sea = Math.max(blow, s.storm), deep = smoothstep(s.depth, 2, 50), pace = clamp(s.speed / 8.8, 0, 1);
  const gust = Math.sin(at * .53 + 1.7 * Math.sin(at * .19)), swell = .5 + .5 * Math.sin(at * (.86 - .2 * sea) + 1.3 * Math.sin(at * .23)), lapping = .5 + .5 * Math.sin(at * 5.1 + 2 * Math.sin(at * .7));
  set(g.windBP.frequency, (360 + 520 * blow) * (1 + .15 * gust));
  set(L.wind.gain, LEVEL.wind * (.23 + .5 * blow ** 1.3 + .08 * s.storm) * (1 + (.2 + .2 * blow) * gust));
  set(g.waveLP.frequency, (1500 + 1300 * sea) * (.7 + .6 * swell));
  set(L.wave.gain, LEVEL.wave * (.6 + .2 * sea) * (.3 + .7 * swell * (.55 + .45 * lapping)));
  set(g.rainBP.frequency, 1700 + 1500 * s.rain);
  set(L.rain.gain, LEVEL.rain * s.rain ** .9 * (1 - .2 * s.rain));
  set(L.patter.gain, LEVEL.patter * Math.sqrt(s.rain) * (1 - .45 * s.rain));
  // Below the surface the weather is a muffled ceiling that fades with depth.
  set(g.airLP.frequency, 600 * (g.open / 600) ** (1 - s.under));
  set(g.air.gain, 1 - s.under + s.under * .5 * Math.exp(-s.depth / 14));
  set(g.water.gain, s.under);
  set(g.duck.frequency, s.open ? DUCK.cutoff : g.open, .2);
  set(g.bus.gain, s.open ? DUCK.gain : 1, .2);
  // Above the water the underwater layers cannot be heard, so they are left where they are.
  if (s.under < .002) return;
  set(g.waterLP.frequency, lerp(5200, 1300, deep));
  set(g.droneBP.frequency, lerp(260, 140, deep) * (1 + .16 * Math.sin(at * .11 + 2 * Math.sin(at * .037))));
  set(L.drone.gain, LEVEL.drone * (1 - .2 * deep) * (.85 + .15 * Math.sin(at * .071 + 1)));
  set(L.tone.gain, LEVEL.tone * (.45 + .55 * deep) * (.6 + .4 * Math.sin(at * .09)));
  set(g.humB.detune, 8 * Math.sin(at * .05));
  set(g.rushBP.frequency, 320 + 520 * pace);
  set(L.rush.gain, LEVEL.rush * pace ** 1.2);
  set(g.motorTone.frequency, (96 + 34 * s.scooter) * (1 + (s.scooter ? .012 * Math.sin(at * 9.1) : 0)));
  set(g.motorLP.frequency, 320 + 380 * s.scooter);
  set(L.motor.gain, LEVEL.motor * s.scooter ** 1.2);
}
// Breathing is written ahead of the clock, one whole cycle at a time: a narrow
// hiss that rises as the valve opens, a pause, then a lower, wider exhale whose
// bubbles leave in a burst and thin out.
function breathe(g, scooter, until) {
  const f = g.breathBP.frequency, q = g.breathBP.Q, a = g.layers.breath.gain, b = g.layers.bubbles.gain;
  while (g.breathAt < until) {
    const t = g.breathAt, length = BREATH.cycle * lerp(1, BREATH.scooter, scooter) * (.95 + .1 * Math.random());
    const inEnd = t + length * BREATH.inhale, out = inEnd + length * BREATH.hold, outEnd = out + length * BREATH.exhale;
    f.setValueAtTime(1250, t); f.linearRampToValueAtTime(1900, inEnd); q.setValueAtTime(1.6, t);
    a.setTargetAtTime(LEVEL.breath, t, .16); a.setTargetAtTime(0, inEnd - .3, .1);
    f.setValueAtTime(560, out); f.linearRampToValueAtTime(400, outEnd); q.setValueAtTime(.9, out);
    a.setTargetAtTime(LEVEL.breath * .8, out, .07); a.setTargetAtTime(LEVEL.breath * .3, out + .45, .5); a.setTargetAtTime(0, outEnd - .35, .12);
    g.bubbleLoop.playbackRate.setValueAtTime(.86 + .3 * Math.random(), out);
    b.setTargetAtTime(LEVEL.bubbles, out + .04, .05); b.setTargetAtTime(LEVEL.bubbles * .3, out + .5, .55); b.setTargetAtTime(0, outEnd - .1, .22);
    g.breathAt = t + length;
  }
}
// Event envelopes are chains of exponential approaches: each starts from wherever the parameter is, so one
// event landing on another never steps.
// Thunder: a slow swell, three rolls, a long tail, and a filter that closes as it travels.
function thunder(g, at, power = 1) {
  const a = g.layers.thunder.gain, f = g.thunderLP.frequency, peak = LEVEL.thunder * (.5 + .5 * power), rise = THUNDER.attack;
  let t = at + rise, level = peak;
  a.cancelScheduledValues(at); f.cancelScheduledValues(at);
  f.setTargetAtTime(420 + 280 * Math.random(), at, .05); f.setTargetAtTime(150, at + rise, .9); f.setTargetAtTime(85, at + 3, 1.5);
  a.setTargetAtTime(peak * .4, at, rise * .4); a.setTargetAtTime(peak, at + rise * .5, rise * .25);
  for (let roll = 0; roll < 3; roll++) { t += .45 + .5 * Math.random(); level *= .5 + .35 * Math.random(); a.setTargetAtTime(level * (roll === 1 ? 1.4 : 1), t, .16); }
  a.setTargetAtTime(0, t + .4, (at + THUNDER.tail - t) / 4);
}
// Crossing the surface: going under, a burst whose low-pass sweeps shut; coming up, a softer one that opens.
function splash(g, at, under = true) {
  const a = g.layers.splash.gain, f = g.splashLP.frequency;
  a.cancelScheduledValues(at); f.cancelScheduledValues(at);
  if (under) { f.setTargetAtTime(6500, at, .01); f.setTargetAtTime(260, at + .05, .3); a.setTargetAtTime(LEVEL.splash, at, .025); a.setTargetAtTime(0, at + .09, .38); }
  else { f.setTargetAtTime(500, at, .01); f.setTargetAtTime(5200, at + .05, .22); a.setTargetAtTime(LEVEL.splash * .6, at, .12); a.setTargetAtTime(0, at + .35, .45); }
}
// Cues and calls are baked buffers: one short-lived source each, freed when it ends.
function play(g, name, to = g.master, rate = 1, at = 0) {
  if (!g.buffers[name]) return;
  const node = g.ctx.createBufferSource(); node.buffer = g.buffers[name]; node.playbackRate.value = rate;
  node.connect(to); node.onended = () => node.disconnect(); node.start(at);
}

// 4. The live engine.
const $ = selector => document.querySelector(selector), calm = matchMedia('(prefers-reduced-motion: reduce)'), panel = $('#landmark-dialog');
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click'], scene = { under: 0, depth: 0, wind: .18, rain: 0, storm: 0, speed: 0, scooter: 0, open: false };
let enabled = read('ocean-sound') === 'on', volume = clamp(Number(read('ocean-sound-volume') ?? .7) || 0, 0, 1);
let ctx = null, graph = null, timer = 0, sleeping = 0, armed = false, held = false, primed = false, steered = false;
let below = false, wasOpen = false, found = 0, tourStop = -1, thunderAt = 0, thunderPower = 1, whaleAt = 0;

function tick() {
  // A context the browser interrupted needs a gesture to come back.
  if (ctx.state !== 'running') { halt(); start(); paint(); return; }
  const state = window.oceanDiagnostics, nav = window.oceanControls?.nav, now = ctx.currentTime, y = state?.position ? state.position[1] : 2.5, diving = nav && nav.mode !== 'surface';
  scene.under = smoothstep(-y, -.12, 1.2); scene.depth = Math.max(0, -y);
  scene.wind = intensity.wind; scene.rain = intensity.rain; scene.storm = intensity.storm;
  scene.speed = diving ? nav.speed : 0; scene.scooter = diving ? nav.scooter : 0; scene.open = Boolean(panel?.open);
  steer(graph, scene, now, steered ? GLIDE : 0); steered = true;
  if (scene.under > .02) { if (graph.breathAt < now) graph.breathAt = now + 1; breathe(graph, scene.scooter, now + 1.5); }
  // Reduced motion keeps the beds and the breathing but drops thunder and the plunge.
  const sudden = primed && !calm.matches, under = scene.under > .5, stop = state?.tour?.status === 'dwell' ? state.tour.arrived : -1, count = state?.journey?.found.length ?? 0;
  if (under !== below) { below = under; if (sudden) splash(graph, now + .02, under); }
  if (thunderAt && now >= thunderAt) { if (sudden) thunder(graph, now + .05, thunderPower); thunderAt = 0; }
  if (scene.open !== wasOpen) { wasOpen = scene.open; if (primed) play(graph, wasOpen ? 'open' : 'close'); }
  // A tour stop announces itself; the discovery it brings with it stays quiet.
  if (stop !== tourStop) { tourStop = stop; if (primed && stop >= 0) { play(graph, 'arrive'); found = count; } }
  if (count !== found) { if (primed && count > found) play(graph, 'chime'); found = count; }
  if (scene.under > .9 && scene.depth > WHALE.below && !scene.open) {
    if (!whaleAt) whaleAt = now + span(WHALE.first);
    else if (now >= whaleAt) { play(graph, Math.random() < .5 ? 'whaleA' : 'whaleB', graph.waterLP, .82 + .36 * Math.random()); whaleAt = now + span(WHALE.gap); }
  }
  primed = true;
}
function arm() { if (!armed) { armed = true; for (const type of GESTURES) addEventListener(type, gesture, true); } }
function disarm() { if (armed) { armed = false; for (const type of GESTURES) removeEventListener(type, gesture, true); } }
function gesture() { start(true); }
// Browsers only let sound begin from a visitor's gesture. Until one arrives nothing is created; if the context is refused it waits for the next.
function start(fromGesture = false) {
  if (!enabled || document.hidden || held) return;
  if (!graph) {
    if (!(navigator.userActivation ? navigator.userActivation.hasBeenActive : fromGesture)) { arm(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' }); graph = build(ctx); }
    catch { try { ctx?.close().catch(() => {}); } catch {} ctx = graph = null; return; }
    drawLater();
  }
  clearTimeout(sleeping);
  if (ctx.state === 'running') { run(); return; }
  arm();
  try { ctx.resume().then(run, () => {}); } catch {}
}
// The buffers bake() left for later are drawn one per idle moment, so the click that turns the sound on stays quick.
function drawLater() {
  const next = () => { if (graph?.draw()) drawLater(); };
  if (window.requestIdleCallback) requestIdleCallback(next, { timeout: 600 }); else setTimeout(next, 60);
}
function run() {
  if (!enabled || document.hidden || held || ctx.state !== 'running') return;
  disarm(); clearTimeout(sleeping);
  graph.master.gain.setTargetAtTime(MASTER * loudness(volume), ctx.currentTime, FADE.in);
  if (!timer) { primed = false; timer = onTick(tick, 1000 / TICK); tick(); }
  paint();
}
function halt() { if (timer) timer(); timer = 0; }
// Fade out, leave the interface clock, then let the context sleep: nothing runs while the sound is off, hidden or paused.
function rest() {
  halt(); disarm();
  if (!graph) return;
  graph.master.gain.setTargetAtTime(0, ctx.currentTime, FADE.out);
  clearTimeout(sleeping); sleeping = setTimeout(() => { if (ctx.state === 'running') ctx.suspend().catch(() => {}); }, FADE.out * 6000);
}
function turn(on, fromGesture = false) {
  enabled = Boolean(on); write('ocean-sound', enabled ? 'on' : 'off');
  if (enabled) start(fromGesture); else rest();
  paint(); return enabled;
}
function setVolume(value) {
  volume = clamp(Number(value) || 0, 0, 1); write('ocean-sound-volume', String(volume));
  if (timer) graph.master.gain.setTargetAtTime(MASTER * loudness(volume), ctx.currentTime, .05);
  paint();
}
document.addEventListener('visibilitychange', () => { if (!enabled) return; if (document.hidden) rest(); else start(); });
// "Pause motion" pauses the sound with it. A scene that starts paused because of reduced motion does not: that visitor still chose to hear it.
$('#motion')?.addEventListener('click', () => setTimeout(() => { held = Boolean(window.oceanDiagnostics?.paused); if (enabled) { if (held) rest(); else start(true); } paint(); }));
calm.addEventListener('change', () => { held = false; if (enabled) start(); });
addEventListener('oceanlightning', event => { if (timer && !calm.matches) { thunderAt = ctx.currentTime + span(THUNDER.delay); thunderPower = (event.detail?.power ?? 1) * intensity.storm; } });
addEventListener('oceanlamp', () => { if (timer) play(graph, 'lamp'); });

// 5. General settings: ambient sound and its level sit with the sky controls.
const group = document.createElement('section');
group.className = 'settings-subgroup'; group.id = 'sound-settings'; group.setAttribute('aria-labelledby', 'settings-sound-title');
group.innerHTML = '<h3 id="settings-sound-title" class="holo-label">Sound</h3>'
  + '<label class="holo-switch"><input id="sound-switch" type="checkbox" role="switch"><i aria-hidden="true"></i><span>Ambient sound</span><small>Water, weather and breathing</small></label>'
  + '<div class="movement-field sound-volume"><label for="sound-volume">Volume</label><output class="movement-output" for="sound-volume"></output><input id="sound-volume" type="range" min="0" max="100" step="1"></div>';
const toggle = group.querySelector('#sound-switch'), slider = group.querySelector('#sound-volume'), reading = group.querySelector('output');
function paint() {
  toggle.checked = enabled; slider.value = String(Math.round(volume * 100)); reading.textContent = `${Math.round(volume * 100)}%`;
}
toggle.addEventListener('change', () => turn(toggle.checked, true));
slider.addEventListener('input', () => setVolume(slider.value / 100));
$('#settings-general-content')?.append(group);
paint();
if (enabled) start();

// One quiet hint, once, the first time the visitor dives with the sound off. The tour has its own card, so it waits for a free dive.
function hint() {
  if (document.body.dataset.submerged !== 'true' || ['starting', 'travel', 'dwell'].includes(document.body.dataset.tour)) return;
  if (!enabled && read('ocean-sound-hint') !== '1') window.oceanJourney?.say?.('Ambient sound', 'Sound is off · turn it on in the menu', '#8ff4ff', 4200);
  write('ocean-sound-hint', '1'); removeEventListener('oceanmediumchange', hint);
}
if (read('ocean-sound-hint') !== '1') addEventListener('oceanmediumchange', hint);

// QA hooks. render(): the same graph offline for a scene state (an object, or a function of time for a whole dive),
// optionally only the named layer or layers and with events ([name, time, value]), so levels and clicks can be
// measured without listening; whole: false builds the graph the way the enabling click does, leaving the deferred
// buffers undrawn, so that click's cost can be timed. probe(): an analyser on the live output.
function render(seconds = 6, state = {}, { solo = null, events = [], rate = 44100, level = volume, whole = true } = {}) {
  const offline = new OfflineAudioContext(2, Math.round(seconds * rate), rate), g = build(offline, whole), still = { under: 0, depth: 0, wind: .18, rain: 0, storm: 0, speed: 0, scooter: 0, open: false };
  g.master.gain.value = MASTER * loudness(level); g.breathAt = .3;
  if (solo) for (const [name, node] of Object.entries(g.layers)) if (![solo].flat().includes(name)) node.disconnect();
  for (let t = 0; t < seconds; t += TICK / 1000) {
    const s = { ...still, ...(typeof state === 'function' ? state(t) : state) };
    steer(g, s, t, t ? GLIDE : 0);
    if (s.under > .02) { if (g.breathAt < t) g.breathAt = t + 1; breathe(g, s.scooter, t + 1.5); }
  }
  for (const [name, at = .5, value] of events) {
    if (name === 'thunder') thunder(g, at, value ?? 1); else if (name === 'splash') splash(g, at, value ?? true);
    else play(g, name, name.startsWith('whale') ? g.waterLP : g.master, 1, at);
  }
  return offline.startRendering();
}
let analyser = null;
function probe() { if (graph && !analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 4096; graph.limiter.connect(analyser); } return analyser; }

window.oceanAudio = {
  get enabled() { return enabled; }, enable() { return turn(true); }, disable() { return turn(false); }, toggle() { return turn(!enabled); },
  get volume() { return volume; }, set volume(value) { setVolume(value); },
  /** Context state and the gain every layer and bus is at right now. */
  status() {
    const round = value => Math.round(value * 10000) / 10000, layers = {};
    if (graph) for (const [name, node] of Object.entries(graph.layers)) layers[name] = round(node.gain.value);
    return { enabled, volume, context: ctx?.state ?? 'none', running: Boolean(timer), waiting: armed, paused: held, reducedMotion: calm.matches, nodes: graph?.count ?? 0, tick: TICK,
      master: graph ? round(graph.master.gain.value) : 0, air: graph ? round(graph.air.gain.value) : 0, water: graph ? round(graph.water.gain.value) : 0, mix: graph ? round(graph.bus.gain.value) : 0,
      airCutoff: graph ? Math.round(graph.airLP.frequency.value) : 0, waterCutoff: graph ? Math.round(graph.waterLP.frequency.value) : 0, mixCutoff: graph ? Math.round(graph.duck.frequency.value) : 0,
      limiting: graph ? round(graph.limiter.reduction) : 0, layers, scene: { ...scene } };
  },
  render, probe
};
