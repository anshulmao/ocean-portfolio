// Rain on open water: a broad, soft spray and irregular close water impacts.
// These are authored textures, not recordings. Independent stereo channels and
// unequal loop lengths keep the rain from repeating as a short pitched pattern.
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
const unit = x => Number.isFinite(x) ? clamp(x, 0, 1) : 0;

export function rainMix(rain, wind = 0, seconds = 0) {
  const amount = unit(rain), blow = unit(wind), time = Number.isFinite(seconds) ? seconds : 0;
  const gust = 1 + .055 * Math.sin(time * .37 + Math.sin(time * .113));
  return {
    bed: .29 * amount ** 1.1 * gust,
    // Individual drops stay audible in a shower and merge into the bed in a storm.
    drops: .2 * Math.sqrt(amount) * (1 - .32 * amount),
    highpass: 190 + 160 * blow,
    lowpass: 5800 + 2800 * amount,
  };
}

export function createRainTexture(ctx, random = Math.random) {
  const rate = Math.min(ctx.sampleRate, 32000);
  const make = seconds => ctx.createBuffer(2, Math.round(seconds * rate), rate);
  const bed = make(13.7), drops = make(11.3);
  for (let channel = 0; channel < 2; channel++) {
    const data = bed.getChannelData(channel), lap = Math.round(rate * .15);
    const raw = new Float32Array(data.length + lap);
    let low = 0, middle = 0, power = 0;
    for (let i = 0; i < raw.length; i++) {
      const noise = random() * 2 - 1;
      low += .012 * (noise - low); middle += .19 * (noise - middle);
      // Water's lower wash supports the small bright splashes; no narrow tonal band.
      raw[i] = .35 * noise + 1.3 * middle - .8 * low;
    }
    // Equal-power overlap over the seam, rather than a tiny jump every loop.
    data.set(raw.subarray(0, data.length));
    for (let i = 0; i < lap; i++) {
      const blend = i / lap;
      data[i] = raw[i] * Math.sin(blend * Math.PI / 2) + raw[data.length + i] * Math.cos(blend * Math.PI / 2);
    }
    for (const value of data) power += value * value;
    const level = .2 / Math.sqrt(power / data.length);
    for (let i = 0; i < data.length; i++) data[i] *= level;
  }
  const left = drops.getChannelData(0), right = drops.getChannelData(1), length = drops.length;
  // Poisson-like arrivals, not a regular pulse train. Each impact combines a
  // short wet transient and a darker splash tail, without the old sine "pings".
  for (let at = 0; at < length; ) {
    at += Math.max(1, Math.round(-Math.log(Math.max(.000001, 1 - random())) * rate / 85));
    const duration = .008 + random() ** 2 * .045, count = Math.round(duration * rate);
    const pan = random() * Math.PI / 2, volume = .12 + random() ** 3 * .7;
    const l = Math.cos(pan) * volume, r = Math.sin(pan) * volume;
    let wet = 0;
    for (let i = 0; i < count; i++) {
      const x = i / count, noise = random() * 2 - 1;
      wet += .22 * (noise - wet);
      const envelope = Math.min(1, i / Math.max(1, rate * .0008)) * (1 - x) ** 3;
      const value = (noise * .22 + wet * 1.7) * envelope, index = (at + i) % length;
      left[index] += value * l; right[index] += value * r;
    }
  }
  let peak = 0;
  for (const data of [left, right]) for (const value of data) peak = Math.max(peak, Math.abs(value));
  for (const data of [left, right]) for (let i = 0; i < data.length; i++) data[i] *= .9 / (peak || 1);
  return {bed, drops};
}
