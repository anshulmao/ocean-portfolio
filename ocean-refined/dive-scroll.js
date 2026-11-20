// Keep the reading site's depth gauge in sync when CSS scroll timelines are
// unavailable or the visitor has requested reduced motion.
const gauge = document.querySelector('.dv-gauge');
if (gauge) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const supportsScrollTimeline = CSS.supports('animation-timeline: scroll(root)');

  if (!supportsScrollTimeline || reducedMotion.matches) {
    document.documentElement.classList.add('dv-scroll-fallback');

    const readout = gauge.querySelector('.dv-gauge-value');
    const fill = gauge.querySelector('.dv-gauge-rail i');
    let frame = 0;

    const update = () => {
      frame = 0;
      const root = document.scrollingElement;
      const range = root.scrollHeight - root.clientHeight;
      const progress = range > 0 ? Math.min(1, Math.max(0, root.scrollTop / range)) : 0;
      readout.textContent = String(Math.round(progress * 40)).padStart(2, '0');
      fill.style.setProperty('--gauge-progress', progress);
    };

    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    addEventListener('scroll', scheduleUpdate, {passive: true});
    addEventListener('resize', scheduleUpdate, {passive: true});
    reducedMotion.addEventListener?.('change', ({matches}) => {
      document.documentElement.classList.toggle('dv-scroll-fallback', matches || !supportsScrollTimeline);
      scheduleUpdate();
    });
    update();
  }
}
