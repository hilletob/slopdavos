// The houses along the Talstrasse in Davos Platz from its west end by the Club Hotel and the Pauluskirche (x −790) to
// the Kurpark (x −390, js/talstrasse-2.js): the row by hand in one module, each house its surveyed volumes, its roofs and
// its look. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1743/1003 to 11/1746/1009; the batches named at each house): the outlines below
// are its flat roofs' outlines (the walls under them; jitter of a few centimetres taken out), the pitched roofs its
// sloped triangles cleaned into planes; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js; x east,
// z south). The street runs from the Pauluskirche (−771/607) north-east past the H&M block (−692/504), the Bahnhof
// Platz (−628/414), the Rathaus (−535/334), the Spar (−462/227) and the Ochsen (−437/150) to the Kurpark (−396/77). The look after Mapillary's street views (CC BY-SA, 2013–2026), each house's note saying which
// photographs show it and what is guessed. Three batches hold neighbours as well (the H&M's, the Pizzeria Padrino's,
// the house south of the Ochsen's): they are rebuilt whole, the neighbours as houses of their own here.
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

// --- Colours (linear) ----------------------------------------------------------------------------------------------------
export const COLOURS = {
  white: [0.6, 0.6, 0.58], grey: [0.55, 0.56, 0.56], cream: [0.58, 0.52, 0.4], apricot: [0.6, 0.47, 0.33],
  salmon: [0.6, 0.41, 0.28], rust: [0.4, 0.19, 0.09], ochre: [0.56, 0.42, 0.2], beige: [0.5, 0.46, 0.36],
  sand: [0.52, 0.49, 0.4], mustard: [0.6, 0.45, 0.12], terracotta: [0.45, 0.17, 0.1], mauve: [0.4, 0.37, 0.4],
  umber: [0.36, 0.33, 0.28], stone: [0.27, 0.26, 0.24], anthracite: [0.07, 0.07, 0.075], pink: [0.52, 0.3, 0.22],
  larch: [0.3, 0.15, 0.07], logs: [0.15, 0.078, 0.04], orange: [0.36, 0.13, 0.04], green: [0.04, 0.17, 0.07]
};
const C = COLOURS;
// The windows' kinds (the walls' material draws them): white frames and no shutters, grey-green, white or brown
// shutters beside them, or dark frames with a grey panel beside each (the timber blocks and the office)
export const SHUTTERS = { none: 0, grey: 1, white: 2, brown: 3, dark: 4 };

// --- The houses -----------------------------------------------------------------------------------------------------------
/**
 * Each house: `id` (OpenStreetMap), `name`, `exclude` (swissBUILDINGS3D's batches' centres, r 3), `floor` (its storeys'
 * grid: the ground floor's foot), `base` (how far down its walls reach), `colour` (its plaster), `bands` ([yTop,
 * colour]: a colour under yTop), `shutters`, `bay` (its bays' spacing as a share of BAY), `plinth` (the grey render
 * along its foot, m over the ground), `timber` ({ from, colour, boards?, parts? }: logs, or upright boards, over
 * `from`), `parts` ({ ring, top } flat-roofed; { ring, roofs: [i] } under the house's pitched roofs; `colour`,
 * `closed`), `roofs` ({ a, b: the ridge's ends at the verges, y: the ridge, eaves (eavesR on the right of a→b if it
 * differs), cL, cR: how far the eaves lie left and right of a→b, hip: [h0, h1] the ridge's ends inside the eaves'
 * outline }), `cornice` (an eaves slab round the flat roofs: { out, thick, colour }), `shops`, `balconies`,
 * `canopies`, `claddings`; `register: false` for the parts of a neighbour whose other parts stay streamed (its OSM
 * walls stay the player's).
 */
export const HOUSES = [
  {
    // The cream house on the corner of the Tanzbühlstrasse (batch 10 of 11/1743/1003): six storeys under a flat roof at
    // 4.75 on ground falling from −12.7 to −15.3. 2014 from the north-west (929962087767052, 1133188927154114): cream
    // render, white windows, balconies with dark railings at its east corner; 2026 from the south (1081847067779230,
    // 2010985446286750) its south side at the left edge. The balconies and the back are guessed.
    id: 'w97292393', name: 'the cream house on the corner',
    exclude: [{ x: -794, z: 625.1, r: 3 }],
    floor: -15.3, base: -15.9, colour: C.apricot, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.5,
    parts: [{ ring: [[-784.9, 616.9], [-786.5, 615.7], [-797, 615.7], [-804.1, 624.9], [-791.3, 634.6], [-784.5, 621.4], [-784.1, 619.3]], top: 4.75 }],
    cornice: { out: 0.5, thick: 0.35, colour: [0.12, 0.08, 0.05] },
    balconies: [{ on: [[-791.3, 634.6], [-784.5, 621.4]], s0: 0.4, s1: 4.4, floors: [-9.5, -6.6, -3.7, -0.8], depth: 1.3, rail: 'metal' }]
  },
  {
    // The white block over the Talstrasse west of La Carretta (batch 12 of 11/1743/1004): five storeys and a half under
    // a flat roof at 0.91. 2026 from the south (2296112794463740, 1718178092599690): white-grey render, grey roller
    // blinds, a rough stone plinth, a thin roof edge; the house on the right of those views is La Carretta's.
    // 469166757492491 and 505560517285313 show the street. Its north side is guessed.
    id: 'w965237020', name: 'the white block',
    exclude: [{ x: -779.6, z: 580.1, r: 3 }],
    floor: -16.0, base: -16.7, colour: [0.58, 0.58, 0.56], shutters: SHUTTERS.grey, bay: 1.0, plinth: 1.1,
    parts: [{ ring: [[-775.2, 564], [-795, 586.7], [-784.1, 596.2], [-764.3, 573.5]], top: 0.91 }],
    cornice: { out: 0.3, thick: 0.3, colour: [0.3, 0.3, 0.29] }
  },
  {
    // La Carretta's house between the Talstrasse and the Hofstrasse (batch 9 of 11/1743/1004): the survey has a flat
    // roof at −0.2; 2015 from the west (307423620752512, 948784532543912, 211977427398263) and 2021 from the south-west
    // (900193674235010) show a shallow hipped roof on dark eaves: hips here, the eaves at the survey's height. Pale
    // salmon render, the ground floor darker, the stair's upright band of orange timber near the north-west end of the
    // street front, balconies with orange timber parapets round its south-east end, a stone wall along its foot.
    id: 'w97292400', name: "La Carretta's house",
    exclude: [{ x: -756.3, z: 601.2, r: 3 }],
    floor: -17.5, base: -18.2, colour: C.salmon, bands: [[-14.7, C.rust]], shutters: SHUTTERS.none, bay: 1.0, plinth: 0.6,
    parts: [{ ring: [[-752.6, 606.3], [-753.1, 606], [-750.5, 602], [-750, 602.3], [-744.1, 593.4], [-754.2, 586.8], [-768.6, 608.6], [-765.4, 610.8], [-765.7, 611.2], [-758.9, 615.7]], roofs: [0] }],
    roofs: [{ a: [-748.71, 589.43], b: [-764.19, 612.82], y: 1.4, eaves: -0.9, cL: 6.83, cR: 6.83, hip: [6.83, 6.83] }],
    claddings: [{ on: [[-754.2, 586.8], [-768.6, 608.6]], s0: 4.4, s1: 6.2, y0: -14.7, y1: -0.7, colour: C.orange }],
    balconies: [
      { on: [[-754.2, 586.8], [-768.6, 608.6]], s0: 21.6, s1: 25.8, floors: [-11.7, -8.8, -5.9, -3.0], depth: 1.4, rail: 'orange' },
      { on: [[-744.1, 593.4], [-754.2, 586.8]], s0: 0.4, s1: 4.6, floors: [-11.7, -8.8, -5.9, -3.0], depth: 1.4, rail: 'orange' }
    ]
  },
  {
    // The block north-west of the Talstrasse opposite the H&M (batch 8 of 11/1744/1004): flat roof at −0.11, five
    // storeys over the ground falling towards the Talstrasse. The photographs of 2014 and 2015 from the south-west
    // (188138556459885, 469145687517841, 322940525831366, 210466607249584) look up the street: the timber blocks
    // across it, this house behind trees and a wall: cream render, brown shutters, all guessed. (A wall 0.3 m thick
    // on its north-west side in the batch, to −10.58, stands inside its walls.)
    id: 'w97292419', name: 'the house opposite the H&M',
    exclude: [{ x: -739.7, z: 531.2, r: 3 }],
    floor: -17.4, base: -18.1, colour: C.cream, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.5,
    parts: [{ ring: [[-729, 527.9], [-739.3, 542.5], [-750.5, 534.6], [-740.2, 520]], top: -0.11 }],
    cornice: { out: 0.4, thick: 0.3, colour: [0.2, 0.2, 0.19] }
  },
  {
    // The H&M's block (in batch 7 of 11/1744/1004 with its two neighbours): flat roof at 3.98, a shop floor and six
    // storeys. 2013 and 2015 from the west and south-west (364266761676384, 845979969328392, 539196743733873,
    // 184094466865519, 895071891056244, 544155183560708): larch boards over the shop floor, windows in bands of dark
    // frames and grey panels, the shop's glazing under a deep canopy with a grey edge along the Talstrasse, "H&M" on
    // the glass (its sign js/shops.js'). The back is guessed.
    id: 'w221110634', name: 'the H&M block',
    exclude: [],
    floor: -16.5, base: -18.5, colour: C.anthracite, shutters: SHUTTERS.dark, bay: 0.85, plinth: 0.3,
    timber: { from: -13.6, colour: C.larch, boards: true },
    parts: [{ ring: [[-675.9, 500.7], [-693.5, 528.1], [-681.1, 536.1], [-663.5, 508.8]], top: 3.98 }],
    cornice: { out: 0.25, thick: 0.4, colour: [0.2, 0.2, 0.2] },
    shops: [{ on: [[-675.9, 500.7], [-693.5, 528.1]], s0: 0.8, s1: 31.8, top: -13.6, piers: C.anthracite }],
    canopies: [{ on: [[-675.9, 500.7], [-693.5, 528.1]], s0: 0, s1: 32.5, y: -13.6, depth: 2.6 }]
  },
  {
    // The low link between the H&M's block and the one north-west of it (batch 7 of 11/1744/1004): flat roof at −2.87,
    // a shop floor and three storeys, the same larch and canopy (539196743733873, 845979969328392).
    id: 'w221110631', name: 'the timber link',
    exclude: [{ x: -692.6, z: 542.6, r: 3 }],
    floor: -16.5, base: -18.5, colour: C.anthracite, shutters: SHUTTERS.dark, bay: 0.85, plinth: 0.3,
    timber: { from: -13.6, colour: C.larch, boards: true },
    parts: [{ ring: [[-693.7, 555.5], [-704, 548.8], [-691.5, 529.4], [-681.1, 536.1]], top: -2.87 }],
    cornice: { out: 0.25, thick: 0.4, colour: [0.2, 0.2, 0.2] },
    shops: [{ on: [[-704, 548.8], [-691.5, 529.4]], s0: 0.6, s1: 22.5, top: -13.6, piers: C.anthracite }],
    canopies: [{ on: [[-704, 548.8], [-691.5, 529.4]], s0: 0, s1: 23.0, y: -13.6, depth: 2.6 }]
  },
  {
    // The timber block on the Hofstrasse (batch 7 of 11/1744/1004): flat roof at 3.98 like the H&M's. 2015 from the
    // south-west (539196743733873; 845979969328392 beyond the link): the same larch, the window bands, the shops'
    // glazing under the canopy. Its back is guessed.
    id: 'w221110628', name: 'the timber block on the Hofstrasse',
    exclude: [],
    floor: -16.5, base: -18.5, colour: C.anthracite, shutters: SHUTTERS.dark, bay: 0.85, plinth: 0.3,
    timber: { from: -13.6, colour: C.larch, boards: true },
    parts: [{ ring: [[-709, 584.6], [-721.8, 576.3], [-704, 548.8], [-691.2, 557.1]], top: 3.98 }],
    cornice: { out: 0.25, thick: 0.4, colour: [0.2, 0.2, 0.2] },
    shops: [{ on: [[-721.8, 576.3], [-704, 548.8]], s0: 0.8, s1: 32.0, top: -13.6, piers: C.anthracite }],
    canopies: [{ on: [[-721.8, 576.3], [-704, 548.8]], s0: 0, s1: 32.7, y: -13.6, depth: 2.6 }]
  },
  {
    // The office block at the Rathausstutz (batch 14 of 11/1744/1006): two flat roofs at −3.7 and a higher middle at
    // −0.64, on ground rising from −18 on the Talstrasse to −12.6 on the Rathausstutz. 2026 from the south-west
    // (2901312713569251): white-grey render with long bands of dark-framed windows; 2013 (508873873454738) its glazed
    // west end over the path; 817620078877494 and 466181754602660 show the underpass beside it. The rest is guessed.
    id: 'w221111398', name: 'the office block at the Rathausstutz',
    exclude: [{ x: -599.1, z: 361.7, r: 3 }],
    floor: -18.2, base: -18.8, colour: C.grey, shutters: SHUTTERS.dark, bay: 0.75, plinth: 0.4,
    parts: [
      { ring: [[-594.6, 366.9], [-598.1, 371.2], [-599.3, 370.2], [-605, 377.2], [-606.3, 376.2], [-607.3, 377.5], [-611.5, 374], [-611.1, 373.5], [-616.3, 369.3], [-611, 362.8], [-612.4, 361.6], [-608.4, 361.4], [-609.5, 362.8], [-607.5, 364.3], [-607.5, 366.3], [-603.4, 369], [-600, 364.9], [-596.6, 367.8], [-596, 367], [-595.7, 367.3]], top: -3.7 },
      { ring: [[-589.3, 361], [-593.6, 357.3], [-591.5, 354.7], [-593.2, 353.4], [-593.8, 354.1], [-594.6, 353.5], [-590.6, 348.5], [-582, 355.4], [-591, 366.7], [-593.5, 364.7], [-592.9, 363.9], [-592.1, 364.5]], top: -3.7 },
      { ring: [[-591.5, 354.7], [-598.4, 349.1], [-603.9, 346.3], [-606.3, 351.4], [-607.9, 353.3], [-606.8, 354.8], [-612.4, 361.6], [-608.4, 361.4], [-609.5, 362.8], [-607.5, 364.3], [-607.5, 366.3], [-603.4, 369], [-600, 364.9], [-595.5, 368.7], [-589.3, 361], [-593.6, 357.3]], top: -0.64 }
    ],
    cornice: { out: 0.3, thick: 0.3, colour: [0.35, 0.36, 0.36] }
  },
  {
    // The house with the striped awnings by the railway (batches 15 and 4 of 11/1745/1006): flat roofs at −2.88 and a
    // lower west part at −4.98. 2013 from the south (475384247106865): grey-white render, balconies along the street's
    // fronts under yellow-and-white awnings; 2013 from the north-west (184179856866145) the back with the wall of the
    // underpass; 2013 and 2026 from the south-west (1251030968632971, 1381530847417673) the street. The ground floor is
    // guessed.
    id: 'w221111397', name: 'the house with the awnings',
    exclude: [{ x: -576.3, z: 337.8, r: 3 }, { x: -567.6, z: 344.9, r: 3 }],
    floor: -18.5, base: -19.2, colour: [0.55, 0.55, 0.53], shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-568.2, 334.9], [-576.3, 345.5], [-577.6, 347], [-568.4, 355.1], [-567, 353.6], [-566.3, 354.2], [-557.5, 344.2]], top: -2.88 },
      { ring: [[-578.6, 341.7], [-583.7, 337.2], [-577.4, 330], [-569, 337.3], [-575.6, 344.8], [-579.1, 342.2]], top: -4.98 }
    ],
    cornice: { out: 0.4, thick: 0.3, colour: [0.3, 0.3, 0.29] },
    balconies: [
      { on: [[-577.6, 347], [-568.4, 355.1]], s0: 0.6, s1: 11.6, floors: [-12.7, -9.8, -6.9], depth: 1.3, rail: 'metal', awning: [0.6, 0.42, 0.05] },
      { on: [[-566.3, 354.2], [-557.5, 344.2]], s0: 0.6, s1: 12.6, floors: [-12.7, -9.8, -6.9], depth: 1.3, rail: 'metal', awning: [0.6, 0.42, 0.05] }
    ]
  },
  {
    // Am Bergli (batch 2 of 11/1745/1006): flat roof at −1.03 on the Berglistutz, ground from −9.6 to −12.9. 2026 from
    // the south-west (848656244906267, 834339786372016, 2086537555296676): white render, a shop's windows on the
    // ground floor towards the Talstrasse, grey blinds. The north side is guessed.
    id: 'w457694791', name: 'Am Bergli',
    exclude: [{ x: -547.9, z: 307.3, r: 3 }],
    floor: -12.8, base: -13.5, colour: C.white, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[-538.5, 305], [-554.6, 300.6], [-557.2, 310.2], [-542.5, 314.2]], top: -1.03 }],
    cornice: { out: 0.4, thick: 0.25, colour: [0.25, 0.25, 0.25] },
    shops: [{ on: [[-557.2, 310.2], [-542.5, 314.2]], s0: 1.0, s1: 14.2, top: -9.3, piers: C.white }]
  },
  {
    // The hotel by the railway east of the Rathaus (batches 14 and 0 of 11/1745/1006): a wedge on the Talstrasse with a
    // flat roof at −6.24 and its higher west end at −3.71. 2013 from the south-west (192839455988418): white render
    // over a grey stone ground floor, stacks of dark timber balconies on the street front, a red sign up its corner;
    // 2026 (1069084312196755, 1467461835281266, 1386365610251305) the same front. The Tijuana bar's door stays on the
    // street before it (js/missions-data-bars.js). The back is guessed.
    id: 'w221111395', name: 'the hotel by the railway',
    exclude: [{ x: -532.2, z: 319.5, r: 3 }, { x: -543.5, z: 326.7, r: 3 }],
    floor: -19.0, base: -19.7, colour: C.white, bands: [[-16.2, C.stone]], shutters: SHUTTERS.none, bay: 1.0, plinth: 0.3,
    parts: [
      { ring: [[-536.3, 325.8], [-541.6, 330.2], [-518.3, 314.4], [-521.7, 309.4], [-524.6, 308.6], [-542.5, 317.9]], top: -6.24 },
      { ring: [[-546.5, 335.6], [-552.1, 328.8], [-546.7, 324.3], [-547.6, 323.1], [-541.3, 317.9], [-538.5, 321.3], [-537, 320], [-535.2, 322.1], [-536.9, 323.5], [-534.9, 326]], top: -3.71 }
    ],
    cornice: { out: 0.5, thick: 0.3, colour: [0.1, 0.06, 0.035] },
    balconies: [
      { on: [[-541.6, 330.2], [-518.3, 314.4]], s0: 1.0, s1: 9.8, floors: [-13.2, -10.3], depth: 1.3, rail: 'timber' },
      { on: [[-541.6, 330.2], [-518.3, 314.4]], s0: 15.4, s1: 26.6, floors: [-13.2, -10.3], depth: 1.3, rail: 'timber' }
    ]
  },
  {
    // The restaurant's house on the Berglistutz (batch 9 of 11/1745/1007): flat roof at −6.78. 2026 from the
    // south-west (29062074356719029, 1065364802870747, 1515648683919127, 1430422379187420): cream render over a
    // salmon-pink ground floor, its windows in dark timber frames under bunting, a timber kiosk at the corner, dark
    // windows over it. The back is guessed.
    id: 'w116881212', name: "the restaurant's house",
    exclude: [{ x: -501.1, z: 285, r: 3 }],
    floor: -19.3, base: -20.0, colour: [0.6, 0.58, 0.52], bands: [[-15.9, C.pink]], shutters: SHUTTERS.none, bay: 1.0, plinth: 0.3,
    parts: [{ ring: [[-497.7, 290.2], [-502.7, 295.9], [-510.8, 287.8], [-501.7, 274.2], [-491.5, 281.6]], top: -6.78 }],
    cornice: { out: 0.4, thick: 0.3, colour: [0.12, 0.07, 0.04] },
    shops: [
      { on: [[-491.5, 281.6], [-497.7, 290.2]], s0: 0.6, s1: 10.0, top: -15.9, piers: [0.15, 0.08, 0.04] },
      { on: [[-497.7, 290.2], [-502.7, 295.9]], s0: 0.5, s1: 7.1, top: -15.9, piers: [0.15, 0.08, 0.04] }
    ]
  },
  {
    // The block of the Pizzeria Padrino (batch 17 of 11/1745/1007, which also holds the Quellenhof and a sliver of
    // w123380399): flat roofs at −2.29 and −2.71, a low strip along its south end (−13.26, −12.74). 2015 from the
    // south-east (3999276463466382, 318404583056657, up the lane between the low shops): ochre render, dark brown
    // balconies, the shops' dark fascia; 2013 from the south (750184055680142). The west side is guessed.
    id: 'w123380420', name: 'the Pizzeria Padrino block',
    exclude: [{ x: -491.9, z: 241.8, r: 3 }],
    floor: -20.7, base: -21.4, colour: C.ochre, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-486, 243.3], [-488.6, 250.1], [-493.3, 248.3], [-492.1, 245.3], [-496, 243.8], [-497.4, 247.3], [-498.6, 246.8], [-500.3, 251.4], [-499, 251.9], [-501.8, 259], [-495.1, 261.6], [-495.4, 262.3], [-484.8, 266.4], [-483.3, 262.7], [-481.7, 263.3], [-479.9, 258.7], [-480.6, 258.4], [-477.6, 250.6], [-476.5, 251], [-475, 247], [-478.8, 245.6], [-478.9, 246]], top: -2.29 },
      { ring: [[-484, 241], [-484.5, 240.8], [-483.7, 238.7], [-485.1, 238.2], [-484.3, 236.1], [-485.9, 235.5], [-484.7, 232.5], [-486.4, 231.9], [-485.9, 230.8], [-487.2, 230.3], [-489.7, 236.8], [-492.7, 235.6], [-494.4, 240.3], [-495.3, 239.9], [-496.6, 243.5], [-492.1, 245.3], [-493.3, 248.3], [-488.6, 250.1], [-486, 243.3], [-485, 243.7]], top: -2.71 },
      { ring: [[-499.9, 265.1], [-502.8, 264], [-501.8, 261.5], [-486.5, 267.8], [-486.2, 267.2], [-485.1, 267.6], [-486.3, 270.6], [-497.6, 266.2], [-497.8, 266.7], [-500.2, 265.8]], top: -13.26 },
      { ring: [[-495.1, 261.6], [-500.9, 259.3], [-501.8, 261.5], [-486.5, 267.8], [-485.7, 266], [-495.4, 262.3]], top: -12.74 }
    ],
    cornice: { out: 0.6, thick: 0.3, colour: [0.1, 0.06, 0.035] },
    shops: [
      { on: [[-480.6, 258.4], [-477.6, 250.6]], s0: 0.4, s1: 8.0, top: -16.6, piers: [0.1, 0.07, 0.05] },
      { on: [[-481.7, 263.3], [-479.9, 258.7]], s0: 0.3, s1: 4.6, top: -16.6, piers: [0.1, 0.07, 0.05] }
    ],
    balconies: [
      { on: [[-480.6, 258.4], [-477.6, 250.6]], s0: 0.4, s1: 8.0, floors: [-14.9, -12.0, -9.1, -6.2], depth: 1.2, rail: 'timber' },
      { on: [[-495.4, 262.3], [-484.8, 266.4]], s0: 1.0, s1: 10.4, floors: [-9.1, -6.2], depth: 1.2, rail: 'timber' }
    ]
  },
  {
    // The Quellenhof (its parts in batch 17 of 11/1745/1007): the block to 3.77 and the low wings on its west at −8.6
    // to −10.6 (with them the sliver of w123380399 at −8.72, built here). 2015 from the south (133247548817338, at the
    // left edge; 145529220914951): cream render, "Quellenhof" over the entrance, stacks of dark timber balconies under
    // a dark eaves slab. The west wings are guessed.
    id: 'w123380418', name: 'the Quellenhof',
    exclude: [],
    floor: -17.4, base: -18.0, colour: [0.58, 0.53, 0.42], shutters: SHUTTERS.none, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-484.6, 224], [-489.7, 236.8], [-493.6, 235.3], [-494, 236.4], [-498, 234.8], [-497.6, 233.9], [-504.4, 231.7], [-504.2, 231.1], [-508.4, 229.5], [-505.3, 221.7], [-505.7, 221.5], [-502.5, 213.2], [-485.5, 219.7], [-486.8, 223.1]], top: 3.77 },
      { ring: [[-504.2, 248.8], [-505.4, 246.2], [-504.1, 246.7], [-502.5, 242.5], [-500.5, 237.3], [-499.8, 237.6], [-498.4, 234], [-498, 234.8], [-494, 236.4], [-493.6, 235.3], [-492.7, 235.6], [-494.4, 240.3], [-495.3, 239.9], [-496.6, 243.5], [-496, 243.8], [-497.4, 247.3], [-498.6, 246.8], [-500.1, 250.9], [-500.6, 249.8], [-503.4, 249.2]], top: -10.58 },
      { ring: [[-511.8, 241.2], [-512.7, 243.4], [-504.1, 246.7], [-502.5, 242.5], [-510.1, 239.5], [-510.9, 241.6]], top: -10.29 },
      { ring: [[-501.5, 240], [-511.1, 236.3], [-508.4, 229.5], [-504.2, 231.1], [-504.4, 231.7], [-497.6, 233.9], [-498.4, 234], [-499.8, 237.6], [-500.5, 237.3]], top: -9.22 },
      { ring: [[-502.5, 242.5], [-510.1, 239.5], [-511.1, 236.3], [-501.5, 240]], top: -8.56 },
      { ring: [[-501.5, 240], [-511.6, 236.1], [-512, 237.2]], top: -8.72, foot: false }
    ],
    cornice: { out: 0.7, thick: 0.35, colour: [0.1, 0.06, 0.035] },
    balconies: [{ on: [[-484.6, 224], [-489.7, 236.8]], s0: 1.2, s1: 12.6, floors: [-11.6, -8.7, -5.8, -2.9, 0.0], depth: 1.4, rail: 'timber' }]
  },
  {
    // The house with the bakery's lettering (batch 1 of 11/1745/1007): flat roofs at −4.9 and −6.8, and the two low
    // wings towards the Quellenhof (−13.71, in batch 17, in no OSM building: built and walled here). 2015 from the south
    // (472567437525815, 133247548817338) and 2019 (194026205885329): cream render, dark timber balconies on the street
    // front, a dark eaves slab, a shop under a green fascia; 2013 from the north-east (929145024571290; 180615310642544
    // shows "BÄCKEREI" painted on it). The back is guessed.
    id: 'w124794941', name: 'the house with the bakery',
    exclude: [{ x: -474.7, z: 224.4, r: 3 }],
    floor: -21.0, base: -21.7, colour: [0.58, 0.54, 0.44], shutters: SHUTTERS.none, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-477.6, 228.3], [-480.1, 227.7], [-477.2, 216.1], [-466.7, 218.7], [-470.2, 232.8], [-474.5, 231.7], [-474.2, 230.5], [-477.9, 229.6]], top: -4.9 },
      { ring: [[-480.1, 227.7], [-481.5, 227.3], [-480.9, 224.7], [-482.8, 224.2], [-480.9, 216.5], [-477.5, 217.4]], top: -6.8 },
      { ring: [[-484.7, 232.5], [-486.4, 231.9], [-485.9, 230.8], [-487.2, 230.3], [-485.4, 226.3], [-482.9, 227], [-482.5, 225.5], [-481.2, 225.8], [-481.5, 227.3]], top: -13.71 },
      { ring: [[-477.9, 229.6], [-474.2, 230.5], [-474.5, 231.7], [-471.4, 232.5], [-473.1, 238.4], [-477.1, 237.3], [-479.5, 245.8], [-485, 243.7], [-484, 241], [-484.5, 240.8], [-483.7, 238.7], [-485.1, 238.2], [-484.3, 236.1], [-485.9, 235.5]], top: -13.71 }
    ],
    cornice: { out: 0.8, thick: 0.35, colour: [0.1, 0.06, 0.035] },
    shops: [{ on: [[-466.7, 218.7], [-470.2, 232.8]], s0: 0.8, s1: 13.7, top: -16.7, piers: [0.5, 0.48, 0.44], fascia: C.green }],
    balconies: [{ on: [[-466.7, 218.7], [-470.2, 232.8]], s0: 1.5, s1: 13.0, floors: [-15.2, -12.3, -9.4], depth: 1.3, rail: 'timber' }]
  },
  {
    // The Konsum's block (batch 6 of 11/1745/1007): flat roofs at −3.26 and −2.21, two low wings at −13.0 and −13.4
    // north and south of it. 2015 from the south (2938912152994978, 145529220914951): sand render, a slab over the shop
    // floor, the shops' windows on the street; 2013 from the north-east (641896616716338): "KONSUM DAVOS" and
    // "WOHNBEDARF" over its windows, an arched window. The west side is guessed.
    id: 'w124795057', name: 'the Konsum block',
    exclude: [{ x: -467.2, z: 191.8, r: 3 }],
    floor: -21.0, base: -21.7, colour: C.sand, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-478.3, 184.3], [-482, 196], [-458.8, 203.4], [-454.6, 190.2], [-473.2, 184.3], [-473.7, 185.9]], top: -3.26 },
      { ring: [[-473.7, 185.8], [-482.5, 182.9], [-478.8, 172], [-470, 175]], top: -2.21 },
      { ring: [[-455.5, 189.9], [-473.2, 184.3], [-470, 175], [-452.5, 180.9]], top: -13.39 },
      { ring: [[-477.9, 206.5], [-478.8, 204.5], [-476.5, 197.8], [-459.1, 203.3], [-462, 211.9]], top: -12.97 }
    ],
    cornice: { out: 0.4, thick: 0.3, colour: [0.3, 0.29, 0.27] },
    shops: [
      { on: [[-458.8, 203.4], [-454.6, 190.2]], s0: 0.6, s1: 13.3, top: -17.0, piers: C.sand },
      { on: [[-455.5, 189.9], [-452.5, 180.9]], s0: 0.5, s1: 9.0, top: -17.0, piers: C.sand },
      { on: [[-459.1, 203.3], [-462, 211.9]], s0: 0.5, s1: 8.6, top: -17.0, piers: C.sand }
    ]
  },
  {
    // The white block with the ibex at the Skistrasse (batch 4 of 11/1745/1007): seven storeys to −1.7, the low shops
    // along its north side and by its west corner (−12.0) and east of it (−15.18, in w1530254981, built and walled here). 2013 from
    // the north (209610027321773): white render, the low white shops with blue signs; 2026 from the south-west
    // (1360125209534863) balconies with flowers; 2019 (224524136141402, 920214645421258). The painted ibex on its
    // north wall is left out.
    id: 'w116881286', name: 'the white block at the Skistrasse',
    exclude: [{ x: -458.7, z: 279.5, r: 3 }],
    floor: -20.2, base: -20.9, colour: C.white, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-469.5, 271.6], [-475.7, 284.1], [-459.3, 292.3], [-453.1, 279.8]], top: -1.7 },
      { ring: [[-451.7, 274.8], [-467.3, 267.1], [-469.5, 271.6], [-454, 279.4]], top: -12.02 },
      { ring: [[-477.3, 287.2], [-468.4, 291.6], [-466.9, 288.5], [-475.7, 284.1]], top: -12.02 },
      { ring: [[-446.7, 286.3], [-454.4, 282.4], [-453.1, 279.8], [-454, 279.4], [-451.7, 274.8], [-439.9, 280.7]], top: -15.18 }
    ],
    cornice: { out: 0.4, thick: 0.3, colour: [0.55, 0.55, 0.53] },
    shops: [
      { on: [[-451.7, 274.8], [-467.3, 267.1]], s0: 0.6, s1: 16.8, top: -15.6, piers: C.white, fascia: [0.06, 0.16, 0.42] }
    ],
    balconies: [{ on: [[-475.7, 284.1], [-459.3, 292.3]], s0: 1.0, s1: 17.3, floors: [-11.5, -8.6, -5.7], depth: 1.3, rail: 'glass' }]
  },
  {
    // The chalet north-west of the Ochsen (batch 2 of 11/1745/1008): a saddle roof (ridge −0.7, eaves −7) running
    // east-north-east, and round its west and south sides the flat annex of batch 0 (−12.79, in no OSM building: built
    // and walled with it). 2015 and 2013 from the south (263106388833001, 294233338843519): dark timber upper floors and
    // gable over a white ground floor, balconies; 2026 (1637258878113947) the annex's white front with an orange
    // painting. The north side is guessed.
    id: 'w124795028', name: 'the chalet by the Ochsen',
    exclude: [{ x: -454.6, z: 162.5, r: 3 }, { x: -461, z: 164, r: 3 }],
    floor: -21.0, base: -21.6, colour: [0.6, 0.58, 0.54], shutters: SHUTTERS.none, bay: 1.0, plinth: 0.4,
    timber: { from: -15.2, colour: C.logs, parts: [0] },
    parts: [
      { ring: [[-460.9, 152.8], [-444.1, 158.3], [-448.2, 170.8], [-449.2, 170.5], [-449.9, 172.6], [-458.3, 169.8], [-457.6, 167.8], [-465, 165.3]], roofs: [0] },
      { ring: [[-460.7, 154.9], [-472.3, 151.3], [-475.5, 161.6], [-474.8, 161.8], [-476.5, 167.1], [-463.6, 171.6], [-464, 172.7], [-451.1, 176.8], [-449.1, 170.3], [-449.9, 170.2], [-450.3, 171.4], [-457.1, 169.3], [-456.5, 167.4], [-463.9, 165]], top: -12.79 }
    ],
    roofs: [{ a: [-463.86, 159.06], b: [-445.38, 164.96], y: -0.7, eaves: -7.6, cL: 7.6, cR: 9.4 }],
    cornice: { out: 0.3, thick: 0.25, colour: [0.3, 0.3, 0.29], parts: [1] },
    balconies: [{ on: [[-458.3, 169.8], [-449.9, 172.6]], s0: 0.6, s1: 8.2, floors: [-12.3, -9.4], depth: 1.2, rail: 'timber' }]
  },
  {
    // The dark house on the corner of the Guggerbachstrasse (batch 11 of 11/1745/1008): flat roof at −6.6, five storeys.
    // 2015 from the south (746980956015593): grey-brown render, arched windows on the ground floor, dark timber
    // balconies on the top floors; 2026 (1494139356064742) the arched door. The north and west sides are guessed.
    id: 'w117012290', name: 'the dark house on the corner',
    exclude: [{ x: -450.2, z: 145.6, r: 3 }],
    floor: -20.3, base: -21.0, colour: C.umber, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.5,
    parts: [{ ring: [[-451.2, 136.8], [-441.8, 139.6], [-444.7, 149.6], [-446.1, 154.3], [-458.6, 150.6], [-455.9, 141.4], [-452.8, 142.3]], top: -6.65 }],
    cornice: { out: 0.5, thick: 0.3, colour: [0.1, 0.06, 0.035] },
    balconies: [{ on: [[-441.8, 139.6], [-444.7, 149.6]], s0: 1.0, s1: 9.4, floors: [-11.6, -8.7], depth: 1.2, rail: 'timber' }]
  },
  {
    // The ochre block with the pizzeria south of the Spar (batch 15 of 11/1745/1007, which also holds the Spar, the
    // Ochsen and the back of w116881155): flat roof at −9.6, small parts at −12.25 and −13.9 on its north, the long low
    // strip along its east side (−12.57) and the small parts by the Spar (−15.88, −11.45), these in no OSM building:
    // built and walled here. 2019 from the south-west (522714905421297): ochre render, dark brown balconies, the
    // pizzeria and the bar under a dark fascia on the street; 2021 (428734461903489) and 2015 (369819931015720) the
    // street. The east strip is guessed.
    id: 'w1530254979', name: 'the ochre block south of the Spar',
    exclude: [{ x: -442.2, z: 231.9, r: 3 }],
    floor: -23.5, base: -24.4, colour: C.ochre, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-427.5, 208.9], [-428.3, 211.4], [-433.5, 209.8], [-435.4, 215.2], [-439.6, 213.7], [-440.9, 217.3], [-445.6, 215.6], [-453.6, 237.9], [-435.7, 244.4], [-428, 222.9], [-424.7, 224], [-419.9, 210.7], [-424.5, 209], [-424.8, 209.7]], top: -9.6 },
      { ring: [[-443.2, 212.3], [-444.6, 216], [-440.9, 217.3], [-439.6, 213.7]], top: -12.25 },
      { ring: [[-433.5, 209.8], [-435.4, 215.2], [-441.7, 212.9], [-439.9, 207.9]], top: -13.9 },
      { ring: [[-437.6, 257.9], [-440.9, 256], [-440.4, 254.7], [-442.9, 253.8], [-439.1, 243.2], [-435.7, 244.4], [-428, 222.9], [-425.3, 223.8]], top: -12.57, colour: C.white },
      { ring: [[-429.7, 247.3], [-435.6, 258.9], [-437.6, 257.9], [-433.2, 245.6]], top: -15.88, colour: C.white },
      { ring: [[-440.4, 254.7], [-443.3, 253.7], [-444.9, 258.2], [-442.1, 259.2]], top: -11.45, colour: C.white, foot: false }
    ],
    cornice: { out: 0.6, thick: 0.3, colour: [0.1, 0.06, 0.035] },
    shops: [{ on: [[-445.6, 215.6], [-453.6, 237.9]], s0: 0.8, s1: 22.9, top: -17.6, piers: [0.08, 0.06, 0.05] }],
    balconies: [{ on: [[-445.6, 215.6], [-453.6, 237.9]], s0: 2.0, s1: 21.6, floors: [-14.8, -11.9], depth: 1.3, rail: 'timber' }]
  },
  {
    // The Spar (in batch 15 of 11/1745/1007): flat roof at −11.69, the shop on the Talstrasse a storey over the ground
    // falling away behind it. 2019 from the south-west and west (194026205885329, 920214645421258): white render, the
    // shop's glazing on the street under a flat canopy, SPAR on its fascia (the sign js/shops.js'); 2021 from the
    // south-west (533921557901768) the canopy at the right edge.
    id: 'w1530254980', name: 'the Spar',
    exclude: [],
    floor: -21.0, base: -23.8, colour: C.white, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.3,
    parts: [{ ring: [[-453.3, 237.1], [-456.4, 236], [-464.5, 258.5], [-447.2, 264.5], [-443.3, 253.7], [-442.9, 253.8], [-439.1, 243.2], [-453.6, 237.9]], top: -11.69 }],
    cornice: { out: 0.3, thick: 0.4, colour: [0.55, 0.55, 0.53] },
    shops: [{ on: [[-456.4, 236], [-464.5, 258.5]], s0: 0.8, s1: 23.1, top: -16.4, piers: C.white }],
    canopies: [{ on: [[-456.4, 236], [-464.5, 258.5]], s0: 0, s1: 23.9, y: -16.4, depth: 1.8, colour: [0.55, 0.55, 0.53] }]
  },
  {
    // The Hotel Ochsen and its steakhouse (in batch 15 of 11/1745/1007): flat roof at −0.45, seven storeys. 2021 from
    // the south-west (533921557901768, 4280943675323731) and 2026 (1089993453556095): terracotta render over a white
    // ground floor, balconies with flowers on the street front; 2013 from the north (507754173583303,
    // 641896616716338). The back is guessed.
    id: 'w116881289', name: 'the Hotel Ochsen',
    exclude: [],
    floor: -23.0, base: -23.9, colour: C.terracotta, bands: [[-17.3, C.white]], shutters: SHUTTERS.none, bay: 1.0, plinth: 0.3,
    parts: [{ ring: [[-430.6, 192.1], [-431.1, 193.9], [-443.7, 190.1], [-448.4, 205.3], [-424.8, 209.7], [-420.3, 195.2]], top: -0.45 }],
    cornice: { out: 0.4, thick: 0.3, colour: [0.55, 0.55, 0.53] },
    shops: [{ on: [[-443.7, 190.1], [-448.4, 205.3]], s0: 0.8, s1: 15.1, top: -17.6, piers: C.white }],
    balconies: [{ on: [[-443.7, 190.1], [-448.4, 205.3]], s0: 1.0, s1: 14.9, floors: [-14.3, -11.4, -8.5, -5.6], depth: 1.3, rail: 'glass' }]
  },
  {
    // The back of the house north-east of the Spar (w116881155; its parts in batch 15 of 11/1745/1007 at −16.54,
    // −13.36 and −8.32; its other parts stay streamed and its OSM walls the player's): plain white, guessed.
    id: 'w116881155', name: 'the back of the house beyond the Spar', register: false,
    exclude: [],
    floor: -22.5, base: -23.2, colour: C.white, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.3,
    parts: [
      { ring: [[-432.6, 273.6], [-435, 272.3], [-429.7, 261.9], [-431.6, 260.9], [-431.3, 260.4], [-424.3, 264.5]], top: -16.54 },
      { ring: [[-441, 256.2], [-444.3, 265.5], [-451.3, 263.3], [-451.7, 264.2], [-435.1, 272.6], [-429.7, 261.9]], top: -13.36 },
      { ring: [[-444.9, 258.2], [-447.2, 264.5], [-444.3, 265.5], [-442.1, 259.2]], top: -8.32 }
    ],
    cornice: { out: 0.3, thick: 0.25, colour: [0.3, 0.3, 0.29] }
  },
  {
    // The Ochsen 2 (batch 12 of 11/1745/1008): flat roof at −1.95, seven storeys over the ground falling to the east.
    // 2021 from the south-west (600508837996428, 433034364776381): white render, dark windows, "HOTEL" and "OCHSEN 2"
    // in red up its corner (left out: js/shops.js' sign stays); 2026 (1089993453556095); 2013 from the north
    // (167782325227212). The east side is guessed.
    id: 'w124794982', name: 'the Ochsen 2',
    exclude: [{ x: -428.1, z: 170.5, r: 3 }],
    floor: -23.0, base: -24.0, colour: C.white, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[-416.3, 163], [-422.5, 161.1], [-421.7, 158.8], [-423.5, 158.2], [-423.1, 157], [-430.8, 154.6], [-439.7, 183.1], [-431, 185.9], [-430.5, 184.3], [-423.7, 186.4]], top: -1.95 }],
    cornice: { out: 0.4, thick: 0.3, colour: [0.25, 0.25, 0.25] },
    shops: [{ on: [[-430.8, 154.6], [-439.7, 183.1]], s0: 1.0, s1: 28.9, top: -17.4, piers: C.white }]
  },
  {
    // Caprizzi (batch 18 of 11/1746/1008): flat roofs at −5.9 and −7.6, five storeys. 2013 from the north-west
    // (836465323655992): mauve-grey render, white windows, the shop on the Talstrasse with "CAPRIZZI" over it (left
    // out); 2014 from the east (4607715212590699) and 2013 (781719762473844). The east side is guessed.
    id: 'w124794978', name: 'Caprizzi',
    exclude: [{ x: -418.1, z: 137.8, r: 3 }],
    floor: -20.9, base: -21.6, colour: C.mauve, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-421.1, 146.2], [-427.7, 139.8], [-422.4, 126.2], [-413.6, 127.1]], top: -5.9 },
      { ring: [[-408.7, 127.8], [-413.6, 127.1], [-421.1, 146.2], [-417.1, 149.5]], top: -7.62 }
    ],
    cornice: { out: 0.3, thick: 0.3, colour: [0.5, 0.5, 0.48] },
    shops: [{ on: [[-427.7, 139.8], [-422.4, 126.2]], s0: 0.8, s1: 13.8, top: -17.4, piers: [0.5, 0.5, 0.48] }]
  },
  {
    // The house with the café Hübsch (batch 7 of 11/1746/1008): flat roof at −2.23 under a deep timber eaves slab, low
    // wings at −12.71 (west) and −8.56 (east). 2015 from the south (1118161638692725, the left edge of 1034730169595029
    // 2026): white render, dark timber balconies, a shop on the ground floor ("corona" in 2015); 2013 from the north-east
    // (4030230080361917, 283955540101782). The west wing is guessed.
    id: 'w124795043', name: 'the house with the café',
    exclude: [{ x: -421.3, z: 79.4, r: 3 }],
    floor: -20.9, base: -21.6, colour: C.white, bands: [[-18.0, C.stone]], shutters: SHUTTERS.none, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-406.5, 78.2], [-412.6, 88.1], [-423.9, 81.1], [-426.3, 85.1], [-434.1, 80.3], [-425.5, 66.4]], top: -2.23 },
      { ring: [[-438.2, 86.6], [-428.1, 92.8], [-421.7, 82.5], [-423.9, 81.1], [-426.3, 85.1], [-434.1, 80.3]], top: -12.71 },
      { ring: [[-404.1, 79.7], [-406.5, 78.2], [-411.6, 86.5], [-409.3, 87.9]], top: -8.56 }
    ],
    cornice: { out: 1.0, thick: 0.35, colour: [0.14, 0.072, 0.038] },
    shops: [{ on: [[-409.3, 87.9], [-404.1, 79.7]], s0: 0.5, s1: 9.2, top: -17.4, piers: C.white }],
    balconies: [{ on: [[-412.6, 88.1], [-423.9, 81.1]], s0: 1.0, s1: 12.3, floors: [-12.2, -9.3, -6.4], depth: 1.3, rail: 'timber' }]
  },
  {
    // The yellow block by the Kurpark (batch 9 of 11/1746/1009): flat roof at −2.21, six storeys, a low wing on its
    // south-west (−13.91). 2013 from the north-east (283955540101782, 464808578185526): mustard render, white windows,
    // the low wing's shop; 2015 and 2026 from the south (1118161638692725, 1034730169595029). The back is guessed.
    id: 'w124795047', name: 'the yellow block',
    exclude: [{ x: -401.2, z: 49.9, r: 3 }],
    floor: -21.3, base: -22.0, colour: C.mustard, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-385.8, 45], [-394.5, 59.3], [-398.7, 56.8], [-401.2, 60.9], [-406.1, 58], [-408.8, 62.4], [-416.6, 57.7], [-402.6, 34.8]], top: -2.21 },
      { ring: [[-407.4, 58.2], [-408, 59.1], [-398.1, 65.1], [-392.3, 55.6], [-393.1, 55.1], [-395.4, 58.8], [-398.7, 56.8], [-401.2, 60.9], [-406.1, 58], [-406.6, 58.8]], top: -13.91, colour: C.white }
    ],
    cornice: { out: 0.4, thick: 0.3, colour: [0.5, 0.5, 0.48] }
  },
  {
    // The cream house on the Talstrasse's bend by the Kurpark (batches 9 and 2 of 11/1746/1008): a saddle roof (ridge
    // −5.6) running east-north-east whose north slope reaches down over the house's north wing (eaves −11.1), the south
    // slope to −8.6; a flat garage on its east (−14.76, in no OSM building: built and walled here, but for its south end,
// which lies in the neighbour w221123480 and is left out). 2013 from the north
    // (4030230080361917): cream render, brown shutters, the garage doors; 2021 from the south-west (225489892866447).
    // The doors and the west side are guessed.
    id: 'w221123483', name: 'the cream house on the bend',
    exclude: [{ x: -403, z: 106.8, r: 3 }, { x: -393.8, z: 107.6, r: 3 }],
    floor: -21.2, base: -21.9, colour: C.cream, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.4,
    parts: [
      { ring: [[-399.6, 95.9], [-392.1, 98.8], [-395.3, 107.8], [-396.2, 109.7], [-395.7, 110], [-398.2, 115.5], [-400.1, 115], [-401.5, 117.8], [-413.2, 112.7], [-406.6, 101.5], [-403.8, 102.6]], roofs: [0] },
      { ring: [[-394.5, 102.3], [-390.5, 104.1], [-391, 105.1], [-392.8, 109], [-395.3, 107.8]], top: -14.76 }
    ],
    roofs: [{ a: [-411.84, 106.54], b: [-396.25, 112.53], y: -5.6, eaves: -11.34, eavesR: -8.81, cL: 14.9, cR: 7.2 }],
    cornice: { out: 0.3, thick: 0.25, colour: [0.3, 0.3, 0.29], parts: [1] },
    doors: [{ on: [[-391, 105.1], [-392.8, 109]], s: 2.15, w: 2.4, colour: [0.32, 0.3, 0.27] }]
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
  const eL = R.eaves, eR = R.eavesR ?? R.eaves;
  let y = c >= 0 ? R.y - ((R.y - eR) * c) / R.cR : R.y + ((R.y - eL) * c) / R.cL;
  const [h0, h1] = hips(R), drop = R.y - Math.max(eL, eR);
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
export const groundOutlines = (house) => house.parts.filter((p) => p.foot !== false).map((p) => p.ring);
/** Is a point inside one of the row's houses? */
export const insideRow = (x, z) => HOUSES.some((h) => h.parts.some((p) => pointInRing(p.ring, x, z)));

/**
 * A wall's frame from a segment (a, b) on a house's outline, turned so that it faces out of the part whose outline
 * holds it (its n leaving that part; a lower part may stand before it)
 */
export function wallOut(house, a, b) {
  const F = wallFrame(a, b), [x, z] = onWall(F, F.len / 2, 0.4);
  const has = (p, q) => p.ring.some((r) => Math.hypot(r[0] - q[0], r[1] - q[1]) < 0.01);
  const own = house.parts.filter((p) => has(p, a) && has(p, b));
  return (own.length ? own : house.parts).some((p) => pointInRing(p.ring, x, z)) ? wallFrame(b, a) : F;
}

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // by the Pauluskirche looking up the street: La Carretta's house, the white block, the H&M's timber blocks
  carretta: [-786, -12.6, 612, -740, -8.0, 575],
  // on the Talstrasse by the Rathaus looking north-east: the house with the awnings, the hotel by the railway, Am Bergli
  rathaus: [-588, -16.0, 384, -540, -11.0, 330],
  // by the Spar looking north-north-east: the Konsum, the Ochsen, the Ochsen 2, the chalet
  ochsen: [-470, -18.6, 250, -445, -12.0, 185]
};

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
