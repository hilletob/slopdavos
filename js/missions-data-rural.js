import { makeRoute, routePoint, stepGarbage, mulberry32 } from './missions-data-work.js';

// js/missions-data-rural.js
// Two missions of the Davos countryside (js/missions-data.js lists them; js/missions-rural.js has their runtime): their
// definitions and the pure logic, three.js-free like the other packages (tests/missions-rural.test.mjs drives them with
// synthetic frames).
//
//   quad-heldstab  Summer. A quad from the yard of Heldstab AG (Motorgeräte & Landtechnik, Bahnhofstrasse 11, Davos Dorf;
//                  they sell Can-Am ATVs, the test ride is invented): through the village to the Bedraweg, round the
//                  tracks and meadows of the Bedra, over the bumps (air time takes seconds off), through mud and a late
//                  patch of old snow (grip gone), back by the Mühlestrasse. Gold by time.
//   bio-round      All year. An open transporter round the hotels of Davos Dorf and down the Promenade, then out the
//                  Dischmastrasse (cleared all winter, unlike the Bünda's lanes) to the biogas plant at the Duchli Ranch
//                  (Davos Biogas GmbH): the kitchens' waste in round barrels at the hotels, lifted from the side onto the load bed
//                  while the truck stands (the refuse round's stop logic, js/missions-data-work.js stepGarbage), an empty
//                  set down in its place. The barrels stack up visibly, a load gauge, flies and a stink cloud. Two barrels
//                  hold plastic: spot it and reject the barrel before it is up, or the whole batch is spoiled. At the
//                  plant the barrels are tipped into the digester's hopper. Medals by points: barrels, clean load, time.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);
const smooth = (t) => t * t * (3 - 2 * t);

// =====================================================================================================================
// 1. Quad fahren bei Heldstab
// The address point of Bahnhofstrasse 11 (swisstopo: E 2783429.0, N 1187174.5 = x 929.0, z -1674.5) lies in the OSM
// footprint w116881220; the start stands on the Bahnhofstrasse in front of it, heading north-east.
export const HELDSTAB = { x: 929, z: -1674.5, lv95: { E: 2783429, N: 1187174.5 } };
export const QUAD_START = { x: 943.2, z: -1669.4, heading: Math.atan2(36, -39) };

// The course: real OSM ways. Town: Bahnhofstrasse, Flüelastrasse, Seehornstrasse, Museumstrasse, the Bedraweg's paved end.
// Off road: the tracks w758955995, w37074839 (Bedraweg), a meadow, w967261892, w959828052, a meadow, w538810151.
// Back: Mühlestrasse, Bahnhofstrasse.
export const QUAD_ROUTE = [
  943.2, -1669.4, 952, -1682, 972, -1703, 1005, -1744, 1019, -1760, 1042, -1763, 1071, -1775, 1102, -1789, 1177, -1815, 1183, -1797, 1195, -1763, 1217, -1705, 1216, -1687, 1171, -1622, 1162, -1599, 1156, -1576, 1216, -1556, 1244, -1545,
  1263, -1530, // (the off-road part begins)
  1320, -1572, 1345, -1587, 1412, -1621, 1459, -1642, 1526, -1661, 1575, -1682,
  1583, -1592, // (across the meadow)
  1549, -1585, 1520, -1574, 1477, -1575, 1447, -1556, 1429, -1541, 1395, -1490, 1382, -1425, 1378, -1396, 1389, -1364, 1365, -1330, 1334, -1299,
  1230, -1320, 1131, -1372, // (across the meadow)
  1129.5, -1359, 1127, -1351, 1124, -1345, 1116, -1332, 1111, -1316, // (the Bedraweg between two houses: the gap's middle, the OSM line runs along a corner)
  1093, -1282, // (the off-road part ends)
  1077, -1302, 1018, -1336, 949, -1377, 917, -1412, 859, -1501, 832, -1538, 861, -1575, 901, -1625, 916, -1643, 931, -1659
];
export const QUAD_OFFROAD = { from: [1263, -1530], to: [1093, -1282] };

export const QUAD = {
  gateR: 9, gateHalf: 5.5, chevronStep: 5, // (the poles either side of a gate; the chevrons on the ground every chevronStep m)
  finish: { x: 931, z: -1659, r: 7 },
  minLaunch: 7, // m/s: slower, the quad only rolls over a bump
  launch: 0.34, maxVy: 7.5, gravity: 12.5,
  cleanAir: 0.55, // s in the air for a clean jump
  airBonusMs: 1500,
  chatter: 0.05, // rad: how much the body rocks off the road at speed
  // (light and twitchy: a short wheelbase, a quick front; js/controllers.js takes it as car.drive)
  drive: { speed: 21, reverseSpeed: 5, acceleration: 5.2, powerSpeed: 11, rolling: 0.5, drag: 0.0012, coast: 1.4, brake: 9, wheelbase: 1.3, grip: 8.2, cornering: 7.6 },
  air: { speed: 21, reverseSpeed: 5, acceleration: 0.01, powerSpeed: 0, rolling: 0, drag: 0.0006, coast: 0, brake: 0.01, wheelbase: 1.3, grip: 0.35, cornering: 2 },
  // (js/controllers.js driveSpeed takes `rolling` off before it adds `acceleration`: the first must stay the smaller, or
  // the quad never gets out of a patch; the speed over the limit is taken by `drag`)
  surfaces: {
    mud: { speed: 8.5, reverseSpeed: 3, acceleration: 3.2, powerSpeed: 0, rolling: 1.4, drag: 0.02, coast: 3, brake: 5, wheelbase: 1.3, grip: 3.1, cornering: 3.2 },
    snow: { speed: 12, reverseSpeed: 3.5, acceleration: 2.6, powerSpeed: 0, rolling: 0.7, drag: 0.008, coast: 1, brake: 2.8, wheelbase: 1.3, grip: 1.9, cornering: 2.2 }
  }
};

const QUAD_LINE = makeRoute(QUAD_ROUTE);
/** The arc length of the course's vertex nearest to (x, z) */
function routeS(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < QUAD_ROUTE.length / 2; i++) {
    const d = Math.hypot(QUAD_ROUTE[i * 2] - x, QUAD_ROUTE[i * 2 + 1] - z);
    if (d < bd) { bd = d; best = QUAD_LINE.cum[i]; }
  }
  return best;
}
export const quadRouteLength = () => QUAD_LINE.length;
/** Metres from the start to where the tracks begin, and the off-road part's length */
export const quadOffroad = () => {
  const a = routeS(...QUAD_OFFROAD.from), b = routeS(...QUAD_OFFROAD.to);
  return { begins: a, length: b - a, rest: QUAD_LINE.length - b };
};

/** A place on the course: arc length past a vertex */
const onRoute = (x, z, ahead = 0, side = 0) => { const p = routePoint(QUAD_LINE, routeS(x, z) + ahead, side); return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), heading: p.heading }; };

// The gates, grouped by the objective they belong to
export const QUAD_GATES = { // (each on the way)
  town: [[1019, -1760], [1177, -1815], [1217, -1705], [1156, -1576], [1263, -1530]],
  course: [[1345, -1587], [1459, -1642], [1575, -1682], [1583, -1592], [1477, -1575], [1395, -1490], [1389, -1364], [1334, -1299], [1230, -1320], [1131, -1372], [1093, -1282]],
  back: [[949, -1377], [832, -1538]]
}; // (the finish follows the last one)
const QUAD_KEYS = ['town', 'course', 'back'];
/** All the gates in the order they are driven, numbered from 1, the finish last: { n, x, z, key, finish, heading (the
 *  way through it, from the gate before) } */
export const QUAD_GATE_LIST = (() => {
  const list = [];
  for (const key of QUAD_KEYS) for (const [x, z] of QUAD_GATES[key]) list.push({ x, z, key, finish: false });
  list.push({ x: QUAD.finish.x, z: QUAD.finish.z, key: 'back', finish: true });
  return list.map((g, i) => {
    const [px, pz] = i ? [list[i - 1].x, list[i - 1].z] : [QUAD_START.x, QUAD_START.z];
    return { ...g, n: i + 1, heading: Math.atan2(g.x - px, g.z - pz) };
  });
})();
/** The next gate's place in QUAD_GATE_LIST (0-based) for the run's objective `index` and its state; past the end: the length */
export function quadNextGate(state, index) {
  let k = 0;
  for (let i = 0; i < QUAD_KEYS.length; i++) {
    if (i < index) { k += QUAD_GATES[QUAD_KEYS[i]].length; continue; }
    return k + Math.min(state.gates[QUAD_KEYS[i]] || 0, QUAD_GATES[QUAD_KEYS[i]].length + (i === QUAD_KEYS.length - 1 ? 1 : 0));
  }
  return QUAD_GATE_LIST.length;
}

export const QUAD_BUMPS = [[1345, -1587, 30], [1412, -1621, 26], [1526, -1661, 22], [1583, -1592, -45], [1429, -1541, -14], [1382, -1425, 16], [1334, -1299, 45], [1230, -1320, 45]].map(([x, z, ahead], i) => {
  const p = onRoute(x, z, ahead);
  return { i, x: p.x, z: p.z, heading: p.heading, halfL: 4.2, halfW: 3.4, h: 0.75 };
});

export const QUAD_PATCHES = [
  { ...onRoute(1459, -1642, 12), r: 7, kind: 'mud' },
  { ...onRoute(1583, -1592, -22, 3), r: 12, kind: 'mud' },
  { ...onRoute(1395, -1490, 18), r: 9, kind: 'snow' },
  { ...onRoute(1378, -1396, 3), r: 7, kind: 'snow' },
  { ...onRoute(1230, -1320, 22), r: 12, kind: 'mud' }
];

/** The mound under (x, z): its height (m) and the slope along the bump's heading (rise per m, for the body's pitch) */
export function bumpAt(x, z, out = {}, bumps = QUAD_BUMPS) {
  out.h = 0; out.slope = 0; out.bump = null;
  for (const b of bumps) {
    const dx = x - b.x, dz = z - b.z;
    if (dx * dx + dz * dz > 49) continue;
    const s = Math.sin(b.heading), c = Math.cos(b.heading);
    const along = dx * s + dz * c, across = dx * c - dz * s;
    if (Math.abs(along) >= b.halfL || Math.abs(across) >= b.halfW) continue;
    const k = Math.cos((Math.PI / 2) * (along / b.halfL));
    const w = smooth(clamp((b.halfW - Math.abs(across)) / 1.2, 0, 1));
    out.h = b.h * k * k * w;
    out.slope = -b.h * w * (Math.PI / (2 * b.halfL)) * Math.sin((Math.PI * along) / b.halfL);
    out.bump = b;
    return out;
  }
  return out;
}

export const surfaceAt = (x, z, patches = QUAD_PATCHES) => {
  for (const p of patches) { const dx = x - p.x, dz = z - p.z; if (dx * dx + dz * dz <= p.r * p.r) return p.kind; }
  return null;
};

export const createQuadJump = () => ({ air: false, hopY: 0, vy: 0, airT: 0, along: new Float32Array(QUAD_BUMPS.length).fill(NaN), used: QUAD_BUMPS.map(() => false) });

/**
 * One step of the quad over the course: the mounds and the air. car: { x, z, speed }; the state's `jump` (createQuadJump).
 * Returns 'launch', 'land' or null; a clean jump (long enough in the air, each bump once) takes QUAD.airBonusMs off the
 * clock through state.penaltyMs.
 */
export function stepQuad(state, car, dt, bumps = QUAD_BUMPS, Q = QUAD) {
  const j = state.jump;
  const was = state.surface;
  state.surface = j.air ? null : surfaceAt(car.x, car.z);
  if (state.surface && state.surface !== was) state.patches++;
  let ev = null;
  if (j.air) {
    j.airT += dt;
    j.vy -= Q.gravity * dt;
    j.hopY += j.vy * dt;
    if (j.hopY <= 0) {
      j.hopY = 0; j.air = false; ev = 'land';
      state.lastAir = j.airT;
      if (j.airT >= Q.cleanAir && !j.scored) { state.jumps++; state.penaltyMs -= Q.airBonusMs; j.scored = true; state.cleanLanding = true; } else state.cleanLanding = false;
    }
  } else j.hopY = 0;
  for (let i = 0; i < bumps.length; i++) {
    const b = bumps[i], dx = car.x - b.x, dz = car.z - b.z;
    if (dx * dx + dz * dz > 100) { j.along[i] = NaN; continue; }
    const s = Math.sin(b.heading), c = Math.cos(b.heading);
    const along = dx * s + dz * c, across = dx * c - dz * s, before = j.along[i];
    j.along[i] = along;
    // (over the crest, from either side)
    if (!j.air && Number.isFinite(before) && before * along <= 0 && before !== along && Math.abs(across) < b.halfW && Math.abs(car.speed) >= Q.minLaunch) {
      j.air = true; j.airT = 0; j.hopY = b.h;
      j.vy = Math.min(Q.maxVy, Math.abs(car.speed) * Q.launch);
      j.scored = j.used[i];
      j.used[i] = true;
      ev = 'launch';
    }
  }
  return ev;
}

const gateTarget = ([x, z], r = QUAD.gateR) => ({ x, z, r });

function quadObjective(id, title, key, last) {
  const gates = QUAD_GATES[key];
  return {
    id, title,
    check(ctx, state) {
      if (ctx.t > QUAD_MISSION.timeLimitMs) return { done: false, fail: 'Too slow: Heldstab wants the quad back before closing time.', text: '', progress: null, target: null, hint: null };
      if (ctx.mode !== QUAD_MISSION.mode) return { done: false, progress: null, text: 'Back onto the quad', target: null, hint: null };
      const n = state.gates[key] || 0;
      const count = gates.length + (last ? 1 : 0);
      const g = n < gates.length ? gates[n] : [QUAD.finish.x, QUAD.finish.z];
      const r = n < gates.length ? QUAD.gateR : QUAD.finish.r;
      const d = Math.hypot(ctx.x - g[0], ctx.z - g[1]);
      if (d <= r) {
        state.gates[key] = n + 1;
        if (n + 1 >= count) return { done: true, progress: 1, text: `Gate ${count}/${count}`, target: null, hint: null };
      }
      const next = state.gates[key] || 0;
      const g2 = next < gates.length ? gates[next] : [QUAD.finish.x, QUAD.finish.z];
      // (numbered through the whole course, as on the boards at the gates; the finish is the last)
      const first = QUAD_GATE_LIST.findIndex((g) => g.key === key);
      const text = `Gate ${first + Math.min(next + 1, count)}/${QUAD_GATE_LIST.length} · ${fmtDist(Math.hypot(ctx.x - g2[0], ctx.z - g2[1]))}${state.jumps ? ` · ${state.jumps} clean ${state.jumps === 1 ? 'jump' : 'jumps'}` : ''}`;
      const hint = state.jump?.air ? 'In the air!'
        : state.surface === 'mud' ? 'Mud: ease off, the quad slides'
          : state.surface === 'snow' ? 'Old snow: hardly any grip'
            : null;
      return { done: false, progress: next / count, text, target: next < gates.length ? gateTarget(g2) : { x: g2[0], z: g2[1], r: QUAD.finish.r, style: 'pad' }, hint };
    }
  };
}

export const QUAD_MISSION = {
  id: 'quad-heldstab',
  title: 'Quad ride from Heldstab',
  intro: 'Heldstab AG on the Bahnhofstrasse in Davos Dorf sells farm machinery, and quads too. Today one is yours for a test ride: through the village to the Bedraweg, round the tracks and meadows above Dorf, and back along the Mühlestrasse. The quad is light and twitchy. Hit the bumps fast: a clean jump takes 1.5 s off your time. Mud and the last old snow take your grip away, and in the air nothing steers.',
  mode: 'car',
  season: 'summer',
  time: 'midday',
  features: ['workVehicle', 'quadCourse'],
  props: [],
  vehicle: 'quad',
  colour: '#d9731a',
  icon: 'quad',
  // (a race with other players, js/race-session.js: the gates in the order driven for the standings, and which is next)
  race: { gates: QUAD_GATE_LIST, nextGate: quadNextGate },
  // (the course is 2.4 km: an ideal lap from the handling's numbers, grip in the bends and all jumps, 2:34; a real run
  // with brakes and lines more. Worked out, not measured: the browser runs on a loaded machine gave no usable times)
  bonusMs: 190000,
  medals: { gold: 190000, silver: 260000, bronze: 390000 },
  timeLimitMs: 720000,
  finish: 'Back in the Heldstab yard, mud up to the ears. They hose the quad down without a word and ask if you would like to see the invoice for a new one.',
  start: QUAD_START,
  createState() { return { gates: { town: 0, course: 0, back: 0 }, jumps: 0, patches: 0, surface: null, jump: createQuadJump(), penaltyMs: 0 }; },
  objectives: [
    quadObjective('town', 'Through Davos Dorf to the Bedraweg', 'town', false),
    quadObjective('course', 'Round the off-road course', 'course', false),
    quadObjective('back', 'Back to the Heldstab yard', 'back', true)
  ],
  summary(state) { return [`${state.jumps} clean ${state.jumps === 1 ? 'jump' : 'jumps'} (-${(state.jumps * QUAD.airBonusMs) / 1000} s) · ${state.patches} mud and snow ${state.patches === 1 ? 'patch' : 'patches'} crossed`]; }
};

// =====================================================================================================================
// 2. Bioabfälle sammeln: through Davos Dorf to the biogas plant at the Duchli Ranch
// The plant's position comes from the user: LV95 E 2784006.44, N 1185913.81 (x 1506.44, z -413.81); the hopper stands there,
// 7 m off the Duchliweg (OSM w1443014922), which the transporter reaches by road.
export const BIO_PLANT = { x: 1506.44, z: -413.81, lv95: { E: 2784006.44, N: 1185913.81 } };
export const BIO_HOPPER = { x: BIO_PLANT.x, z: BIO_PLANT.z, halfW: 2.6, halfL: 2.1, heading: Math.atan2(136, 85) };
export const BIO_DIGESTERS = [{ x: 1532, z: -432, r: 9, h: 6.5 }, { x: 1553, z: -414, r: 7.5, h: 5.5 }];

export const BIO = {
  // (js/missions-data-work.js GARBAGE's fields. The barrels go up from the side: `rear` is the way from the truck's centre
  // back to the middle of its load bed, and the stop is measured from there, whichever side the barrel stands on)
  stopRadius: 6.5, stopSpeed: 0.8, loadS: 3.4, unloadS: 7, rear: 0.75,
  plantR: 9, // m from the middle of the load bed to the hopper
  guideAhead: 70, offWay: 45, // the arrow to the plant: this far ahead along the way, or back to it from this far off
  points: { barrel: 10, rejected: 15, clean: 60, spoiled: -40, wrongReject: -10, time: 80 },
  // the time bonus: full up to fastMs, none from slowMs. An ideal round, worked out from the handling (top speed, power,
  // the bends at 3.2 m/s², the ten stops of loadS and the hopper: tests/missions-rural.test.mjs idealRound): 3.35 km, ~6:00
  fastMs: 435000, slowMs: 870000
};

// The way (OSM centrelines, js/davos-geodata.js roadGraph, one-way streets in their direction): the Bahnhofstrasse down
// from the Flüelakreuzung, the Promenade to the Schiaweg, the Talstrasse back up to the Dischmakreuzung, the Dischmastrasse
// out of the village (the winter road: the old way over the Bedraweg, the Mühlestrasse and the Mattawald lanes above the
// Bünda is not ploughed for a lorry), the Duchliweg into the Duchli Ranch's yard (w314831258: a few metres north of the
// OSM line between the barns, where the truck has room) and on its track (w1443014922) back west to the hopper
export const BIO_ROUTE = [
  1005.2, -1743.8, 971.5, -1703.5, 952, -1681.9, 916.3, -1642.7, 901, -1625.1, 888.5, -1610.1, 860.8, -1574.6, 832.4, -1538.5, 785.2, -1476.9, 781.9, -1473.3, 772.7, -1468.1, 762.9, -1468, 755.6, -1470.4, 735.2, -1484.7, 731.8, -1486.3, 725.1, -1487.8, 719.3, -1487.8, 709.9, -1484.6, 690, -1458.8, 668.4, -1426.3,
  642.7, -1390.1, 627.3, -1366.2, 608.4, -1325.1, 590.8, -1277.8, 578.6, -1217.6, 577, -1205.8, 571.9, -1177, 558.6, -1101.5, 553.1, -1071.4, 544.3, -1029, 535.2, -991.2, 533.9, -985.5, 515.2, -915.3, 501.9, -871.9, 491, -831.8, 485.4, -818.5, 479.5, -807.9, 535.5, -775.2, 583, -744.9, 596.3, -777,
  601.8, -796.1, 606.4, -817.9, 644.3, -1170.9, 654.1, -1166.7, 665.3, -1163.5, 671.2, -1162.5, 684.4, -1161.7, 696.6, -1159.3, 702.8, -1157.2, 715.9, -1150.2, 722.1, -1146, 726.8, -1140.9, 744, -1121.9, 751.8, -1109.9, 761.4, -1087.5, 786.3, -1012.6, 797.1, -979.5, 809.1, -947.8, 817.5, -931.7, 833.9, -901.4,
  925.3, -755.1, 987.3, -644.7, 1089.6, -454.4, 1094.5, -444.8, 1138.4, -363.1, 1143.4, -355.6, 1153.7, -345.9, 1159.3, -341.7, 1268.9, -278.8, 1285.8, -269, 1303.8, -260.9, 1344.1, -247.1, 1369.6, -237.3, 1416, -213.2, 1424.5, -222.8, 1426.6, -227.7, 1428.3, -242, 1428.7, -250.5, 1431, -254.6, 1433, -255.6,
  1435, -255.6, 1437, -255.4, 1439, -255.2, 1441, -256, 1447, -256, 1516, -253.6, 1520.2, -263.1, 1523.2, -271.2, 1537.5, -283.5, 1551, -291.8, 1565.3, -300.6, 1578.8, -304.8, 1582.4, -319, 1584.5, -330.1, 1584.5, -333.4, 1582.9, -344.2, 1581.4, -348.2, 1571.3, -363.7, 1568.2, -366.7, 1502.7, -407.7
];
// The barrels, and where they stand on the load bed (truck frame: x across, y up from the ground, z forward): six on the
// boards, four more on top of them
export const BIO_BARREL = { r: 0.3, h: 0.85 };
export const BIO_BED = { y: 0.97, halfW: 0.97, z0: -2.6, z1: 1.1 };
export const BIO_BED_SLOTS = [
  ...[-1.95, -1.0, -0.05].flatMap((z) => [-0.46, 0.46].map((x) => [x, BIO_BED.y, z])),
  ...[-1.5, -0.55].flatMap((z) => [-0.46, 0.46].map((x) => [x, BIO_BED.y + BIO_BARREL.h, z]))
];
const BIO_LINE = makeRoute(BIO_ROUTE);
export const bioRouteLength = () => BIO_LINE.length;
export const BIO_START = { x: 1004.1, z: -1742.5, heading: Math.atan2(971.5 - 1005.2, -1703.5 + 1743.8) }; // (down the Bahnhofstrasse)

// The collection points: the kitchens of ten hotels on the way (OSM tourism=hotel, js/shops-data.js: name, element, its
// point), each barrel on the verge of the street in front of the hotel (arc length along the way, the side: 1 left of
// the way, -1 right; 4 m off the centreline, clear of the houses)
export const BIO_HOTELS = [
  { name: 'Turmhotel Victoria', osm: 'n623883946', x: 960.2, z: -1746.8, s: 27, side: -1 }, // Alte Flüelastrasse 2, on the Bahnhofstrasse
  { name: 'Hotel Flüela', osm: 'w117012166', x: 844.5, z: -1617.8, s: 198, side: -1 }, // Bahnhofstrasse 5
  { name: 'Hotel Montana', osm: 'n2282077534', x: 834.3, z: -1507.4, s: 292, side: 1 }, // Bahnhofstrasse
  { name: 'Hotel Seehof', osm: 'w117012182', x: 696.3, z: -1511.2, s: 430, side: -1 }, // Promenade 159, at its corner
  { name: 'Sport Hotel Parsenn', osm: 'w116881152', x: 669.7, z: -1389.3, s: 531, side: 1 }, // Promenade
  { name: 'Hotel Meierhof', osm: 'w118240455', x: 546.9, z: -1161.6, s: 792, side: -1 }, // Promenade 135
  { name: 'Hotel Concordia', osm: 'w126895457', x: 552.6, z: -963.6, s: 985, side: 1 }, // Promenade
  { name: 'Alpine Inn', osm: 'n2749938965', x: 512.6, z: -842, s: 1112, side: 1 }, // Promenade
  { name: 'Hotel Cresta', osm: 'n982616241', x: 552.6, z: -741, s: 1238, side: -1 }, // on the Schiaweg
  { name: 'Solaria', osm: 'n2615277888', x: 950.1, z: -779, s: 2227, side: 1 } // the Dischmastrasse, at the Solaria lane
];

/** The ten barrels, one at each hotel; `seed` picks the two with plastic in them (never the first and never next to each other) */
export function bioStops(seed = 1) {
  const rnd = mulberry32(seed);
  const a = 1 + Math.floor(rnd() * 4), b = a + 2 + Math.floor(rnd() * (BIO_HOTELS.length - a - 2));
  return BIO_HOTELS.map(({ s, side, name }, i) => {
    const p = routePoint(BIO_LINE, s, side * 4);
    return { i, x: +p.x.toFixed(1), z: +p.z.toFixed(1), heading: p.heading, kind: 'barrel', n: 1, plastic: i === a || i === b, name, s };
  });
}

/** Where the arrow points on the way to the plant: a point of the way `ahead` m on from the truck's place on it (the
 *  nearest, searched from `from` on, so that the yard's loop back to the hopper does not pull it ahead), or back to the way
 *  when the truck has left it. { s (the truck's place), x, z } */
export function bioGuide(x, z, from = 0, ahead = BIO.guideAhead) {
  const { pts, cum } = BIO_LINE, n = pts.length / 2;
  let best = Infinity, bs = from;
  for (let i = 1; i < n; i++) {
    if (cum[i] < from - 40) continue;
    const ax = pts[2 * i - 2], az = pts[2 * i - 1], dx = pts[2 * i] - ax, dz = pts[2 * i + 1] - az, L = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1), d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best) { best = d; bs = cum[i - 1] + t * (cum[i] - cum[i - 1]); }
    if (from > 0 && cum[i - 1] > from + 600) break; // (once on the way, a window along it: not where the way passed before)
  }
  const p = routePoint(BIO_LINE, best > BIO.offWay ? bs : bs + ahead);
  return { s: Math.max(from, bs), x: p.x, z: p.z, off: best > BIO.offWay };
}

const bedOf = (truck, G = BIO) => ({ x: truck.x - Math.sin(truck.heading) * G.rear, z: truck.z - Math.cos(truck.heading) * G.rear });

/** The barrel beside the load bed while the truck stands, or null */
export function stopAtBed(state, truck, G = BIO) {
  if (Math.abs(truck.speed) >= G.stopSpeed) return null;
  const t = bedOf(truck, G);
  let best = null, bd = G.stopRadius;
  for (const s of state.stops) {
    if (s.done) continue;
    const d = Math.hypot(s.x - t.x, s.z - t.z);
    if (d <= bd) { bd = d; best = s; }
  }
  return best;
}

/** The reject key at a barrel: 'rejected' (plastic, rightly left behind), 'wrong' (a clean one left behind) or null */
export function rejectBarrel(state, truck, G = BIO) {
  const s = stopAtBed(state, truck, G);
  if (!s) return null;
  s.done = true; s.rejected = true; s.t = 0; s.counted = true;
  state.loading = null;
  if (s.plastic) { state.rejected++; return 'rejected'; }
  state.wrong++;
  return 'wrong';
}

/** The share of the truck's capacity filled */
export const bioLoad = (state) => clamp(((state.collected) / Math.max(1, state.stops.length - 2)) * (1 - (state.unloaded || 0)), 0, 1);

/** The points (never below zero): barrels + plastic rejected + clean load (or a spoiled batch) + the time bonus */
export function bioScore(state, P = BIO.points) {
  const clean = state.collected - state.spoiledBarrels;
  const k = clamp((BIO.slowMs - (state.tMs || 0)) / (BIO.slowMs - BIO.fastMs), 0, 1);
  const finished = state.unloaded >= 1;
  return Math.max(0, Math.round(clean * P.barrel + state.rejected * P.rejected + state.wrong * P.wrongReject + (state.spoiled ? P.spoiled : finished && state.collected > 0 ? P.clean : 0) + (finished ? k * P.time : 0)));
}

export const BIO_MISSION = {
  id: 'bio-round',
  title: 'Green waste to the biogas plant',
  intro: 'The hotels\' kitchens fill a barrel of green waste a day, and it goes to the biogas plant at the Duchli Ranch. Take the open transporter round the hotels: down the Bahnhofstrasse, along the Promenade, back up the Talstrasse. Stop with the load bed beside each hotel\'s barrel, and the crew lifts it up while you stand and sets an empty in its place. Look into the barrels: two of them have plastic in them. Reject those with Space or E (or the Reject button) before they are up on the bed, or the whole batch is spoiled. Then out along the Dischmastrasse, the road that is cleared in winter, and through the ranch\'s yard to the digester\'s hopper, where the barrels are tipped in. Points for barrels, a clean load and the time.',
  mode: 'car',
  season: null,
  time: 'midday',
  features: ['workVehicle', 'bioRound'],
  props: [],
  vehicle: 'bioTruck',
  colour: '#6a9c2f',
  icon: 'biogas',
  scoreMode: true,
  scoreUnit: 'pts',
  // (all right and full time bonus: 80 + 30 + 60 + 80 = 250; a clean run needs 170 + time: gold by ~9:30, silver by
  // ~13:10, against an ideal round of ~6:00; a spoiled batch reaches 135 at most)
  medals: { gold: 225, silver: 185, bronze: 100 },
  timeLimitMs: 1260000,
  finish: 'The hopper swallows the hotels\' kitchen waste, the digester burps contentedly. Electricity and district heat by Thursday, and the flies stay at the plant.',
  start: BIO_START,
  createState() {
    const seed = Math.floor(Math.random() * 1e9);
    return { stops: bioStops(seed).map((s) => ({ ...s, done: false, t: 0, counted: false, rejected: false })), collected: 0, rejected: 0, wrong: 0, spoiled: false, spoiledBarrels: 0, missed: 0, loading: null, unloadT: 0, unloaded: 0, atPlant: false, guideS: 0, tMs: 0, penaltyMs: 0 };
  },
  update(ctx, state) {
    state.tMs = ctx.t;
    const tail = bedOf(ctx);
    state.atPlant = Math.hypot(tail.x - BIO_PLANT.x, tail.z - BIO_PLANT.z) <= BIO.plantR;
    for (const s of state.stops) {
      if (!s.done || s.counted) continue;
      s.counted = true;
      if (s.plastic) { state.spoiled = true; state.spoiledBarrels++; state.justSpoiled = true; }
    }
  },
  score(state) { return bioScore(state); },
  objectives: [
    {
      id: 'collect',
      title: 'Collect the barrels at the hotels',
      check(ctx, state) {
        if (ctx.t > BIO_MISSION.timeLimitMs) return { done: false, fail: 'The barrels are overflowing and the wasps have taken over the village: too slow.', text: '', progress: null, target: null, hint: null };
        const left = state.stops.filter((s) => !s.done);
        // (at the hopper with barrels left out: the round is over, those stay behind)
        if (state.atPlant && state.collected > 0 && left.length && Math.abs(ctx.speed) < 1) {
          state.missed = left.filter((s) => !s.plastic).length;
          return { done: true, progress: 1, text: '', target: null, hint: null };
        }
        let next = null, bd = Infinity;
        for (const s of left) { const d = Math.hypot(s.x - ctx.x, s.z - ctx.z); if (d < bd) { bd = d; next = s; } }
        const handled = state.stops.length - left.length;
        const load = Math.round(bioLoad(state) * 100);
        const text = `Barrels ${handled}/${state.stops.length} · load ${load} %${next ? ` · next ${next.name} ${fmtDist(bd)}` : ''}`;
        const l = state.loading;
        const hint = ctx.mode !== 'car' ? 'Back into the truck'
          : l ? `Loading … ${Math.round((l.t / BIO.loadS) * 100)} % · Space: reject the barrel`
            : state.spoiled ? 'Plastic in the batch: it is spoiled'
              : next && bd < 16 ? 'Stop with the load bed beside the barrel. Plastic in it? Reject!' : null;
        return { done: !left.length, progress: handled / state.stops.length, text, target: next ? { x: next.x, z: next.z, r: 2.5 } : null, hint };
      }
    },
    {
      id: 'unload',
      title: 'Unload at the biogas plant',
      check(ctx, state) {
        if (ctx.t > BIO_MISSION.timeLimitMs) return { done: false, fail: 'The load has started to ferment on its own: too slow.', text: '', progress: null, target: null, hint: null };
        if (state.atPlant && Math.abs(ctx.speed) < BIO.stopSpeed) state.unloadT += ctx.dt;
        state.unloaded = clamp(state.unloadT / BIO.unloadS, 0, 1);
        // (the arrow leads along the way: out the Dischmastrasse and round through the ranch's yard, the last stretch to
        // the hopper itself)
        const g = bioGuide(ctx.x, ctx.z, state.guideS || 0);
        state.guideS = g.s;
        const left = Math.max(0, BIO_LINE.length - g.s), d = Math.hypot(ctx.x - BIO_PLANT.x, ctx.z - BIO_PLANT.z);
        const close = left < 90 && d < 60;
        return {
          done: state.unloaded >= 1, progress: state.unloaded,
          text: state.atPlant ? `Unloading … ${Math.round(state.unloaded * 100)} %` : `To the hopper · ${fmtDist(g.off ? d : left)}`,
          target: close ? { x: BIO_PLANT.x, z: BIO_PLANT.z, r: BIO.plantR, style: 'pad' } : { x: g.x, z: g.z },
          hint: state.atPlant ? 'Stand still while the barrels are tipped' : close && d < 40 ? 'Stop with the load bed beside the hopper'
            : g.off ? 'Back to the way: the Dischmastrasse to the Duchli Ranch' : g.s < BIO_LINE.length - 420 ? 'Out along the Dischmastrasse: it is cleared in winter' : 'Through the ranch\'s yard and back along the track to the hopper'
        };
      }
    }
  ],
  summary(state) {
    const lines = [`${state.collected - state.spoiledBarrels} clean barrels · ${state.rejected} of 2 plastic barrels rejected${state.wrong ? ` · ${state.wrong} clean left behind` : ''}${state.missed ? ` · ${state.missed} left out` : ''}`];
    lines.push(state.spoiled ? 'Batch spoiled: the plastic went into the digester\'s hopper' : 'A clean load from the hotels\' kitchens: the plant manager nods');
    return lines;
  }
};

/** The refuse round's stop logic for this round's numbers */
export const stepBioStops = (state, truck, dt) => stepGarbage(state, truck, dt, BIO);

export const RURAL_MISSIONS = [QUAD_MISSION, BIO_MISSION];
