import { toDisplayDepth } from './depth-metrics.js';

// The guided dive as data (release/guided-dive/SPEC.md). guided-dive.js runs it; nothing here moves anything.
// Coordinates are world metres (x, y, z), y negative below the surface; "right" is +x from the entry, facing −z.
// Every leg is checked against the real reef in tools/test-guided-motion.mjs, so a point that moves needs that test to pass.
//
// A step:
//   kind     intro: the welcome, read where the diver levels out; waits for Continue (N).
//            look:  a scenic beat; the camera pans its subjects and the tour moves on by itself after `hold` seconds.
//            stop:  a portfolio site; the camera pans to the landmark and waits for Continue. Read it (F) opens `opens`.
//            end:   the overview; the visitor chooses to keep exploring or surface.
//   at       where the diver swims to; `landmark` takes it from the placed model instead.
//   via      scenic waypoints on the way there, used when the tour arrives from the step before.
//   pan      what the camera looks at, in turn, once there (the first is also what it turns to on arrival).
//   hold     seconds a look beat lasts; speed: the swim's pace for the leg into it (m/s).
//   teach    the control this beat introduces (phase 4 shows it).
// Copy is a signpost, not a summary: one short line, two at most. The portfolio itself lives in the archive.
export const SPEED = 4.6;
const depth = y => `${Math.round(toDisplayDepth(-y))} m`;

export const STEPS = [
  { key: 'welcome', kind: 'intro', place: 'Guided dive', title: 'Welcome to the guided dive',
    line: 'This is my portfolio, as a reef. Look anywhere as we go. There’s a lot of life down here.',
    pan: [[-12, -9, -15], [26, -14, -10], [0, -26, -55], [-12, -9, -15]] },
  { key: 'about', kind: 'stop', landmark: 'about', opens: 'glance', place: `About · The Anchor · ${depth(-9)}`, signal: '#7ff0cf',
    title: 'This anchor is me', line: 'Open it for my portfolio at a glance: who I am and where everything lives.' },
  { key: 'nurse', kind: 'look', at: [-19, -17, -25], hold: 5, place: 'Below the anchor',
    title: 'A nurse shark, asleep', line: 'Nurse sharks rest on the sand by day. Let it be.',
    pan: [[-21, -23, -24], [-27, -22, -31]] },
  { key: 'reef', kind: 'look', at: [12, -14, -14], hold: 5, place: 'The shallow reef',
    title: 'The reef shelf', line: 'The deep end is out there. We’ll get to it.',
    pan: [[4, -30, -60], [28, -15, -8]] },
  { key: 'tower', kind: 'look', at: [29, -14, -3], hold: 6, teach: 'photo', place: `Table coral tower · ${depth(-14)}`,
    title: 'The table coral tower', line: 'Plates of coral stacked up a leaning stone trunk.',
    pan: [[38, -14, -8], [38, -11, -8], [36, -19, -12]] },
  { key: 'cathedral', kind: 'look', at: [39.5, -23, -31], hold: 6, place: `Pillar coral cathedral · ${depth(-23)}`,
    title: 'The pillar coral cathedral', line: 'Organ-pipe columns in a horseshoe. Take a look around.',
    pan: [[48, -23, -28], [51, -21, -24], [45, -24, -33]] },
  { key: 'experience', kind: 'stop', landmark: 'experience', place: `Experience · The Wreck · ${depth(-21)}`, signal: '#ffcf7a', teach: 'lamp',
    title: 'Here’s the wreck', line: 'This is where you’ll find my experience.' },
  { key: 'wreck-life', kind: 'look', at: [22, -18, -48], hold: 5, place: 'Around the wreck',
    title: 'Life on the wreck', line: 'A barracuda keeps watch here, and fish shelter in the hull.',
    pan: [[18, -24, -39], [27, -19, -35]] },
  { key: 'bait-ball', kind: 'look', at: [40, -27, -75], via: [[48, -27.8, -67]], hold: 5, teach: 'scooter', place: `The bait ball · ${depth(-28)}`,
    title: 'Through the bait ball', line: 'Thousands of fry turning as one. They open a tunnel around you.',
    pan: [[48, -27.8, -67], [50, -38, -72]] },
  { key: 'deep', kind: 'look', at: [8, -46, -70], hold: 7, teach: 'computer', place: `The deep shelf · ${depth(-46)}`,
    title: 'Look up', line: `About ${depth(-46)} down. The reef you swam over is up there in the light.`,
    pan: [[10, -24, -30], [-6, -20, -44], [30, -30, -50]] },
  { key: 'projects', kind: 'stop', landmark: 'projects', place: `Projects · The Treasure · ${depth(-45)}`, signal: '#c9a2ff',
    title: 'The treasure', line: 'This is where you’ll find my projects.' },
  { key: 'overview', kind: 'end', at: [-44, -12, -36], via: [[-38, -34, -64], [-47, -22, -50]], speed: 2.8, teach: 'view', place: 'Above the reef', signal: '#ff9d8a',
    title: 'This is my reef', line: 'My portfolio lives here. Dive around on your own and look at the life, or head up when you’re ready.',
    pan: [[0, -20, -40], [-20, -30, -70], [20, -20, -20]] },
];
// Shown on the At a glance page, only while the tour is on (D6).
export const WELCOME = 'Hi, I’m Anshul. Welcome to my portfolio: a dive world I made for you to explore my work. You’re free to swim off, or continue the guided dive from here.';
