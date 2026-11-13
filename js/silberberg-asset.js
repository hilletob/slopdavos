// js/silberberg-asset.js
// The Silberberg mine's galleries as tools/build-silberberg-mine.mjs bakes them from the FHNW laser scans
// (assets/silberberg/<adit>.bin), parsed — three.js-free (the tests read the files with it, js/missions-mine.js builds
// the mesh from it):
//   [u32 header length][header JSON][positions u16×3, quantized to the mesh's box][colours u8×4: rgb, daylight]
//   [indices u16|u32][floor cells u32 (index into the nu × nw grid)][floor cells i16×2 (floor, ceiling in cm)]
// Everything in the world frame's axes, relative to the adit's origin (its portal station): x east, y up, z south.
// The floor grid lies in a frame turned along the gallery (u along it, w across, cell × cell metres).

export const ADIT_IDS = ['dalvazzer', 'hilfsstollen'];
export const aditUrl = (id) => `assets/silberberg/${id}.bin`;

/** The parsed file: { header, positions: Float32Array, colours: Uint8Array (rgba), index, floor } */
export function parseAdit(buffer) {
  const dv = new DataView(buffer);
  const hlen = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, hlen)));
  let off = 4 + hlen;
  const m = header.mesh;
  const q = new Uint16Array(buffer.slice(off, off + m.vertices * 6)); off += m.vertices * 6;
  const colours = new Uint8Array(buffer.slice(off, off + m.vertices * 4)); off += m.vertices * 4;
  off += (4 - (off % 4)) % 4;
  const index = m.index32 ? new Uint32Array(buffer.slice(off, off + m.indices * 4)) : new Uint16Array(buffer.slice(off, off + m.indices * 2));
  off += m.indices * (m.index32 ? 4 : 2);
  const n = header.floor.cells;
  const cells = new Uint32Array(buffer.slice(off, off + n * 4)); off += n * 4;
  const ys = new Int16Array(buffer.slice(off, off + n * 4));
  const positions = new Float32Array(m.vertices * 3);
  for (let i = 0; i < m.vertices * 3; i++) {
    const a = i % 3;
    positions[i] = m.min[a] + (q[i] / 65535) * (m.max[a] - m.min[a]);
  }
  return { header, positions, colours, index, floor: makeFloor(header, cells, ys) };
}

/**
 * The walkable floor: at(x, z) → { y, ceil } (metres, relative to the origin) or null where there is rock.
 * (x, z: relative to the origin, world axes.)
 */
export function makeFloor(header, cells, ys) {
  const F = header.floor;
  const map = new Map();
  for (let i = 0; i < cells.length; i++) map.set(cells[i], i);
  const cellOf = (x, z) => {
    const E = x, N = -z; // (east, north)
    const u = E * F.cos + N * F.sin, w = -E * F.sin + N * F.cos;
    return [Math.floor((u - F.u0) / F.cell), Math.floor((w - F.w0) / F.cell)];
  };
  const at = (x, z) => {
    const [iu, iw] = cellOf(x, z);
    if (iu < 0 || iw < 0 || iu >= F.nu || iw >= F.nw) return null;
    const i = map.get(iw * F.nu + iu);
    return i == null ? null : { y: ys[i * 2] / 100, ceil: ys[i * 2 + 1] / 100 };
  };
  /** The cells as world-axis points (their centres): for the bots and the veins' placing */
  const points = () => {
    const out = [];
    for (let i = 0; i < cells.length; i++) {
      const k = cells[i], iu = k % F.nu, iw = (k - iu) / F.nu;
      const u = F.u0 + (iu + 0.5) * F.cell, w = F.w0 + (iw + 0.5) * F.cell;
      out.push({ x: u * F.cos - w * F.sin, z: -(u * F.sin + w * F.cos), y: ys[i * 2] / 100, ceil: ys[i * 2 + 1] / 100, iu, iw });
    }
    return out;
  };
  return { at, cellOf, points, count: cells.length, cell: F.cell };
}
