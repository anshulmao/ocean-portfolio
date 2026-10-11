# Refinement validation — 11 October 2026

- Original scene: all 64 checkpoint files still match the preserved `/ocean/` copy.
- Navigation: five controller checks pass, including attached perspective, automatic atlas travel, landmark arrival focus/manual override, frame-rate consistency and cave-route ascent.
- Terrain: landmark floors, cave traversal/roof collision, safe ascent corridor and CPU/GPU water displacement checks pass.
- Browser journey: Dive captures the pointer; first person is default; V changes to attached third person; Projects travel arrives near (-12, -43.6, -82); side-view ascent visibly climbs; return settles at the surface. Eight active models load with zero failures.
- Desktop and 390×844 mobile browser checks: no page/console errors, no horizontal overflow.
- Sunrise: tested at 07:05 Kuala Lumpur (sun altitude 0.83 degrees). Corrected duplicate sun/moon disks in water reflection and horizon haze; screenshot confirms the vertical light column is gone.
- Static reef collision pieces: 381, versus 11,983 in the preserved scene. Imported coral retains additional proxies. Fifteen coral habitats use fifteen shared mesh batches with 45 instances.
- Browser journey render samples: 40–78 draw calls and approximately 318k–376k triangles depending on view. These are scene diagnostics, not physical-device frame-rate guarantees. Extra terrain detail increases geometry while batching and collision simplification reduce other costs.

Evidence: `qa/captures/journey.json`, `dawn.png`, `follow-diver.png`, `deep-projects.png`, `side-ascent.png`, `returned.png`, `mobile.png`.

Remaining asset direction: the procedural diver is retained. Large placeholder animals remain disabled; the supplied whale shark was restored in the expanded ecology pass below. A future consistent rigged diver, turtle and hero-animal asset pass can build on this version.
## Life, lighting and grounded checkpoints — completed 11 October 2026

- Added instanced turtles, jellyfish, starfish and urchins (3/7/16/10 in standard mode; 2/4/9/6 in economy).
- Added four distant islands, a sailing yacht and a coastal freighter.
- Surface sun/moon altitude now drives underwater light strength, light-shaft direction and animated seabed caustics; depth attenuates illumination.
- Scene controls opens to Lighting, with a persistent Increase brightness slider (0–100%). It boosts underwater exposure and ambient fill while preserving the sky cycle.
- Grounded the anchor, wreck, both chests and all fifteen imported coral habitats against transformed geometry and sampled terrain. Fixed six previously invisible coral habitats.
- Checkpoint labels follow final model bounds; terrain blocks hidden labels. Arrival positions frame each landmark from a clear approach.

New focused checks: `newqa/life-lighting.mjs`, `qa/grounded-landmarks.mjs`. Browser verification loaded all eight models, compiled shaders without errors, confirmed sun/night response and brightness changes. Geometry sampling verified terrain contact on all nineteen placements and clear approaches.

## Expanded ecology — completed 11 October 2026

- Standard: 275 fish in 25 schools; economy: 150 fish in the same 25 map-wide habitats. Coverage spans the shallow, middle and deep routes. Simulation checks pass for finite transforms, approach response and swimmer clearance in both quality modes.
- Standard habitats: 90 coral colonies, 948 meadow tufts and 414 ground-cover patches. Resident life: 5 turtles, 20 jellyfish, 40 starfish and 40 urchins. Simplified instanced carpet geometry offsets some of the additional density.
- Supplied whale shark restored with slow Swimming animation, upright route and skeleton-calibrated heading. The 20-second orientation check maintained a forward-heading dot product above 0.975.
- Twelve articulated gulls in standard mode, seven in economy; five shared draw calls. Islands moved 40% farther out.
- Navigation and terrain regression checks passed. Full desktop/mobile journey passed after the final fish placement adjustment: pointer capture, perspective switch, atlas travel, side ascent and return to surface; no browser errors or mobile horizontal overflow.
- Combined ecology browser check loaded all eight base models plus the whale shark, with no page or console errors. A sampled view reported 101 draw calls and approximately 1.38 million triangles. This supersedes earlier lighter-scene counts above; physical-device FPS is unmeasured.

Evidence: `newqa/distributed-ecology.mjs`, `newqa/large-marine.mjs`, `newqa/expanded-ecology.mjs`, and `newqa/journey-refined.mjs`; reports and screenshots in `qa/captures`, including `expanded-ecology.json`, `journey.json`, `whale-calibrated.png`, `expanded-coast.png` and `follow-diver.png`.

## Portfolio HUD — completed 11 October 2026

- Dive Computer is hidden at the surface and available underwater in both first and third person. C and the toggle control its persistent visibility. Depth is live; dive time resets each dive and excludes hidden-page/interface time. Air is an explicitly simulated, slow-decreasing ambient reading with no movement effect.
- Dive Explorer opens through the existing F/proximity interaction, releases pointer capture and suspends movement. Three sections contain nine public-safe entries. Existing copy and three draft section-introduction styles remain separate; selection persists but does not constitute approval.
- Desktop 1440x900 and mobile 390x844 browser checks passed: visibility, toggle, air decrease, perspective display, waypoint interaction, section/entry navigation, selected-entry state, draft selection, suspended movement, Escape/close and horizontal overflow. No page or console errors. Rendered desktop and mobile instrument/archive views inspected.
- Evidence: `newqa/dive-hud.mjs`, `qa/captures/dive-hud.json`, `dive-computer.png`, `dive-explorer.png`, `dive-computer-mobile.png`, `dive-explorer-mobile.png`.

## Wrist computer and richer field archive — completed 11 October 2026

- Computer starts closed for every dive. C or the toggle raises a physical forearm and instrument in first person, with a slight downward glance; third person uses the animated side panel. Raising/lowering supports reduced motion and resets at the surface. Screen texture updates at most five times per second.
- Four archive sections contain eleven entries, including separate Rae and Rae Engage projects. Icons, section colors, animated transitions, expandable project screenshots and a matching resume preview are present. New Rae Engage wording remains a draft for review.
- Sage and Rae Engage images were captured from the resume-linked live experiences. Demo credentials and private resume sources are excluded. Resume download is the existing July 2026 portfolio PDF.
- Desktop 1440x900 and mobile 390x844 checks passed for instrument visibility/animation, perspective switching, archive navigation, image loading, PDF response/download, surface reset, reduced motion, close/Escape and horizontal overflow. No browser errors. Mobile wrist screen bottom was 505px, above swimming controls at 620px.
- Evidence: newqa/immersive-hud.mjs, newqa/finish-immersive.mjs, qa/captures/immersive-hud.json, wrist-first-person.png, wrist-mobile.png, explorer-sage-v2.png, explorer-rae-v2.png and explorer-resume-v2.png. Software WebGL checks do not measure physical-device frame rate.

## Golden hours, expedition chapters and grounded reef — completed 11 October 2026

- Dawn/day/dusk/night presets; dawn and dusk solve the current Kuala Lumpur date's rising/setting sun at 2 degrees altitude. The automatic 20-minute full cycle, actual lunar phase and rotating catalog sky remain active. Golden horizons, violet twilight, warm clouds and matching water reflections share the atmosphere shader. Presets frame the sun at the surface when manual looking is inactive. Heading shows cardinal bearing and a rotating true-north arrow.
- Four distinct portfolio compositions: mint asymmetric profile, amber career timeline, violet project showcases with per-project signals, and coral document sleeve. Local GSAP stages headings, images and evidence; hover/press feedback and reduced-motion behavior are retained. Copy claims and review status are unchanged.
- Five additional open limestone grottos, fifteen arch ribs in one mesh batch, grounded buttresses, sea fans and glowing polyps. Corridors exclude scattered solid outcrops and have ascent exit routes. Sand texture is stronger; map-wide shader particles drift with currents. Surface underside includes wave-normal distortion, turbulent patches and a refracted sky window.
- Wreck normalization increased 14.5 to 20 m; whale shark 8 to 12 m with extended floor sampling; anchor reduced 4.8 to 3.6 m. Purple jellyfish; standard resident counts now 7 turtles / 30 jellyfish / 60 starfish / 54 urchins, economy 4 / 16 / 35 / 30. Both retain 14 resident-life batches.
- Imported habitats previously grounded as a whole could leave individual sculptures floating. All 63 rendered coral sculptures now ground independently by root vertices, embedded 6 cm into the local terrain before instancing. Landmark contact, centers and clear interaction approaches verified.
- Browser checks: all sky presets and solar altitude, Shift-to-dive, four archive sections, desktop/mobile overflow, wrist toggle/animation, resume PDF, screenshot media, landmark travel and safe return. No browser errors. Controller checks passed; five cave corridors are clear in both quality modes, and resident transforms remain finite across 200 seconds of simulated updates.
- Evidence: newqa/sky-chapters.mjs, newqa/reef-detail.mjs, newqa/immersive-hud.mjs, newqa/journey-refined.mjs and qa/grounded-landmarks.mjs. Reports/screenshots are in qa/captures. Current effects are visual animation; physical-device FPS remains unmeasured.


## CRT expedition interface — 12 October 2026

- Two imagegen concept boards saved before implementation in `portfolio/design/ocean-crt`, with exact prompts and a deployment plan. Generated board copy is illustrative; existing evidence-backed portfolio content is retained.
- Restored numeric heading/tick indicator with cardinal direction. Continuous keyboard-accessible local-time slider with moving sun/crescent icon; automatic 20-minute cycle and real astronomical sky preserved. Surface composition faces east for the eastern solar hemisphere and west for the western hemisphere.
- Camera position and quaternion ease during diving/returning, with bounded translation and rotation speeds. Final four metres of ascent blend into the original surface framing; surface always reports third person and releases the pointer, retaining underwater perspective preference.
- Left angled atlas uses depth pixels and 5 m contours sampled from the actual terrain function. Existing waypoint travel works; marker locations are refreshed from loaded landmark positions. Mobile remains collapsible. HUD and archive have phosphor casing, scanlines, restrained glow and monospace; no full-scene CRT filter or flicker.
- `newqa/crt-expedition.mjs` passed desktop and 390x844 mobile: slider, east/west solar signs, entering/returning, third-person surface, pointer release, terrain-source map, all four archive sections, reduced-motion and overflow. No page/console errors. Rendered surface, underwater, return, archive and mobile views inspected. Motion readings come from software-rendered browser checks, not physical-device FPS.
- Planned protected Vercel preview followed by runtime-only packaging, public-content review and production promotion. No deployment created.

- Existing `newqa/immersive-hud.mjs` also passed: wrist raise/lower, third-person panel, project media, resume PDF, immediate surface reset and mobile/reduced-motion archive navigation.


## Pale ocean interface and model studios — 12 October 2026

- Removed green CRT presentation from the active stylesheet. White/aqua readings, translucent ocean panels, rounded framing and proportional type restore the earlier ocean visual language. Bathymetry is pale blue with white contours; original section accent colors remain.
- Supplied Sea creatures and Magic ocean packs contain no skins or clips. Four realistic species and six separated fantasy assets now have six-joint weighted skins and gentle animation loops, exported as independent GLBs. Four realistic species plus two smaller fantasy rays produce seven visitors in full quality, four in economy mode, on slow map-wide routes. The large decorative reef carrier remains review-only. Source metadata identifies both packs as CC BY-SA 4.0; attribution and adaptation terms are preserved.
- UI-only collection reuses real markup and archive controllers without a renderer. Sixteen HTML fragments are available in `ui-components/`, with shared-style/controller notes. Model studio previews original packs and extracted rigs; downloads their GLBs. World studio uses an independent orbit camera with time/brightness controls, layers, landmark position/ground/reset, layout JSON download and portable reef geometry export.
- `newqa/creatures-studio.mjs` passed main scene creature load/finite transforms/forward heading, 16-component export, actual archive navigation, desktop and mobile overflow, world viewer, landmark edit/reset and layout JSON download. No page errors.
- `newqa/creature-rigs-export.mjs` passed all ten exported assets: six joints, one animation clip, finite vertex deformation. Geometry export generated a valid 44,734,328-byte GLB with 118 mesh definitions. This is a geometry snapshot; live sky/water shaders, UI, currents/flocking/collisions and separate animal animation clips remain browser systems/source assets. No Blender installation was used to validate an import. Physical-device FPS remains unmeasured.
- Studio workflow and file ownership: `STUDIO_GUIDE.md`. Browser captures and reports are in `qa/captures/`; development captures are excluded from the private source repository.

- Final `newqa/crt-expedition.mjs` regression passed after the creature additions: local-time solar hemispheres, smooth dive/return, surface third-person and pointer reset, terrain atlas, archive and desktop/mobile overflow, with no browser errors.
