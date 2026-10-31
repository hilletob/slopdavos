import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DETAIL_HOUSES, facadeLayout, facadeUV, frame, scanRoofY, toWorld } from '../js/detail-houses-data.js';
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

test('Dischmastrasse 19: built to the scan — within its footprint, under its roof, its windows on its walls', () => {
  const house = DETAIL_HOUSES.find((h) => h.id === 'dischmastrasse-19');
  const m = house.model;
  assert.ok(m);
  const fr = frame(house);
  // The walls lie inside the footprint (the surveyed outline reaches out to the eaves); 8.43 × 9.75 m
  const inside = ([x, z]) => {
    let c = false;
    const f = house.footprint;
    for (let i = 0, j = f.length - 1; i < f.length; j = i++) {
      if ((f[i][1] > z) !== (f[j][1] > z) && x < (f[j][0] - f[i][0]) * (z - f[i][1]) / (f[j][1] - f[i][1]) + f[i][0]) c = !c;
    }
    return c;
  };
  for (const x of m.walls.x) for (const z of m.walls.z) assert.ok(inside(toWorld(fr, x, z)), `wall corner ${x}, ${z}`);
  assert.ok(Math.abs(m.walls.x[1] - m.walls.x[0] - 8.43) < 0.05 && Math.abs(m.walls.z[1] - m.walls.z[0] - 9.75) < 0.05);
  // The roof covers the walls and runs out about as far as the footprint; 18.6°, the ridge north of the middle
  const { roof, walls } = m;
  assert.ok(roof.x[0] < walls.x[0] - 0.8 && roof.x[1] > walls.x[1] + 0.8 && roof.z[0] < walls.z[0] - 0.5 && roof.z[1] > walls.z[1] + 0.5);
  assert.ok(Math.abs(roof.x[1] - roof.x[0] - fr.length) < 0.6, `roof length ${roof.x[1] - roof.x[0]} vs ${fr.length}`);
  assert.ok(Math.abs(Math.atan(roof.slope) * 180 / Math.PI - 18.6) < 0.3 && roof.ridgeZ < 0 && roof.ridgeZ > walls.z[0]);
  assert.ok(scanRoofY(roof, walls.z[0]) > 6 && scanRoofY(roof, walls.z[1]) > 6);
  // The annexes stand against the walls, under the roof's or their own roofs
  assert.equal(m.leanTo.x[0], walls.x[0]);
  assert.equal(m.porch.x[0], walls.x[1]);
  assert.equal(m.laube.x[0], walls.x[1]);
  assert.ok(m.laube.x[1] < roof.x[1] && m.stair.z[0] === m.landing.z[1] && m.balcony.x[1] === walls.x[0]);
  // Each window within the extent of its face
  for (const [face, a0, a1, y0, y1] of m.windows) {
    assert.ok(['S', 'E', 'W', 'N'].includes(face) && a0 < a1 && y0 < y1 && y0 >= 0 && y1 < roof.ridgeY, `${face} ${a0}`);
  }
});

test('Dischmastrasse 19: the facade atlas holds every bake at one scale, small enough for phones', () => {
  const house = DETAIL_HOUSES.find((h) => h.id === 'dischmastrasse-19');
  const { bakes, atlas } = house.model;
  const layout = facadeLayout(bakes);
  assert.ok(layout.scale > 80, `${layout.scale} px/m`);
  const rects = Object.values(layout.rects);
  assert.equal(rects.length, Object.keys(bakes).length);
  for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= layout.size && r.y + r.h <= layout.size);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, 'no overlap');
  }
  // uv of a bake's corners: its rectangle's
  const [u0, v0] = facadeUV(layout, bakes.S, 'S', bakes.S.a[0], bakes.S.y[1]);
  assert.ok(Math.abs(u0 * layout.size - layout.rects.S.x) < 1e-6 && Math.abs(v0 * layout.size - layout.rects.S.y) < 1e-6);
  // The JPEG: 2048², at most ~600 KB
  const file = fs.readFileSync(new URL(`../${atlas}`, import.meta.url));
  assert.ok(file[0] === 0xff && file[1] === 0xd8, 'a JPEG');
  assert.ok(file.length < 620 * 1024, `${file.length} bytes`);
  let p = 2;
  while (p < file.length && !(file[p] === 0xff && file[p + 1] >= 0xc0 && file[p + 1] <= 0xc2)) p += 2 + file.readUInt16BE(p + 2);
  assert.equal(file.readUInt16BE(p + 5), layout.size);
  assert.equal(file.readUInt16BE(p + 7), layout.size);
});
