# Ocean portfolio

Live site: https://anshul-portfolio-rho.vercel.app/

The full source of Anshul’s browser-based Three.js portfolio, including the ocean world, 27 authored creature species with encounters and reef behaviour, schooling fish, coral habitats, astronomical sky, first/third-person diving, map, dive instruments and portfolio archive. The repository is private; the hosted site is public.

## Run and edit

Requirements: Node.js 22+ and Python 3.10+.

- `npm run dev` serves the editing source at http://127.0.0.1:4190/ocean-refined/. Use another port if 4190 is occupied: `python serve.py --port 4191`.
- `ocean-refined/ui-gallery.html` reviews UI separately.
- `ocean-refined/world-viewer.html` explores and exports the world.
- `ocean-refined/pack-viewer.html` inspects model packs and rigs.
- `ocean-refined/creature-studio.html` shows the creature and coral set at site scale with every clip, and downloads each model. `npm run export:creatures` rebuilds the set's GLBs from `creature-species.js`; `ocean-refined/user-creature-routes.js` holds the encounter, resident and school settings.
- `ocean-refined/ambient-audio.js` is the sound: synthesised in the browser, with real recordings for the breathing, sea bed, dolphins, whales and thunder. `npm run prepare:audio` (needs ffmpeg) cuts `ocean-refined/assets/audio/source/` into the clips that ship; sources and licence are in `ocean-refined/assets/audio/CREDITS.md`.
- `ocean-refined/portfolio-content.js` contains the portfolio text. Editor-only introduction drafts are excluded by the production build.
- Model sources, rigs, textures and prepared caches are in `ocean-refined/assets/`. Creator and licence metadata are preserved alongside the models.

## Build the public site

Run `npm run build`. It creates `dist/` with the exact launch structure: ocean at `/`, lightweight portfolio at `/profile.html`, resume, privacy page and sitemap. It excludes editing studios, tests, captures, copy variants and unused model backups. `dist/` is generated and deliberately not committed.

The build uses Node’s built-in modules and copies the pinned PostHog browser SDK from npm. Vercel can build it with the included `vercel.json`: framework Other, build `npm run build`, output `dist`.

For direct upload, authenticate with Vercel and link to the existing `anshul-portfolio` project in `anshulmaos-projects`. Run `npm run build`, `npm run prepare:deploy`, then `vercel deploy --prebuilt --prod --scope team_QxXq7z7TZDEkoke6wCrExIrB`. Inspect the linked project before deploying. Do not commit `.env*` or `.vercel/`.

After deploying, run `npm run smoke -- https://anshul-portfolio-rho.vercel.app/` and update `release/live-site.json` only once it passes; if it fails, roll back to the previous deployment recorded there. `release/live-site.json` records the production deployment and previous deployment for rollback. Git push alone does not establish that Vercel has deployed a new revision; verify hosting separately.

## Checks and limitations

Every pull request runs `.github/workflows/ci.yml`: the build (which fails if any shipped script does not parse), `test:build`, `test:services`, `test:unit` and `smoke`, a browser check that each page loads without a script error and that the surface links, deep links and reading pages all open. Run the same set locally with `npm run check`. Browser scripts use Playwright's Chromium (`npx playwright install chromium`); set `PLAYWRIGHT_CHROMIUM_PATH` or `PLAYWRIGHT_CHANNEL=chrome` to use another browser.

The live launch passed Chrome desktop/mobile viewport checks, all 24 creature species and eight landmark/coral models, map, portfolio panels, resume download and prepared coral cache. Physical-device performance remains unmeasured. Browser tests use Playwright: install development dependencies and Chromium (`npm install`, `npx playwright install chromium`), then use the test scripts in package.json. Older tests may describe historical UI; consult the latest tests and refinement notes under `ocean-refined/`.

Depth readings are calibrated to 0–40 m; geometry and movement distances retain the original world scale. Safety-stop feedback is sent privately to Supabase, with contact details included only on explicit opt-in. Photos download locally and can be separately shared from Settings. Optional PostHog analytics is prepared for both ocean and reading pages; its project token and API host still need to be configured. See [backend setup](release/BACKEND_SETUP.md) for deployment state, limits, privacy choices and verification.

Original user-supplied Sets assets and older attributed landmark/ray models are both present. This repository does not relicense third-party assets; see their included credits and manifests. Some source-review notes describe earlier versions; the production build and current runtime code determine what is shipped.
