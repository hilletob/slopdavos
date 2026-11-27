// The houses along the Mattastrasse in Davos Platz from its west end (the Bolgenblick) past Sport Hofmänner to the
// s'Matta-Schlössli (js/mattastrasse-1.js): seventeen houses by hand in one module, each its surveyed volumes, its roofs
// and its look. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1746/1007, 11/1746/1008, 11/1747/1007, 11/1747/1008; the batches named at each
// house): the outlines below are its walls at the ground (or its flat roofs' outlines, the walls under them), the
// pitched roofs its sloped triangles cleaned into planes; heights in the world frame (y = m a.s.l. − 1558,
// js/davos-frame.js; x east, z south). The street runs from the west end (−422/121) east to the railway's bridge
// (−340/148), south-east over the Landwasser to (−303/178), east past Sport Hofmänner and the Bräma (−226/209,
// −180/219) and north-east to (−103/183). The look after Mapillary's street views (CC BY-SA, 2013–2026), each house's
// note saying which photographs show it and what is guessed. Several houses were rebuilt after the photographs of
// 2015 (the survey is newer): those are drawn after the survey's volumes in a plain modern look, and say so.
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

// --- Colours (linear) ----------------------------------------------------------------------------------------------------
export const COLOURS = {
  white: [0.6, 0.6, 0.58], bright: [0.63, 0.63, 0.61], cream: [0.56, 0.5, 0.37], warm: [0.45, 0.4, 0.3],
  pale: [0.58, 0.52, 0.36], beige: [0.48, 0.4, 0.28], greyBeige: [0.44, 0.41, 0.35], lightGrey: [0.52, 0.52, 0.5],
  grey: [0.3, 0.3, 0.31], stone: [0.24, 0.21, 0.17], green: [0.3, 0.42, 0.34],
  logs: [0.15, 0.078, 0.04], planks: [0.2, 0.105, 0.055], larch: [0.3, 0.16, 0.07]
};
const C = COLOURS;
// The shutters' kinds (the walls' material draws them beside every window): none, grey-green, white, brown
export const SHUTTERS = { none: 0, grey: 1, white: 2, brown: 3 };

// --- The roofs' frames ------------------------------------------------------------------------------------------------------
// The cross-gabled house over the Landwasser (w126271055): the main ridge (south-east) and the cross ridge (south-west)
const XM = { a: [-320.6, 136.8], b: [-311.2, 144.1] };
const XC = frame([-312.2, 136.0], [-320.4, 146.6]);
// The chalet's ridge (south-east), the annex's (south-south-east, from the chalet's wall on)
const CH = { a: [-237.5, 216.3], b: [-227.1, 225.3] };
const AN = frame([-229.5, 221.8], [-224.1, 232.3]);
// The s'Matta-Schlössli's wing (its gable on the street, south-west)
const MW = { a: [-104.05, 170.15], b: [-98.05, 163.9] };

/**
 * Each house: `id` (OpenStreetMap), `exclude` (swissBUILDINGS3D's batches' centres, r 3; a batch holding several houses
 * is excluded at one of them, the others rebuilt beside it), `floor` (its storeys' grid: the ground floor's foot),
 * `base` (how far down its walls reach), `colour` (its plaster), `bands` ([yTop, colour]: a colour under yTop),
 * `shutters`, `bay` (its bays' spacing as a share of BAY), `plinth` (the grey render along its foot, m over the
 * ground), `timber` ({ from, colour, gables?: true }: logs or planks over `from`, or in the gables only), `parts`
 * ({ ring, top } flat-roofed; { ring, roofs: [i] } under the house's pitched roofs; `colour`, `closed`, `timberAll`,
 * `timberFrom` of their own), `roofs` ({ a, b: the ridge's ends at the verges, y: the ridge, eaves, cL, cR: how far
 * the eaves lie left and right of a→b }), `cornice` (an eaves slab round flat roofs: { out, thick, colour, parts? }),
 * `shops`, `balconies` (`raw`: on[0]→on[1] has the outside on its right, over a lower roof), `decals` ({ on: a wall's
 * ends, the outside on the right of on[0]→on[1], s0, s1 along it, y0, y1, key, board?: a board behind, out?: how far before the wall }),
 * `shopIds` (businesses whose generic sign gives way to the board drawn here), `note` what is guessed.
 */
export const HOUSES = [
  {
    // The west end, south of the street (batch 3 of 11/1746/1008, which holds three houses: this one, w124794955 and
    // w1530254978, each rebuilt here): three storeys under a flat roof (−12.2), a sliver at −12.1 along its south side
    // taken in. No photograph shows it (the 2021 and 2026 views from the Promenade, 392502228901755, 433034364776381,
    // 1483848780188043, look up the street past the Hotel Ochsen; 471640007455648 of 2013 from the west shows the
    // grey house on the corner, w124794978): cream render with grey shutters like the street's older houses, guessed.
    id: 'w1530254977', name: 'the cream house at the west end',
    exclude: [{ x: -398.8, z: 148.8, r: 3 }],
    floor: -22.19, base: -22.7, colour: C.cream, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[-416.7, 151.2], [-414.2, 144.8], [-410.8, 135.7], [-398.5, 141.1], [-401.3, 147.3], [-394.0, 151.9], [-395.8, 153.2], [-399.8, 161.6], [-398.9, 162.6], [-412.5, 154.5]], top: -12.22 }],
    cornice: { out: 0.45, thick: 0.25, colour: [0.12, 0.08, 0.05] },
    note: 'guessed: no photograph'
  },
  {
    // Its neighbour on the street (in batch 3 of 11/1746/1008): three storeys under a flat roof (−13.2), its street
    // side stepped. Not in the photographs (see above): white render with brown shutters like Casa Ghidoni opposite
    // (471640007455648), guessed.
    id: 'w124794955', name: 'the white house at the west end',
    exclude: [],
    floor: -22.19, base: -22.7, colour: C.white, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[-392.3, 130.8], [-381.4, 135.1], [-383.2, 139.8], [-382.1, 140.2], [-383.8, 144.5], [-382.4, 145.1], [-387.3, 157.3], [-394.8, 153.7], [-394.0, 151.9], [-394.7, 151.4], [-394.1, 150.3], [-398.8, 147.3]], top: -13.2 }],
    cornice: { out: 0.4, thick: 0.25, colour: [0.12, 0.08, 0.05] },
    note: 'guessed: no photograph'
  },
  {
    // The house behind them (in batch 3 of 11/1746/1008): four storeys under a flat roof (−10.8). Not in the
    // photographs: pale yellow render with grey shutters, guessed.
    id: 'w1530254978', name: 'the yellow house behind',
    exclude: [],
    floor: -22.19, base: -22.7, colour: C.pale, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[-395.8, 153.2], [-399.8, 161.6], [-389.6, 166.4], [-385.7, 158.0]], top: -10.8 }],
    cornice: { out: 0.4, thick: 0.25, colour: [0.25, 0.25, 0.25] },
    note: 'guessed: no photograph'
  },
  {
    // The Bolgenblick, north of the street (batches 6 and 20 of 11/1746/1008): five storeys under a flat roof (−5.55)
    // whose eaves stand out 0.8 m, a stack of bays on its south side, a one-storey annex on its north-east corner
    // (−15.2). 2014 from the east (299544161696687; 194923132306784 and 1101779750317043 through the railway's
    // bridge): white render, white windows, BOLGENBLICK on the east front between the third and fourth floors, the
    // green-framed bays, a dark eaves band, the low annex. Its west and north sides are guessed.
    id: 'w124794946', name: 'Bolgenblick',
    exclude: [{ x: -377.8, z: 112.1, r: 3 }, { x: -382.6, z: 116.8, r: 3 }],
    floor: -21.81, base: -22.5, colour: C.bright, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.45,
    parts: [
      { ring: [[-388.8, 118.8], [-386.6, 112.8], [-385.6, 110.3], [-381.8, 112.1], [-376.4, 115.7], [-379.2, 123.3], [-382.6, 121.5], [-385.2, 120.6]], top: -5.55 },
      { ring: [[-382.6, 121.5], [-383.3, 122.9], [-385.6, 121.7], [-385.2, 120.6]], top: -6.1, colour: C.green },
      { ring: [[-381.8, 112.1], [-380.1, 108.4], [-373.9, 111.2], [-375.9, 115.9], [-376.4, 115.7]], top: -15.21 }
    ],
    cornice: { out: 0.8, thick: 0.4, colour: [0.1, 0.06, 0.035], parts: [0] },
    decals: [{ on: [[-379.2, 123.3], [-376.4, 115.7]], s0: 1.1, s1: 7.0, y0: -10.55, y1: -9.85, key: 'bolgenblick' }]
  },
  {
    // The cream block on the street's bend (batches 4, 11 and 21 of 11/1746/1008): six storeys under a flat roof
    // (−4.9) on the street, a four-storey wing behind (−11.2) and a lower one (−14.35). 2014 from the east
    // (299544161696687 close by, 257049486104516, 209802070644689, 755098891855933 over the Landwasser): cream render,
    // dark-framed windows, the shop windows framed in red on the ground floor along the street, steps, a dark eaves
    // band. The wings behind are guessed.
    id: 'w124795046', name: 'the cream block on the bend',
    exclude: [{ x: -371.2, z: 153.3, r: 3 }, { x: -376.3, z: 149.4, r: 3 }, { x: -365.3, z: 142.7, r: 3 }],
    floor: -22.16, base: -22.8, colour: C.cream, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.5,
    parts: [
      { ring: [[-353.0, 143.1], [-365.7, 136.7], [-374.9, 134.9], [-376.8, 140.0], [-369.5, 146.3], [-365.6, 148.0], [-359.7, 150.5]], top: -4.9 },
      { ring: [[-376.8, 140.0], [-382.9, 153.8], [-375.0, 158.8], [-369.5, 146.3]], top: -11.18 },
      { ring: [[-369.5, 146.3], [-374.8, 158.3], [-372.6, 159.4], [-365.6, 148.0]], top: -14.35 }
    ],
    cornice: { out: 0.6, thick: 0.35, colour: [0.11, 0.07, 0.04] },
    shops: [
      { on: [[-365.7, 136.7], [-353.0, 143.1]], s0: 1.2, s1: 12.6, top: -17.4, piers: [0.42, 0.05, 0.035] },
      { on: [[-374.9, 134.9], [-365.7, 136.7]], s0: 0.8, s1: 8.6, top: -17.4, piers: [0.42, 0.05, 0.035] }
    ]
  },
  {
    // The white block beyond the Landwasser (batch 14 of 11/1746/1008; batches 1 and 24 of 11/1746/1007, a terrace's slab
    // at the ground before its east wall, stay streamed): four storeys under a flat roof (−11.6), a glazed attic set back (−9.3), the grey stair
    // tower (−9.85). 2014 from the east (516853536021882, 3065434640409891, 257049486104516): white render, small
    // square windows, the grey tower at its north-east end, the attic's dark glass, glass balconies on the south-east
    // corner. Ursolø's Cave's board is drawn here on the east front (OpenStreetMap's outline stands 3–4 m east of the
    // surveyed wall, where its generic sign would float; its lettering is not in the photographs: the generic sign's
    // look).
    id: 'w116881142', name: 'the white block over the Landwasser',
    exclude: [{ x: -350.6, z: 176.9, r: 3 }],
    floor: -23.51, base: -24.0, colour: C.bright, shutters: SHUTTERS.none, bay: 0.95, plinth: 0.4,
    parts: [
      { ring: [[-340.2, 174.5], [-352.1, 166.5], [-357.3, 170.5], [-359.0, 172.9], [-361.2, 179.0], [-348.8, 187.3]], top: -11.61 },
      { ring: [[-353.3, 167.5], [-356.9, 170.9], [-358.4, 173.1], [-360.3, 177.9], [-351.1, 184.1], [-344.1, 173.6]], top: -9.28, colour: C.grey, setback: true },
      { ring: [[-341.2, 175.8], [-344.2, 173.7], [-349.6, 181.8], [-346.6, 183.8]], top: -9.85, colour: C.grey, closed: true, setback: true }
    ],
    cornice: { out: 0.25, thick: 0.25, colour: [0.55, 0.55, 0.53], parts: [0] },
    balconies: [{ on: [[-348.8, 187.3], [-340.2, 174.5]], s0: 1.0, s1: 6.0, floors: [-20.61, -17.71, -14.81], depth: 1.4, rail: 'glass' }],
    shopIds: ['n12164161200'],
    decals: [{ on: [[-348.8, 187.3], [-340.2, 174.5]], s0: 7.4, s1: 10.6, y0: -17.95, y1: -17.35, key: 'ursolo', board: [0.2, 0.21, 0.22] }]
  },
  {
    // The cross-gabled house north of the street over the Landwasser (batch 19 of 11/1746/1008): a square under two
    // saddle roofs crossing, the one running south-east (ridge −6.5, eaves −8.5), the other south-west (ridge −6.8,
    // eaves −10.6), gables on all four sides. 2019 from its north-west corner (2209456002525209): white render, white
    // windows in deep brown surrounds, a porch with a flat roof and timber glazing. Its other sides are guessed.
    id: 'w126271055', name: 'the cross-gabled house',
    exclude: [{ x: -316.0, z: 140.4, r: 3 }],
    floor: -23.12, base: -23.6, colour: C.white, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.4,
    parts: [{ ring: [[-323.0, 141.3], [-316.9, 133.6], [-309.1, 139.7], [-309.6, 140.3], [-315.1, 147.3], [-317.4, 145.5], [-318.5, 146.8], [-321.2, 144.7], [-320.2, 143.5]], roofs: [0, 1] }],
    roofs: [
      { a: XM.a, b: XM.b, y: -6.5, eaves: -8.5, cL: 5.2, cR: 5.2, skin: 'roof' },
      { a: XC.o, b: at(XC, 12.6, 0), y: -6.8, eaves: -10.6, cL: 5.7, cR: 6.3, skin: 'roof' }
    ]
  },
  {
    // The chalet opposite Sport Hofmänner (batch 13 of 11/1747/1007): a saddle roof running south-east (ridge −11.2,
    // eaves −13.8) whose gable faces the street, 1 m out over its walls. 2015 from the street to the west
    // (297100845399093, 1164644890615165, 261537362419705): a white ground floor with a barred window, dark logs over
    // it, green shutters, the gable's two windows. The south-east side is guessed.
    id: 'w124794951', name: 'the chalet',
    exclude: [{ x: -232.3, z: 220.8, r: 3 }],
    floor: -22.14, base: -22.6, colour: C.white, shutters: SHUTTERS.grey, bay: 1.0, plinth: 0.35,
    timber: { from: -16.5, colour: C.logs },
    gableWindows: [{ on: [[-239.3, 219.9], [-234.2, 214.0]], y0: -13.25, y1: -12.25, at: [-0.85, 0.85] }],
    parts: [{ ring: [[-239.3, 219.9], [-234.2, 214.0], [-226.0, 221.0], [-230.3, 227.5]], roofs: [0] }],
    roofs: [{ a: CH.a, b: CH.b, y: -11.2, eaves: -13.8, cL: 4.9, cR: 4.9, skin: 'roof' }]
  },
  {
    // The annex south-east of the chalet (batch 11 of 11/1747/1007, its middle in this house, a third of it in the
    // chalet's): a saddle roof running south-south-east from the chalet's wall (ridge −11.2, eaves −13.15). Behind the
    // chalet in the photographs: white render, brown shutters, a timber gable, guessed.
    id: 'w1530308095', name: 'the annex behind the chalet',
    exclude: [{ x: -226.5, z: 226.9, r: 3 }],
    floor: -21.85, base: -22.6, colour: C.white, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.35,
    timber: { from: -12.85, colour: C.planks },
    parts: [{ ring: [[-226.0, 221.0], [-225.6, 222.0], [-222.6, 229.5], [-224.5, 231.65], [-226.3, 233.1], [-229.6, 228.7], [-230.3, 227.5]], roofs: [0] }],
    roofs: [{ a: at(AN, 0.5, 0), b: at(AN, 12.0, 0), y: -11.2, eaves: -13.15, cL: 3.9, cR: 3.9, skin: 'roof' }],
    note: 'guessed: behind the chalet in the photographs'
  },
  {
    // The block south of the street past the chalet (batch 2 of 11/1747/1007): four storeys under a flat roof
    // (−7.9). The 2015 views (256916249463499, 160079036041462, 297100845399093) show a building site here (a yellow
    // container, the builders' flags): plain light render, its windows in a regular grid, a thin dark edge, guessed.
    id: 'w965237015', name: 'the new block past the chalet',
    exclude: [{ x: -198.7, z: 235.8, r: 3 }],
    floor: -21.7, base: -22.2, colour: [0.57, 0.57, 0.55], shutters: SHUTTERS.none, bay: 1.1, plinth: 0.4,
    parts: [{ ring: [[-207.7, 230.0], [-195.6, 225.6], [-189.7, 241.6], [-201.8, 246.0]], top: -7.93 }],
    cornice: { out: 0.4, thick: 0.3, colour: [0.2, 0.2, 0.2] },
    balconies: [{ on: [[-189.7, 241.6], [-201.8, 246.0]], s0: 1.5, s1: 11.4, floors: [-15.9, -13.0, -10.1], depth: 1.5, rail: 'glass' }],
    note: 'guessed: a building site in 2015'
  },
  {
    // The Bräma (batch 4 of 11/1747/1007, which also holds the hardware shop's house w1530308093 and its neighbour
    // w1530308092, rebuilt beside it): the long block north of the street, six storeys stepped (−0.45 over the middle,
    // −3.2 at both ends and along the north) over a podium of two storeys (−13.4) with the shops along the street and
    // the restaurant's wing on the west (−14.2), a strip along the north (−13.4). 2015 from the street to the west
    // (297100845399093, 1164644890615165, 261537362419705, 256916249463499): the podium's dark timber band over the
    // shop windows, the block's cream render behind a balcony on every floor with brown timber rails, stepped at its
    // ends. The north side and the west wing's look are guessed.
    id: 'w124794959', name: 'Bräma',
    exclude: [{ x: -168.1, z: 187.8, r: 3 }],
    floor: -22.74, base: -23.2, colour: C.warm, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.35,
    parts: [
      { ring: [[-163.3, 186.7], [-165.1, 192.1], [-165.7, 192.0], [-167.2, 196.7], [-191.8, 188.6], [-186.8, 173.7], [-184.4, 174.5], [-184.8, 175.8], [-182.3, 176.6], [-181.2, 175.6], [-177.7, 176.8], [-178.1, 177.9], [-171.5, 180.1], [-170.3, 179.2], [-167.0, 180.3], [-167.3, 181.3], [-162.8, 182.8], [-164.0, 186.5]], top: -0.45 },
      { ring: [[-194.5, 172.8], [-190.2, 174.3], [-189.6, 172.5], [-158.6, 182.7], [-159.2, 184.3], [-155.7, 185.4], [-160.2, 199.0], [-167.2, 196.7], [-191.7, 188.6], [-198.9, 186.3]], top: -3.17 },
      { ring: [[-191.7, 188.6], [-198.7, 186.3], [-199.2, 186.5], [-200.3, 189.6], [-204.4, 186.2], [-213.2, 196.8], [-202.1, 206.7], [-198.9, 207.8], [-192.9, 204.6], [-191.7, 200.9], [-186.9, 202.3], [-186.5, 201.3], [-181.7, 202.7], [-181.4, 201.5], [-176.6, 202.8], [-176.3, 201.5], [-171.4, 202.5], [-171.1, 201.2], [-165.9, 202.1], [-165.1, 197.4]], top: -13.44, timberAll: true },
      { ring: [[-199.6, 187.7], [-205.6, 182.7], [-218.3, 197.7], [-211.8, 203.2], [-212.1, 203.5], [-210.6, 204.8], [-207.8, 201.6], [-213.2, 196.8], [-204.4, 186.2], [-200.3, 189.6]], top: -14.23 },
      { ring: [[-192.9, 169.6], [-156.2, 182.1], [-158.6, 182.7], [-189.6, 172.5], [-190.2, 174.3], [-194.1, 173.0]], top: -13.44, colour: C.grey, closed: true }
    ],
    cornice: { out: 0.5, thick: 0.35, colour: [0.1, 0.06, 0.035], parts: [0, 1, 2, 3] },
    shops: [
      { on: [[-191.7, 200.9], [-186.9, 202.3]], s0: 0.4, s1: 4.6, top: -17.6, piers: [0.12, 0.065, 0.035] },
      { on: [[-186.5, 201.3], [-181.7, 202.7]], s0: 0.4, s1: 4.6, top: -17.6, piers: [0.12, 0.065, 0.035] },
      { on: [[-181.4, 201.5], [-176.6, 202.8]], s0: 0.4, s1: 4.6, top: -17.6, piers: [0.12, 0.065, 0.035] },
      { on: [[-176.3, 201.5], [-171.4, 202.5]], s0: 0.4, s1: 4.6, top: -17.6, piers: [0.12, 0.065, 0.035] },
      { on: [[-171.1, 201.2], [-165.9, 202.1]], s0: 0.4, s1: 4.9, top: -17.6, piers: [0.12, 0.065, 0.035] },
      { on: [[-218.3, 197.7], [-211.8, 203.2]], s0: 0.6, s1: 7.9, top: -17.6, piers: [0.12, 0.065, 0.035] }
    ],
    balconies: [{ on: [[-198.9, 186.3], [-160.2, 199.0]], raw: true, s0: 1.0, s1: 39.7, floors: [-11.14, -8.24, -5.34], depth: 1.6, rail: 'timber' }]
  },
  {
    // The hardware shop's house east of the Bräma (in batch 4 of 11/1747/1007): three storeys under a flat roof
    // (−10.9), its west wing lower (−13.4). 2015 from the street (462299051518762, 301517304925692): a cream ground
    // floor with the shop's window and a blue board, brown planks over it, white windows. Eisenwaren Kaufmann's board
    // is drawn here on the shop's fascia (its generic sign stood just behind the surveyed wall; the photographs do not
    // read its lettering: blue with white letters). The north and east sides are guessed.
    id: 'w1530308093', name: 'the hardware shop',
    exclude: [],
    floor: -22.74, base: -23.2, colour: C.pale, shutters: SHUTTERS.none, bay: 1.0, plinth: 0.35,
    timber: { from: -16.9, colour: C.planks },
    parts: [
      { ring: [[-146.1, 179.6], [-145.8, 179.1], [-135.9, 181.4], [-135.3, 181.6], [-134.7, 196.6], [-136.8, 197.8], [-143.7, 201.8], [-153.4, 197.8]], top: -10.88 },
      { ring: [[-158.6, 182.7], [-156.2, 182.1], [-154.3, 176.7], [-146.1, 179.6], [-153.4, 197.8], [-159.6, 197.3], [-155.7, 185.4], [-159.2, 184.3]], top: -13.44 }
    ],
    cornice: { out: 0.5, thick: 0.3, colour: [0.1, 0.06, 0.035] },
    shops: [{ on: [[-143.7, 201.8], [-153.4, 197.8]], s0: 0.8, s1: 9.6, top: -16.9, piers: [0.5, 0.45, 0.32] }],
    shopIds: ['n13052134735'],
    decals: [{ on: [[-153.4, 197.8], [-143.7, 201.8]], s0: 2.3, s1: 8.1, y0: -17.45, y1: -16.95, key: 'kaufmann', board: [0.08, 0.2, 0.45], out: 0.2 }]
  },
  {
    // The low house at the east end of the Bräma's batch (in batch 4 of 11/1747/1007): two storeys under a flat roof
    // (−14.6). No photograph: white render, brown shutters, guessed.
    id: 'w1530308092', name: 'the low house east of the hardware shop',
    exclude: [],
    floor: -22.74, base: -23.2, colour: C.white, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.35,
    parts: [{ ring: [[-135.9, 181.4], [-122.2, 173.2], [-117.9, 180.3], [-132.9, 189.3], [-135.0, 189.3], [-135.3, 182.4]], top: -14.59 }],
    cornice: { out: 0.4, thick: 0.25, colour: [0.1, 0.06, 0.035] },
    note: 'guessed: no photograph'
  },
  {
    // The Freihof (in batch 7 of 11/1747/1007, its ground slab batch 0): four storeys under a flat roof (−7.0) on the
    // street, its low wings east of it (−11.9 to −15.0: the garage, a shop) round a small yard (−15.5 here). 2015 from
    // the street to the west (301517304925692, 1076002409555616, 462299051518762): grey-beige render over a rubble
    // stone ground floor, white windows, FREIHOF in tall letters down the street front near its west corner, a timber balcony at the top, the
    // low wing with its garage door. The east side is guessed.
    id: 'w124794960', name: 'Freihof',
    exclude: [{ x: -154.8, z: 238.8, r: 3 }],
    floor: -21.01, base: -21.6, colour: C.greyBeige, bands: [[-18.0, C.stone]], shutters: SHUTTERS.none, bay: 1.0, plinth: 0.3,
    parts: [
      { ring: [[-155.6, 227.7], [-166.9, 232.6], [-163.2, 240.9], [-152.2, 236.1], [-153.0, 234.4], [-150.8, 233.4], [-152.4, 229.8], [-154.3, 230.6]], top: -6.98 },
      { ring: [[-152.2, 236.1], [-153.0, 234.4], [-150.8, 233.4], [-151.1, 232.6], [-150.1, 232.2], [-147.7, 237.6], [-152.0, 239.5], [-153.2, 236.6]], top: -12.65, colour: C.lightGrey },
      { ring: [[-152.1, 239.3], [-156.4, 241.1], [-155.4, 243.4], [-146.9, 239.7], [-147.8, 237.7], [-152.0, 239.5]], top: -14.95, colour: C.lightGrey },
      { ring: [[-155.4, 243.4], [-146.9, 239.7], [-143.6, 247.3], [-154.8, 252.2], [-158.0, 244.9]], top: -14.28, colour: C.lightGrey },
      { ring: [[-155.4, 243.4], [-158.0, 244.9], [-160.3, 239.7], [-157.5, 238.4]], top: -11.92, colour: C.lightGrey },
      { ring: [[-152.1, 239.3], [-153.2, 236.6], [-157.5, 238.4], [-156.4, 241.1]], top: -15.5, colour: C.lightGrey, closed: true }
    ],
    cornice: { out: 0.35, thick: 0.3, colour: [0.5, 0.5, 0.48], parts: [0] },
    balconies: [{ on: [[-163.2, 240.9], [-152.2, 236.1]], raw: true, s0: 0.6, s1: 6.0, floors: [-9.41], depth: 1.3, rail: 'timber' }],
    decals: [{ on: [[-155.6, 227.7], [-166.9, 232.6]], s0: 10.2, s1: 10.8, y0: -17.3, y1: -10.3, key: 'freihof' }]
  },
  {
    // The white house behind the Freihof (in batch 7 of 11/1747/1007): four storeys round a five-storey core (−8.8,
    // −5.7), its north-west wing lower (−12.4), glass balconies on the south. 2015 behind the Freihof (1076002409555616,
    // 256916249463499, 2596019327373860): white render, wide windows, a flat roof with a thin edge. The south side is
    // guessed.
    id: 'w1528682843', name: 'the white house behind the Freihof',
    exclude: [{ x: -159.9, z: 244.1, r: 3 }],
    floor: -21.01, base: -21.6, colour: C.white, shutters: SHUTTERS.none, bay: 1.15, plinth: 0.35,
    parts: [
      { ring: [[-169.6, 237.4], [-170.7, 235.0], [-166.6, 233.2], [-163.5, 240.2], [-166.1, 241.3], [-166.7, 239.9], [-170.9, 241.7], [-172.3, 238.6]], top: -12.37 },
      { ring: [[-176.2, 244.0], [-166.7, 239.9], [-166.1, 241.3], [-163.5, 240.2], [-163.2, 240.9], [-160.3, 239.7], [-154.8, 252.3], [-161.1, 255.1], [-160.3, 257.2], [-163.9, 258.8], [-165.1, 255.9], [-164.8, 256.7], [-170.1, 259.0], [-171.0, 257.1], [-172.0, 257.6], [-175.0, 250.7], [-173.5, 250.1]], top: -8.79 },
      { ring: [[-160.3, 257.2], [-163.9, 258.8], [-165.1, 255.9], [-168.2, 257.2], [-172.5, 247.3], [-160.2, 241.9], [-155.9, 251.6], [-161.6, 254.1]], top: -5.66, setback: true }
    ],
    cornice: { out: 0.3, thick: 0.25, colour: [0.4, 0.4, 0.39] },
    balconies: [
      { on: [[-154.8, 252.3], [-161.1, 255.1]], s0: 0.3, s1: 6.6, floors: [-15.21, -12.31], depth: 1.8, rail: 'glass' },
      { on: [[-164.8, 256.7], [-170.1, 259.0]], s0: 0.3, s1: 5.5, floors: [-15.21, -12.31], depth: 1.8, rail: 'glass' }
    ]
  },
  {
    // The tall block south of the street's bend (batch 9 of 11/1747/1007): six storeys under a flat roof (−1.9). In
    // 2015 (462299051518762, 301517304925692) an old timber barn stood here; the survey has the new block: light
    // render, a regular grid of windows, a dark edge, a closed plinth where the ground rises to its east, guessed.
    id: 'w124794992', name: 'the tall block on the bend',
    exclude: [{ x: -137.1, z: 231.5, r: 3 }],
    floor: -20.62, base: -21.1, colour: C.lightGrey, shutters: SHUTTERS.none, bay: 1.1, plinth: 0.4,
    parts: [{ ring: [[-144.4, 228.3], [-153.3, 221.9], [-143.9, 217.2], [-133.5, 225.5], [-120.8, 238.6], [-128.1, 245.7], [-135.8, 237.7], [-138.9, 240.8]], top: -1.92 }],
    cornice: { out: 0.5, thick: 0.35, colour: [0.16, 0.16, 0.16] },
    note: 'guessed: a timber barn in 2015'
  },
  {
    // The s'Matta-Schlössli (batches 2 and 1 of 11/1747/1008): the main block (−10.0, its flat roof standing out
    // over the walls) and its wing on the street under a shallow saddle roof (ridge −11.8, eaves −13.5) whose gable
    // faces the street. 2015 from the street to the south-west (389541285401211, 900780014103671, 835866210615190):
    // beige render on the ground floors with brown shutters, larch planks above, "s'Matta-Schlössli" on the wing's
    // gable, the roof's deep eaves, solar panels on the main roof. Nailpoint Morandi's board is drawn here on the main
    // block's street front (OpenStreetMap's outline stands 1.5 m out of the surveyed wall; its lettering is not in the
    // photographs: the generic sign's look). The north side is guessed.
    id: 'w124874490', name: "s'Matta-Schlössli",
    exclude: [{ x: -94.9, z: 161.4, r: 3 }, { x: -101.1, z: 167.1, r: 3 }],
    floor: -21.77, base: -22.3, colour: C.beige, shutters: SHUTTERS.brown, bay: 1.0, plinth: 0.35,
    timber: { from: -16.0, colour: C.larch },
    parts: [
      { ring: [[-102.9, 163.5], [-92.6, 153.5], [-91.0, 155.1], [-88.8, 161.3], [-97.3, 169.4]], top: -10.1 },
      { ring: [[-106.0, 166.7], [-102.8, 163.6], [-97.9, 168.8], [-98.1, 169.7], [-100.7, 172.2]], roofs: [0], timberFrom: -13.2 }
    ],
    roofs: [{ a: MW.a, b: MW.b, y: -11.8, eaves: -13.5, cL: 4.81, cR: 4.81, skin: 'roof' }],
    cornice: { out: 0.9, thick: 0.3, colour: [0.12, 0.06, 0.03] },
    shopIds: ['n12164186601'],
    decals: [
      { on: [[-106.0, 166.7], [-100.7, 172.2]], s0: 0.9, s1: 6.75, y0: -16.35, y1: -15.35, key: 'matta' },
      { on: [[-97.3, 169.4], [-88.8, 161.3]], s0: 3.4, s1: 8.4, y0: -16.5, y1: -15.95, key: 'nailpoint', board: [0.2, 0.21, 0.22] }
    ]
  }
];

// --- Rings ----------------------------------------------------------------------------------------------------------------
/** The roof's frame (a→b), its length */
export const roofFrame = (R) => frame(R.a, R.b);
/** A roof's height (its upper face) over a world point, or null outside its outline */
export function roofY(R, x, z) {
  const F = roofFrame(R), [t, c] = local(F, x, z);
  if (t < -1e-6 || t > F.L + 1e-6 || c < -R.cL - 1e-6 || c > R.cR + 1e-6) return null;
  const drop = R.y - R.eaves;
  return R.y - drop * (c >= 0 ? c / R.cR : -c / R.cL);
}
/** A roof's outline (world x, z) */
export function roofRing(R) {
  const F = roofFrame(R);
  return [at(F, 0, -R.cL), at(F, F.L, -R.cL), at(F, F.L, R.cR), at(F, 0, R.cR)].map(R2);
}

/** How high a part stands at a world point (the walls' top there): its flat roof, or its roofs' highest a step under them */
export function partTop(house, part, x, z) {
  if (part.top !== undefined) return part.top;
  let y = -Infinity;
  for (const i of part.roofs) { const r = roofY(house.roofs[i], x, z); if (r !== null) y = Math.max(y, r - 0.06); }
  return Number.isFinite(y) ? y : Math.min(...part.roofs.map((i) => house.roofs[i].eaves));
}
/** The parts' outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): the parts reaching the ground */
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
  // the railway's bridge looking west up the street: the cream block on the bend, the Bolgenblick
  bolgenblick: [-350, -18.7, 136.5, -381, -12, 117],
  // past Sport Hofmänner looking east: the chalet, the Bräma, the new block, the Freihof
  hofmaenner: [-256, -20.8, 201, -195, -12, 214],
  // the bend by the Freihof looking north-east: the tall block, the hardware shop, the s'Matta-Schlössli
  freihof: [-176, -19.7, 221, -112, -13, 190]
};

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
