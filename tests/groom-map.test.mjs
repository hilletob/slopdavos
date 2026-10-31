import assert from 'node:assert/strict';
import test from 'node:test';
import { groomMap, snowClock, pisteBase, TILLER_HALF, UMAX, WEAR_AT, FULL_DAY } from '../js/groom-map.js';

// The texel of the groom map's window under world (x, z): [R, G, B, A]
const texel = (x, z) => {
  const size = Math.round(Math.sqrt(groomMap.data.length / 4)), extent = groomMap.stats.texel * size;
  const i = Math.floor(((x - groomMap.ox) / extent) * size), j = Math.floor(((z - groomMap.oz) / extent) * size);
  return [...groomMap.data.subarray((j * size + i) * 4, (j * size + i) * 4 + 4)];
};
const offset = (r) => (r / 255 * 2 - 1) * 3.5;

test('the groom map stays one texel until the groomer first lowers its tiller', () => {
  assert.equal(groomMap.data, null);
  assert.equal(groomMap.stats.gpuBytes, 4);
});

test('a pass is rasterised as a band of the tiller\'s width with its offset across the centre line', () => {
  groomMap.addSegment(100, 200, 110, 200); // eastwards
  const { size, texel: t, gpuBytes } = groomMap.stats;
  assert.equal(gpuBytes, size * size * 4);
  assert.ok(size * t >= 128, 'the window is at least 128 m square');
  const centre = texel(105.1, 200.1);
  assert.equal(centre[1], 255, 'covered');
  assert.ok(Math.abs(offset(centre[0]) - 0.125) < 0.05, `offset ${offset(centre[0])}`);
  // South of the line (+z) is to the right going east: positive offsets
  const side = texel(105.1, 201.6);
  assert.ok(Math.abs(offset(side[0]) - 1.625) < 0.05, `offset ${offset(side[0])}`);
  assert.ok(Math.abs(offset(texel(105.1, 198.4)[0]) + 1.625) < 0.05);
  // The band ends just past UMAX (the berm), a ring beyond it uncovered
  assert.equal(texel(105.1, 200 + UMAX + 0.3)[1], 0);
  assert.equal(texel(105.1, 200 + TILLER_HALF + 0.1)[1] > 0, true);
  assert.equal(texel(105.1, 220)[1], 0, 'nothing far off');
});

test('a newer pass grooms over an older one; the segments are kept to re-centre the window', () => {
  groomMap.pass++;
  snowClock.value += 3;
  groomMap.addSegment(105, 195, 105, 205); // southwards, across the first pass
  const t = texel(105.1, 201.6);
  // Now offset across the new pass (going south (+z), the right hand is west: -x)
  assert.ok(Math.abs(offset(t[0]) + 0.125) < 0.06, `offset ${offset(t[0])}`);
  assert.equal(groomMap.stats.segments, 2);
  groomMap.recentre(2000, 2000);
  assert.equal(texel(2000, 2000)[1], 0);
  groomMap.recentre(105, 200);
  assert.equal(texel(105.1, 201.6)[1], 255, 'redrawn from the segments');
});

test('the snow clock: the time of day sets the pistes\' wear, the time-lapse ages them, fresh resets it', () => {
  groomMap.setTimeOfDay('midnight');
  assert.equal(snowClock.value - pisteBase.value, WEAR_AT.midnight);
  groomMap.setTimeOfDay('midday');
  assert.ok(Math.abs(snowClock.value - pisteBase.value - WEAR_AT.midday) < 1e-9);
  assert.ok(WEAR_AT.midnight < WEAR_AT.midday && WEAR_AT.midday < WEAR_AT.golden && WEAR_AT.golden <= FULL_DAY);
  const before = groomMap.stats.pisteWear;
  groomMap.age(FULL_DAY);
  assert.ok(Math.abs(groomMap.stats.pisteWear - before - 1) < 1e-6);
  groomMap.fresh();
  assert.equal(groomMap.stats.pisteWear, 0);
  // Far into the time-lapse the stored times are re-based (the B channel keeps the recent groomings apart)
  groomMap.age(100);
  assert.ok(texel(105.1, 201.6)[2] < 255);
});
