// tools/sports-fit.mjs — the shapes of a sports ground fitted to its classified aerial photo (tools/ground-sports.py
// classify: one byte of class bits per 0.1 m pixel), for tools/trace-ground.mjs:
//  - surfaces: the tartan (red, blue) and turf areas as polygons: connected components of the class on a 0.2 m grid,
//    closed over the paint lines, their outlines traced (Moore neighbourhood) and simplified (Douglas–Peucker); a
//    component that fills its fitted rectangle becomes that rectangle;
//  - the track: the stadium of tools/sports-templates.mjs trackLines, its centre, heading, straight and kerb radius
//    snapped onto the painted lane lines (coordinate search on the share of the lines lying on white paint), the lanes
//    counted outwards while their lines are there;
//  - the football pitch: its rectangle snapped onto the painted touch and goal lines, the FIFA markings laid into it;
//  - courts (basketball, tennis, volleyball, handball): pairs of paint peaks in the surface's two directions at the
//    regulation distances, kept when the template's lines lie on paint.
import { fifaLines, trackLines, TEMPLATES, COURTS, LANE_W } from './sports-templates.mjs';
import { linePoints, pointInRing } from '../js/ground-geometry.js';

const RED = 1, BLUE = 2, GREEN = 4, REDDISH = 8, WHITE = 16, YELLOW = 32, BUILDING = 64, CLAY = 128;
const CELL = 0.2; // the surface grid

// --- Grids ------------------------------------------------------------------------------------------------------------
/** The class image down to the surface grid: a cell has the class when at least `need` of its k × k pixels have it */
function downsample(img, bit, exclude = 0) {
  const k = Math.round(CELL / img.res), w = Math.floor(img.w / k), h = Math.floor(img.h / k), out = new Uint8Array(w * h), need = Math.ceil((k * k) / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const c = img.cls[(y * k + j) * img.w + x * k + i];
      if (c & bit && !(c & exclude)) n++;
    }
    out[y * w + x] = n >= need ? 1 : 0;
  }
  return { w, h, a: out, cell: k * img.res, x0: img.x0, z0: img.z0 };
}

/** Binary dilation (op 'max') or erosion ('min') by a (2r+1)² box, separable */
function morph(g, r, op) {
  const { w, h } = g, tmp = new Uint8Array(w * h), out = new Uint8Array(w * h), want = op === 'max' ? 1 : 0;
  const pass = (src, dst, horizontal) => {
    const n = horizontal ? w : h, m = horizontal ? h : w;
    for (let line = 0; line < m; line++) {
      const at = (i) => (horizontal ? line * w + i : i * w + line);
      // running count of `want` in the window
      let count = 0;
      for (let i = -r; i <= r; i++) if (i >= 0 && i < n ? src[at(i)] === want : want === 0) count++;
      for (let i = 0; i < n; i++) {
        dst[at(i)] = count > 0 ? want : 1 - want;
        const out_ = i - r, in_ = i + r + 1;
        if (out_ >= 0 ? src[at(out_)] === want : want === 0) count--;
        if (in_ < n ? src[at(in_)] === want : want === 0) count++;
      }
    }
  };
  pass(g.a, tmp, true); pass(tmp, out, false);
  return { ...g, a: out };
}
const close = (g, r) => morph(morph(g, r, 'max'), r, 'min');
const open = (g, r) => morph(morph(g, r, 'min'), r, 'max');

/** Connected components (4-neighbourhood) of a binary grid: { labels (Int32Array, 0 = none), comps: [{ id, n, box }] } */
function components(g) {
  const { w, h, a } = g, labels = new Int32Array(w * h), comps = [], stack = new Int32Array(w * h);
  let id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!a[s] || labels[s]) continue;
    id++;
    let sp = 0, n = 0, bx0 = w, by0 = h, bx1 = 0, by1 = 0;
    stack[sp++] = s; labels[s] = id;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p - x) / w;
      n++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
      if (x > 0 && a[p - 1] && !labels[p - 1]) { labels[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && a[p + 1] && !labels[p + 1]) { labels[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && a[p - w] && !labels[p - w]) { labels[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && a[p + w] && !labels[p + w]) { labels[p + w] = id; stack[sp++] = p + w; }
    }
    comps.push({ id, n, box: [bx0, by0, bx1, by1] });
  }
  return { labels, comps };
}

// --- Outlines -----------------------------------------------------------------------------------------------------------
const DIRS = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]]; // clockwise from west (y down)

/** The outline of the pixels where inside(x, y), starting at the top-left one (Moore neighbourhood tracing) */
function traceOutline(inside, sx, sy, limit = 2e6) {
  const out = [[sx, sy]];
  let cx = sx, cy = sy, back = 0; // the backtrack: west of the start (outside, as the start is the top-left pixel)
  let second = null;
  for (let step = 0; step < limit; step++) {
    let found = -1;
    for (let i = 1; i <= 8; i++) {
      const d = (back + i) % 8;
      if (inside(cx + DIRS[d][0], cy + DIRS[d][1])) { found = d; break; }
    }
    if (found < 0) return out; // a single pixel
    const prev = (found + 7) % 8, bx = cx + DIRS[prev][0], by = cy + DIRS[prev][1];
    const nx = cx + DIRS[found][0], ny = cy + DIRS[found][1];
    if (nx === sx && ny === sy && second) break;
    if (cx === sx && cy === sy && second && nx === second[0] && ny === second[1]) break;
    cx = nx; cy = ny;
    if (!second) second = [cx, cy];
    back = DIRS.findIndex(([dx, dy]) => dx === bx - cx && dy === by - cy);
    out.push([cx, cy]);
  }
  return out;
}

/** Douglas–Peucker on an open polyline [[x, y], …] */
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = pts[i], [bx, by] = pts[j], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bi = -1;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((pts[k][0] - ax) * dy - (pts[k][1] - ay) * dx) / L;
      if (d > best) { best = d; bi = k; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([i, bi], [bi, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/** A closed outline (pixel corners) simplified, in world coordinates as a flat ring */
function outlineRing(px, g, eps) {
  if (px.length < 4) return null;
  // split at the point farthest from the first, simplify both halves
  let far = 0, fd = -1;
  for (let k = 0; k < px.length; k++) { const d = Math.hypot(px[k][0] - px[0][0], px[k][1] - px[0][1]); if (d > fd) { fd = d; far = k; } }
  const a = rdp(px.slice(0, far + 1), eps / g.cell), b = rdp([...px.slice(far), px[0]], eps / g.cell);
  const pts = [...a, ...b.slice(1, -1)];
  if (pts.length < 3) return null;
  const ring = [];
  for (const [x, y] of pts) ring.push(g.x0 + (x + 0.5) * g.cell, g.z0 + (y + 0.5) * g.cell);
  return ring;
}

/** The polygon (outer ring and holes ≥ minHole m²) of component `id` */
function componentPolygon(cc, g, comp, eps = 0.25, minHole = 4) {
  const { labels } = cc, { w, h } = g, id = comp.id;
  const [bx0, by0, bx1, by1] = comp.box;
  const isIn = (x, y) => x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === id;
  // the top-left pixel
  let sx = -1, sy = -1;
  for (let y = by0; y <= by1 && sx < 0; y++) for (let x = bx0; x <= bx1; x++) if (labels[y * w + x] === id) { sx = x; sy = y; break; }
  const ring = outlineRing(traceOutline(isIn, sx, sy), g, eps);
  // holes: the complement's components inside the box that don't reach its border
  const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
  const sub = { w: bw, h: bh, a: new Uint8Array(bw * bh), cell: g.cell, x0: g.x0 + bx0 * g.cell, z0: g.z0 + by0 * g.cell };
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) sub.a[y * bw + x] = labels[(y + by0) * w + x + bx0] === id ? 0 : 1;
  const hc = components(sub), holes = [];
  for (const c of hc.comps) {
    const [x0, y0, x1, y1] = c.box;
    if (x0 === 0 || y0 === 0 || x1 === bw - 1 || y1 === bh - 1 || c.n * g.cell * g.cell < minHole) continue;
    let hx = -1, hy = -1;
    for (let y = y0; y <= y1 && hx < 0; y++) for (let x = x0; x <= x1; x++) if (hc.labels[y * bw + x] === c.id) { hx = x; hy = y; break; }
    const inHole = (x, y) => x >= 0 && y >= 0 && x < bw && y < bh && hc.labels[y * bw + x] === c.id;
    const hr = outlineRing(traceOutline(inHole, hx, hy), sub, eps);
    if (hr) holes.push({ ring: hr, area: c.n * g.cell * g.cell });
  }
  return { ring, holes };
}

// --- Fits ------------------------------------------------------------------------------------------------------------
/** The pixels of a component as world points (every k-th) */
function componentPoints(cc, g, id, max = 12000) {
  const pts = [];
  const step = Math.max(1, Math.round(cc.comps.find((c) => c.id === id).n / max));
  let k = 0;
  for (let p = 0; p < cc.labels.length; p++) if (cc.labels[p] === id && k++ % step === 0) {
    const x = p % g.w, y = (p - x) / g.w;
    pts.push([g.x0 + (x + 0.5) * g.cell, g.z0 + (y + 0.5) * g.cell]);
  }
  return pts;
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

/** The robust rotated rectangle of a point set: { cx, cz, heading, l, w } (l ≥ w, heading of the long side) */
export function fitRectangle(pts, { around = null, span = Math.PI / 2, q = 0.005 } = {}) {
  const at = (a) => {
    const ux = Math.sin(a), uz = Math.cos(a);
    const us = new Float64Array(pts.length), vs = new Float64Array(pts.length);
    for (let i = 0; i < pts.length; i++) { us[i] = pts[i][0] * ux + pts[i][1] * uz; vs[i] = pts[i][0] * uz - pts[i][1] * ux; }
    us.sort(); vs.sort();
    const u0 = quantile(us, q), u1 = quantile(us, 1 - q), v0 = quantile(vs, q), v1 = quantile(vs, 1 - q);
    return { a, area: (u1 - u0) * (v1 - v0), u0, u1, v0, v1 };
  };
  let best = null;
  const centre = around ?? Math.PI / 4;
  for (let d = -span / 2; d <= span / 2; d += 0.5 * Math.PI / 180) { const r = at(centre + d); if (!best || r.area < best.area) best = r; }
  for (let d = -0.5; d <= 0.5; d += 0.05) { const r = at(best.a + d * Math.PI / 180); if (r.area < best.area) best = r; }
  const { a, u0, u1, v0, v1 } = best, uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  const ux = Math.sin(a), uz = Math.cos(a);
  let rect = { cx: uc * ux + vc * uz, cz: uc * uz - vc * ux, heading: a, l: u1 - u0, w: v1 - v0 };
  if (rect.w > rect.l) rect = { ...rect, heading: a + Math.PI / 2, l: rect.w, w: rect.l };
  rect.heading = ((rect.heading % Math.PI) + Math.PI) % Math.PI;
  return rect;
}

export function rectRing({ cx, cz, heading, l, w }) {
  const ux = Math.sin(heading), uz = Math.cos(heading), vx = Math.cos(heading), vz = -Math.sin(heading), out = [];
  for (const [u, v] of [[-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2]]) out.push(cx + u * ux + v * vx, cz + u * uz + v * vz);
  return out;
}

/** The paint scorer: the share of sample points (every 0.2 m) of the lines that lie on paint of `bits` (± one pixel) */
function paintScorer(img, bits) {
  const { w, h, res, x0, z0 } = img, on = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    if ((img.cls[p] | img.cls[p - 1] | img.cls[p + 1] | img.cls[p - w] | img.cls[p + w]) & bits) on[p] = 1;
  }
  const score = (lines, step = 0.2) => {
    let hit = 0, n = 0;
    for (const l of lines) {
      const p = linePoints(l, 0.03);
      for (let i = 2; i < p.length; i += 2) {
        const dx = p[i] - p[i - 2], dz = p[i + 1] - p[i - 1], L = Math.hypot(dx, dz), k = Math.max(1, Math.round(L / step));
        for (let s = 0; s < k; s++) {
          const x = Math.floor((p[i - 2] + (dx * s) / k - x0) / res), y = Math.floor((p[i - 1] + (dz * s) / k - z0) / res);
          n++;
          if (x >= 0 && y >= 0 && x < w && y < h && on[y * w + x]) hit++;
        }
      }
    }
    return n ? hit / n : 0;
  };
  return score;
}

/** Coordinate search: maximises f(params) over the given keys, steps halving down to `min` */
function climb(params, steps, f, min = 0.02) {
  let p = { ...params }, best = f(p);
  const st = { ...steps };
  for (let it = 0; it < 400; it++) {
    let moved = false;
    for (const k of Object.keys(st)) for (const s of [1, -1]) {
      const q = { ...p, [k]: p[k] + s * st[k] }, v = f(q);
      if (v > best + 1e-6) { p = q; best = v; moved = true; }
    }
    if (!moved) {
      let all = true;
      for (const k of Object.keys(st)) { st[k] /= 2; if (st[k] > steps[k] * min) all = false; }
      if (all) break;
    }
  }
  return { params: p, score: best };
}

// (u, v) offsets of a fit's centre in its own frame
const shift = (r, du, dv) => ({ ...r, cx: r.cx + du * Math.sin(r.heading) + dv * Math.cos(r.heading), cz: r.cz + du * Math.cos(r.heading) - dv * Math.sin(r.heading) });

/** The track: the stadium snapped onto the lane lines; lanes counted outwards from the kerb */
function fitTrack(rect, white) {
  // the outer stadium of the red: half-width V; with n lanes the kerb lies ~n·1.22 + 0.3 inside it
  let best = null;
  for (const lanes of [4, 6, 8]) {
    for (let inset = 0; inset <= 2.5; inset += 0.25) {
      const R = rect.w / 2 - lanes * LANE_W - inset, L = rect.l - rect.w;
      const t = { cx: rect.cx, cz: rect.cz, heading: rect.heading, L, R, lanes: 4 };
      const s = white(trackLines(t).slice(0, -1));
      if (!best || s > best.s) best = { t, s };
    }
  }
  const f = (t) => white(trackLines({ ...shift(t, t.du, t.dv), lanes: 4 }).slice(0, -1));
  const { params, score } = climb({ ...best.t, du: 0, dv: 0 }, { du: 1, dv: 0.5, heading: 0.01, L: 1, R: 0.3 }, f, 0.01);
  const t = { ...shift(params, params.du, params.dv) };
  delete t.du; delete t.dv;
  // count the lanes: the next line out still on paint
  const lineScore = (k) => white(trackLines({ ...t, R: t.R + k * LANE_W, lanes: 0 }).slice(0, 4));
  let lanes = 4;
  while (lanes < 10 && lineScore(lanes + 1) > 0.45) lanes++;
  while (lanes > 1 && lineScore(lanes) < 0.45) lanes--;
  // (and inwards: the search may have taken the first lane line for the kerb)
  while (lanes < 10 && lineScore(-1) > 0.45) { t.R -= LANE_W; lanes++; }
  // once more with all the lanes: the outer ones pin the straight's length and the heading down
  const all = (q) => white(trackLines({ ...shift(q, q.du, q.dv), lanes }).slice(0, -1));
  const again = climb({ ...t, du: 0, dv: 0 }, { du: 0.3, dv: 0.15, heading: 0.003, L: 0.3, R: 0.1 }, all, 0.02);
  Object.assign(t, shift(again.params, again.params.du, again.params.dv));
  delete t.du; delete t.dv;
  return { track: { ...t, lanes, laneW: LANE_W }, score: again.score, perLine: Array.from({ length: lanes + 1 }, (_, k) => +lineScore(k).toFixed(2)) };
}

/** The football pitch: the touch and goal lines snapped onto the paint; the FIFA markings (or a junior pitch's) in it */
function fitFootball(rect, white) {
  const boundary = (r) => fifaLines(r).slice(0, 2); // touch/goal lines and the halfway line
  let best = null;
  for (let dl = 0; dl <= 10; dl += 1) for (let dw = 0; dw <= 10; dw += 1) {
    const r = { ...rect, l: rect.l - dl, w: rect.w - dw }, s = white(boundary(r));
    if (!best || s > best.s) best = { r, s };
  }
  const f = (r) => white(boundary(shift(r, r.du, r.dv)));
  const { params, score } = climb({ ...best.r, du: 0, dv: 0 }, { du: 0.5, dv: 0.5, heading: 0.005, l: 0.5, w: 0.5 }, f, 0.01);
  const r = shift(params, params.du, params.dv);
  delete r.du; delete r.dv;
  const junior = r.l < COURTS.football.l[0];
  const lines = fifaLines(r, { junior });
  return { rect: r, junior, lines, boundary: score, all: white(lines) };
}

/** Paint peaks along one direction inside a polygon: positions (metres in the rect's frame) of the strong lines */
function paintPeaks(img, rect, ring, bits, across) {
  const { w, h, res, x0, z0, cls } = img;
  const hd = rect.heading + (across ? Math.PI / 2 : 0), ux = Math.sin(hd), uz = Math.cos(hd);
  const ext = Math.hypot(rect.l, rect.w) / 2 + 2, bins = Math.ceil((2 * ext) / 0.1), hist = new Float64Array(bins);
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < ring.length; i += 2) { b[0] = Math.min(b[0], ring[i]); b[1] = Math.min(b[1], ring[i + 1]); b[2] = Math.max(b[2], ring[i]); b[3] = Math.max(b[3], ring[i + 1]); }
  const px0 = Math.max(0, Math.floor((b[0] - x0) / res)), px1 = Math.min(w - 1, Math.ceil((b[2] - x0) / res));
  const py0 = Math.max(0, Math.floor((b[1] - z0) / res)), py1 = Math.min(h - 1, Math.ceil((b[3] - z0) / res));
  for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) {
    if (!(cls[y * w + x] & bits)) continue;
    const X = x0 + (x + 0.5) * res, Z = z0 + (y + 0.5) * res;
    if (!pointInRing(ring, X, Z)) continue;
    const u = (X - rect.cx) * ux + (Z - rect.cz) * uz;
    hist[Math.floor((u + ext) / 0.1)]++;
  }
  // smooth over ±0.1 m, then local maxima carrying at least 1.5 m of line
  const sm = hist.map((_, i) => (hist[i - 1] || 0) + hist[i] + (hist[i + 1] || 0));
  const peaks = [];
  for (let i = 1; i < bins - 1; i++) if (sm[i] >= sm[i - 1] && sm[i] > sm[i + 1] && sm[i] >= 1.5 / res) peaks.push({ u: (i + 0.5) * 0.1 - ext, n: sm[i] });
  // keep the strongest within 0.4 m
  peaks.sort((a, b2) => b2.n - a.n);
  const kept = [];
  for (const p of peaks) if (kept.every((k) => Math.abs(k.u - p.u) > 0.4)) kept.push(p);
  return kept.slice(0, 40).map((p) => p.u).sort((a, b2) => a - b2);
}

/** The share of the smaller of two courts the other covers (sampled on a 0.5 m grid) */
function courtOverlap(a, b) {
  const small = a.l * a.w <= b.l * b.w ? a : b, big = small === a ? b : a;
  const ring = rectRing(big);
  let n = 0, hit = 0;
  for (let u = -small.l / 2 + 0.25; u < small.l / 2; u += 0.5) for (let v = -small.w / 2 + 0.25; v < small.w / 2; v += 0.5) {
    const p = shift(small, u, v);
    n++;
    if (pointInRing(ring, p.cx, p.cz)) hit++;
  }
  return n ? hit / n : 0;
}

/** Courts in a surface: rectangles of regulation size whose template lines lie on paint */
function findCourts(img, rect, ring, white, sports = ['basketball', 'tennis', 'volleyball', 'handball'], tagged = false) {
  // (a sport the map tags on the pitch needs less evidence: faded lines on clay)
  const minEdge = tagged ? 0.44 : 0.55, minScore = tagged ? 0.44 : 0.5;
  const found = [];
  for (const across of [false, true]) {
    const hd = rect.heading + (across ? Math.PI / 2 : 0);
    const frameRect = { ...rect, heading: hd };
    const us = paintPeaks(img, frameRect, ring, WHITE, false), vs = paintPeaks(img, frameRect, ring, WHITE, true);
    for (const sport of sports) {
      const size = COURTS[sport];
      for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
        const l = us[j] - us[i];
        if (l < size.l[0] || l > size.l[1]) continue;
        for (let k = 0; k < vs.length; k++) for (let m = k + 1; m < vs.length; m++) {
          const wv = vs[m] - vs[k];
          if (wv < size.w[0] || wv > size.w[1]) continue;
          const c = shift(frameRect, (us[i] + us[j]) / 2, (vs[k] + vs[m]) / 2);
          const court = { cx: c.cx, cz: c.cz, heading: hd, l, w: wv };
          const edge = white([{ pts: rectRing(court).concat(rectRing(court).slice(0, 2)) }]);
          if (process.env.DEBUG_COURTS && edge > 0.35) console.log(sport, l.toFixed(2), wv.toFixed(2), "edge", edge.toFixed(2), "all", white(TEMPLATES[sport](court)).toFixed(2));
          if (edge < minEdge) continue;
          const lines = TEMPLATES[sport](court);
          const score = white(lines);
          if (score >= minScore) found.push({ sport, ...court, edge, score, lines });
        }
      }
    }
  }
  // the best first; a court overlapping a better one of the same sport by most of its area goes
  found.sort((a, b) => b.score + b.edge - a.score - a.edge);
  const kept = [];
  for (const c of found) {
    // (a court of the same sport overlapping a better one by over a quarter of the smaller, or any by over 60 %: the same
    // lines found again; courts of different sports overlap on a multi-sport ground and stay)
    const dup = kept.some((k) => {
      const o = courtOverlap(k, c);
      return o > 0.6 || (k.sport === c.sport && o > 0.25);
    });
    if (!dup) kept.push(c);
  }
  // (much weaker than the best court of the surface: stray lines that happen to fit, half courts)
  const best = Math.max(0, ...kept.map((c) => c.score));
  return kept.filter((c) => c.score >= best * 0.65);
}

/** The share of a component's cells whose pixels mostly carry `bit` */
function share(img, cc, g, id, bit) {
  const k = Math.round(g.cell / img.res);
  let n = 0, hit = 0;
  for (let p = 0; p < cc.labels.length; p += 3) if (cc.labels[p] === id) {
    const x = p % g.w, y = (p - x) / g.w;
    n++;
    if (img.cls[(y * k) * img.w + x * k] & bit) hit++;
  }
  return n ? hit / n : 0;
}

/** The share of the pixels inside a ring carrying each class bit: { [bit]: share } */
function shares(img, ring) {
  const { w, h, res, x0, z0, cls } = img, b = [Infinity, Infinity, -Infinity, -Infinity], count = {};
  for (let i = 0; i < ring.length; i += 2) { b[0] = Math.min(b[0], ring[i]); b[1] = Math.min(b[1], ring[i + 1]); b[2] = Math.max(b[2], ring[i]); b[3] = Math.max(b[3], ring[i + 1]); }
  let n = 0;
  for (let y = Math.max(0, Math.floor((b[1] - z0) / res)); y < Math.min(h, (b[3] - z0) / res); y += 3) for (let x = Math.max(0, Math.floor((b[0] - x0) / res)); x < Math.min(w, (b[2] - x0) / res); x += 3) {
    if (!pointInRing(ring, x0 + (x + 0.5) * res, z0 + (y + 0.5) * res)) continue;
    n++;
    const c = cls[y * w + x];
    for (let bit = 1; bit < 256; bit <<= 1) if (c & bit) count[bit] = (count[bit] || 0) + 1;
  }
  const out = {};
  for (let bit = 1; bit < 256; bit <<= 1) out[bit] = n ? (count[bit] || 0) / n : 0;
  return out;
}

const centroidOf = (ring) => { let x = 0, z = 0; for (let i = 0; i < ring.length; i += 2) { x += ring[i]; z += ring[i + 1]; } return [x / (ring.length / 2), z / (ring.length / 2)]; };

/** The courts to look for on a pitch, by its sport tag (all of them where it has none, or several) */
function sportsFor(pitch) {
  const all = ['basketball', 'tennis', 'volleyball', 'handball'];
  if (!pitch?.sport) return all;
  const out = new Set();
  for (const s of pitch.sport.split(';')) {
    if (s === 'soccer') out.add('football');
    else if (/tennis/.test(s)) out.add('tennis');
    else if (/volleyball/.test(s)) out.add('volleyball');
    else if (all.includes(s)) out.add(s);
    else if (s === 'multi') all.forEach((x) => out.add(x));
  }
  return out.size ? [...out] : all;
}

// --- A site ------------------------------------------------------------------------------------------------------------
const KIND_OF = { [RED]: 'tartan-red', [BLUE]: 'tartan-blue' };

export function fitSite(site, img) {
  const white = paintScorer(img, WHITE);
  const surfaces = [], lines = [], labels = [], courts = [];
  let track = null;
  const summary = [];
  const pitchRings = site.pitches.map((p) => p.ring);
  const inPitch = (x, z) => pitchRings.some((r) => pointInRing(r, x, z));
  const curated = !site.auto;
  const boxPolys = [];
  const covered = new Set();
  const pitchRect = (p) => { const pts = []; for (let i = 0; i < p.ring.length; i += 2) pts.push([p.ring[i], p.ring[i + 1]]); return fitRectangle(pts, { q: 0 }); };
  const addCourts = (rect, ring, sports, tagged = false) => {
    for (const c of findCourts(img, rect, ring, white, sports, tagged)) {
      lines.push(...c.lines);
      courts.push(c);
      summary.push(`${c.sport} ${c.l.toFixed(2)} × ${c.w.toFixed(2)} edge ${c.edge.toFixed(2)} all ${c.score.toFixed(2)}`);
      labels.push({ x: c.cx, z: c.cz, text: `${c.sport} ${c.score.toFixed(2)}` });
    }
  };

  // Tartan (red, blue)
  for (const bit of [RED, BLUE]) {
    let g = downsample(img, bit, BUILDING);
    g = open(close(g, 2), 2);
    const cc = components(g);
    for (const comp of cc.comps) {
      const area = comp.n * g.cell * g.cell;
      if (area < (bit === RED ? 100 : 60)) continue;
      const pts = componentPoints(cc, g, comp.id);
      // in a curated site anything; otherwise most of it inside the mapped pitches
      const inside = pts.filter(([x, z]) => inPitch(x, z)).length / pts.length;
      if (!curated && inside < 0.4) continue;
      const rect = fitRectangle(pts);
      const fill = area / (rect.l * rect.w);
      const poly = componentPolygon(cc, g, comp);
      if (!poly.ring) continue;
      let kind = KIND_OF[bit];
      const pitch = site.pitches.find((p) => pts.filter(([x, z]) => pointInRing(p.ring, x, z)).length > pts.length * 0.4);
      if (bit === RED && pitch && /tennis/.test(pitch.sport) && !/tartan|rubber|acrylic|asphalt/.test(pitch.surface)) kind = 'clay';
      else if (bit === RED && share(img, cc, g, comp.id, CLAY) > 0.5) kind = 'clay';
      // the track: the site's largest red area (a ring, though the masts' shadows may cut it open)
      const isTrack = site.hints.track && !track && bit === RED && comp === cc.comps.filter((c) => c.n * g.cell * g.cell > 3000).sort((a, b) => b.n - a.n)[0];
      // a mapped pitch, partly shaded by trees (the traced area ragged): its rectangle from the map
      const shaded = !isTrack && pitch && fill < 0.9;
      if (pitch) covered.add(pitch.id);
      const ring = shaded ? rectRing(pitchRect(pitch)) : fill > 0.94 && !isTrack ? rectRing(rect) : poly.ring;
      surfaces.push({ kind, ring, holes: shaded ? [] : poly.holes.filter((h) => h.area > 20).map((h) => h.ring) });
      boxPolys.push(ring);
      summary.push(`${kind} ${area.toFixed(0)} m²${shaded ? ' (map)' : fill > 0.94 && !isTrack ? ' (rect)' : ''}`);
      if (isTrack) {
        const t = fitTrack(rect, white);
        track = t.track;
        lines.push(...trackLines(track));
        summary.push(`track L ${track.L.toFixed(2)} R ${track.R.toFixed(2)} lanes ${track.lanes} score ${t.score.toFixed(2)} [${t.perLine}]`);
        labels.push({ x: track.cx, z: track.cz, text: `track ${track.lanes} lanes R ${track.R.toFixed(2)} L ${track.L.toFixed(2)} snap ${t.score.toFixed(2)}` });
        // the infield: turf where green, inside the kerb
        const kerb = rectRing({ ...track, l: track.L + 2 * track.R, w: 2 * track.R });
        let gg = downsample(img, GREEN, BUILDING);
        gg = open(close(gg, 2), 3);
        const gc = components(gg);
        const big = gc.comps.filter((c) => {
          const [x0, y0, x1, y1] = c.box, mx = gg.x0 + ((x0 + x1) / 2) * gg.cell, mz = gg.z0 + ((y0 + y1) / 2) * gg.cell;
          return c.n * gg.cell * gg.cell > 1000 && pointInRing(kerb, mx, mz);
        }).sort((a, b) => b.n - a.n)[0];
        if (big) {
          const gp = componentPoints(gc, gg, big.id), gr = fitRectangle(gp, { around: track.heading, span: 0.2 });
          const gfill = (big.n * gg.cell * gg.cell) / (gr.l * gr.w);
          const tp = componentPolygon(gc, gg, big);
          surfaces.push({ kind: 'turf', ring: tp.ring, holes: [] }); // (traced: it meets the tartan's traced edge without gap or overlap)
          summary.push(`turf ${(big.n * gg.cell * gg.cell).toFixed(0)} m² fill ${gfill.toFixed(2)}`);
          // (a mapped football pitch in the infield gets its lines below, fitted from the map's rectangle)
          const mapped = site.pitches.some((p) => /soccer/.test(p.sport) && pointInRing(kerb, ...centroidOf(p.ring)));
          if (site.hints.football !== false && !mapped) {
            const fb = fitFootball(gr, white);
            if (fb.boundary > 0.5) {
              lines.push(...fb.lines);
              courts.push({ sport: fb.junior ? 'junior' : 'football', ...fb.rect, score: fb.all });
              summary.push(`football ${fb.rect.l.toFixed(1)} × ${fb.rect.w.toFixed(1)} boundary ${fb.boundary.toFixed(2)} all ${fb.all.toFixed(2)}`);
              labels.push({ x: fb.rect.cx, z: fb.rect.cz + 12, text: `football ${fb.rect.l.toFixed(1)}×${fb.rect.w.toFixed(1)} ${fb.boundary.toFixed(2)}/${fb.all.toFixed(2)}` });
            } else summary.push(`football rejected ${fb.boundary.toFixed(2)}`);
          }
        }
      } else addCourts(shaded ? pitchRect(pitch) : rect, ring, sportsFor(pitch), !!pitch?.sport);
    }
  }

  // The mapped pitches no tartan area covered: their surface from the colour inside them and the tags, their lines
  for (const p of site.pitches) {
    if (covered.has(p.id)) continue;
    const rect = pitchRect(p), ring = rectRing(rect), sh = shares(img, ring);
    const synthetic = /artificial|tartan|rubber|acrylic|synthetic|plastic/.test(p.surface);
    let kind = null;
    if (sh[RED] > 0.3) kind = (/tennis/.test(p.sport) && !synthetic) || sh[CLAY] > sh[RED] * 0.5 ? 'clay' : 'tartan-red';
    else if (sh[BLUE] > 0.3) kind = 'tartan-blue';
    else if (synthetic && sh[REDDISH] > 0.5) kind = 'tartan-red'; // (faded)
    else if (sh[GREEN] > 0.5 && synthetic) kind = /artificial/.test(p.surface) ? 'turf' : 'tartan-green';
    if (kind) { surfaces.push({ kind, ring, holes: [] }); boxPolys.push(ring); }
    summary.push(`${p.id} ${p.sport || '?'}/${p.surface || '?'} → ${kind || 'no surface'} (red ${sh[RED].toFixed(2)} green ${sh[GREEN].toFixed(2)})`);
    if (/soccer/.test(p.sport) && rect.l > 25) {
      const fb = fitFootball(rect, white);
      if (fb.boundary > 0.5) {
        lines.push(...fb.lines); boxPolys.push(ring);
        courts.push({ sport: fb.junior ? 'junior' : 'football', ...fb.rect, score: fb.all });
        summary.push(`football ${fb.rect.l.toFixed(1)} × ${fb.rect.w.toFixed(1)} boundary ${fb.boundary.toFixed(2)} all ${fb.all.toFixed(2)}`);
        labels.push({ x: fb.rect.cx, z: fb.rect.cz, text: `football ${fb.boundary.toFixed(2)}/${fb.all.toFixed(2)}` });
      } else summary.push(`football rejected ${fb.boundary.toFixed(2)}`);
    }
    const others = sportsFor(p).filter((x) => x !== 'football');
    if (others.length) addCourts(rect, rectRing({ ...rect, l: rect.l + 2, w: rect.w + 2 }), others, !!p.sport);
  }
  const box = boxPolys.length ? boxPolys.reduce((b, r) => {
    for (let i = 0; i < r.length; i += 2) { b[0] = Math.min(b[0], r[i]); b[1] = Math.min(b[1], r[i + 1]); b[2] = Math.max(b[2], r[i]); b[3] = Math.max(b[3], r[i + 1]); }
    return b;
  }, [Infinity, Infinity, -Infinity, -Infinity]) : site.box;
  for (const s of surfaces) labels.push({ x: s.ring[0], z: s.ring[1], text: s.kind });
  return { box, surfaces, lines, labels, track, courts, summary: summary.join('; ') || 'nothing found' };
}
