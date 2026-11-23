// The carriageways as the build tools take them from OpenStreetMap: which highway kinds are streets, how wide each is
// where OSM gives no width and how many lanes it has where OSM gives none. One table for the geodata
// (build-davos-geodata.mjs: the roads' widths in the game), the terrain (build-davos-terrain.mjs: the bed cut for each
// street) and the check of that bed (check-road-smoothness.mjs): a street must be as wide for all three.

/** The streets a bed is laid for: the classified roads with their links, and the minor streets */
export const STREET_KINDS = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$|^(residential|unclassified|living_street|service)$/;
/** Metres, by the highway kind without `_link` */
export const STREET_WIDTH = { motorway: 14, trunk: 12, primary: 10, secondary: 8, tertiary: 7, residential: 6, unclassified: 6, living_street: 5, service: 3.5 };
export const STREET_LANES = { motorway: 4, trunk: 4, primary: 2, secondary: 2, tertiary: 2, residential: 2, unclassified: 2, living_street: 1, service: 1 };

/** A street's width from its tags: width=*, else the wider of its kind's and 3 m a lane */
export function streetWidth(tags, base = tags.highway.replace(/_link$/, '')) {
  return parseFloat(tags.width) || Math.max(STREET_WIDTH[base] ?? 3, (parseFloat(tags.lanes) || STREET_LANES[base] || 1) * 3);
}
