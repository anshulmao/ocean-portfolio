import { onTick, ui } from './ui-ticker.js';

// One voice for passing words (release/MOBILE_OVERHAUL.md, the Announce zone). The depth chapter splash, "found"
// notes, tour and safety notices all go through this queue instead of drawing on the screen when they please, so
// one message shows at a time, for a couple of seconds, in the upper third, and never over a sheet being read: while
// the guided-dive sheet is open or a dialog is up messages wait, and one that waited too long to still be news is
// dropped. The body carries data-announce="on" while a message is up, so world labels can step out of its way.
// Two renderings share the zone: the chapter title card (.zone-card) and the note slate (.journey-toast).
const GAP = .45, STALE = 6;
const make = (className, html) => {
  const node = document.createElement('div'); node.className = className; node.innerHTML = html; node.dataset.show = 'false';
  document.body.append(node); return node;
};
const splash = make('zone-card', '<small></small><strong></strong><b></b>');
const note = make('journey-toast', '<i></i><div><small></small><strong></strong><span></span></div>');
// The chapter is also on the depth chip, so the title card is decoration to a screen reader; notes are read out.
splash.setAttribute('aria-hidden', 'true');
note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
const parts = node => [...node.querySelectorAll('small,strong,span')];

const queue = [];
// Wall-clock seconds: the interface clock caps each frame's step, so on a struggling frame rate it runs slow and a
// message would linger. The ticker only decides when to look.
const now = () => performance.now() / 1000;
let current = null, until = 0, resume = 0;
// About two and a half seconds, a little longer for a sentence worth reading, never long enough to be in the way.
const holdFor = item => Math.min(4.5, 2.5 + Math.max(0, `${item.title} ${item.text}`.trim().split(/\s+/).length - 8) * .18);
const blocked = () => document.body.dataset.sheet === 'expanded' || ui.dialog || document.body.dataset.menu === 'open';

function show(item) {
  const node = item.kind === 'zone' ? splash : note;
  const [kicker, title, text] = parts(node);
  kicker.textContent = item.kicker; title.textContent = item.title;
  if (text) text.textContent = item.text;
  node.style.setProperty('--signal', item.signal);
  // Replayed from the start, so a second note on the same slate rises in like the first.
  node.dataset.show = 'false'; void node.offsetWidth; node.dataset.show = 'true';
  current = item; until = now() + item.hold;
  document.body.dataset.announce = 'on';
}
function hide() {
  (current.kind === 'zone' ? splash : note).dataset.show = 'false';
  current = null; resume = now() + GAP;
  delete document.body.dataset.announce;
}
function step() {
  const time = now();
  // A sheet opened for reading takes the message down at once rather than letting it sit over the words.
  if (current) { if (time >= until || blocked()) hide(); return; }
  if (time < resume || blocked()) return;
  while (queue.length && time - queue[0].at > queue[0].stale) queue.shift();
  if (queue.length) show(queue.shift());
}

/**
 * Queues a message. kind 'zone' is the chapter title card, anything else a note. A key replaces a waiting message
 * with the same key (only the latest depth chapter matters); stale is how many seconds it may wait to be shown.
 */
export function announce({ kind = 'note', kicker = '', title = '', text = '', signal = '#7ff0cf', key = '', stale = STALE } = {}) {
  if (document.body.dataset.clearUi === 'true') return;
  const item = { kind, kicker, title, text, signal, key, stale, at: now() };
  item.hold = holdFor(item);
  const waiting = key ? queue.findIndex(other => other.key === key) : -1;
  if (waiting >= 0) queue[waiting] = item; else queue.push(item);
  step();
}
/** Takes down the message on screen and forgets the ones waiting (a cleared screen, the surface). */
export function clearAnnouncements() { queue.length = 0; if (current) hide(); resume = 0; }
export const announcing = () => Boolean(current);
onTick(step, 10);
