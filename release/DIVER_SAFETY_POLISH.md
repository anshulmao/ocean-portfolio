# Diver and safety-stop refinement

## Plan and ownership

1. Sol, high reasoning: trace the first-dive camera handoff and verify identical aiming before/after the cinematic settles.
2. Sol, high reasoning: rebuild the articulated procedural diver and validate swimming, hovering, surfacing, wrist-check and safety-stop poses.
3. Luna, medium reasoning: replace shark teeth with accessible five-star ratings in the existing ocean palette.
4. Parent: integrate a 45-second countdown, completion animation, model controller, responsive UI and regression tests.

## Behavior

- Swimming input and responsive camera aim now start together. Earlier descent, ascent and safety-stop framing keep their cinematic movement.
- The diver keeps the navy/aqua/cream/gold style, with continuous limb profiles, overlapping joints, articulated wrists/ankles and fins extending from the toes. A shared animation controller adds breathing, idle sway, hip-led opposed kicks, ankle follow-through and wrist checking.
- Near 5 displayed metres, F2 or the stop button starts a 45-second stop. The timer replaces the heading tape. Completion shows “Safety stop” with a drawn checkmark, then settles to “Complete”. Typed feedback stays in place until the visitor closes, skips or exports it.
- Closing/skipping before completion cancels the countdown. Reopening starts a fresh stop. Hidden-tab time does not silently finish it. Rating/contact export remains a local-only JSON download with explicit contact opt-in.
- Reduced motion removes idle movement and tick drawing while retaining timer information and the completion state.

## Verification

- `tools/test-dive-handoff.mjs`: same 100 px gesture commands 0.240 rad at initial handoff and settled swimming. Old camera response was 0.090 rad in 150 ms; new response is approximately 0.244 rad, versus 0.241 rad settled. Original behavior fails the same regression.
- `ocean-refined/newqa/diver-rig.mjs`: finite geometry/transforms, toe-aligned fins, joint limits, wrist screen sightline, opposed strokes, pause/reduced motion and frame-rate independence. Rig budget: 24 meshes, 30,040 triangles, no textures.
- `ocean-refined/newqa/safety-stop-clock.mjs`: exactly 45 seconds including fractional steps, single completion, cancellation, restart and invalid ticks.
- `ocean-refined/test-expedition-interactions.mjs`: accessible star selection, countdown completion, feedback retention, opt-in JSON export, exit/restore and portrait layout.
- `tools/test-control-refinement.mjs`: actual scene desktop/portrait staging, first-person restoration, stop during ascent and resumed surfacing, waterline cues and no browser errors.
- Production build and asset/cache checks retain the 27-species and coral guards. No new model downloads or textures are introduced by this pass.

Local preview: http://127.0.0.1:4210/ocean-refined/

This pass is for local review; production has not been updated. Mobile browser viewport checks are not physical-phone acceptance tests.
