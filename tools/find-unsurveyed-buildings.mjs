// Finds the OpenStreetMap buildings (js/davos-geodata.js) that swissBUILDINGS3D lacks: no roof or floor triangle of any
// streamed tile (data/swissbuildings3d) over more than 15 % of the points sampled inside their footprints. Writes
// js/unsurveyed-buildings-data.js. Decodes the Draco tiles in a headless Chrome (Playwright, not a dependency of the
// repo: PLAYWRIGHT=<path to playwright/index.mjs>) against the dev server (SERVER, default http://127.0.0.1:8766).
//   PLAYWRIGHT=~/…/node_modules/playwright/index.mjs node tools/find-unsurveyed-buildings.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DAVOS_DATA as D } from '../js/davos-geodata.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = process.env.SERVER || 'http://127.0.0.1:8766';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT || 'playwright').href);

const inRing = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const cands = [];
for (const b of D.buildings) {
  const pts = []; for (let i = 0; i < b.ring.length; i += 2) pts.push([b.ring[i], b.ring[i + 1]]);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]), samples = [];
  const st = Math.max(1, Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 5);
  for (let x = Math.min(...xs) + st / 2; x < Math.max(...xs); x += st) for (let z = Math.min(...zs) + st / 2; z < Math.max(...zs); z += st) if (inRing(pts, x, z)) samples.push([x, z]);
  if (samples.length) cands.push({ id: b.id, samples: samples.slice(0, 40) });
}
const html = fs.readFileSync(path.join(ROOT, 'play.html'), 'utf8').match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
const draco = html.match(/"three\/addons\/": "([^"]+)"/)[1] + 'libs/draco/gltf/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.route('**/__probe.html', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head>${html}</head><body></body></html>` }));
await page.goto(`${SERVER}/__probe.html`);
const covered = await page.evaluate(async ([cands, draco]) => {
  const THREE = await import('three/webgpu');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
  const { parseB3dm, tileMatrix } = await import('/js/swissbuildings3d.js');
  const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(draco));
  const idx = await (await fetch('/data/swissbuildings3d/index.json')).json();
  const Y = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  const C = 120, near = new Map(), key = (x, z) => Math.floor(x / C) + ',' + Math.floor(z / C);
  cands.forEach((c, ci) => c.samples.forEach(([x, z], si) => { const k = key(x, z); if (!near.has(k)) near.set(k, []); near.get(k).push([x, z, ci, si]); }));
  const hit = cands.map((c) => new Uint8Array(c.samples.length));
  const work = async (t) => {
    const tile = parseB3dm(await (await fetch('/data/swissbuildings3d/tiles/' + t.u)).arrayBuffer());
    const gltf = await loader.parseAsync(tile.glb, '');
    const rtc = tile.featureTable.RTC_CENTER || [0, 0, 0];
    gltf.scene.updateMatrixWorld(true);
    const meshes = []; gltf.scene.traverse((o) => o.isMesh && meshes.push(o));
    if (!meshes.length) return;
    const first = new THREE.Vector3().setFromMatrixPosition(meshes[0].matrixWorld).applyMatrix4(Y);
    const c = [rtc[0] + first.x, rtc[1] + first.y, rtc[2] + first.z];
    const M = tileMatrix(c).multiply(new THREE.Matrix4().makeTranslation(rtc[0] - c[0], rtc[1] - c[1], rtc[2] - c[2])).multiply(Y);
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (const m of meshes) {
      const g = m.geometry, full = new THREE.Matrix4().multiplyMatrices(M, m.matrixWorld), pos = g.attributes.position, ix = g.index, n = ix ? ix.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, ix ? ix.getX(i + k) : i + k).applyMatrix4(full);
        const [a, b, cc] = v, d = (b.z - cc.z) * (a.x - cc.x) + (cc.x - b.x) * (a.z - cc.z);
        if (Math.abs(d) < 1e-4) continue;
        const minx = Math.min(a.x, b.x, cc.x), maxx = Math.max(a.x, b.x, cc.x), minz = Math.min(a.z, b.z, cc.z), maxz = Math.max(a.z, b.z, cc.z);
        for (let gx = Math.floor(minx / C); gx <= Math.floor(maxx / C); gx++) for (let gz = Math.floor(minz / C); gz <= Math.floor(maxz / C); gz++) {
          for (const [x, z, ci, si] of near.get(gx + ',' + gz) || []) {
            if (x < minx || x > maxx || z < minz || z > maxz) continue;
            const l1 = ((b.z - cc.z) * (x - cc.x) + (cc.x - b.x) * (z - cc.z)) / d, l2 = ((cc.z - a.z) * (x - cc.x) + (a.x - cc.x) * (z - cc.z)) / d;
            if (l1 >= -1e-4 && l2 >= -1e-4 && 1 - l1 - l2 >= -1e-4) hit[ci][si] = 1;
          }
        }
      }
    }
  };
  const queue = idx.tiles.filter((t) => [-1, 0, 1].some((dx) => [-1, 0, 1].some((dz) => near.has((Math.floor(t.x / C) + dx) + ',' + (Math.floor(t.z / C) + dz)))));
  await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await work(queue.shift()); }));
  return hit.map((h) => h.reduce((s, v) => s + v, 0) / h.length);
}, [cands, draco]);
await browser.close();
const ids = cands.filter((c, i) => covered[i] < 0.15).map((c) => c.id).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const body = ids.map((id) => `'${id}'`).reduce((rows, s, i) => { if (i % 10 === 0) rows.push([]); rows.at(-1).push(s); return rows; }, []).map((r) => '  ' + r.join(', ')).join(',\n');
const head = fs.readFileSync(path.join(ROOT, 'js', 'unsurveyed-buildings-data.js'), 'utf8').split('export const')[0].replace(/; \d+\n\/\/ buildings,/, `; ${ids.length}\n// buildings,`);
fs.writeFileSync(path.join(ROOT, 'js', 'unsurveyed-buildings-data.js'), `${head}export const UNSURVEYED_BUILDINGS = new Set([\n${body}\n]);\n`);
console.log(`${ids.length} of ${cands.length} buildings without a surveyed roof`);
