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
// cues, calls and reef fish to a peak of 1 before their level). BREATH:
// seconds per resting cycle, how much shorter it gets at full effort, the
// share of a cycle spent inhaling, holding and exhaling, and how often a
// breath is shallow, deep or followed by a pause (and how long that pause is).
// THUNDER: seconds from the flash to the rumble, its soft attack and its tail.
// WHALE: seconds before the first far call and between calls, and the depth
// they need. SURF: seconds between waves breaking near the surface. FISH:
// seconds between grunts and bites on the reef, and the depth they start at.
// CALLS: the passing animals that are heard, keyed by encounter id: how far
// they carry (m), the distance within which they are at full level, their level,
// and for each kind of call the buffers it picks from and the seconds between.
// DUCK: the mix while the records are open. FADE: time constants of the
// master fade. TICK: milliseconds between parameter updates; GLIDE: how long
// each update takes to land; LOW: sample rate of the buffers that hold
// nothing above a few kilohertz.
const MASTER = 1.25;
const LEVEL = { wind: .4, wave: .9, rain: .3, patter: .16, thunder: .26, drone: .14, tone: .012, rush: .4, motor: .02, inhale: .36, exhale: .2, valve: .03, bubbles: .07, splash: .42, cue: .042, whale: .024,
  surge: .5, fish: .05, wash: .45, fizz: .1 };
const BREATH = { cycle: 6, effort: .7, inhale: .3, hold: .06, exhale: .44, shallow: .12, deep: .14, pause: [.18, .8, 3] };
const THUNDER = { delay: [.7, 2.8], attack: .45, tail: 6.5 };
const WHALE = { first: [25, 60], gap: [65, 130], below: 12 };
const SURF = { gap: [3.5, 9] }, FISH = { gap: [5, 16], below: 2.5 };
const CALLS = {
  whale: { range: 130, near: 35, level: .08, calls: [[['upcall', 'moan', 'groan'], [6, 14], ['whale0', 'whale1']]] },
  orcas: { range: 100, near: 22, level: .09, calls: [[['orcaA', 'orcaB'], [2.5, 7]], [['clicksB'], [5, 11], ['clicks0', 'clicks1']]] },
  dolphins: { range: 70, near: 12, level: .1, calls: [[['clicksA', 'clicksB'], [.8, 3], ['clicks0', 'clicks1']], [['whistleA', 'whistleB', 'whistleC'], [1.8, 5.5], ['whistleA', 'whistleB', 'whistleC', 'chitter']]] }
};
// RECORDED: real recordings, cut by tools/prepare-audio.mjs into assets/audio/clips/ (their sources and licence are in
// assets/audio/CREDITS.md): whole breath cycles from a dive, a sea bed under the water, dolphin clicks and chatter,
// whale calls and thunder. A call kind in CALLS lists, third, the recordings it uses instead of its synthesised calls.
// Each recording takes over from its synthesised counterpart once it has loaded; until then, or if it cannot load, the
// synthesis plays. breaths: how many cycles there are; level: their gains on the mix; lap: seconds two breaths overlap.
const RECORDED = { breaths: 7, level: { breath: .05, sea: .14, thunder: .18, far: .03 }, lap: .12 };
const CLIPS = [...Array.from({ length: RECORDED.breaths }, (_, i) => `breath${i}`), 'clicks0', 'clicks1', 'chitter', 'whale0', 'whale1', 'thunder0', 'thunder1', 'sea'];
const DUCK = { gain: .35, cutoff: 700 };
const FADE = { in: .3, out: .07 };
const TICK = 100, GLIDE = .12, LOW = 24000;

const { PI } = Math, TAU = PI * 2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value)), lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (x, low, high) => { const t = clamp((x - low) / (high - low), 0, 1); return t * t * (3 - 2 * t); };
const span = ([low, high]) => low + Math.random() * (high - low), pick = list => list[Math.random() * list.length | 0];
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
  const call = (f0, lift, fall, seconds, peak = LEVEL.whale) => {
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
    return top(buffer, peak);
  };
  // A tone whose pitch follows contour(x) over x in 0..1, drawn block by block like the calls, with harmonics weighted by
  // `partials` (the first is the fundamental): a dolphin's whistle is nearly pure, an orca's pulsed call is a buzz of them.
  const sweep = (seconds, contour, partials, shape = .6) => {
    const buffer = make(seconds + .05, 1), data = buffer.getChannelData(0), n = seconds * rate | 0, block = 16;
    for (let i = 0, c = 1, s = 0; i < n; i += block) {
      const x = i / n, turn = TAU * contour(x) / rate, rc = Math.cos(turn), rs = Math.sin(turn), level = Math.sin(PI * x) ** shape;
      for (let j = i, end = Math.min(n, i + block); j < end; j++) {
        const turned = c * rc - s * rs; s = s * rc + c * rs; c = turned;
        let value = 0;
        for (let k = 0, hs = s, hc = c; k < partials.length; k++) { value += partials[k] * hs; const next = hc * c - hs * s; hs = hs * c + hc * s; hc = next; }
        data[j] = value * level;
      }
    }
    return top(buffer, 1);
  };
  // A dolphin's echolocation: a train of sharp ticks, each a couple of cycles long, whose spacing goes from `from` to `to`
  // seconds; a train that tightens becomes the creaking buzz of a dolphin closing on something.
  const clicks = (count, from, to) => {
    const buffer = make(2.2, 1);
    for (let i = 0, at = .02; i < count && at < 2; i++) {
      const x = i / count, f = 4500 + 4500 * Math.random();
      ring(buffer, at * rate | 0, f, f * .8, .00045, (.45 + .55 * Math.sin(PI * Math.min(1, x * 1.4))) * (.6 + .4 * Math.random()));
      at += from * (to / from) ** x;
    }
    return top(buffer, 1);
  };
  // Reef life. A fish grunt is a short train of low knocks; a parrotfish bite is a few dry crunches of coral.
  const grunt = (f, pulses, gap) => {
    const buffer = make(1, 1, LOW);
    for (let i = 0; i < pulses; i++) ring(buffer, (.02 + i * gap * (.85 + .3 * Math.random())) * LOW | 0, f * (1 + .08 * Math.random()), f * .85, .011, 1 - .5 * i / pulses);
    return top(buffer, LEVEL.fish);
  };
  const crunch = () => {
    const buffer = make(.7, 1), data = buffer.getChannelData(0), grain = rate * .014 | 0;
    for (let k = 0, bites = 3 + Math.random() * 3 | 0; k < bites; k++) {
      const at = (.02 + k * (.06 + .05 * Math.random())) * rate | 0, gain = .5 + .5 * Math.random();
      for (let i = 0, y = 0, level = gain; i < grain; i++, level *= .9993) { y += .3 * (Math.random() * 2 - 1 - y); data[at + i] += (Math.random() < .3 ? y : y * .2) * level; }
    }
    return top(buffer, LEVEL.fish * .7);
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
    // A big animal in sight: two low, slow notes, a rising fifth, softer than the discovery chime, and their echo.
    sighting: cue(3, [[0, 392, .55, .75], [.38, 587.3, .7, .7], [1.05, 587.3, .6, .16]]),
    lamp: cue(.3, [[0, 1900, .006, .5], [0, 240, .022, .8]]),
    // The demand valve cracking open at the start of a breath: a dry tick and the faintest whistle.
    valve: (() => { const buffer = make(.08, 1), data = buffer.getChannelData(0); ring(buffer, 0, 3300, 3000, .01, .35); for (let i = 0, level = 1; i < rate * .006; i++, level *= .996) data[i] += (Math.random() * 2 - 1) * level; return top(buffer, LEVEL.valve); })() };
  const jobs = [['bubbles', stream], ['patter', rainfall], ['whaleA', () => call(170, .85, .35, 3.2)], ['whaleB', () => call(240, .25, 1, 3.8)],
    ['gruntA', () => grunt(130, 6, .07)], ['gruntB', () => grunt(190, 3, .11)], ['crunch', crunch],
    // A right whale's rising "up-call", a long moan and a low groan, each with the echoes of the far calls.
    ['upcall', () => call(72, 0, -1.3, 1.4, 1)], ['moan', () => call(105, .45, .7, 3.2, 1)], ['groan', () => call(58, .2, .4, 2.2, 1)],
    ['orcaA', () => sweep(1.2, x => 1050 * (1 + .12 * Math.sin(PI * x)) * (1 + .6 * smoothstep(x, .74, .84)), [1, .7, .55, .4, .3, .2, .12], .4)],
    ['orcaB', () => sweep(1.5, x => 760 * (1 + .25 * x) * (1 + .35 * smoothstep(x, .8, .9)), [1, .8, .6, .5, .35, .25, .15, .1], .4)],
    ['clicksA', () => clicks(46, .075, .009)], ['clicksB', () => clicks(26, .05, .04)],
    ['whistleA', () => sweep(.7, x => 5200 + 7000 * x ** 1.6, [1, .18])], ['whistleB', () => sweep(1.1, x => 8000 + 2400 * Math.sin(TAU * 1.5 * x) - 1500 * x, [1, .15])],
    ['whistleC', () => sweep(.6, x => 11000 - 5000 * Math.sin(PI * x), [1, .12])]];
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

  // The regulator is in the diver's mouth: it stays in the middle and is not darkened by the water in between. Inhaling
  // is a hiss through two narrow resonances, roughened by the slow noise so no two breaths have quite the same grain;
  // exhaling is a low gurgle shaken by the exhaust valve's flutter, with the bubbles leaving around it.
  const reg = gain(1), inA = filter('bandpass', 1150, 3), inB = filter('bandpass', 2700, 4), inBLevel = gain(.55), rough = gain(1), roughness = gain(1.6), inhale = gain();
  const exLP = filter('lowpass', 700, 4), flutter = gain(1), flutterOsc = tone('sine', 20), flutterDepth = gain(.65), exhale = gain(), bubbles = gain();
  for (const node of [inA, inB, exLP]) { node.channelCount = 1; node.channelCountMode = 'explicit'; }
  wire(white, inA, rough); wire(white, inB, inBLevel, rough); wire(rough, inhale, reg); wire(brownA, roughness, rough.gain);
  wire(white, exLP, flutter, exhale, reg); wire(flutterOsc, flutterDepth, flutter.gain); wire(bubbleLoop, bubbles, reg); wire(reg, water);
  // The recordings: breaths into the regulator, the sea bed and far whales through the water, thunder through the air.
  const breaths = gain(1), seaLoop = later(), sea = gain(), far = gain(RECORDED.level.far), peal = gain();
  wire(breaths, reg); wire(seaLoop, sea, waterLP); wire(far, waterLP); wire(peal, airLP);
  const splashLP = filter('lowpass', 6000, -3), splash = gain();
  wire(white, splashLP, splash, bus);

  // The sea around the diver. Near the surface the swell pushes water back and forth across the reef. Above the water,
  // waves break with a wash and the fizz of their foam.
  const surgeLP = filter('lowpass', 380, 1), surge = gain();
  const washBP = filter('bandpass', 600, .6), wash = gain(), fizzHP = filter('highpass', 3500), fizz = gain();
  wire(white, surgeLP, surge, waterLP); wire(white, washBP, wash, airLP); wire(white, fizzHP, fizz, airLP);

  // Passing animals: one voice for each group, its distance a low-pass and a level, its bearing a pan. The voices skip the
  // water's low-pass: a dolphin's whistle carries far in the sea, and the distance filter already darkens what is far.
  const voices = {};
  for (const id of Object.keys(CALLS)) {
    const input = gain(1), lp = filter('lowpass', 14000, -3), pan = made(ctx.createStereoPanner()), level = gain();
    wire(input, lp, pan, level, water); voices[id] = { input, lp, pan, level, near: 0, next: CALLS[id].calls.map(() => 0) };
  }

  // draw(): the next deferred buffer; true while more are waiting.
  const loops = { patter: patterLoop, bubbles: bubbleLoop };
  const draw = () => {
    const job = jobs.shift();
    if (!job) return false;
    const buffer = buffers[job[0]] = job[1](), node = loops[job[0]];
    if (node) { node.buffer = buffer; node.start(0, Math.random() * buffer.duration); }
    return jobs.length > 0;
  };
  if (whole) while (draw());
  return { ctx, buffers, draw, open, count, limiter, master, bus, duck, airLP, air, waterLP, water, windBP, waveLP, rainBP, thunderLP, droneBP, humB, rushBP, motorTone, motorLP,
    reg, inA, inB, exLP, flutterOsc, bubbleLoop, splashLP, surgeLP, washBP, voices, seaLoop, far, recorded: [],
    layers: { wind, wave, rain, patter, thunder, drone, tone: hum, rush, motor, inhale, exhale, bubbles, splash, surge, wash, fizz, breaths, sea, peal, ...Object.fromEntries(Object.entries(voices).map(([id, voice]) => [id, voice.level])) },
    aim: new Map(), breathAt: 0, pace: 1 };
}

// 2b. The recordings, fetched and decoded after the click that turned the sound on (the offline render waits for them).
// The sea bed is folded into a seamless loop and started as it arrives; one that cannot be fetched or decoded is left out.
function record(g) {
  return Promise.all(CLIPS.map(name => fetch(`assets/audio/clips/${name}.mp3`)
    .then(response => { if (!response.ok) throw Error(response.status); return response.arrayBuffer(); })
    .then(data => g.ctx.decodeAudioData(data))
    .then(buffer => {
      if (name === 'sea') { g.seaLoop.buffer = seamless(g.ctx, buffer); g.seaLoop.start(0, Math.random() * g.seaLoop.buffer.duration); }
      else g.buffers[name] = buffer;
      g.recorded.push(name);
    }).catch(() => {})));
}
// A loop whose end runs into its start: its last `lap` seconds are faded in under its first, so the seam cannot be heard.
function seamless(ctx, buffer, lap = 1) {
  const n = Math.round(lap * buffer.sampleRate), length = buffer.length - n, out = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const from = buffer.getChannelData(c), to = out.getChannelData(c);
    to.set(from.subarray(0, length));
    for (let i = 0; i < n; i++) to[i] = from[i] * Math.sin(i / n * PI / 2) + from[length + i] * Math.cos(i / n * PI / 2);
  }
  return out;
}
const has = (g, name) => g.recorded.includes(name);

// 3. Steering. Continuous parameters follow the scene: s is { under, depth,
// wind, rain, storm, speed, scooter, open, first, breathing }. Gusts, swell and the
// drone's drift are slow sines evaluated here rather than extra oscillators in
// the graph.
const roughSea = s => Math.max(clamp((s.wind - .18) / .82, 0, 1), s.storm);
// aim(): move a parameter towards a value, skipping moves too small to hear.
function aim(g, param, value, at, k) {
  if (Math.abs(g.aim.get(param) - value) <= Math.abs(value) * .003) return;
  g.aim.set(param, value); if (k > 0) param.setTargetAtTime(value, at, k); else param.setValueAtTime(value, at);
}
function steer(g, s, at, glide = GLIDE) {
  const set = (param, value, k = glide) => aim(g, param, value, at, k);
  const L = g.layers, blow = clamp((s.wind - .18) / .82, 0, 1), sea = roughSea(s), deep = smoothstep(s.depth, 2, 50), pace = clamp(s.speed / 8.8, 0, 1);
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
  // Once the recorded sea is playing it carries the bed, and the synthesised drone only colours it.
  const recordedSea = has(g, 'sea');
  set(L.drone.gain, LEVEL.drone * (recordedSea ? .35 : 1) * (1 - .2 * deep) * (.85 + .15 * Math.sin(at * .071 + 1)));
  set(L.sea.gain, recordedSea ? RECORDED.level.sea * (1 - .3 * deep) : 0);
  set(L.tone.gain, LEVEL.tone * (.45 + .55 * deep) * (.6 + .4 * Math.sin(at * .09)));
  set(g.humB.detune, 8 * Math.sin(at * .05));
  set(g.rushBP.frequency, 320 + 520 * pace);
  set(L.rush.gain, LEVEL.rush * pace ** 1.2);
  set(g.motorTone.frequency, (96 + 34 * s.scooter) * (1 + (s.scooter ? .012 * Math.sin(at * 9.1) : 0)));
  set(g.motorLP.frequency, 320 + 380 * s.scooter);
  set(L.motor.gain, LEVEL.motor * s.scooter ** 1.2);
  // Seen from behind, the diver's regulator is a little further off; the visitor sets its level of their own as well.
  set(g.reg.gain, (s.first ? 1 : .72) * loudness(s.breathing));
  const shallow = 1 - smoothstep(s.depth, 3, 18);
  set(g.surgeLP.frequency, 220 + 380 * swell);
  set(L.surge.gain, LEVEL.surge * shallow * (.6 + .4 * sea) * (.08 + .92 * swell * swell));
}
// Breathing is written ahead of the clock, one whole cycle at a time, and no
// two cycles are the same. The resting pace wanders; effort (finning hard)
// quickens and deepens it. A breath may be shallow or deep, and a pause may
// follow it. Each inhale opens with the valve's tick, swells and tapers; each
// exhale bursts, flutters, and leaves its bubbles trailing after it.
function breathe(g, effort, until) {
  if (CLIPS.some(name => name.startsWith('breath') && has(g, name))) return breatheRecorded(g, effort, until);
  const r = Math.random, a = g.layers.inhale.gain, x = g.layers.exhale.gain, b = g.layers.bubbles.gain;
  while (g.breathAt < until) {
    const t = g.breathAt; g.pace = clamp(g.pace + (r() - .5) * .12, .85, 1.2);
    const shallow = r() < BREATH.shallow, deep = !shallow && r() < BREATH.deep, size = (shallow ? .55 : deep ? 1.15 : .78 + .22 * r()) * lerp(1, 1.2, effort);
    const length = BREATH.cycle * g.pace * lerp(1, BREATH.effort, effort) * (shallow ? .7 : deep ? 1.2 : .88 + .24 * r()), pitch = .9 + .2 * r();
    const inEnd = t + length * BREATH.inhale * (.85 + .3 * r()), out = inEnd + length * BREATH.hold * 2 * r(), outEnd = out + length * BREATH.exhale * (.85 + .3 * r());
    const pause = r() < BREATH.pause[0] * (1 - effort) ? span(BREATH.pause.slice(1)) : 0, inhale = inEnd - t, exhale = outEnd - out;
    if (r() < .85) play(g, 'valve', g.reg, .9 + .2 * r(), t);
    g.inA.frequency.setValueAtTime(1000 * pitch, t); g.inA.frequency.linearRampToValueAtTime(1350 * pitch, inEnd);
    g.inB.frequency.setValueAtTime(2400 * pitch, t); g.inB.frequency.linearRampToValueAtTime(3000 * pitch, inEnd);
    a.setTargetAtTime(LEVEL.inhale * size * .6, t, .04); a.setTargetAtTime(LEVEL.inhale * size, t + .12, inhale * .25);
    a.setTargetAtTime(LEVEL.inhale * size * .5, t + inhale * .65, inhale * .2); a.setTargetAtTime(0, inEnd - .1, .05);
    g.flutterOsc.frequency.setValueAtTime(15 + 11 * r(), out); g.flutterOsc.frequency.linearRampToValueAtTime((15 + 11 * r()) * .8, outEnd);
    g.exLP.frequency.setValueAtTime(820 * pitch, out); g.exLP.frequency.linearRampToValueAtTime(420 * pitch, outEnd);
    x.setTargetAtTime(LEVEL.exhale * size, out, .03); x.setTargetAtTime(LEVEL.exhale * size * .55, out + .3, exhale * .3); x.setTargetAtTime(0, outEnd - .2, .08);
    g.bubbleLoop.playbackRate.setValueAtTime(.8 + .4 * r(), out);
    b.setTargetAtTime(LEVEL.bubbles * size, out + .05, .05); b.setTargetAtTime(LEVEL.bubbles * size * .45, out + .45, .5);
    b.setTargetAtTime(LEVEL.bubbles * size * .2, outEnd, .2); b.setTargetAtTime(0, outEnd + .4, .35);
    g.breathAt = outEnd + .15 + .3 * r() + pause;
  }
}
// Recorded breathing: whole cycles from the dive recording follow one another in random order, never the same one twice
// running, each overlapping the last by RECORDED.lap seconds on an equal-power fade so the water under them runs on
// unbroken. Each is a little faster or slower and a little stronger or softer than recorded; finning hard quickens them.
const FADE_IN = Float32Array.from({ length: 32 }, (_, i) => Math.sin(i / 31 * PI / 2)), FADE_OUT = FADE_IN.slice().reverse();
function breatheRecorded(g, effort, until) {
  const cycles = CLIPS.filter(name => name.startsWith('breath') && has(g, name));
  while (g.breathAt < until) {
    const choices = cycles.length > 1 ? cycles.filter(name => name !== g.lastBreath) : cycles, name = g.lastBreath = pick(choices);
    const t = g.breathAt, rate = lerp(1, 1.18, effort) * (.95 + .1 * Math.random()), length = g.buffers[name].duration / rate, lap = RECORDED.lap;
    const level = RECORDED.level.breath * (Math.random() < BREATH.shallow ? .7 : .85 + .15 * Math.random()) * lerp(1, 1.15, effort);
    const node = g.ctx.createBufferSource(), envelope = g.ctx.createGain();
    node.buffer = g.buffers[name]; node.playbackRate.value = rate; node.connect(envelope).connect(g.layers.breaths);
    envelope.gain.setValueCurveAtTime(FADE_IN.map(v => v * level), t, lap); envelope.gain.setValueCurveAtTime(FADE_OUT.map(v => v * level), t + length - lap, lap);
    node.onended = () => { node.disconnect(); envelope.disconnect(); }; node.start(t); node.stop(t + length);
    g.breathAt = t + length - lap;
  }
}
// Event envelopes are chains of exponential approaches: each starts from wherever the parameter is, so one
// event landing on another never steps.
// Thunder: a slow swell, three rolls, a long tail, and a filter that closes as it travels.
function thunder(g, at, power = 1) {
  // A recorded clap, a little higher or lower each time, when one has loaded.
  const claps = ['thunder0', 'thunder1'].filter(name => has(g, name));
  if (claps.length) { g.layers.peal.gain.setValueAtTime(RECORDED.level.thunder * (.5 + .5 * power), at); play(g, pick(claps), g.layers.peal, .85 + .25 * Math.random(), at); return; }
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
// A wave breaking nearby: a wash that swells and draws back, then the fizz of its foam settling.
function crest(g, at, power = 1) {
  const w = g.layers.wash.gain, f = g.washBP.frequency, z = g.layers.fizz.gain, peak = LEVEL.wash * (.45 + .55 * power) * (.8 + .4 * Math.random());
  w.cancelScheduledValues(at); f.cancelScheduledValues(at); z.cancelScheduledValues(at);
  f.setTargetAtTime(420, at, .05); f.setTargetAtTime(1200 + 700 * power, at + .2, .35); f.setTargetAtTime(550, at + 1.1, .6);
  w.setTargetAtTime(peak, at, .3); w.setTargetAtTime(0, at + .85, .55);
  z.setTargetAtTime(LEVEL.fizz * (.5 + .5 * power), at + .65, .12); z.setTargetAtTime(0, at + 1, .9);
}
// Cues and calls are baked buffers: one short-lived source each, freed when it ends; one placed somewhere gets a panner too.
function play(g, name, to = g.master, rate = 1, at = 0, pan = null) {
  if (!g.buffers[name]) return;
  const node = g.ctx.createBufferSource(), panner = pan === null ? null : g.ctx.createStereoPanner(); node.buffer = g.buffers[name]; node.playbackRate.value = rate;
  if (panner) { panner.pan.value = pan; node.connect(panner).connect(to); } else node.connect(to);
  node.onended = () => { node.disconnect(); panner?.disconnect(); }; node.start(at);
}
// Passing animals. Each group's voice follows its lead animal: louder and brighter as it comes near, a little darker
// behind the camera, panned to the side it is on. While one is in range it calls on its own schedule, each kind of
// call on its own clock; out of range, or with nothing to hear, the voice fades and the clocks start again.
// seen: { id: { x, y, z } } in world space; ear: the camera's world matrix elements (right is 0..2, back is 8..10).
function listen(g, at, seen, ear) {
  for (const [id, kind] of Object.entries(CALLS)) {
    const voice = g.voices[id], where = ear && seen[id];
    const dx = where ? where.x - ear[12] : 0, dy = where ? where.y - ear[13] : 0, dz = where ? where.z - ear[14] : 0, d = Math.hypot(dx, dy, dz) || 1;
    voice.near = where && d < kind.range ? kind.near / (kind.near + d) * 2 * (1 - smoothstep(d, kind.range * .7, kind.range)) : 0;
    if (!voice.near) { aim(g, voice.level.gain, 0, at, 1.2); voice.next.fill(0); continue; }
    const side = (dx * ear[0] + dy * ear[1] + dz * ear[2]) / d, behind = (dx * ear[8] + dy * ear[9] + dz * ear[10]) / d;
    aim(g, voice.pan.pan, clamp(side * .9, -.9, .9), at, .25);
    aim(g, voice.lp.frequency, lerp(16000, 2200, (d / kind.range) ** .7) * (behind > .3 ? .7 : 1), at, .3);
    aim(g, voice.level.gain, kind.level * Math.min(1, voice.near), at, .4);
    kind.calls.forEach(([names, gap, recorded = []], i) => {
      const heard = recorded.filter(name => g.buffers[name]);
      if (!voice.next[i]) voice.next[i] = at + span(gap) * .4;
      else if (at >= voice.next[i]) { play(g, pick(heard.length ? heard : names), voice.input, .92 + .16 * Math.random()); voice.next[i] = at + span(gap); }
    });
  }
}

// Effort: how hard the diver is finning. The scooter does the work for them.
const effortOf = s => clamp(s.speed / 8.8, 0, 1) * (1 - .5 * s.scooter);

// 4. The live engine.
const $ = selector => document.querySelector(selector), calm = matchMedia('(prefers-reduced-motion: reduce)'), panel = $('#landmark-dialog');
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click'], scene = { under: 0, depth: 0, wind: .18, rain: 0, storm: 0, speed: 0, scooter: 0, open: false, first: false, breathing: 1 };
// On unless the visitor turned it off; the browser still holds it back until their first click or key (start, arm).
let enabled = read('ocean-sound') !== 'off', volume = clamp(Number(read('ocean-sound-volume') ?? .7) || 0, 0, 1);
// The breathing's own level, on top of the volume: the whole regulator (inhale, valve, exhale and bubbles). Full unless set.
let breathing = clamp(Number(read('ocean-sound-breathing') ?? 1), 0, 1);
if (Number.isNaN(breathing)) breathing = 1;
let ctx = null, graph = null, timer = 0, sleeping = 0, armed = false, held = false, primed = false, steered = false;
let below = false, wasOpen = false, found = 0, tourStop = -1, thunderAt = 0, thunderPower = 1, whaleAt = 0, crestAt = 0, fishAt = 0;

function tick() {
  // A context the browser interrupted needs a gesture to come back.
  if (ctx.state !== 'running') { halt(); start(); paint(); return; }
  const state = window.oceanDiagnostics, nav = window.oceanControls?.nav, now = ctx.currentTime, y = state?.position ? state.position[1] : 2.5, diving = nav && nav.mode !== 'surface';
  scene.under = smoothstep(-y, -.12, 1.2); scene.depth = Math.max(0, -y);
  scene.wind = intensity.wind; scene.rain = intensity.rain; scene.storm = intensity.storm;
  scene.speed = diving ? nav.speed : 0; scene.scooter = diving ? nav.scooter : 0; scene.open = Boolean(panel?.open); scene.first = state?.cameraMode === 'first'; scene.breathing = breathing;
  steer(graph, scene, now, steered ? GLIDE : 0); steered = true;
  if (scene.under > .02) { if (graph.breathAt < now) graph.breathAt = now + 1; breathe(graph, effortOf(scene), now + 1.5); }
  // The animals are heard only underwater, and not while the records are open.
  const hearing = scene.under > .9 && !scene.open, ear = hearing ? window.oceanControls?.getCamera?.()?.matrixWorld.elements : null;
  listen(graph, now, ear ? Object.fromEntries((window.oceanControls.visitors?.() ?? []).map(item => [item.id, item])) : {}, ear);
  // Waves break at the surface, and are heard dimly just below it; reef fish grunt and bite out of sight.
  if (scene.depth < 6 && !scene.open) {
    if (!crestAt) crestAt = now + span(SURF.gap) * .5;
    else if (now >= crestAt) { const sea = roughSea(scene); crest(graph, now + .05, Math.max(.3, sea)); crestAt = now + span(SURF.gap) * (1 - .4 * sea); }
  } else crestAt = 0;
  if (hearing && scene.depth > FISH.below) {
    if (!fishAt) fishAt = now + span(FISH.gap);
    else if (now >= fishAt) { play(graph, pick(['gruntA', 'gruntB', 'gruntA', 'crunch']), graph.waterLP, .85 + .3 * Math.random(), 0, Math.random() * 1.6 - .8); fishAt = now + span(FISH.gap); }
  } else fishAt = 0;
  // Reduced motion keeps the beds and the breathing but drops thunder and the plunge.
  const sudden = primed && !calm.matches, under = scene.under > .5, stop = state?.tour?.status === 'dwell' ? state.tour.arrived : -1, count = state?.journey?.found.length ?? 0;
  if (under !== below) { below = under; if (sudden) splash(graph, now + .02, under); }
  if (thunderAt && now >= thunderAt) { if (sudden) thunder(graph, now + .05, thunderPower); thunderAt = 0; }
  if (scene.open !== wasOpen) { wasOpen = scene.open; if (primed) play(graph, wasOpen ? 'open' : 'close'); }
  // A tour stop announces itself; the discovery it brings with it stays quiet.
  if (stop !== tourStop) { tourStop = stop; if (primed && stop >= 0) { play(graph, 'arrive'); found = count; } }
  if (count !== found) { if (primed && count > found) play(graph, 'chime'); found = count; }
  // Far whales call now and then from out of sight, but keep quiet while one is passing.
  if (hearing && scene.depth > WHALE.below && !graph.voices.whale.near) {
    if (!whaleAt) whaleAt = now + span(WHALE.first);
    else if (now >= whaleAt) {
      // A recorded call, slowed and deepened by distance, when one has loaded.
      const far = ['whale0', 'whale1'].filter(name => has(graph, name));
      if (far.length) play(graph, pick(far), graph.far, .7 + .2 * Math.random()); else play(graph, Math.random() < .5 ? 'whaleA' : 'whaleB', graph.waterLP, .82 + .36 * Math.random());
      whaleAt = now + span(WHALE.gap);
    }
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
    drawLater(); record(graph);
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
  if(volume>0)lastAudibleVolume=volume;
  if (timer) graph.master.gain.setTargetAtTime(MASTER * loudness(volume), ctx.currentTime, .05);
  paint();
}
// The next steering tick carries the new breathing level into the graph.
function setBreathing(value) {
  breathing = clamp(Number(value) || 0, 0, 1); write('ocean-sound-breathing', String(breathing));
  paint();
}
document.addEventListener('visibilitychange', () => { if (!enabled) return; if (document.hidden) rest(); else start(); });
// "Pause motion" pauses the sound with it. A scene that starts paused because of reduced motion does not: that visitor still chose to hear it.
$('#motion')?.addEventListener('click', () => setTimeout(() => { held = Boolean(window.oceanDiagnostics?.paused); if (enabled) { if (held) rest(); else start(true); } paint(); }));
calm.addEventListener('change', () => { held = false; if (enabled) start(); });
addEventListener('oceanlightning', event => { if (timer && !calm.matches) { thunderAt = ctx.currentTime + span(THUNDER.delay); thunderPower = (event.detail?.power ?? 1) * intensity.storm; } });
addEventListener('oceanlamp', () => { if (timer) play(graph, 'lamp'); });
// The look-there marker found a big animal: the note leans a little towards the side it is on. One animal is marked at
// most once every SIGHTING seconds, however often the marker comes back to it.
const SIGHTING = 30, sighted = new Map();
addEventListener('oceansighting', ({ detail }) => {
  if (!timer || !primed || scene.open || ctx.currentTime < (sighted.get(detail.id) ?? -Infinity) + SIGHTING) return;
  sighted.set(detail.id, ctx.currentTime);
  const ear = window.oceanControls?.getCamera?.()?.matrixWorld.elements, dx = detail.x - (ear?.[12] ?? 0), dz = detail.z - (ear?.[14] ?? 0);
  const side = ear ? (dx * ear[0] + (detail.y - ear[13]) * ear[1] + dz * ear[2]) / (Math.hypot(dx, detail.y - ear[13], dz) || 1) : 0;
  play(graph, 'sighting', graph.master, 1, 0, clamp(side * .5, -.5, .5));
});

// 5. General settings: ambient sound and its level sit with the sky controls.
const group = document.createElement('section');
group.className = 'settings-subgroup'; group.id = 'sound-settings'; group.setAttribute('aria-labelledby', 'settings-sound-title');
group.innerHTML = '<div class="settings-inline-control"><h3 id="settings-sound-title" class="holo-label">Sound</h3><button id="sound-mute" class="time-cycle sound-mute" type="button" aria-label="Unmute ambient sound" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3l4-3.5v12l-4-3.5H4Z"/><g class="sound-on"><path d="M14.5 9.2a4 4 0 0 1 0 5.6M17 6.8a7.4 7.4 0 0 1 0 10.4"/></g><g class="sound-off"><path d="m15 9.5 5 5m0-5-5 5"/></g></svg></button></div>'
  + '<label class="holo-switch"><input id="sound-switch" type="checkbox" role="switch"><i aria-hidden="true"></i><span>Ambient sound</span><small>Sea, weather, breathing and wildlife</small></label>'
  + '<div class="movement-field sound-volume"><label for="sound-volume">Volume</label><output class="movement-output" for="sound-volume"></output><input id="sound-volume" type="range" min="0" max="100" step="1"></div>'
  + '<div class="movement-field sound-volume"><label for="sound-breathing">Breathing</label><output id="sound-breathing-output" class="movement-output" for="sound-breathing"></output><input id="sound-breathing" type="range" min="0" max="100" step="1"></div>';
const toggle = group.querySelector('#sound-switch'), slider = group.querySelector('#sound-volume'), reading = group.querySelector('output');
const breath = group.querySelector('#sound-breathing'), breathReading = group.querySelector('#sound-breathing-output');
const mute=group.querySelector('#sound-mute');let lastAudibleVolume=volume||.7;
function paint() {
  toggle.checked = enabled; slider.value = String(Math.round(volume * 100)); reading.textContent = `${Math.round(volume * 100)}%`;
  breath.value = String(Math.round(breathing * 100)); breathReading.textContent = `${Math.round(breathing * 100)}%`;
  const muted=!enabled||volume===0;
  mute.dataset.muted=String(muted);mute.setAttribute('aria-pressed',String(muted));
  mute.setAttribute('aria-label',muted?'Unmute ambient sound':'Mute ambient sound');mute.title=muted?'Click to unmute':'Click to mute';
}
toggle.addEventListener('change', () => turn(toggle.checked, true));
slider.addEventListener('input', () => setVolume(slider.value / 100));
breath.addEventListener('input', () => setBreathing(breath.value / 100));
mute.addEventListener('click',()=>{if(enabled&&volume>0)turn(false,true);else{if(volume===0)setVolume(lastAudibleVolume);turn(true,true);}});
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
// buffers undrawn, so that click's cost can be timed; recorded: false leaves the recordings out, to hear the synthesis
// they stand in for. probe(): an analyser on the live output.
async function render(seconds = 6, state = {}, { solo = null, events = [], rate = 44100, level = volume, whole = true, recorded = true } = {}) {
  const offline = new OfflineAudioContext(2, Math.round(seconds * rate), rate), g = build(offline, whole), still = { under: 0, depth: 0, wind: .18, rain: 0, storm: 0, speed: 0, scooter: 0, open: false, first: false, breathing: 1 };
  g.master.gain.value = MASTER * loudness(level); g.breathAt = .3;
  if (recorded) await record(g);
  if (solo) for (const [name, node] of Object.entries(g.layers)) if (![solo].flat().includes(name)) node.disconnect();
  // An animal call event's value is where its animal is, as [distance (m), side (-1 left to 1 right)]: the voice is set
  // there for the whole render and the call is played through it.
  const voiceOf = name => Object.keys(CALLS).find(id => CALLS[id].calls.some(([names, , heard = []]) => names.includes(name) || heard.includes(name)));
  for (const [name, , value] of events) {
    const id = voiceOf(name), voice = g.voices[id];
    if (!id) continue;
    const [d, side] = value ?? [CALLS[id].near, 0];
    voice.near = Math.min(1, 2 * CALLS[id].near / (CALLS[id].near + d)); voice.level.gain.value = CALLS[id].level * voice.near;
    voice.pan.pan.value = side * .9; voice.lp.frequency.value = lerp(16000, 2200, (d / CALLS[id].range) ** .7);
  }
  for (let t = 0; t < seconds; t += TICK / 1000) {
    const s = { ...still, ...(typeof state === 'function' ? state(t) : state) };
    steer(g, s, t, t ? GLIDE : 0);
    if (s.under > .02) { if (g.breathAt < t) g.breathAt = t + 1; breathe(g, effortOf(s), t + 1.5); }
  }
  for (const [name, at = .5, value] of events) {
    const id = voiceOf(name);
    if (name === 'thunder') thunder(g, at, value ?? 1); else if (name === 'splash') splash(g, at, value ?? true); else if (name === 'crest') crest(g, at, value ?? 1);
    else if (id) play(g, name, g.voices[id].input, 1, at);
    else play(g, name, name.startsWith('whale') || ['gruntA', 'gruntB', 'crunch'].includes(name) ? g.waterLP : g.master, 1, at);
  }
  return offline.startRendering();
}
let analyser = null;
function probe() { if (graph && !analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 4096; graph.limiter.connect(analyser); } return analyser; }

window.oceanAudio = {
  get enabled() { return enabled; }, enable() { return turn(true); }, disable() { return turn(false); }, toggle() { return turn(!enabled); },
  get volume() { return volume; }, set volume(value) { setVolume(value); },
  get breathing() { return breathing; }, set breathing(value) { setBreathing(value); },
  /** Context state and the gain every layer and bus is at right now. */
  status() {
    const round = value => Math.round(value * 10000) / 10000, layers = {};
    if (graph) for (const [name, node] of Object.entries(graph.layers)) layers[name] = round(node.gain.value);
    return { enabled, volume, breathing, context: ctx?.state ?? 'none', running: Boolean(timer), waiting: armed, paused: held, reducedMotion: calm.matches, nodes: graph?.count ?? 0, tick: TICK,
      master: graph ? round(graph.master.gain.value) : 0, air: graph ? round(graph.air.gain.value) : 0, water: graph ? round(graph.water.gain.value) : 0, mix: graph ? round(graph.bus.gain.value) : 0,
      airCutoff: graph ? Math.round(graph.airLP.frequency.value) : 0, waterCutoff: graph ? Math.round(graph.waterLP.frequency.value) : 0, mixCutoff: graph ? Math.round(graph.duck.frequency.value) : 0,
      limiting: graph ? round(graph.limiter.reduction) : 0, recorded: graph ? [...graph.recorded] : [], layers, scene: { ...scene } };
  },
  render, probe
};
