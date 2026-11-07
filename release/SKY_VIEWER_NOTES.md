# Guided sky and low Sun

The visible Todoist notes ask for a guided sky viewer, real stars, a redder Sun near the horizon and personal constellation photographs. The existing sky already contains the Yale Bright Star Catalogue (visual magnitude 5 and brighter), 15 conventional constellation figures, and Astronomy Engine's date/observer rotation for Kuala Lumpur. This change makes that real sky discoverable through a surface action.

The viewer borrows a clear sky at 22:00 MYT on the current local date. It offers only targets above the horizon, highlights the selected constellation or star, and provides Previous, Next and a paced automatic tour. Time and weather are clearly described as a preview. It restores the previous phase, weather transition, camera field of view and focus without changing saved preferences. Escape closes the modal; native select and keyboard buttons remain available on touch screens. Reduced motion uses cuts rather than camera pans.

Framing uses the actual space between the header and reading sheet. A phone's subject is above its controls; a landscape subject is beside them. Camera zoom fits the selected constellation's angular extent rather than letting the caption cover it.

The Sun now uses an approximately half-degree disc and a simple altitude-dependent RGB extinction curve, progressively removing blue/green light at low altitude. This is an artistic approximation of atmospheric transmission, not a spectral radiative-transfer model. The existing directional orange twilight sky and reflections are retained.

## Sources and assets

- Existing catalogue: Hoffleit & Warren, [Yale Bright Star Catalogue, V/50](https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50). Its credit is linked inside the viewer and preserved in `sky-system.js`.
- Existing ephemeris: [Astronomy Engine](https://github.com/cosinekitty/astronomy), MIT; observer remains Kuala Lumpur, 3.14° N / 101.69° E. No location permission is requested.
- Low-Sun color rationale: [NASA, Why Is the Sky Blue?](https://spaceplace.nasa.gov/blue-sky/en/). Numerical extinction coefficients are authored approximations.
- No photographs or third-party assets were added. Personal constellation pictures remain pending actual files; the supplied JPEGs are task screenshots. No public placeholders stand in for them.

## Checks

`npm run build` and `node tools/test-sky-viewer.mjs` exercise the production build at 1440×900, 390×844, 768×1024 and 844×390. The regression starts in a locked storm, verifies genuine above-horizon targets, framing, automatic advance, pause, keyboard navigation, finger-sized controls, exact time/weather preference restoration and zero script errors. It uses full motion and the site's explicit reduced-motion preference. Browser I/O stays on the local fixture. CI includes the same browser test.

Source lint on the new stylesheet reports zero failures and warnings. The whole-page skill inspector also ran at 1440/768/390: it flags the unchanged atmospheric scrims and legacy instrument microtext, so a globally clean style-inspector result is not claimed. These are retained ocean conventions, outside this component change. [Desktop](sky-viewer/desktop.png), [phone](sky-viewer/phone.png) and [landscape](sky-viewer/landscape.png) captures are of this repository's rendered sky.

ROUND 2

Seen in one second: a highlighted constellation against the actual night sky.

Idea (one sentence): turn the existing astronomical sky into a calm field guide without replacing it with an illustration.

Live thing: select or tour the stars that are visible from this observer on this date.

Layout words by section: title=top-left / subject=open sky / reading=bottom-left or landscape right / exit=top-right.

Scores: design 7.5 · usability 8 · creativity 7.5 · content 8 → overall 7.7.

Caps applied: component review within the established ocean brand; no whole-page redesign score claimed.

Top three problems and fixes:

1. Initial phone capture placed the constellation behind its caption. Aim into the free region and fit the angular extent.
2. A storm hid the astronomy. Borrow clear weather through a reversible preview rather than changing saved weather settings.
3. Selected individual stars lacked a visual locator. Add a small ring in the same catalogue coordinate frame.

Limits: real-device/Safari behavior is not measured. The sky uses fixed Kuala Lumpur coordinates and an explicit 22:00 preview, not the visitor's local observing site or current wall-clock sky. The source catalogue and existing rendering approximate stellar color and brightness; the viewer does not claim observatory-grade photometry.
