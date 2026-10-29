const NAMES = { 'right-whale': 'Whale', 'whale-shark': 'Whale shark', 'blacktip-reef-shark': 'Reef shark', orca: 'Orca' };
// Camera-space direction: negative z is ahead. Behind-camera directions must
// keep their true left/right bearing, rather than flip with perspective divide.
export function wildlifeBearing([x, y, z], aspect = 1, fov = 60) {
  const scale = Math.tan(fov * Math.PI / 360) * Math.max(.001, Math.abs(z));
  const sx = x / (scale * aspect), sy = -y / scale;
  const onScreen = z < 0 && Math.abs(sx) < .78 && Math.abs(sy) < .65;
  const length = Math.max(.001, Math.hypot(sx, sy));
  return { onScreen, screenX: sx, screenY: sy, x: sx / length, y: sy / length, angle: Math.atan2(sy, sx) * 180 / Math.PI };
}
export function createWildlifeGuide(document, vector) {
  const cue = document.createElement('aside');
  cue.className = 'tour-wildlife holo'; cue.hidden = true;
  cue.setAttribute('aria-label', 'Nearby wildlife');
  cue.innerHTML = '<span class="tour-wildlife-arrow" aria-hidden="true">➜</span><span class="tour-wildlife-name"></span>';
  document.body.append(cue);
  let active = null, remaining = 0, cooldown = 0;
  let sampleIn = 0, animals = [];
  const shown = new Set();
  return {
    reset() { active = null; remaining = cooldown = sampleIn = 0; animals = []; shown.clear(); cue.hidden = true; },
    update(dt, api, enabled) {
      cue.hidden = true;
      if (!enabled) return;
      if (api.creatures?.root?.visible === false) return;
      const camera = api.getCamera?.();
      if (!camera) return;
      cooldown = Math.max(0, cooldown - dt);
      // Animal positions need only a small sample; camera bearings still update
      // every frame without allocating the world's site list on every look.
      sampleIn -= dt;
      if (sampleIn <= 0) { animals = api.creatures?.sites?.() || []; sampleIn = .2; }
      if (active) {
        remaining -= dt;
        active = animals.find(item => item.id === active.id && vector.fromArray(item.position).distanceTo(camera.position) < 65);
        if (remaining <= 0 || !active) { active = null; cooldown = 15; }
      }
      if (!active && !cooldown) {
        active = animals.find(item => NAMES[item.species] && !shown.has(item.id) && vector.fromArray(item.position).distanceTo(camera.position) < 60);
        if (active) { shown.add(active.id); remaining = 10; }
      }
      if (!active) return;
      vector.fromArray(active.position).applyMatrix4(camera.matrixWorldInverse);
      const bearing = wildlifeBearing(vector.toArray(), camera.aspect, camera.fov);
      const arrow = cue.querySelector('.tour-wildlife-arrow');
      arrow.hidden = bearing.onScreen; arrow.style.transform = `rotate(${bearing.angle}deg)`;
      const name = cue.querySelector('.tour-wildlife-name'), label = `${NAMES[active.species]} ${bearing.onScreen ? 'in view' : 'nearby'}`;
      if (name.textContent !== label) name.textContent = label;
      cue.style.left = `${50 + (bearing.onScreen ? bearing.screenX * 32 : bearing.x * 32)}%`;
      cue.style.top = `${35 + (bearing.onScreen ? bearing.screenY * 17 : bearing.y * 17)}%`;
      cue.hidden = false;
    }
  };
}
