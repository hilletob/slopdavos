import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  SAMD_MISSION, SAMD_MISSIONS, SPIT, ROLES, ROOF, START, DOOR, REKTOR_AT, yardToWorld, worldToYard, eyeAt, gobOf, windAt, launchGob, stepGob,
  predictGob, clampAim, createWalker, pathPoint, createBreak, startHock, releaseHock, setDuck, hockLevel, stepBreak, breakScore, comboMult, rng
} from '../js/missions-data-samd.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { missionMedals } from '../js/missions-progress.js';

// tests/missions-samd.test.mjs — the long break on the SAMD's roof (js/missions-data-samd.js, three.js-free): the gob
// in still air and in the wind, the lead on a walker, the hits and their points, the combo, the suspicion and the
// Hausmeister, the bell; a bot plays whole breaks for the medals.

const flat = () => 0;
const calm = { x: 0, y: 0, z: 0, speed: 0 };
const DT = 1 / 60;
/** A break on the roof with an empty yard (nobody comes), no wind */
function quiet(seed = 1) {
  const st = createBreak(seed);
  st.onRoof = true; st.walkers = []; st.spawnT = 1e9; st.rektors = REKTOR_AT.length;
  st.wind.base = 0; st.wind.gust = 0;
  return st;
}
const run = (st, s) => { for (let t = 0; t < s; t += DT) stepBreak(st, DT, flat); };
const hockFor = (st, s) => { assert.ok(startHock(st)); run(st, s); };

test('the roof of the SAMD is listed: all year, a school morning, on foot, scored, with its icon, medals and preloads', () => {
  const m = SAMD_MISSION;
  assert.equal(getMission('samd-dach'), m);
  assert.ok(MISSIONS.includes(m));
  assert.deepEqual(SAMD_MISSIONS.map((d) => d.id), ['samd-dach']);
  assert.equal(m.mode, 'person'); assert.equal(m.season, null); assert.equal(m.time, 'morning');
  assert.deepEqual(m.features, ['samdRoof']);
  assert.ok(m.scoreMode);
  assert.equal(m.board, 'samd-dach-1');
  const l = missionMedals(m);
  assert.ok(l.gold > l.silver && l.silver > l.bronze && l.bronze > 0);
  assert.match(readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8'), /case 'spit'/);
  assert.match(readFileSync(new URL('../js/missions.js', import.meta.url), 'utf8'), /SAMD_FEATURES/);
  const play = readFileSync(new URL('../play.html', import.meta.url), 'utf8');
  for (const f of ['missions-data-samd.js', 'missions-samd.js']) assert.ok(play.includes(`href="./js/${f}"`), f);
  for (const other of MISSIONS.filter((d) => d !== m)) { const p = other.pin || other.start; assert.ok(Math.hypot(p.x - START.x, p.z - START.z) > 16, other.id); }
  // (the door is a short walk from the start)
  assert.ok(Math.hypot(DOOR.x - START.x, DOOR.z - START.z) < 40);
});

test('the yard\'s frame: out from the facade over the yard, and back', () => {
  const p = yardToWorld(3, 10), y = worldToYard(p.x, p.z);
  assert.ok(Math.abs(y.u - 3) < 1e-9 && Math.abs(y.v - 10) < 1e-9);
  assert.ok(yardToWorld(0, 10).z < ROOF.z, 'the yard lies north of the main building (−z)');
  const eye = eyeAt(flat);
  assert.ok(Math.abs(eye.y - ROOF.height - ROOF.eyeUp) < 1e-9);
  assert.ok(eyeAt(flat, true).y < eye.y, 'ducked, the head is lower');
  const a = clampAim(...Object.values(yardToWorld(0, 80)));
  assert.ok(Math.abs(worldToYard(a.x, a.z).v - SPIT.range.vMax) < 1e-6, 'the reticle stays on the yard');
});

test('in still air a gob lands on the reticle; a full hock leaves the mouth slower and falls longer', () => {
  const eye = eyeAt(flat);
  for (const v of [3, 8, 15, 24]) {
    for (const c of [0, 1]) {
      const aim = { ...yardToWorld(-4, v), y: 0 };
      const p = predictGob(eye, aim, c, calm, flat);
      assert.ok(Math.hypot(p.x - aim.x, p.z - aim.z) < 0.15, `v ${v} c ${c}: ${p.x - aim.x}, ${p.z - aim.z}`);
    }
  }
  const near = { ...yardToWorld(0, 3), y: 0 };
  const quick = predictGob(eye, near, 0, calm, flat), full = predictGob(eye, near, 1, calm, flat);
  assert.ok(full.t > quick.t + 0.2, `a hock falls longer: ${quick.t} → ${full.t}`);
  // 23.35 m: from the mouth at 3.6 m/s down ~1.85 s, at 0.3 m/s ~2.15 s
  assert.ok(Math.abs(quick.t - 1.85) < 0.05 && Math.abs(full.t - 2.15) < 0.05, `${quick.t} ${full.t}`);
  // far out it is lobbed: slower across than vMax, longer in the air
  const g = launchGob(eye, { ...yardToWorld(0, 31), y: 0 }, 1);
  assert.ok(Math.hypot(g.vx, g.vz) <= SPIT.vMax + 1e-9 && g.vy > 0 && g.T > 2.9);
  assert.ok(gobOf(1).size === 2 && gobOf(0).size === 1 && gobOf(1).hitR > gobOf(0).hitR && gobOf(1).drift < gobOf(0).drift);
});

test('the wind carries a gob: further the longer it falls, less a big one', () => {
  const eye = eyeAt(flat), aim = { ...yardToWorld(0, 8), y: 0 };
  const wind = { x: 3, z: 0, speed: 3 };
  const quick = predictGob(eye, aim, 0, wind, flat), full = predictGob(eye, aim, 1, wind, flat);
  const dq = quick.x - aim.x, df = full.x - aim.x;
  // drift ≈ ½ · k · W · T²
  assert.ok(Math.abs(dq - 0.5 * SPIT.drift.quick * 3 * quick.t ** 2) < 0.15, `quick ${dq}`);
  assert.ok(dq > 1.5 && df > 0.5 && df < dq, `${dq} ${df}`);
  assert.ok(Math.abs(quick.z - aim.z) < 0.15, 'only downwind');
  // aimed upwind by the drift, it lands on the spot
  const p = predictGob(eye, { x: aim.x - dq, y: 0, z: aim.z }, 0, wind, flat);
  assert.ok(Math.hypot(p.x - aim.x, p.z - aim.z) < 0.15);
  // the day's wind: gusty, in m/s, never negative
  const w = { base: 1.5, gust: 1, dir: 0.4, ph: 2 };
  for (let t = 0; t < 150; t += 7) { const n = windAt(w, t); assert.ok(n.speed >= 0 && n.speed <= 2.5 && Math.abs(Math.hypot(n.x, n.z) - n.speed) < 1e-9); }
});

test('a walker is hit only with lead: spat at where he is, the gob lands behind him', () => {
  const shoot = (lead) => {
    const st = quiet();
    const w = createWalker('pupil', rng(3), { pathName: 'yard', reverse: false, s: 18 });
    st.walkers.push(w);
    hockFor(st, SPIT.hockS);
    const eye = eyeAt(flat), H = () => ROLES.pupil.height;
    let aim = { x: w.x, z: w.z };
    if (lead) for (let k = 0; k < 6; k++) { const p = predictGob(eye, { ...aim, y: 0 }, 1, calm, H); const f = pathPoint(w.path, w.s + w.speed * p.t); aim = { x: aim.x + f.x - p.x, z: aim.z + f.z - p.z }; }
    releaseHock(st, aim, flat);
    const events = [];
    for (let t = 0; t < 4 && st.gobs.length; t += DT) { stepBreak(st, DT, flat); events.push(...st.events.splice(0)); }
    return { st, w, events };
  };
  const plain = shoot(false);
  assert.equal(plain.st.hits, 0); assert.equal(plain.st.misses, 1);
  assert.ok(plain.events.some((e) => e.kind === 'splat'));
  const led = shoot(true);
  assert.equal(led.st.hits, 1);
  const hit = led.events.find((e) => e.kind === 'hit');
  assert.equal(hit.points, ROLES.pupil.points * 2, 'a full hock doubles the points');
  assert.ok(ROLES.pupil.lines.includes(hit.line));
  assert.equal(led.w.state, 'react', 'he stops and shouts up at the roof');
  assert.ok(led.w.stareT > 0);
});

test('hits in a row multiply, a miss or a forbidden target ends the run; the dog and the little ones cost points', () => {
  assert.equal(comboMult(1), 1); assert.equal(comboMult(3), 1.5); assert.equal(comboMult(20), SPIT.comboMax);
  const st = quiet();
  // drop gobs straight onto standing people
  const drop = (role) => {
    const w = createWalker(role, rng(7), { pathName: 'yard', s: 20 });
    w.state = 'stop'; w.stopT = 99;
    st.walkers.push(w);
    st.mouth = 'ready'; st.suspicion = 0; // (no Hausmeister in this one)
    assert.ok(startHock(st));
    releaseHock(st, { x: w.x, z: w.z }, flat);
    for (let t = 0; t < 4 && st.gobs.length; t += DT) stepBreak(st, DT, flat);
    st.events.length = 0;
    return w;
  };
  drop('pupil'); drop('teacher'); drop('rektor');
  assert.equal(st.combo, 3);
  assert.equal(st.points, 10 + Math.round(25 * 1.25) + Math.round(60 * 1.5));
  assert.equal(st.rektorHits, 1);
  const before = st.points;
  drop('dog');
  assert.equal(st.points, before + ROLES.dog.points);
  assert.equal(st.combo, 0); assert.equal(st.forbidden, 1);
  drop('toddler');
  assert.equal(st.points, before + ROLES.dog.points + ROLES.toddler.points);
  // a miss on the ground ends a run
  drop('pupil'); assert.equal(st.combo, 1);
  st.mouth = 'ready'; st.suspicion = 0; startHock(st); releaseHock(st, yardToWorld(-12, 6), flat);
  run(st, 4);
  assert.equal(st.combo, 0);
  assert.equal(st.misses, 1);
});

test('the hock: up to full in 1.1 s, held too long it goes down the wrong way; one at a time, a pause to collect', () => {
  const st = quiet();
  assert.equal(hockLevel(st), 0);
  hockFor(st, 0.55);
  assert.ok(Math.abs(hockLevel(st) - 0.5) < 0.03);
  run(st, 1);
  assert.equal(hockLevel(st), 1);
  for (let t = 0; t < SPIT.chokeS && !st.chokes; t += DT) stepBreak(st, DT, flat);
  assert.equal(st.mouth, 'reload'); assert.equal(st.chokes, 1);
  assert.ok(st.suspicion > 0.05, 'the yard heard the cough');
  assert.equal(releaseHock(st, yardToWorld(0, 5), flat), null);
  run(st, SPIT.reloadS * 2 + 0.1);
  assert.equal(st.mouth, 'ready');
  hockFor(st, 0.2);
  assert.ok(releaseHock(st, yardToWorld(0, 5), flat));
  assert.equal(startHock(st), false, 'collecting the next one');
  // ducked: no spitting, a hock in the mouth is lost
  run(st, 1);
  startHock(st); setDuck(st, true);
  assert.equal(st.mouth, 'reload');
  run(st, 1);
  assert.equal(startHock(st), false);
});

test('the suspicion: a hit makes the yard look up, the staring ones see the boys, ducking calms it, full brings the Hausmeister', () => {
  const st = quiet();
  const w = createWalker('rektor', rng(1), { s: 10 });
  w.state = 'stop'; w.stopT = 99;
  st.walkers.push(w);
  hockFor(st, SPIT.hockS);
  releaseHock(st, { x: w.x, z: w.z }, flat);
  for (let t = 0; t < 5 && st.gobs.length; t += DT) stepBreak(st, DT, flat);
  assert.equal(st.hits, 1);
  const after = st.suspicion;
  assert.ok(after >= ROLES.rektor.sus * 1.3, `the Rektor: ${after}`);
  run(st, 2);
  assert.ok(st.suspicion > after, 'he stares up at the roof: it rises');
  setDuck(st, true);
  const ducked = st.suspicion;
  run(st, 2);
  assert.ok(st.suspicion < ducked - 0.25, 'ducked it ebbs');
  setDuck(st, false);
  // hit after hit without ducking: the Hausmeister comes up the hatch
  const events = [];
  for (let i = 0; i < 8 && !st.over; i++) {
    const p = createWalker('teacher', rng(i + 2), { s: 8 });
    p.state = 'stop'; p.stopT = 99;
    st.walkers.push(p);
    st.mouth = 'ready'; startHock(st); st.hockT = SPIT.hockS;
    releaseHock(st, { x: p.x, z: p.z }, flat);
    for (let t = 0; t < 2.5 && !st.over; t += DT) { stepBreak(st, DT, flat); events.push(...st.events.splice(0)); }
  }
  assert.ok(st.over && st.caught && !st.bell);
  assert.ok(events.some((e) => e.kind === 'warn') && events.some((e) => e.kind === 'caught'));
  assert.equal(breakScore(st), Math.max(0, st.points - SPIT.caughtPenalty));
  assert.equal(SAMD_MISSION.objectives[1].check({}, { brk: st }).done, true);
  assert.match(SAMD_MISSION.summary({ brk: st })[1], /Hausmeister/);
});

test('the break: the yard fills, the Rektor comes three times, the bell rings after 2:30', () => {
  const st = createBreak(5);
  assert.ok(st.walkers.length >= 6, 'busy from the start');
  // before the roof the clock stands
  run(st, 5);
  assert.equal(st.t, 0);
  st.onRoof = true;
  const kinds = [];
  for (let t = 0; t < SPIT.breakS + 1 && !st.over; t += DT) { stepBreak(st, DT, flat); kinds.push(...st.events.splice(0).map((e) => e.kind)); }
  assert.ok(st.over && st.bell && !st.caught);
  assert.equal(kinds.filter((k) => k === 'rektor').length, REKTOR_AT.length);
  assert.ok(st.walkers.length >= 3 && st.walkers.length <= 14);
  const roles = new Set();
  const s2 = createBreak(9); s2.onRoof = true;
  for (let t = 0; t < 150; t += DT) { stepBreak(s2, DT, flat); for (const w of s2.walkers) roles.add(w.role); }
  for (const r of ['pupil', 'teacher', 'rektor', 'tourist', 'cyclist', 'dog']) assert.ok(roles.has(r), r);
  // the steps' texts
  const view = SAMD_MISSION.objectives[1].check({}, { brk: st });
  assert.match(view.text, /^\d+ pts · 0:00 left$/);
  const walk = SAMD_MISSION.objectives[0].check({ x: START.x, z: START.z }, { brk: st });
  assert.ok(!walk.done && /to the side door of the SAMD$/.test(walk.text));
  assert.ok(SAMD_MISSION.objectives[0].check({ x: DOOR.x, z: DOOR.z }, {}).done);
});

/** A bot at the parapet: full hocks at the best target in reach, the lead and the wind worked out, ducking when the
 *  suspicion climbs; `sloppy` m of error in its aim */
function bot(seed, sloppy = 0) {
  const st = createBreak(seed);
  st.onRoof = true;
  const r = rng(seed + 99), eye = eyeAt(flat);
  for (let t = 0; t < 200 && !st.over; t += DT) {
    if (st.suspicion > 0.45) setDuck(st, true); else if (st.suspicion < 0.12) setDuck(st, false);
    if (st.mouth === 'ready' && !st.ducked) startHock(st);
    if (st.mouth === 'hocking' && st.hockT >= SPIT.hockS) {
      let best = null;
      for (const w of st.walkers) {
        if (w.hit || ROLES[w.role].forbidden || w.state !== 'walk') continue;
        const y = worldToYard(w.x, w.z);
        if (y.v > 2 && y.v < 26 && (!best || ROLES[w.role].points > ROLES[best.role].points)) best = w;
      }
      if (best) {
        const H = () => ROLES[best.role].height;
        let aim = { x: best.x, z: best.z };
        for (let k = 0; k < 8; k++) { const p = predictGob(eye, { ...aim, y: 0 }, 1, st.windNow, H); const f = pathPoint(best.path, best.s + best.speed * p.t); aim = { x: aim.x + f.x - p.x, z: aim.z + f.z - p.z }; }
        releaseHock(st, { x: aim.x + (r() - 0.5) * sloppy, z: aim.z + (r() - 0.5) * sloppy }, flat);
      }
    }
    stepBreak(st, DT, flat);
    st.events.length = 0;
  }
  return st;
}

test('the medals: a sharp bot makes gold, a sloppy one about gold, nobody leaves empty-handed by spitting at all', () => {
  const m = missionMedals(SAMD_MISSION);
  const sharp = [1, 2, 3].map((s) => breakScore(bot(s)));
  const sloppy = [1, 2, 3].map((s) => breakScore(bot(s, 3)));
  for (const s of sharp) assert.ok(s > m.gold * 1.1, `sharp ${s}`);
  for (const s of sloppy) assert.ok(s > m.silver && s < m.gold * 1.4, `sloppy ${s}`);
  const b = bot(4, 3);
  assert.ok(b.over && b.spits > 30);
  assert.match(SAMD_MISSION.summary({ brk: b })[0], /^\d+ gobs · \d+ hits · best run ×\d+ · the Rektor \d× · \d+ off limits$/);
});
