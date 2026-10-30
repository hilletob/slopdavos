// The Rhaetian Railway's line through the mapped valley (Landquart – Davos – Filisur), as two routes over the OSM
// metre-gauge tracks (railway=narrow_gauge in js/davos-geodata.js): pure functions, shared by js/rhb.js and the tests.
//
// The tracks are densified and joined where they meet (OSM ways meet at shared nodes, or at a switch in the middle of
// another way); the line runs between the two track ends nearest the edges of the map, northbound (to Wolfgang and
// Klosters) and southbound (to Frauenkirch and Filisur). The southbound route is the shortest path; the northbound one
// avoids the southbound's track where there is another (×1.6 cost), so that in the stations with a passing loop the two
// directions stand on different tracks. Stations are railway=station/halt nodes within 40 m of both routes (the node often sits on the station building).

const STEP = 4, JOIN = 1.2;

function densify(flat) {
  const pts = [];
  for (let i = 0; i + 3 < flat.length; i += 2) {
    const ax = flat[i], az = flat[i + 1], bx = flat[i + 2], bz = flat[i + 3];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
    for (let k = 0; k < n; k++) pts.push({ x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n });
  }
  pts.push({ x: flat[flat.length - 2], z: flat[flat.length - 1] });
  return pts;
}

// Graph of track points: [{ x, z, tunnel, bridge, edges: [{ to, len }] }]
export function trackGraph(railways) {
  const nodes = [], cells = new Map(), key = (x, z) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
  const link = (a, b) => {
    const len = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z) || 0.01;
    nodes[a].edges.push({ to: b, len }); nodes[b].edges.push({ to: a, len });
  };
  for (const r of railways) {
    if (r.kind !== 'narrow_gauge' || r.pts.length < 4) continue;
    let prev = -1;
    for (const p of densify(r.pts)) {
      const id = nodes.push({ x: p.x, z: p.z, tunnel: !!r.tunnel, bridge: !!r.bridge, edges: [] }) - 1;
      const k = key(p.x, p.z);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(id);
      if (prev >= 0) link(prev, id);
      prev = id;
    }
  }
  // Joins between different ways (and the closing points of consecutive segments of the same one)
  for (let id = 0; id < nodes.length; id++) {
    const n = nodes[id], cx = Math.floor(n.x / 4), cz = Math.floor(n.z / 4);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const o of cells.get(`${cx + dx},${cz + dz}`) || []) {
        if (o <= id || n.edges.some((e) => e.to === o)) continue;
        if (Math.hypot(nodes[o].x - n.x, nodes[o].z - n.z) < JOIN) link(id, o);
      }
    }
  }
  return nodes;
}

function shortestPath(nodes, from, to, cost = () => 1) {
  const dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1);
  dist[from] = 0;
  // Binary heap of [distance, node]
  const heap = [[0, from]];
  const push = (item) => { heap.push(item); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    if (u === to) break;
    for (const e of nodes[u].edges) {
      const nd = d + e.len * cost(u, e.to);
      if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; push([nd, e.to]); }
    }
  }
  if (prev[to] < 0) return null;
  const path = [];
  for (let u = to; u >= 0; u = prev[u]) path.push(u);
  return path.reverse();
}

// A route: points along the track with their cumulative distance, and tunnel / bridge flags
function route(nodes, path) {
  const pts = path.map((i) => nodes[i]), cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { pts, cum, len: cum[cum.length - 1], path };
}

// Position and unit direction at distance s along a route (clamped), into `out`
export function routePoint(r, s, out = {}) {
  const { pts, cum } = r;
  s = Math.max(0, Math.min(r.len, s));
  let lo = 1, hi = cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < s) lo = mid + 1; else hi = mid; }
  const a = pts[lo - 1], b = pts[lo], seg = cum[lo] - cum[lo - 1] || 1e-6, t = (s - cum[lo - 1]) / seg;
  out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
  out.dx = (b.x - a.x) / seg; out.dz = (b.z - a.z) / seg;
  out.tunnel = a.tunnel && b.tunnel;
  return out;
}

// Distance along a route of the point nearest (x, z), and how far off it lies
export function project(r, x, z) {
  let best = { s: 0, d: Infinity };
  for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / L2));
    const d = Math.hypot(a.x + ex * t - x, a.z + ez * t - z);
    if (d < best.d) best = { s: r.cum[i - 1] + Math.sqrt(L2) * t, d };
  }
  return best;
}

/**
 * The line: { south, north } routes (each runs in its direction of travel, from s = 0 at its entry into the map) and
 * the stations in southbound order: [{ name, kind, south: s, north: s, loop }], `loop` when the two directions stand on
 * different tracks there (a passing loop: trains may cross). `bounds`: [minX, minZ, maxX, maxZ] of the map.
 */
export function buildLine(railways, stations, bounds) {
  const nodes = trackGraph(railways);
  if (!nodes.length) return null;
  // The ends: dead ends of the track network through Davos Platz (other lines' ways reach in from beyond the map),
  // nearest the map's northern and south-western edges
  const [minX, minZ, maxX, maxZ] = bounds;
  const platz = stations.find((s) => s.name === 'Davos Platz') || { x: 0, z: 0 };
  let seed = 0;
  nodes.forEach((n, i) => { if (Math.hypot(n.x - platz.x, n.z - platz.z) < Math.hypot(nodes[seed].x - platz.x, nodes[seed].z - platz.z)) seed = i; });
  const reached = new Uint8Array(nodes.length), stack = [seed];
  reached[seed] = 1;
  while (stack.length) for (const e of nodes[stack.pop()].edges) if (!reached[e.to]) { reached[e.to] = 1; stack.push(e.to); }
  const ends = nodes.map((n, i) => i).filter((i) => reached[i] && nodes[i].edges.length === 1);
  const north = ends.reduce((a, b) => (nodes[b].z < nodes[a].z ? b : a));
  const south = ends.reduce((a, b) => (nodes[b].z - nodes[b].x > nodes[a].z - nodes[a].x ? b : a));
  const sPath = shortestPath(nodes, north, south);
  if (!sPath) return null;
  const used = new Set();
  for (let i = 1; i < sPath.length; i++) used.add(`${sPath[i - 1]}/${sPath[i]}`);
  const nPath = shortestPath(nodes, south, north, (a, b) => (used.has(`${b}/${a}`) || used.has(`${a}/${b}`) ? 1.6 : 1));
  const southbound = route(nodes, sPath), northbound = route(nodes, nPath);
  const list = [];
  for (const st of stations) {
    const a = project(southbound, st.x, st.z), b = project(northbound, st.x, st.z);
    if (a.d > 40 || b.d > 40) continue;
    // Do the two routes run apart around the station's platform?
    const p = routePoint(southbound, a.s), q = routePoint(northbound, b.s);
    list.push({ name: st.name, kind: st.kind, south: a.s, north: b.s, loop: Math.hypot(p.x - q.x, p.z - q.z) > 2.5 });
  }
  list.sort((p, q) => p.south - q.south);
  return { south: southbound, north: northbound, stations: list, inside: (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ };
}
