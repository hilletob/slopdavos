# Slop Davos

A simulation of Davos (Graubünden) built with [three.js](https://threejs.org/), WebGPURenderer and TSL. Explore Davos
Platz and Davos Dorf, the Promenade, the Kongresszentrum and the Eisstadion, the Davosersee, Frauenkirch, Monstein,
Silberberg and Wiesen, and the Dischma valley up to Dürrboden on foot, by car, by bicycle or cargo bike, or by helicopter, at 1:1 and **on the real alpine
relief**.

A port of [Slop Zürich](https://github.com/colorfield/slop-zurich) by colorfield, which is based on
[Slop New York](https://github.com/mrdoob/slop-newyork) by mrdoob (through the irregular-city data path of the Berlin
and Warsaw forks and [Slop Utrecht](https://github.com/bertt/slop-utrecht) by bertt). More cities in
[Slop Cities](https://github.com/zz85/slop-cities).

## The area

The mapped area is LV95 E 2773000–2794000, N 1173600–1189800 (21 × 16.2 km), set in `js/davos-frame.js`: the
Landwassertal from Wiesen through Monstein, the Silberberg and Frauenkirch to Davos Platz, Davos Dorf, the Davosersee and Wolfgang in
the north, and the Dischma from its mouth at Davos Dorf up to Dürrboden in the south-east, and the Flüelapass, the Schwarzhorn and the Jöriseen in the east.

## What makes it Davos

- **swisstopo swissBUILDINGS3D 3.0**: every building with its real roof, from the 3D Tiles (b3dm, Draco) of
  `3d.geo.admin.ch` stored in the repository and streamed into the scene nearest first. Each tile gets an exact local
  affine map from the rigorous ECEF → LV95 transformation, and its heights are calibrated on the surveyed roof tops
  (`DACH_MAX`) rather than on a geoid model. The OSM footprints remain as colliders and as the fallback when the
  tiles can't be loaded.
- **swisstopo swissALTI3D**: the terrain model (2 m, resampled to an 8 m grid over the 340 km²) under everything:
  streets, meadows, the Landwasser, the lake shore and the slopes up to the Schatzalp and the Jakobshorn. Cars pitch
  and roll with the streets, pedestrians' feet find the ground, the helicopter's floor is the relief.
- **Bridges at their real height**: the terrain model is bare earth, so deck heights are sampled from
  **swissSURFACE3D Raster** at every bridge node and interpolated along each bridge chain.
- **swisstopo SWISSIMAGE**: the orthophoto mosaic draped on the terrain (meadows, woods, ski runs, the golf course, the
  sports grounds) and, from above, on the roofs of the swissBUILDINGS3D tiles: one WebP per 512 m terrain chunk, at
  0.5 m on the valley floor, 1 m on the lower slopes and 2 m higher up (`js/swissimage.js`).
- **Time and seasons**: the game has its own clock (`js/game-clock.js`): a day takes 24 real minutes, a year 8 days,
  4 of summer and 4 of winter; the sun follows Davos' real sun times (`js/solar.js`), the time-of-day presets are colour
  anchors on its height (`js/day-cycle.js`), and the top bar's fast-forward jumps ahead. Missions open by time and season (`js/mission-windows.js`). For debugging: `?winter`,
  `?summer`, `?time=midnight` or `?time=14:30` (holds the time).
- **Winter**: the first snowfall night (or `?winter` in the URL) snows the valley in: snow on the
  orthophoto's open ground and gentle slopes, dusted woods, grey slush on the roads, snow on the roofs and the tree
  crowns, the snowline of the surroundings down to the valley floor, frozen mountain lakes (`js/season.js`).
- **Device profiles**: phones, tablets and small-memory devices get a lighter profile (`js/quality.js`): no MSAA,
  screen-space reflections or sun shadow maps, half-size orthophotos and sign atlases over a shorter radius, no
  high-resolution data or sharp roof crops, fewer trees, cars, pedestrians and skiers, and the winter-only runs and
  trails built only once winter is switched on. `?quality=mobile` or `?quality=desktop` in the
  URL overrides the detection. On both, static vertex data and decoded images leave JavaScript once they are on the
  GPU (`js/gpu-memory.js`; what that assumes of new scenery: `docs/gpu-memory.md`). `?memhud=1` shows a small read-out of fps, memory and draw counts for a real phone (`js/mem-hud.js`).
- **The horizon**: the relief around the valley from **swissALTIRegio**, stitched to the local terrain and lowered by
  the Earth's curvature: the Parsenn, the Weissfluh, the Rinerhorn, the Flüela and Albula Alps.
- **LV95 world frame**: 1 unit = 1 m, `x = E − 2782500`, `z = 1185500 − N`, `y = height − 1558 m` (Davosersee level).
  The WGS84 ↔ LV95 transformation (`js/swiss-projection.js`) matches swisstopo REFRAME to the millimetre.
- **Trees from OpenStreetMap**, place names from the mapped boundaries, and teleports for the stations of Davos Platz
  and Davos Dorf, the Promenade, the Schatzalpbahn, the Eisstadion, the Kirchner Museum, the Kongresszentrum, the
  Jakobshorn and Parsenn valley stations, the Davosersee, Frauenkirch, Glaris, Monstein, Wiesen, Teufi and Dürrboden,
  plus seven viewpoints.

- **Tunnels you can drive**: the Landwassertunnel and the shorter tunnels on the road to Monstein and Wiesen are part of
  the road network, and the RhB runs through its tunnels on the line (`js/tunnels.js`, `js/tunnel-profile.js`). The
  bare-earth relief has no holes, so the terrain chunks are cut open along the mouths (`cutTriangles` in
  `js/terrain-grid.js`); where the mountain does not cover the roof, the tunnel is an open cut between retaining walls.

- **The Rhaetian Railway**: two red four-car units, modelled after the ABe 4/16 "Capricorn" (no freely licensed model
  of it exists, so they are built in code), run the single-track line Wolfgang – Dorf – Kongress/Eisstadion – Platz –
  Frauenkirch – Glaris – Monstein – Wiesen, stop at every station and cross on the passing loops under block
  signalling (`js/rhb.js`, `js/rhb-route.js`), under the overhead line (masts, cantilevers, staggered contact wire). The
  track has ballast, concrete sleepers and rails (`js/trams.js`).

Dropped from Slop Zürich: the trams (Davos has none) and the City of Zurich tree cadastre (trees now come from OSM).

## Run it

Any static server will do, for example:

```sh
npm run serve          # tools/serve.py → http://127.0.0.1:8765/
npm install && npm test
```

A WebGPU-capable browser is needed (recent Chrome, Edge or Safari).

## Data

The generated data is committed (`js/davos-geodata.js`, `data/davos-terrain.bin`, `data/davos-surroundings.bin`,
`data/swissbuildings3d/`, `data/swissimage/`); the raw downloads go to `tools/data/cache/` (not committed). To rebuild everything:

```sh
npm install
npm run data
```

| Step | Script | Source |
| --- | --- | --- |
| `data:osm`, `data:areas` | `tools/overpass.sh` + `tools/data/q_davos*.overpassql` | OpenStreetMap (Overpass API) |
| `data:terrain` | `tools/build-davos-terrain.mjs` | swisstopo swissALTI3D (STAC, cloud-optimised GeoTIFF) |
| `data:decks` | `tools/fetch-bridge-decks.mjs` | swisstopo swissSURFACE3D Raster (HTTP range reads around the bridges) |
| `data:geo` | `tools/build-davos-geodata.mjs` | all of the above → `js/davos-geodata.js` |
| `data:surroundings` | `tools/build-davos-surroundings.mjs` | swisstopo swissALTIRegio (cloud-optimised GeoTIFF overviews) |
| `data:swissimage` | `tools/fetch-swissimage.mjs` | swisstopo SWISSIMAGE (WMS `wms.geo.admin.ch`), re-encoded with `cwebp` (`brew install webp`) |
| `data:roofs` | `tools/build-roof-atlases.mjs` + `tools/roof-atlas.py` (PIL) | swisstopo SWISSIMAGE (WMS): roof crops at 0.125 m, one atlas per swissBUILDINGS3D tile (`data/roofs/`) |
| `data:gwr` | `tools/build-gwr.mjs` | BFS building register GWR (`public.madd.bfs.admin.ch/gr.zip`, cached in `data/hires/gwr/`): class, storeys and year of every existing building → `js/gwr-data.js`, which picks each swissBUILDINGS3D building's facade (`js/gwr.js`) |

The buildings are a copy of one swissBUILDINGS3D release (`data/swissbuildings3d/index.json` names it), so the game
never depends on swisstopo's servers. Moving to a newer release is deliberate:

```sh
npm run update:buildings   # tools/update-swissbuildings3d.mjs: the newest release's tiles over the area
```

It downloads and checks every tile before replacing the stored copy; look at the town, then commit.

**High-resolution profile (optional, not committed).** `npm run data:hires` writes sharper imagery to `data/hires/`
(ignored by git): the terrain orthophotos at 0.25 m on the valley floor, 0.5 m on the lower slopes and 1 m higher up,
and the roof crops at 0.1 m. The browser uses them when they are there and falls back to the committed data otherwise:
the roof atlases of the tiles near the camera, and the high-resolution terrain images of the chunks within 700 m (an
image is ~28 MB on the GPU, so only those near the camera are held). To publish them, uncomment the step in
`.github/workflows/pages.yml` or host `data/hires/` next to the site.

## How the relief fits a flat-world engine

The engine was written for Manhattan at `y = 0`. `js/terrain.js` provides `groundHeight`, `deckHeight` and
`surfaceHeight(x, z, nearY)` (the deck or the ground, whichever is nearest the current height), and lays the static
scenery onto the terrain once it is built: ground layers (roads, paths, lawns, rivers) are subdivided and lifted
vertex by vertex, while the terrain mesh sinks a little under them; solids (curbs, quay walls) are displaced;
street furniture, trees and other small objects are lifted rigidly, upright. Vehicles, pedestrians, the player, the
cameras, the shadows and the colliders query the same surface.

## Ideas

- The Davos buses and the funiculars (Parsennbahn, Schatzalpbahn); the Glacier Express and other RhB rolling stock.
- Winter: snow cover, the ski slopes and the cable cars.

## License and data

The VBD bus model `assets/models/citaro-530.glb` is “Low Poly Mercedes-Benz Citaro 530” by giosassets
(https://sketchfab.com/giosassets), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); it is
recoloured in the VBD livery at runtime. The app loads `assets/models/citaro-530-lite.glb`, the same model with its
tyres replaced by plain cylinders (`node tools/build-citaro-lite.mjs`).

The code is available under the [MIT License](LICENSE), like the upstream projects
([colorfield/slop-zurich](https://github.com/colorfield/slop-zurich), [mrdoob/slop-newyork](https://github.com/mrdoob/slop-newyork)).

Data: © [swisstopo](https://www.swisstopo.admin.ch/) (swissBUILDINGS3D 3.0, swissALTI3D, swissSURFACE3D, swissALTIRegio, SWISSIMAGE,
open government data), © [BFS](https://www.housing-stat.ch/) (Eidg. Gebäude- und Wohnungsregister GWR, open government
data), © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Third-party data
and dependencies retain their respective licenses.
