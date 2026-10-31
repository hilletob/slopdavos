import { uniform, float, vec3, mix, max, min, dot, normalize, smoothstep, step, mx_noise_float, positionWorld, normalWorld, normalWorldGeometry, cameraViewMatrix, cameraPosition } from 'three/tsl';

// The season: summer (0) or winter (1), one shared uniform that the ground, roof, surroundings and lake materials mix
// towards snow and ice by. Toggled with the snowflake button in the top bar (or ?winter in the URL), remembered per
// viewer, and eased over ~1.5 s so that the snow settles rather than pops.

const KEY = 'slopdavos-season';
export const winter = uniform(0);
let target = 0, last = 0, easing = false;

function ease(now) {
  const dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  const v = winter.value + Math.sign(target - winter.value) * dt / 1.5;
  winter.value = target > winter.value ? Math.min(target, v) : Math.max(target, v);
  if (winter.value !== target) requestAnimationFrame(ease);
  else { easing = false; last = 0; }
}

export function isWinter() { return target === 1; }

// Called with the new season (true: winter) whenever it is switched (js/main.js builds the winter-only scenery on demand)
const listeners = new Set();
export function onSeasonChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setWinter(on, { animate = true } = {}) {
  const changed = target !== (on ? 1 : 0);
  target = on ? 1 : 0;
  if (changed) for (const fn of [...listeners]) { try { fn(!!on); } catch (error) { console.warn('[season]', error); } }
  try { localStorage.setItem(KEY, on ? 'winter' : 'summer'); } catch { /* storage unavailable */ }
  const button = typeof document !== 'undefined' && document.getElementById('btn-winter');
  if (button) { button.classList.toggle('active', !!on); button.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  if (!animate || typeof requestAnimationFrame === 'undefined') { winter.value = target; return; }
  if (!easing) { easing = true; requestAnimationFrame(ease); }
}

// --- Snow on the ground, from the orthophoto's own colours ----------------------------------------------------------------
// `base`: the summer colour (linear). A closed snow cover from the valley floor up (Davos lies at 1560 m): only the
// cliffs keep their rock, and the steepest slopes thin out; under the larch and spruce woods (dark green pixels) the
// snow lies a little greyer between the trees, which stand dark on it (js/trees.js); grey, unsaturated pixels in the
// valley (yards, squares, roofs seen from above) turn to trodden grey slush. Higher up (`snowAltitude`, from ~1750 m to
// ~2100 m) the snow lies deeper: steeper slopes hold it, the woods' floor is white, nothing is trodden. Only faintly
// bluish white, with a soft drift pattern and a little of the photograph's own light and shade kept for its relief: the
// shade and the sky light add the blue, and brighter, bluer snow rode the tone mapper's shoulder into a milky flat
// white in the sun.
export function snowyGround(base, { slope = normalWorld.y } = {}) {
  const lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  const hi = max(base.r, max(base.g, base.b)), lo = min(base.r, min(base.g, base.b));
  const sat = hi.sub(lo).div(max(hi, 0.002));
  const drift = mx_noise_float(positionWorld.xz.mul(0.045)).mul(0.5).add(0.5);
  const fine = mx_noise_float(positionWorld.xz.mul(0.9)).mul(0.5).add(0.5);
  const high = snowAltitude(drift);
  const relief = mix(float(0.8), float(1.03), smoothstep(0.02, 0.3, lum)); // (the photo's light and shade)
  const snow = mix(vec3(0.74, 0.78, 0.85), vec3(0.88, 0.9, 0.94), drift.mul(0.6).add(fine.mul(0.4))).mul(relief);
  // Cover: full up to ~42° (~48° on the wooded slopes higher up), thinning beyond, none on the cliffs. Above the tree
  // line (`alpine`, ~2150-2350 m) the wind strips the ridges and rock faces: full only up to ~35°, gone past ~50°, in
  // bands and gullies (`bands`, a noise stretched along the contours), and the photo's dark grey rock (not its green turf) shows through in places
  const alpine = smoothstep(560, 800, positionWorld.y.add(drift.sub(0.5).mul(200)));
  const bands = mx_noise_float(vec3(positionWorld.x.mul(0.012), positionWorld.y.mul(0.07), positionWorld.z.mul(0.012))).mul(0.5).add(0.5);
  const lowEdge = mix(mix(float(0.5), float(0.42), high), float(0.64), alpine);
  const highEdge = mix(mix(float(0.74), float(0.66), high), float(0.84), alpine);
  const rocky = smoothstep(0.16, 0.07, lum).mul(smoothstep(0.45, 0.2, sat)).mul(alpine).mul(smoothstep(0.35, 0.65, bands)).mul(0.75);
  const cover = smoothstep(lowEdge, highEdge, slope.add(drift.sub(0.5).mul(0.12)).add(bands.sub(0.5).mul(alpine).mul(0.16))).mul(float(1).sub(rocky));
  // (the woods end at the tree line, ~2100-2250 m: dark pixels above it are shade and dwarf pine, snowed under)
  const forest = smoothstep(0.12, 0.06, lum).mul(step(base.r, base.g.add(0.02))).mul(smoothstep(720, 480, positionWorld.y));
  const paved = smoothstep(0.16, 0.08, sat).mul(smoothstep(0.03, 0.08, lum)).mul(smoothstep(320, 160, positionWorld.y));
  const open = mix(base, snow, cover.max(fine.mul(0.15).add(0.12).mul(float(1).sub(alpine.mul(0.5))))); // (a dusting in the cliffs' cracks)
  // (near the camera the 3D trees stand dark on a white floor; further off, where they thin out, the photo's canopy
  // keeps the woods darker than the open snow around)
  const near = smoothstep(2600, 900, positionWorld.sub(cameraPosition).length());
  const underTrees = mix(mix(float(0.3), float(0.55), high), mix(float(0.62), float(0.85), high), near);
  const woods = mix(base.mul(0.7), snow.mul(0.86), cover.mul(underTrees).mul(fine.mul(0.4).add(0.7)).min(1));
  const slush = mix(base, vec3(0.42, 0.44, 0.47), cover.mul(0.55));
  const winterColour = mix(mix(open, slush, paved), woods, forest);
  return mix(base, winterColour, winter);
}

// How deep the winter lies by altitude: 0 in the valley, 1 from ~2100 m, a ragged band in between (`drift`: optional
// 0..1 noise to break the line further)
export function snowAltitude(drift = float(0.5)) {
  const wobble = mx_noise_float(positionWorld.xz.mul(0.004)).mul(90).add(drift.sub(0.5).mul(160));
  return smoothstep(200, 550, positionWorld.y.add(wobble));
}

// Snow on a roof (flat or pitched), or on a tree's boughs: white with a little texture, less on the steepest pitches;
// higher up (snowAltitude) it lies deeper, on steeper pitches and over more of the boughs
export function snowyRoof(base, roofMask) {
  const fine = mx_noise_float(positionWorld.mul(0.7)).mul(0.5).add(0.5);
  const snow = mix(vec3(0.76, 0.79, 0.85), vec3(0.89, 0.91, 0.94), fine);
  const high = snowAltitude();
  const lies = smoothstep(mix(float(0.35), float(0.15), high), mix(float(0.6), float(0.45), high), normalWorld.y)
    .mul(float(roofMask).mul(high.mul(0.45).add(1)).min(1));
  return mix(base, snow, lies.mul(winter));
}

// A water material frozen over in winter where it lies still: the lakes (at or above the Davosersee's level, the
// frame's y = 0) take snowy grey ice; the Landwasser below the lake keeps running. Wraps the material's nodes in place.
export function freezeWater(material, { all = false } = {}) {
  const still = all ? float(1) : smoothstep(-1.5, -0.5, positionWorld.y);
  const ice = winter.mul(still);
  const blotch = mx_noise_float(positionWorld.xz.mul(0.08)).mul(0.5).add(0.5);
  const iceColour = mix(vec3(0.42, 0.47, 0.52), vec3(0.8, 0.84, 0.9), blotch);
  if (material.colorNode) material.colorNode = mix(material.colorNode, iceColour, ice);
  if (material.roughnessNode) material.roughnessNode = mix(material.roughnessNode, float(0.55), ice);
  if (material.metalnessNode) material.metalnessNode = mix(material.metalnessNode, float(0), ice);
  // (the ice lies flat: the waves' normal fades out)
  if (material.normalNode) material.normalNode = normalize(mix(material.normalNode, cameraViewMatrix.transformDirection(normalWorldGeometry), ice));
  if (material.emissiveNode) material.emissiveNode = material.emissiveNode.mul(float(1).sub(ice));
  material.needsUpdate = true;
  return material;
}

// Streets in winter (the engine's own road, sidewalk, plaza and curb materials; wraps the nodes in place): packed snow
// worn into darker, wet slush in patches and along the wheel paths; `cover` how much of the surface lies under snow,
// `top` to keep the snow to the upward faces (curbs). Road markings: `paint` fades them out under the snow instead.
export function snowyStreet(material, { cover = 0.75, top = false, paint = false } = {}) {
  if (paint) {
    if (material.opacityNode) material.opacityNode = material.opacityNode.mul(float(1).sub(winter.mul(0.85)));
    material.needsUpdate = true;
    return material;
  }
  if (!material.colorNode) return material;
  const patches = mx_noise_float(positionWorld.xz.mul(0.12)).mul(0.5).add(0.5);
  const ruts = mx_noise_float(positionWorld.xz.mul(0.9)).mul(0.5).add(0.5);
  const fine = mx_noise_float(positionWorld.xz.mul(2.3)).mul(0.5).add(0.5);
  const packed = mix(vec3(0.6, 0.62, 0.66), vec3(0.8, 0.82, 0.86), fine);
  const slush = mix(vec3(0.16, 0.17, 0.19), vec3(0.3, 0.31, 0.33), fine);
  // Snow where the patches rise above 1 - cover; slush between
  const snowy = smoothstep(float(1 - cover).sub(0.12), float(1 - cover).add(0.12), patches.mul(0.7).add(ruts.mul(0.3)));
  const lies = top ? smoothstep(0.5, 0.8, normalWorld.y) : float(1);
  const amount = winter.mul(lies);
  const surface = mix(slush, packed, snowy);
  material.colorNode = mix(material.colorNode, surface, amount.mul(snowy.mul(0.6).add(0.4)));
  if (material.roughnessNode) material.roughnessNode = mix(material.roughnessNode, mix(float(0.35), float(0.85), snowy), amount);
  material.needsUpdate = true;
  return material;
}

// Initial season: ?winter / ?summer in the URL, else the viewer's last choice; the button toggles it
function initial() {
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search);
    if (q.has('winter')) return true;
    if (q.has('summer')) return false;
  }
  try { return localStorage.getItem(KEY) === 'winter'; } catch { return false; }
}

if (typeof document !== 'undefined') {
  const wire = () => {
    const button = document.getElementById('btn-winter');
    if (button) button.addEventListener('click', () => setWinter(!isWinter()));
    setWinter(initial(), { animate: false });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true });
  else wire();
}
