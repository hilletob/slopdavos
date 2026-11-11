import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  JETPACK_MISSION, JETPACK_MISSIONS, JP, START, PAD, TERRACE, GATES, TOWN_GATES, H0, createJet, stepJet, botInput, gatePoint, coursePoints, courseLength, onTerrace, inAir
} from '../js/missions-data-jetpack.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { missionMedals, missionPin } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

// (js/missions-data-jetpack.js is three.js-free: the flight on its own, then the bot over the real terrain)

const flat = (y = 0) => () => y;
const hover = (y = 50, more = {}) => Object.assign(createJet({ x: 0, z: 0, heading: 0 }), { phase: 'air', y, ...more });
/** Flies the whole course with the bot: { f, t (s), log } */
async function flyCourse(opts = {}, limit = 600) {
  const { groundHeight } = await import('../js/terrain.js');
  const f = createJet(), log = [];
  let time = 0, legFuel = [];
  while (time < limit && !onTerrace(f) && f.phase !== 'crashed' && !f.dry) {
    stepJet(f, botInput(f, groundHeight, opts), 1 / 60, groundHeight);
    time += 1 / 60;
    for (const e of f.events.splice(0)) { log.push(e); if (e === 'landed' || e === 'tumble') legFuel.push(f.fuel); }
  }
  return { f, time, log, legFuel };
}

test('the jetpack demo is listed: in winter, on foot, timed, with its pin, icon, medals and preloads', () => {
  const m = JETPACK_MISSION;
  assert.equal(getMission('jetpack-schatzalp'), m);
  assert.ok(MISSIONS.includes(m));
  assert.deepEqual(JETPACK_MISSIONS.map((d) => d.id), ['jetpack-schatzalp']);
  assert.equal(m.mode, 'person'); assert.equal(m.season, 'winter'); assert.deepEqual(m.features, ['jetpack']);
  assert.ok(!m.scoreMode, 'judged by the time');
  const l = missionMedals(m);
  assert.ok(l.gold < l.silver && l.silver < l.bronze);
  assert.equal(m.objectives.length, 4);
  assert.equal(m.createState().penaltyMs, 0);
  assert.match(readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8'), /case 'jetpack'/);
  assert.match(readFileSync(new URL('../js/missions.js', import.meta.url), 'utf8'), /Object\.assign\(FEATURES, JETPACK_FEATURES\)/);
  const page = readFileSync(new URL('../play.html', import.meta.url), 'utf8');
  for (const file of ['missions-data-jetpack.js', 'missions-jetpack.js']) assert.ok(page.includes(`href="./js/${file}"`), file);
  const pins = MISSIONS.map((d) => ({ id: d.id, ...missionPin(d) }));
  const me = pins.find((p) => p.id === m.id);
  for (const p of pins) if (p.id !== m.id) assert.ok(Math.hypot(p.x - me.x, p.z - me.z) > 30, p.id);
});

test('the start, the pad and the terrace are level, open ground at the right heights; the gates hang clear of the roofs', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > z) !== (r[j + 1] > z) && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; };
  const house = (x, z) => DAVOS_DATA.buildings.find((b) => inRing(b.ring, x, z));
  const relief = (s, r) => { let lo = Infinity, hi = -Infinity; for (let a = 0; a < 6.3; a += 0.5) for (const k of [0, 0.5, 1]) { const h = groundHeight(s.x + Math.sin(a) * r * k, s.z + Math.cos(a) * r * k); lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo; };
  for (const [s, r, lo, hi] of [[START, 6, 1535, 1545], [PAD, PAD.r, 1550, 1562], [TERRACE, 5, 1860, 1866]]) {
    const h = groundHeight(s.x, s.z) + H0;
    assert.ok(h > lo && h < hi, `${s.name}: ${h} m`);
    assert.ok(relief(s, r) < 1.5, `${s.name}: relief ${relief(s, r)}`);
    for (let a = 0; a < 6.3; a += 0.4) assert.ok(!house(s.x + Math.sin(a) * r * 0.8, s.z + Math.cos(a) * r * 0.8), `${s.name}: a house on it`);
  }
  // the terrace: the hotel's front right behind it (OSM w425943705, its south wall at z = -577 … -580)
  assert.ok(house(TERRACE.x, TERRACE.z - 14), 'the Berghotel Schatzalp stands north of the terrace');
  assert.equal(GATES.length, 9); assert.equal(TOWN_GATES, 6);
  const p = {};
  for (const g of GATES) {
    gatePoint(g, groundHeight, p);
    assert.ok(g.agl - JP.gateR >= -2, g.id);
    // (no surveyed roof reaches into the ring: the tallest house within its radius stays under its centre)
    let roof = 0;
    for (const b of DAVOS_DATA.buildings) for (let i = 0; i < b.ring.length; i += 2) if (Math.hypot(b.ring[i] - g.x, b.ring[i + 1] - g.z) < JP.gateR + 4) roof = Math.max(roof, b.h + (b.roofHeight || 0));
    assert.ok(roof < g.agl + 2 || g.id === 'st-johann', `${g.id}: a roof of ${roof} m at a gate ${g.agl} m up`);
  }
  // the course: about 2.3 km over the ground, 320 m up to the Schatzalp
  assert.ok(courseLength() > 2000 && courseLength() < 2600, `${courseLength()}`);
  assert.deepEqual(coursePoints().map((q) => q.kind), ['start', ...Array(6).fill('gate'), 'pad', 'gate', 'gate', 'gate', 'terrace']);
  assert.ok(groundHeight(TERRACE.x, TERRACE.z) - groundHeight(START.x, START.z) > 300);
});

test('the pack hovers by itself, climbs with Space, sinks with Q and flares before the ground', () => {
  const f = hover(50);
  for (let i = 0; i < 180; i++) stepJet(f, {}, 1 / 60, flat(0));
  assert.ok(Math.abs(f.y - 50) < 0.05 && Math.abs(f.vy) < 0.01, 'a hover holds the height');
  assert.ok(f.fuel < 100 && f.fuel > 97, `a hover burns fuel: ${f.fuel}`);
  const up = hover(50);
  for (let i = 0; i < 180; i++) stepJet(up, { up: 1 }, 1 / 60, flat(0));
  assert.ok(Math.abs(up.vy - JP.climbV) < 0.1 && up.y > 70, `climb ${up.vy}`);
  assert.ok(100 - up.fuel > (100 - f.fuel) * 1.5, 'climbing costs more than hovering');
  const down = hover(80);
  for (let i = 0; i < 180; i++) stepJet(down, { down: 1 }, 1 / 60, flat(0));
  assert.ok(Math.abs(down.vy + JP.sinkV) < 0.1, `sink ${down.vy}`);
  // held all the way down: the computer's flare, a soft touch-down
  for (let i = 0; i < 1200 && down.phase === 'air'; i++) stepJet(down, { down: 1 }, 1 / 60, flat(0));
  assert.equal(down.phase, 'ground');
  assert.ok(down.landing.sink < 3 && !down.landing.tumble && !down.landing.crash, `touch-down at ${down.landing.sink} m/s`);
  // the ceiling
  const high = hover(JP.ceiling + 30);
  for (let i = 0; i < 240; i++) stepJet(high, { up: 1 }, 1 / 60, flat(0));
  assert.ok(Math.abs(high.vy) < 0.2, 'no climbing above the ceiling');
});

test('W leans and flies at 100 km/h at most, S brakes, the turn carries the flight round, letting go comes to a hover', () => {
  const f = hover(50);
  for (let i = 0; i < 900; i++) stepJet(f, { pitch: 1 }, 1 / 60, flat(0));
  assert.ok(f.speed > 26 && f.speed < 29, `top speed ${f.speed}`);
  assert.ok(f.lean > 0.4 && f.z > 200 && Math.abs(f.x) < 1, 'forward is +z at heading 0');
  for (let i = 0; i < 240; i++) stepJet(f, { pitch: -1 }, 1 / 60, flat(0));
  assert.ok(f.speed < 7, `braked to ${f.speed}`);
  const g = hover(50);
  for (let i = 0; i < 300; i++) stepJet(g, { pitch: 1 }, 1 / 60, flat(0));
  for (let i = 0; i < 90; i++) stepJet(g, { pitch: 1, turn: 1 }, 1 / 60, flat(0));
  assert.ok(g.heading > 1.4, 'A turns left: the heading grows');
  assert.ok(g.vx > 12, `the flight follows the nose: vx ${g.vx}`);
  for (let i = 0; i < 600; i++) stepJet(g, {}, 1 / 60, flat(0));
  assert.ok(g.speed < 2.5, `let go: ${g.speed} m/s`);
});

test('a dry tank falls: a crash from high up; a fast touch-down is a tumble, a wall costs time', () => {
  const dry = hover(120, { fuel: 0.2 });
  for (let i = 0; i < 1200 && dry.phase === 'air'; i++) stepJet(dry, {}, 1 / 60, flat(0));
  assert.equal(dry.phase, 'crashed');
  assert.ok(dry.events.includes('dry') && dry.events.includes('crash'));
  assert.match(JETPACK_MISSION.objectives[0].check({}, { flight: dry }).fail, /ran dry/);
  // dry on the ground away from the crew: the demo is over; on a pad the tank fills
  const walk = Object.assign(createJet({ x: 300, z: 300, heading: 0 }), { fuel: 0 });
  stepJet(walk, {}, 0.1, flat(0));
  assert.ok(walk.dry);
  assert.match(JETPACK_MISSION.objectives[1].check({}, { flight: walk }).fail, /pit crew/);
  const pad = Object.assign(createJet({ ...PAD, heading: 0 }), { fuel: 0, gate: TOWN_GATES });
  for (let i = 0; i < 60; i++) stepJet(pad, {}, 1 / 60, flat(0));
  assert.ok(!pad.dry && pad.refuelling && pad.fuel > 25);
  for (let i = 0; i < 180; i++) stepJet(pad, {}, 1 / 60, flat(0));
  assert.ok(pad.refuelled && pad.fuel === 100);
  // a tumble
  const fast = hover(1.5, { vz: 15 });
  for (let i = 0; i < 300 && fast.phase === 'air'; i++) stepJet(fast, { pitch: 1, down: 1 }, 1 / 60, flat(0));
  assert.equal(fast.phase, 'ground');
  assert.ok(fast.landing.tumble && fast.tumbles === 1 && fast.penaltyMs === JP.tumblePenaltyMs);
  // a wall at z = 30
  const wall = hover(20);
  for (let i = 0; i < 300; i++) stepJet(wall, { pitch: 1 }, 1 / 60, flat(0), (x, y, z) => z > 30);
  assert.ok(wall.z <= 30 && wall.bumps >= 1 && wall.penaltyMs >= JP.bumpPenaltyMs);
  // a roof below the pilot is ground to land on
  const roof = hover(30);
  for (let i = 0; i < 1200 && roof.phase === 'air'; i++) stepJet(roof, { down: 1 }, 1 / 60, (x, z, y) => (y >= 18 ? 20 : 0));
  assert.ok(roof.phase === 'ground' && roof.y === 20);
});

test('the gates count in their order only, and the climb\'s gates only with the full tank', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  const at = (i, more = {}) => { const p = gatePoint(GATES[i], groundHeight); return Object.assign(createJet({ x: p.x, z: p.z, heading: 0 }), { phase: 'air', y: p.y - 1, ...more }); };
  const second = at(1);
  stepJet(second, {}, 0.1, groundHeight);
  assert.equal(second.gate, 0, 'the second gate first: nothing');
  const first = at(0);
  stepJet(first, {}, 0.1, groundHeight);
  assert.equal(first.gate, 1);
  const early = at(TOWN_GATES, { gate: TOWN_GATES });
  stepJet(early, {}, 0.1, groundHeight);
  assert.equal(early.gate, TOWN_GATES, 'no climbing before the pit stop');
  const late = at(TOWN_GATES, { gate: TOWN_GATES, refuelled: true });
  stepJet(late, {}, 0.1, groundHeight);
  assert.equal(late.gate, TOWN_GATES + 1);
  // the steps of the mission follow the flight
  const [town, refuel, climb, land] = JETPACK_MISSION.objectives;
  assert.ok(!town.check({}, { flight: first }).done && town.check({}, { flight: early }).done);
  assert.ok(!refuel.check({}, { flight: early }).done && refuel.check({}, { flight: late }).done);
  assert.match(town.check({}, { flight: first }).text, /^Gate 2\/9: Kirchner Museum · \d+ m · (level|\d+ m (up|down))$/);
  const end = Object.assign(createJet({ ...TERRACE, heading: 0 }), { gate: GATES.length, refuelled: true, fuel: 0 });
  stepJet(end, {}, 0.1, groundHeight);
  assert.ok(climb.check({}, { flight: end }).done && land.check({}, { flight: end }).done);
  assert.equal(land.check({}, { flight: end }).fail, null, 'landed on the terrace on the last drop: no failure');
});

test('the bot flies the whole demo on the real terrain: every gate, the pit stop, the terrace; the medals leave room', async () => {
  const { f, time, log, legFuel } = await flyCourse();
  assert.ok(onTerrace(f) && !inAir(f), `ended ${f.phase} at gate ${f.gate} after ${time} s`);
  assert.equal(log.filter((e) => e === 'gate').length, GATES.length);
  assert.ok(log.includes('refuelled'));
  assert.equal(f.penaltyMs, 0, 'a clean flight');
  const medals = missionMedals(JETPACK_MISSION);
  assert.ok(time > 95 && time < 125, `the bot's time: ${time} s`);
  assert.ok(time * 1000 < medals.gold - 12000, 'gold is within reach of a tidy flight');
  // the tank: enough for a leg flown well, not for one flown twice as long
  assert.ok(legFuel[0] > 30 && legFuel[0] < 55, `tank at the pit stop: ${legFuel[0]}`);
  assert.ok(legFuel[1] > 40 && legFuel[1] < 65, `tank on the terrace: ${legFuel[1]}`);
  // a slower pilot still makes it, with bronze to spare
  const slow = await flyCourse({ cruise: 0.45 });
  assert.ok(onTerrace(slow.f), `the slow bot ended ${slow.f.phase} at gate ${slow.f.gate}, tank ${slow.f.fuel}`);
  assert.ok(slow.time * 1000 < medals.bronze, `the slow bot: ${slow.time} s`);
  assert.match(JETPACK_MISSION.summary({ flight: f })[0], /^\d:\d\d in the air · \d+ % of a tank burned · a clean flight: no penalties$/);
});
