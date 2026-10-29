import * as THREE from './vendor/three.module.min.js';

// "Look there" (release/guided-dive/SPEC.md): a marker on an animal worth turning for. On screen it rings the animal
// and names it; off screen it is an arrow pinned to the edge, pointing the way to turn, and it follows the animal as it
// swims. One marker, one subject at a time: guided-dive.js decides which, and when it has been seen.
const EDGE_X = .9, EDGE_Y = .82;
const node = document.createElement('div');
node.className = 'look-there'; node.dataset.show = 'false'; node.setAttribute('aria-hidden', 'true');
node.innerHTML = '<i></i><span></span>';
document.body.append(node);
const label = node.querySelector('span'), at = new THREE.Vector3(), local = new THREE.Vector3();
let shownLabel = '', shown = false;

// Points at `subject` ([x, y, z]) with `text`, or hides with null. Returns whether the subject is on screen.
export function pointAt(camera, subject, text = '') {
  if (!subject || !camera) { if (shown) { shown = false; node.dataset.show = 'false'; } return false; }
  at.fromArray(subject);
  local.copy(at).applyMatrix4(camera.matrixWorldInverse);
  const behind = local.z > 0;
  at.project(camera);
  // Behind the camera the projection mirrors: flip it, so the arrow still points the short way round.
  let x = behind ? -at.x : at.x, y = behind ? -at.y : at.y;
  const onScreen = !behind && Math.abs(x) < EDGE_X && Math.abs(y) < EDGE_Y;
  if (!onScreen) { const reach = Math.max(Math.abs(x) / EDGE_X, Math.abs(y) / EDGE_Y, 1e-6); x /= reach; y /= reach; }
  const left = (x * .5 + .5) * innerWidth, top = (-y * .5 + .5) * innerHeight;
  node.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
  node.style.setProperty('--turn', `${(Math.atan2(-y, x) * 180 / Math.PI + 45).toFixed(1)}deg`);
  node.dataset.edge = String(!onScreen); node.dataset.side = x > .3 ? 'left' : 'right';
  if (text !== shownLabel) { shownLabel = text; label.textContent = text; }
  if (!shown) { shown = true; node.dataset.show = 'true'; }
  return onScreen;
}
