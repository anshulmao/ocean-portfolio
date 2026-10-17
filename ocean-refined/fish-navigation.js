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
    }
    s.yaw += clamp(angle(s.course - s.yaw), -turnRate * dt, turnRate * dt);
    // Slowing into a turn prevents lateral skating. The final swept test handles the curved approach while
    // the slower fan refresh keeps hundreds of fish inexpensive. No analytic terrain or collision raycasts.
    let travel = speed * dt * Math.max(.15, Math.cos(angle(s.course - s.yaw)));
    if (s.blocked || !clear(s, s.yaw, travel, clearance, radius, 0, false)) { travel = 0; s.next = 0; }
    const x = s.x + Math.sin(s.yaw) * travel, z = s.z + Math.cos(s.yaw) * travel;
    const ahead = Math.min(1.2, speed * 1.2), floor = envelope(x, z, radius) + clearance;
    const anticipated = envelope(x + Math.sin(s.yaw) * ahead, z + Math.cos(s.yaw) * ahead, radius) + clearance;
    // Lift gently over a swimmable slope; never climb a rejected wall while turning beside it.
    let targetY = Math.min(ceiling, Math.max(target.y, floor));
    if (!s.blocked && clear(s, s.yaw, ahead, clearance, radius, climb)) targetY = Math.min(ceiling, Math.max(targetY, anticipated));
    // Use the same body footprint for vertical clearance and route rejection. Center-only floor heights
    // let a fish beside a ledge descend below its own footprint, after which every horizontal course failed.
    const recover = floor > s.y + 1e-5 && floor <= ceiling;
    if (recover) targetY = Math.min(ceiling, Math.max(targetY, floor + .05));
    const vy = travel > 0 || recover ? clamp((targetY - s.y) * 1.2, -speed * climb, speed * climb) : 0;
    s.vx = (x - s.x) / dt; s.vz = (z - s.z) / dt; s.vy = vy;
    s.x = x; s.z = z; s.y += vy * dt;
    const pitch = Math.atan2(vy, Math.max(.001, travel / dt));
    s.pitch += (pitch - s.pitch) * (1 - Math.exp(-dt * 4));
    s.turn = angle(s.yaw - oldYaw) / dt;
    return s;
  }
  return { create, step };
}
