// The ways on foot and the farm and forest tracks as level benches in the slope.
//
// A path draped on the terrain takes the cross fall of the hillside it crosses: a metre of trodden ground leaning 35°
// (measured over the map: paths 35 % across on average, tracks 33 %, three quarters of their length over 15 %). A real
// path is a bench: level across, cut into the slope on the uphill side and filled on the downhill one. The 8 m terrain
// grid cannot carry a bench a metre wide, so the bench is drawn on top of it (js/city-grid.js: the surface and the fill
// slope down to the ground) and never cut: its height at a point of the way is the HIGHEST ground across its width, so
// the uphill edge lies on the slope and the downhill edge stands on its fill.
//
// Pure functions of the roads and the terrain grid (no three.js): shared by the renderer, by whatever stands or drives
// on a path (js/terrain.js surfaceHeight) and by the tests.
import { gridHeight } from './terrain-grid.js';

const BENCH_KINDS = new Set(['footway', 'path', 'track', 'cycleway', 'pedestrian', 'steps']);
/** Whether the way `r` (a record of DAVOS_DATA.roads) is laid as a bench: the ways off the carriageways, on the ground */
export const isBenched = (r) => BENCH_KINDS.has(r.kind) && !r.bridge && !r.tunnel && !r.sidewalkWay && !!r.pts && r.pts.length >= 4;
/** Half the width of the bench of way `r` (m) */
export const benchHalf = (r) => Math.max(0.3, (r.width || 2) / 2);

const CELL = 32;
const DENSE = 1; // m between the samples of the ground along a way
const TOLERANCE = 0.04; // m the drawn profile may lie under the sampled one (js/city-grid.js lifts the bench further)
const MAX_STEP = 8; // m between the kept samples at most
const JOIN = 6; // m over which a way's end takes the height of the bench it meets
const MITER_MAX = 1.8;
const REACH = 2; // m beyond a bench's edge that heightAt's `pad` may ask for
// On the steepest slopes the fill would stand as a wall (a metre-wide path across a 40° face: 0.85 m, a track 2 m and
// more): the bench's downhill edge stands no higher than this over its ground — [a base, per metre of width]: 0.65 m
// for a hiking path, 1.1 m for a track — and the slope takes the bench's uphill edge back instead (the way narrows)
const MAX_FILL = [0.3, 0.32];

/**
 * The benches of `roads` on `grid` (a parsed terrain). Profiles are made when first asked for.
 *  - profile(r): the bench of way `r`, or null: { n, x, z, h (the bench's height), nx, nz (the vector from the centre
 *    line to the left edge per metre of half width, mitered at the bends), s (metres along), seg (the index of the
 *    way's segment that the stretch from this sample to the next lies on), half }
 *  - heightAt(x, z, pad = 0): the height of the bench under (x, z), or within `pad` m (2 at most) of its edge: what is
 *    laid along a path wider than its bench (a groomed winter trail) lies level with it; NaN off the benches
 */
export function createBenches(roads, grid) {
  const index = new Map(); // cell -> [road, segment index, …]
  const benched = roads.filter(isBenched);
  for (const r of benched) {
    const pad = benchHalf(r) + REACH, p = r.pts;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const x0 = Math.floor((Math.min(p[i], p[i + 2]) - pad) / CELL), x1 = Math.floor((Math.max(p[i], p[i + 2]) + pad) / CELL);
      const z0 = Math.floor((Math.min(p[i + 1], p[i + 3]) - pad) / CELL), z1 = Math.floor((Math.max(p[i + 1], p[i + 3]) + pad) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const key = cx * 65536 + cz;
        let list = index.get(key);
        if (!list) index.set(key, (list = []));
        list.push(r, i >> 1);
      }
    }
  }

  // The highest ground across the way at each sample, every DENSE m along it and at its vertices
  const raws = new Map();
  const raw = (r) => {
    let out = raws.get(r);
    if (out) return out;
    const p = r.pts, half = benchHalf(r), X = [], Z = [], H = [], S = [], SEG = [], first = [];
    const maxFill = MAX_FILL[0] + MAX_FILL[1] * half * 2;
    const across = half > 1 ? [-1, -0.5, 0, 0.5, 1] : [-1, 0, 1];
    const top = (x, z, ux, uz) => {
      let h = -Infinity, low = Infinity;
      for (const o of across) { const g = gridHeight(grid, x - uz * o * half, z + ux * o * half); if (g > h) h = g; if (g < low) low = g; }
      return Math.min(h, low + maxFill);
    };
    let s = 0, lastU = null;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az);
      first.push(Math.max(0, X.length - 1));
      if (L < 1e-3) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, n = Math.max(1, Math.ceil(L / DENSE));
      // (the vertex shared with the segment before: the higher of the two cross sections)
      if (X.length) H[X.length - 1] = Math.max(H[X.length - 1], top(ax, az, ux, uz));
      else { X.push(ax); Z.push(az); H.push(top(ax, az, ux, uz)); S.push(0); SEG.push(i >> 1); }
      first[first.length - 1] = X.length - 1;
      SEG[X.length - 1] = i >> 1;
      for (let m = 1; m <= n; m++) {
        const x = ax + ((bx - ax) * m) / n, z = az + ((bz - az) * m) / n;
        X.push(x); Z.push(z); H.push(top(x, z, ux, uz)); S.push(s + (L * m) / n); SEG.push(i >> 1);
      }
      s += L; lastU = [ux, uz];
    }
    out = { X, Z, H, S, SEG, first, half, length: s, ok: !!lastU };
    raws.set(r, out);
    return out;
  };
  // The sampled height of way r's bench at the foot of (x, z) on its segment `seg`, or NaN beyond its width (+ pad)
  const rawAt = (r, seg, x, z, pad, heights) => {
    const p = r.pts, i = seg * 2, ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, L2 = dx * dx + dz * dz;
    if (L2 < 1e-6) return NaN;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(ax + t * dx - x, az + t * dz - z), R = raw(r);
    if (d > R.half + pad) return NaN;
    const H = heights || R.H;
    // (the samples of a segment are evenly spaced from its start)
    const k0 = R.first[seg], k1 = seg + 1 < R.first.length ? R.first[seg + 1] : R.X.length - 1;
    const f = t * (k1 - k0), m = Math.min(k1 - k0 - 1, Math.floor(f)), k = k0 + m;
    rawAt.d = d;
    return k1 > k0 ? H[k] + (H[k + 1] - H[k]) * (f - m) : H[k0];
  };
  const near = (x, z, visit) => {
    const list = index.get(Math.floor(x / CELL) * 65536 + Math.floor(z / CELL));
    if (list) for (let k = 0; k < list.length; k += 2) visit(list[k], list[k + 1]);
  };

  // The sampled profile with the way's ends raised to the benches they meet (never lowered: the bench stays on the
  // highest ground across it), eased back over JOIN m
  const laids = new Map();
  const laid = (r) => {
    let H = laids.get(r);
    if (H) return H;
    const R = raw(r);
    H = Float64Array.from(R.H);
    if (R.ok && R.X.length > 1) {
      for (const end of [0, R.X.length - 1]) {
        let meet = H[end];
        near(R.X[end], R.Z[end], (o, seg) => {
          if (o === r) return;
          const h = rawAt(o, seg, R.X[end], R.Z[end], R.half);
          if (h > meet) meet = h;
        });
        const rise = meet - R.H[end];
        if (!(rise > 0.005)) continue;
        for (let k = 0; k < R.X.length; k++) {
          const d = Math.abs(R.S[k] - R.S[end]);
          if (d < JOIN) H[k] = Math.max(H[k], R.H[k] + rise * (1 - d / JOIN));
        }
      }
    }
    laids.set(r, H);
    return H;
  };

  const profiles = new Map();
  const profile = (r) => {
    if (!isBenched(r)) return null;
    let P = profiles.get(r);
    if (P !== undefined) return P;
    const R = raw(r), H = laid(r), N = R.X.length;
    if (!R.ok || N < 2) { profiles.set(r, null); return null; }
    // Kept: the way's vertices, and between them whatever the straight line between kept samples would miss by more
    // than TOLERANCE (the terrain's 8 m facets make a few metres of even grade at a time), no more than MAX_STEP m apart
    const keep = new Uint8Array(N);
    const refine = (a, b) => {
      if (b - a < 2) return;
      let worst = 0, at = -1;
      for (let k = a + 1; k < b; k++) {
        const e = Math.abs(H[k] - (H[a] + ((H[b] - H[a]) * (R.S[k] - R.S[a])) / (R.S[b] - R.S[a])));
        if (e > worst) { worst = e; at = k; }
      }
      if (worst <= TOLERANCE) {
        if (R.S[b] - R.S[a] <= MAX_STEP) return;
        at = (a + b) >> 1;
      }
      keep[at] = 1; refine(a, at); refine(at, b);
    };
    const corners = [...new Set(R.first)].filter((k) => k < N - 1);
    corners.push(N - 1);
    for (let c = 0; c < corners.length; c++) { keep[corners[c]] = 1; if (c) refine(corners[c - 1], corners[c]); }
    const idx = [];
    for (let k = 0; k < N; k++) if (keep[k]) idx.push(k);
    const n = idx.length;
    P = { n, half: R.half, x: new Float32Array(n), z: new Float32Array(n), h: new Float32Array(n), nx: new Float32Array(n), nz: new Float32Array(n), s: new Float32Array(n), seg: new Uint16Array(n) };
    for (let m = 0; m < n; m++) {
      const k = idx[m];
      P.x[m] = R.X[k]; P.z[m] = R.Z[k]; P.h[m] = H[k]; P.s[m] = R.S[k]; P.seg[m] = R.SEG[k];
    }
    // The edges: square to the way, mitered where it bends
    const dir = (a, b) => { const dx = P.x[b] - P.x[a], dz = P.z[b] - P.z[a], L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L]; };
    for (let m = 0; m < n; m++) {
      const u = m > 0 ? dir(m - 1, m) : dir(0, 1), v = m < n - 1 ? dir(m, m + 1) : u;
      let mx = -u[1] - v[1], mz = u[0] + v[0];
      const ml = Math.hypot(mx, mz);
      if (ml < 0.3) { mx = -v[1]; mz = v[0]; } // (a hairpin folding back on itself: the edge of the leg leaving it)
      else { const k = Math.min(MITER_MAX, 1 / Math.max(1e-3, (mx / ml) * -u[1] + (mz / ml) * u[0])); mx = (mx / ml) * k; mz = (mz / ml) * k; }
      P.nx[m] = mx; P.nz[m] = mz;
    }
    profiles.set(r, P);
    return P;
  };

  const heightAt = (x, z, pad = 0) => {
    const list = index.get(Math.floor(x / CELL) * 65536 + Math.floor(z / CELL));
    if (!list) return NaN;
    let best = Infinity, h = NaN;
    for (let k = 0; k < list.length; k += 2) {
      const r = list[k], v = rawAt(r, list[k + 1], x, z, pad, laid(r));
      if (v === v && rawAt.d < best) { best = rawAt.d; h = v; }
    }
    return h;
  };

  return { profile, heightAt, count: benched.length };
}
