// The Schulhaus Bünda in Davos Dorf (js/schule-buenda.js): the new school building of 2019–2021 (rba architekten,
// competition 2018) with its two-storey wing on the courtyard, the glazed link and entrance hall in the middle, the
// school of 1971 north of it, the sports hall east of the link, and the kindergarten west of the old school. Their
// volumes, the floors' grids, the new building's openings, the two timber canopies. Pure data and frame maths, shared by
// the browser module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1754/1020, 11/1754/1021, 11/1753/1021) and OpenStreetMap. Which volume is which:
// - The new building is batch 14 of 11/1754/1020 (a block of 17 × 28.5 m to its roof at 11.44, the lift's head on it to
//   13.22), with batch 10 of the same tile (a wing 3 m deep along its east front and round its north-east corner, to
//   3.44). The Federal Register of Buildings (js/gwr-data.js) has a school built in 2019 at its middle (891/−1256) and
//   the lift's head is a new building's. It stands 17 m over the ground (−5.4 to −5.75), not the 12 m of the three
//   storeys the architects' page suggests: a tall ground floor and three upper floors fit it (4.6 + 3 × 3.85 m and the
//   parapet), the window groups two floors high on the top two, the east wing a tall ground floor and one more.
// - Batch 8 of 11/1754/1021 holds the rest: the old school (the block of 16 × 27 m to 6.41 in the north, the wing on its
//   south-east to 5.68, the low part east of it to 2.4–3.1), the entrance hall between them all (to 2.41; the register
//   has the school of 1971, three storeys, there), the link between it and the new building (to 3.78) and the sports
//   hall (19 × 29 m to 8.85, the tallest of the old volumes, OSM w1527437007). Batches 0 and 7 of that tile are a slab
//   at the ground (−4.9) of 19 × 10 m before the entrance hall's west front, inside OSM's outline of the old school:
//   the wide flat canopy over the forecourt from the link to the old school, which the survey has only as its floor.
//   Left out, the canopy built here on its outline.
// - The kindergarten is batch 0 of 11/1753/1021 (to 1.11, two floors; its OSM outline matches the survey).
// OSM w110590706 "Schulhaus Bünda" is the new building with its wing and the link; w1527437006 the old school and the
// entrance hall; w1430509114 (built 2025, not surveyed) is left as the streamed tiles draw it. Heights in the world frame
// (y = m a.s.l. − 1558). The ground is nearly flat: −4.2 to −6.3.
//
// The look after the architects' description of their images (no street views exist of this site): the new building
// clad in smooth off-white panels with fine joints, its window groups three panes wide in deep reveals with dark frames,
// a vertical strip of windows on its ends, the ground floor glazed in light timber frames in places; the link and the
// entrance hall glazed on both sides in light timber frames; the old school white with window ribbons and solar panels
// on its roof; the sports hall in grey ribbed metal with dark glazing bands over a concrete base and a light timber
// canopy on slender posts before it. Guessed: every placement of a window group, door and glazing, the number of the
// new building's floors (from its height), the hall's bands, the kindergarten's look (the old school's skin).
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

export const SCHULE_BUENDA = {
  // swissBUILDINGS3D's batches (their centres): left out of the streamed tiles
  excludes: [
    { x: 889.0, z: -1255.6, r: 3 }, // 11/1754/1020 batch 14: the new building
    { x: 897.3, z: -1253.8, r: 3 }, // 11/1754/1020 batch 10: its wing on the courtyard
    { x: 919.5, z: -1290.5, r: 3 }, // 11/1754/1021 batch 8: the old school, the entrance hall, the link, the sports hall
    { x: 907.2, z: -1294.5, r: 3 }, // 11/1754/1021 batch 0: the forecourt's slab (at the ground)
    { x: 902.9, z: -1294.4, r: 3 }, // 11/1754/1021 batch 7: the forecourt's slab (at the ground)
    { x: 870.3, z: -1324.6, r: 3 } // 11/1753/1021 batch 0: the kindergarten
  ],
  base: -9.0, // how far down the walls reach (under the lowest ground, −6.3)
  // The new building's grid: the ground floor's foot, its height, the upper floors' (floor tops at −0.7, 3.15, 7.0,
  // 10.85; the roof at 11.44)
  neu: { foot: -5.3, ground: 4.6, storey: 3.85 },
  // The sports hall's foot (its skin's v counts from it)
  hallFoot: -6.2,
  // The parts: `kind` the skin ('neu' panels, 'aula' the new building's wing, 'head' its lift's head, 'glas' glazed in
  // timber frames, 'alt' the old school's white with ribbons, 'halle' ribbed metal), a flat roof at `top` over the
  // outline (world x, z); 'alt': `line` its top floor's top, `storey` its floors' height; `foot` walls from there (on a
  // roof)
  parts: [
    // the new building (2019–2021) and its wing
    { id: 'neu', osm: 'w110590706', kind: 'neu', top: 11.44, ring: [[889.6, -1238.5], [904.3, -1263.0], [888.2, -1272.6], [873.6, -1248.1]] },
    { id: 'neu-head', osm: 'w110590706', kind: 'head', top: 13.22, foot: 11.2, ring: [[894.8, -1261.8], [897.6, -1260.2], [896.4, -1258.2], [893.6, -1259.9]] },
    { id: 'aula', osm: 'w110590706', kind: 'aula', top: 3.44,
      ring: [[889.6, -1238.5], [892.2, -1236.9], [909.7, -1266.2], [909.0, -1266.6], [902.3, -1270.6], [899.4, -1265.9], [904.3, -1263.0]] },
    // the link between the new building and the entrance hall
    { id: 'link', osm: 'w110590706', kind: 'glas', top: 3.78, ring: [[909.0, -1266.6], [914.9, -1276.4], [901.8, -1284.2], [896.0, -1274.4]] },
    // the entrance hall in the middle, glazed to the forecourt (west) and to the yard (east)
    { id: 'halle-eingang', osm: 'w1527437006', kind: 'glas', top: 2.41,
      ring: [[905.7, -1281.8], [914.9, -1276.4], [918.9, -1283.0], [926.4, -1278.6], [932.9, -1289.5], [916.4, -1299.3], [916.6, -1300.1]] },
    // the old school (1971): three floors in the block and its wing, two in the low part
    { id: 'alt', osm: 'w1527437006', kind: 'alt', top: 6.41, line: 5.81, storey: 3.6, ring: [[905.1, -1307.0], [918.8, -1329.9], [932.1, -1322.0], [918.4, -1299.0]] },
    { id: 'alt-wing', osm: 'w1527437006', kind: 'alt', top: 5.68, line: 5.08, storey: 3.6,
      ring: [[916.8, -1300.0], [918.4, -1299.0], [920.1, -1302.0], [927.2, -1297.8], [934.0, -1309.2], [942.4, -1304.1], [933.4, -1289.1], [916.4, -1299.3]] },
    // (its roof falls from 3.1 to 2.4: flat here at 2.9)
    { id: 'alt-low', osm: 'w1527437006', kind: 'alt', top: 2.9, line: 2.4, storey: 3.6,
      ring: [[920.1, -1302.0], [927.2, -1297.8], [934.0, -1309.2], [935.5, -1308.3], [940.7, -1317.0], [932.1, -1322.0]] },
    // the sports hall
    { id: 'turnhalle', osm: 'w1527437007', kind: 'halle', top: 8.85, ring: [[934.2, -1251.5], [944.1, -1268.0], [918.9, -1283.0], [909.0, -1266.6]] },
    // the kindergarten: two floors of 3 m (the old school's skin, its grid stretched to them)
    { id: 'kindergarten', osm: 'w110590677', kind: 'alt', top: 1.11, line: 0.6, storey: 3.0,
      ring: [[875.8, -1312.7], [885.7, -1329.0], [876.5, -1334.5], [881.3, -1342.5], [873.5, -1347.2], [868.8, -1339.5], [871.0, -1338.2],
        [866.6, -1330.9], [864.7, -1332.1], [854.9, -1316.0], [859.9, -1313.0], [855.8, -1306.3], [863.3, -1301.8], [871.5, -1315.3]] }
  ],
  // The new building's openings (m): the window groups (three panes of `pane`, nearly square over the top two floors,
  // `pitch` apart from the wall's middle, in reveals `depth` deep), the strip on its ends (one pane of `strip`), the first floor's sills and heads, the top two floors' (one opening
  // over both, a dark spandrel at the floor between), the ground floor's glazing head
  open: { pane: 1.8, strip: 1.4, pitch: 9, depth: 0.35, f1: [0.15, 2.65], f23: [4.0, 10.35], spandrel: [6.7, 7.35], glazeHead: -1.3, door: [2.0, 2.6], margin: 1.2 },
  // The timber canopies: along a wall (a → b, a on the left seen from outside) from s0 to s1, `out` m deep, its roof
  // `height` over the highest ground at its posts (m along the wall, `postOut` m out), a beam across to the wall at each
  canopies: [
    // before the sports hall's south-west front, on the courtyard by the link
    { id: 'turnhalle', wall: { a: [909.0, -1266.6], b: [934.2, -1251.5] }, s0: 1.6, s1: 13.6, out: 3.6, height: 3.4, posts: [2.0, 6.0, 10.0, 13.2], postOut: 3.3 },
    // the wide flat one over the forecourt before the entrance hall's west front, from the old school's south wall to
    // the link (the survey's slab, batches 0 and 7)
    { id: 'vorplatz', wall: { a: [916.6, -1300.1], b: [905.7, -1281.8] }, s0: 0.2, s1: 19.3, out: 10.2, height: 3.3, posts: [0.6, 6.7, 12.8, 18.9], postOut: 9.9 }
  ],
  post: 0.16,
  // The solar panels on the old school's roof: rows along its west wall (m along, m in from it)
  solar: { part: 'alt', s0: 2.0, s1: 24.5, rows: [2.0, 4.4, 6.8, 9.2, 11.6], depth: 1.7 }
};

export const partById = (id) => SCHULE_BUENDA.parts.find((p) => p.id === id);
/** The parts standing on the ground (not the lift's head on the roof) */
export const groundParts = () => SCHULE_BUENDA.parts.filter((p) => p.foot === undefined);

/** The outlines registered for the player's walls, per OSM id: the parts standing on the ground */
export const groundOutlines = (osm) => groundParts().filter((p) => p.osm === osm).map((p) => p.ring);
export const OSM_IDS = [...new Set(SCHULE_BUENDA.parts.map((p) => p.osm))];

/**
 * How high the neighbours stand before a point (x, z): the highest roof of the other ground parts whose outline holds
 * it, or −Infinity. Walls are hidden up to it.
 */
export function coverAt(self, x, z) {
  let top = -Infinity;
  for (const p of groundParts()) if (p !== self && p.id !== self.id && pointInRing(p.ring, x, z)) top = Math.max(top, p.top);
  return top;
}

/**
 * A wall's stretches of the same cover ([{ s0, s1, cover }]): sampled every half metre, `out` m before it
 */
export function coverRuns(part, F, out = 0.35) {
  const n = Math.max(1, Math.round(F.len / 0.5)), runs = [];
  for (let i = 0; i < n; i++) {
    const s0 = (F.len * i) / n, s1 = (F.len * (i + 1)) / n, c = coverAt(part, ...onWall(F, (s0 + s1) / 2, out));
    const last = runs[runs.length - 1];
    if (last && last.cover === c) last.s1 = s1;
    else runs.push({ s0, s1, cover: c });
  }
  return runs;
}
/** The highest cover over s0–s1 of a wall's runs */
export const coverOver = (runs, s0, s1) => runs.filter((r) => r.s1 > s0 && r.s0 < s1).reduce((m, r) => Math.max(m, r.cover), -Infinity);

/**
 * Where a wall's windows begin: the foot of the lowest floor whose windows (from `lo` over its foot) clear `hiGround`
 * (the highest ground or neighbour's roof before it); `line` the top floor's top. Returns `line` if none fits.
 */
export function windowsFrom(line, storey, hiGround, lo) {
  const k = Math.floor((line - (hiGround - lo)) / storey + 1e-9);
  return k < 1 ? line : line - k * storey;
}

/**
 * The new building's openings in one of its walls: [{ kind, s0, s1, y0, y1, panes }] ('group' a window group, 'glaze'
 * glazing in timber frames, 'door' a timber door), laid out from the wall's middle; `runs` its cover (an opening only
 * where nothing stands before it up to its sill), `glazeFoot` the ground floor glazing's foot (over the ground)
 */
export function newOpenings(part, F, runs, glazeFoot) {
  const O = SCHULE_BUENDA.open, mid = F.len / 2, out = [];
  const gw = 3 * O.pane, long = F.len > 24;
  const add = (kind, s0, s1, y0, y1, panes) => {
    if (s0 < O.margin - 1e-9 || s1 > F.len - O.margin + 1e-9 || y1 - y0 < 1) return;
    if (coverOver(runs, s0, s1) > y0 - 0.1) return;
    out.push({ kind, s0, s1, y0, y1, panes });
  };
  const door = (s) => add('door', s - O.door[0] / 2, s + O.door[0] / 2, glazeFoot, glazeFoot + O.door[1], 1);
  if (part.kind === 'head' || F.len < 4) return out;
  if (part.kind === 'neu') {
    if (long) {
      // the groups: on the first floor, and over the top two
      for (let k = -2; k <= 2; k++) {
        const c = mid + k * O.pitch;
        add('group', c - gw / 2, c + gw / 2, ...O.f1, 3);
        add('group', c - gw / 2, c + gw / 2, ...O.f23, 3);
      }
      // the ground floor on the west (the lane and the lawn): glazed in the middle, a door north of it
      if (F.n[0] < 0) {
        add('glaze', mid - 10.5, mid + 2.5, glazeFoot, O.glazeHead, 9);
        door(mid + 6.5);
      }
    } else {
      // the ends: a strip of windows up the middle; the south end glazed on the ground floor, a door in the north one
      add('group', mid - O.strip / 2, mid + O.strip / 2, ...O.f1, 1);
      add('group', mid - O.strip / 2, mid + O.strip / 2, ...O.f23, 1);
      if (F.n[1] > 0) add('glaze', O.margin + 0.3, F.len - O.margin - 0.3, glazeFoot, O.glazeHead, Math.round((F.len - 2 * O.margin - 0.6) / 1.5));
      else door(mid + 3.5);
    }
  } else if (part.kind === 'aula') {
    if (long) {
      add('glaze', O.margin, F.len - O.margin, glazeFoot, O.glazeHead, Math.round((F.len - 2 * O.margin) / 1.5));
      for (let k = -2; k <= 2; k++) add('group', mid + k * O.pitch - gw / 2, mid + k * O.pitch + gw / 2, ...O.f1, 3);
    } else door(mid);
  }
  return out;
}

/** A canopy's outline (world x, z) */
export function canopyRing(c) {
  const F = wallFrame(c.wall.a, c.wall.b);
  return [onWall(F, c.s0, 0), onWall(F, c.s0, c.out), onWall(F, c.s1, c.out), onWall(F, c.s1, 0)];
}

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
