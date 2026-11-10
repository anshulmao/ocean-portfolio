// Presentation only, like quiet-ui.js: what the dive's interface leaves out, and when (dive-focus.css has the rules).
// Nothing here moves the diver, changes a shortcut or owns an instrument.
//   aiming   while the mouse aims the view (pointer lock) the cursor cannot reach a button, so the ones that are only
//            buttons step back; Esc frees the mouse and they are there again. Their keys work all along.
//   rested   the line of keys at the bottom is read once: REST seconds after it last changed it fades, and comes back
//            whenever it has something new to say (the mouse freed, the ascent, the surface).
const body = document.body, hint = document.getElementById('look-hint'), REST = 9000;
const aim = () => { body.dataset.aiming = String(Boolean(document.pointerLockElement)); };
document.addEventListener('pointerlockchange', aim); aim();
if (hint) {
  let timer = 0, said = '';
  const fresh = () => {
    if (hint.textContent === said) return;
    said = hint.textContent; hint.dataset.rested = 'false';
    clearTimeout(timer); timer = setTimeout(() => { hint.dataset.rested = 'true'; }, REST);
  };
  new MutationObserver(fresh).observe(hint, { childList: true, characterData: true, subtree: true });
  // Going under starts it afresh, so every dive begins with the keys in view.
  new MutationObserver(() => { said = ''; fresh(); }).observe(body, { attributes: true, attributeFilter: ['data-submerged'] });
  fresh();
}
