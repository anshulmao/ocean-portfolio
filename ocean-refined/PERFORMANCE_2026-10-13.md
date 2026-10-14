# Performance and loading pass — 13 October 2026

The ocean preview on 4190 was stopped before work. Temporary measurements used 4197; that server is also stopped after verification. A separate user-owned asset studio on 4192 was not modified. All changes remain in the isolated review kit.

## Changes

- The local server delivers gzip-compressed JavaScript, styles, JSON and GLBs, with source-stamped ETags and conditional 304 responses. Source edits invalidate the compressed cache automatically. `run-kit.cmd` prepares `.http-cache/` using `tools/build-http-cache.py` before launching; direct server launches can still serve uncached changes. Code remains revalidated rather than hidden behind a long stale cache.
- School animation skips texture fetches for zero-weight bones. Constant phase buffers upload only when visible membership changes. Paused and entirely invisible schools avoid matrix uploads; paused updates still recull visibility. Exact duplicate terrain queries are removed.
- Coral placement uses a frozen spatial collision index, deduplicated identical base vertices and allocation-free distance comparisons. Seed order, all placement matrices, grounding and collision proxies remain identical.

## Evidence

Local Chrome/software WebGL comparison, same 1000×720 viewport:

| Measurement | Before | After |
|---|---:|---:|
| Cold transferred data | 42.79 MB | 27.91 MB |
| Repeat transferred data | 17.61 MB | 0.11 MB |
| Surface ready, cold | 1.86 s | 1.92 s |
| All model packs loaded, cold | 14.45 s | 11.66 s |
| Surface ready, repeat | 0.78 s | 0.66 s |
| All model packs loaded, repeat | 8.26 s | 8.66 s |

These are single before/after samples, not a guaranteed loading-time or FPS improvement. Shader compilation, parsing and world construction still affect repeat loading. Network reduction is substantial; surface/cached-model timing variation does not support claiming every stage became faster.

Coral work against identical real collision snapshots, three alternating trials: full mean 129.7→85.3 ms; economy 93.0→73.7 ms. Exact full collision tests 786,031→4,752, terrain queries −27.5%; all 208/91 placement matrices and proxies match.

Creature microbenchmarks: paused median 0.343→0.011 ms per update; paused/offscreen matrix uploads and unchanged phase uploads fall to zero. Active terrain queries fall 18.7%. Active CPU timing differences are within run variance, so no FPS gain is claimed. GPU optimization comparison screenshots were pixel identical.

Validation passed full/economy species, authored clips, finite simulation, pause/avoidance, coral placement, shader compilation, gzip byte integrity and ETag revalidation. No browser/WebGL errors. Reports: `performance-before.json`, `performance-after.json`, `user-creature-optimized-final-metrics.json`, `qa/user-corals-performance.json` at the kit root.

For external hosting, enable compression and ETag/cache handling there too; Python server improvements do not configure a future hosting provider. Avoid packaging `.http-cache/` when preparing an editing handoff; it can be regenerated from source.
