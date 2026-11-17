import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { BERGBAHNEN } from '../js/bergbahnen-data.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { funicularTrack, funicularTunnels, trackLength } from '../js/funicular-track.js';

// js/bergbahnen.js's terminal plan (its three.js imports stubbed: only the table is needed)
const require = createRequire(import.meta.url);
const { loadModule } = require('./helpers/module.cjs');
const stub = new Proxy({}, { get: () => undefined });
const { LIFT_TERMINALS, LIFT_PORTALS } = loadModule(readFileSync(new URL('../js/bergbahnen.js', import.meta.url), 'utf8'), {
  imports: {
    ...Object.fromEntries(['three/webgpu', 'three/tsl', 'three/addons/utils/BufferGeometryUtils.js', 'three/addons/geometries/RoundedBoxGeometry.js', './tsl-materials.js', './quality.js'].map((k) => [k, stub])),
    './terrain.js': { groundHeight: () => 0, funicularEnclosedAt: () => false },
    './bergbahnen-data.js': { BERGBAHNEN }, './davos-geodata.js': { DAVOS_DATA }, './swissbuildings3d.js': { excludeBuildings() {}, carveBuildings() {} },
    './funicular-track.js': { funicularTrack }
  },
  globals: { Math, Number, Map, Infinity },
  filename: 'bergbahnen.js'
});

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

test('the T-bars, drag lifts, gondolas and tramways get terminals at both ends, beside the buildings already mapped', () => {
  const lifts = BERGBAHNEN.ropeways.filter((r) => r.kind !== 'chair_lift');
  assert.equal(LIFT_TERMINALS.length, lifts.length * 2);
  const end = (name, valley) => LIFT_TERMINALS.find((t) => t.lift === name && t.valley === valley);
  for (const t of LIFT_TERMINALS) {
    assert.ok(['frame', 'housed', 'station', 'shared', 'custom'].includes(t.mode), `${t.lift}: ${t.mode}`);
    if (t.type === 'tbar') assert.ok(t.mode !== 'station', `${t.lift}: a T-bar gets a frame, not a hall`);
    if (t.mode === 'housed') assert.ok(t.exit >= 0 && t.exit < 60, `${t.lift}: the cable exit ${t.exit} m out`);
    if (t.hut || t.rack) assert.ok(t.valley && t.mode === 'frame', `${t.lift}: hut and rack at the valley end only`);
  }
  // the Jakobshornbahn's own valley station; its other ends and the Rinerhornbahn's in their swissBUILDINGS3D buildings
  assert.equal(end('Jakobshornbahn Sektion 1', true).mode, 'custom');
  for (const [name, valley] of [['Jakobshornbahn Sektion 1', false], ['Jakobshornbahn Sektion 2', true], ['Rinerhornbahn', true], ['Rinerhornbahn', false], ['Pischabahn', true]]) assert.equal(end(name, valley).mode, 'housed', name);
  assert.equal(end('Güggel', false).mode, 'station');
  assert.equal(end('Jatz Junior', true).mode, 'frame');
  assert.ok(end('Jatz Junior', true).hut && !end('Jatz Junior', false).hut);
  // every housed end's cable exit on the drawn wall (LIFT_PORTALS, measured against swissBUILDINGS3D): within a
  // few metres of the OSM footprint's, the wall running on across the rope
  for (const t of LIFT_TERMINALS.filter((t) => t.mode === 'housed')) {
    assert.ok(t.facade, `${t.lift} (${t.valley ? 'valley' : 'top'}): no measured facade`);
    assert.ok(Math.abs(t.facade.d - t.facade.osm) < 6.5, `${t.lift}: the facade ${t.facade.d} m against the footprint's ${t.facade.osm} m`);
    assert.ok(t.facade.left + t.facade.right > 1 && t.facade.top > t.facade.foot0, t.lift);
  }
  for (const k of Object.keys(LIFT_PORTALS)) assert.ok(LIFT_TERMINALS.some((t) => t.facade === LIFT_PORTALS[k]), `${k}: no such housed end`);
  // the three short drag lifts end to end at the Schatzalp: one terminal where one ends and the next begins
  assert.equal(LIFT_TERMINALS.filter((t) => t.kind === 'drag_lift' && t.mode === 'shared').length, 2);
});

test('the funiculars\' track: a smooth grade line, never under the ground in the open, the stations where they were', () => {
  for (const f of BERGBAHNEN.funiculars) {
    const [p, q] = funicularTrack(f);
    assert.equal(p.length, f.paths[0].length / 3);
    // the ends stay at the stations (within a few centimetres)
    assert.ok(Math.hypot(p[0].x - f.paths[0][0], p[0].z - f.paths[0][2]) < 0.01, f.label);
    let s = 0, worst = Infinity, kink = 0;
    for (let i = 1; i < p.length - 1; i++) {
      if (!p[i].tunnel) worst = Math.min(worst, p[i].y - p[i].ground);
      const a = Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z), b = Math.hypot(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z);
      kink = Math.max(kink, Math.abs((p[i + 1].y - p[i].y) / b - (p[i].y - p[i - 1].y) / a) / ((a + b) / 2));
      s += a;
    }
    assert.ok(worst > -0.15, `${f.label}: ${worst.toFixed(2)} m under the ground`);
    assert.ok(1 / kink > 40, `${f.label}: a vertical curve of ${(1 / kink).toFixed(0)} m`);
    // both cars' paths agree where they run together
    assert.ok(Math.abs(q[0].y - p[0].y) < 0.01 && Math.abs(q.at(-1).y - p.at(-1).y) < 0.01);
    assert.ok(trackLength(p) > s);
  }
  // the tunnels with a portal: the Parsennbahn's three (Salzgäba, the mid-line one, the Weissfluhjoch's); the Schatzalpbahn's
  // short ones at its stations are the stations' covers
  const t = funicularTunnels();
  assert.equal(t.filter((x) => /Parsenn/.test(x.name)).length, 3);
  assert.equal(t.filter((x) => /Schatzalp/.test(x.name)).length, 0);
});
