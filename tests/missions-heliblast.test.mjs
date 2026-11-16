import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  HELIBLAST_MISSION, HELIBLAST_MISSIONS, HB, ZONES, START, PIN, compass, throwCharge, stepCharge, predictLanding, fallLine, inPath,
  createBlastState, dropRefusal, requestDrop, stepBlast, heliOf
} from '../js/missions-data-heliblast.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { missionMedals, missionPin } from '../js/missions-progress.js';

// (js/missions-data-heliblast.js is three.js-free: the charge on synthetic ground, then a bot over the real terrain)

const flat = (y = 0) => () => y;
/** A slope falling towards +z: 1 m down for every `k` m */
const slope = (k = 1) => (x, z) => -z / k;
const heli = (more = {}) => ({ x: 0, y: 30, z: 0, heading: 0, speed: 0, verticalSpeed: 0, agl: 30, ...more });

test('the helicopter blasting is listed: in winter, in the golden light, by the helicopter, with its pin, icon, medals and preloads', () => {
  const m = HELIBLAST_MISSION;
  assert.equal(getMission('lawinen-heli'), m);
  assert.ok(MISSIONS.includes(m));
  assert.deepEqual(HELIBLAST_MISSIONS.map((d) => d.id), ['lawinen-heli']);
  assert.equal(m.mode, 'helicopter'); assert.equal(m.season, 'winter'); assert.equal(m.time, 'golden');
  assert.deepEqual(m.features, ['heliBlast']);
  assert.equal(m.board, 'lawinen-heli-1');
  const l = missionMedals(m);
  assert.ok(l.gold < l.silver && l.silver < l.bronze);
  assert.equal(m.objectives.length, ZONES.length);
  assert.deepEqual(missionPin(m), PIN);
  assert.ok(m.start.onGround);
  assert.match(readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8'), /case 'dynamite'/);
  assert.match(readFileSync(new URL('../js/missions.js', import.meta.url), 'utf8'), /HELIBLAST_FEATURES/);
  const play = readFileSync(new URL('../play.html', import.meta.url), 'utf8');
  for (const f of ['missions-data-heliblast.js', 'missions-heliblast.js']) assert.ok(play.includes(`href="./js/${f}"`), f);
  // (the pin on the Spital's drive, clear of the Rega missions' start circles)
  for (const other of MISSIONS.filter((d) => d !== m && d.pin)) assert.ok(Math.hypot(other.pin.x - PIN.x, other.pin.z - PIN.z) > 16, other.id);
});

test('the compass names the eight directions (north is −z)', () => {
  assert.equal(compass(0, -10), 'N'); assert.equal(compass(10, -10), 'NE'); assert.equal(compass(10, 0), 'E');
  assert.equal(compass(0, 10), 'S'); assert.equal(compass(-10, 0), 'W'); assert.equal(compass(-10, 10), 'SW');
});

test('a charge falls with the helicopter\'s velocity and the toss, lies in the snow and goes off when the fuse is out', () => {
  // standing still at 30 m: out of the right door, 4.9 t² = 30.9 → 2.5 s in the air
  const c = throwCharge(heli());
  assert.ok(c.x < 0 && Math.abs(c.z) < 1e-9, 'heading 0 looks along +z: the right door is at −x');
  let t = 0, landedAt = null;
  while (!stepCharge(c, 0.01, flat()) && t < 20) { t += 0.01; if (c.landed && landedAt == null) landedAt = t; }
  assert.ok(Math.abs(landedAt - 2.51) < 0.05, `landed after ${landedAt}`);
  assert.ok(Math.abs(t + 0.01 - HB.fuse) < 0.03, 'it goes off when the fuse is out');
  assert.ok(Math.abs(c.x + HB.door.side + HB.door.toss * 2.5) < 0.6, `the toss carries it ${c.x}`);
  assert.equal(c.y, 0);
  // at 20 m/s forward it lands ~50 m ahead: a moving throw misses
  const p = predictLanding(heli({ speed: 20 }), flat());
  assert.ok(p.z > 45 && p.z < 52, `ahead ${p.z}`);
  // the prediction is where the charge comes down
  const q = predictLanding(heli({ heading: 1, speed: 5 }), slope(2), { dt: 0.01 });
  const d = throwCharge(heli({ heading: 1, speed: 5 }));
  while (!d.landed) stepCharge(d, 0.01, slope(2));
  assert.ok(Math.hypot(q.x - d.x, q.z - d.z) < 0.3);
});

test('the avalanche path runs down the fall line and ends in the run-out', () => {
  const zone = { x: 0, z: 0, r: 20 };
  const path = fallLine(zone, slope(1));
  assert.equal(path.length / 2 - 1, HB.pathLength / HB.pathStep, 'a steady slope: the whole length');
  assert.ok(Math.abs(path.at(-2)) < 1e-6 && path.at(-1) > 350, 'straight down +z');
  assert.ok(inPath(path, zone, 10, 200));
  assert.ok(inPath(path, zone, 0, -15), 'over the crown');
  assert.ok(!inPath(path, zone, zone.r + HB.pathMargin + 2, 200), 'beside it');
  // a slope that flattens out after 100 m
  const runout = (x, z) => (z < 100 ? -z : -100 - (z - 100) * 0.01);
  assert.ok(fallLine(zone, runout).at(-1) < 130);
});

test('the blaster throws only in the window, one charge at a time', () => {
  const s = createBlastState();
  assert.equal(dropRefusal(s, heli({ agl: 10 })), 'low');
  assert.equal(requestDrop(s, heli({ agl: 60 })), false);
  assert.match(s.note, /Too high/);
  assert.equal(requestDrop(s, heli()), true);
  assert.equal(s.charges, HB.charges - 1);
  assert.equal(dropRefusal(s, heli()), 'live');
  assert.equal(s.events.map((e) => e.kind).join(), 'refused,throw');
});

test('a charge on the zone releases it, a miss costs 10 s, under the helicopter it ends the flight, the cloud costs 20 s', () => {
  const zones = [{ id: 'a', name: 'A', x: 0, z: 0, r: 20 }, { id: 'b', name: 'B', x: 500, z: 0, r: 20 }];
  const ground = slope(1.2);
  // over the zone at 35 m, throw, fly off 80 m sideways and up
  let s = createBlastState(zones);
  let h = heli({ x: 3, z: -5, y: ground(3, -5) + 35, agl: 35 });
  assert.ok(requestDrop(s, h, zones));
  h = { ...h, x: -120, y: h.y + 40, agl: 120 };
  for (let t = 0; t < HB.fuse + 0.1; t += 0.05) stepBlast(s, h, 0.05, ground, zones);
  const blast = s.events.find((e) => e.kind === 'blast');
  assert.ok(blast?.hit, 'in the zone');
  assert.equal(s.hits, 1); assert.equal(s.misses, 0); assert.equal(s.failed, null);
  assert.ok(s.released[0] >= 0 && s.paths[0].length > 4);
  const o = HELIBLAST_MISSION.objectives[0];
  // (the mission's own zones: its objectives read state.released[i]; zone 0 here stands for theirs)
  let v = o.check({ x: -120, z: 0, y: 0, agl: 120 }, s);
  assert.equal(v.done, false, 'the slope is still running');
  for (let t = 0; t < HB.settleS; t += 0.1) stepBlast(s, h, 0.1, ground, zones);
  v = o.check({ x: -120, z: 0, y: 0, agl: 120 }, s);
  assert.equal(v.done, true);
  assert.equal(s.cloudHits, 0, 'well clear of the path');
  // a miss: the charge rolls off nowhere, it lands 60 m from zone b
  s.events.length = 0;
  h = heli({ x: 560, z: 0, y: ground(560, 0) + 30, agl: 30 });
  assert.ok(requestDrop(s, h, zones));
  h = { ...h, x: 700, agl: 100 };
  for (let t = 0; t < HB.fuse + 0.1; t += 0.05) stepBlast(s, h, 0.05, ground, zones);
  assert.equal(s.misses, 1); assert.equal(s.penaltyMs, HB.missPenaltyMs);
  assert.match(s.note, /^Missed by \d+ m: \+10 s$/);
  // staying over the charge: the blast ends it
  s = createBlastState(zones);
  h = heli({ x: 0, z: 0, y: ground(0, 0) + 16, agl: 16 });
  requestDrop(s, h, zones);
  for (let t = 0; t < HB.fuse + 0.1; t += 0.05) stepBlast(s, h, 0.05, ground, zones);
  assert.match(s.failed, /under the helicopter/);
  assert.match(HELIBLAST_MISSION.objectives[0].check({ x: 0, z: 0, y: 0, agl: 16 }, s).fail, /under the helicopter/);
  // hanging low in the path as the slab goes: the powder cloud
  s = createBlastState(zones);
  h = heli({ x: 0, z: 0, y: ground(0, 0) + 30, agl: 30 });
  requestDrop(s, h, zones);
  h = { ...h, x: 0, z: 120, y: ground(0, 120) + 30, agl: 30 }; // (down the slope: in its path, 120 m off the blast)
  for (let t = 0; t < HB.fuse + 1; t += 0.05) stepBlast(s, h, 0.05, ground, zones);
  assert.equal(s.hits, 1); assert.equal(s.cloudHits, 1, 'once per slab');
  assert.equal(s.penaltyMs, HB.cloudPenaltyMs);
  assert.equal(HELIBLAST_MISSION.objectives[0].check({ x: 0, z: 120, y: 0, agl: 30 }, { ...s, note: null }).hint, 'Away from the avalanche path!');
});

test('out of charges with zones left fails it', () => {
  const s = createBlastState();
  s.charges = 0;
  stepBlast(s, heli({ x: 9000 }), 0.05, flat());
  assert.match(s.failed, /^Out of charges/);
});

test('the steps say where to fly and what to do', () => {
  const s = createBlastState();
  const o = HELIBLAST_MISSION.objectives[0];
  let v = o.check({ x: START.x, z: START.z, y: 0, agl: 0 }, s);
  assert.match(v.text, /^3\.\d km SE · Jakobshorn, north flank$/);
  assert.equal(v.target.style, 'hazard');
  assert.match(v.hint, /Jakobshorn/);
  const z = ZONES[0];
  v = o.check({ x: z.x, z: z.z, y: 0, agl: 70 }, s);
  assert.equal(v.text, `Hover 15–45 m over the slope · now 70 m · ${HB.charges} charges left`);
  assert.equal(v.hint, 'Sink to 45 m over the snow');
  s.aim = { inZone: true };
  assert.equal(o.check({ x: z.x, z: z.z, y: 0, agl: 30 }, s).hint, 'G: drop the charge');
  assert.equal(o.check({ x: z.x, z: z.z, y: 0, agl: 8 }, s).hint, 'Too low: climb above 15 m');
  s.charge = { x: z.x, y: 0, z: z.z, fuse: 3.2 };
  v = o.check({ x: z.x, z: z.z, y: 20, agl: 20 }, s);
  assert.equal(v.text, `Charge away · fuse 4 s · ${HB.charges} charges left`);
  assert.equal(v.hint, 'Pull up and away from the charge!');
  assert.match(HELIBLAST_MISSION.summary({ ...createBlastState(), thrown: 5, hits: 4, misses: 1, penaltyMs: 10000 })[0], /^5 charges thrown · 4 zones released · 1 missed · 0 in the powder cloud \(\+10 s\)$/);
});

test('the zones on the real terrain: steep open slopes above the tree line, and a bot flies the mission inside gold', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  for (const z of ZONES) {
    const h = groundHeight(z.x, z.z) + 1558;
    assert.ok(h > 2300 && h < 2800, `${z.id} at ${Math.round(h)} m`);
    let sum = 0, n = 0;
    for (let a = -z.r; a <= z.r; a += 6) for (let b = -z.r; b <= z.r; b += 6) {
      if (a * a + b * b > z.r * z.r) continue;
      const gx = (groundHeight(z.x + a + 6, z.z + b) - groundHeight(z.x + a - 6, z.z + b)) / 12, gz = (groundHeight(z.x + a, z.z + b + 6) - groundHeight(z.x + a, z.z + b - 6)) / 12;
      sum += Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI; n++;
    }
    assert.ok(sum / n > 30 && sum / n < 45, `${z.id}: ${(sum / n).toFixed(1)}°`);
    assert.ok(fallLine(z, groundHeight).length >= 20, `${z.id}: the slab has somewhere to run`);
  }
  // The bot: the game's helicopter (js/controllers.js updateHelicopter: 24 m/s² to 250 km/h, 16 m/s up or down, 1.45 rad/s
  // of turn) flown straight at each zone, 30 m over the snow, the throw once the ring is on the zone, then away
  const dt = 1 / 30, m = HELIBLAST_MISSION, state = m.createState();
  const h = { x: START.x, z: START.z, y: groundHeight(START.x, START.z) + 5, heading: START.heading, speed: 0, verticalSpeed: 0 };
  let t = 0, i = 0, flee = null;
  while (t < 900 && i < ZONES.length && !state.failed) {
    const zone = ZONES[i];
    const goal = flee || { x: zone.x - Math.cos(h.heading) * 0, z: zone.z };
    const dx = goal.x - h.x, dz = goal.z - h.z, d = Math.hypot(dx, dz);
    let want = Math.atan2(dx, dz) - h.heading; want = Math.atan2(Math.sin(want), Math.cos(want));
    if (d > 3) h.heading += Math.max(-1.45 * dt, Math.min(1.45 * dt, want));
    const vmax = Math.min(69.4, Math.sqrt(2 * 20 * Math.max(0, d - 2))) * Math.max(0, Math.cos(want));
    h.speed += Math.max(-24 * dt, Math.min(24 * dt, vmax - h.speed));
    h.x += Math.sin(h.heading) * h.speed * dt; h.z += Math.cos(h.heading) * h.speed * dt;
    const ground = groundHeight(h.x, h.z);
    const aheadG = Math.max(ground, groundHeight(h.x + Math.sin(h.heading) * 150, h.z + Math.cos(h.heading) * 150));
    const targetY = flee ? ground + 90 : d > 400 ? Math.max(aheadG + 80, groundHeight(zone.x, zone.z) + 30) : ground + 30;
    h.verticalSpeed = Math.max(-16, Math.min(16, (targetY - h.y) * 1.5));
    h.y = Math.max(ground + 0.25, h.y + h.verticalSpeed * dt);
    const ctx = { ...h, agl: h.y - ground, dt, mode: 'helicopter' };
    stepBlast(state, heliOf(ctx), dt, groundHeight);
    state.events.length = 0;
    if (!flee && !state.charge && d < 25 && h.speed < 1.5 && state.aim?.inZone && ctx.agl > HB.aglMin && ctx.agl < HB.aglMax) {
      assert.ok(requestDrop(state, heliOf(ctx)));
      flee = { x: zone.x + (zone.x - START.x > 0 ? -1 : 1) * 160, z: zone.z };
    }
    const view = m.objectives[i].check(ctx, state);
    assert.equal(view.fail, null, `at ${t.toFixed(1)} s: ${view.fail}`);
    if (view.done) { i++; flee = null; }
    t += dt;
  }
  assert.equal(i, ZONES.length, `all zones released (${t.toFixed(0)} s, ${state.misses} missed)`);
  assert.equal(state.misses, 0); assert.equal(state.cloudHits, 0);
  assert.ok(t * 1000 < m.medals.gold, `the bot's ${t.toFixed(0)} s inside gold`);
  assert.ok(t * 1000 > m.medals.gold * 0.6, `gold not a gift: the bot takes ${t.toFixed(0)} s`);
});
