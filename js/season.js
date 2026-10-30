import { uniform, float, vec3, mix, max, min, dot, normalize, smoothstep, step, mx_noise_float, positionWorld, normalWorld, normalWorldGeometry, cameraViewMatrix } from 'three/tsl';

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

export function setWinter(on, { animate = true } = {}) {
  target = on ? 1 : 0;
  try { localStorage.setItem(KEY, on ? 'winter' : 'summer'); } catch { /* storage unavailable */ }
  const button = typeof document !== 'undefined' && document.getElementById('btn-winter');
  if (button) { button.classList.toggle('active', !!on); button.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  if (!animate || typeof requestAnimationFrame === 'undefined') { winter.value = target; return; }
  if (!easing) { easing = true; requestAnimationFrame(ease); }
}

// --- Snow on the ground, from the orthophoto's own colours ----------------------------------------------------------------
// `base`: the summer colour (linear). Gentle slopes take the snow, steep ones keep their rock; dark green pixels (the
// larch and spruce woods) stay dark under a dusting; grey, unsaturated pixels (roads, squares, roofs seen from above)
// turn to trodden grey slush. Bluish-white, with a soft drift pattern.
export function snowyGround(base, { slope = normalWorld.y } = {}) {
  const lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  const hi = max(base.r, max(base.g, base.b)), lo = min(base.r, min(base.g, base.b));
  const sat = hi.sub(lo).div(max(hi, 0.002));
  const drift = mx_noise_float(positionWorld.xz.mul(0.045)).mul(0.5).add(0.5);
  const fine = mx_noise_float(positionWorld.xz.mul(0.9)).mul(0.5).add(0.5);
  const snow = mix(vec3(0.72, 0.78, 0.88), vec3(0.9, 0.93, 0.98), drift.mul(0.6).add(fine.mul(0.4)));
  // Cover: full on flat ground, thinning on slopes past ~35°, none on cliffs
  const cover = smoothstep(0.62, 0.86, slope.add(drift.sub(0.5).mul(0.12)));
  const forest = smoothstep(0.12, 0.06, lum).mul(step(base.r, base.g.add(0.02)));
  const paved = smoothstep(0.16, 0.08, sat).mul(smoothstep(0.03, 0.08, lum));
  const open = mix(base, snow, cover);
  const woods = mix(base.mul(0.8), snow, cover.mul(0.22).mul(fine.add(0.3)));
  const slush = mix(base, vec3(0.42, 0.44, 0.47), cover.mul(0.55));
  const winterColour = mix(mix(open, slush, paved), woods, forest);
  return mix(base, winterColour, winter);
}

// Snow on a roof (flat or pitched): white with a little texture, less on the steepest pitches
export function snowyRoof(base, roofMask) {
  const fine = mx_noise_float(positionWorld.mul(0.7)).mul(0.5).add(0.5);
  const snow = mix(vec3(0.74, 0.79, 0.88), vec3(0.92, 0.94, 0.98), fine);
  const lies = smoothstep(0.35, 0.6, normalWorld.y).mul(roofMask);
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
  const packed = mix(vec3(0.58, 0.62, 0.69), vec3(0.8, 0.83, 0.9), fine);
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
