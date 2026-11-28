// The houses along the Promenade in Davos Platz west of the Pauluskirche, from the fire station (Stützpunkt Feuerwehr)
// past the Club Hotel to the Krematorium and on to the bend past the Spital (js/promenade-west.js): twenty-one houses by
// hand in one module, each its surveyed volumes, its roofs and its look. Pure data and frame maths, shared by the
// browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1740/999 to 11/1743/1005; the batches named at each house): the outlines below are
// its flat roofs' outlines or its walls at the ground, the pitched roofs its sloped triangles cleaned into planes (the
// ridge's ends and a point on each eave); heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js; x east,
// z south). The look after Mapillary's street views (CC BY-SA, 2014–2026), each house's note saying which photographs
// show it and what is guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const STOREY = 2.9;
// a window (m over its storey's foot), its half width; the bays' spacing along a wall (scaled by a house's `bay`)
export const WIN = { lo: 0.9, hi: 2.2, half: 0.58 };
export const BAY = 2.7;

// --- Frames --------------------------------------------------------------------------------------------------------------
/** A frame along a→b: o = a, u the unit along, n = (−u.z, u.x), L */
export function frame(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  const u = [dx / L, dz / L];
  return { o: a, u, n: [-u[1], u[0]], L };
}
/** World [x, z] of (t, c) in a frame */
export const at = (F, t, c) => [F.o[0] + F.u[0] * t + F.n[0] * c, F.o[1] + F.u[1] * t + F.n[1] * c];
/** (t, c) of a world point in a frame */
export const local = (F, x, z) => { const dx = x - F.o[0], dz = z - F.o[1]; return [dx * F.u[0] + dz * F.u[1], dx * F.n[0] + dz * F.n[1]]; };
// (a ring without the survey's near-duplicate corners)
const clean = (ring) => ring.filter((p, i) => { const q = ring[(i + ring.length - 1) % ring.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.3; });

// --- Colours (linear) ----------------------------------------------------------------------------------------------------
export const COLOURS = {
  white: [0.6, 0.6, 0.575], cream: [0.56, 0.52, 0.42], sand: [0.47, 0.45, 0.34], salmon: [0.58, 0.37, 0.25],
  peach: [0.55, 0.43, 0.33], beige: [0.5, 0.47, 0.38], rose: [0.5, 0.31, 0.26], pink: [0.56, 0.4, 0.38],
  stone: [0.4, 0.39, 0.36], grey: [0.36, 0.36, 0.345], greige: [0.5, 0.45, 0.41], concrete: [0.4, 0.4, 0.38],
  larch: [0.24, 0.12, 0.055], planks: [0.2, 0.105, 0.055]
};
const C = COLOURS;
// The shutters' kinds (the walls' material draws them beside every window): none, grey-green, white, brown
export const SHUTTERS = { none: 0, grey: 1, white: 2, brown: 3 };

/**
 * Each house: `id` (OpenStreetMap), `exclude` (swissBUILDINGS3D's batches' centres, r 3; [] for a house another house's
 * batch holds, `heldBy`), `floor` (its storeys' grid: the ground floor's foot, the survey's lowest ground), `base` (how
 * far down its walls reach), `colour`, `shutters`, `bay` (its bays' spacing as a share of BAY), `plinth` (the grey
 * render along its foot, m over the ground), `timber` ({ from, facing?: [x, z], parts?: [i], colour? }: planks over
 * `from`), `parts` ({ ring, top } flat-roofed, `closed` without windows; { ring, roofs: [i] } under the house's pitched
 * roofs), `roofs` ({ a, b: the ridge's ends at the verges, y: the ridge, left / right: a point on each eave [x, z, y];
 * prepared below into cL, cR, eL, eR), `cornice` (an eaves slab round the flat roofs: { out, thick, colour }), `shops`
 * ({ on: [a, b] a wall's corners, s0, s1 along it, rise: the fascia's top over the highest ground there, sign: an
 * atlas key }), `garages` ({ on, s0, s1, n doors, h, colour }), `balconies` ({ on, s0?, s1?, floors, depth, rail }),
 * `decals` ({ on, s0, s1, y0, y1, key }).
 */
export const HOUSES = [
  {
    // The block on the corner north of the fire station (batch 20 of 11/1743/1005): flat roof at 9.7, four storeys
    // over the street. 2015 from the Promenade's crossing (200493045281464, 470975867480556 north of it): sand-coloured
    // render, white windows in three rows, a dark broad eave. Its back is guessed.
    id: 'w97292460', name: 'the sand block on the corner',
    exclude: [{ x: -832.1, z: 462, r: 3 }],
    floor: -2.8, base: -3.4, colour: C.sand, shutters: SHUTTERS.none, plinth: 0.4,
    parts: [{ top: 9.73, ring: [[-835.2, 448.7], [-837.6, 452.6], [-838.9, 451.8], [-840.9, 455.2], [-839.8, 455.8], [-845.5, 465.1], [-841.2, 467.7], [-841.8, 468.6], [-838.0, 471.0], [-837.4, 470.1], [-829.0, 475.3], [-818.9, 458.8]] }],
    cornice: { out: 0.6, thick: 0.3, colour: [0.08, 0.06, 0.05] }
  },
  {
    // The salmon house of the Claro shop (batch 13 of 11/1743/1005): flat roof at 11.7. 2015 (200493045281464,
    // 470975867480556, 511156299911581 on its west side): salmon render, white windows, the broad dark eave, the shop
    // on the street with its red-framed windows. Its east and north sides are guessed.
    id: 'w97292407', name: 'the Claro house', shopIds: ['n13052134734'],
    exclude: [{ x: -797, z: 460.8, r: 3 }],
    floor: -5.58, base: -6.2, colour: C.salmon, shutters: SHUTTERS.none, plinth: 0.4,
    parts: [{ top: 11.66, ring: [[-804.0, 465.7], [-806.9, 463.9], [-805.7, 462.0], [-806.8, 461.2], [-800.3, 450.9], [-787.1, 459.1], [-793.6, 469.4], [-794.2, 469.1], [-795.3, 470.8], [-798.5, 468.9], [-799.2, 469.9], [-804.5, 466.6]] }],
    cornice: { out: 0.7, thick: 0.3, colour: [0.08, 0.06, 0.05] },
    shops: [{ on: [[-806.8, 461.2], [-800.3, 450.9]], s0: 1.2, s1: 11.0, rise: 3.3, piers: [0.42, 0.06, 0.04], sign: 'claro' }]
  },
  {
    // The low block behind the Claro house (batch 16 of 11/1743/1005): flat roof at 3.6. No photograph shows it (it
    // stands behind the Claro house from every place they were taken): plain light render, guessed.
    id: 'w97292428', name: 'the low block',
    exclude: [{ x: -811.9, z: 478.8, r: 3 }],
    floor: -4.27, base: -4.9, colour: C.greige, shutters: SHUTTERS.none, plinth: 0.4,
    parts: [{ top: 3.58, ring: [[-809.8, 469.2], [-819.7, 484.9], [-814.0, 488.5], [-804.1, 472.8]] }],
    cornice: { out: 0.3, thick: 0.25, colour: [0.3, 0.3, 0.29] }
  },
  {
    // The block with the white shutters (batch 12 of 11/1743/1005): five storeys to 14.3, a lower strip along its east
    // side (11.7), a porch (2.7). 2015 (213328060219140 from the street east of it, 511156299911581): beige-grey render,
    // white louvred shutters at every window, a plain eave. Its west side is guessed.
    id: 'w97292351', name: 'the block with the white shutters',
    exclude: [{ x: -847.7, z: 489.4, r: 3 }],
    floor: -2.8, base: -3.4, colour: C.beige, shutters: SHUTTERS.white, plinth: 0.5,
    parts: [
      { top: 14.35, ring: [[-838.6, 483.9], [-851.6, 476.2], [-853.7, 479.8], [-852.2, 480.6], [-860.1, 493.8], [-848.6, 500.7]] },
      { top: 11.65, ring: [[-838.6, 483.9], [-848.6, 500.7], [-845.3, 502.7], [-835.3, 485.9]] },
      { top: 2.72, closed: true, ring: [[-837.6, 480.3], [-839.4, 483.4], [-840.3, 482.9], [-843.6, 480.9], [-841.8, 477.8]] }
    ],
    cornice: { out: 0.4, thick: 0.25, colour: [0.5, 0.5, 0.48] }
  },
  {
    // The house of the GanzHeis bakery (batch 23 of 11/1743/1005): flat roof at 12.0, five storeys. 2015
    // (213328060219140, 511156299911581, 470975867480556, all from the street north of it): warm peach render, a flat
    // roof's thin edge, the corner balconies. The bakery's front on the street (west) after OpenStreetMap; its look and
    // the back are guessed.
    id: 'w97292464', name: 'the GanzHeis house', shopIds: ['n1126920107'],
    exclude: [{ x: -819.9, z: 500.1, r: 3 }],
    floor: -5.51, base: -6.1, colour: C.peach, shutters: SHUTTERS.none, plinth: 0.4,
    parts: [{ top: 11.98, ring: [[-816.6, 492.2], [-816.9, 492.7], [-819.8, 490.9], [-820.2, 491.6], [-823.0, 489.8], [-830.8, 502.2], [-830.1, 504.2], [-827.8, 505.7], [-826.8, 505.3], [-823.2, 507.7], [-823.3, 508.5], [-820.4, 510.3], [-819.0, 510.5], [-818.8, 509.5], [-817.0, 509.6], [-809.1, 496.9]] }],
    cornice: { out: 0.35, thick: 0.25, colour: [0.5, 0.48, 0.45] },
    shops: [{ on: [[-823.0, 489.8], [-830.8, 502.2]], s0: 2.5, s1: 12.0, rise: 3.2, piers: [0.36, 0.16, 0.09], sign: 'ganzheis' }]
  },
  {
    // The fire station, Stützpunkt Feuerwehr Davos (batches 16 and 6 of 11/1743/1004): the three-storey block (12.7)
    // and the low hall (5.3) along its south-west side. 2014 and 2015 (491246498695018, 2925836100992598 from the road
    // north-west of it; 1152132025272862, 829866654549078 from the north-east): white render under broad flat eaves,
    // dark windows, the red doors of the engines' bays towards the road. The doors' number and the hall's south side
    // are guessed.
    id: 'w97292427', name: 'Stützpunkt Feuerwehr Davos',
    exclude: [{ x: -861, z: 582.2, r: 3 }, { x: -853.3, z: 571.8, r: 3 }],
    floor: -5.08, base: -5.7, colour: C.white, shutters: SHUTTERS.none, plinth: 0.4,
    parts: [
      { top: 12.66, ring: [[-846.5, 586.4], [-856.8, 580.3], [-856.1, 579.1], [-863.8, 574.5], [-864.5, 575.7], [-869.5, 572.7], [-860.2, 557.2], [-837.2, 570.9]] },
      { top: 5.34, ring: [[-848.3, 584.8], [-861.9, 577.2], [-861.2, 576.1], [-864.3, 574.3], [-865.7, 574.7], [-871.0, 571.5], [-875.2, 578.7], [-851.3, 593.0], [-846.9, 585.6]] }
    ],
    cornice: { out: 0.9, thick: 0.35, colour: [0.55, 0.55, 0.53] },
    garages: [
      { on: [[-869.5, 572.7], [-860.2, 557.2]], s0: 1.5, s1: 16.5, n: 3, h: 4.0, colour: [0.5, 0.05, 0.035] },
      { on: [[-871.0, 571.5], [-875.2, 578.7]], s0: 1.2, s1: 7.0, n: 1, h: 4.0, colour: [0.5, 0.05, 0.035] }
    ]
  },
  {
    // The block of flats south of the fire station (batch 21 of 11/1743/1004): seven storeys to 15.7 over the road,
    // the low wing (4.9) to the west. 2015 and 2021–2026 (465091361273875 from the north; 913375872600023,
    // 504709460550696, 2131631100760214 from the south-west): white render, dark windows in bands, a thin flat roof's
    // edge. The balconies of its south front are left out.
    id: 'w97292440', name: 'the white block of flats',
    exclude: [{ x: -882.1, z: 606.5, r: 3 }],
    floor: -5.97, base: -6.6, colour: C.white, shutters: SHUTTERS.none, plinth: 0.4,
    parts: [
      { top: 15.68, ring: [[-888.2, 607.8], [-888.9, 606.1], [-885.4, 604.0], [-886.8, 602.3], [-884.8, 599.5], [-886.0, 598.4], [-885.3, 597.7], [-883.1, 595.2], [-881.8, 593.2], [-880.5, 594.0], [-880.0, 593.4], [-867.8, 601.8], [-866.5, 603.4], [-869.4, 606.8], [-868.9, 607.2], [-872.5, 609.9], [-872.2, 610.6], [-875.9, 612.9], [-875.6, 613.6], [-879.5, 615.4], [-879.4, 616.0], [-883.3, 617.5], [-883.3, 618.2], [-887.5, 618.8], [-887.6, 619.3], [-891.8, 619.6], [-891.8, 620.3], [-896.9, 619.7], [-896.8, 618.6], [-897.4, 618.7], [-896.9, 609.6], [-893.3, 609.1], [-889.5, 608.5]] },
      { top: 4.93, ring: [[-884.0, 597.0], [-888.0, 597.5], [-893.9, 606.0], [-893.8, 609.7], [-893.3, 609.1], [-889.5, 608.5], [-888.2, 607.8], [-888.9, 606.1], [-885.4, 604.0], [-886.8, 602.3], [-884.8, 599.5], [-886.0, 598.4], [-885.3, 597.7]] }
    ],
    cornice: { out: 0.3, thick: 0.3, colour: [0.45, 0.45, 0.44] }
  },
  {
    // The white office block on the Promenade (batch 9 of 11/1742/1003): four storeys to 13.1 on its east end, a low
    // hall (4.3) to the west; the batch holds the small house west of it too (2.7, w1530258238, next entry). 2015 from
    // the north-east (228575902376584, 129074215882641: white render, dark windows, the firm's lettering at the door)
    // and 2021 from the south-west (154606936827127, 436216124413264: the hall's plain white walls).
    id: 'w219457241', name: 'the white office block',
    exclude: [{ x: -990.3, z: 704.9, r: 3 }],
    floor: -7.69, base: -8.3, colour: C.white, shutters: SHUTTERS.none, plinth: 0.4,
    parts: [
      { top: 13.12, ring: [[-988.8, 688.2], [-995.1, 694.1], [-979.4, 711.2], [-965.7, 698.6], [-978.5, 684.7], [-985.8, 691.4]] },
      { top: 4.28, ring: [[-1005.8, 710.3], [-991.9, 697.5], [-979.4, 711.2], [-976.7, 708.7], [-975.9, 709.6], [-992.5, 724.8]] }
    ],
    cornice: { out: 0.3, thick: 0.3, colour: [0.45, 0.45, 0.44] }
  },
  {
    // The small house west of the office block, inside its batch 9 (flat roof at 2.7). The 2021 photographs show it
    // behind a hedge: a plain grey box, guessed.
    id: 'w1530258238', name: 'the small grey house', heldBy: 'w219457241',
    exclude: [],
    floor: -7.69, base: -8.3, colour: C.grey, shutters: SHUTTERS.none, plinth: 0.3,
    parts: [{ top: 2.69, ring: [[-1004.0, 708.6], [-1014.8, 718.6], [-1010.5, 723.4], [-1001.4, 715.0]] }],
    cornice: { out: 0.3, thick: 0.25, colour: [0.25, 0.25, 0.24] }
  },
  {
    // The big chalet (batch 4 of 11/1742/1003): its broad gable to the south, the ridge at 13.6 running north, the
    // eaves at 8.1 and 8.6. 2015 from the south (378474570019915, 4050544128375765) and the north-east
    // (1170325263418738, 3153280134917796): white render on two floors, brown planks over them, timber balconies across
    // the south gable on three floors. Its north side is guessed.
    id: 'w122816773', name: 'the big chalet',
    exclude: [{ x: -1068.4, z: 725.4, r: 3 }],
    floor: -3.17, base: -3.8, colour: C.white, shutters: SHUTTERS.brown, plinth: 0.4,
    timber: { from: 2.63, colour: C.larch },
    parts: [{ ring: [[-1080.3, 722.5], [-1059.2, 717.8], [-1056.6, 728.5], [-1067.3, 730.8], [-1077.7, 733.0]], roofs: [0] }],
    roofs: [{ a: [-1070.0, 719.2], b: [-1066.9, 731.7], y: 13.6, left: [-1058.4, 716.6, 8.1], right: [-1081.5, 721.8, 8.6] }],
    balconies: [{ on: [[-1056.6, 728.5], [-1077.7, 733.0]], s0: 2.0, s1: 19.5, floors: [2.63, 5.53, 8.43], depth: 1.4, rail: 'timber' }]
  },
  {
    // The house of the bico shop (batches 16, 9, 8, 5 and 3 of 11/1741/1002): flat roofs from 6.4 to 12.8 round a
    // pitched south wing (ridge 10.8). 2015 (1291354487924626, 464950261493534 from the north-east; 313035656877850,
    // 468287817816770 from the south): cream render, brown shutters, brown planks on the upper floors of its north
    // blocks, the shop's windows with the bico lettering on its north-east corner. The batch 9 holds the pink house south
    // of it too (next entry). The west wing's look is guessed.
    id: 'w219457242', name: 'the bico house',
    exclude: [{ x: -1127.5, z: 781.4, r: 3 }, { x: -1109.1, z: 788.1, r: 3 }, { x: -1133.9, z: 792.7, r: 3 }, { x: -1131.4, z: 799.6, r: 3 }, { x: -1120, z: 796.3, r: 3 }],
    floor: -5.81, base: -6.4, colour: C.cream, shutters: SHUTTERS.brown, plinth: 0.4,
    timber: { from: 4.34, parts: [0, 3], colour: C.larch },
    parts: [
      { top: 9.91, ring: [[-1119.3, 775.1], [-1125.6, 787.2], [-1126.5, 786.7], [-1129.1, 791.6], [-1135.1, 788.5], [-1126.6, 771.2]] },
      { top: 6.42, ring: [[-1109.4, 796.6], [-1109.5, 795.7], [-1112.7, 794.0], [-1105.6, 780.5], [-1105.1, 780.8], [-1101.8, 774.6], [-1107.1, 771.8], [-1106.9, 771.4], [-1093.0, 778.8], [-1101.6, 795.0], [-1106.6, 792.4], [-1108.1, 795.3], [-1108.7, 795.0]] },
      { top: 7.01, ring: [[-1117.4, 777.8], [-1119.9, 776.4], [-1119.3, 775.1], [-1125.6, 787.2], [-1122.2, 789.0], [-1121.8, 788.1], [-1114.2, 792.1], [-1114.7, 792.9], [-1112.7, 794.0], [-1105.6, 780.5], [-1108.7, 778.9], [-1113.2, 787.4], [-1120.5, 783.6]] },
      { top: 9.81, ring: [[-1117.4, 777.8], [-1119.9, 776.4], [-1113.8, 764.8], [-1106.1, 768.8], [-1107.6, 771.6], [-1101.8, 774.6], [-1105.1, 780.8], [-1108.7, 778.9], [-1113.2, 787.4], [-1120.5, 783.6]] },
      { top: 8.58, ring: [[-1121.8, 788.1], [-1124.8, 793.9], [-1117.3, 797.9], [-1114.2, 792.1]] },
      { top: 12.2, ring: [[-1129.1, 791.6], [-1135.1, 788.5], [-1137.5, 793.5], [-1128.7, 798.2]] },
      { top: 11.54, ring: [[-1128.7, 798.2], [-1137.5, 793.5], [-1139.7, 797.6], [-1130.8, 802.3]] },
      { top: 2.96, ring: [[-1130.8, 802.3], [-1132.0, 801.9], [-1124.9, 805.7], [-1123.2, 802.4], [-1129.2, 799.2]] },
      { ring: [[-1126.1, 786.9], [-1112.6, 793.7], [-1109.6, 795.7], [-1115.0, 806.0], [-1128.9, 798.7]], roofs: [0] }
    ],
    roofs: [{ a: [-1129.4, 791.1], b: [-1111.5, 800.5], y: 10.8, left: [-1112.5, 793.6, 7.05], right: [-1114.7, 806.7, 6.5] }],
    cornice: { out: 0.35, thick: 0.3, colour: [0.12, 0.07, 0.04] },
    shops: [{ on: [[-1106.9, 771.4], [-1093.0, 778.8]], s0: 1.0, s1: 14.6, rise: 3.3, piers: [0.55, 0.53, 0.47], sign: 'bico' }]
  },
  {
    // The pink house south of the bico house, inside the latter's batch 9 (flat roof at 4.7, three storeys). 2015 from
    // the south (313035656877850, 468287817816770; 2231837597663267, 998564979863183 of 2026): pink render, white
    // windows. Its roof is flat as the survey has it; the photographs show a low saddle roof behind the trees.
    id: 'w219457240', name: 'the pink house', heldBy: 'w219457242',
    exclude: [],
    floor: -5.81, base: -6.4, colour: C.pink, shutters: SHUTTERS.none, plinth: 0.4,
    parts: [{ top: 4.72, ring: [[-1106.6, 792.4], [-1108.1, 795.3], [-1108.7, 795.0], [-1109.4, 796.6], [-1109.8, 796.4], [-1115.0, 806.0], [-1116.0, 805.5], [-1117.2, 807.6], [-1109.5, 811.6], [-1100.0, 793.5], [-1100.6, 793.2], [-1101.6, 795.0]] }],
    cornice: { out: 0.5, thick: 0.25, colour: [0.12, 0.08, 0.06] }
  },
  {
    // The rose house across the road (batch 12 of 11/1741/1002): a saddle roof (ridge 7.5) running east-north-east,
    // eaves at 4.6 to 5.3. 2015 (464950261493534, 371875284107908 from the north) and 2026 (2231837597663267,
    // 998564979863183 from the south-west): rose render, white windows, the dark eaves. The small gable in its south
    // roof is left out; its east side is guessed.
    id: 'w122816820', name: 'the rose house',
    exclude: [{ x: -1089.5, z: 808.8, r: 3 }],
    floor: -5.64, base: -6.2, colour: C.rose, shutters: SHUTTERS.none, plinth: 0.4,
    parts: [{ ring: [[-1090.9, 801.4], [-1088.4, 802.7], [-1089.0, 803.9], [-1082.6, 807.4], [-1087.4, 816.4], [-1096.4, 811.6]], roofs: [0] }],
    roofs: [{ a: [-1094.4, 805.8], b: [-1083.7, 811.6], y: 7.5, left: [-1091.3, 800.0, 4.6], right: [-1097.8, 812.0, 4.8] }]
  },
  {
    // The Krematorium (batch 11 of 11/1741/1002): a hall under one steep saddle roof (ridge 10.1) running east-north-east
    // down to low walls (eaves 1.6), its gables to the road and the cemetery. 2014 and 2015 from the south
    // (2858593234395486, 3000947130180661, 1126842091160416) and the north-east (371875284107908): grey walls, the dark
    // roof, a half-round window in each gable. The walls' few windows are left out.
    id: 'w122816823', name: 'Krematorium',
    exclude: [{ x: -1130.6, z: 816.9, r: 3 }],
    floor: -5.73, base: -6.3, colour: C.stone, shutters: SHUTTERS.none, plinth: 0.6,
    parts: [{ ring: [[-1136.9, 804.1], [-1119.3, 813.4], [-1126.4, 827.0], [-1144.2, 817.9]], roofs: [0], closed: true }],
    roofs: [{ a: [-1141.3, 811.9], b: [-1122.8, 821.3], y: 10.1, left: [-1137.2, 803.6, 1.6], right: [-1124.2, 830.3, 1.6] }],
    decals: [
      { on: [[-1144.2, 817.9], [-1136.9, 804.1]], s0: 4.6, s1: 11.0, y0: 3.4, y1: 6.6, key: 'rose' },
      { on: [[-1119.3, 813.4], [-1126.4, 827.0]], s0: 4.5, s1: 10.9, y0: 3.4, y1: 6.6, key: 'rose' }
    ]
  },
  {
    // The chalet by the bend (batches 7, 1, 0 of 11/1741/1001, 18 and 14 of 11/1741/1002): a block of five storeys to
    // 6.3 down the slope, low wings round it (−4.0 to 2.9). 2021 from the south-west (884665032143804,
    // 391049409254009, 580856899713369) and 2015 from the north (371875284107908): white render, brown planks over the
    // top two floors, timber balconies. Its wings' look is guessed.
    id: 'w122816745', name: 'the chalet by the bend',
    exclude: [{ x: -1093.4, z: 855.6, r: 3 }, { x: -1092.7, z: 849.8, r: 3 }, { x: -1097.3, z: 857.1, r: 3 }, { x: -1107.1, z: 841.2, r: 3 }, { x: -1100.4, z: 844.3, r: 3 }],
    floor: -9.55, base: -12.2, colour: C.white, shutters: SHUTTERS.brown, plinth: 0.4,
    timber: { from: -0.85, parts: [0], colour: C.larch },
    parts: [
      { top: 6.31, ring: [[-1102.4, 835.9], [-1108.1, 848.2], [-1098.5, 852.7], [-1092.7, 840.5]] },
      { top: 2.92, ring: [[-1100.8, 836.4], [-1102.0, 836.9], [-1107.1, 847.8], [-1106.3, 848.2], [-1106.8, 849.2], [-1113.5, 846.0], [-1107.5, 833.3]] },
      { top: -1.39, ring: [[-1093.0, 852.7], [-1098.2, 850.2], [-1094.5, 842.5], [-1089.3, 844.9]] },
      { top: -4.0, ring: [[-1087.8, 855.0], [-1092.9, 852.5], [-1089.5, 845.1], [-1087.4, 846.2]] },
      { top: -1.4, ring: [[-1087.8, 855.2], [-1092.9, 852.5], [-1096.8, 850.9], [-1098.0, 853.6], [-1093.9, 857.5], [-1089.3, 859.7], [-1088.0, 856.9]] },
      { top: 1.52, ring: [[-1098.2, 853.5], [-1100.6, 858.4], [-1095.5, 860.8], [-1093.9, 857.5]] }
    ],
    cornice: { out: 0.6, thick: 0.3, colour: [0.12, 0.07, 0.04] },
    balconies: [{ on: [[-1108.1, 848.2], [-1098.5, 852.7]], s0: 0.5, s1: 6.0, floors: [-0.85, 2.05], depth: 1.3, rail: 'timber' }]
  },
  {
    // The cream block (batch 6 of 11/1741/1001): five storeys to 6.1 down the slope. 2014 and 2015 from the south
    // (322811809189692, 2948391432100209: brown planks with ribbon windows and flower boxes over the white ground floors
    // of its south front) and the north-east (187524833218559, 913932429385347: cream render, brown shutters).
    id: 'w127947038', name: 'the cream block',
    exclude: [{ x: -1192.3, z: 929.9, r: 3 }],
    floor: -9.24, base: -9.9, colour: C.cream, shutters: SHUTTERS.brown, plinth: 0.4,
    timber: { from: -3.44, facing: [0, 1], colour: C.larch },
    parts: [{ top: 6.07, ring: [[-1197.5, 926.0], [-1199.2, 925.0], [-1196.9, 920.7], [-1183.7, 927.8], [-1189.0, 937.8], [-1189.5, 937.5], [-1190.4, 939.2], [-1200.9, 933.6], [-1200.0, 932.0], [-1200.5, 931.7]] }],
    cornice: { out: 0.6, thick: 0.3, colour: [0.12, 0.07, 0.04] }
  },
  {
    // The low white building by the road (batch 6 of 11/1741/1000): one storey under a flat roof at −4.3. 2015 from the
    // north-east (167520685260324; 278379800599928 beside it): white render over a grey plinth, a small window. Its
    // other sides are guessed.
    id: 'w127946903', name: 'the low white building',
    exclude: [{ x: -1216.9, z: 959.8, r: 3 }],
    floor: -10.43, base: -11.0, colour: C.white, shutters: SHUTTERS.none, plinth: 0.6,
    parts: [{ top: -4.33, ring: [[-1209.7, 958.6], [-1217.9, 952.6], [-1224.2, 961.1], [-1216.0, 967.1]] }],
    cornice: { out: 0.3, thick: 0.25, colour: [0.4, 0.4, 0.39] }
  },
  {
    // The cream house over the road (batches 5, 0 and 11 of 11/1741/1000, 4 of 11/1740/1000, 16 of 11/1741/1000): a low
    // saddle roof (ridge 1.5) running north-west, eaves at −1.9 and −2.3; a terrace along its north-west wall (−5.9);
    // two round silos of 3.4 m by its north corner (to 10.0), which the survey has and the photographs hide behind the
    // barn. 2015 from the north-east (278379800599928: cream render, chimneys) and 2026 from the south (1790360562207469,
    // 2528198534321253: brown planks in its gable, a timber balcony). The silos' look is guessed.
    id: 'w127946879', name: 'the cream house over the road',
    exclude: [{ x: -1237.5, z: 980.5, r: 3 }, { x: -1240.3, z: 972.2, r: 3 }, { x: -1245.3, z: 969.5, r: 3 }, { x: -1242.6, z: 966.3, r: 3 }],
    floor: -11.24, base: -11.9, colour: C.cream, shutters: SHUTTERS.brown, plinth: 0.4,
    timber: { from: -1.2, parts: [0], colour: C.larch },
    parts: [
      { ring: [[-1238.3, 969.3], [-1226.4, 978.4], [-1236.8, 991.8], [-1245.0, 985.4], [-1248.6, 982.7]], roofs: [0] },
      { top: -5.9, closed: true, ring: [[-1238.3, 969.3], [-1240.8, 966.1], [-1247.9, 975.1], [-1243.6, 978.4]] },
      { top: 10.0, closed: true, colour: C.concrete, ring: [[-1246.9, 970.1], [-1247.0, 969.5], [-1246.9, 968.9], [-1246.5, 968.3], [-1245.9, 967.9], [-1245.3, 967.8], [-1244.8, 967.9], [-1244.2, 968.3], [-1243.8, 968.9], [-1243.7, 969.5], [-1243.8, 970.1], [-1244.1, 970.6], [-1244.7, 971.1], [-1245.2, 971.2], [-1245.7, 971.2], [-1246.4, 970.8]] },
      { top: 9.96, closed: true, colour: C.concrete, ring: [[-1242.7, 964.5], [-1243.4, 964.7], [-1243.9, 965.0], [-1244.3, 965.6], [-1244.5, 966.4], [-1244.3, 967.1], [-1243.8, 967.8], [-1243.0, 968.1], [-1242.5, 968.1], [-1241.8, 967.9], [-1241.3, 967.5], [-1240.9, 966.6], [-1240.8, 966.1], [-1241.1, 965.4], [-1241.4, 965.0], [-1242.1, 964.6]] }
    ],
    roofs: [{ a: [-1232.1, 972.8], b: [-1243.6, 987.8], y: 1.5, left: [-1238.4, 967.9, -1.9], right: [-1225.0, 978.2, -2.3] }],
    balconies: [{ on: [[-1226.4, 978.4], [-1236.8, 991.8]], s0: 4.0, s1: 13.0, floors: [-8.34, -5.44], depth: 1.3, rail: 'timber' }]
  },
  {
    // The white house with the green shutters (batch 5 of 11/1740/1000): a saddle roof (ridge 1.9) running
    // north-east, eaves at 0.0 and −0.5, its storeys down the slope under the road. 2026 from the south
    // (1790360562207469, 2502885083536351, 2200573687177100) and 2015 (188967963068715, 306449244193242): white render,
    // grey-green shutters, flower boxes. Its downhill side is guessed.
    id: 'w127947031', name: 'the house with the green shutters',
    exclude: [{ x: -1250.4, z: 995.8, r: 3 }],
    floor: -11.06, base: -11.7, colour: C.white, shutters: SHUTTERS.grey, plinth: 0.5,
    parts: [{ ring: [[-1248.7, 990.6], [-1250.4, 989.4], [-1252.1, 991.6], [-1256.6, 997.7], [-1250.3, 1002.3], [-1244.2, 994.0]], roofs: [0] }],
    roofs: [{ a: [-1254.0, 993.0], b: [-1246.6, 998.5], y: 1.9, left: [-1257.7, 997.8, 0.0], right: [-1250.6, 988.3, -0.5] }]
  },
  {
    // The villa with the red shutters (batches 3, 2 and 7 of 11/1740/1000): a saddle roof (ridge 4.1) running
    // north-west with a cross gable (4.0) over its south-west bay, a flat-roofed wing (3.5) to the west. 2014 and 2015
    // from the south (959797494757583, 188967963068715; 1551263320374502 of 2026) and the north-east
    // (455399255556514): white render, dark red shutters, dark timber balconies on its south-east corner and in the
    // cross gable. The wing's look is guessed.
    id: 'w127946882', name: 'the villa with the red shutters',
    exclude: [{ x: -1257.3, z: 1012.1, r: 3 }, { x: -1261.1, z: 1016.9, r: 3 }, { x: -1264.8, z: 1005.9, r: 3 }],
    floor: -12.25, base: -12.9, colour: C.white, shutters: SHUTTERS.brown, plinth: 0.5,
    parts: [
      { ring: [[-1259.7, 1004.0], [-1257.0, 1005.9], [-1255.9, 1006.7], [-1254.8, 1005.1], [-1250.5, 1008.6], [-1251.6, 1010.0], [-1248.7, 1012.4], [-1255.1, 1020.5], [-1258.5, 1017.8], [-1262.5, 1014.6], [-1266.0, 1011.9]], roofs: [0] },
      { ring: [[-1262.5, 1014.6], [-1263.8, 1016.2], [-1259.8, 1019.4], [-1258.5, 1017.8]], roofs: [1] },
      { top: 3.53, ring: [[-1259.7, 1004.0], [-1264.5, 999.0], [-1271.5, 1007.9], [-1265.1, 1012.9], [-1266.0, 1011.9]] }
    ],
    roofs: [
      { a: [-1250.7, 1017.4], b: [-1263.9, 1006.9], y: 4.1, left: [-1254.9, 1022.6, 1.7], right: [-1248.3, 1008.4, 0.6] },
      { a: [-1257.8, 1012.9], b: [-1262.3, 1018.6], y: 4.0, left: [-1262.7, 1013.2, 2.8], right: [-1257.1, 1017.6, 2.8] }
    ],
    cornice: { out: 0.4, thick: 0.3, colour: [0.12, 0.07, 0.04], parts: [2] },
    balconies: [
      { on: [[-1263.8, 1016.2], [-1259.8, 1019.4]], s0: 0.4, s1: 4.7, floors: [-3.55, -0.65], depth: 1.2, rail: 'timber' },
      { on: [[-1248.7, 1012.4], [-1255.1, 1020.5]], s0: 0.3, s1: 4.0, floors: [-6.45, -3.55, -0.65], depth: 1.4, rail: 'timber' }
    ]
  },
  {
    // The house with the lozenges (batch 0 of 11/1740/999): a saddle roof (ridge 0.8) running north over five storeys
    // down the slope, a cross gable (0.7) over its east front. 2014 and 2015 from the south-east (802324260690100,
    // 327241975491972, 174495481239916) and the north-east (837633673775736): greyish render with a red lozenge
    // pattern (left plain here), white windows, the gables' dark boards. Its west side is guessed.
    id: 'w127946963', name: 'the house with the lozenges',
    exclude: [{ x: -1266.4, z: 1069.8, r: 3 }],
    floor: -13.36, base: -14.0, colour: C.greige, shutters: SHUTTERS.none, plinth: 0.5,
    parts: [{ ring: [[-1271.5, 1063.1], [-1262.3, 1062.4], [-1261.3, 1076.7], [-1270.5, 1077.3]], roofs: [0, 1] }],
    roofs: [
      { a: [-1266.9, 1062.0], b: [-1265.8, 1077.7], y: 0.8, left: [-1272.3, 1062.4, -1.9], right: [-1260.5, 1077.4, -1.9] },
      { a: [-1261.3, 1069.3], b: [-1266.3, 1069.9], y: 0.7, left: [-1261.8, 1066.2, -0.7], right: [-1261.0, 1072.5, -0.7] }
    ]
  }
];

// --- Roofs ----------------------------------------------------------------------------------------------------------------
// Each pitched roof prepared: the ridge carried `over` m past its verges, cL / cR how far its eaves lie left and right
// of a→b, eL / eR their heights
for (const h of HOUSES) {
  for (const p of h.parts) p.ring = clean(p.ring);
  for (const R of h.roofs || []) {
    const F0 = frame(R.a, R.b), over = R.over ?? 0.4;
    R.a = at(F0, -over, 0); R.b = at(F0, F0.L + over, 0);
    const F = frame(R.a, R.b);
    for (const e of [R.left, R.right]) {
      const c = local(F, e[0], e[1])[1];
      if (c < 0) { R.cL = -c; R.eL = e[2]; } else { R.cR = c; R.eR = e[2]; }
    }
  }
}

/** The roof's frame (a→b) */
export const roofFrame = (R) => frame(R.a, R.b);
/** A roof's height (its upper face) over a world point, or null outside its outline */
export function roofY(R, x, z) {
  const F = roofFrame(R), [t, c] = local(F, x, z);
  if (t < -1e-6 || t > F.L + 1e-6 || c < -R.cL - 1e-6 || c > R.cR + 1e-6) return null;
  return c >= 0 ? R.y - ((R.y - R.eR) * c) / R.cR : R.y - ((R.y - R.eL) * -c) / R.cL;
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
  return Number.isFinite(y) ? y : Math.min(...part.roofs.map((i) => Math.min(house.roofs[i].eL, house.roofs[i].eR)));
}
/** The parts' outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): every part reaches the ground */
export const groundOutlines = (house) => house.parts.map((p) => p.ring);
/** Is a point inside one of the row's houses? */
export const insideRow = (x, z) => HOUSES.some((h) => groundOutlines(h).some((r) => pointInRing(r, x, z)));

/** A wall's frame from a segment (a, b) on a house's outline, turned so that it faces out of the house */
export function wallOut(house, a, b) {
  const F = wallFrame(a, b), [x, z] = onWall(F, F.len / 2, 0.4);
  return house.parts.some((p) => pointInRing(p.ring, x, z)) ? wallFrame(b, a) : F;
}

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // the crossing north of the fire station looking south-west: the Claro house, the sand block, the fire station
  feuerwehr: [-797, -1.0, 432, -845, 3, 520],
  // the road past the bico house looking south-west: the rose house, the Krematorium, the chalet by the bend
  krematorium: [-1072, -2.4, 760, -1120, 2, 815],
  // the Promenade's bend by the Spital looking south: the cream house, the green shutters, the villa
  bend: [-1205, -8.1, 950, -1255, -4, 1010]
};

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
