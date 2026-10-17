# Settings and reef navigation review

## Changes

- One settings drawer: General (time, weather, sound/volume), Controls (collapsible tuning groups), View, then the keymap. Removed Pause motion and floating time/sound controls. Higher-opacity ocean glass and hidden scene controls prevent overlap. Nested Escape and keyboard focus loops work within the drawer.
- All 57 values in the user-supplied movement JSON are the default profile and Reset target. Version 3 applies this baseline once; later visitor adjustments persist. Earlier storage records are retained separately.
- Start just before sunrise on the current Kuala Lumpur date, using the existing astronomical sky. Observed opening solar altitude: -0.957 degrees.
- Safety stop is available inclusively from 3 to 5 displayed metres; the 45-second timer and local-only feedback export are unchanged.
- Generated residents/schools and the legacy flock steer around terrain/obstacle contours instead of snapping vertically to terrain. Footprint clearance, capped climb/turn rates and local separation keep paths continuous.
- Morays stay anchored to their dens, ease out/retract without the root-shifting strike clip, account for model scale and reuse pose output.

## Review

An independent Sol review found two functional issues, both corrected and rechecked: a fish footprint beside a ledge could strand navigation, and closing one settings/dialog layer could unsuspend movement underneath another. The final review reported no remaining blockers. Keymap ordering was also corrected to place it last.

## Verification

- Exact JSON/default comparison, legacy baseline reset, visitor persistence and Reset: passed for all 57 settings.
- Real Chrome scene at 1440x900 and 390x844: menu contents/order, no overflow, nested Escape/focus restoration, combined menu/dialog suspension and startup sunrise passed; no page errors.
- Full dive/safety-stop/return-to-surface regression and local feedback export: passed.
- Fish tests: bounded vertical cliff detours at 30/60/120 Hz, gentle slopes, side ledges, overlap recovery, legacy flock and diver separation passed.
- Full scene wildlife: 27 species loaded; 89/89 observed swimmers moving after 20 simulated seconds. Climb <=0.3 times swim speed; yaw <=1.3 rad/s; minimum observed terrain cover clearance 0.515 m. Moray movement <=0.0106 m/frame at 60 Hz with zero heading drift; finite actor/instance transforms; no page errors.
- Production build and 27-species/coral cache guards: passed.

Tests are browser viewport and local simulation checks, not physical-phone or network performance certification. No additional models or textures were introduced. This change is reviewed for merge; manual production deployment is separate.
