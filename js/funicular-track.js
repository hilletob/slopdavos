// js/funicular-track.js — the funiculars' track (Parsennbahn, Schatzalpbahn): plan and profile, three.js-free.
// js/bergbahnen-data.js samples the OSM ways every 2 m with the ground's heights; laid as they come, the rails would
// follow every bump of the survey and every corner of the mapped polyline. Here the track is laid like a real one:
//  - the plan: the polyline eased over ~±10 m (the stations' ends stay where they are);
//  - the profile: a smooth grade line (a penalised least-squares fit of the heights, Whittaker), never under the ground
//    out in the open (the bumps become low embankments), free over the bridges (OSM bridge=yes: the gullies are
//    spanned) and diving under the slope in the tunnels (OSM tunnel=yes), down to TUNNEL_DEPTH; the stations at the
//    path's ends stay at their heights.
// Both cars' paths take their heights from path 0's line (by the nearest point), so the tracks agree where they coincide.
// Used by js/bergbahnen.js (the rails, the cars), js/terrain.js (the funicular tunnels' cuts) and
// js/missions-data-parsenn.js (the machinist's line).
import { BERGBAHNEN } from './bergbahnen-data.js';
import { DAVOS_DATA } from './davos-geodata.js';

const TUNNEL_DEPTH = 9; // m under the surface, at most
const DIVE = 0.3; // m of depth gained per m into a tunnel (the targets; the fitted line eases it)
const STIFF = 5e4; // the fit's stiffness on the 2 m grid: vertical curves of some 100 m and more
const STATION_COVER = 40; // m: a tunnel this short at a path's end is the station's (no dive, no portal)
const PLAN_SIGMA = 3;
const APPROACH = 12; // samples (~24 m) of open track kept with a tunnel's stretch, for the cut before its portal // samples (~6 m): the plan's easing

const WAYS = (DAVOS_DATA.railways || []).filter((r) => r.kind === 'funicular');
const TUNNEL_WAYS = WAYS.filter((r) => r.tunnel).map((r) => r.pts);
const BRIDGE_WAYS = WAYS.filter((r) => r.bridge && !r.tunnel).map((r) => r.pts);
function near(list, x, z, tol = 3) {
  for (const pts of list) for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], dx = pts[i] - ax, dz = pts[i + 1] - az, L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    if (Math.hypot(ax + dx * t - x, az + dz * t - z) < tol) return true;
  }
  return false;
}
/** Whether (x, z) lies on a funicular way mapped as a tunnel (OSM tunnel=yes) */
export const inFunicularTunnel = (x, z) => near(TUNNEL_WAYS, x, z);

/** (W + lam·D'D) y = W·t with D the second differences: a pentadiagonal SPD system, banded LDL' */
export function whittaker(t, w, lam) {
  const n = t.length, d0 = new Float64Array(n), d1 = new Float64Array(n), d2 = new Float64Array(n);
  for (let i = 0; i < n; i++) d0[i] = w[i];
  const c = [1, -2, 1];
  for (let i = 0; i + 2 < n; i++) for (let a = 0; a < 3; a++) for (let b = a; b < 3; b++) {
    const v = lam * c[a] * c[b];
    if (b === a) d0[i + a] += v; else if (b - a === 1) d1[i + a] += v; else d2[i + a] += v;
  }
  const L1 = new Float64Array(n), L2 = new Float64Array(n), D = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const l2 = i >= 2 ? d2[i - 2] / D[i - 2] : 0;
    const l1 = i >= 1 ? (d1[i - 1] - (i >= 2 ? L1[i - 1] * l2 * D[i - 2] : 0)) / D[i - 1] : 0;
    L2[i] = l2; L1[i] = l1;
    D[i] = d0[i] - l1 * l1 * (i >= 1 ? D[i - 1] : 0) - l2 * l2 * (i >= 2 ? D[i - 2] : 0);
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = w[i] * t[i] - (i >= 1 ? L1[i] * y[i - 1] : 0) - (i >= 2 ? L2[i] * y[i - 2] : 0);
  for (let i = 0; i < n; i++) y[i] /= D[i];
  for (let i = n - 1; i >= 0; i--) y[i] -= (i + 1 < n ? L1[i + 1] * y[i + 1] : 0) + (i + 2 < n ? L2[i + 2] * y[i + 2] : 0);
  return y;
}

// The plan eased: a Gaussian over the samples, its window shrinking towards the ends (which stay put)
function easePlan(raw) {
  const n = raw.length, R = Math.ceil(PLAN_SIGMA * 3), out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.min(R, i, n - 1 - i);
    let x = 0, z = 0, W = 0;
    for (let k = -r; k <= r; k++) { const w = Math.exp(-(k * k) / (2 * PLAN_SIGMA * PLAN_SIGMA)); x += raw[i + k].x * w; z += raw[i + k].z * w; W += w; }
    out.push({ x: x / W, z: z / W, g: raw[i].y, tunnel: raw[i].tunnel, bridge: raw[i].bridge });
  }
  return out;
}
const horizontal = (pts) => { const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); return s; };

// The grade line along path 0: heights on a uniform ~2 m grid of the horizontal distance
function gradeLine(pts) {
  const s = horizontal(pts), n = pts.length, L = s[n - 1], m = Math.max(2, Math.round(L / 2)), ds = L / m;
  const G = [], TU = [], BR = [];
  for (let k = 0, i = 0; k <= m; k++) {
    const u = k * ds;
    while (i < n - 2 && s[i + 1] < u) i++;
    const a = Math.max(0, Math.min(1, (u - s[i]) / (s[i + 1] - s[i] || 1)));
    G.push(pts[i].g + (pts[i + 1].g - pts[i].g) * a);
    const q = a < 0.5 ? pts[i] : pts[i + 1];
    TU.push(q.tunnel); BR.push(q.bridge);
  }
  // the dive: depth under the surface by the distance to the nearest point in the open
  const open = []; for (let k = 0; k <= m; k++) if (!TU[k]) open.push(k * ds);
  const depth = (k) => {
    if (!TU[k]) return 0;
    let d = Infinity;
    for (const u of open) d = Math.min(d, Math.abs(u - k * ds));
    if (d === Infinity) d = Math.min(k * ds, L - k * ds);
    return Math.min(TUNNEL_DEPTH, d * DIVE);
  };
  const target = G.map((g, k) => g - depth(k) + (TU[k] ? 0 : 0.08)); // (in the open a hair over the survey: the bed shows)
  // weights: the ground in the open, the dive's targets loosely in the tunnels, nothing over the bridges; the stations
  // (an underground station at a path's end holds the dive's depth firmly over its last 60 m: the hall under the mountain)
  const station = (k) => TU[k] && (k * ds < 60 && TU[0] || L - k * ds < 60 && TU[m]);
  const w = G.map((_, k) => (BR[k] && !TU[k] ? 0 : station(k) ? 5 : TU[k] ? 0.3 : 1));
  w[0] = w[m] = 1e6;
  let y = whittaker(target, w, STIFF);
  // never under the ground in the open: where it dips below, held up harder and refitted
  for (let it = 0; it < 60; it++) {
    let changed = false;
    for (let k = 1; k < m; k++) if (!TU[k] && y[k] < G[k] - 0.03 && w[k] < 1e7) { w[k] = Math.max(w[k] * 4, 20); changed = true; }
    if (!changed) break;
    y = whittaker(target, w, STIFF);
  }
  return { ds, m, y, L };
}
const heightAt = (line, u) => {
  const k = Math.max(0, Math.min(line.m - 1, Math.floor(u / line.ds))), a = Math.max(0, Math.min(1, u / line.ds - k));
  return line.y[k] + (line.y[k + 1] - line.y[k]) * a;
};

const cache = new Map();
/**
 * A funicular's two paths (f: a line of BERGBAHNEN.funiculars), the track's centreline from the valley station to the
 * top: [[{ x, y, z, ground (the survey's height), tunnel, bridge }, ...], [...]] (before the passing loop's offset)
 */
export function funicularTrack(f) {
  if (cache.has(f.id)) return cache.get(f.id);
  const paths = f.paths.map((flat) => {
    const raw = [];
    for (let i = 0; i < flat.length; i += 3) {
      const x = flat[i], z = flat[i + 2];
      raw.push({ x, y: flat[i + 1], z, tunnel: near(TUNNEL_WAYS, x, z), bridge: near(BRIDGE_WAYS, x, z) });
    }
    // (a short tunnel at a path's end is the station's cover, under a building: the track runs in at the ground's level)
    for (const ends of [raw, [...raw].reverse()]) {
      let k = 0, L = 0;
      while (k + 1 < ends.length && ends[k].tunnel) { L += Math.hypot(ends[k + 1].x - ends[k].x, ends[k + 1].z - ends[k].z); k++; }
      if (k && L < STATION_COVER) for (let i = 0; i < k; i++) ends[i].tunnel = false;
    }
    return easePlan(raw);
  });
  const p0 = paths[0], line = gradeLine(p0), s0 = horizontal(p0);
  const out = paths.map((p, k) => {
    if (k === 0) return p.map((q, i) => ({ x: q.x, y: heightAt(line, s0[i]), z: q.z, ground: q.g, tunnel: q.tunnel, bridge: q.bridge }));
    // the other path: the height of path 0's nearest point (searched onward from the last one)
    let j = 0;
    return p.map((q, i) => {
      let best = Infinity, u = 0;
      for (let a = Math.max(1, j - 20); a < Math.min(p0.length, j + 60); a++) {
        const A = p0[a - 1], B = p0[a], dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz || 1e-9;
        const t = Math.max(0, Math.min(1, ((q.x - A.x) * dx + (q.z - A.z) * dz) / L2));
        const d = Math.hypot(A.x + dx * t - q.x, A.z + dz * t - q.z);
        if (d < best) { best = d; u = s0[a - 1] + (s0[a] - s0[a - 1]) * t; j = a; }
      }
      if (i === 0) u = 0; else if (i === p.length - 1) u = line.L;
      return { x: q.x, y: heightAt(line, u), z: q.z, ground: q.g, tunnel: q.tunnel, bridge: q.bridge };
    });
  });
  cache.set(f.id, out);
  return out;
}

/** The 3D length of a path of funicularTrack() */
export function trackLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
  return L;
}

export const FUNICULAR_TUNNEL_HALF = 2.6; // m: the bore's half width (the cars are 2.7 m wide at most)
let tunnels = null;
/**
 * The funiculars' tunnels as tunnel profiles (js/tunnel-profile.js's shape, for js/terrain.js and js/tunnels.js): each
 * stretch of path 0 in a tunnel, with the track's heights; `stationStart` / `stationEnd` where it runs into a station
 * at the path's end (underground: no mouth there)
 */
export function funicularTunnels() {
  if (tunnels) return tunnels;
  tunnels = [];
  for (const f of BERGBAHNEN.funiculars || []) {
    const p = funicularTrack(f)[0];
    for (let i = 0; i < p.length; i++) {
      if (!p[i].tunnel || (i > 0 && p[i - 1].tunnel)) continue;
      let e = i;
      while (e + 1 < p.length && p[e + 1].tunnel) e++;
      // (APPROACH samples beyond each end: the stretch reaches the portal and the cut before it)
      const a = Math.max(0, i - APPROACH), b = Math.min(p.length - 1, e + APPROACH);
      if (b - a < 2) continue;
      tunnels.push(tunnelOf(f, p.slice(a, b + 1), i === 0, e === p.length - 1));
    }
  }
  return tunnels;
}
function tunnelOf(f, pts, stationStart, stationEnd) {
  const flat = pts.flatMap((q) => [q.x, q.z]), cumulative = horizontal(pts), length = cumulative.at(-1);
  const seg = (s) => { let k = 0; while (k < cumulative.length - 2 && cumulative[k + 1] < s) k++; return k; };
  const at = (distance) => {
    const s = Math.max(0, Math.min(length, distance)), k = seg(s), A = pts[k], B = pts[k + 1];
    const run = cumulative[k + 1] - cumulative[k] || 1e-9, t = (s - cumulative[k]) / run;
    return { x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t, y: A.y + (B.y - A.y) * t, dx: (B.x - A.x) / run, dz: (B.z - A.z) / run, s };
  };
  const project = (x, z, margin = FUNICULAR_TUNNEL_HALF, strict = false) => {
    let best = null;
    const last = pts.length - 2;
    for (let k = 0; k <= last; k++) {
      const A = pts[k], B = pts[k + 1], dx = B.x - A.x, dz = B.z - A.z;
      const raw = ((x - A.x) * dx + (z - A.z) * dz) / (dx * dx + dz * dz || 1);
      if (strict && ((k === 0 && raw < 0) || (k === last && raw > 1))) continue;
      const t = Math.max(0, Math.min(1, raw));
      const d = Math.hypot(A.x + dx * t - x, A.z + dz * t - z);
      if (d > margin || (best && d >= best.distance)) continue;
      best = { x: A.x + dx * t, z: A.z + dz * t, y: A.y + (B.y - A.y) * t, distance: d, s: cumulative[k] + (cumulative[k + 1] - cumulative[k]) * t };
    }
    return best;
  };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const q of pts) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z); }
  return {
    id: `${f.id}@${Math.round(pts[0].x)},${Math.round(pts[0].z)}`, name: f.name, funicular: f.id, gauge: f.gauge, width: FUNICULAR_TUNNEL_HALF * 2,
    pts: flat, cumulative, length, at, project, minX, maxX, minZ, maxZ, stationStart, stationEnd
  };
}
