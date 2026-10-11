import * as THREE from './vendor/three.module.min.js';

// Static, conservative proxies derived from the rendered instance transforms.
// Bulky solids use one AABB; cylinders and tubes use short pieces. Table/fan
// surfaces use spatially grouped triangles so empty space around a coral crown
// stays swimmable. AABBs round off fine details and sponge openings are solid.
// Soft grass/tentacles, animated fish and glowing decorations are not colliders.
const AXES = ['x', 'y', 'z'];
const EPSILON = 1e-5;

function geometryPieces(geometry, kind) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (kind === 'cylinder') {
    const boxes = [], height = bounds.max.y - bounds.min.y;
    // Unit branch geometry is scaled per instance; fine axial slices keep a
    // diagonal twig from becoming a large invisible rectangular obstacle.
    const slices = 8;
    for (let i = 0; i < slices; i++) {
      const box = bounds.clone();
      box.min.y = bounds.min.y + height * i / slices;
      box.max.y = bounds.min.y + height * (i + 1) / slices;
      boxes.push(box);
    }
    return boxes;
  }
  const positions = geometry.getAttribute('position');
  if (kind === 'tube') {
    const boxes = [], sides = geometry.parameters.radialSegments + 1;
    const point = new THREE.Vector3();
    for (let ring = 0; ring < geometry.parameters.tubularSegments; ring++) {
      const box = new THREE.Box3();
      for (let i = ring * sides; i < (ring + 2) * sides; i++) {
        point.fromBufferAttribute(positions, i); box.expandByPoint(point);
      }
      boxes.push(box);
    }
    return boxes;
  }
  if (kind === 'plate' || kind === 'fan') {
    const boxes = new Map(), index = geometry.getIndex();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const planeAxis = kind === 'plate' ? 'z' : 'y';
    const width = bounds.max.x - bounds.min.x;
    const height = bounds.max[planeAxis] - bounds.min[planeAxis];
    const triangles = index ? index.count : positions.count;
    for (let i = 0; i < triangles; i += 3) {
      a.fromBufferAttribute(positions, index ? index.getX(i) : i);
      b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1);
      c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2);
      const x = Math.min(3, Math.floor(((a.x + b.x + c.x) / 3 - bounds.min.x) / width * 4));
      const y = Math.min(3, Math.floor(((a[planeAxis] + b[planeAxis] + c[planeAxis]) / 3 - bounds.min[planeAxis]) / height * 4));
      const key = `${x},${y}`;
      if (!boxes.has(key)) boxes.set(key, new THREE.Box3());
      boxes.get(key).expandByPoint(a).expandByPoint(b).expandByPoint(c);
    }
    return [...boxes.values()];
  }
  return [bounds.clone()];
}

export class CollisionWorld {
  constructor({ cellSize = 2.5 } = {}) {
    this.cellSize = Math.max(.5, cellSize);
    this.boxes = [];
    this.grid = new Map();
    this.blocked = false;
    this._queryBounds = new THREE.Box3();
    this._normal = new THREE.Vector3();
    this._closest = new THREE.Vector3();
  }

  get count() { return this.boxes.length; }

  // Spatially bounded segment query used for landmark sightlines and camera
  // placement. The final half metre is ignored so a ray can end at a target.
  segmentClear(start, end, padding = 0) {
    const delta = new THREE.Vector3().subVectors(end, start);
    const fullLength = delta.length();
    const length = Math.max(0, fullLength - .5);
    if (length <= EPSILON) return true;
    delta.multiplyScalar(length / fullLength);
    const clippedEnd = new THREE.Vector3().copy(start).add(delta);
    const bounds = new THREE.Box3().setFromPoints([start, clippedEnd]).expandByScalar(Math.max(0, padding));
    const candidates = new Set();
    this._cells(bounds, key => {
      for (const index of this.grid.get(key) || []) candidates.add(index);
    });
    const inverse = new THREE.Vector3(
      Math.abs(delta.x) > EPSILON ? 1 / delta.x : Infinity,
      Math.abs(delta.y) > EPSILON ? 1 / delta.y : Infinity,
      Math.abs(delta.z) > EPSILON ? 1 / delta.z : Infinity
    );
    const low = new THREE.Vector3(), high = new THREE.Vector3();
    for (const index of candidates) {
      const box = this.boxes[index].box;
      low.copy(box.min).addScalar(-padding);
      high.copy(box.max).addScalar(padding);
      let near = 0, far = 1;
      for (const axis of AXES) {
        if (!Number.isFinite(inverse[axis])) {
          if (start[axis] < low[axis] || start[axis] > high[axis]) { near = 2; break; }
          continue;
        }
        let a = (low[axis] - start[axis]) * inverse[axis];
        let b = (high[axis] - start[axis]) * inverse[axis];
        if (a > b) [a, b] = [b, a];
        near = Math.max(near, a); far = Math.min(far, b);
        if (near > far) break;
      }
      if (near <= far && far >= 0 && near <= 1) return false;
    }
    return true;
  }

  addBox(box, metadata = {}) {
    if (box.isEmpty()) return;
    const index = this.boxes.length;
    this.boxes.push({ box: box.clone(), ...metadata });
    this._cells(box, key => {
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(index);
    });
  }

  addInstancedMesh(mesh, kind = 'solid') {
    mesh.updateWorldMatrix(true, false);
    const pieces = geometryPieces(mesh.geometry, kind);
    const instance = new THREE.Matrix4(), transform = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, instance);
      transform.multiplyMatrices(mesh.matrixWorld, instance);
      for (const piece of pieces) {
        const box = piece.clone().applyMatrix4(transform);
        // Real surfaces and very thin ribs need a small solid thickness.
        for (const axis of AXES) {
          const missing = .04 - (box.max[axis] - box.min[axis]);
          if (missing > 0) { box.min[axis] -= missing / 2; box.max[axis] += missing / 2; }
        }
        this.addBox(box, { mesh: mesh.name, instance: i });
      }
    }
    return this;
  }

  _cells(box, visit) {
    const s = this.cellSize;
    for (let x = Math.floor(box.min.x / s); x <= Math.floor(box.max.x / s); x++) {
      for (let y = Math.floor(box.min.y / s); y <= Math.floor(box.max.y / s); y++) {
        for (let z = Math.floor(box.min.z / s); z <= Math.floor(box.max.z / s); z++) visit(`${x},${y},${z}`);
      }
    }
  }

  _candidates(position, offsets, radius) {
    const bounds = this._queryBounds.makeEmpty();
    for (const offset of offsets) bounds.expandByPoint(this._closest.copy(position).add(offset));
    bounds.expandByScalar(radius);
    const candidates = new Set();
    this._cells(bounds, key => {
      for (const index of this.grid.get(key) || []) candidates.add(index);
    });
    return candidates;
  }

  _penetration(center, box, radius) {
    const closest = this._closest.copy(center).clamp(box.min, box.max);
    const normal = this._normal.subVectors(center, closest);
    const distanceSq = normal.lengthSq();
    if (distanceSq >= radius * radius - EPSILON * EPSILON) return 0;
    if (distanceSq > EPSILON * EPSILON) {
      const distance = Math.sqrt(distanceSq);
      normal.multiplyScalar(1 / distance);
      return radius - distance;
    }
    // A center already inside a solid (for example after changing body size)
    // exits through its nearest face rather than producing a zero normal.
    let depth = Infinity, axis = 'x', sign = -1;
    for (const candidateAxis of AXES) {
      const low = center[candidateAxis] - box.min[candidateAxis];
      const high = box.max[candidateAxis] - center[candidateAxis];
      if (low < depth) { depth = low; axis = candidateAxis; sign = -1; }
      if (high < depth) { depth = high; axis = candidateAxis; sign = 1; }
    }
    normal.set(0, 0, 0); normal[axis] = sign;
    return depth + radius;
  }

  // Mutates the actual world-space body center and velocity. `length` is the
  // full capsule length, including caps; length <= 2*radius makes a sphere.
  // Returns contact status even for depenetration with zero displacement.
  move(position, displacement, {
    radius = .55, length = 2, yaw = 0, pitch = 0, padding = .08,
    step = .2, iterations = 4
  } = {}, velocity) {
    radius = Math.max(.03, Number.isFinite(radius) ? radius : .55);
    padding = Math.max(0, Number.isFinite(padding) ? padding : .08);
    length = Math.max(0, Number.isFinite(length) ? length : 2);
    yaw = Number.isFinite(yaw) ? yaw : 0; pitch = Number.isFinite(pitch) ? pitch : 0;
    iterations = Math.min(32, Math.max(1, Math.floor(iterations) || 4));
    const half = Math.max(0, length / 2 - radius);
    const intervals = half ? Math.max(1, Math.ceil(half * 2 / (radius * .8))) : 0;
    const spacing = intervals ? half * 2 / intervals : 0;
    // Slightly inflate overlapping samples to cover the capsule between their
    // centers, avoiding narrow gaps caused by a scalloped chain of spheres.
    const sampleRadius = Math.hypot(radius + padding, spacing / 2);
    const heading = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const offsets = Array.from({ length: intervals + 1 }, (_, i) => heading.clone().multiplyScalar(intervals ? -half + i * spacing : 0));
    const requestedStep = Number.isFinite(step) && step > 0 ? step : .2;
    const stepLength = Math.max(.01, Math.min(requestedStep, radius * .45));
    const steps = Math.max(1, Math.ceil(displacement.length() / stepLength));
    const delta = displacement.clone().multiplyScalar(1 / steps), center = new THREE.Vector3();
    let contacts = 0;
    const slide = vector => {
      if (!vector) return;
      const inward = vector.dot(this._normal);
      if (inward < 0) vector.addScaledVector(this._normal, -inward);
    };
    const resolve = passes => {
      for (let pass = 0; pass < passes; pass++) {
        let touched = false;
        const candidates = this._candidates(position, offsets, sampleRadius);
        for (const index of candidates) {
          const box = this.boxes[index].box;
          for (const offset of offsets) {
            center.copy(position).add(offset);
            const depth = this._penetration(center, box, sampleRadius);
            if (depth <= EPSILON) continue;
            position.addScaledVector(this._normal, depth + EPSILON);
            slide(delta); slide(velocity);
            contacts++; touched = true;
          }
        }
        if (!touched) break;
      }
    };
    const overlaps = candidate => {
      for (const index of this._candidates(candidate, offsets, sampleRadius)) {
        for (const offset of offsets) {
          center.copy(candidate).add(offset);
          if (this._penetration(center, this.boxes[index].box, sampleRadius) > EPSILON) return true;
        }
      }
      return false;
    };
    // Recovery also runs while stationary, so resizing/turning cannot leave
    // the swimmer embedded. Each movement step is shorter than body radius.
    resolve(Math.max(8, iterations * 2));
    if (overlaps(position)) {
      // Intersecting coral proxies can trap iterative face projections in a
      // corner. Search nearby clear positions only for an already embedded
      // start. Ordinary swimming never uses this escape/teleport recovery.
      const origin = position.clone(), trial = new THREE.Vector3();
      const directions = [new THREE.Vector3(0, 1, 0)];
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        if (x || y || z) directions.push(new THREE.Vector3(x, y, z).normalize());
      }
      const increment = Math.max(.1, radius * .5), reach = Math.max(3, length * 2 + radius * 4);
      let recovered = false;
      for (let distance = increment; distance <= reach && !recovered; distance += increment) {
        for (const direction of directions) {
          trial.copy(origin).addScaledVector(direction, distance);
          if (overlaps(trial)) continue;
          position.copy(trial); this._normal.copy(direction); slide(delta); slide(velocity);
          contacts++; recovered = true; break;
        }
      }
    }
    let unresolved = overlaps(position);
    const previous = new THREE.Vector3();
    if (!unresolved) for (let i = 0; i < steps; i++) {
      previous.copy(position); position.add(delta); resolve(iterations);
      if (overlaps(position)) {
        // A tight passage may not converge within the chosen solver budget.
        // Keep the last clear center rather than ending embedded in a branch.
        position.copy(previous); delta.set(0, 0, 0); contacts++; break;
      }
    }
    this.blocked = contacts > 0;
    return { blocked: this.blocked, contacts, steps, unresolved };
  }
}

export function createCollisionWorld(root, options) {
  const world = new CollisionWorld(options);
  root.updateWorldMatrix(true, true);
  root.traverse(mesh => {
    if (mesh.isInstancedMesh && mesh.userData.collisionKind) world.addInstancedMesh(mesh, mesh.userData.collisionKind);
  });
  return world;
}
