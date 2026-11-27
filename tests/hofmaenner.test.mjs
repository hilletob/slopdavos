import test from 'node:test';
import assert from 'node:assert/strict';
import { HOFMAENNER as H, coverAt, groundOutlines, isOutwardWall, onWall, outwardRing, part, partAt, pointInRing, ringArea2, wallFrame, wallStretches } from '../js/hofmaenner-data.js';
import { HOFMAENNER as WAX } from '../js/missions-data-resort.js';

/** The distance from (x, z) to the nearest wall of the outlines the player's walls stand on */
function wallDistance(x, z) {
  let d = Infinity;
  for (const ring of groundOutlines()) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
      d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
    }
  }
  return d;
}
const inside = (x, z) => groundOutlines().some((r) => pointInRing(r, x, z));

test('the volumes: outlines of some size, each roof over its foot, the tower\'s five floors over its dark foot', () => {
  for (const p of H.parts) {
    assert.ok(p.ring.length >= 4 && Math.abs(ringArea2(p.ring)) / 2 > 15, `${p.id}: an outline of some size`);
    assert.ok(p.top > p.from + 2.4, `${p.id}: its roof over its foot`);
  }
  // the survey's roofs: the wings 8.8 m over the car park, the tower 19.6 m, the attic one floor over it
  assert.equal(part('south-wing').top, -14.25);
  assert.equal(part('tower').top, -3.41);
  assert.equal(part('attic').from, part('tower').top);
  const T = part('tower');
  assert.ok(T.line <= T.top && T.top - T.line < 0.2, 'the floors end at the eaves');
  assert.ok(Math.abs(T.line - 5 * H.storey - H.tower.foot) < 1e-9, 'five floors over the foot');
  assert.ok(H.tower.foot - H.tower.glass > 1.2 && H.tower.glass > -21, 'the shops\' glazing under the dark band');
  // a timber floor fits its window row under its roof
  for (const id of ['north-block', 'attic']) assert.ok(part(id).top - part(id).from > H.win.hi + 0.3, id);
  // the floors' windows clear the wings' roofs they rise from
  for (const roof of [-14.25, -11.28]) {
    const k = Math.floor((roof - (T.line - 40 * H.storey)) / H.storey);
    const lo = T.line - 40 * H.storey + k * H.storey + H.win.lo;
    assert.ok(lo > roof + 0.1 || lo + H.storey > roof + 0.1, `over the roof at ${roof}`);
  }
  // the stair heads stand on the attic, the attic on the tower
  for (const id of ['head-west', 'head-east', 'attic']) {
    const p = part(id), [x, z] = p.ring.reduce((s, q) => [s[0] + q[0] / p.ring.length, s[1] + q[1] / p.ring.length], [0, 0]);
    assert.ok(pointInRing(part('tower').ring, x, z), `${id} over the tower`);
  }
});

test('the walls face outwards: a step out of a wall leaves the outline', () => {
  for (const p of H.parts) {
    const ring = outwardRing(p.ring);
    let out = 0, walls = 0;
    for (let i = 0; i < ring.length; i++) {
      const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
      if (F.len < 2) continue;
      walls++;
      const [x, z] = onWall(F, F.len / 2, 0.2);
      if (!pointInRing(p.ring, x, z)) out++;
    }
    assert.equal(out, walls, `${p.id}: ${out} of ${walls} walls face out`);
  }
});

test('the walls stand free where no volume stands before them: the tower on the car park, hidden by the wings elsewhere', () => {
  const T = part('tower'), r = outwardRing(T.ring);
  let ground = 0, hidden = 0;
  for (let i = 0; i < r.length; i++) {
    for (const st of wallStretches(T, r[i], r[(i + 1) % r.length])) {
      assert.ok(st.from >= 0 && st.to > st.from && st.y0 < T.top);
      if (st.ground) {
        ground += st.to - st.from;
        // (only on the north-west face, towards the car park, between the wings)
        const [x, z] = onWall(wallFrame(r[i], r[(i + 1) % r.length]), (st.from + st.to) / 2);
        assert.ok(z > 135 && z < 153 && x < -254, `a free foot at ${x.toFixed(1)} ${z.toFixed(1)}`);
      } else hidden++;
    }
  }
  assert.ok(ground > 20 && ground < 32, `the tower's foot on the car park: ${ground.toFixed(1)} m`);
  assert.ok(hidden > 10);
  // the south-west wing's wall against the tower is hidden whole; the strip in front of the north-east block too
  assert.ok(isOutwardWall(part('south-wing'), [-255.3, 155.2], [-258.7, 159.4]));
  assert.equal(wallStretches(part('south-wing'), [-255.3, 155.2], [-258.7, 159.4]).length, 0);
  assert.equal(coverAt(part('north-wing'), -236.0, 140.0), -11.28);
  // nothing of the wings or the tower stands on the stair heads' roofs
  for (const id of ['head-west', 'head-east']) assert.ok(partAt(...part(id).ring[0]) !== null);
});

test('Sport Hofmänner\'s door: on the Mattastrasse, before the doors drawn in the east strip, reachable from the start', () => {
  const E = H.entrance, F = wallFrame(E.a, E.b);
  assert.ok(isOutwardWall(part('east-strip'), E.a, E.b), 'the east strip\'s wall');
  assert.ok(F.n[1] > 0.85, 'facing the Mattastrasse (south)');
  assert.ok(E.s - E.w / 2 > 0.2 && E.s + E.w / 2 < F.len - 0.1 && E.canopy.s0 >= 0 && E.canopy.s1 <= F.len + 0.1);
  const Bd = E.board;
  assert.ok(Bd.s - Bd.w / 2 >= 0 && Bd.s + Bd.w / 2 <= F.len && Bd.y0 > H.low.glass && Bd.y1 < part('east-strip').top - 0.3);
  assert.ok(E.y1 < H.low.glass && E.canopy.y > E.y1 && E.canopy.y < H.low.glass);
  // the mission's door lies before the doors: along the wall within them, out of it in the street
  const D = WAX.door, s = (D.x - E.a[0]) * F.u[0] + (D.z - E.a[1]) * F.u[1], o = (D.x - E.a[0]) * F.n[0] + (D.z - E.a[1]) * F.n[1];
  assert.ok(Math.abs(s - E.s) < E.w, `the door ${s.toFixed(2)} m along the wall`);
  assert.ok(o > 0 && o - D.r < 2.0, `${o.toFixed(2)} m out of the wall, its reach ${D.r}`);
  assert.ok(!inside(D.x, D.z) && !partAt(D.x, D.z));
  // a spot within its reach stands free of every wall (the player's radius and more)
  const [fx, fz] = onWall(F, s, o - D.r + 0.3);
  assert.ok(Math.hypot(fx - D.x, fz - D.z) < D.r && wallDistance(fx, fz) > 0.6 && !inside(fx, fz));
  // the way from the start to the door crosses no wall
  const S = WAX.start;
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const x = S.x + (D.x - S.x) * t, z = S.z + (D.z - S.z) * t;
    assert.ok(!inside(x, z) && wallDistance(x, z) > 0.6, `the way at ${t.toFixed(2)}`);
  }
});

test('the boards, the canopy and the balconies lie on their walls; the atlas\' cells apart', async () => {
  const Pc = H.porch, PF = wallFrame(Pc.a, Pc.b);
  assert.ok(isOutwardWall(part('tower'), Pc.a, Pc.b) && PF.n[0] < -0.5 && PF.n[1] < -0.5, 'the porch on the north-west face');
  assert.ok(Pc.canopy.s0 >= 0 && Pc.canopy.s1 <= PF.len && Pc.canopy.y > H.tower.glass - 0.3);
  for (const b of H.boards) {
    const p = part(b.key === 'lada' ? 'tower' : 'south-wing'), F = wallFrame(b.a, b.b);
    assert.ok(isOutwardWall(p, b.a, b.b), b.key);
    assert.ok(F.n[0] < -0.5 && F.n[1] < -0.5, `${b.key} faces the car park (north-west)`);
    assert.ok(b.s - b.w / 2 >= 0 && b.s + b.w / 2 <= F.len, `${b.key} within its wall`);
    const band = p.kind === 'tower' ? [H.tower.glass, H.tower.foot] : [H.low.glass, p.top];
    assert.ok(b.y0 > band[0] && b.y1 < band[1], `${b.key} on the dark band`);
    assert.ok(wallStretches(p, b.a, b.b).some((st) => st.ground && st.from <= b.s - b.w / 2 && st.to >= b.s + b.w / 2), `${b.key} on a free stretch`);
  }
  const { balconyFloors } = await loadModule();
  for (const l of H.balconies) {
    const F = wallFrame(l.a, l.b);
    assert.ok(isOutwardWall(part('tower'), l.a, l.b));
    assert.ok(l.s0 >= 0 && l.s1 <= F.len + 0.05 && l.out > 0.5 && l.out < 1.6);
    const floors = balconyFloors(l);
    assert.ok(floors.length >= 3 && floors.length <= 5, `${floors.length} balconies`);
    // (none inside a wing: each floor over the roofs before it)
    for (const y of floors) for (let s = l.s0; s <= l.s1; s += 0.5) { const q = partAt(...onWall(F, s, l.out / 2)); assert.ok(!q || q.top < y || q.id === 'tower' || q.id === 'attic' || q.kind === 'head'); }
  }
  const { ATLAS } = await loadModule();
  const cells = Object.values(ATLAS);
  for (const [x, y, w, h] of cells) assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 256);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = [cells[i], cells[j]];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'cells apart');
  }
});

// (the module in Node: a stand-in canvas)
let mod = null;
async function loadModule() {
  if (mod) return mod;
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  mod = await import('../js/hofmaenner.js');
  return mod;
}

test('the building in Node: every vertex finite, six meshes, the shop\'s sign given way, the outlines registered', async () => {
  const THREE = await import('three/webgpu');
  const { buildHofmaenner } = await loadModule();
  const { SURVEYED_FOOTPRINTS } = await import('../js/landmarks.js');
  const { SHOP_EXCLUSIONS } = await import('../js/shops.js');
  assert.ok(SHOP_EXCLUSIONS.has(H.shop));
  assert.equal(SURVEYED_FOOTPRINTS.get(H.osm).length, 5);
  const scene = new THREE.Scene();
  const { group, colliders } = buildHofmaenner(scene);
  assert.equal(colliders.length, 0);
  assert.equal(group.userData.terrain, 'absolute');
  const names = group.children.map((m) => m.name).sort();
  assert.deepEqual(names, ['Hofmänner decal', 'Hofmänner glass', 'Hofmänner plaster', 'Hofmänner roof', 'Hofmänner timber', 'Hofmänner trim']);
  let tris = 0;
  for (const m of group.children) {
    const p = m.geometry.attributes.position;
    assert.ok(p.count > 0);
    tris += p.count / 3;
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: a vertex`);
    for (let i = 1; i < p.array.length; i += 3) assert.ok(p.array[i] > H.base - 1.5 && p.array[i] < 2.2, `${m.name}: a height of ${p.array[i]}`);
  }
  assert.ok(tris < 20000, `${tris} triangles`);
});

test('the phone\'s profile: only SIMPLE_SKINS\' materials and the decal', async () => {
  const THREE = await import('three/webgpu');
  const { QUALITY } = await import('../js/quality.js');
  const { SIMPLE_SKINS } = await import('../js/landmark-buildings.js');
  const { buildHofmaenner } = await loadModule();
  const made = new Set(), orig = {};
  for (const k of Object.keys(SIMPLE_SKINS)) { orig[k] = SIMPLE_SKINS[k]; SIMPLE_SKINS[k] = (...a) => { const m = orig[k](...a); made.add(m); return m; }; }
  const was = QUALITY.simpleMaterials;
  QUALITY.simpleMaterials = true;
  try {
    const scene = new THREE.Scene();
    const { group } = buildHofmaenner(scene);
    for (const m of group.children) {
      const mat = m.material;
      const decal = mat.opacityNode && mat.transparent && !mat.emissiveNode && !mat.roughnessNode;
      const procedural = mat.colorNode || mat.emissiveNode || mat.roughnessNode || mat.normalNode || mat.positionNode;
      assert.ok(made.has(mat) || decal || !procedural, `${m.name}: a full shader on the phone`);
    }
  } finally {
    QUALITY.simpleMaterials = was;
    Object.assign(SIMPLE_SKINS, orig);
  }
});
