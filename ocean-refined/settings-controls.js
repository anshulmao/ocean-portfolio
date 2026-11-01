import './ambient-audio.js';

const menu = document.querySelector('#settings-menu');
const general = menu.querySelector('#settings-general-content');
const quick = document.createElement('div');
quick.className = 'settings-primary-quick';
quick.setAttribute('role', 'group');
quick.setAttribute('aria-label', 'Quick settings');
general.before(quick);
const body = menu.querySelector('.settings-body');
body.append(document.getElementById('settings-quick'), document.getElementById('settings-surface-now'));
// Move the original controls so their state, accessible names and handlers stay shared.
for (const id of ['sound-mute', 'time-cycle', 'weather-glyph']) {
  const button = document.getElementById(id);
  button.hidden = false;
  quick.append(button);
}
const volume = document.querySelector('#sound-volume').closest('.movement-field');
volume.classList.add('settings-main-volume');
quick.after(volume);
const surface = document.createElement('section');
surface.className = 'settings-surface-controls';
surface.setAttribute('aria-label', 'Surface settings');
surface.append(document.getElementById('time-settings'), document.getElementById('weather-settings'));
general.prepend(surface);
function orderSections() {
  const lighting = document.getElementById('brightness-settings');
  if (document.body.dataset.submerged === 'true') general.append(surface);
  else general.insertBefore(surface, lighting);
}
orderSections();
new MutationObserver(orderSections).observe(document.body, {attributes:true, attributeFilter:['data-submerged']});

// One delegated interaction path also covers sliders created later by the scene.
const bubbles = new WeakMap();
function bubbleFor(slider) {
  if (bubbles.has(slider)) return bubbles.get(slider);
  const bubble = document.createElement('span');
  bubble.className = 'settings-slider-value';
  bubble.setAttribute('aria-hidden', 'true');
  menu.append(bubble);
  const state = {bubble, timer:null, active:false};
  bubbles.set(slider, state);
  return state;
}
function paint(slider) {
  const state = bubbleFor(slider), rect = slider.getBoundingClientRect(), bounds = menu.getBoundingClientRect();
  const ratio = (Number(slider.value) - Number(slider.min || 0)) / (Number(slider.max || 100) - Number(slider.min || 0));
  const output = menu.querySelector(`output[for~="${slider.id}"]`);
  state.bubble.textContent = slider.getAttribute('aria-valuetext') || output?.textContent || slider.value;
  // Native thumbs have inset endpoints. Clamp the bubble to the panel edges.
  const inset = slider.id === 'weather-slider' ? 13 : 8;
  const x = rect.left + inset + ratio * (rect.width - inset * 2);
  state.bubble.style.left = `${Math.max(bounds.left + 40, Math.min(bounds.right - 40, x))}px`;
  const above = rect.top - 32;
  state.bubble.style.top = `${above > bounds.top + 8 ? above : rect.bottom + 4}px`;
  state.bubble.classList.add('is-visible');
}
function show(slider) {
  const state = bubbleFor(slider);
  clearTimeout(state.timer);
  paint(slider);
}
function linger(slider) {
  const state = bubbleFor(slider);
  clearTimeout(state.timer);
  state.timer = setTimeout(() => state.bubble.classList.remove('is-visible'), 1000);
}
const isSlider = target => target.matches?.('input[type="range"]');
menu.addEventListener('pointerdown', event => {
  if (!isSlider(event.target)) return;
  const slider = event.target, state = bubbleFor(slider);
  state.active = true;
  slider.setPointerCapture(event.pointerId);
  show(slider);
});
menu.addEventListener('input', event => {
  if (!isSlider(event.target)) return;
  show(event.target);
  if (!bubbleFor(event.target).active) linger(event.target);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) menu.addEventListener(type, event => {
  if (!isSlider(event.target)) return;
  bubbleFor(event.target).active = false;
  linger(event.target);
}, true);
// Hide floating values when scrolling or closing the menu.
function hideValues() {
  menu.querySelectorAll('.settings-slider-value').forEach(bubble => bubble.classList.remove('is-visible'));
}
menu.addEventListener('scroll', hideValues, true);
new MutationObserver(hideValues).observe(menu, {attributes:true, attributeFilter:['hidden']});
