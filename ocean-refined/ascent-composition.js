// Keep the swimming composition throughout the return and safety stop. Start
// the waterline reveal at the actual departure depth, including shallow returns.
export function createAscentComposition() {
  let riseDepth = null;
  return {
    update(nav, depth) {
      if (nav.mode !== 'transition' || nav.returning || nav.returnPhase === 'offer' || nav.returnPhase === 'stop') {
        riseDepth = null;
        return 0;
      }
      riseDepth ??= Math.max(.025, Math.min(8, depth));
      const t = Math.max(0, Math.min(1, 1 - depth / riseDepth));
      return t * t * t * (t * (t * 6 - 15) + 10);
    }
  };
}
