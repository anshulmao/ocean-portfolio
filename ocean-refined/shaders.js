// Shared analytic waves keep the water, diver and bubbles in the same world.
export function waveHeight(x, z, time) {
  return .22 * Math.sin(x * .38 + z * .2 + time * .65)
    + .13 * Math.sin(x * -.22 + z * .52 + time * .86)
    + .065 * Math.sin(x * .9 + z * .68 + time * 1.1)
    + .035 * Math.sin(x * 1.72 - z * 1.36 + time * 1.3);
}

const noise = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise2(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);
}
float fbm(vec2 p) {
  float n=0.0, a=.5;
  for(int i=0;i<4;i++) {n+=a*noise2(p);p=mat2(1.6,-1.2,1.2,1.6)*p+2.4;a*=.5;}
  return n;
}
`;

export const waveGLSL = /* glsl */ `
float wave(vec2 p) {
  return .22*sin(dot(p,vec2(.38,.2))+uTime*.65)
    +.13*sin(dot(p,vec2(-.22,.52))+uTime*.86)
    +.065*sin(dot(p,vec2(.9,.68))+uTime*1.1)
    +.035*sin(dot(p,vec2(1.72,-1.36))+uTime*1.3);
}
vec3 waterNormal(vec2 p) {
  vec2 d=vec2(.38,.2)*.22*cos(dot(p,vec2(.38,.2))+uTime*.65)
    +vec2(-.22,.52)*.13*cos(dot(p,vec2(-.22,.52))+uTime*.86)
    +vec2(.9,.68)*.065*cos(dot(p,vec2(.9,.68))+uTime*1.1)
    +vec2(1.72,-1.36)*.035*cos(dot(p,vec2(1.72,-1.36))+uTime*1.3);
  d+=vec2(2.8,1.9)*.016*cos(dot(p,vec2(2.8,1.9))+uTime*1.45);
  d+=vec2(-4.1,3.7)*.012*cos(dot(p,vec2(-4.1,3.7))+uTime*1.6);
  d+=vec2(7.2,-2.2)*.005*cos(dot(p,vec2(7.2,-2.2))+uTime*1.8);
  return normalize(vec3(-d.x,1.0,-d.y));
}
`;

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
${noise}
vec3 skyColor(vec3 ray, bool clouds) {
  float h=max(ray.y,0.0);
  vec3 day=mix(vec3(.48,.70,.81),vec3(.055,.26,.48),pow(min(h*2.5,1.0),.55));
  day+=vec3(.14,.085,.025)*pow(max(dot(ray,uSun),0.0),5.0);
  vec3 night=mix(vec3(.057,.101,.17),vec3(.006,.015,.051),pow(h,.45));
  vec3 color=mix(day,night,uNight);
  // Sunset/sunrise follows the moving sun along the horizon, including reflections.
  float twilight=(1.0-smoothstep(.02,.32,abs(uSun.y)));
  float warmDirection=pow(max(dot(normalize(vec3(ray.x,.03,ray.z)),normalize(vec3(uSun.x,.03,uSun.z))),0.0),6.0);
  float horizonGlow=exp(-h*8.0)*twilight*warmDirection;
  float belt=exp(-pow((h-.12)/.23,2.0))*twilight;
  color=mix(color,vec3(.105,.045,.24),belt*.62*(1.0-warmDirection*.65));
  color=mix(color,vec3(.86,.21,.045),horizonGlow*.93);
  color+=vec3(.17,.04,.006)*exp(-h*19.0)*twilight*warmDirection;
  if(clouds && ray.y>.005 && uNight<.999) {
    vec2 p=ray.xz/max(ray.y,.035)*2.4;
    p+=vec2(uTime*.014,uTime*.006);
    float density=fbm(p*.8);
    float cloud=smoothstep(.60,.78,density)*smoothstep(.025,.13,ray.y)*.20;
    float shade=fbm(p*.8+vec2(.17,.32));
    vec3 cloudColor=mix(vec3(.63,.77,.83),vec3(1.0,.96,.85),smoothstep(.40,.68,shade));
    cloudColor=mix(cloudColor,vec3(.077,.105,.18)+shade*.05,uNight);
    cloudColor=mix(cloudColor,mix(vec3(.52,.22,.32),vec3(1.0,.67,.38),shade),twilight*.68);
    color=mix(color,cloudColor,cloud*(1.0-uNight));
    // Thin high cirrus, distinct from the lower cumulus field.
    float cirrus=pow(fbm(vec2(p.x*.12+p.y*.06,p.y*2.3)),4.0)*.38;
    color=mix(color,mix(vec3(.96,.95,.89),vec3(.11,.15,.22),uNight),cirrus*smoothstep(.1,.5,ray.y)*(1.0-uNight));
  }
  float sun=dot(ray,uSun);
  color+=vec3(.70,.47,.17)*pow(max(sun,0.0),70.0)*(1.0-uNight);
  if(clouds)color=mix(color,vec3(3.8,2.5,1.05),smoothstep(.99966,.99978,sun)*(1.0-uNight));
  float moon=dot(ray,uMoon);
  float moonDisk=smoothstep(.99946,.99959,moon);
  // Reconstruct the visible lunar hemisphere and light it from the actual Sun.
  // The terminator follows the sky orientation rather than a fixed crescent cutout.
  vec3 tangent=ray-uMoon*moon;
  vec3 onDisk=tangent/.030;
  float radial=dot(onDisk,onDisk);
  vec3 lunarNormal=onDisk-uMoon*sqrt(max(0.0,1.0-radial));
  float lunarDay=smoothstep(-.025,.045,dot(lunarNormal,uMoonLight));
  float lunarTexture=.90+.045*sin(onDisk.x*37.0+onDisk.y*29.0)+.025*cos(onDisk.z*63.0+onDisk.x*23.0);
  color+=vec3(.11,.15,.22)*pow(max(moon,0.0),100.0)*uNight*uMoonFraction;
  if(clouds)color=mix(color,vec3(.009,.018,.028)+vec3(.95,1.02,1.03)*lunarDay*lunarTexture,moonDisk*uNight);
  if(clouds) {
    float galacticLatitude=abs(dot(ray,uMilkyWay));
    float band=exp(-pow(galacticLatitude/.12,2.0));
    // Smooth broad dust lanes stay continuous when looking toward the zenith.
    float dust=.50+.22*sin(dot(ray,vec3(19.,13.,31.)))+.15*sin(dot(ray,vec3(-37.,23.,11.)))+.09*cos(dot(ray,vec3(27.,-43.,17.)));
    color+=vec3(.035,.044,.068)*band*(.30+.70*dust)*smoothstep(.55,.95,uNight)*smoothstep(.0,.12,ray.y);
  }
  return color;
}
`;

export const skyVertex = /* glsl */ `
varying vec3 vRay;
void main(){vRay=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`;
export const skyFragment = /* glsl */ `
${atmosphere}
varying vec3 vRay;
void main(){
  vec3 rd=normalize(vRay);
  vec3 color=skyColor(rd,true);
  vec3 deep=mix(vec3(.006,.06,.081),vec3(.018,.27,.31),clamp(rd.y*.65+.25,0.0,1.0));
   deep=mix(deep,deep*.50,uNight);
   deep*=mix(1.0,.3,uDepth);
  color=mix(color,deep,uDive);
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const waterVertex = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
${waveGLSL}
void main(){
  vec3 p=position;p.y=wave(p.xz);
  vWorld=(modelMatrix*vec4(p,1.0)).xyz;
  gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);
}
`;
export const waterFragment = /* glsl */ `
${atmosphere}
${waveGLSL}
varying vec3 vWorld;
void main(){
  vec3 normal=waterNormal(vWorld.xz);
  vec3 view=normalize(cameraPosition-vWorld);
  float distanceToEye=length(cameraPosition-vWorld);
  vec3 reflected=reflect(-view,normal);
  reflected.y=max(reflected.y,.002);
  reflected=normalize(reflected);
  float fresnel=.025+.975*pow(1.0-max(dot(view,normal),0.0),4.5);
  vec3 base=mix(vec3(.008,.145,.18),vec3(.004,.027,.064),uNight);
  float undulation=.5+.5*sin(vWorld.x*.38+vWorld.z*.20+uTime*.65);
  base+=mix(vec3(.0,.021,.026),vec3(.001,.004,.009),uNight)*undulation;
  vec3 sky=skyColor(reflected,false);
  vec3 color=mix(base,sky,fresnel*.57);
  // A single rough-surface highlight; solar disk is not reflected twice.
  vec3 sunHalf=normalize(view+uSun),moonHalf=normalize(view+uMoon);
  float alpha2=.00084;
  float sunN=max(dot(normal,sunHalf),0.0),moonN=max(dot(normal,moonHalf),0.0);
  float sunD=alpha2/(3.14159*pow(sunN*sunN*(alpha2-1.0)+1.0,2.0));
  float moonD=alpha2/(3.14159*pow(moonN*moonN*(alpha2-1.0)+1.0,2.0));
  float sunVisibility=smoothstep(-.025,.09,uSun.y);
  float moonVisibility=smoothstep(-.025,.09,uMoon.y)*uMoonFraction;
  vec3 glint=vec3(1.0,.78,.48)*sunD*sunVisibility+vec3(.48,.66,.85)*moonD*moonVisibility*.16;
  color+=glint*.012*(.3+.7*fresnel);
  float crest=smoothstep(.22,.42,vWorld.y)*(.4+.6*noise2(vWorld.xz*2.0));
  color+=mix(vec3(.14,.24,.22),vec3(.025,.049,.067),uNight)*crest*.19;
  // Fine broken froth only on the highest nearby wave crests.
  float froth=smoothstep(.345,.43,vWorld.y)*smoothstep(.54,.78,noise2(vWorld.xz*4.2+vec2(uTime*.08,-uTime*.06)));
  color=mix(color,mix(vec3(.66,.80,.78),vec3(.10,.18,.24),uNight),froth*.24*exp(-distanceToEye*.045));
  float haze=1.0-exp(-distanceToEye*.007);
  color=mix(color,skyColor(normalize(vec3(vWorld.x-cameraPosition.x,.005,vWorld.z-cameraPosition.z)),false),haze*.52);
  if(!gl_FrontFacing){
    // View the surface from below as broken, overlapping light sheets rather
    // than one continuous stripe. The calmer front face above is unchanged.
    vec2 surfaceUv=vWorld.xz+normal.xz*3.5;
    float warp=noise2(surfaceUv*.075+vec2(uTime*.018,-uTime*.013));
    vec2 rippleA=vec2(surfaceUv.x*.42+surfaceUv.y*.19, surfaceUv.y*.28-surfaceUv.x*.11);
    vec2 rippleB=vec2(-surfaceUv.x*.17+surfaceUv.y*.38, surfaceUv.x*.12+surfaceUv.y*.16);
    float causticA=.5+.5*sin(rippleA.x+warp*2.1+uTime*.32)*sin(rippleA.y-warp*1.4-uTime*.22);
    float causticB=.5+.5*sin(rippleB.x-warp*1.7-uTime*.2)*sin(rippleB.y+warp*1.2+uTime*.27);
    float caustic=pow(clamp(causticA*.63+causticB*.37,0.0,1.0),3.1);
    float mottling=noise2(surfaceUv*.16+vec2(uTime*.012,uTime*.009));
    float turbulence=fbm(surfaceUv*.55+vec2(uTime*.22,-uTime*.17));
    float churn=smoothstep(.58,.76,turbulence+length(normal.xz)*.7);
    vec3 underside=mix(vec3(.018,.19,.23),vec3(.075,.39,.39),caustic*.55+mottling*.17+fresnel*.16);
    underside+=vec3(.018,.046,.045)*pow(caustic,2.0);
    vec3 transmitted=refract(-view,-normal,1.333);
    vec3 refractedSky=skyColor(normalize(transmitted+vec3(0.,.0001,0.)),true);
    float window=step(.01,dot(transmitted,transmitted));
    underside=mix(underside,refractedSky,window*.56);
    underside+=vec3(.19,.29,.27)*churn*.65;
    color=mix(underside,vec3(.012,.055,.079),smoothstep(18.0,105.0,distanceToEye)*.66);
    color*=mix(1.0,.38,uNight)*mix(1.0,.3,uDepth);
    vec3 ray=normalize(vWorld-cameraPosition);
    vec3 distant=mix(vec3(.006,.06,.081),vec3(.018,.27,.31),clamp(ray.y*.65+.25,0.0,1.0));
    distant*=mix(1.0,.50,uNight)*mix(1.0,.3,uDepth);
    color=mix(color,distant,1.0-exp(-distanceToEye*.023));
  }
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const starsVertex = /* glsl */ `
uniform float uTime;uniform float uNight;uniform float uDive;uniform float uRatio;
attribute float aSize;attribute float aSeed;attribute vec3 aColor;
varying float vAlpha;varying vec3 vColor;
void main(){
  vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;
  gl_PointSize=aSize*uRatio;
  float horizon=normalize((modelMatrix*vec4(position,0.0)).xyz).y;
  vAlpha=smoothstep(.30,.88,uNight)*(1.0-uDive)*smoothstep(.0,.09,horizon)*(.85+.15*sin(uTime*.8+aSeed));
  vColor=aColor;
}
`;
export const starsFragment = /* glsl */ `
varying float vAlpha;varying vec3 vColor;
void main(){float d=length(gl_PointCoord-.5);float alpha=smoothstep(.5,.06,d)*vAlpha;
gl_FragColor=vec4(vColor,alpha);}
`;

export const beamVertex = /* glsl */ `
varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`;
export const beamFragment = /* glsl */ `
uniform float uTime;uniform float uDive;uniform float uNight;uniform float uSurfaceLight;varying vec2 vUv;
void main(){
  float edge=pow(sin(vUv.x*3.14159),3.0);
  float fade=sin(vUv.y*3.14159);
  float pulse=.75+.25*sin(vUv.y*8.0+uTime*.25);
  gl_FragColor=vec4(.38,.83,.84,edge*fade*pulse*uDive*uSurfaceLight*.13);
}
`;
