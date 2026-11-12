import { onFrame, SITES } from './journey.js';
import { toDisplayDepth } from './depth-metrics.js';
import { LANDMARKS } from './reef.js';
import { SPECIES, SPECIES_OF_MODEL } from './field-guide.js';
import { Vector3 } from './vendor/three.module.min.js';

// The dive log behind the dive summary (dive-summary.js): while a dive lasts it keeps the depth over time, the path
// swum, the sites and reef features passed, the species seen and the photos taken; when the diver surfaces it hands
// the whole record over as `oceandivelog`. Photos stay in this page's memory only: nothing is stored on the device,
// and a photo leaves it only when the diver shares it (submissions.js).
export { SITES };
// Reef features as the site map charts them, until the scene's own list is available; the arch is not a formation.
const CHARTED = [['Table coral tower', 38, -8, 6], ['Brain coral dome', -42, -2, 8], ['Pillar coral cathedral', 48, -28, 8], ['Kelp grove', -50, -52, 8.5], ['Giant clam', -9, -54, 3.5], ['Soft coral spire', 50, -72, 6], ['Lantern garden', 8, -86, 6.5]];
const ARCH = ['The arch', 20, -83, 6];
// SAMPLE: seconds between points of the profile and the track. LOOK: seconds between looks for animals. SEEN_AFTER:
// seconds an animal must be in view, and near enough to make out (REACH), before it counts as seen.
const SAMPLE = 2, LOOK = .5, SEEN_AFTER = 1.5;
// A site counts as visited within this many metres (horizontal) of it; a feature within its radius plus FEATURE_REACH.
const SITE_REACH = 16, FEATURE_REACH = 7;
// ...and within this many metres of it in height (world metres).
const SITE_DEPTH = 14;
// Photos and dives kept for the session, oldest let go first.
const KEEP_PHOTOS = 40, KEEP_DIVES = 20;
const remember = (key, fallback) => { try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const keep = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} };

const photos = [], dives = [];
let dive = null, last = null, number = remember('ocean-dive-number', 0);
// Species seen on any dive this session: the summary marks a first sighting as new.
const everSeen = new Set(remember('ocean-seen', []));
let sampleIn = 0, lookIn = 0;
const dwell = new Map();

export function features() {
  const live = window.oceanControls?.formations;
  const list = live?.length ? live.map(item => [item.name, item.position[0], item.position[2], item.radius]) : CHARTED;
  return [...list, ARCH];
}
function landmarkAt(id) {
  const placed = window.oceanControls?.models?.landmarks?.find(item => item.id === id);
  return placed?.position || LANDMARKS.find(item => item.id === id).position;
}
// Where the diver is, in words: the site or feature they are at, or else the stretch of reef by depth.
export function placeAt(x, z, depth, open = false) {
  for (const id of Object.keys(SITES)) { const [lx, , lz] = landmarkAt(id); if (Math.hypot(x - lx, z - lz) < SITE_REACH + 6) return SITES[id].name; }
  for (const [name, fx, fz, radius] of features()) if (Math.hypot(x - fx, z - fz) < radius + FEATURE_REACH + 4) return name;
  if (open) return 'Open blue';
  return depth < 11 ? 'Coral gardens' : depth < 23 ? 'The reef slope' : 'The deep ledge';
}

function begin() {
  number += 1; keep('ocean-dive-number', number);
  dive = { number, started: Date.now(), time: 0, maxDepth: 0, depthSum: 0, profile: [[0, 0]], track: [], sites: {}, features: {}, seen: {}, photos: [], safetyStop: false };
  sampleIn = 0; lookIn = 0; dwell.clear();
}
function look(controls, player, depth) {
  const list = controls.creatures?.sites?.(); if (!list) return;
  const eye = controls.getCamera?.()?.position || player, near = new Set();
  for (const item of list) {
    const species = SPECIES_OF_MODEL[item.species];
    if (!item.seen || !species || dive.seen[species]) continue;
    const [x, y, z] = item.position, distance = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
    // Animals (item.length: their length in the scene) are made out further off the bigger they are; schools
    // (item.length: the spread of the group) from a dozen metres beyond their edge.
    const reach = item.kind === 'animal' ? Math.min(40, Math.max(8, item.length * 6)) : item.length + 12;
    if (distance < reach) near.add(species);
  }
  for (const species of near) {
    const held = (dwell.get(species) || 0) + LOOK; dwell.set(species, held);
    if (held < SEEN_AFTER) continue;
    const visitor = ['right-whale', 'whale-shark', 'orca', 'bottlenose-dolphin', 'yellowfin-tuna', 'scalloped-hammerhead', 'manta-ray', 'spotted-eagle-ray'].includes(species);
    dive.seen[species] = { t: Math.round(dive.time), depth: +depth.toFixed(1), place: placeAt(player.x, player.z, depth, visitor), fresh: !everSeen.has(species) };
    everSeen.add(species); keep('ocean-seen', [...everSeen]);
  }
  for (const species of dwell.keys()) if (!near.has(species)) dwell.set(species, Math.max(0, dwell.get(species) - LOOK));
}

onFrame((dt, controls, state, diving, player) => {
  if (!diving) return;
  if (!dive) begin();
  dive.time += dt;
  const depth = toDisplayDepth(-player.y);
  dive.maxDepth = Math.max(dive.maxDepth, depth); dive.depthSum += depth * dt;
  if ((sampleIn -= dt) <= 0) {
    sampleIn = SAMPLE;
    dive.profile.push([+dive.time.toFixed(1), +depth.toFixed(1)]);
    dive.track.push([+player.x.toFixed(1), +player.z.toFixed(1)]);
    // Reached means down at it, not passing over it: the dive begins at the surface right above the nautilus, and it was
    // logged as reached at 0:00 and 5 m, so its real visit at 45 m never was.
    for (const id of Object.keys(SITES)) {
      const [x, y, z] = landmarkAt(id);
      if (!dive.sites[id] && Math.hypot(player.x - x, player.z - z) < SITE_REACH && Math.abs(player.y - y) < SITE_DEPTH) dive.sites[id] = { t: Math.round(dive.time), depth: +depth.toFixed(1) };
    }
    for (const [name, x, z, radius] of features()) if (!dive.features[name] && Math.hypot(player.x - x, player.z - z) < radius + FEATURE_REACH) dive.features[name] = Math.round(dive.time);
  }
  if ((lookIn -= dt) <= 0) { lookIn = LOOK; look(controls, player, depth); }
});
addEventListener('oceansafetystopcomplete', () => { if (dive) dive.safetyStop = true; });
// journey.js ends the dive when the diver is back at the surface; a dive of a few seconds is not worth a summary.
addEventListener('oceandiveend', ({ detail }) => {
  if (!dive) return;
  const record = dive; dive = null;
  if (detail.time < 4) { number -= 1; keep('ocean-dive-number', number); return; }
  record.time = detail.time; record.maxDepth = detail.maxDepth;
  record.profile.push([+record.time.toFixed(1), 0]);
  record.averageDepth = record.time ? record.depthSum / record.time : 0;
  record.found = detail.found; record.ended = Date.now();
  last = record; dives.push(record); while (dives.length > KEEP_DIVES) dives.shift();
  dispatchEvent(new CustomEvent('oceandivelog', { detail: record }));
});

// The animal a photo is of, if there is one in the frame: of the animals near enough to be made out (as look() counts
// them seen), the one nearest the middle of the picture, where a big or close animal may sit further off it. Read in
// the frame the photo is taken in. It does not know what stands in front of an animal: one behind the reef can be named.
//   FRAME: how far from the middle (the picture's half-width and half-height are 1) an animal's middle may be.
const FRAME = .62, spot = new Vector3();
export function subjectInView(controls) {
  const list = controls?.creatures?.sites?.(), camera = controls?.getCamera?.(); if (!list || !camera) return null;
  let best = null, least = Infinity;
  for (const item of list) {
    const species = SPECIES_OF_MODEL[item.species]; if (!item.seen || !species) continue;
    const distance = camera.position.distanceTo(spot.fromArray(item.position));
    if (distance > (item.kind === 'animal' ? Math.min(40, Math.max(8, item.length * 6)) : item.length + 12)) continue;
    spot.project(camera); if (spot.z > 1) continue;
    const size = Math.min(.5, item.length / Math.max(distance, 1)), off = Math.hypot(spot.x, spot.y) - size;
    if (off < FRAME && off < least) { least = off; best = species; }
  }
  const found = best && SPECIES.find(item => item.id === best);
  return found ? { id: found.id, name: found.name } : null;
}
// A photo taken underwater: `full` is the image as taken, `share` the copy small enough to send (both JPEG blobs);
// `subject` the animal it is of (subjectInView), if any. `title` is what the photo is called wherever it is shown: the
// animal, or else the place it was taken (`place`, kept either way). An animal photographed counts as seen.
export function addPhoto(full, share, subject = null) {
  const player = window.oceanDiagnostics?.playerPosition || [0, 0, 0], depth = toDisplayDepth(-player[1]), place = placeAt(player[0], player[2], depth);
  const photo = { id: crypto.randomUUID(), full, share, url: URL.createObjectURL(share), dive: dive?.number ?? number, t: Math.round(dive?.time ?? 0), depth: +depth.toFixed(1), place, species: subject?.id ?? null, title: subject?.name ?? place, shared: false };
  if (subject && dive && !dive.seen[subject.id]) { dive.seen[subject.id] = { t: photo.t, depth: photo.depth, place, fresh: !everSeen.has(subject.id) }; everSeen.add(subject.id); keep('ocean-seen', [...everSeen]); }
  photos.push(photo); dive?.photos.push(photo.id);
  while (photos.length > KEEP_PHOTOS) URL.revokeObjectURL(photos.shift().url);
  return photo;
}
window.oceanDiveLog = { get current() { return dive; }, get last() { return last; }, get dives() { return dives; }, get photos() { return photos; }, get seenEver() { return everSeen; } };
