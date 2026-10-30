# Sky screenshots

Before/after sheets for the sky work, from `tools/sky-shots.mjs` (clock set through the time scrubber and held,
weather clear, frame loop paused and the world stepped by hand, desktop 960x600 unless named).

- `bluer-surface.jpg`: the surface view a visitor meets, 07:30 to 18:55 Kuala Lumpur time
- `bluer-up.jpg`: the same place looking 35 degrees higher, interface hidden
- `bluer-under.jpg`: six metres down, looking up at the underside and Snell's window
- `bluer-phone.jpg`: the surface on a 390x844 phone at 12:30

Regenerate (after `npm run build`; the "before" run serves a copy of the main build):

    node tools/sky-shots.mjs --dist <main build> --label before --times 07:30,10:00,12:30,16:00,18:10,18:55
    node tools/sky-shots.mjs --label after --times 07:30,10:00,12:30,16:00,18:10,18:55
