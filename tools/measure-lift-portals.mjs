// tools/measure-lift-portals.mjs
// Measures where the ropes of the housed lift ends (js/bergbahnen.js LIFT_TERMINALS, mode 'housed') really leave their
// station building, against the swissBUILDINGS3D volumes the game draws, and writes the table LIFT_PORTALS in js/bergbahnen.js (the block
// between // <lift-portals> and // </lift-portals>).
// Why: the OSM footprint that marks an end as housed is not the drawn building: its walls lie up to a few metres off
// swissBUILDINGS3D's (the tiles are b3dm loaded at runtime, too late and too heavy for the plan made at build time), so a
// cable-exit portal placed on the footprint stood off the facade, or inside it, with its posts down to the ground.
// How: in the game (Chrome with WebGPU, every building tile loaded, the CPU copies kept), rays along the rope from inside
// the station; per end, in its local frame (origin the rope's end node on the ground, +z along the rope, +x across it):
//   d       the facade where the rope axis leaves it (at the cabins' height: the first wall the ray goes out through)
//   left / right  how far across the rope that facade runs on in its plane (±0.9 m): the portal's posts are only put
//           where the wall backs them, beyond it the lintel is carried on brackets
//   footL / footR / foot0  the facade's lowest point under the posts and under the rope (heights over the node's ground)
//   top     the facade's highest point over the rope axis (the canopy stays under the roof's edge)
// Re-run after a swissBUILDINGS3D release (npm run update:buildings) or a change to the lifts' data (npm run data:bergbahnen),
// check the stations (the portals) and commit the table. Ends missing from it fall back to the OSM footprint.
//
//   python3 tools/serve.py 8766            (or python3 -m http.server 8766)
//   node tools/measure-lift-portals.mjs [--port 8766]
// (Playwright isn't a dependency of the repo: from node_modules if it is there, or PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs)
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map((a) => { const [k, ...v] = a.split(/\s+/); return [k, v.join(' ') || true]; }));
const PORT = args.port || 8766;
const OUT = new URL('../js/bergbahnen.js', import.meta.url);

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
await page.route('**/js/account-ui.js', (r) => r.abort()); // (no sign-in gate over a long run)
page.on('pageerror', (e) => console.warn('[page]', e.message));
await page.goto(`http://127.0.0.1:${PORT}/?summer&qset=precompile:false,releaseCpu:false`);
await page.waitForFunction(() => window.__slopdavos?.ready, null, { timeout: 300000, polling: 1000 });

const table = await page.evaluate(async () => {
  const S = window.__slopdavos;
  await S.swissBuildings.done;
  const THREE = await import('three/webgpu');
  const { LIFT_TERMINALS } = await import('/js/bergbahnen.js');
  const meshes = [];
  S.swissBuildings.group.traverse((o) => { if (o.isMesh && o.geometry.attributes.position?.array) meshes.push(o); });
  const sides = meshes.map((m) => m.material.side);
  meshes.forEach((m) => { m.material.side = THREE.DoubleSide; }); // (the walls seen from inside)
  const rc = new THREE.Raycaster(), out = {};
  const r2 = (v) => Math.round(v * 100) / 100;
  for (const t of LIFT_TERMINALS) {
    if (t.mode !== 'housed') continue;
    const { node, next } = t, span = Math.hypot(next.x - node.x, next.z - node.z), ux = (next.x - node.x) / span, uz = (next.z - node.z) / span;
    const H = node.y - node.ground;
    // The facade the ray from (x, h) along the rope goes out through: the first exit not followed within a metre by an
    // entry (two building parts touching)
    const facade = (x, h) => {
      rc.set(new THREE.Vector3(node.x + x * uz, node.ground + h, node.z - x * ux), new THREE.Vector3(ux, 0, uz));
      rc.far = 60;
      const hits = rc.intersectObjects(meshes, false).map((i) => {
        const n = i.face.normal.clone().transformDirection(i.object.matrixWorld);
        return { d: i.distance, out: n.x * ux + n.z * uz > 0 };
      });
      for (let k = 0; k < hits.length; k++) if (hits[k].out && !hits.slice(k + 1).some((o) => !o.out && o.d - hits[k].d < 1)) return hits[k].d;
      return null;
    };
    const h0 = t.type === 'tbar' ? H - 1.5 : H - 2; // (the cabins', the bars' height)
    const d = facade(0, h0);
    if (d == null) continue;
    const onPlane = (x, h) => { const f = facade(x, h); return f != null && Math.abs(f - d) < 0.9; };
    const extent = (s) => { let x = 0; while (x < 14 && onPlane(s * (x + 0.25), h0)) x += 0.25; return x; };
    const left = extent(1), right = extent(-1);
    const foot = (x) => { let h = h0; while (h > -25 && onPlane(x, h - 0.25)) h -= 0.25; return h; };
    let top = h0;
    while (top < H + 30 && onPlane(0, top + 0.25)) top += 0.25;
    const postX = t.gauge / 2 + (t.kind === 'cable_car' ? 2.7 : 2.1);
    out[`${t.lift}|${t.valley ? 'valley' : 'top'}`] = {
      d: r2(d), left: r2(left), right: r2(right), top: r2(top), foot0: r2(foot(0)),
      footL: r2(foot(Math.min(left, postX))), footR: r2(foot(-Math.min(right, postX))), osm: t.osmExit
    };
  }
  meshes.forEach((m, i) => { m.material.side = sides[i]; });
  return out;
});
await browser.close();

const lines = Object.entries(table).map(([k, v]) => `  '${k}': { ${Object.entries(v).map(([f, n]) => `${f}: ${n}`).join(', ')} }`);
const file = readFileSync(OUT, 'utf8'), from = file.indexOf('// <lift-portals>'), to = file.indexOf('// </lift-portals>');
if (from < 0 || to < from) throw new Error('js/bergbahnen.js: no // <lift-portals> block');
writeFileSync(OUT, `${file.slice(0, from)}// <lift-portals> (generated)\nexport const LIFT_PORTALS = {\n${lines.join(',\n')}\n};\n${file.slice(to)}`);
for (const [k, v] of Object.entries(table)) console.log(k.padEnd(34), `facade ${v.d} m (footprint ${v.osm}), across +${v.left}/-${v.right}, foot ${v.footL}/${v.foot0}/${v.footR}, top ${v.top}`);
