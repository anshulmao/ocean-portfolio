# Ocean world expansion plan

Implementation is now in the local scene. This document retains the intended behavior; README.md and QA reports describe the delivered controls and verification. Exact portfolio content and a replacement diver remain separate work.

## Delivered locally

- Captured crosshair, Esc release, centered diver view and independent free camera with separate collision tuning; touch movement works in both exploration modes.
- Actual-position ascent, automatic surfacing, cave exit route and fixed surface framing.
- Shallow entry garden, deeper terraces/drop-offs, cave/arch geometry, local illumination and less repetitive water underside shading.
- Nine uploaded GLBs, animated reef fish, school scatter/regroup, procedural sharks/mantas and an occasional whale shark.
- Anchor/wreck/treasure approaches, nearby F/touch interactions, opening chest and creator credits.
- Journey, asset, terrain and ecology checks are recorded under `qa/captures` and `newqa`. Physical-device GPU performance remains unmeasured.

## Direction

Preserve the calm ocean, accurate day/night sky and browser-only delivery. Turn the underwater scene into a bounded, varied place that rewards exploration, with clear controls, recognizable portfolio landmarks and occasional large marine encounters.

## Confirmed decisions and remaining scope

1. Free cam is an independent camera; the diver stays where he was left.
2. Deep water has more local illumination from glowing coral, cave lights and the diver's torch, with darker water between lights.
3. Landmark content: the exact About, Experience and Projects interaction contents will be designed separately, as requested.

## 1. Control modes and cursor

Treat camera perspective and mouse capture as separate settings.

| Mode | Camera and movement | Cursor and interface |
| --- | --- | --- |
| Surface | Fixed landing composition; diver floats; mouse does not steer | Visible pointer; normal page controls |
| Diver exploration | Centered chase camera, with first-person available; WASD swim, Space rises, Shift descends | Captured mouse; small central crosshair |
| Free cam | Independent camera; the diver remains stationary and the camera explores within the world bounds | Same captured mouse and crosshair; clear Free cam indicator |
| Interface | Preserve the exploration pose and stop movement; ocean life can continue | Esc releases the pointer; settings, atlas and content become usable |
| Transition | Controlled dive/ascent camera and character animation; clear held inputs | Crosshair hidden; pointer released on reaching the surface |

- Camera toggle: V, plus an interface button. Switching back to the diver blends smoothly to the diver's current position.
- Interaction key: F, with a nearby prompt and a touch equivalent. It does not conflict with Space/Shift depth controls.
- Default underwater mouse capture starts from an explicit click. Browser pointer lock must be requested from a user gesture; an asynchronous dive animation cannot silently acquire it later. If needed, show a small Click to swim prompt after the transition.
- Esc always releases capture. Re-entering requires a scene click; the page must not repeatedly recapture the cursor.
- Entering settings/content, losing focus or hiding the tab clears held movement inputs. Surfacing disables free cam and mouse steering.
- The tuning panel keeps separate diver and free-camera speeds, acceleration, damping and collision choices. First-person remains a perspective, distinct from an independent camera.

## 2. Automatic and requested surfacing

Two triggers use the same ascent system:

- Manual ascent: when Space takes the swimmer through the upper swimming threshold, begin the final ascent automatically instead of clamping depth indefinitely.
- Back to the surface: ascend from the swimmer's actual position and depth, including from deep zones.

Ascent behavior:

1. Stop ordinary movement and clear inputs; preserve current world position.
2. If beneath a cave ceiling or wreck, follow its authored exit route before ascending. Check the route against solids; never pass through ceilings or coral.
3. Animate the diver floating/swimming upward, with bubbles and a camera that follows the ascent. Use a eased ascent speed, faster for long returns, and a gentle slowdown near the surface.
4. Show real progress through depth remaining or an ascending depth-gauge marker. This represents travel, rather than asset loading.
5. Blend water/fog/lighting continuously as the camera crosses the surface. Settle the diver into a floating pose and restore the fixed landing composition.

Proposed tuning: ascent speed, maximum return duration, near-surface slowdown, trigger depth and camera blend. Final timings should be judged in the browser at shallow and deep starting points.

Surface and underwater use the same world position during the transition. Returning must not jump the swimmer back to the original reef coordinate. The surface presentation can frame the diver locally against the distant horizon, while retaining the last location for the next dive.

## 3. Terrain, depth and water appearance

The implemented navigation region is 124 by 140 metres, with terrain extending from a 13m initial garden to a basin approaching 65m. The seabed is a height field, so it cannot represent overlapping floors/ceilings by itself.

Proposed progression, with depths provisional:

- Shallow gardens, about 5–15m: bright sandy openings, dense coral patches, the About anchor and smaller fish.
- Reef slopes, about 15–30m: uneven terraces, gullies, rock pinnacles and arches; the Experience wreck.
- Deeper ledges, about 30–60m: cliffs, cave entrances and a treasure area, with open water for large animal silhouettes.

Retain a bounded playable region, with visible scenery continuing beyond its edge. Use natural contours and open-water sightlines instead of a flat visual wall. Separate 3D meshes provide caves, overhangs and arches. Their collision proxies must describe columns, roofs and solid rock individually so openings remain passable. Cameras also need obstacle avoidance.

Water underside work:

- Keep the existing calm surface appearance as the starting point.
- Break up the repeated parallel bands using multiple wave scales/directions, spatial variation and less repetitive normal detail.
- Rework the underwater underside shading specifically: softer highlights, less continuous striping and a more varied view through the moving surface.
- Keep CPU water height and GPU displacement consistent wherever they affect floating bodies or transitions.
- Vary caustics, light shafts, absorption and visibility by depth and location. Add local glowing coral, cave lights and a diver torch while keeping water darker between illuminated areas.

## 4. Reef ecology and large visitors

- More coral silhouettes and arrangements: fans, branching colonies, plates, brain coral, sponges, anemones and scattered rubble, grouped into distinct habitats with open swimming corridors.
- More small fish body types and species, with different school sizes, routes and swimming speeds.
- School disturbance: a nearby approaching diver triggers a short, smooth scatter; fish flee around the swimmer, then gradually regroup after the threat passes. Use an anticipation radius and cooldown to avoid constant jitter.
- One or two calm reef sharks travel along deeper perimeter routes.
- Manta rays glide through open corridors, banking and moving their wings with their path.
- A whale shark is an occasional encounter, arriving and leaving beyond visible fog rather than appearing/disappearing in view.
- Large animals use designed routes and lightweight avoidance rather than joining the full schooling simulation. Encounters remain peaceful, with no chase/combat behavior.

Use controlled active counts and re-use geometry/materials. Support reduced motion and economy quality; avoid increasing every fish or light count globally.

## 5. Portfolio landmarks and interaction

| Section | Landmark | Initial behavior |
| --- | --- | --- |
| About | Fallen 3D anchor embedded in the reef | Nearby label and F interaction prompt |
| Experience | Sunken ship with a recognizable silhouette | Nearby prompt at a clear approach point |
| Projects | Partly buried treasure chests | Restrained glow as the diver approaches; F prompt |

Each landmark needs a navigable approach, a proximity trigger, a line-of-sight check, a visible interaction prompt and a touch interaction button. Focus the closest eligible target; decorative objects should not compete for interaction.

Opening an interaction releases mouse capture and presents a readable content panel. Closing it returns to the same location and camera mode; a scene click resumes capture. The precise content and any chest/ship animations remain a later design decision. In independent free cam, portfolio interactions should require the diver to be nearby, so exploration does not bypass the physical journey.

## 6. Uploaded assets

Useful handoff format: GLB/glTF with included textures; Blender files are useful for editing. For each model, include a preview, source/license and intended role. Priorities:

1. Diver with a usable swimming rig/animation, plus optional idle/float.
2. Coral/rock packs with several reusable shapes, and cave/arch pieces.
3. Small fish, reef sharks, whale shark and manta rays; preferably with swim animations.
4. Anchor, shipwreck and treasure chests.

Inspect each upload for scale, orientation, animation quality, mesh/material counts and texture size. Optimize copies for browser delivery while preserving source assets. Use instancing for repeated coral/fish and simpler collision shapes for solids. Assign loading and rendering budgets after inspecting the actual models; do not commit to using every asset unchanged.

## 7. Build order and acceptance

1. Control state machine: captured crosshair, Esc/interface mode, camera toggle and fixed surface view. Verify pointer lock, focus loss, touch and camera switching.
2. Ascent system: automatic near-surface exit and visible returns from actual depth. Verify no coordinate reset, duplicate trigger, roof penetration or abrupt camera snap.
3. Terrain and underside water: deepen the navigable area, vary contours, add caves/arches and remove repeated underwater striping. Verify playable openings, clear sightlines, collisions and depth lighting.
4. Ecology: improve school scattering and add large visitors. Verify smooth regrouping, calm paths, no visible spawning and bounded simulation cost.
5. Landmarks: place anchor, wreck and treasure; implement approach prompts and generic interaction panels. Define each section's content separately.
6. Asset integration and polish: replace suitable placeholders with optimized uploads, refine animation, then verify both themes, reduced motion, desktop/mobile layouts and target-device performance.

Keep asset integration available throughout these phases as uploads arrive. Controls and ascent should be tested before scene detail makes problems harder to diagnose. Browser verification must cover the complete surface → dive → explore → interact → ascend → surface journey.
