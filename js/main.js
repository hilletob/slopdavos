import './i18n.js';
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, positionView, metalness, roughness, vec2, vec3, smoothstep } from 'three/tsl';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { createPostProcessing } from './post-processing.js';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import { getLocationLabel, isTypingInField, ROADS, NYC_LANDMARKS, TELEPORT_LOCATIONS, defaultSpawn } from './city-config.js';
import { buildCityGrid } from './city-grid.js';
import { buildBoroughs } from './boroughs.js';
import { buildLandmarks } from './landmarks.js';
import { buildCityBlocks } from './buildings.js';
import { streamSwissBuildings } from './swissbuildings3d.js';
import { drapeTerrainOrthophotos } from './swissimage.js';
import { buildSurroundings } from './surroundings.js';
import { buildTrams } from './trams.js';
import { buildRhB } from './rhb.js';
import { buildTunnels } from './tunnels.js';
import { buildVBD } from './vbd.js';
import { buildLevelCrossings } from './level-crossings.js';
import { buildLoipen } from './loipen.js';
import { buildCrossCountry } from './cross-country.js';
import { buildWinterHikes } from './winter-hikes.js';
import { buildWinterHikers } from './winter-hikers.js';
import { buildGolf } from './golf.js';
import { buildHelipad } from './helipad.js';
import { buildSkiPistes } from './ski-pistes.js';
import { buildWinterSports } from './winter-sports.js';
import { buildSnowfall } from './snowfall.js';
import { buildStreams } from './streams.js';
import { buildShops } from './shops.js';
import { buildBergbahnen } from './bergbahnen.js';
import { buildParking } from './parking.js';
import { buildTrafficSigns } from './traffic-signs.js';
import { buildDetailHouses } from './detail-houses.js';
import { buildLandmarkBuildings } from './landmark-buildings.js';
import { placeOnTerrain, liftColliders, streamTerrain, releaseWaterLevel, refreshTerrainChunks, constrainToTunnel } from './terrain.js';
import { WorldStreamer, groundBuilder, paintBuilder, trackBuilder, parkingBuilder } from './world-stream.js';
import { FRAME } from './davos-frame.js';
import { buildStreetDetails } from './street-details.js';
import { createTrafficSystem, createHighwayTraffic } from './traffic.js';
import { buildRoadPaint } from './road-paint.js';
import { ThirdPersonControllerManager, PLAYER_STARTS } from './controllers.js';
import { TouchControls } from './touch-controls.js';
import { GamepadControls } from './gamepad-controls.js';
import { CameraSystem, CAMERA_PRESETS } from './cameras.js';
import { LightingSystem } from './lighting.js';
import { NYCMapSystem } from './nyc-map.js';
import { setupSceneCulling, updateSceneCulling } from './scene-culling.js';
import { CityAudioSystem } from './audio-system.js';
import { QUALITY, setBackend, skipped, skipLabel, setWorldCenter, inWorld, WORLD } from './quality.js';
import { releaseUploadedGeometry, releasedGeometryStats, compactStaticGeometry } from './gpu-memory.js';
import { isWinter, onSeasonChange } from './season.js';
import { groomMap } from './groom-map.js';
import { buildMissions } from './missions.js';
import { buildGta, isClassicMode, hasGtaState } from './gta.js';
import { GTA_START } from './vehicle-depots.js';
import { DirectLighting, watchShaderModules, previousGpuLog } from './gpu-diagnostics.js';

// Saved player state (localStorage 'slopdavos-player-state'); older versions are ignored
const SAVE_VERSION = 7; // 7: new starts for every player (controllers.js PLAYER_STARTS: the cyclist by the Seehof Seeli, the pedestrian at the Eisstadion, the Rega over the Jakobshornbahn, the groomer on the Bündawiese); 6: the VW T3 on the Dischmastrasse; 4: Davos (saves from before the buildings stood on the terrain could start inside one)

// The GTA mode (js/gta.js): on foot, into the vehicles that stand about; ?classic=1 brings back the mode bar instead
const GTA = !isClassicMode();
// A first visit starts on foot by the Bahnhof Davos Platz (classic: by bike by the Seehof Seeli); a first visit of the
// GTA mode ignores a save from before it (it starts afresh, see js/gta.js)
const FIRST_START = GTA ? GTA_START : PLAYER_STARTS.cyclist;
const FRESH_GTA = GTA && !hasGtaState();

// js/main.js
// Main entry point for Davos in Three.js WebGPURenderer & TSL (three.js dev, see index.html)

// Start-up breadcrumbs (localStorage 'slopdavos-boot'): the stage reached and any error, kept until the first frame.
// A phone that kills the tab mid-start (iOS does, without a message) shows on its next start where the last one ended.
const BOOT_KEY = 'slopdavos-boot';
// (the stage carries the ?qset=skip:... setting along: "compile 3/40 terrain [skip: landmarks+lights]")
const SKIP_TAG = skipLabel() ? ` [skip: ${skipLabel()}]` : '';
const boot = {
  previous: (() => { try { return JSON.parse(localStorage.getItem(BOOT_KEY)); } catch { return null; } })(),
  state: { stage: 'start' + SKIP_TAG, skip: skipLabel(), at: new Date().toISOString(), ua: navigator.userAgent, errors: [] },
  save() { try { localStorage.setItem(BOOT_KEY, JSON.stringify(this.state)); } catch { /* storage may be off */ } },
  finished: false,
  stage(label) { if (this.finished) return; this.state.stage = label + SKIP_TAG; this.save(); },
  error(message) { if (this.finished) return; if (this.state.errors.length < 5) this.state.errors.push(String(message).slice(0, 600)); this.save(); },
  done() { this.finished = true; try { localStorage.removeItem(BOOT_KEY); } catch { /* storage may be off */ } }
};
boot.save();
// (where it happened too: file, line and the first frames of the stack; "Script error." alone says nothing)
const errorText = (err, message, file, line, col) => [message || err?.message || String(err),
  file ? `@ ${String(file).split('/').pop()}:${line}:${col}` : '', err?.stack ? err.stack.split('\n').slice(0, 3).join(' < ') : ''].filter(Boolean).join(' ');
addEventListener('error', (e) => boot.error(errorText(e.error, e.message, e.filename, e.lineno, e.colno)), true);
addEventListener('unhandledrejection', (e) => boot.error('unhandled: ' + errorText(e.reason)));

async function initApp() {
  const container = document.getElementById('canvas-container');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');
  const loadingTrack = loadingOverlay ? loadingOverlay.querySelector('.loader-track') : null;
  const loadingFill = document.getElementById('loading-progress');
  // The loading bar sweeps while the city is being built (the main thread is busy) and fills as the shaders compile
  const setLoadingProgress = (p) => {
    if (!loadingFill) return;
    if (loadingTrack) loadingTrack.classList.remove('is-indeterminate');
    loadingFill.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
  };

  if (loadingStatus) {
    loadingStatus.textContent = 'Getting the city ready…';
  }
  // The last start never got to its first frame: say where it stopped (and what went wrong, if anything was caught)
  if (boot.previous && loadingOverlay) {
    const note = document.createElement('p');
    note.className = 'loader-crash-note';
    note.style.cssText = 'margin-top:12px;font-size:12px;opacity:.75;max-width:90vw;word-break:break-word';
    note.textContent = `Previous launch stopped at: ${boot.previous.stage}` + (boot.previous.errors?.length ? ` · ${boot.previous.errors.join(' | ')}` : '');
    (loadingStatus?.parentElement || loadingOverlay).appendChild(note);
    console.warn('[boot] the previous start stopped at', boot.previous);
  }
  // The last start's GPU trouble (js/gpu-diagnostics.js), also when it came after the first frame: the last shader
  // module made and the first errors
  const gpuLog = previousGpuLog();
  if ((gpuLog?.errors?.length || gpuLog?.lost) && loadingOverlay) {
    const note = document.createElement('p');
    note.className = 'loader-crash-note';
    note.style.cssText = 'margin-top:8px;font-size:11px;opacity:.7;max-width:90vw;word-break:break-word';
    const last = gpuLog.last?.at(-1);
    note.textContent = `GPU: ${gpuLog.errors.slice(0, 2).join(' | ')}` + (last ? ` · last shader #${last.n} ${last.label} ${last.length} B #${last.hash}` : '');
    (loadingStatus?.parentElement || loadingOverlay).appendChild(note);
    console.warn('[gpu] the previous start:', gpuLog);
  }
  // This start leaves systems out (?qset=skip:..., js/quality.js)
  if (skipLabel() && loadingOverlay) {
    const note = document.createElement('p');
    note.style.cssText = 'margin-top:8px;font-size:12px;opacity:.8';
    note.textContent = `skip: ${skipLabel()}`;
    (loadingStatus?.parentElement || loadingOverlay).appendChild(note);
  }

  // 1. Initialize Three.js WebGPURenderer with 32-bit float reversedDepthBuffer
  // (the device profile, js/quality.js: no MSAA on the mobile one, whose four samples of each render target cost more
  // than its screen gains from them)
  const renderer = new THREE.WebGPURenderer({
    antialias: QUALITY.antialias,
    powerPreference: 'high-performance',
    reversedDepthBuffer: true,
    forceWebGL: QUALITY.forceWebGL
  });
  renderer.setPixelRatio(QUALITY.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  // (the mobile profile, js/quality.js: no point and spot lights in the shaders at all, js/gpu-diagnostics.js; the
  // lamps and windows glow by their emissive materials)
  renderer.lighting = QUALITY.clusteredLighting ? new ClusteredLighting(...QUALITY.clusterLights) : new DirectLighting();
  container.appendChild(renderer.domElement);

  // Start-up phase timings (logged once as "[init] ...") to keep load-time regressions traceable
  let initTimings = [];
  let initMark = performance.now();
  const markInit = (label) => {
    const now = performance.now();
    initTimings.push(`${label} ${Math.round(now - initMark)}ms`);
    initMark = now;
    boot.stage(label);
  };

  await renderer.init();
  markInit('renderer');
  // (the mobile profile: every shader module numbered in the breadcrumbs, with its object, length and hash, and the
  // compiler's complaints; ?qset=shaderLog:true elsewhere)
  if (renderer.backend.isWebGPUBackend && (QUALITY.mobile || QUALITY.shaderLog)) {
    watchShaderModules(renderer, { stage: (label) => boot.stage(label), error: (message) => boot.error(message), keepWGSL: true });
  } else {
    renderer.backend.device?.lost?.then((info) => boot.error(`GPU device lost: ${info.reason || ''} ${info.message || ''}`));
  }
  console.info(`[renderer] Three.js r${THREE.REVISION}; ${renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL fallback'}`);
  container.dataset.renderer = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL fallback';
  // The profile tightens on the WebGL 2 fallback; the HUD names the backend actually drawing
  setBackend(renderer.backend.isWebGPUBackend);
  const backendLabel = document.getElementById('hud-backend');
  if (backendLabel) backendLabel.textContent = QUALITY.backend;
  console.info(`[quality] ${QUALITY.name} profile (${QUALITY.reason}), ${QUALITY.backend}`);
  container.dataset.threeRevision = THREE.REVISION;

  // 2. Build Scene & Physical Atmospheric Sky / PMREM IBL / 4096x4096 Shadow Lighting
  const scene = new THREE.Scene();
  globalThis.__slopdavosBuild = { scene, renderer }; // (for the memory probes: the scene while it is still being built)
  const lightingSystem = new LightingSystem(scene, renderer);
  // (?qset=skip:a+b, js/quality.js: whole systems left out, to find what a device can't take; NOOP stands in for
  // their per-frame hooks)
  const NOOP = () => {};
  const snowfall = skipped('snowfall') ? { update: NOOP } : buildSnowfall(scene, { night: lightingSystem.uNightFactor }); // falling snow in winter
  markInit('lighting');

  if (loadingStatus) {
    loadingStatus.textContent = 'Opening the streets…';
  }

  // 3. Build Davos' ground, landmarks, blocks, street details & traffic. The engine builds them for a flat world: the
  // static scenery is laid onto the terrain once built (terrain.js); swissBUILDINGS3D and the ground are already in place.
  const flatWorld = new Set(scene.children);
  // (the mobile profile: a breath between the heavy builders, in which the browser's idle-time garbage collection can
  // free the hundreds of MB of temporary arrays each leaves behind before the next piles more on top)
  const breathe = () => (QUALITY.mobile ? new Promise((resolve) => setTimeout(resolve, 60)) : null);
  // The part of the valley built in detail (the mobile profile: QUALITY.worldRadius around where the player starts)
  {
    let start = FIRST_START; // (a first visit starts on foot or by bike, see below)
    if (!FRESH_GTA) try { const s = JSON.parse(localStorage.getItem('slopdavos-player-state')); const p = s?.version === SAVE_VERSION && s.entities?.[s.activeMode]; if (Number.isFinite(p?.x) && Number.isFinite(p?.z)) start = p; } catch { /* (no storage) */ }
    setWorldCenter(start.x, start.z);
    if (WORLD.radius !== Infinity) console.info(`[world] detail within ${WORLD.radius} m of ${Math.round(start.x)}, ${Math.round(start.z)}`);
  }
  const cityGrid = await buildCityGrid(scene); // (async: the mobile profile pauses within, js/city-grid.js)
  // (the mobile profile: the ground layers' vertices shared and their normals in bytes at once, js/gpu-memory.js:
  // ~85 MB of draped corners down to ~25 MB before the rest is built)
  const compacted = { geometries: 0, before: 0, after: 0 };
  const compact = (roots) => {
    if (!QUALITY.compactGeometry) return;
    const st = compactStaticGeometry(roots);
    for (const k of Object.keys(compacted)) compacted[k] += st[k];
  };
  compact([cityGrid.group]);
  releaseWaterLevel(); // (the water surfaces are draped: its grid is rebuilt should anything ask again)
  // The mobile profile (js/quality.js worldRadius): the streets, markings, track bed and car parks come in 500 m cells
  // round the player and go again behind (js/world-stream.js); the cells of the start are built now, the rest while
  // playing. Each part built gets what the start-up build gives the static scenery below: compacted, its instances in
  // storage buffers, its matrices set (the scene's are frozen), its colliders with the controllers
  const worldHooks = { controllers: null };
  // (cells whose square comes within the radius: as the cells own what lies in their square, the detail reaches
  // 300-800 m farther than that, and ~22 cells of 500 m cover about the area the old circle of 1300 m did)
  const world = QUALITY.worldRadius > 0 ? new WorldStreamer({
    scene, radius: Math.max(500, QUALITY.worldRadius - 300), hysteresis: 300,
    onAdded: (objects, colliders) => {
      compact(objects);
      for (const root of objects) {
        if (renderer.backend.isWebGPUBackend) root.traverse((o) => { if (o.isInstancedMesh && !o.instanceMatrix.isStorageInstancedBufferAttribute) o.instanceMatrix = new THREE.StorageInstancedBufferAttribute(o.instanceMatrix.array, 16); });
        root.updateMatrixWorld(true);
      }
      if (colliders.length) worldHooks.controllers?.addColliders(colliders);
    },
    onRemoved: (objects, colliders) => { if (colliders.length) worldHooks.controllers?.removeColliders(colliders); }
  }) : null;
  if (world) {
    world.addBuilder(groundBuilder());
    await world.prime(WORLD.x, WORLD.z);
    refreshTerrainChunks({ all: true }); // (the terrain sinks a little under the streets just built)
    console.info('[world] cells of the start:', JSON.stringify(world.info()));
  }
  // The winter-only scenery: on the mobile profile (js/quality.js) only built once winter is switched on (~90 MB of
  // trails and runs a summer visit never shows); they lie on the terrain already ('absolute')
  let winterSceneryBuilt = false;
  const buildWinterScenery = () => {
    if (winterSceneryBuilt) return;
    winterSceneryBuilt = true;
    buildLoipen(scene); // cross-country ski trails, shown in winter
    buildSkiPistes(scene); // the groomed downhill runs with their edge poles, shown in winter
    buildWinterHikes(scene); // the signposted winter hiking trails with their pink markers, shown in winter
  };
  if (skipped('winter')) { /* (no pistes, trails or winter hikes) */ } else if (!QUALITY.lazyWinter || isWinter()) buildWinterScenery();
  else {
    const stop = onSeasonChange((on) => {
      if (!on) return;
      stop();
      const before = new Set(scene.children);
      buildWinterScenery();
      for (const o of scene.children) if (!before.has(o)) o.updateMatrixWorld(true); // (the scene's matrices are frozen)
    });
  }
  const crossCountry = skipped('winter') ? { update: NOOP } : buildCrossCountry(scene); // cross-country skiers on them (js/cross-country.js)
  const winterHikers = skipped('winter') ? { update: NOOP } : buildWinterHikers(scene); // winter hikers (and dogs) on them near the camera (js/winter-hikers.js)
  // (the mobile profile, js/quality.js: the golf course and the streams are built a few seconds after the first frame,
  // one at a time: their build allocates ~1.5 GB of short-lived arrays, which then never adds to the start's peak)
  const deferred = [];
  const buildLater = (build) => (QUALITY.deferScenery ? deferred.push(build) : build());
  if (!skipped('golf')) buildLater(() => buildGolf(scene)); // the Golf Club Davos' fairways, greens, tees and bunkers, under the snow in winter
  const winterSports = skipped('winter') ? { update: NOOP } : buildWinterSports(scene); // skiers and snowboarders on the runs near the camera, in winter
  if (!skipped('streams')) buildLater(() => buildStreams(scene)); // the Landwasser's open stretches, the Dischmabach and the side creeks
  const shops = skipped('shops') ? { refine: NOOP } : buildShops(scene); // the businesses' signs (js/shops-data.js)
  const parking = skipped('parking') || world ? { colliders: [], update: NOOP } : buildParking(scene); // the car parks' bays and parked cars (js/parking-data.js)
  if (world && !skipped('parking')) world.addBuilder(parkingBuilder()); // (cell by cell round the player instead)
  const detailHouses = skipped('detailhouses') ? { colliders: [] } : buildDetailHouses(scene); // houses rebuilt from photographs (js/detail-houses.js)
  const landmarkBuildings = skipped('landmarks') ? { colliders: [] } : buildLandmarkBuildings(scene); // Eisstadion, Kongresszentrum, eau-là-là, Natureisbahn (js/landmark-buildings.js)
  markInit('cityGrid');
  await breathe();
  // The relief around the city, out to the Alps (swissALTIRegio)
  try {
    // (the mobile profile: first of the deferred scenery, after the first frame, its build's garbage apart from the town's)
    if (!skipped('surroundings')) {
      if (QUALITY.deferScenery) deferred.unshift(() => buildSurroundings(scene).catch((error) => console.warn('[surroundings] the horizon stays empty:', error)));
      else await buildSurroundings(scene);
    }
  } catch (error) {
    console.warn('[surroundings] the horizon stays empty:', error);
  }
  markInit('surroundings');
  await breathe();
  const noVehicles = () => ({ bodies: [], group: null, update: NOOP, collidePlayer: NOOP });
  const trams = skipped('traffic') ? noVehicles() : buildTrams(scene);
  if (world && !skipped('traffic')) world.addBuilder(trackBuilder()); // (the track bed cell by cell round the player, js/world-stream.js)
  const rhb = skipped('rhb') ? noVehicles() : buildRhB(scene);
  buildTunnels(scene);
  const bergbahnen = skipped('bergbahnen') ? { update: NOOP } : buildBergbahnen(scene); // Parsennbahn, Schatzalpbahn, Jakobshornbahn and the ski lifts
  const vbd = skipped('traffic') ? noVehicles() : buildVBD(scene); // the Verkehrsbetrieb Davos buses on their lines
  const levelCrossings = skipped('rhb') ? noVehicles() : buildLevelCrossings(scene, rhb); // booms and flashing lights where roads cross the RhB
  markInit('trams');
  const boroughs = buildBoroughs(scene, { sidewalks: cityGrid.sidewalks });
  markInit('boroughs');
  const { colliders: landmarkColliders } = buildLandmarks(scene);
  buildHelipad(scene); // the Rega pad on the roof of the Spital Davos, the helicopter lands on it (js/helipad.js)
  markInit('landmarks');
  // Real swissBUILDINGS3D volumes stream in nearest first (the rest keeps loading while playing); the OSM-extruded
  // buildings remain the fallback when swisstopo's tiles can't be reached.
  let swissBuildings = null;
  let swissStream = null;
  let buildingsSettled = false;
  try {
    const savedSpawn = FRESH_GTA ? null : (() => { try { const s = JSON.parse(localStorage.getItem('slopdavos-player-state')); return s?.version === SAVE_VERSION ? s.entities?.[s.activeMode] : null; } catch { return null; } })();
    // The SWISSIMAGE orthophotos stream onto the terrain chunks meanwhile, nearest first
    drapeTerrainOrthophotos(cityGrid.terrainMeshes || [], { center: Number.isFinite(savedSpawn?.x) ? savedSpawn : FIRST_START })
      .then((n) => console.info(`[swissimage] ${n} terrain chunks draped`));
    // (?qset=skip:buildings: no swissBUILDINGS3D, and no OSM buildings in their place either, see buildCityBlocks below)
    if (skipped('buildings')) throw new Error('skipped (?qset=skip:buildings)');
    const stream = swissStream = streamSwissBuildings(scene, {
      center: Number.isFinite(savedSpawn?.x) ? savedSpawn : FIRST_START,
      nearRadius: QUALITY.buildingNear, concurrency: QUALITY.buildingLoads,
      onProgress: (done, total) => {
        if (!swissBuildings) boot.stage(`swissbuildings3d ${done}/${total}`);
        if (loadingStatus && !swissBuildings) loadingStatus.textContent = `Loading swissBUILDINGS3D ${done}/${total}…`;
      }
    });
    swissBuildings = await stream.ready;
    // Once every building tile is in, the shop signs move onto the real facades (the OSM footprints differ)
    // (and then nothing reads the buildings' vertices on the CPU any more: their arrays may go, see releaseStatic below)
    stream.done.then(() => shops.refine(stream.group)).catch((error) => console.warn('[shops] facades:', error))
      .finally(() => { buildingsSettled = true; });
  } catch (error) {
    if (skipped('buildings')) console.info('[swissbuildings3d] skipped (?qset=skip:buildings)');
    else console.warn('[swissbuildings3d] falling back to OSM buildings:', error);
  }
  markInit('swissbuildings3d');
  const cityBlocks = buildCityBlocks(scene, { bag: !!swissBuildings || skipped('buildings') });
  if (skipped('buildings')) scene.remove(cityBlocks.group); // (their fire escapes and shop fronts too; the colliders stay)
  markInit('blocks');
  if (world) await world.settle(); // (the track bed and the car parks of the start's cells: their colliders below)
  const allColliders = liftColliders([...landmarkColliders, ...cityBlocks.colliders, ...boroughs.colliders, ...(cityGrid.colliders || []), ...parking.colliders, ...detailHouses.colliders, ...landmarkBuildings.colliders, ...(world ? world.colliders() : [])]);

  const streetDetails = skipped('details')
    ? { footprints: [], signalIntersections: [], trees: [], knockablePosts: [], audioSignals: [], signalClock: { value: 0 }, update: null }
    : buildStreetDetails(scene);
  markInit('streetDetails');
  await breathe();
  const terrainStats = { rigid: 0, instances: 0, draped: 0, displaced: 0 };
  for (const root of scene.children.filter((o) => !flatWorld.has(o))) placeOnTerrain(root, terrainStats);
  markInit('terrain');
  // Buildings turned along non-grid streets have oriented colliders whose world bounds reach past their lots: they stay
  // inside the property line anyway, so the road network (lanes & sidewalks) doesn't need them.
  // Elevated building sections that clear even a bus don't obstruct ground traffic.
  const trafficSystem = createTrafficSystem(scene, cityGrid.sidewalks, [
    ...cityGrid.footprints,
    ...streetDetails.footprints,
    ...allColliders.filter((c) => !c.obb && (c.minY ?? 0) - (c.baseY ?? 0) < 3.5)
  ], streetDetails.signalIntersections);
  if (skipped('traffic')) scene.remove(trafficSystem.group); // (?qset=skip:traffic: they drive unseen)
  markInit('traffic');
  const trafficBodies = [...trams.bodies, ...rhb.bodies, ...vbd.bodies, ...levelCrossings.bodies]; // (+ the parked snow groomer, below)
  trafficSystem.setTramBodies(trafficBodies);
  const highwayTraffic = createHighwayTraffic(scene, skipped('traffic') ? [] : cityGrid.highwayLanes);
  if (skipped('traffic')) scene.remove(highwayTraffic.group);
  const beforePaint = new Set(scene.children);
  if (world) { world.addBuilder(paintBuilder(trafficSystem.network)); await world.settle(); } // (cell by cell, draped within)
  else buildRoadPaint(scene, trafficSystem.network);
  for (const root of scene.children.filter((o) => !beforePaint.has(o))) placeOnTerrain(root, terrainStats);
  console.info('[terrain] laid on the relief:', JSON.stringify(terrainStats));
  markInit('roadPaint');
  // Swiss road signs (js/traffic-signs.js), clear of the painted crosswalks; their posts stop the player (not the AI
  // traffic, which got its obstacles above)
  const trafficSigns = skipped('signs') ? { colliders: [], knockablePosts: [], update: NOOP } : buildTrafficSigns(scene, { network: trafficSystem.network, night: lightingSystem.uNightFactor });
  allColliders.push(...trafficSigns.colliders);
  markInit('trafficSigns');

  // 4. Initialize Third-Person Controllers (Person, Car, Cyclist, Helicopter, Snowcat, RhB) & Multi-Camera System
  const controllerManager = new ThirdPersonControllerManager(scene, allColliders);
  worldHooks.controllers = controllerManager; // (the cells built from now on hand their colliders over directly)
  if (!skipped('rhb')) controllerManager.setRailway(rhb); // the rhb mode drives one of the trains
  trafficBodies.push(controllerManager.snowcatTrafficBody); // the parked snow groomer is solid for the traffic
  controllerManager.setTrees(streetDetails.trees); // ... and the driven one stops at the trees
  // The lamp posts and sign posts stop the player, and go down under a vehicle at speed (controllers.js knockOverPost)
  controllerManager.setKnockablePosts([...streetDetails.knockablePosts, ...trafficSigns.knockablePosts]);
  controllerManager.entities.cargobike.mesh.visible = false; // the cargo bike is no longer offered in Davos
  // Reuse teleport placement so saved players return at rest, close to their last positions. A first visit (or a save
  // from an older version) starts by bike on the Talstrasse by the Seehof Seeli (controllers.js PLAYER_STARTS).
  let restored = false;
  try {
    const saved = JSON.parse(localStorage.getItem('slopdavos-player-state'));
    if (saved?.version === SAVE_VERSION) {
      restored = true;
      for (const mode of Object.keys(controllerManager.entities)) {
        if (mode === 'rhb' || mode === 'cargobike') continue; // the train is where the timetable has it
        const p = saved.entities?.[mode];
        if (!p || ![p.x, p.y, p.z, p.heading].every(Number.isFinite)) continue;
        controllerManager.setMode(mode);
        controllerManager.teleportActiveTo(p.x, p.z, p.heading, p.y);
      }
      controllerManager.setMode(Object.hasOwn(controllerManager.entities, saved.activeMode) && saved.activeMode !== 'cargobike' ? saved.activeMode : 'cyclist');
    }
  } catch { /* Missing or unavailable storage does not prevent playing. */ }
  if (!restored) {
    // (every player waiting at its start is set down on the relief, not left at its built height; the helicopter keeps
    // its height over the ground)
    for (const mode of ['car', 'person', 'cyclist', 'snowcat', 'helicopter']) {
      const ent = controllerManager.entities[mode];
      if (!ent) continue;
      controllerManager.setMode(mode);
      controllerManager.teleportActiveTo(ent.position.x, ent.position.z, ent.heading, mode === 'helicopter' ? ent.position.y : null);
    }
    controllerManager.setMode('cyclist');
  }

  function savePlayerState() {
    try {
      const entities = Object.fromEntries(Object.entries(controllerManager.entities).map(([mode, entity]) => [mode, {
        x: entity.position.x, y: entity.position.y, z: entity.position.z, heading: entity.heading
      }]));
      localStorage.setItem('slopdavos-player-state', JSON.stringify({ version: SAVE_VERSION, activeMode: controllerManager.activeMode, entities }));
    } catch { /* Storage may be disabled or full. */ }
  }

  const cameraSystem = new CameraSystem(renderer.domElement, controllerManager);
  const touchControls = new TouchControls(controllerManager);
  const soundButton = document.getElementById('btn-sound');
  const audioSystem = new CityAudioSystem({ controllerManager, trafficSystem, highwayTraffic, streetDetails }, {
    onStateChange: updateSoundButton
  });
  function updateSoundButton() {
    if (!soundButton) return;
    soundButton.disabled = !audioSystem.supported;
    soundButton.setAttribute('aria-pressed', String(audioSystem.enabled));
    soundButton.setAttribute('aria-label', audioSystem.enabled ? 'Mute sound' : 'Enable sound');
    soundButton.title = audioSystem.supported ? `${audioSystem.enabled ? 'Mute' : 'Enable'} sound [N]` : 'Web Audio is unavailable';
    soundButton.querySelector('use').setAttribute('href', audioSystem.enabled ? '#i-sound' : '#i-sound-off');
  }
  soundButton?.addEventListener('click', () => audioSystem.setEnabled(!audioSystem.enabled));
  updateSoundButton();
  // pagehide also covers navigation away on mobile; preserve the context across back-forward cache restores.
  window.addEventListener('pagehide', (event) => {
    savePlayerState();
    if (!event.persisted) audioSystem.dispose();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) savePlayerState(); });
  markInit('controllers');

  // Island-wide static geometry: chunk & distance-cull the small props, shadow stand-ins for the big casters
  // (scene-culling.js)
  const cullingRoots = ['BerlinMitteCityGrid', 'BerlinMitteCityBlocks', 'BerlinStreetDetails', 'ManhattanLandmarks', 'BerlinBoundaryContext']
    .map((name) => scene.getObjectByName(name))
    .filter(Boolean);
  // (no shadow stand-ins without the shadow maps: the mobile profile)
  setupSceneCulling(scene, cullingRoots, QUALITY.shadows ? lightingSystem.sunLight.shadow : null);

  // The static scenery whose vertex and index arrays nothing reads after the upload (collisions, height queries and the
  // map use their own data): js/gpu-memory.js releases them once drawn. Not the trees (their instance buffers are
  // repacked), the moving vehicles, the signs (rebuilt by shops.refine) or the rail crossings (lamp attributes); the
  // buildings once the shop signs have been moved onto their facades (a raycast).
  const STATIC_ROOTS = new Set(['BerlinMitteCityGrid', 'BerlinStreetDetails', 'surroundings', 'Ski pistes', 'Loipen', 'WinterHikes', 'Golf Club Davos',
    'Streams', 'Parking', 'DavosTrains', 'Bergbahnen', 'ShadowProxy', 'RoadMarkings', 'WorldCells']);
  compact(scene.children.filter((o) => STATIC_ROOTS.has(o.name)));
  if (compacted.geometries) console.info(`[gpu-memory] ${compacted.geometries} geometries compacted: ${Math.round(compacted.before / 1048576)} MB -> ${Math.round(compacted.after / 1048576)} MB`);
  let releasedMB = 0;
  // The deferred scenery (see buildLater), once the town is on screen: built, compacted, its matrices set (the scene's
  // are frozen) and, on WebGPU, its instances in storage buffers like the rest (below)
  const buildDeferred = async () => {
    const build = deferred.shift();
    if (!build) return;
    const before = new Set(scene.children);
    try {
      await build(); // (the relief around the town loads its data first)
    } catch (error) {
      console.warn('[deferred]', error);
    }
    const added = scene.children.filter((o) => !before.has(o));
    compact(added);
    for (const root of added) {
      if (renderer.backend.isWebGPUBackend) root.traverse((o) => { if (o.isInstancedMesh) o.instanceMatrix = new THREE.StorageInstancedBufferAttribute(o.instanceMatrix.array, 16); });
      root.updateMatrixWorld(true);
    }
    setTimeout(buildDeferred, 1500);
  };
  const releaseStatic = () => {
    if (QUALITY.releaseCpu === false) return; // (?qset=releaseCpu:false keeps every CPU copy)
    const roots = scene.children.filter((o) => STATIC_ROOTS.has(o.name) || (buildingsSettled && o === swissStream?.group));
    const bytes = releaseUploadedGeometry(renderer, roots, {
      skip: (o) => o.name === 'Trees'
    });
    releasedMB += bytes / 1048576;
  };

  // Initialize static world matrices once, including the chunks and shadow proxies created above.
  // Crowd, tree and building-detail animation changes instance/pose buffers, not Object3D transforms.
  const dynamicRoots = [
    trafficSystem.group,
    highwayTraffic.group,
    vbd.group, // the buses move as whole objects
    levelCrossings.group, // the booms turn
    scene.getObjectByName('StoreClusteredLights'),
    scene.getObjectByName('StreetClusteredLights'),
    ...Object.values(controllerManager.entities).map((entity) => entity.mesh),
    controllerManager.entities.cyclist.helmet
  ].filter(Boolean);
  scene.updateMatrixWorld(true);
  scene.matrixWorldAutoUpdate = false;
  markInit('culling');
  await breathe();

  // On WebGPU, small InstancedMeshes (<= 1000 instances) keep their matrices in uniform buffers that three.js
  // re-uploads on every draw of every pass (~2.5 MB/frame with the shadow cascades, stalling the GPU queue).
  // Storage attributes only upload when needed; WebGL2 needs ordinary instanced attributes for correct transforms.
  if (renderer.backend.isWebGPUBackend) {
    scene.traverse((object) => {
      if (object.isInstancedMesh) {
        object.instanceMatrix = new THREE.StorageInstancedBufferAttribute(object.instanceMatrix.array, 16);
      }
    });
  }

  // 5. TSL RenderPipeline with Half-Res Screen Space Reflections (SSRNode), Bloom & Filmic Toning
  //    Fade out distant and matte surfaces so SSR spends its rays on visible glossy reflections.
  const scenePass = pass(scene, cameraSystem.camera);
  // The multisampled colour attachments (output, normal, metalRough) only need resolving, never storing: discarding
  // them spares the GPU writing 3 x 4 samples per pixel to memory every frame (transient, memoryless attachments where
  // the browser supports them). The multisampled depth stays stored: SSR reads it.
  scenePass.renderTarget.storeMultisampledColorBuffer = false;
  const ssrFade = smoothstep(360.0, 180.0, positionView.z.negate());
  const maxSSRRoughness = 0.75;
  // (the mobile profile, js/quality.js, does without the reflections: no normal and material targets, no SSR passes)
  const sceneMRT = QUALITY.ssr ? mrt({
    output: output,
    normal: normalView,
    metalRough: vec2(roughness.lessThan(maxSSRRoughness).select(metalness.mul(ssrFade), 0), roughness)
  }) : null;
  if (sceneMRT) {
    sceneMRT.setBlendMode('normal', new THREE.BlendMode(THREE.MaterialBlending));
    sceneMRT.setBlendMode('metalRough', new THREE.BlendMode(THREE.MaterialBlending));
    scenePass.setMRT(sceneMRT);
  }

  const scenePassColor = scenePass.getTextureNode('output');
  let reflections = vec3(0);
  if (QUALITY.ssr) {
    const scenePassDepth = scenePass.getTextureNode('depth');
    const scenePassNormal = scenePass.getTextureNode('normal');
    const scenePassMetalRough = scenePass.getTextureNode('metalRough');

    const ssrPass = ssr(scenePassColor, scenePassDepth, scenePassNormal, {
      metalnessNode: scenePassMetalRough.r,
      roughnessNode: scenePassMetalRough.g,
      camera: cameraSystem.camera
    });
    ssrPass.resolutionScale = 0.5;
    ssrPass.blurQuality = 1;
    ssrPass.maxDistance.value = 42;
    ssrPass.thickness.value = 0.85;
    // Fewer coarse steps, then refine detected hits to keep reflection edges precise.
    ssrPass.quality.value = 0.25;
    ssrPass.binaryRefine = true;
    ssrPass.intensity.value = 0.50;
    ssrPass.screenEdgeFadeBlack = true;

    // Roughness mip blur must not spread reflections back onto matte or nonreflective surfaces.
    const reflectionMask = scenePassMetalRough.r.greaterThan(0).select(smoothstep(maxSSRRoughness, 0.55, scenePassMetalRough.g), 0);
    reflections = ssrPass.mul(reflectionMask);
  }
  // (?qset=skip:postfx: no bloom, colour grade or tone mapping; the scene straight to the screen)
  const colorGrade = skipped('postfx') ? { applyPreset: NOOP } : createPostProcessing(renderer, scenePassColor, reflections);
  const renderPipeline = skipped('postfx')
    ? { render: () => renderer.render(scene, cameraSystem.camera) }
    : new THREE.RenderPipeline(renderer, colorGrade.outputNode);

  // 6. Wire UI Controls (Strictly using safe DOM APIs: textContent, classList, addEventListener)
  const modeButtons = document.querySelectorAll('[data-mode]');
  const cameraButtons = document.querySelectorAll('[data-camera]');
  const timeButtons = document.querySelectorAll('[data-time]');
  const teleportButtons = document.querySelectorAll('[data-teleport]');
  const hudToggleBtn = document.getElementById('btn-toggle-hud');
  const modeSwitch = document.getElementById('mode-switch');
  touchControls.onAvailabilityChange = placeModeIndicator;

  const elFps = document.getElementById('hud-fps');
  const elMode = document.getElementById('hud-active-mode');
  const elCamera = document.getElementById('hud-active-camera');
  const elSpeed = document.getElementById('hud-speed');
  const elSpeedMeter = document.getElementById('hud-speed-meter');
  const elAltitude = document.getElementById('hud-altitude');
  const elLocation = document.getElementById('hud-location');
  const elControlsHint = document.getElementById('hud-controls-hint');
  let gta = null; // (the GTA mode, built with the UI below)
  const gamepadControls = new GamepadControls(controllerManager, cameraSystem, {
    onUse: () => gta?.use(),
    onCycleMode: (step) => {
      if (GTA) return; // (the GTA mode changes vehicles by getting in and out)
      const modes = ['person', 'car', 'cyclist', 'rhb', 'helicopter', 'snowcat'];
      selectMode(modes[(modes.indexOf(controllerManager.activeMode) + step + modes.length) % modes.length]);
    },
    onCycleCamera: cycleCamera,
    onToggleMap: () => mapSystem.toggleFullMap(!mapSystem.isFullMapOpen),
    onCloseMap: () => mapSystem.toggleFullMap(false)
  });

  // Keyboard guide for each mode: [keys, action]
  const controlHints = {
    person: [[['W', 'S'], 'Walk'], [['A', 'D'], 'Turn'], [['Shift'], 'Sprint'], [['Space'], 'Jump'], [['Drag'], 'Orbit']],
    car: [[['W', 'S'], 'Drive / Reverse'], [['A', 'D'], 'Steer'], [['Shift'], 'Boost'], [['B'], 'Horn'], [['Q', 'E'], 'Indicators'], [['L'], 'High beam'], [['Drag'], 'Orbit']],
    cyclist: [[['W', 'S'], 'Pedal / Brake'], [['A', 'D'], 'Lean & Turn'], [['Shift'], 'Sprint'], [['Drag'], 'Orbit']],
    rhb: [[['W'], 'Throttle'], [['S'], 'Brake'], [['Drag'], 'Orbit']],
    rhbPassenger: [[['Drag'], 'Orbit']], // (riding along, js/gta.js)
    helicopter: [[['W', 'S'], 'Pitch'], [['A', 'D'], 'Yaw'], [['Space', 'E'], 'Ascend'], [['Q', 'C'], 'Descend'], [['Shift'], 'Boost'], [['L'], 'Searchlight']],
    snowcat: [[['W', 'S'], 'Forward / Reverse'], [['A', 'D'], 'Turn on the spot'], [['L'], 'High beam'], [['K'], 'Beacon'], [['F'], 'Tiller'], [['Drag'], 'Orbit']]
  };
  // The GTA mode: getting in and out with F (or G; F is the groomer's tiller: G gets out of it; Enter starts missions)
  if (GTA) for (const [mode, hints] of Object.entries(controlHints)) hints.push([[mode === 'snowcat' ? 'G' : 'F'], mode === 'person' ? 'Get in' : 'Get out']);
  // Boosted top speeds in km/h (controllers.js caps them at 8.2, 36, 19 & 52 m/s): full scale of the speed meter
  const topSpeedKmh = { person: 30, car: 130, cyclist: 69, rhb: 60, helicopter: 188, snowcat: 25 };

  function renderControlHints(mode) {
    if (!elControlsHint) return;
    const items = (controlHints[mode] || []).map(([keys, action]) => {
      const item = document.createElement('span');
      item.className = 'hint';
      for (const key of keys) {
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        item.appendChild(kbd);
      }
      const label = document.createElement('span');
      label.className = 'hint-label';
      label.textContent = action;
      item.appendChild(label);
      return item;
    });
    elControlsHint.replaceChildren(...items);
  }

  // The taxi-yellow pill under the selected mode glides from button to button
  function placeModeIndicator() {
    const active = modeSwitch ? modeSwitch.querySelector('.mode-btn.active') : null;
    if (!active) return;
    modeSwitch.style.setProperty('--ind-x', `${active.offsetLeft}px`);
    modeSwitch.style.setProperty('--ind-w', `${active.offsetWidth}px`);
  }

  function selectMode(mode) {
    controllerManager.setMode(mode);
    mode = controllerManager.activeMode; // (the rhb mode needs a train on the map to take over)
    touchControls.setMode(controllerManager.activeMode);
    gamepadControls.reset();
    modeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    document.body.dataset.mode = mode;
    placeModeIndicator();
    const ent = controllerManager.getActiveEntity();
    if (elMode) elMode.textContent = ent.label;
    renderControlHints(mode === 'rhb' && controllerManager.rhbPassenger ? 'rhbPassenger' : mode);

    // If currently on a static scenic camera, switch to 3rd-Person Chase so user sees their selected character/vehicle
    const currentCam = cameraSystem.getActivePreset();
    if (currentCam.category !== 'follow') {
      selectCamera('chase', false);
    }
  }

  function selectCamera(camId, snap = false) {
    cameraSystem.setCameraPreset(camId, snap);
    cameraButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-camera') === camId);
    });
    const preset = cameraSystem.getActivePreset();
    if (elCamera) elCamera.textContent = preset.name;
  }

  // Steps through CAMERA_PRESETS (V / Shift+V, and the arrows either side of the camera name)
  function cycleCamera(step) {
    const n = CAMERA_PRESETS.length;
    const idx = CAMERA_PRESETS.findIndex((p) => p.id === cameraSystem.activePresetId);
    selectCamera(CAMERA_PRESETS[(idx + step + n) % n].id, true);
  }

  function selectTime(timeId) {
    lightingSystem.applyPreset(timeId);
    colorGrade.applyPreset(lightingSystem.activePresetId);
    timeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-time') === timeId);
    });
  }

  // Data & credits: a native modal <dialog> (Esc and the × close it; so does a click on the backdrop)
  const creditsDialog = document.getElementById('credits-dialog');
  document.getElementById('btn-credits')?.addEventListener('click', () => creditsDialog.showModal());
  creditsDialog?.addEventListener('click', (e) => {
    if (e.target !== creditsDialog) return;
    const r = creditsDialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) creditsDialog.close();
  });

  // Popovers (native [popover]: light dismiss & Esc for free) open against the control that toggles them: data-anchor
  // names the element they sit above / below, data-align the one whose right edge they line up with
  const popovers = document.querySelectorAll('.popover[popover]');
  const supportsPopover = typeof HTMLElement.prototype.togglePopover === 'function';
  function closePopovers() {
    if (!supportsPopover) return;
    popovers.forEach((pop) => {
      if (pop.matches(':popover-open')) pop.hidePopover();
    });
  }
  popovers.forEach((pop) => {
    const invoker = document.querySelector(`[popovertarget="${pop.id}"]`);
    pop.addEventListener('beforetoggle', (e) => {
      const open = e.newState === 'open';
      if (invoker) invoker.classList.toggle('is-open', open);
      if (!open) return;
      const anchor = document.getElementById(pop.dataset.anchor) || invoker;
      const align = document.getElementById(pop.dataset.align) || invoker;
      if (!anchor || !align) return;
      const r = anchor.getBoundingClientRect();
      const spaceAbove = Math.max(0, r.top - 20);
      const spaceBelow = Math.max(0, window.innerHeight - r.bottom - 20);
      let above = pop.dataset.side === 'above';
      // The camera control moves to the top on touch screens; open toward the available space.
      if ((above ? spaceAbove : spaceBelow) < 160) above = spaceAbove > spaceBelow;
      pop.style.right = `${Math.max(8, window.innerWidth - align.getBoundingClientRect().right)}px`;
      if (above) {
        pop.style.top = 'auto';
        pop.style.bottom = `${window.innerHeight - r.top + 8}px`;
        pop.style.maxHeight = `${spaceAbove}px`;
      } else {
        pop.style.bottom = 'auto';
        pop.style.top = `${r.bottom + 8}px`;
        pop.style.maxHeight = `${spaceBelow}px`;
      }
    });
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectMode(btn.getAttribute('data-mode'));
    });
  });

  cameraButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectCamera(btn.getAttribute('data-camera'), true);
      closePopovers();
    });
  });

  const camPrevBtn = document.getElementById('cam-prev');
  const camNextBtn = document.getElementById('cam-next');
  if (camPrevBtn) camPrevBtn.addEventListener('click', () => cycleCamera(-1));
  if (camNextBtn) camNextBtn.addEventListener('click', () => cycleCamera(1));

  timeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectTime(btn.getAttribute('data-time'));
    });
  });

  // A mouse click mustn't leave the focus on a HUD button, or Space (jump / ascend) and Enter would press it again
  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (btn && e.detail > 0) btn.blur();
  });

  // Where you are: the place's name over its street corner, drawn as a pair of NYC street-name signs
  const roadNames = new Set(ROADS.map((r) => r.name));
  const placeNames = new Set(NYC_LANDMARKS.map((l) => l.name));
  let locationText = '';
  function renderLocation(label) {
    if (!elLocation || label === locationText) return;
    locationText = label;
    let place = '';
    let streets = label;
    const split = label.indexOf(' · ');
    if (split >= 0) {
      place = label.slice(0, split);
      streets = label.slice(split + 3);
    } else if (placeNames.has(label) || (!label.includes(' & ') && !roadNames.has(label))) {
      place = label;
      streets = '';
    }
    const nodes = [];
    if (place) {
      const el = document.createElement('div');
      el.className = 'location-place';
      el.textContent = place;
      nodes.push(el);
    }
    if (streets) {
      const row = document.createElement('div');
      row.className = 'location-signs';
      if (streets.startsWith('near ')) {
        streets = streets.slice(5);
        const near = document.createElement('span');
        near.className = 'location-near';
        near.textContent = 'near';
        row.appendChild(near);
      }
      for (const name of streets.split(' & ')) {
        const sign = document.createElement('span');
        sign.className = 'street-sign';
        sign.textContent = name;
        row.appendChild(sign);
      }
      nodes.push(row);
    }
    elLocation.replaceChildren(...nodes);
  }

  function teleportTo(x, z, heading = Math.PI) {
    const destination = controllerManager.teleportActiveTo(x, z, heading);
    touchControls.reset();
    gamepadControls.reset();
    cameraSystem.resetForTeleport();
    selectCamera('chase', true);
    mapSystem.waypoint = {
      x: destination.x,
      z: destination.z,
      name: getLocationLabel(destination.x, destination.z)
    };
    return destination;
  }
  // A teleport (map, menu) beyond the town built in detail (the mobile profile, QUALITY.worldRadius): the player is
  // saved at the destination and the page reloads, building the town around it instead
  function userTeleport(x, z, heading) {
    const destination = teleportTo(x, z, heading);
    if (!inWorld(destination.x, destination.z, -250)) {
      savePlayerState();
      const status = document.getElementById('loading-status');
      if (status) status.textContent = 'Moving the town…';
      document.getElementById('loading-overlay')?.classList.remove('hidden');
      setTimeout(() => window.location.reload(), 50);
    }
    return destination;
  }

  const mapSystem = new NYCMapSystem({
    controllerManager,
    cameraSystem,
    trafficSystem,
    allBlocks: cityBlocks.allBlocks,
    onToggle: (open) => {
      controllerManager.resetInput();
      touchControls.setEnabled(!open);
      gamepadControls.setEnabled(!open);
      const mapHint = document.getElementById('fullmap-hover-info');
      if (open && touchControls.available && mapHint) {
        mapHint.textContent = 'Tap to teleport · Drag to pan · Use + / − to zoom';
      }
    },
    onTeleport: (x, z, heading) => userTeleport(x, z, heading)
  });

  teleportButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-teleport');
      const loc = TELEPORT_LOCATIONS[key];
      if (loc) {
        userTeleport(loc.x, loc.z, loc.heading);
      }
      closePopovers();
    });
  });

  const openMapBtn = document.getElementById('btn-open-map');
  if (openMapBtn) openMapBtn.addEventListener('click', () => mapSystem.toggleFullMap(true));

  if (hudToggleBtn) {
    hudToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('hud-minimized');
      const isMin = document.body.classList.contains('hud-minimized');
      hudToggleBtn.setAttribute('aria-pressed', String(isMin));
      hudToggleBtn.setAttribute('aria-label', isMin ? 'Show HUD' : 'Hide HUD');
      hudToggleBtn.title = isMin ? 'Show the HUD [H]' : 'Clean view: hide the HUD [H]';
      if (isMin) closePopovers();
    });
  }

  // Global keyboard shortcuts for modes (1-5), cameras (V / 6-0), and HUD (H)
  window.addEventListener('keydown', (e) => {
    if (isTypingInField(e)) return;
    switch (e.code) {
      case 'Digit1':
        if (!GTA) selectMode('person');
        break;
      case 'Digit2':
        if (!GTA) selectMode('car');
        break;
      case 'Digit3':
        if (!GTA) selectMode('cyclist');
        break;
      case 'Digit4':
        if (!GTA) selectMode('rhb');
        break;
      case 'Digit5':
        if (!GTA) selectMode('helicopter');
        break;
      case 'Digit6':
        if (!GTA) selectMode('snowcat');
        break;
      case 'Digit7':
        selectCamera('pov', true);
        break;
      case 'Digit8':
        selectCamera('fifthAve', true);
        break;
      case 'Digit9':
        selectCamera('timesSquare', true);
        break;
      case 'Digit0':
        selectCamera('chryslerGCT', true);
        break;
      case 'KeyV':
        cycleCamera(e.shiftKey ? -1 : 1);
        break;
      case 'KeyH':
        if (hudToggleBtn) hudToggleBtn.click();
        break;
      case 'KeyN':
        if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) audioSystem.setEnabled(!audioSystem.enabled);
        break;
      case 'KeyB':
        if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !mapSystem.isFullMapOpen) audioSystem.honk(controllerManager.getActiveEntity());
        break;
    }
  });

  window.addEventListener('resize', () => {
    cameraSystem.onResize(window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
    placeModeIndicator();
    if (mapSystem.isFullMapOpen) {
      mapSystem.resizeFullCanvas();
      mapSystem.renderFullMap();
    }
  });

  // Initialize the UI and chase camera around the restored player, or the default VW T3 on a first visit.
  selectMode(controllerManager.activeMode);
  selectCamera('chase', true);
  selectTime('golden');
  // Missions (js/missions.js): their pins in the open world (Enter in a start circle), the list, ?mission=<id>
  const missions = buildMissions(scene, { controllerManager, cameraSystem, selectMode, selectTime, teleportXZ: teleportTo, savePlayerState, audio: audioSystem, trafficBodies, world, mapSystem });
  // The GTA mode (js/gta.js): no mode bar, the player on foot gets into the vehicles about (on a first visit by the
  // Bahnhof Davos Platz)
  if (GTA) {
    document.body.classList.add('gta-mode');
    gta = buildGta({ scene, controllerManager, touchControls, selectMode, rhb, missions, mapSystem, savePlayerState, traffic: trafficSystem, vbd, trafficBodies, audio: audioSystem });
  }
  // the web fonts change the buttons' widths once they arrive
  if (document.fonts) document.fonts.ready.then(placeModeIndicator);
  markInit('ui');

  // The loading screen stays up while the shaders compile (precompileShaders() & the warm-up frame, see the loop) and
  // until the first frame is on screen
  if (loadingStatus) {
    loadingStatus.textContent = 'Bringing Davos to life…';
  }

  // 6b. Shader pre-compilation behind the loading screen. compileAsync() builds the node graphs in slices and has the GPU
  //     process compile the pipelines in parallel, but after every 8 ms slice it waits for a rendered frame, which
  //     leaves the main thread idle about half the time while nothing else animates; several calls side by side keep
  //     it busy (warm cache: 2.1 s instead of 4.0 s). (Rendering straight away compiled ~500 pipelines one after
  //     another: ~25 s with a cold shader cache.)
  // (a phone's GPU process, iOS above all, is closed when many pipelines are built at once: two at a time there)
  const COMPILE_POOL = QUALITY.mobile ? 2 : 16;
  const _sphere = new THREE.Sphere();
  const PRECOMPILE_RADIUS = 600; // m (the mobile profile)
  const nextTask = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));
  async function precompileShaders() {
    // An empty frame first: it sets up the post-processing chain, which configures the scene pass's render target
    // (MSAA samples, depth format), so the pipelines compiled below are the very ones the scene pass asks for
    scene.visible = false;
    renderPipeline.render();
    scene.visible = true;
    markInit('postFX');

    // Every visible object with frustum culling off (like the warm-up frame, see the loop). Plain meshes that share
    // a material share its shader, so one job compiles them in turn (the first build serves the rest); every
    // instanced mesh gets a build of its own unless its chunks share a pipeline.
    // The mobile profile (QUALITY.precompileAll false) only compiles what the start view shows: compileAsync() uploads
    // the vertices of every object it builds for, the whole valley's with the culling off, more than a phone takes at
    // once; the rest compiles as it comes into view.
    const culled = [];
    const jobs = [];
    const jobByMaterial = new Map();
    const pipelines = new Set();
    const camera = cameraSystem.camera;
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const inView = (o) => {
      if (QUALITY.precompileAll || !o.frustumCulled || o.isInstancedMesh) return true; // (instanced: their own bounds)
      const g = o.geometry;
      if (!g) return true;
      if (!g.boundingSphere) g.computeBoundingSphere();
      return frustum.intersectsSphere(_sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld));
    };
    // (and nothing farther than PRECOMPILE_RADIUS: a few hundred metres of the start show all the town's kinds of things)
    const beyond = (o) => {
      const g = o.geometry;
      if (!g?.boundingSphere) return false;
      _sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      return _sphere.center.distanceTo(camera.position) - _sphere.radius > PRECOMPILE_RADIUS;
    };
    scene.traverseVisible((o) => {
      if ((o.isMesh || o.isLine || o.isPoints) && !inView(o)) return;
      if (!QUALITY.precompileAll && o.isMesh && !o.isInstancedMesh && o.frustumCulled && beyond(o)) return;
      if (o.frustumCulled && QUALITY.precompileAll) {
        culled.push(o);
        o.frustumCulled = false;
      }
      if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite) return;
      // Use the first visible chunk: the original representative may be in an inactive tree cell. Shadow stand-ins
      // only draw in the shadow maps (the warm-up frame compiles those).
      if (o.userData.shadowProxy) return;
      const pipeline = o.userData.sharesPipelineWith || o;
      if (pipelines.has(pipeline)) return;
      pipelines.add(pipeline);
      if (o.isInstancedMesh || Array.isArray(o.material)) {
        jobs.push([o]);
        return;
      }
      let job = jobByMaterial.get(o.material);
      if (!job) {
        job = [];
        jobByMaterial.set(o.material, job);
        jobs.push(job);
      }
      job.push(o);
    });

    if (!skipped('postfx')) {
      renderer.setRenderTarget(scenePass.renderTarget);
      renderer.setMRT(sceneMRT);
    }
    const compile = async (object) => {
      // Each compile starts in a task of its own: compileAsync() keeps one precompilation state on the renderer,
      // which must not be mid-step for two of them in the same microtask checkpoint
      await nextTask();
      try {
        await renderer.compileAsync(object, cameraSystem.camera, scene);
      } catch (e) {
        console.warn('[compile]', e); // the warm-up frame compiles it instead
        boot.error('compile: ' + errorText(e));
      }
    };
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        // (on the mobile profile every job is a breadcrumb: a GPU process closed mid-compile names the object it died on)
        if (QUALITY.mobile) boot.stage(`compile ${next}/${jobs.length} ${job[0].name || job[0].type} (${job[0].material?.type || ''})`);
        for (const object of job) await compile(object);
        done++;
        if (loadingStatus) {
          const message = done < jobs.length * 0.75 ? 'Bringing Davos to life…' : 'Your ride is almost ready…';
          if (loadingStatus.textContent !== message) loadingStatus.textContent = message;
        }
        setLoadingProgress(done / jobs.length);
      }
    };
    await Promise.all(Array.from({ length: COMPILE_POOL }, worker));
    renderer.setMRT(null);
    renderer.setRenderTarget(null);
    for (const o of culled) o.frustumCulled = true;
  }

  // The terrain chunks around the start in full (the rest stream in and out with the camera, js/terrain.js)
  streamTerrain(cameraSystem.camera.position, { all: true });
  // (?qset=precompile:false skips it: everything then compiles when it first comes into view)
  if (QUALITY.precompile !== false) await precompileShaders();
  // (the mobile profile: what the precompile uploaded leaves JavaScript before the first frame adds its own)
  if (QUALITY.mobile) releaseStatic();
  markInit('compile');

  // 6. Animation Loop
  let lastTime = performance.now();
  let elapsed = 0;
  let frameCount = 0;
  let fpsTimer = 0;
  let nextPlayerSave = 0;
  let warmedUp = false; // see the first frame below

  if (elFps) elFps.textContent = '60';

  renderer.setAnimationLoop((now) => {
    const rawDt = (now - lastTime) * 0.001;
    lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    elapsed += dt;

    // Update 3rd-person controllers, camera, signals, traffic & vehicle collisions, building LODs, and dynamic shadow focus
    gamepadControls.update(dt);
    // The trains first: in the rhb mode the player rides in one, and the controllers follow its cab this frame
    rhb.update(dt, { player: controllerManager.getActiveEntity().position });
    bergbahnen.update(dt);
    vbd.update(dt, { player: controllerManager.getActiveEntity().position, barriers: levelCrossings.bodies, camera: cameraSystem.camera.position, traffic: trafficSystem });
    levelCrossings.update(dt);
    controllerManager.update(dt, elapsed);
    constrainToTunnel(controllerManager.getActiveEntity().position);
    cameraSystem.update(dt, elapsed);
    streetDetails.signalClock.value = elapsed;
    trafficSystem.update(
      dt,
      elapsed,
      cameraSystem.currentPos,
      controllerManager.getActiveEntity(),
      controllerManager.activeMode,
      cameraSystem.camera
    );
    highwayTraffic.update(dt, cameraSystem.camera, controllerManager.getActiveEntity(), controllerManager.activeMode);
    trams.update(dt, { vehicles: [trafficSystem.cars, trafficSystem.buses, trafficSystem.bikes], player: controllerManager.getActiveEntity().position });
    trams.collidePlayer(controllerManager.getActiveEntity(), controllerManager.activeMode, controllerManager);
    rhb.collidePlayer(controllerManager.getActiveEntity(), controllerManager.activeMode, controllerManager);
    vbd.collidePlayer(controllerManager.getActiveEntity(), controllerManager.activeMode, controllerManager);
    if (!document.hidden && now >= nextPlayerSave) {
      savePlayerState();
      nextPlayerSave = now + 5000;
    }
    if (boroughs.update) boroughs.update(elapsed); // Roosevelt Island Tramway cabins
    cityBlocks.update(cameraSystem.currentPos.x, cameraSystem.currentPos.z);
    if (cityBlocks.updateLights) cityBlocks.updateLights(cameraSystem.camera);
    if (streetDetails.update) streetDetails.update(cameraSystem.camera);
    lightingSystem.update(cameraSystem.currentPos);
    snowfall.update(cameraSystem.camera);
    crossCountry.update(dt, cameraSystem.camera);
    winterHikers.update(dt, cameraSystem.camera);
    mapSystem.update();
    audioSystem.update(dt, elapsed, cameraSystem.camera, lightingSystem.activePresetId === 'midnight');
    if (warmedUp) updateSceneCulling(cameraSystem.camera.position); // the warm-up frame draws every chunk
    swissStream?.updateRoofDetail(cameraSystem.camera.position); // sharp roof crops near the camera
    streamTerrain(cameraSystem.camera.position); // the terrain chunks' full geometry near the camera, coarse farther
    parking.update(cameraSystem.camera.position); // parked cars: full near the camera, proxies farther
    if (world) { const p = controllerManager.getActiveEntity().position; world.update(p.x, p.z, cameraSystem.camera.position); } // the streets follow the player (the mobile profile)
    winterSports.update(dt, cameraSystem.camera); // skiers and snowboarders near the camera (winter only)
    if (!skipped('winter')) groomMap.update(dt, cameraSystem.camera.position, controllerManager, lightingSystem.activePresetId); // the snow's wear, the groomer's tracks
    missions.update(dt, controllerManager, cameraSystem); // the mission's clock, progress and markers; else the pins in the world
    gta?.update(dt, cameraSystem.camera); // getting in and out, the parked vehicles (the GTA mode)
    if (warmedUp) trafficSigns.update(cameraSystem.camera.position); // the signs near the camera (all in the warm-up frame)
    // Traffic collisions can move the player after controller updates; finalize moving hierarchies here.
    for (const root of dynamicRoots) root.updateMatrixWorld();

    // Render frame via TSL RenderPipeline (SSR + Bloom)
    if (!warmedUp) {
      // First frame = pipeline warm-up behind the loading screen, for what precompileShaders() can't reach (the shadow
      // map passes): with frustum culling off, every visible material's pipelines compile now instead of stalling the
      // first time the camera turns towards it (one chunk / shadow stand-in per shared pipeline is enough)
      const culled = [];
      const pipelines = new Set();
      // (not on the mobile profile: the whole town in one frame is more than a phone's GPU process takes at once;
      // what the precompile missed builds when it first comes into view)
      if (!QUALITY.mobile) scene.traverseVisible((o) => {
        const pipeline = o.userData.sharesPipelineWith || o;
        if (pipelines.has(pipeline)) return;
        pipelines.add(pipeline);
        if (o.frustumCulled) {
          culled.push(o);
          o.frustumCulled = false;
        }
      });
      renderPipeline.render();
      for (const o of culled) o.frustumCulled = true;
      markInit('warmup');
    }
    renderPipeline.render();
    if (!warmedUp) {
      warmedUp = true;
      markInit('firstFrame');
      // The loading screen stays up until the GPU has got through the first frame (and the pipelines its warm-up
      // compiled), i.e. until the city is actually on screen
      const device = renderer.backend.device;
      Promise.resolve(device && device.queue.onSubmittedWorkDone()).catch(() => {}).then(() => {
        markInit('gpu');
        boot.done();
        console.log(`[init] ${initTimings.join(', ')}`);
        // Spike test hooks (tools/probe.mjs, evidence screenshots)
        window.__slopdavos = {
          ready: true, firstFrameAt: performance.now(), init: initTimings.join(', '),
          backend: renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL fallback',
          scene, renderer, cameraSystem, controllerManager, TELEPORT_LOCATIONS, trafficSystem, swissBuildings: swissStream, trams, rhb, vbd, levelCrossings, trafficSigns,
          teleport(key) { const l = TELEPORT_LOCATIONS[key]; return teleportTo(l.x, l.z, l.heading); },
          teleportXZ(x, z, heading = 0) { return teleportTo(x, z, heading); },
          mode(m) { selectMode(m); },
          camera(id) { selectCamera(id, true); },
          time(id) { selectTime(id); },
          setCamera(px, py, pz, tx, ty, tz) {
            cameraSystem.fixedPos = new THREE.Vector3(px, py, pz); cameraSystem.fixedLook = new THREE.Vector3(tx, ty, tz);
            selectCamera('fixed', true);
          },
          info() { return renderer.info ? { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles } : null; },
          quality: QUALITY, world,
          get gta() { return gta; }, // (the GTA mode: its stand-ins, the taken vehicles, js/gta.js)
          releasedGeometry() { return { ...releasedGeometryStats(), MB: Math.round(releasedMB) }; },
        };
        initTimings = null;
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        audioSystem.ready = true;
        // From now on, every few seconds: the static scenery's vertex data leaves JavaScript once it is on the GPU
        // (js/gpu-memory.js; what has not been drawn yet keeps its arrays until it is)
        releaseStatic();
        setInterval(releaseStatic, 5000);
        setTimeout(buildDeferred, 2000);
        setLoadingProgress(1);
      });
    }

    // Telemetry uses wall time, not the clamped simulation step, so slow frames and high-refresh displays report
    // their actual frame rate (updates DOM every 250ms).
    frameCount++;
    fpsTimer += Math.max(0, rawDt);
    if (fpsTimer >= 0.25) {
      const currentFps = Math.round(frameCount / fpsTimer);
      frameCount = 0;
      fpsTimer = 0;

      const activeEnt = controllerManager.getActiveEntity();
      const mode = controllerManager.activeMode;
      const kmh = Math.round(Math.abs(activeEnt.speed) * 3.6);
      const altitudeM = Math.round(activeEnt.position.y + FRAME.H0); // metres above sea level (m ü. M.)

      if (elFps) {
        elFps.textContent = String(currentFps);
        elFps.className = currentFps >= 50 ? 'fps-ok' : currentFps >= 30 ? 'fps-warn' : 'fps-bad';
      }
      if (elSpeed) elSpeed.textContent = String(kmh);
      if (elSpeedMeter) elSpeedMeter.style.transform = `scaleX(${Math.min(1, kmh / (topSpeedKmh[mode] || 80))})`;
      document.body.classList.toggle('is-boosting', controllerManager.keys.boost && kmh > 0);
      if (elAltitude) elAltitude.textContent = altitudeM.toLocaleString('de-DE');
      // The street corner of the player on the follow cameras, of the camera itself on the scenic ones
      const where = cameraSystem.getActivePreset().category === 'follow' ? activeEnt.position : cameraSystem.currentPos;
      renderLocation(getLocationLabel(where.x, where.z));
    }
  });
}

initApp().catch((error) => {
  console.error(error);
  const status = document.getElementById('loading-status');
  if (status) status.textContent = 'Davos couldn’t open this time. Please try again.';
  document.getElementById('loading-overlay')?.classList.add('has-error');
  const retry = document.getElementById('loading-retry');
  if (retry) {
    retry.hidden = false;
    retry.addEventListener('click', () => window.location.reload());
  }
});

// The installed app (PWA, manifest.webmanifest): the service worker keeps what was loaded for the next start and for
// offline use. Not on the development server, whose edited modules must always be fetched afresh.
if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
  const register = () => navigator.serviceWorker.register('./sw.js').catch(() => {});
  // (the module may finish after the page's load event)
  if (document.readyState === 'complete') register();
  else addEventListener('load', register);
}
