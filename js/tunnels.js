import * as THREE from 'three/webgpu';
import { getRoadTunnels, getRhBTunnels, tunnelOpenRuns, groundHeight, TUNNEL_ROOF, ROAD_TOP } from './terrain.js';

// The mountain is the roof above a tunnel; terrain.js cuts its surface open at the mouths. Drawn here, at the height of
// the road or the track: the open cut (floor and retaining walls up to the ground) and, from the mouth on, the bore
// (floor, lining, lamps). One mesh per material over all the tunnels: a few draw calls and some 50 000 triangles.
// The bore is lit by its lamps, not by the sun that the terrain (which casts no shadow) would let in: unlit colours.
const MATERIALS = {
  asphaltOut: new THREE.MeshStandardNodeMaterial({ color: 0x3a3d40, roughness: 0.96, side: THREE.DoubleSide }),
  ballastOut: new THREE.MeshStandardNodeMaterial({ color: 0x55575a, roughness: 1, side: THREE.DoubleSide }),
  concrete: new THREE.MeshStandardNodeMaterial({ color: 0x8c8b84, roughness: 0.96, side: THREE.DoubleSide }),
  steel: new THREE.MeshStandardNodeMaterial({ color: 0x85898a, metalness: 0.65, roughness: 0.45, side: THREE.DoubleSide }),
  asphaltIn: new THREE.MeshBasicNodeMaterial({ color: 0x2b2d30, side: THREE.DoubleSide }),
  ballastIn: new THREE.MeshBasicNodeMaterial({ color: 0x302f2d, side: THREE.DoubleSide }),
  wall: new THREE.MeshBasicNodeMaterial({ color: 0x6a6c69, side: THREE.DoubleSide }),
  vault: new THREE.MeshBasicNodeMaterial({ color: 0x3b3d3d, side: THREE.DoubleSide }),
  marking: new THREE.MeshBasicNodeMaterial({ color: 0xd7d3bb, side: THREE.DoubleSide }),
  lamp: new THREE.MeshBasicNodeMaterial({ color: 0xffe6ae, side: THREE.DoubleSide })
};

const quad = (out, a, b, c, d) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
// A point `side` metres to the right of the centreline at p and `up` above its floor
const at = (p, side, up) => [p.x - p.dz * side, p.y + up, p.z + p.dx * side];
const groundAt = (p, side) => groundHeight(p.x - p.dz * side, p.z + p.dx * side);

function box(out, p, side, up, halfW, h, along, depth) {
  const c = (s, u, d) => [p.x - p.dz * s + p.dx * d, p.y + u, p.z + p.dx * s + p.dz * d];
  const s0 = side - halfW, s1 = side + halfW, u0 = up, u1 = up + h, d0 = along - depth / 2, d1 = along + depth / 2;
  quad(out, c(s0, u0, d0), c(s1, u0, d0), c(s1, u1, d0), c(s0, u1, d0));
  quad(out, c(s0, u0, d1), c(s1, u0, d1), c(s1, u1, d1), c(s0, u1, d1));
  quad(out, c(s0, u0, d0), c(s0, u0, d1), c(s0, u1, d1), c(s0, u1, d0));
  quad(out, c(s1, u0, d0), c(s1, u0, d1), c(s1, u1, d1), c(s1, u1, d0));
  quad(out, c(s0, u1, d0), c(s1, u1, d0), c(s1, u1, d1), c(s0, u1, d1));
}

// A mouth: the concrete frame and, above it, the head wall up to the ground. `dir`: which way the bore runs (+1 onward).
function addMouth(parts, p, half, height, dir) {
  const post = 0.45, depth = 1.2;
  box(parts.concrete, p, -half + post / 2, 0, post / 2, height, -dir * depth / 2, depth);
  box(parts.concrete, p, half - post / 2, 0, post / 2, height, -dir * depth / 2, depth);
  box(parts.concrete, p, 0, height - 0.9, half, 1.1, -dir * depth / 2, depth);
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const s0 = -half + 2 * half * i / steps, s1 = -half + 2 * half * (i + 1) / steps;
    const top0 = groundAt(p, s0) - p.y + 0.3, top1 = groundAt(p, s1) - p.y + 0.3;
    if (top0 <= height && top1 <= height) continue;
    quad(parts.concrete, at(p, s0, height), at(p, s1, height), at(p, s1, Math.max(top1, height)), at(p, s0, Math.max(top0, height)));
  }
}

function addTunnel(parts, profile, railway) {
  const half = profile.width / 2, height = railway ? TUNNEL_ROOF.rail : TUNNEL_ROOF.road;
  const floorUp = railway ? ROAD_TOP / 2 : ROAD_TOP - 0.02;
  const runs = tunnelOpenRuns(profile);
  const isOpen = (s) => runs.some((r) => s >= r.from && s <= r.to);
  // The cross-sections: every 2 m along an open cut (its walls follow the ground), every 8 m in the bore
  const stops = new Set([0, profile.length, ...profile.cumulative]);
  for (const r of runs) { stops.add(r.from); stops.add(r.to); }
  for (let s = 0; s < profile.length; s += isOpen(s) ? 2 : 8) stops.add(s);
  const list = [...stops].sort((a, b) => a - b).filter((s, i, all) => i === 0 || s - all[i - 1] > 0.05);
  for (let i = 0; i + 1 < list.length; i++) {
    const s0 = list[i], s1 = list[i + 1], open = isOpen((s0 + s1) / 2);
    const a = profile.at(s0), b = profile.at(s1);
    const floor = railway ? (open ? parts.ballastOut : parts.ballastIn) : (open ? parts.asphaltOut : parts.asphaltIn);
    quad(floor, at(a, -half, floorUp), at(a, half, floorUp), at(b, half, floorUp), at(b, -half, floorUp));
    if (open) {
      for (const side of [-half, half]) {
        const topA = groundAt(a, side) - a.y + 0.15, topB = groundAt(b, side) - b.y + 0.15;
        if (topA <= 0 && topB <= 0) continue;
        quad(parts.concrete, at(a, side, 0), at(b, side, 0), at(b, side, Math.max(topB, 0)), at(a, side, Math.max(topA, 0)));
      }
    } else {
      const v = height - 1;
      quad(parts.wall, at(a, -half, 0), at(b, -half, 0), at(b, -half, v), at(a, -half, v));
      quad(parts.wall, at(a, half, 0), at(b, half, 0), at(b, half, v), at(a, half, v));
      quad(parts.vault, at(a, -half, v), at(b, -half, v), at(b, -half + 1, height), at(a, -half + 1, height));
      quad(parts.vault, at(a, half, v), at(b, half, v), at(b, half - 1, height), at(a, half - 1, height));
      quad(parts.vault, at(a, -half + 1, height), at(b, -half + 1, height), at(b, half - 1, height), at(a, half - 1, height));
    }
    if (railway) {
      for (const offset of [-0.5, 0.5]) quad(parts.steel,
        at(a, offset - 0.055, 0.14), at(a, offset + 0.055, 0.14), at(b, offset + 0.055, 0.14), at(b, offset - 0.055, 0.14));
    }
  }
  if (!railway) for (let s = 4; s < profile.length - 4; s += 12) {
    const a = profile.at(s), b = profile.at(s + 3);
    quad(parts.marking, at(a, -0.06, floorUp + 0.02), at(a, 0.06, floorUp + 0.02), at(b, 0.06, floorUp + 0.02), at(b, -0.06, floorUp + 0.02));
  }
  for (let s = 12; s < profile.length - 12; s += railway ? 50 : 30) {
    if (isOpen(s)) continue;
    const a = profile.at(s), b = profile.at(s + 1.4);
    quad(parts.lamp, at(a, -0.55, height - 0.05), at(a, 0.55, height - 0.05), at(b, 0.55, height - 0.05), at(b, -0.55, height - 0.05));
  }
  // The mouths: where a bore begins or ends, at the tunnel's own end or at the end of an open cut
  const mouths = [];
  if (!isOpen(0.01)) mouths.push([0, 1]);
  if (!isOpen(profile.length - 0.01)) mouths.push([profile.length, -1]);
  for (const r of runs) {
    if (r.to < profile.length) mouths.push([r.to, 1]);
    if (r.from > 0) mouths.push([r.from, -1]);
  }
  for (const [s, dir] of mouths) addMouth(parts, profile.at(s), half, height, dir);
}

export function buildTunnels(scene) {
  const group = new THREE.Group();
  group.name = 'Landwasser and RhB tunnels';
  group.userData.terrain = 'absolute';
  const parts = Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, []]));
  for (const profile of getRoadTunnels()) addTunnel(parts, profile, false);
  for (const profile of getRhBTunnels()) addTunnel(parts, profile, true);
  for (const [name, vertices] of Object.entries(parts)) {
    if (!vertices.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, MATERIALS[name]);
    mesh.name = `tunnels ${name}`;
    mesh.receiveShadow = MATERIALS[name].isMeshStandardNodeMaterial === true;
    group.add(mesh);
  }
  scene.add(group);
  return group;
}
