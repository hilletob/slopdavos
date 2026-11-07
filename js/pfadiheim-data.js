// The Pfadiheim Davos (Eisbahnstrasse 5, 7270 Davos Platz; js/pfadiheim.js): where it stands, its measures, and the
// spot before its entrance. Pure data and frame maths, shared by the browser module, the missions and the tests.
//
// Sources: geo.admin.ch address point (LV95 2782188.15 / 1185797.05, EGID 3173176: "Pfadiheim", 3 storeys, built 1998),
// the OSM footprint w116881199 ("Pfadiheim Davos", 24.6 × 11.3 m), the swissBUILDINGS3D building (tile 11/1746/1012,
// batch 12, Einzelhaus, 13.5 m) and the photographs on pfadiheimdavos.ch (assets/pfadi/photos, SOURCES.md there).
import { frame, toWorld } from './detail-houses-data.js';

export const PFADIHEIM = {
  id: 'pfadiheim-davos',
  address: 'Eisbahnstrasse 5, 7270 Davos Platz',
  lv95: [2782188.15, 1185797.05],
  // The OSM footprint (world x, z): A–B the north-west side, B the north corner, C–D the front facing south-east over
  // the forecourt towards the Eisbahn (the veranda, the entrance, the Fanshop), A–D the south-west end
  footprint: [[-328.6, -292.3], [-313.1, -311.4], [-304.3, -304.3], [-319.8, -285.2]],
  // (detail-houses-data.js frame(): local x along A→B, to the north-east end; local z out of the front; y up from the
  // forecourt's ground in front of the house)
  ridgeFrom: 0, ridgeTo: 1, streetSide: [3, 2],
  // swissBUILDINGS3D (and its centre's distance): left out of the streamed tiles
  exclude: { x: -317.0, z: -297.5, r: 6 },
  // The OSM building's shop sign (js/shops.js, "Pfadiheim Davos", hanging): the house carries its own signs now
  osm: 'w116881199',
  model: {
    // the walls' outer faces (the footprint's 24.6 × 11.3 m)
    walls: { x: [-12.3, 12.3], z: [-5.65, 5.65] },
    // the concrete plinth up to plinthTop; the floors' levels (the ground floor at the veranda's height)
    plinthTop: 1.0, floors: [1.2, 4.3, 7.4], eaves: 11.0,
    // a low hipped roof on wide eaves: overhang, pitch (rise per run)
    roof: { overhang: 1.0, slope: 0.27, thickness: 0.2 },
    // the veranda along the front (a concrete slab on the plinth, a steel railing), the stair down to the north-east,
    // the canopy over it all
    veranda: { x: [-8.6, 11.8], depth: 1.8, y: 1.2 },
    stair: { x: [11.8, 14.2], depth: 1.25 },
    canopy: { x: [-12.3, 12.9], depth: 2.0, y: 4.25 },
    // the shed (Schopf) by the north-east end
    shed: { x: [12.9, 17.6], z: [0.4, 4.4], top: 2.7 },
    // the entrance (the red door) and the Fanshop's door and window on the ground floor (local x)
    door: [3.1, 4.15], fanDoor: [-7.55, -6.5], fanshop: [-3.9, 0.3]
  }
};

const FR = frame(PFADIHEIM);
const world = (lx, lz) => { const [x, z] = toWorld(FR, lx, lz); return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 }; };
// (heading = atan2(dx, dz), js/missions-data-local.js; facing the house: −local z)
const facingHouse = Math.round(Math.atan2(-FR.v[0], -FR.v[1]) * 100) / 100;

// The entrance door on the veranda (world), and which way it faces (heading out of the house)
export const PFADIHEIM_DOOR = { ...world(3.6, 5.8), r: 2.2, facing: Math.round(Math.atan2(FR.v[0], FR.v[1]) * 100) / 100 };
// Where a mission starts: on the forecourt before the entrance, past the veranda's railing, looking at the door
export const PFADIHEIM_START = { ...world(3.6, 10.2), heading: facingHouse };

export const pfadiheimFrame = () => FR;
