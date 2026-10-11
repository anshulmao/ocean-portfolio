# Ocean refinement

Browser-only Three.js scene; no build step or backend. Original `/ocean/` is preserved. The refinement runs at [the local preview](http://127.0.0.1:4175/ocean-refined/).

Serve from `portfolio/site` using `python ocean-refined/qa/serve.py`. The server binds to localhost on port 4175. See `REFINEMENT_PLAN.md` for scope and the checkpoint path.

## Controls

At the surface, click the ocean or **Look around** to capture the mouse; use the mouse or arrow keys to view the sky and horizon. Touch users can drag or use the look buttons. Escape releases the pointer. Surface looking does not translate the swimmer.

- Dive in captures the mouse and transitions into first person.
- WASD swims; mouse aims; Space rises; Shift descends.
- V switches first person / attached third person. Escape releases the pointer; click the scene to resume.
- Atlas buttons start an automatic journey and frame the landmark on arrival. WASD or aiming takes over.
- Back to the surface shows the swimmer ascending from the actual location. Space near the surface also triggers ascent.
- F or the nearby prompt opens the landmark panel. Portfolio content remains a placeholder.
- Movement provides live settings with local persistence, reset and JSON export.
- Touch uses drag-to-look and held movement buttons. Reduced motion pauses ambient animation, while navigation remains available.

## Scene

The bounded swim area is 124 by 140 metres, with scenery beyond it and shelves descending to roughly 60m. The cave has a collision-tested exit and ascent route. Terrain is smoothly shaded with procedural sand detail. Coral includes branches, plates, lacy fans, brains, barrels, boulders, sponges, anemones and seagrass.

Five supplied coral arrangements appear in fifteen habitats using shared instanced geometry/materials. Anchor, wreck and chests retain their interaction points. Eight GLBs load lazily with two concurrent requests. Embedded animated coral fish remain hidden. The supplied whale shark loads separately and follows a slow, upright route with calibrated head-forward orientation. Large procedural shark/manta visitors are no longer rendered.

Twenty-five schools contain 275 shaped, patterned fish (150 in economy mode), distributed across shallow, middle and deep reef areas. Steering uses school-local neighbours, anticipatory swimmer avoidance, splitting and regrouping, and seabed clearance with bounded simulation substeps. Twelve articulated gulls (seven in economy mode) alternate flapping and gliding. The existing articulated diver remains procedural.

The real-date Kuala Lumpur sky, current lunar phase and star catalogue are preserved. A full day takes 20 active minutes. Water uses analytic swells and a single rough-surface solar/lunar highlight. Deeper water remains darker between local lights and the diver torch.

## Performance and validation

Repeated coral/fish geometry is batched; fine coral detail uses colony collision volumes. Mobile starts with lower detail and a 30fps target. Framebuffer resolution is bounded, hidden tabs stop rendering and paused scenes stop idle frames. Targets are not measured device guarantees.

Current checks:

```powershell
node portfolio/site/ocean-refined/newqa/navigation-refined.mjs
node portfolio/site/ocean-refined/newqa/terrain-v2.mjs
node portfolio/site/ocean-refined/newqa/journey-refined.mjs
node portfolio/site/ocean-refined/newqa/dawn-refined.mjs
node portfolio/site/ocean-refined/newqa/distributed-ecology.mjs
node portfolio/site/ocean-refined/newqa/large-marine.mjs
node portfolio/site/ocean-refined/newqa/expanded-ecology.mjs
```

Browser checks use local Chrome with software WebGL. Screenshots and reports live in `qa/captures`. Physical phone performance remains unmeasured. Copied older QA scripts document previous versions and should not be used as current acceptance checks.

Main modules: `world.js` (rendering/transitions), `exploration.js` (controls), `reef.js` (terrain/coral), `marine-life.js` (schools), `seabirds.js`, `model-scene.js` (uploaded assets), `shaders.js`, and `sky-system.js`. `ASSETS.md` and `assets/models/CREDITS.md` retain asset provenance. Blender is optional; no Blender installation or new rigged diver was used in this pass.

### Life, lighting and scenery additions

Open **Scene controls → Lighting → Increase brightness** to brighten the underwater scene (0–100%). The setting is saved locally. Sun/moon altitude and lunar illumination influence underwater light, shafts and sand caustics; depth still darkens water.

`underwater-life.js` adds turtles, jellyfish, starfish and urchins using fourteen instanced batches. `distant-scenery.js` adds four islands and two ships in ten meshes. Imported landmarks and coral now use terrain-sampled final grounding; atlas arrivals and labels derive from their final bounds. All fifteen coral habitats are visible.

### Expanded ecology

Standard detail now includes 90 coral colonies, 948 meadow tufts and 414 ground-cover patches, plus the fifteen imported coral habitats. Resident life includes five turtles, twenty jellyfish, forty starfish and forty urchins. Economy detail reduces those populations and geometry. Ground-cover plates use simplified shared geometry. Islands are 40% farther from the central area; ships retain their positions.

### Portfolio instruments

Underwater, the Dive Computer is visible in both camera perspectives. C toggles it, with visibility saved locally. It reports player depth, active dive time, location and simulated air (one percentage point per 24 seconds, with a 25% floor; no gameplay effect). Time resets on a new dive and pauses when the page is hidden or an interface panel is open.

F near a landmark opens Dive Explorer and suspends swimming while releasing the mouse. The archive contains About, Experience and Projects with selectable entries, public-safe existing copy and concise/story/technical draft introductions. Escape or Return to the reef closes it; click the ocean to resume aiming. Selecting a draft is a review preference, not approval. See COPY_REVIEW.md.

HUD check: `node portfolio/site/ocean-refined/newqa/dive-hud.mjs`.
