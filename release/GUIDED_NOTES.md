# Guided dive notes

This implements the supplied Career → My Portfolio notes about the scripted whale-shark pan, skipping a tutorial already attempted, better guided routes, and clearer guided messages (the “10X guided dive” group).

## Behavior and presentation

- A scripted animal encounter owns its complete authored hold. The whale shark keeps its nine-second shot even if it swims behind the diver or another fly-by becomes reachable. Ambient creatures cannot replace it. Manual look, swimming takeover, Pause and Skip remain available.
- The browser stores one local flag when the welcome is actually reached. An interrupted first attempt counts. On a later explicitly started tour, the guide shows a short welcome with Continue and “Try the controls again”; control prompts and waits are skipped. Replay restores the lesson. Visiting or reloading the site never starts a tour. Storage denial falls back to a working first-visit lesson.
- Checked detours prefer gentler heading changes over grid zigzags. The existing collision, seabed, scenic waypoint and manual rejoin checks remain intact. The approved sites and sequence are retained; the unmerged naturalist-landmark/guided-rework branches depend on different world geometry and were not imported.
- Messages use an opaque night-colored field note, readable type, one subject and one optional control hint. The sheet's primary action has clearer contrast. Existing Outfit typography, palette and layout zones remain. No new images, motion library or runtime dependency.
- Coarse-pointer guide semantics include tablets. Full tablet sheet placement and touch-deck clearance depend on the companion responsive UI PR's existing layout-token and stylesheet changes; merge that PR first or together.

## Verification

`node tools/test-guided-motion.mjs` passes the real planner/swim integrator at 30, 60 and 120 Hz, collision detours, complete scenic route order, pauses, takeover/rejoin, keyboard commands, free look and reduced-motion fades. New cases force the whale behind the body alongside incidental orcas/dolphins, then verify its full exclusive hold; interrupted tutorial persistence, replay and storage denial are also covered. Restoring the old unprotected-shot behavior fails the new assertion: the camera advances to `bait-ahead` instead of retaining `whale-shark`. The mutation was restored.

`npm test` passes the service and explicit unit suites. The production build passes. `node tools/test-guided-return-browser.mjs` passes in Edge at 1440×900 with full motion and 390×844 with the effective reduced-motion setting: first attempt, interrupted reload, explicit start, hidden repeat teaching, replay, keyboard Skip/Pause, reduced-motion arrival and no script errors. This regression is wired into CI as “Guided return and replay”. Generated screenshots are under `.taste-skill/guided-return/` and uploaded with the browser artifacts.

Screenshot review: the ocean remains the dominant view; the field note is readable against both bright water and the reef. Phone return actions fit in one row and the sheet clears the controls. The returning welcome has no redundant More toggle. Scoped visual assessment: design 7.4, usability 7.8, creativity 7.8, content 7.5 (overall 7.6); the creative content is the existing live reef, not new decoration. Remaining limits: physical touch hardware and Safari/WebKit are unmeasured; the wider responsive matrix belongs to the companion PR. The general page inspector is not a substitute for these canvas-state checks.

## Phone welcome correction

The PR's full phone-layout run reproduced one failure: the first lesson covered 14% of the central viewing area against the unchanged 12% limit; the other 13 states passed. Compact portrait spacing around the noninteractive control chips and actions now recovers 14px of height. The instructions remain 14px, the chips 13px and every button retains its 44px target. Returning welcomes, expanded More reading and short landscape arrangements are unchanged.

After a production rebuild, all 14 phone states pass `npm run test:layout -- --only=phone`, with the welcome covering 8% of the middle. The before/after screenshots and reports are in `.taste-skill/welcome-before/` and `.taste-skill/welcome-after/`; both welcome images were visually reviewed. No assertions or coverage limits changed.
