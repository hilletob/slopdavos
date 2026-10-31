import assert from 'node:assert/strict';
import test from 'node:test';
import { TRAFFIC_SIGNS } from '../js/traffic-signs-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

const signs = TRAFFIC_SIGNS.signs;
const KINDS = new Set(['stop', 'giveway', 'noentry', 'exceptbus', 'oneway', 'crosswalk', 'parking', 'busstop', 'zone30', 'gen50', 'city', 'citylocal']);
const DRIVABLE = /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)(_link)?$/;

// Distance from (x, z) to the nearest centreline segment of `roads`, with that segment's unit direction
function nearest(roads, x, z) {
  let best = { d: Infinity };
  for (const r of roads) {
    for (let i = 2; i < r.pts.length; i += 2) {
      const ax = r.pts[i - 2], az = r.pts[i - 1], dx = r.pts[i] - ax, dz = r.pts[i + 1] - az, L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < best.d) best = { d, road: r, ux: dx / Math.sqrt(L2), uz: dz / Math.sqrt(L2) };
    }
  }
  return best;
}

test('the signs: known SSV plates on posts inside the map, a sensible number of each', () => {
  assert.ok(signs.length > 150 && signs.length < 800, `${signs.length} posts`);
  const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
  const count = {};
  for (const s of signs) {
    assert.ok(s.x > minX && s.x < maxX && s.z > minZ && s.z < maxZ, `post ${s.x}, ${s.z} in the map`);
    assert.ok(Number.isFinite(s.yaw) && Math.abs(s.yaw) <= Math.PI + 1e-3, 'yaw');
    assert.ok(s.plates.length >= 1 && s.plates.length <= 2 && s.t === s.plates[0]);
    for (const p of s.plates) { assert.ok(KINDS.has(p), p); count[p] = (count[p] || 0) + 1; }
    if (s.t === 'busstop' || s.t === 'gen50') assert.ok(s.text, `${s.t} has a name`);
  }
  for (const k of ['giveway', 'noentry', 'oneway', 'crosswalk', 'busstop', 'parking']) assert.ok(count[k] >= 5, `${k}: ${count[k]}`);
  // Rule-made give-ways stay a minority next to the ones mapped in OSM
  assert.ok(signs.filter((s) => s.t === 'giveway' && s.src === 'rule').length < signs.filter((s) => s.t === 'giveway' && s.src === 'osm').length);
});

test('no post stands on a carriageway or right next to another', () => {
  const roads = DAVOS_DATA.roads.filter((r) => DRIVABLE.test(r.kind) && !r.tunnel && !r.bridge);
  for (const s of signs) {
    const n = nearest(roads, s.x, s.z);
    assert.ok(n.d >= (n.road.width || 6) / 2 + 0.2, `${s.t} at ${s.x}, ${s.z} is ${n.d.toFixed(2)} m from ${n.road.name || n.road.id}`);
  }
  for (let i = 0; i < signs.length; i++) for (let j = i + 1; j < signs.length; j++) {
    assert.ok(Math.hypot(signs[i].x - signs[j].x, signs[i].z - signs[j].z) >= 1.5, `posts ${i} and ${j} apart`);
  }
});

test('the plates face along their road, the traffic they are meant for', () => {
  const byName = new Map();
  for (const r of DAVOS_DATA.roads) if (r.name && DRIVABLE.test(r.kind)) { if (!byName.has(r.name)) byName.set(r.name, []); byName.get(r.name).push(r); }
  let checked = 0;
  for (const s of signs) {
    if (!s.road || !byName.has(s.road) || s.t === 'parking') continue;
    const n = nearest(byName.get(s.road), s.x, s.z);
    if (n.d > 12) continue;
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    assert.ok(Math.abs(fx * n.ux + fz * n.uz) > 0.5, `${s.t} on ${s.road} at ${s.x}, ${s.z} faces along the road`);
    checked++;
  }
  assert.ok(checked > 150, `${checked} checked`);
});

test('one-way Promenade and Talstrasse: Einbahnstrasse where they begin, Einfahrt verboten ausgenommen Bus where they end', () => {
  for (const road of ['Promenade', 'Talstrasse']) {
    assert.ok(signs.some((s) => s.t === 'oneway' && s.road === road), `${road}: Einbahnstrasse`);
    const ends = signs.filter((s) => s.t === 'noentry' && s.road === road);
    assert.ok(ends.length >= 1, `${road}: Einfahrt verboten`);
    for (const s of ends) assert.deepEqual(s.plates, ['noentry', 'exceptbus'], `${road}: the buses may come the other way`);
  }
  // Streets the buses don't drive against carry no bus plate
  assert.ok(signs.some((s) => s.t === 'noentry' && s.plates.length === 1));
});

test('every VBD stop in the valley floor has its yellow plate, each zone 30 entry its sign', async () => {
  const { VBD_DATA } = await import('../js/vbd-data.js');
  const names = new Set();
  for (const v of VBD_DATA.variants) for (const st of v.stops || []) names.add(st.name);
  const signed = new Set(signs.filter((s) => s.t === 'busstop').map((s) => s.text));
  const missing = [...names].filter((n) => !signed.has(n));
  assert.ok(missing.length <= names.size * 0.15, `stops without a plate: ${missing.join(', ')}`);
  for (const s of signs.filter((x) => x.t === 'zone30')) assert.equal(s.back, 'zone30end', 'Ende Zone on the back');
});

test('the VBD stop plates list the lines stopping there with their destinations, in the VBD\'s numbering', () => {
  const stops = signs.filter((s) => s.t === 'busstop');
  for (const s of stops) {
    assert.ok(s.label && !/^Davos (Platz|Dorf),/.test(s.label), `${s.text}: short name ${s.label}`);
    assert.ok(Array.isArray(s.lines) && s.lines.length >= 1 && s.lines.length <= 6, `${s.text}: lines`);
    for (const [line, dest] of s.lines) assert.ok(/^\d{1,2}$/.test(line) && dest, `${s.text}: ${line} ${dest}`);
    if (s.mark) assert.equal(s.mark.length, 4);
  }
  // Parsennbahn (Davos Dorf): line 1 both ways, towards Glaris and towards Laret / Wolfgang
  const parsenn = stops.filter((s) => s.text === 'Parsennbahn');
  assert.ok(parsenn.length >= 2);
  assert.ok(parsenn.every((s) => s.lines.some(([l]) => l === '1')));
  // Benches and the zigzag kerb line where there is room, not everywhere
  const benches = stops.filter((s) => s.bench).length, marks = stops.filter((s) => s.mark).length;
  assert.ok(benches > 10 && benches < stops.length * 0.7, `${benches} benches`);
  assert.ok(marks > stops.length * 0.5, `${marks} zigzags`);
});
