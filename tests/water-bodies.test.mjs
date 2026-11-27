import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { BANK, apronTriangles, bedCut, groundHeight, naturalBank, onMappedWater, shorePoints, stillWater } from '../js/terrain.js';
import { decodeMarkingsCell } from '../js/ground-markings-area.js';

const byName = (name) => DAVOS_DATA.water.find((w) => w.name === name);
const SEELI = byName('Seehof Seeli');

test('still water: the lakes and ponds and the named waters freeze; the Landwasser\'s unnamed pieces run', () => {
  assert.ok(stillWater(SEELI), 'the Seehof Seeli (natural=water, named)');
  assert.ok(stillWater(byName('Davosersee')));
  assert.ok(stillWater({ kind: 'pond', name: '' }) && stillWater({ kind: 'reservoir', name: '' }));
  assert.ok(!stillWater({ kind: 'river', name: 'Landwasser' }) && !stillWater({ kind: 'wastewater', name: '' }) && !stillWater({ kind: 'basin', name: '' }));
  // (the town's unnamed natural=water below the lake: the Landwasser's pieces)
  const town = DAVOS_DATA.water.filter((w) => w.kind === 'water' && !w.name && w.ring[0] > -300 && w.ring[0] < 1000 && w.ring[1] > -600 && w.ring[1] < 200);
  assert.ok(town.length >= 10 && town.every((w) => !stillWater(w)));
});

test('the Seehof Seeli has a natural bank: level at the survey\'s surface, the banks holding it, a shelving bed', () => {
  const bank = naturalBank(SEELI, groundHeight);
  assert.ok(bank, 'a natural bank');
  assert.ok(Math.abs(bank.level - -3.2) < 0.1, `level ${bank.level}`);
  // the bank all round at or over the water within a few metres of the shore
  for (const p of shorePoints(SEELI, 3)) {
    const g = groundHeight(p.x + p.nx * 2, p.z + p.nz * 2);
    assert.ok(g > bank.level - BANK.hold, `the bank at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}: ${g.toFixed(2)}`);
  }
  // the bed: shallow at the shore, deeper out in the pond, never more than the old 2.5 m cut
  const shore = shorePoints(SEELI, 5)[0];
  const nearCut = bedCut(SEELI, bank, shore.x - shore.nx * 0.5, shore.z - shore.nz * 0.5, bank.level);
  const middle = bedCut(SEELI, bank, 727, -1419, bank.level);
  assert.ok(nearCut > 0.1 && nearCut < 0.4, `${nearCut}`);
  assert.ok(middle > nearCut && middle <= BANK.maxCut);
  // the Davosersee keeps its quays
  assert.equal(naturalBank(byName('Davosersee'), groundHeight), null);
});

test('the apron: facing up, from the water\'s height at the shore out under the bank, outside the pond', () => {
  const bank = naturalBank(SEELI, groundHeight);
  const t = apronTriangles(SEELI, bank);
  assert.ok(t.length / 9 >= SEELI.ring.length / 2);
  const y0 = bank.level + BANK.lift;
  for (let i = 0; i < t.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = t.slice(i, i + 9);
    assert.ok((bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0, 'faces up');
    for (const y of [ay, by, cy]) assert.ok(y <= y0 + 1e-6 && y >= y0 - BANK.apronFall - 1e-6);
  }
});

test('no yard of the vector ground over the Seehof Seeli: its traced cell holds one, cut where it lies on water', () => {
  const cell = decodeMarkingsCell('t5_-12', JSON.parse(readFileSync(new URL('../data/ground-markings/t5_-12.json', import.meta.url), 'utf8')));
  const yard = cell.surfaces.find((s) => s.kind === 'yard' && s.ring.some((v, i) => i % 2 === 0 && onMappedWater(DAVOS_DATA.water, v, s.ring[i + 1])));
  assert.ok(yard, 'the traced yard on the pond (the photo\'s ice)');
  assert.ok(onMappedWater(DAVOS_DATA.water, 715, -1425) && !onMappedWater(DAVOS_DATA.water, 715, -1460));
  // js/vector-ground.js drops the surfaces' triangles there
  const src = readFileSync(new URL('../js/vector-ground.js', import.meta.url), 'utf8');
  assert.match(src, /withoutWater\(withoutTrackBed\(drapeOverlay/);
});

test('the town\'s water material freezes still water by its vertices, the rest by its height', () => {
  const grid = readFileSync(new URL('../js/city-grid.js', import.meta.url), 'utf8');
  assert.match(grid, /freezeWater\(createWaterMaterial\(\), \{ still: attribute\('waterStill', 'float'\) \}\)/);
  // every water geometry carries the attribute (the merge needs the same attributes on all)
  const uses = (grid.match(/waterMat, \{ world: true \}/g) || []).length, given = (grid.match(/collect\(withWaterStill\(/g) || []).length;
  assert.ok(uses >= 3 && given === uses, `${given} of ${uses}`);
});
