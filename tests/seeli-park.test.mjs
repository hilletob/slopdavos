import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEELI, MISSION_SPOTS, area2, bankHeight, bankStations, benchSites, boardLine, coneSites, footwayClearance, gatePoint, hutOctagon,
  inBuilding, inRing, lampSites, lineDistance, lineLength, nearRoads, pathDistance, pathLines, roadClearance, shoreDistance, shoreRing,
  spotDistance, treeDistance
} from '../js/seeli-park-data.js';
import { POND } from '../js/missions-data-outdoor.js';
import { RINK } from '../js/missions-data-rink.js';
import { BUBENBRUNNEN } from '../js/bubenbrunnen-data.js';

const ring = shoreRing();
const onIce = (x, z) => inRing(ring, x, z);
// everything that stands (not the path, the bank or the boards): [what, x, z, its radius]
const standing = () => [
  ...benchSites().map((b) => ['bench', b.x, b.z, SEELI.benches.len / 2]),
  ...lampSites().map((l) => ['lamp', l.x, l.z, 0.2]),
  ...SEELI.floodlights.map((f) => ['floodlight', f.x, f.z, 0.9]),
  ...coneSites().map((c) => ['cone', c.x, c.z, SEELI.cones.r]),
  ...SEELI.flags.map(([x, z]) => ['flag', x, z, SEELI.flag.w])
];

test('the shore: the Seehof Seeli\'s ring, turned with its outside on wallFrame\'s n', () => {
  assert.ok(ring.length > 20 && area2(ring) < 0);
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  assert.ok(Math.abs(Math.min(...xs) - 696.5) < 0.2 && Math.abs(Math.max(...xs) - 756.8) < 0.2);
  assert.ok(Math.abs(Math.min(...zs) + 1448.4) < 0.2 && Math.abs(Math.max(...zs) + 1389.8) < 0.2);
});

test('the path: round the pond on the bank, ending at the service road, a spur to the Promenade\'s pavement', () => {
  const { runs } = pathLines();
  assert.equal(runs.length, 2, 'the loop (open where the service road runs along the south-west shore) and the spur');
  const [loop, spur] = runs;
  assert.ok(lineLength(loop) > 150, `the loop: ${lineLength(loop).toFixed(0)} m`);
  for (const run of runs) for (const [x, z] of run) {
    assert.ok(!onIce(x, z) && shoreDistance(x, z) > SEELI.path.half + 1.2, `on the bank, off the ice: ${x}, ${z}`);
    assert.ok(roadClearance(x, z) > SEELI.path.half + 0.25, `clear of the carriageways: ${x}, ${z}`);
    assert.ok(!inBuilding(x, z, SEELI.path.half), `clear of the houses: ${x}, ${z}`);
  }
  // the loop's two ends meet the service road along the south-west shore (w29257353), within a few metres
  const service = nearRoads().find((r) => r.id === 'w29257353');
  for (const [x, z] of [loop[0], loop[loop.length - 1]]) assert.ok(lineDistance(service.pts, x, z) - service.half < 3.5, `a loop end at ${x}, ${z}`);
  // the spur ends on the Promenade's pavement
  const prom = nearRoads().find((r) => r.name === 'Promenade');
  const [ex, ez] = spur[spur.length - 1], d = lineDistance(prom.pts, ex, ez);
  assert.ok(d > prom.half && d < prom.walk + 0.5, `the spur's end ${d.toFixed(2)} m from the Promenade's middle`);
  // swung round the trees
  for (const run of runs) for (const [x, z] of run) assert.ok(treeDistance(x, z) > 1.2, `a tree on the path at ${x}, ${z}`);
});

test('what stands: on the bank, clear of the roads and their pavements, the footway, the trees, the houses and the path', () => {
  const list = standing();
  assert.ok(benchSites().length >= 4 && lampSites().length >= 3 && coneSites().length >= 12, `${benchSites().length} benches, ${lampSites().length} lamps, ${coneSites().length} cones`);
  for (const [what, x, z, r] of list) {
    assert.ok(!onIce(x, z) && shoreDistance(x, z) > 2.5, `${what} at ${x}, ${z}: on the bank`);
    assert.ok(roadClearance(x, z) > 1.2, `${what} at ${x}, ${z}: ${roadClearance(x, z).toFixed(2)} m from a carriageway`);
    if (what !== 'floodlight') assert.ok(roadClearance(x, z, true) > r, `${what} at ${x}, ${z}: off the pavements`);
    assert.ok(footwayClearance(x, z) > 0.3, `${what} at ${x}, ${z}: off the footway`);
    assert.ok(treeDistance(x, z) > 1.2, `${what} at ${x}, ${z}: clear of the trees`);
    assert.ok(!inBuilding(x, z, 1), `${what} at ${x}, ${z}: clear of the houses`);
    assert.ok(pathDistance(x, z) > SEELI.path.half + 0.1, `${what} at ${x}, ${z}: off the path`);
  }
  // nothing on top of another
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const [a, ax, az, ar] = list[i], [b, bx, bz, br] = list[j];
    if (a === 'flag' && b === 'flag') continue;
    assert.ok(Math.hypot(ax - bx, az - bz) > Math.min(ar, br) + 0.8, `${a} at ${ax}, ${az} and ${b} at ${bx}, ${bz}`);
  }
});

test('the missions\' places stay free: the hockey\'s start, pin, spot and posts, the rink\'s hydrant, start, pin and machine', () => {
  assert.ok(MISSION_SPOTS.length >= 10);
  for (const [what, x, z, r] of standing()) assert.ok(spotDistance(x, z) > r, `${what} at ${x}, ${z}: ${spotDistance(x, z).toFixed(2)} m`);
  const hut = BUBENBRUNNEN.centre;
  assert.ok(spotDistance(...hut) > SEELI.hut.eaves + 5, 'the fountain\'s case far from them');
  // the hockey's pin and the rink's start, pin and hydrant on open ground (nothing standing within 3 m)
  for (const s of [POND.pin, RINK.start, RINK.pin, RINK.hydrant]) {
    for (const [what, x, z] of standing()) assert.ok(Math.hypot(x - s.x, z - s.z) > 3, `${what} at ${x}, ${z} by ${s.x}, ${s.z}`);
  }
});

test('the boards: on the ice inside the hockey\'s bank margin and the rink\'s uncounted edge, open at the gate', () => {
  const line = boardLine(), B = SEELI.boards;
  assert.ok(lineLength(line) > 150 && lineLength(line) < 200);
  for (const [x, z] of line) {
    const d = shoreDistance(x, z);
    assert.ok(onIce(x, z) && d > 0.2, `${x}, ${z} on the ice`);
    // (the players and the puck stay POND.bank m in from the ring: they never reach the boards; the resurfacer's work
    // stops RINK.edge m in)
    assert.ok(d < POND.bank - 0.3 && d <= RINK.edge, `${x}, ${z}: ${d.toFixed(2)} m in`);
  }
  // the gate: the line's two ends either side of it, the gate free
  const [gx, gz] = gatePoint();
  assert.ok(Math.hypot(line[0][0] - line[line.length - 1][0], line[0][1] - line[line.length - 1][1]) > B.gate * 0.8);
  assert.ok(lineDistance(line, gx, gz) > B.gate / 2);
  // the gate faces the spur
  assert.ok(Math.hypot(gx - SEELI.spur[0][0], gz - SEELI.spur[0][1]) < 8);
});

test('the snow bank: on the shore, open at the gate, inside the path', () => {
  const st = bankStations();
  assert.ok(st.length > 100 && st.some((s) => s.gap) && st.filter((s) => s.gap).length < 6);
  for (const s of st) assert.ok(!onIce(s.x + s.nx * 0.5, s.z + s.nz * 0.5), 'the way out of the pond');
  const K = SEELI.bank;
  assert.equal(bankHeight(K.from), 0); assert.equal(bankHeight(K.to), 0);
  assert.ok(Math.abs(bankHeight(K.at) - K.peak) < 1e-9);
  for (let d = 0; d < 5; d += 0.1) assert.ok(bankHeight(d) >= 0 && bankHeight(d) <= K.peak + 1e-9);
  assert.ok(K.to < SEELI.path.offset - SEELI.path.half, 'the bank stops before the path');
});

test('the fountain\'s winter case encloses the Bubenbrunnen', () => {
  const H = SEELI.hut, S = BUBENBRUNNEN;
  const oct = hutOctagon(H.apothem), apothem = (r) => Math.hypot((r[0][0] + r[1][0]) / 2 - S.centre[0], (r[0][1] + r[1][1]) / 2 - S.centre[1]);
  assert.ok(Math.abs(apothem(oct) - H.apothem) < 1e-9);
  assert.ok(area2(oct) < 0, 'clockwise from above (wallFrame\'s outside out)');
  assert.ok(H.apothem > S.cap.eaves + 0.02 && H.apothem > S.block.radius + 0.1, 'the block and the cap inside its walls');
  assert.ok(H.wallTop > S.cap.y0 && H.eaves > H.apothem);
  const roofOverKnob = H.apex - (0.08 / H.eaves) * (H.apex - H.wallTop);
  assert.ok(roofOverKnob > S.cap.knob + 0.2, 'the roof over the cap\'s knob');
});

for (const simple of [false, true]) {
  test(`the park in Node${simple ? ' (the mobile profile)' : ''}: five meshes, every vertex finite, the winter group switching`, async () => {
    const noop = () => {};
    const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
    const THREE = await import('three/webgpu');
    const { QUALITY } = await import('../js/quality.js');
    const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
    const season = await import('../js/season.js');
    const was = QUALITY.simpleMaterials;
    QUALITY.simpleMaterials = simple;
    // (SIMPLE_SKINS' materials marked as they are made, as mobile-check.mjs does)
    const orig = {};
    for (const k of Object.keys(SIMPLE_SKINS)) { orig[k] = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = orig[k](...a); m.userData.simpleSkin = k; return m; }; }
    try {
      const { buildSeeliPark } = await import('../js/seeli-park.js');
      const scene = new THREE.Scene();
      const { group, colliders, setSeason } = buildSeeliPark(scene);
      assert.equal(group.userData.terrain, 'absolute');
      const meshes = [];
      group.traverse((o) => { if (o.isMesh) meshes.push(o); });
      assert.deepEqual(meshes.map((m) => m.name).sort(), ['SeeliPark glow', 'SeeliPark path', 'SeeliPark trim', 'SeeliPark winter bank', 'SeeliPark winter wtrim']);
      for (const m of meshes) {
        const p = m.geometry.attributes.position.array;
        assert.ok(p.length > 0 && p.every(Number.isFinite), `${m.name}: finite`);
        if (m.geometry.attributes.color) assert.equal(m.geometry.attributes.color.count, m.geometry.attributes.position.count, `${m.name}: a colour per vertex`);
        // the phone: a SIMPLE_SKIN or a plain vertex-coloured material, nothing procedural
        const mat = m.material, procedural = mat.colorNode || mat.emissiveNode || mat.roughnessNode || mat.normalNode || mat.positionNode;
        if (simple) assert.ok(mat.userData.simpleSkin || (!procedural && mat.vertexColors), `${m.name}: a full shader on the phone`);
      }
      // the winter group: hidden in summer, shown in winter, by the season's switch and by setSeason
      const cold = group.children.find((o) => o.name === 'SeeliPark winter');
      season.setSeason(false);
      assert.equal(cold.visible, false);
      season.setSeason(true);
      assert.equal(cold.visible, true);
      season.setSeason(false);
      assert.equal(cold.visible, false);
      setSeason(true); assert.equal(cold.visible, true); setSeason(false);
      // colliders: a bench each and the fountain's case; finite, at world heights, none on the ice or the boards
      assert.equal(colliders.length, benchSites().length + 1);
      for (const c of colliders) {
        assert.ok([c.minX, c.maxX, c.minZ, c.maxZ, c.baseY, c.minY, c.maxY].every(Number.isFinite) && c.maxY > c.minY + 0.5 && c.obb);
        assert.ok(!onIce(c.obb.cx, c.obb.cz) && spotDistance(c.obb.cx, c.obb.cz) > 1);
        assert.ok(c.obb.hx < 1.5 && c.obb.hz < 1.5, 'thin, small boxes');
      }
      const hut = colliders[colliders.length - 1];
      assert.ok(Math.abs(hut.obb.cx - BUBENBRUNNEN.centre[0]) < 1e-9 && hut.maxY > 2.5);
    } finally {
      QUALITY.simpleMaterials = was;
      Object.assign(SIMPLE_SKINS, orig);
    }
  });
}
