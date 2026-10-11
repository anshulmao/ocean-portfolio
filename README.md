# Ocean portfolio

A browser-only Three.js portfolio: a real-date sky, living reef, first-person diving and instrument-style portfolio overlays. Source repository is private. No backend or build is required.

## Run locally

From the repository root, run `python ocean-refined/qa/serve.py`, then open http://127.0.0.1:4175/ocean-refined/ (stop another process using port 4175 first).

WASD swims, mouse aims, Space rises, Shift descends, V changes perspective, C toggles the Dive Computer, F opens a nearby waypoint and Escape releases the mouse or closes the archive.

## Portfolio copy

`ocean-refined/portfolio-content.js` keeps presentation data separate from the scene. Existing website copy is the baseline; new reading-style introductions await approval. See `ocean-refined/COPY_REVIEW.md`.

## Assets and checks

Creator attribution and licence terms are retained in `ocean-refined/assets/models/CREDITS.md`, `ASSETS.md` and vendor licence files. This repository does not grant a new licence over third-party assets.

See `ocean-refined/VALIDATION.md` for verified checks and limitations. To run browser checks, install development dependencies with `npm install`, install Chromium with `npx playwright install chromium`, start the preview, then run `npm run test:hud`. Browser-rendering checks use software WebGL; physical-device FPS remains unmeasured. Captures are ignored.


## CRT expedition update

The heading tape, animated time slider and reef-derived angled chart accompany a phosphor CRT field archive. Dive and ascent camera translation/rotation are eased and speed-limited; returning restores the original third-person surface composition. The morning/evening horizon faces east/west while the astronomical sky remains physically mapped.

Concept boards and prompts are in `design/ocean-crt/`. The deployment plan is `design/ocean-crt/DEPLOYMENT.md`; no hosting release has been performed. Exclude design and QA files from the eventual static output.

Run `npm run test:crt` for the new desktop/mobile transition and layout checks.
