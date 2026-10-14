# Creature and coral set

Low-poly models made in code for this project. No third-party assets, so there is nothing to credit or license.

- `creature-set/`: 27 animals, one GLB each. A skinned mesh, its skeleton, a painted skin texture embedded in the file, and 5 to 9 clips. Loops for swimming, sprinting, hovering and turning left or right. One-off actions such as `burst`, `strike`, `breach`, `spyhop`, `spin`, `fluke_dive`, `feed`, `ram`, `bury`, `launch`. The manifest marks which clips loop.
- `coral-set/`: 13 coral colonies, one GLB each. Still meshes with vertex colours, base at y = 0.
- `manifest.json` in each folder lists names, sizes on the site and in life, bounds, triangle and bone counts, and clips.

Scale: the set is sized for this site, not for life. The schooling fish already in the scene are 1 to 1.5 m long, so the small reef fish match them (sea goldie 0.8 m, powder blue tang 1.3 m). Everything larger keeps its order and rough proportion with the gaps squeezed: blacktip 5.2 m, dolphin 7.3 m, orca bull 13.3 m, whale shark 17 m, right whale 22 m. The rule is `siteLength` in `ocean-refined/creature-species.js`. Corals follow the same rule. Real sizes are kept in the manifests.

Conventions: one unit is one metre, +Y is up, animals face +Z with the origin at mid-length. Nothing needs rescaling on import. (The older `creatures/` folder is different: those models are normalised to about one unit and scaled in code.)

The files are an export. The source is:

- `ocean-refined/creature-species.js`: each animal as numbers and a painter.
- `ocean-refined/creature-kit.js`: the builder, skin painting, rig and clips.
- `ocean-refined/coral-varieties.js`: the corals.

After changing a species, rebuild the files from the repository root with:

    npm run export:creatures

To look at the models, open `ocean-refined/creature-studio.html` from the kit launcher. It shows:

- one model at a time, with every clip and its skeleton;
- the whole set lined up at site scale beside a diver;
- contact sheets of the animals and the corals;
- a GLB download for each model.

Checks:

- `npm run test:creatures` builds every species and plays every clip in Node, then loads every file back in Chrome and compares it with its manifest (with `npm run dev` running).
