import * as THREE from 'three/webgpu';
import { attribute, float, frontFacing, mix, positionLocal, select, texture, uv, vec2, vec3 } from 'three/tsl';
import { TRAFFIC_SIGNS } from './traffic-signs-data.js';
import { surfaceHeight, sidewalkRise, SIDEWALK_TOP } from './terrain.js';
import { QUALITY } from './quality.js';

// js/traffic-signs.js
// Swiss road signs after the Signalisationsverordnung (SSV) (js/traffic-signs-data.js, tools/fetch-traffic-signs.mjs:
// OSM and rules on the mapped streets): Stop (3.01), Kein Vortritt (3.02), Einfahrt verboten (2.02) with the plate
// "ausgenommen" + bus, Einbahnstrasse (4.08), Fussgängerstreifen (4.11), Parkieren gestattet (4.17), Zone 30 (2.59.1,
// "Ende" 2.59.2 on its back), 50 generell (2.30.1, "Ende" 2.53.1 on its back) above the Ortstafel (4.27 blue on a
// main road, 4.29 white on a minor one, the Ortsende 4.28 / 4.30 on its back), and the VBD's bus stops as they stand
// in Davos: a galvanised mast bent over into a bow that holds the white stop plate (the VBD logo, the lines stopping
// there with their destinations, the stop's name on a blue band), the timetable case below it, a bench and a bin
// where the sidewalk has room, the yellow zigzag line along the kerb with "BUS" (the SSV's marking of a bus stop).
//
// Every graphic is drawn once into one canvas atlas, packed in shelves (a stop plate is built from shared pieces: the
// logo strip, one cell per line and destination, the name band; only the name is per stop). All the plates, the stop
// plates' pieces and the road markings are one instanced quad (each instance picks its front and back rectangle in the
// atlas: the back is plain galvanised grey unless the sign is double sided); all the metal and the street furniture
// (posts, clamps, the stops' bows, timetable cases, benches, bins) one instanced mesh whose geometry holds every part:
// each instance keeps its part's vertices and collapses the others. Two draws, and two more for the shadow cascades.
// Every 0.25 s only the signs within VIEW_DISTANCE of the camera are packed into the instance buffers (the meshes never
// hold zero instances: WebGPU rejects empty buffers, they are hidden instead). At night the faces glow faintly, as
// retroreflective sheeting does in the headlights. The posts, benches and bins are player colliders.

const VIEW_DISTANCE = 320;   // m: a 60 cm plate is ~2 px beyond this
const PLATE_BOTTOM = 2.1;    // m over the sidewalk
const PLATE_GAP = 0.05;
const POST_RADIUS = 0.03;    // a 60 mm tube (galvanised)
const CROSSWALK_DEPTH = 2.5; // js/road-network.js CROSSWALK: the stripes' depth along the road
const TILE = 192, PAD = 4, ATLAS_W = 1024; // atlas layout in px at QUALITY.atlasScale 1 (a 60 cm sign: ~300 px/m)

// Plate sizes in metres (SSV, inside built-up areas)
const SIZES = {
  stop: [0.6, 0.6], giveway: [0.9, 0.78], noentry: [0.6, 0.6], oneway: [0.6, 0.6], crosswalk: [0.6, 0.6],
  parking: [0.6, 0.6], exceptbus: [0.6, 0.32], zone30: [0.6, 0.9], zone30end: [0.6, 0.9], gen50: [0.6, 0.8],
  gen50end: [0.6, 0.8], city: [1.3, 0.45], cityend: [1.3, 0.45], citylocal: [1.3, 0.45], citylocalend: [1.3, 0.45]
};

// The VBD stop (Davos Dorf, Parsennbahn): the plate inside the mast's bow, the timetable case on the mast below
const STOP = {
  w: 0.5, h: 0.56,        // the plate
  logo: 0.26, band: 0.2,  // shares of its height: the logo strip on top, the name band below
  rows: 3,                // line cells: 3 rows of 2
  top: 2.85,              // the bow's tube centre over the sidewalk
  bend: 0.1,              // the bow's bend radius
  gap: 0.04,              // between the plate's edges and the tube's centre
  caseW: 0.48, caseH: 1.15, caseBottom: 0.6, caseDepth: 0.05
};
const MARK = { piece: 2.8, width: 0.9, lift: 0.13 }; // the zigzag: pieces of two zigs, its band's width; over the terrain (the streets lie at 0.11, js/parking.js; the paint 1 cm over them)

// Pixel boxes (layout px) of the non-sign tiles
const TILE_PX = {
  vbdlogo: [192, 56], vbdline: [120, 48], vbdname: [192, 42], vbdcase: [112, 264], zigzag: [192, 60], busmark: [56, 140]
};

// --- The graphics (canvas) ------------------------------------------------------------------------------------------------
// SSV colours (RAL 3020 traffic red, RAL 5017 traffic blue, RAL 9016 white, RAL 9017 black), the VBD's own blue
const RED = '#c1121c', BLUE = '#0e518d', WHITE = '#f4f4f0', BLACK = '#141414', GREY = '#8c8c8c';
const VBD_BLUE = '#1f5fbf', VBD_YELLOW = '#f6c500', MARK_YELLOW = '#f2bd00';
// (the Swiss sign lettering is a Frutiger: the system's sans where it isn't installed)
const FONT = 'Frutiger, "Frutiger LT Std", "Helvetica Neue", Helvetica, Arial, sans-serif';

function fitText(ctx, text, maxWidth, size, weight = 700) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${FONT}`; s -= 1; } while (ctx.measureText(text).width > maxWidth && s > 6);
  return s + 1;
}

function roundel(ctx, cx, cy, r, value, grey = false) {
  ctx.fillStyle = WHITE;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = grey ? GREY : RED;
  ctx.lineWidth = r * 0.2;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = grey ? GREY : BLACK;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(r * 1.05)}px ${FONT}`;
  ctx.fillText(value, cx, cy + r * 0.06);
}

/** A polygon with rounded corners (the SSV's triangles and octagon) */
function roundedPoly(ctx, pts, r) {
  ctx.beginPath();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    if (i === 0) ctx.moveTo(m[0], m[1]);
    const nx = pts[(i + 2) % n]; ctx.arcTo(q[0], q[1], (q[0] + nx[0]) / 2, (q[1] + nx[1]) / 2, r);
  }
  ctx.closePath();
}

/** Diagonal "end" bars over a box (2.53, 2.59.2) */
function endBars(ctx, x, y, w, h) {
  ctx.save();
  ctx.strokeStyle = BLACK; ctx.lineWidth = w * 0.022;
  ctx.beginPath(); ctx.rect(x + w * 0.04, y + w * 0.04, w - w * 0.08, h - w * 0.08); ctx.clip();
  for (let i = -3; i <= 3; i++) { const o = i * w * 0.07; ctx.beginPath(); ctx.moveTo(x + o, y + h); ctx.lineTo(x + w + o, y); ctx.stroke(); }
  ctx.restore();
}

function pedestrian(ctx, cx, cy, s) {
  // a walking figure, s = its height
  ctx.fillStyle = BLACK; ctx.strokeStyle = BLACK; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(cx + s * 0.04, cy - s * 0.42, s * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = s * 0.11;
  ctx.beginPath(); ctx.moveTo(cx + s * 0.02, cy - s * 0.28); ctx.lineTo(cx - s * 0.03, cy + s * 0.04); ctx.stroke();
  ctx.lineWidth = s * 0.08;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.03, cy + s * 0.02); ctx.lineTo(cx - s * 0.2, cy + s * 0.22); ctx.lineTo(cx - s * 0.24, cy + s * 0.42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - s * 0.03, cy + s * 0.02); ctx.lineTo(cx + s * 0.12, cy + s * 0.2); ctx.lineTo(cx + s * 0.22, cy + s * 0.42); ctx.stroke();
  ctx.lineWidth = s * 0.07;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.2, cy - s * 0.05); ctx.lineTo(cx - s * 0.06, cy - s * 0.24); ctx.lineTo(cx + s * 0.12, cy - s * 0.18); ctx.lineTo(cx + s * 0.22, cy - s * 0.04); ctx.stroke();
}

function bus(ctx, x, y, w, h) {
  // side view of a bus, facing left
  ctx.fillStyle = BLACK;
  const r = h * 0.18;
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h * 0.82); ctx.lineTo(x, y + h * 0.82); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fill();
  ctx.fillStyle = WHITE;
  const n = 4, ww = (w * 0.78) / n;
  for (let i = 0; i < n; i++) ctx.fillRect(x + w * 0.16 + i * ww + ww * 0.12, y + h * 0.14, ww * 0.76, h * 0.3);
  ctx.fillRect(x + w * 0.03, y + h * 0.14, w * 0.09, h * 0.52); // the windscreen and door
  ctx.fillStyle = BLACK;
  for (const fx of [0.22, 0.78]) { ctx.beginPath(); ctx.arc(x + w * fx, y + h * 0.84, h * 0.16, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = WHITE;
  for (const fx of [0.22, 0.78]) { ctx.beginPath(); ctx.arc(x + w * fx, y + h * 0.84, h * 0.06, 0, Math.PI * 2); ctx.fill(); }
}

/** One or two lines of text centred in a box, as large as fits (split at "/" or the last space) */
function boxText(ctx, text, x, y, w, h, size, weight = 700, align = 'center') {
  let lines = [text];
  const one = fitText(ctx, text, w, size, weight);
  if (one < size * 0.72) {
    const cut = text.includes('/') ? text.indexOf('/') + 1 : text.lastIndexOf(' ');
    if (cut > 0) lines = [text.slice(0, cut).trim(), text.slice(cut).trim()];
  }
  let s = Math.min(size, Math.floor(h / (lines.length * 1.08)));
  for (const l of lines) s = Math.min(s, fitText(ctx, l, w, s, weight));
  ctx.font = `${weight} ${s}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  const lh = s * 1.08, x0 = align === 'left' ? x : x + w / 2;
  lines.forEach((l, i) => ctx.fillText(l, x0, y + h / 2 + (i - (lines.length - 1) / 2) * lh + s * 0.04));
}

// Draws graphic `kind` into the box (x, y, w, h) of the atlas
function drawSign(ctx, kind, x, y, w, h, args) {
  const text = args[0] || '';
  const cx = x + w / 2, cy = y + h / 2;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  switch (kind) {
    case 'stop': {
      const r = w / 2 / Math.cos(Math.PI / 8);
      const oct = (rr) => { const p = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return p; };
      ctx.fillStyle = WHITE; roundedPoly(ctx, oct(r), w * 0.03); ctx.fill();
      ctx.fillStyle = RED; roundedPoly(ctx, oct(r * 0.94), w * 0.025); ctx.fill();
      ctx.fillStyle = WHITE;
      fitText(ctx, 'STOP', w * 0.78, Math.round(h * 0.33));
      ctx.fillText('STOP', cx, cy + h * 0.02);
      break;
    }
    case 'giveway': {
      // (3.02: a red-bordered white triangle, point down, its corners rounded, a narrow white rim outside the red)
      const tri = (k) => [[x + k * 1.73, y + k], [x + w - k * 1.73, y + k], [cx, y + h - k * 2]];
      ctx.fillStyle = WHITE; roundedPoly(ctx, tri(0), w * 0.05); ctx.fill();
      ctx.fillStyle = RED; roundedPoly(ctx, tri(w * 0.014), w * 0.045); ctx.fill();
      ctx.fillStyle = WHITE; roundedPoly(ctx, tri(w * 0.105), w * 0.02); ctx.fill();
      break;
    }
    case 'noentry': {
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(cx, cy, w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(cx, cy, w / 2 * 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = WHITE; ctx.fillRect(x + w * 0.2, cy - h * 0.1, w * 0.6, h * 0.2);
      break;
    }
    case 'oneway': case 'parking': case 'crosswalk': {
      const rr = w * 0.06;
      const box = (k, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x + k, y + k, w - 2 * k, h - 2 * k, Math.max(1, rr - k)); ctx.fill(); };
      box(0, WHITE); box(w * 0.025, BLUE);
      ctx.fillStyle = WHITE;
      if (kind === 'oneway') {
        // white arrow pointing up
        ctx.beginPath();
        ctx.moveTo(cx, y + h * 0.13); ctx.lineTo(cx + w * 0.25, y + h * 0.43); ctx.lineTo(cx + w * 0.09, y + h * 0.43);
        ctx.lineTo(cx + w * 0.09, y + h * 0.87); ctx.lineTo(cx - w * 0.09, y + h * 0.87); ctx.lineTo(cx - w * 0.09, y + h * 0.43);
        ctx.lineTo(cx - w * 0.25, y + h * 0.43); ctx.closePath(); ctx.fill();
      } else if (kind === 'parking') {
        ctx.font = `700 ${Math.round(h * 0.78)}px ${FONT}`;
        ctx.fillText('P', cx + w * 0.01, cy + h * 0.05);
      } else {
        // white triangle, the pedestrian on the stripes
        roundedPoly(ctx, [[cx, y + h * 0.1], [x + w * 0.92, y + h * 0.86], [x + w * 0.08, y + h * 0.86]], w * 0.03); ctx.fill();
        ctx.fillStyle = BLACK;
        for (let i = 0; i < 5; i++) {
          const sx = x + w * (0.25 + i * 0.105);
          ctx.beginPath(); ctx.moveTo(sx, y + h * 0.8); ctx.lineTo(sx + w * 0.07, y + h * 0.8); ctx.lineTo(sx + w * 0.045, y + h * 0.74); ctx.lineTo(sx + w * 0.015, y + h * 0.74); ctx.closePath(); ctx.fill();
        }
        pedestrian(ctx, cx, y + h * 0.52, h * 0.38);
      }
      break;
    }
    case 'exceptbus': {
      ctx.fillStyle = BLACK; ctx.beginPath(); ctx.roundRect(x, y, w, h, w * 0.03); ctx.fill();
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.roundRect(x + w * 0.02, y + w * 0.02, w - w * 0.04, h - w * 0.04, w * 0.02); ctx.fill();
      ctx.fillStyle = BLACK;
      fitText(ctx, 'ausgenommen', w * 0.86, Math.round(h * 0.3), 600);
      ctx.fillText('ausgenommen', cx, y + h * 0.27);
      bus(ctx, cx - w * 0.2, y + h * 0.48, w * 0.4, h * 0.36);
      break;
    }
    case 'zone30': case 'zone30end': {
      const end = kind === 'zone30end';
      ctx.fillStyle = BLACK; ctx.beginPath(); ctx.roundRect(x, y, w, h, w * 0.04); ctx.fill();
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.roundRect(x + w * 0.02, y + w * 0.02, w - w * 0.04, h - w * 0.04, w * 0.03); ctx.fill();
      ctx.fillStyle = end ? GREY : BLACK;
      ctx.font = `700 ${Math.round(h * 0.17)}px ${FONT}`;
      ctx.fillText('ZONE', cx, y + h * 0.17);
      roundel(ctx, cx, y + h * 0.6, w * 0.36, '30', end);
      if (end) endBars(ctx, x, y, w, h);
      break;
    }
    case 'gen50': case 'gen50end': {
      const end = kind === 'gen50end';
      ctx.fillStyle = BLACK; ctx.beginPath(); ctx.roundRect(x, y, w, h, w * 0.04); ctx.fill();
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.roundRect(x + w * 0.02, y + w * 0.02, w - w * 0.04, h - w * 0.04, w * 0.03); ctx.fill();
      roundel(ctx, cx, y + h * 0.4, w * 0.34, '50', end);
      ctx.fillStyle = end ? GREY : BLACK;
      fitText(ctx, 'generell', w * 0.8, Math.round(h * 0.15), 700);
      ctx.fillText('generell', cx, y + h * 0.85);
      if (end) endBars(ctx, x, y, w, h);
      break;
    }
    case 'city': case 'cityend': case 'citylocal': case 'citylocalend': {
      // 4.27 / 4.28 on a main road: white on blue; 4.29 / 4.30 on a minor one: black on white; the end: a red bar
      const local = kind.startsWith('citylocal');
      ctx.fillStyle = local ? BLACK : WHITE; ctx.beginPath(); ctx.roundRect(x, y, w, h, h * 0.08); ctx.fill();
      ctx.fillStyle = local ? WHITE : BLUE; ctx.beginPath(); ctx.roundRect(x + h * 0.04, y + h * 0.04, w - h * 0.08, h - h * 0.08, h * 0.05); ctx.fill();
      ctx.fillStyle = local ? BLACK : WHITE;
      fitText(ctx, text, w * 0.86, Math.round(h * 0.5));
      ctx.fillText(text, cx, cy + h * 0.03);
      if (kind.endsWith('end')) {
        ctx.strokeStyle = RED; ctx.lineWidth = h * 0.11; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(x + w * 0.06, y + h * 0.88); ctx.lineTo(x + w * 0.94, y + h * 0.12); ctx.stroke();
      }
      break;
    }
    // --- The VBD stop plate's pieces (Davos Dorf, Parsennbahn) ---
    case 'vbdlogo': {
      ctx.fillStyle = '#fbfbfb'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#b8bcc0'; ctx.fillRect(x, y, w, h * 0.05); // the aluminium frame's top
      // "VBD" in bold blue italics over three grey speed lines, "DAVOS" spaced out below
      ctx.save();
      ctx.translate(cx, y + h * 0.42); ctx.transform(1, 0, -0.18, 1, 0, 0);
      ctx.fillStyle = '#c4c9d2';
      for (let i = 0; i < 3; i++) ctx.fillRect(-w * 0.2, -h * 0.17 + i * h * 0.12, w * 0.4, h * 0.06);
      ctx.fillStyle = VBD_BLUE;
      ctx.font = `800 italic ${Math.round(h * 0.46)}px ${FONT}`;
      ctx.fillText('VBD', 0, h * 0.02);
      ctx.restore();
      ctx.fillStyle = '#7d8590';
      ctx.font = `500 ${Math.round(h * 0.2)}px ${FONT}`;
      ctx.fillText('D A V O S', cx, y + h * 0.82);
      break;
    }
    case 'vbdline': case 'vbdblank': {
      ctx.fillStyle = '#fbfbfb'; ctx.fillRect(x, y, w, h);
      if (kind === 'vbdblank') break;
      const [line, dest] = args;
      const s = h * 0.62, sx = x + h * 0.16, sy = cy - s / 2;
      ctx.fillStyle = VBD_YELLOW; ctx.fillRect(sx, sy, s, s);
      ctx.fillStyle = BLACK;
      fitText(ctx, line, s * 0.86, Math.round(s * 0.78), 700);
      ctx.fillText(line, sx + s / 2, cy + s * 0.04);
      ctx.fillStyle = '#202020';
      boxText(ctx, dest, sx + s + h * 0.14, y + h * 0.1, w - (s + h * 0.42), h * 0.8, Math.round(h * 0.36), 600, 'left');
      break;
    }
    case 'vbdname': {
      ctx.fillStyle = VBD_BLUE; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#b8bcc0'; ctx.fillRect(x, y + h * 0.94, w, h * 0.06);
      ctx.fillStyle = WHITE;
      boxText(ctx, text, x + w * 0.05, y + h * 0.08, w * 0.9, h * 0.8, Math.round(h * 0.52), 700);
      break;
    }
    case 'vbdcase': {
      // the timetable case: grey frame, the logo, two timetables, the blue and yellow poster at the bottom
      ctx.fillStyle = '#9da3a8'; ctx.fillRect(x, y, w, h);
      const f = w * 0.06, ix = x + f, iw = w - 2 * f;
      ctx.fillStyle = '#f6f6f6'; ctx.fillRect(ix, y + f, iw, h * 0.07);
      ctx.fillStyle = VBD_BLUE; ctx.font = `800 italic ${Math.round(h * 0.045)}px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText('VBD', ix + iw * 0.05, y + f + h * 0.036);
      ctx.fillStyle = '#7d8590'; ctx.font = `500 ${Math.round(h * 0.025)}px ${FONT}`; ctx.textAlign = 'right';
      ctx.fillText('DAVOS', ix + iw * 0.95, y + f + h * 0.036);
      const sheet = (sy, sh) => {
        ctx.fillStyle = '#fdfdfb'; ctx.fillRect(ix, sy, iw, sh);
        ctx.fillStyle = '#c94a3d'; ctx.fillRect(ix + iw * 0.06, sy + sh * 0.05, iw * 0.25, sh * 0.06);
        ctx.fillStyle = '#9aa0a6';
        for (let c = 0; c < 2; c++) for (let r = 0; r < 14; r++) ctx.fillRect(ix + iw * (0.06 + c * 0.47), sy + sh * (0.17 + r * 0.055), iw * (0.2 + ((r * 7 + c * 3) % 5) * 0.04), sh * 0.022);
        ctx.fillStyle = '#d8dadc'; ctx.fillRect(ix + iw * 0.5, sy + sh * 0.15, 1.2, sh * 0.8);
      };
      sheet(y + f + h * 0.08, h * 0.35);
      sheet(y + f + h * 0.44, h * 0.3);
      const py = y + f + h * 0.75, ph = h - f - (py - y);
      ctx.fillStyle = '#2e63c4'; ctx.fillRect(ix, py, iw, ph);
      ctx.fillStyle = VBD_YELLOW;
      ctx.fillRect(ix + iw * 0.18, py + ph * 0.18, iw * 0.64, ph * 0.26);
      ctx.fillRect(ix + iw * 0.06, py + ph * 0.56, iw * 0.4, ph * 0.18);
      ctx.fillRect(ix + iw * 0.54, py + ph * 0.56, iw * 0.4, ph * 0.18);
      break;
    }
    case 'zigzag': {
      // two zigs of the yellow kerb line, starting and ending at the band's lower edge (pieces join seamlessly)
      const lw = h * 0.17, m = lw / 2;
      ctx.strokeStyle = MARK_YELLOW; ctx.lineWidth = lw; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(x, y + h - m); ctx.lineTo(x + w * 0.25, y + m); ctx.lineTo(x + w * 0.5, y + h - m); ctx.lineTo(x + w * 0.75, y + m); ctx.lineTo(x + w, y + h - m);
      ctx.stroke();
      break;
    }
    case 'busmark': {
      // "BUS" in the lane, stretched along the road for the drivers' flat view
      ctx.fillStyle = MARK_YELLOW;
      ctx.translate(cx, cy); ctx.scale(1, 3.4);
      fitText(ctx, 'BUS', w * 0.96, Math.round(h * 0.28), 700);
      ctx.fillText('BUS', 0, h * 0.005);
      break;
    }
  }
  ctx.restore();
}

/** Layout box (px) of a graphic key ("kind|arg|arg") */
function tileSize(key) {
  const kind = key.split('|')[0];
  if (TILE_PX[kind]) return TILE_PX[kind];
  if (kind === 'vbdblank') return TILE_PX.vbdline;
  const [sw, sh] = SIZES[kind];
  const max = TILE - 2 * PAD;
  return sw >= sh ? [max, Math.round(max * sh / sw)] : [Math.round(max * sw / sh), max];
}

/** Draws every graphic into one canvas, packed in shelves by height; returns the texture and each key's uv rectangle */
function buildAtlas(keys) {
  const items = keys.map((key) => { const [w, h] = tileSize(key); return { key, w, h }; }).sort((a, b) => b.h - a.h || b.w - a.w);
  let x = 0, y = 0, shelf = 0;
  for (const it of items) {
    if (x + it.w + 2 * PAD > ATLAS_W) { x = 0; y += shelf; shelf = 0; }
    it.x = x + PAD; it.y = y + PAD;
    x += it.w + 2 * PAD; shelf = Math.max(shelf, it.h + 2 * PAD);
  }
  // (laid out in px whatever the canvas' size: the mobile profile, js/quality.js, draws it at its atlasScale)
  const W = ATLAS_W, H = Math.ceil((y + shelf) / 4) * 4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * QUALITY.atlasScale);
  canvas.height = Math.round(H * QUALITY.atlasScale);
  const ctx = canvas.getContext('2d');
  ctx.scale(QUALITY.atlasScale, QUALITY.atlasScale);
  const rects = new Map();
  for (const it of items) {
    const [kind, ...args] = it.key.split('|');
    drawSign(ctx, kind, it.x, it.y, it.w, it.h, args);
    // uv rectangle (flipY: v up from the canvas' bottom), a hair inside the drawn box
    rects.set(it.key, [(it.x + 0.5) / W, 1 - (it.y + it.h - 0.5) / H, (it.x + it.w - 0.5) / W, 1 - (it.y + 0.5) / H]);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, rects, width: canvas.width, height: canvas.height };
}

// --- The metal and the street furniture: one geometry, a part per instance --------------------------------------------------
const PART = { post: 0, clamp: 1, bend: 2, case: 3, bench: 4, bin: 5 };
const GALVANISED = [0.55, 0.57, 0.59], ZINC_DARK = [0.42, 0.44, 0.46];

/** All the parts merged (indexed), each vertex with its colour, (metalness, roughness) and part id */
function hardwareGeometry() {
  const pieces = [];
  const add = (g, part, color, metal = 0.5, rough = 0.5) => { pieces.push({ g, part, color, metal, rough }); };
  // post: a unit 60 mm tube, base at 0
  add(new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, 1, 8, 1, false).translate(0, 0.5, 0), PART.post, GALVANISED, 0.55, 0.45);
  // clamp (the plates' Schellen): a ring around the post, centred
  add(new THREE.CylinderGeometry(POST_RADIUS + 0.007, POST_RADIUS + 0.007, 0.045, 8, 1, false), PART.clamp, ZINC_DARK, 0.5, 0.5);
  // bend: a quarter of the bow, from (0, 0) heading +y to (R, R) heading +x
  add(new THREE.TorusGeometry(STOP.bend, POST_RADIUS, 6, 4, Math.PI / 2).rotateZ(Math.PI / 2).translate(STOP.bend, 0, 0), PART.bend, GALVANISED, 0.55, 0.45);
  // case: the timetable case's frame, back at z = 0, bottom at y = 0, open at the front (its face is a plate)
  {
    const g = new THREE.BoxGeometry(STOP.caseW, STOP.caseH, STOP.caseDepth).translate(0, STOP.caseH / 2, STOP.caseDepth / 2);
    const idx = Array.from(g.index.array);
    idx.splice(24, 6); // (BoxGeometry's faces: +x, -x, +y, -y, +z, -z)
    g.setIndex(idx);
    add(g, PART.case, [0.36, 0.38, 0.4], 0.45, 0.55);
  }
  // bench: wooden slats on a galvanised frame, 1.6 m long (x), the seat's front towards +z
  {
    const box = (w, h, d, x, y, z, rx = 0) => new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z);
    const wood = [0.42, 0.25, 0.13];
    for (const z of [0.15, 0.04, -0.07]) add(box(1.6, 0.035, 0.1, 0, 0.45, z), PART.bench, wood, 0, 0.75);
    for (const [y, z] of [[0.6, -0.15], [0.74, -0.18]]) add(box(1.6, 0.1, 0.03, 0, y, z, -0.18), PART.bench, wood, 0, 0.75);
    for (const x of [-0.65, 0.65]) {
      add(box(0.05, 0.43, 0.05, x, 0.215, 0.14), PART.bench, GALVANISED, 0.6, 0.4);
      add(box(0.05, 0.8, 0.05, x, 0.4, -0.13), PART.bench, GALVANISED, 0.6, 0.4);
      add(box(0.05, 0.04, 0.34, x, 0.415, 0.02), PART.bench, GALVANISED, 0.6, 0.4);
    }
  }
  // bin: a stainless steel cylinder with its dark rim and foot
  add(new THREE.CylinderGeometry(0.17, 0.17, 0.8, 14, 1, false).translate(0, 0.45, 0), PART.bin, [0.66, 0.67, 0.68], 0.85, 0.3);
  add(new THREE.CylinderGeometry(0.175, 0.175, 0.05, 14, 1, false).translate(0, 0.82, 0), PART.bin, [0.2, 0.2, 0.21], 0.3, 0.6);
  add(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 14, 1, false).translate(0, 0.03, 0), PART.bin, [0.25, 0.26, 0.28], 0.3, 0.6);

  let nv = 0, ni = 0;
  for (const p of pieces) { nv += p.g.attributes.position.count; ni += p.g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), mat = new Float32Array(nv * 2), id = new Float32Array(nv);
  const index = new Uint32Array(ni);
  let v = 0, k = 0;
  for (const p of pieces) {
    const g = p.g, n = g.attributes.position.count;
    pos.set(g.attributes.position.array, v * 3);
    nor.set(g.attributes.normal.array, v * 3);
    for (let i = 0; i < n; i++) { col.set(p.color, (v + i) * 3); mat[(v + i) * 2] = p.metal; mat[(v + i) * 2 + 1] = p.rough; id[v + i] = p.part; }
    for (let i = 0; i < g.index.count; i++) index[k++] = g.index.array[i] + v;
    v += n;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aMat', new THREE.BufferAttribute(mat, 2));
  geo.setAttribute('aPartId', new THREE.BufferAttribute(id, 1));
  geo.setIndex(new THREE.BufferAttribute(nv > 65535 ? index : new Uint16Array(index), 1));
  geo.computeBoundingSphere();
  return geo;
}

// --- Placement ------------------------------------------------------------------------------------------------------------
/** The painted crosswalks of the traffic network (js/road-paint.js): centre, direction along the road, half width */
function crosswalksOf(network) {
  const out = [];
  for (const e of network?.paintEdges || network?.edges || []) {
    if (!(e.half > 0) || !Number.isFinite(e.sx)) continue;
    for (const [node, s] of [[e.from, -CROSSWALK_DEPTH / 2], [e.to, e.len + CROSSWALK_DEPTH / 2]]) {
      if (!node || node.shape) continue;
      out.push({ x: e.sx + e.dx * s, z: e.sz + e.dz * s, dx: e.dx, dz: e.dz, half: e.half });
    }
  }
  return out;
}

/** Moves (x, z) along the road out of any painted crosswalk (and the curb ramps at its ends) */
function clearOfCrosswalks(p, crosswalks, cells) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const c of cells.get(Math.floor(p.x / 32) * 65536 + Math.floor(p.z / 32)) || []) {
      const ox = p.x - c.x, oz = p.z - c.z;
      const along = ox * c.dx + oz * c.dz, across = Math.abs(-ox * c.dz + oz * c.dx);
      const reach = CROSSWALK_DEPTH / 2 + 0.6;
      if (Math.abs(along) >= reach || across > c.half + 3.5) continue;
      const push = (along >= 0 ? 1 : -1) * (reach + 0.05) - along;
      p.x += c.dx * push; p.z += c.dz * push;
      moved = true;
    }
    if (!moved) break;
  }
  return p;
}

/** Whether (x, z) lies on a painted crosswalk's stripes (the zigzag stops short of them) */
function onCrosswalk(x, z, crosswalks, cells) {
  for (const c of cells.get(Math.floor(x / 32) * 65536 + Math.floor(z / 32)) || []) {
    const ox = x - c.x, oz = z - c.z;
    if (Math.abs(ox * c.dx + oz * c.dz) < CROSSWALK_DEPTH / 2 + 1.6 && Math.abs(-ox * c.dz + oz * c.dx) < c.half + 0.5) return true;
  }
  return false;
}

/** The atlas keys of a VBD stop: the logo, its six line cells (row-major, blank where none), its name band */
function stopKeys(s) {
  const cells = [];
  for (let i = 0; i < STOP.rows * 2; i++) cells.push(s.lines?.[i] ? `vbdline|${s.lines[i][0]}|${s.lines[i][1]}` : 'vbdblank');
  return { logo: 'vbdlogo', cells, name: `vbdname|${s.label || s.text || ''}` };
}

/**
 * Builds the signs. `network`: the traffic network (trafficSystem.network) for the painted crosswalks; `night`: the
 * lighting's night factor uniform (0 day … 1 night). Returns { group, update(cameraPosition), colliders (the stops'),
 * knockablePosts (the sign posts, for controllers.js setKnockablePosts), stats }.
 */
export function buildTrafficSigns(scene, { network = null, night = null } = {}) {
  const group = new THREE.Group();
  group.name = 'TrafficSigns';
  group.userData.terrain = 'absolute'; // placed on the relief here
  scene.add(group);
  const list = TRAFFIC_SIGNS?.signs || [];
  if (!list.length) return { group, update() {}, colliders: [], knockablePosts: [], stats: { posts: 0, plates: 0 } };

  // Atlas keys: one per graphic (the town signs per name; a stop's name band per name, its line cells per line and
  // destination: shared between the stops)
  const keyOf = (kind, s) => (kind.startsWith('city') ? `${kind}|${s.text || ''}` : kind);
  const backOf = (s, i) => (Array.isArray(s.back) ? s.back[i] : i === 0 ? s.back : null);
  const keys = new Set();
  for (const s of list) {
    if (s.t === 'busstop') {
      const k = stopKeys(s);
      for (const x of [k.logo, ...k.cells, k.name]) keys.add(x);
      if (s.mark) { keys.add('zigzag'); keys.add('busmark'); }
      continue;
    }
    s.plates.forEach((p, i) => { keys.add(keyOf(p, s)); const b = backOf(s, i); if (b) keys.add(keyOf(b, s)); });
  }
  keys.add('vbdcase');
  const { tex, rects, width: atlasW, height: atlasH } = buildAtlas([...keys]);

  // Crosswalk lookup (32 m cells, each crosswalk in the cells around it)
  const crosswalks = crosswalksOf(network);
  const cells = new Map();
  for (const c of crosswalks) {
    const r = c.half + 4;
    for (let ix = Math.floor((c.x - r) / 32); ix <= Math.floor((c.x + r) / 32); ix++) for (let iz = Math.floor((c.z - r) / 32); iz <= Math.floor((c.z + r) / 32); iz++) {
      const k = ix * 65536 + iz;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(c);
    }
  }

  // Per post: its parts' (matrix, part) and its plates' (matrix, front rect, back rect)
  const posts = [];
  const plates = [];
  const parts = [];
  const colliders = [];
  const NONE = [-1, -1, -1, -1];
  const m = new THREE.Matrix4(), local = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const groundAt = (x, z) => surfaceHeight(x, z) + Math.max(SIDEWALK_TOP, sidewalkRise(x, z));
  const part = (matrix, kind) => parts.push({ matrix: matrix.toArray(), part: kind });
  const plate = (matrix, front, back = NONE) => plates.push({ matrix: matrix.toArray(), front: front || NONE, back: back || NONE });
  const boxCollider = (x, z, r, y, h) => colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, baseY: y, minY: y - 0.3, maxY: y + h });
  let moved = 0, marks = 0, benches = 0;

  // A sign post a vehicle drives into (controllers.js setKnockablePosts, which calls knockSet.fall) turns about its
  // foot in the direction of travel over FALL_MS, plates and clamps with it, and lies there for the session: its
  // parts' stored matrices are rewritten each frame while it falls and the packing below refreshed (dirty)
  const knockablePosts = [];
  const falling = [];
  const FALL_MS = 600, FALL_ANGLE = Math.PI / 2 * 0.97;
  const _fallM = new THREE.Matrix4(), _fallR = new THREE.Matrix4(), _fallT = new THREE.Matrix4(), _fallAxis = new THREE.Vector3();
  let dirty = false;
  const knockSet = {
    fall(knocked, dx, dz) {
      const post = posts[knocked.i];
      falling.push({
        post, ax: dz, az: -dx, t0: performance.now(),
        parts: parts.slice(post.parts[0], post.parts[1]).map((p) => p.matrix.slice()),
        plates: plates.slice(post.plates[0], post.plates[1]).map((p) => p.matrix.slice())
      });
    }
  };
  function animateFalling() {
    if (!falling.length) return;
    const now = performance.now();
    for (let k = falling.length - 1; k >= 0; k--) {
      const f = falling[k], post = f.post;
      const p = Math.min(1, (now - f.t0) / FALL_MS);
      // the turn about the foot, in world space: T(foot) R T(-foot)
      _fallR.makeRotationAxis(_fallAxis.set(f.ax, 0, f.az).normalize(), FALL_ANGLE * p * p); // (gaining speed as it goes)
      _fallM.makeTranslation(-post.x, -post.y, -post.z).premultiply(_fallR).premultiply(_fallT.makeTranslation(post.x, post.y, post.z));
      for (let j = 0; j < f.parts.length; j++) _fallT.fromArray(f.parts[j]).premultiply(_fallM).toArray(parts[post.parts[0] + j].matrix);
      for (let j = 0; j < f.plates.length; j++) _fallT.fromArray(f.plates[j]).premultiply(_fallM).toArray(plates[post.plates[0] + j].matrix);
      if (p >= 1) falling.splice(k, 1);
    }
    dirty = true;
  }

  for (const s of list) {
    // (the plates face along (sin yaw, cos yaw): the crosswalk test moves the post along the road, i.e. across that)
    const p = clearOfCrosswalks({ x: s.x, z: s.z }, crosswalks, cells);
    if (p.x !== s.x || p.z !== s.z) moved++;
    const y = groundAt(p.x, p.z);
    const firstPlate = plates.length, firstPart = parts.length;
    let height;
    if (s.t === 'busstop') {
      // The VBD stop: its local frame turned to face the road (+z), the plate beside the mast (+x, against the traffic)
      const yaw = s.yaw - Math.PI / 2;
      q.setFromAxisAngle(up, yaw);
      const A = new THREE.Matrix4().compose(pos.set(p.x, y, p.z), q, scl.set(1, 1, 1));
      const at = (lx, ly, lz, rz = 0, sx = 1, sy = 1, sz = 1) => m.multiplyMatrices(A, local.compose(pos.set(lx, ly, lz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rz), scl.set(sx, sy, sz)));
      const { top, bend: R, gap, w, h } = STOP, span = w + 2 * gap;
      part(at(0, -0.3, 0, 0, 1, top - R + 0.3, 1), PART.post);                    // the mast
      part(at(0, top - R, 0), PART.bend);                                          // over into the bow
      part(at(R, top, 0, -Math.PI / 2, 1, span - 2 * R, 1), PART.post);            // across
      part(at(span - R, top, 0, -Math.PI / 2), PART.bend);                         // and down
      const legBottom = top - gap - h - 0.02;
      part(at(span, top - R, 0, Math.PI, 1, top - R - legBottom, 1), PART.post);   // to the plate's foot
      part(at(0, STOP.caseBottom, 0.035), PART.case);
      // The plate, built from its pieces (coplanar, side by side: the back faces show the back's mirrored layout)
      const k = stopKeys(s), x0 = gap, yTop = top - gap;
      const logoH = h * STOP.logo, bandH = h * STOP.band, cellH = (h - logoH - bandH) / STOP.rows, cellW = w / 2;
      plate(at(x0 + w / 2, yTop - logoH / 2, 0, 0, w, logoH, 1), rects.get(k.logo), rects.get(k.logo));
      for (let r = 0; r < STOP.rows; r++) for (let c = 0; c < 2; c++) {
        const front = rects.get(k.cells[r * 2 + c]), back = rects.get(k.cells[r * 2 + 1 - c]);
        plate(at(x0 + cellW * (c + 0.5), yTop - logoH - cellH * (r + 0.5), 0, 0, cellW, cellH, 1), front, back);
      }
      plate(at(x0 + w / 2, yTop - h + bandH / 2, 0, 0, w, bandH, 1), rects.get(k.name), rects.get(k.name));
      plate(at(0, STOP.caseBottom + STOP.caseH / 2, 0.035 + STOP.caseDepth + 0.001, 0, STOP.caseW, STOP.caseH, 1), rects.get('vbdcase'));
      height = top + 0.3;
      // A bench behind the mast along the kerb, the bin beside it (local: -x is the traffic's way, -z away from the road)
      if (s.bench) {
        const bx = p.x + (A.elements[0] * -1.9 + A.elements[8] * -0.9), bz = p.z + (A.elements[2] * -1.9 + A.elements[10] * -0.9);
        const by = groundAt(bx, bz);
        m.compose(pos.set(bx, by, bz), q, scl.set(1, 1, 1));
        part(m, PART.bench);
        boxCollider(bx, bz, 0.6, by, 0.85);
        benches++;
      }
      if (s.bin) {
        const bx = p.x + (A.elements[0] * 0.9 + A.elements[8] * -0.5), bz = p.z + (A.elements[2] * 0.9 + A.elements[10] * -0.5);
        const by = groundAt(bx, bz);
        m.compose(pos.set(bx, by, bz), q, scl.set(1, 1, 1));
        part(m, PART.bin);
        boxCollider(bx, bz, 0.2, by, 0.9);
      }
      // The yellow zigzag along the kerb, "BUS" in the lane at its start (flat quads on the road, facing up)
      if (s.mark) {
        const [ax, az, bx, bz] = s.mark, len = Math.hypot(bx - ax, bz - az);
        const tx = (bx - ax) / len, tz = (bz - az) / len, rx = -tz, rz = tx;
        const n = Math.max(1, Math.round(len / MARK.piece)), L = len / n;
        const roadY = (x, z) => surfaceHeight(x, z) + MARK.lift;
        const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
          const x0 = ax + tx * L * i, z0 = az + tz * L * i, x1 = x0 + tx * L, z1 = z0 + tz * L;
          if (onCrosswalk((x0 + x1) / 2, (z0 + z1) / 2, crosswalks, cells)) continue;
          const y0 = roadY(x0, z0), y1 = roadY(x1, z1);
          X.set(x1 - x0, y1 - y0, z1 - z0); Y.set(-rx * MARK.width, 0, -rz * MARK.width); Z.crossVectors(X, Y).normalize();
          m.makeBasis(X, Y, Z).setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
          plate(m, rects.get('zigzag'));
        }
        // "BUS": 1.6 m into the lane from the zigzag, near its start, read by the bus coming up
        const sAlong = Math.min(len * 0.25, 3.5) + 1.2, off = -1.3;
        const cx = ax + tx * sAlong + rx * off, cz = az + tz * sAlong + rz * off;
        if (!onCrosswalk(cx, cz, crosswalks, cells)) {
          const yA = roadY(cx - tx * 1.1, cz - tz * 1.1), yB = roadY(cx + tx * 1.1, cz + tz * 1.1);
          X.set(rx * 0.8, 0, rz * 0.8); Y.set(tx * 2.2, yB - yA, tz * 2.2); Z.crossVectors(X, Y).normalize();
          m.makeBasis(X, Y, Z).setPosition(cx, (yA + yB) / 2, cz);
          plate(m, rects.get('busmark'));
        }
        marks++;
      }
    } else {
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      q.setFromAxisAngle(up, s.yaw);
      // Plates from the bottom up (listed top down), each on two clamps
      let top = y + PLATE_BOTTOM;
      for (let i = s.plates.length - 1; i >= 0; i--) {
        const kind = s.plates[i], [w, h] = SIZES[kind];
        pos.set(p.x + fx * (POST_RADIUS + 0.012), top + h / 2, p.z + fz * (POST_RADIUS + 0.012));
        m.compose(pos, q, scl.set(w, h, 1));
        const b = backOf(s, i);
        plate(m, rects.get(keyOf(kind, s)), b ? rects.get(keyOf(b, s)) : NONE);
        for (const cy of [top + h * 0.2, top + h * 0.8]) { m.compose(pos.set(p.x, cy, p.z), q, scl.set(1, 1, 1)); part(m, PART.clamp); }
        top += h + PLATE_GAP;
      }
      height = top - PLATE_GAP - y + 0.3; // (from 0.3 m below the surface)
      m.compose(pos.set(p.x, y - 0.3, p.z), q, scl.set(1, height, 1));
      part(m, PART.post);
    }
    posts.push({ x: p.x, y, z: p.z, yaw: s.yaw, kind: s.t, road: s.road, text: s.text, plates: [firstPlate, plates.length], parts: [firstPart, parts.length] });
    // The stop's mast stays solid (bench and bin too, above); a sign post goes down under a vehicle
    if (s.t === 'busstop') boxCollider(p.x, p.z, POST_RADIUS + 0.05, y, height - 0.3);
    else knockablePosts.push({ x: p.x, z: p.z, r: POST_RADIUS + 0.05, set: knockSet, i: posts.length - 1 });
  }

  // The metal and furniture (capacity: all of them; drawn: the ones near the camera)
  const hwGeometry = hardwareGeometry();
  const aPart = new THREE.InstancedBufferAttribute(new Float32Array(parts.length), 1);
  hwGeometry.setAttribute('aPart', aPart);
  const hwMaterial = new THREE.MeshStandardNodeMaterial();
  {
    const keep = attribute('aPartId', 'float').sub(attribute('aPart', 'float')).abs().lessThan(0.5);
    hwMaterial.positionNode = select(keep, positionLocal, vec3(0));
    hwMaterial.colorNode = attribute('color', 'vec3');
    const mr = attribute('aMat', 'vec2');
    hwMaterial.metalnessNode = mr.x;
    hwMaterial.roughnessNode = mr.y;
  }
  const hwMesh = new THREE.InstancedMesh(hwGeometry, hwMaterial, parts.length);
  hwMesh.name = 'Traffic sign posts and stop furniture';
  hwMesh.castShadow = true;
  hwMesh.receiveShadow = true;

  const plateGeometry = new THREE.PlaneGeometry(1, 1);
  const aFront = new THREE.InstancedBufferAttribute(new Float32Array(plates.length * 4), 4);
  const aBack = new THREE.InstancedBufferAttribute(new Float32Array(plates.length * 4), 4);
  plateGeometry.setAttribute('aFront', aFront);
  plateGeometry.setAttribute('aBack', aBack);
  const plateMaterial = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.42, metalness: 0 });
  {
    const front = attribute('aFront', 'vec4'), back = attribute('aBack', 'vec4');
    const hasBack = back.x.greaterThanEqual(0);
    // the back face mirrors u; a plain back samples the front's shape (for its outline) and is galvanised grey
    const rect = select(frontFacing, front, select(hasBack, back, front));
    const u = select(frontFacing, uv().x, uv().x.oneMinus());
    const t = texture(tex, vec2(mix(rect.x, rect.z, u), mix(rect.y, rect.w, uv().y)));
    const face = frontFacing.or(hasBack);
    plateMaterial.colorNode = select(face, t.rgb, vec3(0.36, 0.37, 0.38));
    plateMaterial.opacityNode = t.a;
    plateMaterial.alphaTest = 0.5;
    // Retroreflective sheeting: the faces stay readable at night
    if (night) plateMaterial.emissiveNode = select(face, t.rgb.mul(night).mul(float(0.12)), vec3(0));
  }
  const plateMesh = new THREE.InstancedMesh(plateGeometry, plateMaterial, plates.length);
  plateMesh.name = 'Traffic sign plates';
  // (the posts' shadows are enough: the plates casting too would add two draws per frame, one per shadow cascade)
  plateMesh.castShadow = false;
  plateMesh.receiveShadow = true;
  group.add(hwMesh, plateMesh);

  // Packs the posts within VIEW_DISTANCE (all of them before the first update: the shaders compile with every one in)
  function fill(test) {
    const hm = hwMesh.instanceMatrix.array, lm = plateMesh.instanceMatrix.array;
    let n = 0, j = 0, k = 0;
    for (const post of posts) {
      if (test && !test(post)) continue;
      n++;
      for (let i = post.parts[0]; i < post.parts[1]; i++) {
        hm.set(parts[i].matrix, j * 16);
        aPart.array[j] = parts[i].part;
        j++;
      }
      for (let i = post.plates[0]; i < post.plates[1]; i++) {
        const pl = plates[i];
        lm.set(pl.matrix, k * 16);
        aFront.array.set(pl.front, k * 4);
        aBack.array.set(pl.back, k * 4);
        k++;
      }
    }
    hwMesh.count = Math.max(1, j);
    plateMesh.count = Math.max(1, k);
    hwMesh.visible = plateMesh.visible = n > 0;
    hwMesh.instanceMatrix.needsUpdate = plateMesh.instanceMatrix.needsUpdate = true;
    aPart.needsUpdate = aFront.needsUpdate = aBack.needsUpdate = true;
    if (n) { hwMesh.computeBoundingSphere(); plateMesh.computeBoundingSphere(); }
    return n;
  }
  fill(null);

  let last = -1e9, lastX = Infinity, lastZ = Infinity, shown = posts.length;
  const R2 = VIEW_DISTANCE * VIEW_DISTANCE;
  function update(camera) {
    animateFalling();
    const now = performance.now();
    if (!dirty && (now - last < 250 || Math.hypot(camera.x - lastX, camera.z - lastZ) < 4)) return;
    dirty = false;
    last = now; lastX = camera.x; lastZ = camera.z;
    shown = fill((p) => {
      const dx = p.x - camera.x, dy = p.y - camera.y, dz = p.z - camera.z;
      return dx * dx + dy * dy + dz * dz < R2;
    });
  }

  const counts = {};
  for (const s of list) for (const p of s.plates) counts[p] = (counts[p] || 0) + 1;
  const stats = {
    posts: posts.length, plates: plates.length, parts: parts.length, tiles: keys.size, atlas: `${atlasW}x${atlasH}`,
    movedOffCrosswalks: moved, zigzags: marks, benches, counts, get shown() { return shown; }
  };
  group.userData.stats = stats;
  console.info(`[traffic-signs] ${posts.length} posts, ${plates.length} plates, ${parts.length} parts (${keys.size} graphics in a ${atlasW}x${atlasH} atlas), ${benches} benches, ${marks} zigzags, ${moved} moved off crosswalks`);
  return { group, update, colliders, knockablePosts, stats, posts };
}
