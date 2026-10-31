# Paper UI critique log

A fresh critic (no memory of the designer's reasoning) scores rendered screenshots using the rubric in the App Designer Pro
skill's `critique.md`, adapted to the web. The same critic is continued each round.

## Round 1 (stills only, before the motion layer)

| Line | Score | Evidence |
|---|---|---|
| Concept on the pixel | 4 | A sunset sea, a diver, one headline and "Dive in" read at once |
| Not the category average | 4 | The 3D ocean is rare; the UI itself was a standard pale dialog |
| Hierarchy | 4 | Logbook sidebar had three tiers plus tags competing |
| Typography | 4 | Outfit Light at large size is strong; text under 12 px was a defect |
| Colour | 3 | Mint and teal coherent; purple progress bar broke the single accent |
| Richness and joy | 2 | Nothing delightful beyond the 3D scene |
| Rhythm and space | 3 | Settings cramped; brightness caption collided with the next label |
| Finish and craft | 3 | Orphan weather icon, squeezed chips, dark-on-dark hint, grey arrow buttons |
| HUD / static consistency | 4 | Same mint, Outfit, dark pill; CTAs differed in shape |
| Signature | 2 | None |
| Copy | 4 | "Neutral illumination ... gamma" is jargon in a portfolio |
| Motion | 1-2 | One pulse ring and hover lifts |

Not done by the stop rule (Finish and Richness under 4, Signature and Motion at 2 or less).

### What round 2 did about it

- **Finish:** orphan weather orb track hidden; time and weather pickers are an even 2 by 2 of pills; 13 px floor for captions, clock and
  labels; the hint line and footer location sit on paper pills; sky-look arrows are solid paper (their parent was at 50% opacity);
  logbook sidebar tags and index numbers dropped; progress is a row of soft pills in the one accent; the purple tabs are gone.
- **Copy:** "Brightness / Lifts the shadows so the reef is easier to see."; "Click the ocean to look around. Esc lets go.";
  "07:08 in Kuala Lumpur, time at 72x"; "Reading level / Standard"; "Hiring for a specific role? Pick a résumé"; the contact eyebrow is gone.
- **Motion (HUD):** a damped-spring easing; panels, settings sections, the profile card, the logbook sheet and its cards arrive with
  a spring and a stagger instead of the hologram flicker; every control lifts, squashes and springs back; a ripple spreads from each
  press; the main buttons lean toward the cursor; Dive in and Guided dive release bubbles; switches and slider thumbs spring.
- **Motion (static page):** headings rise word by word out of masks; sections follow in a stagger; the arch picture settles from a
  close-up and drifts with the scroll; a depth gauge counts the page's descent (Surface to 40 m); project cards tilt toward the
  pointer; a marquee of project names; hover springs on roles and process steps. All of it needs `prefers-reduced-motion: no-preference`
  and the page reads in full without script.

Declined for now: a per-metre depth parallax on the underwater HUD (it needs the dive state, which could not be reviewed headless),
and the sliding FLIP pill behind the active chip (a larger change, left for a later round).
