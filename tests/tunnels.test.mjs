import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTunnels, ROAD_BORE, RAIL_BORE } from '../js/tunnels.js';
import { getRoadTunnels, getRhBTunnels } from '../js/terrain.js';

const group = buildTunnels({ add() {} });
const mesh = (name) => group.children.find((m) => m.name === `tunnels ${name}`);
const triangles = (m) => m.geometry.attributes.position.count / 3;

test('the tunnels stay a few draw calls and a modest number of triangles', () => {
  assert.ok(group.children.length <= 10, `${group.children.length} meshes`);
  const total = group.children.reduce((sum, m) => sum + triangles(m), 0);
  assert.ok(total < 30000, `${total} triangles`);
});

test('the bore is lit without a single real light', () => {
  group.traverse((o) => assert.ok(!o.isLight, o.name));
  for (const name of ['roadFloor', 'roadLining', 'railFloor', 'railLining']) assert.ok(mesh(name).material.isMeshBasicNodeMaterial, name);
});

test('the road tunnels have lamps every few metres, and the rail tunnels stay dimmer', () => {
  assert.ok(ROAD_BORE.period <= 12);
  assert.ok(RAIL_BORE.pool < ROAD_BORE.pool && RAIL_BORE.ambient < ROAD_BORE.ambient && RAIL_BORE.period > ROAD_BORE.period);
  assert.ok(ROAD_BORE.row + ROAD_BORE.lampWidth + 0.1 < ROAD_BORE.half * 0.56, 'the lamps hang from the flat of the crown');
});

test('every vertex of the bore knows where it lies in the tunnel', () => {
  const longest = (tunnels) => Math.max(...tunnels.map((t) => t.length));
  for (const [name, bore, tunnels] of [['road', ROAD_BORE, getRoadTunnels()], ['rail', RAIL_BORE, getRhBTunnels()]]) {
    for (const part of [`${name}Floor`, `${name}Lining`]) {
      const c = mesh(part).geometry.attributes.tunnelCoord, count = mesh(part).geometry.attributes.position.count;
      assert.equal(c.count, count, part);
      for (let i = 0; i < c.count; i++) {
        assert.ok(c.getX(i) >= 0 && c.getX(i) <= longest(tunnels) + 0.01, `${part} along`);
        assert.ok(Math.abs(c.getY(i)) <= bore.half + 0.01, `${part} across`);
        assert.ok(c.getZ(i) >= 0 && c.getZ(i) <= bore.roof + 0.01, `${part} height`);
        assert.ok(c.getW(i) >= 0 && c.getW(i) <= longest(tunnels), `${part} to the mouth`);
      }
    }
  }
});

test('the Landwassertunnel has its SOS niches', () => {
  const longest = getRoadTunnels().find((t) => t.name === 'Landwassertunnel').length;
  const signs = mesh('signs').geometry.attributes;
  assert.equal(signs.tone.count, signs.position.count);
  assert.ok(triangles(mesh('signs')) / 30 >= Math.floor(longest / ROAD_BORE.sos) - 1, 'one every ~150 m');
});
