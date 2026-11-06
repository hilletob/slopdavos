import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  SNAPSHOT_HZ, COUNTDOWN_MS, CODE_ALPHABET, CODE_LENGTH, makeCode, cleanCode, codeFits, packSnapshot, unpackSnapshot, SNAPSHOT_FIELDS, lerpAngle,
  createInterpolator, electHost, offsetFromPings, releaseTime, standings, countdownText, guestId, displayName
} from '../js/race-protocol.js';
import { QUAD_MISSION, QUAD_GATE_LIST, quadNextGate } from '../js/missions-data-rural.js';

// (js/race-protocol.js is the pure part of a race between players; the wire and the session are checked on their source)

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('a room code is four unambiguous characters, cleaned from what was typed', () => {
  assert.equal(CODE_LENGTH, 4);
  assert.doesNotMatch(CODE_ALPHABET, /[01IO]/, 'no look-alikes');
  let k = 0;
  const code = makeCode(() => (k++ % 7) / 7);
  assert.equal(code.length, 4);
  assert.ok(codeFits(code), code);
  assert.ok(codeFits(makeCode(() => 0.9999)), 'the last character of the alphabet');
  assert.equal(cleanCode(' ab-cd '), 'ABCD');
  assert.equal(cleanCode('abcdef'), 'ABCD');
  assert.equal(codeFits(cleanCode('a1b')), false, 'look-alikes fall out, the code is short');
  assert.equal(codeFits('ABC'), false);
  assert.equal(codeFits('abcd'), false, 'upper case only (cleanCode does that)');
});

test('a snapshot packs to rounded numbers and unpacks to the same fields; junk is refused', () => {
  const s = { x: 943.2345, z: -1669.4111, hop: 0.123456, heading: 1.23456789, tilt: -0.05, roll: 0.01, speed: 12.345, steer: 0.1234, gate: 3.7 };
  const a = packSnapshot(s);
  assert.equal(a.length, SNAPSHOT_FIELDS.length);
  assert.deepEqual(a, [943.23, -1669.41, 0.12, 1.235, -0.05, 0.01, 12.35, 0.123, 3]);
  const back = unpackSnapshot(a);
  assert.deepEqual(Object.keys(back), SNAPSHOT_FIELDS);
  assert.equal(back.gate, 3);
  assert.ok(JSON.stringify({ id: 'abc', s: a }).length < 120, 'a snapshot is small');
  assert.equal(unpackSnapshot(null), null);
  assert.equal(unpackSnapshot([1, 2, 3]), null);
  assert.equal(unpackSnapshot([1, 2, 3, 4, 5, 6, 7, 8, 'x']), null);
  assert.equal(unpackSnapshot([1, 2, 3, 4, 5, 6, 7, 8, NaN]), null);
  assert.ok(SNAPSHOT_HZ >= 5 && SNAPSHOT_HZ <= 15, 'a handful a second: under the free plan\'s messages a second with four players');
});

test('angles are interpolated the short way round', () => {
  assert.ok(Math.abs(lerpAngle(0.1, -0.1, 0.5)) < 1e-12);
  const half = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
  assert.ok(Math.abs(Math.abs(half) - Math.PI) < 1e-9, `across ±π: ${half}`);
  assert.ok(Math.abs(lerpAngle(0, 1, 0.25) - 0.25) < 1e-12);
});

test('a ghost is played back a little behind, between two snapshots, and runs on briefly when they stop', () => {
  const ip = createInterpolator({ delay: 100, maxExtrapolate: 300 });
  assert.equal(ip.sample(0), null);
  const snap = (x, heading = 0, speed = 10) => ({ x, z: 0, hop: 0, heading, tilt: 0, roll: 0, speed, steer: 0, gate: 1 });
  ip.push(snap(0), 1000);
  ip.push(snap(10), 1125); // (8 Hz: 125 ms apart, 10 m/s)
  ip.push(snap(20), 1250);
  // before the first (delay not yet passed): the first
  assert.equal(ip.sample(1050).x, 0);
  // 1162.5 - 100 = 1062.5: half way between the first two
  const mid = ip.sample(1162.5);
  assert.ok(Math.abs(mid.x - 5) < 1e-9, `${mid.x}`);
  assert.equal(mid.stale, false);
  assert.equal(mid.gate, 1);
  // past the newest: extrapolated along the heading (0: along +z) ... the x stays, z grows with the speed
  const on = ip.sample(1250 + 100 + 150);
  assert.equal(on.x, 20);
  assert.ok(Math.abs(on.z - 10 * 0.15) < 1e-9, `${on.z}`);
  assert.equal(on.stale, false);
  // and no further than maxExtrapolate
  const far = ip.sample(1250 + 100 + 2000);
  assert.ok(Math.abs(far.z - 10 * 0.3) < 1e-9, `${far.z}`);
  assert.equal(far.stale, true);
  // a snapshot arriving with the same tick keeps its order
  ip.push(snap(30), 1250);
  assert.equal(ip.latest.x, 30);
  assert.ok(ip.latest.at > 1250);
});

test('the host is whoever has been in the room longest; the offset is the median of the round trips', () => {
  assert.equal(electHost([]), null);
  assert.equal(electHost([{ id: 'b', joinedAt: 20 }, { id: 'a', joinedAt: 10 }, { id: 'c', joinedAt: 10 }]), 'a', 'the earliest, the id breaking a tie');
  assert.equal(electHost([{ id: 'b', joinedAt: 20 }, null, { joinedAt: 1 }]), 'b', 'junk members are skipped');
  // the host's clock 500 ms ahead; trips of 80, 120 and one slow 600 ms
  const pairs = [
    { sent: 1000, received: 1080, hostNow: 1540 },
    { sent: 2000, received: 2120, hostNow: 2560 },
    { sent: 3000, received: 3600, hostNow: 3900 } // (an odd one: 600 ahead, the median ignores it)
  ];
  assert.equal(offsetFromPings(pairs), 500);
  assert.equal(offsetFromPings([]), 0);
  assert.equal(offsetFromPings([{ sent: 5, received: 1, hostNow: 9 }]), 0, 'a trip that ends before it starts is no sample');
  assert.equal(releaseTime(10000, 500), 9500, 'the host\'s moment on this clock');
  assert.ok(COUNTDOWN_MS >= 3000);
});

test('the standings: finished by time, then racing by gate and the way to the next, then those out', () => {
  const gates = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 200, z: 0 }];
  const rows = standings([
    { id: 'slow', name: 'Slow', x: 90, z: 0, gate: 1, total: 200000, aborted: false },
    { id: 'near', name: 'Near', x: 90, z: 0, gate: 1, total: null, aborted: false },
    { id: 'far', name: 'Far', x: 10, z: 0, gate: 1, total: null, aborted: false },
    { id: 'ahead', name: 'Ahead', x: 150, z: 0, gate: 2, total: null, aborted: false },
    { id: 'fast', name: 'Fast', x: 200, z: 0, gate: 3, total: 150000, aborted: false },
    { id: 'out', name: 'Out', x: 0, z: 0, gate: 0, total: null, aborted: true }
  ], gates);
  assert.deepEqual(rows.map((r) => r.id), ['fast', 'slow', 'ahead', 'near', 'far', 'out']);
  assert.deepEqual(rows.map((r) => r.place), [1, 2, 3, 4, 5, 6]);
  assert.equal(rows[3].dist, 10);
  assert.equal(rows[4].dist, 90);
  assert.equal(rows[0].dist, 0, 'past the last gate: the finish itself');
  assert.deepEqual(standings([], gates), []);
  assert.equal(standings([{ id: 'a', gate: 0 }], []).length, 1, 'no gates: still a row');
});

test('the countdown reads 3, 2, 1, Go! and then nothing', () => {
  assert.equal(countdownText(10000, 3000), 'Get ready');
  assert.equal(countdownText(10000, 7001), '3');
  assert.equal(countdownText(10000, 8500), '2');
  assert.equal(countdownText(10000, 9999), '1');
  assert.equal(countdownText(10000, 10000), 'Go!');
  assert.equal(countdownText(10000, 10800), 'Go!');
  assert.equal(countdownText(10000, 10901), '');
  assert.equal(countdownText(null, 0), '');
});

test('a guest keeps one id for the tab; a name is 3 to 20 characters or made from the id', () => {
  const m = new Map();
  const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  const id = guestId(storage, () => 0.5);
  assert.match(id, /^g-[a-z0-9]{10}$/);
  assert.equal(guestId(storage), id, 'kept');
  assert.match(guestId(null), /^g-/, 'no storage: a fresh one');
  assert.equal(displayName('  Tobi  Zwei ', id), 'Tobi Zwei');
  assert.equal(displayName('ab', 'user-1234'), 'Player 1234');
  assert.equal(displayName('x'.repeat(30), id).length, 20);
  assert.equal(displayName(null, null), 'Player ?');
});

test('the quad mission is raceable: its gates in order, the next one from the state', () => {
  assert.equal(QUAD_MISSION.race.gates, QUAD_GATE_LIST);
  assert.equal(QUAD_MISSION.race.nextGate, quadNextGate);
  const state = QUAD_MISSION.createState();
  assert.equal(QUAD_MISSION.race.nextGate(state, 0), 0);
  state.gates.town = 2;
  assert.equal(QUAD_MISSION.race.nextGate(state, 0), 2);
  assert.ok(QUAD_GATE_LIST.at(-1).finish, 'the finish is the last gate');
});

test('the race modules load on demand only, and the run takes the race from the manager', () => {
  const html = read('index.html');
  for (const module of ['race-protocol', 'race-net', 'race-session', 'race-ghosts', 'race-ui']) assert.ok(!html.includes(`href="./js/${module}.js"`), `${module} is not preloaded`);
  const missions = read('js/missions.js');
  assert.doesNotMatch(missions, /^import .*race-/m, 'js/missions.js loads the lobby on demand');
  assert.match(missions, /import\('\.\/race-ui\.js'\)/);
  assert.match(missions, /race \? race\.released\(\) : this\.inputDetected\(cm, cs, ent\)/, 'the countdown arms the stopwatch in a race');
  assert.match(missions, /race\?\.frame\(this, ctx, dt, cm\)/, 'the session sees every frame');
  assert.match(missions, /this\.hooks\.race\?\.reportFinish\(this\)/);
  assert.match(missions, /this\.hooks\.race\?\.detach\(this\)/);
  assert.match(missions, /restart\(\) \{ if \(this\.hooks\.race\) return;/, 'no restart of one\'s own in a race');
  assert.match(missions, /export function dialogHead/);
  assert.match(read('js/missions-manager.js'), /createRun\(def, \{ night: nightRun, race \}\)/);
  assert.match(read('js/race-net.js'), /supabase\.channel\(`race:\$\{code\}`/);
  assert.doesNotMatch(read('js/race-net.js'), /from ['"]https?:/, 'the SDK comes from js/account.js');
  assert.doesNotMatch(read('js/main.js'), /race-/, 'nothing of the race in the game\'s start');
});

test('the lobby and the standings speak German too', () => {
  const i18n = read('js/i18n.js');
  for (const text of ['Race together', 'Multiplayer', 'Start the race', 'Leave the race', 'Race again', 'Race standings', 'Still racing', 'Out', 'Get ready', 'Go!',
    'Waiting for the host to start the race.', 'Ready: the countdown starts the clock', 'The host starts the next race.']) {
    assert.ok(i18n.includes(`['${text}',`), text);
  }
  const ui = read('js/race-ui.js'), session = read('js/race-session.js');
  assert.match(ui, /'race-name player-name'/, 'names are not translated');
  assert.match(session, /'race-name player-name'/);
});
