import * as THREE from './vendor/three.module.min.js';
import { LANDMARKS } from './reef.js';
import { PORTFOLIO_CONTENT, COPY_VARIANTS } from './portfolio-content.js';

const prompt = document.querySelector('#interact-prompt');
const panel = document.querySelector('#landmark-dialog');
const credits = document.querySelector('#credits-dialog');
const point = new THREE.Vector3(), ray = new THREE.Ray(), direction = new THREE.Vector3(), hit = new THREE.Vector3();
const descriptions = {
  about: ['THE ANCHOR', 'An anchor for my story.'],
  experience: ['THE WRECK', 'Explore the chapters of my journey.'],
  projects: ['THE TREASURE', 'Discover what I’ve been building.'],
};
let eligible = null, opened = null, last = 0, returnFocus = null;

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

let sectionId = 'about', entryId = null;
const index = document.querySelector('#explorer-index');
const variant = document.querySelector('#copy-variant');
try { variant.value = localStorage.getItem('ocean-copy-variant') || 'baseline'; } catch {}
if (!['baseline', ...Object.keys(COPY_VARIANTS)].includes(variant.value)) variant.value = 'baseline';
function renderEntry(id) {
  const section = PORTFOLIO_CONTENT[sectionId];
  const entry = section.entries.find(item => item.id === id) || section.entries[0]; entryId = entry.id;
  for (const button of index.querySelectorAll('button')) button.setAttribute('aria-current', String(button.dataset.entry === entryId));
  document.querySelector('#landmark-title').textContent = entry.title;
  document.querySelector('#entry-tag').textContent = entry.tag.toUpperCase();
  document.querySelector('#landmark-caption').textContent = variant.value === 'baseline' ? entry.summary : COPY_VARIANTS[variant.value][sectionId];
  const paragraphs = entry.body.map(text => Object.assign(document.createElement('p'), {textContent:text}));
  document.querySelector('#explorer-content').replaceChildren(...paragraphs);
  document.querySelector('#explorer-facts').replaceChildren(...entry.facts.map(text => Object.assign(document.createElement('li'), {textContent:text})));
  document.querySelector('#explorer-links').replaceChildren(...entry.links.filter(link => /^(https:\/\/|mailto:)/.test(link.url)).map(link => {
    const a = document.createElement('a'); a.textContent = `${link.label} ↗`; a.href = link.url;
    if (link.url.startsWith('https:')) {a.target = '_blank'; a.rel = 'noopener noreferrer';} return a;
  }));
}
function renderSection(id) {
  sectionId = id; const section = PORTFOLIO_CONTENT[id];
  document.querySelector('#landmark-kicker').textContent = descriptions[id][0];
  for (const button of panel.querySelectorAll('[data-section]')) {
    if (button.dataset.section === id) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  index.replaceChildren(...section.entries.map(entry => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.entry = entry.id;
    button.append(document.createTextNode(entry.title), Object.assign(document.createElement('span'), {textContent:entry.tag.toUpperCase()}));
    button.addEventListener('click', () => renderEntry(entry.id)); return button;
  }));
  renderEntry(section.entries[0].id);
}
for (const button of panel.querySelectorAll('[data-section]')) button.addEventListener('click', () => renderSection(button.dataset.section));
variant.addEventListener('change', () => {renderEntry(entryId); try {localStorage.setItem('ocean-copy-variant', variant.value);} catch {}});

function interact() {
  const controls = window.oceanControls;
  if (!controls || !eligible || controls.getMode() !== 'diver' || controls.getTransition() || panel.open || credits.open) return;
  opened = eligible;
  returnFocus = document.activeElement;
  controls.setInterfaceOpen(true);
  renderSection(opened.id);
  controls.models?.interact(opened.id, true);
  prompt.hidden = true; panel.showModal();
  window.oceanDiagnostics.interaction = opened.id;
  panel.querySelector('.dialog-close').focus();
}

function close(dialog) { if (dialog.open) dialog.close(); }
for (const dialog of [panel, credits]) {
  dialog.querySelector('.dialog-close').addEventListener('click', () => close(dialog));
  dialog.addEventListener('close', () => {
    const controls = window.oceanControls;
    if (dialog === panel && opened) controls?.models?.interact(opened.id, false);
    opened = null;
    if (!panel.open && !credits.open) controls?.setInterfaceOpen(false);
    if (window.oceanDiagnostics) window.oceanDiagnostics.interaction = null;
    // Return to interface mode. Capturing the mouse always needs a fresh click.
    if (returnFocus?.isConnected && returnFocus !== document.querySelector('#world')) returnFocus.focus({preventScroll:true});
    else document.querySelector('#capture-hint')?.focus({preventScroll:true});
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
      entry.append(link, creator); container.append(entry);
    }
    creditsLoaded = true;
  } catch { container.textContent = 'Credits could not load. Please try again.'; }
});

function update(now) {
  requestAnimationFrame(update);
  if (now - last < 120) return; last = now;
  const controls = window.oceanControls;
  eligible = null;
  if (!controls || !window.oceanDiagnostics?.ready || controls.getMode() !== 'diver' || controls.getTransition() || panel.open || credits.open || document.querySelector('#movement-panel')?.hidden === false) {
    prompt.hidden = true; return;
  }
  const player = controls.getPlayerPosition();
  let nearest = Infinity;
  for (const item of LANDMARKS) {
    const modelLandmark = controls.models?.landmarks?.find(landmark => landmark.id === item.id);
    const target = modelLandmark?.position || item.position;
    if (target?.isVector3) point.copy(target); else point.fromArray(target);
    const range = (modelLandmark?.maxRange || 6) + .6;
    const distance = player.distanceTo(point);
    const approach = modelLandmark?.interactionPosition;
    const sightTarget = approach ? new THREE.Vector3().fromArray(approach) : point;
    if (distance > range || distance >= nearest || !clearSight(player, sightTarget, controls)) continue;
    eligible = item; nearest = distance;
  }
  prompt.hidden = !eligible;
  if (eligible) {
    prompt.querySelector('span').textContent = `Explore ${eligible.title}`;
    prompt.setAttribute('aria-label', `Explore ${eligible.title}. Press F.`);
  }
  window.oceanDiagnostics.nearbyLandmark = eligible?.id || null;
}
requestAnimationFrame(update);
