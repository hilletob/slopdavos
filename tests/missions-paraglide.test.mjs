import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  PARAGLIDE_MISSION, PARAGLIDE_MISSIONS, PG, LAUNCH, FIELD, THERMALS, H0, polarSink, targetSpeed, thermalLift, thermalCentre, windAt, WIND,
  thermalStrength, slopeLift, airAt, createFlight, stepFlight, judgeLanding, flightScore, botInput, onGround
} from '../js/missions-data-paraglide.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { missionMedals, missionPin, medalFor } from '../js/missions-progress.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

// (js/missions-data-paraglide.js is three.js-free: the polar and the air on their own, the flights on the real terrain)

const flat = (y = 0) => () => y;
const inside = (x, z, m = 0) => x > WORLD_BOUNDS[0] + m && x < WORLD_BOUNDS[2] - m && z > WORLD_BOUNDS[1] + m && z < WORLD_BOUNDS[3] - m;

test('the flight from the Rinerhorn is listed, in summer, on foot, with its pin, icon and medals', () => {
  const m = PARAGLIDE_MISSION;
  assert.equal(getMission('paraglider-rinerhorn'), m);
  assert.ok(MISSIONS.includes(m));
  assert.deepEqual(PARAGLIDE_MISSIONS.map((d) => d.id), ['paraglider-rinerhorn']);
  assert.equal(m.mode, 'person'); assert.equal(m.season, 'summer'); assert.deepEqual(m.features, ['paraglider']);
  assert.ok(m.scoreMode);
  const l = missionMedals(m);
  assert.ok(l.gold > l.silver && l.silver > l.bronze);
  assert.equal(m.score(m.createState()), 0, 'nothing flown, nothing scored');
  assert.match(readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8'), /case 'paraglider'/);
  assert.deepEqual(PG.bounds, WORLD_BOUNDS);
  const pins = MISSIONS.map((d) => ({ id: d.id, ...missionPin(d) }));
  const me = pins.find((p) => p.id === m.id);
  for (const p of pins) if (p.id !== m.id) assert.ok(Math.hypot(p.x - me.x, p.z - me.z) > 30, p.id);
});

test('the launch, the landing field and every thermal lie well inside the map, in the right heights', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  for (const p of [LAUNCH, FIELD, ...THERMALS]) assert.ok(inside(p.x, p.z, 1500), p.name);
  const launch = groundHeight(LAUNCH.x, LAUNCH.z) + H0, field = groundHeight(FIELD.x, FIELD.z) + H0;
  assert.ok(launch > 2400 && launch < 2600, `launch ${launch}`);
  assert.ok(field > 1400 && field < 1500, `field ${field}`);
  // the field: the valley floor, a few metres of bumps over its whole circle
  let lo = Infinity, hi = -Infinity;
  for (let a = 0; a < 6.3; a += 0.4) for (const r of [0, 25, 50]) { const h = groundHeight(FIELD.x + Math.sin(a) * r, FIELD.z + Math.cos(a) * r); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  assert.ok(hi - lo < 12, `field relief ${hi - lo}`);
  // the launch: the ground falls away ahead
  const ahead = groundHeight(LAUNCH.x + Math.sin(LAUNCH.heading) * 60, LAUNCH.z + Math.cos(LAUNCH.heading) * 60);
  assert.ok(groundHeight(LAUNCH.x, LAUNCH.z) - ahead > 15);
  for (const th of THERMALS) {
    const g = groundHeight(th.x, th.z);
    assert.ok(PG.cloudBase - g > 450, `${th.name}: room to climb`);
    assert.ok(th.w >= 2.5 && th.w <= 4 && th.r >= 40 && th.r <= 80, th.name);
  }
});

test('the polar: 36 km/h hands up at a glide of 8-9, the speed bar faster and steeper, the brakes slower', () => {
  assert.equal(targetSpeed(0, 0), 10);
  assert.ok(Math.abs(targetSpeed(0, 0) * 3.6 - 36) < 0.01);
  const trim = polarSink(10);
  assert.ok(trim > 1.05 && trim < 1.2, `sink ${trim}`);
  assert.ok(10 / trim > 8 && 10 / trim < 9.2, `glide ${10 / trim}`);
  const bar = targetSpeed(1, 0), brake = targetSpeed(0, 0.5);
  assert.ok(bar > 13 && polarSink(bar) > 2 && bar / polarSink(bar) < 10 / trim);
  assert.ok(brake < 9 && polarSink(brake) < trim);
  assert.ok(polarSink(PG.minV) > polarSink(PG.minSinkV) + 0.5, 'full brakes: near the stall');
  // a straight glide on flat air settles on the trim speed and sink; a turn sinks more
  const f = createFlight({ x: 0, z: 0, heading: 0 });
  Object.assign(f, { phase: 'air', y: 500, v: 10 });
  stepFlight(f, { steer: 0 }, 5, flat(0), []);
  assert.ok(Math.abs(f.vy + trim) < 0.05);
  const g = createFlight({ x: 0, z: 0, heading: 0 });
  Object.assign(g, { phase: 'air', y: 500, v: 10 });
  stepFlight(g, { steer: 0.8 }, 3, flat(0), []);
  assert.ok(-g.vy > trim + 0.1, 'the turn costs height');
  assert.ok(g.turned > 1, 'and turns');
  // held all the way it winds up into a spiral: the sink of a spiral dive
  const s = createFlight({ x: 0, z: 0, heading: 0 });
  Object.assign(s, { phase: 'air', y: 900, v: 10 });
  stepFlight(s, { steer: 1 }, 6, flat(0), []);
  assert.ok(-s.vy > 4, `spiral sink ${-s.vy}`);
});

test('a thermal: a strong core, sink round its rim, nothing far off, fading under the cloud and in the evening', () => {
  const th = THERMALS[0], c = thermalCentre(th, 0, { x: 0, z: 0 }, 400);
  const core = thermalLift(th, c.x, 800, c.z, 400, 0);
  assert.ok(core > 2.5 && core <= th.w, `core ${core}`);
  assert.ok(thermalLift(th, c.x + th.r * 1.55, 800, c.z, 400, 0) < -0.4, 'the rim sinks');
  assert.equal(thermalLift(th, c.x + 1000, 800, c.z, 400, 0), 0);
  assert.equal(thermalLift(th, c.x, PG.cloudBase + 5, c.z, 900, 0), 0, 'nothing in the cloud');
  assert.ok(thermalLift(th, c.x, PG.cloudBase - 70, c.z, 900, 0) < core * 0.6, 'weaker under it');
  assert.ok(thermalLift(th, c.x, 800, c.z, 10, 0) < core * 0.6, 'weak right over the ground');
  assert.ok(thermalStrength(PG.fadeTo + 100) < 0.5 && thermalStrength(0) === 1);
  // it wanders, but not far
  const foot = thermalCentre(th, 0, { x: 0, z: 0 }), later = thermalCentre(th, 130, { x: 0, z: 0 });
  assert.ok(Math.hypot(later.x - foot.x, later.z - foot.z) > 10 && Math.hypot(later.x - th.x, later.z - th.z) < 40);
  // the sun's breeze up a south face, none on a north face or high above
  assert.ok(slopeLift(0, -0.6, 20) > 0.2 && slopeLift(0, 0.6, 20) === 0 && slopeLift(0, -0.6, 200) === 0);
  assert.equal(airAt(c.x, 800, c.z, 400, 0).best, th.id);
});

test('the landing: soft on the field scores its bonus, too fast or into a slope is a crash', () => {
  const at = (o) => Object.assign(createFlight(), { phase: 'air', y: 0, ...o });
  const good = judgeLanding(at({ x: FIELD.x + 10, z: FIELD.z, v: 7, vy: -0.8 }), flat(0));
  assert.ok(!good.crash && good.onField && good.bonus > PG.softBonus + PG.fieldBonus);
  const out = judgeLanding(at({ x: FIELD.x + 500, z: FIELD.z, v: 7, vy: -0.8 }), flat(0));
  assert.ok(!out.crash && !out.onField && out.bonus === PG.softBonus);
  assert.equal(judgeLanding(at({ x: FIELD.x, z: FIELD.z, v: 10, vy: -3.5 }), flat(0)).reason, 'hard');
  assert.equal(judgeLanding(at({ x: FIELD.x, z: FIELD.z, v: 15, vy: -1 }), flat(0)).reason, 'fast');
  const wall = (x, z) => z * 0.5; // the ground rising ahead (heading 0: +z)
  assert.equal(judgeLanding(at({ x: 0, z: 0, heading: 0, v: 10, vy: -1 }), wall).crash, true);
  // the flare: braking over the ground turns a trim glide into a soft touch-down
  const f = createFlight({ x: FIELD.x, z: FIELD.z - 80, heading: 0 });
  Object.assign(f, { phase: 'air', y: 12, v: 10 });
  for (let i = 0; i < 400 && !onGround(f); i++) stepFlight(f, { brake: f.agl < PG.flareAgl ? 1 : 0 }, 1 / 30, flat(0), []);
  assert.equal(f.phase, 'landed');
  const g = createFlight({ x: FIELD.x, z: FIELD.z - 80, heading: 0 });
  Object.assign(g, { phase: 'air', y: 12, v: 10 });
  for (let i = 0; i < 400 && !onGround(g); i++) stepFlight(g, { accel: 1, steer: 1 }, 1 / 30, flat(0), []);
  assert.equal(g.phase, 'crashed', 'a turn on the speed bar into the ground');
});

test('the launch on the real slope: the wing comes up, the run, airborne within a few seconds, clear of the ground', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  const f = createFlight();
  stepFlight(f, {}, 1, groundHeight);
  assert.equal(f.phase, 'ready', 'waits for the pilot');
  const seen = new Set();
  let t = 0;
  for (; t < 12 && f.phase !== 'air'; t += 1 / 30) { stepFlight(f, { go: true }, 1 / 30, groundHeight); seen.add(f.phase); }
  assert.deepEqual([...seen], ['inflate', 'run', 'air']);
  assert.ok(t > 3 && t < 8, `off after ${t.toFixed(1)} s`);
  for (let i = 0; i < 30 * 20; i++) stepFlight(f, {}, 1 / 30, groundHeight);
  assert.equal(f.phase, 'air');
  assert.ok(f.agl > 60, `agl ${f.agl}`);
  assert.deepEqual(f.events.slice(0, 3), ['inflate', 'run', 'takeoff']);
});

/** A whole flight of the bot on the real terrain: { f, real (s of the game) } */
async function fly(plan) {
  const { groundHeight } = await import('../js/terrain.js');
  const f = createFlight(), bot = {}, dt = 1 / 20;
  let real = 0;
  while (!onGround(f) && real < 2400) { stepFlight(f, botInput(f, bot, plan, { groundAt: groundHeight }), dt, groundHeight); real += dt; }
  return { f, real };
}

test('the bots on the real terrain: a glide to the field, a thermal, out to the Bärentaler Alp: the medals between them', async () => {
  const m = PARAGLIDE_MISSION;
  const glide = await fly([]);
  assert.equal(glide.f.phase, 'landed');
  assert.ok(glide.f.landing.onField, `${Math.round(glide.f.landing.distance)} m from the cross`);
  const one = await fly(['rinerhorn']);
  assert.ok(one.f.maxY + H0 > 2850, `climbed to ${Math.round(one.f.maxY + H0)} m`);
  assert.ok(one.f.landing.onField);
  const xc = await fly(['rinerhorn', 'baerentaler']);
  assert.ok(xc.f.landing.onField && xc.f.maxDist > 4000, `${Math.round(xc.f.maxDist)} m out`);
  const [a, b, c] = [glide, one, xc].map((r) => m.score({ flight: r.f }));
  assert.ok(a < b && b < c, `${a} < ${b} < ${c}`);
  assert.equal(medalFor(a, missionMedals(m), true), 'bronze', `the glide ${a}`);
  assert.equal(medalFor(b, missionMedals(m), true), 'silver', `one thermal ${b}`);
  assert.ok(c >= missionMedals(m).silver && c < missionMedals(m).gold + 120, `the cross-country ${c}`);
  // half an hour of the flight's clock at most counts: the glide down alone is a quarter of an hour of the game's
  assert.ok(glide.real > 300 && glide.real < 600, `${glide.real} s`);
  assert.equal(flightScore({ ...xc.f, airtime: 1e5 }), flightScore({ ...xc.f, airtime: PG.timeCap }));
  assert.match(m.summary({ flight: xc.f })[0], /^\d+:\d\d in the air · [\d.]+ km from the launch · \d+ m highest · on the field, \d+ m from the cross$/);
});

test('the wind: up the valley from the south-west, weaker near the ground; it carries the wing and leans the thermals', () => {
  const hi = windAt(0, 400), lo = windAt(0, 0);
  assert.ok(hi.x > 0 && hi.z < 0, 'blowing north-east');
  assert.ok(lo.speed < hi.speed && hi.speed > 1.5 && hi.speed < 4.5, `${lo.speed} < ${hi.speed}`);
  // flying straight upwind is slower over the ground than downwind
  const flat = () => 0;
  const up = createFlight(), down = createFlight();
  for (const [f, h] of [[up, WIND.toward + Math.PI], [down, WIND.toward]]) {
    Object.assign(f, { phase: 'air', y: 900, v: 10, heading: h });
    stepFlight(f, {}, 2, flat, []);
  }
  assert.ok(down.gs - up.gs > 3, `down ${down.gs} up ${up.gs}`);
  // the column leans downwind with height
  const th = THERMALS[0], foot = thermalCentre(th, 0, { x: 0, z: 0 }), top = thermalCentre(th, 0, { x: 0, z: 0 }, 800);
  assert.ok((top.x - foot.x) * hi.x + (top.z - foot.z) * hi.z > 0 && Math.hypot(top.x - foot.x, top.z - foot.z) > 50);
});

test('the steps: the launch until airborne, then the flight until the landing, the field the target', () => {
  const m = PARAGLIDE_MISSION, s = m.createState();
  const [launch, flight] = m.objectives;
  let v = launch.check({}, s);
  assert.equal(v.done, false); assert.equal(v.text, 'W or Space: pull up the wing');
  s.flight.phase = 'air';
  assert.equal(launch.check({}, s).done, true);
  v = flight.check({}, s);
  assert.equal(v.done, false); assert.deepEqual([v.target.x, v.target.z], [FIELD.x, FIELD.z]);
  assert.match(v.text, /^\d+ pts · \d+ m from the launch · field [\d.]+ km$/);
  s.flight.phase = 'landed';
  assert.equal(flight.check({}, s).done, true);
});

test('the flight speaks German: its name, intro, steps, HUD and summary', async () => {
  globalThis.Node ??= { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  globalThis.NodeFilter ??= { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.document ??= {
    readyState: 'loading', addEventListener() {}, documentElement: { lang: 'en' },
    body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } },
    querySelectorAll() { return []; }, createTreeWalker() { return { nextNode() { return false; } }; }
  };
  globalThis.localStorage ??= { getItem() { return null; }, setItem() {} };
  globalThis.window ??= { dispatchEvent() {} };
  const { setLanguage, t } = await import('../js/i18n.js');
  setLanguage('de');
  const m = PARAGLIDE_MISSION;
  assert.equal(t(m.title), 'Flugschein: Gleitschirmflug vom Rinerhorn');
  assert.match(t(m.intro), /^Ein Sommernachmittag auf dem Rinerhorn/);
  assert.match(t(m.finish), /^Der Schirm liegt gefaltet/);
  for (const o of m.objectives) assert.notEqual(t(o.title), o.title, o.title);
  const s = m.createState();
  assert.equal(t(m.objectives[0].check({}, s).text), 'W oder Leertaste: Schirm aufziehen');
  assert.equal(t('1234 pts · 4.4 km from the launch · field 820 m'), '1234 Pkt. · 4.4 km vom Startplatz · Landeplatz 820 m');
  assert.equal(t('12:03 in the air · 4.4 km from the launch · 2950 m highest · on the field, 23 m from the cross'), '12:03 in der Luft · 4.4 km vom Startplatz · höchstens 2950 m · auf dem Landeplatz, 23 m vom Kreuz');
  assert.equal(t('0:40 in the air · 850 m from the launch · 2526 m highest · crash landing'), '0:40 in der Luft · 850 m vom Startplatz · höchstens 2526 m · Bruchlandung');
  for (const k of ['Above ground', 'Airtime', 'Speed', 'Distance', 'Points', 'Airborne!', 'Lift! Circle in it', 'Flare now!', 'Launch', 'Flare', 'speed bar', 'brakes', 'flare']) assert.notEqual(t(k), k, k);
  setLanguage('en');
});
