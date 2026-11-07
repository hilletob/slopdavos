// tools/markings-fit.mjs — the paint on a stretch of road as vectors, from its classified aerial crop
// (tools/ground-sports.py classify-roads: bits ROAD, WHITE, YELLOW at 0.1 m). Every blob of paint of one colour becomes
// - a bar: a straight stroke along its long axis, as wide as it is on average (dashes, stop bars, crossing bars,
//   parking and edge lines, the straight runs of centre lines), when it fills most of its rotated bounding box;
// - a line: a curved stroke through the middle of its slices along the axis, for a long thin blob that bends;
// - a fill: its traced outline (arrows, lettering, the shapes of a bus stop's markings) otherwise.
// What is too wide to be paint (a white car's roof, a bright pavement) or too small (glints) is dropped.
import { components, componentPolygon } from './sports-fit.mjs';

const ROAD = 1, WHITE = 16, YELLOW = 32;
const YELLOW_AT = +(process.env.YELLOW_AT || 45); // mean (min(r, g) − b) × 4 × 255 of a blob's pixels, from which it is yellow paint
const quantile = (a, q) => a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))];

/**
 * The straight runs of a blob of paint (RANSAC): the line through two of its pixels that most others lie within 0.15 m of,
 * cut into runs where its pixels leave gaps of 0.4 m, the runs of 1 m and more kept and their pixels taken out; again,
 * while a run is found. Null unless the runs hold most of the blob (an arrow or lettering stays a shape).
 */
function straightRuns(px, w, res, x0, z0, hold = 0.75) {
  const n = px.length, X = new Float64Array(n), Z = new Float64Array(n);
  for (let i = 0; i < n; i++) { X[i] = x0 + (px[i] % w + 0.5) * res; Z[i] = z0 + ((px[i] - (px[i] % w)) / w + 0.5) * res; }
  const left = new Uint8Array(n).fill(1);
  let remaining = n, seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const runs = [];
  for (let round = 0; round < 12 && remaining > 20; round++) {
    const alive = [];
    for (let i = 0; i < n; i++) if (left[i]) alive.push(i);
    let best = null;
    for (let it = 0; it < 150; it++) {
      const a = alive[Math.floor(rnd() * alive.length)], b = alive[Math.floor(rnd() * alive.length)];
      const dx = X[b] - X[a], dz = Z[b] - Z[a], L = Math.hypot(dx, dz);
      if (L < 0.8) continue;
      const ux = dx / L, uz = dz / L;
      let count = 0;
      for (const i of alive) if (Math.abs((X[i] - X[a]) * uz - (Z[i] - Z[a]) * ux) < 0.15) count++;
      if (!best || count > best.count) best = { count, ax: X[a], az: Z[a], ux, uz };
    }
    if (!best) break;
    // the inliers along the line, cut at gaps
    const on = alive.filter((i) => Math.abs((X[i] - best.ax) * best.uz - (Z[i] - best.az) * best.ux) < 0.15)
      .map((i) => ({ i, t: (X[i] - best.ax) * best.ux + (Z[i] - best.az) * best.uz, v: (X[i] - best.ax) * best.uz - (Z[i] - best.az) * best.ux }))
      .sort((p, q) => p.t - q.t);
    let found = false;
    for (let k = 0; k < on.length;) {
      let e = k;
      while (e + 1 < on.length && on[e + 1].t - on[e].t < 0.4) e++;
      const len = on[e].t - on[k].t + res;
      if (len >= 1.0) {
        const part = on.slice(k, e + 1), vm = part.reduce((a, p) => a + p.v, 0) / part.length;
        const width = (part.length * res * res) / len;
        const at = (t) => [best.ax + best.ux * t + best.uz * vm, best.az + best.uz * t - best.ux * vm];
        runs.push({ pts: [...at(on[k].t), ...at(on[e].t)], width, n: part.length, ux: best.ux, uz: best.uz });
        // (the whole blurred width of the line goes with it, or its fringe comes back as a second line beside it)
        const t0 = on[k].t, t1 = on[e].t;
        for (const i of alive) {
          if (!left[i]) continue;
          const t = (X[i] - best.ax) * best.ux + (Z[i] - best.az) * best.uz, d = Math.abs((X[i] - best.ax) * best.uz - (Z[i] - best.az) * best.ux);
          if (d < 0.3 && t >= t0 - 0.2 && t <= t1 + 0.2) { left[i] = 0; remaining--; }
        }
        found = true;
      }
      k = e + 1;
    }
    if (!found) break;
  }
  return remaining <= (1 - hold) * n ? runs : null;
}
/**
 * A zigzag over a band of paint (local u along it, v across, in pixels; u0, u1, span, vc in metres): the peaks at the
 * band's edges (less the line's half width), the period (2–3.6 m a zig and back) and its phase those that most pixels lie
 * on (within 0.15 m). Null when too few do (not a zigzag). [[u, v] …] in metres.
 */
function zigzag(us, vs, res, u0, u1, span, vc) {
  const amp = Math.max(0.2, span / 2 - 0.08), n = us.length;
  const line = (P, phase) => {
    const pts = [];
    for (let k = -1; ; k++) {
      const u = u0 + phase + (k * P) / 2;
      if (u > u1 + P / 2) break;
      pts.push([Math.min(u1, Math.max(u0, u)), vc + (k % 2 ? amp : -amp)]);
    }
    return pts;
  };
  const score = (pts) => {
    let hit = 0;
    for (let i = 0; i < n; i += 2) {
      const u = us[i] * res, v = vs[i] * res;
      for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
        if (u < Math.min(ax, bx) - 0.2 || u > Math.max(ax, bx) + 0.2) continue;
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / L2));
        if (Math.hypot(u - ax - dx * t, v - ay - dy * t) < 0.15) { hit++; break; }
      }
    }
    return hit / Math.ceil(n / 2);
  };
  let best = null;
  for (let P = 2.0; P <= 3.6; P += 0.1) for (let ph = 0; ph < P; ph += 0.1) {
    const pts = line(P, ph), sc = score(pts);
    if (!best || sc > best.sc) best = { pts, sc };
  }
  return best && best.sc >= 0.55 ? best.pts : null;
}

// (runs in more than one direction: a comb or a corner, not one bent line)
const turns = (runs) => runs.some((a) => runs.some((b) => Math.abs(a.ux * b.uz - a.uz * b.ux) > 0.5));

export function fitMarkings(img) {
  const { w, h, res, x0, z0, cls } = img;
  const strokes = [], fills = [], stats = { blobs: 0, bars: 0, lines: 0, fills: 0, dropped: 0 };
  // (one pass over all the paint: each blob's colour from how yellow its pixels are on average)
  for (const [bit] of [[WHITE | YELLOW]]) {
    const g = { w, h, a: new Uint8Array(w * h), cell: res, x0, z0 };
    for (let p = 0; p < w * h; p++) if (cls[p] & bit) g.a[p] = 1;
    const cc = components(g);
    // the pixels of each component, gathered in one pass
    const members = new Map();
    for (const comp of cc.comps) if (comp.n * res * res >= 0.06) members.set(comp.id, []);
    for (let p = 0; p < w * h; p++) { const m = members.get(cc.labels[p]); if (m) m.push(p); }
    for (const comp of cc.comps) {
      const px = members.get(comp.id);
      if (!px) continue;
      stats.blobs++;
      let ysum = 0;
      for (const p of px) ysum += img.yel[p];
      const yellowness = ysum / px.length, c = yellowness > YELLOW_AT ? 'y' : 'w';
      (stats.yellowness ??= []).push(Math.round(yellowness));
      // principal axes
      let mx = 0, mz = 0;
      for (const p of px) { mx += p % w; mz += (p - (p % w)) / w; }
      mx /= px.length; mz /= px.length;
      let sxx = 0, szz = 0, sxz = 0;
      for (const p of px) { const dx = p % w - mx, dz = (p - (p % w)) / w - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
      const a = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(a), uz = Math.sin(a);
      const us = new Float64Array(px.length), vs = new Float64Array(px.length);
      for (let i = 0; i < px.length; i++) { const dx = px[i] % w - mx, dz = (px[i] - (px[i] % w)) / w - mz; us[i] = dx * ux + dz * uz; vs[i] = -dx * uz + dz * ux; }
      const su = Float64Array.from(us).sort(), sv = Float64Array.from(vs).sort();
      const u0 = quantile(su, 0.01) * res, u1 = (quantile(su, 0.99) + 1) * res, v0 = quantile(sv, 0.01) * res, v1 = (quantile(sv, 0.99) + 1) * res;
      const area = px.length * res * res, L = u1 - u0, span = v1 - v0, W = area / Math.max(L, res);
      const fill = area / Math.max(L * span, 1e-6);
      // too wide for paint (a white roof; a crossing's yellow bars are 0.5 m), too short, or a speck
      if ((c === 'w' && W > 0.75) || W > 1.0 || L < 0.3 || (L < 0.8 && W < 0.1)) { stats.dropped++; continue; }
      // white and short: a car's glint, a kerb stone, a garden chair (white paint runs in dashes of 1.5 m and more; the
      // short bars of the crossings are yellow; arrows and lettering are larger)
      if (c === 'w' && L < 1.2 && area < 0.6) { stats.dropped++; continue; }
      let segs = null, zig = null;
      const world = (u, v) => [x0 + (mx + 0.5) * res + (u * ux - v * uz), z0 + (mz + 0.5) * res + (u * uz + v * ux)];
      if (fill >= 0.55 && span < Math.max(1.2, W * 1.6)) {
        const vc = (v0 + v1) / 2 - 0.5 * res;
        // (the photo's blur widens a line of 10–15 cm to some 0.3 m; a crossing's bars are a true 0.5 m)
        const width = W >= 0.42 ? Math.min(0.7, W) : Math.max(0.1, Math.min(0.18, W * 0.6));
        strokes.push({ c, w: width, pts: [...world(u0, vc), ...world(u1, vc)] });
        stats.bars++;
      } else if (c === 'y' && span >= 0.5 && span <= 1.5 && L >= 4 && fill < 0.6 && (zig = zigzag(us, vs, res, u0, u1, span, (v0 + v1) / 2))) {
        // the yellow zigzag of a bus stop (or of a no-stopping zone): the symbol laid over its band
        strokes.push({ c, w: 0.12, pts: zig.flatMap(([u, v]) => world(u, v)) });
        stats.zigzags = (stats.zigzags || 0) + 1;
      } else if (L >= 2 && (segs = straightRuns(px, w, res, x0, z0)) && segs.length >= 2 && turns(segs)) {
        // a comb of lines (a row of bays with its back line, an L at a corner): its straight runs, each a bar
        for (const sg of segs) strokes.push({ c, w: Math.max(0.1, Math.min(0.18, sg.width * 0.6)), pts: sg.pts });
        stats.bars += segs.length;
      } else if (L >= 2 && W <= 0.35) {
        // slices 0.5 m along the axis: the middle of each
        const n = Math.max(2, Math.round(L / 0.5)), sum = new Float64Array(n), cnt = new Float64Array(n);
        for (let i = 0; i < px.length; i++) {
          const k = Math.min(n - 1, Math.max(0, Math.floor(((us[i] * res - u0) / L) * n)));
          sum[k] += vs[i] * res; cnt[k]++;
        }
        const pts = [];
        for (let k = 0; k < n; k++) if (cnt[k]) pts.push(...world(u0 + ((k + 0.5) / n) * L, sum[k] / cnt[k]));
        // how far the pixels stray from the slices' middles: a line keeps to it, a zigzag swings round it
        let spread = 0;
        for (let i = 0; i < px.length; i++) {
          const k = Math.min(n - 1, Math.max(0, Math.floor(((us[i] * res - u0) / L) * n)));
          spread += Math.abs(vs[i] * res - sum[k] / Math.max(1, cnt[k]));
        }
        spread /= px.length;
        if (spread <= 0.12) {
          if (pts.length >= 4) { strokes.push({ c, w: Math.max(0.1, Math.min(0.18, W * 0.6)), pts }); stats.lines++; }
        } else if ((segs = straightRuns(px, w, res, x0, z0, 0.5))) {
          // (a zigzag: its zigs, each a bar)
          for (const sg of segs) strokes.push({ c, w: Math.max(0.1, Math.min(0.18, sg.width * 0.6)), pts: sg.pts });
          stats.bars += segs.length;
        } else {
          const poly = componentPolygon(cc, g, comp, 0.04, 0.05);
          if (poly.ring && poly.ring.length >= 6) { fills.push({ c, ring: poly.ring, holes: poly.holes.map((x) => x.ring) }); stats.fills++; }
        }
      } else if (c === 'w' && L > 1.8 && L < 6 && span > 1.1 && span < 2.4 && fill < 0.45) {
        stats.dropped++; // (the rim of a white car's roof: its middle too broad for paint, its edge left as a ring)
      } else {
        const poly = componentPolygon(cc, g, comp, 0.04, 0.05);
        // (smaller than a hand: a glint on a curb or a roof's edge)
        // (yellow shapes under a square metre: the dry edge of a lawn, a gravel border; yellow paint comes in bars and lines)
        if (poly.ring && poly.ring.length >= 6 && area >= (c === 'y' ? 1.0 : 0.25)) { fills.push({ c, ring: poly.ring, holes: poly.holes.map((x) => x.ring) }); stats.fills++; }
      }
    }
  }
  // A crossing's bars come in a set, 1 m apart side by side: a broad bar without such a neighbour is a line the blur
  // widened (a pale yellow bay line), drawn at a line's width
  const broad = strokes.filter((s) => s.w >= 0.42 && s.pts.length === 4);
  for (const a of broad) {
    const [ax, az, bx, bz] = a.pts, L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L, mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const paired = broad.some((b) => {
      if (b === a) return false;
      const [cx, cz, ex, ez] = b.pts, M = Math.hypot(ex - cx, ez - cz);
      if (Math.abs(dx * (ez - cz) / M - dz * (ex - cx) / M) > 0.15) return false;
      const rx = (cx + ex) / 2 - mx, rz = (cz + ez) / 2 - mz, across = Math.abs(rx * dz - rz * dx), along = Math.abs(rx * dx + rz * dz);
      return across > 0.7 && across < 1.5 && along < L / 2;
    });
    if (!paired) { a.w = 0.15; stats.relined = (stats.relined || 0) + 1; }
  }
  return { strokes, fills, stats };
}
