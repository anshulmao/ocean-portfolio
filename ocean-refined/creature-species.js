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
  note: 'A bulb of a forehead over a pale, fused beak; it rows with its pectoral fins, bites at the reef and rams it.',
  // A rounded bulb of a forehead that rises steeply from the beak and rolls back over the eye into a deep, heavy body;
  // the beak is the front of the head itself, pale and fused, not a ball stuck on (it used to be a flat wall of a face
  // with a white sphere at its foot).
  body: { K: 12, ex: .9, maxGap: .06, stations: [
    [0, .012, .016, .018, -.06], [.012, .03, .036, .036, -.058], [.028, .05, .07, .05, -.046], [.05, .066, .128, .07, -.03], [.075, .078, .178, .09, -.012],
    [.1, .086, .206, .11, 0], [.135, .091, .216, .135, .006], [.18, .094, .208, .16, .004], [.26, .096, .198, .176, 0], [.36, .092, .19, .178, 0], [.48, .082, .174, .162, 0],
    [.6, .062, .134, .126, 0], [.7, .042, .09, .086, 0], [.78, .027, .058, .054, 0], [.83, .02, .048, .045, 0]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.2], thick: .004, embed: .3, core: [.26, .02], outline: [[0, 0], [.02, .04], [.2, .052], [.42, .046], [.5, .03], [.52, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.52], thick: .004, embed: .3, outline: [[0, 0], [.02, .04], [.14, .042], [.2, .022], [.21, 0]] },
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.25, 100, .2], span: [.3, -.45, -.84], chord: [0, .85, -.5], thick: .004, hinge: .04, stiff: .3,
      outline: [[0, 0], [-.01, .06], [.01, .12], [.045, .142], [.078, .1], [.072, 0]] },
    { name: 'pelvic', mirror: true, root: [.3, 162, .3], span: [.3, -.85, -.42], thick: .003, outline: [[0, 0], [.012, .06], [.04, .075], [.05, 0]] },
    { name: 'caudal', plane: 'side', root: [.815, 0], thick: .005, core: [.085, 0],
      outline: [[0, -.05], [0, .05], [.06, .1], [.15, .136], [.184, .13], [.155, .06], [.165, 0], [.155, -.06], [.184, -.13], [.15, -.136], [.06, -.1]] }
  ],
  eyes: { at: [.115, 72], r: .012, ring: '#cfe3d6' },
  mouth: { t: .012, size: [.02, .006, .016], drop: -.012, color: '#33302a' },
  paint: c => {
    if (!body(c)) return finNoise(blend(c.name === 'pectoral' ? '#4a9c94' : '#2d7c80', '#7cc0ae', ss(c.s, .7, 1) * .6), c);
    if (c.cap) return '#d2d1bb';
    let col = grade(c.h, [[-1, '#86b6a2'], [-.3, '#4f8c82'], [.4, '#356f6d'], [1, '#2a5b5f']]);
    // Big scales, each a little lighter at its edge, give the flank its texture.
    col = shadeBy(col, 1 + .08 * (ss(Math.abs(Math.sin(c.t * 70)) * Math.abs(Math.sin(c.a * 9)), .55, .9) - .5));
    // The bulb is scuffed pale pink-green from ramming the reef, fading into the flank behind the eye; the beak is ivory.
    const bulb = (1 - ss(c.t, .07, .14)) * ss(c.h, .15, .55), beak = 1 - ss(c.t, .012, .026);
    col = blend(col, '#a7aa94', bulb * .55);
    return mottle(blend(col, '#d9d8c2', beak * .85), c, .07, 18);
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

// --- Reef residents with limbs, a shell or spines, and two more sharks ---------------------------------------------
// The animals the reef used to draw in code (living-world.js, underwater-life.js), remade here so they are models like
// the rest of the set and count in the dive log. Those that live on the bottom keep the size the reef gave them (site:
// a length in metres, not siteLength): they are judged against the sand and the coral round them, not the schooling fish.

// A clip for an animal that moves by its limbs. each(limb, j) returns the turns for the j-th bone of a limb (from its
// root), written with the limb's own axes: limb.lift raises it, limb.swing sweeps it round, limb.side is 1 on the left.
function limbClip(k, { name, duration, loop = true, each = () => [], bones = {}, root, filter = () => true }) {
  const out = {}; for (const [bone, parts] of Object.entries(bones)) out[bone] = [...parts];
  k.limbs.forEach((limb, index) => { if (filter(limb)) limb.bones.forEach((bone, j) => { const parts = each(limb, j, index); if (parts?.length) out[bone] = [...(out[bone] || []), ...parts]; }); });
  return k.act({ name, duration, loop, bones: out, root });
}
const DEGREES = Math.PI / 180;
// Radial limbs (a sea star's or an octopus's arms): one limb a direction, round from +Z.
const radial = (count, offset, make) => Array.from({ length: count }, (_, k) => { const a = (k + offset) / count * Math.PI * 2; return make(Math.sin(a), Math.cos(a), k, a); });

const greenTurtle = {
  id: 'green-turtle', name: 'Green sea turtle', scientific: 'Chelonia mydas', real: 1, group: 'turtle',
  note: 'A domed olive shell of fused plates streaked with amber, a small rounded head, long paddle forelimbs and short rear flippers.',
  body: { K: 12, ex: .9, maxGap: .07, stations: [
    [0, 0, 0, 0, .004], [.02, .032, .028, .022, .004], [.06, .052, .05, .036, .004], [.12, .056, .05, .038, .002], [.17, .045, .042, .036],
    [.22, .17, .09, .05], [.3, .27, .145, .055], [.45, .315, .165, .06], [.6, .3, .155, .058], [.74, .24, .12, .05], [.85, .14, .07, .035], [.92, .05, .03, .02], [.965, 0, .004, .004]] },
  fins: [
    // The forelimbs are the engine: long, curved paddles, held a little below the shell's rim.
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.25, 100, .3], span: [1, -.12, .08], chord: [0, 0, -1], thick: .016, hinge: .04, stiff: .3,
      outline: [[0, 0], [-.012, .07], [-.006, .19], [.03, .32], [.085, .43], [.12, .42], [.115, .3], [.1, .16], [.085, .05], [.075, 0]] },
    { name: 'pelvic', mirror: true, bone: 'pelvic', root: [.8, 112, .3], span: [.7, -.18, -.68], chord: [0, 0, -1], thick: .009, hinge: .04, stiff: .3,
      outline: [[0, 0], [-.004, .06], [.03, .12], [.08, .135], [.1, .08], [.085, 0]] }
  ],
  eyes: { at: [.055, 62], r: .0105, ring: '#3a3a26' },
  paint: c => {
    const skin = '#7a7652', pale = '#e6dcb5';
    if (!body(c)) {
      // Large scales on the flippers, outlined in pale skin, a pale trailing edge.
      const scale = ss(Math.abs(Math.sin(c.u * 26) * Math.sin(c.s * 18)), .82, .95);
      return blend(blend(c.up < 0 ? '#c9bf98' : skin, pale, scale * .5), pale, ss(c.u, .82, 1) * .45);
    }
    if (c.cap) return '#5d5940';
    const shell = ss(c.t, .2, .24) * (1 - ss(c.t, .89, .93)), plastron = ss(-c.h, .35, .55);
    if (shell < .5) {
      // Head and tail: scaled skin, the large plates on top of the head picked out in pale lines.
      const plates = ss(Math.abs(Math.sin(c.t * 120) * Math.sin(c.a * 5)), .75, .9);
      return mottle(blend(blend(grade(c.h, [[-1, '#e7dfbc'], [-.2, '#b7ae84'], [.3, skin], [1, '#66623f']]), pale, plates * .45 * ss(c.h, -.2, .2)), '#e9e1c2', ss(-c.h, .2, .6) * .7), c, .06, 30);
    }
    if (plastron > .5) return mottle(blend('#e9e1bd', '#d8c993', ss(Math.abs(Math.sin(c.p.z * 40)), .9, 1) * .6), c, .04, 30);
    // The carapace: a row of plates down the spine, four either side, and a rim of small ones; each plate streaked
    // amber from its centre, its seams dark.
    const x = Math.abs(c.p.x), z = c.p.z, rim = 1 - ss(c.h, .12, .3);
    const off = x > .075 ? .5 : 0, zz = (z + 1) / .15 + off, dz = Math.abs(zz - Math.round(zz)) * .15, lineX = Math.min(Math.abs(x - .075), Math.abs(x - .2));
    const seam = (1 - ss(Math.min(lineX, dz), .004, .011)) * (1 - rim) + (1 - ss(Math.abs(c.h - .21), .01, .025));
    const streak = ss(noise(Math.atan2(zz - Math.round(zz), (x - (x > .2 ? .26 : x > .075 ? .14 : 0)) * 6) * 2.2 + x * 9, Math.round(zz) * 3.1 + (x > .075 ? 5 : 0)) * 1.25, .55, .9);
    let col = blend('#5b4e2f', '#a07a3c', streak * .75);
    col = blend(col, '#7d6a3e', rim);
    return mottle(blend(col, '#2d2716', Math.min(1, seam) * .8), c, .07, 26);
  },
  rig: { root: .45, head: .13, spine: [.9, .95] },
  // A turtle rows with its forelimbs: down and back in a power stroke that twists the paddle, then a slow recovery.
  clips: k => {
    const stroke = (amp, period, name, extra = {}) => k.swim({ name, period, amp: .02, mode: 'carangiform', recoil: 0, roll: .008, heave: .008, pose: {
      pectoral_L: [{ axis: Z, amp, phase: 0, skew: .5, bias: amp * .35 }, { axis: X, amp: amp * .45, phase: .25 }, { axis: Y, amp: amp * .35, phase: .1, bias: .1 }],
      pectoral_R: [{ axis: Z, amp: -amp, phase: 0, skew: .5, bias: -amp * .35 }, { axis: X, amp: amp * .45, phase: .25 }, { axis: Y, amp: -amp * .35, phase: .1, bias: -.1 }],
      pelvic_L: [{ axis: Y, amp: .18, phase: .35 }, { axis: Z, amp: .1, phase: .5 }], pelvic_R: [{ axis: Y, amp: -.18, phase: .35 }, { axis: Z, amp: -.1, phase: .5 }],
      head: [{ axis: X, amp: .035, phase: .4 }], ...extra } });
    const swim = stroke(.55, 3.4, 'swim');
    return [swim, stroke(.62, 1.8, 'fast'),
      // Gliding between strokes: forelimbs swept back along the shell, a slow paddle of the rear flippers.
      k.swim({ name: 'idle', period: 6, amp: .01, mode: 'carangiform', recoil: 0, roll: .006, heave: .006, pose: {
        pectoral_L: [{ axis: Y, bias: .75 }, { axis: Z, amp: .06, bias: -.08 }], pectoral_R: [{ axis: Y, bias: -.75 }, { axis: Z, amp: -.06, bias: .08 }],
        pelvic_L: [{ axis: Y, amp: .12 }], pelvic_R: [{ axis: Y, amp: -.12 }], head: [{ axis: Y, amp: .08, phase: .2 }] } }),
      k.turn(swim, 1, { curve: .15, bank: .22 }), k.turn(swim, -1, { curve: .15, bank: .22 }),
      // Resting on the sand: limbs out flat, the head lifting now and then to look round.
      k.swim({ name: 'rest', period: 7, amp: 0, mode: 'carangiform', recoil: 0, roll: 0, heave: .002, pose: {
        pectoral_L: [{ axis: Z, bias: -.2 }, { axis: Y, bias: .25 }], pectoral_R: [{ axis: Z, bias: .2 }, { axis: Y, bias: -.25 }], head: [{ axis: X, amp: .08, bias: -.04, skew: .6 }, { axis: Y, amp: .12, freq: 1 }] } })];
  }
};

const puffer = {
  id: 'white-spotted-puffer', name: 'White-spotted puffer', scientific: 'Arothron hispidus', real: .4, site: 1.3, group: 'fish',
  note: 'A round grey-brown fish freckled with white, a white belly, dark rings round the base of its pectorals, and a beak of fused teeth.',
  body: { K: 12, maxGap: .08, stations: [
    [0, 0, 0, 0, -.012], [.02, .07, .05, .06, -.012], [.06, .13, .12, .12, -.006], [.15, .19, .2, .2], [.3, .22, .24, .24], [.45, .21, .22, .22], [.6, .16, .16, .15], [.71, .09, .09, .085], [.785, .045, .045, .045]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.6], thick: .005, embed: .3, outline: [[0, 0], [.015, .07], [.05, .11], [.09, .07], [.11, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.61], thick: .005, embed: .3, outline: [[0, 0], [.015, .065], [.05, .1], [.09, .06], [.1, 0]] },
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.28, 92, .2], span: [.8, .15, -.58], chord: [0, -.9, -.4], thick: .004, hinge: .05, stiff: .4, outline: [[0, 0], [0, .06], [.035, .1], [.075, .085], [.08, 0]] },
    { name: 'caudal', plane: 'side', root: [.77, 0], thick: .006, core: [.09, 0], outline: [[0, -.03], [0, .03], [.06, .09], [.15, .105], [.2, .05], [.21, 0], [.2, -.05], [.15, -.105], [.06, -.09]] }
  ],
  eyes: { at: [.13, 58], r: .03, ring: '#e4ddc4' },
  lumps: [{ at: [.006, 90], size: [.022, .012, .016], color: '#efe6cc', keep: true }],
  spots(random) {
    const list = [];
    for (let i = 0; i < 190; i++) list.push({ t: .04 + random() * .74, a: random() * 150, r: .011 + random() * .006, color: '#f4f1e6' });
    return list;
  },
  paint: c => {
    if (!body(c)) return finNoise(blend('#8c8676', '#d9d3c0', ss(c.s, .7, 1) * .4), c, .06);
    if (c.cap) return '#6f6a5b';
    let col = grade(c.h, [[-1, '#f3f0e6'], [-.42, '#efebe0'], [-.22, '#9d9884'], [.3, '#7c7764'], [1, '#68634f']]);
    // Dark rings round the pectoral's base, and round the eye.
    const ring = Math.hypot((c.t - .28) * 4.2, (c.h - .02) * .9), eye = Math.hypot((c.t - .13) * 4.2, (c.h - .5) * .9);
    col = blend(col, '#2a2822', Math.max(band(Math.sin(ring * 34), .55, 1.1, .2) * (1 - ss(ring, .2, .26)), band(eye, .13, .16, .01) * .7) * ss(c.h, -.35, -.15));
    return mottle(col, c, .07, 22);
  },
  rig: { root: .36, head: .14, spine: [.56, .68, .76] },
  swimShader: { amp: .05, waves: .6, power: 2.4 },
  clips: k => swimmerClips(k,
    // Puffers scull with their dorsal and anal fins and row with the pectorals; the tail is a rudder until they hurry.
    { name: 'swim', period: .9, amp: .22, mode: 'thunniform', follow: .05, pectoral: .45, pectoralMode: 'row', roll: .02, heave: .01 },
    { name: 'fast', period: .45, amp: .65, mode: 'carangiform', follow: .1, pectoral: .3 },
    { name: 'idle', period: 1.7, amp: .06, mode: 'thunniform', pectoral: .5, pectoralMode: 'row', roll: .03, heave: .012 },
    { burst: { duration: .7, power: .7 }, turn: { curve: .45, bank: .1 }, extra: [
      // Blown up, it can only scull: fins working fast, the body turning slowly. The swelling itself is the scene's (scale).
      k.swim({ name: 'puff', period: .5, amp: .02, mode: 'thunniform', pectoral: .6, pectoralMode: 'row', roll: .05, heave: .006 })] })
};

// Arms that taper to points, gathered into a cone ahead of the head: a cuttlefish's (eight; the two tentacles stay hidden).
const cuttleArms = radial(8, .5, (sx, cy, k) => {
  const x = sx * .052, y = cy * .046 - .006;
  return { name: `arm${k + 1}`, slot: 'arm', parent: 'head', K: 5, r: [.024, .019, .012, .0035], path: [[x * .9, y * .9, .49], [x * .8, y * .75 - .004, .56], [x * .48, y * .45 - .01, .64], [x * .2, y * .18 - .014, .71]] };
});
const cuttlefish = {
  id: 'broadclub-cuttlefish', name: 'Broadclub cuttlefish', scientific: 'Sepia latimanus', real: .5, group: 'cephalopod',
  note: 'An oval mantle fringed by a rippling fin, big W-pupilled eyes and a cone of arms; it flickers brown, cream and white as it watches.',
  body: { K: 12, maxGap: .07, stations: [
    [0, .062, .055, .052], [.04, .095, .08, .075], [.12, .118, .088, .08], [.2, .1, .078, .072], [.26, .145, .1, .09], [.45, .168, .114, .1], [.65, .155, .105, .094], [.82, .112, .08, .072], [.94, .05, .04, .036], [1, 0, .004, .004]] },
  fins: [1, 2, 3].map(k => ({ name: `skirt${k}`, mirror: true, bone: `skirt${k}`, root: [[.25, .48, .71][k - 1], 92, .12], span: [1, -.06, 0], chord: [0, 0, -1], thick: .003, hinge: .02, stiff: .35,
    outline: k < 3 ? [[0, 0], [.006, .045], [.06, .06], [.17, .06], [.226, .045], [.232, 0]] : [[0, 0], [.006, .045], [.08, .05], [.18, .03], [.25, 0]] })),
  limbs: cuttleArms,
  eyes: { at: [.105, 74], r: .024, ring: '#d9c58e', out: .006 },
  spots(random) {
    const list = [];
    for (let i = 0; i < 36; i++) list.push({ t: .25 + random() * .65, a: random() * 80, r: .012 + random() * .012, color: '#efe6d2', rough: .6, opacity: .85 });
    return list;
  },
  paint: c => {
    if (c.part === 'limb') return blend(blend('#8f6a4b', '#e6d6b8', band(Math.sin(c.u * 22), .3, 1.1, .3) * .6), '#f0e4cc', ss(-c.h, .2, .7));
    if (!body(c)) return finNoise(blend('#d7c6a3', '#f4ecd8', ss(c.s, .6, 1)), c, .06);
    if (c.cap) return '#6e5038';
    // Mottled zebra bands across the back, fading to a pale belly; the head darker round the eyes.
    const bands = ss(Math.sin((c.t * 15 + noise(c.t * 9, c.a * 3) * 1.6) * Math.PI), -.2, .6) * ss(c.h, .05, .4);
    let col = grade(c.h, [[-1, '#f1e7d2'], [-.3, '#e5d4b4'], [0, '#a98663'], [1, '#7d5a3e']]);
    col = blend(col, '#5a3d29', bands * .55);
    return mottle(col, c, .1, 18);
  },
  rig: { root: .42, head: .14, spine: [.62, .82] },
  clips: k => {
    // The fin round the mantle ripples in a wave from front to back (left and right in step), the arms curl a little.
    const fin = (period, amp, back = 1) => Object.fromEntries([1, 2, 3].flatMap(n => ['L', 'R'].map(s => [`skirt${n}_${s}`, [{ axis: Z, amp: amp * (s === 'L' ? 1 : -1), phase: n * .27 * back }]])));
    const arms = (amp, period) => limbClip(k, { name: '', duration: period, each: (limb, j, i) => [{ axis: limb.lift, amp: amp * (j + 1) * .5, phase: i * .08 + j * .14 }] }).bones;
    const clip = (name, duration, finAmp, armAmp, extra = {}, back = 1) => k.act({ name, duration, loop: true, bones: { ...arms(armAmp), ...fin(duration, finAmp, back), ...extra }, root: { y: [.004, .2], z: [.002 * back, .1, 2] } });
    return [clip('swim', 1.1, .42, .05), clip('hover', 1.6, .3, .07, { head: [{ axis: X, amp: .03, phase: .3 }] }), clip('fast', .55, .55, .02),
      // Backing away from something too close: the wave runs tail to head.
      clip('back', .8, .5, .03, {}, -1),
      // A warning: the first pair of arms raised high and the rest splayed, held, then lowered.
      // Hunting: it creeps up, then the arms flare open as it lunges and snaps shut on the prey.
      k.act({ name: 'strike', duration: 1.1, bones: { ...limbClip(k, { name: '', duration: 1.1, each: (limb, j) => [{ axis: limb.lift, amp: 0, bias: j ? .2 : .45, env: [[0, 0], [.25, .1], [.4, 1], [.62, -.2], [1, 0]] }] }).bones, ...fin(.3, .5) },
        root: { z: { bias: .06, env: [[0, 0], [.25, -.3], [.42, 1], [.7, .3], [1, 0]] } } }),
      k.act({ name: 'flash', duration: 2.4, bones: { ...limbClip(k, { name: '', duration: 2.4, each: (limb, j, i) => [{ axis: limb.lift, amp: 0, bias: (i === 3 || i === 4 ? .5 : -.15) * (j ? .6 : 1), env: [[0, 0], [.2, 1], [.75, 1], [1, 0]] }] }).bones, ...fin(.6, .4) } })];
  }
};

// An octopus is drawn crawling: mantle raised behind its eyes and leading (+Z, the way it jets), arms sprawled round it.
const octopusArms = radial(8, .5, (sx, cz, k) => {
  const reach = .44 + .07 * Math.sin(k * 2.1), curl = .3 + .15 * Math.sin(k * 1.3), points = [];
  for (let i = 0; i <= 4; i++) { const s = i / 4, a = Math.atan2(sx, cz) + curl * s * s, r = .04 + reach * s; points.push([Math.sin(a) * r, .035 + .03 * Math.sin(Math.PI * s) - .08 * s ** 1.6, -.14 + Math.cos(a) * r]); }
  return { name: `arm${k + 1}`, slot: 'arm', parent: 'root', K: 6, wide: 1.1, flat: .8, r: [.05, .04, .028, .015, .003], path: points };
});
const octopus = {
  id: 'day-octopus', name: 'Day octopus', scientific: 'Octopus cyanea', real: 1, site: 1.3, group: 'cephalopod',
  note: 'A baggy mantle above two turret eyes and eight arms lined with pale suckers; its skin takes the colour and texture of the rock it sits on.',
  body: { K: 10, maxGap: .05, stations: [
    [.25, 0, 0, 0, .13], [.27, .07, .065, .055, .13], [.32, .115, .11, .09, .125], [.39, .12, .115, .092, .11], [.45, .095, .09, .072, .095],
    [.5, .078, .07, .06, .08], [.545, .085, .078, .062, .07], [.6, .075, .052, .06, .055], [.64, .05, .032, .042, .045]] },
  limbs: octopusArms,
  eyes: { at: [.545, 60], r: .021, ring: '#e9d9a6', out: .012 },
  lumps: [0, 1, 2].map(n => ({ at: [.3 + n * .06, 20 + n * 25], size: [.012, .01, .014], color: '#b89a7c', mirror: true })),
  paint: c => {
    // Painted as a light, warm stone colour: on the reef the scene tints it to its rock, or flushes it red.
    if (c.part === 'limb') {
      const sucker = band(Math.sin(c.u * 70), .4, 1.1, .2) * ss(-c.h, .35, .65);
      return blend(blend(mottle(tone('#b8957a'), { t: c.u, a: c.a }, .14, 24), '#efdcc8', ss(-c.h, .15, .5)), '#fbefe2', sucker * .7);
    }
    if (c.cap) return '#a07f66';
    const blotch = ss(noise(c.p.x * 40 + 3, c.p.z * 40) + noise(c.p.y * 50, c.p.z * 30) * .5, .75, 1.1);
    return mottle(blend(blend(grade(c.h, [[-1, '#e7d2be'], [-.2, '#c2a184'], [1, '#a9876b']]), '#efe0cf', blotch * .55), '#6f4d3a', ss(noise(c.p.x * 70, c.p.z * 70), .78, .9) * .5), c, .12, 20);
  },
  rig: { root: .55, head: .38, spine: [.63] },
  clips: k => {
    const ripple = (name, duration, amp, swing, extra = {}) => limbClip(k, { name, duration, bones: extra,
      each: (limb, j, i) => [{ axis: limb.lift, amp: amp * (.4 + j * .35), phase: i * .125 + j * .18 }, { axis: limb.swing, amp: swing * (j + 1) * .5, phase: i * .125 + j * .2 + .25 }] });
    // Jetting: arms swept back behind it together, streaming, the mantle squeezing.
    const behind = limb => Math.atan2(Math.sin(Math.PI - Math.atan2(limb.dir[0], limb.dir[2])), Math.cos(Math.PI - Math.atan2(limb.dir[0], limb.dir[2])));
    return [ripple('rest', 5, .05, .04, { head: [{ axis: X, amp: .05, phase: .2 }] }), ripple('swim', 1.8, .2, .12, { head: [{ axis: X, amp: .04 }] }),
      ripple('alert', 2.4, .06, .03, { head: [{ axis: X, amp: .03, bias: -.22 }] }),
      limbClip(k, { name: 'jet', duration: .9, bones: { head: [{ axis: X, amp: .06, phase: 0 }] },
        each: (limb, j) => [{ axis: limb.swing, amp: 0, bias: j ? 0 : behind(limb) * .8 }, { axis: limb.lift, amp: .12 * j, bias: j ? .05 : .18, phase: .2 * j }] })];
  }
};

// A crab is drawn standing: legs bent at the knee, tips on the ground, claws carried in front.
const crabLegs = (pairs, front, spacing, reach = 1, height = 1) => Array.from({ length: pairs }, (_, k) => {
  const ang = (k - (pairs - 1) / 2) * .42 - .12, dx = Math.cos(ang), dz = -Math.sin(ang), root = [.48, -.06, front - k * spacing];
  const p1 = [root[0] + dx * .42 * reach, root[1] + .2 * height, root[2] + dz * .42 * reach], p2 = [p1[0] + dx * .4 * reach, p1[1] - .1 * height, p1[2] + dz * .4 * reach];
  return { name: `leg${k + 1}`, slot: 'leg', mirror: true, K: 5, flat: .72, r: [.1, .088, .062, 0], path: [root, p1, p2, [p2[0] + dx * .2 * reach, p2[1] - .42 * height, p2[2] + dz * .2 * reach]] };
});
const spottedCrab = {
  id: 'spotted-reef-crab', name: 'Spotted reef crab', scientific: 'Carpilius maculatus', real: .15, site: .14, group: 'crab',
  note: 'A smooth domed shell the colour of cream, set with eleven round red spots, and heavy claws tipped in black.',
  body: { K: 14, maxGap: .1, stations: [[0, .3, .1, .08, 0], [.05, .5, .18, .13], [.2, .66, .28, .18], [.4, .72, .32, .2], [.6, .68, .3, .19], [.8, .52, .22, .16], [.95, .3, .12, .1], [1, .1, .05, .04]] },
  limbs: [...crabLegs(4, .08, .13, .85),
    { name: 'claw', slot: 'claw', mirror: true, K: 6, flat: .72, wide: 1.1, r: [.07, .075, .095, .12, 0], path: [[.36, -.05, .3], [.6, .06, .5], [.56, .04, .76], [.33, .0, .92], [.13, -.02, 1]] }],
  eyes: { at: [.03, 28], r: .042, color: '#2a0d0b', out: .035, glint: true },
  eyeshine: [.2, .18, .5],
  spots: () => [
    { t: .12, a: 0, r: .1, color: '#b8322a', mirror: false }, { t: .14, a: 38, r: .085, color: '#b8322a' }, { t: .2, a: 70, r: .06, color: '#b8322a' },
    { t: .42, a: 0, r: .11, color: '#b8322a', mirror: false }, { t: .38, a: 36, r: .1, color: '#b8322a' }, { t: .46, a: 72, r: .07, color: '#b8322a' },
    { t: .72, a: 0, r: .09, color: '#b8322a', mirror: false }, { t: .7, a: 42, r: .08, color: '#b8322a' }],
  paint: c => {
    if (c.part === 'limb') return c.name === 'claw' ? blend(blend('#e8c79c', '#f3e2c4', ss(-c.h, .1, .5)), '#17110f', ss(c.u, .84, .9)) : blend(blend('#dba57a', '#c2604a', band(Math.sin(c.u * 9), .7, 1.1, .2) * .5), '#f0dcc0', ss(-c.h, .2, .6));
    if (c.cap) return '#d7b38a';
    return mottle(grade(c.h, [[-1, '#f2e5cc'], [-.2, '#ead4ad'], [1, '#f0dcb4']]), c, .04, 20);
  },
  rig: { root: .5, spine: [.95] },
  clips: k => {
    // Sideways at a scuttle: the legs of each side step in two alternating sets, the far side out of step with the near.
    const step = (limb, j) => { const n = +limb.name.slice(3), phase = (n % 2) * .5 + (limb.side > 0 ? .25 : 0); return j === 0 ? [{ axis: limb.lift, amp: .22, phase, skew: .5 }, { axis: limb.swing, amp: .14 * limb.side, phase: phase + .25 }] : j === 1 ? [{ axis: limb.lift, amp: -.14, phase: phase + .1 }] : []; };
    const claws = (bias, amp = .05) => limb => limb.name === 'claw' ? [{ axis: limb.lift, amp, bias }] : [];
    return [limbClip(k, { name: 'walk', duration: .55, each: (limb, j) => limb.name === 'claw' ? (j === 0 ? [{ axis: limb.lift, amp: .04, phase: .3 }] : []) : step(limb, j), root: { y: [.006, .1, 2], x: [.004, .2] } }),
      limbClip(k, { name: 'idle', duration: 3.2, each: (limb, j, i) => limb.name === 'claw' ? (j === 3 ? [{ axis: limb.swing, amp: .12 * limb.side, phase: .3 }] : []) : j === 0 ? [{ axis: limb.lift, amp: .02, phase: i * .17 }] : [] }),
      // Claws up and open towards a threat (or a lamp), the body raised on its legs.
      limbClip(k, { name: 'guard', duration: 1.4, each: (limb, j) => limb.name === 'claw' ? [{ axis: limb.lift, amp: j === 0 ? .06 : .03, bias: j === 0 ? .45 : j === 1 ? -.2 : 0, phase: j * .2 }] : j === 1 ? [{ axis: limb.lift, amp: 0, bias: -.12 }] : [], root: { y: [.01, 0] } })];
  }
};

const hermit = {
  id: 'hermit-crab', name: 'White-spotted hermit crab', scientific: 'Dardanus megistos', real: .2, site: .17, group: 'crab',
  note: 'Red legs and claws peppered with black-ringed white spots, carried about in a borrowed spiral shell.',
  // The body is the shell, aperture forward; the crab's legs and claws come out of it.
  body: { K: 10, ex: .95, maxGap: .08, stations: [[0, .3, .28, .24, .02], [.12, .36, .36, .3, .04], [.32, .34, .37, .28, .08], [.52, .27, .31, .22, .13], [.7, .17, .22, .15, .19], [.86, .08, .12, .08, .24], [1, 0, .01, .01, .3]] },
  limbs: [...crabLegs(2, .5, .12, .8, .9).map(limb => ({ ...limb, path: limb.path.map(([x, y, z]) => [x - .2, y - .1, z]) })),
    { name: 'claw', slot: 'claw', mirror: true, K: 6, flat: .8, r: [.06, .07, .085, .1, 0], path: [[.12, -.06, .46], [.26, .02, .62], [.24, .0, .78], [.12, -.04, .88], [.04, -.06, .93]] },
    { name: 'stalk', slot: 'stalk', mirror: true, K: 4, sub: 1, tip: .035, r: [.02, .02, .036], path: [[.06, .1, .48], [.08, .22, .56], [.1, .3, .6]] }],
  eyeshine: [.1, .3, .6],
  paint: c => {
    if (c.part === 'limb') {
      if (c.name === 'stalk') return blend('#c64a33', '#0f1012', ss(c.u, .7, .8));
      const dots = ss(Math.sin(c.u * 34) * Math.sin(c.a * 3 + c.u * 7), .78, .92);
      return blend(blend('#b8372a', '#e46a43', ss(c.h, 0, .8) * .4), '#f6efe4', dots);
    }
    if (c.cap) return blend('#2a1d16', '#c99b74', ss(Math.hypot(c.lat, c.h), .8, .95));
    // Spiral bands of the shell.
    const whorl = ss(Math.sin(c.t * 34 + c.a * 1.0), .2, .6);
    return mottle(blend('#e2cda6', '#8d5c3a', whorl * .7), c, .1, 16);
  },
  rig: { root: .4, spine: [.9] },
  clips: k => {
    const step = (limb, j) => { const n = +limb.name.slice(3), phase = (n % 2) * .5 + (limb.side > 0 ? .25 : 0); return j === 0 ? [{ axis: limb.lift, amp: .25, phase, skew: .5 }, { axis: limb.swing, amp: .2 * limb.side, phase: phase + .25 }] : []; };
    return [limbClip(k, { name: 'walk', duration: .9, each: (limb, j) => limb.name.startsWith('leg') ? step(limb, j) : [], root: { y: [.01, .1, 2], x: [.008, .2] } }),
      limbClip(k, { name: 'idle', duration: 3.5, each: (limb, j, i) => limb.name === 'stalk' ? [{ axis: limb.swing, amp: .25, phase: limb.side * .2 }] : limb.name === 'claw' && j === 3 ? [{ axis: limb.lift, amp: .1, phase: i * .2 }] : [] }),
      limbClip(k, { name: 'guard', duration: 1.4, each: (limb, j) => limb.name === 'claw' ? [{ axis: limb.lift, amp: .05, bias: j === 0 ? .35 : 0 }] : [] }),
      // Pulled back into its shell: legs and claws tucked, eyes down.
      limbClip(k, { name: 'hide', duration: 2, each: (limb, j) => j ? [] : [{ axis: limb.lift, amp: 0, bias: limb.name === 'stalk' ? -.8 : .5 }, { axis: limb.swing, amp: 0, bias: -.5 * limb.side }] })];
  }
};

// Sea stars: a small central disc and five arms flat on the sand.
const starArms = (inner, reach, r, flat, studs = []) => radial(5, 0, (sx, cz, k) => ({
  name: `arm${k + 1}`, slot: 'arm', parent: 'root', K: 6, flat, keep: true, r, studs,
  path: [[sx * inner, .012, cz * inner], [sx * reach * .38, .01, cz * reach * .38], [sx * reach * .7, .006, cz * reach * .7], [sx * reach, .002, cz * reach]]
}));
const starClips = (k, curl = .1) => [
  limbClip(k, { name: 'idle', duration: 9, each: (limb, j, i) => [{ axis: limb.lift, amp: curl * j * .5, phase: i * .21 + j * .1 }, { axis: limb.swing, amp: curl * .3 * j, phase: i * .21 + .3 }] }),
  // Gliding over the sand on its tube feet: one arm leads, the others ripple.
  limbClip(k, { name: 'swim', duration: 4, each: (limb, j, i) => [{ axis: limb.lift, amp: curl * .8 * j, phase: i * .2 + j * .15 }] })];
const blueStar = {
  id: 'blue-sea-star', name: 'Blue sea star', scientific: 'Linckia laevigata', real: .3, site: .85, group: 'echinoderm', swimShader: { amp: 0, waves: 0, power: 1 },
  note: 'Five long, round-tipped arms of an even, startling blue, lying out in the open on sand and coral rubble.',
  body: { K: 10, maxGap: .04, stations: [[.42, 0, 0, 0, .01], [.44, .055, .04, .018, .01], [.5, .075, .05, .02, .01], [.56, .055, .04, .018, .01], [.58, 0, 0, 0, .01]] },
  limbs: starArms(.03, .48, [.048, .042, .032, .017], .72),
  paint: c => {
    if (c.part === 'limb') return mottle(blend(blend('#2f6bd0', '#5e95e6', ss(c.u, .85, 1) * .6), '#9db5dc', ss(-c.h, .25, .6)), { t: c.u, a: c.a }, .1, 40);
    if (c.cap) return '#2f6bd0';
    return mottle(blend('#2a63c6', '#9db5dc', ss(-c.h, .3, .7)), c, .1, 40);
  },
  rig: { root: .5, spine: [.56] },
  clips: k => starClips(k, .1)
};
const chipStar = {
  id: 'chocolate-chip-sea-star', name: 'Chocolate chip sea star', scientific: 'Protoreaster nodosus', real: .25, site: .7, group: 'echinoderm', swimShader: { amp: 0, waves: 0, power: 1 },
  note: 'A thick, sandy-orange star studded along every arm with dark brown knobs, like chips in a biscuit.',
  body: { K: 10, maxGap: .04, stations: [[.37, 0, 0, 0, .02], [.39, .12, .085, .03, .02], [.5, .165, .11, .035, .02], [.61, .12, .085, .03, .02], [.63, 0, 0, 0, .02]] },
  limbs: starArms(.06, .48, [.11, .085, .056, .026], .55, [{ u: .25, r: .022, h: .05, color: '#3a2416' }, { u: .5, r: .02, h: .045, color: '#3a2416' }, { u: .72, r: .016, h: .035, color: '#3a2416' }, { u: .38, a: 55, r: .014, h: .03, color: '#4a2f1c' }, { u: .38, a: -55, r: .014, h: .03, color: '#4a2f1c' }]),
  lumps: [{ at: [.5, 0], size: [.022, .03, .022], color: '#3a2416', mirror: false, sharp: true, keep: true, lift: .4 }, ...[0, 1, 2, 3, 4].map(n => ({ at: [.44 + (n % 2) * .12, 40 + n * 6], size: [.016, .022, .016], color: '#3a2416', sharp: true, keep: true, lift: .4 }))],
  paint: c => {
    if (c.part === 'limb') return mottle(blend(blend('#d99a52', '#ecc58f', band(Math.sin(c.u * 18), .5, 1.1, .3) * .4), '#f0e2c8', ss(-c.h, .2, .6)), { t: c.u, a: c.a }, .08, 30);
    if (c.cap) return '#d99a52';
    return mottle(blend('#d38f48', '#f0e2c8', ss(-c.h, .3, .7)), c, .08, 30);
  },
  rig: { root: .5, spine: [.6] },
  clips: k => starClips(k, .06)
};

// Long-spined urchin: a dark test bristling with needles longer than itself, five white spots and an orange ring on top.
const urchinSpines = (() => {
  const list = [], count = 54;
  for (let i = 0; i < count; i++) {
    const v = (i + .5) / count, t = .4 + .2 * v, a = ((i * 137.508) % 360) - 180;
    if (Math.abs(a) > 165 && Math.abs(t - .5) < .06) continue;   // none straight down into the sand
    list.push({ at: [t, a], size: [.006, .17 + .05 * Math.sin(i * 1.7), .006], color: i % 7 ? '#120e15' : '#3a2f44', sharp: true, keep: true, mirror: false, lift: .95, turn: [((i * 53) % 21 - 10), 0, ((i * 31) % 17 - 8)] });
  }
  return list;
})();
const urchin = {
  id: 'long-spined-urchin', name: 'Long-spined sea urchin', scientific: 'Diadema setosum', real: .5, site: 1, group: 'echinoderm', swimShader: { amp: 0, waves: 0, power: 1 },
  note: 'A black ball of needles twice its width, with five white spots and a ring of orange round the vent on top.',
  body: { K: 12, maxGap: .03, stations: [[.38, 0, 0, 0, 0], [.4, .075, .07, .04], [.45, .11, .1, .06], [.5, .12, .11, .065], [.55, .11, .1, .06], [.6, .075, .07, .04], [.62, 0, 0, 0]] },
  lumps: urchinSpines,
  spots: () => [{ t: .5, a: 0, r: .03, color: '#e8642a', mirror: false }, { t: .5, a: 0, r: .014, color: '#1a1420', mirror: false },
    ...[0, 1, 2, 3, 4].map(n => ({ t: .5 + .055 * Math.cos(n * 1.2566), a: 45 * Math.sin(n * 1.2566), r: .012, color: '#e6e3ee', mirror: false }))],
  paint: c => c.cap ? '#1a1420' : mottle(grade(c.h, [[-1, '#2a2230'], [1, '#1b1620']]), c, .1, 30),
  rig: { root: .5, spine: [.58] },
  clips: k => [k.act({ name: 'idle', duration: 8, loop: true, bones: { root: [{ axis: Y, amp: .03 }, { axis: X, amp: .01, phase: .3 }] } })]
};

const whitetip = {
  id: 'whitetip-reef-shark', name: 'Whitetip reef shark', scientific: 'Triaenodon obesus', real: 1.6, group: 'shark',
  note: 'Slim and grey with a broad, blunt snout; the first dorsal fin and the top of the tail are tipped in brilliant white.',
  body: { K: 10, ey: .86, maxGap: .08, stations: [
    [0, .008, .004, .004, -.006], [.02, .032, .01, .01, -.006], [.06, .046, .022, .022, -.004], [.14, .055, .042, .04], [.26, .058, .054, .05], [.4, .054, .055, .05],
    [.54, .042, .045, .041], [.66, .027, .03, .028], [.75, .015, .019, .017], [.79, .009, .013, .012]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.42], thick: .007, outline: [[0, 0], [.03, .045], [.058, .08], [.08, .1], [.094, .094], [.094, .035], [.112, .006], [.096, 0]] },
    { name: 'dorsal2', plane: 'side', root: [.63], thick: .004, outline: [[0, 0], [.02, .03], [.038, .042], [.046, .012], [.06, 0]] },
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.25, 118, .3], span: [.74, -.38, -.56], chord: [0, -.2, -1], thick: .007, hinge: .08, stiff: .6,
      outline: [[0, 0], [.01, .05], [.028, .1], [.048, .13], [.06, .124], [.066, .06], [.07, 0]] },
    { name: 'pelvic', mirror: true, root: [.55, 152, .3], span: [.45, -.82, -.35], thick: .004, outline: [[0, 0], [.014, .03], [.032, .04], [.044, .012], [.042, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.645], thick: .004, outline: [[0, 0], [.016, .028], [.034, .032], [.04, .008], [.052, 0]] },
    { name: 'caudal', plane: 'side', root: [.775, 0], thick: .006, outline: [[0, -.006], [0, .012], [.05, .055], [.12, .12], [.2, .19], [.222, .18], [.19, .1], [.13, .03], [.07, 0]] },
    { name: 'caudal', plane: 'side', root: [.775, 0], thick: .005, outline: [[0, .006], [0, -.012], [.04, -.045], [.08, -.085], [.1, -.082], [.088, -.03], [.07, 0]] }
  ],
  eyes: { at: [.064, 80], r: .0065, ring: '#c3c6bd' },
  spots(random) { const list = []; for (let i = 0; i < 16; i++) list.push({ t: .2 + random() * .5, a: 55 + random() * 50, r: .006 + random() * .006, color: '#4c5157', opacity: .7 }); return list; },
  paint: c => {
    const grey = '#7c8288', white = '#f4f5f2';
    if (!body(c)) {
      if (c.name === 'dorsal') return blend(grey, white, ss(c.s, .68, .76));
      if (c.name === 'caudal') return blend(grey, white, ss(c.s, .7, .8) * ss(c.u, .45, .6) * (c.s > 0 ? 1 : 1));
      return blend(c.up < 0 ? '#d9dcd8' : grey, '#5d6268', ss(c.s, .8, 1) * .4);
    }
    return mottle(grade(c.h, [[-1, '#f3f2ec'], [-.3, '#e9e8e1'], [-.12, '#9aa0a4'], [.35, grey], [1, '#6b7177']]), c, .05, 26);
  },
  rig: { root: .32, head: .15, spine: [.42, .54, .65, .74, .8, .9] },
  clips: k => swimmerClips(k,
    { name: 'swim', period: 1.7, amp: .78, mode: 'anguilliform', pectoral: .03, follow: .1, recoil: 1.3 },
    { name: 'fast', period: .8, amp: .95, mode: 'subcarangiform', pectoral: .02, follow: .1 },
    { name: 'idle', period: 2.6, amp: .45, mode: 'subcarangiform', pectoral: .04 },
    { turn: { curve: .8, bank: .18 }, extra: [
      // Whitetips can pump water over their gills, so they lie still on the sand by day: only the breath moves.
      k.swim({ name: 'rest', period: 4.4, amp: .05, mode: 'anguilliform', pectoral: .02, recoil: 0, roll: .004, heave: .0012,
        pose: { spine_2: { axis: Y, bias: .08 }, spine_3: { axis: Y, bias: .14 }, spine_4: { axis: Y, bias: .18 }, spine_5: { axis: Y, bias: .16 }, pectoral_L: { axis: Z, bias: .25 }, pectoral_R: { axis: Z, bias: -.25 } } })] })
};

const hammerhead = {
  id: 'scalloped-hammerhead', name: 'Scalloped hammerhead', scientific: 'Sphyrna lewini', real: 3, group: 'shark',
  note: 'A head drawn out into a flat, notched blade with an eye at each end, a tall sickle dorsal fin and a long upper tail.',
  body: { K: 10, maxGap: .07, stations: [
    [0, .1, .006, .006, -.002], [.012, .135, .008, .009, -.002], [.03, .128, .009, .01, -.002], [.05, .042, .022, .02], [.1, .05, .038, .034], [.2, .056, .056, .05], [.33, .058, .064, .058],
    [.46, .05, .06, .054], [.58, .036, .044, .04], [.68, .022, .028, .026], [.75, .012, .017, .015], [.78, .008, .012, .011]] },
  fins: [
    { name: 'dorsal', plane: 'side', root: [.34], thick: .007, outline: [[0, 0], [.025, .06], [.05, .12], [.075, .165], [.092, .16], [.09, .06], [.115, .006], [.096, 0]] },
    { name: 'dorsal2', plane: 'side', root: [.655], thick: .004, outline: [[0, 0], [.012, .022], [.026, .028], [.03, .008], [.04, 0]] },
    { name: 'pectoral', mirror: true, bone: 'pectoral', root: [.24, 118, .3], span: [.78, -.36, -.5], chord: [0, -.2, -1], thick: .006, hinge: .08, stiff: .6,
      outline: [[0, 0], [.01, .045], [.03, .09], [.055, .118], [.064, .11], [.066, .05], [.068, 0]] },
    { name: 'pelvic', mirror: true, root: [.55, 150, .3], span: [.45, -.82, -.35], thick: .004, outline: [[0, 0], [.012, .03], [.03, .04], [.04, .012], [.038, 0]] },
    { name: 'anal', plane: 'side', down: true, root: [.63], thick: .004, outline: [[0, 0], [.016, .03], [.034, .036], [.04, .01], [.05, 0]] },
    { name: 'caudal', plane: 'side', root: [.765, 0], thick: .006, outline: [[0, -.006], [0, .012], [.06, .06], [.14, .13], [.23, .2], [.255, .19], [.22, .12], [.15, .04], [.08, 0]] },
    { name: 'caudal', plane: 'side', root: [.765, 0], thick: .005, outline: [[0, .006], [0, -.012], [.04, -.05], [.075, -.09], [.095, -.085], [.08, -.03], [.07, 0]] }
  ],
  eyes: { at: [.016, 90], r: .007, ring: '#b8b4a2' },
  paint: c => {
    const bronze = '#7f7d70';
    if (!body(c)) return blend(c.up < 0 && c.name === 'pectoral' ? '#e2e0d6' : bronze, '#3f3e38', ss(c.s, .78, 1) * (c.name === 'pectoral' && c.up < 0 ? .7 : .25));
    if (c.cap) return '#6c6a5e';
    return mottle(grade(c.h, [[-1, '#f2f0e8'], [-.3, '#e9e6dc'], [-.1, '#a3a092'], [.35, bronze], [1, '#6e6c60']]), c, .05, 26);
  },
  rig: { root: .3, head: .1, spine: [.4, .52, .63, .72, .78, .88] },
  clips: k => swimmerClips(k,
    // The hammer sweeps from side to side as it swims, scanning the sand.
    { name: 'swim', period: 2, amp: .62, mode: 'subcarangiform', pectoral: .025, follow: .1, recoil: 2 },
    { name: 'fast', period: .95, amp: .85, mode: 'subcarangiform', pectoral: .02, follow: .1, recoil: 1.6 },
    { name: 'idle', period: 3, amp: .4, mode: 'subcarangiform', pectoral: .03, recoil: 1.8 },
    { turn: { curve: .75, bank: .22 } })
};

// --- More reef fish, and two great rays ------------------------------------------------------------------------------
const clownfish = { ...reefFish({ id: 'clownfish', name: 'Ocellaris clownfish', scientific: 'Amphiprion ocellaris', real: .08, D: .2, W: .075, tail: 'round', dorsal: .42, dorsalFrom: .2, anal: .38, eye: [.1, 60, .021], period: .26, amp: .65, pectoral: .35,
  note: 'Bright orange with three white bars, each edged in black, living among the stinging tentacles of its anemone.',
  paint: c => {
    if (!body(c)) return blend(blend('#f27a1f', '#121212', ss(c.s, .78, .86)), '#f6f2e8', ss(c.s, .93, .98));
    // Three white bars: behind the eye, a middle one bulging forward, and one round the tail stock; each edged in black.
    const bars = [[.17 - c.h * .015, .23], [.44 - Math.cos(c.h * 1.4) * .035, .52], [.735, .77]];
    let white = 0, edge = 0;
    for (const [a, b] of bars) { white = Math.max(white, band(c.t, a, b, .006)); edge = Math.max(edge, band(c.t, a - .018, b + .018, .004)); }
    return blend(blend('#f47a1f', '#141414', edge), '#f8f6ef', white);
  } }), site: .14, group: 'fish' };

const yellowTang = { ...reefFish({ id: 'yellow-tang', name: 'Yellow tang', scientific: 'Zebrasoma flavescens', real: .18, D: .42, W: .05, snout: .07, tail: 'round', dorsal: .48, dorsalFrom: .13, anal: .42, eye: [.12, 56, .016], period: .42, amp: .45,
  note: 'A disc of lemon yellow with a long snout, and a white scalpel at the base of its tail.',
  paint: c => {
    if (!body(c)) return blend('#f4cf1b', '#ffe46a', ss(c.s, .8, 1) * .5);
    const scalpel = 1 - ss(Math.hypot((c.t - .72) * 9, c.h * 1.6), .55, .75);
    return blend(grade(c.h, [[-1, '#f8da3a'], [1, '#f1c30f']]), '#f7f4ea', scalpel);
  } }), group: 'fish' };

const triggerfish = { ...reefFish({ id: 'picasso-triggerfish', name: 'Picasso triggerfish', scientific: 'Rhinecanthus aculeatus', real: .25, D: .28, W: .065, snout: .07, tail: 'round', dorsal: .32, dorsalFrom: .36, anal: .32, eye: [.17, 52, .015], period: .5, amp: .3, pectoral: .45,
  note: 'As if painted by hand: blue and black bars across the eye, a yellow line from its lips, black wedges and white streaks behind.',
  // It swims by rippling the soft dorsal and anal fins, the tail held almost still.
  extraFins: [{ name: 'trigger', plane: 'side', root: [.27], thick: .004, embed: .2, outline: [[0, 0], [.01, .09], [.03, .1], [.05, .02], [.06, 0]] }],
  paint: c => {
    if (!body(c)) return c.name === 'caudal' ? blend('#d8cdb4', '#191919', ss(c.s, .55, .75) * .4) : c.name === 'pectoral' ? '#e8a23b' : '#d6ccb6';
    let col = grade(c.h, [[-1, '#f5f1e6'], [-.3, '#ebe4d2'], [.1, '#c7b996'], [1, '#a99a77']]);
    // Behind: a black wedge on the flank with three white streaks across it, and black rows on the tail stock.
    const wedge = ss(c.t, .5, .54) * (1 - ss(c.t, .74, .78)) * band(c.h + (c.t - .5) * 1.4, -.55, .25, .05);
    col = blend(col, '#17181b', wedge);
    col = blend(col, '#f4f2ea', wedge * band(Math.sin((c.t * 22 + c.h * 3) * Math.PI), .7, 1.1, .15));
    // In front: bars of blue and black across the eye and over the brow, and a yellow line back from the lips.
    const head = 1 - ss(c.t, .2, .26), bars = Math.sin((c.t * 30 - c.h * 2.4) * Math.PI);
    col = blend(col, bars > .3 ? '#2f6fd6' : bars < -.4 ? '#141518' : col, head * ss(c.h, -.15, .1) * .9);
    col = blend(col, '#f0a52c', band(c.h + (c.t - .02) * 1.6, -.36, -.26, .02) * (1 - ss(c.t, .2, .3)));
    return blend(col, '#e2462b', band(c.t, .005, .04, .006) * ss(-c.h, -.2, 0));
  } }), group: 'fish' };

// The humphead wrasse: a long, deep body whose forehead swells into the hump above and behind the eye, and a small mouth
// of thick yellowish lips well below it. The hump and lips are the body's own shape (its stations), not solids stuck on:
// a sphere on the brow and a ball for the lips read as a fish wearing a hat and a pacifier.
const humphead = (() => {
  const fish = reefFish({ id: 'humphead-wrasse', name: 'Humphead wrasse', scientific: 'Cheilinus undulatus', real: 1.5, D: .17, W: .08, K: 12, tail: 'round', dorsal: .34, dorsalFrom: .2, anal: .34, eye: [.105, 60, .012, '#d9b84a'], period: 1.1, amp: .36, pectoral: .34,
    note: 'A green-blue giant as long as a diver, with a hump on its forehead, thick lips and a face scribbled with wavy lines.',
    paint: c => {
      if (!body(c)) {
        // Fins: green, finely lined, with a pale rim; the tail with dark wavy bars.
        const rim = ss(c.s, .82, .97), lines = band(Math.sin(c.u * 34 + c.s * 7), .55, 1.1, .2);
        return blend(blend('#2f7c7f', '#215c62', lines * .45), '#b9d8a8', rim * .6);
      }
      if (c.cap) return '#c9b46a';
      // Green-blue, darker above; every scale with a fine dark bar across it.
      let col = grade(c.h, [[-1, '#9fd0b8'], [-.35, '#5aa59b'], [.25, '#357f86'], [1, '#245f6a']]);
      col = blend(col, '#1d4f58', band(Math.sin(c.t * 150) * Math.sin(c.a * 16), .72, 1.1, .1) * .45 * ss(c.t, .2, .3));
      // The face: wavy yellow-green lines fanning back from the eye, and two dark lines straight back behind it.
      const face = 1 - ss(c.t, .16, .26);
      col = blend(col, '#b9c27a', face * band(Math.sin((c.h * 13 + Math.sin(c.t * 70 + c.h * 4) * .6) * Math.PI), .86, 1.1, .06) * .5);
      const behind = ss(c.t, .12, .14) * (1 - ss(c.t, .22, .26)), lineA = band(c.h - .3 + (c.t - .12) * 1.2, -.035, .035, .012), lineB = band(c.h + .02 + (c.t - .12) * .6, -.035, .035, .012);
      col = blend(col, '#173f46', Math.min(1, lineA + lineB) * behind * .8);
      // Thick lips, pale yellow.
      return blend(col, '#c8b56c', (1 - ss(c.t, .01, .026)) * .85);
    } });
  fish.body = { K: 12, lodK: 7, maxGap: .06, stations: [
    [0, .006, .008, .012, -.045], [.015, .028, .03, .034, -.042], [.035, .046, .062, .058, -.03], [.06, .058, .108, .084, -.012],
    [.09, .068, .158, .108, .006], [.13, .075, .198, .13, .016], [.18, .08, .204, .152, .01], [.26, .083, .19, .166, 0],
    [.36, .081, .178, .166, -.004], [.48, .072, .155, .148, -.004], [.6, .055, .115, .108, 0], [.7, .036, .072, .068, 0], [.78, .024, .042, .04, 0], [.8, .022, .036, .035, 0]] };
  fish.mouth = { t: .012, size: [.016, .006, .02], drop: -.004, color: '#3a2a22' };
  return { ...fish, group: 'fish', school: false, rig: { root: .36, head: .17, spine: [.5, .62, .72, .79] } };
})();

const manta = {
  id: 'manta-ray', name: 'Reef manta ray', scientific: 'Mobula alfredi', real: 3, group: 'ray', span: 3.6,
  note: 'Black above with pale chevrons on its shoulders, white below; it flies on wings wider than a car, steering with two rolled horns either side of its mouth.',
  body: { K: 12, shape: raySection(.22), maxGap: .04, stations: [
    [0, .075, .012, .01], [.03, .1, .02, .014], [.08, .2, .03, .02], [.14, .38, .04, .026], [.19, .46, .044, .027], [.23, .44, .043, .026], [.29, .3, .04, .025], [.35, .16, .034, .022], [.41, .07, .026, .018], [.45, .03, .02, .014], [.47, .006, .008, .006]] },
  tail: { K: 4, maxGap: .1, stations: [[.42, .016, .014, .012], [.5, .012, .012, .01], [.62, .007, .007, .006], [.75, 0, 0, 0]] },
  fins: [{ name: 'horn', mirror: true, bone: 'horn', root: [.012, 80, .05], span: [.25, -.25, .93], chord: [1, 0, 0], thick: .006, hinge: .1, stiff: .4, outline: [[0, 0], [-.012, .04], [-.006, .085], [.012, .1], [.03, .07], [.03, 0]] }],
  eyes: { at: [.04, 82], r: .007, glint: false },
  paint: c => {
    if (c.part === 'tail') return '#1c2126';
    if (!body(c)) return c.up < 0 ? '#e8ebe8' : '#22272c';
    if (c.cap) return '#2a2f34';
    // Below: white, with a dark margin to the wings and a few dark spots between the gills.
    if (c.h < -.05) return blend(blend('#eef0ec', '#3a3f45', ss(edgeOf(c), .82, .97)), '#2b3035', 1 - ss(Math.hypot((Math.abs(c.p.x) - .04) * 30, (c.p.z - .25) * 30), .5, .7));
    // Above: black, a pale chevron on each shoulder sweeping back from behind the head.
    const ax = Math.abs(c.p.x), chevron = band(ax - (c.p.z - .26) * -1.1, .06, .2, .03) * band(c.p.z, .22, .4, .03) * (1 - ss(edgeOf(c), .55, .7));
    return mottle(blend('#1d2227', '#d6dbdc', chevron), c, .05, 18);
  },
  rig: { kind: 'ray', centre: .19, halfSpan: .46, ribs: [40, 90, 140], radii: [.3, .68], tail: [.5, .6, .7] },
  clips: k => rayClips(k,
    // Mantas fly: the wings beat together, slow and deep, the tips trailing.
    { name: 'swim', period: 4.4, amp: .62, wave: .05, skew: .2, tail: .05, heave: .02 },
    { name: 'glide', period: 7, amp: .16, wave: .08, tail: .04, heave: .006 },
    { name: 'rest', period: 6, amp: .1, wave: .1, tail: .03 }, [
      // Feeding, a manta somersaults: a slow loop back over itself, wings beating through it.
      k.act({ name: 'loop', duration: 7, bones: Object.fromEntries(k.rig.bones.filter(b => b.axis).map(b => [b.name, [{ axis: b.axis, amp: b.ring ? .5 : .3, freq: 2, phase: b.rib * .05 }]])),
        root: { y: { bias: .4, env: [[0, 0], [.5, 1], [1, 0]] }, z: { bias: -.25, env: [[0, 0], [.25, -.5], [.5, 0], [.75, .5], [1, 0]] } } })
    ].map(def => ({ ...def, bones: { ...def.bones, root: [{ axis: X, amp: 0, bias: -Math.PI * 2, env: [[0, 0], [1, 1]] }] } })))
};

const eagleRay = {
  id: 'spotted-eagle-ray', name: 'Spotted eagle ray', scientific: 'Aetobatus narinari', real: 2, group: 'ray', span: 1.9,
  note: 'Pointed wings dark as ink and dotted white, a duck-billed head, and a whip of a tail three times its body.',
  body: { K: 12, shape: raySection(.28), maxGap: .03, stations: [
    [0, 0, 0, 0, -.004], [.01, .016, .011, .01, -.004], [.04, .03, .02, .016, -.002], [.06, .05, .025, .018], [.1, .18, .03, .02], [.14, .3, .034, .022], [.17, .34, .034, .022], [.2, .27, .032, .021], [.24, .14, .03, .02], [.27, .06, .024, .016], [.29, .02, .018, .012], [.3, .004, .006, .005]] },
  tail: { K: 4, maxGap: .1, stations: [[.26, .014, .013, .011], [.32, .01, .01, .009], [.5, .006, .006, .005], [.75, .0035, .0035, .0035], [.92, .002, .002, .002], [1, 0, 0, 0]] },
  eyes: { at: [.042, 70], r: .006, glint: false },
  spots(random) { const list = []; for (let i = 0; i < 90; i++) list.push({ t: .05 + random() * .24, a: 5 + random() * 80, r: .004 + random() * .004, color: '#f3f4ef' }); return list; },
  paint: c => {
    if (c.part === 'tail') return blend('#1c2430', '#3b4552', ss(c.t, .6, 1));
    if (c.cap) return '#1d2531';
    return c.h < -.05 ? blend('#f2f3ee', '#5a6370', ss(edgeOf(c), .85, 1)) : mottle(tone('#1b2431'), c, .06, 22);
  },
  rig: { kind: 'ray', centre: .15, halfSpan: .34, ribs: [42, 90, 135], radii: [.3, .68], tail: [.36, .52, .7, .86] },
  clips: k => rayClips(k,
    { name: 'swim', period: 2.6, amp: .55, wave: .12, skew: .25, tail: .08, heave: .015 },
    { name: 'glide', period: 5, amp: .15, wave: .1, tail: .1, heave: .006 },
    { name: 'rest', period: 4, amp: .08, wave: .15, tail: .05 })
};

/** Every species in the set, largest first, sized for the site (see siteLength; site, where given, is a length in metres). */
export const SPECIES = [rightWhale, whaleShark, orca(false), orca(true), whipray, dolphin, nurse, blacktip, tuna, barracuda, bumphead, trevally, bluespot, remora, flyingFish, moray, ribbonEel, gardenEel, ...smallFish,
  hammerhead, whitetip, greenTurtle, cuttlefish, puffer, octopus, urchin, blueStar, chipStar, hermit, spottedCrab,
  clownfish, yellowTang, triggerfish, humphead, manta, eagleRay]
  .map(spec => { const length = spec.site ?? siteLength(spec.real); return { ...spec, realLength: spec.real, length, ...(spec.span ? { span: Math.round(spec.span * length / spec.real * 100) / 100, realSpan: spec.span } : {}) }; })
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
