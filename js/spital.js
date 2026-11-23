import * as THREE from 'three/webgpu';
import { abs, float, floor, fract, hash, mix, mx_noise_float, positionWorld, smoothstep, step, uv, vec3 } from 'three/tsl';
import { groundHeight } from './terrain.js';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { SPITAL, SPITAL_ENTRANCE, hallFrame, onWall, outwardRing, wallFrame, wallStretches } from './spital-data.js';

export { SPITAL, SPITAL_ENTRANCE };
// (the Builder and the decals' material were the Spital's first; they are js/building-kit.js')
export { Builder, decalMaterial };

// The Spital Davos rebuilt by hand (js/spital-data.js), standing in for its swissBUILDINGS3D volume, which the streamed
// tiles drew as one white block with the town houses' windows: the surveyed volumes in board-marked concrete, a window
// in a timber frame in every bay of every floor (drawn by the wall's material from its uv: metres along the wall from
// its middle, metres up the floors' grid), the coloured reliefs on the ward block, the glazed entrance hall under its
// canopy with the lettering on the forecourt, the stele and the blue H. Five meshes: the walls, the roofs, the hall's
// glass, the trim (one vertex-coloured mesh) and the reliefs and signs (one canvas atlas). The Rega pad on the west
// wing's roof is js/helipad.js.

excludeBuildings([SPITAL.exclude]);

const BAY = 3.0; // a window's bay along a wall
const STOREY = SPITAL.floors.storey;
// v of a wall: metres up the floors' grid, a floor's top at every multiple of STOREY (the ward block's roof at 20 of
// them, so that v is positive down to the base); closed walls carry v − CLOSED (a whole number of floors, so the
// boards' and the joints' lines run on)
const V0 = 20 * STOREY - SPITAL.floors.top;
const CLOSED = 300 * STOREY;
// A window in its storey (m up from the floor's foot) and its half width
const WIN = { lo: 0.95, hi: 2.5, half: 1.06 };

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
function materials() {
  const M = {};
  const simple = QUALITY.simpleMaterials;
  M.roof = SIMPLE_SKINS.snowRoof([0.3, 0.295, 0.28], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  if (simple) {
    // (the mobile profile: the mean colours, a lit band per floor at night, js/landmark-buildings.js SIMPLE_SKINS)
    M.concrete = SIMPLE_SKINS.windowed([0.25, 0.25, 0.236], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.45);
    M.glass = SIMPLE_SKINS.glow([0.2, 0.25, 0.27], 0.08, 0.85, [1.0, 0.8, 0.58], 0.5);
    return M;
  }
  const U = uv().x, V = uv().y;
  const near = fade(140, 420); // the windows' frames and blinds
  const fine = fade(20, 70); // the boards' marks, the joints
  const glow = nightGlow();
  // Board-marked concrete with a window per bay and floor: a timber frame with a post in its middle, a light blind
  // drawn part of the way down some of them
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const { half, v, bay, bu, storey, fv, open, rect } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, winHalf: WIN.half });
    const win = rect(WIN.half, WIN.lo, WIN.hi).mul(open);
    const pane = rect(WIN.half - 0.1, WIN.lo + 0.1, WIN.hi - 0.1).mul(float(1).sub(smoothstep(0.05, 0.03, abs(bu)).mul(near))).mul(open);
    // the concrete: the boards' marks every 12 cm, a joint under every floor and between the bays, weathered streaks
    const boards = smoothstep(0.4, 0.5, abs(fract(v.div(0.12)).sub(0.5))).mul(fine);
    const joint = smoothstep(0.035, 0.015, fv).max(smoothstep(0.03, 0.012, abs(abs(bu).sub(BAY / 2))).mul(step(0.5, half))).mul(fine);
    const weather = worldNoise(0.35).mul(0.6).add(mx_noise_float(positionWorld.mul(vec3(1.6, 0.12, 1.6))).mul(0.2).add(0.2));
    const conc = mix(vec3(0.2, 0.2, 0.188), vec3(0.3, 0.3, 0.283), weather).mul(float(1).sub(boards.mul(0.1))).mul(float(1).sub(joint.mul(0.35)));
    // the window: larch frame, dark glass, the blind
    const id = hash(bay.mul(37.7).add(storey.mul(91.3)).add(half.mul(13.1)));
    const drawn = step(0.55, id).mul(mix(float(0.35), float(1), step(0.85, id))); // none, a third, all the way
    const blind = step(WIN.hi - 0.1 - (WIN.hi - WIN.lo - 0.2), fv).mul(step(float(WIN.hi - 0.1).sub(drawn.mul(WIN.hi - WIN.lo - 0.2)), fv)).mul(pane).mul(near);
    const slats = smoothstep(0.3, 0.5, abs(fract(fv.div(0.08)).sub(0.5))).mul(fine);
    const glassC = mix(vec3(0.02, 0.026, 0.032), vec3(0.07, 0.085, 0.1), worldNoise(0.07));
    const frameC = mix(vec3(0.33, 0.17, 0.07), vec3(0.4, 0.22, 0.1), id);
    let c = mix(conc, frameC, win);
    c = mix(c, glassC, pane);
    c = mix(c, vec3(0.62, 0.62, 0.6).mul(float(1).sub(slats.mul(0.18))), blind);
    m.colorNode = c;
    const shiny = pane.mul(float(1).sub(blind));
    m.roughnessNode = mix(float(0.92), float(0.12), shiny);
    m.metalnessNode = shiny.mul(0.55);
    // (a hospital: more of them lit late at night than a house has)
    m.emissiveNode = litWindow(bay, storey.add(half.mul(3.3)), 5, { share: 0.42, late: 0.42 * 0.8, tone: twoTones([1.0, 0.72, 0.42], [0.8, 0.86, 1.0], 0.7) }).mul(pane).mul(mix(float(1), float(0.45), blind)).mul(glow.mul(1.15));
    M.concrete = m;
  }
  // The hall's curtain wall: anthracite posts every 1.25 m, a rail every 1.1 m, the panes mirroring the sky; lit at night
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.85 });
    const mu = abs(fract(U.div(1.25)).sub(0.5)), mv = abs(fract(V.div(1.1)).sub(0.5));
    const frame = smoothstep(0.465, 0.478, mu).max(smoothstep(0.46, 0.475, mv)).mul(near.mul(0.85).add(0.15));
    const paneId = hash(floor(U.div(1.25)).mul(13.1).add(floor(V.div(1.1)).mul(7.3)));
    m.colorNode = mix(mix(vec3(0.1, 0.15, 0.17), vec3(0.2, 0.27, 0.29), paneId), vec3(0.045, 0.047, 0.05), frame);
    m.roughnessNode = mix(float(0.08), float(0.6), frame);
    m.metalnessNode = mix(float(0.85), float(0.3), frame);
    m.emissiveNode = vec3(1.0, 0.84, 0.62).mul(float(1).sub(frame)).mul(paneId.mul(0.3).add(0.7)).mul(glow.mul(0.35));
    M.glass = m;
  }
  return M;
}

// --- The reliefs and the signs: one canvas atlas (px of 1024) -------------------------------------------------------------
const ATLAS_SIZE = 1024;
export const ATLAS = {
  sun: [0, 0, 500, 617],
  spirals: [512, 0, 416, 336],
  star: [512, 352, 232, 496],
  stele: [770, 352, 172, 500],
  h: [8, 640, 128, 128],
  name: [8, 870, 1000, 60]
};
const RED = '#d2402f', ORANGE = '#ee8a1d', YELLOW = '#f3c11c', BLUE = '#2b4bb0', GREEN = '#2e9960', TEAL = '#1d7f86';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // (the reliefs stand a hand off the wall: a soft shadow under them)
  const relief = (on) => { g.shadowColor = on ? 'rgba(0, 0, 0, 0.4)' : 'transparent'; g.shadowBlur = on ? 5 : 0; g.shadowOffsetX = on ? 3 : 0; g.shadowOffsetY = on ? 4 : 0; };
  const spiral = (cx, cy, r, turns, width, colour, start = 0, dir = 1) => {
    g.strokeStyle = colour; g.lineWidth = width; g.beginPath();
    const n = Math.ceil(turns * 48);
    for (let i = 0; i <= n; i++) { const t = i / n, a = start + dir * t * turns * Math.PI * 2, rr = r * (0.06 + 0.94 * t); g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.stroke();
  };
  const disc = (cx, cy, r, colour) => { g.fillStyle = colour; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); };
  const ring = (cx, cy, r, width, colour) => { g.strokeStyle = colour; g.lineWidth = width; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); };
  // a crescent: the disc of radius r less a disc shifted by (dx, dy)
  const crescent = (cx, cy, r, turn, colour, bite = 0.45) => {
    g.save(); g.translate(cx, cy); g.rotate(turn); g.fillStyle = colour; g.beginPath();
    g.arc(0, 0, r, Math.PI * 0.08, Math.PI * 0.92);
    g.quadraticCurveTo(0, r * bite, r * Math.cos(Math.PI * 0.08), r * Math.sin(Math.PI * 0.08));
    g.fill(); g.restore();
  };
  // a tapering stroke through the points (a brush mark): discs along a quadratic curve
  const brush = (p0, p1, p2, w0, w1, colour) => {
    g.fillStyle = colour;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), cc = t * t;
      g.beginPath(); g.arc(a * p0[0] + b * p1[0] + cc * p2[0], a * p0[1] + b * p1[1] + cc * p2[1], (w0 + (w1 - w0) * t) / 2, 0, Math.PI * 2); g.fill();
    }
  };

  // The sun on the west front: a comb of rays bent over a disc of rings, a blue fan beside it, a red crescent, a wave
  // with its dot and green leaves below
  cell('sun', (w, h) => {
    relief(true);
    // the comb: a long bent stem with rays to the left of it, its top forked
    brush([120, 300], [70, 150], [215, 28], 13, 9, ORANGE);
    for (let i = 0; i < 6; i++) { const t = i / 5, x = 113 - 30 * Math.sin(t * 2.4) + 62 * t * t, y = 292 - 215 * t; brush([x, y], [x - 26, y - 4], [x - 46, y + 6 - 16 * t], 9, 5, ORANGE); }
    for (const dx of [-26, 0, 26]) brush([215, 30], [222 + dx * 0.5, 8], [226 + dx, -22 + Math.abs(dx) * 0.2], 8, 5, YELLOW);
    // the disc of rings
    const cx = 215, cy = 245;
    disc(cx, cy, 100, RED);
    relief(false);
    ring(cx, cy, 84, 15, ORANGE); ring(cx, cy, 62, 13, RED); ring(cx, cy, 43, 12, YELLOW); ring(cx, cy, 25, 10, RED); disc(cx, cy, 13, YELLOW);
    spiral(cx, cy, 96, 3.5, 4, 'rgba(120, 30, 20, 0.5)', 0.4);
    relief(true);
    // the blue fan to its right
    for (let i = 0; i < 4; i++) brush([330, 285], [352 + i * 12, 235 - i * 6], [348 + i * 30, 150 + i * 22], 26 - i * 3, 5, BLUE);
    // the dark blue arc under the disc
    brush([150, 330], [215, 392], [318, 322], 9, 22, '#243c95');
    // the red crescent, the wave and its dot, the green leaves
    crescent(70, 395, 62, -0.5, RED, 0.2);
    brush([60, 520], [95, 440], [135, 505], 20, 22, BLUE);
    brush([135, 505], [170, 560], [215, 470], 22, 14, BLUE);
    disc(232, 520, 27, BLUE);
    brush([265, 455], [330, 395], [420, 415], 10, 30, GREEN);
    brush([330, 500], [395, 395], [455, 385], 8, 24, TEAL);
    brush([455, 385], [490, 420], [470, 500], 24, 8, GREEN);
  });
  // The two spirals and the blue dot on the north front
  cell('spirals', (w, h) => {
    relief(true);
    spiral(120, 150, 78, 2.6, 20, RED, 0.6);
    spiral(285, 105, 60, 1.6, 18, ORANGE, 2.4, -1);
    brush([285, 105], [345, 60], [392, 120], 16, 8, YELLOW);
    disc(235, 270, 36, BLUE);
  });
  // The star with its dot and crescent on the west front's south end
  cell('star', (w, h) => {
    relief(true);
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.52; brush([120, 150], [120 + Math.cos(a) * 55, 150 + Math.sin(a) * 55], [120 + Math.cos(a) * 118, 150 + Math.sin(a) * 118], 30, 6, BLUE); }
    brush([120, 150], [100, 175], [70, 185], 26, 8, BLUE);
    disc(112, 262, 34, RED);
    crescent(112, 318, 78, 0.12, BLUE, 0.55);
    brush([52, 428], [40, 452], [64, 470], 18, 8, YELLOW);
    brush([64, 470], [84, 478], [88, 455], 12, 6, BLUE);
  });
  relief(false);
  // The blue H
  cell('h', (w, h) => {
    g.fillStyle = '#1f5fbf'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = '#ffffff'; g.font = 'bold 96px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('H', w / 2, h / 2 + 5);
  });
  // The house's mark, as drawn here: a lozenge, a yellow leaf in it
  const mark = (cx, cy, s) => {
    g.save(); g.translate(cx, cy);
    g.strokeStyle = '#1f3f8f'; g.lineWidth = s * 0.09; g.beginPath(); g.moveTo(0, -s); g.quadraticCurveTo(s * 0.62, 0, 0, s); g.quadraticCurveTo(-s * 0.62, 0, 0, -s); g.stroke();
    g.fillStyle = '#e9b21d'; g.beginPath(); g.moveTo(s * 0.04, -s * 0.78); g.quadraticCurveTo(s * 0.5, 0, s * 0.04, s * 0.78); g.quadraticCurveTo(s * 0.2, 0, s * 0.04, -s * 0.78); g.fill();
    g.restore();
  };
  // The lettering on the canopy
  cell('name', (w, h) => {
    g.fillStyle = '#26303a'; g.font = '600 50px Helvetica, Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    // (spaced out letter by letter, the mark before them, the whole centred on the board)
    const text = 'SPITAL DAVOS', gap = 26, widths = [...text].map((ch) => g.measureText(ch).width + gap);
    let x = (w - (70 + widths.reduce((a, b) => a + b, 0) - gap)) / 2;
    mark(x + 20, h / 2, 26);
    x += 70;
    [...text].forEach((ch, i) => { g.fillText(ch, x, h / 2 + 3); x += widths[i]; });
  });
  // The stele: the mark, the name, the houses under it
  cell('stele', (w, h) => {
    mark(w / 2, 92, 62);
    g.fillStyle = '#26303a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 21px Helvetica, Arial, sans-serif';
    g.fillText('SPITAL DAVOS', w / 2, 196);
    g.fillStyle = '#5b6670'; g.font = '13px Helvetica, Arial, sans-serif';
    ['Notfall', 'Empfang', 'Besucher'].forEach((line, i) => g.fillText(line, w / 2, 262 + i * 30));
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// A volume: its walls from the base up to its roof (cut into stretches with and without windows), the roof over them
function buildPart(B, part) {
  const ring = outwardRing(part.ring), top = part.top, y0 = SPITAL.base;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const F = wallFrame(a, b);
    if (F.len < 0.05) continue;
    for (const st of wallStretches(a, b, part.windows !== false)) {
      const len = st.to - st.from, mid = (st.from + st.to) / 2;
      const windows = st.windows && len >= 4;
      const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
      const v = (y) => y + V0 - (windows ? 0 : CLOSED);
      B.quad('concrete', P(st.from, y0), P(st.to, y0), P(st.to, top), P(st.from, top),
        [[st.from - mid, v(y0)], [st.to - mid, v(y0)], [st.to - mid, v(top)], [st.from - mid, v(top)]], { half: windows ? len / 2 : 0 });
    }
  }
  flatRoof(B, ring, top);
}

// The colours of the trim (linear)
const C = {
  concrete: [0.25, 0.25, 0.236], steel: [0.05, 0.052, 0.056], canopy: [0.5, 0.58, 0.56], white: [0.8, 0.8, 0.78],
  post: [0.62, 0.63, 0.64], blue: [0.02, 0.11, 0.5], floor: [0.24, 0.24, 0.235]
};

// The entrance hall on the forecourt, the stele and the H. Returns the forecourt's level before the doors
function buildHall(B) {
  const H = SPITAL.hall, F = hallFrame();
  const at = (s, o) => groundHeight(...onWall(F, s, o));
  const y0 = at(H.door, H.depth + 0.6); // the forecourt before the doors
  let low = y0;
  for (let s = H.from; s <= H.to; s += 2.5) for (const o of [0, H.depth, H.depth + H.canopy.out]) low = Math.min(low, at(s, o));
  const sill = y0 + 0.12, slab = y0 + H.floor, top = y0 + H.top;
  // the plinth under it, the floor's slab between the two storeys, the roof's edge
  B.box('trim', F, H.from - 0.1, H.to + 0.1, -0.3, H.depth + 0.1, low - 1.2, sill, C.concrete);
  B.box('trim', F, H.from - 0.12, H.to + 0.12, 0, H.depth + 0.12, slab - 0.02, slab + 0.3, C.concrete);
  B.box('trim', F, H.from - 0.18, H.to + 0.18, 0, H.depth + 0.18, top - 0.32, top, C.steel, { top: 'roof' });
  // the glass: the front and the two ends, the two storeys (uv in metres, the rails' grid from the sill)
  const P = (s, o, y) => { const [x, z] = onWall(F, s, o); return [x, y, z]; };
  const glaze = (a, b, w, u0) => {
    for (const [lo, hi] of [[sill, slab], [slab + 0.3, top - 0.32]]) {
      B.quad('glass', [a[0], lo, a[1]], [b[0], lo, b[1]], [b[0], hi, b[1]], [a[0], hi, a[1]], [[u0, lo - sill], [u0 + w, lo - sill], [u0 + w, hi - sill], [u0, hi - sill]]);
    }
  };
  const L = H.to - H.from;
  glaze(onWall(F, H.from, H.depth), onWall(F, H.to, H.depth), L, 0);
  glaze(onWall(F, H.from, 0), onWall(F, H.from, H.depth), H.depth, 0);
  glaze(onWall(F, H.to, H.depth), onWall(F, H.to, 0), H.depth, 0);
  // the posts at the corners and every 6.25 m along the front
  for (let s = H.from; s <= H.to + 0.01; s += L / 4) B.box('trim', F, s - 0.14, s + 0.14, H.depth - 0.1, H.depth + 0.1, sill, top - 0.3, C.steel);
  // the doors: a frame before the glass, a threshold
  const d0 = H.door - H.doorWidth / 2, d1 = H.door + H.doorWidth / 2;
  for (const s of [d0, H.door, d1]) B.box('trim', F, s - 0.05, s + 0.05, H.depth, H.depth + 0.09, sill, sill + 2.35, C.steel);
  B.box('trim', F, d0 - 0.05, d1 + 0.05, H.depth, H.depth + 0.09, sill + 2.35, sill + 2.47, C.steel);
  B.box('trim', F, d0 - 0.3, d1 + 0.3, H.depth, H.depth + 1.3, y0 - 0.6, y0 + 0.05, C.floor);
  // the canopy over them, the lettering on its edge
  const cn = H.canopy, front = H.depth + cn.out;
  B.box('trim', F, cn.from, cn.to, H.depth, front, slab - 0.1, slab - 0.1 + cn.thick, C.canopy, { top: 'roof' });
  B.box('trim', F, cn.from + 0.2, cn.to - 0.2, H.depth, front - 0.2, slab - 0.2, slab - 0.1, C.steel);
  const nameW = Math.min(8.2, cn.to - cn.from - 1), nameH = nameW * ATLAS.name[3] / ATLAS.name[2];
  B.box('trim', F, H.door - nameW / 2 - 0.25, H.door + nameW / 2 + 0.25, front, front + 0.04, slab - 0.06, slab + nameH + 0.02, C.white);
  B.decal(F, H.door - nameW / 2, H.door + nameW / 2, front + 0.05, slab - 0.02, slab - 0.02 + nameH, 'name');

  // the stele: a white slab, the mark and the name towards the forecourt and towards the wing
  const [ss, so] = H.stele, sy = at(ss, so);
  B.box('trim', F, ss - 0.55, ss + 0.55, so - 0.14, so + 0.14, sy - 0.5, sy + 3.2, C.white);
  B.decal(F, ss - 0.55, ss + 0.55, so + 0.15, sy, sy + 3.2, 'stele');
  // the H on its post: the blue plate both ways
  const [hs, ho] = H.sign, hy = at(hs, ho);
  B.box('trim', F, hs - 0.05, hs + 0.05, ho - 0.05, ho + 0.05, hy - 0.5, hy + 3.3, C.post);
  B.box('trim', F, hs - 0.48, hs + 0.48, ho - 0.035, ho + 0.035, hy + 3.3, hy + 4.26, C.blue);
  B.decal(F, hs - 0.45, hs + 0.45, ho + 0.04, hy + 3.33, hy + 4.23, 'h');
  const back = { a: onWall(F, hs + 0.45, ho - 0.04), u: [-F.u[0], -F.u[1]], n: [-F.n[0], -F.n[1]] };
  B.decal(back, 0, 0.9, 0, hy + 3.33, hy + 4.23, 'h');
  return { y0, low, stele: [ss, so, sy], sign: [hs, ho, hy] };
}

/**
 * Builds the Spital Davos into `scene`. Returns { group, colliders } (colliders at world heights: baseY set, so
 * liftColliders leaves them be; the walls of OpenStreetMap's footprint are js/buildings.js').
 */
export function buildSpital(scene) {
  const root = new THREE.Group();
  root.name = 'Spital Davos';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: [ATLAS_SIZE, ATLAS_SIZE], walls: 'concrete', name: 'Spital Davos' }), M = materials();
  for (const part of SPITAL.parts) buildPart(B, part);
  for (const m of SPITAL.murals) {
    const F = wallFrame(m.a, m.b);
    B.decal(F, m.at, m.at + m.w, 0.05, m.y, m.y + m.h, m.key);
  }
  const hall = buildHall(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);

  // Colliders: a thin wall along a stretch, a box in the hall's frame
  const colliders = [];
  const wall = (a, b, y0, y1, thick = 0.44) => {
    const F = wallFrame(a, b), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hx = F.len / 2, hz = thick / 2;
    const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: y0, minY: y0, maxY: y1, obb: { cx, cz, hx, hz, cs, sn } });
  };
  for (const part of SPITAL.parts) {
    if (!part.collide) continue;
    part.ring.forEach((a, i) => wall(a, part.ring[(i + 1) % part.ring.length], SPITAL.base, part.top));
  }
  const F = hallFrame(), H = SPITAL.hall;
  const box = (s0, s1, o0, o1, y0, y1) => wall(onWall(F, s0, (o0 + o1) / 2), onWall(F, s1, (o0 + o1) / 2), y0, y1, o1 - o0);
  box(H.from, H.to, 0, H.depth, hall.low - 1.2, hall.y0 + H.top);
  box(hall.stele[0] - 0.55, hall.stele[0] + 0.55, hall.stele[1] - 0.14, hall.stele[1] + 0.14, hall.stele[2] - 0.5, hall.stele[2] + 3.2);
  box(hall.sign[0] - 0.08, hall.sign[0] + 0.08, hall.sign[1] - 0.08, hall.sign[1] + 0.08, hall.sign[2] - 0.5, hall.sign[2] + 4.3);
  return { group: root, colliders };
}
