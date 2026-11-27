import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { LANDMARK_SOURCE_EXCLUSIONS } from './landmarks.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, nightGlow, worldNoise } from './building-kit.js';
import { PISCHA, flagPole, floorOf, onWall, outwardRing, roofOutline, sideFrame, wallFrame } from './pischa-data.js';

export { PISCHA };

// The Pischa kiosk by the car park at the Seehofseeli rebuilt by hand (js/pischa-data.js), standing in for the plain box
// js/buildings.js drew on its OpenStreetMap outline (swisstopo's survey does not have it): dark-stained timber boards on
// a concrete plinth, the flat roof with its deep eave and "PISCHABUS" on the front's fascia, the door, the ski area's
// poster over the painted concrete panel, the posters, the notice board and the ticket window on the south-east side,
// the flag pole at the east corner with its banner. Five meshes: the walls, the roof, the glass, the trim (one
// vertex-coloured mesh) and the posters and lettering (one canvas atlas).

// (js/buildings.js draws nothing and raises no walls on its outline: the walls' colliders are this module's)
LANDMARK_SOURCE_EXCLUSIONS.add(PISCHA.osm);

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
const TIMBER = [0.11, 0.062, 0.034], CONCRETE = [0.26, 0.26, 0.25];
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.2, 0.2, 0.19], 0.9);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    // (the mobile profile: the mean colours, js/landmark-buildings.js SIMPLE_SKINS)
    M.timber = SIMPLE_SKINS.plain([0.1, 0.06, 0.036], 0.88);
    M.glass = SIMPLE_SKINS.glow([0.06, 0.08, 0.09], 0.15, 0.5, [1.0, 0.8, 0.55], 0.25);
    return M;
  }
  const U = uv().x, V = uv().y;
  const fine = fade(8, 28);
  // Vertical boards 12 cm wide, each a shade of its own, the joints dark (fading out by 28 m); the concrete plinth
  // under them (v: metres over the floor)
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
    const board = fract(U.div(0.12));
    const joint = smoothstep(0.08, 0.0, board).max(smoothstep(0.92, 1.0, board)).mul(fine);
    const id = hash(floor(U.div(0.12)).mul(17.3));
    const wood = mix(vec3(...TIMBER).mul(0.8), vec3(...TIMBER).mul(1.2), id).mul(worldNoise(1.3).mul(0.3).add(0.85)).mul(float(1).sub(joint.mul(0.45)));
    const concrete = mix(vec3(...CONCRETE).mul(0.85), vec3(...CONCRETE).mul(1.1), worldNoise(0.9));
    const plinth = step(V, PISCHA.plinth);
    // (a drip edge over the plinth: a darker line)
    const drip = smoothstep(0.03, 0.0, abs(V.sub(PISCHA.plinth))).mul(fine);
    m.colorNode = mix(wood, concrete, plinth).mul(float(1).sub(drip.mul(0.5)));
    m.roughnessNode = mix(float(0.88), float(0.95), plinth);
    M.timber = m;
  }
  // The ticket window: shut at night, a faint light behind it
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.6 });
    m.colorNode = mix(vec3(0.04, 0.055, 0.065), vec3(0.09, 0.11, 0.12), worldNoise(0.6));
    m.emissiveNode = vec3(1.0, 0.8, 0.55).mul(nightGlow().mul(0.25));
    M.glass = m;
  }
  return M;
}

// --- The lettering, the posters and the banner: one canvas atlas ---------------------------------------------------------
const ATLAS_SIZE = [1024, 512];
export const ATLAS = {
  lettering: [0, 0, 1024, 116], // 3.2 × 0.36 m
  poster: [0, 120, 352, 302], // 1.75 × 1.5 m
  mural: [356, 120, 512, 206], // 2.85 × 1.15 m
  side: [872, 120, 124, 264], // 0.8 × 1.7 m
  winter: [356, 330, 120, 180], // 1.0 × 1.5 m
  banner: [480, 330, 60, 180], // 0.8 × 2.4 m
  notice: [544, 330, 180, 150] // 1.2 × 1.0 m
};
const BLUE = '#1d3f8f', YELLOW = '#f2c230', SANS = 'Helvetica, Arial, sans-serif';

/** A five-pointed star (centre x, y, outer radius r) */
function star(g, x, y, r, colour) {
  g.fillStyle = colour;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r * 0.42 : r;
    g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  g.closePath();
  g.fill();
}

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  // "PISCHABUS" in light grey letters on the fascia (the timber shows round them)
  cell('lettering', (w, h) => {
    g.fillStyle = '#c4c8c6'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${Math.round(h * 0.78)}px ${SANS}`;
    const text = 'PISCHABUS', pitch = (w - 40) / text.length;
    [...text].forEach((t, i) => g.fillText(t, 20 + pitch * (i + 0.5), h / 2 + 2));
  });
  // The ski area's poster: white, the star, the name, what it offers, the friends' line in red at its foot
  cell('poster', (w, h) => {
    g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#9aa0a3'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    star(g, 64, 50, 30, BLUE); star(g, 80, 46, 13, YELLOW);
    g.fillStyle = '#16203a'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = `bold 62px ${SANS}`; g.fillText('pischa', 104, 104);
    g.font = `bold 20px ${SANS}`; g.fillText('DAVOS KLOSTERS', 126, 130);
    g.font = `18px ${SANS}`;
    ['Gut präparierte Pisten', 'Winterwanderweg', 'Gratis Parkplätze', 'Kinderland', 'Rennpiste', 'Funpark']
      .forEach((t, i) => g.fillText(`- ${t}`, 30, 170 + i * 21));
    g.fillStyle = '#c8202a'; g.font = `bold italic 17px ${SANS}`; g.textAlign = 'right'; g.fillText('PROPISCHA', w - 24, h - 16);
  });
  // The painted concrete panel: a boy in a cap calling for the bus, the words in a blue bubble (drawn freely)
  cell('mural', (w, h) => {
    g.fillStyle = '#c9c9c4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b4b4ae'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % w, (i * 53) % h, 18, 3);
    // the bubble
    g.fillStyle = '#8fb3df'; g.strokeStyle = '#2c4f8c'; g.lineWidth = 6;
    g.beginPath(); g.ellipse(w * 0.63, h * 0.48, w * 0.3, h * 0.42, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(w * 0.36, h * 0.52); g.lineTo(w * 0.27, h * 0.62); g.lineTo(w * 0.38, h * 0.64); g.closePath(); g.fill();
    g.fillStyle = '#2a4d9a'; g.strokeStyle = '#e8eef8'; g.lineWidth = 3; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold 40px ${SANS}`;
    [['ZUM', 0.25], ['PISCHA', 0.5], ['BUS', 0.75]].forEach(([t, f]) => { g.strokeText(t, w * 0.63, h * f); g.fillText(t, w * 0.63, h * f); });
    // the boy
    g.fillStyle = '#d9a67a'; g.strokeStyle = '#3a2416'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(w * 0.15, h * 0.52, 46, 56, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#6b3a1e'; g.beginPath(); g.ellipse(w * 0.15, h * 0.3, 52, 26, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(w * 0.19, h * 0.48, 13, 17, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(w * 0.2, h * 0.49, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2416'; g.beginPath(); g.arc(w * 0.2, h * 0.68, 12, 0, Math.PI); g.stroke();
  });
  // The posters on the south-east side: the ski area's (portrait) and a winter one
  cell('side', (w, h) => {
    g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, w, h);
    star(g, w / 2, 40, 22, BLUE); star(g, w / 2 + 10, 36, 9, YELLOW);
    g.fillStyle = '#16203a'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `bold 34px ${SANS}`; g.fillText('pischa', w / 2, 100);
    g.font = `bold 12px ${SANS}`; g.fillText('DAVOS KLOSTERS', w / 2, 118);
    g.fillStyle = '#5d7fb8'; g.fillRect(12, 140, w - 24, 90);
    g.fillStyle = '#f4f6fa'; g.beginPath(); g.moveTo(12, 230); g.lineTo(50, 168); g.lineTo(80, 200); g.lineTo(100, 178); g.lineTo(w - 12, 230); g.fill();
  });
  cell('winter', (w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#2f6fc0'); sky.addColorStop(1, '#a9cdf0');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f5f7fb'; g.beginPath(); g.moveTo(0, h * 0.7); g.lineTo(w * 0.45, h * 0.32); g.lineTo(w * 0.7, h * 0.5); g.lineTo(w, h * 0.38); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    g.fillStyle = '#c8202a'; g.fillRect(w * 0.18, h * 0.74, w * 0.6, h * 0.08); g.fillRect(w * 0.3, h * 0.68, w * 0.34, h * 0.07);
    g.fillStyle = '#ffffff'; g.font = `bold 15px ${SANS}`; g.textAlign = 'center'; g.fillText('DAVOS KLOSTERS', w / 2, 24);
  });
  // The banner on the pole: white, a blue head with a yellow stripe, the star and the name down it
  cell('banner', (w, h) => {
    g.fillStyle = '#f2f3f0'; g.fillRect(0, 0, w, h);
    g.fillStyle = BLUE; g.fillRect(0, 0, w, h * 0.16);
    g.fillStyle = YELLOW; g.fillRect(0, h * 0.16, w, h * 0.03);
    star(g, w / 2, h * 0.28, 16, BLUE);
    g.save(); g.translate(w / 2, h * 0.66); g.rotate(Math.PI / 2);
    g.fillStyle = '#16203a'; g.font = `bold 24px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('pischa', 0, 0);
    g.restore();
  });
  // The notice board: a dark frame, sheets pinned on it
  cell('notice', (w, h) => {
    g.fillStyle = '#3b2a1c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8b6a45'; g.fillRect(8, 8, w - 16, h - 16);
    const sheets = [[16, 16, 46, 60, '#f3f1ea'], [70, 20, 40, 54, '#f7e98a'], [118, 14, 48, 64, '#f3f1ea'], [22, 84, 60, 50, '#d9e8f5'], [96, 88, 64, 48, '#f3f1ea']];
    for (const [x, y, sw, sh, col] of sheets) {
      g.fillStyle = col; g.fillRect(x, y, sw, sh);
      g.fillStyle = '#8a8a86'; for (let l = y + 10; l < y + sh - 6; l += 7) g.fillRect(x + 5, l, sw - 10, 2);
    }
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
const C = {
  fascia: [0.085, 0.05, 0.03], soffit: [0.12, 0.075, 0.045], door: [0.07, 0.042, 0.026], frame: [0.05, 0.032, 0.02],
  handle: [0.45, 0.45, 0.44], panel: [0.33, 0.33, 0.32], board: [0.5, 0.5, 0.49], metal: [0.3, 0.31, 0.31],
  counter: [0.28, 0.28, 0.27], pole: [0.52, 0.53, 0.54], step: [0.3, 0.3, 0.29]
};

// The walls: timber on the plinth, from under the lowest ground up to the eave's soffit (v: metres over the floor)
function buildWalls(B, floorY, base) {
  const ring = outwardRing(PISCHA.ring), top = floorY + PISCHA.wall;
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    const v0 = base - floorY, v1 = top - floorY;
    B.quad('timber', P(0, base), P(F.len, base), P(F.len, top), P(0, top), [[0, v0], [F.len, v0], [F.len, v1], [0, v1]]);
  }
}

// The flat roof over the eaves: the fascia round it, the soffit under it, the roof on top
function buildRoof(B, floorY) {
  const out = roofOutline(), y0 = floorY + PISCHA.wall, y1 = floorY + PISCHA.roof;
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    B.quad('trim', [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], undefined, { colour: C.fascia });
  }
  flatRoof(B, out, y1);
  // (the soffit: the roof's triangles turned to face down)
  const tmp = new Builder();
  flatRoof(tmp, out, y0, { bucket: 'soffit' });
  const p = tmp.bucket('soffit').pos;
  for (let i = 0; i < p.length; i += 9) {
    B.tri('trim', [p[i], p[i + 1], p[i + 2]], [p[i + 6], p[i + 7], p[i + 8]], [p[i + 3], p[i + 4], p[i + 5]], undefined, { colour: C.soffit });
  }
  // the lettering on the front's fascia, centred on the wall
  const F = sideFrame('front'), L = PISCHA.lettering, eave = PISCHA.sides.front.eave;
  B.decal(F, (F.len - L.w) / 2, (F.len + L.w) / 2, eave + 0.02, floorY + L.y0, floorY + L.y1, 'lettering');
}

// The front: the door with its frame and step, the painted panel, the poster in its frame
function buildFront(B, floorY) {
  const F = sideFrame('front'), D = PISCHA.door, Mu = PISCHA.mural, Po = PISCHA.poster;
  B.box('trim', F, D.s0 - 0.06, D.s1 + 0.06, 0, 0.03, floorY - 0.02, floorY + D.y1 + 0.06, C.frame);
  B.box('trim', F, D.s0, D.s1, 0.03, 0.05, floorY, floorY + D.y1, C.door);
  B.box('trim', F, D.s1 - 0.17, D.s1 - 0.08, 0.05, 0.1, floorY + 1.0, floorY + 1.04, C.handle);
  B.box('trim', F, D.s0 - 0.15, D.s1 + 0.15, 0, 0.45, floorY - PISCHA.step - 0.3, floorY, C.step);
  // the concrete panel the boy is painted on, a little proud of the wall
  B.box('trim', F, Mu.s0 - 0.05, Mu.s1 + 0.05, 0, 0.06, floorY - 0.25, floorY + Mu.y1 + 0.05, C.panel);
  B.decal(F, Mu.s0, Mu.s1, 0.065, floorY + Mu.y0, floorY + Mu.y1, 'mural');
  B.box('trim', F, Po.s0 - 0.05, Po.s1 + 0.05, 0, 0.03, floorY + Po.y0 - 0.05, floorY + Po.y1 + 0.05, C.board);
  B.decal(F, Po.s0, Po.s1, 0.035, floorY + Po.y0, floorY + Po.y1, 'poster');
}

// The south-east side: the ticket window with its counter, the notice board, the posters
function buildSoutheast(B, floorY) {
  const F = sideFrame('southeast'), W = PISCHA.window, N = PISCHA.notice;
  const P = (s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  B.box('trim', F, W.s0 - 0.08, W.s1 + 0.08, 0, 0.04, floorY + W.y0 - 0.08, floorY + W.y1 + 0.08, C.metal);
  B.quad('glass', P(W.s0, 0.045, floorY + W.y0), P(W.s1, 0.045, floorY + W.y0), P(W.s1, 0.045, floorY + W.y1), P(W.s0, 0.045, floorY + W.y1));
  const mid = (W.s0 + W.s1) / 2;
  B.box('trim', F, mid - 0.03, mid + 0.03, 0.045, 0.07, floorY + W.y0, floorY + W.y1, C.metal);
  B.box('trim', F, W.s0 - 0.12, W.s1 + 0.12, 0, 0.35, floorY + W.y0 - 0.06, floorY + W.y0, C.counter);
  B.box('trim', F, N.s0 - 0.03, N.s1 + 0.03, 0, 0.03, floorY + N.y0 - 0.03, floorY + N.y1 + 0.03, C.frame);
  B.decal(F, N.s0, N.s1, 0.035, floorY + N.y0, floorY + N.y1, 'notice');
  for (const p of PISCHA.sidePosters) {
    B.box('trim', F, p.s0 - 0.03, p.s1 + 0.03, 0, 0.02, floorY + p.y0 - 0.03, floorY + p.y1 + 0.03, C.board);
    B.decal(F, p.s0, p.s1, 0.025, floorY + p.y0, floorY + p.y1, p.key);
  }
}

// The flag pole off the front's east corner, its arm and the banner (both its sides)
function buildFlag(B, floorY, foot) {
  const F = sideFrame('front'), G = PISCHA.flag, top = floorY + G.height;
  B.box('trim', F, G.s - 0.045, G.s + 0.045, G.out - 0.045, G.out + 0.045, foot - 0.3, top, C.pole);
  B.box('trim', F, G.s, G.s + G.w + 0.05, G.out - 0.02, G.out + 0.02, top - 0.32, top - 0.28, C.pole);
  const y1 = top - 0.32, y0 = y1 - G.h;
  B.decal(F, G.s + 0.05, G.s + 0.05 + G.w, G.out + 0.005, y0, y1, 'banner');
  const [bx, bz] = onWall(F, G.s + 0.05 + G.w, G.out - 0.005);
  const back = { a: [bx, bz], u: [-F.u[0], -F.u[1]], n: [-F.n[0], -F.n[1]] };
  B.decal(back, 0, G.w, 0, y0, y1, 'banner');
}

/** An oriented collider box along a wall a → b (thin, centred on it), from `baseY` up to `top` */
function wallCollider(a, b, baseY, top, hz = 0.22) {
  const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY, minY: baseY, maxY: top, obb: { cx, cz, hx, hz, cs, sn } };
}

/**
 * Builds the Pischa kiosk into `scene`. Returns { group, colliders }: its walls' (js/buildings.js raises none on its
 * outline, LANDMARK_SOURCE_EXCLUSIONS) and the flag pole's, at world heights (baseY set, so liftColliders leaves them be).
 */
export function buildPischa(scene) {
  const root = new THREE.Group();
  root.name = 'Pischa';
  root.userData.terrain = 'absolute'; // its heights come from the ground here (main.js placeOnTerrain leaves it be)
  const { floor: floorY, low } = floorOf(groundHeight);
  const base = low - PISCHA.foot;
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, name: 'Pischa' }), M = materials();
  buildWalls(B, floorY, base);
  buildRoof(B, floorY);
  buildFront(B, floorY);
  buildSoutheast(B, floorY);
  const [px, pz] = flagPole();
  buildFlag(B, floorY, groundHeight(px, pz));
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);
  const top = floorY + PISCHA.roof, ring = outwardRing(PISCHA.ring);
  const colliders = ring.map((a, i) => wallCollider(a, ring[(i + 1) % ring.length], base, top));
  const F = sideFrame('front');
  colliders.push(wallCollider(onWall(F, PISCHA.flag.s - 0.06, PISCHA.flag.out), onWall(F, PISCHA.flag.s + 0.06, PISCHA.flag.out), base, floorY + PISCHA.flag.height, 0.06));
  return { group: root, colliders };
}
