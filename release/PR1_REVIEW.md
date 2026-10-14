# PR #1 review — creature set v2

Reviewed the encounter director, resident/school movement, model source/export pipeline, runtime imports, credits and production packaging.

## Corrections included

- Clean the generated `dist` and prebuilt static directory before copying a new build. Previously removed creature files could survive a repeat build and remain deployed. Added a build regression check that seeds a retired asset and verifies its removal from both outputs.
- Validate rig bone/clip counts against the model manifest rather than the old six-bone/one-clip assumptions. Sample vertices throughout the body and compare inside the selected swim cycle; 0.8 seconds is a full remora cycle and produced a false no-deformation result.
- Make studio/rig checks accept an isolated test URL and optional installed Chrome channel, and save extracted component snapshots to ignored QA captures instead of overwriting source fragments.
- Fail model/encounter checks when browser errors, missing animals or invalid state are reported.
- Add an accelerated encounter lifecycle check for all six types, exit/cooldown and subsequent natural scheduling, and commit the dependency lockfile.

## Validation

- Every species builds at all three detail levels; skin weights, UVs, vertices and animation transforms are finite.
- All 40 exported GLBs load back: 27 creatures and 13 corals, matching the manifest's rigs, clips and bounds.
- Full scene: all 27 species load; six encounter types and resident/school views checked with no recorded browser errors.
- Arrival, exit, cooldown and accelerated subsequent encounter scheduling pass.
- UI gallery, model/world viewers and mobile archive pass in installed Chrome. One concurrent bundled-browser attempt timed out; the successful studio checks were run serially with installed Chrome.
- All 27 rigs deform and the reef exports as a valid 42.7 MB GLB with 175 meshes.
- Build regression and input fingerprints pass. Clean production output is approximately 57.6 MB. Retired creature files and the editing studio are excluded.

Desktop browser measurements do not establish physical-phone performance. Safety-stop feedback remains local-only. The public deployment is verified separately after merging.

## Local performance sample

Six fixed viewpoints in installed Chrome, 1280×800, three seconds per viewpoint after model loading. The PR run forced orca and dolphin encounters into view; the previous-release run used its normal fauna. Both runs recorded no browser errors. This is a short, adaptive-resolution sample, not a hardware-independent benchmark.

| View | Previous FPS | PR FPS | Previous / PR render scale |
| --- | ---: | ---: | --- |
| start shallows | 48.7 | 56.5 | 0.85 / 0.85 |
| about reef | 57.4 | 58 | 0.85 / 0.85 |
| wreck | 54.7 | 57.4 | 0.72 / 0.85 |
| mid slope | 56.1 | 59.4 | 0.85 / 1 |
| deep ledge | 60 | 59.4 | 1 / 1 |
| open blue | 60 | 60 | 1 / 1 |
