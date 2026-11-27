// The houses along the Talstrasse from Bünda to Davos Dorf (js/talstrasse-4.js): twenty houses by hand in one module,
// each its surveyed volumes, its roofs and its look. Pure data and frame maths, shared by the browser module and the
// tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1751/1014–1016, 11/1752/1015–1021): each house's batches are left out of the
// streamed tiles and rebuilt here whole. The outlines below are the survey's walls at the ground (slivers of its rings
// cleaned), heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js; x east, z south). The Talstrasse runs
// here from the Bünda (475/−593) north-east to the Cresta (583/−745), then north-north-east past the fields to the
// Dischma crossing (644/−1171) and on to Davos Dorf; the houses stand on both sides of it, mostly below it on the
// valley's side. Three batches hold more than their OpenStreetMap house: the Talgarage's workshop behind it
// (11/1751/1015 batch 10, a hall OSM lacks) and its low wing on the south-west end (batch 16, over the edge of the
// forecourt w1528476306, which stays with js/buildings.js), and the garage before w126895437 (11/1752/1019 batch 20,
// no OSM building): all rebuilt here and registered with their house; the Demont's batch holds its barn
// (w126895461), rebuilt as a house of its own. The survey draws every roof flat but those of the house with the carved
// balconies, the ochre house, the Demont, its barn and the chalet by the Dischma crossing (saddle roofs):
// Mapillary's photographs (2013–2015 winter, 2021, 2025 dashcam and 2026, CC BY-SA) show shallow hips over the Casa
// Aurora, the house south of the Talgarage, the Talgarage itself and the house with the green shutters: hips there,
// their eaves at the surveyed tops. Each house's note says which photographs show it, which showed a neighbour, and
// what is guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const STOREY = 2.9;
// a window (m over its storey's foot, on the 2.9 m grid), its half width; the bays' spacing along a wall
export const WIN = { lo: 0.9, hi: 2.2, half: 0.58 };
export const BAY = 2.6;
// the windows' look by house (`win`): plain frames, shutters (green, brown, grey) or ribbons of wide panes
export const WIN_STYLE = { plain: 0, green: 1, brown: 2, grey: 3, ribbon: 4 };

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
 * A pitched roof over a ring: its ridge along `dir` ([x, z], need not be unit) through the ring's middle, the eaves
 * `over` m out of the walls all round at `eaves`, rising `slope` m per metre to the ridge (or to `ridge`); `hipped`:
 * hips at both ends, else gables. Returns { a, b, y, eaves, cL, cR, hip } as roofY reads it.
 */
export function pitchedRoof(ring, dir, { eaves, slope, ridge, over = 0.9, hipped = true }) {
  const F0 = frame([0, 0], dir);
  const ts = ring.map(([x, z]) => local(F0, x, z)[0]), cs = ring.map(([x, z]) => local(F0, x, z)[1]);
  const t0 = Math.min(...ts) - over, t1 = Math.max(...ts) + over, c0 = Math.min(...cs) - over, c1 = Math.max(...cs) + over;
  const cm = (c0 + c1) / 2, half = (c1 - c0) / 2, L = t1 - t0;
  const y = ridge ?? eaves + slope * half;
  const hip = hipped ? Math.min(half, L / 2) : 0;
  return { a: R2(at(F0, t0, cm)), b: R2(at(F0, t1, cm)), y: Math.round(y * 100) / 100, eaves, cL: R2([half])[0], cR: R2([half])[0], hip: [hip, hip].map((v) => Math.round(v * 100) / 100) };
}

// --- Colours (linear) ----------------------------------------------------------------------------------------------------
export const COLOURS = {
  white: [0.62, 0.62, 0.6], cream: [0.6, 0.56, 0.45], yellow: [0.56, 0.47, 0.26], ochre: [0.54, 0.45, 0.27],
  beige: [0.52, 0.46, 0.34], salmon: [0.56, 0.42, 0.32], umber: [0.24, 0.19, 0.15], concrete: [0.3, 0.29, 0.27],
  anthracite: [0.07, 0.075, 0.08], timber: [0.2, 0.115, 0.06], logs: [0.16, 0.085, 0.045], greywood: [0.21, 0.185, 0.155],
  redwood: [0.3, 0.09, 0.05], brown: [0.12, 0.068, 0.036], dark: [0.09, 0.075, 0.06], railing: [0.55, 0.55, 0.53],
  carport: [0.06, 0.06, 0.06], yellowFrame: [0.5, 0.36, 0.04]
};
const C = COLOURS;

// --- The houses -----------------------------------------------------------------------------------------------------------
// (the outlines the pitched roofs are laid over)
const AURORA = [[476.1, -628.5], [488.7, -617.5], [494.8, -624.5], [491.5, -627.4], [493.0, -629.2], [488.2, -633.4], [486.6, -631.6], [486.1, -632.0], [482.1, -635.5]];
const SOUTH_OF_GARAGE = [[494.7, -652.2], [507.0, -642.4], [514.8, -652.1], [502.5, -661.9]];
const GARAGE = [[517.2, -623.3], [524.1, -616.2], [536.6, -628.4], [535.5, -629.1], [534.2, -627.8], [528.6, -633.4], [530.0, -634.8], [529.4, -635.3]];
const GREEN_SHUTTERS = [[574.7, -713.1], [577.5, -711.5], [578.3, -712.1], [582.6, -709.7], [582.5, -708.6], [585.5, -706.9], [586.3, -708.2], [585.8, -708.5], [590.2, -716.4], [592.3, -723.7], [593.4, -723.5], [593.7, -725.8], [585.0, -730.8]];
const OCHRE_GABLE = [[575.2, -844.1], [590.3, -839.9], [594.3, -854.0], [579.1, -858.2]];

/**
 * Each house: `id` (OpenStreetMap), `name`, `exclude` (swissBUILDINGS3D's batches' centres, r 3), `floor` (its
 * storeys' grid: a storey's foot), `storey` (its storeys' height, 2.9 if not given), `base` (how far down its walls
 * reach), `colour` (its plaster), `timber` (its walls clad in boards), `win` (WIN_STYLE), `plinth` (the grey render
 * along its foot, m over the ground), `parts` ({ ring, top } flat-roofed, { ring, roofs: [i] } under the house's
 * pitched roofs; per part `colour`, `timber`, `bands` ([yTop, colour]: a colour under yTop, plain), `closed` (no
 * windows), `onRoof` (a room standing on another part's roof, not on the ground)), `roofs` (pitchedRoof's, or written out: `eavesL`/`eavesR` the eaves on either side when they differ),
 * `cornice` (an eaves slab round flat roofs: { out, thick, colour, parts? }), `railings` (round a flat roof:
 * { part, h, colour }), `balconies` ({ on: a wall's segment, left to right seen from outside, s0, s1 along it, depth,
 * floors: the slabs' tops, colour: the parapets', slab: the slabs', glass: glass parapets }), `shops` ({ on, s0, s1,
 * top: the fascia's top, fascia: its height, piers, canopy: { depth, colour }, signs: [{ key, s }]: atlas keys centred
 * at s on the fascia or the canopy, fasciaColour }), `letters` ({ on, s0, s1, y0, y1, key, board }: lettering on a
 * wall, on a board), `doors` ({ on, s, w }), `chimneys` ([x, z, top]), `shopIds` (the businesses whose signs it letters
 * itself: js/shops-data.js' osm ids, left out of js/shops.js).
 */
export const HOUSES = [
  {
    // The Casa Aurora (11/1751/1015 batch 22: one flat roof at −2.64, a metre out of the walls: the eaves). 2014 from
    // the Talstrasse south of it, 877656149630673 (from 476/−595, on the left): yellow plaster, white frames, "Casa
    // Aurora" on its south-west front, a shallow roof on grey eaves, a chimney; 295540338742776 and 1151079152030990
    // (from 457–460/−580) its south-west front behind the hedge with red-brown boarded balconies; 2021 the same at the
    // left of 1585872721766178 (filed under the Talgarage). 472842973801739 (from the north-east) shows the Talgarage
    // and the house w126895351, not this one. The north-west and north-east sides are guessed.
    id: 'w126895475', name: 'Casa Aurora',
    exclude: [{ x: 485.5, z: -626.5, r: 3 }],
    floor: -13.0, storey: 3.1, base: -13.9, colour: C.yellow, plinth: 0.4,
    parts: [{ ring: AURORA, roofs: [0] }],
    roofs: [pitchedRoof(AURORA, [12.6, 11.0], { eaves: -2.64, slope: 0.32, over: 1.0 })],
    balconies: [{ on: [[476.1, -628.5], [488.7, -617.5]], s0: 1.0, s1: 6.6, depth: 1.4, floors: [-9.9, -6.8], colour: C.redwood, slab: C.timber }],
    letters: [{ on: [[476.1, -628.5], [488.7, -617.5]], s0: 12.2, s1: 15.4, y0: -10.4, y1: -9.4, key: 'aurora' }],
    doors: [{ on: [[476.1, -628.5], [488.7, -617.5]], s: 9.0, w: 1.1 }],
    chimneys: [[484.5, -626.0, 1.2]]
  },
  {
    // The house on the Bünda corner (11/1751/1014 batch 8: one flat roof at 0.68). 2021 and 2026 from the Talstrasse
    // south-west of it, 1585872721766178 (filed under the Talgarage, from 484/−597: on the right, close by),
    // 372969144480847, 4081690312124027 and 1084412904048426 (from 462–466/−579…−584): cream plaster, storeys of
    // balconies with weathered grey boards on the south-west and south-east fronts, a flat roof on deep dark eaves;
    // 2014 1151079152030990 (filed under the Casa Aurora) the same with a banner. 472842973801739 (2013, from the
    // north-east) shows it far behind the Talgarage. The north-west and north-east fronts are guessed.
    id: 'w126895351', name: 'the house on the Bünda corner',
    exclude: [{ x: 501.5, z: -601.9, r: 3 }],
    floor: -13.5, storey: 3.4, base: -14.4, colour: C.cream, plinth: 0.35,
    parts: [{ ring: [[491.7, -598.7], [498.1, -592.7], [499.9, -594.7], [500.6, -594.1], [507.2, -601.2], [507.7, -600.8], [511.3, -604.6], [504.4, -611.0], [495.9, -601.8], [495.2, -602.4]], top: 0.68 }],
    cornice: { out: 0.9, thick: 0.5, colour: C.dark },
    balconies: [
      { on: [[491.7, -598.7], [498.1, -592.7]], s0: 0.4, s1: 8.4, depth: 1.4, floors: [-10.1, -6.7, -3.3], colour: C.greywood, slab: C.concrete },
      { on: [[500.6, -594.1], [507.2, -601.2]], s0: 0.4, s1: 9.3, depth: 1.4, floors: [-10.1, -6.7, -3.3], colour: C.greywood, slab: C.concrete }
    ],
    doors: [{ on: [[491.7, -598.7], [498.1, -592.7]], s: 4.4, w: 1.2 }]
  },
  {
    // The house south of the Talgarage across the street (11/1751/1015 batch 7: one flat roof at 2.52, a metre out of
    // the walls: the eaves). 2014 and 2015 from the Talstrasse south of it, 296627235307521, 946560359445468 and
    // 158856509494646 (from 493–495/−609…−614, on the left): white-cream plaster, storeys of balconies with brown timber
    // railings on the south-west and south-east fronts, a satellite dish, a shallow roof on deep dark brown eaves; 2013
    // 472842973801739 (from the north-east, on the right) its north-east front with brown balconies over a shop's grey
    // glazing. The roof's shape (a shallow hip) and the north-west front up the slope are guessed.
    id: 'w126895424', name: 'the house south of the Talgarage',
    exclude: [{ x: 504.8, z: -652.2, r: 3 }],
    floor: -12.5, storey: 2.95, base: -13.4, colour: [0.6, 0.58, 0.5], plinth: 0.35,
    parts: [{ ring: SOUTH_OF_GARAGE, roofs: [0] }],
    roofs: [pitchedRoof(SOUTH_OF_GARAGE, [12.3, 9.8], { eaves: 2.52, slope: 0.36, over: 1.0 })],
    balconies: [
      { on: [[494.7, -652.2], [507.0, -642.4]], s0: 5.0, s1: 15.2, depth: 1.3, floors: [-6.6, -3.65, -0.7], colour: C.timber, slab: C.concrete },
      { on: [[507.0, -642.4], [514.8, -652.1]], s0: 0.4, s1: 12.0, depth: 1.3, floors: [-6.6, -3.65, -0.7], colour: C.timber, slab: C.concrete }
    ]
  },
  {
    // The Talgarage Davos (11/1751/1015 batches 8, 16, 26 and 10). 2021 and 2026 from the Talstrasse south-west of it,
    // 1302886198479341, 1546113780083762 and 1393108003010514 (filed under w221124741, from 506–511/−623…−629: on the
    // right, close by): white plaster, four garage doors of white-framed panes along the street's front, "SUZUKI" and
    // "Talgarage Davos" over them, a storey of windows, a top storey under a shallow roof on dark eaves, a chimney;
    // 2014 296627235307521 and 2015 158856509494646 (filed under w126895424, on the right) the same with a VOLVO board.
    // Batch 8 is the garage, batch 16 a lower wing of two storeys on its south-west end, batch 26 the low porch in the
    // notch of its north-east end, batch 10 the workshop hall behind it (no OSM building, its flat roof at −6.77). The
    // workshop, the back and the hip's shape are guessed; the blue canopy of 2014 is left out.
    id: 'w221124742', name: 'Talgarage Davos',
    exclude: [{ x: 526.8, z: -625.6, r: 3 }, { x: 519.4, z: -620.3, r: 3 }, { x: 532.2, z: -631, r: 3 }, { x: 535.7, z: -624, r: 3 }],
    floor: -13.0, storey: 3.6, base: -13.9, colour: C.white, plinth: 0.3,
    parts: [
      { ring: GARAGE, roofs: [0] },
      // the south-west wing
      { ring: [[521.7, -615.0], [523.5, -616.8], [517.4, -623.0], [515.7, -621.3]], top: -4.91 },
      // the porch in the north-east end's notch
      { ring: [[528.6, -633.4], [534.2, -627.8], [535.5, -629.1], [530.0, -634.8]], top: -9.99, closed: true },
      // the workshop behind
      { ring: [[525.2, -617.3], [528.5, -613.9], [539.7, -624.8], [545.8, -630.6], [542.2, -634.2], [536.6, -628.4]], top: -6.77, colour: [0.56, 0.56, 0.54] }
    ],
    // (the hip over the garage's walls, 0.6 m out but at the north-east end, flush with the walls, where the white block w1528476307 stands
    // against it higher than its eaves)
    roofs: [{ a: [520.22, -619.28], b: [532.96, -631.82], y: 0.74, eaves: -0.94, cL: 5.58, cR: 5.58, hip: [5.58, 5.58] }],
    cornice: { out: 0.4, thick: 0.3, colour: C.dark, parts: [1, 2, 3] },
    shops: [
      {
        on: [[529.4, -635.3], [517.2, -623.3]], s0: 1.2, s1: 15.6, top: -9.5, fascia: 0.75, piers: [0.6, 0.6, 0.58], fasciaColour: [0.58, 0.58, 0.56],
        signs: [{ key: 'talgarage', s: 8.4 }]
      }
    ],
    letters: [{ on: [[529.4, -635.3], [517.2, -623.3]], s0: 12.6, s1: 15.4, y0: -8.6, y1: -7.95, key: 'suzuki', board: [0.6, 0.6, 0.6] }],
    chimneys: [[527.5, -626.5, 2.2]],
    shopIds: ['n7330243567']
  },
  {
    // The dark block east of the Talgarage (11/1751/1015 batch 9: one flat roof at 4.49, a metre out of the walls).
    // 2014 296627235307521 (filed under w126895424: right of the middle, from 493/−612) and 2026 1302886198479341,
    // 1393108003010514 (beyond the Talgarage and the white block w1528476307, which stays streamed): umber-brown plaster,
    // five storeys of windows, a flat roof on a dark edge, a yellow board "CRESTA STUDIOS" high on its front in 2014.
    // 462833898106791 (2013, from the north) shows a white block at its place on the left: it looks past it. The
    // back is guessed.
    id: 'w221124741', name: 'Cresta Studios',
    exclude: [{ x: 543, z: -645.6, r: 3 }],
    floor: -12.0, storey: 3.0, base: -13.6, colour: C.umber, plinth: 0.3,
    parts: [{ ring: [[531.7, -644.6], [543.2, -634.3], [554.2, -646.6], [542.8, -656.9]], top: 4.49 }],
    cornice: { out: 0.9, thick: 0.4, colour: C.dark },
    letters: [{ on: [[531.7, -644.6], [543.2, -634.3]], s0: 1.2, s1: 4.4, y0: -0.4, y1: 1.6, key: 'cresta', board: [0.62, 0.48, 0.02] }],
    doors: [{ on: [[531.7, -644.6], [543.2, -634.3]], s: 11.0, w: 1.2 }]
  },
  {
    // The old house with the carved balconies, west of the street before the Cresta (11/1751/1015 batches 28 and 24:
    // a saddle roof along the street, its ridge at 7.6 and eaves at 2.6, and the cross gable towards the street, its
    // ridge at 8.6 over eaves at 5.6). 2026 from the Talstrasse south of it, 1052447691037105 (filed under w221127689,
    // from 544/−671: on the left, close by), 1582491840027017: cream plaster, three storeys of balconies with white
    // railings between brown posts and frames along the gable front and beside it, the dark timber gable under deep
    // brown eaves; 2014 1160715897733582, 2894655197418465, 324837855654362 the same behind the spruces; 2013
    // 229729365576954 (from the north) its yellow north gable. The west side is guessed.
    id: 'w117012343', name: 'the house with the carved balconies',
    exclude: [{ x: 544.9, z: -704.9, r: 3 }, { x: 549.2, z: -708.2, r: 3 }],
    floor: -11.5, storey: 2.9, base: -12.8, colour: [0.58, 0.5, 0.32], plinth: 0.4,
    parts: [
      { ring: [[538.0, -698.1], [552.1, -698.6], [551.9, -705.3], [551.7, -711.4], [540.4, -711.1], [540.6, -706.3], [537.7, -706.2]], roofs: [0, 1] },
      // the gable front towards the street: the plaster under its timber apex
      { ring: [[551.9, -705.3], [552.6, -705.4], [552.4, -711.1], [551.7, -711.4]], roofs: [1], colour: C.timber, timber: true, bands: [[3.0, [0.58, 0.5, 0.32]]] }
    ],
    roofs: [
      // the saddle roof along the street (its gables north and south): c > 0 to the west
      { a: [544.6, -712.0], b: [545.1, -697.7], y: 7.6, eaves: 2.65, cL: 7.5, cR: 7.7, hip: [0, 0] },
      // the cross gable towards the street: c > 0 to the south
      { a: [545.8, -708.0], b: [553.6, -708.1], y: 8.6, eaves: 5.6, cL: 4.1, cR: 3.7, hip: [0, 0] }
    ],
    balconies: [
      { on: [[552.6, -705.4], [552.4, -711.1]], s0: 0.2, s1: 5.5, depth: 1.3, floors: [-5.7, -2.8, 0.1], colour: [0.55, 0.52, 0.45], slab: C.timber },
      { on: [[552.1, -698.6], [551.9, -705.3]], s0: 0.4, s1: 6.4, depth: 1.3, floors: [-5.7, -2.8, 0.1], colour: [0.55, 0.52, 0.45], slab: C.timber }
    ]
  },
  {
    // The Jäggi Schneider house (11/1751/1015 batch 27: the block at 3.09 on eaves a metre out, a room on its roof at
    // 5.48; 11/1752/1015 batch 2: the garage north of it at −1.24). 2026 from the Talstrasse south-west of it,
    // 1111892274586300, 3271654099709245 and 1052447691037105 (from 530–544/−651…−671): white plaster, four storeys of
    // windows, a flat roof on a dark grey edge, "Umbauspezialist JÄGGI SCHNEIDER" on its south front, the garage's deck
    // with grey railing panels and the dark car port under it; 2014 1160715897733582 and 324837855654362 (filed under
    // w117012343, on the right) the same. 229729365576954 (2013, from the north) shows it only far off. The garage's
    // north side and the back are guessed.
    id: 'w221127689', name: 'the Jäggi Schneider house',
    exclude: [{ x: 562.6, z: -676.8, r: 3 }, { x: 571.5, z: -692, r: 3 }],
    floor: -10.8, storey: 2.95, base: -11.8, colour: C.white, plinth: 0.3,
    parts: [
      { ring: [[553.3, -672.3], [563.3, -666.6], [564.1, -668.1], [564.5, -667.8], [571.8, -680.5], [560.9, -686.8], [553.9, -674.6], [554.5, -674.3]], top: 3.09 },
      // (the room on its roof)
      { ring: [[562.2, -679.1], [568.7, -675.4], [571.5, -680.2], [564.9, -683.9]], top: 5.48, onRoof: true },
      { ring: [[560.9, -686.8], [571.1, -680.9], [577.1, -691.3], [582.0, -688.5], [583.1, -694.2], [569.8, -702.3]], top: -1.24, closed: true, colour: C.concrete, bands: [[-3.8, C.carport]] }
    ],
    cornice: { out: 1.0, thick: 0.4, colour: [0.12, 0.12, 0.12], parts: [0, 1] },
    railings: [{ part: 2, h: 1.1, colour: C.railing }],
    letters: [{ on: [[553.3, -672.3], [563.3, -666.6]], s0: 6.4, s1: 11.0, y0: -4.6, y1: -0.6, key: 'jaeggi', board: C.white }],
    chimneys: [[566.0, -671.5, 4.6]]
  },
  {
    // The house with the green shutters, east of the street opposite the Cresta (11/1752/1016 batch 4: one flat roof at
    // 3.32). 2013 from the Talstrasse north of it, 229729365576954 and 2847797068817463 (from 585/−759 and 596/−785: on
    // the left): white-cream plaster, green shutters, four storeys, a shallow roof on dark eaves. The 2026 views from
    // the south-west (1582491840027017, 4175760202722593) show it behind a low flat-roofed building and trees. The hip's
    // shape and the south-west side are guessed.
    id: 'w126895410', name: 'the house with the green shutters',
    exclude: [{ x: 584.1, z: -718.8, r: 3 }],
    floor: -9.3, storey: 3.0, base: -10.2, colour: [0.6, 0.58, 0.52], win: WIN_STYLE.green, plinth: 0.4,
    parts: [{ ring: GREEN_SHUTTERS, roofs: [0] }],
    roofs: [pitchedRoof(GREEN_SHUTTERS, [10.3, -17.7], { eaves: 3.32, slope: 0.3, over: 0.8 })]
  },
  {
    // The new house north of the Cresta (11/1752/1016 batch 3: its roof at 8.41, the lower east end at 5.80). 2014 and
    // 2015 from the Talstrasse south of it, 762599081119010, 500312604351865 and 2895856430733102 (from 565/−711: left
    // of the middle, beyond the Hotel Cresta's yellow board): the lower storeys in dark grey glazing, the upper ones
    // white, glass balconies at its east end, a flat roof with the top storey set back. 993076938103464 (2013, from the
    // north-east) shows the retaining wall on the street, not this house. The north and west sides are guessed.
    id: 'w117012333', name: 'the new house north of the Cresta',
    exclude: [{ x: 569.9, z: -772.4, r: 3 }],
    floor: -7.2, storey: 3.0, base: -8.0, colour: C.white, win: WIN_STYLE.ribbon, plinth: 0.3,
    parts: [
      { ring: [[556.7, -775.0], [574.9, -764.0], [581.3, -774.5], [570.6, -781.0], [569.5, -779.2], [564.2, -782.4], [562.6, -779.8], [560.4, -781.1]], top: 8.41, bands: [[1.8, C.anthracite]] },
      { ring: [[574.9, -764.0], [577.3, -762.5], [579.8, -766.5], [579.0, -767.0], [582.9, -773.5], [581.3, -774.5]], top: 5.8, bands: [[1.8, C.anthracite]] }
    ],
    cornice: { out: 0.3, thick: 0.3, colour: [0.6, 0.6, 0.58] },
    balconies: [{ on: [[556.7, -775.0], [574.9, -764.0]], s0: 13.0, s1: 20.8, depth: 1.5, floors: [-1.2, 1.8, 4.8], colour: [0.3, 0.33, 0.35], slab: [0.55, 0.55, 0.53], glass: true }]
  },
  {
    // The white house with the ribbon windows (11/1752/1016 batches 0 and 1: its roof at 6.20 on a slab a metre out, the
    // basement under it at −4.77). 2015 302628121381859 (from 582/−744, left of the middle, beyond the new house north
    // of the Cresta) and 2014 136887245077801, 822432368358888: white plaster, bands of wide windows in dark frames,
    // four storeys towards the street, a flat roof on a white slab. 278527477244900 (2013, from the north-east) shows
    // the retaining wall. The north and west sides are guessed.
    id: 'w117012213', name: 'the house with the ribbon windows',
    exclude: [{ x: 579.5, z: -808.7, r: 3 }, { x: 577.3, z: -808.6, r: 3 }],
    floor: -6.7, storey: 3.0, base: -7.5, colour: [0.63, 0.63, 0.61], win: WIN_STYLE.ribbon, plinth: 0.4,
    parts: [{ ring: [[566.8, -808.4], [586.2, -797.9], [592.1, -808.9], [583.6, -813.5], [583.3, -812.8], [582.9, -813.0], [580.4, -814.3], [580.7, -815.0], [572.7, -819.3]], top: 6.2 }],
    cornice: { out: 0.9, thick: 0.35, colour: [0.52, 0.52, 0.5] }
  },
  {
    // The ochre house with the timber gables (11/1752/1017 batch 1: a saddle roof, its ridge north–south at 13.7 over
    // eaves at 9.0). 2014 and 2015 from the Talstrasse south of it, 523994305644565, 461030768509917 and
    // 214276570116230 (from 600–602/−793…−802: on the left, over the retaining wall): ochre plaster, white-framed
    // windows, five storeys, the south gable clad in dark brown timber with its windows, an oriel at the corner,
    // dormers on the east slope; 2013 287528413049608 (from the north-east) its north end on the right. The oriel and
    // the dormers are left out; the west side is guessed.
    id: 'w117012245', name: 'the ochre house with the timber gables',
    exclude: [{ x: 584.7, z: -849.1, r: 3 }],
    floor: -6.1, storey: 3.0, base: -7.0, colour: C.timber, timber: true, plinth: 0.5,
    parts: [{ ring: OCHRE_GABLE, roofs: [0], bands: [[9.3, C.ochre]] }],
    roofs: [pitchedRoof(OCHRE_GABLE, [4.5, -16.1], { eaves: 9.0, ridge: 13.7, over: 1.2, hipped: false })]
  },
  {
    // The beige house with the balconies (11/1752/1017 batch 3: one flat roof at 10.63, a metre out of the walls).
    // 2014 and 2015 from the Talstrasse south of it, 160427175998932, 2816825711901228 and 470860347673436 (from
    // 605/−822, left of the middle over the retaining wall): beige plaster, stacks of balconies with brown fronts on the
    // south side, five storeys, a flat roof on a reddish brown edge; 2013 805902960332447 (from the north-east) its north
    // side right of the middle. The west side is guessed.
    id: 'w117012169', name: 'the beige house with the balconies',
    exclude: [{ x: 589.3, z: -877.7, r: 3 }],
    floor: -5.0, storey: 2.9, base: -5.9, colour: [0.56, 0.5, 0.38], plinth: 0.4,
    parts: [{ ring: [[578.9, -869.0], [581.9, -868.2], [582.3, -869.7], [590.3, -867.6], [591.3, -871.5], [595.9, -870.3], [597.0, -874.4], [595.0, -874.9], [596.7, -881.2], [598.6, -880.7], [599.7, -884.7], [587.9, -887.8], [586.0, -880.7], [583.4, -881.4], [580.9, -871.7], [579.8, -872.0]], top: 10.63 }],
    cornice: { out: 0.9, thick: 0.4, colour: [0.2, 0.08, 0.05] },
    balconies: [
      { on: [[582.3, -869.7], [590.3, -867.6]], s0: 0.4, s1: 7.9, depth: 1.4, floors: [0.8, 3.7, 6.6], colour: C.timber, slab: C.concrete },
      { on: [[591.3, -871.5], [595.9, -870.3]], s0: 0.3, s1: 4.4, depth: 1.4, floors: [0.8, 3.7, 6.6], colour: C.timber, slab: C.concrete }
    ]
  },
  {
    // The white block on the fields (11/1752/1017 batch 2: its roof at 12.68, the balconies' stack at its east end at
    // 10.26 and 12.40). 2014 and 2015 from the Talstrasse south of it, 1092479944491007, 197777448665941 and
    // 326633202143288 (from 610/−860: on the left): white plaster, six storeys towards the street, rows of windows, the
    // stack of balconies with white parapets at the east end of the south front, a flat roof's thin edge; 2013
    // 1909837262502358 (from the north-east) its north side beyond the house with the shop. The west side is guessed.
    id: 'w126895373', name: 'the white block on the fields',
    exclude: [{ x: 595.9, z: -915, r: 3 }],
    floor: -7.1, storey: 2.9, base: -8.0, colour: [0.64, 0.64, 0.62], plinth: 0.4,
    parts: [
      { ring: [[584.5, -911.9], [600.9, -907.7], [603.8, -919.1], [587.4, -923.3]], top: 12.68 },
      { ring: [[600.9, -907.8], [605.2, -906.7], [606.4, -908.1], [606.6, -914.0], [603.1, -913.0], [602.3, -913.2]], top: 10.26 },
      { ring: [[602.3, -913.2], [603.1, -913.0], [607.0, -914.1], [607.2, -917.6], [603.7, -918.5]], top: 12.4 }
    ],
    cornice: { out: 0.3, thick: 0.25, colour: [0.55, 0.55, 0.53], parts: [0, 2] },
    balconies: [
      { on: [[584.5, -911.9], [600.9, -907.7]], s0: 11.6, s1: 16.6, depth: 1.3, floors: [-1.3, 1.6, 4.5, 7.4], colour: [0.6, 0.6, 0.58], slab: [0.55, 0.55, 0.53] },
      { on: [[600.9, -907.8], [605.2, -906.7]], s0: 0.2, s1: 4.2, depth: 1.3, floors: [-1.3, 1.6, 4.5], colour: [0.6, 0.6, 0.58], slab: [0.55, 0.55, 0.53] }
    ]
  },
  {
    // The house with the shop on the fields (11/1752/1018 batch 5: one flat roof at 7.94). 2014 and 2015 from the
    // Talstrasse south of it, 929716374431063, 460167101711812 and 509557843741783 (from 614–615/−895…−906: on the
    // left): cream plaster, the shop's glazing in yellow frames on the street under a deep cream canopy, a small board
    // "MARC AG", storeys over it with a stack of brown timber loggias on the south front, a flat roof on a dark edge;
    // 2013 1221375338319204 (from the north-east) its north side on the right. The shop's rounded wing of the
    // photographs stands outside the survey: drawn as the canopy. The west side is guessed.
    id: 'w126895356', name: 'the house with the shop on the fields',
    exclude: [{ x: 599.4, z: -946.2, r: 3 }],
    floor: -4.9, storey: 3.0, base: -5.8, colour: C.cream, plinth: 0.3,
    parts: [{ ring: [[590.5, -942.4], [595.3, -942.0], [595.3, -942.7], [602.6, -942.1], [602.4, -940.0], [606.7, -939.6], [606.8, -940.7], [607.4, -940.7], [608.3, -950.5], [603.9, -950.9], [604.0, -952.1], [596.1, -952.8], [596.0, -951.8], [591.3, -952.2]], top: 7.94 }],
    cornice: { out: 0.5, thick: 0.35, colour: C.dark },
    shops: [
      {
        on: [[607.4, -940.7], [608.3, -950.5]], s0: 0.5, s1: 9.3, top: -1.8, fascia: 0.6, piers: C.yellowFrame,
        canopy: { depth: 2.2, colour: [0.58, 0.55, 0.46] }, signs: [{ key: 'marc', s: 4.9 }]
      }
    ],
    balconies: [{ on: [[595.3, -942.7], [602.6, -942.1]], s0: 1.0, s1: 6.3, depth: 1.2, floors: [1.1, 4.1], colour: C.timber, slab: C.timber }]
  },
  {
    // The house over the garage before the Dorf (11/1752/1019 batch 23: its roof at 12.89, the strip along its south
    // front at 10.23; batch 20: the garage south of it at 1.28, no OSM building). 2014 and 2015 from the Talstrasse
    // south of it, 474333960704695, 176787657642991 and 205626851135545 (from 625–626/−1002…−1010: on the left):
    // cream plaster, bands of brown timber balconies on the south and east fronts, a flat roof on dark eaves, a
    // chimney, the garage's grey concrete front under it on the street with a builder's site office (left out). The
    // west and north sides are guessed.
    id: 'w126895437', name: 'the house over the garage',
    exclude: [{ x: 604.1, z: -1063.6, r: 3 }, { x: 606.2, z: -1047.9, r: 3 }],
    floor: -5.5, storey: 2.9, base: -7.4, colour: [0.6, 0.55, 0.42], plinth: 0.3,
    parts: [
      { ring: [[594.5, -1056.1], [606.2, -1054.7], [606.7, -1059.4], [611.1, -1058.9], [611.8, -1064.9], [612.9, -1064.7], [613.7, -1071.0], [596.5, -1073.1]], top: 12.89 },
      { ring: [[606.2, -1054.7], [610.7, -1054.0], [611.0, -1056.7], [609.7, -1056.8], [610.0, -1059.0], [606.7, -1059.4]], top: 10.23 },
      { ring: [[594.7, -1042.1], [615.7, -1039.6], [617.6, -1055.8], [611.0, -1056.5], [610.7, -1054.0], [606.2, -1054.7], [596.3, -1055.9]], top: 1.28, closed: true, colour: C.concrete }
    ],
    cornice: { out: 0.8, thick: 0.45, colour: C.dark, parts: [0, 1] },
    railings: [{ part: 2, h: 1.0, colour: [0.2, 0.2, 0.2] }],
    balconies: [
      { on: [[594.5, -1056.1], [606.2, -1054.7]], s0: 0.4, s1: 11.4, depth: 1.4, floors: [3.2, 6.1, 9.0], colour: C.timber, slab: C.concrete },
      { on: [[606.2, -1054.7], [610.7, -1054.0]], s0: 0.2, s1: 4.3, depth: 1.4, floors: [3.2, 6.1], colour: C.timber, slab: C.concrete },
      { on: [[612.9, -1064.7], [613.7, -1071.0]], s0: 0.3, s1: 6.0, depth: 1.4, floors: [-2.6, 0.3, 3.2, 6.1, 9.0], colour: C.timber, slab: C.concrete }
    ],
    chimneys: [[600.5, -1066.0, 14.3]]
  },
  {
    // The Demont garden centre (11/1752/1019 batch 6: the house under a saddle roof, its ridge at 5.6 over eaves at 2.9
    // on the west and 1.9 on the east; the barn north of it under a lower saddle roof, its ridge at 3.2). 2014 and 2015
    // from the Talstrasse south of it, 1896046320564584, 904649543691843 and 556820225282168 (from 630–631/−1048…−1059:
    // on the left), 2021 811526546184556 and 223075599774076 (filed under w126895450): beige plaster below, dark brown
    // timber over it, the board "DEMONT Gartenbau Gartengestaltung" along the street's side, "DEMONT" on the south
    // gable, flags; 2013 148784000528003 (from the north-east) the barn's grey weathered boards with a DEMONT board. The
    // west side up the slope is guessed.
    id: 'w126895488', name: 'Demont Gartenbau',
    exclude: [{ x: 621.2, z: -1103.5, r: 3 }],
    floor: -6.6, storey: 2.8, base: -7.6, colour: C.timber, timber: true, plinth: 0.3,
    parts: [
      { ring: [[610.8, -1093.8], [623.4, -1086.9], [632.0, -1102.5], [626.6, -1105.4], [620.4, -1107.6], [619.8, -1106.5], [614.8, -1097.4], [613.3, -1098.3]], roofs: [0], bands: [[-1.0, C.beige]] }
    ],
    roofs: [
      // (c > 0 to the east)
      { a: [616.6, -1090.0], b: [626.5, -1107.3], y: 5.6, eaves: 2.9, eavesL: 2.9, eavesR: 1.9, cL: 7.4, cR: 7.6, hip: [0, 0] }
    ],
    letters: [
      { on: [[623.4, -1086.9], [632.0, -1102.5]], s0: 3.0, s1: 9.4, y0: -1.7, y1: -0.6, key: 'demont', board: [0.6, 0.6, 0.58] },
      { on: [[610.8, -1093.8], [623.4, -1086.9]], s0: 6.0, s1: 8.6, y0: -0.4, y1: 0.25, key: 'demontS', board: [0.6, 0.6, 0.58] }
    ],
    shopIds: []
  },
  {
    // The Demont's barn north of it (the north part of 11/1752/1019 batch 6, which holds both: a lower saddle roof, its
    // ridge at 3.2 over eaves at 1.3; excluded with the Demont). 2013 148784000528003 (from the north-east, on the
    // right): grey weathered boards, the saddle roof, a DEMONT board on its gable, a door on the street's side; the
    // photographs from the south show it behind the Demont. The west side is guessed.
    id: 'w126895461', name: 'the Demont\'s barn',
    exclude: [],
    floor: -6.6, storey: 2.8, base: -7.6, colour: C.greywood, timber: true, plinth: 0.3,
    parts: [{ ring: [[620.4, -1107.6], [626.6, -1105.4], [627.6, -1119.4], [619.8, -1120.2], [618.7, -1109.5], [620.6, -1109.3]], roofs: [0] }],
    // (c > 0 to the east; its south end under the Demont's roof)
    roofs: [{ a: [622.24, -1105.7], b: [623.75, -1120.3], y: 3.2, eaves: 1.3, eavesL: 1.3, eavesR: 1.2, cL: 4.4, cR: 4.5, hip: [0, 0] }],
    letters: [{ on: [[627.6, -1119.4], [619.8, -1120.2]], s0: 2.6, s1: 5.2, y0: -2.6, y1: -1.95, key: 'demontS', board: [0.6, 0.6, 0.58] }]
  },
  {
    // The chalet west of the Dischma crossing (11/1752/1019 batch 8: a saddle roof, its ridge east–west at 8.7 over
    // eaves at 6.0 on the south and 6.7 on the north, the porch on its north side under the slope at 5.2). No
    // photograph shows it: 1960580528096611 (2025, from the east) shows the chalet w117012240 and the blue house
    // w1527724577 before it, 3836329359736104 and 143532267780197 (2013, from the north-west) the egg BAR's house
    // w117012336, 283479370098184 (2014, from the south) the dark chalet w126895461. Its look is guessed after its
    // neighbours: a white plastered ground floor, dark timber over it, the saddle roof on deep eaves.
    id: 'w117012327', name: 'the chalet by the Dischma crossing',
    exclude: [{ x: 611.1, z: -1144.1, r: 3 }],
    floor: -3.7, storey: 2.8, base: -4.6, colour: C.logs, timber: true, plinth: 0.3,
    parts: [
      { ring: [[603.7, -1138.8], [616.4, -1136.5], [618.5, -1147.9], [615.9, -1148.4], [614.8, -1148.6], [612.0, -1148.0], [605.6, -1149.2]], roofs: [0], bands: [[-0.9, C.white]] },
      { ring: [[612.0, -1148.0], [614.8, -1148.6], [615.3, -1151.4], [612.7, -1151.9]], top: 5.0, colour: C.white }
    ],
    roofs: [
      // (c > 0 to the south)
      { a: [603.2, -1145.1], b: [619.2, -1142.2], y: 8.7, eaves: 6.0, eavesL: 6.4, eavesR: 6.0, cL: 6.4, cR: 7.1, hip: [0, 0] }
    ]
  },
  {
    // The house by the car park at the Dorf's end of the row (11/1752/1021 batch 8: one flat roof at 1.47). 2025 from
    // the car park north-east of it, 9741393509293853, 1323634886003531 and 661239033090424 (from 640–672/−1306…−1316:
    // right of the middle behind the grey shed w117012216): a low block of two storeys, a flat roof with a railing,
    // warm ochre plaster like the wing beside it (w1527724572); 787218355540245 (2014, from the south) shows only the
    // trees. Its walls are mostly hidden: the colour and the windows are guessed.
    id: 'w117012262', name: 'the house by the car park',
    exclude: [{ x: 637.9, z: -1259.1, r: 3 }],
    floor: -6.0, storey: 3.0, base: -6.9, colour: [0.5, 0.42, 0.26], plinth: 0.3,
    // (its east and west walls on OSM's where it shares them with the hall w1527724573 and the wing w1527724572: the
    // survey's run up to 0.7 m into them)
    parts: [{ ring: [[626.4, -1258.0], [631.1, -1256.1], [630.8, -1255.3], [639.0, -1252.0], [639.3, -1253.0], [645.6, -1250.5], [647.1, -1254.3], [649.4, -1260.2], [643.0, -1262.5], [643.4, -1263.3], [635.2, -1266.6], [634.8, -1265.7], [630.2, -1267.5], [628.2, -1262.1]], top: 1.47 }],
    cornice: { out: 0.5, thick: 0.35, colour: C.dark },
    railings: [{ part: 0, h: 1.0, colour: [0.15, 0.15, 0.15] }]
  },
  {
    // The beige house below the street east of the Demont (11/1752/1019 batch 17: its south block at −1.32, the middle
    // at −2.28; batch 11's south part at 0.82). 2021 from the Talstrasse south-west of it, 811526546184556,
    // 223075599774076 and 2422770211191517 (from 630–633/−1028…−1055: right of the middle, beyond the railway): beige
    // plaster, flat roofs on a thin dark edge, a dark timber balcony along the west front over the railway; 2013
    // 148784000528003 (from the north) its north end on the left. The east side is guessed.
    id: 'w126895450', name: 'the beige house below the street',
    exclude: [{ x: 658.1, z: -1088.8, r: 3 }],
    floor: -8.7, storey: 2.9, base: -9.6, colour: C.beige, plinth: 0.3,
    parts: [
      { ring: [[650.1, -1078.2], [662.2, -1075.6], [666.4, -1095.0], [660.8, -1096.2], [658.6, -1086.6], [652.3, -1088.0]], top: -1.32 },
      { ring: [[651.6, -1087.2], [652.3, -1088.0], [658.6, -1086.6], [660.8, -1096.2], [661.8, -1097.5], [654.0, -1099.1], [653.0, -1094.0], [649.4, -1094.6], [651.3, -1088.2]], top: -2.28 },
      { ring: [[649.4, -1094.6], [653.0, -1094.0], [654.0, -1099.1], [661.8, -1097.5], [664.8, -1112.3], [664.0, -1112.5], [651.9, -1115.3], [650.8, -1115.6], [650.4, -1110.8], [649.5, -1110.8], [649.1, -1106.0], [650.0, -1105.8], [648.9, -1096.7]], top: 0.82 }
    ],
    cornice: { out: 0.5, thick: 0.3, colour: C.dark },
    balconies: [{ on: [[652.3, -1088.0], [650.1, -1078.2]], s0: 0.8, s1: 9.3, depth: 1.2, floors: [-2.9], colour: C.brown, slab: C.brown }]
  },
  {
    // The salmon house north of it (11/1752/1019 batch 11's north part: one flat roof at −2.82). 2013 from the
    // Talstrasse north of it, 234389501777091 (from 646/−1171: on the left): salmon-beige plaster, small windows, a
    // flat roof's edge, a chimney; 2021 1821512044695050 and 637822030515670 (from 634–636/−1073…−1086) show it
    // beyond the beige house. 315623773486785 (2013, from the north-west) shows the Dischmastrasse's houses. The east
    // side is guessed.
    id: 'w126895471', name: 'the salmon house below the street',
    exclude: [{ x: 657.9, z: -1115.2, r: 3 }],
    floor: -8.7, storey: 2.9, base: -9.6, colour: C.salmon, plinth: 0.3,
    parts: [{ ring: [[651.9, -1115.3], [664.0, -1112.5], [665.5, -1119.4], [666.5, -1125.0], [664.3, -1134.2], [654.2, -1135.5]], top: -2.82 }],
    cornice: { out: 0.5, thick: 0.3, colour: C.dark },
    chimneys: [[660.0, -1130.0, -1.4]]
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
  const eL = R.eavesL ?? R.eaves, eR = R.eavesR ?? R.eaves;
  let y = c >= 0 ? R.y - ((R.y - eR) * c) / R.cR : R.y - ((R.y - eL) * -c) / R.cL;
  const drop = R.y - R.eaves, [h0, h1] = hips(R);
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
/** The parts' outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): every part but a room on a roof */
export const groundOutlines = (house) => house.parts.filter((p) => !p.onRoof).map((p) => p.ring);
/** Is a point inside one of the row's houses? */
export const insideRow = (x, z) => HOUSES.some((h) => groundOutlines(h).some((r) => pointInRing(r, x, z)));
/** A house's storeys' height */
export const storeyOf = (house) => house.storey ?? STOREY;

/**
 * A wall's frame from a segment (a, b) on a house's outline, turned so that it faces out of the house at height `y`
 * (its n leaving the parts that stand higher there)
 */
export function wallOut(house, a, b, y = -Infinity) {
  const F = wallFrame(a, b), [x, z] = onWall(F, F.len / 2, 0.4);
  return house.parts.some((p) => pointInRing(p.ring, x, z) && partTop(house, p, x, z) > y) ? wallFrame(b, a) : F;
}
/** The height a feature on a wall stands at (wallOut's y): a balcony's lowest floor, a shop's top, lettering's foot */
export const featureY = (f) => (f.floors ? Math.min(...f.floors) : f.y0 ?? f.top ?? -Infinity);
/** The businesses whose signs the row letters itself (js/shops-data.js' osm ids) */
export const SHOP_IDS = HOUSES.flatMap((h) => h.shopIds || []);

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // the Talstrasse by the Bünda looking north-east (1302886198479341's place): the Talgarage right, the Casa Aurora and
  // the house south of it left, the dark block and the Jäggi Schneider house beyond
  talgarage: [506, -11.4, -622, 545, -6.0, -660],
  // the Talstrasse before the Cresta looking north (762599081119010's place): the carved balconies left, the new house
  // north of the Cresta and the green shutters beyond
  cresta: [565, -7.9, -712, 578, -2.0, -770],
  // the Talstrasse by the fields looking north (1092479944491007's place): the white block, the beige house and the
  // house with the shop left
  fields: [610, -5.9, -860, 598, -1.0, -915],
  // the Talstrasse before the Dorf looking north (1896046320564584's place): Demont left, the beige and salmon houses
  // below the street right
  demont: [631, -5.4, -1059, 628, -3.0, -1105]
};

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
