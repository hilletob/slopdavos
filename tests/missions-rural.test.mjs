import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RURAL_MISSIONS, QUAD, QUAD_MISSION, QUAD_START, QUAD_ROUTE, QUAD_GATES, QUAD_BUMPS, QUAD_PATCHES, HELDSTAB, quadOffroad, quadRouteLength,
  bumpAt, surfaceAt, stepQuad, createQuadJump,
  BIO, BIO_MISSION, BIO_START, BIO_ROUTE, BIO_PLANT, BIO_HOPPER, BIO_DIGESTERS, BIO_BARREL, BIO_BED, BIO_BED_SLOTS, BIO_HOTELS, bioStops, bioGuide, bioRouteLength, stopAtBed, rejectBarrel, bioLoad, bioScore, stepBioStops
} from '../js/missions-data-rural.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor, missionMedals } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { SHOPS_DATA } from '../js/shops-data.js';

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
  assert.ok(Math.hypot(ex - BIO_PLANT.x, ez - BIO_PLANT.z) < BIO.plantR - 1.5, 'stopped at the way\'s end, the load bed is beside the hopper');
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
  assert.equal(medalFor(finished({ tMs: (BIO.fastMs + BIO.slowMs) / 2 }), BIO_MISSION.medals, true), 'silver');
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

test('the barrels stand at real hotels: on the street in front of each, the next one in the panel by name', () => {
  assert.equal(BIO_HOTELS.length, 10);
  const stops = bioStops(3);
  BIO_HOTELS.forEach((h, i) => {
    // (the hotel as OSM has it, js/shops-data.js)
    const osm = SHOPS_DATA.find((s) => s.osm === h.osm);
    assert.ok(osm && osm.kind === 'hotel', `${h.name} is a hotel in the OSM data`);
    assert.ok(Math.hypot(osm.x - h.x, osm.z - h.z) < 0.5, `${h.name}: its point`);
    const s = stops[i];
    assert.equal(s.name, h.name);
    const d = Math.hypot(s.x - h.x, s.z - h.z);
    assert.ok(d < 40, `${h.name}: the barrel ${d.toFixed(1)} m from the hotel`);
    // (its own hotel's barrel, not the neighbour's)
    for (const o of BIO_HOTELS) if (o !== h) assert.ok(Math.hypot(s.x - o.x, s.z - o.z) > d, `${h.name}: nearer its own hotel than ${o.name}`);
    if (i) assert.ok(h.s > BIO_HOTELS[i - 1].s, 'in the order of the way');
  });
  const st = BIO_MISSION.createState(), v = BIO_MISSION.objectives[0].check(frame({ x: BIO_START.x, z: BIO_START.z }), st);
  assert.match(v.text, /· next Turmhotel Victoria \d+ m$/);
  assert.ok(BIO_MISSION.intro.includes('hotels'));
});

test('the way to the plant: round the hotels in the one-way streets\' direction, then out the Dischmastrasse, not over the Bünda', () => {
  const named = (names) => DAVOS_DATA.roads.filter((r) => names.includes(r.name));
  const distTo = (roads, x, z) => {
    let best = Infinity;
    for (const r of roads) for (let i = 2; i < r.pts.length; i += 2) {
      const p = r.pts, dx = p[i] - p[i - 2], dz = p[i + 1] - p[i - 1], L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - p[i - 2]) * dx + (z - p[i - 1]) * dz) / L));
      best = Math.min(best, Math.hypot(p[i - 2] + dx * t - x, p[i - 1] + dz * t - z));
    }
    return best;
  };
  const along = (from, to, step = 10) => {
    const out = [];
    let s = 0;
    for (let i = 2; i < BIO_ROUTE.length; i += 2) {
      const L = Math.hypot(BIO_ROUTE[i] - BIO_ROUTE[i - 2], BIO_ROUTE[i + 1] - BIO_ROUTE[i - 1]);
      for (let u = 0; u < L; u += step) if (s + u >= from && s + u <= to) out.push([BIO_ROUTE[i - 2] + ((BIO_ROUTE[i] - BIO_ROUTE[i - 2]) * u) / L, BIO_ROUTE[i - 1] + ((BIO_ROUTE[i + 1] - BIO_ROUTE[i - 1]) * u) / L, (BIO_ROUTE[i] - BIO_ROUTE[i - 2]) / L, (BIO_ROUTE[i + 1] - BIO_ROUTE[i - 1]) / L]);
      s += L;
    }
    return out;
  };
  const L = bioRouteLength();
  assert.ok(L > 3000 && L < 3700, `the way is ${L.toFixed(0)} m`);
  // (from the last hotel to the ranch's farm road: on the Dischmastrasse all the way)
  const dischma = named(['Dischmastrasse']), last = BIO_HOTELS.at(-1).s;
  const out = along(last, L - 300);
  assert.ok(out.length > 80);
  for (const [x, z] of out.slice(0, -14)) assert.ok(distTo(dischma, x, z) < 4, `on the Dischmastrasse at ${x.toFixed(0)}, ${z.toFixed(0)}`);
  // (never on the lanes above the Bünda the old round took, nor on the Duchliweg's track down from the Mattawald)
  // (the Mühlestrasse from where it leaves the Bahnhofstrasse's crossing up)
  const bunda = [...named(['Bedraweg', 'Mattawaldstrasse', 'Seehornstrasse', 'Museumstrasse']), ...DAVOS_DATA.roads.filter((r) => ['w1270620584', 'w36977734', 'w26127867', 'w36977731', 'w606814550', 'w36977733', 'w80349750'].includes(r.id))];
  for (const [x, z] of along(0, L, 5)) assert.ok(distTo(bunda, x, z) > 12, `the way at ${x.toFixed(0)}, ${z.toFixed(0)} keeps off the Bünda lanes`);
  // (the one-way Promenade, Talstrasse and Bahnhofstrasse in their direction)
  const oneway = DAVOS_DATA.roads.filter((r) => r.oneway && ['primary', 'secondary', 'tertiary', 'residential'].includes(r.kind));
  let checked = 0;
  for (const [x, z, tx, tz] of along(0, L, 4)) {
    for (const r of oneway) for (let i = 2; i < r.pts.length; i += 2) {
      const p = r.pts, dx = p[i] - p[i - 2], dz = p[i + 1] - p[i - 1], LL = Math.hypot(dx, dz) || 1;
      const t = ((x - p[i - 2]) * dx + (z - p[i - 1]) * dz) / (LL * LL);
      if (t < 0.05 || t > 0.95 || Math.hypot(p[i - 2] + dx * t - x, p[i - 1] + dz * t - z) > 1.5) continue;
      if (Math.abs((tx * dx + tz * dz) / LL) < 0.7) continue; // (a crossing)
      checked++;
      assert.ok(((tx * dx + tz * dz) / LL) * (r.reverse ? -1 : 1) > 0, `${r.name} at ${x.toFixed(0)}, ${z.toFixed(0)}: with the one-way`);
    }
  }
  assert.ok(checked > 100, `${checked} points on one-way streets`);
});

test('the arrow to the plant leads along the way: out the Dischmastrasse, through the yard, the hopper last', () => {
  const m = BIO_MISSION, st = bioState(), o = m.objectives[1];
  const L = bioRouteLength(), last = BIO_HOTELS.at(-1).s;
  // (driven along the way from the last hotel: the target always ahead on it, near the truck, the hopper at the end)
  const pts = [];
  let s = 0;
  for (let i = 2; i < BIO_ROUTE.length; i += 2) {
    const l = Math.hypot(BIO_ROUTE[i] - BIO_ROUTE[i - 2], BIO_ROUTE[i + 1] - BIO_ROUTE[i - 1]);
    for (let u = 0; u < l; u += 5) if (s + u > last) pts.push([BIO_ROUTE[i - 2] + ((BIO_ROUTE[i] - BIO_ROUTE[i - 2]) * u) / l, BIO_ROUTE[i - 1] + ((BIO_ROUTE[i + 1] - BIO_ROUTE[i - 1]) * u) / l, s + u]);
    s += l;
  }
  let pad = 0;
  for (const [x, z, sx] of pts) {
    const v = o.check(frame({ x, z, speed: 10 }), st);
    assert.ok(Math.abs(st.guideS - sx) < 3, `on the way at ${sx.toFixed(0)}: placed at ${st.guideS.toFixed(0)}`);
    const d = Math.hypot(v.target.x - x, v.target.z - z);
    if (v.target.style === 'pad') { pad++; assert.ok(L - sx < 95); continue; }
    assert.ok(d > 30 && d < BIO.guideAhead + 1, `the arrow ${d.toFixed(0)} m ahead at ${sx.toFixed(0)}`);
    assert.match(v.text, /^To the hopper · /);
  }
  assert.ok(pad > 5, 'the hopper itself at the end');
  // (in the yard, where the way turns back to the hopper, the arrow does not cut across: it stays on the way)
  const yard = bioGuide(1560, -296, L - 200);
  assert.ok(yard.s > L - 200 && yard.z < -296, 'from the barns on towards the track');
  // (off the way: back to it)
  const g = bioGuide(1250, -700, 2300);
  assert.equal(g.off, true);
  assert.ok(Math.hypot(g.x - 1250, g.z + 700) < Math.hypot(BIO_PLANT.x - 1250, BIO_PLANT.z + 700));
});

// An ideal round on the way, from the truck's handling (js/missions-rural.js buildBioTruck drive): full power to the top
// speed with the power limit of js/controllers.js driveSpeed, the bends at 3.2 m/s² across, 4.5 m/s² of braking, a stop
// at every hotel for the loading and at the hopper for the unloading (the old round's 1.9 km came out at 4:23 this way)
function idealRound(pts, stopsS, drive, ds = 1) {
  const n = pts.length / 2, cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]));
  const L = cum[n - 1], N = Math.ceil(L / ds) + 1, v = new Float64Array(N).fill(drive.speed);
  for (let i = 1; i < n - 1; i++) {
    const ax = pts[2 * i] - pts[2 * i - 2], az = pts[2 * i + 1] - pts[2 * i - 1], bx = pts[2 * i + 2] - pts[2 * i], bz = pts[2 * i + 3] - pts[2 * i + 1];
    let a = Math.atan2(bx, bz) - Math.atan2(ax, az);
    a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    if (a < 0.05) continue;
    const span = Math.min(Math.hypot(ax, az), Math.hypot(bx, bz), 20), vb = Math.sqrt((3.2 * span) / a);
    for (let k = Math.floor((cum[i] - span / 2) / ds); k <= Math.ceil((cum[i] + span / 2) / ds); k++) if (k >= 0 && k < N) v[k] = Math.min(v[k], vb);
  }
  for (const s of [0, ...stopsS, L]) v[Math.min(N - 1, Math.round(s / ds))] = 0;
  for (let k = N - 2; k >= 0; k--) v[k] = Math.min(v[k], Math.sqrt(v[k + 1] ** 2 + 2 * 4.5 * ds));
  for (let k = 1; k < N; k++) {
    const a = (drive.acceleration * drive.powerSpeed) / Math.max(drive.powerSpeed, v[k - 1]) - drive.rolling - drive.drag * v[k - 1] ** 2;
    v[k] = Math.min(v[k], Math.sqrt(v[k - 1] ** 2 + 2 * Math.max(0.05, a) * ds));
  }
  let t = 0;
  for (let k = 1; k < N; k++) t += ds / Math.max(0.3, (v[k] + v[k - 1]) / 2);
  return t + stopsS.length * BIO.loadS + BIO.unloadS;
}

test('the medals fit the way: the ideal round under the full time bonus, gold for a good one, time enough for all', () => {
  const drive = { speed: 13.5, acceleration: 2.1, powerSpeed: 7, rolling: 0.25, drag: 0.0009 };
  const ideal = idealRound(BIO_ROUTE, BIO_HOTELS.map((h) => h.s), drive) * 1000;
  assert.ok(ideal > 330000 && ideal < 420000, `the ideal round: ${(ideal / 1000).toFixed(0)} s`);
  assert.ok(BIO.fastMs > ideal * 1.05 && BIO.fastMs < ideal * 1.35, 'the full bonus only near the ideal');
  // (gold, all right: 170 + the time bonus over 55: by ~1.5 times the ideal)
  const k = (BIO_MISSION.medals.gold - 170) / BIO.points.time, goldMs = BIO.slowMs - k * (BIO.slowMs - BIO.fastMs);
  assert.ok(goldMs > ideal * 1.35 && goldMs < ideal * 1.75, `gold by ${(goldMs / 1000).toFixed(0)} s`);
  assert.ok(BIO_MISSION.timeLimitMs > BIO.slowMs * 1.3);
});
