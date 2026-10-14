// A transition-only waterline cue. No render loop, textures or scene captures.
export function createWaterlineCrossingGate() {
  let active = false, origin = 0, fired = false;
  return {
    update({ cameraY, transition = false }) {
      if (!transition || !Number.isFinite(cameraY)) {
        active = false; origin = 0; fired = false; return null;
      }
      if (!active) { active = true; origin = Math.sign(cameraY); fired = false; }
      // A tiny deadband rejects waterline jitter; only one splash per journey.
      if (!origin && Math.abs(cameraY) > .12) origin = Math.sign(cameraY);
      if (fired || !origin || cameraY * origin > -.04) return null;
      fired = true;
      return origin > 0 ? 'in' : 'out';
    },
    reset() { active = false; origin = 0; fired = false; },
  };
}

export function createWaterlineSplash({ parent = document.body, reducedMotion } = {}) {
  const doc = parent.ownerDocument || document;
  const stylesheet = doc.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./waterline-splash.css', import.meta.url).href;
  doc.head.append(stylesheet);
  const root = doc.createElement('div');
  root.className = 'waterline-splash'; root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '<div class="waterline-splash__film"></div><div class="waterline-splash__rim"></div>' +
    Array.from({ length: 12 }, (_, i) => `<i class="waterline-splash__drop" style="--x:${[7,17,28,39,61,73,86,94,13,83,32,66][i]}%;--y:${[18,66,35,84,21,73,38,80,46,14,9,91][i]}%;--size:${[12,7,10,6,9,14,8,5,5,6,4,8][i]}px;--delay:${(i % 4) * 20}ms"></i>`).join('');
  parent.append(root);
  const gate = createWaterlineCrossingGate();
  let timer = null, disposed = false, count = 0, direction = null;
  const prefersReduced = () => reducedMotion ?? globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  function finish() {
    root.hidden = true;
    root.classList.remove('waterline-splash--active');
    if (timer !== null) { clearTimeout(timer); timer = null; }
  }
  function trigger(nextDirection = 'in') {
    if (disposed || timer !== null) return false;
    direction = nextDirection === 'out' ? 'out' : 'in'; count++;
    root.dataset.direction = direction;
    root.classList.toggle('waterline-splash--reduced', Boolean(prefersReduced()));
    root.hidden = false;
    root.classList.add('waterline-splash--active');
    timer = setTimeout(finish, prefersReduced() ? 220 : 620);
    return true;
  }
  return {
    trigger,
    update(state) {
      if (disposed) return;
      if (typeof state.reducedMotion === 'boolean') reducedMotion = state.reducedMotion;
      const crossing = gate.update(state);
      if (crossing) trigger(crossing);
    },
    diagnostics: () => ({ active: timer !== null, count, direction, reducedMotion: Boolean(prefersReduced()) }),
    dispose() { disposed = true; finish(); gate.reset(); root.remove(); stylesheet.remove(); },
  };
}
