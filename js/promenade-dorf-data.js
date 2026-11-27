// The houses along the Promenade in Davos Dorf round the Migros Dorf (js/promenade-dorf.js): five houses by hand in one
// module, each its surveyed volumes, its roofs and its look. Pure data and frame maths, shared by the browser module
// and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1752/1021): batch 15 holds the three houses east of the street together
// (w117012246, w117012272, w117012250 and the low building between the first two), batch 17 the two west of it
// (w117012353, w118240647, and the low roof between them); both are left out of the streamed tiles and rebuilt here
// whole, as is the Graubündner Kantonalbank's house north of the Coop's (batch 13 of 11/1752/1022). The outlines below are its flat roofs' outlines (the walls under them; slivers and spikes of the survey's
// rings cleaned, two triangles of one roof at 3.31 and 3.51 merged), heights in the world frame (y = m a.s.l. − 1558,
// js/davos-frame.js; x east, z south). The survey has every roof flat; the 2013 photographs show shallow hipped roofs
// on deep dark eaves over the corner house and the Hotel Isabella: hips here, their eaves at the surveyed tops.
// The Promenade runs from the Peter Frei chalet (586/−1225, js/dischma-row-a.js) north-north-east past the Migros Dorf
// (w117012298, js/migros-dorf.js); the ground falls from it to the east (−3.7 at the street, −6.1 behind the houses
// east of it) and rises west of it (up to +1.3 behind the Coop). The look after Mapillary's street views (CC BY-SA,
// 2013, 2015 and 2025), each house's note saying which photographs show it and what is guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const STOREY = 3.0;
// a window (m over its storey's foot), its half width; the bays' spacing along a wall
export const WIN = { lo: 0.9, hi: 2.2, half: 0.6 };
export const BAY = 2.6;

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
const R2 = (p) => p.map((v) => Math.round(v * 100) / 100);

/**
 * A hipped roof over a ring: its ridge along `dir` ([x, z], need not be unit) through the ring's middle, the eaves
 * `over` m out of the walls all round at `eaves`, rising `slope` m per metre to the ridge (a pyramid where the ring is
 * square enough). Returns { a, b, y, eaves, cL, cR, hip, skin } as roofY reads it.
 */
export function hipRoof(ring, dir, { eaves, slope, over = 1.0, skin = 'roof' }) {
  const F0 = frame([0, 0], dir);
  const ts = ring.map(([x, z]) => local(F0, x, z)[0]), cs = ring.map(([x, z]) => local(F0, x, z)[1]);
  const t0 = Math.min(...ts) - over, t1 = Math.max(...ts) + over, c0 = Math.min(...cs) - over, c1 = Math.max(...cs) + over;
  const cm = (c0 + c1) / 2, half = (c1 - c0) / 2, L = t1 - t0;
  const hip = Math.min(half, L / 2);
  return { a: R2(at(F0, t0, cm)), b: R2(at(F0, t1, cm)), y: eaves + slope * half, eaves, cL: half, cR: half, hip: [hip, hip], skin };
}

// --- Colours (linear) ----------------------------------------------------------------------------------------------------
export const COLOURS = {
  white: [0.6, 0.6, 0.58], cream: [0.55, 0.49, 0.37], beige: [0.5, 0.46, 0.37], ochre: [0.6, 0.5, 0.29],
  attic: [0.47, 0.47, 0.45], brown: [0.3, 0.19, 0.11], grey: [0.33, 0.33, 0.32], stone: [0.07, 0.07, 0.072],
  timber: [0.3, 0.1, 0.05], dark: [0.05, 0.05, 0.052], pilaster: [0.62, 0.61, 0.58]
};
const C = COLOURS;

// --- The houses -----------------------------------------------------------------------------------------------------------
// The corner house's main block and the Hotel Isabella: their outlines, the hipped roofs' frames from them
const CORNER_MAIN = [[592.3, -1263.5], [600.8, -1262.1], [600.7, -1261.1], [608.1, -1259.8], [605.6, -1244.6], [589.5, -1247.2]];
const ISABELLA = [[601.2, -1295.1], [618.0, -1288.4], [624.0, -1303.6], [607.2, -1310.2]];

/**
 * Each house: `id` (OpenStreetMap; null where OpenStreetMap has no building: then `key`, and `colliders`), `name`,
 * `exclude` (swissBUILDINGS3D's batches' centres, r 3; a batch holding several houses is named at the first), `floor`
 * (its storeys' grid: a storey's foot), `base` (how far down its walls reach), `colour` (its plaster), `plinth` (the
 * grey render along its foot, m over the ground), `parts` ({ ring, top } flat-roofed, { ring, roofs: [i] } under the
 * house's hipped roof; per part `colour`, `bands` ([yTop, colour]: a colour under yTop), `closed` (no windows),
 * `railing` (a terrace's railing round its roof), `quoins` ({ colour, y0, y1 }: light strips up its corners), `frieze`
 * ({ y, h }: a band round it)), `roofs` (hipRoof's), `cornice` (an eaves slab round flat roofs: { out, thick, colour,
 * parts? }), `shops` ({ on: a wall's segment, s0, s1 along it, top: the fascia's top, fascia: its height, piers, awning,
 * canopy: { depth, colour }, sign: an atlas key, signAt: 'fascia' | 'canopy' }), `balconies` (`loggia`: timber cheeks
 * up to the slab over, at most to its height), `bays` ({ on, s0, s1, out, floors }: a stack of bay windows), `letters` ({ on, s0, s1, y0, y1,
 * key }: lettering on a wall), `colliders` (the module raises its walls' colliders), `shopIds` (the businesses whose
 * signs it letters itself: js/shops-data.js' osm ids, left out of js/shops.js).
 */
export const HOUSES = [
  {
    // The corner house south of the Kindercafé (batch 15: its main block at 13.35, the kiosk on its south-west corner,
    // the wing behind it at 3.3, the building between it and the next house: on the street at 2.8–3.1, behind at 0.24;
    // the last in no OpenStreetMap building). 2013 from the Promenade's south end (1005774123292428, 849911248927631,
    // 472730944052241, 932062790948856; the Peter Frei chalet before it, js/dischma-row-a.js) and beside it
    // (135944108543551, 521224648893006, 3810821865637903): cream plaster, a shallow hipped roof on deep dark eaves,
    // balconies with red-brown timber railings on its south side, the souvenir kiosk's red-framed glass box at the
    // corner, the shops along the street under a blue awning (the "eterna" clock), the hairdresser's green awning in
    // the building between it and the next house (309088400574019). The kiosk's survey (3.51, 7 m) is not what the
    // photographs show (one storey): its roof at −0.1 here. The back and the low parts behind are guessed (cream and
    // brown after the 2025 dashcam views from the car park east of it, 1323634886003531).
    id: 'w117012246', name: 'the corner house with the kiosk',
    exclude: [{ x: 612.6, z: -1276.2, r: 3 }],
    floor: -2.6, base: -7.0, colour: C.cream, plinth: 0.35,
    parts: [
      { ring: CORNER_MAIN, roofs: [0] },
      { ring: [[589.9, -1242.6], [595.5, -1241.4], [596.4, -1246.1], [590.8, -1247.0]], top: -0.1, closed: true },
      { ring: [[606.0, -1247.0], [614.6, -1245.5], [616.7, -1258.1], [608.1, -1259.6]], top: 3.4, railing: [0.08, 0.08, 0.08] },
      { ring: [[593.5, -1263.3], [600.8, -1262.1], [600.7, -1261.1], [602.7, -1260.8], [603.4, -1262.7], [604.2, -1266.4], [594.7, -1269.0]], top: 2.9 },
      {
        ring: [[603.4, -1262.7], [604.2, -1266.4], [608.9, -1265.1], [622.4, -1261.5], [620.9, -1255.6], [616.9, -1256.6], [616.7, -1258.1], [608.1, -1259.6], [608.1, -1259.8], [602.7, -1260.8]],
        top: 0.24, colour: C.brown, railing: [0.08, 0.08, 0.08]
      }
    ],
    roofs: [hipRoof(CORNER_MAIN, [2.65, -15.75], { eaves: 13.25, slope: 0.2 })],
    cornice: { out: 0.3, thick: 0.3, colour: [0.25, 0.24, 0.23], parts: [1, 2, 3, 4] },
    shops: [
      // the shops on the street under the blue awning, the kiosk's red-framed glass on the street and on the south
      { on: [[589.5, -1247.2], [592.3, -1263.5]], s0: 0.6, s1: 15.8, top: 0.4, fascia: 0.7, piers: [0.5, 0.48, 0.44], awning: [0.04, 0.07, 0.24] },
      { on: [[590.8, -1247.0], [589.9, -1242.6]], s0: 0.15, s1: 4.35, top: -0.1, fascia: 0.5, piers: [0.5, 0.03, 0.03], fasciaColour: [0.55, 0.55, 0.53] },
      { on: [[589.9, -1242.6], [595.5, -1241.4]], s0: 0.15, s1: 5.6, top: -0.1, fascia: 0.5, piers: [0.5, 0.03, 0.03], fasciaColour: [0.55, 0.55, 0.53], band: [0.5, 0.03, 0.03] },
      // the hairdresser's (2013) in the building between the corner house and the next, its green awning
      { on: [[594.7, -1269.0], [593.5, -1263.3]], s0: 0.4, s1: 5.4, top: 0.4, fascia: 0.7, piers: [0.5, 0.48, 0.44], awning: [0.04, 0.22, 0.1] }
    ],
    balconies: [
      { on: [[589.5, -1247.2], [605.6, -1244.6]], s0: 7.4, s1: 15.6, floors: [3.4, 6.4, 9.4], depth: 1.3, rail: 'timber' }
    ]
  },
  {
    // The Kindercafé Falclas' house (batch 15: the block on the street at 8.83, the wing behind it at 3.06). The 2013
    // photographs along the street (309088400574019, 3810821865637903, 531984528162325) show it beside and beyond
    // the hairdresser's: grey-beige plaster, a flat roof's thin edge, a shop on the street; the 2025 dashcam views from
    // the car park east of it (1323634886003531) a brown storey under a terrace's railing on the wing's roof. The
    // café's front (it came after 2013) and the back's windows are guessed.
    id: 'w117012272', name: 'the Kindercafé Falclas\' house',
    exclude: [],
    floor: -2.8, base: -7.0, colour: C.beige, plinth: 0.35,
    parts: [
      { ring: [[597.1, -1279.9], [611.8, -1275.9], [608.9, -1265.1], [594.2, -1269.1]], top: 8.83 },
      { ring: [[624.6, -1260.9], [627.5, -1271.6], [611.8, -1275.9], [608.9, -1265.1]], top: 3.06, bands: [[0.2, C.brown]], railing: [0.08, 0.08, 0.08] }
    ],
    cornice: { out: 0.45, thick: 0.3, colour: [0.2, 0.19, 0.18] },
    shops: [
      { on: [[594.2, -1269.1], [597.1, -1279.9]], s0: 0.5, s1: 10.6, top: 0.2, fascia: 0.7, piers: [0.42, 0.39, 0.33], awning: [0.3, 0.06, 0.04], sign: 'falclas' }
    ],
    shopIds: ['n12839350667']
  },
  {
    // The Hotel Isabella (batch 15: the hotel at 16.04, the shops' pavilion before its south-west corner at 3.31, the
    // low buildings behind it at −0.12, 3.31 and 6.18) with the AlpäTraum and the Dorf-Drogerie on its ground floor.
    // 2015 from the Migros' square north of it (491411162210979, 324229622386109, 457410308677272): yellow-cream
    // plaster, ISABELLA on its north side, five storeys of windows over the shops (arched under the eaves), an
    // ornamented band under the top floor, white strips up its corners, a shallow hipped roof on deep dark eaves, the
    // shops' dark canopy on the street and the square; 2013 from the street south of it (531984528162325,
    // 309088400574019): timber balconies on its south-west corner, the glass pavilion before it. The arches are drawn
    // square; the low buildings behind it and the shops' signs (both came after the photographs) are guessed.
    id: 'w117012250', name: 'Hotel Isabella',
    exclude: [],
    floor: -2.4, base: -7.0, colour: C.ochre, plinth: 0.4,
    parts: [
      { ring: ISABELLA, roofs: [0], quoins: { colour: C.pilaster, y0: 0.6 }, frieze: { y: 12.3, h: 0.45, colour: [0.42, 0.33, 0.17] } },
      { ring: [[606.1, -1281.9], [610.0, -1291.6], [601.8, -1294.8], [598.0, -1285.2]], top: 3.31 },
      {
        ring: [[618.0, -1288.4], [618.5, -1289.7], [627.6, -1286.1], [630.4, -1293.3], [632.4, -1298.2], [634.5, -1297.3], [636.0, -1294.4], [631.3, -1282.3], [629.8, -1282.8], [625.6, -1272.1], [611.8, -1275.9], [607.3, -1277.1], [609.0, -1281.4], [606.3, -1282.4], [610.0, -1291.6]],
        top: -0.12, colour: C.cream
      },
      { ring: [[618.5, -1289.7], [627.6, -1286.1], [630.4, -1293.3], [621.4, -1296.9]], top: 3.31, colour: C.cream },
      { ring: [[623.4, -1302.0], [632.5, -1298.4], [630.5, -1293.3], [621.4, -1296.9]], top: 6.18, colour: C.cream }
    ],
    roofs: [hipRoof(ISABELLA, [16.8, 6.7], { eaves: 15.85, slope: 0.2 })],
    cornice: { out: 0.35, thick: 0.3, colour: [0.55, 0.55, 0.52], parts: [1, 2, 3, 4] },
    shops: [
      // the hotel's shops on the street and on the square under the dark canopy, the pavilion's glass
      { on: [[601.2, -1295.1], [607.2, -1310.2]], s0: 0.6, s1: 15.6, top: 0.6, fascia: 0.6, piers: [0.55, 0.54, 0.5], canopy: { depth: 1.6, colour: [0.06, 0.06, 0.065] }, sign: 'drogerie', signAt: 'canopy' },
      { on: [[607.2, -1310.2], [624.0, -1303.6]], s0: 7.4, s1: 17.4, top: 0.6, fascia: 0.6, piers: [0.55, 0.54, 0.5], canopy: { depth: 1.6, colour: [0.06, 0.06, 0.065] } },
      { on: [[598.0, -1285.2], [601.8, -1294.8]], s0: 0.3, s1: 10.0, top: 0.6, fascia: 0.5, piers: [0.3, 0.31, 0.32], fasciaColour: [0.6, 0.6, 0.58], sign: 'alpatraum' },
      { on: [[606.1, -1281.9], [598.0, -1285.2]], s0: 0.3, s1: 8.4, top: 0.6, fascia: 0.5, piers: [0.3, 0.31, 0.32], fasciaColour: [0.6, 0.6, 0.58] }
    ],
    balconies: [
      { on: [[601.2, -1295.1], [618.0, -1288.4]], s0: 0.5, s1: 4.6, floors: [3.6, 6.6, 9.6, 12.6], depth: 1.2, rail: 'timber' }
    ],
    letters: [{ on: [[607.2, -1310.2], [624.0, -1303.6]], s0: 10.6, s1: 16.4, y0: 0.74, y1: 1.38, key: 'isabella' }],
    shopIds: ['n6168841600', 'n6184701958']
  },
  {
    // The Drogeriemarkt Müller (batch 17, 6 % inside its footprint: the batch holds the Coop's house north of it too;
    // its part: the house at 6.30, the shop's front along the street and round the south corner at 3.52, the low roof
    // between it and the Coop at 1.79). 2013 from the street south of it (309088400574019, 531984528162325,
    // 3810821865637903, 135944108543551): white plaster, the shop's glass under a deep dark canopy along the street, a
    // storey of windows over it, a flat roof's dark edge; the orange Müller sign on its pole by the street (here on the
    // canopy). Its back up the slope is guessed.
    id: 'w117012353', name: 'Drogeriemarkt Müller',
    exclude: [{ x: 589.4, z: -1322.5, r: 3 }],
    floor: -3.4, base: -4.6, colour: C.white, plinth: 0.3,
    parts: [
      { ring: [[573.0, -1306.5], [575.8, -1313.3], [578.8, -1312.2], [585.1, -1328.1], [595.1, -1320.6], [585.8, -1297.2]], top: 6.3 },
      { ring: [[589.0, -1296.4], [590.0, -1296.9], [590.8, -1297.6], [598.9, -1318.0], [595.1, -1320.6], [585.8, -1297.2], [586.5, -1296.5], [586.8, -1296.4], [587.8, -1296.3], [588.8, -1296.4]], top: 3.52 },
      { ring: [[598.5, -1318.3], [599.2, -1320.2], [588.0, -1328.8], [587.1, -1326.5], [593.5, -1321.7]], top: 1.79, colour: C.grey, closed: true }
    ],
    cornice: { out: 0.4, thick: 0.4, colour: [0.06, 0.06, 0.065] },
    shops: [
      { on: [[590.8, -1297.6], [598.9, -1318.0]], s0: 0.4, s1: 21.6, top: 0.4, fascia: 1.1, piers: [0.55, 0.55, 0.53], canopy: { depth: 2.2, colour: [0.06, 0.06, 0.065] }, sign: 'muller', signAt: 'canopy' }
    ],
    shopIds: ['n2285973921']
  },
  {
    // The Coop Pronto's house, Haus Tafaas (batch 17, its part: the house at 13.69, its front on the street at 10.84,
    // the shop's wing round its east side at 3.08). 2015 from the Migros' square north-east of it (491411162210979,
    // 324229622386109, 919982372110327, 157142276258070): yellow-cream plaster over the shop, white strips up its
    // corners and a white cornice on brackets, "Haus Tafaas" between its windows, a top floor clad in light grey
    // panels under a white eaves; the shop's wing in dark slate with the orange "coop" and a white fascia, glass on the
    // street and at its corner on the square (the ground rises along its north side up the slope). The 2013 views from
    // the east (155500119840642, 3021226718109999) show the Graubündner Kantonalbank's house north of it,
    // 457410308677272 the house wrapped for its building works. The shop's wing is 7 m high in the survey (one storey
    // and its white fascia in the photographs: its fascia deep here). Its back up the slope is guessed.
    id: 'w118240647', name: 'the Coop Pronto\'s house',
    exclude: [],
    floor: -3.9, base: -4.6, colour: C.ochre, plinth: 0.35,
    parts: [
      {
        ring: [[593.4, -1328.3], [600.0, -1336.9], [585.8, -1347.8], [584.3, -1345.8], [581.7, -1347.8], [573.4, -1337.0], [578.5, -1333.1], [579.6, -1334.6], [585.8, -1329.8], [587.0, -1331.3], [588.4, -1330.3], [589.3, -1331.5]],
        top: 13.69, colour: C.attic, bands: [[10.9, C.ochre]], quoins: { colour: C.pilaster, y1: 10.9 }
      },
      { ring: [[600.0, -1336.9], [593.5, -1328.5], [596.4, -1326.2], [600.2, -1331.2], [599.2, -1332.0], [602.0, -1335.6]], top: 10.84, quoins: { colour: C.pilaster } },
      {
        ring: [[588.4, -1330.3], [589.3, -1331.5], [593.4, -1328.3], [593.5, -1328.5], [596.4, -1326.2], [600.2, -1331.2], [599.2, -1332.0], [602.0, -1335.6], [600.0, -1336.9], [595.8, -1340.2], [586.5, -1347.3], [587.5, -1348.6], [605.9, -1334.4], [599.7, -1319.8], [586.2, -1330.2], [587.0, -1331.3]],
        top: 3.08, colour: C.white, bands: [[1.6, C.stone]], closed: true
      }
    ],
    cornice: { out: 0.6, thick: 0.35, colour: C.white, parts: [0, 1] },
    shops: [
      { on: [[605.9, -1334.4], [599.7, -1319.8]], s0: 0.6, s1: 14.6, top: 0.4, fascia: 0.3, piers: [0.1, 0.1, 0.105], fasciaColour: [0.1, 0.1, 0.105] },
      { on: [[587.5, -1348.6], [605.9, -1334.4]], s0: 0.4, s1: 3.0, top: 0.4, fascia: 0.3, piers: [0.1, 0.1, 0.105], fasciaColour: [0.1, 0.1, 0.105] }
    ],
    letters: [
      { on: [[587.5, -1348.6], [605.9, -1334.4]], s0: 3.6, s1: 7.2, y0: -1.25, y1: -0.05, key: 'coop' },
      { on: [[600.0, -1336.9], [585.8, -1347.8]], s0: 3.0, s1: 7.0, y0: 7.55, y1: 8.3, key: 'tafaas' }
    ],
    shopIds: ['n1086729125']
  },
  {
    // The Graubündner Kantonalbank's house in Davos Dorf, north of the Coop's across the lane (batch 13 of tile
    // 11/1752/1022: the house at 11.52, the low shop's wing on its north-east side at 2.53; OpenStreetMap has no
    // building here, so js/buildings.js raises no walls: the module returns its walls' colliders). 2013 from the
    // Promenade east of it (155500119840642, 3021226718109999; their bearings, 290–293° from 632/−1338, run along its
    // east front, the Coop's house far left out of the frame): a white block of four floors over the ground floor,
    // brown-framed bay windows stacked at the front's south end, timber-framed loggias at its north end, deep dark
    // eaves, the bank's glass under a white fascia with "Graubündner Kantonalbank" in plain letters; 2015 from the
    // north-east (919982372110327) the same front behind the low shop's wing (by then a watch shop's). The sides and
    // the back up the slope are guessed.
    id: null, key: 'gkb-dorf', name: 'the Graubündner Kantonalbank\'s house',
    exclude: [{ x: 608.1, z: -1363.2, r: 3 }],
    floor: -3.0, base: -4.2, colour: [0.62, 0.62, 0.6], plinth: 0.35,
    parts: [
      { ring: [[603.0, -1370.0], [604.0, -1372.1], [607.1, -1370.5], [606.3, -1368.4], [614.8, -1364.4], [608.9, -1349.8], [592.2, -1356.6], [598.4, -1371.8]], top: 11.52 },
      { ring: [[606.3, -1368.4], [614.8, -1364.4], [617.8, -1362.3], [623.9, -1373.2], [617.3, -1376.9], [614.4, -1370.3], [608.2, -1373.3], [607.1, -1370.5]], top: 2.53, closed: true }
    ],
    cornice: { out: 1.1, thick: 0.4, colour: [0.11, 0.065, 0.035], parts: [0] },
    shops: [
      // the bank's glass on the Promenade under its white fascia, the wing's shop beside it
      { on: [[614.8, -1364.4], [608.9, -1349.8]], s0: 0.5, s1: 15.2, top: 0.6, fascia: 0.6, piers: [0.6, 0.6, 0.58], fasciaColour: [0.64, 0.64, 0.62], sign: 'gkb' },
      { on: [[617.8, -1362.3], [623.9, -1373.2]], s0: 0.5, s1: 12.0, top: 0.2, fascia: 0.5, piers: [0.6, 0.6, 0.58], fasciaColour: [0.64, 0.64, 0.62] }
    ],
    // the bay windows' stack at the front's south end, the loggias at its north end
    bays: [{ on: [[614.8, -1364.4], [608.9, -1349.8]], s0: 1.0, s1: 4.4, out: 0.6, floors: [0, 3, 6, 9] }],
    balconies: [{ on: [[614.8, -1364.4], [608.9, -1349.8]], s0: 9.6, s1: 14.8, floors: [3, 6, 9], depth: 1.0, rail: 'timber', loggia: 11.4 }],
    colliders: true
  }
];

// --- Roofs ----------------------------------------------------------------------------------------------------------------
/** The roof's frame (a→b), its length */
export const roofFrame = (R) => frame(R.a, R.b);
/** The ridge's ends inside the eaves' outline: [h0, h1] */
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
/** The parts' outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): every part reaches the ground */
export const groundOutlines = (house) => house.parts.map((p) => p.ring);
/** Is a point inside one of the row's houses? */
export const insideRow = (x, z) => HOUSES.some((h) => groundOutlines(h).some((r) => pointInRing(r, x, z)));

/**
 * A wall's frame from a segment (a, b) on a house's outline, turned so that it faces out of the house at height `y`
 * (its n leaving the parts that stand higher there: a balcony over a lower part before the wall faces that way)
 */
export function wallOut(house, a, b, y = -Infinity) {
  const F = wallFrame(a, b), [x, z] = onWall(F, F.len / 2, 0.4);
  return house.parts.some((p) => pointInRing(p.ring, x, z) && partTop(house, p, x, z) > y) ? wallFrame(b, a) : F;
}
/** The height a feature on a wall stands at (wallOut's y): a balcony's lowest floor, a shop's top, lettering's foot */
export const featureY = (f) => (f.floors ? Math.min(...f.floors) : f.y0 ?? f.top);
/** The businesses whose signs the row letters itself (js/shops-data.js' osm ids) */
export const SHOP_IDS = HOUSES.flatMap((h) => h.shopIds || []);

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // the Promenade by the Peter Frei chalet looking north: the corner house with the kiosk, the Falclas, the Isabella
  south: [583, -1.3, -1226, 600, 4.0, -1268],
  // the Promenade east of the bank, where the 2013 photographs were taken: its front, the Coop's house left of it
  bank: [632, -2.2, -1338, 606, 4.0, -1360],
  // the Migros' square looking back south-south-west: the Isabella's north side, the Coop's wing and Haus Tafaas
  square: [615, -1.8, -1352, 597, 4.0, -1318],
  // the car park east of the houses (the 2025 dashcam views): the backs, the terraces, the Isabella's hip
  carPark: [672, -4.4, -1316, 615, 2.0, -1278]
};

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
