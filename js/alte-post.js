import * as THREE from 'three/webgpu';
import { abs, float, fract, mix, mx_noise_float, positionWorld, smoothstep, step, vec3 } from 'three/tsl';
import { excludeBuildings } from './swissbuildings3d.js';
import { QUALITY } from './quality.js';
import { SIMPLE_SKINS } from './landmark-buildings.js';
import { Builder, atlasCanvas, canvasTexture, decalMaterial, fade, flatRoof, litWindow, nightGlow, rectMask, twoTones, windowGrid, worldNoise } from './building-kit.js';
import { onWall, outwardRing, wallFrame } from './spital-data.js';
import { ALTE_POST, ALTE_POST_ENTRANCE, frontFrame, frontWindows } from './alte-post-data.js';

export { ALTE_POST, ALTE_POST_ENTRANCE };

// The Alte Post at the Postplatz rebuilt by hand (js/alte-post-data.js), standing in for its swissBUILDINGS3D volumes,
// which the streamed tiles drew as a white box with blue panes: the surveyed blocks in warm plaster over a banded
// ground floor, a window in a stone surround in every bay of every floor (drawn by the walls' material from their uv),
// on the Promenade the stone portal with its piers and pilasters, the timber doors and POSTPLATZ on the entablature,
// over it the sgraffito field and the band of firs (one canvas atlas, drawn here: the windows are holes in it, at the
// places the walls' material puts them). Four meshes: the walls, the roofs, the trim, the decals.

excludeBuildings(ALTE_POST.exclude);

const { bay: BAY, storey: STOREY, groundFloor: GROUND_FLOOR, window: WIN } = ALTE_POST;
// v of a wall: metres over the ground floor's top + UP (ten storeys, so that v is positive down to the base); closed
// walls carry v − CLOSED
const UP = 10 * STOREY, CLOSED = 300 * STOREY;
const SURROUND = 0.16; // the stone round a window

// --- Materials (linear colours) ----------------------------------------------------------------------------------------
function materials() {
  const M = {};
  M.roof = SIMPLE_SKINS.snowRoof([0.3, 0.295, 0.28], 0.92);
  M.trim = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
  if (QUALITY.simpleMaterials) {
    M.plaster = SIMPLE_SKINS.windowed([0.4, 0.365, 0.29], STOREY, WIN.lo / STOREY, WIN.hi / STOREY, 0.9, 0.4, { bay: BAY, half: WIN.half });
    return M;
  }
  const near = fade(140, 420), fine = fade(20, 70);
  const glow = nightGlow();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 });
  // (v: metres over the ground floor's top)
  const { half, v: vv, bay: bayI, bu, storey, fv, open } = windowGrid({ bay: BAY, storey: STOREY, closed: CLOSED, up: UP, winHalf: WIN.half });
  const upper = step(0, vv);
  const gy = vv.add(GROUND_FLOOR); // (on the ground floor: metres over the ground)
  // the upper floors: a window of two lights in a white frame, a stone surround
  const surround = rectMask(bu, fv, WIN.half + SURROUND, WIN.lo - SURROUND, WIN.hi + SURROUND).mul(open).mul(upper);
  const win = rectMask(bu, fv, WIN.half, WIN.lo, WIN.hi).mul(open).mul(upper);
  const light = rectMask(abs(bu).sub(WIN.half / 2), fv, WIN.half / 2 - 0.09, WIN.lo + 0.08, WIN.hi - 0.08).mul(float(1).sub(smoothstep(0.03, 0.015, abs(fv.sub(WIN.hi - 0.5))).mul(near))).mul(open).mul(upper);
  // the ground floor: a smaller window behind bars
  const gWin = rectMask(bu, gy, 0.8, 1.7, 3.5).mul(open).mul(float(1).sub(upper));
  const bars = smoothstep(0.34, 0.42, abs(fract(bu.div(0.17)).sub(0.5))).mul(near);
  const gPane = rectMask(bu, gy, 0.72, 1.78, 3.42).mul(open).mul(float(1).sub(upper));
  // the plaster, the ground floor's bands with their joints, the course over them
  const weather = worldNoise(0.4).mul(0.65).add(mx_noise_float(positionWorld.mul(vec3(1.4, 0.1, 1.4))).mul(0.18).add(0.18));
  const plaster = mix(vec3(0.36, 0.325, 0.255), vec3(0.45, 0.41, 0.33), weather);
  const joints = smoothstep(0.035, 0.012, abs(fract(gy.div(0.52)).sub(0.5).mul(0.52))).mul(fine);
  const banded = mix(vec3(0.2, 0.185, 0.155), vec3(0.26, 0.24, 0.2), weather).mul(float(1).sub(joints.mul(0.45)));
  const course = smoothstep(-0.32, -0.3, vv).mul(smoothstep(0.06, 0.04, vv));
  const stone = mix(vec3(0.3, 0.275, 0.225), vec3(0.36, 0.33, 0.275), weather);
  const glassC = mix(vec3(0.02, 0.025, 0.03), vec3(0.07, 0.08, 0.09), worldNoise(0.07));
  let c = mix(banded, plaster, upper);
  c = mix(c, stone, course.max(surround));
  c = mix(c, vec3(0.7, 0.7, 0.68), win);
  c = mix(c, glassC, light);
  c = mix(c, mix(glassC, vec3(0.05, 0.05, 0.055), bars), gPane);
  c = mix(c, stone, gWin.sub(gPane).max(0));
  m.colorNode = c;
  const shiny = light.max(gPane.mul(float(1).sub(bars)));
  m.roughnessNode = mix(float(0.93), float(0.12), shiny);
  m.metalnessNode = shiny.mul(0.5);
  // (a library and museums: few of them lit late)
  m.emissiveNode = litWindow(bayI, storey.add(half.mul(3.3)), 9, { share: 0.4, late: 0.4 * 0.35, tone: twoTones([1.0, 0.66, 0.36], [1.0, 0.8, 0.55], 0.5) }).mul(light).mul(glow.mul(1.1));
  M.plaster = m;
  return M;
}

// --- The sgraffito, the doors and the lettering: one canvas atlas ---------------------------------------------------------
const ATLAS_SIZE = [1024, 1200];
const PX = 110; // px per metre in the field and the firs' band
export const ATLAS = {
  field: [4, 4, 1012, 754],
  firs: [4, 770, 330, 275], // a bay of the band, the window in its middle
  firsEnd: [340, 770, 311, 275], // the band's end beyond the last bay
  door: [660, 770, 235, 390],
  slit: [905, 770, 90, 390],
  name: [4, 1060, 640, 75]
};
const DARK = '#25242b', BEIGE = '#a39473', PALE = '#b0a283', LINE = '#75684f';

function atlasTexture() {
  const { canvas: c, g, cell } = atlasCanvas(ATLAS_SIZE, ATLAS);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const rect = (x, y, w, h, colour) => { g.fillStyle = colour; g.fillRect(x, y, w, h); };
  const disc = (x, y, r, colour) => { g.fillStyle = colour; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const poly = (pts, colour) => { g.fillStyle = colour; g.beginPath(); pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill(); };
  const stroke = (pts, width, colour) => { g.strokeStyle = colour; g.lineWidth = width; g.beginPath(); pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.stroke(); };
  // (a figure: drawn in a frame of its own, its feet at (x, y), `s` px to the unit, mirrored with flip)
  const at = (x, y, s, draw, flip = false) => { g.save(); g.translate(x, y); g.scale(flip ? -s : s, s); draw(); g.restore(); };

  // The figures, in units (y up is negative), beige on the dark ground with a few cut lines
  const wheel = (x, y, r, spokes = 8) => {
    g.strokeStyle = BEIGE; g.lineWidth = r * 0.22; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.lineWidth = r * 0.12;
    for (let i = 0; i < spokes; i++) { const a = (i / spokes) * Math.PI * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke(); }
    disc(x, y, r * 0.22, BEIGE);
  };
  const fir = (h = 1, w = 0.5) => {
    rect(-0.04 * h, -0.14 * h, 0.08 * h, 0.14 * h, BEIGE);
    for (let i = 0; i < 4; i++) { const y0 = -0.1 * h - i * 0.2 * h, ww = w * (1 - i * 0.2); poly([[-ww / 2, y0], [ww / 2, y0], [0, y0 - 0.34 * h]], BEIGE); }
    for (let i = 0; i < 4; i++) { const y0 = -0.1 * h - i * 0.2 * h, ww = w * (1 - i * 0.2); stroke([[-ww * 0.3, y0 - 0.03 * h], [ww * 0.3, y0 - 0.03 * h]], 0.012 * h, LINE); }
  };
  const man = ({ pack = false, stick = false, hat = true } = {}) => {
    poly([[-0.1, 0], [-0.02, 0], [0.0, -0.42], [0.02, 0], [0.12, 0], [0.09, -0.48], [0.11, -0.86], [-0.11, -0.86], [-0.09, -0.48]], BEIGE); // legs and coat
    disc(0, -0.97, 0.085, BEIGE);
    if (hat) poly([[-0.13, -1.02], [0.13, -1.02], [0.07, -1.12], [-0.07, -1.12]], BEIGE);
    stroke([[0.08, -0.8], [0.2, -0.6], [0.26, -0.45]], 0.06, BEIGE); // the arm before him
    if (pack) { poly([[-0.12, -0.84], [-0.3, -0.8], [-0.3, -0.5], [-0.12, -0.5]], BEIGE); stroke([[-0.3, -0.66], [-0.13, -0.66]], 0.015, LINE); }
    if (stick) stroke([[0.26, -0.5], [0.3, 0]], 0.025, BEIGE);
    stroke([[-0.07, -0.5], [0.07, -0.5]], 0.015, LINE);
  };
  const horse = () => {
    poly([[-0.5, -0.62], [0.32, -0.66], [0.5, -0.98], [0.6, -1.05], [0.72, -0.88], [0.62, -0.84], [0.5, -0.6], [0.42, -0.4], [-0.44, -0.38]], BEIGE); // body, neck, head
    for (const [x, k] of [[-0.42, -0.06], [-0.3, 0.05], [0.28, -0.05], [0.4, 0.08]]) stroke([[x, -0.42], [x + k, -0.2], [x + k * 2.2, 0]], 0.07, BEIGE);
    stroke([[-0.5, -0.6], [-0.66, -0.42], [-0.62, -0.25]], 0.05, BEIGE); // the tail
    stroke([[0.36, -0.7], [0.5, -0.94]], 0.015, LINE);
  };
  const coach = () => {
    poly([[-0.9, -0.45], [0.9, -0.45], [0.95, -0.7], [0.8, -1.25], [-0.8, -1.25], [-0.95, -0.7]], BEIGE);
    for (const x of [-0.6, -0.15, 0.3]) rect(x, -1.12, 0.32, 0.3, DARK);
    stroke([[-0.9, -0.74], [0.9, -0.74]], 0.02, LINE);
    rect(-0.75, -1.4, 1.5, 0.1, BEIGE); // the luggage rail
    rect(0.9, -0.95, 0.3, 0.12, BEIGE); // the box seat
    wheel(-0.55, -0.3, 0.3); wheel(0.6, -0.36, 0.36);
    // (the Swiss cross on the door)
    rect(0.06, -0.68, 0.16, 0.05, DARK); rect(0.115, -0.735, 0.05, 0.16, DARK);
  };
  const wagon = () => {
    g.fillStyle = BEIGE; g.beginPath(); g.moveTo(-0.85, -0.5); g.lineTo(-0.85, -0.9); g.quadraticCurveTo(0, -1.5, 0.85, -0.9); g.lineTo(0.85, -0.5); g.closePath(); g.fill();
    for (const x of [-0.45, 0, 0.45]) stroke([[x, -0.52], [x, -1.12 - (0.2 - Math.abs(x) * 0.25)]], 0.015, LINE);
    rect(-0.9, -0.52, 1.8, 0.1, BEIGE);
    wheel(-0.5, -0.24, 0.24); wheel(0.5, -0.24, 0.24);
    stroke([[0.9, -0.46], [1.5, -0.4]], 0.04, BEIGE); // the shaft
  };
  const plane = () => {
    poly([[-1.3, -0.72], [0.55, -0.62], [0.95, -0.48], [0.55, -0.34], [-1.3, -0.5]], BEIGE); // the body
    poly([[-1.3, -0.72], [-1.62, -1.0], [-1.5, -0.6]], BEIGE); // the tail
    poly([[-0.55, -1.02], [0.75, -1.02], [0.85, -0.92], [-0.45, -0.92]], BEIGE); // the two wings
    poly([[-0.5, -0.46], [0.75, -0.46], [0.85, -0.36], [-0.4, -0.36]], BEIGE);
    for (const x of [-0.25, 0.25, 0.6]) stroke([[x, -0.94], [x, -0.44]], 0.025, BEIGE);
    stroke([[0.97, -0.82], [0.97, -0.14]], 0.04, BEIGE); // the propeller
    stroke([[0.1, -0.36], [0.0, -0.12]], 0.03, BEIGE); stroke([[0.35, -0.36], [0.45, -0.12]], 0.03, BEIGE);
    wheel(0.02, -0.1, 0.1, 4); wheel(0.45, -0.1, 0.1, 4);
    rect(-0.98, -0.66, 0.2, 0.06, DARK); rect(-0.91, -0.73, 0.06, 0.2, DARK); // the cross
  };
  const balloon = () => {
    g.fillStyle = BEIGE; g.beginPath(); g.ellipse(0, -0.75, 0.3, 0.36, 0, 0, Math.PI * 2); g.fill();
    for (const x of [-0.14, 0, 0.14]) stroke([[x, -1.08], [x * 0.5, -0.42]], 0.012, LINE);
    stroke([[-0.2, -0.5], [-0.07, -0.2]], 0.015, BEIGE); stroke([[0.2, -0.5], [0.07, -0.2]], 0.015, BEIGE);
    rect(-0.08, -0.2, 0.16, 0.13, BEIGE);
  };
  const engine = () => {
    rect(-1.1, -0.95, 1.5, 0.5, BEIGE); // the boiler
    rect(0.4, -1.3, 0.7, 0.85, BEIGE); // the cab
    rect(0.55, -1.18, 0.38, 0.3, DARK);
    rect(0.3, -1.4, 0.9, 0.1, BEIGE);
    poly([[-0.9, -0.95], [-0.96, -1.35], [-0.68, -1.35], [-0.74, -0.95]], BEIGE); // the chimney
    g.fillStyle = BEIGE; g.beginPath(); g.arc(-0.3, -0.95, 0.14, Math.PI, 0); g.fill(); // the dome
    rect(-1.25, -0.5, 2.4, 0.09, BEIGE);
    poly([[-1.25, -0.42], [-1.5, -0.12], [-1.2, -0.12]], BEIGE); // the cowcatcher
    for (const x of [-0.85, -0.3, 0.25]) wheel(x, -0.24, 0.24, 6);
    wheel(0.82, -0.17, 0.17, 6);
    stroke([[-0.85, -0.24], [0.25, -0.24]], 0.045, BEIGE);
    for (const x of [-0.6, 0]) stroke([[x, -0.93], [x, -0.47]], 0.015, LINE);
  };
  const town = () => {
    rect(-0.7, -0.5, 0.5, 0.5, BEIGE); rect(-0.15, -0.72, 0.55, 0.72, BEIGE); rect(0.45, -0.42, 0.4, 0.42, BEIGE);
    poly([[-0.75, -0.5], [-0.45, -0.72], [-0.15, -0.5]], BEIGE);
    rect(-1.0, -0.95, 0.22, 0.95, BEIGE); poly([[-1.03, -0.95], [-0.89, -1.45], [-0.75, -0.95]], BEIGE); // the church tower
    for (const [x, y] of [[-0.58, -0.38], [-0.38, -0.38], [-0.05, -0.58], [0.2, -0.58], [-0.05, -0.3], [0.2, -0.3], [0.56, -0.3]]) rect(x, y, 0.1, 0.14, DARK);
  };
  // An ornament panel: a frame of teeth and dots, three rosettes one over the other
  const rosette = (x, y, r) => {
    g.strokeStyle = LINE; g.lineWidth = r * 0.1; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.fillStyle = LINE; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.46, y + Math.sin(a) * r * 0.46, r * 0.36, r * 0.15, a, 0, Math.PI * 2); g.fill(); }
    disc(x, y, r * 0.14, LINE);
  };
  const teeth = (x, y, w, h) => {
    // (a border: a row of small squares along the rectangle's edge)
    const d = 9;
    g.fillStyle = LINE;
    for (let s = x + d / 2; s < x + w - d / 2; s += d) { g.fillRect(s - 2, y + 2, 4, 4); g.fillRect(s - 2, y + h - 6, 4, 4); }
    for (let s = y + d / 2; s < y + h - d / 2; s += d) { g.fillRect(x + 2, s - 2, 4, 4); g.fillRect(x + w - 6, s - 2, 4, 4); }
  };
  const panel = (x, y, w, h) => {
    rect(x, y, w, h, PALE);
    g.strokeStyle = LINE; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    teeth(x, y, w, h);
    g.strokeRect(x + 10, y + 10, w - 20, h - 20);
    const r = Math.min(w * 0.3, h / 7.5);
    if (w > 60) for (let i = 0; i < 3; i++) rosette(x + w / 2, y + h * (0.2 + i * 0.3), r);
    else for (let s = y + 20; s < y + h - 14; s += 16) poly([[x + w / 2 - 6, s], [x + w / 2 + 6, s], [x + w / 2, s + 10]], LINE);
  };
  // A window's place: a hole (the wall's own window shows through, with its stone surround)
  const hole = (cx, top, bottom, halfW) => g.clearRect(cx - halfW, top, halfW * 2, bottom - top);

  // The field over the portal: two rows of three windows, a frieze over each
  cell('field', (w, h) => {
    const F = ALTE_POST.field, Y = (v) => (F.hi - v) * PX, X = (s) => (s - F.from) * PX;
    rect(0, 0, w, h, BEIGE);
    const rows = [frontWindows(0), frontWindows(1)].map((row) => row.filter((q) => q.s > F.from && q.s < F.to));
    const hw = (WIN.half + SURROUND) * PX;
    for (const row of rows) {
      const top = Y(row[0].hi + SURROUND), bottom = Y(row[0].lo - SURROUND);
      // the ornament panels between and beside the windows
      const edges = [0, ...row.flatMap((q) => [X(q.s) - hw, X(q.s) + hw]), w];
      for (let i = 0; i < edges.length; i += 2) panel(edges[i] + 3, top - 6, edges[i + 1] - edges[i] - 6, bottom - top + 12);
    }
    // the friezes: over the first floor's windows the road (the carter's wagon, the walkers, the mail coach), over the
    // second's what came after (the town, the plane, the balloon, the engine)
    const frieze = (lo, hi, draw) => {
      const y0 = Y(hi), y1 = Y(lo);
      rect(6, y0, w - 12, y1 - y0, DARK);
      g.strokeStyle = BEIGE; g.lineWidth = 2; g.strokeRect(9, y0 + 3, w - 18, y1 - y0 - 6);
      draw(y1 - 12, (y1 - y0 - 22) / 1.5); // the ground line, px to a unit (a figure is some 1.5 units tall)
    };
    frieze(7.95, 9.25, (y, s) => {
      at(120, y, s, wagon);
      at(262, y, s * 0.95, () => man({ stick: true }));
      for (const x of [318, 356]) at(x, y, s * 0.62, () => fir(1.5, 0.7));
      at(416, y, s, () => man({ pack: true, stick: true }));
      at(500, y, s, () => man({ pack: true, hat: false }));
      at(640, y, s, coach);
      at(772, y, s * 0.55, () => fir(1.5, 0.7));
      at(842, y, s, horse);
      at(936, y, s, horse);
      at(880, y - s * 0.62, s * 0.8, () => man({ hat: true }));
    });
    frieze(11.3, 12.55, (y, s) => {
      at(96, y, s * 0.95, town);
      at(214, y, s, () => man({ hat: true }));
      at(430, y - s * 0.12, s * 0.92, plane);
      at(596, y - s * 0.3, s * 0.8, balloon);
      at(660, y, s, () => man({ hat: true, stick: true }));
      at(838, y, s * 0.9, engine);
    });
    // the foot of the field over the portal: a band of teeth
    const foot = Y(rows[0][0].lo - SURROUND) + 6;
    rect(0, foot, w, h - foot, PALE);
    for (let x = 8; x < w - 8; x += 22) poly([[x, h - 3], [x + 18, h - 3], [x + 9, foot + 5]], LINE);
    g.strokeStyle = LINE; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
    for (const row of rows) for (const q of row) hole(X(q.s), Y(q.hi + SURROUND), Y(q.lo - SURROUND), hw);
  });
  // The firs' band across the third floor: a bay of it (the window in its middle), and its end
  const firsBand = (w, h, window) => {
    rect(0, 0, w, h, DARK);
    const y = h - 10, s = (h - 26) / 1.5;
    const xs = window ? [20, 52, w - 52, w - 20] : [28, 70, 122, 170, 222, 270];
    xs.forEach((x, i) => at(x, y, s * (i % 2 ? 1 : 0.8), () => fir(1.5, 0.62)));
    if (!window) { disc(96, 52, 15, BEIGE); disc(96, 52, 8, DARK); disc(246, 60, 15, BEIGE); disc(246, 60, 8, DARK); }
    rect(0, 0, w, 5, BEIGE); rect(0, h - 5, w, 5, BEIGE);
  };
  cell('firs', (w, h) => {
    firsBand(w, h, true);
    const F = ALTE_POST.firs, q = frontWindows(2)[0], hw = (WIN.half + SURROUND) * PX;
    hole(w / 2, (F.hi - q.hi - SURROUND) * PX, (F.hi - q.lo + SURROUND) * PX, hw);
  });
  cell('firsEnd', (w, h) => firsBand(w, h, false));
  // The doors: timber frames and leaves, the hall's warm light behind the glass
  const glazing = (x, y, w, h) => {
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#8a6a3c'); grad.addColorStop(0.55, '#5b4526'); grad.addColorStop(1, '#3a2d1b');
    g.fillStyle = grad; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255, 236, 190, 0.5)'; g.beginPath(); g.ellipse(x + w / 2, y + h * 0.18, w * 0.3, 5, 0, 0, Math.PI * 2); g.fill(); // a lamp's ring
  };
  const WOOD = '#b08748', WOOD_DARK = '#8f6c38';
  cell('door', (w, h) => {
    rect(0, 0, w, h, WOOD);
    const transom = h * 0.3;
    glazing(8, 8, w - 16, transom - 12);
    g.fillStyle = '#f4f1e8'; g.font = '600 19px Helvetica, Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('BIBLIOTHEK', 18, transom * 0.55);
    // two leaves, a pane in each, a kick plate under it
    for (const x0 of [8, w / 2 + 2]) {
      const lw = w / 2 - 10;
      rect(x0, transom + 4, lw, h - transom - 4, WOOD_DARK);
      rect(x0 + 3, transom + 7, lw - 6, h - transom - 10, WOOD);
      glazing(x0 + 16, transom + 22, lw - 32, (h - transom) * 0.66);
    }
    rect(w / 2 + 12, transom + 60, 4, 150, '#d9d9d6'); // the pull
  });
  cell('slit', (w, h) => {
    rect(0, 0, w, h, WOOD);
    glazing(8, 8, w - 16, h * 0.3 - 12);
    glazing(8, h * 0.3 + 6, w - 16, h * 0.7 - 16);
  });
  // The lettering on the entablature: spaced metal letters
  cell('name', (w, h) => {
    g.font = '500 62px Helvetica, Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    const text = 'POSTPLATZ', gap = 20, widths = [...text].map((ch) => g.measureText(ch).width + gap);
    let x = (w - (widths.reduce((a, b) => a + b, 0) - gap)) / 2;
    g.shadowColor = 'rgba(0, 0, 0, 0.45)'; g.shadowBlur = 3; g.shadowOffsetX = 2; g.shadowOffsetY = 3;
    g.fillStyle = '#c3c6ca';
    [...text].forEach((ch, i) => { g.fillText(ch, x, h / 2 + 3); x += widths[i]; });
  });
  return canvasTexture(c);
}

// --- Geometry ------------------------------------------------------------------------------------------------------------
// The colours of the trim (linear)
const C = {
  rough: [0.1, 0.105, 0.11], pilaster: [0.14, 0.155, 0.18], entablature: [0.2, 0.18, 0.15], cornice: [0.3, 0.275, 0.225],
  plinth: [0.3, 0.3, 0.29], dark: [0.03, 0.03, 0.032], steel: [0.5, 0.51, 0.52]
};

// A block: its walls from the base up to its roof, each one stretch with its bays laid out from its middle; the roof
function buildPart(B, part) {
  const ring = outwardRing(part.ring), top = part.top, y0 = ALTE_POST.base;
  const v = (y, windows) => y - ALTE_POST.ground - GROUND_FLOOR + UP - (windows ? 0 : CLOSED);
  for (let i = 0; i < ring.length; i++) {
    const F = wallFrame(ring[i], ring[(i + 1) % ring.length]);
    if (F.len < 0.05) continue;
    const windows = F.len >= 4, h = F.len / 2;
    const P = (s, y) => { const [x, z] = onWall(F, s); return [x, y, z]; };
    B.quad('plaster', P(0, y0), P(F.len, y0), P(F.len, top), P(0, top), [[-h, v(y0, windows)], [h, v(y0, windows)], [h, v(top, windows)], [-h, v(top, windows)]], { half: windows ? h : 0 });
    // the eaves: a stone course standing out under the roof's edge
    if (part.cornice) B.box('trim', F, -0.35, F.len + 0.35, 0, 0.35, top - 0.3, top + 0.06, C.cornice, { top: 'roof' });
  }
  flatRoof(B, ring, top);
}

// The portal on the Promenade, the sgraffito over it, the firs' band
function buildFront(B) {
  const F = frontFrame(), P = ALTE_POST.portal, g0 = ALTE_POST.ground;
  const floorY = g0 + P.floor, head = floorY + P.opening, top = head + P.entablature;
  // the plinth and its steps down to the pavement
  B.box('trim', F, P.from - 0.3, P.to + 0.3, 0, P.out + 0.5, ALTE_POST.base, floorY, C.plinth);
  const st = P.steps;
  for (let i = 0; i < st.count; i++) {
    const o0 = P.out + 0.5 + i * st.tread;
    B.box('trim', F, st.from, st.to, o0, o0 + st.tread, ALTE_POST.base, floorY - (i + 1) * (P.floor / (st.count + 1)), C.plinth);
  }
  // the rough stone piers at its ends, the smooth pilasters between the openings, the dark reveal behind them
  for (const [s0, s1] of P.piers) B.box('trim', F, s0, s1, 0, P.out, floorY, head, C.rough);
  for (const [s0, s1] of P.pilasters) B.box('trim', F, s0, s1, 0, P.out - 0.12, floorY, head, C.pilaster);
  B.box('trim', F, P.from, P.to, 0, 0.42, floorY, head, C.dark);
  for (const { s, key } of P.openings) B.decal(F, s[0], s[1], 0.45, floorY, head, key);
  // the entablature with its cornice, POSTPLATZ on it, the slab over it
  B.box('trim', F, P.from - 0.1, P.to + 0.1, 0, P.out + 0.12, head, top, C.entablature);
  B.box('trim', F, P.from - 0.22, P.to + 0.22, 0, P.out + 0.26, head, head + 0.22, C.cornice);
  B.box('trim', F, P.from - 0.28, P.to + 0.28, 0, P.out + 0.34, top, top + 0.16, C.cornice, { top: 'roof' });
  const mid = (P.from + P.to) / 2, nameW = 6.4, nameH = nameW * ATLAS.name[3] / ATLAS.name[2];
  B.decal(F, mid - nameW / 2, mid + nameW / 2, P.out + 0.14, head + 0.42, head + 0.42 + nameH, 'name');
  // a handrail up the steps' middle
  const railO = P.out + 0.5 + st.count * st.tread;
  B.box('trim', F, mid - 0.025, mid + 0.025, P.out + 0.6, railO + 0.1, floorY + 0.85, floorY + 0.9, C.steel);
  for (const o of [P.out + 0.6, railO + 0.05]) B.box('trim', F, mid - 0.025, mid + 0.025, o, o + 0.05, floorY - P.floor, floorY + 0.88, C.steel);

  // the sgraffito field, and the firs' band bay by bay with its two ends
  const fd = ALTE_POST.field, fr = ALTE_POST.firs;
  B.decal(F, fd.from, fd.to, 0.03, g0 + fd.lo, g0 + fd.hi, 'field');
  const bays = frontWindows(2), first = bays[0].s - BAY / 2, last = bays.at(-1).s + BAY / 2;
  for (const q of bays) B.decal(F, q.s - BAY / 2, q.s + BAY / 2, 0.03, g0 + fr.lo, g0 + fr.hi, 'firs');
  B.decal(F, 0, first, 0.03, g0 + fr.lo, g0 + fr.hi, 'firsEnd');
  B.decal(F, last, F.len, 0.03, g0 + fr.lo, g0 + fr.hi, 'firsEnd', { mirror: true });
  return { top };
}

/**
 * Builds the Alte Post into `scene`. Returns { group, colliders } (the portal with its steps, at world heights: baseY
 * set, so liftColliders leaves it be; the walls of OpenStreetMap's footprint are js/buildings.js').
 */
export function buildAltePost(scene) {
  const root = new THREE.Group();
  root.name = 'Alte Post';
  root.userData.terrain = 'absolute'; // its heights are surveyed (main.js placeOnTerrain leaves it be)
  const B = new Builder({ atlas: ATLAS, atlasSize: ATLAS_SIZE, walls: 'plaster', name: 'Alte Post' }), M = materials();
  for (const part of ALTE_POST.parts) buildPart(B, part);
  const front = buildFront(B);
  M.decal = decalMaterial(atlasTexture());
  root.add(...B.meshes(M));
  scene.add(root);

  const F = frontFrame(), P = ALTE_POST.portal, depth = P.out + 0.5 + P.steps.count * P.steps.tread;
  const [cx, cz] = onWall(F, (P.from + P.to) / 2, depth / 2), hx = (P.to - P.from) / 2 + 0.3, hz = depth / 2;
  const cs = F.u[0], sn = -F.u[1]; // (the box's long axis in the world: (cs, −sn), js/buildings.js)
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  const colliders = [{ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, baseY: ALTE_POST.base, minY: ALTE_POST.base, maxY: front.top, obb: { cx, cz, hx, hz, cs, sn } }];
  return { group: root, colliders };
}
