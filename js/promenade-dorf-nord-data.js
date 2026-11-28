// The houses along the Promenade in Davos Dorf from the Freitag Store to the Dischmastrasse's corner
// (js/promenade-dorf-nord.js): seven houses by hand in one module, each its surveyed volumes, its roofs and its look.
// Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1751/1018, 1751/1019, 1752/1018 and 1752/1019): each house's batches are left
// out of the streamed tiles and rebuilt here whole. Batch 7 of 11/1751/1018 holds two houses, the pink house w118240614
// (its roof at 16.12) and the Bergsport's house w118240615 south of it (its roof at 12.92), so both are rebuilt; batch
// 24 of 11/1752/1019 (no OSM building) is the low annex on the north side of w126895388 and is rebuilt with it; the
// flat batches 0/22 (w117012269's forecourt at −1.24) and 1/5 (w126895495's at 0.25) lie at or under the ground and
// are only left out. The outlines below are the survey's walls at the ground (its wall feet, slivers cleaned; OSM
// stood up to a metre off them), heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js; x east, z south).
// The Promenade runs here from the Freitag's corner (544/−1029 … 553/−1071) north-north-east to 572/−1177; the
// ground falls from it to the east (3.5 at the street by the Bergsport, −1.9 behind the pink house at the north end)
// and rises west of it (up to 8 behind the pink house w118240614). Two houses have pitched roofs in the survey
// (w126895388: a saddle roof with its gable on the street, a cross wing north and a gabled bay south; w117012153: a
// saddle roof with its gable on the street and a cross gable over the galleried front on the south); the others are
// flat, the photographs showing deep dark eaves on them. The look after Mapillary's street views (CC BY-SA, 2013-2015),
// each house's note saying which photographs show it, which showed a neighbour, and what is guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

// The windows' grid every house's uv is laid out on: STOREY m per storey in uv (each house scales its own storey to
// it), a window from lo to hi over its storey's foot, half wide; the bays' spacing along a wall
export const STOREY = 3.0;
export const WIN = { lo: 0.9, hi: 2.2, half: 0.58 };
export const BAY = 2.6;
/** A house's window from its storey's foot (world metres): its lower and upper edge */
export const winLo = (h) => (WIN.lo * h.storey) / STOREY;
export const winHi = (h) => (WIN.hi * h.storey) / STOREY;

// The walls' looks: bits of a style (the material's per-wall code)
export const STYLE = { boards: 1, surrounds: 2, shutters: 4 };

// --- Frames --------------------------------------------------------------------------------------------------------------
/** A frame along a→b: o = a, u the unit along, n = (−u.z, u.x) (the right of someone walking a→b, z south), L */
export function frame(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  const u = [dx / L, dz / L];
  return { o: a, u, n: [-u[1], u[0]], L };
}
/** World [x, z] of (t, c) in a frame */
export const at = (F, t, c) => [F.o[0] + F.u[0] * t + F.n[0] * c, F.o[1] + F.u[1] * t + F.n[1] * c];
/** (t, c) of a world point in a frame */
export const local = (F, x, z) => { const dx = x - F.o[0], dz = z - F.o[1]; return [dx * F.u[0] + dz * F.u[1], dx * F.n[0] + dz * F.n[1]]; };

// --- Colours (linear) ----------------------------------------------------------------------------------------------------
export const COLOURS = {
  pink: [0.58, 0.44, 0.4], rose: [0.55, 0.4, 0.37], cream: [0.6, 0.58, 0.53], taupe: [0.47, 0.4, 0.31],
  beige: [0.55, 0.48, 0.36], white: [0.6, 0.6, 0.58], larch: [0.3, 0.16, 0.07], timber: [0.18, 0.1, 0.05],
  brown: [0.12, 0.068, 0.036], grey: [0.4, 0.41, 0.42], light: [0.52, 0.52, 0.5], dark: [0.06, 0.058, 0.055],
  annex: [0.5, 0.5, 0.48], stucco: [0.66, 0.64, 0.58]
};
const C = COLOURS;

// --- The houses -----------------------------------------------------------------------------------------------------------
// w117012153's front block over the galleries on the south (batch 15) and its cross gable (batch 19): the front's outline
// at the ground runs from its south wall back to the main block's south wall; its volume reaches 3 m further in, under
// the main roof, where the survey's flat roofs of 16.4–17.4 m meet the roof's slope
const MAIN_S = [[576.2, -1135.8], [587.1, -1133.6]]; // the main block's south wall
const IN = 3.0;
// (a point of the front's south wall taken straight back to the main block's wall, and `d` m further in)
const back = (p, d) => { const F = wallFrame(MAIN_S[0], MAIN_S[1]), t = (p[0] - F.a[0]) * F.u[0] + (p[1] - F.a[1]) * F.u[1]; return onWall(F, t, -d); };
const R1 = (p) => p.map((v) => Math.round(v * 100) / 100);
const frontPart = (outer, top, extra = {}) => {
  const [p, q] = [outer[0], outer[outer.length - 1]];
  const ground = [...outer, R1(back(q, 0)), R1(back(p, 0))];
  const ring = [...outer, R1(back(q, IN)), R1(back(p, IN))];
  return { ring, ground, ...extra, ...(top === null ? {} : { top }) };
};

export const HOUSES = [
  {
    // The Bergsport's house (the 12.92 m roof of batch 7 of 11/1751/1018, which holds the pink house behind it too), at
    // the corner of the Horlaubenstrasse, the Promenade's west side. 2013 and 2015 from the Promenade's pavement north of
    // it, 162245375806039 and 503654127668771 (from 540–543/−1033…−1035, looking south): cream plaster over two storeys,
    // a flat roof's thick dark brown edge, the shop's big panes under a light grey fascia with BERGSPORT and a dark
    // canopy on the corner's two sides, a black panel with the yellow diamond of "Fullmoons" on the first floor of the
    // north side; 877079032839673 and 167752498572572 show it further off. The shop is Go Vertical Davos now
    // (OpenStreetMap): lettered on the street side. The west and south sides (on the lane, up the slope) are guessed.
    id: 'w118240615', name: 'the Bergsport\'s house',
    exclude: [], // (its batch is the pink house's, whose centre lies in that house)
    floor: 1.4, storey: 2.8, base: 2.8, colour: C.cream, plinth: 0.35,
    parts: [
      { ring: [[519.8, -1005.4], [522.3, -1014.9], [523.6, -1014.5], [525.4, -1021.5], [526.5, -1021.2], [527.1, -1023.5], [535.5, -1021.3], [530.6, -1002.6]], top: 12.92 }
    ],
    cornice: { out: 0.3, thick: 0.55, colour: C.brown },
    shops: [
      { on: [[535.5, -1021.3], [527.1, -1023.5]], s0: 0.3, s1: 8.4, top: 7.0, fascia: 0.9, piers: C.dark, fasciaColour: C.light, canopy: { depth: 1.3, thick: 0.25, colour: C.dark, ext: [1.0, 0] }, signs: [{ key: 'bergsport', s: 4.35 }] },
      { on: [[530.6, -1002.6], [535.5, -1021.3]], s0: 6.0, s1: 19.0, top: 7.0, fascia: 0.9, piers: C.dark, fasciaColour: C.light, canopy: { depth: 1.3, thick: 0.25, colour: C.dark }, signs: [{ key: 'govertical', s: 12.5 }] }
    ],
    letters: [
      // the black panel with the yellow diamond on the north side's first floor, by the corner
      { on: [[535.5, -1021.3], [527.1, -1023.5]], s0: 0.5, s1: 3.3, y0: 7.75, y1: 9.15, key: 'fullmoons', board: C.dark }
    ],
    shopIds: ['n3287588702']
  },
  {
    // The pink house behind the Bergsport's (the 16.12 m roof of batch 7 of 11/1751/1018), set back from the Promenade.
    // 2013 from the lane west of it, 458426638775337 and 286476946308859 (from 506/−1015…−1022, looking north; filed
    // under the Freitag's in the Promenade Nord row): pale pink plaster, plain windows in rows, deep eaves on dark
    // rafters, a low pink annex on the slope. Its own photographs from the Promenade (167752498572572, 877079032839673,
    // 1175749272866636, 293696668896695) show the cream house north of it, the Bergsport's and the Hotel Dischma: the
    // pink house stands hidden behind them. The roof is the survey's flat one with a deep dark eaves slab; the
    // Rainbow's shop front on the east side (OpenStreetMap's place) and the east side's look are guessed.
    id: 'w118240614', name: 'the pink house',
    exclude: [{ x: 523.2, z: -1020.6, r: 3 }], // (batch 7: this house and the Bergsport's)
    floor: 4.4, storey: 2.8, base: 2.8, colour: C.pink, plinth: 0.35,
    parts: [
      { ring: [[526.5, -1021.2], [527.1, -1023.5], [528.4, -1028.6], [527.5, -1028.8], [529.2, -1035.1], [516.2, -1038.5], [510.9, -1017.8], [523.6, -1014.5], [525.4, -1021.5]], top: 16.12 }
    ],
    cornice: { out: 0.85, thick: 0.4, colour: C.brown },
    shops: [
      { on: [[527.5, -1028.8], [529.2, -1035.1]], s0: 0.4, s1: 6.1, top: 7.0, fascia: 0.6, piers: C.white, fasciaColour: C.grey, signs: [{ key: 'rainbow', s: 3.25 }] }
    ],
    shopIds: ['n6184778521']
  },
  {
    // The cream house on the Promenade opposite the gabled one (batch 3 of 11/1751/1019, its flat roof at 16.50), between
    // the pink house and the Freitag's. 2015 from the Promenade north of it, 167752498572572 (from 551/−1074, behind the
    // Freitag's boards on the right) and 845920932804321, and 2013 293696668896695 and 877079032839673 (from 545–548/
    // −1054…−1057, the right foreground): taupe-beige plaster, a deep dark brown eaves edge, four rows of windows over
    // the shops, an oriel with painted panels at the north end of the street side, stucco ornaments, the shops under a
    // grey metal fascia and a band of white. 338149517668548 (2014, from the north) shows the Freitag's in front of it.
    // The oriel is drawn with two storeys of glazing; the north side's lettering, the ornaments and the west side up
    // the slope are guessed.
    id: 'w118240603', name: 'the cream house',
    exclude: [{ x: 534.1, z: -1049.5, r: 3 }],
    floor: 3.8, storey: 2.6, base: 1.9, colour: C.taupe, plinth: 0.3,
    parts: [
      { ring: [[540.9, -1040.5], [543.8, -1055.1], [534.7, -1056.9], [534.9, -1057.7], [531.0, -1058.5], [530.9, -1057.7], [526.8, -1058.5], [526.1, -1054.8], [524.2, -1047.4], [533.1, -1045.7], [532.4, -1042.1]], top: 16.5 }
    ],
    cornice: { out: 0.6, thick: 0.45, colour: C.brown },
    shops: [
      { on: [[540.9, -1040.5], [543.8, -1055.1]], s0: 0.5, s1: 14.4, top: 6.4, fascia: 0.75, piers: C.grey, fasciaColour: C.grey }
    ],
    bays: [{ on: [[540.9, -1040.5], [543.8, -1055.1]], s0: 11.4, s1: 14.0, out: 0.6, floors: [9.0, 11.6], colour: [0.53, 0.46, 0.36] }]
  },
  {
    // The gabled house on the Promenade's east side (batch 9 of 11/1752/1019: the main saddle roof with its ridge at 22.0
    // and the gables to the street and the back; batch 13: the cross wing on the north with its gable at 19.5; batch 2
    // of 11/1752/1018: the bay on the south side under its own gable at 21.9; batch 24: the low annex at 7.27 north-east
    // of the wing). 2013 from the Promenade north of it, 777793176207022 (from 552/−1095), and 2015 1175749272866636 and
    // 167752498572572 (on the left, from 548–551/−1074): beige plaster, white painted surrounds round the windows and
    // white quoins, dark brown shutters, the gable on the street with three rows of windows and two small windows under
    // its top, a dark roof. The bay and the annex on the back (no photograph shows them) and the shutters' extent are
    // guessed.
    id: 'w126895388', name: 'the gabled house',
    exclude: [{ x: 568.2, z: -1037.3, r: 3 }, { x: 572.1, z: -1043.4, r: 3 }, { x: 565.1, z: -1032.7, r: 3 }, { x: 576.4, z: -1041.5, r: 3 }],
    floor: 2.7, storey: 3.2, base: -0.2, colour: C.beige, plinth: 0.45, style: STYLE.surrounds | STYLE.shutters, quoins: true,
    parts: [
      { ring: [[557.5, -1035.5], [563.3, -1046.9], [578.8, -1039.1], [573.1, -1027.7]], roofs: [0] },
      { ring: [[568.9, -1044.1], [569.7, -1045.7], [575.1, -1042.9], [574.3, -1041.3]], roofs: [1] },
      // (the bay: its outline at the ground, its cheeks reaching 4 m back under its gable)
      {
        ring: [[565.4, -1029.7], [562.5, -1031.2], [563.4, -1032.5], [565.19, -1036.08], [567.99, -1034.68], [566.2, -1031.1]],
        ground: [[565.4, -1029.7], [562.5, -1031.2], [563.4, -1032.5], [566.2, -1031.1]], roofs: [2]
      },
      { ring: [[572.7, -1044.2], [573.0, -1044.8], [580.0, -1041.7], [578.8, -1039.1], [574.3, -1041.3], [575.1, -1042.9]], top: 7.27, closed: true, colour: C.annex, style: 0 }
    ],
    roofs: [
      { a: [559.95, -1041.4], b: [576.4, -1033.15], y: 22.0, eaves: 17.5, cL: 6.82, cR: 6.82 },
      { a: [570.26, -1040.02], b: [572.6, -1044.7], y: 19.5, eaves: 17.14, cL: 3.45, cR: 3.45 },
      { a: [566.59, -1035.38], b: [563.82, -1030.18], y: 21.93, eaves: 20.4, cL: 2.0, cR: 2.0 }
    ],
    cornice: { out: 0.25, thick: 0.25, colour: C.white, parts: [3] },
    // the gable on the street: a row of windows in it and two small ones under its top
    gableWins: [
      { on: [[563.3, -1046.9], [557.5, -1035.5]], s: 4.3, y0: 16.3, y1: 17.6, w: 1.0 },
      { on: [[563.3, -1046.9], [557.5, -1035.5]], s: 8.5, y0: 16.3, y1: 17.6, w: 1.0 },
      { on: [[563.3, -1046.9], [557.5, -1035.5]], s: 5.7, y0: 19.0, y1: 19.6, w: 0.6 },
      { on: [[563.3, -1046.9], [557.5, -1035.5]], s: 7.1, y0: 19.0, y1: 19.6, w: 0.6 }
    ]
  },
  {
    // The block of flats north of it on the Promenade's east side (batch 14 of 11/1752/1019, its flat roof at 16.34 on
    // a thin eave half a metre out). 2014 from the car park north-west of it, 295302805417733 and 369462041107731 (from
    // 539/−1114, in the middle), and 2013 777793176207022 (on the left): white plaster on the north side's east part,
    // larch boards on the street side and the north side's west part, five rows of windows, the roof's edge in timber.
    // Its photographs from the north, 907719069796848 and 171617641505602, show the flats north of it (w117012269).
    // The east and south sides are guessed white.
    id: 'w126895495', name: 'the flats by the car park',
    exclude: [{ x: 569.9, z: -1070.7, r: 3 }, { x: 570.5, z: -1064.3, r: 3 }],
    floor: 1.95, storey: 2.85, base: -1.0, colour: C.white, plinth: 0.3,
    parts: [
      { ring: [[563.3, -1077.4], [569.3, -1076.32], [578.3, -1074.7], [576.4, -1064.0], [561.4, -1066.7]], top: 16.34 }
    ],
    boards: [[[561.4, -1066.7], [563.3, -1077.4]], [[563.3, -1077.4], [569.3, -1076.32]]],
    cornice: { out: 0.55, thick: 0.35, colour: [0.25, 0.14, 0.07] }
  },
  {
    // The flats north of the car park (batch 7 of 11/1752/1019, its flat roof at 15.22 a metre out over the walls).
    // 2015 and 2013 from the Promenade north of it, 267169901796065 and 171617641505602 (filed under the flats south of
    // it: on the left, from 563–567/−1138…−1159), and 2014 518249816005316 (from 539/−1114, on the left behind the
    // spruces): white plaster on the north side, larch boards on the street side with glazed loggias, five rows of
    // windows, the deep flat roof with its timber edge. 786234845347585 (from the west) and 481570759850385 look past it.
    // The loggias are left out; the east and south sides are guessed white.
    id: 'w117012269', name: 'the flats north of the car park',
    exclude: [{ x: 578.1, z: -1101.9, r: 3 }, { x: 577.2, z: -1094.5, r: 3 }],
    floor: 0.8, storey: 2.85, base: -1.5, colour: C.white, plinth: 0.3,
    parts: [
      { ring: [[569.5, -1109.3], [588.8, -1105.9], [586.7, -1094.3], [567.4, -1097.8]], top: 15.22 }
    ],
    boards: [[[567.4, -1097.8], [569.5, -1109.3]]],
    cornice: { out: 1.0, thick: 0.35, colour: [0.25, 0.14, 0.07] }
  },
  {
    // The pink house with the galleries at the north end (batch 26 of 11/1752/1019: the saddle roof, its ridge at 19.12
    // east-west and the gable on the street; batch 15: the front block over the galleries on the south, its flat roofs
    // at 16.44; batch 19: the cross gable over the front's middle, its ridge at 19.86). 2013 from the Promenade north of
    // it, 481570759850385 (filed under the flats: the house on the left, from 570/−1156): pink plaster, dark brown
    // shutters, iron grilles on the ground floor, a rubble-stone plinth, deep dark eaves; 2013 1764371860431257 (from
    // 554/−1106, on the right): the gable with its small round window and brown shutters, the dark timber galleries on
    // three storeys of the south front, the cross gable over them. 1766058460238107 (from the north, 2015) shows the
    // red-striped house north of it (w117012336) and the Meierhof. The low porch on the street, the north and east
    // sides and the galleries' detail are guessed.
    id: 'w117012153', name: 'the pink house with the galleries',
    exclude: [{ x: 582.6, z: -1140.9, r: 3 }, { x: 580.8, z: -1135.8, r: 3 }, { x: 581.3, z: -1134.8, r: 3 }],
    floor: -0.3, storey: 3.0, base: -2.4, colour: C.rose, plinth: 0.6, style: STYLE.shutters,
    parts: [
      { ring: [[573.5, -1136.3], [575.9, -1148.4], [584.0, -1147.0], [586.1, -1146.1], [591.6, -1145.3], [589.3, -1133.2], [587.1, -1133.6], [576.2, -1135.8]], roofs: [0] },
      // (the bay on the north under the roof's eaves)
      { ring: [[584.0, -1147.0], [584.3, -1148.7], [586.5, -1148.3], [586.1, -1146.1]], top: 12.74 },
      // the front block: left of the cross gable, the cross gable's, right of it
      frontPart([[575.3, -1133.2], [577.9, -1132.7]], 16.44),
      frontPart([[577.9, -1132.7], [583.9, -1131.5]], null, { roofs: [1] }),
      frontPart([[583.9, -1131.5], [586.9, -1130.9]], 16.44)
    ],
    roofs: [
      { a: [573.7, -1142.5], b: [591.4, -1139.05], y: 19.12, eaves: 13.2, cL: 7.14, cR: 7.14 },
      { a: [580.75, -1131.3], b: [582.35, -1139.3], y: 19.86, eaves: 16.68, cL: 3.4, cR: 3.4, hip: [0, 2.0] }
    ],
    cornice: { out: 0.3, thick: 0.3, colour: C.brown, parts: [1, 2, 4] },
    boards: [[[575.3, -1133.2], [577.9, -1132.7]], [[577.9, -1132.7], [583.9, -1131.5]], [[583.9, -1131.5], [586.9, -1130.9]]],
    boardColour: C.timber,
    // the galleries before the south front: a floor and a railing on each storey
    balconies: [
      { on: [[575.3, -1133.2], [586.9, -1130.9]], s0: 0.0, s1: 11.82, depth: 1.3, ys: [2.7, 5.7, 8.7, 11.7], colour: C.timber }
    ],
    gableWins: [
      { on: [[575.9, -1148.4], [573.5, -1136.3]], s: 6.17, y0: 15.6, y1: 16.4, w: 0.8 },
      { on: [[575.9, -1148.4], [573.5, -1136.3]], s: 4.67, y0: 12.6, y1: 13.9, w: 1.1 },
      { on: [[575.9, -1148.4], [573.5, -1136.3]], s: 7.67, y0: 12.6, y1: 13.9, w: 1.1 }
    ]
  }
];

// --- Roofs ----------------------------------------------------------------------------------------------------------------
/** The roof's frame (a→b), its length */
export const roofFrame = (R) => frame(R.a, R.b);
/** The ridge's ends inside the eaves' outline: [h0, h1] (0: a gable) */
export const hips = (R) => R.hip || [0, 0];
/** A roof's height (its upper face) over a world point, or null outside its outline */
export function roofY(R, x, z) {
  const F = roofFrame(R), [t, c] = local(F, x, z);
  if (t < -1e-6 || t > F.L + 1e-6 || c < -R.cL - 1e-6 || c > R.cR + 1e-6) return null;
  const drop = R.y - R.eaves;
  let y = R.y - drop * (c >= 0 ? c / R.cR : -c / R.cL);
  const [h0, h1] = hips(R);
  if (h0 > 0 && t < h0) y = Math.min(y, R.y - (drop * (h0 - t)) / h0);
  if (h1 > 0 && t > F.L - h1) y = Math.min(y, R.y - (drop * (t - (F.L - h1))) / h1);
  return y;
}
/** A roof's outline (world x, z) */
export function roofRing(R) {
  const F = roofFrame(R);
  return [at(F, 0, -R.cL), at(F, F.L, -R.cL), at(F, F.L, R.cR), at(F, 0, R.cR)];
}

/** How high a part stands at a world point (the walls' top there): its flat roof, or its roofs' highest a step under them */
export function partTop(house, part, x, z) {
  if (part.top !== undefined) return part.top;
  let y = -Infinity;
  for (const i of part.roofs) { const r = roofY(house.roofs[i], x, z); if (r !== null) y = Math.max(y, r - 0.06); }
  return Number.isFinite(y) ? y : Math.min(...part.roofs.map((i) => house.roofs[i].eaves));
}
/** The parts' outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): at the ground */
export const groundOutlines = (house) => house.parts.map((p) => p.ground || p.ring);
/** Is a point inside one of the row's houses (at the ground)? */
export const insideRow = (x, z) => HOUSES.some((h) => groundOutlines(h).some((r) => pointInRing(r, x, z)));

/**
 * A wall's frame from a segment (a, b) on a house's outline, turned so that it faces out of the house at height `y`
 * (its n leaving the parts that stand higher there)
 */
export function wallOut(house, a, b, y = -Infinity) {
  const F = wallFrame(a, b), [x, z] = onWall(F, F.len / 2, 0.4);
  return house.parts.some((p) => pointInRing(p.ring, x, z) && partTop(house, p, x, z) > y) ? wallFrame(b, a) : F;
}
/** The height a feature on a wall stands at (wallOut's y): a bay's lowest floor, a shop's top, lettering's foot */
export const featureY = (f) => (f.floors ? Math.min(...f.floors) : f.ys ? Math.min(...f.ys) : f.y0 ?? f.top ?? -Infinity);
/** The businesses whose signs the row letters itself (js/shops-data.js' osm ids) */
export const SHOP_IDS = HOUSES.flatMap((h) => h.shopIds || []);

/** Does the wall a→b run on one of the house's board-clad stretches? */
export function onBoards(house, a, b) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return (house.boards || []).some(([p, q]) => {
    const F = wallFrame(p, q), t = (m[0] - p[0]) * F.u[0] + (m[1] - p[1]) * F.u[1];
    const d = Math.abs((m[0] - p[0]) * F.n[0] + (m[1] - p[1]) * F.n[1]);
    const par = Math.abs(((b[0] - a[0]) * F.n[0] + (b[1] - a[1]) * F.n[1]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1));
    return d < 0.3 && par < 0.1 && t > -0.1 && t < F.len + 0.1;
  });
}

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // the Promenade's pavement north of the Bergsport's looking south (162245375806039's place): the Bergsport's, the
  // Hotel Dischma left
  bergsport: [541, 4.5, -1036, 530, 8.0, -1012],
  // the Promenade by the Freitag's looking south (167752498572572's place): the cream house right, the gabled one left
  gable: [551, 3.4, -1076, 548, 9.0, -1040],
  // the Promenade north of the pink house with the galleries looking south (481570759850385's place)
  galleries: [569, 0.9, -1158, 573, 6.0, -1120]
};

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
