// The Hotel Bündnerhof (Davos Platz, over the Eisstadion; js/buendnerhof.js): its four volumes, the floors' grid, the
// entrance front with the lettering, the balconies, the glazed restaurant at its west end. Pure data and frame maths,
// shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1746/1012, batches 9, 6, 4 and 3): the roofs' outlines and heights below are its
// flat roofs, each a prism down under the ground; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js).
// The main block (batch 9, 20.8 m over its lowest foot) runs west-north-west to east-south-east, 46 m long and 12–16 m
// deep, its middle set back on the north-north-east front; the ground falls along it from y −12.8 at its west corner
// to −19.3 at its east end. Two low wings (batches 4 and 3, two floors) stand before the east half of its
// south-south-west face, a one-storey hall (batch 6) round its west end, most of it outside OpenStreetMap's footprint
// (w123382379, whose walls stand up to 1.1 m off the surveyed ones elsewhere).
// The look after Mapillary's street views (2013–2014, CC BY-SA): from the path north-east of it (x −316…−330,
// z −316…−324) the north-north-east front in dusty pink-red plaster with small dark-framed windows in rows, a dark
// brown eave over the top floor, the middle set back with two floors of wide windows and "Hotel Bündnerhof" in plain
// letters over them, the doors at the path's end; from the street west of it (x −440, z −296) the west end over the
// glazed hall, dark timber balconies along the floors. The south-south-west faces, the wings and the east end are
// guessed (no photograph shows them).
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const BUENDNERHOF = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles
  exclude: [{ x: -361.4, z: -288.9, r: 3 }, { x: -384.3, z: -286.2, r: 3 }, { x: -352.5, z: -267.8, r: 3 }, { x: -357.3, z: -262.0, r: 3 }],
  osm: 'w123382379',
  storey: 3.0,
  bay: 2.6,
  base: -20.5, // how far down the walls reach (under the lowest ground, y −19.3 at the east end)
  // The volumes, each a flat roof at `top` over its outline (world x, z). `from`: the lowest floor's foot (the floors'
  // grid, whole storeys up to `line`, the top floor's top; from there to the roof a closed band under the eave).
  // `glazed`: the restaurant's glass round the hall from `from` up to `line`
  parts: [
    // the hotel: a ground floor and five floors, the eave over them
    { id: 'main', top: 1.59, line: 0.9, from: -17.1,
      ring: [[-361.9, -281.9], [-362.5, -280.9], [-364.9, -282.7], [-366.0, -281.2], [-384.1, -294.0], [-374.7, -307.3], [-363.6, -299.6],
        [-366.3, -295.7], [-357.9, -289.8], [-356.0, -292.4], [-338.7, -280.3], [-345.7, -270.5]] },
    // the hall round the west end: one tall glazed floor (the restaurant), its roof a terrace under the balconies
    { id: 'hall', top: -8.24, line: -8.84, from: -12.84, glazed: true,
      ring: [[-380.7, -297.4], [-383.9, -299.6], [-396.0, -282.3], [-382.4, -272.8], [-372.5, -286.8], [-372.7, -286.9], [-383.0, -294.2], [-380.9, -297.2]] },
    // the two low wings before the east half of the south-south-west face: two floors each
    { id: 'wing-east', top: -10.62, line: -11.3, from: -17.3,
      ring: [[-352.2, -276.0], [-360.5, -264.2], [-353.7, -259.4], [-344.5, -272.4], [-345.0, -272.7], [-345.8, -271.5], [-346.2, -271.8], [-351.4, -275.4]] },
    { id: 'wing-south', top: -10.69, line: -11.3, from: -17.3,
      ring: [[-356.8, -267.7], [-357.6, -268.3], [-363.4, -260.1], [-357.0, -255.6], [-351.3, -263.9], [-351.6, -264.1], [-353.9, -260.8], [-354.4, -261.1],
        [-359.1, -264.4], [-357.4, -266.9]] }
  ],
  // A window: m up from its floor's foot, its half width; a balcony's door (the faces with balconies)
  win: { lo: 0.95, hi: 2.35, half: 0.62 },
  door: { lo: 0.05, hi: 2.3, half: 0.5 },
  // The entrance front: the main block's middle, set back on the north-north-east side (a → b, east to west as wallFrame
  // wants it). Its three lower floors are drawn by hand: the doors under a canopy on the ground floor with a window each
  // side (`low`: m off the middle, half width), two wide windows on each of the two floors over it (`wide`), the name
  // over them (`name`, its width and heights)
  entrance: {
    a: [-357.9, -289.8], b: [-366.3, -295.7],
    floors: 3,
    door: { w: 2.2, h: 2.5 },
    canopy: { w: 3.8, out: 1.7, thick: 0.25 },
    low: { at: 2.7, half: 0.6, lo: 0.95, hi: 2.35 },
    wide: { at: 2.55, half: 1.75, lo: 0.8, hi: 2.4, floors: [1, 2] },
    name: { w: 8.2, y0: -8.62, y1: -7.42 }
  },
  // The faces with balconies (a → b): the west end and the south-south-west faces. A slab and a closed timber rail
  // before every bay with windows from the first floor up, where nothing stands under it within 1.5 m
  balconies: {
    walls: [[[-374.7, -307.3], [-384.1, -294.0]], [[-384.1, -294.0], [-366.0, -281.2]], [[-361.9, -281.9], [-345.7, -270.5]]],
    out: 1.4, rail: 1.0, clear: 1.5
  },
  eave: { out: 0.65, thick: 0.45 }
};

/** A part by its id */
export const part = (id) => BUENDNERHOF.parts.find((p) => p.id === id);

/** The part of the hotel a point lies in (the highest roof over it), or null */
export function partAt(x, z, but = null) {
  let best = null;
  for (const p of BUENDNERHOF.parts) if (p !== but && pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
const same = (a, b, W) => (near(a, W[0]) && near(b, W[1])) || (near(a, W[1]) && near(b, W[0]));
/** Is a → b (either way round) the entrance front? */
export const isEntrance = (a, b) => same(a, b, [BUENDNERHOF.entrance.a, BUENDNERHOF.entrance.b]);
/** Is a → b (either way round) a face with balconies? */
export const isBalconyWall = (a, b) => BUENDNERHOF.balconies.walls.some((W) => same(a, b, W));

/**
 * What stands under a point before a wall of part `p`: the ground (`ground(x, z)`) or the roof of another part over
 * it, whichever is higher
 */
export function underAt(p, x, z, ground) {
  const q = partAt(x, z, p);
  return Math.max(ground(x, z), q ? q.top : -Infinity);
}

/**
 * A wall of part `p` (its frame F) cut at its bays' edges into stretches: [{ s0, s1, fromY }], fromY the foot of the
 * lowest floor whose windows clear what stands before the stretch (the ground or another part's roof, half a metre
 * out); under it a closed plinth. Neighbouring stretches with the same fromY are merged.
 */
export function wallStretches(p, F, ground, win = BUENDNERHOF.win) {
  const S = BUENDNERHOF.storey, bay = BUENDNERHOF.bay, mid = F.len / 2;
  const cuts = [0];
  for (let k = -Math.ceil(mid / bay) - 1; k <= Math.ceil(mid / bay); k++) {
    const s = mid + (k + 0.5) * bay;
    if (s > 0.05 && s < F.len - 0.05) cuts.push(s);
  }
  cuts.push(F.len);
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const s0 = cuts[i], s1 = cuts[i + 1];
    let hi = -Infinity;
    const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
    for (let j = 0; j <= n; j++) hi = Math.max(hi, underAt(p, ...onWall(F, s0 + ((s1 - s0) * j) / n, 0.5), ground));
    let k = 0;
    while (p.from + k * S + win.lo < hi + 0.1) k++;
    const fromY = p.from + k * S;
    const last = out[out.length - 1];
    if (last && Math.abs(last.fromY - fromY) < 1e-6) last.s1 = s1;
    else out.push({ s0, s1, fromY });
  }
  return out;
}

/**
 * The balconies of a face with balconies (part `p`, its frame F): [{ s0, s1, y }] a slab's ends along the wall and its
 * top (a floor's foot), one per bay with windows, from the first floor to the top floor, where nothing stands within
 * `clear` m under it
 */
export function balconiesOf(p, F, ground) {
  const Bc = BUENDNERHOF.balconies, S = BUENDNERHOF.storey, bay = BUENDNERHOF.bay, mid = F.len / 2, half = BUENDNERHOF.door.half;
  const out = [];
  for (let k = -Math.floor(mid / bay) - 1; k <= Math.floor(mid / bay) + 1; k++) {
    if (Math.abs(k * bay) + half + 0.4 > mid) continue; // (a bay without a door: windowGrid's `open`)
    const s = mid + k * bay, s0 = s - bay / 2 + 0.05, s1 = s + bay / 2 - 0.05;
    if (s0 < 0.2 || s1 > F.len - 0.2) continue;
    const st = wallStretches(p, F, ground, BUENDNERHOF.door).find((t) => s >= t.s0 && s <= t.s1);
    let under = -Infinity;
    for (const t of [s0, s, s1]) for (const o of [0.3, Bc.out / 2, Bc.out]) under = Math.max(under, underAt(p, ...onWall(F, t, o), ground));
    for (let f = 1; p.from + f * S <= p.line - S + 1e-6; f++) {
      const y = p.from + f * S;
      if (y < st.fromY - 1e-6 || y - under < Bc.clear) continue;
      out.push({ s0, s1, y });
    }
  }
  return out;
}

/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): every part, all on the ground */
export const groundOutlines = () => BUENDNERHOF.parts.map((p) => p.ring);

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
