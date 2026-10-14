// Frame pacing and adaptive resolution as pure functions. world.js feeds them
// the frame loop's numbers; the same code runs under Node for its checks
// (no DOM, no three.js here).

const RATES = [48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240, 360];

/**
 * The display's refresh rate from recent animation-frame gaps (ms).
 * A slow frame only ever lengthens a gap, so the interval is looked for among
 * the shortest: the third shortest (two stray short gaps, a late callback
 * followed by a punctual one, are ignored) marks the cluster of single
 * intervals, and the mean of that cluster is the interval. (The shortest
 * gaps alone read high: callbacks jitter by a millisecond or two, and the old
 * lower-fifth reading took a 60 Hz display for 64, which the frame rate could
 * then never reach.) The result is snapped to a standard rate within 4 % of it.
 * Never read as slower than 48 Hz: a steady 33 ms gap may be a 30 Hz display or
 * a 60 Hz one with every other frame missed, and the second is far more
 * likely; a steady 20 ms gap can only be a 50 Hz display.
 */
export function refreshRate(gaps, scratch = new Float32Array(gaps.length)) {
  scratch.set(gaps); scratch.sort();
  const low = scratch[2];
  let sum = 0, count = 0;
  for (let i = 0; i < scratch.length && scratch[i] <= low * 1.4; i++) if (scratch[i] >= low * .85) { sum += scratch[i]; count++; }
  const rate = Math.min(360, Math.max(48, 1000 * count / sum));
  let nearest = RATES[0];
  for (const standard of RATES) if (Math.abs(standard - rate) < Math.abs(nearest - rate)) nearest = standard;
  return Math.abs(nearest - rate) <= nearest * .04 ? nearest : rate;
}

/**
 * Frames a second from the gaps between the frames drawn in one window (ms),
 * leaving out the stalls: a gap over three times the median is a hitch (a
 * model arriving, a collection), not the GPU's pace, and lower resolution
 * would not have prevented it. Missed refreshes (gaps of two intervals among
 * gaps of one) stay in, so a GPU that is short on its frames still reads slow.
 * Returns 0 when the window holds too few frames to say.
 */
export function windowPace(gaps, count, scratch = new Float32Array(gaps.length)) {
  if (count < 3) return 0;
  const sorted = scratch.subarray(0, count); sorted.set(gaps.subarray(0, count)); sorted.sort();
  const limit = sorted[count >> 1] * 3;
  let sum = 0, kept = 0;
  for (let i = 0; i < count && sorted[i] <= limit; i++) { sum += sorted[i]; kept++; }
  return 1000 * kept / sum;
}

/**
 * Draw every stride-th animation frame. Up to about 100 Hz every callback
 * draws, so a 75 Hz display runs at 75 and not at 37.5; faster displays draw
 * every second or third callback, which paces evenly at 55 to 72. A lower
 * target (30 when idle, 15 behind a dialog) divides further.
 */
export function drawStride(displayHz, target = 60) { return Math.max(1, Math.floor(displayHz / target + .25)); }

/**
 * Does a window of frame gaps (ms) hold a stall: one gap of at least `limit`
 * ms (a long task, a shader arriving, the browser busy elsewhere)? Such a
 * window says nothing about the GPU's pace and is left out of the decision.
 */
export function windowHitch(gaps, count, limit = 100) {
  for (let i = 0; i < count; i++) if (gaps[i] >= limit) return true;
  return false;
}

/**
 * Time for background work after a frame, in ms: what is left of the display
 * interval once the frame's own work is done, less a margin for the browser,
 * and never more than `cap` (a few ms while the scene draws at full rate, more
 * when it draws less often or the visitor is waiting on the work). A frame that
 * used its interval leaves nothing, except that work which has waited `starved`
 * frames takes a small slice anyway, so a slow device still finishes loading.
 */
export function workBudget(interval, used, cap = 4, starved = 0, margin = 3) {
  const left = Math.min(cap, interval - used - margin);
  return left >= 1 ? left : starved >= 4 ? Math.min(cap, 2) : 0;
}

/**
 * Resolution follows the frame rate: when drawn frames fall well short of what
 * the display and pacing allow for two windows running, the render scale drops
 * a step (two when the shortfall is large); one slow window alone is a hitch,
 * not a pace. If a lower scale bought nothing the limit is not the GPU's fill
 * rate (a slow CPU, or a browser throttling the tab), so the pixels are given
 * back and the scale is left alone. That is judged against the frame rate at
 * the step the page started on (`origin`): an integrated GPU starts two steps
 * down and never measures full scale, and without this it went on to the floor
 * and into economy detail for stalls no resolution could cure. Economy detail
 * is the last resort.
 *
 * The way back up depends on what the caller can measure. Given the frame's
 * cost (`info.cost`: the GPU's time for one frame at the current scale, ms),
 * the cost of the next step up is predicted from it: from the costs seen at
 * two scales where there are two (a fixed part plus a part that grows with the
 * pixels), else as if all of it grew with the pixels. The scale climbs after
 * two windows in which that prediction leaves a fifth of the display interval
 * spare, and stays where it is otherwise: it settles on the highest scale that
 * holds the rate instead of trying the next one every so often. The same cost
 * keeps a step down honest: frames that are late while the GPU has time to
 * spare are not the resolution's doing. Without a cost the scale climbs after
 * ten steady seconds, and waits twice as long each time a climb had to be undone.
 *
 * update(fps, seconds, expected, now, info) is called once per window of about
 * a second and returns 'scale' when state.step changed, 'economy' when the page
 * should switch to economy detail, or null. floor: the lowest step allowed.
 * info: { cost, busy, hitch }. A window that was busy (background work or a
 * transition was running) or held a hitch is ignored altogether.
 */
export function createScaleController({ step = 0, floor = 3, economy = false, scales = [1, .85, .72, .6] } = {}) {
  const state = { step, origin: step, floor, economy, locked: false, settling: 1, steady: 0, slow: 0, starved: 0, recoverAfter: 10, raisedAt: -1e9, fpsAtOrigin: 0, costs: [], barred: -1, barredUntil: -1e9, ignored: 0 };
  // What a frame is expected to cost at another step, from the costs measured lately.
  function predict(target, cost, now) {
    const here = scales[state.step] ** 2, there = scales[target] ** 2;
    let other = null;
    for (let i = 0; i < state.costs.length; i++) { const seen = state.costs[i]; if (seen && i !== state.step && now - seen.at < 45 && (!other || seen.at > other.at)) other = { ...seen, area: scales[i] ** 2 }; }
    if (other) {
      const fill = (cost - other.cost) / (here - other.area), base = cost - fill * here;
      if (fill > 0 && base >= 0) return base + fill * there;
    }
    return cost * there / here;
  }
  function lower(fps, expected, now) {
    if (state.step < state.floor && !state.locked) {
      if (state.step === state.origin) state.fpsAtOrigin = fps;
      if (now - state.raisedAt < 30) { state.recoverAfter = Math.min(state.recoverAfter * 2, 240); state.barred = state.step; state.barredUntil = now + state.recoverAfter; }
      state.step = Math.min(state.floor, state.step + (fps < expected * .55 ? 2 : 1));
      return 'scale';
    }
    // Lower resolution did not help: the limit is elsewhere, and the starting scale comes back.
    if (!state.locked && state.step > state.origin && state.fpsAtOrigin > 0 && fps < state.fpsAtOrigin * 1.12) { state.locked = true; state.step = state.origin; state.settling = 1; return 'scale'; }
    if (fps < 24 && !state.economy) { state.economy = true; state.step = state.origin = 0; state.locked = false; state.settling = 1; state.fpsAtOrigin = 0; state.costs.length = 0; return 'economy'; }
    return null;
  }
  function update(fps, seconds, expected, now, info = null) {
    if (info && (info.busy || info.hitch)) { state.slow = 0; state.ignored++; return null; }
    if (state.settling > 0) { state.settling--; state.steady = 0; state.slow = 0; return null; }
    const interval = 1000 / expected, cost = info && info.cost > 0 ? info.cost : 0;
    if (cost) { const seen = state.costs[state.step]; state.costs[state.step] = { cost: seen && now - seen.at < 10 ? seen.cost * .5 + cost * .5 : cost, at: now }; }
    if (fps < expected * .9) {
      state.steady = 0;
      if (cost && cost < interval * .7) {
        // Late frames with GPU time to spare: the pixels are not what is slow. Economy detail lightens the rest, if it goes on.
        state.slow = 0;
        if (fps < 24 && !state.economy && ++state.starved >= 4) { state.starved = 0; state.economy = true; state.step = state.origin = Math.min(state.step, state.origin); state.settling = 1; return 'economy'; }
        return null;
      }
      state.starved = 0;
      if (++state.slow < 2) return null;
      state.slow = 0;
      return lower(fps, expected, now);
    }
    state.slow = 0; state.starved = 0;
    if (fps >= expected * .95 && state.step > 0 && !state.locked) {
      if (cost) {
        const target = state.step - 1;
        if (predict(target, state.costs[state.step].cost, now) <= interval * .8 && !(state.barred === target && now < state.barredUntil)) state.steady += seconds; else state.steady = 0;
        if (state.steady >= 2) { state.steady = 0; state.step--; state.raisedAt = now; state.settling = 1; return 'scale'; }
      } else {
        state.steady += seconds;
        if (state.steady >= state.recoverAfter) { state.steady = 0; state.step--; state.raisedAt = now; state.settling = 1; return 'scale'; }
      }
    } else state.steady = 0;
    return null;
  }
  return { state, update };
}
