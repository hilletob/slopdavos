import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { GWR } from '../js/gwr-data.js';
import { FACADE, gwrFacade, gwrStoreyHeight, nearestGwr, gwrBuilding, MATCH_RADIUS } from '../js/gwr.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

test('the GWR extract is compact, inside the frame, and holds plausible register values', () => {
  const n = GWR.count;
  assert.ok(n > 3000 && n < 10000, `${n} buildings`);
  for (const key of ['x', 'z', 'k', 'f', 'y']) assert.equal(GWR[key].length, n, key);
  const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
  for (let i = 0; i < n; i++) {
    assert.ok(GWR.x[i] >= minX - 1 && GWR.x[i] <= maxX + 1 && GWR.z[i] >= minZ - 1 && GWR.z[i] <= maxZ + 1);
    assert.ok(Number.isInteger(GWR.f[i]) && GWR.f[i] >= 0 && GWR.f[i] < 40);
    assert.ok(GWR.y[i] === 0 || (GWR.y[i] > 1200 && GWR.y[i] <= 2030), `year ${GWR.y[i]}`);
  }
  assert.ok(GWR.k.filter((k) => k % 1000 === 211).length > 30, 'Davos has hotels');
  assert.match(GWR.source, /BFS/);
  const text = fs.readFileSync(new URL('../js/gwr-data.js', import.meta.url), 'utf8');
  assert.ok(text.length < 300 * 1024, `${text.length} bytes`);
});

test('register classes map to facade kinds', () => {
  assert.equal(gwrFacade(211, 6, 1905, 0.9), FACADE.HOTEL);
  assert.equal(gwrFacade(212, 3, 1990, 0.1), FACADE.HOTEL);
  assert.equal(gwrFacade(264, 5, 1910, 0.5), FACADE.HOTEL, 'sanatoria and clinics have balconies like hotels');
  // one-family houses: chalets before 1950, about half of the newer ones
  assert.equal(gwrFacade(110, 2, 1920, 0.99), FACADE.CHALET);
  assert.equal(gwrFacade(110, 2, 1985, 0.1), FACADE.CHALET);
  assert.equal(gwrFacade(110, 2, 1985, 0.9), FACADE.TOWNHOUSE);
  assert.equal(gwrFacade(121, 5, 1920, 0.1), FACADE.TOWNHOUSE, 'a tall house is no chalet');
  assert.equal(gwrFacade(122, 5, 1975, 0.1), FACADE.TOWNHOUSE);
  assert.equal(gwrFacade(122, 3, 1900, 0.9), FACADE.CHALET);
  assert.equal(gwrFacade(1122, 5, 1975, 0.1), FACADE.SHOPS, 'mixed use: shops on the ground floor');
  assert.equal(gwrFacade(230, 3, 1975, 0.1), FACADE.SHOPS);
  for (const k of [220, 251, 263]) assert.equal(gwrFacade(k, 3, 1975, 0.1), FACADE.PLAIN, `${k}`);
  assert.equal(gwrFacade(272, 0, 1500, 0.5), FACADE.CHURCH);
  assert.equal(gwrFacade(271, 2, 1850, 0.5), FACADE.BARN);
  assert.equal(gwrFacade(242, 1, 1980, 0.5), FACADE.SHED);
  assert.equal(gwrFacade(0, 0, 0, 0.5), FACADE.UNKNOWN);
});

test('storey heights follow the register storey count, within reason', () => {
  assert.equal(gwrStoreyHeight(FACADE.TOWNHOUSE, 0, 12), 0, 'unknown storeys: the default');
  assert.equal(gwrStoreyHeight(FACADE.BARN, 2, 8), 0);
  assert.ok(Math.abs(gwrStoreyHeight(FACADE.TOWNHOUSE, 5, 16.5) - 3) < 1e-9);
  assert.equal(gwrStoreyHeight(FACADE.HOTEL, 3, 40), 3.8);
  assert.equal(gwrStoreyHeight(FACADE.TOWNHOUSE, 8, 12), 2.5);
  assert.ok(gwrStoreyHeight(FACADE.CHURCH, 0, 14) >= 4.5);
});

test('the nearest register entry is found within the match radius only', () => {
  const i = 1234;
  assert.equal(nearestGwr(GWR.x[i] + 0.3, GWR.z[i] - 0.2), i);
  const data = { x: [0, 20], z: [0, 0] };
  assert.equal(nearestGwr(4, 0, MATCH_RADIUS, data), 0);
  assert.equal(nearestGwr(13, 0, MATCH_RADIUS, data), 1);
  assert.equal(nearestGwr(-40, 0, MATCH_RADIUS, data), -1);
  assert.equal(gwrBuilding(-1e5, -1e5, 0.5, 10).kind, FACADE.UNKNOWN);
  const shed = GWR.k.findIndex((k) => k === 242);
  assert.equal(gwrBuilding(GWR.x[shed], GWR.z[shed], 0.5, 4).kind, FACADE.SHED);
  assert.equal(gwrBuilding(GWR.x[shed], GWR.z[shed], 0.5, 14).kind, FACADE.PLAIN, 'a big garage gets windows');
});
