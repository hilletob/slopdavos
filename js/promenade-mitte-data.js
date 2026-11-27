// The houses along the Promenade between Platz and Dorf (7270 Davos Platz; js/promenade-mitte.js): their parts, looks,
// shop fronts and lettering. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1750/1015, 11/1751/1016): every part below is a surveyed roof outline with its
// height, the walls standing on it; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The look after
// Mapillary's street views (CC BY-SA, 2013–2015, all in winter), each photo's camera checked against the outlines:
// - w117012321, the white block south of the Promenade at its west end (batch 17 of 11/1750/1015, flat roof at 17.63 on
//   ground falling from −1.3 at the Promenade to −5.2 behind): 135681665209956 and 265493675274010 (2015, from the
//   Promenade north-east of it) show its north and east fronts: white render, five rows of ribbon windows in dark frames
//   with light timber sliding shutters, a thin roof edge, a chimney; 472465050689524 (2013, from the north-west) shows
//   its building pit, 793166861585721 (2013) the old houses. The batch also holds a low block on its south side (6.71),
//   in no OSM building: built with it, its look guessed (white render, small windows).
// - w127653793, the salmon-pink house north of the Promenade (batch 11, flat at 16.4): 2987001491582709, 525891151905016
//   and 577769879876099 (2015, from the Promenade east of it): its east and south-east fronts, the ground floor and three
//   floors of tall windows in white surrounds, a deep cornice; the low cream annexes before it are w1530028811's.
// - w1530028811 (Vreni's Teekanne; no batch of its own: its low parts are batch 11's, 5.9–10 m): the same photos and
//   2741024032877545: the single-storey shop on the Promenade before the pink house with the teapot board, the low arm
//   along the parking towards the north-east with a timber fascia and a green-and-white awning at its end.
// - w127653797, the house west of the pink one: batch 11's 14.51 outline (and its rear at 6.88 and 5.07) and batch 14's
//   shallow saddle roof (ridge 14.8, eaves 12.2) over its middle, which the streamed tiles would still draw: excluded
//   too. No photo shows it (the pink house hides it from the Promenade): plain white render, guessed.
// - w127653818 and w127653819 (Orange Davos, Denner), the twin blocks south-east of the Promenade (batch 21 of
//   11/1751/1016): walls to 20.2, an attic set back to 23.25 under a deep flat roof, a stair house to 24.6; between them
//   a link and along the far end of 819 a strip three storeys high (9.22). 907962716415449, 257530119439864,
//   1166783483769722, 1291747297888636, 849475095916619, 1418607708472758, 179209190733562, 604482104280415,
//   168191291945502 (2013–2015, from the Promenade north-east of them): tan render, five floors of windows with roller
//   blinds over the shop floor, the shops under a flat canopy roof before the front (OSM's outline holds it, 2.4 m before
//   the survey's walls), red DENNER signs. 295421508803399 (2014, from the south-west) shows the AMERON's site.
// - w117012350 (Marionnaud), the pale blue house at the Promenade's bend (batches 18, 5, 4): the steep saddle roof
//   (eaves 20.3, ridge 29.8) with its gables to the north-west and south-east, a cross gable on the south-west side
//   (ridge 29.3), a wing to 12.96 west of it. 515295476137150, 1011904866006837, 2889092321332915 (2014–2015, from the
//   Promenade north of it): pale blue render, white window surrounds, grey-green shutters, two small dormers, a cross
//   gable over the north-east side (the survey's roof has a hole there: its size guessed), the shops under a flat canopy
//   on the Promenade side. 107887138016980 and 1439215746414249 (2013, from the north-west) show the lane beside it.
//   The wing west of it is not in the 2015 views (newer, or a lower pavilion then): built as surveyed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

const r2 = (v) => Math.round(v * 100) / 100;

// --- w117012350's frame: t along its ridge from the south-east gable's roof edge towards the north-west, c across it
// (towards the north-east). World x = o.x + t·u.x + c·n.x, z likewise
export const FRAME_350 = { o: [482.5, -764.4], u: [-0.6489, -0.7607], n: [0.7607, -0.6489] };
/** World [x, z] of a point (t, c) of w117012350's frame */
export const at350 = (t, c) => {
  const { o, u, n } = FRAME_350;
  return [r2(o[0] + u[0] * t + n[0] * c), r2(o[1] + u[1] * t + n[1] * c)];
};
/** w117012350's frame [t, c] of a world point */
export const local350 = (x, z) => {
  const { o, u, n } = FRAME_350, dx = x - o[0], dz = z - o[1];
  return [dx * u[0] + dz * u[1], dx * n[0] + dz * n[1]];
};

// The looks: the render's colour (linear), the windows (`style` 1 punched in surrounds, 2 ribbon windows, 3 punched with
// shutters, 4 punched with roller blinds), their frames' colour, the floors' grid (`floor0` a storey's foot, `storey`),
// a window from `lo` to `hi` m over its storey's foot, `half` its half width, `bay` the bays' spacing (the ribbon's
// mullions), `seed` for the lit windows at night
export const LOOKS = {
  ribbon: { colour: [0.6, 0.6, 0.58], style: 2, frame: [0.07, 0.055, 0.045], floor0: -5.0, storey: 3.1, lo: 0.85, hi: 2.35, half: 0.6, bay: 1.3, seed: 11 },
  ribbonBack: { colour: [0.6, 0.6, 0.58], style: 1, frame: [0.07, 0.055, 0.045], floor0: -5.0, storey: 3.1, lo: 0.95, hi: 2.3, half: 0.55, bay: 2.6, seed: 12 },
  pink: { colour: [0.53, 0.35, 0.28], style: 1, frame: [0.6, 0.6, 0.58], floor0: 0.4, storey: 3.5, lo: 1.0, hi: 2.8, half: 0.6, bay: 2.9, seed: 21 },
  white: { colour: [0.57, 0.56, 0.53], style: 1, frame: [0.52, 0.52, 0.5], floor0: -0.3, storey: 3.0, lo: 0.9, hi: 2.3, half: 0.6, bay: 2.8, seed: 31 },
  cream: { colour: [0.47, 0.43, 0.35], style: 1, frame: [0.55, 0.55, 0.52], floor0: 0.3, storey: 3.2, lo: 1.0, hi: 2.4, half: 0.7, bay: 3.2, seed: 41 },
  tan: { colour: [0.36, 0.29, 0.21], style: 4, frame: [0.5, 0.49, 0.46], floor0: 2.1, storey: 3.0, lo: 0.9, hi: 2.4, half: 0.65, bay: 2.7, seed: 51 },
  blue: { colour: [0.45, 0.52, 0.61], style: 3, frame: [0.6, 0.61, 0.6], floor0: 2.3, storey: 3.0, lo: 0.85, hi: 2.45, half: 0.55, bay: 2.6, seed: 61 }
};

// --- The houses: each its OSM id, its parts (`ring` and `top` a flat-roofed prism from `base` — the ground when not
// given — or `gable`: a saddle roof over a rectangle, its `ridge` from gable wall to gable wall, `half` the walls' half
// width, `eave` the walls' top at the eaves, `top` the ridge's height, `ov` the eaves' and `ovEnd` the verges'
// overhang), `ground` whether a part stands on the ground (its walls the player's), the look of each part
// (`look`, by name), the cornice or eaves slab round a flat roof (`cornice` [out, depth])
const F350 = at350;
export const HOUSES = [
  {
    osm: 'w117012321', name: 'Promenade west block', look: 'ribbon',
    parts: [
      { id: 'block', top: 17.63, cornice: [0.12, 0.35], ring: [[252.0, -633.0], [266.4, -633.6], [268.0, -626.9], [282.7, -618.5], [285.1, -611.2], [271.8, -604.6], [270.8, -608.8], [255.4, -617.9]] },
      { id: 'south', top: 6.71, look: 'ribbonBack', cornice: [0.1, 0.3], ring: [[273.9, -596.6], [287.1, -603.1], [284.9, -611.1], [271.9, -604.6]] }
    ],
    doors: [{ part: 'block', at: [262.0, -633.2] }],
    chimneys: [[269.0, -620.5, 18.9]]
  },
  {
    osm: 'w127653793', name: 'the pink house', look: 'pink',
    parts: [
      { id: 'house', top: 16.4, cornice: [0.55, 0.45], ring: [[293.4, -660.0], [302.7, -664.1], [305.8, -660.1], [307.8, -661.3], [308.1, -660.7], [318.5, -669.6], [311.1, -678.5], [312.9, -680.1], [305.3, -689.1], [297.7, -682.8], [299.9, -679.9], [297.0, -677.6], [286.8, -673.0], [291.7, -661.0], [292.9, -661.5]] },
      { id: 'link', top: 5.98, look: 'cream', cornice: [0.1, 0.3], ring: [[297.7, -682.8], [299.9, -679.9], [297.0, -677.6], [286.8, -673.0], [288.7, -668.2], [280.7, -665.5], [280.6, -666.2], [281.3, -666.3], [280.3, -677.5], [285.6, -677.5], [304.8, -692.3], [305.2, -691.8], [302.8, -689.8], [304.6, -688.5]] },
      { id: 'back', top: 9.97, look: 'cream', cornice: [0.1, 0.3], ring: [[304.6, -688.5], [302.8, -689.8], [311.8, -697.2], [315.9, -692.2]] }
    ],
    doors: [{ part: 'house', at: [289.2, -667.1] }]
  },
  {
    osm: 'w1530028811', name: "Vreni's Teekanne", look: 'cream',
    parts: [
      { id: 'shop', top: 6.26, cornice: [0.25, 0.4], ring: [[311.1, -678.5], [312.5, -679.7], [313.9, -678.0], [319.2, -682.6], [325.1, -675.9], [318.3, -669.9]] },
      { id: 'arm', top: 5.98, cornice: [0.6, 0.35], timber: true, ring: [[326.6, -677.3], [330.3, -680.2], [317.6, -695.9], [314.9, -693.4], [315.9, -692.2]] },
      { id: 'end', top: 7.42, cornice: [0.1, 0.3], ring: [[311.9, -697.1], [314.3, -699.1], [317.4, -695.6], [314.9, -693.4]] },
      { id: 'yard', top: 5.86, cornice: [0.1, 0.3], ring: [[317.6, -695.9], [313.0, -701.5], [306.7, -696.4], [311.8, -697.2], [311.9, -697.1], [314.3, -699.1]] },
      { id: 'nook', top: 5.98, cornice: [0.1, 0.3], ring: [[308.3, -694.4], [311.8, -697.2], [306.7, -696.4]] }
    ]
  },
  {
    osm: 'w127653797', name: 'the white house west of the pink one', look: 'white',
    parts: [
      { id: 'house', top: 12.2, cornice: [0.3, 0.3], roof: { x0: 266.2, x1: 279.4, z0: -674.0, z1: -654.4, ridgeX: 272.7, top: 14.8, eave: 12.2 }, ring: [[262.9, -672.8], [272.9, -673.6], [273.1, -671.3], [275.1, -671.5], [275.5, -667.3], [279.1, -667.6], [279.4, -663.6], [280.3, -663.7], [280.6, -660.1], [277.3, -659.9], [277.7, -655.6], [268.2, -654.8], [267.9, -659.2], [265.8, -659.1], [265.6, -661.4], [264.7, -661.3], [264.4, -664.6], [265.3, -664.6], [265.2, -665.9], [263.4, -665.7]] },
      { id: 'rear', top: 6.88, cornice: [0.1, 0.3], ring: [[279.2, -666.1], [281.3, -666.3], [280.3, -677.7], [273.3, -677.1], [273.8, -671.4], [275.1, -671.5], [275.2, -670.7], [276.4, -670.8], [276.7, -667.4], [279.1, -667.6]] },
      { id: 'porch', top: 5.07, cornice: [0.1, 0.3], ring: [[273.1, -671.3], [273.8, -671.4], [273.3, -676.7], [267.4, -676.2], [267.6, -673.2], [272.9, -673.6]] }
    ],
    doors: [{ part: 'house', at: [262.95, -669.2] }]
  },
  {
    osm: 'w127653818', name: 'the Promenade block south-west', look: 'tan',
    parts: [
      { id: 'block', top: 20.2, ring: [[372.5, -700.7], [384.1, -687.3], [403.4, -704.0], [391.8, -717.4]] },
      { id: 'attic', top: 23.25, base: 20.0, ground: false, cornice: [0.9, 0.28], ring: [[397.4, -705.8], [399.5, -703.4], [385.0, -690.9], [384.0, -692.0], [383.5, -691.6], [379.1, -696.7], [378.7, -696.4], [375.1, -700.6], [391.6, -714.8], [395.3, -710.5], [394.9, -710.2], [398.2, -706.5]] },
      { id: 'stair', top: 24.6, base: 23.0, ground: false, cornice: [0.15, 0.25], ring: [[381.0, -701.4], [390.2, -709.3], [393.1, -706.1], [393.5, -706.5], [395.0, -704.7], [385.4, -696.4]] },
      { id: 'link', top: 9.22, cornice: [0.15, 0.3], ring: [[403.4, -704.0], [407.7, -707.4], [398.4, -718.2], [394.2, -714.7]] }
    ],
    // the shops' band before the front (OSM's outline; the survey's walls 2.4 m behind it): its wall on the survey's front
    // from `a` to `b`, `depth` out, `top`; the shops' glazing along it
    band: { part: 'block', a: [372.5, -700.7], b: [391.8, -717.4], depth: 2.4, top: 5.1 }
  },
  {
    osm: 'w127653819', name: 'the Promenade block north-east (Denner)', look: 'tan',
    parts: [
      { id: 'block', top: 20.2, ring: [[407.7, -707.4], [427.0, -724.0], [415.5, -737.4], [396.1, -720.8]] },
      { id: 'attic', top: 23.25, base: 20.0, ground: false, cornice: [0.9, 0.28], ring: [[402.4, -716.4], [402.8, -716.8], [407.2, -711.7], [407.7, -712.1], [408.6, -711.0], [423.1, -723.5], [421.1, -725.9], [421.8, -726.5], [418.6, -730.3], [418.9, -730.6], [415.2, -734.9], [398.7, -720.7]] },
      { id: 'stair', top: 24.57, base: 23.0, ground: false, cornice: [0.15, 0.25], ring: [[404.7, -721.4], [413.9, -729.4], [416.7, -726.1], [417.1, -726.5], [418.6, -724.7], [409.0, -716.4]] },
      { id: 'strip', top: 9.22, cornice: [0.15, 0.3], ring: [[427.0, -724.0], [430.3, -726.0], [420.9, -737.2], [417.9, -734.7]] },
      { id: 'corner', top: 8.31, cornice: [0.15, 0.3], ring: [[419.0, -739.4], [420.9, -737.2], [417.9, -734.7], [416.0, -736.8]] }
    ],
    band: { part: 'block', a: [396.1, -720.8], b: [415.5, -737.4], depth: 2.4, top: 5.1 }
  },
  {
    osm: 'w117012350', name: 'the pale blue house (Marionnaud)', look: 'blue',
    parts: [
      { id: 'main', gable: { ridge: [F350(1.0, -0.1), F350(22.2, -0.1)], half: 6.5, eave: 21.51, top: 29.8, ov: 0.95, ovEnd: 1.2 } },
      { id: 'crossSW', gable: { ridge: [F350(11.3, -8.38), F350(11.3, -0.3)], half: 6.0, eave: 22.2, top: 29.3, ov: 0.67, ovEnd: 0.5 } },
      { id: 'crossNE', gable: { ridge: [F350(10.2, 7.4), F350(10.2, 1.5)], half: 3.6, eave: 21.15, top: 27.2, ov: 0.5, ovEnd: 0.45 } },
      { id: 'wing', top: 12.96, cornice: [0.2, 0.35], ring: [[460.1, -756.3], [450.8, -767.1], [463.0, -777.0], [466.2, -773.4], [464.8, -772.2], [470.5, -765.5]] }
    ],
    // two small dormers on the north-east slope (t along the ridge, the front at c), a chimney each side of the ridge
    dormers: [{ t: 15.6, c: 4.3 }, { t: 19.2, c: 4.3 }],
    chimneys: [[...F350(6.0, 1.6), 31.0], [...F350(17.5, -2.2), 30.2]],
    // the shops' canopy along the Promenade side (the north-west gable and the wing's front), `depth` out, at `top`
    canopy: { a: [450.8, -767.1], b: F350(22.2, 6.4), depth: 1.6, top: 8.0 },
    doors: [{ part: 'main', at: F350(1.0, 2.5) }]
  }
];

// The shop fronts: glazing on a wall from `a` to `b` (world points on it), up to `top` (a fascia under it), the lettering
// over it (`signs`: an atlas key, `w` its width, near the world point `near` or in the middle, at `y` or on the fascia)
export const SHOPFRONTS = [
  { house: 'w127653818', band: true, top: 5.1 },
  { house: 'w127653819', band: true, top: 5.1, signs: [{ key: 'orange', w: 3.2, near: [407.2, -725.1] }, { key: 'denner', w: 4.0, near: [413.1, -730.0] }] },
  { house: 'w1530028811', part: 'shop', a: [318.3, -669.9], b: [325.1, -675.9], top: 4.6 },
  { house: 'w1530028811', part: 'shop', a: [325.1, -675.9], b: [319.2, -682.6], top: 4.6, signs: [{ key: 'vreni', w: 1.4, near: [322.6, -679.0], y: 5.35 }] },
  { house: 'w1530028811', part: 'arm', a: [330.3, -680.2], b: [326.21, -685.25], top: 4.3 },
  { house: 'w117012350', part: 'main', a: F350(22.2, 6.3), b: F350(22.2, -6.6), top: 7.6, signs: [{ key: 'marionnaud', w: 5.6 }] },
  { house: 'w117012350', part: 'wing', a: [463.0, -777.0], b: [450.8, -767.1], top: 7.6 }
];

// The canvas atlas: lettering and the doors ([x, y, w, h] px in 1024 × 256)
export const ATLAS_SIZE = [1024, 256];
export const ATLAS = {
  denner: [0, 0, 320, 80],
  orange: [336, 0, 256, 80],
  marionnaud: [608, 0, 416, 72],
  vreni: [0, 96, 160, 160],
  door: [176, 96, 96, 160],
  awning: [288, 96, 256, 64]
};

// --- Frames and outlines --------------------------------------------------------------------------------------------------
/** The house by its OSM id */
export const houseOf = (osm) => HOUSES.find((h) => h.osm === osm);
/** A part of a house by its id */
export const partOf = (house, id) => house.parts.find((p) => p.id === id);
/** The look of a part */
export const lookOf = (house, part) => LOOKS[part.look || house.look];

/** A gable part's frame: its ridge's direction u, n across it, the ridge's start o, its length */
export function gableFrame(g) {
  const [a, b] = g.ridge, dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  const u = [dx / len, dz / len];
  return { o: a, u, n: [-u[1], u[0]], len };
}
const gpt = (G, t, c) => [r2(G.o[0] + G.u[0] * t + G.n[0] * c), r2(G.o[1] + G.u[1] * t + G.n[1] * c)];
/** A gable part's walls at the ground (world [x, z] × 4) */
export function gableRing(g) {
  const G = gableFrame(g);
  return [gpt(G, 0, -g.half), gpt(G, G.len, -g.half), gpt(G, G.len, g.half), gpt(G, 0, g.half)];
}
/** A gable part's roof outline (world [x, z] × 4) */
export function gableRoofRing(g) {
  const G = gableFrame(g), w = g.half + g.ov;
  return [gpt(G, -g.ovEnd, -w), gpt(G, G.len + g.ovEnd, -w), gpt(G, G.len + g.ovEnd, w), gpt(G, -g.ovEnd, w)];
}
/** A gable part's roof height over a world point (its planes, extended) */
export function gableRoofY(g, x, z) {
  const G = gableFrame(g), c = (x - G.o[0]) * G.n[0] + (z - G.o[1]) * G.n[1];
  return g.top - (Math.abs(c) * (g.top - g.eave)) / g.half;
}

/** A part's outline (its walls) */
export const partRing = (p) => (p.gable ? gableRing(p.gable) : p.ring);
/** Its roof's height over a point of it (flat: its top; gable: the roof plane; a saddle over a flat part: the higher) */
export function partTopAt(p, x, z) {
  if (p.gable) return gableRoofY(p.gable, x, z);
  if (p.roof) {
    const R = p.roof;
    if (x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1) return Math.max(p.top, saddleY(R, x));
  }
  return p.top;
}
/** The shallow saddle roof of w127653797 over a point x (its ridge along z) */
export function saddleY(R, x) {
  const w = x < R.ridgeX ? R.ridgeX - R.x0 : R.x1 - R.ridgeX;
  return R.top - (Math.abs(x - R.ridgeX) * (R.top - R.eave)) / w;
}

/** The shops' band of a house before its front: its outline (world), its front's frame */
export function bandRing(house) {
  const B = house.band;
  if (!B) return null;
  const F = outerFrame(partRing(partOf(house, B.part)), B.a, B.b);
  return { F, ring: [onWall(F, 0, 0), onWall(F, F.len, 0), onWall(F, F.len, B.depth), onWall(F, 0, B.depth)].map((q) => q.map(r2)) };
}

/** The frame of the stretch a → b (world points on a wall of `ring`), turned so that its n points out of the ring */
export function outerFrame(ring, a, b) {
  const F = wallFrame(a, b);
  const [x, z] = onWall(F, F.len / 2, 0.4);
  return pointInRing(ring, x, z) ? wallFrame(b, a) : F;
}

/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS) for a house: its parts on the ground and
 *  its shops' band */
export function groundOutlines(osm) {
  const h = houseOf(osm);
  const out = h.parts.filter((p) => p.ground !== false).map(partRing);
  const band = bandRing(h);
  if (band) out.push(band.ring);
  return out;
}
/** Every outline on the ground of the row */
export const allOutlines = () => HOUSES.flatMap((h) => groundOutlines(h.osm));
/** Is a point inside one of the row's houses? */
export const insideRow = (x, z) => allOutlines().some((r) => pointInRing(r, x, z));

// swissBUILDINGS3D's buildings (their centres) left out of the streamed tiles: batch 17 (w117012321), batch 11
// (w127653793, w127653797, w1530028811) and batch 14 (w127653797's saddle roof) of 11/1750/1015; batch 21
// (w127653818, w127653819) and batches 18, 5 and 4 (w117012350) of 11/1751/1016
export const EXCLUDE = [
  { x: 269.7, z: -615.1, r: 3 }, { x: 296.5, z: -678.4, r: 3 }, { x: 272.6, z: -662.6, r: 3 },
  { x: 401.4, z: -713.4, r: 3 }, { x: 469.5, z: -768.0, r: 3 }, { x: 460.7, z: -768.7, r: 3 }, { x: 475.0, z: -773.3, r: 3 }
];
// js/shops-data.js' businesses lettered here instead of its generic signs (Orange Davos, Denner, Marionnaud, Vreni's
// Teekanne)
export const SHOP_NODES = ['n3287588706', 'n3287588707', 'n3287588710', 'n3287610385'];

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
