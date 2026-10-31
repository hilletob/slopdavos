import assert from 'node:assert/strict';
import test from 'node:test';
import { DETAIL_HOUSES, frame, toWorld } from '../js/detail-houses-data.js';
import { lv95ToWorld } from '../js/davos-frame.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

test('Dischmastrasse 19 stands on its footprint, its balcony gable towards the Dischmastrasse, the ridge east–west', () => {
  const house = DETAIL_HOUSES.find((h) => h.id === 'dischmastrasse-19');
  assert.ok(house);
  const fr = frame(house);
  // The address point lies inside, near the centre; the excluded swissBUILDINGS3D building too
  const a = lv95ToWorld(...house.lv95);
  assert.ok(Math.hypot(a.x - fr.cx, a.z - fr.cz) < 5, 'the address point');
  assert.ok(Math.hypot(house.exclude.x - fr.cx, house.exclude.z - fr.cz) < 1, 'the swissBUILDINGS3D building');
  assert.ok(Math.abs(fr.length - 11.2) < 0.2 && Math.abs(fr.depth - 10.2) < 0.2, `${fr.length} × ${fr.depth}`);
  assert.ok(fr.u[0] > 0.9, 'the ridge runs west to east');
  assert.ok(fr.v[1] > 0.9, 'the front with the lean-to faces south');
  // Of the four faces the west gable (local −x) is the one nearest the Dischmastrasse, and the fence runs between them,
  // parallel to the street
  const street = DAVOS_DATA.roads.filter((r) => r.name === 'Dischmastrasse');
  const distance = ([x, z]) => {
    let best = Infinity;
    for (const r of street) for (let i = 2; i < r.pts.length; i += 2) {
      const ax = r.pts[i - 2], az = r.pts[i - 1], dx = r.pts[i] - ax, dz = r.pts[i + 1] - az, L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
    }
    return best;
  };
  const faces = { west: [-fr.length / 2, 0], east: [fr.length / 2, 0], south: [0, fr.depth / 2], north: [0, -fr.depth / 2] };
  const d = Object.fromEntries(Object.entries(faces).map(([k, [x, z]]) => [k, distance(toWorld(fr, x, z))]));
  assert.equal(Object.entries(d).sort((p, q) => p[1] - q[1])[0][0], 'west', JSON.stringify(d));
  const [[a0, a1]] = house.fence; // the street segment
  const f0 = distance(toWorld(fr, ...a0)), f1 = distance(toWorld(fr, ...a1));
  assert.ok(f0 > 0.5 && f1 > 0.5 && f0 < d.west && f1 < d.west + 3, `fence ${f0.toFixed(1)} / ${f1.toFixed(1)} m from the street`);
});
