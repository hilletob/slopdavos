import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEPOTS, ENTER_RADIUS, VEHICLE_FOOTPRINTS, VEHICLE_LABELS, GTA_START, EXIT_MAX_AGL,
  distanceToVehicle, findEnterable, canExit, exitSpots, pickExitSpot, inSeason, seasonOf, depotsByDistance
} from '../js/vehicle-depots.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { HELIPAD } from '../js/helipad.js';

const [minX, minZ, maxX, maxZ] = DAVOS_DATA.meta.bounds;

test('depots: ids unique, known types, finite places inside the map, labelled, a season each', () => {
  const ids = new Set();
  for (const d of DEPOTS) {
    assert.ok(!ids.has(d.id), `duplicate ${d.id}`);
    ids.add(d.id);
    assert.ok(VEHICLE_LABELS[d.type], `${d.id}: unknown type ${d.type}`);
    assert.ok([d.x, d.z, d.heading].every(Number.isFinite), d.id);
    assert.ok(d.x > minX && d.x < maxX && d.z > minZ && d.z < maxZ, `${d.id} outside the map`);
    assert.ok(d.label && typeof d.label === 'string', d.id);
    assert.ok(['all', 'winter'].includes(d.season), d.id);
  }
});

test('depots: the places asked for, per type', () => {
  const of = (type) => DEPOTS.filter((d) => d.type === type);
  assert.ok(of('snowcat').length >= 6, 'six groomer depots');
  assert.ok(of('snowcat').every((d) => d.season === 'winter'), 'groomers only in winter');
  assert.ok(of('helicopter').length >= 4);
  assert.ok(of('car').length >= 2);
  assert.ok(of('cyclist').length >= 3);
  // the Rega on the hospital's pad (js/helipad.js)
  assert.ok(of('helicopter').some((d) => Math.hypot(d.x - HELIPAD.x, d.z - HELIPAD.z) < 1));
  // the stations: bikes at Davos Platz and Davos Dorf
  const station = (name) => DAVOS_DATA.stations.find((s) => s.name === name);
  for (const name of ['Davos Platz', 'Davos Dorf']) {
    const s = station(name);
    assert.ok(of('cyclist').some((d) => Math.hypot(d.x - s.x, d.z - s.z) < 40), `a bike stand at ${name}`);
  }
  // no two vehicles on top of each other
  for (const a of DEPOTS) for (const b of DEPOTS) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 8, `${a.id} / ${b.id}`);
});

test('the start: on foot by the Bahnhof Davos Platz, a bike stand and a T3 within sight (< 60 m)', () => {
  const platz = DAVOS_DATA.stations.find((s) => s.name === 'Davos Platz');
  assert.ok(Math.hypot(GTA_START.x - platz.x, GTA_START.z - platz.z) < 40);
  const nearest = (type) => depotsByDistance(DEPOTS, type, GTA_START.x, GTA_START.z)[0];
  for (const type of ['cyclist', 'car']) {
    const d = nearest(type);
    assert.ok(Math.hypot(d.x - GTA_START.x, d.z - GTA_START.z) < 60, `${type} ${d.id}`);
  }
});

test('seasons: groomers in winter only, the rest always', () => {
  assert.equal(seasonOf('snowcat'), 'winter');
  assert.equal(seasonOf('car'), 'all');
  assert.ok(inSeason({ season: 'winter' }, true));
  assert.ok(!inSeason({ season: 'winter' }, false));
  assert.ok(inSeason({ season: 'all' }, false));
  assert.ok(inSeason({}, false));
});

test('distance to a vehicle is measured to its outline, turned with its heading', () => {
  const { halfW, halfL } = VEHICLE_FOOTPRINTS.car;
  assert.equal(distanceToVehicle('car', 0, 0, 0, 0, 0), 0); // inside
  // heading 0 faces +z: the side is across x
  assert.ok(Math.abs(distanceToVehicle('car', 0, 0, 0, halfW + 2, 0) - 2) < 1e-9);
  assert.ok(Math.abs(distanceToVehicle('car', 0, 0, 0, 0, halfL + 1) - 1) < 1e-9);
  // turned a quarter: the length runs along x
  assert.ok(Math.abs(distanceToVehicle('car', 0, 0, Math.PI / 2, halfL + 1, 0) - 1) < 1e-9);
  assert.ok(Math.abs(distanceToVehicle('car', 10, 5, 0, 10, 5 + halfL + 3) - 3) < 1e-9);
});

test('getting in: the nearest vehicle within its radius; helicopter and groomer reach farther; not across a storey', () => {
  const car = { type: 'car', x: 0, z: 0, heading: 0, y: 0 };
  const bike = { type: 'cyclist', x: 6, z: 0, heading: 0, y: 0 };
  const heli = { type: 'helicopter', x: 0, z: 40, heading: 0, y: 0 };
  const cat = { type: 'snowcat', x: 40, z: 0, heading: 0, y: 0 };
  const all = [car, bike, heli, cat];
  // 3 m beside the van: in reach (3.5); 4 m: not
  assert.equal(findEnterable({ x: VEHICLE_FOOTPRINTS.car.halfW + 3, z: 0 }, [car])?.type, 'car');
  assert.equal(findEnterable({ x: -(VEHICLE_FOOTPRINTS.car.halfW + 4), z: 0 }, [car]), null);
  // between the van and the bike: the nearer wins
  assert.equal(findEnterable({ x: 4.5, z: 0 }, all).type, 'cyclist');
  assert.equal(findEnterable({ x: 2, z: 0 }, all).type, 'car');
  // the helicopter from 5.5 m off its cabin, the groomer from 4.5 m
  assert.equal(findEnterable({ x: VEHICLE_FOOTPRINTS.helicopter.halfW + 5.5, z: 40 }, all).type, 'helicopter');
  assert.equal(findEnterable({ x: 40 + VEHICLE_FOOTPRINTS.snowcat.halfW + 4.5, z: 0 }, all).type, 'snowcat');
  assert.equal(findEnterable({ x: 40 + VEHICLE_FOOTPRINTS.snowcat.halfW + 5.5, z: 0 }, all), null);
  // the radii asked for
  assert.ok(ENTER_RADIUS.car >= 3 && ENTER_RADIUS.car <= 4);
  assert.ok(ENTER_RADIUS.cyclist >= 3 && ENTER_RADIUS.cyclist <= 4);
  assert.ok(ENTER_RADIUS.helicopter <= 6 && ENTER_RADIUS.snowcat <= 5);
  // a van parked on the deck above (5 m up) is not got into from the street
  assert.equal(findEnterable({ x: 2, y: 0, z: 0 }, [{ ...car, y: 5 }]), null);
  const found = findEnterable({ x: 2, z: 0 }, [car]);
  assert.ok(Math.abs(found.distance - (2 - VEHICLE_FOOTPRINTS.car.halfW)) < 1e-9);
});

test('getting out: only at rest, the helicopter only once landed, the train only at a station', () => {
  assert.equal(canExit('car', { speed: 0 }).ok, true);
  assert.equal(canExit('car', { speed: 0.4 }).ok, true);
  assert.deepEqual(canExit('car', { speed: 4 }), { ok: false, reason: 'Stop first' });
  assert.equal(canExit('car', { speed: -3 }).ok, false); // (reversing)
  assert.equal(canExit('cyclist', { speed: 0 }).ok, true);
  assert.equal(canExit('snowcat', { speed: 0 }).ok, true);
  assert.equal(canExit('helicopter', { speed: 0, agl: 0.25 }).ok, true);
  assert.deepEqual(canExit('helicopter', { speed: 0, agl: 12 }), { ok: false, reason: 'Land first' });
  assert.equal(canExit('helicopter', { speed: 0, agl: EXIT_MAX_AGL }).ok, false);
  assert.equal(canExit('helicopter', { speed: 5, agl: 0.25 }).ok, false);
  assert.equal(canExit('rhb', { speed: 0, station: { name: 'Davos Platz' } }).ok, true);
  assert.equal(canExit('rhb', { speed: 0, station: null }).ok, false);
  assert.equal(canExit('rhb', { speed: 8, station: { name: 'Davos Platz' } }).ok, false);
  assert.equal(canExit('person', {}).ok, false);
});

test('exit spots: the driver\'s door (left) first, clear of the outline, then the other side, behind, ahead', () => {
  for (const type of Object.keys(VEHICLE_FOOTPRINTS)) {
    for (const heading of [0, 1, -2.5]) {
      const spots = exitSpots(type, 100, 50, heading);
      assert.ok(spots.length >= 6);
      for (const s of spots) assert.ok(distanceToVehicle(type, 100, 50, heading, s.x, s.z) >= 0.75, `${type} spot inside`);
      // the first on the left: the left of heading h is (cos h, -sin h)
      const first = spots[0];
      const left = (first.x - 100) * Math.cos(heading) + (first.z - 50) * -Math.sin(heading);
      assert.ok(left > 0, `${type}: the first spot is on the left`);
      assert.ok(Math.abs(first.heading - heading) < 1e-9, 'facing the way the vehicle faces');
    }
  }
});

test('the exit spot: the first free one, off the road if there is one', () => {
  const spots = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  assert.equal(pickExitSpot(spots, () => true).id, 1);
  assert.equal(pickExitSpot(spots, (s) => s.id > 2).id, 3);
  assert.equal(pickExitSpot(spots, (s) => s.id !== 1, (s) => s.id < 4).id, 4); // 2 and 3 on the road
  assert.equal(pickExitSpot(spots, (s) => s.id !== 1, () => true).id, 2); // all on the road: the first free
  assert.equal(pickExitSpot(spots, () => false), null);
});
