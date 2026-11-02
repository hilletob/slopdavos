import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FUN_MISSIONS, HEADBANG, HEADBANG_CHART, HEADBANG_LENGTH, HEADBANG_MAX, BEAT_S, HEADBANG_RHYTHM, HEADBANG_MISSION, createHeadbang, headbangTap, headbangAdvance, gradeOffset, headbangMultiplier, headbangMaxScore, rhythmSection, rhythmMedals, RHYTHM_MEDAL_SHARE,
  BOLGEN_MISSION, BOLGEN_RHYTHM, BOLGEN_SONG, BOLGEN_DOOR, seededRandom,
  FOOSBALL, FOOSBALL_RODS, PLAYER_RODS, createFoosball, foosballStep, foosballKick, foosballScore, autoRod, rodRange, manY,
  GONDOLA, GONDOLA_PIECES, rotateCells, pieceCells, canPlace, createGondola, gondolaSpawn, gondolaMove, gondolaRotate, gondolaDrop, gondolaStep, gondolaDepart, gondolaCabinScore, gondolaScore, gondolaPersons,
  RHB_DRIVE, rhbSpeedSections, rhbLimitAt, rhbRunTime, rhbTimetable, rhbStopScore, createRhbDrive, rhbDriveStep, rhbDriveScore
} from '../js/missions-data-fun.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor, recordCompletion, emptyProgress } from '../js/missions-progress.js';
import { BERGBAHNEN } from '../js/bergbahnen-data.js';
import { lonLatToWorld } from '../js/davos-frame.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

// (js/missions-data-fun.js is three.js-free: the games' logic runs on synthetic frames here)

const frame = (over = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: 0.1, t: 0, ...over });

test('the fun missions are registered, scored by points, their medals ascending', () => {
  for (const m of FUN_MISSIONS) {
    assert.equal(getMission(m.id), m, `${m.id} is in MISSIONS`);
    assert.ok(MISSIONS.includes(m));
    assert.ok(m.scoreMode);
    assert.ok(m.medals.gold > m.medals.silver && m.medals.silver > m.medals.bronze && m.medals.bronze > 0, `${m.id}: gold > silver > bronze`);
    assert.equal(typeof m.score(m.createState()), 'number');
    for (const o of m.objectives) {
      const view = o.check(frame({ mode: m.mode }), m.createState());
      assert.equal(typeof view.done, 'boolean');
      assert.equal(typeof view.text, 'string');
    }
  }
  assert.deepEqual(FUN_MISSIONS.map((m) => m.id), ['headbang-box', 'foosball-la-onda', 'gondola-tetris', 'rhb-driver', 'apres-bolgenschanze']);
  // a score earns its medal (higher is better)
  const def = FUN_MISSIONS[2];
  assert.equal(medalFor(def.medals.gold, def.medals, true), 'gold');
  assert.equal(medalFor(def.medals.bronze - 1, def.medals, true), null);
  const { award } = recordCompletion(emptyProgress(), def, 90000, 0, def.medals.silver);
  assert.equal(award.medal, 'silver');
});

test('headbang: the chart runs at 140 BPM for about a minute, the walk to the door comes first', () => {
  assert.ok(Math.abs(BEAT_S - 60 / 140) < 1e-9);
  assert.ok(HEADBANG_LENGTH > 55 && HEADBANG_LENGTH < 65, `${HEADBANG_LENGTH} s`);
  for (let i = 1; i < HEADBANG_CHART.length; i++) assert.ok(HEADBANG_CHART[i].t > HEADBANG_CHART[i - 1].t);
  assert.equal(HEADBANG_CHART[0].t, HEADBANG.countIn * BEAT_S);
  const m = FUN_MISSIONS[0];
  const enter = m.objectives[0];
  assert.equal(enter.check(frame({ x: m.start.x, z: m.start.z }), m.createState()).done, false);
  assert.equal(enter.check(frame({ x: m.interior.door.x, z: m.interior.door.z }), m.createState()).done, true);
});

test('headbang: taps are graded perfect / good / off, missed notes break the streak', () => {
  assert.equal(gradeOffset(0.03), 'perfect');
  assert.equal(gradeOffset(-0.05), 'perfect');
  assert.equal(gradeOffset(0.09), 'good');
  assert.equal(gradeOffset(-0.13), null);
  const g = createHeadbang();
  const n = HEADBANG_CHART;
  assert.equal(headbangTap(g, n[0].t + 0.02).grade, 'perfect');
  assert.equal(headbangTap(g, n[1].t - 0.1).grade, 'good');
  assert.equal(g.score, HEADBANG.points.perfect + HEADBANG.points.good);
  assert.equal(g.combo, 2);
  // a bang between two beats: off, the streak gone, nothing lost
  const between = (n[2].t + n[3].t) / 2;
  assert.equal(headbangTap(g, between).grade, 'off');
  assert.equal(g.combo, 0);
  assert.equal(g.score, HEADBANG.points.perfect + HEADBANG.points.good);
  // a note can only be hit once
  assert.equal(headbangTap(g, n[0].t).grade, 'off');
  // time running past the next notes: missed
  headbangAdvance(g, n[5].t + 0.2);
  assert.equal(g.miss, 4); // notes 2-5
  assert.equal(g.judged[2], 3);
  // the end of the song ends the contest
  headbangAdvance(g, HEADBANG_LENGTH + 0.1);
  assert.ok(g.done);
  assert.equal(g.perfect + g.good + g.miss, HEADBANG_CHART.length);
});

test('headbang: the streak multiplies up to ×5, a perfect run makes the maximum and gold', () => {
  assert.deepEqual([0, 5, 6, 12, 18, 24, 99].map(headbangMultiplier), [1, 1, 2, 3, 4, 5, 5]);
  const g = createHeadbang();
  for (const note of HEADBANG_CHART) { headbangAdvance(g, note.t - 0.01); headbangTap(g, note.t + 0.01); }
  headbangAdvance(g, HEADBANG_LENGTH + 1);
  assert.equal(g.score, HEADBANG_MAX);
  assert.equal(g.score, headbangMaxScore());
  assert.equal(g.maxCombo, HEADBANG_CHART.length);
  const m = FUN_MISSIONS[0];
  assert.equal(medalFor(m.score({ game: g }), m.medals, true), 'gold');
  // every other beat: no gold
  const h = createHeadbang();
  HEADBANG_CHART.forEach((note, i) => { if (i % 2 === 0) { headbangAdvance(h, note.t); headbangTap(h, note.t); } });
  headbangAdvance(h, HEADBANG_LENGTH + 1);
  assert.notEqual(medalFor(h.score, m.medals, true), 'gold');
});

test('headbang: the same players score at least double what the old rules gave, and earn a better medal', () => {
  // The old rules: 100 / 50 points, ×4 every 8 hits, gold 29000, silver 18500, bronze 9000
  const oldScore = (hits) => {
    let s = 0, combo = 0;
    for (const grade of hits) {
      if (!grade) { combo = 0; continue; }
      s += (grade === 'perfect' ? 100 : 50) * Math.min(4, 1 + Math.floor(combo / 8));
      combo++;
    }
    return s;
  };
  const oldMedals = { gold: 29000, silver: 18500, bronze: 9000 };
  const play = (hitRate, spread, seed) => {
    const rnd = seededRandom(seed), g = createHeadbang(), hits = [];
    for (const note of HEADBANG_CHART) {
      headbangAdvance(g, note.t - 0.13);
      if (rnd() > hitRate) { hits.push(null); continue; }
      const off = (rnd() + rnd() + rnd() + rnd() + rnd() + rnd() - 3) * Math.SQRT2 * spread;
      const r = headbangTap(g, note.t + off);
      hits.push(r.grade === 'perfect' || r.grade === 'good' ? r.grade : null);
    }
    headbangAdvance(g, HEADBANG_LENGTH + 1);
    return { score: g.score, old: oldScore(hits) };
  };
  const median = (list) => list.sort((a, b) => a - b)[list.length >> 1];
  const m = HEADBANG_MISSION;
  const runs = (rate, spread) => Array.from({ length: 101 }, (_, i) => play(rate, spread, i + 1));
  const decent = runs(0.9, 0.06), good = runs(0.96, 0.045), casual = runs(0.75, 0.08);
  const scoreOf = (list) => median(list.map((r) => r.score)), oldOf = (list) => median(list.map((r) => r.old));
  assert.ok(scoreOf(decent) >= 2 * oldOf(decent), `decent: ${scoreOf(decent)} against ${oldOf(decent)}`);
  // the medal goes up with the points: bronze, silver, gold for those who earned nothing, bronze, silver before
  assert.equal(medalFor(oldOf(casual), oldMedals, true), null);
  assert.equal(medalFor(scoreOf(casual), m.medals, true), 'bronze');
  assert.equal(medalFor(oldOf(decent), oldMedals, true), 'bronze');
  assert.equal(medalFor(scoreOf(decent), m.medals, true), 'silver');
  assert.equal(medalFor(oldOf(good), oldMedals, true), 'silver');
  assert.equal(medalFor(scoreOf(good), m.medals, true), 'gold');
});

test('rhythm games: every song has its medals by the shares of its maximum, ascending', () => {
  for (const r of [HEADBANG_RHYTHM, BOLGEN_RHYTHM]) {
    const medals = rhythmMedals(r.max);
    assert.ok(medals.gold > medals.silver && medals.silver > medals.bronze && medals.bronze > 0);
    for (const k of ['gold', 'silver', 'bronze']) assert.ok(Math.abs(medals[k] - r.max * RHYTHM_MEDAL_SHARE[k]) <= 250, k);
    assert.ok(medals.gold <= r.max, 'a perfect run reaches gold');
  }
  assert.deepEqual(HEADBANG_MISSION.medals, rhythmMedals(HEADBANG_MAX));
  assert.deepEqual(BOLGEN_MISSION.medals, rhythmMedals(BOLGEN_RHYTHM.max));
});

test('Bolgenschanze: a mission of its own at the nightclub, a different song, the same game', () => {
  const m = BOLGEN_MISSION;
  assert.equal(getMission('apres-bolgenschanze'), m);
  assert.deepEqual(m.features, HEADBANG_MISSION.features);
  assert.notEqual(m.venue, HEADBANG_MISSION.venue);
  assert.equal(m.icon, 'discoball');
  assert.ok(m.scoreMode);
  // the door by the OSM node (n321757376), on the building's wall, the start on the street before it
  const osm = lonLatToWorld(9.8248179, 46.7933207);
  assert.ok(Math.hypot(BOLGEN_DOOR.x - osm.x, BOLGEN_DOOR.z - osm.z) < 12, 'by the node');
  const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > z) !== (r[j + 1] > z) && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; };
  for (const p of [BOLGEN_DOOR, m.start]) assert.ok(!DAVOS_DATA.buildings.some((b) => inRing(p.x, p.z, b.ring)), `(${p.x}, ${p.z}) lies outside the buildings`);
  assert.ok(Math.hypot(m.start.x - BOLGEN_DOOR.x, m.start.z - BOLGEN_DOOR.z) > BOLGEN_DOOR.r, 'the door is a walk from the start');
  const ahead = { x: Math.sin(m.start.heading), z: Math.cos(m.start.heading) };
  assert.ok(ahead.x * (BOLGEN_DOOR.x - m.start.x) + ahead.z * (BOLGEN_DOOR.z - m.start.z) > 4, 'the start faces the door');
  const enter = m.objectives[0];
  assert.equal(enter.check(frame({ x: m.start.x, z: m.start.z }), m.createState()).done, false);
  assert.equal(enter.check(frame({ x: BOLGEN_DOOR.x, z: BOLGEN_DOOR.z }), m.createState()).done, true);
  // another tempo and another chart, with off-beats, about a minute long too
  assert.equal(BOLGEN_RHYTHM.bpm, 126);
  assert.notEqual(BOLGEN_RHYTHM.bpm, HEADBANG_RHYTHM.bpm);
  assert.ok(BOLGEN_RHYTHM.length > 55 && BOLGEN_RHYTHM.length < 65, `${BOLGEN_RHYTHM.length} s`);
  assert.ok(BOLGEN_RHYTHM.chart.some((n) => n.beat % 1), 'off-beats to hit');
  for (let i = 1; i < BOLGEN_RHYTHM.chart.length; i++) assert.ok(BOLGEN_RHYTHM.chart[i].t - BOLGEN_RHYTHM.chart[i - 1].t >= BOLGEN_RHYTHM.beat / 2 - 1e-9);
  assert.equal(rhythmSection(BOLGEN_RHYTHM, 0), 'count');
  assert.equal(rhythmSection(BOLGEN_RHYTHM, BOLGEN_RHYTHM.countIn), BOLGEN_SONG[0].name);
  assert.equal(rhythmSection(BOLGEN_RHYTHM, BOLGEN_RHYTHM.countIn + 1000), 'end');
  // the whole song played right: the maximum and gold; the contest ends at this song's end, not the BOX's
  const g = createHeadbang(BOLGEN_RHYTHM);
  for (const note of BOLGEN_RHYTHM.chart) { headbangAdvance(g, note.t - 0.01); assert.equal(headbangTap(g, note.t + 0.01).grade, 'perfect'); }
  headbangAdvance(g, BOLGEN_RHYTHM.length - 0.05);
  assert.equal(g.done, false);
  headbangAdvance(g, BOLGEN_RHYTHM.length + 0.05);
  assert.equal(g.done, true);
  assert.equal(g.score, BOLGEN_RHYTHM.max);
  assert.equal(medalFor(m.score({ game: g }), m.medals, true), 'gold');
  const view = m.objectives[1].check(frame(), { game: g });
  assert.equal(view.done, true);
  assert.match(view.hint, /JUMP/);
});

test('table football: the rods, their ranges, the automatic rod', () => {
  assert.equal(FOOSBALL_RODS.length, 8);
  assert.deepEqual(PLAYER_RODS, [0, 1, 3, 5]);
  assert.equal(FOOSBALL_RODS.filter((r) => r.team === 'a').length, 4);
  for (const r of FOOSBALL_RODS) {
    const range = rodRange(r);
    assert.ok(range > 0);
    // the outer men stay inside the cushions
    for (const off of [-range, range]) for (let k = 0; k < r.men; k++) assert.ok(Math.abs(manY(r, off, k)) < FOOSBALL.width / 2);
  }
  const g = createFoosball(1);
  g.ball = { x: 0.1, y: 0, vx: 0, vy: 0, live: true };
  assert.equal(autoRod(g), 3); // the midfield, behind the ball
  g.ball.x = 0.4;
  assert.equal(autoRod(g), 5); // the attack
  g.ball.x = -0.55;
  assert.equal(autoRod(g), 0); // the goalie
});

test('table football: a ball through the mouth is a goal, a ball beside it bounces off the end', () => {
  const g = createFoosball(2);
  g.serveIn = 99;
  for (const r of g.rods) r.off = r.range; // (the men out of the way)
  g.rods.forEach((r) => { r.aiDelay = 99; r.aiTarget = r.range; });
  g.ball = { x: 0.3, y: 0, vx: 2.5, vy: 0, live: true };
  let goal = null;
  for (let i = 0; i < 120 && !goal; i++) goal = foosballStep(g, 1 / 120, {}).find((e) => e.type === 'goal');
  assert.ok(goal, 'scored');
  assert.equal(goal.team, 'p');
  assert.deepEqual(g.score, { p: 1, a: 0 });
  assert.equal(g.ball.live, false);
  // beside the goal: the end cushion sends it back
  const h = createFoosball(3);
  h.serveIn = 99;
  for (const r of h.rods) { r.off = -r.range; r.aiDelay = 99; r.aiTarget = -r.range; }
  h.ball = { x: -0.4, y: 0.25, vx: -2, vy: 0, live: true };
  for (let i = 0; i < 60; i++) foosballStep(h, 1 / 120, { rod: 1, target: h.rods[1].range });
  assert.deepEqual(h.score, { p: 0, a: 0 });
  assert.ok(h.ball.vx > 0, 'bounced back');
  // the long cushions keep it in
  const c = createFoosball(4);
  c.serveIn = 99;
  c.ball = { x: 0.01, y: 0.2, vx: 0, vy: 3, live: true };
  for (let i = 0; i < 40; i++) foosballStep(c, 1 / 120, {});
  assert.ok(Math.abs(c.ball.y) <= FOOSBALL.width / 2);
});

test('table football: a kick sends the ball towards the opponent\'s goal; five goals end the match', () => {
  const g = createFoosball(5);
  g.serveIn = 99;
  const rod = g.rods[5]; // the player's attack
  g.ball = { x: rod.x + 0.028, y: manY(rod, rod.off, 1), vx: 0, vy: 0, live: true };
  assert.ok(foosballKick(g, 5));
  assert.equal(foosballKick(g, 5), false, 'not again before the cooldown');
  const events = foosballStep(g, 1 / 120, { rod: 5 });
  assert.ok(events.some((e) => e.type === 'hit' && e.kick));
  assert.ok(g.ball.vx > FOOSBALL.kickSpeed * 0.6);
  // a match the player wins 5:1 in two minutes
  const m = createFoosball(6);
  m.score = { p: 4, a: 1 };
  m.t = 120;
  m.serveIn = 99;
  for (const r of m.rods) { r.off = r.range; r.aiDelay = 99; r.aiTarget = r.range; }
  m.ball = { x: 0.5, y: 0, vx: 3, vy: 0, live: true };
  for (let i = 0; i < 60 && !m.done; i++) foosballStep(m, 1 / 120, {});
  assert.ok(m.done);
  assert.equal(m.winner, 'p');
  assert.equal(foosballScore(m), 400 + 60);
  const def = FUN_MISSIONS[1];
  assert.equal(def.objectives[1].check(frame(), { game: m }).done, true);
  // a lost match fails the mission
  const lost = { ...m, winner: 'a', score: { p: 2, a: 5 } };
  assert.equal(foosballScore(lost), 0);
  assert.ok(def.objectives[1].check(frame(), { game: lost }).fail);
});

test('table football: the AI defends and scores against a player who does nothing', () => {
  const g = createFoosball(7);
  for (let i = 0; i < 120 * 300 && !g.done; i++) foosballStep(g, 1 / 120, {});
  assert.ok(g.done, 'the match ends');
  assert.equal(g.winner, 'a');
});

test('gondola: the Jakobshornbahn is a big cabin; pieces turn about themselves and stay in the grid', () => {
  const jak = BERGBAHNEN.ropeways.find((r) => r.name === 'Jakobshornbahn Sektion 1');
  assert.ok(jak.occupancy >= 60, 'a cabin for a crowd');
  // four quarter turns: the same shape again; a 1 × 3 skier turned is 3 × 1
  for (const [kind, def] of Object.entries(GONDOLA_PIECES)) {
    assert.deepEqual(rotateCells(def.cells, 4), rotateCells(def.cells, 0), kind);
    for (const r of [0, 1, 2, 3]) for (const [c, rr] of rotateCells(def.cells, r)) assert.ok(c >= 0 && rr >= 0);
    for (const i of def.people) assert.ok(i < def.cells.length);
  }
  assert.deepEqual(rotateCells(GONDOLA_PIECES.skier.cells, 1), [[0, 0], [1, 0], [2, 0]]);
  const g = createGondola(1);
  assert.ok(g.piece, 'a piece at the door');
  for (const [c, r] of pieceCells(g.piece)) assert.ok(c >= 0 && c < GONDOLA.cols && r < GONDOLA.rows);
  // walls: moving left stops at column 0
  let n = 0;
  while (gondolaMove(g, -1)) n++;
  assert.ok(n <= GONDOLA.cols);
  assert.equal(Math.min(...pieceCells(g.piece).map((p) => p[0])), 0);
  assert.equal(gondolaMove(g, -1), false);
  // a turn against the wall is nudged back in
  for (let k = 0; k < 4; k++) { gondolaRotate(g); for (const [c] of pieceCells(g.piece)) assert.ok(c >= 0 && c < GONDOLA.cols); }
});

test('gondola: dropped pieces rest at the front wall or on others, occupied cells are not free', () => {
  const g = createGondola(2);
  g.next = 'skier';
  g.piece = null;
  gondolaSpawn(g);
  assert.equal(g.piece.kind, 'skier');
  const id = g.piece.id;
  gondolaDrop(g);
  const placed = g.placed.find((p) => p.id === id);
  assert.equal(Math.min(...placed.cells.map((p) => p[1])), 0, 'slid to the front wall');
  for (const [c, r] of placed.cells) {
    assert.equal(g.grid[r * GONDOLA.cols + c], id);
    assert.equal(canPlace(g, [[c, r]]), false);
  }
  // the next one on the same column stops on top of the skier
  const col = placed.cells[0][0];
  g.piece = { id: 99, kind: 'single', rot: 0, c: col, r: GONDOLA.rows - 1 };
  gondolaDrop(g);
  assert.ok(g.placed.some((p) => p.id === 99 && p.cells[0][1] === 3));
  assert.equal(canPlace(g, [[0, -1]]), false);
  assert.equal(canPlace(g, [[GONDOLA.cols, 0]]), false);
});

test('gondola: the cabin load scores persons, full rows and holes; a full door sends it', () => {
  const { cols, rows } = GONDOLA;
  const grid = new Int16Array(cols * rows);
  // two full rows of couples (8 couples = 16 persons), one hole under a single in row 3
  const placed = [];
  let id = 1;
  for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c += 2) { grid[r * cols + c] = grid[r * cols + c + 1] = id; placed.push({ id: id++, kind: 'pair' }); }
  grid[3 * cols + 0] = id; placed.push({ id: id++, kind: 'single' });
  const sc = gondolaCabinScore(grid, placed);
  assert.equal(sc.persons, 17);
  assert.equal(sc.rows, 2);
  assert.equal(sc.holes, 1);
  assert.ok(Math.abs(sc.fill - 17 / 48) < 1e-9);
  const P = GONDOLA.points;
  assert.equal(sc.points, Math.round(17 * P.person + 2 * P.row - P.hole - (0.5 - 17 / 48) * P.half));
  // a full cabin scores more than the half-empty one
  const full = new Int16Array(cols * rows).fill(1);
  const fullPlaced = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, kind: 'pair' }));
  assert.ok(gondolaCabinScore(full, fullPlaced).points > sc.points + P.fill90);
  assert.equal(gondolaCabinScore(new Int16Array(cols * rows), []).points, -P.empty);
  // fill it until the next piece no longer fits at the door: the cabin leaves by itself
  const g = createGondola(3);
  let guard = 0;
  while (!g.departing && guard++ < 200) gondolaDrop(g);
  assert.ok(g.departing > 0);
  assert.equal(g.cabins.length, 1);
  assert.equal(g.cabins[0].reason, 'full');
  assert.equal(g.piece, null);
  // the next cabin comes in empty
  gondolaStep(g, GONDOLA.depart + 0.01);
  assert.equal(g.cabin, 2);
  assert.ok(g.grid.every((v) => v === 0));
  assert.ok(g.piece);
  assert.equal(gondolaPersons(g), g.cabins[0].persons);
});

test('gondola: pieces slide towards the front by themselves; the clock ends the shift with the last cabin', () => {
  const g = createGondola(4);
  const r0 = g.piece.r;
  gondolaStep(g, GONDOLA.tick + 0.01);
  assert.equal(g.piece.r, r0 - 1);
  gondolaDrop(g);
  assert.equal(gondolaDepart(g, 'sent').reason, 'sent');
  assert.equal(gondolaDepart(g), null, 'not twice');
  gondolaStep(g, GONDOLA.depart + 0.01);
  gondolaDrop(g);
  gondolaStep(g, GONDOLA.seconds);
  assert.ok(g.done);
  assert.equal(g.cabins.length, 2);
  assert.equal(g.cabins[1].reason, 'time');
  const m = FUN_MISSIONS[2];
  assert.equal(m.id, 'gondola-tetris');
  assert.equal(m.score({ game: g }), gondolaScore(g));
  assert.equal(m.objectives[1].check(frame(), { game: g }).done, false, 'the last cabin is still leaving');
  gondolaStep(g, 0); // (done: no more steps)
  g.departing = 0;
  assert.equal(m.objectives[1].check(frame(), { game: g }).done, true);
});

const STOPS = [{ name: 'Davos Wolfgang', s: 872 }, { name: 'Davos Dorf', s: 4507 }, { name: 'Davos Kongress/Eisstadion', s: 5884 }, { name: 'Davos Platz', s: 7169 }];

test('RhB: the speed limits by section, the timetable from distance and speed', () => {
  const sec = rhbSpeedSections(STOPS);
  assert.equal(rhbLimitAt(sec, 872), 40, 'Wolfgang station');
  assert.equal(rhbLimitAt(sec, 1500), 60, 'open line');
  assert.equal(rhbLimitAt(sec, 2500), 45, 'the bends by the lake');
  assert.equal(rhbLimitAt(sec, 4507), 40, 'Davos Dorf');
  assert.equal(rhbLimitAt(sec, 5300), 50, 'through the town');
  assert.equal(rhbLimitAt(sec, 5884), 40, 'the halt');
  // the fastest run: more than the distance at the limit allows, less than half that speed
  const run = rhbRunTime(sec, 872, 4507);
  assert.ok(run > 3635 / (60 / 3.6) && run < 3635 / (30 / 3.6), `${run} s`);
  const tt = rhbTimetable(STOPS, sec);
  assert.deepEqual(tt.map((s) => s.name), ['Davos Dorf', 'Davos Kongress/Eisstadion', 'Davos Platz']);
  for (const s of tt) assert.equal(s.arrive % 5, 0);
  assert.ok(tt[0].arrive > run, 'a margin over the fastest run');
  assert.ok(tt[1].arrive > tt[0].depart && tt[0].depart - tt[0].arrive >= RHB_DRIVE.dwell);
  assert.equal(tt[2].depart, null);
});

test('RhB: a stop scores punctuality, the stop board and the doors', () => {
  assert.deepEqual(rhbStopScore({ delay: 5, error: 0.5, dwell: 25 }), { punctual: 100, precise: 100, doors: 50, total: 250 });
  const late = rhbStopScore({ delay: 50, error: 6, dwell: 10 });
  assert.equal(late.punctual, 20);
  assert.equal(late.precise, 60);
  assert.equal(late.doors, 25);
  assert.equal(rhbStopScore({ delay: -200, error: 30, dwell: 0 }).total, 0);
});

/** Drives the timetable: runs at `speed` to each stop, halts `error` m off the board, `late` s off the due time, opens
 *  the doors for `dwell` s */
function drive(d, { error = 0, late = 0, dwell = 25, speed = 10 }) {
  let t = 0, s = STOPS[0].s;
  const step = (sp, dt) => rhbDriveStep(d, { t, s, speed: sp, dt });
  for (let i = 0; i < d.timetable.length; i++) {
    const stop = d.timetable[i];
    const target = stop.s + error;
    // run in, arriving `late` s off the due time
    t = stop.arrive + late - 1;
    s = target - 5;
    step(speed, 0.1);
    s = target; t += 1;
    step(0, 0.1);
    for (let k = 0; k < dwell * 2; k++) { t += 0.5; step(0, 0.5); }
    t += 0.5; s += 0.5; step(1, 0.5); // depart
  }
  return d;
}

test('RhB: a clean run makes gold; late, sloppy or speeding runs less', () => {
  const clean = drive(createRhbDrive(STOPS), {});
  assert.ok(clean.done);
  assert.equal(clean.results.length, 3);
  assert.equal(rhbDriveScore(clean), 750);
  const def = FUN_MISSIONS[3];
  assert.equal(medalFor(def.score({ drive: clean }), def.medals, true), 'gold');
  for (const o of def.objectives) assert.equal(o.check(frame({ mode: 'rhb' }), { drive: clean }).done, true);
  const sloppy = drive(createRhbDrive(STOPS), { error: 8, late: 40, dwell: 12 });
  assert.ok(rhbDriveScore(sloppy) < def.medals.silver && rhbDriveScore(sloppy) > 0);
  // over the limit: points off by the second
  const d = createRhbDrive(STOPS);
  rhbDriveStep(d, { t: 10, s: 1500, speed: 70 / 3.6, dt: 10 }); // 60 km/h section
  assert.ok(d.overspeed === 10 && d.overspeedPenalty > 0);
  const e = createRhbDrive(STOPS);
  rhbDriveStep(e, { t: 10, s: 1500, speed: 62 / 3.6, dt: 10 }); // within the tolerance
  assert.equal(e.overspeed, 0);
});

test('RhB: running through a station misses it; the halt counts only within the window', () => {
  const d = createRhbDrive(STOPS);
  rhbDriveStep(d, { t: 100, s: STOPS[1].s - 40, speed: 0, dt: 0.1 }); // stopped short: not a halt yet
  assert.equal(d.phase, 'run');
  rhbDriveStep(d, { t: 300, s: STOPS[1].s + RHB_DRIVE.window + 1, speed: 10, dt: 0.1 });
  assert.equal(d.results[0].missed, true);
  assert.equal(d.index, 1);
  assert.equal(d.results[0].total, 0);
  // the last stop: done once the train has stood a few seconds
  const e = createRhbDrive(STOPS);
  e.index = 2;
  rhbDriveStep(e, { t: 660, s: STOPS[3].s + 0.4, speed: 0, dt: 0.1 });
  assert.equal(e.phase, 'halt');
  for (let i = 0; i < 40; i++) rhbDriveStep(e, { t: 660 + i * 0.1, s: STOPS[3].s + 0.4, speed: 0, dt: 0.1 });
  assert.ok(e.done);
  assert.equal(e.results[0].doors, 50);
});
