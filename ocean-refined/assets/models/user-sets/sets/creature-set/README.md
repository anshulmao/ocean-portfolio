# Creature and coral set

Low-poly models made in code for this project. No third-party assets, so there is nothing to credit or license.

- `creature-set/`: 24 animals, one GLB each. Skinned mesh, skeleton and three looping clips per animal. Vertex colours, no textures.
- `coral-set/`: 13 coral colonies, one GLB each. Still meshes with vertex colours, base at y = 0.
- `manifest.json` in each folder lists names, real sizes, bounds, triangle and bone counts, and clips.

Conventions: one unit is one metre, +Y is up, animals face +Z with the origin at mid-length. Every model is at its real size, so the set is in scale with itself; nothing needs rescaling on import. (The older `creatures/` folder is different: those are normalised to about one unit and scaled in code.)

The files are an export. The source is `ocean-refined/creature-species.js` (the animals as numbers), `creature-kit.js` (the builder, rig and clips) and `coral-varieties.js` (the corals). After changing a species, rebuild the files from `ocean-refined/` with:

    node tools/export-creature-set.mjs

To look at them, open `ocean-refined/creature-studio.html` from the kit launcher: one model at a time with its clips and skeleton, the whole set lined up at true scale beside a diver, and a GLB download for each. `node qa/creature-glb-check.mjs` loads every file back and compares it with its manifest.
