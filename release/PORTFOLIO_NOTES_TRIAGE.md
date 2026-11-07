# Portfolio notes — 7 November 2026

Source: the two supplied screenshots of Todoist's Career / Portfolio & positioning section. Only visible notes were transcribed; collapsed or off-screen notes were not inferred. The section's count of 18 does not mean these screenshots show all 18 tasks. Todoist was unavailable, so its records have not been edited or completed.

| Feature group | Visible notes | Decision |
| --- | --- | --- |
| Guided dive | Whale-shark pan must retain priority; skip a tutorial already attempted; “10X guided dive”; better routes; improve message design/presentation | Protect the scripted encounter's full hold, remember the first controls attempt locally, offer replay, prefer broad detours and improve readable field-note captions. Keep the existing reef and authored sequence. |
| Responsive touch UI | Mobile UI on bigger screens overlaps | Extend the existing compact HUD to tablets, reserve actual touch-deck height and place the landscape guide between the thumb zones. Add tablet profiles to the existing layout gate. |
| Sky and astronomy | Redder low Sun; guided sky viewer; actual night sky with real stars | Reuse the existing Yale bright-star catalogue and Astronomy Engine transforms. Add a guided clear-night preview with visible targets, fitted camera framing and reversible time/weather. Make the Sun's disc smaller and progressively warmer near the horizon; preserve the existing directional twilight sky. |
| Ocean sound and wildlife | Rain should sound better; better whale | Replace pitched short-loop rain with independent stereo spray and wet impacts. Give the right whale long glides, a body pitch following its vertical arc and low authored contact calls. Preserve its model and safe route. |
| Personal constellation photographs | Add my pictures of constellations | Await actual photographs. The supplied JPEGs are task screenshots. No stock photos, invented personal images or empty public placeholders are added. |

“10X” is treated as a quality goal, not a literal speed multiplier. Existing astronomy, recent UI work and the open naturalist-landmark PRs are retained. These changes do not merge those separate landmark proposals or deploy production.

Suggested merge order: responsive touch layout, guided dive, ocean sound/wildlife, then sky viewer. Each feature has its own branch and PR; the combined version is also checked before delivery.

## Tablet evidence

Base: `eec12ea`. The new 768×1024 touch profile failed 11 of 14 visitor states on the unmodified base: controls covered the guide and Ahead card; map and reading actions were too small. The same profile passes all 14 states after the fix. The 1024×768 profile initially exposed excessive central coverage from a full-width sheet; placing that sheet low between the thumb zones fixes it without relaxing the existing limits.

- [Before](tablet-layout/before.png)
- [After, portrait](tablet-layout/after.png)
- [After, landscape](tablet-layout/landscape.png)

The established type, palette, world imagery and desktop layout are preserved. All images above are captures of this repository's own scene. No new external imagery or sample content is introduced.

## Visual review

ROUND 1

Seen in one second: the reef, then a compact guide above the swim controls.

Idea (one sentence): keep the water open and place information where a thumb cannot cover it.

Live thing: steer the diver while reading or collapsing the guide.

Layout words by section: instruments=top corners / portrait guide=bottom sheet / landscape guide=between thumb zones.

Scores: design 7 · usability 8 · creativity 7 · content 8 → overall 7.4.

Caps applied: no whole-page redesign score is claimed; existing ocean instrument conventions are preserved.

Top three problems and fixes:

1. `before.png`: the right-hand keys cover the welcome copy. Reserve the actual deck height.
2. The initial landscape capture puts 18% of the central scene behind the guide. Move the guide down between the thumb zones; keep the 12% coverage limit.
3. The tablet archive/map use mouse-sized targets. Use the existing compact map and 44px reading actions on coarse pointers.

Remaining limits: automated Chromium/Edge viewports do not establish real iPad/Safari behavior or physical touch performance.
