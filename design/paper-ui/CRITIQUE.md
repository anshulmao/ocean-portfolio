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

## Round 2 (same critic, with the motion described and the code read)

Scores (round 1 in brackets): Concept 4 [4], Category 4 [4], Hierarchy 4 [4], Typography 4 [4], Colour 3 [3], Richness 3 [2],
Rhythm 3 [3], Finish 3 [3], Consistency 4 [4], Signature 3 [2], Copy 4 [4], Motion 3 [1-2]. Not done: Finish needed 4 and only 58%
of lines were at 4 or above.

Landed: bubbles and squash, the staggered entrances, settings entrance, the arch drift and caption pill, the depth gauge, hover and
tilt on the cards, the copy rewrites. Left over: the brightness caption flush on the next label, leftover index numbers in the
logbook sidebar, the gauge riding over the marquee, micro labels under 13 px, a dark smear at the settings fade.

### What round 3 did

- Panels take a little of the live sky (dawn warms, dusk cools; 9 to 12 percent mixed into the paper, a 700 ms colour fade).
- Settings: the three general groups are separate tone cards with a visible break; caption spacing; a short 18 px fade.
- Logbook: sidebar index numbers gone. Plan: tracked caps head in sentence case, a smaller anchor.
- Static: the marquee sits above the gauge, runs slower (95 s) and pauses on hover; micro labels raised to 13 px.
- Motion budget trimmed per the critic: small controls keep the squash and the ripple but lose the hover lift; the lean is capped at
  8 by 4 px; the word stagger is capped at 320 ms.

Declined: reordering the plan dialog on phones (it would move the site-map board, which is out of scope); a count-up depth pill on the
dive HUD (the dive computer and depth gauge are out of scope and unreviewable headless); the wave-wipe between the HUD and the
static page (a larger change, needs a real GPU to judge).

## Round 3 (same critic)

Colour 4 [3] (the sky tint), Finish 4 [3]; Concept, Category, Hierarchy, Typography, Consistency and Copy stay at 4; Richness 3, Rhythm 3,
Signature 3, Motion 3 (motion judged from the description). 8 of 12 lines at 4 or above (67%): not done. Its night renders predated the
round-3 fixes, so the night numbering and caption gap it reported were already fixed.

### What round 4 did

- The depth pill is a gauge: a bubble rides a short track as the real depth readout changes, and a bubble leaves the pill every 5 m.
- Settings chips and value boxes sit on a tone step again (they had vanished inside the tone cards); more air under "Lighting".
- The plan card hugs its content with a small anchor; "More experiments" is 15 px and readable.

Declined again: a phone reorder of the plan dialog and the diver's idle bob (both live in the parts that are out of scope: the site-map
board and the 3D scene); the hero button already has a repeating ripple ring.

## Round 4 (same critic)

9 of 12 lines at 4 or above (75%; the bar is 80%): Concept, Category, Hierarchy, Typography, Colour, Rhythm, Finish, Consistency and Copy
at 4; Richness, Signature and Motion at 3. Nothing below 3. Not done by the stop rule, one line short. The critic's own verdict: the
static polish is exhausted, and the three remaining lines are things a still cannot prove. Motion, richness and the depth gauge need
to be judged running, on a real GPU. Remaining defects it listed: the dive HUD was not reviewable headless; the logbook has no scroll
cue under cards 04 to 06; the phone hero's lower part is empty; the plan dialog's dark board next to the pale card is the one
deliberate jolt (out of scope by request).
