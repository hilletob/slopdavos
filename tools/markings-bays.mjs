// tools/markings-bays.mjs — the parking bays in the traced road paint (tools/markings-layer.mjs), for the car parks OSM
// lacks (private yards and forecourts): the separators of a row of bays are parallel bars of about a car's length side
// by side, 2.2–3.4 m apart. Bars of one direction and length whose middles lie across their direction from each other
// form a row; where a car hides a separator the gap is a whole number of spacings, and the missing bars are put back;
// between two neighbouring separators lies a bay. Returns { rows: [{ bays: [{ x, z, angle, w, l }], ring, added }] }
// (world frame; angle of the bay's long axis atan2(ux, uz), as js/parking-data.js); `added`: the separators put back,
// as strokes { c, w, pts }.
import { pointInRing } from '../js/ground-geometry.js';

const MIN_L = 1.2, MAX_L = 6.5, MAX_W = 0.2, MIN_S = 2.1, MAX_S = 3.5, MAX_GAP = 4; // (spacings bridged)

export function rowsOfBays(strokes, { blocked = () => false } = {}) {
  // the candidate separators
  const bars = [];
  for (const s of strokes) {
    if (s.pts.length !== 4 || s.w > MAX_W) continue;
    let [ax, az, bx, bz] = s.pts;
    const L = Math.hypot(bx - ax, bz - az);
    if (L < MIN_L || L > MAX_L) continue;
    let dx = (bx - ax) / L, dz = (bz - az) / L;
    if (dx < 0 || (dx === 0 && dz < 0)) { dx = -dx; dz = -dz; } // (one sense for every bar)
    bars.push({ s, L, mx: (ax + bx) / 2, mz: (az + bz) / 2, dx, dz });
  }
  // rows: union-find over neighbours (same direction and length, side by side, at most MAX_GAP spacings apart)
  const parent = bars.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) {
    const a = bars[i], b = bars[j];
    if (Math.abs(a.dx * b.dz - a.dz * b.dx) > Math.sin((6 * Math.PI) / 180) || a.s.c !== b.s.c) continue;
    // (side by side: their spans along the bars overlap by 0.8 m at least; a separator half hidden by a car is shorter)
    const rx = b.mx - a.mx, rz = b.mz - a.mz, along = rx * a.dx + rz * a.dz, across = Math.abs(rx * a.dz - rz * a.dx);
    const overlap = Math.min(a.L / 2, along + b.L / 2) - Math.max(-a.L / 2, along - b.L / 2);
    if (overlap >= 0.8 && across >= MIN_S - 0.2 && across <= MAX_S * MAX_GAP) parent[find(i)] = find(j);
  }
  const groups = new Map();
  bars.forEach((b, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(b); });
  const rows = [];
  for (const g of groups.values()) {
    if (g.length < 2 || Math.max(...g.map((b) => b.L)) < 3.5) continue; // (one separator at least of a car's length)
    // the row's frame: d along the bars (the bays' long axis), p across them (along the row)
    let dx = 0, dz = 0;
    for (const b of g) { dx += b.dx; dz += b.dz; }
    const n = Math.hypot(dx, dz); dx /= n; dz /= n;
    const px = -dz, pz = dx, ox = g[0].mx, oz = g[0].mz;
    const items = g.map((b) => ({ b, t: (b.mx - ox) * px + (b.mz - oz) * pz, u: (b.mx - ox) * dx + (b.mz - oz) * dz })).sort((p, q) => p.t - q.t);
    // the spacing: the median of the gaps of one bay
    const gaps = [];
    for (let k = 1; k < items.length; k++) gaps.push(items[k].t - items[k - 1].t);
    const single = gaps.filter((x) => x >= MIN_S && x <= MAX_S).sort((p, q) => p - q);
    // (no single gap: the bays hidden by cars all along; the usual width, 2.5–2.7 m, where a gap is a multiple of it)
    let S = single.length ? single[Math.floor(single.length / 2)] : null;
    if (!S) for (const gap of gaps) { const m = Math.round(gap / 2.6); if (m >= 2 && m <= MAX_GAP && Math.abs(gap / m - 2.6) < 0.25) { S = gap / m; break; } }
    if (!S) continue;
    // the bays' length: the span the bars cover together along their direction (a hidden one is shorter)
    const lo = Math.min(...items.map((x) => x.u - x.b.L / 2)), hi = Math.max(...items.map((x) => x.u + x.b.L / 2));
    const L = Math.min(6.5, Math.max(4, hi - lo)), uMid = (lo + hi) / 2, c = g[0].s.c, w = Math.min(...g.map((b) => b.s.w));
    for (const x of items) x.u = uMid; // (every separator, and every bay, over the whole span)
    // put the hidden separators back
    const seps = [items[0]], added = [];
    for (let k = 1; k < items.length; k++) {
      const a = items[k - 1], b = items[k], gap = b.t - a.t, m = Math.round(gap / S);
      if (m >= 2 && m <= MAX_GAP && Math.abs(gap - m * S) < 0.45) {
        for (let q = 1; q < m; q++) {
          const t = a.t + (gap * q) / m, u = a.u + ((b.u - a.u) * q) / m;
          const cx = ox + px * t + dx * u, cz = oz + pz * t + dz * u;
          if (blocked(cx, cz)) continue;
          const sep = { t, u, put: true };
          seps.push(sep);
          added.push({ c, w, pts: [cx - (dx * L) / 2, cz - (dz * L) / 2, cx + (dx * L) / 2, cz + (dz * L) / 2] });
        }
      }
      seps.push(b);
    }
    // the bays between neighbouring separators one spacing apart
    const bays = [];
    for (let k = 1; k < seps.length; k++) {
      const a = seps[k - 1], b = seps[k], gap = b.t - a.t;
      if (gap < MIN_S || gap > MAX_S || Math.abs(gap - S) > 0.5) continue;
      const t = (a.t + b.t) / 2, u = (a.u + b.u) / 2, x = ox + px * t + dx * u, z = oz + pz * t + dz * u;
      if (blocked(x, z)) continue;
      bays.push({ x, z, angle: Math.atan2(dx, dz), w: gap, l: L });
    }
    if (bays.length < 1) continue;
    // the row's outline (its bars' extent, 0.3 m round)
    const t0 = seps[0].t - 0.3, t1 = seps[seps.length - 1].t + 0.3;
    const us = seps.map((s) => s.u), u0 = Math.min(...us) - L / 2 - 0.3, u1 = Math.max(...us) + L / 2 + 0.3;
    const ring = [];
    for (const [t, u] of [[t0, u0], [t1, u0], [t1, u1], [t0, u1]]) ring.push(ox + px * t + dx * u, oz + pz * t + dz * u);
    rows.push({ bays, ring, added, spacing: S, colour: c });
  }
  return rows;
}

/** Whether a row lies (by its middle) in one of `rings` */
export const rowIn = (row, rings) => {
  let x = 0, z = 0;
  for (const b of row.bays) { x += b.x; z += b.z; }
  x /= row.bays.length; z /= row.bays.length;
  return rings.some((r) => pointInRing(r, x, z));
};
