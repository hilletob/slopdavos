import assert from 'node:assert/strict';
import test from 'node:test';
import { TOUR_ROUTES } from '../js/tour-routes-data.js';
import { NAMES } from '../js/names-data.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
const inMap = (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ;
const lengthOf = (l) => { let s = 0; for (let i = 2; i < l.length; i += 2) s += Math.hypot(l[i] - l[i - 2], l[i + 1] - l[i - 1]); return s; };
const lineOk = (l, id) => {
  assert.ok(l.length >= 4 && l.length % 2 === 0, id);
  for (let i = 0; i < l.length; i += 2) assert.ok(inMap(l[i], l[i + 1]), `${id} inside the map`);
};

test('the hiking network of Davos (swissTLM3D Wanderwege) and its signpost sites', () => {
  const { hiking, nodes, source } = TOUR_ROUTES;
  assert.match(source, /swisstopo/);
  for (const h of hiking) {
    assert.match(h.c, /^[wba]$/);
    lineOk(h.pts, 'hiking');
    assert.ok(Math.abs(lengthOf(h.pts) - h.len) < 2);
  }
  const km = (c) => hiking.filter((h) => h.c === c).reduce((s, h) => s + h.len, 0) / 1000;
  assert.ok(km('w') > 40 && km('b') > 350 && km('w') + km('b') < 900, `${km('w')} km, ${km('b')} km`);
  assert.ok(nodes.length > 300 && nodes.length < 900, `${nodes.length} signposts`);
  for (const n of nodes) assert.ok(inMap(n.x, n.z) && n.n !== 2 && /^[wba]$/.test(n.c) && Number.isFinite(n.a));
  // none nearer than 25 m to another
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) assert.ok(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z) >= 25);
});

test('SchweizMobil routes, ski tours and snowshoe routes (ASTRA, swisstopo / SAC)', () => {
  const { mobil, ski, snowshoe } = TOUR_ROUTES;
  for (const list of [mobil, ski, snowshoe]) for (const r of list) {
    assert.ok(r.len >= 60 && r.lines.length >= 1, r.id);
    for (const l of r.lines) lineOk(l, r.id);
    assert.ok(Math.abs(r.lines.reduce((s, l) => s + lengthOf(l), 0) - r.len) < 3, `${r.id} length`);
  }
  for (const name of [/Walserweg/, /ViaValtellina/, /Jöriseen Rundweg/, /Graubünden Bike/, /Alpenweg Davos/]) assert.ok(mobil.some((r) => name.test(r.name)), String(name));
  assert.ok(mobil.every((r) => (r.kind === 'hike' || r.kind === 'mtb') && Number.isInteger(r.nr)));
  assert.ok(ski.length > 150 && snowshoe.length > 40);
  const pischa = ski.filter((r) => /Pischahorn/.test(r.name));
  assert.ok(pischa.length >= 2 && pischa.every((r) => r.alt > 2900 && r.alt < 3000));
  assert.ok(ski.some((r) => /^(L|WS|ZS|S)[+-]?$/.test(r.grade)) && ski.every((r) => !/Keine Routeninfo/.test(r.route)));
});

test('the geographic names of Davos (swissNAMES3D)', () => {
  const { names, kinds, source } = NAMES;
  assert.match(source, /swissNAMES3D/);
  assert.ok(names.length > 1200);
  let last = 0;
  for (const [name, x, z, h, kind, rank] of names) {
    assert.ok(name && inMap(x, z) && h > 1000 && h < 3300 && kinds[kind] && rank >= last && rank <= 3, name);
    last = rank;
  }
  const peak = (re) => names.find((n) => kinds[n[4]] === 'peak' && re.test(n[0]));
  assert.equal(peak(/^Schwarzhor[an]$/)?.[3], 3146);
  assert.ok(peak(/^Jakobshor[an]$/) && peak(/Pischahorn/) && peak(/Weissfluh/));
  for (const [kind, re] of [['lake', /Davoser ?see/i], ['pass', /Flüelapass/], ['valley', /Dischma/], ['stream', /Landwasser/]]) {
    assert.ok(names.some((n) => kinds[n[4]] === kind && re.test(n[0])), `${kind} ${re}`);
  }
});
