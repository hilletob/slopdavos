import { MINUTES_PER_DAY } from './game-clock.js';
import { sunHeight, sunVector, solarNoon, minuteAtHeight } from './solar.js';

// js/day-cycle.js
// The light through the day, as data and without three.js (tests/game-clock.test.mjs): the sun's position comes from
// js/solar.js, by the clock and the season, and the four tuned presets remain the colour anchors, keyed to the sun's
// height rather than to hours: winter's short low day never quite reaches the midday anchor, summer stays there for hours.
// js/lighting.js and js/post-processing.js read a sample.

// The sky's, the sun's and the camera's settings of each preset; `w*` are the values winter mixes towards (see lighting.js
// and post-processing.js for what they do).
export const TIME_PRESETS = {
  golden: {
    id: 'golden', name: 'Golden Hour · 17:45',
    // Crisp canyon sun slicing across the streets so buildings, cars, trees & pedestrians cast sharp shadows
    sunColor: 0xffca92, sunIntensity: 5.8,
    hemiSky: 0x9abbe6, hemiGround: 0xb89a7a, hemiIntensity: 1.35, // (warm terracotta / limestone bounce)
    skyTop: 0x2c568c, skyHorizon: 0xebd1b5, fogColor: 0xdcc5ae, fogDensity: 0.00024,
    interiorGlow: 0.48, roadWetness: 0.28, envIntensity: 0.35, canyonBounce: 0.52,
    turbidity: 8.0, rayleigh: 2.8, mieCoefficient: 0.008, mieDirectionalG: 0.88, cloudCoverage: 0.36, cloudDensity: 0.38,
    skyExposure: 0.50, nightFactor: 0.0,
    exposure: 1.04, contrast: 1.12, saturation: 1.08, balanceR: 1.045, balanceG: 1.00, balanceB: 0.955, bloom: 0.24, threshold: 1.20,
    wHaze: 0.40, wTurbidity: 2.6, wRayleigh: 2.8, wMieCoefficient: 0.0060, wCloudCoverage: 0.24,
    wExposure: 0.84, wContrast: 1.05, wSaturation: 1.00, wBloomGate: 0.50
  },
  midday: {
    id: 'midday', name: 'Sunny Midday · 13:30',
    sunColor: 0xfff5e8, sunIntensity: 4.6,
    hemiSky: 0xaad2ff, hemiGround: 0xb89678, hemiIntensity: 1.4, // (warm sunlit masonry & pavement bounce)
    skyTop: 0x225ea8, skyHorizon: 0xc8dff5, fogColor: 0xc6dcf2, fogDensity: 0.00018,
    interiorGlow: 0.24, roadWetness: 0.08, envIntensity: 0.30, canyonBounce: 0.58,
    turbidity: 6.5, rayleigh: 2.4, mieCoefficient: 0.006, mieDirectionalG: 0.86, cloudCoverage: 0.32, cloudDensity: 0.35,
    skyExposure: 0.30, nightFactor: 0.0,
    exposure: 1.00, contrast: 1.10, saturation: 1.06, balanceR: 1.015, balanceG: 1.00, balanceB: 0.985, bloom: 0.18, threshold: 1.35,
    wHaze: 0.35, wTurbidity: 2.2, wRayleigh: 1.9, wMieCoefficient: 0.0025, wCloudCoverage: 0.20,
    wExposure: 0.80, wContrast: 1.06, wSaturation: 0.98, wBloomGate: 0.45
  },
  twilight: {
    id: 'twilight', name: 'Blue Hour · 19:15',
    sunColor: 0xffa878, sunIntensity: 3.1,
    hemiSky: 0x4c6ca8, hemiGround: 0x5e5450, hemiIntensity: 1.5,
    skyTop: 0x102248, skyHorizon: 0xb86b6c, fogColor: 0x353c58, fogDensity: 0.00032,
    interiorGlow: 1.25, roadWetness: 0.55, envIntensity: 0.50, canyonBounce: 0.32,
    turbidity: 9.5, rayleigh: 3.4, mieCoefficient: 0.010, mieDirectionalG: 0.90, cloudCoverage: 0.40, cloudDensity: 0.42,
    skyExposure: 0.45, nightFactor: 0.28,
    exposure: 1.06, contrast: 1.10, saturation: 1.08, balanceR: 1.025, balanceG: 0.995, balanceB: 1.015, bloom: 0.28, threshold: 1.05,
    wHaze: 0.75, wTurbidity: 6.5, wRayleigh: 3.4, wMieCoefficient: 0.0080, wCloudCoverage: 0.36,
    wExposure: 0.96, wContrast: 1.02, wSaturation: 1.00, wBloomGate: 0.85
  },
  midnight: {
    id: 'midnight', name: 'Night · 23:00',
    sunColor: 0x8cb0e8, sunIntensity: 1.45, // (the moon)
    hemiSky: 0x263a62, hemiGround: 0x382e36, hemiIntensity: 0.82,
    skyTop: 0x060c1a, skyHorizon: 0x182640, fogColor: 0x0c1424, fogDensity: 0.00036,
    interiorGlow: 1.55, roadWetness: 0.62, envIntensity: 0.30, canyonBounce: 0.18,
    turbidity: 4.0, rayleigh: 1.5, mieCoefficient: 0.004, mieDirectionalG: 0.80, cloudCoverage: 0.22, cloudDensity: 0.25,
    skyExposure: 0.022, nightFactor: 0.86,
    exposure: 1.04, contrast: 1.08, saturation: 1.06, balanceR: 0.985, balanceG: 1.00, balanceB: 1.035, bloom: 0.30, threshold: 1.00,
    wHaze: 0.90, wTurbidity: 3.5, wRayleigh: 1.5, wMieCoefficient: 0.0040, wCloudCoverage: 0.20,
    wExposure: 1.00, wContrast: 1.00, wSaturation: 1.00, wBloomGate: 1.00
  }
};

const hm = (h, m = 0) => h * 60 + m;

// Where each preset sits on the sun's height (degrees); above and below the ends the end holds
const ANCHOR_HEIGHT = { midnight: -12, twilight: -3, golden: 8, midday: 30 };

/** When a named time of day is in a season: the missions' def.time and the debug switches. The presets' own heights where
 *  that reads well; twilight just before the sun goes, so that it still lights the scene as the blue-hour preset did. */
export function presetMinute(id, w) {
  switch (id) {
    case 'midday': return solarNoon(w) + 30;
    case 'golden': return minuteAtHeight(ANCHOR_HEIGHT.golden, w, false);
    case 'twilight': return minuteAtHeight(1.5, w, false);
    case 'evening': return minuteAtHeight(-7, w, false);
    case 'predawn': return minuteAtHeight(-8, w, true);
    case 'morning': return minuteAtHeight(14, w, true);
    case 'midnight': case 'night': return hm(23);
    default: return undefined;
  }
}

const COLOURS = ['sunColor', 'hemiSky', 'hemiGround', 'skyTop', 'skyHorizon', 'fogColor'];
const NUMBERS = Object.keys(TIME_PRESETS.golden).filter((k) => !['id', 'name', ...COLOURS].includes(k));
const COLOUR_NAMES = COLOURS.map((c) => [`${c}R`, `${c}G`, `${c}B`]);

// An anchor as a flat list: the numbers, then each colour's sRGB channels
function flatten(p) {
  const out = NUMBERS.map((k) => p[k]);
  for (const k of COLOURS) { const c = p[k]; out.push(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255); }
  return out;
}
const ANCHORS = ['midnight', 'twilight', 'golden', 'midday'].map((id) => [ANCHOR_HEIGHT[id], flatten(TIME_PRESETS[id])]);

const table = (rows, h) => {
  if (h <= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) {
    if (h <= rows[i][0]) return rows[i - 1][1] + (rows[i][1] - rows[i - 1][1]) * ((h - rows[i - 1][0]) / (rows[i][0] - rows[i - 1][0]));
  }
  return rows[rows.length - 1][1];
};
// The window light and street lamps (uInteriorGlow; the lamps' smoothstep(0.4, 1.1) is halfway at 0.75) switch soon after
// sunset and before sunrise, whichever hour that is in the season: the sun's direct light is gone at the horizon and the moon
// is still faint, so the streets are dark long before civil dusk. -1 deg is halfway through the change
const GLOW = [[-12, 1.55], [-2.5, 1.25], [-0.5, 0.55], [8, 0.48], [30, 0.24]];
// The direct light: the sun down to the horizon, then nothing for a moment, then the moon as the sky darkens. A low sun meets
// the walls head on, and a high one the ground: what matters is the larger of intensity * cos(height) and * sin(height),
// so that the light walls keep their shade at 09:00 as the plazas do at noon.
const SUN_LIGHT = [[0, 0], [2, 1.6], [8, 2.5], [15, 2.6], [30, 2.6], [45, 3.2], [60, 4.6]];
const MOON_LIGHT = [[-12, 1.15], [-6, 0.8], [-1, 0]];
const MOON_COLOUR = TIME_PRESETS.midnight.sunColor; // (whatever the sky does at dusk: an orange moon turned the walls pink)
const MOON_R = ((MOON_COLOUR >> 16) & 255) / 255, MOON_G = ((MOON_COLOUR >> 8) & 255) / 255, MOON_B = (MOON_COLOUR & 255) / 255;
const MIN_LIGHT_SIN = Math.sin((3 * Math.PI) / 180), MIN_MOON_SIN = Math.sin((15 * Math.PI) / 180);

// The sky model (Preetham) at a sun of height h: its zenith is ten times darker at 14 deg than at 65, and 150 times at 1 deg,
// while the glow round its sun grows as the square of what lies in front of it. So its exposure rises as the sun sinks, to
// keep a blue sky at any height (the anchors' values at their heights), and its Mie term (the glow) falls, down to none
// once the sun has gone: a night sky has no sun in it. Under the horizon the model has nothing left to work with, so its
// sun waits at SKY_MIN_SIN, on its true bearing, and the exposure and the night factor do the darkening.
const SKY_EXPOSURE = [[-12, 0.022], [-9, 0.06], [-6, 0.2], [-3, 0.45], [1, 0.9], [3, 0.7], [5, 0.6], [8, 0.5], [14, 0.42], [22, 0.35], [30, 0.30], [45, 0.21], [65, 0.142]];
const SKY_MIE = [[-6, 0], [-1, 0.12], [3, 0.25], [14, 0.3], [30, 0.55], [50, 1]];
const SKY_MIN_SIN = Math.sin(Math.PI / 180);
// The environment map is that sky, so the light it gives must not rise with its exposure (the anchors' values at their heights)
const ENV_LIGHT = [[-12, 0.30], [-3, 0.50], [8, 0.35], [14, 0.32], [30, 0.30], [45, 0.42], [65, 0.58]];
// Round sunset the model's sky turns green, between its orange horizon and a blue it can no longer make: what it leaves out
// is the blue of the ozone, seen when the sun is low (added above the horizon, js/lighting.js)
const TWILIGHT_BLUE = [[-12, 0], [-6, 0.6], [0, 1], [8, 0.6], [20, 0]];

// Raises a unit vector to at least the height whose sine is `minSin`, keeping its compass direction
function lift(v, minSin) {
  if (v.y >= minSin) return;
  const flat = Math.hypot(v.x, v.z) || 1, k = Math.sqrt(1 - minSin * minSin) / flat;
  v.x *= k; v.z *= k; v.y = minSin;
}
const _sun = { x: 0, y: 1, z: 0 };

/** A sample's object, to be reused (nothing is allocated per call) */
export function createSample() {
  const s = { minute: 0, height: 0, sunDisc: 1, skyMie: 1, lightColorR: 1, lightColorG: 1, lightColorB: 1, twilightBlue: 0, presetId: 'golden', sunDirX: 0, sunDirY: 1, sunDirZ: 0, skyDirX: 0, skyDirY: 1, skyDirZ: 0 };
  for (const k of NUMBERS) s[k] = 0;
  for (const names of COLOUR_NAMES) for (const n of names) s[n] = 0;
  return s;
}

/** The preset nearest in mood (the audio's night, anything that only needs a word for the time of day) */
export function presetAt(height) {
  if (height < -8) return 'midnight';
  if (height < -1) return 'twilight';
  if (height < 20) return 'golden';
  return 'midday';
}

/** The light at `minute` (0..1440) of a season's blend `w` into `out` */
export function sampleDay(minute, w = 0, out = createSample()) {
  const h = sunHeight(minute, w);
  let i = 0;
  while (i < ANCHORS.length - 2 && h > ANCHORS[i + 1][0]) i++;
  const ha = ANCHORS[i][0], a = ANCHORS[i][1], hb = ANCHORS[i + 1][0], b = ANCHORS[i + 1][1];
  const t = Math.max(0, Math.min(1, (h - ha) / (hb - ha)));
  for (let k = 0; k < NUMBERS.length; k++) out[NUMBERS[k]] = a[k] + (b[k] - a[k]) * t;
  for (let c = 0; c < COLOURS.length; c++) {
    const at = NUMBERS.length + c * 3, names = COLOUR_NAMES[c];
    out[names[0]] = a[at] + (b[at] - a[at]) * t;
    out[names[1]] = a[at + 1] + (b[at + 1] - a[at + 1]) * t;
    out[names[2]] = a[at + 2] + (b[at + 2] - a[at + 2]) * t;
  }
  out.interiorGlow = table(GLOW, h);

  out.skyExposure = table(SKY_EXPOSURE, h);
  out.skyMie = table(SKY_MIE, h);
  out.envIntensity = table(ENV_LIGHT, h);
  out.twilightBlue = table(TWILIGHT_BLUE, h);

  sunVector(minute, w, _sun);
  const sx = _sun.x, sy = _sun.y, sz = _sun.z;
  lift(_sun, SKY_MIN_SIN);
  out.skyDirX = _sun.x; out.skyDirY = _sun.y; out.skyDirZ = _sun.z;
  // One light: the sun, or from where they are both out the (full) moon, opposite it
  if (h > -0.5) {
    _sun.x = sx; _sun.y = sy; _sun.z = sz;
    lift(_sun, MIN_LIGHT_SIN);
    out.sunIntensity = table(SUN_LIGHT, h);
    out.lightColorR = out.sunColorR; out.lightColorG = out.sunColorG; out.lightColorB = out.sunColorB;
  } else {
    _sun.x = -sx; _sun.y = -sy; _sun.z = -sz;
    lift(_sun, MIN_MOON_SIN);
    out.sunIntensity = table(MOON_LIGHT, h);
    out.lightColorR = MOON_R; out.lightColorG = MOON_G; out.lightColorB = MOON_B;
  }
  out.sunDirX = _sun.x; out.sunDirY = _sun.y; out.sunDirZ = _sun.z;

  // (the disc goes as it reaches the horizon, and sits there at the sky model's lowest sun)
  const disc = Math.max(0, Math.min(1, h / 2));
  out.sunDisc = disc * disc * (3 - 2 * disc);
  out.minute = minute;
  out.height = h;
  out.presetId = presetAt(h);
  return out;
}

// The pistes' wear by the time of day (js/groom-map.js WEAR_AT at its anchors): skier hours since the runs opened at 09:00,
// and the night shift has groomed everything by 23:00
const WEAR = [[0, 0], [hm(9), 0], [hm(13, 30), 4.5], [hm(17, 45), 7.5], [hm(19, 15), 8], [hm(22), 8], [hm(23), 0], [MINUTES_PER_DAY, 0]];
export function wearHoursAt(minute) {
  for (let i = 1; i < WEAR.length; i++) {
    if (minute <= WEAR[i][0]) {
      const ta = WEAR[i - 1][0], a = WEAR[i - 1][1], tb = WEAR[i][0], b = WEAR[i][1];
      return a + (b - a) * ((minute - ta) / (tb - ta));
    }
  }
  return 0;
}
