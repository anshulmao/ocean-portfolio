// Motion is declared in motion.css. This module only mirrors one piece of scene
// state the stylesheet cannot see: which atlas destination was last chosen, so
// its marker and legend entry can hold a selected state. Event-driven; no loops.
const buttons = selector => [...document.querySelectorAll(`${selector} button`)];
document.addEventListener('click', event => {
  const target = event.target.closest?.('#map-chart button, #map-legend button, #reset-view, #dive');
  if (!target) return;
  const markers = buttons('#map-chart'), legend = buttons('#map-legend');
  const group = target.closest('#map-chart') ? markers : target.closest('#map-legend') ? legend : null;
  // The scene only accepts a destination while submerged; reset and dive clear it.
  if (group && document.body.dataset.submerged !== 'true') return;
  const chosen = group ? group.indexOf(target) : -1;
  for (const list of [markers, legend]) list.forEach((node, index) => {
    if (index === chosen) node.dataset.selected = 'true'; else delete node.dataset.selected;
  });
});
