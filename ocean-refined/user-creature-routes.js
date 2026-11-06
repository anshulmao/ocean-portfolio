// Where the creature set lives and how often the big animals come by. Everything here is data for
// user-creatures.js: edit numbers, not code. Distances are metres; times are seconds. A pair [standard, economy]
// gives the full-quality value first.

// The great animals are visitors, not residents. Each comes in from beyond the haze, passes the diver once and
// leaves the same way, then is gone until a later moment of the dive. Two slots run independently: the giants (one
// at a time, rarely) and the smaller pelagics (one at a time, more often).
//   pass: the closest the line of travel comes to the diver; depth: the band it swims in; speed: metres a second.
//   across: swims parallel to the reef, across its face, on a line at this z or deeper (over the deep shelf). Every kind
//   has one: south of z -25 the shelf is 26 m deep or more, so no visitor ever comes in over the shallows.
//   Visitors also cost nothing until seen; big-life.js makes sure every dive meets at least one of the great ones.
export const ENCOUNTERS = {
  giant: {
    first: [35, 70], cooldown: [80, 170],
    kinds: [
      // The whale keeps its distance: a shape crossing the blue at the edge of sight.
      { id: 'whale', pass: [56, 76], depth: [-16, -10], clearance: 5, speed: 2.4, bulge: .12, across: -55, cast: [{ species: 'right-whale' }] },
      { id: 'whale-shark', pass: [16, 26], depth: [-13, -7], clearance: 3.5, speed: 1.5, bulge: .2, across: -50, cast: [{ species: 'whale-shark' }], riders: [3, 2] },
      // An orca family keeps together: the bull out in front, a cow behind and her calf tucked at her flank.
      { id: 'orcas', pass: [20, 34], depth: [-15, -9], clearance: 3.5, speed: 3.2, bulge: .25, across: -45, cast: [
        { species: 'orca', side: 3, back: 0 }, { species: 'orca-cow', side: -5, back: 10 }, { species: 'orca-cow', side: -10, back: 12, scale: .55, name: 'orca calf' }] },
      // A pair of mantas, wings beating slow; one passing close sometimes loops over in a somersault (loop: seconds between).
      { id: 'manta', pass: [12, 22], depth: [-14, -7], clearance: 4, speed: 1.5, bulge: .3, across: -45, loop: [12, 22], cast: [
        { species: 'manta-ray', side: 0, back: 0 }, { species: 'manta-ray', side: 10, back: 16, scale: .82 }] }
    ]
  },
  pelagic: {
    first: [14, 26], cooldown: [35, 80],
    kinds: [
      // Dolphins ride a swell of their own near the light, and one sometimes spins.
      { id: 'dolphins', pass: [10, 20], depth: [-6, -2.6], clearance: 2.5, speed: 4.6, bulge: .3, porpoise: 2.2, across: -35, cast: [
        { species: 'bottlenose-dolphin', side: 0, back: 0 }, { species: 'bottlenose-dolphin', side: 4, back: 4 }, { species: 'bottlenose-dolphin', side: -4.5, back: 6 },
        { species: 'bottlenose-dolphin', side: 1.5, back: 11, lean: true }] },
      { id: 'blacktips', pass: [7, 15], depth: [-18, -4], clearance: 3, speed: 1.6, bulge: .35, low: true, across: -30, cast: [
        { species: 'blacktip-reef-shark', side: 0, back: 0 }, { species: 'blacktip-reef-shark', side: 9, back: 14, scale: .9 }, { species: 'blacktip-reef-shark', side: -6, back: 24, scale: .78, name: 'young blacktip' }] },
      // Hammerheads come up from the deep shelf in a loose file, sweeping their heads, and go back down the same way.
      { id: 'hammerheads', pass: [15, 26], depth: [-26, -14], clearance: 4, speed: 1.7, bulge: .2, across: -50, cast: [
        { species: 'scalloped-hammerhead', side: 0, back: 0 }, { species: 'scalloped-hammerhead', side: 6, back: 10, scale: .9 }, { species: 'scalloped-hammerhead', side: -5, back: 17, scale: .84 }] },
      // Eagle rays fly past in a loose formation, wingtip to wingtip.
      { id: 'eagle-rays', pass: [9, 18], depth: [-16, -6], clearance: 3, speed: 1.9, bulge: .3, across: -32, cast: [
        { species: 'spotted-eagle-ray', side: 0, back: 0 }, { species: 'spotted-eagle-ray', side: 3.6, back: 4, scale: .92 }, { species: 'spotted-eagle-ray', side: -3.4, back: 5, scale: .95 }, { species: 'spotted-eagle-ray', side: .4, back: 9.5, scale: .86 }] },
      // A tuna school tears past, fast and in a loose wedge.
      { id: 'tuna', pass: [14, 26], depth: [-18, -10], clearance: 3, speed: 5.2, bulge: .15, across: -40, school: { species: 'yellowfin-tuna', count: [8, 5], spread: [14, 5, 2.5] } }
    ]
  }
};

// Residents: animals that live on the reef. They cost nothing while out of sight.
export const RESIDENTS = {
  // Bumpheads travel as a herd over the middle reef and stop together to bite at it.
  bumpheads: { species: 'bumphead-parrotfish', count: [3, 2], loop: [22, -18, 16, 11], height: 3, speed: .9 },
  // The whipray glides low over the open sand west of the cleaning reef (22-28 m, nowhere steeper than 1 in 3). Its first
  // loop crossed the 15 m drop off the About pad's rim, which a ray 1.4 m off the bottom cannot climb: it slid down
  // the slope and ended stuck at the foot of the deep ledge.
  // On the guided dive it rests on the sand at the north of its loop (-41, -11) until the guide looks at it (park).
  whipray: { species: 'pink-whipray', loop: [-41, -16, 8, 5], height: 1.4, speed: 1.1 },
  // Bluespotted rays lie on open sand and scoot away when crowded.
  bluespots: { species: 'bluespotted-ray', spots: [[8, 6], [-16, 2], [26, -14]], lean: 2 },
  // The nurse shark sleeps on the open sand beside the coral nursery (reef.js NURSERY_SITE, at -5, 4).
  sleeper: { species: 'nurse-shark', near: [-6, 9.5] },
  // The barracuda that patrols a slow oval off the wreck (patrol: x and z radii, m; speed m/s), pauses to hang
  // and watch a diver, and bolts if crowded. Its beat is off the hull's west (high, breached) side, over the open sand:
  // the guided dive comes down the reef's east side and in to the wreck from the south-east, and never crowds it.
  sentinel: { species: 'great-barracuda', landmark: 'experience', offset: [-15, 7, -2], patrol: [7, 4.5], speed: .8 },
  // Morays and a ribbon eel look out from the foot of the tall formations, mouths working; too close and they strike.
  dens: [
    // The cathedral's columns are too thin to hold a den: a moray there ended up on open sand by the reef's edge.
    { species: 'giant-moray', formation: 'Brain coral dome', angle: 1.5 },
    { species: 'ribbon-eel', formation: 'Table coral tower', angle: 3.6 }
  ],
  // Green turtles cruise slow loops a few metres over the reef, each its own; one sleeps on the sand.
  //   loops: [centre x, centre z, x radius, z radius] (where the reef's turtles always swam, except the one that passed
  //   between the wreck and the pillar cathedral: a turtle that steers round the reef spent that loop detouring).
  turtles: { species: 'green-turtle', loops: [[-24, -6, 8, 6], [36, -50, 7, 6], [-35, -72, 8, 7], [31, 14, 9, 6], [33, -91, 8, 6]], count: [5, 3], height: 3.4, speed: .55, scale: [.8, 1], sleeper: [12, -24] },
  // Whitetip reef sharks: one patrols the deep reef low over the bottom, two lie resting on the sand by day (the first on
  // the open sand off the wreck's bow, one of the few patches on this reef clear and level enough for a 5 m shark).
  whitetips: { species: 'whitetip-reef-shark', patrol: { loop: [-26, -58, 15, 10], height: 2, speed: 1.1 }, resting: [[18, -29], [-42, -90]], lean: 1 },
  // Cuttlefish hover off the side of tall formations, watching; crowd one and it backs off, then flashes its arms.
  cuttlefish: { species: 'broadclub-cuttlefish', formations: ['Soft coral spire', 'Brain coral dome', 'Lantern garden'], count: [3, 2], height: 2.4 },
  // A humphead wrasse cruises open water west of the wreck on a wide loop, as big as a diver and as unhurried (its first
  // loop circled the giant clam, and it spent its time detouring round the formation).
  humphead: { species: 'humphead-wrasse', loop: [-28, -36, 10, 7], height: 3.2, speed: .8 },
  // Resting animals that wake when crowded: flee (m) how close is too close, hop (m) how far it swims before settling again.
  wake: { 'green-turtle': { flee: 4.5, hop: 14, rise: 3, seconds: 9 }, 'whitetip-reef-shark': { flee: 5.5, hop: 18, rise: 2, seconds: 6 } }
};

// Animals on the bottom, drawn as instances (one draw call a species) and never moving: sea stars and urchins spread
// over the whole reef as they always were (a staggered zigzag, kept off the landmarks' pads). count: [standard, economy].
export const SEABED = {
  stars: { species: ['chocolate-chip-sea-star', 'chocolate-chip-sea-star', 'blue-sea-star'], count: [60, 35], phase: 0, scale: [.8, 1.2] },
  urchins: { species: ['long-spined-urchin'], count: [54, 30], phase: 1.17, scale: [.8, 1.1] }
};

// How tall the wreck stands off the sand, masts and all (m): the animals keep above or round it.
export const WRECK_HEIGHT = 9.5;

// Fish in numbers, drawn as instances: one draw call a species. Small reef fish stay by the coral.
//   over / near: 'formations' are the tall hero formations, 'patches' the coral gardens.
export const SCHOOLS = {
  anthias: { species: 'anthias', lod: 2, kind: 'cloud', over: 'formations', count: [22, 12], patches: { zone: 'shallow', count: [16, 9], max: 3 } },
  chromis: { species: 'chromis', lod: 2, kind: 'cloud', over: 'patches', zone: 'mid', count: [16, 9], max: 4 },
  sergeants: { species: 'sergeant-major', kind: 'cloud', at: [[2, -6], [-22, -8], [24, -14]], y: -6, count: [8, 5], size: [3, 1, 3] },
  wrasse: { species: 'cleaner-wrasse', kind: 'cloud', site: 'cleaning-station', count: [3, 3], size: [1.2, .7, 1.2], lift: 1.6 },
  butterflies: { species: 'butterflyfish', kind: 'pairs', near: 'patches', count: 2, groups: [5, 3], loop: 4.5, height: 1.4 },
  idols: { species: 'moorish-idol', kind: 'pairs', near: 'patches', count: 3, groups: [2, 1], loop: 5, height: 1.8 },
  tangs: { species: 'powder-blue-tang', kind: 'pairs', near: 'patches', count: 5, groups: [2, 1], loop: 6, height: 1.5 },
  angels: { species: 'emperor-angelfish', kind: 'pairs', near: 'formations', count: 1, groups: [3, 2], loop: 4, height: 2 },
  yellowTangs: { species: 'yellow-tang', kind: 'pairs', near: 'patches', count: 3, groups: [3, 2], loop: 6, height: 1.6 },
  triggers: { species: 'picasso-triggerfish', kind: 'pairs', near: 'patches', count: 1, groups: [3, 2], loop: 3.5, height: .9 },
  // Garden eels stand half out of the sand, swaying, and sink into their burrows as a diver comes over.
  gardenEels: { species: 'garden-eel', lod: 2, kind: 'burrows', near: [-6, -36], count: [14, 8] },
  // Fusiliers pour along the reef edge in a ribbon.
  fusiliers: { species: 'fusilier', kind: 'shoal', loop: [0, -34, 44, 30], height: 8, ceiling: -6, speed: 2.2, count: [30, 16], spread: [22, 2.2, 1.6] },
  // Young barracuda turn in a slow wheel in mid-water.
  barracudaWheel: { species: 'great-barracuda', kind: 'wheel', centre: [-36, -44], radius: 8, y: -20, scale: .72, speed: 1.1, count: [12, 7], stack: 4 },
  // Trevally hunt round the bait ball.
  trevally: { species: 'giant-trevally', kind: 'shoal', site: 'bait-ball', radius: 12, lift: 2, speed: 3, count: [6, 4], spread: [12, 2.5, 2] },
  // Flying fish skim just under the surface with their wings folded.
  flyingFish: { species: 'flying-fish', kind: 'shoal', loop: [8, 8, 30, 18], y: -1.3, speed: 3.6, count: [8, 5], spread: [8, 2.5, .4], pose: 'folded' }
};
