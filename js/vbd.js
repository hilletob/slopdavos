import * as THREE from 'three/webgpu';
import { attribute, float, mix, normalGeometry, positionGeometry, smoothstep, step, vec3 } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { logoIndex, logoImage, drawLogo } from './logos.js';
import { VBD_DATA } from './vbd-data.js';
import { surfaceHeight, ROAD_TOP } from './terrain.js';
import { vehicleContact, resolveVehicleContact, sweptVehicleContact } from './vehicle-physics.js';

// The buses of the Verkehrsbetrieb Davos (js/vbd-data.js, tools/fetch-vbd.mjs: OSM route relations): lines 301
// (Glaris – Platz – Dorf – Wolfgang), 303/304 (Platz – Dorf – Stilli), 308 (Platz – Clavadel – Sertig), 312 (Dorf –
// Dischma – Dürrboden) and 313 (Dorf – Teufi), each bus driving its line's mapped route in the right-hand lane,
// stopping at the stops, keeping its distance to the bus ahead and braking for the player, the cars and bikes in its lane
// and the people on the crosswalks; at the end of a route (or the edge of the map) it carries on with the route of its
// line that starts there. 12 m low-floor city buses in the style of the VBD's Mercedes-Benz Citaro, with a front display showing the line (in its colour) and the
// destination. Every bus is a solid body: the player bounces off it, and the traffic (traffic.js) brakes behind it.

const LENGTH = 12, WIDTH = 2.55, HALF_WIDTH = WIDTH / 2, MASS = 1.4e4, LANE = 1.7, BEND = 6;
const MAX_SPEED = 12.5, ACCEL = 1.0, BRAKE = 1.6, DWELL = [12, 22], HEADWAY = 30;
// The street traffic (js/traffic.js) in the bus's lane ahead: it stops CAR_GAP metres short of a car or bike, PED_GAP
// short of people on a crosswalk, looking LOOK metres along its route in PROBE-metre pieces (so it follows the bends).
// Held up by a vehicle for BLOCKED seconds (QUEUED behind one going its way, e.g. at a red light), it drives on regardless
// for PUSH seconds at PUSH_SPEED (the car gets shoved aside): no bus and car wait for each other for ever at a junction.
const CAR_GAP = 7, PED_GAP = 5, LOOK = 60, PROBE = 10, BLOCKED = 6, QUEUED = 45, PUSH = 4, PUSH_SPEED = 2.5;
// Buses per line (one direction each, alternating)
const FLEET = { 301: 4, 303: 2, 304: 2, 308: 2, 312: 2, 313: 2 };
// Lines run with the articulated Citaro G (18 m): the busiest, the 301 through the valley
const ARTICULATED = new Set(['301']);
const JOINT = 0.9; // the bellows' length
// Level of detail by the distance to the camera: the Citaro model (with its decals and display) near, a lettered box
// beyond FAR_LOD (back to the model inside FAR_LOD - 20 m); shadows only from the buses within SHADOW_DISTANCE
const FAR_LOD = 160, SHADOW_DISTANCE = 100;

function polyline(v) {
  const pts = [];
  for (let i = 0; i < v.pts.length; i += 2) pts.push({ x: v.pts[i], z: v.pts[i + 1] });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { ...v, pts, cum, len: cum[cum.length - 1] };
}

// Position (in the right-hand lane) and unit direction at distance s along a route
function pointAt(r, s, out = {}) {
  s = Math.max(0, Math.min(r.len, s));
  let lo = 1, hi = r.cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (r.cum[mid] < s) lo = mid + 1; else hi = mid; }
  const a = r.pts[lo - 1], b = r.pts[lo], seg = r.cum[lo] - r.cum[lo - 1] || 1e-6, t = (s - r.cum[lo - 1]) / seg;
  out.dx = (b.x - a.x) / seg; out.dz = (b.z - a.z) / seg;
  // right of the direction of travel (x east, z south): (-dz, dx). Within a few metres of a bend (a junction's corner)
  // the offset turns with the road, from one piece's normal to the next one's, meeting the lane's miter at the node:
  // the lane runs on without a jump sideways, and keeps its distance to the centreline round the corner.
  let nx = -out.dz, nz = out.dx;
  const blend = (c, d, along) => {
    const L = Math.hypot(d.x - c.x, d.z - c.z);
    if (L < 1e-6) return;
    const reach = Math.min(BEND, seg / 2, L / 2), w = 0.5 * (1 - along / reach);
    if (w <= 0) return;
    nx += (-(d.z - c.z) / L - nx) * w; nz += ((d.x - c.x) / L - nz) * w;
  };
  const ta = s - r.cum[lo - 1], tb = r.cum[lo] - s;
  if (lo >= 2 && ta < BEND) blend(r.pts[lo - 2], a, ta);
  if (lo + 1 < r.pts.length && tb < BEND) blend(b, r.pts[lo + 1], tb);
  const m = Math.hypot(nx, nz) || 1, k = LANE / Math.max(0.6, (nx * -out.dz + nz * out.dx) / m) / m;
  out.x = a.x + (b.x - a.x) * t + nx * k; out.z = a.z + (b.z - a.z) * t + nz * k;
  return out;
}

// --- The bus -----------------------------------------------------------------------------------------------------------
// Citaro-like body along +z (front at +z): white, a dark glazed band (deep windscreen in front), a dark-blue skirt, grey
// roof pods, black wheels in the skirt (colours in linear space)
function mergeParts(parts) {
  parts = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const arrays = parts.map((g) => g.attributes[name].array);
    const out = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrays) { out.set(a, o); o += a.length; }
    merged.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  return merged;
}

function busGeometry() {
  const body = new THREE.BoxGeometry(WIDTH, 2.85, LENGTH, 1, 4, 8);
  body.translate(0, 0.32 + 2.85 / 2, 0);
  const pod = new THREE.BoxGeometry(1.6, 0.32, 3.2);
  pod.translate(0, 3.17 + 0.16, -1.5);
  const wheels = [-3.9, 2.4].flatMap((z) => [-1, 1].map((side) => {
    const w = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14);
    w.rotateZ(Math.PI / 2);
    w.translate(side * (HALF_WIDTH - 0.12), 0.5, z);
    return w;
  }));
  return { body: mergeParts([body, pod]), wheels: mergeParts(wheels) };
}

// (`tyres`: the wheels merged into the body geometry, standing out of its sides, are dark)
function createBusMaterial(tyres = false) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.15 });
  const y = positionGeometry.y, z = positionGeometry.z;
  const side = step(0.7, normalGeometry.x.abs()), front = step(0.7, normalGeometry.z), back = step(0.7, normalGeometry.z.negate());
  // Side windows (with the door bays), the deep windscreen at the front, the rear window
  const band = smoothstep(1.25, 1.3, y).mul(smoothstep(2.75, 2.7, y)).mul(side);
  const doors = smoothstep(0.55, 0.5, z.sub(LENGTH / 2 - 1.3).abs()).max(smoothstep(0.55, 0.5, z.add(0.4).abs())).mul(side).mul(step(y, 2.75)).mul(step(0.4, y));
  const screen = front.mul(smoothstep(0.75, 0.8, y)).mul(smoothstep(2.6, 2.55, y));
  const rear = back.mul(smoothstep(1.6, 1.65, y)).mul(smoothstep(2.7, 2.65, y));
  const glass = band.max(doors).max(screen).max(rear).min(1);
  const skirt = smoothstep(0.75, 0.7, y).mul(float(1).sub(screen));
  const roof = step(0.7, normalGeometry.y).max(step(3.18, y));
  const white = vec3(0.86, 0.87, 0.88), blue = vec3(0.86, 0.56, 0.0), dark = vec3(0.012, 0.016, 0.022); // (blue: the VBD yellow)
  let colour = mix(white, blue, skirt);
  colour = mix(colour, dark, glass);
  colour = mix(colour, vec3(0.45, 0.46, 0.47), roof);
  if (tyres) colour = mix(colour, vec3(0.012, 0.012, 0.012), step(HALF_WIDTH + 0.004, positionGeometry.x.abs()));
  m.colorNode = colour;
  m.roughnessNode = mix(float(0.38), float(0.06), glass);
  m.metalnessNode = mix(float(0.15), float(0.55), glass);
  return m;
}

// --- The Citaro model ---------------------------------------------------------------------------------------------------
// "Low Poly Mercedes-Benz Citaro 530" by giosassets (https://sketchfab.com/giosassets), CC BY 4.0
// (assets/models/citaro-530-lite.glb: the original assets/models/citaro-530.glb with its ~43k-triangle tyres replaced by
// plain cylinders, tools/build-citaro-lite.mjs). Its parts are baked into one geometry along +z (front at +z, found by the headlights),
// scaled to LENGTH and standing on y = 0, with each vertex's part (aPart) for one shared material: the VBD livery on the
// body, glazing, trims, head- and tail-lights, tyres. Its ground plane and camera are left out.
const MODEL_URL = new URL('../assets/models/citaro-530-lite.glb', import.meta.url);
// (the model's panes are Material.004; Material is the black band round them)
const PART = { 'Material.005': 0, 'Material.004': 1, Material: 2, 'Material.001': 2, 'Material.003': 3, 'Material.002': 4, 'Material.006': 5 };

async function loadCitaro() {
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL.href);
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !(o.material?.name in PART)) return; // (not the ground plane)
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    parts.push({ g, part: PART[o.material.name] });
  });
  const box = new THREE.Box3();
  for (const { g } of parts) { g.computeBoundingBox(); box.union(g.boundingBox); }
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  // Along +z, centred, on the ground, LENGTH long
  const m = new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z);
  if (size.x > size.z) m.premultiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  const scale = LENGTH / Math.max(size.x, size.z);
  m.premultiply(new THREE.Matrix4().makeScale(scale, scale, scale));
  for (const { g } of parts) g.applyMatrix4(m);
  // The headlights at the front (+z)
  const lights = parts.filter((p) => p.part === 3);
  let lz = 0, ln = 0;
  for (const { g } of lights) { const a = g.attributes.position; for (let i = 0; i < a.count; i++) { lz += a.getZ(i); ln++; } }
  if (ln && lz / ln < 0) for (const { g } of parts) g.rotateY(Math.PI);
  // One geometry: position, normal, part
  const count = parts.reduce((n, p) => n + p.g.attributes.position.count, 0);
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), part = new Float32Array(count);
  let o = 0;
  for (const p of parts) {
    position.set(p.g.attributes.position.array, o * 3);
    normal.set(p.g.attributes.normal.array, o * 3);
    part.fill(p.part, o, o + p.g.attributes.position.count);
    o += p.g.attributes.position.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  // The articulated Citaro G from the same model: the front car (the front, the front door and the middle axle) and
  // the rear car (the middle door, the rear axle and the back), each made of the triangles whose centre lies in its
  // part of the body, centred along z; the bellows cover the cut
  const section = (keep) => {
    const pos = [], nor = [], prt = [];
    for (let t = 0; t < count; t += 3) {
      const zc = (position[t * 3 + 2] + position[t * 3 + 5] + position[t * 3 + 8]) / 3;
      if (!keep(zc)) continue;
      pos.push(...position.subarray(t * 3, t * 3 + 9)); nor.push(...normal.subarray(t * 3, t * 3 + 9)); prt.push(part[t], part[t + 1], part[t + 2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(prt, 1));
    g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    g.translate(0, 0, -(min.z + max.z) / 2);
    g.computeBoundingBox(); g.computeBoundingSphere();
    return { geometry: g, len: max.z - min.z, front: (max.z - min.z) / 2 };
  };
  const frontCar = section((z) => z > -4.7), rearCar = section((z) => z < 1.0);
  return { geometry, height: geometry.boundingBox.max.y, front: geometry.boundingBox.max.z, frontCar, rearCar };
}

// The bellows between the two cars of an articulated bus: a dark ribbed sleeve
function bellowsGeometry(height) {
  // (longer than the gap between the cars: it covers the ragged ends of the cut)
  const g = new THREE.CylinderGeometry(1.2, 1.2, 1.7, 18, 8, true);
  g.rotateX(Math.PI / 2);
  g.scale(WIDTH / 2.4, (height - 0.35) / 2.4, 1);
  g.translate(0, 0.35 + (height - 0.35) / 2, 0);
  return g;
}

// The VBD livery on the model (Gemeinde Davos photo, Citaro no. 9): white body with the yellow lower body, dark glazing, grey trims, lit head- and tail-lights,
// black tyres (colours in linear space)
function createCitaroMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.15 });
  const part = attribute('aPart', 'float'), is = (k) => step(k - 0.5, part).mul(step(part, k + 0.5));
  const y = positionGeometry.y;
  // VBD: white, the lower body yellow — up to just under the windows on the sides, the bumper at the front
  const skirtTop = mix(float(0.98), float(0.64), smoothstep(0.55, 0.75, normalGeometry.z.abs()));
  const body = mix(vec3(0.86, 0.87, 0.88), vec3(0.86, 0.56, 0.0), smoothstep(skirtTop.add(0.02), skirtTop.sub(0.02), y));
  let colour = body;
  colour = mix(colour, vec3(0.004, 0.005, 0.007), is(1));
  colour = mix(colour, vec3(0.1, 0.1, 0.105), is(2));
  colour = mix(colour, vec3(1, 0.95, 0.85), is(3));
  colour = mix(colour, vec3(0.5, 0.02, 0.02), is(4));
  colour = mix(colour, vec3(0.015, 0.015, 0.015), is(5));
  colour = mix(colour, vec3(0.7, 0.7, 0.7), is(6));
  m.colorNode = colour;
  m.emissiveNode = vec3(1, 0.92, 0.75).mul(is(3).mul(0.8)).add(vec3(0.6, 0.02, 0.02).mul(is(4).mul(0.4)));
  // Tinted glazing, nearly black from outside as on the real buses
  m.roughnessNode = mix(mix(float(0.35), float(0.12), is(1)), float(0.9), is(5));
  m.metalnessNode = mix(float(0.15), float(0.2), is(1));
  return m;
}

// The Gemeinde Davos logo the buses carry (the Davos coat of arms from assets/logos, js/logos.js, beside "GEMEINDE
// DAVOS / Verkehrsbetrieb" lettered here), white-backed decals: on both sides behind the middle door and small on the
// front below the windscreen, as on the fleet (photo of Citaro no. 9). The lettering shows until the arms load.
function davosLogoTexture() {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 160;
  const ctx = c.getContext('2d');
  const draw = (arms) => {
    ctx.clearRect(0, 0, c.width, c.height);
    const s = 136, x0 = 12;
    if (arms) drawLogo(ctx, arms.img, arms.aspect, x0, 12, s, s);
    else { ctx.fillStyle = '#1d4f9c'; ctx.fillRect(x0 + 20, 16, s - 40, s - 8); }
    ctx.fillStyle = '#1d4f9c'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = '600 34px Inter, Arial, sans-serif'; ctx.fillText('GEMEINDE', x0 + s + 18, 58);
    ctx.font = '800 64px Inter, Arial, sans-serif'; ctx.fillText('DAVOS', x0 + s + 14, 116);
    ctx.font = '500 24px Inter, Arial, sans-serif'; ctx.fillText('Verkehrsbetrieb', x0 + s + 18, 146);
  };
  draw(null);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  logoIndex().then((index) => {
    const e = index['davos-coa'];
    if (!e) return;
    return logoImage(e).then((img) => { draw({ img, aspect: e.aspect }); t.needsUpdate = true; });
  }).catch((error) => console.warn('[vbd] logo', error));
  return t;
}

// The front destination display: the line number on its colour, the destination in amber LEDs
function displayTexture(v) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#050505'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = v.colour === '#FFFFFF' ? '#f2f2f2' : v.colour;
  g.fillRect(6, 8, 96, 48);
  g.fillStyle = v.colour === '#FFFFFF' ? '#111' : '#fff';
  g.font = '700 38px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(v.ref, 54, 34);
  g.fillStyle = '#ffb21e'; g.textAlign = 'left'; g.font = '600 30px Inter, Arial, sans-serif';
  const dest = v.to.replace(/^Davos /, '').replace(/ \(Bus\)$/, '');
  g.fillText(dest.length > 24 ? dest.slice(0, 23) + '…' : dest, 116, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildVBD(scene) {
  const group = new THREE.Group();
  group.name = 'VBD';
  group.userData.terrain = 'absolute';
  scene.add(group);
  const routes = (VBD_DATA?.variants || []).map(polyline);
  const idle = { group, update() {}, collidePlayer() {}, bodies: [], buses: [] };
  if (!routes.length) return idle;

  const displays = new Map(routes.map((r) => [r.id, new THREE.MeshBasicNodeMaterial({ map: displayTexture(r) })]));
  const geometry = busGeometry(), material = createBusMaterial();
  const tyres = new THREE.MeshStandardNodeMaterial({ color: 0x111111, roughness: 0.9, metalness: 0 });
  const displayGeometry = new THREE.PlaneGeometry(2.1, 0.26);
  const rand = (() => { let s = 20261030; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 1) >>> 0) / 4294967296; })();

  // The route a bus takes on from the end of `r`: the line's route starting nearest there (preferring the longest)
  function nextRoute(r) {
    const end = r.pts[r.pts.length - 1];
    const options = routes.filter((q) => q.ref === r.ref && q !== r)
      .map((q) => ({ q, d: Math.hypot(q.pts[0].x - end.x, q.pts[0].z - end.z) }))
      .sort((a, b) => a.d - b.d || b.q.len - a.q.len);
    return options.length && options[0].d < 400 ? options[0].q : routes.find((q) => q.ref === r.ref && q.from === r.to) || r;
  }

  const buses = [];
  for (const [ref, count] of Object.entries(FLEET)) {
    const own = routes.filter((r) => r.ref === ref).sort((a, b) => b.len - a.len);
    if (!own.length) continue;
    // The two longest routes (both directions) share the fleet, spread along them
    const main = own.slice(0, 2);
    for (let i = 0; i < count; i++) {
      const route = main[i % main.length];
      const k = Math.floor(i / main.length), n = Math.ceil(count / main.length);
      const bus = new THREE.Group();
      const body = new THREE.Mesh(geometry.body, material);
      body.castShadow = body.receiveShadow = true;
      const wheels = new THREE.Mesh(geometry.wheels, tyres);
      const display = new THREE.Mesh(displayGeometry, displays.get(route.id));
      display.position.set(0, 2.78, LENGTH / 2 + 0.02);
      bus.add(body, wheels, display);
      group.add(bus);
      const art = ARTICULATED.has(ref);
      buses.push({ route, s: route.len * (0.1 + 0.8 * (k + 0.5) / n), speed: 0, dwell: rand() * 10, served: -1, y: undefined, mesh: bus, display, ref, art, len: art ? 18.2 : LENGTH, frontLen: LENGTH });
    }
  }

  const bodies = buses.map((b) => ({ x: 1e7, z: 1e7, prevX: 1e7, prevZ: 1e7, y: -1e4, sin: 0, cos: 1, halfW: HALF_WIDTH, halfL: b.len / 2, mass: b.art ? MASS * 1.4 : MASS, vx: 0, vz: 0, angularVel: 0, tram: true }));

  const probe = {}, probe2 = {};
  // Distance to `p` ({ x, z, y? }) on the lane ahead of the bus's front, within `reach` (or Infinity)
  function ahead(b, p, reach = 45, side = HALF_WIDTH + 0.5) {
    const f = pointAt(b.route, b.s, probe), dx = p.x - f.x, dz = p.z - f.z;
    if (Math.abs(dx) > reach + 15 || Math.abs(dz) > reach + 15 || (p.y !== undefined && b.y !== undefined && Math.abs(p.y - b.y) > 4)) return Infinity;
    const d = dx * f.dx + dz * f.dz;
    return d > 0 && d < reach && Math.abs(dz * f.dx - dx * f.dz) < side ? d : Infinity;
  }
  const playerAhead = (b, player) => (player ? ahead(b, player) : Infinity);
  // The closed level crossings' barriers (js/level-crossings.js: bodies parked at x 1e7 while open)
  function barrierAhead(b, barriers) {
    let nearest = Infinity;
    for (const o of barriers) if (o.x < 1e6) nearest = Math.min(nearest, ahead(b, o, 80, HALF_WIDTH + (o.halfW || 1.5)));
    return nearest;
  }

  // The nearest car, bike or person on a crosswalk ahead in the bus's lane (traffic.js's obstacle grid): the gap from the
  // bus's front along its route, or Infinity; `hit` gets what it is (kind, speed along the route, heading · route)
  const hit = {}, found = {}, notVehicle = (o) => o.kind !== 'ped';
  // (the solo bus's body reaches NOSE metres past b.s: placed between b.s and b.s - 0.8 LENGTH, LENGTH long)
  const NOSE = LENGTH / 2 - LENGTH * 0.4;
  function trafficAhead(b, nearestAhead) {
    let best = Infinity;
    const nose = b.art && b.rear ? 0 : NOSE;
    for (let d = 0; d < LOOK && d < best; d += PROBE) {
      const p = pointAt(b.route, b.s + nose + d, probe);
      const g = d + nearestAhead(p.x, p.z, p.dx, p.dz, PROBE + 3, HALF_WIDTH + 0.2, b.y, found, b.push > 0 ? notVehicle : null);
      if (g < best) { best = g; hit.kind = found.kind; hit.speed = found.speed; hit.dot = found.dot; hit.own = found.own; }
    }
    return best;
  }

  function step(dt, player, barriers = [], traffic = null) {
    for (const b of buses) {
      if (b.push > 0) b.push -= dt;
      if (b.dwell > 0) { b.dwell -= dt; continue; }
      const r = b.route;
      // Next stop ahead, the bus ahead on the same route, the bends, the player
      const stop = r.stops.find((st) => st.s > b.s + 0.5 && st.s > b.served);
      let limit = MAX_SPEED;
      if (stop) limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, stop.s - b.s - 0.3)));
      for (const o of buses) {
        if (o === b || o.route !== r) continue;
        const gap = o.s - b.s - o.len;
        if (gap > -o.len && gap < 120) limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, gap - HEADWAY)));
      }
      const a = pointAt(r, b.s + 4, probe), c = pointAt(r, b.s + 24, probe2);
      const turn = Math.acos(Math.max(-1, Math.min(1, a.dx * c.dx + a.dz * c.dz)));
      limit = Math.min(limit, MAX_SPEED * (1 - Math.min(0.65, turn / 1.1)));
      const blocked = playerAhead(b, player);
      if (blocked < Infinity) limit = Math.min(limit, Math.sqrt(2 * BRAKE * 2 * Math.max(0, blocked - 4)));
      // Stop at a closed level crossing, the bus's front a few metres before the barrier
      const barrier = barrierAhead(b, barriers);
      if (barrier < Infinity) limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, barrier - 3)));
      // The traffic ahead: stop behind it, or follow it at its speed
      let heldBy = null;
      const gap = traffic?.nearestAhead ? trafficAhead(b, traffic.nearestAhead) : Infinity;
      if (gap < Infinity) {
        const keep = hit.kind === 'ped' ? PED_GAP : CAR_GAP;
        const v = Math.sqrt(Math.max(0, hit.speed * hit.speed + 2 * BRAKE * (gap - keep)));
        if (v < limit) { limit = v; heldBy = hit.kind === 'ped' ? null : hit.dot > 0.7 ? 'queue' : 'crossing'; }
      }
      // ...not for ever: held up by a vehicle standing in its way, the bus pushes on after a while (people on a crosswalk
      // always go first)
      if (heldBy && b.speed < 0.5 && hit.own < 0.5) {
        b.blocked = (b.blocked || 0) + dt;
        if (b.blocked > (heldBy === 'queue' ? QUEUED : BLOCKED)) { b.push = PUSH; b.blocked = 0; }
      } else if (!heldBy || b.speed > 1) b.blocked = 0; // (stop-and-go in a queue is no deadlock)
      // pushing on: at a walking pace
      if (b.push > 0) limit = Math.min(limit, PUSH_SPEED);
      b.speed = b.speed < limit ? Math.min(limit, b.speed + ACCEL * dt) : Math.max(limit, b.speed - BRAKE * 2 * dt);
      b.s += b.speed * dt;
      if (stop && b.s >= stop.s - 0.4 && b.speed < 0.3) {
        b.served = stop.s; b.speed = 0;
        b.dwell = DWELL[0] + rand() * (DWELL[1] - DWELL[0]);
      }
      if (b.s >= r.len) {
        // On with the line's route from here (the display changes with it)
        b.route = nextRoute(r); b.s = 0; b.served = -1; b.speed = 0; b.dwell = DWELL[1];
        b.display.material = displays.get(b.route.id);
      }
    }
  }

  const euler = new THREE.Euler(0, 0, 0, 'YXZ'), front = {}, rearP = {};
  // A car spanning s0 (its front) to s1 along the route: centred between them, yawed and pitched to the road
  function placeCar(b, obj, s0, s1, len) {
    pointAt(b.route, s0, front); pointAt(b.route, s1, rearP);
    const yf = surfaceHeight(front.x, front.z, b.y), yr = surfaceHeight(rearP.x, rearP.z, b.y);
    const cx = (front.x + rearP.x) / 2, cz = (front.z + rearP.z) / 2, cy = (yf + yr) / 2;
    const yaw = Math.atan2(front.x - rearP.x, front.z - rearP.z);
    euler.set(-Math.atan2(yf - yr, len), yaw, 0);
    obj.position.set(cx, cy + ROAD_TOP, cz);
    obj.rotation.copy(euler);
    return { cx, cy, cz, yaw };
  }
  function place() {
    buses.forEach((b, i) => {
      let c;
      if (b.art && b.rear) {
        // Front car, bellows, rear car: each follows the route, so the bus bends in the curves
        const fl = b.frontLen, rl = b.rearLen;
        c = placeCar(b, b.mesh, b.s, b.s - fl, fl);
        placeCar(b, b.joint, b.s - fl + 0.2, b.s - fl - JOINT - 0.2, JOINT + 0.4);
        placeCar(b, b.rear, b.s - fl - JOINT, b.s - fl - JOINT - rl, rl);
        b.y = c.cy;
        const tail = pointAt(b.route, b.s - b.len, rearP), head = pointAt(b.route, b.s, front);
        c = { cx: (head.x + tail.x) / 2, cy: c.cy, cz: (head.z + tail.z) / 2, yaw: Math.atan2(head.x - tail.x, head.z - tail.z) };
      } else {
        c = placeCar(b, b.mesh, b.s, b.s - LENGTH * 0.8, LENGTH * 0.8);
        // (centre the body between the axles' points)
        b.y = c.cy;
      }
      const body = bodies[i];
      body.prevX = body.x; body.prevZ = body.z;
      body.x = c.cx; body.z = c.cz; body.y = b.y;
      body.sin = Math.sin(c.yaw); body.cos = Math.cos(c.yaw);
      body.vx = body.sin * b.speed; body.vz = body.cos * b.speed;
    });
  }

  // Near: the model, its decals and display, casting shadows within SHADOW_DISTANCE; far: the box (b.lod, set once
  // the model is in)
  function levelOfDetail(eye) {
    if (!eye) return;
    buses.forEach((b, i) => {
      if (!b.lod) return;
      const body = bodies[i], d = Math.hypot(body.x - eye.x, body.y - eye.y, body.z - eye.z);
      const far = b.lod.far ? d > FAR_LOD - 20 : d > FAR_LOD;
      if (far !== b.lod.far) {
        b.lod.far = far;
        for (const o of b.lod.near) o.visible = !far;
        for (const o of b.lod.box) o.visible = far;
      }
      const shadow = !far && d < SHADOW_DISTANCE;
      for (const o of b.lod.shadow) o.castShadow = shadow;
    });
  }

  function update(dt, { player = null, barriers = [], camera = null, traffic = null } = {}) {
    step(Math.min(dt, 0.1), player, barriers, traffic);
    place();
    levelOfDetail(camera || player);
  }
  place();
  for (const body of bodies) { body.prevX = body.x; body.prevZ = body.z; }

  // The player against the buses: a bus does not give way, so the player takes the whole correction
  const contact = {}, playerBody = { x: 0, z: 0, prevX: 0, prevZ: 0, sin: 0, cos: 1, halfW: 0, halfL: 0, mass: 0, vx: 0, vz: 0, angularVel: 0 };
  function collidePlayer(pe, mode, controllers) {
    if (!pe || mode === 'helicopter' || mode === 'rhb') return;
    const halfW = mode === 'cyclist' ? 0.35 : mode === 'person' ? 0.32 : mode === 'snowcat' ? 2.2 : 0.86;
    const halfL = mode === 'cyclist' ? 0.85 : mode === 'person' ? 0.32 : mode === 'snowcat' ? 3.6 : 2.18;
    for (const b of bodies) {
      const reach = b.halfL + halfL + HALF_WIDTH;
      if (Math.abs(pe.position.x - b.x) > reach + 2 || Math.abs(pe.position.z - b.z) > reach + 2) continue;
      if (pe.position.y > b.y + 3.6 || pe.position.y < b.y - 2) continue;
      const p = playerBody, heading = pe.heading || 0;
      p.x = pe.position.x; p.z = pe.position.z;
      p.prevX = pe.prevX ?? p.x; p.prevZ = pe.prevZ ?? p.z;
      p.sin = Math.sin(heading); p.cos = Math.cos(heading);
      p.halfW = halfW; p.halfL = halfL;
      p.mass = mode === 'car' ? 1700 : mode === 'cyclist' ? 95 : mode === 'snowcat' ? 9000 : 80;
      p.vx = p.sin * (pe.speed || 0) + (pe.vx || 0);
      p.vz = p.cos * (pe.speed || 0) + (pe.vz || 0);
      p.angularVel = mode === 'car' ? pe.angularVel || 0 : 0;
      if (!sweptVehicleContact(p, b, contact) && !vehicleContact(p, b, contact)) continue;
      const speed = resolveVehicleContact(p, b, contact);
      pe.position.x = contact.ax + contact.nx * contact.depth;
      pe.position.z = contact.az + contact.nz * contact.depth;
      if (speed <= 0) continue;
      pe.speed = p.vx * p.sin + p.vz * p.cos;
      if (mode === 'car') { pe.vx = p.vx - p.sin * pe.speed; pe.vz = p.vz - p.cos * pe.speed; pe.angularVel = p.angularVel; }
      if (mode !== 'person') controllers?.reportCollision(pe, b, 'vehicle', contact.x, b.y + 0.6, contact.z, contact.nx, 0, contact.nz, speed);
    }
  }

  // The Citaro model replaces the box bodies once it is in (they stay if it can't be loaded)
  loadCitaro().then(({ geometry: citaro, height, front, frontCar, rearCar }) => {
    const citaroMaterial = createCitaroMaterial();
    const bellowsMaterial = new THREE.MeshStandardNodeMaterial({ color: 0x1a1a1a, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    const bellows = bellowsGeometry(height - 0.15);
    // The Gemeinde Davos decals (planes just off the body: both sides, the front)
    const decalMaterial = new THREE.MeshStandardNodeMaterial({ map: davosLogoTexture(), transparent: true, roughness: 0.4, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const halfW = citaro.boundingBox.max.x;
    const decalSide = new THREE.PlaneGeometry(1.3, 0.325), decalFront = new THREE.PlaneGeometry(0.56, 0.14);
    const addDecals = (obj, frontZ, sideZ) => {
      const added = [];
      for (const side of [-1, 1]) {
        const d = new THREE.Mesh(decalSide, decalMaterial);
        d.rotation.y = side * Math.PI / 2;
        d.position.set(side * (halfW + 0.012), 1.13, sideZ);
        added.push(d);
      }
      if (frontZ !== null) {
        const f = new THREE.Mesh(decalFront, decalMaterial);
        f.position.set(-0.42, 0.8, frontZ + 0.012); // (left of the front as one faces the bus)
        added.push(f);
      }
      obj.add(...added);
      return added;
    };
    // The far box: the lettered box body with its wheels in one geometry, stretched to the car's length
    const boxGeometry = mergeParts([geometry.body, geometry.wheels]), boxMaterial = createBusMaterial(true);
    const farBox = (len) => {
      const m = new THREE.Mesh(boxGeometry, boxMaterial);
      m.scale.set(1, height / 3.49, len / LENGTH);
      m.receiveShadow = true;
      m.visible = false;
      return m;
    };
    for (const b of buses) {
      for (const child of [...b.mesh.children]) if (child !== b.display) b.mesh.remove(child);
      const body = new THREE.Mesh(b.art ? frontCar.geometry : citaro, citaroMaterial);
      body.castShadow = body.receiveShadow = true;
      const box = farBox(b.art ? frontCar.len : LENGTH);
      b.mesh.add(body, box);
      b.lod = { far: false, near: [body, b.display], box: [box], shadow: [body] };
      if (b.art) {
        b.frontLen = frontCar.len; b.rearLen = rearCar.len; b.len = frontCar.len + JOINT + rearCar.len;
        // (the rear car: a group of its model, decals and far box, placed as one)
        b.rear = new THREE.Group();
        const rearBody = new THREE.Mesh(rearCar.geometry, citaroMaterial);
        rearBody.castShadow = rearBody.receiveShadow = true;
        const rearBox = farBox(rearCar.len);
        b.rear.add(rearBody, rearBox);
        b.joint = new THREE.Mesh(bellows, bellowsMaterial);
        group.add(b.rear, b.joint);
        bodies[buses.indexOf(b)].halfL = b.len / 2;
        b.display.position.set(0, height - 0.32, frontCar.front + 0.03);
        b.lod.near.push(rearBody, ...addDecals(b.mesh, frontCar.front, -frontCar.len * 0.12), ...addDecals(b.rear, null, rearCar.len * 0.1));
        b.lod.box.push(rearBox);
        b.lod.shadow.push(rearBody);
      } else {
        b.display.position.set(0, height - 0.32, front + 0.03);
        b.lod.near.push(...addDecals(b.mesh, front, -0.6));
      }
    }
    place();
  }).catch((error) => console.warn('[vbd] Citaro model:', error));

  group.userData.stats = { buses: buses.length, lines: [...new Set(buses.map((b) => b.ref))], routes: routes.length };
  return { group, update, collidePlayer, bodies, buses, routes };
}
