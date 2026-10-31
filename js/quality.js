// js/quality.js
// The device profile: "desktop" (everything) or "mobile" (phones and tablets, small-memory devices). iOS Safari closes
// a tab at ~1-1.5 GB of memory (JS heap and GPU together), so the mobile profile keeps the whole app under ~600 MB:
// lower-resolution orthophotos and atlases over a shorter radius, no high-resolution data, no sharp roof crops, no sun
// shadow maps (their two cascade passes kept a render object and shader state for every caster: ~150 MB of JavaScript
// and a third of the draws; ?qset=shadows:true brings them back, 1024 px a cascade over a shorter range), no
// screen-space reflections or MSAA, fewer trees, cars, pedestrians and skiers, and the winter-only scenery built only
// once winter is switched on.
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
    lazyWinter: false // build the winter-only scenery (pistes, trails) at once, so switching season never stalls
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
    orthoFullNear: 450, orthoFullFar: 650, orthoFullScale: 0.5, orthoSmall: 1 / 8, orthoLoads: 2,
    roofOrthophotos: false,
    sharpRoofs: false, sharpRoofNear: 0, sharpRoofFar: 0,
    treeShare: 0.35,
    treeDistance: 0.6,
    cars: 40, bikes: 60, pedestrians: 90, skiers: 24, crossCountrySkiers: 16,
    atlasScale: 0.5,
    drapeScale: 2,
    lazyWinter: true
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
 * Called once the renderer knows its backend. On the WebGL 2 fallback the mobile profile streams fewer, smaller
 * orthophotos and trees (and never draws shadow maps); the desktop profile keeps its settings.
 */
export function setBackend(isWebGPU) {
  QUALITY.backend = isWebGPU ? 'WebGPU' : 'WebGL 2';
  if (isWebGPU) return QUALITY;
  if (QUALITY.mobile) {
    Object.assign(QUALITY, { shadows: false, orthoFullNear: 350, orthoFullFar: 500, orthoFullScale: 0.5, treeShare: 0.25, treeDistance: 0.5, bloomScale: 0.25 });
  }
  return QUALITY;
}

export { PROFILES as QUALITY_PROFILES };
