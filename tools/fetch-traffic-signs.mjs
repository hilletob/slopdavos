// tools/fetch-traffic-signs.mjs — writes js/traffic-signs-data.js: the road signs of Davos for js/traffic-signs.js,
// after the Swiss Signalisationsverordnung (SSV). Every sign is a post with one or more plates, standing at the right
// of the traffic it is meant for (road half width + 0.5 m: on the sidewalk or the verge), its plates facing that
// traffic. Two sources:
//  1. OpenStreetMap (one Overpass query, tools/data/q_davos_traffic_signs.overpassql, cached in
//     tools/data/cache/osm_davos_traffic_signs.json; pass --refresh to query again): highway=stop / give_way nodes
//     (with their direction=forward|backward along the way), highway=crossing nodes (marked / zebra crossings of the
//     main roads: SSV 4.11 on both sides), traffic_sign=city_limit (Ortsbeginn 4.27 with "50 generell" 2.30.1), and
//     the ways of the 30 km/h zones (maxspeed:type=CH:zone30: Zone 30 2.59.1 where a road enters the zone, "Ende" on
//     the back).
//  2. Rules on the mapped street network (js/davos-geodata.js roadGraph & roads):
//     - one-way streets: "Einbahnstrasse" (4.08) where a one-way run begins, "Einfahrt verboten" (2.02) where it ends,
//       with the plate "ausgenommen" + bus (5.xx) where the buses drive against it (oneway:bus=no: the Promenade and
//       the Talstrasse);
//     - "Kein Vortritt" (3.02) on the minor roads (tertiary and below) joining a primary or secondary road, unless OSM
//       maps a stop, give-way or signal within 35 m of the junction;
//     - the VBD stops (js/vbd-data.js): a yellow stop plate with the green "H" and the stop's name, one per stop and
//       direction;
//     - "Parkieren gestattet" (4.17) at the larger open-air car parks (js/parking-data.js), by the street they open on.
// No sign stands on a carriageway or in a (mapped) building; js/traffic-signs.js moves the ones that would stand in a
// painted crosswalk out of it, and sets them on the terrain and the raised sidewalks.
// usage: node tools/fetch-traffic-signs.mjs [--refresh]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lonLatToWorld, WORLD_BOUNDS } from '../js/davos-frame.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { VBD_DATA } from '../js/vbd-data.js';
import { PARKING_DATA } from '../js/parking-data.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DIR, 'data', 'cache', 'osm_davos_traffic_signs.json');
const QUERY = path.join(DIR, 'data', 'q_davos_traffic_signs.overpassql');
const OUT = path.join(DIR, '..', 'js', 'traffic-signs-data.js');
const log = (...a) => console.log('[traffic-signs]', ...a);

if (process.argv.includes('--refresh') || !fs.existsSync(CACHE)) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  execFileSync('bash', [path.join(DIR, 'overpass.sh'), CACHE, QUERY, '4'], { stdio: 'inherit' });
}
const osm = JSON.parse(fs.readFileSync(CACHE, 'utf8'));

const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const CURB = 0.5; // the post stands this far beyond the carriageway's edge
const RANK = { primary: 3, secondary: 2, tertiary: 1 }; // the rest: 0
const DRIVABLE = /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)(_link)?$/;
const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
const inMap = (x, z) => x > minX + 50 && x < maxX - 50 && z > minZ + 50 && z < maxZ - 50;

// --- The street network ----------------------------------------------------------------------------------------------
const roads = DAVOS_DATA.roads.filter((r) => DRIVABLE.test(r.kind) && !r.tunnel);
// Segment index of the carriageways (for "is this point on a road", nearest road)
const SEG_CELL = 32;
const segCells = new Map();
const segKey = (ix, iz) => ix * 65536 + iz;
for (const r of roads) {
  const half = (r.width || 6) / 2;
  for (let i = 2; i < r.pts.length; i += 2) {
    const s = { ax: r.pts[i - 2], az: r.pts[i - 1], bx: r.pts[i], bz: r.pts[i + 1], half, road: r };
    for (let ix = Math.floor((Math.min(s.ax, s.bx) - half) / SEG_CELL); ix <= Math.floor((Math.max(s.ax, s.bx) + half) / SEG_CELL); ix++) {
      for (let iz = Math.floor((Math.min(s.az, s.bz) - half) / SEG_CELL); iz <= Math.floor((Math.max(s.az, s.bz) + half) / SEG_CELL); iz++) {
        const k = segKey(ix, iz);
        if (!segCells.has(k)) segCells.set(k, []);
        segCells.get(k).push(s);
      }
    }
  }
}
function segDistance(s, x, z) {
  const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
  return { d: Math.hypot(s.ax + dx * t - x, s.az + dz * t - z), t, L: Math.sqrt(L2) };
}
/** Nearest carriageway segment to (x, z) within `reach` (optionally only those passing `test(road)`) */
function nearestSegment(x, z, reach = 30, test = null) {
  let best = null;
  for (let ix = Math.floor((x - reach) / SEG_CELL); ix <= Math.floor((x + reach) / SEG_CELL); ix++) {
    for (let iz = Math.floor((z - reach) / SEG_CELL); iz <= Math.floor((z + reach) / SEG_CELL); iz++) {
      for (const s of segCells.get(segKey(ix, iz)) || []) {
        if (test && !test(s.road)) continue;
        const q = segDistance(s, x, z);
        if (q.d < reach && (!best || q.d < best.d)) best = { ...q, s, road: s.road, dx: (s.bx - s.ax) / q.L, dz: (s.bz - s.az) / q.L, x: s.ax + (s.bx - s.ax) * q.t, z: s.az + (s.bz - s.az) * q.t };
      }
    }
  }
  return best;
}
/** Whether (x, z) lies on a carriageway (within its half width + margin) */
function onCarriageway(x, z, margin = 0.3) {
  for (const s of segCells.get(segKey(Math.floor(x / SEG_CELL), Math.floor(z / SEG_CELL))) || []) {
    if (s.road.bridge) continue;
    if (segDistance(s, x, z).d < s.half + margin) return true;
  }
  return false;
}

// Buildings (OSM footprints), bucketed
const B_CELL = 64;
const bCells = new Map();
for (const b of DAVOS_DATA.buildings) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < b.ring.length; i += 2) { x0 = Math.min(x0, b.ring[i]); x1 = Math.max(x1, b.ring[i]); z0 = Math.min(z0, b.ring[i + 1]); z1 = Math.max(z1, b.ring[i + 1]); }
  const e = { ring: b.ring, x0, x1, z0, z1 };
  for (let ix = Math.floor(x0 / B_CELL); ix <= Math.floor(x1 / B_CELL); ix++) for (let iz = Math.floor(z0 / B_CELL); iz <= Math.floor(z1 / B_CELL); iz++) {
    const k = segKey(ix, iz);
    if (!bCells.has(k)) bCells.set(k, []);
    bCells.get(k).push(e);
  }
}
const pip = (ring, x, z) => { let inside = false; for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) { if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < ((ring[j] - ring[i]) * (z - ring[i + 1])) / (ring[j + 1] - ring[i + 1]) + ring[i]) inside = !inside; } return inside; };
function inBuilding(x, z, margin = 0.4) {
  for (const b of bCells.get(segKey(Math.floor(x / B_CELL), Math.floor(z / B_CELL))) || []) {
    if (x < b.x0 - margin || x > b.x1 + margin || z < b.z0 - margin || z > b.z1 + margin) continue;
    for (const [ox, oz] of [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin]]) if (pip(b.ring, x + ox, z + oz)) return true;
  }
  return false;
}

// The centreline graph (tools/build-davos-geodata.mjs): nodes, links a -> b with their shape, name, width, direction
const G = DAVOS_DATA.roadGraph;
const nodes = [];
for (let i = 0; i < G.nodes.length; i += 2) nodes.push({ id: i / 2, x: G.nodes[i], z: G.nodes[i + 1], arms: [] });
const links = G.links.map((l, id) => {
  const [a, b, name, width, lanes, dir, inner] = l;
  const pts = [[nodes[a].x, nodes[a].z]];
  for (let i = 0; i < inner.length; i += 2) pts.push([inner[i], inner[i + 1]]);
  pts.push([nodes[b].x, nodes[b].z]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { id, a, b, name: G.names[name] || '', width, half: width / 2, lanes, dir, pts, cum, len: cum[cum.length - 1], bridge: l[7] === 1, bus: l[8] || 0 };
});
// The class of each link: of the mapped road (the same name preferred) nearest its middle
for (const L of links) {
  const m = pointOn(L, 0, L.len / 2);
  const named = L.name ? nearestSegment(m.x, m.z, 15, (r) => r.name === L.name) : null;
  const any = named || nearestSegment(m.x, m.z, 15, (r) => r.kind !== 'service');
  L.kind = any ? any.road.kind.replace(/_link$/, '') : 'residential';
  L.rank = RANK[L.kind] || 0;
  nodes[L.a].arms.push({ link: L, end: 0 });
  nodes[L.b].arms.push({ link: L, end: 1 });
}

/** Point at distance s from one end of a link (end 0: from a, 1: from b), with the unit direction away from that end */
function pointOn(L, end, s) {
  s = Math.max(0, Math.min(L.len, s));
  const S = end ? L.len - s : s;
  let i = 1;
  while (i < L.cum.length - 1 && L.cum[i] < S) i++;
  const p = L.pts[i - 1], q = L.pts[i], seg = L.cum[i] - L.cum[i - 1] || 1e-6, t = (S - L.cum[i - 1]) / seg;
  const dx = (q[0] - p[0]) / seg, dz = (q[1] - p[1]) / seg;
  return { x: p[0] + (q[0] - p[0]) * t, z: p[1] + (q[1] - p[1]) * t, dx: end ? -dx : dx, dz: end ? -dz : dz };
}
// Can traffic drive along link L away from its end `end`? (dir 1: a -> b; -1: b -> a; buses on bus links both ways)
const drivesFrom = (L, end) => L.dir === 0 || (L.dir === 1) === (end === 0);

// --- Signs ------------------------------------------------------------------------------------------------------------
const signs = [];
const counts = {};
/**
 * A post at the right of traffic travelling (tx, tz) past the road point (x, z), `half` the carriageway's half width;
 * its plates face that traffic. Tries a few metres either way along the road when the spot is taken by another road
 * or a building; returns the sign or null.
 */
function addSign(plates, x, z, tx, tz, half, { src = 'rule', road = '', text, back, left = false, along = [0, -2, 2, -4, 4, -7, 7], minGap = 6 } = {}) {
  const side = left ? -1 : 1;
  const rx = -tz * side, rz = tx * side; // right of the travel direction (x east, z south), or left
  for (const a of along) {
    for (const off of [half + CURB, half + CURB + 0.6, half + 0.3]) {
      const px = x + tx * a + rx * off, pz = z + tz * a + rz * off;
      if (!inMap(px, pz) || onCarriageway(px, pz, 0.25) || inBuilding(px, pz)) continue;
      // (no two posts within 1.5 m of each other, nor within 3.5 m facing the same way: one would hide the other)
      const yaw = Math.atan2(-tx, -tz);
      if (signs.some((s) => { const d = Math.hypot(s.x - px, s.z - pz); return d < 1.5 || (d < 3.5 && Math.cos(s.yaw - yaw) > 0.7); })) continue;
      // (the same signal close by, facing the same way: once is enough)
      if (signs.some((s) => s.plates[0] === plates[0] && Math.hypot(s.x - px, s.z - pz) < minGap && Math.cos(s.yaw - yaw) > 0.7)) return null;
      const sign = { t: plates[0], x: r2(px), z: r2(pz), yaw: r3(yaw), plates, src };
      if (road) sign.road = road;
      if (text) sign.text = text;
      if (back) sign.back = back;
      signs.push(sign);
      for (const p of plates) counts[p] = (counts[p] || 0) + 1;
      return sign;
    }
  }
  return null;
}

// 1a. OSM stop / give-way nodes, on the way they belong to (direction=forward|backward along it; else towards the
// nearer junction)
const osmNodes = osm.elements.filter((e) => e.type === 'node');
const nodeWays = new Map();
for (const r of roads) for (const id of r.nodeIds || []) if (id != null) { if (!nodeWays.has(id)) nodeWays.set(id, []); nodeWays.get(id).push(r); }
const priorityNodes = []; // world positions of the mapped stops and give-ways (the rules leave their junctions alone)
let osmSkipped = 0;
for (const e of osmNodes) {
  const t = e.tags || {};
  if (t.highway !== 'stop' && t.highway !== 'give_way') continue;
  const w = lonLatToWorld(e.lon, e.lat);
  priorityNodes.push(w);
  const ways = nodeWays.get(e.id) || [];
  const way = ways.find((r) => r.kind !== 'service') || ways[0];
  const near = way ? nearestSegment(w.x, w.z, 6, (r) => r === way) : nearestSegment(w.x, w.z, 4);
  if (!near || near.road.bridge) { osmSkipped++; continue; }
  let tx = near.dx, tz = near.dz;
  if (t.direction === 'backward') { tx = -tx; tz = -tz; } else if (t.direction !== 'forward') {
    // towards the nearer graph node
    let best = null;
    for (const n of nodes) { const d = Math.hypot(n.x - w.x, n.z - w.z); if (d < 40 && (!best || d < best.d)) best = { d, n }; }
    if (best && (best.n.x - w.x) * tx + (best.n.z - w.z) * tz < 0) { tx = -tx; tz = -tz; }
  }
  const half = (near.road.width || 5) / 2;
  // (a step back from the stop line, which OSM often maps right at the junction)
  if (!addSign([t.highway === 'stop' ? 'stop' : 'giveway'], near.x - tx * 1.5, near.z - tz * 1.5, tx, tz, half, { src: 'osm', road: near.road.name, along: [0, -2, -4, 2, -6] })) osmSkipped++;
}
const signalNodes = (DAVOS_DATA.signals || []).map((s) => ({ x: s.x, z: s.z }));

// 1b. Zone 30 entries: where a road outside the zone leads into a way of the zone (Zone sign facing the traffic
// entering, "Ende Zone" on its back)
const zoneWays = new Set(osm.elements.filter((e) => e.type === 'way' && e.tags?.['maxspeed:type'] === 'CH:zone30').map((e) => `w${e.id}`));
for (const r of roads.filter((x) => zoneWays.has(x.id))) {
  const ids = r.nodeIds || [];
  for (const [end, id] of [[0, ids[0]], [1, ids[ids.length - 1]]]) {
    const other = (nodeWays.get(id) || []).filter((x) => x !== r && !zoneWays.has(x.id) && x.kind !== 'service');
    if (!other.length) continue;
    // Travel into the zone way from that end
    const n = r.pts.length;
    const [ax, az, bx, bz] = end === 0 ? [r.pts[0], r.pts[1], r.pts[2], r.pts[3]] : [r.pts[n - 2], r.pts[n - 1], r.pts[n - 4], r.pts[n - 3]];
    const L = Math.hypot(bx - ax, bz - az) || 1, tx = (bx - ax) / L, tz = (bz - az) / L;
    if (r.oneway && ((end === 0) === r.reverse)) continue; // one-way out of the zone here
    const half = (r.width || 5) / 2, back = Math.max(...other.map((x) => (x.width || 6) / 2)) + 3;
    addSign(['zone30'], ax + tx * back, az + tz * back, tx, tz, half, { src: 'osm', road: r.name, back: 'zone30end' });
  }
}

// 1c. Ortsbeginn (traffic_sign=city_limit): the place's name in white on blue (a main road) with "50 generell" above,
// facing the direction= the node gives (degrees, the way the sign looks)
for (const e of osmNodes) {
  const t = e.tags || {};
  if (t.traffic_sign !== 'city_limit' || !t.name) continue;
  const w = lonLatToWorld(e.lon, e.lat);
  const near = nearestSegment(w.x, w.z, 25, (r) => r.kind !== 'service');
  if (!near) continue;
  const deg = Number.parseFloat(t.direction);
  // the traffic reading it travels against the way it faces (bearing: north = -z)
  let tx = near.dx, tz = near.dz;
  if (Number.isFinite(deg)) { const fx = Math.sin(deg * Math.PI / 180), fz = -Math.cos(deg * Math.PI / 180); if (fx * tx + fz * tz > 0) { tx = -tx; tz = -tz; } }
  // ("Davos Freuenkirch": a typo in OSM)
  addSign(['gen50', 'city'], near.x, near.z, tx, tz, (near.road.width || 6) / 2, { src: 'osm', road: near.road.name, text: t.name.replace('Freuenkirch', 'Frauenkirch') });
}

const nearPriority = (x, z, r) => priorityNodes.some((p) => Math.hypot(p.x - x, p.z - z) < r) || signalNodes.some((p) => Math.hypot(p.x - x, p.z - z) < r);

// 1d. Crosswalks of the main roads (marked / zebra crossings mapped on primary, secondary and tertiary roads):
// SSV 4.11 at both ends of the stripes, each facing the traffic of its side, double sided
for (const e of osmNodes) {
  const t = e.tags || {};
  if (t.highway !== 'crossing' || !/^(marked|zebra|uncontrolled)$/.test(t.crossing || '') && t.crossing_ref !== 'zebra') continue;
  const w = lonLatToWorld(e.lon, e.lat);
  const near = nearestSegment(w.x, w.z, 2.5, (r) => RANK[r.kind.replace(/_link$/, '')] > 0 && !r.bridge);
  if (!near) continue;
  const half = (near.road.width || 6) / 2, opts = { src: 'osm', road: near.road.name, back: 'crosswalk', along: [0, -1, 1, -2.5], minGap: 4 };
  // (just outside the 3-4 m wide stripes)
  addSign(['crosswalk'], near.x - near.dx * 2.6, near.z - near.dz * 2.6, near.dx, near.dz, half, opts);
  addSign(['crosswalk'], near.x + near.dx * 2.6, near.z + near.dz * 2.6, -near.dx, -near.dz, half, opts);
}

// 2a. One-way streets: runs of named one-way links (not the two carriageways of a divided road), "Einbahnstrasse"
// where traffic enters a run, "Einfahrt verboten" (both sides on wide streets) where it leaves it, with "ausgenommen"
// + bus where the buses come the other way
const travel = (L) => (L.dir === 1 ? [L.a, L.b] : [L.b, L.a]);
const oneways = links.filter((L) => L.dir !== 0 && L.name && L.len > 2);
const divided = (L) => {
  const m = pointOn(L, 0, L.len / 2), d = L.dir;
  return oneways.some((o) => o !== L && o.name === L.name && o.pts.some(([x, z]) => Math.hypot(x - m.x, z - m.z) < 35) && (() => {
    const p = pointOn(o, 0, o.len / 2);
    return (p.dx * o.dir) * (m.dx * d) + (p.dz * o.dir) * (m.dz * d) < -0.8;
  })());
};
const runLinks = oneways.filter((L) => !divided(L));
const setback = (n, except) => Math.max(4, ...n.arms.filter((a) => a.link.name !== except).map((a) => a.link.half + 3));
let einbahn = 0, verboten = 0;
for (const L of runLinks) {
  const [from, to] = travel(L);
  // Start: no link of the same run arrives at `from`, and traffic can get there (another road meets it)
  const nf = nodes[from];
  if (!runLinks.some((o) => o !== L && o.name === L.name && travel(o)[1] === from) && nf.arms.length >= 2 && L.len > 15) {
    const end = from === L.a ? 0 : 1, s = Math.min(L.len / 2, setback(nf, L.name));
    const p = pointOn(L, end, s);
    if (addSign(['oneway'], p.x, p.z, p.dx, p.dz, L.half, { road: L.name, minGap: 20 })) einbahn++;
  }
  // End: no link of the run leaves `to`; traffic arriving there must not turn in against it
  const nt = nodes[to];
  if (!runLinks.some((o) => o !== L && o.name === L.name && travel(o)[0] === to) && nt.arms.length >= 2 && L.len > 10) {
    const end = to === L.a ? 0 : 1, s = Math.min(L.len / 2, setback(nt, L.name));
    const p = pointOn(L, end, s);
    // the wrong-way traveller heads away from `to` along L: (p.dx, p.dz); the post at its right (and left)
    const plates = L.bus ? ['noentry', 'exceptbus'] : ['noentry'];
    const o = { road: L.name, minGap: 10 };
    if (addSign(plates, p.x, p.z, p.dx, p.dz, L.half, o)) verboten++;
    if (L.width >= 6 && addSign(plates, p.x, p.z, p.dx, p.dz, L.half, { ...o, left: true, minGap: 2 })) verboten++;
  }
}

// 2b. Kein Vortritt: minor roads (tertiary and below) joining a primary or secondary road, where OSM maps nothing
let giveways = 0;
for (const n of nodes) {
  if (n.arms.length < 3 || !inMap(n.x, n.z)) continue;
  const top = Math.max(...n.arms.map((a) => a.link.rank));
  if (top < 2 || nearPriority(n.x, n.z, 35)) continue;
  const mainHalf = Math.max(...n.arms.filter((a) => a.link.rank === top).map((a) => a.link.half));
  for (const arm of n.arms) {
    const L = arm.link;
    if (L.rank > 1 || L.bridge || L.len < 15) continue;
    // traffic must be able to drive along L towards n: away from the other end
    if (!drivesFrom(L, 1 - arm.end)) continue;
    // (a minor road continuing straight across as the same road: still a give-way per arm)
    const s = Math.min(L.len * 0.6, mainHalf + 4.5);
    const p = pointOn(L, arm.end, s);
    if (addSign(['giveway'], p.x, p.z, -p.dx, -p.dz, L.half, { road: L.name, along: [0, -1.5, -3, 1.5] })) giveways++;
  }
}

// 2c. Bus stops: the yellow plate with the green "H" and the name, one per stop and direction, beside the bus's lane
let stopSigns = 0;
const placedStops = [];
for (const v of VBD_DATA.variants) {
  const pts = [];
  for (let i = 0; i < v.pts.length; i += 2) pts.push([v.pts[i], v.pts[i + 1]]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  for (const st of v.stops || []) {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < st.s) i++;
    const seg = cum[i] - cum[i - 1] || 1e-6, t = Math.min(1, Math.max(0, (st.s - cum[i - 1]) / seg));
    const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
    const tx = (pts[i][0] - pts[i - 1][0]) / seg, tz = (pts[i][1] - pts[i - 1][1]) / seg;
    if (!inMap(x, z) || placedStops.some((p) => p.name === st.name && Math.hypot(p.x - x, p.z - z) < 40 && p.tx * tx + p.tz * tz > 0.3)) continue;
    placedStops.push({ name: st.name, x, z, tx, tz });
    const near = nearestSegment(x, z, 10, (r) => r.kind !== 'service');
    const half = near ? (near.road.width || 6) / 2 : 3;
    // (a little ahead of where the bus's front door stops)
    if (addSign(['busstop'], near ? near.x : x, near ? near.z : z, tx, tz, half, { road: near?.road.name || '', text: st.name, along: [4, 2, 6, 0, 8, -2], minGap: 15 })) stopSigns++;
  }
}

// 2d. Parking: "P" at the larger open-air car parks, at the road edge nearest the lot, facing the traffic passing on
// the lot's side
let parkingSigns = 0;
const lotArea = (ring) => { let a = 0; for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) a += ring[j] * ring[i + 1] - ring[i] * ring[j + 1]; return Math.abs(a / 2); };
for (const lot of PARKING_DATA) {
  if (lot.kind !== 'surface') continue;
  const area = lotArea(lot.ring);
  if (area < 600 && !(lot.capacity >= 20)) continue;
  let best = null;
  for (let i = 0; i < lot.ring.length; i += 2) {
    const s = nearestSegment(lot.ring[i], lot.ring[i + 1], 20, (r) => r.kind !== 'service' && !r.bridge && r.kind !== 'track');
    if (s && (!best || s.d < best.d)) best = s;
  }
  if (!best) continue;
  // the lot's side of the road: travel so that the lot lies at the right
  let cx = 0, cz = 0;
  for (let i = 0; i < lot.ring.length; i += 2) { cx += lot.ring[i]; cz += lot.ring[i + 1]; }
  cx /= lot.ring.length / 2; cz /= lot.ring.length / 2;
  let tx = best.dx, tz = best.dz;
  if ((-tz) * (cx - best.x) + tx * (cz - best.z) < 0) { tx = -tx; tz = -tz; }
  if (addSign(['parking'], best.x, best.z, tx, tz, (best.road.width || 6) / 2, { road: best.road.name, text: lot.name || undefined, minGap: 60 })) parkingSigns++;
}

signs.sort((a, b) => a.x - b.x || a.z - b.z);
signs.forEach((s, i) => { s.id = i; });
const data = {
  source: 'OpenStreetMap contributors (ODbL): highway=stop|give_way|crossing, traffic_sign=city_limit, maxspeed:type=CH:zone30; derived from the mapped streets, the VBD stops and the car parks',
  fetched: new Date().toISOString().slice(0, 10),
  signs: signs.map(({ id, ...s }) => s)
};
fs.writeFileSync(OUT, `// js/traffic-signs-data.js — GENERATED by tools/fetch-traffic-signs.mjs, do not edit by hand.\n// Swiss road signs (SSV) of Davos: posts at (x, z) in the world frame of js/davos-frame.js, their plates (top down)\n// facing yaw (rotation about +y; the plates' front looks along (sin yaw, cos yaw)). © OpenStreetMap contributors (ODbL).\nexport const TRAFFIC_SIGNS = ${JSON.stringify(data)};\n`);
log(`${signs.length} posts: ${JSON.stringify(counts)}`);
log(`one-way: ${einbahn} Einbahnstrasse, ${verboten} Einfahrt verboten; ${giveways} derived give-ways; ${stopSigns} stops; ${parkingSigns} car parks; ${osmSkipped} OSM stop/give-way nodes off the network`);
log(`-> ${OUT}`);
