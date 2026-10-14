import { DISPLAY_MAX_DEPTH } from './depth-metrics.js';

// Dive instruments: the model behind the dive computer and the pressure gauge, and the drawings they share.
// Everything here is ambience: the readings are simulated from the real
// dive state (depth and time come from the scene) and nothing depends on them. No document access in the
// model, no allocation in step(): dive-hud.js runs it five times a second on the interface clock and paints
// what changed; ui-gallery.js and the 3D wrist computer read the same record (oceanDiagnostics.diveComputer).

// The scene swims about eight times faster than a diver does (4 m/s against half a metre a second), so the
// ascent meter reads vertical speed against the same pace: 10 m/min on the meter is 1.33 m/s in the scene.
export const SCENE_PACE = 8;
/** The fastest ascent a dive computer accepts, in metres a minute. Above it the meter says SLOW. */
export const ASCENT_LIMIT = 10;
export const TANK_BAR = 200, RESERVE_BAR = 50, LOW_BAR = 70, DIAL_BAR = 250;
/** Safety stop: three minutes between displayed 3 and 6 m, after a dive deeper than displayed 10 m. */
export const STOP = { depth: 5, shallow: 3, deep: 6, arm: 10, show: 9, seconds: 180, decoSeconds: 300 };
const OFFGAS_HALF_TIME = 12 * 60, PROFILE_POINTS = 96, DONE_SECONDS = 8;

// No-stop limits on air, depth in metres against minutes (the recreational planner's figures to 42 m, the
// shorter air-table limits below it). Shallower than 9 m there is no limit worth showing.
const NO_STOP = [9, 300, 10, 219, 12, 147, 14, 98, 16, 72, 18, 56, 20, 45, 22, 37, 25, 29, 30, 20, 35, 14, 40, 9, 45, 7, 50, 5, 55, 4, 60, 3];
export function noStopLimit(depth) {
  if (depth < NO_STOP[0]) return Infinity;
  for (let i = 2; i < NO_STOP.length; i += 2) {
    if (depth > NO_STOP[i]) continue;
    const shallow = NO_STOP[i - 2], limit = NO_STOP[i - 1];
    return limit + (NO_STOP[i + 1] - limit) * (depth - shallow) / (NO_STOP[i] - shallow);
  }
  return NO_STOP[NO_STOP.length - 1];
}
/** Water at the surface, °C: a tropical reef, a little cooler before sunrise and at night. */
export function surfaceTemperature(preset) { return preset === 'night' ? 27 : preset === 'dawn' ? 27.4 : 28; }
/** A simple thermocline: a slow fall through the mixed layer and five degrees lost around 30 m. */
export function waterTemperature(depth, surface = 28) { return surface - .03 * depth - 5 / (1 + Math.exp(-(depth - 30) / 5)); }
/** The needle's angle on the pressure dial, in degrees from twelve o'clock: 0 bar at -135°, 250 bar at +135°. */
export function needleAngle(bar) { return Math.max(0, Math.min(DIAL_BAR, bar)) / DIAL_BAR * 270 - 135; }

/**
 * The dive record and the two calls that keep it. reset() starts a dive; step(dt, depth, surface, span) advances
 * it by dt seconds of dive time (0 while a dialog holds the clock) over span seconds of real time.
 */
export function createDiveModel() {
  const profile = new Float32Array(PROFILE_POINTS);
  const dive = { elapsed: 0, air: 100, bar: TANK_BAR, depth: 0, maxDepth: 0, ndl: Infinity, load: 0, deco: false, temperature: 28,
    ascentRate: 0, ascentLevel: 0, slow: false, stop: 'none', stopLeft: STOP.seconds, stopTotal: STOP.seconds,
    profile, samples: 0, sampleEvery: 1, profileVersion: 0, expanded: false, location: '' };
  let lastDepth = 0, speed = 0, sinceSample = 0, deepest = 0, doneFor = 0;
  function reset(surface = 28) {
    dive.elapsed = 0; dive.air = 100; dive.bar = TANK_BAR; dive.depth = dive.maxDepth = 0; dive.ndl = Infinity; dive.load = 0; dive.deco = false;
    dive.temperature = surface; dive.ascentRate = dive.ascentLevel = 0; dive.slow = false;
    dive.stop = 'none'; dive.stopLeft = dive.stopTotal = STOP.seconds; dive.samples = 0; dive.sampleEvery = 1; dive.profileVersion++;
    lastDepth = speed = sinceSample = deepest = doneFor = 0;
  }
  function step(dt, depth, surface = 28, span = dt) {
    // The caller supplies calibrated display metres, not the engine's world
    // coordinates. Clamp anomalous records without applying the scale twice.
    depth = Math.max(0, Math.min(DISPLAY_MAX_DEPTH, Number.isFinite(depth) ? depth : 0));
    dive.depth = depth;
    // Vertical speed, smoothed over about half a second, positive on the way up.
    if (span > 0) speed += ((lastDepth - depth) / span - speed) * (1 - Math.exp(-span / .6));
    lastDepth = depth;
    const rate = dive.ascentRate = speed * 60 / SCENE_PACE;
    dive.ascentLevel = rate < 1.5 ? 0 : rate > ASCENT_LIMIT ? 5 : Math.min(4, Math.ceil(rate / 2.5));
    dive.slow = rate > (dive.slow ? ASCENT_LIMIT - 1.5 : ASCENT_LIMIT);
    if (!(dt > 0)) return dive;
    dive.elapsed += dt;
    // The tank: 200 bar down to the 50 bar reserve over half an hour, and no further.
    dive.air = Math.max(25, 100 - dive.elapsed / 24); dive.bar = Math.round(dive.air * TANK_BAR / 100);
    if (depth > dive.maxDepth) dive.maxDepth = depth;
    if (depth > deepest) deepest = depth;
    // Nitrogen, as one number: each second at depth spends its share of that depth's no-stop limit, and the
    // share spent fades with a twelve-minute half-time in the shallows. What is left, at this depth, is the NDL.
    const limit = noStopLimit(depth);
    if (limit === Infinity) dive.load *= Math.exp(-dt * Math.LN2 / OFFGAS_HALF_TIME);
    else dive.load = Math.min(1.25, dive.load + dt / (limit * 60));
    dive.ndl = limit === Infinity ? Infinity : Math.max(0, (1 - dive.load) * limit);
    if (dive.load >= 1) dive.deco = true;
    // The sensor takes a quarter of a minute to follow the water.
    dive.temperature += (waterTemperature(depth, surface) - dive.temperature) * (1 - Math.exp(-dt / 15));
    // Safety stop: asked for on the way up from a dive deeper than 10 m, counted only inside the stop window,
    // and asked for again in full after going back down.
    if (dive.stop === 'none') {
      if (deepest > STOP.arm && depth <= STOP.show) { dive.stop = 'due'; dive.stopLeft = dive.stopTotal = dive.deco ? STOP.decoSeconds : STOP.seconds; }
    } else if (dive.stop === 'done') {
      doneFor -= dt; if (doneFor <= 0) dive.stop = 'none';
    } else if (depth > STOP.arm) dive.stop = 'none';
    else if (depth >= STOP.shallow && depth <= STOP.deep) {
      dive.stop = 'hold'; dive.stopLeft -= dt;
      if (dive.stopLeft <= 0) { dive.stopLeft = 0; dive.stop = 'done'; doneFor = DONE_SECONDS; deepest = depth; if (dive.deco) { dive.deco = false; dive.load = .85; } }
    } else dive.stop = 'due';
    // The profile: one point a second at first; when the strip is full every two points become one (the deeper)
    // and the pace halves, so the whole dive always fits.
    sinceSample += dt;
    if (sinceSample >= dive.sampleEvery) {
      sinceSample = 0;
      if (dive.samples === PROFILE_POINTS) {
        for (let i = 0; i < PROFILE_POINTS / 2; i++) profile[i] = Math.max(profile[2 * i], profile[2 * i + 1]);
        dive.samples = PROFILE_POINTS / 2; dive.sampleEvery *= 2;
      }
      profile[dive.samples++] = depth; dive.profileVersion++;
    }
    return dive;
  }
  return { dive, reset, step };
}

/** The depth the profile strip is drawn against: the deepest point rounded up to the next ten, never less than 20 m. */
export function profileScale(dive) { return Math.min(DISPLAY_MAX_DEPTH, Math.max(20, Math.ceil(dive.maxDepth / 10) * 10)); }
/** The dive profile as the points of an SVG polyline, width by height, surface at the top. */
export function profilePoints(dive, width = 240, height = 44) {
  const count = dive.samples, scale = profileScale(dive);
  if (!count) return `0,0 ${width},0`;
  let points = '0,0';
  for (let i = 0; i < count; i++) points += ` ${((i + 1) / count * width).toFixed(1)},${(Math.min(1, dive.profile[i] / scale) * height).toFixed(1)}`;
  return points;
}
/** Whole minutes of no-stop time as a dive computer shows them. */
export function ndlText(minutes) { return minutes > 99 ? '99+' : String(Math.floor(minutes)); }
export function clockText(seconds) { const whole = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`; }

/** The face of the submersible pressure gauge: 0 to 250 bar over 270°, a reserve arc below 50, numerals every 50. */
export function pressureDial() {
  const point = (bar, radius) => { const angle = needleAngle(bar) * Math.PI / 180; return `${(60 + radius * Math.sin(angle)).toFixed(2)} ${(60 - radius * Math.cos(angle)).toFixed(2)}`; };
  const arc = (from, to, radius) => `M${point(from, radius)}A${radius} ${radius} 0 ${needleAngle(to) - needleAngle(from) > 180 ? 1 : 0} 1 ${point(to, radius)}`;
  let minor = '', major = '', numerals = '';
  // The numerals stand outside the graduations, so the needle never crosses one.
  for (let bar = 0; bar <= DIAL_BAR; bar += 10) {
    if (bar % 50) minor += `M${point(bar, 37)}L${point(bar, 41)}`; else major += `M${point(bar, 34)}L${point(bar, 41)}`;
    if (bar % 50 === 0 && bar > 0 && bar < DIAL_BAR) { const [x, y] = point(bar, 49.5).split(' '); numerals += `<text x="${x}" y="${(Number(y) + 3.3).toFixed(2)}">${bar}</text>`; }
  }
  return `<svg class="spg-dial" viewBox="0 0 120 120" aria-hidden="true"><circle class="spg-face" cx="60" cy="60" r="58.5"/><path class="spg-scale" d="${arc(RESERVE_BAR, DIAL_BAR, 41)}"/><path class="spg-reserve" d="${arc(0, RESERVE_BAR, 39.4)}"/><path class="spg-minor" d="${minor}"/><path class="spg-major" d="${major}"/><g class="spg-numerals">${numerals}</g></svg>`;
}

// Planner conditions: what the sea is doing, read from live weather and time.
const SEA = {
  clear: { sea: 'Calm, light swell', short: 'Calm', visibility: 25 },
  rain: { sea: 'Light chop, rain', short: 'Chop', visibility: 18 },
  storm: { sea: 'Rough, strong surge', short: 'Rough', visibility: 10 }
};
/** Sea state, visibility in metres and water temperature for a weather state and a sky preset. */
export function conditions(weather = 'clear', preset = 'day') {
  const now = SEA[weather] || SEA.clear, night = preset === 'night';
  return { sea: now.sea, short: now.short, visibility: night ? Math.min(now.visibility, 12) : now.visibility, night, temperature: Math.round(surfaceTemperature(preset)), rough: weather === 'storm' };
}
