import assert from 'node:assert/strict';
import test from 'node:test';
import { VBD_DATA } from '../js/vbd-data.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

test('the VBD lines run their mapped routes through Davos, with named stops in order', () => {
  const refs = new Set(VBD_DATA.variants.map((v) => v.ref));
  for (const ref of ['301', '303', '304', '308', '312', '313']) assert.ok(refs.has(ref), `line ${ref}`);
  const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
  for (const v of VBD_DATA.variants) {
    assert.match(v.colour, /^#[0-9A-F]{6}$/, `${v.ref} colour`);
    assert.ok(v.to && v.from, `${v.ref} from / to`);
    for (let i = 0; i < v.pts.length; i += 2) {
      assert.ok(v.pts[i] >= minX - 6 && v.pts[i] <= maxX + 6 && v.pts[i + 1] >= minZ - 6 && v.pts[i + 1] <= maxZ + 6, `${v.ref} inside the map`);
    }
    assert.ok(v.stops.length >= 2, `${v.ref} ${v.to}: stops`);
    for (let k = 1; k < v.stops.length; k++) assert.ok(v.stops[k].s > v.stops[k - 1].s, `${v.ref}: stops in driving order`);
    assert.ok(v.stops.every((s) => s.name && s.s >= 0 && s.s <= v.len + 0.1), `${v.ref}: named stops on the route`);
  }
  // The town line serves both stations
  const main = VBD_DATA.variants.filter((v) => v.ref === '301').flatMap((v) => v.stops.map((s) => s.name));
  assert.ok(main.some((n) => /Davos Platz/.test(n)) && main.some((n) => /Davos Dorf/.test(n)), 'line 301 serves Platz and Dorf');
});

test('the VBD routes run along the rounded road centrelines of the geodata, not the raw OSM polylines', async () => {
  const { DAVOS_DATA } = await import('../js/davos-geodata.js');
  // every route vertex lies on (within 0.3 m of) some road's centreline: the buses keep to the asphalt round the bends
  const cells = new Map();
  const key = (x, z) => `${Math.floor(x / 50)}:${Math.floor(z / 50)}`;
  for (const r of DAVOS_DATA.roads) {
    for (let i = 0; i + 3 < r.pts.length; i += 2) {
      const seg = [r.pts[i], r.pts[i + 1], r.pts[i + 2], r.pts[i + 3]];
      const keys = new Set([key(seg[0], seg[1]), key(seg[2], seg[3])]);
      for (const k of keys) { if (!cells.has(k)) cells.set(k, []); cells.get(k).push(seg); }
    }
  }
  const onRoad = (x, z) => {
    for (const [ax, az, bx, bz] of cells.get(key(x, z)) || []) {
      const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
      if (Math.hypot(ax + ex * t - x, az + ez * t - z) < 0.3) return true;
    }
    return false;
  };
  let off = 0, total = 0;
  for (const v of VBD_DATA.variants) {
    for (let i = 0; i < v.pts.length; i += 2) { total++; if (!onRoad(v.pts[i], v.pts[i + 1])) off++; }
    // arcs: the routes carry the fillets' points (more than a few per kilometre), so they are not the raw polylines
    assert.ok(v.pts.length / 2 > v.len / 40, `${v.ref} ${v.to}: ${v.pts.length / 2} points on ${v.len} m`);
  }
  assert.ok(off <= total * 0.02, `${off} of ${total} route points off the roads' centrelines`);
});
