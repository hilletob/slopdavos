import * as THREE from 'three/webgpu';
import { Fn, float, color, positionWorld, uniform, mod, fract, step, smoothstep, mix, attribute, texture, uv, vec2 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  SIGNAL_TIMING,
  blockAt,
  fromOldFrame,
  BERLIN_DATA,
  waterAt
} from './city-config.js';
import { cityUniforms, createGodRayMaterial } from './tsl-materials.js';
import { createTreeField } from './trees.js';
import { parkTreeSites, berlinStreetSites } from './city-grid.js';
import { nearestBerlinRoad } from './berlin-geometry.js';
import { groundHeight, surfaceHeight } from './terrain.js';
import { QUALITY } from './quality.js';
import { winter } from './season.js';

// js/street-details.js
// The street furniture of the mapped town, instanced: the swan-neck streetlights and the Promenade's candelabras (knocked
// over when driven into), the traffic signals OpenStreetMap maps, the streets' name blades, the yellow post boxes, the
// trees of the parks and squares, and the pooled lights of the lamps around the player.

function drawStreetSignBlade(ctx, label, ox = 0, oy = 0) {
  ctx.fillStyle = '#eeeeeb';
  ctx.fillRect(ox, oy, 256, 64);
  ctx.strokeStyle = '#242829';
  ctx.lineWidth = 5;
  ctx.strokeRect(ox + 4, oy + 4, 248, 56);
  ctx.fillStyle = '#242829';
  ctx.font = `600 ${label.length > 22 ? 19 : label.length > 16 ? 23 : 30}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, ox + 128, oy + 34);
}

// All the street-name blades in one atlas (4 blades per row), so the signs of every street draw as a single instanced
// mesh: each instance picks its blade through the `aSignTile` attribute (column, row) instead of a material per street.
const SIGN_ATLAS_COLS = 4;
function createStreetSignAtlas(labels) {
  const rows = Math.max(1, Math.ceil(labels.length / SIGN_ATLAS_COLS));
  // (laid out in 256 x 64 px blades whatever the canvas' size: half as large on the mobile profile, js/quality.js)
  const c = document.createElement('canvas'), s = QUALITY.atlasScale;
  c.width = Math.round(256 * SIGN_ATLAS_COLS * s);
  c.height = Math.round(64 * rows * s);
  const ctx = c.getContext('2d');
  ctx.scale(s, s);
  labels.forEach((label, i) => drawStreetSignBlade(ctx, label, (i % SIGN_ATLAS_COLS) * 256, Math.floor(i / SIGN_ATLAS_COLS) * 64));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { texture: tex, rows };
}

/**
 * TSL 3-Aspect Traffic Signal Lens Material (Red y=5.78, Amber y=5.42, Green y=5.06)
 * Driven by the shared signal clock and SIGNAL_TIMING (city-config.js), which js/traffic.js obeys.
 */
function createTrafficSignalLensMaterial(isAvenueHead, clock) {
  const { cycle, avenueAmber, avenueRed, streetAmber } = SIGNAL_TIMING;
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => {
    const t = mod(clock, cycle);
    const wy = positionWorld.y;
    const isTopRed = step(5.60, wy);
    const isBottomGreen = float(1.0).sub(step(5.24, wy));
    const isMidAmber = float(1.0).sub(isTopRed).mul(float(1.0).sub(isBottomGreen));

    // Avenue phase: Green, then Amber from avenueAmber, Red from avenueRed
    // Street phase: Red until avenueRed, then Green, Amber from streetAmber
    const greenActive = isAvenueHead
      ? float(1.0).sub(step(avenueAmber, t))
      : step(avenueRed, t).mul(float(1.0).sub(step(streetAmber, t)));
    const amberActive = isAvenueHead
      ? step(avenueAmber, t).mul(float(1.0).sub(step(avenueRed, t)))
      : step(streetAmber, t);
    const redActive = isAvenueHead
      ? step(avenueRed, t)
      : float(1.0).sub(step(avenueRed, t));

    const activeMask = isTopRed.mul(redActive)
      .add(isMidAmber.mul(amberActive))
      .add(isBottomGreen.mul(greenActive));

    const lensHue = mix(
      mix(color(0x18ff68), color(0xffaa10), isMidAmber),
      color(0xff2424),
      isTopRed
    );
    return mix(color(0x14181e), lensHue.mul(1.35), activeMask);
  })();
  return mat;
}

// Pedestrian signal for crossing alongside the avenue: WALK, then a flashing hand until the avenue's amber, then a
// steady hand
function createWalkSignalMaterial(clock) {
  const { cycle, avenueAmber, walk } = SIGNAL_TIMING;
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => {
    const t = mod(clock, cycle);
    const isWalk = float(1.0).sub(step(walk, t));
    const isFlashing = step(walk, t).mul(float(1.0).sub(step(avenueAmber, t)));
    const handLit = float(1.0).sub(isFlashing.mul(step(0.5, fract(t))));
    const hand = mix(color(0x14181e), color(0xff5518), handLit);
    return mix(hand, color(0xf4f9ff), isWalk);
  })();
  return mat;
}

function buildStreetDetails(scene) {
  const group = new THREE.Group();
  group.name = 'BerlinStreetDetails';

  const dummy = new THREE.Object3D();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 10);

  // Ground footprints of street furniture that traffic and pedestrians must keep clear of
  const footprints = [];
  const addFootprint = (x, z, w, d, pedestrianOnly = false) => footprints.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, pedestrianOnly });

  // Signal clock (seconds), set every frame by main.js
  const signalClock = uniform(0);

  // Shared materials
  const poleMetalMat = new THREE.MeshStandardNodeMaterial({
    color: 0x3b4046,
    roughness: 0.45,
    metalness: 0.78
  });
  const signalHousingMat = new THREE.MeshStandardNodeMaterial({
    color: 0xe6a817, // the signal housings
    roughness: 0.38,
    metalness: 0.35,
    side: THREE.DoubleSide // the tunnel visors are open half-tubes
  });
  const aveSignalLensMat = createTrafficSignalLensMaterial(true, signalClock);
  const streetSignalLensMat = createTrafficSignalLensMaterial(false, signalClock);
  const walkSignalGlow = createWalkSignalMaterial(signalClock);

  // 12-inch three-section signal head (origin at its centre, y = 5.42): yellow housing, a tunnel visor over each lens
  // and a hanger to the mast arm, lenses on both faces (+-z) so it reads from both approaches; the lens material
  // picks red / amber / green from each lens's world height (5.78 / 5.42 / 5.06)
  const HEAD_W = 0.4;
  const HEAD_H = 1.12;
  const HEAD_D = 0.28;
  const LENS_R = 0.145;
  const LENS_Y = [0.36, 0, -0.36];
  const bothFaces = (geo) => [geo, geo.clone().rotateY(Math.PI)];
  const signalHousingGeo = mergeGeometries([
    new THREE.BoxGeometry(HEAD_W, HEAD_H, HEAD_D),
    new THREE.BoxGeometry(0.07, 0.2, 0.07).translate(0, HEAD_H / 2 + 0.1, 0),
    ...LENS_Y.flatMap((ly) => bothFaces(
      new THREE.CylinderGeometry(LENS_R + 0.03, LENS_R + 0.03, 0.24, 14, 1, true, Math.PI / 2, Math.PI)
        .rotateX(Math.PI / 2).translate(0, ly, HEAD_D / 2 + 0.12)
    ))
  ].map((g) => g.toNonIndexed()));
  const signalLensGeo = mergeGeometries(LENS_Y.flatMap((ly) => bothFaces(new THREE.CircleGeometry(LENS_R, 18).translate(0, ly, HEAD_D / 2 + 0.004))));
  // Pedestrian signal: housing with the WALK / hand face lit on both sides (+-z, toward the crosswalk's far end)
  const walkHousingGeo = new THREE.BoxGeometry(0.34, 0.4, 0.24);
  const walkPanelGeo = mergeGeometries(bothFaces(new THREE.PlaneGeometry(0.27, 0.31).translate(0, 0, 0.125)));
  // The streetlights of the Landschaft Davos (photo, Promenade at the Parsennbahn): a slim, light
  // silver round mast (~9 m) bending over in a swan neck to a small flat LED head, cold white (~4000 K) at night; local
  // +x along the arm (towards the road), the lens 2.05 m out at 8.93 m. Mast, neck and head in one geometry.
  const DAVOS_LAMP = { reach: 2.05, y: 8.93 };
  const davosMastMat = new THREE.MeshStandardNodeMaterial({ color: 0xb4b9bd, roughness: 0.38, metalness: 0.72 });
  const davosLampGlow = new THREE.MeshBasicNodeMaterial();
  davosLampGlow.colorNode = mix(color(0x9a9d9f), color(0xeef2fa).mul(2.4), smoothstep(0.4, 1.1, cityUniforms.uInteriorGlow)); // (the same cool white as its spot below)
  const davosMastGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.13, 0.15, 0.5, 6).translate(0, 0.25, 0), // foot
    new THREE.CylinderGeometry(0.055, 0.085, 7.6, 6, 1, true).translate(0, 4.1, 0),
    new THREE.TubeGeometry(new THREE.CubicBezierCurve3(new THREE.Vector3(0, 7.85, 0), new THREE.Vector3(0, 8.95, 0),
      new THREE.Vector3(0.45, 9.12, 0), new THREE.Vector3(1.7, 9.02, 0)), QUALITY.lampSegments[0], 0.05, QUALITY.lampSegments[1]),
    new THREE.BoxGeometry(0.78, 0.09, 0.3).rotateZ(-0.06).translate(DAVOS_LAMP.reach, 8.99, 0) // the flat LED head
  ].map((g) => g.toNonIndexed()));
  const davosLensGeo = new THREE.PlaneGeometry(0.62, 0.22).rotateX(Math.PI / 2).rotateZ(-0.06).translate(DAVOS_LAMP.reach + 0.02, DAVOS_LAMP.y, 0);
  // ...and the cast-iron candelabra of the promenade in front of the hotels (anthracite post, curved side arms and three
  // hexagonal lanterns), glowing a little warmer
  const kandelaberGlow = new THREE.MeshBasicNodeMaterial();
  kandelaberGlow.colorNode = mix(color(0xcfcdc4), color(0xffdcae).mul(2.0), smoothstep(0.4, 1.1, cityUniforms.uInteriorGlow)); // (~3000 K, as its light)
  const KANDELABER_HEADS = [[0, 4.62], [-0.62, 4.08], [0.62, 4.08]]; // lantern centres (local x, y)
  const lanternGlass = (x, y) => new THREE.CylinderGeometry(0.15, 0.1, 0.4, 6).translate(x, y, 0);
  const kandelaberPostGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.12, 0.17, 0.7, 8).translate(0, 0.35, 0),
    new THREE.CylinderGeometry(0.055, 0.075, 3.75, 8).translate(0, 2.55, 0),
    ...[-1, 1].map((s) => new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 3.7, 0),
      new THREE.Vector3(s * 0.6, 3.7, 0), new THREE.Vector3(s * 0.62, 3.84, 0)), 6, 0.025, 4)),
    ...KANDELABER_HEADS.flatMap(([x, y]) => [
      new THREE.CylinderGeometry(0.05, 0.07, 0.08, 6).translate(x, y - 0.24, 0), // the lantern's foot
      new THREE.ConeGeometry(0.21, 0.17, 6).translate(x, y + 0.285, 0), // its roof
      new THREE.SphereGeometry(0.035, 5, 4).translate(x, y + 0.4, 0) // the finial
    ])
  ].map((g) => g.toNonIndexed()));
  const kandelaberGlassGeo = mergeGeometries(KANDELABER_HEADS.map(([x, y]) => lanternGlass(x, y).toNonIndexed()));

  // =========================================================================
  // 1. TRAFFIC SIGNALS, STREET BLADES & WALK SIGNALS
  // =========================================================================
  const poleMatrices = [];
  const yellowBoxMatrices = [];
  const aveLensMatrices = [];
  const streetLensMatrices = [];
  const walkBoxMatrices = [];
  const audioSignals = [];
  const signalIntersections = [];
  const davosMastMatrices = []; // the swan-neck masts
  const kandelaberMatrices = []; // Davos candelabras
  const davosMastSites = [], kandelaberSites = []; // their light sites, by instance (put out when one is knocked over)
  // The hotels along the Promenade (OSM tourism=hotel, centroids) and the Parsennbahn's valley station: candelabras
  // there instead of the masts, on their side of the street ([x, z, n]: a row of them, n more either way 11 m apart)
  const KANDELABER_SPOTS = [[699, -1511], [672, -1389], [668, -1440, 2], [544, -1165], [551, -963], [318, -735], [187, -619],
    [166, -667], [-266, -532], [-604, -121], [-590, 73], [-622, 204]];
  const cobraLampSites = [];
  const streetPointSites = [];
  // Only nearby poles can conflict, even with street furniture across the whole island.
  const POLE_CELL = 8;
  const poleCells = new Map();
  function addPole(x, z, width) {
    const key = Math.floor(x / POLE_CELL) + ',' + Math.floor(z / POLE_CELL);
    let cell = poleCells.get(key);
    if (!cell) poleCells.set(key, cell = []);
    cell.push({ x, z });
    // Poles stand on curbs: pedestrians avoid them, but they must not narrow the inferred road gaps.
    addFootprint(x, z, width, width, true);
  }

  const berlinSignMatrices = new Map();
  {
    const expansionStreetSigns = new Set(['Schlesische Straße', 'Skalitzer Straße', 'Kreuzbergstraße', 'Kottbusser Damm',
      'Oranienstraße', 'Bergmannstraße', 'Karl-Marx-Allee', 'Frankfurter Allee', 'Warschauer Straße', 'Boxhagener Straße',
      'Spandauer Damm', 'Otto-Suhr-Allee', 'Bismarckstraße', 'Kantstraße', 'Tauentzienstraße', 'Kurfürstendamm', 'Straße des 17. Juni']);
    const setMatrix = (list, x, y, z, sx, sy, sz, yaw = 0) => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix(); list.push(dummy.matrix.clone());
    };
    for (let i = 0; i < berlinStreetSites.length; i++) {
      const s = berlinStreetSites[i];
      if (waterAt(s.x, s.z) && !s.road.bridge) continue;
      const block = blockAt(s.x, s.z);
      if (block && !block.sidewalk && !block.id?.toString().startsWith('sidewalk') && block.source && !block.park) continue;
      const spot = s.name === 'Promenade' && KANDELABER_SPOTS.find(([hx, hz]) => Math.hypot(hx - s.x, hz - s.z) < 32 && (hx - s.x) * s.nx + (hz - s.z) * s.nz < 0);
      if (spot) {
        // a candelabra on the hotel's side of the Promenade (the hotel behind it), its arms along the street
        for (let k = -(spot[2] || 0); k <= (spot[2] || 0); k++) {
          const x = s.x + s.ux * 11 * k, z = s.z + s.uz * 11 * k, b = blockAt(x, z);
          if (k && (Math.hypot(spot[0] - x, spot[1] - z) > 32 || (b && !b.sidewalk && !b.id?.toString().startsWith('sidewalk') && b.source && !b.park))) continue;
          setMatrix(kandelaberMatrices, x, 0, z, 1, 1, 1, -Math.atan2(s.uz, s.ux));
          // warm white (~3000 K); a point light at the lanterns' height lights the pavement in a ring ~10 m across
          // (and the hotel's light facade 3 m behind it, which anything much stronger burns out to white: the light
          // sits 1 m to the street side of the lanterns, away from the wall)
          streetPointSites.push({ x: x + s.nx, y: 4.3, z: z + s.nz, color: 0xffd9a8, intensity: 36, dist: 11 });
          kandelaberSites.push(streetPointSites[streetPointSites.length - 1]);
          addPole(x, z, 0.17);
        }
      } else {
        const yaw = Math.atan2(-s.nz, s.nx);
        setMatrix(davosMastMatrices, s.x, 0, s.z, 1, 1, 1, yaw);
        const lx = s.x + s.nx * DAVOS_LAMP.reach, lz = s.z + s.nz * DAVOS_LAMP.reach;
        cobraLampSites.push({ x: lx, y: DAVOS_LAMP.y - 0.05, z: lz, tx: s.x + s.nx * 3.6, tz: s.z + s.nz * 3.6 });
        davosMastSites.push(cobraLampSites[cobraLampSites.length - 1]);
        addPole(s.x, s.z, 0.15);
      }
      if (s.name && i % 4 === 0 && (berlinSignMatrices.has(s.name) || berlinSignMatrices.size < 70 || expansionStreetSigns.has(s.name))) {
        if (!berlinSignMatrices.has(s.name)) berlinSignMatrices.set(s.name, []);
        setMatrix(berlinSignMatrices.get(s.name), s.x, 3.25, s.z, 1.8, 0.33, 0.055, -Math.atan2(s.uz, s.ux));
      }
    }
    const signalKeys = new Set();
    for (const signal of BERLIN_DATA.signals || []) {
      const road = nearestBerlinRoad(signal.x, signal.z, 28);
      if (!road) continue;
      const nx = -road.uz, nz = road.ux;
      const side = ((signal.x - road.x) * nx + (signal.z - road.z) * nz) < 0 ? -1 : 1;
      const x = road.x + nx * side * (road.width / 2 + 0.7), z = road.z + nz * side * (road.width / 2 + 0.7);
      const key = `${Math.round(x / 7)}/${Math.round(z / 7)}`;
      if (signalKeys.has(key)) continue;
      signalKeys.add(key);
      const yaw = Math.atan2(road.ux, road.uz), isAvenue = Math.abs(road.uz) >= Math.abs(road.ux);
      setMatrix(poleMatrices, x, 3.0, z, 0.09, 6, 0.09);
      setMatrix(yellowBoxMatrices, x, 5.42, z, 1, 1, 1, yaw);
      setMatrix(isAvenue ? aveLensMatrices : streetLensMatrices, x, 5.42, z, 1, 1, 1, yaw);
      setMatrix(walkBoxMatrices, x, 2.7, z, 1, 1, 1, yaw + Math.PI / 2);
      audioSignals.push({ x, y: 2.7, z, isAvenue });
    }
  }

  function addMatrixArrayInstanced(geo, mat, matrices, castShadow = true) {
    if (matrices.length === 0) return null;
    const inst = new THREE.InstancedMesh(geo, mat, matrices.length);
    if (castShadow && !mat.isMeshBasicNodeMaterial && mat.type !== 'MeshBasicNodeMaterial' && !mat.transparent) {
      inst.castShadow = true;
      inst.receiveShadow = true;
    }
    for (let i = 0; i < matrices.length; i++) {
      inst.setMatrixAt(i, matrices[i]);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
    return inst;
  }

  // The masts and candelabras go down when a vehicle drives into them (controllers.js setKnockablePosts, which
  // calls set.fall): the hit instance turns about its foot in the direction of travel over FALL_MS, then lies there
  // for the session, its lens blanked and its light taken out of the pool (site.off). Only the instance matrix of
  // the hit mast changes, in place: no new geometry or draw.
  const knockablePosts = [];
  const falling = [];
  const FALL_MS = 600, FALL_ANGLE = Math.PI / 2 * 0.97;
  const _fallM = new THREE.Matrix4(), _fallR = new THREE.Matrix4(), _fallAxis = new THREE.Vector3();
  function addKnockable(mesh, lens, matrices, sites, r) {
    if (!mesh) return;
    const set = {
      fall(post, dx, dz) {
        const at = locateInstance(mesh, post);
        if (!at) return;
        const target = ({ mesh, i }) => { const base = new THREE.Matrix4(); mesh.getMatrixAt(i, base); return { mesh, i, base }; };
        const targets = [target(at)]; // (its matrix lifted onto the terrain by main.js by now)
        const e = targets[0].base.elements;
        const proxy = locateShadowProxy(e[12], e[13], e[14]);
        if (proxy) targets.push(target(proxy)); // its sun shadow goes down with it
        const glow = lens && locateInstance(lens, post);
        if (glow) { glow.mesh.setMatrixAt(glow.i, _fallM.makeScale(0, 0, 0)); glow.mesh.instanceMatrix.needsUpdate = true; } // the lamp goes out
        if (sites[post.i]) sites[post.i].off = true;
        falling.push({ targets, ax: dz, az: -dx, t0: performance.now() });
      }
    };
    for (let i = 0; i < matrices.length; i++) {
      const e = matrices[i].elements;
      knockablePosts.push({ x: e[12], z: e[14], r, set, i });
    }
  }
  // scene-culling.js may have cut `mesh` into per-cell chunks (sharing its vertex attributes) and taken it out of the
  // group: the instance standing at the post is then the chunk's whose matrix puts it there. { mesh, i } or null.
  function locateInstance(mesh, post) {
    if (mesh.parent) return { mesh, i: post.i };
    const position = mesh.geometry.attributes.position;
    for (const c of group.children) {
      if (!c.isInstancedMesh || c.geometry.attributes.position !== position) continue;
      const a = c.instanceMatrix.array;
      for (let j = 0; j < c.count; j++) if (Math.abs(a[j * 16 + 12] - post.x) < 0.01 && Math.abs(a[j * 16 + 14] - post.z) < 0.01) return { mesh: c, i: j };
    }
    return null;
  }
  // The masts cast their sun shadows through scene-culling.js' position-only stand-ins (instanced meshes with the
  // 'ShadowProxy' material, world-space matrices, built after this): the one standing at (x, y, z), or null
  let shadowProxies = null;
  function locateShadowProxy(x, y, z) {
    if (!shadowProxies) {
      shadowProxies = [];
      scene.traverse((o) => { if (o.isInstancedMesh && o.material?.name === 'ShadowProxy') shadowProxies.push(o); });
    }
    for (const m of shadowProxies) {
      const a = m.instanceMatrix.array;
      for (let j = 0; j < m.count; j++) {
        if (Math.abs(a[j * 16 + 12] - x) < 0.02 && Math.abs(a[j * 16 + 14] - z) < 0.02 && Math.abs(a[j * 16 + 13] - y) < 0.05) return { mesh: m, i: j };
      }
    }
    return null;
  }
  function animateFalling() {
    if (!falling.length) return;
    const now = performance.now();
    for (let k = falling.length - 1; k >= 0; k--) {
      const f = falling[k];
      const p = Math.min(1, (now - f.t0) / FALL_MS);
      _fallR.makeRotationAxis(_fallAxis.set(f.ax, 0, f.az).normalize(), FALL_ANGLE * p * p); // (gaining speed as it goes)
      for (const t of f.targets) {
        const e = t.base.elements;
        _fallM.copy(t.base).setPosition(0, 0, 0).premultiply(_fallR).setPosition(e[12], e[13], e[14]);
        t.mesh.setMatrixAt(t.i, _fallM);
        t.mesh.instanceMatrix.needsUpdate = true; // (main.js may have swapped the attribute for a storage one: look it up)
      }
      if (p >= 1) falling.splice(k, 1);
    }
  }

  addMatrixArrayInstanced(unitCyl, poleMetalMat, poleMatrices);
  addMatrixArrayInstanced(signalHousingGeo, signalHousingMat, yellowBoxMatrices);
  addMatrixArrayInstanced(signalLensGeo, aveSignalLensMat, aveLensMatrices, false);
  addMatrixArrayInstanced(signalLensGeo, streetSignalLensMat, streetLensMatrices, false);
  addMatrixArrayInstanced(walkHousingGeo, signalHousingMat, walkBoxMatrices);
  addMatrixArrayInstanced(walkPanelGeo, walkSignalGlow, walkBoxMatrices, false);
  if (davosMastGeo) {
    const mastInst = addMatrixArrayInstanced(davosMastGeo, davosMastMat, davosMastMatrices);
    const mastLens = addMatrixArrayInstanced(davosLensGeo, davosLampGlow, davosMastMatrices, false);
    const kandInst = addMatrixArrayInstanced(kandelaberPostGeo, poleMetalMat, kandelaberMatrices);
    const kandGlass = addMatrixArrayInstanced(kandelaberGlassGeo, kandelaberGlow, kandelaberMatrices, false);
    for (const m of [mastInst, mastLens]) if (m) m.name = 'DavosStreetlights';
    for (const m of [kandInst, kandGlass]) if (m) m.name = 'DavosCandelabras';
    addKnockable(mastInst, mastLens, davosMastMatrices, davosMastSites, 0.15);
    addKnockable(kandInst, kandGlass, kandelaberMatrices, kandelaberSites, 0.17);
  }
  if (berlinSignMatrices.size) {
    // One draw for every street's name blades (was one per street). The thin blades cast no sun shadow (their poles do).
    const labels = [...berlinSignMatrices.keys()];
    const atlas = createStreetSignAtlas(labels);
    const signMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
    const tile = attribute('aSignTile', 'vec2');
    signMat.colorNode = texture(atlas.texture, uv().add(vec2(tile.x, float(atlas.rows - 1).sub(tile.y))).div(vec2(SIGN_ATLAS_COLS, atlas.rows)));
    const signs = labels.flatMap((name, i) => berlinSignMatrices.get(name).map((m) => [m, i]));
    const signInst = new THREE.InstancedMesh(unitBox.clone(), signMat, signs.length);
    const tiles = new Float32Array(signs.length * 2);
    signs.forEach(([m, i], k) => {
      signInst.setMatrixAt(k, m);
      tiles[k * 2] = i % SIGN_ATLAS_COLS;
      tiles[k * 2 + 1] = Math.floor(i / SIGN_ATLAS_COLS);
    });
    signInst.geometry.setAttribute('aSignTile', new THREE.InstancedBufferAttribute(tiles, 2));
    signInst.receiveShadow = true;
    group.add(signInst);
  }

  // =========================================================================
  // 2B. VOLUMETRIC GOLDEN-HOUR CANYON SUN SHAFTS (GOD RAYS)
  // =========================================================================
  const godRayMat = createGodRayMaterial();
  const godRayGeo = new THREE.PlaneGeometry(54, 92);
  const canyonShafts = berlinStreetSites.filter(s => /Promenade|Talstrasse|Bahnhofstrasse/.test(s.name)).filter((s, i) => i % 9 === 0).slice(0, 8).map(s => ({ x: s.x, y: 24, z: s.z, rotY: Math.atan2(s.ux, s.uz), rotZ: -0.44 }));
  for (const cs of canyonShafts) {
    const shaft = new THREE.Mesh(godRayGeo, godRayMat);
    const at = fromOldFrame(cs.x, cs.z); // (authored on the former compressed grid)
    shaft.position.set(at.x, cs.y, at.z);
    shaft.rotation.set(0.12, cs.rotY, cs.rotZ);
    group.add(shaft);
  }

  // =========================================================================
  // 6. THE YELLOW POST BOXES ALONG THE STREETS (INSTANCED)
  // =========================================================================
  const mailboxPositions = [];
  for (let i = 5; i < berlinStreetSites.length; i += 23) {
    const s = berlinStreetSites[i];
    if (!waterAt(s.x, s.z)) mailboxPositions.push([s.x - s.ux * 2, s.z - s.uz * 2]);
  }
  const uspsMat = new THREE.MeshStandardNodeMaterial({ color: 0xe4b92e, roughness: 0.45, metalness: 0.35 });
  const mailboxInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.65, 1.25, 0.65), uspsMat, Math.max(1, mailboxPositions.length));
  mailboxInst.count = mailboxPositions.length;
  mailboxPositions.forEach(([mx, mz], i) => {
    dummy.position.set(mx, 0.84, mz);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mailboxInst.setMatrixAt(i, dummy.matrix);
  });
  mailboxInst.instanceMatrix.needsUpdate = true;
  if (mailboxPositions.length) group.add(mailboxInst);

  // =========================================================================
  // 7. LUSH TREES: PARKS & PLAZAS, CENTRAL PARK WOODLANDS, AVENUE & CROSS-STREET TREES
  //    London planes, honey locusts & American elms (one unified trunk + crown instanced mesh per species & band)
  // =========================================================================
  const treePositions = []; // { x, y, z, scale, species (0 plane, 1 honey locust, 2 elm / oak) }


  // B5. The squares, the other parks & the plazas (sites laid out by city-grid.js)
  for (const s of parkTreeSites || []) treePositions.push(s);

  console.info(`[streetDetails] ${treePositions.length} trees`);

  // Procedural trees (js/trees.js): species skeletons with leaf-spray cards, one instanced mesh per species, variant &
  // level of detail, each tree's level following the camera
  const treeField = createTreeField(scene, treePositions);
  group.add(treeField.group);
  // Whole-crown cards (level 2) only stand beyond trees.js' LOD_MID (420 m): from the ground that's far outside the
  // sun's shadow range (lighting.js, ~200 m at street level), so they stay out of the shadow passes there (~80 draws).
  // From the air, where the range grows to 720 m, they cast again (update below).
  // (the field makes its meshes as they are first needed, and gives the later ones the same setting)
  let farTreeShadows = true;
  const setFarTreeShadows = (on) => {
    if (on === farTreeShadows) return;
    farTreeShadows = on;
    treeField.setFarShadows(on);
  };
  setFarTreeShadows(false);

  // =========================================================================
  // 8. CLUSTERED STREETLIGHTS & STREET FURNITURE LIGHT POOLS
  // =========================================================================
  const STREETLIGHT_SPOT_POOL = 36;
  const STREET_POINT_POOL = 48;
  const STREETLIGHT_DIST = 115;
  const STREET_POINT_DIST = 110;

  const streetLightsGroup = new THREE.Group();
  streetLightsGroup.name = 'StreetClusteredLights';
  // The lamps are placed every frame in world space (flat-world site + the terrain's height there, below), so the
  // group must not be lifted by placeOnTerrain (terrain.js): as a geometry-less group it was lifted rigidly by the
  // terrain height at the origin (-22 m), which put every street light far below its street.
  streetLightsGroup.userData.terrain = 'absolute';
  scene.add(streetLightsGroup);

  const streetlightSpotPool = [];
  for (let i = 0; i < STREETLIGHT_SPOT_POOL; i++) {
    // Cobra-head LED luminaire: wide downward spread (0.96 rad half-angle) illuminating both road and sidewalk.
    // Davos: the masts' flat LED heads (cool white, ~4000 K) spread their light wide: ~28 m across at the cone's edge
    // from 8.9 m up (1.0 rad half-angle), brightest straight below and fading the whole way out (penumbra 0.9), so the
    // pools of neighbouring masts meet in a dim glow instead of standing as hard white discs on black asphalt.
    const spot = new THREE.SpotLight(0xe8eefb, 0, 34, 1.0, 0.9, 1.25);
    spot.position.set(0, -1000, 0);
    spot.target.position.set(0, -1001, 0);
    streetLightsGroup.add(spot, spot.target);
    streetlightSpotPool.push(spot);
  }

  const streetPointPool = [];
  for (let i = 0; i < STREET_POINT_POOL; i++) {
    const pt = new THREE.PointLight(0xffe4b4, 0, 12, 1.35);
    pt.position.set(0, -1000, 0);
    streetLightsGroup.add(pt);
    streetPointPool.push(pt);
  }

  // Source positions are static. Query nearby cells instead of scanning the island every frame.
  const LIGHT_CELL = 128;
  function indexLights(sites) {
    const cells = new Map();
    for (const s of sites) {
      const key = Math.floor(s.x / LIGHT_CELL) + ',' + Math.floor(s.z / LIGHT_CELL);
      let cell = cells.get(key);
      if (!cell) cells.set(key, cell = []);
      cell.push(s);
    }
    return cells;
  }
  const cobraCells = indexLights(cobraLampSites);
  const pointCells = indexLights(streetPointSites);

  function nearbyLights(cells, camera, range, active) {
    const { x: cx, y: cy, z: cz } = camera.position;
    const me = camera.matrixWorld.elements;
    const fwdX = -me[8], fwdZ = -me[10];
    let count = 0;
    for (let ix = Math.floor((cx - range) / LIGHT_CELL); ix <= Math.floor((cx + range) / LIGHT_CELL); ix++) {
      for (let iz = Math.floor((cz - range) / LIGHT_CELL); iz <= Math.floor((cz + range) / LIGHT_CELL); iz++) {
        for (const s of cells.get(ix + ',' + iz) || []) {
          if (s.off) continue; // (its mast was knocked over)
          const dx = s.x - cx, dz = s.z - cz;
          const d2 = dx * dx + dz * dz + cy * cy;
          if (d2 > range * range) continue;
          const effDist = Math.sqrt(d2) + Math.max(0, 6.0 - dx * fwdX - dz * fwdZ) * 2.8;
          if (effDist >= range) continue;
          s._effDist = effDist;
          active[count++] = s;
        }
      }
    }
    active.length = count;
    if (count > 1) active.sort((a, b) => a._effDist - b._effDist);
    return count;
  }

  const activeCobras = [];
  const activePoints = [];

  function smoothFade(d, start, end) {
    const t = Math.min(1, Math.max(0, (end - d) / (end - start)));
    return t * t * (3 - 2 * t);
  }

  function update(camera) {
    if (!camera) return;
    animateFalling();
    const altitude = camera.position.y - groundHeight(camera.position.x, camera.position.z);
    setFarTreeShadows(farTreeShadows ? altitude > 90 : altitude > 110);
    const glow = cityUniforms && cityUniforms.uInteriorGlow ? cityUniforms.uInteriorGlow.value : 0.48;
    // Streetlights fade in smoothly as dusk approaches (matching lampBulbGlow smoothstep(0.4, 1.1, uInteriorGlow))
    const lampScale = Math.min(1.25, Math.max(0.0, (glow - 0.36) * 1.15));
    if (lampScale <= 0.001) {
      for (let i = 0; i < STREETLIGHT_SPOT_POOL; i++) {
        streetlightSpotPool[i].intensity = 0;
        streetlightSpotPool[i].position.set(0, -1000, 0);
      }
      for (let i = 0; i < STREET_POINT_POOL; i++) {
        streetPointPool[i].intensity = 0;
        streetPointPool[i].position.set(0, -1000, 0);
      }
      return;
    }

    // Candela at the lamp: ~15 units of irradiance under a Davos mast, a mid-grey pool on the dark, wet asphalt (88
    // left it barely lighter than the moonlit street). Snow reflects it twenty times better than asphalt, so in
    // winter the lamps are turned down, still leaving their pools clearly brighter than in summer, not burnt-out white.
    const snowDim = 1 - 0.55 * winter.value;
    const lampCandela = 150.0 * lampScale * snowDim;

    const cobraCount = nearbyLights(cobraCells, camera, STREETLIGHT_DIST, activeCobras);

    const cobraCutoff = cobraCount > STREETLIGHT_SPOT_POOL
      ? Math.min(STREETLIGHT_DIST, activeCobras[STREETLIGHT_SPOT_POOL]._effDist)
      : STREETLIGHT_DIST;
    const spotUsed = Math.min(cobraCount, STREETLIGHT_SPOT_POOL);
    for (let i = 0; i < spotUsed; i++) {
      const s = activeCobras[i];
      const fade = smoothFade(s._effDist, cobraCutoff * 0.62, cobraCutoff);
      const spot = streetlightSpotPool[i];
      const h = s._h ?? (s._h = surfaceHeight(s.x, s.z)); // the street's terrain height (the masts stand lifted by it)
      spot.position.set(s.x, s.y + h, s.z);
      spot.target.position.set(s.tx, h, s.tz);
      spot.target.updateMatrixWorld();
      spot.intensity = lampCandela * fade;
    }
    for (let i = spotUsed; i < STREETLIGHT_SPOT_POOL; i++) {
      streetlightSpotPool[i].intensity = 0;
      streetlightSpotPool[i].position.set(0, -1000, 0);
    }

    const ptCount = nearbyLights(pointCells, camera, STREET_POINT_DIST, activePoints);

    const ptCutoff = ptCount > STREET_POINT_POOL
      ? Math.min(STREET_POINT_DIST, activePoints[STREET_POINT_POOL]._effDist)
      : STREET_POINT_DIST;
    const ptUsed = Math.min(ptCount, STREET_POINT_POOL);
    for (let i = 0; i < ptUsed; i++) {
      const s = activePoints[i];
      const fade = smoothFade(s._effDist, ptCutoff * 0.62, ptCutoff);
      const pt = streetPointPool[i];
      pt.color.setHex(s.color);
      pt.position.set(s.x, s.y + (s._h ?? (s._h = surfaceHeight(s.x, s.z))), s.z);
      pt.distance = s.dist;
      pt.intensity = s.intensity * lampScale * fade * snowDim;
    }
    for (let i = ptUsed; i < STREET_POINT_POOL; i++) {
      streetPointPool[i].intensity = 0;
      streetPointPool[i].position.set(0, -1000, 0);
    }
  }

  scene.add(group);
  return { group, footprints, signalClock, signalIntersections, audioSignals, update, trees: treePositions, knockablePosts };
}

export { buildStreetDetails };
