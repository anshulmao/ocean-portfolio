import { toDisplayDepth } from './depth-metrics.js';

// The guided dive as data (release/guided-dive/SPEC.md). guided-dive.js runs it; nothing here moves anything.
// Coordinates are world metres (x, y, z), y negative below the surface; "right" is +x from the entry, facing −z.
// Every leg is checked against the real reef in tools/test-guided-motion.mjs, so a point that moves needs that test to pass.
//
// A step:
//   kind     intro: the welcome, read where the diver levels out; waits for Continue (N).
//            look:  a scenic beat; the camera pans to each subject in turn, gives it `beat` seconds (the eased pan
//                   included), then the tour moves on by itself.
//            stop:  a portfolio site; the camera pans to the landmark and waits for Continue. Read it (F) opens `opens`.
//            end:   the overview; the visitor chooses to keep exploring or surface.
//   at       where the diver swims to; `landmark` takes it from the placed model instead, and `resident` frames an
//            animal from where it actually settled (at is then only the stand-in until the creatures load).
//   via      scenic waypoints on the way there, used when the tour arrives from the step before.
//   pan      what the camera looks at, in turn, once there (the first is also what it turns to on arrival).
//   beat     seconds each subject of a look beat gets (default BEAT); speed: the swim's pace for the leg into it (m/s).
//   teach    the control this beat introduces.
//   encounter  an animal this beat calls in on its own course (user-creatures.js begin): `course` sets the line of its
//            pass. A pan subject { visitor: id } is that animal, followed as it swims.
// The whale shark's course (SPEC D4): east to west and back is along the deep shelf, never in over the shallows. Its line
// lies 10 m to seaward of the diver (side 1 at angle π/2 puts it at lower z), 18 m above them, and it starts 14 m short of
// its closest approach so it arrives during the beat.
// Copy is a signpost, not a summary: one short line, two at most. The portfolio itself lives in the archive.
export const SPEED = 3.6, BEAT = 6;
// Seconds a look beat lasts before the tour moves on.
export const holdOf = step => (step.pan?.length || 1) * (step.beat ?? BEAT);
const depth = y => `${Math.round(toDisplayDepth(-y))} m`;

export const STEPS = [
  { key: 'welcome', kind: 'intro', place: 'Guided dive', title: 'Welcome to the guided dive',
    line: 'This is my portfolio, as a reef. Look anywhere as we go. There’s a lot of life down here.',
    pan: [[-12, -9, -15], [26, -14, -10], [0, -26, -55], [-12, -9, -15]] },
  { key: 'about', kind: 'stop', landmark: 'about', opens: 'glance', place: `About · The Anchor · ${depth(-9)}`, signal: '#7ff0cf',
    title: 'This anchor is me', line: 'Open it for my portfolio at a glance: who I am and where everything lives.' },
  { key: 'nurse', kind: 'look', resident: 'sleeper', at: [-9, -7, -22], place: 'Behind the anchor',
    title: 'A nurse shark, asleep', line: 'Nurse sharks rest on the sand by day. Let it be.',
    pan: [[-15, -11, -20], [-26, -20, -30]] },
  { key: 'reef', kind: 'look', at: [12, -14, -14], place: 'The shallow reef',
    title: 'The reef shelf', line: 'The deep end is out there. We’ll get to it.',
    pan: [[4, -30, -60], [28, -15, -8]] },
  { key: 'tower', kind: 'look', at: [29, -14, -3], teach: 'photo', place: `Table coral tower · ${depth(-14)}`,
    title: 'The table coral tower', line: 'Plates of coral stacked up a leaning stone trunk.',
    pan: [[38, -14, -8], [38, -10, -8], [36, -19, -12]], beat: 5 },
  { key: 'cathedral', kind: 'look', at: [39.5, -23, -31], place: `Pillar coral cathedral · ${depth(-23)}`,
    title: 'The pillar coral cathedral', line: 'Organ-pipe columns in a horseshoe. Take a look around.',
    pan: [[48, -23, -28], [51, -21, -24], [45, -24, -33]], beat: 5 },
  { key: 'experience', kind: 'stop', landmark: 'experience', place: `Experience · The Wreck · ${depth(-21)}`, signal: '#ffcf7a', teach: 'lamp',
    title: 'Here’s the wreck', line: 'This is where you’ll find my experience.' },
  { key: 'wreck-life', kind: 'look', at: [22, -18, -48], place: 'Around the wreck',
    title: 'Life on the wreck', line: 'A barracuda keeps watch here, and fish shelter in the hull.',
    pan: [[18, -24, -39], [27, -19, -35]] },
  { key: 'bait-ball', kind: 'look', at: [40, -27, -75], via: [[48, -27.8, -67]], teach: 'scooter', place: `The bait ball · ${depth(-28)}`,
    title: 'Through the bait ball', line: 'Thousands of fry turning as one. They open a tunnel around you.',
    pan: [[48, -27.8, -67], [50, -38, -72]] },
  { key: 'deep', kind: 'look', at: [8, -46, -70], teach: 'computer', place: `The deep shelf · ${depth(-46)}`,
    title: 'Look up', line: `About ${depth(-46)} down. The reef you swam over is up there in the light, and there’s life above.`,
    encounter: { id: 'whale-shark', course: { angle: Math.PI / 2, side: 1, pass: 10, y: -28, ahead: 14 } },
    pan: [[10, -24, -30], { visitor: 'whale-shark' }, [-6, -20, -44]], beat: 5 },
  { key: 'projects', kind: 'stop', landmark: 'projects', place: `Projects · The Treasure · ${depth(-45)}`, signal: '#c9a2ff',
    title: 'The treasure', line: 'This is where you’ll find my projects.' },
  { key: 'overview', kind: 'end', at: [-44, -12, -36], via: [[-38, -34, -64], [-47, -22, -50]], speed: 2.8, teach: 'view', place: 'Above the reef', signal: '#ff9d8a',
    title: 'This is my reef', line: 'My portfolio lives here. Dive around on your own and look at the life, or head up when you’re ready.',
    pan: [[0, -20, -40], [-20, -30, -70], [20, -20, -20]] },
];
// Shown on the At a glance page, only while the tour is on (D6).
export const WELCOME = 'Hi, I’m Anshul. Welcome to my portfolio: a dive world I made for you to explore my work. You’re free to swim off, or continue the guided dive from here.';
