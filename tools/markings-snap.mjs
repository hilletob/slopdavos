// tools/markings-snap.mjs — the traced road paint (tools/markings-fit.mjs) taken as information and drawn again into the
// game's streets (DAVOS_DATA.roads: the centrelines and widths js/city-grid.js builds the carriageways from), so that
// it sits on them however far the map's streets lie off the photograph:
//  - lines along a street: drawn along its centreline's own bends; on a street under 9 m a dash is its centre line and a
//    solid line its centre or (in its outer half) edge line, 0.25 m inside the curb; wider streets keep their lanes'
//    offsets as photographed;
//  - a crossing (its broad bars side by side): one regulation Fussgängerstreifen across the whole carriageway, bars
//    0.5 m wide with 0.5 m gaps, as long as the photographed ones, square to the street at their middle;
//  - bars across a street (stop and give-way lines): square to it, curb to centre or curb as photographed;
//  - other paint on a carriageway: kept when it is a shape (arrows, lettering) or a stroke of 1.5 m and more, else
//    dropped (glints, patches);
// paint off the streets (car parks, yards) stays as traced.
const CARRIAGEWAY = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service']);

function roadIndex(roads, box) {
  const segs = [];
  for (const r of roads) {
    if (!CARRIAGEWAY.has(r.kind) || r.tunnel || r.bridge) continue;
    const p = r.pts;
    let s = 0;
    const cum = [0];
    for (let i = 2; i < p.length; i += 2) { s += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); cum.push(s); }
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2], az = p[i - 1], bx = p[i], bz = p[i + 1];
      if (Math.max(ax, bx) < box[0] - 20 || Math.min(ax, bx) > box[2] + 20 || Math.max(az, bz) < box[1] - 20 || Math.min(az, bz) > box[3] + 20) continue;
      const L = Math.hypot(bx - ax, bz - az) || 1e-6;
      segs.push({ road: r, cum, k: i / 2 - 1, ax, az, dx: (bx - ax) / L, dz: (bz - az) / L, L, half: (r.width || 5) / 2 });
    }
  }
  return segs;
}

/** The street under (x, z): { seg, s (along the road), d (left of its centreline) } or null */
function onRoad(segs, x, z, pad = 0.6) {
  let best = null;
  for (const g of segs) {
    const rx = x - g.ax, rz = z - g.az, t = rx * g.dx + rz * g.dz;
    if (t < -1 || t > g.L + 1) continue;
    const d = -rx * g.dz + rz * g.dx;
    if (Math.abs(d) > g.half + pad) continue;
    if (!best || Math.abs(d) < Math.abs(best.d)) best = { seg: g, s: g.cum[g.k] + Math.max(0, Math.min(g.L, t)), d };
  }
  return best;
}

/** The road's centreline from s0 to s1 (along it), `d` to its left, as a flat polyline */
function alongRoad(road, s0, s1, d) {
  const p = road.pts, out = [];
  const at = (s) => {
    let acc = 0;
    for (let i = 2; i < p.length; i += 2) {
      const L = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
      if (acc + L >= s || i === p.length - 2) {
        const t = L ? Math.max(0, Math.min(1, (s - acc) / L)) : 0, dx = (p[i] - p[i - 2]) / (L || 1), dz = (p[i + 1] - p[i - 1]) / (L || 1);
        return [p[i - 2] + (p[i] - p[i - 2]) * t - dz * d, p[i - 1] + (p[i + 1] - p[i - 1]) * t + dx * d];
      }
      acc += L;
    }
    return [p[0], p[1]];
  };
  const step = 1.0, n = Math.max(1, Math.ceil((s1 - s0) / step));
  for (let k = 0; k <= n; k++) out.push(...at(s0 + ((s1 - s0) * k) / n));
  return out;
}

const centre = (pts) => { let x = 0, z = 0; for (let i = 0; i < pts.length; i += 2) { x += pts[i]; z += pts[i + 1]; } return [x / (pts.length / 2), z / (pts.length / 2)]; };
const median = (a) => { const b = [...a].sort((p, q) => p - q); return b[Math.floor(b.length / 2)]; };

export function snapToRoads(strokes, fills, roads, box) {
  const segs = roadIndex(roads, box);
  const out = [], keptFills = [], stats = { along: 0, crossings: 0, across: 0, dropped: 0, off: 0 };
  const crossingBars = [], crossings = [], pending = [];
  for (const st of strokes) {
    const [cx, cz] = centre(st.pts), at = onRoad(segs, cx, cz);
    if (!at) { out.push(st); stats.off++; continue; }
    const p = st.pts, n = p.length, ex = p[n - 2] - p[0], ez = p[n - 1] - p[1], L = Math.hypot(ex, ez) || 1e-6;
    const cos = Math.abs((ex * at.seg.dx + ez * at.seg.dz) / L), half = at.seg.half, road = at.seg.road;
    if (st.w >= 0.42 && cos > 0.8) { crossingBars.push({ ...at, L }); continue; }
    if (cos > 0.94 && st.w < 0.42) {
      // along the street: its extent along it, its offset snapped
      const ends = [onRoad(segs, p[0], p[1], 1.5), onRoad(segs, p[n - 2], p[n - 1], 1.5)].filter((e) => e && e.seg.road === road);
      if (ends.length < 2) { out.push(st); continue; }
      const s0 = Math.min(ends[0].s, ends[1].s), s1 = Math.max(ends[0].s, ends[1].s);
      pending.push({ st, road, s0, s1, d: at.d, half });
    } else if (cos < 0.3) {
      // across: square to the street at its middle, over the width photographed (within the curbs)
      const ux = at.seg.dx, uz = at.seg.dz, nx = -uz, nz = ux;
      const ds = [];
      for (let i = 0; i < n; i += 2) ds.push((p[i] - at.seg.ax) * nx + (p[i + 1] - at.seg.az) * nz);
      let d0 = Math.max(-half + 0.1, Math.min(...ds)), d1 = Math.min(half - 0.1, Math.max(...ds));
      if (Math.abs(d0) < 0.6) d0 = 0; if (Math.abs(d1) < 0.6) d1 = 0;
      if (half - Math.abs(d0) < 0.8) d0 = Math.sign(d0) * (half - 0.1); if (half - Math.abs(d1) < 0.8) d1 = Math.sign(d1) * (half - 0.1);
      if (d1 - d0 < 0.5) { stats.dropped++; continue; }
      const [mx, mz] = alongRoad(road, at.s, at.s, 0);
      out.push({ c: st.c, w: st.w, pts: [mx + nx * d0, mz + nz * d0, mx + nx * d1, mz + nz * d1] });
      stats.across++;
    } else if (L >= 1.5) out.push(st);
    else stats.dropped++;
  }
  // Lines along the streets. On a street of one lane each way a dash (under 4.5 m) is its centre line, wherever the
  // map's street lies; where three dashes and more show it, their offset is how far the map's centreline lies off the
  // photographed one, and a solid line is the centre line within 0.8 m of the dashes, else the edge line on its side,
  // 0.25 m inside the curb. On a wider street the offset as photographed (lanes).
  // (the centre line's dashes are those of the street's commonest dash colour: a dash of the other one is a line
  // along parked cars or the curb)
  const bias = new Map(), centreColour = new Map();
  for (const road of new Set(pending.map((p) => p.road))) {
    const dashes = pending.filter((p) => p.road === road && p.s1 - p.s0 < 4.5);
    const yellow = dashes.filter((p) => p.st.c === 'y').length, c = yellow * 2 >= dashes.length ? 'y' : 'w';
    const own = dashes.filter((p) => p.st.c === c).map((p) => p.d);
    centreColour.set(road, c);
    bias.set(road, own.length >= 3 ? median(own) : 0);
  }
  for (const p of pending) {
    const dash = p.s1 - p.s0 < 4.5 && p.st.c === centreColour.get(p.road), narrow = p.half * 2 < 9, rel = p.d - bias.get(p.road);
    let d = p.d;
    if (narrow && dash) d = 0;
    else if (narrow) d = Math.abs(rel) < 0.8 ? 0 : Math.sign(rel) * (p.half - 0.25);
    else if (Math.abs(d) > p.half * 0.5) d = Math.sign(d) * (p.half - 0.25);
    else if (Math.abs(d) < 1.0) d = 0;
    out.push({ c: p.st.c, w: p.st.w, pts: alongRoad(p.road, p.s0, p.s1, d), along: { road: p.road, s0: p.s0, s1: p.s1, d } });
    stats.along++;
  }
  // the crossings: bars on one street within 3 m of each other along it
  crossingBars.sort((a, b) => (a.seg.road.id < b.seg.road.id ? -1 : a.seg.road.id > b.seg.road.id ? 1 : a.s - b.s));
  for (let i = 0; i < crossingBars.length;) {
    let j = i + 1;
    while (j < crossingBars.length && crossingBars[j].seg.road === crossingBars[i].seg.road && crossingBars[j].s - crossingBars[j - 1].s < 3) j++;
    const group = crossingBars.slice(i, j);
    i = j;
    if (group.length < 2) { stats.dropped++; continue; }
    const road = group[0].seg.road, s = median(group.map((b) => b.s)), L = Math.max(2.5, Math.min(4.5, median(group.map((b) => b.L))));
    const half = (road.width || 5) / 2, count = Math.max(2, Math.floor(2 * half - 0.1));
    crossings.push({ road, s0: s - L / 2 - 0.5, s1: s + L / 2 + 0.5 });
    for (let k = 0; k < count; k++) {
      const d = k - (count - 1) / 2;
      out.push({ c: 'y', w: 0.5, pts: alongRoad(road, s - L / 2, s + L / 2, d) });
    }
    stats.crossings++;
  }
  // no line along a street through its crossings, and one line only where two came to lie on the same offset (the
  // photo's two lines a little apart, now on one)
  // (the dashes first: on a narrow street they are its centre line; a solid line that came to lie on them, within the
  // gaps between them too, is another line the snapping moved)
  const len = (o) => o.along.s1 - o.along.s0, isDash = (o) => len(o) < 4.5 && o.c === centreColour.get(o.along.road);
  const along = out.filter((o) => o.along).sort((a, b) => (isDash(a) === isDash(b) ? len(b) - len(a) : isDash(a) ? -1 : 1));
  const kept = [];
  const drop = new Set();
  for (const o of along) {
    const a = o.along;
    if (crossings.some((c) => c.road === a.road && a.s1 > c.s0 && a.s0 < c.s1)) { drop.add(o); continue; }
    if (kept.some((k) => k.road === a.road && Math.abs(k.d - a.d) < 0.3 && Math.min(k.s1, a.s1) - Math.max(k.s0, a.s0) > (k.dash ? -6 : 0.3))) { drop.add(o); continue; }
    kept.push({ ...a, dash: isDash(o) });
  }
  for (let i = out.length - 1; i >= 0; i--) {
    if (drop.has(out[i])) { out.splice(i, 1); stats.dropped++; } else delete out[i].along;
  }
  // shapes on a carriageway: arrows and lettering stay, small patches go
  for (const f of fills) {
    const [cx, cz] = centre(f.ring);
    let area = 0;
    for (let i = 0, j = f.ring.length - 2; i < f.ring.length; j = i, i += 2) area += f.ring[j] * f.ring[i + 1] - f.ring[i] * f.ring[j + 1];
    if (onRoad(segs, cx, cz, 0) && Math.abs(area / 2) < 1.5) { stats.dropped++; continue; }
    keptFills.push(f);
  }
  return { strokes: out, fills: keptFills, stats };
}
