// js/ground-kind-names.js — the numbers of the ground kinds (js/ground-kinds.js), without three.js: the vector ground's
// geometry (attribute groundKind) and the ground class maps (data/ground-classes/, the kind's number + 1 a pixel, 0 for
// none) carry them; tools/trace-ground.mjs writes them. The order is the drawing order of the overlays' surfaces.
export const GROUND_KIND_INDEX = {
  'tartan-red': 0, 'tartan-blue': 1, 'tartan-green': 2, 'clay': 3, 'turf': 4, 'sand': 5, 'asphalt': 6, 'grass': 7,
  // the town's open ground between the streets, the buildings and the car parks (the ground class maps)
  'lawn': 8, 'shrub': 9, 'paving': 10, 'gravel': 11, 'red-paving': 12,
  // the paved yards, forecourts and drives off the streets (js/ground-markings-data.js, tools/markings-paved.mjs)
  'yard': 13
};
