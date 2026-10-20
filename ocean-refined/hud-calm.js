import { onTick } from './ui-ticker.js';
import { DISPLAY_MAX_DEPTH } from './depth-metrics.js';

// The calm dive HUD (design/ui-overhaul/depth.html, screen 02): one depth card bottom left and one
// "ahead" card bottom right, on glass. It owns no instrument logic. It mirrors readings that
// dive-hud.js (console), journey.js (zone card, waypoint chip) and landmark-interactions.js
// (interact prompt) already keep current, five times a second, and writes a node only when its
// text would change. C (Instruments) shows the full console and depth scale instead; dive-calm.css
// decides which set is visible from body[data-computer-open].
const $ = selector => document.querySelector(selector);
const SITES = {
  'The Anchor': 'About · how I approach the work',
  'The Wreck': 'Experience · three roles, 2023 to now',
  'The Treasure': 'Work · six projects across the AI product loop'
};
const NAMES = { about: 'The Anchor', experience: 'The Wreck', projects: 'The Treasure' };
const SIGNALS = { about: '#7ff0cf', experience: '#ffcf7a', projects: '#c9a2ff' };
const card = (className, label, html) => {
  const node = document.createElement('section');
  node.className = `calm-card ${className}`; node.setAttribute('aria-label', label); node.innerHTML = html;
  document.body.append(node); return node;
};
const depthCard = card('calm-depth', 'Depth', '<p class="calm-depth-number"><span>0.0</span><small>m</small></p><p class="calm-depth-zone"><span></span><b></b></p><div class="calm-depth-gauge" aria-hidden="true"><i></i></div><p class="calm-depth-vitals"></p>');
const aheadCard = card('calm-ahead', 'Ahead', '<p class="calm-ahead-kicker"></p><h2 class="calm-ahead-title"></h2><p class="calm-ahead-note"></p><p class="calm-ahead-action"></p>');
aheadCard.setAttribute('aria-live', 'polite');

const source = {
  depth: $('#console-depth'), air: $('#air-value'), ndl: $('#console-ndl'), ndlLabel: $('#console-ndl-label'), ndlValue: $('#console-ndl-value'),
  zone: () => $('.zone-card strong'), zoneNote: () => $('.zone-card span'), waypoint: () => $('.waypoint'), prompt: $('#interact-prompt')
};
const out = {
  depth: depthCard.querySelector('.calm-depth-number span'), zone: depthCard.querySelector('.calm-depth-zone span'), place: depthCard.querySelector('.calm-depth-zone b'),
  gauge: depthCard.querySelector('.calm-depth-gauge i'), vitals: depthCard.querySelector('.calm-depth-vitals'),
  kicker: aheadCard.querySelector('.calm-ahead-kicker'), title: aheadCard.querySelector('.calm-ahead-title'), note: aheadCard.querySelector('.calm-ahead-note'), action: aheadCard.querySelector('.calm-ahead-action')
};
const shown = new Map();
const write = (node, value) => { if (shown.get(node) !== value) { shown.set(node, value); node.textContent = value; } };
const set = (node, key, value) => { if (node.dataset[key] !== value) node.dataset[key] = value; };
// The first text node of a reading is its value; the unit sits beside it in a <small>.
const valueOf = node => (node?.firstChild?.nodeType === 3 ? node.firstChild.data : node?.textContent || '').trim();
let lastSite = '', lastSignal = '';

function paint() {
  if (document.body.dataset.submerged !== 'true') return;
  const depth = valueOf(source.depth) || '0.0';
  write(out.depth, depth);
  const metres = Number.parseFloat(depth) || 0, fill = Math.max(0, Math.min(1, metres / DISPLAY_MAX_DEPTH));
  const width = `${Math.round(fill * 1000) / 10}%`;
  if (out.gauge.style.width !== width) out.gauge.style.width = width;
  write(out.zone, source.zone()?.textContent || 'Sunlit shallows');
  const note = source.zoneNote()?.textContent || '';
  write(out.place, note ? ` · ${note.split('·')[0].trim()}` : '');
  // Air and the no-stop state. A stop or a low limit turns the line into an alert; colour never carries it alone.
  const mode = source.ndl?.dataset.mode || 'ndl', air = valueOf(source.air);
  const limit = `${source.ndlLabel?.textContent || 'NDL'} ${valueOf(source.ndlValue)}${source.ndlValue?.querySelector('small')?.textContent ? ' min' : ''}`.trim();
  write(out.vitals, `AIR ${air || '—'} BAR · ${limit}`);
  set(depthCard, 'alert', String(mode !== 'ndl' && mode !== 'done'));

  // Ahead: the waypoint names the nearest unfound light and its distance. Within reach the waypoint
  // hides and the interact prompt appears, so the card keeps the last site and offers F.
  const waypoint = source.waypoint(), near = source.prompt && !source.prompt.hidden;
  const pointing = waypoint?.dataset.show === 'true';
  // Within reach, the landmark in range names the card (the waypoint may still point at another light).
  const nearby = near ? window.oceanDiagnostics?.nearbyLandmark : null;
  if (nearby && NAMES[nearby]) { lastSite = NAMES[nearby]; lastSignal = SIGNALS[nearby]; }
  else if (pointing) {
    lastSite = waypoint.querySelector('span')?.textContent || lastSite;
    lastSignal = waypoint.style.getPropertyValue('--signal') || lastSignal;
  }
  const visible = Boolean(lastSite && (pointing || near));
  set(aheadCard, 'show', String(visible));
  if (!visible) return;
  write(out.kicker, near ? 'Here' : `Ahead · ${waypoint.querySelector('b')?.textContent || ''}`);
  write(out.title, lastSite);
  write(out.note, SITES[lastSite] || '');
  write(out.action, near ? 'Press F to open the log' : 'Follow the light');
  set(aheadCard, 'near', String(near));
  if (lastSignal && aheadCard.style.getPropertyValue('--signal') !== lastSignal) aheadCard.style.setProperty('--signal', lastSignal);
}
onTick(paint, 5);
