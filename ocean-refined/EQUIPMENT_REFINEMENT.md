# Equipment and surface refinements

- The red dive propulsion vehicle is built locally from 1,380 triangles, three merged static material batches and one propeller mesh. It uses no textures or shadows. Holding the existing scooter control raises it smoothly into the lower first-person view. Reading the wrist lowers it further; third person attaches the same model to the diver instead of duplicating geometry.
- `createDiveScooter(camera, diver)` returns `root`, `update`, `diagnostics` and `destroy`. Call `update(dt, { active: nav.scooter, allowed, firstPerson, reducedMotion, wristOpen })`. `allowed` should exclude the surface, camera transitions and interface dialogs. The root is reparented between camera and diver when the perspective changes.
- The physical wrist uses the same cyan/white/amber palette, Outfit labels, monospaced readings, corner brackets and ruled glass as the dive HUD. The face and framing are larger, while the ocean stays visible behind it. Canvas uploads remain signature-cached and capped at five per second.
- Desktop conditions and return summary occupy a left rail. The hero sits near the centre of the surface composition. On short screens and phones the return summary temporarily replaces the conditions strip to avoid overlap.

## Checks

JavaScript syntax passed for both equipment modules. A Three.js geometry/state check verified finite transforms, first-person/third-person attachment, visibility during boost, immediate reduced-motion hiding on surface, four meshes and 1,380 triangles. Parent end-to-end review covers in-scene wrist/scooter appearance and responsive layout.

Focused Chrome/Playwright visual review also passed with no page errors at 1440×900 and no horizontal overflow at 390×844. Captures under `../qa/refinement-captures/` show the first-person scooter, raised wrist, third-person attachment, left surface rail and mobile return summary. The mobile hero was centred after review, and the third-person scooter moved forward between the bent hands. A persisted journey toast after synthetic fast ascent can overlap the mobile summary; the journey owner was notified to clear that toast on surfacing.
