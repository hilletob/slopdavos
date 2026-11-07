// tools/markings-paved.mjs — the paved ground off the mapped streets and car parks (yards, forecourts, drives) in a
// classified crop (tools/ground-sports.py classify-roads with pavedOff: bit 2 asphalt, bit 4 light slabs and concrete),
// as surfaces of the vector ground: connected areas of 25 m² and more, closed over the paint and the parked cars,
// outlined and simplified to 0.3 m.
import { components, componentPolygon } from './sports-fit.mjs';

const CELL = 0.2;
function grid(img, bit) {
  const k = Math.round(CELL / img.res), w = Math.floor(img.w / k), h = Math.floor(img.h / k), a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) if (img.cls[(y * k + j) * img.w + x * k + i] & bit) n++;
    a[y * w + x] = n * 2 >= k * k ? 1 : 0;
  }
  return { w, h, a, cell: k * img.res, x0: img.x0, z0: img.z0 };
}
function morph(g, r, grow) {
  const { w, h, a } = g, out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let any = 0, all = 1;
    for (let j = -r; j <= r && (grow ? !any : all); j++) for (let i = -r; i <= r; i++) {
      const X = x + i, Y = y + j, v = X >= 0 && Y >= 0 && X < w && Y < h ? a[Y * w + X] : 0;
      any |= v; all &= v;
    }
    out[y * w + x] = grow ? any : all;
  }
  return { ...g, a: out };
}

export function pavedSurfaces(img) {
  const out = [];
  {
    // (one mask: shade splits a yard into dark and light; its kind by the share of dark asphalt in it)
    let g = grid(img, 2 | 4);
    g = morph(morph(g, 3, true), 3, false); // (closed over paint, cars, kerb stones: 0.6 m)
    g = morph(morph(g, 2, false), 2, true); // (opened: no thin slivers along the streets' edges)
    const cc = components(g);
    for (const comp of cc.comps) {
      const area = comp.n * g.cell * g.cell;
      if (area < 25) continue;
      const kind = 'yard'; // (asphalt or slabs: the photo can't tell them apart in the sun; d / n is the share in shade)
      const poly = componentPolygon(cc, g, comp, 0.3, 4);
      if (poly.ring && poly.ring.length >= 6) out.push({ kind, area, ring: poly.ring, holes: poly.holes.map((x) => x.ring) });
    }
  }
  return out;
}
