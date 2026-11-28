const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const html = readFileSync(join(__dirname, '../play.html'), 'utf8');
const importMap = html.match(/<script type="importmap">([^]*?)<\/script>/);
const preloads = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"\s*\/>/g)];
const entries = [...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)];

test('city module preloads start after the import map and before stylesheets', () => {
  assert.ok(importMap);
  assert.ok(preloads.length > 0);
  const stylesheetIndex = html.indexOf('rel="stylesheet"');
  for (const preload of preloads) {
    assert.ok(importMap.index < preload.index);
    assert.ok(preload.index < stylesheetIndex);
  }
  assert.equal(entries.length, 1);
  assert.ok(importMap.index < entries[0].index);
  assert.ok(entries[0].index < stylesheetIndex, 'the module graph starts loading early too');
  assert.match(html, /<link rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net" crossorigin\s*\/>/);
  const { imports } = JSON.parse(importMap[1]);
  assert.equal(imports.three, imports['three/webgpu'], 'Three.js aliases share one module instance');
});

test('native module entry and imports share canonical preloaded URLs on GitHub Pages', () => {
  const links = preloads.map((match) => match[1]);
  assert.equal(links.length, 396); // (+ js/facade-hints.js, js/facade-hints-data.js; + js/promenade-dorf-nord.js, js/promenade-dorf-nord-data.js; + js/promenade-platz-2.js, js/promenade-platz-2-data.js; + js/promenade-mitte-2.js, js/promenade-mitte-2-data.js; + js/promenade-platz-nord.js, js/promenade-platz-nord-data.js; + js/promenade-west.js, js/promenade-west-data.js; + js/schule-buenda.js, js/schule-buenda-data.js; + js/ettinger-platz.js, js/ettinger-platz-data.js; + js/obere-strasse-1.js, js/obere-strasse-1-data.js; + js/obere-strasse-2.js, js/obere-strasse-2-data.js; + js/mattastrasse-2.js, js/mattastrasse-2-data.js; + js/mattastrasse-1.js, js/mattastrasse-1-data.js; + js/talstrasse-4.js, js/talstrasse-4-data.js; + js/talstrasse-3.js, js/talstrasse-3-data.js; + js/talstrasse-1.js, js/talstrasse-1-data.js; + js/talstrasse-2.js, js/talstrasse-2-data.js; + js/promenade-mitte.js, js/promenade-mitte-data.js; + js/promenade-nord.js, js/promenade-nord-data.js; + js/promenade-dorf.js, js/promenade-dorf-data.js; + js/promenade-platz.js, js/promenade-platz-data.js; + js/schulen-platz.js, js/schulen-platz-data.js; + js/dischma-row-b.js, js/dischma-row-b-data.js; + js/dischma-row-a.js, js/dischma-row-a-data.js; + js/gkb-platz.js, js/gkb-platz-data.js; + js/club-hotel-tower.js, js/club-hotel-tower-data.js; + js/promenade-mansard.js, js/promenade-mansard-data.js; + js/europe-block.js, js/europe-block-data.js; + js/hofmaenner.js, js/hofmaenner-data.js; + js/bristol.js, js/bristol-data.js; + js/club-hotel.js, js/club-hotel-data.js; + js/pischa-terminal.js, js/pischa-terminal-data.js; + js/feg-davos.js, js/feg-davos-data.js; + js/schweizerhaus.js, js/schweizerhaus-data.js; + js/pauluskirche.js, js/pauluskirche-data.js; + js/tinzenblick.js, js/tinzenblick-data.js; + js/hard-rock-hotel.js, js/hard-rock-hotel-data.js; + js/seeli-park.js, js/seeli-park-data.js; + js/ettinger-sport.js, js/ettinger-sport-data.js; + js/talstrasse-chalet.js, js/talstrasse-chalet-data.js; + js/talstrasse-block.js, js/talstrasse-block-data.js; + js/parsenn-gada.js, js/parsenn-gada-data.js; + js/feuerwehr-dorf.js, js/feuerwehr-dorf-data.js; + js/parsennbahn-tal.js, js/parsennbahn-tal-data.js; + js/bubenbrunnen.js, js/bubenbrunnen-data.js; + js/spar-dorf.js, js/spar-dorf-data.js; + js/migros-dorf.js, js/migros-dorf-data.js; + js/weber.js, js/weber-data.js; + js/pischa.js, js/pischa-data.js; + js/schneiders-chalet.js, js/schneiders-chalet-data.js; + js/haus-frohsinn.js, js/haus-frohsinn-data.js; + js/hotel-alte-post.js, js/hotel-alte-post-data.js; + js/schneiders.js, js/schneiders-data.js; + js/villa-vecchia.js, js/villa-vecchia-data.js; + js/gredighaus.js, js/gredighaus-data.js; + js/turmhotel-victoria.js, js/turmhotel-victoria-data.js; + js/st-theodul.js, js/st-theodul-data.js; + js/casa-bellina.js, js/casa-bellina-data.js; + js/grischa.js, js/grischa-data.js; + js/hotel-post-morosani.js, js/hotel-post-morosani-data.js; + js/buendnerhof.js, js/buendnerhof-data.js; + js/symondpark.js, js/symondpark-data.js; + js/sport-hotel-parsenn.js, js/sport-hotel-parsenn-data.js; + js/montana.js, js/montana-data.js; + js/meierhof.js, js/meierhof-data.js; + js/hilton-garden-inn.js, js/hilton-garden-inn-data.js; + js/schweizerhof.js, js/schweizerhof-data.js; + js/ameron.js, js/ameron-data.js; + js/seehof.js, js/seehof-data.js; + js/central-sporthotel.js, js/central-sporthotel-data.js; + js/kirchner-museum.js, js/kirchner-museum-data.js; + js/samd.js, js/samd-data.js; + js/storage-keys.js; + js/post-coop.js, js/post-coop-data.js; + js/rainfall.js, js/weather.js, js/lightning.js; + js/building-kit.js; + js/hud-keybar.js; + js/hud-radio.js; + js/hud-location.js; + js/loading-screen.js; + js/hud-dialogs.js; + js/shader-warmup.js; + js/messages.js; + js/missions-kit.js; + js/ring.js; + js/world-ready.js; + js/dom.js; - js/fire-escapes.js; + js/belvedere.js, js/belvedere-data.js; + js/marienkirche.js, js/marienkirche-data.js; - js/boroughs.js; + js/quad.js, js/gta-quads.js; + js/raetia-center.js, js/raetia-center-data.js; + js/signpost-sites.js; + js/st-johann.js, js/st-johann-data.js; + js/alte-post.js, js/alte-post-data.js; + js/spital.js, js/spital-data.js; + js/missions-data-fondue.js, js/missions-fondue.js; + js/car-radio.js; + js/missions-data-quiz.js, js/missions-quiz.js; + js/path-bench.js; + js/heat-trail.js, js/live-beacon.js; + js/map-layer-cache.js; + js/air-obstacles.js, js/air-obstacle-field.js, js/air-obstacles-data.js, js/tour-routes.js, js/names.js, js/names-data.js; + js/funicular-track.js; + js/missions-data-parsenn.js, js/missions-parsenn.js; + js/missions-data-samd.js, js/missions-samd.js; + js/missions-data-zamboni.js, js/missions-zamboni.js; + js/missions-data-heliblast.js, js/missions-heliblast.js; + js/missions-data-victoria.js, js/missions-victoria.js; + js/silberberg-asset.js; + js/missions-data-jetpack.js, js/missions-jetpack.js; + js/missions-data-post.js, js/missions-post.js; + js/missions-data-pharmacy.js, js/missions-pharmacy.js; + js/person-models.js, js/person-clips.js, js/player-figure.js; + js/missions-data-{snowfarm,plough,winterroad,radar}.js, js/missions-{snowfarm,plough,winterroad,radar}.js; + js/bus-bays.js; + js/ground-kind-names.js; + js/ground-markings-data.js, js/ground-markings-area.js; + js/vector-ground.js, js/ground-kinds.js, js/ground-geometry.js, js/ground-sports-data.js, js/ortho-levels.js; + js/unsurveyed-buildings-data.js; + js/ground-beams.js; + js/missions-data-pfadi.js, js/missions-pfadi.js; + js/pfadiheim.js, js/pfadiheim-data.js; + js/actions.js; + js/missions-data-splitboard.js, js/missions-splitboard.js; + js/paraglide-free.js; + js/missions-data-rink.js, js/missions-rink.js; + js/play-stats.js; + js/missions-data-paraglide.js, js/missions-paraglide.js; + js/solar.js, js/game-clock.js, js/day-cycle.js, js/mission-windows.js, js/fast-forward.js; + js/bus-stopping.js; + js/missions-data-resort.js, js/missions-resort.js; js/missions-data-gastro.js, js/missions-gastro.js; + js/missions-data-fun.js, js/missions-fun.js; js/gta-takeover.js, js/hijack.js, js/bus-joint.js; js/missions-data-golf.js, js/missions-golf.js; js/missions-data-local.js, js/missions-local.js; js/missions-data-sledge.js, js/missions-sledge.js, js/missions-data-mine.js, js/missions-mine.js; js/missions-data-work.js, js/missions-work.js; js/missions-data-sport.js, js/missions-sport.js; + js/vehicle-specs.js)
  assert.equal(new Set(links).size, links.length, 'each module is preloaded once');
  assert.equal(entries.length, 1);
  assert.equal(entries[0][1], './js/start.js');
  assert.ok(links.includes('./js/main.js'), 'js/start.js imports it once a signed-in player\'s save is there');
  assert.ok(links.includes(entries[0][1]));
  assert.doesNotMatch(html, /plausible/, 'no third-party analytics');
  const appScripts = [...html.matchAll(/<script\b/g)];
  assert.equal(appScripts.length, 2, 'only the import map and native entry are needed');
  const base = 'https://example.test/slop-newyork/';
  const urls = new Set(links.map((src) => new URL(src, base).href));
  for (const src of links) {
    assert.match(src, /^\.\/js\/[\w-]+\.js$/, 'preloads use the same unversioned paths as native imports');
    const source = readFileSync(join(__dirname, '..', src), 'utf8');
    for (const [, specifier] of source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)) {
      const url = new URL(specifier, new URL(src, base));
      assert.ok(urls.has(url.href), `${src} imports an unpreloaded or mismatched URL: ${specifier}`);
    }
  }
});
