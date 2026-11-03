import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RURAL_MISSIONS, QUAD, QUAD_MISSION, QUAD_START, QUAD_ROUTE, QUAD_GATES, QUAD_BUMPS, QUAD_PATCHES, HELDSTAB, quadOffroad, quadRouteLength,
  bumpAt, surfaceAt, stepQuad, createQuadJump,
  BIO, BIO_MISSION, BIO_START, BIO_ROUTE, BIO_PLANT, BIO_HOPPER, BIO_DIGESTERS, BIO_BARREL, BIO_BED, BIO_BED_SLOTS, bioStops, stopAtBed, rejectBarrel, bioLoad, bioScore, stepBioStops
} from '../js/missions-data-rural.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor, missionMedals } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const DT = 1 / 30;
const frame = (over = {}) => ({ mode: 'car', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: DT, t: 0, ...over });
const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const near = (b, x, z, R = 300) => { const r = b.ring; for (let i = 0; i < r.length; i += 2) if (Math.abs(r[i] - x) < R && Math.abs(r[i + 1] - z) < R) return true; return false; };
const inBuilding = (x, z) => DAVOS_DATA.buildings.some((b) => near(b, x, z) && inRing(b.ring, x, z));
const edgeDist = (x, z) => {
  let best = Infinity;
  for (const b of DAVOS_DATA.buildings) {
    if (!near(b, x, z, 60)) continue;
    const r = b.ring;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const dx = r[i] - r[j], dz = r[i + 1] - r[j + 1], L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - r[j]) * dx + (z - r[j + 1]) * dz) / L));
      best = Math.min(best, Math.hypot(r[j] + dx * t - x, r[j + 1] + dz * t - z));
    }
  }
  return best;
};
const roadDist = (x, z, kinds) => {
  let best = Infinity;
  for (const r of DAVOS_DATA.roads) {
    if (kinds && !kinds.includes(r.kind)) continue;
    const p = r.pts;
    for (let i = 2; i < p.length; i += 2) {
      const dx = p[i] - p[i - 2], dz = p[i + 1] - p[i - 1], L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - p[i - 2]) * dx + (z - p[i - 1]) * dz) / L));
      best = Math.min(best, Math.hypot(p[i - 2] + dx * t - x, p[i - 1] + dz * t - z));
    }
  }
  return best;
};

test('the rural missions are registered, complete, their medals in order', () => {
  assert.deepEqual(RURAL_MISSIONS.map((m) => m.id), ['quad-heldstab', 'bio-round']);
  for (const m of RURAL_MISSIONS) {
    assert.ok(MISSIONS.includes(m), `${m.id} is in MISSIONS`);
    assert.equal(getMission(m.id), m);
    const med = missionMedals(m);
    if (m.scoreMode) assert.ok(med.gold > med.silver && med.silver > med.bronze && med.bronze > 0);
    else assert.ok(med.gold < med.silver && med.silver < med.bronze);
    const state = m.createState();
    for (const o of m.objectives) {
      const v = o.check(frame({ x: m.start.x, z: m.start.z }), state);
      assert.equal(typeof v.done, 'boolean');
      assert.equal(typeof v.text, 'string');
    }
  }
  assert.ok(getMission('quad-heldstab').medals.gold < getMission('quad-heldstab').timeLimitMs);
});

test('the starts lie outside every building footprint, on the road, facing the first objective', () => {
  for (const [m, first] of [[QUAD_MISSION, QUAD_GATES.town[0]], [BIO_MISSION, null]]) {
    const s = m.start;
    assert.ok(!inBuilding(s.x, s.z), `${m.id}: the start is not inside a building`);
    assert.ok(edgeDist(s.x, s.z) > 1.5, `${m.id}: the vehicle has room at the start (${edgeDist(s.x, s.z)} m)`);
    assert.ok(roadDist(s.x, s.z, ['secondary', 'primary', 'tertiary', 'residential']) < 4, `${m.id}: the start is on a road`);
    const t = first || (() => { const st = m.createState().stops; return [st[0].x, st[0].z]; })();
    const want = Math.atan2(t[0] - s.x, t[1] - s.z);
    let d = want - s.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    assert.ok(Math.abs(d) < 0.6, `${m.id}: the start faces its first objective (off by ${d.toFixed(2)} rad)`);
  }
  // (the address point itself lies in the OSM footprint it belongs to: the start is in front of it)
  assert.ok(inBuilding(HELDSTAB.x, HELDSTAB.z));
  assert.ok(Math.hypot(QUAD_START.x - HELDSTAB.x, QUAD_START.z - HELDSTAB.z) < 25);
});

test('the quad course keeps out of the buildings and runs on real tracks for the off-road part', () => {
  for (let i = 2; i < QUAD_ROUTE.length; i += 2) {
    const n = Math.ceil(Math.hypot(QUAD_ROUTE[i] - QUAD_ROUTE[i - 2], QUAD_ROUTE[i + 1] - QUAD_ROUTE[i - 1]) / 2);
    for (let k = 0; k <= n; k++) {
      const x = QUAD_ROUTE[i - 2] + ((QUAD_ROUTE[i] - QUAD_ROUTE[i - 2]) * k) / n, z = QUAD_ROUTE[i - 1] + ((QUAD_ROUTE[i + 1] - QUAD_ROUTE[i - 1]) * k) / n;
      assert.ok(!inBuilding(x, z), `the course at ${x.toFixed(0)}, ${z.toFixed(0)} is clear of the buildings`);
    }
  }
  const off = quadOffroad();
  assert.ok(off.begins > 500 && off.begins < 900, `the off-road part begins ${off.begins} m from the start`);
  assert.ok(off.length > 900, `off road for ${off.length} m`);
  assert.ok(quadRouteLength() > 2300 && quadRouteLength() < 3400);
  // (the gates stand on the way: most on OSM tracks, the two meadow crossings by design)
  let onTrack = 0;
  for (const [x, z] of QUAD_GATES.course) if (roadDist(x, z, ['track', 'service']) < 6) onTrack++;
  assert.ok(onTrack >= QUAD_GATES.course.length - 2, `${onTrack}/${QUAD_GATES.course.length} course gates on tracks`);
  for (const b of QUAD_BUMPS) assert.ok(!inBuilding(b.x, b.z), 'a bump clear of the buildings');
  for (const p of QUAD_PATCHES) assert.ok(!inBuilding(p.x, p.z), 'a patch clear of the buildings');
});

test('both ways leave the vehicle room: no stretch runs along a house', () => {
  for (const [route, room, name] of [[QUAD_ROUTE, 1.2, 'quad'], [BIO_ROUTE, 1.5, 'round']]) {
    for (let i = 2; i < route.length; i += 2) {
      const n = Math.ceil(Math.hypot(route[i] - route[i - 2], route[i + 1] - route[i - 1]) / 2);
      for (let k = 0; k <= n; k++) {
        const x = route[i - 2] + ((route[i] - route[i - 2]) * k) / n, z = route[i - 1] + ((route[i + 1] - route[i - 1]) * k) / n;
        assert.ok(edgeDist(x, z) > room, `${name} at ${x.toFixed(0)}, ${z.toFixed(0)}: ${edgeDist(x, z).toFixed(1)} m to the next wall`);
      }
    }
  }
});

test('a mound: its crest launches a fast quad, a clean jump takes time off once, a slow one only rolls over', () => {
  const b = QUAD_BUMPS[0];
  const s = Math.sin(b.heading), c = Math.cos(b.heading);
  assert.equal(bumpAt(b.x + 50, b.z).h, 0);
  assert.ok(Math.abs(bumpAt(b.x, b.z).h - b.h) < 1e-6);
  const run = (speed) => {
    const state = QUAD_MISSION.createState();
    let launched = 0, landed = 0;
    for (let k = -6 / (speed * DT); k * speed * DT < 40; k++) {
      const d = k * speed * DT;
      const ev = stepQuad(state, { x: b.x + s * d, z: b.z + c * d, speed }, DT);
      if (ev === 'launch') launched++;
      if (ev === 'land') landed++;
    }
    return { state, launched, landed };
  };
  const fast = run(16);
  assert.equal(fast.launched, 1);
  assert.equal(fast.landed, 1);
  assert.equal(fast.state.jumps, 1);
  assert.equal(fast.state.penaltyMs, -QUAD.airBonusMs);
  assert.ok(fast.state.lastAir > QUAD.cleanAir && fast.state.lastAir < 1.3, `air time ${fast.state.lastAir}`);
  const slow = run(QUAD.minLaunch - 2);
  assert.equal(slow.launched, 0);
  assert.equal(slow.state.jumps, 0);
  // (the same bump twice: no second bonus)
  const state = QUAD_MISSION.createState();
  for (let pass = 0; pass < 2; pass++) for (let k = -5; k < 60; k++) stepQuad(state, { x: b.x + s * k * 0.5, z: b.z + c * k * 0.5, speed: 16 }, DT);
  assert.equal(state.jumps, 1);
});

test('the surfaces: mud and old snow take the grip away, and in the air there is none', () => {
  const mud = QUAD_PATCHES.find((p) => p.kind === 'mud'), snow = QUAD_PATCHES.find((p) => p.kind === 'snow');
  assert.equal(surfaceAt(mud.x, mud.z), 'mud');
  assert.equal(surfaceAt(snow.x, snow.z), 'snow');
  assert.equal(surfaceAt(0, 0), null);
  assert.ok(QUAD.surfaces.mud.grip < QUAD.drive.grip / 2 && QUAD.surfaces.snow.grip < QUAD.surfaces.mud.grip);
  assert.ok(QUAD.air.grip < QUAD.surfaces.snow.grip);
  for (const d of [QUAD.drive, QUAD.air, ...Object.values(QUAD.surfaces)]) assert.ok(d.acceleration > 0, 'js/controllers.js divides by it');
  // (js/controllers.js driveSpeed takes the rolling resistance and the drag off first: a patch must not hold the quad
  // back from pulling away, nor from reaching its limit)
  for (const [kind, d] of Object.entries(QUAD.surfaces)) {
    assert.ok(d.acceleration > d.rolling, `${kind}: it pulls away from a standstill`);
    assert.ok(d.acceleration > d.rolling + d.drag * d.speed * d.speed, `${kind}: it reaches its limit under power`);
    assert.ok(d.rolling + d.drag * 15 * 15 > 2, `${kind}: it brakes a fast quad`);
  }
  const state = QUAD_MISSION.createState();
  stepQuad(state, { x: mud.x, z: mud.z, speed: 5 }, DT);
  stepQuad(state, { x: mud.x + 1, z: mud.z, speed: 5 }, DT);
  assert.equal(state.patches, 1, 'one patch counted once');
  assert.equal(createQuadJump().air, false);
});

test('the quad mission: gate by gate along the course to the finish', () => {
  const m = QUAD_MISSION, state = m.createState();
  let t = 0, i = 0, steps = 0;
  for (const key of ['town', 'course', 'back']) {
    const o = m.objectives[i++];
    const list = [...QUAD_GATES[key], ...(key === 'back' ? [[QUAD.finish.x, QUAD.finish.z]] : [])];
    let v = null;
    for (const [x, z] of list) {
      assert.equal(o.check(frame({ x: x + 200, z, t }), state).done, false, 'not from afar');
      v = o.check(frame({ x, z, t }), state);
      t += 20000; steps++;
    }
    assert.equal(v.done, true, `${key} done after its last gate`);
  }
  assert.equal(steps, QUAD_GATES.town.length + QUAD_GATES.course.length + QUAD_GATES.back.length + 1);
  assert.equal(m.objectives[0].check(frame({ t: m.timeLimitMs + 1 }), m.createState()).fail.length > 0, true);
  assert.equal(medalFor(m.medals.gold - 1, m.medals), 'gold');
});

test('the barrels stand on the verge, clear of the houses, two with plastic, never the first', () => {
  for (const seed of [1, 2, 3, 77, 12345, 999999]) {
    const stops = bioStops(seed);
    assert.equal(stops.length, 10);
    const far = Math.hypot(stops[9].x - BIO_PLANT.x, stops[9].z - BIO_PLANT.z);
    assert.ok(far > 60, `the last barrel stands on the way, not at the plant (${far} m)`);
    assert.equal(stops.filter((s) => s.plastic).length, 2, `seed ${seed}`);
    assert.equal(stops[0].plastic, false);
    const [a, b] = stops.filter((s) => s.plastic).map((s) => s.i);
    assert.ok(b - a >= 2, 'not next to each other');
    for (const s of stops) {
      assert.ok(!inBuilding(s.x, s.z), `barrel ${s.i} at ${s.x}, ${s.z} is outside the buildings`);
      assert.ok(edgeDist(s.x, s.z) > 0.8, `barrel ${s.i} stands clear (${edgeDist(s.x, s.z)} m)`);
      assert.ok(roadDist(s.x, s.z) < 7, `barrel ${s.i} stands by a road`);
    }
  }
});

test('the plant: at the given coordinates, outside the footprints, reached by a real road', () => {
  assert.equal(BIO_PLANT.x, 1506.44);
  assert.equal(BIO_PLANT.z, -413.81);
  assert.ok(Math.abs(BIO_PLANT.lv95.E - 2782500 - BIO_PLANT.x) < 1e-6);
  assert.ok(Math.abs(1185500 - BIO_PLANT.lv95.N - BIO_PLANT.z) < 1e-6);
  const H = BIO_HOPPER, s = Math.sin(H.heading), c = Math.cos(H.heading);
  for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = H.x + c * a * (H.halfW + 0.4) + s * b * (H.halfL + 0.4), z = H.z - s * a * (H.halfW + 0.4) + c * b * (H.halfL + 0.4);
    assert.ok(!inBuilding(x, z), 'the hopper stands in the open');
  }
  for (const d of BIO_DIGESTERS) for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    assert.ok(!inBuilding(d.x + Math.cos(a) * d.r, d.z + Math.sin(a) * d.r), 'a digester stands in the open');
    assert.ok(roadDist(d.x, d.z) > d.r + 3, 'a digester keeps off the road');
  }
  assert.ok(roadDist(BIO_PLANT.x, BIO_PLANT.z, ['track', 'service']) < BIO.plantR + 1, 'the hopper is reached from the Duchliweg');
  // (the round's way ends on the Duchliweg, its tail in reach of the hopper)
  const ex = BIO_ROUTE.at(-2), ez = BIO_ROUTE.at(-1);
  assert.ok(Math.hypot(ex - BIO_PLANT.x, ez - BIO_PLANT.z) < BIO.plantR + BIO.rear);
  for (let i = 2; i < BIO_ROUTE.length; i += 2) {
    const n = Math.ceil(Math.hypot(BIO_ROUTE[i] - BIO_ROUTE[i - 2], BIO_ROUTE[i + 1] - BIO_ROUTE[i - 1]) / 3);
    for (let k = 0; k <= n; k++) {
      const x = BIO_ROUTE[i - 2] + ((BIO_ROUTE[i] - BIO_ROUTE[i - 2]) * k) / n, z = BIO_ROUTE[i - 1] + ((BIO_ROUTE[i + 1] - BIO_ROUTE[i - 1]) * k) / n;
      assert.ok(!inBuilding(x, z), `the way at ${x.toFixed(0)}, ${z.toFixed(0)} is clear`);
      assert.ok(roadDist(x, z, ['track', 'service', 'residential', 'tertiary', 'secondary', 'primary', 'unclassified']) < 4, `the way at ${x.toFixed(0)}, ${z.toFixed(0)} is on a road`);
    }
  }
});

// (a truck with its load bed at the stop)
const truckAt = (s, speed = 0) => ({ x: s.x + Math.sin(0.5) * BIO.rear, z: s.z + Math.cos(0.5) * BIO.rear, heading: 0.5, speed });
const bioState = (seed = 5) => {
  const st = BIO_MISSION.createState();
  st.stops = bioStops(seed).map((s) => ({ ...s, done: false, t: 0, counted: false, rejected: false }));
  return st;
};

test('the round: the crew loads while the truck stands; plastic loaded spoils the batch, rejecting it saves it', () => {
  const m = BIO_MISSION;
  // a clean barrel loads through the refuse round's logic, and the gauge rises
  let st = bioState();
  const clean = st.stops.find((s) => !s.plastic);
  for (let k = 0; k < (BIO.loadS + 0.1) / DT; k++) stepBioStops(st, truckAt(clean), DT);
  m.update(frame(), st);
  assert.equal(clean.done, true);
  assert.equal(st.collected, 1);
  assert.equal(st.spoiled, false);
  assert.ok(bioLoad(st) > 0.1);
  assert.equal(stepBioStops(st, truckAt(clean, 5), DT), null, 'moving: nothing');
  // a plastic barrel loaded: spoiled
  st = bioState();
  const bad = st.stops.find((s) => s.plastic);
  for (let k = 0; k < (BIO.loadS + 0.1) / DT; k++) stepBioStops(st, truckAt(bad), DT);
  m.update(frame(), st);
  assert.equal(st.spoiled, true);
  assert.equal(st.spoiledBarrels, 1);
  // rejected in time: no harm
  st = bioState();
  const bad2 = st.stops.find((s) => s.plastic);
  for (let k = 0; k < 1 / DT; k++) stepBioStops(st, truckAt(bad2), DT);
  assert.equal(stopAtBed(st, truckAt(bad2)), bad2);
  assert.equal(rejectBarrel(st, truckAt(bad2)), 'rejected');
  m.update(frame(), st);
  assert.equal(st.rejected, 1);
  assert.equal(st.spoiled, false);
  assert.equal(bad2.done, true);
  assert.equal(st.collected, 0);
  // no barrel at the bed, or still moving: the key does nothing; a clean barrel rejected costs points
  assert.equal(rejectBarrel(st, truckAt(st.stops.find((s) => !s.done), 5)), null);
  const good = st.stops.find((s) => !s.done && !s.plastic);
  assert.equal(rejectBarrel(st, truckAt(good)), 'wrong');
  assert.equal(st.wrong, 1);
});

test('the load bed: a place for every barrel, side by side and stacked, on the boards', () => {
  assert.ok(BIO_BED_SLOTS.length >= BIO_MISSION.createState().stops.length, 'all ten fit');
  const { r, h } = BIO_BARREL;
  BIO_BED_SLOTS.forEach(([x, y, z], i) => {
    assert.ok(Math.abs(x) + r <= BIO_BED.halfW + 0.01 && z - r >= BIO_BED.z0 && z + r <= BIO_BED.z1, `slot ${i} on the bed`);
    assert.ok(y === BIO_BED.y || Math.abs(y - BIO_BED.y - h) < 1e-9, `slot ${i} on the boards or on a barrel`);
    BIO_BED_SLOTS.forEach(([x2, y2, z2], j) => {
      if (j > i && y === y2) assert.ok(Math.hypot(x - x2, z - z2) >= 2 * r, `slots ${i} and ${j} do not overlap`);
    });
  });
  // (the upper ones stand on two lower ones)
  assert.ok(BIO_BED_SLOTS.filter(([, y]) => y > BIO_BED.y).every(([x, , z]) => BIO_BED_SLOTS.some(([x2, y2, z2]) => y2 === BIO_BED.y && x2 === x && Math.abs(z2 - z) < 0.6)));
  // from the side: a barrel on the verge counts with the truck beside it, whichever side
  const st = bioState(), s = st.stops[0];
  for (const side of [-1, 1]) assert.equal(stopAtBed(st, { x: s.x + side * 3.5, z: s.z + BIO.rear, heading: 0, speed: 0 }), s);
  assert.equal(stopAtBed(st, { x: s.x + 3.5, z: s.z + 12, heading: 0, speed: 0 }), null, 'driven past it: no');
});

test('the score: barrels, a clean load and time; a spoiled batch is far from gold', () => {
  const finished = (o) => {
    const st = bioState();
    Object.assign(st, { collected: 8, rejected: 2, wrong: 0, spoiled: false, spoiledBarrels: 0, unloaded: 1, tMs: BIO.fastMs }, o);
    return bioScore(st);
  };
  assert.equal(finished({}), 8 * 10 + 2 * 15 + 60 + 80);
  assert.equal(medalFor(finished({}), BIO_MISSION.medals, true), 'gold');
  assert.ok(finished({ tMs: BIO.slowMs }) < finished({}));
  assert.equal(finished({ tMs: BIO.slowMs }), 170);
  assert.equal(medalFor(finished({ tMs: BIO.slowMs }), BIO_MISSION.medals, true), 'bronze');
  assert.equal(medalFor(finished({ tMs: 500000 }), BIO_MISSION.medals, true), 'silver');
  const spoiled = finished({ collected: 9, rejected: 1, spoiled: true, spoiledBarrels: 1 });
  assert.equal(spoiled, 8 * 10 + 15 - 40 + 80);
  assert.equal(medalFor(spoiled, BIO_MISSION.medals, true), 'bronze', 'a spoiled batch stays at bronze');
  assert.ok(finished({ collected: 0, rejected: 0, tMs: 1e9 }) === 0);
});

test('the unload: at the hopper with the truck standing; the round ends there with bins left out', () => {
  const m = BIO_MISSION, st = bioState();
  const h = Math.atan2(136, 85);
  const at = { x: BIO_PLANT.x + Math.sin(h) * BIO.rear, z: BIO_PLANT.z + Math.cos(h) * BIO.rear, heading: h };
  // far away nothing unloads
  m.update(frame({ x: 0, z: 0, heading: h }), st);
  assert.equal(st.atPlant, false);
  st.collected = 3;
  m.update(frame(at), st);
  assert.equal(st.atPlant, true);
  assert.equal(m.objectives[0].check(frame(at), st).done, true, 'the round ends at the plant');
  assert.equal(st.missed, st.stops.filter((s) => !s.plastic).length);
  const o = m.objectives[1];
  let v;
  assert.equal(o.check(frame({ ...at, speed: 5 }), st).done, false);
  for (let k = 0; k < (BIO.unloadS + 0.1) / DT; k++) v = o.check(frame(at), st);
  assert.equal(v.done, true);
  assert.equal(st.unloaded, 1);
  assert.equal(bioLoad(st), 0, 'the gauge is empty');
});
