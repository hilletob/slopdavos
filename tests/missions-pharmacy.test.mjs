import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PHARMACY, DELIVERY, PARCELS, PHARMACY_MISSION, PHARMACY_MISSIONS, parcelById,
  createDelivery, knockFragile, stepRide, doorAt, stepHandover, stepCold, nextParcel
} from '../js/missions-data-pharmacy.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { missionMedals } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { SHOPS_DATA } from '../js/shops-data.js';

// (js/missions-data-pharmacy.js is three.js-free: the round, the bumps and a bot riding it run on synthetic frames here)

const frame = (over = {}) => ({ mode: 'cargobike', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: 1 / 30, t: 0, ...over });
const DT = 1 / 30;
const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const near = (b, x, z, r) => Math.abs(b.ring[0] - x) < r && Math.abs(b.ring[1] - z) < r;
const inBuilding = (x, z) => DAVOS_DATA.buildings.find((b) => near(b, x, z, 200) && inRing(b.ring, x, z)) || null;
const roadDistance = (x, z) => {
  let m = Infinity;
  for (const r of DAVOS_DATA.roads) {
    if (r.tunnel || !['residential', 'secondary', 'tertiary', 'unclassified', 'service'].includes(r.kind)) continue;
    const p = r.pts;
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2], az = p[i - 1], dx = p[i] - ax, dz = p[i + 1] - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      m = Math.min(m, Math.hypot(ax + dx * t - x, az + dz * t - z));
    }
  }
  return m;
};

test('the medicine round is registered, complete, by cargo bike, its medals in order', () => {
  assert.deepEqual(PHARMACY_MISSIONS.map((m) => m.id), ['pharmacy-cargo-bike']);
  const m = PHARMACY_MISSION;
  assert.equal(getMission(m.id), m);
  assert.ok(MISSIONS.includes(m));
  assert.equal(m.mode, 'cargobike');
  assert.equal(m.season, null); // (all year)
  assert.equal(m.time, 'morning');
  assert.deepEqual(m.features, ['pharmacyRound']);
  assert.ok(m.icon && /^#[0-9a-f]{6}$/i.test(m.colour));
  const med = missionMedals(m);
  assert.ok(med.gold < med.silver && med.silver < med.bronze);
  assert.equal(m.medals.gold, m.bonusMs);
  assert.equal(m.objectives.length, 3);
});

test('the pharmacy is the Amavita at the Bahnhofstrasse in Davos Dorf, the start in front of it on the street', () => {
  const shop = SHOPS_DATA.find((s) => s.osm === PHARMACY.shop.osm);
  assert.ok(shop, 'the shop is in js/shops-data.js');
  assert.equal(shop.name, 'Amavita');
  assert.equal(shop.kind, 'pharmacy');
  assert.deepEqual([shop.x, shop.z], [PHARMACY.shop.x, PHARMACY.shop.z]);
  for (const p of [PHARMACY.start, PHARMACY.door]) {
    assert.equal(inBuilding(p.x, p.z), null);
    assert.ok(roadDistance(p.x, p.z) < 4, 'on the Bahnhofstrasse');
  }
  assert.ok(Math.hypot(PHARMACY.door.x - shop.x, PHARMACY.door.z - shop.z) < 12, 'the ring in front of the shop');
  assert.ok(Math.hypot(PHARMACY.start.x - PHARMACY.door.x, PHARMACY.start.z - PHARMACY.door.z) < PHARMACY.door.r, 'the round starts in the ring');
});

test('six parcels to six real houses round Davos Dorf, their doors on the street in front of them', () => {
  assert.equal(PARCELS.length, 6);
  assert.equal(new Set(PARCELS.map((p) => p.id)).size, 6);
  assert.equal(new Set(PARCELS.map((p) => p.address)).size, 6);
  assert.deepEqual(PARCELS.map((p) => p.kind).sort(), ['cold', 'fragile', 'fragile', 'normal', 'normal', 'normal']);
  assert.equal(PARCELS[0].kind, 'cold', 'the insulin goes first');
  for (const p of PARCELS) {
    // the house: an OSM footprint of the geodata whose ring holds its centre
    const b = DAVOS_DATA.buildings.find((q) => q.id === p.osm);
    assert.ok(b, `${p.address}: building ${p.osm}`);
    assert.ok(inRing(b.ring, p.house.x, p.house.z), `${p.address}: the centre in its footprint`);
    // the door: out of every building, on the street, near its house, in Davos Dorf
    assert.equal(inBuilding(p.door.x, p.door.z), null, `${p.address}: the door is outside`);
    assert.ok(roadDistance(p.door.x, p.door.z) < 4.5, `${p.address}: the door on the street`);
    const d = Math.hypot(p.door.x - p.house.x, p.door.z - p.house.z);
    assert.ok(d > 5 && d < 30, `${p.address}: ${d.toFixed(1)} m from the house`);
    assert.ok(Math.hypot(p.door.x - PHARMACY.door.x, p.door.z - PHARMACY.door.z) < 600, `${p.address}: in the village`);
    assert.ok(Math.abs(p.face - Math.atan2(p.house.x - p.door.x, p.house.z - p.door.z)) < 1e-9);
    assert.equal(parcelById(p.id), p);
  }
  // (no two rings overlap: a stop hands over one parcel)
  for (const a of PARCELS) for (const b of PARCELS) if (a !== b) assert.ok(Math.hypot(a.door.x - b.door.x, a.door.z - b.door.z) > a.door.r + b.door.r);
});

test('a parcel is handed over standing in its ring for 1.5 s, on the cargo bike only', () => {
  const st = createDelivery();
  const p = parcelById('tablets');
  const at = { x: p.door.x + 2, z: p.door.z };
  // riding through: nothing
  for (let t = 0; t < 3; t += DT) assert.equal(stepHandover(st, frame({ ...at, speed: 4, dt: DT })), null);
  // on foot (no such thing on this bike, but): nothing
  for (let t = 0; t < 3; t += DT) assert.equal(stepHandover(st, frame({ ...at, mode: 'person', dt: DT })), null);
  assert.equal(doorAt(st, at.x, at.z).id, 'tablets');
  assert.equal(doorAt(st, at.x + 10, at.z), null);
  let got = null, t = 0;
  for (; t < 3 && !got; t += DT) got = stepHandover(st, frame({ ...at, dt: DT, t: 60000 }));
  assert.equal(got.id, 'tablets');
  assert.ok(Math.abs(t - DELIVERY.handS) < 0.1, `handed over after ${t.toFixed(2)} s`);
  assert.equal(st.delivered, 1);
  assert.equal(st.parcels.find((s) => s.id === 'tablets').at, 60000);
  assert.deepEqual(st.events.at(-1), { type: 'delivered', id: 'tablets', condition: null, broken: false });
  // once delivered the ring is empty
  assert.equal(doorAt(st, at.x, at.z), null);
  // moving off resets a handover begun
  const q = parcelById('inhaler');
  stepHandover(st, frame({ x: q.door.x, z: q.door.z, dt: 1 }));
  assert.equal(st.hand.t, 1);
  stepHandover(st, frame({ x: q.door.x, z: q.door.z, speed: 3, dt: DT }));
  assert.equal(st.hand.t, 0);
});

test('the insulin is cold for 1:30: late, it costs 45 s once', () => {
  const st = createDelivery();
  assert.equal(stepCold(st, frame({ t: DELIVERY.coldMs - 1 })), false);
  assert.equal(stepCold(st, frame({ t: DELIVERY.coldMs + 1 })), true);
  assert.equal(stepCold(st, frame({ t: DELIVERY.coldMs + 5000 })), false, 'once');
  assert.equal(st.penaltyMs, DELIVERY.warmPenaltyMs);
  assert.ok(st.warm);
  // delivered in time: never warm
  const ok = createDelivery();
  const p = PARCELS[0];
  for (let t = 0; t < 2; t += DT) stepHandover(ok, frame({ x: p.door.x, z: p.door.z, dt: DT, t: 40000 }));
  assert.equal(ok.insulinMs, 40000);
  assert.equal(stepCold(ok, frame({ t: 200000 })), false);
  assert.equal(ok.penaltyMs, 0);
});

test('a kerb at speed knocks the glass, a slope does not; slowly it is harmless; a crash knocks harder', () => {
  // a 10 % slope at 8 m/s: no bump
  const st = createDelivery();
  let x = 0, y = 0;
  for (let i = 0; i < 300; i++) { x += 8 * DT; y = x * 0.1; stepRide(st, frame({ x, y, speed: 8, dt: DT })); }
  assert.equal(st.bumps, 0);
  // the slope changing (0 → 12 %) at 8 m/s: no bump either
  for (let i = 0; i < 60; i++) { x += 8 * DT; y += (i < 30 ? 0 : 0.12) * 8 * DT; stepRide(st, frame({ x, y, speed: 8, dt: DT })); }
  assert.equal(st.bumps, 0);
  // the start of a steep ramp (0 → 55 %, the slope lifting by 15 cm a frame) at 8 m/s: no bump either
  for (let i = 0; i < 60; i++) { x += 8 * DT; y += (i < 30 ? 0.12 : 0.55) * 8 * DT; assert.equal(stepRide(st, frame({ x, y, speed: 8, dt: DT })), null); }
  for (let i = 0; i < 30; i++) { x += 8 * DT; y += 0.12 * 8 * DT; stepRide(st, frame({ x, y, speed: 8, dt: DT })); }
  assert.equal(st.bumps, 0);
  // up a 5 cm kerb at 7 m/s: a bump (known a frame later, back on the old slope), both glass parcels knocked
  x += 7 * DT; y += 0.12 * 7 * DT + 0.05;
  assert.equal(stepRide(st, frame({ x, y, speed: 7, dt: DT })), null);
  x += 7 * DT; y += 0.12 * 7 * DT;
  assert.equal(stepRide(st, frame({ x, y, speed: 7, dt: DT })), 'bump');
  const glass = st.parcels.filter((p) => p.kind === 'fragile');
  assert.ok(glass.every((p) => p.condition < 1 && p.condition > 0.7), glass.map((p) => p.condition).join());
  assert.equal(st.events.at(-1).type, 'bump');
  // the frame after the kerb is no second bump
  x += 7 * DT; y += 0.12 * 7 * DT;
  assert.equal(stepRide(st, frame({ x, y, speed: 7, dt: DT })), null);
  // off an 11 cm sidewalk edge slowly (braked to 2 m/s): harmless
  for (let v = 7; v > 2; v -= 5 * DT) { x += v * DT; y += 0.12 * v * DT; stepRide(st, frame({ x, y, speed: v, dt: DT })); }
  for (let i = 0; i < 30; i++) { x += 2 * DT; stepRide(st, frame({ x, y, speed: 2, dt: DT })); }
  x += 2 * DT; y -= 0.11;
  assert.equal(stepRide(st, frame({ x, y, speed: 2, dt: DT })), null);
  assert.equal(st.bumps, 1);
  assert.equal(st.crashes, 0);
  // a wall: the speed from 8 to 1.6 m/s in a frame
  const before = glass[0].condition;
  for (let i = 0; i < 10; i++) { x += 8 * DT; stepRide(st, frame({ x, y, speed: 8, dt: DT })); }
  assert.equal(stepRide(st, frame({ x, y, speed: 1.6, dt: DT })), 'crash');
  assert.equal(st.crashes, 1);
  assert.ok(before - glass[0].condition >= 0.4, 'a crash costs more than a kerb');
  // braking hard is no crash
  const b = createDelivery();
  let v = 10, bx = 0;
  stepRide(b, frame({ speed: v }));
  while (v > 0) { v = Math.max(0, v - 7.5 * DT); bx += v * DT; assert.equal(stepRide(b, frame({ x: bx, speed: v, dt: DT })), null); }
  // a jump (a teleport) is no bump
  stepRide(b, frame({ x: bx + 50, y: 3, speed: 5, dt: DT }));
  assert.equal(b.bumps, 0);
  // and the bike only: on foot nothing is tracked
  assert.equal(stepRide(b, frame({ mode: 'person', x: 0, y: 9, speed: 5 })), null);
  assert.equal(b.ride, null);
});

test('enough knocks break the glass: +30 s each, the delivered and the broken ones are not knocked again', () => {
  const st = createDelivery();
  const eyedrops = st.parcels.find((p) => p.id === 'eyedrops');
  eyedrops.delivered = true;
  let broke = [];
  for (let i = 0; i < 10 && !broke.length; i++) broke = knockFragile(st, 0.3, 'bump');
  assert.deepEqual(broke, ['syrup']);
  assert.equal(st.broken, 1);
  assert.equal(st.penaltyMs, DELIVERY.brokenPenaltyMs);
  assert.equal(eyedrops.condition, 1, 'delivered: out of harm');
  assert.deepEqual(knockFragile(st, 1, 'crash'), [], 'nothing left to break');
  assert.ok(st.events.some((e) => e.type === 'broken' && e.id === 'syrup'));
});

test('the objectives: the insulin first, the others in any order (the nearest pointed to), back to the pharmacy', () => {
  const m = PHARMACY_MISSION;
  const st = m.createState();
  const [insulin, deliver, back] = m.objectives;
  let v = insulin.check(frame({ ...PHARMACY.start, t: 30000 }), st);
  assert.equal(v.done, false);
  assert.match(v.text, /^Insulin cold for 1:00 · \d+ m to Mühlestrasse 10$/);
  assert.deepEqual([v.target.x, v.target.z], [PARCELS[0].door.x, PARCELS[0].door.z]);
  st.warm = true;
  assert.match(insulin.check(frame({ t: 100000 }), st).text, /^The insulin is warm \(\+45 s\) · /);
  st.warm = false;
  v = deliver.check(frame({ x: 900, z: -1440 }), st);
  assert.match(v.text, /^Delivered 0\/6 · next Mühlestrasse 3, \d+ m$/);
  assert.equal(nextParcel(st, 660, -1660).parcel.id, 'dressings');
  st.parcels.find((p) => p.id === 'syrup').condition = 0.62;
  assert.match(deliver.check(frame({ x: 900, z: -1440 }), st).text, / · fragile 62 %$/);
  for (const p of st.parcels) p.delivered = true;
  st.delivered = 6;
  assert.equal(deliver.check(frame(), st).done, true);
  v = back.check(frame({ x: PHARMACY.door.x + 20, z: PHARMACY.door.z }), st);
  assert.equal(v.done, false);
  assert.equal(v.text, 'Crate empty · 20 m to the pharmacy');
  assert.equal(v.target.style, 'pad');
  assert.equal(back.check(frame({ x: PHARMACY.door.x, z: PHARMACY.door.z, speed: 3 }), st).done, false, 'stop first');
  assert.equal(back.check(frame({ x: PHARMACY.door.x, z: PHARMACY.door.z }), st).done, true);
  assert.equal(m.summary(st).length, 2);
});

test('a bot rides the round in straight lines at 8 m/s: insulin in time, everything delivered, inside the gold time', () => {
  const m = PHARMACY_MISSION;
  const st = m.createState();
  const order = ['insulin', 'tablets', 'inhaler', 'syrup', 'dressings', 'eyedrops'].map(parcelById);
  const legs = [...order.map((p) => p.door), PHARMACY.door];
  let x = PHARMACY.start.x, z = PHARMACY.start.z, t = 0, k = 0, idx = 0, speed = 0;
  const S = 8, A = 5;
  while (idx < m.objectives.length && t < 900000) {
    const goal = legs[Math.min(k, legs.length - 1)];
    const d = Math.hypot(goal.x - x, goal.z - z);
    // ride to the ring's middle, brake into it, stand
    const want = d < 1 ? 0 : Math.min(S, Math.sqrt(2 * A * Math.max(0, d - 1)));
    speed = want > speed ? Math.min(want, speed + A * DT) : want;
    if (d > 0.01) { const step = Math.min(d, speed * DT); x += ((goal.x - x) / d) * step; z += ((goal.z - z) / d) * step; }
    t += DT * 1000;
    const ctx = frame({ x, z, y: 0, speed, dt: DT, t });
    m.update(ctx, st);
    while (idx < m.objectives.length && m.objectives[idx].check(ctx, st).done) idx++;
    if (k < order.length && st.parcels.find((s) => s.id === order[k].id).delivered) k++;
  }
  assert.equal(idx, 3, 'finished');
  assert.equal(st.delivered, 6);
  assert.equal(st.warm, false);
  assert.ok(st.insulinMs < DELIVERY.coldMs * 0.6, `the insulin after ${st.insulinMs} ms`);
  assert.equal(st.bumps + st.crashes + st.broken, 0);
  // (as the crow flies, ~1.5 km: the streets make it ~2.3 km; the gold time leaves the streets' detours room)
  assert.ok(t < m.medals.gold * 0.7, `${Math.round(t / 1000)} s`);
  assert.ok(t > m.medals.gold * 0.4, `${Math.round(t / 1000)} s: gold is not a stroll`);
});

test('the medicine round\'s texts in German', async () => {
  globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  globalThis.NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.document ??= {
    readyState: 'loading', addEventListener() {}, documentElement: { lang: 'en' },
    body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } },
    querySelectorAll() { return []; }, createTreeWalker() { return { nextNode() { return false; } }; }
  };
  globalThis.localStorage ??= { getItem() { return null; }, setItem() {} };
  globalThis.window ??= { dispatchEvent() {} };
  const { setLanguage, t } = await import('../js/i18n.js');
  setLanguage('de');
  const M = PHARMACY_MISSION;
  for (const s of [M.title, M.intro, M.finish, ...M.objectives.map((o) => o.title), ...PARCELS.map((p) => p.content)]) assert.notEqual(t(s), s, s);
  for (const s of ['Back onto the cargo bike', 'Stop at the door to hand the parcel over', 'Glass aboard: slow down over kerbs', 'Stop in front of the pharmacy', 'The insulin is warm: +45 s']) assert.notEqual(t(s), s, s);
  assert.equal(t('Insulin cold for 1:02 · 240 m to Mühlestrasse 10'), 'Insulin noch 1:02 kalt · 240 m bis Mühlestrasse 10');
  assert.equal(t('The insulin is warm (+45 s) · 1.1 km to Mühlestrasse 10'), 'Das Insulin ist warm (+45 s) · 1,1 km bis Mühlestrasse 10');
  assert.equal(t('Delivered 2/6 · next Palüdastrasse 8, 240 m'), 'Abgegeben 2/6 · nächste: Palüdastrasse 8, 240 m');
  assert.equal(t('Delivered 2/6 · next Palüdastrasse 8, 1.2 km · fragile 62 %'), 'Abgegeben 2/6 · nächste: Palüdastrasse 8, 1,2 km · zerbrechlich 62 %');
  assert.equal(t('Delivered 6/6'), 'Abgegeben 6/6');
  assert.equal(t('Crate empty · 120 m to the pharmacy'), 'Kiste leer · 120 m bis zur Apotheke');
  assert.equal(t('Handing over … 40 %'), 'Übergabe … 40 %');
  assert.equal(t('Delivered: Insulin (cool box)'), 'Abgegeben: Insulin (Kühlbox)');
  assert.equal(t('Eye drops (glass) broken: +30 s'), 'Augentropfen (Glas) kaputt: +30 s');
  assert.equal(t('Bump! The glass at 70 %'), 'Rumms! Das Glas noch bei 70 %');
  assert.equal(t('Crash! The glass at 20 %'), 'Unfall! Das Glas noch bei 20 %');
  const st = createDelivery();
  st.delivered = 6; st.insulinMs = 48000; st.bumps = 1; st.crashes = 0;
  assert.deepEqual(M.summary(st).map(t), ['6 von 6 Paketen abgegeben · Insulin nach 0:48', '1 Rumms · 0 Unfälle · das Glas kam ganz an']);
  st.warm = true; st.bumps = 3; st.crashes = 1; st.broken = 1;
  assert.deepEqual(M.summary(st).map(t), ['6 von 6 Paketen abgegeben · Insulin nach 0:48 (warm, +45 s)', '3 Rummse · 1 Unfall · 1 kaputt (+30 s)']);
  setLanguage('en');
});
