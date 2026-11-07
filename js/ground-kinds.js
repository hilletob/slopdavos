import { abs, dot, float, fract, mix, mx_noise_float, smoothstep, step, vec2, vec3 } from 'three/tsl';
import { GROUND_KIND_INDEX as I } from './ground-kind-names.js';

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
  'tartan-red': { index: I['tartan-red'], roughness: 0.85, colour: ({ p }) => mix(vec3(0.43, 0.095, 0.06), vec3(0.52, 0.125, 0.08), grain(p, 6).mul(0.5).add(grain(p, 0.08).mul(0.5))) },
  'tartan-blue': { index: I['tartan-blue'], roughness: 0.85, colour: ({ p }) => mix(vec3(0.1, 0.17, 0.48), vec3(0.13, 0.21, 0.56), grain(p, 6).mul(0.5).add(grain(p, 0.08).mul(0.5))) },
  'tartan-green': { index: I['tartan-green'], roughness: 0.85, colour: ({ p }) => mix(vec3(0.085, 0.145, 0.065), vec3(0.105, 0.175, 0.08), grain(p, 6).mul(0.5).add(grain(p, 0.08).mul(0.5))) },
  // Clay (tennis courts): a brushed orange-brown, smoothed in long sweeps along the court, darker where watered
  'clay': {
    index: I.clay, roughness: 0.95,
    colour: ({ p, dir }) => {
      const along = dot(p, dir), across = dot(p, vec2(dir.y.negate(), dir.x));
      const brushed = mx_noise_float(vec2(along.mul(0.15), across.mul(3))).mul(0.5).add(0.5);
      return mix(vec3(0.34, 0.135, 0.06), vec3(0.44, 0.18, 0.08), brushed.mul(0.6).add(grain(p, 0.1).mul(0.4)));
    }
  },
  // Artificial turf: even and saturated, laid in 5 m strips across the pitch that catch the light alternately
  'turf': {
    index: I.turf, roughness: 0.9,
    colour: ({ p, dir }) => {
      const across = dot(p, vec2(dir.y.negate(), dir.x));
      return mix(vec3(0.048, 0.13, 0.038), vec3(0.062, 0.158, 0.048), stripes(across, 5, 0.08)).mul(grain(p, 3).mul(0.06).add(0.97));
    }
  },
  'sand': { index: I['sand'], roughness: 1, colour: ({ p }) => mix(vec3(0.36, 0.28, 0.17), vec3(0.45, 0.36, 0.23), grain(p, 2).mul(0.6).add(grain(p, 0.15).mul(0.4))) },
  'asphalt': { index: I['asphalt'], roughness: 0.9, colour: ({ p }) => mix(vec3(0.1, 0.1, 0.105), vec3(0.14, 0.14, 0.145), grain(p, 4).mul(0.6).add(grain(p, 0.1).mul(0.4))) },
  // Grass: the photo's own (a natural pitch carries only its lines); listed so that its records are valid
  'grass': { index: I.grass, roughness: 1, colour: () => vec3(0.06, 0.13, 0.04), lines: true },
  // --- The town's open ground (the ground class maps, js/swissimage.js) ---
  // (the town's kinds: their albedo the mean of the sunlit 0.25 m pixels of each class, tools/classes-layer.mjs)
  // Lawn: mown grass, patchy in tone, a fine grain of blades
  'lawn': { index: I.lawn, roughness: 1, colour: ({ p }) => mix(vec3(0.085, 0.135, 0.05), vec3(0.125, 0.18, 0.07), grain(p, 0.12).mul(0.6).add(grain(p, 2.5).mul(0.4))) },
  // Shrubs and the ground under trees: dark, in clumps
  'shrub': { index: I.shrub, roughness: 1, colour: ({ p }) => mix(vec3(0.035, 0.06, 0.025), vec3(0.075, 0.11, 0.045), grain(p, 0.6).mul(0.7).add(grain(p, 3).mul(0.3))) },
  // Paving: concrete and slabs, light grey, joints every metre and a bit
  'paving': {
    index: I.paving, roughness: 0.85,
    colour: ({ p }) => {
      const joint = smoothstep(0.03, 0.0, abs(fract(p.x.div(1.2)).sub(0.5)).mul(-1).add(0.5)).max(smoothstep(0.03, 0.0, abs(fract(p.y.div(1.2)).sub(0.5)).mul(-1).add(0.5)));
      return mix(vec3(0.26, 0.26, 0.245), vec3(0.33, 0.325, 0.305), grain(p, 0.3).mul(0.5).add(grain(p, 5).mul(0.5))).mul(float(1).sub(joint.mul(0.25)));
    }
  },
  'gravel': { index: I.gravel, roughness: 1, colour: ({ p }) => mix(vec3(0.3, 0.24, 0.17), vec3(0.39, 0.31, 0.23), grain(p, 8).mul(0.6).add(grain(p, 0.2).mul(0.4))) },
  // Yards and forecourts: weathered asphalt in the sun's light grey (the photo's mean), patched and stained
  'yard': { index: I.yard, roughness: 0.9, colour: ({ p }) => mix(vec3(0.24, 0.24, 0.23), vec3(0.31, 0.305, 0.29), grain(p, 6).mul(0.45).add(grain(p, 0.25).mul(0.55))) },
  'red-paving': { index: I['red-paving'], roughness: 0.85, colour: ({ p }) => mix(vec3(0.42, 0.14, 0.1), vec3(0.52, 0.18, 0.13), grain(p, 0.3).mul(0.5).add(grain(p, 5).mul(0.5))) }
};

/** The kinds of the town's ground class maps */
export const TOWN_KIND_NAMES = ['asphalt', 'lawn', 'shrub', 'paving', 'gravel', 'red-paving'];

export const GROUND_KIND_NAMES = Object.keys(GROUND_KINDS).sort((a, b) => GROUND_KINDS[a].index - GROUND_KINDS[b].index);

/** The colour and roughness nodes of the kinds `names` (all by default), chosen by the float node `kind` (their index) */
export function groundKindNodes(kind, ctx, names = GROUND_KIND_NAMES) {
  let colour = null, roughness = null;
  for (const name of names) {
    const k = GROUND_KINDS[name], is = step(abs(kind.sub(k.index)), float(0.5)); // (1 on the kind's own vertices)
    const c = k.colour(ctx), r = float(k.roughness);
    colour = colour ? mix(colour, c, is) : c;
    roughness = roughness ? mix(roughness, r, is) : r;
  }
  return { colour, roughness };
}
