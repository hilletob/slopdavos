// tools/bake-ez-trees.mjs — bakes the close-up tree models (npm run bake:trees): Norway spruce, European larch,
// mountain maple and silver birch grown with EZ-Tree (Dan Greenheck, MIT: assets/trees/LICENSE-ez-tree.txt) from
// tuned presets, scaled to the species' natural height in js/trees.js, and written as compact quantised geometry to
// assets/trees/ (ez-trees.json + ez-trees.bin), so that the browser never loads the npm package.
//
// The models are shaded like the procedural trees (js/trees.js): bark uv in metres, leaf cards textured from our own
// leaf atlas (card-local uv here, mapped into the species' tile at load time), crown-shell normals, interior occlusion
// and sway weights in the aTree attribute (leaf, ao, sway, rnd).
//
// Binary layout per model, every block 4-byte aligned: position int16 x3 (over the model's box), normal int8 x3,
// uv uint16 x2 (over [0, uvMax]), aTree uint8 x4, index uint16.
import { register } from 'node:module';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets/trees');
const EZ = join(ROOT, 'node_modules/@dgreenheck/ez-tree');
register(pathToFileURL(join(ROOT, 'tools/ez-tree-hooks.mjs')));

const THREE = await import('three');
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); }; // (no textures needed: ours)
const { Tree } = await import(pathToFileURL(join(EZ, 'src/lib/index.js')).href);
const { loadPreset } = await import(pathToFileURL(join(EZ, 'src/lib/presets/index.js')).href);
const { makeCrown, makeCone, SPECIES_INDEX, SPECIES_HEIGHT, TREE_SPECIES } = await import(pathToFileURL(join(ROOT, 'js/trees.js')).href);

// --- The models ---------------------------------------------------------------------------------------------------
// `preset` + `branch` / `leaves` overrides (EZ-Tree options; lengths in its own units, the model is scaled to the
// species height after), `card`: the leaf card size in metres, `shape`: the height class the model is planted for
// (trees.js picks by the tree's actual height), `cut`: a broken-off top (share of the height kept).
const SPRUCE = {
  type: 'evergreen',
  branch: {
    levels: 1, angle: { 1: 104 }, children: { 0: 72 }, gnarliness: { 0: 0.02, 1: 0.06 },
    length: { 0: 50, 1: 15 }, radius: { 0: 1.0, 1: 0.34 }, sections: { 0: 10, 1: 4 }, segments: { 0: 7, 1: 3 },
    start: { 1: 0.14 }, force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.0015 }
  },
  leaves: { billboard: 'double', angle: 48, count: 15, start: 0.08, sizeVariance: 0.2 }
};
const LARCH = {
  type: 'evergreen',
  branch: {
    levels: 1, angle: { 1: 88 }, children: { 0: 44 }, gnarliness: { 0: 0.04, 1: 0.12 },
    length: { 0: 50, 1: 17 }, radius: { 0: 1.0, 1: 0.36 }, sections: { 0: 10, 1: 5 }, segments: { 0: 7, 1: 3 },
    start: { 1: 0.2 }, force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.012 }
  },
  leaves: { billboard: 'double', angle: 40, count: 34, start: 0.12, sizeVariance: 0.25 }
};
const merge = (a, b) => {
  const o = structuredClone(a);
  for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(o[k] || {}, v) : v;
  return o;
};
const MODELS = [
  // Norway spruce: a young tree feathered to the ground, a full-grown one, a tall forest spruce with a long clear stem,
  // and an old one whose top has broken off
  { species: 'spruce', shape: 'young', preset: 'Pine Medium', seed: 101, card: 1.55,
    opts: merge(SPRUCE, { branch: { children: { 0: 60 }, length: { 1: 19 }, start: { 1: 0.03 }, angle: { 1: 100 } } }) },
  { species: 'spruce', shape: 'medium', preset: 'Pine Medium', seed: 202, card: 1.75, opts: SPRUCE },
  { species: 'spruce', shape: 'tall', preset: 'Pine Large', seed: 303, card: 1.9,
    opts: merge(SPRUCE, { branch: { children: { 0: 76 }, length: { 1: 12.5 }, start: { 1: 0.34 }, angle: { 1: 108 }, radius: { 0: 0.9 } } }) },
  { species: 'spruce', shape: 'broken', preset: 'Pine Large', seed: 404, card: 1.9, cut: 0.8,
    opts: merge(SPRUCE, { branch: { children: { 0: 80 }, length: { 1: 13.5 }, start: { 1: 0.28 }, angle: { 1: 110 }, gnarliness: { 1: 0.1 } } }) },
  // European larch: lighter and more open, level limbs whose tips turn up
  { species: 'larch', shape: 'young', preset: 'Pine Medium', seed: 505, card: 1.45,
    opts: merge(LARCH, { branch: { children: { 0: 36 }, length: { 1: 20 }, start: { 1: 0.08 } } }) },
  { species: 'larch', shape: 'medium', preset: 'Pine Medium', seed: 606, card: 1.55, opts: LARCH },
  { species: 'larch', shape: 'tall', preset: 'Pine Large', seed: 707, card: 1.6,
    opts: merge(LARCH, { branch: { children: { 0: 48 }, length: { 1: 15 }, start: { 1: 0.38 }, angle: { 1: 84 } } }) },
  // Mountain maple: a stout trunk, heavy ascending limbs, a broad dome
  { species: 'maple', shape: 'any', preset: 'Ash Medium', seed: 808, card: 1.15,
    opts: { branch: { children: { 0: 6, 1: 4, 2: 3 }, sections: { 0: 8, 1: 6, 2: 4, 3: 3 }, segments: { 0: 8, 1: 5, 2: 3, 3: 3 }, angle: { 1: 52 } },
      leaves: { count: 6, sizeVariance: 0.25, start: 0.1 } } },
  { species: 'maple', shape: 'any', preset: 'Ash Large', seed: 909, card: 1.2,
    opts: { branch: { children: { 0: 7, 1: 4, 2: 3 }, sections: { 0: 8, 1: 6, 2: 4, 3: 3 }, segments: { 0: 8, 1: 5, 2: 3, 3: 3 } },
      leaves: { count: 5, sizeVariance: 0.25, start: 0.1 } } },
  // Silver birch: a slender trunk, steep limbs, hanging twigs
  { species: 'birch', shape: 'any', preset: 'Aspen Medium', seed: 1010, card: 1.25,
    opts: { bark: { type: 'birch' }, branch: { children: { 0: 12, 1: 4 }, sections: { 0: 10, 1: 6, 2: 4 }, segments: { 0: 7, 1: 4, 2: 3 }, force: { strength: -0.012 }, angle: { 2: 50 } },
      leaves: { count: 9, sizeVariance: 0.25, angle: 40 } } },
  { species: 'birch', shape: 'any', preset: 'Aspen Large', seed: 1111, card: 1.3,
    opts: { bark: { type: 'birch' }, branch: { children: { 0: 11, 1: 5, 2: 2 }, levels: 2, sections: { 0: 10, 1: 6, 2: 4 }, segments: { 0: 7, 1: 4, 2: 3 }, force: { strength: -0.01 } },
      leaves: { count: 8, sizeVariance: 0.25 } } }
];

// --- Growing a model, with the branch structure recorded -------------------------------------------------------------
function grow(model, leafSize) {
  const tree = new Tree();
  tree.options.copy(loadPreset(model.preset));
  tree.options.copy(model.opts);
  tree.options.seed = model.seed;
  tree.options.leaves.size = leafSize;
  // Each branch's rings and its leaves, in generation order
  const branches = [];
  const generateBranch = tree.generateBranch.bind(tree);
  tree.generateBranch = (b) => {
    const rec = { level: b.level, sections: b.sectionCount, segments: b.segmentCount, v0: tree.branches.verts.length / 3, l0: tree.leaves.verts.length / 3 };
    generateBranch(b);
    rec.l1 = tree.leaves.verts.length / 3;
    branches.push(rec);
  };
  tree.generate();
  return { tree, branches };
}

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
let rngState = 1;
const rand = () => ((rngState = Math.imul(rngState ^ (rngState >>> 15), 2246822519) + 1) >>> 0) / 4294967296;

function bake(model) {
  const sp = TREE_SPECIES[SPECIES_INDEX[model.species]];
  const H = SPECIES_HEIGHT[SPECIES_INDEX[model.species]];
  rngState = model.seed;
  // First grow measures the height, so the leaf cards can be sized in metres
  const probe = grow(model, 1);
  probe.tree.branchesMesh.geometry.computeBoundingBox();
  const ezHeight = probe.tree.branchesMesh.geometry.boundingBox.max.y * (model.cut || 1);
  const k = H / ezHeight;
  const { tree, branches } = grow(model, model.card / k);
  const B = tree.branches, L = tree.leaves;
  const P = (arr, i) => new THREE.Vector3(arr[i * 3] * k, arr[i * 3 + 1] * k, arr[i * 3 + 2] * k);
  const cut = model.cut ? H + 0.01 : Infinity;

  // The crown, from the leaves (as trees.js: cone round the leader for the conifers, ellipsoid for the broadleaves)
  const leafPts = [];
  for (let i = 0; i < L.verts.length / 3; i++) { const p = P(L.verts, i); if (p.y < cut) leafPts.push(p); }
  const crown = (sp.conifer ? makeCone : makeCrown)(leafPts);

  const pos = [], nrm = [], uv = [], attr = [], idx = [];
  const vertex = (p, n, u, v, leaf, ao, sway, rnd) => {
    pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); uv.push(u, v); attr.push(leaf, ao, sway, rnd);
    return pos.length / 3 - 1;
  };

  // Bark: ring by ring, uv in metres (round the first ring, along the branch); sway 0 on the trunk, rising out along
  // the limbs (as swayWeight in trees.js)
  const topLevel = tree.options.branch.levels;
  for (const b of branches) {
    const N = b.segments + 1;
    const rings = b.sections + 1;
    const ring0 = P(B.verts, b.v0);
    if (ring0.y > cut) continue;
    const centres = [];
    for (let i = 0; i < rings; i++) {
      const c = new THREE.Vector3();
      for (let j = 0; j < b.segments; j++) c.add(P(B.verts, b.v0 + i * N + j));
      centres.push(c.divideScalar(b.segments));
    }
    const r0 = Math.max(0.02, P(B.verts, b.v0).distanceTo(centres[0]));
    let along = 0;
    const base = pos.length / 3;
    for (let i = 0; i < rings; i++) {
      if (i > 0) along += centres[i].distanceTo(centres[i - 1]);
      const t = i / b.sections;
      const sway = b.level === 0 ? 0 : Math.min(1, (b.level === topLevel ? 0.3 : 0.18 * (b.level - 1)) + (b.level === topLevel ? 0.6 : 0.3) * t);
      for (let j = 0; j < N; j++) {
        const vi = b.v0 + i * N + j;
        const p = P(B.verts, vi);
        const n = new THREE.Vector3(B.normals[vi * 3], B.normals[vi * 3 + 1], B.normals[vi * 3 + 2]).normalize();
        vertex(p, n, (j / b.segments) * 2 * Math.PI * r0, along, 0, crown.barkAO(p), sway, 0);
      }
    }
    for (let i = 0; i < b.sections; i++) {
      for (let j = 0; j < b.segments; j++) {
        const a = base + i * N + j, c = a + N;
        // (counter-clockwise from outside: the material drops the bark's back faces)
        const tri = [[a, c, a + 1], [a + 1, c, c + 1]];
        for (const [x, y, z] of tri) {
          const ys = [pos[x * 3 + 1], pos[y * 3 + 1], pos[z * 3 + 1]];
          if (Math.min(...ys) > cut || (b.level === 0 && Math.max(...ys) > cut) || Math.max(...ys) < 0) continue; // (a broken-off top; low limbs drooping into the ground)
          idx.push(x, y, z);
        }
      }
    }
  }
  // Facing: turn the bark's triangles so that they face out along the normals
  let agree = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    const fn = b.clone().sub(a).cross(c.clone().sub(a));
    const vn = new THREE.Vector3(nrm[idx[t] * 3], nrm[idx[t] * 3 + 1], nrm[idx[t] * 3 + 2]);
    agree += Math.sign(fn.dot(vn));
  }
  if (agree < 0) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
  const barkTris = idx.length / 3;

  // Leaf cards: EZ-Tree's quads (corners: top left, bottom left, bottom right, top right), card-local uv, the crown's
  // shell normals and occlusion, sway rising to the card's tip, a random number per card (flutter phase)
  const cards = [];
  for (let q = 0; q < L.verts.length / 12; q++) {
    const c = [0, 1, 2, 3].map((j) => P(L.verts, q * 4 + j));
    cards.push(c);
  }
  // A conifer's leader ends in an upright shoot
  if (sp.conifer && !model.cut) {
    const top = new THREE.Vector3(0, H * 0.9, 0);
    for (const ang of [0, Math.PI / 2]) {
      const s = model.card * 0.9, side = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(s / 2);
      cards.push([top.clone().sub(side).setY(top.y + s), top.clone().sub(side), top.clone().add(side), top.clone().add(side).setY(top.y + s)]);
    }
  }
  let nCards = 0;
  for (const c of cards) {
    if (c[1].y > cut || Math.min(...c.map((p) => p.y)) < 0.05) continue;
    const up = c[0].clone().sub(c[1]).normalize();
    const side = c[2].clone().sub(c[1]).normalize();
    const face = side.clone().cross(up).normalize();
    const mirror = rand() < 0.5, rnd = rand();
    const base = pos.length / 3;
    [[0, 1], [0, 0], [1, 0], [1, 1]].forEach(([u, v], j) => {
      const { n, ao } = crown.shade(c[j], face);
      vertex(c[j], n, mirror ? 1 - u : u, v, 1, ao, lerp(0.8, 1.0, v), rnd);
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    nCards++;
  }
  return { model, sp, pos, nrm, uv, attr, idx, barkTris, cards: nCards, height: H };
}

// --- Writing ----------------------------------------------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
const chunks = [];
let offset = 0;
const push = (typed) => {
  const at = offset;
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  const pad = (4 - (bytes.length % 4)) % 4;
  chunks.push(bytes, new Uint8Array(pad));
  offset += bytes.length + pad;
  return at;
};
const manifest = { generator: 'tools/bake-ez-trees.mjs (EZ-Tree 1.1.0 by Dan Greenheck, MIT)', models: [] };
for (const model of MODELS) {
  const m = bake(model);
  const vCount = m.pos.length / 3;
  if (vCount > 65535) throw new Error(`${model.species} ${model.shape}: ${vCount} vertices`);
  // (the box of what's drawn: rings of a broken-off top stay in the buffer unused, clamped to it)
  const used = [...new Set(m.idx)];
  const min = [0, 1, 2].map((a) => Math.min(...used.map((i) => m.pos[i * 3 + a])));
  const max = [0, 1, 2].map((a) => Math.max(...used.map((i) => m.pos[i * 3 + a])));
  const uvMax = Math.max(1, ...m.uv);
  const q = (v, a) => Math.max(-32768, Math.min(32767, Math.round(((v - min[a]) / Math.max(1e-6, max[a] - min[a])) * 65535 - 32768)));
  const pos = Int16Array.from(m.pos, (v, i) => q(v, i % 3));
  const nrm = Int8Array.from(m.nrm, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 127));
  const uv = Uint16Array.from(m.uv, (v) => Math.round((v / uvMax) * 65535));
  const attr = Uint8Array.from(m.attr, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
  const index = Uint16Array.from(m.idx);
  const entry = {
    species: model.species, shape: model.shape, tile: m.sp.tile, height: m.height, vertices: vCount, triangles: m.idx.length / 3,
    barkTriangles: m.barkTris, cards: m.cards, min, max, uvMax,
    position: push(pos), normal: push(nrm), uv: push(uv), aTree: push(attr), index: push(index), indexCount: index.length
  };
  manifest.models.push(entry);
  console.log(`${model.species.padEnd(6)} ${model.shape.padEnd(6)} ${String(entry.triangles).padStart(6)} triangles (${m.barkTris} bark, ${m.cards} cards), ${vCount} vertices, ${max[1].toFixed(1)} m`);
}
const bin = new Uint8Array(offset);
let at = 0;
for (const c of chunks) { bin.set(c, at); at += c.length; }
writeFileSync(join(OUT, 'ez-trees.bin'), bin);
writeFileSync(join(OUT, 'ez-trees.json'), JSON.stringify(manifest, null, 1) + '\n');
copyFileSync(join(EZ, 'LICENSE'), join(OUT, 'LICENSE-ez-tree.txt'));
console.log(`assets/trees/ez-trees.bin: ${(offset / 1024).toFixed(0)} KB, ${manifest.models.length} models`);
