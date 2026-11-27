// The fountain on the traffic island before St. Theodul in Davos Dorf (js/bubenbrunnen.js): its plan, its heights and
// the faces of its parts. Pure data and frame maths, shared by the browser module and the tests.
//
// What it is, after Mapillary's street views (CC BY-SA, 2013–2019): red sandstone throughout, an octagonal basin on two
// low steps, an open stage of slender posts over its rim round a pillar in the middle, and over that a six-sided block
// carved through on every face with figures of boys in hexagonal frames, under a small pointed cap of grey slate:
// - from the south-west (787334888821781, 777629366492486, 271354204664744, 2013: the street before the Seehof): the
//   whole fountain beside the church's west gable, the crossing to the porch running past its north end;
// - from the north-east (298640088677258 through the church's porch, 468359907721009 and 3022364144716791 along the
//   street between the church and the Seehof, 2013): the block's figures, the cap, the island's tip with its signs;
// - from the south-east (481590686414450, 458475345237496, 362965035134364) only far off, the Seehof behind.
// Where it stands: the bearings of 787334888821781 (62° from 705, −1492, the fountain ~16° right of the middle) and of
// 298640088677258 (~210° from the porch's north arch) cross at about 723.5, −1496; the island between the Dorfstrasse's
// two one-way arms (OSM w207777671, w207777673, drawn 6 m wide each) leaves ~4 m between their carriageways there,
// and the crossings to the church (OSM 2180300456, 2180300463) run over its tip at z −1499.6: the fountain is set in
// the island's middle, just south of them, its lower step 0.4 m clear of either carriageway. (OSM names a "Bubenbrunnen" in Davos Platz, by the Bubenbrunnenpark; this one carries no name in OSM.)
// Heights from 787334888821781 against the man in it (~1.8 m): the rim ~1 m over the ground, the cap's tip ~3.1 m.
// World frame (js/davos-frame.js): x east, z south, y = m a.s.l. − 1558.

export const BUBENBRUNNEN = {
  centre: [722.8, -1495.8],
  turn: 0, // the plan's turn about y (radians): the basin's faces square to the frame's axes
  steps: [ // two low steps (octagons: the apothem, its top over the ground's highest point under them)
    { apothem: 1.45, top: 0.12 },
    { apothem: 1.2, top: 0.24 }
  ],
  basin: { apothem: 0.95, wall: 0.17, rim: 0.08, top: 1.0, water: 0.88 }, // the rim's overhang; the water's surface
  posts: { radius: 0.82, half: 0.065, top: 1.45 }, // six posts on the rim, under the block's corners
  pillar: { r: 0.17, top: 1.45 },
  block: { radius: 1.02, bottom: 1.45, top: 2.45, band: 0.08 }, // six-sided, circumradius; a band under and over it
  cap: { eaves: 1.18, y0: 2.53, apex: 3.05, knob: 3.17 },
  sandstone: [0.32, 0.12, 0.09], // (linear)
  slate: [0.085, 0.09, 0.1],
  water: [0.025, 0.045, 0.05]
};

/** The corners of a regular polygon of `n` sides round the centre: `r` its circumradius, `off` the first corner's angle */
export function polygon(n, r, off = 0, [cx, cz] = BUBENBRUNNEN.centre) {
  const out = [];
  // (clockwise as seen from above in a frame whose z runs south: decreasing angles, so that wallFrame's outside is out)
  for (let i = 0; i < n; i++) { const a = off - (i / n) * Math.PI * 2; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return out;
}

/** An octagon of apothem `a` whose faces square to the axes (turned by BUBENBRUNNEN.turn) */
export const octagon = (a) => polygon(8, a / Math.cos(Math.PI / 8), Math.PI / 8 + BUBENBRUNNEN.turn);
/** The block's hexagon (circumradius `r`): a corner to the south-west, two faces towards the street before the Seehof */
export const hexagon = (r) => polygon(6, r, Math.PI / 6 + BUBENBRUNNEN.turn);

/** The single collider's box (the basin, a little inside its faces): [minX, minZ, maxX, maxZ] */
export function basinBox() {
  const [cx, cz] = BUBENBRUNNEN.centre, h = BUBENBRUNNEN.basin.apothem * 0.92;
  return [cx - h, cz - h, cx + h, cz + h];
}

// The block's carved faces: which figure each shows (three drawn: one standing, one climbing, one on his hands)
export const FACE_FIGURES = [0, 1, 2, 1, 0, 2];
