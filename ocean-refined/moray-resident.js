// Motion for a giant moray that lives in one reef den. The GLB is +Z-forward; its head joint is
// 2.641 m forward with another 0.417 m to the skull. Keep that head at the opening, with only a
// short, eased extension when a diver approaches. This is deliberately a small resident motion,
// not a swimming route.
const HEAD_FROM_WRAPPER = 3.058;
const RETRACTED_INSET = 0.32;
const EMERGE_DISTANCE = 1.15;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const smoothstep = (lo, hi, x) => {
  const t = clamp((x - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Make a stable den anchor. `mouth` is the position of the head at the rock opening. */
export function createMorayDenMotion({ mouth, yaw, scale = 1, length = 6.95 * scale }) {
  if (![mouth?.x, mouth?.y, mouth?.z, yaw, length, scale].every(Number.isFinite) || length <= 0 || scale <= 0) {
    throw new TypeError('Moray den needs finite mouth coordinates, yaw, and positive length');
  }
  return {
    mouth: { x: mouth.x, y: mouth.y, z: mouth.z },
    yaw,
    length,
    scale,
    emergence: 0,
  };
}

/** Advance a den resident and return its wrapper pose. `diver` may be null when unseen. */
export function updateMorayDenMotion(state, dt, diver = null, out = {}) {
  if (!state || !Number.isFinite(dt) || dt < 0) throw new TypeError('Moray den state and nonnegative dt required');
  const hx = Math.sin(state.yaw), hz = Math.cos(state.yaw);
  let target = 0;
  if (diver && Number.isFinite(diver.x) && Number.isFinite(diver.y) && Number.isFinite(diver.z)) {
    const dx = diver.x - state.mouth.x, dy = diver.y - state.mouth.y, dz = diver.z - state.mouth.z;
    const distance = Math.hypot(dx, dy, dz);
    const toward = distance > 1e-4 ? (hx * dx + hz * dz) / distance : 1;
    const approach = 1 - smoothstep(state.length * 0.52, state.length * 1.08, distance);
    const facing = smoothstep(-0.15, 0.55, toward);
    target = approach * facing;
  }
  const tau = target > state.emergence ? 1.8 : 2.8;
  state.emergence += (target - state.emergence) * (1 - Math.exp(-dt / tau));
  state.emergence = clamp(state.emergence, 0, 1);

  // Place the GLB wrapper so its head joint stays just inside the opening at rest. Emergence
  // advances along the den axis, while the mouth anchor and heading remain fixed.
  const forward = (HEAD_FROM_WRAPPER + RETRACTED_INSET - EMERGE_DISTANCE * state.emergence) * state.scale;
  out.x = state.mouth.x - hx * forward; out.y = state.mouth.y; out.z = state.mouth.z - hz * forward;
  out.yaw = state.yaw; out.emergence = state.emergence;
  return out;
}

export const MORAY_DEN_GEOMETRY = Object.freeze({
  headFromWrapper: HEAD_FROM_WRAPPER,
  retractedInset: RETRACTED_INSET,
  emergeDistance: EMERGE_DISTANCE,
});
