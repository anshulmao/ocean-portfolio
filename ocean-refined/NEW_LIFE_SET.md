# Creature and coral set — 14 October 2026

The creature set is made in code (`creature-species.js`, built by `creature-kit.js`) and exported to
`assets/models/user-sets/sets/creature-set/`: 27 animals, each a GLB with skeleton, painted skin and 5 to 9 clips. The
coral set (`coral-varieties.js`) is exported beside it: 13 colonies. `creature-studio.html` shows both at site scale.
This replaces the first version of the set and the older attributed creature pack (fin whale, hammerhead, orca,
manta and magic rays, the fantasy whale shark and their source packs), which are no longer in the repository.

## Scale

Sized for this site, not for life. Small reef fish match the schooling fish of `marine-life.js` (about a metre). Larger
animals keep their order and rough proportion with the gaps squeezed (`siteLength` in `creature-species.js`):
blacktip 5.2 m, dolphin 7.3 m, orca bull 13.3 m, whale shark 17 m, right whale 22 m. Corals follow the same rule.

## Behaviour (`user-creatures.js`; numbers in `user-creature-routes.js`)

- **Encounters.** The big animals are visitors, not residents. A director keeps two slots. The giant slot holds a whale far out in the
  blue, a whale shark with remoras, or an orca family (bull, cow and calf in formation). The pelagic slot holds a dolphin pod, a pair of
  blacktips or a tuna school. Each comes in from beyond the haze on a line that passes the diver once, swims out of sight and is then
  switched off entirely. It does not return until its slot's cooldown has passed (giants 80 to 170 s, pelagics 35 to 80 s; longer in
  economy quality). The same encounter never comes twice in a row.
- **In passing.** Orcas speed up when the diver is close. A dolphin now and then spins out of the line. A blacktip bolts if the diver
  gets too near. Remoras ride under the whale shark, and one sometimes lets go, circles its host and returns.
- **Residents.** These live on the reef:
  - a bumphead herd that travels and stops together to graze;
  - a whipray gliding over sand;
  - bluespotted rays resting on open sand that scoot off when crowded;
  - a nurse shark asleep on the sand;
  - a barracuda off the wreck that turns to watch the diver and darts away if crowded;
  - morays and a ribbon eel at the foot of the tall formations that strike if approached head-on.
- **Schools** (one instanced draw a species):
  - anthias and chromis clouds over the formations and coral gardens, sinking into the coral as a diver nears;
  - sergeant majors in the shallows and cleaner wrasse at the cleaning station;
  - butterflyfish pairs, moorish idols, powder blue tangs and emperor angelfish working close to the coral;
  - a garden eel colony that draws into the sand;
  - a fusilier ribbon along the reef edge, a wheel of young barracuda, trevally hunting the bait ball, and flying fish under the surface.
- The boid schools of `marine-life.js` are unchanged.

## Cost

Nothing that is out of sight is drawn. Nothing out of sight is animated either, and an encounter that has left costs nothing at all. Far
skinned animals swap to a lighter mesh and step their clip at half rate. Schools swim in the vertex shader (no pose textures), share one
shader program, and pack only the groups in view. Loading happens a species per frame; the longest step is about 20 ms. Measured on the
Radeon Vega 10 (1280×800), against `main`:

- 60 fps at six fixed reef spots, with no frame over 33 ms, including with orcas and dolphins forced into view.
- Draw calls and triangles equal to or below `main` at most spots.
- About 0.8 ms of CPU a frame for the whole set.

Run `npm run perf:reef`, `npm run test:encounters` and `npm run test:creatures` with `npm run dev` serving the site.
