// tools/underpass.mjs — the short road underpasses beneath the RhB (the Hofstrasse under the station yard of Davos
// Platz), shared by tools/build-davos-terrain.mjs and tools/build-davos-geodata.mjs.
// OSM maps them as a road in a tunnel, which the engine leaves out: the street simply ended at a bank in front of the
// tracks. An 8 m terrain grid can't hold a 6 m road beneath the ground either, so an underpass is built the other way
// round: the terrain tool cuts the road's trench through, and the geodata tool opens the road and carries what crosses
// above (the tracks, the Grischunaweg) over the cut on decks, under which js/city-grid.js lays the lid and the walls.
import { lonLatToWorld, WORLD_BOUNDS } from '../js/davos-frame.js';

const DRIVE = /^(primary|secondary|tertiary|residential|unclassified|living_street|service)(_link)?$/;
const MAX_LENGTH = 60; // (m) longer ones are real tunnels
const isOn = (v) => !!v && v !== 'no';
const world = (e) => e.geometry.map((p) => lonLatToWorld(p.lon, p.lat));
const crosses = (a, b, c, d) => {
  const den = (b.x - a.x) * (d.z - c.z) - (b.z - a.z) * (d.x - c.x);
  if (Math.abs(den) < 1e-9) return false;
  const t = ((c.x - a.x) * (d.z - c.z) - (c.z - a.z) * (d.x - c.x)) / den, u = ((c.x - a.x) * (b.z - a.z) - (c.z - a.z) * (b.x - a.x)) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
};

/** The drivable ways in a short tunnel crossing a metre-gauge track: { way, a, b, len, ux, uz, half } */
export function findUnderpasses(osm) {
  const ways = osm.elements.filter((e) => e.type === 'way' && e.geometry);
  const rails = ways.filter((e) => e.tags?.railway === 'narrow_gauge').map(world);
  const out = [];
  for (const way of ways) {
    const t = way.tags || {};
    if (!DRIVE.test(t.highway || '') || !isOn(t.tunnel) || t.tunnel === 'building_passage' || t.access === 'private' || t.access === 'no') continue;
    const pts = world(way), a = pts[0], b = pts[pts.length - 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len > MAX_LENGTH || len < 1) continue;
    const [x0, z0, x1, z1] = WORLD_BOUNDS;
    if (a.x < x0 || a.x > x1 || a.z < z0 || a.z > z1) continue;
    if (!rails.some((r) => r.some((p, i) => i > 0 && pts.some((q, k) => k > 0 && crosses(r[i - 1], p, pts[k - 1], q))))) continue;
    out.push({ way, a, b, len, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len, half: (parseFloat(t.width) || 6) / 2 });
  }
  return out;
}

/** The way that carries on from node `id` away from the underpass, as world points walking outward over `reach` m */
export function approachFrom(osm, underpass, id, reach) {
  let best = [];
  for (const e of osm.elements) {
    if (e.type !== 'way' || !e.geometry || e === underpass.way || !DRIVE.test(e.tags?.highway || '') || !e.nodes) continue;
    const at = e.nodes.indexOf(id);
    if (at < 0) continue;
    const pts = world(e);
    for (const walk of [pts.slice(at), pts.slice(0, at + 1).reverse()]) {
      const named = e.tags.name === underpass.way.tags.name;
      if (walk.length >= 2 && (named || !best.length) && (named || best.named === undefined)) { best = walk; best.named = named; if (named) break; }
    }
    if (best.named) break;
  }
  const out = best.length ? [best[0]] : [];
  let left = reach;
  for (let i = 1; i < best.length && left > 0; i++) {
    const p = best[i - 1], q = best[i], L = Math.hypot(q.x - p.x, q.z - p.z), f = Math.min(1, left / (L || 1));
    out.push({ x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f });
    left -= L;
  }
  return out;
}
