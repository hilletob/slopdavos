const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = ['traffic.js', 'pedestrian-system.js']
  .map((file) => readFileSync(join(__dirname, '../js', file), 'utf8')).join('\n');
// Exercise the production lane query and player snapshot without creating the WebGPU scene.
const laneQuery = source.match(/  function playerInLane\(lane, pl\) \{[\s\S]*?\n  \}/)?.[0];
const playerSnapshot = source.match(/    const pl = entity[\s\S]*?\n    \} : null;/)?.[0];
assert.ok(laneQuery, 'traffic lane query is present');
assert.ok(playerSnapshot, 'traffic player snapshot is present');
const { playerInLane, snapshot } = vm.runInNewContext(`
  ${laneQuery}
  function snapshot(entity, mode) {
    ${playerSnapshot}
    return pl;
  }
  ({ playerInLane, snapshot });
`);

function lane(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return {
    pts: points,
    cum,
    box: [Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x)),
      Math.min(...points.map((p) => p.z)), Math.max(...points.map((p) => p.z))]
  };
}

function player(x, y, z, mode = 'car') {
  return snapshot({ position: { x, y, z }, heading: Math.PI / 2, speed: 10 }, mode);
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

test('street traffic recognizes players on its own road, including sidewalk height', () => {
  const road = lane([{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }]);
  for (const y of [0, 0.22]) {
    const result = playerInLane(road, player(50, y, 0));
    close(result.u, 50);
    close(result.v, 10);
  }
  assert.equal(playerInLane(road, player(50, 7.6, 0)), null);
  assert.equal(playerInLane(road, player(50, 0, 2.1)), null);
});

test('viaduct traffic ignores players below it and recognizes players at deck height', () => {
  const road = lane([{ x: 0, y: 7.6, z: 0 }, { x: 100, y: 7.6, z: 0 }]);
  assert.equal(playerInLane(road, player(50, 0, 0)), null);
  const result = playerInLane(road, player(50, 7.6, 0));
  close(result.u, 50);
  close(result.v, 10);
});

test('sloped lanes use horizontal projection and compare interpolated road height', () => {
  const road = lane([{ x: 0, y: 0, z: 0 }, { x: 100, y: 7.6, z: 0 }]);
  for (const t of [0, 0.5, 1]) {
    const result = playerInLane(road, player(100 * t, 7.6 * t, 0));
    close(result.u, road.cum[1] * t);
    close(result.v, road.cum[1] / 10);
  }
  assert.equal(playerInLane(road, player(50, 0, 0)), null);
  assert.equal(playerInLane(road, player(100.1, 7.6, 0)), null);
  assert.equal(playerInLane(road, player(50, 3.8, 2.001)), null);
});

test('overlapping road segments select the matching elevation', () => {
  const road = lane([{ x: 0, y: 7.6, z: 0 }, { x: 100, y: 7.6, z: 0 },
    { x: 100, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]);
  const result = playerInLane(road, player(50, 0, 0));
  close(result.u, 157.6);
  close(result.v, 0);
});

test('underground lanes and helicopters remain excluded', () => {
  const road = lane([{ x: 0, y: -4.5, z: 0 }, { x: 100, y: -4.5, z: 0 }]);
  assert.equal(playerInLane(road, player(50, -4.5, 0)), null);
  assert.equal(player(50, 0, 0, 'helicopter'), null);
  assert.equal(snapshot(null, 'car'), null);
});

function trafficFunction(name, context) {
  const match = source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`));
  assert.ok(match, `${name} is present`);
  return vm.runInNewContext(`(${match[0].trim()})`, context);
}

function intersectionHarness() {
  const n = { signal: true, in: [] };
  const exit = { lanes: [0], outSide: 1 };
  const edge = { to: n, axisIndex: 0, occ: [[]], opposite: null, inSide: 0, len: 100 };
  const car = { edge, move: { to: exit, out: [0], turn: 'S' }, lane: 0, s: 80, speed: 4,
    driver: { b: 3 }, half: 2.25, wait: 0, commit: null, isPolice: false };
  const state = { phase: 'red', occupied: false, pedestrians: false, space: true, conflict: false, tram: false };
  const context = {
    LOOKAHEAD: 70,
    tramBodies: [{}],
    tramApproaching: () => state.tram,
    phaseOf: () => state.phase,
    canStopBefore: () => true,
    stopAt: () => -3,
    boxBusy: () => state.occupied,
    ahead: () => null,
    connector: () => ({ len: 20 }),
    yieldToCrossTraffic: () => state.conflict,
    pedestrianOn: () => state.pedestrians,
    laneCoord: () => 0,
    timeTo: () => 1,
    room: () => state.space,
    alongside: () => false,
    mergingAhead: () => null
  };
  return { car, state, mayEnter: trafficFunction('mayEnter', context), signalAhead: trafficFunction('signalAhead', context) };
}

test('police pass red and amber signals while ordinary cars stop', () => {
  const { car, state, mayEnter, signalAhead } = intersectionHarness();
  for (const phase of ['red', 'amber']) {
    state.phase = phase;
    car.isPolice = false;
    assert.equal(mayEnter(car, 18), false);
    assert.equal(signalAhead(car, car.edge, 18), -3);
    car.isPolice = true;
    assert.equal(mayEnter(car, 18), true);
    assert.equal(signalAhead(car, car.edge, 18), 0);
  }
});

test('cars wait at the line for a bus or tram about to cross the junction', () => {
  const { car, state, mayEnter } = intersectionHarness();
  state.phase = 'green';
  assert.equal(mayEnter(car, 10), true);
  state.tram = true;
  assert.equal(mayEnter(car, 10), false);
  state.tram = false;
  assert.equal(mayEnter(car, 10), true);
});

test('a bus crossing ahead, or oncoming while turning, counts as approaching; one going the same way does not', () => {
  const n = { x: 0, z: 0 };
  const v = { tx: 0, tz: -1, y: 0 }; // heading north
  const tramBodies = [];
  const tramApproaching = trafficFunction('tramApproaching', { tramBodies, Math });
  const bus = (x, z, heading, speed) => ({ x, z, y: 0, sin: Math.sin(heading), cos: Math.cos(heading), vx: Math.sin(heading) * speed, vz: Math.cos(heading) * speed, halfL: 6 });
  tramBodies.push(bus(-30, 0, Math.PI / 2, 10)); // 30 m west of the node, heading east at 10 m/s: there in 3 s
  assert.equal(tramApproaching(v, n, 'S'), true);
  tramBodies[0] = bus(-80, 0, Math.PI / 2, 10); // 8 s away
  assert.equal(tramApproaching(v, n, 'S'), false);
  tramBodies[0] = bus(30, 0, Math.PI / 2, 10); // past the node, driving away
  assert.equal(tramApproaching(v, n, 'S'), false);
  tramBodies[0] = bus(0, -30, 0, 10); // oncoming from the north (heading south): only a turn waits for it
  assert.equal(tramApproaching(v, n, 'S'), false);
  assert.equal(tramApproaching(v, n, 'L'), true);
  tramBodies[0] = bus(0, 30, Math.PI, 10); // behind, going the same way (north): queued behind v
  assert.equal(tramApproaching(v, n, 'L'), false);
  tramBodies[0] = bus(-30, 0, Math.PI / 2, 0); // standing (at a stop)
  assert.equal(tramApproaching(v, n, 'S'), false);
});

test('police still wait for crossing traffic, pedestrians and a blocked exit', () => {
  const { car, state, mayEnter } = intersectionHarness();
  car.isPolice = true;
  for (const [key, blocked] of [['occupied', true], ['pedestrians', true], ['space', false], ['conflict', true]]) {
    const initial = state[key];
    state[key] = blocked;
    assert.equal(mayEnter(car, 18), false, key);
    state[key] = initial;
  }
  assert.equal(mayEnter(car, 18), true);
});

test('police running a red yield to fast cross traffic regardless of how long they waited', () => {
  const car = { edge: { axisIndex: 0 }, wait: 20 };
  const lead = { s: 85, v: { speed: 10 } };
  const side = { axisIndex: 1, occ: [[lead]], len: 100 };
  const node = { signal: true, in: [{ axisIndex: 0, occ: [[lead]] }, side] };
  const context = {
    leadOf: (list) => list.at(-1),
    canStopBefore: () => true
  };
  lead.v.half = 2.25;
  context.canStop = trafficFunction('canStop', context);
  const yieldToCrossTraffic = trafficFunction('yieldToCrossTraffic', context);
  assert.equal(yieldToCrossTraffic(car, node), true);
  lead.v.speed = 0;
  assert.equal(yieldToCrossTraffic(car, node), false);
  lead.v.speed = 10;
  lead.s = 10;
  assert.equal(yieldToCrossTraffic(car, node), false);
});

test('left turns account for oncoming police even when their signal is red', () => {
  const edge = { to: { signal: true }, through: 0, len: 100, occ: [] };
  const car = { edge, move: { turn: 'S', out: [0] }, lane: 0, speed: 10, half: 2.25, isPolice: false };
  edge.occ.push([{ v: car, s: 85 }]);
  const context = { phaseOf: () => 'red', leadOf: (list) => list.at(-1) };
  context.canStop = trafficFunction('canStop', context);
  const yieldOncoming = trafficFunction('yieldOncoming', context);
  assert.equal(yieldOncoming(edge, false), false);
  car.isPolice = true;
  assert.equal(yieldOncoming(edge, false), true);
  car.speed = 0;
  assert.equal(yieldOncoming(edge, false), false);
});

function populationContext() {
  const context = {
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
    hasView: true, camX: 0, camY: 10, camZ: 0, visible: () => true, groundHeight: () => 0,
    appearLevel: () => 0,
    focusX: 0, focusZ: 0, player: { active: false },
    clock: 0,
    VEHICLE_SPAWN_DISTANCE: 250, PED_SPAWN_DISTANCE: 150, NEAR_RADIUS: 350, VEHICLE_SPACING: 30, PED_AVOID_INTERVAL: 0.12,
    BUILT_UP: 60, RURAL_SPACING_MAX: 4, buildingsNear: () => 60,
    nearEdges: [], nearSignals: [], track: {}, KERB: 1.6, QUEUE_GAP: 0.62,
    atCurb: () => {}, laneClear: () => true, nearTramBody: () => false, trackFull: () => false, trackLoad: new Map(), STUCK_TIME: 45,
    place: (v, e, lane, s) => Object.assign(v, { edge: e, lane, s })
  };
  context.nearView = trafficFunction('nearView', context);
  return context;
}

function straightEdge(z, len = 20) {
  return { sx: 0, sz: z, dx: 0, dz: 1, rx: -1, rz: 0, len, lanes: [0], occ: [[]] };
}

test('cars replenish the road ahead while nearby visible spawning stays blocked', () => {
  const context = populationContext();
  const edge = straightEdge(140);
  context.nearEdges.push(edge);
  const spawnVehicle = trafficFunction('spawnVehicle', context);
  const car = { half: 2.25 };
  assert.equal(spawnVehicle(car, 100, 350, true), false);
  edge.sz = 290;
  assert.equal(spawnVehicle(car, 100, 350, true), true);
  assert.equal(edge.sz + car.s, 300);
  edge.sz = 140;
  context.visible = () => false;
  assert.equal(spawnVehicle(car, 100, 350, true), true);
});

test('cars do not appear in or just ahead of a bus or tram', () => {
  const context = populationContext();
  const edge = straightEdge(290);
  context.nearEdges.push(edge);
  const bus = { x: 0, z: 290, halfL: 6 }; // the car would appear at z 300
  context.nearTramBody = trafficFunction('nearTramBody', { Math, tramBodies: [bus] });
  const spawnVehicle = trafficFunction('spawnVehicle', context);
  const car = { half: 2.25 };
  assert.equal(spawnVehicle(car, 100, 350, true), false);
  bus.z = 1e7; // (vbd.js parks bodies far away while unused)
  assert.equal(spawnVehicle(car, 100, 350, true), true);
});

test('pedestrians replenish visible sidewalks ahead without appearing nearby', () => {
  const context = populationContext();
  context.nearEdges.push(straightEdge(0));
  let z = 100;
  context.sidewalkTrack = () => {
    Object.assign(context.track, { ax: 0, az: z - 10, ux: 0, uz: 1, len: 20, node: null });
    return true;
  };
  const spawnPed = trafficFunction('spawnPed', context);
  const ped = { crossesStreets: false, speed: 1.4, rig: {} };
  assert.equal(spawnPed(ped, 60, 280, true), false);
  z = 220;
  assert.equal(spawnPed(ped, 60, 280, true), true);
  assert.equal(ped.z, 220);
  assert.equal(ped.v, ped.speed);
});

test('long roads are available near their ends and spawn only in the local section', () => {
  const context = populationContext();
  const edge = straightEdge(-1000, 2000);
  Object.assign(context, { edges: [edge, straightEdge(2000)], nodes: [], nearX: Infinity, nearZ: Infinity });
  const refreshNear = trafficFunction('refreshNear', context);
  refreshNear();
  assert.deepEqual(context.nearEdges, [edge]);
  // (Davos) the lanes within NEAR_RADIUS of the focus (700 m of this road) take one vehicle per VEHICLE_SPACING metres...
  assert.equal(context.capacity, Math.floor(700 / 30));
  // ...and out of town, with fewer buildings around, fewer
  Object.assign(context, { buildingsNear: () => 40, nearX: Infinity });
  refreshNear();
  assert.equal(context.capacity, Math.floor(700 / 45));
  Object.assign(context, { buildingsNear: () => 60, nearX: Infinity });
  refreshNear();
  const car = { half: 2.25 };
  assert.equal(trafficFunction('spawnVehicle', context)(car, 0, 350, false), true);
  assert.ok(edge.sz + car.s <= 350);
  assert.ok(car.s >= car.half + 5);
});

test('crossing pedestrians fall back to a sidewalk when nearby crosswalks are unusable', () => {
  const context = populationContext();
  context.nearSignals.push({});
  context.nearEdges.push(straightEdge(200));
  let crossings = 0;
  context.crosswalkTrack = () => { crossings++; return false; };
  context.sidewalkTrack = () => {
    Object.assign(context.track, { ax: 0, az: 200, ux: 0, uz: 1, len: 20, node: null });
    return true;
  };
  const ped = { crossesStreets: true, speed: 1.4, rig: {} };
  assert.equal(trafficFunction('spawnPed', context)(ped, 60, 280, true), true);
  assert.equal(crossings, 5);
  assert.equal(ped.node, null);
  assert.equal(ped.z, 210);
});

test('pedestrians are not placed on sidewalk lines that are already full', () => {
  const context = populationContext();
  context.nearEdges.push(straightEdge(200));
  context.sidewalkTrack = () => {
    Object.assign(context.track, { ax: 0, az: 200, ux: 0, uz: 1, len: 20, node: null, route: {} });
    return true;
  };
  const ped = { crossesStreets: false, speed: 1.4, rig: {} };
  context.trackFull = () => true;
  assert.equal(trafficFunction('spawnPed', context)(ped, 60, 280, true), false);
  context.trackFull = () => false;
  assert.equal(trafficFunction('spawnPed', context)(ped, 60, 280, true), true);
  assert.equal(context.trackLoad.get(context.track.route), 1);
  assert.equal(ped.anchorTime, 45);
});

// (A tunnel 150 m under the ground: the camera at its floor, level, looking along +z, with a 30 degree cone upwards)
function tunnelView(ground = -100, floor = -250) {
  const up = { normal: { x: 0, y: -1, z: 0.58 }, constant: floor + 2 }; // above the plane through the camera: out of view
  const open = { normal: { x: 0, y: 0, z: 1 }, constant: 1e4 };
  const context = {
    Math, hasView: true, camX: 0, camY: floor + 2, camZ: 0, groundHeight: () => ground,
    frustum: { planes: [up, open, open, open] }
  };
  context.visible = trafficFunction('visible', context);
  context.nearView = trafficFunction('nearView', context);
  return context;
}

test('a vehicle is culled at its own level, not at the ground high above its tunnel', () => {
  const { visible } = tunnelView();
  assert.equal(visible(0, 6, 1), false, 'at the ground: 150 m above the top of the view');
  assert.equal(visible(0, 6, 1, -250), true, 'at the floor: right in front of the camera');
});

test('the same on a level the camera is under: the deck of a viaduct', () => {
  const { visible } = tunnelView(-250, -250);
  assert.equal(visible(0, 6, 1, -100), false);
  assert.equal(visible(0, 6, 1), true);
});

test('nearby and visible counts the distance to its own level, for spawning and retiring', () => {
  const { nearView } = tunnelView();
  assert.equal(nearView(0, 40, 1, 100, -250), true, 'in the tunnel, 40 m ahead');
  assert.equal(nearView(0, 40, 1, 100), false, 'the ground over it is 150 m off');
});

test('a vehicle appears on the tunnel floor only where its street runs through the tunnel', () => {
  const context = {
    deckHeight: () => NaN, surfaceHeight: () => -100, roadTunnelAt: () => ({ y: -250 }), Number
  };
  const appearLevel = trafficFunction('appearLevel', context);
  const street = { x0: 0, z0: 0, dx: 0, dz: 1, span: 100 };
  assert.equal(appearLevel({ ...street, tunnel: true }, 0, 50), -250);
  assert.equal(appearLevel({ ...street, tunnel: false }, 0, 50), -100, 'a street crossing over it');
  assert.equal(appearLevel(null, 0, 50), -100, 'a car left standing');
});

test('cyclists stay out of a road closed to them, and turn off for it if they can', () => {
  const context = populationContext();
  const closed = { ...straightEdge(290), noBikes: true };
  context.nearEdges.push(closed);
  const spawnVehicle = trafficFunction('spawnVehicle', context);
  assert.equal(spawnVehicle({ half: 0.9, bike: true }, 100, 350, true), false);
  assert.equal(spawnVehicle({ half: 2.25 }, 100, 350, true), true);

  const toClosed = { to: closed, turn: 'S', out: [0] }, away = { to: {}, turn: 'R', out: [0] };
  const edge = { moves: [toClosed, away], len: 500 };
  const choose = trafficFunction('chooseMove', { Math, weights: [], nearestLane: () => 0 });
  assert.equal(choose({ bike: true, edge, lane: 0, s: 0 }, false), away);
  assert.equal(choose({ bike: true, edge: { moves: [toClosed], len: 500 }, lane: 0, s: 0 }, false), toClosed, 'its only way on');
  assert.equal(choose({ edge: { moves: [toClosed], len: 500 }, lane: 0, s: 0 }, false), toClosed);
});

test('no sidewalks through a road tunnel', async () => {
  const { createPedestrianRoutes } = await import('../js/pedestrian-routes.js');
  const routes = createPedestrianRoutes({ walkable: () => true, onSidewalk: () => true }, () => 'block');
  const street = { sx: 0, sz: 0, dx: 0, dz: 1, rx: -1, rz: 0, len: 100, half: 4, from: {}, to: {} };
  assert.ok(routes.along(street).length > 0, 'on an open street');
  assert.equal(routes.along({ ...street, tunnel: true }).length, 0);
});
