import * as THREE from 'three/webgpu';
import { attribute, mix, smoothstep, vertexColor } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cityUniforms } from './tsl-materials.js';
import { addPlatform } from './terrain.js';
import { boxInWorld } from './quality.js';

// The Rega landing pad of the Spital Davos (Promenade 4, Davos Platz): a raised deck on the flat roof of the hospital's
// low western wing (OSM w93469657, building=hospital, emergency=yes; no aeroway tag). Position and size from the
// SWISSIMAGE orthophoto (tools/data/cache/swissimage/192-640-0.25-m32.jpg: the light ~13 m square with the red cross
// over the wing, LV95 ~2781361 / 1184575) and from swissBUILDINGS3D (tile 11/1741/1001: the platform's top at
// 1562.7 m a.s.l., 2 m over the wing's roof at 1560.7 m, 14.5 m over the ground at 1548.2 m).
// Built small — the pad slab with its marking (one canvas texture) and one merged mesh for the perimeter lights and the
// windsock: two draw calls — and registered as a platform with the terrain (addPlatform), so the helicopter lands on
// it as on the ground (js/controllers.js updateHelicopter: the floor is surfaceHeight).
export const HELIPAD = {
  x: -1139, z: 924.5, // world frame (js/davos-frame.js)
  y: 4.75, // the pad's surface (1562.75 m a.s.l.), a hand over the surveyed platform
  size: 12.6, // m, square
  rotation: 0.17, // rad about y: the square turned with the wing (its east edge runs ~10° off north)
  radius: 7.5 // the platform disc the helicopter can set down on (reaches the corners)
};

// The marking: a light grey deck, the hospital heliport's white cross (ICAO Annex 14 vol. II) with a red H in the middle,
// a white edge line
function padTexture() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), m = S / HELIPAD.size; // px per metre
  g.fillStyle = '#9ea3a6';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#f2f2f0';
  g.lineWidth = 0.35 * m;
  g.strokeRect(0.5 * m, 0.5 * m, S - m, S - m);
  g.fillStyle = '#f2f2f0';
  const arm = 2.6 * m, len = 9 * m, h = S / 2;
  g.fillRect(h - arm / 2, h - len / 2, arm, len);
  g.fillRect(h - len / 2, h - arm / 2, len, arm);
  g.fillStyle = '#d2232a';
  g.font = `bold ${Math.round(3.2 * m)}px Helvetica, Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('H', h, h + 0.1 * m);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function colored(geometry, r, g, b, glow = 0) {
  const n = geometry.attributes.position.count;
  const colors = new Float32Array(n * 3), glows = new Float32Array(n);
  for (let i = 0; i < n; i++) { colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b; glows[i] = glow; }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aGlow', new THREE.BufferAttribute(glows, 1));
  return geometry;
}

// Perimeter lights round the deck (green, white at the corners) and the windsock at the north-east corner, one geometry
function furnitureGeometry() {
  const parts = [];
  const half = HELIPAD.size / 2, inset = 0.45;
  const lamp = (x, z, white) => {
    const dome = new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.translate(x, 0.1, z);
    parts.push(white ? colored(dome, 1, 0.97, 0.85, 1) : colored(dome, 0.25, 1, 0.4, 1));
    const base = new THREE.CylinderGeometry(0.14, 0.16, 0.1, 8);
    base.translate(x, 0.05, z);
    parts.push(colored(base, 0.55, 0.55, 0.5));
  };
  for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) {
    if (u === 0 && v === 0) continue;
    if (u !== 0 && v !== 0) lamp(u * (half - inset), v * (half - inset), true);
    else lamp(u * (half - inset), v * (half - inset), false);
  }
  // Windsock: a 3.4 m mast just off the north-east corner, the sock in orange and white bands streaming down the valley
  // (the wind along the Landwassertal, towards Davos Dorf)
  const mx = half + 1.4, mz = -half - 1.0;
  const mast = new THREE.CylinderGeometry(0.035, 0.05, 3.4, 8);
  mast.translate(mx, 1.7, mz);
  parts.push(colored(mast, 0.75, 0.76, 0.78));
  const ring = new THREE.TorusGeometry(0.26, 0.02, 6, 16);
  ring.rotateY(Math.PI / 2);
  ring.translate(mx, 3.3, mz);
  parts.push(colored(ring, 0.75, 0.76, 0.78));
  const bands = 5, sockLen = 1.5;
  for (let i = 0; i < bands; i++) {
    const r0 = 0.26 - (0.26 - 0.1) * (i / bands), r1 = 0.26 - (0.26 - 0.1) * ((i + 1) / bands);
    const band = new THREE.CylinderGeometry(r1, r0, sockLen / bands, 10, 1, true);
    band.rotateZ(-Math.PI / 2 - 0.1 * (i + 1)); // along +x from the ring, the mouth there, sagging towards the tip
    band.translate(mx + sockLen / bands * (i + 0.5), 3.3 - 0.05 * i * (i + 1) / 2, mz);
    parts.push(i % 2 ? colored(band, 0.95, 0.95, 0.92) : colored(band, 1, 0.42, 0.05));
  }
  return mergeGeometries(parts, false);
}

export function buildHelipad(scene) {
  const group = new THREE.Group();
  group.name = 'Rega-Landeplatz Spital Davos';
  group.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const { x, z, y, size, rotation, radius } = HELIPAD;
  addPlatform(x, z, radius, y);
  if (!boxInWorld(x - radius, x + radius, z - radius, z + radius, 300)) return { group }; // (beyond the mobile profile's town)

  const slab = new THREE.Mesh(new THREE.BoxGeometry(size, 0.14, size), new THREE.MeshStandardNodeMaterial({ map: padTexture(), roughness: 0.85, metalness: 0 }));
  slab.name = 'Landing pad';
  slab.position.y = -0.07;
  slab.receiveShadow = true;
  group.add(slab);
  // The deck's plinth down to the wing's roof (2 m, the surveyed platform; it also carries the deck over the lower
  // OSM-extruded stand-in drawn until the swissBUILDINGS3D tile is in)
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(size - 0.8, 2.0, size - 0.8), new THREE.MeshStandardNodeMaterial({ color: 0x5a5e62, roughness: 0.7, metalness: 0.2 }));
  plinth.name = 'Landing pad plinth';
  plinth.position.y = -1.14;
  group.add(plinth);

  const furnitureMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 });
  // The lights glow from dusk on (the shared interior-glow uniform, as the street lamps' globes)
  const night = smoothstep(0.35, 1.3, cityUniforms.uInteriorGlow);
  furnitureMat.emissiveNode = vertexColor().rgb.mul(attribute('aGlow', 'float')).mul(mix(0.08, 6, night));
  const furniture = new THREE.Mesh(furnitureGeometry(), furnitureMat);
  furniture.name = 'Pad lights & windsock';
  furniture.castShadow = true;
  group.add(furniture);

  group.position.set(x, y, z);
  group.rotation.y = rotation;
  group.updateMatrixWorld(true);
  scene.add(group);
  return { group };
}
