# Ocean UI components

Open `../ui-gallery.html` to review the actual UI without a 3D renderer. Select a component in the bottom toolbar. The dive records include the diver profile, dive log, salvage finds and C-card, with the same content, images and motion as the live scene.

This folder contains 24 HTML fragments. Each one is the markup that ships today: extracted from `../index.html`, or from the template inside the module that builds the component. Each file starts with a comment naming its source, the stylesheets it needs and the scripts that drive it. Fragments share IDs and are intended for one instance per page.

Regenerate them after changing markup, from the kit root: `python ocean-refined/tools/make-ui-fragments.py ocean-refined`.

## Every fragment needs

`styles.css` (reset, fonts, `[hidden]`, `kbd`) and `hologram.css` (colour tokens and the `.holo` panel recipe). `motion.css` adds the transitions and entrances; without it everything still appears, just without movement. Load order as in `index.html`: `styles.css`, `dive-hud.css`, `ocean-ui.css`, `hologram.css`, `hud.css`, `journey.css`, `dive-plan.css`, `motion.css`, `archive.css`.

## Fragments

| File | Component | Stylesheet | Scripts |
| --- | --- | --- | --- |
| `masthead.html` | Menu button, wordmark, weather glyph, sun / moon button | `hud.css` | `hud.js`; `world.js` keeps `html[data-sky-preset]` current |
| `settings-menu.html` | Settings menu | `hud.css` | `hud.js`; `world.js` and `expedition-ui.js` (time); `movement-panel.js` (Scene controls); `landmark-interactions.js` (credits) |
| `sky-selector.html` | Sky time scrubber and presets (inside the settings menu) | `hud.css` | `world.js`, `expedition-ui.js` |
| `camera-toggle.html` | First / third person switch (inside the settings menu) | `hud.css` | `world.js` |
| `heading-indicator.html` | Heading tape, caret and readout | `hud.css` | `hud.js` (tape); `world.js` (readout) |
| `reef-map.html` | Round minimap and the expanded reef atlas | `hud.css`, `journey.css` | `hud.js`; `expedition-ui.js` (chart canvas); `world.js` (markers, diver); `journey.js` (found state); `motion.js` (selected state) |
| `depth-gauge.html` | Depth scale | `hud.css` | `world.js` |
| `air-gauge.html` | Air bar | `hud.css` | `dive-hud.js` |
| `dive-computer.html` | Dive computer side panel | `hud.css` | `dive-hud.js` |
| `computer-toggle.html` | Dive computer button | `hud.css` | `dive-hud.js`, `landmark-interactions.js`, `ui-icons.js` |
| `archive-toggle.html` | Dive records button | `hud.css` | `landmark-interactions.js`, `ui-icons.js` |
| `scene-footer.html` | Location, depth and control hint | `hud.css` | `world.js` |
| `interaction-prompt.html` | Prompt to explore a landmark | `hud.css` | `landmark-interactions.js` |
| `capture-hint.html` | Crosshair, click-to-swim hint, ascent status | `hud.css` | `world.js` |
| `surface-hero.html` | Headline, Dive in, entry buttons, Look around, logbook link | `styles.css`, `hud.css`, `dive-plan.css`, `archive.css` | `world.js`, `dive-plan.js`, `guided-dive.js`, `landmark-interactions.js` |
| `swim-controls.html` | Touch swimming pad | `hud.css` | `exploration.js` |
| `sky-view-controls.html` | Look arrows at the surface | `hud.css` | `exploration.js` |
| `scene-controls.html` | Lighting and movement tuning panel | `hud.css` | `movement-panel.js`, `movement-settings.js` |
| `dive-explorer.html` | Dive Explorer dialog (diver's records) | `archive.css` | `archive.js`, `landmark-interactions.js`, `portfolio-content.js`, `ui-icons.js`, `vendor/gsap.min.js` |
| `credits-dialog.html` | Model credits | `hud.css` | `landmark-interactions.js` |
| `dive-planner.html` | Dive planner: site map, site card, dive overview | `dive-plan.css` | `dive-plan.js`, `guided-dive.js`, `journey.js`, `reef.js`, `portfolio-content.js` |
| `dive-link-prompt.html` | Prompt for links that open onto a dive | `dive-plan.css` | `dive-plan.js` |
| `dive-summary.html` | Dive summary card | `dive-plan.css` | `dive-plan.js`, `journey.js` |
| `tour-card.html` | Guided dive caption card | `journey.css`, `dive-plan.css` | `guided-dive.js`, `journey.js` |

## Notes

- Several components ship with the `hidden` attribute, or with `data-show="false"` and `inert`; the scripts listed above reveal them. Remove the attribute to look at one on its own.
- Containers that a script fills at run time are left as they ship, with a comment naming the script: the record index and page in `dive-explorer.html`, the fields in `scene-controls.html` and the site markers in `dive-planner.html`. The heading tape's marks, the minimap's three markers and legend, the pad's scooter and flashlight keys and the injected icons are written out, because they do not depend on state.
- `ambient-audio.js` adds a speaker button to the top row and a Sound group to the settings menu at run time. They are not part of these fragments.
- `ui-gallery.js` provides sample readings and a minimal adapter without creating the world. The physical first-person wrist instrument is a separate 3D component in `wrist-computer.js`; its UI equivalent is the dive-computer fragment.
- The live scene uses actual depth, navigation and time values. Portfolio copy and draft labels come from `portfolio-content.js` and are unchanged.
