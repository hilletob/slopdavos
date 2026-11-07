// js/ground-geometry.js — the plain 2-D geometry of the vector ground (js/vector-ground.js): arcs sampled into polylines,
// polylines stroked into mitred strips with the road paint's attributes (js/parking.js bayLines: `paint` = metres along,
// period, duty; `side` = the vertex's offset from the line's centre, for the anti-aliased widening; `color`), and the share
// of a rectangle the surfaces cover (the orthophoto loader's coverage, js/swissimage.js). No three.js: shared by the
// browser, the data tool (tools/trace-ground.mjs) and the tests.
// World frame: x east, z south; angles a measured from +x towards +z (a point is cx + r·cos a, cz + r·sin a).

/** The arc [a0, a1] (radians, a0 < a1) as a flat [x, z, …] polyline whose chords stray at most `sagitta` metres */
export function sampleArc(cx, cz, r, a0, a1, sagitta = 0.015) {
  const step = r > sagitta ? 2 * Math.acos(1 - sagitta / r) : Math.PI / 4;
  const n = Math.max(2, Math.ceil((a1 - a0) / Math.min(step, Math.PI / 8)));
  const out = new Array((n + 1) * 2);
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out[2 * i] = cx + r * Math.cos(a);
    out[2 * i + 1] = cz + r * Math.sin(a);
  }
  if (a1 - a0 >= 2 * Math.PI - 1e-9) { out[2 * n] = out[0]; out[2 * n + 1] = out[1]; } // (a full circle closes exactly)
  return out;
}

/** The points of a line record ({ pts } or { arc: [cx, cz, r, a0, a1] }) */
export function linePoints(line, sagitta = 0.015) {
  return line.arc ? sampleArc(...line.arc, sagitta) : line.pts;
}

export function polylineLength(pts) {
  let L = 0;
  for (let i = 2; i < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return L;
}

const MITRE_LIMIT = 3;

/**
 * Strokes a polyline of `width` metres into a strip of quads (two triangles each, counter-clockwise seen from above),
 * mitred at the joints so that the corners neither gap nor double up (the mitre capped at MITRE_LIMIT half-widths).
 * A polyline whose last point is its first is closed. Appends to out = { positions, paint, side, color } (plain arrays).
 */
export function strokePolyline(pts, width, colour, out, maxPiece = Infinity) {
  // drop repeated points
  const p = [];
  for (let i = 0; i < pts.length; i += 2) {
    const n = p.length;
    if (n && Math.abs(p[n - 2] - pts[i]) < 1e-6 && Math.abs(p[n - 1] - pts[i + 1]) < 1e-6) continue;
    p.push(pts[i], pts[i + 1]);
  }
  let n = p.length / 2;
  const closed = n > 3 && Math.abs(p[0] - p[2 * n - 2]) < 1e-6 && Math.abs(p[1] - p[2 * n - 1]) < 1e-6;
  if (closed) { p.length -= 2; n--; }
  if (n < 2) return out;
  const hw = width / 2;
  const segs = closed ? n : n - 1;
  // unit normals (left of the direction of travel, (−dz, dx)) of each segment
  const nx = new Float64Array(segs), nz = new Float64Array(segs);
  for (let s = 0; s < segs; s++) {
    const a = s, b = (s + 1) % n;
    const dx = p[2 * b] - p[2 * a], dz = p[2 * b + 1] - p[2 * a + 1], L = Math.hypot(dx, dz) || 1;
    nx[s] = -dz / L; nz[s] = dx / L;
  }
  // the offset of each vertex (the mitre)
  const ox = new Float64Array(n), oz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const sIn = closed ? (i - 1 + segs) % segs : i - 1, sOut = closed ? i % segs : i;
    const hasIn = sIn >= 0 && (closed || i > 0), hasOut = sOut < segs && (closed || i < n - 1);
    let mx, mz, k = hw;
    if (hasIn && hasOut) {
      mx = nx[sIn] + nx[sOut]; mz = nz[sIn] + nz[sOut];
      const m = Math.hypot(mx, mz);
      if (m < 1e-6) { mx = nx[sOut]; mz = nz[sOut]; } else {
        mx /= m; mz /= m;
        const cos = mx * nx[sOut] + mz * nz[sOut];
        k = Math.min(hw / Math.max(cos, 1e-6), hw * MITRE_LIMIT);
      }
    } else if (hasOut) { mx = nx[sOut]; mz = nz[sOut]; } else { mx = nx[sIn]; mz = nz[sIn]; }
    ox[i] = mx * k; oz[i] = mz * k;
  }
  let along = 0;
  for (let s = 0; s < segs; s++) {
    const a = s, b = (s + 1) % n;
    const ax = p[2 * a], az = p[2 * a + 1], bx = p[2 * b], bz = p[2 * b + 1];
    const L = Math.hypot(bx - ax, bz - az);
    // (in pieces of `maxPiece` at most: a draped layer is split where its edges are long, and a corner put on a quad's
    // diagonal would carry the mean of its two sides' offsets, nothing, which the paint's shader reads as no width)
    const k = Math.max(1, Math.ceil(L / maxPiece));
    for (let q = 0; q < k; q++) {
      const f0 = q / k, f1 = (q + 1) / k, lerp = (p0, p1, f) => p0 + (p1 - p0) * f;
      const px0 = lerp(ax, bx, f0), pz0 = lerp(az, bz, f0), px1 = lerp(ax, bx, f1), pz1 = lerp(az, bz, f1);
      const sx0 = lerp(ox[a], ox[b], f0), sz0 = lerp(oz[a], oz[b], f0), sx1 = lerp(ox[a], ox[b], f1), sz1 = lerp(oz[a], oz[b], f1);
      const A = along + L * f0, B = along + L * f1;
      // (a − o, b + o, b − o), (a − o, a + o, b + o): the order of js/parking.js bayLines, facing up
      const corners = [
        [px0 - sx0, pz0 - sz0, A, -sx0, -sz0], [px1 + sx1, pz1 + sz1, B, sx1, sz1], [px1 - sx1, pz1 - sz1, B, -sx1, -sz1],
        [px0 - sx0, pz0 - sz0, A, -sx0, -sz0], [px0 + sx0, pz0 + sz0, A, sx0, sz0], [px1 + sx1, pz1 + sz1, B, sx1, sz1]
      ];
      for (const [x, z, t, sx, sz] of corners) {
        out.positions.push(x, 0, z);
        out.paint.push(t, 1, 1);
        out.side.push(sx, sz);
        out.color.push(colour[0], colour[1], colour[2]);
      }
    }
    along += L;
  }
  return out;
}

// --- Areas -------------------------------------------------------------------------------------------------------------
export const pointInRing = (ring, x, z) => {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
export const pointInSurface = (s, x, z) => pointInRing(s.ring, x, z) && !(s.holes || []).some((h) => pointInRing(h, x, z));

export function ringBounds(ring) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < ring.length; i += 2) {
    b[0] = Math.min(b[0], ring[i]); b[1] = Math.min(b[1], ring[i + 1]); b[2] = Math.max(b[2], ring[i]); b[3] = Math.max(b[3], ring[i + 1]);
  }
  return b;
}

/** Distance from (x, z) to the nearest edge of a ring */
export function ringDistance(ring, x, z) {
  let d = Infinity;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const ax = ring[j], az = ring[j + 1], dx = ring[i] - ax, dz = ring[i + 1] - az, L2 = dx * dx + dz * dz;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return d;
}

/** The share (0…1) of the rectangle [x0, z0, x1, z1] that the surfaces cover, sampled every `step` metres */
export function chunkCoverage(surfaces, [x0, z0, x1, z1], step = 2) {
  const near = surfaces.map((s) => ({ s, b: s.bounds || ringBounds(s.ring) })).filter(({ b }) => b[2] >= x0 && b[0] <= x1 && b[3] >= z0 && b[1] <= z1);
  if (!near.length) return 0;
  let hit = 0, total = 0;
  for (let z = z0 + step / 2; z < z1; z += step) for (let x = x0 + step / 2; x < x1; x += step) {
    total++;
    for (const { s, b } of near) if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && pointInSurface(s, x, z)) { hit++; break; }
  }
  return total ? hit / total : 0;
}
