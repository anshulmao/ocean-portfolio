import { toDisplayDepth } from './depth-metrics.js';

// The guided dive as data (release/guided-dive/SPEC.md, round 4). guided-dive.js runs it; nothing here moves anything.
// Coordinates are world metres (x, y, z), y negative below the surface; "right" is +x from the entry, facing −z.
// Every leg is checked against the real reef in tools/test-guided-motion.mjs, so a point that moves needs that test to pass.
//
// The tour waits at five moments only: the welcome, the three portfolio sites and the ending. Everything between them is
// a fly-by: the swim carries on, slows, the camera glances at what is passing and a one-line caption names it.
//
// A step:
//   kind     intro: the welcome, read where the diver levels out; waits for Continue (N).
//            stop:  a portfolio site; the camera turns to the landmark and waits for Continue. Read it (F) opens `opens`.
//            end:   the ending; the visitor chooses to keep exploring or surface.
//   at       where the diver swims to (the welcome: where it drifts to); `landmark` takes it from the placed model instead.
//   view     a stop's own viewpoint: a point, or { behind, near, distance, rise } to stand squarely in front of the landmark
//            with that resident lined up behind it. Every stop is approached on the line from its subject (guided-dive.js
//            APPROACH), so the diver arrives facing it.
//   via      the leg's scenic route, used when the tour arrives from the step before. A point is [x, y, z]; a fly-by is
//            { at, key, title, line, ... } and is a point of the route too:
//              orbit    { around, radius, turn, rise }: round that stop's landmark from where the last stop left off, the
//                       turn (degrees) taken the way that ends nearer what comes next.
//              look     what the camera glances at as it passes: a point, { visitor: id } (an animal, followed as it
//                       swims), { resident: id, near } (an animal where it settled, near standing in until it loads) or
//                       { bait: true } (the bait ball, which wanders slowly round its home; followed too).
//              through  the swim from here goes straight through the bait ball's middle as it is now, and out the far side,
//                       then on: the next fly-by is the swim through it.
//                       Without one the view stays on the course.
//              hold     seconds the fly-by lasts (default FLYBY), cut short (after BRIEF at least) by the next one
//                       coming into reach; slow: the pace through it, a fraction of the cruise.
//              reach    how near (m) the diver comes before it begins (default REACH).
//              scooter  the guide runs the scooter through it, for the visitor to see. The boost (2.2×) is on top of
//                       slow, so .7 makes about 5.5 m/s.
//              teach    the control it introduces (skipped if tried); wait: the same control, waited for (up to 7 s, the
//                       swim all but still) before the fly-by goes on.
//              encounter  an animal called in on its own course: `course` is the line of its pass, measured from this
//                       fly-by's point, and `cue` how far ahead (m) it is called so it arrives during the fly-by.
//   pan      what the camera looks at, in turn, once there (the welcome and the ending).
//   teach    the control this step introduces; speed: the swim's pace for the leg into it (m/s); lead: how far out (m)
//            the camera starts turning to a stop's subject (guided-dive.js LEAD otherwise).
// Framing (round 5): a fly-by passes its subject 15–22 m off and looks at its middle, so the whole of it is in view, even
// through a phone's narrow portrait lens (about 26° across). Every leg keeps clear of the wreck, masts and sails included
// (they have no collision volume), and well wide of the barracuda's beat east of it, so it never bolts.
// The whale shark's course (SPEC D4): east to west over the deep water, never in over the shallows. Its line lies 22 m out
// to sea of the drift (side 1 at angle π/2 puts it at lower z, over 60 m of water) and only 7 m above, so it passes
// side-on rather than overhead. It starts 14 m short of its closest approach and is called 26 m before the drift.
// Copy is a signpost, not a summary: one short line. The portfolio itself lives in the archive.
export const SPEED = 3.6, FLYBY = 5, REACH = 9, SLOW = .5, BRIEF = 2.5;
const depth = y => `${Math.round(toDisplayDepth(-y))} m`;

export const STEPS = [
  // The site starts at the surface out over the deep end, west of the anchor (exploration.js SURFACE_START). The welcome is
  // read as the guide drifts in toward the reef, and the controls are tried on the way.
  { key: 'welcome', kind: 'intro', at: [-22, -12, -66], place: 'Guided dive', title: 'This is the reef',
    line: 'This is my portfolio, as a reef. You’re going to have a fun time. Try the controls as we swim in.',
    short: 'My portfolio, as a reef. Try the controls as we swim in.',
    // The reef rising ahead, the barracuda wheel off to the right, the wreck down to the left.
    pan: [[-22, -18, -30], [-36, -20, -44], [18, -21, -39], [-22, -16, -36]] },
  // The reef is still a way off, so the scooter comes first. Then out to the right of the anchor (the west), with the
  // barracuda wheel off to the left, over the pink whipray and past the brain coral dome, and round to the anchor from the
  // north, squarely in front of it with the nurse shark lined up behind it. Each subject 15-18 m off, so it reads whole, and
  // far enough apart that the view hands one to the next without hurrying.
  { key: 'about', kind: 'stop', landmark: 'about', opens: 'glance', place: `About · The Anchor · ${depth(-9)}`, signal: '#7ff0cf',
    view: { behind: 'sleeper', near: [-19, -12.6, -22], distance: 10, rise: 2 },
    title: 'This anchor is me', line: 'Open it for my portfolio at a glance: who I am and where everything lives.',
    via: [
      { at: [-28, -12, -56], key: 'scooter', title: 'The scooter', line: 'The reef is a way off yet. Let’s take the scooter.',
        scooter: true, teach: 'scooter', wait: 'scooter', hold: 5, slow: .7 },
      [-40, -13, -52],
      { at: [-52, -14, -44], key: 'barracuda', title: 'A barracuda wheel', line: 'Young barracuda turning slowly in mid-water.',
        look: [-36, -20, -44], hold: 6 },
      [-54, -14, -34],
      { at: [-56, -13, -22], key: 'whipray', title: 'A pink whipray', line: 'It glides low over the sand by the cleaning reef.',
        look: { resident: 'whipray', near: [-41, -23, -16] }, hold: 6 },
      { at: [-58, -10, -4], key: 'brain-coral', title: 'The brain coral dome', line: 'A giant moray keeps a den at its foot.',
        look: [-42, -16, -2], hold: 6 },
      // Round the north of the anchor, to come in to it from in front.
      [-52, -8, 10], [-38, -6, 14], [-24, -6, 10], [-16, -6, 4],
    ] },
  // Round the anchor to the nurse shark asleep behind it, then across the reef shelf, by the table coral tower, straight down to the pillar coral cathedral's open front, down the east side to the gully, through the limestone arch
  // (reef.js: the arch at 20, -72) and over the lantern garden to the treasure: the deepest stop comes first, as on a real dive.
  { key: 'experience', kind: 'stop', landmark: 'experience', view: [-13.5, -43.2, -74.2], teach: 'computer', lead: 30, place: `Experience · The Treasure · ${depth(-45)}`, signal: '#ffcf7a',
    title: 'The treasure', line: 'This is where you’ll find my experience.',
    via: [
      { orbit: { around: 'about', radius: 11, turn: 110, rise: 2.5 }, at: [-6, -7, -20], key: 'nurse', title: 'A nurse shark, asleep',
        line: 'Nurse sharks rest on the sand by day. Let it be.', look: { resident: 'sleeper', near: [-19, -12.6, -22] }, hold: 8, slow: .45, reach: 4 },
      [6, -9, -24],
      { at: [22, -12, -14], key: 'tower', title: 'The table coral tower', line: 'Plates of coral stacked up a leaning stone trunk.',
        look: [38, -15.5, -8], hold: 6 },
      // Straight down from the tower to look in at the cathedral's open side, which faces the wreck (hero-formations.js
      // `open`): a gentle descent under the barracuda's beat (9 m off it: it bolts only inside 6 m, user-creatures.js),
      // over the rock in front of the cathedral and clear of the wreck. The fly-by stays within about 40° of the open
      // side, 15 m out.
      [28, -17.5, -19], [32, -21, -24], [34.5, -22.5, -29],
      { at: [35, -23, -35], key: 'cathedral', title: 'The pillar coral cathedral', line: 'Organ-pipe columns in a horseshoe.',
        look: [48, -23.5, -28], hold: 6, reach: 9 },
      // Down to the arch: a glimpse, with no caption and no slowing, out past the gully's edge into the deep blue to the
      // south (it stays off the diver's side as the swim turns west for the arch), rather than the gully floor ahead the
      // whole way. One look between the cathedral and the arch, so the view is never turned twice in quick succession.
      [37, -27.5, -47],
      { at: [38, -32, -54], key: 'open-water-glimpse', look: [36, -44, -84], hold: 7, slow: 1, reach: 6 },
      [32, -37, -57], [24, -40, -58.5], [21, -43.5, -60],
      { at: [20, -46.4, -62.6], key: 'arch', title: 'Through the arch', line: 'A limestone arch over the gully. In we go.',
        look: [20, -48, -72], teach: 'lamp', wait: 'lamp', hold: 6 },
      [20, -49, -66], [20, -51, -70], [20, -51.6, -79],
      { at: [20, -50, -84], key: 'lanterns', title: 'The lantern garden', line: 'Soft lights on the deep ledge.',
        look: [8, -55, -86], reach: 6 },
      [4, -47, -74],
    ] },
  // The way up: along the deep ledge to the soft coral spire, where the swim drifts while a whale shark passes out to sea,
  // through the bait ball, and round the west of the wreck (clear of its masts and the barracuda's beat) to see it whole.
  { key: 'projects', kind: 'stop', landmark: 'projects', view: [2, -19, -36], place: `Projects · The Wreck · ${depth(-21)}`, signal: '#c9a2ff',
    title: 'Here’s the wreck', line: 'This is where you’ll find my projects.',
    via: [
      [-6, -46, -79], [8, -47, -86], [24, -47, -84],
      { at: [36, -45, -79], key: 'whale-shark', title: 'Look out to sea', line: 'A whale shark, passing over the deep water.',
        look: { visitor: 'whale-shark' }, teach: 'photo', hold: 9, slow: .12, reach: 7,
        encounter: { id: 'whale-shark', cue: 26, course: { angle: Math.PI / 2, side: 1, pass: 22, y: -38, ahead: 14 } } },
      // Up to the bait ball's depth, a look across at it, then straight through its middle and out the far side.
      { at: [38, -31, -78], key: 'bait-ahead', title: 'A bait ball, ahead', line: 'Thousands of fry turning as one. We’ll swim straight through it.',
        look: { bait: true }, through: true, hold: 5, slow: .35, reach: 8 },
      { at: [48, -28, -67], key: 'bait-ball', title: 'Through the bait ball', line: 'They open a tunnel around you.',
        slow: .6, hold: 4, reach: 6 },
      [34, -26, -58], [14, -28, -55], [-10, -22, -44],
    ] },
  // Up into open water just seaward of the wreck, with the whole reef rising ahead.
  { key: 'open-water', kind: 'end', at: [16, -11, -58], teach: 'view', place: `Above the wreck · ${depth(-11)}`, signal: '#ff9d8a',
    title: 'This is my reef', line: 'My portfolio lives here. Dive around on your own and look at the life, or head up when you’re ready.',
    short: 'My portfolio lives here. Explore on your own, or head up.',
    via: [[-2, -15, -46], [6, -12, -56]],
    // The wreck below, the reef rising beyond it to the shallows, and the tower off to the right.
    pan: [[18, -21, -39], [0, -10, -6], [38, -15.5, -8]] },
];
// Shown on the At a glance page, only while the tour is on (D6).
export const WELCOME = 'Hi, I’m Anshul. Welcome to my portfolio: a dive world I made for you to explore my work. You’re free to swim off, or continue the guided dive from here.';
// The fly-bys of a step's scenic route, and where any route point is.
export const flyBys = step => (step.via ?? []).filter(item => !Array.isArray(item));
export const pointOf = item => Array.isArray(item) ? item : item.at;
