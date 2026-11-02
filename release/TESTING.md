# Test and CI audit — 1 November 2026

Original audit from `main` at `5b32c72271d4ab586a3596eac06749bfc4fd1eb8`.

## Compatibility refresh — 3 November 2026

Rebased onto `main` at `504e2ed26d4b7d8ca92844a28ef5522152dd2828`, preserving merged PR #37 (portfolio sheet/UI system) and #38 (simplified safety-stop feedback). The workflow and npm script conflicts retained the new `test:ui` suite and its screenshot artifacts alongside the audit checks; no newer UI work was reverted.

PR #38 intentionally removes the contact checkbox. The browser test now verifies the approved form contract: fields are hidden until a rating, rating pauses the countdown, omitted contact is null, typing optional contact sends nothing, and explicit submission includes the supplied contact with consent. The backend's separate rejection of unconsented contact remains tested. Unit checks cover pause/resume/cancel without changing the 45-second requirement. This is a documented product requirement change, not an exception to obtain green.

Current main's [CI run](https://github.com/anshulmao/ocean-portfolio/actions/runs/41510767838) fails for a flying-fish/diver clearance finding and a desktop guided-travel label/control overlap. The refreshed branch is checked against those same limits. Earlier local results below belong to the 1 November base and do not prove compatibility with this new base.

## Findings and decisions

- The 1 November main [CI run](https://github.com/anshulmao/ocean-portfolio/actions/runs/41304609788) failed layout and reef, while build/unit and smoke passed. Layout took 7m50s inside an 8m49s job; reef took 64s inside a 1m39s job. These were actual failed assertions, not dependency installation failures.
- Preserve navigation/collision continuity, privacy, asset integrity, touch targets, overflow and geometry checks. These protect visitor behavior. Keep their limits; do not update an expectation merely because a new feature fails it.
- Remove the extra build before `test:build`: that test deliberately seeds stale output, runs a clean build and verifies cleanup. Building before it did the work twice. Keep independent small builds in browser/layout jobs: transferring the large asset directory would introduce a new artifact dependency and more work.
- Split layout into phone, landscape and desktop jobs. All profiles and states still run; one failed profile does not cancel the others. Keep the same overlap, 40px target and ocean-visibility limits. Request only Chromium's headless shell in CI.
- Strengthen smoke: exact nav section mapping; all projects from the canonical content must be linked and visited independently; reading pages work with JavaScript both enabled and disabled; failed checks close their contexts. Previously deleting a project link could also remove that project from the test's input.
- The exported model pack must match every runtime species ID exactly once. A fixed count could pass after replacing a species with a duplicate; changing a count for each addition did not verify pack completeness. Gzip, cache hashes, CSS bundling, local links, alt text and deployment cleanup checks remain.
- Bring the existing service browser test into CI. Repair its obsolete immediate-photo-download expectation against the documented dive-log flow: capture stays local, download stays local, opening Share stays local, explicit Send uploads exactly one JPEG with its note. Keep contact opt-in, retained input on failure, same-ID retry and analytics opt-out checks. All backend/analytics traffic is intercepted at synthetic `.invalid` domains; unexpected requests are blocked.
- Fix the toast overlap in production: `data-announce` remains set during the outgoing 300ms fade, instead of exposing world labels over it. New clock-controlled queue tests check fade, blocking, replacement, expiry and clear behavior.
- Fix cloud fish banking in production: use the change in actual heading, including diver avoidance, rather than the unperturbed loop's heading. The reef audit's bank tolerance remains unchanged.
- A seeded resident-only audit still passed with the old bank formula: that broad audit is not sufficient regression coverage for the original intermittent failure. Add a focused browser test that loads the production models without the world renderer, puts a diver into/out of a cloud, and checks the sign of every meaningful bank at 30/60/120 Hz. The fixed code checks 3,683 / 8,799 / 17,606 turns with zero wrong banks; restoring the old formula failed with 244 wrong banking frames at 30 Hz. The production formula passed at all three rates.
- Reset the reef audit's creature simulation after async loading/rendering stops. A page-level random seed alone did not fix the simulation's starting time or intervening random consumption. The audit now starts a fresh production creature system at t=0 against the real terrain/collision world, with recorded seeds. Missing procedural-reef instrumentation now fails rather than silently dropping that coverage.
- Remove the layout script's silent success when desktop pointer lock was not obtained. An invalid profile also fails instead of running zero profiles.

## Commands and coverage

| Command | Protects | CI |
| --- | --- | --- |
| `npm test` | Service handler behavior and the explicit unit list below | Build/unit job |
| `npm run test:build` | Clean build, complete model pack, compressed models, caches, shipped styles/scripts/audio, static links and metadata, deployment output | Build/unit job |
| `npm run smoke` | Built navigation, deep links, every reading page/project and its images, with/without JS | Browser job |
| `npm run test:services:browser` | Real frontend/SDK with mocked I/O: feedback error/retry, consent, local capture/download, explicit photo sharing, analytics opt-out | Browser job |
| `npm run test:banking` | Production cloud-fish motion while a diver enters/leaves; all actual turns bank inward at three frame rates | Browser job |
| `npm run test:ui` | Merged UI regression suite: reading widths, contrast, keyboard, ocean sheets and reduced motion | Browser job |
| `npm run check` | All six rows above; builds once | Local equivalent of fast jobs |
| `npm run test:layout -- --only=phone` | Touch targets, overlap, overflow and remaining ocean view across visitor states | Layout matrix; also landscape and desktop |
| `npm run audit:reef -- --quick` | Coral placement, body/seabed/reef clearance, swimming/banking, six encounters, school avoidance/cohesion, 30/60/120 Hz | Reef job |
| `npm run audit:reef -- --quality=both` | Longer durations and three encounter locations in both qualities | Manual release check |

Do not make `node --test` discover every file: this repository also contains live-write probes, exporters, screenshot tools and obsolete fixtures. The explicit unit list is intentional. A zero `assert` count alone does not mean no testing: creature smoke, GLB round-trip, layout and reef use custom checks and non-zero exit codes.

## Inventory

Paths are relative to the indicated directory. “Historical” means retained for reference and not validated as a current acceptance gate; it does not mean its underlying behavior is unnecessary.

### `tools/`

| Script | Decision / purpose |
| --- | --- |
| `services.test.mjs` | Keep: validation, origins/keys, quota, database acknowledgement, upload cleanup and analytics sanitization. Mocked backend; not a live RLS test. |
| `build-check.mjs`, `check-portfolio-pages.mjs` | Keep: production output and static reading integrity. |
| `smoke.mjs` | Keep and strengthen: built visitor routes and reading pages. |
| `test-held-map.mjs` | Keep in unit: held key, release, blur, visibility, overlay and typing behavior. |
| `test-ascent-composition.mjs` | Keep in unit: no jumps at safety stop/ascent, continuous diver pose. |
| `test-cinematic-route.mjs` | Keep in unit: collision-checked routes and look-ahead. |
| `test-guided-motion.mjs` | Keep in unit: real planner/integrator, obstacle detours, tour input, takeover/rejoin, reduced motion and bounded movement. Large but substantial behavior coverage. |
| `test-navigation-clock.mjs` | Keep in unit: real navigation/return integrator at 30/60/120 Hz; braking, stop, skip, expiry, ascent acceleration and collision path. |
| `test-settings-escape.mjs` | Keep: real listener and overlay priority. Source-slicing harness is brittle; replace with a normal import if HUD input is next refactored. No snapshot of exact code is asserted. |
| `test-announcements.mjs` | New unit regression: fade-zone ownership and queue behavior under a controlled clock. |
| `test-cloud-banking.mjs` | New focused browser regression: real models and motion on a synthetic coral site, no WebGL or real server; fails if the old planned-loop bank returns. |
| `test-return-route.mjs` | New unit: promote useful return-planning assertions from the standalone return-controls browser script. |
| `test-mobile-layout.mjs` | Keep full profile matrix: surface, profile, summary, reading, dive, landmark, settings and guided states; desktop crosshair flow must actually run. |
| `test-services-browser.mjs` | Repair and promote to CI; see privacy contract above and the 3 November form update. |
| `test-ui-system.mjs` | Preserve merged PR #37 coverage and screenshot artifacts; run in CI and local check. |
| `audit-reef.mjs` | Keep: actual geometry and deterministic production simulation; never turn findings into warnings to obtain green. |
| `test-portfolio-experience.mjs` | Historical overlap with smoke/build/layout; exact copy, project count and no-script assumptions are stale (reading pages now deliberately include analytics). Do not run as a second broad gate. |
| `test-settings-menu.mjs`, `test-settings-sidebar.mjs` | Historical rounds of settings UI; duplicate broad state/layout coverage and exact default assertions. Use focused Escape/layout checks for CI; revalidate specific keyboard controls before migrating anything else. |
| `test-control-refinement.mjs` | Historical mixed defaults/UI/teleport checks. Avoid duplicating unit settings and layout; retain as a source of focused control scenarios. |
| `test-quiet-ui.mjs` | Useful isolated keyboard/clear-UI behavior, but legacy fixture and hardcoded Chrome. Candidate for a current fixture test, not deleted. |
| `test-quiet-live.mjs` | Manual real-world clear-UI check; overlaps isolated quiet test but verifies integration. |
| `test-return-controls.mjs`, `test-cinematic-return.mjs` | Manual return integration. Route/clock/pose behavior is covered in unit; keep browser-only input/handoff coverage for release work. |
| `test-dive-handoff.mjs` | Manual source-server camera/input handoff integration; useful when changing transition code. |
| `test-dive-summary.mjs` | Manual full-world log integration; exact species count is stale. Layout and service fixture now cover summary rendering and sharing, but animal sightings/real-dive accumulation remain distinct. |
| `test-portfolio-data-saver.mjs` | Valuable real-world network contract: no model prewarm on Save-Data. Keep; migrate to a self-serving built-site test before adding it to CI. |
| `test-profile-free-look.mjs`, `test-surface-controls.mjs` | Manual focused camera/idle behavior; layout covers profile Escape integration, not all camera orbit behavior. |
| `test-intake-live.mjs` | Explicit live backend write/read-access probe. Never include in routine PR discovery. Not executed in this audit. |
| `perf-ab.mjs`, `perf-handoffs.mjs`, `perf-hold.mjs`, `perf-probe.mjs` | Diagnostic timing probes, not correctness gates. Compare on controlled hardware; do not gate PRs on software WebGL FPS. |
| `capture-schools.mjs`, `compare-views.mjs`, `sky-shots.mjs`, `water-shots.mjs` | Capture/review utilities, not automated acceptance coverage. |

### `ocean-refined/newqa/`

| Script | Decision / purpose |
| --- | --- |
| `creature-smoke.mjs` | Keep in unit: every runtime species at all LODs, skin weights, finite geometry/UVs and playable clips. Custom failure counter is real testing. |
| `distributed-ecology.mjs` | Keep: both quality modes, geographic distribution, diver clearance and finite instance matrices. Overlaps school-fish but still checks separate invariants. |
| `diver-rig.mjs` | Keep in unit: actual rig and pose behavior. |
| `experience-performance.mjs` | Keep in unit: metric aggregation and observer fallback; not an FPS benchmark. |
| `fish-navigation.mjs` | Keep in unit: obstacle bypass, slope clearance, bounded vertical/heading changes and progress rather than freezing. |
| `moray-resident.mjs` | Keep in unit: fixed den anchor, eased emergence/retraction and scaling. |
| `movement-profile.mjs` | Keep in unit: legacy settings reset, visitor persistence and defaults reset. |
| `safety-stop-clock.mjs` | Keep in unit: stop range, elapsed-time behavior and reset. |
| `school-fish.mjs` | Keep in unit: frame-rate independence, pause, drawn motion, avoidance/burst, model facts and draw-call budget. |
| `waterline-splash.mjs` | Keep in unit: crossing gate, jitter rejection and one splash per transition. |
| `navigation-refined.mjs` | Confirmed broken harness: missing `document.getElementById`. Do not fix expected navigation results blindly; port any uncovered cases to the current integrator harness. |
| `reef-detail.mjs` | Confirmed broken Node harness: reef fan textures now need a document canvas. World geometry is audited in the browser. |
| `terrain-v2.mjs` | Confirmed obsolete exact landmark depth: expects Experience seabed -26, current -48. Old location snapshots should not be re-blessed; clearance is the useful current invariant. |
| `creature-glb-check.mjs` | Useful manual GLB round-trip contract (manifest vs loaded rig/clips/textures/bounds), custom failure counter. Studio/server requirement makes it unsuitable for blind unit discovery. |
| `creature-rigs-export.mjs` | Manual rig deformation plus world-export validation; expensive editor/export path, not public-site CI. |
| `creatures-studio.mjs` | Manual studio/editor behavior and component captures. Keep outside production CI. |
| `creature-encounters.mjs` | Manual encounter/resident visibility and capture. Real custom verdict, but some hardcoded counts; reef already provides broader per-frame movement gates. |
| `creature-lifecycle.mjs` | Manual paused/offscreen work and encounter lifecycle; useful during creature performance changes. |
| `fish-scene-navigation.mjs` | Manual full-scene navigation/den integration; overlaps reef/unit but useful for rendered-world changes. |
| `dive-hud.mjs` | Alias importing `immersive-hud.mjs`; no independent coverage. |
| `immersive-hud.mjs`, `finish-immersive.mjs` | Historical HUD controls/selectors and media assumptions; use current smoke/layout instead of another broad UI gate. |
| `crt-expedition.mjs`, `expanded-ecology.mjs`, `journey-refined.mjs`, `sky-chapters.mjs` | Historical feature acceptance/capture scripts on fixed port 4175. Keep as scenario references; require contract review before reuse. |
| `dawn-refined.mjs`, `creature-shots.mjs` | Screenshot tools. Dawn logs errors but has no verdict; neither proves correctness. |
| `creature-cpu.mjs`, `reef-probe.mjs` | Measurements/captures without a correctness threshold. Diagnostic tools, not tests. |

Other source-level suites: `ocean-refined/depth-map-check.mjs`, `test-expedition-world.mjs`, `test-expedition-interactions.mjs`, and `qa/grounded-landmarks.mjs` are manual/historical integration or geometry probes. They require their server/DOM assumptions to be revalidated and are not part of the green CI claim.

## Evidence and remaining gaps

- Baseline services: 8 passed. Baseline unit: 16 scripts passed. Updated fast suite: 8 service tests and 21 unit tests passed; new announce test fails on the original immediate-label-release behavior.
- Built output validates 13 reading/design pages, 525 local references and 76 images; model membership matches all 45 current runtime species.
- Negative controls: releasing labels at the start of the toast fade fails the new queue test; restoring planned-loop banking fails the dedicated bank test (244 wrong frames at 30 Hz); removing every WattMana project link fails the smoke contract while the independent project-page check still runs. All mutations were restored.
- Final `npm run check` passed locally on Windows with Node 24.18.0, including mocked service browser checks, smoke with/without JS and focused banking. All three full layout profiles passed: 14 states each, 42 total, zero script errors or failed states. CI targets Ubuntu and Node 22; a local result alone does not establish that runner result or its speed. The audit covers a fixture/real frontend and SDK, not a deployed database or storage policy.
- Updated quick reef audit passed locally: 91 colonies, 16 procedural reef families, six encounters, schools and three frame rates, zero findings. All original geometry and bank limits remain.
- The three legacy Node failures above were observed, not assumed. Other historical/manual scripts were inspected, not all executed.
- Real touch hardware, Safari/WebKit, real network performance, Data Saver end-to-end, live database/RLS, and a full standard-quality release audit are not established by this PR's Chromium CI. Keep those claims separate.
- Branch protection configuration is not changed here. Build/unit and browser checks keep their names; layout now has three matrix names. If layout is required in repository settings, update its required names deliberately.

Before accepting a test change, name the visitor-visible contract, show the old code failing (or damage the built output as a negative control), then run the final code against the same assertion. New product requirements can change a contract, but the requirement and rationale must be recorded separately from the failing test. Never skip a state, silently drop a project, add a broad exception or raise a tolerance just to obtain green.
