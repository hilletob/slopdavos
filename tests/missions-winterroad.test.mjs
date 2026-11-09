import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  WINTERROAD_MISSIONS, SUMMER_TYRES_MISSION, SNOW_CHAINS_MISSION, FLUELA, FLUELA_TOP, CLAVADEL, FLUELA_S, CLAVADEL_S, FLUELA_ROAD, PLACES, PULLOVER,
  TYRES, CHAINS, SPIN, STUCK_S, BANK_PENALTY_MS, createTraction, stepTraction, slopePull, createDrive, stepDrive, createChains, stepChains, chainSpot,
  needleAt, stepChainStrain, profileTime, chainWays, projectNear, kmh
} from '../js/missions-data-winterroad.js';
import { routePoint } from '../js/missions-data-work.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

// (js/missions-data-winterroad.js is three.js-free: the van's wheels, the drive along the routes and the chains run on
// synthetic frames here, the clean runs' times on the real terrain)
const DT = 1 / 30;
const frame = (over = {}) => ({ mode: 'car', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: DT, t: 1000, ...over });

test('two winter drives in the list, in winter, in the van, with their features and icons', () => {
  assert.deepEqual(WINTERROAD_MISSIONS.map((m) => m.id), ['summer-tyres-flueela', 'snow-chains-clavadel']);
  for (const m of WINTERROAD_MISSIONS) {
    assert.ok(MISSIONS.includes(m));
    assert.equal(getMission(m.id), m);
    assert.equal(m.season, 'winter');
    assert.equal(m.mode, 'car');
    assert.ok(m.medals.gold < m.medals.silver && m.medals.silver < m.medals.bronze);
    assert.equal(m.bonusMs, m.medals.gold);
    assert.match(readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8'), new RegExp(`case '${m.icon}'`));
  }
  assert.deepEqual(SUMMER_TYRES_MISSION.features, ['winterDrive']);
  assert.deepEqual(SNOW_CHAINS_MISSION.features, ['winterDrive', 'snowChains']);
  assert.match(readFileSync(new URL('../js/missions-winterroad.js', import.meta.url), 'utf8'), /WINTERROAD_FEATURES = \{ winterDrive, snowChains \}/);
});

test('the Flüelapassstrasse from the Gasthaus zum Tschuggen to the Hospiz: one road, 5.9 km, 440 m up', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  const P = FLUELA.pts, n = P.length / 2;
  assert.ok(Math.hypot(P[0] - PLACES.tschuggen.x, P[1] - PLACES.tschuggen.z) < 30, 'starts at the Gasthaus');
  assert.ok(Math.hypot(P[n * 2 - 2] - PLACES.hospiz.x, P[n * 2 - 1] - PLACES.hospiz.z) < 30, 'ends at the Hospiz');
  assert.ok(FLUELA.length > 5700 && FLUELA.length < 6000, `${FLUELA.length.toFixed(0)} m`);
  for (let i = 1; i < n; i++) assert.ok(Math.hypot(P[i * 2] - P[i * 2 - 2], P[i * 2 + 1] - P[i * 2 - 1]) < 250, 'no gap');
  const h0 = groundHeight(P[0], P[1]) + 1558, h1 = groundHeight(P[n * 2 - 2], P[n * 2 - 1]) + 1558;
  assert.ok(h0 > 1920 && h0 < 1960, `Tschuggen ${h0.toFixed(0)} m`);
  assert.ok(h1 > 2370 && h1 < 2395, `the pass ${h1.toFixed(0)} m`);
  assert.ok(FLUELA_S.waegerhus < FLUELA_S.waegerhuetta && FLUELA_S.waegerhuetta < FLUELA_S.end);
  // the mission drives the top of it: from the Wägerhütta (2.5 km, ~2210 m) to the pass
  const T = FLUELA_TOP.pts, m = T.length / 2;
  assert.ok(Math.hypot(T[0] - PLACES.waegerhuetta.x, T[1] - PLACES.waegerhuetta.z) < 60, 'starts by the Wägerhütta (the hut stands back from the road)');
  assert.ok(Math.hypot(T[m * 2 - 2] - PLACES.hospiz.x, T[m * 2 - 1] - PLACES.hospiz.z) < 30, 'ends at the Hospiz');
  assert.ok(FLUELA_TOP.length > 2300 && FLUELA_TOP.length < 2600, `${FLUELA_TOP.length.toFixed(0)} m`);
  assert.ok(FLUELA_TOP.length < FLUELA.length / 2);
  const t0 = groundHeight(T[0], T[1]) + 1558;
  assert.ok(t0 > 2190 && t0 < 2230, `Wägerhütta ${t0.toFixed(0)} m`);
  // the van starts on the road, on its right half, facing along it, at the Wägerhütta
  const s = SUMMER_TYRES_MISSION.start, p = projectNear(FLUELA, s.x, s.z);
  assert.ok(p.d < 0 && p.d > -FLUELA_ROAD.half, `${p.d.toFixed(1)} m`);
  assert.ok(Math.abs(Math.atan2(p.tx, p.tz) - s.heading) < 0.05);
  assert.ok(Math.abs(p.s - FLUELA_S.waegerhuetta) < 20);
});

test('Islen to Frauenkirch: the Clavadelerstrasse up over Clavadel, the Sertigerstrasse down, all roads for cars', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  const ids = ['w435437633', 'w435437631', 'w26159007', 'w1442773942', 'w531784400'];
  for (const id of ids) assert.match(DAVOS_DATA.roads.find((r) => r.id === id).kind, /^(tertiary|secondary|residential|unclassified)$/);
  assert.throws(() => chainWays(['w435437633', 'w26159007']), /does not join/);
  const P = CLAVADEL.pts, n = P.length / 2;
  let top = -Infinity, topS = 0;
  for (let s = 0; s < CLAVADEL.length; s += 20) { const q = routePoint(CLAVADEL, s); const h = groundHeight(q.x, q.z) + 1558; if (h > top) { top = h; topS = s; } }
  assert.ok(top > 1650 && top < 1680, `the top ${top.toFixed(0)} m`);
  assert.ok(Math.abs(topS - CLAVADEL_S.clavadel) < 400, 'the top at Clavadel');
  assert.ok(Math.hypot(P[n * 2 - 2] - PLACES.frauenkirch.x, P[n * 2 - 1] - PLACES.frauenkirch.z) < 40, 'ends in Frauenkirch');
  assert.ok(CLAVADEL.length > 5100 && CLAVADEL.length < 5500);
  // the pull-in: on the right of the road, past the start
  const p = projectNear(CLAVADEL, PULLOVER.x, PULLOVER.z);
  assert.ok(p.d < -2 && p.d > -4.5 && p.s > 250 && p.s < 450);
});

test('summer tyres: a full throttle from a standstill on 10 % spins and gets nowhere, a gentle foot climbs', () => {
  // the Flüela's ploughed snow grips a little more than the road to Islen, but nowhere near the chains
  assert.equal(SUMMER_TYRES_MISSION.tyres, 'ploughed');
  assert.equal(SNOW_CHAINS_MISSION.tyres, 'summer');
  const P = TYRES.ploughed.drive, S = TYRES.summer.drive;
  assert.ok(P.grip > S.grip && P.grip < S.grip * 1.25 && P.brake > S.brake && TYRES.ploughed.traction > TYRES.summer.traction);
  assert.ok(TYRES.chains.drive.grip > 1.6 * P.grip && TYRES.ploughed.traction < TYRES.chains.traction);
  for (const T of [TYRES.summer, TYRES.ploughed]) spinsAndClimbs(T);
});

function spinsAndClimbs(T) {
  const grade = 0.1;
  const full = createTraction();
  for (let i = 0; i < 90; i++) stepTraction(full, { throttle: 1, speed: 0, grade }, T, DT);
  assert.ok(full.spin > 0.9, `spin ${full.spin.toFixed(2)}`);
  assert.ok(full.force < slopePull(grade) + T.drive.rolling, 'the wheels spin, the van stands');
  const gentle = createTraction();
  for (let i = 0; i < 90; i++) stepTraction(gentle, { throttle: 0.44, speed: 0, grade }, T, DT);
  assert.equal(gentle.spin, 0);
  assert.ok(gentle.force > slopePull(grade) + T.drive.rolling + 0.1, `force ${gentle.force.toFixed(2)}`);
  // tapping W as a player does: off for a moment a quarter of a second after the spin shows, on again: it climbs
  const tap = createTraction(), h = 1 / 60;
  let sum = 0, n = 0, press = true, seen = -1, off = 0;
  for (let i = 0; i < 600; i++) {
    const t = i * h;
    if (press && tap.spin > SPIN.show && seen < 0) seen = t;
    if (press && seen >= 0 && t - seen > 0.25) { press = false; off = t; seen = -1; }
    if (!press && t - off > 0.25) press = true;
    stepTraction(tap, { throttle: press ? 1 : 0, speed: 0, grade }, T, h);
    if (i > 120) { sum += tap.force; n++; }
  }
  assert.ok(sum / n > slopePull(grade) + T.drive.rolling, `mean ${(sum / n).toFixed(2)}`);
  // under way the spinning wheels still push a little more than the slope
  const moving = createTraction();
  for (let i = 0; i < 60; i++) stepTraction(moving, { throttle: 1, speed: 8, grade: 0.08 }, T, DT);
  assert.ok(moving.force > slopePull(0.08), `${moving.force.toFixed(2)}`);
  // a bend eats into the traction: the same foot spins with the tyres holding sideways
  const bend = createTraction();
  for (let i = 0; i < 60; i++) stepTraction(bend, { throttle: 0.44, speed: 3, grade: 0, lateral: 0.8 * T.drive.grip }, T, DT);
  assert.ok(bend.spin > 0.2, `bend spin ${bend.spin.toFixed(2)}`);
}

test('snow chains: they hold full throttle on the slope', () => {
  // the chains hold full throttle on the slope
  const chains = createTraction();
  for (let i = 0; i < 90; i++) stepTraction(chains, { throttle: 1, speed: 0, grade: 0.12 }, TYRES.chains, DT);
  assert.ok(chains.force > slopePull(0.12) + TYRES.chains.drive.rolling + 1);
  assert.ok(TYRES.chains.drive.grip > 2 * TYRES.summer.drive.grip && TYRES.chains.drive.brake > 2 * TYRES.summer.drive.brake);
});

test('the drive: the snowbank costs 5 s once, off the road ends it, stuck for 40 s ends it', () => {
  const st = SUMMER_TYRES_MISSION.createState();
  const on = (s, d, over = {}) => { const p = routePoint(FLUELA_TOP, s, d); return frame({ x: p.x, z: p.z, ...over }); };
  for (let s = 0; s < 200; s += 2) SUMMER_TYRES_MISSION.update(on(s, -2, { speed: 8 }), st);
  assert.ok(Math.abs(st.drive.best - 198) < 3);
  for (let i = 0; i < 10; i++) SUMMER_TYRES_MISSION.update(on(200, -7.5, { speed: 8 }), st);
  assert.equal(st.drive.banks, 1);
  assert.equal(st.penaltyMs, BANK_PENALTY_MS);
  SUMMER_TYRES_MISSION.update(on(202, -2, { speed: 8 }), st);
  SUMMER_TYRES_MISSION.update(on(204, -7.5, { speed: 8 }), st);
  assert.equal(st.drive.banks, 2);
  assert.equal(st.drive.crashes, 0);
  let v = SUMMER_TYRES_MISSION.objectives[0].check(on(204, -2, { speed: 4 }), st);
  assert.match(v.text, /^2\.3 km to the Flüela Hospiz · 14 km\/h · 2 times in the snowbank$/);
  assert.equal(v.fail, undefined);
  SUMMER_TYRES_MISSION.update(on(206, -16, { speed: 8 }), st);
  v = SUMMER_TYRES_MISSION.objectives[0].check(on(206, -16), st);
  assert.match(v.fail, /^Off the road/);
  // stuck
  const s2 = SUMMER_TYRES_MISSION.createState();
  for (let i = 0; i < (STUCK_S + 1) / DT; i++) SUMMER_TYRES_MISSION.update(on(20 + (i % 2), -2), s2);
  assert.match(SUMMER_TYRES_MISSION.objectives[0].check(on(20, -2), s2).fail, /^Stuck/);
  // a crash: the speed gone at once
  const s3 = SUMMER_TYRES_MISSION.createState();
  SUMMER_TYRES_MISSION.update(on(100, -2, { speed: 12 }), s3);
  SUMMER_TYRES_MISSION.update(on(100.4, -2, { speed: 2 }), s3);
  assert.equal(s3.drive.crashes, 1);
  // the hairpin's other leg (20 m away) is not taken for this one: the projection keeps to the road travelled
  const dr = createDrive();
  for (let s = 0; s <= FLUELA.length; s += 3) { const p = routePoint(FLUELA, s, -2); stepDrive(dr, FLUELA, FLUELA_ROAD, frame({ x: p.x, z: p.z, speed: 6 }), {}); assert.ok(!dr.lost && !dr.inBank, `at ${s}`); }
  assert.ok(dr.best > FLUELA.length - 5);
});

test('a bot drives the Flüela: from the Wägerhütta, through the hairpins, done at the Hospiz', () => {
  const m = SUMMER_TYRES_MISSION, st = m.createState();
  let idx = 0;
  assert.equal(m.objectives.length, 2);
  for (let s = 0; s <= FLUELA_TOP.length + 2 && idx < 2; s += 2) {
    const p = routePoint(FLUELA_TOP, Math.min(s, FLUELA_TOP.length), -2), ctx = frame({ x: p.x, z: p.z, speed: 10 });
    m.update(ctx, st);
    const v = m.objectives[idx].check(ctx, st);
    assert.equal(v.fail, undefined);
    if (v.done) idx++;
  }
  assert.equal(idx, 2);
  assert.match(m.summary(st)[0], /^Wheelspin 0 s · 0 times in the snowbank · 0 crashes$/);
});

test('the chains: laid out (held), pulled over on the beat (a miss slips), tensioned (taps), on both wheels', () => {
  const ch = createChains(), st = { penaltyMs: 0 };
  const car = { x: 100, z: 50, heading: 0.7 };
  // the work spots: beside the rear wheels, the left one on the driver's side (+x at heading 0)
  const L = chainSpot({ x: 0, z: 0, heading: 0 }, 'left'), R = chainSpot({ x: 0, z: 0, heading: 0 }, 'right');
  assert.ok(L.x > 1 && R.x < -1 && L.z < -1 && R.z < -1);
  const atWheel = (side) => chainSpot(car, side);
  // too far: nothing
  assert.equal(stepChains(ch, { person: { x: 0, z: 0 }, car, hold: true, presses: 1 }, DT, st), null);
  assert.equal(ch.at, -1);
  const work = (side) => {
    const person = atWheel(side);
    let t = 0;
    while (ch.wheels.find((w) => w.side === side).step === 0) { stepChains(ch, { person, car, hold: true, presses: 0 }, DT, st); t += DT; }
    assert.ok(t === 0 || Math.abs(t - CHAINS.layS) < 0.1);
    const w = ch.wheels.find((q) => q.side === side);
    // the pull: wait for the needle in the zone
    let guard = 0;
    while (w.step === 1 && guard++ < 200) {
      const n = needleAt(w.t + DT);
      stepChains(ch, { person, car, hold: false, presses: n >= 0.45 && n <= 0.58 ? 1 : 0 }, DT, st);
    }
    assert.equal(w.step, 2);
    let taps = 0;
    while (!w.done) { stepChains(ch, { person, car, hold: false, presses: taps % 3 === 0 ? 1 : 0 }, DT, st); taps++; }
    return w;
  };
  work('left');
  assert.equal(ch.fitted, 1);
  // a pull off the beat on the other wheel: it slips, 2.5 s
  const right = ch.wheels[1], person = atWheel('right');
  while (right.step === 0) stepChains(ch, { person, car, hold: true, presses: 0 }, DT, st);
  right.t = 0;
  assert.equal(stepChains(ch, { person, car, hold: false, presses: 1 }, DT, st), 'slip');
  assert.equal(ch.slips, 1);
  assert.equal(st.penaltyMs, CHAINS.slipMs);
  work('right');
  assert.equal(ch.fitted, 2);
});

test('the chains strain over 50 km/h and snap; under 45 they recover', () => {
  const ch = createChains();
  for (let i = 0; i < 30; i++) assert.notEqual(stepChainStrain(ch, 47 / 3.6, DT), 'snap');
  assert.equal(ch.strain, 0);
  let t = 0;
  while (!ch.snapped && t < 10) { stepChainStrain(ch, 56 / 3.6, DT); t += DT; }
  assert.ok(ch.snapped && t > 1.2 && t < CHAINS.snapS, `${t.toFixed(1)} s`);
  const ch2 = createChains();
  for (let i = 0; i < 30; i++) stepChainStrain(ch2, 55 / 3.6, DT);
  const before = ch2.strain;
  for (let i = 0; i < 60; i++) stepChainStrain(ch2, 30 / 3.6, DT);
  assert.ok(ch2.strain < before && !ch2.snapped);
});

test('a bot does the snow chains mission: pull over, chains on, back in, over Clavadel to Frauenkirch', () => {
  const m = SNOW_CHAINS_MISSION, st = m.createState();
  let idx = 0, t = 1000;
  const run = (ctx) => {
    m.update(ctx, st);
    const v = m.objectives[idx].check(ctx, st);
    assert.equal(v.fail, undefined, v.fail);
    if (v.done) idx++;
    return v;
  };
  // to Islen, stopping in the pull-in
  for (let s = 12; s < CLAVADEL_S.islen - 4; s += 2) { const p = routePoint(CLAVADEL, s, -2); run(frame({ x: p.x, z: p.z, speed: 8, t: (t += 33) })); }
  run(frame({ x: PULLOVER.x, z: PULLOVER.z, speed: 0, t: (t += 33) }));
  assert.equal(idx, 1);
  // in the van: get out
  const car = { x: PULLOVER.x, z: PULLOVER.z, heading: PULLOVER.heading };
  st.input = { person: null, car, hold: false, presses: 0 };
  assert.equal(run(frame({ x: car.x, z: car.z, t: (t += 33) })).hint, 'F: get out');
  // on foot round the van, the steps at each wheel
  for (const side of ['left', 'right']) {
    const p = chainSpot(car, side);
    let guard = 0;
    while (st.chains.wheels.find((w) => w.side === side).done === false && guard++ < 2000) {
      const w = st.chains.wheels.find((q) => q.side === side);
      const n = needleAt(w.t + DT);
      const press = w.step === 1 ? (n >= 0.45 && n <= 0.58 ? 1 : 0) : w.step === 2 ? (guard % 3 === 0 ? 1 : 0) : 0;
      st.input = { person: { x: p.x, z: p.z }, car, hold: w.step === 0, presses: press };
      run(frame({ mode: 'person', x: p.x, z: p.z, t: (t += 33) }));
    }
  }
  assert.equal(st.chains.fitted, 2);
  assert.equal(st.tyres, 'chains');
  assert.equal(idx, 2);
  st.input = { person: null, car, hold: false, presses: 0 };
  run(frame({ x: car.x, z: car.z, t: (t += 33) }));
  assert.equal(idx, 3);
  // over Clavadel to Frauenkirch at 40 km/h
  for (let s = CLAVADEL_S.islen; s <= CLAVADEL.length + 2 && idx < 5; s += 2) {
    const p = routePoint(CLAVADEL, Math.min(s, CLAVADEL.length), -1.6);
    run(frame({ x: p.x, z: p.z, speed: 40 / 3.6, t: (t += 180) }));
  }
  assert.equal(idx, 5);
  assert.match(m.summary(st)[0], /^0 chains slipped · top speed 40 km\/h · 0 times in the snowbank$/);
  // too fast with the chains: they snap
  const s2 = m.createState();
  s2.tyres = 'chains';
  s2.chains.fitted = 2;
  s2.drive.s = s2.drive.best = s2.drive.bestAt = 2500;
  const p = routePoint(CLAVADEL, 2500, -1.6);
  for (let i = 0; i < 120; i++) m.update(frame({ x: p.x, z: p.z, speed: 60 / 3.6 }), s2);
  assert.match(m.objectives[4].check(frame({ x: p.x, z: p.z }), s2).fail, /^A chain snapped/);
});

test('the medals: the clean runs (a speed profile on the real terrain) inside gold, with room', async () => {
  const { groundHeight } = await import('../js/terrain.js');
  const a = profileTime(FLUELA_TOP, groundHeight, TYRES[SUMMER_TYRES_MISSION.tyres], { vmax: 16.7 });
  assert.ok(a.ms < SUMMER_TYRES_MISSION.medals.gold && a.ms > SUMMER_TYRES_MISSION.medals.gold * 0.8, `Flüela clean ${(a.ms / 1000).toFixed(0)} s`);
  // the steepest of the climb: within what the summer tyres put down (no part of it needs chains)
  const steep = Math.max(...a.grade);
  assert.ok(slopePull(steep) + TYRES.summer.drive.rolling < TYRES.summer.traction, `steepest ${(steep * 100).toFixed(1)} %`);
  const toIslen = profileTime(CLAVADEL, groundHeight, TYRES.summer, { to: CLAVADEL_S.islen });
  const chains = profileTime(CLAVADEL, groundHeight, TYRES.chains, { from: CLAVADEL_S.islen, vmax: 13.3 });
  const fitting = 35000; // the walk round the van and the six steps, done well
  const b = toIslen.ms + fitting + chains.ms;
  assert.ok(b < SNOW_CHAINS_MISSION.medals.gold && b > SNOW_CHAINS_MISSION.medals.gold * 0.8, `Clavadel clean ${(b / 1000).toFixed(0)} s`);
  for (const m of WINTERROAD_MISSIONS) {
    const l = m.medals;
    assert.ok(l.silver / l.gold > 1.3 && l.silver / l.gold < 1.5 && l.bronze / l.gold > 1.8 && l.bronze / l.gold < 2.2);
  }
  assert.ok(kmh(13.3) < CHAINS.maxKmh);
});

test('the winter drives speak German: names, intros, objectives, the HUD\'s texts', async () => {
  globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  globalThis.NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.document = { readyState: 'loading', addEventListener() {}, documentElement: { lang: 'en' }, body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } }, querySelectorAll() { return []; }, createTreeWalker() { return { nextNode() { return false; } }; } };
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'de-CH' }, configurable: true });
  globalThis.localStorage = { getItem() { return null; }, setItem() {} };
  globalThis.window = { dispatchEvent() {} };
  const { t, setLanguage } = await import('../js/i18n.js');
  setLanguage('de');
  const de = (s) => { const out = t(s); assert.notEqual(out, s, `no German for "${s}"`); return out; };
  for (const m of WINTERROAD_MISSIONS) {
    de(m.title); de(m.intro); de(m.finish);
    for (const o of m.objectives) de(o.title);
  }
  assert.equal(de('1.2 km to the Flüela Hospiz · 31 km/h'), '1,2 km bis zum Flüela Hospiz · 31 km/h');
  assert.equal(de('350 m to Islen · 20 km/h · 1 time in the snowbank'), '350 m bis Islen · 20 km/h · 1-mal im Schneewall');
  assert.equal(de('Chains on 1 of 2 wheels · go to the right rear wheel'), 'Ketten an 1 von 2 Rädern · geh zum rechten Hinterrad');
  assert.equal(de('Left rear wheel: pull it over the tyre'), 'Hinterrad links: über den Pneu ziehen');
  assert.equal(de('Chains rattling at 52 km/h: slow down below 50!'), 'Die Ketten rasseln bei 52 km/h: unter 50 bremsen!');
  assert.equal(de('Wheelspin 12 s · 2 times in the snowbank · 1 crash'), 'Durchdrehen 12 s · 2-mal im Schneewall · 1 Unfall');
  assert.equal(de('1 chain slipped · top speed 47 km/h · 0 times in the snowbank'), '1-mal Kette abgerutscht · Höchsttempo 47 km/h · 0-mal im Schneewall');
  // every fail, hint and toast of the two files
  const texts = [
    ...readFileSync(new URL('../js/missions-winterroad.js', import.meta.url), 'utf8').matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)
  ].map((x) => x[1]);
  assert.ok(texts.length >= 7);
  for (const s of texts) de(s);
  for (const s of ['Off the road: the van slid off the Flüelapassstrasse and down the slope.', 'Off the road: the van slid off the Clavadelerstrasse into the snow-covered meadow.', `Stuck: the van has not got any further up the road for ${STUCK_S} s.`, 'A chain snapped: snow chains are good for 50 km/h at most.', 'Wheels spinning: ease off the throttle (tap W)', 'In the snowbank: back onto the road', 'Stop here, on the right', 'Brake (S) to a stop', 'Back to the pull-in', 'Space when the needle is in the green', 'Tap Space quickly', 'Get back into the van', 'Chains', 'Chains on', 'Left rear wheel', 'Right rear wheel', 'Lay the chain out: hold Space', 'Pull it over: Space in the green', 'Tension it: tap Space']) de(s);
  setLanguage('en');
});
