# Guided dive, round 4: portfolio first, then the long way up

A plan, agreed 30 Oct 2026 (see Decisions) and built in PR #30. [SPEC.md](SPEC.md) is the source of truth from here; this
file keeps the owner's notes and the findings that led to it. It amends [SPEC.md](SPEC.md). Once we agree on it, the SPEC's sequence, teaching
schedule and decisions get rewritten to match, and this file is folded into the build log.

## The owner's notes (30 Oct 2026)

1. On a phone, the text pop-ups get in the way.
2. The tour doesn't actually go through the arch.
3. It barely explores the reef near the surface.
4. There are too many stops. The core tour should go through About, Experience and Projects first, then work its way
   back up toward the reef. Keep the whale shark and the other life passing through.
5. Show more of the controls. The flashlight is shown, but the scooter and the camera aren't.
6. The table coral tower and the pillar coral cathedral shouldn't be stops. Pass them slowly, show them and move on.
   The only stops should be About, Experience and Projects.

## What it is today (measured on main at 8cb2074)

| Finding | Evidence |
|---|---|
| **13 steps, 7 of them scenic holds.** The swim stops for 10–18 s at each of: nurse shark, reef shelf, table coral tower, pillar coral cathedral, wreck life, arch, bait ball and look-up. | `guided-script.js`. The unit test reports 143 s of swimming plus 108 s of holds. |
| **The arch is skipped: a bug.** The planner does route under the roof (checked against the live collision world). The swim then stalls as it drops over the cliff edge at about (24, −32, −55), and the stall recovery replans **without the scenic waypoints**. The straight line it falls back to crosses the arch at y ≈ −39.5. The roof's underside is at −46.2, so the diver passes 6–7 m over it. | Live trace in headless Chromium, phone viewport: `detours: 1` at sample 24. `guided-dive.js` `route(..., false)` drops `via` on a detour. The unit test misses this because its stub world never stalls. |
| **The camera faces open blue on that leg.** | Screenshot at 25 m, "Next · Through the arch": nothing in frame. |
| **The shallows are never visited.** The tour never goes north of z ≈ −3. Behind the start, at 10–14 m, are a small grotto swim-through at (7, 18), bluespotted rays, sergeant majors, flying fish just under the surface, and the best light. None of it is on the route. | `reef.js` `grottoSites`; `user-creature-routes.js`. |
| **On a phone, the sheet covers the subject.** It opens at every beat and fills about 20% of the screen's height, across the lower middle. That is where the camera frames the shark, the wreck and so on. | Screenshots: the nurse shark sits half behind the sheet. |
| **The scooter tip is never seen.** It shows only while the tour is travelling, but the sheet is folded during travel and folding hides `.tour-teach`. | `journey.css`: `[data-sheet="collapsed"] .tour-body {display:none}`. |
| **There's no photo button on phones.** The dock's Photo button is created `hidden` and nothing ever shows it, yet the tour's touch tip says "Tap Photo". | `expedition-interactions.js` line 18. |

## Proposed shape

Only five moments wait for the visitor: the welcome, **About**, **Experience**, **Projects** and the ending choice.
Everything else is a **fly-by**: the swim slows, the camera glances at the subject, a one-line caption shows, and
the swim carries on.

**Act 1: the portfolio, on the way down**

1. **Welcome.** The controls primer, unchanged.
2. **About: the Anchor** (stop).
3. Fly-by: the nurse shark asleep behind the anchor, then right across the reef shelf. The guide **runs the scooter**
   for a stretch here.
4. Fly-by: the table coral tower, then down past the pillar coral cathedral.
5. **Experience: the Wreck** (stop).
6. Fly-by: **through the arch**, down the gully from the wreck, under the roof, and out over the lantern garden. The
   lamp is taught here because it's dark under the roof.
7. **Projects: the Treasure** (stop).

**Act 2: the long way up** (no stops, one continuous ascent)

8. Fly-by: along the deep ledge to the soft coral spire. The **whale shark** passes overhead while the swim slows to a
   drift. The camera tip comes here: "Grab a photo".
9. Fly-by: up **through the bait ball**.
10. Fly-by: up the slope past the wreck and the fusilier ribbon, then over the anchor.
11. Fly-by: **the shallows.** Through the grotto at (7, 18) if the planner clears it (it's a 4 m tunnel), over the
    rays and the sergeant majors, with flying fish under the surface.
12. **Ending** at about 5 m in the sunlit shallows: "This is my reef." Keep exploring, or Surface. The ascent from
    here is short, and the safety stop offer is unchanged.

Rough budget: about 450 m and **2.5–3 minutes of motion**, down from about 4.2 minutes, because nothing holds.

## How it gets built

### 1. Fly-bys (the main engine change)

- A leg gets `sights`, each with a point, a subject, a caption and an optional `slow` speed.
- As the diver comes within range of a sight:
  - The cruise eases down (to about 1.5 m/s, or a drift for the whale shark).
  - The camera sweeps to the subject with the existing eased pan.
  - The caption shows.
  - Past it, the cruise eases back up and the view returns to the course.
- R1 and D5 still hold: the visitor's own look wins, and the course never depends on the view.
- `exploration.js` needs a **glance focus during travel**. Today the focus only counts within the last few metres of
  a leg (`FOCUS_RANGE`). This is the riskiest change, and `test-guided-motion.mjs` keeps proving that the course is
  identical with and without the visitor looking.

### 2. Arch fix (independent; can ship first)

- **Stall recovery keeps the scenic route.** A detour resumes through the scenic waypoints still ahead (from the
  nearest one), instead of dropping them.
- **Find the stall** on the cliff-edge drop. It's probably the vertical descent rate against the 5 s stall window.
- **Tests:**
  - The stubbed world forces a mid-leg stall, and the swim must still pass under the roof.
  - A live-browser check of the arch leg joins the layout or smoke run.

### 3. Mobile text

- **Fly-by captions become subtitles**, with no card: a title and one line under the depth chip at the top, fading in
  and out over about 4 s. The bottom of the screen stays clear.
- **Portfolio stops keep the bottom sheet.** On phones the camera frames the landmark in the upper half (an aim
  offset), so the sheet never covers it.
- **"Back to the surface" hides while the tour leads.** Surface is still in the tour's own actions.

### 4. Controls: show, don't tell

| Control | Where | How |
|---|---|---|
| Scooter (E / ⚡) | About → tower | The guide runs it. The red scooter shows in first person, the pace lifts and the ⚡ button pulses. Caption: "Scooter on. Hold E (⚡) yourself any time." |
| Lamp (Q) | Through the arch | It's dark under the roof, so the tip means something there. |
| Camera (H / 📷) | Whale shark drift | "Grab a photo." **This needs a photo button on phones** (see question 4). |
| Computer (C) | Projects, the deepest stop | "Check your depth." |
| View (V) | The ending | Unchanged. |

Tips live in the subtitle or the stop sheet, never in a folded row.

## Tech debt and risks

- **SPEC rewrite.** The sequence, the teaching schedule, D2 (tower → cathedral order) and D3 (bait ball) change, and
  R4 ("N continues at every stop") now applies only to the three sites.
- **Analytics continuity.** Step keys and the count change, so the funnel's step-by-step data breaks against older
  sessions. Add `tour_version: 4` to the tour events. It needs an entry in `analytics-privacy.js`.
- **`test-guided-motion.mjs`.** It asserts 12 swims and per-kind behaviour. It gets rewritten for fly-bys, and must
  keep the 30, 60 and 120 Hz runs, the free-look invariants and reduced motion (where fly-bys become fades between
  the three stops).
- **The whale shark's timing against a moving diver.** The encounter is called in early enough to arrive during the
  drift, and its course still obeys D4 (it stays over deep water).
- **The shallow grotto is tight** for a 0.85 m collision radius. The planner must clear it, or the route goes over
  it instead.
- **The two runs behind these findings were in software rendering at about 3 fps.** The stall recovery that drops the
  arch is in the code regardless of frame rate. The stall itself gets confirmed on a real device as part of the fix.

## Decisions (30 Oct 2026)

| # | Question | Decision |
|---|----------|----------|
| E1 | Arch placement | **Act 1, between Experience and Projects:** down the gully from the wreck, under the roof, out over the lantern garden. |
| E2 | Whale shark | **A slow drift of about 8 s** on the ascent. The camera follows it, and the photo prompt comes here. |
| E3 | Ending | **The sunlit shallows**, at about 5 m near where the dive began, after the grotto, the rays and the flying fish. |
| E4 | Phone captions | **Subtitles at the top**, under the depth chip, with no card. The three portfolio stops keep the bottom sheet. |
| E5 | Photo on phones | A camera key on the touch deck, in a row of its own over the flashlight. |
