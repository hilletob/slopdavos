// The houses along the Dischmastrasse in Davos Dorf from the Promenade (the Seehof's end) to the bend past the Talstrasse
// (js/dischma-row-a.js): fourteen houses by hand in one module, each its surveyed volumes, its roofs and its look.
// Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1752/1019, 11/1752/1020, 11/1753/1019; the batches named at each house): the
// outlines below are its walls at the ground (or its flat roofs' outlines, the walls under them), the roofs its sloped
// triangles cleaned into planes; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js; x east, z south).
// The street runs from the Promenade (577/−1206) east-south-east to the Talstrasse (644/−1171), east along z ≈ −1163,
// then south-east past the Gemsli (744/−1122). The look after Mapillary's street views (CC BY-SA, 2013–2025), each
// house's note saying which photographs show it and what is guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const STOREY = 2.9;
// a window (m over its storey's foot), its half width; the bays' spacing along a wall (scaled by a house's `bay`)
export const WIN = { lo: 0.9, hi: 2.2, half: 0.58 };
export const BAY = 2.7;

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
const rect = (F, t0, t1, c0, c1) => [at(F, t0, c0), at(F, t1, c0), at(F, t1, c1), at(F, t0, c1)].map(R2);

// --- Colours (linear) ----------------------------------------------------------------------------------------------------
export const COLOURS = {
  white: [0.6, 0.6, 0.575], cream: [0.58, 0.53, 0.42], yellow: [0.6, 0.45, 0.16], ochre: [0.6, 0.5, 0.27],
  blue: [0.3, 0.44, 0.58], salmon: [0.42, 0.25, 0.155], red: [0.5, 0.085, 0.06], grey: [0.24, 0.24, 0.235],
  beige: [0.52, 0.47, 0.37], larch: [0.27, 0.13, 0.06], logs: [0.15, 0.078, 0.04], planks: [0.2, 0.105, 0.055]
};
const C = COLOURS;
// The shutters' kinds (the walls' material draws them beside every window): none, grey-green, white, brown
export const SHUTTERS = { none: 0, grey: 1, white: 2, brown: 3 };

// --- The houses -----------------------------------------------------------------------------------------------------------
// The Peter Frei chalet's main roof frame: along its ridge (east-north-east), c towards the street (south-south-west)
const PF = frame([590.6, -1228.7], [604.4, -1225.1]);
// Flüela Garage's house: along its ridge (east)
const FG = frame([624.1, -1163.0], [636.0, -1161.9]);
// The blue house east of the Talstrasse: along its ridge (north), c east
const BH = frame([662.4, -1143.6], [664.0, -1157.7]);

/**
 * Each house: `id` (OpenStreetMap), `exclude` (swissBUILDINGS3D's batches' centres, r 3), `floor` (its storeys'
 * grid: the ground floor's foot), `base` (how far down its walls reach), `colour` (its plaster), `bands` ([yTop,
 * colour]: a colour under yTop), `shutters`, `bay` (its bays' spacing as a share of BAY), `plinth` (the grey render
 * along its foot, m over the ground), `timber` ({ from, facing?: [x, z], gables?: true }: logs or planks over `from`,
 * on the walls facing `facing` only, or in the gables only), `parts` ({ ring, top } flat-roofed; { ring, roofs: [i] }
 * under the house's pitched roofs), `roofs` ({ a, b: the ridge's ends at the verges, y: the ridge, eaves, cL, cR: how
 * far the eaves lie left and right of a→b, hip: [h0, h1] the ridge's ends inside the eaves' outline, skin }),
 * `cornice` (an eaves slab round flat roofs: { out, thick, colour, y? }), `shops`, `balconies`, `dormers`, `panels`.
 */
export const HOUSES = [
  {
    // The chalet on the corner of the Promenade (batches 18, 15, 14, 7 of 11/1752/1020). Its saddle roof (ridge y 10.0,
    // eaves 6.8) runs east-north-east; a cross gable (ridge 10.2, eaves 8.1) stands over the street, 2 m out over the
    // shop's roof, a square turret with a green pyramid roof (12.5) on its street side, a two-storey flat-roofed lean-to
    // (5.5) along its back. Photographs 2013 from the Promenade (476553546916024, 806718133303609, 1123737154812973;
    // 2015 the back behind a tree, 195091802304782): white ground floor, reddish larch over it, the balcony under the
    // cross gable, the turret's green spire. Its back and east side are guessed.
    id: 'w219436322', name: 'Peter Frei chalet',
    exclude: [{ x: 592.8, z: -1223.3, r: 3 }, { x: 597.5, z: -1226.8, r: 3 }, { x: 598.2, z: -1221.5, r: 3 }, { x: 599.1, z: -1233.6, r: 3 }],
    floor: -5.5, base: -6.0, colour: C.white, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.35,
    timber: { from: -2.6, colour: C.larch },
    parts: [
      { ring: rect(PF, 1.0, 12.9, -5.75, 6.05), roofs: [0, 1] },
      { ring: rect(PF, 1.2, 12.6, -8.2, -5.75), top: 5.5 },
      { ring: [[596.9, -1218.8], [600.2, -1218.0], [601.1, -1221.3], [597.7, -1222.2]], roofs: [2], timberAll: true }
    ],
    roofs: [
      { a: PF.o, b: at(PF, PF.L, 0), y: 10.0, eaves: 6.8, cL: 6.82, cR: 7.04, skin: 'roof' },
      { a: at(PF, 4.6, 0), b: at(PF, 4.6, 8.1), y: 10.2, eaves: 8.1, cL: 4.3, cR: 4.3, skin: 'roof' },
      // the turret: a pyramid over its square, 0.5 m out
      { a: [596.83, -1220.62], b: [601.12, -1219.53], y: 12.5, eaves: 9.1, cL: 2.25, cR: 2.25, hip: 'pyramid', skin: 'copper' }
    ],
    balconies: [{ on: [at(PF, 0.4, 6.05), at(PF, 8.8, 6.05)], floors: [3.2], depth: 1.7, rail: 'timber' }]
  },
  {
    // The shop round the chalet's west and street sides (batches 20 and 9 of 11/1752/1020). The survey has it 9 m high
    // (flat roofs at 6.0 and 4.6), but the photographs of 2013, 2015 and 2025 (476553546916024, 1123737154812973,
    // 286203292988174, 195091802304782; 1694814281205944 from the Talstrasse) show one tall storey under a flat roof:
    // its top at y 1.8 here. White piers, shop windows on the Promenade and the street, black awnings.
    id: 'w1527724574', name: 'the shop on the corner',
    exclude: [{ x: 587.5, z: -1217.8, r: 3 }, { x: 591.6, z: -1214.2, r: 3 }],
    floor: -3.6, base: -5.2, colour: C.white, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.3,
    parts: [
      { ring: [[583.2, -1211.3], [588.3, -1206.8], [590.1, -1209.1], [591.9, -1220.0], [590.04, -1222.59], [591.4, -1227.8], [586.1, -1228.7]], top: 1.8 },
      { ring: [[588.9, -1208.8], [592.1, -1208.2], [594.3, -1219.3], [591.1, -1220.2]], top: 1.8 }
    ],
    cornice: { out: 0.25, thick: 0.45, colour: [0.55, 0.55, 0.52] },
    shops: [
      { on: [[586.1, -1228.7], [583.2, -1211.3]], s0: 0.6, s1: 17.0, top: 1.8, awning: [0.025, 0.025, 0.025], piers: C.white },
      { on: [[583.2, -1211.3], [588.3, -1206.8]], s0: 0.4, s1: 6.4, top: 1.8, awning: [0.025, 0.025, 0.025], piers: C.white },
      { on: [[588.9, -1208.8], [592.1, -1208.2]], s0: 0.3, s1: 3.0, top: 1.8, awning: [0.025, 0.025, 0.025], piers: C.white }
    ]
  },
  {
    // The yellow house north of the street (batch 24 of 11/1752/1020): two flat-roofed blocks (2.5 and 1.9). In 2013
    // (286203292988174 from the Promenade, 3836329359736104, 983584738847779 from the street east of it) yellow render
    // over a grey rough plinth, white-framed windows, a dark eaves board, a dry cleaner's shop on the street. Its back
    // is guessed.
    id: 'w117012344', name: 'the yellow house',
    exclude: [{ x: 617.3, z: -1201.7, r: 3 }],
    floor: -5.0, base: -6.9, colour: C.yellow, shutters: SHUTTERS.none, bay: 1.0, plinth: 1.0,
    parts: [
      { ring: [[609.9, -1193.8], [621.0, -1187.3], [621.6, -1187.2], [624.8, -1204.4], [612.3, -1206.7]], top: 2.49 },
      { ring: [[615.4, -1206.1], [622.8, -1204.8], [624.4, -1213.2], [623.1, -1216.4], [619.6, -1214.7], [617.2, -1215.3]], top: 1.94 }
    ],
    cornice: { out: 0.6, thick: 0.3, colour: [0.07, 0.05, 0.04] },
    shops: [{ on: [[621.6, -1187.2], [609.9, -1193.8]], s0: 4.0, s1: 9.0, top: -1.3, piers: [0.5, 0.5, 0.48] }]
  },
  {
    // The white block on the Talstrasse's corner (batch 1 of 11/1752/1020): flat roof at 6.1, four storeys. In 2025
    // (1694814281205944, from the crossing) white render, regular windows, a flat roof's thin edge. The 2013 views
    // (1168372760293253, 286203292988174) show the Peter Frei chalet instead; its back is guessed.
    id: 'w117012218', name: 'the white block on the corner',
    exclude: [{ x: 636.2, z: -1206.2, r: 3 }],
    floor: -6.5, base: -7.0, colour: [0.62, 0.62, 0.6], shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[637.5, -1210.8], [642.2, -1209.9], [639.6, -1197.0], [630.2, -1198.9], [631.6, -1205.7], [630.5, -1205.9], [632.4, -1215.3], [638.1, -1214.1]], top: 6.11 }],
    cornice: { out: 0.35, thick: 0.35, colour: [0.2, 0.2, 0.2] }
  },
  {
    // The "egg" block between the Promenade and the street (batches 19 and 11 of 11/1752/1020): five storeys to 15.0
    // under a set-back top floor (17.5), a low wing along its east side (5.5). In 2013 (3875079359237003 and
    // 3955017247898652 from the Promenade, 1787939188052636 from the south, 1123737154812973 beside it) white render
    // with red panels between the windows, a red ground floor over a granite plinth, the top floor red, glass
    // balconies on its south and north ends. The east wing's look is guessed after 983584738847779.
    id: 'w117012336', name: 'the egg block',
    exclude: [{ x: 588.1, z: -1172.8, r: 3 }, { x: 585.7, z: -1176.5, r: 3 }],
    floor: -1.2, base: -4.6, colour: C.white, bands: [[1.65, C.red]], shutters: SHUTTERS.none, bay: 1.05, plinth: 0.5,
    parts: [
      { ring: [[576.9, -1161.5], [591.4, -1158.8], [594.8, -1177.3], [591.1, -1177.9], [593.6, -1192.0], [582.2, -1194.2]], top: 15.0, panels: C.red },
      { ring: null, top: 17.45, colour: C.red, setback: 1.3 },
      { ring: [[591.4, -1158.8], [593.1, -1156.3], [596.2, -1154.9], [601.9, -1186.1], [593.3, -1187.7], [591.1, -1177.9], [594.8, -1177.3]], top: 5.5 }
    ],
    cornice: { out: 0.4, thick: 0.3, colour: [0.58, 0.58, 0.56], parts: [0, 1] },
    balconies: [
      { on: [[576.9, -1161.5], [591.4, -1158.8]], s0: 4.6, s1: 9.6, floors: [1.7, 4.6, 7.5, 10.4], depth: 1.3, rail: 'glass' },
      { on: [[593.6, -1192.0], [582.2, -1194.2]], s0: 0.8, s1: 5.2, floors: [1.7, 4.6, 7.5, 10.4], depth: 1.3, rail: 'glass' }
    ]
  },
  {
    // The low house south of the street (batch 5 of 11/1752/1020): flat roof at 2.9, two storeys over a garage floor.
    // No photograph shows it clearly (the Promenade's views, 3875079359237003, show the egg block; 2504454573271590
    // the Flüela Garage): plain white with grey shutters, guessed.
    id: 'w117012251', name: 'the low house',
    exclude: [{ x: 616.1, z: -1175.0, r: 3 }],
    floor: -5.3, base: -5.9, colour: C.white, bands: [[-2.5, [0.3, 0.31, 0.32]]], shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.35,
    parts: [{ ring: [[622.0, -1170.1], [623.3, -1177.4], [610.3, -1179.8], [608.8, -1171.4], [614.4, -1170.4], [614.6, -1171.5]], top: 2.92 }],
    cornice: { out: 0.4, thick: 0.25, colour: [0.25, 0.25, 0.25] }
  },
  {
    // The Flüela Garage (batches 25 and 22 of 11/1752/1020; batch 22 also holds the small w1527724577): the house, its
    // saddle roof (ridge 7.6, eaves 4.9) running east, and the garage's flat-roofed showroom south of it (1.2) whose
    // roof is the house's terrace. 2015 from the Talstrasse (499181591437625): the white showroom with its timber-framed
    // glass doors and "FLÜELA GARAGE", the house's dark logs over a white ground floor; 2025 from the east
    // (1960580528096611, 1822755605326898, 2504454573271590): the east gable with its balcony and the garage doors.
    // The west side is guessed.
    id: 'w117012240', name: 'Flüela Garage', also: ['w1527724577'],
    exclude: [{ x: 630.1, z: -1162.6, r: 3 }, { x: 629.1, z: -1153.4, r: 3 }],
    floor: -6.4, base: -7.1, colour: C.white, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.35,
    timber: { from: -2.9, colour: C.logs, parts: [0] },
    parts: [
      { ring: rect(FG, 1.5, 10.6, -6.67, 6.59), roofs: [0] },
      { ring: [[623.7, -1146.4], [633.1, -1145.5], [634.5, -1160.4], [625.4, -1161.2]], top: 1.21, railing: [0.06, 0.06, 0.06] }
    ],
    roofs: [{ a: FG.o, b: at(FG, FG.L, 0), y: 7.6, eaves: 4.9, cL: 8.23, cR: 8.03, skin: 'roof' }],
    shops: [{ on: [[633.1, -1145.5], [634.5, -1160.4]], s0: 0.5, s1: 10.0, top: -1.9, piers: [0.3, 0.17, 0.08], fascia: C.white, sign: 'garage' }],
    balconies: [{ on: [at(FG, 10.6, 6.59), at(FG, 10.6, -6.67)], floors: [-0.6], depth: 1.1, rail: 'timber' }]
  },
  {
    // The white block north of the street past the Talstrasse (batch 21 of 11/1752/1020): flat roof at 6.9, five
    // storeys. 2013 from the Talstrasse (369055981094734): white render, square windows, grey steel balcony stacks
    // at its ends, a deep white eaves slab on brackets; 2014 and 2025 from the east (476941216720152,
    // 1442589656987364). Its north side is guessed.
    id: 'w117012154', name: 'the white block',
    exclude: [{ x: 668.8, z: -1177.0, r: 3 }],
    floor: -8.2, base: -8.8, colour: [0.62, 0.62, 0.6], shutters: SHUTTERS.none, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[670.2, -1186.5], [676.7, -1184.3], [676.4, -1183.3], [676.9, -1183.1], [671.9, -1167.7], [661.3, -1171.2], [661.5, -1171.8], [660.7, -1172.0], [662.8, -1178.7], [661.4, -1179.2], [663.4, -1185.6], [665.3, -1185.0], [665.6, -1185.9], [667.6, -1185.3], [667.8, -1185.9], [669.8, -1185.2]], top: 6.88 }],
    cornice: { out: 1.0, thick: 0.35, colour: [0.6, 0.6, 0.58] },
    balconies: [
      { on: [[660.7, -1172.0], [662.8, -1178.7]], s0: 0.3, s1: 3.0, floors: [-5.3, -2.4, 0.5, 3.4], depth: 1.4, rail: 'metal' },
      { on: [[661.4, -1179.2], [663.4, -1185.6]], s0: 3.6, s1: 6.4, floors: [-5.3, -2.4, 0.5, 3.4], depth: 1.4, rail: 'metal' },
      { on: [[676.9, -1183.1], [671.9, -1167.7]], s0: 12.6, s1: 15.6, floors: [-5.3, -2.4, 0.5, 3.4], depth: 1.4, rail: 'metal' }
    ]
  },
  {
    // The block with the balconies on the street (batch 8 of 11/1752/1020): flat roof at 7.9, a basement and four
    // storeys. 2025 from the east (2033013120765011, 1089412803283857, 1442589656987364): white render, grey roller
    // blinds, grey glass balconies along the street side; 2013 (4318230211572568) the balconies in brown timber.
    // Its north side is guessed.
    id: 'w117012232', name: 'the block with the balconies',
    exclude: [{ x: 690.9, z: -1181.7, r: 3 }],
    floor: -7.4, base: -9.0, colour: C.white, bands: [[-6.9, C.grey]], shutters: SHUTTERS.grey, bay: 0.95, plinth: 0.4,
    parts: [{ ring: [[699.3, -1172.7], [703.1, -1184.5], [682.5, -1191.2], [678.7, -1179.5], [680.0, -1179.1], [679.5, -1177.8], [697.5, -1172.0], [697.9, -1173.2]], top: 7.86 }],
    cornice: { out: 0.4, thick: 0.3, colour: [0.12, 0.07, 0.04] },
    balconies: [{ on: [[679.5, -1177.8], [697.5, -1172.0]], s0: 0.8, s1: 18.0, floors: [-4.5, -1.6, 1.3, 4.2], depth: 1.7, rail: 'glass' }]
  },
  {
    // The blue house east of the Talstrasse (batch 10 of 11/1752/1019): a saddle roof (ridge 9.7, eaves 6.5) running
    // north, gables on the street and on the south; a one-storey wing south of it (−2.2) and a timber-clad wing east of
    // it (1.0). 2021 from the Talstrasse (397042115281057, 256152569691749): the south gable in brown planks over a
    // beige ground floor, the west side light blue render, white windows; 2013 from the north-west (315623773486785)
    // the blue house with white shutters; the east wing's planks 2014 (281908223578845). The north gable is guessed.
    id: 'w117012202', name: 'the blue house',
    exclude: [{ x: 667.5, z: -1146.6, r: 3 }],
    floor: -7.4, base: -8.4, colour: C.blue, shutters: SHUTTERS.white, bay: 1.0, plinth: 0.4,
    timber: { from: -4.5, colour: C.planks, facing: [-BH.u[0], -BH.u[1]], parts: [0] },
    parts: [
      { ring: [[669.1, -1142.8], [670.8, -1156.9], [657.0, -1158.5], [655.4, -1144.4]], roofs: [0] },
      { ring: [[656.8, -1144.2], [669.2, -1143.0], [664.3, -1134.2], [655.5, -1135.4]], top: -2.18, colour: C.beige },
      { ring: [[669.2, -1143.0], [671.1, -1142.8], [679.4, -1156.7], [670.1, -1157.8]], top: 1.04, timberAll: true, closed: true }
    ],
    roofs: [{ a: at(BH, -0.5, 0), b: at(BH, BH.L + 0.5, 0), y: 9.7, eaves: 6.3, cL: 7.55, cR: 7.25, skin: 'roof' }],
    cornice: { out: 0.3, thick: 0.25, colour: [0.09, 0.05, 0.03], parts: [1, 2] },
    shops: [{ on: [[664.3, -1134.2], [655.5, -1135.4]], s0: 1.0, s1: 7.9, top: -3.4, piers: [0.5, 0.48, 0.44], blinds: true }]
  },
  {
    // Damiano's Gemsli (batch 12 of 11/1752/1019; "Ristorante Da Lino" in 2013): the house on the street (flat roof
    // 2.9) whose top floor stands over a dark eaves slab, its east part (0.6) and a one-storey annex south of it
    // (−2.8, not in OpenStreetMap). 2013 and 2014 from the street (4318230211572568, 281908223578845): warm brown
    // render, white shutters, the dark slab, the top floor cream, the terrace with its red railing over the entrance;
    // 2025 (1092968469081155) from the east. The annex's look is guessed.
    id: 'w126895355', name: "Damiano's Gemsli",
    exclude: [{ x: 689.8, z: -1138.2, r: 3 }],
    floor: -8.6, base: -9.2, colour: C.salmon, shutters: SHUTTERS.white, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[677.0, -1134.6], [681.2, -1140.9], [697.3, -1130.3], [694.8, -1122.9]], top: -2.84 },
      { ring: [[697.3, -1130.3], [702.5, -1145.1], [699.3, -1147.2], [691.0, -1134.5]], top: 0.61 },
      { ring: [[681.2, -1140.9], [689.5, -1153.6], [699.3, -1147.2], [691.0, -1134.5]], top: 2.86, bands: [[-0.25, C.salmon], [99, C.cream]] }
    ],
    cornice: { out: 0.4, thick: 0.25, colour: [0.1, 0.06, 0.035] },
    slabs: [{ part: 2, y: -0.35, out: 0.9, thick: 0.3, colour: [0.1, 0.06, 0.035] }],
    balconies: [{ on: [[689.5, -1153.6], [699.3, -1147.2]], s0: 1.0, s1: 10.6, floors: [-5.7], depth: 1.4, rail: 'red' }]
  },
  {
    // The ochre house with the tiled roof (batch 3 of 11/1752/1019): five storeys under a roof of orange tiles (ridge
    // 10.8, eaves 6.5) running north, a wall dormer in each long side (8.8, the east one flat-topped). The survey's
    // ridge reaches the gables, the 2025 photograph from the east (1092968469081155, 1274576911081959) shows hipped
    // ends: hips here. Ochre render, white windows, the dormer's two windows; a timber balcony at the north end
    // (2013, 302928337903082). The west side is guessed.
    id: 'w126895491', name: 'the ochre house',
    exclude: [{ x: 709.2, z: -1141.3, r: 3 }],
    floor: -8.4, base: -9.0, colour: C.ochre, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[702.3, -1138.2], [712.3, -1134.4], [716.1, -1144.3], [706.1, -1148.1]], roofs: [0] }],
    roofs: [{ a: [707.1, -1135.6], b: [711.5, -1146.9], y: 10.8, eaves: 6.5, cL: 6.2, cR: 6.02, hip: [2.6, 2.6], skin: 'tiles' }],
    dormers: [
      { front: [[713.3, -1137.0], [715.2, -1142.0]], inner: [[710.0, -1138.5], [711.9, -1143.5]], yF: 8.78, yI: 9.6 },
      { front: [[703.4, -1141.0], [705.3, -1146.1]], inner: [[706.9, -1139.7], [708.8, -1144.8]], yF: 8.8, yI: 9.6 }
    ],
    balconies: [{ on: [[712.3, -1134.4], [702.3, -1138.2]], s0: 2.5, s1: 8.0, floors: [-2.6, 0.3], depth: 1.2, rail: 'timber' }]
  },
  {
    // The low buildings south of the ochre house (batches 25 and 21 of 11/1752/1019): a transformer station's yellow
    // strip on the east (−3.1) and a house of two storeys (0.2). 2025 from the east (818559990582272,
    // 974373404778360, 1092968469081155): the yellow box with its grey door; the house behind it is guessed.
    id: 'w1527742201', name: 'the transformer station',
    exclude: [{ x: 712.3, z: -1132.7, r: 3 }, { x: 709.2, z: -1129.8, r: 3 }],
    floor: -8.9, base: -9.6, colour: C.cream, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.35,
    parts: [
      { ring: [[703.2, -1127.9], [706.1, -1125.7], [712.9, -1123.1], [714.3, -1126.7], [712.4, -1127.4], [715.1, -1134.3], [712.6, -1135.2], [712.3, -1134.4], [706.5, -1136.6]], top: 0.2 },
      { ring: [[712.5, -1125.0], [713.0, -1124.8], [718.6, -1139.2], [714.7, -1140.7], [712.3, -1134.4], [713.8, -1133.7], [711.1, -1126.8]], top: -3.06, colour: [0.6, 0.48, 0.24], closed: true }
    ],
    cornice: { out: 0.3, thick: 0.25, colour: [0.3, 0.3, 0.29] },
    doors: [{ on: [[713.0, -1124.8], [718.6, -1139.2]], s: 9.0, w: 1.4, colour: [0.3, 0.31, 0.32] }]
  },
  {
    // The white house past the bend (batch 24 of 11/1753/1019): two storeys over a basement under a saddle roof
    // (ridge 1.0, eaves −1.4) whose gable faces the street. 2014 from the east and the north (283816230025022,
    // 973635816776422): white render, a timber gable, a shallow roof. Its sides are guessed.
    id: 'w117012265', name: 'the white house past the bend',
    exclude: [{ x: 723.7, z: -1114.9, r: 3 }],
    floor: -7.0, base: -9.7, colour: C.white, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.4,
    timber: { from: -1.2, colour: C.larch, gables: true },
    parts: [{ ring: [[730.0, -1116.7], [720.5, -1120.6], [717.4, -1112.9], [726.9, -1109.0]], roofs: [0] }],
    roofs: [{ a: [721.6, -1110.1], b: [725.5, -1119.6], y: 1.0, eaves: -1.4, cL: 6.05, cR: 6.28, skin: 'roof' }]
  }
];

// The egg block's top floor: its outline set back from the block's
{
  const h = HOUSES.find((q) => q.id === 'w117012336');
  h.parts[1].ring = insetRing(h.parts[0].ring, h.parts[1].setback);
}

// --- Rings ----------------------------------------------------------------------------------------------------------------
/** A ring moved `d` m inwards (each edge parallel, the corners where they meet) */
export function insetRing(ring, d) {
  const R = outwardRing(ring), n = R.length, out = [];
  const lines = R.map((a, i) => { const F = wallFrame(a, R[(i + 1) % n]); return { p: onWall(F, 0, -d), u: F.u }; });
  for (let i = 0; i < n; i++) {
    const A = lines[(i + n - 1) % n], B = lines[i];
    const den = A.u[0] * B.u[1] - A.u[1] * B.u[0];
    if (Math.abs(den) < 1e-6) { out.push(B.p); continue; }
    const t = ((B.p[0] - A.p[0]) * B.u[1] - (B.p[1] - A.p[1]) * B.u[0]) / den;
    out.push(R2([A.p[0] + A.u[0] * t, A.p[1] + A.u[1] * t]));
  }
  return out;
}

/** The roof's frame (a→b), its length */
export const roofFrame = (R) => frame(R.a, R.b);
/** The ridge's ends inside the eaves' outline: [h0, h1] */
export function hips(R) {
  const L = roofFrame(R).L;
  return R.hip === 'pyramid' ? [L / 2, L / 2] : R.hip || [0, 0];
}
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
export const groundOutlines = (house) => house.parts.filter((p) => !p.setback).map((p) => p.ring);
/** Is a point inside one of the row's houses? */
export const insideRow = (x, z) => HOUSES.some((h) => groundOutlines(h).some((r) => pointInRing(r, x, z)));

/**
 * A wall's frame from a segment (a, b) on a house's outline, turned so that it faces out of the house (its n leaving
 * the parts)
 */
export function wallOut(house, a, b) {
  const F = wallFrame(a, b), [x, z] = onWall(F, F.len / 2, 0.4);
  return house.parts.some((p) => p.ring && pointInRing(p.ring, x, z)) ? wallFrame(b, a) : F;
}

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // the corner on the Promenade, where the 2013 photographs of the shop and the chalet were taken
  promenade: [571, -0.8, -1203, 600, 2.0, -1226],
  // the Talstrasse's crossing looking back west: the Flüela Garage, the yellow house, the white block on the corner
  talstrasse: [658, -5.1, -1164, 620, -2.0, -1189],
  // past the bend looking back west: the transformer, the ochre house, the blocks north of the street
  bend: [742, -6.4, -1125, 705, -1.0, -1146]
};

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
