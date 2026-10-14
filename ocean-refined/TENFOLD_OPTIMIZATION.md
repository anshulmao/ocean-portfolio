# Tenfold performance objective — evidence and remaining work

Objective remains: **keep optimising till it performs 10x faster all across the board**. Completion is not established. Focused wins must not substitute for tenfold cold loading, repeat loading, simulation and GPU rendering at the same scene/viewport/fidelity.

## Implemented and verified

- Exact prepared HUD/planner chart pixels, guarded by hashes of terrain/drawing sources. Independent canvas comparisons show zero channel differences. HUD drawing median approximately 63 ms live versus 0.3 ms prepared (>200×); this excludes asynchronous cache validation/download and is not an application-wide speedup.
- Pre-grounded imported coral cache preserves all 15 habitats, both geometry LODs, materials, decoded image pixels and collision proxies. Original files remain available; stale terrain/source validation declines the cache and loads all eight original model groups successfully.
- Prepared coral cache lossless WebP images reduce each variant from about 7.09 MB to 5.67 MB. Browser verification confirmed pixel-identical textures, geometry, LODs and proxy sets in full/economy modes. Active metadata selects the WebP variant; unsupported decoding returns to the original model pipeline.
- Exclusive Windows preview binding prevents two server versions from listening on the same address. Duplicate task-owned benchmark servers were identified and stopped before the final loading sample. HEAD requests avoid reading the cached body and expose original source length.

## Latest whole-application evidence

`performance-lossless-textures.json`, 1000×720 local Chrome:

| Metric | Latest cold | Latest repeat |
|---|---:|---:|
| Surface ready | 2.347 s | 0.755 s |
| All model packs loaded | 10.498 s | 5.958 s |
| Transferred bytes | 14,959,733 | 39,900 |

Prepared coral cache hit both times; no browser errors. The earlier exclusive-server PNG-cache run was 1.416/0.733 s surface and 8.763/6.855 s all models, illustrating substantial system/shader variance. Earlier conflicting-server samples are diagnostic only, not strong before/after proof. Do not claim all categories became faster from one sample.

Original recorded all-model baseline was 14.45 s cold and 8.26 s repeat. Tenfold corresponding targets are 1.445 s and 0.826 s; current results do not meet either. Initial GPU profiling found roughly 5–6 ms per frame on Intel UHD 620 at 1100×760; a same-fidelity tenfold target would require roughly 0.5–0.6 ms, which is not proven. Frame rate capped by a display must not be used to infer a tenfold rendering improvement.

## Experiments retained but not enabled

- Vertex-animation atlas: pixel-identical rendering but approximately 21% GPU improvement against 3.75× slower module loading and 28.3 MB extra GPU texture data. Rejected as an across-the-board regression.
- Exact indexed creatures: all expanded vertex attributes are bit-identical, renderer screenshots have zero pixel difference; source vertices 44,028→40,822. A GPU sample improved about 10%, but compressed downloads increased 555,775→624,143 bytes and load timing did not improve. Original creature assets remain the production inputs.

## Next work and acceptance

1. Repeated paired full-scene CPU/GPU profiling on fixed surface/shallow/deep views, without overlapping benchmark processes or adaptive-resolution changes. Reef rendering was the largest measured omission delta; reduce its shader/geometry cost while preserving scene fidelity.
2. Move remaining deterministic reef construction and sharing into verified prepared data, or worker-side generation. Measure actual cold/warm critical paths, not only isolated preprocessing.
3. Inspect remaining texture/landmark transfer and decode cost; lossless optimizations must retain chest animation, readable materials and native assets.
4. Investigate terrain-query cost in active simulation; preserve navigation/collision accuracy and fish clearance. Avoid substituting low frame rates or reduced creature populations as proof.
5. Rerun loading, navigation, fish avoidance/pause, model orientation, UI, surfacing and stale-cache fallbacks for each accepted change. Only mark the objective achieved when every covered category meets tenfold against a fixed authoritative baseline.

Review kit remains isolated from the main repository. Main preview stays stopped; temporary servers are used only for verification and stopped afterward.
