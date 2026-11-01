// js/quality.js
// The device profile: "desktop" (everything) or "mobile" (phones and tablets, small-memory devices). iOS Safari closes
// a tab at ~1-1.5 GB of memory (JS heap and GPU together), so the mobile profile keeps the whole app under ~600 MB:
// lower-resolution orthophotos and atlases over a shorter radius, no high-resolution data, no sharp roof crops, no sun
// shadow maps (their two cascade passes kept a render object and shader state for every caster: ~150 MB of JavaScript
// and a third of the draws; ?qset=shadows:true brings them back, 1024 px a cascade over a shorter range), no
// screen-space reflections or MSAA, fewer trees, cars, pedestrians and skiers, and the winter-only scenery built only
// once winter is switched on.
// "Mobile lite" (an iPhone 13 closed the tab while the shaders compiled, already near its limit before): the static
// meshes' vertices shared and their normals in bytes (js/gpu-memory.js compactStaticGeometry, ~110 MB of vertex data
// down to ~60 MB), the precompile limited to the start view (frustum culling off had uploaded the whole valley's
// vertices at once), the relief beyond the map in its coarser levels only, a quarter of the forest, atlases at a
// quarter, smaller clustered-light lists. In Chrome's iPhone emulation: ~325 MB (JS heap + GPU) at the start instead of
// ~540 MB, ~245 MB before the compile instead of ~430 MB.
//
// Chosen automatically (touch screen with a coarse pointer and a small screen, iOS / iPadOS, Android, or
// navigator.deviceMemory <= 4 GB); `?quality=mobile` or `?quality=desktop` in the URL overrides it. The WebGL 2
// fallback (no WebGPU) is slower and keeps more copies in memory: setBackend() makes the mobile profile sparer still.

const PROFILES = {
  desktop: {
    name: 'desktop',
    mobile: false,
    pixelRatio: 1,
    antialias: true,
    ssr: true,
    bloomScale: 0.5,
    shadows: true,
    shadowMapSize: 0, // 0: by the device (lighting.js: 3072, or 2048 where textures can't be that large)
    shadowFarMax: 720, // the sun's shadow range (m) at the most (from the air); 200 m at street level
    hires: true, // the optional high-resolution orthophotos and roof crops (npm run data:hires), when present
    orthoFullNear: 1200, orthoFullFar: 1600, orthoFullScale: 1, orthoSmall: 1 / 8, orthoLoads: 3,
    roofOrthophotos: true, // the buildings' roofs drape the orthophoto of their terrain chunk
    sharpRoofs: true, sharpRoofNear: 420, sharpRoofFar: 700, // the sharp roof crops (data/roofs) near the camera
    treeShare: 1, // share of the forest's trees planted (the town's are always)
    treeDistance: 1, // scale of the trees' drawing distances
    cars: 100, bikes: 225, pedestrians: 260, skiers: 72, crossCountrySkiers: 48,
    atlasScale: 1, // the canvas atlases (shop signs, road signs)
    drapeScale: 1, // overlays draped on the terrain (golf, rails, trails) split down to edges this much longer (at most 8 m)
    lazyWinter: false, // build the winter-only scenery (pistes, trails) at once, so switching season never stalls
    buildingLoads: 8, buildingNear: 450, // swissBUILDINGS3D tiles parsed at once, and the radius loaded before the start
    precompile: true, // compile the pipelines behind the loading screen (?qset=precompile:false: when first seen)
    forceWebGL: false, // ?qset=forceWebGL:true: the WebGL 2 backend even where WebGPU is available
    releaseCpu: true, // drop the CPU copies of uploaded static geometry (?qset=releaseCpu:false keeps them)
    compactGeometry: false, // share the static meshes' equal vertices and keep their normals in bytes (js/gpu-memory.js)
    precompileAll: true, // precompile every pipeline of the town (frustum culling off); else only what the start view shows
    clusterLights: [256, 32, 28, 48], // ClusteredLighting: lights at most, tile px, depth slices, lights per cluster
    clusteredLighting: true, // the street lamps, shop and vehicle lights as real lights (else emissive glow and sprites only)
    simpleMaterials: false, // the biggest procedural materials (landmarks, water, ...) in a plainer, much shorter shader
    shaderLog: false, // log every shader module in the start-up breadcrumbs (always on the mobile profile; js/gpu-diagnostics.js)
    skip: '', // ?qset=skip:landmarks+golf (or skip:all): whole systems left out, to find what breaks a device (see SKIP_NAMES)
    surroundingsFull: true, // the relief out to the Alps in full detail near by (else its coarser levels only)
    treeAtlas: 2048, // the leaf atlas (px a side, 4 x 4 tiles)
    facadeAtlas: 2048, // the photographed houses' facade atlas (px a side; decoded at this size at most)
    deferScenery: false, // build the golf course and the streams after the first frame (their build's garbage apart)
    worldRadius: 0, // m: the streets, sidewalks, markings and draped overlays only this far from the start (0: everywhere)
  },
  mobile: {
    name: 'mobile',
    mobile: true,
    pixelRatio: 1,
    antialias: false,
    ssr: false,
    bloomScale: 0.25,
    shadows: false,
    shadowMapSize: 1024,
    shadowFarMax: 240,
    hires: false,
    orthoFullNear: 450, orthoFullFar: 650, orthoFullScale: 0.5, orthoSmall: 1 / 8, orthoLoads: 1,
    roofOrthophotos: false,
    sharpRoofs: false, sharpRoofNear: 0, sharpRoofFar: 0,
    treeShare: 0.25,
    treeDistance: 0.6,
    cars: 40, bikes: 60, pedestrians: 90, skiers: 24, crossCountrySkiers: 16,
    atlasScale: 0.25,
    drapeScale: 2,
    lazyWinter: true,
    buildingLoads: 2, buildingNear: 250, // (each tile peaks at tens of MB while parsed: fewer at once on a phone)
    precompile: false, // (on an iPhone the precompile killed the GPU process: the pipelines compile when first seen)
    forceWebGL: false, // ?qset=forceWebGL:true: the WebGL 2 backend even where WebGPU is available
    releaseCpu: true, // drop the CPU copies of uploaded static geometry (?qset=releaseCpu:false keeps them)
    compactGeometry: true,
    precompileAll: false, // (frustum culling off uploaded every vertex of the valley at once: only the start view's)
    clusterLights: [64, 64, 16, 16],
    // (an iPhone 13's GPU process died on a shader module at the start: no clustered light loop in every lit shader,
    // and the biggest procedural materials in short shaders; ?qset=clusteredLighting:true,simpleMaterials:false)
    clusteredLighting: false,
    simpleMaterials: true,
    shaderLog: true,
    skip: '',
    surroundingsFull: false,
    treeAtlas: 512,
    facadeAtlas: 512,
    deferScenery: true,
    // (an iPhone 13 closed the tab while the town's ground layers were built, even with every other system left out:
    // ~6.8 GB of short-lived arrays for the whole valley, which Safari's garbage collector let pile up to ~2.5 GB. Only
    // the town within this radius of the start gets its streets, sidewalks, curbs, markings and draped overlays; beyond
    // it, the terrain with its orthophoto. A teleport farther than the radius reloads the town around the destination.)
    worldRadius: 1300,
  }
};

/** Why the profile was chosen (for the console and the tests) */
export function detectProfile(env = globalThis) {
  const nav = env.navigator || {};
  const loc = env.location;
  const forced = loc ? new URLSearchParams(loc.search).get('quality') : null;
  if (forced === 'mobile' || forced === 'desktop') return { name: forced, reason: `?quality=${forced}` };
  const ua = nav.userAgent || '';
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1); // (iPadOS asks for the desktop site)
  if (iOS) return { name: 'mobile', reason: 'iOS' };
  if (/Android/.test(ua)) return { name: 'mobile', reason: 'Android' };
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return { name: 'mobile', reason: `deviceMemory ${nav.deviceMemory} GB` };
  const coarse = typeof env.matchMedia === 'function' && env.matchMedia('(pointer: coarse)').matches && !env.matchMedia('(any-pointer: fine)').matches;
  const scr = env.screen || {};
  const small = Math.min(scr.width || Infinity, scr.height || Infinity) <= 900;
  if (coarse && small) return { name: 'mobile', reason: 'touch screen' };
  return { name: 'desktop', reason: 'default' };
}

const detected = detectProfile();

/** The active profile's settings (one shared object: read it when building, it doesn't change afterwards) */
export const QUALITY = { ...PROFILES[detected.name], reason: detected.reason, backend: 'WebGPU' };

// Single settings can be overridden for testing: ?qset=ssr:true,shadowMapSize:2048
if (globalThis.location) {
  for (const pair of (new URLSearchParams(globalThis.location.search).get('qset') || '').split(',')) {
    const [key, raw] = pair.split(':');
    if (!(key in QUALITY) || raw === undefined) continue;
    QUALITY[key] = raw === 'true' ? true : raw === 'false' ? false : Number.isFinite(+raw) ? +raw : raw;
  }
}

/**
 * The systems ?qset=skip:a+b+c leaves out (a bisect switch for devices that crash at the start: "+" or spaces between
 * the names; "all" leaves out every one of them, which keeps the terrain with its orthophotos, the player and the camera).
 */
export const SKIP_NAMES = ['buildings', 'landmarks', 'detailhouses', 'golf', 'parking', 'shops', 'streams', 'signs', 'bergbahnen',
  'rhb', 'traffic', 'pedestrians', 'trees', 'details', 'winter', 'snowfall', 'surroundings', 'lights', 'postfx', 'water'];

/** The skipped systems' names (a Set; 'all' expanded) */
export function parseSkip(value) {
  const names = String(value || '').toLowerCase().split(/[\s+|;]+/).filter(Boolean);
  return new Set(names.includes('all') ? SKIP_NAMES : names.filter((n) => SKIP_NAMES.includes(n)));
}

export const SKIP = parseSkip(QUALITY.skip);
/** Whether the system is left out (?qset=skip:...) */
export const skipped = (name) => SKIP.has(name);
/** The skip setting as shown on the loading screen and in the breadcrumbs ('' when nothing is skipped) */
export const skipLabel = () => (SKIP.size === SKIP_NAMES.length ? 'all' : [...SKIP].join('+'));
if (SKIP.has('lights')) QUALITY.clusteredLighting = false;

/**
 * Called once the renderer knows its backend. On the WebGL 2 fallback the mobile profile streams fewer, smaller
 * orthophotos and trees (and never draws shadow maps); the desktop profile keeps its settings.
 */
export function setBackend(isWebGPU) {
  QUALITY.backend = isWebGPU ? 'WebGPU' : 'WebGL 2';
  if (isWebGPU) return QUALITY;
  if (QUALITY.mobile) {
    Object.assign(QUALITY, { shadows: false, orthoFullNear: 350, orthoFullFar: 500, orthoFullScale: 0.5, treeShare: 0.18, treeDistance: 0.5, bloomScale: 0.25 });
  }
  return QUALITY;
}

/**
 * The part of the valley built in detail (QUALITY.worldRadius around the start; everywhere when 0): js/main.js sets
 * its centre before building, the builders ask inWorld() / boxInWorld() for what to leave out.
 */
export const WORLD = { x: 0, z: 0, radius: Infinity };
export function setWorldCenter(x, z) {
  WORLD.x = x; WORLD.z = z;
  WORLD.radius = QUALITY.worldRadius > 0 ? QUALITY.worldRadius : Infinity;
}
/** Whether (x, z) lies within the detailed part of the valley (`pad` metres beyond its edge too) */
export const inWorld = (x, z, pad = 0) => WORLD.radius === Infinity || Math.hypot(x - WORLD.x, z - WORLD.z) <= WORLD.radius + pad;
/** Whether the box reaches into the detailed part of the valley */
export function boxInWorld(minX, maxX, minZ, maxZ, pad = 0) {
  if (WORLD.radius === Infinity) return true;
  const dx = Math.max(minX - WORLD.x, 0, WORLD.x - maxX), dz = Math.max(minZ - WORLD.z, 0, WORLD.z - maxZ);
  return Math.hypot(dx, dz) <= WORLD.radius + pad;
}
/** Whether the segment a-b ({x, z}) comes within the detailed part of the valley */
export function segmentInWorld(ax, az, bx, bz, pad = 0) {
  if (WORLD.radius === Infinity) return true;
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((WORLD.x - ax) * dx + (WORLD.z - az) * dz) / L2));
  return Math.hypot(ax + t * dx - WORLD.x, az + t * dz - WORLD.z) <= WORLD.radius + pad;
}

export { PROFILES as QUALITY_PROFILES };
