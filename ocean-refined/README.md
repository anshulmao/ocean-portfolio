# Ocean refinement

Browser-only Three.js scene; no build step or backend. This is the isolated returned editing kit, including the 13 October refinement pass. The main portfolio repository remains separate. Run `python serve.py --port 4190` from the kit root and open [the local preview](http://127.0.0.1:4190/ocean-refined/).

The server binds to localhost. See `REFINEMENT_2026-10-13.md` for the latest scope and verification; older validation entries describe earlier checkpoints.

The subsequent user-created creature/coral pack is integrated; see `NEW_LIFE_SET.md` for the replacements, behaviors, editing files and checks. Model Studio includes all 37 new assets.

Ongoing tenfold objective and current evidence: `TENFOLD_OPTIMIZATION.md`. Prepared charts and imported coral have exact validated fast paths; these gains do not yet prove tenfold application-wide performance.

## Controls

At the surface, click the ocean or **Look around** to capture the mouse; use the mouse or arrow keys to view the sky and horizon. Touch users can drag or use the look buttons. Escape releases the pointer. Surface looking does not translate the swimmer.

- Dive in captures the mouse and transitions into first person.
- WASD swims; mouse aims; Space rises; Shift descends.
- V switches first person / attached third person. Escape releases the pointer; click the scene to resume.
- Atlas buttons start an automatic journey and frame the landmark on arrival. WASD or aiming takes over.
- Back to the surface shows the swimmer ascending from the actual location. Space near the surface also triggers ascent.
- F or the nearby prompt opens the landmark records. Away from a landmark, F collects a nearby artifact. Finds and score last for the current session.
- Hold E while swimming for the visible red scooter; Q toggles the longer-range flashlight.
- C raises the wrist computer; V switches perspective. Instrument air/pressure readings are simulated demo values.
- F2 at 3–6 m holds a safety stop, including during automatic ascent. Optional feedback/contact information exports to a local JSON file; nothing is sent to a server.
- H saves a world-only PNG in underwater first person. This does not include the HUD.
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

Underwater, the Dive Computer can be checked in both camera perspectives. C raises or lowers it; it starts closed on every dive. It reports player depth, active dive time, location and simulated air (one percentage point per 24 seconds, with a 25% floor; no gameplay effect). Time resets on a new dive and pauses when the page is hidden or an interface panel is open.

F near a landmark opens Dive Explorer and suspends swimming while releasing the mouse. The archive contains About, Experience and Projects with selectable entries, public-safe existing copy and concise/story/technical draft introductions. Escape or Return to the reef closes it; click the ocean to resume aiming. Selecting a draft is a review preference, not approval. See COPY_REVIEW.md.

HUD check: `node portfolio/site/ocean-refined/newqa/dive-hud.mjs`.

### Wrist instrument and field archive

The computer starts lowered on every dive. C or Check dive computer raises a 3D forearm/instrument in first person with a small downward glance; third person reveals an animated side display. It lowers on another toggle and is hidden during ascent and other interfaces. Narrow-screen framing keeps the instrument above swimming buttons. Canvas readings refresh at most 5 Hz. Reduced motion snaps instrument transitions without ambient sway.

Dive Explorer uses cyan, mint, amber and coral section signals, custom SVG icons, measured entrance/entry animation, and actual project images. Click images to open their full size. F still opens a nearby waypoint; Field archive also opens it underwater. Resume offers the existing July 2026 portfolio PDF with a preview, download and open action. Sage and Rae Engage captures use the linked live demos; see assets/portfolio/PROJECT_MEDIA.md. Demo credentials and existing health records are excluded from screenshots and presentation data.

Current checks: `newqa/immersive-hud.mjs` and `newqa/finish-immersive.mjs` (the older dive-hud entrypoint delegates to the immersive suite).

### Golden hours and expedition chapters

Choose Dawn, Day, Dusk or Night. Golden-hour presets follow this date's Kuala Lumpur sun; the accelerated cycle continues when motion is running. The compass arrow points to true north. Press Shift at the surface to dive; underwater Shift descends and Space rises.

The archive uses a mint profile, amber career timeline, project-specific showcases and a coral resume sleeve, with locally bundled GSAP choreography and reduced-motion support. Five additional grottos and map-wide current particles fill out the reef; wave refraction and turbulence are visible from below. Imported coral roots are independently grounded before batching. See VALIDATION.md for checks and ASSETS.md for motion-library attribution.

Focused checks: newqa/sky-chapters.mjs and newqa/reef-detail.mjs.

### Stylized overhaul

`ocean-look.js` gives every lit surface the same painted treatment: stepped shading, rim light, baked caustics and colour-absorbing water haze that matches the sky backdrop. Apply it to anything new with `stylizeTree(object)` or, for imported GLBs, `stylizeImported(object)`.

`set-pieces.js` dresses the anchor, wreck and chests with instanced props and a light beacon each. `journey.js` adds the three-lights quest: a waypoint chip, discovery toasts, depth chapter cards and atlas progress (kept for the browser session only).

Interface motion follows one identity: ease `cubic-bezier(.4,0,.2,1)`, durations 180 / 420 / 700 ms, entrances rise and settle, exits leave faster, ambient loops are sine based. The tokens are at the top of `journey.css`.

For checks when the tab is not painting, `oceanControls.step(seconds)` advances the simulation in fixed steps and renders once. See `../return/CHANGELOG.md` for the full list of changes.
