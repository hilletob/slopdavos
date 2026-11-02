import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RESORT_MISSIONS, TBAR_MISSION, TBAR, TBAR_LIFT_ID, createTbarGame, tbarStep, tbarHandOver, tbarTimeTo, tbarSpeed, tbarFrontReady,
  LAENDLER, LAENDLER_TEMPO, noteMidi, midiHz, thirdBelow, laendlerLevel,
  WAX_MISSION, WAX, WAXES, HOFMAENNER, waxFor, waxOff, ironHeat, ironBand, createWaxBench, waxPick, waxStep, waxQuality, skiMelted, skiBurnt,
  MARSHAL_MISSION, MARSHAL, ZONES, marshalZones, zoneFree, createMarshal, marshalStep, marshalGesture, marshalActive, marshalCarPose
} from '../js/missions-data-resort.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { BERGBAHNEN } from '../js/bergbahnen-data.js';
import { WORLD_BOUNDS, lonLatToWorld } from '../js/davos-frame.js';
import { PARKING_DATA } from '../js/parking-data.js';
import { medalFor, missionMedals, missionPin } from '../js/missions-progress.js';

// (js/missions-data-resort.js is three.js-free: the three games run on synthetic frames here)
const DT = 1 / 30;

test('the three resort missions are registered, scored, with their pins apart', () => {
  assert.deepEqual(RESORT_MISSIONS.map((m) => m.id), ['tbar-attendant', 'wax-hofmaenner', 'parking-marshal']);
  for (const m of RESORT_MISSIONS) {
    assert.equal(getMission(m.id), m);
    assert.ok(MISSIONS.includes(m));
    assert.equal(m.features.length, 1);
    assert.ok(m.scoreMode);
    const l = missionMedals(m);
    assert.ok(l.gold > l.silver && l.silver > l.bronze);
    assert.equal(m.score(m.createState()), 0, 'nothing done, nothing scored');
    assert.ok(m.objectives.length === 2);
    assert.match(m.intro, /[a-z]/);
  }
  const pins = MISSIONS.map((m) => ({ id: m.id, ...missionPin(m) }));
  for (const a of pins.filter((p) => RESORT_MISSIONS.some((m) => m.id === p.id))) {
    for (const b of pins) if (a.id !== b.id) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 30, `${a.id} vs ${b.id}`);
  }
});

test('the places are real and in the world: the Hauptertäli T-bar, Hofmänner, the Jakobshorn car park', () => {
  const [x0, z0, x1, z1] = WORLD_BOUNDS;
  const inWorld = (p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1;
  // OSM n658524654, the valley station of w51510598
  const station = lonLatToWorld(9.80115, 46.8252126);
  assert.ok(inWorld(station));
  const lift = BERGBAHNEN.ropeways.find((r) => r.id === TBAR_LIFT_ID);
  assert.equal(lift.name, 'Hauptertäli');
  assert.equal(lift.kind, 't-bar');
  assert.ok(Math.hypot(lift.supports[0].x - station.x, lift.supports[0].z - station.z) < 1);
  assert.ok(Math.hypot(TBAR.load.x - station.x, TBAR.load.z - station.z) < TBAR.loadS + 3);
  // OSM n4068557218
  const shop = lonLatToWorld(9.8261894, 46.7940286);
  assert.ok(Math.hypot(HOFMAENNER.door.x - shop.x, HOFMAENNER.door.z - shop.z) < 15, 'the door by the shop');
  // the lot: the marshal stands inside the ring
  const lot = PARKING_DATA.find((l) => l.id === MARSHAL.lot);
  assert.match(lot.name, /Jakobshorn/);
  let inside = false;
  for (let i = 0, n = lot.ring.length / 2, j = n - 1; i < n; j = i++) {
    const ax = lot.ring[i * 2], az = lot.ring[i * 2 + 1], bx = lot.ring[j * 2], bz = lot.ring[j * 2 + 1];
    if ((az > MARSHAL.frame.z) !== (bz > MARSHAL.frame.z) && MARSHAL.frame.x < ((bx - ax) * (MARSHAL.frame.z - az)) / (bz - az) + ax) inside = !inside;
  }
  assert.ok(inside, 'the marshal in the lot');
  assert.ok(Math.hypot(MARSHAL.frame.dx, MARSHAL.frame.dz) > 0.999 && Math.hypot(MARSHAL.frame.dx, MARSHAL.frame.dz) < 1.001);
});

// --- 1. The T-bar --------------------------------------------------------------------------------------------------------
/** Plays a run: `press(g)` asked each frame whether to hand over now */
function playTbar(press, seed = 11) {
  const g = createTbarGame(seed);
  while (!g.done) {
    tbarStep(g, DT);
    if (press(g)) tbarHandOver(g);
    g.events.length = 0;
  }
  return g;
}

test('t-bar: a clean attendant fills the lift, and earns gold', () => {
  const g = playTbar((gm) => !gm.handled && tbarFrontReady(gm) && Math.abs(tbarTimeTo(gm)) < 0.05);
  assert.ok(g.skiers >= TBAR.medals.gold, `${g.skiers} skiers`);
  assert.equal(g.knocks, 0);
  assert.equal(g.skiers, g.pairs * 2);
  assert.equal(medalFor(TBAR_MISSION.score({ game: g }), missionMedals(TBAR_MISSION), true), 'gold');
  assert.ok(g.perfects > 10);
});

test('t-bar: no hand-over sends nobody up, the bars swing by empty', () => {
  const g = playTbar(() => false);
  assert.equal(g.skiers, 0);
  assert.ok(g.empties > 15);
  assert.equal(g.knocks, 0);
});

test('t-bar: too early or too late knocks a skier over and holds up the lane', () => {
  for (const off of [0.6, -0.6]) {
    const g = createTbarGame(4);
    while (tbarTimeTo(g) > off) tbarStep(g, DT);
    assert.ok(tbarFrontReady(g));
    const before = g.queue[0].id;
    const e = tbarHandOver(g);
    assert.equal(e.kind, 'knock');
    assert.equal(e.early, off > 0);
    assert.equal(g.knocks, 1);
    assert.equal(g.skiers, 0);
    assert.notEqual(g.queue[0].id, before);
    assert.equal(g.fallen.length, 1);
    assert.equal(tbarFrontReady(g), false, 'the fallen pair is in the way');
    assert.equal(tbarHandOver(g), null, 'one bar, one hand-over');
    for (let t = 0; t < TBAR.clear + 2.2; t += DT) tbarStep(g, DT);
    assert.ok(g.fallen.length <= 1);
    assert.ok(tbarFrontReady(g), 'they get up, the lane moves on');
  }
});

test('t-bar: a grab with no bar near does no harm; the kids have a narrower window', () => {
  const g = createTbarGame(4);
  assert.equal(tbarHandOver(g).kind, 'air');
  assert.equal(g.knocks, 0);
  const k = createTbarGame(4);
  k.queue[0].kind = 'kids';
  while (tbarTimeTo(k) > TBAR.window * 0.9) tbarStep(k, DT);
  assert.equal(tbarHandOver(k).kind, 'knock', 'good for grown-ups, too early for kids');
  const a = createTbarGame(4);
  a.queue[0].kind = 'skiers';
  while (tbarTimeTo(a) > TBAR.window * 0.9) tbarStep(a, DT);
  assert.equal(tbarHandOver(a).kind, 'good');
});

test('t-bar: the rope gets faster, the bars come sooner; the spacing is the lift\'s own', () => {
  assert.equal(tbarSpeed(0), TBAR.speed[0]);
  assert.equal(tbarSpeed(TBAR.length), TBAR.speed[1]);
  const lift = BERGBAHNEN.ropeways.find((r) => r.id === TBAR_LIFT_ID);
  assert.ok(Math.abs(TBAR.spacing - (3 * 3600 * lift.occupancy) / lift.capacity) < 1e-6);
  assert.ok(TBAR.spacing / TBAR.speed[1] > TBAR.gap / TBAR.shuffle + 0.5, 'the next pair is in place before the next bar');
  const g = playTbar((gm) => !gm.handled && tbarFrontReady(gm) && Math.abs(tbarTimeTo(gm)) < 0.05);
  assert.ok(g.sent.length <= 14, 'only the last few are kept for the view');
});

test('the Ländler: 3/4 throughout, AABB, the tune on the chord at each bar\'s first beat', () => {
  assert.equal(LAENDLER.length, 32);
  assert.ok(LAENDLER_TEMPO >= 120 && LAENDLER_TEMPO <= 180);
  for (const bar of LAENDLER) {
    assert.equal(bar.notes.reduce((a, n) => a + n.beats, 0), 3);
    assert.ok(bar.tones.includes(bar.notes[0].midi % 12), `first note ${bar.notes[0].midi} on ${bar.chord}`);
    assert.ok(bar.bass >= 36 && bar.bass <= 52);
    assert.ok(bar.tones.includes(bar.bass % 12), 'the bass on the chord');
    for (const n of bar.notes) if (n.midi != null) assert.ok(n.midi >= 60 && n.midi <= 90, 'in the Örgeli\'s range');
  }
  assert.deepEqual(LAENDLER.slice(0, 8).map((b) => b.notes), LAENDLER.slice(8, 16).map((b) => b.notes), 'A A');
  assert.deepEqual(LAENDLER.slice(16, 24).map((b) => b.notes), LAENDLER.slice(24, 32).map((b) => b.notes), 'B B');
  assert.ok(LAENDLER.slice(8, 16).every((b) => b.clarinet) && LAENDLER.slice(0, 8).every((b) => !b.clarinet), 'the clarinet on the repeat');
  assert.equal(noteMidi('A4'), 69);
  assert.equal(noteMidi('F#5'), 78);
  assert.ok(Math.abs(midiHz(69) - 440) < 1e-9);
  assert.equal(thirdBelow(noteMidi('B4')), noteMidi('G4'), 'a major third');
  assert.equal(thirdBelow(noteMidi('A4')), noteMidi('F#4'));
  assert.equal(thirdBelow(noteMidi('G5')), noteMidi('E5'), 'a minor third');
  assert.equal(laendlerLevel(0), 1);
  assert.equal(laendlerLevel(300), 0);
  assert.ok(laendlerLevel(20) > laendlerLevel(80));
});

// --- 2. The waxing bench ---------------------------------------------------------------------------------------------
/** The finger: an even stroke at `pace` (ski lengths / s), tip to tail */
function ironSki(b, pace) {
  const p = b.pair, ski = p.ski, stage = p.stage;
  let u = 0;
  while (b.pair === p && p.stage === stage && p.ski === ski && !b.done) {
    u = Math.min(1, u + pace * DT);
    waxStep(b, { u }, DT);
    if (u >= 1) u = 0; // (back to the tip for what is left)
  }
}
function strokes(b) {
  const p = b.pair, stage = p.stage;
  while (b.pair === p && p.stage === stage && !b.done) waxStep(b, { push: 1 }, DT);
}
const pace = (b) => { const [lo, hi] = ironBand(ironHeat(b.t)); return (lo + hi) / 2; };

test('wax: the colours fit the temperatures, a clean pair earns full marks', () => {
  assert.equal(waxFor(0).id, 'yellow');
  assert.equal(waxFor(-3).id, 'red');
  assert.equal(waxFor(-6).id, 'violet');
  assert.equal(waxFor(-10).id, 'blue');
  assert.equal(waxFor(-20).id, 'green');
  assert.equal(waxOff(-6, 'violet'), 0);
  assert.equal(waxOff(-6, 'blue'), 1);
  assert.equal(waxOff(-6, 'yellow'), 2);
  const b = createWaxBench(5);
  const p = b.pair;
  assert.ok(waxPick(b, waxFor(p.temp).id));
  assert.equal(p.stage, 'iron');
  assert.equal(waxPick(b, 'red'), false, 'picked already');
  ironSki(b, pace(b));
  assert.equal(p.ski, 1, 'the first ski done, on to the second');
  ironSki(b, pace(b));
  assert.equal(p.stage, 'scrape');
  assert.ok(skiMelted(p.skis[0]) >= 0.9 && skiBurnt(p.skis[0]) === 0);
  strokes(b);
  assert.equal(p.stage, 'brush');
  strokes(b);
  assert.equal(p.stage, 'done');
  assert.ok(p.points >= 95, `${p.points} points`);
  assert.equal(b.score, p.points);
  assert.equal(b.pairs.length, 1);
  assert.notEqual(b.pair, p, 'the next customer');
});

test('wax: a slow iron burns the base, a hot iron held still burns it faster; the wrong wax costs marks', () => {
  const b = createWaxBench(5);
  const p = b.pair;
  waxPick(b, waxFor(p.temp).id);
  for (let t = 0; t < 1.2; t += DT) waxStep(b, { u: 0.5 }, DT);
  assert.ok(skiBurnt(p.skis[0]) >= 2, 'held still: burnt');
  assert.ok(waxQuality(p).iron < WAX.points.iron);
  // the band moves with the iron's heat
  const [lo, hi] = ironBand(WAX.hotRange[0]), [lo2, hi2] = ironBand(WAX.hotRange[1]);
  assert.ok(lo < hi && lo2 > lo && hi2 > hi);
  assert.ok(ironHeat(0) >= WAX.hotRange[0] && ironHeat(2.75) <= WAX.hotRange[1]);
  // too fast does not melt: it takes more strokes
  const f = createWaxBench(5);
  waxPick(f, waxFor(f.pair.temp).id);
  let u = 0;
  for (let t = 0; t < 0.5; t += DT) { u = Math.min(1, u + 2.2 * DT); waxStep(f, { u }, DT); }
  assert.ok(skiMelted(f.pair.skis[0]) < 0.3);
  // the wrong wax
  const w = createWaxBench(5), q = w.pair;
  const wrong = WAXES[(WAXES.indexOf(waxFor(q.temp)) + 2) % WAXES.length].id;
  waxPick(w, wrong);
  assert.ok(q.off >= 2);
  assert.equal(waxQuality(q).wax, 0);
});

test('wax: only strokes tip to tail count; the keys work too; a good day earns gold', () => {
  const b = createWaxBench(5), p = b.pair;
  waxPick(b, waxFor(p.temp).id);
  ironSki(b, pace(b));
  ironSki(b, pace(b));
  assert.equal(p.stage, 'scrape');
  // back and forth at the far end: nothing
  for (let i = 0; i < 40; i++) waxStep(b, { u: 0.9 - (i % 2) * 0.1 }, DT);
  assert.equal(p.excess, 1);
  // the iron by keys, pulsing to hold the pace
  const k = createWaxBench(5), kp = k.pair;
  waxPick(k, waxFor(kp.temp).id);
  for (let i = 0; i < 2000 && kp.stage === 'iron'; i++) {
    const [lo, hi] = ironBand(ironHeat(k.t));
    if (kp.u >= 0.99) { kp.u = 0; kp.v = 0; } // (the tool back)
    waxStep(k, { push: kp.v < (lo + hi) / 2 ? 1 : 0 }, DT);
  }
  assert.equal(kp.stage, 'scrape', 'ironed by keys');
  assert.ok(skiBurnt(kp.skis[0]) + skiBurnt(kp.skis[1]) <= 3, `${skiBurnt(kp.skis[0]) + skiBurnt(kp.skis[1])} burnt`);
  assert.ok(waxQuality(kp).iron >= 28, `iron ${waxQuality(kp).iron}`);
  // a whole shift
  const day = createWaxBench(5);
  while (!day.done) {
    const pair = day.pair;
    for (let t = 0; t < 1.2; t += DT) waxStep(day, {}, DT); // reading the board
    waxPick(day, waxFor(pair.temp).id);
    ironSki(day, pace(day));
    ironSki(day, pace(day));
    strokes(day);
    strokes(day);
  }
  assert.ok(day.pairs.length >= 8, `${day.pairs.length} pairs`);
  assert.equal(medalFor(WAX_MISSION.score({ bench: day }), missionMedals(WAX_MISSION), true), 'gold', `${day.score} pts`);
  for (let i = 0; i < 40; i++) { const t = createWaxBench(i).pair.temp; assert.ok(t >= -22 && t <= 2); }
});

// --- 3. The marshal --------------------------------------------------------------------------------------------------
/** A lot in the marshal's frame: bays either side of the aisle */
function syntheticBays(n = 18) {
  const F = MARSHAL.frame, rx = -F.dz, rz = F.dx, out = [];
  for (let i = 0; i < n; i++) {
    for (const lat of [-5.5, 5.5]) {
      const a = 9 + i * 5.5;
      out.push({ x: F.x + F.dx * a + rx * lat, z: F.z + F.dz * a + rz * lat, ux: rx * Math.sign(lat), uz: rz * Math.sign(lat), occupied: false });
    }
  }
  out.push({ x: F.x + F.dx * 20 + rx * 5.5, z: F.z + F.dz * 20 + rz * 5.5, ux: rx, uz: rz, occupied: true }); // (taken)
  out.push({ x: F.x + F.dx * 20 + rx * 14, z: F.z + F.dz * 20 + rz * 14, ux: rx, uz: rz, occupied: false }); // (the next row)
  return out;
}

test('marshal: the free bays by zone, the nearer ones left and right, the far ones straight on', () => {
  const z = marshalZones(syntheticBays());
  assert.ok(z.left.length > 3 && z.right.length > 3 && z.straight.length > 3);
  assert.ok(z.left.every((b) => b.lat < 0 && b.a < MARSHAL.nearA));
  assert.ok(z.right.every((b) => b.lat > 0 && b.a < MARSHAL.nearA));
  assert.ok(z.straight.every((b) => b.a >= MARSHAL.nearA));
  for (const k of ZONES) assert.ok(z[k].every((b, i, l) => !i || l[i - 1].a <= b.a));
  assert.ok(![...z.left, ...z.right].some((b) => Math.abs(b.lat) > 7), 'only the rows beside the aisle');
  assert.equal(zoneFree(z.left), z.left.length);
});

/** Plays a shift: `decide(car, g)` returns a gesture for the car in hand (or null) each frame */
function playMarshal(decide, { seed = 9, hold = false } = {}) {
  const g = createMarshal(marshalZones(syntheticBays()), seed);
  while (!g.done) {
    marshalStep(g, DT);
    // (the skiers: whatever is about to reach the line is held, told where to go or not)
    if (hold && (g.cross.state === 'on' || g.cross.state === 'warn') && g.cars.some((c) => c.phase === 'approach' && !c.held && c.a > -9)) marshalGesture(g, 'stop');
    const car = marshalActive(g);
    if (car) { const w = decide(car, g); if (w) marshalGesture(g, w); }
    g.events.length = 0;
  }
  return g;
}
const freeZone = (g) => ZONES.reduce((best, z) => (zoneFree(g.zones[z]) > zoneFree(g.zones[best]) ? z : best), 'left');
/** Waves in good time at a zone with bays; holds for the skiers crossing */
const goodMarshal = (car, g) => (g.cross.state === 'idle' && car.a > -18 ? freeZone(g) : null);

test('marshal: a good shift parks the cars straight, and earns gold', () => {
  const g = playMarshal(goodMarshal, { hold: true });
  assert.ok(g.good >= 16, `${g.good} good`);
  assert.equal(g.blockers, 0);
  assert.equal(g.closes, 0, 'held for the skiers');
  assert.equal(g.score, g.good * MARSHAL.points.good + g.crooked * MARSHAL.points.crooked);
  assert.equal(medalFor(MARSHAL_MISSION.score({ game: g }), missionMedals(MARSHAL_MISSION), true), 'gold', `${g.score} pts`);
  assert.ok(g.cross.n >= 3);
});

test('marshal: no gestures at all: crooked cars, blockers, a poor score', () => {
  const g = playMarshal(() => null);
  assert.equal(g.good, 0);
  assert.ok(g.crooked + g.blockers > 5);
  assert.ok(g.blockers >= 1);
  assert.ok(g.score < MARSHAL.medals.bronze);
});

test('marshal: a late wave parks crooked; a wave into a full zone blocks; blockers clear', () => {
  const g = createMarshal(marshalZones(syntheticBays()), 9);
  g.cross.t = 1e9;
  while (!g.cars.length || g.cars[0].a < -2) marshalStep(g, DT);
  const car = marshalActive(g);
  marshalGesture(g, 'left');
  assert.equal(car.quality, 'crooked');
  assert.ok(car.bay.taken);
  while (car.phase !== 'parked') marshalStep(g, DT);
  assert.equal(g.crooked, 1);
  assert.equal(g.score, MARSHAL.points.crooked);
  const p = marshalCarPose(car);
  const straight = { ...car, quality: 'good', badAngle: 0 };
  assert.notEqual(p.yaw, marshalCarPose(straight).yaw, 'at an angle');
  // a full zone
  const h = createMarshal(marshalZones(syntheticBays()), 9);
  h.cross.t = 1e9; // (no skiers in this one)
  for (const b of h.zones.right) b.taken = true;
  while (!h.cars.length || h.cars[0].a < -15) marshalStep(h, DT);
  const c2 = marshalActive(h);
  marshalGesture(h, 'right');
  assert.equal(c2.quality, 'blocker');
  assert.equal(c2.bay, null);
  while (c2.phase !== 'blocked') marshalStep(h, DT);
  assert.equal(h.blockers, 1);
  assert.ok(h.score <= MARSHAL.points.blocker + 2 * MARSHAL.points.crooked, 'the car behind it went its own way meanwhile');
  for (let t = 0; t < MARSHAL.blockT + 0.5; t += DT) marshalStep(h, DT);
  assert.ok(!h.cars.includes(c2), 'he moves it in the end');
});

test('marshal: a held car waits at the line, is never late, runs out of patience; skiers need the hold', () => {
  const g = createMarshal(marshalZones(syntheticBays()), 9);
  while (!g.cars.length || g.cars[0].a < -10) marshalStep(g, DT);
  const car = g.cars[0];
  marshalGesture(g, 'stop');
  assert.ok(car.held);
  for (let t = 0; t < 4; t += DT) marshalStep(g, DT);
  assert.ok(car.a < 0 && car.a > MARSHAL.holdA - 1 && car.v < 0.4, `stands at the line (${car.a.toFixed(1)})`);
  marshalGesture(g, 'left');
  assert.equal(car.held, false);
  assert.equal(car.quality, 'good', 'held in time: not late');
  // patience
  const p = createMarshal(marshalZones(syntheticBays()), 9);
  while (!p.cars.length || p.cars[0].a < -10) marshalStep(p, DT);
  const c = p.cars[0];
  marshalGesture(p, 'stop');
  for (let t = 0; t < MARSHAL.patience + 1; t += DT) marshalStep(p, DT);
  assert.equal(c.held, false, 'the driver goes on alone');
  assert.ok(c.quality === 'crooked' || c.quality === 'blocker');
  // a car through the skiers: a close call
  const x = createMarshal(marshalZones(syntheticBays()), 9);
  x.cross = { state: 'on', t: 60, hit: false, n: 1 };
  while (!x.cars.length || x.cars[0].a < -10) marshalStep(x, DT);
  marshalGesture(x, 'straight');
  while (x.closes === 0 && x.t < 20) marshalStep(x, DT);
  assert.equal(x.closes, 1);
  assert.ok(x.score <= MARSHAL.points.close + 100);
});

test('marshal: cars keep their distance; the poses run into the bay; the car turns the right way', () => {
  const g = createMarshal(marshalZones(syntheticBays()), 9);
  for (let t = 0; t < 60; t += DT) {
    marshalStep(g, DT);
    const on = g.cars.filter((c) => c.phase === 'approach' || c.phase === 'aisle').sort((a, b) => b.a - a.a);
    for (let i = 1; i < on.length; i++) assert.ok(on[i - 1].a - on[i].a > 5, 'no driving into each other');
    const car = marshalActive(g);
    if (car && car.a > -14) marshalGesture(g, freeZone(g));
  }
  const parked = g.cars.find((c) => c.phase === 'parked' && c.bay.lat > 0);
  assert.ok(parked);
  const P = marshalCarPose(parked);
  assert.ok(Math.hypot(P.x - parked.bay.x, P.z - parked.bay.z) < 0.01, 'in its bay');
  // nose in: the car's forward looks away from the aisle
  const F = MARSHAL.frame, rx = -F.dz, rz = F.dx;
  assert.ok(Math.sin(P.yaw) * rx + Math.cos(P.yaw) * rz > 0.9);
  const turning = { ...parked, phase: 'turn', t: 0 };
  const start = marshalCarPose(turning);
  assert.ok(Math.abs((start.x - F.x) * rx + (start.z - F.z) * rz) < 0.01, 'starts on the aisle');
});
