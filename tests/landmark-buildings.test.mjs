import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EISSTADION, KONGRESS, EISBAHN, PARSENN, LANDMARK_EXCLUSIONS, stadiumVerge, stadiumFacets, stadiumRoofHeight, trackOutline,
  ringPoints, ringArea, pointInRing
} from '../js/landmark-buildings-data.js';
import { lv95ToWorld } from '../js/davos-frame.js';
import { TELEPORT_LOCATIONS } from '../js/city-config.js';

test('the Eisstadion: an octagon of four corners and four gables round its apex, the building under its roof', () => {
  const S = EISSTADION, verge = stadiumVerge(S);
  assert.equal(S.outline.filter((p) => p.corner).length, 4);
  assert.equal(S.outline.filter((p) => p.gable).length, 4);
  assert.equal(verge.length, 16);
  assert.equal(stadiumFacets(S).length, 16);
  // about 109 m across (SWISSIMAGE), the apex 22.7 m and the highest point
  const xs = verge.map((p) => p.x), zs = verge.map((p) => p.z);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  assert.ok(span > 100 && span < 115, `span ${span}`);
  assert.equal(stadiumRoofHeight(S.apex.x, S.apex.z), S.apex.h);
  for (const p of verge) assert.ok(p.h < S.apex.h && p.h >= S.cornerH);
  // the eaves come down low at the corners, the gables stand 12–14 m high
  for (const p of verge.filter((v) => v.kind === 'gable')) assert.ok(p.h > 12 && p.h < 15);
  // every corner of the footprint and the annex lies under the roof, high enough for the base and some glass
  for (const [x, z] of [...S.footprint, ...S.annex.ring]) {
    const h = stadiumRoofHeight(x, z);
    assert.ok(h !== null, `(${x}, ${z}) under the roof`);
    assert.ok(h - S.thickness > S.plinth + 2, `(${x}, ${z}): ${h}`);
  }
  // and the roof's outside is outside
  assert.equal(stadiumRoofHeight(S.apex.x + 80, S.apex.z), null);
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
  assert.equal(LANDMARK_EXCLUSIONS.length, 6);
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
