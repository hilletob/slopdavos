// node mobile-check.mjs [slug …]   (from the repo's root; no slug: every hand-built building module)
// Builds each module as the phone's profile does (QUALITY.simpleMaterials) in Node and reports what the phone pays for
// it: meshes, triangles, the canvas textures' pixels, and every material that is not one of SIMPLE_SKINS' or a plain
// textured decal: a full procedural shader on the phone (each costs ~1.7 MB of GPU process memory in Safari, and the
// iPhone closes the tab at ~1–1.5 GB). Exit code 1 if any.
import fs from 'node:fs';
// (a stand-in canvas: every call answers with another stand-in, so gradients and patterns draw into nothing; the canvases
// are counted for their pixels)
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : stub()), set: (t, k, v) => { t[k] = v; return true; }, apply: () => stub() });
let canvases = [];
globalThis.document = { createElement: () => { const c = { width: 0, height: 0, getContext: () => stub(), style: {} }; canvases.push(c); return c; } };
const root = new URL('../../../../', import.meta.url).pathname;
const { QUALITY, QUALITY_PROFILES } = await import(root + 'js/quality.js');
const { SIMPLE_SKINS } = await import(root + 'js/landmark-buildings.js');
const THREE = await import('three/webgpu');
QUALITY.simpleMaterials = true;
QUALITY.atlasScale = QUALITY_PROFILES.mobile.atlasScale; // (js/building-kit.js canvasTexture: the atlases at half size)
// (SIMPLE_SKINS' materials marked as they are made)
for (const k of Object.keys(SIMPLE_SKINS)) { const f = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = f(...a); m.userData.simpleSkin = k; return m; }; }
const main = fs.readFileSync(root + 'js/main.js', 'utf8');
const all = [...main.matchAll(/: (build\w+)\(scene\); \/\/ .*?\(js\/([\w-]+)\.js\)/g)].map((m) => [m[2], m[1]])
  .filter(([slug]) => fs.existsSync(root + `js/${slug}-data.js`));
const wanted = process.argv.slice(2);
for (const w of wanted) if (!all.some(([s]) => s === w)) { console.log(`? ${w}: not wired in js/main.js yet (wire.mjs first)`); process.exitCode = 1; }
let bad = 0;
for (const [slug, fn] of all.filter(([s]) => !wanted.length || wanted.includes(s))) {
  const mod = await import(root + `js/${slug}.js`);
  if (typeof mod[fn] !== 'function') { console.log(`${slug}: no ${fn}`); continue; }
  const scene = new THREE.Scene();
  canvases = [];
  try { mod[fn](scene); } catch (e) { console.log(`? ${slug}: the build failed in Node (${e.message.split('\n')[0]}); look in the browser`); continue; }
  let meshes = 0, tris = 0;
  const sources = new Set(canvases.map((c) => c.scaledFrom).filter(Boolean)); // (a drawn atlas sent on at half size)
  const pixels = canvases.filter((c) => !sources.has(c)).reduce((n, c) => n + c.width * c.height, 0);
  const full = new Set(), seen = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const m of [o.material].flat()) {
      if (seen.has(m)) continue; seen.add(m);
      // (a decal of building-kit.js: its canvas's colour and alpha, a short shader)
      const decal = m.opacityNode && m.transparent && !m.emissiveNode && !m.roughnessNode && !m.normalNode;
      const procedural = m.colorNode || m.emissiveNode || m.roughnessNode || m.normalNode || m.positionNode;
      if (!m.userData.simpleSkin && !decal && procedural && !m.map) full.add(m.name || o.name || m.type);
    }
  });
  if (full.size) bad++;
  console.log(`${full.size ? '✖' : '✔'} ${slug}: ${meshes} meshes, ${Math.round(tris)} triangles, ${(pixels / 1e6).toFixed(2)} Mpx of canvas` +
    (full.size ? ` — full shaders on the phone: ${[...full].join(', ')}` : ''));
}
if (bad) process.exitCode = 1;
