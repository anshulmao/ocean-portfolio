# Ocean UI components

Open `../ui-gallery.html` to review the actual UI without a 3D renderer. Select a component in the bottom toolbar. The profile archive includes About, Experience, Projects and Resume, with the same content, images and motion as the live scene.

This folder contains 16 HTML fragments: sky selector, heading indicator, reef map, dive computer, dive explorer, depth gauge, scene controls, surface hero, swim controls, sky-view controls, footer, interaction prompt, camera/computer/archive toggles and credits dialog. Fragments share IDs and are intended for one instance per page.

Shared presentation: `styles.css`, `dive-hud.css`, `ocean-ui.css`, `ui-icons.js`, bundled fonts and GSAP. Profile presentation data: `portfolio-content.js`. Controllers: `landmark-interactions.js`, `dive-hud.js`, `movement-panel.js`, `expedition-ui.js`. `ui-gallery.js` provides sample readings and a minimal adapter without creating the world. The physical first-person wrist instrument is a separate 3D component in `wrist-computer.js`; its UI equivalent is the dive-computer fragment.

Fragment data is illustrative UI state. Existing portfolio claims and draft labels remain unchanged. The live scene uses actual depth, navigation and time values.
