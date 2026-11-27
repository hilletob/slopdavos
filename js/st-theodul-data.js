// The Catholic church St. Theodul (Davos Dorf, beside the Hotel Seehof; js/st-theodul.js): its volumes in the church's
// own frame, the roofs' planes, the tower's stages and its onion dome, the windows and the painted openings. Pure data
// and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1753/1023, batch 19, the whole church as one building, 31.9 m at the dome's tip):
// the outlines at the ground, the eaves, the ridge and the apse's apex below are its; heights in the world frame (y =
// m a.s.l. − 1558, js/davos-frame.js). The church stands 3° off the frame's axes: in its own frame (s metres east along
// the nave from the west front, t metres across it, south positive) the survey's walls run straight. The ground climbs
// from y 0.9 at the south-west corner to 2.3 at the apse and 2.9 along the north side. OpenStreetMap's footprint is
// w111016808. The look after Mapillary's street views (CC BY-SA, 2013–2021):
// - from the south-west (2013, the street before the Seehof): the white west gable under the steep dark roof, a round
//   window high in it, a tall round-headed window over the porch of three arches, the red door in the middle arch; south
//   of it a low wing under a hipped roof, two small windows in its west wall;
// - from the north (2013) and the north-east (2019): the square white tower rising out of the lean-to roof on the
//   north side, a red-framed clock face on each side, the belfry's arched opening over it, a narrower stage with a small
//   opening, the red-brown onion dome, a slim spike with a ball and a cross; the porch's arch at the west end of the
//   north wall;
// - from the east (2021): the apse's three faces under a tall pointed roof, a tall window in them, the tower behind.
// The south side shows only trees in every photograph: its windows (the aisle's, the nave's east of it) are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

const TURN = -3 * Math.PI / 180; // the nave's axis: east, turned 3° to the north

export const ST_THEODUL = {
  // swissBUILDINGS3D's building (its centre): left out of the streamed tiles
  exclude: { x: 743.7, z: -1510.4, r: 3 },
  osm: 'w111016808',
  // The church's frame: the west front's foot under the ridge (world x, z) and the nave's axis (s), t across it to the
  // south (the frame turns as the world's does: t = the axis turned a quarter to the right)
  origin: [732.8, -1510.0],
  along: [Math.cos(TURN), Math.sin(TURN)],
  base: -0.6, // how far down the walls reach (the lowest ground under the church: 0.9)
  overhang: 0.35, // the eaves and verges out of the walls
  // The volumes in the church's frame ([s, t]), each under the lowest of its roof's planes; a plane through three points
  // [s, t, y]. `roof`: the outline the roof spans where it runs on into a higher roof
  parts: [
    // the nave and its apse: the saddle roof (ridge 19.2 over t 0, eaves 11.3 north and 12.6 south), the apse's three
    // faces under a pointed roof from the ridge's end (the survey's apex)
    { id: 'nave',
      ring: [[0.2, -3.9], [6.3, -3.9], [19.3, -3.9], [21.55, -1.2], [21.55, 1.2], [19.6, 3.6], [14.0, 3.6], [0.2, 3.6]],
      planes: [
        [[0, 0, 19.2], [10, 0, 19.2], [0, -3.9, 11.3]],
        [[0, 0, 19.2], [10, 0, 19.2], [0, 3.6, 12.6]],
        [[19.3, -3.9, 11.3], [21.55, -1.2, 11.3], [19.8, 0, 19.2]],
        [[21.55, -1.2, 11.3], [21.55, 1.2, 11.3], [19.8, 0, 19.2]],
        [[21.55, 1.2, 11.3], [19.6, 3.6, 12.6], [19.8, 0, 19.2]]
      ] },
    // the lean-to on the north side (the sacristy), the tower rising out of it: from the nave's eaves down to 7.5
    { id: 'north', ring: [[6.3, -8.0], [19.25, -8.0], [19.25, -3.9], [6.3, -3.9]],
      planes: [[[0, -3.9, 11.3], [10, -3.9, 11.3], [0, -8.0, 7.5]]] },
    // the aisle along the south side: a lean-to from under the nave's eaves down to 9.6
    { id: 'aisle', ring: [[3.9, 3.6], [14.0, 3.6], [14.0, 8.4], [3.9, 8.3]],
      planes: [[[0, 3.6, 12.4], [10, 3.6, 12.4], [0, 8.4, 9.6]]] },
    // the wing in the south-west corner: its ridge across the nave (13.5), hipped to the south, the corner cut off; its
    // roof runs north into the nave's
    { id: 'wing', ring: [[0.35, 3.6], [3.9, 3.6], [3.9, 8.25], [1.45, 8.25], [0.3, 7.4]],
      roof: [[0.35, 2.6], [3.9, 2.6], [3.9, 8.25], [1.45, 8.25], [0.3, 7.4]],
      planes: [
        [[0.35, 0, 10.3], [0.35, 5, 10.3], [2.125, 0, 13.5]],
        [[3.9, 0, 10.3], [3.9, 5, 10.3], [2.125, 0, 13.5]],
        [[0, 8.25, 10.3], [3, 8.25, 10.3], [2.125, 6.48, 13.5]],
        [[0.3, 7.4, 10.3], [1.45, 8.25, 10.3], [2.125, 6.48, 13.5]]
      ] }
  ],
  // The tower: a square shaft out of the lean-to (its middle [s, t], half its side), the band under the belfry, the
  // cornice over it; the narrower stage over that up to the dome; a dial on each side, the belfry's arched opening, a
  // small one in the stage, a slit in the shaft
  tower: {
    centre: [15.9, -4.67], half: 2.1, band: 21.6, cornice: 23.6, ledge: 23.95,
    stage: { half: 1.65, top: 25.2 },
    dial: { y: 20.0, half: 1.05 },
    louvre: { y0: 21.85, y1: 23.4, half: 0.5 },
    small: { y0: 24.1, y1: 25.0, half: 0.28 },
    slit: { y0: 15.6, y1: 16.6, half: 0.17 },
    // the onion dome: [radius, y] up its profile (16 sides), the lantern over it; the spike, its ball and the cross
    onion: [[1.4, 25.3], [1.62, 25.55], [1.78, 25.95], [1.8, 26.4], [1.66, 26.9], [1.36, 27.35], [0.98, 27.75], [0.6, 28.1], [0.32, 28.45], [0.2, 28.75],
      [0.2, 29.0], [0.38, 29.0], [0.38, 29.7], [0.5, 29.75], [0.06, 30.45]],
    spike: { y0: 30.3, y1: 31.9, ball: 31.05, r: 0.14 },
    cross: { y0: 31.9, y1: 33.0, arm: 32.6, half: 0.32 }
  },
  // The west front's ridge cross (over the gable's top)
  gableCross: { at: [0.1, 0], y0: 19.2, y1: 20.5, arm: 20.05, half: 0.3 },
  // The windows: the middle of the wall's stretch [s, t] (on a part's wall), the sill, the height to the arch's top, half
  // the width (a round head of that radius)
  windows: [
    // the west front over the porch, its round head under the round window
    { at: [0.2, 0], sill: 5.7, h: 4.2, half: 0.75 },
    // the wing's west wall and its south wall
    { at: [0.35, 4.6], sill: 5.4, h: 2.2, half: 0.38 },
    { at: [0.35, 6.5], sill: 5.4, h: 2.2, half: 0.38 },
    { at: [2.7, 8.25], sill: 4.6, h: 2.8, half: 0.4 },
    // the aisle's south wall and its east end
    { at: [6.3, 8.33], sill: 3.6, h: 3.6, half: 0.5 },
    { at: [9.0, 8.35], sill: 3.6, h: 3.6, half: 0.5 },
    { at: [11.7, 8.37], sill: 3.6, h: 3.6, half: 0.5 },
    { at: [14.0, 6.0], sill: 4.2, h: 3.0, half: 0.45 },
    // the nave's south wall east of the aisle
    { at: [15.4, 3.6], sill: 5.0, h: 5.2, half: 0.55 },
    { at: [18.0, 3.6], sill: 5.0, h: 5.2, half: 0.55 },
    // the apse's three faces
    { at: [20.575, 2.4], sill: 5.0, h: 4.6, half: 0.45 },
    { at: [21.55, 0], sill: 5.0, h: 4.6, half: 0.5 },
    { at: [20.425, -2.55], sill: 5.0, h: 4.6, half: 0.45 },
    // the nave's north wall west of the lean-to
    { at: [4.3, -3.9], sill: 5.4, h: 3.6, half: 0.5 },
    // the lean-to's north and east walls
    { at: [9.0, -8.0], sill: 4.2, h: 1.8, half: 0.4 },
    { at: [12.4, -8.0], sill: 4.2, h: 1.8, half: 0.4 },
    { at: [16.9, -8.0], sill: 4.2, h: 1.8, half: 0.4 },
    { at: [19.25, -5.2], sill: 4.2, h: 1.8, half: 0.4 }
  ],
  // The painted openings and doors (the atlas' cells, js/st-theodul.js): the middle of the stretch [s, t] on a wall, its
  // width, its foot (`ground`: over the highest ground under it) and its height
  openings: [
    // the porch: three arches across the west front, the red door in the middle one
    { key: 'arcade', at: [0.2, -0.15], w: 7.0, ground: 0.12, h: 3.55 },
    // the round window in the gable
    { key: 'oculus', at: [0.2, 0], w: 1.5, y: 12.45, h: 1.5 },
    // the porch's arch on the north side, the doors of the lean-to
    { key: 'opening', at: [1.8, -3.9], w: 1.6, ground: 0.12, h: 3.0 },
    { key: 'door', at: [19.25, -7.0], w: 1.1, ground: 0.12, h: 2.3 },
    { key: 'door', at: [6.3, -6.0], w: 1.1, ground: 0.12, h: 2.3 }
  ]
};

// --- The church's frame ------------------------------------------------------------------------------------------------
const [OX, OZ] = ST_THEODUL.origin, [UX, UZ] = ST_THEODUL.along;
/** [s, t] in the church's frame → world [x, z] */
export const toWorld = ([s, t]) => [OX + s * UX - t * UZ, OZ + s * UZ + t * UX];
/** world [x, z] → [s, t] */
export const toLocal = ([x, z]) => { const dx = x - OX, dz = z - OZ; return [dx * UX + dz * UZ, -dx * UZ + dz * UX]; };

export const part = (id) => ST_THEODUL.parts.find((p) => p.id === id);
/** A part's outline (its walls at the ground) in the church's frame, turned so that its walls face outwards */
export const localRing = (p) => outwardRing(p.ring);
/** A part's outline in the world, its walls facing outwards */
export const worldRing = (p) => localRing(p).map(toWorld);
/** The outlines the player's walls stand on (js/landmarks.js SURVEYED_FOOTPRINTS): the four volumes at the ground (the
 *  tower stands within them; the porch is painted on the west front, so the wall stays there) */
export const groundOutlines = () => ST_THEODUL.parts.map(worldRing);

/** The part a world point lies in, or null */
export function partAt(x, z) {
  const q = toLocal([x, z]);
  return ST_THEODUL.parts.find((p) => pointInRing(p.ring, q[0], q[1])) || null;
}

// --- The roofs -----------------------------------------------------------------------------------------------------------
/** A plane through three points [s, t, y]: y = c[0] + c[1] s + c[2] t */
export function planeOf([p, q, r]) {
  const a1 = q[0] - p[0], b1 = q[1] - p[1], y1 = q[2] - p[2], a2 = r[0] - p[0], b2 = r[1] - p[1], y2 = r[2] - p[2];
  const det = a1 * b2 - a2 * b1;
  const cs = (y1 * b2 - y2 * b1) / det, ct = (a1 * y2 - a2 * y1) / det;
  return [p[2] - cs * p[0] - ct * p[1], cs, ct];
}
const planeY = (c, s, t) => c[0] + c[1] * s + c[2] * t;
/** The roof's height over [s, t] of a part: the lowest of its planes */
export const roofAt = (p, s, t) => Math.min(...p.planes.map((q) => planeY(planeOf(q), s, t)));

/** Does a part's wall a → b (outward order, church frame) stand against another part (a step out of its middle lies in it)? */
export function innerWall(p, a, b) {
  const F = wallFrame(a, b), [s, t] = onWall(F, F.len / 2, 0.3);
  return ST_THEODUL.parts.some((o) => o !== p && pointInRing(o.ring, s, t));
}

/** A ring pushed out by d[i] along each of its edges i (ring[i] → ring[i + 1]; outward order) */
export function offsetRing(ring, d) {
  const n = ring.length;
  return ring.map((q, i) => {
    const j = (i + n - 1) % n;
    const A = wallFrame(ring[j], q), B = wallFrame(q, ring[(i + 1) % n]);
    const det = A.n[0] * B.n[1] - A.n[1] * B.n[0];
    if (Math.abs(det) < 1e-6) { const m = Math.max(d[j], d[i]); return [q[0] + B.n[0] * m, q[1] + B.n[1] * m]; }
    // (the point on both edges' lines moved out: n_A · x = n_A · q + d_A, n_B · x = n_B · q + d_B)
    const ra = A.n[0] * q[0] + A.n[1] * q[1] + d[j], rb = B.n[0] * q[0] + B.n[1] * q[1] + d[i];
    return [(ra * B.n[1] - rb * A.n[1]) / det, (A.n[0] * rb - B.n[0] * ra) / det];
  });
}

/** A polygon ([s, t]) cut to where f(s, t) <= 0 (f linear) */
function clip(poly, f) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q);
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const k = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
  }
  return out;
}

/**
 * A part's roof: one facet per plane, the outline (its eaves and verges `overhang` out, none where it meets another
 * part) cut to where that plane is the lowest. [{ plane: c, poly: [[s, t], …] }] in the church's frame
 */
export function roofFacets(p) {
  const ring = outwardRing(p.roof || p.ring);
  const d = ring.map((q, i) => (innerWall(p, q, ring[(i + 1) % ring.length]) ? 0 : ST_THEODUL.overhang));
  const eaves = offsetRing(ring, d), planes = p.planes.map(planeOf);
  const out = [];
  planes.forEach((c, i) => {
    let poly = eaves;
    planes.forEach((o, j) => { if (j !== i && poly.length) poly = clip(poly, ([s, t]) => planeY(c, s, t) - planeY(o, s, t) - 1e-9); });
    if (poly.length >= 3 && Math.abs(ringArea2(poly)) > 1e-4) out.push({ plane: c, poly });
  });
  return out;
}

/**
 * The tops of a part's wall a → b (church frame): [{ s, y }] from a to b, the roof's height at each end and wherever its
 * lowest plane changes (a gable's peak)
 */
export function wallTops(p, a, b) {
  const F = wallFrame(a, b), planes = p.planes.map(planeOf);
  const which = (s) => { const [x, z] = onWall(F, s); let k = 0; planes.forEach((c, i) => { if (planeY(c, x, z) < planeY(planes[k], x, z)) k = i; }); return k; };
  const at = (s) => { const [x, z] = onWall(F, s); return { s, y: roofAt(p, x, z) }; };
  const out = [at(0)], N = 48;
  for (let i = 1; i <= N; i++) {
    let lo = (F.len * (i - 1)) / N, hi = (F.len * i) / N;
    if (which(lo) !== which(hi)) {
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (which(m) === which(lo)) lo = m; else hi = m; }
      out.push(at((lo + hi) / 2));
    }
  }
  out.push(at(F.len));
  return out;
}

// --- The walls' things ---------------------------------------------------------------------------------------------------
/** The wall a point [s, t] lies on: { part, F (church frame), s (m along it), top (the lowest roof over the stretch) } */
export function wallAt([s, t]) {
  for (const p of ST_THEODUL.parts) {
    const ring = localRing(p);
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      const ds = (s - F.a[0]) * F.u[0] + (t - F.a[1]) * F.u[1], dn = (s - F.a[0]) * F.n[0] + (t - F.a[1]) * F.n[1];
      if (Math.abs(dn) < 0.1 && ds > 0.05 && ds < F.len - 0.05 && !innerWall(p, ring[i], ring[(i + 1) % ring.length])) return { part: p, F, s: ds };
    }
  }
  return null;
}

/** A frame of the church's frame in the world (for js/building-kit.js' Builder) */
export function worldFrame(F) {
  const a = toWorld(F.a), b = toWorld(onWall(F, F.len));
  return wallFrame(a, b);
}

/** The tower's four sides in the church's frame (half `h` of its side), each a wall frame facing out */
export function towerSides(h = ST_THEODUL.tower.half) {
  const [cs, ct] = ST_THEODUL.tower.centre;
  const c = outwardRing([[cs - h, ct - h], [cs + h, ct - h], [cs + h, ct + h], [cs - h, ct + h]]);
  return c.map((q, i) => wallFrame(q, c[(i + 1) % 4]));
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
