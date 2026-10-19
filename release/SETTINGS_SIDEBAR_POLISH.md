# Settings sidebar spacing and quick surface return

Branch: `codex/settings-sidebar-polish`

- Grouped Lighting, Time of day, Weather and Sound with consistent heading, control, helper-text and divider spacing.
- Replaced tall stacked time/weather preset tiles with compact icon-and-label buttons: 36 px desktop height, 44 px phone touch targets. Existing slider, lock, brightness, mute and preference wiring is retained.
- Added an underwater-only “Surface now” button at the top right of the expanded General folder. It closes settings, cancels travel/guided movement and returns directly to the above-water hero. The existing ascent control continues to animate normally.
- The direct return clears held swim input, motion, pointer capture and wrist view; surface depth reads 0 m independently of the diver's wave bobbing.

Verification passed:

- `node tools/test-settings-sidebar.mjs`: desktop/phone preset sizing, label fit, section separation, no horizontal overflow, underwater-only placement, immediate return from deep water, camera above the surface, stationary diver, focus restoration and another dive.
- `node tools/test-settings-menu.mjs`: existing desktop/phone brightness sync, weather slider/cycle, sound controls, defaults, suspension, Escape/focus and overflow.
- `node tools/test-control-refinement.mjs`: normal staged camera, safety-stop rating/export, phone panel, resumed ascent and waterline splash.
- `npm run test:build`: generated portfolio pages/links and model/cache integrity.

Local built preview: http://127.0.0.1:4210/dist/

This is a local review checkpoint, not a production deployment.
