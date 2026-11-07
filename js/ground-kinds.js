import { abs, dot, float, fract, mix, mx_noise_float, smoothstep, step, vec2, vec3 } from 'three/tsl';

// js/ground-kinds.js — the kinds of ground the vector ground (js/vector-ground.js) lays where the orthophoto's pixels
// are too coarse: each a procedural TSL colour of the world position (grain, blotches, mowing), its albedo the mean of
// the SWISSIMAGE pixels it replaces (tools/trace-ground.mjs measured, linear), so that it sits in the photo around it.
// The same functions are meant for the class map of a later stage (whole chunks without a photo): a kind looks the same
// as an overlay and as part of the terrain. `index` is the kind's number in the geometry (attribute groundKind) and its
// drawing order: later kinds lie over earlier ones.

const grain = (p, scale) => mx_noise_float(p.mul(scale)).mul(0.5).add(0.5);
// a soft square wave across `coord` with bands `width` metres wide
const stripes = (coord, width, soft = 0.2) => smoothstep(0.5 - soft, 0.5 + soft, abs(fract(coord.div(width * 2)).sub(0.5)).mul(2));

export const GROUND_KINDS = {
  // Polyurethane tartan: an even, finely granular red, a little patchy where worn
  'tartan-red': { index: 0, roughness: 0.85, colour: ({ p }) => mix(vec3(0.43, 0.095, 0.06), vec3(0.52, 0.125, 0.08), grain(p, 6).mul(0.5).add(grain(p, 0.08).mul(0.5))) },
  'tartan-blue': { index: 1, roughness: 0.85, colour: ({ p }) => mix(vec3(0.1, 0.17, 0.48), vec3(0.13, 0.21, 0.56), grain(p, 6).mul(0.5).add(grain(p, 0.08).mul(0.5))) },
  'tartan-green': { index: 2, roughness: 0.85, colour: ({ p }) => mix(vec3(0.085, 0.145, 0.065), vec3(0.105, 0.175, 0.08), grain(p, 6).mul(0.5).add(grain(p, 0.08).mul(0.5))) },
  // Clay (tennis courts): a brushed orange-brown, smoothed in long sweeps along the court, darker where watered
  'clay': {
    index: 3, roughness: 0.95,
    colour: ({ p, dir }) => {
      const along = dot(p, dir), across = dot(p, vec2(dir.y.negate(), dir.x));
      const brushed = mx_noise_float(vec2(along.mul(0.15), across.mul(3))).mul(0.5).add(0.5);
      return mix(vec3(0.34, 0.135, 0.06), vec3(0.44, 0.18, 0.08), brushed.mul(0.6).add(grain(p, 0.1).mul(0.4)));
    }
  },
  // Artificial turf: even and saturated, laid in 5 m strips across the pitch that catch the light alternately
  'turf': {
    index: 4, roughness: 0.9,
    colour: ({ p, dir }) => {
      const across = dot(p, vec2(dir.y.negate(), dir.x));
      return mix(vec3(0.048, 0.13, 0.038), vec3(0.062, 0.158, 0.048), stripes(across, 5, 0.08)).mul(grain(p, 3).mul(0.06).add(0.97));
    }
  },
  'sand': { index: 5, roughness: 1, colour: ({ p }) => mix(vec3(0.36, 0.28, 0.17), vec3(0.45, 0.36, 0.23), grain(p, 2).mul(0.6).add(grain(p, 0.15).mul(0.4))) },
  'asphalt': { index: 6, roughness: 0.9, colour: ({ p }) => mix(vec3(0.1, 0.1, 0.105), vec3(0.14, 0.14, 0.145), grain(p, 4).mul(0.6).add(grain(p, 0.1).mul(0.4))) },
  // Grass: the photo's own (a natural pitch carries only its lines); listed so that its records are valid
  'grass': { index: 7, roughness: 1, colour: () => vec3(0.06, 0.13, 0.04), lines: true }
};

export const GROUND_KIND_NAMES = Object.keys(GROUND_KINDS).sort((a, b) => GROUND_KINDS[a].index - GROUND_KINDS[b].index);

/** The colour and roughness nodes of all kinds, chosen by the float node `kind` (0 … n-1) */
export function groundKindNodes(kind, ctx) {
  let colour = null, roughness = null;
  for (const name of GROUND_KIND_NAMES) {
    const k = GROUND_KINDS[name], is = step(abs(kind.sub(k.index)), float(0.5)); // (1 on the kind's own vertices)
    const c = k.colour(ctx), r = float(k.roughness);
    colour = colour ? mix(colour, c, is) : c;
    roughness = roughness ? mix(roughness, r, is) : r;
  }
  return { colour, roughness };
}
