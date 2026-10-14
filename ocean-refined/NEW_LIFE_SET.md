# User-created life set — 13 October 2026

Source: user-supplied `sets.zip`, preserved under `assets/models/user-sets/sets/`. Its manifests describe metre units, +Y up and +Z forward. All 37 files were parsed and rendered before integration: 24 creatures, 13 coral types, 72 animation clips, 16,833 source triangles and approximately 3.83 MB uncompressed. No external textures, decoder extensions or dependencies are required. The supplied README identifies the assets as original project models.

## World behavior

The earlier fin whale, whale shark, orca and hammerhead are no longer loaded by the world. The supplied right whale, whale shark and both orcas replace the large visitors at native sizes. Existing rays, ambient life and procedural boid schools remain.

- Full quality adds 10 larger visitors and 216 fish across 32 school habitats. Economy adds 8 visitors and 124 fish. All 24 species remain represented.
- Large animals use authored swim clips with gentle fast-clip blending, distinct depth lanes, smooth broad routes, player avoidance and bounded separation. Remoras escort the whale shark, flying fish stay shallow, cleaner wrasse stay near coral, rays follow the bottom, nurse sharks cruise low, and pelagic fish roam wider routes.
- Small animals use 32 sampled authored skeleton poses in compact GPU textures. Each of 16 species uses one instanced draw batch with independent animation phase. Schools keep spacing, turn around approaching swimmers and regroup smoothly. Hidden animals skip expensive visible animation work.
- All 13 coral types appear in 12 terrain-aligned gardens: 208 colonies in full quality, 91 in economy. Thirteen static instance batches and simple collision proxies keep placement inexpensive. Terrain contact, slope rejection and slight base embedding prevent floating colonies; spawn and landmark approaches stay clear.

## Editing

`user-creatures.js` handles clips, schools and visibility; `user-creature-routes.js` sets species routes and depths. `user-corals.js` handles grounded garden placement. Model Studio lists every new asset at native scale and plays only its swim clip. World Viewer exposes a New coral set layer; new animals share the Creatures layer. Geometry exports include the new coral/animal groups, but procedural school animation remains browser code; edit the original species GLBs for authored clips.

## Checks

At the kit root: `asset-set-check.json`, `model-studio-check.json`, `user-creature-browser-report.json`, `new-life-world-report.json` and their repeatable scripts. `user-corals-qa.mjs` verifies full/economy placements against the real scene. Contact sheet: `asset-set-contact-sheet.png`; scene captures: `qa/refinement-captures/new-life-*.png`.

Checks covered all file counts/bounds/rigs/weights/clips, native size, paused animation, finite simulation, avoidance heading, shader compilation, grounded placement and absence of the four old model requests. Browser tests use software WebGL; render-call counts verify batching but do not establish physical-device FPS.

Final fully prepared daylit scene samples: 101–112 draw calls and approximately 249k–364k triangles, with no shader, WebGL or browser errors. All 24 creature species and 13 coral species loaded successfully. Coral gardens span X −51 to +49 and Z +19 to −86; measured maximum base gap is 6.25 cm with a contact point embedded 2.5 cm.
