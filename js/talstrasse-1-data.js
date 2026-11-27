// The houses along the Talstrasse in Davos Platz round the Sportzentrum, from the EWD's offices at the Rietstrasse
// (−360/−15) north-east past the Sportzentrum and the Coop Pronto to the chalets at the Eisbahnstrasse (−20/−310)
// (js/talstrasse-1.js): fifteen houses by hand in one module, each its surveyed volumes, its roofs and its look.
// Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1746/1009, 11/1746/1010, 11/1747/1010, 11/1747/1011, 11/1748/1011, 11/1748/1012;
// the batches named at each house): the outlines below are its flat roofs' outlines with the walls under them (or the
// walls at the ground, under a pitched roof), heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js; x
// east, z south). The street runs from the EWD (−345/10) north-east to the Sportzentrum's corner (−165/−195), on past
// the Coop Pronto (−120/−240) and the garage (−75/−285) to the chalets (−20/−320). The valley floor is flat here: the
// ground falls from −19.2 at the north-east end to −21.9 at the south-west end. The look after Mapillary's street views
// (CC BY-SA, 2013–2026), each house's note saying which photographs show it and what is guessed. Several of the cached
// headings were off (the 2013 photograph 145460294204650 looks north-west at the Molkerei by the Kirchstrasse, not
// north-east): the houses were matched from the cameras' places against the outlines.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

// The windows' grid every house's storeys are scaled to (the walls' material draws a window per bay from it)
export const STOREY = 3.0;
// a window (m over its storey's foot in the grid), its half width; the bays' spacing along a wall (a house's `bay`)
export const WIN = { lo: 0.9, hi: 2.25, half: 0.6 };
export const BAY = 2.8;
// The windows' kinds the walls' material draws: white-framed with a post, wide with outside blinds (the EWD), with a
// dark panel under it (the block by the garage), a glazed loggia band (the pink block), dark-framed in timber,
// white-framed between red or brown shutters
export const KINDS = { punched: 0, blinds: 1, panel: 2, band: 3, dark: 4, redShutters: 5, brownShutters: 6 };

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
  white: [0.6, 0.6, 0.58], cream: [0.55, 0.5, 0.38], beige: [0.5, 0.44, 0.32], ochre: [0.5, 0.4, 0.24],
  salmon: [0.5, 0.27, 0.17], grey: [0.42, 0.42, 0.4], logs: [0.15, 0.078, 0.04], larch: [0.17, 0.095, 0.05],
  yellow: [0.62, 0.45, 0.04], teal: [0.03, 0.17, 0.22], brown: [0.12, 0.065, 0.035], concrete: [0.36, 0.35, 0.33],
  orange: [0.75, 0.2, 0.02], green: [0.05, 0.16, 0.07]
};
const C = COLOURS;

// --- The houses -----------------------------------------------------------------------------------------------------------
// The chalet by the Eisbahnstrasse: its frame along the ridge (from the gable on the side street east-north-east), c
// across it (south-south-east)
const CH = frame([-31.5, -301.1], [-31.5 + 0.772, -301.1 - 0.634]);
// The white house's cross gables: across its ridge (north-east), through its middle
const WX = frame([-3.45, -322.05], [-3.45 + 0.753, -322.05 - 0.658]);

/**
 * Each house: `id` (OpenStreetMap), `exclude` (swissBUILDINGS3D's batches' centres, r 3), `floor` (its storeys' grid:
 * the ground floor's foot), `base` (how far down its walls reach), `storey` (its storeys' height: the grid's STOREY
 * scaled to it), `colour` (its plaster), `kind` (its windows, KINDS), `bay` (its bays' spacing in m), `plinth` (the grey
 * render along its foot, m over the ground), `timber` ({ from, colour? }: boards over `from`, in the house's colour or
 * their own), `parts` ({ ring, top } flat-roofed; { ring, roofs: [i] } under the house's pitched roofs; `closed`: no
 * windows; `foot`: its walls from that height, a soffit under it; `onRoof`: standing on another part), `roofs` ({ a, b: the ridge's ends at the verges, y:
 * the ridge, eaves, cL, cR: how far the eaves lie left and right of a→b, hip: [h0, h1] the ridge's ends inside the
 * eaves' outline }), `cornice` and `bands` (a band round the flat parts' tops: { h, out, colour, parts? }), `shops`
 * (glazing from the ground to a fascia), `balconies`, `canopies`, `doors`, `signs` (the atlas' lettering on a wall),
 * `shopIds` (OpenStreetMap's businesses lettered here, not on js/shops.js' boards), `also` (other OpenStreetMap ids:
 * { id, rings: [] } inside its outlines, no walls of their own; { id, parts } built here beside it).
 */
export const HOUSES = [
  {
    // The EWD (Elektrizitätswerk Davos; batch 1 of 11/1746/1009): a three-storey wing along the Talstrasse (flat roof
    // y −10.34), a four-storey block north of it (−7.42) round a stair tower (−5.99). Photographs: 2013 from the corner
    // of the Rietstrasse (147108244034168: the wing's front on the Talstrasse, white with wide windows behind grey
    // blinds and a petrol-blue band under its roof edge, the block behind with its yellow band); 2015 from the north-
    // west (2863768180512189, 303940608109151: the block's north-west front with "EWD Energie aus Davos", the wing on
    // the right with the yellow canopy over its door); 2026 from the south (2676125959509281: the wing's south end with
    // the blue EWD). 495182091606721 (2015, from the south) shows the street, the house far off. Its east side (on the
    // yard) and the block's back are guessed.
    id: 'w126271051', name: 'EWD',
    exclude: [{ x: -357.5, z: -16.1, r: 3 }],
    floor: -20.9, base: -22.0, storey: 3.3, colour: C.white, kind: KINDS.blinds, bay: 3.2, plinth: 0.35,
    parts: [
      { ring: [[-361.3, -25.4], [-364.9, -28.2], [-372.5, -18.2], [-371.9, -17.7], [-377.0, -9.0], [-376.4, -8.4], [-362.2, 0.1], [-361.9, -0.4], [-357.3, 2.7], [-347.2, -10.6], [-363.3, -22.8]], top: -10.34 },
      { ring: [[-346.9, -10.3], [-337.9, -22.2], [-349.5, -31.6], [-354.1, -25.4], [-358.5, -28.7], [-361.3, -25.4], [-363.3, -22.8]], top: -7.42, kind: KINDS.punched },
      // (the stair core north-west of the tower, its front on the yard closed: the lettering)
      { ring: [[-358.5, -28.7], [-354.3, -34.6], [-364.9, -28.2], [-361.3, -25.4]], top: -7.42, closed: true },
      { ring: [[-354.1, -25.4], [-358.5, -28.7], [-353.8, -34.9], [-349.5, -31.6]], top: -5.99, closed: true }
    ],
    cornice: { h: 0.55, out: 0.12, colour: C.teal, parts: [0] },
    bands: [{ part: 1, h: 0.6, out: 0.1, colour: C.yellow }, { part: 2, h: 0.6, out: 0.1, colour: C.yellow }, { part: 3, h: 0.6, out: 0.1, colour: C.yellow }],
    canopies: [{ on: [[-364.9, -28.2], [-372.5, -18.2]], s0: 1.5, s1: 8.5, y: -17.4, depth: 2.0, fascia: C.yellow }],
    doors: [{ on: [[-364.9, -28.2], [-372.5, -18.2]], s: 5.0, w: 1.8, glass: true }, { on: [[-361.9, -0.4], [-357.3, 2.7]], s: 0.9, w: 1.2, glass: true }],
    signs: [
      { on: [[-354.3, -34.6], [-364.9, -28.2]], s: 6.2, w: 7.0, y0: -11.4, y1: -9.2, key: 'ewd' },
      { on: [[-361.9, -0.4], [-357.3, 2.7]], s: 3.3, w: 3.5, y0: -17.8, y1: -16.7, key: 'ewd' }
    ],
    shopIds: ['n9949249917']
  },
  {
    // The cream block between the EWD and the low house (batch 5 of 11/1746/1010): flat-roofed at −6.04, five storeys.
    // Photographs 2015 from the Talstrasse (152408846885659 from 008's set: its front on the street with the balconies'
    // concrete slabs and dark railings along every upper floor, a "Ferienwohnungen" board), from the north-west
    // (2863768180512189, 809562149938163: the same balconies round its west corner), 2013 from the north-east
    // (454228995659299, far). Its north-east side is guessed.
    id: 'w126271056', name: 'the cream block',
    exclude: [{ x: -332.9, z: -46.5, r: 3 }],
    floor: -21.0, base: -22.0, storey: 2.85, colour: C.cream, kind: KINDS.punched, bay: 2.9, plinth: 0.4,
    parts: [{ ring: [[-331.6, -33.7], [-335.4, -37.2], [-342.0, -43.0], [-341.6, -43.5], [-345.4, -46.6], [-334.9, -59.1], [-320.4, -47.0]], top: -6.04 }],
    cornice: { h: 0.45, out: 0.5, colour: C.brown },
    balconies: [
      { on: [[-320.4, -47.0], [-331.6, -33.7]], s0: 0.6, s1: 16.8, depth: 1.5, rail: 'metal' },
      { on: [[-345.4, -46.6], [-334.9, -59.1]], s0: 0.4, s1: 7.0, depth: 1.4, rail: 'metal' }
    ],
    doors: [{ on: [[-320.4, -47.0], [-331.6, -33.7]], s: 8.7, w: 1.4, glass: true }]
  },
  {
    // The low cream house on the street's bend (batch 12 of 11/1746/1010): a two-storey wing to the north (−13.81),
    // three storeys towards the street (−11.0, −11.23, here one part at −11.1). Photographs: 2015 from the Talstrasse
    // (152408846885659, 741024670111676: cream render, the balcony along the upper floor over the street, a dark eaves
    // board on its flat roof, the shop window on the ground floor), 2026 (941089019040246) much the same. The north
    // wing and the back are guessed.
    id: 'w126271008', name: 'the low cream house',
    exclude: [{ x: -318.3, z: -61.0, r: 3 }],
    floor: -21.2, base: -22.0, storey: 3.0, colour: [0.56, 0.5, 0.35], kind: KINDS.punched, bay: 2.7, plinth: 0.35,
    parts: [
      { ring: [[-304.4, -58.9], [-308.0, -53.3], [-318.4, -63.2], [-319.0, -63.7], [-325.7, -69.3], [-329.4, -64.8], [-332.1, -67.0], [-324.9, -75.8]], top: -13.81 },
      { ring: [[-312.3, -47.9], [-313.8, -46.1], [-325.5, -55.9], [-326.1, -55.2], [-332.2, -60.3], [-328.9, -64.1], [-329.6, -64.7], [-325.7, -69.3], [-319.0, -63.7], [-318.4, -63.2], [-308.0, -53.3], [-309.1, -52.0], [-307.7, -50.8], [-311.1, -46.8]], top: -11.1 }
    ],
    cornice: { h: 0.35, out: 0.45, colour: C.brown },
    balconies: [{ on: [[-313.8, -46.1], [-325.5, -55.9]], s0: 1.0, s1: 14.2, depth: 1.3, rail: 'metal', floors: [1] }],
    shops: [{ on: [[-307.7, -50.8], [-311.1, -46.8]], s0: 0.4, s1: 4.8, top: -17.6, piers: [0.5, 0.46, 0.34] }]
  },
  {
    // The balconied block on the corner of the Rietstrasse (batch 4 of 11/1746/1009, with the pavilion): six storeys
    // (−2.80) and a stair head on its roof (−0.77). Photographs: 2021 from the Talstrasse (359985332493713: the
    // balconies' rounded concrete parapets and striped orange-brown awnings stacked on its street side, behind the
    // pavilion), 2015 (152408846885659: the same at the right edge; 462357938357248 from the north-west across the
    // pavilion). Ochre render. Its south-east side is guessed.
    id: 'w124795016', name: 'the balconied block',
    exclude: [{ x: -315.6, z: -13.8, r: 3 }],
    floor: -21.5, base: -22.5, storey: 3.0, colour: C.ochre, kind: KINDS.punched, bay: 2.7, plinth: 0.35,
    parts: [
      { ring: [[-305.0, -12.2], [-318.8, -24.4], [-314.7, -29.0], [-313.9, -28.2], [-309.5, -33.2], [-297.8, -22.8], [-301.7, -18.4], [-300.5, -17.4]], top: -2.8 },
      { ring: [[-307.8, -24.3], [-310.2, -26.4], [-307.8, -29.2], [-305.4, -27.0]], top: -0.77, closed: true, onRoof: true }
    ],
    cornice: { h: 0.4, out: 0.6, colour: C.brown, parts: [0] },
    balconies: [
      { on: [[-318.8, -24.4], [-314.7, -29.0]], s0: 0.3, s1: 5.9, depth: 1.5, rail: 'concrete', awning: C.orange },
      { on: [[-313.9, -28.2], [-309.5, -33.2]], s0: 0.3, s1: 6.4, depth: 1.5, rail: 'concrete', awning: C.orange },
      { on: [[-305.0, -12.2], [-318.8, -24.4]], s0: 9.5, s1: 17.8, depth: 1.3, rail: 'concrete', awning: C.orange, from: 2 }
    ],
    doors: [{ on: [[-309.5, -33.2], [-297.8, -22.8]], s: 7.5, w: 1.4, glass: true }]
  },
  {
    // The pavilion on the corner in front of it (the same batch: OpenStreetMap's strip w1529537273 and the block
    // w124795036 under one flat roof). The survey has it 8.6 m high (−13.40), but the photographs show one tall storey:
    // 2015 from the north-west (462357938357248: beige walls, a dark band under the roof's edge, "ALPIQ" over the shop
    // windows, the glazed corner under its cantilevered canopy), 2021 and 2026 from the Talstrasse (359985332493713,
    // 2676125959509281: the corner with posters, "BOUYGUES"). Its top at y −17.1 here.
    id: 'w1529537273', name: 'the pavilion',
    exclude: [],
    floor: -21.5, base: -22.4, storey: 3.0, colour: [0.5, 0.45, 0.33], kind: KINDS.punched, bay: 2.8, plinth: 0.3,
    parts: [{ ring: [[-311.2, -17.7], [-312.1, -15.5], [-319.1, -7.6], [-327.1, -14.7], [-328.6, -13.0], [-329.1, -13.4], [-333.6, -8.4], [-317.8, 5.5], [-300.4, -14.1], [-302.1, -15.6], [-305.0, -12.2]], top: -17.1, closed: true }],
    cornice: { h: 0.7, out: 0.15, colour: [0.07, 0.06, 0.05] },
    shops: [
      { on: [[-327.1, -14.7], [-319.1, -7.6]], s0: 0.5, s1: 10.2, top: -18.0, piers: [0.5, 0.45, 0.33] },
      { on: [[-312.1, -15.5], [-319.1, -7.6]], s0: 0.5, s1: 10.0, top: -18.0, piers: [0.5, 0.45, 0.33] },
      { on: [[-333.6, -8.4], [-317.8, 5.5]], s0: 13.0, s1: 20.6, top: -18.0, piers: [0.5, 0.45, 0.33] }
    ],
    canopies: [{ on: [[-312.1, -15.5], [-319.1, -7.6]], s0: 0.0, s1: 10.5, y: -17.5, depth: 3.0, fascia: [0.6, 0.6, 0.58] }],
    also: [{ id: 'w124795036', rings: [] }]
  },
  {
    // The balcony tower south of the Talstrasse (batch 4 of 11/1746/1010): six storeys under a flat roof (−4.15).
    // Photographs 2021 from the Talstrasse (4352061421553691, 307651577828358, 813829365893130) and 2026
    // (905831729004096): its balconies stacked on its front on the street, concrete parapets with dark rails, white-
    // cream render. Its east and south sides are guessed.
    id: 'w126271050', name: 'the balcony tower',
    exclude: [{ x: -280.9, z: -50.2, r: 3 }],
    floor: -21.5, base: -22.2, storey: 2.8, colour: [0.56, 0.53, 0.45], kind: KINDS.punched, bay: 2.6, plinth: 0.35,
    parts: [{ ring: [[-274.8, -56.7], [-277.7, -56.5], [-277.7, -57.3], [-283.3, -56.9], [-283.2, -56.1], [-287.7, -55.8], [-287.0, -43.0], [-274.0, -43.8]], top: -4.15 }],
    cornice: { h: 0.4, out: 0.55, colour: C.brown },
    balconies: [
      { on: [[-287.7, -55.8], [-287.0, -43.0]], s0: 0.5, s1: 12.3, depth: 1.6, rail: 'concrete' },
      { on: [[-283.3, -56.9], [-277.7, -57.3]], s0: 0.2, s1: 5.4, depth: 1.3, rail: 'concrete' }
    ],
    doors: [{ on: [[-287.7, -55.8], [-287.0, -43.0]], s: 3.0, w: 1.3, glass: true }]
  },
  {
    // The long building south-east of the Talstrasse between the Mittelstrasse and the next lane (batch 15 of
    // 11/1747/1010, which holds the small house w1529534136 at its east end too): flat-roofed parts of two to four
    // storeys (−15.17 to −8.09). The photographs (577597020101026, 199353458851935, 1763595068288532 from the
    // Talstrasse 2021–2026; 263142935555544, 2013) show it only behind the trees and the hoarding on the street: white
    // render, windows in rows. Its look is guessed.
    id: 'w126271016', name: 'the long building',
    exclude: [{ x: -234.4, z: -80.1, r: 3 }],
    floor: -21.2, base: -22.0, storey: 2.9, colour: [0.57, 0.57, 0.54], kind: KINDS.punched, bay: 2.9, plinth: 0.35,
    parts: [
      { ring: [[-236.3, -85.4], [-246.5, -84.7], [-246.5, -85.2], [-257.5, -84.5], [-257.9, -90.9], [-236.7, -92.3]], top: -14.94 },
      { ring: [[-207.2, -76.3], [-213.3, -75.9], [-214.0, -86.8], [-219.2, -86.4], [-218.0, -93.4], [-208.3, -94.0]], top: -13.87 },
      { ring: [[-245.6, -69.2], [-246.5, -84.7], [-236.3, -85.4], [-235.4, -69.8]], top: -12.45 },
      { ring: [[-266.7, -65.9], [-267.0, -71.5], [-265.8, -71.6], [-265.9, -73.9], [-263.2, -74.1], [-263.5, -79.5], [-264.8, -79.4], [-265.0, -82.3], [-263.7, -82.4], [-263.8, -84.1], [-246.5, -85.2], [-245.5, -68.4], [-260.6, -67.5], [-260.5, -66.3]], top: -9.21 },
      { ring: [[-213.0, -70.8], [-214.0, -86.8], [-236.3, -85.4], [-235.3, -69.4]], top: -8.09 }
    ],
    cornice: { h: 0.4, out: 0.3, colour: [0.3, 0.3, 0.29] },
    doors: [{ on: [[-257.9, -90.9], [-236.7, -92.3]], s: 10.5, w: 1.4, glass: true }],
    also: [{ id: 'w1529534136', parts: [
      { ring: [[-201.9, -84.4], [-202.2, -90.5], [-208.0, -90.1], [-207.7, -84.1]], top: -15.17 },
      { ring: [[-201.4, -76.9], [-201.8, -82.6], [-207.5, -82.2], [-207.2, -76.5]], top: -14.66 }
    ] }]
  },
  {
    // The Sportzentrum Davos (batch 7 of 11/1747/1011): the hall's block (flat roof −5.10, 15.7 m) against the
    // Eisstadion's west stand, the low strip along its north-east side (−13.51), here an arcade on posts over the
    // entrance (the pizza run's door to the Eisstadion lies under it, 1.4 m before the hall's wall). Photographs 2026
    // from the Talstrasse's south end (27699860203048074, 27761150653585002, 1596713498514109: across the sports ground,
    // its south-west front in dark weathered timber with rows of windows, "DAVOS" in white letters along its top,
    // solar panels on the roof; the same from the north, 3525605620930763 from 693's set). The arcade, the entrance and
    // the north-east front are guessed.
    id: 'w37221745', name: 'Sportzentrum Davos',
    exclude: [{ x: -191.9, z: -239.3, r: 3 }],
    floor: -20.5, base: -21.4, storey: 3.6, colour: C.larch, kind: KINDS.dark, bay: 3.0, plinth: 0.45, timber: { from: -20.1 },
    parts: [{ ring: [[-160.4, -221.9], [-202.4, -255.7], [-218.0, -268.3], [-227.4, -256.6], [-169.8, -210.2]], top: -5.1 }],
    cornice: { h: 0.5, out: 0.25, colour: [0.06, 0.05, 0.045] },
    arcade: { ring: [[-160.4, -221.9], [-156.6, -226.6], [-198.8, -260.6], [-202.4, -255.7]], top: -13.51, thick: 0.7, posts: 6.5, colour: [0.06, 0.05, 0.045] },
    shops: [{ on: [[-160.4, -221.9], [-202.4, -255.7]], s0: 38.0, s1: 50.0, top: -16.3, piers: [0.06, 0.05, 0.045] }],
    signs: [
      { on: [[-227.4, -256.6], [-169.8, -210.2]], s: 37.0, w: 15.0, y0: -7.9, y1: -5.75, key: 'davos' },
      { on: [[-160.4, -221.9], [-202.4, -255.7]], s: 44.0, w: 3.0, y0: -16.1, y1: -15.1, key: 'timeout' }
    ],
    shopIds: ['n4617931685']
  },
  {
    // The timber box on the Talstrasse west of the Coop (batch 10 of 11/1747/1011): flat-roofed at −7.92, 12.7 m. In
    // 2013 from the north-east (981778465560760 from the Coop's set, 154303453298239) and 2026 from the south-west
    // (1529453008863944, 3525605620930763): dark brown boards over a glazed ground floor set back under the overhang on
    // the street and the north-east end, posts at the overhang's edge. Its back is guessed.
    id: 'w110590693', name: 'the timber box',
    exclude: [{ x: -140.3, z: -256.8, r: 3 }],
    floor: -20.4, base: -21.2, storey: 3.0, colour: [0.13, 0.07, 0.04], kind: KINDS.dark, bay: 3.0, plinth: 0.3, timber: { from: -21.5 },
    parts: [
      { ring: [[-117.9, -261.1], [-143.2, -234.1], [-162.8, -252.5], [-137.5, -279.5]], top: -7.92, closed: true, foot: -16.1 },
      { ring: 'ground', top: -16.1, closed: true }
    ],
    // (the ground floor's outline: the street's and the north-east end's walls 2.4 m in)
    setback: { d: 2.4, edges: [0, 3] },
    cornice: { h: 0.35, out: 0.1, colour: [0.07, 0.04, 0.025] },
    shops: [
      { on: 'ground:0', s0: 0.6, s1: -0.6, top: -16.15, piers: [0.1, 0.1, 0.1], ground: true },
      { on: 'ground:3', s0: 0.6, s1: -0.6, top: -16.15, piers: [0.1, 0.1, 0.1], ground: true }
    ],
    posts: { edges: [0, 3], every: 7.0, from: -20.6, to: -16.1, half: 0.16, colour: [0.1, 0.1, 0.1] }
  },
  {
    // The Coop Pronto with its petrol station (batch 6 of 11/1747/1011): the shop's L under a flat roof (−13.98) and the
    // canopy over the pumps (−12.97) in its west corner, on the Talstrasse. Photographs 2021 from the Talstrasse
    // (385653816260064, 544790880063579, 4230351183723228) and 2026 (1748553526357149, 1391438536468657 from 489's
    // set): the canopy's white fascia with the orange band and "coop", the shop behind it, glazed on the street,
    // "coop pronto". Its back is guessed.
    id: 'w221123482', name: 'Coop Pronto',
    exclude: [{ x: -118.3, z: -208.9, r: 3 }],
    floor: -20.5, base: -21.3, storey: 3.3, colour: [0.58, 0.58, 0.56], kind: KINDS.punched, bay: 3.0, plinth: 0.3,
    parts: [{ ring: [[-121.7, -191.5], [-99.0, -215.5], [-104.5, -220.7], [-108.1, -216.9], [-112.5, -221.1], [-113.3, -220.3], [-119.4, -226.1], [-128.2, -215.2], [-117.7, -205.1], [-126.9, -195.5]], top: -13.98, closed: true }],
    cornice: { h: 0.6, out: 0.15, colour: [0.55, 0.55, 0.53] },
    shops: [
      { on: [[-128.2, -215.2], [-119.4, -226.1]], s0: 0.6, s1: 13.2, top: -16.6, piers: [0.3, 0.3, 0.3], fascia: C.orange },
      { on: [[-117.7, -205.1], [-128.2, -215.2]], s0: 0.6, s1: 13.8, top: -16.6, piers: [0.3, 0.3, 0.3] }
    ],
    signs: [{ on: [[-128.2, -215.2], [-119.4, -226.1]], s: 7.0, w: 5.5, y0: -16.45, y1: -15.45, key: 'pronto' }],
    station: {
      ring: [[-126.9, -195.5], [-117.7, -205.1], [-128.2, -215.2], [-137.4, -205.6]], top: -12.97, thick: 1.0,
      // the pump islands (centre, the long axis, half length) under it, two columns on each
      pumps: [{ x: -129.7, z: -207.4, u: [0.69, -0.72], half: 2.4 }, { x: -125.4, z: -203.3, u: [0.69, -0.72], half: 2.4 }],
      column: { at: 2.0, half: 0.2 }
    },
    shopIds: ['n928545586', 'n9931694417']
  },
  {
    // The beige block across the lane from the Coop (batch 7 of 11/1748/1011; batches 0 and 14, a slab on the ground
    // between it and the garage, too): five storeys under a flat roof (−4.78). In 2013 from the north-east
    // (154303453298239, 981778465560760): beige render, the windows with dark brown panels under them in stacks; 2026
    // from the Talstrasse (1748553526357149, 1391438536468657) behind the Coop's canopy. Its south side is guessed.
    id: 'w221123489', name: 'the beige block',
    exclude: [{ x: -95.8, z: -242.8, r: 3 }, { x: -89.5, z: -248.8, r: 3 }],
    floor: -20.2, base: -21.0, storey: 2.9, colour: C.beige, kind: KINDS.panel, bay: 2.7, plinth: 0.4,
    parts: [{ ring: [[-103.6, -252.5], [-106.3, -247.2], [-108.0, -248.0], [-111.7, -240.4], [-105.8, -237.3], [-104.9, -238.9], [-98.5, -235.6], [-98.0, -236.6], [-83.4, -228.9], [-79.8, -235.9], [-81.7, -236.9], [-79.8, -240.5], [-92.7, -247.3], [-91.6, -249.5], [-94.0, -250.8], [-92.5, -253.6], [-99.0, -256.9], [-101.8, -251.6]], top: -4.78 }],
    cornice: { h: 0.45, out: 0.35, colour: [0.32, 0.3, 0.27] },
    doors: [{ on: [[-83.4, -228.9], [-79.8, -235.9]], s: 3.9, w: 1.4, glass: true }],
    // the slab between it and the garage (batches 0 and 14): its outline, its top
    slab: { ring: [[-88.7, -245.2], [-92.7, -247.3], [-91.6, -249.5], [-92.4, -249.9], [-91.1, -252.2], [-86.3, -249.7]], top: -20.25 }
  },
  {
    // The Sportplatzgarage Gutknecht's house (batch 12 of 11/1748/1011): a five-storey block (−5.87) with two-storey
    // wings west and north of it (−14.20, −14.04) and the garage's workshop on the street (−13.61). Photographs 2021
    // from the Talstrasse (895278887755813, 573826356956909, 4259135914140419): the cream block with its balconies on
    // the corner, dark rails and brown awnings, the flat roof's dark eaves. The workshop and its lettering are guessed
    // (OpenStreetMap names the garage).
    id: 'w126271018', name: 'the garage house',
    exclude: [{ x: -76.7, z: -261.5, r: 3 }],
    floor: -19.9, base: -20.9, storey: 2.75, colour: [0.57, 0.52, 0.4], kind: KINDS.punched, bay: 2.7, plinth: 0.35,
    parts: [
      { ring: [[-82.3, -252.7], [-84.3, -253.8], [-81.4, -259.3], [-79.9, -258.6], [-76.7, -264.7], [-78.2, -265.4], [-77.9, -265.9], [-81.8, -267.9], [-89.8, -252.5], [-90.8, -253.0], [-91.1, -252.2], [-86.3, -249.7], [-83.7, -248.4], [-83.2, -249.4], [-83.8, -249.7]], top: -14.2 },
      { ring: [[-82.3, -252.7], [-83.8, -249.7], [-72.9, -244.0], [-70.7, -248.2], [-78.0, -252.1], [-78.7, -250.8]], top: -14.04 },
      { ring: [[-62.2, -270.1], [-65.2, -264.5], [-75.8, -270.1], [-77.9, -265.9], [-84.2, -269.2], [-79.1, -279.0]], top: -13.61, colour: [0.55, 0.55, 0.53], closed: true },
      { ring: [[-78.0, -252.1], [-78.7, -250.8], [-84.3, -253.8], [-81.4, -259.3], [-79.9, -258.6], [-76.7, -264.7], [-78.2, -265.4], [-75.8, -270.1], [-62.8, -263.3], [-70.7, -248.2]], top: -5.87 }
    ],
    cornice: { h: 0.4, out: 0.5, colour: C.brown, parts: [3] },
    balconies: [
      { on: [[-62.8, -263.3], [-70.7, -248.2]], s0: 0.4, s1: 5.6, depth: 1.4, rail: 'metal', awning: [0.25, 0.12, 0.06] },
      { on: [[-62.8, -263.3], [-70.7, -248.2]], s0: 11.0, s1: 16.6, depth: 1.4, rail: 'metal', awning: [0.25, 0.12, 0.06] }
    ],
    shops: [{ on: [[-84.2, -269.2], [-79.1, -279.0]], s0: 0.6, s1: 10.4, top: -16.0, piers: [0.3, 0.3, 0.3], garage: true }],
    signs: [{ on: [[-84.2, -269.2], [-79.1, -279.0]], s: 5.5, w: 9.0, y0: -15.6, y1: -14.85, key: 'garage' }],
    shopIds: ['n8696405565']
  },
  {
    // The pink block on the Talstrasse's north-east stretch (batches 18 and 5 of 11/1748/1012): six storeys (−1.64)
    // over a two-storey podium along the street (−13.11; its south edge here on the block's walls). Photographs 2014 from
    // the Talstrasse (169989281665511: salmon-pink render, the loggias glazed in grey-blue in bands along every floor,
    // the podium on the street with a garden on its roof), 2026 (935601376265383, 1593449972564373, 1659650149058920)
    // the same from the south-west, and 046's photographs (411621663695366: its west end). Its back is guessed.
    id: 'w116881268', name: 'the pink block',
    exclude: [{ x: -59.2, z: -315.3, r: 3 }, { x: -59.3, z: -325.5, r: 3 }],
    floor: -19.6, base: -20.5, storey: 2.9, colour: C.salmon, kind: KINDS.band, bay: 2.6, plinth: 0.35,
    parts: [
      { ring: [[-37.2, -326.0], [-79.2, -299.9], [-81.3, -303.3], [-79.5, -313.5], [-75.9, -313.1], [-76.1, -310.2], [-70.8, -309.1], [-67.9, -311.4], [-65.2, -315.8], [-59.7, -314.4], [-55.3, -317.7], [-54.1, -320.6], [-50.1, -320.4], [-47.3, -324.2], [-43.5, -324.0], [-38.9, -327.6]], top: -13.11, kind: KINDS.punched },
      { ring: [[-75.9, -313.1], [-79.5, -313.5], [-77.6, -321.6], [-50.8, -341.7], [-38.9, -330.3], [-40.3, -329.0], [-38.9, -327.6], [-43.5, -324.0], [-47.3, -324.2], [-50.1, -320.4], [-54.1, -320.6], [-55.3, -317.7], [-59.7, -314.4], [-65.2, -315.8], [-67.9, -311.4], [-70.8, -309.1], [-76.1, -310.2]], top: -1.64 }
    ],
    cornice: { h: 0.4, out: 0.7, colour: [0.6, 0.6, 0.58], parts: [1] },
    doors: [{ on: [[-37.2, -326.0], [-79.2, -299.9]], s: 30.0, w: 1.6, glass: true }],
    garageDoors: [{ on: [[-37.2, -326.0], [-79.2, -299.9]], s: [8.0, 12.0, 41.0], w: 2.6, h: 2.3 }]
  },
  {
    // The log chalet on the corner of the Eisbahnstrasse (batch 14 of 11/1748/1012): the survey's tile has a flat roof
    // (−7.93) over it; the photographs show a saddle roof with its gable on the side street (2021, 2026 and 2014 from
    // the Talstrasse: 411621663695366, 1079904051177172, 901724084000188): a white ground floor, dark brown logs over
    // it, white windows with red shutters, a balcony under the gable. The eaves at −11.0 and the ridge at −6.0 here
    // (their mean near the survey's height); the north-east gable and the back are guessed.
    id: 'w126271046', name: 'the log chalet',
    exclude: [{ x: -25.5, z: -303.8, r: 3 }],
    floor: -19.25, base: -20.0, storey: 2.7, colour: C.white, kind: KINDS.redShutters, bay: 2.3, plinth: 0.3, timber: { from: -16.55, colour: C.logs },
    parts: [{ ring: [[-14.9, -302.9], [-23.9, -311.7], [-27.2, -311.9], [-36.1, -306.7], [-26.9, -295.5]], roofs: [0] }],
    roofs: [{ a: R2(at(CH, -0.9, 1.0)), b: R2(at(CH, 14.9, 1.0)), y: -6.0, eaves: -11.0, cL: 9.2, cR: 9.1 }],
    balconies: [{ on: [[-36.1, -306.7], [-26.9, -295.5]], s0: 2.0, s1: 12.5, depth: 1.2, rail: 'timber', floors: [2] }],
    doors: [{ on: [[-14.9, -302.9], [-26.9, -295.5]], s: 5.0, w: 1.0 }]
  },
  {
    // The white house at the row's north-east end (batches 23 and 21 of 11/1748/1012, two surveys of the same house):
    // a hipped roof (ridge −3.6, eaves −6.0) along its length, a cross gable on each long side (ridge −3.6, eaves −5.2).
    // Photographs from the Talstrasse (1079904051177172 2026, 901724084000188 2014, far): white render, timber balconies,
    // the dark roof. Its sides away from the street are guessed.
    id: 'w116881236', name: 'the white house',
    exclude: [{ x: -3.4, z: -322.2, r: 3 }],
    floor: -19.0, base: -19.8, storey: 2.9, colour: C.white, kind: KINDS.brownShutters, bay: 2.4, plinth: 0.3,
    parts: [{ ring: [[-10.7, -323.6], [-2.6, -314.5], [3.9, -320.2], [-4.1, -329.4]], roofs: [0, 1] }],
    roofs: [
      { a: [-8.05, -327.3], b: [1.3, -316.6], y: -3.6, eaves: -6.0, cL: 5.3, cR: 5.3, hip: [0.6, 0.6] },
      { a: R2(at(WX, -5.3, 0)), b: R2(at(WX, 5.3, 0)), y: -3.6, eaves: -5.2, cL: 3.4, cR: 3.4 }
    ],
    balconies: [
      { on: [[-10.7, -323.6], [-2.6, -314.5]], s0: 3.2, s1: 9.0, depth: 1.3, rail: 'timber', floors: [1, 2, 3] },
      { on: [[3.9, -320.2], [-4.1, -329.4]], s0: 3.2, s1: 9.0, depth: 1.3, rail: 'timber', floors: [1, 2, 3] }
    ],
    doors: [{ on: [[-2.6, -314.5], [3.9, -320.2]], s: 4.3, w: 1.1 }]
  }
];

// --- Derived rings ----------------------------------------------------------------------------------------------------------
/** A ring with some of its edges (indices into the ring as given) moved `d` m inwards, the corners where they meet */
export function insetEdges(ring, d, edges) {
  const n = ring.length;
  // (the ring's turn: the inward side of each edge)
  const sgn = Math.sign(ringArea2(ring)) || 1;
  const lines = ring.map((a, i) => {
    const b = ring[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    // inward normal: for a ring turning with sign s, the inside lies on the left (s > 0) of a→b
    const nIn = sgn > 0 ? [-u[1], u[0]] : [u[1], -u[0]];
    const k = edges.includes(i) ? d : 0;
    return { p: [a[0] + nIn[0] * k, a[1] + nIn[1] * k], u };
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    const A = lines[(i + n - 1) % n], B = lines[i];
    const den = A.u[0] * B.u[1] - A.u[1] * B.u[0];
    if (Math.abs(den) < 1e-6) { out.push(R2(B.p)); continue; }
    const t = ((B.p[0] - A.p[0]) * B.u[1] - (B.p[1] - A.p[1]) * B.u[0]) / den;
    out.push(R2([A.p[0] + A.u[0] * t, A.p[1] + A.u[1] * t]));
  }
  return out;
}
// (the timber box's ground floor: its ring with the street's and the end's walls set back)
for (const h of HOUSES) {
  if (!h.setback) continue;
  const full = h.parts.find((p) => Array.isArray(p.ring));
  for (const p of h.parts) if (p.ring === 'ground') p.ring = insetEdges(full.ring, h.setback.d, h.setback.edges);
  for (const s of h.shops || []) {
    if (typeof s.on !== 'string') continue;
    const g = h.parts.find((p) => p.top === full.foot && p !== full).ring, i = +s.on.split(':')[1];
    s.on = [g[i], g[(i + 1) % g.length]];
    if (s.s1 < 0) s.s1 += Math.hypot(s.on[1][0] - s.on[0][0], s.on[1][1] - s.on[0][1]);
  }
}

// --- Roofs ------------------------------------------------------------------------------------------------------------------
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
/** Every part of the row (the houses' and their small neighbours'), with its house */
export const allParts = () => HOUSES.flatMap((h) => [
  ...h.parts.map((p) => ({ house: h, part: p })),
  ...(h.also || []).flatMap((a) => (a.parts || []).map((p) => ({ house: h, part: p })))
]);
/**
 * The parts' outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): the parts reaching the
 * ground (not the timber box's overhanging upper floors, nor the stair head on the balconied block's roof)
 */
export const groundOutlines = (house) => house.parts.filter((p) => p.foot === undefined && !p.onRoof).map((p) => p.ring);
/** The small neighbours' outlines: { id: rings } */
export const alsoOutlines = (house) => Object.fromEntries((house.also || []).map((a) => [a.id, a.rings || a.parts.map((p) => p.ring)]));
/** Is a point inside one of the row's houses (at the ground)? */
export const insideRow = (x, z) => HOUSES.some((h) => [...groundOutlines(h), ...Object.values(alsoOutlines(h)).flat()].some((r) => pointInRing(r, x, z)));

/**
 * A wall's frame from a segment (a, b) on a house's outline, turned so that it faces out of the house (its n leaving
 * the parts standing on the ground)
 */
export function wallOut(house, a, b) {
  const F = wallFrame(a, b), [x, z] = onWall(F, F.len / 2, 0.4);
  // (the parts on the ground: the timber box's glazing faces out under its overhanging floors)
  return house.parts.some((p) => p.foot === undefined && pointInRing(p.ring, x, z)) ? wallFrame(b, a) : F;
}

/** The storeys' feet of a house over its ground floor whose floor lies under `top` − 2.4 (the balconies' floors) */
export function upperFloors(house, top, from = 1) {
  const out = [];
  for (let k = from; house.floor + k * house.storey < top - 2.4; k++) out.push(house.floor + k * house.storey);
  return out;
}

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // the Talstrasse at the Rietstrasse, looking north-east: the EWD on the left, the pavilion and the balconied block
  // on the right, the cream blocks and the balcony tower beyond (the 2021 photograph's place)
  ewd: [-356, -19.6, 14, -318, -14, -34],
  // the crossing by the Coop Pronto looking north-east: the canopy, the timber box on the left, the beige block and the
  // garage house beyond; the Sportzentrum behind on the left
  coop: [-165, -18.9, -196, -110, -14, -245],
  // the north-east end looking east: the pink block on the left, the log chalet's gable and the white house ahead
  chalets: [-56, -18.0, -304.5, -10, -12, -316]
};

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
