import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EISSTADION, KONGRESS, EISBAHN, PARSENN, DORF, PLATZ, ARKADEN, LANDMARK_EXCLUSIONS, stadiumVerge, stadiumFacets, stadiumRoofHeight, trackOutline,
  ringPoints, ringArea, pointInRing
} from '../js/landmark-buildings-data.js';
import { lv95ToWorld } from '../js/davos-frame.js';
import { TELEPORT_LOCATIONS } from '../js/city-config.js';

test('the Eisstadion: the surveyed roof over the stands\' octagon, 33 m over the ground, the glazed gables and the annex under it', () => {
  const S = EISSTADION, verge = stadiumVerge(S), ring = S.outline.map((p) => [p.x, p.z]);
  assert.equal(S.outline.filter((p) => p.corner).length, 4);
  assert.equal(S.outline.filter((p) => p.gable).length, 4);
  // the roof's edge: four gable tops (named after the outline's gables) and the eaves points at the corners, all inside
  // the outline; every surveyed triangle of the roof has its three points
  assert.equal(verge.length, 17);
  assert.deepEqual(verge.filter((p) => p.kind === 'gable').map((p) => p.name).sort(), ['ESE', 'NNE', 'SSW', 'WNW']);
  assert.ok(verge.every((p) => pointInRing(ring, p.x, p.z)));
  assert.equal(stadiumFacets(S).length, S.faces.length);
  assert.ok(S.faces.every((f) => f.every((i) => i >= 0 && i < 1 + S.kinks.length + S.verge.length)));
  // about 109 m across (the outline), the roof itself ~90 m
  const span = (pts) => { const xs = pts.map((p) => p.x ?? p[0]), zs = pts.map((p) => p.z ?? p[1]); return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)); };
  assert.ok(span(S.outline) > 100 && span(S.outline) < 115, `outline ${span(S.outline)}`);
  assert.ok(span(verge) > 80 && span(verge) < 100, `roof ${span(verge)}`);
  // Heights over the ground (swissBUILDINGS3D: the floor at the eaves, 1547.7 m a.s.l., the ground 1537.3 m): the apex
  // 33.1 m and the highest point, the gable tops 22.7–24.5 m, the eaves 10.4 m, the stands' flat roof at the eaves out to
  // the outline, nothing outside it
  const apex = stadiumRoofHeight(S.apex.x, S.apex.z);
  assert.ok(Math.abs(apex - 33.1) < 0.05, `apex ${apex}`);
  for (const p of verge) assert.ok(p.h < apex && p.h >= S.eaves);
  for (const p of verge.filter((v) => v.kind === 'gable')) assert.ok(p.h > 22 && p.h < 25, `${p.name} ${p.h}`);
  for (const p of verge.filter((v) => v.kind === 'eaves')) assert.equal(p.h, S.eaves);
  assert.ok(S.eaves > 10 && S.eaves < 11);
  for (const { x, z } of S.outline.filter((p) => p.corner)) assert.equal(stadiumRoofHeight(x + (S.apex.x - x) * 0.02, z + (S.apex.z - z) * 0.02), S.eaves);
  assert.equal(stadiumRoofHeight(S.apex.x + 80, S.apex.z), null);
  // the roof rises from the eaves everywhere just inside its edge, and is continuous across the ridges' kinks
  for (const p of verge) {
    const h = stadiumRoofHeight(S.apex.x + (p.x - S.apex.x) * 0.98, S.apex.z + (p.z - S.apex.z) * 0.98);
    assert.ok(h !== null && h > p.h && h < p.h + 1, `(${p.x}, ${p.z}): ${h}`);
  }
  for (const [x, z, h] of S.kinks) assert.ok(Math.abs(stadiumRoofHeight(x, z) - S.eaves - h) < 1e-6);
  // every corner of the annex lies under the roof, with room for a box over the stands' roof
  for (const [x, z] of S.annex.ring) {
    const h = stadiumRoofHeight(x, z);
    assert.ok(h !== null && h >= S.eaves, `(${x}, ${z}): ${h}`);
  }
  assert.ok(S.annex.high > S.eaves + 2 && S.annex.high < stadiumRoofHeight(...S.outline.find((p) => p.gable === 'NNE').top));
  // the teleport target "Eisstadion" lies next to it
  const t = TELEPORT_LOCATIONS.eisstadion;
  assert.ok(Math.hypot(t.x - S.apex.x, t.z - S.apex.z) < 80);
});

test('the Kongresszentrum: surveyed parts with a kind each, the hall, the hotel and the pool where they stand', () => {
  const K = KONGRESS, kinds = new Set(['gisel', 'hall', 'north', 'eau', 'hotel', 'canopy']);
  for (const p of K.parts) {
    assert.ok(kinds.has(p.kind), p.kind);
    assert.equal(p.ring.length % 2, 0);
    const pts = ringPoints(p.ring);
    assert.ok(pts.length >= 3);
    assert.ok(Math.abs(ringArea(pts)) > 4);
    assert.ok(p.h > 5 && p.h < 40);
  }
  const area = (kind) => K.parts.filter((p) => p.kind === kind).reduce((s, p) => s + Math.abs(ringArea(ringPoints(p.ring))), 0);
  // the hall ~2600 m², the eau-là-là and Gisel's house a few thousand each, the hotel the tallest
  assert.ok(area('hall') > 2400 && area('hall') < 2800, `hall ${area('hall')}`);
  assert.ok(area('eau') > 2500 && area('gisel') > 3000, `eau ${area('eau')}, gisel ${area('gisel')}`);
  const tallest = K.parts.reduce((a, b) => (b.h > a.h ? b : a));
  assert.equal(tallest.kind, 'hotel');
  // the Kongress Hotel's address point (Promenade 94, OSM w117012158's centre) inside the hotel's main part
  const hotel = ringPoints(K.parts.find((p) => p.kind === 'hotel' && p.h === 32.5).ring);
  assert.ok(pointInRing(hotel, 182, -615));
  // the pool and the slide stand outside every part
  const all = K.parts.map((p) => ringPoints(p.ring));
  const P = K.pool;
  for (let i = 0; i < 24; i++) {
    const t = i / 24 * Math.PI * 2, lx = Math.cos(t) * (P.a + 1), lz = Math.sin(t) * (P.b + 1);
    const x = P.x + lx * Math.cos(P.yaw) + lz * Math.sin(P.yaw), z = P.z - lx * Math.sin(P.yaw) + lz * Math.cos(P.yaw);
    assert.ok(!all.some((r) => pointInRing(r, x, z)), `pool rim (${x.toFixed(1)}, ${z.toFixed(1)})`);
  }
  assert.ok(!all.some((r) => pointInRing(r, K.slide.x, K.slide.z)), 'the slide column');
  // the teleport target "Kongress" (2782631 / 1186090) by the complex
  const k = lv95ToWorld(2782631, 1186090);
  assert.ok(Math.hypot(k.x - 115, k.z + 566) < 40);
});

test('the Natureisbahn: a 400 m track round the pitch, ~18 000 m² of ice with the court', () => {
  const pts = trackOutline();
  const track = Math.abs(ringArea(pts)), court = Math.abs(ringArea(EISBAHN.court));
  assert.ok(track > 13000 && track < 15500, `track ${track}`);
  assert.ok(track + court > 15500 && track + court < 19500, `ice ${track + court}`);
  // the pitch's centre (OSM w1304525522) inside the track
  assert.ok(pointInRing(pts, -272, -163.3));
  // and it doesn't reach the Eisstadion
  assert.ok(!pts.some(([x, z]) => stadiumRoofHeight(x, z) !== null));
});

test('the replaced swissBUILDINGS3D buildings are picked out by their surveyed centres, nothing else nearby', () => {
  assert.equal(LANDMARK_EXCLUSIONS.length, 13);
  for (const e of LANDMARK_EXCLUSIONS) assert.ok(e.r > 0 && e.r <= 2);
  // the arena's centre lies under its roof; the complex's centres inside or next to its parts
  assert.ok(stadiumRoofHeight(EISSTADION.exclude[0].x, EISSTADION.exclude[0].z) > 20);
  const all = KONGRESS.parts.map((p) => ringPoints(p.ring));
  const near = (x, z) => all.some((r) => r.some(([px, pz]) => Math.hypot(px - x, pz - z) < 15) || pointInRing(r, x, z));
  for (const e of KONGRESS.exclude) assert.ok(near(e.x, e.z), `(${e.x}, ${e.z})`);
});

test('the Parsennbahn valley station: surveyed parts round the funicular station, on the Promenade', () => {
  const parts = PARSENN.parts.map((p) => ({ ...p, pts: ringPoints(p.ring) }));
  for (const p of parts) {
    assert.ok(Math.abs(ringArea(p.pts)) > 30, p.kind);
    assert.ok(p.h > 8 && p.h < 20, p.kind);
    if (p.roof) assert.equal(p.roof.length, p.pts.length);
  }
  // ~1600 m² in all (OSM w219434717: 1590 m²), the main block 15 m, the wing lower
  const area = parts.reduce((s, p) => s + Math.abs(ringArea(p.pts)), 0);
  assert.ok(area > 1400 && area < 1800, `area ${area}`);
  // the surveyed centre (the excluded building) inside or by the parts, the station node by them, the teleport target
  // "parsenn" close by
  const e = PARSENN.exclude[0];
  assert.ok(parts.some((p) => pointInRing(p.pts, e.x, e.z) || p.pts.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 6)));
  const t = TELEPORT_LOCATIONS.parsenn;
  assert.ok(Math.hypot(t.x - 644.6, t.z + 1436.9) < 40);
  // the fronts face the Promenade (its line 668/-1426 – 690/-1459 runs outside the main block's front)
  const [fx, fz] = PARSENN.fronts[0];
  assert.ok((668 - 654.6) * fx + (-1426 + 1419.5) * fz > 0);
});

test('the stations of Davos Dorf and Davos Platz: surveyed parts by their OSM station nodes, canopies over the platforms', () => {
  const near = (rings, e, d) => rings.some((r) => pointInRing(r, e.x, e.z) || r.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < d));
  // Davos Dorf (station node n623883948 at 909.3/-1587.6): the block 15.4 m over a station building half as high
  const dorf = [DORF.block, DORF.station, DORF.link].map((p) => ringPoints(p.ring));
  assert.ok(dorf.every((r) => Math.abs(ringArea(r)) > 50));
  assert.ok(dorf.some((r) => r.some(([x, z]) => Math.hypot(x - 909.3, z + 1587.6) < 25)));
  assert.ok(DORF.block.h > 2 * DORF.station.h - 1 && DORF.station.h > 6);
  for (const e of DORF.exclude) assert.ok(near(dorf, e, 6), `(${e.x}, ${e.z})`);
  // the canopies: whole triangles, between 5 and 9 m over the platforms' ground (the engine height there ~1.4 / ~-17.9)
  for (const [C, g] of [[DORF.canopy, 1.4], [PLATZ.canopy, -17.9]]) {
    assert.equal(C.length % 9, 0);
    for (let i = 1; i < C.length; i += 3) assert.ok(C[i] - g > 5 && C[i] - g < 9, `canopy at ${C[i]}`);
  }
  // Davos Platz (station node n3815047735 at -628/449.9): the hall the highest, the blocks on the base, the base along
  // the street front
  const base = ringPoints(PLATZ.base.ring), blocks = PLATZ.blocks.map((b) => ringPoints(b.ring));
  assert.ok(pointInRing(base, -632, 450) || blocks.some((r) => pointInRing(r, -628, 449.9)));
  const hall = PLATZ.blocks.find((b) => b.kind === 'hall');
  assert.ok(PLATZ.blocks.every((b) => b.h <= hall.h && b.h > PLATZ.base.h));
  for (const e of PLATZ.exclude) assert.ok(near([base, ...blocks], e, 12), `(${e.x}, ${e.z})`);
});

test('the Arkadenplatz: the square between its arcaded wings and the Kulturplatz, the arcades facing the square', () => {
  const sq = ringPoints(ARKADEN.square);
  assert.ok(Math.abs(ringArea(sq)) > 1500 && Math.abs(ringArea(sq)) < 2500);
  const centre = sq.reduce((s, p) => [s[0] + p[0] / sq.length, s[1] + p[1] / sq.length], [0, 0]);
  for (const w of ARKADEN.wings) {
    const pts = ringPoints(w.ring);
    assert.ok(w.h > 8 && w.h < 11);
    // the arcades' edges run along the square, its centre on their outer side
    if (w.arcade) {
      assert.ok(w.arcade[0] >= 0 && w.arcade[1] <= pts.length && w.arcade[0] < w.arcade[1]);
      for (let i = w.arcade[0]; i < w.arcade[1]; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        assert.ok(Math.hypot(m[0] - centre[0], m[1] - centre[1]) < 40);
      }
    }
  }
  // the Kulturplatz (OSM w225912221, Promenade 58C) inside the brick wing
  const brick = ringPoints(ARKADEN.wings.find((w) => w.kind === 'brick').ring);
  assert.ok(pointInRing(brick, -532.6, -86.6));
  for (const [x, z] of ARKADEN.parasols) assert.ok(pointInRing(sq, x, z));
  for (const e of ARKADEN.exclude) assert.ok(ARKADEN.wings.some((w) => { const r = ringPoints(w.ring); return pointInRing(r, e.x, e.z) || r.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 20); }), `(${e.x}, ${e.z})`);
});
