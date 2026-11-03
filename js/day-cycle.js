import { MINUTES_PER_DAY } from './game-clock.js';

// js/day-cycle.js
// The light through the day, as data and without three.js (tests/day-cycle.test.mjs): the four tuned presets remain the
// anchors (at their own times every value is exactly the preset's), keyframes between them carry the dawn, the sunset and
// the moon; `sampleDay` interpolates all of it. js/lighting.js and js/post-processing.js read a sample.

const dir = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };

// The sky's, the sun's and the camera's settings of each preset; `w*` are the values winter mixes towards (see lighting.js
// and post-processing.js for what they do).
export const TIME_PRESETS = {
  golden: {
    id: 'golden', name: 'Golden Hour · 17:45',
    // Crisp canyon sun slicing across the streets so buildings, cars, trees & pedestrians cast sharp shadows
    sunDir: dir(-0.44, 0.58, -0.68), sunColor: 0xffca92, sunIntensity: 5.8,
    hemiSky: 0x9abbe6, hemiGround: 0xc88a62, hemiIntensity: 1.48, // (warm terracotta / limestone bounce)
    skyTop: 0x2c568c, skyHorizon: 0xebd1b5, fogColor: 0xdcc5ae, fogDensity: 0.00024,
    interiorGlow: 0.48, roadWetness: 0.28, envIntensity: 0.54, canyonBounce: 0.52,
    turbidity: 8.0, rayleigh: 2.8, mieCoefficient: 0.008, mieDirectionalG: 0.88, cloudCoverage: 0.36, cloudDensity: 0.38,
    skyExposure: 0.148, nightFactor: 0.0,
    exposure: 1.04, contrast: 1.12, saturation: 1.08, balanceR: 1.045, balanceG: 1.00, balanceB: 0.955, bloom: 0.24, threshold: 1.20,
    wHaze: 0.40, wTurbidity: 2.6, wRayleigh: 2.2, wMieCoefficient: 0.0030, wCloudCoverage: 0.24,
    wExposure: 0.84, wContrast: 1.05, wSaturation: 1.00, wBloomGate: 0.50
  },
  midday: {
    id: 'midday', name: 'Sunny Midday · 13:30',
    sunDir: dir(-0.34, 0.82, -0.46), sunColor: 0xfff5e8, sunIntensity: 6.6,
    hemiSky: 0xaad2ff, hemiGround: 0xb89678, hemiIntensity: 1.58, // (warm sunlit masonry & pavement bounce)
    skyTop: 0x225ea8, skyHorizon: 0xc8dff5, fogColor: 0xc6dcf2, fogDensity: 0.00018,
    interiorGlow: 0.24, roadWetness: 0.08, envIntensity: 0.58, canyonBounce: 0.58,
    turbidity: 6.5, rayleigh: 2.4, mieCoefficient: 0.006, mieDirectionalG: 0.86, cloudCoverage: 0.32, cloudDensity: 0.35,
    skyExposure: 0.142, nightFactor: 0.0,
    exposure: 1.00, contrast: 1.10, saturation: 1.06, balanceR: 1.015, balanceG: 1.00, balanceB: 0.985, bloom: 0.18, threshold: 1.35,
    wHaze: 0.35, wTurbidity: 2.2, wRayleigh: 1.9, wMieCoefficient: 0.0025, wCloudCoverage: 0.20,
    wExposure: 0.80, wContrast: 1.06, wSaturation: 0.98, wBloomGate: 0.45
  },
  twilight: {
    id: 'twilight', name: 'Blue Hour · 19:15',
    sunDir: dir(-0.52, 0.36, -0.77), sunColor: 0xff9466, sunIntensity: 3.1,
    hemiSky: 0x4c6ca8, hemiGround: 0x6e5048, hemiIntensity: 0.85,
    skyTop: 0x102248, skyHorizon: 0xb86b6c, fogColor: 0x353c58, fogDensity: 0.00032,
    interiorGlow: 1.25, roadWetness: 0.55, envIntensity: 0.36, canyonBounce: 0.32,
    turbidity: 9.5, rayleigh: 3.4, mieCoefficient: 0.010, mieDirectionalG: 0.90, cloudCoverage: 0.40, cloudDensity: 0.42,
    skyExposure: 0.115, nightFactor: 0.28,
    exposure: 1.06, contrast: 1.10, saturation: 1.08, balanceR: 1.025, balanceG: 0.995, balanceB: 1.015, bloom: 0.28, threshold: 1.05,
    wHaze: 0.75, wTurbidity: 6.5, wRayleigh: 3.0, wMieCoefficient: 0.0080, wCloudCoverage: 0.36,
    wExposure: 0.96, wContrast: 1.02, wSaturation: 1.00, wBloomGate: 0.85
  },
  midnight: {
    id: 'midnight', name: 'Night · 23:00',
    sunDir: dir(0.42, 0.68, -0.60), sunColor: 0x8cb0e8, sunIntensity: 1.45, // (the moon)
    hemiSky: 0x263a62, hemiGround: 0x382e36, hemiIntensity: 0.72,
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

// When each time of day is (the missions' def.time too: 'morning' and 'evening' have no preset of their own, the day's
// keyframes carry them)
export const TIME_MINUTES = { golden: hm(17, 45), midday: hm(13, 30), twilight: hm(19, 15), midnight: hm(23), morning: hm(9), evening: hm(20) };

const COLOURS = ['sunColor', 'hemiSky', 'hemiGround', 'skyTop', 'skyHorizon', 'fogColor'];
const NUMBERS = Object.keys(TIME_PRESETS.golden).filter((k) => !['id', 'name', 'sunDir', ...COLOURS].includes(k));

// A keyframe as a flat list: the numbers, the sun's direction, then each colour's sRGB channels
function flatten(p) {
  const out = NUMBERS.map((k) => p[k]);
  out.push(...p.sunDir);
  for (const k of COLOURS) { const c = p[k]; out.push(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255); }
  return out;
}
const DIR_AT = NUMBERS.length;
const COLOUR_AT = DIR_AT + 3;
const mixList = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const withDir = (list, d, sunIntensity = null) => {
  const out = list.slice();
  out[DIR_AT] = d[0]; out[DIR_AT + 1] = d[1]; out[DIR_AT + 2] = d[2];
  if (sunIntensity !== null) out[NUMBERS.indexOf('sunIntensity')] = sunIntensity;
  return out;
};
const GOLDEN = flatten(TIME_PRESETS.golden), MIDDAY = flatten(TIME_PRESETS.midday), TWILIGHT = flatten(TIME_PRESETS.twilight), MIDNIGHT = flatten(TIME_PRESETS.midnight);
const mirrored = (p) => dir(-p.sunDir[0], p.sunDir[1], p.sunDir[2]);

// The day: the sun rises in the east (+x; the frame's x is east) and sets in the west, through the presets' own positions,
// which stand high in the north-west since they were tuned for the street canyons. The moon crosses the same way. The sun
// hands over to the moon where both are out (intensity 0), so that the shadows never sweep across the sky.
const DUSK = mixList(TWILIGHT, MIDNIGHT, 0.45);
const LATE_DUSK = mixList(TWILIGHT, MIDNIGHT, 0.8);
const PRE_DAWN = mixList(MIDNIGHT, TWILIGHT, 0.4);
const KEYFRAMES = [
  [hm(4, 30), withDir(MIDNIGHT, dir(-0.62, 0.22, -0.76), 1.1)],
  [hm(5, 15), withDir(PRE_DAWN, dir(-0.7, 0.06, -0.71), 0)], // the moon sets ...
  [hm(5, 16), withDir(PRE_DAWN, dir(0.6, 0.03, -0.8), 0)], // ... before the sun comes up
  [hm(6, 30), withDir(TWILIGHT, mirrored(TIME_PRESETS.twilight))],
  [hm(8), withDir(GOLDEN, mirrored(TIME_PRESETS.golden))],
  [hm(10, 30), withDir(mixList(GOLDEN, MIDDAY, 0.7), dir(0.08, 0.76, -0.64))],
  [TIME_MINUTES.midday, MIDDAY],
  [TIME_MINUTES.golden, GOLDEN],
  [TIME_MINUTES.twilight, TWILIGHT],
  [hm(20, 30), withDir(DUSK, dir(-0.6, 0.05, -0.8), 0.6)],
  [hm(20, 45), withDir(LATE_DUSK, dir(-0.6, 0.02, -0.8), 0)], // the sun is gone ...
  [hm(20, 46), withDir(LATE_DUSK, dir(0.7, 0.1, -0.7), 0)], // ... and the moon rises (quickly: no dark gap between them)
  [hm(21, 30), withDir(mixList(LATE_DUSK, MIDNIGHT, 0.4), dir(0.62, 0.36, -0.7), 1)],
  [TIME_MINUTES.midnight, MIDNIGHT]
];

/** A sample's object, to be reused (nothing is allocated per call) */
export function createSample() {
  const s = { minute: 0, presetId: 'golden', sunDirX: 0, sunDirY: 1, sunDirZ: 0 };
  for (const k of NUMBERS) s[k] = 0;
  for (const k of COLOURS) { s[`${k}R`] = 0; s[`${k}G`] = 0; s[`${k}B`] = 0; }
  return s;
}

/** The preset nearest in mood (the audio's night, anything that only needs a word for the time of day) */
export function presetAt(minute) {
  if (minute >= hm(20, 30) || minute < hm(5, 30)) return 'midnight';
  if (minute >= hm(18, 30) || minute < hm(7)) return 'twilight';
  if (minute >= hm(15, 30) || minute < hm(10)) return 'golden';
  return 'midday';
}

const COLOUR_NAMES = COLOURS.map((c) => [`${c}R`, `${c}G`, `${c}B`]);

/** The light at `minute` (0..1440) into `out` */
export function sampleDay(minute, out = createSample()) {
  const n = KEYFRAMES.length;
  let i = n - 1; // the keyframe at or before the minute (before the first: the last, of the day before)
  for (let k = 0; k < n; k++) { if (KEYFRAMES[k][0] <= minute) i = k; else break; }
  const ta = KEYFRAMES[i][0], a = KEYFRAMES[i][1];
  const next = KEYFRAMES[(i + 1) % n];
  const tb = next[0], b = next[1];
  const span = (tb - ta + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const t = ((minute - ta + MINUTES_PER_DAY) % MINUTES_PER_DAY) / span;
  for (let k = 0; k < NUMBERS.length; k++) out[NUMBERS[k]] = a[k] + (b[k] - a[k]) * t;
  const dx = a[DIR_AT] + (b[DIR_AT] - a[DIR_AT]) * t, dy = a[DIR_AT + 1] + (b[DIR_AT + 1] - a[DIR_AT + 1]) * t, dz = a[DIR_AT + 2] + (b[DIR_AT + 2] - a[DIR_AT + 2]) * t;
  const l = Math.hypot(dx, dy, dz);
  out.sunDirX = dx / l; out.sunDirY = dy / l; out.sunDirZ = dz / l;
  for (let c = 0; c < COLOURS.length; c++) {
    const at = COLOUR_AT + c * 3, names = COLOUR_NAMES[c];
    out[names[0]] = a[at] + (b[at] - a[at]) * t;
    out[names[1]] = a[at + 1] + (b[at + 1] - a[at + 1]) * t;
    out[names[2]] = a[at + 2] + (b[at + 2] - a[at + 2]) * t;
  }
  out.minute = minute;
  out.presetId = presetAt(minute);
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
