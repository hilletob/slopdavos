# Memory on a phone: what the levers in `js/gpu-memory.js` assume of the scene

iOS kills Safari's processes at fixed limits (the web process at ~1.5 GB, the GPU process at ~300 MB on an iPhone 13),
and the town with its relief fills both. `js/gpu-memory.js` buys room by releasing, flattening and quantizing what the
renderer no longer needs in JavaScript. Each lever writes an assumption into the scene; this is what to keep in mind
when adding to the game. `releaseCpu` runs on both profiles, `flatDraws` and `dropShaderModules` only on the mobile one
(`js/quality.js`).

## Static roots are empty in JavaScript once uploaded

Every 5 s (`releaseStatic` in `js/main.js`) the CPU arrays of every geometry already drawn under the roots named in
`STATIC_ROOTS` (`BerlinMitteCityGrid`, `BerlinStreetDetails`, `surroundings`, `Ski pistes`, `Loipen`, `WinterHikes`,
`Golf Club Davos`, `Streams`, `Parking`, `DavosTrains`, `Bergbahnen`, `ShadowProxy`, `RoadMarkings`, `WorldCells`,
`VectorGround`, `VectorGroundMarkings`, and the
swissBUILDINGS3D group once the shop signs have settled) are swapped for empty arrays. The GPU buffer, the attribute's
count, item size and type stay.

- **Nothing may read these on the CPU after the start**: no raycast, `computeBoundingBox`, `toNonIndexed`, merging or
  `position.array` on anything under those roots. Collisions and height queries use their own data (the colliders,
  the terrain grid); that has to stay so.
- **Changing a released attribute does nothing**: `needsUpdate` only logs `[gpu-memory] update of a released attribute
  ignored`. Anything that moves needs `DynamicDrawUsage`, which the release leaves alone. A whole object opts out with
  `userData.keepCpu = true`, a subtree with the `skip` callback (the trees' instance buffers are repacked, so they are
  skipped).
- **New scene roots are not touched by default.** New static scenery that should save memory is added to `STATIC_ROOTS`
  after checking that nothing reads it on the CPU.

## On a phone nothing is drawn indexed, but only from the first draw on

`flattenDraws` wraps `renderer.renderObject`: the first time a geometry with an index buffer is drawn, `object.geometry`
is replaced by a flat copy (`flatGeometry`) and the old one disposed. What the camera never reaches stays indexed, a
third of the corners in JavaScript.

- **Never hold on to a geometry object** you touch again later; read `mesh.geometry` fresh. `geometry.index` is there
  before the first draw and `null` after, and `position.count` grows to the old `index.count`.
- `setDrawRange`, `addGroup` and `userData` (including the terrain's `lodLevels`) are carried over to the flat copy.
  Fields set directly on the geometry object, outside `userData`, are lost.
- A geometry with a non-static attribute is **not** flattened and stays indexed. That is allowed, but Safari then checks
  every index on the GPU before each draw, which costs the GPU process. Better give moving things no index at all.
- A geometry shared by several meshes is flattened once, for all of them. Do not set `userData.keepFlat` yourself: it is
  the mark `flatGeometry` leaves so that `indexGeometry` does not index the copy again.

## Normals under the static roots are normalized `Int8`

`compactStaticGeometry` quantizes the normals after the build (and on the desktop profile also indexes what is not
shared). Shaders do not notice; code reading `normal.array` as `Float32Array` breaks. Interleaved and shared normals are
handled (a shared one is quantized once for all its users).

## Every shader variant costs the GPU process ~1.7 MB

Each new TSL node graph or set of defines is a pipeline of its own. Different uniform values on the same kind of
material are free, different node graphs are not. On a phone, reuse materials rather than build one per object, and
watch for transparent or double-sided variants that quietly make a second pipeline. `dropShaderModules` frees the
module once its pipeline exists, so this cost is paid once per variant, but it is paid.

A colour written into the node graph as a literal (`m.colorNode = vec3(0.4, 0.1, 0.06)`) is such a variant: twelve
skins of one building were twelve pipelines. Colours, strengths and measures belong in uniforms (`material.color`,
`material.emissive` read through `materialColor` / `materialEmissive`, or `uniform()`), so that skins of one kind
generate the same shader text and share its program: `SIMPLE_SKINS` in `js/landmark-buildings.js` (plain, snowRoof,
glow, windowed) is what the landmarks and the Pfadiheim use on the phone.

## Draws and what a frame holds

What a frame draws is what Safari's GPU process holds while the frame is in flight. Scenery spread over the valley in
one merged mesh is drawn whole whenever any corner of it is in view (the lift terminals are merged by 1.5 km squares
for that reason); many tiny meshes cost a draw each (the roofs of the buildings swisstopo lacks: one tone and 3 km
cells on the phone). The road paint is streamed within 260 m on the phone, three transparent draws a cell.

## Build garbage stays until the heap doubles

JavaScriptCore lets the heap grow to twice its size before a full collection, and sweeps lazily: whatever the build makes
of intermediate object arrays (points as `{x, y, z}`, segments, collider lists) lies around as 300 to 400 MB of garbage
in the web process for minutes. A GC forced from the page frees nothing of it (measured 2026-11-06). New build steps
should use typed arrays and not keep intermediate structures alive in module caches or closures.

## Tests and debug switches

`tests/gpu-memory.test.mjs` checks the source: `js/main.js` has to call
`compactStaticGeometry(roots, { index: !QUALITY.flatDraws })`, and `js/terrain.js` must not import `flatGeometry` (the
chunks are flattened lazily).

```
?qset=flatDraws:false        # draw indexed as on the desktop
?qset=releaseCpu:false       # keep every CPU copy (for raycast debugging)
?qset=skip:all               # no town: the base load
?memhud=1                    # fps, memory and draw counts on a real phone
__slopdavos.flatDraws()      # what has been flattened so far
__slopdavos.releasedGeometry()
__slopdavos.shaderModules()
```

When something is invisible on the phone but right on the desktop, the usual suspects, in this order: an attribute
changed after its release, a stale geometry reference, float normals assumed.
