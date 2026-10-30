# Guided dive v2: instruction set

The source of truth for how the guided dive should feel and behave. The raw brief this was distilled from is
[BRIEF_RAW.md](BRIEF_RAW.md); when the two disagree, the brief wins and this file gets corrected.

## Intent

The guided dive is the main way a first-time visitor meets the portfolio. It should:

1. Show the whole reef in about **two and a half minutes of actual movement**, plus as long as the visitor wants to read.
   It goes down through the portfolio first, then takes the long way back up.
2. Signpost the portfolio. It says where About, Experience and Projects live, not what's in them.
3. Teach the controls a few at a time, at the moment each one is useful.
4. Leave the visitor free at every point. They can look anywhere, take over, rejoin, or surface.

## Core rules

| # | Rule |
|---|------|
| R1 | **The guide moves the visitor. The visitor moves the camera.** While the guide is swimming, mouse, drag or arrow-key look changes only the view and never the course. |
| R2 | When the visitor lets go of the look (1.4 s with no look input), the camera sweeps back, eased in and out, to where the guide is looking: the subject at a stop, a fly-by's subject or the way ahead while swimming. Their own look always wins straight away. |
| R3 | Movement keys or the touch pad take over the dive. The tour holds and offers **Rejoin (G)**. Nothing is lost. |
| R4 | The tour waits only at the welcome, the three portfolio sites and the ending, and **N** continues from each. Everything else is a **fly-by**: the swim slows and the camera glances, but nothing stops. |
| R5 | Copy at a stop is small. "This is where you'll find X." No essays and no headline claims. |
| R6 | Reduced motion: legs become fades between stops, there's no auto-pan, and look indicators stay. |
| R7 | Touch, phone and keyboard all get equal treatment, and every key hint has a tap equivalent. |
| R8 | The visitor can always exit, surface or keep exploring. The safety stop is offered, never forced. |

## The sequence (rounds 4–5)

World coordinates are metres (x, y, z), with y negative below the surface. Entry is about (0, 0, 0), facing −z.
"Right" is +x. The route itself lives in `ocean-refined/guided-script.js`.

Only five moments wait for the visitor: the welcome, **About**, **Experience**, **Projects** and the ending.
Everything between them is a **fly-by**:

- The swim slows (to about half its cruise, unless the fly-by says otherwise).
- The camera glances at the subject with the same eased turn as a pan.
- A caption names it, and any control it teaches.
- The swim carries on.

The visitor's own look always wins (R1, D5).

### 0. Entry: "Show me around" (surface → underwater)

1. The visitor clicks **Show me around** while bobbing at the surface. The hero text, CTAs and links fade out.
2. The camera eases in on the diver until the diver is centred.
3. The diver dives in, and the view goes to **first person** during the descent.
4. The diver levels out at shallow depth, facing the anchor, and the camera looks slowly around the reef.
5. The title card shows ("Guided dive"), then the welcome sheet.

### 1. Welcome and controls primer

The welcome shows four key chips: C (dive computer), W A S D (swim), Space/Shift (up and down) and V (view).

- The next one to try is lit, and each is ticked once it's tried.
- The visitor can swim within 5 m of where the welcome began and stay on the tour.
- On a phone it shows only the stick and rise and sink. The computer and the view are menu items there.
- Rising stops 2.5 m over where the welcome began.
- N skips the controls and starts the tour.

### Act 1: the portfolio, on the way down

2. **About: the Anchor** (stop). "This anchor is me." Read it (F) opens At a glance, which carries the welcome (D6).
3. Fly-bys on the way to the wreck:
   - **The nurse shark**, asleep where it settled behind the anchor.
   - **Scooter on.** The guide runs the scooter across the reef shelf, so the visitor sees it.
   - **The table coral tower.**
   - **The pillar coral cathedral.**
4. **Experience: the Wreck** (stop). "This is where you'll find my experience."
5. Fly-bys down to the treasure:
   - **Through the arch.** Round the west of the wreck (clear of its masts and the barracuda's beat), down the gully and
     under the limestone arch's roof. The lamp is taught here
     because it's dark.
   - **The lantern garden.**
6. **Projects: the Treasure** (stop). "This is where you'll find my projects." The dive computer is taught here, at the
   deepest stop.

### Act 2: the way up (one swim, no stops; round 5)

7. Fly-bys:
   - **Look out to sea.** Along the deep ledge to the soft coral spire. The swim slows to a drift for about 9 s while a
     **whale shark** passes 22 m out over the deep water and only 7 m above, side-on. The camera is taught here.
   - **Through the bait ball.**
8. **The ending**, in open water just seaward of the wreck at about 8 m (shown depth): the wreck below, and the whole reef rising to
   the north. "This is my reef." V (view) is taught here, on a desktop. The choice is **Keep exploring** or **Surface**,
   and from this depth Surface's ascent offers the safety stop.

### 9. Surface (if chosen)

- Play the existing ascent: rise, offer the **safety stop** (hold, or skip with Esc), surface.
- Back at the surface, the tour is complete.

## Look-there indicators

- A screen-space marker for a subject: a whale, whale shark, orcas, dolphins, or the next landmark.
- **On screen:** a soft bracket or ring on the subject, with a short label ("Whale shark, above").
- **Off screen:** an arrow pinned to the screen edge, pointing the way to turn. It follows the subject as it moves.
- It fades out after the subject has been in view for about 2 s, or when it leaves.
- **Every pass is seen side-on** (round 5): a visitor rises no steeper than 30° over the diver. It swims up to 12 m under
  its band and, if that is not enough, further out (`user-creatures.js` RISE, DEEPEN).
- **Between fly-bys the guide turns to a big animal** (whale, whale shark, orcas, dolphins) passing within 40 m, for 5 s,
  and not to the same one again within 45 s.
- During the tour, the whale shark is called in for the "Look out to sea" drift on the ascent (`oceanControls.encounter`, with
  its course measured from the drift's point). Natural encounters also get the indicator while the guide is active.
- *"Look, life above."*

## Teaching schedule (each control taught once)

| Control | Where | How |
|---------|-------|-----|
| C, W A S D, Space/Shift, V | Welcome | Key chips, one prompt at a time, each ticked once it's tried |
| F | About, Experience, Projects | "Press F to open it" |
| E (scooter) | Fly-by across the reef shelf | The guide runs it: the scooter shows in first person, the pace lifts and ⚡ reads as held and rings. "That's the scooter. Hold E to use it yourself, any time." |
| Q (lamp) | Fly-by through the arch | "It's dark under the arch. Press Q for your lamp." |
| H (photo) | Whale shark drift | "Press H to take a photo of it." On touch, the deck has a camera key. |
| C (computer) | Projects (desktop) | "Press C to check your depth on your dive computer." |
| V (view) | The ending (desktop) | "Press V to see yourself against the reef." |
| G (rejoin) | First takeover | "You have the controls. G to rejoin." |

- A hint the visitor has already used is skipped. The guide running the scooter doesn't count as the visitor trying it.
- On touch, the deck key a fly-by teaches rings while its tip shows.

## Copy rules

- One short line per beat, two at most. Use second person and present tense.
- Signpost: "This is where you'll find…". Don't summarise the portfolio in the tour.
- Key hints follow the input in hand (keys on desktop, buttons on touch).
- **Fly-by captions** are a title and one line over the water, with no card. They sit top centre on a desktop, and top
  left under the depth chip on a phone, clear of the compass. While the tour leads on a phone, Back to the surface
  makes way for them.
- **At a stop on a phone**, the camera aims a little below the landmark, so the landmark sits above the middle of the
  screen, clear of the sheet.
- The existing long `lines`/`short` copy on stops is retired from the tour. It stays in the archive.

## Timing budget

- **Round 4:** about 414 m and roughly **150 s of motion**, fly-bys included, since nothing holds between the sites.
  That's down from about 250 s.
- **Round 5:** about 410 m and roughly **145 s**. The way up ends above the wreck rather than in the shallows, and the
  way down is a little longer round the west of the wreck.
- Reading time is unbounded. The welcome, the three sites and the ending wait for the visitor.

## Acceptance checks

- Mouse look during a guided leg never changes the course and never ends the tour.
- A fly-by's glance turns only the view. The course and the body hold.
- WASD or the touch pad takes over. G rejoins the step the tour was on, through the scenic waypoints still ahead (round 5:
  never the nearest step, which could skip a site).
- Every leg plans a collision-clear scenic route at both quality levels and seabed clearances up to 2.2 m. This is a
  unit test over the whole script.
- The leg to the treasure passes under the arch's roof, even after a stall, a pause or a takeover and rejoin partway.
- Every fly-by shows once, in order. Each lasts its hold, or is cut short (after 2.5 s at least) by the next one coming
  into reach.
- The whole tour completes with N only, on desktop and on a phone layout.
- With reduced motion on, every leg is a fade, and there are no pans, fly-bys or called-in animals.
- The whale shark's line stays over open water (D4).
- Surface from the ending runs the existing ascent and safety-stop offer. The ending sits at about 3 m (shown depth), inside
  the stop's 3–5 m band, so the free-standing offer holds off while the ending sheet is up and comes back once the
  visitor keeps exploring.
- No regression in atlas travel, start-at-site, or free swimming.

## Decisions (29 Oct 2026)

| # | Question | Decision |
|---|----------|----------|
| D1 | Movement keys during the tour | They **take over**. The tour holds and **G** rejoins. Mouse, drag, arrow keys and a gamepad look stick only look. |
| D2 | Coral tower vs semicircle order | Anchor → **table coral tower** (shallow) → **pillar coral cathedral** (the semicircle) → wreck. |
| D3 | Bait ball | **Included** in the main route (step 7 is no longer optional). |
| D4 | Big animal | A **guaranteed whale shark**, scripted for the deep look-up. Its pass must stay in **open water**, over the deep shelf, and never swim in toward the shallows. Natural encounters are also pointed out. |
| D5 | Camera when idle | **Drift**: the visitor's look holds for 2.5 s after their last input, then eases back to the guide's subject. Round 5: 1.4 s, and an eased sweep while swimming too (it used to be a chase there). |
| D6 | Welcome text | Shown **only on the tour**, inside the At a glance page. A visitor who opens At a glance outside the tour doesn't see it. |

**Round 4 (30 Oct 2026).** These supersede D2 and D3: the tower, the cathedral and the bait ball are now fly-bys, not
stops.

| # | Question | Decision |
|---|----------|----------|
| E1 | Arch placement | **Act 1, between Experience and Projects:** down the gully from the wreck, under the roof, out over the lantern garden. |
| E2 | Whale shark | **A slow drift** of about 9 s on the ascent. The camera follows it, and the photo prompt comes here. |
| E3 | Ending | **The sunlit shallows**, at about 5 m near where the dive began. Round 5: **open water just seaward of the wreck**, at about 8 m shown, with the reef ahead. |
| E4 | Phone captions | **Subtitles at the top**, under the depth chip, with no card. The three sites keep the bottom sheet. |
| E5 | Photo on phones | **A camera key on the touch deck**, in a row of its own over the flashlight. |

## Build log

- **Phase 1: steering mode (done).** `exploration.js` has a free-look mode (`setGuided(value, free, looking)`). Under it, aim, arrows and the look stick
  change only the view, and the swim and the diver's body (`state.bodyYaw`, `state.bodyPitch`, which also orient the collision
  capsule) keep the guide's course. When it ends, the body eases back onto the view. `world.js` poses the diver from
  the body. The current tour uses it. Covered in `tools/test-guided-motion.mjs`: the course is identical with and
  without the visitor looking, plus the hold-then-drift, arrows, swim-key and thumb-stick takeover, and the body settle.
- **Phase 2: the tour as data (done).**
  - `guided-script.js` holds the 12 steps: the route, the pans, the copy and the hold times. `guided-dive.js` runs them.
  - Statuses:
    - `intro`: the welcome, which waits for N.
    - `look`: a scenic beat that pans its subjects and moves on by itself after `hold` seconds.
    - `dwell`: a portfolio site, which waits for N.
    - `done`: the overview, offering Explore or Surface.
    - Unchanged: `travel`, `free`, `starting`, `off`.
  - At the anchor, Read it (F) opens **At a glance**, which carries the welcome only while the tour is on.
  - The swim controller gains `lookAt(point)` for the pans.
  - The test drives the whole route on the real reef at 30, 60 and 120 Hz. It's about 335 m, roughly 102 s of
    swimming plus 39 s of scenic beats. The legs' acceleration and braking set most of the swim time, so cut beats
    rather than raise `SPEED` to shorten it.
- **Review round 1 (after trying phase 2):**
  - **Pans ease in and out.** A guided pan is a sine-eased sweep: slow away, fastest midway, slow to rest. Bigger turns
    take longer (about 4 s for a quarter turn). The drift back after the visitor's own look is a sweep too.
  - **A relaxed pace.** Each subject of a scenic beat gets 6 s (5 s on three-subject beats), the eased pan included,
    and the cruise drops to 3.6 m/s. That's about 115 s of swimming plus 93 s of looking, roughly 3.5 minutes of
    motion. This deliberately replaces the 2-minute budget.
  - **The nurse shark.** It settles wherever level sand is (`sand()` in user-creatures.js), which is behind the
    anchor, not at its wished-for spot. The tour asks the creature system where it actually lies (`residentAt`) and
    frames it from the nearest clear spot 5–8 m away, kept clear of the landmark models.
- **Phase 3: the opening (done).**
  - From the surface, **Show me around** fades the surface copy (`body[data-prelude]`) and holds still for 1 s.
  - The camera then eases in on the diver and centres them (`world.js` `frameDiver`, 1.4 s sine ease), and the dive
    starts in **first person**. The saved view setting is left alone, so V still toggles.
  - Underwater, the "Guided dive · Welcome to the reef" title card shows for about 3 s before the welcome sheet, while
    the camera looks around.
  - Started under water, the tour skips the surface part.
- **Phase 4: the controls (done).**
  - The welcome card lists C (dive computer), F (open a site), E (scooter, hold), Q (flashlight) and V (first/third
    person) as chips. Each chip ticks once it's tried.
  - Use is noticed by what changed: the lamp, the view, the scooter spooling, the computer opening, the records
    opening, a photo. Keys, touch buttons and a gamepad all count, and on touch the chips name the buttons instead.
  - Later beats teach one control each, worded for the input in hand, and skip it if it's been tried:
    - H (photo) at the table coral tower
    - Q (lamp) at the wreck
    - E (scooter) on the swim into the bait ball, where it speeds up the guide
    - C (computer) on the deep shelf
    - V (view) at the overview
  - Trying a control never hands the dive over.
- **Phase 5: the whale shark and "look there" (done).**
  - The deep beat calls a **whale shark** in on a course of its own (`user-creatures.js` `encounter`, `guided-script.js`):
    - It passes east–west over the deep shelf, 10 m to seaward of the diver and 18 m above, so it never swims in over
      the shallows. The test checks the seabed stays deeper than 38 m along its whole line across the reef.
    - It starts 14 m short of its closest approach, so it arrives during the beat.
    - The camera's second subject there is the shark itself, followed as it swims.
  - A **look-there marker** (`look-indicator.js`) works while the tour leads:
    - On screen, it rings the nearest notable visitor not yet seen (the whale shark, a whale, orcas, dolphins, reef
      sharks) and names it, with "above", "below" or "nearby".
    - Off screen, it's an arrow pinned to the screen edge, pointing the short way round.
    - Once the animal has been in view for 2.4 s the marker lets it go. A later pass can be pointed out again.
- **Phase 6: the finish (done).**
  - **Ending:** the overview offers Keep exploring or Surface. Surface ends the tour and runs the existing ascent,
    with its safety-stop offer (held off only while the tour leads). Swimming off from the overview simply ends it.
  - **Reduced motion:**
    - Every leg is a fade, and the camera never pans by itself.
    - The opening's camera move is instant.
    - The marker doesn't animate.
    - The whole tour still runs on Continue alone, whale shark included. A test covers this.
  - **Analytics** (only with consent; `analytics-privacy.js` declares the fields):
    - `tour_started` {from}
    - `tour_step` {step, index}
    - `tour_taken_over` and `tour_rejoined` {step, index}
    - `tour_ended` {step, index, how}, where how is exit, explore, surface, swam_off, surfaced, failed or stopped.
    - Together these give a step-by-step funnel of where visitors leave.
  - **Layout:** the CI layout test now also measures the overview sheet on phone, landscape and desktop.
- **Review round 2 (after trying phases 1–6):**
  - **Controls one at a time.** The welcome asks for C, then E, Q and V, one prompt each. Each is ticked as it's done
    ("✓ Dive computer") before the next is asked for. **N skips the controls** and starts the tour. F is dropped from
    the welcome, since there's nothing to open there; it's taught at the anchor.
  - **New deep section.** Down the gully from the wreck and **through the limestone arch** (reef.js: 20, −72).
    - The route goes over the cliff edge, then about 3 m off the gully floor under the roof. It holds for seabed
      clearances up to 2.2 m, and a test checks the swim passes under the roof.
    - It comes out over the **lantern garden**, then the bait ball over the soft coral spire.
  - **The look-up moves.** It now happens **beside the spire** (40, −46, −80), facing back up the reef to the wreck and
    the light: the owner's reference shot. The whale shark's line moves 10 m in front of the diver as they face the
    reef, still over 50 m+ of water.
  - **Timing:** about 356 m, roughly 130 s swimming plus 115 s of looking, so a little over 4 minutes of motion.
  - **Water clarity.** A new setting, Settings → General → Lighting → Water clarity (70–180%). The owner's profile
    defaults to 125%. It stretches the underwater haze (`ocean-look.js` `uLookClarity`) and the cull distance with
    it, so clearer water also draws further: more of the reef at once, which costs more on slower devices.
- **Review round 3:**
  - **One stop through the arch.** The arch and the lantern garden are one beat now. The swim goes through the arch
    and out past the lanterns without stopping, then looks back up at the reef and leads on. The bait ball and the
    look-up beside the spire still follow before Projects. There are 12 swims, about 408 m, 143 s swimming plus 108 s
    looking. At both quality levels in the app, the planned route stays under the arch's roof.
  - **The controls as chips again.** The welcome shows four key chips: C (dive computer), W A S D (swim), Space/Shift
    (up and down) and V (view).
    - The next one to try is lit, and each is ticked once done.
    - Swimming and rising or sinking are noticed by the diver moving under the visitor's own control.
    - **Within 5 m of where the welcome began, the visitor can swim about and stays on the tour.** Leaving that area
      puts the tour on hold, and Rejoin brings it back.
    - The scooter isn't in the welcome. Its tip ("Hold E for the scooter: the guide speeds up too") shows on the first
      swim.
  - **Start waits for the tour's animals.** If the creature set (the nurse shark, the whale shark) is still loading,
    Start says "Getting the reef ready…" and leads on as soon as it is in, after 20 s at most. Loading earlier, on the
    Show me around / Dive in click, is the loading PR's half (stacked on this branch).
  - **Big animals on every dive** (`big-life.js`), on the tour or not:
    - The look-there marker points out any whale shark, whale, orcas, dolphins or reef sharks that come near.
    - If none of the whale shark, whale, orcas or dolphins has come by 30 s into a dive, one of them is called in.
    - The marker keeps below the compass and above the bottom controls.
  - **Whales cross the reef's face.** With no scripted course, the whale and the whale shark now swim parallel to the
    reef along a line in deep water (z ≤ −55 for the whale and −50 for the whale shark, the `across` setting in
    `user-creature-routes.js`), not toward it. The tour's look-up keeps its own scripted course.
- **After round 3:**
  - **Surfacing faces the way it goes.** On the automatic ascent the diver's body used to keep whatever heading it
    last had: the free-look body after the tour's Surface, or the last swim on a plain rise. It now turns with the
    swim home and tilts with the climb, and the view turns with it along a route. Easing back onto an overrun hold or
    the safety stop is a drift, not a turn about. `tools/test-navigation-clock.mjs` checks it at 30, 60 and 120 Hz.
  - **The safety stop is offered as the diver arrives.** The return used to reach its last point at cruise, overrun it
    by 2 m and swing back for a few seconds before the offer appeared. It now brakes smoothly into the stop, and the
    offer comes up within 0.6 m of the stop, at a drift. The test checks there's no overrun and no wait.
  - **#15 merged in** (a shorter waterline hold on slow devices; the tour's assets start loading at the Show me
    around click).
- **Round 4: portfolio first, then the long way up** ([ROUND_4_PLAN.md](ROUND_4_PLAN.md) has the owner's notes and the
  findings).
  - **The arch fix.** A stall partway through a leg used to replan without the scenic waypoints. On the cliff edge
    below the wreck, that sent the swim 6–7 m over the arch's roof. A detour, Resume and Rejoin now keep the waypoints
    still ahead, measured along the scenic line from the step before.
  - **Fly-bys** (`exploration.js`):
    - `glance` turns the view to a subject while a leg swims on. The course and the body hold.
    - `pacing` eases the cruise to a fraction of itself.
    - `guideScooter` runs the scooter for the visitor to see.
    - A leg's end or any takeover clears all three.
    - `guided-dive.js` drives them from the scenic waypoints that carry a caption. It drops fly-bys the swim has
      already passed, and lets the next one cut a running one short.
  - **The route.** Three stops, 12 fly-bys, about 414 m and 151 s of motion, checked at 30, 60 and 120 Hz on the real
    reef.
  - **The whale shark** is called 26 m before its drift, on a course measured from the drift's point (`course.from` in
    `user-creatures.js`), not from wherever the diver is.
  - **Phones:**
    - Fly-by captions sit under the depth chip.
    - Back to the surface steps aside while the tour leads.
    - The landmark is framed above the sheet at a stop.
    - The deck gains a camera key, and the taught key rings.
  - **Analytics:** the tour's events carry `tour_version: 4`, so the funnel never mixes the round 4 steps with the 13
    that came before.
  - **Reduced motion:** there are no fly-bys, so the tour calls no animal in. `big-life.js` still brings a big animal by
    on every dive.
  - **Checked in the live app** (headless Chromium, phone viewport):
    - The treasure's viewpoint, once its model settles, is just north of the chest. The wreck's is 17 m north of the
      hull.
    - The stretches into and out of the treasure cut through the chest, and the planner dropped both scenic legs
      whole. That was the arch on the way down and the entire ascent.
    - Three fixes:
      - The planner now goes stretch by stretch when the whole route is blocked. A blocked stretch finds its own way
        round, and an unreachable waypoint is left out.
      - The treasure is approached and left over open water to its north.
      - The unit test's stand-in viewpoints are now the live ones.
- **Round 5: a cinematic camera, side-on big life, a shorter way up** (the owner's notes after trying round 4).
  - **Camera:**
    - Under way, the visitor's look holds 1.4 s after they let go, then sweeps back, eased in and out, onto where the guide
      is looking. Before, it chased back exponentially, and only at stops was it a sweep (`exploration.js` `sweep.back`).
    - Between fly-bys, a big animal passing near gets the view.
  - **Framing:** fly-bys pass their subjects 15–22 m off and look at the middle of them. The tower and the cathedral
    read whole even on a phone held upright, which sees only about 26° across.
  - **Big life side-on:** see Look-there indicators. The guided whale shark passes 22 m out and 7 m above.
  - **The wreck and the barracuda:**
    - The ship's collision volume is only its low hull, so the swim went through its masts and sails.
    - The sentinel bolts from a diver within 6 m and stops to watch one within 14 m.
    - Every leg now keeps 2 m from the ship's whole bounds and 8 m from the barracuda's beat, checked over the swim.
    - The way down goes round the west of the wreck. `oceanDiagnostics.userCreatures.sentinel` gives its position and
      how often it has bolted.
  - **The way up** ends in open water above the wreck. The anchor, rays and grotto fly-bys are gone. Surfacing from 8 m
    brings the safety stop back.
  - **The welcome:**
    - Rising stops 2.5 m over where it began (`tether`). It used to carry the visitor out of the welcome and to the
      surface.
    - On a phone the welcome asks for the stick and rise and sink only. The computer and the view are menu items there,
      so they aren't taught on a phone.
  - **Rejoin** takes up the step in progress. Taking the nearest step could skip the treasure now that the ending is
    beside the wreck.
  - `tour_version` is now 5.
