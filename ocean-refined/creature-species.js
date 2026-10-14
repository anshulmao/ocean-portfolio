import { Float32BufferAttribute } from './vendor/three.module.min.js';
import { buildCreature, posedGeometry, blend, shadeBy, noise, tone } from './creature-kit.js';

// The creature set: every animal as a page of numbers for the workshop in creature-kit.js.
// Shapes are in fractions of the animal's length: stations are [t, half width, height above the centreline, depth
// below it, centreline height], t from the nose (0) to the tip of the tail (1); fin outlines are [along the chord
// toward the tail, out along the span].
// A painter is asked for the colour at each point of the skin. On the body: c.t where along the animal, c.a the angle
// round it, c.h how high (1 the back, 0 the flank, -1 the belly), c.p the point itself (in lengths, nose at z = .5),
// c.w its half width there. On a fin (c.part 'fin'): c.u from the leading edge (0) to the trailing edge (1), c.s from
// the root (0) to the tip (1), c.up -1 for the underside of a paired fin.

// --- Scale ----------------------------------------------------------------------------------------------------------
// The site's schooling fish (marine-life.js) are a metre or more long, several times life size. The set is sized to
// sit with them: the small reef fish come out at their size, and everything larger keeps its order and rough
// proportion with the gaps squeezed, so the great animals still fit the reef. Real lengths are kept in realLength.
// 0.18 m becomes 1.2 m, 1.6 m becomes 5.2 m, 14 m becomes 22 m.
export const siteLength = real => Math.round(3.77 * real ** .668 * 100) / 100;

// --- Painting helpers -----------------------------------------------------------------------------------------------
const ss = (x, a, b) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const body = c => c.part !== 'fin';
/** A soft blend through colour stops, [[h, colour], ...] from the belly (-1) to the back (1). */
function grade(h, stops) {
  if (h <= stops[0][0]) return tone(stops[0][1]);
  for (let i = 0; i < stops.length - 1; i++) if (h <= stops[i + 1][0]) return blend(stops[i][1], stops[i + 1][1], ss(h, stops[i][0], stops[i + 1][0]));
  return tone(stops[stops.length - 1][1]);
}
/** 1 inside a band from a to b, easing out over `soft` either side. */
const band = (x, a, b, soft = .01) => ss(x, a - soft, a + soft) * (1 - ss(x, b - soft, b + soft));
/** 1 inside an ellipsoid on both flanks (x is mirrored), easing out at its edge: a patch with a natural outline. */
const patch = (p, cx, cy, t, rx, ry, rt, soft = .25) => { const d = Math.hypot((Math.abs(p.x) - cx) / rx, (p.y - cy) / ry, (p.z - (.5 - t)) / rt); return 1 - ss(d, 1 - soft, 1 + soft); };
/** Faint mottling, so a large flank is skin rather than flat paint. Seamless round the body. */
const skinNoise = (c, scale) => noise(c.t * scale + Math.cos(c.a ?? 0) * scale * .12, Math.sin(c.a ?? 0) * scale * .12 + 7.3);
const mottle = (colour, c, amount = .06, scale = 30) => shadeBy(colour, 1 + amount * ((skinNoise(c, scale) - .5) * 1.6 + (skinNoise(c, scale * 3.3) - .5) * .8));
const finNoise = (colour, c, amount = .05) => shadeBy(colour, 1 + amount * (noise(c.u * 9, c.s * 9) - .5) * 2);

const fork = (len, height, { root = .012, fork: cut = .62, sweep = 1, lower = 1 } = {}) => ({
  upper: [[0, -root * .4], [0, root], [len * .42 * sweep, height * .55], [len, height], [len * .9, height * .72], [len * (1 - cut * .55), height * .2], [len * (1 - cut), 0]],
  lower: [[0, root * .4], [0, -root], [len * .42 * sweep * lower, -height * .55 * lower], [len * lower, -height * lower], [len * .9 * lower, -height * .72 * lower], [len * (1 - cut * .55), -height * .2 * lower], [len * (1 - cut), 0]]
});
const flukes = (chord, span) => [[0, 0], [chord * .16, span * .3], [chord * .5, span * .7], [chord * .92, span * .98], [chord * 1.18, span], [chord * 1.3, span * .86], [chord * 1.14, span * .4], [chord * 1.04, span * .08], [chord, 0]];

// --- Clips shared by every swimmer ----------------------------------------------------------------------------------
// Cruise, sprint, hang in the water, turn either way and bolt: then whatever is the animal's own.
function swimmerClips(k, swim, fast, idle, { burst = {}, turn = {}, extra = [] } = {}) {
  const cruise = k.swim(swim), plane = swim.plane || 'yaw';
  const out = [cruise, k.swim(fast), k.swim(idle), k.turn(cruise, 1, turn), k.turn(cruise, -1, turn)];
  if (burst) out.push(k.burst({ plane, mode: swim.mode, duration: Math.max(.6, swim.period * 1.15), ...burst }));
  return [...out, ...extra];
}
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

// Whale and dolphin actions, all one-offs. The root pitches (nose up is a negative turn about X) and rolls; the
// spine arches; the flukes drive hard at the start and the flippers spread for balance.
function breach(k, { name = 'breach', duration = 3.4, twist = .9, power = 1 } = {}) {
  return k.act({ name, duration, mode: 'subcarangiform', bones: {
    spine: [{ axis: X, amp: .8 * power, freq: 3, env: [[0, 1], [.24, 1], [.34, 0], [1, 0]] },
      { axis: X, amp: 0, bias: .7, travel: 0, env: [[0, 0], [.3, 0], [.48, 1], [.72, -.45], [.88, 0], [1, 0]] }],
    root: [{ axis: X, amp: 0, bias: -1.15, env: [[0, 0], [.12, .15], [.38, 1], [.6, .15], [.8, -.55], [1, 0]] },
      { axis: Z, amp: 0, bias: twist, env: [[0, 0], [.32, 0], [.62, 1], [.85, .4], [1, 0]] }],
    pectoral_L: [{ axis: Z, amp: 0, bias: .55, env: [[0, 0], [.3, 0], [.5, 1], [.8, 1], [1, 0]] }],
    pectoral_R: [{ axis: Z, amp: 0, bias: -.55, env: [[0, 0], [.3, 0], [.5, 1], [.8, 1], [1, 0]] }]
  } });
}
function flukeDive(k, { duration = 4.5 } = {}) {
  // Head down, back arched over, and the flukes lifted clear before it slides under. Ends pointing down.
  return k.act({ name: 'fluke_dive', duration, mode: 'subcarangiform', bones: {
    spine: [{ axis: X, amp: 0, bias: -.75, travel: 0, env: [[0, 0], [.35, .3], [.75, 1], [1, .6]] }, { axis: X, amp: .25, freq: 2, env: [[0, 1], [.4, .4], [.7, 0], [1, 0]] }],
    root: [{ axis: X, amp: 0, bias: 1.25, env: [[0, 0], [.55, .75], [1, 1]] }],
    pectoral_L: [{ axis: Y, amp: 0, bias: .5, env: [[0, 0], [.4, 1], [1, 1]] }], pectoral_R: [{ axis: Y, amp: 0, bias: -.5, env: [[0, 0], [.4, 1], [1, 1]] }]
  } });
}

// --- The great animals --------------------------------------------------------------------------------------------
const rightWhale = {
  id: 'right-whale', name: 'Southern right whale', scientific: 'Eubalaena australis', real: 14, group: 'whale',
  note: 'No dorsal fin, a head a quarter of its length, pale callosities, a bowed lip line and broad paddle flippers.',
  body: { K: 10, ey: .92, maxGap: .085, stations: [
    [0, 0, 0, 0, .02], [.014, .034, .03, .04, .014], [.055, .066, .06, .085, .008], [.13, .092, .082, .118, .002], [.23, .112, .1, .132], [.34, .12, .112, .13],
    [.46, .114, .108, .114], [.58, .092, .09, .09], [.7, .06, .064, .06], [.8, .034, .042, .038], [.88, .017, .028, .024], [.94, .008, .016, .014], [.975, .004, .008, .007]] },
  fins: [
    { name: 'flipper', mirror: true, bone: 'pectoral', root: [.265, 118, .3], span: [.84, -.26, -.48], chord: [0, -.2, -1], thick: .011, hinge: .08, stiff: .7,
      outline: [[0, 0], [-.006, .04], [.008, .09], [.04, .126], [.068, .12], [.08, .078], [.074, .03], [.058, 0]].map(([u, v]) => [u * 1.4, v * 1.45]) },
    { name: 'fluke', mirror: true, root: [.9, 90, 1], span: [1, 0, 0], thick: .008, outline: flukes(.078, .19) }
  ],
  eyes: { at: [.235, 104], r: .0055, glint: false },
  lumps: [
    { at: [.03, 0], size: [.024, .009, .03], color: '#d9d4c2', mirror: false, keep: true }, { at: [.085, 0], size: [.014, .006, .02], color: '#d2ccb9', mirror: false },
    { at: [.14, 10], size: [.012, .005, .016], color: '#d9d4c2' }, { at: [.065, 62], size: [.012, .006, .03], color: '#d2ccb9', keep: true },
    { at: [.2, 72], size: [.014, .006, .018], color: '#d9d4c2' }, { at: [.03, 165], size: [.02, .007, .026], color: '#d2ccb9' }, { at: [.12, 150], size: [.012, .005, .02], color: '#d9d4c2' }
  ],
  paint: c => {
    if (!body(c)) return finNoise(c.name === 'fluke' && c.up < 0 ? blend('#3b4249', '#262b31', ss(c.s, .5, 1)) : '#23282e', c, .08);
    let col = grade(c.h, [[-1, '#3a4148'], [-.35, '#2c3239'], [.4, '#24292f'], [1, '#202429']]);
    // The great bowed lip, rising from the corner of the mouth to over the eye and down to the snout.
    if (c.t < .27) { const lip = .04 + .3 * Math.sin(Math.PI * c.t / .27); col = blend(col, '#474e57', band(c.h, lip - .05, lip + .05, .03)); }
    // An irregular white blaze on the belly.
    const blaze = ss(-c.h, .62, .8) * band(c.t, .3, .6, .05) * ss(skinNoise(c, 9), .3, .55);
    return mottle(blend(col, '#d6d9d4', blaze), c, .1, 16);
  },
  rig: { root: .36, head: .2, spine: [.48, .6, .72, .82, .9] },
  clips: k => swimmerClips(k,
    { name: 'swim', period: 6.4, amp: .44, plane: 'pitch', mode: 'subcarangiform', pectoral: .06, follow: .13, roll: .01 },
    { name: 'fast', period: 3.6, amp: .62, plane: 'pitch', mode: 'subcarangiform', pectoral: .04, follow: .13 },
    { name: 'idle', period: 9, amp: .12, plane: 'pitch', mode: 'subcarangiform', pectoral: .1, follow: .1, roll: .02 },
    { burst: false, turn: { curve: .35, bank: .12 }, extra: [breach(k, { duration: 5, twist: 1.3 }), flukeDive(k, { duration: 6 })] })
};

const whaleShark = {
  id: 'whale-shark', name: 'Whale shark', scientific: 'Rhincodon typus', real: 9.5, group: 'shark',
  note: 'A broad flat head with the mouth across its front, pale spots and bars in a checkerboard, a tall crescent tail.',
  body: { K: 10, ex: .78, ey: .9, maxGap: .075, stations: [
    [0, .056, .01, .012, -.004], [.02, .074, .024, .024, -.002], [.06, .086, .04, .036], [.13, .092, .056, .046], [.22, .09, .068, .054], [.32, .08, .072, .058],
    [.44, .064, .066, .054], [.56, .046, .052, .044], [.66, .03, .038, .032], [.74, .019, .026, .022], [.79, .013, .02, .016], [.812, .009, .014, .012]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.46], thick: .008, outline: [[0, 0], [.042, .058], [.074, .098], [.09, .094], [.096, .03], [.112, .004], [.096, 0]].map(([u, v]) => [u * 1.12, v * 1.18]) },
    { name: 'dorsal2', plane: 'side', root: [.655], thick: .005, outline: [[0, 0], [.02, .03], [.035, .04], [.043, .012], [.052, 0]] },
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.2, 112, .3], span: [.72, -.38, -.58], chord: [0, -.2, -1], thick: .008, hinge: .08, stiff: .6,
      outline: [[0, 0], [.012, .06], [.03, .12], [.046, .162], [.06, .152], [.07, .07], [.072, 0]].map(([u, v]) => [u * 1.15, v * 1.22]) },
    { name: 'pelvic', mirror: true, root: [.52, 150, .3], span: [.5, -.8, -.35], thick: .004, outline: [[0, 0], [.012, .03], [.03, .04], [.042, .012], [.04, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.69], thick: .004, outline: [[0, 0], [.015, .026], [.03, .03], [.036, .008], [.042, 0]] },
    { name: 'caudal', plane: 'side', root: [.795, 0], thick: .006, outline: [[0, -.006], [0, .014], [.05, .075], [.12, .17], [.19, .236], [.205, .22], [.16, .12], [.1, .04], [.06, 0]] },
    { name: 'caudal', plane: 'side', root: [.795, 0], thick: .005, outline: [[0, .006], [0, -.014], [.045, -.06], [.09, -.116], [.106, -.11], [.09, -.04], [.065, 0]] }
  ],
  eyes: { at: [.052, 88], r: .0048, glint: false },
  mouth: { t: .03, size: [.05, .006, .02], drop: -.004, color: '#1d1a1c' },
  spots(random) {
    const list = [];
    for (let t = .045; t < .79; t += .028) for (const a of [12, 34, 56, 78, 100]) {
      if (random() < .08) continue;
      list.push({ t: t + (random() - .5) * .012, a: a + (random() - .5) * 8, r: (.0042 + random() * .0024) * (t > .6 ? .8 : 1), color: random() < .5 ? '#e4ecea' : '#d3e0e2', opacity: .92 });
    }
    return list;
  },
  paint: c => {
    if (!body(c)) {
      if (c.name === 'pectoral' && c.up < 0) return blend('#c7d4d6', '#7f98a6', ss(c.s, .7, 1));
      return finNoise(blend('#3f5b74', '#5e7a90', ss(c.s, .75, 1) * .6), c);
    }
    // The mouth: a dark slit across the front, closing to the lips at either corner.
    if (c.cap === 'front') return blend('#16191c', '#45607a', ss(Math.abs(c.h + .08), .14, .32) + ss(Math.abs(c.lat), .9, 1));
    let col = grade(c.h, [[-1, '#eef2ee'], [-.45, '#e0e8e7'], [-.32, '#7d97a6'], [.1, '#56768c'], [1, '#3d5872']]);
    // Thin pale bars between the columns of spots on the back and flanks.
    if (c.t > .1 && c.t < .76 && c.h > -.3) col = blend(col, '#a3b8c3', ss(1 - Math.abs((c.t / .028) % 1 - .5) * 2, .88, .96) * .55 * ss(c.h, -.3, -.1));
    // A slit of mouth line round the front of the head.
    if (c.t < .03) col = blend(col, '#16191c', band(c.h, -.12, -.02, .03));
    return mottle(col, c, .05, 22);
  },
  rig: { root: .34, head: .14, spine: [.44, .56, .67, .76, .8, .9], jaw: { hinge: .055, line: -.003 } },
  clips: k => swimmerClips(k,
    { name: 'swim', period: 4.6, amp: .56, mode: 'subcarangiform', pectoral: .035, follow: .11, roll: .014 },
    { name: 'fast', period: 2.8, amp: .74, mode: 'subcarangiform', pectoral: .02, follow: .11 },
    { name: 'idle', period: 7, amp: .2, mode: 'subcarangiform', pectoral: .05 },
    { burst: false, turn: { curve: .4 }, extra: [
      // Filter feeding: mouth held wide, head swinging slowly through the plankton.
      k.swim({ name: 'feed', period: 5.5, amp: .3, mode: 'subcarangiform', pectoral: .04, jaw: .12, jawRate: 2, pose: { jaw: { axis: X, bias: .38 }, head: { axis: X, amp: .05, bias: -.04 } } }),
      // Rising almost upright to suck at the surface, then levelling out.
      k.act({ name: 'surface_feed', duration: 6, mode: 'subcarangiform', bones: {
        root: [{ axis: X, amp: 0, bias: -1.05, env: [[0, 0], [.3, 1], [.75, 1], [1, 0]] }],
        jaw: [{ axis: X, amp: .12, freq: 6, bias: .42, env: [[0, 0], [.3, 1], [.75, 1], [1, 0]] }],
        spine: [{ axis: Y, amp: .2, freq: 3, env: [[0, 1], [.3, .4], [.75, .4], [1, 1]] }]
      } })] })
};

const orca = (cow = false) => ({
  id: cow ? 'orca-cow' : 'orca', name: cow ? 'Orca (female)' : 'Orca (bull)', scientific: 'Orcinus orca', real: cow ? 5.6 : 6.6, group: 'whale',
  note: cow ? 'A shorter, back-curved dorsal fin; a calf is the cow at half size.' : 'The bull carries a dorsal fin as tall as a diver, with a grey saddle behind it.',
  body: { K: 10, maxGap: .08, stations: [
    [0, 0, 0, 0, -.01], [.015, .022, .02, .022, -.008], [.05, .045, .04, .045, -.004], [.11, .068, .062, .07], [.2, .086, .085, .088], [.3, .094, .098, .094], [.4, .09, .098, .09],
    [.52, .074, .085, .078], [.64, .05, .064, .06], [.75, .028, .045, .042], [.84, .014, .03, .028], [.9, .008, .018, .016], [.955, .004, .008, .007]] },
  fins: [
    { name: 'dorsal', plane: 'side', bone: 'dorsal', root: [.36], thick: .008, hinge: .15, stiff: 1, embed: .2,
      outline: cow ? [[0, 0], [.035, .055], [.066, .098], [.088, .118], [.1, .112], [.094, .06], [.108, .012], [.098, 0]]
        : [[0, 0], [.028, .08], [.052, .16], [.066, .222], [.082, .216], [.092, .12], [.104, .02], [.098, 0]] },
    { name: 'flipper', mirror: true, bone: 'pectoral', root: [.24, 126, .3], span: [.75, -.5, -.43], chord: [0, -.25, -1], thick: .009, hinge: .08, stiff: .7,
      outline: [[0, 0], [-.005, .05], [.012, .108], [.045, .152], [.08, .147], [.1, .1], [.096, .04], [.07, 0]].map(([u, v]) => [u * 1.15, v * (cow ? .95 : 1.22)]) },
    { name: 'fluke', mirror: true, root: [.895, 90, 1], span: [1, 0, 0], thick: .007, outline: flukes(.074, .176) }
  ],
  eyes: { at: [.092, 84], r: .0058, glint: false },
  paint: c => {
    const black = '#121518', white = '#f0f2ed';
    if (!body(c)) return c.name === 'fluke' && c.up < 0 ? blend(white, black, ss(c.s, .72, .92) + ss(c.u, .82, 1)) : finNoise(black, c, .1);
    const p = c.p;
    let w = ss(-c.h, .5, .66) * (1 - ss(c.t, .8, .87));                                          // throat to tail stock
    w = Math.max(w, ss(-c.h, .05, .25) * (1 - ss(c.t, .085, .13)));                              // the chin
    w = Math.max(w, patch(p, c.w * .8, .026, .15, .05, .019, .045, .3));                         // the eye patch
    w = Math.max(w, patch(p, c.w * .7, -.022, .645, .06, .036, .085, .35) * ss(-c.h, -.35, .2)); // the flank blaze
    let col = blend(grade(c.h, [[-1, '#191c20'], [1, black]]), white, w);
    col = blend(col, '#7b848b', patch(p, 0, .09, .51, .11, .035, .05, .45) * (1 - w));            // the saddle
    return mottle(col, c, .05, 20);
  },
  rig: { root: .34, head: .17, spine: [.46, .58, .7, .8, .895] },
  clips: k => swimmerClips(k,
    { name: 'swim', period: 2.8, amp: .5, plane: 'pitch', pectoral: .05, follow: .14, dorsal: cow ? .02 : .05 },
    { name: 'fast', period: 1.5, amp: .7, plane: 'pitch', pectoral: .03, follow: .14, dorsal: cow ? .03 : .08 },
    { name: 'idle', period: 5, amp: .14, plane: 'pitch', pectoral: .09, dorsal: cow ? .02 : .04, roll: .03 },
    { burst: { name: 'lunge', power: .9 }, turn: { curve: .45, bank: .3 }, extra: [
      breach(k, { duration: 3.4 }),
      // Head up out of the water to look round, sculling with the flippers to hold there.
      k.act({ name: 'spyhop', duration: 6, mode: 'subcarangiform', bones: {
        root: [{ axis: X, amp: 0, bias: -1.45, env: [[0, 0], [.22, 1], [.78, 1], [1, 0]] }, { axis: Y, amp: .4, freq: 1, env: [[0, 0], [.3, 0], [.45, 1], [.65, 1], [.75, 0], [1, 0]] }],
        spine: [{ axis: X, amp: .22, freq: 5, env: [[0, .6], [.25, 1], [.75, 1], [1, .6]] }],
        pectoral_L: [{ axis: Z, amp: .3, freq: 7, env: [[0, 0], [.22, 1], [.78, 1], [1, 0]] }], pectoral_R: [{ axis: Z, amp: -.3, freq: 7, env: [[0, 0], [.22, 1], [.78, 1], [1, 0]] }]
      } }),
      // Rolled on its side, a flipper raised and slapped down.
      k.act({ name: 'flipper_slap', duration: 2.6, mode: 'subcarangiform', bones: {
        root: [{ axis: Z, amp: 0, bias: 1.35, env: [[0, 0], [.25, 1], [.8, 1], [1, 0]] }],
        pectoral_L: [{ axis: Z, amp: 0, bias: 1.1, env: [[0, 0], [.3, .3], [.45, 1], [.55, -.4], [.7, 0], [1, 0]] }],
        spine: [{ axis: X, amp: .25, freq: 2 }]
      } })] })
});

const dolphin = {
  id: 'bottlenose-dolphin', name: 'Bottlenose dolphin', scientific: 'Tursiops aduncus', real: 2.7, group: 'whale',
  note: 'A short beak under a rounded melon, a hooked dorsal fin and a three-tone grey coat with a darker cape.',
  body: { K: 10, maxGap: .08, stations: [
    [0, 0, 0, 0, -.014], [.02, .012, .01, .012, -.014], [.06, .019, .015, .017, -.012], [.086, .03, .04, .022, -.007], [.12, .048, .062, .04], [.2, .07, .08, .062], [.3, .08, .09, .074],
    [.4, .078, .09, .074], [.52, .062, .078, .066], [.64, .04, .058, .052], [.76, .022, .04, .036], [.86, .011, .026, .023], [.92, .006, .015, .013], [.965, .003, .007, .006]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.42], thick: .007, outline: [[0, 0], [.03, .05], [.06, .09], [.082, .106], [.092, .098], [.084, .05], [.097, .01], [.087, 0]] },
    { name: 'flipper', mirror: true, bone: 'pectoral', root: [.25, 126, .3], span: [.7, -.5, -.5], chord: [0, -.25, -1], thick: .008, hinge: .08, stiff: .7,
      outline: [[0, 0], [0, .046], [.017, .098], [.04, .134], [.058, .126], [.068, .068], [.062, 0]] },
    { name: 'fluke', mirror: true, root: [.905, 90, 1], span: [1, 0, 0], thick: .006, outline: flukes(.064, .128) }
  ],
  eyes: { at: [.118, 86], r: .0075 },
  paint: c => {
    if (!body(c)) return finNoise(c.up < 0 && c.name !== 'dorsal' ? '#7f909e' : '#4f6277', c);
    let col = grade(c.h, [[-1, '#eceeea'], [-.45, '#e2e5e1'], [-.2, '#a2b0bb'], [.25, '#72849a'], [1, '#56687d']]);
    col = blend(col, '#3f5065', ss(c.h, .45, .8) * band(c.t, .1, .52, .06));                     // the dark cape over the back
    if (c.t < .1) col = blend(col, c.h > -.25 ? '#6a7c90' : '#e3e6e2', ss(.1 - c.t, 0, .02));    // the beak
    col = blend(col, '#4a5b6e', band(c.h, .05, .14, .03) * band(c.t, .11, .24, .02));             // a faint stripe from eye to flipper
    return mottle(col, c, .04, 24);
  },
  rig: { root: .34, head: .16, spine: [.46, .58, .7, .8, .905] },
  clips: k => swimmerClips(k,
    { name: 'swim', period: 1.15, amp: .56, plane: 'pitch', pectoral: .06, follow: .15 },
    { name: 'fast', period: .62, amp: .78, plane: 'pitch', pectoral: .03, follow: .15 },
    { name: 'idle', period: 2.6, amp: .16, plane: 'pitch', pectoral: .12, roll: .04 },
    { burst: { power: 1.1 }, turn: { curve: .6, bank: .45 }, extra: [
      breach(k, { name: 'leap', duration: 1.7, twist: 0, power: 1.2 }),
      // A spinner's corkscrew: one full roll in the air.
      k.act({ name: 'spin', duration: 1.5, mode: 'subcarangiform', samples: 72, bones: {
        root: [{ axis: Z, amp: 0, bias: Math.PI * 2, env: [[0, 0], [1, 1]] }, { axis: X, amp: 0, bias: -.35, env: [[0, 0], [.2, 1], [.8, 1], [1, 0]] }],
        spine: [{ axis: X, amp: .5, freq: 3, env: [[0, 1], [.2, .2], [1, .2]] }],
        pectoral_L: [{ axis: Z, amp: 0, bias: -.6, env: [[0, 0], [.15, 1], [.85, 1], [1, 0]] }], pectoral_R: [{ axis: Z, amp: 0, bias: .6, env: [[0, 0], [.15, 1], [.85, 1], [1, 0]] }]
      } }),
      // Riding a wave: body still, flukes barely moving, a slow roll to look across.
      k.swim({ name: 'surf', period: 3, amp: .06, plane: 'pitch', pectoral: .04, roll: .12 })] })
};

// --- Sharks -------------------------------------------------------------------------------------------------------
const blacktip = {
  id: 'blacktip-reef-shark', name: 'Blacktip reef shark', scientific: 'Carcharhinus melanopterus', real: 1.6, group: 'shark',
  note: 'Every fin dipped in black, the dorsal tip underlined in white, and a pale wedge along the flank.',
  body: { K: 10, ey: .9, maxGap: .08, stations: [
    [0, 0, 0, 0, -.004], [.02, .02, .011, .012, -.004], [.07, .042, .03, .028, -.002], [.16, .056, .052, .048], [.28, .06, .068, .062], [.42, .055, .066, .06],
    [.56, .042, .05, .046], [.68, .026, .032, .03], [.76, .014, .02, .018], [.8, .008, .014, .012]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.37], thick: .007, outline: [[0, 0], [.03, .05], [.055, .088], [.082, .118], [.094, .11], [.098, .04], [.118, .006], [.1, 0]] },
    { name: 'dorsal2', plane: 'side', root: [.645], thick: .004, outline: [[0, 0], [.02, .026], [.036, .034], [.042, .01], [.056, 0]] },
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.27, 118, .3], span: [.74, -.4, -.54], chord: [0, -.2, -1], thick: .007, hinge: .08, stiff: .6,
      outline: [[0, 0], [.012, .05], [.03, .1], [.05, .142], [.062, .134], [.07, .06], [.074, 0]] },
    { name: 'pelvic', mirror: true, root: [.57, 152, .3], span: [.45, -.82, -.35], thick: .004, outline: [[0, 0], [.014, .03], [.032, .04], [.044, .012], [.042, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.66], thick: .004, outline: [[0, 0], [.016, .026], [.032, .03], [.038, .008], [.05, 0]] },
    { name: 'caudal', plane: 'side', root: [.775, 0], thick: .006, outline: [[0, -.006], [0, .012], [.05, .062], [.12, .14], [.2, .212], [.224, .2], [.18, .1], [.12, .03], [.07, 0]] },
    { name: 'caudal', plane: 'side', root: [.775, 0], thick: .005, outline: [[0, .006], [0, -.012], [.045, -.05], [.09, -.1], [.112, -.096], [.095, -.034], [.07, 0]] }
  ],
  eyes: { at: [.072, 82], r: .007, ring: '#d8d2bd' },
  paint: c => {
    const sand = '#9a917a', black = '#15171a';
    if (!body(c)) {
      if (c.name === 'dorsal') return blend(blend(sand, '#efeadf', band(c.s, .56, .76, .04)), black, ss(c.s, .74, .8));
      if (c.name === 'caudal') return blend(sand, black, Math.max(ss(c.s, .66, .76), ss(c.u, .78, .92) * ss(c.s, .35, .5)));
      return blend(c.up < 0 && c.name === 'pectoral' ? '#e7e2d4' : sand, black, ss(c.s, .7, .78));
    }
    let col = grade(c.h, [[-1, '#f6f3ea'], [-.25, '#eeeadf'], [-.1, '#b7ae98'], [.35, '#9a917a'], [1, '#867e6a']]);
    col = blend(col, '#ebe6d8', patch(c.p, c.w * .85, -.006, .6, .06, .022, .1, .4));             // the pale wedge pushing into the flank
    return mottle(col, c, .05, 28);
  },
  rig: { root: .32, head: .15, spine: [.42, .54, .65, .74, .8, .9] },
  clips: k => swimmerClips(k,
    { name: 'swim', period: 1.5, amp: .66, mode: 'subcarangiform', pectoral: .03, follow: .1 },
    { name: 'fast', period: .7, amp: .9, mode: 'subcarangiform', pectoral: .02, follow: .1, pose: { pectoral_L: { axis: Z, bias: -.2 }, pectoral_R: { axis: Z, bias: .2 } } },
    { name: 'idle', period: 2.4, amp: .4, mode: 'subcarangiform', pectoral: .04 },
    { turn: { curve: .7, bank: .2 }, extra: [
      // The warning display of a cornered reef shark: back hunched, pectorals dropped, an exaggerated slow swim.
      k.swim({ name: 'threat', period: 1.1, amp: .95, mode: 'subcarangiform', follow: .1, roll: .06, pose: { pectoral_L: { axis: Z, bias: -.55 }, pectoral_R: { axis: Z, bias: .55 }, head: { axis: X, bias: -.12 }, root: { axis: X, bias: .1 } } })] })
};

const nurse = {
  id: 'nurse-shark', name: 'Tawny nurse shark', scientific: 'Nebrius ferrugineus', real: 2.6, group: 'shark',
  note: 'A wide blunt head with barbels, two dorsal fins set far back, and a long low tail with no lower lobe.',
  body: { K: 10, ex: .82, ey: .88, maxGap: .08, stations: [
    [0, .03, .008, .008, -.01], [.02, .05, .022, .02, -.008], [.07, .068, .04, .03, -.004], [.15, .075, .055, .04], [.26, .07, .064, .05], [.38, .058, .06, .048],
    [.5, .044, .05, .04], [.6, .03, .038, .03], [.68, .02, .027, .022], [.735, .013, .019, .016]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.47], thick: .006, outline: [[0, 0], [.03, .05], [.06, .072], [.086, .068], [.097, .03], [.106, 0]] },
    { name: 'dorsal2', plane: 'side', root: [.61], thick: .005, outline: [[0, 0], [.025, .04], [.05, .055], [.07, .05], [.079, .02], [.086, 0]] },
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.2, 112, .3], span: [.82, -.22, -.52], chord: [0, -.15, -1], thick: .007, hinge: .08, stiff: .6,
      outline: [[0, 0], [.008, .06], [.034, .116], [.066, .12], [.088, .07], [.088, 0]] },
    { name: 'pelvic', mirror: true, root: [.48, 150, .3], span: [.55, -.76, -.34], thick: .004, outline: [[0, 0], [.012, .036], [.036, .05], [.054, .02], [.052, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.655], thick: .004, outline: [[0, 0], [.018, .026], [.04, .03], [.05, .01], [.056, 0]] },
    { name: 'caudal', plane: 'side', root: [.725, 0], lean: 9, thick: .005, core: [.14, .012],
      outline: [[0, -.012], [0, .014], [.08, .04], [.2, .058], [.262, .052], [.278, .028], [.258, 0], [.2, -.022], [.1, -.03], [.04, -.02]] }
  ],
  eyes: { at: [.062, 76], r: .0042, glint: false },
  lumps: [{ at: [.006, 150], size: [.004, .013, .004], color: '#8a6b47', sharp: true, lift: .6 }],
  paint: c => {
    if (!body(c)) return finNoise(blend(c.up < 0 && (c.name === 'pectoral' || c.name === 'pelvic') ? '#d9caae' : '#9c7c55', '#7d5f3e', ss(c.s, .82, 1) * .5), c, .08);
    if (c.cap === 'front') return blend('#b89a74', '#6b4c33', band(c.h, -.4, .05, .15));
    return mottle(grade(c.h, [[-1, '#eae1ca'], [-.4, '#dccaa9'], [-.12, '#ae906a'], [.4, '#9a7a52'], [1, '#8c6c47']]), c, .09, 20);
  },
  rig: { root: .32, head: .14, spine: [.4, .52, .63, .73, .83, .92] },
  clips: k => swimmerClips(k,
    { name: 'swim', period: 2.6, amp: .8, mode: 'anguilliform', pectoral: .03, follow: .06, recoil: 1.6 },
    { name: 'fast', period: 1.4, amp: 1, mode: 'anguilliform', pectoral: .02, follow: .06, recoil: 1.6 },
    // Lying on the sand it only breathes: a flicker down the tail and the fins settling.
    { name: 'rest', period: 4.2, amp: .05, mode: 'anguilliform', pectoral: .025, recoil: 0, roll: .004, heave: .0012,
      pose: { spine_2: { axis: Y, bias: .1 }, spine_3: { axis: Y, bias: .16 }, spine_4: { axis: Y, bias: .2 }, spine_5: { axis: Y, bias: .2 }, pectoral_L: { axis: Z, bias: .22 }, pectoral_R: { axis: Z, bias: -.22 } } },
    { burst: { mode: 'anguilliform' }, turn: { curve: .9 }, extra: [
      // Nosing into a crevice and sucking out a meal: the head dips and jerks back, the body braced.
      k.act({ name: 'suck', duration: 1.4, mode: 'anguilliform', bones: {
        head: [{ axis: X, amp: 0, bias: .22, env: [[0, 0], [.3, 1], [.42, -.4], [.6, .3], [1, 0]] }],
        root: [{ axis: X, amp: 0, bias: .12, env: [[0, 0], [.3, 1], [.8, .5], [1, 0]] }],
        pectoral_L: [{ axis: Z, amp: 0, bias: .3, env: [[0, 0], [.2, 1], [.8, 1], [1, 0]] }], pectoral_R: [{ axis: Z, amp: 0, bias: -.3, env: [[0, 0], [.2, 1], [.8, 1], [1, 0]] }]
      }, root: { z: { bias: .03, env: [[0, 0], [.3, 1], [.42, -.5], [.7, 0], [1, 0]] } } })] })
};

// --- Big fish -----------------------------------------------------------------------------------------------------
const tuna = {
  id: 'yellowfin-tuna', name: 'Yellowfin tuna', scientific: 'Thunnus albacares', real: 1.5, group: 'fish', school: true,
  note: 'A torpedo with a gold flank stripe, yellow sickle fins and finlets, and a hard crescent tail.',
  body: { K: 10, maxGap: .085, stations: [
    [0, 0, 0, 0, 0], [.03, .022, .03, .028], [.1, .05, .07, .064], [.2, .07, .105, .098], [.32, .078, .125, .118], [.44, .072, .12, .115], [.56, .056, .095, .092],
    [.68, .036, .062, .06], [.78, .018, .032, .031], [.85, .009, .014, .014], [.885, .013, .008, .008]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.3], thick: .004, outline: [[0, 0], [.012, .07], [.032, .058], [.1, .012], [.13, 0]] },
    { name: 'sickle', plane: 'side', root: [.5], thick: .004, embed: .4, outline: [[0, 0], [.02, .07], [.06, .152], [.076, .15], [.056, .06], [.07, 0]] },
    { name: 'sickle', plane: 'side', down: true, root: [.54], thick: .004, embed: .4, outline: [[0, 0], [.02, .07], [.06, .146], [.076, .144], [.056, .06], [.07, 0]] },
    ...[.61, .655, .7, .745, .79].flatMap(t => [
      { name: 'finlet', plane: 'side', root: [t], thick: .002, embed: .5, outline: [[0, 0], [.014, .016], [.026, 0]] },
      { name: 'finlet', plane: 'side', down: true, root: [t + .012], thick: .002, embed: .5, outline: [[0, 0], [.014, .016], [.026, 0]] }]),
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.24, 100, .3], span: [.5, -.24, -.83], chord: [0, -.5, -.6], thick: .004, hinge: .05, stiff: .4,
      outline: [[0, 0], [.008, .05], [.022, .14], [.032, .152], [.04, .06], [.036, 0]] },
    { name: 'pelvic', mirror: true, root: [.3, 160, .3], span: [.3, -.8, -.5], thick: .003, outline: [[0, 0], [.01, .04], [.026, .05], [.03, 0]] },
    { name: 'caudal', plane: 'side', root: [.872, 0], thick: .005, core: [.07, .09], outline: [[0, -.004], [0, .012], [.035, .07], [.085, .15], [.128, .2], [.122, .17], [.086, .08], [.06, .02], [.045, 0]] },
    { name: 'caudal', plane: 'side', root: [.872, 0], thick: .005, core: [.07, -.09], outline: [[0, .004], [0, -.012], [.035, -.07], [.085, -.15], [.128, -.2], [.122, -.17], [.086, -.08], [.06, -.02], [.045, 0]] }
  ],
  eyes: { at: [.078, 82], r: .0115, ring: '#cfd6d4' },
  paint: c => {
    if (!body(c)) {
      if (c.name === 'sickle') return blend('#f2c530', '#c99a1e', ss(c.s, .7, 1));
      if (c.name === 'finlet') return blend('#f2c530', '#4a3a1a', ss(c.s, .75, 1) * .7);
      return finNoise(c.name === 'caudal' ? '#28394c' : c.name === 'pelvic' ? '#d9dfde' : '#22344a', c);
    }
    let col = grade(c.h, [[-1, '#f0f2ef'], [-.3, '#d9e0e0'], [.15, '#b6c2c8'], [.42, '#8fa2b0'], [.62, '#243e62'], [1, '#182c4b']]);
    col = blend(col, '#d9b440', band(c.h, .3, .5, .05) * ss(c.t, .08, .15) * (1 - ss(c.t, .7, .8)) * .9);   // the gold stripe
    // Faint broken pale bars across the lower flank.
    col = blend(col, '#f2f4f2', ss(Math.sin(c.t * 120 + Math.sin(c.t * 30) * 2) , .6, .9) * band(c.h, -.6, -.05, .1) * band(c.t, .35, .7, .05) * .35);
    return mottle(col, c, .03, 30);
  },
  rig: { root: .34, head: .15, spine: [.5, .62, .73, .82, .872] },
  swimShader: { amp: .06, waves: .45, power: 3.2 },
  clips: k => swimmerClips(k,
    { name: 'swim', period: .5, amp: .6, mode: 'thunniform', follow: .12, recoil: .5, roll: .006 },
    { name: 'fast', period: .28, amp: .78, mode: 'thunniform', follow: .12, recoil: .5, roll: .006 },
    { name: 'idle', period: .8, amp: .34, mode: 'thunniform', follow: .12, recoil: .4, pectoral: .05 },
    { burst: { name: 'strike', duration: .7, power: .8, mode: 'thunniform' }, turn: { curve: .35 } })
};

const trevally = {
  id: 'giant-trevally', name: 'Giant trevally', scientific: 'Caranx ignobilis', real: 1.1, group: 'fish', school: true,
  note: 'A deep silver body with a steep blunt forehead, sickle pectorals and a hard forked tail.',
  body: { K: 10, maxGap: .085, stations: [
    [0, 0, 0, 0, -.03], [.02, .016, .05, .03, -.022], [.06, .032, .11, .055, -.012], [.14, .048, .16, .085], [.26, .058, .185, .125], [.38, .056, .18, .13], [.5, .046, .15, .112],
    [.62, .032, .105, .08], [.72, .02, .06, .05], [.8, .011, .026, .025], [.845, .008, .014, .014]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.3], thick: .004, outline: [[0, 0], [.02, .05], [.05, .045], [.085, 0]] },
    { name: 'dorsal2', plane: 'side', root: [.43], thick: .004, embed: .35, core: [.1, .03], outline: [[0, 0], [.02, .08], [.045, .112], [.062, .06], [.16, .024], [.3, .014], [.325, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.5], thick: .004, embed: .35, core: [.08, .028], outline: [[0, 0], [.02, .07], [.04, .095], [.056, .05], [.14, .02], [.24, .012], [.26, 0]] },
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.24, 104, .3], span: [.5, -.45, -.74], chord: [0, -.6, -.6], thick: .004, hinge: .05, stiff: .4,
      outline: [[0, 0], [.008, .06], [.026, .15], [.038, .162], [.046, .07], [.04, 0]] },
    { name: 'pelvic', mirror: true, root: [.3, 165, .3], span: [.25, -.85, -.45], thick: .003, outline: [[0, 0], [.01, .045], [.03, .055], [.036, 0]] },
    { name: 'caudal', plane: 'side', root: [.835, 0], thick: .005, core: [.085, .09], outline: [[0, -.004], [0, .013], [.04, .07], [.1, .15], [.166, .2], [.152, .16], [.1, .07], [.07, .015], [.05, 0]] },
    { name: 'caudal', plane: 'side', root: [.835, 0], thick: .005, core: [.085, -.09], outline: [[0, .004], [0, -.013], [.04, -.07], [.1, -.15], [.166, -.2], [.152, -.16], [.1, -.07], [.07, -.015], [.05, 0]] }
  ],
  eyes: { at: [.09, 66], r: .0135, ring: '#d8dedc' },
  paint: c => {
    if (!body(c)) return finNoise(c.name === 'pelvic' ? '#c7ced0' : blend('#3a434c', '#20262c', ss(c.s, .6, 1)), c);
    let col = grade(c.h, [[-1, '#eceeeb'], [-.4, '#d2d9d9'], [0, '#b1bcc1'], [.5, '#848f9b'], [1, '#4f5b66']]);
    col = blend(col, '#2f383f', ss(noise(c.t * 140, c.h * 22 + 3), .78, .86) * ss(c.h, -.1, .4) * .6);   // the fine dark peppering of a big male
    return mottle(col, c, .04, 26);
  },
  rig: { root: .36, head: .16, spine: [.5, .62, .72, .8, .845] },
  swimShader: { amp: .075, waves: .7, power: 2.2 },
  clips: k => swimmerClips(k,
    { name: 'swim', period: .78, amp: .62, mode: 'carangiform', follow: .1, pectoral: .06 },
    { name: 'fast', period: .36, amp: .85, mode: 'carangiform', follow: .1, pectoral: .03 },
    { name: 'idle', period: 1.3, amp: .3, mode: 'carangiform', pectoral: .14 },
    { burst: { name: 'strike', power: 1 }, turn: { curve: .6, bank: .22 } })
};

const bumphead = {
  id: 'bumphead-parrotfish', name: 'Bumphead parrotfish', scientific: 'Bolbometopon muricatum', real: 1.2, group: 'fish',
  note: 'A wall of a forehead above a pale beak; it rows with its pectoral fins, bites at the reef and rams it.',
  body: { K: 10, ex: .9, maxGap: .085, stations: [
    [0, .026, .045, .05, .13], [.012, .046, .1, .14, .105], [.035, .06, .125, .23, .11], [.07, .07, .135, .262, .105], [.12, .077, .16, .235, .06], [.19, .083, .185, .19, .012], [.3, .085, .195, .175], [.44, .078, .185, .165],
    [.58, .06, .14, .13], [.7, .04, .092, .085], [.78, .026, .06, .055], [.83, .02, .05, .046]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.2], thick: .004, embed: .3, core: [.26, .02], outline: [[0, 0], [.02, .04], [.2, .052], [.42, .046], [.5, .03], [.52, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.52], thick: .004, embed: .3, outline: [[0, 0], [.02, .04], [.14, .042], [.2, .022], [.21, 0]] },
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.25, 100, .2], span: [.3, -.45, -.84], chord: [0, .85, -.5], thick: .004, hinge: .04, stiff: .3,
      outline: [[0, 0], [-.01, .06], [.01, .12], [.045, .142], [.078, .1], [.072, 0]] },
    { name: 'pelvic', mirror: true, root: [.3, 162, .3], span: [.3, -.85, -.42], thick: .003, outline: [[0, 0], [.012, .06], [.04, .075], [.05, 0]] },
    { name: 'caudal', plane: 'side', root: [.815, 0], thick: .005, core: [.085, 0],
      outline: [[0, -.05], [0, .05], [.06, .1], [.15, .136], [.184, .13], [.155, .06], [.165, 0], [.155, -.06], [.184, -.13], [.15, -.136], [.06, -.1]] }
  ],
  eyes: { at: [.1, 62], r: .012, ring: '#cfe3d6' },
  lumps: [{ at: [.014, 180], size: [.04, .026, .04], color: '#ece6d2', mirror: false, keep: true, lift: .15 }],
  paint: c => {
    if (!body(c)) return finNoise(blend(c.name === 'pectoral' ? '#4a9c94' : '#2d7c80', '#63b3a4', ss(c.s, .65, 1)), c);
    if (c.cap === 'front') return '#c2aaa2';
    let col = grade(c.h, [[-1, '#78b9a6'], [-.3, '#4f9a90'], [.4, '#3a8783'], [1, '#2d6f71']]);
    // Big scales, each a little lighter at its edge, give the flank its texture.
    col = shadeBy(col, 1 + .08 * (ss(Math.abs(Math.sin(c.t * 70)) * Math.abs(Math.sin(c.a * 9)), .55, .9) - .5));
    const face = Math.max(1 - ss(c.t, .045, .085), (1 - ss(c.t, .08, .13)) * ss(c.h, .3, .6));        // the pale, scarred face and forehead
    return mottle(blend(col, c.h > .3 ? '#b9a29c' : '#c9b2a6', face), c, .07, 18);
  },
  rig: { root: .36, head: .15, spine: [.5, .62, .72, .815] },
  clips: k => swimmerClips(k,
    { name: 'swim', period: 1.25, amp: .24, mode: 'carangiform', pectoral: .5, pectoralMode: 'row', follow: .08, roll: .02 },
    { name: 'fast', period: .6, amp: .62, mode: 'carangiform', pectoral: .2, pectoralMode: 'row', follow: .08 },
    // Nose down at the coral, two bites to a stroke of the fins.
    { name: 'graze', period: 1.8, amp: .1, mode: 'carangiform', pectoral: .32, pectoralMode: 'row', roll: .01,
      pose: { root: { axis: X, bias: .34 }, head: [{ axis: X, amp: .09, freq: 2, skew: .6 }] } },
    { turn: { curve: .5 }, extra: [
      // Head-butting the reef: a wind-up with the nose lifted, a drive down and forward, and a recoil.
      k.act({ name: 'ram', duration: 1.3, bones: {
        root: [{ axis: X, amp: 0, bias: .55, env: [[0, 0], [.22, -.35], [.38, 1], [.5, .2], [.75, .1], [1, 0]] }],
        spine: [{ axis: Y, amp: .5, freq: 2.5, env: [[0, 0], [.2, 1], [.4, 1], [.6, .3], [1, 0]] }],
        pectoral_L: [{ axis: Z, amp: 0, bias: -.6, env: [[0, 0], [.25, 1], [.45, -.4], [1, 0]] }], pectoral_R: [{ axis: Z, amp: 0, bias: .6, env: [[0, 0], [.25, 1], [.45, -.4], [1, 0]] }]
      }, root: { z: { bias: .08, env: [[0, 0], [.22, -.3], [.38, 1], [.55, .7], [1, 0]] } } })] })
};

const barracuda = {
  id: 'great-barracuda', name: 'Great barracuda', scientific: 'Sphyraena barracuda', real: 1.4, group: 'fish', school: true,
  note: 'A silver pike of the sea: a long jaw that juts beneath, two small dorsals far apart, dark bars and ink blots.',
  body: { K: 8, maxGap: .085, stations: [
    [0, 0, 0, 0, -.014], [.03, .012, .01, .016, -.013], [.1, .026, .024, .034, -.007], [.2, .04, .042, .05], [.32, .046, .056, .058], [.46, .046, .06, .06], [.6, .04, .054, .054],
    [.72, .028, .04, .04], [.8, .018, .026, .026], [.855, .011, .016, .016]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.4], thick: .003, outline: [[0, 0], [.02, .055], [.04, .04], [.07, 0]] },
    { name: 'dorsal2', plane: 'side', root: [.66], thick: .003, outline: [[0, 0], [.02, .06], [.04, .055], [.055, .015], [.075, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.68], thick: .003, outline: [[0, 0], [.02, .055], [.04, .05], [.055, .015], [.07, 0]] },
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.25, 106, .3], span: [.6, -.4, -.69], chord: [0, -.7, -.5], thick: .003, hinge: .05, stiff: .4, outline: [[0, 0], [.006, .04], [.02, .078], [.034, .07], [.036, 0]] },
    { name: 'pelvic', mirror: true, root: [.38, 158, .3], span: [.3, -.85, -.42], thick: .003, outline: [[0, 0], [.01, .03], [.026, .04], [.03, 0]] },
    { name: 'caudal', plane: 'side', root: [.845, 0], thick: .004, core: [.075, .06], outline: fork(.155, .14, { root: .014, fork: .52 }).upper },
    { name: 'caudal', plane: 'side', root: [.845, 0], thick: .004, core: [.075, -.06], outline: fork(.155, .14, { root: .014, fork: .52 }).lower }
  ],
  eyes: { at: [.118, 78], r: .0105, ring: '#d9dfdc' },
  mouth: { t: .06, size: [.012, .008, .05], drop: -.006, color: '#3a2226' },
  spots(random) {
    const list = [];
    for (let i = 0; i < 9; i++) list.push({ t: .48 + random() * .34, a: 102 + random() * 30, r: .006 + random() * .006, color: '#161d21', rough: .5 });
    return list;
  },
  paint: c => {
    if (!body(c)) {
      if (c.name === 'caudal') return blend('#27323a', '#d3dbdb', ss(c.s, .78, .9));
      return finNoise(c.name === 'pectoral' || c.name === 'pelvic' ? '#aebabd' : '#4c5f69', c);
    }
    let col = grade(c.h, [[-1, '#f0f2ef'], [-.45, '#d9e1e1'], [0, '#a9b9bd'], [.45, '#6c8590'], [1, '#3f5761']]);
    // Eighteen or so dark bars slanting back across the upper flank.
    const bars = ss(1 - Math.abs(((c.t + c.h * .025) / .042) % 1 - .5) * 2, .58, .76) * ss(c.h, .02, .28) * band(c.t, .24, .82, .04);
    col = blend(col, '#33464f', bars * .75);
    if (c.t < .09) col = blend(col, '#2c2224', band(c.h, -.3, -.12, .04) * .8);                    // the long mouth line
    return mottle(col, c, .04, 30);
  },
  rig: { root: .36, head: .2, spine: [.5, .62, .73, .8, .845], jaw: { hinge: .09, line: -.006 } },
  swimShader: { amp: .07, waves: .8, power: 2 },
  clips: k => swimmerClips(k,
    { name: 'swim', period: 1.1, amp: .52, mode: 'carangiform', follow: .1, pectoral: .08 },
    { name: 'fast', period: .34, amp: .9, mode: 'subcarangiform', follow: .1 },
    // Hanging in the current: the tail barely ticks over and the pectorals scull to hold station.
    { name: 'hover', period: 2.4, amp: .07, mode: 'carangiform', pectoral: .3, recoil: .4, roll: .02, heave: .008, jaw: .08, jawRate: .5 },
    { burst: { name: 'strike', duration: .8, power: 1.1, jaw: .55 }, turn: { curve: .45 } })
};

// --- Rays ---------------------------------------------------------------------------------------------------------
// Round the disc a ray's vertices crowd toward its midline, where the body rises out of the wing.
const raySection = (hump = .2) => (a, s) => {
  const fold = Math.acos(Math.abs(Math.cos(a))) / (Math.PI / 2), u = Math.pow(fold, 1.6), top = Math.cos(a) >= 0;
  const rise = u < hump ? 1 - u / hump * .34 : .66 * Math.pow(1 - (u - hump) / (1 - hump), 1.25);
  return [Math.sign(Math.sin(a)) * u * s[1], (top ? s[2] : -s[3]) * (top ? rise : Math.pow(1 - u, .8))];
};
const edgeOf = c => Math.min(1, Math.abs(c.p.x) / Math.max(c.w, 1e-4));
// Rays steer by stroking one wing harder; and settle into sand with a flurry of the disc's edge.
function rayClips(k, swim, glide, rest, extra = []) {
  const bury = k.act({ name: 'bury', duration: 2.6, bones: Object.fromEntries(k.rig.bones.filter(b => b.axis).map(b => [b.name, [
    { axis: b.axis, amp: b.ring ? .32 : .12, freq: 7, phase: b.rib * .3, env: [[0, 0], [.12, 1], [.7, .8], [1, 0]] },
    { axis: b.axis, amp: 0, bias: b.ring ? -.12 : .05, env: [[0, 0], [.3, 1], [1, 1]] }]])), root: { y: { bias: -.015, env: [[0, 0], [.1, .4], [.5, 1], [1, 1]] } } });
  return [k.ray(swim), k.ray(glide), k.ray(rest), k.ray({ ...swim, name: 'turn_left', turn: 1 }), k.ray({ ...swim, name: 'turn_right', turn: -1 }),
    k.ray({ ...swim, name: 'fast', period: swim.period * .55, amp: swim.amp * 1.2 }), bury, ...extra];
}
const whipray = {
  id: 'pink-whipray', name: 'Pink whipray', scientific: 'Pateobatis fai', real: 3, group: 'ray', span: 1.3,
  note: 'A kite-shaped disc a diver could lie on, plain and sandy, trailing a whip twice its own length.',
  body: { K: 12, shape: raySection(.2), maxGap: .05, stations: [
    [0, 0, 0, 0], [.02, .03, .006, .005], [.07, .1, .014, .01], [.14, .185, .022, .014], [.19, .216, .024, .015], [.25, .19, .024, .014], [.31, .13, .02, .012], [.36, .07, .016, .01], [.4, .022, .012, .008], [.42, .008, .008, .006]] },
  tail: { K: 4, maxGap: .1, stations: [[.36, .012, .012, .009], [.42, .012, .012, .009], [.52, .008, .008, .007], [.7, .005, .005, .005], [.88, .0028, .0028, .0028], [1, 0, 0, 0]] },
  eyes: { at: [.105, 36], r: .0058, ring: '#b6a48b', glint: false },
  lumps: [{ at: [.125, 26], size: [.008, .003, .012], color: '#3b332b' }],
  paint: c => {
    if (c.part === 'tail') return mottle(blend('#857668', '#4b4139', ss(c.t, .5, .75)), c, .08, 40);
    const top = blend('#8a7a6a', '#b6a690', ss(edgeOf(c), .45, 1));
    return mottle(blend('#efebe1', top, ss(c.h, -.1, .12)), c, .1, 22);
  },
  rig: { kind: 'ray', centre: .2, halfSpan: .216, ribs: [35, 90, 140], radii: [.3, .68], tail: [.46, .6, .74, .87] },
  clips: k => rayClips(k,
    { name: 'swim', period: 2.3, amp: .44, wave: .3, tail: .14 },
    { name: 'glide', period: 4.5, amp: .12, wave: .22, tail: .2, heave: .004 },
    { name: 'rest', period: 3.6, amp: .035, wave: .4, tail: .03, heave: .001, ripple: 1.6 })
};
const bluespot = {
  id: 'bluespotted-ray', name: 'Bluespotted ribbontail ray', scientific: 'Taeniura lymma', real: .7, group: 'ray', span: .3,
  note: 'An ochre oval scattered with electric-blue spots, with a blue-striped tail and bulging golden eyes.',
  body: { K: 12, shape: raySection(.24), maxGap: .06, stations: [
    [0, 0, 0, 0], [.015, .07, .008, .006], [.06, .15, .02, .012], [.13, .2, .03, .016], [.22, .215, .034, .018], [.31, .2, .032, .016], [.38, .15, .026, .014], [.43, .08, .02, .012], [.465, .03, .016, .01], [.48, .012, .012, .008]] },
  tail: { K: 4, maxGap: .1, stations: [[.4, .02, .018, .012], [.48, .022, .02, .014], [.6, .015, .016, .012], [.78, .01, .013, .01], [.93, .005, .008, .007], [1, 0, 0, 0]] },
  eyes: { at: [.125, 34], r: .015, ring: '#e2c463' },
  spots(random) {
    const list = [];
    for (let i = 0; i < 26; i++) list.push({ t: .04 + random() * .39, a: 10 + random() * 70, r: .007 + random() * .009, color: random() < .5 ? '#2f7fe8' : '#4a96f0' });
    return list;
  },
  paint: c => {
    if (c.part === 'tail') return blend(blend('#c8a547', '#3b82e0', ss(Math.abs(c.lat), .45, .7)), '#efe6cc', ss(-c.h, .3, .6));
    const top = blend('#bf9b40', '#dfc063', ss(edgeOf(c), .55, 1));
    return mottle(blend('#f4efdf', top, ss(c.h, -.1, .12)), c, .08, 26);
  },
  rig: { kind: 'ray', centre: .23, halfSpan: .215, ribs: [30, 90, 145], radii: [.32, .7], tail: [.52, .65, .78, .9] },
  clips: k => rayClips(k,
    { name: 'swim', period: 1.1, amp: .4, wave: .34, tail: .1 },
    { name: 'glide', period: 2.6, amp: .14, wave: .25, tail: .14, heave: .004 },
    { name: 'rest', period: 3, amp: .03, wave: .4, tail: .02, heave: .001, ripple: 1.8 })
};

// --- Riders and fliers --------------------------------------------------------------------------------------------
const remora = {
  id: 'remora', name: 'Live sharksucker', scientific: 'Echeneis naucrates', real: .6, group: 'fish',
  note: 'A slim hitch-hiker with a sucker plate on its crown and an ink stripe edged in white.',
  body: { K: 10, maxGap: .09, stations: [
    [0, 0, 0, 0, -.012], [.02, .02, .006, .014, -.01], [.08, .036, .012, .03, -.006], [.18, .042, .026, .038], [.3, .04, .04, .042], [.45, .034, .04, .04], [.6, .026, .032, .032],
    [.74, .016, .022, .022], [.84, .009, .013, .013], [.875, .006, .01, .01]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.52], thick: .003, embed: .3, core: [.1, .016], outline: [[0, 0], [.03, .042], [.12, .036], [.26, .018], [.3, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.52], thick: .003, embed: .3, core: [.1, .016], outline: [[0, 0], [.03, .042], [.12, .036], [.26, .018], [.3, 0]] },
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.22, 86, .3], span: [.72, .22, -.66], chord: [0, -.8, -.5], thick: .003, hinge: .05, stiff: .4, outline: [[0, 0], [.008, .04], [.03, .076], [.046, .06], [.042, 0]] },
    { name: 'pelvic', mirror: true, root: [.26, 160, .3], span: [.3, -.8, -.5], thick: .003, outline: [[0, 0], [.01, .03], [.028, .04], [.03, 0]] },
    { name: 'caudal', plane: 'side', root: [.865, 0], thick: .004, core: [.06, 0], outline: [[0, -.012], [0, .012], [.05, .04], [.128, .058], [.11, .02], [.098, 0], [.11, -.02], [.128, -.058], [.05, -.04]] }
  ],
  eyes: { at: [.088, 84], r: .0085, ring: '#d6dad6' },
  lumps: [{ at: [.11, 0], size: [.027, .005, .082], color: '#30353a', mirror: false, keep: true, lift: .3 }, { at: [.11, 0], size: [.018, .007, .07], color: '#565c62', mirror: false, lift: .5 }],
  paint: c => {
    if (!body(c)) return blend('#2a2e33', '#e9ece7', ss(c.s, .7, .82));
    let col = grade(c.h, [[-1, '#666b70'], [1, '#575c61']]);
    col = blend(col, '#e8ebe6', band(Math.abs(c.h), .17, .34, .04));                             // the white margins
    col = blend(col, '#1d2125', 1 - ss(Math.abs(c.h), .14, .2));                                 // the ink stripe
    return mottle(col, c, .04, 30);
  },
  rig: { root: .32, head: .14, spine: [.44, .56, .68, .78, .865] },
  clips: k => swimmerClips(k,
    { name: 'swim', period: .8, amp: .62, mode: 'subcarangiform', pectoral: .1, follow: .08 },
    { name: 'fast', period: .42, amp: .8, mode: 'subcarangiform', pectoral: .05, follow: .08 },
    { name: 'ride', period: 1.7, amp: .12, mode: 'subcarangiform', pectoral: .06, recoil: 0, roll: .004, heave: .001 },
    { burst: { name: 'detach', power: .9 }, turn: { curve: .7 } })
};

const flyingFishFolded = { pectoral_L: [{ axis: Y, bias: 1.22 }, { axis: Z, bias: -.1 }], pectoral_R: [{ axis: Y, bias: -1.22 }, { axis: Z, bias: .1 }], pelvic_L: [{ axis: Y, bias: 1.1 }], pelvic_R: [{ axis: Y, bias: -1.1 }] };
const flyingFish = {
  id: 'flying-fish', name: 'Two-wing flying fish', scientific: 'Exocoetus volitans', real: .3, group: 'fish', school: true,
  note: 'Pectoral fins as long as its body, held spread to glide; underwater they lie folded along its flanks.',
  body: { K: 8, maxGap: .1, stations: [[0, 0, 0, 0], [.03, .02, .022, .024], [.1, .04, .045, .05], [.24, .05, .058, .062], [.4, .05, .058, .06], [.56, .04, .046, .048], [.7, .026, .03, .03], [.8, .014, .016, .016]] },
  fins: [
    { name: 'wing', mirror: true, keep: true, bone: 'pectoral', root: [.2, 68, .2], span: [1, .12, -.22], chord: [0, 0, -1], thick: .003, hinge: 0, stiff: .08,
      outline: [[0, 0], [0, .2], [.03, .45], [.07, .6], [.12, .56], [.14, .35], [.12, .12], [.09, 0]] },
    { name: 'wing2', mirror: true, bone: 'pelvic', root: [.5, 124, .2], span: [1, -.1, -.3], chord: [0, 0, -1], thick: .003, hinge: 0, stiff: .12,
      outline: [[0, 0], [0, .1], [.03, .22], [.07, .2], [.08, .08], [.06, 0]] },
    { name: 'dorsal', plane: 'side', root: [.66], thick: .003, outline: [[0, 0], [.02, .04], [.06, .03], [.1, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.68], thick: .003, outline: [[0, 0], [.02, .03], [.06, .024], [.09, 0]] },
    { name: 'caudal', plane: 'side', root: [.79, 0], thick: .004, core: [.06, .04], outline: [[0, -.003], [0, .012], [.05, .06], [.13, .11], [.1, .045], [.075, 0]] },
    { name: 'caudal', plane: 'side', root: [.79, 0], thick: .004, core: [.08, -.06], outline: [[0, .003], [0, -.012], [.06, -.08], [.21, -.16], [.13, -.06], [.075, 0]] }
  ],
  eyes: { at: [.072, 76], r: .019, ring: '#dfe7ea' },
  paint: c => {
    if (!body(c)) {
      if (c.name === 'wing' || c.name === 'wing2') {
        // A clear membrane between dark rays, darker toward the tip.
        const rays = ss(Math.abs(Math.sin(c.u * 22)), .85, .97) * .35;
        return blend(blend(c.up > 0 ? '#7194b9' : '#a9c1d6', '#3c5f8a', ss(c.s, .65, 1) * .8), '#2c4a70', rays);
      }
      return finNoise('#33557f', c);
    }
    return mottle(grade(c.h, [[-1, '#f0f3f1'], [-.35, '#c9d7e0'], [-.05, '#7fa2c4'], [.3, '#2f5b8e'], [1, '#1b3d68']]), c, .04, 30);
  },
  rig: { root: .36, head: .16, spine: [.5, .62, .72, .79] },
  swimShader: { amp: .08, waves: .7, power: 2 }, poses: { folded: flyingFishFolded },
  clips: k => {
    const tremble = { pectoral_L: [{ axis: Z, amp: .035, freq: 3, bias: .12 }], pectoral_R: [{ axis: Z, amp: -.035, freq: 3, bias: -.12 }] };
    const swim = k.swim({ name: 'swim', period: .34, amp: .7, mode: 'carangiform', follow: .1, pose: flyingFishFolded });
    const unfold = (from, to) => Object.fromEntries(Object.entries(flyingFishFolded).map(([bone, parts]) => [bone, parts.map(part => ({ ...part, amp: 0, env: [[0, from], [.55, from], [.8, to], [1, to]] }))]));
    return [
      swim, k.turn(swim, 1, { curve: .5 }), k.turn(swim, -1, { curve: .5 }),
      // Out of the water: wings locked a touch above level, the body a rigid dart.
      k.swim({ name: 'glide', period: 1.2, amp: .03, mode: 'carangiform', recoil: 0, roll: .03, heave: 0, pose: tremble }),
      // The take-off run: wings out, the long lower tail lobe sculling the surface.
      k.swim({ name: 'taxi', period: .16, amp: .95, mode: 'carangiform', recoil: .3, heave: 0, samples: 16, pose: tremble }),
      // Breaking out: a furious tail, then the wings snap open as it leaves the water.
      k.act({ name: 'launch', duration: 1.2, bones: { ...unfold(1, 0), spine: [{ axis: Y, amp: .9, freq: 7, env: [[0, .3], [.5, 1], [.8, 1], [1, 0]] }], root: [{ axis: X, amp: 0, bias: -.3, env: [[0, 0], [.6, 1], [1, .3]] }] } }),
      // Re-entry: the wings fold away as it drops back in.
      k.act({ name: 'land', duration: .8, bones: { ...unfold(0, 1), spine: [{ axis: Y, amp: .5, freq: 3, env: [[0, 0], [.6, 0], [.8, 1], [1, 0]] }], root: [{ axis: X, amp: 0, bias: .35, env: [[0, 0], [.4, 1], [1, 0]] }] } }),
      k.burst({ name: 'burst', duration: .5 })
    ];
  }
};

// --- Eels -----------------------------------------------------------------------------------------------------------
// Long bodies swum with the whole length, a fin running down the back, and a jaw that works as they breathe.
function eelClips(k, period, amp, extra = []) {
  const swim = k.swim({ name: 'swim', period, amp, mode: 'anguilliform', follow: .05, recoil: 1.4 });
  return [swim, k.swim({ name: 'fast', period: period * .55, amp: amp * 1.2, mode: 'anguilliform', follow: .05, recoil: 1.4 }),
    k.turn(swim, 1, { curve: 1.2, bank: .05 }), k.turn(swim, -1, { curve: 1.2, bank: .05 }),
    // Out of its hole up to the shoulders: the body still, the head weaving slowly, the mouth pumping water over the gills.
    k.swim({ name: 'breathe', period: 3.2, amp: .05, mode: 'anguilliform', recoil: 0, roll: 0, heave: 0, jaw: .32, jawRate: 2, pose: { head: { axis: Y, amp: .08 }, spine_1: { axis: X, bias: -.06 } } }),
    // The strike: drawn back into an S, then the head flung forward with the jaws wide, and back.
    k.act({ name: 'strike', duration: 1.3, mode: 'anguilliform', bones: {
      spine: [{ axis: Y, amp: 2.6, freq: 0, phase: -.25, travel: 1.1, env: [[0, 0], [.32, 1], [.44, -.15], [.7, .1], [1, 0]] }],
      head: [{ axis: X, amp: 0, bias: -.18, env: [[0, 0], [.32, .4], [.44, 1], [.7, .2], [1, 0]] }],
      jaw: [{ axis: X, amp: 0, bias: .75, env: [[0, .2], [.3, .4], [.42, 1], [.6, 1], [.8, .2], [1, .2]] }]
    }, root: { z: { bias: .1, env: [[0, 0], [.32, -.4], [.44, 1], [.7, .7], [1, 0]] } } }),
    ...extra];
}
const moray = {
  id: 'giant-moray', name: 'Giant moray', scientific: 'Gymnothorax javanicus', real: 2.5, group: 'eel',
  note: 'A heavy, leopard-spotted eel with a black patch at the gill and a mouth always working.',
  body: { K: 10, ex: .9, maxGap: .07, stations: [
    [0, 0, 0, 0, 0], [.012, .01, .008, .01, -.002], [.04, .02, .018, .022, -.001], [.08, .03, .031, .035], [.13, .034, .041, .042], [.2, .033, .042, .04], [.4, .032, .042, .04],
    [.6, .028, .038, .036], [.8, .018, .03, .028], [.92, .01, .02, .018], [1, 0, .004, .004]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.14], thick: .003, embed: .15, core: [.42, .012], outline: [[0, 0], [.04, .018], [.4, .024], [.68, .02], [.8, .011], [.86, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.45], thick: .003, embed: .15, core: [.27, .01], outline: [[0, 0], [.03, .014], [.38, .017], [.5, .007], [.55, 0]] }
  ],
  eyes: { at: [.055, 58], r: .0065, ring: '#d6c56a' },
  mouth: { t: .045, size: [.012, .007, .035], drop: -.003, color: '#4a2a2a' },
  lumps: [{ at: [.012, 30], size: [.003, .008, .003], color: '#3a3020', sharp: true, lift: .4 }],
  spots(random) {
    const list = [];
    for (let i = 0; i < 170; i++) { const t = .03 + random() * .95; list.push({ t, a: 5 + random() * 170, r: (.008 + random() * .01) * (t < .15 ? .7 : 1), color: random() < .6 ? '#2c2214' : '#3e3019', rough: .7, opacity: .9 }); }
    return list;
  },
  paint: c => {
    if (!body(c)) return finNoise(blend('#6a5a30', '#2c2214', ss(c.s, .65, 1) * .6), c, .12);
    let col = grade(c.h, [[-1, '#a3925a'], [-.2, '#8a7a44'], [1, '#6c5e33']]);
    col = blend(col, '#15110a', patch(c.p, c.w * .7, -.006, .13, .03, .02, .022, .4));              // the black gill patch
    if (c.t < .085) col = blend(col, '#2a1a12', band(c.h, -.06, .06, .03));                         // the mouth line
    return mottle(col, c, .12, 34);
  },
  rig: { root: .12, head: .06, spine: [.16, .25, .34, .43, .52, .61, .7, .79, .88, .95], jaw: { hinge: .085, line: 0 } },
  clips: k => eelClips(k, 2.4, 2)
};
const ribbonEel = {
  id: 'ribbon-eel', name: 'Ribbon eel', scientific: 'Rhinomuraena quaesita', real: 1.2, group: 'eel',
  note: 'A whip-thin electric-blue eel with a yellow fin and jaw, and leaf-shaped flaps flaring from its nostrils.',
  body: { K: 8, ex: .9, maxGap: .06, stations: [
    [0, 0, 0, 0, 0], [.01, .005, .004, .005], [.03, .009, .009, .011], [.06, .012, .014, .015], [.12, .012, .016, .016], [.4, .012, .016, .015], [.7, .01, .014, .013], [.9, .006, .009, .008], [1, 0, .002, .002]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.08], thick: .002, embed: .1, core: [.45, .012], outline: [[0, 0], [.03, .015], [.5, .02], [.78, .014], [.88, .006], [.92, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.4], thick: .002, embed: .1, core: [.28, .01], outline: [[0, 0], [.03, .012], [.5, .014], [.58, .004], [.6, 0]] }
  ],
  eyes: { at: [.03, 62], r: .0045, ring: '#f2d22e' },
  mouth: { t: .02, size: [.005, .003, .015], drop: -.002, color: '#3a2020' },
  lumps: [{ at: [.006, 25], size: [.006, .012, .002], color: '#f2d22e', sharp: true, lift: .7, turn: [0, 0, 30], keep: true }],
  paint: c => {
    if (!body(c)) return blend('#f2d22e', '#fbf5d0', ss(c.s, .7, .95));
    let col = mottle(grade(c.h, [[-1, '#3a86e2'], [1, '#2463c2']]), c, .05, 60);
    return blend(col, '#f2d22e', Math.max(1 - ss(c.t, .02, .035), (1 - ss(c.t, .04, .06)) * ss(-c.h, .1, .3)));    // the yellow snout and lower jaw
  },
  rig: { root: .1, head: .04, spine: [.12, .2, .28, .36, .44, .52, .6, .68, .76, .84, .92], jaw: { hinge: .035, line: -.001 } },
  clips: k => eelClips(k, 1.8, 2.3)
};
const gardenEel = {
  id: 'garden-eel', name: 'Spotted garden eel', scientific: 'Heteroconger hassi', real: .4, group: 'eel',
  note: 'A thread of a fish, white with black flecks, that stands half out of the sand to pick plankton from the current.',
  body: { K: 8, maxGap: .07, stations: [[0, 0, 0, 0, 0], [.012, .008, .008, .008], [.04, .014, .015, .015], [.1, .015, .016, .016], [.5, .014, .015, .015], [.85, .01, .011, .011], [1, 0, .002, .002]] },
  fins: [
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.09, 95, .3], span: [.8, 0, -.6], thick: .002, outline: [[0, 0], [.004, .012], [.012, .016], [.016, .006], [.014, 0]] },
    { name: 'dorsal', plane: 'side', root: [.2], thick: .002, embed: .1, core: [.38, .006], outline: [[0, 0], [.03, .008], [.7, .009], [.78, 0]] }
  ],
  eyes: { at: [.03, 70], r: .0075 },
  spots(random) {
    const list = [{ t: .1, a: 95, r: .022, color: '#121212' }, { t: .5, a: 90, r: .028, color: '#121212' }];
    for (let i = 0; i < 90; i++) list.push({ t: .02 + random() * .96, a: random() * 180, r: .004 + random() * .004, color: '#1c1c1c' });
    return list;
  },
  paint: c => body(c) ? mottle(grade(c.h, [[-1, '#f6f3ea'], [1, '#e7e2d2']]), c, .03, 40) : '#e9e4d6',
  rig: { root: .14, head: .06, spine: [.16, .26, .36, .46, .56, .66, .76, .86, .94] },
  clips: k => {
    const swim = k.swim({ name: 'swim', period: .9, amp: 2.2, mode: 'anguilliform', follow: .05, recoil: 1.3 });
    return [swim, k.turn(swim, 1, { curve: 1.1 }), k.turn(swim, -1, { curve: 1.1 }),
      // Standing in its burrow: the body sways like a stalk in the current and the head darts at passing plankton.
      k.swim({ name: 'sway', period: 4, amp: .7, mode: 'anguilliform', follow: 0, recoil: 0, roll: 0, heave: 0, pose: { head: [{ axis: Y, amp: .2, freq: 3, skew: .7 }, { axis: X, amp: .1, freq: 2 }] } }),
      // Ducking back into the sand: the whole body snapping into a tight curve.
      k.act({ name: 'retreat', duration: .9, mode: 'anguilliform', bones: { spine: [{ axis: X, amp: 0, bias: 1.8, travel: 0, env: [[0, 0], [.35, 1], [1, 1]] }, { axis: Y, amp: .4, freq: 3, env: [[0, 0], [.2, 1], [.6, 0], [1, 0]] }] } })];
  }
};

// --- Small reef fish ----------------------------------------------------------------------------------------------
// One pattern cut to each species' proportions: D the deepest half-height, W the widest half-width.
function reefFish({ id, name, scientific, real, note, D, W, K = 8, snout = 0, tail = 'fork', dorsal = .5, dorsalFrom = .24, anal = .45, paint, eye = [.1, 62, .017], period = .32, amp = .6, swimShader, extraFins = [], pectoral = .25, extra }) {
  const stations = [[0, 0, 0, 0, -snout * .4], [.04, W * .3, D * .26, D * .3, -snout * .3], [.13, W * .78, D * .72, D * .72], [.3, W, D, D], [.46, W * .95, D * .95, D * .92], [.6, W * .7, D * .68, D * .64], [.72, W * .4, D * .36, D * .34], [.8, W * .24, Math.min(D * .2, .03), Math.min(D * .2, .03)]];
  const high = D * dorsal, low = D * anal, t0 = dorsalFrom, tails = {
    fork: () => { const f = fork(.19, Math.max(.12, D * .78), { root: .018, fork: .6 }); return [{ outline: f.upper, core: [.085, D * .3] }, { outline: f.lower, core: [.085, -D * .3] }]; },
    lyre: () => { const f = fork(.24, Math.max(.13, D * .9), { root: .018, fork: .72, sweep: .7 }); return [{ outline: f.upper, core: [.1, D * .34] }, { outline: f.lower, core: [.1, -D * .34] }]; },
    round: () => [{ outline: [[0, -.03], [0, .03], [.07, D * .5], [.16, D * .52], [.2, D * .3], [.21, 0], [.2, -D * .3], [.16, -D * .52], [.07, -D * .5]], core: [.1, 0] }]
  };
  return {
    id, name, scientific, real, note, group: 'small', school: true,
    body: { K, lodK: 6, maxGap: .2, stations },
    fins: [
      { name: 'dorsal', plane: 'side', root: [t0], thick: .004, embed: .3, core: [(.72 - t0) * .5, high * .35], outline: [[0, 0], [.03, high * .8], [(.72 - t0) * .55, high], [(.72 - t0) * .9, high * .6], [.74 - t0, 0]] },
      { name: 'anal', plane: 'side', down: true, root: [.5], thick: .004, embed: .3, outline: [[0, 0], [.03, low * .9], [.14, low], [.22, low * .5], [.24, 0]] },
      { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.24, 100, .25], span: [.6, -.25, -.76], chord: [0, -.8, -.5], thick: .003, hinge: .05, stiff: .4, outline: [[0, 0], [0, .06], [.03, .12], [.06, .09], [.055, 0]] },
      { name: 'pelvic', mirror: true, root: [.3, 165, .3], span: [.25, -.85, -.45], thick: .003, outline: [[0, 0], [.01, .06], [.04, .07], [.045, 0]] },
      ...tails[tail]().map(part => ({ name: 'caudal', plane: 'side', root: [.79, 0], thick: .004, ...part })),
      ...extraFins
    ],
    eyes: { at: [eye[0], eye[1]], r: eye[2], ring: eye[3] },
    paint: c => body(c) ? mottle(paint(c), c, .035, 26) : finNoise(paint(c), c, .04), rig: { root: .36, head: .17, spine: [.5, .62, .72, .79] },
    swimShader: swimShader || { amp: .09, waves: .75, power: 2 },
    clips: k => swimmerClips(k,
      { name: 'swim', period, amp, mode: 'carangiform', follow: .1, pectoral },
      { name: 'fast', period: period * .5, amp: amp * 1.35, mode: 'carangiform', follow: .1, pectoral: pectoral * .4 },
      // Hovering: the body barely moving while the pectorals row, and a small bob.
      { name: 'idle', period: period * 2.2, amp: amp * .3, mode: 'carangiform', pectoral: pectoral * 1.8, pectoralMode: 'row', roll: .03, heave: .01 },
      { burst: { name: 'dart', duration: .45 }, turn: { curve: .8, bank: .2 }, extra: extra ? extra(k) : [] })
  };
}

const smallFish = [
  reefFish({ id: 'anthias', name: 'Sea goldie', scientific: 'Pseudanthias squamipinnis', real: .1, D: .15, W: .06, tail: 'lyre', dorsal: .55, note: 'Orange clouds over every coral head; they drop into the branches when a shadow passes.',
    paint: c => {
      if (!body(c)) return c.name === 'caudal' ? blend('#f2a03c', '#c8457a', ss(c.s, .8, 1)) : blend('#e9713a', '#d4508a', ss(c.s, .75, 1) * .7);
      // A violet streak from the eye down to the pectoral.
      const streak = band(c.h - (.25 - (c.t - .08) * 2.4), -.06, .06, .03) * band(c.t, .08, .28, .02);
      return blend(grade(c.h, [[-1, '#f8be74'], [0, '#f59a45'], [1, '#ee7f38']]), '#b45ad0', streak * .8);
    } }),
  reefFish({ id: 'chromis', name: 'Blue-green chromis', scientific: 'Chromis viridis', real: .08, D: .2, W: .07, note: 'Pale sea-glass fish that hang above branching coral in a loose shimmer.',
    paint: c => body(c) ? grade(c.h, [[-1, '#d2f2e6'], [0, '#93dccb'], [1, '#62c0bd']]) : blend('#7fd0c4', '#c9efe6', ss(c.s, .7, 1)) }),
  reefFish({ id: 'fusilier', name: 'Yellow-and-blueback fusilier', scientific: 'Caesio teres', real: .3, D: .13, W: .065, period: .36, note: 'Streamlined blue fish with a yellow back and tail, pouring along the reef edge in ribbons.',
    paint: c => {
      if (!body(c)) return c.name === 'caudal' || c.name === 'dorsal' ? '#f1cb34' : '#dfe7ec';
      const yellow = Math.max(ss(c.t, .7, .78), ss(c.h, .05, .25) * ss(c.t, .38, .5));
      return blend(grade(c.h, [[-1, '#e9eef2'], [-.35, '#a7cdec'], [.15, '#4b9cdf'], [1, '#2c7bc6']]), '#f3cf38', yellow);
    } }),
  reefFish({ id: 'sergeant-major', name: 'Indo-Pacific sergeant', scientific: 'Abudefduf vaigiensis', real: .15, D: .27, W: .075, note: 'Five black bars on silver, with a wash of yellow along the back.',
    paint: c => {
      if (!body(c)) return c.name === 'caudal' ? '#8f9aa0' : '#3c444a';
      let col = grade(c.h, [[-1, '#f1f4f1'], [.2, '#dde7e8'], [.6, '#e0d667'], [1, '#e2cc45']]);
      const bars = Math.max(...[.23, .36, .49, .62, .755].map(t => band(c.t, t - .03, t + .03 + (t > .7 ? .01 : 0), .008)));
      return blend(col, '#1c2227', bars);
    } }),
  reefFish({ id: 'butterflyfish', name: 'Threadfin butterflyfish', scientific: 'Chaetodon auriga', real: .16, D: .31, W: .055, snout: .06, tail: 'round', dorsal: .42, dorsalFrom: .2, anal: .4, eye: [.115, 66, .016], period: .4, amp: .5,
    note: 'A white disc crossed with fine chevrons, yellow behind, a black bar through the eye and a dark spot on the dorsal fin.',
    paint: c => {
      if (!body(c)) {
        if (c.name === 'pectoral') return '#e9e6d6';
        if (c.name === 'dorsal') return blend('#f3c22e', '#14181c', 1 - ss(Math.hypot(c.u - .82, (c.s - .55) * .6), .07, .1));   // the eyespot
        return '#f3c22e';
      }
      const yellow = Math.max(ss(c.t, .5, .6), ss(c.h, .35, .6) * ss(c.t, .33, .45));
      let col = blend(grade(c.h, [[-1, '#e9e6da'], [0, '#f4f1e6'], [1, '#f2efe4']]), '#f5c730', yellow);
      col = blend(col, '#8c8c86', ss(1 - Math.abs((c.t * 9 + c.h * 1.4) % 1 - .5) * 2, .84, .93) * (1 - yellow) * band(c.t, .17, .55, .02) * .6);   // chevrons
      return blend(col, '#15191d', band(c.t, .088, .148, .006) * ss(c.h, -.85, -.6));               // the eye bar
    } }),
  reefFish({ id: 'moorish-idol', name: 'Moorish idol', scientific: 'Zanclus cornutus', real: .2, D: .36, W: .05, snout: .08, tail: 'round', dorsal: .3, dorsalFrom: .3, anal: .5, eye: [.13, 58, .014], period: .42, amp: .46,
    note: 'Black, white and yellow bands under a dorsal streamer longer than the fish.',
    extraFins: [{ name: 'streamer', plane: 'side', root: [.3], thick: .003, embed: .2, core: [.12, .24], outline: [[0, 0], [.05, .2], [.2, .5], [.5, .78], [.36, .5], [.2, .22], [.14, 0]] }],
    paint: c => {
      if (!body(c)) return c.name === 'streamer' ? '#f3f1e7' : c.name === 'caudal' ? blend('#15191d', '#eef0ea', ss(c.s, .8, .9)) : c.name === 'pectoral' ? '#d9d6c8' : '#1b1f24';
      let col = blend(blend('#f6f4ea', '#f3e7a8', ss(-c.h, 0, .5)), '#f1d24a', ss(c.t, .66, .72));
      if (c.t < .12) col = blend(col, '#eda03a', ss(c.h, -.1, .2) * (1 - ss(c.t, .09, .12)));     // the orange saddle on the snout
      return blend(col, '#15191d', Math.max(band(c.t, .11, .29, .008), band(c.t, .5, .68, .008)));
    } }),
  reefFish({ id: 'powder-blue-tang', name: 'Powder blue tang', scientific: 'Acanthurus leucosternon', real: .2, D: .29, W: .055, snout: .03, dorsal: .34, dorsalFrom: .16, anal: .34, eye: [.1, 56, .014], period: .38,
    note: 'Powder-blue flanks, a black mask, a white throat and a yellow dorsal fin.',
    paint: c => {
      if (!body(c)) return c.name === 'dorsal' ? blend('#f5cf2e', '#e8f0f2', ss(c.s, .85, 1)) : c.name === 'caudal' ? blend('#eef1ef', '#1b2026', ss(c.s, .8, .9)) : c.name === 'pectoral' ? '#e9d57a' : '#eef1ef';
      let col = grade(c.h, [[-1, '#86c6f0'], [0, '#55abe6'], [1, '#3a92d6']]);
      col = blend(col, '#f4cd2f', ss(c.t, .7, .74));                                                // the yellow tail stock
      const mask = 1 - ss(c.t, .14, .17), throat = ss(-c.h, .45, .65) * (1 - ss(c.t, .2, .26));
      return blend(blend(col, '#171c22', mask), '#f3f4f0', throat);
    } }),
  reefFish({ id: 'emperor-angelfish', name: 'Emperor angelfish', scientific: 'Pomacanthus imperator', real: .35, D: .3, W: .06, K: 16, snout: .02, tail: 'round', dorsal: .3, dorsalFrom: .2, anal: .36, eye: [.105, 60, .012], period: .5, amp: .42,
    note: 'Yellow and royal-blue pinstripes running nose to tail behind a black mask edged in light blue.',
    paint: c => {
      if (!body(c)) return c.name === 'caudal' ? '#f2b030' : c.name === 'anal' || c.name === 'pelvic' ? blend('#243f8f', '#8fd0f0', band(Math.sin(c.u * 30), .6, 1.1, .2)) : c.name === 'pectoral' ? '#2a3140' : blend('#f1c535', '#8fd0f0', ss(c.s, .75, .9));
      const stripes = ss(Math.sin((c.h * 4.4 + c.t * 3) * Math.PI * 2), -.25, .25);
      let col = blend('#2a57b0', '#f0c934', stripes);
      col = blend(col, '#6fc0ea', band(c.t, .175, .24, .008) * ss(c.h, -.25, -.1));               // the light-blue edge to the mask
      col = blend(col, '#141a24', Math.max(band(c.t, .11, .18, .008), band(c.t, .175, .26, .008) * ss(-c.h, .1, .25)));
      return blend(col, c.h > .3 ? '#d7e3ea' : '#eef1ee', 1 - ss(c.t, .1, .12));
    } }),
  reefFish({ id: 'cleaner-wrasse', name: 'Bluestreak cleaner wrasse', scientific: 'Labroides dimidiatus', real: .1, D: .1, W: .05, tail: 'round', dorsal: .5, dorsalFrom: .22, eye: [.09, 66, .02], period: .3, amp: .7,
    note: 'A finger of blue with a black stripe that widens to the tail; it dances to advertise its trade.',
    extra: k => [k.swim({ name: 'dance', period: .5, amp: .9, mode: 'anguilliform', follow: 0, roll: .1, heave: .03, pose: { root: { axis: X, amp: .25, freq: 1 } } })],
    paint: c => {
      if (!body(c)) return c.name === 'caudal' ? blend('#4aa6ea', '#14181d', 1 - ss(Math.abs(c.u - .5), .2, .3)) : '#5db2ee';
      const width = .14 + .5 * ss(c.t, .3, .85);
      return blend(blend('#eef0e2', '#4aa6ea', ss(c.t, .25, .55)), '#14181d', 1 - ss(Math.abs(c.h), width - .06, width + .06));
    } })
];

/** Every species in the set, largest first, sized for the site (see siteLength). */
export const SPECIES = [rightWhale, whaleShark, orca(false), orca(true), whipray, dolphin, nurse, blacktip, tuna, barracuda, bumphead, trevally, bluespot, remora, flyingFish, moray, ribbonEel, gardenEel, ...smallFish]
  .map(spec => ({ ...spec, realLength: spec.real, length: siteLength(spec.real), ...(spec.span ? { span: Math.round(spec.span * siteLength(spec.real) / spec.real * 100) / 100, realSpan: spec.span } : {}) }))
  .sort((a, b) => b.length - a.length);
export const speciesById = id => SPECIES.find(species => species.id === id);

const shapes = new Map();
/**
 * A species' mesh alone, at a level of detail, optionally frozen in one of its poses, without painting its skin:
 * its texture coordinates match the exported GLB's skin, so a page can pair the two. Skin weights are kept as floats.
 */
export function creatureGeometry(id, { lod = 1, pose = null } = {}) {
  const key = `${id}|${lod}|${pose}`;
  if (!shapes.has(key)) {
    const spec = speciesById(id); if (!spec) throw new Error(`No such creature: ${id}`);
    const template = buildCreature(spec, { lod, paint: false });
    const geometry = pose ? posedGeometry(template, spec.poses[pose]) : template.geometry, skin = geometry.getAttribute('skinIndex');
    if (skin) geometry.setAttribute('skinIndex', new Float32BufferAttribute(Float32Array.from(skin.array), 4));
    shapes.set(key, geometry);
  }
  return shapes.get(key);
}
const built = new Map();
/** The template for a species (see buildCreature); built once per level of detail and shared. */
export function creature(id, { lod = 0 } = {}) {
  const key = `${id}|${lod}`;
  if (!built.has(key)) { const spec = speciesById(id); if (!spec) throw new Error(`No such creature: ${id}`); built.set(key, buildCreature(spec, { lod })); }
  return built.get(key);
}
