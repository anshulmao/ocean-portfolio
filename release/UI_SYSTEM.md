# Ocean UI system

## Direction

This is a web portfolio for people reviewing Anshul's applied AI product work. The first job is to see the work; exploring the reef is the distinctive second route. Keep the Three.js world, content, projects, archive routing, settings, map, guided dive, dive log, controls, privacy choices and static reading path.

Taste draw: **The page is the object**, seed **1023358152**, with the existing palette and Outfit retained. Interpret the object as the portfolio's existing dive logbook, rather than introducing folders or changing the scene. This is a unification/restyle, so existing layouts and behaviours survive. No redraws. The attached App Designer Pro workflow informs the exploration, state hierarchy and motion review; native device chrome, store assets, onboarding and paywalls do not apply to this web site.

On this page, Anshul's project stories and actual reef discoveries become pages of the same ocean logbook.

## Inventory and argument

- Anshul Ramprasad, based in Kuala Lumpur; applied AI product work.
- RAE, Re:Engage, Wattmana, Sage and OpenClaw have existing stories and assets.
- The ocean itself is a working Three.js project and the portfolio's dominant image.
- The existing diver, reef fauna, coral habitats and bathymetry belong to this experience.
- Surface navigation and reef landmarks open the same project archive.
- Guided dive provides a second way to explore; manual swimming remains available.
- The dive log records this visitor's actual dive, not invented statistics.
- The reading portfolio and individual case studies work without JavaScript.
- The résumé, contact destinations, model credits and privacy links are real.
- Local fonts and existing project artwork provide all required visual material.

Surface: who Anshul is and what he makes → existing ocean and direct work link.
Work: what he has built → existing project images and case studies.
About and experience: how he works → existing biography and roles.
Dive interfaces: where the visitor is and what they can do → live readings and labelled controls.
Contact: how to reach him → existing email and professional links.

## Voice and copy

Keep the approved case-study copy. Use sentence case in navigation and controls, plain action labels and no invented claims. Surface title: “I build intelligent experiences.” Supporting sentence: “I'm Anshul, an applied AI product builder in Kuala Lumpur.” Primary action: “Dive in”. Secondary route: “See the work”. The existing guided dive, site picker and reading-page links remain available.

## Visual contract

One type family: the bundled Outfit. Use tabular numerals for live readings; monospace remains only in actual code. Ink #143d46, foam #f3f8f7, quiet surface #e4eeec, teal #176c70. Deep interfaces use ground #102b34, raised surface #193b45 and ink #eef6f5. Project imagery keeps its own colours. Amber and coral remain reserved for dive cautions and warnings.

Flat surfaces replace projected scanlines, decorative corner brackets, slate props, glass, glow and text shadows. A single 8px control radius and 16px sheet radius connect surface, archive, settings and reading pages. Use 44px minimum targets, a visible focus ring and the existing safe-area/layout zones. The ocean remains visible around opaque sheets; long text gets a stable background.

## Motion storyboard

Personality: Premium, calm and responsive. Shared easing cubic-bezier(.2,.7,.2,1); durations 140 / 320 / 520ms. Hero copy settles first, actions follow 70ms later, quiet links follow once more. The ocean supplies ambient life. Sheets arrive over 320ms with 16px travel; page content uses a short 12px arrival. Buttons press at .98 scale with 140ms feedback; arrows and project crops provide secondary motion. Static reading sections reveal with native view timelines only when supported, and remain visible without scripting. Existing guided-dive and modal lifecycle callbacks are retained. Reduced motion removes travel and view transitions; content never depends on a reveal firing.

## Verification

Production build, repository checks, responsive browser screenshots and interaction coverage are recorded with the PR. No new external images, replacement content, runtime dependency or animation library is needed.

`npm run check` builds the production output, checks all shipped links/assets, runs 8 service tests and 16 unit test files, runs the production smoke suite, and now includes `test:ui`. The UI suite covers 320/390/768/1440px reading layouts in both colour schemes, contrast, JavaScript-free navigation, four ocean viewport sizes including landscape, settings, all archive sections, site selection, dive log, profile card, keyboard dismissal, normal motion and reduced motion. The existing phone layout suite also passes every state: surface, profile, summary, archive, dive arrival, manual dive, landmark, settings, and guided welcome/travel/stop/flyby/end. During a manual mobile dive it leaves 91% of the ocean visible. Reproducible review images are committed in `release/unified-ui/`; transient captures stay in ignored `.taste-skill/`.

## Exploration and review

`design/unified-ui/explore.html` renders the three alternatives using existing assets: Foam logbook (light, Outfit), Captain's instrument (dark, serif), and Open water (blue field, Montserrat). Foam logbook won because it connects the quiet reading route to the actual dive log without competing with the ocean. Captain's instrument made all surfaces feel like equipment; Open water spent the ocean's colour on the interface as well as the scene. The chosen direction keeps the shipped content and layouts.

The live thing is the existing interactive reef and its visitor-specific dive log. There are no invented production metrics or placeholder portfolio projects. The UI browser test uses a clearly scoped in-memory dive record to inspect the summary; it is not shipped as site content. Existing project screenshots, portrait, ocean renders and attributed 3D models supply the imagery. No found photographs, stock clips or new drawings were added; existing model attribution remains in the site's credits.

ROUND 1
Seen in one second: an ocean portfolio with several competing interface styles.
Idea (one sentence): project stories and reef discoveries become pages of one ocean logbook.
Live thing: explore the reef and open the actual dive log.
Layout words by section: surface=open ocean / archive=reading sheet / work=image-led stories / settings=grouped controls.
Scores: design 6.0 · usability 6.5 · creativity 7.8 · content 7.6 → overall 6.6 before caps.
Caps applied: baseline inspector failures cap the baseline at 6.0.
Top three problems: mixed glass/hologram/slate treatments; small tracked labels and inconsistent fonts; three-line reading headlines and excessive framing. Fix with shared tokens, readable control type and calmer flat surfaces.

ROUND 2 — independent critic
Seen in one second: a coherent ocean portfolio with readable project sheets.
Idea (one sentence): the project's actual logbook carries every reading surface.
Live thing: the same reef and dive log, with the direct reading route preserved.
Layout words by section: surface=open ocean / profile=editorial split / work=image-led stories / about=two columns / experience=timeline / contact=large close.
Scores: design 7.4 · usability 7.7 · creativity 7.8 · content 7.6 → overall 7.6.
Caps applied: none in the critic's interface review; the ocean is a canvas experience rather than a conventional four-image landing page.
Top three problems: violet mobile archive selection (`critic/archive-390.png`); uppercase footer and Enlarge controls (`critic/archive-1440.png`); image captures taken before lazy images decoded. Fixed by neutral teal tab tokens, shared action typography and deterministic image decoding. The large legacy project-card radii were also brought into the shared radius family.

ROUND 3 — final verification
Seen in one second: Anshul's work, with clear routes to explore or read.
Idea (one sentence): the same logbook moves from the ocean to the reading portfolio.
Live thing: the reef, site picker and dive history.
Layout words by section: unchanged from round 2; no framework or route migration.
Scores: retain the independent 7.6 overall; no self-awarded increase.
Caps applied: none for the verified interface; physical-device feel has not been measured.
Top three problems resolved after screenshot review: deep reading backgrounds needed explicit colours for contrast; the surface footer inherited a panel fill and became an empty mobile bar; invisible tour/notification layers were still present in hit-test inspection. The final system sets each background explicitly, leaves the footer open, and gives inactive notifications a hidden state.

The ocean inspector allows `few-pictures` because the live WebGL world is its dominant image, and `gradient` for the world's lighting scrims and functional compass ticks. Neither allowance applies to the reading route. No-footage warnings are deliberate: the ocean is rendered live, and a stock video would duplicate it. The tablet's large ocean area is the interactive scene, not missing page content. The reading route retains a broader legacy type scale, a long summary paragraph and small secondary metadata; these are acknowledged polish limits, not hidden content or broken navigation. All final screenshots are reviewed at desktop, tablet and phone widths; light/dark, no-JavaScript and reduced-motion paths have separate browser coverage.
