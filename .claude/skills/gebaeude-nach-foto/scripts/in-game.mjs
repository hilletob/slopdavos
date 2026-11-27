// The skill's browser work as one module the game's page imports (tools/serve.py serves the skill's folder too), so
// that each step is one short javascript_tool call instead of a pasted script:
//
//   const k = await import('/.claude/skills/gebaeude-nach-foto/scripts/in-game.mjs'); await k.ready()
//   await k.summer(750)                          // remembers the clock (localStorage), jumps to a summer day at 12:30
//   await k.extract([['slug', [x, z], radius]])  // the surveyed batches round a centre + a ground grid → recv.py
//   await k.probe()                              // the player's walls before and behind every registered outline
//   k.view(px, py, pz, tx, ty, tz)               // the camera
//   k.restore()                                  // the clock back as it was, saved
//
// The values come back as short strings (javascript_tool cuts at ~1 KB); the big data goes to scripts/recv.py.
const KEY = 'gebaeude-nach-foto-clock';
const RECV = 'http://127.0.0.1:9340/save?name=';
const g = () => window.__slopdavos;

/** Waits up to `ms` for the game to be ready (call it again while it says false) */
export async function ready(ms = 27000) {
  const t0 = Date.now();
  while (!(g() && g().ready) && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 500));
  return !!(g() && g().ready);
}

/** Remembers the player's clock once and jumps to the next summer day at `minute` (frozen); `season` for others */
export function summer(minute = 750, season = 'summer') {
  const c = g().clock;
  if (localStorage.getItem(KEY) === null) localStorage.setItem(KEY, String(c.total));
  const day = Math.floor(c.total / 1440);
  let a = 0;
  for (; a < 400; a++) { c.jumpTo((day + a) * 1440 + minute); if (c.season === season) break; }
  c.freeze(true);
  return `${c.season} day +${a}, ${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`;
}

/** The clock back to what summer() remembered, running and saved */
export function restore() {
  const c = g().clock, was = localStorage.getItem(KEY);
  if (was === null) return 'nothing remembered';
  c.jumpTo(+was); c.freeze(false); c.save(); localStorage.removeItem(KEY);
  return 'clock back at ' + c.total;
}

export const view = (...a) => { g().setCamera(...a); return 'ok'; };

/** The swissBUILDINGS3D batches whose centre lies within `radius` of each job's centre, their floors on the lowest ground
 * under them, and the ground on a 6 m grid round them: POSTed as <slug>.json and <slug>.ground.json */
export async function extract(jobs) {
  const THREE = await import('three/webgpu');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
  const { parseB3dm, tileMatrix } = await import('/js/swissbuildings3d.js');
  const { lonLatToWorld } = await import('/js/davos-frame.js');
  const { groundHeight } = await import('/js/terrain.js');
  const im = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports;
  const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(im['three/addons/'] + 'libs/draco/gltf/'));
  const idx = await (await fetch('/data/swissbuildings3d/index.json')).json();
  const Y = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  const res = {};
  for (const [name, centre, radius] of jobs) {
    const out = [];
    for (const t of idx.tiles.filter((t) => Math.abs(t.x - centre[0]) < 200 && Math.abs(t.z - centre[1]) < 200)) {
      const tile = parseB3dm(await (await fetch('/data/swissbuildings3d/tiles/' + t.u)).arrayBuffer());
      const bt = tile.batchTable, gltf = await loader.parseAsync(tile.glb, '');
      const rtc = tile.featureTable.RTC_CENTER || [0, 0, 0];
      gltf.scene.updateMatrixWorld(true);
      const meshes = []; gltf.scene.traverse((o) => o.isMesh && meshes.push(o));
      if (!meshes.length) continue;
      const first = new THREE.Vector3().setFromMatrixPosition(meshes[0].matrixWorld).applyMatrix4(Y);
      const c = [rtc[0] + first.x, rtc[1] + first.y, rtc[2] + first.z];
      const M = tileMatrix(c).multiply(new THREE.Matrix4().makeTranslation(rtc[0] - c[0], rtc[1] - c[1], rtc[2] - c[2])).multiply(Y);
      const per = new Map();
      for (const m of meshes) {
        const geo = m.geometry, full = new THREE.Matrix4().multiplyMatrices(M, m.matrixWorld), pos = geo.attributes.position, ix = geo.index;
        const cnt = ix ? ix.count : pos.count, bid = geo.attributes._batchid;
        for (let i = 0; i < cnt; i += 3) {
          const v = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, ix ? ix.getX(i + k) : i + k).applyMatrix4(full));
          const b = Math.round(bid.getX(ix ? ix.getX(i) : i));
          (per.get(b) || per.set(b, []).get(b)).push(v.map((p) => [p.x, p.y, p.z]));
        }
      }
      for (const [b, tris] of per) {
        const w = lonLatToWorld(bt.Longitude[b], bt.Latitude[b]);
        if (Math.hypot(w.x - centre[0], w.z - centre[1]) > radius) continue;
        const pts = tris.flat(), minY = Math.min(...pts.map((p) => p[1]));
        const base = Math.min(...pts.filter((p) => p[1] < minY + 0.05).map((p) => groundHeight(p[0], p[2])));
        out.push({ u: t.u, b, cx: +w.x.toFixed(1), cz: +w.z.toFixed(1), h: bt.Height?.[b], n: tris.length, base: +base.toFixed(2),
          tris: tris.map((tr) => tr.flat().map((v, i) => Math.round((i % 3 === 1 ? v - minY + base : v) * 100) / 100)) });
      }
    }
    const ground = [];
    for (let dz = -radius - 20; dz <= radius + 20; dz += 6) for (let dx = -radius - 20; dx <= radius + 20; dx += 6) {
      ground.push([centre[0] + dx, centre[1] + dz, +groundHeight(centre[0] + dx, centre[1] + dz).toFixed(1)]);
    }
    const post = (file, body) => fetch(RECV + file, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
    await post(name + '.json', out);
    await post(name + '.ground.json', ground);
    res[name] = out.length;
  }
  return JSON.stringify(res);
}

/** Walks every outer wall of the outlines in js/landmarks.js SURVEYED_FOOTPRINTS (or `extra`'s, for a module that
 * registers []): 1 m before it must be free (else an invisible wall), 0.6 m behind it must push out (else one walks
 * in). → { osm id: [walls, blocked before, free behind] } and the offending wall midpoints */
export async function probe(extra = {}) {
  const { SURVEYED_FOOTPRINTS } = await import('/js/landmarks.js');
  const { groundHeight } = await import('/js/terrain.js');
  const { pointInRing } = await import('/js/spital-data.js');
  const cm = g().controllerManager, res = {}, bad = {};
  const moved = (x, z, r = 0.48) => { const p = { x, z, y: groundHeight(x, z) + 1 }; cm.resolveHorizontalCollision(p, r); return Math.hypot(p.x - x, p.z - z) > 0.05; };
  for (const [id, own] of SURVEYED_FOOTPRINTS) {
    const rings = extra[id] || own;
    if (!rings.length) continue;
    let n = 0, before = 0, behind = 0;
    for (const ring of rings) {
      const sg = Math.sign(ring.reduce((s, a, i) => { const b = ring[(i + 1) % ring.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0));
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 2) continue;
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        let nx = (b[1] - a[1]) / L * sg, nz = -(b[0] - a[0]) / L * sg;
        const inside = (d) => rings.some((r) => pointInRing(r, mx + nx * d, mz + nz * d));
        if (inside(0.5)) { nx = -nx; nz = -nz; }
        if (inside(0.5)) continue; // (a wall between two volumes)
        n++;
        if (moved(mx + nx, mz + nz)) { before++; (bad[id] ||= []).push(['before', +mx.toFixed(1), +mz.toFixed(1)]); }
        if (!moved(mx - nx * 0.6, mz - nz * 0.6)) { behind++; (bad[id] ||= []).push(['behind', +mx.toFixed(1), +mz.toFixed(1)]); }
      }
    }
    res[id] = [n, before, behind];
  }
  return JSON.stringify(res) + ' ' + JSON.stringify(bad);
}
