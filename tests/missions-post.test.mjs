import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  POST, POST_OFFICE, POST_BOXES, POST_ROUTE, POST_MISSION, POST_MISSIONS, emptyS, createPostBoxes, nearestBox, stepPost, nextBox
} from '../js/missions-data-post.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { lonLatToWorld } from '../js/davos-frame.js';

// (js/missions-data-post.js is three.js-free: the boxes, the hold and a bot over the round run on synthetic frames)

const DT = 1 / 20;
const frame = (over = {}) => ({ mode: 'car', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: DT, t: 0, ...over });
const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const segDist = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};
const routeDist = (x, z) => { let d = Infinity; for (let i = 2; i < POST_ROUTE.length; i += 2) d = Math.min(d, segDist(x, z, POST_ROUTE[i - 2], POST_ROUTE[i - 1], POST_ROUTE[i], POST_ROUTE[i + 1])); return d; };
const DRIVE = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street']);

test('the postman: one mission, all year at midday, in the yellow van, its features and its pin', () => {
  assert.deepEqual(POST_MISSIONS.map((m) => m.id), ['post-boxes']);
  assert.ok(MISSIONS.includes(POST_MISSION));
  assert.equal(getMission('post-boxes'), POST_MISSION);
  assert.equal(POST_MISSION.season, null);
  assert.equal(POST_MISSION.time, 'midday');
  assert.equal(POST_MISSION.mode, 'car');
  assert.deepEqual(POST_MISSION.features, ['workVehicle', 'postRound']);
  assert.equal(POST_MISSION.vehicle, 'postVan');
  const rt = readFileSync(new URL('../js/missions-post.js', import.meta.url), 'utf8');
  assert.match(rt, /VEHICLES\.postVan = buildPostVan/);
  assert.match(rt, /POST_FEATURES = \{ postRound \}/);
  assert.match(readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8'), /case 'postbox'/);
  assert.match(readFileSync(new URL('../js/missions.js', import.meta.url), 'utf8'), /Object\.assign\(FEATURES, POST_FEATURES\)/);
  const m = POST_MISSION.medals;
  assert.ok(m.gold < m.silver && m.silver < m.bronze && m.bronze < POST.timeLimitMs);
  assert.equal(POST_MISSION.bonusMs, m.gold);
  const s = POST_MISSION.start;
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.heading));
  const state = POST_MISSION.createState();
  for (const o of POST_MISSION.objectives) {
    const v = o.check(frame({ x: s.x, z: s.z, heading: s.heading }), state);
    assert.equal(typeof v.done, 'boolean');
    assert.equal(typeof v.text, 'string');
    assert.equal(v.done, false);
  }
  assert.equal(POST_MISSION.summary(state).length, 1);
});

test('eight real post boxes (OSM), on the pavement by their streets, none in a house, each in reach of the round', () => {
  assert.equal(POST_BOXES.length, 8);
  assert.equal(new Set(POST_BOXES.map((b) => b.id)).size, 8);
  for (const b of POST_BOXES) {
    assert.match(b.id, /^n\d+$/);
    assert.ok(b.letters >= 30 && b.letters <= 200, b.where);
    assert.match(b.times, /^Mo–Fr \d\d:\d\d/);
    assert.ok(Number.isFinite(b.yaw));
    // in no building of the map (the wall-mounted ones stand on a pillar in front of their wall)
    assert.ok(!DAVOS_DATA.buildings.some((h) => Math.abs(h.ring[0] - b.x) < 200 && Math.abs(h.ring[1] - b.z) < 200 && inRing(h.ring, b.x, b.z)), b.where);
    // off the carriageway of every road, yet within the postman's reach of the van on the round
    for (const r of DAVOS_DATA.roads) {
      if (!DRIVE.has(r.kind) || r.tunnel || r.bridge) continue;
      for (let i = 2; i < r.pts.length; i += 2) assert.ok(segDist(b.x, b.z, r.pts[i - 2], r.pts[i - 1], r.pts[i], r.pts[i + 1]) >= r.width / 2 + 0.3, `${b.where} on ${r.name || r.id}`);
    }
    assert.ok(routeDist(b.x, b.z) <= POST.reach - 0.5, `${b.where} ${routeDist(b.x, b.z).toFixed(1)}`);
    // the front towards the round: the route lies ahead of the box, not behind it
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    assert.ok(routeDist(b.x + fx * 3, b.z + fz * 3) < routeDist(b.x - fx * 3, b.z - fz * 3), `${b.where} faces away`);
  }
  // the post office: OSM's node at the Talstrasse 5, the yard by it on the round's end
  const po = lonLatToWorld(9.8205711, 46.7920821); // (OSM n13893141571)
  assert.ok(Math.hypot(POST_OFFICE.x - po.x, POST_OFFICE.z - po.z) < 15);
  // two boxes by their OSM nodes (n13528933580 on the Dischmastrasse, n2134212916 at the post office)
  for (const [i, lon, lat] of [[0, 9.8418425, 46.8022459], [7, 9.8205988, 46.7920496]]) {
    const p = lonLatToWorld(lon, lat);
    assert.ok(Math.hypot(POST_BOXES[i].x - p.x, POST_BOXES[i].z - p.z) < 1, POST_BOXES[i].where);
  }
  assert.ok(Math.hypot(POST_ROUTE.at(-2) - POST_OFFICE.x, POST_ROUTE.at(-1) - POST_OFFICE.z) < POST_OFFICE.r);
  // the start on the Dischmastrasse, facing down it towards the first box
  const s = POST_MISSION.start;
  assert.ok(Math.hypot(s.x - POST_ROUTE[0], s.z - POST_ROUTE[1]) < 0.01);
  const dischma = DAVOS_DATA.roads.filter((r) => r.name === 'Dischmastrasse');
  assert.ok(dischma.some((r) => { for (let i = 2; i < r.pts.length; i += 2) if (segDist(s.x, s.z, r.pts[i - 2], r.pts[i - 1], r.pts[i], r.pts[i + 1]) < r.width / 2) return true; return false; }));
  const b0 = POST_BOXES[0];
  assert.ok(Math.abs(Math.atan2(b0.x - s.x, b0.z - s.z) - s.heading) < 0.1);
});

test('a box empties only while the van stands by it with the key held; the progress is kept', () => {
  const state = POST_MISSION.createState();
  const b = state.boxes[2];
  const van = { x: b.x + 6, z: b.z, speed: 5 };
  assert.equal(nearestBox(state.boxes, van.x, van.z), b);
  assert.equal(nearestBox(state.boxes, b.x + POST.reach + 1, b.z), null);
  // driving past with the key held: nothing
  for (let i = 0; i < 100; i++) assert.equal(stepPost(state, van, true, DT), null);
  assert.equal(b.t, 0);
  assert.equal(state.near, b);
  // standing, no key: nothing
  van.speed = 0;
  for (let i = 0; i < 100; i++) stepPost(state, van, false, DT);
  assert.equal(b.t, 0);
  // half the time held, let go, then the rest
  const need = emptyS(b);
  assert.ok(need > 1.5 && need < 4, `${need}`);
  for (let t = 0; t < need / 2; t += DT) stepPost(state, van, true, DT);
  assert.ok(!b.done && b.t > 0);
  stepPost(state, van, false, DT);
  assert.ok(b.t > 0, 'the progress is kept');
  let ev = null;
  for (let t = 0; t < need && !ev; t += DT) ev = stepPost(state, van, true, DT);
  assert.equal(ev, 'emptied');
  assert.ok(b.done);
  assert.equal(state.emptied, 1);
  assert.equal(state.letters, b.letters);
  assert.equal(nearestBox(state.boxes, van.x, van.z), null);
  assert.equal(nextBox(state.boxes), state.boxes[0]);
});

/**
 * The bot: drives POST_ROUTE (50 km/h on the straights, the bends at 3 m/s² lateral, 2.5 m/s² away, 3.5 m/s² braking),
 * stops by each box of `boxes` (indices) and holds the key, then hands the mail in; the mission's own objectives judge it
 */
function runBot(boxes = POST_BOXES.map((_, i) => i)) {
  const S = [];
  for (let i = 2; i < POST_ROUTE.length; i += 2) {
    const ax = POST_ROUTE[i - 2], az = POST_ROUTE[i - 1], bx = POST_ROUTE[i], bz = POST_ROUTE[i + 1], L = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s < L; s += 1) S.push([ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L]);
  }
  S.push([POST_ROUTE.at(-2), POST_ROUTE.at(-1)]);
  const N = S.length;
  // the stops: for each box in turn, the sample after the last stop nearest to it
  const stops = [];
  let from = 0;
  for (const k of boxes) {
    const b = POST_BOXES[k];
    let best = from, bd = Infinity;
    for (let i = from; i < N; i++) { const d = Math.hypot(S[i][0] - b.x, S[i][1] - b.z); if (d < bd) { bd = d; best = i; } if (bd < POST.reach && d > bd + 40) break; }
    stops.push(best); from = best;
  }
  const lim = new Array(N).fill(13.9);
  for (let i = 3; i < N - 3; i++) {
    const [ax, az] = S[i - 3], [bx, bz] = S[i], [cx, cz] = S[i + 3];
    const area = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
    const R = area > 1e-6 ? (Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(cx - ax, cz - az)) / (4 * area) : 1e9;
    lim[i] = Math.min(lim[i], Math.sqrt(3 * R));
  }
  for (const i of stops) lim[i] = 0;
  lim[0] = 0; lim[N - 1] = 0;
  for (let i = N - 2; i >= 0; i--) lim[i] = Math.min(lim[i], Math.sqrt(lim[i + 1] ** 2 + 2 * 3.5));
  for (let i = 1; i < N; i++) lim[i] = Math.min(lim[i], Math.sqrt(lim[i - 1] ** 2 + 2 * 2.5));
  const M = POST_MISSION, state = M.createState();
  let t = 0, objective = 0;
  const step = (i, hold, dt) => {
    const [x, z] = S[i];
    const ctx = frame({ x, z, speed: lim[i], dt, t: t * 1000 });
    const ev = stepPost(state, { x, z, speed: lim[i] }, hold, dt);
    M.update(ctx, state);
    if (objective < M.objectives.length) {
      const view = M.objectives[objective].check(ctx, state);
      assert.ok(!view.fail, view.fail);
      if (view.done) objective++;
    }
    t += dt;
    return ev;
  };
  for (let i = 0; i < N - 1; i++) {
    // standing by a box: the key held until it is empty
    if (stops.includes(i)) for (let k = 0; k < 400 && step(i, true, DT) !== 'emptied'; k++);
    step(i + 1, false, 2 / (lim[i] + lim[i + 1]));
  }
  // at the post office: standing until the mail is handed in
  for (let k = 0; k < 400 && objective < M.objectives.length; k++) step(N - 1, stops.includes(N - 1), DT);
  const finished = () => objective >= M.objectives.length;
  assert.ok(finished(), 'the bot finished the round');
  return { t: t * 1000 + state.penaltyMs, state };
}

test('a bot run: all eight boxes, the hand-over, the time well inside gold; a box left out costs 45 s', () => {
  const full = runBot();
  assert.equal(full.state.emptied, 8);
  assert.equal(full.state.missed, 0);
  assert.equal(full.state.letters, POST_BOXES.reduce((n, b) => n + b.letters, 0));
  assert.ok(full.t > POST_MISSION.medals.gold * 0.8 && full.t < POST_MISSION.medals.gold, `${(full.t / 1000).toFixed(0)} s`);
  assert.equal(medalFor(full.t, POST_MISSION.medals), 'gold');
  assert.match(POST_MISSION.summary(full.state)[0], /^8 of 8 post boxes emptied · \d+ letters$/);
  // the Richtstattweg's box left out: the round ends at the post office with it missing
  const skip = runBot([0, 1, 2, 4, 5, 6, 7]);
  assert.equal(skip.state.emptied, 7);
  assert.equal(skip.state.missed, 1);
  assert.equal(skip.state.penaltyMs, POST.missMs);
  assert.match(POST_MISSION.summary(skip.state)[0], / · 1 left out \(\+45 s\)$/);
});

test('the noon dispatch: too late and the run fails', () => {
  const state = POST_MISSION.createState();
  const v = POST_MISSION.objectives[0].check(frame({ t: POST.timeLimitMs + 1 }), state);
  assert.ok(v.fail);
  assert.equal(createPostBoxes().every((b) => !b.done && b.t === 0), true);
});

test('the postman\'s texts in German', async () => {
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
  const M = POST_MISSION;
  for (const s of [M.title, M.intro, M.finish, ...M.objectives.map((o) => o.title)]) assert.notEqual(t(s), s, s);
  for (const s of ['Back into the van', 'Hold Space to empty the box', 'Stop by the post box', 'Stand still while the sacks go in', 'Empty', 'Post van',
    'The noon dispatch has left: the letters stay in Davos until tomorrow.']) assert.notEqual(t(s), s, s);
  assert.equal(t('Emptied 3/8 · 204 letters · next 1.2 km'), 'Geleert 3/8 · 204 Briefe · nächster 1,2 km');
  assert.equal(t('Emptied 8/8 · 868 letters'), 'Geleert 8/8 · 868 Briefe');
  assert.equal(t('Emptied 4/8'), 'Geleert 4/8');
  assert.equal(t('Emptying … 40 %'), 'Leeren … 40 %');
  assert.equal(t('1 box left out (+45 s)'), '1 Briefkasten ausgelassen (+45 s)');
  assert.equal(t('2 boxes left out (+90 s)'), '2 Briefkästen ausgelassen (+90 s)');
  assert.equal(t('Handing over … 75 %'), 'Übergabe … 75 %'); // (the delivery missions' rule)
  assert.equal(t('To the post office · 340 m'), 'Zur Poststelle · 340 m');
  assert.equal(t('7 of 8 post boxes emptied · 820 letters · 1 left out (+45 s)'), '7 von 8 Briefkästen geleert · 820 Briefe · 1 ausgelassen (+45 s)');
  setLanguage('en');
});
