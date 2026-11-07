import * as THREE from 'three/webgpu';
import { attribute, exp, float, smoothstep, vec3 } from 'three/tsl';

// js/ground-beams.js
// Where the vehicles' head- and work lights reach the ground without real lights: the mobile profile (js/quality.js
// clusteredLighting: false, DirectLighting in js/main.js) has no point or spot light in any shader, so the SpotLights of
// js/controllers.js updateVehicleLights and js/traffic.js headlightPool light nothing there. Instead, one additive mesh
// lays soft pools of warm light onto the road: the driven vehicle's beam (two lobes from the two lamps, widening and
// fading with distance; the high beam reaching further, brighter and wider) draped onto the ground, and short pools
// ahead of the nearest traffic, tilted with each car. One geometry, one material, one draw call, no texture.
//
// The geometry is written out flat (no index: js/gpu-memory.js flattenDraws would copy an indexed one on its first draw
// and the updates would go to the old one) and in world space, in slots: the player's grid first, then one small grid
// a traffic car. A slot is a grid of `nx` x `nz` cells (6 corners a cell) from lateral -W(d)..W(d) and along d0..reach,
// W(d) = lampX + 2.4 * (s0 + d * spread), s the lobes' width; what a slot holds is filled in by a `place(lat, d, out)`
// callback giving each grid node's world position. Unused slots are collapsed to nothing (zero-area triangles).
//
// Vertex data: `beamA` (lateral offset m, distance along m, reach m, strength), `beamB` (lamp half-spacing m, lobe
// spread a metre, lobe width at the lamp m, distance of the brightest part m), `beamC` (where it starts to rise, m).

const PLAYER_GRID = [8, 16];
const TRAFFIC_GRID = [2, 3];
const TRAFFIC_SLOTS = 14;
const cornersOf = ([nx, nz]) => nx * nz * 6;
const PLAYER_CORNERS = cornersOf(PLAYER_GRID);
const TRAFFIC_CORNERS = cornersOf(TRAFFIC_GRID);
const CORNERS = PLAYER_CORNERS + TRAFFIC_SLOTS * TRAFFIC_CORNERS;
// (as js/missions-props.js RING_DEPTH: the drawn terrain is the grid between its nodes, not the surface sampled here)
const DEPTH = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 };

let mesh = null;
let frames = 0;
const used = { player: false, traffic: 0 };

function createMesh() {
  const geometry = new THREE.BufferGeometry();
  const attr = (n) => {
    const a = new THREE.BufferAttribute(new Float32Array(CORNERS * n), n);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  geometry.setAttribute('position', attr(3));
  geometry.setAttribute('beamA', attr(4));
  geometry.setAttribute('beamB', attr(4));
  geometry.setAttribute('beamC', attr(1));
  const A = attribute('beamA', 'vec4'), B = attribute('beamB', 'vec4'), rise = attribute('beamC', 'float');
  const lat = A.x, d = A.y, reach = A.z, strength = A.w;
  const s = B.z.add(d.mul(B.y));
  const lobe = (x0) => { const t = lat.sub(x0).div(s); return exp(t.mul(t).negate()); };
  const lobes = lobe(B.x).add(lobe(B.x.negate())).min(1.25);
  // rising from `rise` to the hot spot, then fading out towards the reach
  const along = smoothstep(rise, B.w, d).mul(float(1).sub(smoothstep(B.w, reach, d)).pow(1.6));
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...DEPTH
  });
  material.colorNode = vec3(1.0, 0.88, 0.7);
  material.opacityNode = lobes.mul(along).mul(strength);
  const m = new THREE.Mesh(geometry, material);
  m.name = 'GroundBeams';
  m.frustumCulled = false;
  m.renderOrder = 4;
  return m;
}

/** The stand-in mesh (created on first call); js/controllers.js adds it to the scene on the mobile profile */
export function groundBeamsMesh() {
  return (mesh ??= createMesh());
}

const node = new Float32Array(3);
const grid = new Float32Array(17 * 9 * 3); // (the biggest grid's nodes: world positions)
const gridLat = new Float32Array(17 * 9), gridD = new Float32Array(17 * 9);

// Writes slot `first` (a corner index) as a grid `cells` with beam `b` ({ lampX, s0, spread, d0, hot, reach, strength })
function writeSlot(first, cells, b, place) {
  const [nx, nz] = cells, cols = nx + 1;
  const g = mesh.geometry, P = g.attributes.position.array, A = g.attributes.beamA.array, B = g.attributes.beamB.array;
  const C = g.attributes.beamC.array, rise = b.rise ?? b.hot * 0.25;
  for (let j = 0; j <= nz; j++) {
    const d = b.d0 + (b.reach - b.d0) * (j / nz);
    const w = b.lampX + 2.4 * (b.s0 + d * b.spread);
    for (let i = 0; i <= nx; i++) {
      const k = j * cols + i, lat = w * (i / nx * 2 - 1);
      place(lat, d, node);
      grid[k * 3] = node[0]; grid[k * 3 + 1] = node[1]; grid[k * 3 + 2] = node[2];
      gridLat[k] = lat; gridD[k] = d;
    }
  }
  let c = first;
  const corner = (k) => {
    P[c * 3] = grid[k * 3]; P[c * 3 + 1] = grid[k * 3 + 1]; P[c * 3 + 2] = grid[k * 3 + 2];
    A[c * 4] = gridLat[k]; A[c * 4 + 1] = gridD[k]; A[c * 4 + 2] = b.reach; A[c * 4 + 3] = b.strength;
    B[c * 4] = b.lampX; B[c * 4 + 1] = b.spread; B[c * 4 + 2] = b.s0; B[c * 4 + 3] = b.hot;
    C[c] = rise;
    c++;
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * cols + i;
      // (counter-clockwise seen from above)
      corner(k); corner(k + cols); corner(k + 1);
      corner(k + 1); corner(k + cols); corner(k + cols + 1);
    }
  }
}

function clearSlots(first, count) {
  const g = mesh.geometry;
  g.attributes.position.array.fill(0, first * 3, (first + count) * 3);
  g.attributes.beamA.array.fill(0, first * 4, (first + count) * 4);
}

function flag() {
  const g = mesh.geometry;
  for (const name of ['position', 'beamA', 'beamB', 'beamC']) {
    // (all of it: ~60 KB, and update ranges pile up while the mesh is hidden)
    g.attributes[name].needsUpdate = true;
  }
}

function settle() {
  // (shown for the first frames whatever it holds, so that the warm-up compiles its pipeline; then only while lit)
  const count = (used.traffic ? PLAYER_CORNERS + used.traffic * TRAFFIC_CORNERS : used.player ? PLAYER_CORNERS : 0);
  mesh.visible = count > 0 || frames < 3;
  mesh.geometry.setDrawRange(0, Math.max(3, count));
}

/**
 * The driven vehicle's beam, or none (`beam` null). `beam`: { lampX, s0, spread, d0, hot, reach, strength, rise? (default hot / 4) };
 * `place(lat, d, out)` writes the world position of the ground `lat` m to the right of and `d` m ahead of the lamps.
 * `moved`: whether anything changed since the last call (else the slot stays as it is).
 */
export function setPlayerBeam(beam, place, moved = true) {
  if (!mesh) return;
  frames++;
  if (!beam) {
    if (used.player) { clearSlots(0, PLAYER_CORNERS); flag(); used.player = false; }
  } else if (moved || !used.player) {
    writeSlot(0, PLAYER_GRID, beam, place);
    flag();
    used.player = true;
  }
  settle();
}

/** Starts the traffic's pools for this frame; then addTrafficBeam() for each, nearest first; endTrafficBeams() */
let trafficNow = 0;
export function beginTrafficBeams() { trafficNow = 0; }
export function addTrafficBeam(beam, place) {
  if (!mesh || trafficNow >= TRAFFIC_SLOTS) return false;
  writeSlot(PLAYER_CORNERS + trafficNow * TRAFFIC_CORNERS, TRAFFIC_GRID, beam, place);
  trafficNow++;
  return true;
}
export function endTrafficBeams() {
  if (!mesh) return;
  const first = PLAYER_CORNERS, was = used.traffic;
  if (trafficNow < was) clearSlots(first + trafficNow * TRAFFIC_CORNERS, (was - trafficNow) * TRAFFIC_CORNERS);
  const n = Math.max(was, trafficNow);
  if (n) flag();
  used.traffic = trafficNow;
  settle();
}

export const groundBeamStats = () => ({ player: used.player, traffic: used.traffic, visible: !!mesh?.visible, corners: CORNERS });
