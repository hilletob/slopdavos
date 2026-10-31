import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import {
  CLASSIC, SKATE, TECH, skiLanes, loipeLayout, createSkiNetwork, createSkier, skierPosition, advanceSkier, keepApart,
  nearbyStretches, spawnSkier, chooseTechnique, paceOnGrade
} from '../js/cross-country-routes.js';

// js/loipen.js's own LAYOUT (its three.js imports stubbed: only the table is needed)
const require = createRequire(import.meta.url);
const { loadModule } = require('./helpers/module.cjs');
const stub = new Proxy({}, { get: () => undefined });
const { LAYOUT } = loadModule(readFileSync(new URL('../js/loipen.js', import.meta.url), 'utf8'), {
  imports: Object.fromEntries(['three/webgpu', 'three/tsl', 'three/addons/utils/BufferGeometryUtils.js', './davos-geodata.js', './terrain.js', './season.js', './scene-culling.js', './groom-map.js'].map((k) => [k, stub])),
  filename: 'loipen.js'
});

test('skiers keep to the lanes loipen.js grooms: classic in the tracks along the edges, skating in the middle', () => {
  const lanes = (g) => skiLanes(loipeLayout(LAYOUT, g));
  // classic only: one track each way, keeping right (positive offsets: right of the drawing direction)
  assert.deepEqual(lanes('classic').map((l) => [l.style, l.dir, l.offset]), [[CLASSIC, 1, 0.65], [CLASSIC, -1, -0.65]]);
  // skating only: the lane split in two halves
  assert.deepEqual(lanes('skating').map((l) => [l.style, l.dir, l.offset]), [[SKATE, 1, 1], [SKATE, -1, -1]]);
  // both: the classic tracks at the edges, the skaters between them in the corduroy
  const both = lanes('classic+skating');
  const layout = LAYOUT['classic+skating'];
  for (const l of both) {
    if (l.style === CLASSIC) assert.ok(layout.tracks.includes(l.offset) && Math.abs(l.offset) > layout.skate[1], 'classic track at the edge');
    else assert.ok(l.offset > layout.skate[0] + 0.5 && l.offset < layout.skate[1] - 0.5, 'skating in the middle lane');
    assert.ok(Math.sign(l.offset) === l.dir, 'keeping right');
  }
  assert.deepEqual(new Set(both.map((l) => l.style)), new Set([CLASSIC, SKATE]));
  assert.equal(lanes('classic;skating').length, 4);
});

test('techniques and pace follow the style and the slope', () => {
  const classic = { style: CLASSIC, prefer: 0.9, burst: 0 }, skate = { style: SKATE, prefer: 0.2 };
  assert.equal(chooseTechnique(classic, 0.08), TECH.DIAGONAL);
  assert.equal(chooseTechnique(classic, 0), TECH.DIAGONAL);
  assert.equal(chooseTechnique({ ...classic, burst: 1 }, 0), TECH.DOUBLE_POLE);
  assert.equal(chooseTechnique(classic, -0.1), TECH.TUCK);
  assert.equal(chooseTechnique(skate, 0), TECH.V2);
  assert.equal(chooseTechnique(skate, 0.1), TECH.V2_ALT);
  assert.ok(paceOnGrade(4, 0.1) < 4 && paceOnGrade(4, -0.1) > 4 && paceOnGrade(4, 0.5) >= 1.5);
});

test('skiers spread over the trails near a point, go both ways and never overlap', () => {
  const net = createSkiNetwork(DAVOS_DATA.loipen, LAYOUT);
  assert.ok(net.trails.length > 50, `${net.trails.length} trails`);
  let seed = 7;
  const rand = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) + 1) >>> 0) / 4294967296;
  // Around the Nachtloipe (classic+skating, by the Bolgen in Davos Dorf)
  const trail = net.trails.find((t) => t.name === 'Nachtloipe');
  assert.ok(trail);
  const mid = skierPosition({ trail, s: trail.length / 2, offset: 0, dir: 1 });
  const near = nearbyStretches(net, mid.x, mid.z, 500);
  assert.ok(near.total > 1000, `${Math.round(near.total)} m of trail nearby`);
  const skiers = Array.from({ length: 40 }, (_, i) => createSkier(i, rand));
  for (const sk of skiers) spawnSkier(sk, near, skiers, rand, { spacing: 20 });
  const active = skiers.filter((s) => s.active);
  assert.ok(active.length >= 20, `${active.length} skiers placed`);
  assert.ok(active.some((s) => s.style === CLASSIC) && active.some((s) => s.style === SKATE));
  assert.ok(active.some((s) => s.dir > 0) && active.some((s) => s.dir < 0), 'both directions');
  const positions = skiers.map(() => ({}));
  let closest = Infinity;
  const dt = 1 / 30;
  for (let step = 0; step < 30 * 120; step++) {
    skiers.forEach((sk, i) => sk.active && skierPosition(sk, positions[i]));
    for (const sk of skiers) if (sk.active) { sk.target = paceOnGrade(sk.base, 0); sk.tech = chooseTechnique(sk, 0); }
    keepApart(skiers, positions);
    for (const sk of skiers) if (sk.active) advanceSkier(sk, dt, rand);
    for (let i = 0; i < skiers.length; i++) for (let j = i + 1; j < skiers.length; j++) {
      if (!skiers[i].active || !skiers[j].active) continue;
      const a = skierPosition(skiers[i], {}), b = skierPosition(skiers[j], {});
      closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
    }
  }
  for (const sk of skiers.filter((s) => s.active)) {
    assert.ok(sk.v >= 0 && sk.v <= 10, `speed ${sk.v}`);
    const lane = sk.trail.lanes.find((l) => l.style === sk.style && l.dir === sk.dir);
    assert.ok(lane, 'a lane for its style');
  }
  // Two minutes of traffic both ways: never closer than passing shoulder to shoulder (bodies ~0.5 m wide)
  assert.ok(closest >= 0.8, `closest ${closest.toFixed(2)} m`);
});
