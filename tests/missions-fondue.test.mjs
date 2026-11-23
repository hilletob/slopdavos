import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { medalFor } from '../js/missions-progress.js';
import { createSledge, stepSledge, botInput, SLEDGE_CRASH_MS } from '../js/missions-data-sledge.js';
import { pointAt } from '../js/missions-data-snow.js';
import {
  FONDUE_MISSION, FONDUE_MISSIONS, FONDUE_START, KONGRESS_DOOR, SCHATZALP_ARRIVAL, FONDUE_TABLE, SCHLITTEL_RUN, schlittelCourse,
  STIR, createStir, stirPoint, stirLift, stirStep, stirGauge, fondueStir, lemniscate, circleStroke,
  chooseFlaemmli, flaemmliParams, createTipsy, tipsyInput, tipsyRoll, TIPSY, schlittelHeight, SCHLITTEL_START_S, SCHLITTEL_TRACK
} from '../js/missions-data-fondue.js';

// tests/missions-fondue.test.mjs
// The Drupal Mountain Camp's Fondue Night (js/missions-data-fondue.js is three.js-free): the places, the figure of
// eight told from circles and scribbles with strokes as a pointer would bring them, the Flämmli's choice, a bot down the
// Schatzalp's sled run on the real terrain with and without effect, the whole evening with synthetic frames, its German.

const DT = 1 / 120;
const inRing = (r, x, z) => {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > z) !== (r[j + 1] > z) && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c;
  return c;
};
const inBuilding = (x, z) => DAVOS_DATA.buildings.some((b) => Math.abs(b.ring[0] - x) < 200 && Math.abs(b.ring[1] - z) < 200 && inRing(b.ring, x, z));
const frame = (o = {}) => ({ mode: 'person', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: 1 / 60, t: 1000, ...o });
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
  assert.deepEqual(m.features, ['fondueNight']);
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
  assert.ok(c.bends.length >= 25, `${c.bends.length} bends`);
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

test('the Flämmli: one choice, and with effect the horns answer late and pull to a side', () => {
  const st = FONDUE_MISSION.createState();
  assert.equal(flaemmliParams(st.choice).track, SCHLITTEL_TRACK, 'the run\'s own track before the choice');
  assert.ok(chooseFlaemmli(st, true)); assert.equal(st.choice, 'tipsy');
  assert.ok(!chooseFlaemmli(st, false), 'chosen once'); assert.equal(st.choice, 'tipsy');
  const P = flaemmliParams('tipsy');
  const N = flaemmliParams('sober');
  assert.ok(P.on.maxSpeed > N.on.maxSpeed && P.track.tipG > N.track.tipG && P.on.drag < N.on.drag, 'bolder');
  assert.ok(N.track.netSlide && P.track.netSlide && N.track.half < 2.6, 'the narrow run of the bench');
  const a = createTipsy(), b = createTipsy();
  let first = null;
  for (let i = 0; i < 600; i++) {
    const x = tipsyInput({ steer: 1, tuck: 1, brake: i > 300 ? 1 : 0 }, DT, a), y = tipsyInput({ steer: 1, tuck: 1, brake: i > 300 ? 1 : 0 }, DT, b);
    first ??= x;
    assert.deepEqual(x, y, 'the same every time');
    assert.ok(x.steer >= -1 && x.steer <= 1 && x.brake >= 0 && x.brake <= 1);
  }
  assert.ok(first.steer < 0.2, 'late');
  const c = createTipsy();
  let drift = 0;
  for (let i = 0; i < 1200; i++) drift = Math.max(drift, Math.abs(tipsyInput({ steer: 0 }, DT, c).steer));
  assert.ok(drift > 0.05 && drift < 0.3, `${drift}`);
  assert.ok(Math.abs(tipsyRoll(1.7)) <= TIPSY.roll * 1.45);
});

test('a bot down the Schatzalp run on its bench: there without and with effect, on the keys too, faster with it', async () => {
  const { groundHeight, trodHeight } = await import('../js/terrain.js');
  const course = schlittelCourse();
  const height = schlittelHeight(trodHeight, groundHeight);
  // (the bench's gaps where the mapped ways join are bridged: no pit along the line)
  for (let s = 6; s < course.length; s += 2) {
    const a = pointAt(course.pts, s - 2), b = pointAt(course.pts, s);
    assert.ok(Math.abs(height(b.x, b.z) - height(a.x, a.z)) < 1, `a step at ${s} m`);
  }
  const ride = (choice, margin, keys = false) => {
    const sl = createSledge(course, height, SCHLITTEL_START_S), mem = createTipsy(), P = flaemmliParams(choice);
    let s = 0, n = 0, held = {};
    while (s < 400 && sl.proj.s < course.length - 3) {
      let input = sl.crashT > 0 ? {} : botInput(sl, course, { margin, tipG: P.track.tipG, maxSpeed: P.on.maxSpeed });
      // (on the keys: full lock or nothing, decided ten times a second)
      if (keys) { if (n++ % 12 === 0) held = { steer: Math.abs(input.steer || 0) > 0.3 ? Math.sign(input.steer) : 0, tuck: input.tuck ? 1 : 0, brake: input.brake ? 1 : 0 }; input = sl.crashT > 0 ? {} : held; }
      if (choice === 'tipsy') input = tipsyInput(input, DT, mem);
      stepSledge(sl, input, DT, height, course, P.track, P);
      s += DT;
    }
    return { ms: s * 1000 + sl.crashes * SLEDGE_CRASH_MS, there: sl.proj.s >= course.length - 3, crashes: sl.crashes };
  };
  const sober = ride('sober', 0.7), tipsy = ride('tipsy', 0.7);
  assert.ok(sober.there && tipsy.there, 'both at the finish');
  assert.equal(sober.crashes, 0); assert.equal(tipsy.crashes, 0);
  assert.ok(sober.ms > 160000 && sober.ms < 210000, `${sober.ms}`);
  assert.ok(tipsy.ms < sober.ms - 5000 && tipsy.ms > sober.ms - 25000, `with effect ${tipsy.ms}, without ${sober.ms}`);
  // nobody is held at a net or under the bench: every way of driving gets there
  for (const choice of ['sober', 'tipsy']) for (const margin of [0.6, 0.82]) for (const keys of [false, true]) assert.ok(ride(choice, margin, keys).there, `${choice} ${margin} ${keys ? 'keys' : ''}`);
  // (the evening before the ride: some 40 s)
  const m = FONDUE_MISSION.medals;
  assert.equal(medalFor(sober.ms + 40000, m), 'gold', 'a clean careful run without effect just makes gold');
  assert.equal(medalFor(ride('sober', 0.7, true).ms + 2 * SLEDGE_CRASH_MS + 40000, m), 'silver', 'on the keys with two crashes: silver');
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
  assert.ok(!step(3, at).done);
  chooseFlaemmli(st, true);
  assert.ok(step(3, at).done);
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
  assert.match(lines[1], /^Flämmli with effect · 0 crashes · top speed 0 km\/h$/);
});

test('the Fondue Night speaks German', async () => {
  globalThis.document ??= {
    readyState: 'loading', addEventListener() {}, documentElement: { lang: 'en' },
    body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } },
    querySelectorAll() { return []; }, createTreeWalker() { return { nextNode() { return false; } }; }
  };
  globalThis.Node ??= { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  globalThis.NodeFilter ??= { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.localStorage ??= { getItem() { return null; }, setItem() {} };
  globalThis.window ??= { dispatchEvent() {} };
  const { setLanguage, t } = await import('../js/i18n.js');
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
    const evening = (stir, choice, crashes, kmh) => m.summary({ ...m.createState(), stir: { ...createStir(), ...stir }, choice, crashes, topSpeed: kmh / 3.6 });
    const [clean, tipsy] = evening({ eights: 8 }, 'tipsy', 1, 84);
    says(clean, '8 figure eights · nothing caught', '8 Achten · nichts angebrannt');
    says(tipsy, 'Flämmli with effect · 1 crash (+5 s) · top speed 84 km/h', 'Flämmli mit Wirkung · 1 Sturz (+5 s) · Höchsttempo 84 km/h');
    const [caught, sober] = evening({ eights: 8, strikes: 1, circles: 3 }, 'sober', 0, 79);
    says(caught, '8 figure eights · caught on the bottom 1× (+8 s) · 3 circles', '8 Achten · 1× angebrannt (+8 s) · 3-mal im Kreis gerührt');
    says(sober, 'Flämmli without effect · 0 crashes · top speed 79 km/h', 'Flämmli ohne Wirkung · 0 Stürze · Höchsttempo 79 km/h');
    // every line the panel can show at the table
    const st = m.createState();
    for (const last of [null, 'eight', 'circle', 'splash', 'slow', 'burnt']) { st.stir.last = last; const h = stirGauge(st.stir).hint; assert.notEqual(t(h), h, h); }
    const here = frame({ x: FONDUE_TABLE.x, z: FONDUE_TABLE.z });
    for (const i of [0, 1, 3, 4]) { const v = m.objectives[i].check(here, st); for (const s of [v.text, v.hint]) if (s) assert.notEqual(t(s), s, s); }
    st.riding = true;
    const v = m.objectives[4].check(frame({ x: st.cps[0].x, z: st.cps[0].z + 40 }), st);
    assert.notEqual(t(v.hint), v.hint, v.hint);
    for (const s of ['Smooth!', 'It splits: cross the middle!', 'Too wild!', 'Too slow!', `Caught! +${STIR.burnMs / 1000} s`, 'With effect', 'Without effect', 'creamy', 'catching', 'The valley sways: steer early!', 'A Flämmli with effect. To the sledges!', 'A Flämmli without effect. To the sledges!']) assert.notEqual(t(s), s, s);
  } finally { setLanguage('en'); }
});
