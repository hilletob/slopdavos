// Rounded street corners. Where the edges of two carriageways meet at a junction, the curb does not turn on the spot:
// it follows an arc tangent to both edges, its radius by the kind of the two roads (3 m on residential streets and
// driveways, up to 6 m where main roads meet). Between the two edges and the arc the junction's asphalt reaches round
// the corner; the raised sidewalks (js/city-grid.js) end at the arc, and so do the sidewalks the pedestrians walk on
// (blockAt, sidewalkAt: js/city-config.js) and stand on (sidewalkRise: js/terrain.js, from the drawn pieces).
//
// A corner: C, the point where the two edges meet; T1 and T2, where the arc leaves them; O, the arc's centre; R, its
// radius. The kite C T1 O T2 holds the asphalt (outside the arc) and the curb and sidewalk (inside it). Pure geometry,
// no imports: js/city-config.js and js/city-grid.js both build on the same corners (streetCorners(roads), cached).

// The same kinds as js/city-grid.js: carriageways (with their junctions' asphalt) and curbed streets
const CARRIAGEWAY = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
  'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'service', 'living_street']);
const CURBED = new Set(['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'residential', 'unclassified']);
// Curb radius by kind (m); two roads meeting take the larger, at most 1.5 m over the smaller
const RADIUS = { motorway: 6, motorway_link: 6, trunk: 6, trunk_link: 5, primary: 6, primary_link: 5, secondary: 5,
  secondary_link: 4.5, tertiary: 4.5, tertiary_link: 4, residential: 3.5, unclassified: 3.5, service: 3, living_street: 3 };
export const CURB_GAP = 0.12; // the raised sidewalks start this far out from the carriageway's edge (js/city-grid.js)
const ARC_STEPS = 8;
const CELL = 32;

const isCarriageway = (road) => CARRIAGEWAY.has(road.kind) && !(road.kind === 'living_street' || (road.kind === 'service' && /platz/i.test(road.name || '')));

let cache = null;
let cacheRoads = null;

/**
 * The rounded corners of the carriageways of `roads` (BERLIN_DATA.roads: flat pts, width, kind, bridge, tunnel,
 * sidewalk), cached for the same array. Each: { C, T1, T2, O, R, a0, a1 (the arc's angles about O, from T1 to T2),
 * curbed, kite, sector (convex polygons: the kite, and the sidewalk inside the arc R - CURB_GAP), fillet (the asphalt:
 * C, T1, the arc, T2), minX, maxX, minZ, maxZ }.
 */
export function streetCorners(roads) {
  if (cache && cacheRoads === roads) return cache;
  cacheRoads = roads;
  const segs = [];
  for (const road of roads || []) {
    if (road.tunnel || road.bridge || !road.pts || !isCarriageway(road)) continue;
    let prev = null;
    for (let i = 2; i < road.pts.length; i += 2) {
      const a = { x: road.pts[i - 2], z: road.pts[i - 1] }, b = { x: road.pts[i], z: road.pts[i + 1] };
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.8) continue; // (as js/berlin-geometry.js berlinRoadSegments)
      const s = { a, b, len, road, h: (road.width || 6) / 2, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len, prev: null, next: null, id: segs.length };
      if (prev && Math.abs(prev.b.x - a.x) + Math.abs(prev.b.z - a.z) < 0.01) { prev.next = s; s.prev = prev; }
      segs.push(s);
      prev = s;
    }
  }
  const grid = new Map();
  const cellsOf = (minX, maxX, minZ, maxZ, fn) => {
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) fn(ix * 100000 + iz);
    }
  };
  for (const s of segs) {
    const pad = s.h + 0.5;
    cellsOf(Math.min(s.a.x, s.b.x) - pad, Math.max(s.a.x, s.b.x) + pad, Math.min(s.a.z, s.b.z) - pad, Math.max(s.a.z, s.b.z) + pad, (k) => {
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(s);
    });
  }
  const near = (x, z, r) => {
    const out = new Set();
    cellsOf(x - r, x + r, z - r, z + r, (k) => { for (const s of grid.get(k) || []) out.add(s); });
    return out;
  };
  const onRoad = (s, x, z) => {
    const dx = x - s.a.x, dz = z - s.a.z, t = dx * s.ux + dz * s.uz;
    return t > 0 && t < s.len && Math.abs(-dx * s.uz + dz * s.ux) < s.h;
  };
  // how far the edge of s's road runs on from along-position t in direction dir (±1), through its next segment
  const runOn = (s, t, dir) => (dir > 0 ? s.len - t + (s.next ? s.next.len : 0) : t + (s.prev ? s.prev.len : 0));

  const corners = [];
  const seen = [];
  for (const s1 of segs) {
    const cand = near((s1.a.x + s1.b.x) / 2, (s1.a.z + s1.b.z) / 2, s1.len / 2 + s1.h + 8);
    for (const s2 of cand) {
      if (s2.id <= s1.id || s2.road === s1.road) continue;
      const n1x = -s1.uz, n1z = s1.ux, n2x = -s2.uz, n2z = s2.ux;
      const cross = s1.ux * s2.uz - s1.uz * s2.ux;
      if (Math.abs(cross) < 0.26) continue; // (within 15° of each other: a road going on, not a corner)
      for (const sg1 of [-1, 1]) for (const sg2 of [-1, 1]) {
        // C: s1's edge on side sg1 meets s2's edge on side sg2, on both segments
        const px = s1.a.x + n1x * sg1 * s1.h, pz = s1.a.z + n1z * sg1 * s1.h;
        const rate = n2x * s1.ux + n2z * s1.uz;
        const t1 = (sg2 * s2.h - (n2x * (px - s2.a.x) + n2z * (pz - s2.a.z))) / rate;
        const C = { x: px + s1.ux * t1, z: pz + s1.uz * t1 };
        const t2 = (C.x - s2.a.x) * s2.ux + (C.z - s2.a.z) * s2.uz;
        if (t1 < -0.3 || t1 > s1.len + 0.3 || t2 < -0.3 || t2 > s2.len + 0.3) continue;
        // along each edge away from the other road
        const dir1 = Math.sign(sg2 * rate), dir2 = Math.sign(sg1 * (n1x * s2.ux + n1z * s2.uz));
        const d1 = { x: s1.ux * dir1, z: s1.uz * dir1 }, d2 = { x: s2.ux * dir2, z: s2.uz * dir2 };
        const phi = Math.acos(Math.max(-1, Math.min(1, d1.x * d2.x + d1.z * d2.z)));
        if (phi > 2.8) continue; // (a road barely bending: no corner to round)
        let bx = d1.x + d2.x, bz = d1.z + d2.z;
        const bl = Math.hypot(bx, bz);
        bx /= bl; bz /= bl;
        if (seen.some((q) => Math.abs(q.x - C.x) < 0.5 && Math.abs(q.z - C.z) < 0.5 && q.bx * bx + q.bz * bz > 0.9)) continue;
        seen.push({ x: C.x, z: C.z, bx, bz });
        // the corner lies between the roads: no other carriageway there
        const probe = { x: C.x + bx * 0.5, z: C.z + bz * 0.5 };
        const around = near(C.x, C.z, 10);
        if ([...around].some((s) => onRoad(s, probe.x, probe.z))) continue;
        const r1 = RADIUS[s1.road.kind] || 3, r2 = RADIUS[s2.road.kind] || 3;
        const tanHalf = Math.tan(phi / 2);
        let t = Math.min(Math.max(r1, r2), Math.min(r1, r2) + 1.5) / tanHalf;
        t = Math.min(t, runOn(s1, t1, dir1), runOn(s2, t2, dir2), 10);
        const R = t * tanHalf;
        if (R < 1.2) continue;
        const T1 = { x: C.x + d1.x * t, z: C.z + d1.z * t }, T2 = { x: C.x + d2.x * t, z: C.z + d2.z * t };
        const oc = R / Math.sin(phi / 2);
        const O = { x: C.x + bx * oc, z: C.z + bz * oc };
        // the arc's centre must lie off every carriageway (else the corner is no sidewalk corner: a road between)
        if ([...around].some((s) => onRoad(s, O.x, O.z) && s !== s1 && s !== s2)) continue;
        let a0 = Math.atan2(T1.z - O.z, T1.x - O.x);
        let a1 = Math.atan2(T2.z - O.z, T2.x - O.x);
        // the short way round (the arc faces C)
        let da = a1 - a0;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        a1 = a0 + da;
        const arc = (r) => {
          const pts = [];
          for (let k = 0; k <= ARC_STEPS; k++) {
            const a = a0 + (a1 - a0) * (k / ARC_STEPS);
            pts.push({ x: O.x + Math.cos(a) * r, z: O.z + Math.sin(a) * r });
          }
          return pts;
        };
        const kite = [C, T1, O, T2];
        const sector = [O, ...arc(R - CURB_GAP)];
        const fillet = [C, ...arc(R)];
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of kite) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
        const curbed = CURBED.has(s1.road.kind) || CURBED.has(s2.road.kind) || !!s1.road.sidewalk || !!s2.road.sidewalk;
        corners.push({ C, T1, T2, O, R, a0, a1, curbed, kite: convex(kite), sector: convex(sector), fillet, minX, maxX, minZ, maxZ, roads: [s1.road, s2.road] });
      }
    }
  }
  // Only the corners of curbed streets (or with a sidewalk) are rounded: the others keep to their plain asphalt
  cache = { list: corners.filter((c) => c.curbed), grid: new Map() };
  for (const c of cache.list) {
    cellsOf(c.minX, c.maxX, c.minZ, c.maxZ, (k) => {
      if (!cache.grid.has(k)) cache.grid.set(k, []);
      cache.grid.get(k).push(c);
    });
  }
  return cache;
}

// Counter-clockwise order (x right, z down the screen: either way, consistently) for the half-plane tests
function convex(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area < 0 ? poly.slice().reverse() : poly;
}

/** The half-planes [nx, nz, c] (inside: nx x + nz z >= c) of a convex polygon (as ordered by convex()) */
export function convexPlanes(poly) {
  const planes = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-6) continue;
    const nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
    planes.push([nx, nz, nx * a.x + nz * a.z]);
  }
  return planes;
}

const insideConvex = (poly, x, z) => {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x) < -1e-9) return false;
  }
  return true;
};

/** The corners whose kites reach into the box */
export function cornersIn(corners, minX, maxX, minZ, maxZ) {
  const out = new Set();
  for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
    for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
      for (const c of corners.grid.get(ix * 100000 + iz) || []) {
        if (c.maxX >= minX && c.minX <= maxX && c.maxZ >= minZ && c.minZ <= maxZ) out.add(c);
      }
    }
  }
  return [...out];
}

/**
 * Moves p ({ x, z }) off the asphalt of a rounded corner (inCornerCut): straight towards the arc's centre O, onto the
 * sidewalk `clear` metres inside the curb (a post mapped on the junction's corner stands behind the arc). Returns
 * whether it moved.
 */
export function outOfCornerCut(corners, p, clear = 0.45) {
  for (const c of corners.grid.get(Math.floor(p.x / CELL) * 100000 + Math.floor(p.z / CELL)) || []) {
    if (p.x < c.minX || p.x > c.maxX || p.z < c.minZ || p.z > c.maxZ) continue;
    if (!insideConvex(c.kite, p.x, p.z) || insideConvex(c.sector, p.x, p.z)) continue;
    const dx = p.x - c.O.x, dz = p.z - c.O.z, d = Math.hypot(dx, dz), r = Math.max(0.05, c.R - CURB_GAP - clear);
    if (d < 1e-6) continue;
    p.x = c.O.x + dx / d * r; p.z = c.O.z + dz / d * r;
    return true;
  }
  return false;
}

/** Is (x, z) off the sidewalk of a rounded corner: between the curb's arc and the corner of the two edges? */
export function inCornerCut(corners, x, z) {
  for (const c of corners.grid.get(Math.floor(x / CELL) * 100000 + Math.floor(z / CELL)) || []) {
    if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
    if (insideConvex(c.kite, x, z) && !insideConvex(c.sector, x, z)) return true;
  }
  return false;
}
