import assert from 'node:assert/strict';
import test from 'node:test';
import { DWELL, MAX_SPEED, ARRIVE_GAP, TERMINUS_REACH, stepBus, nextStop, enterRoute, gapToBody, bodyInTheWay } from '../js/bus-stopping.js';
import { VBD_DATA } from '../js/vbd-data.js';

const STEPS = [1 / 60, 1 / 20, 0.1]; // (0.1: the cap in vbd.js update())
const routeLen = (v) => {
  let len = 0;
  for (let i = 2; i < v.pts.length; i += 2) len += Math.hypot(v.pts[i] - v.pts[i - 2], v.pts[i + 1] - v.pts[i - 1]);
  return len;
};
const newBus = (s = 0, extra = {}) => ({ s, speed: 0, dwell: 0, served: -1, ...extra });

// Runs a bus for up to `seconds`; a log of what it did, each stop's time and place, the longest it stood without reason
function run(b, route, dt, seconds, { limits = null, until = () => false } = {}) {
  const log = { stops: [], end: false, dwells: [], t: 0, maxDecel: 0, stoppedAtSpeed: [] };
  let dwellStart = 0;
  for (; log.t < seconds; log.t += dt) {
    const before = b.speed;
    const what = stepBus(b, route, dt, limits, () => 0.5);
    if (what === 'stop') { log.stops.push({ s: b.served, at: b.s, t: log.t, speedBefore: before }); dwellStart = log.t; }
    if (what === 'drive' && before > 0 && b.dwell <= 0 && dwellStart) { log.dwells.push(log.t - dwellStart); dwellStart = 0; }
    if (what === 'end') { log.end = true; break; }
    if (until(b, log)) break;
  }
  return log;
}

for (const dt of STEPS) {
  test(`a bus brakes to a stop at a stop, dwells with its doors open and leaves (dt ${dt.toFixed(3)})`, () => {
    const route = { len: 1000, stops: [{ s: 300 }, { s: 700 }] };
    const b = newBus();
    let standing = 0, moved = false;
    const limits = (bus, limit) => limit;
    const log = run(b, route, dt, 200, {
      limits,
      until: (bus) => {
        if (bus.dwell > 0) { assert.equal(bus.speed, 0, 'stands still with the doors open'); standing += dt; }
        if (standing > 0 && bus.dwell <= 0 && bus.s > 300 + 1) moved = true;
        return moved;
      }
    });
    assert.equal(log.stops.length, 1, 'stopped once');
    assert.equal(log.stops[0].s, 300);
    assert.ok(Math.abs(log.stops[0].at - 300) <= 0.2, `stands at the stop, at ${log.stops[0].at}`);
    assert.ok(log.stops[0].speedBefore < 1, `no jolt: ${log.stops[0].speedBefore} m/s just before`);
    assert.ok(standing >= DWELL[0] && standing <= DWELL[1] + 1, `dwelt ${standing} s`);
    assert.equal(b.served, 300);
    assert.ok(moved, 'drove on');
  });

  test(`a bus serves every stop of every mapped route in order, ending at its end (dt ${dt.toFixed(3)})`, () => {
    for (const v of VBD_DATA.variants) {
      const route = { len: routeLen(v), stops: v.stops };
      const b = newBus();
      const budget = route.len / 3 + v.stops.length * (DWELL[1] + 15);
      const log = run(b, route, dt, budget);
      assert.ok(log.end, `${v.ref} ${v.to}: at the end within ${budget} s (at ${b.s} of ${route.len})`);
      const served = log.stops.map((x) => x.s), last = v.stops[v.stops.length - 1];
      assert.deepEqual(served, v.stops.map((st) => st.s), `${v.ref} ${v.to}: every stop`);
      assert.equal(b.served, last.s);
      for (const x of log.stops) assert.ok(Math.abs(x.at - x.s) < 0.3, `${v.ref}: at ${x.s}, stood at ${x.at}`);
    }
  });

  test(`a bus held up just short of a stop, or released by the player there, still gets there (dt ${dt.toFixed(3)})`, () => {
    const route = { len: 400, stops: [{ s: 200 }, { s: 399.9 }] };
    for (const start of [199.95, 199.8, 199.5, 199, 195, 150]) {
      // ...as the player leaves it: released, standing, with the doors open for a while
      const b = newBus(start, { dwell: DWELL[0], served: -1 });
      const log = run(b, route, dt, 60, { until: (bus) => bus.served === 200 });
      assert.equal(b.served, 200, `from ${start}: served in ${log.t} s`);
    }
    // A car standing in the way 5 m short of the stop (for 20 s): the bus waits behind it, then pulls up
    const b = newBus(120);
    let t = 0;
    const log = run(b, route, dt, 90, { limits: (bus, limit) => { t += dt; return t < 40 ? Math.min(limit, bus.s < 195 ? limit : 0) : limit; }, until: (bus) => bus.served === 200 });
    assert.equal(b.served, 200, `served in ${log.t} s`);
    assert.ok(log.t > 40);
    // Pushed past a stop, the bus does not reverse or stall: on to the next
    const past = newBus(205);
    assert.equal(nextStop(route.stops, past.s, past.served).s, 399.9);
  });

  test(`a bus at the end of its route gets off it, even with a stop right at its end (dt ${dt.toFixed(3)})`, () => {
    for (const lastToEnd of [0, ARRIVE_GAP / 2, 0.5, 3.7, 19]) {
      const route = { len: 300, stops: [{ s: 100 }, { s: 300 - lastToEnd }] };
      const b = newBus(50);
      const log = run(b, route, dt, 120);
      assert.ok(log.end, `${lastToEnd} m before the end: reached it (at ${b.s})`);
      assert.equal(b.served, 300 - lastToEnd);
      assert.equal(b.speed, 0);
    }
    // No stop near the end: it brakes for it instead of standing on its nose
    const b = newBus(0);
    const route = { len: 300, stops: [{ s: 50 }] };
    let fastest = 0;
    run(b, route, dt, 90, { until: (bus) => { if (bus.s > 299.5) fastest = Math.max(fastest, bus.speed); return false; } });
    assert.ok(fastest < 3, `${fastest} m/s in the last half metre`);
  });
}

test('on its next route a bus lays over at the terminus, with its tail at the start, and serves the stops beyond', () => {
  const route = { len: 800, stops: [{ s: 0 }, { s: 9.6 + TERMINUS_REACH - 1 }, { s: 9.6 + TERMINUS_REACH + 1 }, { s: 500 }] };
  const b = newBus(0);
  enterRoute(b, route, 9.6);
  assert.equal(b.s, 9.6);
  assert.equal(b.dwell, DWELL[1], 'a layover');
  assert.equal(b.speed, 0);
  assert.equal(b.served, route.stops[1].s, 'the stops at the terminus count as served');
  const log = run(b, route, 1 / 30, 300, { until: (bus) => bus.served === 500 });
  assert.deepEqual(log.stops.map((x) => x.s), [route.stops[2].s, 500]);
});

test('a bus in a mid-route spawn does not go back for the stops behind it', () => {
  const stops = [{ s: 0 }, { s: 100 }, { s: 200 }];
  assert.equal(nextStop(stops, 150, -1).s, 200);
  assert.equal(nextStop(stops, 201, -1).s, 200, 'just past it: still the stop');
  assert.equal(nextStop(stops, 204, -1), null);
  assert.equal(nextStop(stops, 100, 100).s, 200, 'served: on to the next');
});

test('a bus at full speed brakes in time from any route position', () => {
  const route = { len: 2000, stops: [{ s: 1000 }] };
  const b = newBus(700, { speed: MAX_SPEED });
  const log = run(b, route, 1 / 20, 120, { until: (bus) => bus.served === 1000 });
  assert.equal(log.stops.length, 1);
  assert.ok(Math.abs(b.s - 1000) < 0.2, `at ${b.s}`);
});

test('a bus keeps behind a bus of another route in its lane, and only the rear one waits', () => {
  // Heading +z along x = 0 (sample: the point at s), the other bus 12 m long
  const sample = (s) => ({ x: 0, z: s, dx: 0, dz: 1 });
  const body = (z, cos = 1) => ({ x: 0, z, y: 0, sin: 0, cos, halfW: 1.275, halfL: 6 });
  assert.equal(gapToBody(sample, 0, body(30), 60, 0), 24, 'gap to its tail');
  assert.equal(gapToBody(sample, 0, body(-30), 60, 0), Infinity, 'behind: no');
  assert.equal(gapToBody(sample, 0, body(30, -1), 60, 0), Infinity, 'oncoming: no');
  assert.equal(gapToBody(sample, 0, { ...body(30), x: 3.4 }, 60, 0), Infinity, 'the next lane: no');
  assert.equal(gapToBody(sample, 0, { ...body(30), y: 8 }, 60, 0), Infinity, 'on a bridge overhead: no');
  // Overlapping: exactly one of the two waits, the one with its nose behind
  const noseA = 0, noseB = 3;
  const A = body(noseA - 6), B = body(noseB - 6);
  const aWaits = gapToBody(sample, noseA, B, 60, 0), bWaits = gapToBody(sample, noseB, A, 60, 0);
  assert.equal(aWaits, 0, 'the rear one waits');
  assert.equal(bWaits, Infinity, 'the front one goes');
  const same = gapToBody(sample, 0, body(-6), 60, 0);
  assert.equal(same, Infinity, 'side by side, noses level: nobody waits for ever');
});

test('the place a bus enters a route is taken by a bus standing there, not by one in the opposite lane', () => {
  const o = { x: 0, z: 0, sin: 0, cos: 1, halfW: 1.275, halfL: 6 };
  assert.ok(bodyInTheWay(0, 10, 4.8, 1.275, o));
  assert.ok(!bodyInTheWay(0, 20, 4.8, 1.275, o));
  assert.ok(!bodyInTheWay(3.4, 0, 4.8, 1.275, o));
});
