import * as THREE from 'three/webgpu';
import { attribute, float, fract, mix, normalGeometry, positionGeometry, smoothstep, step, texture, vec2, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { logoIndex, logoImage, drawLogo } from './logos.js';
import { DAVOS_DATA } from './davos-geodata.js';
import { LEVEL_CROSSINGS } from './level-crossings-data.js';
import { surfaceHeight, groundHeight, deckHeight } from './terrain.js';
import { buildLine, routePoint, project } from './rhb-route.js';
import { vehicleContact, resolveVehicleContact, sweptVehicleContact } from './vehicle-physics.js';

// The Rhaetian Railway through Davos (js/rhb-route.js): red four-car RhB multiple units, in the spirit of the ABe 4/16
// "Capricorn" that has run Landquart – Davos since 2022, ply the single-track line Wolfgang – Davos Dorf –
// Kongress/Eisstadion – Davos Platz – Frauenkirch and back, stopping at every station. The line is cut into blocks
// between the stations with a passing loop (Dorf, Platz, Frauenkirch) and the ends of the map; a train enters a block
// only when no other train holds it, so opposing trains wait for each other and cross on the loops, each on its own
// track. Beyond the map's edge a train turns back after a while. Every car is a solid body: the player bounces off it,
// and the traffic (traffic.js) brakes behind it. (No freely licensed model of the real units exists: the cars are built
// here in code, see Rolling stock.)
// The player can take over one train (the "RhB" mode, takeOver): no steering, bound to the rails, the throttle and the
// brake are the player's, but the train protection is not: it reserves the next block in good time and, when it cannot,
// brakes the train to a stop at the passing loop until the opposing train is through. At the edge of the map the driver
// changes ends and the train goes back.

const END = 19.2, MID = 17.9, GAP = 0.5; // 74.9 m over the couplers, like the ABe 4/16
// The cars from the front: the powered end car (Bo'Bo', the pantograph behind its cab), two trailers (2'2'), the other
// end car turned round; every car runs on its own two bogies
const CARS = [{ len: END, end: true, lead: true }, { len: MID, end: false }, { len: MID, end: false }, { len: END, end: true, flip: true }];
const WIDTH = 2.65, HALF_WIDTH = WIDTH / 2, MASS = 4e4;
const MAX_SPEED = 16.7, ACCEL = 0.55, BRAKE = 0.7, DWELL = [35, 55], TURN = [60, 120]; // 60 km/h; seconds
const TRAIN_LENGTH = CARS.reduce((a, c) => a + c.len + GAP, 0);
const TRAINS = 2;
// Destinations on the front displays: southbound towards Filisur, northbound towards Landquart
const DESTINATIONS = ['Filisur', 'Landquart'];

// --- Rolling stock -----------------------------------------------------------------------------------------------------------
// After the Stadler ABe 4/16 "Capricorn" (RhB, 2019-): built here in code, as no freely licensed model of it exists.
// One geometry per car type, merged from parts tagged by `aPart` for the material: 0 the body, 1 bogies, skirts and
// underframe gear, 2 the gangway bellows, 3 roof gear and the pantograph, 4 the wheels.
// The body runs along +z (centred), from 0.45 m above the rails to the 3.76 m roof: a rounded cross-section extruded
// over the car's length. An end car's front (+z) curves in plan to the nose and its windscreen is raked back and wraps
// round the corners.
const PROFILE = [[-1.18, 0.45], [1.18, 0.45], [1.31, 0.68], [1.325, 1.0], [1.325, 2.86], [1.3, 3.06], [1.22, 3.32], [1.05, 3.55],
  [0.76, 3.7], [0.3, 3.76], [-0.3, 3.76], [-0.76, 3.7], [-1.05, 3.55], [-1.22, 3.32], [-1.3, 3.06], [-1.325, 2.86], [-1.325, 1.0], [-1.31, 0.68]];
const NOSE = 3.2;

function tagged(geometry, part) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
  return g;
}
const boxAt = (w, h, d, x, y, z, part) => tagged(new THREE.BoxGeometry(w, h, d).translate(x, y, z), part);

function carGeometry(length, { nose = false, pantograph = false } = {}) {
  const half = length / 2;
  const shape = new THREE.Shape();
  shape.moveTo(...PROFILE[0]);
  for (const p of PROFILE.slice(1)) shape.lineTo(...p);
  shape.closePath();
  let body = new THREE.ExtrudeGeometry(shape, { depth: length, steps: Math.ceil(length / 0.5), bevelEnabled: false });
  body.clearGroups();
  body.translate(0, 0, -half);
  if (nose) {
    const pos = body.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const u = Math.min(1, Math.max(0, (z - (half - NOSE)) / NOSE)), t = u * u * (3 - 2 * u);
      if (t <= 0) continue;
      const up = Math.min(1, Math.max(0, (y - 1.2) / 2.56));
      // Rounded in plan towards the front, the windscreen raked back, the roof's leading edge drawn down
      const nx = x * (1 - 0.2 * Math.pow(t, 2.2) * (0.4 + 0.6 * up));
      const nz = z - t * Math.pow(up, 1.25) * 1.75 + t * (1 - up) * 0.12;
      const ny = y - t * t * Math.max(0, y - 3.0) * 0.55;
      pos.setXYZ(i, nx, ny, nz);
    }
  }
  body.computeVertexNormals();
  const parts = [tagged(body, 0)];
  // Bogies (side frames, springs) and wheel sets, 2.4 m in from each end
  for (const bz of [half - 2.6, -(half - 2.6)]) {
    for (const sx of [-1, 1]) parts.push(boxAt(0.22, 0.42, 2.5, sx * 0.88, 0.5, bz, 1));
    parts.push(boxAt(1.9, 0.2, 0.9, 0, 0.62, bz, 1));
    for (const wz of [-0.9, 0.9]) {
      for (const sx of [-1, 1]) {
        const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.12, 14).rotateZ(Math.PI / 2).translate(sx * 0.56, 0.34, bz + wz);
        parts.push(tagged(wheel, 4));
      }
    }
  }
  // Underframe gear between the bogies (converters, tanks), set back from the side
  parts.push(boxAt(2.1, 0.32, length - 8.6, 0, 0.52, 0, 1));
  // Gangway bellows at the inner ends, reaching to meet the next car's
  for (const [zs, inner] of [[1, !nose], [-1, true]]) {
    if (!inner) continue;
    const bellows = boxAt(2.05, 2.75, GAP / 2 + 0.08, 0, 0.55 + 2.75 / 2, zs * (half + GAP / 4 - 0.04), 2);
    parts.push(bellows);
  }
  // Roof: the air-conditioning fairings, and on the powered car the pantograph behind the cab
  parts.push(tagged(new THREE.BoxGeometry(1.5, 0.26, length * 0.42, 1, 1, 1).translate(0, 3.86, nose ? -half * 0.35 : 0), 3));
  if (nose) parts.push(boxAt(1.2, 0.2, 2.2, 0, 3.84, half - NOSE - 2.4, 3)); // the cab's own unit
  if (pantograph) {
    const z0 = half - NOSE - 6.2;
    parts.push(boxAt(1.7, 0.16, 2.4, 0, 3.86, z0, 3)); // base frame on its insulators
    for (const sx of [-0.45, 0.45]) {
      parts.push(tagged(new THREE.BoxGeometry(0.07, 0.07, 1.6).rotateX(-0.62).translate(sx, 4.28, z0 + 0.2), 3)); // lower arms
      parts.push(tagged(new THREE.BoxGeometry(0.05, 0.05, 1.3).rotateX(0.55).translate(sx * 0.6, 4.63, z0 - 0.05), 3)); // upper arms
    }
    parts.push(boxAt(1.9, 0.06, 0.14, 0, 4.82, z0 - 0.45, 3)); // the collector bow against the contact wire
  }
  // The coupler and the snow plough under the nose
  if (nose) parts.push(boxAt(2.3, 0.4, 0.5, 0, 0.3, half - 0.1, 1));
  return mergeGeometries(parts, false);
}

// The front display: the destinations, orange LED text on black, one per row
function destinationTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#ffb21e'; ctx.font = 'bold 44px Arial, Helvetica, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  DESTINATIONS.forEach((d, i) => ctx.fillText(d, 256, 32 + i * 64));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// The RhB logo on the sides, white on the carmine (assets/logos/rhb.svg, js/logos.js); lettered "RhB" until it loads
function letteringTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold italic 72px Arial, Helvetica, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('RhB  Rhätische Bahn', 8, 52);
  const t = new THREE.CanvasTexture(c);
  logoIndex().then((index) => {
    const e = index.rhb;
    if (!e) return;
    return logoImage(e).then((img) => {
      ctx.clearRect(0, 0, c.width, c.height);
      drawLogo(ctx, img, e.aspect, 0, 0, c.width, c.height, { tint: '#ffffff', pad: 4 });
      t.needsUpdate = true;
    });
  }).catch((error) => console.warn('[rhb] logo', error));
  return t;
}

// RhB livery as on the Capricorn: carmine body, a continuous black glazed band with the panoramic windows' frames, the
// door leaves set in it with their tall windows and push buttons, a dark grey underframe and skirt, a grey roof; the
// nose in a black mask round the wrap-around windscreen, the destination display above it, three headlights (two low,
// one high) and the red tail lights. `lead`: this end car leads (headlights) or trails (tail lights).
function createCarMaterial(length, { nose = false, lead = false, dest = null, lettering = null } = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.38, metalness: 0.2 });
  const x = positionGeometry.x, y = positionGeometry.y, z = positionGeometry.z;
  const part = attribute('aPart', 'float');
  const isBody = step(part, 0.5);
  const side = step(0.6, normalGeometry.x.abs()), front = step(0.25, normalGeometry.z).mul(nose ? 1 : 0);
  const half = length / 2;
  const noseZone = nose ? smoothstep(half - NOSE - 0.2, half - NOSE + 0.3, z) : float(0);
  // Side glazing: a band from 1.45 to 2.78 m, cut into panoramic panes by slim frames every 1.9 m
  const band = smoothstep(1.45, 1.5, y).mul(smoothstep(2.78, 2.73, y));
  const pane = fract(z.div(1.9).add(0.5));
  const mullion = smoothstep(0.035, 0.0, pane.min(float(1).sub(pane))).mul(band); // ~7 cm frames between the panes
  // Door leaves: two per side (end cars: near the inner end and behind the cab; trailers: a quarter in from each end)
  const doorCentres = nose ? [-(half - 3.3), half - NOSE - 3.4] : [-(half - 3.2), half - 3.2];
  let doorAt = z.sub(doorCentres[0]).abs();
  doorAt = doorAt.min(z.sub(doorCentres[1]).abs());
  const door = smoothstep(0.72, 0.68, doorAt).mul(side).mul(step(y, 2.95)).mul(step(0.5, y));
  const doorSeam = smoothstep(0.02, 0.0, doorAt.sub(0.7).abs()).max(smoothstep(0.015, 0.0, doorAt)).mul(door);
  const doorGlass = door.mul(smoothstep(1.0, 1.05, y)).mul(smoothstep(2.65, 2.6, y)).mul(smoothstep(0.6, 0.55, doorAt)).mul(smoothstep(0.03, 0.06, doorAt));
  const button = side.mul(smoothstep(0.08, 0.05, doorAt.sub(0.9).abs())).mul(smoothstep(1.2, 1.25, y)).mul(smoothstep(1.45, 1.4, y));
  const ends = smoothstep(half - 0.5, half - 0.65, z.abs());
  let glass = band.mul(side).mul(ends).max(doorGlass);
  // The nose: black mask, windscreen wrapping round the corners, display, lights
  let mask = float(0), lights = float(0), tail = float(0), display = float(0);
  if (nose) {
    const faceUp = smoothstep(1.0, 1.08, y).mul(smoothstep(3.55, 3.45, y));
    mask = front.max(noseZone.mul(side).mul(smoothstep(half - 1.6, half - 1.0, z))).mul(faceUp);
    const screen = smoothstep(1.7, 1.78, y).mul(smoothstep(2.92, 2.86, y));
    glass = glass.max(mask.mul(screen)).max(noseZone.mul(side).mul(band).mul(smoothstep(half - 2.6, half - 2.2, z)));
    display = front.mul(smoothstep(2.96, 3.0, y)).mul(smoothstep(3.2, 3.16, y)).mul(smoothstep(0.62, 0.58, x.abs()));
    const lamp = (cx, cy, r) => front.mul(smoothstep(r, r * 0.6, vec2(x.sub(cx), y.sub(cy)).length()));
    const head = lamp(0.78, 1.28, 0.13).max(lamp(-0.78, 1.28, 0.13)).max(lamp(0, 3.29, 0.08));
    const red = lamp(1.04, 1.28, 0.07).max(lamp(-1.04, 1.28, 0.07));
    lights = lead ? head : float(0);
    tail = lead ? float(0) : red;
    mask = mask.max(head).max(red);
  }
  const skirt = smoothstep(0.78, 0.72, y);
  const roof = step(0.55, normalGeometry.y).mul(step(3.3, y));
  const red = vec3(0.47, 0.012, 0.018), black = vec3(0.012, 0.013, 0.016), grey = vec3(0.2, 0.205, 0.21);
  let body = mix(red, red.mul(0.85), door.mul(0.5));
  body = mix(body, red.mul(0.55), doorSeam);
  body = mix(body, black, mask.mul(0.92));
  body = mix(body, vec3(0.012, 0.016, 0.022), glass);
  body = mix(body, vec3(0.08, 0.085, 0.09), mullion.mul(side));
  body = mix(body, vec3(0.75, 0.6, 0.1), button);
  body = mix(body, vec3(0.05, 0.05, 0.055), skirt);
  body = mix(body, vec3(0.32, 0.33, 0.34), roof);
  if (lettering) {
    // "RhB" on the sides, below the windows by the cab (end cars) or mid-car (trailers)
    const lx = nose ? half - NOSE - 5.0 : 0;
    // (read left to right from either side: along -z on the right-hand side, +z on the left)
    // (a 3.6 × 0.32 m band: the logo, emblem and "Rhätische Bahn", is long and low)
    const lu = z.sub(lx).div(3.6).mul(normalGeometry.x.sign().negate()).add(0.5), lv = y.sub(1.02).div(0.32);
    const inBox = side.mul(step(0, lu)).mul(step(lu, 1)).mul(step(0, lv)).mul(step(lv, 1));
    body = mix(body, vec3(0.9, 0.9, 0.9), texture(lettering, vec2(lu, lv)).a.mul(inBox));
  }
  if (dest) {
    const du = x.div(1.2).add(0.5), dv = y.sub(2.98).div(0.22).mul(0.5).add(float(1).sub(attribute('aDest', 'float')).mul(0.5));
    body = mix(body, texture(dest, vec2(du, dv)).rgb, display);
  }
  // Parts: bogies and gear dark grey, bellows black with pleats, roof gear grey, wheels steel
  const pleat = smoothstep(0.3, 0.5, fract(y.mul(9)).sub(0.5).abs());
  let colour = mix(body, grey.mul(0.5), step(0.5, part).mul(step(part, 1.5)));
  colour = mix(colour, vec3(0.02, 0.02, 0.022).mul(pleat.mul(0.6).add(0.6)), step(1.5, part).mul(step(part, 2.5)));
  colour = mix(colour, vec3(0.36, 0.37, 0.38), step(2.5, part).mul(step(part, 3.5)));
  colour = mix(colour, vec3(0.28, 0.27, 0.26), step(3.5, part));
  m.colorNode = mix(mix(colour, vec3(1, 0.97, 0.9), lights.mul(isBody)), vec3(0.9, 0.05, 0.03), tail.mul(isBody));
  m.emissiveNode = vec3(1, 0.95, 0.85).mul(lights).mul(3).add(vec3(1, 0.05, 0.02).mul(tail).mul(2))
    .add(dest ? texture(dest, vec2(x.div(1.2).add(0.5), y.sub(2.98).div(0.22).mul(0.5).add(float(1).sub(attribute('aDest', 'float')).mul(0.5)))).rgb.mul(display).mul(1.5) : vec3(0)).mul(isBody);
  m.roughnessNode = mix(mix(float(0.34), float(0.05), glass.mul(isBody)), float(0.6), step(0.5, part).mul(step(part, 2.5)));
  m.metalnessNode = mix(float(0.2), float(0.75), glass.mul(isBody).max(step(3.5, part)));
  return m;
}

// --- Overhead line ----------------------------------------------------------------------------------------------------------
// 11 kV 16.7 Hz, as on the whole RhB network: a mast every ~50 m beside the track (one for the parallel tracks of a
// station: masts closer than 7 m to another are left out) with a cantilever over the track, the contact wire 4.95 m
// above the rails, staggered ±0.2 m from mast to mast so that it wears the pantographs evenly, and the catenary wire
// 1.1 m above it. None in the tunnels; on bridges the line follows the deck. No mast stands on a level crossing: the
// ways are cut at their crossings, so a span point there moves along the track until the mast is clear of the road.
const CONTACT_WIRE = 4.95, MESSENGER = 1.1, SPAN = 50, MAST_OFFSET = 2.4;

function buildOverheadLine(group) {
  const ways = DAVOS_DATA.railways.filter((r) => r.kind === 'narrow_gauge' && !r.tunnel && r.pts.length >= 4);
  const railTop = (r, x, z) => {
    const d = r.bridge ? deckHeight(x, z) : NaN;
    return (d === d ? d : groundHeight(x, z)) + 0.11;
  };
  const [minX, minZ, maxX, maxZ] = DAVOS_DATA.meta.bounds;
  const masts = [], cells = new Map(), wires = [];
  const near = (x, z) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const m of cells.get(`${Math.floor(x / 8) + i},${Math.floor(z / 8) + j}`) || []) if (Math.hypot(m.x - x, m.z - z) < 7) return true;
    }
    return false;
  };
  for (const r of ways) {
    // Points every SPAN metres along the way (and its two ends)
    const pts = [];
    for (let i = 0; i < r.pts.length; i += 2) pts.push({ x: r.pts[i], z: r.pts[i + 1] });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const len = cum[cum.length - 1], n = Math.max(1, Math.round(len / SPAN));
    const at = (s) => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1e-6, t = (s - cum[i - 1]) / seg;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg };
    };
    // Level crossings beside this way (js/level-crossings-data.js), with the stretch of track their road covers
    const crossings = (LEVEL_CROSSINGS?.crossings || []).filter((c) => {
      for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i].x - c.x, pts[i].z - c.z) < 30) return true;
      return false;
    });
    const clearOfCrossings = (s) => {
      for (let pass = 0; pass < 3; pass++) {
        const p = at(s);
        let moved = false;
        for (const c of crossings) {
          const vx = c.x - p.x, vz = c.z - p.z, d = vx * p.dx + vz * p.dz;
          if (Math.abs(vx * -p.dz + vz * p.dx) > 8) continue; // (another track's crossing)
          const sin = Math.abs(p.dx * c.dz - p.dz * c.dx); // the road's angle to the track (dx, dz: the road; rdx, rdz: the rails)
          const clear = (c.width / 2 + 1.5) / Math.max(sin, 0.35) + MAST_OFFSET * Math.sqrt(Math.max(0, 1 - sin * sin)) / Math.max(sin, 0.35);
          if (Math.abs(d) >= clear) continue;
          // away from the crossing, into the way (at its ends the crossing is the end itself)
          const back = s > len - clear ? true : s < clear ? false : d > 0;
          s = Math.min(len, Math.max(0, back ? s + d - clear : s + d + clear));
          moved = true;
        }
        if (!moved) break;
      }
      return s;
    };
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const p = at(clearOfCrossings((len * k) / n));
      // Only over the map (some ways of other lines reach in from far beyond it)
      if (p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ) { prev = null; continue; }
      const y = railTop(r, p.x, p.z);
      const stagger = (k % 2 ? 0.2 : -0.2), nx = -p.dz, nz = p.dx; // left of the direction of the way
      const wire = { x: p.x + nx * stagger, y: y + CONTACT_WIRE, z: p.z + nz * stagger, cx: p.x, cz: p.z };
      if (prev) {
        wires.push(prev.x, prev.y, prev.z, wire.x, wire.y, wire.z);
        wires.push(prev.cx, prev.y + MESSENGER, prev.cz, wire.cx, wire.y + MESSENGER, wire.cz);
        // A dropper half-way
        const hx = (prev.x + wire.x) / 2, hy = (prev.y + wire.y) / 2, hz = (prev.z + wire.z) / 2;
        wires.push(hx, hy, hz, hx, hy + MESSENGER, hz);
      }
      prev = wire;
      const mx = p.x + nx * MAST_OFFSET, mz = p.z + nz * MAST_OFFSET;
      if (near(mx, mz) || near(p.x - nx * MAST_OFFSET, p.z - nz * MAST_OFFSET)) continue;
      const deckBase = deckHeight(mx, mz); // (on the lid of an underpass: not down through its roof onto the road below)
      const mast = { x: mx, z: mz, base: deckBase === deckBase ? deckBase : groundHeight(mx, mz), top: y + CONTACT_WIRE + MESSENGER + 0.3, yaw: Math.atan2(-nx, -nz), wireY: y + CONTACT_WIRE };
      masts.push(mast);
      const key = `${Math.floor(mx / 8)},${Math.floor(mz / 8)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(mast);
    }
  }
  if (!masts.length) return;
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0x8b9095, roughness: 0.55, metalness: 0.6 });
  // Mast (an H-beam, unit height scaled per mast), and the cantilever: a tube from the mast to over the track and its stay
  const mastGeometry = new THREE.BoxGeometry(0.22, 1, 0.28);
  mastGeometry.translate(0, 0.5, 0);
  const armGeometry = mergeGeometries([
    new THREE.BoxGeometry(0.07, 0.07, MAST_OFFSET + 0.5).translate(0, 0, (MAST_OFFSET + 0.5) / 2).toNonIndexed(),
    new THREE.BoxGeometry(0.05, 0.05, MAST_OFFSET + 0.6).rotateX(-0.42).translate(0, 0.5, (MAST_OFFSET + 0.5) / 2).toNonIndexed(),
    new THREE.BoxGeometry(0.06, MESSENGER + 0.25, 0.06).translate(0, (MESSENGER + 0.25) / 2 - 0.1, MAST_OFFSET).toNonIndexed()
  ], false);
  const mastMesh = new THREE.InstancedMesh(mastGeometry, steel, masts.length);
  const armMesh = new THREE.InstancedMesh(armGeometry, steel, masts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  masts.forEach((mast, i) => {
    q.setFromAxisAngle(up, mast.yaw);
    mastMesh.setMatrixAt(i, m.compose(new THREE.Vector3(mast.x, mast.base - 0.3, mast.z), q, new THREE.Vector3(1, mast.top - mast.base + 0.3, 1)));
    armMesh.setMatrixAt(i, m.compose(new THREE.Vector3(mast.x, mast.wireY, mast.z), q, new THREE.Vector3(1, 1, 1)));
  });
  for (const mesh of [mastMesh, armMesh]) { mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); }
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const lines = new THREE.LineSegments(wireGeometry, new THREE.LineBasicNodeMaterial({ color: 0x2a2c2e }));
  lines.name = 'RhB overhead wires';
  group.add(lines);
  group.userData.overheadLine = { masts: masts.length, wireSegments: wires.length / 6 };
}

export function buildRhB(scene) {
  const group = new THREE.Group();
  group.name = 'RhB';
  group.userData.terrain = 'absolute';
  scene.add(group);
  buildOverheadLine(group);
  const line = buildLine(DAVOS_DATA.railways, DAVOS_DATA.stations || [], DAVOS_DATA.meta.bounds);
  const idle = { group, update() {}, collidePlayer() {}, bodies: [], trains: [], takeOver: () => null, setControls() {}, cab: () => null,
    board: () => null, seat: () => null, boardable: () => null, alightSpots: () => [], stationOf: () => null, isTerminus: () => false };
  if (!line || line.stations.length < 2) return idle;
  const routes = { south: line.south, north: line.north };

  // Blocks between the ends and the passing loops (southbound order): boundaries at the loops' platforms
  const loops = line.stations.filter((s) => s.loop);
  const blocks = Array.from({ length: loops.length + 1 }, () => ({ owner: null }));
  // Stop positions along each route (its own s), in its direction of travel
  const stopsOf = (dir) => line.stations
    .map((st) => ({ name: st.name, s: st[dir], loop: st.loop }))
    .sort((a, b) => a.s - b.s);
  const stops = { south: stopsOf('south'), north: stopsOf('north') };
  // The block a train is in, by the number of loops it has passed (southbound counts up, northbound down)
  const blockAhead = (t) => {
    const passed = stops[t.dir].filter((s) => s.loop && s.s <= t.s + 1).length;
    return t.dir === 'south' ? passed : loops.length - passed;
  };

  const rand = (() => { let s = 20261029; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 1) >>> 0) / 4294967296; })();
  // Two trains, entering from opposite ends a few minutes apart
  const trains = Array.from({ length: TRAINS }, (_, i) => ({
    dir: i % 2 ? 'north' : 'south', s: -40, speed: 0, dwell: 0, off: 10 + i * 240, served: -Infinity, block: -1
  }));

  // Instances: the leading end cars (powered, with the pantograph), the trailing end cars (turned round) and the
  // trailers; the end cars' front display shows the train's destination (aDest, per instance: 0 Filisur, 1 Landquart)
  const dest = destinationTexture(), lettering = letteringTexture();
  const endGeometry = (pantograph) => {
    const g = carGeometry(END, { nose: true, pantograph });
    g.setAttribute('aDest', new THREE.InstancedBufferAttribute(new Float32Array(TRAINS), 1));
    return g;
  };
  const meshes = {
    lead: new THREE.InstancedMesh(endGeometry(true), createCarMaterial(END, { nose: true, lead: true, dest, lettering }), TRAINS),
    trail: new THREE.InstancedMesh(endGeometry(false), createCarMaterial(END, { nose: true, lead: false, dest, lettering }), TRAINS),
    mid: new THREE.InstancedMesh(carGeometry(MID), createCarMaterial(MID, { lettering }), TRAINS * 2)
  };
  for (const mesh of Object.values(meshes)) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  // One oriented box per car, for collisions (refreshed every frame; parked far away while off the map)
  const bodies = [];
  for (let i = 0; i < TRAINS * CARS.length; i++) {
    bodies.push({ x: 1e7, z: 1e7, prevX: 1e7, prevZ: 1e7, y: -1e4, sin: 0, cos: 1, halfW: HALF_WIDTH, halfL: CARS[i % CARS.length].len / 2, mass: MASS, vx: 0, vz: 0, angularVel: 0, tram: true });
  }

  // Distance to the player standing on the track ahead (a train brakes for whoever stands on the rails)
  const probe = {};
  function playerAhead(t, player) {
    if (!player || riding) return Infinity; // (a passenger is on board, not on the rails)
    const f = routePoint(routes[t.dir], t.s, probe), dx = player.x - f.x, dz = player.z - f.z;
    if (Math.abs(dx) > 150 || Math.abs(dz) > 150) return Infinity;
    const ahead = dx * f.dx + dz * f.dz;
    return ahead > 0 && ahead < 140 && Math.abs(dz * f.dx - dx * f.dz) < HALF_WIDTH + 0.6 ? ahead : Infinity;
  }

  // --- Driven by the player ---------------------------------------------------------------------------------------------
  const MANUAL = { accel: 0.6, brake: 1.2, coast: 0.04, protect: 0.9 };
  const controls = { throttle: 0, brake: 0 };
  let manual = null;
  // The last distance along each route that is still inside the map (the routes begin and end beyond its edges)
  const exitS = {};
  for (const [dir, r] of Object.entries(routes)) {
    let last = 0;
    for (let s = 0, p = {}; s <= r.len; s += 5) if (line.inside(routePoint(r, s, p).x, p.z)) last = s;
    exitS[dir] = last;
  }
  const behindOf = (t, k, cur) => (t.dir === 'south' ? k < cur : k > cur);

  function stepManual(t, dt) {
    const route = routes[t.dir];
    if (t.off > 0) {
      // Taken over beyond the map's edge: back in as soon as the first block is free
      t.off = Math.min(t.off, 2) - dt;
      if (t.off <= 0) {
        const first = t.dir === 'south' ? 0 : loops.length;
        if (blocks[first].owner && blocks[first].owner !== t) { t.off = 1; return; }
        blocks[first].owner = t; t.block = first;
        Object.assign(t, { s: 0, speed: 0, served: -Infinity });
      }
      return;
    }
    t.dwell = 0;
    // The block the front is in must be ours; the ones behind are given back
    const cur = blockAhead(t);
    if (!blocks[cur].owner) blocks[cur].owner = t;
    blocks.forEach((b, k) => { if (b.owner === t && behindOf(t, k, cur)) b.owner = null; });
    t.block = cur;
    // Authority: to the map's edge, short of any passing loop whose next block cannot be had in time
    let limitS = blocks[cur].owner === t ? exitS[t.dir] : t.s;
    const braking = (t.speed * t.speed) / (2 * MANUAL.protect);
    for (const stop of stops[t.dir]) {
      if (!stop.loop || stop.s < t.s - 0.5 || stop.s > limitS) continue;
      const next = blockAhead({ dir: t.dir, s: stop.s + 2 });
      if (blocks[next].owner === t) continue;
      if (!blocks[next].owner && stop.s - t.s < braking + 60) { blocks[next].owner = t; continue; }
      limitS = Math.min(limitS, stop.s);
      break;
    }
    // The player's throttle and brake, then the protection's braking curve to the end of the authority
    if (controls.brake) t.speed = Math.max(0, t.speed - MANUAL.brake * controls.brake * dt);
    else if (controls.throttle) t.speed = Math.min(MAX_SPEED, t.speed + MANUAL.accel * controls.throttle * dt);
    else t.speed = Math.max(0, t.speed - MANUAL.coast * dt);
    t.speed = Math.min(t.speed, Math.sqrt(2 * MANUAL.protect * Math.max(0, limitS - t.s - 1)));
    t.s += t.speed * dt;
    // Stopped at the edge of the map: the driver changes ends (the rear car leads back the other way)
    if (t.s >= exitS[t.dir] - 2 && t.speed < 0.2 && controls.throttle) {
      const rear = routePoint(route, t.s - (TRAIN_LENGTH - GAP), {});
      t.dir = t.dir === 'south' ? 'north' : 'south';
      t.s = project(routes[t.dir], rear.x, rear.z).s;
      t.speed = 0; t.y = undefined; t.served = t.s;
    }
  }

  // Takes over a train on the map (true; `which`: that train, if on the map) or hands it back to the timetable (false);
  // returns the driven train or null
  function takeOver(on, which = null) {
    if (!on) {
      if (manual) {
        // Back to the automatic run from where it stands: it keeps the block it is in and its next stop is ahead
        const t = manual, cur = t.off > 0 ? -1 : blockAhead(t);
        blocks.forEach((b, k) => { if (b.owner === t && k !== cur && behindOf(t, k, cur)) b.owner = null; });
        t.block = cur; t.served = t.s; t.manual = false;
      }
      manual = null; controls.throttle = controls.brake = 0;
      return null;
    }
    if (!manual) {
      manual = (which && trains.includes(which) && which.off <= 0 ? which : null) || trains.find((t) => t.off <= 0) || trains[0];
      manual.manual = true; manual.dwell = 0;
    }
    return manual;
  }
  function setControls(throttle = 0, brake = 0) { controls.throttle = throttle; controls.brake = brake; }
  // The driver's seat of the driven train: the front car's cab, its heading and the train's speed
  const cabProbe = {};
  function cab() {
    if (!manual) return null;
    const route = routes[manual.dir], s = Math.max(0, manual.s - 2.4);
    const p = routePoint(route, s, cabProbe);
    const y = manual.y ?? surfaceHeight(p.x, p.z);
    return { x: p.x, y, z: p.z, heading: Math.atan2(p.dx, p.dz), speed: manual.speed, visible: manual.off <= 0 };
  }

  // --- Riding along (js/gta.js): the player as a passenger ------------------------------------------------------------
  let riding = null;
  const CAR_COUNT = CARS.length;
  // Boards `train` (or gets off: null); returns the train ridden
  function board(train) {
    riding = train && trains.includes(train) && train.off <= 0 ? train : null;
    return riding;
  }
  // The station the train stands at (stopped within a few metres of one of its stops), or null
  function stationOf(t) {
    if (!t || t.off > 0 || t.speed > 0.15) return null;
    const stop = stops[t.dir].find((st) => Math.abs(st.s - t.s) < 6);
    return stop ? line.stations.find((st) => st.name === stop.name) || null : null;
  }
  // The end stations of the line on the map (where the driver may take over a train)
  const isTerminus = (station) => !!station && (station === line.stations[0] || station === line.stations[line.stations.length - 1]);
  // The passenger's seat: the middle of the second car, the train's heading and speed (visible: false while the train is
  // off the map or in a tunnel)
  function seat(t) {
    const i = trains.indexOf(t);
    if (i < 0) return null;
    const b = bodies[i * CAR_COUNT + 1];
    const visible = t.off <= 0 && b.y > -1e3;
    return { x: b.x, y: b.y + 0.9, z: b.z, heading: Math.atan2(b.sin, b.cos), speed: t.speed, visible, station: stationOf(t) };
  }
  // A train standing at a platform with a door within `reach` metres of (x, z) (a car's side): { train, station,
  // distance } or null. The driven train is not boarded (its driver is the player).
  function boardable(x, z, reach = 6) {
    let best = null;
    trains.forEach((t, i) => {
      if (t === manual) return;
      const station = stationOf(t);
      if (!station) return;
      for (let c = 0; c < CAR_COUNT; c++) {
        const b = bodies[i * CAR_COUNT + c];
        const dx = x - b.x, dz = z - b.z;
        const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos; // across, along the car
        const d = Math.hypot(Math.max(0, Math.abs(lx) - b.halfW), Math.max(0, Math.abs(lz) - b.halfL));
        if (d <= reach && (!best || d < best.distance)) best = { train: t, station, distance: d };
      }
    });
    return best;
  }
  // Where a passenger (or the driver) steps off: beside the second car (the driver: the cab), on the platform side
  // first (away from the other direction's track, which at a passing loop is the other platform's)
  function alightSpots(t, { driver = false } = {}) {
    const i = trains.indexOf(t);
    if (i < 0) return [];
    const b = bodies[i * CAR_COUNT + (driver ? 0 : 1)];
    if (b.y < -1e3) return [];
    const along = driver ? b.halfL - 3 : 0;
    const cx = b.x + b.sin * along, cz = b.z + b.cos * along;
    const rx = -b.cos, rz = b.sin; // the right of the direction of travel
    const other = routes[t.dir === 'south' ? 'north' : 'south'];
    const q = routePoint(other, project(other, cx, cz).s, {});
    const otherSide = (q.x - cx) * rx + (q.z - cz) * rz; // > 0: the other track runs on the right
    const first = Math.abs(otherSide) > 1 && otherSide > 0 ? -1 : 1;
    const heading = Math.atan2(b.sin, b.cos);
    const out = [];
    for (const side of [first, -first]) {
      for (const off of [HALF_WIDTH + 1.6, HALF_WIDTH + 2.6]) {
        for (const shift of [0, 4, -4]) {
          out.push({ x: cx + rx * side * off + b.sin * shift, z: cz + rz * side * off + b.cos * shift, heading }); // (facing along the train: the camera stays clear of it)
        }
      }
    }
    return out;
  }

  function step(dt, player) {
    for (const t of trains) {
      if (t === manual) { stepManual(t, dt); continue; }
      const route = routes[t.dir];
      // Off the map (beyond its edge, turning back): wait, then enter again as soon as the first block is free
      if (t.off > 0) {
        t.off -= dt;
        if (t.off <= 0) {
          const first = t.dir === 'south' ? 0 : loops.length;
          if (blocks[first].owner && blocks[first].owner !== t) { t.off = 1; continue; }
          blocks[first].owner = t; t.block = first;
          Object.assign(t, { s: 0, speed: MAX_SPEED * 0.6, served: -Infinity });
        }
        continue;
      }
      if (t.dwell > 0) {
        t.dwell -= dt;
        if (t.dwell > 0) continue;
      }
      // Authority: up to the next stop; at a loop, on into the next block only once it is ours
      const next = stops[t.dir].find((s) => s.s > t.served + 1 && s.s > t.s - 1);
      let limitS = route.len + TRAIN_LENGTH + 20;
      if (next) limitS = next.s;
      if (!next && t.s >= route.len + TRAIN_LENGTH) {
        // Gone beyond the map: free the last block and turn back
        if (blocks[t.block]?.owner === t) blocks[t.block].owner = null;
        t.dir = t.dir === 'south' ? 'north' : 'south';
        t.off = TURN[0] + rand() * (TURN[1] - TURN[0]); t.block = -1;
        continue;
      }
      let limit = Math.min(MAX_SPEED, Math.sqrt(2 * BRAKE * Math.max(0, limitS - t.s)));
      const blocked = playerAhead(t, player);
      if (blocked < Infinity) limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, blocked - 6)));
      t.speed = t.speed < limit ? Math.min(limit, t.speed + ACCEL * dt) : Math.max(limit, t.speed - BRAKE * 2 * dt);
      t.s += t.speed * dt;
      // At the platform: stop, release the block behind (at a loop), and dwell until the block ahead is ours
      if (next && t.s >= next.s - 0.6 && t.speed < 0.4) {
        t.speed = 0;
        if (next.loop) {
          const behind = t.block, ahead = blockAhead({ dir: t.dir, s: next.s + 2 });
          if (blocks[behind]?.owner === t) blocks[behind].owner = null;
          if (blocks[ahead].owner && blocks[ahead].owner !== t) { t.block = -1; t.dwell = 1; t.served = next.s - 2; continue; }
          blocks[ahead].owner = t; t.block = ahead;
        }
        t.served = next.s;
        t.dwell = DWELL[0] + rand() * (DWELL[1] - DWELL[0]);
      }
    }
  }
  function update(dt, { player = null } = {}) {
    step(Math.min(dt, 0.1), player);
    place();
  }

  // Vehicles: centred between their couplings along the route, pitched to the surface they cross; hidden in tunnels
  // and off the map
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  const euler = new THREE.Euler(0, 0, 0, 'YXZ'), a = {}, b = {};
  function place() {
    let k = 0;
    trains.forEach((t, i) => {
      const route = routes[t.dir];
      let offset = 0;
      CARS.forEach((car, c) => {
        const len = car.len, body = bodies[k++];
        const s0 = t.s - offset, s1 = s0 - len;
        offset += len + GAP;
        const [mesh, index] = car.end ? [car.lead ? meshes.lead : meshes.trail, i] : [meshes.mid, i * 2 + (c - 1)];
        if (car.end) mesh.geometry.attributes.aDest.array[i] = t.dir === 'south' ? 0 : 1;
        const visible = t.off <= 0 && s1 > 0 && s0 < route.len;
        routePoint(route, s0, a); routePoint(route, s1, b);
        if (!visible || (a.tunnel && b.tunnel) || !line.inside((a.x + b.x) / 2, (a.z + b.z) / 2)) {
          mesh.setMatrixAt(index, m.compose(pos.set(0, -1e4, 0), q.identity(), zero));
          body.prevX = body.x = 1e7; body.prevZ = body.z = 1e7; body.y = -1e4;
          return;
        }
        const ya = surfaceHeight(a.x, a.z, t.y), yb = surfaceHeight(b.x, b.z, t.y);
        if (c === 0) t.y = ya;
        const yaw = Math.atan2(a.x - b.x, a.z - b.z), cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
        euler.set(Math.atan2(yb - ya, len) * (car.flip ? -1 : 1), yaw + (car.flip ? Math.PI : 0), 0);
        mesh.setMatrixAt(index, m.compose(pos.set(cx, (ya + yb) / 2 + 0.17, cz), q.setFromEuler(euler), one)); // on the rails' heads
        body.prevX = body.x; body.prevZ = body.z;
        body.x = cx; body.z = cz; body.y = (ya + yb) / 2;
        body.sin = Math.sin(yaw); body.cos = Math.cos(yaw);
        body.vx = body.sin * t.speed; body.vz = body.cos * t.speed;
      });
    });
    for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true;
    for (const mesh of [meshes.lead, meshes.trail]) mesh.geometry.attributes.aDest.needsUpdate = true;
  }
  // Seven minutes of service before the start, so that both trains are already out on the line
  for (let i = 0; i < 4200; i++) step(0.1, null);
  place();
  for (const b of bodies) { b.prevX = b.x; b.prevZ = b.z; }

  // The player against the vehicles: a train does not give way, so the player takes the whole correction
  const contact = {}, playerBody = { x: 0, z: 0, prevX: 0, prevZ: 0, sin: 0, cos: 1, halfW: 0, halfL: 0, mass: 0, vx: 0, vz: 0, angularVel: 0 };
  function collidePlayer(pe, mode, controllers) {
    if (!pe || mode === 'helicopter' || mode === 'rhb') return; // (in the rhb mode the player is the train)
    const halfW = mode === 'cargobike' ? 0.38 : mode === 'cyclist' ? 0.35 : mode === 'person' ? 0.32 : mode === 'snowcat' ? 2.2 : 0.86;
    const halfL = mode === 'cargobike' ? 1.34 : mode === 'cyclist' ? 0.85 : mode === 'person' ? 0.32 : mode === 'snowcat' ? 3.6 : 2.18;
    for (const b of bodies) {
      const reach = b.halfL + halfL + HALF_WIDTH;
      if (Math.abs(pe.position.x - b.x) > reach + 2 || Math.abs(pe.position.z - b.z) > reach + 2) continue;
      if (pe.position.y > b.y + 4 || pe.position.y < b.y - 2) continue;
      const p = playerBody, heading = pe.heading || 0;
      p.x = pe.position.x; p.z = pe.position.z;
      p.prevX = pe.prevX ?? p.x; p.prevZ = pe.prevZ ?? p.z;
      p.sin = Math.sin(heading); p.cos = Math.cos(heading);
      p.halfW = halfW; p.halfL = halfL;
      p.mass = mode === 'car' ? 1700 : mode === 'cargobike' ? 140 : mode === 'snowcat' ? 9000 : mode === 'cyclist' ? 95 : 80;
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

  group.userData.stats = { trains: TRAINS, length: Math.round(line.south.len), stations: line.stations.map((s) => s.name), loops: loops.map((s) => s.name) };
  return { group, update, collidePlayer, bodies, trains, line, blocks, takeOver, setControls, cab, board, seat, boardable, alightSpots, stationOf, isTerminus };
}
