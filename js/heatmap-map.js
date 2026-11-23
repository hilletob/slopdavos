import { DAVOS_DATA } from './davos-geodata.js';
import { STREAMS } from './streams-data.js';
import { NAMES } from './names-data.js';
import { WORLD_BOUNDS } from './davos-frame.js';

// js/heatmap-map.js
// The map under the public heat map (heatmap.html, js/heatmap-page.js): Davos drawn from the game's own data (woods,
// water, roads and paths, the railways, the houses, swisstopo's names) with the canvas, in the world frame of
// js/davos-frame.js (1 unit = 1 m, x east, z south, north up). No part of the game is loaded for it: the game's map
// (js/town-map.js) hangs on the game's page and on the houses the 3D world builds.

export const PALETTE = {
  ground: '#12161b',
  wood: '#16241b',
  green: '#1a2c20',
  water: '#16324a',
  stream: '#1d4566',
  path: '#3a424d',
  road: '#56606e',
  main: '#7b8796',
  rail: '#a88963',
  building: '#333c48',
  label: '#c9d2dc',
  peak: '#e6d9b8',
  waterLabel: '#6fa9d6',
  halo: 'rgba(10, 13, 17, 0.85)'
};
const FONT = "'Signika', system-ui, -apple-system, 'Segoe UI', sans-serif";
export const MIN_ZOOM = 0.03, MAX_ZOOM = 4; // px per metre

const line = (path, pts) => {
  if (!pts || pts.length < 4) return;
  path.moveTo(pts[0], pts[1]);
  for (let i = 2; i + 1 < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
};
const ring = (path, pts) => {
  if (!pts || pts.length < 6) return;
  line(path, pts);
  path.closePath();
};
const area = (path, item) => {
  ring(path, item.ring);
  for (const hole of item.holes || []) ring(path, hole);
};

let LAYERS = null;
/** The layers as paths in world metres, built once */
function layers() {
  if (LAYERS) return LAYERS;
  const L = { wood: new Path2D(), green: new Path2D(), water: new Path2D(), streams: new Path2D(), rivers: new Path2D(),
    paths: new Path2D(), roads: new Path2D(), mains: new Path2D(), rails: new Path2D(), buildings: new Path2D() };
  for (const p of DAVOS_DATA.parks) area(p.kind === 'wood' ? L.wood : L.green, p);
  for (const w of DAVOS_DATA.water) area(L.water, w);
  for (const s of STREAMS.streams) line(s.kind === 'river' ? L.rivers : L.streams, s.pts);
  for (const r of DAVOS_DATA.roads) {
    if (r.tunnel) continue;
    const kind = r.kind;
    line(kind === 'primary' || kind === 'secondary' || kind === 'tertiary' ? L.mains
      : kind === 'path' || kind === 'track' || kind === 'footway' || kind === 'steps' || kind === 'cycleway' ? L.paths : L.roads, r.pts);
  }
  for (const r of DAVOS_DATA.railways) if (!r.tunnel) line(L.rails, r.pts);
  for (const b of DAVOS_DATA.buildings) area(L.buildings, b);
  return (LAYERS = L);
}

/** The view: the centre in world metres and `s` px a metre, on a canvas of w x h CSS px */
export function createView() {
  const v = { cx: 0, cz: 0, s: 0.1, w: 1, h: 1, dpr: 1 };
  const clamp = () => {
    v.s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.s));
    v.cx = Math.min(WORLD_BOUNDS[2], Math.max(WORLD_BOUNDS[0], v.cx));
    v.cz = Math.min(WORLD_BOUNDS[3], Math.max(WORLD_BOUNDS[1], v.cz));
  };
  return Object.assign(v, {
    /** The box [minX, minZ, maxX, maxZ] fills the canvas */
    fit([x0, z0, x1, z1]) {
      v.cx = (x0 + x1) / 2;
      v.cz = (z0 + z1) / 2;
      v.s = Math.min(v.w / (x1 - x0), v.h / (z1 - z0));
      clamp();
    },
    pan(dx, dy) { v.cx -= dx / v.s; v.cz -= dy / v.s; clamp(); },
    /** Zoom by `factor`, the world point under (px, py) staying where it is */
    zoom(factor, px = v.w / 2, py = v.h / 2) {
      const wx = v.cx + (px - v.w / 2) / v.s, wz = v.cz + (py - v.h / 2) / v.s;
      v.s *= factor;
      clamp();
      v.cx = wx - (px - v.w / 2) / v.s;
      v.cz = wz - (py - v.h / 2) / v.s;
      clamp();
    },
    toX: (x) => (x - v.cx) * v.s + v.w / 2,
    toY: (z) => (z - v.cz) * v.s + v.h / 2,
    /** The canvas transform for world metres */
    world(ctx) { ctx.setTransform(v.s * v.dpr, 0, 0, v.s * v.dpr, v.dpr * (v.w / 2 - v.cx * v.s), v.dpr * (v.h / 2 - v.cz * v.s)); },
    /** The canvas transform for CSS px */
    screen(ctx) { ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0); }
  });
}

/** The ground: everything under the heat */
export function drawGround(ctx, v) {
  const L = layers(), s = v.s;
  v.screen(ctx);
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, 0, v.w, v.h);
  v.world(ctx);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // (a width in metres, never thinner than `px` on the screen)
  const stroke = (path, colour, metres, px) => { ctx.strokeStyle = colour; ctx.lineWidth = Math.max(metres, px / s); ctx.stroke(path); };
  ctx.fillStyle = PALETTE.wood;
  ctx.fill(L.wood, 'evenodd');
  ctx.fillStyle = PALETTE.green;
  ctx.fill(L.green, 'evenodd');
  if (s > 0.06) stroke(L.streams, PALETTE.stream, 2, 0.6);
  stroke(L.rivers, PALETTE.stream, 6, 1.2);
  ctx.fillStyle = PALETTE.water;
  ctx.fill(L.water, 'evenodd');
  if (s > 0.05) stroke(L.paths, PALETTE.path, 1.6, 0.5);
  stroke(L.roads, PALETTE.road, 4.5, s > 0.08 ? 0.8 : 0.4);
  stroke(L.mains, PALETTE.main, 7, 1.3);
  if (s > 0.12) {
    ctx.fillStyle = PALETTE.building;
    ctx.fill(L.buildings, 'evenodd');
  }
  ctx.setLineDash([10 / s, 6 / s]);
  stroke(L.rails, PALETTE.rail, 2, 1.2);
  ctx.setLineDash([]);
}

// The names by kind: which rank shows from which zoom on, and how
const NAME_ZOOM = [0, 0.07, 0.2, 0.8]; // (rank 0 always … rank 3 only close up)
const KIND = Object.fromEntries(NAMES.kinds.map((k, i) => [i, k]));
const WATER = new Set(['lake', 'stream', 'glacier']);
const PLACES = [
  ['Davos Platz', -650, 320], ['Davos Dorf', 1000, -1800], ['Frauenkirch', -2376, 3351], ['Wolfgang', 1909, -3788]
];

const PLACE_NAMES = new Set(PLACES.map(([name]) => name));

/** The names and the stations, over the heat. Labels that would overlap an earlier one are left out. */
export function drawLabels(ctx, v, lang = 'de') {
  v.screen(ctx);
  const taken = [];
  const free = (x, y, w, h) => {
    if (x + w < 0 || y + h < 0 || x > v.w || y > v.h) return false;
    for (const b of taken) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false;
    taken.push([x, y, w, h]);
    return true;
  };
  const text = (label, x, y, { size = 12, colour = PALETTE.label, weight = 500, italic = false, mark = null } = {}) => {
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
    const w = ctx.measureText(label).width;
    if (!free(x - w / 2 - 3, y - size / 2 - 2, w + 6, size + 4)) return;
    if (mark === 'peak') {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(x, y - size / 2 - 9); ctx.lineTo(x + 4, y - size / 2 - 2); ctx.lineTo(x - 4, y - size / 2 - 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = PALETTE.halo;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(label, x, y);
    ctx.fillStyle = colour;
    ctx.fillText(label, x, y);
  };
  ctx.lineJoin = 'round';
  for (const [name, x, z] of PLACES) text(name, v.toX(x), v.toY(z), { size: 15, weight: 600, colour: '#ffffff' });
  if (v.s > 0.25) {
    for (const st of DAVOS_DATA.stations) {
      const x = v.toX(st.x), y = v.toY(st.z);
      ctx.fillStyle = PALETTE.rail;
      ctx.fillRect(x - 3, y - 3, 6, 6);
      text(st.name, x, y + 13, { size: 11, colour: PALETTE.rail });
    }
  }
  for (const [name, x, z, height, kind, rank] of NAMES.names) {
    if (v.s < NAME_ZOOM[rank] || PLACE_NAMES.has(name)) continue;
    const k = KIND[kind];
    const peak = k === 'peak';
    text(peak && v.s > 0.05 ? `${name} ${height.toLocaleString(lang === 'de' ? 'de-CH' : 'en-GB')}` : name, v.toX(x), v.toY(z), {
      size: rank === 0 ? 12 : 11,
      colour: peak || k === 'pass' ? PALETTE.peak : WATER.has(k) ? PALETTE.waterLabel : PALETTE.label,
      italic: WATER.has(k) || k === 'valley',
      weight: rank === 0 ? 600 : 400,
      mark: peak ? 'peak' : null
    });
  }
}

/** A scale bar's length: { metres, px, label } for about `target` px */
export function scaleBar(v, target = 110) {
  const raw = target / v.s;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const metres = [5, 2, 1].map((m) => m * pow).find((m) => m <= raw) || pow;
  return { metres, px: metres * v.s, label: metres >= 1000 ? `${metres / 1000} km` : `${metres} m` };
}
