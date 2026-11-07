import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleArc, linePoints, polylineLength, strokePolyline, chunkCoverage } from '../js/ground-geometry.js';
import { trackLines, trackLength, fifaLines, fibaLines, itfLines, fivbLines, handballLines, frame } from '../tools/sports-templates.mjs';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b}`);

test('arcs: chords within the sagitta, a full circle closes', () => {
  const r = 40, s = 0.015, pts = sampleArc(10, -5, r, 0, Math.PI, s);
  for (let i = 2; i < pts.length; i += 2) {
    const mx = (pts[i] + pts[i - 2]) / 2 - 10, mz = (pts[i + 1] + pts[i - 1]) / 2 + 5;
    assert.ok(r - Math.hypot(mx, mz) <= s + 1e-9);
  }
  near(polylineLength(pts), Math.PI * r, 0.05, 'half circle');
  const c = sampleArc(0, 0, 9.15, 0, 2 * Math.PI);
  assert.equal(c[0], c[c.length - 2]); assert.equal(c[1], c[c.length - 1]);
});

test('stroked polylines: a mitred right angle, the road paint attributes', () => {
  const out = { positions: [], paint: [], side: [], color: [] };
  strokePolyline([0, 0, 10, 0, 10, 10], 0.1, [1, 1, 1], out);
  assert.equal(out.positions.length / 3, 12); // two quads
  assert.equal(out.side.length / 2, 12);
  // the corner vertex's offset: the mitre, w/2 · √2
  const corner = [];
  for (let i = 0; i < 12; i++) if (Math.abs(out.positions[3 * i] - 10) < 0.2 && Math.abs(out.positions[3 * i + 2]) < 0.2) corner.push(Math.hypot(out.side[2 * i], out.side[2 * i + 1]));
  assert.ok(corner.length > 0);
  for (const m of corner) near(m, 0.05 * Math.SQRT2, 1e-9, 'mitre');
  near(Math.max(...out.paint.filter((_, i) => i % 3 === 0)), 20, 1e-9, 'metres along');
  // faces up: the first triangle counter-clockwise seen from above (x east, z south: cross product < 0 in x/z)
  const [ax, , az, bx, , bz, cx, , cz] = out.positions;
  assert.ok((bx - ax) * (cz - az) - (bz - az) * (cx - ax) < 0);
  // a closed square: four quads, no end caps
  const sq = { positions: [], paint: [], side: [], color: [] };
  strokePolyline([0, 0, 5, 0, 5, 5, 0, 5, 0, 0], 0.1, [1, 1, 1], sq);
  assert.equal(sq.positions.length / 3, 24);
});

test('coverage: a chunk inside a surface, beside it, half covered, and a hole', () => {
  const ring = [0, 0, 100, 0, 100, 100, 0, 100];
  assert.equal(chunkCoverage([{ ring }], [10, 10, 50, 50]), 1);
  assert.equal(chunkCoverage([{ ring }], [200, 200, 300, 300]), 0);
  near(chunkCoverage([{ ring }], [50, 0, 150, 100]), 0.5, 0.02);
  near(chunkCoverage([{ ring, holes: [[25, 25, 75, 25, 75, 75, 25, 75]] }], [0, 0, 100, 100]), 0.75, 0.02);
});

test('the track template: lane 1 measures 400 m, the lanes 1.22 m apart', () => {
  const t = { cx: 0, cz: 0, heading: 0.7, L: 84.39, R: 36.5, lanes: 6 };
  near(trackLength(t), 400, 0.02, 'formula');
  const lines = trackLines(t);
  assert.equal(lines.length, 7 * 4 + 1);
  // lane 1 measured 0.30 m out: the same template with R + 0.3, sampled
  const one = trackLines({ ...t, R: t.R + 0.3, lanes: 0 }).slice(0, 4);
  near(one.reduce((s, l) => s + polylineLength(linePoints(l, 0.001)), 0), 400, 0.05, 'sampled');
  // every point of the outermost line 36.5 + 6·1.22 from the centre line's nearest point
  const outer = trackLines(t).slice(24, 28);
  for (const l of outer) {
    const p = linePoints(l);
    for (let i = 0; i < p.length; i += 2) {
      const u = p[i] * Math.sin(0.7) + p[i + 1] * Math.cos(0.7), v = p[i] * Math.cos(0.7) - p[i + 1] * Math.sin(0.7);
      const d = Math.abs(u) <= t.L / 2 ? Math.abs(v) : Math.hypot(Math.abs(u) - t.L / 2, v);
      near(d, 36.5 + 6 * 1.22, 0.02, 'outer lane');
    }
  }
});

test('the court templates: regulation markings inside their rectangles', () => {
  const inside = (rect, lines, pad = 0.2) => {
    for (const l of lines) {
      const p = linePoints(l);
      for (let i = 0; i < p.length; i += 2) {
        const dx = p[i] - rect.cx, dz = p[i + 1] - rect.cz;
        const u = dx * Math.sin(rect.heading) + dz * Math.cos(rect.heading), v = dx * Math.cos(rect.heading) - dz * Math.sin(rect.heading);
        assert.ok(Math.abs(u) <= rect.l / 2 + pad && Math.abs(v) <= rect.w / 2 + pad, `${u.toFixed(2)}, ${v.toFixed(2)} outside ${rect.l} × ${rect.w}`);
      }
    }
  };
  const pitch = { cx: -270, cz: -160, heading: 0.675, l: 105, w: 68 };
  const fifa = fifaLines(pitch);
  inside(pitch, fifa);
  assert.ok(fifa.some((l) => l.arc && Math.abs(l.arc[2] - 9.15) < 1e-9), 'centre circle');
  assert.equal(fifa.filter((l) => l.arc && l.arc[2] === 1).length, 4, 'corner arcs');
  // the penalty area 16.5 deep, 40.32 wide
  const f = frame(pitch), pa = fifa[4].pts, [x0, z0] = f.pt(52.5, -20.16), [x1, z1] = f.pt(36, -20.16);
  near(pa[0], x0, 1e-9); near(pa[1], z0, 1e-9); near(pa[2], x1, 1e-9); near(pa[3], z1, 1e-9);
  inside({ ...pitch, l: 60, w: 40 }, fifaLines({ ...pitch, l: 60, w: 40 }, { junior: true }));
  const court = { cx: 5, cz: 5, heading: 2.2, l: 28, w: 15 };
  const fiba = fibaLines(court);
  inside(court, fiba);
  assert.ok(fiba.some((l) => l.arc && Math.abs(l.arc[2] - 6.75) < 1e-9), 'three-point arc');
  const tennis = { cx: 0, cz: 0, heading: 0, l: 23.77, w: 10.97 };
  const itf = itfLines(tennis);
  inside(tennis, itf);
  assert.ok(itf.some((l) => Math.abs(l.pts[1] - 6.4) < 1e-9 && Math.abs(l.pts[3] - 6.4) < 1e-9), 'service line 6.40 from the net');
  inside({ ...tennis, l: 18, w: 9 }, fivbLines({ ...tennis, l: 18, w: 9 }));
  inside({ ...tennis, l: 40, w: 20 }, handballLines({ ...tennis, l: 40, w: 20 }));
});

// --- The traced data (js/ground-sports-data.js, tools/trace-ground.mjs) ----------------------------------------------
import { GROUND_SPORTS } from '../js/ground-sports-data.js';
import { WORLD_BOUNDS } from '../js/davos-frame.js';
import { orthoLevel, orthoScale } from '../js/ortho-levels.js';

const KINDS = ['tartan-red', 'tartan-blue', 'tartan-green', 'clay', 'turf', 'sand', 'asphalt', 'grass'];

test('the sports grounds: valid surfaces and lines inside their sites, in the map', () => {
  assert.ok(GROUND_SPORTS.sites.length >= 5, `${GROUND_SPORTS.sites.length} sites`);
  const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
  const finite = (a) => a.every(Number.isFinite);
  for (const s of GROUND_SPORTS.sites) {
    const [x0, z0, x1, z1] = s.box;
    assert.ok(x0 >= minX && x1 <= maxX && z0 >= minZ && z1 <= maxZ && x0 < x1 && z0 < z1, `${s.id} box`);
    const within = (ring, pad) => { for (let i = 0; i < ring.length; i += 2) assert.ok(ring[i] >= x0 - pad && ring[i] <= x1 + pad && ring[i + 1] >= z0 - pad && ring[i + 1] <= z1 + pad, `${s.id} point outside its box`); };
    for (const f of s.surfaces) {
      assert.ok(KINDS.includes(f.kind), `${s.id} kind ${f.kind}`);
      for (const r of [f.ring, ...(f.holes || [])]) { assert.ok(r.length >= 6 && r.length % 2 === 0 && finite(r), `${s.id} ring`); within(r, 2); }
    }
    for (const l of s.lines) {
      assert.ok(['w', 'y', 'b', 'r'].includes(l.c) && l.w >= 0.04 && l.w <= 0.15, `${s.id} line ${l.c} ${l.w}`);
      if (l.arc) assert.ok(finite(l.arc) && l.arc[2] > 0 && l.arc[3] < l.arc[4], `${s.id} arc`);
      else assert.ok(l.pts.length >= 4 && l.pts.length % 2 === 0 && finite(l.pts), `${s.id} polyline`);
      within(linePoints(l), 40); // (the lines may lie on a natural pitch beside the surfaces that set the box)
    }
  }
});

test('the Sportzentrum Davos Platz: the tartan ring of its six-lane track round the turf, the FIFA pitch in it', () => {
  const s = GROUND_SPORTS.sites.find((x) => x.id === 'sportzentrum');
  assert.ok(s, 'site');
  assert.ok(s.surfaces.some((f) => f.kind === 'tartan-red') && s.surfaces.some((f) => f.kind === 'turf'));
  assert.equal(s.track.lanes, 6);
  // (a short track: lane 1 measures ~395 m, the bends at the regulation 36.5 m)
  const lane1 = trackLength(s.track);
  assert.ok(lane1 > 390 && lane1 < 402, `lane 1 ${lane1.toFixed(1)} m`);
  near(s.track.R, 36.5, 0.5, 'kerb radius');
  assert.ok(s.lines.some((l) => l.arc && Math.abs(l.arc[2] - 9.15) < 0.01), 'centre circle');
  assert.ok(s.courts.some((c) => c.sport === 'football' && c.l > 95 && c.w > 60), 'football pitch');
  assert.ok(s.courts.some((c) => c.sport === 'handball') && s.courts.some((c) => c.sport === 'basketball'), 'the multi-sport court');
});

test('the orthophoto levels: by distance with hysteresis, capped in winter, the vector ground\'s coverage', () => {
  const q = { orthoFullNear: 1200, orthoFullFar: 1600, orthoFullScale: 1, orthoSmall: 1 / 8, orthoWinterLevel: 1, orthoWinterScale: 0.5, orthoSkipCoverage: 2 };
  assert.equal(orthoLevel({ d: 500, level: -1, hires: true }, q), 2);
  assert.equal(orthoLevel({ d: 500, level: -1, hires: false }, q), 1);
  assert.equal(orthoLevel({ d: 1400, level: 1, hires: false }, q), 1);
  assert.equal(orthoLevel({ d: 1400, level: 0, hires: false }, q), 0);
  assert.equal(orthoLevel({ d: 500, level: 2, hires: true, winter: true }, q), 1);
  assert.equal(orthoScale(1, true, q), 0.5);
  assert.equal(orthoScale(1, false, q), 1);
  assert.equal(orthoLevel({ d: 100, level: 1, hires: true, coverage: 1 }, q), 2, 'coverage not used yet');
  assert.equal(orthoLevel({ d: 100, level: 1, hires: true, coverage: 0.97 }, { ...q, orthoSkipCoverage: 0.95 }), 0);
});

import { GROUND_MARKINGS } from '../js/ground-markings-data.js';
import { tracedMarkings } from '../js/ground-markings-area.js';

test('the road paint traced at the Promenade: strokes and shapes in their cells, the rule-based markings stepping back there', () => {
  assert.ok(GROUND_MARKINGS.sites.length >= 4, `${GROUND_MARKINGS.sites.length} cells`);
  let strokes = 0, yellow = 0;
  for (const s of GROUND_MARKINGS.sites) {
    const [x0, z0, x1, z1] = s.box;
    for (const l of s.lines) {
      assert.ok(['w', 'y'].includes(l.c) && l.w >= 0.08 && l.w <= 0.7 && l.pts.length >= 4, `${s.id} stroke`);
      let x = 0, z = 0; for (let i = 0; i < l.pts.length; i += 2) { x += l.pts[i]; z += l.pts[i + 1]; }
      x /= l.pts.length / 2; z /= l.pts.length / 2;
      assert.ok(x >= x0 && x < x1 && z >= z0 && z < z1, `${s.id} stroke in its cell`);
      assert.ok(tracedMarkings(x, z));
      strokes++; if (l.c === 'y') yellow++;
    }
    for (const f of s.fills || []) assert.ok(f.ring.length >= 6 && f.ring.every(Number.isFinite), `${s.id} fill`);
  }
  assert.ok(strokes > 200 && yellow > 10, `${strokes} strokes, ${yellow} yellow`);
  assert.ok(!tracedMarkings(1000, 1000), 'elsewhere the rule-based markings stay');
});

import { readFileSync, existsSync } from 'node:fs';
import { GROUND_KIND_INDEX } from '../js/ground-kind-names.js';

test('the ground class maps: one PNG per listed tile, the kinds numbered as js/ground-kind-names.js says', () => {
  const dir = new URL('../data/ground-classes/', import.meta.url);
  const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'));
  assert.ok(index.tiles.length >= 1);
  for (const [name, value] of Object.entries(index.kinds)) assert.equal(value, GROUND_KIND_INDEX[name] + 1, name);
  for (const t of index.tiles) {
    assert.ok(existsSync(new URL(t.f, dir)), t.f);
    assert.ok(t.x1 > t.x0 && t.z1 > t.z0 && t.res === 0.5, t.f);
  }
  // the kinds' numbers are unique
  assert.equal(new Set(Object.values(GROUND_KIND_INDEX)).size, Object.keys(GROUND_KIND_INDEX).length);
});

import { rowsOfBays } from '../tools/markings-bays.mjs';

test('bays from the traced paint: a row of separators, the one a car hides put back, the bays between', () => {
  // five separators 2.5 m apart along x, 5 m long along z; the third hidden (a car stands on it)
  const strokes = [0, 1, 3, 4].map((k) => ({ c: 'w', w: 0.12, pts: [k * 2.5, 0, k * 2.5, 5] }));
  const rows = rowsOfBays(strokes);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].added.length, 1, 'the hidden separator');
  near(rows[0].added[0].pts[0], 5, 0.01);
  assert.equal(rows[0].bays.length, 4);
  for (const b of rows[0].bays) { near(b.w, 2.5, 0.01); near(b.l, 5, 0.01); near(b.z, 2.5, 0.01); }
  // lone bars, or bars in line (dashes), make no row
  assert.equal(rowsOfBays([{ c: 'w', w: 0.12, pts: [0, 0, 0, 5] }, { c: 'w', w: 0.12, pts: [0, 8, 0, 13] }]).length, 0);
});

test('the traced car parks: bays of plausible size with a car where the photo shows one', () => {
  const lots = GROUND_MARKINGS.sites.flatMap((s) => s.lots || []);
  assert.ok(lots.length >= 3, `${lots.length} traced lots`);
  for (const lot of lots) {
    assert.equal(lot.kind, 'traced');
    assert.ok(lot.ring.length === 8);
    for (const [x, z, angle, w, l, occupied] of lot.bays) {
      assert.ok(Number.isFinite(x + z + angle) && w >= 2 && w <= 3.6 && l >= 4 && l <= 6.5, `${lot.id}: ${w} × ${l}`);
      assert.ok(occupied === 0 || occupied === 1);
    }
  }
});
