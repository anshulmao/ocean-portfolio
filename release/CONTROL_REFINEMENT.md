# Control refinement verification

Local branch: codex/control-refinement. Preview: http://127.0.0.1:4210/ocean-refined/

- Safety stop appears at 4-6 displayed metres. Camera stages an upright, wrist-checking diver left and rating panel right; portrait uses a bottom sheet. Rating reveals optional feedback/contact. Notes remain local JSON downloads; nothing is submitted to a server.
- Clear screen: U toggles, Escape restores; C accesses the computer. Touch water tap reveals temporary computer/restore controls. Camera/photo/finds remain available through settings or keys. Flashlight confirmation occurs once per on/off state per page session.
- Surface-interactive background reef/landmark preparation now runs on phones too, respecting Save-Data. First descent waits for landmark loading and preparation to settle; optional asset failures allow fallback.
- Transition-only waterline cue has no textures, render loop or scene captures; reduced motion uses a shorter opacity cue.

Passed checks:

- tools/test-control-refinement.mjs: real scene desktop 1440x900 and portrait 390x844, landmark prewarm, diver left framing, progressive rating/export, first-person restoration, ascent pause/resume, entry/exit splash, no page errors.
- tools/test-quiet-live.mjs and tools/test-quiet-ui.mjs: real scene plus focused interaction harness, clear/computer/restore, editable guards, touch recovery, no computer toggle overlap.
- ocean-refined/test-expedition-interactions.mjs: form, consent, local JSON, contextual stop range, photo/artifact hooks, portrait fit.
- ocean-refined/test-expedition-world.mjs: actual scene depth hold and resumed ascent, PNG photo export and terrain artifact pickup.
- ocean-refined/newqa/waterline-splash.mjs: crossing gate, idle, reduced motion and disposal.
- npm run build and npm run test:build: asset closure, stale exclusion and 27-species/coral cache guards.

Observed one local Chrome run: surface prewarm requested at 2.8 seconds, underwater build/prepare ready at 9.1 seconds, landmark preparation complete at 13.4 seconds after navigation. These are local observations, not cold-network or physical-phone benchmarks. Existing adaptive resolution, culling and frame-budgeted warmup remain in use. No new 3D assets or textures were added.

Not deployed in this pass. Mobile checks use a browser viewport; physical touch-device acceptance remains separate.
