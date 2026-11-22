// The Alte Post at the Postplatz (Promenade 43, 7270 Davos Platz; js/alte-post.js): the old post office with the
// sgraffito front, today the Dokumentationsbibliothek and the museums. Its volumes, the floors, the portal and the
// sgraffito's measures. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1744/1007, batches 2 and 8: the front block of 18.4 m on the Promenade, the block
// behind it, the low wings round that one, all with flat roofs), OpenStreetMap's footprint w1529977469 ("Alte Post"),
// heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js), each block's floor on the lowest ground under
// it as the streamed tiles set it. The look after a photograph of the entrance: warm plaster over a banded ground
// floor, the stone portal with POSTPLATZ on its entablature and the timber doors, over it the sgraffito field (the
// post's ways of travelling in two friezes between the windows, ornament panels beside them) and the band of firs
// across the third floor.
import { wallFrame } from './spital-data.js';

export const ALTE_POST = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles
  exclude: [{ x: -673.4, z: 257.3, r: 4 }, { x: -683.4, z: 248.4, r: 4 }],
  osm: 'w1529977469',
  // The front's ground (y) and the floors over it: the ground floor, then `storey` each
  ground: 0.46, groundFloor: 5.2, storey: 3.3,
  base: -2.5, // how far down the walls reach
  // A window in its storey (m up from the floor's foot), its half width, and the bays' width along a wall
  window: { lo: 0.9, hi: 2.5, half: 1.06 }, bay: 3.0,
  parts: [
    { id: 'front', top: 18.9, cornice: true, ring: [[-659.0, 251.3], [-672.1, 246.9], [-678.7, 266.4], [-665.5, 270.9]] },
    { id: 'rear', top: 15.8, cornice: true, ring: [[-672.1, 246.9], [-681.3, 243.8], [-687.8, 263.4], [-678.7, 266.4]] },
    { id: 'wings', top: 9.2,
      ring: [[-670.5, 247.5], [-670.6, 240.1], [-674.7, 236.3], [-690.0, 230.5], [-695.3, 246.1], [-689.7, 248.5], [-695.9, 264.4], [-680.9, 266.6], [-680.6, 265.8], [-687.8, 263.4], [-681.3, 243.8], [-672.1, 246.9]] }
  ],
  // The front on the Promenade: from `a` (its south end, on the left for someone before it) to `b`
  front: { a: [-665.5, 270.9], b: [-659.0, 251.3] },
  // The portal in the front's middle (metres along the front): its width, how far it stands out, the floor behind the
  // steps, the openings' height, the entablature over them; the piers, pilasters and openings from left to right
  portal: {
    from: 5.5, to: 15.1, out: 1.1, floor: 0.3, opening: 3.9, entablature: 1.3,
    piers: [[5.5, 6.6], [14.0, 15.1]],
    pilasters: [[6.6, 7.05], [9.4, 9.85], [10.75, 11.2], [13.55, 14.0]],
    openings: [{ s: [7.05, 9.4], key: 'door' }, { s: [9.85, 10.75], key: 'slit' }, { s: [11.2, 13.55], key: 'door' }],
    steps: { from: 6.6, to: 13.4, tread: 0.32, count: 2 }
  },
  // The sgraffito: the field over the portal (along the front, up from the front's ground), the firs' band across the
  // whole front on the third floor
  field: { from: 5.7, to: 14.9, lo: 5.75, hi: 12.6 },
  firs: { lo: 12.6, hi: 15.1 }
};

const FRONT = wallFrame(ALTE_POST.front.a, ALTE_POST.front.b);
export const frontFrame = () => FRONT;

/** The windows of the front's storey `k` (0: the first over the ground floor): [{ s, lo, hi }], the bay's middle
 *  along the front and the opening's heights over the front's ground. The front is one wall, its bays laid out from
 *  its middle (js/alte-post.js, the walls' material) */
export function frontWindows(k) {
  const { bay, window: w, groundFloor, storey } = ALTE_POST, half = FRONT.len / 2, out = [];
  for (let i = -Math.floor(half / bay); i <= Math.floor(half / bay); i++) {
    if (Math.abs(i * bay) + w.half + 0.4 > half) continue;
    out.push({ s: half + i * bay, lo: groundFloor + k * storey + w.lo, hi: groundFloor + k * storey + w.hi });
  }
  return out;
}

/** The spot before the portal's steps (world) */
export const ALTE_POST_ENTRANCE = (() => {
  const P = ALTE_POST.portal, s = (P.from + P.to) / 2, o = P.out + 0.5 + P.steps.count * P.steps.tread + 1.6;
  return { x: Math.round((FRONT.a[0] + FRONT.u[0] * s + FRONT.n[0] * o) * 10) / 10, z: Math.round((FRONT.a[1] + FRONT.u[1] * s + FRONT.n[1] * o) * 10) / 10 };
})();
