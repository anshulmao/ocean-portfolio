// Allocation-free local steering over cached terrain/obstacle heights. A route is a wish, never a command to
// paste the fish onto the floor. Probe a few seconds ahead and go round a wall before reaching its foot.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const angle = (v) => Math.atan2(Math.sin(v), Math.cos(v));
const FAN = [0, .35, -.35, .7, -.7, 1.1, -1.1, 1.57, -1.57, 2.15, -2.15, 2.7, -2.7, Math.PI];

export function fishNavigator(heightAt) {
  const envelope = (x, z, radius) => Math.max(heightAt(x, z), heightAt(x - radius, z - radius), heightAt(x - radius, z + radius), heightAt(x + radius, z - radius), heightAt(x + radius, z + radius));
  function clear(s, yaw, distance, clearance, radius, climb, checkSlope = true) {
    const dx = Math.sin(yaw), dz = Math.cos(yaw), base = heightAt(s.x, s.z);
    if (envelope(s.x, s.z, radius) + clearance > s.y + 1e-5) return false;
    let previous = base;
    const samples = Math.max(1, Math.ceil(distance / .55));
    for (let i = 1; i <= samples; i++) {
      const d = distance * i / samples, x = s.x + dx * d, z = s.z + dz * d;
      const h = envelope(x, z, radius);
      // A sudden rise is a wall even if the (softened) navigation cover makes it look like a ramp.
      // Once safely above it a swimmer may pass over; a low swimmer must turn along its contour.
      if (h + clearance > s.y + d * climb + 1e-5 || (checkSlope && h - previous > d / i * .6 && h + clearance > s.y + 1e-5)) return false;
      previous = h;
    }
    return true;
  }

  function create(x, y, z, yaw = 0) {
    return { x, y, z, yaw, pitch: 0, turn: 0, vx: 0, vy: 0, vz: 0, next: 0, course: yaw, side: 1, blocked: false };
  }

  function step(s, target, dt, { speed = 1, clearance = .5, radius = .25, ceiling = -1.2, turnRate = 1.3, climb = .3 } = {}) {
    if (!(dt > 0)) return s;
    dt = Math.min(dt, .1);
    const horizontal = Math.hypot(target.x - s.x, target.z - s.z), desired = horizontal > .02 ? Math.atan2(target.x - s.x, target.z - s.z) : s.yaw;
    const reach = Math.max(2.5, speed * 3.2 + radius * 2), oldYaw = s.yaw;
    s.next -= dt;
    if (s.next <= 0) {
      s.next = .24;
      let best = Infinity, course = s.yaw, found = false;
      for (const offset of FAN) {
        const yaw = desired + offset;
        if (!clear(s, yaw, speed * dt, clearance, radius, 0, false) || !clear(s, yaw, speed * .1, clearance, radius, 0, false)) continue;
        if (!clear(s, yaw, reach, clearance, radius, climb)) continue;
        const change = angle(yaw - s.yaw), continuity = Math.abs(angle(yaw - s.course));
        const score = Math.abs(offset) + Math.abs(change) * .25 + continuity * .3 + (change * s.side < -.2 ? .08 : 0);
        if (score < best) { best = score; course = yaw; found = true; }
        if (best < .3) break; // A clear, almost-straight course cannot be improved by a wider fan angle.
      }
      s.course = course; s.blocked = !found;
      const turn = angle(course - s.yaw); if (Math.abs(turn) > .2) s.side = Math.sign(turn);
      // The look-ahead lift is decided with the course, not every frame: it is the costliest probe and moves
      // little between quarter-second replans (the target height it feeds is eased anyway).
      const ahead = Math.min(1.2, speed * 1.2);
      s.lift = found && clear(s, course, ahead, clearance, radius, climb);
      s.anticipated = envelope(s.x + Math.sin(course) * ahead, s.z + Math.cos(course) * ahead, radius) + clearance;
    }
    // Turn rate and pace ease toward their targets instead of switching: a fish banks into a turn and coasts to a
    // stop. Hard switches (full turn rate on, speed to zero when the fan found no course) read as jitter on screen,
    // because the course is only re-chosen every quarter second and walls re-block it from frame to frame.
    const ease = rate => 1 - Math.exp(-dt * rate);
    const wantRate = clamp(angle(s.course - s.yaw) * 3, -turnRate, turnRate);
    s.yawRate = (s.yawRate ?? 0) + (wantRate - (s.yawRate ?? 0)) * ease(6);
    s.yaw += s.yawRate * dt;
    // Slowing into a turn prevents lateral skating. The final swept test handles the curved approach while
    // the slower fan refresh keeps hundreds of fish inexpensive. No analytic terrain or collision raycasts.
    const pace = s.blocked ? 0 : speed * Math.max(.15, Math.cos(angle(s.course - s.yaw)));
    s.pace = (s.pace ?? pace) + (pace - (s.pace ?? pace)) * ease(3.5);
    let travel = s.pace * dt;
    if (s.blocked) s.next = 0;
    // The swept test still has the last word: a coasting fish never enters a wall. A fish riding exactly at its
    // clearance can fail it now and then; it takes half the step, or holds for this frame only, and keeps its pace.
    if (travel > 0 && !clear(s, s.yaw, travel, clearance, radius, 0, false)) { travel = clear(s, s.yaw, travel * .5, clearance, radius, 0, false) ? travel * .5 : 0; s.next = 0; }
    const x = s.x + Math.sin(s.yaw) * travel, z = s.z + Math.cos(s.yaw) * travel;
    const floor = envelope(x, z, radius) + clearance;
    // Lift gently over a swimmable slope; never climb a rejected wall while turning beside it.
    let targetY = Math.min(ceiling, Math.max(target.y, floor));
    if (!s.blocked && s.lift) targetY = Math.min(ceiling, Math.max(targetY, s.anticipated));
    // Use the same body footprint for vertical clearance and route rejection. Center-only floor heights
    // let a fish beside a ledge descend below its own footprint, after which every horizontal course failed.
    const recover = floor > s.y + 1e-5 && floor <= ceiling;
    if (recover) targetY = Math.min(ceiling, Math.max(targetY, floor + .05));
    // Climbing out of the floor footprint answers at once; ordinary depth changes ease like the pace does.
    const vyWant = travel > 0 || recover ? clamp((targetY - s.y) * 1.2, -speed * climb, speed * climb) : 0;
    const vy = recover ? vyWant : (s.vy ?? 0) + (vyWant - (s.vy ?? 0)) * ease(3);
    s.vx = (x - s.x) / dt; s.vz = (z - s.z) / dt; s.vy = vy;
    s.x = x; s.z = z; s.y += vy * dt;
    // Pitch against at least a quarter of cruising speed, so a fish slowing to a stop does not point straight up.
    const pitch = Math.atan2(vy, Math.max(speed * .25 + .001, travel / dt));
    s.pitch += (pitch - s.pitch) * ease(4);
    s.turn = angle(s.yaw - oldYaw) / dt;
    return s;
  }
  return { create, step };
}
