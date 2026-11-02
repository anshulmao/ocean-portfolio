// Reef labels are centred on x and hang above y. Use their rendered dimensions:
// font, copy and phone layout changes can all make the old 150×44 estimate wrong.
export function labelOverlaps(x, y, width, height, rect) {
  return x + width / 2 > rect.left && x - width / 2 < rect.right &&
    y > rect.top && y - height < rect.bottom;
}
