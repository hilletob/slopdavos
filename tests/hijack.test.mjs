import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findTakeableCar, findTakeableBike, findTakeableBus, holdVehicle, parkVehicle, releaseVehicle, inService, shouldRelease,
  missionAllowsTakeover, driveFor, trafficLabel, TAKE_RADIUS, TAKE_MAX_SPEED, RELEASE_DISTANCE
} from '../js/hijack.js';
import {
  clipTriangles, roundedRectProfile, bellowsPositions, bellowsIndex, bellowsRingCount, trailerYaw, solveTrailerAxle, MAX_BEND
} from '../js/bus-joint.js';
import { exitSpots } from '../js/vehicle-depots.js';

// A traffic car as js/traffic.js has it: heading east (yaw pi/2), 4.5 m long, 1.8 m wide
const car = (over = {}) => ({ bodyType: 'sedan', isPolice: false, half: 2.25, halfWidth: 0.9, x: 0, z: 0, y: 0, yaw: Math.PI / 2, yawOffset: 0, speed: 0, edge: {}, ...over });

test('a car of the traffic is taken only standing or crawling, from beside it', () => {
  const c = car();
  // 2 m beside its flank (north of it): in reach; 4 m: not
  assert.equal(findTakeableCar({ x: 0, z: -(0.9 + 2), y: 0 }, [c])?.car, c);
  assert.equal(findTakeableCar({ x: 0, z: -(0.9 + 4), y: 0 }, [c]), null);
  // off its nose (east): the outline counts, not the centre
  assert.equal(findTakeableCar({ x: 2.25 + 2.5, z: 0 }, [c])?.car, c);
  // moving at 4 m/s or more: no
  assert.equal(findTakeableCar({ x: 0, z: -2 }, [car({ speed: TAKE_MAX_SPEED.car })]), null);
  assert.ok(findTakeableCar({ x: 0, z: -2 }, [car({ speed: 3.5 })]));
  // not on a road (waiting in the pool), held by the player, a bike, a bus: no
  for (const o of [{ edge: null }, { held: true }, { bike: true }, { bus: true }]) assert.equal(findTakeableCar({ x: 0, z: -2 }, [car(o)]), null);
  // on a bridge above / a street below: no
  assert.equal(findTakeableCar({ x: 0, z: -2, y: 6 }, [c]), null);
  // the nearest of two
  const far = car({ x: 0, z: -4 });
  assert.equal(findTakeableCar({ x: 0, z: -2.2 }, [far, c]).car, far);
  assert.equal(TAKE_RADIUS.car, 3);
});

test('a car left standing by the player is found again (parked), and only then', () => {
  const c = parkVehicle(car(), { x: 10, z: 0, yaw: 0 });
  assert.equal(findTakeableCar({ x: 10 + 0.9 + 1, z: 0 }, [c]), null, 'not as a car on the road');
  assert.equal(findTakeableCar({ x: 10 + 0.9 + 1, z: 0 }, [c], { parked: true, maxSpeed: Infinity }).car, c);
});

test('the traffic pool keeps a taken car\'s slot: held, parked, back in service', () => {
  const c = car({ conn: {}, move: {}, speed: 3, blink: 1 });
  assert.ok(inService(c));
  holdVehicle(c);
  assert.equal(c.edge, null, 'off its lane (occupancy is rebuilt from the edges)');
  assert.equal(c.conn, null);
  assert.ok(c.held && !inService(c), 'the pool does not spawn it elsewhere');
  parkVehicle(c, { x: 5, z: 6, yaw: 1 });
  assert.ok(c.parked && !c.held && !inService(c));
  assert.deepEqual([c.x, c.z, c.prevX, c.prevZ, c.speed, c.blink], [5, 6, 5, 6, 0, 0]);
  assert.ok(Math.abs(c.tx - Math.sin(1)) < 1e-12 && Math.abs(c.tz - Math.cos(1)) < 1e-12);
  releaseVehicle(c);
  assert.ok(inService(c) && c.edge === null, 'back in the pool, to be spawned like any car that left the area');
  // the pool's size never changes: the same objects
  const pool = [car(), car(), car()];
  holdVehicle(pool[1]);
  assert.equal(pool.length, 3);
  assert.deepEqual(pool.map(inService), [true, false, true]);
});

test('vehicles left standing go back into service beyond RELEASE_DISTANCE', () => {
  assert.equal(RELEASE_DISTANCE, 600);
  assert.equal(shouldRelease({ x: 0, z: 0 }, 400, 400), false);
  assert.equal(shouldRelease({ x: 0, z: 0 }, 500, 400), true);
});

test('bikes are taken only standing', () => {
  const b = { bike: true, edge: {}, x: 0, z: 0, yaw: 0, half: 0.9, halfWidth: 0.3, speed: 0 };
  assert.equal(findTakeableBike({ x: 1.5, z: 0 }, [b]).bike, b);
  assert.equal(findTakeableBike({ x: 1.5, z: 0 }, [{ ...b, speed: 4 }]), null);
});

test('a bus is driven off only standing at a stop with its doors open, or where the player left it', () => {
  const bodies = [{ x: 0, z: 0, y: 0, sin: 0, cos: 1, halfW: 1.28, halfL: 6 }];
  const at = { x: 1.28 + 2, z: 3 };
  assert.ok(findTakeableBus(at, [{ dwell: 8, speed: 0 }], bodies), 'at a stop');
  assert.equal(findTakeableBus(at, [{ dwell: 0, speed: 0 }], bodies), null, 'held up in the traffic: no');
  assert.equal(findTakeableBus(at, [{ dwell: 0, speed: 6 }], bodies), null, 'driving: no');
  assert.equal(findTakeableBus(at, [{ dwell: 8, held: true }], bodies), null, 'the player\'s');
  assert.ok(findTakeableBus(at, [{ dwell: 0, parked: true }], bodies), 'left standing');
  assert.equal(findTakeableBus({ x: 8, z: 3 }, [{ dwell: 8, speed: 0 }], bodies), null, 'too far');
});

test('during a mission vehicles are taken only where it allows it', () => {
  assert.equal(missionAllowsTakeover(null), true);
  assert.equal(missionAllowsTakeover({ phase: 'running', def: {}, index: 0 }), false);
  assert.equal(missionAllowsTakeover({ phase: 'running', def: { allowTakeover: true }, index: 0 }), true);
  assert.equal(missionAllowsTakeover({ phase: 'running', def: { objectives: [{ allowTakeover: true }] }, index: 0 }), true);
  assert.equal(missionAllowsTakeover({ phase: 'intro', def: { allowTakeover: true }, index: 0 }), false);
});

test('the taken bodies drive with their own handling: the bus slow, wide-turning', () => {
  const sedan = driveFor('car', { wheelbase: 2.76 }), bus = driveFor('bus', { wheelbase: 5.9 });
  for (const d of [sedan, bus]) for (const k of ['speed', 'reverseSpeed', 'acceleration', 'rolling', 'drag', 'coast', 'brake', 'wheelbase', 'grip', 'cornering']) assert.ok(d[k] > 0, k);
  assert.ok(bus.speed < sedan.speed && bus.acceleration < sedan.acceleration);
  // the turning circle at parking speed grows with the wheelbase (atan(L * a / v^2) capped at 0.6 rad): R = L / tan(0.6)
  assert.ok(bus.wheelbase / Math.tan(0.6) > 2 * sedan.wheelbase / Math.tan(0.6));
  assert.equal(trafficLabel({ bodyType: 'suv' }), 'SUV');
  assert.equal(trafficLabel({ bodyType: 'sedan', isPolice: true }), 'patrol car');
});

test('the pedestrian gets out beside a taken bus, not inside it', () => {
  const spots = exitSpots('car', 0, 0, 0, { halfW: 1.28, halfL: 6, door: 4.6 });
  assert.ok(Math.abs(spots[0].x) > 1.28 + 0.5, 'beside its flank');
  assert.ok(Math.abs(spots[0].z - 4.6) < 1e-9, 'by the front door');
});

// --- The articulated bus's joint ---------------------------------------------------------------------------------------
test('the cars are cut cleanly at the plane: nothing beyond it, the crossing triangles clipped', () => {
  // one triangle across z = 0, one wholly behind it
  const position = new Float32Array([0, 0, -1, 1, 0, 1, 0, 1, 1, 0, 0, -3, 1, 0, -2, 0, 1, -2]);
  const normal = new Float32Array(18).fill(0).map((_, i) => (i % 3 === 0 ? 1 : 0));
  const part = new Float32Array(6);
  const front = clipTriangles(position, normal, part, 0, 1);
  const zs = []; for (let i = 2; i < front.position.length; i += 3) zs.push(front.position[i]);
  assert.ok(zs.every((z) => z >= 0), 'all on the front side');
  assert.ok(zs.filter((z) => z === 0).length >= 2, 'the cut edge lies on the plane');
  const rear = clipTriangles(position, normal, part, 0, -1);
  const rz = []; for (let i = 2; i < rear.position.length; i += 3) rz.push(rear.position[i]);
  assert.ok(rz.every((z) => z <= 0));
  assert.equal(rear.position.length / 9, 2, 'the whole triangle behind and the clipped corner');
});

test('the bellows close the gap between the end walls, straight and in a bend, and fold inside, stretch outside', () => {
  const profile = roundedRectProfile(1.2, 0.35, 3.0, 0.26, 0.05, 4);
  const n = profile.length, rings = bellowsRingCount(), gap = 0.9;
  assert.equal(bellowsIndex(rings, n).length, (rings - 1) * n * 6);
  for (const bend of [0, 0.35, -MAX_BEND]) {
    const p = bellowsPositions(bend, gap, profile);
    // the first ring on the front car's end wall (z = gap/2), the last on the rear car's (turned by `bend`)
    for (let k = 0; k < n; k++) {
      assert.ok(Math.abs(p[k * 3 + 2] - gap / 2) < 1e-5);
      assert.ok(Math.abs(p[k * 3] - profile[k][0]) < 1e-5);
      const o = ((rings - 1) * n + k) * 3, [x] = profile[k];
      // on the rear wall: local (x, -gap/2) turned by bend
      const ex = x * Math.cos(bend) - gap / 2 * Math.sin(bend), ez = -x * Math.sin(bend) - gap / 2 * Math.cos(bend);
      assert.ok(Math.abs(p[o] - ex) < 1e-5 && Math.abs(p[o + 2] - ez) < 1e-5, `rear ring at bend ${bend}`);
    }
  }
  // bent (the rear car turned positive): one side folds up, the other stretches, against the straight bellows
  const k = profile.findIndex(([x]) => x > 1.19), kk = profile.findIndex(([x, y]) => Math.abs(x + profile[k][0]) < 1e-6 && Math.abs(y - profile[k][1]) < 1e-6);
  const span = (pos, k0) => { let L = 0; for (let r = 1; r < rings; r++) { const a = ((r - 1) * n + k0) * 3, b = (r * n + k0) * 3; L += Math.hypot(pos[b] - pos[a], pos[b + 2] - pos[a + 2]); } return L; };
  const straight = bellowsPositions(0, gap, profile), bent = bellowsPositions(0.4, gap, profile);
  assert.ok(Math.abs(span(straight, k) - span(straight, kk)) < 1e-4);
  const [inner, outer] = [span(bent, k), span(bent, kk)].sort((a, b) => a - b);
  assert.ok(inner < span(straight, k) && outer > span(straight, k), 'one side folded up, the other stretched');
});

test('the rear car follows its hinge: it straightens out driving on, never bends beyond MAX_BEND', () => {
  let rear = 0;
  // the front car turned to 0.5 rad, driving on at 5 m/s: the rear car comes round
  for (let i = 0; i < 400; i++) rear = trailerYaw(rear, 0.5, 5, 0.02, 5);
  assert.ok(Math.abs(rear - 0.5) < 0.01);
  // a sharp turn at once: held at MAX_BEND
  assert.ok(Math.abs(trailerYaw(0, 1.5, 0, 0.02, 5) - (1.5 - MAX_BEND)) < 1e-9);
  // along a route: the axle on the route `arm` m from the hinge (a straight route: exactly arm behind)
  const line = (s) => ({ x: s, z: 0 });
  const s = solveTrailerAxle(line, 100, { x: 100, z: 0 }, 5);
  assert.ok(Math.abs(s - 95) < 1e-3);
  // a circle of radius 20: the chord from the hinge is arm long
  const R = 20, circle = (q) => ({ x: R * Math.sin(q / R), z: R - R * Math.cos(q / R) });
  const h = circle(50), q = solveTrailerAxle(circle, 50, h, 5), a = circle(q);
  assert.ok(Math.abs(Math.hypot(a.x - h.x, a.z - h.z) - 5) < 1e-3);
});
