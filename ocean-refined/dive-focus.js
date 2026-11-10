// Presentation only, like quiet-ui.js: what the dive's interface shows, where, and when (dive-focus.css has the rules).
// Nothing here moves the diver, changes a shortcut or owns an instrument.
//   tools    the dive's three buttons in one row at the bottom left, under the depth card: the dive computer (C), a
//            photo (H) and Clear screen (U). The computer's and Clear screen's own buttons are moved into the row as
//            they are, so everything that already drives them still does; the photo button is new on a desktop (a
//            phone has its own on the touch deck). The Portfolio button that stood with them is retired under water:
//            the sites, the menu and the surface all lead to the portfolio.
//   rested   the line of keys at the bottom is read once: REST seconds after it last changed it fades, and comes back
//            whenever it has something new to say (the mouse freed, the ascent, the surface).
const body = document.body, hint = document.getElementById('look-hint'), REST = 9000;
const computer = document.getElementById('dive-computer-toggle'), clear = document.getElementById('clear-ui-toggle');
if (computer && clear) {
  const tools = document.createElement('div'), photo = document.createElement('button');
  tools.className = 'dive-tools'; tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', 'Dive tools');
  photo.type = 'button'; photo.id = 'dive-photo'; photo.className = 'dive-photo'; photo.setAttribute('aria-label', 'Take a photo. H');
  photo.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg><span>Photo</span><kbd>H</kbd>';
  photo.addEventListener('click', () => { window.oceanExpedition?.takePhoto?.(); document.getElementById('world')?.focus({ preventScroll: true }); });
  computer.before(tools); tools.append(computer, photo, clear);
}
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
