# Guided reef dive

Implemented against `origin/main` at `4145905`, using the user's guided-dive brief and raw transcript. Those reference files and voice notes are unchanged.

## Experience

“Show me around” clears the surface copy, pauses for one second while bringing the diver toward the centre of the frame, then uses the existing descent in first person. Reduced motion omits the extra camera movement and fades between viewpoints.

The guide controls movement. Mouse, touch drag, arrow keys and the gamepad's look stick control the view independently. A gentle automatic view cue leads until the first deliberate look; after that, the visitor keeps their view across legs, pauses and reading dialogs. Swimming keys or the movement stick hand over to free exploration; G / Rejoin returns to the interrupted stage without selecting a later, nearer destination.

Welcome, About, Experience and Projects wait for Continue. Scenic viewpoints hold for three seconds, with Pause available to stay longer. The three portfolio sites give short orientation copy. About opens the existing at-a-glance portfolio automatically; every site offers reading, and the reading footer has “Continue guided dive”. N closes that reading panel and continues. Escape closes reading without advancing.

## Route decisions

All positions below are geometry coordinates, not the calibrated depth readings shown to visitors. The route planner and swimmer retain terrain and solid-object collision checks.

| Stage | Placement / route |
| --- | --- |
| Welcome | `[0, -8, -4]`, looking into the reef |
| About | Loaded Anchor interaction viewpoint, with fallback to its charted pad |
| Pillar Coral Cathedral | Past the nurse shark's sand near `[-21, -24]`, across the shallow reef to `[40, -20, -30]` |
| Soft Coral Spire / bait ball | Descend along the right side, through the ball near `[48, -31, -67]`, then `[42, -31, -73]` |
| Experience | Turn back toward the loaded wreck's safe interaction viewpoint |
| Below the wreck | `[−2, −36, −63]`, with an upward view cue toward the reef |
| Projects | Loaded treasure interaction viewpoint |
| Overview | Rise along the left edge to `[−43, −16, −56]`, looking across the reef |

The semicircular formation is the **Pillar Coral Cathedral**, whose columns form a horseshoe at `[48, floor, -28]`. The deeper tower is interpreted as the **Soft Coral Spire** near `[50, floor, -72]`, beside the bait ball. The separately named Table Coral Tower is shallower at `[38, floor, -8]`; going there after the cathedral would reverse the requested descent. Landmark arrivals use model positions after loading rather than assuming that a chart coordinate is a safe reading position.

Cruise speed is 3.6 world metres per second. The procedural reef and solid-formation integration test measures about 112 seconds of swimming, excluding entry, scenic holds and unlimited reading. The loaded-model desktop browser run measured 120 seconds, including its manual takeover and rejoin. The planner still reports three portfolio sites separately from the eight route stages.

## Controls and wildlife

The progressive desktop hints use the current mappings: C computer, F interaction, V view, H local photo, Q light, E scooter boost, N continue, P pause, G rejoin. Touch copy refers to drag, the guide buttons, lamp/scooter controls, and the existing Settings computer and View actions. No nonexistent touch camera or photo button is advertised.

The wildlife cue samples animals actually present in the prepared creature scene. It highlights a nearby whale shark, whale, reef shark or orca for up to ten seconds, with a cooldown. Its arrow updates with the camera, including correct bearings behind the visitor. It disappears when an animal leaves or moves out of range; missing or failed wildlife never affects tour progression. Animal sampling is limited to five times per second while camera bearings remain responsive.

## Ending and recovery

Overview offers Keep exploring and Surface. Exploration releases movement at the current position. Surface uses the existing collision-routed ascent, ten-second optional safety-stop invitation and 45-second stop. Visitors can skip the invitation, skip an accepted stop, or complete it without sending feedback.

Pause holds travel and resumes the remaining scenic path. Opening Settings or a reading panel suspends travel. A blocked route stays paused with Resume, Skip travel and Exit tour available. Only an explicit skip or reduced motion places the visitor through a fade; full-motion navigation never uses a timed teleport.

## Verification

- `npm run test:unit`: includes the production tour/swimmer at 30, 60 and 120 Hz against reef and formation collisions, movement bounds, reading holds, pause/resume, takeover, blocked routes, skip/reduced motion, frame-by-frame mouse/touch/arrow free-look comparisons and wildlife bearings.
- `npm run build`, `npm run test:build`, `npm run test:services`, `npm run smoke`: the repository's build, service and page checks.
- `npm run test:guided:browser` after a build: loaded world and model route, free look, pause, takeover/rejoin, automatic at-a-glance reading, button/N continuation, live wildlife cue, desktop/mobile layouts, exit, exploration, ascent, skipped invitation and completed optional safety stop. Uses the repository's `PLAYWRIGHT_CHANNEL` / `PLAYWRIGHT_CHROMIUM_PATH` overrides when needed. Captures and the run report go to the ignored `ocean-refined/qa/captures/` directory.

Touch verification uses an emulated browser. Physical-device performance remains unmeasured.
