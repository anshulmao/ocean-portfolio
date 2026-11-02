// Uses the shared UI clock, so hidden tabs do not silently complete the stop.
export const SAFETY_STOP_SECONDS = 45;
export const SAFETY_STOP_MIN_DEPTH = 3;
export const SAFETY_STOP_MAX_DEPTH = 5;
export const inSafetyStopRange = depth => Number.isFinite(depth) && depth >= SAFETY_STOP_MIN_DEPTH && depth <= SAFETY_STOP_MAX_DEPTH;
export function createSafetyStopClock() {
  let elapsed = 0, active = false, paused = false, completed = false;
  return {
    start() { elapsed = 0; active = true; paused = false; completed = false; },
    cancel() { active = false; paused = false; },
    pause() { if (active) paused = true; },
    resume() { if (active && !completed) paused = false; },
    advance(dt) {
      if (!active || paused || completed || !Number.isFinite(dt) || dt <= 0) return false;
      const next = elapsed + dt;
      elapsed = next >= SAFETY_STOP_SECONDS - 1e-8 ? SAFETY_STOP_SECONDS : next;
      if (elapsed < SAFETY_STOP_SECONDS) return false;
      completed = true; active = false; return true;
    },
    get remaining() { return Math.max(0, SAFETY_STOP_SECONDS - elapsed); },
    get progress() { return elapsed / SAFETY_STOP_SECONDS; },
    get active() { return active; },
    get paused() { return paused; },
    get completed() { return completed; },
  };
}
