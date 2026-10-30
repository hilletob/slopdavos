import assert from 'node:assert/strict';
import test from 'node:test';
import { BERGBAHNEN } from '../js/bergbahnen-data.js';

test('the funiculars: Parsennbahn in two sections and the Schatzalpbahn, climbing from the valley', () => {
  const byName = (re) => BERGBAHNEN.funiculars.filter((f) => re.test(f.label));
  assert.equal(byName(/Parsennbahn/).length, 2);
  assert.equal(byName(/Schatzalp/).length, 1);
  for (const f of BERGBAHNEN.funiculars) {
    assert.equal(f.paths.length, 2, f.label);
    assert.ok(f.rise > 250 && f.length > 600, `${f.label}: ${f.length} m, rise ${f.rise} m`);
    const p = f.paths[0];
    assert.ok(p[p.length - 2] > p[1], `${f.label} runs uphill`);
  }
});

test('the aerial tramways of the Jakobshorn, and the lifts, with stations at both ends', () => {
  const names = BERGBAHNEN.ropeways.map((r) => r.name);
  for (const n of ['Jakobshornbahn Sektion 1', 'Jakobshornbahn Sektion 2']) assert.ok(names.includes(n), n);
  for (const r of BERGBAHNEN.ropeways) {
    assert.ok(r.supports.length >= 2, r.name);
    assert.equal(r.supports[0].kind, 'station');
    assert.equal(r.supports.at(-1).kind, 'station');
    assert.ok(r.supports[0].ground <= r.supports.at(-1).ground, `${r.name} runs uphill`);
    for (const s of r.supports) assert.ok(s.y > s.ground, `${r.name}: the rope above the ground`);
  }
  assert.ok(BERGBAHNEN.ropeways.filter((r) => r.kind === 'chair_lift').length >= 5);
});
