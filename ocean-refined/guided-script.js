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
//                       coming into reach; slow: the pace through it, a fraction of the cruise (up to 1.4).
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
// through a phone's narrow portrait lens (about 26° across). Every leg keeps clear of the wreck and its rigging and well wide
// of the barracuda's beat east of it, so it never bolts.
// Round 10 (the owner's notes, Nov 2026): the brain coral is passed on its moray's side, the coral nursery is a short pause,
// the helmet is seen face on, the arch stands on the deep sand with the nautilus framed in it, the whale shark crosses out
// over the deep water as the swim leaves the nautilus, and the tour ends up the descent line beside the wreck, where the
// résumé hangs.
// The whale shark's course (SPEC D4): across the deep water, never in over the shallows. Its line runs west to east 16 m
// out to sea of the drift at the lip of the nautilus's ledge (side 1 at angle π/2 puts it at lower z: z -102.5, over 60 m
// of water), 9 m above the diver: looking up and to the right from the nautilus, out over the drop-off. It starts 16 m
// short of its closest approach, so it comes in from the right front and crosses ahead while the swim waits.
// Copy is a signpost, not a summary: one short line. The portfolio itself lives in the archive.
export const SPEED = 3.6, FLYBY = 5, REACH = 9, SLOW = .5, BRIEF = 2.5;
const depth = y => `${Math.round(toDisplayDepth(-y))} m`;

export const STEPS = [
  // The site starts at the surface out over the deep end, west of the reef (exploration.js SURFACE_START). The welcome is
  // read as the guide drifts in toward the reef, and the controls are tried on the way.
  { key: 'welcome', kind: 'intro', at: [-22, -12, -66], place: 'Guided dive', title: 'This is the reef',
    line: 'Explore my work through a guided reef tour. Try the controls as we swim in; you can take over at any time.',
    short: 'Explore my work on a guided reef tour. Try the controls as we swim in.',
    // The reef rising ahead, the barracuda wheel off to the right, the wreck down to the left.
    pan: [[-22, -18, -30], [-36, -20, -44], [18, -21, -39], [-22, -16, -36]] },
  // The scooter first, the reef being a way off. Then on past the barracuda wheel on its reef side, by the pink whipray, to the
  // brain coral dome's east side, where its giant moray looks out of its den, a pause at the coral nursery with the
  // nurse shark asleep beside it, and in to the helmet face on: its faceplate looks east (landmark-builds.js), so the stop
  // stands 7 m east of it and the swim comes in on that line.
  { key: 'about', kind: 'stop', landmark: 'about', opens: 'about', place: `About · The Helmet · ${depth(-9)}`, signal: '#7ff0cf',
    view: [-5.6, -8.6, -12.1], lead: 9,
    title: 'This helmet is me', line: 'I’ve dived since I was ten. Open it for my portfolio at a glance: who I am and where everything lives.',
    via: [
      { at: [-28, -12, -56], key: 'scooter', title: 'The scooter', line: 'The reef is a way off yet. Let’s take the scooter.',
        scooter: true, teach: 'scooter', wait: 'scooter', hold: 5, slow: .7 },
      // On along the way the swim set out on, the barracuda wheel passed on its reef side, off to the right (the owner's notes,
      // round 15: it used to swing out west round its far side and turn back, facing the open sea).
      { at: [-22, -14, -45], key: 'barracuda', title: 'A barracuda wheel', line: 'Young barracuda turning slowly in mid-water.',
        look: [-36, -20, -44], hold: 6 },
      { at: [-28, -15.5, -27], key: 'whipray', title: 'A pink whipray', line: 'It glides low over the sand by the cleaning reef.',
        look: { resident: 'whipray', near: [-41, -23, -16] }, hold: 6 },
      // On to the dome's east side: the moray's den faces east (user-creature-routes.js dens, angle 1.5), and the view follows
      // it where it settled (user-creatures.js resting.moray). Under 30 m from the whipray's fly-by, so the view hands
      // straight across from the ray to the moray.
      { at: [-26, -16, -12], key: 'brain-coral', title: 'The brain coral dome', line: 'A giant moray keeps a den at its foot. There, mouth open.',
        look: { resident: 'moray', near: [-34.2, -21.2, -3.8] }, hold: 6, reach: 8 },
      // Up over the lip of the shelf the nursery stands on.
      [-16, -10.5, -6],
      // A short pause: the swim all but stops while the view rests on the nursery.
      { at: [-12, -10, -5], key: 'nursery', title: 'The coral nursery', line: 'Coral grows on these trees until it can go back on the reef. A nurse shark sleeps beside it.',
        look: [-2.5, -11.5, 4], hold: 7, slow: .08, reach: 6 },
      [-1, -9, -6],
    ] },
  // Off to the right across the reef shelf, by the table coral tower, down to the pillar coral cathedral's open front, out to
  // the bait ball over the soft coral spire and down the deep slope to the arch (reef.js ARCH), whose passage frames the
  // nautilus on its ledge. Through it, past the lantern garden, and up the ledge to the nautilus: the deepest stop comes
  // first, as on a real dive. It is seen from the east, the side its spiral and the horseshoe of stone open to.
  { key: 'experience', kind: 'stop', landmark: 'experience', view: [-8.5, -44.4, -81.5], teach: 'computer', place: `Experience · The Nautilus · ${depth(-45)}`, signal: '#ffcf7a',
    title: 'The nautilus', line: 'It grows one chamber at a time. This is where you’ll find my experience.',
    via: [
      [4, -9, -14],
      { at: [22, -12, -14], key: 'tower', title: 'The table coral tower', line: 'Plates of coral stacked up a leaning stone trunk.',
        look: [38, -15.5, -8], hold: 6 },
      // Down from the tower to look in at the cathedral's open side, which faces the wreck (hero-formations.js `open`): a
      // gentle descent under the barracuda's beat (9 m off it: it bolts only inside 6 m, user-creatures.js), over the rock in
      // front of the cathedral and clear of the wreck. The fly-by stays within about 40° of the open side, 15 m out.
      [28, -17.5, -19], [32, -21, -24], [34.5, -22.5, -29],
      { at: [35, -23, -35], key: 'cathedral', title: 'The pillar coral cathedral', line: 'Organ-pipe columns in a horseshoe.',
        look: [48, -23.5, -28], hold: 6, reach: 9 },
      [39, -26, -47],
      // Out to the bait ball's depth over the spire, a look across at it, then straight through its middle and out the far side.
      { at: [43, -28, -55], key: 'bait-ahead', title: 'A bait ball, ahead', line: 'Thousands of fry turning as one. We’ll swim straight through it.',
        look: { bait: true }, through: true, hold: 5, slow: .35, reach: 8 },
      // The guide runs the scooter through it: the boost (2.2×) on top of slow makes about 4.8 m/s.
      { at: [52, -28, -75], key: 'bait-ball', title: 'Through the bait ball', line: 'They open a tunnel around you. Scooter on.',
        scooter: true, slow: .6, hold: 4, reach: 6 },
      // Down the deep slope to the arch's east mouth, the nautilus framed in its passage.
      [46, -38, -80], [38, -48, -83],
      { at: [31, -51.5, -83], key: 'arch', title: 'Through the arch', line: 'Look through it: the nautilus waits on the ledge beyond.',
        look: [-18, -46.5, -82], teach: 'lamp', wait: 'lamp', hold: 6, reach: 6 },
      [20, -51.5, -83],
      { at: [12, -51, -83], key: 'lanterns', title: 'The lantern garden', line: 'Soft lights on the deep sand.',
        look: [6, -54.5, -86.5], hold: 6, slow: .4, reach: 5 },
      [2, -48, -81.5],
    ] },
  // The way back up. Leaving the nautilus the swim goes out to the lip of its ledge and all but stops, and a whale shark
  // crosses up and to the right, out over the deep water beyond the drop-off, from the west. Then up the slope to the
  // wreck and once round it before the stop: past its bow, along its deck side (out beyond the descent line) and round its
  // stern, and in to its west side, 10 m off, to see it whole. The barracuda patrols off the bow, well clear of the swim.
  { key: 'projects', kind: 'stop', landmark: 'projects', view: [8, -20, -37.5], approach: 9, place: `Projects · The Wreck · ${depth(-21)}`, signal: '#c9a2ff',
    title: 'Here’s the wreck', line: 'A trawler, and the fish that live in it now. This is where you’ll find my projects.',
    via: [
      { at: [-9, -43, -86.5], key: 'whale-shark', title: 'Look out to sea', line: 'A whale shark, crossing the deep water above the drop-off.',
        look: { visitor: 'whale-shark' }, teach: 'photo', hold: 12, slow: .12, reach: 6,
        encounter: { id: 'whale-shark', cue: 20, course: { angle: Math.PI / 2, side: 1, pass: 16, y: -34, ahead: 16 } } },
      [-6, -42.5, -91], [4, -41, -89], [10, -39, -78], [14, -31, -66],
      // Once round her, without a word: in at the bow, down the starboard side, round the stern and up the port side to
      // the stop, the view held on her all the way (stay) while the swim goes round.
      // A quarter faster than the cruise (slow over 1), a little closer in than it was: about 17 s round, and her card is up all the way
      // round (guided-dive.js nearing), so she may be read at any point of it.
      { at: [20, -22, -60], key: 'wreck-circle', look: [19, -22.5, -39.5], stay: true, hold: 80, slow: 1.25, reach: 8 },
      [28, -20.5, -56.5], [34.5, -19, -48], [35.5, -18.5, -37], [32.5, -18.5, -26], [23, -19, -21], [12, -19.5, -24], [3, -19.5, -31],
    ] },
  // From the wreck's west side across the top of it, over its rigging, to the descent line just beyond it (return-route.js
  // DESCENT_LINE), and up the line to the résumé's slate at the safety stop. Surface from here: the ascent holds the safety
  // stop beside the line and comes up by the buoy.
  { key: 'descent-line', kind: 'end', at: [27, -9.4, -37.2], approach: 8, site: 'resume', teach: 'view', place: `The descent line · ${depth(-9.5)}`, signal: '#ff9d8a',
    title: 'Up the line', line: 'My résumé hangs on the slate. Explore the reef on your own, or head up the line when you’re ready.',
    short: 'My résumé is on the slate. Explore, or head up.',
    via: [[9, -15, -37], [16, -12.5, -37.5]],
    // The slate, the line up to the buoy, and the wreck below.
    pan: [[32.6, -7.9, -37], [33, -1.5, -37], [18, -22, -39], [32.6, -7.9, -37]] },
];
// Shown on the At a glance page, only while the tour is on (D6).
export const WELCOME = 'Hi, I’m Anshul. Welcome to my portfolio: a dive world I made for you to explore my work. You’re free to swim off, or continue the guided dive from here.';
// The fly-bys of a step's scenic route, and where any route point is.
export const flyBys = step => (step.via ?? []).filter(item => !Array.isArray(item));
export const pointOf = item => Array.isArray(item) ? item : item.at;
