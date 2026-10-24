import * as THREE from './vendor/three.module.min.js';
import { LANDMARKS } from './reef.js';
import { icon } from './ui-icons.js';
import * as archive from './archive.js';
import { onTick, ui } from './ui-ticker.js';

const prompt = document.querySelector('#interact-prompt');
const panel = document.querySelector('#landmark-dialog');
const credits = document.querySelector('#credits-dialog');
const point = new THREE.Vector3(), ray = new THREE.Ray(), direction = new THREE.Vector3(), hit = new THREE.Vector3();
let eligible = null, opened = null, returnFocus = null;

function clearSight(start, end, controls) {
  const world = controls.reef?.userData.collisions;
  if (!world) return true;
  if (world.segmentClear) return world.segmentClear(start, end, .05);
  direction.copy(end).sub(start); const distance = direction.length();
  ray.set(start, direction.normalize());
  for (const item of world.boxes || []) {
    const intersection = ray.intersectBox(item.box, hit);
    if (intersection && start.distanceTo(intersection) > .1 && start.distanceTo(intersection) < distance - .65) return false;
  }
  return true;
}

const archiveToggle = document.querySelector('#archive-toggle');
document.querySelector('#dive-computer-toggle > span')?.replaceChildren(icon('computer'));
archiveToggle.prepend(icon('resume'));

// Opens the records from a landmark (F), the HUD button, the surface link, a URL
// hash or window.oceanArchive. Reading is allowed at the surface as well as on a
// dive, and still works when the 3D scene never became available. A landmark or a
// link opens its own section; the button and the surface link have no target, so
// they open the at-a-glance view. Nothing here waits on a download before it opens.
function openArchive(id, fromWaypoint=false, entry=null) {
  const controls = window.oceanControls;
  if (controls?.getTransition() || controls?.getMode() === 'transition' || panel.open || credits.open) return false;
  if (!fromWaypoint) opened = null;
  returnFocus = document.activeElement;controls?.setInterfaceOpen(true);
  if (fromWaypoint) controls?.models?.interact(id,true);
  const label = panel.querySelector('#archive-return-label');
  if (label) label.textContent = window.oceanDiagnostics?.submerged ? 'Return to the reef' : 'Return to the surface';
  prompt.hidden = true;panel.showModal();
  // Rendered after the dialog is laid out so the entry can be scrolled into place.
  archive.show(id, entry, {force:true});
  if (window.oceanDiagnostics) window.oceanDiagnostics.interaction = archive.current().section;
  panel.querySelector('.dialog-close').focus({preventScroll:true});
  return true;
}
archiveToggle.addEventListener('click', () => openArchive(archive.GLANCE));
function interact() {
  const controls = window.oceanControls;
  if (!controls || !eligible || controls.getMode() !== 'diver' || controls.getTransition() || panel.open || credits.open) return;
  opened = eligible;
  openArchive(opened.id,true);
}

// A quiet way in for visitors who would rather read than dive. Appended to the
// hero so it never depends on which buttons its siblings are.
const logbookLink = document.createElement('button');
logbookLink.type = 'button'; logbookLink.id = 'logbook-link'; logbookLink.className = 'logbook-link';
logbookLink.append(icon('resume'), document.createTextNode('See the work'));
logbookLink.addEventListener('click', () => openArchive('projects'));
document.querySelector('.portfolio-links')?.append(logbookLink);

window.oceanArchive = {
  // open('log', 'product-manager'): section ids or their hash names; the entry is optional.
  // open() with no section, or 'glance' / 'records', shows the at-a-glance view.
  open(section=archive.GLANCE, entry=null) {
    const id = archive.resolveSection(section) || archive.GLANCE;
    if (panel.open) { archive.show(id, entry); if (window.oceanDiagnostics) window.oceanDiagnostics.interaction = id; return true; }
    return openArchive(id, false, entry);
  },
  close() { if (panel.open) panel.close(); },
  get isOpen() { return panel.open; },
  get current() { return panel.open ? archive.current() : null; },
  // Additions: turn pages across the whole records, list them, link to one, print the summary.
  step(direction=1) { return panel.open ? archive.step(direction < 0 ? -1 : 1) : false; },
  get stops() { return archive.stops(); },
  link(section, entry=null) { return section === undefined ? archive.linkFor() : archive.linkFor(archive.resolveSection(section) || archive.GLANCE, entry); },
  print() { if (panel.open) archive.print(); },
};
// #records, #profile, #log, #finds and #resume open a section once the page is ready; every entry has its
// own link (#profile/rules, #log/product-manager, #finds/sage). archive.js keeps the address in step while reading.
let pendingHash = null, hashDeadline = 0;
function readHash() { pendingHash = archive.parseHash(location.hash); hashDeadline = performance.now() + 15000; }
// Reading does not depend on WebGL or scene readiness. Try immediately; only a
// currently blocked dialog or camera transition needs a short, bounded retry.
let hashTimer = 0;
function openFromHash() {
  clearTimeout(hashTimer);
  if (!pendingHash) return;
  if (window.oceanArchive.open(pendingHash.id, pendingHash.entry)) { pendingHash = null; return; }
  const controls = window.oceanControls;
  const blocked = credits.open || controls?.getTransition() || controls?.getMode() === 'transition';
  if (blocked && performance.now() < hashDeadline) hashTimer = setTimeout(openFromHash, 200);
}
readHash(); openFromHash();
addEventListener('hashchange', () => { readHash(); openFromHash(); });

function close(dialog) { if (dialog.open) dialog.close(); }
// HUD buttons are hidden while a dialog is open and take a frame or two to come
// back, so focus is retried briefly instead of being dropped on the body.
function restoreFocus(target, attempt=0) {
  if (!target?.isConnected || panel.open || credits.open) return;
  target.focus({preventScroll:true});
  if (document.activeElement !== target && attempt < 6 && [document.body, null].includes(document.activeElement)) setTimeout(() => restoreFocus(target, attempt + 1), 80);
}
for (const dialog of [panel, credits]) {
  dialog.querySelector('.dialog-close').addEventListener('click', () => close(dialog));
  dialog.addEventListener('close', () => {
    const controls = window.oceanControls;
    // A close event can arrive after the records were opened again; that newer session keeps its state.
    if (dialog === panel && panel.open) return;
    if (dialog === panel && opened) controls?.models?.interact(opened.id, false);
    if (dialog === panel) { opened = null; archive.leave(); }
    if (!panel.open && !credits.open) controls?.setInterfaceOpen(false);
    if (window.oceanDiagnostics && !panel.open) window.oceanDiagnostics.interaction = null;
    // Return to interface mode. Capturing the mouse always needs a fresh click.
    restoreFocus(returnFocus?.isConnected && returnFocus !== document.querySelector('#world') ? returnFocus : document.querySelector('#capture-hint'));
  });
}
panel.querySelector('.dialog-return').addEventListener('click', () => close(panel));
prompt.addEventListener('click', interact);
addEventListener('keydown', event => {
  if (event.code !== 'KeyF' || event.repeat || event.target.closest?.('input,textarea,select,button,[contenteditable="true"]')) return;
  if (eligible) { event.preventDefault(); interact(); }
});

let creditsLoaded = false;
document.querySelector('#credits-toggle').addEventListener('click', async () => {
  returnFocus = document.activeElement;
  window.oceanControls?.setInterfaceOpen(true); credits.showModal();
  if (creditsLoaded) return;
  const container = document.querySelector('#model-credits');
  container.textContent = 'Loading creator credits…';
  try {
    const response = await fetch('./assets/models/manifest.json');
    if (!response.ok) throw new Error('Credits unavailable');
    const items = await response.json(); container.replaceChildren();
    for (const item of items) {
      const entry = document.createElement('p');
      const link = document.createElement('a'); link.href = item.metadata.source;
      link.target = '_blank'; link.rel = 'noopener'; link.textContent = item.metadata.title;
      const creator = document.createElement('span'); creator.textContent = item.metadata.author.replace(/\s*\(https?:\/\/[^)]+\)/, '');
      entry.append(link, creator);if(item.metadata.license){const license=document.createElement('small');license.textContent=item.metadata.license;entry.append(license);} container.append(entry);
    }
    creditsLoaded = true;
  } catch { container.textContent = 'Credits could not load. Please try again.'; }
});

// The proximity check runs eight times a second on the interface clock (ui-ticker.js). It reuses its
// vectors, and touches the page only when the prompt appears, disappears or names another landmark.
const player = new THREE.Vector3(), sight = new THREE.Vector3(), promptLabel = prompt.querySelector('span');
let prompted = null;
function setHidden(node, value) { if (node.hidden !== value) node.hidden = value; }
function update() {
  const controls = window.oceanControls, state = window.oceanDiagnostics;
  setHidden(archiveToggle, !state?.submerged || Boolean(controls?.getTransition()));
  eligible = null;
  if (!controls || !state?.ready || controls.getMode() !== 'diver' || controls.getTransition() || panel.open || credits.open || ui.panel) {
    setHidden(prompt, true); return;
  }
  if (state.playerPosition) player.fromArray(state.playerPosition); else player.copy(controls.getPlayerPosition());
  const placed = controls.models?.landmarks;
  let nearest = Infinity;
  for (let i = 0; i < LANDMARKS.length; i++) {
    const item = LANDMARKS[i];
    let modelLandmark = null;
    if (placed) for (let j = 0; j < placed.length; j++) if (placed[j].id === item.id) { modelLandmark = placed[j]; break; }
    const target = modelLandmark?.position || item.position;
    if (target?.isVector3) point.copy(target); else point.fromArray(target);
    const range = (modelLandmark?.maxRange || 6) + .6;
    const distance = player.distanceTo(point);
    if (distance > range || distance >= nearest) continue;
    const approach = modelLandmark?.interactionPosition;
    if (!clearSight(player, approach ? sight.fromArray(approach) : point, controls)) continue;
    eligible = item; nearest = distance;
  }
  setHidden(prompt, !eligible);
  if (eligible && eligible !== prompted) {
    prompted = eligible;
    promptLabel.textContent = `Explore ${eligible.title}`;
    prompt.setAttribute('aria-label', `Explore ${eligible.title}. Press F.`);
  }
  state.nearbyLandmark = eligible?.id || null;
}
onTick(update, 8);
