// The terrain height grid (data/davos-terrain.bin, written by tools/build-davos-terrain.mjs) and its exact surface.
// Pure functions shared by the data tools and the browser: no I/O here.
//
// The surface is piecewise planar: every grid cell is split into two triangles along the diagonal from node (i, j) to
// node (i + 1, j + 1). The rendered terrain mesh uses the same triangulation, so groundHeight() is exactly the height
// of the drawn ground.

export function parseTerrain(buffer) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'ZTR1') throw new Error(`not a terrain grid (${magic})`);
  const cols = view.getUint16(4, true), rows = view.getUint16(6, true);
  const cell = view.getFloat32(8, true), minX = view.getFloat32(12, true), minZ = view.getFloat32(16, true);
  const scale = view.getFloat32(20, true);
  const raw = new Int16Array(buffer, 24, cols * rows);
  const heights = new Float32Array(cols * rows);
  for (let i = 0; i < heights.length; i++) heights[i] = raw[i] * scale;
  return { cols, rows, cell, minX, minZ, maxX: minX + (cols - 1) * cell, maxZ: minZ + (rows - 1) * cell, heights };
}

// Height of the triangulated surface of `grid` (a parsed terrain, or any { cols, rows, cell, minX, minZ, heights })
export function gridHeight(grid, x, z) {
  const { cols, rows, cell, minX, minZ, heights } = grid;
  let u = (x - minX) / cell, v = (z - minZ) / cell;
  u = u < 0 ? 0 : u > cols - 1 ? cols - 1 : u;
  v = v < 0 ? 0 : v > rows - 1 ? rows - 1 : v;
  let i = Math.floor(u), j = Math.floor(v);
  if (i >= cols - 1) i = cols - 2;
  if (j >= rows - 1) j = rows - 2;
  const fu = u - i, fv = v - j, k = j * cols + i;
  const h00 = heights[k], h10 = heights[k + 1], h01 = heights[k + cols], h11 = heights[k + cols + 1];
  return fu >= fv ? h00 + fu * (h10 - h00) + fv * (h11 - h10) : h00 + fv * (h01 - h00) + fu * (h11 - h01);
}

// Unit normal of the surface triangle under (x, z), written into `out` ({ x, y, z })
export function gridNormal(grid, x, z, out = { x: 0, y: 1, z: 0 }) {
  const { cols, rows, cell, minX, minZ, heights } = grid;
  let u = (x - minX) / cell, v = (z - minZ) / cell;
  u = u < 0 ? 0 : u > cols - 1 ? cols - 1 : u;
  v = v < 0 ? 0 : v > rows - 1 ? rows - 1 : v;
  let i = Math.floor(u), j = Math.floor(v);
  if (i >= cols - 1) i = cols - 2;
  if (j >= rows - 1) j = rows - 2;
  const k = j * cols + i;
  const h00 = heights[k], h10 = heights[k + 1], h01 = heights[k + cols], h11 = heights[k + cols + 1];
  // Slopes dh/dx, dh/dz of the plane through the three corners of the triangle
  const upper = u - i >= v - j;
  const sx = (upper ? h10 - h00 : h11 - h01) / cell;
  const sz = (upper ? h11 - h10 : h01 - h00) / cell;
  const n = Math.hypot(sx, 1, sz);
  out.x = -sx / n; out.y = 1 / n; out.z = -sz / n;
  return out;
}

// Fills the pits of `grid` along `corridors` ([{ pts: flat [x, z, …], half }]), in place: the trenches that a 4 m grid
// turns into lumpy slopes under the streets drawn along them. A node within `half` of a corridor (unless `skip(x, z)`) is
// a pit when it lies `depth` or more under the median of the ground `ring` metres around it (other corridor nodes left
// out, so that the hills over a tunnel stay); the pits, grown by a node so that their slopes go too, are raised by
// harmonic interpolation from the ground around them. With `seeds` ([{ x, z, r }]), only the pits joined (node to node)
// to one within a seed's radius are filled: the trench leading to a tunnel mouth, not the hollows beyond where it ends.
// Returns the number of nodes filled.
export function fillCuts(grid, corridors, { skip = () => false, depth = 0.8, ring = [12, 24], iterations = 400, seeds = null } = {}) {
  const { cols, rows, cell, minX, minZ, heights } = grid;
  const candidate = new Uint8Array(cols * rows);
  for (const { pts, half } of corridors) {
    for (let k = 2; k < pts.length; k += 2) {
      const ax = pts[k - 2], az = pts[k - 1], dx = pts[k] - ax, dz = pts[k + 1] - az, L2 = dx * dx + dz * dz || 1e-9;
      const i0 = Math.max(0, Math.ceil((Math.min(ax, pts[k]) - half - minX) / cell)), i1 = Math.min(cols - 1, Math.floor((Math.max(ax, pts[k]) + half - minX) / cell));
      const j0 = Math.max(0, Math.ceil((Math.min(az, pts[k + 1]) - half - minZ) / cell)), j1 = Math.min(rows - 1, Math.floor((Math.max(az, pts[k + 1]) + half - minZ) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = minX + i * cell, z = minZ + j * cell, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        if (!candidate[j * cols + i] && Math.hypot(ax + t * dx - x, az + t * dz - z) <= half && !skip(x, z)) candidate[j * cols + i] = 1;
      }
    }
  }
  const [r0, r1] = ring, reach = Math.ceil(r1 / cell);
  const pit = new Uint8Array(cols * rows);
  const around = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i;
    if (!candidate[k]) continue;
    around.length = 0;
    for (let dj = -reach; dj <= reach; dj++) for (let di = -reach; di <= reach; di++) {
      const r = Math.hypot(di, dj) * cell, ii = i + di, jj = j + dj;
      if (r >= r0 && r <= r1 && ii >= 0 && jj >= 0 && ii < cols && jj < rows && !candidate[jj * cols + ii]) around.push(heights[jj * cols + ii]);
    }
    if (around.length < 8) continue;
    around.sort((p, q) => p - q);
    if (heights[k] < around[around.length >> 1] - depth) pit[k] = 1;
  }
  if (seeds) {
    const joined = new Uint8Array(cols * rows), stack = [];
    for (const { x, z, r } of seeds) {
      for (let j = Math.max(0, Math.ceil((z - r - minZ) / cell)); j <= Math.min(rows - 1, Math.floor((z + r - minZ) / cell)); j++) {
        for (let i = Math.max(0, Math.ceil((x - r - minX) / cell)); i <= Math.min(cols - 1, Math.floor((x + r - minX) / cell)); i++) {
          const k = j * cols + i;
          if (pit[k] && !joined[k] && Math.hypot(minX + i * cell - x, minZ + j * cell - z) <= r) { joined[k] = 1; stack.push(k); }
        }
      }
    }
    while (stack.length) {
      const k = stack.pop(), i = k % cols, j = (k - i) / cols;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj, nk = jj * cols + ii;
        if (ii >= 0 && jj >= 0 && ii < cols && jj < rows && pit[nk] && !joined[nk]) { joined[nk] = 1; stack.push(nk); }
      }
    }
    pit.set(joined);
  }
  const filled = [];
  for (let j = 1; j < rows - 1; j++) for (let i = 1; i < cols - 1; i++) {
    const k = j * cols + i;
    if (pit[k] || (candidate[k] && (pit[k - 1] || pit[k + 1] || pit[k - cols] || pit[k + cols]))) filled.push(k);
  }
  for (let iter = 0; iter < iterations; iter++) {
    for (const k of filled) heights[k] = Math.max(heights[k], (heights[k - 1] + heights[k + 1] + heights[k - cols] + heights[k + cols]) / 4);
  }
  return filled.length;
}

// Splits triangles until no edge is longer than `maxEdge` (in x/z), by bisecting the longest edge, so that a flat layer
// can follow the terrain closely once each vertex is lifted onto it. `positions` is a flat [x, y, z, ...] triangle
// list; returns { positions, weights, sources }: the new triangle list (y interpolated), and for every new vertex the
// barycentric weights (3 per vertex) on the vertices of its source triangle (`sources`: source triangle index per new
// vertex), so that any other attribute can be carried over.
export function subdivideTriangles(positions, maxEdge) {
  // (flat typed buffers, no array per vertex: drapeOverlay splits millions of triangles at the start, and the arrays
  // were most of the start's garbage; the same triangles in the same order as bisecting them one by one)
  const max2 = maxEdge * maxEdge;
  let cap = Math.max(64, positions.length * 2), n = 0;
  let outPos = new Float32Array(cap), outW = new Float32Array(cap), outSrc = new Uint32Array(cap / 3);
  const grow = () => {
    cap *= 2;
    const p = new Float32Array(cap), w = new Float32Array(cap), q = new Uint32Array(cap / 3);
    p.set(outPos); w.set(outW); q.set(outSrc);
    outPos = p; outW = w; outSrc = q;
  };
  // the stack: triangles of three vertices of 6 values (x, y, z and the weights on the source's corners)
  let stack = new Float64Array(18 * 64), top = 0;
  const push = (A, B, C) => { // (offsets of three 6-value vertices in `tmp`)
    if (top + 18 > stack.length) { const s = new Float64Array(stack.length * 2); s.set(stack); stack = s; }
    for (let i = 0; i < 6; i++) { stack[top + i] = tmp[A + i]; stack[top + 6 + i] = tmp[B + i]; stack[top + 12 + i] = tmp[C + i]; }
    top += 18;
  };
  const tmp = new Float64Array(24); // a, b, c, m
  for (let t = 0, tri = 0; t < positions.length; t += 9, tri++) {
    for (let k = 0; k < 3; k++) {
      tmp[k * 6] = positions[t + k * 3]; tmp[k * 6 + 1] = positions[t + k * 3 + 1]; tmp[k * 6 + 2] = positions[t + k * 3 + 2];
      tmp[k * 6 + 3] = k === 0 ? 1 : 0; tmp[k * 6 + 4] = k === 1 ? 1 : 0; tmp[k * 6 + 5] = k === 2 ? 1 : 0;
    }
    push(0, 6, 12);
    while (top) {
      top -= 18;
      for (let i = 0; i < 18; i++) tmp[i] = stack[top + i];
      const ab = (tmp[0] - tmp[6]) ** 2 + (tmp[2] - tmp[8]) ** 2, bc = (tmp[6] - tmp[12]) ** 2 + (tmp[8] - tmp[14]) ** 2, ca = (tmp[12] - tmp[0]) ** 2 + (tmp[14] - tmp[2]) ** 2;
      const longest = Math.max(ab, bc, ca);
      if (longest > max2) {
        // Bisect the longest edge, keeping the winding
        const mid = (P, Q) => { for (let i = 0; i < 6; i++) tmp[18 + i] = (tmp[P + i] + tmp[Q + i]) / 2; };
        if (longest === ab) { mid(0, 6); push(0, 18, 12); push(18, 6, 12); }
        else if (longest === bc) { mid(6, 12); push(0, 6, 18); push(0, 18, 12); }
        else { mid(12, 0); push(0, 6, 18); push(18, 6, 12); }
        continue;
      }
      if (n + 9 > cap) grow();
      for (let k = 0; k < 3; k++) {
        outPos[n] = tmp[k * 6]; outPos[n + 1] = tmp[k * 6 + 1]; outPos[n + 2] = tmp[k * 6 + 2];
        outW[n] = tmp[k * 6 + 3]; outW[n + 1] = tmp[k * 6 + 4]; outW[n + 2] = tmp[k * 6 + 5];
        outSrc[n / 3] = tri;
        n += 3;
      }
    }
  }
  return { positions: outPos.slice(0, n), weights: outW.slice(0, n), sources: outSrc.slice(0, n / 3) };
}

// --- Levels of detail for a block of grid nodes --------------------------------------------------------------------------
// The index lists of a block of (nx + 1) x (nz + 1) nodes (row-major, z rows of x) at coarser and coarser `steps`
// (1: every node; 2: every other one, …), one after the other in a single index array. The block's border keeps every
// node at every level: the cells of a coarse level along it are fanned from their inner corner to the border's nodes,
// so that two neighbouring blocks at any levels share exactly the same edge (no cracks, no skirts). Level 1 uses the
// diagonal of the full grid (gridHeight). `ys`: the nodes' heights, for each level's error (the largest height
// difference at a node between the full grid and the level's surface, the fans counted as plain coarse cells).
// `quantile` < 1: the error is the height difference that this share of the nodes stays within instead (a lone spike
// of a rough relief left out). `secondary(a, b, c)`: full-detail triangles to set aside in a list of their own (the
// lakes), only for step 1.
// Returns { index (Uint16Array when the nodes allow it), levels: [{ step, start, count, error }], secondary: [] }.
// (the index list grows in a scratch buffer kept between calls: the terrain's ~570 chunks at the start built theirs in
// plain arrays, ~270 MB of garbage)
let levelScratch = new Uint32Array(1 << 16);
// `view`: the index as a view of that scratch buffer (no copy; valid until the next call: for a caller that only reads it)
export function gridLevels(nx, nz, ys, steps = [1, 2, 4, 8], { secondary = null, quantile = 1, view = false } = {}) {
  const W = nx + 1, at = (i, j) => j * W + i;
  const levels = [], aside = [];
  let out = levelScratch, n = 0;
  const emit = (a, b, c) => {
    if (n + 3 > out.length) { const grown = new Uint32Array(out.length * 2); grown.set(out); out = levelScratch = grown; }
    out[n] = a; out[n + 1] = b; out[n + 2] = c; n += 3;
  };
  const lines = (n, s) => { const l = []; for (let k = 0; k < n; k += s) l.push(k); l.push(n); if (l.length > 2 && n - l[l.length - 2] < s / 2) l.splice(l.length - 2, 1); return l; };
  const push = (a, b, c, step) => { if (step === 1 && secondary && secondary(a, b, c)) aside.push(a, b, c); else emit(a, b, c); };
  const fineCell = (i0, i1, j0, j1, step) => {
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const a = at(i, j);
      push(a, a + W + 1, a + 1, step); push(a, a + W, a + W + 1, step);
    }
  };
  for (const step of steps) {
    const start = n;
    const xs = lines(nx, step), zs = lines(nz, step);
    let error = 0;
    const errors = quantile < 1 && step > 1 && ys ? new Float32Array(W * (nz + 1)) : null;
    for (let cj = 0; cj + 1 < zs.length; cj++) for (let ci = 0; ci + 1 < xs.length; ci++) {
      const x0 = xs[ci], x1 = xs[ci + 1], z0 = zs[cj], z1 = zs[cj + 1];
      if (step > 1 && ys) {
        // The level's error over the cell's nodes (its two triangles split along the diagonal)
        const h00 = ys[at(x0, z0)], h10 = ys[at(x1, z0)], h01 = ys[at(x0, z1)], h11 = ys[at(x1, z1)];
        for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
          const fu = (i - x0) / (x1 - x0), fv = (j - z0) / (z1 - z0);
          const h = fu >= fv ? h00 + fu * (h10 - h00) + fv * (h11 - h10) : h00 + fv * (h01 - h00) + fu * (h11 - h01);
          const e = Math.abs(ys[at(i, j)] - h);
          if (e > error) error = e;
          if (errors) errors[at(i, j)] = e;
        }
      }
      const left = x0 === 0, right = x1 === nx, bottom = z0 === 0, top = z1 === nz;
      if (x1 - x0 === 1 && z1 - z0 === 1 || !(left || right || bottom || top)) {
        const a = at(x0, z0), b = at(x1, z0), c = at(x0, z1), d = at(x1, z1);
        push(a, d, b, step); push(a, c, d, step);
        continue;
      }
      // A border cell: its outline (every node along the block's border, the corners elsewhere), in the triangles' winding
      const ring = [];
      for (let j = z0; j < z1; j++) if (left || j === z0) ring.push(at(x0, j));
      for (let i = x0; i < x1; i++) if (top || i === x0) ring.push(at(i, z1));
      for (let j = z1; j > z0; j--) if (right || j === z1) ring.push(at(x1, j));
      for (let i = x1; i > x0; i--) if (bottom || i === x1) ring.push(at(i, z0));
      // fanned from a corner off the border (none: a cell spanning the block, drawn in full)
      const apex = !left && !bottom ? at(x0, z0) : !left && !top ? at(x0, z1) : !right && !top ? at(x1, z1) : !right && !bottom ? at(x1, z0) : -1;
      if (apex < 0) { fineCell(x0, x1, z0, z1, step); continue; }
      const k0 = ring.indexOf(apex);
      for (let k = 1; k + 1 < ring.length; k++) push(apex, ring[(k0 + k) % ring.length], ring[(k0 + k + 1) % ring.length], step);
    }
    if (errors) { errors.sort(); error = errors[Math.min(errors.length - 1, Math.floor(errors.length * quantile))]; }
    levels.push({ step, start, count: n - start, error });
  }
  const big = W * (nz + 1) > 65535;
  return { index: view ? out.subarray(0, n) : big ? out.slice(0, n) : Uint16Array.from(out.subarray(0, n)), levels, secondary: aside };
}

/**
 * The level of `levels` (gridLevels) to draw for a block in `box` ({ min, max } world box) seen by `camera`: the
 * coarsest whose error stays under `tolerance` pixels on a viewport `height` px tall (the error's projected size at the
 * box's nearest point).
 */
export function pickLevel(levels, box, camera, height, tolerance = 1) {
  const e = camera.matrixWorld.elements, cx = e[12], cy = e[13], cz = e[14];
  const dx = Math.max(box.min.x - cx, 0, cx - box.max.x), dy = Math.max(box.min.y - cy, 0, cy - box.max.y), dz = Math.max(box.min.z - cz, 0, cz - box.max.z);
  const d = Math.hypot(dx, dy, dz);
  const k = camera.projectionMatrix.elements[5] * height / 2; // pixels per metre at 1 m
  let pick = 0;
  for (let l = 1; l < levels.length; l++) if (levels[l].error * k <= tolerance * d) pick = l; else break;
  return pick;
}

/**
 * Cuts rectangles { ax, az, bx, bz, half } (a centre line and half its width) out of the triangles `index[start .. start
 * + count]` of a surface: a heightfield has no holes, so a tunnel's mouth is opened this way. Triangles overlapping a
 * rectangle are split along its edges (the new vertices lie in their plane) and the part inside is dropped; the winding
 * is kept. Returns { positions, normals, index } with the new vertices appended, of the same array types.
 */
export function cutTriangles(positions, normals, index, start, count, rects) {
  const extra = [], tris = [];
  let next = positions.length / 3;
  const vertex = (a) => [positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2], normals[a * 3], normals[a * 3 + 1], normals[a * 3 + 2], a];
  // The part of a polygon where f(x, z) >= 0 (Sutherland–Hodgman)
  const clip = (poly, f) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q);
      if (fp >= 0) out.push(p);
      if ((fp > 0 && fq < 0) || (fp < 0 && fq > 0)) {
        const t = fp / (fp - fq), v = new Array(7);
        for (let k = 0; k < 6; k++) v[k] = p[k] + (q[k] - p[k]) * t;
        v[6] = -1;
        out.push(v);
      }
    }
    return out;
  };
  const planes = rects.map((r) => {
    const dx = r.bx - r.ax, dz = r.bz - r.az, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
    const along = (p) => (p[0] - r.ax) * ux + (p[2] - r.az) * uz, across = (p) => (p[0] - r.ax) * -uz + (p[2] - r.az) * ux;
    const reach = len + r.half + 1;
    return { minX: Math.min(r.ax, r.bx) - reach, maxX: Math.max(r.ax, r.bx) + reach, minZ: Math.min(r.az, r.bz) - reach, maxZ: Math.max(r.az, r.bz) + reach,
      outside: [(p) => -along(p), (p) => along(p) - len, (p) => -across(p) - r.half, (p) => across(p) - r.half] };
  });
  const id = (v) => {
    if (v[6] >= 0) return v[6];
    extra.push(v);
    v[6] = next++;
    return v[6];
  };
  for (let t = start; t < start + count; t += 3) {
    const tri = [vertex(index[t]), vertex(index[t + 1]), vertex(index[t + 2])];
    const minX = Math.min(tri[0][0], tri[1][0], tri[2][0]), maxX = Math.max(tri[0][0], tri[1][0], tri[2][0]);
    const minZ = Math.min(tri[0][2], tri[1][2], tri[2][2]), maxZ = Math.max(tri[0][2], tri[1][2], tri[2][2]);
    let pieces = [tri];
    for (const r of planes) {
      if (maxX < r.minX || minX > r.maxX || maxZ < r.minZ || minZ > r.maxZ) continue;
      const kept = [];
      for (const piece of pieces) {
        let rest = piece; // (peeled plane by plane: what lies outside one is kept, what is left at the end is inside)
        for (const f of r.outside) {
          const out = clip(rest, f);
          if (out.length >= 3) kept.push(out);
          rest = clip(rest, (p) => -f(p));
          if (rest.length < 3) break;
        }
      }
      pieces = kept;
    }
    for (const poly of pieces) for (let k = 1; k + 1 < poly.length; k++) tris.push(id(poly[0]), id(poly[k]), id(poly[k + 1]));
  }
  const total = positions.length + extra.length * 3;
  const outPos = new positions.constructor(total), outNor = new normals.constructor(total);
  outPos.set(positions); outNor.set(normals);
  extra.forEach((v, i) => {
    const a = positions.length + i * 3;
    outPos[a] = v[0]; outPos[a + 1] = v[1]; outPos[a + 2] = v[2];
    outNor[a] = Math.round(v[3]); outNor[a + 1] = Math.round(v[4]); outNor[a + 2] = Math.round(v[5]);
  });
  return { positions: outPos, normals: outNor, index: Uint32Array.from(tris) };
}
