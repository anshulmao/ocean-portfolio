import { smoothRoute, distance } from './cinematic-route.js';

// Routes are positions for the swimming controller, never positions for a camera
// rail. Check the rounded path as well as its anchors before handing it over.
export function planGuidedRoute(start, goal, { via = [], floor = () => -Infinity, clear = () => true, clearance = 1.5 } = {}) {
  const checked = anchors => {
    const path = smoothRoute([start, ...anchors, goal], { floor, clear, clearance });
    return path.length > 1 ? path.slice(1) : [];
  };
  if (via.length) {
    const scenic = checked(via);
    if (scenic.length) return scenic;
    // One blocked stretch must not cost the whole scenic route (it once sent the tour straight past the arch): plan it
    // stretch by stretch, each finding its own way round, and leave out a waypoint that cannot be reached at all.
    const joined = []; let from = start;
    for (const [i, point] of [...via, goal].entries()) {
      const part = planGuidedRoute(from, point, { floor, clear, clearance });
      if (part.length) { joined.push(...part); from = part.at(-1); }
      else if (i === via.length) { joined.length = 0; break; }
    }
    if (joined.length) return joined;
  }
  const dx = goal[0] - start[0], dz = goal[2] - start[2], span = Math.hypot(dx, dz);
  // A wide, gentle bow lets the reef pass across the view. Try either side when
  // coral closes one approach, then the straight approach for tight passages.
  for (const side of [1, -1, 0]) {
    const bow = Math.min(4, span * .16) * side;
    const midpoint = [(start[0] + goal[0]) / 2 - (span ? dz / span * bow : 0),
      (start[1] + goal[1]) / 2, (start[2] + goal[2]) / 2 + (span ? dx / span * bow : 0)];
    midpoint[1] = Math.max(midpoint[1], floor(midpoint[0], midpoint[2]) + clearance + 1);
    const path = checked([midpoint]);
    if (path.length) return path;
  }
  // A rising approach follows the reef instead of an abrupt up/across/down
  // manoeuvre. It can clear low outcrops even when the direct chord cannot.
  for (const lift of [3, 7, 12]) {
    const anchors = [];
    for (const t of [.2, .4, .6, .8]) {
      const x = start[0] + dx * t, z = start[2] + dz * t;
      anchors.push([x, Math.min(-2, Math.max(start[1] + (goal[1] - start[1]) * t + Math.sin(Math.PI * t) * lift, floor(x, z) + clearance + 2)), z]);
    }
    const path = checked(anchors);
    if (path.length) return path;
  }
  // Search only after the scenic approaches fail. A complete checked route is
  // required; an unreachable stop stays paused rather than becoming a cut.
  const step = 3, root = { point: start, grid: [0, 0, 0], cost: 0, score: 0, parent: null };
  const queue = [root], visited = new Map([['0,0,0', 0]]), directions = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) directions.push([x, y, z]);
  for (let expanded = 0; queue.length && expanded < 1000; expanded++) {
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].score < queue[best].score) best = i;
    const current = queue.splice(best, 1)[0];
    if (clear(current.point, goal)) {
      const anchors = [];
      for (let node = current; node.parent; node = node.parent) anchors.unshift(node.point);
      const path = checked(anchors);
      if (path.length) return path;
    }
    for (const direction of directions) {
      const grid = current.grid.map((v, i) => v + direction[i]), key = grid.join(',');
      const point = grid.map((v, i) => start[i] + v * step);
      if (Math.abs(point[0]) > 61 || point[2] < -104 || point[2] > 34 || point[1] < -59 || point[1] > -2 || point[1] < floor(point[0], point[2]) + clearance) continue;
      const cost = current.cost + distance(current.point, point);
      if (cost >= (visited.get(key) ?? Infinity) || !clear(current.point, point)) continue;
      visited.set(key, cost);
      queue.push({ point, grid, cost, score: cost + distance(point, goal) * 1.1, parent: current });
    }
  }
  return [];
}
