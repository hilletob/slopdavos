import * as THREE from 'three/webgpu';
import { Fn, attribute, cameraPosition, clamp, exp, float, fract, fwidth, max, mix, normalize, positionWorld, smoothstep, vec3 } from 'three/tsl';
import { getRoadTunnels, getRhBTunnels, tunnelOpenRuns, groundHeight, TUNNEL_ROOF, ROAD_TOP } from './terrain.js';
import { cityUniforms } from './tsl-materials.js';

// The mountain is the roof above a tunnel; terrain.js cuts its surface open at the mouths. Drawn here, at the height of
// the road or the track: the open cut (floor and retaining walls up to the ground) and, from the mouth on, the bore
// (floor, arched lining). One mesh per material over all the tunnels: a few draw calls and some 22 000 triangles.
//
// The bore is lit by its lamps, not by the sun that the terrain (which casts no shadow) would let in, and there is not
// one real light in it: lamps, their pools of light and the road's markings are all worked out per fragment from where
// it lies in the bore, the vertex attribute `tunnelCoord` (metres along the tunnel, metres right of the centreline,
// metres above the floor, metres to the nearer mouth). No texture; every pattern is filtered by its own footprint on
// screen (`pulse`, `stripes`, the pools' `far`), so far down the tunnel the lamps melt into a steady line of light
// instead of flickering.
export const ROAD_BORE = {
  roof: TUNNEL_ROOF.road, half: 5,
  period: 8, row: 2.5, lampLength: 0.85, lampWidth: 0.17, lamp: 15, lampTint: [1.0, 0.72, 0.38], // two rows, over the lanes
  tint: [1.0, 0.6, 0.24], ambient: 0.3, pool: 5, sharpen: 2, // (ambient: what comes round from all the other lamps)
  threshold: 1.1, spill: 1.3, // by day, more lamps in the first metres (the adaptation zone) and daylight falling in
  wallPaint: 3.1, wallAlbedo: 0.22, paintAlbedo: 0.42, crownAlbedo: 0.11, floorAlbedo: 0.09, sos: 150
};
export const RAIL_BORE = {
  roof: TUNNEL_ROOF.rail, half: 3,
  period: 26, row: 0, lampLength: 0.45, lampWidth: 0.07, lamp: 5, lampTint: [1.0, 0.9, 0.72], // sparse working lights
  tint: [1.0, 0.88, 0.68], ambient: 0.2, pool: 2.6, sharpen: 0.8,
  threshold: 0, spill: 1,
  wallPaint: 0, wallAlbedo: 0.26, paintAlbedo: 0.26, crownAlbedo: 0.12, floorAlbedo: 0.09, sos: 0
};
const DASH = { first: 4, period: 12, length: 3 };
const SOS_FIRST = 75; // (a niche every ROAD_BORE.sos metres from here on)

const coord = attribute('tunnelCoord', 'vec4');
const tone = (rgb) => vec3(rgb[0], rgb[1], rgb[2]);
// The share of a pixel `footprint` wide covered by a stripe of half width `half`, at `x` from its centre
const edge = (x, footprint) => clamp(x.div(footprint).add(0.5), 0, 1);
const pulse = (x, half, footprint) => edge(x.add(half), footprint).sub(edge(x.sub(half), footprint));
// Distance to the nearest of a row of planes `period` apart
const toRow = (s, period, first = 0) => fract(s.sub(first).div(period).add(0.5)).sub(0.5).abs().mul(period);
// The same for a row of stripes: too far off to tell apart, their mean
const stripes = (s, footprint, period, first, half) => mix(pulse(toRow(s, period, first), half, footprint), float(2 * half / period), smoothstep(period * 0.5, period, footprint));

// The light falling on a point of the bore: the two nearest lamps of the nearest row, inverse square. (`vertical`
// shortens the drop to the floor a little, for the rows beyond and the light off the walls.)
function boreLight(b, vertical = 1) {
  const s = coord.x, side = coord.y, up = coord.z, mouth = coord.w;
  const footprint = max(fwidth(s), 0.0001);
  // Far off, a point stands for the whole period: its mean, not whichever lamp the pixel happens to fall on.
  const far = smoothstep(b.period * 0.2, b.period * 0.7, footprint);
  const along = mix(toRow(s, b.period), float(b.period * 0.27), far).mul(b.sharpen);
  const beyond = float(b.period * b.sharpen).sub(along);
  const across = side.abs().sub(b.row);
  const drop = float(b.roof).sub(up).mul(vertical);
  const h2 = across.mul(across).add(drop.mul(drop)).add(1);
  const pools = float(1).div(h2.add(along.mul(along))).add(float(1).div(h2.add(beyond.mul(beyond))));
  const day = smoothstep(1.35, 0.45, cityUniforms.uInteriorGlow);
  const zone = float(1).add(day.mul(b.threshold).mul(exp(mouth.div(70).negate())));
  const lamps = tone(b.tint).mul(pools.mul(b.pool).add(b.ambient)).mul(zone);
  return lamps.add(vec3(0.92, 0.98, 1.08).mul(day.mul(b.spill).mul(exp(mouth.div(10).negate()))));
}

function boreLiningMaterial(b) {
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
  material.colorNode = Fn(() => {
    const s = coord.x, side = coord.y, up = coord.z;
    const footprint = max(fwidth(s), 0.0001), sideFootprint = max(fwidth(side), 0.0001);
    // The lining: soot on the crown, concrete, and the painted band along the road tunnels' walls
    const crown = smoothstep(b.roof - 2.4, b.roof - 0.6, up);
    const painted = smoothstep(b.wallPaint + 0.02, b.wallPaint - 0.02, up);
    const albedo = mix(mix(float(b.wallAlbedo), float(b.paintAlbedo), painted), float(b.crownAlbedo), crown);
    const jointed = albedo.mul(float(1).sub(stripes(s, footprint, 10, 5, 0.03).mul(0.3))); // (the joints of the formwork)
    const across = side.abs().sub(b.row);
    const inCrown = smoothstep(b.roof - 0.03, b.roof - 0.01, up);
    const rim = stripes(s, footprint, b.period, 0, b.lampLength + 0.1).mul(pulse(across, float(b.lampWidth + 0.08), sideFootprint)).mul(inCrown);
    let light = boreLight(b, 0.7);
    if (b.sos) { // (the niches, on the right-hand wall, have a light of their own)
      const toNiche = toRow(s, b.sos, SOS_FIRST).div(3.2);
      const wall = smoothstep(b.half - 0.2, b.half - 0.05, side).mul(smoothstep(3.7, 2.7, up));
      light = light.add(tone([1, 0.86, 0.66]).mul(exp(toNiche.mul(toNiche).negate()).mul(wall).mul(0.55)));
    }
    const surface = light.mul(jointed).mul(float(1).sub(rim.mul(0.75)));
    // The lamp: its glass, seen from any distance (a far lamp shrinks below a pixel, so it is made up in brightness)
    const glass = stripes(s, footprint, b.period, 0, b.lampLength).mul(pulse(across, float(b.lampWidth), sideFootprint)).mul(inCrown);
    const boost = float(1).add(smoothstep(b.period * 0.1, b.period, footprint).mul(1.6));
    return surface.add(tone(b.lampTint).mul(glass.mul(b.lamp).mul(boost)));
  })();
  return material;
}

function boreFloorMaterial(b, road) {
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
  material.colorNode = Fn(() => {
    const s = coord.x, side = coord.y;
    const footprint = max(fwidth(s), 0.0001), sideFootprint = max(fwidth(side), 0.0001);
    let albedo = float(b.floorAlbedo);
    if (road) {
      // The walkways along the walls, the edge lines and the dashed centre line
      const walkway = smoothstep(b.half - 1.02, b.half - 0.98, side.abs());
      const edgeLine = pulse(side.abs().sub(b.half - 1.15), float(0.075), sideFootprint);
      const dashes = stripes(s, footprint, DASH.period, DASH.first + DASH.length / 2, DASH.length / 2).mul(pulse(side, float(0.07), sideFootprint));
      albedo = mix(mix(albedo, float(0.17), walkway), float(0.68), edgeLine.add(dashes));
    } else {
      // The sleepers and the rails, painted: in the bore they catch the lamps, where the rails' own steel would catch the sun
      const sleepers = stripes(s, footprint, 0.65, 0, 0.13).mul(pulse(side, float(1.15), sideFootprint));
      const rails = pulse(side.abs().sub(0.5), float(0.055), sideFootprint);
      albedo = mix(mix(albedo, float(0.2), sleepers), float(0.6), rails);
    }
    // Asphalt turns glossy at a grazing angle: the road ahead shines with the lamps
    const grazing = float(1).sub(normalize(positionWorld.sub(cameraPosition)).y.abs());
    const g2 = grazing.mul(grazing);
    return boreLight(b, 0.62).mul(albedo.add(g2.mul(g2).mul(0.07)));
  })();
  return material;
}

const MATERIALS = {
  asphaltOut: new THREE.MeshStandardNodeMaterial({ color: 0x3a3d40, roughness: 0.96, side: THREE.DoubleSide }),
  ballastOut: new THREE.MeshStandardNodeMaterial({ color: 0x55575a, roughness: 1, side: THREE.DoubleSide }),
  concrete: new THREE.MeshStandardNodeMaterial({ color: 0x8c8b84, roughness: 0.96, side: THREE.DoubleSide }),
  steel: new THREE.MeshStandardNodeMaterial({ color: 0x85898a, metalness: 0.65, roughness: 0.45, side: THREE.DoubleSide }),
  marking: new THREE.MeshStandardNodeMaterial({ color: 0xd7d3bb, roughness: 0.8, side: THREE.DoubleSide }), // (the open cuts'; the bore paints its own)
  roadFloor: boreFloorMaterial(ROAD_BORE, true),
  roadLining: boreLiningMaterial(ROAD_BORE),
  railFloor: boreFloorMaterial(RAIL_BORE, false),
  railLining: boreLiningMaterial(RAIL_BORE),
  signs: new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false }) // (the SOS niches, by their vertex `tone`)
};
MATERIALS.signs.colorNode = attribute('tone', 'vec3');
const BORE_MESHES = new Set(['roadFloor', 'roadLining', 'railFloor', 'railLining']);

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

// A strip of the bore between cross-sections a and b, across from (side0, up0) to (side1, up1); ma, mb: metres to the mouth
function boreStrip(part, a, b, side0, up0, side1, up1, ma, mb) {
  quad(part.position, at(a, side0, up0), at(a, side1, up1), at(b, side1, up1), at(b, side0, up0));
  const c0 = [a.s, side0, up0, ma], c1 = [a.s, side1, up1, ma], c2 = [b.s, side1, up1, mb], c3 = [b.s, side0, up0, mb];
  part.tunnelCoord.push(...c0, ...c1, ...c2, ...c0, ...c2, ...c3);
}

// The lining's half section, wall foot to crown: [side, up], the side measured out from the centreline
const ARCH_CHORDS = 3;
function archSection(half, roof) {
  const spring = roof - 2, crown = half * 0.56;
  const points = [[half, 0]];
  for (let i = 0; i <= ARCH_CHORDS; i++) {
    const t = i / ARCH_CHORDS * Math.PI / 2;
    points.push([crown + (half - crown) * Math.cos(t), spring + (roof - spring) * Math.sin(t)]);
  }
  return points;
}

// One SOS niche on the right-hand wall: the lit door, the lamp over it, and the blue sign standing out from the wall
function addNiche(part, p, half) {
  const paint = (rgb, ...args) => {
    const before = part.position.length;
    box(part.position, p, ...args);
    for (let i = before; i < part.position.length; i += 3) part.tone.push(...rgb);
  };
  paint([0.95, 0.36, 0.05], half - 0.03, 0.2, 0.03, 2.1, 0, 1.3);
  paint([6, 4.6, 2.6], half - 0.06, 2.42, 0.06, 0.08, 0, 1.3);
  paint([0.03, 0.16, 1.5], half - 0.5, 2.62, 0.48, 0.62, 0, 0.05);
}

// A mouth: the concrete frame and, above it, the head wall up to the ground. `dir`: which way the bore runs (+1 onward).
function addMouth(parts, p, half, height, dir, arch) {
  // (closing the corners between the rectangular frame and the arch of the lining behind it)
  for (const sign of [-1, 1]) for (let i = 1; i + 1 < arch.length; i++) {
    parts.concrete.push(...at(p, sign * arch[i][0], arch[i][1]), ...at(p, sign * arch[i + 1][0], arch[i + 1][1]), ...at(p, sign * half, height));
  }
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
  const bore = railway ? RAIL_BORE : ROAD_BORE;
  const half = profile.width / 2, height = bore.roof;
  const floorUp = railway ? ROAD_TOP / 2 : ROAD_TOP - 0.02;
  const runs = tunnelOpenRuns(profile);
  const isOpen = (s) => runs.some((r) => s >= r.from && s <= r.to);
  const arch = archSection(half, height);
  // The mouths: where a bore begins or ends, at the tunnel's own end or at the end of an open cut
  const mouths = [];
  if (!isOpen(0.01)) mouths.push([0, 1]);
  if (!isOpen(profile.length - 0.01)) mouths.push([profile.length, -1]);
  for (const r of runs) {
    if (r.to < profile.length) mouths.push([r.to, 1]);
    if (r.from > 0) mouths.push([r.from, -1]);
  }
  const toMouth = (s) => mouths.reduce((best, [m]) => Math.min(best, Math.abs(s - m)), Infinity);
  // The cross-sections: every 2 m along an open cut (its walls follow the ground), every 8 m in the bore
  const stops = new Set([0, profile.length, ...profile.cumulative]);
  for (const r of runs) { stops.add(r.from); stops.add(r.to); }
  for (let s = 0; s < profile.length; s += isOpen(s) ? 2 : 8) stops.add(s);
  const list = [...stops].sort((a, b) => a - b).filter((s, i, all) => i === 0 || s - all[i - 1] > 0.05);
  const floor = railway ? parts.railFloor : parts.roadFloor, lining = railway ? parts.railLining : parts.roadLining;
  for (let i = 0; i + 1 < list.length; i++) {
    const s0 = list[i], s1 = list[i + 1], open = isOpen((s0 + s1) / 2);
    const a = profile.at(s0), b = profile.at(s1);
    if (open) {
      quad(railway ? parts.ballastOut : parts.asphaltOut, at(a, -half, floorUp), at(a, half, floorUp), at(b, half, floorUp), at(b, -half, floorUp));
      for (const side of [-half, half]) {
        const topA = groundAt(a, side) - a.y + 0.15, topB = groundAt(b, side) - b.y + 0.15;
        if (topA <= 0 && topB <= 0) continue;
        quad(parts.concrete, at(a, side, 0), at(b, side, 0), at(b, side, Math.max(topB, 0)), at(a, side, Math.max(topA, 0)));
      }
    } else {
      const ma = toMouth(s0), mb = toMouth(s1);
      boreStrip(floor, a, b, -half, floorUp, half, floorUp, ma, mb);
      for (const sign of [-1, 1]) for (let k = 0; k + 1 < arch.length; k++) {
        boreStrip(lining, a, b, sign * arch[k][0], arch[k][1], sign * arch[k + 1][0], arch[k + 1][1], ma, mb);
      }
      const crown = arch.at(-1);
      boreStrip(lining, a, b, -crown[0], crown[1], crown[0], crown[1], ma, mb);
    }
    if (railway && open) {
      for (const offset of [-0.5, 0.5]) quad(parts.steel,
        at(a, offset - 0.055, 0.14), at(a, offset + 0.055, 0.14), at(b, offset + 0.055, 0.14), at(b, offset - 0.055, 0.14));
    }
  }
  if (!railway) {
    for (let s = DASH.first; s < profile.length - DASH.first; s += DASH.period) {
      if (!isOpen(s) || !isOpen(s + DASH.length)) continue;
      const a = profile.at(s), b = profile.at(s + DASH.length);
      quad(parts.marking, at(a, -0.06, floorUp + 0.02), at(a, 0.06, floorUp + 0.02), at(b, 0.06, floorUp + 0.02), at(b, -0.06, floorUp + 0.02));
    }
    for (let s = SOS_FIRST; s < profile.length; s += bore.sos) {
      if (!isOpen(s) && toMouth(s) > 5) addNiche(parts.signs, profile.at(s), half);
    }
  }
  for (const [s, dir] of mouths) addMouth(parts, profile.at(s), half, height, dir, arch);
}

export function buildTunnels(scene) {
  const group = new THREE.Group();
  group.name = 'Landwasser and RhB tunnels';
  group.userData.terrain = 'absolute';
  const parts = {};
  for (const name of Object.keys(MATERIALS)) {
    parts[name] = BORE_MESHES.has(name) ? { position: [], tunnelCoord: [] } : name === 'signs' ? { position: [], tone: [] } : [];
  }
  for (const profile of getRoadTunnels()) addTunnel(parts, profile, false);
  for (const profile of getRhBTunnels()) addTunnel(parts, profile, true);
  for (const [name, part] of Object.entries(parts)) {
    const vertices = part.position || part;
    if (!vertices.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    if (part.tunnelCoord) geometry.setAttribute('tunnelCoord', new THREE.Float32BufferAttribute(part.tunnelCoord, 4));
    if (part.tone) geometry.setAttribute('tone', new THREE.Float32BufferAttribute(part.tone, 3));
    if (!part.position) geometry.computeVertexNormals(); // (the bore's unlit materials read no normals)
    const mesh = new THREE.Mesh(geometry, MATERIALS[name]);
    mesh.name = `tunnels ${name}`;
    mesh.receiveShadow = MATERIALS[name].isMeshStandardNodeMaterial === true;
    group.add(mesh);
  }
  scene.add(group);
  return group;
}
