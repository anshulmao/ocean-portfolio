import { toDisplayDepth } from './depth-metrics.js';

// The guided dive as data (release/guided-dive/SPEC.md, round 10). guided-dive.js runs it; nothing here moves anything.
// Coordinates are world metres (x, y, z), y negative below the surface; "right" is +x from the entry, facing −z.
// Every leg is checked against the real reef in tools/test-guided-motion.mjs, so a point that moves needs that test to pass.
//
// The tour waits at six moments only: the welcome, the four portfolio sites (the helmet, the nautilus, the wreck, the
// slate) and the ending under the buoy. Everything between them is a fly-by: the swim carries on, slows, the camera
// glances at what is passing and a one-line caption names it. It is shaped like a real dive: in over the deep end, the
// shallows first, down to the deepest site, back up by stages, and a safety stop at 5 m on the line before the surface.
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
//                       swims), { resident: id, near } (an animal where it settled or swims now, near standing in until it
//                       loads) or { bait: true } (the bait ball, which wanders slowly round its home; followed too).
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
//            the camera starts turning to a stop's subject (guided-dive.js LEAD otherwise); approach: how far out (m) the
//            swim lines up on the stop (APPROACH otherwise).
// Framing (round 5): a fly-by passes its subject 12–20 m off and looks at its middle, so the whole of it is in view, even
// through a phone's narrow portrait lens (about 26° across). Every leg keeps clear of the trawler (its mast and gantry
// have no collision volume) and well wide of the barracuda's beat off its west side (user-creature-routes.js sentinel:
// an oval 7 × 4.5 m, 15 m west of the hull and 7 m above it), so it never bolts.
// The whale shark's course (SPEC D4): east to west over the deep water, never in over the shallows. Its line lies 22 m out
// to sea of the drift (side 1 at angle π/2 puts it at lower z, over 60 m of water) and only 7 m above, so it passes
// side-on rather than overhead. It starts 14 m short of its closest approach and is called 26 m before the drift.
// Copy is a signpost, not a summary: one short line. The portfolio itself lives in the archive.
export const SPEED = 3.6, FLYBY = 5, REACH = 9, SLOW = .5, BRIEF = 2.5;
const depth = y => `${Math.round(toDisplayDepth(-y))} m`;

export const STEPS = [
  // The site starts at the surface out over the deep end, above the nautilus (exploration.js SURFACE_START). The welcome is
  // read as the guide drifts in toward the reef, and the controls are tried on the way.
  { key: 'welcome', kind: 'intro', at: [-22, -12, -66], place: 'Guided dive', title: 'Welcome to my reef',
    line: 'My portfolio lives on this reef: four sites, and a lot of life in between. I’ll lead; you look. Try the controls as we swim in.',
    short: 'My portfolio lives on this reef. I’ll lead; you look. Try the controls as we swim in.',
    // The reef rising ahead, the kelp grove off to the right, the wreck down to the left, then ahead again.
    pan: [[-22, -18, -30], [-50, -30, -52], [20, -23, -40], [-22, -16, -36]] },
  // Act 1: across the shallows. The reef is still a way off, so the scooter comes first. Then out to the right, over the far
  // (west) side of the reef: the barracuda wheel off to the left, the pink whipray, the brain coral dome; then round in one
  // right-hand arc onto the helmet's own line and in to it from the west, its air hose running from the diver's feet up
  // onto the rock. Each subject 14-18 m off, so it reads whole, and far enough apart that the view hands one to the next
  // without hurrying.
  { key: 'about', kind: 'stop', landmark: 'about', opens: 'about', place: `About · The Helmet · ${depth(-8.5)}`, signal: '#7ff0cf',
    view: [-22, -8.2, -15.1],
    title: 'This helmet is me', line: 'I’ve dived since I was ten. Open it for who I am, how I work, and where everything on this reef lives.',
    short: 'Open it for who I am and where everything lives.',
    via: [
      { at: [-28, -12, -56], key: 'scooter', title: 'The scooter', line: 'The reef is a way off yet. Let’s take the scooter.',
        scooter: true, teach: 'scooter', wait: 'scooter', hold: 5, slow: .7 },
      [-40, -13, -52],
      { at: [-52, -14, -44], key: 'barracuda', title: 'A barracuda wheel', line: 'Young barracuda, turning slowly in mid-water. They part for a diver.',
        look: [-36, -20, -44], hold: 6 },
      [-54, -14, -34],
      { at: [-56, -13, -22], key: 'whipray', title: 'A pink whipray', line: 'It glides low over the sand by the cleaning reef, looking for crabs.',
        look: { resident: 'whipray', near: [-41, -23, -16] }, hold: 6 },
      { at: [-58, -10, -4], key: 'brain-coral', title: 'The brain coral dome', line: 'Centuries old. A giant moray keeps a den at its foot.',
        look: [-42, -16, -2], hold: 6 },
      // One right-hand arc from heading north to heading east, ending tangent to the helmet's line (z -15.1), so the view
      // turns one way: no bend back at the end.
      [-56, -8, -7], [-50, -8, -12], [-44, -8, -14.5],
    ] },
  // Act 2: down to the nautilus, the deepest site first, as on a real dive. The coral nursery and the nurse shark beside it,
  // then east across the reef shelf by the table coral tower, down the east side (clear of the barracuda's beat off the
  // wreck) to the pillar coral cathedral's open front, on down to the gully, through the limestone arch (reef.js: the arch
  // at 20, -72) and over the lantern garden to the ledge.
  // Seen from the north-east, inside the open side of the stones that cradle it, so the swim on leaves the way the diver
  // faces (south-east, out over the deep sand) rather than turning right round.
  { key: 'experience', kind: 'stop', landmark: 'experience', view: [-13.5, -43.2, -74.2], teach: 'computer', lead: 30, place: `Experience · The Nautilus · ${depth(-45)}`, signal: '#ffcf7a',
    title: 'The nautilus', line: 'A shell that grows one chamber at a time, and keeps every one. My experience is in here, chamber by chamber.',
    short: 'It grows one chamber at a time. My experience is in here.',
    via: [
      { at: [-16, -8, -2], key: 'nursery', title: 'The coral nursery', line: 'Fragments grow on the trees until they’re strong enough to plant out on the reef.',
        look: [-1.5, -10, 4], hold: 6, slow: .45 },
      { at: [-14, -8, 12], key: 'nurse', title: 'A nurse shark, asleep', line: 'They rest on the sand by day. We’ll pass quietly and let it be.',
        look: { resident: 'sleeper', near: [-6, -12.6, 9.5] }, hold: 7, slow: .4, reach: 7 },
      [2, -8, 18], [14, -9, 8],
      { at: [22, -12, -14], key: 'tower', title: 'The table coral tower', line: 'Plates of coral stacked up a leaning stone trunk. A ribbon eel lives at the bottom.',
        look: [38, -15.5, -8], hold: 6 },
      // Straight down from the tower to look in at the cathedral's open side, which faces the wreck (hero-formations.js
      // `open`): a gentle descent over the coral heads in front of the cathedral (their collision volumes reach up to
      // -25.6) and clear of its west column. The fly-by stays within about 15° of the open side, 16 m out.
      [28, -17.5, -19], [32, -21, -24], [34.5, -22.5, -29],
      { at: [35, -23, -35], key: 'cathedral', title: 'The pillar coral cathedral', line: 'Organ-pipe columns in a horseshoe. Batfish live between them.',
        look: [48, -23.5, -28], hold: 6, reach: 9 },
      // Down to the arch: a glimpse, with no caption and no slowing, out past the gully's edge into the deep blue to the
      // south (it stays off the diver's side as the swim turns west for the arch), rather than the gully floor ahead the
      // whole way. One look between the cathedral and the arch, so the view is never turned twice in quick succession.
      [37, -27.5, -47],
      { at: [38, -32, -54], key: 'open-water-glimpse', look: [36, -44, -84], hold: 7, slow: 1, reach: 6 },
      [32, -37, -57], [24, -40, -58.5], [21, -43.5, -60],
      { at: [20, -46.4, -62.6], key: 'arch', title: 'Through the arch', line: 'A limestone arch over the gully. It’s dark under there. In we go.',
        look: [20, -48, -72], teach: 'lamp', wait: 'lamp', hold: 6 },
      [20, -49, -66], [20, -51, -70], [20, -51.6, -79],
      { at: [20, -50, -84], key: 'lanterns', title: 'The lantern garden', line: 'Soft lights on the deep ledge. This is as deep as we go.',
        look: [8, -55, -86], reach: 6 },
      [4, -47, -74],
    ] },
  // Act 3: the way up. Out over the deep sand and along the ledge to the soft coral spire, where the swim drifts while a
  // whale shark passes out to sea, up through the bait ball, and in to the wreck from the south-east, where its deck and
  // open hold face the diver.
  { key: 'projects', kind: 'stop', landmark: 'projects', view: [30, -20, -52], lead: 24, place: `Projects · The Wreck · ${depth(-22)}`, signal: '#c9a2ff',
    title: 'The wreck', line: 'A trawler, down a long while now, and the fish that have made it theirs. The things I’ve built are in the hold.',
    short: 'A trawler, and the fish that live in it now. My projects are in the hold.',
    via: [
      // Out through the open side of the stones and over the deep sand (a long calm stretch the look tests use), then east
      // along the seaward edge of the ledge to the spire.
      [2, -47, -96], [16, -47, -92], [27, -47, -85],
      { at: [36, -45, -79], key: 'whale-shark', title: 'Look out to sea', line: 'A whale shark, passing over the deep water. The biggest fish there is.',
        look: { visitor: 'whale-shark' }, teach: 'photo', hold: 9, slow: .12, reach: 7,
        encounter: { id: 'whale-shark', cue: 26, course: { angle: Math.PI / 2, side: 1, pass: 22, y: -38, ahead: 14 } } },
      // Up to the bait ball's depth, a look across at it, then straight through its middle and out the far side.
      { at: [38, -31, -78], key: 'bait-ahead', title: 'A bait ball, ahead', line: 'Thousands of fry turning as one, with jacks circling. We’ll swim straight through it.',
        look: { bait: true }, through: true, hold: 5, slow: .35, reach: 8 },
      { at: [48, -28, -67], key: 'bait-ball', title: 'Through the bait ball', line: 'They open a tunnel around you and close it behind.',
        slow: .6, hold: 4, reach: 6 },
      [40, -24, -62],
    ] },
  // Act 4: back up across the reef to the line. West under the wreck's bow to the giant clam, the humphead wrasse on its
  // rounds, the kelp grove, and up the descent line to the slate at safety-stop depth. Dolphins are called in over the buoy
  // as the swim reaches the line.
  { key: 'resume', kind: 'stop', landmark: 'resume', opens: 'resume', lead: 20, place: `Résumé · The Slate · ${depth(-7.4)}`, signal: '#f4e3b5',
    title: 'The safety stop', line: 'On a real dive you’d hang here three minutes before surfacing. My résumé is on the slate, to read while you wait or take with you.',
    short: 'Safety-stop depth. My résumé is on the slate.',
    via: [
      [16, -25, -58],
      { at: [0, -33, -58], key: 'clam', title: 'The giant clam', line: 'Its mantle is a fingerprint: no two clams wear the same pattern. An octopus keeps the rocks beyond it.',
        look: [-9, -42.5, -54], hold: 6 },
      { at: [-14, -30, -44], key: 'humphead', title: 'A humphead wrasse', line: 'As big as a diver and in no hurry. It cruises the same loop every day.',
        look: { resident: 'humphead', near: [-28, -30, -36] }, hold: 6 },
      { at: [-34, -20, -40], key: 'kelp', title: 'The kelp grove', line: 'Seahorses hold on to the whips inside, backs turned to anyone who comes close.',
        look: [-50, -33, -52], hold: 6,
        encounter: { id: 'dolphins', cue: 12, course: { angle: 0, side: -1, pass: 22, y: -4, ahead: 40 } } },
      { at: [-42, -10, -44], key: 'line', title: 'The descent line', line: 'Algae near the light, sponges lower down, and a school of fusiliers that has made it home.',
        look: [-56.1, -7.5, -44], hold: 6, reach: 8 },
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
