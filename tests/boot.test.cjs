const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
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
  assert.equal(links.length, 177); // (+ js/ground-kind-names.js; + js/ground-markings-data.js, js/ground-markings-area.js; + js/vector-ground.js, js/ground-kinds.js, js/ground-geometry.js, js/ground-sports-data.js, js/ortho-levels.js; + js/unsurveyed-buildings-data.js; + js/ground-beams.js; + js/missions-data-pfadi.js, js/missions-pfadi.js; + js/pfadiheim.js, js/pfadiheim-data.js; + js/actions.js; + js/missions-data-splitboard.js, js/missions-splitboard.js; + js/paraglide-free.js; + js/missions-data-rink.js, js/missions-rink.js; + js/play-stats.js; + js/missions-data-paraglide.js, js/missions-paraglide.js; + js/solar.js, js/game-clock.js, js/day-cycle.js, js/mission-windows.js, js/fast-forward.js; + js/bus-stopping.js; + js/missions-data-resort.js, js/missions-resort.js; js/missions-data-gastro.js, js/missions-gastro.js; + js/missions-data-fun.js, js/missions-fun.js; js/gta-takeover.js, js/hijack.js, js/bus-joint.js; js/missions-data-golf.js, js/missions-golf.js; js/missions-data-local.js, js/missions-local.js; js/missions-data-sledge.js, js/missions-sledge.js, js/missions-data-mine.js, js/missions-mine.js; js/missions-data-work.js, js/missions-work.js; js/missions-data-sport.js, js/missions-sport.js)
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
