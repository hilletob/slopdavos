import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCAL_MISSIONS, BEER_MISSION, BREWERY, BEER_STOPS, BEER, createBeerState, beerStep,
  GIPFELI_MISSION, GIPFELI, createRoll, rollStep, rollPoints, createGipfeli, gipfeliNext, gipfeliScore, gipfeliClock, deliveryPoints, GIPFELI_HOTELS,
  RACLETTE_MISSION, RACLETTE, createRaclette, racletteStep, racletteScrape, meltGrade,
  IBEX_MISSION, IBEX, createHunt, legalIbex, ibexZones, ibexRayHit, ibexShotResult, ballistics, ibexAlarm, huntShoot, stepHerd, herdCentre, seededRandom,
  SQUIRREL_MISSION, SQUIRREL, SEEPROMENADE, squirrelSpots, createSquirrelGame, stepSquirrels, nearestOnTrail,
  TENNIS_MISSION, COURT, createTennis, stepTennis, tiebreakServer, aimShot, swingQuality, predictBall, tennisScore,
  WATERSLIDE_MISSION, SLIDE, slideLength, slideCenterline, createRider, stepRider, idealSteer, slideAt,
  KIRCHNER_MISSION, KIRCHNER, KIRCHNER_PALETTE, kirchnerIndex, nearestPalette, paletteMatch, scorePainting, templateEdges, gridMode
} from '../js/missions-data-local.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor, missionMedals, missionPin } from '../js/missions-progress.js';

// (js/missions-data-local.js is three.js-free: the eight games run on synthetic frames here)
const frame = (over = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: 0.1, t: 0, ...over });
const run = (def) => ({ def, state: def.createState() });

test('the eight local missions are registered with their pins apart, scored by time or points', () => {
  assert.equal(LOCAL_MISSIONS.length, 8);
  assert.deepEqual(LOCAL_MISSIONS.map((m) => m.id), ['beer-delivery', 'gipfeli-weber', 'raclette-kaech', 'ibex-hunt', 'squirrel-trail', 'tennis-hall', 'waterslide-race', 'paint-kirchner']);
  for (const m of LOCAL_MISSIONS) {
    assert.equal(getMission(m.id), m);
    assert.ok(MISSIONS.includes(m));
    assert.ok(m.features?.length === 1, `${m.id} has its runtime feature`);
    const l = missionMedals(m);
    if (m.scoreMode) { assert.equal(typeof m.score, 'function'); assert.ok(l.gold > l.silver && l.silver > l.bronze); assert.equal(m.score(m.createState()), 0); }
    else assert.ok(l.gold < l.silver && l.silver < l.bronze && l.gold === m.bonusMs);
  }
  // every pin at least 30 m from every other mission's pin
  const pins = MISSIONS.map((m) => ({ id: m.id, ...missionPin(m) }));
  for (const a of pins.filter((p) => LOCAL_MISSIONS.some((m) => m.id === p.id))) {
    for (const b of pins) if (a.id !== b.id) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 30, `${a.id} vs ${b.id}`);
  }
  assert.deepEqual(LOCAL_MISSIONS.filter((m) => !m.scoreMode).map((m) => m.id), ['beer-delivery', 'waterslide-race']);
});

// --- 1. Beer --------------------------------------------------------------------------------------------------------
test('beer: two loads from the brewery door to the van, then a crate a bar, carried from a van parked close by', () => {
  const st = createBeerState();
  const van = { x: BREWERY.door.x - 3, z: BREWERY.door.z + 8 };
  assert.equal(beerStep(st, frame({ mode: 'car', ...BREWERY.door }), van, null), null, 'nothing from the driver\'s seat');
  for (let k = 0; k < BEER.loads; k++) {
    assert.equal(beerStep(st, frame(BREWERY.door), van, null), 'pick');
    assert.equal(beerStep(st, frame(van), van, null), 'stow');
  }
  assert.equal(st.phase, 'deliver');
  const stop = BEER_STOPS[0];
  const far = { x: stop.door.x + 200, z: stop.door.z };
  assert.equal(beerStep(st, frame(far), far, stop), null, 'the van is too far from the door');
  const near = { x: stop.road.x + 4, z: stop.road.z };
  assert.equal(beerStep(st, frame(near), near, stop), 'pick');
  assert.equal(beerStep(st, frame({ ...stop.door, dt: 0.5 }), near, stop), null, 'handing over …');
  assert.equal(beerStep(st, frame({ ...stop.door, dt: 0.6 }), near, stop), 'deliver');
  assert.equal(st.delivered, 1);
  // the objectives follow
  const r = run(BEER_MISSION);
  r.state.beer = st; st.van = near;
  assert.equal(BEER_MISSION.objectives[0].check(frame(), r.state).done, true);
  assert.equal(BEER_MISSION.objectives[1].check(frame(), r.state).done, true);
  assert.equal(BEER_MISSION.objectives[2].check(frame({ mode: 'car', speed: 0, x: 0, z: 0 }), r.state).done, false);
  assert.equal(BEER_MISSION.objectives.length, 1 + BEER_STOPS.length);
  assert.deepEqual(BEER_STOPS.map((s) => s.name), ['Rot Liechtli', 'Ex Bar', 'Bar La Onda', 'Dorfkeller', 'BOX Davos']);
});

// --- 2. Gipfeli -----------------------------------------------------------------------------------------------------
test('gipfeli: an even pace rolls a perfect one, a rush tears it, a dawdle makes it sticky', () => {
  const even = createRoll(); while (!even.done) rollStep(even, { dp: 1.3 / 60 }, 1 / 60);
  assert.equal(rollPoints(even), 100);
  const rush = createRoll(); while (!rush.done) rollStep(rush, { dp: 5 / 60 }, 1 / 60);
  assert.ok(rollPoints(rush) < 20, `rushed ${rollPoints(rush)}`);
  const slow = createRoll(); while (!slow.done) rollStep(slow, { dp: 0.4 / 60 }, 1 / 60);
  assert.ok(rollPoints(slow) < 20, `slow ${rollPoints(slow)}`);
  // steady taps make a decent roll
  const taps = createRoll(); let n = 0;
  while (!taps.done && n < 3000) { rollStep(taps, { push: n % 18 === 0 ? 1 : 0 }, 1 / 60); n++; }
  assert.ok(taps.done && rollPoints(taps) >= 50, `taps ${rollPoints(taps)}`);
});

test('gipfeli: five rolls, then the hotels before seven; late ones earn little', () => {
  const g = createGipfeli();
  for (let k = 0; k < GIPFELI.count; k++) { while (!g.current.done) rollStep(g.current, { dp: 1.3 / 60 }, 1 / 60); gipfeliNext(g); }
  assert.ok(g.formed);
  assert.equal(gipfeliScore(g), 500);
  assert.equal(gipfeliClock(0), 6 * 60 + 40);
  assert.equal(gipfeliClock(120), 7 * 60);
  assert.ok(deliveryPoints(gipfeliClock(30)) > deliveryPoints(gipfeliClock(90)));
  assert.equal(deliveryPoints(gipfeliClock(200)), GIPFELI.points.late);
  const state = { gipfeli: g };
  const hotel = GIPFELI_HOTELS[0];
  const obj = GIPFELI_MISSION.objectives[2];
  assert.equal(obj.check(frame({ mode: 'cyclist', t: 1000, x: hotel.road.x + 30, z: hotel.road.z, speed: 5 }), state).done, false);
  assert.equal(obj.check(frame({ mode: 'cyclist', t: 31000, ...hotel.road, speed: 0 }), state).done, true);
  assert.equal(g.deliveries[0].points, deliveryPoints(gipfeliClock(30)));
  assert.equal(GIPFELI_MISSION.score(state), 500 + g.deliveries[0].points);
});

// --- 3. Raclette ----------------------------------------------------------------------------------------------------
test('raclette: the melt grades the plate; a burnt or wrong one costs, an impatient guest leaves', () => {
  assert.deepEqual([0.2, 0.52, 0.65, 0.77, 0.85, 0.94, 1].map(meltGrade), ['raw', 'soft', 'normal', 'between', 'crispy', 'scorched', 'burnt']);
  const g = createRaclette(1);
  g.queue.push({ id: 1, kind: 'normal', wait: 0 }, { id: 2, kind: 'crispy', wait: 0 }, { id: 3, kind: 'crispy', wait: 0 });
  g.melt = 0.65; assert.ok(racletteScrape(g).points >= RACLETTE.points.hit);
  assert.equal(g.melt, RACLETTE.fresh, 'a fresh face after a scrape');
  g.melt = 0.65; assert.equal(racletteScrape(g).points, RACLETTE.points.near, 'normal for a crispy order');
  g.melt = 1.0; assert.equal(racletteScrape(g).points, RACLETTE.points.burnt);
  const h = createRaclette(2);
  h.queue.push({ id: 9, kind: 'normal', wait: RACLETTE.patience - 0.05 });
  racletteStep(h, 0.1);
  assert.equal(h.left, 1);
  // a careful cook makes gold, the service ends after 90 s
  const c = createRaclette(7);
  while (!c.done) { racletteStep(c, 1 / 30); const q = c.queue[0]; if (q && meltGrade(c.melt) === q.kind && c.melt > (q.kind === 'normal' ? 0.64 : 0.84)) racletteScrape(c); }
  assert.ok(c.t >= RACLETTE.length);
  assert.equal(medalFor(c.score, RACLETTE_MISSION.medals, true), 'gold', `score ${c.score}`);
});

// --- 4. Ibex --------------------------------------------------------------------------------------------------------
test('ibex: only an old buck with long horns may be taken; the vitals make a clean shot', () => {
  const h = createHunt(3);
  assert.deepEqual(h.herd.map(legalIbex), [true, true, false, false, false, false, false, false]);
  for (const a of h.herd) a.y = 100;
  const aimAt = (a, zone) => { const z = ibexZones(a).find((q) => q.zone === zone); const o = { x: a.x - Math.cos(a.heading) * 180, y: z.y + 2, z: a.z + Math.sin(a.heading) * 180 }; const d = { x: z.x - o.x, y: z.y - o.y, z: z.z - o.z }; const l = Math.hypot(d.x, d.y, d.z); return { o, d: { x: d.x / l, y: d.y / l, z: d.z / l } }; };
  const buck = h.herd[0];
  const { o, d } = aimAt(buck, 'vitals');
  const hit = ibexRayHit([buck], o, d);
  assert.equal(hit.zone, 'vitals');
  assert.equal(ibexShotResult(hit, 180).kind, 'clean');
  assert.ok(ibexShotResult(hit, 220).points > ibexShotResult(hit, 150).points, 'a longer shot is worth more');
  const nanny = h.herd[3];
  assert.equal(ibexShotResult({ animal: nanny, zone: 'vitals', t: 180 }, 180).kind, 'forbidden');
  assert.ok(ibexShotResult({ animal: nanny, zone: 'vitals', t: 180 }, 180).points < 0);
  assert.equal(ibexShotResult(null, 200).kind, 'miss');
  // a shot: the ammo, the score, the animal down; a miss scatters the herd
  const res = huntShoot(h, o, d);
  assert.equal(res.kind, 'clean');
  assert.equal(h.ammo, IBEX.ammo - 1);
  assert.equal(buck.state, 'down');
  const before = herdCentre(h.herd);
  huntShoot(h, o, { x: 0, y: 1, z: 0 });
  assert.equal(h.shots[1].kind, 'miss');
  for (let k = 0; k < 120; k++) stepHerd(h.herd, 0.05, h.rand);
  const after = herdCentre(h.herd);
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 3, 'the herd moved off');
});

test('ibex: the wind drifts the bullet and carries the scent; running and closeness spook the herd', () => {
  const cross = ballistics(200, { dir: Math.PI / 2, speed: 4 }, 0); // the wind blows across the line (towards +x)
  assert.ok(Math.abs(cross.side) > 0.2 && Math.abs(cross.side) < 0.6, `drift ${cross.side}`);
  assert.ok(Math.abs(ballistics(200, { dir: 0, speed: 4 }, 0).side) < 1e-9, 'a head or tail wind does not drift');
  assert.ok(Math.abs(ballistics(IBEX.zero, { dir: 0, speed: 0 }, 0).drop) < 1e-9, 'zeroed at 200 m');
  assert.ok(ballistics(300, { dir: 0, speed: 0 }, 0).drop > 0);
  const herd = createHunt(3).herd;
  const c = herdCentre(herd);
  const far = { x: c.x - 240, z: c.z, speed: 1 };
  const calm = ibexAlarm(herd, far, { dir: Math.PI, speed: 3 }); // (blowing towards −x: from the herd to the hunter)
  assert.ok(calm.add < 0);
  assert.equal(ibexAlarm(herd, far, { dir: Math.PI / 2, speed: 3 }).why, 'the wind carries your scent');
  assert.equal(ibexAlarm(herd, { x: c.x - 180, z: c.z, speed: 5 }, { dir: Math.PI, speed: 3 }).why, 'you are running');
  assert.equal(ibexAlarm(herd, { x: c.x - 60, z: c.z, speed: 0 }, { dir: Math.PI, speed: 3 }).why, 'too close');
  // the mission: the stand first
  const r = run(IBEX_MISSION);
  assert.equal(IBEX_MISSION.objectives[0].check(frame({ x: IBEX.stand.x, z: IBEX.stand.z }), r.state).done, true);
  assert.equal(IBEX_MISSION.objectives[1].check(frame(), r.state).done, false);
});

// --- 5. Squirrels ---------------------------------------------------------------------------------------------------
test('squirrels: spots beside the lakeside path; a still hand with a nut feeds them, haste scares them', () => {
  const spots = squirrelSpots();
  assert.ok(spots.length > 50);
  for (const s of spots) { const on = nearestOnTrail(s.x, s.z); assert.ok(on.d > 4 && on.d < 9, `spot ${on.d.toFixed(1)} m off the path`); }
  // standing still at the Eichhörnliplatz with a nut
  const g = createSquirrelGame(squirrelSpots());
  const rand = seededRandom(2);
  const p = { x: 1956.5, z: -2547.5, speed: 0, offering: true };
  while (!g.done) stepSquirrels(g, p, 1 / 30, rand);
  assert.ok(g.fed >= 3, `fed ${g.fed}`);
  assert.equal(g.score > 0, true);
  // running about all the time feeds none and scares some
  const h = createSquirrelGame(squirrelSpots());
  let s = 0;
  const r2 = seededRandom(5);
  while (!h.done) { s += 4 / 30; const on = pointAt(s); stepSquirrels(h, { x: on.x, z: on.z, speed: 4, offering: true }, 1 / 30, r2); }
  assert.equal(h.fed, 0);
  // the objectives: to the Eichhörnliplatz, then three minutes
  const r = run(SQUIRREL_MISSION);
  assert.equal(SQUIRREL_MISSION.objectives[1].check(frame({ x: 1956.5, z: -2547.5 }), r.state).done, false);
  r.state.game.t = SQUIRREL.length; stepSquirrels(r.state.game, p, 0.01, rand);
  assert.equal(SQUIRREL_MISSION.objectives[1].check(frame({ x: 1956.5, z: -2547.5 }), r.state).done, true);
});
function pointAt(s) {
  const pts = SEEPROMENADE; let acc = 0;
  for (let i = 2; i < pts.length; i += 2) {
    const L = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    if (acc + L >= s % 950) { const f = (s % 950 - acc) / L; return { x: pts[i - 2] + (pts[i] - pts[i - 2]) * f, z: pts[i - 1] + (pts[i + 1] - pts[i - 1]) * f }; }
    acc += L;
  }
  return { x: pts[0], z: pts[1] };
}

// --- 6. Tennis ------------------------------------------------------------------------------------------------------
test('tennis: the tiebreak serve order, a shot over the net, the reach', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((n) => tiebreakServer(n)), ['p', 'a', 'a', 'p', 'p', 'a', 'a']);
  const v = aimShot({ x: 0, y: 1, z: 11 }, { x: 2, z: -9 }, 20);
  // its height over the net
  const tn = 11 / -v.vz;
  assert.ok(1 + v.vy * tn - 4.905 * tn * tn > COURT.net, 'clears the net');
  const t = createTennis(1);
  Object.assign(t.ball, { x: t.p.x + 0.8, y: 1.0, z: t.p.z - 0.3, live: true, bounces: 1, lastHit: 'a', served: false });
  assert.ok(swingQuality(t, 'p') > 0.6);
  t.ball.x = t.p.x + 3;
  assert.equal(swingQuality(t, 'p'), 0, 'out of reach');
  assert.ok(predictBall({ x: 0, y: 1, z: 0, vx: 0, vy: 2, vz: 15, bounces: 0 }, 10).z > 5);
});

test('tennis: a player who does nothing loses to the coach once served; a good player wins the tiebreak', () => {
  // the coach serves first when the player is handed the second point
  const idle = createTennis(5);
  let n = 0;
  // (the player serves the first point: a lazy serve, then no swing at all)
  while (!idle.done && n < 60 * 900) { stepTennis(idle, { swing: idle.phase === 'serve' && idle.server === 'p' && (!idle.toss || Math.abs(idle.toss.t - 0.53) < 0.02) }, 1 / 60); n++; }
  assert.ok(idle.done && idle.winner === 'a', `idle ${idle.score.p}:${idle.score.a}`);
  assert.equal(medalFor(tennisScore(idle), TENNIS_MISSION.medals, true), null);
  const good = createTennis(5);
  n = 0;
  while (!good.done && n < 60 * 900) {
    const input = { x: 0, z: 0, swing: false };
    if (good.phase === 'serve' && good.server === 'p') input.swing = !good.toss || Math.abs(good.toss.t - 0.53) < 0.02;
    else if (good.ball.live && good.ball.lastHit !== 'p') {
      const pr = predictBall(good.ball, COURT.halfL * 0.85);
      input.x = Math.max(-1, Math.min(1, (pr.x + 0.8 - good.p.x) * 2)); input.z = Math.max(-1, Math.min(1, (pr.z + 0.6 - good.p.z) * 2));
      if (swingQuality(good, 'p') > 0.5) { input.swing = true; input.steer = (n % 3) - 1; }
    }
    stepTennis(good, input, 1 / 60); n++;
  }
  assert.ok(good.done && good.winner === 'p', `good ${good.score.p}:${good.score.a}`);
  assert.ok(medalFor(tennisScore(good), TENNIS_MISSION.medals, true));
});

// --- 7. Slide -------------------------------------------------------------------------------------------------------
test('slide: the tube drops all the way; leaning into the bends beats riding high on the wall', () => {
  const line = slideCenterline(1);
  assert.ok(Math.abs(line.at(-1).s - slideLength()) < 1.01);
  for (let i = 1; i < line.length; i++) assert.ok(line[i].y <= line[i - 1].y + 1e-9, 'always downhill');
  assert.ok(slideLength() > 150);
  const ride = (policy) => { const r = createRider(); let n = 0; while (!r.done && n < 20000) { stepRider(r, policy(r), 0.01); n++; } return r; };
  const ideal = ride(idealSteer), none = ride(() => 0), high = ride((r) => -Math.sign(slideAt(r.s).curve));
  assert.ok(ideal.done && none.done);
  assert.ok(ideal.t < none.t - 0.5, `ideal ${ideal.t.toFixed(1)} s, none ${none.t.toFixed(1)} s`);
  assert.ok(high.t > none.t + 5 && high.rubT > 5, 'high on the wall rubs and brakes');
  assert.ok(none.rubT > 1);
  // the medal: a clean ride plus the walk to the tower makes gold
  assert.equal(medalFor((ideal.t + 5) * 1000, WATERSLIDE_MISSION.medals), 'gold');
  assert.notEqual(medalFor((high.t + 5) * 1000, WATERSLIDE_MISSION.medals), 'gold');
  assert.ok(SLIDE.segments.some((s) => s.curve > 0) && SLIDE.segments.some((s) => s.curve < 0), 'bends both ways');
});

// --- 8. Kirchner ----------------------------------------------------------------------------------------------------
test('kirchner: the view in the palette, scored by likeness, colour and contours', () => {
  assert.equal(KIRCHNER_PALETTE.length, 8);
  assert.equal(KIRCHNER_PALETTE[kirchnerIndex(60, 110, 220)].family, 'blue', 'the sky');
  assert.equal(KIRCHNER_PALETTE[kirchnerIndex(60, 140, 60)].id, 'emerald', 'a meadow');
  assert.equal(KIRCHNER_PALETTE[kirchnerIndex(10, 10, 12)].id, 'black');
  assert.equal(KIRCHNER_PALETTE[kirchnerIndex(250, 250, 252)].id, 'pink', 'the snow');
  assert.equal(KIRCHNER_PALETTE[kirchnerIndex(200, 70, 40)].id, 'vermilion', 'a roof');
  assert.equal(nearestPalette(0x1f, 0x3f, 0xbf), 0);
  assert.equal(paletteMatch(0, 1), 0.5); assert.equal(paletteMatch(0, 0), 1); assert.equal(paletteMatch(0, 2), 0); assert.equal(paletteMatch(-1, 2), 0);
  const [cols, rows] = KIRCHNER.grid;
  // a template: sky (blue) over a meadow (green)
  const cells = new Int8Array(cols * rows).map((_, i) => (Math.floor(i / cols) < rows / 2 ? 0 : 2));
  const template = { cells, edges: templateEdges(cells, cols, rows) };
  assert.equal(template.edges.filter(Boolean).length, cols, 'the horizon is the edge');
  const empty = scorePainting(template, { cells: new Int8Array(cols * rows).fill(-1), edges: new Uint8Array(cols * rows) });
  assert.equal(empty.points, 0);
  const copy = scorePainting(template, { cells: Int8Array.from(cells), edges: Uint8Array.from(template.edges) });
  assert.equal(medalFor(copy.points, KIRCHNER_MISSION.medals, true), 'gold', `copy ${copy.points}`);
  const family = scorePainting(template, { cells: cells.map((c) => (c === 0 ? 1 : c)), edges: new Uint8Array(cols * rows) });
  assert.ok(family.points < copy.points && family.likeness > 0.6, 'cobalt for ultramarine counts half');
  const blackAll = scorePainting(template, { cells: new Int8Array(cols * rows).fill(7), edges: new Uint8Array(cols * rows).fill(1) });
  assert.ok(blackAll.points < 400, `all black ${blackAll.points}`);
  // the grid's mode: a quarter of a cell painted counts
  const img = new Int8Array(8 * 8).fill(-1); for (let i = 0; i < 16; i++) img[i] = 3;
  assert.deepEqual([...gridMode(img, 8, 8, 2, 2)], [3, 3, -1, -1]);
});

// --- Starts clear of the buildings ------------------------------------------------------------------------------------
// The OSM footprints (js/davos-geodata.js) and the landmark buildings' parts (js/landmark-buildings-data.js): a mission
// that starts inside one traps the player in the house. The local missions keep 1.5 m from every wall at their start
// and pin; the other missions are checked too, with the starts that are inside a building on purpose (a helipad on the
// Spital's roof, the rink inside the Eisstadion, a teleport start, the RhB in its station) reported, not failed.
test('mission starts and pins: not inside a building, the local ones 1.5 m clear of every wall', async (t) => {
  const { DAVOS_DATA } = await import('../js/davos-geodata.js');
  const { KONGRESS, PARSENN, ringPoints, pointInRing } = await import('../js/landmark-buildings-data.js');
  const rings = [...DAVOS_DATA.buildings.map((b) => ({ id: b.id, r: ringPoints(b.ring) })), ...KONGRESS.parts.map((p, i) => ({ id: `kongress-${i}`, r: ringPoints(p.ring) })), ...(PARSENN.parts || []).map((p, i) => ({ id: `parsenn-${i}`, r: ringPoints(p.ring) }))];
  const wall = (r, x, z) => {
    let m = Infinity;
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      m = Math.min(m, Math.hypot(ax + dx * t - x, az + dz * t - z));
    }
    return m;
  };
  const probe = (x, z) => {
    let inside = null, near = Infinity;
    for (const q of rings) { if (Math.abs(q.r[0][0] - x) > 400 || Math.abs(q.r[0][1] - z) > 400) continue; if (pointInRing(q.r, x, z)) inside = q.id; near = Math.min(near, wall(q.r, x, z)); }
    return { inside, near };
  };
  const reported = [];
  for (const m of MISSIONS) {
    const local = LOCAL_MISSIONS.includes(m);
    for (const [what, p] of [['start', m.start], ['pin', missionPin(m)]]) {
      const c = probe(p.x, p.z);
      if (local) {
        assert.equal(c.inside, null, `${m.id} ${what} inside ${c.inside}`);
        assert.ok(c.near >= 1.5, `${m.id} ${what}: ${c.near.toFixed(2)} m from a wall`);
      } else if (c.inside && m.mode !== 'helicopter' && m.mode !== 'rhb' && !m.start.teleport) reported.push(`${m.id} ${what} inside ${c.inside}`);
    }
  }
  // (the local missions' doors are reached from outside: in front of a wall, never inside)
  for (const d of [BREWERY.door, ...BEER_STOPS.map((s) => s.door), GIPFELI_MISSION.objectives[0].check(frame(), {}).target, KIRCHNER.easel]) {
    assert.equal(probe(d.x, d.z).inside, null);
  }
  if (reported.length) t.diagnostic(`starts inside a building (other packages): ${reported.join('; ')}`);
});
