# Static site, redrawn from the dive

The reading pages (`/profile.html` and `/projects/<id>/`) now use the portfolio sheet from the ocean
(`ocean-refined/archive.js` / `archive.css`) as their source of truth, and the home page reads as a dive.

## What changed

- **Markup:** `tools/render-dive.mjs` (new). It has the same sections in the same order as the sheet (About, Experience,
  Projects, Résumé), plus the surface hero and Contact. `tools/render-portfolio.mjs` now renders only the frame and
  routes. The older markup builders there still feed the five layout previews (`direction-0*.html`), which keep
  `portfolio-reading.css` and `ui-system.css`.
- **Styles:** `tools/templates/portfolio-dive.css` (new), written standalone and not as overrides. It uses the sheet's
  night palette, gives each section one light (About mint, Experience amber, Projects violet, Résumé coral,
  Contact cyan), and reuses the sheet's pills, portrait ring, career track, project finds and case-study blocks.
- **Pieces carried over from the sheet:** "Hi, I'm Anshul." with the portrait and contact pills; the three-part story
  with its rail; tenure and the career track; roles with dots and checked facts; one grid for all six projects; the
  résumé document with its versions by role; and the case study's problem, decision, outcome and takeaway blocks with
  previous/next turners.

## Motion (CSS only: the reading pages may load no script but analytics)

- The page darkens with scroll, the sunlight rays fade out, and marine snow thickens.
- A depth gauge counts from 00 to 40 m on wide screens, using an `@property` integer driven by `scroll(root)`.
- On arrival, the headline enters word by word, followed by the copy and the porthole. A light sweep crosses the
  porthole once.
- Sections, cards, roles and the résumé page rise in with `view()` timelines.
- The About rail fills while each part is read. The career track grows in and lights the role being read. The line
  beside the roles fills.
- On hover, pills spring, a band of light crosses each card, and images zoom.
- The active nav tab uses `scroll-target-group` / `:target-current` in Chromium.
- Every scroll-driven rule sits inside `@supports`. Browsers without these features show the finished page.
  `prefers-reduced-motion` removes all motion.

## Decisions

- **Night only.** The pages match the sheet and no longer follow the system light/dark setting.
- **Tenure is set at build time.** "3 yrs 2 mo" is computed when the site is built, so it is only as current as the
  last deploy.
- **Some numbers are approximate.** The gauge is linear over the page height, so the depth labels on the sections
  are approximate.
