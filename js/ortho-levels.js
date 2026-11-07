// js/ortho-levels.js — which image a terrain chunk shows (js/swissimage.js), as a plain function of its distance from the
// camera, the level it shows now (hysteresis), whether a high-resolution image fits it, the season and how much of it
// the vector ground covers (js/vector-ground.js groundCoverage):
//   0: the light image at QUALITY.orthoSmall of its size     beyond orthoFullFar
//   1: the light image at orthoFullScale (in winter orthoWinterScale: under the snow the photo only tints and shades it)
//   2: the high-resolution image within HIRES_NEAR (never in winter: QUALITY.orthoWinterLevel)
// A chunk the vector ground covers to orthoSkipCoverage or more keeps the small image only (2 = never: the coverage is
// measured but not used yet; the later stages of the vector ground lower it).
export const HIRES_NEAR = 700, HIRES_FAR = 1000;

export function orthoLevel({ d, level, hires, winter = false, coverage = 0 }, q) {
  let want = hires && (d < HIRES_NEAR || (level === 2 && d < HIRES_FAR)) ? 2
    : d < q.orthoFullNear || (level >= 1 && d < q.orthoFullFar) ? 1 : 0;
  if (winter) want = Math.min(want, q.orthoWinterLevel ?? 2);
  if (coverage >= (q.orthoSkipCoverage ?? 2)) want = 0;
  return want;
}

/** The linear scale an image of `level` is decoded at */
export function orthoScale(level, winter, q) {
  if (level === 0) return q.orthoSmall;
  if (level === 1) return winter ? Math.min(q.orthoFullScale, q.orthoWinterScale ?? 1) : q.orthoFullScale;
  return 1;
}
