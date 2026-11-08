import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  WEF_MISSIONS, WEF_ESCORT_MISSION, ANTI_WEF_MISSION, createTrail, trailPush, trailAt, trailLength, trailBend, createFollower, stepFollowers, routeOf, projectRoute, routeAhead, yieldStep,
  ESCORT, ESCORT_START, ESCORT_ROUTE, ESCORT_ROUTE_PTS, ESCORT_SEED, ESCORT_LENGTH, PICKUP, DROPOFF, WEF_GATES, ROADBLOCK, DETOUR_TURN, createEscort, escortStep, escortRadio, escortScore, escortBlocked, escortDelay, cohesionShare, isCrash, roadblockPush,
  MARCH, MARCH_ROUTE, MARCH_ROUTE_PTS, MARCH_SEED, MARCH_START, MARCH_RHYTHM, MARCH_SLOGANS, LIAISON, RALLY, FENCE, createMarch, marchStep, marchCall, marchChoose, marchScore, chantQuality, routeShare
} from '../js/missions-data-wef.js';
import { HEADBANG } from '../js/missions-data-fun.js';
import { seededRandom } from '../js/missions-data-local.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { medalFor, missionMedals, missionPin } from '../js/missions-progress.js';

const DT = 1 / 30;
const frame = (over = {}) => ({ mode: 'car', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: DT, t: 0, blueLight: true, ...over });

function inRing(x, z, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const a = ring[i + 1] > z, b = ring[j + 1] > z;
    if (a !== b && x < ((ring[j] - ring[i]) * (z - ring[i + 1])) / (ring[j + 1] - ring[i + 1]) + ring[i]) c = !c;
  }
  return c;
}
const inBuilding = (x, z) => DAVOS_DATA.buildings.some((b) => inRing(x, z, b.ring));
const streetDistance = (x, z) => {
  let best = Infinity;
  for (const r of DAVOS_DATA.roads) {
    if (r.kind === 'footway' || r.kind === 'path') continue;
    for (let i = 2; i < r.pts.length; i += 2) {
      const ax = r.pts[i - 2], az = r.pts[i - 1], dx = r.pts[i] - ax, dz = r.pts[i + 1] - az, L2 = dx * dx + dz * dz || 1e-6;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      best = Math.min(best, Math.hypot(ax + dx * k - x, az + dz * k - z));
    }
  }
  return best;
};

// --- Registration ---------------------------------------------------------------------------------------------------------
test('the WEF missions are registered, by points, with their pins apart from every other mission', () => {
  assert.deepEqual(WEF_MISSIONS.map((m) => m.id), ['wef-escort', 'anti-wef-demo']);
  for (const m of WEF_MISSIONS) {
    assert.equal(getMission(m.id), m);
    assert.ok(m.scoreMode);
    assert.equal(m.season, 'winter');
    const l = missionMedals(m);
    assert.ok(l.gold > l.silver && l.silver > l.bronze);
    assert.ok(m.icon);
    const pin = missionPin(m);
    for (const o of MISSIONS) if (o !== m) { const p = missionPin(o); assert.ok(Math.hypot(p.x - pin.x, p.z - pin.z) > 30, `${m.id} vs ${o.id}`); }
  }
  assert.ok(WEF_ESCORT_MISSION.features.includes('policeCar'));
});

test('the runtime is preloaded and the missions join in the engine', () => {
  const html = readFileSync(new URL('../play.html', import.meta.url), 'utf8');
  assert.match(html, /missions-data-wef\.js/);
  assert.match(html, /missions-wef\.js/);
  const locations = JSON.parse(readFileSync(new URL('../docs/missions-locations.json', import.meta.url), 'utf8'));
  for (const id of ['wef-escort', 'anti-wef-demo']) assert.ok(locations.missions.find((m) => m.id === id)?.unsicherheit, id);
});

test('no real person, leader or company in the texts; nothing violent in the march', () => {
  const texts = JSON.stringify(WEF_MISSIONS.map((m) => [m.title, m.intro, m.finish])) + JSON.stringify(MARCH_SLOGANS);
  assert.doesNotMatch(texts, /Trump|Merkel|Biden|Schwab|Musk|Putin|Xi |Google|Nestl|UBS|Novartis/i);
  assert.doesNotMatch(texts, /throw|stone|brick|riot|smash|attack|burn/i);
});

// --- The trail ------------------------------------------------------------------------------------------------------------
test('trail: a new point every step, interpolation with direction, clamped at the ends', () => {
  const tr = createTrail([0, 0, 0, 10]);
  assert.equal(trailLength(tr), 10);
  assert.equal(trailPush(tr, 0, 11), false, 'too close to the last point');
  assert.equal(trailPush(tr, 0, 13), true);
  assert.equal(trailLength(tr), 13);
  const p = trailAt(tr, 5);
  assert.deepEqual([p.x, p.z, p.dx, p.dz], [0, 5, 0, 1]);
  assert.equal(trailAt(tr, -3).z, 0);
  assert.equal(trailAt(tr, 99).z, 13);
});

test('trail: backing up takes the last points off, no further than the first follower', () => {
  const tr = createTrail([0, 0, 0, 10]);
  for (let z = 12; z <= 30; z += 2) trailPush(tr, 0, z);
  assert.equal(trailLength(tr), 30);
  trailPush(tr, 0, 25);
  assert.ok(trailLength(tr) <= 26, 'the loop is gone');
  const guarded = createTrail([0, 0, 0, 10]);
  for (let z = 12; z <= 20; z += 2) trailPush(guarded, 0, z);
  trailPush(guarded, 0, 13, 18);
  assert.ok(trailLength(guarded) >= 18, 'never back past the follower');
});

test('trail: bends are measured ahead', () => {
  const straight = createTrail([0, 0, 0, 100]);
  assert.ok(trailBend(straight, 10) < 1e-6);
  const corner = createTrail([0, 0, 0, 50, 50, 50]);
  assert.ok(trailBend(corner, 44) > 0.05);
});

test('followers: they follow in order, at their distance, slow down in the bends and fall behind a leader too fast', () => {
  const tr = createTrail([0, 0, 0, 40]);
  const list = [createFollower(30, { vmax: 15 }), createFollower(20, { vmax: 15 })];
  let lead = 40;
  for (let i = 0; i < 300; i++) { lead += 12 * DT; trailPush(tr, 0, lead); stepFollowers(list, lead, tr, DT); }
  assert.ok(list[0].s > list[1].s, 'in order');
  assert.ok(lead - list[0].s < 30, 'they keep up at 12 m/s');
  const gapAt12 = lead - list[0].s;
  for (let i = 0; i < 300; i++) { lead += 25 * DT; trailPush(tr, 0, lead); stepFollowers(list, lead, tr, DT); }
  assert.ok(lead - list[0].s > gapAt12 + 60, 'a leader at 25 m/s drives away from them');
  assert.ok(list[0].v <= 15.0001);
  // in a sharp corner the top speed drops
  const c = createTrail([0, 0, 0, 100, 100, 100]);
  const f = createFollower(92, { vmax: 15, v: 15 });
  stepFollowers([f], 180, c, DT);
  assert.ok(f.v < 15);
});

test('route: projection stays near the running arc length', () => {
  const r = routeOf([0, 0, 100, 0, 100, 100]);
  const p = projectRoute(r, 50, 3, 40);
  assert.ok(Math.abs(p.s - 50) < 1e-6 && Math.abs(p.d - 3) < 1e-6);
  const q = routeAhead(r, 90, 30);
  assert.ok(Math.abs(q.x - 100) < 1e-6 && Math.abs(q.z - 20) < 1e-6);
  assert.deepEqual(routeAhead(r, 90, 30, 95), { x: 95, z: 0 });
});

test('traffic: a held car brakes to a stop and eases out to the kerb', () => {
  let y = { speed: 12, side: 0 };
  for (let i = 0; i < 300; i++) y = yieldStep(y.speed, y.side, DT);
  assert.equal(y.speed, 0);
  assert.ok(y.side > 2 && y.side <= 2.3);
});

// --- Where things stand ---------------------------------------------------------------------------------------------------
test('escort: start, pick-up, drop-off, gates and the whole route lie clear of the houses and on streets', () => {
  assert.ok(!inBuilding(ESCORT_START.x, ESCORT_START.z), 'the start');
  assert.ok(streetDistance(ESCORT_START.x, ESCORT_START.z) < 3.5, 'the start is on the street');
  // the start faces its target, along the Bahnhofstrasse
  const bearing = Math.atan2(PICKUP.x - ESCORT_START.x, PICKUP.z - ESCORT_START.z);
  assert.ok(Math.abs(bearing - ESCORT_START.heading) < 0.15);
  for (const p of [PICKUP, DROPOFF, DETOUR_TURN, ...WEF_GATES]) {
    assert.ok(!inBuilding(p.x, p.z), `${p.name || p.id}`);
    assert.ok(streetDistance(p.x, p.z) < 7, `${p.name || p.id} on a street`);
  }
  for (let s = 0; s < ESCORT_LENGTH; s += 4) {
    const p = trailAt(ESCORT_ROUTE, s);
    assert.ok(!inBuilding(p.x, p.z), `route at ${s}`);
    assert.ok(streetDistance(p.x, p.z) < 2.5, `route at ${s} off the street`);
  }
  for (let i = 0; i < ESCORT_SEED.length; i += 2) assert.ok(!inBuilding(ESCORT_SEED[i], ESCORT_SEED[i + 1]));
  assert.ok(ESCORT_ROUTE_PTS.length > 60);
  assert.ok(streetDistance(ROADBLOCK.x, ROADBLOCK.z) < 3);
});

test('escort: Promenade and Talstrasse are driven in their one-way direction', () => {
  const dirOn = (name, x, z, dx, dz) => {
    for (const r of DAVOS_DATA.roads) {
      if (r.name !== name || !r.oneway) continue;
      for (let i = 2; i < r.pts.length; i += 2) {
        const ax = r.pts[i - 2], az = r.pts[i - 1], bx = r.pts[i], bz = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az);
        const k = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L);
        if (k < 0 || k > 1 || Math.hypot(ax + (bx - ax) * k - x, az + (bz - az) * k - z) > 1.5) continue;
        return ((bx - ax) * dx + (bz - az) * dz) / L;
      }
    }
    return null;
  };
  const along = (s) => { const p = trailAt(ESCORT_ROUTE, s); return [p.x, p.z, p.dx, p.dz]; };
  let promenade = 0, talstrasse = 0;
  for (let s = 0; s < ESCORT_LENGTH; s += 6) {
    const [x, z, dx, dz] = along(s);
    const a = dirOn('Promenade', x, z, dx, dz), b = dirOn('Talstrasse', x, z, dx, dz);
    if (a !== null) { promenade++; assert.ok(a > 0, `the Promenade against its way at ${s}`); }
    if (b !== null) { talstrasse++; assert.ok(b > 0, `the Talstrasse against its way at ${s}`); }
  }
  assert.ok(promenade > 50 && talstrasse > 30, `${promenade} ${talstrasse}`);
});

test('march: start, liaison, rally and fence; the route on the Promenade, clear of the houses', () => {
  assert.ok(!inBuilding(MARCH_START.x, MARCH_START.z));
  assert.ok(streetDistance(MARCH_START.x, MARCH_START.z) < 2);
  for (const p of [RALLY, FENCE, { x: LIAISON.x, z: LIAISON.z }]) assert.ok(!inBuilding(p.x, p.z));
  assert.ok(!inBuilding(LIAISON.standX, LIAISON.standZ));
  const route = routeOf(MARCH_ROUTE_PTS), L = trailLength(route);
  for (let s = 0; s <= L; s += 3) { const p = trailAt(route, s); assert.ok(!inBuilding(p.x, p.z)); assert.ok(streetDistance(p.x, p.z) < 2.5); }
  // the start faces along the route
  const p = trailAt(route, 5);
  const bearing = Math.atan2(p.x - MARCH_START.x, p.z - MARCH_START.z);
  assert.ok(Math.abs(bearing - MARCH_START.heading) < 0.05);
  assert.ok(Math.hypot(RALLY.x - FENCE.x, RALLY.z - FENCE.z) > 40);
  for (let i = 0; i < MARCH_SEED.length; i += 2) assert.ok(!inBuilding(MARCH_SEED[i], MARCH_SEED[i + 1]));
});

// --- The escort, driven -----------------------------------------------------------------------------------------------------
/** A synthetic drive of the whole route at `pace` m/s (slowing for the gates when `careful`), through the objectives */
function driveEscort({ pace = 11, careful = true, radio = true, stopAt = null, jolt = 0 } = {}) {
  const m = WEF_ESCORT_MISSION, state = m.createState(), st = state.escort;
  let t = 0, index = 0, guard = 0, s = 0;
  const step = (x, z, speed) => {
    const ctx = frame({ x, z, speed, t: t * 1000, dt: DT });
    m.update(ctx, state);
    const v = m.objectives[index].check(ctx, state);
    if (v.fail) return v.fail;
    if (v.done) index++;
    t += DT;
    return null;
  };
  // to the pick-up
  while (index === 0 && guard++ < 3000) step(PICKUP.x, PICKUP.z, 0);
  let jolted = 0, speed = 0;
  while (index < m.objectives.length && guard++ < 60000) {
    const p = trailAt(ESCORT_ROUTE, s);
    let want = pace;
    if (careful) for (const g of WEF_GATES) if (Math.hypot(p.x - g.x, p.z - g.z) < 45) want = Math.min(want, 8);
    if (s >= ESCORT_LENGTH - 12) want = 0;
    speed += Math.max(-5 * DT, Math.min(3 * DT, want - speed));
    if (radio && !st.radioed && index === 2) escortRadio(st, { t: t * 1000 });
    if (stopAt !== null && s > stopAt && s < stopAt + 0.5) { for (let k = 0; k < 20 / DT; k++) { const f = step(p.x, p.z, 0); if (f) return { st, state, fail: f, t }; } s += 1; }
    if (jolt && jolted < jolt && s > 500 * (jolted + 1)) { jolted++; speed = 1; }
    const fail = step(p.x, p.z, speed);
    if (fail) return { st, state, fail, t };
    s = Math.min(ESCORT_LENGTH - 6, s + speed * DT);
  }
  assert.ok(index >= m.objectives.length, `stuck at ${m.objectives[index]?.id}, ${s}`);
  return { st, state, t };
}

test('escort: pick-up needs the blue light and a stop', () => {
  const m = WEF_ESCORT_MISSION, state = m.createState();
  const obj = m.objectives[0];
  assert.equal(obj.check(frame({ ...PICKUP, blueLight: false, dt: 5 }), state).done, false);
  assert.equal(obj.check(frame({ ...PICKUP, speed: 3, dt: 5 }), state).done, false);
  assert.equal(obj.check(frame({ ...PICKUP, dt: 5 }), state).done, true);
  assert.ok(state.escort.boarded);
});

test('escort: a clean run at a good pace wins gold; the convoy stays closed', () => {
  const { st, state } = driveEscort({ pace: 11 });
  assert.ok(st.arrived);
  assert.equal(st.crashes, 0);
  assert.equal(st.rushed, 0);
  assert.ok(cohesionShare(st) > 0.9, `${cohesionShare(st)}`);
  const score = WEF_ESCORT_MISSION.score(state);
  assert.equal(medalFor(score, missionMedals(WEF_ESCORT_MISSION), true), 'gold', `${score}`);
  assert.ok(st.gap < ESCORT.gapGood);
});

test('escort: too fast, and the convoy breaks up', () => {
  const { st, fail } = driveEscort({ pace: 30 });
  assert.ok(fail || cohesionShare(st) < 0.6);
  assert.ok(st.lost || st.gap > ESCORT.gapGood || cohesionShare(st) < 0.6);
});

test('escort: a rushed gate, a crash, a stop cost composure; a slow run loses the time points', () => {
  const rushed = driveEscort({ pace: 14, careful: false });
  assert.ok(rushed.st.rushed === WEF_GATES.length);
  assert.ok(rushed.st.composure <= 100 - WEF_GATES.length * ESCORT.gateRushed);
  const slow = driveEscort({ pace: 6.5 });
  const fast = driveEscort({ pace: 11 });
  assert.ok(escortScore(slow.st) < escortScore(fast.st) - 300, `${escortScore(slow.st)} ${escortScore(fast.st)}`);
  assert.ok(escortDelay(slow.st) > 0);
  const stopped = driveEscort({ pace: 11, stopAt: 800 });
  assert.ok(stopped.st.composure < 100 && stopped.st.composure > 60, `${stopped.st.composure}`);
  assert.equal(isCrash(14, 13.8, DT), false, 'braking is no crash');
  assert.equal(isCrash(14, 6, DT), true);
  const crashed = driveEscort({ pace: 11, jolt: 2 });
  assert.ok(crashed.st.crashes >= 2);
  assert.ok(crashed.st.composure <= 100 - 2 * ESCORT.crash);
});

test('escort: the medals tell runs apart', () => {
  const lim = missionMedals(WEF_ESCORT_MISSION);
  const medal = (o) => medalFor(escortScore(driveEscort(o).st), lim, true);
  assert.equal(medal({ pace: 11 }), 'gold');
  assert.ok(['silver', 'bronze'].includes(medal({ pace: 11, careful: false, radio: false, jolt: 2 })));
  assert.ok(['silver', 'bronze', null].includes(medal({ pace: 7 })));
});

test('escort: radio and roadblock', () => {
  const st = createEscort();
  assert.equal(escortRadio(st, { t: 0 }), false, 'nobody to radio for before the pick-up');
  st.boarded = true;
  assert.equal(escortRadio(st, { t: 0 }), true);
  assert.equal(escortRadio(st, { t: 0 }), false);
  const p = roadblockPush(ROADBLOCK.x + 1, ROADBLOCK.z);
  assert.ok(p.hit);
  assert.ok(Math.abs(Math.hypot(p.x - ROADBLOCK.x, p.z - ROADBLOCK.z) - ROADBLOCK.r) < 1e-6);
  assert.equal(roadblockPush(ROADBLOCK.x + 20, ROADBLOCK.z).hit, false);
  const before = st.composure;
  escortBlocked(st, { t: 0 });
  assert.equal(st.composure, before - ESCORT.blocked);
});

test('escort: the Scalettastrasse is the way round the block: the route misses it', () => {
  for (let s = 0; s < ESCORT_LENGTH; s += 3) {
    const p = trailAt(ESCORT_ROUTE, s);
    assert.ok(Math.hypot(p.x - ROADBLOCK.x, p.z - ROADBLOCK.z) > ROADBLOCK.r + 3, `at ${s}`);
  }
});

// --- The march, walked ------------------------------------------------------------------------------------------------------
/** A player of the march along the route at `pace` m/s, hitting the notes with `hit` of probability and a spread of `sigma` s */
function walkMarch({ pace = 2.9, hit = 0.9, sigma = 0.05, seed = 7, choice = 'stop', stray = false } = {}) {
  const m = ANTI_WEF_MISSION, state = m.createState(), st = state.march, rand = seededRandom(seed);
  let index = 0, t = 0, s = 0, guard = 0;
  const route = routeOf(MARCH_ROUTE_PTS), L = trailLength(route);
  const noise = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand()) * sigma;
  let plan = null; // the next tap, in song time
  while (index < m.objectives.length && guard++ < 120000) {
    const stopHere = st.dialog || (st.action && st.action.kind !== 'back') || s >= L - 2;
    const backing = st.action?.kind === 'back';
    const speed = stopHere ? 0 : backing ? 2.5 : pace;
    const p = trailAt(route, s);
    const off = stray && s > 60 && s < 90 ? 25 : 0;
    const ctx = frame({ mode: 'person', x: p.x + off, z: p.z, speed, t: t * 1000, dt: DT });
    m.update(ctx, state);
    // the chant
    const next = st.game.chart[st.game.next];
    if (next && (!plan || plan.note !== st.game.next) && !st.dialog) {
      plan = { note: st.game.next, at: rand() < hit ? next.t + noise() : Infinity };
    }
    if (plan && st.songT >= plan.at) { marchCall(st, ctx); plan = { note: plan.note, at: Infinity }; }
    if (st.dialog) marchChoose(st, choice, ctx);
    const v = m.objectives[index].check(ctx, state);
    if (v.fail) return { st, state, fail: v.fail, t };
    if (v.done) index++;
    s = backing ? Math.max(0, s - speed * DT) : Math.min(L, s + speed * DT);
    t += DT;
  }
  assert.ok(index >= m.objectives.length, `stuck at ${m.objectives[index]?.id}, count ${st.count}, gap ${st.gap}, s ${s}`);
  return { st, state, t };
}

test('march: the crowd follows the trail, in order and at its distance', () => {
  const st = createMarch();
  assert.equal(st.count, MARCH.startCount);
  const route = routeOf(MARCH_ROUTE_PTS);
  for (let s = 0, t = 0; s < 120; s += 2.8 * DT, t += DT) {
    const p = trailAt(route, s);
    marchStep(st, frame({ mode: 'person', x: p.x, z: p.z, speed: 2.8, t: t * 1000 }));
  }
  assert.ok(st.gap < MARCH.gapGood, `${st.gap}`);
  assert.ok(st.crowd.s > st.tail.s + 8);
  // and it is on the trail
  const c = trailAt(st.trail, st.crowd.s);
  assert.ok(projectRoute(MARCH_ROUTE, c.x, c.z, st.routeS - 10, 40, 40).d < 2);
});

test('march: createRhythm is the chant: calls and answers', () => {
  assert.ok(MARCH_RHYTHM.chart.length >= 40);
  assert.ok(Math.abs(MARCH_RHYTHM.chart[1].t - MARCH_RHYTHM.chart[0].t - MARCH_RHYTHM.beat) < 1e-9);
  // the crowd's bar stays free of notes
  for (const n of MARCH_RHYTHM.chart) assert.equal(Math.floor((n.beat - MARCH_RHYTHM.countIn) / 4) % 2, 0);
});

test('march: the chant waits for the clock to start', () => {
  const st = createMarch();
  for (let i = 0; i < 300; i++) marchStep(st, frame({ mode: 'person', x: MARCH_START.x, z: MARCH_START.z, t: 0 }));
  assert.equal(st.songT, 0);
  assert.equal(st.miss, 0);
  marchStep(st, frame({ mode: 'person', x: MARCH_START.x, z: MARCH_START.z, t: 40 }));
  assert.ok(st.songT > 0);
});

test('march: good chants grow the crowd, a lost beat shrinks it', () => {
  const good = walkMarch({ hit: 0.97, sigma: 0.03 });
  assert.ok(good.st.count > MARCH.startCount + 5, `${good.st.count}`);
  assert.ok(chantQuality(good.st) > 0.8);
  const bad = walkMarch({ hit: 0.05 });
  assert.ok(bad.fail || bad.st.count < MARCH.startCount, `${bad.st.count}`);
  assert.ok(bad.st.lost > 0);
  assert.ok(chantQuality(bad.st) < 0.3);
});

test('march: walking too fast thins the crowd', () => {
  const r = walkMarch({ pace: 4.4, hit: 0.9 });
  const calm = walkMarch({ pace: 2.8, hit: 0.9 });
  assert.ok(r.st.lost > calm.st.lost, `${r.st.lost} ${calm.st.lost}`);
});

test('march: each calm answer gets the march through', () => {
  for (const choice of ['stop', 'sit', 'back']) {
    const r = walkMarch({ choice });
    assert.ok(!r.fail, `${choice}: ${r.fail}`);
    assert.ok(r.st.arrived);
    assert.ok(r.st.liaisonDone);
    if (choice === 'sit') assert.ok(r.st.grown >= MARCH.sitGain);
    else assert.ok(r.st.goodwill > 0);
  }
});

test('march: straying brings the liaison, a third time ends the permit, walking into the fence too', () => {
  const st = createMarch();
  const away = frame({ mode: 'person', x: 650, z: -1190, dt: 0.1 });
  for (let i = 0; i < 30 && !st.dialog; i++) marchStep(st, away);
  assert.ok(st.dialog);
  assert.equal(st.dialog.reason, 'stray');
  assert.equal(st.warnings, 1);
  assert.equal(marchChoose(st, 'throw things'), false, 'there is no such answer');
  assert.ok(marchChoose(st, 'back'));
  assert.equal(st.action.kind, 'back');
  const r = walkMarch({ stray: true });
  assert.ok(routeShare(r.st) < 1);
  const fenced = createMarch();
  marchStep(fenced, frame({ mode: 'person', x: FENCE.x, z: FENCE.z }));
  assert.ok(fenced.permit);
  assert.match(ANTI_WEF_MISSION.objectives[0].check(frame({ mode: 'person', x: FENCE.x, z: FENCE.z }), { march: fenced }).fail, /permit/);
});

test('march: the score is the crowd, the chant, the route and the rally', () => {
  const st = createMarch();
  st.perfect = 10; st.miss = 0; st.onT = st.totalT = 100; st.arrived = true; st.goodwill = 100; st.count = 40;
  assert.equal(marchScore(st), 40 * 15 + 800 + 500 + 300 + 100);
  st.arrived = false;
  assert.equal(marchScore(st), 40 * 15 + 800 + 500 + 100);
});

test('march: the medals are reachable and tell players apart', () => {
  const lim = missionMedals(ANTI_WEF_MISSION);
  const mean = (o) => { let sum = 0, n = 0; for (let s = 1; s <= 8; s++) { const r = walkMarch({ ...o, seed: s * 13 }); sum += ANTI_WEF_MISSION.score(r.state); n++; } return sum / n; };
  const great = mean({ hit: 0.97, sigma: 0.035, choice: 'sit' });
  const decent = mean({ hit: 0.88, sigma: 0.06 });
  const casual = mean({ hit: 0.6, sigma: 0.09 });
  assert.equal(medalFor(great, lim, true), 'gold', `great ${great}`);
  assert.equal(medalFor(decent, lim, true), 'silver', `decent ${decent}`);
  assert.equal(medalFor(casual, lim, true), 'bronze', `casual ${casual}`);
  assert.ok(HEADBANG.good > HEADBANG.perfect);
});
