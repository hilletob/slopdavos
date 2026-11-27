---
name: gebaeude-nach-foto
description: Ein Gebäude in Slop Davos / GTA Davos anhand eines Fotos neu bauen oder verschönern (rebuild or beautify a building of the game from a photograph). Verwenden, wenn der Nutzer ein Foto oder eine Bild-URL eines Davoser Gebäudes schickt und sagt "schön machen", "verbessere das Aussehen", "optimieren", "wie auf dem Foto", oder ein Gebäude im Spiel als falsch/hässlich meldet. Deckt ab - Gebäude finden, vermessene Form aus swissBUILDINGS3D lesen, Modul nach dem Muster von js/spital.js / js/alte-post.js / js/st-johann.js schreiben, einbinden, testen, im Browser prüfen.
---

# Gebäude nach Foto

Replace one building's generic swissBUILDINGS3D volume (a white box with the town houses' windows) by a hand-built
model: the surveyed shape, the look from the user's photograph. Three were built this way and are the templates:

| Module | What it shows |
| --- | --- |
| `js/spital.js` + `js/spital-data.js` | flat-roofed volumes as prisms, a window per bay drawn by the wall material, murals as decals on window-free stretches, a glazed hall, signs, colliders |
| `js/alte-post.js` + `js/alte-post-data.js` | one ornate front: portal geometry, a canvas atlas whose windows are holes at the places the wall material puts them (`frontWindows`) |
| `js/st-johann.js` + `js/st-johann-data.js` | a tower: gables, cross roof, twisted spire, a shingle material, clock hands driven by the game clock through two uniforms |

Ten more followed (SAMD, Seehof, Kirchner Museum, Central Sporthotel, AMERON, Hilton Garden Inn, Schweizerhof):
`js/samd.js` is the cleanest template for a flat-roofed block; `js/seehof.js` for a hotel with mansards and a tower;
`js/hilton-garden-inn.js` for a timber skin with loggias.

Read the one closest to the job before writing. `Builder`, `decalMaterial` (js/spital.js) and `wallFrame`, `onWall`,
`outwardRing`, `pointInRing`, `ringArea2` (js/spital-data.js) are shared: import them, do not copy them.

Answer the user in German (Swiss usage). Code, comments and commit messages are English, in the repo's prose style.

## 1. Find the building

- The photo names it or the user does. Search `js/davos-geodata.js` buildings by name (`DAVOS_DATA.buildings`, ring as
  flat `[x, z, …]`), `js/shops-data.js`, `js/city-config.js` teleports, mission data. Note the OSM id and the centre.
- World frame: x = LV95 east − 2782500, z = 1185500 − north (**bigger z is south**), y = m a.s.l. − 1558.
- Work out which wall the photo shows from the streets around it (`DAVOS_DATA.roads`), the sun, neighbours. Say which
  one you chose; it is the easiest thing to get wrong. Write compass sides out (north = smaller z): a brief that said
  "south" for a smaller z sent a subagent the wrong way.

### No photo from the user: Mapillary

**The short way (a round of three, four steps; all from one scratchpad folder, scripts in this skill's `scripts/`):**

1. `node mapillary-candidates.mjs`, then `node prepare.mjs <slug>:<osm id> …` for five or six of them: photos,
   `buildings/<slug>/sheet.jpg` (labelled with the side each photo was taken from and its year), the files that name
   the building already, and the one line to paste in the game. **Look at every sheet**, keep three.
2. `recv.py` in the background, the game loaded, then that line in `javascript_tool`
   (`k.extract([...])`, scripts/in-game.mjs; `k.ready()`, `k.summer()`, `k.view()`, `k.probe()`, `k.restore()` are
   there too: no pasted scripts).
3. `node finish.mjs <slug>:<osm id> …`: the batches chosen (check the ✔ list: a batch that also holds a neighbour is
   marked), survey, ground, neighbours, OSM gap, and `prompt-<slug>.txt` from `brief-template.md`. Write its
   `{{PHOTO_NOTE}}` (which photo shows which side, from the sheet), `{{NOTE}}`, the address.
4. Three agents on the prompts; when each is done `wire.mjs`, then `mobile-check.mjs` and `npm test`; at the end one
   browser session: `k.summer()`, the agents' camera spots with `save_to_disk`, a night and a winter look, `k.probe()`,
   then `?quality=mobile` from afar, `k.restore()` (section 7).

The details:

- `node scripts/mapillary-candidates.mjs` lists the named buildings by size with the number of cached Mapillary photos
  looking at them and the module that covers them already.
- From a scratchpad folder: `node scripts/mapillary-photos.mjs <slug> <osm id>` → `buildings/<slug>/photos/*.jpg` and
  `photos.txt` (the side it was taken from, where the camera stood, its heading). Expired URLs are renewed through the
  Graph API (MAPILLARY_TOKEN in .env.local, sent to graph.mapillary.com only).
- **Look at the photos yourself before building.** The cache is mostly 2013–2015, some 2019–2026: the AMERON (opened 2015) showed only its
  building pit, the Schweizerhof's main fronts were hidden behind a neighbour. The photo count says nothing about that.
  Tell the user which sides are guessed.
- A building named in a hand-built module by its OSM id is built already (the Kongress Hotel is part of
  js/landmark-buildings.js's complex): the candidates script's last column says which file names it; a mission door is
  only a reference.
- A batch reaching over a whole block (the Hotel Europe's: 110 m, half a block) means rebuilding the block: pass.
- Even a checked photo can show the neighbour: the Meierhof's balcony wing and the Parsenn's painted gable were the
  houses next door (the agents found it from the camera positions against the footprints). Ask the agents to check
  each photo's bearing against the outlines and to say when a photo shows someone else.
- Few photos for a building with many in the candidates' count: they are 360° panoramas, which the photos script skips.
  The cache's thumbnail URLs expire; the script then asks the Graph API for fresh ones (MAPILLARY_TOKEN, .env.local).
- A tall figure on a wall in winter photos may be an event's banner, not a mural (the Schweizerhof's): two photos of
  different years showing it are not proof of permanence.
- Rounds with subagents (the user asked for Opus, at most three at once): I extract the survey and photos for all three
  in one browser session; each agent gets a brief **as a file in the scratchpad**, filled from `brief-template.md` (the
  `{{…}}` fields; the photo note says which photo shows which side, from my own look at a contact sheet) and writes
  `js/<slug>.js`, `js/<slug>-data.js`, `tests/<slug>.test.mjs`; I wire, test, look in the browser.

## 2. Look at it in the game

Playwright's Chrome does not start from Bash here. Use the claude-in-chrome tools on `http://127.0.0.1:8766/play.html`
(dev server `python3 tools/serve.py 8766`, usually running). Load the tools in one ToolSearch call, wait for
`window.__slopdavos.ready` (60–90 s; poll in a 28 s `javascript_tool` call, repeat).

- This is the **user's own Chrome profile and dev save**. Before touching the clock read `g.clock.total` and at the
  end put it back: `g.clock.jumpTo(total); g.clock.freeze(false); g.clock.save()`. Tell the user if the player moved.
- Camera: `g.setCamera(px, py, pz, tx, ty, tz)`; a near-orthographic top view: camera 600 m up, then
  `g.cameraSystem.camera.fov = 11; updateProjectionMatrix()` (reset to 55).
- Summer shows shapes best (snow hides roofs): jump to a summer day (`g.clock.jumpTo((day + ahead) * 1440 + minute)`,
  day-of-year 0–3 is summer), `g.clock.freeze(true)`.
- `javascript_tool` results are cut at ~1 KB. For more, POST to the receiver (below).
- Close the tab when done.

## 3. Read the surveyed shape

```
python3 .claude/skills/gebaeude-nach-foto/scripts/recv.py     # background; writes POSTed bodies next to itself, port 9340
```
Copy `recv.py` to the session scratchpad first and run it there, so the JSON lands in the scratchpad, not in the repo.
In the game: `const k = await import('/.claude/skills/gebaeude-nach-foto/scripts/in-game.mjs'); await k.extract([['<slug>',
[x, z], radius]])` (`recv/<slug>.json` and `<slug>.ground.json`). Then (or `finish.mjs`, which chooses the batches):

```
node .claude/skills/gebaeude-nach-foto/scripts/analyse-building.mjs <scratchpad>/recv/<slug>.json [batch …]
```

It prints each batch's centre (that is the `exclude` entry), flat roofs as `ring: [[x, z], …]` with their heights,
sloped roof triangles, and the points at every height (eaves, gable tops, a spire's tip). Heights are already in the
world frame, each building's floor on the lowest ground under it, as the streamed tiles draw it.

- One real building is often several batches (front block, rear, wings) and a neighbour may sit 4 m away: choose
  `exclude.r` so that only the batches you rebuild fall inside it, and check the list.
- The other way round, **one batch can hold a neighbour** (the Hilton's held the low building west of it, the
  Schweizerhof's the house south of it): match each batch's triangles to the OSM footprints round it; whatever the
  `exclude` removes must be rebuilt.
- Compare OSM's footprint with the survey: `node scripts/osm-gap.mjs <building.json> <osm id> [batch …]`. OSM stood
  up to 3.3 m off the surveyed walls at six of seven buildings; its walls are the player's colliders (section 4).
- Also save a ground grid round the building (`groundHeight` every 6 m) for the floor count on each side.
- Davos' tiles are mostly flat roofs even where the house has a pitched one. Check against the top view; add a roof
  shape only if the photo or the aerial view shows it.
- Kill the receiver at the end (`kill $(lsof -tiTCP:9340 -sTCP:LISTEN)`).

## 4. Write the module

Two files, `js/<name>-data.js` (pure data and frame maths, no three.js: the tests import it) and `js/<name>.js`.

- `excludeBuildings([...])` at module level drops the streamed volume.
- Volumes: each roof outline a prism from a base under the ground up to its roof (`outwardRing` first, then
  `wallFrame(a, b)`: `u` along the wall with **a on the left for someone standing before it**, `n` out). Interior
  walls of touching prisms need no care (back faces).
- Windows are drawn by the wall material from uv, not modelled: u = metres along the wall from its middle,
  v = metres up a floor grid, `aHalf` = half the wall's length (0: closed). Bays are laid out from the wall's middle;
  a decal that must leave windows free computes the same places (`frontWindows` in js/alte-post-data.js) and clears
  holes in the canvas there. Stretches without windows: `wallStretches` (js/spital-data.js).
- Count the floors from the photo and make them add up to the surveyed height (ground floor + n × storey).
- Decoration that is flat (murals, sgraffito, lettering, dials, doors) goes into **one canvas atlas** drawn in code,
  put on with `B.decal(F, s0, s1, out, y0, y1, key)`. Draw it freely after the photo — simplified figures, not a copy
  of an artwork, no logos traced. Keep the atlas ≤ ~1024×1200 (phone memory).
- Geometry that stands out (portal, canopy, cornice, posts, gables): `B.box(bucket, F, s0, s1, o0, o1, y0, y1, colour)`
  in a wall's frame, `B.quad`, `B.tri`. One vertex-coloured `trim` material for all of it.
- Few meshes: walls, roofs (`SIMPLE_SKINS.snowRoof`), trim, decals, plus glass if needed. One merged mesh each.
- The mobile profile: `if (QUALITY.simpleMaterials)` return `SIMPLE_SKINS.windowed / plain / glow` instead of the
  procedural material (iPhone GPU memory: every big shader costs).
- Colours are linear and this renderer brightens: a mid-grey concrete is ~0.2–0.3, warm plaster ~0.36–0.45. Expect one
  round of darkening after the first screenshot. Canvas colours come out pale in sun too.
- Something that moves (clock hands, a flag): one mesh, turned in the vertex shader by uniforms; return a setter from
  `build…` and call it in the frame loop after `gameClock.tick` (js/main.js), not eight meshes.
- Colliders: js/buildings.js raises wall colliders on the OSM footprint, which is often metres off the surveyed walls
  (an invisible wall in the yard, or a wall one walks into). Register the outlines the walls stand on at the ground:
  `SURVEYED_FOOTPRINTS.set(OSM_ID, rings)` (js/landmarks.js) at module level, the parts' rings, leaving out volumes
  that hang over the ground (an arcade's band: put its wall on the shop front, `groundOutlines()` in
  js/schweizerhof-data.js) and adding a porch. `[]`: the module returns colliders for every wall itself (the Hilton,
  whose ground floor is set back under its skin). Add colliders only for what then still stands free (a hall, a portal
  with steps, terraces): thin oriented boxes with `baseY` set (absolute heights), obb axis `(cs, −sn)` = the wall's `u`.
  Return `{ group, colliders }`; `group.userData.terrain = 'absolute'`.
- The ground along a wall: `groundHeight` (js/terrain.js) works at build time and in Node. On a slope start shop
  glazing and the lowest windows over the highest ground along each wall, a closed plinth under it (`groundAlong` in
  js/ameron.js); panes cut by the ground look wrong.
- Patterns finer than ~10 cm (battens, slats, joints) fade out by ~25 m (`fade(8, 28)`), or they shimmer (moiré).
- At night shops are shut: a faint glow behind most panes and a few lit, not a whole lit shop front.
- Existing things nearby may reference the building: mission doors (`js/missions-data-*.js`), `js/helipad.js`, shop
  signs. Keep doors where missions expect them and test the reach.

## 5. Wire it in

- `node .claude/skills/gebaeude-nach-foto/scripts/wire.mjs <slug> <buildFn> <var> <prevVar> "<comment>" [--footprints]`
  does all of this after the module `<prevVar>` (the last one wired) and stops without a change if an anchor is missing.
- `js/main.js`: import, `const x = skipped('<name>') ? { colliders: [] } : build…(scene)` beside the others, and
  `...x.colliders` in `allColliders`.
- `play.html`: a `modulepreload` for both files; `tests/boot.test.cjs`: bump the count and name them in the comment.

## 6. Test

`tests/<name>.test.mjs` (see tests/samd.test.mjs): outlines of some size, walls facing out (a step out of a wall
leaves the ring), floors adding up, decals inside their walls and on window-free stretches, atlas cells not
overlapping, a build in Node with a stand-in `document` (canvas proxy) checking every vertex is finite and the mesh
count, colliders with finite heights. Add the module to `MODULES` in tests/surveyed-footprints.test.mjs if it
registers outlines. `npm test` must be green.

## 7. Check in the browser, then report

Reload, look from where the photo was taken, from afar, and at one other side; compare with the photo. Typical second
round: colours too pale, lettering off-centre, a night glow too bright, fine patterns shimmering.

- Every time: one night shot, one winter shot, and the walls walked: `await k.probe()` (1 m before every outer wall
  must be free, 0.6 m behind it must push out; `k.probe({ [osm]: rings })` for a module registering `[]`).
- **The mobile profile, every time, in two steps.** First in Node, before the browser:
  `node .claude/skills/gebaeude-nach-foto/scripts/mobile-check.mjs <slug> …` builds each module as the phone does
  (`QUALITY.simpleMaterials`) and fails on any material that is not one of SIMPLE_SKINS' or a decal (a full shader
  costs the iPhone's Safari ~1.7 MB of GPU process memory, and it closes the tab at ~1–1.5 GB); it also prints the
  meshes, triangles and canvas pixels (a 1024×1024 atlas is 1 Mpx, ~5 MB on the GPU with its mipmaps: keep an atlas
  to 1024×512 where the lettering fits). Then in the browser: reload `play.html?quality=mobile`, `k.ready()`,
  `k.summer()`, one screenshot per building from afar (the plain skins must read as the building: its colours, a band
  per floor, the lettering) and one at night; `k.restore()`. Report both.
- Screenshots the user wants to see: `computer` `screenshot` with `save_to_disk: true` (the path comes back; name it
  in the report and say what each shows). Only those saved are on disk.

Report in German: what it was, what it is now, which wall you took for the photo's, what you looked at and what you
did not (other sides, night, winter, the mobile profile, walking against new colliders), that roofs lost the aerial
photograph, that the clock is back. Commit only when asked, staging only your own files (other sessions work in the
same tree).

## Known traps

- A collider measured from a roof platform: `liftColliders` takes the ground or a bridge deck, not `addPlatform`
  surfaces. If the user reports an invisible wall, probe with `cm.resolveHorizontalCollision` on a grid at the height
  in question and draw collider outlines on a DOM canvas over the page (a debug mesh added to the scene is not drawn).
- An invisible wall before a rebuilt building: OSM's footprint off the survey (section 3, `osm-gap.mjs`).
- A prop standing beside a raised deck must reach down to the roof it stands on (the windsock's mast).
- `wallFrame` needs the outside on `(−u.z, u.x)`: on an east front the left end is the **south** one (bigger z).
