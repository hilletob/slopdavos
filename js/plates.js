import * as THREE from 'three/webgpu';
import { QUALITY } from './quality.js';

// Licence plates for the cars around Davos: one generated atlas (canvas) of PLATE_COUNT plates, each as a rear plate
// (Swiss long format 500 × 110 mm: the Swiss shield, the canton's code and number, the canton's shield) and a front
// plate (300 × 80 mm, code and number only). Three quarters are from Graubünden (GR), the rest from other cantons and
// a few German, Italian and Dutch visitors. The shields are drawn simplified, from their heraldry.
//
// Atlas layout (1024 × 1024 px, top-down): rear plates in cells of 256 × 56 px (4 columns × 8 rows, from y = 0), front
// plates in cells of 256 × 68 px (4 × 8, from y = 448); plate i sits in column i % 4, row ⌊i / 4⌋ of both.

export const PLATE_COUNT = 32;
export const PLATE_ATLAS = { size: 1024, cols: 4, cellW: 256, rearH: 56, frontH: 68, frontY: 448 };

// Rear plate i spans u ∈ [col, col + 1] / 4 and the rows' pixels; uv (0..1 across, 0..1 up the plate) -> atlas uv
// (flipY: the canvas's top row is v = 1). Exported for the shaders (actor-models.js) as plain numbers.
export const PLATE_V = {
  rear: { top: 0, h: PLATE_ATLAS.rearH / PLATE_ATLAS.size },
  front: { top: PLATE_ATLAS.frontY / PLATE_ATLAS.size, h: PLATE_ATLAS.frontH / PLATE_ATLAS.size }
};

const OTHER_CANTONS = ['ZH', 'SG', 'BE', 'AG', 'TI', 'LU', 'SZ', 'TG'];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 1) >>> 0) / 4294967296;
}

// The plates: 24 GR (variant 0, GR 107922: the player's VW T3), 5 other cantons, 3 visitors
export function plateList() {
  const rand = rng(7270);
  const digits = (n) => String(Math.floor(10 ** (n - 1) + rand() * 9 * 10 ** (n - 1)));
  const letters = (n) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPRSTUVWXYZ'[Math.floor(rand() * 23)]).join('');
  const list = [];
  for (let i = 0; i < PLATE_COUNT; i++) {
    if (i < 24) list.push({ kind: 'ch', canton: 'GR', number: digits(rand() < 0.15 ? 3 + Math.floor(rand() * 2) : 5 + Math.floor(rand() * 2)) });
    else if (i < 29) list.push({ kind: 'ch', canton: OTHER_CANTONS[(i * 3) % OTHER_CANTONS.length], number: digits(4 + Math.floor(rand() * 3)) });
    else if (i === 29) list.push({ kind: 'd', text: `${['M', 'S', 'FN', 'LI'][Math.floor(rand() * 4)]} ${letters(2)} ${digits(3 + Math.floor(rand() * 2))}` });
    else if (i === 30) list.push({ kind: 'i', text: `${letters(2)} ${digits(3)}${letters(2)}` });
    else list.push({ kind: 'nl', text: `${digits(2)}-${letters(3)}-${Math.floor(rand() * 10)}` });
  }
  // Shuffle so the visitors don't cluster on one paint colour band, keeping plate 0 from GR
  for (let i = PLATE_COUNT - 1; i > 1; i--) {
    const j = 1 + Math.floor(rand() * i);
    [list[i], list[j]] = [list[j], list[i]];
  }
  list[0] = { kind: 'ch', canton: 'GR', number: '107922' }; // the player's VW T3
  return list;
}

// --- Heraldry ------------------------------------------------------------------------------------------------------------
// A Swiss shield outline (flat top, sides curving into a point) in the box (x, y, w, h)
function shieldPath(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h * 0.55);
  ctx.quadraticCurveTo(x + w, y + h * 0.9, x + w / 2, y + h);
  ctx.quadraticCurveTo(x, y + h * 0.9, x, y + h * 0.55);
  ctx.closePath();
}

function cross(ctx, cx, cy, s, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(cx - s * 0.5, cy - s * 0.16, s, s * 0.32);
  ctx.fillRect(cx - s * 0.16, cy - s * 0.5, s * 0.32, s);
}

// Draws the shield `code` ('CH' or a canton) clipped to its outline
function shield(ctx, code, x, y, w, h) {
  ctx.save();
  shieldPath(ctx, x, y, w, h);
  ctx.clip();
  const band = (c, x0, y0, x1, y1) => { ctx.fillStyle = c; ctx.fillRect(x + x0 * w, y + y0 * h, (x1 - x0) * w, (y1 - y0) * h); };
  const diag = (c1, c2, up = true) => {
    band(c1, 0, 0, 1, 1);
    ctx.fillStyle = c2; ctx.beginPath();
    if (up) { ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); } else { ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
    ctx.closePath(); ctx.fill();
  };
  switch (code) {
    case 'CH': band('#d52b1e', 0, 0, 1, 1); cross(ctx, x + w / 2, y + h * 0.45, w * 0.62, '#fff'); break;
    case 'GR': {
      // Upper left: the Grey League (split silver and black); upper right: the League of God's House (a black ibex on
      // silver); below: the League of the Ten Jurisdictions (a cross quartered gold and blue)
      band('#fff', 0, 0, 0.25, 0.48); band('#111', 0.25, 0, 0.5, 0.48);
      band('#fff', 0.5, 0, 1, 0.48);
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.ellipse(x + w * 0.74, y + h * 0.3, w * 0.13, h * 0.08, 0, 0, Math.PI * 2); ctx.fill(); // body
      ctx.fillRect(x + w * 0.64, y + h * 0.3, w * 0.03, h * 0.14); ctx.fillRect(x + w * 0.82, y + h * 0.3, w * 0.03, h * 0.14); // legs
      ctx.beginPath(); ctx.ellipse(x + w * 0.62, y + h * 0.18, w * 0.05, h * 0.05, 0, 0, Math.PI * 2); ctx.fill(); // head
      ctx.lineWidth = Math.max(1, w * 0.04); ctx.strokeStyle = '#111';
      ctx.beginPath(); ctx.arc(x + w * 0.68, y + h * 0.12, w * 0.09, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); // horn
      band('#1f4fa0', 0, 0.48, 0.5, 0.74); band('#f2c200', 0.5, 0.48, 1, 0.74);
      band('#f2c200', 0, 0.74, 0.5, 1); band('#1f4fa0', 0.5, 0.74, 1, 1);
      band('#f2c200', 0.43, 0.48, 0.5, 0.74); band('#1f4fa0', 0.5, 0.48, 0.57, 0.74);
      band('#1f4fa0', 0.43, 0.74, 0.5, 1); band('#f2c200', 0.5, 0.74, 0.57, 1);
      band('#1f4fa0', 0, 0.705, 0.5, 0.775); band('#f2c200', 0.5, 0.705, 1, 0.775);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y + h * 0.48); ctx.lineTo(x + w, y + h * 0.48); ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + w * 0.5, y + h * 0.48); ctx.stroke();
      break;
    }
    case 'ZH': diag('#fff', '#1f5fb4'); break;
    case 'BE': diag('#d52b1e', '#f2c200', false); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + h * 0.5, w * 0.18, h * 0.12, -0.6, 0, Math.PI * 2); ctx.fill(); break;
    case 'SG': band('#1f8a3b', 0, 0, 1, 1); band('#fff', 0.42, 0.15, 0.58, 0.85); break;
    case 'AG': band('#111', 0, 0, 0.5, 1); band('#3a7cc8', 0.5, 0, 1, 1); band('#fff', 0, 0.35, 0.5, 0.42); band('#fff', 0, 0.55, 0.5, 0.62); break;
    case 'TI': band('#d52b1e', 0, 0, 0.5, 1); band('#1f5fb4', 0.5, 0, 1, 1); break;
    case 'LU': band('#1f5fb4', 0, 0, 0.5, 1); band('#fff', 0.5, 0, 1, 1); break;
    case 'SZ': band('#d52b1e', 0, 0, 1, 1); cross(ctx, x + w * 0.3, y + h * 0.22, w * 0.3, '#fff'); break;
    case 'TG': diag('#fff', '#1f8a3b', false); break;
    default: band('#888', 0, 0, 1, 1);
  }
  ctx.restore();
}

// --- Plates --------------------------------------------------------------------------------------------------------------
// Text in a condensed bold face, squeezed to fit `maxW`
function plateText(ctx, text, cx, cy, h, maxW, colour = '#111') {
  ctx.save();
  ctx.font = `bold ${Math.round(h)}px "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = colour;
  const w = ctx.measureText(text).width;
  ctx.translate(cx, cy);
  if (w > maxW) ctx.scale(maxW / w, 1);
  ctx.fillText(text, 0, h * 0.04);
  ctx.restore();
}

// The plate: white, a thin dark rounded rim with a light bezel inside it (as on the aluminium Swiss plates)
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function blank(ctx, x, y, w, h, fill = '#f7f7f4') {
  ctx.fillStyle = '#f7f7f4';
  ctx.fillRect(x, y, w, h); // (the atlas cell behind the rounded corners)
  const r = h * 0.09;
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, r);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = Math.max(1.2, h * 0.035); ctx.strokeStyle = '#2a2a2a'; ctx.stroke();
  roundRect(ctx, x + 1 + h * 0.05, y + 1 + h * 0.05, w - 2 - h * 0.1, h - 2 - h * 0.1, r * 0.7);
  ctx.lineWidth = Math.max(0.6, h * 0.012); ctx.strokeStyle = '#c9c9c4'; ctx.stroke();
}

// Swiss plate lettering: tall, narrow, DIN-like characters with wide spacing, the canton code and the number
// separated by a centred dot ("BE · 56789"); character height ~70% of the plate. Drawn character by character, the
// whole line squeezed horizontally if it would not fit `maxW`.
const PLATE_FONT = (px) => `${px}px "DIN Condensed", "DIN Alternate", "Arial Narrow", "Roboto Condensed", sans-serif`;
function swissPlateText(ctx, canton, number, cx, cy, h, maxW) {
  ctx.save();
  const px = Math.round(h * 0.98);
  ctx.font = PLATE_FONT(px);
  ctx.fillStyle = '#111'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const gap = h * 0.14, dotW = h * 0.42;
  const chars = [...canton, '·', ...number];
  const widths = chars.map((c) => (c === '·' ? dotW : ctx.measureText(c).width));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  const squeeze = Math.min(1, maxW / total);
  ctx.translate(cx - (total * squeeze) / 2, cy);
  ctx.scale(squeeze, 1);
  let x = 0;
  chars.forEach((c, i) => {
    if (c === '·') { ctx.beginPath(); ctx.arc(x + dotW / 2, 0, h * 0.065, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillText(c, x, h * 0.06);
    x += widths[i] + gap;
  });
  ctx.restore();
}

// The EU band of a German, Italian or Dutch plate: blue, a ring of stars, the country code
function euBand(ctx, x, y, w, h, code) {
  ctx.fillStyle = '#003399';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#ffcc00';
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(x + w / 2 + Math.cos(a) * w * 0.28, y + h * 0.3 + Math.sin(a) * w * 0.28, Math.max(0.8, w * 0.05), 0, Math.PI * 2); ctx.fill();
  }
  plateText(ctx, code, x + w / 2, y + h * 0.75, h * 0.32, w * 0.9, '#fff');
}

function drawPlate(ctx, plate, x, y, w, h, rear) {
  if (plate.kind === 'ch') {
    blank(ctx, x, y, w, h);
    if (rear) {
      // Shields at both ends, a little lower than the plate's middle: the Swiss one left, the canton's right
      const sh = h * 0.6, sw = sh * 0.84, pad = h * 0.2;
      shield(ctx, 'CH', x + pad, y + (h - sh) / 2 + h * 0.02, sw, sh);
      shield(ctx, plate.canton, x + w - pad - sw, y + (h - sh) / 2 + h * 0.02, sw, sh);
      swissPlateText(ctx, plate.canton, plate.number, x + w / 2, y + h / 2, h * 0.7, w - 2 * (pad + sw) - h * 0.35);
    } else {
      swissPlateText(ctx, plate.canton, plate.number, x + w / 2, y + h / 2, h * 0.7, w - h * 0.35);
    }
    return;
  }
  const yellow = plate.kind === 'nl';
  blank(ctx, x, y, w, h, yellow ? '#f4c000' : '#f7f7f4');
  const bw = h * 0.42;
  euBand(ctx, x + 1.5, y + 1.5, bw, h - 3, { d: 'D', i: 'I', nl: 'NL' }[plate.kind]);
  if (plate.kind === 'i') { ctx.fillStyle = '#003399'; ctx.fillRect(x + w - 1.5 - bw, y + 1.5, bw, h - 3); }
  const right = plate.kind === 'i' ? bw : 0;
  plateText(ctx, plate.text, x + bw + (w - bw - right) / 2, y + h / 2, h * 0.72, w - bw - right - h * 0.3);
}

let atlas = null;
// The atlas texture (shared, with mipmaps); null outside a browser
export function plateAtlasTexture() {
  if (atlas || typeof document === 'undefined') return atlas;
  const { size, cols, cellW, rearH, frontH, frontY } = PLATE_ATLAS;
  // (drawn in `size` px whatever the canvas' size: half as large on the mobile profile, js/quality.js)
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(size * QUALITY.atlasScale);
  const ctx = canvas.getContext('2d');
  ctx.scale(QUALITY.atlasScale, QUALITY.atlasScale);
  ctx.fillStyle = '#f7f7f4';
  ctx.fillRect(0, 0, size, size);
  plateList().forEach((plate, i) => {
    const cx = (i % cols) * cellW, row = Math.floor(i / cols);
    drawPlate(ctx, plate, cx, row * rearH, cellW, rearH, true);
    drawPlate(ctx, plate, cx, frontY + row * frontH, cellW, frontH, false);
  });
  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  return atlas;
}
