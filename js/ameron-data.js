// The AMERON Mountain Hotel Davos (Scalettastrasse 22, 7270 Davos Platz; js/ameron.js): its three volumes, the floors'
// grid, the shop's glazed ground floor along the Promenade, the hotel's entrance on the Symondsstrasse, the balconies
// towards the valley, the lettering. Pure data and frame maths, shared by the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tile 11/1750/1016, batches 14, 3 and 2): the roofs' outlines and heights below are its
// flat roofs, each a prism down under the ground; heights in the world frame (y = m a.s.l. − 1558, js/davos-frame.js).
// The east wing stands on the Promenade at y 1.5–2.5; the ground climbs north-west up the valley's side: the
// Symondsstrasse along the south faces at 2–4, the south-west wing's foot at 5.5–6, the yard on the north at 5–7, the
// path on the west at 7–10. OpenStreetMap's footprint is w116881206 (its south wall runs some 2.4 m inside the surveyed
// one: the walls that stand out of it are colliders here).
// Mapillary's street views (2013–2015, CC BY-SA) show the site only while it was built: the pit from the west, the
// scaffolded east front on the Promenade with the builders' banners ("Opening December 2015"; the one for the new
// Migros meant the SymondPark across the street, js/symondpark.js). The look is drawn in the language of such hotels:
// warm pale plaster, tall French windows in bronze frames with a larch panel beside each, a glass rail across their
// foot, balconies towards the valley (south); the shop's glazing round the ground floor under a dark fascia; the name
// over the roof of the east wing and on the parapet over the street. The sides and the details are guessed.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';
import { bays } from './seehof-data.js';

export const AMERON = {
  // swissBUILDINGS3D's buildings (their centres): left out of the streamed tiles. (The two thin slabs of a terrace at
  // y 5.2 before the south-west wing, batches 0 and 5 at 284.9 −711.1, lie under the streamed ground and stay.)
  exclude: [{ x: 361.4, z: -738.0, r: 3 }, { x: 311.0, z: -733.6, r: 3 }, { x: 293.1, z: -714.6, r: 3 }],
  osm: 'w116881206',
  // OpenStreetMap's footprint (its walls are js/buildings.js' colliders)
  footprint: [[279.0, -745.1], [326.7, -749.1], [360.3, -752.0], [387.0, -754.2], [389.0, -731.6], [307.5, -724.7], [293.2, -707.7], [279.6, -718.7], [280.9, -722.4]],
  storey: 3.2,
  bay: 3.6,
  base: -0.5, // how far down the walls reach (under the Promenade)
  // The volumes, each a flat roof at `top` over its outline (world x, z). `floor`: the survey's floor; `from`: where
  // the hotel's floors begin (under it the shop's ground floor, or a closed plinth); `line`: the top floor's top (the
  // windows' grid counts down from it), the wall from there to the roof a closed parapet; `shop`: the glazed ground floor
  // with its fascia [y0, y1]; `glazed`: a wall (a → b) glazed from `from` to `y1`, the restaurant's
  parts: [
    // the east wing on the Promenade: the shop's tall ground floor and five hotel floors
    { id: 'east', floor: 2.08, top: 23.07, from: 6.6, line: 22.6, shop: { fascia: [5.6, 6.6] },
      ring: [[340.6, -747.2], [342.5, -725.3], [388.7, -729.3], [386.8, -751.2]] },
    // the middle block: six hotel floors over the shop, its top floor towering over the east wing
    { id: 'middle', floor: 3.42, top: 27.3, from: 6.6, line: 25.8, shop: { fascia: [6.25, 6.6] },
      ring: [[340.6, -747.2], [342.5, -725.3], [281.4, -719.9], [279.5, -741.8]] },
    // the south-west wing on the slope: three floors, its face towards the terrace (south-west) glazed over two of them
    { id: 'south-west', floor: 4.21, top: 15.28, from: 5.4, line: 15.0, glazed: { a: [279.9, -718.9], b: [293.4, -707.4], y1: 11.4 },
      ring: [[279.9, -718.9], [281.3, -720.6], [281.4, -719.9], [305.9, -722.1], [293.4, -707.4]] }
  ],
  // The middle block's east face over the east wing's roof (a → b as wallFrame wants it, south to north): closed, the
  // name on it (its width, heights)
  nameWall: { a: [342.5, -725.3], b: [340.6, -747.2], name: { w: 14.0, y0: 23.55, y1: 26.95 } },
  // The middle block's face on the Symondsstrasse (a → b, west to east; its west third behind the south-west wing): the
  // name on its parapet, the hotel's entrance under a canopy on the street's level (the doors s m along, their width;
  // the canopy's width, depth and height)
  street: {
    a: [281.4, -719.9], b: [342.5, -725.3],
    parapet: { s: 43.0, w: 5.4, y0: 25.95, y1: 27.15 },
    entrance: { s: 43.0, w: 4.4, y0: 3.9, y1: 6.25, canopy: { w: 8.0, out: 3.0, y: 6.3, thick: 0.3 } }
  },
  // The east front on the Promenade (a → b, south to north): the shop's doors under a canopy (whose shop: unknown, no name);
  // the garage's gate where the service lane enters (js/davos-geodata.js: 389 −737)
  promenade: {
    a: [388.7, -729.3], b: [386.8, -751.2],
    doors: { s: 16.0, w: 6.0, y1: 4.9, canopy: { w: 9.0, out: 2.0, y: 4.95, thick: 0.25 } },
    gate: { s: 8.3, w: 4.6, y0: 2.1, y1: 4.7 }
  },
  // The balconies towards the valley: a slab, a glass rail, one before every window of the south faces at these floors'
  // feet; where the south-west wing stands before the middle block (x within `low`) only from `lowFrom` up
  balconies: {
    walls: [{ part: 'middle', a: [281.4, -719.9], b: [342.5, -725.3] }, { part: 'east', a: [342.5, -725.3], b: [388.7, -729.3] }],
    floors: [9.8, 13.0, 16.2, 19.4, 22.6], low: [279.0, 306.5], lowFrom: 16.2,
    w: 3.0, out: 1.5, rail: 1.05
  },
  // The machine room on the middle block's roof (in the street face's frame: s along it, o out of it, its height)
  plant: { s: [28.0, 40.0], o: [-14.5, -8.5], h: 2.6 },
  // A window: m up from its floor's foot, its half width; the larch panel beside it (its middle m off the window's)
  win: { lo: 0.3, hi: 2.65, half: 0.78, rail: 1.05 },
  panel: { at: 1.22, half: 0.3 },
  // a bay holds a window where the window and its panel fit (as windowGrid's `open` and bays() count it)
  open: 1.2
};

/** A part by its id */
export const part = (id) => AMERON.parts.find((p) => p.id === id);

/** The part of the hotel a point lies in (the highest roof over it), or null */
export function partAt(x, z) {
  let best = null;
  for (const p of AMERON.parts) if (pointInRing(p.ring, x, z) && (!best || p.top > best.top)) best = p;
  return best;
}

const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
/** Is a → b (either way round) one of the walls named closed (the name's wall)? */
export const isClosed = (a, b) => { const W = AMERON.nameWall; return (near(a, W.a) && near(b, W.b)) || (near(a, W.b) && near(b, W.a)); };
/** Is a → b (either way round) the part's glazed wall? */
export const isGlazed = (p, a, b) => !!p.glazed && ((near(a, p.glazed.a) && near(b, p.glazed.b)) || (near(a, p.glazed.b) && near(b, p.glazed.a)));

/**
 * The walls that stand outside OpenStreetMap's footprint (more than `tol` m at some point along them) and face open
 * ground (not another part of the hotel): [{ a, b, y0, y1 }], the player's colliders
 */
export function colliderWalls(tol = 0.5) {
  const out = [];
  const fp = AMERON.footprint;
  // (how far a point lies outside the footprint: 0 inside, else the distance to its nearest wall)
  const outside = (x, z) => {
    if (pointInRing(fp, x, z)) return 0;
    let d = Infinity;
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i], b = fp[(i + 1) % fp.length], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
    }
    return d;
  };
  for (const p of AMERON.parts) {
    const R = outwardRing(p.ring);
    for (let i = 0; i < R.length; i++) {
      const a = R[i], b = R[(i + 1) % R.length], F = wallFrame(a, b);
      if (F.len < 0.3) continue;
      let worst = 0, open = false;
      for (let k = 0; k <= 10; k++) {
        const [x, z] = onWall(F, (F.len * k) / 10, 0);
        worst = Math.max(worst, outside(x, z));
        if (k === 0 || k === 10) continue;
        const [ox, oz] = onWall(F, (F.len * k) / 10, 0.4);
        if (!AMERON.parts.some((q) => q !== p && pointInRing(q.ring, ox, oz))) open = true;
      }
      if (worst > tol && open) out.push({ a, b, y0: AMERON.base, y1: p.top });
    }
  }
  return out;
}

export { bays, outwardRing, ringArea2, wallFrame, onWall, pointInRing };
