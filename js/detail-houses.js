import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, mx_noise_float, normalWorld, positionWorld, smoothstep, step, time, uv, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './terrain.js';
import { snowyRoof } from './season.js';
import { cityUniforms } from './tsl-materials.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { DETAIL_HOUSES, frame, toWorld } from './detail-houses-data.js';

// Hand-built houses, modelled from photographs, standing in for their swissBUILDINGS3D volumes (which are left out of
// the streamed tiles: js/swissbuildings3d.js excludeBuildings). The first: Dischmastrasse 19 in Davos Dorf, a dark
// larch chalet in Strickbau on a white plastered basement — a gable roof with wide eaves on exposed rafters and purlins,
// a chimney with its cap, a wooden balcony on the north gable, a boarded lean-to with a big window, a window box and a
// satellite dish on the street side, the front door up an outdoor stair on the south gable under a small roof, white
// window frames, dark shutters, lace curtains glowing warm at night, gutters and downpipes, and a picket fence along
// the street. Built along local x (the ridge) and z (towards the street) from the foot of the house (frame()).

excludeBuildings(DETAIL_HOUSES.map((h) => h.exclude));

// --- Materials (colours in linear space) -----------------------------------------------------------------------------------
function materials() {
  const grain = mx_noise_float(positionWorld.mul(vec3(1.2, 6, 1.2))).mul(0.5).add(0.5);
  const weather = mx_noise_float(positionWorld.mul(0.35)).mul(0.5).add(0.5);
  const along = positionWorld.x.mul(normalWorld.z.abs()).add(positionWorld.z.mul(normalWorld.x.abs()));
  // Strickbau: squared logs ~16.5 cm high, dark seams between them, sun-darkened larch
  const log = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
  const seam = smoothstep(0.38, 0.5, abs(fract(positionWorld.y.div(0.165)).sub(0.5)));
  log.colorNode = mix(vec3(0.05, 0.025, 0.012), vec3(0.085, 0.045, 0.022), grain.mul(0.6).add(weather.mul(0.4))).mul(float(1).sub(seam.mul(0.55)));
  // Vertical boarding (the lean-to, the gable triangles, the balcony), a little redder and lighter
  const boards = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  const joint = smoothstep(0.4, 0.5, abs(fract(along.div(0.14)).sub(0.5)));
  boards.colorNode = mix(vec3(0.07, 0.034, 0.016), vec3(0.11, 0.055, 0.026), grain).mul(float(1).sub(joint.mul(0.5)));
  const plaster = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  plaster.colorNode = mix(vec3(0.66, 0.65, 0.62), vec3(0.76, 0.75, 0.72), weather);
  // Roof: dark eternit slates in courses, snow on them in winter
  const roof = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0.05 });
  const course = smoothstep(0.42, 0.5, abs(fract(positionWorld.y.div(0.11)).sub(0.5)));
  roof.colorNode = snowyRoof(mix(vec3(0.035, 0.03, 0.028), vec3(0.06, 0.052, 0.045), weather).mul(float(1).sub(course.mul(0.35))), float(1));
  const frameMat = new THREE.MeshStandardNodeMaterial({ color: 0xc9c5bb, roughness: 0.6, metalness: 0 });
  const shutter = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
  shutter.colorNode = mix(vec3(0.03, 0.016, 0.008), vec3(0.05, 0.027, 0.013), smoothstep(0.3, 0.5, abs(fract(positionWorld.y.mul(9)).sub(0.5))));
  // Windows: a cross of glazing bars, lace curtains in the lower half; lit from inside at dusk and night like the
  // swissBUILDINGS3D facades (js/swissbuildings3d.js windowLights): each pane (its number in uv.x's integer part,
  // windowAt) on or off by its own hash, re-rolled every 5-15 min, mostly warm 2700 K, now and then a bluish TV
  const glass = new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0.2 });
  const id = floor(uv().x), p = vec3(fract(uv().x), uv().y, 0);
  const bars = smoothstep(0.035, 0.02, abs(p.x.sub(0.5))).max(smoothstep(0.03, 0.018, abs(p.y.sub(0.58))));
  const lace = smoothstep(0.55, 0.5, p.y).mul(mx_noise_float(vec3(p.x.mul(40), p.y.mul(40), 0)).mul(0.25).add(0.75));
  const iGlow = cityUniforms.uInteriorGlow;
  const glow = smoothstep(0.7, 1.45, iGlow), late = smoothstep(1.3, 1.55, iGlow);
  const h = hash(id.add(9173)), hn = (i) => hash(h.mul(1.6e7).floor().add(i));
  const slot = time.div(mix(float(300), float(900), hn(3))).add(hn(4)).floor();
  const on = step(hash(h.mul(1.6e7).floor().add(slot.mul(7)).add(11)), mix(0.6, 0.42, late)).max(step(id, 0.5)); // (the door: always)
  const c = hn(5), tv = step(0.9, c);
  const tone = mix(mix(vec3(1.0, 0.56, 0.24), vec3(1.0, 0.68, 0.38), step(0.6, c)), vec3(0.36, 0.52, 1.0).mul(mx_noise_float(vec3(time.mul(3.1), h.mul(97), 0)).mul(0.45).add(0.75)), tv);
  const pane = mix(vec3(0.01, 0.012, 0.016), vec3(0.45, 0.42, 0.36), lace.mul(0.6));
  glass.colorNode = mix(pane, vec3(0.72, 0.7, 0.66), bars);
  // (behind the lace a softer, warmer glow)
  glass.emissiveNode = mix(tone, tone.mul(vec3(1.0, 0.85, 0.7)).mul(0.75), lace).mul(hn(7).mul(0.4).add(0.85)).mul(on).mul(glow.mul(1.3)).mul(float(1).sub(bars));
  const metal = new THREE.MeshStandardNodeMaterial({ color: 0x5a3018, roughness: 0.45, metalness: 0.6 });
  const chimney = new THREE.MeshStandardNodeMaterial({ color: 0x3a2418, roughness: 0.9, metalness: 0 });
  const fence = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  fence.colorNode = mix(vec3(0.06, 0.04, 0.025), vec3(0.11, 0.075, 0.045), grain);
  const green = new THREE.MeshStandardNodeMaterial({ color: 0x1d3a17, roughness: 0.9, metalness: 0 });
  const dish = new THREE.MeshStandardNodeMaterial({ color: 0xb8bab8, roughness: 0.5, metalness: 0.3 });
  const door = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 });
  door.colorNode = mix(vec3(0.09, 0.045, 0.02), vec3(0.14, 0.075, 0.035), grain);
  return { log, boards, plaster, roof, frame: frameMat, shutter, glass, metal, chimney, fence, green, dish, door };
}

// --- Geometry builder: parts collected per material, merged into one mesh each ---------------------------------------------
class Builder {
  constructor() { this.parts = new Map(); }
  add(mat, g) {
    g = g.index ? g.toNonIndexed() : g;
    g.clearGroups();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return g;
  }
  // A box: size (sx, sy, sz), centre (x, y, z), turned by ry about y and rx about x
  box(mat, sx, sy, sz, x, y, z, { ry = 0, rx = 0, rz = 0 } = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return this.add(mat, g);
  }
  meshes(M) {
    return [...this.parts].map(([key, list]) => {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), M[key]);
      mesh.castShadow = key !== 'glass';
      mesh.receiveShadow = true;
      mesh.name = `detail ${key}`;
      return mesh;
    });
  }
}

// A wall-mounted feature on one face of the main block: `face` 'street' (+z, the front eaves side with the lean-to),
// 'back' (−z), 'north' (−x, the balcony gable), 'south' (+x, the door gable) — names from the first, unturned layout;
// `a` the position along the face (left to right seen from outside), `y` the height of its centre
function faceFrame(face, L, D) {
  // [origin along the face → local (x, z)], outward normal, rotation about y so that a feature's +z faces out
  switch (face) {
    case 'street': return { at: (a) => [a, D / 2], n: [0, 1], ry: 0 };
    case 'back': return { at: (a) => [-a, -D / 2], n: [0, -1], ry: Math.PI };
    case 'north': return { at: (a) => [-L / 2, a], n: [-1, 0], ry: -Math.PI / 2 };
    case 'south': return { at: (a) => [L / 2, -a], n: [1, 0], ry: Math.PI / 2 };
  }
}

// Numbers a window pane for the glass material: its uv.x moved by the next integer (0 is left for the door panes)
function numbered(B, g) {
  B.panes = (B.panes || 0) + 1;
  const uvs = g.attributes.uv;
  for (let i = 0; i < uvs.count; i++) uvs.setX(i, Math.min(uvs.getX(i), 0.999) + B.panes);
  return g;
}

function windowAt(B, F, a, y, w, h, { shutters = false, sill = true, box = false } = {}) {
  const [x, z] = F.at(a), [nx, nz] = F.n, ry = F.ry;
  const out = (d) => [x + nx * d, z + nz * d];
  // frame: four bars standing 6 cm proud of the wall
  const t = 0.09;
  const fr = (sx, sy, dx, dy) => {
    const g = new THREE.BoxGeometry(sx, sy, 0.1);
    g.translate(dx, dy, 0); g.rotateY(ry);
    const [px, pz] = out(0.03);
    g.translate(px, y, pz);
    B.add('frame', g);
  };
  fr(w + 2 * t, t, 0, h / 2 + t / 2); fr(w + 2 * t, t, 0, -h / 2 - t / 2); fr(t, h, -w / 2 - t / 2, 0); fr(t, h, w / 2 + t / 2, 0);
  // the pane (uv for the glazing bars and the curtains)
  const pane = numbered(B, new THREE.PlaneGeometry(w, h));
  pane.rotateY(ry);
  const [gx, gz] = out(0.025); // (in front of the wall's face, behind the frame's front)
  pane.translate(gx, y, gz);
  B.add('glass', pane);
  if (sill) {
    const g = new THREE.BoxGeometry(w + 0.25, 0.05, 0.16);
    g.translate(0, -h / 2 - t - 0.03, 0.06); g.rotateY(ry);
    const [px, pz] = out(0.03);
    g.translate(px, y, pz);
    B.add('frame', g);
  }
  if (shutters) {
    for (const side of [-1, 1]) {
      const g = new THREE.BoxGeometry(w / 2 + 0.06, h + 0.1, 0.04);
      g.translate(side * (w / 2 + t + w / 4 + 0.05), 0, 0); g.rotateY(ry);
      const [px, pz] = out(0.05);
      g.translate(px, y, pz);
      B.add('shutter', g);
    }
  }
  if (box) {
    const g = new THREE.BoxGeometry(w + 0.2, 0.22, 0.24);
    g.translate(0, -h / 2 - t - 0.2, 0.16); g.rotateY(ry);
    const [px, pz] = out(0.03);
    g.translate(px, y, pz);
    B.add('boards', g);
    const plants = new THREE.BoxGeometry(w + 0.1, 0.2, 0.2);
    plants.translate(0, -h / 2 - t - 0.02, 0.16); plants.rotateY(ry);
    plants.translate(px, y, pz);
    B.add('green', plants);
  }
}

function doorAt(B, F, a, y0, w, h) {
  const [x, z] = F.at(a), [nx, nz] = F.n;
  const g = new THREE.BoxGeometry(w, h, 0.08);
  g.rotateY(F.ry);
  g.translate(x + nx * 0.02, y0 + h / 2, z + nz * 0.02);
  B.add('door', g);
  const fr = new THREE.BoxGeometry(w + 0.16, h + 0.08, 0.06);
  fr.rotateY(F.ry);
  fr.translate(x + nx * 0.0, y0 + h / 2 + 0.02, z + nz * 0.0);
  B.add('frame', fr);
  // the small window in the door (lit) and its wreath
  const pane = new THREE.PlaneGeometry(w * 0.45, h * 0.28);
  pane.rotateY(F.ry);
  pane.translate(x + nx * 0.07, y0 + h * 0.72, z + nz * 0.07);
  B.add('glass', pane);
  const wreath = new THREE.TorusGeometry(0.12, 0.035, 6, 14);
  wreath.rotateY(F.ry);
  wreath.translate(x + nx * 0.1, y0 + h * 0.72, z + nz * 0.1);
  B.add('green', wreath);
}

// --- Dischmastrasse 19 ---------------------------------------------------------------------------------------------------------
function buildDischmastrasse19(B, house, fr) {
  const L = Math.round(fr.length * 10) / 10, D = Math.round(fr.depth * 10) / 10; // 10.2 × 11.2
  const P = house.plinth, E = house.eaves, H = house.height;
  // Plinth (white, 0.4 m into the ground), log walls up to the eaves
  B.box('plaster', L + 0.1, P + 0.4, D + 0.1, 0, (P - 0.4) / 2, 0);
  B.box('log', L, E - P, D, 0, P + (E - P) / 2, 0);
  // Gable triangles (boarded) up to under the roof
  const gable = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, H - E - 0.15)]);
  for (const side of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(gable, { depth: 0.22, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(side * (L / 2) - 0.11, E, 0);
    B.add('log', g);
  }
  // Roof: two slopes (38°) overhanging 1.0 m at the eaves and 1.1 m at the gables, fascia boards, gutters
  const run = D / 2 + 1.0, pitch = (H - E) / (D / 2), drop = pitch * run;
  const slope = Math.hypot(run, drop), angle = Math.atan(pitch);
  for (const side of [-1, 1]) {
    const g = new THREE.BoxGeometry(L + 2.2, 0.2, slope);
    g.rotateX(side * angle);
    g.translate(0, H + 0.1 - drop / 2, side * run / 2);
    B.add('roof', g);
    // fascia along the eaves and the gutter in front of it
    B.box('boards', L + 2.2, 0.26, 0.05, 0, H - drop - 0.02, side * (run + 0.02));
    const gutter = new THREE.CylinderGeometry(0.07, 0.07, L + 2.2, 8, 1, true, 0, Math.PI);
    gutter.rotateZ(Math.PI / 2); gutter.rotateX(Math.PI);
    gutter.translate(0, H - drop - 0.1, side * (run + 0.1));
    B.add('metal', gutter);
    // exposed rafter ends under the eaves, every 0.9 m
    for (let x = -L / 2 - 0.9; x <= L / 2 + 0.95; x += 0.9) {
      B.box('boards', 0.12, 0.16, 1.15, x, E + 0.4 - pitch * 0.55, side * (D / 2 + 0.5), { rx: side * angle });
    }
  }
  // Barge boards along the gable verges, and the purlins' ends under the gable overhangs
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.06, 0.3, slope);
      g.rotateX(side * angle);
      g.translate(end * (L / 2 + 1.1), H - drop / 2, side * run / 2);
      B.add('boards', g);
    }
    for (const [z, y] of [[0, H - 0.25], [-D / 4, E + (H - E) / 2 - 0.25], [D / 4, E + (H - E) / 2 - 0.25], [-D / 2 + 0.3, E + 0.2], [D / 2 - 0.3, E + 0.2]]) {
      B.box('boards', 1.2, 0.2, 0.16, end * (L / 2 + 0.5), y, z);
    }
  }
  // Chimney on the ridge, north of the middle, with its cap on four posts
  B.box('chimney', 0.7, 2.0, 0.7, -1.6, H - 0.2 + 0.5, -0.4);
  B.box('metal', 0.95, 0.05, 0.95, -1.6, H + 1.45, -0.4);
  for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) B.box('metal', 0.04, 0.22, 0.04, -1.6 + dx, H + 1.33, -0.4 + dz);
  // Downpipes at the corners of the street side
  for (const x of [-L / 2 - 0.9, L / 2 + 0.9]) {
    const g = new THREE.CylinderGeometry(0.05, 0.05, H - drop, 8);
    g.translate(x, (H - drop) / 2, D / 2 + 1.05);
    B.add('metal', g);
  }

  const S = faceFrame('street', L, D), N = faceFrame('north', L, D), G = faceFrame('south', L, D), K = faceFrame('back', L, D);
  // Street side: the boarded lean-to (north part), a narrow window and a window with shutters on the ground floor, a
  // small window with shutters and one without upstairs, the cellar window in the plinth
  const lx0 = -L / 2 + 0.15, lx1 = -1.5, ld = 1.7, lh = 3.7;
  B.box('plaster', lx1 - lx0, P + 0.4, ld, (lx0 + lx1) / 2, (P - 0.4) / 2, D / 2 + ld / 2);
  B.box('boards', lx1 - lx0, lh - P, ld, (lx0 + lx1) / 2, P + (lh - P) / 2, D / 2 + ld / 2);
  {
    // its mono-pitch roof, overhanging
    const w = lx1 - lx0 + 0.8, run2 = ld + 0.6, rise = 0.55;
    const g = new THREE.BoxGeometry(w, 0.16, Math.hypot(run2, rise));
    g.rotateX(Math.atan(rise / run2));
    g.translate((lx0 + lx1) / 2, lh + 0.25 + rise / 2 - 0.05, D / 2 + run2 / 2);
    B.add('roof', g);
    B.box('boards', w, 0.2, 0.05, (lx0 + lx1) / 2, lh + 0.18, D / 2 + run2 + 0.02);
    const gutter = new THREE.CylinderGeometry(0.06, 0.06, w, 8, 1, true, 0, Math.PI);
    gutter.rotateZ(Math.PI / 2); gutter.rotateX(Math.PI);
    gutter.translate((lx0 + lx1) / 2, lh + 0.1, D / 2 + run2 + 0.1);
    B.add('metal', gutter);
  }
  const LA = { at: (a) => [a, D / 2 + ld], n: [0, 1], ry: 0 };
  windowAt(B, LA, -3.1, 2.4, 1.6, 1.15, { box: true });
  // the garage doors in its plinth, the dish on its front
  B.box('door', 2.2, P - 0.1, 0.06, (lx0 + lx1) / 2, (P - 0.1) / 2, D / 2 + ld + 0.03);
  {
    const g = new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, 0.6);
    g.rotateX(Math.PI / 2 + 0.5); g.scale(1, 1, 0.5);
    g.translate(lx1 - 0.35, 2.6, D / 2 + ld + 0.3);
    B.add('dish', g);
    B.box('dish', 0.04, 0.04, 0.45, lx1 - 0.35, 2.5, D / 2 + ld + 0.18);
  }
  windowAt(B, S, -1.05, 2.35, 0.5, 1.5);
  windowAt(B, S, 1.3, 2.35, 1.0, 1.15, { shutters: true });
  windowAt(B, S, 3.6, 2.35, 0.9, 1.0, { shutters: true });
  windowAt(B, S, -2.9, 4.95, 0.8, 0.85, { shutters: true });
  windowAt(B, S, 1.4, 4.95, 0.9, 0.95);
  windowAt(B, S, 3.6, 4.95, 0.9, 0.95, { shutters: true });
  // cellar window
  {
    const pane = new THREE.PlaneGeometry(1.0, 0.45);
    pane.translate(0.4, 0.55, D / 2 + 0.09);
    B.add('glass', pane);
    B.box('frame', 1.1, 0.55, 0.05, 0.4, 0.55, D / 2 + 0.04);
  }

  // North gable: two ground-floor windows with shutters; upstairs the wooden balcony on its east half with two tall
  // windows behind it and a window on the street side; the attic window
  windowAt(B, N, 3.2, 2.4, 0.95, 1.1, { shutters: true });
  windowAt(B, N, 0.6, 2.4, 0.95, 1.1, { shutters: true, box: true });
  windowAt(B, N, -2.0, 2.4, 0.95, 1.1, { shutters: true });
  windowAt(B, N, -3.8, 4.85, 0.8, 1.35);
  windowAt(B, N, -1.9, 4.85, 0.8, 1.35);
  windowAt(B, N, 3.0, 4.95, 0.85, 0.95, { shutters: true });
  windowAt(B, N, -2.6, 7.6, 0.6, 0.7, { sill: false });
  {
    // balcony: floor slab on two beams, a balustrade of vertical boards, its top rail
    const z0 = -D / 2 + 0.3, z1 = -0.5, out = 1.15, fy = 3.95;
    const cz = (z0 + z1) / 2, w = z1 - z0;
    B.box('boards', out, 0.12, w, -L / 2 - out / 2, fy, cz);
    for (const z of [z0 + 0.2, z1 - 0.2]) B.box('boards', out + 0.4, 0.18, 0.14, -L / 2 - out / 2 + 0.2, fy - 0.15, z);
    B.box('boards', 0.06, 0.95, w, -L / 2 - out + 0.03, fy + 0.55, cz);
    for (const z of [z0, z1]) B.box('boards', out, 0.95, 0.06, -L / 2 - out / 2, fy + 0.55, z);
    B.box('boards', 0.12, 0.08, w + 0.1, -L / 2 - out + 0.03, fy + 1.06, cz);
  }

  // South gable: the front door up its outdoor stair, windows either side, three upstairs, the attic window; the small
  // roof over the door and the window beside it
  const doorY = P + 0.05;
  doorAt(B, G, -0.3, doorY, 0.9, 2.0);
  windowAt(B, G, -3.0, 2.4, 0.9, 1.05, { shutters: true });
  windowAt(B, G, 2.2, 2.4, 1.0, 1.2);
  windowAt(B, G, 3.95, 2.4, 0.45, 1.2);
  windowAt(B, G, -3.1, 4.95, 0.95, 1.0);
  windowAt(B, G, 0.3, 4.95, 0.8, 0.95);
  windowAt(B, G, 3.3, 4.95, 0.85, 1.05);
  windowAt(B, G, 1.0, 8.1, 0.55, 0.65, { sill: false });
  {
    // the little roof (z from 0.9 to −4.6 in local terms: a from −0.9 to 4.6)
    const a0 = -0.9, a1 = 4.6, out = 1.2, rise = 0.45, y = 3.45;
    const g = new THREE.BoxGeometry(Math.hypot(out, rise), 0.14, a1 - a0);
    g.rotateZ(-Math.atan(rise / out));
    g.translate(L / 2 + out / 2, y + rise / 2, -(a0 + a1) / 2);
    B.add('roof', g);
    B.box('boards', 0.05, 0.18, a1 - a0, L / 2 + out + 0.02, y - 0.05, -(a0 + a1) / 2);
    // the stair: from the ground on the street side up to the landing before the door, stringers and a hand rail
    const steps = 7, rise1 = doorY / steps, tread = 0.3, sx = L / 2 + 0.55;
    // (the top step next to the landing, the lowest towards the street)
    for (let i = 0; i < steps; i++) B.box('boards', 0.95, 0.05, 0.28, sx, rise1 * (i + 1) - 0.02, 1.05 + (steps - 1 - i) * tread);
    B.box('boards', 0.95, 0.06, 1.0, sx, doorY - 0.03, 0.3);
    const len = Math.hypot(steps * tread, doorY);
    for (const dx of [-0.47, 0.47]) {
      const g2 = new THREE.BoxGeometry(0.06, 0.22, len);
      g2.rotateX(Math.atan(doorY / (steps * tread))); // (high at the door, low on the street side)
      g2.translate(sx + dx, doorY / 2, 0.75 + steps * tread / 2 - 0.15);
      B.add('boards', g2);
    }
    const rail = new THREE.BoxGeometry(0.05, 0.05, len);
    rail.rotateX(Math.atan(doorY / (steps * tread)));
    rail.translate(sx + 0.47, doorY / 2 + 0.95, 0.75 + steps * tread / 2 - 0.15);
    B.add('boards', rail);
    for (const z of [0.75, 0.75 + steps * tread]) B.box('boards', 0.05, 1.0, 0.05, sx + 0.47, (z === 0.75 ? doorY : 0) + 0.5, z);
    // the lantern by the door
    B.box('metal', 0.14, 0.24, 0.14, L / 2 + 0.12, doorY + 2.3, 0.45);
  }

  // Back (east) side: a row of windows on both floors
  for (const a of [-3.6, -1.2, 1.2, 3.6]) {
    windowAt(B, K, a, 2.4, 0.9, 1.05, { shutters: a > 0 });
    windowAt(B, K, a, 4.95, 0.9, 1.0, { shutters: a > 0 });
  }
}

// --- Picket fence (Staketenzaun): pickets every 11.5 cm and two rails along each segment, following the ground ---------
function buildFence(group, M, house, fr, baseY) {
  const pickets = [], rails = [];
  for (const [[ax, az], [bx, bz]] of house.fence) {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    const yaw = Math.atan2(ux, uz); // the segment's direction, about y (a box's depth (z) along it)
    for (let t = 0; t <= len; t += 0.115) pickets.push({ x: ax + ux * t, z: az + uz * t, yaw });
    for (let t = 0; t < len; t += 2.4) {
      const te = Math.min(len, t + 2.4), x0 = ax + ux * t, z0 = az + uz * t, x1 = ax + ux * te, z1 = az + uz * te;
      const ya = groundHeight(...toWorld(fr, x0, z0)) - baseY, yb = groundHeight(...toWorld(fr, x1, z1)) - baseY;
      for (const hy of [0.25, 0.8]) {
        const g = new THREE.BoxGeometry(0.04, 0.07, te - t);
        g.rotateX(-Math.atan2(yb - ya, te - t));
        g.rotateY(yaw);
        g.translate((x0 + x1) / 2, (ya + yb) / 2 + hy, (z0 + z1) / 2);
        rails.push(g);
      }
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 1.05, 0.07), M.fence, pickets.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  pickets.forEach((p, i) => {
    const h = 0.9 + 0.09 * ((((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1); // slightly uneven tops
    s.set(1, h / 1.05, 1);
    q.setFromAxisAngle(up, p.yaw);
    m.compose(new THREE.Vector3(p.x, groundHeight(...toWorld(fr, p.x, p.z)) - baseY + h / 2 - 0.05, p.z), q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = 'detail fence pickets';
  group.add(mesh);
  const railMesh = new THREE.Mesh(mergeGeometries(rails.map((g) => g.toNonIndexed()), false), M.fence);
  railMesh.castShadow = railMesh.receiveShadow = true;
  group.add(railMesh);
}

const BUILDERS = { 'dischmastrasse-19': buildDischmastrasse19 };

/**
 * Builds the hand-made houses into `scene`. Returns { group, colliders } (colliders in the flat-world form main.js
 * lifts onto the terrain: heights above the ground, oriented boxes).
 */
export function buildDetailHouses(scene) {
  const root = new THREE.Group();
  root.name = 'DetailHouses';
  root.userData.terrain = 'absolute';
  const M = materials(), colliders = [];
  for (const house of DETAIL_HOUSES) {
    const build = BUILDERS[house.id];
    if (!build) continue;
    const fr = frame(house);
    // The foot of the house: the lowest ground under its footprint
    const baseY = Math.min(...house.footprint.map(([x, z]) => groundHeight(x, z)));
    const group = new THREE.Group();
    group.name = house.id;
    group.position.set(fr.cx, baseY, fr.cz);
    group.rotation.y = fr.theta;
    const B = new Builder();
    build(B, house, fr);
    group.add(...B.meshes(M));
    buildFence(group, M, house, fr, baseY);
    root.add(group);
    // Colliders: the main block (with its eaves), the lean-to, the fence
    const cs = Math.cos(fr.theta), sn = Math.sin(fr.theta);
    const obb = (lx, lz, hx, hz, maxY) => {
      const [cx, cz] = toWorld(fr, lx, lz);
      const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
      colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, minY: 0, maxY, obb: { cx, cz, hx, hz, cs, sn } });
    };
    obb(0, 0, fr.length / 2, fr.depth / 2, house.height);
    const lx0 = -fr.length / 2 + 0.15, lx1 = -1.5; // the lean-to
    obb((lx0 + lx1) / 2, fr.depth / 2 + 0.85, (lx1 - lx0) / 2, 0.85, 4.2);
    // the fence: one thin box per segment (the segments run along local x or z)
    for (const [[ax, az], [bx, bz]] of house.fence) obb((ax + bx) / 2, (az + bz) / 2, Math.max(0.05, Math.abs(bx - ax) / 2), Math.max(0.05, Math.abs(bz - az) / 2), 1.1);
  }
  scene.add(root);
  return { group: root, colliders };
}
