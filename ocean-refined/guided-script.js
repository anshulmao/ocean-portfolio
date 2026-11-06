import { toDisplayDepth } from './depth-metrics.js';

// The guided dive as data (release/guided-dive/SPEC.md, round 11). guided-dive.js runs it; nothing here moves anything.
// Coordinates are world metres (x, y, z), y negative below the surface. On the map "north" is −x and "east" is −z.
// Every leg is checked against the real reef in tools/test-guided-motion.mjs, so a point that moves needs that test to pass.
//
// The tour waits at six moments only: the welcome, the four portfolio sites (the helmet, the wreck, the treasure, the
// slate) and the ending under the buoy. Everything between them is a fly-by: the swim carries on, slows, the camera pans
// to what is passing and a card names it. The camera is the guide's throughout: a scripted view, never the mouse's. It is
// shaped like a real dive: in over the sand at the north-east corner, the shallows first, the wreck at 15 m, the deep ledge,
// then back up by stages to a safety stop at 5 m on the line before the surface.
//
// A step:
//   kind     intro: the welcome, read where the diver levels out; waits for Start (N).
//            stop:  a portfolio site; the camera turns to the landmark and waits for Continue. Open (F) opens `opens`.
//            end:   the ending; the visitor chooses to keep exploring or surface.
//   at       where the diver swims to (the welcome: where it drifts to); `landmark` takes it from the placed model instead.
//   view     a stop's own viewpoint: a point, or { behind, near, distance, rise } to stand squarely in front of the landmark
//            with that resident lined up behind it. Every stop is approached on the line from its subject (guided-dive.js
//            APPROACH), so the diver arrives facing it.
//   via      the leg's scenic route, used when the tour arrives from the step before. A point is [x, y, z]; a fly-by is
//            { at, key, title, line, ... } and is a point of the route too:
//              look     what the camera pans to as it passes: a point, { visitor: id } (an animal, followed as it swims),
//                       { resident: id, near } (an animal where it settled or swims now, near standing in until it loads),
//                       { bait: true } (the bait ball, which wanders slowly round its home; followed too) or
//                       { midpoint: [a, b] } (between two of those, so both are in the shot).
//                       Without one the view stays on the course.
//              through  the swim from here goes straight through the bait ball's middle as it is now, and out the far side,
//                       then on: the next fly-by is the swim through it.
//              hold     seconds the fly-by lasts (default FLYBY), cut short (after BRIEF at least) by the next one
//                       coming into reach; slow: the pace through it, a fraction of the cruise.
//              reach    how near (m) the diver comes before it begins (default REACH).
//              scooter  the guide runs the scooter through it, for the visitor to see. The boost (2.2×) is on top of
//                       slow, so .7 makes about 5.5 m/s.
//              teach    the control it introduces (skipped if tried); wait: the same control, waited for (up to 7 s, the
//                       swim all but still) before the fly-by goes on.
//              encounter  an animal called in on its own course: `course` is the line of its pass, measured from this
//                       fly-by's point, and `cue` how far ahead (m) it is called so it arrives during the fly-by. While
//                       the tour is on no big animal comes unasked (user-creatures.js): these are the only ones.
//              wake     a resident parked for the tour (the whipray, resting on the sand) that sets off as this fly-by begins.
//   pan      what the camera looks at, in turn, once there (the welcome and the ending).
//   teach    the control this step introduces; speed: the swim's pace for the leg into it (m/s); lead: how far out (m)
//            the camera starts turning to a stop's subject (guided-dive.js LEAD otherwise); approach: how far out (m)
//            the swim lines up on the stop (APPROACH otherwise).
// Framing: a fly-by passes its subject 9–20 m off and looks at its middle, so the whole of it is in view, even through a
// phone's narrow portrait lens (about 22° across). Every leg keeps clear of the trawler (its mast and gantry have no
// collision volume) and well wide of the barracuda's beat off its west side (user-creature-routes.js sentinel: an oval
// 7 × 4.5 m, 15 m west of the hull and 7 m above it), so it never bolts.
// The whale shark's course (SPEC D4): along the deep sand south of the ledge, never in over the shallows. Its line lies 20 m
// out to sea of the drift (side 1 at angle π/2 puts it at lower z, over 60 m of water) and 10 m above, so it passes side-on
// rather than overhead, and slowly enough across the view for the pan to hold it. It starts 14 m short of its closest approach and is called 26 m before the drift.
// Copy is a signpost, not a summary: one short line. The portfolio itself lives in the archive.
export const SPEED = 3.6, FLYBY = 5, REACH = 9, SLOW = .5, BRIEF = 2.5;
const depth = y => `${Math.round(toDisplayDepth(-y))} m`;
// The three lit sites: the helmet, the wreck and the treasure. The welcome's first look is at the middle of them, so all
// three lights are in the frame as the dive goes under (from the start, the helmet lies 30° to one side of it and the
// treasure 30° to the other, inside a desktop lens).
const LIGHTS = { helmet: [-12, -10, -15], wreck: [18, -23, -40], treasure: [-18, -46, -82], middle: [-4, -26, -46] };

export const STEPS = [
  // The site starts at the surface over the sand at the north-east corner (exploration.js SURFACE_START: 53 m N, 18 m E on
  // the map). The welcome drifts a little west along the sand while the words are read, the computer is shown and the
  // controls are tried; the view takes in the three lights, then each in turn, then the way ahead.
  { key: 'welcome', kind: 'intro', at: [-52, -13, -12], place: 'Guided dive', title: 'Welcome to my reef',
    line: 'My portfolio lives on this reef: four sites, and a lot of life between them. I’ll lead; you look. Try the controls as we drift in.',
    short: 'My portfolio lives on this reef. I’ll lead; you look.',
    pan: [LIGHTS.middle, LIGHTS.helmet, LIGHTS.wreck, LIGHTS.treasure, [-30, -14, -10]] },
  // Act 1: the shallows, to the helmet. Every subject passes on the right and the view pans one way: the whipray resting
  // on the sand below as the swim sets off (it lifts off as the guide looks at it), the east face of the brain coral dome
  // where the moray's den opens, the coral nursery and the nurse shark asleep beside it seen together from 20 m off, the
  // scooter east past the helmet's rock, and one right-hand loop over the sand beyond it to come in to the helmet from the
  // east, facing its faceplate.
  { key: 'about', kind: 'stop', landmark: 'about', opens: 'about', place: `About · The Helmet · ${depth(-8.5)}`, signal: '#7ff0cf',
    title: 'This helmet is me', line: 'I’ve dived since I was ten. Open it for who I am, how I work, and where everything on this reef lives.',
    short: 'Open it for who I am and where everything lives.',
    via: [
      // The ray rests at the south point of its loop (user-creatures.js park), on open sand dead ahead of the swim in.
      { at: [-47, -15.5, -16], key: 'whipray', wake: 'whipray', title: 'A pink whipray', line: 'Resting on the sand below us. Watch: it lifts off and glides as it sees us.',
        look: { resident: 'whipray', near: [-41, -23.2, -21] }, hold: 8, slow: .3, reach: 9 },
      // The dome is 16 m across: seen from 18 m off its centre, 14 m from the den, so the whole of it is in the frame.
      { at: [-30, -12, -15], key: 'brain-coral', title: 'The brain coral dome', line: 'Centuries old. A giant moray keeps a den at its foot; look for the head in the dark.',
        look: [-35, -17, -1.5], hold: 7, slow: .4 },
      { at: [-19, -9, -8], key: 'nursery', title: 'The coral nursery', line: 'Fragments grow on the trees until they’re strong enough to plant out. The nurse shark sleeps beside them by day.',
        look: { midpoint: [[-3.5, -10, 2], { resident: 'sleeper', near: [-6, -12.6, 9.5] }] }, hold: 8, slow: .35 },
      { at: [-6, -8.5, -6], key: 'scooter', title: 'The scooter', line: 'Hold E: we’ll take the scooter along the shelf and round to the helmet.',
        scooter: true, teach: 'scooter', wait: 'scooter', hold: 5, slow: .7 },
      // Out over the sand east of the helmet and round: a half-circle 6 m across, right-handed, that ends on the approach.
      [6, -9, -18], [12, -9, -27], [16.2, -9, -25.2], [18, -8.5, -21], [16.2, -8, -16.8], [12, -8, -15],
    ] },
  // Act 2: along the top of the reef and down to the wreck, by the long way round. East over the shelf to the table coral
  // tower, down the reef's east side to look in at the pillar coral cathedral's open front, then a wide turn south round the
  // soft coral spire to come at the bait ball from the sea side and swim straight through it, and in to the wreck from the
  // south-east, where its deck and open hold face the diver.
  { key: 'experience', kind: 'stop', landmark: 'experience', view: [30, -20, -52], lead: 10, place: `Experience · The Wreck · ${depth(-22)}`, signal: '#ffcf7a',
    title: 'The wreck', line: 'A trawler, down a long while now, and the fish that have made it theirs. Where I’ve worked is in the hold, voyage by voyage.',
    short: 'A trawler, and the fish that live in it now. My experience is in the hold.',
    via: [
      [-16, -8, -21], [-8, -10, -30], [8, -11, -30],
      { at: [24, -13, -22], key: 'tower', title: 'The table coral tower', line: 'Plates of coral stacked up a leaning stone trunk. A ribbon eel lives at the bottom.',
        look: [38, -15.5, -8], hold: 6 },
      // Down from the tower to look in at the cathedral's open side, which faces the wreck (hero-formations.js `open`): a
      // gentle descent over the coral heads in front of it (their collision volumes reach up to -25.6) and clear of its west
      // column. The fly-by stays within about 15° of the open side, 16 m out.
      [30, -17, -22], [33, -20.5, -26],
      // The fly-by begins north of the open side and drifts past it slowly, so the columns stay ahead of the shoulder for
      // its whole hold rather than falling behind after three seconds.
      { at: [34.5, -22.5, -30], key: 'cathedral', title: 'The pillar coral cathedral', line: 'Organ-pipe columns in a horseshoe. Batfish live between them.',
        look: [48, -23.5, -28], hold: 6, slow: .3, reach: 9 },
      [35, -23, -35],
      // Round the spire: a half-circle 14 m out from the bait ball's home, south about, with the spire on the inside.
      // The turn to the wreck itself starts late (lead 10): the swim round the spire passes 12 m from the viewpoint on its way out.
      [40, -26, -58], [39, -29, -66],
      { at: [43.5, -30.5, -78], key: 'spire', title: 'The soft coral spire', line: 'Soft corals and sea fans up a pinnacle of rock. The bait ball lives over its top.',
        look: [50, -40, -72], hold: 6, slow: .55 },
      [50.5, -30.5, -80], [57.5, -30, -78],
      { at: [63, -29, -71], key: 'bait-ahead', title: 'A bait ball, ahead', line: 'Thousands of fry turning as one, with jacks circling. We’ll swim straight through it.',
        look: { bait: true }, through: true, hold: 5, slow: .35, reach: 8 },
      { at: [50.5, -27.8, -66], key: 'bait-ball', title: 'Through the bait ball', line: 'They open a tunnel around you and close it behind.',
        slow: .6, hold: 4, reach: 6 },
      [42, -24.5, -62],
    ] },
  // Act 3: down to the treasure, the deepest site, as on a real dive. South from the wreck and down to the gully, through
  // the limestone arch (reef.js: the arch at 20, -72) and over the lantern garden to the deep sand, where the whale shark
  // passes out to sea, then in to the ledge from the east. The turn to the chests starts late (lead 14): the whale shark
  // passes within 20 m of them, and the view stays on it.
  { key: 'projects', kind: 'stop', landmark: 'projects', teach: 'computer', lead: 14, place: `Projects · The Treasure · ${depth(-47)}`, signal: '#c9a2ff',
    title: 'The treasure', line: 'Two chests on the deep ledge. The things I’ve built are in them: open one and have a look.',
    short: 'The things I’ve built are in the chests. Open one.',
    via: [
      // A long calm stretch first (the look tests use it): south-west from the wreck and down the slope over the gully's edge,
      // in one line to the arch.
      [31, -24, -56], [29, -30, -58], [25, -37, -58.5], [21.5, -43, -59.5],
      { at: [20, -46.4, -62.6], key: 'arch', title: 'Through the arch', line: 'A limestone arch over the gully. It’s dark under there. In we go.',
        look: [20, -48, -72], teach: 'lamp', wait: 'lamp', hold: 6 },
      [20, -49, -66], [20, -51, -70], [20, -51.6, -79],
      { at: [20, -50, -84], key: 'lanterns', title: 'The lantern garden', line: 'Soft lights on the deep ledge. This is as deep as we go.',
        look: [8, -55, -86], reach: 6 },
      { at: [6, -47, -90], key: 'whale-shark', title: 'Look out to sea', line: 'A whale shark, passing over the deep water. The biggest fish there is.',
        look: { visitor: 'whale-shark' }, teach: 'photo', hold: 9, slow: .12, reach: 7,
        encounter: { id: 'whale-shark', cue: 26, course: { angle: Math.PI / 2, side: 1, pass: 20, y: -37, ahead: 14 } } },
    ] },
  // Act 4: the way up, north-west across the deep reef to the line. Past the nautilus on its own ledge, hammerheads crossing
  // ahead off the cliff, up the slope past the kelp grove (the barracuda wheel off its edge), blacktips low over the sand,
  // and up the descent line to the slate at safety-stop depth. Dolphins are called in over the buoy as the swim reaches
  // the line. (The humphead wrasse cruises its own loop over the slope here and is met as it comes.)
  { key: 'resume', kind: 'stop', landmark: 'resume', opens: 'resume', lead: 12, place: `Résumé · The Slate · ${depth(-7.4)}`, signal: '#f4e3b5',
    title: 'The safety stop', line: 'On a real dive you’d hang here three minutes before surfacing. My résumé is on the slate, to read while you wait or take with you.',
    short: 'Safety-stop depth. My résumé is on the slate.',
    via: [
      // 12 m off the shell (it is 3.3 m across), so it reads as more than a point.
      { at: [-22, -45, -70], key: 'nautilus', title: 'A nautilus', line: 'A living fossil: a shell that grows one chamber at a time, and keeps every one.',
        look: [-34, -47.5, -72], hold: 7, slow: .45 },
      [-24, -43, -66],
      // The hammerheads' line runs east along the foot of the cliff, 11 m ahead of the swim and above it: they cross right to
      // left against the blue, clear of the kelp grove (its edge is 9 m further west).
      { at: [-30, -38, -60], key: 'hammerheads', title: 'Hammerheads', line: 'Crossing ahead in a loose file, heads sweeping. They keep their distance.',
        look: { visitor: 'hammerheads' }, hold: 8, slow: .2, reach: 8,
        encounter: { id: 'hammerheads', cue: 24, course: { angle: Math.PI, side: 1, pass: 11, y: -34, ahead: 16 } }, reach: 7 },
      [-36, -33, -58],
      { at: [-40, -29, -56], key: 'kelp', title: 'The kelp grove', line: 'Seahorses hold on to the whips inside; young barracuda wheel off its edge.',
        look: [-50, -33, -52], hold: 6 },
      // Up the slope in one slow left-hand curve that ends on the line's approach, heading north along it. The fly-bys
      // stand 14 m apart, so each has its hold before the next comes into reach.
      [-37, -25, -50],
      { at: [-36, -21, -45], key: 'blacktips', title: 'Blacktip reef sharks', line: 'Three of them, low over the sand. They want nothing from a diver.',
        look: { visitor: 'blacktips' }, hold: 8, slow: .25, reach: 8,
        // Their line crosses 16 m ahead of the fly-by, square to the swim (angle .61 is the swim's own bearing here plus
        // 90°), from the kelp's edge on the left to the open sand on the right, 4 m over the slope.
        encounter: { id: 'blacktips', cue: 18, course: { angle: .61, side: -1, pass: 16, y: -26, ahead: 12 } } },
      [-39.5, -16, -44.5],
      { at: [-42.5, -11, -44], key: 'line', title: 'The descent line', line: 'Algae near the light, sponges lower down, and a school of fusiliers that has made it home.',
        look: [-56.1, -7.5, -44], hold: 6, reach: 8,
        encounter: { id: 'dolphins', cue: 14, course: { angle: 0, side: -1, pass: 20, y: -4, ahead: 36 } } },
    ] },
  // The ending, under the buoy, with the line running down into the kelp and the whole reef off to the east.
  { key: 'buoy', kind: 'end', at: [-52.5, -6.8, -40.5], teach: 'view', place: `Under the buoy · ${depth(-6.8)}`, signal: '#ff9d8a',
    title: 'That’s the reef', line: 'My portfolio lives here. Dive back down and look at the life on your own, or surface when you’re ready.',
    short: 'My portfolio lives here. Explore on your own, or surface.',
    via: [[-50, -9, -41]],
    // The buoy above, the kelp below, the reef rising away to the east.
    pan: [[-56.1, -.6, -44], [-50, -31, -52], [-12, -12, -15]] },
];
// Shown on the At a glance page, only while the tour is on (D6).
export const WELCOME = 'Hi, I’m Anshul. Welcome to my portfolio: a dive world I made for you to explore my work. You’re free to swim off, or continue the guided dive from here.';
// The fly-bys of a step's scenic route, and where any route point is.
export const flyBys = step => (step.via ?? []).filter(item => !Array.isArray(item));
export const pointOf = item => Array.isArray(item) ? item : item.at;
