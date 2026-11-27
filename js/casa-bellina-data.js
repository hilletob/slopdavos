// The Casa Bellina, an apartment house on the Jörg-Jenatsch-Strasse in Davos Dorf (js/casa-bellina.js): its three
// volumes, the floors' grid, the glazed balconies towards the street, the entrance, the garage's gate, the chimney
// stacks. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1751/1020, batches 9, 0 and 8): the roofs' outlines and heights below are its flat
// roofs, each a prism down under the ground; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The
// house steps down the slope from west to east: the west half's roof at 25.5, the east half's at 24.3, both over five
// floors of 3.2 m (the west half's floors stand 1.26 m higher), and a low annex on the north-east (batch 8, roof 12.05)
// holding the garage and a ground floor with a terrace on its roof. The street runs along the south front at y 6.2–8.5;
// the ground falls northwards to 4.7–6.2, where a lower floor and the garage come out of the slope. OpenStreetMap's
// footprint is w118240387 (up to 1.1 m off the surveyed walls).
// Mapillary's street views (2013, CC BY-SA): from the car park south of the street (1194971917590155, 164962552188782)
// the south front, stepped back towards the west in five blocks, each a stack of glazed balconies (frosted glass rails,
// pale yellow sun blinds, white slab edges) between white plastered piers that rise over the eaves to chimney heads
// with steel flues; the flat roof with deep eaves on white rafters; the entrance at street level under the east block's
// balconies. From the south-east (318531406555592, 934794187093758) the east end: white plaster with a regular grid of
// windows with grey roller shutters, the garage's ramp along it. From the west (2555782604716534, 794104648157760,
// 969489573794370) the west end and the stepped south front far off. The views from the north (171086124886188,
// 877750366108574, 973190166753560) show the houses north of it (w118240460 and the chalets beyond), not this one;
// 924798031707399 (from the east, 79 m off) shows its east end far off behind the trees. The north side, the west
// end's windows, the garage's gate and the lower floor on the north are guessed; the name by the door is drawn plain,
// not after a photograph.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const CASA_BELLINA = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles
  exclude: [{ x: 454.6, z: -1160.9, r: 3 }, { x: 471.2, z: -1153.5, r: 3 }, { x: 473.5, z: -1163.0, r: 3 }],
  osm: 'w118240387',
  storey: 3.2,
  base: 3.5, // how far down the walls reach (under the lowest ground, 4.7 on the north-east)
  // The volumes, each a flat roof at `top` over its outline (world x, z). `foot`: the ground floor's foot (the floors'
  // grid counts up from it; `line` the top floor's top, the wall over it a parapet); `cellar`: a floor under the ground
  // floor comes out of the slope where the ground falls (its windows on the north side)
  parts: [
    // the west half (batch 9): five floors over the street's level, higher up the slope
    { id: 'west', top: 25.52, foot: 9.52, line: 25.52, cellar: true,
      ring: [[440.1, -1159.2], [443.9, -1158.1], [446.4, -1153.8], [453.1, -1151.5], [454.7, -1152.1], [455.8, -1149.9], [459.9, -1148.7], [462.9, -1150.4],
        [465.1, -1157.3], [467.1, -1156.6], [469.2, -1163.8], [453.6, -1168.4], [454.1, -1169.8], [443.4, -1173.0], [439.9, -1161.0], [440.6, -1160.8]] },
    // the east half (batch 0): five floors, a step lower
    { id: 'east', top: 24.26, foot: 8.26, line: 24.26, cellar: true,
      ring: [[481.2, -1151.4], [482.3, -1155.1], [481.4, -1155.5], [481.7, -1156.4], [480.2, -1158.7], [478.1, -1159.4], [478.5, -1161.0], [470.7, -1163.3],
        [470.3, -1161.9], [467.8, -1162.7], [467.6, -1161.7], [466.4, -1157.9], [464.5, -1158.5], [462.1, -1151.1], [461.2, -1150.5], [460.2, -1150.0],
        [462.8, -1146.8], [470.3, -1144.6], [470.7, -1145.8], [477.7, -1143.8], [478.2, -1145.3], [478.7, -1145.1], [480.6, -1151.6]] },
    // the annex on the north-east (batch 8): the garage under the east half's ground floor, a terrace on its roof
    { id: 'annex', top: 12.05, foot: 8.26, line: 11.46, cellar: false, terrace: true,
      ring: [[471.0, -1160.7], [471.4, -1162.0], [477.3, -1160.3], [476.9, -1158.8], [477.7, -1158.5], [479.5, -1163.9], [469.2, -1167.4], [467.8, -1163.2],
        [467.9, -1163.1], [467.6, -1161.7], [470.2, -1161.0]] }
  ],
  floors: 5,
  // The fronts of the five blocks towards the street (a → b as wallFrame wants them, west to east): stacks of glazed
  // balconies between white piers
  loggias: [
    [[440.1, -1159.2], [443.9, -1158.1]],
    [[446.4, -1153.8], [453.1, -1151.5]],
    [[455.8, -1149.9], [459.9, -1148.7]],
    [[462.8, -1146.8], [470.3, -1144.6]],
    [[470.7, -1145.8], [477.7, -1143.8]]
  ],
  // A balcony front: the piers' width at its ends, a blind's width (about), and in its storey (m up from the floor's
  // foot) the slab's edge, the rail's top, the opening's top (the blinds' box over it)
  loggia: { pier: 0.3, panel: 3.5, slab: 0.24, rail: 1.12, open: 2.94 },
  // The entrance at the street's level under the east block's balconies (s m along its front, its width), the name
  // beside it [s0, s1] and its height over the ground
  entrance: { wall: [[470.7, -1145.8], [477.7, -1143.8]], door: { s: 1.3, w: 1.1 }, name: { s: [2.1, 3.9], y0: 0.7, y1: 1.15 } },
  // The garage's gate in the annex's east wall, where the ramp along the east end comes down (s m along, width, height)
  gate: { wall: [[477.7, -1158.5], [479.5, -1163.9]], s: 2.85, w: 3.0, h: 2.3 },
  // The piers' heads with their steel flues, over the roof between the blocks: where they stand, their size along the
  // front and across it, how far over the roof
  stacks: { at: [[454.9, -1152.5], [462.6, -1148.4], [470.6, -1146.4]], w: 1.5, d: 0.9, h: 1.3 },
  // The eaves round every roof: how far out, how thick; the rafters under them on the balconies' fronts (their spacing)
  eaves: { out: 0.7, thick: 0.4, rafter: 0.55 },
  // A window in the plastered walls: m up from its floor's foot, its half width; the bay
  win: { lo: 0.9, hi: 2.3, half: 0.55 },
  bay: 2.4,
  // the terrace's rail on the annex's roof
  rail: 1.0
};

/** A part by its id */
export const part = (id) => CASA_BELLINA.parts.find((p) => p.id === id);

/** The part of the house a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of CASA_BELLINA.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (either way round) the wall [a, b]? */
export const isWall = (w, a, b) => (near(a, w[0]) && near(b, w[1])) || (near(a, w[1]) && near(b, w[0]));
/** Is a → b one of the balconies' fronts? */
export const isLoggia = (a, b) => CASA_BELLINA.loggias.some((w) => isWall(w, a, b));

/**
 * How high another part covers the wall a → b of part `p`: the lowest, over three points along it, of the highest roof
 * of another part standing just before it (−Infinity where nothing stands before it). The wall shows from there up.
 */
export function coveredTo(p, a, b) {
  const F = wallFrame(a, b);
  let lo = Infinity;
  for (const t of [0.25, 0.5, 0.75]) {
    const [x, z] = onWall(F, F.len * t, 0.3);
    let hi = -Infinity;
    for (const q of CASA_BELLINA.parts) if (q !== p && pointInRing(q.ring, x, z)) hi = Math.max(hi, q.top);
    lo = Math.min(lo, hi);
  }
  return lo;
}

/**
 * The foot of the lowest row of windows on a wall of part `p` whose ground (or whatever stands before it) reaches `hi`:
 * the first floor whose window (`lo` m over its foot) clears it; the floor under the ground floor where the part has
 * one and the slope falls away
 */
export function firstRow(p, hi, lo) {
  const S = CASA_BELLINA.storey;
  const k = Math.max(p.cellar ? -1 : 0, Math.ceil((hi - p.foot - lo) / S - 1e-9));
  return p.foot + k * S;
}

/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): every part stands on the ground */
export const groundOutlines = () => CASA_BELLINA.parts.map((p) => p.ring);

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
