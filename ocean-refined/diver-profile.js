// The diver at the surface is Anshul. Pointing at them (the cursor, or the crosshair while looking around) lights
// them up a little; a click or a tap opens a short profile card over their head. The light is two uniforms the diver's
// materials already have (ocean-look.js: the rim and the flat glow), so no shader is rebuilt for it.
import * as THREE from './vendor/three.module.min.js';
import { PORTFOLIO_CONTENT, PORTFOLIO_MEDIA } from './portfolio-content.js';

// How much rim light and lift the highlight adds at full strength, and how fast it comes and goes (1/s).
const RIM_LIFT = 1.15, GLOW_LIFT = new THREE.Color(.1, .2, .21), EASE = 9;
// The hit box is the rig's own bounds, a little larger (in the rig's units, about a metre to the head) so the head and
// shoulders are easy to point at. Anything under the waterline (the diver's root sits at the wave height, world.js)
// does not count: that is water on screen.
const PAD = .1, BELOW_WATER = .08;
// The card keeps this far from the screen's edges and this far above the diver's head (px).
const EDGE = 12, LIFT = 18;

export function createDiverProfile({ diver, camera, canvas, glow, available, setInterfaceOpen, open: openSection, reducedMotion, wake }) {
  const about = PORTFOLIO_CONTENT.about.entries.find(entry => entry.id === 'overview') || {};
  const portrait = PORTFOLIO_MEDIA.overview || {};
  const fullName = portrait.caption || about.name || 'Anshul';
  const links = about.links || [];

  const card = document.createElement('section');
  card.id = 'diver-profile'; card.className = 'diver-profile'; card.hidden = true; card.tabIndex = -1;
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-labelledby', 'diver-profile-name');
  card.innerHTML = `<button type="button" class="diver-profile-close" aria-label="Close the profile"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
  <header class="diver-profile-head"><img alt="" width="72" height="72" decoding="async"><div><p class="diver-profile-kicker">Hi, I’m</p><h2 id="diver-profile-name"></h2><p class="diver-profile-role"></p><p class="diver-profile-base"></p></div></header>
  <p class="diver-profile-body"></p>
  <p class="diver-profile-note"></p>
  <footer class="diver-profile-actions"><button type="button" class="diver-profile-more" data-section="profile">More about me <span aria-hidden="true">→</span></button><button type="button" class="diver-profile-resume" data-section="resume">Résumé</button><span class="diver-profile-links"></span></footer>
  <i class="diver-profile-tail" aria-hidden="true"></i>`;
  card.querySelector('h2').textContent = fullName;
  card.querySelector('.diver-profile-role').textContent = about.role || '';
  card.querySelector('.diver-profile-base').textContent = about.base || '';
  card.querySelector('.diver-profile-body').textContent = about.body?.[0] || about.summary || '';
  card.querySelector('.diver-profile-note').textContent = about.body?.[1] || '';
  const linkRow = card.querySelector('.diver-profile-links');
  for (const link of links) {
    const a = document.createElement('a');
    a.href = link.url; a.textContent = link.label;
    if (!link.url.startsWith('mailto:')) { a.target = '_blank'; a.rel = 'noopener'; }
    linkRow.append(a);
  }
  // A small label over the diver while they are pointed at, so the click has a promise.
  const hint = document.createElement('div');
  hint.className = 'diver-profile-hint'; hint.hidden = true; hint.setAttribute('aria-hidden', 'true');
  hint.textContent = 'Say hi to Anshul';
  document.body.append(card, hint);

  // The materials whose rim and glow carry the highlight, with the rim each started with.
  const lit = new Map();
  const collect = material => { const own = material?.userData?.lookUniforms; if (own && !lit.has(own)) lit.set(own, own.uLookRim.value); };
  diver.root.traverse(node => { for (const material of [].concat(node.material || [])) collect(material); });
  for (const material of Object.values(diver.materials || {})) collect(material);

  // The rig's bounds in its own frame, measured once (in the bind pose: close enough to point at).
  const bounds = new THREE.Box3(), target = new THREE.Box3(), part = new THREE.Box3(), toLocal = new THREE.Matrix4(), relative = new THREE.Matrix4();
  function measure() {
    diver.root.updateMatrixWorld(true);
    toLocal.copy(diver.root.matrixWorld).invert();
    bounds.makeEmpty();
    diver.root.traverse(node => {
      if (!node.isMesh || !node.geometry) return;
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      bounds.union(part.copy(node.geometry.boundingBox).applyMatrix4(relative.multiplyMatrices(toLocal, node.matrixWorld)));
    });
    target.copy(bounds).expandByScalar(PAD);
  }
  measure();

  const ray = new THREE.Ray(), hit = new THREE.Vector3(), head = new THREE.Vector3(), ndc = new THREE.Vector3();
  // Is the diver under this point of the screen (client pixels)?
  function over(x, y) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    ray.origin.setFromMatrixPosition(camera.matrixWorld);
    ray.direction.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1, .5).unproject(camera).sub(ray.origin).normalize();
    ray.applyMatrix4(toLocal.copy(diver.root.matrixWorld).invert());
    if (!ray.intersectBox(target, hit)) return false;
    return hit.applyMatrix4(diver.root.matrixWorld).y > diver.root.position.y - BELOW_WATER;
  }

  let ceiling = EDGE, pointer = null, hovered = false, shown = false, amount = 0, lifted = false, time = 0, returnFocus = null;
  const locked = () => document.pointerLockElement === canvas;
  const centre = () => { const rect = canvas.getBoundingClientRect(); return [rect.left + rect.width / 2, rect.top + rect.height / 2]; };
  // The hit test runs in update(): with the ocean paused the frames stop, so a move or a leave asks for one.
  canvas.addEventListener('pointermove', event => { pointer = event.pointerType === 'mouse' && !locked() ? [event.clientX, event.clientY] : null; wake(); }, { passive: true });
  canvas.addEventListener('pointerleave', () => { pointer = null; wake(); }, { passive: true });
  // Ahead of exploration.js's own pointerdown on the canvas (which takes the mouse to look around, or starts a look drag
  // on touch): a press on the diver is kept from it, and the click that ends the press opens the card. Opening on the
  // press itself put the card under a finger whose click was still to come, and that click landed on the card.
  let press = null;
  document.addEventListener('pointerdown', event => {
    press = null;
    if (event.target !== canvas || !available() || event.button > 0) return;
    const [x, y] = locked() ? centre() : [event.clientX, event.clientY];
    if (!over(x, y)) return;
    event.stopPropagation(); event.preventDefault();
    press = { x: event.clientX, y: event.clientY, at: performance.now() };
  }, { capture: true });
  canvas.addEventListener('click', event => {
    const pressed = press; press = null;
    if (!pressed || performance.now() - pressed.at > 800) return;
    if (!locked() && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 14) return;
    open();
  });
  // A press anywhere else closes it; so does Escape.
  document.addEventListener('pointerdown', event => { if (shown && !card.contains(event.target) && event.target !== canvas) close(false); }, { capture: true });
  canvas.addEventListener('pointerdown', () => { if (shown) close(false); });
  // Ahead of every other Escape (hud.js opens Settings on one, exploration.js asks for a recapture): this one only closes the card.
  addEventListener('keydown', event => { if (shown && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); } }, { capture: true });
  card.querySelector('.diver-profile-close').addEventListener('click', () => close());
  for (const button of card.querySelectorAll('[data-section]')) button.addEventListener('click', () => { close(false); openSection(button.dataset.section); });

  function open() {
    if (shown) return true;
    if (!available()) return false;
    const img = card.querySelector('img');
    if (!img.getAttribute('src') && portrait.src) { img.src = portrait.src; img.alt = portrait.alt || ''; }
    returnFocus = document.activeElement;
    // Under the masthead where there is room for it there (it stays over the diver's head otherwise).
    ceiling = Math.max(EDGE, (document.querySelector('.masthead')?.getBoundingClientRect().bottom ?? 0) + 8);
    shown = true; card.hidden = false; hint.hidden = true;
    document.body.dataset.profile = 'open';
    setInterfaceOpen(true);
    place();
    card.focus({ preventScroll: true });
    wake();
    return true;
  }
  function close(restore = true) {
    if (!shown) return;
    shown = false; card.hidden = true;
    delete document.body.dataset.profile;
    setInterfaceOpen(false);
    if (restore && returnFocus?.isConnected && returnFocus !== document.body) returnFocus.focus({ preventScroll: true });
    else if (restore) canvas.focus({ preventScroll: true });
    returnFocus = null;
    wake();
  }

  // A point on the diver's centre line, on screen: by default just over the head; share 0 is the bottom of the rig.
  function anchor(share = 1) {
    head.set((bounds.min.x + bounds.max.x) / 2, THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, share), (bounds.min.z + bounds.max.z) / 2).applyMatrix4(diver.root.matrixWorld);
    ndc.copy(head).project(camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (ndc.x + 1) / 2 * rect.width, y: rect.top + (1 - ndc.y) / 2 * rect.height, behind: ndc.z > 1 };
  }
  function place() {
    const { x, y } = anchor(), width = card.offsetWidth, height = card.offsetHeight;
    const left = Math.min(Math.max(EDGE, x - width / 2), innerWidth - width - EDGE);
    const top = Math.min(Math.max(ceiling, y - LIFT - height), innerHeight - height - EDGE);
    card.style.translate = `${Math.round(left)}px ${Math.round(top)}px`;
    // The tail points at the head while the card sits above it, and hides when the card had to be pushed down onto it.
    card.style.setProperty('--tail', `${Math.round(Math.min(Math.max(x - left, 24), width - 24))}px`);
    card.dataset.tail = String(top + height <= y - 4);
  }

  function update(dt) {
    time += dt;
    const can = available();
    if (shown && !can) close(false);
    let pointed = false;
    if (can && !shown) {
      if (locked()) pointed = over(...centre());
      else if (pointer) pointed = over(pointer[0], pointer[1]);
    }
    if (pointed !== hovered) {
      hovered = pointed;
      canvas.style.cursor = hovered && !locked() ? 'pointer' : '';
      hint.hidden = !hovered;
      // Placed once as it appears, like the card: neither rides the swell with the diver.
      if (hovered) { const { x, y } = anchor(); hint.style.translate = `${Math.round(x)}px ${Math.round(y - 10)}px`; }
      if (diagnostics) diagnostics.hovered = hovered;
    }
    const goal = hovered || shown ? 1 : 0;
    // Eased in a moving scene; at once in a paused one, whose frames stop before an ease could finish.
    if (amount !== goal) { amount = reducedMotion() ? goal : amount + (goal - amount) * (1 - Math.exp(-dt * EASE)); if (Math.abs(goal - amount) < .005) amount = goal; }
    // The glow is worked out afresh every frame (world.js: lookGlowAt), so the lift is added on top each time.
    if (amount > 0 || lifted) {
      const breathe = reducedMotion() ? 1 : .85 + .15 * Math.sin(time * 3.2);
      for (const [own, base] of lit) own.uLookRim.value = base + amount * RIM_LIFT * breathe;
      glow?.add(scratch.copy(GLOW_LIFT).multiplyScalar(amount));
      lifted = amount > 0;
    }
  }
  // The card stays where it opened while the diver bobs under it; only a new size of window moves it.
  addEventListener('resize', () => { if (shown) place(); });
  const scratch = new THREE.Color();
  const diagnostics = { hovered: false };

  return {
    update, open, close, diagnostics,
    get isOpen() { return shown; },
    // Where the diver is on screen (client pixels), for tests and for anyone pointing at them.
    screenPoint(share = .9) { const { x, y } = anchor(share); return [x, y]; },
  };
}
