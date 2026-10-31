import * as THREE from 'three/webgpu';
import { float, fract, mix, mx_noise_float, positionGeometry, positionLocal, positionWorld, smoothstep, uv, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DAVOS_DATA } from './davos-geodata.js';
import { drapeOverlay, groundHeight } from './terrain.js';
import { winter } from './season.js';
import { chunkedMeshes } from './scene-culling.js';

// The cross-country ski trails of Davos (OSM piste:type=nordic in js/davos-geodata.js: the Landwasser and Flüela
// trails, the Sertig and Dischma, the Nachtloipe...), groomed into the snow in winter and gone in summer (they fade
// with season.js's `winter`). As groomed: two classic tracks (each two grooves 0.22 m apart), a skating lane in fine
// corduroy, or a skating lane between two classic tracks; laid on the terrain over the roads and paths they share.
// Wooden marker posts with turquoise tops stand along them every 25-50 m.

// Widths in metres; `skate`: the skating lane [from, to] across the centre line, `tracks`: the classic tracks' centres
const LAYOUT = {
  classic: { width: 3.0, skate: null, tracks: [-0.65, 0.65] },
  skating: { width: 4.0, skate: [-2.0, 2.0], tracks: [] },
  'classic+skating': { width: 6.5, skate: [-1.9, 1.9], tracks: [-2.6, 2.6] }
};

// Strips along each trail: uv.x across (0 left edge, 1 right edge), uv.y along in metres
function strips(trails, width) {
  const geometries = [];
  for (const r of trails) {
    const positions = [], uvs = [];
    let along = 0;
    for (let i = 2; i < r.pts.length; i += 2) {
      const ax = r.pts[i - 2], az = r.pts[i - 1], bx = r.pts[i], bz = r.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.05) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      const p = (s, side) => [(s ? bx : ax) + nx * side * width / 2, 0, (s ? bz : az) + nz * side * width / 2];
      const t = (s, side) => [(side + 1) / 2, along + (s ? L : 0)];
      // (counter-clockwise seen from above, so that the strips face up)
      positions.push(...p(0, -1), ...p(1, 1), ...p(1, -1), ...p(0, -1), ...p(0, 1), ...p(1, 1));
      uvs.push(...t(0, -1), ...t(1, 1), ...t(1, -1), ...t(0, -1), ...t(0, 1), ...t(1, 1));
      along += L;
    }
    if (!positions.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(positions.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometries.push(drapeOverlay(g, { maxEdge: 4, lift: 0.16 }));
    g.dispose();
  }
  return geometries.length ? mergeGeometries(geometries, false) : null;
}

function createLoipeMaterial({ width, skate, tracks }) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0, transparent: true, depthWrite: false });
  const across = uv().x.sub(0.5).mul(width); // metres from the centre line
  const sparkle = mx_noise_float(positionWorld.xz.mul(4)).mul(0.5).add(0.5);
  // Groomed snow is compacted and a little greyer and bluer than the fresh powder around it
  let snow = mix(vec3(0.66, 0.71, 0.8), vec3(0.76, 0.8, 0.88), sparkle);
  let shade = float(0);
  if (skate) {
    // The groomer's corduroy: ridges along the lane
    const lane = smoothstep(skate[0], skate[0] + 0.15, across).mul(smoothstep(skate[1], skate[1] - 0.15, across));
    const ridge = smoothstep(0.3, 0.5, fract(across.div(0.09)).sub(0.5).abs());
    shade = shade.max(lane.mul(ridge).mul(0.22));
  }
  for (const track of tracks) {
    // Two grooves 0.22 m apart (centre to centre), set deep in shadow
    const groove = (c) => smoothstep(0.07, 0.035, across.sub(c).abs());
    shade = shade.max(groove(track - 0.11).max(groove(track + 0.11)).mul(0.7));
  }
  // The low berms the groomer leaves along both edges cast a soft shadow line
  const berm = smoothstep(width / 2 - 0.45, width / 2 - 0.15, across.abs()).mul(smoothstep(width / 2, width / 2 - 0.12, across.abs()));
  shade = shade.max(berm.mul(0.35));
  snow = mix(snow, vec3(0.3, 0.38, 0.55), shade);
  m.colorNode = snow;
  // Soft edges into the snow around; only in winter
  const edge = smoothstep(width / 2, width / 2 - 0.1, across.abs());
  m.opacityNode = edge.mul(winter);
  return m;
}

// Trail marker posts: a larch post every 25-50 m along the trails, its top 30 cm painted turquoise; only in winter
// (they come out with the snow: scaled to nothing in summer by `winter`)
function createPostMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  const top = smoothstep(1.19, 1.21, positionGeometry.y); // the post is 1.5 m tall: the top 0.3 m
  const grain = mx_noise_float(positionGeometry.mul(vec3(30, 2, 30))).mul(0.5).add(0.5);
  const wood = mix(vec3(0.24, 0.15, 0.08), vec3(0.36, 0.24, 0.13), grain);
  m.colorNode = mix(wood, vec3(0.0, 0.62, 0.6), top);
  m.positionNode = positionLocal.mul(winter);
  return m;
}

function buildPosts(trails) {
  const sites = [];
  let seed = 1;
  const rand = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) + 1) >>> 0) / 4294967296;
  for (const r of trails) {
    const width = (LAYOUT[r.grooming] || LAYOUT['classic+skating']).width;
    let next = 10 + rand() * 20, along = 0;
    for (let i = 2; i < r.pts.length; i += 2) {
      const ax = r.pts[i - 2], az = r.pts[i - 1], bx = r.pts[i], bz = r.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      while (L > 0 && next <= along + L) {
        const t = (next - along) / L, nx = -(bz - az) / L, nz = (bx - ax) / L;
        // Alternating sides, a little off the berm
        const side = sites.length % 2 ? 1 : -1, off = width / 2 + 0.6;
        const x = ax + (bx - ax) * t + nx * off * side, z = az + (bz - az) * t + nz * off * side;
        sites.push({ x, z, y: groundHeight(x, z), yaw: rand() * Math.PI });
        next += 25 + rand() * 25;
      }
      along += L;
    }
  }
  if (!sites.length) return null;
  const geometry = new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6);
  geometry.translate(0, 0.75, 0);
  const mesh = new THREE.InstancedMesh(geometry, createPostMaterial(), sites.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  sites.forEach((p, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y - 0.25, p.z), q.setFromAxisAngle(up, p.yaw), one))); // 0.25 m in the snow
  mesh.name = 'Loipen posts';
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function buildLoipen(scene) {
  const group = new THREE.Group();
  group.name = 'Loipen';
  group.userData.terrain = 'absolute'; // draped above
  const trails = DAVOS_DATA.loipen || [];
  for (const [kind, layout] of Object.entries(LAYOUT)) {
    const list = trails.filter((t) => (LAYOUT[t.grooming] ? t.grooming : 'classic+skating') === kind);
    const geometry = list.length ? strips(list, layout.width) : null;
    if (!geometry) continue;
    group.add(...chunkedMeshes(geometry, createLoipeMaterial(layout), { cell: 2500, setup: (mesh) => {
      mesh.name = `Loipen ${kind}`;
      mesh.receiveShadow = true;
      mesh.renderOrder = 2;
    } }));
  }
  const posts = buildPosts(trails);
  if (posts) group.add(posts);
  group.userData.stats = { trails: trails.length, posts: posts ? posts.count : 0 };
  // Not drawn at all in summer (the trails and posts are faded out then); drawn while the loading screen compiles the
  // shaders (main.js sets __slopdavos.ready afterwards), so that switching to winter doesn't stall on them
  Object.defineProperty(group, 'visible', {
    get: () => winter.value > 0 || !(typeof window !== 'undefined' && window.__slopdavos?.ready),
    set() {}
  });
  scene.add(group);
  return group;
}
