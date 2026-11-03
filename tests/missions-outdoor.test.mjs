import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OUTDOOR_MISSIONS, SEILPARK_MISSION, POND_MISSION,
  ROPE, ROPE_KINDS, ROPE_LADDER, ROPE_LEGS, ROPE_STATIONS, createRopeGame, stepRope, ropeClean, ropePose, stepBalance,
  POND, POND_RING, POND_POSTS, createPondGame, startPondGame, stepPond, containPond, inPond, pondBankPoints, pondScore
} from '../js/missions-data-outdoor.js';
import { SKATE_PARAMS, createSkater, stepSkater } from '../js/missions-data-ice.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { TLM_TREES } from '../js/tlm-trees-data.js';
import { lonLatToWorld } from '../js/davos-frame.js';
import { groundHeight } from '../js/terrain.js';
import { medalFor, missionMedals, missionPin } from '../js/missions-progress.js';

// (js/missions-data-outdoor.js is three.js-free: both games run on synthetic frames here)
const DT = 1 / 30;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const inRing = (ring, x, z) => {
  let c = false;
  for (let i = 0, n = ring.length / 2, j = n - 1; i < n; j = i++) {
    const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c;
  }
  return c;
};
const inAnyBuilding = (x, z) => DAVOS_DATA.buildings.find((b) => inRing(b.ring, x, z)) || null;
const segDist = (px, pz, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / L2));
  return Math.hypot(a.x + dx * t - px, a.z + dz * t - pz);
};
/** The straight walk a → b stays out of every building */
function assertClearWalk(a, b, label) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
  for (let i = 0; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n;
    const hit = inAnyBuilding(x, z);
    assert.equal(hit, null, `${label}: (${x.toFixed(1)}, ${z.toFixed(1)}) inside ${hit?.id}`);
  }
}

test('both outdoor missions are registered, with pins apart from every other mission', () => {
  assert.deepEqual(OUTDOOR_MISSIONS.map((m) => m.id), ['seilpark-faerich', 'seehofseeli-hockey']);
  for (const m of OUTDOOR_MISSIONS) {
    assert.equal(getMission(m.id), m);
    assert.ok(m.intro.length > 100);
    const l = missionMedals(m);
    assert.ok(l.gold && l.silver && l.bronze);
    const pin = missionPin(m);
    for (const o of MISSIONS) if (o !== m) { const q = missionPin(o); if (Number.isFinite(q.x)) assert.ok(Math.hypot(pin.x - q.x, pin.z - q.z) > 30, `${m.id} vs ${o.id}`); }
  }
  assert.equal(SEILPARK_MISSION.season, 'summer');
  assert.equal(POND_MISSION.season, 'winter');
  assert.equal(POND_MISSION.time, 'twilight');
  assert.ok(POND_MISSION.scoreMode);
  assert.ok(!SEILPARK_MISSION.scoreMode, 'the rope park goes by the time, penalties included');
});

test('starts, pins and first legs lie outside every building, the start facing its target', () => {
  const rope = SEILPARK_MISSION.start, pond = POND_MISSION.start;
  assert.equal(inAnyBuilding(rope.x, rope.z), null);
  assert.equal(inAnyBuilding(pond.x, pond.z), null);
  assert.equal(inAnyBuilding(POND.pin.x, POND.pin.z), null);
  assertClearWalk(rope, ROPE_LADDER, 'to the ladder');
  assertClearWalk(pond, POND.spot, 'to the centre spot');
  assert.ok(Math.abs(wrap(rope.heading - Math.atan2(ROPE_LADDER.x - rope.x, ROPE_LADDER.z - rope.z))) < 1e-6);
  assert.ok(Math.abs(wrap(pond.heading - Math.atan2(POND.spot.x - pond.x, POND.spot.z - pond.z))) < 1e-6);
  // (the pin's start circle reaches the pond's edge; the mission itself begins on the ice)
  assert.ok(Math.hypot(POND.pin.x - pond.x, POND.pin.z - pond.z) < 25);
  assert.ok(inPond(pond.x, pond.z));
});

test('the rope park stands where it is: inside the park on real trees, nothing in a building or a tree', () => {
  // OSM w1386979568, its first node, and the coordinate graubuenden.ch gives
  const park = [1898.5, -1734.8, 1892.6, -1682.5, 1952, -1677, 2007.6, -1688.7, 2022.5, -1735.1, 2006.4, -1750.7, 1964.4, -1754.7, 1916.5, -1755.5];
  const named = lonLatToWorld(9.85356, 46.810671);
  // (graubuenden.ch's point lies on the Flüelastrasse side, ~105 m west of the outline: the same place, not the same spot)
  assert.ok(Math.hypot(named.x - 1892.6, named.z + 1725) < 120, 'the published coordinate is by the OSM outline');
  for (const s of [...ROPE_STATIONS, ROPE.landing]) {
    assert.ok(inRing(park, s.x, s.z), `(${s.x}, ${s.z}) in the park`);
    assert.equal(inAnyBuilding(s.x, s.z), null);
  }
  for (const s of ROPE_STATIONS) {
    assert.ok(TLM_TREES.trees.some(([x, z]) => Math.hypot(x - s.x, z - s.z) < 1), `a TLM tree at (${s.x}, ${s.z})`);
  }
  // the crossings and the zipline run clear of the other single trees, and well over the ground
  ROPE_LEGS.forEach((leg, i) => {
    const b = i + 1 < ROPE_LEGS.length ? ROPE_LEGS[i + 1] : ROPE.landing;
    for (const [x, z] of TLM_TREES.trees) {
      if (Math.hypot(x - leg.x, z - leg.z) < 1.5 || Math.hypot(x - b.x, z - b.z) < 1.5) continue;
      if (Math.abs(x - leg.x) > 80) continue;
      const d = segDist(x, z, leg, b);
      assert.ok(d > 0.95, `${leg.kind} passes a tree (${x}, ${z}) at ${d.toFixed(2)} m`);
    }
    if (leg.kind !== 'zip') {
      assert.ok(leg.len > 8 && leg.len < 16, `${leg.kind}: ${leg.len}`);
      const y0 = groundHeight(leg.x, leg.z) + leg.h, y1 = groundHeight(b.x, b.z) + b.h;
      for (let f = 0; f <= 1; f += 0.1) {
        const g = groundHeight(leg.x + (b.x - leg.x) * f, leg.z + (b.z - leg.z) * f);
        assert.ok(y0 + (y1 - y0) * f - g > 3.5, `${leg.kind} ${f.toFixed(1)}: too low`);
      }
    }
  });
  const [zip] = ROPE_LEGS.slice(-1);
  assert.ok(zip.len > 25, 'a zipline worth the name');
});

/** A player on the course: reacts `latency` s late, and `opts` say what he forgets */
function playRope({ latency = 0.15, steer = true, clip = true, brake = true, seed = 2, maxS = 400 } = {}) {
  const g = createRopeGame(seed);
  let t = 0, x = ROPE.start.x, z = ROPE.start.z;
  const seen = [];
  while (g.stage !== 'done' && t < maxS) {
    t += DT;
    if (g.stage === 'ground') { const d = Math.hypot(ROPE_LADDER.x - x, ROPE_LADDER.z - z); x += ((ROPE_LADDER.x - x) / d) * 6 * DT; z += ((ROPE_LADDER.z - z) / d) * 6 * DT; }
    seen.push(g.sway + g.swayV * 0.35);
    const look = seen[Math.max(0, seen.length - 1 - Math.round(latency / DT))];
    const left = g.stage === 'zip' ? ROPE_LEGS[g.st].len - g.s : 99;
    stepRope(g, DT, {
      forward: 1, back: brake && left < ROPE.zip.brakeZone * 0.8 ? 1 : 0, steer: steer && Math.abs(look) > 0.06 ? -Math.sign(look) : 0,
      clip: clip && g.stage === 'deck' && g.clips < 2 && Math.round(t * 30) % 6 === 0, x, z
    });
    g.events.length = 0;
    if (!clip && g.forgot >= 3) break;
  }
  return { g, t, total: t * 1000 + g.penaltyMs };
}

test('rope park: a clean run earns gold, and walks through every step in order', () => {
  const { g, total } = playRope();
  assert.equal(g.stage, 'done');
  assert.ok(ropeClean(g));
  assert.equal(g.falls, 0);
  assert.equal(g.penaltyMs, 0);
  assert.equal(medalFor(total, missionMedals(SEILPARK_MISSION)), 'gold', `${total} ms`);
  assert.equal(g.cleared, SEILPARK_MISSION.objectives.length);
  SEILPARK_MISSION.objectives.forEach((o) => assert.ok(o.check({ x: ROPE.start.x, z: ROPE.start.z }, g).done, o.id));
});

test('rope park: without leaning against the sway you fall, dangle unharmed and cannot keep gold', () => {
  const { g, total } = playRope({ steer: false });
  assert.equal(g.stage, 'done', 'a fall never ends the run');
  assert.ok(g.falls >= 3, `${g.falls} falls`);
  assert.equal(g.penaltyMs, g.falls * ROPE.fallMs);
  assert.notEqual(medalFor(total, missionMedals(SEILPARK_MISSION)), 'gold');
});

test('rope park: a fall hangs you in the harness, then winches you back a little way', () => {
  const g = createRopeGame(1);
  Object.assign(g, { stage: 'cross', st: 1, s: 6, sway: 0.99, swayV: 2 });
  stepRope(g, DT, { forward: 1, steer: 0 });
  assert.equal(g.stage, 'dangle');
  assert.equal(g.falls, 1);
  assert.deepEqual(g.events.map((e) => e.kind), ['fall']);
  g.events.length = 0;
  const hung = g.s;
  for (let i = 0; i < Math.ceil(ROPE.dangleS / DT) + 1; i++) stepRope(g, DT, { forward: 1, steer: 0 });
  assert.equal(g.stage, 'cross');
  assert.ok(Math.abs(g.s - (hung - ROPE.backM)) < ROPE_KINDS.beam.speed * DT * 2);
  assert.equal(g.sway, 0);
  assert.ok(!ropeClean(g));
});

test('rope park: no step off a deck without both carabiners: a scolding, a penalty, back on the deck', () => {
  const { g } = playRope({ clip: false });
  assert.equal(g.stage, 'deck', 'still on the first deck');
  assert.equal(g.st, 0);
  assert.equal(g.forgot, 3);
  assert.equal(g.penaltyMs, 3 * ROPE.scoldMs);
  // one carabiner is not enough either
  const h = createRopeGame(1);
  Object.assign(h, { stage: 'deck', st: 0, q: 0.98, clips: 0 });
  stepRope(h, DT, { forward: 0, clip: true });
  assert.equal(h.clips, 1);
  for (let i = 0; i < 30; i++) stepRope(h, DT, { forward: 1 });
  assert.equal(h.forgot, 1);
  assert.equal(h.stage, 'deck');
  stepRope(h, DT, { forward: 0, clip: true });
  assert.equal(h.clips, 2);
  stepRope(h, DT, { forward: 0, clip: true });
  assert.equal(h.clips, 2, 'two is all there are');
  // arriving on the next deck unclips
  Object.assign(h, { stage: 'cross', q: 1, s: ROPE_LEGS[0].len - 0.01, sway: 0, swayV: 0 });
  stepRope(h, DT, { forward: 1, steer: 0 });
  assert.equal(h.stage, 'deck');
  assert.equal(h.st, 1);
  assert.equal(h.clips, 0);
});

test('rope park: a forgotten brake lands in the mattress with a penalty', () => {
  const soft = playRope().g, hard = playRope({ brake: false }).g;
  assert.equal(soft.crash, false);
  assert.equal(hard.crash, true);
  assert.equal(hard.penaltyMs, ROPE.crashMs);
});

test('rope park: the balance is recoverable and every crossing asks for it', () => {
  for (const [kind, K] of Object.entries(ROPE_KINDS)) {
    assert.ok(K.k < ROPE.control, `${kind}: A/D can always hold the lean`);
    const g = { sway: 0.2, swayV: 0, t: 0, phase: 0, grace: 0 };
    for (let i = 0; i < 300 && Math.abs(g.sway) < 1; i++) stepBalance(g, K, 1, 0, DT);
    assert.ok(Math.abs(g.sway) >= 1, `${kind}: nobody crosses it hands-free`);
  }
});

test('rope park: the pose climbs, walks the decks and follows the crossings', () => {
  const decks = ROPE_STATIONS.map((s) => 20 + s.h), g = createRopeGame(1);
  g.stage = 'climb'; g.h = 2;
  assert.equal(ropePose(g, decks, 20, 20).y, 22);
  Object.assign(g, { stage: 'deck', st: 1, q: 1 });
  let p = ropePose(g, decks, 20, 20);
  assert.ok(Math.hypot(p.x - ROPE_LEGS[1].out.x, p.z - ROPE_LEGS[1].out.z) < 1e-6);
  assert.equal(p.y, decks[1]);
  Object.assign(g, { stage: 'cross', st: 1, s: ROPE_LEGS[1].len });
  p = ropePose(g, decks, 20, 20);
  assert.ok(Math.abs(p.y - decks[2]) < 1e-6);
  assert.ok(Math.hypot(p.x - ROPE_LEGS[2].in.x, p.z - ROPE_LEGS[2].in.z) < 1e-6, 'the crossing ends where the next deck begins');
  Object.assign(g, { stage: 'zip', st: 4, s: ROPE_LEGS[4].len });
  p = ropePose(g, decks, 20, 20);
  assert.ok(Math.hypot(p.x - ROPE.landing.x, p.z - ROPE.landing.z) < 1e-6);
  assert.ok(Math.abs(p.y - 20.2) < 1e-6, 'the feet just over the mattress');
});

// --- The pond ---------------------------------------------------------------------------------------------------------
test('the pond is the real Seehof Seeli, the goals and the people where they can be', () => {
  const water = DAVOS_DATA.water.find((w) => w.name === 'Seehof Seeli');
  assert.ok(water);
  assert.deepEqual(POND_RING, water.ring);
  assert.ok(inRing(POND_RING, POND.centre.x, POND.centre.z));
  // OSM w37389726's first node
  const node = lonLatToWorld(9.839115, 46.8082199);
  assert.ok(Math.hypot(node.x - POND_RING[0], node.z - POND_RING[1]) < 1);
  for (const p of POND_POSTS) assert.ok(inPond(p.x, p.z), `post (${p.x}, ${p.z})`);
  assert.ok(POND.goalE - POND.goalW > 35, 'room to play');
  for (const p of [...pondBankPoints(2.8, 4), ...pondBankPoints(3, 6)]) {
    assert.ok(!inPond(p.x, p.z), `(${p.x}, ${p.z}) on the bank`);
    assert.equal(inAnyBuilding(p.x, p.z), null, `(${p.x}, ${p.z}) in a building`);
  }
});

test('containPond keeps a skater and a puck on the ice, from anywhere', () => {
  assert.equal(containPond({ x: POND.centre.x, z: POND.centre.z }), null);
  for (const [x, z] of [[680, -1420], [760, -1460], [727, -1380], [800, -1419], [707.2, -1437], [696.6, -1419]]) {
    const p = { x, z };
    assert.ok(containPond(p, 0.75));
    assert.ok(inPond(p.x, p.z), `(${x}, ${z}) → (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  }
});

/** The player as a plain chase-and-shoot bot on the real skater; `skill` 0 stands still */
function playPond(seed, skill = 1) {
  const g = createPondGame(seed);
  startPondGame(g);
  const sk = createSkater(Math.PI / 2);
  const me = { x: 725.5, z: POND.goalZ };
  let t = 0;
  let rnd = seed * 0.37 + 0.1;
  const random = () => (rnd = (rnd * 997.13 + 0.17) % 1);
  while (g.phase !== 'done' && t < 700) {
    t += DT;
    const pk = g.puck;
    let tx = pk.x, tz = pk.z, press = false;
    const toGoal = Math.atan2(POND.goalE - me.x, POND.goalZ - me.z);
    if (pk.holder === 0) {
      tx = POND.goalE; tz = POND.goalZ;
      if (Math.hypot(POND.goalE - me.x, POND.goalZ - me.z) < 11 && Math.abs(wrap(sk.heading - toGoal)) < 0.2 && random() < 0.2) press = true;
    } else if (pk.holder > 0 && g.players[pk.holder].team === 1) {
      const h = g.players[pk.holder];
      if (Math.hypot(h.x - me.x, h.z - me.z) < 1.8 && random() < 0.05) press = true;
    }
    const e = wrap(Math.atan2(tx - me.x, tz - me.z) - sk.heading);
    stepSkater(sk, { forward: g.phase === 'faceoff' ? 0 : skill, back: 0, steer: skill ? Math.max(-1, Math.min(1, e * 3)) : 0, push: false }, DT, SKATE_PARAMS.hockey);
    me.x += Math.sin(sk.heading) * sk.speed * DT;
    me.z += Math.cos(sk.heading) * sk.speed * DT;
    if (containPond(me, 0.8)) sk.speed *= 0.5;
    stepPond(g, DT, { x: me.x, z: me.z, heading: sk.heading, speed: sk.speed, aim: sk.heading, press: press && skill > 0 });
    for (const ev of g.events) if (ev.kind === 'faceoff') { me.x = ev.x; me.z = ev.z; sk.heading = ev.heading; sk.speed = 0; }
    g.events.length = 0;
    for (const p of g.players) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
    assert.ok(g.puck.holder >= 0 || inPond(g.puck.x, g.puck.z) || g.phase === 'goal', `the puck stays on the pond (${g.puck.x}, ${g.puck.z})`);
  }
  return g;
}

test('pond hockey: games end, by the first to five or the clock, and a chasing player can win them', () => {
  let wins = 0, losses = 0;
  for (let s = 1; s <= 10; s++) {
    const g = playPond(s);
    assert.equal(g.phase, 'done');
    assert.ok(g.us === POND.firstTo || g.them === POND.firstTo || g.clock >= POND.clockS, `${g.us}:${g.them} at ${g.clock}`);
    assert.ok(g.clock <= POND.capS + 1);
    assert.ok(g.us <= POND.firstTo && g.them <= POND.firstTo);
    if (g.us > g.them) wins++;
    if (g.us < g.them) losses++;
  }
  assert.ok(wins >= 4, `${wins} wins of 10`);
  assert.ok(losses >= 1, 'the locals can win too');
});

test('pond hockey: a player who only stands there loses', () => {
  for (const s of [1, 2, 3]) {
    const g = playPond(s, 0);
    assert.ok(g.them > g.us, `${g.us}:${g.them}`);
    assert.equal(pondScore(g), 0);
    assert.equal(medalFor(POND_MISSION.score({ game: g }), missionMedals(POND_MISSION), true), null);
  }
});

const started = (seed = 1) => { const g = createPondGame(seed); startPondGame(g); g.phase = 'play'; g.events.length = 0; return g; };
const standing = (g, extra = {}) => ({ x: g.players[0].x, z: g.players[0].z, heading: Math.PI / 2, speed: 0, aim: Math.PI / 2, press: false, ...extra });

test('pond hockey: a shot through the boots counts, one beside them does not, and the medal goes by the lead', () => {
  const g = started();
  for (const p of g.players) if (p.i) { p.x = 712; p.z = -1400; } // (out of the way)
  Object.assign(g.players[0], { x: 742, z: POND.goalZ });
  g.puck.holder = 0;
  stepPond(g, DT, standing(g, { x: 742, z: POND.goalZ, press: true }));
  assert.ok(g.events.some((e) => e.kind === 'shot'));
  for (let i = 0; i < 60 && g.phase === 'play'; i++) stepPond(g, DT, standing(g));
  assert.equal(g.phase, 'goal');
  assert.equal(g.us, 1);
  assert.equal(g.myGoals, 1);
  const wide = started();
  for (const p of wide.players) if (p.i) { p.x = 712; p.z = -1400; }
  Object.assign(wide.puck, { x: 742, z: POND.goalZ + 3, vx: 15, vz: 0, holder: -1, owner: 0, ownerT: 1 });
  for (let i = 0; i < 40; i++) stepPond(wide, DT, standing(wide));
  assert.equal(wide.us, 0, 'beside the jackets');
  const score = (us, them) => POND_MISSION.score({ game: { us, them } });
  assert.equal(medalFor(score(5, 2), missionMedals(POND_MISSION), true), 'gold');
  assert.equal(medalFor(score(5, 3), missionMedals(POND_MISSION), true), 'silver');
  assert.equal(medalFor(score(5, 4), missionMedals(POND_MISSION), true), 'bronze');
  assert.equal(medalFor(score(2, 5), missionMedals(POND_MISSION), true), null);
});

test('pond hockey: the clock ends a game with a lead, a tie goes to the next goal', () => {
  const lead = started();
  lead.us = 2; lead.clock = POND.clockS - DT / 2;
  stepPond(lead, DT, standing(lead));
  assert.equal(lead.phase, 'done');
  const tie = started();
  tie.clock = POND.clockS - DT / 2;
  stepPond(tie, DT, standing(tie));
  assert.equal(tie.phase, 'play');
  assert.ok(tie.sudden);
  tie.players.forEach((p) => { if (p.i) { p.x = 712; p.z = -1400; } });
  Object.assign(tie.puck, { x: 748.8, z: POND.goalZ, vx: 15, vz: 0, holder: -1, owner: 0, ownerT: 1 });
  stepPond(tie, DT, standing(tie));
  assert.equal(tie.us, 1);
  for (let i = 0; i < 90 && tie.phase === 'goal'; i++) stepPond(tie, DT, standing(tie));
  assert.equal(tie.phase, 'done');
});

test('pond hockey: Space asks a mate for the puck, pokes at the carrier, passes at a mate you look at', () => {
  const g = started();
  Object.assign(g.players[1], { x: 720, z: -1410 });
  g.puck.holder = 1;
  Object.assign(g.players[0], { x: 725, z: -1420 });
  stepPond(g, DT, standing(g, { press: true }));
  assert.equal(g.puck.passTo, 0, 'the mate passes');
  // the poke
  const h = started();
  Object.assign(h.players[4], { x: 725, z: -1419 });
  h.puck.holder = 4;
  h.players[4].immune = 0;
  Object.assign(h.players[0], { x: 724, z: -1419 });
  let took = false;
  for (let i = 0; i < 40 && !took; i++) {
    h.players[4].x = 725; h.players[4].z = -1419; h.puck.holder = 4;
    stepPond(h, DT, standing(h, { press: true }));
    took = h.events.some((e) => e.kind === 'steal' && e.human);
    h.events.length = 0;
    h.cooldown = 0;
  }
  assert.ok(took);
  // the pass: looking away from the goal at a mate
  const k = started();
  Object.assign(k.players[0], { x: 725, z: -1419 });
  Object.assign(k.players[1], { x: 716, z: -1419 });
  for (const i of [3, 4, 5]) Object.assign(k.players[i], { x: 745, z: -1400 });
  k.puck.holder = 0;
  stepPond(k, DT, standing(k, { heading: -Math.PI / 2, aim: -Math.PI / 2, press: true }));
  assert.equal(k.puck.holder === 0, false);
  assert.ok(k.events.some((e) => e.kind === 'pass'));
  assert.equal(k.shots, 0);
});

test('pond hockey: the objectives go from the centre spot to the final whistle', () => {
  const [spot, game] = POND_MISSION.objectives;
  const state = POND_MISSION.createState();
  assert.equal(spot.check({ x: POND.start.x, z: POND.start.z }, state).done, false);
  assert.equal(spot.check({ x: POND.spot.x, z: POND.spot.z }, state).done, true);
  assert.equal(game.check({}, state).done, false);
  state.game.phase = 'done';
  assert.equal(game.check({}, state).done, true);
  assert.equal(POND_MISSION.summary({ game: { us: 5, them: 2, myGoals: 3 } })[0], 'Won 5 : 2 · your goals: 3');
});
