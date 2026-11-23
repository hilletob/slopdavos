import * as THREE from 'three/webgpu';
import { abs, attribute, float, floor, hash, mix, mx_noise_float, positionView, positionWorld, smoothstep, step, texture, time, uv, vec3 } from 'three/tsl';
import { cityUniforms } from './tsl-materials.js';
import { onWall } from './spital-data.js';

// The scaffolding the buildings rebuilt by hand share (js/spital.js, js/alte-post.js, js/raetia-center.js,
// js/st-johann.js, js/belvedere.js, js/marienkirche.js; the night's threshold also js/landmark-buildings.js,
// js/pfadiheim.js, js/detail-houses.js, js/bergbahnen.js, js/swissbuildings3d.js): the night's glow, the materials'
// nodes for distance, weathering and windows lit at night, the canvas atlas and its decals, the Builder that collects
// quads into one mesh per material, a flat roof over an outline. The walls' frames (wallFrame, onWall, outwardRing,
// pointInRing) are js/spital-data.js', pure maths for the tests.

// --- The night ---------------------------------------------------------------------------------------------------------
// How lit the windows and the lamps are: 0 by day and at golden hour, ~0.7 at twilight, 1 from dusk to dawn
// (cityUniforms.uInteriorGlow, js/day-cycle.js)
export const nightGlow = () => smoothstep(0.7, 1.45, cityUniforms.uInteriorGlow);
// Towards midnight: fewer windows lit
export const lateNight = () => smoothstep(1.3, 1.55, cityUniforms.uInteriorGlow);

// --- The materials' nodes ----------------------------------------------------------------------------------------------
/** 1 near the camera, 0 from `hi` m on: a pattern's detail fading out with distance (no shimmer far off) */
export const fade = (lo, hi) => float(1).sub(smoothstep(lo, hi, positionView.z.negate()));
/** Noise over the world in 0–1 (weathering, stains), `s` its frequency per metre */
export const worldNoise = (s) => mx_noise_float(positionWorld.mul(s)).mul(0.5).add(0.5);
/** A soft-edged rectangle: |x| < hw, lo < y < hi (edges `e` wide) */
export const rectMask = (x, y, hw, lo, hi, e = 0.012) => smoothstep(hw + e, hw - e, abs(x)).mul(smoothstep(lo - e, lo + e, y)).mul(smoothstep(hi + e, hi - e, y));

/**
 * The windows' grid of a wall laid out by the Builder: uv.x metres along the wall from its middle, uv.y metres up the
 * floors' grid (closed walls carry v − `closed`, `up` taken off v), aHalf half the wall's length (0: a closed wall).
 * Returns the nodes: half, v, the bay and bu (metres from its middle), the storey and fv (metres up from its foot),
 * open (1 where a window `winHalf` m wide each side fits in the wall), rect(hw, lo, hi, e) a rectangle in the bay.
 */
export function windowGrid({ bay: BAY, storey: STOREY, closed, up = 0, winHalf }) {
  const U = uv().x, V = uv().y;
  const half = attribute('aHalf', 'float');
  let v = V.add(step(V, -1).mul(closed));
  if (up) v = v.sub(up);
  const bay = floor(U.div(BAY).add(0.5)), bu = U.sub(bay.mul(BAY));
  const storey = floor(v.div(STOREY)), fv = v.sub(storey.mul(STOREY));
  const open = step(abs(bay.mul(BAY)).add(winHalf + 0.4), half);
  const rect = (hw, lo, hi, e = 0.012) => rectMask(bu, fv, hw, lo, hi, e);
  return { half, v, bay, bu, storey, fv, open, rect };
}

/** Two tones of the lights behind a window: `a`, and `b` from `at` of its hash on ([r, g, b] linear) */
export const twoTones = (a, b, at) => (c) => mix(vec3(...a), vec3(...b), step(at, c));
/**
 * A window lit or dark (its colour, or black), re-rolled every 5–15 min: cx, cy its cell (nodes), `seed`; `share` of
 * them lit in the evening, `late` towards midnight; `tone(c)` its colour from a hash c in 0–1; `vary`: each a
 * brightness of its own (0.75–1.25)
 */
export function litWindow(cx, cy, seed, { share, late, tone, vary = true }) {
  const h = hash(cx.mul(157.1).add(cy.mul(311.7)).add(seed));
  const slot = time.div(mix(float(300), float(900), hash(h.mul(977)))).add(hash(h.mul(531))).floor();
  const on = step(hash(h.mul(1.3e4).floor().add(slot.mul(7)).add(seed)), mix(float(share), float(late), lateNight()));
  const lit = tone(hash(h.mul(733))).mul(on);
  return vary ? lit.mul(hash(h.mul(41)).mul(0.5).add(0.75)) : lit;
}

// --- The canvas atlas and its decals -----------------------------------------------------------------------------------
/**
 * A canvas of `size` px ([w, h], or the side of a square) to draw an atlas into: { canvas, g, cell }, cell(key, draw)
 * drawing into the atlas' cell `cells[key]` ([x, y, w, h] px; clipped to it, the origin at its corner, draw(w, h))
 */
export function atlasCanvas(size, cells) {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = typeof size === 'number' ? [size, size] : size;
  const g = canvas.getContext('2d');
  const cell = (key, draw) => { const [x, y, w, h] = cells[key]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); draw(w, h); g.restore(); };
  return { canvas, g, cell };
}
/** The canvas as a texture (sRGB, anisotropic) */
export function canvasTexture(canvas) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}
/** The decals' material: the atlas' colours and alpha, drawn over the wall behind (`shade` darkens the colours) */
export function decalMaterial(map, { roughness = 0.75, shade = null } = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness: 0, transparent: true });
  const t = texture(map, uv());
  m.colorNode = shade === null ? t.rgb : t.rgb.mul(shade);
  m.opacityNode = t.a;
  m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
  return m;
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// One mesh per material: quads pushed as two triangles, counter-clockwise seen from their front. `atlas` the decals'
// cells ([x, y, w, h] px) in a canvas of `atlasSize` [w, h], `walls` the bucket (or buckets) whose mesh carries aHalf
// (windowGrid), `name` the meshes' prefix
export class Builder {
  constructor({ atlas = {}, atlasSize = [1024, 1024], walls = 'none', name = 'building' } = {}) {
    this.buckets = new Map();
    Object.assign(this, { atlas, atlasSize, walls, name });
  }
  bucket(name) {
    let b = this.buckets.get(name);
    if (!b) this.buckets.set(name, (b = { pos: [], nrm: [], uv: [], half: [], col: [] }));
    return b;
  }
  /** a, b, c, d: [x, y, z] round the quad; uvs: [[u, v] × 4]; `half` (the walls' aHalf), `colour` ([r, g, b], the trim) */
  quad(name, a, b, c, d, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]], { half = 0, colour = null } = {}) {
    const B = this.bucket(name);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = [a, b, c, d][i];
      B.pos.push(p[0], p[1], p[2]); B.nrm.push(nx, ny, nz); B.uv.push(uvs[i][0], uvs[i][1]); B.half.push(half);
      if (colour) B.col.push(colour[0], colour[1], colour[2]);
    }
  }
  tri(name, a, b, c, uvs = [[0, 0], [1, 0], [0, 1]], { colour = null } = {}) {
    const B = this.bucket(name);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    [a, b, c].forEach((p, i) => {
      B.pos.push(p[0], p[1], p[2]); B.nrm.push(nx / l, ny / l, nz / l); B.uv.push(uvs[i][0], uvs[i][1]); B.half.push(0);
      if (colour) B.col.push(colour[0], colour[1], colour[2]);
    });
  }
  /** A box in a wall's frame: s along it, o out of it, y up; `colour` (the trim) or uv in metres (s or o, y) */
  box(name, F, s0, s1, o0, o1, y0, y1, colour = null, { top = name } = {}) {
    const P = (s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
    const opt = { colour };
    const face = (a, b, c, d, w, h, bucket = name) => this.quad(bucket, a, b, c, d, [[0, 0], [w, 0], [w, h], [0, h]], bucket === name ? opt : {});
    const L = s1 - s0, D = o1 - o0, H = y1 - y0;
    face(P(s0, o1, y0), P(s1, o1, y0), P(s1, o1, y1), P(s0, o1, y1), L, H); // the front (out of the wall)
    face(P(s1, o0, y0), P(s0, o0, y0), P(s0, o0, y1), P(s1, o0, y1), L, H); // the back
    face(P(s0, o0, y0), P(s0, o1, y0), P(s0, o1, y1), P(s0, o0, y1), D, H); // the ends
    face(P(s1, o1, y0), P(s1, o0, y0), P(s1, o0, y1), P(s1, o1, y1), D, H);
    face(P(s0, o1, y1), P(s1, o1, y1), P(s1, o0, y1), P(s0, o0, y1), L, D, top); // the top
    face(P(s0, o0, y0), P(s1, o0, y0), P(s1, o1, y0), P(s0, o1, y0), L, D); // the underside
  }
  /** A decal from the atlas on a wall: s0–s1 along it (left to right seen from outside), `o` m before it */
  decal(F, s0, s1, o, y0, y1, key, { mirror = false } = {}) {
    const [ax, ay, aw, ah] = this.atlas[key], [W, H] = this.atlasSize;
    const P = (s, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
    let u0 = ax / W, u1 = (ax + aw) / W;
    if (mirror) [u0, u1] = [u1, u0];
    const v0 = 1 - (ay + ah) / H, v1 = 1 - ay / H;
    this.quad('decal', P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }
  meshes(M) {
    const out = [];
    for (const [name, b] of this.buckets) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      if ([].concat(this.walls).includes(name)) g.setAttribute('aHalf', new THREE.Float32BufferAttribute(b.half, 1));
      if (b.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      const mesh = new THREE.Mesh(g, M[name]);
      mesh.name = `${this.name} ${name}`;
      mesh.castShadow = name !== 'decal';
      mesh.receiveShadow = true;
      out.push(mesh);
    }
    return out;
  }
}

/**
 * A flat roof over an outline (`ring` of [x, z], or [x, z, h]): its triangles facing up, at `top` (a height, or
 * top(q) of each point q of the ring), into `bucket`; uv uvOf([x, y, z]) (metres over the plan), `colour` (the trim's)
 */
export function flatRoof(B, ring, top, { bucket = 'roof', uvOf = (q) => [q[0], q[2]], colour = null } = {}) {
  const y = typeof top === 'function' ? top : () => top;
  const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const p = [ring[i], ring[j], ring[k]].map((q) => [q[0], y(q), q[1]]);
    // (facing up whichever way the triangulation turned)
    const up = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) > 0;
    const t = up ? p : [p[0], p[2], p[1]];
    B.tri(bucket, t[0], t[1], t[2], t.map(uvOf), { colour });
  }
}
