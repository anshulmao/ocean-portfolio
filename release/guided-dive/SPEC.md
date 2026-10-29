# Guided dive v2: instruction set

The source of truth for how the guided dive should feel and behave. The raw brief this was distilled from is
[BRIEF_RAW.md](BRIEF_RAW.md); when the two disagree, the brief wins and this file gets corrected.

## Intent

The guided dive is the main way a first-time visitor meets the portfolio. It should:

1. Show the whole reef in about **two minutes of actual movement**, plus as long as the visitor wants to read.
2. Signpost the portfolio. It says where About, Experience and Projects live, not what's in them.
3. Teach the controls a few at a time, at the moment each one is useful.
4. Leave the visitor free at every point. They can look anywhere, take over, rejoin, or surface.

## Core rules

| # | Rule |
|---|------|
| R1 | **The guide moves the visitor. The visitor moves the camera.** While the guide is swimming, mouse, drag or arrow-key look changes only the view and never the course. |
| R2 | When the visitor hasn't touched the look for a few seconds, the camera gently pans to the current subject (look-assist). Their own look always wins straight away. |
| R3 | Movement keys or the touch pad take over the dive. The tour holds and offers **Rejoin (G)**. Nothing is lost. |
| R4 | **N** continues at every stop. Nothing advances on a timer while there's text to read. |
| R5 | Copy at a stop is small. "This is where you'll find X." No essays and no headline claims. |
| R6 | Reduced motion: legs become fades between stops, there's no auto-pan, and look indicators stay. |
| R7 | Touch, phone and keyboard all get equal treatment, and every key hint has a tap equivalent. |
| R8 | The visitor can always exit, surface or keep exploring. The safety stop is offered, never forced. |

## The sequence

World coordinates are metres (x, y, z), with y negative below the surface. Entry is about (0, 0, 0), facing −z.
"Right" is +x.

### 0. Entry: "Show me around" (surface → underwater)

1. The visitor clicks **Show me around** while bobbing at the surface.
2. **Beat (~1 s):** nothing moves. Then the hero text, CTAs and links fade out.
3. The camera dollies in on the diver (third person) until the diver is centred.
4. The diver dives in, and the camera blends into **first person** during the descent.
5. The diver levels out at shallow depth, facing the anchor.
6. **Look around (~6–8 s):** a slow pan across the reef so the visitor sees where they are. They can grab the look at any time.
7. A splash title appears ("Guided dive"), then the bottom sheet: *"Welcome to the guided dive."*

### 1. Controls primer

The sheet shows the core controls. Each one ticks when the visitor tries it, and none is required.

| Key | Touch | Does |
|-----|-------|------|
| C | Computer button | Dive computer |
| F | Interact button | Interact (read a site, collect a find) |
| E (hold) | Scooter button | Scooter (also speeds up the guide's swim) |
| Q | Lamp button | Flashlight |
| V | View button | First / third person |
| N | Continue | Continue the tour |

Then: *"You can go anywhere. There's a lot of life down here. Press N to continue."*

### 2. The Anchor: About (−12, −8, −15)

- Swim to the anchor, which is directly ahead.
- Sheet: *"This anchor is me. Press F to open my portfolio."*
- F opens the archive's existing **At a glance** page with a welcome. The welcome says this is Anshul, this is a
  dive world built for exploring the portfolio, the visitor is free to roam, and they can continue the guided dive
  from here.
- Closing the archive returns to the tour. **N** continues.

### 3. Life by the anchor → out across the reef

- Pan over the **nurse shark** resting near the anchor (about −21, −24).
- Swing **right** across the shallow reef, past the sergeant majors and the fusilier ribbon.
- Glance at the deep blue without going there yet: *"The deep end comes later."*

### 4. Table coral tower (38, −8), shallow, right

- Approach and pan. Free look. Teach **H (photo)** here.

### 5. Pillar coral cathedral (48, −28): the semicircle

- Go **down** to the horseshoe of organ-pipe columns and swim into the open side. Pan it.
- Free look is the point of this beat.

### 6. The Wreck: Experience (18, −23, −39)

- Swim **left** and down to the ship. *"Here's the wreck."*
- Go in close and pan. The barracuda sentinel patrols here and there's plenty of fish life. Teach **Q (lamp)**.
- Sheet: *"This is where you'll find my experience. Press F to open it."*
- Pan the wreck again and show more life. **N** continues.

### 7. Optional: the bait ball (about 48, −67, over the soft coral spire)

- Swim **through** the bait ball (it opens a tunnel around the diver), with trevally hunting round it. Teach **E (scooter)** on the way.

### 8. Deeper: look up

- Drop below the ledge (about 0, −40, −66) and turn to **look up** at the reef top and the light.
- Teach **C (computer)**: *"Check your depth. We're about N m down."*
- If a big animal is around, point to it (see *Look-there indicators*).

### 9. The Treasure: Projects (−18, −45, −82)

- Move slowly across to the deep ledge.
- Sheet: *"This is where you'll find my projects. Press F to open them."* Free look.

### 10. Rise to the overview (left edge, about −45, −12, −40)

- Ascend **slowly** along the left side, past the kelp grove and the barracuda wheel, to a point where the whole reef is in view.
- Teach **V (view)** for a third-person look at the diver against the reef.
- Sheet: *"This is my reef and my portfolio. Dive around on your own and look at the life."*
- Choice: **Explore** (free) or **Surface**.

### 11. Surface (if chosen)

- Play the existing ascent: rise, offer the **safety stop** (hold, or skip with Esc), surface.
- Back at the surface, the tour is complete.

## Look-there indicators

- A screen-space marker for a subject: a whale, whale shark, orcas, dolphins, or the next landmark.
- **On screen:** a soft bracket or ring on the subject, with a short label ("Whale shark, above").
- **Off screen:** an arrow pinned to the screen edge, pointing the way to turn. It follows the subject as it moves.
- It fades out after the subject has been in view for about 2 s, or when it leaves.
- During the tour, at least one giant encounter (the whale shark by default) is brought in at the "look up" or
  overview beat, using the existing `debug.spawn` path through a public API. Natural encounters also get the
  indicator while the guide is active.
- *"Look, life above."*

## Teaching schedule (each control taught once)

| Control | Where | Line |
|---------|-------|------|
| C, F, E, Q, V | Primer | Listed and tickable |
| F | Anchor, Wreck, Projects | "Press F to open it" |
| H (photo) | Table coral tower | "Press H to take a photo" |
| Q (lamp) | Wreck | "It's darker in here. Q for your lamp." |
| E (scooter) | Long leg to the bait ball / deep | "Hold E to scooter. The guide speeds up too." |
| C (computer) | Deep look-up | "Check your depth on your computer: C." |
| V (view) | Overview | "Press V to see yourself against the reef." |
| G (rejoin) | First takeover | "You have the controls. G to rejoin." |

A hint the visitor has already used is skipped.

## Copy rules

- One short line per beat, two at most. Use second person and present tense.
- Signpost: "This is where you'll find…". Don't summarise the portfolio in the tour.
- Key hints follow the input in hand (keys on desktop, buttons on touch).
- The existing long `lines`/`short` copy on stops is retired from the tour. It stays in the archive.

## Timing budget

- Route length is about 300 m. At a cinematic cruise of about 4 m/s that's about 75 s of travel, plus about 45 s
  of pans, so roughly **2 minutes of motion**.
- Reading time is unbounded, and stops wait for **N**.

## Acceptance checks

- Mouse look during a guided leg never changes the course and never ends the tour.
- WASD or the touch pad takes over. G rejoins at the nearest remaining beat.
- Every leg plans a collision-clear route (unit test over the whole script).
- The whole tour completes with N only, on desktop and on a phone layout.
- With reduced motion on, every leg is a cut and there's no auto-pan.
- At least one big animal is pointed out during the tour.
- Surface from the overview runs the existing ascent and safety-stop offer.
- No regression in atlas travel, start-at-site, or free swimming.

## Decisions (29 Oct 2026)

| # | Question | Decision |
|---|----------|----------|
| D1 | Movement keys during the tour | They **take over**. The tour holds and **G** rejoins. Mouse, drag, arrow keys and a gamepad look stick only look. |
| D2 | Coral tower vs semicircle order | Anchor → **table coral tower** (shallow) → **pillar coral cathedral** (the semicircle) → wreck. |
| D3 | Bait ball | **Included** in the main route (step 7 is no longer optional). |
| D4 | Big animal | A **guaranteed whale shark**, scripted for the deep look-up. Its pass must stay in **open water**, over the deep shelf, and never swim in toward the shallows. Natural encounters are also pointed out. |
| D5 | Camera when idle | **Drift**: the visitor's look holds for 2.5 s after their last input, then eases back to the guide's subject. |
| D6 | Welcome text | Shown **only on the tour**, inside the At a glance page. A visitor who opens At a glance outside the tour doesn't see it. |

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
  - Underwater, the "Guided dive · Welcome to the reef" title card shows for about 1.8 s before the welcome sheet, while
    the camera looks around.
  - Started under water, the tour skips the surface part.
