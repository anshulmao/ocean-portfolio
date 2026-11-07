// A right whale keeps its momentum between fluke strokes. A long glide reads
// differently from a fish's constant tail beat. The same slow arc supplies the
// vertical position and its tangent, so the animal noses into a rise or descent
// instead of translating up and down with a level body.
export function whaleCruise(seconds, phase = 0, speed = 2.4, out = {}) {
  const time = Number.isFinite(seconds) ? seconds : 0;
  const offset = Number.isFinite(phase) ? phase : 0;
  const velocity = Number.isFinite(speed) ? Math.max(.1, speed) : 2.4;
  const angle = time * .14 + offset;
  out.heave = Math.sin(angle) * 1.25;
  out.pitch = Math.atan2(Math.cos(angle) * 1.25 * .14, velocity);
  out.roll = Math.sin(angle * .63) * .018;
  const cycle = ((time / 26 + offset / (Math.PI * 2)) % 1 + 1) % 1;
  out.clip = cycle >= .55 && cycle < .86 ? 'idle' : 'swim';
  return out;
}
