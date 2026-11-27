// The Villa Vecchia, the "Gemeinde Haus" of Davos Dorf (js/villa-vecchia.js): its three volumes under their saddle
// roofs, the floors' grid, the window columns of every wall, the porch on the north-east corner, the loggia, the
// dormers and the painted front. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1751/1019, batches 14, 8 and 5): the walls' outlines at the ground, the eaves and
// the ridges below are theirs; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js). The main house's
// ridge runs east–west at 22.2 (eaves 17.4 at the roof's edges), a cross gable over the shallow bay on its north side
// (ridge 19.6), a lower wing on the west (ridge 19.9). The ground falls from y 5–5.8 on the west to 2.8–3.3 along the
// east front. OpenStreetMap's footprint is w118240327 (up to 1.1 m off the surveyed walls); its low neighbour on the
// west, w1527728684 (the glazed annex with the terrace on its roof), stays streamed. The look after Mapillary's
// street views (CC BY-SA, 2013–2014, all in winter):
// - from the east (x 536–539, z −1114 to −1105, looking west at the east front): white plaster over a grey stone
//   plinth, three window columns, a raised ground floor with wrought-iron grilles and their crests, three floors over
//   it with windows in dark red-brown frames between shutters striped diagonally red and black; "GEMEINDE HAUS" at the
//   south end, the three arms between the ground floor's windows with their captions (the Zehngerichtenbund 1436, the
//   Stand Graubünden 1471, the Eidgenossenschaft 1803), small arched vents in the plinth, the porch with its arch and
//   steps at the north end, the door inside it;
// - from the south-west (x 485–489, z −1081 to −1076): the west gable with the lower wing's gable before it, the
//   wing's dark loggia on its south side, the south front with its three columns, an arched door in the middle one,
//   two dormers on the south roof, a chimney by the ridge;
// - from the north-west (x 450–480, z −1140 to −1132, the street running south-east): the west gable over the low
//   neighbour, four windows a row, the north side seen edge-on.
// Guessed: the north side (seen only edge-on: the bay's two columns, one column each side of it), the east gable's
// attic window, the inside of the porch.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const VILLA_VECCHIA = {
  osm: 'w118240327',
  // swissBUILDINGS3D's batches (their centres): left out of the streamed tiles
  exclude: [{ x: 516.9, z: -1104.9, r: 3 }, { x: 516.8, z: -1112.1, r: 3 }, { x: 508.5, z: -1100.0, r: 3 }],
  base: 1.5, // how far down the walls reach (the lowest ground, on the east: 2.8)
  plinth: 4.2, // the stone plinth's top (the east front's ground: 2.8 at its middle, 4.0 at its south end)
  // The floors: the raised ground floor and three over it (the attic in the gables)
  ground: 4.8, storey: 3.3, floors: 4,
  // A window in its storey (m up from the floor), its half width, a shutter's width
  win: { lo: 0.9, hi: 2.45, half: 0.55, shutter: 0.6 },
  column: 1.15, // half a window column's stretch of wall (the window and its shutters)
  thick: 0.22, // the roofs' thickness
  // The volumes: the walls' outline at the ground and the saddle roof over it: its ridge along x or z at `at` (z or x),
  // its height `top`, the fall per metre each side of it (`slope`: the smaller coordinate's side first) and the roof's
  // edges (x0–x1, z0–z1, the eaves and verges out of the walls). `into`: the roof runs on into that part's roof
  parts: [
    { id: 'main', ring: [[509.6, -1112.2], [524.1, -1112.2], [524.1, -1097.4], [509.6, -1097.4]],
      roof: { ridge: 'x', at: -1105.0, top: 22.2, slope: [4.8 / 7.7, 4.8 / 8.1], x0: 509.1, x1: 524.6, z0: -1112.7, z1: -1096.9 } },
    // the bay on the north side under its cross gable
    { id: 'bay', ring: [[514.0, -1114.1], [519.5, -1114.1], [519.5, -1112.2], [514.0, -1112.2]],
      roof: { ridge: 'z', at: 516.75, top: 19.6, slope: [1.9 / 3.05, 1.9 / 3.05], x0: 513.7, x1: 519.8, z0: -1114.3, into: 'main' } },
    // the lower wing on the west
    { id: 'wing', ring: [[505.9, -1102.2], [509.6, -1102.2], [509.6, -1097.7], [505.9, -1097.7]],
      roof: { ridge: 'x', at: -1100.0, top: 19.9, slope: [2.0 / 2.5, 2.0 / 2.6], x0: 505.6, x1: 509.6, z0: -1102.5, z1: -1097.4 } }
  ],
  // The window columns of each wall ('part:side'), by their middle's world coordinate along the wall (x on a north or
  // south wall, z on an east or west one). `from`: the first floor with a window (0 the ground floor; else from the
  // ground along it), `door`: a door in place of the ground floor's window
  columns: {
    'main:east': [{ at: -1100.2 }, { at: -1104.3 }, { at: -1108.4 }],
    'main:south': [{ at: 512.6 }, { at: 516.85, door: true }, { at: 521.1 }],
    'main:west': [{ at: -1110.8 }, { at: -1108.4 }, { at: -1105.9 }, { at: -1103.5 }],
    'main:north': [{ at: 511.8 }, { at: 521.8, from: 1 }], // (over the porch from the first floor)
    'bay:north': [{ at: 515.55 }, { at: 517.95 }],
    'wing:west': [{ at: -1099.95 }]
  },
  // The porch on the north-east corner, against the bay's east wall: its arch facing east (`arch`: its half width, the
  // spring and the floor), the lean-to roof from `high` at the house to `low` at its north wall
  porch: { ring: [[519.5, -1114.4], [524.1, -1114.4], [524.1, -1112.2], [519.5, -1112.2]], floor: 3.9, high: 8.5, low: 7.5, over: 0.3,
    arch: { half: 0.7, spring: 5.7 }, steps: 4 },
  // The wing's loggia on its south side: from `from` to `to` m along the wall, glazed from the first floor up
  loggia: { wall: 'wing:south', from: 0.4, to: 3.3, y0: 8.1, y1: 17.5 },
  // The dormers on the main roof's south side: their middles (x), front (z), half width, eaves and ridge
  dormers: { xs: [512.6, 516.85], z: -1099.2, half: 0.85, eave: 19.8, ridge: 20.5 },
  chimney: { x: 511.0, z: -1103.6, w: 0.7, top: 23.0 },
  // The painted and fixed things on the walls, from the atlas (js/villa-vecchia.js ATLAS): on a wall ('part:side'),
  // their middle's world coordinate along it, `w` wide, from y0 to y1
  decals: [
    // the east front's ground floor: the name at its south end, the three arms between the windows
    { key: 'name', wall: 'main:east', at: -1098.45, w: 1.8, y0: 6.2, y1: 7.1 },
    { key: 'zehn', wall: 'main:east', at: -1102.25, w: 2.3, y0: 6.1, y1: 7.4 },
    { key: 'stand', wall: 'main:east', at: -1106.35, w: 2.3, y0: 6.1, y1: 7.4 },
    { key: 'eidg', wall: 'main:east', at: -1110.45, w: 2.3, y0: 6.1, y1: 7.4 },
    // the grilles' crests over the ground floor's windows
    { key: 'crest', wall: 'main:east', at: -1100.2, w: 1.3, y0: 7.27, y1: 7.82 },
    { key: 'crest', wall: 'main:east', at: -1104.3, w: 1.3, y0: 7.27, y1: 7.82 },
    { key: 'crest', wall: 'main:east', at: -1108.4, w: 1.3, y0: 7.27, y1: 7.82 },
    // the doors: the south front's middle and the one in the porch
    { key: 'door', wall: 'main:south', at: 516.85, w: 1.15, y0: 4.85, y1: 7.05 },
    { key: 'door', wall: 'bay:east', at: -1113.15, w: 1.0, y0: 3.92, y1: 5.85 }
  ]
};

export const part = (id) => VILLA_VECCHIA.parts.find((p) => p.id === id);

/** The roof's top over (x, z) of a part's saddle roof (its plane on that side of the ridge) */
export function roofAt(p, x, z) {
  const R = p.roof, d = (R.ridge === 'x' ? z : x) - R.at;
  return R.top - (d < 0 ? R.slope[0] : R.slope[1]) * Math.abs(d);
}
/** A wall's top at (x, z): under the roof by its thickness */
export const wallTopAt = (p, x, z) => roofAt(p, x, z) - VILLA_VECCHIA.thick;

/** Where the roof `into` (ridge along x) climbs to `y` on its smaller z's side: the z of its valley with a cross gable */
export function meetZ(into, y) {
  const R = into.roof;
  return R.at - (R.top - y) / R.slope[0];
}

/** A wall's compass side from its frame (its outward normal) */
export function sideOf(F) {
  if (F.n[0] > 0.7) return 'east';
  if (F.n[0] < -0.7) return 'west';
  return F.n[1] > 0 ? 'south' : 'north';
}

/** The walls of a part ([{ a, b, F, side, key }]), its ring turned outward */
export function wallsOf(p) {
  const ring = outwardRing(p.ring);
  return ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length], F = wallFrame(a, b), side = sideOf(F);
    return { a, b, F, side, key: `${p.id}:${side}` };
  });
}
/** The wall named 'part:side' */
export function wallNamed(key) {
  const [id] = key.split(':');
  return wallsOf(part(id)).find((w) => w.key === key) ?? null;
}

/** Is the wall a → b of part p inside another part (the bay's against the main house, the wing's)? */
export function innerWall(p, a, b) {
  const F = wallFrame(a, b);
  return [0.1, 0.9].every((t) => {
    const [x, z] = onWall(F, F.len * t, 0.2);
    return VILLA_VECCHIA.parts.some((q) => q !== p && pointInRing(q.ring, x, z));
  });
}

/** Metres along a wall's frame of a world coordinate along it (x on a north or south wall, z on an east or west one) */
export function sAlong(F, at) {
  const ax = Math.abs(F.u[0]) > 0.7 ? 0 : 1;
  return (at - F.a[ax]) / F.u[ax];
}

/**
 * A wall's window columns: [{ s, from, to, door, id }] (s m along it; the windows run from the floor `from` (y) up to
 * `to`, the attic's floor or, where the gable is high enough over the column, its top). `ground(x, z)`: the terrain's
 * height (js/terrain.js groundHeight): a column's lowest window starts over the highest ground before it
 */
export function columnsOf(p, wall, ground) {
  const V = VILLA_VECCHIA, list = V.columns[wall.key] ?? [], F = wall.F;
  const attic = V.ground + V.floors * V.storey;
  return list.map((c) => {
    const s = sAlong(F, c.at);
    let k = c.from ?? (c.door ? 1 : 0);
    let hi = -Infinity;
    for (let u = -V.column; u <= V.column + 1e-6; u += V.column / 2) hi = Math.max(hi, ground(...onWall(F, s + u, 0.5)));
    while (V.ground + k * V.storey + V.win.lo < hi + 0.25) k++;
    // the attic's window where the gable clears it over the whole column
    const top = Math.min(...[-V.column, 0, V.column].map((u) => wallTopAt(p, ...onWall(F, s + u))));
    const to = top >= attic + V.win.hi + 0.25 ? attic + V.storey : attic;
    return { s, from: V.ground + k * V.storey, to, door: !!c.door, at: c.at };
  });
}

/**
 * The windows of a wall as rectangles on it: [{ s0, s1, y0, y1, ground }] (with their shutters above the ground floor,
 * with the grille on it), for the decals to keep clear of
 */
export function windowRects(p, wall, ground) {
  const V = VILLA_VECCHIA, W = V.win, out = [];
  for (const c of columnsOf(p, wall, ground)) {
    for (let y = c.from; y + W.hi <= c.to + 1e-6; y += V.storey) {
      const gf = y < V.ground + 0.5 * V.storey, half = gf ? W.half + 0.08 : W.half + W.shutter;
      out.push({ s0: c.s - half, s1: c.s + half, y0: y + W.lo - 0.1, y1: y + W.hi + 0.02, ground: gf });
    }
  }
  return out;
}

/** The outlines the player's walls stand on: the three volumes and the porch */
export const groundOutlines = () => [...VILLA_VECCHIA.parts.map((p) => p.ring), VILLA_VECCHIA.porch.ring];

/** The part (or 'porch') a point lies in, or null */
export function partAt(x, z) {
  for (const p of VILLA_VECCHIA.parts) if (pointInRing(p.ring, x, z)) return p;
  return pointInRing(VILLA_VECCHIA.porch.ring, x, z) ? 'porch' : null;
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
