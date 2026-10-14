# Returned ocean refinement — 13 October 2026

This pass edits only the isolated review kit. The received return and the main portfolio are preserved. No Git push or deployment was performed.

## Completed

- Neutral underwater brightness acts on model illumination; exposure remains 1.15 and water absorption remains depth-based. Flashlight range is 65 m with a narrower beam.
- A red scooter appears in first person and attaches to the diver in third person. The wrist computer uses the white/cyan instrument style.
- Surface hero is centered; summary and pre-dive information use the left rail. Mobile summary replaces the check. Underwater welcome messages dismiss when surfacing.
- Low polygon cloud impostors are removed. Sky clouds/weather remain. The moon's unlit side blends with atmospheric sky instead of drawing a black disc; real lunar phase remains in use.
- Full quality has 490 fish in 49 habitats and 30 crabs; economy has 245 fish and 18 crabs. Fish remain five instanced draw calls. Added outer reef patches, deeper luminous growth, smoother bait-ball reactions and slower predator passes.
- Fin whale is 18 m, orca 8.5 m, whale shark 16 m. Continuous mammal/shark swimming deformation and slower authored clips improve movement without changing the supplied GLBs.
- F2 safety-stop feedback is a local-only demo with explicit optional contact consent and JSON export. Closing restores ascent/swimming. F collects terrain-grounded artifacts; H downloads a first-person world photo without the HUD.
- World viewer exposes living reef and formation layers in addition to existing layers.

## Verification

Actual Chrome/software WebGL checks covered model loading, animation/course alignment, shaders, desktop/mobile equipment, free-swim and ascent safety holds, local feedback export, pickup/score and nonblank 1440×900 photo download. No page errors in these checks. Brightness diagnostics verified constant exposure and neutral fill; flashlight range and cloud removal verified.

Repeatable scripts and reports live at the kit root: `marine-refinement-check.mjs`, `marine-browser-check.mjs`, `equipment-visual-qa.mjs`, `lighting-check.mjs`. Interaction scripts/reports live in this directory: `test-expedition-interactions.mjs`, `test-expedition-world.mjs`, `expedition-world-qa.json`. Captures are in the kit's `qa/refinement-captures/` and adjacent to the interaction report.

These checks verify behavior and rendering correctness, not physical-device FPS. Adaptive quality, instancing, spatial culling and existing pacing remain active. Simplified procedural diver/ray rigs remain a visual limitation; richer source assets can improve anatomy later. Feedback/inventory are session-only; photos and JSON persist only when downloaded. Portfolio biography/captions remain subject to owner approval.

Final studio checks passed on port 4190: planner start-at-site arrival, manual takeover/rejoin of the guided tour, UI-only gallery, and hide/show of Living reef and Reef formations in the orbit viewer. The actual 19:30 Kuala Lumpur sky showed the 8.24%-illuminated crescent above the horizon without a black-disc artifact. Evidence: `studio-flow-report.json` and `qa/refinement-captures/moon-actual-sky.png` at the kit root. All 51 top-level runtime JavaScript files passed syntax checks. Full/economy marine simulation and interaction regression checks passed.

## Surface and roaming follow-up

- Surface arrow controls have their own lane; mouse capture hides the hero immediately, without its older-position transition. Tested four desktop/phone/landscape sizes with no overlap or horizontal overflow.
- Islands and ships now haze into the actual directional sky texture before tone mapping instead of fixed cyan fog. Night/dusk capture verified dark silhouettes with no cyan glow.
- Ascent camera reveals the side view over 1.6 seconds, blends into the surface composition over the final 8 m, and retains its gentle spring for 2 seconds after landing. Vertical movement slows progressively near the surface. Frame sampling verified decreasing camera movement through the final handoff rather than a velocity jump.
- Largest animals have distinct deep routes: fin whale 41.5–44.5 m, orca 25.8–28.2 m, whale shark 33.7–36.3 m. Their routes span 74–86 m horizontally. Rays/hammerhead and fish schools roam more widely and moderately faster; existing culling/batching remains intact. Twenty-minute terrain sampling and actual browser animation checks passed.

Evidence at kit root: `surface-layout-qa.mjs`, `surface-motion-report.json`, `marine-route-report.json`, and `qa/refinement-captures/island-directional-haze.png`.
