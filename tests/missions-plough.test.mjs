import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  PLOUGH, PLOUGH_MISSION, PLOUGH_MISSIONS, PLOUGH_ZONES, PLOUGH_JOINTS, PLOUGH_JUNCTIONS, WOLFGANG_ROAD,
  createPloughRoute, createPloughGrid, resetPloughGrid, createPoles, laneShare, stepPlough, poleHits, jointCrossed,
  buriedJunction, boxesOverlap, roadPose, zoneAt, bladeGeometry
} from '../js/missions-data-plough.js';
import { routePoint } from '../js/missions-data-work.js';
import { MISSIONS, getMission } from '../js/missions-data.js';
import { medalFor } from '../js/missions-progress.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

// (js/missions-data-plough.js is three.js-free: the snow map, the blade, the poles and a bot run on synthetic frames)

const DT = 1 / 30;
const frame = (over = {}) => ({ mode: 'car', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: DT, t: 0, ...over });
const volume = (g) => { let v = 0; for (const h of g.h) v += h; return v * g.cs * g.cd; };
const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };

test('the plough: one mission, in winter before dawn, its features, its vehicle and its pin', () => {
  assert.deepEqual(PLOUGH_MISSIONS.map((m) => m.id), ['wolfgang-plough']);
  assert.ok(MISSIONS.includes(PLOUGH_MISSION));
  assert.equal(getMission('wolfgang-plough'), PLOUGH_MISSION);
  assert.equal(PLOUGH_MISSION.season, 'winter');
  assert.equal(PLOUGH_MISSION.time, 'predawn');
  assert.equal(PLOUGH_MISSION.mode, 'car');
  assert.deepEqual(PLOUGH_MISSION.features, ['workVehicle', 'plough']);
  assert.equal(PLOUGH_MISSION.vehicle, 'plough');
  const rt = readFileSync(new URL('../js/missions-plough.js', import.meta.url), 'utf8');
  assert.match(rt, /VEHICLES\.plough = buildPloughModel/);
  assert.match(rt, /PLOUGH_FEATURES = \{ plough \}/);
  assert.match(readFileSync(new URL('../js/missions-world.js', import.meta.url), 'utf8'), /case 'plough'/);
  const m = PLOUGH_MISSION.medals;
  assert.ok(m.gold < m.silver && m.silver < m.bronze && m.bronze < PLOUGH.timeLimitMs);
  assert.equal(PLOUGH_MISSION.bonusMs, m.gold);
  const s = PLOUGH_MISSION.start;
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.heading));
  const state = PLOUGH_MISSION.createState();
  for (const o of PLOUGH_MISSION.objectives) {
    const v = o.check(frame({ x: s.x, z: s.z, heading: s.heading }), state);
    assert.equal(typeof v.done, 'boolean');
    assert.equal(typeof v.text, 'string');
    assert.equal(v.done, false);
  }
  assert.equal(PLOUGH_MISSION.summary(state).length, 2);
});

test('the road is the Prättigauerstrasse from the Seegalerie to the Wolfgang Passhöhe', () => {
  const route = createPloughRoute();
  assert.ok(Math.abs(route.length - 2139) < 2, `${route.length}`);
  // every vertex is a vertex of OSM's Prättigauerstrasse (primary)
  const osm = DAVOS_DATA.roads.filter((r) => r.name === 'Prättigauerstrasse' && r.kind === 'primary');
  for (let i = 0; i < WOLFGANG_ROAD.length; i += 2) {
    const x = WOLFGANG_ROAD[i], z = WOLFGANG_ROAD[i + 1];
    assert.ok(osm.some((r) => { for (let k = 0; k < r.pts.length; k += 2) if (Math.hypot(r.pts[k] - x, r.pts[k + 1] - z) < 0.2) return true; return false; }), `${x}, ${z}`);
  }
  // the gallery's north portal at the start (the end of OSM's tunnel along the lake), the Stützalpstrasse at the end
  const tunnel = DAVOS_DATA.roads.find((r) => r.id === 'w30419867');
  assert.ok(tunnel.tunnel && Math.hypot(tunnel.pts.at(-2) - WOLFGANG_ROAD[0], tunnel.pts.at(-1) - WOLFGANG_ROAD[1]) < 0.2);
  const stuetz = DAVOS_DATA.roads.find((r) => r.name === 'Stützalpstrasse');
  assert.ok(Math.hypot(stuetz.pts[0] - WOLFGANG_ROAD.at(-2), stuetz.pts[1] - WOLFGANG_ROAD.at(-1)) < 0.2);
  // the start on the right lane, facing up the road, in no building
  const s = PLOUGH_MISSION.start, pose = roadPose(route, s.x, s.z, s.heading);
  assert.ok(Math.abs(pose.d - PLOUGH.startD) < 0.05 && Math.abs(pose.a) < 1e-6 && pose.up);
  assert.ok(!DAVOS_DATA.buildings.some((b) => Math.abs(b.ring[0] - s.x) < 200 && Math.abs(b.ring[1] - s.z) < 200 && inRing(b.ring, s.x, s.z)));
  // the bridge's joints on the Totalpbach bridge (OSM's bridge way)
  const bridge = DAVOS_DATA.roads.find((r) => r.id === 'w111089510');
  assert.ok(bridge.bridge);
  const a = roadPose(route, bridge.pts[0], bridge.pts[1], 0), b = roadPose(route, bridge.pts[2], bridge.pts[3], 0);
  assert.ok(Math.abs(a.s - PLOUGH_JOINTS[0]) < 1.5 && Math.abs(b.s - PLOUGH_JOINTS[1]) < 1.5, `${a.s} ${b.s}`);
  assert.equal(zoneAt(2100).name, 'Wolfgang');
  assert.equal(zoneAt(600), null);
});

test('the snow map: two lanes of the same size, nothing cleared at first, a reset fills it again', () => {
  const route = createPloughRoute();
  const g = createPloughGrid(route);
  assert.equal(g.total[1], g.total[2]);
  assert.ok(g.total[1] > 14000);
  assert.equal(laneShare(g, 1), 0);
  stepPlough(g, { s: 100, d: PLOUGH.startD }, 0, 10, true, -1, 1);
  assert.ok(laneShare(g, 1) > 0);
  resetPloughGrid(g);
  assert.equal(laneShare(g, 1), 0);
  assert.ok(g.h.every((h) => h === Math.fround(PLOUGH.depth)));
});

test('the blade clears its strip and builds the wall beside it on the throw side; the snow is kept', () => {
  const route = createPloughRoute();
  const g = createPloughGrid(route);
  const v0 = volume(g);
  let s = 200;
  for (let k = 0; k < 90; k++) { stepPlough(g, { s, d: PLOUGH.startD }, 0, 10, true, -1, DT); s += 10 * DT; }
  assert.ok(Math.abs(volume(g) - v0) < 1e-3 * v0, 'the snow is moved, not lost');
  const at = (ss, d) => g.h[Math.floor((d + g.half) / g.cd) * g.cols + Math.floor(ss / g.cs)];
  // the lane's strip is clear, the crown and the other lane are not, the wall stands beyond the strip on the right
  for (const d of [-4.0, -3.0, -2.0, -1.0]) assert.ok(at(220, d) <= PLOUGH.clearAt, `d ${d}: ${at(220, d)}`);
  assert.ok(at(220, 0.25) === Math.fround(PLOUGH.depth) && at(220, 2.4) === Math.fround(PLOUGH.depth));
  const wall = Math.max(at(220, -4.75), at(220, -5.25), at(220, -5.75), at(220, -6.25));
  assert.ok(wall > 0.4, `the wall ${wall.toFixed(2)} m`);
  assert.ok(at(220, 6.5) === Math.fround(PLOUGH.depth));
  // swung to the left, the snow lands on the road
  const out = stepPlough(g, { s: 400, d: PLOUGH.startD }, 0, 10, true, 1, DT);
  assert.ok(out.vol > 0 && out.onRoad / out.vol > 0.5);
  // thrown right it does not; faster than the villages allow, it goes further out
  const slow = stepPlough(g, { s: 500, d: PLOUGH.startD }, 0, 8, true, -1, DT), fast = stepPlough(g, { s: 600, d: PLOUGH.startD }, 0, 15, true, -1, DT);
  assert.ok(slow.onRoad / slow.vol < 0.1 && fast.onRoad / fast.vol < 0.1);
  assert.ok(fast.far > 1.5 && fast.wall.d < slow.wall.d - 1.5);
  // lifted, or reversing: nothing happens
  assert.equal(stepPlough(g, { s: 700, d: PLOUGH.startD }, 0, 10, false, -1, DT).vol, 0);
  assert.equal(stepPlough(g, { s: 700, d: PLOUGH.startD }, 0, -3, true, -1, DT).vol, 0);
  // on the way down (facing back along the road) the right is the road's left: the wall on the + side
  const down = stepPlough(g, { s: 900, d: -PLOUGH.startD }, Math.PI, 10, true, -1, DT);
  assert.ok(down.wall.d > PLOUGH.laneOut && down.onRoad / down.vol < 0.1);
  // the blade's trailing end is on its throw side
  const b = bladeGeometry({ s: 0, d: 0 }, 0, -1);
  assert.ok(b.trail.d < 0 && b.lead.d > 0 && b.trail.s < b.lead.s);
});

test('the snow poles: on both verges outside the villages, missed on the lane, knocked down off it', () => {
  const route = createPloughRoute();
  const poles = createPoles(route);
  assert.ok(poles.length > 80);
  assert.ok(poles.every((p) => !zoneAt(p.s) && Math.abs(Math.abs(p.d) - PLOUGH.poleD) < 1e-9));
  assert.ok(!poles.some((p) => PLOUGH_JUNCTIONS.some((j) => j.side === p.side && Math.abs(j.s - p.s) < 10)), 'none in a side road');
  for (let s = 10; s < route.length - 10; s += 0.5) assert.equal(poleHits(poles, { s, d: PLOUGH.startD }, 0, -1, 0.5).length, 0);
  const near = poles.find((p) => p.side < 0);
  const hit = poleHits(poles, { s: near.s - PLOUGH.bladeAhead, d: -3.8 }, 0, -1, 0.5);
  assert.deepEqual(hit, [near]);
  assert.equal(poleHits(poles, { s: near.s - PLOUGH.bladeAhead, d: -3.8 }, 0, -1, 0.5).length, 0, 'down once');
});

test('the joints, the side roads, the traffic boxes', () => {
  assert.equal(jointCrossed(1075, 1081), 1080);
  assert.equal(jointCrossed(1092, 1086), 1089);
  assert.equal(jointCrossed(1000, 1070), null);
  const j = PLOUGH_JUNCTIONS.find((x) => x.name === 'Höhwaldstrasse');
  assert.equal(buriedJunction({ s: j.s + 1, d: -5.3 }), j);
  assert.equal(buriedJunction({ s: j.s + 1, d: 5.3 }), null);
  assert.equal(buriedJunction({ s: j.s + 9, d: -5.3 }), null);
  assert.ok(boxesOverlap({ x: 0, z: 0, h: 0, halfW: 1.3, halfL: 3.4 }, { x: 2.0, z: 3, h: Math.PI, halfW: 0.9, halfL: 2.2 }));
  assert.ok(!boxesOverlap({ x: 0, z: 0, h: 0, halfW: 1.3, halfL: 3.4 }, { x: 4.9, z: 3, h: Math.PI, halfW: 0.9, halfL: 2.2 }), 'the oncoming lane passes');
});

/** A bot: the lane's middle at a steady pace (54 km/h, 29 by the houses, 14 over the joints), the blade lifted past the
 *  side roads on its throw side; the turn at the pass as 35 s. Returns the time and the state */
function botRun() {
  const route = createPloughRoute();
  const g = createPloughGrid(route), poles = createPoles(route);
  const st = PLOUGH_MISSION.createState();
  let t = 0;
  const pass = (up) => {
    const dir = up ? 1 : -1, d = up ? PLOUGH.startD : -PLOUGH.startD, a = up ? 0 : Math.PI;
    let s = up ? PLOUGH.startS : route.length - 6, prev = null;
    while (up ? s < PLOUGH.passS + 2 : s > PLOUGH.homeS - 2) {
      const bs = s + dir * PLOUGH.bladeAhead;
      let v = 15;
      if (zoneAt(bs) || zoneAt(s)) v = 8.0;
      if (PLOUGH_JOINTS.some((j) => Math.abs(j - bs) < 8)) v = 3.9;
      const lowered = !PLOUGH_JUNCTIONS.some((j) => j.side === -dir && Math.abs(j.s - bs) < 6.5);
      const out = stepPlough(g, { s, d }, a, v, lowered, -1, DT);
      if (out.vol > 0 && out.onRoad / out.vol > 0.5) st.roadSec += DT;
      if (lowered && v > PLOUGH.zoneSpeed && zoneAt(bs)) st.zoneSec += DT;
      if (buriedJunction(out.wall)) st.buried++;
      if (prev != null && lowered && v > PLOUGH.jointSpeed && jointCrossed(prev, bs) != null) st.joints++;
      st.poles += poleHits(poles, { s, d }, a, -1, v * DT).length;
      prev = bs;
      s += dir * v * DT;
      t += DT;
      st.s = s;
    }
  };
  pass(true);
  st.north = laneShare(g, 1);
  t += 35;
  pass(false);
  st.north = laneShare(g, 1);
  st.south = laneShare(g, 2);
  return { t, st };
}

test('a clean bot run clears both lanes without a penalty and makes gold', () => {
  const { t, st } = botRun();
  assert.ok(st.north >= PLOUGH.goal + 0.1 && st.south >= PLOUGH.goal + 0.1, `${st.north} ${st.south}`);
  assert.deepEqual([st.poles, st.buried, st.joints, Math.round(st.roadSec), Math.round(st.zoneSec)], [0, 0, 0, 0, 0]);
  assert.ok(t > 330 && t < 420, `${t.toFixed(0)} s`);
  // (a real run accelerates and steers round the bends: ~7 % more; gold still)
  assert.equal(medalFor(t * 1.07 * 1000, PLOUGH_MISSION.medals), 'gold', `${(t * 1.07).toFixed(0)} s`);
  // the objectives: up done at the pass with the lane cleared, down done back at the gallery
  const state = { ...st, s: PLOUGH.passS + 1, south: 0, atPass: false };
  assert.equal(PLOUGH_MISSION.objectives[0].check(frame({ t: 1000 }), state).done, true);
  assert.equal(PLOUGH_MISSION.objectives[1].check(frame({ t: 1000 }), { ...st, s: 10 }).done, true);
  assert.equal(PLOUGH_MISSION.objectives[1].check(frame({ t: 1000 }), { ...st, s: 10, north: 0.5 }).done, false);
  assert.ok(PLOUGH_MISSION.objectives[1].check(frame({ t: PLOUGH.timeLimitMs + 1 }), st).fail);
  assert.ok(PLOUGH_ZONES.every((z) => z.s0 < z.s1));
});

test('the plough speaks German', async () => {
  globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  globalThis.NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
  globalThis.document = {
    readyState: 'loading', addEventListener() {}, documentElement: { lang: 'en' },
    body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } },
    querySelectorAll() { return []; }, createTreeWalker() { return { nextNode() { return false; } }; }
  };
  globalThis.localStorage = { getItem() { return null; }, setItem() {} };
  globalThis.window = { dispatchEvent() {} };
  const { setLanguage, t } = await import('../js/i18n.js');
  setLanguage('de');
  const M = PLOUGH_MISSION;
  for (const s of [M.title, M.intro, M.finish, ...M.objectives.map((o) => o.title)]) assert.notEqual(t(s), s, s);
  assert.equal(t('To the Passhöhe: 1.2 km · lane cleared 45 % of 80 %'), 'Bis zur Passhöhe: 1,2 km · Spur geräumt: 45 % von 80 %');
  assert.equal(t('To the Seegalerie: 340 m · lane cleared 81 % of 80 %'), 'Bis zur Seegalerie: 340 m · Spur geräumt: 81 % von 80 %');
  assert.equal(t('the filling station ahead on your throw side: F lifts the blade past it'), 'Einmündung Tankstelle voraus auf der Wurfseite: F hebt die Pflugschar');
  assert.equal(t('You buried the mouth of Höhwaldstrasse!'), 'Einmündung Höhwaldstrasse zugeschüttet!');
  assert.equal(t('Up 92 % · down 88 % cleared'), 'Hinauf 92 % · hinunter 88 % geräumt');
  assert.equal(t('2 snow poles (+6 s) · 1 car hit (+10 s) · snow on the road 3 s (+3 s) · too fast by the houses 4 s (+4 s)'),
    '2 Schneestangen (+6 s) · 1 Auto angefahren (+10 s) · Schnee auf der Fahrbahn 3 s (+3 s) · zu schnell bei den Häusern 4 s (+4 s)');
  assert.equal(t('1 bridge joint (+8 s) · 2 side roads buried (+10 s)'), '1 Brückenfuge (+8 s) · 2 Einmündungen zugeschüttet (+10 s)');
  for (const s of ['Back into the plough', 'You are throwing the snow onto the road: V swings the blade', 'Houses by the road: below 30 km/h, or the snow flies onto the pavement',
    'Bridge joints ahead: F lifts the blade (or crawl over them)', 'The blade is up: F lowers it', 'Snow pole knocked down! +3 s', 'You hit a car! +10 s',
    'Swing the blade', 'Blade side', 'Lift the blade', 'Snow plough', 'A clean run: no penalties', 'Turn round: the lane down is on the other side',
    'The morning traffic is stuck in the snow on the Wolfgang: too slow.', 'Too much snow left on the lane: go back and clear it']) assert.notEqual(t(s), s, s);
  setLanguage('en');
});
