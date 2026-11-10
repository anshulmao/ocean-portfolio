# Guided dive v2: instruction set

The source of truth for how the guided dive should feel and behave. The raw brief this was distilled from is
[BRIEF_RAW.md](BRIEF_RAW.md); when the two disagree, the brief wins and this file gets corrected.

## Intent

The guided dive is the main way a first-time visitor meets the portfolio. It should:

1. Show the whole reef in about **four minutes of actual movement** (round 7; it was two and a half), plus as long as the visitor wants to read.
   It goes down through the portfolio first, then takes the long way back up.
2. Signpost the portfolio. It says where About, Experience and Projects live, not what's in them.
3. Teach the controls a few at a time, at the moment each one is useful.
4. Leave the visitor free at every point. They can look anywhere, take over, rejoin, or surface.

## Core rules

| # | Rule |
|---|------|
| R1 | **The guide moves the visitor. The visitor moves the camera.** While the guide is swimming, mouse, drag or arrow-key look changes only the view and never the course. |
| R2 | When the visitor lets go of the look (1.4 s with no look input), the camera sweeps back, eased in and out, to where the guide is looking: the subject at a stop, a fly-by's subject or the way ahead while swimming. Their own look always wins straight away. |
| R3 | Movement keys or the touch pad take over the dive. The tour holds and offers **Rejoin (G)**. Nothing is lost. The welcome is the exception: it is free swimming (round 7). |
| R4 | The tour waits only at the welcome, the three portfolio sites and the ending, and **N** continues from each. Everything else is a **fly-by**: the swim slows and the camera glances, but nothing stops. |
| R5 | Copy at a stop is small. "This is where you'll find X." No essays and no headline claims. One exception, on purpose (round 18): the wreck's card shows the projects themselves, one at a time (picture, name, one line), so a visitor who never opens a page still sees the work. |
| R6 | Reduced motion: legs become fades between stops, there's no auto-pan, and look indicators stay. |
| R7 | Touch, phone and keyboard all get equal treatment, and every key hint has a tap equivalent. |
| R8 | The visitor can always exit, surface or keep exploring. The safety stop is offered, never forced. |

## Start to finish (round 18)

- **The welcome is quiet.** Only the water, the depth card and the guide's card. The compass, the chart and the page
  buttons come in with the first swim (`dive-focus.css`). While the guide leads, the line of keys at the bottom is not
  shown: the tour teaches each key where it is first of use.
- **The wreck is the peak.** Its card is the larger one, and turns through the first four projects that have a
  picture (`site-cards.js` WORK), six seconds each. The four chips sit on one line; a chip picks one, and Tab (Shift+Tab)
  turns to the next while the view has the keyboard. Open it (F, or the sheet's Read it) opens the project shown, whose
  page leads on to the rest. Reduced motion: no turning.
- **The ending is a page of the diver's card.** When a dive ends, the card over the surface diver (`diver-profile.js`)
  gains a Last dive page (`surface-ending.js`): time, depth, sites and species, the depth profile, what is still down
  there, the animals met, Open dive log and Dive again. After any dive worth the name (40 s, or a site reached) the
  card opens on that page by itself; its tabs turn to About me and back. It is one card in one place, so the dive's
  card and the profile can never be up side by side. Closed, the hero's Dive log button is there as before.
- **One row of tools.** Under water on a desktop: Dive computer (Q), Photo (C) and Clear screen (U), in a row at the
  bottom left under the depth card (`dive-focus.js`). The Portfolio button is retired under water.
- **One thing names a site.** Far off, the Ahead card; in reach, the site's own card, whose Open it is the only one on
  screen (the tour's sheet does not repeat it). The prompt (Open About, F) stands in when the card is not up.
- **The way back to what the guide is showing.** The view is the visitor's (R1). When they hold it away from a fly-by's
  subject, or from the site the tour waits at, an arrow at the edge of the screen points back to it, with its name, until
  it is in view again (`big-life.js`, `guided-dive.js` subject). Back in view, the arrow stands over the subject and bobs
  down at it (up at it, where there is no room above) for one second, then goes. It does not show while the guide's own
  turn is coming round, and a new subject starts afresh.
- **A site's card holds on the tour.** It reaches 10 m from the site (it was 8), and while the tour waits at a site or is
  coming in to it the card stays up at any distance, so the swim round the wreck never loses it.
- **Escape gives the mouse back to the view.** Closing a portfolio page on a dive takes the mouse straight back to aiming
  (`landmark-interactions.js` aimAgain). Where a browser refuses that without a click, the Click to swim prompt shows.
- **A photo is named for its animal.** The animal nearest the middle of the frame, if one is near enough to be made
  out, titles the photo and tags it (`dive-log.js` subjectInView); otherwise the place does, as before.
- **The nurse shark stays put.** It lies by the nursery until a diver comes within 3.5 m, lifts off the sand, moves about
  five metres to a second clear spot and settles; crowded there by a diver who has backed off and come again, it turns
  and goes home (`user-creatures.js` driveNurse).
- `npm run test:tour` holds all three.

## The sequence (round 12)

World coordinates are metres (x, y, z), with y negative below the surface. "Right" is +x, facing −z. The site starts at
the surface out over the deep end, beyond the treasure, at (−18, −90), facing the reef (`exploration.js` SURFACE_START). The route itself
lives in `ocean-refined/guided-script.js`.

Only five moments wait for the visitor: the welcome, **About**, **Experience**, **Projects** and the ending. Everything
between them is a **fly-by**:

- The swim slows.
- The camera eases across to the subject (2 s, ease in and out, one way only) and frames it from 15–22 m off, so it
  reads whole. While the guide steers, the camera is independent of the diver's turns.
- Back-to-back fly-bys hand the view from one subject to the next without swinging back to the way ahead. If the next
  subject is already in sight ahead, the view eases straight across to it; otherwise it holds the last one until that one
  is just past the diver's side (ABEAM), then eases on.
- A caption names it. A **glimpse** is a fly-by with no caption and no slowing: a look out at the water on the way.
- The swim carries on. A subject the swim has left well behind (BEHIND, about 103°) ends its fly-by early, after 2.5 s;
  one beside the diver never does. The guide never looks back over the diver's shoulder.
- **The view turns one way at a time:** never out to a subject, back to the way ahead and out again. A test counts the
  reversals on the swim to the helmet (round 8 had 8; now 3, all the course's own bends).
- **The guide's own looks are calm ones:** a turn to a passing animal, or a look round, eases in and out over 3.5 s (a
  fly-by's takes 2), and none starts within 6 s of the view last turning (QUIET). A look round needs 12 calm seconds, so
  on this route it is rare: the scripted fly-bys and glimpses decide where the view goes.

Every stop is approached on the line from its subject, so the diver arrives facing it. The camera starts turning to it
16 m out (9 m at the helmet, so it stays on the nursery until the run in). The visitor's own look always wins (R1, D5).

### 0. Entry: "Show me around" (surface → underwater)

1. The visitor clicks **Show me around** while bobbing in open water.
2. The camera eases in on the diver, and the diver dives in, the view going to first person on the way down.
3. Going under, the view turns to the heart of the reef (the anchor, `exploration.js` REEF_HEART), whatever the surface
   view faced.

### 1. Welcome: drifting in

- The guide drifts in toward the reef at about 0.9 m/s. The camera looks across at the barracuda wheel, the reef rising
  beyond it, and the wreck down to the left.
- The controls are asked for one at a time: W A S D, Space/Shift, C, V. On a phone it's the stick and rise and sink only.
- The welcome is free swimming: moving holds the drift and letting go for 2.5 s picks it up again. Nothing here puts
  the tour on hold or asks to rejoin. Only **Skip** leaves the tour.
- Rising stops 3.5 m below the surface.
- N starts the tour.

### Act 1: across the reef to the helmet

2. **The scooter**, first, on the open-water approach while the reef is still a way off. The fly-by waits up to 7 s for
   the visitor to try E, then the guide runs it.
3. Out west, over the far side of the reef: **a barracuda wheel**, **a pink whipray**, and **the brain coral dome**,
   passed on its east side, where its giant moray looks out of its den (the den faces east). The whipray and the moray
   are under 30 m apart, so the view hands straight across from one to the other.
4. **The coral nursery**, a short pause: the swim all but stops (8% of the cruise) for 7 s while the view rests on the
   trees, the nurse shark asleep beside them.
5. **About: the Helmet** (stop), seen face on: its faceplate looks east, so the stop stands 7 m east of it, and the swim
   comes in on that line with nothing else turning the view.

### Act 2: down to the nautilus (deepest first, as on a real dive)

6. Fly-bys:
   - **The table coral tower**, off to the right across the reef shelf.
   - **The pillar coral cathedral**, seen from its open (west-south-west) front.
   - **A bait ball, ahead**, over the soft coral spire, and **through the bait ball**.
   - Down the deep slope to **the arch**, which now stands on the deep sand east of the lantern garden (`reef.js` ARCH,
     at 20, −83) with its passage running east to west: from its east mouth the garden and the nautilus on its ledge are
     framed in it. The fly-by looks through it at the nautilus and waits up to 7 s for the visitor to try Q.
   - **The lantern garden**, just out of the arch's west mouth.
7. **Experience: the Nautilus** (stop), up on its ledge, seen from 9.5 m to its east, the side its spiral and its
   horseshoe of stone open to.

### Act 3: the way up, the wreck and the line

8. Leaving the nautilus, out to the lip of its ledge: **Look out to sea**, a whale shark crossing out over the deep water
   beyond the drop-off, up and to the right as seen from the nautilus: 16 m out and 9 m above. The swim all but stops
   for it (12% of the cruise, 12 s), and waits up to 8 s if it is late. The look-there marker leaves it to the caption.
9. Up the slope and once round the wreck: **A trawler, bow first** (its bow), **Her working deck** (from out beyond
   the descent line) and **The stern** (the net on the gantry). Then **Projects: the Wreck** (stop), 10 m off its west
   side. The reef's own fish live round it: along both sides
   of its hull, under its bow and aft of its net; the barracuda patrols off its bow.
10. **The ending**: over the top of the wreck to the descent line just beyond it (`return-route.js` DESCENT_LINE), and up
    the line to the résumé's slate, below the safety stop. The choice is **Read it (F)** for the résumé, **Keep
    exploring** or **Surface (N)**.

### 9. Surface (if chosen)

- N, or the Surface button, plays the ascent: to the descent line, the **safety stop** held beside it (hold, or skip with
  Esc), and up by the buoy. **Back to the surface** does the same from anywhere on the reef.
- The old top banner during the ascent ("surfacing early costs nothing") is gone. "Stop complete" stays.
- Back at the surface, the tour is complete.

## Look-there indicators

- A screen-space marker for a subject: a whale, whale shark, orcas, dolphins, or the next landmark.
- **On screen:** a soft bracket or ring on the subject, with a short label ("Whale shark, above").
- **Off screen:** an arrow pinned to the screen edge, pointing the way to turn. It follows the subject as it moves.
- It fades out after the subject has been in view for about 2 s, or when it leaves.
- **Every pass is seen side-on** (round 5): a visitor rises no steeper than 30° over the diver. It swims up to 12 m under
  its band and, if that is not enough, further out (`user-creatures.js` RISE, DEEPEN).
- **Between fly-bys the guide turns to a big animal** passing within its range (whales 100 m, orcas 80 m, the whale shark
  60 m, dolphins 40 m: a little inside the look-there marker's), calmly, and stays on it 9 s; not to the same one again
  within 45 s, and not within 6 s of the view last turning. Not
  one a fly-by ahead is about to show, nor one already behind the diver.
- During the tour, the whale shark is called in for the "Look out to sea" drift on the ascent (`oceanControls.encounter`, with
  its course measured from the drift's point). Natural encounters also get the indicator while the guide is active.
- *"Look, life above."*

## Teaching schedule (each control taught once)

| Control | Where | How |
|---------|-------|-----|
| C, W A S D, Space/Shift, V | Welcome | Key chips, one prompt at a time, each ticked once it's tried |
| F | About, Experience, Projects | "Press F to open it" |
| E (scooter) | The first fly-by, on the open-water approach | The guide runs it: the scooter shows in first person, the pace lifts and ⚡ reads as held and rings. "That's the scooter. Hold E to use it yourself, any time." |
| Q (lamp) | Fly-by through the arch | "It's dark under the arch. Press Q for your lamp." |
| H (photo) | Whale shark drift | "Press H to take a photo of it." On touch, the deck has a camera key. |
| C (computer) | Projects (desktop) | "Press C to check your depth on your dive computer." |
| V (view) | The ending (desktop) | "Press V to see yourself against the reef." |
| G (rejoin) | First takeover | "You have the controls. G to rejoin." |

- **Tried while asked for:** the key chip presses in and a tick draws on beside the control's name, for 1.5 s, before the
  next is asked for. Same press and tick for the welcome's chips, a fly-by's caption (the lamp, the scooter, the camera)
  and a stop's tip. On touch, the deck key flashes too. Reduced motion shows the tick without the animation.
- A hint the visitor has already used is skipped. The guide running the scooter doesn't count as the visitor trying it.
- On touch, the deck key a fly-by teaches rings while its tip shows.

## Copy rules

- One short line per beat, two at most. Use second person and present tense.
- Signpost: "This is where you'll find…". Don't summarise the portfolio in the tour.
- Key hints follow the input in hand (keys on desktop, buttons on touch).
- **Fly-by captions** are a title and one line over a light tint, like the depth gauge. They sit top centre on a desktop, and top
  left under the depth chip on a phone, clear of the compass. While the tour leads on a phone, Back to the surface
  makes way for them.
- **At a stop on a phone**, the camera aims a little below the landmark, so the landmark sits above the middle of the
  screen, clear of the sheet.
- **On a desktop the tour card** sits in the bottom-right corner, see-through with a slight tint like the depth gauge.
- The existing long `lines`/`short` copy on stops is retired from the tour. It stays in the archive.

## Timing budget

- **Round 4:** about 414 m and roughly **150 s of motion**, fly-bys included, since nothing holds between the sites.
  That's down from about 250 s.
- **Round 6:** about 555 m and roughly **200 s**. It takes in the far side of the reef and more of its life. The
  welcome's drift is on top, at the visitor's pace.
- **Round 8:** about 527 m and roughly **196 s**, with the direct leg to the cathedral.
- **Round 7:** about 603 m and roughly **225 s**, plus up to 7 s at each of the scooter and the arch if the visitor
  doesn't try them.
- **Round 5:** about 410 m and roughly **145 s**. The way up ends above the wreck rather than in the shallows, and the
  way down is a little longer round the west of the wreck.
- **Round 10:** about 445 m and roughly **180 s**, plus up to 7 s at each of the scooter and the arch, and up to 8 s
  waiting for the whale shark.
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
- The cathedral fly-by is seen from within 45° of the horseshoe's open side (round 7).
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
- **Round 5, the bait ball** (the owner's note):
  - The swim went past the ball's edge, not through it, for two reasons:
    - The ball wanders up to 2.5 m round its home and tightens to about 2.9 m across as a diver comes near.
    - The planned route turned for the wreck right at the ball's home.
  - Now a fly-by first looks across at the ball and says the swim will go through it. As that fly-by begins, the swim
    lines up on the ball where it is now (`oceanControls.baitBall()`, from `living-world.js`): in short of it, through
    its middle, out the far side, then on. The test checks the swim passes within 1.5 m of the ball's middle, with the
    ball off its home by its full wander.
  - **A latent bug, found on the way:**
    - A route launched mid-frame (any detour, or this line) was judged against the old route's remaining length.
    - A longer new route never beat that figure, so it registered as a stall after 5 s and was replaced by the static
      route.
    - The stall check now skips the frames before the new route takes effect.
- **Round 6: in from open water, the far side of the reef, smooth arrivals** (the owner's notes):
  - **Site defaults:**
    - The surface start is over the deep end, west of the anchor.
    - The field of view is 52° (10% wider).
    - The flashlight starts off.
    - The sky opens in full day, not just before sunrise.
  - **The welcome** drifts in toward the reef while the controls are tried (W A S D, up and down, C, V).
  - **Order:** deepest first, as on a real dive. The anchor and the west side, then the tower, cathedral, arch, lanterns
    and the treasure, then up past the whale shark and the bait ball to the wreck, and out.
  - **Arrivals:**
    - The awkward swing ("left round the subject, then right to face it") came from the planner's bowed approach and a
      5 m turn at the end.
    - Each stop now gets an approach point 8 m back along the line from its subject (`APPROACH`), and the camera's lead
      is 16 m (`travelPath` `lead`).
    - The test checks the last 2.5 s of each leg heads at its subject.
  - **The anchor:**
    - Stops are given their own viewpoint (`view`).
    - Fly-bys can orbit a landmark (`orbit`).
    - Steps and fly-bys are worked out against where things are now, once a leg begins (`legOf`).
  - `tour_version` is now 6.
- **Round 7: one cinematic camera, a free welcome, the cathedral from its front** (the owner's notes):
  - **The start** is further out, beyond the treasure at (−18, −90), and faces the reef.
  - **The welcome** is free swimming. It no longer hands over to a held tour with Rejoin: the visitor swims, the drift
    picks up when they let go, and only Skip leaves.
  - **The camera:**
    - Every switch of subject is an eased pan, 2 s, in and out, one way (`GLANCE_FADE`, `glance(point, follow)`). The
      "left, then right" swing came from the glance snapping to a chase and back.
    - While the guide steers, the view doesn't follow the diver's turns.
    - Back-to-back fly-bys (within 30 m) keep the glance between them.
    - The early fly-bys are framed from further off.
  - **The pink whipray** is followed where it actually is (`residentAt('whipray')`).
  - **The cathedral** is seen from its open front, not over its back wall: the swim comes round west of it first, and
    the whole fly-by stays within about 45° of the open side. A test checks it (the old line was 63° off at worst).
  - **The treasure** is seen from 9 m and 3 m up, not 4 m, so the stop matches the anchor and the fly-bys.
  - **The treasure** draws the camera from 30 m out (`lead`).
  - **Waits:** the scooter and the lamp fly-bys hold for up to 7 s for the visitor's input, then carry on.
  - **Surfacing:** N at the ending surfaces, with the safety stop. The safety-stop banner is gone.
  - **Desktop:** the tour card sits bottom right; it and the captions are see-through with a slight tint.
  - `tour_version` is now 7.
- **Round 7, the owner's follow-up:**
  - **Going under faces the reef:** the dive turns to the anchor as it goes under, whatever the surface view faced. A test
    checks it from three surface headings.
  - **Press and tick:** trying a control the tour is asking for presses its key in and draws a tick on: the welcome's
    chips, the lamp and scooter fly-bys (and the camera), and the stops' tips. CHEER is now 1.5 s.
- **Round 8 (the owner's notes):**
  - **The sites swap:** Experience now lives in the treasure on the deep ledge, and Projects in the wreck. The section ids
    keep their meaning everywhere (records, analytics, colours, found lights); the places swap (`reef.js` LANDMARKS,
    `model-scene.js`'s landmarks and models, `set-pieces.js`, the barracuda's home site, the dive plan, the map markers,
    the site names, deep links `#treasure` and `#wreck`, and the tour's stops). `tour_version` is now 8.
  - **The chest opens first:** pressing F at a chest (or Read it on the tour) swings its lid up (1.97 s) before the
    records open; with reduced motion they open at once (`landmark-interactions.js` LID_WAIT, `oceanLandmarks.openSite`).
  - **Tower to cathedral:** a direct descent to the cathedral's open front replaces the loop round its back, about 75 m and
    20 s shorter. It passes 8.5 m off the barracuda's beat (it bolts only inside 6 m) and over the rock in front of the
    cathedral.
  - **No looking back:** a fly-by's subject left behind is let go and the view turns to the way ahead (the cathedral was
    watched over the shoulder all the way down to the arch). On a calm stretch the view looks round now and then.
  - **Orcas and whales** are turned to at the look-there marker's range, not 40 m, so a passing pod is not missed.
  - **Sound** (PR 32) is on by default; the browser still holds it until the visitor's first click or key.
- **Round 9 (the owner's notes on round 8):**
  - **The camera is round 7's again, with round 8's additions refined.** Round 8 cut fly-bys short and let go of the view
    between them whenever a subject was off to the side, so the swim to the anchor went subject, way ahead, subject, way
    ahead: left, right, left, right. Now only a subject truly behind is let go, and the view hands one subject to the next
    in one pan. A test counts the reversals.
  - **Big animals:** turned to calmly (3.5 s), held 9 s rather than 5, and not within 6 s of the last turn.
  - **The opening:** the scooter is demonstrated first, on the long open-water approach. Then out to the right of the
    anchor, with the barracuda wheel on the left, over the whipray and past the brain coral, and round to the anchor. The
    grotto fly-by is gone, to leave room between the others.
  - **Down to the arch:** one glimpse out into the deep blue instead of the gully floor all the way.
  - `glance()` takes an optional fade (`exploration.js`), so the guide's own looks are slower than a fly-by's.
  - `tour_version` is now 9.
- **Round 10 (the owner's notes on the naturalist landmarks, Nov 2026):**
  - **The new landmarks in the tour.** The brain coral is passed on the moray's side; the coral nursery is a short pause;
    the helmet is seen face on (its stop used to line the nurse shark up behind it, which put the diver at its back once
    the shark moved to the nursery).
  - **The arch moved and turned.** It stands on the deep sand below the old gully, its passage east to west, so the
    nautilus is framed in it. The gully stays, kept clear of reef as before.
  - **The whale shark on the way up.** It crosses ahead, on a straight course (a guided course no longer takes the random
    bow that could bring it 26 m nearer or further than planned), and the fly-by waits for it rather than being skipped
    when it is late. The look-there arrow no longer shows before the caption.
  - **The bait ball** is now on the way down, between the cathedral and the arch; the open-water glimpse is gone.
  - **The ending** is at the descent line, where the résumé hangs; F reads it.
  - **The card** is glass over the water with square-cornered keys, and lower on a phone.
  - `tour_version` is now 10, and the ending's key is `descent-line`.
- **Round 11 (the owner's notes on round 10):**
  - **The whale shark** crosses out over the deep water as the swim leaves the nautilus, up and to the right, rather than
    low against the slope to the left. A fly-by that begins as its leg sets off calls its animal in then.
  - **The descent line** hangs just east of the wreck. The tour goes over the top of the wreck to it and up it to the
    résumé; every ascent comes back to it for the safety stop and surfaces by its buoy (`planSurfaceReturn`, which used
    to stop over the middle of the reef). The barracuda's beat moved off the wreck's bow to make room.
  - **Fish:** the nautilus's and the line's made-up fish are now the reef's own species (the nursery keeps its chromis,
    which its reveal uses). The wreck's fish live round it, not over it: they used to be lifted over the 9.5 m block the
    animals treat the wreck as. Whitetips patrol and rest by the nautilus.
  - **Dive log:** a site counts as reached only when the diver is down at it. The dive starts on the surface right above
    the nautilus, which was logged as reached at 0:00 and 5 m, so its real visit never was.
  - `tour_version` is now 11.
- **Round 12 (the owner's notes on round 11):**
  - **A card on each site** (`site-cards.js`): a snapshot of the place (`assets/portfolio/sites/`), its name and depth,
    what is inside, Read it, and Continue while the tour waits there. It stands over the site, or beside it close up,
    and follows it on screen; it comes up when the site is pointed at (the cursor, or the crosshair while aiming), in
    reach, or at a tour stop, and lingers 8 s once none of those holds. It replaces the bottom prompt and the Here card
    for that site; at a tour stop the sheet folds to its row while the card is up.
  - **Swim about at a site:** at a stop or the ending, swimming no longer takes the tour off; the visitor may swim within
    18 m of the site (`exploration.js` leash) and Read it or Continue from wherever they are.
  - **The wreck:** once round it before the stop, which is now 10 m off; its collision follows the hull slab by slab, with
    its bulwarks, wheelhouse, funnel, mast, gantry, net drum and winch; its foredeck runs to the stem. The barracuda moved
    further off the bow.
  - **Teaching:** the guide runs the scooter through the bait ball, and switches the lamp on under the arch if the visitor
    has not (off again at the nautilus).
  - **Fish:** a cloud fish eases onto the ground under it rather than snapping, which made the chromis over the
    nautilus's stones jitter.

- **Round 13 (the owner's notes on round 12):**
  - **The view is the guide's, not the swim's.** A subject still close by (under 22 m, `NEAR_HOLD`) stays in view when
    its fly-by's time is up, however the swim turns, and is let go only once the swim leaves it abeam, or, looking a
    little way along the route, is about to turn away from it, so the view is never left looking back over the shoulder.
    A fly-by may `stay` on its subject to the end of its leg.
  - **The wreck:** once round her without a caption: in at the bow, down the starboard side, round the stern and up the
    port side to the stop, the view on her all the way; the stop faces her port side, where her card comes up.
  - **Read it** keeps the page as it is with a card up while the site's reveal plays and its panel opens; dropping the
    card's state had shown the bottom prompt, the labels and the tour's sheet for a moment.
  - **Surfacing:** the scene is drawn at the full pace while the view glides (the ascent, the safety-stop framing, the
    landing at the surface, a landmark's reveal), whatever panel is up; the 15 fps a panel allowed, and the 30 fps of an
    idle surface, moved the camera in visible steps.
  - **The nautilus's fish** keep to the open sand off the shell's east face, clear of the shell and of the stones of its
    alcove, which they used to rise over and sink off as they went round; the whitetip circles the ledge at one depth
    above the stones instead of a set height over the bottom.
- **Round 14 (the owner's notes on round 13):**
  - **Surface at the ending:** the résumé's card carries Surface beside Read it. On a phone the docked card hides the
    tour's sheet, so once the résumé was closed there was no way up from the card.
  - **The wreck** is circled a quarter faster than the cruise and a little closer in (about 17 s round), and her card is
    up all the way round: on the way in to any site, within 24 m of it and with no caption up, the site may be read
    (`nearing`); reading holds the swim, and closing the page lets it go on. A fly-by's `slow` may now be up to 1.4.
  - **The nautilus's fish** are off its stage: anthias at the north end of its ledge and chromis at the south, about
    10 m from the shell, outside its alcove and the shark's beat.
- **Round 15 (the owner's notes on round 14):**
  - **Site cards stay put:** a card is a thing in the water at one spot over its site, turned to face the view, drawn
    smaller further off and placed in the same frame the scene is drawn (`oceanControls.onDraw`). It no longer chooses
    between places on screen (it jumped between them) and no longer docks on a phone. Look away and it is out of sight;
    look back while it lingers and it is where it was. Close under a site it is drawn smaller to keep its place (down to
    80%) before it slides down to stay on screen. The layout check treats it as part of the scene (`data-anchored`).
  - **The barracuda wheel** is passed on its reef side, on the heading the swim sets out on, instead of out round its
    far side facing the open sea; the whipray is seen from the same side.
- **Round 16 (the owner's notes on round 15):**
  - **The highlight is on the bottom:** the circle drawn over a pointed-at site on the screen is gone. Instead the site's
    beacon (set-pieces.js) lights a soft pool on the bottom under it and a pulsing ring round its foot (the helmet's
    plinth, the nautilus's alcove, the wreck's hull; for the résumé, a ring round the line under the slate) while it is
    pointed at or its card is up.
  - **Cards up close only:** a site's card comes up only within 8 m of the site itself (measured to its extent: the
    wreck's from bow to stern), and is gone again beyond it.
- **Round 17 (the owner's notes on round 16):**
  - **The wreck's aura** is drawn out along her hull and under it, an oval about 18 by 8 m, not a circle round all of her.
  - **Aura circles** (Settings, Lighting): how bright the rings and glow under the landmarks are, 0–150%; 0 turns them off.
  - The wreck's card stands lower (3.6 m over her middle) and stays up with its anchor a little over the top of the screen,
    so it comes up at her stop, close under her side.
  - **Cards looked down on:** the card's anchor is over its site on the screen, not only in the water: the steeper the
    look down at the site, the lower the anchor (to 12% of its height straight down), so looking down on the wreck from
    close over her its card stands over her middle instead of off to one side. Cards are placed on the canvas's own
    rectangle, which on a phone can differ from the window's inner size as the browser's bars come and go.
  - **The wreck's aura is fitted to her hull** once she is built (set-pieces.js fitHull): the middle, heading and length of
    her collision slabs, the ring 0.9 m outside them. Laid out from her charted spot and a guessed heading, it stood about
    3 m off to one side of her.
