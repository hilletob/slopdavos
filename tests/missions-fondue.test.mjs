import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { medalFor } from '../js/missions-progress.js';
import { createSledge, stepSledge, projectOnRun, laneAt, bendAt, DRIFT, SLEDGE_CRASH_MS } from '../js/missions-data-sledge.js';
import { pointAt, riderSpeed, travelHeading } from '../js/missions-data-snow.js';
import { createFlaemmli } from '../js/missions-data-gastro.js';
import {
  FONDUE_MISSION, FONDUE_MISSIONS, FONDUE_START, KONGRESS_DOOR, SCHATZALP_ARRIVAL, FONDUE_TABLE, SCHLITTEL_RUN, schlittelCourse, smoothRun,
  STIR, createStir, stirPoint, stirLift, stirStep, stirGauge, fondueStir, lemniscate, circleStroke, SHORTCUTS, LANE,
  flaemmliEffect, effectWord, settleFlaemmli, flaemmliParams, createTipsy, tipsyInput, tipsyRoll, driftInput, assistInput, laneBot, driftBot, passShortcut, TIPSY,
  schlittelHeight, SCHLITTEL_START_S, SCHLITTEL_TRACK
} from '../js/missions-data-fondue.js';
import { loadI18n } from './helpers/dom-stub.mjs';
import { frameWith } from './helpers/frames.mjs';

// tests/missions-fondue.test.mjs
// The Drupal Mountain Camp's Fondue Night (js/missions-data-fondue.js is three.js-free): the places, the figure of
// eight told from circles and scribbles with strokes as a pointer would bring them, the Flämmli's effect by its Williams,
// the smoothed run and its shortcuts, the drift, bots down the Schatzalp's sled run on the real terrain with and without
// the shortcuts and the Flämmli's effect, the whole evening with synthetic frames, its German.

const DT = 1 / 120;
const inRing = (r, x, z) => {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > z) !== (r[j + 1] > z) && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c;
  return c;
};
const inBuilding = (x, z) => DAVOS_DATA.buildings.some((b) => Math.abs(b.ring[0] - x) < 200 && Math.abs(b.ring[1] - z) < 200 && inRing(b.ring, x, z));
const frame = frameWith({ dt: 1 / 60, t: 1000 });
/** A stroke into the pot, the pot's own time running with it: { eights, events: { eight: n, … }, g } */
function feed(pts, g = createStir()) {
  const events = {};
  let last = pts[0].t;
  for (const p of pts) {
    for (const ev of [stirStep(g, p.t - last), stirPoint(g, p.u, p.v, p.t)]) if (ev) events[ev] = (events[ev] || 0) + 1;
    last = p.t;
  }
  return { eights: g.eights, events, g };
}

test('the Fondue Night is listed: on foot, in winter, in the evening, with its logo and both modules preloaded', () => {
  const m = FONDUE_MISSION;
  assert.equal(getMission('fondue-night-schatzalp'), m);
  assert.ok(MISSIONS.includes(m) && FONDUE_MISSIONS.includes(m));
  assert.equal(m.mode, 'person'); assert.equal(m.season, 'winter'); assert.equal(m.time, 'evening');
  assert.deepEqual(m.features, ['fondueNight', 'flaemmli']);
  assert.deepEqual(m.flaemmli, { look: 'schatzalp', rounds: 1, leave: true });
  assert.equal(m.interior.door, FONDUE_TABLE);
  assert.equal(m.board, 'fondue-night-schatzalp-1');
  assert.ok(m.medals.gold < m.medals.silver && m.medals.silver < m.medals.bronze);
  assert.equal(m.bonusMs, m.medals.gold);
  assert.deepEqual(m.objectives.map((o) => o.id), ['meet', 'up', 'stir', 'flaemmli', 'upper', 'village']);
  assert.ok(readFileSync(new URL(`../${m.logo}`, import.meta.url)).length > 1000, 'the logo is there');
  const play = readFileSync(new URL('../play.html', import.meta.url), 'utf8');
  for (const f of ['missions-data-fondue.js', 'missions-fondue.js']) assert.ok(play.includes(`href="./js/${f}"`), f);
});

test('the places stand outside every building, the run is the mapped sled run', () => {
  for (const [name, p] of Object.entries({ start: FONDUE_START, door: KONGRESS_DOOR, arrival: SCHATZALP_ARRIVAL, table: FONDUE_TABLE })) assert.ok(!inBuilding(p.x, p.z), `${name} is not inside a building`);
  // (the start looks at the door; the way from the arrival to the table is clear)
  assert.ok(Math.sin(FONDUE_START.heading) * (KONGRESS_DOOR.x - FONDUE_START.x) + Math.cos(FONDUE_START.heading) * (KONGRESS_DOOR.z - FONDUE_START.z) > 30);
  for (let k = 0; k <= 1; k += 0.05) assert.ok(!inBuilding(SCHATZALP_ARRIVAL.x + (FONDUE_TABLE.x - SCHATZALP_ARRIVAL.x) * k, SCHATZALP_ARRIVAL.z + (FONDUE_TABLE.z - SCHATZALP_ARRIVAL.z) * k));
  const c = schlittelCourse();
  assert.equal(SCHLITTEL_RUN.length, 176 * 2);
  assert.ok(c.length > 2200 && c.length < 2320, `${c.length}`);
  assert.ok(c.bends.filter((b) => !b.berm).length >= 25, `${c.bends.length} bends`);
  // (the smoothed line keeps to the mapped ways' bench: within 1.2 m of them, and no corner left in it)
  const raw = { ...schlittelCourse(), pts: SCHLITTEL_RUN };
  const mapped = (x, z) => { let best = Infinity; for (let i = 2; i < SCHLITTEL_RUN.length; i += 2) { const ax = SCHLITTEL_RUN[i - 2], az = SCHLITTEL_RUN[i - 1], ux = SCHLITTEL_RUN[i] - ax, uz = SCHLITTEL_RUN[i + 1] - az, t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz))); best = Math.min(best, Math.hypot(x - ax - ux * t, z - az - uz * t)); } return best; };
  for (let i = 0; i < c.pts.length; i += 2) assert.ok(mapped(c.pts[i], c.pts[i + 1]) < 1.25, `point ${i / 2}`);
  assert.ok(raw && smoothRun().length === c.pts.length);
  let turn = 0;
  for (let i = 4; i < c.pts.length; i += 2) {
    const h0 = Math.atan2(c.pts[i - 2] - c.pts[i - 4], c.pts[i - 1] - c.pts[i - 3]), h1 = Math.atan2(c.pts[i] - c.pts[i - 2], c.pts[i + 1] - c.pts[i - 1]);
    turn = Math.max(turn, Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0))));
  }
  assert.ok(turn < 0.6, `the sharpest corner between two 2 m steps: ${turn} rad`);
  for (let i = 0; i < SCHLITTEL_RUN.length; i += 2) assert.ok(SCHLITTEL_RUN[i] > -1500 && SCHLITTEL_RUN[i] < -900 && SCHLITTEL_RUN[i + 1] > -1100 && SCHLITTEL_RUN[i + 1] < 250, `node ${i / 2} between the Schatzalp and Davos Platz`);
  for (let i = 0; i < SCHLITTEL_RUN.length; i += 2) assert.ok(!inBuilding(SCHLITTEL_RUN[i], SCHLITTEL_RUN[i + 1]), `node ${i / 2}`);
});

test('a figure of eight counts, however it lies in the pot', () => {
  // (the first loop of a stroke begins anywhere: n eights drawn give n - 1 counted)
  assert.equal(feed(lemniscate(9, 2)).eights, 8);
  assert.equal(feed(lemniscate(9, 2, { tilt: 1.05 })).eights, 8, 'tilted');
  assert.equal(feed(lemniscate(9, 2, { tilt: Math.PI / 2 })).eights, 8, 'upright');
  assert.equal(feed(lemniscate(9, 2, { scale: 0.3 })).eights, 8, 'small');
  assert.equal(feed(lemniscate(9, 2, { scale: 0.45, offset: [0.3, -0.25] })).eights, 8, 'off the middle');
  assert.equal(feed(lemniscate(9, 2, { rate: 30 })).eights, 8, 'a slow pointer');
  assert.ok(feed(lemniscate(9, 2, { jitter: 0.03 })).eights >= 7, 'a shaky hand');
  assert.equal(feed(lemniscate(9, 1)).eights, 8, 'briskly');
  const r = feed(lemniscate(9, 2));
  assert.deepEqual(r.events, { eight: 8 });
  assert.equal(r.g.strikes, 0);
  assert.ok(r.g.burn < 0.3, 'stirring keeps it from catching');
  assert.match(stirGauge(r.g).text, /^Figure eights 8\/8$/);
});

test('circles split the cheese, scribbles and dawdling make no eight, standing still lets it catch', () => {
  const circles = feed(circleStroke(10, 1.5));
  assert.equal(circles.eights, 0);
  assert.ok(circles.events.circle >= 6, JSON.stringify(circles.events));
  assert.ok(circles.g.strikes >= 1, 'round and round it catches');
  assert.match(stirGauge(circles.g).text, /caught \d+× \(\+\d+ s\)/);
  // back and forth across the pot
  const zig = [];
  for (let i = 0; i < 600; i++) { const s = i / 60, k = (s * 2) % 2; zig.push({ u: (k < 1 ? k : 2 - k) * 1.2 - 0.6, v: 0.02 * Math.sin(s * 7), t: s }); }
  assert.equal(feed(zig).eights, 0, 'back and forth');
  // a wiggle on the spot
  const wig = [];
  for (let i = 0; i < 600; i++) { const s = i / 60; wig.push({ u: 0.1 * Math.sin(s * 9), v: 0.08 * Math.sin(s * 13 + 1), t: s }); }
  assert.equal(feed(wig).eights, 0, 'a wiggle');
  const fast = feed(lemniscate(8, 0.6));
  assert.equal(fast.eights, 0); assert.ok(fast.events.splash >= 5, 'too fast splashes');
  const slow = feed(lemniscate(4, 5));
  assert.equal(slow.eights, 0); assert.ok(slow.events.slow >= 2, 'too slow');
  // a stroke lifted in the middle of an eight is no eight
  const g = createStir();
  const one = lemniscate(1, 2);
  for (const p of one.slice(0, 80)) stirPoint(g, p.u, p.v, p.t);
  stirLift(g);
  for (const p of one.slice(80)) stirPoint(g, p.u, p.v, p.t);
  assert.equal(g.eights, 0);
  // nothing catches before the first touch; then it does, at a cost
  const st = FONDUE_MISSION.createState();
  for (let i = 0; i < 600; i++) fondueStir(st, 1 / 60);
  assert.equal(st.penaltyMs, 0);
  stirPoint(st.stir, 0, 0, 0);
  let ev = null, s = 0;
  while (!ev && s < 60) { ev = fondueStir(st, 1 / 60); s += 1 / 60; }
  assert.equal(ev, 'burnt');
  assert.ok(s > 4 && s < 10, `${s}`);
  assert.equal(st.penaltyMs, STIR.burnMs);
  assert.match(stirGauge(st.stir).hint, /Caught on the bottom/);
});

test('the Flämmli: one round in the Stübli, its effect by the Williams poured, none if it was not drunk', () => {
  const g = createFlaemmli(11, 1);
  assert.equal(g.rounds, 1);
  assert.equal(flaemmliEffect(g), 0, 'nothing drunk yet');
  assert.equal(flaemmliEffect({ ...g, drinks: 1, williams: 0.1 }), 0.15, 'a drop of Williams: a little effect');
  const good = flaemmliEffect({ ...g, drinks: 1, williams: 0.6 }), strong = flaemmliEffect({ ...g, drinks: 1, williams: 0.95 });
  assert.ok(good > 0.5 && good < 0.8 && strong === 1, `${good} ${strong}`);
  assert.deepEqual([0, 0.2, good, strong].map(effectWord), ['none', 'mild', 'good', 'strong']);
  const st = FONDUE_MISSION.createState();
  assert.ok(!settleFlaemmli(st) && st.effect === null, 'no game yet');
  st.game = { ...g, drinks: 1, williams: 0.6, done: true };
  assert.ok(settleFlaemmli(st)); assert.equal(st.effect, good);
  st.game.williams = 0.95;
  assert.ok(!settleFlaemmli(st) && st.effect === good, 'settled once');
  // the sledge after it: bolder by the effect
  const N = flaemmliParams(0), P = flaemmliParams(1), M = flaemmliParams(good);
  assert.ok(P.on.maxSpeed > M.on.maxSpeed && M.on.maxSpeed > N.on.maxSpeed && P.track.tipG > N.track.tipG && P.on.drag < N.on.drag, 'bolder');
  assert.equal(N.track.half, SCHLITTEL_TRACK.half); assert.ok(N.track.netSlide && N.track.walls, 'soft banks along the run');
  assert.equal(flaemmliParams(good), M, 'the same numbers each time');
  const a = createTipsy(1), b = createTipsy(1);
  let first = null;
  for (let i = 0; i < 600; i++) {
    const x = tipsyInput({ steer: 1, tuck: 1, brake: i > 300 ? 1 : 0 }, DT, a), y = tipsyInput({ steer: 1, tuck: 1, brake: i > 300 ? 1 : 0 }, DT, b);
    first ??= x;
    assert.deepEqual(x, y, 'the same every time');
    assert.ok(x.steer >= -1 && x.steer <= 1 && x.brake >= 0 && x.brake <= 1);
  }
  assert.ok(first.steer < 0.2, 'late');
  const pull = (k) => { const c = createTipsy(k); let d = 0; for (let i = 0; i < 1200; i++) d = Math.max(d, Math.abs(tipsyInput({ steer: 0 }, DT, c).steer)); return d; };
  assert.ok(pull(1) > 0.05 && pull(1) < 0.3 && pull(0.3) < pull(1) * 0.5, `${pull(1)}`);
  assert.ok(Math.abs(tipsyRoll(1.7)) <= TIPSY.roll * 1.45 && Math.abs(tipsyRoll(1.7, 0.3)) < Math.abs(tipsyRoll(1.7)));
  assert.equal(tipsyInput({ steer: 1, brake: 1, drift: true }, DT, createTipsy(0.5)).drift, true, 'the drift goes through');
});

test('the shortcuts: lanes down through the forest between stacked hairpins, the trees out of them, a snow wall at each foot', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  const c = schlittelCourse();
  assert.equal(c.lanes.length, SHORTCUTS.length);
  // (js/city-grid.js keeps the forest out of the lanes: its aisles are these)
  const grid = readFileSync(new URL('../js/city-grid.js', import.meta.url), 'utf8');
  const aisles = JSON.parse(grid.match(/export const SLED_AISLES = (\[.*\]);/)[1]);
  c.lanes.forEach((L, i) => {
    assert.deepEqual(aisles[i], [L.ax, L.az, L.bx, L.bz].map((v) => Math.round(v * 10) / 10), `aisle ${i}`);
    assert.ok(L.len > 14 && L.len < 46 && L.s1 - L.s0 - L.len > 90, `lane ${i}: ${L.len} m for ${L.s1 - L.s0} m of run`);
    // (all the way downhill, and not along another leg of the run)
    let prev = groundHeight(L.ax, L.az);
    for (let t = 0.1; t <= 0.9; t += 0.1) {
      const x = L.ax + L.ux * t * L.len, z = L.az + L.uz * t * L.len, g = groundHeight(x, z);
      assert.ok(g < prev + 0.3, `lane ${i} climbs at ${t}`);
      prev = Math.min(prev, g);
      if (t > 0.25 && t < 0.75) assert.ok(Math.abs(projectOnRun(c, x, z).d) > 4, `lane ${i} runs along the run at ${t}`);
    }
    for (const [x, z] of L.trees) { const p = laneAt(L, x, z); assert.ok(p.t > 0.2 && p.t < 0.8 && Math.abs(p.d) < L.half - 1, `a spruce in lane ${i}`); }
    // the snow wall below, on the side away from the lane, and no net where the lane leaves or arrives
    const wall = bendAt(c, L.s1);
    assert.ok(wall?.berm && wall.side === -L.from, `the wall at lane ${i}'s foot`);
    for (let s = L.s0 - 8; s <= L.s0 + 10; s += 2) { const b = bendAt(c, s); assert.ok(!b || b.side !== L.side, `a net across lane ${i}'s top at ${s}`); }
    for (let s = L.s1 - LANE.wall[0]; s <= L.s1 + LANE.wall[1]; s += 2) assert.ok(c.bends.every((b) => b.berm || s < b.s0 || s > b.s1 || b.side !== L.from), `a net across lane ${i}'s foot at ${s}`);
  });
  // the checkpoints cut out by a shortcut count as passed
  const st = FONDUE_MISSION.createState();
  const L = c.lanes[1], before = st.cps.findIndex((cp) => cp.s > L.s0);
  st.next = before;
  passShortcut(st, L.s1);
  assert.ok(st.cps[st.next].s > L.s1 && st.cps[st.next - 1].s <= L.s1 + 2 && st.skipped === null);
});

test('the drift: S with A/D at speed slides the tail out, turns tighter, does not tip, and lets go with a push', async () => {
  const { groundHeight, trodHeight } = await import('../js/terrain.js');
  const c = schlittelCourse(), height = schlittelHeight(trodHeight, groundHeight), P = flaemmliParams(0);
  assert.equal(driftInput({ steer: 1, brake: 1 }).drift, true);
  assert.equal(driftInput({ steer: 0.2, brake: 1 }).drift, false, 'braking straight is braking');
  assert.equal(driftInput({ steer: 1, brake: 0.3 }).drift, false);
  // (on a straight stretch at 50 km/h: full lock and the brake, 0.8 s, then let go)
  const turnOf = (drift) => {
    const sl = createSledge(c, height, 612), r = sl.rider;
    const h = r.heading; r.vx = Math.sin(h) * 14; r.vz = Math.cos(h) * 14;
    let ev = null, maxTip = 0, slip = 0;
    for (let i = 0; i < 96; i++) { const e = stepSledge(sl, { steer: 1, brake: 1, drift }, DT, height, c, P.track, P); ev ??= e === 'crash' ? e : null; maxTip = Math.max(maxTip, sl.tip); slip = Math.max(slip, Math.abs(Math.atan2(Math.sin(r.heading - travelHeading(r, r.heading)), Math.cos(r.heading - travelHeading(r, r.heading))))); }
    const turned = Math.abs(Math.atan2(Math.sin(r.heading - h), Math.cos(r.heading - h))), speed = riderSpeed(r);
    const out = stepSledge(sl, { steer: 0, brake: 0, drift: false }, DT, height, c, P.track, P);
    return { turned, speed, after: riderSpeed(r), out, maxTip, slip, boosts: sl.boosts };
  };
  const heel = turnOf(false), drift = turnOf(true);
  assert.ok(drift.turned > heel.turned * 1.25, `drift ${drift.turned} rad, the heel ${heel.turned}`);
  assert.ok(drift.slip > DRIFT.slip && heel.slip < drift.slip, 'the tail out');
  assert.equal(drift.maxTip, 0, 'no tip while it slides');
  assert.ok(drift.after > heel.speed + 1, `out of the hairpin faster than the heels braked round it: ${drift.after} ${heel.speed}`);
  assert.equal(drift.out, 'boost'); assert.equal(drift.boosts, 1);
  assert.ok(drift.after > drift.speed + DRIFT.boost[0] * 0.9, `${drift.speed} → ${drift.after}`);
});

test('bots down the Schatzalp run: there with and without the shortcuts and the Flämmli, the shortcuts worth it, the medals by them', async () => {
  const { groundHeight, trodHeight } = await import('../js/terrain.js');
  const course = schlittelCourse();
  const height = schlittelHeight(trodHeight, groundHeight);
  // (the snow is smooth along the line: no step, and no kink a sledge would take off at)
  let prev = null, prev2 = null;
  for (let s = 0; s < course.length; s += 2) {
    const p = pointAt(course.pts, s), y = height(p.x, p.z);
    if (prev !== null) assert.ok(Math.abs(y - prev) < 1, `a step at ${s} m`);
    if (prev2 !== null) assert.ok(Math.abs(prev2 - 2 * prev + y) < 0.15, `a kink at ${s - 2} m`);
    prev2 = prev; prev = y;
  }
  const ride = (k, lanes, margin, keys = false, bot = laneBot) => {
    const sl = createSledge(course, height, SCHLITTEL_START_S), mem = createTipsy(k), P = flaemmliParams(k);
    let s = 0, n = 0, held = {};
    while (s < 400 && !(sl.proj.s >= course.length - 3 && !sl.lane)) {
      let input = sl.crashT > 0 ? {} : bot(sl, course, { lanes, margin, tipG: P.track.tipG, maxSpeed: P.on.maxSpeed });
      // (on the keys: full lock or nothing, decided ten times a second)
      if (keys) { if (n++ % 12 === 0) held = { steer: Math.abs(input.steer || 0) > 0.3 ? Math.sign(input.steer) : 0, tuck: input.tuck ? 1 : 0, brake: input.brake ? 1 : 0 }; input = sl.crashT > 0 ? {} : held; }
      input = assistInput(driftInput(input), sl, course); // (the game's assist, as in js/missions-fondue.js)
      if (k) input = tipsyInput(input, DT, mem);
      stepSledge(sl, input, DT, height, course, P.track, P);
      s += DT;
    }
    return { ms: s * 1000 + sl.crashes * SLEDGE_CRASH_MS, there: sl.proj.s >= course.length - 3, crashes: sl.crashes, shortcuts: sl.shortcuts };
  };
  const plain = ride(0, false, 0.7), cut = ride(0, true, 0.75), bold = ride(0.65, false, 0.7), boldCut = ride(0.65, true, 0.7);
  assert.ok(plain.there && cut.there && bold.there && boldCut.there, `all at the finish: ${JSON.stringify([plain, cut, bold, boldCut])}`);
  assert.equal(cut.shortcuts, SHORTCUTS.length); assert.equal(cut.crashes, 0);
  assert.ok(plain.ms > 150000 && plain.ms < 200000, `${plain.ms}`);
  assert.ok(cut.ms < plain.ms - 20000, `the shortcuts ${cut.ms}, the run ${plain.ms}`);
  assert.ok(bold.ms < plain.ms - 5000, `with a Flämmli ${bold.ms}, without ${plain.ms}`);
  // (a driver who drifts the hairpins instead of braking for them: there, and faster)
  const drifty = ride(0, false, 0.85, false, driftBot);
  assert.ok(drifty.there && drifty.ms < plain.ms, `drifting ${JSON.stringify(drifty)}, braking ${plain.ms}`);
  assert.ok(boldCut.ms < plain.ms && boldCut.crashes <= 1, `with a Flämmli and the shortcuts (the late horns among the spruces) ${JSON.stringify(boldCut)}`);
  // nobody is held at a net, a wall or under the bench: every way of driving gets there
  for (const k of [0, 1]) for (const lanes of [false, true]) { const r = ride(k, lanes, 0.82, true); assert.ok(r.there, `${k} ${lanes} keys ${JSON.stringify(r)}`); }
  // a beginner: W held, nothing else, the assist steers and brakes: there, never into a net or over
  {
    const sl = createSledge(course, height, SCHLITTEL_START_S), P = flaemmliParams(0);
    let s = 0;
    while (s < 400 && !(sl.proj.s >= course.length - 3 && !sl.lane)) { stepSledge(sl, assistInput(driftInput(sl.crashT > 0 ? {} : { tuck: 1 }), sl, course), DT, height, course, P.track, P); s += DT; }
    assert.ok(sl.proj.s >= course.length - 3 && s < 200, `W alone: ${s} s`);
    assert.equal(sl.crashes, 0, `${sl.crashes} crashes (${sl.last})`);
    assert.equal(sl.shortcuts, 0, 'no shortcut taken by mistake');
    assert.equal(medalFor(s * 1000 + sl.crashes * SLEDGE_CRASH_MS + 70000, FONDUE_MISSION.medals), 'silver');
  }
  // (the evening before the ride: some 70 s)
  const m = FONDUE_MISSION.medals;
  assert.equal(medalFor(cut.ms + 70000, m), 'gold', `a clean ride with the shortcuts: gold (${cut.ms})`);
  assert.equal(medalFor(plain.ms + 70000, m), 'silver', 'a clean careful ride on the run alone: silver');
  assert.ok(medalFor(300000, m), 'a slow evening still earns a medal');
});

test('the whole evening with synthetic frames, and what the panel says on the way', () => {
  const m = FONDUE_MISSION, st = m.createState();
  const step = (i, f) => { m.update(f, st); return m.objectives[i].check(f, st); };
  let v = step(0, frame({ x: FONDUE_START.x, z: FONDUE_START.z }));
  assert.ok(!v.done); assert.match(v.text, /^The camp waits at the entrance · 3\d m$/);
  assert.ok(step(0, frame({ x: KONGRESS_DOOR.x, z: KONGRESS_DOOR.z + 1 })).done);
  v = step(1, frame({ x: KONGRESS_DOOR.x, z: KONGRESS_DOOR.z }));
  assert.ok(!v.done && v.target === null); assert.match(v.text, /Schatzalpbahn/);
  st.arrived = true;
  v = step(1, frame({ x: SCHATZALP_ARRIVAL.x, z: SCHATZALP_ARRIVAL.z }));
  assert.ok(!v.done); assert.match(v.text, /^The fondue table on the terrace · 4\d m$/);
  assert.ok(step(1, frame({ x: FONDUE_TABLE.x + 1, z: FONDUE_TABLE.z })).done);
  const at = frame({ x: FONDUE_TABLE.x + 1, z: FONDUE_TABLE.z });
  assert.ok(!step(2, at).done);
  for (const p of lemniscate(9, 2)) { fondueStir(st, 1 / 60); stirPoint(st.stir, p.u, p.v, p.t); }
  v = step(2, at);
  assert.ok(v.done); assert.equal(v.progress, 1);
  v = step(3, at);
  assert.ok(!v.done); assert.match(v.text, /Stübli/);
  st.game = { ...createFlaemmli(11, 1), drinks: 1, williams: 0.62, score: 310, done: true };
  assert.ok(step(3, at).done);
  assert.equal(effectWord(st.effect), 'good');
  // on the terrace still: the ride waits, no checkpoint is taken there
  v = step(4, at);
  assert.ok(!v.done); assert.match(v.text, /To the sledges/); assert.equal(st.next, 0);
  st.riding = true;
  let done = 4;
  for (const cp of st.cps) {
    const f = frame({ x: cp.x, z: cp.z });
    m.update(f, st);
    while (done < m.objectives.length && m.objectives[done].check(f, st).done) done++;
  }
  assert.equal(done, m.objectives.length);
  assert.equal(st.penaltyMs, 0);
  const lines = m.summary(st);
  assert.match(lines[0], /^8 figure eights · nothing caught$/);
  assert.equal(lines[1], 'Flämmli 310 pts · effect good');
  assert.equal(lines[2], '0 crashes · 0 of 3 shortcuts · 0 drift boosts · top speed 0 km/h');
});

test('the Fondue Night speaks German', async () => {
  const { setLanguage, t } = await loadI18n();
  const m = FONDUE_MISSION;
  setLanguage('de');
  try {
    assert.equal(t(m.title), 'Fondue Night auf der Schatzalp');
    assert.match(t(m.intro), /^Drupal Mountain Camp, Open Source on top of the world, und heute Abend der Klassiker/);
    assert.match(t(m.finish), /Kufen/);
    for (const o of m.objectives) assert.notEqual(t(o.title), o.title, o.title);
    // (the moving texts are made with msg(), js/messages.js: made by the mission, then translated)
    const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de); };
    says(m.objectives[0].check(frame({ x: KONGRESS_DOOR.x + 35, z: KONGRESS_DOOR.z }), m.createState()).text, 'The camp waits at the entrance · 35 m', 'Das Camp wartet beim Eingang · 35 m');
    says(m.objectives[1].check(frame({ x: FONDUE_TABLE.x + 43, z: FONDUE_TABLE.z }), m.createState()).text, 'The fondue table on the terrace · 43 m', 'Der Fonduetisch auf der Terrasse · 43 m');
    says(stirGauge({ ...createStir(), eights: 5 }).text, 'Figure eights 5/8', 'Achten 5/8');
    says(stirGauge({ ...createStir(), eights: 5, strikes: 2 }).text, 'Figure eights 5/8 · caught 2× (+16 s)', 'Achten 5/8 · 2× angebrannt (+16 s)');
    const evening = (stir, effect, crashes, kmh, more = {}) => m.summary({ ...m.createState(), stir: { ...createStir(), ...stir }, game: { ...createFlaemmli(11, 1), score: 312 }, effect, crashes, topSpeed: kmh / 3.6, ...more });
    const [clean, tipsy, ride] = evening({ eights: 8 }, 0.9, 1, 84, { shortcuts: 2, boosts: 1 });
    says(clean, '8 figure eights · nothing caught', '8 Achten · nichts angebrannt');
    says(tipsy, 'Flämmli 312 pts · effect strong', 'Flämmli 312 Pkt. · Wirkung stark');
    says(ride, '1 crash (+5 s) · 2 of 3 shortcuts · 1 drift boost · top speed 84 km/h', '1 Sturz (+5 s) · 2 von 3 Abkürzungen · 1 Drift-Schub · Höchsttempo 84 km/h');
    const [caught, cold, ride2] = evening({ eights: 8, strikes: 1, circles: 3 }, 0, 0, 79, { boosts: 4 });
    says(caught, '8 figure eights · caught on the bottom 1× (+8 s) · 3 circles', '8 Achten · 1× angebrannt (+8 s) · 3-mal im Kreis gerührt');
    says(cold, 'Flämmli 312 pts · effect none', 'Flämmli 312 Pkt. · Wirkung keine');
    says(ride2, '0 crashes · 0 of 3 shortcuts · 4 drift boosts · top speed 79 km/h', '0 Stürze · 0 von 3 Abkürzungen · 4 Drift-Schübe · Höchsttempo 79 km/h');
    says(evening({}, 0.6, 0, 0)[1], 'Flämmli 312 pts · effect good', 'Flämmli 312 Pkt. · Wirkung gut');
    says(evening({}, null, 0, 0)[1], 'A Flämmli in the Stübli · 312 pts', 'Ein Flämmli im Stübli · 312 Pkt.');
    // every line the panel can show at the table
    const st = m.createState();
    for (const last of [null, 'eight', 'circle', 'splash', 'slow', 'burnt']) { st.stir.last = last; const h = stirGauge(st.stir).hint; assert.notEqual(t(h), h, h); }
    const here = frame({ x: FONDUE_TABLE.x, z: FONDUE_TABLE.z });
    for (const i of [0, 1, 3, 4]) { const v = m.objectives[i].check(here, st); for (const s of [v.text, v.hint]) if (s) assert.notEqual(t(s), s, s); }
    st.riding = true;
    const v = m.objectives[4].check(frame({ x: st.cps[0].x, z: st.cps[0].z + 40 }), st);
    assert.notEqual(t(v.hint), v.hint, v.hint);
    for (const more of [{ laneAhead: true }, { onLane: true }, { crashT: 1, why: 'tree' }]) { const h = m.objectives[5].check(frame({ x: 0, z: 0 }), { ...st, ...more }).hint; assert.notEqual(t(h), h, h); }
    st.game = createFlaemmli(11, 1);
    const fl = m.objectives[3].check(here, st);
    for (const s of [fl.text, fl.hint]) assert.notEqual(t(s), s, s);
    for (const s of ['Smooth!', 'It splits: cross the middle!', 'Too wild!', 'Too slow!', `Caught! +${STIR.burnMs / 1000} s`, 'creamy', 'catching', 'The valley sways: steer early!', 'W to go: the sledge keeps to the run by itself', 'The Flämmli went cold. To the sledges!', 'A mild Flämmli. To the sledges!', 'A good Flämmli. To the sledges!', 'A strong Flämmli. To the sledges!',
      'Drift boost!', 'Big drift boost!', 'Mega drift boost!', 'Spun round: no boost', 'Deep snow!', 'Shortcut!', 'SHORTCUT', 'Into a tree!', 'Into the Stübli …',
      'steer', 'brake · with A/D: drift, let go: boost', 'duck · push off']) assert.notEqual(t(s), s, s);
  } finally { setLanguage('en'); }
});
