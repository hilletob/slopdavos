import test from 'node:test';
import assert from 'node:assert/strict';
import { PARSENNBAHN_TAL as P, PARSENN, groundOutlines, isWall, onWall, outwardRing, partTop, partsAt, plan, pointInRing, ringArea2, wallFrame, wallStretches } from '../js/parsennbahn-tal-data.js';

const part = (id) => P.parts.find((p) => p.id === id);
/** Is a → b (or b → a) a wall of the part? */
const wallOf = (p, w) => p.ring.some((q, i) => isWall(w, q, p.ring[(i + 1) % p.ring.length]));

// (a stand-in canvas for the build in Node)
const noop = () => {};
const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };

test('the station\'s volumes: outlines of some size, at the surveyed heights, the floors adding up to the main block\'s roof', () => {
  for (const p of P.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(plan(p))) / 2 > 15, `${p.id}: an outline of some size`);
    assert.ok(partTop(p) > P.floor + 8 && partTop(p) < P.floor + 20, `${p.id}: its roof`);
    if (p.top === undefined) assert.ok(p.ring.every((q) => Number.isFinite(q[2])), `${p.id}: a height per corner`);
  }
  // ~1600 m² in all (OSM w219434717: 1590 m²)
  const area = P.parts.reduce((s, p) => s + Math.abs(ringArea2(plan(p))) / 2, 0);
  assert.ok(area > 1400 && area < 1800, `area ${area}`);
  // the shop's floor on the Promenade (y −3.1 to −2.1), three floors over it, the top floor's top under the roof, the band
  // over it; the balcony band at the second floor's foot, the blue stripe at the top floor's foot
  const main = part('main');
  assert.ok(Math.abs(P.line - 3 * P.storey - P.shopTop) < 1e-9);
  assert.ok(P.shopTop - -2.1 > 3.6 && P.shopTop - -2.1 < 4.8, 'a tall shop floor');
  assert.ok(P.line < main.top && main.top - P.line < 1.0 && P.band.y0 === P.line && P.band.y1 > main.top);
  assert.ok(Math.abs(P.balcony.y - (P.shopTop + P.storey)) < 1e-9 && Math.abs(P.stripe - (P.shopTop + 2 * P.storey)) < 1e-9);
  // the pavilion's roof under the floor with the lettering, the balcony band's parapet about as high
  assert.ok(part('wing').top < P.davos.y[0] && Math.abs(P.balcony.y + P.balcony.rail - part('wing').top) < 0.3);
  // the west block's windows stop under its roof (no sliver of a window over its top floor)
  const west = part('west');
  assert.ok(west.top + 0.3 - west.line < 0.8);
  // the older tests' view of it (js/landmark-buildings-data.js PARSENN)
  assert.equal(PARSENN.parts.length, P.parts.length);
  for (const p of PARSENN.parts) { assert.ok(p.h > 8 && p.h < 20); if (p.roof) assert.equal(p.roof.length, p.ring.length / 2); }
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of P.parts) {
    const ring = outwardRing(plan(p));
    let out = 0, walls = 0;
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      if (F.len < 2) continue;
      walls++;
      if (!pointInRing(plan(p), ...onWall(F, F.len / 2, 0.2))) out++;
    }
    assert.equal(out, walls, `${p.id}: ${out} of ${walls} walls face out`);
  }
});

test('the named walls: the shop front and the entrance face the Promenade, the lettering on its walls, clear of windows', () => {
  const main = part('main'), wing = part('wing');
  assert.ok(wallOf(main, P.shop));
  const S = wallFrame(P.shop.a, P.shop.b);
  assert.ok(S.n[0] > 0.7 && S.n[1] > 0.4, 'the shop front faces east-south-east');
  // (the Promenade's line 668/−1426 – 690/−1459 runs before it)
  assert.ok((668 - P.shop.a[0]) * S.n[0] + (-1426 - P.shop.a[1]) * S.n[1] > 0);
  assert.ok(P.shop.glass[0] < P.shop.glass[1] && P.shop.glass[1] < P.shopTop);
  assert.ok(wallOf(wing, P.entrance));
  const E = wallFrame(P.entrance.a, P.entrance.b);
  assert.ok(E.n[0] > 0.7 && E.n[1] > 0.4, 'the entrance faces east-south-east');
  const { doors, sign, doorTop } = P.entrance;
  assert.ok(doors[0] > 0 && doors[1] < E.len && sign.s[0] >= 0 && sign.s[1] <= E.len);
  assert.ok(doorTop < sign.y[0] && sign.y[1] < wing.top - 0.4, 'the lettering between the doors and the fascia');
  // "DAVOS KLOSTERS mountains": on the main block's north-east end, over the pavilion's roof, on a stretch without windows
  assert.ok(wallOf(main, P.davos));
  const D = wallFrame(P.davos.a, P.davos.b);
  assert.ok(D.n[0] > 0.4 && D.n[1] < -0.6, 'facing north-east');
  assert.ok(P.davos.s[0] >= P.davos.clear[0] && P.davos.s[1] <= P.davos.clear[1] && P.davos.clear[1] < D.len);
  assert.ok(P.davos.y[0] > wing.top + 0.25 && P.davos.y[1] < P.stripe - 0.25, 'between the pavilion\'s fascia and the blue stripe');
  assert.deepEqual(wallStretches(P.davos.a, P.davos.b).map((s) => s.windows), [true, false, true]);
  assert.deepEqual(wallStretches(P.davos.b, P.davos.a).map((s) => s.windows), [true, false, true]);
  assert.deepEqual(wallStretches(P.shop.a, P.shop.b).map((s) => s.windows), [true]);
  // the panel on the pavilion's north-east face
  assert.ok(wallOf(wing, P.panel));
  const N = wallFrame(P.panel.a, P.panel.b);
  assert.ok(N.n[0] > 0.4 && N.n[1] < -0.6 && P.panel.s[0] >= 0 && P.panel.s[1] <= N.len && P.panel.y[1] < wing.top);
});

test('the atlas\' cells lie apart inside it; the banners stand on the main block\'s roof', async () => {
  const { ATLAS, flagPoles } = await import('../js/parsennbahn-tal.js');
  const cells = Object.entries(ATLAS);
  for (const [k, [x, y, w, h]] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 512, k);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i][1], cells[j][1]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `${cells[i][0]} and ${cells[j][0]}`);
  }
  // (the row along the Promenade front stands in the red sockets before the band, the three behind the north-east end on
  // the roof)
  const S = wallFrame(P.shop.a, P.shop.b);
  for (const [x, z] of flagPoles()) {
    const before = (x - P.shop.a[0]) * S.n[0] + (z - P.shop.a[1]) * S.n[1];
    assert.ok(pointInRing(plan(part('main')), x, z) || (before > 0 && before < 0.5), `a pole at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }
  assert.equal(flagPoles().filter(([x, z]) => pointInRing(plan(part('main')), x, z)).length, P.flags.end.length);
});

test('the funicular\'s cut under the station stays clear: no wall reaches down into it', async () => {
  const { BERGBAHNEN } = await import('../js/bergbahnen-data.js');
  const { funicularTrack } = await import('../js/funicular-track.js');
  const { wallPieces } = await import('../js/parsennbahn-tal.js');
  const f = BERGBAHNEN.funiculars.find((l) => l.id === 'Parsennbahn|2200');
  const p = funicularTrack(f)[0];
  // the track's lower end under the hall, in the cut
  assert.ok(pointInRing(plan(part('hall')), p[0].x, p[0].z) && p[0].y < -5);
  // its first 70 m and 8 m past its end (js/bergbahnen.js undergroundEnds), the mission's tube 5.8 m over the rails and
  // 5.7 m to the side (js/missions-parsenn.js HALL): every piece of wall within 6 m of the line stands over it
  const track = [];
  { const A = p[1], B = p[0], h = Math.hypot(B.x - A.x, B.z - A.z); for (let d = 8; d > 0; d -= 1) track.push({ x: B.x + (B.x - A.x) / h * d, y: B.y + (B.y - A.y) / h * d, z: B.z + (B.z - A.z) / h * d }); }
  let L = 0;
  for (let i = 0; i < p.length && L < 70; i++) { if (i) L += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); track.push(p[i]); }
  let checked = 0;
  for (const w of wallPieces()) {
    for (let k = 0; k <= 8; k++) {
      const s = w.s0 + (w.s1 - w.s0) * k / 8, [x, z] = onWall(w.F, s);
      const foot = w.bottom[0] + (w.bottom[1] - w.bottom[0]) * k / 8;
      // (the nearest point of the line, the rails' height there)
      let best = null;
      for (let i = 1; i < track.length; i++) {
        const A = track[i - 1], B = track[i], dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - A.x) * dx + (z - A.z) * dz) / L2)), d = Math.hypot(A.x + dx * u - x, A.z + dz * u - z);
        if (!best || d < best.d) best = { d, y: A.y + (B.y - A.y) * u };
      }
      if (best.d > 6) continue;
      checked++;
      assert.ok(foot > best.y + 5.9, `${w.part.id}: a wall's foot at ${foot.toFixed(2)} over the rails at ${best.y.toFixed(2)} (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
  assert.ok(checked > 10, 'walls over the cut were checked');
});

test('the outlines the player\'s walls stand on; the forecourt before the entrance and the mission\'s pin', async (t) => {
  const outlines = groundOutlines();
  assert.equal(outlines.length, P.parts.length);
  for (const r of outlines) assert.ok(r.every((q) => q.length === 2));
  const { DAVOS_DATA } = await import('../js/davos-geodata.js');
  const osm = DAVOS_DATA.buildings.find((b) => b.id === P.osm);
  const osmRing = [];
  for (let i = 0; i < osm.ring.length; i += 2) osmRing.push([osm.ring[i], osm.ring[i + 1]]);
  // the doors are reached from the Promenade: 1.5 and 4 m before them nothing of the station, nor of OSM's outline
  const E = wallFrame(P.entrance.a, P.entrance.b), mid = (P.entrance.doors[0] + P.entrance.doors[1]) / 2;
  for (const o of [1.5, 4]) {
    const [x, z] = onWall(E, mid, o);
    assert.deepEqual(partsAt(x, z), [], `${o} m before the doors`);
    assert.ok(!pointInRing(osmRing, x, z));
  }
  // the shop's front: the walk along the Promenade 1.5 m before it is free
  const S = wallFrame(P.shop.a, P.shop.b);
  for (let s = 1; s < S.len; s += 3) assert.deepEqual(partsAt(...onWall(S, s, 1.5)), []);
  // The machinist's mission (js/missions-data-parsenn.js VALLEY) starts and pins in the main block: the walker waits
  // hidden while the train runs (js/missions-parsenn.js); the spot lay inside OSM's outline and the old parts already
  const { VALLEY } = await import('../js/missions-data-parsenn.js');
  const inMain = pointInRing(plan(part('main')), VALLEY.x, VALLEY.z);
  assert.equal(pointInRing(osmRing, VALLEY.x, VALLEY.z), inMain, 'no change for the mission\'s start');
  if (inMain) t.diagnostic(`the Parsennbahn mission's start ${VALLEY.x}/${VALLEY.z} lies inside the main block (as inside OSM's outline before)`);
});

test('the building in Node: every vertex finite, five meshes, no colliders of its own', async () => {
  const THREE = await import('three/webgpu');
  const { buildParsennbahnTal } = await import('../js/parsennbahn-tal.js');
  const scene = new THREE.Scene();
  const { group, colliders } = buildParsennbahnTal(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  assert.deepEqual(group.children.map((m) => m.name).sort(), ['Parsennbahn decal', 'Parsennbahn glass', 'Parsennbahn plaster', 'Parsennbahn roof', 'Parsennbahn trim']);
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > -6 && p.array[i] < 24, `${m.name}: a height of ${p.array[i]}`);
  }
});

test('the phone\'s profile: plain skins, the decals\' atlas', async () => {
  const { QUALITY } = await import('../js/quality.js');
  const THREE = await import('three/webgpu');
  const { buildParsennbahnTal } = await import('../js/parsennbahn-tal.js');
  const was = QUALITY.simpleMaterials;
  QUALITY.simpleMaterials = true;
  try {
    const scene = new THREE.Scene();
    const { group } = buildParsennbahnTal(scene);
    for (const m of group.children) {
      const mat = m.material, decal = m.name.endsWith('decal');
      // (SIMPLE_SKINS' windowed and glow carry a colour node or an emissive node; the trim none; the decal its texture)
      if (decal) assert.ok(mat.opacityNode && !mat.roughnessNode && !mat.emissiveNode);
      else assert.ok(!mat.roughnessNode && !mat.normalNode && !mat.positionNode, `${m.name}: a plain skin`);
    }
  } finally { QUALITY.simpleMaterials = was; }
});
