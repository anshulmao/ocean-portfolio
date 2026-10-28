# Mobile overhaul: layout contract and workstreams

Goal: on a phone the ocean is the main thing on screen, every piece of interface has one place, nothing overlaps,
every control is easy to hit, the guided dive is followable, location splashes look deliberate, and the world runs
lighter. Desktop must not get worse.

## Why it is cramped today (baseline on main 559f168)

`node tools/test-mobile-layout.mjs` measures ten states on a phone (390×844), a phone in landscape (844×390) and
desktop (1440×900). Baseline: 8/10 phone and 8/10 landscape states fail, desktop 1/10.

- No layout system. The same HUD element is positioned in up to six stylesheets (hud.css, motion.css, quiet-ui.css,
  dive-calm.css, expedition-interactions.css, crt-ui.css…) with hand-picked pixel offsets and 30+ ad-hoc z-index
  values, so on a narrow screen every piece claims its own space and they collide.
- The guided-dive card covers 37–51% of the middle of a phone screen (59% in landscape); the location splash
  ("Sunlit shallows") draws under it; HUD buttons bleed through the glass.
- Toasts ("Found · 1 of 3"), the location splash, the landmark prompt and the projected world labels all compete for
  the middle of the screen at the same moment.
- Prompts say "Press F" on a phone. Map markers are 18 px targets; map expand 28 px; several buttons 31–38 px.
- The top half of a phone is a stack: brand, menu, compass tape, map, depth chip, Portfolio, Dive computer, clear
  screen — before any card appears.
- The logbook/reading sheet stacks three bordered boxes before the content starts; its tabs are cramped.

## The contract

Tokens live in `ocean-refined/tokens.css` (`--o-safe-*`, `--o-pad`, `--o-gap`, `--o-bar`, `--o-tap`, `--o-top`,
`--o-under-bar`, `--o-controls`, `--o-sheet-bottom`, `--o-sheet-max`, and the layers `--o-z-*`). Phones are
`(max-width:599px), (pointer:coarse) and (max-height:499px)`; landscape phones are the second half. Position world
interface with these tokens and layers, never with new magic numbers or new z-index values.

Zones on a phone (portrait):

| Zone | Where | What lives there |
|---|---|---|
| Top bar | `top: var(--o-top)`, height `var(--o-bar)` | left: brand (surface) or depth + zone chip (diving); right: menu button. Nothing else. |
| Under bar, right | `top: var(--o-under-bar)` | the reef map, compact (≈96 px), tap to expand. Heading lives on the map; the compass tape is hidden on phones. |
| Announce | upper third, centred, `pointer-events:none`, layer `--o-z-announce` | one message at a time: location splash, "found", short notices. Queued, ~2.5 s each, never while the sheet is expanded. |
| Sheet | bottom, full width, `bottom: var(--o-sheet-bottom)`, max `var(--o-sheet-max)`, layer `--o-z-sheet` | the guided-dive card, the landmark action, the safety-stop offer. Collapsed = one row (title + primary action); expanded on request or at a tour stop. |
| Controls | bottom corners, height `var(--o-controls)`, layer `--o-z-controls` | thumb-stick left, action keys right. One contextual primary action ("Read · Experience") replaces every "Press F" on touch. |
| Menu | from the menu button, layer `--o-z-menu` | everything secondary: Portfolio, Dive computer, clear screen, camera view, photo, finds, credits, settings. |

Landscape phones: same top bar; the sheet is a bottom-centre panel no wider than 60vw; controls in the corners;
`--o-controls` is 0 because the corners sit beside the sheet. World labels (`#reef-labels`, `#sky-labels`) never sit
on top of a zone: hide them on phones while the sheet is expanded or an announcement is up, and drop secondary lines.

Desktop keeps its current arrangement unless a change is clearly better; phone rules sit inside the phone queries.

## Acceptance

- `node tools/test-mobile-layout.mjs`: every phone and landscape state passes (no overlaps between components, no
  control under 40 px, no sideways scroll, ≥ 60% of the screen left for the ocean in a dive, ≤ 12% of the middle
  covered). Desktop: no state that passes today may fail.
- `npm run check` stays green (build, unit tests, smoke).
- Screenshots in the test's output folder look intentional at 390×844 and 844×390, day and night.

## Workstreams and ownership

Each workstream owns the elements below wherever their rules live today, and may move those rules into its own
files. Do not edit another workstream's elements; report what you need from them instead.

- **A · Dive HUD and touch controls** — top bar and brand in a dive, `#menu-toggle`, `#settings-menu`, compass
  (`#heading-tape`), reef map (`.reef-map`, `#map-*`, waypoint markers), depth/zone chip (`#scene-location`,
  `#depth-*`, `.depth`), air/console instruments, `#archive-toggle`, `#dive-computer-toggle`, `#dive-computer`,
  `#clear-ui-toggle`/`#restore-ui`, `#crosshair`, `#capture-hint`, `#look-hint`, `#interact-prompt` and the touch
  primary action, `.swim-controls` touch deck, expedition dock and artifact prompt, world labels (`#reef-labels`,
  `#sky-labels`, `.waypoint`). Files: hud.css/js, dive-hud.css/js, instruments.css/js, controls.css,
  touch-controls.js, quiet-ui.css/js, dive-calm.css, crt-ui.css, expedition-interactions.css/js (dock, prompt,
  notices), landmark-interactions.js (prompt only), index.html markup for these.
- **B · Guided dive and location splashes** — the tour card (`.tour-card`), its controls, the location splash
  (`.zone-card`), journey toasts (`.journey-toast`), the calm card (`.calm-card`), dive planner, and a single
  announce queue that every short message goes through. Files: guided-dive.js, journey.js/css, hud-calm.js,
  dive-plan.js/css, waterline-splash.js/css.
- **C · Portfolio reading** — the surface screen (`#main`, hero, `#portfolio-options`, surface nav, "See the
  work"), the logbook dialog (`#landmark-dialog`: archive.js/css, logbook.css, archive-lightbox.js), credits dialog,
  and the no-3D reading pages (tools/render-portfolio.mjs, tools/templates/portfolio-reading.css). Files also:
  surface.css, portfolio-entry.css.
- **D · Performance** — renderer, frame budget, quality tiers, creatures/corals/scenery cost, asset loading and the
  build (world.js, frame-pacing.js, experience-performance.js, model-scene.js, user-creatures.js, user-corals.js,
  living-world*.js, marine-life.js, reef.js, shaders.js, sky-system.js, distant-scenery.js, tools/build.mjs). No UI
  files. Bundling the stylesheets/scripts for dist happens in tools/build.mjs, not by editing index.html.

Shared files (`tokens.css`, `motion.css`, `hologram.css`, `index.html`): change only the rules or markup for your
own elements, in small hunks, so the four branches merge cleanly.

## Outcome

All four workstreams are merged. `node tools/test-mobile-layout.mjs`: 30/30 states pass (phone, landscape, desktop),
against 8/10, 8/10 and 9/10 on main. `npm run check` is green. CI runs the layout test as its own job ("Mobile layout"),
uploading the screenshots; make it a required check once it has run steadily on GitHub's runners.

| Phone state | Middle covered before → after | Ocean visible after |
|---|---|---|
| dive-arrival | 32% → under 12% | 85% |
| landmark | 51% → under 12% | 82% |
| guided-travel | 37% → under 12% | 85% |
| guided-stop | 51% → under 12% | 71% |

- A · Dive HUD: one top bar (depth + zone chip, menu), a compact map with the heading on it, Portfolio / Dive computer /
  Clear screen in the menu on phones, one contextual "Read · …" or "Collect · …" button instead of "Press F" on
  touch, 44 px targets, world labels kept out of other zones.
- B · Guided dive: the tour card is a bottom sheet (one row while travelling, headline + clamped body + actions at a
  stop); `announce.js` queues the location splash, "found" notes and short notices one at a time in the announce zone,
  never under the sheet; the splash is a calm title card; copy is input-aware. Sets `body[data-sheet]` and
  `body[data-announce]`.
- C · Reading: the logbook is a full-screen sheet on phones (slim header, swipeable tabs, one flat page at 17 px,
  previous/next bar, swipe between entries) giving the page 82% of the height; the surface keeps clear of the diver;
  the no-JS reading pages have a slimmer nav and 44 px links.
- D · Performance: see `release/PERFORMANCE_PASS.md` (first dive on a phone 22.4 → 11.1 MB, 102 → 85 requests to
  ready, world update per frame −26 to −28%).
- Integration: the scene footer is the only depth chip on phones (A and B had both built one); sideways, announcements
  ride in the top bar's empty middle so they stay out of the 390 px-tall view's middle.
