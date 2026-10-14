# Review and customize the ocean

## Three separate workspaces

- `/ocean-refined/ui-gallery.html`: interface only, with no 3D renderer. Pick map, computer, heading/depth, time selector, archive or scene controls. About/Experience/Projects/Resume remain available inside the archive. HTML fragments are in `ui-components/`.
- `/ocean-refined/pack-viewer.html`: isolated model studio. Choose the original pack or a separated rigged creature. Orbit, pan, zoom, pause the swim clip and download its GLB.
- `/ocean-refined/world-viewer.html`: the actual scene with an independent orbit camera. Drag to orbit, right-drag to pan and scroll to zoom. Choose surface/reef/deep/overview, scrub time, boost brightness and hide layers. The visitor experience remains at `/ocean-refined/`.

## Placement edits

Select a landmark, change X/Y/Z, use Focus to frame it, Ground to rest its bounds on the seabed and Reset to restore its original placement. Save layout downloads JSON. These are local preview edits, not changes to source or collision proxies; send the JSON back to apply and revalidate them in the visitor experience.

## Blender workflow

Download an animal GLB from the model studio. In Blender, choose File → Import → glTF 2.0 and select it. Edit the mesh, materials, six-joint swimming rig or animation, then export glTF 2.0 as GLB with the skin and animation included. Preserve the +Z forward orientation and the normalized base size; world scale is applied by `creature-pack.js`.

Export reef GLB in the world viewer downloads an editing snapshot with the terrain, coral/landmark geometry and authored visitors. It is a geometry snapshot, not a packaged game: custom water/sky shaders, live currents, boid movement, UI and collisions remain browser code. Use the separate creature GLBs for their editable swimming clips. Significant mesh or terrain changes require corresponding placement and collision updates in the app.

## Where changes live

- Interface palette/layout: `ocean-ui.css` and `dive-hud.css`.
- Portfolio content: `portfolio-content.js`; entry layouts: `landmark-interactions.js`.
- Terrain/reef formations: `reef.js`; imported objects: `model-scene.js`.
- Creature size/routes: `creature-pack.js`; extraction and rig recipe: `tools/prepare-creatures.js`.
- Newly supplied Sets assets: `user-creatures.js`, `user-creature-routes.js`, `user-corals.js`. These GLBs are already in metres; retain native scale instead of applying the older normalized creature convention. Every new creature/coral is selectable in Model Studio.
- Swimming and camera settings: the existing Scene controls panel and `movement-settings.js`.
- Scooter/wrist geometry: `scooter.js` and `wrist-computer.js`; safety feedback, artifacts and photos: `expedition-interactions.js` and its stylesheet. These visitor-only overlays are independent of the world viewer.
- Viewer layers now include Living reef and Reef formations. Their visibility changes are preview-only. Exported geometry still cannot preserve shaders, procedural animation, feedback UI or game logic.

Source and adapted creature attribution is in `assets/models/creatures/CREDITS.md`. Both newly supplied packs contain CC BY-SA 4.0 metadata; separated/rigged adaptations retain that licence.

References: https://www.blender.org/features/pipeline/ and https://threejs.org/docs/pages/GLTFExporter.html
