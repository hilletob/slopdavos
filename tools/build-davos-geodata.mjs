// tools/build-davos-geodata.mjs — writes js/davos-geodata.js for the engine's irregular-city data path (GEO.berlin)
// Sources (see package.json "data" scripts):
//   tools/data/cache/osm_davos.json        OpenStreetMap, query tools/data/q_davos.overpassql
//   tools/data/cache/osm_davos_areas.json  OpenStreetMap quarters (Quartiere), query tools/data/q_davos_areas.overpassql
//   tools/data/cache/davos_trees.json      Stadt Zürich tree cadastre (tools/fetch-davos-trees.mjs)
// Frame: js/davos-frame.js (LV95 offset: x = east, z = south, metres). Buildings are drawn from swisstopo's
// swissBUILDINGS3D at runtime (js/swissbuildings3d.js); the OSM footprints below drive colliders, sidewalks & the
// fallback extrusions. Terrain heights live in data/davos-terrain.bin (tools/build-davos-terrain.mjs).
// usage: node tools/build-davos-geodata.mjs [out.js]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME, WORLD_BOUNDS, lonLatToWorld, lv95ToWorld } from '../js/davos-frame.js';
import { parseTerrain, gridHeight } from '../js/terrain-grid.js';
import { findUnderpasses } from './underpass.mjs';
import { isDrivableTunnel } from '../js/tunnel-profile.js';
import { toWorld, flat, geomPts, inFrame, ringArea, bbox, bboxInFrame, rdp, cleanRing, polygons, clipToFrame } from './osm-geometry.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.join(DIR, '..', 'js', 'davos-geodata.js');
const CACHE = path.join(DIR, 'data', 'cache');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(CACHE, name), 'utf8'));
const osm = readJson('osm_davos.json');
const log = (...a) => console.log('[davos-geodata]', ...a);
const terrainFile = fs.readFileSync(path.join(DIR, '..', 'data', 'davos-terrain.bin'));
const TERRAIN = parseTerrain(terrainFile.buffer.slice(terrainFile.byteOffset, terrainFile.byteOffset + terrainFile.byteLength));
const r2 = (v) => Math.round(v * 100) / 100;

const r1 = (v) => Math.round(v * 10) / 10;
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

// --- Buildings (footprints; the volumes come from swissBUILDINGS3D) ------------------------------------------------------
const buildings = [];
for (const e of osm.elements) {
  const t = e.tags || {};
  if (e.type === 'node' || !t.building) continue;
  if (t.building === 'roof' || t.building === 'no' || t.building === 'construction') continue;
  if (t.location === 'underground' || (num(t.layer) ?? 0) < 0) continue;
  for (const [i, p] of polygons(e).entries()) {
    const ring = cleanRing(p.ring);
    if (ring.length < 3 || Math.abs(ringArea(ring)) < 6 || !bboxInFrame(bbox(ring))) continue;
    const levels = num(t['building:levels']);
    let h = num(t.height), src = 'height';
    if (h == null && levels != null) { h = levels * 3.2 + (t['roof:shape'] && t['roof:shape'] !== 'flat' ? 3 : 1); src = 'building:levels'; }
    if (h == null) { h = 9; src = 'default'; } // Davos: mostly two- to four-storey houses, hotels and chalets
    buildings.push({
      id: `${e.type[0]}${e.id}${i ? '_' + i : ''}`, ring: flat(ring), holes: p.holes.map((hh) => flat(cleanRing(hh))), h: r1(h),
      roofHeight: r1(num(t['roof:height']) ?? 0), roofShape: t['roof:shape'] || 'flat', levels: levels ?? 0,
      name: t.name || '', kind: t.building, heightSource: src
    });
  }
}

// --- Road underpasses (tools/underpass.mjs) ------------------------------------------------------------------------------
// The road comes out of its tunnel into the trench the terrain tool has cut. The lid over it reaches across the cut, to
// where the ground is back at the level of the yard. Every track and road crossing the lid is cut into a deck over it
// (the bridge ways below: their nodes on the lid take its height, the ends the ground just beyond its edge).
const underpasses = [];
const lidAnchors = new Map(); // node id -> height of the lid it lies on
{
  const MARGIN = 3, FAR = 34;
  let nextId = -1;
  for (const u of findUnderpasses(osm)) {
    const ground = (s, v) => gridHeight(TERRAIN, u.a.x + u.ux * s - u.uz * v, u.a.z + u.uz * s + u.ux * v);
    const yard = [];
    for (let s = 2; s < u.len - 2; s += 2) for (const v of [-FAR, -FAR + 4, FAR - 4, FAR]) yard.push(ground(s, v));
    yard.sort((p, q) => p - q);
    const y = r2(yard[yard.length >> 1]);
    const side = (sign) => {
      let reach = u.half + 1.5;
      for (let s = 0; s <= u.len; s += 2) for (let v = FAR; v > reach; v -= 1) if (ground(s, sign * v) < y - 0.4) { reach = v; break; }
      return reach + 1;
    };
    const left = side(-1), right = side(1);
    u.way.tags = { ...u.way.tags, underpass: 'yes' };
    delete u.way.tags.tunnel; delete u.way.tags.layer; delete u.way.tags.covered;
    underpasses.push({ id: `w${u.way.id}`, name: u.way.tags.name || '', ax: r2(u.a.x), az: r2(u.a.z), ux: u.ux, uz: u.uz, len: r2(u.len), half: u.half, left: r1(left), right: r1(right), y });
    // Local frame of the lid: s along the road, v across it
    const local = (p) => { const dx = p.x - u.a.x, dz = p.z - u.a.z; return { s: dx * u.ux + dz * u.uz, v: -dx * u.uz + dz * u.ux }; };
    const inside = (q, m) => q.s >= -m && q.s <= u.len + m && q.v >= -left - m && q.v <= right + m;
    const portals = new Set([u.way.nodes[0], u.way.nodes[u.way.nodes.length - 1]]);
    const added = [];
    for (let w = osm.elements.length - 1; w >= 0; w--) {
      const e = osm.elements[w], t = e.tags || {};
      if (e.type !== 'way' || !e.geometry || !e.nodes || e === u.way || e.nodes.length !== e.geometry.length) continue;
      if (e.nodes.some((id) => portals.has(id)) || isTunnelTag(t) || (t.bridge && t.bridge !== 'no')) continue;
      if (!t.highway && !(t.railway && /^(rail|narrow_gauge)$/.test(t.railway) && !/^(yard|spur)$/.test(t.service || ''))) continue;
      const pts = e.geometry.map((p) => lonLatToWorld(p.lon, p.lat)), locals = pts.map(local);
      if (!locals.some((q, i) => inside(q, MARGIN) || (i > 0 && segmentMeetsBox(locals[i - 1], q, u.len, left, right, 0)))) continue;
      // The way's nodes, with new ones where it enters the outer box (MARGIN) and the lid
      const list = [];
      e.nodes.forEach((id, i) => {
        if (i > 0) for (const f of [...boxCrossings(locals[i - 1], locals[i], u.len, left, right, MARGIN), ...boxCrossings(locals[i - 1], locals[i], u.len, left, right, 0)].sort((p, q) => p - q)) {
          const g = e.geometry;
          list.push({ id: nextId--, lat: g[i - 1].lat + (g[i].lat - g[i - 1].lat) * f, lon: g[i - 1].lon + (g[i].lon - g[i - 1].lon) * f });
        }
        list.push({ id, lat: e.geometry[i].lat, lon: e.geometry[i].lon });
      });
      for (const n of list) { const q = local(lonLatToWorld(n.lon, n.lat)); n.outer = inside(q, MARGIN + 1e-3); n.lid = inside(q, 1e-3); if (n.lid) lidAnchors.set(n.id, y); }
      // Cut at the outer box (a boundary node belongs to both sides): a stretch inside it that reaches the lid is a deck
      const inside2 = (i) => list[i].outer && list[i + 1].outer;
      const pieces = [];
      for (let i = 0, from = 0; i < list.length - 1; i++) {
        if (i === list.length - 2 || inside2(i) !== inside2(i + 1)) { pieces.push({ run: list.slice(from, i + 2), over: inside2(i) }); from = i + 1; }
      }
      const ways = pieces.map(({ run, over }, k) => {
        const tags = over && run.some((n) => n.lid) ? { ...t, bridge: 'yes', layer: '1' } : t;
        return { ...e, id: `${e.id}${k ? `_${k}` : ''}`, tags, nodes: run.map((n) => n.id), geometry: run.map((n) => ({ lat: n.lat, lon: n.lon })) };
      });
      added.push([w, ways]);
    }
    for (const [w, ways] of added) osm.elements.splice(w, 1, ...ways);
    log(`underpass ${u.way.tags.name}: lid ${r1(left + right)} x ${r1(u.len)} m at ${y} m, ${added.length} ways over it (${added.map(([, ws]) => ws[0].tags.name || ws[0].tags.railway || ws[0].tags.highway).join(', ')})`);
  }
}
function isTunnelTag(t) { return (t.tunnel && t.tunnel !== 'no') || t.covered === 'yes' || (num(t.layer) ?? 0) < 0; }
// The fractions along segment p -> q where it crosses the outline of the box (s in [-m, len + m], v in [-left - m, right + m])
function boxCrossings(p, q, len, left, right, m) {
  const out = [];
  const edge = (a, b, c) => { if ((a - c) * (b - c) < 0) return (c - a) / (b - a); return null; };
  const inBox = (s, v) => s >= -m - 1e-6 && s <= len + m + 1e-6 && v >= -left - m - 1e-6 && v <= right + m + 1e-6;
  for (const [a, b, c] of [[p.s, q.s, -m], [p.s, q.s, len + m], [p.v, q.v, -left - m], [p.v, q.v, right + m]]) {
    const f = edge(a, b, c);
    if (f !== null && inBox(p.s + (q.s - p.s) * f, p.v + (q.v - p.v) * f)) out.push(f);
  }
  return out;
}
function segmentMeetsBox(p, q, len, left, right, m) { return boxCrossings(p, q, len, left, right, m).length > 0; }

// --- Roads & railways ---------------------------------------------------------------------------------------------------
const WIDTH = { motorway: 14, trunk: 12, primary: 10, secondary: 8, tertiary: 7, residential: 6, unclassified: 6, living_street: 5, service: 3.5, pedestrian: 6, cycleway: 2.5, footway: 2, path: 1.5, steps: 2.5, track: 3 };
const LANES = { motorway: 4, trunk: 4, primary: 2, secondary: 2, tertiary: 2, residential: 2, unclassified: 2, living_street: 1, service: 1 };
const DRIVABLE = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street']);
const RAIL = /^(rail|light_rail|tram|subway|funicular|narrow_gauge)$/;
// Sidewalks along a carriageway: [left, right] widths in metres (left/right of the way's direction), from sidewalk=*,
// sidewalk:both|left|right=* and their :width; none where they are mapped as ways of their own (=separate, drawn from
// those footway=sidewalk ways) or absent. The main streets of the centre have them on both sides where untagged.
const SIDEWALK_WIDTH = { primary: 2.4, secondary: 2.4, tertiary: 2.2 }; // else 2 m
const BOTH_SIDEWALKS = /^(Promenade|Talstrasse)$/;
function sidewalksOf(t, base) {
  if (!DRIVABLE.has(base) && base !== 'service') return null;
  const side = (s) => t[`sidewalk:${s}`] ?? t['sidewalk:both'] ??
    (t.sidewalk === 'both' || t.sidewalk === s || t.sidewalk === 'yes' ? 'yes' : t.sidewalk === 'separate' ? 'separate' : t.sidewalk ? 'no' : undefined);
  const fallback = BOTH_SIDEWALKS.test(t.name || '') && /^(primary|secondary|tertiary)$/.test(base) ? 'yes' : 'no';
  const out = ['left', 'right'].map((s) => {
    if ((side(s) ?? fallback) !== 'yes') return 0;
    const w = num(t[`sidewalk:${s}:width`]) ?? num(t['sidewalk:both:width']) ?? num(t['sidewalk:width']) ?? SIDEWALK_WIDTH[base] ?? 2;
    return r1(Math.max(1.5, Math.min(3.5, w)));
  });
  return out[0] || out[1] ? out : null;
}
function noteLevel(e, pts, kept, record, bridge, tunnel) {
  if (!e.nodes || e.nodes.length !== pts.length) return;
  const minor = MINOR.test(e.tags.highway || '');
  if (bridge) {
    const index = new Map(pts.map((p, i) => [p, i]));
    deckWays.push({ record, nodes: e.nodes, pts, kept: kept.map((p) => index.get(p)), minor, sidewalk: e.tags.footway === 'sidewalk' });
  } else if (!tunnel) for (const id of e.nodes) (minor ? minorGroundNodes : groundNodes).add(id);
}
// Curves: OSM draws a bend as a few straight pieces (a node every 10-30 m), which the engine would render as a polygon
// with kinks at the nodes. Every bend of a way at ground level is rounded into a circular arc (a fillet), its radius by
// the road's class and bounded by the pieces on either side, in pieces turning at most ~7.5°. Nodes shared with another
// road (junctions; for paths any way) and the ends stay put, so the network keeps its topology and the traffic graph
// below is cut from the same rounded lines. Bridges keep their surveyed nodes (their deck heights belong to them).
const FILLET_R = { motorway: 120, trunk: 90, primary: 60, secondary: 40, tertiary: 30, residential: 18, unclassified: 18, living_street: 12, service: 9, track: 10, cycleway: 8, pedestrian: 6 }; // (footways and paths: as mapped)
const FILLET_STEP = 0.13, FILLET_CHORD = 2.5; // rad, m: an arc's pieces turn at most ~7.5° and are at least 2.5 m long
const FOOT = /^(footway|path|steps|cycleway|pedestrian|bridleway)$/;
const nodeUses = new Map(), carriageUses = new Map();
for (const e of osm.elements) {
  const t = e.tags || {};
  if (e.type !== 'way' || !t.highway || !e.nodes) continue;
  for (const id of new Set(e.nodes)) {
    nodeUses.set(id, (nodeUses.get(id) || 0) + 1);
    if (!FOOT.test(t.highway)) carriageUses.set(id, (carriageUses.get(id) || 0) + 1);
  }
}
// pts: [[x, z]...] (the way's nodes), ids: their node ids. Returns [{ p: [x, z], id (a kept node's id, else null) }]
function roundBends(pts, ids, kind) {
  const base = kind.replace(/_link$/, '');
  const R = FILLET_R[base] ?? 0;
  const foot = FOOT.test(kind);
  const fixed = (i) => i === 0 || i === pts.length - 1 || ((foot ? nodeUses : carriageUses).get(ids[i]) || 0) > 1;
  // Simplify between the fixed nodes (which are always kept)
  const keep = [];
  for (let a = 0, b = 1; b < pts.length; b++) {
    if (!fixed(b)) continue;
    const piece = rdp(pts.slice(a, b + 1).map((p, k) => Object.assign([p[0], p[1]], { k: a + k })), 0.3);
    for (const q of (keep.length ? piece.slice(1) : piece)) keep.push(q.k);
    a = b;
  }
  const P = keep.map((k) => pts[k]);
  const out = [];
  const push = (x, z, id = null) => {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.p[0] - x, last.p[1] - z) < 0.15) { if (id != null) last.id = id; return; }
    out.push({ p: [x, z], id });
  };
  const turn = (i) => {
    if (i <= 0 || i >= P.length - 1 || fixed(keep[i]) || !R) return 0;
    const ax = P[i][0] - P[i - 1][0], az = P[i][1] - P[i - 1][1], bx = P[i + 1][0] - P[i][0], bz = P[i + 1][1] - P[i][1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la < 0.05 || lb < 0.05) return 0;
    const c = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb)));
    const th = Math.acos(c);
    return th > 0.12 && th < 2.6 ? th : 0;
  };
  for (let i = 0; i < P.length; i++) {
    const th = turn(i);
    if (!th) { push(P[i][0], P[i][1], fixed(keep[i]) || i === 0 || i === P.length - 1 ? ids[keep[i]] : null); continue; }
    const ax = P[i][0] - P[i - 1][0], az = P[i][1] - P[i - 1][1], bx = P[i + 1][0] - P[i][0], bz = P[i + 1][1] - P[i][1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    // the tangent length, shared with a neighbouring bend on the same piece
    const tmax = Math.min(la * (turn(i - 1) ? 0.5 : 0.9), lb * (turn(i + 1) ? 0.5 : 0.9));
    const tan = Math.tan(th / 2);
    const t = Math.min(R * tan, tmax), r = t / tan;
    const ux = ax / la, uz = az / la, vx = bx / lb, vz = bz / lb;
    const sign = ux * vz - uz * vx > 0 ? 1 : -1;
    const sx = P[i][0] - ux * t, sz = P[i][1] - uz * t;
    const cx = sx - uz * sign * r, cz = sz + ux * sign * r; // the centre, on the inside of the bend
    const n = Math.max(1, Math.min(Math.ceil(th / FILLET_STEP), Math.floor(th * r / FILLET_CHORD)));
    for (let k = 0; k <= n; k++) {
      const phi = sign * th * k / n, cs = Math.cos(phi), sn = Math.sin(phi);
      const dx = sx - cx, dz = sz - cz;
      push(cx + dx * cs - dz * sn, cz + dx * sn + dz * cs);
    }
  }
  return out;
}
const drivable = [];
const deckWays = []; // every rendered bridge way: { record, nodes, pts (full), kept (indices of the simplified points), minor }
// Nodes of rendered ways at ground level. Paths & steps often hang off a bridge's side (stairs down to the street or the
// platforms below), so they only anchor footbridges, never road or rail decks.
const groundNodes = new Set(), minorGroundNodes = new Set();
const MINOR = /^(footway|path|steps|cycleway|pedestrian|track|service|elevator)$/;
const roads = [];
const railways = [];
const signals = [];
const fountains = [];
const tramStops = [];
const stations = []; // railway stations and halts (the RhB's, and the funiculars')
const loipen = []; // cross-country ski trails, drawn in winter (js/loipen.js)
let trees = [];
for (const e of osm.elements) {
  const t = e.tags || {};
  if (e.type === 'node') {
    const [x, z] = toWorld(e.lon, e.lat);
    if (!inFrame(x, z)) continue;
    if (t.natural === 'tree') trees.push({ x: r1(x), z: r1(z), h: r1(num(t.height) ?? 10) });
    else if (t.highway === 'traffic_signals') signals.push({ x: r1(x), z: r1(z) });
    else if (t.amenity === 'fountain') fountains.push({ x: r1(x), z: r1(z), name: t.name || '' });
    else if (t.railway === 'tram_stop') tramStops.push({ x: r1(x), z: r1(z), name: t.name || '' });
    else if (t.railway === 'station' || t.railway === 'halt') stations.push({ x: r1(x), z: r1(z), name: t.name || '', kind: t.railway });
    continue;
  }
  if (e.type !== 'way' || !e.geometry) continue;
  const pts = geomPts(e.geometry);
  if (!bboxInFrame(bbox(pts), 50)) continue;
  const bridge = !!t.bridge && t.bridge !== 'no' && t.bridge !== 'culvert';
  // Below ground counts as a tunnel: the engine has no underground, and the terrain tool fills the open cuts leading
  // there (the Bahnhofquai underpass, the ramps to the HB's underground stations)
  const tunnel = (!!t.tunnel && t.tunnel !== 'no' && t.tunnel !== 'building_passage') || t.covered === 'yes' || t.location === 'underground' ||
    (!bridge && (num(t.layer) ?? 0) < 0);
  const layer = num(t.layer) ?? (bridge ? 1 : tunnel ? -1 : 0);
  // Cross-country ski trails (OSM piste:type=nordic; often on a track or path that is also a road record below)
  if (t['piste:type'] === 'nordic') {
    loipen.push({ id: `w${e.id}`, pts: flat(rdp(pts, 1)), grooming: t['piste:grooming'] || 'classic+skating', difficulty: t['piste:difficulty'] || '', name: t['piste:name'] || t.name || '' });
    if (!t.highway) continue;
  }
  if (t.railway && RAIL.test(t.railway)) {
    if (t.service === 'yard' || t.service === 'siding' || t.service === 'spur') {
      // (the RhB's passing loops in the stations are sidings: js/rhb-route.js crosses the trains on them)
      if (t.railway !== 'rail' && !(t.railway === 'narrow_gauge' && t.service === 'siding')) continue;
    }
    const kept = rdp(pts, 0.5);
    const record = { id: `w${e.id}`, pts: flat(kept), bridge, tunnel, layer, kind: t.railway, name: t.name || '' };
    railways.push(record);
    noteLevel(e, pts, kept, record, bridge, tunnel);
    continue;
  }
  if (!t.highway || /^(proposed|construction|platform|bus_stop|corridor|elevator|raceway|bridleway)$/.test(t.highway)) continue;
  // OSM maps crosswalks as footways across the carriageway: the engine paints its own (and would take them
  // for sidewalks in the middle of the street)
  if (t.footway === 'crossing' || t.cycleway === 'crossing' || t.path === 'crossing') continue;
  const kind = t.highway.replace(/_link$/, '') in WIDTH ? t.highway : 'service';
  const base = kind.replace(/_link$/, '');
  const lanes = num(t.lanes) ?? LANES[base] ?? 1;
  const oneway = t.oneway === 'yes' || t.oneway === '-1' || t.oneway === '1' || t.junction === 'roundabout';
  // One-way for cars, both ways for the buses (oneway:bus=no: the Promenade, the Talstrasse): a lane each way, the cars'
  // in the one-way direction, the buses' against it (bus:lanes:backward=designated: a marked bus lane)
  const busBack = oneway && (t['oneway:bus'] === 'no' || t['oneway:psv'] === 'no');
  const busLane = busBack && /designated/.test(t[t.oneway === '-1' ? 'bus:lanes:forward' : 'bus:lanes:backward'] || '');
  // (a lane each way: ~6.5 m curb to curb, as on the Promenade's one-way stretches)
  const width = num(t.width) ?? (busBack ? 6.5 : Math.max(WIDTH[base] ?? 3, lanes * 3));
  const sidewalk = sidewalksOf(t, base);
  // Tram streets (none in Davos): the tracks share the carriageway (OSM railway=tram ways run along them)
  const rounded = !bridge && !tunnel && kind !== 'steps' && e.nodes && e.nodes.length === pts.length ? roundBends(pts, e.nodes, kind) : null;
  const kept = rounded ? rounded.map((q) => q.p) : rdp(pts, 0.5);
  const record = { id: `w${e.id}`, pts: flat(kept), bridge, tunnel, layer, name: t.name || '', width: r1(width), lanes, oneway, reverse: t.oneway === '-1', kind, nodeIds: e.nodes || [] };
  if (busBack) record.bus = busLane ? 2 : 1;
  if (sidewalk) record.sidewalk = sidewalk;
  if (t.footway === 'sidewalk') record.sidewalkWay = 1;
  roads.push(record);
  noteLevel(e, pts, rounded ? [] : kept, record, bridge, tunnel);
  if (DRIVABLE.has(kind) && (!tunnel || isDrivableTunnel(t.name)) && t.access !== 'no' && t.motor_vehicle !== 'no' && e.nodes && e.nodes.length === e.geometry.length) {
    // (rounded ways: the graph is cut at the kept nodes of the rounded line; `null` marks a point of an arc)
    drivable.push({ name: t.name || '', width: r1(width), lanes, dir: !oneway ? 0 : t.oneway === '-1' ? -1 : 1,
      nodes: rounded ? rounded.map((q) => q.id) : e.nodes, pts: rounded ? kept : pts, bridge, bus: busBack ? (busLane ? 2 : 1) : 0, sidewalk });
  }
}

// --- Street centreline graph: ways cut at every node shared by two ways (and at their ends) ----------------------------
// links: [node a, node b, name index, width, lanes, direction (1: a -> b, -1: b -> a, 0: both), inner shape points [x, z, ...],
//         1 when on a bridge (else 0 or absent), 1 on a one-way street the buses drive both ways (2: on a marked bus lane),
//         the sidewalks' widths [left, right] (or absent)]
const roadGraph = (() => {
  const uses = new Map();
  for (const w of drivable) for (const id of new Set(w.nodes)) if (id != null) uses.set(id, (uses.get(id) || 0) + 1);
  const ids = new Map();
  const nodes = [];
  const names = [];
  const nameIds = new Map();
  const nodeOf = (id, p) => { if (!ids.has(id)) { ids.set(id, nodes.length / 2); nodes.push(r1(p[0]), r1(p[1])); } return ids.get(id); };
  const nameOf = (n) => { if (!nameIds.has(n)) { nameIds.set(n, names.length); names.push(n); } return nameIds.get(n); };
  const links = [];
  for (const w of drivable) {
    let start = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      const last = i === w.nodes.length - 1;
      if (!last && (w.nodes[i] == null || (uses.get(w.nodes[i]) < 2 && w.nodes[i] !== w.nodes[0]))) continue;
      if (w.nodes[i] === w.nodes[start]) { start = i; continue; }
      const seg = w.pts.slice(start, i + 1);
      const inner = rdp(seg, 0.4).slice(1, -1).flatMap(([x, z]) => [r1(x), r1(z)]);
      const link = [nodeOf(w.nodes[start], seg[0]), nodeOf(w.nodes[i], seg[seg.length - 1]), nameOf(w.name), w.width, w.lanes, w.dir, inner];
      if (w.bridge || w.bus || w.sidewalk) link.push(w.bridge ? 1 : 0); // on a bridge deck (heights: the matching roads[].ys)
      if (w.bus || w.sidewalk) link.push(w.bus); // a one-way street the buses also drive against (2: on a marked bus lane)
      if (w.sidewalk) link.push(w.sidewalk); // its sidewalks, [left, right] of a -> b (roads[].sidewalk)
      links.push(link);
      start = i;
    }
  }
  return { nodes, links, names };
})();

// --- Water, parks & woods ------------------------------------------------------------------------------------------------
const water = [];
const parks = [];
for (const e of osm.elements) {
  const t = e.tags || {};
  if (e.type === 'node') continue;
  const isWater = t.natural === 'water' || /^(riverbank|dock)$/.test(t.waterway || '');
  const isWood = /^(wood|scrub)$/.test(t.natural || '') || t.landuse === 'forest';
  const isPark = isWood || /^(park|garden|playground|pitch)$/.test(t.leisure || '') ||
    /^(grass|recreation_ground|cemetery|village_green|meadow)$/.test(t.landuse || '') || t.natural === 'grassland';
  if (!isWater && !isPark) continue;
  if (t.location === 'underground' || t.tunnel === 'culvert') continue;
  for (const p of polygons(e)) {
    const ring = clipToFrame(cleanRing(p.ring, 0.6));
    if (ring.length < 3 || Math.abs(ringArea(ring)) < 20) continue;
    const holes = p.holes.map((h) => clipToFrame(cleanRing(h, 0.6))).filter((h) => h.length >= 3).map(flat);
    if (isWater) water.push({ id: `water${water.length}`, ring: flat(ring), holes, name: t.name || '', kind: t.water || t.waterway || 'water' });
    else parks.push({ id: `${e.type[0]}${e.id}`, ring: flat(ring), holes, name: t.name || '', kind: isWood ? 'wood' : t.leisure || t.landuse || t.natural });
  }
}

const terrainPatches = []; // bridgeheads where the terrain must rise to the surveyed road ({ x, z, h, r })
// --- Bridge decks ---------------------------------------------------------------------------------------------------------
// The terrain model is bare earth: under a bridge it holds the river or the tracks below. Nodes shared with a way at
// ground level are anchored to the terrain; the spans take the surface model sampled at their nodes
// (tools/fetch-bridge-decks.mjs, swissSURFACE3D); nodes without a (credible) sample are solved on the graph of bridge
// ways, interpolated harmonically (inverse-length weights), i.e. linearly along each chain.
{
  const DECKS = path.join(CACHE, 'bridge_decks.json');
  const surveyed = fs.existsSync(DECKS) ? JSON.parse(fs.readFileSync(DECKS, 'utf8')).decks : {};
  const pos = new Map(), adj = new Map(), majorDeck = new Set();
  // Under a tree the surface model reads the crown, not the deck (the Schanzengrabenpromenade, a boardwalk along the
  // canal, measured 11-19 m up): samples more than 3 m up within a municipal tree's crown are ignored.
  const TREE_CELL = 32, crowns = new Map();
  const treeFile = path.join(CACHE, 'davos_trees.json');
  for (const t of fs.existsSync(treeFile) ? JSON.parse(fs.readFileSync(treeFile, 'utf8')).trees : []) {
    if (!t.crown) continue;
    const { x, z } = lv95ToWorld(t.E, t.N), k = `${Math.floor(x / TREE_CELL)}/${Math.floor(z / TREE_CELL)}`;
    if (!crowns.has(k)) crowns.set(k, []);
    crowns.get(k).push({ x, z, r: t.crown / 2 });
  }
  const underCrown = ([x, z]) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const t of crowns.get(`${Math.floor(x / TREE_CELL) + i}/${Math.floor(z / TREE_CELL) + j}`) || []) if (Math.hypot(t.x - x, t.z - z) < t.r) return true;
    }
    return false;
  };
  const link = (a, b, w) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, w]); };
  for (const way of deckWays) {
    way.nodes.forEach((id, i) => { pos.set(id, way.pts[i]); if (!way.minor) majorDeck.add(id); });
    for (let i = 1; i < way.nodes.length; i++) {
      const w = 1 / Math.max(0.5, Math.hypot(way.pts[i][0] - way.pts[i - 1][0], way.pts[i][1] - way.pts[i - 1][1]));
      link(way.nodes[i - 1], way.nodes[i], w); link(way.nodes[i], way.nodes[i - 1], w);
    }
  }
  const ground = (id) => gridHeight(TERRAIN, pos.get(id)[0], pos.get(id)[1]);
  const pip = (ring, x, z) => { let inside = false; for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) { if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < ((ring[j] - ring[i]) * (z - ring[i + 1])) / (ring[j + 1] - ring[i + 1]) + ring[i]) inside = !inside; } return inside; };
  const inWater = ([x, z]) => water.some((w) => pip(w.ring, x, z) && !w.holes.some((h) => pip(h, x, z)));
  const h = new Map(), anchored = new Set();
  let measured = 0, canopy = 0;
  for (const [id] of adj) if (Number.isFinite(surveyed[id]) && surveyed[id] - FRAME.H0 - ground(id) > 3 && underCrown(pos.get(id))) { delete surveyed[id]; canopy++; }
  for (const [id, edges] of adj) {
    // Abutments: where a bridge meets a way at ground level (on land: tram tracks mapped across a bridge without the
    // bridge tag don't count), and the loose ends of bridge chains. They sit at ground level, except that
    // swissALTI3D removes bridges and interpolates the ground beneath them, which also pulls the bridgeheads down
    // towards the river: there the survey, when credible, sets the abutment, and the terrain is raised to meet it.
    const loose = new Set(edges.map(([b]) => b)).size < 2;
    const onLand = !inWater(pos.get(id));
    const junction = onLand && (groundNodes.has(id) || (!majorDeck.has(id) && minorGroundNodes.has(id)));
    if (lidAnchors.has(id)) { anchored.add(id); h.set(id, lidAnchors.get(id)); continue; } // (on the lid of an underpass)
    if (junction || loose) {
      anchored.add(id);
      const g = ground(id), survey = surveyed[id] - FRAME.H0;
      if (survey - g > 0.4 && survey - g < 4) {
        h.set(id, survey);
        if (onLand) terrainPatches.push({ x: r1(pos.get(id)[0]), z: r1(pos.get(id)[1]), h: r2(survey), r: 15 });
      } else h.set(id, g);
    } else if (Number.isFinite(surveyed[id])) { anchored.add(id); h.set(id, Math.max(surveyed[id] - FRAME.H0, ground(id))); measured++; }
  }
  // Components without any anchor (e.g. a footbridge mapped on its own) start from their highest ground point
  const seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp = [], stack = [start];
    seen.add(start);
    while (stack.length) { const id = stack.pop(); comp.push(id); for (const [b] of adj.get(id)) if (!seen.has(b)) { seen.add(b); stack.push(b); } }
    const top = Math.max(...comp.map(ground));
    for (const id of comp) if (!h.has(id)) h.set(id, comp.some((c) => anchored.has(c)) ? ground(id) : top);
  }
  const solve = () => {
    for (let iter = 0; iter < 4000; iter++) {
      let change = 0;
      for (const [id, edges] of adj) {
        if (anchored.has(id)) continue;
        let sw = 0, sh = 0;
        for (const [b, w] of edges) { sw += w; sh += w * h.get(b); }
        const v = sh / sw;
        change = Math.max(change, Math.abs(v - h.get(id)));
        h.set(id, v);
      }
      if (change < 0.001) break;
    }
  };
  // Samples that disagree with their neighbours (a bus, a branch, a gap in the surface model) by more than a bridge's
  // possible gradient are dropped and re-solved from the rest.
  let rejected = 0;
  for (let pass = 0; pass < 3; pass++) {
    solve();
    for (const [id, edges] of adj) {
      if (!anchored.has(id) || !Number.isFinite(surveyed[id])) continue;
      let sw = 0, sh = 0, len = 0;
      for (const [b, w] of edges) { sw += w; sh += w * h.get(b); len += 1 / w; }
      if (Math.abs(h.get(id) - sh / sw) > 1.5 + 0.12 * (len / edges.length)) { anchored.delete(id); rejected++; }
    }
  }
  solve();
  // Sidewalks mapped as bridge ways of their own (footway=sidewalk) carry on the deck of the carriageway they run along.
  // Where they meet the sidewalk on the ground on top of a retaining wall, which the 2 m survey smears into a slope,
  // they are anchored far below it (the Lindenhofstrasse's eastern sidewalk: 3.7 m at its end, against a deck at
  // 10.6 m, a wall across the Uraniastrasse under it): their nodes take the carriageway's deck, where the surface model
  // agrees (a sidewalk beside a deck on another level, under a viaduct, keeps its own).
  const carriageways = [];
  for (const way of deckWays) if (!way.minor) for (let i = 1; i < way.nodes.length; i++) carriageways.push([way.nodes[i - 1], way.nodes[i]]);
  const deckAt = (id) => Math.max(h.get(id), ground(id));
  const carriagewayDeck = ([x, z], ux, uz) => {
    let best = Infinity, y = NaN;
    for (const [a, b] of carriageways) {
      const [ax, az] = pos.get(a), [bx, bz] = pos.get(b), dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 1 || Math.abs(ux * dz - uz * dx) > 0.26 * L) continue;
      const t = ((x - ax) * dx + (z - az) * dz) / (L * L);
      if (t < -0.2 || t > 1.2) continue;
      const tc = Math.max(0, Math.min(1, t)), d = Math.hypot(ax + tc * dx - x, az + tc * dz - z);
      if (d < 12 && d < best) { best = d; y = deckAt(a) + tc * (deckAt(b) - deckAt(a)); }
    }
    return y;
  };
  let sidewalks = 0;
  for (const way of deckWays) {
    if (!way.sidewalk) continue;
    let lifted = false;
    way.nodes.forEach((id, i) => {
      const j = i ? i - 1 : 1, [x, z] = way.pts[i], dx = x - way.pts[j][0], dz = z - way.pts[j][1], L = Math.hypot(dx, dz) || 1;
      const y = carriagewayDeck(way.pts[i], dx / L, dz / L);
      if (!(y - deckAt(id) > 1) || !(Math.abs(surveyed[id] - FRAME.H0 - y) < 1)) return;
      // The ends of the sidewalk lie on the smeared wall top: the ground rises to meet them over a few metres
      if ((i === 0 || i === way.nodes.length - 1) && anchored.has(id)) terrainPatches.push({ x: r1(x), z: r1(z), h: r2(y), r: 6 });
      h.set(id, y);
      lifted = true;
    });
    if (lifted) sidewalks++;
  }
  const smooth = h;
  for (const way of deckWays) {
    // Decks never dip below the terrain they cross; heights in the world frame (above FRAME.H0)
    way.record.ys = way.kept.map((i, k) => {
      // The saved centreline is rounded to decimetres; sample that exact position so steep slopes
      // cannot lift the rendered terrain above the stored bridge deck.
      const x = way.record.pts[k * 2], z = way.record.pts[k * 2 + 1];
      return Math.ceil(Math.max(smooth.get(way.nodes[i]), gridHeight(TERRAIN, x, z)) * 100) / 100;
    });
  }
  log(`bridge decks: ${deckWays.length} ways, ${adj.size} nodes (${measured - rejected} surveyed, ${rejected} rejected samples, ${canopy} under trees), ${terrainPatches.length} bridgeheads raised, ${sidewalks} sidewalks onto their carriageway's deck`);
}

// --- Municipalities (OSM admin_level 8: Davos and its neighbours; the Fraktionen are only mapped as place nodes) -----------------------------------------------------------------------------
const areas = [];
for (const e of readJson('osm_davos_areas.json').elements) {
  const name = e.tags?.name;
  if (!name) continue;
  const polys = polygons(e).map((p) => ({ ring: flat(cleanRing(p.ring, 2)), holes: p.holes.map((h) => flat(cleanRing(h, 2))) }));
  if (polys.length) areas.push({ id: name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '_'), name, polygons: polys });
}

// --- Landmarks: footprints of named buildings (by OSM name, or by id when unnamed) ------------------------------------------------------------------------------
const LANDMARKS = {
  'Kongresszentrum': ['Kongresszentrum'],
  'Kirchner Museum': ['Kirchner Museum'],
  'St. Johann': ['St. Johann', 'Reformierte Kirche'],
  'Rathaus Davos': ['Rathaus Davos'],
  'Eisstadion Davos': ['Eisstadion Davos'],
  'Marienkirche': ['Marienkirche'],
  'Herz-Jesu-Kirche': ['Herz-Jesu-Kirche'],
  'Berghotel Schatzalp': ['Berghotel Schatzalp', 'Schatzalp'],
  'Schatzalpbahn Talstation': ['Schatzalpbahn Talstation'],
  'Hotel Seehof Davos': ['Hotel Seehof Davos'],
  'Hard Rock Hotel Davos': ['Hard Rock Hotel Davos'],
  'Frauenkirch': ['Frauenkirch'],
  'SLF': ['WSL-Institut für Schnee- und Lawinenforschung SLF'],
  'Waldhotel Davos': ['Waldhotel Davos']
};
const landmarks = {};
for (const b of buildings) {
  const key = Object.keys(LANDMARKS).find((k) => LANDMARKS[k].includes(b.name) || LANDMARKS[k].includes(b.id));
  if (!key) continue;
  const pts = [];
  for (let i = 0; i < b.ring.length; i += 2) pts.push([b.ring[i], b.ring[i + 1]]);
  const bb = bbox(pts);
  const area = Math.abs(ringArea(pts));
  if (landmarks[key] && landmarks[key].area >= area) continue;
  landmarks[key] = { x: r1((bb.x0 + bb.x1) / 2), z: r1((bb.z0 + bb.z1) / 2), w: r1(bb.x1 - bb.x0), d: r1(bb.z1 - bb.z0), h: b.h, area: Math.round(area), ring: b.ring };
}

// --- Municipal tree cadastre (none for Davos: the OSM trees stay)  ----------------------------------------------
// Height from the surveyed crown diameter (broad urban limes, planes & chestnuts: roughly 1.3x the crown + trunk),
// else from the planting year.
const TREES = path.join(CACHE, 'davos_trees.json');
if (fs.existsSync(TREES)) {
  const year = new Date().getFullYear();
  const { trees: city } = JSON.parse(fs.readFileSync(TREES, 'utf8'));
  trees = city.map((g) => {
    const { x, z } = lv95ToWorld(g.E, g.N);
    const h = g.crown ? Math.min(30, 3 + g.crown * 1.3) : g.planted ? Math.min(24, 4 + (year - g.planted) * 0.4) : 10;
    return { x: r1(x), z: r1(z), h: r1(h), crown: g.crown ?? null, street: g.category === 'Strassenbaum' };
  }).filter((t) => inFrame(t.x, t.z));
  log(`using ${trees.length} municipal trees`);
}

const data = {
  meta: {
    name: FRAME.name, city: 'Davos',
    bounds: WORLD_BOUNDS,
    lv95: FRAME.lv95,
    frame: `x = LV95 east - ${FRAME.E0}, z = ${FRAME.N0} - LV95 north, metres; y = height - ${FRAME.H0} m a.s.l.`,
    coordinateSystem: 'x east, z south, metres (Swiss LV95 grid)',
    origin: { E: FRAME.E0, N: FRAME.N0, H: FRAME.H0 },
    sources: [
      { name: 'OpenStreetMap contributors', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors' },
      { name: 'swisstopo swissALTI3D (terrain, data/davos-terrain.bin)', license: 'OGD swisstopo', attribution: '© swisstopo' },
      { name: 'swisstopo swissBUILDINGS3D 3.0 (buildings, streamed)', license: 'OGD swisstopo', attribution: '© swisstopo' }
    ],
    areas,
    counts: { buildings: buildings.length, roads: roads.length, water: water.length, parks: parks.length, railways: railways.length, trees: trees.length, signals: signals.length, fountains: fountains.length, tramStops: tramStops.length, stations: stations.length, loipen: loipen.length }
  },
  buildings, roads, water, parks, railways, trees, signals, fountains, tramStops, stations, loipen, landmarks, roadGraph, terrainPatches, underpasses
};
fs.writeFileSync(OUT, `// js/davos-geodata.js — GENERATED by tools/build-davos-geodata.mjs, do not edit by hand.\n// Davos (Landwassertal and Dischma) in the LV95 world frame of js/davos-frame.js. © OpenStreetMap contributors (ODbL), swisstopo.\nexport const DAVOS_DATA = ${JSON.stringify(data)};\n`);
log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`, JSON.stringify(data.meta.counts));
log('landmarks:', Object.keys(landmarks).join(', '), '| missing:', Object.keys(LANDMARKS).filter((k) => !landmarks[k]).join(', '));
log('areas:', areas.map((a) => a.name).join(', '));
