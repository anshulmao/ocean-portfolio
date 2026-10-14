// Gamepad support (standard mapping). The swimming model polls this from its own update, and only while a pad is
// connected; with none there is no cost at all.
//   left stick   swim forward / back, and turn (or strafe, when A / D are set to strafe)
//   right stick  look
//   triggers     RT rise, LT sink (LT at the surface dives)
//   A interact (dives at the surface) · B scooter (hold) · X flashlight · Y camera · Start settings menu
// Sticks have a radial dead zone and a response curve, so the first part of the travel is slow and precise.
const MOVE_CURVE = 1.4, LOOK_CURVE = 1.9, TRIGGER_DEAD = .06;
const TAPS = [[0, 'interact'], [2, 'lamp'], [3, 'camera'], [9, 'menu']];

export function createGamepad({ onAction = () => {}, wake = () => {} } = {}) {
  const held = new Uint8Array(17), shaped = { x: 0, y: 0 };
  let connected = 0, unwatch = null, watching = false, moved = false;
  function shape(x, y, dead, curve) {
    const length = Math.hypot(x, y);
    if (length <= dead) { shaped.x = shaped.y = 0; return; }
    const drive = Math.pow(Math.min(1, (length - dead) / (1 - dead)), curve) / length;
    shaped.x = x * drive; shaped.y = y * drive;
  }
  const first = () => { const pads = navigator.getGamepads?.() || []; for (let i = 0; i < pads.length; i++) if (pads[i]?.connected && pads[i].mapping === 'standard') return pads[i]; for (let i = 0; i < pads.length; i++) if (pads[i]?.connected) return pads[i]; return null; };
  const pressed = (device, index) => Boolean(device.buttons[index]?.pressed);
  const value = (device, index) => { const amount = device.buttons[index]?.value ?? 0; return amount > TRIGGER_DEAD ? amount : 0; };
  const busy = device => { for (let i = 0; i < Math.min(4, device.axes.length); i++) if (Math.abs(device.axes[i]) > .3) return true; for (let i = 0; i < device.buttons.length; i++) if (device.buttons[i].pressed) return true; return false; };
  // A pad has no events for sticks, so a scene that has stopped drawing (motion paused and everything settled) would never
  // hear from it. While one is connected, the interface clock looks ten times a second and wakes the scene when it is touched.
  function watch() {
    if (watching || !connected) return; watching = true;
    import('./ui-ticker.js').then(({ onTick }) => { if (connected && !unwatch) unwatch = onTick(() => { const device = first(); if (device && busy(device)) wake(); }, 10); }).catch(() => {}).finally(() => { watching = false; });
  }
  const count = () => { let total = 0; const pads = navigator.getGamepads?.() || []; for (let i = 0; i < pads.length; i++) if (pads[i]?.connected) total++; return total; };
  const onConnect = () => { connected = Math.max(1, count()); watch(); wake(); };
  const onDisconnect = () => { connected = count(); if (!connected) { unwatch?.(); unwatch = null; held.fill(0); } wake(); };
  addEventListener('gamepadconnected', onConnect); addEventListener('gamepaddisconnected', onDisconnect);

  return {
    get connected() { return connected > 0; },
    /** Fills `out` ({active,x,y,lookX,lookY,rise,sink,scooter}): x right, y forward, lookX right, lookY up, each -1..1. */
    poll(out, deadZone = .14) {
      const device = first();
      if (!device) { out.active = out.scooter = false; out.x = out.y = out.lookX = out.lookY = out.rise = out.sink = 0; return out; }
      const dead = Math.min(.9, Math.max(0, deadZone));
      shape(device.axes[0] || 0, device.axes[1] || 0, dead, MOVE_CURVE); out.x = shaped.x; out.y = -shaped.y;
      shape(device.axes[2] || 0, device.axes[3] || 0, dead, LOOK_CURVE); out.lookX = shaped.x; out.lookY = -shaped.y;
      out.rise = value(device, 7); out.sink = value(device, 6); out.scooter = pressed(device, 1);
      out.active = Boolean(out.x || out.y || out.lookX || out.lookY || out.rise || out.sink || out.scooter);
      // Taps act once, on the way down.
      for (let i = 0; i < TAPS.length; i++) { const index = TAPS[i][0], down = pressed(device, index) ? 1 : 0; if (down && !held[index]) onAction(TAPS[i][1]); held[index] = down; }
      const sinking = out.sink > .5 ? 1 : 0; if (sinking && !held[6]) onAction('dive'); held[6] = sinking;
      if (out.active && !moved) { moved = true; if (document.documentElement.dataset.input !== 'gamepad') document.documentElement.dataset.input = 'gamepad'; } else if (!out.active) moved = false;
      return out;
    },
    destroy() { removeEventListener('gamepadconnected', onConnect); removeEventListener('gamepaddisconnected', onDisconnect); unwatch?.(); unwatch = null; }
  };
}
