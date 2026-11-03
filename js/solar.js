// js/solar.js
// Where the sun stands over Davos (46.80 N, 9.84 E), a small pure function of the clock's minute and the season's blend
// w (0 summer .. 1 winter, as the snowfall and the thaw run: js/game-clock.js). Two anchor days, from the NOAA formula, in
// local time (CEST in summer, CET in winter), and the blend between them:
//
//   15 Jul: declination +21.6, solar noon 13:26: dawn 05:04, sunrise 05:41, 65 deg at noon, sunset 21:11, dusk 21:48
//   15 Jan: declination -21.2, solar noon 12:30: dawn 07:28, sunrise 08:02, 22 deg at noon, sunset 16:59, dusk 17:33
//
// The mountains delay the sun in the valley in reality; the terrain casts no shadow in the game, so that isn't simulated.
// No three.js here (tests/game-clock.test.mjs).

const RAD = Math.PI / 180;
const SIN_LAT = Math.sin(46.8 * RAD), COS_LAT = Math.cos(46.8 * RAD);
const DECL_SUMMER = 21.6, DECL_WINTER = -21.2;
export const NOON_SUMMER = 13 * 60 + 26, NOON_WINTER = 12 * 60 + 30;

export const SUNRISE_HEIGHT = -0.833; // deg: the sun's upper edge, with refraction
export const CIVIL_HEIGHT = -6; // deg: civil dawn and dusk

/** The clock's minute of solar noon */
export const solarNoon = (w) => NOON_SUMMER + (NOON_WINTER - NOON_SUMMER) * w;
const declination = (w) => (DECL_SUMMER + (DECL_WINTER - DECL_SUMMER) * w) * RAD;

/** The sun's height over the horizon, in degrees */
export function sunHeight(minute, w) {
  const d = declination(w), H = (minute - solarNoon(w)) * 0.25 * RAD;
  return Math.asin(SIN_LAT * Math.sin(d) + COS_LAT * Math.cos(d) * Math.cos(H)) / RAD;
}

/** The unit vector towards the sun in the Davos frame (x east, y up, z south), into `out` { x, y, z } */
export function sunVector(minute, w, out) {
  const d = declination(w), H = (minute - solarNoon(w)) * 0.25 * RAD;
  const sinD = Math.sin(d), cosD = Math.cos(d), cosH = Math.cos(H);
  out.x = -cosD * Math.sin(H);
  out.y = SIN_LAT * sinD + COS_LAT * cosD * cosH;
  out.z = SIN_LAT * cosD * cosH - COS_LAT * sinD;
  return out;
}

/** The minute the sun passes `height` going up (rising) or down; null when it never gets there that day */
export function minuteAtHeight(height, w, rising) {
  const d = declination(w);
  const c = (Math.sin(height * RAD) - SIN_LAT * Math.sin(d)) / (COS_LAT * Math.cos(d));
  if (c > 1 || c < -1) return null;
  const off = Math.acos(c) / RAD * 4;
  return solarNoon(w) + (rising ? -off : off);
}
