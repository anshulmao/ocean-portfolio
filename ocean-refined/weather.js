import * as THREE from './vendor/three.module.min.js';
import { sea, weatherUniforms } from './shaders.js';

export const WEATHER_STATES = ['clear', 'rain', 'storm'];
// Live intensities, 0..1, for modules that only read the weather (birds, clouds).
export const intensity = { rain: 0, wind: .18, storm: 0, cloud: 0 };

// Tuning. LEVELS: what each state settles at. DRIFT: seconds spent in a state
// and the odds of what follows it (roughly two thirds clear, a quarter rain and
// a tenth storm over a long visit); FIRST is the shorter opening spell of clear
// sky, so a visit of a few minutes still meets some weather. FADE: seconds a
// cross-fade takes when the weather drifts on its own, and when the visitor
// picks a state.
const LEVELS = {
  clear: { rain: 0, wind: .18, storm: 0, cloud: 0 },
  rain: { rain: .5, wind: .45, storm: 0, cloud: .6 },
  storm: { rain: 1, wind: 1, storm: 1, cloud: 1 }
};
const DRIFT = {
  clear: { dwell: [420, 840], next: { rain: .82, storm: .18 } },
  rain: { dwell: [100, 220], next: { clear: .8, storm: .2 } },
  storm: { dwell: [80, 150], next: { rain: .5, clear: .5 } }
};
const FIRST = [150, 300];
const FADE = { drift: 70, manual: 14 };
// Cloud builds before the rain arrives and clears after it stops: each channel
// crosses its own part of the fade, [rising, falling].
const WINDOWS = { cloud: [[0, .7], [.3, 1]], rain: [[.4, 1], [0, .6]], wind: [[.1, .9], [.1, .9]], storm: [[.25, 1], [0, .75]] };
// Sea state at full storm, on top of the calm sea (gain 1, chop 1, no storm swell).
const SEA = { gain: .5, chop: .9, swell: .4, speed: .45 };
// Lightning: only above this storm intensity, one soft pulse every few seconds.
const LIGHTNING = { above: .55, gap: [7, 18], rise: .09, decay: .32 };
const RAIN = { box: [34, 20, 34], fall: 13, streaks: 2400 };
const { clamp, lerp, smoothstep } = THREE.MathUtils;

const rainVertex = /* glsl */ `
uniform vec4 uWeather;uniform float uDive;uniform float uNight;uniform vec4 uFlash;
uniform vec3 uRainOffset;uniform vec2 uRainSlant;
attribute vec4 aSeed;attribute vec2 aCorner;
varying float vAlpha;varying vec2 vCorner;
const vec3 BOX=vec3(${RAIN.box.map(v => v.toFixed(1)).join(',')});
void main(){
  // Streaks live in a box that wraps around the eye, so the rain is anchored in the world.
  float pace=.8+.4*aSeed.w;
  vec3 home=aSeed.xyz*BOX+vec3(uRainOffset.y,-uRainOffset.x,uRainOffset.z)*pace;
  vec3 local=mod(home-cameraPosition,BOX)-BOX*.5;
  vec3 fall=normalize(vec3(uRainSlant.x,-1.0,uRainSlant.y));
  vec3 world=cameraPosition+local-fall*aCorner.y*(.4+.5*aSeed.w)*(1.0+uWeather.z*.25);
  vec3 toEye=cameraPosition-world;float range=length(toEye);
  world+=normalize(cross(fall,toEye))*aCorner.x*clamp(range*.0016,.004,.022);
  float shown=clamp((uWeather.x*1.05-fract(aSeed.w*7.31))*10.0,0.0,1.0);
  float edge=1.0-smoothstep(.72,1.0,max(abs(local.x),abs(local.z))/(BOX.x*.5));
  vAlpha=shown*edge*smoothstep(.6,2.5,range)*smoothstep(-.1,.5,world.y)*(1.0-uDive)*mix(.26,.11,uNight)*(1.0+uFlash.w*2.0);
  vCorner=aCorner;
  gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);
}`;
const rainFragment = /* glsl */ `
uniform float uNight;varying float vAlpha;varying vec2 vCorner;
void main(){
  gl_FragColor=vec4(mix(vec3(.76,.83,.88),vec3(.46,.56,.70),uNight),vAlpha*(1.0-vCorner.x*vCorner.x)*(1.0-.65*vCorner.y));
}`;

export function createWeather({ uniforms, scene, economy = false, onChange } = {}) {
  weatherUniforms(uniforms);
  const root = new THREE.Group(); root.name = 'Weather';
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  // Rain: every streak is a quad in one geometry, one draw call.
  const count = economy ? RAIN.streaks * .45 | 0 : RAIN.streaks;
  const seeds = new Float32Array(count * 16), corners = new Float32Array(count * 8), indices = new Uint16Array(count * 6);
  for (let i = 0; i < count; i++) {
    const seed = [Math.random(), Math.random(), Math.random(), Math.random()];
    for (let corner = 0; corner < 4; corner++) {
      seeds.set(seed, i * 16 + corner * 4);
      corners.set([corner % 2 ? 1 : -1, corner < 2 ? 0 : 1], i * 8 + corner * 2);
    }
    indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 12), 3));
  rainGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  rainGeometry.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
  rainGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const rainOffset = new THREE.Vector3(), rainSlant = new THREE.Vector2();
  const rain = new THREE.Mesh(rainGeometry, new THREE.ShaderMaterial({
    uniforms: { uWeather: uniforms.uWeather, uDive: uniforms.uDive, uNight: uniforms.uNight, uFlash: uniforms.uFlash,
      uRainOffset: { value: rainOffset }, uRainSlant: { value: rainSlant } },
    vertexShader: rainVertex, fragmentShader: rainFragment, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false
  }));
  rain.name = 'Rain streaks'; rain.frustumCulled = false; rain.renderOrder = 6; rain.visible = false; root.add(rain);
  scene?.add(root);

  const keys = Object.keys(intensity), from = { ...LEVELS.clear };
  const wind = uniforms.uWind.value, cloudOffset = uniforms.uCloudOffset.value;
  const deckLow = uniforms.uDeckLow.value, deckHigh = uniforms.uDeckHigh.value, haze = new THREE.Color(), overcastSun = new THREE.Color('#c9d3da');
  let state = 'clear', target = 'clear', locked = false, fade = 1, fadeSeconds = FADE.drift, lastDt = 1 / 60, announced = '';
  let flash = 0, flashAge = 9, flashPower = 0, nextFlash = 4;
  const span = ([low, high]) => low + Math.random() * (high - low);
  let dwell = span(FIRST);

  let stored = null; try { stored = localStorage.getItem('ocean-weather'); } catch {}
  if (WEATHER_STATES.includes(stored)) { target = stored; locked = true; Object.assign(intensity, LEVELS[stored]); }
  else Object.assign(intensity, LEVELS.clear);

  function dominant() { return intensity.storm > .5 ? 'storm' : intensity.rain > .2 || intensity.cloud > .35 ? 'rain' : 'clear'; }
  function announce() {
    state = dominant();
    const signature = `${state}|${target}|${locked}`;
    if (signature === announced) return;
    const first = !announced; announced = signature;
    document.documentElement.dataset.weather = state;
    const detail = { state, target, locked };
    onChange?.(detail);
    if (!first) window.dispatchEvent(new CustomEvent('oceanweatherchange', { detail }));
  }
  function remember() { try { localStorage.setItem('ocean-weather', locked ? target : 'auto'); } catch {} }
  function go(name, seconds) {
    if (name === target && fade >= 1) return;
    Object.assign(from, intensity); target = name; fade = 0; fadeSeconds = seconds; dwell = span(DRIFT[name].dwell) + seconds;
    // A paused scene cannot animate the change, so it lands at once.
    if (lastDt === 0) settle(1);
  }
  function settle(progress) {
    fade = progress;
    for (const key of keys) {
      const a = from[key], b = LEVELS[target][key], [low, high] = WINDOWS[key][b > a ? 0 : 1];
      intensity[key] = lerp(a, b, smoothstep(fade, low, high));
    }
  }
  function pick(odds) {
    let roll = Math.random();
    for (const [name, chance] of Object.entries(odds)) if ((roll -= chance) <= 0) return name;
    return Object.keys(odds)[0];
  }
  /** 'auto' resumes drifting; a state name cross-fades to it and holds it. */
  function set(name) {
    if (name === 'auto') { locked = false; dwell = span(DRIFT[target].dwell); }
    else if (LEVELS[name]) { locked = true; go(name, FADE.manual); }
    else return target;
    remember(); announce(); return target;
  }
  /** Hold whatever the weather is heading for, or let it drift again. */
  function lock(value = true) {
    locked = Boolean(value); if (!locked) dwell = span(DRIFT[target].dwell);
    remember(); announce(); return locked;
  }

  function update(dt, elapsed, cameraPosition, underwater, night) {
    lastDt = dt;
    if (fade < 1) { if (dt > 0) settle(Math.min(1, fade + dt / fadeSeconds)); }
    else if (!locked && dt > 0 && (dwell -= dt) <= 0) go(pick(DRIFT[target].next), FADE.drift);
    const w = intensity, blow = clamp((w.wind - LEVELS.clear.wind) / (1 - LEVELS.clear.wind), 0, 1);
    // One sea state for the shader and for waveHeight(): the diver stays on the drawn surface.
    sea.gain = 1 + SEA.gain * (.54 * blow + .46 * w.storm); sea.chop = 1 + SEA.chop * blow; sea.swell = SEA.swell * (.18 * blow + .82 * w.storm);
    sea.shift += dt * SEA.speed * blow;
    uniforms.uSea.value.set(sea.gain, sea.chop, sea.swell, smoothstep(blow, .2, 1));
    uniforms.uSeaTime.value = elapsed + sea.shift;
    uniforms.uSeaFocus.value.set(cameraPosition.x, cameraPosition.z);
    uniforms.uWeather.value.set(w.rain, w.wind, w.storm, w.cloud);
    // Cloud and rain are carried by the same wind; gusts only lean the rain.
    const speed = 3 + 14 * w.wind, gust = 1 + .16 * Math.sin(elapsed * .31) * Math.sin(elapsed * .17 + 1);
    cloudOffset.addScaledVector(wind, speed * dt);
    uniforms.uCloudDrift.value.copy(cloudOffset).multiplyScalar(-.004);
    const push = (2 + 9 * w.wind) * gust;
    rainOffset.x += dt * RAIN.fall; rainOffset.y += dt * push * wind.x; rainOffset.z += dt * push * wind.y;
    rainSlant.copy(wind).multiplyScalar(push / RAIN.fall);
    rain.visible = w.rain > .004 && underwater < .995;
    // Colours of the overcast deck: light grey in rain, slate with a darker horizon in a storm.
    const sunY = uniforms.uSun.value.y, twilight = (1 - smoothstep(Math.abs(sunY), .02, .32)) * (1 - night), dim = lerp(1, .07, night);
    deckLow.set(lerp(.60, .105, w.storm), lerp(.65, .125, w.storm), lerp(.68, .155, w.storm)).multiplyScalar(dim);
    deckHigh.set(lerp(.52, .20, w.storm), lerp(.57, .225, w.storm), lerp(.62, .26, w.storm)).multiplyScalar(dim);
    deckLow.x *= 1 - .08 * twilight; deckLow.y *= 1 - .34 * twilight; deckLow.z *= 1 - .38 * twilight;
    deckHigh.x *= 1 - .12 * twilight; deckHigh.y *= 1 - .36 * twilight; deckHigh.z *= 1 - .36 * twilight;
    // Lightning: a single soft pulse, never a strobe, and none for visitors who asked for less motion.
    if (dt > 0 && w.storm > LIGHTNING.above && !calm.matches && (nextFlash -= dt) <= 0) {
      const angle = Math.random() * Math.PI * 2;
      flashAge = 0; flashPower = .55 + Math.random() * .45; nextFlash = span(LIGHTNING.gap);
      window.dispatchEvent(new CustomEvent('oceanlightning', { detail: { power: flashPower } }));
      uniforms.uFlash.value.set(Math.cos(angle) * .9, .42, Math.sin(angle) * .9, 0).normalize();
    }
    flashAge += dt;
    flash = dt > 0 ? (flashAge < LIGHTNING.rise ? flashAge / LIGHTNING.rise : Math.exp(-(flashAge - LIGHTNING.rise) / LIGHTNING.decay)) * flashPower * w.storm : 0;
    if (flash < .004) flash = 0;
    uniforms.uFlash.value.w = flash;
    announce();
  }
  /** Daylight left under the cloud; everything underwater follows this. */
  function surfaceLight(base) { return base * (1 - .42 * intensity.cloud - .2 * intensity.storm) + flash * .3; }
  /** After the frame's lights and fog are set for the time of day, apply the weather to them. */
  function applyLighting({ fog, sunlight, ambient, underwater = 0 }) {
    const w = intensity, dry = 1 - underwater;
    fog.color.lerp(haze.setRGB(deckLow.x, deckLow.y, deckLow.z), w.cloud * .9 * dry);
    fog.density *= 1 + w.rain * .9 + w.storm * .3;
    sunlight.color.lerp(overcastSun, w.cloud * .6);
    sunlight.intensity *= 1 - .72 * w.cloud - .13 * w.storm;
    ambient.intensity = ambient.intensity * (1 - .28 * w.cloud - .17 * w.storm) + flash * 1.4 * dry;
  }
  announce();
  return { root, update, set, lock, surfaceLight, applyLighting, intensity, states: WEATHER_STATES,
    get state() { return state; }, get target() { return target; }, get locked() { return locked; },
    get flash() { return flash; }, get fading() { return fade < 1; } };
}
