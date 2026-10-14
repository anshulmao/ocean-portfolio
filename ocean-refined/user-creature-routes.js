// Where the creature set lives and how often the big animals come by. Everything here is data for
// user-creatures.js: edit numbers, not code. Distances are metres; times are seconds. A pair [standard, economy]
// gives the full-quality value first.

// The great animals are visitors, not residents. Each comes in from beyond the haze, passes the diver once and
// leaves the same way, then is gone until a later moment of the dive. Two slots run independently: the giants (one
// at a time, rarely) and the smaller pelagics (one at a time, more often).
//   pass: the closest the line of travel comes to the diver; depth: the band it swims in; speed: metres a second.
export const ENCOUNTERS = {
  giant: {
    first: [35, 70], cooldown: [80, 170],
    kinds: [
      // The whale keeps its distance: a shape crossing the blue at the edge of sight.
      { id: 'whale', pass: [56, 76], depth: [-16, -10], clearance: 5, speed: 2.4, bulge: .12, cast: [{ species: 'right-whale' }] },
      { id: 'whale-shark', pass: [16, 26], depth: [-13, -7], clearance: 3.5, speed: 1.5, bulge: .2, cast: [{ species: 'whale-shark' }], riders: [3, 2] },
      // An orca family keeps together: the bull out in front, a cow behind and her calf tucked at her flank.
      { id: 'orcas', pass: [20, 34], depth: [-15, -9], clearance: 3.5, speed: 3.2, bulge: .25, cast: [
        { species: 'orca', side: 3, back: 0 }, { species: 'orca-cow', side: -5, back: 10 }, { species: 'orca-cow', side: -10, back: 12, scale: .55, name: 'orca calf' }] }
    ]
  },
  pelagic: {
    first: [14, 26], cooldown: [35, 80],
    kinds: [
      // Dolphins ride a swell of their own near the light, and one sometimes spins.
      { id: 'dolphins', pass: [10, 20], depth: [-6, -2.6], clearance: 2.5, speed: 4.6, bulge: .3, porpoise: 2.2, cast: [
        { species: 'bottlenose-dolphin', side: 0, back: 0 }, { species: 'bottlenose-dolphin', side: 4, back: 4 }, { species: 'bottlenose-dolphin', side: -4.5, back: 6 },
        { species: 'bottlenose-dolphin', side: 1.5, back: 11, lean: true }] },
      { id: 'blacktips', pass: [7, 15], depth: [-18, -4], clearance: 3, speed: 1.6, bulge: .35, low: true, cast: [
        { species: 'blacktip-reef-shark', side: 0, back: 0 }, { species: 'blacktip-reef-shark', side: 9, back: 14, scale: .9 }] },
      // A tuna school tears past, fast and in a loose wedge.
      { id: 'tuna', pass: [14, 26], depth: [-18, -10], clearance: 3, speed: 5.2, bulge: .15, school: { species: 'yellowfin-tuna', count: [8, 5], spread: [14, 5, 2.5] } }
    ]
  }
};

// Residents: animals that live on the reef. They cost nothing while out of sight.
export const RESIDENTS = {
  // Bumpheads travel as a herd over the middle reef and stop together to bite at it.
  bumpheads: { species: 'bumphead-parrotfish', count: [3, 2], loop: [22, -18, 16, 11], height: 3, speed: .9 },
  whipray: { species: 'pink-whipray', loop: [-4, -30, 17, 12], height: 1.4, speed: 1.1 },
  // Bluespotted rays lie on open sand and scoot away when crowded.
  bluespots: { species: 'bluespotted-ray', spots: [[8, 6], [-16, 2], [26, -14]], lean: 2 },
  sleeper: { species: 'nurse-shark', near: [-21, -24] },
  // The barracuda that hangs off the wreck, turns to watch a diver, and bolts if crowded.
  sentinel: { species: 'great-barracuda', landmark: 'experience', offset: [9, 7, 4] },
  // Morays and a ribbon eel look out from the foot of the tall formations, mouths working; too close and they strike.
  dens: [
    { species: 'giant-moray', formation: 'Pillar coral cathedral', angle: 2.4 },
    { species: 'giant-moray', formation: 'Brain coral dome', angle: -.6, lean: true },
    { species: 'ribbon-eel', formation: 'Table coral tower', angle: 3.6 }
  ]
};

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
