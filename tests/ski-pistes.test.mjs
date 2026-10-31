import assert from 'node:assert/strict';
import test from 'node:test';
import { SKI_PISTES } from '../js/ski-pistes-data.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';

const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
const inMap = (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ;

test('the downhill runs of Davos: Parsenn, Jakobshorn, Schatzalp and Rinerhorn, all difficulties, inside the map', () => {
  const { runs, areas, difficulties } = SKI_PISTES;
  assert.ok(runs.length > 100, `${runs.length} runs`);
  for (const region of ['parsenn', 'jakobshorn', 'schatzalp', 'rinerhorn']) {
    assert.ok(runs.filter((r) => r.region === region).length >= 5, region);
  }
  for (const d of ['easy', 'intermediate', 'advanced']) assert.ok(runs.some((r) => r.d === d), d);
  for (const r of runs) {
    assert.ok(difficulties.includes(r.d), `${r.id}: ${r.d}`);
    assert.ok(r.pts.length >= 4 && r.pts.length % 2 === 0, r.id);
    for (let i = 0; i < r.pts.length; i += 2) assert.ok(inMap(r.pts[i], r.pts[i + 1]), `${r.id} inside the map`);
    assert.ok(r.w >= 6 && r.w <= 30, `${r.id}: ${r.w} m wide`);
    // Oriented downhill (the start no lower than the foot)
    assert.ok(r.drop >= 0, `${r.id} drops ${r.drop} m`);
    for (const [ri, vi] of r.next) assert.ok(runs[ri] && vi >= 0 && vi < runs[ri].pts.length / 2, `${r.id} links on`);
  }
  // Most runs carry on into another at their foot
  assert.ok(runs.filter((r) => r.next.length).length > runs.length * 0.6);
  const km = runs.reduce((s, r) => s + r.len, 0) / 1000;
  assert.ok(km > 60 && km < 150, `${km} km`);
  for (const a of areas) {
    assert.ok(a.ring.length >= 6 && a.ring.length % 2 === 0, a.id);
    for (let i = 0; i < a.ring.length; i += 2) assert.ok(inMap(a.ring[i], a.ring[i + 1]), `${a.id} inside the map`);
  }
  // Named runs as known: the Jakobshorn's Standard (8), the Parsenn's Weissfluhjoch - Parsennhütte (15)
  assert.ok(runs.some((r) => r.region === 'jakobshorn' && r.ref === '8' && r.d === 'easy'));
  assert.ok(runs.some((r) => r.region === 'parsenn' && /Weissfluhjoch/.test(r.name)));
});
