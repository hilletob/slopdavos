import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createHeatTrail, heatGroup, heatCell, HEAT_CELL, HEAT_ORIGIN, HEAT_SIZE, HEAT_GROUPS, SEND_CELLS } from '../js/heat-trail.js';
import { createLiveBeacon, LIVE_KEY, LIVE_TOPIC } from '../js/live-beacon.js';
import { TRAVEL_KINDS } from '../js/play-stats.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const cells = (flat) => {
  const out = [];
  for (let i = 0; i < flat.length; i += 4) out.push(flat.slice(i, i + 4));
  return out;
};

test('every way of travel has a group', () => {
  for (const kind of Object.keys(TRAVEL_KINDS)) assert.ok(heatGroup(kind) >= 0 && heatGroup(kind) < HEAT_GROUPS.length, kind);
  assert.equal(HEAT_GROUPS[heatGroup('walk')], 'foot');
  assert.equal(HEAT_GROUPS[heatGroup('bus')], 'wheels');
  assert.equal(HEAT_GROUPS[heatGroup('xc-ski')], 'snow');
  assert.equal(HEAT_GROUPS[heatGroup('paraglider')], 'air');
  assert.equal(HEAT_GROUPS[heatGroup('train-passenger')], 'rail');
  assert.equal(heatGroup('something new'), 0);
});

test('the cells cover the world and nothing beyond', () => {
  assert.deepEqual(heatCell(HEAT_ORIGIN[0], HEAT_ORIGIN[1]), [0, 0]);
  assert.deepEqual(heatCell(0, 0), [Math.floor(9500 / HEAT_CELL), Math.floor(4300 / HEAT_CELL)]);
  assert.equal(heatCell(HEAT_ORIGIN[0] - 1, 0), null);
  assert.equal(heatCell(0, 11900 + HEAT_CELL), null);
  assert.deepEqual(HEAT_SIZE, [1313, 1013]);
  // (the migration's checks name the same grid)
  const sql = readFileSync(new URL('../supabase/migrations/20261117120000_heatmap.sql', import.meta.url), 'utf8');
  assert.match(sql, new RegExp(`ix between 0 and ${HEAT_SIZE[0] - 1}\\b`));
  assert.match(sql, new RegExp(`iz between 0 and ${HEAT_SIZE[1] - 1}\\b`));
  assert.match(sql, new RegExp(`'cell', ${HEAT_CELL}\\b`));
  assert.match(sql, new RegExp(`> ${SEND_CELLS * 4}\\b`));
});

test('nothing is collected before the start', () => {
  const trail = createHeatTrail();
  for (let x = 0; x < 200; x += 4) trail.tick('walk', { x, z: 0 });
  assert.equal(trail.size, 0);
});

test('entering a cell counts, standing does not', () => {
  const trail = createHeatTrail();
  trail.start();
  for (let i = 0; i < 100; i++) trail.tick('walk', { x: 3, z: 3 });
  assert.equal(trail.size, 0);
  for (let x = 3; x <= 3 + 3 * HEAT_CELL; x += 2) trail.tick('walk', { x, z: 3 });
  const got = cells(trail.take());
  assert.equal(got.length, 3);
  assert.ok(got.every(([g, , , n]) => g === 0 && n === 1));
  const [ix0] = heatCell(3, 3);
  assert.deepEqual(got.map(([, ix]) => ix), [ix0 + 1, ix0 + 2, ix0 + 3]);
  assert.equal(trail.size, 0);
});

test('coming back counts again, and the group is kept apart', () => {
  const trail = createHeatTrail();
  trail.start();
  const a = { x: 8, z: 8 }, b = { x: 8 + HEAT_CELL, z: 8 };
  for (const p of [a, b, a, b]) trail.tick('car', p);
  trail.tick('walk', b); // (out of the car: the same cell in another group)
  const got = cells(trail.take());
  const [ix, iz] = heatCell(a.x, a.z);
  assert.deepEqual(got.sort((p, q) => p[0] - q[0] || p[1] - q[1]), [[0, ix + 1, iz, 1], [1, ix, iz, 1], [1, ix + 1, iz, 2]]);
});

test('a teleport and the way out of the world count nothing', () => {
  const trail = createHeatTrail();
  trail.start();
  trail.tick('walk', { x: 0, z: 0 });
  trail.tick('walk', { x: 3000, z: 2000 });
  assert.equal(trail.size, 0);
  trail.tick('walk', { x: 3000 + HEAT_CELL, z: 2000 });
  assert.equal(trail.size, 1);
  trail.tick('helicopter', { x: 99999, z: 0 });
  trail.tick('helicopter', { x: 11000, z: 0 });
  assert.equal(trail.size, 1);
});

test('the trail goes out in calls of a limited size, and comes back when it did not get through', () => {
  const trail = createHeatTrail({ max: 50 });
  trail.start();
  for (let i = 0; i <= 80; i++) trail.tick('bike', { x: i * HEAT_CELL + 1, z: 1 });
  assert.equal(trail.size, 50); // (the trail beyond is dropped)
  const first = trail.take(20);
  assert.equal(first.length, 80);
  assert.equal(trail.size, 30);
  trail.restore(first);
  assert.equal(trail.size, 50);
  trail.restore(first.slice(0, 4));
  assert.equal(cells(trail.take()).find(([, ix]) => ix === first[1])[3], 2);
});

test('the live dot: under way every two seconds, standing every six, never when switched off', () => {
  const storage = memory(), sent = [];
  let t = 0;
  const on = {};
  const target = { document: { hidden: false, addEventListener: (type, fn) => { on[type] = fn; } }, addEventListener: (type, fn) => { on[type] = fn; } };
  const request = (url, init) => { sent.push({ url, ...JSON.parse(init.body).messages[0] }); return Promise.resolve({ ok: true }); };
  const beacon = createLiveBeacon({ storage, now: () => t, request, target, url: 'https://x.example', key: 'k' });
  for (; t < 10000; t += 100) beacon.tick('car', { x: t / 100, z: 5.4 }); // (10 m/s)
  assert.equal(sent.length, 5);
  assert.equal(sent[0].url, 'https://x.example/realtime/v1/api/broadcast');
  assert.equal(sent[0].topic, LIVE_TOPIC);
  assert.deepEqual(sent[1].payload, { id: beacon.id, x: 20, z: 5, k: 1 });
  sent.length = 0;
  for (; t < 30000; t += 100) beacon.tick('walk', { x: 99, z: 5 });
  assert.ok(sent.length >= 3 && sent.length <= 5, String(sent.length));
  sent.length = 0;
  storage.setItem(LIVE_KEY, 'off');
  for (; t < 40000; t += 100) beacon.tick('walk', { x: t, z: 5 });
  assert.deepEqual(sent.map((m) => m.payload), [{ id: beacon.id, off: 1 }]); // (the dot is taken off once)
  sent.length = 0;
  storage.removeItem(LIVE_KEY);
  beacon.tick('walk', { x: 1, z: 1 });
  assert.equal(sent.length, 1);
  on.pagehide();
  assert.deepEqual(sent[1].payload, { id: beacon.id, off: 1 });
  target.document.hidden = true;
  beacon.tick('walk', { x: 500, z: 1 });
  assert.equal(sent.length, 2);
});
