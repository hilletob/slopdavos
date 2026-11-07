import { GROUND_MARKINGS } from './ground-markings-data.js';

// js/ground-markings-area.js — where the road paint is traced from the aerial photo (js/ground-markings-data.js,
// tools/trace-ground.mjs --layer markings): there js/vector-ground.js draws it, and the rule-based markings
// (js/road-paint.js from the road network, js/city-grid.js centre lines, BUS lettering and OSM crossings) step back.

const BOXES = GROUND_MARKINGS.sites.map((s) => s.box);

/** Whether the paint at (x, z) is traced */
export const tracedMarkings = (x, z) => BOXES.some((b) => x >= b[0] && x < b[2] && z >= b[1] && z < b[3]);

/**
 * `geometry` (flat, any index) without the triangles whose centre lies where the paint is traced: the same object when
 * none does, a new non-indexed geometry otherwise (null when nothing is left)
 */
export function withoutTraced(geometry) {
  if (!BOXES.length) return geometry;
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = flat.attributes.position, n = p.count / 3, keep = [];
  for (let t = 0; t < n; t++) {
    const x = (p.getX(3 * t) + p.getX(3 * t + 1) + p.getX(3 * t + 2)) / 3, z = (p.getZ(3 * t) + p.getZ(3 * t + 1) + p.getZ(3 * t + 2)) / 3;
    if (!tracedMarkings(x, z)) keep.push(t);
  }
  if (keep.length === n) { if (flat !== geometry) flat.dispose(); return geometry; }
  const out = flat.clone();
  for (const [name, a] of Object.entries(flat.attributes)) {
    const s = a.itemSize, arr = new a.array.constructor(keep.length * 3 * s);
    keep.forEach((t, k) => arr.set(a.array.subarray(t * 3 * s, (t + 1) * 3 * s), k * 3 * s));
    out.setAttribute(name, new a.constructor(arr, s, a.normalized));
  }
  if (flat !== geometry) flat.dispose();
  return keep.length ? out : null;
}
