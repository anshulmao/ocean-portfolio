# UI overhaul: critique and plan

Branch: `ui-overhaul` (from `main` at 7a82a8c). Reviewed 2026-10-20 on the built `dist/` at 1440 x 900 and 375 x 812 in the in-app browser.

## What works

- The surface hero is the strongest moment: golden-hour sky, one confident headline, a clear two-button choice.
- The underwater scene is cohesive and charming; the stylised fish and reef carry the identity.
- The archive's content model (problem / decision / outcome / takeaway, dive-log experience entries) is good. The dive-profile chart is a distinctive idea.
- The reading site is legible, fast, zero-JS and semantically sound.

## Critique — ocean experience

1. **Three visual languages, no system.** Pale glass on the surface, CRT/instrument dark teal with mono caps, purple and gold in the archive. 19 CSS files hold about 153 distinct hex colours and only a handful of custom properties; Outfit, Montserrat and a system mono are all in use. Each screen looks fine alone, but the site does not feel like one product.
2. **The primary call to action depends on an opacity animation.** `.dive-button` and friends enter with `motion-rise`, which starts from opacity 0. In the in-app preview pane, where animations are throttled, they stayed invisible for 8–16 s. *Correction (2026-10-20): in real Chrome they are fully visible by 0.7 s and the ocean is ready in about 3 s, so the delay was a preview artifact.* Availability still should not rest on an animation: `surface.css` now lifts these elements into place without fading them.
3. **Too many tiers under the hero.** Tagline, two buttons, "Guided route & reef map +", then three small links. The lower tiers are about 11 px grey text over moving water, which is weak on contrast and dilutes the choice.
4. **Chrome that reads as debug UI.** The persistent Brightness slider (top right) duplicates Settings. The hamburger opens only Settings, while visitors expect navigation behind it.
5. **The diver competes with the content.** At the surface it sits beside the hero, and on mobile it overlaps the arrow pad. The arrow pad at the surface on desktop is noise before anyone dives.
6. **The dive HUD is crowded.** Compass tape, minimap, depth ladder, dive computer, air gauge, zone title, left button stack, landmark tags and footer hints add up to about nine clusters in every corner at once. The scene, the best asset, gets the leftover middle.
7. **The archive is dense.** It has sidebar, content and a footer pager with 14 dots. Labels are doubled ("ABOUT / THE ANCHOR"), mono uppercase is used everywhere, and three accent colours are active together. Diagram cards and screenshot cards differ in height and weight. On mobile, the header, tabs, section select and pager take about a third of the screen.

## Critique — standalone reading site

1. **Clean but generic.** Apart from the wordmark, nothing says "ocean". The mint background stays the same from top to bottom, with no depth and no colour narrative.
2. **The hero has no visual and no proof.** The headline is good, but nothing above the fold shows the work or its context.
3. **The section header grid is off.** The kicker sits in a narrow left column and the huge H2 floats in the right, which leaves orphans ("loop.") and a centred-looking "How I approach the work." that sits off the grid.
4. **The flagship looks the weakest.** Rae and OpenClaw get near-empty pale diagram cards next to vivid screenshots, so the most important project reads as a placeholder.
5. **Duplicate copy.** The hero line "I turn AI into products people use" repeats as the first About title, along with the same lead paragraph.
6. **The résumé is undersold.** A card with small text links where it should be a clear Download button.
7. **Mobile navigation wraps** into two rows with "Explore the ocean" orphaned. There is no sticky or compact navigation.
8. **Project pages are a long single column.** There is no at-a-glance rail (role, timeframe, type, links, outcome), and the scroll-reveal fade leaves headings with blank bodies mid-scroll.

## Proposed direction: "one ocean, by depth"

One token system, where depth sets the theme. The surface and reading content are light, airy and editorial. As you descend (in the world, or by scrolling the reading site), the palette moves through sunlit and twilight towards the abyss, and instrument styling appears only where it means something (live depth, air, compass). There is one accent per project, carried across card, archive page and project page.

## Decision (2026-10-20)

Direction A from `design/ui-overhaul/depth.html`, with these refinements:

- **Glass only.** There are no white or solid panels. Surfaces are tinted glass in four tiers that differ by hue and opacity: G1 for chips and nav, G2 for project-tinted cards, G3 over water (HUD), and G4 for the logbook sheet.
- **Brighter palette.** The depth ramp is lifted (surface `#f3fbfa`, sunlit `#35c4c4` / `#1d9aa2`, abyss `#072a36`), and the project accents are brighter.
- **Night theme.** The ramp moves to moonlight and abyss (`#0b1630` to `#040b16`). The UI accent changes from sun-gold to bioluminescent teal (`#7ff5df`), and glass tints shift to indigo. In the world it follows the sky clock or the visitor's choice in settings. The reading site follows the system dark-mode setting, with a manual toggle.

## Plan

### Phase 0 — Foundation (tokens and type)
- Add a shared `tokens.css` used by both the world UI and `tools/templates/portfolio-reading.css`. It holds depth colour ramps (surface, sunlit, twilight, abyss), semantic roles (text, muted, line, panel, accent), per-project accents, a spacing scale, radii, glass/elevation, and motion tokens (fold in the existing `--journey-*`).
- Type: Outfit for display and UI, one mono for numerals and instruments only. Drop Montserrat. Define a fluid type scale.
- Migrate hex literals file by file, without changing behaviour.

### Phase 1 — Surface and entry
- Make the headline, lead and both CTAs visible at first paint. Animate only polish, never availability.
- Show two CTAs and one quiet link row. Move "Guided route" into the Explore choice.
- Make the hamburger a real menu (Work, About, Résumé, Contact, then Settings). Move brightness into Settings, with an optional quick toggle.
- Hide the diver and arrow pad at the surface until the visitor dives or touches the screen; fix the mobile overlap.

### Phase 2 — Dive HUD
- Use three densities. **Calm** (default) shows depth, a heading strip and a context hint. **Instruments** (C) adds the dive computer, air, minimap and ladder. **Clear** (U) hides everything.
- Group the instruments into two corners and give them one styling, with zone titles and landmark tags choreographed through motion tokens.

### Phase 3 — Archive (Dive Explorer)
- Make real labels primary and nautical names a quiet secondary line. Use one accent per section or project.
- Replace the 14-dot pager with section progress and Prev/Next titles. Make the sidebar collapsible.
- Mobile: one top bar with a section picker and a slim bottom pager, and reclaim the vertical space.
- Card system: every project gets a real cover. Design illustrated diagram covers for Rae and OpenClaw so they match the screenshot cards.

### Phase 4 — Standalone site
- Scroll is a descent: the background moves from surface pale to deep teal at the contact footer, using the same tokens.
- Hero: a still ocean render (static image, no WebGL), the headline, two CTAs and a compact proof line (current role, focus areas).
- Fix the section grid (12 columns, aligned kicker and heading). Show Rae as a large featured card and the rest in a consistent grid. Remove the duplicate About copy.
- Project pages: an at-a-glance facts rail, bigger media, and a next-project card with an image. Remove the reveal fades that blank out content.
- A sticky compact nav with a mobile menu, a proper résumé button, and dark mode from the tokens. Keep zero runtime JS where possible; a small progressive enhancement is fine.

### Phase 5 — QA
- Run the existing `tools/test-*.mjs` and `ocean-refined/newqa/*` suites, plus one Playwright session. Add a WCAG AA contrast pass, a 390 px overflow check, and a frame-time check against the integrated-graphics budget (Radeon Vega 10).

## Suggested order

Phase 0, then a static design board (surface hero, HUD calm state, archive page, reading home, project page) for sign-off, then Phases 1 to 4 against it, then Phase 5. Phases 2, 3 and 4 touch separate files and can run in parallel once the tokens land.

## Progress

- **Phase 0 (done, d52d987):** `ocean-refined/tokens.css` holds the day and night glass tokens. `styles.css` and the reading template read their colours from it.
- **Phase 1 (done, d52d987):** `surface.css` covers the surface: glass navigation and buttons, a left-aligned hero, and one quiet reading row. The floating brightness panel is retired. The diver still shows at the surface, because hiding it is scene work in `world.js` and needs its own decision.
- **Fonts:** Outfit 300 (headline) and Martian Mono 400 (instruments) are self-hosted under `assets/fonts` with their OFL licences.
- **Phase 2 (done):** `hud-calm.js` and `dive-calm.css` add a calm dive HUD. A depth card shows depth, zone, air and the no-stop limit, which turns into an alert during stops. An ahead card names the nearest light, or "Here · press F" when one is in range. C (Instruments) brings back the depth scale and console. Chips, tape, map, prompt and toast are on G3 glass. On phones, depth is a single-line pill under the heading tape.
- `newqa/dive-hud.mjs` times out on unmodified `main` too (it is hard-wired to port 4175 and uses an older archive structure), so it was already failing before this work.
