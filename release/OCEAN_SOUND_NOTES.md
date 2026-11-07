# Rain and whale refinement

Implements the screenshot notes “Rain has to sound better” and “Better whale”.

## Deliberate choices

- Rain on open sea now combines a broad stereo spray with irregular wet impacts. The old four-second pitched-drop pattern is gone. The two new textures have unequal loop lengths (13.7 and 11.3 seconds), independent spray channels, a folded spray seam and wraparound impact tails. They are generated once after the visitor's gesture, in the existing deferred buffer queue.
- Shower drops remain distinct, while heavier rain builds a wider bed. Gain and filters use the existing glide, surface crossing and depth attenuation. Volume, mute, reading-page ducking, hidden-tab suspension and reduced-motion behavior retain their existing controls. No audio is downloaded before the existing sound activation path.
- The existing southern right whale keeps its model, scale, route, speed and clearance. It now alternates slow strokes with long glides, crossfading between its authored swim and idle clips over two seconds. Its nose follows the tangent of its slow vertical arc; roll is smaller. It continues forward during a glide.
- The visible right whale now uses the existing authored low upcall, moan and groan textures. Previously its calls were replaced by generic whale and humpback recordings. Those attributed recordings remain distant ocean ambience, unchanged. Call intervals are less insistent (10–22 seconds); normal distance, bearing, behind-camera filtering and underwater-only gating remain.

The interpretation of “Better whale” is calmer, coherent motion and a more appropriate voice, rather than replacing its existing model. This can be extended with a specific visual reference later.

## Verification

- `node --test tools/test-ocean-textures.mjs`: three tests pass. Clear weather is silent; gains remain finite and bounded through a weather ramp; generated stereo textures have finite samples, headroom and separate durations; the whale's pitch matches its vertical path at 30, 60 and 120 Hz and both stroke and glide states occur.
- `node tools/test-ocean-sound.mjs`: passes in headless Edge using the production Web Audio graph and OfflineAudioContext. Checks shower/storm buildup, clear-weather silence, muted silence, deep-water attenuation, record-sheet ducking, rain settling after a change, a spatial right-whale call and no live AudioContext activation during offline review. All I/O stays in the local fixture; recording fetches are disabled for this test.
- `npm run audit:reef -- --quick --json=.taste-skill/ocean-reef-report.json`: passes in the real production world, economy quality, with 91 colonies, 16 procedural reef families and zero findings. This retains the original geometry, movement and clearance limits.
- Script parsing checks pass. CI runs the new unit and offline-audio checks alongside the existing build, browser and reef checks.

Pitch sign was checked against the production transform: models face +Z and `place()` sets X rotation to `-pitch`, so positive pitch lifts the nose during a rise. The spray seam folds the extra tail into the head; its last-to-first samples retain the original adjacent noise sequence.

Offline measurements establish level, transition and mute behavior; they do not establish how a particular phone speaker or headphones will sound. Subjective listening and physical-device performance remain review items.

## Sources and assets

No new recordings, models, textures or third-party assets are introduced. Existing sound files and their provenance remain in [audio credits](../ocean-refined/assets/audio/CREDITS.md). Rain and the visible whale's call textures are authored synthesis, not field recordings.

The voice decision is informed by NOAA's [Southern Right Whale five-year review](https://media.fisheries.noaa.gov/2021-03/508%20Compliant_2021%20Southern%20Right%20Whale%205-Year%20Review.pdf), which describes southern right-whale upcalls and other call classes, and the [NOAA marine mammal monitoring guide](https://repository.library.noaa.gov/view/noaa/30726/noaa_30726_DS1.pdf), which describes the low rising right-whale upcall. The authored sounds are suggestive approximations; their exact spectra and call timing are not a scientific acoustic model.
