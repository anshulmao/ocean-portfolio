import * as THREE from './vendor/three.module.min.js';

// One shared look for every lit surface in the ocean: soft stepped shading,
// a cool rim, projected caustics and water that absorbs colour with distance
// before fading into the same backdrop the sky dome paints. Procedural and
// imported models pass through the same treatment, so they read as one world.
export const look = {
  uLookTime: { value: 0 },
  uLookUnder: { value: 0 },
  uLookLight: { value: 1 },
  uLookDepth: { value: 0 },
  uLookBrightness: { value: 0 },
  // Water clarity (settings: waterClarity / 100): the haze is worked out over the distance divided by it, so 1.25 sees 25% further.
  uLookClarity: { value: 1 },
  uLookSun: { value: new THREE.Vector3(0, 1, 0) }
};

// Colour of open water along a view ray. Shared with the sky dome and the
// underside of the surface so distant silhouettes dissolve into it exactly.
// blue (0..1): how deep the water around reads. Deep water and the drop-off are
// a clear ocean blue; the sunlit sand shallows keep a touch of green, as does a
// low sun. oceanBackdrop takes it from the eye's depth alone.
export const backdropGLSL = /* glsl */ `
vec3 oceanWater(vec3 ray, vec3 sun, float light, float depth, float blue) {
  float h = ray.y;
  blue = (.6 + .4 * blue) * (.65 + .35 * smoothstep(.15, .9, light));
  vec3 below = mix(vec3(.020,.215,.330), vec3(.008,.112,.330), blue);
  vec3 above = mix(vec3(.082,.535,.610), vec3(.060,.395,.645), blue);
  vec3 color = mix(below, above, smoothstep(-.05, .85, h));
  color = mix(color, vec3(.005,.038,.122), 1.0 - smoothstep(-.80, .08, h));
  vec3 toward = normalize(vec3(sun.x * .55, max(sun.y, .3), sun.z * .55));
  float glow = pow(max(dot(ray, toward), 0.0), 3.0);
  color += vec3(.10,.25,.25) * glow;
  color *= .16 + .84 * smoothstep(0.0, .75, light);
  color *= mix(1.0, .36, depth);
  return color;
}
vec3 oceanBackdrop(vec3 ray, vec3 sun, float light, float depth) {
  return oceanWater(ray, sun, light, depth, depth);
}
`;

// Caustics are baked once into a small tiling texture. Two scrolling
// samples, combined with min(), read as moving light for two texture reads
// per pixel; the analytic version cost about 20 ms a frame on a laptop GPU.
function causticTexture(size = 256) {
  const data = new Uint8Array(size * size), TAU = Math.PI * 2, time = 1.7;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = x / size * TAU - 250, py = y / size * TAU - 250;
    let ix = px, iy = py, c = 1;
    for (let n = 0; n < 3; n++) {
      const s = time * (1 - 3.5 / (n + 1));
      const nx = px + Math.cos(s - ix) + Math.sin(s + iy), ny = py + Math.sin(s - iy) + Math.cos(s + ix);
      ix = nx; iy = ny;
      c += 1 / Math.hypot(px / (Math.sin(ix + s) * 200), py / (Math.cos(iy + s) * 200));
    }
    c = 1.17 - Math.pow(c / 3, 1.4);
    data[y * size + x] = Math.min(255, Math.sqrt(Math.pow(Math.abs(c), 8)) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
look.uLookCausticMap = { value: causticTexture() };

const causticGLSL = /* glsl */ `
uniform sampler2D uLookCausticMap;
float lookCaustic(vec2 uv, float t) {
  float a = texture2D(uLookCausticMap, uv + vec2(t * .021, t * .013)).r;
  float b = texture2D(uLookCausticMap, uv * 1.31 + vec2(-t * .017, t * .019) + .37).r;
  float c = min(a, b);
  return c * c * 2.6 + a * b * .5;
}
`;

// Local accent glows (bioluminescent polyps) are lit per vertex. Real point
// lights cost every lit pixel in the scene; these cost a few vertex operations,
// and only on the surfaces within their reach: with half a million triangles
// in view, the vertex stage is over half of the frame on an integrated GPU, and
// running four glows on every vertex of the reef was a fifth of that. A mesh
// asks for them by variant (see stylize): 'vertex' where it stands inside a
// glow's reach, 'flat' for one that moves and takes a single colour, summed
// where it is, from whoever moves it.
const GLOWS = 4;
const glowSources = [];
look.uLookGlowPos = { value: Array.from({ length: GLOWS }, () => new THREE.Vector4(0, 0, 0, 1)) };
look.uLookGlowColor = { value: Array.from({ length: GLOWS }, () => new THREE.Color(0, 0, 0)) };
/** sources: [{ x, y, z, color, intensity, distance }], matching a PointLight with decay 2. */
export function setLookGlows(sources = []) {
  glowSources.length = 0;
  for (let i = 0; i < GLOWS; i++) {
    const source = sources[i];
    look.uLookGlowPos.value[i].set(source?.x ?? 0, source?.y ?? 0, source?.z ?? 0, source?.distance ?? 1);
    look.uLookGlowColor.value[i].set(source?.color ?? '#000000').multiplyScalar(source ? source.intensity / Math.PI : 0);
    if (source) glowSources.push({ position: new THREE.Vector3(source.x, source.y, source.z), distance: source.distance, color: look.uLookGlowColor.value[i] });
  }
}
/** Does a sphere reach into any glow? */
export function nearLookGlow(center, radius = 0) {
  return glowSources.some(source => source.position.distanceTo(center) < source.distance + radius);
}
/** The glows' light at a point, on a surface half turned to them: what a 'flat' material is given. */
export function lookGlowAt(point, target) {
  target.setRGB(0, 0, 0);
  for (const source of glowSources) {
    const d2 = Math.max(source.position.distanceToSquared(point), .01), fall = d2 / (source.distance * source.distance), reach = Math.max(0, 1 - fall * fall);
    if (reach > 0) { const k = reach * reach / d2 * .5; target.r += source.color.r * k; target.g += source.color.g * k; target.b += source.color.b * k; }
  }
  return target;
}

const lookShared = glow => /* glsl */ `
uniform float uLookTime; uniform float uLookUnder; uniform float uLookLight; uniform float uLookDepth; uniform float uLookBrightness; uniform float uLookClarity; uniform vec3 uLookSun;
varying vec4 vLookAbsorb; varying vec3 vLookHaze; varying vec3 vLookCausticUv;${glow === 'vertex' ? ' varying vec3 vLookGlow;' : ''}`;

// Water colour changes slowly across a surface, so absorption, haze and the
// backdrop are evaluated per vertex and interpolated; the fragment stage only
// blends them. Near the eye, where triangles are large, the haze weight is ~0.
// (Lighting stays per pixel: measured per vertex, with both faces of a sheet
// lit and the lamp's cone, it added twice to the vertex stage what it took
// off the pixels.)
const vertexWorld = glow => /* glsl */ `#include <project_vertex>
vec4 lookWorldPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
lookWorldPosition = batchingMatrix * lookWorldPosition;
#endif
#ifdef USE_INSTANCING
lookWorldPosition = instanceMatrix * lookWorldPosition;
#endif
vec3 lookWorld = (modelMatrix * lookWorldPosition).xyz;
vec3 lookRay = lookWorld - cameraPosition;
float lookRange = length(lookRay), lookHazeRange = lookRange / max(uLookClarity, .25);
float lookScatter = 1.0 - exp(-lookHazeRange * mix(.021, .034, uLookDepth));
vLookAbsorb = vec4(exp(-lookHazeRange * vec3(.038, .014, .0075)) * (1.0 - lookScatter), exp(min(lookWorld.y, 0.0) * .04));
// The water toward a point takes that point's depth (green-tinged over the sand shallows, blue down the drop-off) and
// the eye's once fully hazed, where it meets the backdrop the dome paints.
float lookBlue = mix(max(uLookDepth, smoothstep(-8.0, -38.0, lookWorld.y)), uLookDepth, lookScatter * lookScatter);
vLookHaze = oceanWater(lookRay / max(lookRange, .0001), uLookSun, uLookLight, uLookDepth, lookBlue) * lookScatter;
// z: how wet the point is; the underwater look fades in across the surface.
vLookCausticUv = vec3((lookWorld.xz - uLookSun.xz * (lookWorld.y / max(uLookSun.y, .35))) * .11, uLookUnder * (1.0 - smoothstep(-.2, .6, lookWorld.y)));${glow === 'vertex' ? `
vec3 lookGlowN = inverseTransformDirection(transformedNormal, viewMatrix);
#ifdef DOUBLE_SIDED
// A two-sided sheet is lit on the side the eye sees, as a real light treats it.
if (dot(lookGlowN, lookRay) > 0.0) lookGlowN = -lookGlowN;
#endif
vLookGlow = vec3(0.0);
for (int i = 0; i < ${GLOWS}; i++) {
  vec3 lookTo = uLookGlowPos[i].xyz - lookWorld;
  float lookD2 = max(dot(lookTo, lookTo), .01), lookFall = lookD2 / (uLookGlowPos[i].w * uLookGlowPos[i].w);
  float lookFacing = dot(lookGlowN, lookTo) * inversesqrt(lookD2);
  float lookWindow = clamp(1.0 - lookFall * lookFall, 0.0, 1.0);
  vLookGlow += uLookGlowColor[i] * (lookWindow * lookWindow / lookD2 * max(lookFacing, 0.0));
}` : ''}`;

// The shading frame is the view's own: world up is read out of the view matrix, where the look used to turn the
// normal and the view ray into world space for every pixel.
const fragmentShade = (matte, glow) => /* glsl */ `
float lookUp = dot(normal, viewMatrix[1].xyz);
float lookWet = vLookCausticUv.z;
float lookEdge = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
${matte ? `float lookEdge2 = lookEdge * lookEdge;
outgoingLight += lookDirect * (${SHEEN} * (.04 + .96 * lookEdge2 * lookEdge2 * lookEdge));` : ''}
${glow ? `outgoingLight += diffuseColor.rgb * ${glow === 'vertex' ? 'vLookGlow' : 'uLookGlowFlat'};` : ''}
float lookLuma = dot(outgoingLight, vec3(.2126, .7152, .0722));
float lookBand = lookLuma * 5.0;
float lookStepped = (floor(lookBand) + smoothstep(.28, .72, fract(lookBand))) / 5.0;
outgoingLight *= mix(1.0, lookStepped / max(lookLuma, .0001), uLookToon);
outgoingLight += mix(vec3(.60,.80,.86), vec3(.30,.70,.84), lookWet) * (lookEdge * lookEdge * lookEdge) * uLookRim
  * (.2 + .8 * min(uLookLight, 1.0)) * (.4 + .6 * clamp(lookUp * .5 + .5, 0.0, 1.0));
if (lookWet > .001) {
  // Neutral fill illuminates the material's own diffuse color. It does not
  // recolor the water, change gamma, exposure or distance absorption.
  outgoingLight += diffuseColor.rgb * uLookBrightness * .36 * lookWet;
  outgoingLight *= 1.0 + uLookBrightness * .20 * lookWet;
  // Scattered light from the water itself lifts shadows toward its blue, bluer still with depth.
  outgoingLight += diffuseColor.rgb * mix(vec3(.17, .27, .28), vec3(.14, .24, .30), uLookDepth) * (.72 + .28 * lookUp) * min(uLookLight, 1.0) * lookWet;
  float lookMask = smoothstep(.1, .7, lookUp) * vLookAbsorb.w * min(uLookLight, 1.2) * uLookCaustic * lookWet;
  if (lookMask > .03) outgoingLight += (diffuseColor.rgb * .8 + .06) * vec3(.9, 1.0, .88) * lookCaustic(vLookCausticUv.xy, uLookTime) * lookMask * 1.5;
  outgoingLight = mix(outgoingLight, outgoingLight * vLookAbsorb.rgb + vLookHaze, lookWet);
}
#include <opaque_fragment>`;

// Matte surfaces (coral, rock, sand, imported models) take the scene's lights as
// plain diffuse light. The physical model ran a full BRDF per light per pixel,
// about a quarter of the frame on an integrated GPU, and on a rough surface all
// it adds to the diffuse term is a sheen at grazing angles: that is kept as one
// Fresnel term over the summed direct light (see fragmentShade). Glossy
// materials keep the full model.
const fragmentMatte = /* glsl */ `
vec3 lookIrradiance = ambientLightColor, lookDirect = vec3(0.0);
#if NUM_HEMI_LIGHTS > 0
#pragma unroll_loop_start
for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
  lookIrradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], normal );
}
#pragma unroll_loop_end
#endif
#if NUM_DIR_LIGHTS > 0
#pragma unroll_loop_start
for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
  lookIrradiance += directionalLights[ i ].color * saturate( dot( normal, directionalLights[ i ].direction ) );
  lookDirect += directionalLights[ i ].color * saturate( dot( normal, directionalLights[ i ].direction ) * 4.0 );
}
#pragma unroll_loop_end
#endif
#if NUM_SPOT_LIGHTS > 0
IncidentLight lookBeam;
#pragma unroll_loop_start
for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
  getSpotLightInfo( spotLights[ i ], - vViewPosition, lookBeam );
  lookIrradiance += lookBeam.color * saturate( dot( normal, lookBeam.direction ) );
  lookDirect += lookBeam.color * saturate( dot( normal, lookBeam.direction ) * 4.0 );
}
#pragma unroll_loop_end
#endif
#if NUM_POINT_LIGHTS > 0
IncidentLight lookPoint;
#pragma unroll_loop_start
for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
  getPointLightInfo( pointLights[ i ], - vViewPosition, lookPoint );
  lookIrradiance += lookPoint.color * saturate( dot( normal, lookPoint.direction ) );
  lookDirect += lookPoint.color * saturate( dot( normal, lookPoint.direction ) * 4.0 );
}
#pragma unroll_loop_end
#endif
reflectedLight.directDiffuse = lookIrradiance * diffuseColor.rgb * ( RECIPROCAL_PI * ( 1.0 - metalnessFactor ) );`;

// What the specular lobe of a rough surface came to at a grazing view, per unit of
// direct light: fitted against the physical model on the benchmark views, where
// the two now differ by under one grey level in 255 on average.
const SHEEN = '.07';

const fragmentTint = /* glsl */ `#include <color_fragment>
diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(.2126, .7152, .0722))), diffuseColor.rgb, uLookSaturation) * uLookTint;`;

/**
 * Patch one MeshStandardMaterial. Existing onBeforeCompile hooks are kept.
 * toon: 0..1 strength of stepped shading. rim: edge light. caustics: 0..1.
 * tint/saturation harmonise imported textures with the reef palette.
 * glow: how the local glows reach it. false: not at all (most of the reef is out of their reach); 'vertex' (or true):
 * per vertex; 'flat': one colour for the whole surface, kept current in glowColor by the caller (see lookGlowAt).
 */
export function stylize(material, { toon = .5, rim = .32, caustics = 1, tint = '#ffffff', saturation = 1, glow = false, glowColor = null } = {}) {
  if (!material?.isMeshStandardMaterial || material.userData.oceanLook) return material;
  material.userData.oceanLook = true;
  // Under water the look paints its own haze and the scene fog is switched off (density 0), yet every pixel still
  // evaluated it. Only the orbit viewer, which looks at the reef from the air, needs it on these materials.
  if (!globalThis.oceanViewer) material.fog = false;
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  const matte = !material.isMeshPhysicalMaterial && !material.envMap && material.roughness >= .5 && material.metalness <= .1;
  const glows = glow === true ? 'vertex' : glow === 'flat' && !glowColor ? false : glow || false;
  const own = { uLookToon: { value: toon }, uLookRim: { value: rim }, uLookCaustic: { value: caustics },
    uLookTint: { value: new THREE.Color(tint) }, uLookSaturation: { value: saturation } };
  if (glows === 'flat') own.uLookGlowFlat = { value: glowColor };
  material.userData.lookUniforms = own;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, look, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${lookShared(glows)}
${glows === 'vertex' ? `uniform vec4 uLookGlowPos[${GLOWS}]; uniform vec3 uLookGlowColor[${GLOWS}];` : ''}
${backdropGLSL}`)
      .replace('#include <project_vertex>', vertexWorld(glows));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${lookShared(glows)}
uniform float uLookToon; uniform float uLookRim; uniform float uLookCaustic; uniform vec3 uLookTint; uniform float uLookSaturation;${glows === 'flat' ? ' uniform vec3 uLookGlowFlat;' : ''}
${causticGLSL}`)
      .replace('#include <color_fragment>', fragmentTint)
      .replace('#include <opaque_fragment>', fragmentShade(matte, glows));
    if (matte) shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_physical_fragment>', fragmentMatte).replace('#include <lights_fragment_begin>', '')
      .replace('#include <lights_fragment_maps>', '').replace('#include <lights_fragment_end>', '');
  };
  material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : ''}|ocean-look-v10${matte ? 'm' : 'g'}${glows ? glows[0] : ''}`;
  material.needsUpdate = true;
  return material;
}

const stylizedMeshes = (object, visit) => object?.traverse(node => {
  if (!node.isMesh && !node.isSkinnedMesh) return;
  for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material) visit(material, node);
});
// glow: 'near' gives the glows to the materials of the meshes standing within their reach, and to no others.
const sphere = new THREE.Sphere();
function glowChoice(object, options) {
  if (options.glow !== 'near') return () => options.glow;
  const lit = new Set();
  object?.updateWorldMatrix(true, true);
  stylizedMeshes(object, (material, node) => {
    if (lit.has(material) || node.isInstancedMesh || !node.geometry) return;
    if (!node.geometry.boundingSphere) node.geometry.computeBoundingSphere();
    sphere.copy(node.geometry.boundingSphere).applyMatrix4(node.matrixWorld);
    if (nearLookGlow(sphere.center, sphere.radius)) lit.add(material);
  });
  return material => lit.has(material) ? 'vertex' : false;
}

/** Apply the look to every standard material beneath an object. */
export function stylizeTree(object, options = {}) {
  const glow = glowChoice(object, options);
  stylizedMeshes(object, material => stylize(material, { ...options, glow: glow(material) }));
  return object;
}

/**
 * Imported models arrive with photographic maps and shiny PBR settings.
 * Flatten them toward the painted look before applying the shared shading.
 */
export function stylizeImported(object, options = {}) {
  const glow = glowChoice(object, options);
  stylizedMeshes(object, material => {
    if (!material.isMeshStandardMaterial || material.userData.oceanLook) return;
    material.normalMap = null; material.roughnessMap = null; material.metalnessMap = null; material.aoMap = null;
    material.metalness = 0; material.roughness = Math.max(material.roughness, .78);
    stylize(material, { toon: .6, rim: .36, saturation: 1.18, ...options, glow: glow(material) });
  });
  return object;
}
