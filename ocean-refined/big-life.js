import { onFrame } from './journey.js';
import { pointAt, inView } from './look-indicator.js';

// The big animals, on every dive (release/guided-dive/SPEC.md, review round 3): whoever is diving, on the guided dive or
// not, is shown the great visitors as they pass, and meets at least one of them. user-creatures.js brings them in on its own
// schedule; if none of BIG has come by GUARANTEE seconds into a dive, one is called in.
// NOTED: what the look-there marker points out, with how near one must be to be worth turning for (m).
const NOTED = { 'whale-shark': ['Whale shark', 90], whale: ['A whale', 110], orcas: ['Orcas', 90], dolphins: ['Dolphins', 50], blacktips: ['Reef sharks', 40], hammerheads: ['Hammerheads', 60], manta: ['Manta rays', 80], 'eagle-rays': ['Eagle rays', 50] };
const BIG = ['whale-shark', 'whale', 'orcas', 'dolphins'], GUARANTEE = 30, SEEN_AFTER = 2.4;
// pointed: visitors seen on their current pass. marked: the one the marker is on, and how long it has been in view.
const pointed = new Set();
let marked = null, markedFor = 0, diveFor = 0, metBig = false, calling = null;
// guiding: the marker is the arrow back to the guided dive's subject.
let guiding = false;

function guarantee(dt, api, live) {
  diveFor += dt;
  if (!metBig && live.some(item => BIG.includes(item.id))) metBig = true;
  if (metBig || diveFor < GUARANTEE) return;
  // One pick a dive, asked for again each frame until the creature set can bring it (it loads after the dive starts).
  calling ??= BIG[Math.floor(Math.random() * BIG.length)];
  if (api.encounter?.(calling)) metBig = true;
}
// Points out the nearest notable visitor not yet seen on this pass; once it has been in view for SEEN_AFTER seconds the
// marker lets it go. A visitor that leaves can be pointed out again on a later pass.
function lookThere(dt, api, state, live) {
  const camera = api.getCamera?.(); if (!camera) return;
  const [px, py, pz] = state.playerPosition;
  for (const id of pointed) if (!live.some(item => item.id === id)) pointed.delete(id);
  let subject = null, nearest = Infinity;
  for (const item of live) {
    // One the guided dive is about to show (it calls the whale shark in early) waits for the tour's own caption first.
    const noted = NOTED[item.id]; if (!noted || pointed.has(item.id) || window.oceanTour?.reserved?.(item.id)) continue;
    const d = Math.hypot(item.x - px, item.y - py, item.z - pz);
    if (d < noted[1] && d < nearest) { nearest = d; subject = item; }
  }
  if (!subject) { if (marked) { pointAt(camera, null); marked = null; } return; }
  // A new sighting is announced as well, so the ambient sound can mark it with a gentle note (ambient-audio.js).
  if (marked !== subject.id) { marked = subject.id; markedFor = 0; dispatchEvent(new CustomEvent('oceansighting', { detail: { ...subject } })); }
  const rise = subject.y - py, where = rise > 4 ? 'above' : rise < -4 ? 'below' : 'nearby';
  markedFor = pointAt(camera, [subject.x, subject.y, subject.z], `${NOTED[subject.id][0]} · ${where}`) ? markedFor + dt : 0;
  if (markedFor > SEEN_AFTER) { pointed.add(subject.id); pointAt(camera, null); marked = null; }
}
onFrame((dt, api, state, diving) => {
  // A new dive starts the count again; reading the records or the settings hides the marker meanwhile.
  if (!diving) { diveFor = 0; metBig = false; calling = null; pointed.clear(); if (marked) { pointAt(null); marked = null; } return; }
  const live = api.visitors?.() ?? [];
  guarantee(dt, api, live);
  if (api.nav?.suspended) { if (marked || guiding) { pointAt(null); marked = null; guiding = false; } return; }
  // The guided dive's own subject comes first (guided-dive.js `subject`: what a fly-by is showing, or the site it waits
  // at). The view is the visitor's, so they may have looked away from it: then an arrow at the edge of the screen
  // points the way back, with its name, from the moment they hold the view away (nav.lookHeld) until it is in view
  // again. It does not show while the guide's own turn to a new subject is still coming round. In view, the marker is
  // free for an animal passing, as before.
  const guide = window.oceanTour?.subject, camera = api.getCamera?.();
  if (guide && camera && (api.nav?.lookHeld || guiding) && !inView(camera, guide.point)) { pointAt(camera, guide.point, guide.label); guiding = true; marked = null; return; }
  if (guiding) { guiding = false; pointAt(camera, null); }
  lookThere(dt, api, state, live);
});
