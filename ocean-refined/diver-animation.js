// Calm underwater motion: hip-led strokes, delayed knees/ankles and restrained
// breathing. World navigation owns root position/orientation; this module owns
// only the articulated rig beneath it. All angular values are radians.
const TAU = Math.PI * 2;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const lerp = (a, b, t) => a + (b - a) * t;

// A deterministic pose sampler is also useful for checking poses without WebGL.
// `out` can be reused; the runtime controller creates it once.
export function sampleDiverPose(time, state = {}, out = {}) {
  const dive = clamp(state.dive ?? 1), stop = clamp(state.safetyStop ?? 0);
  const check = Math.max(stop, clamp(state.wristOpen ?? 0));
  const quiet = Boolean(state.reducedMotion), moving = clamp(state.moving ?? 0);
  const ascent = clamp(Number(state.ascending ?? 0));
  const activity = quiet ? 0 : moving * dive * (1 - stop) * lerp(1, .32, ascent);
  const frequency = clamp(state.kickFrequency ?? 3.2, 1, 6);
  const amplitude = clamp(state.kickAmplitude ?? .29, .08, .48);
  const breath = quiet ? 0 : Math.sin(time * TAU / 4.8);
  out.breath = breath;
  out.bob = quiet ? 0 : Math.sin(time * 1.32) * lerp(.025, .013, dive) + Math.sin(time * .63) * .006;
  out.sway = quiet ? 0 : Math.sin(time * .86) * .009 * (1 - activity * .65);
  // A diver in horizontal trim extends the neck to see ahead of the mask.
  out.headX = lerp(lerp(.012, lerp(-.52, -.12, ascent), dive) + breath * .008, .18, check);
  out.headY = quiet ? 0 : Math.sin(time * .39) * .018 * (1 - check);
  out.chestDepth = 1 + breath * .006;
  out.check = check;
  out.left ??= {}; out.right ??= {};
  for (const side of [-1, 1]) {
    const pose = side < 0 ? out.left : out.right;
    const phase = time * frequency + (side > 0 ? Math.PI : 0);
    const stroke = Math.sin(phase), delayed = Math.sin(phase - .63);
    const recovery = Math.max(0, Math.sin(phase - .4));
    pose.shoulderX = lerp(-.10, -.17, dive) + breath * .012;
    pose.shoulderZ = side * lerp(.19, .12, dive);
    pose.shoulderY = 0;
    pose.elbowX = lerp(-.38, -1.03, dive) + breath * .018;
    pose.elbowZ = 0;
    pose.wristX = -.06; pose.wristY = 0;
    // Knees bend only in their natural direction; propulsion begins at the
    // hip while the soft fin lags the calf on the recovery stroke.
    pose.hipX = lerp(-.055, -.075, dive) + stroke * amplitude * activity;
    pose.hipZ = side * lerp(.055, .025, dive);
    pose.kneeX = lerp(.10, .21, dive) + recovery * amplitude * .72 * activity;
    pose.ankleX = lerp(.72, 1.27, dive) - delayed * .115 * activity;
    if (check > 0) {
      pose.shoulderX = lerp(pose.shoulderX, side < 0 ? -.40 : -.30, check);
      pose.shoulderZ = lerp(pose.shoulderZ, side < 0 ? .32 : -.32, check);
      pose.shoulderY = lerp(0, side < 0 ? -.16 : .12, check);
      pose.elbowX = lerp(pose.elbowX, side < 0 ? -1.72 : -1.28, check);
      pose.elbowZ = lerp(0, side < 0 ? .12 : -.20, check);
      pose.wristX = lerp(-.06, side < 0 ? .14 : -.12, check);
      pose.wristY = lerp(0, side < 0 ? -.16 : .12, check);
      pose.hipX = lerp(pose.hipX, -.055, stop);
      pose.kneeX = lerp(pose.kneeX, .18, stop);
      pose.ankleX = lerp(pose.ankleX, .82, stop);
    }
  }
  return out;
}

export function createDiverAnimator(diver) {
  let time = 0, movement = 0, check = 0;
  const pose = {}, state = {};
  const diagnostics = { mode: 'surface', moving: 0, checking: 0, phase: 0 };
  function update(dt, input = {}) {
    dt = clamp(dt, 0, .1);
    if (!input.paused) time += dt;
    const response = input.reducedMotion ? 1 : 1 - Math.exp(-dt * 4.5);
    movement = lerp(movement, input.moving ? 1 : 0, response);
    check = lerp(check, input.wristOpen ? 1 : 0, response);
    Object.assign(state, input, { moving: movement, wristOpen: check });
    sampleDiverPose(time, state, pose);
    for (const arm of diver.arms) {
      const p = arm.side < 0 ? pose.left : pose.right;
      arm.shoulder.rotation.set(p.shoulderX, p.shoulderY, p.shoulderZ);
      arm.forearm.rotation.set(p.elbowX, 0, p.elbowZ);
      arm.wrist?.rotation.set(p.wristX, p.wristY, 0);
    }
    for (const leg of diver.legs) {
      const p = leg.side < 0 ? pose.left : pose.right;
      leg.hip.rotation.set(p.hipX, 0, p.hipZ);
      leg.shin.rotation.set(p.kneeX, 0, 0);
      leg.ankle?.rotation.set(p.ankleX, 0, 0);
    }
    if (diver.rig) { diver.rig.position.y = pose.bob; diver.rig.rotation.z = pose.sway; }
    if (diver.body) diver.body.scale.z = pose.chestDepth;
    if (diver.head) diver.head.rotation.set(pose.headX, pose.headY, 0);
    diver.regulatorHose?.update();
    diagnostics.mode = state.safetyStop > .01 ? 'safety-stop' : state.dive < .05 ? 'surface' : state.ascending ? 'ascending' : movement > .1 ? 'swimming' : 'hover';
    diagnostics.moving = movement; diagnostics.checking = pose.check; diagnostics.phase = time;
    return pose;
  }
  return { update, diagnostics };
}
