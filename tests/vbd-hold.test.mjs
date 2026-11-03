import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { vehicleContact } from '../js/vehicle-physics.js';
import { clearSpotBeside } from '../js/hijack.js';

// js/vbd.js builds three.js scenery, so its hold() is taken from the source and run on its own over plain bodies.
const source = readFileSync(new URL('../js/vbd.js', import.meta.url), 'utf8');
const from = source.indexOf('const setBody ='), to = source.indexOf('// { x, y (the ground under the front car', from);
const makeHold = new Function('buses', 'bodies', `${source.slice(from, to)}\nreturn hold;`);

test('a bus taken at a stop leaves no body behind for this frame\'s collidePlayer to shove the player out of', () => {
  const bus = { art: true, speed: 0, yaw: 0, rearBody: { x: 1e7, z: 1e7, own: false } };
  const body = { x: 10, z: 20, prevX: 10, prevZ: 20, y: 0, sin: 0, cos: 1, halfW: 1.275, halfL: 9.1, mass: 2e4, vx: 0, vz: 0, angularVel: 0 };
  const hold = makeHold([bus], [body]);
  // the player's car set down where the bus stands, as js/gta-takeover.js take() does
  const car = { x: 10, z: 20, prevX: 10, prevZ: 20, sin: 0, cos: 1, halfW: 1.28, halfL: 6, mass: 2e4, vx: 0, vz: 0, angularVel: 0 };
  assert.ok(vehicleContact(car, body, {}), 'the car stands inside the bus until it is held');
  hold(bus);
  assert.equal(bus.held, true);
  assert.ok(!vehicleContact(car, body, {}), 'held: the bus\'s own body is out of the way at once');
  assert.ok(body.x > 1e6 && body.prevX > 1e6, 'its body parked far away, as for pose()');
  assert.equal(bus.rearBody.own, true, 'the rear car counts as the player\'s from the start');
});

test('a bus taken where its lane clips a house is set beside it, towards the road first', () => {
  // heading +z (yaw 0): its left is +x
  assert.deepEqual(clearSpotBeside(5, 5, 0, () => true), { x: 5, z: 5 }, 'clear: stays where it stands');
  const left = clearSpotBeside(0, 0, 0, (x) => x >= 1.5);
  assert.ok(Math.abs(left.x - 1.5) < 1e-9 && Math.abs(left.z) < 1e-9, 'the nearest clear spot on the left');
  const right = clearSpotBeside(0, 0, 0, (x) => x <= -2);
  assert.ok(Math.abs(right.x + 2) < 1e-9, 'the right when only that is clear');
  const both = clearSpotBeside(0, 0, 0, (x) => Math.abs(x) >= 1);
  assert.ok(both.x > 0, 'the left wins a tie');
  assert.equal(clearSpotBeside(0, 0, 0, () => false), null, 'nothing near: the caller keeps its place');
});
