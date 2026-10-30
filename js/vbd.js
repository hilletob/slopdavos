import * as THREE from 'three/webgpu';
import { float, mix, normalGeometry, positionGeometry, smoothstep, step, vec3 } from 'three/tsl';
import { VBD_DATA } from './vbd-data.js';
import { surfaceHeight, ROAD_TOP } from './terrain.js';
import { vehicleContact, resolveVehicleContact, sweptVehicleContact } from './vehicle-physics.js';

// The buses of the Verkehrsbetrieb Davos (js/vbd-data.js, tools/fetch-vbd.mjs: OSM route relations): lines 301
// (Glaris – Platz – Dorf – Wolfgang), 303/304 (Platz – Dorf – Stilli), 308 (Platz – Clavadel – Sertig), 312 (Dorf –
// Dischma – Dürrboden) and 313 (Dorf – Teufi), each bus driving its line's mapped route in the right-hand lane,
// stopping at the stops, keeping its distance to the bus ahead and braking for the player on the road; at the end of
// a route (or the edge of the map) it carries on with the route of its line that starts there. 12 m low-floor city
// buses in the style of the VBD's Mercedes-Benz Citaro, with a front display showing the line (in its colour) and the
// destination. Every bus is a solid body: the player bounces off it, and the traffic (traffic.js) brakes behind it.

const LENGTH = 12, WIDTH = 2.55, HALF_WIDTH = WIDTH / 2, MASS = 1.4e4, LANE = 1.7;
const MAX_SPEED = 12.5, ACCEL = 1.0, BRAKE = 1.6, DWELL = [12, 22], HEADWAY = 30;
// Buses per line (one direction each, alternating)
const FLEET = { 301: 4, 303: 2, 304: 2, 308: 2, 312: 2, 313: 2 };

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
  // right of the direction of travel (x east, z south): (-dz, dx)
  out.x = a.x + (b.x - a.x) * t - out.dz * LANE; out.z = a.z + (b.z - a.z) * t + out.dx * LANE;
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

function createBusMaterial() {
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
  const white = vec3(0.86, 0.87, 0.88), blue = vec3(0.02, 0.07, 0.26), dark = vec3(0.012, 0.016, 0.022);
  let colour = mix(white, blue, skirt);
  colour = mix(colour, dark, glass);
  colour = mix(colour, vec3(0.45, 0.46, 0.47), roof);
  m.colorNode = colour;
  m.roughnessNode = mix(float(0.38), float(0.06), glass);
  m.metalnessNode = mix(float(0.15), float(0.55), glass);
  return m;
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
      buses.push({ route, s: route.len * (0.1 + 0.8 * (k + 0.5) / n), speed: 0, dwell: rand() * 10, served: -1, y: undefined, mesh: bus, display, ref });
    }
  }

  const bodies = buses.map(() => ({ x: 1e7, z: 1e7, prevX: 1e7, prevZ: 1e7, y: -1e4, sin: 0, cos: 1, halfW: HALF_WIDTH, halfL: LENGTH / 2, mass: MASS, vx: 0, vz: 0, angularVel: 0, tram: true }));

  const probe = {}, probe2 = {};
  function playerAhead(b, player) {
    if (!player) return Infinity;
    const f = pointAt(b.route, b.s, probe), dx = player.x - f.x, dz = player.z - f.z;
    if (Math.abs(dx) > 60 || Math.abs(dz) > 60 || (b.y !== undefined && Math.abs(player.y - b.y) > 4)) return Infinity;
    const ahead = dx * f.dx + dz * f.dz;
    return ahead > 0 && ahead < 45 && Math.abs(dz * f.dx - dx * f.dz) < HALF_WIDTH + 0.5 ? ahead : Infinity;
  }

  function step(dt, player) {
    for (const b of buses) {
      if (b.dwell > 0) { b.dwell -= dt; continue; }
      const r = b.route;
      // Next stop ahead, the bus ahead on the same route, the bends, the player
      const stop = r.stops.find((st) => st.s > b.s + 0.5 && st.s > b.served);
      let limit = MAX_SPEED;
      if (stop) limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, stop.s - b.s - 0.3)));
      for (const o of buses) {
        if (o === b || o.route !== r) continue;
        const gap = o.s - b.s - LENGTH;
        if (gap > -LENGTH && gap < 120) limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, gap - HEADWAY)));
      }
      const a = pointAt(r, b.s + 4, probe), c = pointAt(r, b.s + 24, probe2);
      const turn = Math.acos(Math.max(-1, Math.min(1, a.dx * c.dx + a.dz * c.dz)));
      limit = Math.min(limit, MAX_SPEED * (1 - Math.min(0.65, turn / 1.1)));
      const blocked = playerAhead(b, player);
      if (blocked < Infinity) limit = Math.min(limit, Math.sqrt(2 * BRAKE * 2 * Math.max(0, blocked - 4)));
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
  function place() {
    buses.forEach((b, i) => {
      pointAt(b.route, b.s, front); pointAt(b.route, b.s - LENGTH * 0.8, rearP);
      const yf = surfaceHeight(front.x, front.z, b.y), yr = surfaceHeight(rearP.x, rearP.z, b.y);
      b.y = (yf + yr) / 2;
      const cx = (front.x + rearP.x) / 2, cz = (front.z + rearP.z) / 2;
      const yaw = Math.atan2(front.x - rearP.x, front.z - rearP.z);
      euler.set(-Math.atan2(yf - yr, LENGTH * 0.8), yaw, 0);
      b.mesh.position.set(cx, b.y + ROAD_TOP, cz);
      b.mesh.rotation.copy(euler);
      const body = bodies[i];
      body.prevX = body.x; body.prevZ = body.z;
      body.x = cx; body.z = cz; body.y = b.y;
      body.sin = Math.sin(yaw); body.cos = Math.cos(yaw);
      body.vx = body.sin * b.speed; body.vz = body.cos * b.speed;
    });
  }

  function update(dt, { player = null } = {}) {
    step(Math.min(dt, 0.1), player);
    place();
  }
  place();
  for (const body of bodies) { body.prevX = body.x; body.prevZ = body.z; }

  // The player against the buses: a bus does not give way, so the player takes the whole correction
  const contact = {}, playerBody = { x: 0, z: 0, prevX: 0, prevZ: 0, sin: 0, cos: 1, halfW: 0, halfL: 0, mass: 0, vx: 0, vz: 0, angularVel: 0 };
  function collidePlayer(pe, mode, controllers) {
    if (!pe || mode === 'helicopter' || mode === 'rhb') return;
    const halfW = mode === 'cyclist' ? 0.35 : mode === 'person' ? 0.32 : mode === 'snowcat' ? 2.1 : 0.86;
    const halfL = mode === 'cyclist' ? 0.85 : mode === 'person' ? 0.32 : mode === 'snowcat' ? 3.2 : 2.18;
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

  group.userData.stats = { buses: buses.length, lines: [...new Set(buses.map((b) => b.ref))], routes: routes.length };
  return { group, update, collidePlayer, bodies, buses, routes };
}
