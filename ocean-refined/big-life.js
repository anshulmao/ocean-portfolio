import { onFrame } from './journey.js';
import { pointAt } from './look-indicator.js';

// The big animals, on every dive (release/guided-dive/SPEC.md, review round 3): whoever is diving, on the guided dive or
// not, is shown the great visitors as they pass, and meets at least one of them. user-creatures.js brings them in on its own
// schedule; if none of BIG has come by GUARANTEE seconds into a dive, one is called in.
// NOTED: what the look-there marker points out, with how near one must be to be worth turning for (m).
const NOTED = { 'whale-shark': ['Whale shark', 90], whale: ['A whale', 110], orcas: ['Orcas', 90], dolphins: ['Dolphins', 50], blacktips: ['Reef sharks', 40] };
const BIG = ['whale-shark', 'whale', 'orcas', 'dolphins'], GUARANTEE = 30, SEEN_AFTER = 2.4;
// pointed: visitors seen on their current pass. marked: the one the marker is on, and how long it has been in view.
const pointed = new Set();
let marked = null, markedFor = 0, diveFor = 0, metBig = false, calling = null;

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
    const noted = NOTED[item.id]; if (!noted || pointed.has(item.id)) continue;
    const d = Math.hypot(item.x - px, item.y - py, item.z - pz);
    if (d < noted[1] && d < nearest) { nearest = d; subject = item; }
  }
  if (!subject) { if (marked) { pointAt(camera, null); marked = null; } return; }
  if (marked !== subject.id) { marked = subject.id; markedFor = 0; }
  const rise = subject.y - py, where = rise > 4 ? 'above' : rise < -4 ? 'below' : 'nearby';
  markedFor = pointAt(camera, [subject.x, subject.y, subject.z], `${NOTED[subject.id][0]} · ${where}`) ? markedFor + dt : 0;
  if (markedFor > SEEN_AFTER) { pointed.add(subject.id); pointAt(camera, null); marked = null; }
}
onFrame((dt, api, state, diving) => {
  // A new dive starts the count again; reading the records or the settings hides the marker meanwhile.
  if (!diving) { diveFor = 0; metBig = false; calling = null; pointed.clear(); if (marked) { pointAt(null); marked = null; } return; }
  const live = api.visitors?.() ?? [];
  guarantee(dt, api, live);
  if (api.nav?.suspended) { if (marked) { pointAt(null); marked = null; } return; }
  lookThere(dt, api, state, live);
});
