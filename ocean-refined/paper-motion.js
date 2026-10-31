// Paper motion: the tactile layer of the paper UI (paper-ui.css). Controls answer the pointer: a ripple spreads from
// the press, the main buttons lean toward the cursor, and the Dive button lets go of a few bubbles. Everything here is
// decoration on top of controls that already work, it runs only for visitors who have not asked for reduced motion, and it
// touches nothing but transform and opacity (through the translate, scale and opacity properties).
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');

const PRESS = [
  '.dive-button', '.guided-button', '.settings-toggle', '.menu-toggle', '.settings-close', '.motion-control', '.camera-toggle',
  '.credits-toggle', '.archive-toggle', '.dive-computer-toggle', '.quiet-ui-toggle', '.quiet-ui-restore', '.explore-back',
  '.hero-link', '.holo-chip', '.surface-nav a', '.view-controls>button', '.diver-profile-actions button',
  '.theme-control>button', '.weather-picker>button', '.movement-preset-row>button', '.tour-card footer button',
  '#landmark-dialog .arc-tool', '#landmark-dialog .arc-pager button', '#landmark-dialog .dialog-return',
  '#landmark-dialog .arc-links a', '#landmark-dialog .arc-actions>*', '#landmark-dialog .arc-find',
  '.reading-button', '.reading-chip', '.reading-dive', '.reading-nav nav a'
].join(',');
const LEAN = '.dive-button, .guided-button, .settings-toggle, .holo-chip--go, .reading-button, .reading-dive';

function ripple(el, event) {
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const box = el.getBoundingClientRect(), size = Math.max(box.width, box.height) * 2;
  const wrap = document.createElement('span'), dot = document.createElement('i');
  wrap.className = 'paper-ripple'; wrap.setAttribute('aria-hidden', 'true');
  dot.style.cssText = `left:${event.clientX - box.left}px;top:${event.clientY - box.top}px;width:${size}px;height:${size}px`;
  wrap.append(dot); el.append(wrap);
  dot.addEventListener('animationend', () => wrap.remove(), {once: true});
}

document.addEventListener('pointerdown', event => {
  if (reduce.matches || event.button) return;
  const el = event.target instanceof Element && event.target.closest(PRESS);
  if (el && !el.disabled && el.getAttribute('aria-disabled') !== 'true') ripple(el, event);
}, {passive: true});

// The main buttons lean a few pixels toward the cursor and settle back with a spring when it leaves.
let leaning = null;
document.addEventListener('pointermove', event => {
  if (reduce.matches || !fine.matches) return;
  const el = event.target instanceof Element && event.target.closest(LEAN);
  if (leaning && leaning !== el) { leaning.style.removeProperty('--mx'); leaning.style.removeProperty('--my'); leaning = null; }
  if (!el || el.disabled) return;
  const box = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${(((event.clientX - box.left) / box.width) - .5) * 8}px`);
  el.style.setProperty('--my', `${(((event.clientY - box.top) / box.height) - .5) * 4}px`);
  leaning = el;
}, {passive: true});

// Bubbles leave the Dive button as the dive begins: a handful, each its own size, drift and pace.
function bubbles(el) {
  const box = el.getBoundingClientRect(), layer = document.createElement('div');
  layer.className = 'paper-bubbles'; layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 9; i++) {
    const b = document.createElement('i'), size = 5 + Math.random() * 11;
    b.style.cssText = `left:${box.left + 14 + Math.random() * (box.width - 28)}px;top:${box.top + box.height * .35}px;width:${size}px;height:${size}px;` +
      `--dx:${(Math.random() - .5) * 46}px;--dy:${-(70 + Math.random() * 110)}px;animation-delay:${Math.random() * 220}ms;animation-duration:${900 + Math.random() * 700}ms`;
    layer.append(b);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 2200);
}
document.addEventListener('click', event => {
  if (reduce.matches) return;
  const el = event.target instanceof Element && event.target.closest('#dive, #guided-dive');
  if (el && !el.disabled) bubbles(el);
}, {passive: true});

// The reading pages (profile.html and the case studies) share this file. Headings arrive word by word as they scroll into
// view, the rest of each section follows in a stagger, a depth gauge counts the page's descent, and the project cards
// tilt toward the cursor. All of it is added on top of a page that already reads in full without it.
function reading() {
  if (reduce.matches || !document.querySelector('.reading-nav')) return;
  const below = el => el.getBoundingClientRect().top > innerHeight * .92;
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
  }, {rootMargin: '0px 0px -8% 0px', threshold: .08});

  // Words: each word rises out of its own mask, 55 ms after the one before. The first screen keeps its CSS entrance.
  const split = el => {
    let i = 0;
    const walk = node => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const part of child.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { frag.append(part); continue; }
            const word = document.createElement('span'), inner = document.createElement('span');
            word.className = 'rm-w'; inner.textContent = part; inner.style.setProperty('--i', i++); word.append(inner); frag.append(word);
          }
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') walk(child);
      }
    };
    walk(el); el.classList.add('rm-split');
  };
  document.querySelectorAll('.reading-section-heading h2, .reading-introduction h2, .reading-approach-note h3, .reading-contact h2, .reading-gallery-heading h2, .reading-next-copy h2').forEach(el => {
    if (below(el)) { split(el); io.observe(el); }
  });

  // The rest of a section rises in order, 70 ms apart among siblings.
  const group = document.querySelectorAll('.reading-section-intro, .reading-prose, .reading-introduction .reading-links, .reading-introduction .reading-text-link, .reading-approach-note>p, .reading-approach-note>a, .reading-process, .reading-resume, .reading-contact-copy, .reading-contact-links, .reading-portrait, .reading-gallery-heading>p, .reading-media, .reading-toc, .reading-next, .reading-journey-grid li');
  group.forEach(el => {
    if (!below(el)) return;
    const siblings = [...el.parentElement.children].filter(child => child.matches('.reading-journey-grid li, .reading-contact-copy, .reading-contact-links, p, a'));
    el.style.setProperty('--d', `${Math.max(0, siblings.indexOf(el)) * 70}ms`);
    el.classList.add('rm-reveal'); io.observe(el);
  });

  // Tilt: a card leans toward the pointer and springs back (the CSS owns the spring).
  if (fine.matches) document.addEventListener('pointermove', event => {
    const card = event.target instanceof Element && event.target.closest('.reading-card-link');
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty('--ry', `${(((event.clientX - box.left) / box.width) - .5) * 6}deg`);
    card.style.setProperty('--rx', `${-(((event.clientY - box.top) / box.height) - .5) * 5}deg`);
    card.dataset.tilt = 'on';
  }, {passive: true});
  document.addEventListener('pointerout', event => {
    const card = event.target instanceof Element && event.target.closest('.reading-card-link');
    if (card && !card.contains(event.relatedTarget)) { card.style.removeProperty('--rx'); card.style.removeProperty('--ry'); card.dataset.tilt = ''; }
  }, {passive: true});

  // The depth gauge: the page is a dive, 0 m at the top and 40 m at the foot. A bubble rides a soft track as you descend.
  const gauge = document.createElement('div');
  gauge.className = 'rm-depth'; gauge.setAttribute('aria-hidden', 'true');
  gauge.innerHTML = '<span class="rm-depth-n">Surface</span><i><b></b></i>';
  document.body.append(gauge);
  const label = gauge.querySelector('.rm-depth-n'), fill = gauge.querySelector('b'), nav = document.querySelector('.reading-nav');
  let frame = 0;
  const update = () => {
    frame = 0;
    const room = document.documentElement.scrollHeight - innerHeight, p = room > 0 ? Math.min(1, Math.max(0, scrollY / room)) : 0, metres = Math.round(p * 40);
    label.textContent = metres < 1 ? 'Surface' : `${metres} m`;
    fill.style.setProperty('--p', p.toFixed(4));
    gauge.dataset.on = scrollY > 120 ? 'true' : 'false';
    nav.dataset.scrolled = scrollY > 8 ? 'true' : 'false';
  };
  addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(update); }, {passive: true});
  addEventListener('resize', update, {passive: true});
  update();
}
reading();
