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
// The whale shark's course (SPEC D4): east to west along the deep shelf, never in over the shallows. Its line lies 10 m in
// front of the diver as they face back up the reef (side -1 at angle π/2 puts it at higher z, over 50 m of water), 18 m
// above, and it starts 14 m short of its closest approach. It is called 26 m before the drift, so it crosses during it.
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
  // coral tower and down past the pillar coral cathedral to the wreck.
  { key: 'experience', kind: 'stop', landmark: 'experience', place: `Experience · The Wreck · ${depth(-21)}`, signal: '#ffcf7a',
    title: 'Here’s the wreck', line: 'This is where you’ll find my experience.',
    via: [
      { at: [-10, -8.5, -24], key: 'nurse', title: 'A nurse shark, asleep', line: 'Nurse sharks rest on the sand by day. Let it be.',
        look: { resident: 'sleeper', near: [-19, -12.6, -22] }, reach: 11 },
      { at: [2, -12, -20], key: 'scooter', title: 'Scooter on', line: 'Across the reef shelf. The deep end is out there; we’ll get to it.',
        scooter: true, teach: 'scooter', hold: 4, slow: .7 },
      [16, -12, -12],
      { at: [28, -13, -6], key: 'tower', title: 'The table coral tower', line: 'Plates of coral stacked up a leaning stone trunk.',
        look: [38, -12, -8] },
      [36, -18, -20],
      { at: [40, -22, -29], key: 'cathedral', title: 'The pillar coral cathedral', line: 'Organ-pipe columns in a horseshoe.',
        look: [48, -22, -27] },
    ] },
  // Down the gully from the wreck and through the limestone arch (reef.js: the arch at 20, -72), out over the lantern garden
  // to the treasure. Over the cliff edge first (a straight drop skims it), then about 3 m off the gully floor under the roof
  // (clear to -48 m), so the route holds for seabed clearances up to 2.2 m.
  { key: 'projects', kind: 'stop', landmark: 'projects', teach: 'computer', place: `Projects · The Treasure · ${depth(-45)}`, signal: '#c9a2ff',
    title: 'The treasure', line: 'This is where you’ll find my projects.',
    via: [
      [24, -22, -46], [23, -24, -52.5], [24.5, -35, -56], [25, -40.5, -58.5], [21, -43.5, -60],
      { at: [20, -46.4, -62.6], key: 'arch', title: 'Through the arch', line: 'A limestone arch over the gully. In we go.',
        look: [20, -49, -72], teach: 'lamp', hold: 6 },
      [20, -49, -66], [20, -51, -70], [20, -51.6, -79],
      { at: [12, -51, -87], key: 'lanterns', title: 'The lantern garden', line: 'Soft lights on the deep ledge.',
        look: [8, -55, -86] },
      // The treasure's viewpoint is just north of the chest: round to it over open water, never across the chest.
      [1, -50, -90], [-8, -46, -77],
    ] },
  // Act 2, the long way up: along the deep ledge to the soft coral spire, where the swim drifts while a whale shark passes
  // overhead, up through the bait ball, over the wreck and the anchor, and past the grotto into the sunlit shallows.
  { key: 'shallows', kind: 'end', at: [2, -5, 28], teach: 'view', place: `The shallows · ${depth(-5)}`, signal: '#ff9d8a',
    title: 'This is my reef', line: 'My portfolio lives here. Dive around on your own and look at the life, or head up when you’re ready.',
    short: 'My portfolio lives here. Explore on your own, or head up.',
    via: [
      [-6, -46, -79], [8, -47, -86], [24, -47, -84],
      { at: [36, -45, -79], key: 'whale-shark', title: 'Look up', line: 'A whale shark, passing over the deep shelf.',
        look: { visitor: 'whale-shark' }, teach: 'photo', hold: 9, slow: .12, reach: 7,
        encounter: { id: 'whale-shark', cue: 26, course: { angle: Math.PI / 2, side: -1, pass: 10, y: -28, ahead: 14 } } },
      [44, -38, -72],
      { at: [48, -28, -67], key: 'bait-ball', title: 'Through the bait ball', line: 'Thousands of fry turning as one. They open a tunnel around you.',
        slow: .6, reach: 7 },
      [44, -22, -56],
      { at: [32, -16, -46], key: 'wreck', title: 'The wreck, from above', line: 'A barracuda keeps watch, and fish shelter in the hull.',
        look: [18, -21, -39] },
      [22, -12, -30],
      { at: [-4, -6, -8], key: 'anchor', title: 'Back over the anchor', line: 'Where we started. Up into the shallows.',
        look: [-12, -7, -15], hold: 4 },
      { at: [4, -9, 2], key: 'rays', title: 'The sunlit shallows', line: 'Rays on the sand, sergeant majors on the coral, and the light coming through.',
        look: [8, -12.5, 6], reach: 7 },
      // The grotto's passage (reef.js grottoSites: 7, 18) is lower than the diver's capsule and seabed clearance allow, so
      // the route swims beside it and looks in.
      [2, -8, 11],
      { at: [1, -8, 17], key: 'grotto', title: 'The grotto', line: 'Stone ribs over the sand, and sea fans at the door.', look: [7, -12, 18], hold: 4, reach: 7 },
      [3, -7, 24],
    ],
    pan: [[0, -12, -12], [8, -1.5, 12], [-12, -8, -15]] },
];
// Shown on the At a glance page, only while the tour is on (D6).
export const WELCOME = 'Hi, I’m Anshul. Welcome to my portfolio: a dive world I made for you to explore my work. You’re free to swim off, or continue the guided dive from here.';
// The fly-bys of a step's scenic route, and where any route point is.
export const flyBys = step => (step.via ?? []).filter(item => !Array.isArray(item));
export const pointOf = item => Array.isArray(item) ? item : item.at;
