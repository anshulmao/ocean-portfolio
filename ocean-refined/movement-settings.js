import { movementDefaults } from './movement-defaults.js';
// The scene and tuning panel share this object. Storage is optional.
// Version 3 adopts the supplied profile without overwriting older saved records.
const STORAGE_KEY = 'anshul-ocean-refinement-v3';
const VERSION = 3;
const number = (key, label, group, value, min, max, step, unit = '', description = '') => ({key, label, group, type:'number', value, min, max, step, unit, description});
const toggle = (key, label, group, value, description = '') => ({key, label, group, type:'boolean', value, description});
const choice = (key, label, group, value, options, description = '') => ({key, label, group, type:'select', value, options, description});

export const schema = [
  number('brightnessBoost','Increase brightness','Lighting',0,0,100,5,'%', 'Adds neutral illumination to model colors without changing sky tint or gamma.'),
  number('swimSpeed','Forward speed','Swimming',4,.5,8,.1,'m/s'),
  number('reverseMultiplier','Reverse speed multiplier','Swimming',.75,.1,1,.01,'×'),
  number('strafeMultiplier','Strafe speed multiplier','Swimming',.85,.1,1,.01,'×'),
  number('verticalSpeed','Ascend / descend speed','Swimming',2.3,.3,6,.1,'m/s'),
  number('acceleration','Swim start response','Swimming',7,.5,15,.1,'','How quickly a swim builds. Lower is a softer start.'),
  number('deceleration','Stopping response','Swimming',5,.5,15,.1,'','How quickly you settle after letting go. Lower glides further.'),
  choice('keyboardMode','A / D behavior','Swimming','turn',[{value:'turn',label:'Turn'},{value:'strafe',label:'Strafe'}]),
  number('turnSpeed','A / D turn speed','Swimming',1.4,.3,3,.05,'rad/s'),
  number('turnEase','Turn ease time','Swimming',.2,.05,.5,.01,'s','How long a turn takes to build and to settle, for A / D, the arrow keys and the sticks.'),
  number('carve','Carve through turns','Swimming',.6,0,1,.05,'','How much your momentum follows a turn. 0 drifts wide; 1 turns as if on rails.'),
  number('scooterBoost','Scooter boost (hold E while swimming)','Swimming',2.2,1,3.5,.1,'×','Multiplies your pace while E is held with W, S or the autopilot. E by itself only spools the motor; on the touch pad it also swims forward.'),
  toggle('swimTowardLook','Swim toward your aim','Swimming',false,'Forward movement follows your vertical aim. Space and Shift still control depth.'),
  toggle('depthAssist','Level out when idle','Swimming',false,'After a few seconds of swimming without aiming, your view eases back to level.'),
  toggle('mouseSmoothing','Smooth aim','Mouse & aim',true,'Light smoothing on mouse and touch aim. Off passes the input straight through.'),
  number('lookResponse','Aim response','Mouse & aim',18,1,30,.5,'','How tightly a smoothed aim follows your hand. Higher is tighter.'),
  number('mouseSensitivity','Mouse sensitivity','Mouse & aim',.0024,.0005,.012,.0001,'rad/px'),
  toggle('invertMouse','Invert vertical aim','Mouse & aim',false),
  toggle('rawMouse','Raw mouse input','Mouse & aim',false,'Asks the browser for mouse movement without the system’s pointer acceleration while the mouse is captured. Takes effect on the next capture; ignored where unsupported.'),
  number('pitchLimit','Vertical aim limit','Mouse & aim',85,20,89,1,'°'),
  number('keyLookSpeed','Arrow up / down aim speed','Mouse & aim',.8,.1,3,.05,'rad/s'),
  number('keyTurnSpeed','Arrow left / right turn speed','Mouse & aim',.78,.1,3,.01,'rad/s'),
  toggle('pointerLock','Capture mouse on scene click','Mouse & aim',true,'Click the underwater scene to capture the pointer; press Escape to release it.'),
  number('touchSensitivity','Touch aim sensitivity','Touch & gamepad',.0055,.002,.012,.0001,'rad/px','Drag anywhere off the thumb-stick to look.'),
  number('stickDeadZone','Stick dead zone','Touch & gamepad',.14,.04,.4,.01,'','The centre of the thumb-stick and of a gamepad’s sticks that is ignored.'),
  number('gamepadLookSpeed','Gamepad aim speed','Touch & gamepad',2.2,.5,4,.1,'rad/s'),
  choice('cameraMode','Camera view','Camera','first',[{value:'first',label:'First person'},{value:'third',label:'Follow diver'}]),
  number('cameraDistance','Follow distance','Camera',8.2,3,12,.1,'m'),
  number('cameraHeight','Follow height','Camera',2.2,0,4,.1,'m'),
  number('cameraResponse','Camera response','Camera',12,1,30,.5),
  number('cameraFov','Field of view','Camera',47,35,90,1,'°'),
  number('cameraLookAhead','Look ahead distance','Camera',4,0,10,.1,'m'),
  number('diveResponse','Dive transition response','Transitions',.95,.3,3,.05),
  number('surfaceReturnResponse','Surface return response','Transitions',3,.5,10,.1),
  number('ascentSpeed','Ascent speed','Transitions',5,1,12,.25,'m/s'),
  number('ascentMaxDuration','Maximum ascent duration','Transitions',18,5,45,1,'s'),
  number('ascentThreshold','Automatic surface threshold','Transitions',2.6,.5,6,.1,'m depth'),
  number('ascentSlowdown','Near-surface slowdown','Transitions',5,1,12,.25,'m'),
  number('bobAmplitude','Idle bob amount','Diver & motion',.028,0,.2,.001,'m'),
  number('bobFrequency','Idle bob rate','Diver & motion',.36,0,3,.01,'rad/s'),
  number('idleMotion','Idle drift and breathing','Diver & motion',1,0,2,.05,'×','A slow rise and fall and a slight lean with the current while you hover. Always off with reduced motion.'),
  number('bank','Bank into turns','Diver & motion',1,0,2,.05,'×','How far the diver rolls into a turn. Always off with reduced motion.'),
  number('diverScale','Diver size','Diver & motion',1.35,.75,1.6,.01,'×'),
  number('diverTrim','Swimming body angle','Diver & motion',.15,-.25,.35,.01,'rad'),
  number('kickFrequency','Fin kick rate','Diver & motion',1.8,.1,5,.1,'rad/s'),
  number('kickAmplitude','Fin kick amplitude','Diver & motion',.095,0,.3,.005,'rad'),
  toggle('collisionEnabled','Coral collisions','Reef & collision',true),
  number('collisionRadius','Diver collision radius','Reef & collision',.55,.25,1,.01,'m'),
  number('collisionLength','Diver collision length','Reef & collision',2,0,3,.1,'m'),
  number('collisionPadding','Coral clearance','Reef & collision',.08,0,.3,.01,'m'),
  number('collisionStep','Collision movement step','Reef & collision',.2,.05,.4,.01,'m'),
  number('collisionIterations','Collision solver passes','Reef & collision',4,2,8,1),
  number('floorClearance','Seabed clearance','Reef & collision',1.7,.5,3,.1,'m'),
  number('travelArrival','Atlas arrival distance','Atlas travel',.45,.2,2,.05,'m'),
  number('travelSlowdown','Atlas slowdown distance','Atlas travel',5,.5,12,.1,'m'),
  number('atlasCruiseSpeed','Atlas cruise speed','Atlas travel',8,2,16,.25,'m/s'),
];

// How the controls feel, as three starting points. Choosing one sets these keys; moving any of them afterwards makes the feel 'custom'.
export const presets = Object.freeze({
  relaxed:    {label:'Relaxed',    description:'Soft starts, long glides, slow turns.',      values:{acceleration:5,  deceleration:3.4, turnSpeed:1.15, turnEase:.26, carve:.5,  mouseSmoothing:true,  lookResponse:13, cameraResponse:9,  bank:1.2, idleMotion:1.2}},
  standard:   {label:'Standard',   description:'Calm and predictable.',                      values:{acceleration:7,  deceleration:5,   turnSpeed:1.4,  turnEase:.2,  carve:.6,  mouseSmoothing:true,  lookResponse:18, cameraResponse:12, bank:1,   idleMotion:1}},
  responsive: {label:'Responsive', description:'Quick starts and stops, raw aim, tight turns.', values:{acceleration:11, deceleration:8,   turnSpeed:1.8,  turnEase:.12, carve:.8,  mouseSmoothing:false, lookResponse:26, cameraResponse:16, bank:.6,  idleMotion:.6}},
});
const presetKeys = new Set(Object.keys(presets.standard.values));

// Normalize fallbacks and Reset use the same imported profile as a fresh visit.
for (const item of schema) if (Object.hasOwn(movementDefaults,item.key)) item.value = movementDefaults[item.key];
export const defaults = Object.freeze({...Object.fromEntries(schema.map(item => [item.key,item.value])), preset:movementDefaults.preset});
export const settings = {...defaults};
const byKey = new Map(schema.map(item => [item.key,item]));

function normalize(item, value) {
  if (item.type === 'boolean') return typeof value === 'boolean' ? value : item.value;
  if (item.type === 'select') return item.options.some(option => option.value === value) ? value : item.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return item.value;
  const clamped = Math.min(item.max, Math.max(item.min, value));
  // Integer controls stay integral; floats preserve finer tuning within bounds.
  return item.step === 1 ? Math.round(clamped) : Number(clamped.toFixed(6));
}
// The preset whose every value is the one in use, or 'custom'.
function matchPreset() {
  for (const [name, preset] of Object.entries(presets)) if (Object.entries(preset.values).every(([key, value]) => settings[key] === value)) return name;
  return 'custom';
}

export function persistSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({_version:VERSION, ...settings})); return true; }
  catch { return false; }
}

export function setSetting(key, value) {
  const item = byKey.get(key);
  if (!item) return undefined;
  settings[key] = normalize(item, value);
  if (presetKeys.has(key)) settings.preset = matchPreset();
  persistSettings();
  return settings[key];
}

export function applyPreset(name) {
  const preset = presets[name];
  if (!preset) return undefined;
  for (const [key, value] of Object.entries(preset.values)) settings[key] = normalize(byKey.get(key), value);
  settings.preset = name;
  persistSettings();
  return settings;
}

export function resetSettings() {
  Object.assign(settings, defaults);
  persistSettings();
  return settings;
}

try {
  const current = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  if (current && typeof current === 'object' && !Array.isArray(current) && current._version === VERSION) {
    for (const item of schema) if (Object.hasOwn(current, item.key)) settings[item.key] = normalize(item, current[item.key]);
    settings.preset = matchPreset();
  }
  // v3 adopts the supplied profile once. Older saved profiles are left in
  // storage, while subsequent visitor adjustments persist under this version.
} catch { /* A corrupt record or unavailable storage leaves sensible defaults. */ }
