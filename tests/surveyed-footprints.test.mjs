// The buildings rebuilt by hand put the player's walls on their surveyed outlines (js/landmarks.js SURVEYED_FOOTPRINTS,
// read by js/buildings.js): OpenStreetMap's outline stood up to 3 m before or behind their walls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DAVOS_DATA } from '../js/davos-geodata.js';
import { pointInRing } from '../js/spital-data.js';

const MODULES = ['samd', 'seehof', 'kirchner-museum', 'central-sporthotel', 'ameron', 'schweizerhof', 'hilton-garden-inn', 'meierhof', 'montana', 'sport-hotel-parsenn', 'symondpark', 'buendnerhof', 'hotel-post-morosani', 'grischa', 'casa-bellina', 'st-theodul', 'turmhotel-victoria', 'gredighaus', 'villa-vecchia', 'schneiders', 'hotel-alte-post', 'haus-frohsinn', 'schneiders-chalet', 'weber', 'migros-dorf', 'spar-dorf', 'parsennbahn-tal', 'feuerwehr-dorf', 'parsenn-gada', 'talstrasse-block', 'talstrasse-chalet', 'ettinger-sport', 'hard-rock-hotel', 'tinzenblick', 'pauluskirche', 'schweizerhaus', 'feg-davos', 'club-hotel', 'bristol', 'hofmaenner', 'europe-block', 'promenade-mansard', 'club-hotel-tower', 'gkb-platz', 'dischma-row-a', 'dischma-row-b', 'schulen-platz', 'promenade-platz', 'promenade-dorf', 'promenade-nord', 'promenade-mitte', 'talstrasse-2', 'talstrasse-1', 'talstrasse-3', 'talstrasse-4', 'mattastrasse-1', 'mattastrasse-2', 'obere-strasse-2', 'obere-strasse-1', 'ettinger-platz', 'schule-buenda', 'promenade-west', 'promenade-platz-nord', 'promenade-mitte-2', 'promenade-platz-2', 'promenade-dorf-nord'];

test('each building rebuilt by hand gives its outlines for the walls', async () => {
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  for (const m of MODULES) await import(`../js/${m}.js`);
  // (one entry a module at least: a module may also register a neighbour its survey holds)
  assert.ok(SURVEYED_FOOTPRINTS.size >= MODULES.length);
  for (const [id, outlines] of SURVEYED_FOOTPRINTS) {
    const b = DAVOS_DATA.buildings.find((x) => x.id === id);
    assert.ok(b, `${id} is an OpenStreetMap building`);
    for (const ring of outlines) {
      assert.ok(ring.length >= 3, id);
      for (const [x, z] of ring) assert.ok(Number.isFinite(x) && Number.isFinite(z), id);
      // (near the building it stands in for)
      const [x, z] = ring[0];
      assert.ok(Math.hypot(x - b.ring[0], z - b.ring[1]) < 150, `${id} outline near its footprint`);
    }
  }
});

test("the Schweizerhof's arcade stays open: its wall stands on the shop front, not over the pavement", async () => {
  const { SCHWEIZERHOF, groundOutlines } = await import('../js/schweizerhof-data.js');
  const { front, wall } = SCHWEIZERHOF.arcade;
  const band = groundOutlines()[SCHWEIZERHOF.parts.findIndex((p) => p.id === SCHWEIZERHOF.arcade.part)];
  assert.ok(band.some((q) => q === front[0]) && band.some((q) => q === front[1]));
  // a step out of the shop front towards the street (under the band) lies outside every outline
  const mx = (front[0][0] + front[1][0]) / 2, mz = (front[0][1] + front[1][1]) / 2;
  const ox = (wall[0][0] + wall[1][0]) / 2, oz = (wall[0][1] + wall[1][1]) / 2;
  const p = [mx + (ox - mx) * 0.5, mz + (oz - mz) * 0.5];
  for (const ring of groundOutlines()) assert.ok(!pointInRing(ring, p[0], p[1]));
});
