import * as THREE from './vendor/three.module.min.js';
import { backdropGLSL } from './ocean-look.js';

// Sea state, written only by weather.js. The CPU wave function below and the
// water shader (uSea, uSeaTime) read the same numbers, so the diver, bubbles
// and boats ride the surface that is drawn, calm or stormy.
export const sea = { gain: 1, chop: 1, swell: 0, shift: 0 };

// Shared analytic waves keep the water, diver and bubbles in the same world.
export function waveHeight(x, z, time) {
  const t = time + sea.shift;
  return sea.gain * (.22 * Math.sin(x * .38 + z * .2 + t * .65) + .13 * Math.sin(x * -.22 + z * .52 + t * .86))
    + sea.chop * (.065 * Math.sin(x * .9 + z * .68 + t * 1.1) + .035 * Math.sin(x * 1.72 - z * 1.36 + t * 1.3))
    + sea.swell * (.62 * Math.sin(x * .105 + z * .062 + t * .46) + .38 * Math.sin(x * -.071 + z * .151 + t * .58));
}

// Four tiling fbm fields baked once (r, g: cloud density and shading, b: cirrus,
// a: broad storm masses). One read replaces a four-octave fbm per pixel, which
// was the main cost of the surface view on an integrated GPU.
let noiseMap = null;
function noiseTexture(size = 512, cells = 32) {
  const data = new Uint8Array(size * size * 4), octaves = [4, 4, 4, 2];
  let seed = 9173;
  const random = () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296;
  for (let channel = 0; channel < 4; channel++) {
    const field = new Float32Array(size * size);
    let weight = .5;
    for (let octave = 0; octave < octaves[channel]; octave++, weight *= .5) {
      const n = (channel === 3 ? cells / 4 : cells) << octave, lattice = new Float32Array(n * n);
      for (let i = 0; i < lattice.length; i++) lattice[i] = random();
      // The column terms are the same on every row: worked out once per octave (the same numbers, so the same texture).
      const left = new Int32Array(size), right = new Int32Array(size), blend = new Float64Array(size);
      for (let x = 0; x < size; x++) { const fx = x / size * n, ix = fx | 0; let ux = fx - ix; ux = ux * ux * (3 - 2 * ux); left[x] = ix; right[x] = (ix + 1) % n; blend[x] = ux; }
      for (let y = 0; y < size; y++) {
        const fy = y / size * n, iy = fy | 0, y1 = (iy + 1) % n, row = iy * n, next = y1 * n, o = y * size;
        let uy = fy - iy; uy = uy * uy * (3 - 2 * uy);
        for (let x = 0; x < size; x++) {
          const ix = left[x], x1 = right[x], ux = blend[x];
          const a = lattice[row + ix], b = lattice[row + x1], c = lattice[next + ix], d = lattice[next + x1];
          field[o + x] += weight * (a + (b - a) * ux + (c - a + (a - b - c + d) * ux) * uy);
        }
      }
    }
    // The two-octave channel is rescaled to the range of the others.
    const scale = channel === 3 ? 255 * .9375 / .75 : 255;
    for (let i = 0; i < field.length; i++) data[i * 4 + channel] = Math.min(255, field[i] * scale);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

// One octave of tiling value noise (32 cells): a read where the water and the
// sand hashed four lattice corners per pixel.
let valueMap = null;
export function valueTexture(size = 256, cells = 32) {
  if (valueMap) return valueMap;
  const data = new Uint8Array(size * size), lattice = new Float32Array(cells * cells);
  let seed = 4471;
  for (let i = 0; i < lattice.length; i++) lattice[i] = (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296;
  for (let y = 0; y < size; y++) {
    const fy = y / size * cells, iy = fy | 0, y1 = (iy + 1) % cells;
    let uy = fy - iy; uy = uy * uy * (3 - 2 * uy);
    for (let x = 0; x < size; x++) {
      const fx = x / size * cells, ix = fx | 0, x1 = (ix + 1) % cells;
      let ux = fx - ix; ux = ux * ux * (3 - 2 * ux);
      const a = lattice[iy * cells + ix], b = lattice[iy * cells + x1], c = lattice[y1 * cells + ix], d = lattice[y1 * cells + x1];
      data[y * size + x] = Math.min(255, (a + (b - a) * ux + (c - a + (a - b - c + d) * ux) * uy) * 256);
    }
  }
  valueMap = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  valueMap.wrapS = valueMap.wrapT = THREE.RepeatWrapping;
  valueMap.magFilter = THREE.LinearFilter; valueMap.minFilter = THREE.LinearMipmapLinearFilter;
  valueMap.generateMipmaps = true; valueMap.needsUpdate = true;
  return valueMap;
}

// Every shader here reads these; they must exist before the first compile.
// Defaults describe clear weather, so a scene without weather.js is unchanged.
export function weatherUniforms(uniforms) {
  uniforms.uWeather ??= { value: new THREE.Vector4(0, .18, 0, 0) }; // rain, wind, storm, overcast
  uniforms.uSea ??= { value: new THREE.Vector4(1, 1, 0, 0) }; // swell gain, chop gain, storm swell (m), foam
  uniforms.uSeaTime ??= { value: 0 };
  uniforms.uSeaFocus ??= { value: new THREE.Vector2(0, -45) };
  uniforms.uWind ??= { value: new THREE.Vector2(-.885, -.466) };
  uniforms.uCloudDrift ??= { value: new THREE.Vector2() };
  uniforms.uCloudOffset ??= { value: new THREE.Vector2() }; // metres, read by the cumulus field
  // Cloud variety (see skyDetail). cloudVisit holds what each visit draws; weather.js turns it, with the drift, into
  // the uniforms below once a frame so the dome does not. uCumulus, uCirrus: the cumulus and cirrus fields' texture
  // coordinates from the ray's projection onto the cloud plane, as a 2x2 matrix (xy, zw: its columns); uCloudShift:
  // their offsets (xy, zw). Shape: mip bias of the cumulus field, cirrus amount, coverage bias. Climate: offset of the
  // coverage field.
  uniforms.cloudVisit ??= { value: { turn: 0, offset: new THREE.Vector2(), scale: .025, streak: 0, cirrusOffset: new THREE.Vector2() } };
  uniforms.uCumulus ??= { value: new THREE.Vector4(.06, 0, 0, .06) };
  uniforms.uCirrus ??= { value: new THREE.Vector4(.0072, 0, .0036, .138) };
  uniforms.uCloudShift ??= { value: new THREE.Vector4() };
  uniforms.uCloudShape ??= { value: new THREE.Vector4(0, 1, 0, 0) };
  uniforms.uCloudClimate ??= { value: new THREE.Vector2() };
  uniforms.uFlash ??= { value: new THREE.Vector4(0, .4, -1, 0) };
  uniforms.uDeckLow ??= { value: new THREE.Vector3(.6, .65, .68) };
  uniforms.uDeckHigh ??= { value: new THREE.Vector3(.52, .57, .62) };
  uniforms.uNoiseMap ??= { value: noiseMap ??= noiseTexture() };
  uniforms.uValueMap ??= { value: valueTexture() };
  uniforms.uSkyMap ??= { value: null }; // baked by the sky system, see skyMapFragment
  return uniforms;
}

const noise = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
`;

export const waveGLSL = /* glsl */ `
float wave(vec2 p) {
  float t=uSeaTime;
  return uSea.x*(.22*sin(dot(p,vec2(.38,.2))+t*.65)+.13*sin(dot(p,vec2(-.22,.52))+t*.86))
    +uSea.y*(.065*sin(dot(p,vec2(.9,.68))+t*1.1)+.035*sin(dot(p,vec2(1.72,-1.36))+t*1.3))
    +uSea.z*(.62*sin(dot(p,vec2(.105,.062))+t*.46)+.38*sin(dot(p,vec2(-.071,.151))+t*.58));
}
vec3 waterNormal(vec2 p) {
  float t=uSeaTime;
  vec2 d=uSea.x*(vec2(.38,.2)*.22*cos(dot(p,vec2(.38,.2))+t*.65)
    +vec2(-.22,.52)*.13*cos(dot(p,vec2(-.22,.52))+t*.86))
    +uSea.y*(vec2(.9,.68)*.065*cos(dot(p,vec2(.9,.68))+t*1.1)
    +vec2(1.72,-1.36)*.035*cos(dot(p,vec2(1.72,-1.36))+t*1.3)
    +vec2(2.8,1.9)*.016*cos(dot(p,vec2(2.8,1.9))+t*1.45)
    +vec2(-4.1,3.7)*.012*cos(dot(p,vec2(-4.1,3.7))+t*1.6)
    +vec2(7.2,-2.2)*.005*cos(dot(p,vec2(7.2,-2.2))+t*1.8))
    +uSea.z*(vec2(.105,.062)*.62*cos(dot(p,vec2(.105,.062))+t*.46)
    +vec2(-.071,.151)*.38*cos(dot(p,vec2(-.071,.151))+t*.58));
  return normalize(vec3(-d.x,1.0,-d.y));
}
`;

// Noise reads use an explicit mip level: an implicit one inside a branch makes
// the compiler evaluate both sides, and the branches here exist to skip work.
// (Small uniform-only branches are flattened by the D3D compiler anyway: what
// must really be skipped is a separate program, see SKY_* and WATER_WEATHER.)
//
// The sky is split in two. skySmooth() is everything that varies slowly across
// it: gradient, twilight, overcast, the glow round sun and moon, the Milky Way.
// It is baked once a frame into uSkyMap, a small hemi-octahedral map stored as
// a square root, and the dome, the sea's reflection, the horizon haze and
// Snell's window read that map: one texture read where each evaluated the
// whole sky per pixel. skyDetail() adds what needs the pixel grid.
export const SKY_MAP = 256;
const atmosphere = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uDive;
uniform float uDepth;
uniform vec3 uSun;
uniform vec3 uMoon;
uniform vec3 uMoonLight;
uniform float uMoonFraction;
uniform vec3 uMilkyWay;
uniform vec3 uLookSun;
uniform float uSurfaceLight;
uniform vec4 uWeather;
uniform vec4 uSea;
uniform float uSeaTime;
uniform vec2 uSeaFocus;
uniform vec2 uWind;
uniform vec2 uCloudDrift;
uniform vec4 uCumulus;
uniform vec4 uCirrus;
uniform vec4 uCloudShift;
uniform vec4 uCloudShape;
uniform vec2 uCloudClimate;
uniform vec4 uFlash;
uniform vec3 uDeckLow;
uniform vec3 uDeckHigh;
uniform sampler2D uNoiseMap;
uniform sampler2D uValueMap;
uniform sampler2D uSkyMap;
${noise}
${backdropGLSL}
float valueNoise(vec2 p,float lod){return textureLod(uValueMap,p*.03125,lod).r;}
// The glow close round the sun: warm while it is low, a near-white blue once it is well up (on a deep blue sky a warm
// glow reads violet). skySmooth bakes it under the clouds and skyDetail puts back the share a cloud covers.
vec3 sunHalo(vec3 ray) {
  return mix(vec3(.70,.47,.17),vec3(.48,.56,.66),smoothstep(.12,.42,uSun.y))*pow(max(dot(ray,uSun),0.0),70.0)*(1.0-uNight)*(1.0-uWeather.w*.85);
}
vec3 skySmooth(vec3 ray) {
  float h=max(ray.y,0.0),over=uWeather.w,open=1.0-over;
  // A low sun keeps the soft cyan of morning and evening; once it is well up (about 7 to 25 degrees) the sky turns a
  // clear blue: light toward the horizon, a mid blue through the band the surface copy sits on (kept light enough for
  // its dark text), deep overhead. ACES flattens a pale sky to white, so these keep red low and let blue run past 1.
  float day=smoothstep(.12,.42,uSun.y);
  vec3 low=mix(vec3(.48,.70,.81),vec3(.055,.26,.48),pow(min(h*2.5,1.0),.55));
  vec3 high=mix(mix(vec3(.13,.46,1.50),vec3(.08,.33,1.22),smoothstep(0.0,.24,h)),vec3(.025,.11,.46),smoothstep(.18,.85,h));
  vec3 color=mix(low,high,day);
  color+=vec3(.14,.085,.025)*pow(max(dot(ray,uSun),0.0),5.0)*(1.0-day*.7);
  color=mix(color,mix(vec3(.057,.101,.17),vec3(.006,.015,.051),pow(h,.45)),uNight);
  // Sunset/sunrise follows the moving sun along the horizon, including reflections.
  float twilight=(1.0-smoothstep(.02,.32,abs(uSun.y)));
  float warmDirection=pow(max(dot(normalize(vec3(ray.x,.03,ray.z)),normalize(vec3(uSun.x,.03,uSun.z))),0.0),6.0);
  float horizonGlow=exp(-h*8.0)*twilight*warmDirection;
  float belt=exp(-pow((h-.12)/.23,2.0))*twilight;
  color=mix(color,vec3(.105,.045,.24),belt*.62*(1.0-warmDirection*.65));
  color=mix(color,vec3(.86,.21,.045),horizonGlow*.93);
  color+=vec3(.17,.04,.006)*exp(-h*19.0)*twilight*warmDirection;
  // Overcast flattens the gradient into the weather's grey deck; lightning lifts it for a moment.
  color=mix(color,mix(uDeckLow,uDeckHigh,pow(min(h*3.0,1.0),.6)),over*.9);
  color+=vec3(.46,.54,.74)*uFlash.w*(.2+.8*pow(max(dot(ray,uFlash.xyz),0.0),3.0));
  color+=sunHalo(ray);
  color+=vec3(.11,.15,.22)*pow(max(dot(ray,uMoon),0.0),100.0)*uNight*uMoonFraction*open;
  // Smooth broad dust lanes stay continuous when looking toward the zenith.
  float band=exp(-pow(abs(dot(ray,uMilkyWay))/.12,2.0));
  float dust=.50+.22*sin(dot(ray,vec3(19.,13.,31.)))+.15*sin(dot(ray,vec3(-37.,23.,11.)))+.09*cos(dot(ray,vec3(27.,-43.,17.)));
  color+=vec3(.035,.044,.068)*band*(.30+.70*dust)*smoothstep(.55,.95,uNight)*smoothstep(.0,.12,ray.y)*(1.0-smoothstep(.12,.62,over));
  return color;
}
vec2 skyUv(vec3 ray) {
  ray.y=max(ray.y,0.0);
  vec2 p=ray.xz/(abs(ray.x)+ray.y+abs(ray.z));
  return vec2(p.x+p.y,p.x-p.y)*${(.5 - .5 / SKY_MAP).toFixed(6)}+.5;
}
vec3 skyBase(vec3 ray) { vec3 c=textureLod(uSkyMap,skyUv(ray),0.0).rgb; return c*c*4.0; }
// The baked colour, and in w the cloud climate baked with it.
vec4 skyBaked(vec3 ray) { vec4 c=textureLod(uSkyMap,skyUv(ray),0.0); return vec4(c.rgb*c.rgb*4.0,c.a); }
vec3 skySun(vec3 color,vec3 ray) {
  return mix(color,vec3(3.8,2.5,1.05),smoothstep(.99966,.99978,dot(ray,uSun))*(1.0-uNight)*(1.0-smoothstep(.12,.62,uWeather.w)));
}
// Where cumulus gathers on the sky just now, 0 (a few scattered puffs) to 1 (a bank): a broad field with its own slow
// drift (uCloudClimate) and a coverage that wanders over the visit (uCloudShape.z). It only varies over tens of degrees,
// so it is worked out in the bake and carried in the baked map's alpha: the dome reads it with the sky colour, free.
float cloudClimate(vec3 ray) {
  vec2 c=ray.xz/max(ray.y,.06)*.0192+uCloudClimate;
  float n=textureLod(uNoiseMap,c,0.0).a*.7+textureLod(uNoiseMap,c*2.3+vec2(.37,.61),0.0).r*.3;
  return smoothstep(.45,.70,n+uCloudShape.z);
}
// climate: cloudClimate() for this ray, from the baked map.
vec3 skyDetail(vec3 color,vec3 ray,float climate) {
  float over=uWeather.w,open=1.0-over,twilight=(1.0-smoothstep(.02,.32,abs(uSun.y)));
  if(ray.y>.005 && (uNight<.999 || over>.001)) {
    vec2 base=ray.xz/max(ray.y,.035),p=base*2.4+uCloudDrift;
    float lod=max(0.0,log2(.031/(ray.y*ray.y))-.5),lift=smoothstep(.025,.13,ray.y);
    // Each visit turns, shifts and scales the cumulus field its own way; the wind still carries it (uCumulus, uCloudShift).
    vec4 field=textureLod(uNoiseMap,mat2(uCumulus)*base+uCloudShift.xy,max(0.0,lod+uCloudShape.x));
    // Where the climate is low only the highest tops of the field show, as small scattered cumulus; where it is high they
    // merge into larger, denser clouds with grey cores. Weather closes all of it into one deck.
    float threshold=mix(mix(.64,.47,climate),.16,over),soft=mix(mix(.08,.17,climate),.22,over);
    float cloud=smoothstep(threshold,threshold+soft,field.r)*lift*mix(mix(.30,.72,climate),.94,over);
    float shade=field.g*(1.0-.3*climate*smoothstep(threshold+.08,threshold+.28,field.r)*open);
    vec3 cloudColor=mix(vec3(.63,.77,.83),vec3(1.0,.96,.85),smoothstep(.40,.68,shade));
    cloudColor=mix(cloudColor,vec3(.077,.105,.18)+shade*.05,uNight);
    cloudColor=mix(cloudColor,mix(vec3(.52,.22,.32),vec3(1.0,.67,.38),shade),twilight*.68);
    cloudColor=mix(cloudColor,mix(uDeckLow*.80,uDeckHigh*1.10,smoothstep(.30,.66,shade)),over);
    float cover=cloud*(1.0-uNight*open);
    color=mix(color,cloudColor,cover);
    if(uWeather.z>.01)color*=1.0-uWeather.z*.36*lift*smoothstep(.36,.62,textureLod(uNoiseMap,p*.0055+uCloudDrift*.004,max(0.0,lod-2.0)).a);
    // The sun's glow is baked beneath this layer; it shines through cloud, so the covered share is put back.
    color+=sunHalo(ray)*cover;
    // Thin high cirrus, distinct from the lower cumulus field; hidden above the deck. It is higher, so it moves slower
    // across the sky; its streaks lie along a direction of each visit's own, and it is thickest in the clear gaps.
    if(open>.01&&uNight<.999){
      float cirrus=pow(textureLod(uNoiseMap,mat2(uCirrus)*base+uCloudShift.zw,lod+1.2).b,4.0)*.38*uCloudShape.y*(1.0-.55*climate);
      color=mix(color,mix(vec3(.96,.95,.89),vec3(.11,.15,.22),uNight),cirrus*smoothstep(.1,.5,ray.y)*(1.0-uNight)*open);
    }
  }
  color=skySun(color,ray);
  if(uNight>.001){
    float moon=dot(ray,uMoon);
    float moonDisk=smoothstep(.99978,.99981,moon);
    // Reconstruct the visible lunar hemisphere and light it from the actual Sun.
    // The terminator follows the sky orientation rather than a fixed crescent cutout.
    vec3 tangent=ray-uMoon*moon;
    vec3 onDisk=tangent/.020;
    float radial=dot(onDisk,onDisk);
    vec3 lunarNormal=onDisk-uMoon*sqrt(max(0.0,1.0-radial));
    float lunarDay=smoothstep(-.025,.045,dot(lunarNormal,uMoonLight));
    float lunarTexture=.90+.045*sin(onDisk.x*37.0+onDisk.y*29.0)+.025*cos(onDisk.z*63.0+onDisk.x*23.0);
    // Earthshine is faint and shares the surrounding atmospheric color,
    // rather than drawing an opaque near-black sticker behind the crescent.
    vec3 moonShadow=color*.985+vec3(.002,.003,.004)*uNight;
    vec3 moonSurface=mix(moonShadow,vec3(.92,.97,1.0)*lunarTexture,lunarDay);
    color=mix(color,moonSurface,moonDisk*uNight*(1.0-smoothstep(.12,.62,over)));
  }
  return color;
}
`;

export const skyVertex = /* glsl */ `
varying vec3 vRay;
// The sky sits at the far plane, behind the cloud cores and the most distant water.
void main(){vRay=position;gl_Position=(projectionMatrix*modelViewMatrix*vec4(position,1.0)).xyww;}
`;
// Three programs for the dome: SKY_ABOVE (camera clear of the water) never
// evaluates the water backdrop, SKY_BELOW (fully submerged) nothing but it.
export const skyFragment = /* glsl */ `
${atmosphere}
varying vec3 vRay;
void main(){
  vec3 rd=normalize(vRay);
  #if defined(SKY_ABOVE)
  vec4 baked=skyBaked(rd);
  vec3 color=skyDetail(baked.rgb,rd,baked.a);
  #elif defined(SKY_BELOW)
  vec3 color=oceanBackdrop(rd,uLookSun,uSurfaceLight,uDepth);
  #else
  vec4 baked=skyBaked(rd);
  vec3 color=mix(skyDetail(baked.rgb,rd,baked.a),oceanBackdrop(rd,uLookSun,uSurfaceLight,uDepth),uDive);
  #endif
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
// Bakes skySmooth() over the upper hemisphere; one texel per map texel centre.
export const skyMapVertex = /* glsl */ `void main(){gl_Position=vec4(position.xy,0.0,1.0);}`;
export const skyMapFragment = /* glsl */ `
${atmosphere}
void main(){
  vec2 t=(gl_FragCoord.xy-.5)/${(SKY_MAP - 1).toFixed(1)}*2.0-1.0;
  vec2 p=vec2(t.x+t.y,t.x-t.y)*.5;
  vec3 ray=normalize(vec3(p.x,max(1.0-abs(p.x)-abs(p.y),0.0),p.y));
  gl_FragColor=vec4(sqrt(max(skySmooth(ray),0.0)*.25),cloudClimate(ray));
}
`;

export const waterVertex = /* glsl */ `
${atmosphere}
varying vec3 vWorld;
varying vec3 vHaze;
${waveGLSL}
void main(){
  // The fine centre of the grid follows the eye, so the swell is resolved wherever the diver surfaces.
  vec3 p=position;p.xz+=uSeaFocus+vec2(0.0,45.0);p.y=wave(p.xz);
  vWorld=(modelMatrix*vec4(p,1.0)).xyz;
  // Distance haze takes the horizon colour, which varies slowly: one read of the baked sky per vertex.
  vHaze=skyBase(normalize(vec3(vWorld.x-cameraPosition.x,.005,vWorld.z-cameraPosition.z)));
  gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);
}
`;
// WATER_WEATHER adds foam streaks and rain rings; calm water is a program without them.
export const waterFragment = /* glsl */ `
${atmosphere}
${waveGLSL}
varying vec3 vWorld;
varying vec3 vHaze;
// One expanding ring per cell, and only in some cells at a time: a raindrop for three hashes.
float rainRings(vec2 p,float t){
  vec2 cell=floor(p);float h=hash(cell);
  float beat=t*(.7+h*.6)+h*9.0,life=fract(beat);
  float d=length(fract(p)-.5-(vec2(hash(cell+3.1),hash(cell+7.7+floor(beat)))-.5)*.36);
  return smoothstep(.045,.0,abs(d-life*.28))*(1.0-life)*(1.0-life)*step(.35,fract(h*13.7+floor(beat)*.37));
}
void main(){
  vec3 normal=waterNormal(vWorld.xz);
  vec3 view=normalize(cameraPosition-vWorld);
  float distanceToEye=length(cameraPosition-vWorld);
  float fresnel=.025+.975*pow(1.0-max(dot(view,normal),0.0),4.5);
  float rain=uWeather.x,storm=uWeather.z,over=uWeather.w,foam=uSea.w;
  // Metres of surface under one pixel, for the mip level of noise mapped onto the water.
  float footprint=distanceToEye*distanceToEye*.001/max(abs(cameraPosition.y-vWorld.y),.6);
  vec3 color;
  // The two faces share nothing but the lines above, so each pays only for itself.
  if(gl_FrontFacing){
    vec3 reflected=reflect(-view,normal);
    reflected.y=max(reflected.y,.002);
    reflected=normalize(reflected);
    vec3 base=mix(vec3(.005,.098,.205),vec3(.004,.024,.068),uNight);
    // Under cloud the sea loses its blue and turns slate.
    base=mix(base,mix(vec3(.018,.054,.078),vec3(.004,.014,.026),uNight),over*.88);
    // The swell's faces vary the colour as well as the light: some lift toward a lighter, greener blue.
    float undulation=.5+.5*sin(vWorld.x*.38+vWorld.z*.20+uSeaTime*.65);
    float swellTint=.5+.5*sin(vWorld.x*.071-vWorld.z*.053+uSeaTime*.09);
    base+=mix(mix(vec3(.0,.014,.030),vec3(.0,.030,.026),swellTint),vec3(.001,.004,.009),uNight)*undulation*(1.0-over*.6);
    vec3 sky=skyBase(reflected);
    color=mix(base,sky,fresnel*.57);
    // A single rough-surface highlight; solar disk is not reflected twice.
    float alpha2=.00084;
    float sunVisibility=smoothstep(-.025,.09,uSun.y)*(1.0-over)*(1.0-over);
    float moonVisibility=smoothstep(-.025,.09,uMoon.y)*uMoonFraction*(1.0-over)*(1.0-over);
    vec3 glint=vec3(0.0);
    // Only a light that is up, and not behind cloud, glints.
    if(sunVisibility>.001){
      float sunN=max(dot(normal,normalize(view+uSun)),0.0),sunD=sunN*sunN*(alpha2-1.0)+1.0;
      glint+=vec3(1.0,.78,.48)*sunVisibility*alpha2/(3.14159*sunD*sunD);
    }
    if(moonVisibility>.001){
      float moonN=max(dot(normal,normalize(view+uMoon)),0.0),moonD=moonN*moonN*(alpha2-1.0)+1.0;
      glint+=vec3(.48,.66,.85)*moonVisibility*.16*alpha2/(3.14159*moonD*moonD);
    }
    color+=glint*.012*(.3+.7*fresnel);
    // Crest thresholds are relative to the tallest wave the current sea state can raise.
    float level=vWorld.y*.45/(uSea.x*.35+uSea.y*.1+uSea.z);
    float grain=log2(max(footprint*4.0,1.0));
    float crest=smoothstep(.22,.42,level)*(.4+.6*valueNoise(vWorld.xz*2.0,grain));
    color+=mix(vec3(.13,.23,.25),vec3(.025,.049,.067),uNight)*crest*.19;
    // Fine broken froth only on the highest nearby wave crests; wind spreads it into whitecaps.
    float froth=smoothstep(.345-.19*foam,.43-.10*foam,level)*smoothstep(.54-.22*foam,.78+.1*foam,valueNoise(vWorld.xz*4.2+vec2(uSeaTime*.08,-uSeaTime*.06),grain+1.0));
    vec3 white=mix(vec3(.66,.80,.78),vec3(.10,.18,.24),uNight)*mix(1.0,.74,over);
    color=mix(color,white,froth*mix(.24,.7,foam)*exp(-distanceToEye*mix(.045,.011,foam)));
    #ifdef WATER_WEATHER
    if(foam>.01){
      // Foam streaks: noise stretched along the wind, drifting downwind.
      vec2 along=vec2(dot(vWorld.xz,vec2(-uWind.y,uWind.x)),dot(vWorld.xz,uWind)-uSeaTime*.7);
      float streak=textureLod(uNoiseMap,along*vec2(.034,.0042),log2(max(footprint*2.2,1.0))).g;
      color=mix(color,white,smoothstep(.56,.74,streak+level*.22)*foam*.42*exp(-distanceToEye*.008));
    }
    if(rain>.01&&distanceToEye<24.0){
      float rings=rainRings(vWorld.xz*6.5,uTime*2.2)+rainRings(vWorld.xz*4.1+3.7,uTime*1.8);
      color+=mix(vec3(.20,.25,.27),vec3(.03,.04,.06),uNight)*rings*rain*(1.0-smoothstep(5.0,24.0,distanceToEye));
    }
    #endif
    // Rain thickens the haze, so the far sea dissolves into the sky.
    float haze=1.0-exp(-distanceToEye*.007*(1.0+rain*2.0));
    color=mix(color,vHaze,haze*mix(mix(.52,.92,rain),1.0,smoothstep(550.0,850.0,distanceToEye)));
  }else{
    float veil=1.0-exp(-distanceToEye*mix(.021,.034,uDepth));
    color=oceanBackdrop(-view,uLookSun,uSurfaceLight,uDepth);
    // Past the haze the surface is backdrop alone; nearer, it is drawn in full.
    if(veil<.995){
      // View the surface from below as broken, overlapping light sheets rather
      // than one continuous stripe. The calmer front face above is unchanged.
      vec2 surfaceUv=vWorld.xz+normal.xz*3.5;
      float broad=log2(max(footprint*.5,1.0));
      float warp=valueNoise(surfaceUv*.075+vec2(uTime*.018,-uTime*.013),broad);
      vec2 rippleA=vec2(surfaceUv.x*.42+surfaceUv.y*.19, surfaceUv.y*.28-surfaceUv.x*.11);
      vec2 rippleB=vec2(-surfaceUv.x*.17+surfaceUv.y*.38, surfaceUv.x*.12+surfaceUv.y*.16);
      float causticA=.5+.5*sin(rippleA.x+warp*2.1+uTime*.32)*sin(rippleA.y-warp*1.4-uTime*.22);
      float causticB=.5+.5*sin(rippleB.x-warp*1.7-uTime*.2)*sin(rippleB.y+warp*1.2+uTime*.27);
      float caustic=pow(clamp(causticA*.63+causticB*.37,0.0,1.0),3.1);
      float mottling=valueNoise(surfaceUv*.16+vec2(uTime*.012,uTime*.009),broad+1.0);
      float turbulence=textureLod(uNoiseMap,(surfaceUv*.55+vec2(uTime*.22,-uTime*.17))*.03125,log2(max(footprint*8.8,1.0))).r;
      // A storm sea churns across far more of its underside.
      float churn=smoothstep(.58-.13*storm,.76-.11*storm,turbulence+length(normal.xz)*.7);
      vec3 underside=mix(vec3(.015,.16,.25),vec3(.07,.35,.42),caustic*.55*(1.0-over*.5)+mottling*.17+fresnel*.16);
      underside+=vec3(.017,.042,.050)*pow(caustic,2.0)*(1.0-over*.7);
      // Snell's window shows the baked sky and the sun's disc; outside it nothing is transmitted.
      vec3 transmitted=refract(-view,-normal,1.333);
      if(dot(transmitted,transmitted)>=.01){
        transmitted=normalize(transmitted+vec3(0.,.0001,0.));
        underside=mix(underside,skySun(skyBase(transmitted),transmitted),.56);
      }
      underside+=vec3(.18,.28,.30)*churn*.65;
      #ifdef WATER_WEATHER
      if(rain>.01){
        // Each drop dimples the skin of the water: a dark pit inside a bright ring.
        float rings=rainRings(vWorld.xz*1.7,uTime*1.4)+rainRings(vWorld.xz*1.05+5.3,uTime*1.1);
        underside=underside*(1.0-rings*rain*.3)+vec3(.12,.20,.23)*rings*rain;
      }
      #endif
      underside*=(.16+.84*smoothstep(0.0,.75,uSurfaceLight))*mix(1.0,.36,uDepth);
      color=mix(underside,color,veil);
    }
  }
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const starsVertex = /* glsl */ `
uniform float uTime;uniform float uNight;uniform float uDive;uniform float uRatio;uniform vec4 uWeather;
attribute float aSize;attribute float aSeed;attribute vec3 aColor;
varying float vAlpha;varying vec3 vColor;
void main(){
  vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=(projectionMatrix*p).xyww;
  gl_PointSize=aSize*uRatio;
  float horizon=normalize((modelMatrix*vec4(position,0.0)).xyz).y;
  vAlpha=smoothstep(.30,.88,uNight)*(1.0-uDive)*smoothstep(.0,.09,horizon)*(.85+.15*sin(uTime*.8+aSeed));
  // Stars go out behind the weather.
  vAlpha*=1.0-smoothstep(.08,.55,uWeather.w);
  vColor=aColor;
}
`;
export const starsFragment = /* glsl */ `
varying float vAlpha;varying vec3 vColor;
void main(){float d=length(gl_PointCoord-.5);float alpha=smoothstep(.5,.06,d)*vAlpha;
gl_FragColor=vec4(vColor,alpha);}
`;

// Edge smoothing for GPUs where multisampling costs a fifth of the frame: the scene is drawn once without it and this
// pass blends along the edges it finds in the finished picture (four corner reads to find one, four along it). A pixel
// with no contrast around it is passed through untouched, so painted surfaces keep their grain.
export const smoothVertex = /* glsl */ `varying vec2 vUv;void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.0,1.0);}`;
export const smoothFragment = /* glsl */ `
uniform sampler2D tFrame;uniform vec2 uTexel;varying vec2 vUv;
void main(){
  vec3 m=textureLod(tFrame,vUv,0.0).rgb;
  const vec3 W=vec3(.299,.587,.114);
  float nw=dot(textureLod(tFrame,vUv+vec2(-uTexel.x,-uTexel.y),0.0).rgb,W),ne=dot(textureLod(tFrame,vUv+vec2(uTexel.x,-uTexel.y),0.0).rgb,W);
  float sw=dot(textureLod(tFrame,vUv+vec2(-uTexel.x,uTexel.y),0.0).rgb,W),se=dot(textureLod(tFrame,vUv+uTexel,0.0).rgb,W),lm=dot(m,W);
  float low=min(lm,min(min(nw,ne),min(sw,se))),high=max(lm,max(max(nw,ne),max(sw,se)));
  gl_FragColor=vec4(m,1.0);
  // Nine pixels in ten have no edge near them and stop here: the reads below are explicit-level, so the branch is a real one.
  if(high-low>=max(.035,high*.09)){
    vec2 dir=vec2((sw+se)-(nw+ne),(nw+sw)-(ne+se));
    float scale=1.0/(min(abs(dir.x),abs(dir.y))+max((nw+ne+sw+se)*.03125,.0078125));
    dir=clamp(dir*scale,-8.0,8.0)*uTexel;
    vec3 a=.5*(textureLod(tFrame,vUv-dir*.16666667,0.0).rgb+textureLod(tFrame,vUv+dir*.16666667,0.0).rgb);
    vec3 b=a*.5+.25*(textureLod(tFrame,vUv-dir*.5,0.0).rgb+textureLod(tFrame,vUv+dir*.5,0.0).rgb);
    float lb=dot(b,W);
    gl_FragColor.rgb=(lb<low||lb>high)?a:b;
  }
}
`;

export const beamVertex = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv=uv;
  #ifdef USE_INSTANCING
  gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);
  #else
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
  #endif
}
`;
export const beamFragment = /* glsl */ `
uniform float uTime;uniform float uDive;uniform float uNight;uniform float uSurfaceLight;uniform vec4 uWeather;varying vec2 vUv;
void main(){
  float edge=pow(sin(vUv.x*3.14159),2.0);
  // Streaks drift sideways so each shaft reads as many thin rays.
  float streak=.55+.45*sin(vUv.x*23.0+uTime*.35)*sin(vUv.x*9.0-uTime*.21);
  // Cloud diffuses the sun: shafts lose their rays first, then most of their strength.
  streak=mix(streak,.55,uWeather.w*.7);
  float fade=smoothstep(0.0,.12,1.0-vUv.y)*pow(vUv.y,1.6);
  float shimmer=.8+.2*sin(vUv.y*6.0-uTime*.5);
  gl_FragColor=vec4(.55,.89,.92,edge*streak*fade*shimmer*uDive*min(uSurfaceLight,1.2)*(1.0-uWeather.w*.6)*.22);
}
`;
