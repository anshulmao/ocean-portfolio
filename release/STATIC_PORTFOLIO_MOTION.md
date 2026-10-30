# Static portfolio motion

Review basis: LottieFiles [motion-design skill](https://github.com/LottieFiles/motion-design-skill), installed at the user's request.

## Direction

The target is calm curiosity, with a professional UI motion personality. The motion supports the ocean palette, glass surfaces, and clear reading order.

- Signature curve: `cubic-bezier(.2,0,0,1)`.
- Durations: 100 ms for feedback, 240 ms for standard transitions, 480 ms for the hero entrance.
- Entrances use a decelerating curve. The headline leads the summary, actions, and ocean image. The largest delay is 160 ms.
- Scroll reveals use eased movement of 16 px or less and settle early. Text remains visible throughout the reveal.
- Press feedback lasts 100 ms. Hover feedback starts within 100 ms, and the release uses the standard duration.
- The ocean image has one subtle light pass. It ends after 4.3 seconds and never loops.
- Phone layouts reduce motion distance and duration. Touch devices do not keep hover displacement.
- Reduced-motion settings remove animation and spatial transitions. Content, links, and native disclosure controls remain available without JavaScript.

The work affects the static reading pages. The guided dive has a separate implementation and review.
