// Uses the shared UI clock, so hidden tabs do not silently complete the stop.
export const SAFETY_STOP_SECONDS = 45;
export const SAFETY_STOP_MIN_DEPTH = 3;
export const SAFETY_STOP_MAX_DEPTH = 5;
export const inSafetyStopRange = depth => Number.isFinite(depth) && depth >= SAFETY_STOP_MIN_DEPTH && depth <= SAFETY_STOP_MAX_DEPTH;
export function createSafetyStopClock() {
  let elapsed = 0, active = false, completed = false;
  return {
    start() { elapsed = 0; active = true; completed = false; },
    cancel() { active = false; },
    advance(dt) {
      if (!active || completed || !Number.isFinite(dt) || dt <= 0) return false;
      const next = elapsed + dt;
      elapsed = next >= SAFETY_STOP_SECONDS - 1e-8 ? SAFETY_STOP_SECONDS : next;
      if (elapsed < SAFETY_STOP_SECONDS) return false;
      completed = true; active = false; return true;
    },
    get remaining() { return Math.max(0, SAFETY_STOP_SECONDS - elapsed); },
    get progress() { return elapsed / SAFETY_STOP_SECONDS; },
    get active() { return active; },
    get completed() { return completed; },
  };
}
