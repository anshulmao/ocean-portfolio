# Portfolio: three-stage implementation

Branch: `codex/portfolio-three-stage`

Purpose: make Anshul easy to understand, give the ocean a meaningful relationship to the work, and let visitors choose their level of attention.

## Stage 1 — Understand and navigate

- Keep the ocean and “Go a little deeper” identity; introduce Anshul's professional role immediately.
- Provide two clear paths: explore the world or view the work. Keep resume and contact directly available.
- Move guided/planned routes into progressive disclosure; retain all movement, map, clear-screen, settings, and safety-stop contracts.
- Use familiar About, Experience, Projects, Resume labels with nautical names as supporting context.
- Accept when first-time visitors can reach work, resume, and contact without swimming, and all entry controls work by keyboard and on a phone.

## Stage 2 — Discover judgment and personality

- Strengthen project presentation with a fast summary, precise ownership, a meaningful decision, evidence, outcome or honest limits, and learning.
- Use existing public screenshots; provide clearly labelled explanatory diagrams where screenshots are unavailable.
- Make the guided dive a paced introduction to professional ideas, with optional reading, skip, exit, and manual control takeover.
- Give different projects distinct restrained color accents, maintain readable ocean styling, and eliminate duplicate experience copy.
- Accept when project claims are grounded in approved sources, entries retain stable deep links, and exploration never gates essential information.

## Stage 3 — Deliver and share smoothly

- Generate a first-class lightweight portfolio and individual project pages from the same content as the world.
- Include semantic HTML, ordinary navigation links, descriptive metadata, project sharing images, canonical routes, and an updated sitemap.
- Prioritize essential landmarks before optional creature/coral asset processing while preserving surface prewarming and data-saving behavior.
- Add local-only bounded performance diagnostics and test cold entry, first dive, route access without JavaScript, reading, and mobile overflow.
- Accept when production builds preserve model caches, generated routes/assets resolve, no new browser errors appear, and reading remains independent of WebGL.

## Scope boundaries

- No fabricated outcome metrics, testimonials, product screenshots, or confidential source artifacts.
- Retain the existing resume until a specific replacement is selected and verified; describe its date accurately.
- This implementation is a reviewable branch. Deployment, a personal domain purchase, Search Console setup, and real-visitor analytics are separate actions.
- Lab timings describe this computer and test conditions, not production field performance or a guaranteed Core Web Vitals score.

## Validation

All three implementation stages complete and independently reviewed. This is a tested local branch, not a production deployment.

- Production build: 170 files, 57.8 MB total deployable output (not initial-page transfer size). Existing 27-species pack, content-addressed URLs, stale-file removal, and prepared coral source hashes passed build checks.
- Static integrity: seven no-runtime-JavaScript reading pages, 126 local links/assets/fragments, eight images with alt text and dimensions. Desktop 1440 x 900 and phone 390 x 844 routes load with JavaScript disabled and request no Three.js or GLB assets.
- Functional browser checks: immediate work entry, all six case studies, mobile archive, correct ocean deep links, WebGL-blocked Rae link, essential landmark loading before optional model processing, three-stop tour with unlimited reading pace and movement takeover passed.
- Existing regression suite: desktop/mobile brightness, weather and sound settings, suspension/focus, first-dive aim handoff, staged safety-stop camera/rating/local export, mobile fit, ascent and waterline splash passed. No page errors.
- Final completion audit: Data Saver now defers model downloads on hover/focus as well as on its timer; an explicit dive still loads landmarks and reaches controllable exploration. Browser tests also verified keyboard entry, Escape focus restoration and route disclosure.
- Bounded performance diagnostics unit checks passed; report available locally through `oceanExperienceMetrics.snapshot()` with no persistence or network transmission.
- Final local Chrome run: surface ready 1,790 ms from navigation; reading-page LCP signal 1,244 ms; work-panel open observation about 105 ms after its click event; active rendered-frame p95 approximately 18 ms. Background preparation still included eight frame gaps over 50 ms (worst 197 ms) and 13 long tasks (longest 232 ms). These are observations from one local lab session, not field INP/Core Web Vitals or proof of a production speedup. First usable dive timestamp includes time spent reading and test actions and must not be interpreted as dive load duration.
- Local static project document loads ranged 63–97 ms in that run. Real-network/physical-phone performance remains to be measured after deployment.

Independent review corrections included the scenic arch shortcut after the tour was reduced to three stops, immediate deep-link opening without waiting for WebGL, small-text contrast, and a duplicate production-only reading badge. A combined test harness initially timed out after context changes; separating reading, live WebGL and deliberately blocked-WebGL cases into fresh Chrome processes produced a complete passing run.

## Review locally

- Full built experience: http://127.0.0.1:4210/dist/
- Lightweight portfolio: http://127.0.0.1:4210/dist/profile.html
- Example project: http://127.0.0.1:4210/dist/projects/wattmana/

Use the built `/dist/` preview for the full experience; reading pages are generated outputs rather than duplicate source documents. `npm run build` regenerates them. `npm run test:build` also verifies generated links and model cache integrity.

Automated verification commands:

- `node tools/test-portfolio-experience.mjs`
- `node tools/test-portfolio-data-saver.mjs`
- `node tools/test-settings-menu.mjs`
- `node tools/test-dive-handoff.mjs`
- `node tools/test-control-refinement.mjs`
- `node ocean-refined/newqa/experience-performance.mjs`

The browser suite supports `OCEAN_TEST_URL` for the built root URL. Screenshots and the detailed QA JSON are local review artifacts and are excluded from deployment.

## Remaining launch decisions

A personal domain and Search Console verification require the owner's domain/account choice. A current replacement resume must be selected before changing the date-labelled existing PDF. Real-visitor analytics were not introduced. Review/merge and production deployment remain separate from this implementation.
