# Performance pass (workstream D): measurements and changes

Baseline: 97c324d. Tools: `tools/perf-probe.mjs` (loading, memory, renderer, per-frame update; phone 390×844 with the
CPU slowed 4× through CDP, desktop 1440×900; dist/ served with vercel.json's headers, fresh browser per run, median of
3) and `tools/perf-ab.mjs` (two builds side by side, per-frame update in alternating rounds). Run `npm run build` first.

This machine renders WebGL with SwiftShader on four shared cores, so frame rates and wall-clock timings are noisy and
say little about a GPU; bytes, requests, draw calls, triangles, heap and the A/B of CPU work are the numbers to trust.

## Before and after (median of 3 runs; A/B median of 9 rounds)

| | Phone before | Phone after | Desktop before | Desktop after |
|---|---:|---:|---:|---:|
| Requests to ready | 102 | 85 | 102 | 85 |
| Bytes to ready (gzip as served) | 828 KB | 673 KB | 828 KB | 673 KB |
| Bytes before a dive may go under | 13.66 MB | 7.69 MB | 13.66 MB | 10.88 MB |
| Bytes for the whole first dive | 22.37 MB | 11.12 MB | 22.37 MB | 14.31 MB |
| Bytes if the visitor never dives | 22.37 MB | 7.69 MB | 22.37 MB | 14.31 MB |
| Ready (ms, noisy) | 7570 | 5133 | 4120 | 3903 |
| Long tasks until the first dive | 116 / 28.6 s | 96 / 18.1 s | 66 / 25.3 s | 54 / 17.1 s |
| JS heap after ready / after a 20 s dive | 9.7 / 25.2 MB | 8.6 / 24.9 MB | 12.8 / 26.7 MB | 12.9 / 26.7 MB |
| Draw calls / triangles, surface | 35 / 56k | 35 / 56k | 41 / 87k | 38 / 87k |
| Draw calls / triangles, dive | 102 / 210k | 102 / 209k | 154 / 527k | 155 / 526k |
| World update per 1/30 s frame (A/B) | 1.80 ms | 1.30 ms (−28%) | 2.70 ms | 2.00 ms (−26%) |

Wall-clock timings come from SwiftShader at a few frames a second, where everything paced by frames waits on the
software rasteriser; the time to the first dive (61 s before, 43 s after here) is that, not a phone's.

## What changed

1. **Build** (`tools/build.mjs`): one bundled stylesheet instead of 18 render-blocking ones (CSSOM-identical, 60 → 37 KB
   gzipped); modulepreload for all 55 statically imported modules (21 were missing); scripts minified with esbuild
   (whitespace and syntax only, names kept; 431 → 327 KB gzipped; skipped with a warning when dev dependencies are not
   installed); a gzipped copy beside every model the page loads, inflated in the browser (`modelBytes`, assets.js) with
   a fallback to the plain file.
2. **Landmark models**: PNG textures as lossless WebP (pixel-identical; the anchor's duplicated texture removed);
   economy loads `-economy.glb` copies with half-size textures (the GPU's first mip level), 3.6 MB instead of 7.8.
3. **Economy loading**: the optional creature and coral packs wait for a dive to be asked for.
4. **Per frame**: a fast path for `Matrix4.toArray` into Float32Arrays (megamorphic in three: 650 → 25 ns a matrix,
   under every instanced fish, bubble and bone); the sky's ephemeris computed once a simulated minute and blended
   (worst error 0.00005°); the HUD clock formatted once a minute; economy reef schools take one 1/30 s step per drawn
   frame instead of two at 1/60; no per-frame string for school visibility.

## Measured and left alone

- Pixel ratio and render scale: economy already renders at most one pixel per CSS pixel and its adaptive floor is
  0.72; no shadow maps anywhere; no post-processing in economy.
- Draw calls and triangles: already instanced and batched (≈100 calls in a phone dive).
- Half-size textures in the prepared coral cache, or quantized geometry: would break the cache's exact equivalence with
  the live placement it verifies, and soften the corals up close.
- Lossy textures for desktop: not pixel-identical.
- Dropping economy's idle surface below 30 fps: visibly choppier water.
- Renaming identifiers in the minifier: 25 KB more, at the cost of readable console errors.

Screenshots (surface, a dive, the chest up close; phone and desktop, before/after) were compared by eye: desktop is
unchanged; on a phone the chest's wood grain is slightly softer at touching distance.
