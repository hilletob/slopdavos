import test from 'node:test';
import assert from 'node:assert/strict';
import { PFADIHEIM, PFADIHEIM_DOOR, PFADIHEIM_START, pfadiheimFrame } from '../js/pfadiheim-data.js';

const inside = (ring, x, z) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};

test('the Pfadiheim stands on its OSM footprint, its front facing the forecourt (south-east)', () => {
  const fr = pfadiheimFrame();
  assert.ok(Math.abs(fr.length - 24.6) < 0.1 && Math.abs(fr.depth - 11.3) < 0.1);
  assert.ok(fr.v[0] > 0.5 && fr.v[1] > 0.5, 'the front faces south-east');
  const m = PFADIHEIM.model;
  assert.ok(Math.abs(m.walls.x[1] - m.walls.x[0] - fr.length) < 0.1 && Math.abs(m.walls.z[1] - m.walls.z[0] - fr.depth) < 0.1);
  assert.ok(inside(PFADIHEIM.footprint, PFADIHEIM.exclude.x, PFADIHEIM.exclude.z), 'the swissBUILDINGS3D building it replaces');
});

test('the mission start lies on the forecourt before the entrance, looking at the door', () => {
  const fr = pfadiheimFrame();
  assert.ok(!inside(PFADIHEIM.footprint, PFADIHEIM_START.x, PFADIHEIM_START.z));
  const dx = PFADIHEIM_DOOR.x - PFADIHEIM_START.x, dz = PFADIHEIM_DOOR.z - PFADIHEIM_START.z;
  const d = Math.hypot(dx, dz);
  assert.ok(d > 3 && d < 6, `${d.toFixed(1)} m from the door`);
  // out of the front, past the veranda (1.8 m) and its railing
  const out = (PFADIHEIM_START.x - fr.cx) * fr.v[0] + (PFADIHEIM_START.z - fr.cz) * fr.v[1];
  assert.ok(out > fr.depth / 2 + PFADIHEIM.model.veranda.depth + 1, `${out.toFixed(1)} m out of the middle`);
  assert.ok(Math.abs(Math.atan2(dx, dz) - PFADIHEIM_START.heading) < 0.05, 'heading towards the door (atan2(dx, dz))');
});

test('every vertex of the Pfadiheim is finite (no NaN in its merged geometries)', async () => {
  const warn = console.warn;
  console.warn = () => {}; // (no fetch in Node: the photographs are not loaded)
  try {
    const { buildPfadiheim } = await import('../js/pfadiheim.js');
    const { group, colliders } = buildPfadiheim({ add() {} });
    let meshes = 0;
    group.traverse((o) => {
      if (!o.geometry) return;
      meshes++;
      const p = o.geometry.attributes.position.array;
      for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]), `${o.name}: vertex ${Math.floor(i / 3)} is not finite`);
    });
    assert.ok(meshes >= 10);
    for (const c of colliders) for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'minY', 'maxY']) assert.ok(Number.isFinite(c[k]));
  } finally {
    console.warn = warn;
  }
});
