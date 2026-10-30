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
//   at       where the diver swims to; `landmark` takes it from the placed model instead.
//   via      the leg's scenic route, used when the tour arrives from the step before. A point is [x, y, z]; a fly-by is
//            { at, key, title, line, ... } and is a point of the route too:
//              look     what the camera glances at as it passes: a point, { visitor: id } (an animal, followed as it
//                       swims) or { resident: id, near } (an animal where it settled, near standing in until it loads).
//                       Without one the view stays on the course.
//              hold     seconds the fly-by lasts (default FLYBY), cut short (after BRIEF at least) by the next one
//                       coming into reach; slow: the pace through it, a fraction of the cruise.
//              reach    how near (m) the diver comes before it begins (default REACH).
//              scooter  the guide runs the scooter through it, for the visitor to see. The boost (2.2×) is on top of
//                       slow, so .7 makes about 5.5 m/s.
//              teach    the control it introduces (skipped if tried).
//              encounter  an animal called in on its own course: `course` is the line of its pass, measured from this
//                       fly-by's point, and `cue` how far ahead (m) it is called so it arrives during the fly-by.
//   pan      what the camera looks at, in turn, once there (the welcome and the ending).
//   teach    the control this step introduces; speed: the swim's pace for the leg into it (m/s).
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
  { key: 'welcome', kind: 'intro', place: 'Guided dive', title: 'Welcome to the guided dive',
    line: 'This is my portfolio, as a reef. Look anywhere as we go. There’s a lot of life down here.',
    short: 'This is my portfolio, as a reef. Look anywhere as we go.',
    pan: [[-12, -9, -15], [26, -14, -10], [0, -26, -55], [-12, -9, -15]] },
  { key: 'about', kind: 'stop', landmark: 'about', opens: 'glance', place: `About · The Anchor · ${depth(-9)}`, signal: '#7ff0cf',
    title: 'This anchor is me', line: 'Open it for my portfolio at a glance: who I am and where everything lives.' },
  // Act 1, down through the portfolio: past the nurse shark and right across the reef shelf on the scooter, by the table
  // coral tower, round north of it and past the pillar coral cathedral, and back west to the wreck.
  { key: 'experience', kind: 'stop', landmark: 'experience', place: `Experience · The Wreck · ${depth(-21)}`, signal: '#ffcf7a',
    title: 'Here’s the wreck', line: 'This is where you’ll find my experience.',
    via: [
      { at: [-2, -5, -30], key: 'nurse', title: 'A nurse shark, asleep', line: 'Nurse sharks rest on the sand by day. Let it be.',
        look: { resident: 'sleeper', near: [-19, -12.6, -22] }, reach: 11 },
      { at: [6, -9, -24], key: 'scooter', title: 'Scooter on', line: 'Across the reef shelf. The deep end is out there; we’ll get to it.',
        scooter: true, teach: 'scooter', hold: 4, slow: .7 },
      { at: [22, -12, -14], key: 'tower', title: 'The table coral tower', line: 'Plates of coral stacked up a leaning stone trunk.',
        look: [38, -15.5, -8], hold: 6 },
      [30, -10, 2], [44, -11, 2],
      { at: [52, -15, -8], key: 'cathedral', title: 'The pillar coral cathedral', line: 'Organ-pipe columns in a horseshoe.',
        look: [48, -23.5, -28], hold: 6, reach: 11 },
      // Into the wreck's viewpoint from above and to the north-east: a tall coral stands just east of it.
      [44, -17, -18], [31, -16, -19], [22, -16, -15],
    ] },
  // Round the west of the wreck and down to the gully, then through the limestone arch (reef.js: the arch at 20, -72) and
  // out over the lantern garden to the treasure. Over the gully's lip first, then about 3 m off its floor under the roof
  // (clear to -48 m), so the route holds for seabed clearances up to 2.2 m.
  { key: 'projects', kind: 'stop', landmark: 'projects', teach: 'computer', place: `Projects · The Treasure · ${depth(-45)}`, signal: '#c9a2ff',
    title: 'The treasure', line: 'This is where you’ll find my projects.',
    via: [
      [6, -21, -28], [4, -26, -44], [10, -27, -52], [17, -30, -56], [22, -37, -58], [22, -41, -59], [21, -43.5, -60],
      { at: [20, -46.4, -62.6], key: 'arch', title: 'Through the arch', line: 'A limestone arch over the gully. In we go.',
        look: [20, -48, -72], teach: 'lamp', hold: 6 },
      [20, -49, -66], [20, -51, -70], [20, -51.6, -79],
      { at: [20, -50, -84], key: 'lanterns', title: 'The lantern garden', line: 'Soft lights on the deep ledge.',
        look: [8, -55, -86], reach: 6 },
      // The treasure's viewpoint is just north of the chest: round to it over open water, never across the chest.
      [6, -49, -94], [1, -50, -90], [-8, -46, -77],
    ] },
  // Act 2, the way up: along the deep ledge to the soft coral spire, where the swim drifts while a whale shark passes out to
  // sea, up through the bait ball, and on to open water just seaward of the wreck, with the whole reef rising ahead.
  { key: 'open-water', kind: 'end', at: [20, -12, -56], teach: 'view', place: `Above the wreck · ${depth(-12)}`, signal: '#ff9d8a',
    title: 'This is my reef', line: 'My portfolio lives here. Dive around on your own and look at the life, or head up when you’re ready.',
    short: 'My portfolio lives here. Explore on your own, or head up.',
    via: [
      [-6, -46, -79], [8, -47, -86], [24, -47, -84],
      { at: [36, -45, -79], key: 'whale-shark', title: 'Look out to sea', line: 'A whale shark, passing over the deep water.',
        look: { visitor: 'whale-shark' }, teach: 'photo', hold: 9, slow: .12, reach: 7,
        encounter: { id: 'whale-shark', cue: 26, course: { angle: Math.PI / 2, side: 1, pass: 22, y: -38, ahead: 14 } } },
      [44, -38, -72],
      { at: [48, -28, -67], key: 'bait-ball', title: 'Through the bait ball', line: 'Thousands of fry turning as one. They open a tunnel around you.',
        slow: .6, reach: 7 },
      [38, -18, -62],
    ],
    // The wreck below, the reef rising beyond it to the shallows, and the tower off to the right.
    pan: [[18, -21, -39], [0, -10, -6], [38, -15.5, -8]] },
];
// Shown on the At a glance page, only while the tour is on (D6).
export const WELCOME = 'Hi, I’m Anshul. Welcome to my portfolio: a dive world I made for you to explore my work. You’re free to swim off, or continue the guided dive from here.';
// The fly-bys of a step's scenic route, and where any route point is.
export const flyBys = step => (step.via ?? []).filter(item => !Array.isArray(item));
export const pointOf = item => Array.isArray(item) ? item : item.at;
