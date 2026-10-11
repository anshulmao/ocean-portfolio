// The scene and tuning panel share this object. Storage is optional.
const STORAGE_KEY = 'anshul-ocean-refinement-v1';
const number = (key, label, group, value, min, max, step, unit = '', description = '') => ({key, label, group, type:'number', value, min, max, step, unit, description});
const toggle = (key, label, group, value, description = '') => ({key, label, group, type:'boolean', value, description});
const choice = (key, label, group, value, options, description = '') => ({key, label, group, type:'select', value, options, description});

export const schema = [
  number('brightnessBoost','Increase brightness','Lighting',0,0,100,5,'%', 'Brightens the underwater view while preserving the day/night cycle.'),
  number('swimSpeed','Forward speed','Swimming',4,.5,8,.1,'m/s'),
  number('reverseMultiplier','Reverse speed multiplier','Swimming',.75,.1,1,.01,'×'),
  number('strafeMultiplier','Strafe speed multiplier','Swimming',.85,.1,1,.01,'×'),
  number('verticalSpeed','Ascend / descend speed','Swimming',2.3,.3,6,.1,'m/s'),
  number('acceleration','Acceleration response','Swimming',5.5,.5,15,.1),
  number('deceleration','Stopping response','Swimming',7,.5,15,.1),
  choice('keyboardMode','A / D behavior','Swimming','strafe',[{value:'strafe',label:'Strafe'},{value:'turn',label:'Turn'}]),
  toggle('swimTowardLook','Swim toward your aim','Swimming',false,'Forward movement follows your vertical aim. Space and Shift still control depth.'),
  number('lookResponse','Aim smoothing','Mouse & aim',12,1,30,.5),
  number('mouseSensitivity','Mouse sensitivity','Mouse & aim',.0024,.0005,.012,.0001,'rad/px'),
  toggle('invertMouse','Invert vertical mouse','Mouse & aim',false),
  number('pitchLimit','Vertical aim limit','Mouse & aim',85,20,89,1,'°'),
  number('keyLookSpeed','Arrow up / down aim speed','Mouse & aim',.8,.1,3,.05,'rad/s'),
  number('keyTurnSpeed','Arrow left / right turn speed','Mouse & aim',.78,.1,3,.01,'rad/s'),
  toggle('pointerLock','Capture mouse on scene click','Mouse & aim',true,'Click the underwater scene to capture the pointer; press Escape to release it.'),
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

export const defaults = Object.freeze(Object.fromEntries(schema.map(item => [item.key,item.value])));
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

export function persistSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); return true; }
  catch { return false; }
}

export function setSetting(key, value) {
  const item = byKey.get(key);
  if (!item) return undefined;
  settings[key] = normalize(item, value);
  persistSettings();
  return settings[key];
}

export function resetSettings() {
  Object.assign(settings, defaults);
  persistSettings();
  return settings;
}

try {
  const current = localStorage.getItem(STORAGE_KEY);
  const legacy = current === null ? localStorage.getItem('anshul-ocean-movement-v1') : null;
  const saved = JSON.parse(current ?? legacy ?? 'null');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const item of schema) {
      if (item.key==='pointerLock'&&legacy!==null) continue;
      if (Object.hasOwn(saved,item.key)) settings[item.key] = normalize(item,saved[item.key]);
    }
    if(legacy!==null)persistSettings();
  }
} catch { /* A corrupt record or unavailable storage leaves sensible defaults. */ }
