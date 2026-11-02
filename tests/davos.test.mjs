import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { register } from 'node:module';
import { wgs84ToLv95, lv95ToWgs84 } from '../js/swiss-projection.js';
import { FRAME, WORLD_BOUNDS, lv95ToWorld } from '../js/davos-frame.js';
import { parseTerrain, gridHeight } from '../js/terrain-grid.js';
import { DAVOS_DATA } from '../js/davos-geodata.js';

const terrainFile = fs.readFileSync(new URL('../data/davos-terrain.bin', import.meta.url));
const TERRAIN = parseTerrain(terrainFile.buffer.slice(terrainFile.byteOffset, terrainFile.byteOffset + terrainFile.byteLength));
const heightAt = (E, N) => { const p = lv95ToWorld(E, N); return gridHeight(TERRAIN, p.x, p.z) + FRAME.H0; };

test('WGS84 -> LV95 matches swisstopo REFRAME to the millimetre, and round-trips', () => {
  // https://geodesy.geo.admin.ch/reframe/wgs84tolv95
  for (const [lon, lat, E, N] of [[8.54, 47.37, 2683186.285581739, 1247156.7439824815], [8.505, 47.361, 2680556.51552824, 1246119.6876790135]]) {
    const p = wgs84ToLv95(lon, lat);
    assert.ok(Math.abs(p.E - E) < 0.002 && Math.abs(p.N - N) < 0.002, `${lon}, ${lat}: ${p.E}, ${p.N}`);
    const back = lv95ToWgs84(p.E, p.N);
    assert.ok(Math.abs(back.lon - lon) < 1e-7 && Math.abs(back.lat - lat) < 1e-7);
  }
});

test('the terrain grid covers the frame with plausible Davos heights', () => {
  const [minX, minZ, maxX, maxZ] = WORLD_BOUNDS;
  assert.equal(TERRAIN.minX, minX);
  assert.equal(TERRAIN.minZ, minZ);
  assert.equal(TERRAIN.maxX, maxX);
  assert.equal(TERRAIN.maxZ, maxZ);
  // The lake, the two stations, the Schatzalp, the head of the Dischma (swissALTI3D, m a.s.l.)
  assert.ok(Math.abs(heightAt(2784250, 1188200) - 1558) < 1.5, 'Davosersee');
  assert.ok(Math.abs(heightAt(2781839, 1185061) - 1540) < 5, 'Bahnhof Davos Platz');
  assert.ok(Math.abs(heightAt(2783393, 1187097) - 1560) < 5, 'Bahnhof Davos Dorf');
  assert.ok(heightAt(2781000, 1185700) > 1800, 'Schatzalp high above Davos Platz');
  assert.ok(heightAt(2789814, 1177412) > 1950, 'Dürrboden at the head of the Dischma');
  assert.ok(heightAt(2780124, 1182149) < 1530, 'Frauenkirch down the Landwasser');
});

test('every bridge has a deck height per point, never below the terrain it spans', () => {
  for (const r of [...DAVOS_DATA.roads, ...DAVOS_DATA.railways]) {
    if (!r.bridge) continue;
    assert.equal(r.ys?.length, r.pts.length / 2, `${r.id} ${r.name}`);
    // (points are rounded to 0.1 m, so the terrain is sampled a few centimetres off on slopes)
    r.ys.forEach((y, i) => assert.ok(y >= gridHeight(TERRAIN, r.pts[i * 2], r.pts[i * 2 + 1]) - 0.1, `${r.id} ${r.name} point ${i}`));
  }
});

test('one stands on a bridge, or under it on the ground', async () => {
  // js/terrain.js only draws with three.js inside its functions: an empty stand-in lets Node load its height functions
  const three = encodeURIComponent('export class Box3 {} export class Vector3 {} export class Matrix4 {}');
  register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, next) { return s === 'three/webgpu' ? { url: 'data:text/javascript,${three}', shortCircuit: true } : next(s, c); }`)}`);
  const { groundHeight, deckHeight, surfaceHeight } = await import('../js/terrain.js');
  const mid = (r, i) => ({ x: (r.pts[i * 2] + r.pts[i * 2 + 2]) / 2, z: (r.pts[i * 2 + 1] + r.pts[i * 2 + 3]) / 2 });
  // The highest point of any road bridge over the ground under it
  const high = DAVOS_DATA.roads.filter((r) => r.bridge && r.pts.length >= 4)
    .flatMap((r) => r.ys.slice(1).map((_, i) => mid(r, i)))
    .map((p) => ({ ...p, d: deckHeight(p.x, p.z), g: groundHeight(p.x, p.z) })).filter((p) => p.d === p.d)
    .sort((a, b) => b.d - b.g - (a.d - a.g))[0];
  assert.ok(high.d - high.g > 4, 'a road bridge well above the ground');
  assert.equal(surfaceHeight(high.x, high.z, high.g), high.g, 'under the bridge');
  assert.equal(surfaceHeight(high.x, high.z, high.d), high.d, 'on the bridge');
});

test('the valley keeps its landmarks, lake, railways and road graph', () => {
  for (const name of ['Kongresszentrum', 'Kirchner Museum', 'St. Johann', 'Rathaus Davos', 'Eisstadion Davos', 'Berghotel Schatzalp']) {
    assert.ok(DAVOS_DATA.landmarks[name], name);
  }
  assert.ok(DAVOS_DATA.meta.areas.some((a) => a.name === 'Davos'), 'the municipality of Davos');
  assert.ok(DAVOS_DATA.water.some((w) => w.name === 'Davosersee'), 'the Davosersee');
  assert.ok(DAVOS_DATA.railways.some((r) => r.kind === 'narrow_gauge'), 'the Rhaetian Railway');
  assert.ok(DAVOS_DATA.railways.some((r) => r.name === 'Parsennbahn'), 'the Parsennbahn');
  assert.ok(DAVOS_DATA.buildings.length > 3000, 'the buildings of the valley');
  const { nodes, links } = DAVOS_DATA.roadGraph;
  for (const l of links) assert.ok(l[0] * 2 < nodes.length && l[1] * 2 < nodes.length);
  assert.ok(!DAVOS_DATA.roads.some((r) => r.kind === 'footway' && /crossing/.test(r.name)), 'no crosswalk ways');
});

test('the Promenade and the Talstrasse: one-way for cars, both ways for the buses, with sidewalks', () => {
  const ways = DAVOS_DATA.roads.filter((r) => /^(Promenade|Talstrasse)$/.test(r.name) && r.oneway);
  const bus = ways.filter((r) => r.bus);
  assert.ok(bus.length >= 20, `${bus.length} one-way pieces the buses drive against`);
  for (const r of bus) assert.ok(r.width >= 6 && r.width <= 6.6, `${r.id}: a lane each way (${r.width} m)`);
  assert.ok(bus.some((r) => r.name === 'Talstrasse' && r.bus === 2), 'the Talstrasse\'s marked bus lane');
  assert.ok(ways.every((r) => r.sidewalk && r.sidewalk.some((w) => w >= 1.8 && w <= 2.5)), 'sidewalks along them');
  // the road graph carries the buses' lanes and the sidewalks to the traffic and the pedestrians
  assert.ok(DAVOS_DATA.roadGraph.links.some((l) => l[8] === 2 && Array.isArray(l[9])));
});

test('the swissBUILDINGS3D tiles are stored in the repository, complete', () => {
  const dir = new URL('../data/swissbuildings3d/', import.meta.url);
  const index = JSON.parse(fs.readFileSync(new URL('index.json', dir), 'utf8'));
  assert.match(index.release, /^\d{8}$/);
  assert.ok(index.tiles.length > 500);
  for (const t of index.tiles) {
    const buf = fs.readFileSync(new URL(index.base + t.u, dir));
    assert.equal(buf.toString('ascii', 0, 4), 'b3dm', t.u);
    assert.equal(buf.readUInt32LE(8), buf.length, `${t.u} is complete`);
  }
});

test('the RhB line runs Wolfgang – Dorf – Platz – Frauenkirch, with passing loops in the three larger stations', async () => {
  const { buildLine, routePoint } = await import('../js/rhb-route.js');
  const line = buildLine(DAVOS_DATA.railways, DAVOS_DATA.stations, DAVOS_DATA.meta.bounds);
  assert.ok(line, 'a route between the two ends of the line');
  assert.ok(line.south.len > 10000 && Math.abs(line.south.len - line.north.len) < 50, `${line.south.len.toFixed(0)} m`);
  assert.deepEqual(line.stations.map((s) => s.name), ['Davos Wolfgang', 'Davos Dorf', 'Davos Kongress/Eisstadion', 'Davos Platz', 'Davos Frauenkirch']);
  assert.deepEqual(line.stations.filter((s) => s.loop).map((s) => s.name), ['Davos Dorf', 'Davos Platz', 'Davos Frauenkirch']);
  // Northbound, the stations come in the reverse order; on the loops the two directions stand on parallel tracks
  for (let i = 1; i < line.stations.length; i++) assert.ok(line.stations[i].north < line.stations[i - 1].north);
  for (const s of line.stations.filter((st) => st.loop)) {
    const p = routePoint(line.south, s.south), q = routePoint(line.north, s.north), d = Math.hypot(p.x - q.x, p.z - q.z);
    assert.ok(d > 3 && d < 6, `${s.name}: tracks ${d.toFixed(1)} m apart`);
  }
});

test('the roof atlases are stored, complete and consistent with their index', () => {
  const dir = new URL('../data/roofs/', import.meta.url);
  const index = JSON.parse(fs.readFileSync(new URL('index.json', dir), 'utf8'));
  assert.equal(index.res, 0.125);
  const tiles = Object.entries(index.tiles);
  assert.ok(tiles.length > 500, `${tiles.length} tiles`);
  let bytes = 0, rects = 0;
  for (const [u, pages] of tiles) {
    for (const p of pages) {
      const buf = fs.readFileSync(new URL(p.f, dir));
      assert.equal(buf.toString('ascii', 0, 4), 'RIFF', p.f);
      assert.equal(buf.toString('ascii', 8, 12), 'WEBP', p.f);
      bytes += buf.length;
      for (const [x0, z0, x1, z1, px, py, pw, ph] of p.rects) {
        assert.ok(x1 > x0 && z1 > z0 && pw > 0 && ph > 0, `${u} rect`);
        assert.ok(px >= 1 && py >= 1 && px + pw <= p.w && py + ph <= p.h, `${u} ${p.f} rect inside the atlas`);
        rects++;
      }
    }
  }
  console.log(`roof atlases: ${tiles.length} tiles, ${rects} boxes, ${(bytes / 1048576).toFixed(1)} MB`);
});

test('the Hofstrasse runs under the RhB: an open road in a cut, the tracks on a short deck over it', async () => {
  const u = (DAVOS_DATA.underpasses || []).find((p) => p.name === 'Hofstrasse');
  assert.ok(u, 'the underpass');
  assert.ok(DAVOS_DATA.roads.some((r) => r.id === u.id && !r.tunnel && !r.bridge), 'the road is drawn and driven');
  const at = (s) => ({ x: u.ax + u.ux * s, z: u.az + u.uz * s });
  for (const s of [0, u.len / 2, u.len]) {
    const p = at(s);
    assert.ok(u.y - gridHeight(TERRAIN, p.x, p.z) > 3.5, `headroom at ${s} m`);
  }
  const decks = DAVOS_DATA.railways.filter((r) => r.bridge && r.kind === 'narrow_gauge' && r.ys.some((y) => y === u.y));
  assert.ok(decks.length >= 1, 'the line crosses on a deck at the height of the lid');
  for (const r of decks) {
    let len = 0;
    for (let i = 2; i < r.pts.length; i += 2) len += Math.hypot(r.pts[i] - r.pts[i - 2], r.pts[i + 1] - r.pts[i - 1]);
    assert.ok(len < u.left + u.right + 20, `only as long as the lid, ${len} m`);
  }
});
