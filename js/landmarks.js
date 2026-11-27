import * as THREE from 'three/webgpu';

// The engine's hand-built New York monuments are removed. Legacy exports keep the upstream controllers working.
export let bryantParkLawn = null;
export const LANDMARKS = [];
export const BERGHAIN_TREE_SITES = [];
export const LANDMARK_SOURCE_EXCLUSIONS = new Set();
export const LANDMARK_EXCLUSIONS = [];
// The buildings rebuilt by hand whose surveyed walls stand off OpenStreetMap's footprint (js/samd.js, js/seehof.js, …):
// OSM id → the outlines ([[x, z], …]) their walls stand on at the ground. js/buildings.js raises the wall colliders on
// these instead of on OSM's outline, which stood up to 3 m before or behind the walls (an invisible wall in the yard, or a
// wall one walked into); the floor plans keep OSM's outline and add these. An empty list: the module brings the
// colliders of all its walls itself.
export const SURVEYED_FOOTPRINTS = new Map();

export function buildLandmarks(scene) {
  const group = new THREE.Group();
  group.name = 'Landmarks';
  scene.add(group);
  return { group, colliders: [], exclusions: LANDMARK_EXCLUSIONS, update() {} };
}
