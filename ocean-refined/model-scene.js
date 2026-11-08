import * as THREE from './vendor/three.module.min.js';
import { turn as nextTask } from './assets.js';
import { buildHelmet, buildNursery, buildNautilus, buildDescentLine, buildFishingBoat } from './landmark-builds.js';
import { RESUME_SITE, NURSERY_SITE } from './reef.js';

// The portfolio landmarks, built in code (landmark-builds.js): nothing is downloaded. The coral habitats that used to be
// downloaded here (five imported sculptures, fifteen copies, with a prepared cache of them) are gone: the reef's corals
// are all made in code now (reef.js, hero-formations.js, coral-varieties.js and the coral set, user-corals.js).
// Kept so world.js can go on asking for the landmark files early: there are none to fetch.
export function fetchLandmarkFiles() {}
export function prefetchLandmarks() { return Promise.resolve(); }

function report(onStatus, id, status, extra = {}) {
  onStatus?.({ id, status, ...extra });
}

// The landmarks counted in the load status: the helmet, the trawler and the nautilus.
const TOTAL = 3;

export function createModelScene({ reef, terrainHeightAt, collisions, economy = false, onStatus } = {}) {
  const root = new THREE.Group();
  root.name = 'Uploaded ocean landmarks';
  // What shows above the water: the descent line's buoy. world.js adds it to the scene beside root, which is hidden at the surface.
  const surface = new THREE.Group();
  surface.name = 'Landmark surface markers';
  const landmarkGroups = new Map();
  // The built landmarks by id (landmark-builds.js): their reveals and per-frame motion.
  const built = new Map();
  let loadPromise = null;
  let disposed = false;
  let motionEnabled = false;
  let reefFishCount = 0;
  let reefFishGroups = 0;
  let loaded = 0;
  let failed = 0;

  // Each approach point faces an open lane, away from the landmark proxy.
  const floorAt = (x, z) => terrainHeightAt?.(x, z) ?? -12;
  const landmarks = [
    { id: 'about', position: [-12, floorAt(-12, -15) + 1.4, -15], interactionPosition: [-6.8, floorAt(-12, -15) + 5.3, -15], maxRange: 6.2 },
    { id: 'experience', position: [-18, floorAt(-18, -82) + 1.3, -82], interactionPosition: [-12, floorAt(-18, -82) + 4.3, -82], maxRange: 6.5 },
    { id: 'projects', position: [18, floorAt(18, -39) + 1.6, -39], interactionPosition: [24, floorAt(18, -39) + 4.4, -39], maxRange: 6.5 },
    // The résumé slate hangs at safety-stop depth on the descent line (reef.js RESUME_SITE), not on the sand.
    // Read from the wreck's side of the line (west), where the diver comes up to it.
    { id: 'resume', position: [...RESUME_SITE.position], interactionPosition: [RESUME_SITE.position[0] - 2.8, RESUME_SITE.position[1], RESUME_SITE.position[2]], maxRange: 4 }
  ];

  const positions = new Map(landmarks.map(item => [item.id, item.position]));
  // A built landmark sets where it is read from (its focus box's centre) and where the diver hovers to read it.
  function updateLandmark(id, focus, approach) {
    const landmark = landmarks.find(item => item.id === id);
    if (!landmark) return;
    const center = focus.getCenter(new THREE.Vector3());
    landmark.position.splice(0, 3, ...center.toArray());
    landmark.interactionPosition.splice(0, 3, ...approach.toArray());
    landmark.maxRange = Math.max(landmark.maxRange, approach.distanceTo(center) + .9);
  }
  function addStaticProxy(box, name) {
    if (!collisions?.addBox || box.isEmpty()) return;
    const bounds = box.clone();
    const scale = bounds.getSize(new THREE.Vector3());
    if (scale.x < .18) { bounds.min.x -= .09; bounds.max.x += .09; }
    if (scale.y < .18) { bounds.min.y -= .09; bounds.max.y += .09; }
    if (scale.z < .18) { bounds.min.z -= .09; bounds.max.z += .09; }
    collisions.addBox(bounds, { mesh: name, imported: true });
  }

  // Builds a landmark in place on the terrain, gives it collision boxes and its reading position, and keeps its
  // reveal. The model status counts it as one of the TOTAL landmarks.
  // A feature (the nursery) is built the same way at its own spot, with no reading position.
  async function placeBuilt(id, key, build, counted = true, at = null) {
    await nextTask();
    if (disposed) return;
    const [x, , z] = at ? [at.x, 0, at.z] : positions.get(id);
    const site = build({ x, z, floorAt, economy });
    root.add(site.root);
    for (const object of site.free || []) root.add(object);
    if (site.surface) surface.add(site.surface);
    landmarkGroups.set(id, site.root);
    site.root.updateWorldMatrix(true, true);
    for (const [index, solid] of site.solids.entries()) addStaticProxy(solid.isBox3 ? solid : solid.box, solid.name || `${id} landmark ${index + 1}`);
    if (!at) updateLandmark(id, site.focus, site.approach);
    built.set(id, site);
    if (counted) { loaded++; report(onStatus, key, 'loaded', { loaded, total: TOTAL }); }
    await nextTask();
  }

  function load() {
    if (loadPromise) return loadPromise;
    report(onStatus, 'models', 'loading', { loaded: 0, total: TOTAL });
    const jobs = [
      () => placeBuilt('about', 'about-helmet', buildHelmet),
      () => placeBuilt('projects', 'projects-trawler', buildFishingBoat),
      () => placeBuilt('nursery', 'coral-nursery', buildNursery, false, NURSERY_SITE),
      () => placeBuilt('experience', 'experience-nautilus', buildNautilus),
      () => placeBuilt('resume', 'resume-line', buildDescentLine, false)
    ];
    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        try { await job(); }
        catch (error) {
          failed++;
          report(onStatus, 'optional-model', 'fallback', { message: String(error?.message || error), loaded, total: TOTAL });
        }
      }
    };
    loadPromise = Promise.all([worker(), worker()]).then(() => {
      root.updateWorldMatrix(true, true);
      report(onStatus, 'models', 'ready', { loaded, failed, reefFishGroups, reefFishCount, total: TOTAL });
      return { loaded, failed, reefFishGroups, reefFishCount };
    });
    return loadPromise;
  }

  function update(dt, elapsed, playerPosition, night = 0, view = null) {
    // The same 0.1 s cap as the rest of the world, so clips do not slow down against movement below 20 fps.
    const step = Math.min(Math.max(dt || 0, 0), .1);
    motionEnabled = step > 0;
    const eye = playerPosition?.isVector3 ? playerPosition : null;
    for (const site of built.values()) site.update(step, elapsed, eye);
  }

  // The surface markers move with the waves, above water as well as below (world.js calls this from the sky's update).
  function updateSurface(elapsed) {
    for (const site of built.values()) site.updateSurface?.(elapsed);
  }

  // Opening: the seconds the landmark's reveal takes before its records should open (0 where it is immediate, or motion
  // is off); closing: true. False for a site with nothing built (landmark-interactions.js then opens at once).
  function interact(id, open = true) {
    const site = built.get(id);
    if (!site) return false;
    return site.reveal(open, motionEnabled);
  }

  function dispose() {
    disposed = true;
    for (const site of built.values()) site.dispose?.();
    const release = object => {
      if (!object.isMesh) return;
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material?.dispose?.());
    };
    root.traverse(release);
    surface.traverse(release);
  }

  return {
    root, surface, load, update, updateSurface, interact, dispose, landmarks,
    get fishCount() { return reefFishCount; },
    get reefFishGroups() { return reefFishGroups; }
  };
}
