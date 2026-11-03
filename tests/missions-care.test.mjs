import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CARE_MISSIONS, SNOWSHOE_MISSION, SHOE, createShoer, shoeStep, shoeRest, shoeTap, beatOffset, shoeSpeed, onPackedLine, inWildZone, lineDistance, packedShare,
  CAST_MISSION, SPITAL, CAST, CAST_STAGES, CAST_PATIENTS, createCastGame, castStep, castPickLeg, castPickLength, castConfirm, castInk, castGaps, castLumps, wrapEvenness, wrapSpeed, wetWindow
} from '../js/missions-data-care.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';
import { medalFor, missionMedals, missionPin } from '../js/missions-progress.js';

// (js/missions-data-care.js is three.js-free: the walker runs on the real terrain here, the plaster room on synthetic frames)
const DT = 1 / 30;

const inRing = (r, x, z) => {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const insideBuilding = (x, z) => DAVOS_DATA.buildings.find((b) => inRing(b.ring, x, z));
/** The straight line a → b: outside every footprint, with room for the walker's body at every half metre */
function assertWalkable(a, b, what) {
  const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(len / 0.5);
  for (let i = 0; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n;
    for (const [ox, oz] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) assert.equal(insideBuilding(x + ox, z + oz)?.id, undefined, `${what}: a building at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }
}

test('the two care missions are registered, scored, with their pins apart', () => {
  assert.deepEqual(CARE_MISSIONS.map((m) => m.id), ['snowshoe-junkerboden', 'cast-spital']);
  for (const m of CARE_MISSIONS) {
    assert.equal(getMission(m.id), m);
    assert.ok(MISSIONS.includes(m));
    assert.ok(m.scoreMode);
    assert.equal(m.season, 'winter');
    assert.equal(m.mode, 'person');
    const l = missionMedals(m);
    assert.ok(l.gold > l.silver && l.silver > l.bronze);
    assert.equal(m.score(m.createState()), 0, 'nothing done, nothing scored');
    const [x0, z0, x1, z1] = WORLD_BOUNDS;
    assert.ok(m.start.x > x0 && m.start.x < x1 && m.start.z > z0 && m.start.z < z1);
  }
  const pins = MISSIONS.map((m) => ({ id: m.id, ...missionPin(m) }));
  for (const a of pins.filter((p) => CARE_MISSIONS.some((m) => m.id === p.id))) {
    for (const b of pins) if (a.id !== b.id) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 30, `${a.id} vs ${b.id}`);
  }
});

test('the starts and the door lie outside every footprint, facing the first objective, the straight way free', () => {
  for (const m of CARE_MISSIONS) {
    assert.equal(insideBuilding(m.start.x, m.start.z)?.id, undefined, `${m.id}: the start`);
    const first = m.objectives[0].check({ x: m.start.x, z: m.start.z, dt: 0 }, m.createState()).target;
    assert.ok(first, 'the first step has a target');
    assert.equal(insideBuilding(first.x, first.z)?.id, undefined, `${m.id}: the first objective`);
    assert.ok(Math.abs(Math.atan2(first.x - m.start.x, first.z - m.start.z) - m.start.heading) < 1e-9, `${m.id} faces its target`);
    assertWalkable(m.start, first, m.id);
  }
  // the door by the federal address point of Promenade 4, by the hospital's outline (OSM w93469657)
  const door = SPITAL.door;
  assert.ok(Math.hypot(door.x - (2781383.5 - 2782500), door.z - (1185500 - 1184587.1)) < 8, 'by the address point');
  const hospital = DAVOS_DATA.buildings.find((b) => b.id === 'w93469657');
  let near = Infinity;
  for (let i = 0; i < hospital.ring.length; i += 2) near = Math.min(near, Math.hypot(hospital.ring[i] - door.x, hospital.ring[i + 1] - door.z));
  assert.ok(near < 10, 'at the hospital');
});

test('the snowshoe route: real place, every leg of the packed line free of buildings and outside the zone', () => {
  const L = SHOE.line;
  for (let i = 0; i + 1 < L.length; i++) {
    assertWalkable(L[i], L[i + 1], `leg ${i}`);
    for (let u = 0; u <= 1; u += 0.02) {
      const x = L[i].x + (L[i + 1].x - L[i].x) * u, z = L[i].z + (L[i + 1].z - L[i].z) * u;
      assert.ok(!inWildZone(x, z), `leg ${i} stays out of the zone`);
    }
  }
  // the straight way from the last flag to the bench runs through it: there is something to skirt
  let crosses = false;
  for (let u = 0; u <= 1; u += 0.02) if (inWildZone(SHOE.flags[2].x + (SHOE.bench.x - SHOE.flags[2].x) * u, SHOE.flags[2].z + (SHOE.bench.z - SHOE.flags[2].z) * u)) crosses = true;
  assert.ok(crosses);
  for (const g of SHOE.grouse) {
    assert.ok(inWildZone(g.x, g.z), 'the birds sit in the zone');
    assert.ok(lineDistance(g.x, g.z) > SHOE.startleR, 'the line leaves them in peace');
  }
  const road = DAVOS_DATA.roads.find((r) => r.id === 'w285599934');
  assert.equal(road.name, 'Junkerbodenstrasse');
  let d = Infinity;
  for (let i = 0; i < road.pts.length; i += 2) d = Math.min(d, Math.hypot(road.pts[i] - SHOE.finish.x, road.pts[i + 1] - SHOE.finish.z));
  assert.ok(d < 20, 'the finish on the Junkerbodenstrasse');
  const loipe = DAVOS_DATA.loipen.find((l) => l.id === 'w1233421897');
  assert.equal(loipe.name, 'Junkerboden-Runde (Nr. 17)');
  assert.ok(lineDistance(loipe.pts[20], loipe.pts[21]) < 200, 'the Junkerboden-Runde close by');
});

test('the walker: the rhythm, the deep snow, the climb, the stamina', () => {
  const s = createShoer(0);
  const flat = { grade: 0, packed: true };
  assert.ok(shoeSpeed(s, 1, flat) > shoeSpeed(s, 1, { grade: 0, packed: false }), 'slower off the line');
  assert.ok(shoeSpeed(s, 1, flat) > shoeSpeed(s, 1, { grade: 0.4, packed: true }), 'slower up the slope');
  // on the beat a stride, off it a stumble
  s.t = SHOE.beat; assert.ok(Math.abs(beatOffset(s)) < 1e-9);
  assert.equal(shoeTap(s), 'step');
  assert.ok(shoeSpeed(s, 1, flat) > SHOE.trudge * 1.5);
  s.t = SHOE.beat * 1.5;
  const before = s.stamina;
  assert.equal(shoeTap(s), 'stumble');
  assert.ok(s.stamina < before);
  assert.equal(s.boost, 0);
  // a climb tires more than the flat; blown you crawl until the breath is back
  const drain = (env) => { const w = createShoer(0); w.speed = 2; for (let i = 0; i < 300; i++) shoeStep(w, { forward: 1 }, DT, env); return 1 - w.stamina; };
  assert.ok(drain({ grade: 0.4, packed: true }) > drain(flat) * 2);
  assert.ok(drain({ grade: 0, packed: false }) > drain(flat));
  const w = createShoer(0); w.stamina = 0.001; w.speed = 2;
  shoeStep(w, { forward: 1 }, 1, flat);
  assert.ok(w.blown);
  assert.equal(shoeSpeed(w, 1, flat), SHOE.tired);
  for (let i = 0; i < 90; i++) shoeRest(w, DT);
  assert.ok(!w.blown && w.stamina > 0.5, 'the bench restores');
});

/** A player on the real terrain: at the flags along a list of waypoints, tapping every beat or not at all */
async function walkRoute(waypoints, { rhythm = true } = {}) {
  const { groundHeight } = await import('../js/terrain.js');
  const m = SNOWSHOE_MISSION, state = m.createState();
  state.shoer = createShoer(m.start.heading);
  const s = state.shoer;
  let x = m.start.x, z = m.start.z, t = 0, index = 0, wp = 0, guard = 0, nextTap = 0;
  while (index < m.objectives.length && guard++ < 120000) {
    const target = waypoints[wp];
    if (target && Math.hypot(target.x - x, target.z - z) < 2) wp++;
    t += DT;
    const dt = DT;
    if (state.seated) shoeRest(s, dt);
    else {
      const aim = waypoints[wp] || m.objectives[index].check({ x, z, dt: 0 }, { ...state, flags: 0, events: [] }).target;
      const want = Math.atan2(aim.x - x, aim.z - z), d = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading));
      const fwd = s.blown ? 0 : 1; // (it stops when out of breath)
      if (rhythm && fwd && s.t >= nextTap && Math.abs(beatOffset(s)) < 0.05) { shoeTap(s); nextTap = s.t + SHOE.beat * 0.9; }
      const grade = (groundHeight(x + Math.sin(s.heading) * 1.5, z + Math.cos(s.heading) * 1.5) - groundHeight(x, z)) / 1.5;
      shoeStep(s, { forward: fwd, steer: clamp1(d * 3) }, dt, { grade, packed: onPackedLine(x, z) });
      x += Math.sin(s.heading) * s.speed * dt;
      z += Math.cos(s.heading) * s.speed * dt;
    }
    const ctx = { x, z, dt, t: t * 1000 };
    m.update(ctx, state);
    state.events.length = 0;
    if (m.objectives[index].check(ctx, state).done) index++;
  }
  assert.equal(index, m.objectives.length, 'the route ends');
  return { state, t, score: m.score(state) };
}
const clamp1 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
const onLine = () => SHOE.line.slice(1);

test('a walker on the real terrain: in the rhythm on the line gold, without it less, through the zone worse', async () => {
  const good = await walkRoute(onLine(), { rhythm: true });
  assert.equal(good.state.zoneEntries, 0);
  assert.equal(good.state.startled, 0);
  assert.ok(packedShare(good.state) > 0.9, `on the line: ${packedShare(good.state)}`);
  assert.equal(medalFor(good.score, missionMedals(SNOWSHOE_MISSION), true), 'gold', `score ${good.score} in ${good.t.toFixed(0)} s`);
  const plain = await walkRoute(onLine(), { rhythm: false });
  assert.ok(plain.t > good.t * 1.2, `plain ${plain.t.toFixed(0)} s vs ${good.t.toFixed(0)} s`);
  assert.ok(plain.score < good.score);
  assert.ok(medalFor(plain.score, missionMedals(SNOWSHOE_MISSION), true), `plain walking still earns a medal: ${plain.score}`);
  // straight from the last flag through the zone
  const cut = await walkRoute([...SHOE.flags, SHOE.bench, SHOE.finish], { rhythm: true });
  assert.ok(cut.state.zoneEntries >= 1);
  assert.ok(cut.state.startled >= 1, 'a grouse flies up');
  assert.ok(cut.score < good.score - 150, `through the zone: ${cut.score} vs ${good.score}`);
});

// ---------------------------------------------------------------------------------------------------------------------
/** A plaster technician: `speedFactor` × the even pace on the wrap, `read` right on the X-ray, finishes a patient */
function playCast({ speedFactor = 1, read = true, seed = 7, wetOff = 0 } = {}) {
  const g = createCastGame(seed);
  let guard = 0;
  while (!g.done && guard++ < 200000) {
    const p = g.patient;
    switch (p.stage) {
      case 'xray':
        if (!read && !p.wrongLeg) castPickLeg(g, p.leg === 'left' ? 'right' : 'left');
        if (!p.pickedLeg) castPickLeg(g, p.leg);
        if (!read && !p.wrongLength) castPickLength(g, p.length === 'short' ? 'long' : 'short');
        castPickLength(g, p.length);
        castStep(g, {}, DT);
        break;
      case 'angle':
        castStep(g, { adjust: Math.sign(CAST.angle[p.length].target - p.angle) }, DT);
        if (Math.abs(CAST.angle[p.length].target - p.angle) < 1) castConfirm(g);
        break;
      case 'pad': castStep(g, { u: (p.u + 0.25 * DT) % 1 }, DT); break;
      case 'wet': {
        const [lo, hi] = wetWindow(p);
        castStep(g, { hold: p.wet < (lo + hi) / 2 + wetOff }, DT);
        break;
      }
      case 'wrap': {
        const v = wrapSpeed(p) * speedFactor * DT, dir = p.pass === 0 ? 1 : -1;
        castStep(g, { u: Math.max(0, Math.min(1, p.u + dir * v)) }, DT);
        break;
      }
      case 'smooth': {
        p.rub = p.rub ?? 1;
        if (p.u >= 0.99) p.rub = -1; else if (p.u <= 0.01) p.rub = 1;
        castStep(g, { u: Math.max(0, Math.min(1, p.u + p.rub * 0.8 * DT)) }, DT);
        break;
      }
      case 'sign': castInk(g, 30); castConfirm(g); break;
      default: throw new Error(`stage ${p.stage}`);
    }
  }
  assert.ok(g.done, 'three patients through the room');
  assert.equal(g.patients.length, CAST_PATIENTS.length);
  return g;
}

test('the plaster room: the stages in order, the wrong leg and length are refused and cost points', () => {
  const g = createCastGame(3), p = g.patient;
  assert.equal(p.stage, 'xray');
  assert.equal(castPickLength(g, p.length), false, 'first the leg');
  assert.equal(castPickLeg(g, p.leg === 'left' ? 'right' : 'left'), false);
  assert.equal(p.wrongLeg, 1);
  assert.equal(castPickLeg(g, p.leg), true);
  assert.equal(castPickLength(g, p.length === 'short' ? 'long' : 'short'), false);
  assert.equal(p.wrongLength, 1);
  assert.equal(castPickLength(g, p.length), true);
  assert.equal(p.stage, 'angle');
  assert.deepEqual(CAST_STAGES, ['xray', 'angle', 'pad', 'wet', 'wrap', 'smooth', 'sign']);
  // the break on the film says the length
  for (let seed = 1; seed < 12; seed++) { const q = createCastGame(seed).patient; assert.equal(q.at < 0.5, q.length === 'long'); }
});

test('the plaster room: an even hand earns gold, gaps and lumps show and cost, each patient is quicker', () => {
  const good = playCast();
  assert.equal(medalFor(good.score, missionMedals(CAST_MISSION), true), 'gold', `score ${good.score}`);
  for (const p of good.patients) {
    assert.equal(p.parts.xray, CAST.points.xray);
    assert.ok(wrapEvenness(p) > 0.8, `evenness ${wrapEvenness(p)}`);
    assert.equal(castLumps(p), 0);
  }
  assert.ok(wetWindow(good.patients[2])[1] < wetWindow(good.patients[0])[1], 'less time in the bucket');
  assert.ok(wrapSpeed(good.patients[2]) > wrapSpeed(good.patients[0]));
  assert.ok(CAST.limit[2] < CAST.limit[0]);
  const fast = playCast({ speedFactor: 2.2 });
  assert.ok(fast.patients.some((p) => castGaps(p) > 3), 'too fast: gaps');
  const slow = playCast({ speedFactor: 0.45 });
  assert.ok(slow.patients.some((p) => castLumps(p) > 3), 'too slow: lumps');
  assert.ok(fast.score < good.score - 80 && slow.score < good.score - 80, `${fast.score}, ${slow.score} vs ${good.score}`);
  const careless = playCast({ read: false, wetOff: 2 });
  assert.ok(careless.score < good.score - 100);
  assert.ok(medalFor(careless.score, missionMedals(CAST_MISSION), true), `still a medal: ${careless.score}`);
});

test('the mission steps: the door, then the room until the last patient', () => {
  const m = CAST_MISSION, state = m.createState();
  const [enter, room] = m.objectives;
  assert.equal(enter.check({ x: SPITAL.door.x + 40, z: SPITAL.door.z }).done, false);
  assert.equal(enter.check({ x: SPITAL.door.x + 1, z: SPITAL.door.z }).done, true);
  assert.equal(room.check({}, state).done, false);
  state.room = playCast();
  assert.equal(room.check({}, state).done, true);
  assert.ok(m.score(state) > 0);
  assert.match(m.summary(state)[0], /^3 casts/);
});
